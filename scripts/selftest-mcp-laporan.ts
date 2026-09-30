/**
 * Ujian sendiri bagi alat MCP laporan dan markah (V2-017), tanpa pangkalan
 * data.
 *
 * Jalankan:  npx tsx scripts/selftest-mcp-laporan.ts
 *
 * Empat bahagian:
 *   1. fungsi tulen src/lib/laporanMarkah.ts (kedudukan seri, ringkasan
 *      sesi, tiga teratas, pemangkasan);
 *   2. pengesahan argumen dan pemetaan URL setiap alat dalam
 *      src/lib/mcp/report-tools.ts dengan fetch digantung, termasuk
 *      penolakan UUID dan nilai tidak sah SEBELUM rangkaian;
 *   3. eksport CSV: nama fail, kandungan dan had 200 KB;
 *   4. tapisan bahagian Insights (kunci, had progress 50, truncated).
 *
 * report-tools sengaja tidak mengimport session.ts/db.ts, jadi ujian ini
 * boleh berjalan tanpa env atau Supabase.
 */
import {
  senaraiSesiLangsung,
  keputusanSesiLangsung,
  markahKelas,
  markahPelajar,
  keputusanHunt,
  insightsKelasAlat,
  eksportInsightsCsv,
  engagementKelas,
  sahkanBahagianInsights,
  tapisBahagianInsights,
  hadLimit,
  SESI_LIMIT_LALAI,
  SESI_LIMIT_MAKS,
  MARKAH_LIMIT_MAKS,
  CSV_MAKS_AKSARA,
  PROGRESS_MAKS,
  BAHAGIAN_ALAT_INSIGHTS,
} from "../src/lib/mcp/report-tools";
import type { InsightsKelas } from "../src/lib/insightsKelas";
import {
  kedudukanSeri,
  ringkasanSesi,
  tigaTeratas,
  pangkasTeks,
} from "../src/lib/laporanMarkah";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) {
    pass++;
    console.log("PASS " + name);
  } else {
    fail++;
    console.log("FAIL " + name + " :: " + JSON.stringify(extra));
  }
}

const UUID_KELAS = "11111111-1111-1111-1111-111111111111";
const UUID_KUIZ = "22222222-2222-2222-2222-222222222222";
const UUID_SESI = "33333333-3333-3333-3333-333333333333";
const UUID_PELAJAR = "44444444-4444-4444-4444-444444444444";
const UUID_HUNT = "55555555-5555-5555-5555-555555555555";
const TOKEN = "token-palsu";

/* ===== Bahagian 1: fungsi tulen laporanMarkah ===== */

function ujianTulen() {
  const ked = kedudukanSeri([100, 90, 90, 80]);
  check("kedudukanSeri: seri berkongsi nombor",
    ked.length === 4 && ked[0] === 1 && ked[1] === 2 && ked[2] === 2 && ked[3] === 4, ked);

  const ring = ringkasanSesi([
    { score: 100, correct: 2, answered: 4 },
    { score: 50, correct: 1, answered: 2 },
  ]);
  check("ringkasanSesi: purata, median dan ketepatan",
    ring.players === 2 && ring.avg_score === 75 && ring.median_score === 75 && ring.accuracy_pct === 50,
    ring);

  const kosong = ringkasanSesi([]);
  check("ringkasanSesi: sesi kosong memberi ketepatan null",
    kosong.players === 0 && kosong.avg_score === 0 && kosong.median_score === 0 && kosong.accuracy_pct === null,
    kosong);

  const pendek = pangkasTeks("soalan pendek", 200);
  check("pangkasTeks: teks pendek tidak berubah",
    pendek.teks === "soalan pendek" && pendek.truncated === false, pendek);

  const panjang = pangkasTeks("x".repeat(205), 200);
  check("pangkasTeks: teks panjang dipotong pada had dengan bendera",
    panjang.teks.length === 203 && panjang.teks.startsWith("x".repeat(200)) && panjang.truncated === true,
    panjang);

  const teratas = tigaTeratas([
    { name: "C", score: 700 },
    { name: "A", score: 1000 },
    { name: "B", score: 900 },
    { name: "D", score: 700 },
    { name: "E", score: 100 },
  ]);
  check("tigaTeratas: tiga baris sahaja, seri dikira dalam senarai penuh",
    teratas.length === 3 &&
      teratas[0].rank === 1 && teratas[0].name === "A" &&
      teratas[1].rank === 2 && teratas[2].rank === 3 && teratas[2].name === "C",
    teratas);

  check("hadLimit: bawah 1 jatuh ke lalai dan atas maks dipotong",
    hadLimit(0, SESI_LIMIT_LALAI, SESI_LIMIT_MAKS) === SESI_LIMIT_LALAI &&
      hadLimit(500, SESI_LIMIT_LALAI, SESI_LIMIT_MAKS) === SESI_LIMIT_MAKS &&
      hadLimit("x", 200, MARKAH_LIMIT_MAKS) === 200,
    {});
}

