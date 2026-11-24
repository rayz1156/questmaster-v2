/**
 * POST /api/classes/[id]/members/certificate-names (KZ-A)
 *
 * Pendidik menukar nama sijil peserta, seorang atau pukal.
 * Badan:
 *   updates: [{ participant_id? , email?, full_name }]  (1 hingga 200)
 *   scope: "certificate" (kelas ini sahaja, lalai) | "profile" (nama profil)
 *   regenerate_issued: boolean, lalai true
 *   confirm: boolean. Tanpa true: pratonton nama lama berbanding baharu.
 *
 * Padanan e-mel tidak mengira huruf besar atau kecil dan hanya terhadap
 * ahli kelas ini. Tulisan melalui RPC qm_set_member_certificate_name dengan
 * klien Bearer pemanggil, jadi fungsi SQL menyemak semula pendidik kelas dan
 * menulis log audit nama lama. Service role hanya untuk bacaan nama dan
 * penjanaan PDF selepas kebenaran disahkan.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireUser, getServiceSupabase } from '@/lib/supabase-route';
import { dalamHad } from '@/lib/hadKadar';
import { ralatJson } from '@/lib/i18n/ralatApi';
import { amaranNama, janaSemulaIkutTemplat } from '@/lib/sijil/namaSijil';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const MAX_KEMAS_KINI = 200;

type Permintaan = { participant_id?: string; email?: string; full_name: string };

function normalNama(s: string): string {
  return s.trim().replace(/\s+/g, ' ');
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;
  const { supa, user } = auth;
  const classId = params.id;

  const { data: klass } = await supa
    .from('qm_classes')
    .select('id')
    .eq('id', classId)
    .maybeSingle();
  if (!klass) return ralatJson('Not found', 404);
  // Semakan bebas KZ-A: satu semakan yang sama dengan RPC tulis
  // (qm_certificate_is_educator: pemilik atau pendidik diterima), ditambah
  // akaun tidak digantung, supaya dry run dan confirm konsisten.
  const { data: prof } = await supa.from('qm_profiles').select('suspended').eq('id', user!.id).maybeSingle();
  const { data: pendidik } = await supa.rpc('qm_certificate_is_educator', { p_class: classId });
  if (!prof || prof.suspended || pendidik !== true) return ralatJson('Forbidden', 403);

  if (!dalamHad(`cert-names:${user!.id}`, 20)) {
    return ralatJson('Too many requests. Please wait a minute and try again.', 429, { retry_after_seconds: 60 });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const scope = body.scope === 'profile' ? 'profile' : body.scope === undefined || body.scope === 'certificate' ? 'certificate' : null;
  if (!scope) return ralatJson('scope must be certificate or profile.', 400);
  const confirm = body.confirm === true;
  const janaSemula = body.regenerate_issued !== false;

  const mentah = Array.isArray(body.updates) ? (body.updates as unknown[]) : [];
  if (mentah.length === 0) return ralatJson('updates is required.', 400);
  if (mentah.length > MAX_KEMAS_KINI) return ralatJson('Too many names in one request.', 400);

  const senarai: Permintaan[] = [];
  for (const u of mentah) {
    const r = (u ?? {}) as Record<string, unknown>;
    const nama = typeof r.full_name === 'string' ? normalNama(r.full_name) : '';
    if (nama.length < 2 || nama.length > 120) {
      return ralatJson('Each full_name must be between 2 and 120 characters.', 400);
    }
    const pid = typeof r.participant_id === 'string' ? r.participant_id.trim() : '';
    const emel = typeof r.email === 'string' ? r.email.trim().toLowerCase() : '';
    if (!pid && !emel) return ralatJson('Each update needs participant_id or email.', 400);
    senarai.push({ participant_id: pid || undefined, email: emel || undefined, full_name: nama });
  }

  // Ahli kelas dan e-mel melalui klien Bearer (RLS dan RPC direktori 0045).
  const { data: members, error: mErr } = await supa
    .from('qm_class_members')
    .select('user_id')
    .eq('class_id', classId);
  if (mErr) return ralatJson(mErr.message, 500);
  const ids = (members ?? []).map((m: { user_id: string }) => m.user_id);
  const ahli = new Set(ids);
  const ikutEmel = new Map<string, string>();
  if (ids.length > 0) {
    const { data: dir, error: dErr } = await supa.rpc('qm_user_directory', { p_ids: ids });
    if (dErr) return ralatJson(dErr.message, 500);
    for (const d of dir ?? []) {
      if (d.email) ikutEmel.set(String(d.email).trim().toLowerCase(), String(d.user_id));
    }
  }

  // Nama semasa berkesan (nama kelas, nama sijil profil, nama paparan).
  const svc = getServiceSupabase();
  const namaSemasa = new Map<string, string | null>();
  if (ids.length > 0) {
    const { data: prof } = await svc
      .from('qm_profiles')
      .select('id, certificate_name, display_name')
      .in('id', ids);
    const { data: kn } = await svc
      .from('qm_class_certificate_names')
      .select('user_id, certificate_name')
      .eq('class_id', classId);
    const kelas = new Map((kn ?? []).map((n) => [String(n.user_id), String(n.certificate_name)]));
    for (const p of prof ?? []) {
      const paparan = p.display_name && String(p.display_name).trim() ? String(p.display_name).trim() : null;
      namaSemasa.set(String(p.id), kelas.get(String(p.id)) ?? p.certificate_name ?? paparan);
    }
  }

  const perubahan: {
    participant_id: string;
    email: string | null;
    old_name: string | null;
    new_name: string;
    unchanged: boolean;
    warnings: ReturnType<typeof amaranNama>;
  }[] = [];
  const tidakPadan: { participant_id?: string; email?: string; full_name: string; reason: string }[] = [];
  const dilihat = new Set<string>();
  const emelUntuk = new Map(Array.from(ikutEmel.entries()).map(([e, u]) => [u, e]));

  for (const p of senarai) {
    const uid = p.participant_id ?? (p.email ? ikutEmel.get(p.email) : undefined);
    if (!uid || !ahli.has(uid)) {
      tidakPadan.push({ ...p, reason: 'Tiada peserta kelas ini sepadan.' });
      continue;
    }
    if (dilihat.has(uid)) {
      tidakPadan.push({ ...p, reason: 'Peserta yang sama muncul lebih sekali; hanya yang pertama digunakan.' });
      continue;
    }
    dilihat.add(uid);
    const lama = namaSemasa.get(uid) ?? null;
    perubahan.push({
      participant_id: uid,
      email: emelUntuk.get(uid) ?? null,
      old_name: lama,
      new_name: p.full_name,
      unchanged: lama === p.full_name,
      warnings: amaranNama(p.full_name, true),
    });
  }

  if (!confirm) {
    return NextResponse.json({
      dry_run: true,
      scope,
      changes: perubahan,
      unmatched: tidakPadan,
    });
  }

  const berjaya: { participant_id: string; old_name: string | null; new_name: string }[] = [];
  const gagal: { participant_id: string; error: string }[] = [];
  const idSijil: string[] = [];
  for (const c of perubahan) {
    const { data, error } = await supa.rpc('qm_set_member_certificate_name', {
      p_class: classId,
      p_user: c.participant_id,
      p_name: c.new_name,
      p_scope: scope,
    });
    if (error) {
      gagal.push({ participant_id: c.participant_id, error: error.message });
      continue;
    }
    const baris = Array.isArray(data) ? data[0] : data;
    berjaya.push({ participant_id: c.participant_id, old_name: baris?.old_name ?? c.old_name, new_name: baris?.new_name ?? c.new_name });
    for (const id of (baris?.certificate_ids ?? []) as string[]) idSijil.push(id);
  }

  const pdf = janaSemula && idSijil.length > 0
    ? await janaSemulaIkutTemplat(svc, classId, idSijil)
    : { regenerated: 0, failed: 0 };

  return NextResponse.json({
    scope,
    updated: berjaya,
    failed: gagal,
    unmatched: tidakPadan,
    certificates_renamed: idSijil.length,
    certificates_regenerated: pdf.regenerated,
    certificates_regenerate_failed: pdf.failed,
    ...(janaSemula ? {} : { note: 'regenerate_issued false: PDF lama belum dijana semula; guna regenerate_certificates.' }),
  });
}
