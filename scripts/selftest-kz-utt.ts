/**
 * Ujian sendiri KZ-UTT Fasa 1 (mod ujian Lumba Solo untuk T1, T2, T3).
 * Logik tulen sahaja: enjin klien dan pemarkahan pelayan.
 *
 * Jalankan:  npx tsx scripts/selftest-kz-utt.ts
 */
import {
  batalSoalan,
  bukaSoalan,
  ciptaKeadaanLumba,
  JAWAB_TETINGKAH_MS,
  kedudukanPemain,
  langkahLumba,
  masaPandu,
  perluSoalan,
  sambungUjian,
  SEPARUH_JALAN_M,
  tetingkahJawab,
  TREK_PANJANG_M,
  tutupSoalan,
  ujianSelesai,
  UJIAN_JAWAB_TETINGKAH_MS,
  UJIAN_LARIAN_KELUAR_MS,
  UJIAN_PEMANDUAN_MS,
  UJIAN_RUANG_PENAMAT_M,
  type InputPemandu,
} from '../src/components/solo/lumbaSoloEnjin';
import { barisTinjauan, huraiBarisTinjauan } from '../src/lib/tinjauan-solo';
import {
  kiraMata,
  nilaiTinjauanSah,
  sahkanItemTinjauan,
  sahkanTitikUkur,
  SOALAN_TETINGKAH_MS,
  tetingkahSoalan,
  UJIAN_SOALAN_TETINGKAH_MS,
} from '../src/lib/lumba-solo';

import {
  dijawab,
  hariDari,
  rujukanT3,
  sahkanPelan,
  STANDARD_SUSULAN,
  susulanPerlu,
  tetingkapT2,
  tetingkapT3,
  titikTerbuka,
  UJIAN_HAD_DIJAWAB_MS,
  type RekodPeserta,
} from '../src/lib/kajian-solo';
import { binaEmelSusulan } from '../src/lib/kajian-solo-emel';
import { bolehEksport, bolehEmel } from '../src/lib/kajian-solo-api';

let pass = 0;
let fail = 0;
function check(nama: string, ok: boolean): void {
  if (ok) {
    pass++;
    console.log('  ok  ' + nama);
  } else {
    fail++;
    console.log('GAGAL ' + nama);
  }
}

const TIADA: InputPemandu = { kiri: false, kanan: false, pecut: false, brek: false };
const PECUT_KIRI: InputPemandu = { kiri: true, kanan: false, pecut: true, brek: false };

/** Jalankan enjin selama ms dengan langkah 16 ms. */
function jalan(k: ReturnType<typeof ciptaKeadaanLumba>, ms: number, input: InputPemandu = TIADA): void {
  for (let t = 0; t < ms; t += 16) langkahLumba(k, 16, input);
}

console.log('KZ-UTT: pemalar');
check('pemanduan 8 s', UJIAN_PEMANDUAN_MS === 8000);
check('tetingkap klien 45 s', UJIAN_JAWAB_TETINGKAH_MS === 45000);
check('tetingkap pelayan sama dengan klien', UJIAN_SOALAN_TETINGKAH_MS === UJIAN_JAWAB_TETINGKAH_MS);
check('tetingkahSoalan ujian 45 s, biasa 30 s', tetingkahSoalan(true) === 45000 && tetingkahSoalan(false) === SOALAN_TETINGKAH_MS);

console.log('KZ-UTT: jadual soalan');
{
  const k = ciptaKeadaanLumba(true);
  check('ujian: tetingkahJawab 45 s', tetingkahJawab(k) === 45000);
  check('biasa: tetingkahJawab 30 s', tetingkahJawab(ciptaKeadaanLumba()) === JAWAB_TETINGKAH_MS);
  jalan(k, 7900);
  check('tiada soalan sebelum 8 s', !perluSoalan(k));
  jalan(k, 200);
  check('soalan pertama selepas 8 s', perluSoalan(k));
  bukaSoalan(k);
  jalan(k, 20000);
  tutupSoalan(k);
  jalan(k, 7900);
  check('tiada soalan sebelum 8 s selepas jawapan', !perluSoalan(k));
  jalan(k, 200);
  check('soalan kedua 8 s selepas jawapan', perluSoalan(k));
}

