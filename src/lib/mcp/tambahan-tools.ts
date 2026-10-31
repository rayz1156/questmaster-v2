// lib/mcp/tambahan-tools.ts
//
// Tool MCP tambahan yang meliputi tindakan pendidik dan peserta yang belum
// ada dalam tools.ts: pengurusan kelas, pendidik bersama, pasukan, markah
// manual, quest selesai, Outcomes, operasi lanjutan learning board, Live
// Quiz, sijil, analitik dan beberapa tindakan peserta.
//
// Sumber setiap tool, mengikut keutamaan peraturan dalam api.ts:
//   1. Route aplikasi sedia ada (callApi) bila route itu wujud.
//   2. RPC qm_* yang dipanggil pelayar terus, melalui s.db.rpc. Logik
//      perniagaan berada dalam fungsi SQL itu sendiri, jadi tool tidak
//      menyalinnya.
//   3. Tulisan jadual terus melalui s.db (klien terikat RLS), HANYA bila
//      aplikasi sendiri berbuat demikian dari pelayar tanpa route. Setiap
//      kes sedemikian mengikut fungsi sepadan dalam src/lib/data.ts.
//
// Fail ini sengaja tidak mengimport session.ts atau db.ts (hanya jenis), jadi
// scripts/selftest-mcp-tambahan.ts boleh mengujinya dengan fetch dan klien
// RLS tiruan tanpa pangkalan data.

import type { McpSession, Role } from "./session";
import type { ToolDef } from "./tools";
import { callApi, callApiText } from "./api";
import { TABLES } from "./schema";

const ALL: Role[] = ["admin", "educator", "participant"];
const STAFF: Role[] = ["admin", "educator"];

// ---------------------------------------------------------------------------
// Bantuan
// ---------------------------------------------------------------------------

/** Ambil argumen rentetan wajib, buang ruang kosong di hujung. */
export function wajib(args: Record<string, unknown>, kunci: string): string {
  const v = args?.[kunci];
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) throw new Error(`${kunci} diperlukan`);
  return s;
}

/** Gerbang untuk tindakan yang memadam atau tidak boleh diundur. */
export function sahkan(args: Record<string, unknown>, tindakan: string): void {
  if (args?.confirm !== true) {
    throw new Error(`Tetapkan confirm: true untuk ${tindakan}. Tindakan ini tidak boleh diundur.`);
  }
}

/** Nombor wajib (integer atau perpuluhan), bukan NaN. */
function nombor(args: Record<string, unknown>, kunci: string): number {
  const v = args?.[kunci];
  if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`${kunci} mesti nombor`);
  return v;
}

/** Bina rentetan pertanyaan daripada nilai yang ditakrifkan sahaja. */
export function qs(params: Record<string, unknown>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

/** Hanya salin kunci yang disenarai dan ditakrifkan, untuk badan PATCH. */
export function pilih(args: Record<string, unknown>, kunci: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of kunci) if (args?.[k] !== undefined) out[k] = args[k];
  return out;
}

function semakRalat(res: { error: any }, apa: string): void {
  if (res.error) throw new Error(`${apa} gagal: ${res.error.message}`);
}

async function panggilRpc<T = unknown>(
  s: McpSession,
  nama: string,
  params: Record<string, unknown> | undefined,
  apa: string
): Promise<T> {
  const res = await s.db.rpc(nama, params);
  semakRalat(res, apa);
  return res.data as T;
}

/**
 * Normalisasi kod kelas, sama seperti normalizeClassCode dalam
 * src/lib/data.ts dan SQL qm_normalize_class_code (migrasi 0038). Disalin
 * kerana data.ts mengimport klien Supabase pelayar.
 */
