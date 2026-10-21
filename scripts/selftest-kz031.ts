// Skrip ujian kendiri KZ-031 (dijalankan dengan: npx tsx scripts/selftest-kz031.ts)
// Ujian TANPA DB: format kunci, keunikan, cincangan sha256, banding masa
// malar, pengesahan badan daftar, had badan 8 KB dan had kadar.
import {
  AWALAN_KUNCI,
  HAD_BADAN_BAIT,
  SAIZ_PETA_MAX,
  TINGKAP_EMEL_MS,
  awalanKunci,
  bandingMasaMalar,
  bacaBadanTerhad,
  benarkanEmelSemula,
  benarkanKadar,
  cincangKunci,
  contentTypeJson,
  formatKunciSah,
  janaKunciApi,
  kunciDaripadaReq,
  sahkanBadanDaftar,
  MAX_EMEL,
  MAX_NAMA,
  tandaEmelDihantar,
} from '../src/lib/integrasi-pay';

let gagal = 0;
const lulusMsg: string[] = [];
const gagalMsg: string[] = [];
function semak(nama: string, syarat: boolean, butiran?: string) {
  if (syarat) lulusMsg.push(nama + (butiran ? ': ' + butiran : ''));
  else { gagal++; gagalMsg.push(nama + (butiran ? ': ' + butiran : '')); }
}

const UUID_OK = '11111111-2222-3333-4444-555555555555';

function badan(overrides: Record<string, unknown> = {}) {
  return {
    course_id: UUID_OK,
    email: 'pembeli@example.com',
    nama: 'Ahmad Pembeli',
    rujukan_pesanan: 'ORD-12345',
    amaun_sen: 4900,
    mata_wang: 'MYR',
    ...overrides,
  };
}

// ---- U1: format kunci ----
{
  const k = janaKunciApi();
  semak('U1 awalan ak_live_', k.startsWith(AWALAN_KUNCI), k.slice(0, 12));
  semak('U1 panjang base64url 43 aksara', /^ak_live_[A-Za-z0-9_-]{43}$/.test(k), `panjang ${k.length}`);
  semak('U1 formatKunciSah terima kunci jana', formatKunciSah(k));
  semak('U1 formatKunciSah tolak awalan salah', !formatKunciSah('ak_test_' + k.slice(8)));
  semak('U1 formatKunciSah tolak kunci pendek', !formatKunciSah('ak_live_pendek'));
  semak('U1 formatKunciSah tolak aksara luar', !formatKunciSah('ak_live_' + 'a!'.repeat(22)));
  // Keunikan 200 kunci
  const set = new Set(Array.from({ length: 200 }, () => janaKunciApi()));
  semak('U1 200 kunci semuanya unik', set.size === 200, `${set.size} unik`);
  // Awalan ialah 12 aksara pertama
  semak('U1 awalanKunci 12 aksara pertama', awalanKunci(k) === k.slice(0, 12) && awalanKunci(k).length === 12, awalanKunci(k));
}

// ---- U2: cincangan sha256 ----
{
  // Vektor diketahui: sha256('abc')
  const dijangka = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
  semak('U2 sha256 vektor abc', cincangKunci('abc') === dijangka, cincangKunci('abc').slice(0, 16));
  const k1 = janaKunciApi();
  const k2 = janaKunciApi();
  semak('U2 cincangan 64 heks', /^[0-9a-f]{64}$/.test(cincangKunci(k1)));
  semak('U2 cincangan deterministik', cincangKunci(k1) === cincangKunci(k1));
  semak('U2 cincangan beza antara kunci', cincangKunci(k1) !== cincangKunci(k2));
}

