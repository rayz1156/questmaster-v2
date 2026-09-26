// lib/mcp/team-tools.ts
//
// Bantuan tulen untuk alat MCP kumpulan (teams). Mengikut corak
// lib/mcp/live-quiz-tools.ts: fail ini sengaja TIDAK mengimport session.ts
// atau db.ts supaya scripts/selftest-mcp-kumpulan.ts boleh mengujinya
// dengan mock (fetch global untuk laluan route, pembina tiruan untuk
// laluan RLS) tanpa pangkalan data.
//
// Dua laluan yang berbeza:
//   1. import_teams_csv: laluan API sudah ada, jadi SEMUA panggilan pergi
//      melalui callApi dan route itu yang menyemak kebenaran.
//   2. list_teams dan set_team_leader: tiada laluan API, jadi tulisan dan
//      bacaan menggunakan klien terikat RLS yang dihantar masuk sebagai
//      parameter. JANGAN sekali-kali menggantikannya dengan service_role.

import { callApi, ApiError } from "./api";
import { TEAMS_CSV_MAX_BYTES } from "@/lib/team-import";

export type TeamImportMode = "preview" | "commit";

/** Nombor baris maksimum selari route import (TEAMS_CSV_MAX_ROWS). */
export const TEAMS_MAX_ROWS_PER_CALL = 500;

/** Sahkan argumen import_teams_csv sebelum apa-apa dihuraikan. */
export function parseImportTeamsArgs(
  args: any
): { ok: true; mode: TeamImportMode; content: string; replace: boolean }
| { ok: false; error: string } {
  const mode = args?.mode === "commit" ? "commit" : "preview";
  if (args?.mode !== undefined && args.mode !== "preview" && args.mode !== "commit") {
    return { ok: false, error: "mode mesti preview atau commit" };
  }
  if (typeof args?.content !== "string" || !args.content.trim()) {
    return { ok: false, error: "content (teks CSV) diperlukan" };
  }
  if (args.content.length > TEAMS_CSV_MAX_BYTES) {
    return { ok: false, error: "content terlalu besar, had kira-kira 500 KB" };
  }
  if (args?.replace !== undefined && typeof args.replace !== "boolean") {
    return { ok: false, error: "replace mesti true atau false" };
  }
  return { ok: true, mode, content: args.content, replace: args.replace === true };
}

/** Bina laluan import. Pratonton guna ?dryRun=1 seperti UI pendidik. */
export function teamsImportPath(classId: string, mode: TeamImportMode): string {
  const base = `/api/classes/${classId}/teams/import-csv`;
  return mode === "preview" ? `${base}?dryRun=1` : base;
}

/** Susun ralat baris daripada badan 400 route kepada satu mesej boleh baca. */
export function formatRowErrors(errors: unknown): string | null {
  if (!Array.isArray(errors) || errors.length === 0) return null;
  const lines = errors
    .slice(0, 20)
    .map((e: any) => {
      const no = Number(e?.row) > 0 ? `baris ${e.row}: ` : "";
      return `${no}${String(e?.message ?? "")}`.trim();
    })
    .filter(Boolean);
  if (lines.length < errors.length) lines.push(`(+${errors.length - lines.length} ralat lain)`);
  return lines.join("; ");
}

/**
 * Import kumpulan melalui route sedia ada supaya logik sisipan (RPC
 * qm_import_class_teams, semua-atau-tiada) kekal satu tempat.
 * preview: ?dryRun=1, tiada tulisan. commit: tanpa dryRun.
 */
export async function importTeamsCsv(
  accessToken: string,
  classId: string,
  args: any
): Promise<Record<string, unknown>> {
  if (!classId) throw new Error("class_id diperlukan");
  const parsed = parseImportTeamsArgs(args);
  if (!parsed.ok) throw new Error(parsed.error);

  try {
    const res = await callApi<Record<string, unknown>>(accessToken, teamsImportPath(classId, parsed.mode), {
      method: "POST",
      body: { content: parsed.content, replace: parsed.replace },
    });
    return { mode: parsed.mode, ...(res ?? {}) } as Record<string, unknown>;
  } catch (e: any) {
    // Route memulangkan 400 dengan {errors:[{row,message}]} apabila
    // pengesahan baris gagal. ApiError hanya membawa ringkasan, jadi
    // butiran baris dibaca semula daripada payload yang dilampirkan.
    if (e instanceof ApiError && e.payload) {
      const detail = formatRowErrors((e.payload as any).errors);
      if (detail) throw new Error(`${e.message} (${detail})`);
    }
    throw e;
  }
}

export interface TeamMemberRow {
  team_id: string;
  user_id: string;
  role: string;
  joined_at?: string | null;
}

/**
 * Kumpulkan ahli mengikut kumpulan dan kenal pasti ketua. Tulen, jadi
 * selftest boleh mengujinya tanpa pangkalan data.
 */
