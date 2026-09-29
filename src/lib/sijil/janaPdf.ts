/**
 * Penjanaan PDF sijil (V2-003a). Fungsi tulen: tiada akses fail atau
 * rangkaian di sini; pemanggil membekalkan bait latar/logo.
 *
 * Fon standard Helvetica sahaja (tiada @pdf-lib/fontkit), supaya pakej
 * kekal ringan dan tiada fon perlu dibawa bersama.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib';
import QRCode from 'qrcode';

/** Layout templat (jsonb): kunci pilihan yang dihormati. */
export type SusunAturSijil = {
  titleBm?: string;
  titleEn?: string;
};

export type OpsiSijil = {
  nama: string;
  program: string;
  tarikh: string; // sudah diformat oleh pemanggil (d MMMM yyyy BM)
  pengeluar: string;
  kod: string;
  urlSah: string;
  latar?: Uint8Array;
  logo?: Uint8Array;
  tera: boolean;
  layout?: SusunAturSijil;
};

// Halaman A4 landskap
const A4_W = 841.89;
const A4_H = 595.28;

// Violet dan indigo gelap, konsisten dengan gaya UI Kuizen
const UV = rgb(0.43, 0.16, 0.66);
const INDIGO = rgb(0.28, 0.25, 0.69);

/** Bulan Bahasa Melayu untuk format tarikh d MMMM yyyy. */
export const BULAN_BM = [
  'Januari', 'Februari', 'Mac', 'April', 'Mei', 'Jun',
  'Julai', 'Ogos', 'September', 'Oktober', 'November', 'Disember',
];

/** Format tarikh BM: d MMMM yyyy. */
export function formatTarikhBm(d: Date): string {
  return `${d.getDate()} ${BULAN_BM[d.getMonth()]} ${d.getFullYear()}`;
}

/** Kecilkan saiz fon supaya nama panjang tetap muat dalam lebar maksimum. */
function fonMuat(teks: string, lebarMaks: number, saizMaks: number, fon: PDFFont): number {
  let saiz = saizMaks;
  while (saiz > 12 && fon.widthOfTextAtSize(teks, saiz) > lebarMaks) {
    saiz -= 1;
  }
  return saiz;
}

/** Teka jenis imej daripada bait pertama (PNG / JPEG). */
function jenisImej(bait: Uint8Array): 'png' | 'jpg' | null {
  if (bait.length > 3 && bait[0] === 0x89 && bait[1] === 0x50) return 'png';
  if (bait.length > 3 && bait[0] === 0xff && bait[1] === 0xd8) return 'jpg';
  return null;
}

/**
 * Jana PDF sijil A4 landskap dan pulangkan bait dokumen.
 * Templat lalai: sempadan berganda violet/indigo, tajuk dwibahasa,
 * nama besar di tengah, program, tarikh, pengeluar, kod sijil, URL
 * pengesahan dan kod QR. `tera` menambah teks kecil "Dijana dengan
 * Kuizen" di bawah.
 */
export async function janaPdfSijil(opsi: OpsiSijil): Promise<Uint8Array> {
  const {
    nama, program, tarikh, pengeluar, kod, urlSah,
    latar, logo, tera, layout = {},
  } = opsi;

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([A4_W, A4_H]);

  const fonTajuk = await pdf.embedFont(StandardFonts.HelveticaBold);
  const fonBadan = await pdf.embedFont(StandardFonts.Helvetica);

  // Teks di tengah halaman pada ketinggian y tertentu
  const tengah = (teks: string, fon: PDFFont, saiz: number, y: number) => {
    const lebar = fon.widthOfTextAtSize(teks, saiz);
    page.drawText(teks, { x: (A4_W - lebar) / 2, y, size: saiz, font: fon });
  };

  // Latar tersuai (pelan berbayar sahaja; ditapis sebelum panggilan ini)
  if (latar && latar.length > 0) {
    const j = jenisImej(latar);
    if (j === 'png') {
      page.drawImage(await pdf.embedPng(latar), { x: 0, y: 0, width: A4_W, height: A4_H });
    } else if (j === 'jpg') {
      page.drawImage(await pdf.embedJpg(latar), { x: 0, y: 0, width: A4_W, height: A4_H });
    }
  }

  // Sempadan berganda: violet tebal luar, indigo nipis dalam
  page.drawRectangle({
    x: 24, y: 24, width: A4_W - 48, height: A4_H - 48,
    borderWidth: 3, borderColor: UV,
  });
  page.drawRectangle({
    x: 32, y: 32, width: A4_W - 64, height: A4_H - 64,
    borderWidth: 1, borderColor: INDIGO,
  });

  // Logo (jika ada) di tengah atas
  let y = A4_H - 96;
  if (logo && logo.length > 0) {
    const j = jenisImej(logo);
    if (j === 'png' || j === 'jpg') {
      const im = j === 'png' ? await pdf.embedPng(logo) : await pdf.embedJpg(logo);
      const tinggi = 56;
      const lebar = Math.min((im.width / im.height) * tinggi, 220);
      page.drawImage(im, { x: (A4_W - lebar) / 2, y: y - tinggi, width: lebar, height: tinggi });
      y -= 72;
    }
  }

  // Tajuk dwibahasa
  tengah(layout.titleBm ?? 'Sijil Penyertaan', fonTajuk, 26, y);
  tengah(layout.titleEn ?? 'Certificate of Participation', fonTajuk, 13, y - 24);

  // Nama besar di tengah; nama panjang dikecilkan supaya muat
  const yNama = y - 76;
  const saizNama = fonMuat(nama, A4_W - 160, 44, fonTajuk);
  tengah(nama, fonTajuk, saizNama, yNama);
  page.drawLine({
    start: { x: (A4_W - 360) / 2, y: yNama - 18 },
    end: { x: (A4_W + 360) / 2, y: yNama - 18 },
    thickness: 1,
    color: UV,
  });

  // Program dan tarikh
  const yProg = yNama - 56;
  tengah(program, fonTajuk, 16, yProg);
  tengah(`Completed on ${tarikh}`, fonTajuk, 11, yProg - 22);

  // Kod sijil dan URL pengesahan di bawah
  tengah(`Certificate code: ${kod}`, fonTajuk, 11, 86);
  tengah(urlSah, fonTajuk, 10, 70);

  // Pengeluar, kiri bawah
  page.drawText(pengeluar, { x: 56, y: 60, size: 11, font: fonBadan });

  // Kod QR yang menunjuk ke URL pengesahan
  const qrPng = await QRCode.toBuffer(urlSah, { width: 220, margin: 1 });
  const qr = await pdf.embedPng(new Uint8Array(qrPng));
  page.drawImage(qr, { x: A4_W - 140, y: 60, width: 80, height: 80 });

  // Tera "Dijana dengan Kuizen" hanya apabila diminta
  if (tera) {
    tengah('Dijana dengan Kuizen | kuizen.fun', fonTajuk, 9, 44);
  }

  return pdf.save();
}
