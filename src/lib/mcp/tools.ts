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
      "yang boleh diberi terus kepada create_board_card. Keupayaan muat naik pengguna " +
      "dikuatkuasakan oleh aplikasi.",
    roles: ALL,
    write: true,
    inputSchema: {
      type: "object",
      properties: {
        class_id: { type: "string", description: "Berikan class_id atau board_id" },
        board_id: { type: "string" },
        file_name: { type: "string" },
        content_base64: { type: "string", description: "Kandungan fail dikodkan base64" },
        mime_type: { type: "string" },
      },
      required: ["file_name", "content_base64"],
    },
    handler: async (args, s) => {
      if (!args.class_id && !args.board_id) throw new Error("Berikan class_id atau board_id");
      const classId = args.class_id ?? (await classIdForBoard(args.board_id, s));
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
];

/** Tools yang kelihatan kepada peranan tertentu, dengan skop diambil kira. */
export function toolsForSession(session: McpSession): ToolDef[] {
  const writeOk = canWrite(session);
  return TOOLS.filter((t) => t.roles.includes(session.role) && (!t.write || writeOk));
}

export function findTool(name: string): ToolDef | undefined {
  return TOOLS.find((t) => t.name === name);
}
