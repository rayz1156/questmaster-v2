/**
 * Ujian sendiri untuk alat MCP penilaian rakan dan jemputan pendidik,
 * tanpa pangkalan data.
 *
 * Jalankan:  npx tsx scripts/selftest-mcp-penilaian.ts
 *
 * Lima bahagian:
 *   1. pengesahan argumen create/update pusingan (tarikh, minggu, kosong);
 *   2. panggilan peer-rounds melalui fetch tiruan: laluan gembira, 403
 *      route, dan gerbang confirm padam;
 *   3. jemputan pendidik: pengesahan argumen, laluan gembira, send_email,
 *      dan kegagalan emel yang tidak membatalkan jemputan;
 *   4. clampLiveQuizLimit: pembetulan limit list_live_quizzes;
 *   5. penolakan bukan pemilik: mesej route naik sebagai ralat jelas.
 *
 * Semua fungsi yang diuji datang daripada src/lib/mcp/peer-tools.ts,
 * src/lib/mcp/invite-tools.ts dan src/lib/mcp/tools.ts (clampLiveQuizLimit),
 * yang tidak memerlukan pangkalan data.
 */
import {
  buildCreateRoundBody,
  buildUpdateRoundBody,
  createPeerRound,
  updatePeerRound,
  computePeerRound,
  getPeerResults,
  deletePeerRound,
  listPeerRounds,
} from "../src/lib/mcp/peer-tools";
import { checkInviteArgs, inviteEducator } from "../src/lib/mcp/invite-tools";
import { clampLiveQuizLimit } from "../src/lib/mcp/tools";

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

const ISO_OPEN = "2026-10-01T00:00:00Z";
const ISO_CLOSE = "2026-10-14T23:59:59Z";

/* ===== Bahagian 1: pengesahan argumen pusingan ===== */

function ujianArgumen() {
  const good = buildCreateRoundBody({ name: "  Minggu 1  ", opens_at: ISO_OPEN, closes_at: ISO_CLOSE, week: 1 });
  check("cipta: nama dipotong ruang dan tarikh di-ISO",
    good.ok && good.body.name === "Minggu 1" && good.body.week === 1, good);

  const tanpaWeek = buildCreateRoundBody({ name: "R1", opens_at: ISO_OPEN, closes_at: ISO_CLOSE });
  check("cipta: week ditinggalkan tidak dihantar",
    tanpaWeek.ok && !("week" in tanpaWeek.body), tanpaWeek);

  check("cipta: nama kosong ditolak", !buildCreateRoundBody({ name: "  ", opens_at: ISO_OPEN, closes_at: ISO_CLOSE }).ok);
  check("cipta: opens_at tidak sah ditolak", !buildCreateRoundBody({ name: "R", opens_at: "bukan-tarikh", closes_at: ISO_CLOSE }).ok);
  check("cipta: closes_at sebelum opens_at ditolak",
    !buildCreateRoundBody({ name: "R", opens_at: ISO_CLOSE, closes_at: ISO_OPEN }).ok);
  check("cipta: week 0 ditolak", !buildCreateRoundBody({ name: "R", opens_at: ISO_OPEN, closes_at: ISO_CLOSE, week: 0 }).ok);
  check("cipta: week 53 ditolak", !buildCreateRoundBody({ name: "R", opens_at: ISO_OPEN, closes_at: ISO_CLOSE, week: 53 }).ok);
  check("cipta: week perpuluhan ditolak",
    !buildCreateRoundBody({ name: "R", opens_at: ISO_OPEN, closes_at: ISO_CLOSE, week: 2.5 }).ok);

  const upd = buildUpdateRoundBody({ name: "Baru", closes_at: ISO_CLOSE });
  check("kemas kini: hanya medan yang diberi",
    upd.ok && Object.keys(upd.body).length === 2, upd);

  check("kemas kini: tiada medan ditolak", !buildUpdateRoundBody({}).ok);
  check("kemas kini: name kosong ditolak", !buildUpdateRoundBody({ name: "" }).ok);
  check("kemas kini: kedua tarikh terbalik ditolak",
    !buildUpdateRoundBody({ opens_at: ISO_CLOSE, closes_at: ISO_OPEN }).ok);
  check("kemas kini: opens_at sebelah sahaja diterima",
    buildUpdateRoundBody({ opens_at: ISO_OPEN }).ok === true);
}

/* ===== Bahagian 2: panggilan peer-rounds melalui fetch tiruan ===== */

const TOKEN = "token-palsu";
const realFetch = globalThis.fetch;
let lastCall: { url: string; method: string; body: any; auth: string } | null = null;

