/**
 * Bantuan nama sijil (KZ-A).
 *
 * - amaranNama: tanda nama yang mungkin bukan nama penuh rasmi sebelum
 *   sijil dikeluarkan (belum disahkan, ada kurungan, satu atau dua perkataan,
 *   atau bermula dengan gelaran panggilan seperti "Bro").
 * - janaSemulaIkutTemplat: jana semula PDF sijil mengikut templat ASAL
 *   setiap sijil (bukan templat aktif), digunakan selepas nama ditukar.
 *
 * Fail pelayan sahaja. Panggil janaSemulaIkutTemplat HANYA selepas
 * kebenaran pendidik disahkan, kerana ia menggunakan klien service role.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  bacaTemplatKelas,
  janaSemulaPdfSijil,
  type BarisPdfSijil,
} from '@/lib/sijil/keluarkan';

export type KodAmaranNama = 'unconfirmed' | 'brackets' | 'short' | 'nickname';

/** Gelaran panggilan biasa yang jarang muncul pada nama rasmi. */
const PANGGILAN = /^(bro|sis|kak|akak|abg|abang|adik|dik|cik|kakak|bang|mak|pak|uncle|auntie|aunty|cikgu|ustaz|ustazah|mr|mrs|ms|miss)\b\.?/i;

const MESEJ_AMARAN: Record<KodAmaranNama, string> = {
  unconfirmed: 'Nama belum disahkan oleh peserta atau pendidik.',
  brackets: 'Nama mengandungi kurungan, contohnya nama organisasi.',
  short: 'Nama hanya satu atau dua perkataan; mungkin nama panggilan.',
  nickname: 'Nama bermula dengan gelaran panggilan.',
};

export type AmaranNama = { code: KodAmaranNama; message: string };

/** Senarai amaran untuk satu nama. Tatasusunan kosong bermakna tiada amaran. */
export function amaranNama(nama: string | null | undefined, disahkan: boolean): AmaranNama[] {
  const hasil: AmaranNama[] = [];
  const n = (nama ?? '').trim();
  if (!disahkan) hasil.push({ code: 'unconfirmed', message: MESEJ_AMARAN.unconfirmed });
  if (!n) return hasil;
  if (/[()[\]{}]/.test(n)) hasil.push({ code: 'brackets', message: MESEJ_AMARAN.brackets });
  const perkataan = n.split(/\s+/).filter(Boolean);
  if (perkataan.length <= 2) hasil.push({ code: 'short', message: MESEJ_AMARAN.short });
  if (PANGGILAN.test(n)) hasil.push({ code: 'nickname', message: MESEJ_AMARAN.nickname });
  return hasil;
}

/**
 * Jana semula PDF untuk id sijil yang diberi, dikumpul mengikut templat
 * asal setiap sijil. Hanya sijil kelas ini dan belum dibatalkan diproses.
 */
export async function janaSemulaIkutTemplat(
  svc: SupabaseClient,
  classId: string,
  ids: string[],
): Promise<{ regenerated: number; failed: number }> {
  if (ids.length === 0) return { regenerated: 0, failed: 0 };
  const { data: baris } = await svc
    .from('qm_certificates')
    .select('id, code, template_id, name_snapshot, program_snapshot, issued_at, issued_by, revoked_at')
    .eq('class_id', classId)
    .in('id', ids);
  const aktif = (baris ?? []).filter((r) => !r.revoked_at);

  const pengeluarIds = Array.from(
    new Set(aktif.map((r) => r.issued_by).filter((x): x is string => !!x)),
  );
  const namaPengeluar = new Map<string, string>();
  if (pengeluarIds.length > 0) {
    const { data: profil } = await svc
      .from('qm_profiles')
      .select('id, display_name')
      .in('id', pengeluarIds);
    for (const p of profil ?? []) {
      if (p.display_name) namaPengeluar.set(p.id, p.display_name);
    }
  }

  const ikutTemplat = new Map<string, BarisPdfSijil[]>();
  for (const r of aktif) {
    const senarai = ikutTemplat.get(r.template_id) ?? [];
    senarai.push({
      id: r.id,
      code: r.code,
      name_snapshot: r.name_snapshot,
      program_snapshot: r.program_snapshot,
      issued_at: r.issued_at,
      pengeluar: namaPengeluar.get(r.issued_by ?? ''),
    });
    ikutTemplat.set(r.template_id, senarai);
  }

  let berjaya = 0;
  let gagal = ids.length - aktif.length;
  for (const [templateId, senarai] of Array.from(ikutTemplat.entries())) {
    const template = await bacaTemplatKelas(svc, templateId, classId);
    if (!template) {
      gagal += senarai.length;
      continue;
    }
    const hasil = await janaSemulaPdfSijil(svc, template, senarai);
    for (const h of hasil) {
      if (h.pdf_path) berjaya += 1;
      else gagal += 1;
    }
  }
  return { regenerated: berjaya, failed: gagal };
}