/* ===== Bahagian 2: pemetaan URL dan pengesahan sebelum rangkaian ===== */

const realFetch = globalThis.fetch;
let networkTouched = false;
let lastUrl = "";
let lastAuth = "";

function stubFetch(payload: unknown, status = 200, headers: Record<string, string> = {}) {
  networkTouched = false;
  globalThis.fetch = (async (input: any, init?: any) => {
    networkTouched = true;
    lastUrl = String(input);
    lastAuth = init?.headers?.Authorization ?? "";
    const badan =
      typeof payload === "string" ? payload : JSON.stringify(payload);
    return new Response(badan, {
      status,
      headers: { "content-type": "application/json", ...headers },
    });
  }) as typeof fetch;
}

function stubFetchText(teks: string, namaFail: string) {
  networkTouched = false;
  globalThis.fetch = (async (input: any, init?: any) => {
    networkTouched = true;
    lastUrl = String(input);
    lastAuth = init?.headers?.Authorization ?? "";
    return new Response(teks, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${namaFail}"`,
      },
    });
  }) as typeof fetch;
}

async function ditolakSebelumRangkaian(fn: () => Promise<unknown>): Promise<boolean> {
  networkTouched = false;
  try {
    await fn();
    return false;
  } catch {
    return networkTouched === false;
  }
}

