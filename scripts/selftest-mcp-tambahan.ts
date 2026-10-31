/**
 * Ujian sendiri untuk tool MCP tambahan, tanpa pangkalan data.
 *
 * Jalankan:  npx tsx scripts/selftest-mcp-tambahan.ts
 *
 * Empat bahagian:
 *   1. pendaftaran: nama unik merentas TOOLS, setiap tool tambahan ada
 *      peranan, skema dan handler; tiada nama bertindih dengan tools.ts;
 *   2. gerbang confirm: setiap tool yang memerlukan confirm menolak tanpanya
 *      SEBELUM sebarang panggilan rangkaian atau pangkalan data;
 *   3. tool berasaskan route: laluan, kaedah dan badan yang dihantar ke
 *      route sebenar (fetch tiruan);
 *   4. tool berasaskan RPC dan jadual: nama RPC dan parameter, serta
 *      langkah tanda quest selesai termasuk undur pelarasan bila gagal.
 */
import { TOOLS_TAMBAHAN, normalKodKelas, qs } from "../src/lib/mcp/tambahan-tools";

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

/* ===== Klien RLS tiruan ===== */

type Op = { table?: string; rpc?: string; params?: unknown; chain: { m: string; a: unknown[] }[] };
const ops: Op[] = [];
let jawab: (op: Op) => { data: unknown; error: unknown } = () => ({ data: [], error: null });

function pembina(op: Op): any {
  const p: any = new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (prop === "then") {
          return (res: any, rej: any) => {
            try {
              res(jawab(op));
            } catch (e) {
              rej(e);
            }
          };
        }
        return (...a: unknown[]) => {
          op.chain.push({ m: prop, a });
          return p;
        };
      },
    }
  );
  return p;
}

const db = {
  from(table: string) {
    const op: Op = { table, chain: [] };
    ops.push(op);
    return pembina(op);
  },
  rpc(name: string, params?: unknown) {
    const op: Op = { rpc: name, params, chain: [] };
    ops.push(op);
    return pembina(op);
  },
};

const sesi: any = { userId: "u-saya", email: "saya@x.edu", role: "educator", scope: "kuizen:read kuizen:write", clientId: "c", db, accessToken: "tok" };

/* ===== fetch tiruan ===== */

let panggilan: { url: string; method: string; body: any }[] = [];
let balasFetch: { status: number; payload: unknown } = { status: 200, payload: { ok: true } };
globalThis.fetch = (async (input: any, init?: any) => {
  panggilan.push({ url: String(input), method: init?.method ?? "GET", body: init?.body ? JSON.parse(init.body) : null });
  return new Response(JSON.stringify(balasFetch.payload), { status: balasFetch.status, headers: { "content-type": "application/json" } });
}) as typeof fetch;

function tool(nama: string) {
  const t = TOOLS_TAMBAHAN.find((x) => x.name === nama);
  if (!t) throw new Error("tool tiada: " + nama);
  return t;
}

function reset() {
  ops.length = 0;
  panggilan = [];
  balasFetch = { status: 200, payload: { ok: true } };
  jawab = () => ({ data: [{ id: "x" }], error: null });
}

/* ===== Bahagian 1: pendaftaran ===== */

