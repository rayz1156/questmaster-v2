// lib/mcp/schema.ts
//
// DISAHKAN terhadap pangkalan data langsung pada 16 Ogos 2026.
// Bukan lagi tekaan: nama di bawah datang daripada information_schema pada VPS.
//
// Model domain sebenar Kuizen:
//
//   qm_classes           kelas.  Perhatikan: tajuk ialah `name`, bukan `title`.
//   qm_class_educators   educator dalam kelas. Kunci: (class_id, educator_id).
//                        TIADA lajur `id`.
//   qm_class_members     peserta dalam kelas. Kunci: (class_id, user_id).
//                        TIADA lajur `id`.
//   qm_hunts             "quest" peringkat atas, dimiliki oleh kelas.
//   qm_challenges        soalan individu dalam hunt. MENGANDUNGI `answer`.
//   qm_submissions       jawapan peserta, dipautkan kepada challenge_id.
//                        Tiada lajur `score`; masa ialah `created_at`.
//   qm_learning_boards   board bergaya Padlet, dimiliki oleh kelas.
//   qm_learning_columns  lajur dalam board.
//   qm_learning_cards    kad dalam lajur.
//
// Untuk mengesahkan semula selepas perubahan skema:
//   docker exec -i supabase-db psql -U supabase_admin -d postgres -c \
//     "select table_name, column_name from information_schema.columns
//        where table_schema='public' and table_name like 'qm_%'
//        order by table_name, ordinal_position;"

export const TABLES = {
  /**
   * Sumber kebenaran untuk peranan. `id` = auth.users.id.
   * role ialah salah satu daripada: participant | educator | admin | superadmin.
   * Turut mengandungi bendera `suspended` dan `approved`.
   */
  profiles: "qm_profiles",

  classes: "qm_classes",
  hunts: "qm_hunts",
  challenges: "qm_challenges",
  submissions: "qm_submissions",
  boards: "qm_learning_boards",
  boardColumns: "qm_learning_columns",
  boardCards: "qm_learning_cards",
  educators: "qm_class_educators",
  members: "qm_class_members",

  /** Lajur dalam qm_class_educators yang menyimpan auth.users.id */
  educatorUserIdColumn: "educator_id",
  /** Lajur dalam qm_class_members yang menyimpan auth.users.id */
  memberUserIdColumn: "user_id",
} as const;

export const COLUMNS = {
  classSummary: "id, name, description, join_code, is_archived, scoring_mode, created_at, ended_at",
  huntSummary: "id, class_id, title, description, status, points, start_at, end_at, created_at",

  /**
   * PENTING: `answer` SENGAJA dikecualikan.
   *
   * RLS ialah keselamatan peringkat baris, bukan peringkat lajur. Jika polisi
   * membenarkan peserta membaca baris challenge (dan ia mesti membenarkan,
   * supaya mereka boleh melihat soalan), maka `select("*")` akan menghantar
   * kunci jawapan terus kepada mereka melalui Claude.
   *
   * Peserta mendapat challengeSafe. Hanya staf mendapat challengeFull.
   */
  challengeSafe: "id, hunt_id, title, prompt, points, order_idx",
  challengeFull: "id, hunt_id, title, prompt, answer, points, order_idx",

  submissionSummary: "id, challenge_id, team_id, user_id, status, reviewed_by, created_at",
  boardSummary: "id, class_id, title, description, is_published, created_at",
  boardColumnSummary: "id, board_id, title, position",
  boardCardSummary:
    "id, board_id, column_id, position, card_type, title, description, link_url, image_url, created_by, created_at",
} as const;

/**
 * Lajur yang tidak boleh dipulangkan kepada sesiapa melalui MCP, walaupun
 * kepada staf. Digunakan sebagai jaring keselamatan dalam `fetch`, yang
 * mengambil rekod sewenang-wenangnya.
 */
export const REDACTED_COLUMNS = new Set(["answer"]);

/** Had lalai dan maksimum untuk sebarang senarai, supaya konteks tidak dibanjiri. */
export const LIMITS = { default: 25, max: 100 } as const;
