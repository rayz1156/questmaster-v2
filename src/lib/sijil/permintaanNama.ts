/**
 * Permintaan pengesahan nama kepada peserta (KZ-E, alat
 * request_name_confirmation). Pelayan sahaja.
 *
 * Calon diambil daripada qm_certificate_eligibility (klien Bearer pemanggil,
 * jadi fungsi SQL menyemak pendidik kelas) dan e-mel daripada
 * qm_user_directory (juga klien pemanggil). Service role hanya untuk
 * baris gilir, token dan tetapan lalai selepas kebenaran disahkan.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { amaranSenarai, akaunDipadam, type AmaranNama, type KodAmaranNama } from '@/lib/sijil/namaSijil';
import { emelTersuai, ISI_LALAI } from '@/lib/sijil/pekerjaEmel';
import { formatTarikhBm } from '@/lib/sijil/janaPdf';

export type Penapis = 'unconfirmed' | 'flagged' | 'all';
export type Mod = 'after_issue' | 'before_issue';

export type Calon = {
  participant_id: string;
  current_name: string;
  email: string | null;
  name_confirmed: boolean;
  eligible: boolean;
  already_issued: boolean;
  warnings: AmaranNama[];
};

export type Langkau = { participant_id: string; name: string; reason: string };

/** Senarai calon kelas dengan amaran (termasuk pendua dan akaun dipadam). */
export async function senaraiCalon(supa: SupabaseClient, templateId: string): Promise<Calon[]> {
  const { data, error } = await supa.rpc('qm_certificate_eligibility', { p_template: templateId });
  if (error) throw new Error(error.message);
  const baris = (data ?? []) as {
    participant_id: string;
    display_name: string | null;
    certificate_name: string | null;
    name_confirmed: boolean;
    eligible: boolean;
    already_issued: boolean;
  }[];
  const ids = baris.map((b) => b.participant_id);
  const emel = new Map<string, string>();
  if (ids.length > 0) {
    const { data: dir } = await supa.rpc('qm_user_directory', { p_ids: ids });
    for (const d of dir ?? []) if (d.email) emel.set(String(d.user_id), String(d.email).trim().toLowerCase());
  }
  const amaran = amaranSenarai(
    baris.map((b) => ({
      participant_id: b.participant_id,
      nama: b.certificate_name ?? b.display_name,
      disahkan: b.name_confirmed,
      email: emel.get(b.participant_id) ?? null,
    })),
  );
  return baris.map((b) => ({
    participant_id: b.participant_id,
    current_name: b.certificate_name ?? b.display_name ?? '',
    email: emel.get(b.participant_id) ?? null,
    name_confirmed: b.name_confirmed,
    eligible: b.eligible,
    already_issued: b.already_issued,
    warnings: amaran.get(b.participant_id) ?? [],
  }));
}

/** Pilih penerima dan sebab langkau. */
export function pilihPenerima(
  calon: Calon[],
  opsi: {
    participantIds: string[] | null;
    penapis: Penapis;
    kecuali: Set<string>;
    langkauAmaran: Set<KodAmaranNama>;
    sedangAktif: Set<string>;
  },
): { penerima: Calon[]; dilangkau: Langkau[] } {
  const penerima: Calon[] = [];
  const dilangkau: Langkau[] = [];
  const diminta = opsi.participantIds ? new Set(opsi.participantIds) : null;
  for (const c of calon) {
    if (diminta && !diminta.has(c.participant_id)) continue;
    const kod = new Set(c.warnings.map((w) => w.code));
    if (!diminta) {
      if (opsi.penapis === 'unconfirmed' && c.name_confirmed) continue;
      if (opsi.penapis === 'flagged' && !c.warnings.some((w) => w.code !== 'unconfirmed')) continue;
    }
    const langkau = (reason: string) => dilangkau.push({ participant_id: c.participant_id, name: c.current_name, reason });
    if (opsi.kecuali.has(c.participant_id)) langkau('Dikecualikan (exclude_participant_ids).');
    else if (akaunDipadam(c.current_name)) langkau('Akaun dipadam.');
    else if (!c.email) langkau('Tiada e-mel.');
    else if (!c.eligible) langkau('Tidak layak mengikut kriteria templat.');
    else if (opsi.sedangAktif.has(c.participant_id)) langkau('Permintaan aktif sudah ada (token belum digunakan atau e-mel dalam baris gilir).');
    else {
      const kena = Array.from(opsi.langkauAmaran).find((k) => kod.has(k));
      if (kena) langkau(`Dilangkau kerana amaran ${kena}.`);
      else penerima.push(c);
    }
  }
  return { penerima, dilangkau };
}

