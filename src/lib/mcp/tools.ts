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
      return unwrapList(await q, "Senarai kelas");
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
    description: "Tambah kad baharu pada lajur board. Peserta juga boleh menggunakan ini.",
    roles: ALL,
    write: true,
    inputSchema: {
      type: "object",
      properties: {
        board_id: { type: "string" },
        column_id: { type: "string" },
        title: { type: "string" },
        description: { type: "string" },
        card_type: { type: "string", description: "Lalai: text" },
        link_url: { type: "string" },
      },
      required: ["board_id", "title"],
    },
    handler: async (args, s) =>
      unwrapOne(
        await s.db
          .from(TABLES.boardCards)
          .insert({
            board_id: args.board_id,
            column_id: args.column_id ?? null,
            title: args.title,
            description: args.description ?? null,
            card_type: args.card_type ?? "text",
            link_url: args.link_url ?? null,
            created_by: s.userId,
          })
          .select(COLUMNS.boardCardSummary)
          .single(),
        "Cipta kad board"
      ),
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
];

/** Tools yang kelihatan kepada peranan tertentu, dengan skop diambil kira. */
export function toolsForSession(session: McpSession): ToolDef[] {
  const writeOk = canWrite(session);
  return TOOLS.filter((t) => t.roles.includes(session.role) && (!t.write || writeOk));
}

export function findTool(name: string): ToolDef | undefined {
  return TOOLS.find((t) => t.name === name);
}