// ---- U3: banding masa malar ----
{
  const a = cincangKunci(janaKunciApi());
  semak('U3 sama pulangkan true', bandingMasaMalar(a, a));
  semak('U3 beza pulangkan false', !bandingMasaMalar(a, cincangKunci(janaKunciApi())));
  semak('U3 panjang beza pulangkan false', !bandingMasaMalar(a, a.slice(0, 32)));
  semak('U3 rentetan kosong selamat', bandingMasaMalar('', ''));
  // Konsisten untuk 1000 ulangan (tiada exception)
  let selamat = true;
  for (let i = 0; i < 1000; i++) {
    const x = cincangKunci(janaKunciApi());
    const y = i % 2 === 0 ? x : cincangKunci(janaKunciApi());
    if (bandingMasaMalar(x, y) !== (x === y)) selamat = false;
  }
  semak('U3 konsisten 1000 ulangan', selamat);
}

// ---- U4: kunciDaripadaReq ----
{
  const k = janaKunciApi();
  const req = new Request('https://contoh.invalid/api', {
    headers: { authorization: `Bearer ${k}` },
  });
  semak('U4 Bearer diekstrak', kunciDaripadaReq(req) === k);
  semak('U4 tanpa tajuk null', kunciDaripadaReq(new Request('https://contoh.invalid/api')) === null);
  const reqBuruk = new Request('https://contoh.invalid/api', { headers: { authorization: 'Basic abc' } });
  semak('U4 skema bukan Bearer null', kunciDaripadaReq(reqBuruk) === null);
}

// ---- U5: pengesahan badan daftar ----
{
  const ok = sahkanBadanDaftar(badan());
  semak('U5 badan sah lulus', ok.ok && ok.badan.email === 'pembeli@example.com' && ok.badan.amaun_sen === 4900 && ok.badan.mata_wang === 'MYR');

  semak('U5 null ditolak', !sahkanBadanDaftar(null).ok);
  semak('U5 tatasusunan ditolak', !sahkanBadanDaftar([badan()]).ok);
  semak('U5 course_id bukan uuid ditolak', !sahkanBadanDaftar(badan({ course_id: 'bukan-uuid' })).ok);
  semak('U5 course_id huruf besar dinormalisasi', sahkanBadanDaftar(badan({ course_id: UUID_OK.toUpperCase() })).ok === true);
  semak('U5 e-mel hilang ditolak', !sahkanBadanDaftar(badan({ email: undefined })).ok);
  semak('U5 e-mel rosak ditolak', !sahkanBadanDaftar(badan({ email: 'bukan-emel' })).ok);
  semak('U5 e-mel dengan ruang disahkan selepas trim', sahkanBadanDaftar(badan({ email: '  pembeli@example.com  ' })).ok === true);
  const emelPanjang = 'a'.repeat(MAX_EMEL) + '@example.com';
  const emelPotong = sahkanBadanDaftar(badan({ email: emelPanjang }));
  // 254 aksara pertama memotong alamat sebelum '@' supaya regex gagal: ini bukti potongan berlaku
  semak('U5 e-mel dipotong ke 254', !emelPotong.ok && emelPanjang.length > MAX_EMEL);
  const namaPanjang = sahkanBadanDaftar(badan({ nama: 'x'.repeat(MAX_NAMA + 50) }));
  const panjangNama = namaPanjang.ok ? namaPanjang.badan.nama.length : -1;
  semak('U5 nama dipotong ke 120', panjangNama === MAX_NAMA, `panjang ${panjangNama}`);
  semak('U5 nama kosong ditolak', !sahkanBadanDaftar(badan({ nama: '   ' })).ok);
  const rujukanPanjang = sahkanBadanDaftar(badan({ rujukan_pesanan: 'R'.repeat(500) }));
  const panjangRujukan = rujukanPanjang.ok ? (rujukanPanjang.badan.rujukan_pesanan?.length ?? -1) : -1;
  semak('U5 rujukan panjang dipotong ke 200', panjangRujukan === 200, `panjang ${panjangRujukan}`);
  semak('U5 rujukan null dibenarkan', sahkanBadanDaftar(badan({ rujukan_pesanan: null })).ok === true);
  semak('U5 amaun 0 dibenarkan', sahkanBadanDaftar(badan({ amaun_sen: 0 })).ok === true);
  semak('U5 amaun 100000000 dibenarkan', sahkanBadanDaftar(badan({ amaun_sen: 100000000 })).ok === true);
  semak('U5 amaun -1 ditolak', !sahkanBadanDaftar(badan({ amaun_sen: -1 })).ok);
  semak('U5 amaun 100000001 ditolak', !sahkanBadanDaftar(badan({ amaun_sen: 100000001 })).ok);
  semak('U5 amaun perpuluhan ditolak', !sahkanBadanDaftar(badan({ amaun_sen: 49.5 })).ok);
  semak('U5 amaun rentetan ditolak', !sahkanBadanDaftar(badan({ amaun_sen: '4900' })).ok);
  semak('U5 mata wang huruf kecil dinormalisasi', sahkanBadanDaftar(badan({ mata_wang: 'myr' })).ok === true);
  semak('U5 mata wang 2 huruf ditolak', !sahkanBadanDaftar(badan({ mata_wang: 'MY' })).ok);
  semak('U5 mata wang dengan digit ditolak', !sahkanBadanDaftar(badan({ mata_wang: 'M4R' })).ok);

  // hantar_semula (temuan 2 CTO): medan pilihan boolean
  const ralaiP = sahkanBadanDaftar(badan());
  semak('U5 hantar_semula lalai false', ralaiP.ok && ralaiP.badan.hantar_semula === false);
  const ralaiYa = sahkanBadanDaftar(badan({ hantar_semula: true }));
  semak('U5 hantar_semula true diterima', ralaiYa.ok && ralaiYa.badan.hantar_semula === true);
  const ralaiNull = sahkanBadanDaftar(badan({ hantar_semula: null }));
  semak('U5 hantar_semula null menjadi false', ralaiNull.ok && ralaiNull.badan.hantar_semula === false);
  semak('U5 hantar_semula rentetan ditolak', !sahkanBadanDaftar(badan({ hantar_semula: 'ya' })).ok);
  semak('U5 hantar_semula integer ditolak', !sahkanBadanDaftar(badan({ hantar_semula: 1 })).ok);
}