/** Peserta yang ada token pending belum tamat atau e-mel nama dalam baris gilir. */
export async function pesertaSedangAktif(svc: SupabaseClient, classId: string): Promise<Set<string>> {
  const hasil = new Set<string>();
  const { data: token } = await svc
    .from('qm_name_update_tokens')
    .select('participant_id, expires_at')
    .eq('class_id', classId)
    .eq('status', 'pending');
  for (const t of token ?? []) {
    if (new Date(String(t.expires_at)).getTime() > Date.now()) hasil.add(String(t.participant_id));
  }
  const { data: gilir } = await svc
    .from('qm_certificate_email_queue')
    .select('participant_id')
    .eq('class_id', classId)
    .in('status', ['queued', 'sending', 'retrying'])
    .or('kind.eq.name_request,name_link_purpose.not.is.null');
  for (const g of gilir ?? []) if (g.participant_id) hasil.add(String(g.participant_id));
  return hasil;
}

/** Contoh e-mel yang sudah diisi untuk seorang penerima (dry run). */
export async function contohEmel(
  svc: SupabaseClient,
  userId: string,
  mod: Mod,
  calon: Calon,
  template: { id: string; title: string; fields: Record<string, unknown> | null },
  namaKelas: string,
  override: { subject: string | null; body: string | null },
  hari: number,
) {
  const { data: lalai } = await svc
    .from('qm_certificate_defaults')
    .select('email_template')
    .eq('educator_id', userId)
    .maybeSingle();
  const t = (lalai?.email_template ?? {}) as Record<string, string>;
  const asal = mod === 'before_issue' ? ISI_LALAI.name_request : ISI_LALAI.after_issue;
  const subjek = override.subject || t.subject || asal.subject;
  let isi = override.body || (mod === 'before_issue' ? t.body_before_issue : t.body) || asal.body;
  isi = isi.replace(/\{hari\}/g, String(hari));
  if (!isi.includes('{pautan_kemaskini_nama}')) {
    isi += '\n\nJika nama pada sijil bukan nama penuh anda seperti dalam kad pengenalan, sila kemas kini di pautan berikut. Sijil baharu akan dihantar secara automatik:\n{pautan_kemaskini_nama}';
  }
  const f = (template.fields ?? {}) as Record<string, string>;
  const tarikh = f.date_start
    ? f.date_end && f.date_end !== f.date_start
      ? `${formatTarikhBm(new Date(f.date_start))} hingga ${formatTarikhBm(new Date(f.date_end))}`
      : formatTarikhBm(new Date(f.date_start))
    : formatTarikhBm(new Date());
  const site = (process.env.NEXT_PUBLIC_SITE_URL || 'https://kuizen.fun').replace(/\/$/, '');
  const e = emelTersuai(subjek, isi, {
    nama: calon.current_name,
    kursus: f.course || namaKelas,
    tarikh,
    tempat: f.location ?? '',
    kod_sijil: mod === 'after_issue' ? 'CONTOH0000' : '',
    pautan_pengesahan: mod === 'after_issue' ? `${site}/sijil/CONTOH0000` : '',
    nama_semasa: calon.current_name,
    pautan_kemaskini_nama: `${site}/nama/<token-unik-setiap-peserta>`,
  }, mod === 'after_issue');
  return {
    to_name: calon.current_name,
    subject: e.subject,
    body: e.text,
    from_name: t.from_name ?? null,
    reply_to: t.reply_to ?? null,
  };
}
