/**
 * POST /api/classes/[id]/certificates/email
 *
 * Emel pukal sijil yang belum emailed_at. Pendidik kelas sahaja dan pelan
 * Pro/Institusi/Unlimited disemak DI PELAYAN (bukan hanya UI). Modul emel
 * yang sama dipakai: nodemailer SMTP dengan SMTP_* diutamakan dan BREVO_*
 * sandaran (corak educator-invites/notify); tiada penyedia baharu.
 *
 * Subjek: "Your certificate: <program>". Emel membawa pautan ke
 * /participant/certificates dan pautan pengesahan awam /sijil/<kod>.
 * URL bertandatangan TIDAK dilampirkan. emailed_at dikemas
 * kini untuk setiap sijil yang berjaya dihantar.
 *
 * KZ-007: badan JSON pilihan { certificate_ids?, resend? }. Tanpa badan,
 * tingkah laku tidak berubah (semua sijil yang belum diemel). Dengan
 * certificate_ids, hanya sijil itu (UUID sah, maksimum 200); resend: true
 * membolehkan penghantaran semula sijil yang sudah diemel.
 *
 * KZ-008: PDF dilampirkan terus pada emel. Satu panggilan menghantar
 * maksimum MAKS_SEKALI (20) sasaran (p_limit) supaya laluan tidak melebihi
 * timeout nginx 60 saat; UI mengulang panggilan sehingga semua dihantar.
 * PDF dimuat turun dari bucket `certificates` dengan klien service role
 * HANYA selepas requireUser, semakPendidikKelas, semakan pelan dan RPC
 * (yang menyemak pendidik sekali lagi) berjaya. pdf_path di luar folder
 * kelas, mengandungi `..` atau bukan .pdf tidak pernah dimuat turun.
 * Muat turun gagal atau melebihi MAKS_LAMPIRAN: emel tetap dihantar tanpa
 * lampiran dan dikira dalam no_attachment. Penghantaran serentak 3 melalui
 * untukSetiap (src/lib/sijil/emelSijil.ts).
 */