async function ujianPendaftaran() {
  // tools.ts mengimport session/db, jadi muat secara dinamik dengan env tiruan.
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://localhost";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "anon";
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= "service";
  let semua: { name: string }[] = TOOLS_TAMBAHAN;
  try {
    semua = (await import("../src/lib/mcp/tools")).TOOLS;
  } catch (e: any) {
    console.log("NOTA tools.ts tidak dapat dimuat dalam ujian (" + e?.message + "); semak nama dalam fail tambahan sahaja");
  }
  const nama = semua.map((t) => t.name);
  const ganda = nama.filter((n, i) => nama.indexOf(n) !== i);
  check("nama tool unik merentas TOOLS", ganda.length === 0, ganda);
  check("TOOLS mengandungi semua tool tambahan", TOOLS_TAMBAHAN.every((t) => nama.includes(t.name)));
  for (const t of TOOLS_TAMBAHAN) {
    const ok =
      /^[a-z_]+$/.test(t.name) &&
      t.roles.length > 0 &&
      typeof t.handler === "function" &&
      t.inputSchema?.type === "object" &&
      (t.inputSchema.required ?? []).every((r: string) => r in (t.inputSchema.properties ?? {}));
    if (!ok) check("skema sah: " + t.name, false, t.inputSchema);
  }
  check("skema semua tool tambahan sah (" + TOOLS_TAMBAHAN.length + " tool)", true);
  const tulisTanpaWrite = TOOLS_TAMBAHAN.filter((t) => !t.write && /^(delete|create|update|add|remove|set|mark|unmark|move|import|send|email|join|leave|submit|accept|revoke|transfer|pin|adjust|tag|untag|duplicate|regenerate|ai_)/.test(t.name));
  check("tool bertindak tulis ditanda write: true", tulisTanpaWrite.length === 0, tulisTanpaWrite.map((t) => t.name));
}

/* ===== Bahagian 2: gerbang confirm ===== */

async function ujianConfirm() {
  const perlu = TOOLS_TAMBAHAN.filter((t) => (t.inputSchema.required ?? []).includes("confirm"));
  check("ada tool yang memerlukan confirm", perlu.length >= 15, perlu.length);
  for (const t of perlu) {
    reset();
    const args: Record<string, unknown> = {};
    for (const k of t.inputSchema.required) {
      if (k === "confirm") continue;
      const enumNilai = t.inputSchema.properties?.[k]?.enum;
      args[k] = k === "ratings" ? [{ ratee_id: "r" }] : enumNilai ? enumNilai[0] : "id-1";
    }
    let ralat = "";
    try {
      await t.handler(args, sesi);
    } catch (e: any) {
      ralat = e.message;
    }
    const tiadaKesan = panggilan.length === 0 && ops.every((o) => !o.chain.some((c) => ["delete", "insert", "update"].includes(c.m)) && !o.rpc);
    check("confirm ditolak tanpa kesan: " + t.name, ralat.includes("confirm: true") && tiadaKesan, { ralat, panggilan, ops });
  }
  // import_board hanya memerlukan confirm untuk mode replace.
  reset();
  await tool("import_board").handler({ class_id: "k1", source_class_id: "k0" }, sesi);
  check("import_board append tidak perlu confirm", panggilan[0]?.body?.mode === "append", panggilan);
  reset();
  let r = "";
  try { await tool("import_board").handler({ class_id: "k1", source_class_id: "k0", mode: "replace" }, sesi); } catch (e: any) { r = e.message; }
  check("import_board replace perlu confirm", r.includes("confirm") && panggilan.length === 0, r);
}

/* ===== Bahagian 3: tool berasaskan route ===== */

