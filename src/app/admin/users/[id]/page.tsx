"use client";

// Butiran pengguna ruang kerja admin (V2-011b). Semua tindakan satu
// pengguna yang dahulu berada dalam kad halaman Users dipindahkan ke
// sini: peranan, pelan, had kelas, kebenaran muat naik, gantung dengan
// alasan, lulus, buang, hantar semula pengesahan dan sahkan emel.
//
// Gantung memanggil RPC qm_admin_set_suspended: audit dengan alasan
// ditulis oleh fungsi itu sendiri di pelayan. Buang meminta pentadbir
// menaip nama paparan pengguna dengan tepat sebelum butang hidup.
// Suspend dan Delete disembunyikan untuk akaun sendiri dan superadmin.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { KeyRound, MailCheck, Mail, UserCheck, ScrollText, Ban, RotateCcw, Trash2, Save } from "lucide-react";
import AdminShell from "@/components/admin/AdminShell";
import { Card, Pill, Tabs, EmptyState, ReasonDialog, relTime, initials } from "@/components/admin/ui";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { supabase } from "@/lib/supabaseClient";
import { getSession } from "@/lib/session";
import { mesejHad } from "@/lib/pelan";
import {
  adminListProfiles,
  adminListUsersMeta,
  adminUpdateProfile,
  adminSetClassLimits,
  adminSetSuspended,
  adminListEducatorClasses,
  adminListParticipantClasses,
  adminDeleteUser,
  adminAuditForUser,
  logAudit,
  type Profile,
  type UserMeta,
  type AuditLogRow,
} from "@/lib/data";
import { labelTindakan, bezaAudit, alasanAudit } from "@/lib/adminAudit";
import {
  pelanProfil,
  PELAN_ADMIN,
  LABEL_PELAN,
  pendingPendidik,
  emelBelumSah,
  type PelanAdmin,
} from "@/lib/adminUsers";

type MukaTab = "profile" | "classes" | "activity";

/**
 * Baris kelas mentah daripada adminListParticipantClasses /
 * adminListEducatorClasses. Medan pilihan kerana dua sumber berbeza;
 * panggilan balas map tidak lagi memerlukan any.
 */
type KelasMentah = {
  id: string;
  name: string;
  color?: string | null;
  is_archived?: boolean | null;
  ended_at?: string | null;
  created_at?: string | null;
  joined_at?: string | null;
};

function fmt(d: string | null | undefined) {
  if (!d) return "Never";
  try {
    return new Date(d).toLocaleString();
  } catch {
    return String(d);
  }
}

function labelPeranan(role: string) {
  if (role === "superadmin") return "Owner";
  if (role === "admin") return "Admin";
  if (role === "educator") return "Educator";
  return "Participant";
}

/** Baris medan dalam kad butiran: label kiri, kandungan kanan. */
function Baris({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 border-b border-hairline last:border-b-0">
      <span className="text-sm text-ink-muted shrink-0">{label}</span>
      <span className="text-sm text-ink text-right min-w-0 flex items-center gap-2 justify-end flex-wrap">{children}</span>
    </div>
  );
}

/** Butang tindakan menegak dalam kad "Account actions". */
function ButangTindakan({
  onClick,
  ikon,
  label,
  bahaya = false,
}: {
  onClick: () => void;
  ikon: React.ReactNode;
  label: string;
  bahaya?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        bahaya
          ? "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-red-200 text-sm font-medium text-red-600 hover:bg-red-50 transition"
          : "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-hairline text-sm font-medium text-ink hover:bg-[#F7F7F9] transition"
      }
    >
      <span className="text-ink-faint">{ikon}</span>
      <span className="text-left">{label}</span>
    </button>
  );
}

