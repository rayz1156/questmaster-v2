/**
 * Ujian sendiri untuk alat MCP Kuiz Langsung, tanpa pangkalan data.
 *
 * Jalankan:  npx tsx scripts/selftest-mcp-live-quiz.ts
 *
 * Tiga bahagian:
 *   1. pengesahan input (soalan, import, kawalan sesi);
 *   2. gerbang confirm (padam, tamat, reset) dan pautan sesi;
 *   3. penolakan bukan pemilik: fetch digantung supaya 403 daripada route
 *      diperlakukan seperti dalam pengeluaran (ApiError yang dibawa naik).
 *
 * Semua fungsi yang diuji datang daripada src/lib/mcp/live-quiz-tools.ts,
 * yang tidak mengimport session.ts/db.ts, jadi tiada env atau DB diperlukan.
 */
import {
  normalizeLiveQuestionList,
  parseImportArgs,
  checkControlArgs,
  liveSessionLinks,
  addLiveQuestions,
  startLiveSession,
  controlLiveSession,
  deleteLiveQuestion,
} from "../src/lib/mcp/live-quiz-tools";

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
async function checkAsync(name: string, cond: () => Promise<boolean>) {
  check(name, await cond());
}

const okQ = {
  prompt: "Ibu kota Malaysia?",
  option_texts: ["Johor Bahru", "Kuala Lumpur", "Ipoh"],
  correct_key: "B",
};

/* ===== Bahagian 1: pengesahan input ===== */

function ujianInput() {
  const good = normalizeLiveQuestionList([okQ]);
  check("satu soalan sah", good.ok === true && good.ok && good.value[0].points === 1000, good);
  check("kunci dijana daripada option_texts",
    good.ok && good.value[0].options[1].key === "B" && good.value[0].correct_key === "B",
    good.ok && good.value[0]);

  const lower = normalizeLiveQuestionList([{ ...okQ, correct_key: "b" }]);
  check("kunci huruf kecil diterima", lower.ok === true, lower);

  const noPrompt = normalizeLiveQuestionList([{ option_texts: ["A", "B"], correct_key: "A" }]);
  check("prompt kosong ditolak", !noPrompt.ok && /prompt/.test(noPrompt.ok ? "" : noPrompt.error), noPrompt);

  const oneOpt = normalizeLiveQuestionList([{ prompt: "Soal?", option_texts: ["Hanya satu"], correct_key: "A" }]);
  check("satu pilihan ditolak", !oneOpt.ok && /2 and 6/.test(oneOpt.ok ? "" : oneOpt.error), oneOpt);

  const badKey = normalizeLiveQuestionList([{ ...okQ, correct_key: "Z" }]);
  check("kunci di luar pilihan ditolak", !badKey.ok && /correct_key/.test(badKey.ok ? "" : badKey.error), badKey);

  const badPoints = normalizeLiveQuestionList([{ ...okQ, points: 0 }]);
  check("points 0 ditolak", !badPoints.ok && /points/.test(badPoints.ok ? "" : badPoints.error), badPoints);

  const bigPoints = normalizeLiveQuestionList([{ ...okQ, points: 10001 }]);
  check("points melebihi 10000 ditolak", !bigPoints.ok, bigPoints);

  const badTime = normalizeLiveQuestionList([{ ...okQ, time_limit_sec: 3 }]);
  check("masa di bawah 5 saat ditolak", !badTime.ok && /time_limit_sec/.test(badTime.ok ? "" : badTime.error), badTime);

  const countdownOff = normalizeLiveQuestionList([{ ...okQ, use_countdown: false, double_points: true }]);
  check("kira detik boleh dimatikan",
    countdownOff.ok && countdownOff.value[0].use_countdown === false && countdownOff.value[0].double_points === true,
    countdownOff);

  check("senarai kosong ditolak", !normalizeLiveQuestionList([]).ok);
  check("bukan senarai ditolak", !normalizeLiveQuestionList("soalan").ok);
  check("had 100 soalan dikuatkuasa",
    !normalizeLiveQuestionList(Array.from({ length: 101 }, () => okQ)).ok);
  check("100 soalan diterima",
    normalizeLiveQuestionList(Array.from({ length: 100 }, () => okQ)).ok === true);

  // Semua-atau-tiada: soalan kedua rosak, keseluruhan panggilan ditolak.
  const mixed = normalizeLiveQuestionList([okQ, { prompt: "", option_texts: ["A", "B"], correct_key: "A" }]);
  check("satu soalan rosak membatalkan semua", !mixed.ok, mixed);

  /* Bahagian 1b: argumen import */
  check("import: format diperlukan", !parseImportArgs({ content: "x" }).ok);
  check("import: format asing ditolak", !parseImportArgs({ format: "json", content: "x" }).ok);
  check("import: kandungan kosong ditolak", !parseImportArgs({ format: "csv", content: "   " }).ok);
  check("import: kandungan besar ditolak",
    !parseImportArgs({ format: "csv", content: "x".repeat(500_001) }).ok);
  const prev = parseImportArgs({ format: "aiken", content: "soal" });
  check("import: mode lalai ialah preview", prev.ok && prev.ok && prev.mode === "preview", prev);
  check("import: mode asing ditolak", !parseImportArgs({ format: "csv", content: "x", mode: "dry-run" }).ok);
}