async function ujianPemetaan() {
  // 2a. list_live_sessions: semua parameter dipetakan ke query string.
  stubFetch({ data: [], limit: 20, truncated: false });
  const sesi = (await senaraiSesiLangsung(TOKEN, {
    class_id: UUID_KELAS,
    quiz_id: UUID_KUIZ,
    status: "ended",
    limit: 50,
  })) as Record<string, unknown>;
  const urlSesi = new URL(lastUrl);
  check("list_live_sessions: class_id, quiz_id, status dan limit dipetakan",
    urlSesi.pathname === "/api/live/sessions" &&
      urlSesi.searchParams.get("class_id") === UUID_KELAS &&
      urlSesi.searchParams.get("quiz_id") === UUID_KUIZ &&
      urlSesi.searchParams.get("status") === "ended" &&
      urlSesi.searchParams.get("limit") === "50",
    lastUrl);
  check("list_live_sessions: header Bearer dihantar dan hadamkan balasan",
    lastAuth === `Bearer ${TOKEN}` && sesi.limit === 20 && sesi.truncated === false, sesi);

  // 2b. UUID dan status tidak sah ditolak sebelum rangkaian.
  check("list_live_sessions: class_id tidak sah ditolak sebelum rangkaian",
    await ditolakSebelumRangkaian(() =>
      senaraiSesiLangsung(TOKEN, { class_id: "bukan-uuid" })));
  check("list_live_sessions: status asing ditolak sebelum rangkaian",
    await ditolakSebelumRangkaian(() =>
      senaraiSesiLangsung(TOKEN, { status: "paused" })));
  check("list_live_sessions: limit 500 dipotong kepada 100",
    hadLimit(500, SESI_LIMIT_LALAI, SESI_LIMIT_MAKS) === 100, {});

  // 2c. get_live_session_results: laluan keputusan penuh.
  stubFetch({ data: { session_id: UUID_SESI, players: [], questions: [], summary: {} } });
  const keputusan = (await keputusanSesiLangsung(TOKEN, UUID_SESI)) as Record<string, unknown>;
  check("get_live_session_results: laluan dan session_id dipetakan",
    lastUrl.endsWith(`/api/live/sessions/${UUID_SESI}/results`) &&
      (keputusan as { session_id?: string }).session_id === UUID_SESI,
    { lastUrl, keputusan });
  check("get_live_session_results: UUID tidak sah ditolak sebelum rangkaian",
    await ditolakSebelumRangkaian(() => keputusanSesiLangsung(TOKEN, "xyz")));

  // 2d. get_class_scores: sort, limit dan penolakan sebelum rangkaian.
  stubFetch({ data: { students: [], teams: [] }, sort: "task", limit: 300, truncated: false });
  const markah = (await markahKelas(TOKEN, { class_id: UUID_KELAS, sort: "task", limit: 300 })) as Record<string, unknown>;
  const urlMarkah = new URL(lastUrl);
  check("get_class_scores: sort dan limit dipetakan",
    urlMarkah.pathname === `/api/classes/${UUID_KELAS}/scores` &&
      urlMarkah.searchParams.get("sort") === "task" &&
      urlMarkah.searchParams.get("limit") === "300" &&
      markah.truncated === false,
    lastUrl);
  check("get_class_scores: sort asing ditolak sebelum rangkaian",
    await ditolakSebelumRangkaian(() =>
      markahKelas(TOKEN, { class_id: UUID_KELAS, sort: "nama" })));
  check("get_class_scores: limit 1000 dipotong kepada 500",
    hadLimit(1000, 200, MARKAH_LIMIT_MAKS) === 500, {});

  // 2e. get_student_scores: laluan V2-013 sedia ada.
  stubFetch({ name: "Pelajar", totals: {}, activities: [], liveQuizzes: [], adjustments: [] });
  await markahPelajar(TOKEN, UUID_KELAS, UUID_PELAJAR);
  check("get_student_scores: laluan members/[userId]/scores dipetakan",
    lastUrl.endsWith(`/api/classes/${UUID_KELAS}/members/${UUID_PELAJAR}/scores`), lastUrl);
  check("get_student_scores: user_id tidak sah ditolak sebelum rangkaian",
    await ditolakSebelumRangkaian(() => markahPelajar(TOKEN, UUID_KELAS, "bukan-uuid")));

  // 2f. get_hunt_results: laluan keputusan hunt.
  stubFetch({ data: { hunt_id: UUID_HUNT, challenges: [], students: [] } });
  const hunt = (await keputusanHunt(TOKEN, UUID_KELAS, UUID_HUNT)) as Record<string, unknown>;
  check("get_hunt_results: laluan hunts/[huntId]/results dipetakan",
    lastUrl.endsWith(`/api/classes/${UUID_KELAS}/hunts/${UUID_HUNT}/results`) &&
      (hunt as { hunt_id?: string }).hunt_id === UUID_HUNT,
    lastUrl);
  check("get_hunt_results: hunt_id tidak sah ditolak sebelum rangkaian",
    await ditolakSebelumRangkaian(() => keputusanHunt(TOKEN, UUID_KELAS, "xyz")));

  // 2g. get_class_engagement: dengan dan tanpa class_id.
  stubFetch({ data: { kelas: 1 } });
  await engagementKelas(TOKEN, UUID_KELAS);
  const denganKelas = lastUrl;
  await engagementKelas(TOKEN, undefined);
  check("get_class_engagement: class_id pilihan dipetakan dengan betul",
    new URL(denganKelas).searchParams.get("class_id") === UUID_KELAS &&
      lastUrl.endsWith("/api/analytics/engagement") && !lastUrl.includes("?"),
    { denganKelas, lastUrl });

  // 2h. get_class_insights: laluan insights dipanggil sebelum tapisan.
  const insightsContoh = binaInsightsContoh(2);
  stubFetch({ data: insightsContoh });
  const insights = (await insightsKelasAlat(TOKEN, {
    class_id: UUID_KELAS,
    sections: ["pulse", "attention"],
  })) as Record<string, unknown>;
  check("get_class_insights: laluan insights dipetakan",
    lastUrl.endsWith(`/api/classes/${UUID_KELAS}/insights`), lastUrl);

  // 2i. Bahagian tidak sah ditolak sebelum rangkaian.
  check("get_class_insights: bahagian asing ditolak sebelum rangkaian",
    await ditolakSebelumRangkaian(() =>
      insightsKelasAlat(TOKEN, { class_id: UUID_KELAS, sections: ["pulse", "happiness"] })));
}

