/**
 * Destinasi utama pendidik, semakan September 2026.
 *
 * Tujuh pautan bar sisi dikurangkan kepada tiga. Sebabnya: Activities,
 * Quizzes, Teams dan Rankings semuanya bermakna "di dalam kelas mana", jadi
 * tempatnya ialah di dalam kelas, bukan di aras atas. Yang tinggal di aras
 * atas hanyalah tiga soalan sebenar yang seorang pendidik tanya:
 *
 *   Classes   siapa yang saya ajar
 *   Library   apa yang saya ada untuk diajar
 *   Insights  bagaimana keadaannya
 *
 * Profile dan Help berpindah ke bar atas sebelah kanan. Teams dan Rankings
 * peringkat global masih ada dan dicapai dari halaman Classes; tiada laluan
 * dibuang.
 *
 * `match` menyenaraikan laluan lain yang masih dikira destinasi yang sama,
 * supaya /educator/live turut menyalakan Library.
 */
export type EduTab = {
  href: string;
  label: string;
  /** Awalan laluan tambahan yang dikira aktif untuk tab ini. */
  match?: string[];
};

export const EDU_TABS: EduTab[] = [
  {
    href: "/educator/classes",
    label: "Classes",
    match: ["/educator/teams", "/educator/rankings", "/educator/invites", "/educator/outcomes"],
  },
  {
    href: "/educator/library",
    label: "Library",
    match: ["/educator/activities", "/educator/live"],
  },
  {
    href: "/educator/analytics",
    label: "Insights",
  },
];
