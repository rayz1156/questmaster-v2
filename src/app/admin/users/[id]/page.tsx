"use client";

// Butiran pengguna ruang kerja admin (V2-011b), rupa v3 (KZ-024b): ProfileLayout
// gaya "Students Details". Kiri: avatar inisial, nama, lencana peranan dan
// status, blok "LAST LOGIN" serta menu laluan admin sedia ada. Kanan: Tabs
// keadaan (Profile, Classes, Activity history) dan kandungan sedia ada.
//
// Semua tindakan satu pengguna yang dahulu berada dalam kad halaman Users
// dipindahkan ke sini: peranan, pelan, had kelas, kebenaran muat naik, gantung
// dengan alasan, lulus, buang, hantar semula pengesahan dan sahkan emel.
// Logik, data, panggilan API dan pengesahan TIDAK berubah (KZ-DS-v3 bahagian 5).
//
// Gantung memanggil RPC qm_admin_set_suspended: audit dengan alasan ditulis
// oleh fungsi itu sendiri di pelayan. Buang meminta pentadbir menaip nama
// paparan pengguna dengan tepat sebelum butang hidup. Suspend dan Delete
// disembunyikan untuk akaun sendiri dan superadmin.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  KeyRound,
  MailCheck,
  Mail,
  UserCheck,
  ScrollText,
  Ban,
  RotateCcw,
  Trash2,
  Save,
  Users as UsersIcon,
  GraduationCap,
  Map as MapIcon,
  User as UserIcon,
} from "lucide-react";
import AdminShell from "@/components/admin/AdminShell";
import { ReasonDialog, relTime } from "@/components/admin/ui";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHead,
  CheckRadio,
  DataSection,
  DataRow,
  DataTable,
  EmptyState,
  Input,
  ProfileLayout,
  Select,
  Tabs,
  type DataColumn,
} from "@/components/ui";
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