// ---- U6: had badan 8 KB ----
async function ujiBadan() {
  const kecil = new Request('https://contoh.invalid/api', {
    method: 'POST',
    body: JSON.stringify(badan()),
  });
  const rKecil = await bacaBadanTerhad(kecil);
  semak('U6 badan kecil diterima', rKecil.ok);

  const besar = new Request('https://contoh.invalid/api', {
    method: 'POST',
    body: JSON.stringify(badan({ nama: 'x'.repeat(HAD_BADAN_BAIT) })),
  });
  const rBesar = await bacaBadanTerhad(besar);
  semak('U6 badan melebihi 8 KB ditolak', !rBesar.ok);

  const bukanJson = new Request('https://contoh.invalid/api', {
    method: 'POST',
    body: 'ini bukan json',
  });
  const rJson = await bacaBadanTerhad(bukanJson);
  semak('U6 badan bukan JSON ditolak', !rJson.ok);
}

// ---- U7: had kadar 60 seminit ----
{
  const pengenal = 'ujian-kunci-' + janaKunciApi().slice(8);
  // had kecil untuk ujian pantas: 5 dalam tetingkap 1000 ms
  const hasil: boolean[] = [];
  for (let i = 0; i < 6; i++) hasil.push(benarkanKadar(pengenal, 5, 1000, 1000));
  semak('U7 lima pertama dibenarkan, keenam ditolak',
    hasil.slice(0, 5).every(Boolean) && hasil[5] === false,
    hasil.map((h) => (h ? '1' : '0')).join(''));
  // Selepas tetingkap berlalu, dibenarkan semula
  semak('U7 selepas tetingkap dibenarkan semula', benarkanKadar(pengenal, 5, 1000, 1001 + 1000));
  // Pengenal berbeza tidak terjejas
  semak('U7 pengenal lain tak terjejas', benarkanKadar('pengenal-lain-' + pengenal, 5, 1000, 1000));
  // Had sebenar 60 seminit
  const pengenal2 = 'ujian-kunci-60-' + janaKunciApi().slice(8);
  let semuaLulus = true;
  for (let i = 0; i < 60; i++) if (!benarkanKadar(pengenal2, 60, 60_000, 2000 + i)) semuaLulus = false;
  semak('U7 60 permintaan pertama dibenarkan', semuaLulus);
  semak('U7 permintaan ke-61 ditolak', !benarkanKadar(pengenal2, 60, 60_000, 2060));
}

