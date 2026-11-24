/**
 * GET/PATCH /api/certificate-defaults (KZ-B)
 *
 * Tetapan lalai sijil pemanggil (satu baris qm_certificate_defaults).
 * GET: bentuk awam (has_signature dan sebagainya, tanpa laluan storan).
 * PATCH: kemas kini separa; hanya medan yang diberi diubah.
 *   signer_name, signer_title: rentetan, atau null untuk membuang.
 *   layout: objek layout sijil (dinormalkan), atau null untuk membuang.
 *   email_template: {subject, body, from_name, reply_to}, atau null.
 *   clear_background / clear_logo / clear_signature: true.
 *   copy_assets_from: {class_id, template_id, kinds?: [...]} salin aset
 *     templat kelas (pemanggil mesti pendidik kelas itu) ke tetapan lalai.
 *
 * Tulisan melalui klien Bearer (RLS milik sendiri). Service role hanya
 * untuk menyalin objek storan selepas kebenaran disahkan.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireUser, getServiceSupabase } from '@/lib/supabase-route';
import { semakPendidikKelas } from '@/lib/peer-server';
import { dalamHad } from '@/lib/hadKadar';
import { ralatJson } from '@/lib/i18n/ralatApi';
import { normaliseSusunAtur } from '@/lib/sijil/susunAtur';
import { bacaTemplatKelas } from '@/lib/sijil/keluarkan';
import { tandatanganImej } from '@/lib/sijil/aset';
import { laluanAset, padamJikaTidakDipakai, type JenisAset } from '@/lib/sijil/asetMasuk';
import {
  bacaTetapanLalai,
  bentukAwam,
  normaliseTemplatEmel,
  semakPendidikAktif,
} from '@/lib/sijil/tetapanLalai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const LAJUR: Record<JenisAset, 'background_path' | 'logo_path' | 'signature_path'> = {
  background: 'background_path',
  logo: 'logo_path',
  signature: 'signature_path',
};

export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;
  if (!(await semakPendidikAktif(auth.supa, auth.user!.id))) return ralatJson('Forbidden', 403);
  return NextResponse.json({ defaults: bentukAwam(await bacaTetapanLalai(auth.supa, auth.user!.id)) });
}

function teksPilihan(v: unknown, had: number, nama: string): { nilai?: string | null; ralat?: string } {
  if (v === null) return { nilai: null };
  if (typeof v !== 'string') return { ralat: `${nama} mesti rentetan atau null.` };
  const t = v.trim().replace(/\s+/g, ' ');
  if (!t) return { nilai: null };
  if (t.length > had) return { ralat: `${nama} melebihi ${had} aksara.` };
  return { nilai: t };
}

export async function PATCH(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;
  const userId = auth.user!.id;
  if (!(await semakPendidikAktif(auth.supa, userId))) return ralatJson('Forbidden', 403);
  if (!dalamHad(`cert-defaults:${userId}`, 20)) {
    return ralatJson('Too many requests. Please wait a minute and try again.', 429, { retry_after_seconds: 60 });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const kemas: Record<string, unknown> = {};

  if (body.signer_name !== undefined) {
    const r = teksPilihan(body.signer_name, 100, 'signer_name');
    if (r.ralat) return ralatJson(r.ralat, 400);
    kemas.signer_name = r.nilai;
  }
  if (body.signer_title !== undefined) {
    const r = teksPilihan(body.signer_title, 120, 'signer_title');
    if (r.ralat) return ralatJson(r.ralat, 400);
    kemas.signer_title = r.nilai;
  }
  if (body.layout !== undefined) {
    if (body.layout !== null && (typeof body.layout !== 'object' || Array.isArray(body.layout))) {
      return ralatJson('layout mesti objek atau null.', 400);
    }
    kemas.layout = body.layout === null ? {} : normaliseSusunAtur(body.layout);
  }
  if (body.email_template !== undefined) {
    const r = normaliseTemplatEmel(body.email_template);
    if (r.ralat) return ralatJson(r.ralat, 400);
    kemas.email_template = r.nilai;
  }

  const lama = await bacaTetapanLalai(auth.supa, userId);
  const untukDipadam: string[] = [];
  for (const k of Object.keys(LAJUR) as JenisAset[]) {
    if (body[`clear_${k}`] === true) {
      kemas[LAJUR[k]] = null;
      const p = lama?.[LAJUR[k]];
      if (p) untukDipadam.push(p);
    }
  }

  // Salin aset templat kelas ke ruang nama defaults/<pemanggil>/.
  const disalin: JenisAset[] = [];
  const svc = getServiceSupabase();
  if (body.copy_assets_from !== undefined) {
    const src = (body.copy_assets_from ?? {}) as Record<string, unknown>;
    const classId = typeof src.class_id === 'string' ? src.class_id : '';
    const templateId = typeof src.template_id === 'string' ? src.template_id : '';
    if (!classId || !templateId) return ralatJson('copy_assets_from memerlukan class_id dan template_id.', 400);
    const { data: kelas } = await auth.supa.from('qm_classes').select('owner_id').eq('id', classId).maybeSingle();
    const bolehBaca = kelas && (kelas.owner_id === userId || (await semakPendidikKelas(auth.supa, classId, userId)));
    if (!bolehBaca) return ralatJson('Forbidden', 403);
    const template = await bacaTemplatKelas(auth.supa, templateId, classId);
    if (!template) return ralatJson('Certificate template not found.', 404);
    const jenis = Array.isArray(src.kinds)
      ? (src.kinds as unknown[]).filter((k): k is JenisAset => k === 'background' || k === 'logo' || k === 'signature')
      : (['background', 'logo', 'signature'] as JenisAset[]);
    for (const k of jenis) {
      const sumber = template[LAJUR[k]];
      if (!sumber) continue;
      const { data: fail, error: dlErr } = await svc.storage.from('certificate-assets').download(sumber);
      if (dlErr || !fail) return ralatJson(`Aset ${k} templat tidak dapat dibaca.`, 500);
      const bait = new Uint8Array(await fail.arrayBuffer());
      if (!tandatanganImej(bait)) return ralatJson(`Aset ${k} templat bukan PNG atau JPEG.`, 400);
      const mime = bait[0] === 0x89 ? 'image/png' : 'image/jpeg';
      const sasaran = laluanAset(`defaults/${userId}/`, k, mime);
      const { error: upErr } = await svc.storage
        .from('certificate-assets')
        .upload(sasaran, bait, { contentType: mime, upsert: false });
      if (upErr) return ralatJson(upErr.message, 500);
      kemas[LAJUR[k]] = sasaran;
      const p = lama?.[LAJUR[k]];
      if (p) untukDipadam.push(p);
      disalin.push(k);
    }
  }

  if (Object.keys(kemas).length === 0) return ralatJson('Tiada medan untuk dikemas kini.', 400);
  kemas.updated_at = new Date().toISOString();

  const { error } = await auth.supa
    .from('qm_certificate_defaults')
    .upsert({ educator_id: userId, ...kemas }, { onConflict: 'educator_id' });
  if (error) return ralatJson(error.message, 400);

  for (const p of untukDipadam) await padamJikaTidakDipakai(svc, p);

  return NextResponse.json({
    defaults: bentukAwam(await bacaTetapanLalai(auth.supa, userId)),
    updated_fields: Object.keys(kemas).filter((k) => k !== 'updated_at'),
    ...(disalin.length ? { copied_assets: disalin } : {}),
  });
}