async function ujianRoute() {
  const kes: [string, Record<string, unknown>, string, string, unknown?][] = [
    ["duplicate_class", { class_id: "k1", new_title: "Baru", copy_members: true }, "POST", "/api/classes/k1/duplicate",
      { newTitle: "Baru", copyActivities: true, copyLearningBoard: true, copyMembers: true, copyEducators: false, asTemplate: false, asDraft: false }],
    ["export_members", { class_id: "k1" }, "GET", "/api/classes/k1/members/export"],
    ["get_member_scores", { class_id: "k1", user_id: "p1" }, "GET", "/api/classes/k1/members/p1/scores"],
    ["list_outcomes", { class_id: "k1" }, "GET", "/api/outcomes?class_id=k1"],
    ["create_outcome", { class_id: "k1", code: "CLO1", label: "Analisis" }, "POST", "/api/outcomes", { class_id: "k1", code: "CLO1", label: "Analisis" }],
    ["update_outcome", { outcome_id: "o1", label: "Baru" }, "PATCH", "/api/outcomes/o1", { label: "Baru" }],
    ["delete_outcome", { outcome_id: "o1", confirm: true }, "DELETE", "/api/outcomes/o1"],
    ["tag_challenge_outcome", { outcome_id: "o1", challenge_id: "c1", weight: 2 }, "POST", "/api/outcomes/o1/tags", { challenge_id: "c1", weight: 2 }],
    ["untag_challenge_outcome", { outcome_id: "o1", challenge_id: "c1" }, "DELETE", "/api/outcomes/o1/tags?challenge_id=c1"],
    ["update_live_quiz", { quiz_id: "q1", streak_bonus: true }, "PATCH", "/api/live/quizzes/q1", { streak_bonus: true }],
    ["delete_live_quiz", { quiz_id: "q1", confirm: true }, "DELETE", "/api/live/quizzes/q1"],
    ["import_live_questions_aiken", { quiz_id: "q1", content: "Soalan?\nA. x\nB. y\nANSWER: A" }, "POST", "/api/live/quizzes/q1/import-aiken"],
    ["regenerate_certificates", { class_id: "k1" }, "POST", "/api/classes/k1/certificates/regenerate", {}],
    ["email_certificates", { class_id: "k1", confirm: true, resend: true }, "POST", "/api/classes/k1/certificates/email", { resend: true }],
    ["delete_certificate_library_item", { library_id: "l1", confirm: true }, "DELETE", "/api/certificate-library/l1"],
    ["get_activity_stats", { class_id: "k1" }, "GET", "/api/analytics/activity-stats?classId=k1"],
    ["get_team_stats", { class_id: "k1" }, "GET", "/api/analytics/team-stats?classId=k1"],
    ["get_mastery_stats", { class_id: "k1" }, "GET", "/api/analytics/mastery?class_id=k1"],
    ["get_gamification_stats", { class_id: "k1" }, "GET", "/api/analytics/gamification?class_id=k1"],
    ["get_at_risk_students", { class_id: "k1" }, "GET", "/api/analytics/at-risk?class_id=k1"],
    ["send_feedback", { subject: "Tajuk", message: "Mesej panjang" }, "POST", "/api/feedback", { subject: "Tajuk", message: "Mesej panjang", type: "other", email: "saya@x.edu" }],
    ["get_peer_form", { round_id: "r1" }, "GET", "/api/peer-rounds/r1/form"],
    ["submit_peer_ratings", { round_id: "r1", ratings: [{ ratee_id: "p2", k1: 4 }], confirm: true }, "POST", "/api/peer-rounds/r1/ratings", { ratings: [{ ratee_id: "p2", k1: 4 }] }],
    ["link_preview", { url: "https://contoh.my/a?b=1" }, "GET", "/api/learning-boards/link-preview?url=https%3A%2F%2Fcontoh.my%2Fa%3Fb%3D1"],
    ["ai_thumbnail_all", { class_id: "k1" }, "POST", "/api/learning-boards/k1/ai-thumbnail-all"],
  ];
  for (const [nama, args, kaedah, laluan, badan] of kes) {
    reset();
    try {
      await tool(nama).handler(args, sesi);
    } catch (e: any) {
      check(nama + " tidak gagal", false, e.message);
      continue;
    }
    const p = panggilan[0];
    const okLaluan = !!p && p.method === kaedah && p.url.endsWith(laluan);
    const okBadan = badan === undefined || JSON.stringify(p?.body) === JSON.stringify(badan);
    check(`${nama}: ${kaedah} ${laluan}`, okLaluan && okBadan, p);
  }

  // Route board dikunci pada class_id: kad dan kolum dipetakan melalui jadual.
  reset();
  jawab = (op) => {
    if (op.table === "qm_learning_cards") return { data: { id: "kad1", board_id: "b1" }, error: null };
    if (op.table === "qm_learning_columns") return { data: { id: "kol1", board_id: "b1" }, error: null };
    if (op.table === "qm_learning_boards") return { data: { id: "b1", class_id: "k9" }, error: null };
    return { data: null, error: null };
  };
  await tool("move_board_card").handler({ card_id: "kad1", action: "to", column_id: "kol2", position: 0 }, sesi);
  check("move_board_card memetakan kad ke kelas dan hantar columnId",
    panggilan[0]?.url.endsWith("/api/learning-boards/k9/cards/kad1/move") && panggilan[0]?.body?.columnId === "kol2" && panggilan[0]?.body?.position === 0,
    panggilan[0]);
  panggilan = [];
  await tool("add_qr_card").handler({ column_id: "kol1", url: "https://x.my" }, sesi);
  check("add_qr_card memetakan kolum ke kelas", panggilan[0]?.url.endsWith("/api/learning-boards/k9/qr-card") && panggilan[0]?.body?.columnId === "kol1", panggilan[0]);
  panggilan = [];
  await tool("delete_board_column").handler({ column_id: "kol1", confirm: true }, sesi);
  check("delete_board_column DELETE pada route kelas", panggilan[0]?.method === "DELETE" && panggilan[0]?.url.endsWith("/api/learning-boards/k9/columns/kol1"), panggilan[0]);
  panggilan = [];
  let r = "";
  try { await tool("move_board_card").handler({ card_id: "kad1", action: "sideways" }, sesi); } catch (e: any) { r = e.message; }
  check("move_board_card menolak action asing", r.includes("action") && panggilan.length === 0, r);

  // Kad yang tidak kelihatan oleh RLS: ralat jelas, tiada panggilan route.
  reset();
  jawab = () => ({ data: null, error: null });
  r = "";
  try { await tool("ai_thumbnail_card").handler({ card_id: "lain" }, sesi); } catch (e: any) { r = e.message; }
  check("kad tidak kelihatan: ralat tanpa panggilan route", r.includes("tidak dijumpai") && panggilan.length === 0, r);
}

