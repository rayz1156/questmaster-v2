/**
 * KZ-UTT Fasa 4: logik tulen pelan pengukuran T1, T2, T3.
 *
 * SATU tempat sahaja untuk tetingkap dan jadual e-mel susulan. Laluan
 * /api/solo/[code]/start (titik ikut tetingkap peserta), perancang setiap
 * jam (src/lib/kajian-solo-perancang.ts), pekerja e-mel dan eksport CSV
 * semuanya memanggil fungsi di sini. Jangan salin formula ke tempat lain.
 *
 * Tiada import Node: fail ini juga dipakai oleh komponen klien untuk
 * memaparkan tarikh.
 *
 * Nilai STANDARD v1 (tiket claude/tiket-kz-ujian-tiga-titik.md):
 *   - T2 dibuka pada masa tamat kursus, ditutup 14 hari kemudian.
 *     Jemputan pada hari 1, satu peringatan pada hari 7.
 *   - T3 pada hari 90 selepas tarikh rujukan, tetingkap hari 80 hingga 110.
 *     Jemputan hari 80, peringatan hari 87 dan 97.
 *   - Tarikh rujukan T3: tamat T2, jika tiada tamat T1, jika tiada tarikh
 *     sertai kelas.
 * "Hari" ialah pelan.day_length_sec saat (86400 sebenar; lebih pendek hanya
 * untuk ujian penerimaan).
 */

export const STANDARD_SUSULAN = {
  t2TutupHari: 14,
  t2EmelHari: [1, 7],
  t3BukaHari: 80,
  t3TutupHari: 110,
  t3EmelHari: [80, 87, 97],
} as const;

export type PelanUkur = {
  module1_start_at: string | null;
  course_end_at: string | null;
  day_length_sec: number;
};

/** Rekod peserta yang menentukan tetingkap (ms epoch, null jika tiada). */
export type RekodPeserta = {
  t1Selesai: number | null;
  t2Selesai: number | null;
  t3Selesai: number | null;
  sertai: number | null;
};

export type SumberRujukan = 'course_end' | 'T2' | 'T1' | 'join';

export type Tetingkap = { buka: number; tutup: number };

export type ItemSusulan = {
  point: 'T2' | 'T3';
  seq: number;
  refSource: SumberRujukan;
  refAt: number;
  dueAt: number;
  closesAt: number;
};

function hariMs(pelan: PelanUkur): number {
  const s = Number(pelan.day_length_sec);
  return (Number.isFinite(s) && s >= 60 && s <= 86400 ? s : 86400) * 1000;
}

function masa(t: string | null): number | null {
  if (!t) return null;
  const n = Date.parse(t);
  return Number.isFinite(n) ? n : null;
}

/** Tetingkap T2: dari masa tamat kursus hingga 14 hari kemudian. */
export function tetingkapT2(pelan: PelanUkur): Tetingkap | null {
  const tamat = masa(pelan.course_end_at);
  if (tamat === null) return null;
  return { buka: tamat, tutup: tamat + STANDARD_SUSULAN.t2TutupHari * hariMs(pelan) };
}

/** Tarikh rujukan T3: tamat T2, kemudian tamat T1, kemudian tarikh sertai. */
export function rujukanT3(r: RekodPeserta): { sumber: SumberRujukan; masa: number } | null {
  if (r.t2Selesai !== null) return { sumber: 'T2', masa: r.t2Selesai };
  if (r.t1Selesai !== null) return { sumber: 'T1', masa: r.t1Selesai };
  if (r.sertai !== null) return { sumber: 'join', masa: r.sertai };
  return null;
}

/** Tetingkap T3: hari 80 hingga 110 selepas tarikh rujukan. */
export function tetingkapT3(pelan: PelanUkur, r: RekodPeserta): (Tetingkap & { sumber: SumberRujukan; rujukan: number }) | null {
  const ruj = rujukanT3(r);
  if (!ruj) return null;
  const d = hariMs(pelan);
  return {
    buka: ruj.masa + STANDARD_SUSULAN.t3BukaHari * d,
    tutup: ruj.masa + STANDARD_SUSULAN.t3TutupHari * d,
    sumber: ruj.sumber,
    rujukan: ruj.masa,
  };
}

/** Adakah titik ini terbuka untuk peserta ini sekarang? (T1 tidak di sini; Fasa 3.) */
export function titikTerbuka(pelan: PelanUkur, r: RekodPeserta, titik: 'T2' | 'T3', sekarang: number): boolean {
  const t = titik === 'T2' ? tetingkapT2(pelan) : tetingkapT3(pelan, r);
  return !!t && sekarang >= t.buka && sekarang < t.tutup;
}

/**
 * E-mel susulan yang patut sudah dihantar sekarang. Bagi setiap titik,
 * HANYA urutan tertinggi yang sudah tiba dipulangkan: jika perancang
 * terhenti beberapa hari, peserta menerima satu e-mel, bukan beberapa
 * serentak. Titik yang sudah dijawab atau tetingkapnya sudah tutup tidak
 * menghasilkan apa-apa. Penolakan pendua dibuat oleh kekangan unik DB.
 */
