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
  ms: fail("ms", "pengenalan-penuh"),
  en: fail("en", "intro-full"),
};

export const VIDEO_TUTORIAL: Record<BahasaVideo, FailVideo & { bab: Bab[] }> = {
  ms: {
    ...fail("ms", "tutorial-v2"),
    bab: bab(`
0:00 Pengenalan
0:12 Cipta akaun pendidik
0:33 Ruang kerja anda
0:42 Cipta kelas
0:59 Tab kelas
1:11 Gambaran dan jemputan
1:30 Papan pembelajaran
1:42 Aktiviti
2:00 Penyerahan dan markah
2:13 Kuiz
2:30 Import soalan (CSV / Aiken)
2:46 Jalankan kuiz langsung
3:05 Ahli dan pasukan
3:17 Kedudukan
3:28 Sijil
3:47 Analisis (Insights)
4:03 Pustaka (Library)
4:11 Tip
4:19 Penutup`),
  },
  en: {
    ...fail("en", "tutorial-v2"),
    bab: bab(`
0:00 Introduction
0:10 Create an educator account
0:28 Your workspace
0:36 Create a class
0:50 Class tabs
1:01 Overview and invites
1:17 Learning board
1:29 Activities
1:45 Submissions and scoring
1:57 Quizzes
2:12 Import questions (CSV / Aiken)
2:27 Run a live quiz
2:42 People and teams
2:52 Rankings
3:01 Certificates
3:18 Insights
3:33 Library
3:40 Tips
3:47 Wrap-up`),
  },
};

export function formatMasa(saat: number): string {
  return `${Math.floor(saat / 60)}:${String(saat % 60).padStart(2, "0")}`;
}