function stubFetch(status: number, payload: unknown) {
  globalThis.fetch = (async (input: any, init?: any) => {
    lastCall = {
      url: String(input),
      method: init?.method ?? "GET",
      body: init?.body ? JSON.parse(init.body) : null,
      auth: init?.headers?.Authorization ?? "",
    };
    return new Response(JSON.stringify(payload), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
}

async function ujianPanggilan() {
  // 2a. Senarai.
  stubFetch(200, { rounds: [{ id: "pr-1", name: "Minggu 1" }] });
  const r2a = await listPeerRounds(TOKEN, "kelas-1");
  check("senarai: GET ke laluan peer-rounds dengan Bearer",
    lastCall?.url.endsWith("/api/classes/kelas-1/peer-rounds") === true &&
      lastCall?.method === "GET" &&
      lastCall?.auth === `Bearer ${TOKEN}` &&
      Array.isArray((r2a as any).rounds) &&
      (r2a as any).rounds[0].name === "Minggu 1",
    { last: lastCall, r: r2a });

  // 2b. Cipta: badan dipos pada route.
  stubFetch(201, { round: { id: "pr-2", name: "Minggu 2" } });
  const r2b = await createPeerRound(TOKEN, "kelas-1", { name: "Minggu 2", opens_at: ISO_OPEN, closes_at: ISO_CLOSE });
  check("cipta: POST badan betul dan pulangkan round",
    lastCall?.method === "POST" && lastCall?.body.name === "Minggu 2" && (r2b as any).round.id === "pr-2",
    { last: lastCall, r: r2b });

  // 2c. Kemas kini.
  stubFetch(200, { round: { id: "pr-2", name: "Baru" } });
  const r2c = await updatePeerRound(TOKEN, "kelas-1", "pr-2", { name: "Baru" });
  check("kemas kini: PATCH ke laluan pusingan",
    lastCall?.url.endsWith("/api/classes/kelas-1/peer-rounds/pr-2") === true &&
      lastCall?.method === "PATCH" &&
      lastCall?.body.name === "Baru" &&
      (r2c as any).round.name === "Baru",
    { last: lastCall, r: r2c });

  // 2d. Kira.
  stubFetch(200, { written: 12 });
  const r2d = await computePeerRound(TOKEN, "kelas-1", "pr-2");
  check("kira: POST ke laluan compute dan pulangkan written",
    lastCall?.url.endsWith("/peer-rounds/pr-2/compute") === true && (r2d as any).written === 12,
    { last: lastCall, r: r2d });

  // 2e. Keputusan: balasan laluan dihantar balik tanpa diubah.
  stubFetch(200, {
    round: { id: "pr-2", name: "Baru" },
    results: [{ user_id: "u-1", p: 3.5 }],
    justifications: [{ ratee_id: "u-1", justification: "bagus" }],
    not_submitted: [],
  });
  const r2e = await getPeerResults(TOKEN, "kelas-1", "pr-2");
  check("keputusan: struktur laluan dipulangkan tanpa peta semula",
    (r2e as any).results?.[0]?.user_id === "u-1" && (r2e as any).justifications?.length === 1,
    r2e);

  // 2f. Padam: gerbang confirm SEBELUM rangkaian.
  globalThis.fetch = (async () => {
    throw new Error("rangkaian tidak patut disentuh");
  }) as typeof fetch;
  let ok2f = false;
  try {
    await deletePeerRound(TOKEN, "kelas-1", "pr-2", undefined);
  } catch (e: any) {
    ok2f = /confirm/.test(e.message);
  }
  check("padam: tanpa confirm dihalang sebelum rangkaian", ok2f);

  // 2g. Padam dengan confirm: DELETE dihantar.
  stubFetch(200, { ok: true });
  const r2g = await deletePeerRound(TOKEN, "kelas-1", "pr-2", true);
  check("padam: confirm true menghantar DELETE",
    lastCall?.method === "DELETE" && (r2g as any).deleted === true && (r2g as any).round_id === "pr-2",
    { last: lastCall, r: r2g });

  // 2h. 409 route (pusingan sudah ada penilaian): mesej naik sebagai ralat.
  stubFetch(409, { error: "This round already has submitted evaluations and cannot be deleted." });
  let ok2h = false;
  try {
    await deletePeerRound(TOKEN, "kelas-1", "pr-3", true);
  } catch (e: any) {
    ok2h = /already has submitted evaluations/.test(e.message);
  }
  check("padam: 409 route dikekalkan sebagai mesej jelas", ok2h);

  // 2i. Argumen rosak dihalang sebelum rangkaian.
  globalThis.fetch = (async () => {
    throw new Error("rangkaian tidak patut disentuh");
  }) as typeof fetch;
  let ok2i = false;
  try {
    await createPeerRound(TOKEN, "kelas-1", { name: "", opens_at: "x", closes_at: "y" });
  } catch {
    ok2i = true;
  }
  check("cipta: argumen rosak ditolak tanpa menyentuh rangkaian", ok2i);
}

/* ===== Bahagian 3: jemputan pendidik ===== */

async function ujianJemputan() {
  // 3a. Pengesahan argumen.
  check("jemputan: class_id diperlukan", !checkInviteArgs({ email: "a@b.co" }).ok);
  check("jemputan: email diperlukan", !checkInviteArgs({ class_id: "c1" }).ok);
  check("jemputan: emel tanpa @ ditolak", !checkInviteArgs({ class_id: "c1", email: "bukan-emel" }).ok);
  check("jemputan: send_email bukan boolean ditolak",
    !checkInviteArgs({ class_id: "c1", email: "a@b.co", send_email: "ya" }).ok);
  const ok3 = checkInviteArgs({ class_id: " c1 ", email: " A@B.co ", send_email: true });
  check("jemputan: argumen sah dipotong ruang", ok3.ok && ok3.classId === "c1" && ok3.email === "A@B.co" && ok3.sendEmail, ok3);

  // 3b. Laluan gembira tanpa send_email: satu panggilan sahaja.
  const calls: Array<{ url: string; body: any }> = [];
  globalThis.fetch = (async (input: any, init?: any) => {
    calls.push({ url: String(input), body: init?.body ? JSON.parse(init.body) : null });
    return new Response(JSON.stringify({ ok: true, token: "TOK12345", link: "https://kuizen.fun/join/TOK12345", sent: false }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  const r3b = await inviteEducator(TOKEN, { class_id: "kelas-1", email: "guru@sekolah.edu" });
  check("jemputan: POST ke route invite dengan emel",
    calls.length === 1 &&
      calls[0].url.endsWith("/api/classes/kelas-1/invite") &&
      calls[0].body.email === "guru@sekolah.edu",
    calls);
  check("jemputan: token dan pautan dipulangkan, tiada emel dihantar",
    (r3b as any).token === "TOK12345" && (r3b as any).invite_email_sent === false && (r3b as any).email_sent === undefined,
    r3b);

  // 3c. send_email: true meneruskan panggilan ke route notify dengan kod.
  calls.length = 0;
  const r3c = await inviteEducator(TOKEN, { class_id: "kelas-1", email: "guru@sekolah.edu", send_email: true });
  check("jemputan: send_email memanggil route notify dengan kod jemputan",
    calls.length === 2 &&
      calls[1].url.endsWith("/api/educator-invites/notify") &&
      calls[1].body.classId === "kelas-1" &&
      calls[1].body.code === "TOK12345" &&
      (r3c as any).email_sent === true,
    { calls, r: r3c });

  // 3d. Emel gagal: jemputan tetap sah, ralat dilaporkan dalam email_error.
  globalThis.fetch = (async (input: any) => {
    if (String(input).endsWith("/notify")) {
      return new Response(JSON.stringify({ error: "SMTP not configured" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ ok: true, token: "TOK67890", link: "https://kuizen.fun/join/TOK67890", sent: false }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  const r3d = await inviteEducator(TOKEN, { class_id: "kelas-1", email: "guru@sekolah.edu", send_email: true });
  check("jemputan: kegagalan emel tidak membatalkan jemputan",
    (r3d as any).token === "TOK67890" && (r3d as any).email_sent === false && /SMTP/.test(String((r3d as any).email_error)),
    r3d);

  // 3e. 403 route (bukan pemilik): mesej route naik.
  stubFetch(403, { error: "Forbidden" });
  let ok3e = false;
  try {
    await inviteEducator(TOKEN, { class_id: "kelas-lain", email: "guru@sekolah.edu" });
  } catch (e: any) {
    ok3e = /Forbidden/.test(e.message);
  }
  check("jemputan: 403 route menolak dengan mesej kebenaran", ok3e);

  // 3f. 400 route (emel tidak sah): mesej naik.
  stubFetch(400, { error: "Invalid email" });
  let ok3f = false;
  try {
    await inviteEducator(TOKEN, { class_id: "kelas-1", email: "a b@c.co" });
  } catch (e: any) {
    ok3f = /Invalid email/.test(e.message);
  }
  check("jemputan: emel berjarak lulus gerbang tetap ditolak oleh route", ok3f);

  globalThis.fetch = realFetch;
}

/* ===== Bahagian 4: pembetulan limit list_live_quizzes ===== */

function ujianLimit() {
  check("limit: tiada argumen jatuh ke 50", clampLiveQuizLimit(undefined) === 50, clampLiveQuizLimit(undefined));
  check("limit: null jatuh ke 50", clampLiveQuizLimit(null) === 50);
  check("limit: 10 dihormati", clampLiveQuizLimit(10) === 10);
  check("limit: 200 dihormati", clampLiveQuizLimit(200) === 200);
  check("limit: 500 dipotong ke 200", clampLiveQuizLimit(500) === 200);
  check("limit: 0 jatuh ke 50", clampLiveQuizLimit(0) === 50);
  check("limit: negatif jatuh ke 50", clampLiveQuizLimit(-5) === 50);
  check("limit: perpuluhan dibulat ke bawah", clampLiveQuizLimit(7.9) === 7);
  check("limit: bukan nombor jatuh ke 50", clampLiveQuizLimit("banyak") === 50);
}

async function run() {
  ujianArgumen();
  await ujianPanggilan();
  await ujianJemputan();
  ujianLimit();
  console.log("");
  console.log(`Jumlah: ${pass} lulus, ${fail} gagal`);
  process.exit(fail > 0 ? 1 : 0);
}

run();