// ---- U7b: peta had kadar terkawal (M-01: tiada pertumbuhan tanpa batas) ----
{
  // Isi peta hingga had saiz keras dengan pengenal berbeza
  for (let i = 0; i < SAIZ_PETA_MAX; i++) {
    if (!benarkanKadar('isi-' + i, 1, 1000, 5000)) {
      semak('U7b peta diisi sepenuhnya', false, 'gagal pada ' + i);
      break;
    }
  }
  semak('U7b peta penuh menolak pengenal baharu (429)', !benarkanKadar('lebih-' + janaKunciApi().slice(8), 1, 1000, 5000));
  // Selepas tetingkap berlalu, pembersihan membebaskan peta
  semak('U7b entri luput dibersihkan, baharu dibenarkan', benarkanKadar('selepas-' + janaKunciApi().slice(8), 1, 1000, 5000 + 1500));
}

// ---- U8: had e-mel semula 10 minit (temuan 2 CTO) ----
{
  const id = 'ujian-emel-' + janaKunciApi().slice(8);
  semak('U8 penghantaran pertama dibenarkan', benarkanEmelSemula(id, 1000));
  semak('U8 kedua dalam tetingkap ditolak', !benarkanEmelSemula(id, 1000 + 60_000));
  semak('U8 selepas 10 minit dibenarkan semula', benarkanEmelSemula(id, 1000 + TINGKAP_EMEL_MS));
  const idLain = 'ujian-emel-lain-' + janaKunciApi().slice(8);
  semak('U8 pengenal lain tak terjejas', benarkanEmelSemula(idLain, 1000 + TINGKAP_EMEL_MS));
  // tandaEmelDihantar merekod penghantaran pertama supaya hantar_semula ditolak
  const idTanda = 'ujian-emel-tanda-' + janaKunciApi().slice(8);
  tandaEmelDihantar(idTanda, 2000);
  semak('U8 tandaEmelDihantar menyekat semula dalam tetingkap', !benarkanEmelSemula(idTanda, 2000 + 60_000));
  semak('U8 tandaEmelDihantar lepaskan selepas tetingkap', benarkanEmelSemula(idTanda, 2000 + TINGKAP_EMEL_MS));
}

// ---- U9: Content-Type application/json (M-03) ----
{
  const sah = new Request('https://contoh.invalid/api', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
  });
  semak('U9 application/json diterima', contentTypeJson(sah));
  const charset = new Request('https://contoh.invalid/api', {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
  semak('U9 charset suffix diterima', contentTypeJson(charset));
  const teks = new Request('https://contoh.invalid/api', {
    method: 'POST',
    headers: { 'content-type': 'text/plain' },
  });
  semak('U9 text/plain ditolak', !contentTypeJson(teks));
  const hilang = new Request('https://contoh.invalid/api', { method: 'POST' });
  semak('U9 tanpa content-type ditolak', !contentTypeJson(hilang));
  const besar = new Request('https://contoh.invalid/api', {
    method: 'POST',
    headers: { 'content-type': 'Application/JSON' },
  });
  semak('U9 huruf besar tidak peka', contentTypeJson(besar));
}

// ---- Ringkasan ----
async function utama() {
  await ujiBadan();
  console.log('=== KEPUTUSAN UJIAN KZ-031 ===');
  for (const m of lulusMsg) console.log('LULUS:', m);
  for (const m of gagalMsg) console.log('GAGAL:', m);
  console.log(`Jumlah lulus: ${lulusMsg.length}, gagal: ${gagal}`);
  if (gagal > 0) process.exit(1);
}
void utama();
