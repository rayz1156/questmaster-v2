/**
 * KZ-UTT Fasa 4: hantar satu e-mel susulan kajian (T2 atau T3).
 *
 * Dipanggil oleh pekerja baris gilir KZ-C untuk baris kind
 * 'research_followup'. Semua syarat disemak SEMULA di sini sejurus sebelum
 * menghantar, kerana keadaan boleh berubah antara perancang dan pekerja:
 * suis e-mel, persetujuan, berhenti langganan, keahlian kelas, titik sudah
 * dijawab, dan tetingkap sudah tutup. Mana-mana yang gagal membatalkan
 * e-mel dengan sebab yang direkodkan dalam log susulan.
 *
 * Fail ini tidak mengimport pekerjaEmel (elak import bulat): pengangkut SMTP
 * diberi oleh pemanggil.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Transporter } from 'nodemailer';
import { janaToken } from '@/lib/sijil/namaPenuh';
import { bolehEmel, muatPelan, muatPersetujuan } from '@/lib/kajian-solo-api';

export type SebabBatal =
  | 'not_found'
  | 'emails_off'
  | 'no_consent'
  | 'unsubscribed'
  | 'not_member'
  | 'answered'
  | 'closed'
  | 'no_link';

export type HasilSusulan = { hasil: 'sent' } | { hasil: 'cancelled'; sebab: SebabBatal };

const RE_EMEL = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/;

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Tarikh dan masa Malaysia, contoh "12 Mac 2027, 11:59 PG". */
export function tarikhMasaMy(ms: number): string {
  return new Intl.DateTimeFormat('ms-MY', {
    timeZone: 'Asia/Kuala_Lumpur',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(ms));
}

export type IsiSusulan = {
  nama: string;
  kursus: string;
  titik: 'T2' | 'T3';
  peringatan: boolean;
  pautan: string;
  tutup: string;
  pautanBerhenti: string;
};

/** Kandungan e-mel BM. Tulen supaya diuji oleh skrip ujian kendiri. */
export function binaEmelSusulan(v: IsiSusulan): { subject: string; text: string; html: string } {
  // Kerangka e-mel: susulan selepas latihan untuk menambah baik dan merancang
  // latihan seterusnya (keputusan Boss Hariz, 28 Nov 2026). Pendedahan
  // penyelidikan berada pada kotak tanda sebelum ujian pertama.
  const awalan = v.peringatan ? 'Peringatan: ' : '';
  const subject = `${awalan}${v.titik === 'T2' ? 'Penilaian selepas latihan' : 'Susulan selepas latihan'}: ${v.kursus}`
    .replace(/[\r\n]+/g, ' ')
    .slice(0, 200);
  const pembuka =
    v.titik === 'T2'
      ? `Terima kasih kerana menyertai ${v.kursus}. Kami ingin mengetahui sejauh mana latihan ini membantu anda. Jawapan anda akan membantu kami menambah baik latihan ini dan merancang latihan seterusnya yang lebih sesuai dengan keperluan anda.`
      : `Sudah beberapa bulan sejak anda menyertai ${v.kursus}. Kami ingin mengetahui apa yang masih anda ingat dan gunakan daripada latihan itu. Jawapan anda akan membantu kami merancang latihan susulan dan latihan seterusnya yang lebih bermanfaat.`;
  const perenggan = [
    `Assalamualaikum dan salam sejahtera ${v.nama},`,
    pembuka,
    'Ia mengandungi beberapa soalan ringkas, mengambil masa kira-kira 10 hingga 15 minit, dan hanya perlu dijawab sekali.',
    `Mula di sini (log masuk dengan akaun Kuizen anda):\n${v.pautan}`,
    `Tarikh tutup: ${v.tutup}`,
    `Jika anda tidak mahu menerima e-mel susulan ini lagi, klik pautan ini. Akses anda kepada kelas tidak terjejas.\n${v.pautanBerhenti}`,
    'Sekian, terima kasih.',
  ];
  const text = perenggan.join('\n\n');
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#f9fafb;">
      <div style="background:#fff;border-radius:12px;padding:24px;border:1px solid #e5e7eb;">
        ${perenggan
          .map((p) =>
            escapeHtml(p)
              .replace(/https:\/\/[^\s<]+/g, (u) => `<a href="${u}">${u}</a>`)
              .replace(/\n/g, '<br>'),
          )
          .map((p) => `<p style="color:#374151;line-height:1.5;">${p}</p>`)
          .join('')}
      </div>
    </div>`;
  return { subject, text, html };
}

/**
 * Semak dan hantar. Membaling ralat (dikelaskan oleh pekerja) untuk
 * kegagalan pangkalan data atau SMTP; memulangkan 'cancelled' untuk
 * syarat yang tidak lagi dipenuhi.
 */
export async function hantarSusulanKajian(
  svc: SupabaseClient,
  b: { followup_id: string | null; idempotency_key: string },
  smtp: { t: Transporter; dari: string } | null,
  sekarang = Date.now(),
): Promise<HasilSusulan> {
  if (!b.followup_id) return { hasil: 'cancelled', sebab: 'not_found' };
  const { data: f, error } = await svc
    .from('qm_research_followups')
    .select('id, quiz_id, user_id, class_id, point, seq, closes_at')
    .eq('id', b.followup_id)
    .maybeSingle();
  if (error) throw Object.assign(new Error(`Follow-up lookup failed: ${error.message}`), { code: 'ECONNRESET' });
  if (!f) return { hasil: 'cancelled', sebab: 'not_found' };

  const pelan = await muatPelan(svc, f.quiz_id);
  if (!pelan || !pelan.emails_enabled) return { hasil: 'cancelled', sebab: 'emails_off' };
  const setuju = await muatPersetujuan(svc, f.quiz_id, f.user_id);
  if (!bolehEmel(setuju)) {
    return { hasil: 'cancelled', sebab: setuju?.unsubscribed_at && setuju.decision === 'agree' && !setuju.withdrawn_at ? 'unsubscribed' : 'no_consent' };
  }
  if (Date.parse(f.closes_at) <= sekarang) return { hasil: 'cancelled', sebab: 'closed' };

  const { data: ahli } = await svc
    .from('qm_class_members')
    .select('user_id')
    .eq('class_id', f.class_id)
    .eq('user_id', f.user_id)
    .maybeSingle();
  if (!ahli) return { hasil: 'cancelled', sebab: 'not_member' };

  const { data: selesai } = await svc
    .from('qm_solo_runs')
    .select('id')
    .eq('quiz_id', f.quiz_id)
    .eq('user_id', f.user_id)
    .eq('test_mode', true)
    .eq('measure_point', f.point)
    .eq('status', 'finished')
    .limit(1);
  if ((selesai ?? []).length > 0) return { hasil: 'cancelled', sebab: 'answered' };

  const { data: kuiz } = await svc
    .from('qm_live_quizzes')
    .select('title, solo_code, solo_enabled')
    .eq('id', f.quiz_id)
    .maybeSingle();
  if (!kuiz?.solo_code || !kuiz.solo_enabled) return { hasil: 'cancelled', sebab: 'no_link' };
  const { data: kelas } = await svc.from('qm_classes').select('name').eq('id', f.class_id).maybeSingle();
  const { data: prof } = await svc.from('qm_profiles').select('display_name').eq('id', f.user_id).maybeSingle();

  const { data: pengguna, error: uErr } = await svc.auth.admin.getUserById(String(f.user_id));
  if (uErr && uErr.status !== 404) {
    throw Object.assign(new Error(`User lookup failed: ${uErr.message}`), { code: 'ECONNRESET' });
  }
  const emel = pengguna?.user?.email ?? '';
  if (!emel || !RE_EMEL.test(emel)) {
    throw Object.assign(new Error('No valid email address for this participant.'), { responseCode: 550 });
  }
  if (!smtp) throw Object.assign(new Error('SMTP not configured'), { code: 'ECONNECTION' });

  // Token berhenti langganan baharu bagi setiap e-mel; hash sahaja disimpan,
  // sebelum menghantar supaya pautan sah walaupun tanda 'sent' gagal.
  const { token, hash } = janaToken();
  const { error: tErr } = await svc
    .from('qm_research_followups')
    .update({ unsub_token_hash: hash, updated_at: new Date().toISOString() })
    .eq('id', f.id);
  if (tErr) throw Object.assign(new Error(`Token save failed: ${tErr.message}`), { code: 'ECONNRESET' });

  const site = (process.env.NEXT_PUBLIC_SITE_URL || 'https://kuizen.fun').replace(/\/$/, '');
  const isi = binaEmelSusulan({
    nama: prof?.display_name || 'peserta',
    kursus: kelas?.name || kuiz.title,
    titik: f.point as 'T2' | 'T3',
    peringatan: Number(f.seq) > 0,
    pautan: `${site}/solo/${encodeURIComponent(kuiz.solo_code)}?titik=${f.point}`,
    tutup: tarikhMasaMy(Date.parse(f.closes_at)),
    pautanBerhenti: `${site}/kajian/berhenti/${token}`,
  });
  await smtp.t.sendMail({
    from: smtp.dari,
    to: emel,
    subject: isi.subject,
    text: isi.text,
    html: isi.html,
    messageId: `<${b.idempotency_key.replace(/[^A-Za-z0-9.:-]/g, '')}@kuizen.fun>`,
    headers: { 'List-Unsubscribe': `<${site}/kajian/berhenti/${token}>` },
  });
  return { hasil: 'sent' };
}