export function normalKodKelas(s: string): string {
  return s.toUpperCase().replace(/[\s\-_]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
}

/** Route board dikunci pada class_id. Petakan board, kolum atau kad kepadanya. */
async function kelasBagiBoard(s: McpSession, boardId: string): Promise<string> {
  const res = await s.db.from(TABLES.boards).select("id, class_id").eq("id", boardId).maybeSingle();
  semakRalat(res, "Dapatkan board");
  if (!res.data) throw new Error("Board tidak dijumpai atau anda tiada akses kepadanya");
  return (res.data as { class_id: string }).class_id;
}

async function kelasBagiKolum(s: McpSession, columnId: string): Promise<string> {
  const res = await s.db.from(TABLES.boardColumns).select("id, board_id").eq("id", columnId).maybeSingle();
  semakRalat(res, "Dapatkan kolum");
  if (!res.data) throw new Error("Kolum tidak dijumpai atau anda tiada akses kepadanya");
  return kelasBagiBoard(s, (res.data as { board_id: string }).board_id);
}

async function kelasBagiKad(s: McpSession, cardId: string): Promise<string> {
  const res = await s.db.from(TABLES.boardCards).select("id, board_id").eq("id", cardId).maybeSingle();
  semakRalat(res, "Dapatkan kad");
  if (!res.data) throw new Error("Kad tidak dijumpai atau anda tiada akses kepadanya");
  return kelasBagiBoard(s, (res.data as { board_id: string }).board_id);
}

const MOVE_ACTIONS = ["up", "down", "top", "bottom", "to"];

const CONFIRM_PROP = { type: "boolean", description: "Wajib true. Tindakan ini tidak boleh diundur." };

// ---------------------------------------------------------------------------
// Senarai tool
// ---------------------------------------------------------------------------

export const TOOLS_TAMBAHAN: ToolDef[] = [
  // === Kelas ===
  {
    name: "delete_class",
    title: "Padam kelas",
    description:
      "Padam kelas secara kekal bersama aktiviti, pasukan, board dan markahnya. Hanya pemilik kelas atau admin " +
      "(dikuatkuasa oleh RLS). Untuk sekadar menamatkan atau menyembunyikan kelas, guna set_class_status. Wajib confirm: true.",
    roles: STAFF,
    write: true,
    inputSchema: {
      type: "object",
      properties: { class_id: { type: "string" }, confirm: CONFIRM_PROP },
      required: ["class_id", "confirm"],
    },
    handler: async (args, s) => {
      const classId = wajib(args, "class_id");
      sahkan(args, "memadam kelas");
      // Sama seperti deleteClass dalam data.ts; tiada route untuk ini.
      const res = await s.db.from(TABLES.classes).delete().eq("id", classId).select("id");
      semakRalat(res, "Padam kelas");
      if (!res.data || res.data.length === 0) {
        throw new Error("Kelas tidak dipadam: hanya pemilik kelas atau admin boleh memadamnya");
      }
      return { ok: true, deleted_class_id: classId };
    },
  },
  {
    name: "duplicate_class",
    title: "Salin kelas",
    description:
      "Salin kelas kepada kelas baharu milik anda. Pilih apa yang disalin: aktiviti, learning board, peserta, " +
      "pendidik bersama. as_template: salin struktur sahaja tanpa kandungan. as_draft: aktiviti jadi draft dan board " +
      "tidak diterbitkan. Hanya pemilik kelas.",
    roles: STAFF,
    write: true,
    inputSchema: {
      type: "object",
      properties: {
        class_id: { type: "string" },
        new_title: { type: "string", description: "Lalai: Copy of <nama asal>" },
        copy_activities: { type: "boolean", default: true },
        copy_learning_board: { type: "boolean", default: true },
        copy_members: { type: "boolean", default: false },
        copy_educators: { type: "boolean", default: false },
        as_template: { type: "boolean", default: false },
        as_draft: { type: "boolean", default: false },
      },
      required: ["class_id"],
    },
    handler: async (args, s) =>
      callApi(s.accessToken, `/api/classes/${wajib(args, "class_id")}/duplicate`, {
        method: "POST",
        body: {
          newTitle: args.new_title,
          copyActivities: args.copy_activities !== false,
          copyLearningBoard: args.copy_learning_board !== false,
          copyMembers: args.copy_members === true,
          copyEducators: args.copy_educators === true,
          asTemplate: args.as_template === true,
          asDraft: args.as_draft === true,
        },
      }),
  },
  {
    name: "pin_class",
    title: "Sematkan kelas",
    description: "Sematkan kelas di bahagian atas senarai kelas anda, atau tanggalkan sematannya (pinned: false).",
    roles: ALL,
    write: true,
    inputSchema: {
      type: "object",
      properties: { class_id: { type: "string" }, pinned: { type: "boolean", default: true } },
      required: ["class_id"],
    },
    handler: async (args, s) => {
      const classId = wajib(args, "class_id");
      // Sama seperti pinClass / unpinClass dalam data.ts.
      const res =
        args.pinned === false
          ? await s.db.from("qm_class_pins").delete().eq("class_id", classId).eq("user_id", s.userId)
          : await s.db.from("qm_class_pins").insert({ user_id: s.userId, class_id: classId });
      // 23505: kelas sudah disematkan. Itu keadaan yang diminta, bukan ralat.
      if (res.error && res.error.code !== "23505") semakRalat(res, "Sematan kelas");
      return { ok: true, class_id: classId, pinned: args.pinned !== false };
    },
  },
  {
    name: "remove_member",
    title: "Keluarkan peserta",
    description:
      "Keluarkan seorang peserta daripada kelas. Hantaran dan markah lamanya kekal dalam pangkalan data. " +
      "Pemilik kelas, pendidik bersama atau admin. Wajib confirm: true.",
    roles: STAFF,
    write: true,
    inputSchema: {
      type: "object",
      properties: { class_id: { type: "string" }, user_id: { type: "string" }, confirm: CONFIRM_PROP },
      required: ["class_id", "user_id", "confirm"],
    },
    handler: async (args, s) => {
      const classId = wajib(args, "class_id");
      const userId = wajib(args, "user_id");
      sahkan(args, "mengeluarkan peserta");
      const res = await s.db
        .from(TABLES.members)
        .delete()
        .eq("class_id", classId)
        .eq("user_id", userId)
        .select("user_id");
      semakRalat(res, "Keluarkan peserta");
      if (!res.data || res.data.length === 0) {
        throw new Error("Tiada peserta dikeluarkan: pengguna bukan ahli kelas atau anda tiada hak");
      }
      return { ok: true, class_id: classId, removed_user_id: userId };
    },
  },
  {
    name: "export_members",
    title: "Eksport peserta dan markah",
    description:
      "Senarai peserta kelas bersama pecahan markah (task_score, live_score, adjustment_score, total_score), " +
      "sama seperti butang Export di halaman People.",
    roles: STAFF,
    write: false,
    inputSchema: { type: "object", properties: { class_id: { type: "string" } }, required: ["class_id"] },
    handler: async (args, s) => callApi(s.accessToken, `/api/classes/${wajib(args, "class_id")}/members/export`),
  },
  {
    name: "get_member_scores",
    title: "Markah seorang peserta",
    description: "Pecahan markah terperinci seorang peserta dalam kelas.",
    roles: ALL,
    write: false,
    inputSchema: {
      type: "object",
      properties: { class_id: { type: "string" }, user_id: { type: "string" } },
      required: ["class_id", "user_id"],
    },
    handler: async (args, s) =>
      callApi(s.accessToken, `/api/classes/${wajib(args, "class_id")}/members/${wajib(args, "user_id")}/scores`),
  },

  // === Pendidik bersama ===
  {
    name: "list_class_educators",
    title: "Senarai pendidik kelas",
    description: "Senarai pemilik dan pendidik bersama sesuatu kelas, dengan peranan dan tarikh terima.",
    roles: STAFF,
    write: false,
    inputSchema: { type: "object", properties: { class_id: { type: "string" } }, required: ["class_id"] },
    handler: async (args, s) =>
      panggilRpc(s, "qm_list_class_educators", { p_class: wajib(args, "class_id") }, "Senarai pendidik"),
  },
  {
    name: "list_educator_invites",
    title: "Senarai jemputan pendidik",
    description: "Senarai jemputan pendidik bersama untuk sesuatu kelas yang belum diterima atau dibatalkan.",
    roles: STAFF,
    write: false,
    inputSchema: { type: "object", properties: { class_id: { type: "string" } }, required: ["class_id"] },
    handler: async (args, s) =>
      panggilRpc(s, "qm_list_class_educator_invites", { p_class: wajib(args, "class_id") }, "Senarai jemputan"),
  },
  {
    name: "revoke_educator_invite",
    title: "Batal jemputan pendidik",
    description: "Batalkan jemputan pendidik bersama (invite_id daripada list_educator_invites). Kod jemputan berhenti berfungsi.",
    roles: STAFF,
    write: true,
    inputSchema: { type: "object", properties: { invite_id: { type: "string" } }, required: ["invite_id"] },
    handler: async (args, s) => {
      await panggilRpc(s, "qm_revoke_class_educator_invite", { p_invite: wajib(args, "invite_id") }, "Batal jemputan");
      return { ok: true };
    },
  },
  {
    name: "remove_class_educator",
    title: "Buang pendidik bersama",
    description: "Buang seorang pendidik bersama daripada kelas. Pemilik kelas sahaja. Wajib confirm: true.",
    roles: STAFF,
    write: true,
    inputSchema: {
      type: "object",
      properties: { class_id: { type: "string" }, educator_id: { type: "string" }, confirm: CONFIRM_PROP },
      required: ["class_id", "educator_id", "confirm"],
    },
    handler: async (args, s) => {
      const p = { p_class: wajib(args, "class_id"), p_educator: wajib(args, "educator_id") };
      sahkan(args, "membuang pendidik bersama");
      await panggilRpc(s, "qm_remove_class_educator", p, "Buang pendidik");
      return { ok: true };
    },
  },
  {
    name: "transfer_class_ownership",
    title: "Pindah milik kelas",
    description:
      "Pindahkan pemilikan kelas kepada pendidik bersama yang sudah menerima jemputan. Anda kekal sebagai pendidik " +
      "bersama. Pemilik kelas sahaja. Wajib confirm: true.",
    roles: STAFF,
    write: true,
    inputSchema: {
      type: "object",
      properties: { class_id: { type: "string" }, new_owner_id: { type: "string" }, confirm: CONFIRM_PROP },
      required: ["class_id", "new_owner_id", "confirm"],
    },
    handler: async (args, s) => {
      const p = { p_class: wajib(args, "class_id"), p_new_owner: wajib(args, "new_owner_id") };
      sahkan(args, "memindah milik kelas");
      await panggilRpc(s, "qm_transfer_class_ownership", p, "Pindah milik");
      return { ok: true };
    },
  },
  {
    name: "leave_class_as_educator",
    title: "Keluar sebagai pendidik bersama",
    description: "Tarik diri anda sebagai pendidik bersama daripada kelas. Pemilik tidak boleh keluar; pindah milik dahulu. Wajib confirm: true.",
    roles: STAFF,
    write: true,
    inputSchema: {
      type: "object",
      properties: { class_id: { type: "string" }, confirm: CONFIRM_PROP },
      required: ["class_id", "confirm"],
    },
    handler: async (args, s) => {
      const classId = wajib(args, "class_id");
      sahkan(args, "keluar daripada kelas");
      await panggilRpc(s, "qm_leave_class_as_educator", { p_class: classId }, "Keluar kelas");
      return { ok: true };
    },
  },
  {
    name: "list_my_educator_invites",
    title: "Jemputan pendidik untuk saya",
    description: "Senarai jemputan pendidik bersama yang dihantar kepada emel anda dan belum diterima.",
    roles: STAFF,
    write: false,
    inputSchema: { type: "object", properties: {} },
    handler: async (_args, s) => panggilRpc(s, "qm_list_my_class_educator_invites", undefined, "Senarai jemputan saya"),
  },
  {
    name: "accept_educator_invite",
    title: "Terima jemputan pendidik",
    description: "Terima jemputan pendidik bersama dengan kodnya. Pulangkan class_id kelas yang anda sertai.",
    roles: STAFF,
    write: true,
    inputSchema: { type: "object", properties: { code: { type: "string" } }, required: ["code"] },
    handler: async (args, s) => ({
      class_id: await panggilRpc<string>(
        s,
        "qm_accept_class_educator_invite_by_code",
        { p_code: wajib(args, "code") },
        "Terima jemputan"
      ),
    }),
  },

  // === Pasukan ===
  {
    name: "create_team",
    title: "Cipta pasukan",
    description:
      "Cipta satu pasukan dalam kelas, atau beberapa sekali gus dengan count (dinamakan '<prefix> 1', '<prefix> 2' ...). " +
      "max_members lalai 5. Untuk import senarai nama, guna import_teams_csv.",
    roles: STAFF,
    write: true,
    inputSchema: {
      type: "object",
      properties: {
        class_id: { type: "string" },
        name: { type: "string", description: "Nama pasukan (bila count tidak diberi)" },
        count: { type: "integer", minimum: 1, maximum: 50, description: "Cipta beberapa pasukan sekali gus" },
        prefix: { type: "string", default: "Team" },
        max_members: { type: "integer", minimum: 1, default: 5 },
      },
      required: ["class_id"],
    },
    handler: async (args, s) => {
      const classId = wajib(args, "class_id");
      const maks = typeof args.max_members === "number" ? Math.max(1, Math.floor(args.max_members)) : 5;
      let baris: Record<string, unknown>[];
      if (args.count !== undefined) {
        const n = Math.floor(nombor(args, "count"));
        if (n < 1 || n > 50) throw new Error("count mesti antara 1 dan 50");
        const prefix = typeof args.prefix === "string" && args.prefix.trim() ? args.prefix.trim() : "Team";
        baris = Array.from({ length: n }, (_, i) => ({ class_id: classId, name: `${prefix} ${i + 1}`, max_members: maks }));
      } else {
        baris = [{ class_id: classId, name: wajib(args, "name"), max_members: maks }];
      }
      // Sama seperti createTeamForClass / bulkCreateTeamsForClass dalam data.ts.
      const res = await s.db.from("qm_teams").insert(baris).select("id, class_id, name, max_members, join_code");
      semakRalat(res, "Cipta pasukan");
      return { teams: res.data ?? [] };
    },
  },
  {
    name: "update_team",
    title: "Kemas kini pasukan",
    description: "Tukar nama dan/atau had ahli (max_members) sesuatu pasukan. Untuk ketua pasukan guna set_team_leader.",
    roles: STAFF,
    write: true,
    inputSchema: {
      type: "object",
      properties: {
        team_id: { type: "string" },
        name: { type: "string" },
        max_members: { type: "integer", minimum: 1 },
      },
      required: ["team_id"],
    },
    handler: async (args, s) => {
      const teamId = wajib(args, "team_id");
      const patch = pilih(args, ["name", "max_members"]);
      if (Object.keys(patch).length === 0) throw new Error("Beri sekurang-kurangnya name atau max_members");
      const res = await s.db.from("qm_teams").update(patch).eq("id", teamId).select("id, name, max_members");
      semakRalat(res, "Kemas kini pasukan");
      if (!res.data || res.data.length === 0) throw new Error("Pasukan tidak dijumpai atau anda tiada hak");
      return res.data[0];
    },
  },
  {
    name: "delete_team",
    title: "Padam pasukan",
    description: "Padam pasukan. Ahlinya kembali tanpa pasukan; pelarasan markah pasukan itu turut hilang. Wajib confirm: true.",
    roles: STAFF,
    write: true,
    inputSchema: {
      type: "object",
      properties: { team_id: { type: "string" }, confirm: CONFIRM_PROP },
      required: ["team_id", "confirm"],
    },
    handler: async (args, s) => {
      const teamId = wajib(args, "team_id");
      sahkan(args, "memadam pasukan");
      const res = await s.db.from("qm_teams").delete().eq("id", teamId).select("id");
      semakRalat(res, "Padam pasukan");
      if (!res.data || res.data.length === 0) throw new Error("Pasukan tidak dijumpai atau anda tiada hak");
      return { ok: true, deleted_team_id: teamId };
    },
  },
  {
    name: "get_team_csv_template",
    title: "Templat CSV pasukan",
    description: "Muat turun templat CSV untuk import_teams_csv, sudah diisi dengan peserta kelas.",
    roles: STAFF,
    write: false,
    inputSchema: { type: "object", properties: { class_id: { type: "string" } }, required: ["class_id"] },
    handler: async (args, s) => callApiText(s.accessToken, `/api/classes/${wajib(args, "class_id")}/teams/template`),
  },

  // === Markah manual ===
  {
    name: "list_score_adjustments",
    title: "Senarai pelarasan markah",
    description:
      "Senarai pelarasan markah manual. kind team: pelarasan pasukan bagi satu hunt (hunt_id wajib). " +
      "kind student: pelarasan individu dalam kelas (class_id wajib, user_id pilihan).",
    roles: STAFF,
    write: false,
    inputSchema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["team", "student"] },
        hunt_id: { type: "string" },
        class_id: { type: "string" },
        user_id: { type: "string" },
      },
      required: ["kind"],
    },
    handler: async (args, s) => {
      if (args.kind === "team") {
        const res = await s.db
          .from("qm_score_adjustments")
          .select("*")
          .eq("hunt_id", wajib(args, "hunt_id"))
          .order("created_at", { ascending: false });
        semakRalat(res, "Senarai pelarasan pasukan");
        return res.data ?? [];
      }
      if (args.kind === "student") {
        let q = s.db.from("qm_student_score_adjustments").select("*").eq("class_id", wajib(args, "class_id"));
        if (typeof args.user_id === "string" && args.user_id) q = q.eq("user_id", args.user_id);
        const res = await q.order("created_at", { ascending: false });
        semakRalat(res, "Senarai pelarasan pelajar");
        return res.data ?? [];
      }
      throw new Error("kind mesti team atau student");
    },
  },
  {
    name: "adjust_team_score",
    title: "Laras markah pasukan",
    description: "Tambah atau tolak mata pasukan secara manual (delta negatif untuk tolak). hunt_id pilihan untuk mengikat pelarasan kepada satu aktiviti.",
    roles: STAFF,
    write: true,
    inputSchema: {
      type: "object",
      properties: {
        team_id: { type: "string" },
        delta: { type: "number" },
        reason: { type: "string" },
        hunt_id: { type: "string" },
      },
      required: ["team_id", "delta"],
    },
    handler: async (args, s) => {
      // Sama seperti addScoreAdjustment dalam data.ts.
      const res = await s.db
        .from("qm_score_adjustments")
        .insert({
          hunt_id: typeof args.hunt_id === "string" && args.hunt_id ? args.hunt_id : null,
          team_id: wajib(args, "team_id"),
          delta: nombor(args, "delta"),
          reason: typeof args.reason === "string" && args.reason ? args.reason : null,
          created_by: s.userId,
        })
        .select()
        .single();
      semakRalat(res, "Laras markah pasukan");
      return res.data;
    },
  },
  {
    name: "adjust_student_score",
    title: "Laras markah pelajar",
    description: "Tambah atau tolak mata seorang pelajar dalam kelas secara manual (delta negatif untuk tolak).",
    roles: STAFF,
    write: true,
    inputSchema: {
      type: "object",
      properties: {
        class_id: { type: "string" },
        user_id: { type: "string" },
        delta: { type: "number" },
        reason: { type: "string" },
      },
      required: ["class_id", "user_id", "delta"],
    },
    handler: async (args, s) => {
      // Sama seperti addStudentScoreAdjustment dalam data.ts.
      const res = await s.db
        .from("qm_student_score_adjustments")
        .insert({
          class_id: wajib(args, "class_id"),
          user_id: wajib(args, "user_id"),
          delta: nombor(args, "delta"),
          reason: typeof args.reason === "string" && args.reason ? args.reason : null,
          created_by: s.userId,
        })
        .select()
        .single();
      semakRalat(res, "Laras markah pelajar");
      return res.data;
    },
  },
  {
    name: "delete_score_adjustment",
    title: "Padam pelarasan markah",
    description: "Padam satu pelarasan markah manual (id daripada list_score_adjustments). Wajib confirm: true.",
    roles: STAFF,
    write: true,
    inputSchema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["team", "student"] },
        adjustment_id: { type: "string" },
        confirm: CONFIRM_PROP,
      },
      required: ["kind", "adjustment_id", "confirm"],
    },
    handler: async (args, s) => {
      const id = wajib(args, "adjustment_id");
      const jadual =
        args.kind === "team" ? "qm_score_adjustments" : args.kind === "student" ? "qm_student_score_adjustments" : null;
      if (!jadual) throw new Error("kind mesti team atau student");
      sahkan(args, "memadam pelarasan markah");
      const res = await s.db.from(jadual).delete().eq("id", id).select("id");
      semakRalat(res, "Padam pelarasan");
      if (!res.data || res.data.length === 0) throw new Error("Pelarasan tidak dijumpai atau anda tiada hak");
      return { ok: true, deleted_adjustment_id: id };
    },
  },

  // === Quest selesai (mod quest pasukan) ===
  {
    name: "list_quest_completions",
    title: "Senarai quest selesai",
    description: "Senarai pasukan yang sudah ditanda selesai bagi satu aktiviti (hunt), dengan mata yang diberi.",
    roles: STAFF,
    write: false,
    inputSchema: { type: "object", properties: { hunt_id: { type: "string" } }, required: ["hunt_id"] },
    handler: async (args, s) => {
      const res = await s.db.from("qm_team_quest_completions").select("*").eq("hunt_id", wajib(args, "hunt_id"));
      semakRalat(res, "Senarai quest selesai");
      return res.data ?? [];
    },
  },
  {
    name: "mark_quest_completed",
    title: "Tanda quest selesai",
    description:
      "Tanda pasukan telah menyelesaikan aktiviti. Mata aktiviti (points) diberi kepada pasukan sebagai pelarasan " +
      "'Quest completed'. Satu pasukan hanya boleh ditanda sekali bagi setiap aktiviti.",
    roles: STAFF,
    write: true,
    inputSchema: {
      type: "object",
      properties: { hunt_id: { type: "string" }, team_id: { type: "string" } },
      required: ["hunt_id", "team_id"],
    },
    handler: async (args, s) => {
      const huntId = wajib(args, "hunt_id");
      const teamId = wajib(args, "team_id");
      // Mengikut markTeamCompletion dalam data.ts langkah demi langkah:
      // pelarasan dahulu, kemudian rekod selesai, dan undur pelarasan jika
      // rekod selesai ditolak (contohnya sudah ditanda).
      const hunt = await s.db.from(TABLES.hunts).select("id, points, title").eq("id", huntId).single();
      semakRalat(hunt, "Dapatkan aktiviti");
      const h = hunt.data as { points: number | null; title: string | null };
      const mata = h?.points ?? 0;
      const adj = await s.db
        .from("qm_score_adjustments")
        .insert({
          hunt_id: huntId,
          team_id: teamId,
          delta: mata,
          reason: `Quest completed: ${h?.title ?? ""}`.trim(),
          created_by: s.userId,
        })
        .select()
        .single();
      semakRalat(adj, "Beri mata quest");
      const adjId = (adj.data as { id: string }).id;
      const comp = await s.db.from("qm_team_quest_completions").insert({
        hunt_id: huntId,
        team_id: teamId,
        awarded_points: mata,
        adjustment_id: adjId,
        marked_by: s.userId,
      });
      if (comp.error) {
        await s.db.from("qm_score_adjustments").delete().eq("id", adjId);
        throw new Error(`Tanda selesai gagal: ${comp.error.message}`);
      }
      return { ok: true, hunt_id: huntId, team_id: teamId, awarded_points: mata };
    },
  },
  {
    name: "unmark_quest_completed",
    title: "Batal tanda quest selesai",
    description: "Batalkan tanda selesai pasukan bagi aktiviti dan tarik balik mata yang diberi. Wajib confirm: true.",
    roles: STAFF,
    write: true,
    inputSchema: {
      type: "object",
      properties: { hunt_id: { type: "string" }, team_id: { type: "string" }, confirm: CONFIRM_PROP },
      required: ["hunt_id", "team_id", "confirm"],
    },
    handler: async (args, s) => {
      const huntId = wajib(args, "hunt_id");
      const teamId = wajib(args, "team_id");
      sahkan(args, "membatalkan tanda selesai");
      // Mengikut unmarkTeamCompletion dalam data.ts.
      const comp = await s.db
        .from("qm_team_quest_completions")
        .select("id, adjustment_id")
        .eq("hunt_id", huntId)
        .eq("team_id", teamId)
        .maybeSingle();
      semakRalat(comp, "Dapatkan rekod selesai");
      const c = comp.data as { id: string; adjustment_id: string | null } | null;
      if (!c) return { ok: true, already_unmarked: true };
      if (c.adjustment_id) await s.db.from("qm_score_adjustments").delete().eq("id", c.adjustment_id);
      const del = await s.db.from("qm_team_quest_completions").delete().eq("id", c.id);
      semakRalat(del, "Batal tanda selesai");
      return { ok: true };
    },
  },

  // === Aktiviti (hunt) ===
  {
    name: "delete_hunt",
    title: "Padam aktiviti",
    description: "Padam aktiviti (hunt) secara kekal bersama cabaran dan hantarannya. Wajib confirm: true.",
    roles: STAFF,
    write: true,
    inputSchema: {
      type: "object",
      properties: { hunt_id: { type: "string" }, confirm: CONFIRM_PROP },
      required: ["hunt_id", "confirm"],
    },
    handler: async (args, s) => {
      const huntId = wajib(args, "hunt_id");
      sahkan(args, "memadam aktiviti");
      // Sama seperti deleteHunt dalam data.ts.
      const res = await s.db.from(TABLES.hunts).delete().eq("id", huntId).select("id");
      semakRalat(res, "Padam aktiviti");
      if (!res.data || res.data.length === 0) throw new Error("Aktiviti tidak dijumpai atau anda tiada hak");
      return { ok: true, deleted_hunt_id: huntId };
    },
  },

  // === Outcomes (hasil pembelajaran) ===
  {
    name: "list_outcomes",
    title: "Senarai hasil pembelajaran",
    description: "Senarai hasil pembelajaran (Outcomes, contohnya CLO1) bagi sesuatu kelas.",
    roles: STAFF,
    write: false,
    inputSchema: { type: "object", properties: { class_id: { type: "string" } }, required: ["class_id"] },
    handler: async (args, s) => callApi(s.accessToken, `/api/outcomes${qs({ class_id: wajib(args, "class_id") })}`),
  },
  {
    name: "create_outcome",
    title: "Cipta hasil pembelajaran",
    description: "Cipta hasil pembelajaran baharu dalam kelas. code contohnya CLO1, label ialah pernyataan ringkas.",
    roles: STAFF,
    write: true,
    inputSchema: {
      type: "object",
      properties: {
        class_id: { type: "string" },
        code: { type: "string" },
        label: { type: "string" },
        description: { type: "string" },
      },
      required: ["class_id", "code", "label"],
    },
    handler: async (args, s) =>
      callApi(s.accessToken, "/api/outcomes", {
        method: "POST",
        body: { class_id: wajib(args, "class_id"), code: wajib(args, "code"), label: wajib(args, "label"), description: args.description },
      }),
  },
  {
    name: "update_outcome",
    title: "Kemas kini hasil pembelajaran",
    description: "Ubah code, label atau description hasil pembelajaran. Hanya medan yang diberi diubah.",
    roles: STAFF,
    write: true,
    inputSchema: {
      type: "object",
      properties: {
        outcome_id: { type: "string" },
        code: { type: "string" },
        label: { type: "string" },
        description: { type: "string" },
      },
      required: ["outcome_id"],
    },
    handler: async (args, s) => {
      const body = pilih(args, ["code", "label", "description"]);
      if (Object.keys(body).length === 0) throw new Error("Beri sekurang-kurangnya satu medan untuk diubah");
      return callApi(s.accessToken, `/api/outcomes/${wajib(args, "outcome_id")}`, { method: "PATCH", body });
    },
  },
  {
    name: "delete_outcome",
    title: "Padam hasil pembelajaran",
    description: "Padam hasil pembelajaran dan semua tag cabarannya. Wajib confirm: true.",
    roles: STAFF,
    write: true,
    inputSchema: {
      type: "object",
      properties: { outcome_id: { type: "string" }, confirm: CONFIRM_PROP },
      required: ["outcome_id", "confirm"],
    },
    handler: async (args, s) => {
      const id = wajib(args, "outcome_id");
      sahkan(args, "memadam hasil pembelajaran");
      return callApi(s.accessToken, `/api/outcomes/${id}`, { method: "DELETE" });
    },
  },
  {
    name: "list_outcome_tags",
    title: "Senarai tag hasil pembelajaran",
    description: "Senarai cabaran yang ditag kepada sesuatu hasil pembelajaran, dengan pemberat (weight).",
    roles: STAFF,
    write: false,
    inputSchema: { type: "object", properties: { outcome_id: { type: "string" } }, required: ["outcome_id"] },
    handler: async (args, s) => callApi(s.accessToken, `/api/outcomes/${wajib(args, "outcome_id")}/tags`),
  },
  {
    name: "tag_challenge_outcome",
    title: "Tag cabaran kepada hasil pembelajaran",
    description: "Kaitkan cabaran dengan hasil pembelajaran untuk analitik mastery. weight lalai 1.0. Tag sedia ada dikemas kini.",
    roles: STAFF,
    write: true,
    inputSchema: {
      type: "object",
      properties: { outcome_id: { type: "string" }, challenge_id: { type: "string" }, weight: { type: "number", default: 1 } },
      required: ["outcome_id", "challenge_id"],
    },
    handler: async (args, s) =>
      callApi(s.accessToken, `/api/outcomes/${wajib(args, "outcome_id")}/tags`, {
        method: "POST",
        body: { challenge_id: wajib(args, "challenge_id"), weight: typeof args.weight === "number" ? args.weight : undefined },
      }),
  },
  {
    name: "untag_challenge_outcome",
    title: "Buang tag cabaran",
    description: "Buang kaitan antara cabaran dan hasil pembelajaran.",
    roles: STAFF,
    write: true,
    inputSchema: {
      type: "object",
      properties: { outcome_id: { type: "string" }, challenge_id: { type: "string" } },
      required: ["outcome_id", "challenge_id"],
    },
    handler: async (args, s) =>
      callApi(
        s.accessToken,
        `/api/outcomes/${wajib(args, "outcome_id")}/tags${qs({ challenge_id: wajib(args, "challenge_id") })}`,
        { method: "DELETE" }
      ),
  },

  // === Learning board, operasi lanjutan ===
  {
    name: "delete_board_card",
    title: "Padam kad board",
    description: "Padam satu kad daripada learning board. Wajib confirm: true.",
    roles: STAFF,
    write: true,
    inputSchema: {
      type: "object",
      properties: { card_id: { type: "string" }, confirm: CONFIRM_PROP },
      required: ["card_id", "confirm"],
    },
    handler: async (args, s) => {
      const cardId = wajib(args, "card_id");
      sahkan(args, "memadam kad");
      const classId = await kelasBagiKad(s, cardId);
      return callApi(s.accessToken, `/api/learning-boards/${classId}/cards/${cardId}`, { method: "DELETE" });
    },
  },
  {
    name: "move_board_card",
    title: "Alih kad board",
    description:
      "Alih kad dalam kolumnya (action up, down, top, bottom) atau ke kolum dan kedudukan lain " +
      "(action to dengan column_id dan position bermula 0).",
    roles: STAFF,
    write: true,
    inputSchema: {
      type: "object",
      properties: {
        card_id: { type: "string" },
        action: { type: "string", enum: MOVE_ACTIONS },
        column_id: { type: "string", description: "Wajib untuk action to" },
        position: { type: "integer", minimum: 0, description: "Wajib untuk action to" },
      },
      required: ["card_id", "action"],
    },
    handler: async (args, s) => {
      const cardId = wajib(args, "card_id");
      const action = String(args.action ?? "");
      if (!MOVE_ACTIONS.includes(action)) throw new Error("action mesti up, down, top, bottom atau to");
      const body: Record<string, unknown> = { action };
      if (action === "to") {
        body.columnId = wajib(args, "column_id");
        body.position = nombor(args, "position");
      }
      const classId = await kelasBagiKad(s, cardId);
      return callApi(s.accessToken, `/api/learning-boards/${classId}/cards/${cardId}/move`, { method: "PATCH", body });
    },
  },
  {
    name: "update_board_column",
    title: "Kemas kini kolum board",
    description: "Tukar tajuk kolum learning board. Untuk mengalih kolum, guna move_board_column.",
    roles: STAFF,
    write: true,
    inputSchema: {
      type: "object",
      properties: { column_id: { type: "string" }, title: { type: "string" } },
      required: ["column_id", "title"],
    },
    handler: async (args, s) => {
      const columnId = wajib(args, "column_id");
      const classId = await kelasBagiKolum(s, columnId);
      return callApi(s.accessToken, `/api/learning-boards/${classId}/columns/${columnId}`, {
        method: "PATCH",
        body: { title: wajib(args, "title") },
      });
    },
  },
  {
    name: "delete_board_column",
    title: "Padam kolum board",
    description: "Padam kolum learning board bersama SEMUA kad di dalamnya. Wajib confirm: true.",
    roles: STAFF,
    write: true,
    inputSchema: {
      type: "object",
      properties: { column_id: { type: "string" }, confirm: CONFIRM_PROP },
      required: ["column_id", "confirm"],
    },
    handler: async (args, s) => {
      const columnId = wajib(args, "column_id");
      sahkan(args, "memadam kolum dan kadnya");
      const classId = await kelasBagiKolum(s, columnId);
      return callApi(s.accessToken, `/api/learning-boards/${classId}/columns/${columnId}`, { method: "DELETE" });
    },
  },
  {
    name: "move_board_column",
    title: "Alih kolum board",
    description: "Alih kolum ke kiri atau kanan (action up, down, top, bottom) atau ke kedudukan tepat (action to dengan position bermula 0).",
    roles: STAFF,
    write: true,
    inputSchema: {
      type: "object",
      properties: {
        column_id: { type: "string" },
        action: { type: "string", enum: MOVE_ACTIONS },
        position: { type: "integer", minimum: 0 },
      },
      required: ["column_id", "action"],
    },
    handler: async (args, s) => {
      const columnId = wajib(args, "column_id");
      const action = String(args.action ?? "");
      if (!MOVE_ACTIONS.includes(action)) throw new Error("action mesti up, down, top, bottom atau to");
      const body: Record<string, unknown> = { action };
      if (action === "to") body.position = nombor(args, "position");
      const classId = await kelasBagiKolum(s, columnId);
      return callApi(s.accessToken, `/api/learning-boards/${classId}/columns/${columnId}/move`, { method: "PATCH", body });
    },
  },
  {
    name: "add_qr_card",
    title: "Tambah kad QR",
    description: "Tambah kad yang memaparkan kod QR bagi sesuatu URL ke dalam kolum learning board.",
    roles: STAFF,
    write: true,
    inputSchema: {
      type: "object",
      properties: {
        column_id: { type: "string" },
        url: { type: "string" },
        title: { type: "string" },
        insert_index: { type: "integer", minimum: 0, description: "Kedudukan dalam kolum; lalai di hujung" },
      },
      required: ["column_id", "url"],
    },
    handler: async (args, s) => {
      const columnId = wajib(args, "column_id");
      const classId = await kelasBagiKolum(s, columnId);
      return callApi(s.accessToken, `/api/learning-boards/${classId}/qr-card`, {
        method: "POST",
        body: { columnId, url: wajib(args, "url"), title: args.title, insertIndex: args.insert_index },
      });
    },
  },
  {
    name: "import_board",
    title: "Import learning board",
    description:
      "Salin kolum dan kad learning board daripada kelas lain milik anda. mode append (lalai) menambah di hujung; " +
      "mode replace MEMADAM semua kolum sedia ada dahulu dan memerlukan confirm: true.",
    roles: STAFF,
    write: true,
    inputSchema: {
      type: "object",
      properties: {
        class_id: { type: "string", description: "Kelas destinasi" },
        source_class_id: { type: "string" },
        mode: { type: "string", enum: ["append", "replace"], default: "append" },
        confirm: { type: "boolean", description: "Wajib true untuk mode replace" },
      },
      required: ["class_id", "source_class_id"],
    },
    handler: async (args, s) => {
      const mode = args.mode === "replace" ? "replace" : "append";
      if (mode === "replace") sahkan(args, "menggantikan seluruh board");
      return callApi(s.accessToken, `/api/learning-boards/${wajib(args, "class_id")}/import`, {
        method: "POST",
        body: { sourceClassId: wajib(args, "source_class_id"), mode },
      });
    },
  },
  {
    name: "ai_thumbnail_card",
    title: "Jana thumbnail AI untuk kad",
    description: "Jana imej kecil (thumbnail) dengan AI untuk satu kad learning board. prompt pilihan untuk mengarah gaya imej.",
    roles: STAFF,
    write: true,
    inputSchema: {
      type: "object",
      properties: { card_id: { type: "string" }, prompt: { type: "string" } },
      required: ["card_id"],
    },
    handler: async (args, s) => {
      const cardId = wajib(args, "card_id");
      const classId = await kelasBagiKad(s, cardId);
      return callApi(s.accessToken, `/api/learning-boards/${classId}/cards/${cardId}/ai-thumbnail`, {
        method: "POST",
        body: args.prompt ? { prompt: args.prompt } : {},
      });
    },
  },
  {
    name: "ai_thumbnail_all",
    title: "Jana thumbnail AI untuk semua kad",
    description: "Jana thumbnail AI untuk semua kad dalam learning board kelas yang belum ada imej. Mungkin mengambil masa.",
    roles: STAFF,
    write: true,
    inputSchema: { type: "object", properties: { class_id: { type: "string" } }, required: ["class_id"] },
    handler: async (args, s) =>
      callApi(s.accessToken, `/api/learning-boards/${wajib(args, "class_id")}/ai-thumbnail-all`, { method: "POST", body: {} }),
  },
  {
    name: "link_preview",
    title: "Pratonton pautan",
    description: "Dapatkan tajuk, penerangan dan imej pratonton bagi sesuatu URL, seperti yang dipaparkan pada kad pautan.",
    roles: ALL,
    write: false,
    inputSchema: { type: "object", properties: { url: { type: "string" } }, required: ["url"] },
    handler: async (args, s) => callApi(s.accessToken, `/api/learning-boards/link-preview${qs({ url: wajib(args, "url") })}`),
  },

  // === Live Quiz ===
  {
    name: "update_live_quiz",
    title: "Kemas kini Live Quiz",
    description: "Ubah tajuk, penerangan atau streak_bonus sesuatu Live Quiz. Hanya medan yang diberi diubah.",
    roles: STAFF,
    write: true,
    inputSchema: {
      type: "object",
      properties: {
        quiz_id: { type: "string" },
        title: { type: "string" },
        description: { type: "string" },
        streak_bonus: { type: "boolean" },
      },
      required: ["quiz_id"],
    },
    handler: async (args, s) => {
      const body = pilih(args, ["title", "description", "streak_bonus"]);
      if (Object.keys(body).length === 0) throw new Error("Beri sekurang-kurangnya satu medan untuk diubah");
      return callApi(s.accessToken, `/api/live/quizzes/${wajib(args, "quiz_id")}`, { method: "PATCH", body });
    },
  },
  {
    name: "delete_live_quiz",
    title: "Padam Live Quiz",
    description: "Padam Live Quiz bersama soalannya. Wajib confirm: true.",
    roles: STAFF,
    write: true,
    inputSchema: {
      type: "object",
      properties: { quiz_id: { type: "string" }, confirm: CONFIRM_PROP },
      required: ["quiz_id", "confirm"],
    },
    handler: async (args, s) => {
      const id = wajib(args, "quiz_id");
      sahkan(args, "memadam Live Quiz");
      return callApi(s.accessToken, `/api/live/quizzes/${id}`, { method: "DELETE" });
    },
  },
  {
    name: "import_live_questions_aiken",
    title: "Import soalan format Aiken",
    description:
      "Import soalan aneka pilihan ke Live Quiz dalam format Aiken (soalan, pilihan 'A. ...', kemudian 'ANSWER: B'). " +
      "Semua atau tiada: satu blok rosak bermakna tiada soalan dimasukkan.",
    roles: STAFF,
    write: true,
    inputSchema: {
      type: "object",
      properties: { quiz_id: { type: "string" }, content: { type: "string", description: "Teks Aiken penuh" } },
      required: ["quiz_id", "content"],
    },
    handler: async (args, s) =>
      callApi(s.accessToken, `/api/live/quizzes/${wajib(args, "quiz_id")}/import-aiken`, {
        method: "POST",
        body: { content: wajib(args, "content") },
      }),
  },

  // === Sijil ===
  {
    name: "set_active_certificate_template",
    title: "Tetapkan templat sijil aktif",
    description: "Jadikan satu templat sijil sebagai templat aktif kelas, yang digunakan oleh issue_certificates.",
    roles: STAFF,
    write: true,
    inputSchema: { type: "object", properties: { template_id: { type: "string" } }, required: ["template_id"] },
    handler: async (args, s) => {
      await panggilRpc(s, "qm_set_active_certificate_template", { p_template: wajib(args, "template_id") }, "Tetapkan templat aktif");
      return { ok: true };
    },
  },
  {
    name: "delete_certificate_template",
    title: "Padam templat sijil",
    description: "Padam templat sijil kelas. Sijil yang sudah dikeluarkan tidak terjejas. Wajib confirm: true.",
    roles: STAFF,
    write: true,
    inputSchema: {
      type: "object",
      properties: { template_id: { type: "string" }, confirm: CONFIRM_PROP },
      required: ["template_id", "confirm"],
    },
    handler: async (args, s) => {
      const id = wajib(args, "template_id");
      sahkan(args, "memadam templat sijil");
      await panggilRpc(s, "qm_delete_certificate_template", { p_template: id }, "Padam templat");
      return { ok: true };
    },
  },
  {
    name: "regenerate_certificates",
    title: "Jana semula sijil",
    description: "Jana semula PDF sijil yang sudah dikeluarkan (contohnya selepas templat atau nama diubah). Tanpa certificate_ids, semua sijil kelas dijana semula.",
    roles: STAFF,
    write: true,
    inputSchema: {
      type: "object",
      properties: { class_id: { type: "string" }, certificate_ids: { type: "array", items: { type: "string" } } },
      required: ["class_id"],
    },
    handler: async (args, s) =>
      callApi(s.accessToken, `/api/classes/${wajib(args, "class_id")}/certificates/regenerate`, {
        method: "POST",
        body: Array.isArray(args.certificate_ids) ? { certificate_ids: args.certificate_ids } : {},
      }),
  },
  {
    name: "email_certificates",
    title: "Emel sijil kepada peserta",
    description:
      "Hantar sijil sebagai lampiran PDF ke emel peserta. Tanpa certificate_ids, semua sijil yang belum diemel dihantar. " +
      "resend: true menghantar semula yang sudah diemel. Pelan Pro dan Institution sahaja. Menghantar emel sebenar, " +
      "jadi wajib confirm: true.",
    roles: STAFF,
    write: true,
    inputSchema: {
      type: "object",
      properties: {
        class_id: { type: "string" },
        certificate_ids: { type: "array", items: { type: "string" }, maxItems: 200 },
        resend: { type: "boolean", default: false },
        confirm: { type: "boolean", description: "Wajib true. Emel sebenar dihantar kepada peserta." },
      },
      required: ["class_id", "confirm"],
    },
    handler: async (args, s) => {
      const classId = wajib(args, "class_id");
      sahkan(args, "menghantar emel sijil");
      const body: Record<string, unknown> = {};
      if (Array.isArray(args.certificate_ids)) body.certificate_ids = args.certificate_ids;
      if (args.resend === true) body.resend = true;
      return callApi(s.accessToken, `/api/classes/${classId}/certificates/email`, { method: "POST", body });
    },
  },
  {
    name: "delete_certificate_library_item",
    title: "Padam item pustaka sijil",
    description: "Padam satu reka bentuk daripada pustaka sijil peribadi anda (Templat saya). Wajib confirm: true.",
    roles: STAFF,
    write: true,
    inputSchema: {
      type: "object",
      properties: { library_id: { type: "string" }, confirm: CONFIRM_PROP },
      required: ["library_id", "confirm"],
    },
    handler: async (args, s) => {
      const id = wajib(args, "library_id");
      sahkan(args, "memadam item pustaka");
      return callApi(s.accessToken, `/api/certificate-library/${id}`, { method: "DELETE" });
    },
  },

  // === Analitik ===
  {
    name: "get_activity_stats",
    title: "Statistik aktiviti",
    description: "Statistik setiap aktiviti dalam kelas, seperti di halaman Analytics.",
    roles: STAFF,
    write: false,
    inputSchema: { type: "object", properties: { class_id: { type: "string" } }, required: ["class_id"] },
    handler: async (args, s) => callApi(s.accessToken, `/api/analytics/activity-stats${qs({ classId: wajib(args, "class_id") })}`),
  },
  {
    name: "get_team_stats",
    title: "Statistik pasukan",
    description: "Statistik setiap pasukan dalam kelas, termasuk markah dan hantaran diluluskan.",
    roles: STAFF,
    write: false,
    inputSchema: { type: "object", properties: { class_id: { type: "string" } }, required: ["class_id"] },
    handler: async (args, s) => callApi(s.accessToken, `/api/analytics/team-stats${qs({ classId: wajib(args, "class_id") })}`),
  },
  {
    name: "get_gamification_stats",
    title: "Statistik gamifikasi",
    description: "Statistik gamifikasi kelas, seperti di halaman Analytics.",
    roles: STAFF,
    write: false,
    inputSchema: { type: "object", properties: { class_id: { type: "string" } }, required: ["class_id"] },
    handler: async (args, s) => callApi(s.accessToken, `/api/analytics/gamification${qs({ class_id: wajib(args, "class_id") })}`),
  },
  {
    name: "get_mastery_stats",
    title: "Penguasaan hasil pembelajaran",
    description: "Tahap penguasaan setiap hasil pembelajaran (Outcomes) dalam kelas, berdasarkan cabaran yang ditag.",
    roles: STAFF,
    write: false,
    inputSchema: { type: "object", properties: { class_id: { type: "string" } }, required: ["class_id"] },
    handler: async (args, s) => callApi(s.accessToken, `/api/analytics/mastery${qs({ class_id: wajib(args, "class_id") })}`),
  },
  {
    name: "get_at_risk_students",
    title: "Pelajar berisiko",
    description: "Senarai pelajar yang ditanda berisiko ketinggalan dalam kelas, seperti di halaman Analytics.",
    roles: STAFF,
    write: false,
    inputSchema: { type: "object", properties: { class_id: { type: "string" } }, required: ["class_id"] },
    handler: async (args, s) => callApi(s.accessToken, `/api/analytics/at-risk${qs({ class_id: wajib(args, "class_id") })}`),
  },

  // === Akaun ===
  {
    name: "get_plan_usage",
    title: "Penggunaan pelan",
    description: "Pelan langganan anda dan penggunaan semasa berbanding hadnya.",
    roles: ALL,
    write: false,
    inputSchema: { type: "object", properties: {} },
    handler: async (_args, s) => panggilRpc(s, "qm_my_plan_usage", undefined, "Penggunaan pelan"),
  },
  {
    name: "send_feedback",
    title: "Hantar maklum balas",
    description: "Hantar maklum balas kepada admin Kuizen. type: bug, idea, question atau other. subject maksimum 200 aksara, message 4000.",
    roles: ALL,
    write: true,
    inputSchema: {
      type: "object",
      properties: {
        subject: { type: "string" },
        message: { type: "string" },
        type: { type: "string", enum: ["bug", "idea", "question", "other"], default: "other" },
      },
      required: ["subject", "message"],
    },
    handler: async (args, s) =>
      callApi(s.accessToken, "/api/feedback", {
        method: "POST",
        body: { subject: wajib(args, "subject"), message: wajib(args, "message"), type: args.type ?? "other", email: s.email ?? undefined },
      }),
  },

  // === Peserta ===
  {
    name: "join_class_by_code",
    title: "Sertai kelas dengan kod",
    description: "Sertai kelas sebagai peserta dengan kod kelas. Kod dinormalkan (O jadi 0, I dan L jadi 1). Pulangkan class_id.",
    roles: ALL,
    write: true,
    inputSchema: { type: "object", properties: { code: { type: "string" } }, required: ["code"] },
    handler: async (args, s) => ({
      class_id: await panggilRpc<string>(s, "qm_join_class_by_code", { p_code: normalKodKelas(wajib(args, "code")) }, "Sertai kelas"),
    }),
  },
  {
    name: "leave_class",
    title: "Keluar kelas (peserta)",
    description: "Keluar daripada kelas sebagai peserta. Wajib confirm: true.",
    roles: ALL,
    write: true,
    inputSchema: {
      type: "object",
      properties: { class_id: { type: "string" }, confirm: CONFIRM_PROP },
      required: ["class_id", "confirm"],
    },
    handler: async (args, s) => {
      const classId = wajib(args, "class_id");
      sahkan(args, "keluar daripada kelas");
      await panggilRpc(s, "qm_leave_class_as_student", { p_class: classId }, "Keluar kelas");
      return { ok: true };
    },
  },
  {
    name: "peer_my_status",
    title: "Status penilaian rakan saya",
    description: "Status penilaian rakan sebaya anda bagi satu pusingan: rakan yang perlu dinilai dan sama ada sudah dihantar.",
    roles: ALL,
    write: false,
    inputSchema: { type: "object", properties: { round_id: { type: "string" } }, required: ["round_id"] },
    handler: async (args, s) => panggilRpc(s, "qm_peer_my_status", { p_round: wajib(args, "round_id") }, "Status penilaian"),
  },
  {
    name: "get_peer_form",
    title: "Borang penilaian rakan",
    description: "Dapatkan borang penilaian rakan sebaya: kriteria k1 hingga k5 dan senarai rakan sepasukan untuk dinilai.",
    roles: ALL,
    write: false,
    inputSchema: { type: "object", properties: { round_id: { type: "string" } }, required: ["round_id"] },
    handler: async (args, s) => callApi(s.accessToken, `/api/peer-rounds/${wajib(args, "round_id")}/form`),
  },
  {
    name: "submit_peer_ratings",
    title: "Hantar penilaian rakan",
    description:
      "Hantar penilaian rakan sebaya: ratings [{ratee_id, k1, k2, k3, k4, k5, justification?}]. Sekali sahaja bagi " +
      "setiap pusingan; tidak boleh disunting selepas dihantar, jadi wajib confirm: true.",
    roles: ALL,
    write: true,
    inputSchema: {
      type: "object",
      properties: {
        round_id: { type: "string" },
        ratings: { type: "array", items: { type: "object" } },
        confirm: CONFIRM_PROP,
      },
      required: ["round_id", "ratings", "confirm"],
    },
    handler: async (args, s) => {
      const roundId = wajib(args, "round_id");
      if (!Array.isArray(args.ratings) || args.ratings.length === 0) throw new Error("ratings mesti senarai yang tidak kosong");
      sahkan(args, "menghantar penilaian");
      return callApi(s.accessToken, `/api/peer-rounds/${roundId}/ratings`, { method: "POST", body: { ratings: args.ratings } });
    },
  },
];
