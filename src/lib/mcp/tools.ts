// lib/mcp/tools.ts
// Definisi tool Kuizen. Setiap tool mengisytiharkan peranan yang boleh
// melihatnya; tools/list menapis mengikut peranan pengguna yang log masuk,
// dan tools/call menguatkuasakannya semula.
//
// Semua pertanyaan data menggunakan session.db, iaitu klien terikat RLS.
// Tiada tool menyentuh service_role.
//
// RLS ialah keselamatan peringkat BARIS. Untuk lajur sensitif (terutamanya
// qm_challenges.answer) kawalan mesti datang dari sini, dengan memilih lajur
// secara eksplisit dan tidak pernah menggunakan select("*") pada jadual itu.

import { McpSession, Role, canWrite } from "./session";
import { TABLES, COLUMNS, LIMITS, REDACTED_COLUMNS } from "./schema";
import { callApi, uploadFile } from "./api";
import {
  addLiveQuestions,
  controlLiveSession,
  createLiveQuiz,
  deleteLiveQuestion,
  importLiveQuestions,
  startLiveSession,
  updateLiveQuestion,
  liveSessionLinks,
} from "./live-quiz-tools";
import { updateChallenge, deleteChallenge } from "./challenge-tools";
import { importTeamsCsv, setTeamLeader, groupTeamsWithMembers } from "./team-tools";
import {
  listPeerRounds,
  createPeerRound,
  updatePeerRound,
  computePeerRound,
  getPeerResults,
  deletePeerRound,
} from "./peer-tools";
import { inviteEducator } from "./invite-tools";

/** Had limit khusus list_live_quizzes: lalai 50, maksimum 200 (tiket KZ-004). */
const LIVE_LIST_DEFAULT_LIMIT = 50;
const LIVE_LIST_MAX_LIMIT = 200;

/**
 * Nilkan argumen limit list_live_quizzes. Sebelum ini limit diabaikan
 * walaupun skema mengiklankannya; senarai penuh dihantar tanpa potongan.
 * Bukan integer atau luar julat: jatuh ke lalai, bukan ralat.
 */
export function clampLiveQuizLimit(n: unknown): number {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.floor(n) : LIVE_LIST_DEFAULT_LIMIT;
  if (v < 1) return LIVE_LIST_DEFAULT_LIMIT;
  return Math.min(v, LIVE_LIST_MAX_LIMIT);
}

export interface ToolDef {
  name: string;
  title: string;
  description: string;
  roles: Role[];
  write: boolean;
  inputSchema: Record<string, any>;
  handler: (args: any, session: McpSession) => Promise<any>;
}

const ALL: Role[] = ["admin", "educator", "participant"];
const STAFF: Role[] = ["admin", "educator"];

const isStaff = (s: McpSession) => s.role === "admin" || s.role === "educator";

function clampLimit(n: unknown): number {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.floor(n) : LIMITS.default;
  return Math.min(Math.max(v, 1), LIMITS.max);
}

function unwrapList<T>(res: { data: T[] | null; error: any }, what: string): T[] {
  if (res.error) throw new Error(`${what} gagal: ${res.error.message}`);
  return res.data ?? [];
}

/** Untuk maybeSingle()/single(). Jangan gantikan null dengan [] : [] adalah truthy. */
function unwrapOne<T>(res: { data: T | null; error: any }, what: string): T | null {
  if (res.error) throw new Error(`${what} gagal: ${res.error.message}`);
  return res.data;
}

/** Buang lajur sensitif daripada rekod sewenang-wenangnya. */
function redact<T extends Record<string, unknown>>(row: T): T {
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (!REDACTED_COLUMNS.has(k)) clean[k] = v;
  }
  return clean as T;
}

/** Kiraan baris untuk jadual yang mungkin tiada lajur `id`. */
async function countBy(
  s: McpSession,
  table: string,
  column: string,
  classId: string
): Promise<number> {
  const { count } = await s.db
    .from(table)
    .select(column, { count: "exact", head: true })
    .eq("class_id", classId);
  return count ?? 0;
}

/**
 * Jenis kad yang diterima oleh route kad. Disalin daripada route supaya
 * ralat ditangkap sebelum panggilan rangkaian, bukan sebagai 400 yang kabur.
 */
/**
 * Had base64 bukan dasar operasi, ia batasan fizikal.
 *
 * Draf pertama menganggap 4 aksara setiap token, iaitu nisbah teks biasa.
 * Ukuran sebenar pada fail pptx: 22,412 aksara base64 = 90,198 token, iaitu
 * 4.02 token SETIAP AKSARA. Anggaran asal tersasar 16 kali ganda.
 *
 * Pada kadar itu, fail 71 KB sahaja menelan 382,862 token dan fail 245 KB
 * menelan 1.3 juta. Base64 tidak boleh mengendalikan walau satu fail dokumen
 * sebenar, jadi hadnya 16 KB dan bukan 256 KB: cukup untuk nota teks pendek
 * dan ikon kecil, tidak lebih.
 *
 * Semakan ini tidak menjimatkan token, kerana menjelang handler dipanggil
 * model sudah pun menjananya. Yang menjimatkan token ialah description tool
 * di bawah. Semakan ini hanya memastikan kegagalan itu pantas dan jelas.
 */
const MAX_BASE64_CHARS = 16 * 1024;
const TOKEN_PER_BASE64_CHAR = 4.02;

const CARD_TYPES = ["text", "link", "image", "file", "chatbot", "youtube"];

/**
 * Route board dikunci pada class_id, bukan board_id. Tool MCP menerima
 * board_id kerana itu yang get_board pulangkan, jadi kita petakan di sini
 * melalui klien terikat RLS: jika pengguna tidak nampak board itu, mereka
 * tidak boleh menulis kepadanya.
 */
async function classIdForBoard(boardId: string, s: McpSession): Promise<string> {
  if (!boardId) throw new Error("board_id diperlukan");
  const board = unwrapOne<{ class_id: string }>(
    await s.db.from(TABLES.boards).select("id, class_id").eq("id", boardId).maybeSingle(),
    "Dapatkan board"
  );
  if (!board) throw new Error("Board tidak dijumpai atau anda tiada akses kepadanya");
  return board.class_id;
}

async function classIdForCard(cardId: string, s: McpSession): Promise<string> {
  const card = unwrapOne<{ board_id: string }>(
    await s.db.from(TABLES.boardCards).select("id, board_id").eq("id", cardId).maybeSingle(),
    "Dapatkan kad"
  );
  if (!card) throw new Error("Kad tidak dijumpai atau anda tiada akses kepadanya");
  return await classIdForBoard(card.board_id, s);
}

/** URL yang menstrim fail FileLu melalui pelayan kita, dengan content-type betul. */
function fileRedirectUrl(classId: string, fileCode?: string): string | null {
  return fileCode ? `/api/learning-boards/${classId}/file-redirect/${fileCode}` : null;
}

/** Status kelas terbitan: archived > ended > active. */
type StatusKelas = "active" | "ended" | "archived";
function statusKelas(r: { is_archived?: unknown; ended_at?: unknown }): StatusKelas {
  if (r.is_archived === true) return "archived";
  if (r.ended_at) return "ended";
  return "active";
}