export default function Page({ params }: { params: { id: string } }) {
  const router = useRouter();
  const confirm = useConfirm();
  const { id } = params;

  const [users, setUsers] = useState<Profile[]>([]);
  const [meta, setMeta] = useState<Record<string, UserMeta>>({});
  const [muat, setMuat] = useState(true);
  const [tab, setTab] = useState<MukaTab>("profile");
  const [mesej, setMesej] = useState<{ baik: boolean; teks: string } | null>(null);
  const [idSaya, setIdSaya] = useState<string | null>(null);
  const [dialogGantung, setDialogGantung] = useState<null | "suspend" | "restore">(null);
  const [pengesahanHapus, setPengesahanHapus] = useState("");
  const [hadDraf, setHadDraf] = useState<{ owned: string; coed: string } | null>(null);
  const [kelas, setKelas] = useState<
    { id: string; nama: string; peranan: string; status: string; tarikh: string }[] | null
  >(null);
  const [audit, setAudit] = useState<AuditLogRow[] | null>(null);

  const reload = async () => {
    try {
      const [p, m] = await Promise.all([adminListProfiles(), adminListUsersMeta()]);
      setUsers(p);
      setMeta(m);
    } finally {
      setMuat(false);
    }
  };

  useEffect(() => {
    reload();
    // getSession() sinkron: pulang pengguna cache serta-merta.
    const s = getSession();
    setIdSaya(s?.id ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Kelas dan audit dimuat malas mengikut tab.
  useEffect(() => {
    if (tab === "classes" && kelas === null) {
      const u = users.find((x) => x.id === id);
      if (!u) return;
      (async () => {
        try {
          if (u.role === "participant") {
            const baris = await adminListParticipantClasses(id);
            setKelas(
              (baris || []).map((c: KelasMentah) => ({
                id: c.id,
                nama: c.name,
                peranan: "Participant",
                status: c.is_archived ? "Archived" : c.ended_at ? "Ended" : "Active",
                // Normalisasi rentetan kosong: fmt() memaparkan "Never".
                tarikh: c.joined_at || "",
              })),
            );
          } else {
            const { owned, coEducator } = await adminListEducatorClasses(id);
            setKelas([
              ...(owned || []).map((c: KelasMentah) => ({
                id: c.id,
                nama: c.name,
                peranan: "Owner",
                status: c.is_archived ? "Archived" : c.ended_at ? "Ended" : "Active",
                tarikh: c.created_at || "",
              })),
              ...(coEducator || []).map((c: KelasMentah) => ({
                id: c.id,
                nama: c.name,
                peranan: "Co-educator",
                status: c.is_archived ? "Archived" : c.ended_at ? "Ended" : "Active",
                tarikh: c.created_at || "",
              })),
            ]);
          }
        } catch {
          setKelas([]);
        }
      })();
    }
    if (tab === "activity" && audit === null) {
      adminAuditForUser(id)
        .then(setAudit)
        .catch(() => setAudit([]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, users, id]);

  const u = users.find((x) => x.id === id) || null;
  const m = meta[id];
  const namaPaparan = u?.display_name?.trim() || "Unnamed user";
  const emel = m?.email || null;
  const belumSah = !!u && emelBelumSah(id, meta);
  const menungguLulus = !!u && pendingPendidik(u);
  const diriSendiri = idSaya === id;
  const superAdminSasaran = u?.role === "superadmin";
  const bolehBahaya = !diriSendiri && !superAdminSasaran;
  const namaProfil = (uid: string | null | undefined) => {
    if (!uid) return "Unnamed user";
    const p = users.find((x) => x.id === uid);
    return p?.display_name || "Unnamed user";
  };

  /** Ralat 42501 dari RPC 0047: sasaran dilindungi. */
  const ralatDilindungi = (e: unknown) =>
    (typeof e === "object" && e !== null && (e as { code?: string }).code === "42501") ||
    /forbidden|cannot_target_self/.test(String((e as { message?: string })?.message || ""));

  const tukarPeranan = async (perananBaru: "participant" | "educator" | "admin") => {
    if (!u || perananBaru === u.role) return;
    const ok = await confirm({
      title: `Change role from ${labelPeranan(u.role)} to ${labelPeranan(perananBaru)}?`,
      tone: "default",
    });
    if (!ok) return;
    try {
      await adminUpdateProfile(id, { role: perananBaru });
      await logAudit("role_change", "profile", id, { before: { role: u.role }, after: { role: perananBaru } });
      setMesej({ baik: true, teks: "Role updated." });
      reload();
    } catch (e) {
      setMesej({ baik: false, teks: mesejHad(e, "Failed to change role.") });
      reload();
    }
  };

  /**
   * Tukar pelan melalui qm_set_plan. Menurunkan pelan unlimited sentiasa
   * minta pengesahan dahulu: satu klik tersilap memotong semua had.
   */
  const tukarPelan = async (pelanBaru: PelanAdmin) => {
    if (!u) return;
    const semasa = pelanProfil(u);
    if (pelanBaru === semasa) return;
    if (semasa === "unlimited") {
      const ok = await confirm({
        title: `Downgrade "${namaPaparan}" from Unlimited to ${LABEL_PELAN[pelanBaru]}? All limits will be re-applied immediately.`,
        tone: "danger",
      });
      if (!ok) {
        reload();
        return;
      }
    }
    try {
      const { error } = await supabase.rpc("qm_set_plan", { p_user: id, p_plan: pelanBaru });
      if (error) throw error;
      await logAudit("set_plan", "profile", id, { before: { plan: semasa }, after: { plan: pelanBaru } });
      setMesej({ baik: true, teks: "Plan updated." });
      reload();
    } catch (e) {
      setMesej({ baik: false, teks: mesejHad(e, "Failed to change plan.") });
      reload();
    }
  };

  const simpanHad = async () => {
    if (!u || !hadDraf) return;
    const parse = (v: string) => (v.trim() === "" ? null : Math.max(0, parseInt(v, 10) || 0));
    const owned = parse(hadDraf.owned);
    const coed = parse(hadDraf.coed);
    try {
      await adminSetClassLimits(id, owned, coed);
      await logAudit("set_class_limits", "profile", id, {
        before: { max_classes_owned: u.max_classes_owned, max_classes_as_coeducator: u.max_classes_as_coeducator },
        after: { max_classes_owned: owned, max_classes_as_coeducator: coed },
      });
      setHadDraf(null);
      setMesej({ baik: true, teks: "Class limits updated." });
      reload();
    } catch (e) {
      setMesej({ baik: false, teks: mesejHad(e, "Failed to save limits.") });
    }
  };

  const toggleKebenaran = async (kunci: "can_upload_files" | "can_upload_videos") => {
    if (!u) return;
    const baharu = !u[kunci];
    try {
      await adminUpdateProfile(id, { [kunci]: baharu } as Partial<Profile>);
      await logAudit(baharu ? "enable_capability" : "disable_capability", "profile", id, { capability: kunci });
      reload();
    } catch (e) {
      setMesej({ baik: false, teks: mesejHad(e, "Failed to update permissions.") });
      reload();
    }
  };

  const hantarReset = async () => {
    if (!emel) {
      setMesej({ baik: false, teks: "No email on file for this user." });
      return;
    }
    const ok = await confirm({ title: `Send a password reset email to ${emel}?`, tone: "default" });
    if (!ok) return;
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(emel, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      await logAudit("password_reset_sent", "profile", id, {});
      setMesej({ baik: true, teks: `Password reset email sent to ${emel}.` });
    } catch (e) {
      setMesej({ baik: false, teks: mesejHad(e, "Failed to send reset email.") });
    }
  };

  /** Sahkan emel tunggal melalui route sedia ada (audit ditulis route itu). */
  const sahkanEmel = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/admin/users/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` },
        body: JSON.stringify({ userIds: [id], alsoApprove: false }),
      });
      const out = (await res.json().catch(() => ({}))) as { ok?: number; total?: number; error?: string };
      if (!res.ok) throw new Error(out.error || `HTTP ${res.status}`);
      setMesej({ baik: true, teks: `Verified ${out.ok ?? 0}/${out.total ?? 1}.` });
      reload();
    } catch (e) {
      setMesej({ baik: false, teks: e instanceof Error ? e.message : String(e) });
    }
  };

  const hantarSemula = async () => {
    if (!emel) {
      setMesej({ baik: false, teks: "No email on file for this user." });
      return;
    }
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: emel,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) throw error;
      setMesej({ baik: true, teks: `Verification email resent to ${emel}.` });
    } catch (e) {
      setMesej({ baik: false, teks: mesejHad(e, "Resend failed.") });
    }
  };

  const luluskan = async () => {
    const ok = await confirm({ title: `Approve "${namaPaparan}" as an educator?`, tone: "default" });
    if (!ok) return;
    try {
      await adminUpdateProfile(id, { approved: true });
      await logAudit("approve", "profile", id);
      setMesej({ baik: true, teks: "Educator approved." });
      reload();
    } catch (e) {
      setMesej({ baik: false, teks: mesejHad(e, "Failed to approve.") });
      reload();
    }
  };

  /** Gantung/pulihkan: RPC menulis audit dengan alasan sendiri. */
  const sahkanGantung = async (alasan: string) => {
    const mod = dialogGantung;
    setDialogGantung(null);
    if (!mod) return;
    try {
      await adminSetSuspended(id, mod === "suspend", alasan);
      setMesej({ baik: true, teks: mod === "suspend" ? "Account suspended." : "Account restored." });
      reload();
    } catch (e) {
      if (ralatDilindungi(e)) {
        setMesej({ baik: false, teks: "You can't change this account." });
      } else {
        setMesej({ baik: false, teks: mesejHad(e, "Failed to update the account.") });
      }
      reload();
    }
  };

  const hapus = async () => {
    const ok = await confirm({
      title: `Permanently delete "${namaPaparan}"? This cannot be undone.`,
      tone: "danger",
    });
    if (!ok) return;
    try {
      await adminDeleteUser(id);
      await logAudit("delete_user", "profile", id);
      router.push("/admin/users");
    } catch (e) {
      setMesej({ baik: false, teks: mesejHad(e, "Delete failed.") });
    }
  };

  if (muat) {
    return (
      <AdminShell crumbs={[{ label: "Users", href: "/admin/users" }, { label: "Loading..." }]}>
        <div className="text-sm text-ink-faint py-8">Loading...</div>
      </AdminShell>
    );
  }

  if (!u) {
    return (
      <AdminShell crumbs={[{ label: "Users", href: "/admin/users" }, { label: "Not found" }]} title="User not found">
        <Card>
          <EmptyState title="User not found." body="This account may have been deleted." />
          <div className="px-4 pb-4">
            <Link href="/admin/users" className="text-sm font-medium text-brand-purple hover:opacity-80">
              Back to Users
            </Link>
          </div>
        </Card>
      </AdminShell>
    );
  }

  const drafHad = hadDraf || {
    owned: String(u.max_classes_owned ?? ""),
    coed: String(u.max_classes_as_coeducator ?? ""),
  };
  const adaPelan = u.role === "educator" || u.role === "admin" || u.role === "superadmin";
  const bolehHad = u.role === "educator" || u.role === "admin";

  return (
    <AdminShell crumbs={[{ label: "Users", href: "/admin/users" }, { label: namaPaparan }]}>
      {/* Kepala */}
      <div className="flex items-center gap-4 mb-6">
        <span className="w-16 h-16 rounded-full bg-[#EAE6FC] text-brand-purple text-xl font-semibold flex items-center justify-center shrink-0">
          {initials(u.display_name)}
        </span>
        <div className="min-w-0">
          <div className="text-xl font-semibold text-ink truncate">{namaPaparan}</div>
          <div className="text-sm text-ink-faint truncate">{emel || "No email"}</div>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <Pill tone="violet">{labelPeranan(u.role)}</Pill>
            {u.suspended ? (
              <Pill tone="red">Suspended</Pill>
            ) : !u.approved ? (
              <Pill tone="yellow">Pending</Pill>
            ) : (
              <Pill tone="green">Active</Pill>
            )}
          </div>
        </div>
      </div>

      <Tabs
        items={[
          { key: "profile", label: "Profile" },
          { key: "classes", label: "Classes" },
          { key: "activity", label: "Activity history" },
        ]}
        value={tab}
        onChange={(k) => setTab(k as MukaTab)}
      />

      {mesej && (
        <div
          className={`mt-4 text-sm rounded-lg px-3 py-2 inline-block ${
            mesej.baik
              ? "bg-green-50 text-green-700 border border-green-200"
              : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          {mesej.teks}
        </div>
      )}

      {/* ===== Tab Profile ===== */}
      {tab === "profile" && (
        <>
          <div className="grid lg:grid-cols-3 gap-4 mt-4">
            <Card className="lg:col-span-2 p-4">
              <div className="text-sm font-semibold text-ink mb-2">Account details</div>
              <Baris label="Name">{u.display_name || "Unnamed user"}</Baris>
              <Baris label="Username">{u.username || "-"}</Baris>
              <Baris label="Email">{emel || "No email"}</Baris>
              <Baris label="Email status">
                {!emel ? (
                  <Pill>No email</Pill>
                ) : m?.email_confirmed_at ? (
                  <Pill tone="green">Verified</Pill>
                ) : (
                  <Pill tone="yellow">Unverified</Pill>
                )}
              </Baris>
              <Baris label="Role">
                {u.role === "superadmin" ? (
                  <Pill tone="violet">Owner</Pill>
                ) : (
                  <select
                    value={u.role}
                    onChange={(e) => tukarPeranan(e.target.value as "participant" | "educator" | "admin")}
                    className="h-9 rounded-xl bg-white border border-hairline px-3 text-sm text-ink"
                    aria-label="Role"
                  >
                    <option value="participant">Participant</option>
                    <option value="educator">Educator</option>
                    <option value="admin">Admin</option>
                  </select>
                )}
              </Baris>
              <Baris label="Registered">{fmt(m?.created_at || u.created_at)}</Baris>
              <Baris label="Last sign in">{fmt(m?.last_sign_in_at)}</Baris>
              {adaPelan && (
                <Baris label="Plan">
                  <select
                    value={pelanProfil(u)}
                    onChange={(e) => tukarPelan(e.target.value as PelanAdmin)}
                    className="h-9 rounded-xl bg-white border border-hairline px-3 text-sm text-ink"
                    aria-label="Plan"
                  >
                    {PELAN_ADMIN.map((p) => (
                      <option key={p} value={p}>
                        {LABEL_PELAN[p]}
                      </option>
                    ))}
                  </select>
                </Baris>
              )}
              {adaPelan && <Baris label="Plan expires">{u.plan_expires_at ? fmt(u.plan_expires_at) : "-"}</Baris>}
              {bolehHad && (
                <div className="py-3 border-t border-hairline mt-2">
                  <div className="text-sm font-medium text-ink mb-2">Class limits</div>
                  <div className="flex items-end gap-3 flex-wrap">
                    <label className="flex flex-col text-xs text-ink-muted">
                      Max classes (own)
                      <input
                        type="number"
                        min={0}
                        className="mt-1 w-28 h-9 rounded-xl bg-white border border-hairline px-3 text-sm text-ink"
                        value={drafHad.owned}
                        onChange={(e) => setHadDraf({ owned: e.target.value, coed: drafHad.coed })}
                      />
                    </label>
                    <label className="flex flex-col text-xs text-ink-muted">
                      Max as co-educator
                      <input
                        type="number"
                        min={0}
                        className="mt-1 w-28 h-9 rounded-xl bg-white border border-hairline px-3 text-sm text-ink"
                        value={drafHad.coed}
                        onChange={(e) => setHadDraf({ owned: drafHad.owned, coed: e.target.value })}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={simpanHad}
                      className="inline-flex items-center gap-1.5 bg-brand-purple text-white rounded-xl px-4 py-2 text-sm font-medium hover:opacity-90"
                    >
                      <Save className="w-4 h-4" /> Save
                    </button>
                  </div>
                  <p className="text-xs text-ink-faint mt-2">Empty means the plan default applies.</p>
                </div>
              )}
              {adaPelan && (
                <div className="py-3 border-t border-hairline mt-2">
                  <div className="text-sm font-medium text-ink mb-2">Upload permissions</div>
                  <div className="flex items-center gap-4 flex-wrap text-sm">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        className="accent-brand-purple w-4 h-4"
                        checked={!!u.can_upload_files}
                        onChange={() => toggleKebenaran("can_upload_files")}
                      />
                      Files (FileLu)
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        className="accent-brand-purple w-4 h-4"
                        checked={!!u.can_upload_videos}
                        onChange={() => toggleKebenaran("can_upload_videos")}
                      />
                      Videos (Bunny Stream)
                    </label>
                    {(u.role === "admin" || u.role === "superadmin") && (
                      <span className="text-xs text-ink-faint">Admins always allowed</span>
                    )}
                  </div>
                </div>
              )}
            </Card>

            <Card className="p-4">
              <div className="text-sm font-semibold text-ink mb-3">Account actions</div>
              <div className="space-y-2">
                <ButangTindakan onClick={hantarReset} ikon={<KeyRound className="w-4 h-4" />} label="Send password reset" />
                {belumSah && (
                  <ButangTindakan onClick={sahkanEmel} ikon={<MailCheck className="w-4 h-4" />} label="Verify email" />
                )}
                {belumSah && (
                  <ButangTindakan onClick={hantarSemula} ikon={<Mail className="w-4 h-4" />} label="Resend verification" />
                )}
                {menungguLulus && (
                  <ButangTindakan onClick={luluskan} ikon={<UserCheck className="w-4 h-4" />} label="Approve educator" />
                )}
                <ButangTindakan
                  onClick={() => setTab("activity")}
                  ikon={<ScrollText className="w-4 h-4" />}
                  label="View audit history"
                />
                {bolehBahaya &&
                  (u.suspended ? (
                    <ButangTindakan
                      onClick={() => setDialogGantung("restore")}
                      ikon={<RotateCcw className="w-4 h-4" />}
                      label="Restore account"
                    />
                  ) : (
                    <ButangTindakan
                      bahaya
                      onClick={() => setDialogGantung("suspend")}
                      ikon={<Ban className="w-4 h-4" />}
                      label="Suspend account"
                    />
                  ))}
              </div>
              <p className="text-xs text-ink-faint mt-4">Account changes are recorded in Audit.</p>
            </Card>
          </div>

          {/* Zon bahaya */}
          {bolehBahaya && (
            <Card className="mt-4 p-4 border-red-200">
              <div className="text-sm font-semibold text-red-600 mb-1">Danger zone</div>
              <p className="text-sm text-ink-muted mb-3">
                Deleting this user removes their account permanently. Type the display name exactly to enable the button.
              </p>
              <div className="flex items-center gap-3 flex-wrap">
                <input
                  className="h-10 rounded-xl bg-white border border-hairline px-3 text-sm text-ink w-64"
                  placeholder={namaPaparan}
                  value={pengesahanHapus}
                  onChange={(e) => setPengesahanHapus(e.target.value)}
                  aria-label="Type the display name to confirm deletion"
                />
                <button
                  type="button"
                  disabled={pengesahanHapus !== namaPaparan}
                  onClick={hapus}
                  className="inline-flex items-center gap-1.5 bg-red-600 text-white rounded-xl px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-40"
                >
                  <Trash2 className="w-4 h-4" /> Delete user
                </button>
              </div>
            </Card>
          )}

          <ReasonDialog
            open={dialogGantung !== null}
            title={dialogGantung === "restore" ? `Restore "${namaPaparan}"?` : `Suspend "${namaPaparan}"?`}
            confirmLabel={dialogGantung === "restore" ? "Restore account" : "Suspend account"}
            tone={dialogGantung === "restore" ? "default" : "danger"}
            onConfirm={sahkanGantung}
            onClose={() => setDialogGantung(null)}
          />
        </>
      )}

      {/* ===== Tab Classes ===== */}
      {tab === "classes" && (
        <Card className="mt-4 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-ink-faint border-b border-hairline">
                  <th className="px-4 py-3 font-medium">Class</th>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {(kelas || []).map((k) => (
                  <tr key={k.id} className="border-b border-hairline last:border-b-0 hover:bg-[#F7F7F9]">
                    <td className="px-4 py-3">
                      <Link href={`/admin/classes/${k.id}`} className="font-medium text-brand-purple hover:opacity-80">
                        {k.nama}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-ink-muted">{k.peranan}</td>
                    <td className="px-4 py-3">
                      {k.status === "Archived" ? (
                        <Pill>Archived</Pill>
                      ) : k.status === "Ended" ? (
                        <Pill tone="yellow">Ended</Pill>
                      ) : (
                        <Pill tone="green">Active</Pill>
                      )}
                    </td>
                    <td className="px-4 py-3 text-ink-muted">{fmt(k.tarikh)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {kelas === null ? (
            <div className="px-4 py-8 text-sm text-ink-faint">Loading...</div>
          ) : (
            kelas.length === 0 && <EmptyState title="No classes." body="This user has no classes yet." />
          )}
        </Card>
      )}

      {/* ===== Tab Activity history ===== */}
      {tab === "activity" && (
        <Card className="mt-4 overflow-hidden">
          {audit === null ? (
            <div className="px-4 py-8 text-sm text-ink-faint">Loading...</div>
          ) : audit.length === 0 ? (
            <EmptyState title="No activity yet." />
          ) : (
            audit.map((r) => {
              const beza = bezaAudit(r.meta);
              const alasan = alasanAudit(r.meta);
              return (
                <div key={r.id} className="px-4 py-3 border-b border-hairline last:border-b-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-ink">{labelTindakan(r.action).label}</span>
                    <span className="text-xs text-ink-faint">by {namaProfil(r.actor_id)}</span>
                    <span className="ml-auto text-xs text-ink-faint">{relTime(r.created_at)}</span>
                  </div>
                  {alasan && <p className="text-sm text-ink-muted mt-1">Reason: {alasan}</p>}
                  {beza.length > 0 && (
                    <div className="mt-1 space-y-0.5">
                      {beza.map((b) => (
                        <div key={b.key} className="text-xs text-ink-muted font-mono">
                          {b.key}: {b.before} -&gt; {b.after}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </Card>
      )}
    </AdminShell>
  );
}
