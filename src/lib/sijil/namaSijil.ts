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

export type KodAmaranNama =
  | 'unconfirmed'
  | 'brackets'
  | 'short'
  | 'nickname'
  | 'deleted'
  | 'organization'
  | 'has_digits_or_underscore'
  | 'duplicate';

/** Gelaran panggilan biasa yang jarang muncul pada nama rasmi. */
const PANGGILAN = /^(bro|sis|kak|akak|abg|abang|adik|dik|cik|kakak|bang|mak|pak|uncle|auntie|aunty|cikgu|ustaz|ustazah|mr|mrs|ms|miss)\b\.?/i;

const MESEJ_AMARAN: Record<KodAmaranNama, string> = {
  unconfirmed: 'Nama belum disahkan oleh peserta atau pendidik.',
  brackets: 'Nama mengandungi kurungan, contohnya nama organisasi.',
  short: 'Nama hanya satu atau dua perkataan; mungkin nama panggilan.',
  nickname: 'Nama bermula dengan gelaran panggilan.',
  deleted: 'Akaun telah dipadam.',
  organization: 'Nama kelihatan seperti akaun organisasi, bukan individu.',
  has_digits_or_underscore: 'Nama mengandungi nombor atau garis bawah.',
  duplicate: 'Kemungkinan pendua: nama atau e-mel sama dengan peserta lain dalam kelas ini.',
};

/** Awalan nama yang lazim bagi akaun organisasi (KZ-E). */
const ORGANISASI = /^(ppk|ppd|jpn|jabatan|pejabat|bahagian|unit|sekolah|sk|smk|kolej|universiti|majlis|lembaga|kementerian|syarikat|persatuan|lpp|kemas|jkm|pusat)\b/i;

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
  if (/^\[deleted\]/i.test(n)) hasil.push({ code: 'deleted', message: MESEJ_AMARAN.deleted });
  if (/[0-9_]/.test(n)) hasil.push({ code: 'has_digits_or_underscore', message: MESEJ_AMARAN.has_digits_or_underscore });
  if (ORGANISASI.test(n) && !/\b(bin|binti|bt|bte|a\/l|a\/p)\b/i.test(n)) {
    hasil.push({ code: 'organization', message: MESEJ_AMARAN.organization });
  }
  return hasil;
}

/** Akaun dipadam: nama bermula "[Deleted]". */
export function akaunDipadam(nama: string | null | undefined): boolean {
  return /^\s*\[deleted\]/i.test(nama ?? '');
}

// Bendera 'u' melalui konstruktor (sasaran tsconfig ES5).
const BUKAN_HURUF = new RegExp('[^\\p{L}\\s/]', 'gu');

/** Huruf sahaja, huruf kecil, tanpa kandungan kurungan dan tanda "[Deleted]". */
function hurufSahaja(nama: string): string {
  return nama
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[deleted\]/g, ' ')
    .replace(BUKAN_HURUF, ' ');
}

const RE_BIN = /\b(bin|binti|bt|bte|a\/l|a\/p)\b/;

/**
 * Kunci pendua bagi satu nama (KZ-E):
 *   penuh: semua huruf tanpa ruang dan tanpa perkataan bin/binti,
 *     jadi "SITI MARYANI BINTI MOKHTAR (LPP-JOHOR)" = "sitimaryani mokhtar".
 *   diri: nama sebelum bin/binti (hanya bagi nama yang ada bin/binti),
 *     dipadankan dengan "penuh" nama yang TIADA bin/binti, jadi
 *     "Siti Noor Fatinhana" = "Siti Noor Fatinhana binti jabar", tetapi dua
 *     nama "Muhammad Ali bin ..." yang berbeza bapa tidak dianggap sama.
 */
export function kunciPendua(nama: string): { penuh: string; diri: string | null; adaBin: boolean } {
  const h = hurufSahaja(nama);
  const adaBin = RE_BIN.test(h);
  const penuh = h.replace(new RegExp(RE_BIN.source, 'g'), ' ').replace(/[\s/]+/g, '');
  const diri = adaBin ? h.split(RE_BIN)[0].replace(/[\s/]+/g, '') : null;
  return { penuh, diri, adaBin };
}

/** Kekal untuk keserasian: kunci penuh. */
export function namaTernormal(nama: string): string {
  return kunciPendua(nama).penuh;
}

/**
 * Tanda pendua dalam satu kelas: e-mel sama, atau kunci nama sepadan
 * (lihat kunciPendua). Pulangkan set participant_id yang berpendua.
 */
export function cariPendua(senarai: { participant_id: string; nama: string | null; email?: string | null }[]): Set<string> {
  const k = senarai.map((p) => ({ id: p.participant_id, e: p.email?.trim().toLowerCase() || null, ...kunciPendua(p.nama ?? '') }));
  const hasil = new Set<string>();
  for (let i = 0; i < k.length; i += 1) {
    for (let j = i + 1; j < k.length; j += 1) {
      const a = k[i];
      const b = k[j];
      const sama =
        (a.e && a.e === b.e) ||
        (a.penuh.length >= 4 && a.penuh === b.penuh) ||
        (a.diri && !b.adaBin && a.diri.length >= 6 && a.diri === b.penuh) ||
        (b.diri && !a.adaBin && b.diri.length >= 6 && b.diri === a.penuh);
      if (sama) {
        hasil.add(a.id);
        hasil.add(b.id);
      }
    }
  }
  return hasil;
}

/** Gabung amaran individu dan pendua untuk satu senarai. */
export function amaranSenarai(
  senarai: { participant_id: string; nama: string | null; disahkan: boolean; email?: string | null }[],
): Map<string, AmaranNama[]> {
  const pendua = cariPendua(senarai);
  const out = new Map<string, AmaranNama[]>();
  for (const p of senarai) {
    const a = amaranNama(p.nama, p.disahkan);
    if (pendua.has(p.participant_id)) a.push({ code: 'duplicate', message: MESEJ_AMARAN.duplicate });
    out.set(p.participant_id, a);
  }
  return out;
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