export function groupTeamsWithMembers(
  teams: Array<{ id: string; name?: string | null }>,
  members: TeamMemberRow[]
): Record<string, { members: TeamMemberRow[]; leader_user_id: string | null }> {
  const out: Record<string, { members: TeamMemberRow[]; leader_user_id: string | null }> = {};
  for (const t of teams) out[t.id] = { members: [], leader_user_id: null };
  for (const m of members) {
    const g = out[m.team_id];
    if (!g) continue;
    g.members.push(m);
    if (m.role === "leader") g.leader_user_id = m.user_id;
  }
  return out;
}

export interface LeaderArgs {
  team_id?: unknown;
  user_id?: unknown;
}

/** Sahkan argumen set_team_leader sebelum menyentuh pangkalan data. */
export function checkLeaderArgs(args: LeaderArgs): { teamId: string; userId: string } {
  const teamId = typeof args.team_id === "string" ? args.team_id.trim() : "";
  const userId = typeof args.user_id === "string" ? args.user_id.trim() : "";
  if (!teamId) throw new Error("team_id diperlukan");
  if (!userId) throw new Error("user_id diperlukan");
  return { teamId, userId };
}

/**
 * Antara muka minimum klien terikat RLS yang diperlukan setTeamLeader.
 * SupabaseClient memenuhinya; selftest membekalkan tiruan.
 */
export interface RlsLikeClient {
  from(table: string): any;
}

/**
 * Tetapkan ketua kumpulan dengan cara yang sama seperti corak data dalam
 * aplikasi: lajur qm_team_members.role ('leader' atau 'member') yang
 * ditambah oleh migrasi 0032, dengan indeks unik separa qm_team_one_leader
 * yang memastikan satu ketua sahaja setiap kumpulan.
 *
 * Urutan penting: turunkan ketua lama DAHULU, kemudian naikkan ahli
 * sasaran. Jika sasaran dinaikkan dahulu, indeks unik menolak dengan
 * ralat kunci mentah kerana dua ketua sekejap.
 *
 * Semakan kebenaran (pendidik kelas / admin) dikuatkuasakan oleh RLS pada
 * klien yang dihantar masuk; alat ini tidak memeriksa apa-apa sendiri.
 * Kemas kini yang RLS tolak tidak membuang ralat, ia cuma melangkau baris,
 * jadi setiap langkah disemak bilangan barisnya dan gagal dengan jelas.
 */
export async function setTeamLeader(
  db: RlsLikeClient,
  teamId: string,
  userId: string
): Promise<{ team_id: string; leader_user_id: string; demoted: boolean }> {
  // 1. Kumpulan mesti kelihatan melalui RLS; kalau tidak, tiada akses.
  const teamRes = await db.from("qm_teams").select("id, class_id, hunt_id").eq("id", teamId).maybeSingle();
  if (teamRes?.error) throw new Error(`Dapatkan kumpulan gagal: ${teamRes.error.message}`);
  const team = teamRes?.data ?? null;
  if (!team) throw new Error("Kumpulan tidak dijumpai atau anda tiada akses kepadanya");

  // 2. Ahli sasaran mesti sudah wujud. Alat ini TIDAK menyisip baris ahli
  //    baharu; gunakan import_teams_csv untuk menambah ahli.
  const memberRes = await db
    .from("qm_team_members")
    .select("team_id, user_id, role")
    .eq("team_id", teamId)
    .eq("user_id", userId)
    .maybeSingle();
  if (memberRes?.error) throw new Error(`Dapatkan ahli gagal: ${memberRes.error.message}`);
  const member = memberRes?.data ?? null;
  if (!member) throw new Error("Pengguna itu bukan ahli kumpulan ini");

  if (member.role === "leader") {
    return { team_id: teamId, leader_user_id: userId, demoted: false };
  }

  // 3. Turunkan ketua sedia ada (jika ada dan bukan sasaran).
  const demoteRes = await db
    .from("qm_team_members")
    .update({ role: "member" })
    .eq("team_id", teamId)
    .eq("role", "leader")
    .neq("user_id", userId);
  if (demoteRes?.error) throw new Error(`Turunkan ketua lama gagal: ${demoteRes.error.message}`);

  // 4. Naikkan sasaran. .select() diperlukan supaya baris yang dilangkau
  //    oleh RLS kelihatan sebagai sifar, bukan kejayaan senyap.
  const promoteRes = await db
    .from("qm_team_members")
    .update({ role: "leader" })
    .eq("team_id", teamId)
    .eq("user_id", userId)
    .select("user_id");
  if (promoteRes?.error) throw new Error(`Naikkan ketua gagal: ${promoteRes.error.message}`);
  const promoted = Array.isArray(promoteRes?.data) ? promoteRes.data.length : 0;
  if (promoted !== 1) {
    throw new Error(
      "Kemas kini ketua tidak berlaku (RLS menolak atau ahli sudah tiada). " +
        "Hanya pendidik kelas atau admin boleh menetapkan ketua."
    );
  }

  return { team_id: teamId, leader_user_id: userId, demoted: true };
}
