/**
 * Ujian sendiri untuk sekatan video KZ-039 yang tidak menyentuh pangkalan data:
 * fungsi tulen failVideo() dan pintu YouTube parseYouTubeId().
 *
 * Jalankan:  npx tsx scripts/selftest-kz039.ts
 *
 * Kenapa fail ini wujud: `npx tsc` dan `npm run build` tidak menyemak logik.
 * Sekatan video ialah keputusan Boss yang muktamad, dan pintu pintasan (MIME
 * palsu, huruf besar, sambungan berganda) hanya kelihatan apabila fungsi
 * benar-benar dipanggil dengan input yang bermusuhan.
 */
import { failVideo, MESEJ_SEKAT_VIDEO } from '../src/lib/sekatVideo';
import { parseYouTubeId } from '../src/lib/video-embed';

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

/* ===== Bahagian 1: failVideo ===== */

// MIME video -> benar (sekat), walau bagaimana nama failnya.
check('mime video/mp4', failVideo('klip.mp4', 'video/mp4') === true);
check('mime video/webm', failVideo('klip.webm', 'video/webm') === true);
check('mime video huruf besar', failVideo('klip.bin', 'VIDEO/MP4') === true);
check('mime video dengan parameter', failVideo('klip', 'video/mp4; charset=utf-8') === true);
check('mime video nama tanpa sambungan', failVideo('notanama', 'video/quicktime') === true);
check('mime video nama pdf', failVideo('dok.pdf', 'video/mp4') === true);

// Sambungan video dengan MIME octet-stream (MIME dipalsukan) -> benar.
check('mp4 dengan octet-stream', failVideo('klip.mp4', 'application/octet-stream') === true);
check('MOV huruf besar dengan octet-stream', failVideo('KLIP.MOV', 'application/octet-stream') === true);
check('MP4 huruf besar', failVideo('klip.MP4', null) === true);
check('WebM', failVideo('klip.webm', null) === true);
check('mkv', failVideo('klip.mkv', 'application/octet-stream') === true);
check('avi', failVideo('klip.AVI', 'application/octet-stream') === true);
check('m4v hampir sama dengan m4a', failVideo('klip.m4v', 'application/octet-stream') === true);
check('ogv', failVideo('klip.ogv', null) === true);
check('mpeg', failVideo('klip.mpeg', null) === true);

// Bukan video -> palsu (dibenarkan), termasuk audio yang hampir sama.
check('pdf', failVideo('dok.pdf', 'application/pdf') === false);
check('png', failVideo('foto.png', 'image/png') === false);
check('jpg', failVideo('foto.jpg', 'image/jpeg') === false);
check('gif', failVideo('foto.gif', 'image/gif') === false);
check('mp3 audio', failVideo('lagu.mp3', 'audio/mpeg') === false);
check('m4a audio bukan video', failVideo('audio.m4a', 'audio/mp4') === false);
check('wav audio', failVideo('lagu.wav', 'audio/wav') === false);
check('txt', failVideo('nota.txt', 'text/plain') === false);
check('csv', failVideo('senarai.csv', 'text/csv') === false);
check('zip', failVideo('arkib.zip', 'application/zip') === false);
check('docx', failVideo('dok.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') === false);

// Nama tanpa sambungan dan MIME bukan video -> false.
check('nama tanpa sambungan', failVideo('notanama', 'application/pdf') === false);
check('nama tanpa sambungan mime null', failVideo('notanama', null) === false);
check('kosong', failVideo('', '') === false);
check('noktah hujung sahaja', failVideo('klip.', 'application/octet-stream') === false);

// Sambungan berganda: sambungan TERAKHIR yang menentukan (risiko kzsec).
check('a.pdf.mp4 ialah video', failVideo('a.pdf.mp4', 'application/octet-stream') === true);
check('a.mp4.pdf bukan video', failVideo('a.mp4.pdf', 'application/octet-stream') === false);
check('nama dengan titik tengah', failVideo('my.video', 'application/octet-stream') === false);

// Serpihan URL dibuang supaya nama daripada pautan tidak tertipu.
check('query string dibuang', failVideo('klip.mp4?fmt=json', null) === true);
check('serpihan dibuang', failVideo('klip.mp4#frag', null) === true);

// Mesej ralat mesti wujud dan bukan kosong.
check('MESEJ_SEKAT_VIDEO tidak kosong', typeof MESEJ_SEKAT_VIDEO === 'string' && MESEJ_SEKAT_VIDEO.length > 0, MESEJ_SEKAT_VIDEO);

/* ===== Bahagian 2: pintu YouTube (cabang video items/kad) ===== */

check('pautan watch biasa', parseYouTubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ') === 'dQw4w9WgXcQ');
check('pautan pendek youtu.be', parseYouTubeId('https://youtu.be/dQw4w9WgXcQ') === 'dQw4w9WgXcQ');
check('embed', parseYouTubeId('https://www.youtube.com/embed/dQw4w9WgXcQ') === 'dQw4w9WgXcQ');
check('shorts', parseYouTubeId('https://www.youtube.com/shorts/dQw4w9WgXcQ') === 'dQw4w9WgXcQ');
check('ID 11 aksara terus', parseYouTubeId('dQw4w9WgXcQ') === 'dQw4w9WgXcQ');
check('vimeo ditolak', parseYouTubeId('https://vimeo.com/123456789') === null);
check('domain palsu youtube ditolak', parseYouTubeId('https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ') === null);
check('watch?v pada domain lain ditolak', parseYouTubeId('https://evil.com/watch?v=dQw4w9WgXcQ') === null);
check('id pendek ditolak', parseYouTubeId('https://www.youtube.com/watch?v=short') === null);
check('kosong ditolak', parseYouTubeId('') === null);

/* ===== Rumusan ===== */

console.log(`\n${pass} lulus, ${fail} gagal`);
if (fail > 0) {
  console.error('UJIAN KZ-039 GAGAL');
  process.exit(1);
}
console.log('Ujian KZ-039 lulus semua');