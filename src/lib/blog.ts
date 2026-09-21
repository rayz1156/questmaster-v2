/**
 * Daftar artikel blog.
 *
 * Satu tempat sahaja. Menambah artikel bermakna menambah satu objek di sini
 * dan satu halaman di bawah src/app/panduan, dan artikel itu terus muncul
 * dalam senarai, penapis kategori, sitemap dan data berstruktur.
 *
 * Laluan artikel kekal di bawah /panduan kerana tiga artikel pertama sudah
 * dihantar ke Search Console dengan alamat itu. Menukar alamat yang baru
 * diindeks hanya membuang kerja perangkak. /blog ialah halaman senarai.
 */

export type Kategori = "Panduan" | "Idea PdP" | "Cerita pendidik" | "Berita Kuizen";

export type Artikel = {
  slug: string;
  tajuk: string;
  ringkasan: string;
  kategori: Kategori;
  minit: number;
  /** Dua warna untuk blok visual kad. Rujuk nota di bawah. */
  warna: [string, string];
  pilihanEditor?: boolean;
};

/**
 * Nota tentang visual: reka bentuk asal menggunakan ilustrasi tiga dimensi.
 * Kami belum mempunyai aset itu, jadi setiap kad memakai blok kecerunan
 * lembut daripada palet yang sama. Ia kelihatan disengajakan dan bukan
 * seperti imej yang gagal dimuatkan, dan ia tidak menambah muat turun.
 * Apabila ilustrasi sebenar sedia, tukar blok itu kepada imej.
 */
export const ARTIKEL: Artikel[] = [
  {
    slug: "cara-buat-kuiz-online",
    tajuk: "Kuiz pertama anda, langkah demi langkah",
    ringkasan:
      "Dari mencipta soalan hingga mengajak pelajar menyertai. Tujuh langkah, dan kuiz pertama biasanya siap dalam sepuluh minit.",
    kategori: "Panduan",
    minit: 4,
    warna: ["#EDE9FB", "#DDD5F7"],
    pilihanEditor: true,
  },
  {
    slug: "apa-itu-pdpc",
    tajuk: "Apa itu PdPc, dan cara menjadikannya lebih hidup",
    ringkasan:
      "Maksud PdPc, bezanya dengan PdP, kedudukannya dalam SKPMg2, dan lima cara praktikal menjadikan waktu pengajaran lebih interaktif.",
    kategori: "Idea PdP",
    minit: 4,
    warna: ["#E8F1FB", "#D7E7F8"],
  },
  {
    slug: "alternatif-kahoot",
    tajuk: "Alternatif Kahoot untuk kelas di Malaysia",
    ringkasan:
      "Empat perkara yang benar benar membezakan platform kuiz: had peserta, kos bila kelas membesar, sokongan Bahasa Melayu, dan ke mana markah pergi.",
    kategori: "Panduan",
    minit: 4,
    warna: ["#FBF0E8", "#F7E2D2"],
  },
];

export const KATEGORI: Kategori[] = ["Panduan", "Idea PdP", "Cerita pendidik", "Berita Kuizen"];

export function pautan(a: Artikel) {
  return `/panduan/${a.slug}`;
}

export function pilihan(): Artikel | undefined {
  return ARTIKEL.find((a) => a.pilihanEditor) ?? ARTIKEL[0];
}

export function selainPilihan(): Artikel[] {
  const p = pilihan();
  return ARTIKEL.filter((a) => a.slug !== p?.slug);
}
