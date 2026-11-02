/**
 * Ujian sendiri KZ-036: bersihkanCadangan (pembersihan keluaran AI untuk
 * cadangan item LNA) dan PROMPT_CADANGAN_LNA.
 *
 * Jalankan:  npx tsx scripts/selftest-kz036.ts
 *
 * npx tsc tidak menyemak kelakianya; pembersihan ini ialah benteng
 * pertahanan suntikan prompt dan sampah model, jadi diuji di sini.
 */
import { PROMPT_CADANGAN_LNA, bersihkanCadangan } from '../src/lib/lnaCadangan';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) {
    pass++;
    console.log('PASS ' + name);
  } else {
    fail++;
    console.log('FAIL ' + name + ' :: ' + JSON.stringify(extra));
  }
}

function main(): void {
  /* ===== 1. JSON bersih ===== */
  const r1 = bersihkanCadangan('{"items": ["Saya boleh membaca", "Saya boleh menulis"]}');
  check('json bersih: dua item',
    r1.items.length === 2 && r1.items[0] === 'Saya boleh membaca', r1);
  check('json bersih: tiada amaran', r1.amaran.length === 0, r1.amaran);

  /* ===== 2. JSON berbalut ayat dan blok kod ===== */
  const r2 = bersihkanCadangan(
    'Baik, ini cadangannya:\n```json\n{"items": ["Saya boleh mengira"]}\n```\nSemoga membantu.',
  );
  check('blok kod json: satu item', r2.items.length === 1 && r2.items[0] === 'Saya boleh mengira', r2);
  const r2b = bersihkanCadangan('Jawapan: {"items": ["Saya boleh menyaring"]} harap membantu.');
  check('json dalam ayat: satu item', r2b.items.length === 1 && r2b.items[0] === 'Saya boleh menyaring', r2b);

  /* ===== 3. Bullet dan nombor dibuang ===== */
  const r3 = bersihkanCadangan(
    '{"items": ["- Saya boleh a", "* Saya boleh b", "1. Saya boleh c", "1) Saya boleh d"]}',
  );
  check('awalan bullet dan nombor dibuang',
    JSON.stringify(r3.items) === JSON.stringify(
      ['Saya boleh a', 'Saya boleh b', 'Saya boleh c', 'Saya boleh d'],
    ),
    r3.items);

  /* ===== 4. Pendua tidak sensitif huruf ===== */
  const r4 = bersihkanCadangan(
    '{"items": ["Saya boleh membaca peta", "saya boleh membaca peta", "SAYA BOLEH MEMBACA PETA"]}',
  );
  check('pendua beza huruf dibuang', r4.items.length === 1, r4.items);

  /* ===== 5. Item terlalu panjang dibuang ===== */
  const panjang = 'Saya boleh ' + 'a'.repeat(195);
  const r5 = bersihkanCadangan('{"items": ["' + panjang + '", "Saya boleh singkat"]}');
  check('item lebih 200 aksara dibuang',
    r5.items.length === 1 && r5.items[0] === 'Saya boleh singkat', r5.items);

  /* ===== 6. Had 12 item ===== */
  let banyak = '';
  for (let i = 1; i <= 15; i += 1) {
    banyak += '"Saya boleh kemahiran ' + String(i) + '"' + (i < 15 ? ',' : '');
  }
  const r6 = bersihkanCadangan('{"items": [' + banyak + ']}');
  check('lebih 12 item dipotong pada 12', r6.items.length === 12, r6.items.length);
  check('12 item pertama yang diambil',
    r6.items[0] === 'Saya boleh kemahiran 1' && r6.items[11] === 'Saya boleh kemahiran 12',
    r6.items);

  /* ===== 7. Item tanpa "Saya boleh" kekal tetapi beramaran ===== */
  const r7 = bersihkanCadangan('{"items": ["Saya boleh membaca", "Menghafal rajah"]}');
  check('item tanpa awalan dikekalkan',
    r7.items.length === 2 && r7.items[1] === 'Menghafal rajah', r7.items);
  check('amaran dikeluarkan untuk item tanpa awalan',
    r7.amaran.length === 1 && r7.amaran[0].includes('tidak bermula'), r7.amaran);
  check('tiada amaran bila semua berawalan',
    bersihkanCadangan('{"items": ["Saya boleh x", "Saya boleh y"]}').amaran.length === 0);

  /* ===== 8. JSON rosak ===== */
  check('json rosak: items kosong',
    bersihkanCadangan('{"items": ["patah').items.length === 0);
  check('tiada objek json: items kosong',
    bersihkanCadangan('Saya tidak faham arahan itu.').items.length === 0);
  check('rentetan kosong: items kosong', bersihkanCadangan('').items.length === 0);
  check('null pengendalian: items kosong',
    bersihkanCadangan(undefined as unknown as string).items.length === 0);

  /* ===== 9. items bukan tatasusunan ===== */
  check('items rentetan: items kosong',
    bersihkanCadangan('{"items": "Saya boleh satu"}').items.length === 0);
  check('items nombor: items kosong', bersihkanCadangan('{"items": 5}').items.length === 0);
  check('tiada kunci items: items kosong', bersihkanCadangan('{"a": [1]}').items.length === 0);
  check('elemen bukan rentetan dilangkau',
    bersihkanCadangan('{"items": [5, "Saya boleh w"]}')
      .items.length === 1, bersihkanCadangan('{"items": [5, "Saya boleh w"]}'));

  /* ===== 10. Petikan di hujung dibuang, ruang dimampatkan ===== */
  const r10 = bersihkanCadangan('{"items": ["1. Saya boleh  menulis  esei"]}');
  check('awalan nombor, petikan hujung dan ruang dimampatkan',
    r10.items.length === 1 && r10.items[0] === 'Saya boleh menulis esei', r10.items);
  const r10b = bersihkanCadangan('{"items": ["Saya boleh membaca"]}');
  check('petikan di hujung dibuang',
    r10b.items[0] === 'Saya boleh membaca', r10b.items);

  /* ===== 11. Item kosong dibuang ===== */
  const r11 = bersihkanCadangan('{"items": ["", "   ", "Saya boleh b"]}');
  check('item kosong dibuang', r11.items.length === 1 && r11.items[0] === 'Saya boleh b', r11.items);

  /* ===== 12. PROMPT_CADANGAN_LNA ===== */
  check('prompt menyebut "Saya boleh"', PROMPT_CADANGAN_LNA.includes('Saya boleh'));
  check('prompt menyebut had 12 dan 120 aksara',
    PROMPT_CADANGAN_LNA.includes('8 hingga 12') && PROMPT_CADANGAN_LNA.includes('maksimum 120 aksara'));
  check('prompt menahan suntikan',
    PROMPT_CADANGAN_LNA.includes('tidak boleh mengubah peraturan ini'));
  check('prompt menyebut BM baku',
    PROMPT_CADANGAN_LNA.includes('Bahasa Melayu baku Malaysia'));

  console.log('\n' + pass + ' lulus, ' + fail + ' gagal');
  if (fail > 0) process.exit(1);
}

main();