/* ===== Bahagian 3: eksport CSV ===== */

async function ujianEksport() {
  // 3a. Laluan gembira: sections disertai koma, nama fail dan csv dipulangkan.
  stubFetchText("Students\r\nAli,100\r\n", "kuizen-insights-kelas-all-20260930.csv");
  const csv = await eksportInsightsCsv(TOKEN, {
    class_id: UUID_KELAS,
    sections: ["students", "attention"],
  });
  check("export_class_insights_csv: sections, filename dan csv dipulangkan",
    new URL(lastUrl).pathname === `/api/classes/${UUID_KELAS}/insights/export` &&
      new URL(lastUrl).searchParams.get("sections") === "students,attention" &&
      csv.filename === "kuizen-insights-kelas-all-20260930.csv" &&
      csv.csv === "Students\r\nAli,100\r\n" &&
      csv.truncated === false,
    { lastUrl, csv });
  check("export_class_insights_csv: header Bearer dihantar",
    lastAuth === `Bearer ${TOKEN}`, lastAuth);

  // 3b. CSV melebihi 200 KB dipangkas dengan bendera truncated.
  const besar = "a".repeat(CSV_MAKS_AKSARA + 500);
  stubFetchText(besar, "besar.csv");
  const pangkas = await eksportInsightsCsv(TOKEN, {
    class_id: UUID_KELAS,
    sections: ["all"],
  });
  check("export_class_insights_csv: CSV melebihi 200 KB dipangkas",
    pangkas.truncated === true && pangkas.csv.length === CSV_MAKS_AKSARA,
    { panjang: pangkas.csv.length, truncated: pangkas.truncated });

  // 3c. sections kosong atau tidak sah ditolak sebelum rangkaian.
  check("export_class_insights_csv: sections kosong ditolak sebelum rangkaian",
    await ditolakSebelumRangkaian(() =>
      eksportInsightsCsv(TOKEN, { class_id: UUID_KELAS, sections: [] })));
  check("export_class_insights_csv: sections asing ditolak sebelum rangkaian",
    await ditolakSebelumRangkaian(() =>
      eksportInsightsCsv(TOKEN, { class_id: UUID_KELAS, sections: ["pulse"] })));
}

/* ===== Bahagian 4: tapisan bahagian Insights ===== */

/** Contoh InsightsKelas dengan bilangan pelajar boleh laras. */
function binaInsightsContoh(bilanganPelajar: number): InsightsKelas {
  const pelajar = Array.from({ length: bilanganPelajar }, (_, i) => ({
    user_id: `u-${i}`,
    name: `Pelajar ${i}`,
    task_score: 10,
    live_score: 5,
    adjustment_score: 0,
    total_score: 15,
    rank: i + 1,
    live_sessions: 1,
    answered: 4,
    correct: 2,
    accuracy_pct: 50,
    avg_ms: 3000,
    approved: 1,
    pending: 0,
    rejected: 0,
    last_active: "2026-09-30",
    team_id: null,
    team_name: null,
    trend: [
      { session_id: "s-1", played_at: "2026-09-29", score: 500, pct: 50, quiz_title: "Kuiz", session_ended_at: null },
    ],
    flags: i % 2 === 0 ? ["bottom_20"] : [],
  }));
  return {
    class_id: UUID_KELAS,
    pulse: {
      members: bilanganPelajar,
      avg_total: 15,
      median_total: 15,
      live_participation_pct: 80,
      accuracy_pct: 50,
      pending_reviews: 0,
      live_sessions: 1,
    },
    students: pelajar,
    distribution: { total: [], task: [], live: [] },
    hard_questions: [
      {
        question_id: "q-1",
        quiz_title: "Kuiz",
        prompt: "Soalan susar",
        answered: 5,
        correct_pct: 20,
        avg_ms: 4000,
        top_wrong_choice: { key: "A", label: "Salah", count: 4 },
        correct_label: "Betul",
      },
    ],
    hard_challenges: [
      {
        challenge_id: "c-1",
        title: "Cabaran susar",
        hunt_title: "Hunt",
        submitted: 4,
        approved: 1,
        rejected: 3,
        rejected_pct: 75,
        pending: 0,
      },
    ],
    teams: [
      {
        team_id: "t-1",
        name: "Pasukan A",
        members: 3,
        total_score: 45,
        avg_per_member: 15,
        top_member_share_pct: 40,
        zero_members: 0,
        flag_unbalanced: false,
        member_ids: ["u-1", "u-2", "u-3"],
      },
    ],
    generated_at: "2026-09-30T00:00:00Z",
  } as unknown as InsightsKelas;
}