import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { requireUser, getServiceSupabase } from '@/lib/supabase-route';
import { semakPendidikKelas } from '@/lib/peer-server';
import { dalamHad } from '@/lib/hadKadar';
import { tapiskanIdSijil } from '@/lib/sijil/keluarkan';
import { MAKS_SEKALI, MAKS_LAMPIRAN, pathSelamat, untukSetiap } from '@/lib/sijil/emelSijil';
import { emelSijil } from '@/lib/i18n/emel';
import { bahasaPelayan } from '@/lib/i18n/pelayan';
import type { Bahasa } from '@/lib/i18n';
import { ralatJson } from '@/lib/i18n/ralatApi';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;
  const classId = params.id;
  const userId = auth.user!.id;

  // KZ-008: had kadar 20 seminit supaya gelung kelompok UI (sehingga 10
  // pusingan) dan butang per baris tidak tersekat 429.
  if (!dalamHad(`cert-email:${userId}`, 20)) {
    return ralatJson('Too many requests. Please wait a minute and try again.', 429);
  }

  const ok = await semakPendidikKelas(auth.supa, classId, userId);
  if (!ok) return ralatJson('Forbidden', 403);

  // KZ-007: badan JSON pilihan; badan kosong/tidak sah bermakna semua yang
  // belum diemel (tingkah laku lama kekal).
  let certificateIds: string[] = [];
  let resend = false;
  try {
    const badan = (await req.json()) as { certificate_ids?: unknown; resend?: unknown } | null;
    if (badan && typeof badan === 'object' && !Array.isArray(badan)) {
      certificateIds = tapiskanIdSijil(badan.certificate_ids);
      resend = badan.resend === true && certificateIds.length > 0;
    }
  } catch {
    // Tiada badan atau bukan JSON: teruskan tanpa penapis sijil.
    certificateIds = [];
    resend = false;
  }

  // Semakan pelan DI PELAYAN (kzsec S1): emel pukal ialah keistimewaan
  // KELAS, jadi pelan berkesan PEMILIK kelas yang mengawal, bukan pelan
  // pendidik yang memanggil. qm_effective_plan (0040) mengendalikan tamat
  // tempoh (jatuh ke free) dan pentadbir.
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

  // Konfigurasi SMTP: SMTP_* (Emailit) diutamakan, BREVO_* sandaran.
  const host = process.env.SMTP_HOST || process.env.BREVO_SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || process.env.BREVO_SMTP_PORT || 587);
  const smtpUser = process.env.SMTP_USER || process.env.BREVO_SMTP_USER;
  const smtpPass = process.env.SMTP_PASS || process.env.BREVO_SMTP_PASS;
  const fromEmail =
    process.env.SMTP_FROM_EMAIL || process.env.BREVO_FROM_EMAIL || 'noreply@veltrix.technology';
  const fromName = process.env.SMTP_FROM_NAME || process.env.BREVO_FROM_NAME || 'Kuizen';
  if (!host || !smtpUser || !smtpPass) {
    return ralatJson('SMTP not configured', 500);
  }

  // Sasaran: RPC SECURITY DEFINER menyemak semula pendidik kelas dan
  // mengapit had MAKS_SEKALI (KZ-008: 20 setiap panggilan supaya laluan
  // tidak melebihi timeout nginx 60 saat; UI mengulang panggilan). PDF
  // mesti sudah ada (pdf_path bukan NULL). KZ-007: p_ids dan p_resend
  // membolehkan emel sijil terpilih dan penghantaran semula.
  const { data: sasaran, error: rpcErr } = await auth.supa.rpc('qm_certificate_email_targets', {
    p_class: classId,
    p_limit: MAKS_SEKALI,
    p_ids: certificateIds.length > 0 ? certificateIds : null,
    p_resend: resend,
  });
  if (rpcErr) return ralatJson(rpcErr.message, 400);
  const baris = (sasaran ?? []) as {
    certificate_id: string;
    code: string;
    name_snapshot: string;
    program_snapshot: string;
    email: string;
  }[];
  if (baris.length === 0) {
    return NextResponse.json({ sent: 0, failed: [], message: 'No certificates waiting for email.' });
  }

  // Nama kelas tidak diperlukan: subjek dibina daripada program_snapshot
  // setiap sijil.

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || req.nextUrl.origin;
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: false,
    auth: { user: smtpUser, pass: smtpPass },
    // CTO (kzsec S4): had masa supaya satu sambungan tergantung tidak melebihi 60 s nginx.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });

  // KZ-008: baca pdf_path untuk id sasaran dengan klien service role.
  // Digunakan HANYA selepas requireUser, semakPendidikKelas, semakan pelan
  // dan RPC (yang menyemak pendidik sekali lagi) berjaya. Baris yang
  // class_id !== classId dibuang (pertahanan berlapis).
  const ids = baris.map((b) => b.certificate_id);
  const svc = getServiceSupabase();
  const { data: barisPdf } = await svc
    .from('qm_certificates')
    .select('id, pdf_path, class_id, participant_id')
    .in('id', ids);
  const petaPdf = new Map<string, string | null>();
  const petaPeserta = new Map<string, string>();
  const idsPeserta = new Set<string>();
  for (const r of (barisPdf ?? []) as { id: string; pdf_path: string | null; class_id: string; participant_id: string | null }[]) {
    if (r.class_id === classId) {
      petaPdf.set(r.id, r.pdf_path);
      if (r.participant_id) {
        petaPeserta.set(r.id, r.participant_id);
        idsPeserta.add(r.participant_id);
      }
    }
  }

  // KZ-043 A6: bahasa setiap penerima diambil daripada profil peserta
  // (service role sedia ada, lajur bahasa sahaja); sandaran bahasa penghantar.
  const bahasaPenghantar = bahasaPelayan();
  const petaBahasa = new Map<string, Bahasa>();
  if (idsPeserta.size > 0) {
    try {
      const { data: barisBahasa } = await svc
        .from('qm_profiles')
        .select('id, bahasa')
        .in('id', Array.from(idsPeserta));
      for (const p of (barisBahasa ?? []) as { id: string; bahasa?: string }[]) {
        petaBahasa.set(p.id, p.bahasa === 'ms' ? 'ms' : 'en');
      }
    } catch {
      // Lajur bahasa belum ada (migrasi belum diterapkan): guna sandaran.
    }
  }

  let sent = 0;
  let noAttachment = 0;
  const failed: { certificate_id: string; error: string }[] = [];
  const hantar = baris.filter((b) => typeof b.email === 'string' && b.email.includes('@'));
  if (hantar.length < baris.length) {
    for (const b of baris) {
      if (!hantar.includes(b)) failed.push({ certificate_id: b.certificate_id, error: 'No email address.' });
    }
  }

  // KZ-008: penghantaran serentak 3 (untukSetiap). Emel tanpa lampiran
  // tetap dihantar dan dikira dalam noAttachment.
  await untukSetiap(hantar, 3, async (b) => {
    const sahUrl = `${siteUrl}/sijil/${encodeURIComponent(b.code)}`;
    const senaraiUrl = `${siteUrl}/participant/certificates`;

    // Muat turun PDF hanya jika pdf_path selamat untuk kelas ini
    // (folder kelas, berakhir .pdf, tiada ..). Selebihnya: tanpa lampiran.
    let lampiran: { filename: string; content: Buffer; contentType: string } | null = null;
    const pdfPath = petaPdf.get(b.certificate_id);
    if (pathSelamat(pdfPath, classId)) {
      try {
        // CTO (kzsec S4): had masa 15 s supaya storan tergantung tidak menyekat kelompok.
        const { data: pdfData } = await Promise.race([
          svc.storage.from('certificates').download(pdfPath as string),
          new Promise<{ data: null }>((selesai) => setTimeout(() => selesai({ data: null }), 15_000)),
        ]);
        if (pdfData) {
          const bait = Buffer.from(await pdfData.arrayBuffer());
          if (bait.length <= MAKS_LAMPIRAN) {
            // Nama fail HANYA guna code (aksara selamat), bukan nama peserta.
            lampiran = { filename: `Certificate-${b.code}.pdf`, content: bait, contentType: 'application/pdf' };
          }
        }
      } catch {
        lampiran = null;
      }
    }

    // KZ-043 A6: badan e-mel dalam bahasa penerima (profil peserta;
    // sandaran bahasa penghantar). Nilai di-escape di dalam templat.
    const bahasaPenerima = petaBahasa.get(petaPeserta.get(b.certificate_id) ?? '') ?? bahasaPenghantar;
    const { subject, html, text } = emelSijil(bahasaPenerima, {
      program: b.program_snapshot,
      kod: b.code,
      senaraiUrl,
      sahUrl,
      adaLampiran: !!lampiran,
    });

    try {
      await transporter.sendMail({
        from: `"${fromName}" <${fromEmail}>`,
        to: b.email,
        subject,
        text,
        html,
        attachments: lampiran ? [lampiran] : undefined,
      });
      // emailed_at dikemas kini hanya selepas penghantaran berjaya.
      const { error: updErr } = await auth.supa
        .from('qm_certificates')
        .update({ emailed_at: new Date().toISOString() })
        .eq('id', b.certificate_id)
        .is('revoked_at', null);
      if (updErr) {
        failed.push({ certificate_id: b.certificate_id, error: updErr.message });
      } else {
        sent += 1;
        if (!lampiran) noAttachment += 1;
      }
    } catch (e) {
      failed.push({
        certificate_id: b.certificate_id,
        error: e instanceof Error ? e.message : 'Send failed.',
      });
    }
  });

  return NextResponse.json({
    sent,
    failed,
    total_targets: hantar.length,
    no_attachment: noAttachment,
    // more: UI mengulang panggilan selagi true (RPC mengapit MAKS_SEKALI).
    more: baris.length === MAKS_SEKALI,
  });
}
