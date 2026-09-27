/**
 * Video rasmi Kuizen dalam dua bahasa.
 *
 * Fail dihidangkan terus oleh Nginx dari /var/www/kuizen-media (laluan
 * /media/), bukan dari repo atau Next.js, supaya binaan kekal kecil dan
 * strim video tidak membebankan pelayan aplikasi. Setiap MP4 sudah diproses
 * dengan faststart supaya boleh dimainkan sebelum muat turun selesai.
 */
export type BahasaVideo = "ms" | "en";

export type FailVideo = { src: string; sarikata: string; poster: string };

export type Bab = { masa: number; tajuk: string };

const ASAS = "/media/video";

function fail(bahasa: BahasaVideo, nama: string): FailVideo {
  return {
    src: `${ASAS}/${bahasa}/${nama}.mp4`,
    sarikata: `${ASAS}/${bahasa}/${nama}.vtt`,
    poster: `${ASAS}/${bahasa}/${nama}.png`,
  };
}

function bab(senarai: string): Bab[] {
  return senarai
    .trim()
    .split("\n")
    .map((baris) => {
      const m = baris.trim().match(/^(\d+):(\d\d)\s+(.+)$/);
      return m ? { masa: Number(m[1]) * 60 + Number(m[2]), tajuk: m[3] } : null;
    })
    .filter((b): b is Bab => b !== null);
}

export const VIDEO_PENGENALAN: Record<BahasaVideo, FailVideo> = {
  ms: fail("ms", "pengenalan-ringkas"),
  en: fail("en", "intro-short"),
};

export const VIDEO_TUTORIAL: Record<BahasaVideo, FailVideo & { bab: Bab[] }> = {
  ms: {
    ...fail("ms", "tutorial"),
    bab: bab(`
0:00 Pengenalan
0:12 Cipta akaun pendidik
0:33 Ruang kerja anda
0:42 Cipta kelas
0:59 Tab kelas
1:09 Gambaran dan jemputan
1:28 Papan pembelajaran
1:40 Aktiviti
1:58 Penyerahan dan markah
2:11 Kuiz
2:28 Import soalan (CSV / Aiken)
2:44 Jalankan kuiz langsung
3:03 Ahli dan pasukan
3:15 Kedudukan
3:26 Analisis (Insights)
3:43 Pustaka (Library)
3:51 Tip
3:59 Penutup`),
  },
  en: {
    ...fail("en", "tutorial"),
    bab: bab(`
0:00 Introduction
0:12 Create an educator account
0:33 Your workspace
0:43 Create a class
1:00 Class tabs
1:10 Overview and invites
1:29 Learning board
1:43 Activities
2:04 Submissions and scoring
2:17 Quizzes
2:35 Import questions (CSV / Aiken)
2:52 Run a live quiz
3:11 People and teams
3:24 Rankings
3:34 Insights
3:52 Library
4:01 Tips
4:09 Wrap-up`),
  },
};

export function formatMasa(saat: number): string {
  return `${Math.floor(saat / 60)}:${String(saat % 60).padStart(2, "0")}`;
}
