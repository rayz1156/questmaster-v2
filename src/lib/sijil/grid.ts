/**
 * Grid Sijil Kuizen v1 (V2-016a): susun atur lalai item galeri baharu.
 *
 * Nilai tepat daripada reka bentuk Canva (salinan ringkas tiket V2-016a
 * baris 40); rujukan mutlak. Fungsi tulen tanpa pangkalan data supaya
 * laluan API, MCP dan skrip ujian memakai grid yang sama.
 */
import type { SusunAturSijil } from './susunAtur';

/** Nada teks yang disokong item pustaka; sama dengan qm_certificate_library.text_tone. */
export type ToneTeks = 'dark' | 'light';

/**
 * Susun atur grid lalai mengikut nada teks: latar gelap memakai teks
 * putih, latar cerah memakai teks navy. Semua nilai berada dalam julat
 * normaliseSusunAtur supaya hasil boleh disimpan terus.
 */
export function susunAturGridV1(tone: ToneTeks): SusunAturSijil {
  const warna = tone === 'light' ? '#FFFFFF' : '#0F1B3D';
  return {
    mode: 'full_background',
    name: {
      x: 0.5,
      y: 0.395,
      maxWidth: 0.6,
      size: 40,
      color: warna,
      weight: 'bold',
      align: 'center',
    },
    qr: { x: 0.784, y: 0.694, size: 0.1 },
    code: { x: 0.841, y: 0.885, size: 8, color: warna, align: 'center' },
  };
}
