// lib/mcp/invite-tools.ts
//
// Bantuan tulen untuk alat MCP jemputan pendidik. Mengikut corak
// lib/mcp/live-quiz-tools.ts dan team-tools.ts: fail ini sengaja TIDAK
// mengimport session.ts atau db.ts supaya scripts/selftest-mcp-penilaian.ts
// boleh mengujinya dengan fetch tiruan tanpa pangkalan data.
//
// Satu laluan API sahaja yang ada untuk jemputan pendidik:
//   POST /api/classes/[id]/invite  (badan {email}, balas {ok, token, link, sent})
// Laluan untuk senarai, hantar semula atau batal jemputan TIDAK WUJUD di
// aplikasi (hanya RPC qm_list_class_educator_invites dan
// qm_revoke_class_educator_invite yang dipanggil pelayar terus), jadi alat
// itu dilangkau mengikut tiket dan tidak direka di sini.
//
// Emel pengingat (/api/educator-invites/notify) memerlukan kod jemputan
// (code) daripada penciptaan jemputan, jadi ia boleh dipanggil selepas
// invite jika pemanggil mahu: alat ini menerima send_email: true untuk
// meneruskannya dalam satu langkah, masih melalui route sedia ada.

import { callApi } from "./api";

/** Corak emel ringkas, selari semakan route invite (/^[^@]+@[^@]+$/). */
const EMAIL_RE = /^[^@]+@[^@]+$/;

export interface InviteEducatorInput {
  class_id?: unknown;
  email?: unknown;
  send_email?: unknown;
}

/**
 * Sahkan argumen invite_educator SEBELUM panggilan rangkaian. Ralat awal
 * untuk emel yang jelas tidak sah mengelakkan 400 route yang pasti berlaku.
 */
export function checkInviteArgs(
  args: InviteEducatorInput
): { ok: true; classId: string; email: string; sendEmail: boolean } | { ok: false; error: string } {
  const classId = typeof args.class_id === "string" ? args.class_id.trim() : "";
  if (!classId) return { ok: false, error: "class_id diperlukan" };

  const email = typeof args.email === "string" ? args.email.trim() : "";
  if (!email) return { ok: false, error: "email diperlukan" };
  if (!EMAIL_RE.test(email)) return { ok: false, error: "email tidak sah" };

  if (args.send_email !== undefined && typeof args.send_email !== "boolean") {
    return { ok: false, error: "send_email mesti true atau false" };
  }

  return { ok: true, classId, email, sendEmail: args.send_email === true };
}

/**
 * Jemput pendidik ke kelas melalui route sedia ada (semakan pemilik kelas
 * dijalankan oleh route itu sendiri). send_email: true meneruskan penghantaran
 * emel melalui /api/educator-invites/notify, yang memerlukan kod daripada
 * balasan invite; jika emel gagal, jemputan tetap wujud dan ralatnya
 * dilaporkan dalam medan email_error tanpa membatalkan jemputan.
 */
export async function inviteEducator(
  accessToken: string,
  args: InviteEducatorInput
): Promise<Record<string, unknown>> {
  const checked = checkInviteArgs(args);
  if (!checked.ok) throw new Error(checked.error);

  const res = await callApi<{
    ok?: boolean;
    token?: string;
    link?: string;
    sent?: boolean;
  }>(accessToken, `/api/classes/${checked.classId}/invite`, {
    method: "POST",
    body: { email: checked.email },
  });

  const out: Record<string, unknown> = {
    ok: res.ok ?? true,
    class_id: checked.classId,
    email: checked.email,
    token: res.token ?? null,
    link: res.link ?? null,
    invite_email_sent: res.sent === true,
  };

  if (checked.sendEmail && res.token) {
    // Kod jemputan pendidik ialah token daripada route invite (8 aksara),
    // dihantar ke route notify bersama classId dan email.
    try {
      await callApi(accessToken, "/api/educator-invites/notify", {
        method: "POST",
        body: { classId: checked.classId, email: checked.email, code: res.token },
      });
      out.email_sent = true;
    } catch (e: any) {
      out.email_sent = false;
      out.email_error = e?.message ?? "penghantaran emel gagal";
    }
  }

  return out;
}
