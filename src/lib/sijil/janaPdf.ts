/**
 * Penjanaan PDF sijil (V2-003a). Fungsi tulen: tiada akses fail atau
 * rangkaian di sini; pemanggil membekalkan bait latar/logo.
 *
 * Fon standard Helvetica sahaja (tiada @pdf-lib/fontkit), supaya pakej
 * kekal ringan dan tiada fon perlu dibawa bersama.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib';
import QRCode from 'qrcode';
import {
  normaliseSusunAtur,
  WARNA_LALAI,
  type SusunAturSijil,
} from '@/lib/sijil/susunAtur';

/** Layout templat (jsonb): jenis tinggal di susunAtur.ts, dieksport semula
 *  di sini supaya pengimport lama (keluarkan.ts, preview) tidak berubah. */
export type { SusunAturSijil } from '@/lib/sijil/susunAtur';

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

/** Tukar #RRGGBB (sudah disahkan oleh normaliseSusunAtur) kepada rgb(). */
function hexRgb(h: string): ReturnType<typeof rgb> {
  return rgb(
    parseInt(h.slice(1, 3), 16) / 255,
    parseInt(h.slice(3, 5), 16) / 255,
    parseInt(h.slice(5, 7), 16) / 255,
  );
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

  // Normalkan layout sebelum mengguna apa-apa medan (V2-015): kunci asing
  // dibuang, nombor diapit, warna disahkan. Mod standard tidak berubah.
  const susun = normaliseSusunAtur(layout);

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

  // Mod latar reka bentuk penuh (V2-015): latar sudah dilukis penuh di
  // atas. JANGAN lukis sempadan, logo, tajuk, program, tarikh atau
  // pengeluar; reka bentuk sijil (Canva) sudah mengandungi semuanya.
  // Lukis nama, QR dan kod sijil sahaja pada kedudukan yang diberikan.
  if (susun.mode === 'full_background') {
    const nm = susun.name ?? {
      x: 0.5, y: 0.5, maxWidth: 0.8, size: 40,
      color: WARNA_LALAI, weight: 'bold' as const, align: 'center' as const,
    };
    const fonNama = nm.weight === 'regular' ? fonBadan : fonTajuk;
    // Saiz fon dikecilkan supaya nama muat lebar maksimum; minimum 12pt
    // (fonMuat) supaya nama sentiasa boleh dibaca.
    const saizNama = fonMuat(nama, nm.maxWidth * A4_W, nm.size, fonNama);
    const lebarNama = fonNama.widthOfTextAtSize(nama, saizNama);
    const xNama = nm.align === 'left' ? nm.x * A4_W : nm.x * A4_W - lebarNama / 2;
    // y ialah garis dasar teks diukur dari ATAS halaman; pdf-lib bermula
    // dari bawah, jadi balikkan paksi.
    page.drawText(nama, {
      x: xNama,
      y: A4_H - nm.y * A4_H,
      size: saizNama,
      font: fonNama,
      color: hexRgb(nm.color),
    });

    // Kod QR; saiz ialah pecahan LEBAR halaman, y penjuru kiri atas dari
    // atas halaman. qr: false bermakna TIADA QR dilukis.
    const QR_LALAI = { x: 0.815, y: 0.75, size: 0.08 };
    const qrSusun = susun.qr === false ? null : (susun.qr ?? QR_LALAI);
    if (qrSusun) {
      const qrLebar = qrSusun.size * A4_W;
      const qrPng = await QRCode.toBuffer(urlSah, { width: 220, margin: 1 });
      const qrIm = await pdf.embedPng(new Uint8Array(qrPng));
      page.drawImage(qrIm, {
        x: qrSusun.x * A4_W,
        y: A4_H - qrSusun.y * A4_H - qrLebar,
        width: qrLebar,
        height: qrLebar,
      });
    }

    // Kod sijil; lalai di bawah QR (garis dasar), saiz 8, tengah.
    if (susun.code !== false) {
      // QR rujukan untuk kedudukan lalai kod: QR sebenar jika ada, jika
      // tidak kedudukan QR lalai (kod tetap muncul di penjuru kanan bawah).
      const rujukQr = qrSusun ?? QR_LALAI;
      const cd = susun.code ?? {
        x: rujukQr.x + rujukQr.size / 2,
        y: rujukQr.y + (rujukQr.size * A4_W) / A4_H + 0.022,
        size: 8,
        color: WARNA_LALAI,
        align: 'center' as const,
      };
      const lebarKod = fonTajuk.widthOfTextAtSize(kod, cd.size);
      let xKod = cd.x * A4_W;
      if (cd.align === 'center') xKod -= lebarKod / 2;
      if (cd.align === 'right') xKod -= lebarKod;
      page.drawText(kod, {
        x: xKod,
        y: A4_H - cd.y * A4_H,
        size: cd.size,
        font: fonTajuk,
        color: hexRgb(cd.color),
      });
    }

    // Tera "Dijana dengan Kuizen" masih dihormati bila tera benar.
    if (tera) {
      tengah('Dijana dengan Kuizen | kuizen.fun', fonTajuk, 9, 44);
    }
    return pdf.save();
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
  tengah(susun.titleBm ?? 'Sijil Penyertaan', fonTajuk, 26, y);
  tengah(susun.titleEn ?? 'Certificate of Participation', fonTajuk, 13, y - 24);

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