/* ===== Bahagian 4: RPC dan jadual ===== */

async function ujianRpcJadual() {
  const rpcKes: [string, Record<string, unknown>, string, unknown][] = [
    ["list_class_educators", { class_id: "k1" }, "qm_list_class_educators", { p_class: "k1" }],
    ["list_educator_invites", { class_id: "k1" }, "qm_list_class_educator_invites", { p_class: "k1" }],
    ["revoke_educator_invite", { invite_id: "i1" }, "qm_revoke_class_educator_invite", { p_invite: "i1" }],
    ["remove_class_educator", { class_id: "k1", educator_id: "e1", confirm: true }, "qm_remove_class_educator", { p_class: "k1", p_educator: "e1" }],
    ["transfer_class_ownership", { class_id: "k1", new_owner_id: "e1", confirm: true }, "qm_transfer_class_ownership", { p_class: "k1", p_new_owner: "e1" }],
    ["accept_educator_invite", { code: "ABCD1234" }, "qm_accept_class_educator_invite_by_code", { p_code: "ABCD1234" }],
    ["set_active_certificate_template", { template_id: "t1" }, "qm_set_active_certificate_template", { p_template: "t1" }],
    ["delete_certificate_template", { template_id: "t1", confirm: true }, "qm_delete_certificate_template", { p_template: "t1" }],
    ["join_class_by_code", { code: "ab-cd 12o1" }, "qm_join_class_by_code", { p_code: "ABCD1201" }],
    ["leave_class", { class_id: "k1", confirm: true }, "qm_leave_class_as_student", { p_class: "k1" }],
    ["peer_my_status", { round_id: "r1" }, "qm_peer_my_status", { p_round: "r1" }],
    ["get_plan_usage", {}, "qm_my_plan_usage", undefined],
  ];
  for (const [nama, args, rpc, params] of rpcKes) {
    reset();
    await tool(nama).handler(args, sesi);
    const o = ops.find((x) => x.rpc);
    check(`${nama}: rpc ${rpc}`, o?.rpc === rpc && JSON.stringify(o?.params) === JSON.stringify(params), o);
  }
  check("normalKodKelas sepadan data.ts", normalKodKelas("ab-cd 12o1 il") === "ABCD1201" + "11");
  check("qs abaikan nilai kosong", qs({ a: 1, b: "", c: undefined, d: "x y" }) === "?a=1&d=x+y");

  // RPC gagal: mesej ralat naik dengan nama tindakan.
  reset();
  jawab = () => ({ data: null, error: { message: "not owner" } });
  let r = "";
  try { await tool("revoke_educator_invite").handler({ invite_id: "i1" }, sesi); } catch (e: any) { r = e.message; }
  check("ralat RPC dilaporkan", r.includes("not owner"), r);

  // Padam kelas: baris sifar (RLS menolak) jadi ralat, bukan kejayaan palsu.
  reset();
  jawab = () => ({ data: [], error: null });
  r = "";
  try { await tool("delete_class").handler({ class_id: "k1", confirm: true }, sesi); } catch (e: any) { r = e.message; }
  check("delete_class baris sifar jadi ralat", r.includes("hanya pemilik"), r);

  // Cipta pasukan pukal.
  reset();
  await tool("create_team").handler({ class_id: "k1", count: 3, prefix: "Kump", max_members: 4 }, sesi);
  const ins = ops[0]?.chain.find((c) => c.m === "insert")?.a[0] as any[];
  check("create_team count menamakan Kump 1..3", Array.isArray(ins) && ins.length === 3 && ins[2].name === "Kump 3" && ins[0].max_members === 4, ins);

  // Laras markah: created_by ialah pengguna sesi, bukan argumen.
  reset();
  jawab = () => ({ data: { id: "adj" }, error: null });
  await tool("adjust_student_score").handler({ class_id: "k1", user_id: "p1", delta: -5, reason: "lewat", created_by: "orang-lain" }, sesi);
  const ins2 = ops[0]?.chain.find((c) => c.m === "insert")?.a[0] as any;
  check("adjust_student_score created_by = pengguna sesi", ins2?.created_by === "u-saya" && ins2?.delta === -5, ins2);
  r = "";
  try { await tool("adjust_team_score").handler({ team_id: "t1", delta: "10" }, sesi); } catch (e: any) { r = e.message; }
  check("adjust_team_score menolak delta bukan nombor", r.includes("delta"), r);

  // Tanda quest selesai: rekod selesai ditolak, pelarasan diundur.
  reset();
  jawab = (op) => {
    if (op.table === "qm_hunts") return { data: { id: "h1", points: 50, title: "Quest A" }, error: null };
    if (op.table === "qm_score_adjustments") return { data: { id: "adj-1" }, error: null };
    if (op.table === "qm_team_quest_completions") return { data: null, error: { message: "duplicate key" } };
    return { data: null, error: null };
  };
  r = "";
  try { await tool("mark_quest_completed").handler({ hunt_id: "h1", team_id: "t1" }, sesi); } catch (e: any) { r = e.message; }
  const undur = ops.some((o) => o.table === "qm_score_adjustments" && o.chain.some((c) => c.m === "delete"));
  const beri = ops.find((o) => o.table === "qm_score_adjustments" && o.chain.some((c) => c.m === "insert"));
  const insAdj = beri?.chain.find((c) => c.m === "insert")?.a[0] as any;
  check("mark_quest_completed undur pelarasan bila gagal", r.includes("duplicate") && undur, { r, ops });
  check("mark_quest_completed beri mata aktiviti", insAdj?.delta === 50 && insAdj?.reason === "Quest completed: Quest A", insAdj);
}

(async () => {
  await ujianPendaftaran();
  await ujianConfirm();
  await ujianRoute();
  await ujianRpcJadual();
  console.log(`\n${pass} lulus, ${fail} gagal`);
  process.exit(fail === 0 ? 0 : 1);
})();