/* ===== Bahagian 2: gerbang confirm dan pautan ===== */

function ujianConfirm() {
  check("kawalan: action tiada ditolak", !checkControlArgs({}).ok);
  check("kawalan: action asing ditolak", !checkControlArgs({ action: "pause" }).ok);
  check("kawalan: start tanpa confirm lulus", checkControlArgs({ action: "start" }).ok === true);
  check("kawalan: next tanpa confirm lulus", checkControlArgs({ action: "next" }).ok === true);
  check("kawalan: reveal tanpa confirm lulus", checkControlArgs({ action: "reveal" }).ok === true);
  const endNo = checkControlArgs({ action: "end" });
  check("kawalan: end tanpa confirm ditolak dengan sebab confirm",
    endNo.ok === false && /confirm/.test(endNo.ok === false ? endNo.error : ""), endNo);
  check("kawalan: end dengan confirm lulus", checkControlArgs({ action: "end", confirm: true }).ok === true);
  check("kawalan: reset tanpa confirm ditolak", !checkControlArgs({ action: "reset" }).ok);
  check("kawalan: confirm = false tidak diterima", !checkControlArgs({ action: "end", confirm: false }).ok);

  const links = liveSessionLinks("AB2CD3");
  check("pautan sertai betul", /\/live\/AB2CD3$/.test(links.join_url), links);
  check("pautan QR betul", /\/api\/live\/qr\?code=AB2CD3$/.test(links.qr_url), links);
}

/* ===== Bahagian 3: penolakan bukan pemilik dan laluan gembira ===== */

const TOKEN = "token-palsu";
const realFetch = globalThis.fetch;
let lastCall = { auth: "" };
let networkTouched = false;