/** Baris kelas yang dipaparkan dalam DataTable tab Classes. */
type BarisKelas = {
  id: string;
  nama: string;
  peranan: string;
  status: string;
  tarikh: string;
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

/** Butang tindakan menegak dalam kad "Account actions", nilai v3 (KZ-DS-v3). */
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
          ? "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-[4px] border border-red-200 bg-white text-[13px] font-bold text-red-600 hover:bg-[#fce4e2] transition"
          : "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-[4px] border border-hairline bg-white text-[13px] font-bold text-ink-muted hover:bg-canvas transition"
      }
    >
      <span className="text-ink-faint shrink-0">{ikon}</span>
      <span className="text-left min-w-0 truncate">{label}</span>
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
  const [kelas, setKelas] = useState<BarisKelas[] | null>(null);
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
      // Audit delete_user ditulis oleh qm_admin_delete_user di pelayan (0048).
      await adminDeleteUser(id);
      router.push("/admin/users");
    } catch (e) {
      setMesej({ baik: false, teks: mesejHad(e, "Delete failed.") });
    }
  };

  if (muat) {
    return (
      <AdminShell>
        <p className="text-[14px] text-ink-faint py-8">Loading...</p>
      </AdminShell>
    );
  }

  if (!u) {
    return (
      <AdminShell title="User not found">
        <Card>
          <EmptyState
            icon={<UserIcon className="w-6 h-6" />}
            title="User not found."
            text="This account may have been deleted."
            actionLabel="Back to Users"
            href="/admin/users"
          />
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

  // Lencana status akaun (sama seperti lajur Account senarai Users, KZ-024).
  const lencanaStatus = u.suspended ? (
    <Badge variant="dim" warna="red">
      Suspended
    </Badge>
  ) : !u.approved ? (
    <Badge variant="dim" warna="yellow">
      Pending
    </Badge>
  ) : (
    <Badge variant="dot" warna="green">
      Active
    </Badge>
  );

  // Lajur DataTable tab Classes; data dan pautan sama seperti jadual lama.
  const lajurKelas: DataColumn<BarisKelas>[] = [
    {
      key: "kelas",
      header: "Class",
      render: (k) => (
        <Link
          href={`/admin/classes/${k.id}`}
          className="text-[13px] font-bold text-ink hover:text-brand-purple transition"
        >
          {k.nama}
        </Link>
      ),
    },
    {
      key: "peranan",
      header: "Role",
      render: (k) => <span className="text-[13px] text-ink-faint">{k.peranan}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (k) =>
        k.status === "Archived" ? (
          <Badge variant="dim" warna="gray">
            Archived
          </Badge>
        ) : k.status === "Ended" ? (
          <Badge variant="dim" warna="yellow">
            Ended
          </Badge>
        ) : (
          <Badge variant="dot" warna="green">
            Active
          </Badge>
        ),
    },
    {
      key: "tarikh",
      header: "Date",
      hideOnMobile: true,
      render: (k) => <span className="text-[13px] text-ink-faint whitespace-nowrap">{fmt(k.tarikh)}</span>,
    },
  ];

  return (
    <AdminShell>
      <ProfileLayout
        name={namaPaparan}
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-1.5">
            <Badge variant="dim" warna="purple">
              {labelPeranan(u.role)}
            </Badge>
            {lencanaStatus}
          </span>
        }
        menu={[
          { label: "All users", href: "/admin/users", icon: <UsersIcon className="w-[18px] h-[18px]" /> },
          { label: "Classes", href: "/admin/classes", icon: <GraduationCap className="w-[18px] h-[18px]" /> },
          { label: "Activities", href: "/admin/hunts", icon: <MapIcon className="w-[18px] h-[18px]" /> },
        ]}
        lastLogin={fmt(m?.last_sign_in_at)}
        menuMoreItems={[{ label: "View audit history", onSelect: () => setTab("activity") }]}
      >
        <h1 className="text-[24px] font-bold text-ink leading-tight">User details</h1>
        <p className="text-[14px] text-ink-faint mt-1">Profile, classes and activity history of this account.</p>

        <Tabs
          className="mt-6"
          items={[
            { label: "Profile", onSelect: () => setTab("profile"), aktif: tab === "profile" },
            { label: "Classes", onSelect: () => setTab("classes"), aktif: tab === "classes" },
            { label: "Activity history", onSelect: () => setTab("activity"), aktif: tab === "activity" },
          ]}
        />

        {mesej && (
          <Alert tone={mesej.baik ? "success" : "danger"} className="mt-4">
            {mesej.teks}
          </Alert>
        )}

      {/* ===== Tab Profile ===== */}
      {tab === "profile" && (
        <div className="mt-6 grid lg:grid-cols-3 gap-6 items-start">
          {/* Maklumat akaun: DataSection/DataRow terus dalam kandungan kanan. */}
          <div className="lg:col-span-2 space-y-8 min-w-0">
            <DataSection title="Basics">
              <DataRow label="Name" value={u.display_name || "Unnamed user"} />
              <DataRow label="Username" value={u.username || "-"} />
              <DataRow label="Email" value={emel || "No email"} />
              <DataRow
                label="Email status"
                value={
                  !emel ? (
                    <Badge variant="dim" warna="gray">
                      No email
                    </Badge>
                  ) : m?.email_confirmed_at ? (
                    <Badge variant="dim" warna="green">
                      Verified
                    </Badge>
                  ) : (
                    <Badge variant="dim" warna="yellow">
                      Unverified
                    </Badge>
                  )
                }
              />
              <DataRow
                label="Role"
                value={
                  u.role === "superadmin" ? (
                    <Badge variant="dim" warna="purple">
                      Owner
                    </Badge>
                  ) : (
                    <Select
                      value={u.role}
                      onChange={(e) => tukarPeranan(e.target.value as "participant" | "educator" | "admin")}
                      aria-label="Role"
                      className="w-40"
                    >
                      <option value="participant">Participant</option>
                      <option value="educator">Educator</option>
                      <option value="admin">Admin</option>
                    </Select>
                  )
                }
              />
              <DataRow label="Registered" value={fmt(m?.created_at || u.created_at)} />
              <DataRow label="Last sign in" value={fmt(m?.last_sign_in_at)} />
            </DataSection>

            {adaPelan && (
              <DataSection title="Plan">
                <DataRow
                  label="Plan"
                  value={
                    <Select
                      value={pelanProfil(u)}
                      onChange={(e) => tukarPelan(e.target.value as PelanAdmin)}
                      aria-label="Plan"
                      className="w-40"
                    >
                      {PELAN_ADMIN.map((p) => (
                        <option key={p} value={p}>
                          {LABEL_PELAN[p]}
                        </option>
                      ))}
                    </Select>
                  }
                />
                <DataRow label="Plan expires" value={u.plan_expires_at ? fmt(u.plan_expires_at) : "-"} />
              </DataSection>
            )}

            {bolehHad && (
              <DataSection title="Class limits">
                <DataRow
                  label="Max classes (own)"
                  value={
                    <Input
                      type="number"
                      min={0}
                      className="w-28"
                      value={drafHad.owned}
                      onChange={(e) => setHadDraf({ owned: e.target.value, coed: drafHad.coed })}
                      aria-label="Max classes (own)"
                    />
                  }
                />
                <DataRow
                  label="Max as co-educator"
                  value={
                    <Input
                      type="number"
                      min={0}
                      className="w-28"
                      value={drafHad.coed}
                      onChange={(e) => setHadDraf({ owned: drafHad.owned, coed: e.target.value })}
                      aria-label="Max as co-educator"
                    />
                  }
                />
                <div className="flex flex-wrap items-center gap-3 py-5 px-5">
                  <Button onClick={simpanHad}>
                    <Save className="w-4 h-4" /> Save
                  </Button>
                  <span className="text-[12px] text-ink-faint">Empty means the plan default applies.</span>
                </div>
              </DataSection>
            )}

            {adaPelan && (
              <DataSection title="Upload permissions">
                <DataRow
                  label="Allowed uploads"
                  value={
                    <span className="flex flex-wrap items-center gap-x-5 gap-y-2">
                      <CheckRadio
                        type="checkbox"
                        label="Files (FileLu)"
                        checked={!!u.can_upload_files}
                        onChange={() => toggleKebenaran("can_upload_files")}
                      />
                      <CheckRadio
                        type="checkbox"
                        label="Videos (Bunny Stream)"
                        checked={!!u.can_upload_videos}
                        onChange={() => toggleKebenaran("can_upload_videos")}
                      />
                      {(u.role === "admin" || u.role === "superadmin") && (
                        <span className="text-[12px] text-ink-faint">Admins always allowed</span>
                      )}
                    </span>
                  }
                />
              </DataSection>
            )}
          </div>

          {/* Kad tindakan akaun; tindakan dan pengesahan sama seperti sebelum ini. */}
          <Card>
            <CardHead title="Account actions" subtitle={emel || "No email"} />
            <div className="mt-4 space-y-2">
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
            <p className="text-[12px] text-ink-faint mt-4">Account changes are recorded in Audit.</p>
          </Card>
        </div>
      )}

      {/* Zon bahaya: pengesahan menaip nama paparan tetap sama. */}
      {tab === "profile" && bolehBahaya && (
        <Card className="mt-6">
          <div className="text-[13px] font-bold text-red-600 mb-1">Danger zone</div>
          <p className="text-[14px] text-ink-muted mb-4">
            Deleting this user removes their account permanently. Type the display name exactly to enable the button.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Input
              className="w-64"
              placeholder={namaPaparan}
              value={pengesahanHapus}
              onChange={(e) => setPengesahanHapus(e.target.value)}
              aria-label="Type the display name to confirm deletion"
            />
            <button
              type="button"
              disabled={pengesahanHapus !== namaPaparan}
              onClick={hapus}
              className="inline-flex items-center justify-center gap-2 font-bold tracking-[0.26px] rounded-[4px] transition select-none h-9 px-[18px] py-[7px] text-[13px] bg-red-600 text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Trash2 className="w-4 h-4" /> Delete user
            </button>
          </div>
        </Card>
      )}

      {/* ===== Tab Classes ===== */}
      {tab === "classes" &&
        (kelas === null ? (
          <p className="text-[14px] text-ink-faint py-8">Loading...</p>
        ) : (
          <DataTable
            className="mt-6"
            label="Classes of this user"
            columns={lajurKelas}
            rows={kelas}
            rowKey={(k) => k.id}
            empty={
              <EmptyState
                icon={<GraduationCap className="w-6 h-6" />}
                title="No classes."
                text="This user has no classes yet."
              />
            }
          />
        ))}

      {/* ===== Tab Activity history ===== */}
      {tab === "activity" &&
        (audit === null ? (
          <p className="text-[14px] text-ink-faint py-8">Loading...</p>
        ) : audit.length === 0 ? (
          <EmptyState icon={<ScrollText className="w-6 h-6" />} title="No activity yet." className="mt-6" />
        ) : (
          <Card padat className="mt-6">
            {audit.map((r) => {
              const beza = bezaAudit(r.meta);
              const alasan = alasanAudit(r.meta);
              return (
                <div key={r.id} className="px-6 py-4 border-t border-kz-line first:border-t-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[13px] font-bold text-ink">{labelTindakan(r.action).label}</span>
                    <span className="text-[12px] text-ink-faint">by {namaProfil(r.actor_id)}</span>
                    <span className="ml-auto text-[12px] text-ink-faint whitespace-nowrap">{relTime(r.created_at)}</span>
                  </div>
                  {alasan && <p className="text-[13px] text-ink-muted mt-1">Reason: {alasan}</p>}
                  {beza.length > 0 && (
                    <div className="mt-1 space-y-0.5">
                      {beza.map((b) => (
                        <div key={b.key} className="text-[12px] text-ink-muted font-mono">
                          {b.key}: {b.before} -&gt; {b.after}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </Card>
        ))}

      <ReasonDialog
        open={dialogGantung !== null}
        title={dialogGantung === "restore" ? `Restore "${namaPaparan}"?` : `Suspend "${namaPaparan}"?`}
        confirmLabel={dialogGantung === "restore" ? "Restore account" : "Suspend account"}
        tone={dialogGantung === "restore" ? "default" : "danger"}
        onConfirm={sahkanGantung}
        onClose={() => setDialogGantung(null)}
      />
      </ProfileLayout>
    </AdminShell>
  );
}
