/**
 * Binaan CSV peserta kelas untuk tiket V2-010.
 *
 * Logik tulen tanpa akses pangkalan data supaya boleh diuji dengan
 * `npx tsx scripts/selftest-csv-peserta.ts`. Laluan
 * /api/classes/[id]/members/export hanya mengumpul data dan memanggil
 * binaCsvPeserta di sini; formula format tidak disalin ke tempat lain.
 */

/**
 * Satu baris peserta untuk CSV. joinedAt ialah ISO timestamp atau null.
 * Medan markah (V2-013) hanya untuk baris Active: null dirawat sebagai 0.
 * Baris Invited meninggalkan kelima-lima medan kosong.
 */
export type BarisPeserta = {
  nama: string | null;
  emel: string | null;
  status: 'Active' | 'Invited';
  joinedAt: string | null;
  /** Mata aktiviti (task) daripada view qm_class_individual_scores. */
  aktiviti?: number | null;
  /** Mata Live Quiz daripada view yang sama. */
  kuizLangsung?: number | null;
  /** Jumlah pelarasan manual (boleh negatif). */
  pelarasan?: number | null;
  /** Jumlah keseluruhan (task + live + adjustment). */
  jumlah?: number | null;
  /** Kedudukan dalam kelas (seri berkongsi kedudukan). */
  kedudukan?: number | null;
};

/**
 * Petik medan CSV mengikut RFC 4180: petik hanya jika medan mengandungi
 * koma, petikan atau baris baharu; petikan dalam medan digandakan.
 */
export function petikCsv(s: string): string {
  const nilai = String(s ?? '');
  if (/[",\r\n]/.test(nilai)) {
    return '"' + nilai.replace(/"/g, '""') + '"';
  }
  return nilai;
}

/**
 * Pertahanan suntikan formula (Excel/Sheets melaksanakan sel yang bermula
 * dengan = + - @ dan lain-lain). Medan yang bermula dengan aksara berisiko
 * diawali petikan tunggal supaya dibaca sebagai teks biasa.
 */
export function lindungFormula(s: string): string {
  const nilai = String(s ?? '');
  if (/^[=+\-@\t\r]/.test(nilai)) {
    return "'" + nilai;
  }
  return nilai;
}

/**
 * Slug nama kelas untuk nama fail: ASCII huruf kecil, sengkang sahaja,
 * maksimum 40 aksara. Aksara beraksen ditanggalkan tandanya (ecole),
 * aksara bukan Latin (contoh 陈) digugurkan. Kosong pulangkan 'class'.
 */
export function slugFail(nama: string): string {
  const asas = String(nama ?? '')
    // Runtuhkan aksara beraksen kepada bentuk asas sebelum menapis.
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
  return asas || 'class';
}

/** Tarikh ISO kepada YYYY-MM-DD dalam zon Asia/Kuala_Lumpur, atau kosong. */
export function tarikhKl(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  // en-CA menghasilkan format YYYY-MM-DD secara langsung.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kuala_Lumpur',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/**
 * Medan markah sebagai teks CSV: nombor bulat tanpa pemisah ribuan supaya
 * Excel membacanya sebagai nombor; nilai null atau tidak sah menjadi 0.
 * Dipanggil untuk baris Active sahaja (baris Invited kekal kosong).
 */
function mataCsv(v: number | null | undefined): string {
  return typeof v === 'number' && Number.isFinite(v) ? String(Math.trunc(v)) : '0';
}

/**
 * Bina kandungan CSV penuh: BOM UTF-8, baris tajuk, kemudian baris peserta.
 * Susunan: Active dahulu mengikut nama (tidak peka huruf), kemudian Invited
 * mengikut emel. Pemisah CRLF supaya Excel Windows betul-betul selesa.
 * Lajur V2-013 selepas Joined: Activities, Live Quiz, Adjustments, Total,
 * Rank; baris Invited meninggalkan kelima-lima lajur itu kosong.
 */
export function binaCsvPeserta(baris: BarisPeserta[]): string {
  const susun = [...baris].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'Active' ? -1 : 1;
    const ka = (a.status === 'Active' ? (a.nama ?? '') : (a.emel ?? '')).toLowerCase();
    const kb = (b.status === 'Active' ? (b.nama ?? '') : (b.emel ?? '')).toLowerCase();
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });

  const barisTeks = susun.map((b) => {
    const nama = b.nama == null ? '' : lindungFormula(b.nama);
    const emel = b.emel == null ? '' : lindungFormula(b.emel);
    const joined = b.status === 'Active' ? tarikhKl(b.joinedAt) : '';
    const aktif = b.status === 'Active';
    return [
      petikCsv(nama),
      petikCsv(emel),
      petikCsv(b.status),
      petikCsv(joined),
      aktif ? mataCsv(b.aktiviti) : '',
      aktif ? mataCsv(b.kuizLangsung) : '',
      aktif ? mataCsv(b.pelarasan) : '',
      aktif ? mataCsv(b.jumlah) : '',
      aktif ? mataCsv(b.kedudukan) : '',
    ].join(',');
  });

  const tajuk = 'Name,Email,Status,Joined,Activities,Live Quiz,Adjustments,Total,Rank';
  const badan = [tajuk, ...barisTeks].join('\r\n') + '\r\n';
  // BOM di awal: tanpanya Excel di Windows baca fail sebagai ANSI dan
  // merosakkan nama Melayu/Cina/Tamil.
  return '\uFEFF' + badan;
}
