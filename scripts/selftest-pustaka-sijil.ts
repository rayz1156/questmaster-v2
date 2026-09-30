/**
 * Ujian logik V2-016a: pustaka templat sijil. Semua fungsi tulen dan
 * pembalut MCP diuji tanpa pangkalan data (fetch digantung).
 *
 * Jalankan: npx tsx scripts/selftest-pustaka-sijil.ts
 */
import { susunAturGridV1 } from '../src/lib/sijil/grid';
import {
  itemTerkunci,
  laluanGaleri,
  laluanPeribadi,
  laluanAsetSah,
  bacaKriteriaPustaka,
} from '../src/lib/sijil/pustaka';
import { normaliseSusunAtur, QR_SAIZ_MAKS, NAMA_SAIZ_MAKS } from '../src/lib/sijil/susunAtur';
import {
  listCertificateLibrary,
  useCertificateTemplate,
  copyCertificateTemplate,
  saveCertificateToLibrary,
} from '../src/lib/mcp/certificate-tools';

let gagal = 0;

function semak(k: string, ok: boolean, detail: string) {
  if (ok) {
    console.log(`LULUS ${k}: ${detail}`);
  } else {
    gagal += 1;
    console.log(`GAGAL ${k}: ${detail}`);
  }
}

const TOKEN = 'token-palsu';
const realFetch = globalThis.fetch;

type Panggilan = {
  url: string;
  method: string;
  body: Record<string, unknown> | null;
};