console.log('KZ-UTT: kereta berhenti semasa soalan');
{
  const k = ciptaKeadaanLumba(true);
  jalan(k, 8100, { ...TIADA, pecut: true });
  const lajuSebelum = k.kelajuan;
  bukaSoalan(k);
  const offsetSebelum = k.offsetM;
  jalan(k, 3000, PECUT_KIRI);
  check('kereta bergerak sebelum soalan', lajuSebelum > 30);
  check('kelajuan 0 semasa soalan', k.kelajuan === 0);
  check('stereng tiada kesan semasa soalan', k.offsetM === offsetSebelum);
  const jarak = k.jarakM;
  const offset = k.offsetM;
  jalan(k, 30000, PECUT_KIRI);
  check('tiada pergerakan selepas berhenti (jarak)', k.jarakM === jarak);
  check('tiada hanyutan semasa soalan (offset)', k.offsetM === offset);
  check('tidak terbabas semasa soalan', Math.abs(k.offsetM) <= SEPARUH_JALAN_M || k.diLuarJalan === false || Math.abs(offsetSebelum) > SEPARUH_JALAN_M);
  check('masa soalan direkod sebagai jeda', k.jedaMs >= 33000 && masaPandu(k) < k.masaMs);
}

console.log('KZ-UTT: kereta lawan tidak bergerak semasa soalan');
{
  const k = ciptaKeadaanLumba(true);
  jalan(k, 8100, { ...TIADA, pecut: true });
  bukaSoalan(k);
  const pandu = masaPandu(k);
  jalan(k, 40000);
  check('masaPandu kekal semasa soalan', Math.abs(masaPandu(k) - pandu) < 1e-6);
  check('kedudukan dikira (1 hingga 3)', [1, 2, 3].includes(kedudukanPemain(k)));
}

console.log('KZ-UTT: larian tamat ikut soalan, bukan jarak');
{
  const k = ciptaKeadaanLumba(true);
  jalan(k, 600000, { ...TIADA, pecut: true });
  check('ujian: tidak selesai di garisan penamat', !k.selesai);
  check('ujian: kereta menunggu sebelum penamat', k.jarakM <= TREK_PANJANG_M - UJIAN_RUANG_PENAMAT_M + 1e-9);
  const b = ciptaKeadaanLumba();
  jalan(b, 600000, { ...TIADA, pecut: true });
  check('biasa: masih selesai di garisan penamat', b.selesai);
}
{
  const k = ciptaKeadaanLumba(true);
  const total = 2;
  for (let i = 0; i < total; i++) {
    jalan(k, UJIAN_PEMANDUAN_MS + 100);
    check(`soalan ${i + 1} dibuka`, perluSoalan(k));
    bukaSoalan(k);
    jalan(k, 1000);
    tutupSoalan(k);
  }
  check('belum selesai sejurus soalan terakhir', !ujianSelesai(k, total));
  jalan(k, UJIAN_LARIAN_KELUAR_MS + 50);
  check('selesai selepas larian keluar 3 s', ujianSelesai(k, total));
  check('larian biasa tidak pernah ujianSelesai', !ujianSelesai(ciptaKeadaanLumba(), 0));
}

console.log('KZ-UTT: sambung dan batal');
{
  const k = ciptaKeadaanLumba(true);
  sambungUjian(k, 4);
  check('sambung: soalanKe dan soalanDijawab = 4', k.soalanKe === 4 && k.soalanDijawab === 4);
  jalan(k, UJIAN_PEMANDUAN_MS + 50);
  bukaSoalan(k);
  batalSoalan(k);
  check('batal: soalan ditutup tanpa dikira', k.soalanDibukaMs === null && k.soalanKe === 4 && k.soalanDijawab === 4);
  check('batal: menunggu 8 s sebelum cuba semula', !perluSoalan(k));
  jalan(k, UJIAN_PEMANDUAN_MS + 50);
  check('batal: dibuka semula selepas 8 s', perluSoalan(k));
}
{
  const k = ciptaKeadaanLumba(true);
  sambungUjian(k, 3);
  jalan(k, UJIAN_LARIAN_KELUAR_MS + 50);
  check('sambung dengan semua dijawab: terus selesai', ujianSelesai(k, 3));
}

console.log('KZ-UTT: pemarkahan pelayan');
check('biasa: tidak berubah (betul serta-merta 1.5x)', kiraMata(1000, 0, true) === 1500);
check('biasa: lewat 30 s = 0', kiraMata(1000, 30001, true) === 0);
check('ujian: betul pada 30 s masih dapat bonus', kiraMata(1000, 30000, true, 45000) === Math.round(1000 * (1 + 0.5 * (1 - 30000 / 45000))));
check('ujian: betul pada 45 s = 1.0x', kiraMata(1000, 45000, true, 45000) === 1000);
check('ujian: salah = 0', kiraMata(1000, 1000, false, 45000) === 0);