async function ujianTapisan() {
  // 4a. sahkanBahagianInsights: kosong bermakna semua; entri asing ditolak.
  const semua = sahkanBahagianInsights(undefined);
  check("sahkanBahagianInsights: tiada argumen memberi semua bahagian",
    semua.length === BAHAGIAN_ALAT_INSIGHTS.length, semua);
  let ditolak = false;
  try {
    sahkanBahagianInsights(["pulse", "happiness"]);
  } catch {
    ditolak = true;
  }
  check("sahkanBahagianInsights: entri asing ditolak dengan ralat", ditolak);

  // 4b. Tapisan dua bahagian: hanya kunci yang diminta keluar.
  const dua = tapisBahagianInsights(binaInsightsContoh(3), ["pulse", "attention"]);
  const kunci = Object.keys(dua.sections).sort();
  check("tapisBahagianInsights: hanya bahagian yang diminta",
    kunci.length === 2 && kunci[0] === "attention" && kunci[1] === "pulse" && dua.truncated === false,
    kunci);
  const barisPerhatian = dua.sections.attention as Array<Record<string, unknown>>;
  check("tapisBahagianInsights: attention membawa baris ringkas bendera",
    barisPerhatian.length === 3 &&
      barisPerhatian[0].user_id === "u-0" &&
      Array.isArray(barisPerhatian[0].flags) &&
      !("trend" in barisPerhatian[0]),
    barisPerhatian[0]);

  // 4c. Progress dipotong pada 50 pelajar dengan bendera truncated.
  const progress = tapisBahagianInsights(binaInsightsContoh(60), ["progress"]);
  const barisProgress = progress.sections.progress as Array<Record<string, unknown>>;
  check("tapisBahagianInsights: progress maksimum 50 pelajar dan truncated",
    barisProgress.length === PROGRESS_MAKS && progress.truncated === true,
    { bilangan: barisProgress.length, truncated: progress.truncated });
  const titik = (barisProgress[0].trend as Array<Record<string, unknown>>)[0];
  check("tapisBahagianInsights: titik trend ringkas tanpa session_id",
    titik.played_at === "2026-09-29" && titik.score === 500 && !("session_id" in titik), titik);

  // 4d. Teams: member_ids dibuang, kiraan ahli kekal.
  const teams = tapisBahagianInsights(binaInsightsContoh(2), ["teams"]);
  const pasukan = teams.sections.teams as Array<Record<string, unknown>>;
  check("tapisBahagianInsights: teams tanpa member_ids tetapi membawa members",
    pasukan.length === 1 && pasukan[0].members === 3 && !("member_ids" in pasukan[0]),
    pasukan[0]);

  // 4e. Alat penuh: balasan route diolah menjadi sections + truncated.
  stubFetch({ data: binaInsightsContoh(60) });
  const alat = (await insightsKelasAlat(TOKEN, {
    class_id: UUID_KELAS,
    sections: ["progress", "hard_questions"],
  })) as Record<string, unknown>;
  const seksyen = alat.sections as Record<string, unknown>;
  check("get_class_insights: hasil alat membawa sections dan truncated",
    alat.truncated === true &&
      Object.keys(seksyen).sort().join(",") === "hard_questions,progress" &&
      (seksyen.progress as unknown[]).length === PROGRESS_MAKS,
    alat);
}

async function run() {
  ujianTulen();
  await ujianPemetaan();
  await ujianEksport();
  await ujianTapisan();
  globalThis.fetch = realFetch;
  console.log("");
  console.log(`Jumlah: ${pass} lulus, ${fail} gagal`);
  process.exit(fail > 0 ? 1 : 0);
}

run();
