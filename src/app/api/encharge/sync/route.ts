/**
 * POST /api/encharge/sync (KZ-D)
 *
 * Send to Encharge untuk satu, banyak atau semua kelas pemanggil.
 * Badan:
 *   class_ids: uuid[] | "all"
 *   include_status?: ("active"|"ended"|"archived")[]  lalai ["active","ended"]
 *   consent_confirmed: true  (setara kotak persetujuan dalam UI; wajib untuk hantar)
 *   confirm?: true           tanpa ini: dry run sahaja
 *   force_resync?: boolean   lalai false
 *
 * Kebenaran: pemilik kelas atau pendidik bersama yang diterima bagi SETIAP
 * kelas; pelan berbayar (atau pentadbir) seperti butang UI; integrasi
 * Encharge milik pemanggil. Kerja dihadkan kira-kira 40 saat setiap
 * panggilan (di bawah timeout nginx 60 saat); kelas yang belum diproses
 * dipulangkan dalam remaining_class_ids dan panggilan semula menyambung
 * (idempoten: yang sudah 'sent' dilangkau).
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireUser, getServiceSupabase } from '@/lib/supabase-route';
import { decrypt } from '@/lib/mcp/crypto';
import { PROVIDERS } from '@/lib/email-providers';
import { pelanBerbayar } from '@/lib/pelan';
import { dalamHad } from '@/lib/hadKadar';
import { ralatJson } from '@/lib/i18n/ralatApi';
import { hantarKelas, rancangKelas, statusKelasEncharge, type StatusKelas } from '@/lib/enchargeSync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BAJET_MS = 40_000;
const HAD_KENALAN = 1000;

type Kelas = { id: string; name: string; owner_id: string; ended_at: string | null; is_archived: boolean | null };

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;
  const user = auth.user!;
  const mula = Date.now();

  if (!dalamHad(`encharge-sync:${user.id}`, 10)) {
    return ralatJson('Too many requests. Please wait a minute and try again.', 429, { retry_after_seconds: 60 });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const confirm = body.confirm === true;
  const consent = body.consent_confirmed === true;
  const force = body.force_resync === true;
  const statusSah: StatusKelas[] = ['active', 'ended', 'archived'];
  const include: StatusKelas[] = Array.isArray(body.include_status)
    ? (body.include_status as unknown[]).filter((s): s is StatusKelas => statusSah.includes(s as StatusKelas))
    : ['active', 'ended'];
  if (include.length === 0) return ralatJson('include_status must contain active, ended or archived.', 400);

  let idDiminta: string[] | 'all';
  if (body.class_ids === 'all') {
    idDiminta = 'all';
  } else if (Array.isArray(body.class_ids)) {
    idDiminta = Array.from(new Set((body.class_ids as unknown[]).filter((x): x is string => typeof x === 'string' && UUID.test(x))));
    if (idDiminta.length === 0) return ralatJson('class_ids must be "all" or a list of class UUIDs.', 400);
    if (idDiminta.length > 200) return ralatJson('Too many classes in one request.', 400);
  } else {
    return ralatJson('class_ids must be "all" or a list of class UUIDs.', 400);
  }
  if (confirm && !consent) {
    return ralatJson('consent_confirmed must be true: confirm these students agreed to receive emails from you.', 400);
  }

  // Pelan berbayar atau pentadbir (sama seperti butang UI).
  const { data: profil } = await auth.supa.from('qm_profiles').select('role, suspended').eq('id', user.id).maybeSingle();
  if (!profil || profil.suspended) return ralatJson('Forbidden', 403);
  const pentadbir = profil.role === 'admin' || profil.role === 'superadmin';
  let berkesan: string | null = null;
  if (!pentadbir) {
    const { data: rpcPlan, error: rpcErr } = await auth.supa.rpc('qm_effective_plan', { p_user: user.id });
    berkesan = !rpcErr && typeof rpcPlan === 'string' ? rpcPlan : null;
  }
  if (!pentadbir && !pelanBerbayar(berkesan)) {
    return ralatJson('Email integration is available on the Pro plan.', 403, { code: 'QM_PRO_ONLY' });
  }

  // Kelas yang pemanggil berhak: pemilik atau pendidik bersama diterima.
  const svc = getServiceSupabase();
  const [{ data: milik }, { data: bersama }] = await Promise.all([
    svc.from('qm_classes').select('id').eq('owner_id', user.id),
    svc.from('qm_class_educators').select('class_id').eq('educator_id', user.id).not('accepted_at', 'is', null),
  ]);
  const berhak = new Set<string>([
    ...(milik ?? []).map((k: { id: string }) => k.id),
    ...(bersama ?? []).map((k: { class_id: string }) => k.class_id),
  ]);
  if (idDiminta !== 'all') {
    const tiada = idDiminta.filter((id) => !berhak.has(id));
    if (tiada.length > 0) return ralatJson('Forbidden', 403, { forbidden_class_ids: tiada });
  }
  const sasaranIds = idDiminta === 'all' ? Array.from(berhak) : idDiminta;
  const { data: kelasRows } = sasaranIds.length
    ? await svc.from('qm_classes').select('id, name, owner_id, ended_at, is_archived').in('id', sasaranIds)
    : { data: [] as Kelas[] };
  const kelas = ((kelasRows ?? []) as Kelas[])
    .filter((k) => include.includes(statusKelasEncharge(k)))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Integrasi Encharge pemanggil.
  const { data: integ } = await svc
    .from('qm_email_integrations')
    .select('provider, secret_enc')
    .eq('owner_id', user.id)
    .maybeSingle();

  // Dry run.
  if (!confirm) {
    const ringkasan = [];
    for (const k of kelas) {
      const r = await rancangKelas(svc, user.id, k, force);
      const { hantar: _h, ...lain } = r;
      ringkasan.push(lain);
      if (Date.now() - mula > BAJET_MS) break;
    }
    return NextResponse.json({
      dry_run: true,
      integration_connected: !!integ,
      include_status: include,
      force_resync: force,
      classes: ringkasan,
      totals: {
        classes: ringkasan.length,
        to_send: ringkasan.reduce((n, r) => n + r.to_send, 0),
        skipped_already_sent: ringkasan.reduce((n, r) => n + r.skipped_already_sent, 0),
        without_email: ringkasan.reduce((n, r) => n + r.without_email, 0),
      },
      ...(ringkasan.length < kelas.length ? { remaining_class_ids: kelas.slice(ringkasan.length).map((k) => k.id) } : {}),
    });
  }

  if (!integ) return ralatJson('Connect Encharge in your profile first.', 400, { code: 'QM_NO_INTEGRATION' });
  const penyedia = PROVIDERS[integ.provider];
  if (!penyedia) return ralatJson('Unknown provider', 500);
  let kunci: string;
  try {
    kunci = decrypt(integ.secret_enc);
  } catch {
    return ralatJson('Stored key is invalid. Reconnect Encharge.', 500);
  }

  const hasilKelas = [];
  let jumlahKenalan = 0;
  let diproses = 0;
  for (const k of kelas) {
    if (Date.now() - mula > BAJET_MS) break;
    const r = await rancangKelas(svc, user.id, k, force);
    if (jumlahKenalan + r.to_send > HAD_KENALAN && diproses > 0) break;
    const h = await hantarKelas(svc, penyedia, kunci, user.id, r, user.id, 'mcp');
    jumlahKenalan += r.to_send;
    diproses += 1;
    if (r.to_send > 0) {
      // Log agregat lama supaya paparan "last sync" UI kekal tepat.
      await svc.from('qm_email_sync_log').insert({
        owner_id: user.id,
        class_id: k.id,
        provider: integ.provider,
        total: r.total_participants,
        sent: h.sent,
        skipped: r.without_email + r.skipped_already_sent,
        failed: h.failed,
        consent_confirmed: true,
      });
    }
    hasilKelas.push({
      class_id: k.id,
      class_name: k.name,
      tags: r.tags,
      sent: h.sent,
      skipped: r.skipped_already_sent,
      without_email: r.without_email,
      failed: h.failed,
      failures: h.failures.slice(0, 20),
    });
  }
  if (diproses > 0) {
    const now = new Date().toISOString();
    await svc.from('qm_email_integrations').update({ last_sync_at: now, updated_at: now }).eq('owner_id', user.id);
  }

  return NextResponse.json({
    classes: hasilKelas,
    totals: {
      sent: hasilKelas.reduce((n, r) => n + r.sent, 0),
      skipped: hasilKelas.reduce((n, r) => n + r.skipped, 0),
      without_email: hasilKelas.reduce((n, r) => n + r.without_email, 0),
      failed: hasilKelas.reduce((n, r) => n + r.failed, 0),
    },
    ...(diproses < kelas.length ? { remaining_class_ids: kelas.slice(diproses).map((k) => k.id) } : {}),
  });
}
