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
  type SusunAturNama,
  type SusunAturSignature,
} from '@/lib/sijil/susunAtur';
import { normaliseMedan, barisButiran, type MedanSijil } from '@/lib/sijil/medan';

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
  /** Medan isian sijil (V2-016b): dinormalkan dengan normaliseMedan. */
  medan?: unknown;
  /** Bait imej tandatangan PNG/JPEG (V2-016b). */
  tandatangan?: Uint8Array;
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

/** Saiz fon minimum untuk teks medan isian (V2-016b). */
const MUAT_MIN_MEDAN = 8;

/**
 * Teks medan isian muat maxWidth: kecilkan saiz fon sehingga minimum 8,
 * kemudian pangkas dengan elipsis. Tidak pernah melontar ralat walaupun
 * teks sangat panjang.
 */
function teksMuat(
  teks: string,
  lebarMaks: number,
  saizMaks: number,
  fon: PDFFont,
): { saiz: number; teks: string } {
  let saiz = saizMaks;
  while (saiz > MUAT_MIN_MEDAN && fon.widthOfTextAtSize(teks, saiz) > lebarMaks) {
    saiz -= 1;
  }
  if (fon.widthOfTextAtSize(teks, saiz) <= lebarMaks) {
    return { saiz, teks };
  }
  let potong = teks;
  while (potong.length > 1 && fon.widthOfTextAtSize(`${potong}...`, saiz) > lebarMaks) {
    potong = potong.slice(0, -1);
  }
  return { saiz, teks: `${potong}...` };
}

/**
 * Aksara khas blok 0x80 hingga 0x9F pengekodan WinAnsi (Helvetica):
 * senarai kod aksara sah, ditulis secara bernombor supaya tiada aksara
 * sumber yang sukar dibaca.
 */
const WINANSI_KHAS = new Set([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6,
  0x2030, 0x0160, 0x2039, 0x0152, 0x017d, 0x2018, 0x2019, 0x201c,
  0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a,
  0x0153, 0x017e, 0x0178,
]);

/**
 * Sanitasi teks medan pengguna untuk fon Helvetica standard (WinAnsi):
 * aksara di luar julat yang disokong diganti dengan '?' dan bukan
 * merosakkan penjanaan PDF (risiko kzsec V2-016b).
 */