/** Gantung fetch global; rekod panggilan dan balas payload tetap. */
function stubFetch(payload: unknown, status = 200) {
  const panggilan: Panggilan[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    panggilan.push({
      url: String(input),
      method: init?.method ?? 'GET',
      body:
        typeof init?.body === 'string'
          ? (JSON.parse(init.body) as Record<string, unknown>)
          : null,
    });
    return new Response(JSON.stringify(payload), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
  return panggilan;
}

async function main() {
  // ------------------------------------------------------------------
  // A. Grid Sijil Kuizen v1: nilai tepat tiket V2-016a baris 40
  // ------------------------------------------------------------------
  const gelap = susunAturGridV1('dark');
  const nama = gelap.name;
  const qr = gelap.qr;
  const kod = gelap.code;
  semak('A', gelap.mode === 'full_background', 'mode full_background');
  semak(
    'A2',
    !!nama && nama.x === 0.5 && nama.y === 0.395 && nama.maxWidth === 0.6
      && nama.size === 40 && nama.color === '#0F1B3D'
      && nama.weight === 'bold' && nama.align === 'center',
    'name dark: x 0.5, y 0.395, maxWidth 0.6, size 40, #0F1B3D, bold, center',
  );
  semak(
    'A3',
    !!qr && qr.x === 0.784 && qr.y === 0.694 && qr.size === 0.1,
    'qr: x 0.784, y 0.694, size 0.1',
  );
  semak(
    'A4',
    !!kod && kod.x === 0.841 && kod.y === 0.885 && kod.size === 8
      && kod.color === '#0F1B3D' && kod.align === 'center',
    'code dark: x 0.841, y 0.885, size 8, warna sama, center',
  );
  const cerah = susunAturGridV1('light');
  semak(
    'A5',
    cerah.name?.color === '#FFFFFF' && cerah.code !== false && cerah.code?.color === '#FFFFFF',
    'tone light: teks putih #FFFFFF',
  );

  // Grid lalai mesti lulus normalisasi tanpa berubah (boleh disimpan terus).
  const normal = normaliseSusunAtur(gelap);
  const qrNormal = normal.qr;
  semak(
    'A6',
    JSON.stringify(normal) === JSON.stringify(gelap)
      && (normal.name?.size ?? 0) <= NAMA_SAIZ_MAKS
      && (!!qrNormal ? qrNormal.size : 0) <= QR_SAIZ_MAKS,
    'grid lalai idempoten terhadap normaliseSusunAtur dan dalam julat',
  );

  // ------------------------------------------------------------------
  // B. Pemetaan item terkunci (galeri, free_tier, pelan pemanggil)
  // ------------------------------------------------------------------
  semak('B', itemTerkunci({ scope: 'gallery', free_tier: false }, 'free') === true,
    'galeri bukan free_tier + pelan free -> terkunci');
  semak('B2', itemTerkunci({ scope: 'gallery', free_tier: true }, 'free') === false,
    'galeri free_tier + pelan free -> tidak terkunci');
  semak('B3', itemTerkunci({ scope: 'gallery', free_tier: false }, 'pro') === false,
    'galeri bukan free_tier + pelan pro -> tidak terkunci');
  semak('B4', itemTerkunci({ scope: 'personal', free_tier: false }, 'free') === false,
    'item personal tidak pernah terkunci');

  // ------------------------------------------------------------------
  // C. Laluan storan pustaka
  // ------------------------------------------------------------------
  semak(
    'C',
    laluanGaleri('lib-1', 'background', 'aabbccdd', 'png')
      === 'gallery/lib-1/background-aabbccdd.png',
    'laluan galeri: gallery/<id>/<kind>-<rawak>.<ext>',
  );
  semak(
    'C2',
    laluanPeribadi('uid-1', 'lib-1', 'logo', '0011', 'jpg')
      === 'library/uid-1/lib-1/logo-0011.jpg',
    'laluan peribadi: library/<uid>/<libid>/<kind>-<rawak>.<ext>',
  );

  // ------------------------------------------------------------------
  // D. Pengesahan laluan aset (traversal dan format)
  // ------------------------------------------------------------------
  semak('D', laluanAsetSah('gallery/lib-1/background-a.png') === true,
    'laluan normal sah');
  semak('D2', laluanAsetSah('../gallery/lib-1/x.png') === false
    && laluanAsetSah('/gallery/lib-1/x.png') === false
    && laluanAsetSah('gallery//lib-1/x.png') === false
    && laluanAsetSah('gallery/lib-1/x.png/') === false
    && laluanAsetSah('') === false,
    'traversal, awalan /, // beraturan dan kosong ditolak');

  // ------------------------------------------------------------------
  // E. Kriteria pustaka: padanan dengan laluan templates
  // ------------------------------------------------------------------
  const k1 = bacaKriteriaPustaka({ type: 'live_attended', quiz_id: 'q-1', hunt_id: 'diabaikan' });
  semak('E', k1?.type === 'live_attended' && k1?.quiz_id === 'q-1' && k1?.hunt_id === undefined,
    'live_attended membawa quiz_id sahaja');
  semak('E2', bacaKriteriaPustaka({ type: 'tidak_sah' }) === null
    && bacaKriteriaPustaka(null) === null,
    'jenis tidak dikenali dan input null -> null (lalai all_members dipakai route)');
  const k3 = bacaKriteriaPustaka({ type: 'min_score', min_score: 80 });
  semak('E3', k3?.type === 'min_score' && k3?.min_score === 80,
    'min_score dibaca');

  // ------------------------------------------------------------------
  // F. Pembalut MCP: URL, badan dan pemetaan hasil
  // ------------------------------------------------------------------
  let c = stubFetch({
    gallery: [{ id: 'g-1', scope: 'gallery', locked: true }],
    mine: [{ id: 'p-1', scope: 'personal', locked: false }],
  });
  const r6 = await listCertificateLibrary(TOKEN);
  semak('F', c[0].url.endsWith('/api/certificate-library') && c[0].method === 'GET'
    && r6.gallery.length === 1 && r6.mine[0].id === 'p-1',
    'list_certificate_library: GET /api/certificate-library dan pemetaan gallery/mine');

  c = stubFetch({ template: { id: 't-1', library_id: 'g-1' } }, 201);
  const r7 = await useCertificateTemplate(TOKEN, {
    library_id: 'g-1',
    class_id: 'k-1',
    title: ' Sijil Kuizen ',
    criteria: { type: 'all_members' },
  });
  semak('F2', c[0].url.endsWith('/api/classes/k-1/certificates/templates/from-library')
    && c[0].method === 'POST'
    && c[0].body?.library_id === 'g-1'
    && c[0].body?.title === 'Sijil Kuizen'
    && (c[0].body?.criteria as { type?: string })?.type === 'all_members'
    && r7.library_id === 'g-1',
    'use_certificate_template: route from-library, tajuk dipangkas dan kriteria dihantar');

  c = stubFetch({ template: { id: 't-2' }, background_removed: true }, 201);
  const r8 = await copyCertificateTemplate(TOKEN, {
    class_id: 'k-1',
    template_id: 't-1',
    target_class_id: 'k-2',
  });
  semak('F3', c[0].url.endsWith('/api/classes/k-1/certificates/templates/t-1/copy')
    && c[0].body?.target_class_id === 'k-2'
    && r8.background_removed === true,
    'copy_certificate_template: route copy, target_class_id dan background_removed');

  c = stubFetch({ item: { id: 'p-9', scope: 'personal' } }, 201);
  const r9 = await saveCertificateToLibrary(TOKEN, {
    class_id: 'k-1',
    template_id: 't-1',
  });
  semak('F4', c[0].url.endsWith('/api/certificate-library')
    && c[0].method === 'POST'
    && c[0].body?.from_template_id === 't-1'
    && c[0].body?.class_id === 'k-1'
    && (r9 as { id?: string }).id === 'p-9',
    'save_certificate_to_library: POST /api/certificate-library dengan from_template_id');

  // Argumen wajib pembalup ditolak sebelum rangkaian.
  let ditolak = 0;
  globalThis.fetch = realFetch;
  try { await useCertificateTemplate(TOKEN, { class_id: 'k-1' }); } catch { ditolak += 1; }
  try { await copyCertificateTemplate(TOKEN, { class_id: 'k-1', template_id: 't-1' }); } catch { ditolak += 1; }
  try { await saveCertificateToLibrary(TOKEN, { class_id: 'k-1' }); } catch { ditolak += 1; }
  semak('F5', ditolak === 3, 'argumen wajib pembalup ditolak sebelum rangkaian (3/3)');

  globalThis.fetch = realFetch;
  if (gagal > 0) {
    console.log(`\n${gagal} semakan GAGAL`);
    process.exit(1);
  }
  console.log('\nSemua semakan LULUS.');
}

main().catch((e) => {
  console.error('RALAT:', e);
  process.exit(1);
});