console.log('KZ-UTT: titik pengukuran');
check('T1, T2, T3 sah', sahkanTitikUkur('T1') === 'T1' && sahkanTitikUkur('T2') === 'T2' && sahkanTitikUkur('T3') === 'T3');
check('lain ditolak', sahkanTitikUkur('T4') === null && sahkanTitikUkur('t1') === null && sahkanTitikUkur(null) === null);

console.log('KZ-UTT Fasa 2: item tinjauan');
{
  const ok = sahkanItemTinjauan({ prompt: ' Saya boleh guna AI ', scale_min: 0, scale_max: 10, points: ['T2', 'T1', 'T1'] });
  check('item sah: teks dipangkas', ok.item?.prompt === 'Saya boleh guna AI');
  check('item sah: titik unik dan tersusun', JSON.stringify(ok.item?.points) === '["T1","T2"]');
  check('lalai titik T1,T2,T3', JSON.stringify(sahkanItemTinjauan({ prompt: 'x', scale_min: 1, scale_max: 5 }).item?.points) === '["T1","T2","T3"]');
  check('tolak teks kosong', sahkanItemTinjauan({ prompt: '  ', scale_min: 1, scale_max: 5 }).item === null);
  check('tolak scale_min 2', sahkanItemTinjauan({ prompt: 'x', scale_min: 2, scale_max: 5 }).item === null);
  check('tolak scale_max 11', sahkanItemTinjauan({ prompt: 'x', scale_min: 0, scale_max: 11 }).item === null);
  check('tolak titik T4', sahkanItemTinjauan({ prompt: 'x', scale_min: 1, scale_max: 5, points: ['T4'] }).item === null);
  check('tolak titik kosong', sahkanItemTinjauan({ prompt: 'x', scale_min: 1, scale_max: 5, points: [] }).item === null);
  const skala = { scale_min: 0, scale_max: 10 };
  check('nilai 0 dan 10 sah', nilaiTinjauanSah(skala, 0) === 0 && nilaiTinjauanSah(skala, 10) === 10);
  check('nilai 11, -1, 2.5, "3" ditolak', [11, -1, 2.5, '3', null].every((v) => nilaiTinjauanSah(skala, v) === null));

  const teks = 'code\tconstruct\tpoints\tmin\tmax\tlow\thigh\tprompt\n' +
    'MAILS_01\tMAILS\tT1 T2\t0\t10\tTidak langsung\tSangat baik\tSaya boleh mengendalikan aplikasi AI.\n' +
    '\n' +
    'PIND_01\tPEMINDAHAN\tT3\t1\t5\tTidak pernah\tSangat kerap\tSaya telah menggunakan AI dalam kerja saya.';
  const h = huraiBarisTinjauan(teks);
  check('hurai: tajuk dan baris kosong diabaikan, 2 item', h.items.length === 2 && h.errors.length === 0);
  check('hurai: titik T1 T2', JSON.stringify(h.items[0].points) === '["T1","T2"]');
  check('hurai: skala 1 hingga 5', h.items[1].scale_min === 1 && h.items[1].scale_max === 5);
  check('hurai: lajur kurang ditolak dengan nombor baris', huraiBarisTinjauan('a\tb\tT1').errors[0]?.row === 1);
  check('hurai: tiada titik ditolak', huraiBarisTinjauan('a\tb\tX\t1\t5\tl\th\tteks').errors.length === 1);
  const pergi = huraiBarisTinjauan(barisTinjauan(h.items));
  check('hurai: pergi dan balik sama', JSON.stringify(pergi.items) === JSON.stringify(h.items));
  check('hurai: hasil diterima pengesah pelayan', h.items.every((it) => sahkanItemTinjauan(it).item !== null));
}