function selamatWinAnsi(teks: string): string {
  let keluar = '';
  for (const ch of teks) {
    const c = ch.codePointAt(0) ?? 0;
    if ((c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || WINANSI_KHAS.has(c)) {
      keluar += ch;
    } else {
      keluar += '?';
    }
  }
  return keluar;
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
 * nama besar di tengah, program, tarikh, pengeluar dan kod QR.
 * KZ-009: kod sijil dan URL pengesahan TIDAK lagi dicetak sebagai teks;
 * QR sahaja yang membawa URL. `kod` dan `urlSah` kekal sebagai parameter
 * (QR memerlukan `urlSah`). `tera` menambah teks kecil "Dijana dengan
 * Kuizen" di bawah.
 */
export async function janaPdfSijil(opsi: OpsiSijil): Promise<Uint8Array> {
  const {
    nama, program, tarikh, pengeluar, urlSah,
    latar, logo, tera, layout = {},
  } = opsi;

  // Normalkan layout sebelum mengguna apa-apa medan (V2-015): kunci asing
  // dibuang, nombor diapit, warna disahkan. Mod standard tidak berubah.
  const susun = normaliseSusunAtur(layout);
  // Medan isian (V2-016b) sentiasa dinormalkan: teks dipangkas, tarikh
  // disahkan; medan kosong tidak dicetak langsung.
  const medan: MedanSijil = normaliseMedan(opsi.medan);
  const butiranMedan = barisButiran(medan);
  const tandatangan = opsi.tandatangan;

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([A4_W, A4_H]);

  const fonTajuk = await pdf.embedFont(StandardFonts.HelveticaBold);
  const fonBadan = await pdf.embedFont(StandardFonts.Helvetica);

  // Teks di tengah halaman pada ketinggian y tertentu
  const tengah = (teks: string, fon: PDFFont, saiz: number, y: number) => {
    const lebar = fon.widthOfTextAtSize(teks, saiz);
    page.drawText(teks, { x: (A4_W - lebar) / 2, y, size: saiz, font: fon });
  };

  // Lukis satu baris teks medan isian pada kedudukan bentuk name (V2-016b):
  // teks disanitasi WinAnsi, saiz dikecilkan hingga minimum 8 kemudian
  // dipangkas dengan elipsis; y ialah garis dasar dari ATAS halaman.
  const lukisMedanTeks = (teks: string, pos: SusunAturNama, fon: PDFFont) => {
    const t = teksMuat(selamatWinAnsi(teks), pos.maxWidth * A4_W, pos.size, fon);
    const lebar = fon.widthOfTextAtSize(t.teks, t.saiz);
    const x = pos.align === 'left' ? pos.x * A4_W : pos.x * A4_W - lebar / 2;
    page.drawText(t.teks, {
      x,
      y: A4_H - pos.y * A4_H,
      size: t.saiz,
      font: fon,
      color: hexRgb(pos.color),
    });
  };

  // Lukis imej tandatangan pada kotak pecahan halaman (V2-016b): x dan y
  // penjuru kiri atas, tinggi ikut nisbah imej dan dihadkan 0.12 halaman.
  const lukisTandatangan = async (pos: SusunAturSignature) => {
    if (!tandatangan || tandatangan.length === 0) return;
    const j = jenisImej(tandatangan);
    if (j !== 'png' && j !== 'jpg') return;
    const im = j === 'png' ? await pdf.embedPng(tandatangan) : await pdf.embedJpg(tandatangan);
    const lebar = pos.width * A4_W;
    let tinggi = lebar * (im.height / im.width);
    const maksTinggi = 0.12 * A4_H;
    if (tinggi > maksTinggi) tinggi = maksTinggi;
    page.drawImage(im, {
      x: pos.x * A4_W,
      y: A4_H - pos.y * A4_H - tinggi,
      width: lebar,
      height: tinggi,
    });
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
  // Lukis nama, medan isian dan QR sahaja pada kedudukan yang diberikan
  // (KZ-009: kod sijil tidak lagi dicetak sebagai teks).
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

    // Medan isian (V2-016b): cetak kursus, baris butiran (tarikh | tempat),
    // blok penandatangan dan imej tandatangan HANYA bila nilai dan
    // kedudukan ada; layout false mematikan cetakan walaupun nilai ada.
    if (medan.course && susun.course) {
      lukisMedanTeks(
        medan.course,
        susun.course,
        susun.course.weight === 'regular' ? fonBadan : fonTajuk,
      );
    }
    if (butiranMedan && susun.details) {
      lukisMedanTeks(
        butiranMedan,
        susun.details,
        susun.details.weight === 'regular' ? fonBadan : fonTajuk,
      );
    }
    if (medan.signer_name && susun.signer) {
      const sg = susun.signer;
      lukisMedanTeks(medan.signer_name, sg, fonTajuk);
      // Jawatan: satu baris di bawah nama, saiz 85% dan fon biasa.
      if (medan.signer_title) {
        lukisMedanTeks(
          medan.signer_title,
          { ...sg, size: Math.max(MUAT_MIN_MEDAN, sg.size * 0.85), y: sg.y + (sg.size * 1.3) / A4_H },
          fonBadan,
        );
      }
    }
    if (susun.signature) {
      await lukisTandatangan(susun.signature);
    }

    // Kod QR; saiz ialah pecahan LEBAR halaman, y penjuru kiri atas dari
    // atas halaman. qr: false bermakna TIADA QR dilukis.
    // KZ-009: kod sijil tidak lagi dicetak sebagai teks; QR sahaja.
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

  // Program dan tarikh. Bila medan isian ada nilai (V2-016b), kursus dicetak
  // di bawah nama, baris butiran (tarikh | tempat) di bawahnya dan blok
  // program digeser ke bawah; tanpa nilai kedudukan kekal SAMA seperti
  // sebelum ini supaya sijil lama tidak berubah.
  let yProg = yNama - 56;
  const teksKursus = medan.course ? selamatWinAnsi(medan.course) : null;
  const teksButiran = butiranMedan ? selamatWinAnsi(butiranMedan) : null;
  if (teksKursus || teksButiran) {
    let yMedan = yNama - 52;
    if (teksKursus) {
      const t = teksMuat(teksKursus, A4_W - 160, 18, fonTajuk);
      tengah(t.teks, fonTajuk, t.saiz, yMedan);
      yMedan -= 26;
    }
    if (teksButiran) {
      const t = teksMuat(teksButiran, A4_W - 160, 11, fonBadan);
      tengah(t.teks, fonBadan, t.saiz, yMedan);
      yMedan -= 8;
    }
    yProg = yMedan - 26;
  }
  tengah(program, fonTajuk, 16, yProg);
  tengah(`Completed on ${tarikh}`, fonTajuk, 11, yProg - 22);

  // KZ-009: kod sijil dan URL pengesahan tidak lagi dicetak sebagai teks
  // (Boss mahu QR sahaja); pengesahan dibuat melalui kod QR di bawah.

  // Pengeluar, kiri bawah
  page.drawText(pengeluar, { x: 56, y: 60, size: 11, font: fonBadan });

  // Blok penandatangan di kiri bawah (kedudukan tetap yang kemas, V2-016b):
  // imej tandatangan di atas, nama tebal, jawatan biasa di bawahnya.
  // Tanpa nilai tiada apa-apa dilukis dan output kekal seperti dahulu.
  if (tandatangan && tandatangan.length > 0) {
    const jSig = jenisImej(tandatangan);
    if (jSig === 'png' || jSig === 'jpg') {
      const imSig = jSig === 'png' ? await pdf.embedPng(tandatangan) : await pdf.embedJpg(tandatangan);
      const tinggiSig = 36;
      const lebarSig = Math.min((imSig.width / imSig.height) * tinggiSig, 140);
      page.drawImage(imSig, { x: 56, y: 94, width: lebarSig, height: tinggiSig });
    }
  }
  if (medan.signer_name) {
    page.drawText(selamatWinAnsi(medan.signer_name), {
      x: 56, y: 82, size: 11, font: fonTajuk,
    });
  }
  if (medan.signer_title) {
    page.drawText(selamatWinAnsi(medan.signer_title), {
      x: 56, y: 70, size: 9, font: fonBadan,
    });
  }

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