// Gantung fetch global: route ialah yang menolak bukan pemilik, jadi kita
// meleka 403 route dan menguji ia naik sebagai ralat yang jelas.
function stubFetch(status: number, payload: unknown) {
  networkTouched = false;
  globalThis.fetch = (async (input: any, init?: any) => {
    networkTouched = true;
    lastCall = { auth: init?.headers?.Authorization ?? "" };
    return new Response(JSON.stringify(payload), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
}
function silentFetch() {
  networkTouched = false;
  globalThis.fetch = (async () => {
    networkTouched = true;
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
}
function authTerhantar() {
  return lastCall.auth === `Bearer ${TOKEN}`;
}

async function ujianPenolakan() {
  // 3a. Route sesi menolak bukan pemilik (requireQuizHost, 403).
  stubFetch(403, { error: "You are not an educator of this class." });
  let ok3a = false;
  try {
    await startLiveSession(TOKEN, "uuid-kuiz");
  } catch (e: any) {
    ok3a = /not an educator of this class/.test(e.message) && authTerhantar();
  }
  check("bukan pemilik: start_live_session menolak dengan mesej route", ok3a);

  // 3b. Route kawalan menolak bukan hos, walaupun confirm sah.
  stubFetch(403, { error: "You are not the host of this session." });
  let ok3b = false;
  try {
    await controlLiveSession(TOKEN, "uuid-sesi", { action: "end", confirm: true });
  } catch (e: any) {
    ok3b = /not the host of this session/.test(e.message) && authTerhantar();
  }
  check("bukan pemilik: control_live_session menolak dengan mesej route", ok3b);

  // 3c. Route soalan menolak: padam dengan confirm sah tetap ditolak di pelayan.
  stubFetch(403, { error: "Question not found." });
  let ok3c = false;
  try {
    await deleteLiveQuestion(TOKEN, "uuid-soalan", true);
  } catch (e: any) {
    ok3c = e.message.length > 0 && authTerhantar();
  }
  check("bukan pemilik: delete_live_question dengan confirm sah tetap ditolak oleh route", ok3c);

  // 3d. Padam tanpa confirm: gerbang melempar SEBELUM rangkaian.
  silentFetch();
  let ok3d = false;
  try {
    await deleteLiveQuestion(TOKEN, "uuid-soalan", undefined);
  } catch (e: any) {
    ok3d = /confirm/.test(e.message) && networkTouched === false;
  }
  check("padam: tanpa confirm dihalang sebelum rangkaian", ok3d);

  // 3e. add_live_questions: pengesahan input berlaku SEBELUM rangkaian.
  silentFetch();
  let ok3e = false;
  try {
    await addLiveQuestions(TOKEN, "uuid-kuiz", [{ prompt: "", option_texts: ["A", "B"], correct_key: "A" }]);
  } catch {
    ok3e = networkTouched === false;
  }
  check("add_live_questions: input rosak ditolak tanpa menyentuh rangkaian", ok3e);

  // 3f. Laluan gembira: satu soalan, POST ke route soalan dengan medan betul.
  const posted: Array<{ url: string; body: any }> = [];
  globalThis.fetch = (async (input: any, init?: any) => {
    posted.push({ url: String(input), body: JSON.parse(init?.body ?? "{}") });
    return new Response(JSON.stringify({ data: { id: "q-1" } }), {
      status: 201,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  const r3f = await addLiveQuestions(TOKEN, "uuid-kuiz", [okQ]);
  check("add_live_questions: soalan sah dihantar ke route soalan",
    r3f.added === 1 &&
      r3f.question_ids[0] === "q-1" &&
      posted[0].url.endsWith("/api/live/quizzes/uuid-kuiz/questions") &&
      posted[0].body.correct_key === "B" &&
      posted[0].body.points === 1000,
    [r3f, posted]);

  // 3g. start_live_session laluan gembira: kod, pautan dan QR.
  stubFetch(201, { data: { sessionId: "s-1", code: "XY3AB9" } });
  const r3g: any = await startLiveSession(TOKEN, "uuid-kuiz");
  check("start_live_session: pulangkan kod, pautan dan QR",
    r3g.session_id === "s-1" &&
      r3g.code === "XY3AB9" &&
      /\/live\/XY3AB9$/.test(r3g.join_url) &&
      /qr\?code=XY3AB9/.test(r3g.qr_url),
    r3g);

  // 3h. end tanpa confirm dihalang sebelum rangkaian.
  silentFetch();
  let ok3h = false;
  try {
    await controlLiveSession(TOKEN, "uuid-sesi", { action: "end" });
  } catch {
    ok3h = networkTouched === false;
  }
  check("control_live_session: end tanpa confirm dihalang sebelum rangkaian", ok3h);

  globalThis.fetch = realFetch;
}

async function run() {
  ujianInput();
  ujianConfirm();
  await ujianPenolakan();
  console.log("");
  console.log(`Jumlah: ${pass} lulus, ${fail} gagal`);
  process.exit(fail > 0 ? 1 : 0);
}

run();
