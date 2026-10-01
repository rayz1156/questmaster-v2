/**
 * Ujian logik V2-016b: medan isian sijil (src/lib/sijil/medan.ts).
 *
 * Jalankan: npx tsx scripts/selftest-medan-sijil.ts
 *
 * Fungsi tulen sahaja: format tarikh BM semua kes, tarikh tidak sah,
 * panjang medan, kunci asing dan idempoten. Tiada pangkalan data.
 */
import {
  normaliseMedan,
  formatJulatTarikhBm,
  barisButiran,
  tarikhIsoSah,
} from '../src/lib/sijil/medan';

let gagal = 0;

function semak(k: string, ok: boolean, detail: string) {
  if (ok) {
    console.log(`LULUS ${k}: ${detail}`);
  } else {
    gagal += 1;
    console.log(`GAGAL ${k}: ${detail}`);
  }
}

function main() {
  // ------------------------------------------------------------------
  // 1-5: formatJulatTarikhBm, semua kes
  // ------------------------------------------------------------------
  semak('1-satu-hari', formatJulatTarikhBm('2026-10-01') === '1 Oktober 2026',
    `satu hari: "${formatJulatTarikhBm('2026-10-01')}"`);
  semak('2-end-sama', formatJulatTarikhBm('2026-10-01', '2026-10-01') === '1 Oktober 2026',
    'date_end sama date_start dicetak sebagai satu hari');
  semak('3-bulan-sama', formatJulatTarikhBm('2026-10-01', '2026-10-03') === '1 hingga 3 Oktober 2026',
    `bulan sama: "${formatJulatTarikhBm('2026-10-01', '2026-10-03')}"`);
  semak('4-bulan-beza', formatJulatTarikhBm('2026-09-30', '2026-10-02') === '30 September hingga 2 Oktober 2026',
    `bulan berbeza: "${formatJulatTarikhBm('2026-09-30', '2026-10-02')}"`);
  semak('5-tahun-beza',
    formatJulatTarikhBm('2026-12-30', '2027-01-02') === '30 Disember 2026 hingga 2 Januari 2027',
    `tahun berbeza: "${formatJulatTarikhBm('2026-12-30', '2027-01-02')}"`);

  // ------------------------------------------------------------------
  // 6-8: tarikh tidak sah
  // ------------------------------------------------------------------
  semak('6-30-februari', !tarikhIsoSah('2026-02-30'), '2026-02-30 tidak wujud dalam kalendar');
  semak('7-bulan-13', !tarikhIsoSah('2026-13-01'), 'bulan 13 tidak sah');
  semak('8-bentuk-salah', !tarikhIsoSah('01-10-2026') && !tarikhIsoSah('2026/10/01'),
    'bentuk bukan YYYY-MM-DD ditolak');

  // ------------------------------------------------------------------
  // 9-11: normaliseMedan tarikh
  // ------------------------------------------------------------------
  const n1 = normaliseMedan({
    course: 'Bengkel Robotik',
    date_start: '2026-02-30',
    date_end: '2026-10-01',
    location: 'Dewan A',
  });
  semak('9-tarikh-tak-sah-dibuang',
    n1.date_start === undefined && n1.date_end === undefined,
    'date_start tidak sah dibuang; date_end tanpa start juga dibuang');
  const n2 = normaliseMedan({ date_start: '2026-10-05', date_end: '2026-10-01' });
  semak('10-end-awal-dibuang', n2.date_start === '2026-10-05' && n2.date_end === undefined,
    'date_end lebih awal daripada date_start dibuang');
  const n3 = normaliseMedan({ date_start: '2026-10-01', date_end: '2026-10-03' });
  semak('11-julat-sah', n3.date_start === '2026-10-01' && n3.date_end === '2026-10-03',
    'julan sah dikekalkan');

  // ------------------------------------------------------------------
  // 12-14: panjang dan pemangkasan
  // ------------------------------------------------------------------
  const n4 = normaliseMedan({
    course: 'x'.repeat(500),
    location: 'y'.repeat(500),
    signer_name: 'z'.repeat(500),
    signer_title: 'w'.repeat(500),
  });
  semak('12-panjang-medan',
    (n4.course ?? '').length === 160 && (n4.location ?? '').length === 120
      && (n4.signer_name ?? '').length === 100 && (n4.signer_title ?? '').length === 120,
    `course ${n4.course?.length} (160), location ${n4.location?.length} (120), ` +
    `signer_name ${n4.signer_name?.length} (100), signer_title ${n4.signer_title?.length} (120)`);
  const n5 = normaliseMedan({ course: '   Bengkel Robotik   ' });
  semak('13-trim', n5.course === 'Bengkel Robotik', 'ruang tepi dibuang');
  const n6 = normaliseMedan({ course: '   ', location: '', signer_name: '   \t ' });
  semak('14-kosong-dibuang',
    n6.course === undefined && n6.location === undefined && n6.signer_name === undefined,
    'rentetan kosong atau ruang sahaja dibuang sepenuhnya');

  // ------------------------------------------------------------------
  // 15-17: kunci asing, jenis salah, input jahat
  // ------------------------------------------------------------------
  const n7 = normaliseMedan({ hantu: 'x', course: 'A', nombor: 42, tarikh: '2026-10-01' });
  semak('15-kunci-asing',
    !('hantu' in n7) && !('nombor' in n7) && !('tarikh' in n7) && n7.course === 'A',
    'kunci asing dibuang, hanya course kekal');
  const n8 = normaliseMedan({ course: 42, location: true, signer_name: null });
  semak('16-jenis-salah',
    n8.course === undefined && n8.location === undefined && n8.signer_name === undefined,
    'nilai bukan rentetan diabaikan');
  const jahat = [normaliseMedan(null), normaliseMedan([1, 2]), normaliseMedan('x'), normaliseMedan(42)];
  semak('17-input-jahat',
    jahat.every((h) => Object.keys(h).length === 0),
    'null / array / rentetan / nombor -> objek kosong');

  // ------------------------------------------------------------------
  // 18: idempoten
  // ------------------------------------------------------------------
  const sekali = normaliseMedan({
    course: 'Bengkel Robotik',
    date_start: '2026-10-01',
    date_end: '2026-10-03',
    location: 'Dewan Kuliah FKMT, UPSI',
    signer_name: 'Dr Hariz',
    signer_title: 'Pensyarah',
  });
  semak('18-idempoten',
    JSON.stringify(normaliseMedan(sekali)) === JSON.stringify(sekali),
    'normalkan dua kali = sama hasil');

  // ------------------------------------------------------------------
  // 19-22: barisButiran
  // ------------------------------------------------------------------
  semak('19-butiran-penuh',
    barisButiran(sekali) === '1 hingga 3 Oktober 2026 | Dewan Kuliah FKMT, UPSI',
    `tarikh dan tempat: "${barisButiran(sekali)}"`);
  semak('20-butiran-tarikh-sahaja',
    barisButiran({ date_start: '2026-10-01' }) === '1 Oktober 2026',
    'tarikh sahaja tanpa tempat');
  semak('21-butiran-tempat-sahaja',
    barisButiran({ location: 'Dewan A' }) === 'Dewan A',
    'tempat sahaja tanpa tarikh');
  semak('22-butiran-kosong', barisButiran({}) === null,
    'tiada tarikh dan tiada tempat -> null (tidak dicetak)');

  if (gagal > 0) {
    console.log(`\n${gagal} semakan GAGAL`);
    process.exit(1);
  }
  console.log('\nSemua semakan LULUS.');
}

main();