export function susulanPerlu(pelan: PelanUkur, r: RekodPeserta, sekarang: number): ItemSusulan[] {
  const d = hariMs(pelan);
  const hasil: ItemSusulan[] = [];

  const t2 = tetingkapT2(pelan);
  if (t2 && r.t2Selesai === null && sekarang < t2.tutup) {
    let pilih: ItemSusulan | null = null;
    for (let seq = 0; seq < STANDARD_SUSULAN.t2EmelHari.length; seq += 1) {
      const due = t2.buka + STANDARD_SUSULAN.t2EmelHari[seq] * d;
      if (due <= sekarang) {
        pilih = { point: 'T2', seq, refSource: 'course_end', refAt: t2.buka, dueAt: due, closesAt: t2.tutup };
      }
    }
    if (pilih) hasil.push(pilih);
  }

  const t3 = tetingkapT3(pelan, r);
  if (t3 && r.t3Selesai === null && sekarang < t3.tutup) {
    let pilih: ItemSusulan | null = null;
    for (let seq = 0; seq < STANDARD_SUSULAN.t3EmelHari.length; seq += 1) {
      const due = t3.rujukan + STANDARD_SUSULAN.t3EmelHari[seq] * d;
      if (due <= sekarang) {
        pilih = { point: 'T3', seq, refSource: t3.sumber, refAt: t3.rujukan, dueAt: due, closesAt: t3.tutup };
      }
    }
    if (pilih) hasil.push(pilih);
  }

  return hasil;
}

/** Hari (perpuluhan 2 tempat) dari tarikh rujukan, untuk eksport. */
export function hariDari(pelan: PelanUkur, dari: number, ke: number): number {
  return Math.round(((ke - dari) / hariMs(pelan)) * 100) / 100;
}

/** Sahkan badan PUT pelan. Memulangkan medan bersih atau ralat (English, dipapar klien). */
export function sahkanPelan(raw: unknown): {
  pelan?: {
    module1_start_at: string | null;
    course_end_at: string | null;
    emails_enabled: boolean;
    consent_text: string | null;
    day_length_sec: number;
  };
  ralat?: string;
} {
  const b = (raw ?? {}) as Record<string, unknown>;
  const tarikh = (v: unknown, nama: string): { ok: boolean; nilai: string | null; ralat?: string } => {
    if (v === null || v === undefined || v === '') return { ok: true, nilai: null };
    if (typeof v !== 'string' || !Number.isFinite(Date.parse(v))) {
      return { ok: false, nilai: null, ralat: `${nama} must be a valid date and time.` };
    }
    return { ok: true, nilai: new Date(Date.parse(v)).toISOString() };
  };
  const m1 = tarikh(b.module1_start_at, 'Module 1 start');
  if (!m1.ok) return { ralat: m1.ralat };
  const tamat = tarikh(b.course_end_at, 'Course end');
  if (!tamat.ok) return { ralat: tamat.ralat };
  if (m1.nilai && tamat.nilai && Date.parse(m1.nilai) >= Date.parse(tamat.nilai)) {
    return { ralat: 'Course end must be after Module 1 start.' };
  }
  let teks: string | null = null;
  if (typeof b.consent_text === 'string' && b.consent_text.trim()) {
    teks = b.consent_text.trim();
    if (teks.length < 20 || teks.length > 5000) {
      return { ralat: 'Consent text must be 20 to 5000 characters.' };
    }
  }
  // Lalai hidup (keputusan Boss Hariz, 28 Nov 2026); hanya false eksplisit mematikan.
  const emel = b.emails_enabled !== false;
  let hari = 86400;
  if (b.day_length_sec !== undefined && b.day_length_sec !== null) {
    hari = Number(b.day_length_sec);
    if (!Number.isInteger(hari) || hari < 60 || hari > 86400) {
      return { ralat: 'Day length must be a whole number from 60 to 86400 seconds.' };
    }
  }
  return {
    pelan: {
      module1_start_at: m1.nilai,
      course_end_at: tamat.nilai,
      emails_enabled: emel,
      consent_text: teks,
      day_length_sec: hari,
    },
  };
}

/** Tetingkap pelayan mod ujian: 45 s dan kelonggaran rangkaian 1.5 s (sama dengan laluan answer). */
export const UJIAN_HAD_DIJAWAB_MS = 45_000 + 1_500;

/** Soalan dikira dijawab jika ada pilihan dan masuk dalam tetingkap pelayan. */
export function dijawab(choice: string | null | undefined, ms: number | null | undefined): boolean {
  return !!choice && typeof ms === 'number' && Number.isFinite(ms) && ms <= UJIAN_HAD_DIJAWAB_MS;
}

export const LAJUR_EKSPORT = [
  'participant',
  'point',
  'mode',
  'run_started_at',
  'run_finished_at',
  'run_status',
  'ref_source',
  'days_from_ref',
  'item_type',
  'item',
  'position',
  'construct',
  'correct',
  'answered',
  'ms',
  'value',
] as const;
