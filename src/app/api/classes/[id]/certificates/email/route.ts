/**
 * POST /api/classes/[id]/certificates/email
 *
 * KZ-C: e-mel sijil kini melalui baris gilir qm_certificate_email_queue dan
 * pekerja berkadar (src/lib/sijil/pekerjaEmel.ts), bukan gelung serentak.
 * Sebab: Emailit menghadkan 2 mesej sesaat; gelung lama 3 serentak gagal
 * dengan "452 4.4.5 Messages per second limit exceeded (2/2)".
 *
 * Badan JSON pilihan:
 *   certificate_ids?: uuid[] (maksimum 200), resend?: boolean,
 *   email_subject?, email_body?: mengatasi templat e-mel untuk penghantaran
 *     ini sahaja (pemboleh ubah {nama} {kursus} {tarikh} {tempat}
 *     {kod_sijil} {pautan_pengesahan}).
 * Tanpa badan: semua sijil yang belum diemel (maksimum 200 satu panggilan).
 *
 * Kebenaran dan pelan tidak berubah: pendidik kelas, pelan pemilik kelas
 * Pro/Institution/Unlimited DI PELAYAN, dan RPC qm_certificate_email_targets
 * menyemak pendidik sekali lagi serta menapis sijil dibatalkan/tanpa PDF.
 *
 * Respons: queued, already_queued, already_sent, skipped, estimated_seconds.
 * Bila sasaran baharu 20 atau kurang, laluan menunggu (maksimum 45 saat,
 * di bawah timeout nginx 60 saat) dan memulangkan sent/failed sebenar.
 * Medan sent, failed, no_attachment dan more dikekalkan untuk UI sedia ada.
 */
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { requireUser, getServiceSupabase } from '@/lib/supabase-route';
import { semakPendidikKelas } from '@/lib/peer-server';
import { dalamHad } from '@/lib/hadKadar';
import { tapiskanIdSijil } from '@/lib/sijil/keluarkan';
import { kadarSesaat, mulaPekerja, tungguSelesai } from '@/lib/sijil/pekerjaEmel';
import { ralatJson } from '@/lib/i18n/ralatApi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const MAKS_SASARAN = 200;
const TUNGGU_JIKA_KURANG = 20;
const HAD_TUNGGU_MS = 45_000;

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;
  const classId = params.id;
  const userId = auth.user!.id;

  if (!dalamHad(`cert-email:${userId}`, 20)) {
    return ralatJson('Too many requests. Please wait a minute and try again.', 429, { retry_after_seconds: 60 });
  }

  const ok = await semakPendidikKelas(auth.supa, classId, userId);
  if (!ok) return ralatJson('Forbidden', 403);

  let certificateIds: string[] = [];
  let resend = false;
  let subjek: string | null = null;
  let isi: string | null = null;
  try {
    const badan = (await req.json()) as Record<string, unknown> | null;
    if (badan && typeof badan === 'object' && !Array.isArray(badan)) {
      certificateIds = tapiskanIdSijil(badan.certificate_ids);
      resend = badan.resend === true && certificateIds.length > 0;
      if (typeof badan.email_subject === 'string' && badan.email_subject.trim()) {
        subjek = badan.email_subject.replace(/[\r\n]+/g, ' ').trim().slice(0, 200);
      }
      if (typeof badan.email_body === 'string' && badan.email_body.trim()) {
        isi = badan.email_body.replace(/\r\n/g, '\n').trim();
        if (isi.length > 8000) return ralatJson('email_body exceeds 8000 characters.', 400);
      }
    }
  } catch {
    certificateIds = [];
    resend = false;
  }
  if ((subjek && !isi) || (!subjek && isi)) {
    return ralatJson('Provide both email_subject and email_body, or neither.', 400);
  }

  // Semakan pelan DI PELAYAN (kzsec S1): pelan berkesan PEMILIK kelas.
  const { data: kelas } = await auth.supa
    .from('qm_classes')
    .select('owner_id')
    .eq('id', classId)
    .maybeSingle();
  const ownerId = (kelas as { owner_id?: string } | null)?.owner_id;
  let pelan = 'free';
  if (ownerId) {
    const { data: rpcPlan, error: rpcErr } = await auth.supa.rpc('qm_effective_plan', { p_user: ownerId });
    if (!rpcErr && typeof rpcPlan === 'string') pelan = rpcPlan;
  }
  if (pelan !== 'pro' && pelan !== 'institution' && pelan !== 'unlimited') {
    return ralatJson('Bulk certificate email is available on Pro and Institution plans.', 403);
  }
  const host = process.env.SMTP_HOST || process.env.BREVO_SMTP_HOST;
  if (!host || !(process.env.SMTP_USER || process.env.BREVO_SMTP_USER)) {
    return ralatJson('SMTP not configured', 500);
  }

  const { data: sasaran, error: rpcErr } = await auth.supa.rpc('qm_certificate_email_targets', {
    p_class: classId,
    p_limit: MAKS_SASARAN,
    p_ids: certificateIds.length > 0 ? certificateIds : null,
    p_resend: resend,
  });
  if (rpcErr) return ralatJson(rpcErr.message, 400);
  const baris = (sasaran ?? []) as { certificate_id: string; email: string | null }[];

  const svc = getServiceSupabase();
  // Sijil yang diminta tetapi sudah diemel (tanpa resend) dilaporkan already_sent.
  let alreadySent = 0;
  if (certificateIds.length > 0 && !resend) {
    const sasaranIds = new Set(baris.map((b) => b.certificate_id));
    const { data: sudah } = await svc
      .from('qm_certificates')
      .select('id, emailed_at')
      .eq('class_id', classId)
      .in('id', certificateIds.filter((id) => !sasaranIds.has(id)));
    alreadySent = (sudah ?? []).filter((r) => r.emailed_at).length;
  }

  const skipped: { certificate_id: string; reason: string }[] = [];
  const dimasukkan: { id: string; certificate_id: string }[] = [];
  let alreadyQueued = 0;
  const kumpulan = randomUUID();
  for (const b of baris) {
    if (!b.email || !b.email.includes('@')) {
      skipped.push({ certificate_id: b.certificate_id, reason: 'No email address.' });
      continue;
    }
    const { data, error } = await svc
      .from('qm_certificate_email_queue')
      .insert({
        certificate_id: b.certificate_id,
        class_id: classId,
        requested_by: userId,
        // Kunci idempotensi per sijil per penghantaran.
        idempotency_key: `${b.certificate_id}:${resend ? 'resend' : 'send'}:${kumpulan}`,
        subject_override: subjek,
        body_override: isi,
      })
      .select('id, certificate_id')
      .single();
    if (error) {
      // 23505: sijil ini sudah ada dalam baris gilir aktif.
      if ((error as { code?: string }).code === '23505') alreadyQueued += 1;
      else skipped.push({ certificate_id: b.certificate_id, reason: error.message });
      continue;
    }
    dimasukkan.push(data as { id: string; certificate_id: string });
  }

  mulaPekerja();

  const { count: menunggu } = await svc
    .from('qm_certificate_email_queue')
    .select('id', { count: 'exact', head: true })
    .in('status', ['queued', 'retrying', 'sending']);
  const anggaranSaat = Math.ceil(((menunggu ?? dimasukkan.length) as number) / kadarSesaat());

  const respons: Record<string, unknown> = {
    queued: dimasukkan.length,
    already_queued: alreadyQueued,
    already_sent: alreadySent,
    skipped,
    estimated_seconds: anggaranSaat,
    rate_per_second: kadarSesaat(),
    more: baris.length === MAKS_SASARAN,
  };

  // Kelas kecil: tunggu baris gilir selesai dan pulangkan hasil sebenar.
  if (dimasukkan.length > 0 && dimasukkan.length <= TUNGGU_JIKA_KURANG) {
    const siap = await tungguSelesai(svc, dimasukkan.map((d) => d.id), HAD_TUNGGU_MS);
    const { data: hasil } = await svc
      .from('qm_certificate_email_queue')
      .select('id, certificate_id, status, last_error, attempts, had_attachment')
      .in('id', dimasukkan.map((d) => d.id));
    const senarai = hasil ?? [];
    respons.completed = siap;
    respons.sent = senarai.filter((r) => r.status === 'sent').length;
    respons.failed = [
      ...senarai
        .filter((r) => r.status === 'failed' || r.status === 'cancelled')
        .map((r) => ({ certificate_id: r.certificate_id, error: r.last_error ?? 'Failed.' })),
      ...skipped.map((s) => ({ certificate_id: s.certificate_id, error: s.reason })),
    ];
    respons.pending = senarai.filter((r) => !['sent', 'failed', 'cancelled'].includes(String(r.status))).length;
    respons.no_attachment = senarai.filter((r) => r.status === 'sent' && r.had_attachment === false).length;
  } else {
    respons.sent = 0;
    respons.failed = skipped.map((s) => ({ certificate_id: s.certificate_id, error: s.reason }));
    respons.pending = dimasukkan.length;
    respons.no_attachment = 0;
  }

  return NextResponse.json(respons);
}