// ------------------------------------------------------------ Fasa 4
{
  console.log('\nFasa 4: pelan pengukuran dan susulan');
  const H = 86_400_000;
  const tamat = Date.parse('2027-01-10T08:00:00Z');
  const pelan = { module1_start_at: '2027-01-05T00:00:00Z', course_end_at: new Date(tamat).toISOString(), day_length_sec: 86400 };
  const kosong: RekodPeserta = { t1Selesai: null, t2Selesai: null, t3Selesai: null, sertai: null };

  check('standard: T3 hari 80 hingga 110, peringatan 87 dan 97',
    STANDARD_SUSULAN.t3BukaHari === 80 && STANDARD_SUSULAN.t3TutupHari === 110 &&
    JSON.stringify(STANDARD_SUSULAN.t3EmelHari) === '[80,87,97]');
  const t2 = tetingkapT2(pelan)!;
  check('T2: buka pada tamat kursus, tutup 14 hari', t2.buka === tamat && t2.tutup === tamat + 14 * H);
  check('T2: tiada tamat kursus, tiada tetingkap', tetingkapT2({ ...pelan, course_end_at: null }) === null);

  const sertai = Date.parse('2027-01-01T00:00:00Z');
  const t1 = Date.parse('2027-01-05T01:00:00Z');
  const t2s = Date.parse('2027-01-10T09:00:00Z');
  check('rujukan: T2 didahulukan', rujukanT3({ ...kosong, t1Selesai: t1, t2Selesai: t2s, sertai })?.sumber === 'T2');
  check('rujukan: T1 bila tiada T2', rujukanT3({ ...kosong, t1Selesai: t1, sertai })?.sumber === 'T1');
  check('rujukan: sertai bila tiada T1 dan T2', rujukanT3({ ...kosong, sertai })?.masa === sertai);
  check('rujukan: tiada apa-apa, null', rujukanT3(kosong) === null);
  const w3 = tetingkapT3(pelan, { ...kosong, t2Selesai: t2s, sertai })!;
  check('T3: tetingkap hari 80 hingga 110 dari tamat T2', w3.buka === t2s + 80 * H && w3.tutup === t2s + 110 * H);

  const r = { ...kosong, t1Selesai: t1, sertai };
  check('T2 terbuka pada tamat kursus', titikTerbuka(pelan, r, 'T2', tamat));
  check('T2 tutup tepat hari 14', !titikTerbuka(pelan, r, 'T2', tamat + 14 * H));
  check('T3 belum terbuka hari 79', !titikTerbuka(pelan, r, 'T3', t1 + 79 * H));
  check('T3 terbuka hari 80', titikTerbuka(pelan, r, 'T3', t1 + 80 * H));
  check('T3 tutup hari 110', !titikTerbuka(pelan, r, 'T3', t1 + 110 * H));

  check('susulan: sebelum hari 1 tiada e-mel', susulanPerlu(pelan, r, tamat + 0.5 * H).length === 0);
  const s1 = susulanPerlu(pelan, r, tamat + 1 * H);
  check('susulan: hari 1 jemputan T2 seq 0', s1.length === 1 && s1[0].point === 'T2' && s1[0].seq === 0 && s1[0].refSource === 'course_end');
  const s7 = susulanPerlu(pelan, r, tamat + 8 * H);
  check('susulan: hari 8 hanya peringatan T2 seq 1 (bukan dua serentak)', s7.length === 1 && s7[0].seq === 1);
  check('susulan: T2 sudah dijawab, tiada e-mel T2',
    susulanPerlu(pelan, { ...r, t2Selesai: tamat + 2 * H }, tamat + 8 * H).every((x) => x.point !== 'T2'));
  check('susulan: selepas tetingkap T2 tutup, tiada e-mel T2', susulanPerlu(pelan, r, tamat + 15 * H).length === 0);
  const s80 = susulanPerlu(pelan, r, t1 + 80 * H);
  check('susulan: hari 80 jemputan T3 dari rujukan T1', s80.length === 1 && s80[0].point === 'T3' && s80[0].seq === 0 && s80[0].refSource === 'T1');
  check('susulan: hari 90 peringatan pertama T3', susulanPerlu(pelan, r, t1 + 90 * H)[0]?.seq === 1);
  check('susulan: hari 100 peringatan kedua T3', susulanPerlu(pelan, r, t1 + 100 * H)[0]?.seq === 2);
  check('susulan: hari 110 tiada lagi', susulanPerlu(pelan, r, t1 + 110 * H).length === 0);
  check('susulan: T3 dijawab, berhenti', susulanPerlu(pelan, { ...r, t3Selesai: t1 + 85 * H }, t1 + 90 * H).length === 0);
  const sj = susulanPerlu(pelan, { ...kosong, sertai }, sertai + 80 * H);
  check('susulan: tanpa T1/T2, T3 ikut tarikh sertai', sj.some((x) => x.point === 'T3' && x.refSource === 'join'));
  check('susulan: closesAt selepas dueAt', [s1[0], s80[0]].every((x) => x.dueAt < x.closesAt));

  const pendek = { ...pelan, day_length_sec: 60 };
  check('ujian penerimaan: sehari 60 s, T2 tutup 14 minit', tetingkapT2(pendek)!.tutup - tamat === 14 * 60_000);
  check('day_length_sec tidak sah jatuh ke 86400', tetingkapT2({ ...pelan, day_length_sec: 5 })!.tutup - tamat === 14 * H);
  check('hariDari: 1.5 hari', hariDari(pelan, 0, 1.5 * H) === 1.5);

  check('dijawab: pilihan dalam 46.5 s', dijawab('b', UJIAN_HAD_DIJAWAB_MS));
  check('dijawab: lewat ditolak', !dijawab('b', UJIAN_HAD_DIJAWAB_MS + 1));
  check('dijawab: tiada pilihan ditolak', !dijawab(null, 1000) && !dijawab('', 1000));

  check('pelan: e-mel lalai hidup tanpa teks persetujuan', sahkanPelan({}).pelan?.emails_enabled === true);
  check('pelan: false eksplisit mematikan e-mel', sahkanPelan({ emails_enabled: false }).pelan?.emails_enabled === false);
  check('persetujuan lalai: tiada baris = boleh eksport dan e-mel', bolehEksport(null) && bolehEmel(null));
  const p0 = { quiz_id: 'q', user_id: 'u', decision: 'agree' as const, consent_version: 1, decided_at: '', withdrawn_at: null, unsubscribed_at: null };
  check('persetujuan: tolak dikecualikan', !bolehEksport({ ...p0, decision: 'decline' }) && !bolehEmel({ ...p0, decision: 'decline' }));
  check('persetujuan: tarik diri dikecualikan', !bolehEksport({ ...p0, withdrawn_at: 'x' }));
  check('persetujuan: berhenti langganan masih dieksport, tiada e-mel', bolehEksport({ ...p0, unsubscribed_at: 'x' }) && !bolehEmel({ ...p0, unsubscribed_at: 'x' }));
  check('pelan: tamat sebelum Modul 1 ditolak',
    !!sahkanPelan({ module1_start_at: '2027-01-10T00:00:00Z', course_end_at: '2027-01-05T00:00:00Z' }).ralat);
  check('pelan: sehari 30 s ditolak', !!sahkanPelan({ day_length_sec: 30 }).ralat);
  const ok = sahkanPelan({
    module1_start_at: '2027-01-05T00:00:00Z',
    course_end_at: '2027-01-10T08:00:00Z',
    consent_text: '  Saya bersetuju menyertai kajian ini.  ',
    emails_enabled: true,
  });
  check('pelan sah: teks dipangkas, sehari lalai 86400',
    ok.pelan?.consent_text === 'Saya bersetuju menyertai kajian ini.' && ok.pelan?.day_length_sec === 86400 && ok.pelan.emails_enabled);

  const e = binaEmelSusulan({
    nama: 'Aminah', kursus: 'Latihan AI <b>', titik: 'T3', peringatan: true,
    pautan: 'https://kuizen.fun/solo/ABC123?titik=T3', tutup: '1 Mei 2027', pautanBerhenti: 'https://kuizen.fun/kajian/berhenti/x',
  });
  check('emel: subjek peringatan T3', e.subject.startsWith('Peringatan: Susulan selepas latihan'));
  check('emel: pautan main dan berhenti dalam teks', e.text.includes('?titik=T3') && e.text.includes('/kajian/berhenti/x'));
  check('emel: HTML di-escape', e.html.includes('Latihan AI &lt;b&gt;') && !e.html.includes('<b>'));
  check('emel: tiada em dash', !/—/.test(e.text + e.subject));
  const e2 = binaEmelSusulan({ nama: 'A', kursus: 'K', titik: 'T2', peringatan: false, pautan: 'https://x.y/a', tutup: 't', pautanBerhenti: 'https://x.y/b' });
  check('emel: jemputan T2 tanpa awalan peringatan', e2.subject === 'Penilaian selepas latihan: K');
  check('emel: tiada perkataan kajian', !/kajian/i.test(e.text + e.subject + e2.text));
}

console.log('');
console.log('LULUS: ' + pass + '  GAGAL: ' + fail);
if (fail > 0) process.exitCode = 1;