export const TOOLS: ToolDef[] = [
  {
    name: "whoami",
    title: "Siapa saya",
    description:
      "Pulangkan identiti dan peranan pengguna semasa dalam Kuizen. Panggil ini dahulu jika anda tidak pasti tool mana yang tersedia.",
    roles: ALL,
    write: false,
    inputSchema: { type: "object", properties: {} },
    handler: async (_args, s) => ({
      user_id: s.userId,
      email: s.email,
      role: s.role,
      scope: s.scope,
      writes_allowed: canWrite(s),
    }),
  },

  {
    name: "list_classes",
    title: "Senarai kelas",
    description:
      "Senaraikan kelas yang boleh dilihat pengguna semasa. Educator melihat kelas yang mereka ajar; peserta melihat kelas yang mereka sertai.",
    roles: ALL,
    write: false,
    inputSchema: {
      type: "object",
      properties: {
        include_archived: { type: "boolean", description: "Lalai false" },
        limit: { type: "number", description: `Lalai ${LIMITS.default}` },
      },
    },
    handler: async (args, s) => {
      let q = s.db
        .from(TABLES.classes)
        .select(COLUMNS.classSummary)
        .order("created_at", { ascending: false })
        .limit(clampLimit(args?.limit));
      if (!args?.include_archived) q = q.eq("is_archived", false);
      return unwrapList<Record<string, unknown>>(await q, "Senarai kelas").map((c) => ({
        ...c,
        status: statusKelas(c),
      }));
    },
  },

  {
    name: "get_class",
    title: "Butiran kelas",
    description: "Satu kelas beserta kiraan hunt, board, educator dan ahli.",
    roles: ALL,
    write: false,
    inputSchema: {
      type: "object",
      properties: { class_id: { type: "string", description: "UUID kelas" } },
      required: ["class_id"],
    },
    handler: async (args, s) => {
      const cls = unwrapOne<Record<string, unknown>>(
        await s.db.from(TABLES.classes).select(COLUMNS.classSummary).eq("id", args.class_id).maybeSingle(),
        "Dapatkan kelas"
      );
      if (!cls) throw new Error("Kelas tidak dijumpai atau anda tiada akses kepadanya");

      return {
        ...cls,
        status: statusKelas(cls),
        counts: {
          hunts: await countBy(s, TABLES.hunts, "id", args.class_id),
          boards: await countBy(s, TABLES.boards, "id", args.class_id),
          educators: await countBy(s, TABLES.educators, "class_id", args.class_id),
          members: await countBy(s, TABLES.members, "class_id", args.class_id),
        },
      };
    },
  },

  {
    name: "set_class_status",
    title: "Tukar status kelas",
    description:
      "Tukar status kelas. active: buka semula kelas. ended: tamatkan kelas; hantaran jawapan dan penyertaan baharu disekat " +
      "(sama seperti butang End class di UI) tetapi kelas masih dipaparkan. archived: tamatkan dan sembunyikan kelas daripada " +
      "senarai kelas (list_classes dengan include_archived: true masih memaparkannya). Hanya pemilik kelas, pendidik bersama " +
      "atau admin. Status ended dan archived memerlukan confirm: true. Tarikh tamat asal dikekalkan jika kelas sudah tamat.",
    roles: STAFF,
    write: true,
    inputSchema: {
      type: "object",
      properties: {
        class_id: { type: "string", description: "UUID kelas" },
        status: { type: "string", enum: ["active", "ended", "archived"] },
        confirm: { type: "boolean", description: "Wajib true untuk ended dan archived" },
      },
      required: ["class_id", "status"],
    },
    handler: async (args, s) => {
      const status = String(args.status ?? "") as StatusKelas;
      if (!["active", "ended", "archived"].includes(status)) {
        throw new Error("status mesti active, ended atau archived");
      }
      if (status !== "active" && args.confirm !== true) {
        throw new Error("Tetapkan confirm: true untuk menamatkan atau mengarkib kelas");
      }
      const semasa = unwrapOne<{ ended_at: string | null }>(
        await s.db.from(TABLES.classes).select("ended_at").eq("id", args.class_id).maybeSingle(),
        "Dapatkan kelas"
      );
      if (!semasa) throw new Error("Kelas tidak dijumpai atau anda tiada akses kepadanya");

      const tamat = semasa.ended_at ?? new Date().toISOString();
      const patch =
        status === "active"
          ? { is_archived: false, ended_at: null }
          : status === "ended"
            ? { is_archived: false, ended_at: tamat }
            : { is_archived: true, ended_at: tamat };

      // Klien sesi pengguna: RLS qm_classes hanya membenarkan pemilik, pendidik kelas atau admin mengemas kini.
      const baru = unwrapOne<Record<string, unknown>>(
        await s.db.from(TABLES.classes).update(patch).eq("id", args.class_id).select(COLUMNS.classSummary).maybeSingle(),
        "Tukar status kelas"
      );
      if (!baru) {
        throw new Error("Status tidak dapat ditukar: hanya pemilik kelas, pendidik bersama atau admin boleh berbuat demikian");
      }
      return { ...baru, status: statusKelas(baru) };
    },
  },

  {
    name: "list_hunts",
    title: "Senarai hunt",
    description:
      "Senaraikan hunt (quest) dalam sesuatu kelas. Hunt ialah aktiviti peringkat atas; soalan individu di dalamnya dipanggil challenge.",
    roles: ALL,
    write: false,
    inputSchema: {
      type: "object",
      properties: {
        class_id: { type: "string" },
        status: { type: "string", description: "Tapis mengikut status hunt" },
        limit: { type: "number" },
      },
      required: ["class_id"],
    },
    handler: async (args, s) => {
      let q = s.db
        .from(TABLES.hunts)
        .select(COLUMNS.huntSummary)
        .eq("class_id", args.class_id)
        .order("created_at", { ascending: false })
        .limit(clampLimit(args?.limit));
      if (args.status) q = q.eq("status", args.status);
      return unwrapList(await q, "Senarai hunt");
    },
  },

  {
    name: "create_hunt",
    title: "Cipta hunt",
    description: "Cipta hunt baharu dalam sesuatu kelas.",
    roles: STAFF,
    write: true,
    inputSchema: {
      type: "object",
      properties: {
        class_id: { type: "string" },
        title: { type: "string" },
        description: { type: "string" },
        instructions: { type: "string" },
        points: { type: "number" },
        status: { type: "string", description: "Lalai: draft" },
        start_at: { type: "string", description: "Timestamp ISO 8601" },
        end_at: { type: "string", description: "Timestamp ISO 8601" },
      },
      required: ["class_id", "title"],
    },
    handler: async (args, s) =>
      unwrapOne(
        await s.db
          .from(TABLES.hunts)
          .insert({
            class_id: args.class_id,
            owner_id: s.userId,
            title: args.title,
            description: args.description ?? null,
            instructions: args.instructions ?? null,
            points: args.points ?? null,
            status: args.status ?? "draft",
            start_at: args.start_at ?? null,
            end_at: args.end_at ?? null,
          })
          .select(COLUMNS.huntSummary)
          .single(),
        "Cipta hunt"
      ),
  },

  {
    name: "update_hunt",
    title: "Kemas kini hunt",
    description: "Kemas kini medan pada hunt sedia ada. Hanya medan yang diberi akan diubah.",
    roles: STAFF,
    write: true,
    inputSchema: {
      type: "object",
      properties: {
        hunt_id: { type: "string" },
        title: { type: "string" },
        description: { type: "string" },
        instructions: { type: "string" },
        points: { type: "number" },
        status: { type: "string" },
        start_at: { type: "string" },
        end_at: { type: "string" },
      },
      required: ["hunt_id"],
    },
    handler: async (args, s) => {
      const { hunt_id, ...rest } = args;
      const patch = Object.fromEntries(
        Object.entries(rest).filter(([, v]) => v !== undefined && v !== null)
      );
      if (Object.keys(patch).length === 0) throw new Error("Tiada medan untuk dikemas kini");
      return unwrapOne(
        await s.db.from(TABLES.hunts).update(patch).eq("id", hunt_id).select(COLUMNS.huntSummary).single(),
        "Kemas kini hunt"
      );
    },
  },

  {
    name: "list_challenges",
    title: "Senarai challenge",
    description:
      "Senaraikan challenge dalam sesuatu hunt. Kunci jawapan hanya disertakan untuk educator dan admin; peserta tidak akan menerimanya.",
    roles: ALL,
    write: false,
    inputSchema: {
      type: "object",
      properties: { hunt_id: { type: "string" }, limit: { type: "number" } },
      required: ["hunt_id"],
    },
    handler: async (args, s) =>
      unwrapList(
        await s.db
          .from(TABLES.challenges)
          .select(isStaff(s) ? COLUMNS.challengeFull : COLUMNS.challengeSafe)
          .eq("hunt_id", args.hunt_id)
          .order("order_idx", { ascending: true })
          .limit(clampLimit(args?.limit)),
        "Senarai challenge"
      ),
  },

  {
    name: "create_challenge",
    title: "Cipta challenge",
    description: "Tambah challenge baharu pada hunt.",
    roles: STAFF,
    write: true,
    inputSchema: {
      type: "object",
      properties: {
        hunt_id: { type: "string" },
        title: { type: "string" },
        prompt: { type: "string" },
        answer: { type: "string", description: "Jawapan yang diterima" },
        points: { type: "number" },
        order_idx: { type: "number" },
      },
      required: ["hunt_id", "title", "prompt"],
    },
    handler: async (args, s) =>
      unwrapOne(
        await s.db
          .from(TABLES.challenges)
          .insert({
            hunt_id: args.hunt_id,
            title: args.title,
            prompt: args.prompt,
            answer: args.answer ?? null,
            points: args.points ?? null,
            order_idx: args.order_idx ?? null,
          })
          .select(COLUMNS.challengeFull)
          .single(),
        "Cipta challenge"
      ),
  },

  {
    name: "update_challenge",
    title: "Kemas kini challenge",
    description:
      "Kemas kini medan challenge: title, prompt, answer, points atau order_idx. " +
      "Hanya medan yang diberi akan diubah.",
    roles: STAFF,
    write: true,
    inputSchema: {
      type: "object",
      properties: {
        challenge_id: { type: "string" },
        title: { type: "string" },
        prompt: { type: "string" },
        answer: { type: "string", description: "Jawapan yang diterima" },
        points: { type: "number" },
        order_idx: { type: "number" },
      },
      required: ["challenge_id"],
    },
    handler: async (args, s) => updateChallenge(s.db, args),
  },

  {
    name: "delete_challenge",
    title: "Padam challenge",
    description:
      "Padam satu challenge daripada hunt. Memerlukan confirm: true. Penghantaran " +
      "peserta yang dipautkan pada challenge itu turut terpadam.",
    roles: STAFF,
    write: true,
    inputSchema: {
      type: "object",
      properties: {
        challenge_id: { type: "string" },
        confirm: { type: "boolean", description: "Wajib true" },
      },
      required: ["challenge_id"],
    },
    handler: async (args, s) => {
      if (!args.challenge_id) throw new Error("challenge_id diperlukan");
      return deleteChallenge(s.db, args.challenge_id, args.confirm);
    },
  },

  {
    name: "list_teams",
    title: "Senarai kumpulan",
    description:
      "Kumpulan peringkat kelas (bukan kumpulan hunt lama) dengan ahli dan ketua. " +
      "Ahli diambil daripada qm_team_members beserta peranannya; ketua ialah ahli " +
      "dengan role 'leader'.",
    roles: STAFF,
    write: false,
    inputSchema: {
      type: "object",
      properties: {
        class_id: { type: "string" },
        limit: { type: "number", description: `Lalai ${LIMITS.default}` },
      },
      required: ["class_id"],
    },
    handler: async (args, s) => {
      const teams = unwrapList(
        await s.db
          .from("qm_teams")
          .select("id, class_id, name, max_members, join_code, score, created_at")
          .eq("class_id", args.class_id)
          .is("hunt_id", null)
          .order("name", { ascending: true })
          .limit(clampLimit(args?.limit)),
        "Senarai kumpulan"
      ) as Array<{ id: string }>;

      if (teams.length === 0) return { teams: [] };

      // Satu pertanyaan berpagar RLS untuk semua kumpulan, bukan satu
      // pertanyaan setiap kumpulan.
      const members = unwrapList(
        await s.db
          .from("qm_team_members")
          .select("team_id, user_id, role, joined_at")
          .in("team_id", teams.map((t) => t.id)),
        "Ahli kumpulan"
      ) as Array<{ team_id: string; user_id: string; role: string; joined_at: string }>;

      const grouped = groupTeamsWithMembers(teams, members);
      return {
        teams: teams.map((t) => {
          const g = grouped[t.id];
          return {
            ...t,
            member_count: g?.members.length ?? 0,
            leader_user_id: g?.leader_user_id ?? null,
            members: (g?.members ?? []).map((m) => ({
              user_id: m.user_id,
              role: m.role,
              joined_at: m.joined_at,
            })),
          };
        }),
      };
    },
  },

  {
    name: "import_teams_csv",
    title: "Import kumpulan CSV",
    description:
      "Import kumpulan dan ahli daripada teks CSV (templat Kuizen: " +
      "nama_kumpulan,nama_ahli,emel,ketua). Guna mode preview dahulu untuk " +
      "melihat hasil tanpa apa-apa tulisan, kemudian mode commit. Semua atau " +
      "tiada: satu baris rosak bermakna tiada kumpulan dimasukkan. Had " +
      "kira-kira 500 KB dan 500 baris. replace true memindahkan ahli yang " +
      "sudah berada dalam kumpulan lain dalam kelas yang sama.",
    roles: STAFF,
    write: true,
    inputSchema: {
      type: "object",
      properties: {
        class_id: { type: "string" },
        mode: { type: "string", enum: ["preview", "commit"], description: "Lalai: preview" },
        content: { type: "string", description: "Kandungan fail CSV sebagai teks" },
        replace: { type: "boolean", description: "Pindahkan ahli antara kumpulan sedia ada" },
      },
      required: ["class_id", "content"],
    },
    handler: async (args, s) => {
      if (!args.class_id) throw new Error("class_id diperlukan");
      return importTeamsCsv(s.accessToken, args.class_id, args);
    },
  },

  {
    name: "set_team_leader",
    title: "Tetapkan ketua kumpulan",
    description:
      "Lantik seorang ahli kumpulan sebagai ketua dan turunkan ketua sedia ada " +
      "(jika ada). Pengguna mesti sudah menjadi ahli kumpulan itu; gunakan " +
      "import_teams_csv untuk menambah ahli.",
    roles: STAFF,
    write: true,
    inputSchema: {
      type: "object",
      properties: {
        team_id: { type: "string" },
        user_id: { type: "string" },
      },
      required: ["team_id", "user_id"],
    },
    handler: async (args, s) => {
      return setTeamLeader(s.db, String(args.team_id ?? ""), String(args.user_id ?? ""));
    },
  },

  {
    name: "list_boards",
    title: "Senarai board",
    description: "Senaraikan board pembelajaran bergaya Padlet dalam sesuatu kelas.",
    roles: ALL,
    write: false,
    inputSchema: {
      type: "object",
      properties: { class_id: { type: "string" }, limit: { type: "number" } },
      required: ["class_id"],
    },
    handler: async (args, s) =>
      unwrapList(
        await s.db
          .from(TABLES.boards)
          .select(COLUMNS.boardSummary)
          .eq("class_id", args.class_id)
          .order("created_at", { ascending: false })
          .limit(clampLimit(args?.limit)),
        "Senarai board"
      ),
  },

  {
    name: "get_board",
    title: "Kandungan board",
    description: "Satu board dengan lajur dan kadnya, disusun mengikut kedudukan.",
    roles: ALL,
    write: false,
    inputSchema: {
      type: "object",
      properties: { board_id: { type: "string" } },
      required: ["board_id"],
    },
    handler: async (args, s) => {
      const board = unwrapOne<Record<string, unknown>>(
        await s.db.from(TABLES.boards).select(COLUMNS.boardSummary).eq("id", args.board_id).maybeSingle(),
        "Dapatkan board"
      );
      if (!board) throw new Error("Board tidak dijumpai atau anda tiada akses kepadanya");

      const columns = unwrapList(
        await s.db
          .from(TABLES.boardColumns)
          .select(COLUMNS.boardColumnSummary)
          .eq("board_id", args.board_id)
          .order("position", { ascending: true }),
        "Muat lajur board"
      ) as Array<{ id: string; title: string; position: number }>;

      const cards = unwrapList(
        await s.db
          .from(TABLES.boardCards)
          .select(COLUMNS.boardCardSummary)
          .eq("board_id", args.board_id)
          .order("position", { ascending: true })
          .order("created_at", { ascending: true })
          .limit(LIMITS.max),
        "Muat kad board"
      ) as Array<Record<string, any>>;

      return {
        ...board,
        columns: columns.map((col) => ({
          ...col,
          cards: cards.filter((c) => c.column_id === col.id),
        })),
        uncolumned_cards: cards.filter((c) => !c.column_id),
      };
    },
  },

  {
    name: "create_board_card",
    title: "Cipta kad board",
    description:
      "Tambah kad baharu pada lajur board. Peserta juga boleh menggunakan ini. " +
      "Dilaksanakan melalui route aplikasi supaya position dikira dengan betul.",
    roles: ALL,
    write: true,
    inputSchema: {
      type: "object",
      properties: {
        board_id: { type: "string", description: "class_id disimpulkan daripada board ini" },
        column_id: { type: "string", description: "Lajur sasaran. Wajib." },
        title: { type: "string" },
        description: { type: "string" },
        card_type: { type: "string", enum: CARD_TYPES, description: "Lalai: text" },
        link_url: { type: "string", description: "Wajib untuk card_type link" },
        youtube_url: { type: "string", description: "Wajib untuk card_type youtube" },
        image_url: { type: "string", description: "Untuk card_type image, jika bukan fail yang dimuat naik" },
        file_code: { type: "string", description: "Kod daripada upload_board_file, untuk card_type file atau image" },
        file_url: { type: "string", description: "Alternatif kepada file_code" },
        file_name: { type: "string" },
        chatbot_url: { type: "string", description: "Wajib untuk card_type chatbot" },
        insert_index: { type: "number", description: "Sisip pada kedudukan ini; jika ditinggalkan, kad diletak di hujung" },
      },
      required: ["board_id", "column_id", "title"],
    },
    handler: async (args, s) => {
      const cardType: string = args.card_type ?? "text";
      if (!CARD_TYPES.includes(cardType)) {
        throw new Error(
          `card_type tidak sah: ${cardType}. Guna salah satu daripada ${CARD_TYPES.join(", ")}.`
        );
      }

      const classId = await classIdForBoard(args.board_id, s);

      const body: Record<string, unknown> = {
        columnId: args.column_id,
        cardType,
        title: args.title,
        description: args.description ?? null,
      };
      if (typeof args.insert_index === "number") body.insertIndex = args.insert_index;

      // Pengesahan di sini supaya klien MCP mendapat sebab yang jelas, bukan
      // 400 daripada route selepas perjalanan rangkaian.
      if (cardType === "link") {
        if (!args.link_url) throw new Error("card_type link memerlukan link_url");
        body.linkUrl = args.link_url;
      } else if (cardType === "youtube") {
        const yt = args.youtube_url ?? args.link_url;
        if (!yt) throw new Error("card_type youtube memerlukan youtube_url");
        body.youtubeUrl = yt;
      } else if (cardType === "image") {
        const imageUrl = args.image_url ?? fileRedirectUrl(classId, args.file_code);
        if (!imageUrl) throw new Error("card_type image memerlukan image_url atau file_code");
        body.imageUrl = imageUrl;
        if (args.file_code) body.fileluFileCode = args.file_code;
      } else if (cardType === "file") {
        const fileUrl = args.file_url ?? fileRedirectUrl(classId, args.file_code);
        if (!fileUrl) throw new Error("card_type file memerlukan file_code atau file_url");
        body.fileUrl = fileUrl;
        if (args.file_code) body.fileluFileCode = args.file_code;
        if (args.file_name) body.fileName = args.file_name;
      } else if (cardType === "chatbot") {
        if (!args.chatbot_url) throw new Error("card_type chatbot memerlukan chatbot_url");
        body.chatbotUrl = args.chatbot_url;
      }

      const res = await callApi<{ card: Record<string, unknown> }>(
        s.accessToken,
        `/api/learning-boards/${classId}/cards`,
        { method: "POST", body }
      );
      return res.card;
    },
  },

  {
    name: "create_class",
    title: "Cipta kelas",
    description:
      "Cipta kelas baharu berserta board pembelajarannya. Pemanggil didaftarkan " +
      "sebagai educator pemilik. Pulangkan id kelas dan board_id.",
    roles: STAFF,
    write: true,
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Nama kelas" },
        description: { type: "string" },
        color: { type: "string", description: "Warna hex, lalai #6366f1" },
      },
      required: ["name"],
    },
    handler: async (args, s) => {
      if (!isStaff(s)) throw new Error("Hanya educator atau admin boleh mencipta kelas");

      const klass = unwrapOne<Record<string, any>>(
        await s.db
          .from(TABLES.classes)
          .insert({
            owner_id: s.userId,
            name: args.name,
            description: args.description ?? null,
            color: args.color ?? "#6366f1",
          })
          .select(COLUMNS.classSummary)
          .single(),
        "Cipta kelas"
      );
      if (!klass) throw new Error("Kelas tidak tercipta");

      // Sama seperti createClass() dalam lib/data.ts: pemilik mesti wujud dalam
      // qm_class_educators, jika tidak kelas itu tidak muncul dalam senarai
      // educator mereka sendiri. Ralat diabaikan kerana trigger mungkin sudah
      // melakukannya.
      await s.db.from(TABLES.educators).upsert(
        {
          class_id: klass.id,
          [TABLES.educatorUserIdColumn]: s.userId,
          role: "owner",
          invited_by: s.userId,
          accepted_at: new Date().toISOString(),
        } as any,
        { onConflict: `class_id,${TABLES.educatorUserIdColumn}` }
      );

      // GET board mewujudkannya secara malas, jadi kelas baharu terus
      // mempunyai board yang boleh diisi lajur dan kad.
      const boardRes = await callApi<{ board: { id: string } | null }>(
        s.accessToken,
        `/api/learning-boards/${klass.id}`
      );

      return { ...klass, board_id: boardRes?.board?.id ?? null };
    },
  },

  {
    name: "create_board_column",
    title: "Cipta lajur board",
    description: "Tambah lajur baharu pada board kelas. Position dikira oleh aplikasi.",
    roles: STAFF,
    write: true,
    inputSchema: {
      type: "object",
      properties: {
        board_id: { type: "string", description: "Berikan board_id atau class_id" },
        class_id: { type: "string" },
        title: { type: "string" },
      },
      required: ["title"],
    },
    handler: async (args, s) => {
      if (!args.class_id && !args.board_id) throw new Error("Berikan board_id atau class_id");
      const classId = args.class_id ?? (await classIdForBoard(args.board_id, s));
      const res = await callApi<{ column: Record<string, unknown> }>(
        s.accessToken,
        `/api/learning-boards/${classId}/columns`,
        { method: "POST", body: { title: args.title } }
      );
      return res.column;
    },
  },

  {
    name: "upload_board_file",
    title: "Muat naik fail board",
    description:
      "Muat naik fail untuk digunakan oleh kad file atau image. Pulangkan file_code " +
      "yang boleh diberi terus kepada create_board_card. " +
      "PILIH LALUAN YANG BETUL: fail pada komputer pengguna guna create_upload_ticket dan " +
      "BUKAN tool ini; fail yang sudah ada di web guna source_url pada tool ini; " +
      "content_base64 hanya untuk fail bawah 16 KB seperti nota teks pendek atau ikon kecil. " +
      "JANGAN jana base64 untuk slaid, PDF, Word, Excel atau apa-apa fail dokumen: base64 " +
      "menelan kira-kira 4 token setiap aksara, jadi fail 71 KB sahaja menelan lebih 380,000 " +
      "token dan fail 245 KB menelan 1.3 juta. Ia akan ditolak, dan token itu sudah terbazir " +
      "sebelum penolakan sampai. Keupayaan muat naik pengguna dikuatkuasakan oleh aplikasi.",
    roles: ALL,
    write: true,
    inputSchema: {
      type: "object",
      properties: {
        class_id: { type: "string", description: "Berikan class_id atau board_id" },
        board_id: { type: "string" },
        file_name: { type: "string" },
        source_url: { type: "string", description: "URL https yang diambil oleh pelayan. Laluan utama." },
        content_base64: { type: "string", description: "Hanya fail bawah 16 KB. Apa-apa yang lebih besar mesti guna create_upload_ticket atau source_url." },
        mime_type: { type: "string" },
      },
      required: ["file_name"],
    },
    handler: async (args, s) => {
      if (!args.class_id && !args.board_id) throw new Error("Berikan class_id atau board_id");
      const classId = args.class_id ?? (await classIdForBoard(args.board_id, s));

      const hasB64 = typeof args.content_base64 === "string" && args.content_base64.length > 0;
      const hasUrl = typeof args.source_url === "string" && args.source_url.length > 0;

      if (hasB64 && hasUrl) {
        throw new Error("Berikan content_base64 ATAU source_url, bukan kedua-duanya");
      }
      if (!hasB64 && !hasUrl) {
        throw new Error(
          "Berikan source_url untuk fail dalam talian, content_base64 untuk fail kecil, " +
            "atau guna create_upload_ticket untuk fail pada komputer anda"
        );
      }

      if (hasUrl) {
        const up = await callApi<any>(s.accessToken, `/api/learning-boards/${classId}/upload-file`, {
          method: "POST",
          body: { sourceUrl: args.source_url, fileName: args.file_name },
        });
        return { ...up, class_id: classId, file_code: up?.fileCode ?? null };
      }

      if (args.content_base64.length > MAX_BASE64_CHARS) {
        const kb = Math.round((args.content_base64.length * 0.75) / 1024);
        const tokens = Math.round(args.content_base64.length * TOKEN_PER_BASE64_CHAR);
        const kosTeks =
          tokens >= 1_000_000
            ? `${(tokens / 1_000_000).toFixed(1)} juta`
            : `${Math.round(tokens / 1000)} ribu`;
        throw new Error(
          `Fail ${kb} KB terlalu besar untuk content_base64, had ${MAX_BASE64_CHARS / 1024} KB. ` +
            `Base64 menelan kira-kira 4 token setiap aksara, jadi fail ini memerlukan kira-kira ${kosTeks} token. ` +
            `Guna create_upload_ticket untuk fail pada komputer anda, atau source_url untuk fail yang sudah ada di web.`
        );
      }

      const up = await uploadFile(
        s.accessToken,
        classId,
        args.file_name,
        args.content_base64,
        args.mime_type
      );
      // Alias snake_case supaya hasilnya boleh disalurkan terus ke create_board_card.
      return { ...up, class_id: classId, file_code: up?.fileCode ?? null };
    },
  },

  {
    name: "create_upload_ticket",
    title: "Cipta tiket muat naik",
    description:
      "Keluarkan URL PUT bertandatangan, sah 15 minit, supaya alat tempatan boleh menghantar " +
      "fail terus ke storan. Ini laluan untuk fail pada komputer pengguna: tiada satu bait pun " +
      "melalui model, jadi tiada kos token dan tiada had saiz. Selepas PUT selesai, panggil " +
      "finalize_upload untuk mendapatkan file_code.",
    roles: ALL,
    write: true,
    inputSchema: {
      type: "object",
      properties: {
        class_id: { type: "string", description: "Berikan class_id atau board_id" },
        board_id: { type: "string" },
        file_name: { type: "string" },
        mime_type: { type: "string" },
        size: { type: "number", description: "Saiz dalam bait. Pilihan tetapi disyorkan." },
      },
      required: ["file_name"],
    },
    handler: async (args, s) => {
      if (!args.class_id && !args.board_id) throw new Error("Berikan class_id atau board_id");
      const classId = args.class_id ?? (await classIdForBoard(args.board_id, s));
      const res = await callApi<any>(s.accessToken, `/api/learning-boards/${classId}/upload/ticket`, {
        method: "POST",
        body: {
          fileName: args.file_name,
          mimeType: args.mime_type,
          size: typeof args.size === "number" ? args.size : undefined,
          boardId: args.board_id,
        },
      });
      return { ...res, class_id: classId };
    },
  },

  {
    name: "finalize_upload",
    title: "Muktamadkan muat naik",
    description:
      "Sahkan fail benar-benar sampai ke storan, kemudian pulangkan file_code untuk " +
      "create_board_card. Tiket hanya boleh digunakan sekali.",
    roles: ALL,
    write: true,
    inputSchema: {
      type: "object",
      properties: {
        ticket_id: { type: "string" },
        class_id: { type: "string", description: "Berikan class_id atau board_id" },
        board_id: { type: "string" },
      },
      required: ["ticket_id"],
    },
    handler: async (args, s) => {
      if (!args.class_id && !args.board_id) throw new Error("Berikan class_id atau board_id");
      const classId = args.class_id ?? (await classIdForBoard(args.board_id, s));
      const res = await callApi<any>(s.accessToken, `/api/learning-boards/${classId}/upload/finalize`, {
        method: "POST",
        body: { ticketId: args.ticket_id },
      });
      return { ...res, class_id: classId, file_code: res?.fileCode ?? null };
    },
  },

  {
    name: "update_board",
    title: "Kemas kini board",
    description:
      "Kemas kini tajuk, penerangan, atau status terbitan board kelas. Hanya medan yang diberi akan diubah.",
    roles: STAFF,
    write: true,
    inputSchema: {
      type: "object",
      properties: {
        class_id: { type: "string", description: "Berikan class_id atau board_id" },
        board_id: { type: "string" },
        title: { type: "string" },
        description: { type: "string" },
        is_published: { type: "boolean", description: "Terbitkan board kepada peserta" },
      },
      required: [],
    },
    handler: async (args, s) => {
      if (!args.class_id && !args.board_id) throw new Error("Berikan class_id atau board_id");
      const classId = args.class_id ?? (await classIdForBoard(args.board_id, s));
      const body: Record<string, unknown> = {};
      if (typeof args.title === "string") body.title = args.title;
      if (typeof args.description === "string") body.description = args.description;
      if (typeof args.is_published === "boolean") body.is_published = args.is_published;
      if (Object.keys(body).length === 0) throw new Error("Tiada medan untuk dikemas kini");
      const res = await callApi<{ board: Record<string, unknown> }>(
        s.accessToken,
        `/api/learning-boards/${classId}`,
        { method: "PATCH", body }
      );
      return res.board;
    },
  },

  {
    name: "update_board_card",
    title: "Kemas kini kad board",
    description: "Kemas kini medan pada kad sedia ada. Hanya medan yang diberi akan diubah.",
    roles: ALL,
    write: true,
    inputSchema: {
      type: "object",
      properties: {
        card_id: { type: "string" },
        class_id: { type: "string", description: "Pilihan; disimpulkan daripada kad jika ditinggalkan" },
        board_id: { type: "string", description: "Pilihan" },
        title: { type: "string" },
        description: { type: "string" },
        link_url: { type: "string" },
        image_url: { type: "string" },
        column_id: { type: "string", description: "Pindahkan kad ke lajur lain" },
        position: { type: "number" },
      },
      required: ["card_id"],
    },
    handler: async (args, s) => {
      const classId =
        args.class_id ??
        (args.board_id
          ? await classIdForBoard(args.board_id, s)
          : await classIdForCard(args.card_id, s));

      const body: Record<string, unknown> = {};
      for (const k of ["title", "description", "link_url", "image_url", "column_id"]) {
        if (typeof args[k] === "string") body[k] = args[k];
      }
      if (typeof args.position === "number") body.position = args.position;
      if (Object.keys(body).length === 0) throw new Error("Tiada medan untuk dikemas kini");

      const res = await callApi<{ card: Record<string, unknown> }>(
        s.accessToken,
        `/api/learning-boards/${classId}/cards/${args.card_id}`,
        { method: "PATCH", body }
      );
      return res.card;
    },
  },

  {
    name: "list_members",
    title: "Senarai ahli kelas",
    description: "Senaraikan peserta dalam sesuatu kelas. Educator dan admin sahaja.",
    roles: STAFF,
    write: false,
    inputSchema: {
      type: "object",
      properties: { class_id: { type: "string" }, limit: { type: "number" } },
      required: ["class_id"],
    },
    handler: async (args, s) =>
      unwrapList(
        await s.db
          .from(TABLES.members)
          .select("class_id, user_id, joined_at")
          .eq("class_id", args.class_id)
          .order("joined_at", { ascending: false })
          .limit(clampLimit(args?.limit)),
        "Senarai ahli"
      ),
  },

  {
    name: "list_submissions",
    title: "Senarai penghantaran",
    description:
      "Senaraikan penghantaran, boleh ditapis mengikut challenge atau status. Jawapan peserta dikecualikan daripada ringkasan ini; gunakan get_submission untuk satu rekod penuh.",
    roles: ALL,
    write: false,
    inputSchema: {
      type: "object",
      properties: {
        challenge_id: { type: "string" },
        status: { type: "string" },
        limit: { type: "number" },
      },
    },
    handler: async (args, s) => {
      let q = s.db
        .from(TABLES.submissions)
        .select(COLUMNS.submissionSummary)
        .order("created_at", { ascending: false })
        .limit(clampLimit(args?.limit));
      if (args?.challenge_id) q = q.eq("challenge_id", args.challenge_id);
      if (args?.status) q = q.eq("status", args.status);
      return unwrapList(await q, "Senarai penghantaran");
    },
  },

  {
    name: "get_submission",
    title: "Butiran penghantaran",
    description: "Satu penghantaran termasuk jawapan yang dihantar.",
    roles: ALL,
    write: false,
    inputSchema: {
      type: "object",
      properties: { submission_id: { type: "string" } },
      required: ["submission_id"],
    },
    handler: async (args, s) => {
      const row = unwrapOne<Record<string, unknown>>(
        await s.db
          .from(TABLES.submissions)
          .select("id, challenge_id, team_id, user_id, answer, status, reviewed_by, created_at")
          .eq("id", args.submission_id)
          .maybeSingle(),
        "Dapatkan penghantaran"
      );
      if (!row) throw new Error("Penghantaran tidak dijumpai atau anda tiada akses kepadanya");
      return row;
    },
  },

  {
    name: "review_submission",
    title: "Nilai penghantaran",
    description: "Tetapkan status penghantaran, contohnya diterima atau ditolak.",
    roles: STAFF,
    write: true,
    inputSchema: {
      type: "object",
      properties: {
        submission_id: { type: "string" },
        status: { type: "string", description: "Status baharu" },
      },
      required: ["submission_id", "status"],
    },
    handler: async (args, s) =>
      unwrapOne(
        await s.db
          .from(TABLES.submissions)
          .update({ status: args.status, reviewed_by: s.userId })
          .eq("id", args.submission_id)
          .select(COLUMNS.submissionSummary)
          .single(),
        "Nilai penghantaran"
      ),
  },

  {
    name: "class_progress_report",
    title: "Laporan progres kelas",
    description:
      "Ringkasan agregat untuk sesuatu kelas: bilangan hunt dan challenge, penghantaran mengikut status, dan challenge yang belum ada penghantaran.",
    roles: STAFF,
    write: false,
    inputSchema: {
      type: "object",
      properties: { class_id: { type: "string" } },
      required: ["class_id"],
    },
    handler: async (args, s) => {
      const hunts = unwrapList(
        await s.db.from(TABLES.hunts).select("id, title, status").eq("class_id", args.class_id),
        "Muat hunt"
      ) as Array<{ id: string; title: string; status: string }>;

      if (hunts.length === 0) {
        return { class_id: args.class_id, hunts: 0, note: "Kelas ini belum ada hunt" };
      }

      // Satu .in() dengan ratusan UUID menghasilkan URL yang ditolak dengan 414.
      const CHUNK = 50;
      const chunked = async <T>(ids: string[], run: (batch: string[]) => Promise<T[]>) => {
        const out: T[] = [];
        for (let i = 0; i < ids.length; i += CHUNK) out.push(...(await run(ids.slice(i, i + CHUNK))));
        return out;
      };

      const challenges = await chunked(hunts.map((h) => h.id), async (batch) =>
        unwrapList(
          await s.db.from(TABLES.challenges).select("id, hunt_id, title").in("hunt_id", batch),
          "Muat challenge"
        ) as Array<{ id: string; hunt_id: string; title: string }>
      );

      const subs = await chunked(challenges.map((c) => c.id), async (batch) =>
        unwrapList(
          await s.db.from(TABLES.submissions).select("challenge_id, status").in("challenge_id", batch),
          "Muat penghantaran"
        ) as Array<{ challenge_id: string; status: string }>
      );

      const byStatus: Record<string, number> = {};
      for (const sub of subs) byStatus[sub.status] = (byStatus[sub.status] ?? 0) + 1;

      return {
        class_id: args.class_id,
        hunts: hunts.length,
        hunts_by_status: hunts.reduce<Record<string, number>>((acc, h) => {
          acc[h.status] = (acc[h.status] ?? 0) + 1;
          return acc;
        }, {}),
        challenges: challenges.length,
        submissions_total: subs.length,
        submissions_by_status: byStatus,
        challenges_without_submissions: challenges
          .filter((c) => !subs.some((sub) => sub.challenge_id === c.id))
          .map((c) => c.title)
          .slice(0, 50),
      };
    },
  },

  {
    name: "search",
    title: "Cari kandungan Kuizen",
    description:
      "Cari merentasi kelas, hunt dan board mengikut teks. Pulangkan id berprefiks yang boleh dihantar kepada fetch.",
    roles: ALL,
    write: false,
    inputSchema: {
      type: "object",
      properties: { query: { type: "string", description: "Teks carian" } },
      required: ["query"],
    },
    handler: async (args, s) => {
      // PostgREST memetakan `*` kepada `%` dalam corak like/ilike, jadi ia
      // mesti dibuang bersama wildcard SQL sebenar.
      const term = `%${String(args.query).replace(/[%_*]/g, "")}%`;

      const [classes, hunts, boards] = await Promise.all([
        // Perhatikan: qm_classes menggunakan `name`, bukan `title`.
        s.db.from(TABLES.classes).select("id, name").ilike("name", term).limit(10),
        s.db.from(TABLES.hunts).select("id, title").ilike("title", term).limit(10),
        s.db.from(TABLES.boards).select("id, title").ilike("title", term).limit(10),
      ]);

      return {
        results: [
          ...unwrapList(classes, "Cari kelas").map((r: any) => ({
            id: `class:${r.id}`, title: r.name, url: `/classes/${r.id}`,
          })),
          ...unwrapList(hunts, "Cari hunt").map((r: any) => ({
            id: `hunt:${r.id}`, title: r.title, url: `/hunts/${r.id}`,
          })),
          ...unwrapList(boards, "Cari board").map((r: any) => ({
            id: `board:${r.id}`, title: r.title, url: `/boards/${r.id}`,
          })),
        ],
      };
    },
  },

  {
    name: "fetch",
    title: "Ambil rekod Kuizen",
    description:
      "Ambil satu rekod penuh menggunakan id berprefiks daripada search, contohnya 'hunt:<uuid>'.",
    roles: ALL,
    write: false,
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Id berprefiks: class:<uuid>, hunt:<uuid> atau board:<uuid>" },
      },
      required: ["id"],
    },
    handler: async (args, s) => {
      const [kind, id] = String(args.id).split(":");
      const table =
        kind === "class" ? TABLES.classes :
        kind === "hunt" ? TABLES.hunts :
        kind === "board" ? TABLES.boards :
        null;

      if (!table || !id) {
        throw new Error("Id tidak sah. Guna class:<uuid>, hunt:<uuid> atau board:<uuid>");
      }

      const row = unwrapOne<Record<string, unknown>>(
        await s.db.from(table).select("*").eq("id", id).maybeSingle(),
        "Ambil rekod"
      );
      if (!row) throw new Error("Rekod tidak dijumpai atau anda tiada akses kepadanya");

      // Jaring keselamatan: fetch ialah satu-satunya tool yang menggunakan
      // select("*"), jadi tapis lajur sensitif sebelum memulangkannya.
      return redact(row);
    },
  },

  /* ============================================================
   * Kuiz Langsung (Live Quiz)
   * ============================================================
   * Semua tulisan memanggil route /api/live/** sebagai pengguna, jadi
   * semakan pemilik/pendidik dan had pelan (pencetus DB 0030) dijalankan
   * oleh route dan pangkalan data, bukan disalin ke sini.
   */

  {
    name: "list_live_quizzes",
    title: "Senarai kuiz langsung",
    description:
      "Senaraikan kuiz Live Quiz yang boleh dihoskan oleh pengguna: kuiz peribadi miliknya dan " +
      "kuiz kelas yang dia ajar. Termasuk bilangan soalan setiap kuiz.",
    roles: STAFF,
    write: false,
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Lalai 50, maksimum 200" },
      },
    },
    handler: async (args, s) => {
      // Route GET /api/live/quizzes sudah melaksanakan semakan pemilikan dan
      // pendidik kelas, termasuk kes kuiz berkongsi dengan kelas.
      // Pembetulan KZ-004: argumen limit kini dihormati (lalai 50, maks 200);
      // route tiada parameter limit, jadi potongan dibuat selepas bacaan.
      const limit = clampLiveQuizLimit(args?.limit);
      const res = await callApi<{ data?: any[] }>(s.accessToken, "/api/live/quizzes");
      const all = (Array.isArray(res) ? res : res.data ?? []) as Array<Record<string, any>>;
      const quizzes = all.slice(0, limit);

      // Kiraan soalan: satu pertanyaan berpagar RLS untuk semua kuiz dalam
      // senarai, bukan satu pertanyaan setiap kuiz.
      const ids = quizzes.map((q) => q.id).filter(Boolean);
      const counts: Record<string, number> = {};
      if (ids.length > 0) {
        const rows = unwrapList(
          await s.db.from(TABLES.liveQuestions).select("quiz_id").in("quiz_id", ids),
          "Kiraan soalan kuiz langsung"
        ) as Array<{ quiz_id: string }>;
        for (const r of rows) counts[r.quiz_id] = (counts[r.quiz_id] ?? 0) + 1;
      }

      return {
        quizzes: quizzes.map((q) => ({
          id: q.id,
          title: q.title,
          description: q.description ?? null,
          class_id: q.class_id ?? null,
          class_name: q.class?.name ?? null,
          question_count: counts[q.id] ?? 0,
          created_at: q.created_at,
        })),
      };
    },
  },

  {
    name: "get_live_quiz",
    title: "Butiran kuiz langsung",
    description:
      "Satu kuiz Live Quiz bersama semua soalan, pilihan jawapan dan kunci jawapan. " +
      "Hanya pemilik kuiz, pendidik kelasnya atau admin boleh melihat kunci jawapan.",
    roles: STAFF,
    write: false,
    inputSchema: {
      type: "object",
      properties: { quiz_id: { type: "string", description: "UUID kuiz langsung" } },
      required: ["quiz_id"],
    },
    handler: async (args, s) => {
      const res = await callApi<{ data?: Record<string, unknown> } & Record<string, unknown>>(
        s.accessToken,
        `/api/live/quizzes/${args.quiz_id}`
      );
      return res.data ?? res;
    },
  },

  {
    name: "get_live_session",
    title: "Keadaan sesi langsung",
    description:
      "Keadaan penuh sesi Live Quiz dari sudut hos: status, kod sertai, pautan sertai, pautan QR, " +
      "bilangan pemain, senarai pemain, soalan semasa dan taburan jawapannya.",
    roles: STAFF,
    write: false,
    inputSchema: {
      type: "object",
      properties: { session_id: { type: "string", description: "UUID sesi" } },
      required: ["session_id"],
    },
    handler: async (args, s) => {
      const res = await callApi<{ data?: Record<string, any> } & Record<string, any>>(
        s.accessToken,
        `/api/live/sessions/${args.session_id}`
      );
      const data = res.data ?? res;
      const code = data?.session?.code ?? data?.code ?? null;
      return {
        ...data,
        ...(code ? liveSessionLinks(String(code)) : {}),
      };
    },
  },

  {
    name: "get_live_leaderboard",
    title: "Papan pendahulu langsung",
    description:
      "Kedudukan dan markah pemain bagi satu sesi Live Quiz (semasa atau sudah tamat). " +
      "Dua puluh teratas, ikut markah kemudian masa.",
    roles: STAFF,
    write: false,
    inputSchema: {
      type: "object",
      properties: { session_id: { type: "string", description: "UUID sesi" } },
      required: ["session_id"],
    },
    handler: async (args, s) => {
      // Kod sesi diperlukan untuk laluan papan pendahulu; ambilnya daripada
      // laluan hos supaya semakan pemilikan dijalankan dahulu.
      const ses = await callApi<{ data?: { session?: { code?: string; status?: string } } }>(
        s.accessToken,
        `/api/live/sessions/${args.session_id}`
      );
      const sesData = (ses as any).data ?? ses;
      const code = sesData?.session?.code;
      if (!code) throw new Error("Sesi tidak dijumpai atau anda bukan hosnya");

      const res = await callApi<{ leaderboard?: Array<Record<string, unknown>> }>(
        s.accessToken,
        `/api/live/play/${code}/leaderboard`
      );
      return {
        session_id: args.session_id,
        code,
        status: sesData?.session?.status ?? null,
        leaderboard: res.leaderboard ?? [],
      };
    },
  },

  {
    name: "create_live_quiz",
    title: "Cipta kuiz langsung",
    description:
      "Cipta kuiz Live Quiz baharu. Tanpa class_id ia menjadi kuiz peribadi milik anda. " +
      "streak_bonus (lalai true) menghidupkan bonus rentetan markah. Had bilangan kuiz pelan " +
      "dikuatkuasakan oleh pangkalan data.",
    roles: STAFF,
    write: true,
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        description: { type: "string" },
        class_id: { type: "string", description: "Pilihan; kongsi kuiz dengan kelas ini" },
        streak_bonus: { type: "boolean", description: "Lalai true" },
      },
      required: ["title"],
    },
    handler: async (args, s) => createLiveQuiz(s.accessToken, args),
  },

  {
    name: "add_live_questions",
    title: "Tambah soalan kuiz langsung",
    description:
      "Tambah satu atau banyak soalan aneka pilihan pada kuiz Live Quiz. Setiap soalan boleh " +
      "memberi options [{key,text}] ATAU option_texts [teks1, teks2, ..] (kunci A,B,C dijana " +
      "sendiri). points 1..10000 (lalai 1000), time_limit_sec 5..300 (lalai 20), use_countdown " +
      "lalai true, double_points lalai false. Semua soalan disahkan dahulu: jika satu sahaja " +
      "tidak sah, TIADA apa-apa ditambah.",
    roles: STAFF,
    write: true,
    inputSchema: {
      type: "object",
      properties: {
        quiz_id: { type: "string" },
        questions: {
          type: "array",
          description: "Maksimum 100 soalan setiap panggilan",
          items: { type: "object" },
        },
      },
      required: ["quiz_id", "questions"],
    },
    handler: async (args, s) => {
      if (!args.quiz_id) throw new Error("quiz_id diperlukan");
      return addLiveQuestions(s.accessToken, args.quiz_id, args.questions);
    },
  },

  {
    name: "import_live_questions",
    title: "Import soalan CSV atau Aiken",
    description:
      "Import soalan daripada teks CSV (templat Kuizen) atau format Aiken. Guna mode preview " +
      "dahulu untuk melihat hasil huraian tanpa apa-apa tulisan, kemudian mode commit untuk " +
      "memasukkannya. CSV bersifat semua-atau-tiada; Aiken melangkau blok yang rosak. Had " +
      "kira-kira 500 KB dan 100 soalan, sama seperti laluan aplikasi.",
    roles: STAFF,
    write: true,
    inputSchema: {
      type: "object",
      properties: {
        quiz_id: { type: "string" },
        format: { type: "string", enum: ["csv", "aiken"] },
        mode: { type: "string", enum: ["preview", "commit"], description: "Lalai: preview" },
        content: { type: "string", description: "Kandungan fail CSV atau Aiken sebagai teks" },
      },
      required: ["quiz_id", "format", "content"],
    },
    handler: async (args, s) => {
      if (!args.quiz_id) throw new Error("quiz_id diperlukan");
      return importLiveQuestions(s.accessToken, args.quiz_id, args);
    },
  },

  {
    name: "update_live_question",
    title: "Kemas kini soalan langsung",
    description:
      "Kemas kini medan soalan Live Quiz: prompt, options, correct_key, points, time_limit_sec, " +
      "use_countdown atau double_points. Hanya medan yang diberi akan diubah.",
    roles: STAFF,
    write: true,
    inputSchema: {
      type: "object",
      properties: {
        question_id: { type: "string" },
        prompt: { type: "string" },
        options: { type: "array", items: { type: "object" }, description: "[{key, text}], 2 hingga 6 item" },
        correct_key: { type: "string", description: "Mesti salah satu kunci pilihan" },
        points: { type: "number" },
        time_limit_sec: { type: "number" },
        use_countdown: { type: "boolean" },
        double_points: { type: "boolean" },
      },
      required: ["question_id"],
    },
    handler: async (args, s) => {
      if (!args.question_id) throw new Error("question_id diperlukan");
      return updateLiveQuestion(s.accessToken, args.question_id, args);
    },
  },

  {
    name: "delete_live_question",
    title: "Padam soalan langsung",
    description: "Padam satu soalan daripada kuiz Live Quiz. Memerlukan confirm: true.",
    roles: STAFF,
    write: true,
    inputSchema: {
      type: "object",
      properties: {
        question_id: { type: "string" },
        confirm: { type: "boolean", description: "Wajib true" },
      },
      required: ["question_id"],
    },
    handler: async (args, s) => {
      if (!args.question_id) throw new Error("question_id diperlukan");
      return deleteLiveQuestion(s.accessToken, args.question_id, args.confirm);
    },
  },

  {
    name: "start_live_session",
    title: "Mula sesi langsung",
    description:
      "Cipta sesi Live Quiz baharu dalam lobi untuk satu kuiz. Kuiz perlu sekurang-kurangnya " +
      "satu soalan. Pulangkan session_id, kod sertai 6 aksara, pautan sertai dan pautan QR. " +
      "Selepas ini gunakan control_live_session dengan action start.",
    roles: STAFF,
    write: true,
    inputSchema: {
      type: "object",
      properties: { quiz_id: { type: "string" } },
      required: ["quiz_id"],
    },
    handler: async (args, s) => {
      if (!args.quiz_id) throw new Error("quiz_id diperlukan");
      return startLiveSession(s.accessToken, args.quiz_id);
    },
  },

  {
    name: "control_live_session",
    title: "Kawal sesi langsung",
    description:
      "Kawal sesi Live Quiz: action start (lobi ke soalan pertama), next (soalan berikutnya), " +
      "reveal (tunjuk jawapan), end (tamat, WAJIB confirm: true) atau reset (kembali ke lobi dan " +
      "padam semua jawapan, WAJIB confirm: true).",
    roles: STAFF,
    write: true,
    inputSchema: {
      type: "object",
      properties: {
        session_id: { type: "string" },
        action: { type: "string", enum: ["start", "next", "reveal", "end", "reset"] },
        confirm: { type: "boolean", description: "Wajib true untuk action end dan reset" },
      },
      required: ["session_id", "action"],
    },
    handler: async (args, s) => {
      if (!args.session_id) throw new Error("session_id diperlukan");
      return controlLiveSession(s.accessToken, args.session_id, args);
    },
  },

  /* ============================================================
   * Penilaian rakan (peer review) dan jemputan pendidik (KZ-004)
   * Semua tulisan melalui route /api/classes/** supaya semakan
   * pendidik kelas dijalankan oleh route, bukan disalin di sini.
   * ============================================================ */

  {
    name: "list_peer_rounds",
    title: "Senarai pusingan penilaian rakan",
    description:
      "Senaraikan pusingan penilaian rakan (peer review) satu kelas: nama, jenis, minggu, " +
      "tarikh buka dan tutup, serta tarikh pengiraan terakhir. Pendidik kelas sahaja.",
    roles: STAFF,
    write: false,
    inputSchema: {
      type: "object",
      properties: { class_id: { type: "string", description: "UUID kelas" } },
      required: ["class_id"],
    },
    handler: async (args, s) => {
      if (!args.class_id) throw new Error("class_id diperlukan");
      return listPeerRounds(s.accessToken, args.class_id);
    },
  },

  {
    name: "create_peer_round",
    title: "Cipta pusingan penilaian rakan",
    description:
      "Cipta pusingan penilaian rakan formatif untuk satu kelas. Badan: name, opens_at, " +
      "closes_at (tarikh sah, tutup mesti selepas buka) dan week pilihan 1 hingga 52. " +
      "Had enam pusingan dan sekatan pelan dikuatkuasakan oleh pangkalan data; ralatnya " +
      "dihantar balik seperti sedia ada. Pusingan bermarkah (sumatif) belum disokong.",
    roles: STAFF,
    write: true,
    inputSchema: {
      type: "object",
      properties: {
        class_id: { type: "string", description: "UUID kelas" },
        name: { type: "string" },
        opens_at: { type: "string", description: "Tarikh buka, contoh 2026-10-01T00:00:00Z" },
        closes_at: { type: "string", description: "Tarikh tutup, mesti selepas opens_at" },
        week: { type: "number", description: "Pilihan, 1 hingga 52" },
      },
      required: ["class_id", "name", "opens_at", "closes_at"],
    },
    handler: async (args, s) => {
      if (!args.class_id) throw new Error("class_id diperlukan");
      return createPeerRound(s.accessToken, args.class_id, args);
    },
  },

  {
    name: "update_peer_round",
    title: "Kemas kini pusingan penilaian rakan",
    description:
      "Sunting nama, minggu atau tarikh buka/tutup satu pusingan penilaian rakan. Hanya " +
      "medan yang diberi akan diubah; tarikh sebelah sahaja dibandingkan dengan nilai sedia ada.",
    roles: STAFF,
    write: true,
    inputSchema: {
      type: "object",
      properties: {
        class_id: { type: "string", description: "UUID kelas" },
        round_id: { type: "string", description: "UUID pusingan" },
        name: { type: "string" },
        week: { type: "number", description: "1 hingga 52" },
        opens_at: { type: "string" },
        closes_at: { type: "string" },
      },
      required: ["class_id", "round_id"],
    },
    handler: async (args, s) => {
      if (!args.class_id) throw new Error("class_id diperlukan");
      if (!args.round_id) throw new Error("round_id diperlukan");
      const { class_id: classId, round_id: roundId, ...fields } = args;
      return updatePeerRound(s.accessToken, classId, roundId, fields);
    },
  },

  {
    name: "compute_peer_round",
    title: "Kira keputusan penilaian rakan",
    description:
      "Jalankan pengiraan keputusan satu pusingan penilaian rakan (RPC qm_peer_compute " +
      "melalui route compute). Pulangkan bilangan baris keputusan yang ditulis. Sekatan " +
      "pelan disemak di dalam fungsi pangkalan data itu sendiri.",
    roles: STAFF,
    write: true,
    inputSchema: {
      type: "object",
      properties: {
        class_id: { type: "string", description: "UUID kelas" },
        round_id: { type: "string", description: "UUID pusingan" },
      },
      required: ["class_id", "round_id"],
    },
    handler: async (args, s) => {
      if (!args.class_id) throw new Error("class_id diperlukan");
      if (!args.round_id) throw new Error("round_id diperlukan");
      return computePeerRound(s.accessToken, args.class_id, args.round_id);
    },
  },

  {
    name: "get_peer_results",
    title: "Keputusan penilaian rakan",
    description:
      "Papan pemuka keputusan satu pusingan: markah setiap pelajar (P, F, Fmod, bendera, " +
      "SEMAK, kumpulan berisiko), justifikasi mengikut pelajar yang dinilai, dan senarai " +
      "ahli yang belum menghantar. Nama penilai TIDAK PERNAH dikongsi oleh sistem.",
    roles: STAFF,
    write: false,
    inputSchema: {
      type: "object",
      properties: {
        class_id: { type: "string", description: "UUID kelas" },
        round_id: { type: "string", description: "UUID pusingan" },
      },
      required: ["class_id", "round_id"],
    },
    handler: async (args, s) => {
      if (!args.class_id) throw new Error("class_id diperlukan");
      if (!args.round_id) throw new Error("round_id diperlukan");
      return getPeerResults(s.accessToken, args.class_id, args.round_id);
    },
  },

  {
    name: "delete_peer_round",
    title: "Padam pusingan penilaian rakan",
    description:
      "Padam satu pusingan penilaian rakan. Hanya berjaya jika belum ada penilaian dihantar " +
      "(route memulangkan 409 jika sudah ada). Memerlukan confirm: true.",
    roles: STAFF,
    write: true,
    inputSchema: {
      type: "object",
      properties: {
        class_id: { type: "string", description: "UUID kelas" },
        round_id: { type: "string", description: "UUID pusingan" },
        confirm: { type: "boolean", description: "Wajib true" },
      },
      required: ["class_id", "round_id"],
    },
    handler: async (args, s) => {
      if (!args.class_id) throw new Error("class_id diperlukan");
      if (!args.round_id) throw new Error("round_id diperlukan");
      return deletePeerRound(s.accessToken, args.class_id, args.round_id, args.confirm);
    },
  },

  {
    name: "invite_educator",
    title: "Jemput pendidik ke kelas",
    description:
      "Cipta jemputan pendidik (co-educator) untuk satu kelas melalui emel. Pemilik kelas " +
      "sahaja; semakan dijalankan oleh route. send_email: true menghantar emel jemputan " +
      "melalui route notify selepas jemputan dicipta (lalai false). Kod jemputan dan pautan " +
      "dipulangkan supaya boleh dikongsi secara manual. Senarai, hantar semula atau batal " +
      "jemputan tiada laluannya, jadi tidak disokong.",
    roles: STAFF,
    write: true,
    inputSchema: {
      type: "object",
      properties: {
        class_id: { type: "string", description: "UUID kelas" },
        email: { type: "string", description: "Emel pendidik yang dijemput" },
        send_email: { type: "boolean", description: "Hantar emel jemputan, lalai false" },
      },
      required: ["class_id", "email"],
    },
    handler: async (args, s) => {
      return inviteEducator(s.accessToken, args);
    },
  },
];

/** Tools yang kelihatan kepada peranan tertentu, dengan skop diambil kira. */
export function toolsForSession(session: McpSession): ToolDef[] {
  const writeOk = canWrite(session);
  return TOOLS.filter((t) => t.roles.includes(session.role) && (!t.write || writeOk));
}

export function findTool(name: string): ToolDef | undefined {
  return TOOLS.find((t) => t.name === name);
}
