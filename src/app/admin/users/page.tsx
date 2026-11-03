"use client";

// Users ruang kerja admin, rupa v3 (KZ-024). Jadual carian: tab, carian dan
// penapis status dibaca daripada ?tab= ?q= ?status= supaya kad "Needs
// attention" di Overview boleh mendarat terus ke konteks yang betul.
// Jadual guna DataTable kit (avatar, lencana peranan, status titik, menu
// "..."); data, penapis, penomboran dan tindakan tidak berubah.
//
// Ciri tindakan pukal kekal: kotak semak pada baris belum sah emel
// memanggil /api/admin/users/verify (kerja sebenar di pelayan dengan
// service_role; klien tidak pernah menandakan emel sendiri).
// Semua tindakan satu-pengguna berpindah ke halaman butiran.

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, Download, Eye, User as UserIcon } from "lucide-react";
import AdminShell from "@/components/admin/AdminShell";
import { Tabs, relTime } from "@/components/admin/ui";
import {
  Alert,
  Avatar,
  Badge,
  DataTable,
  EmptyState,
  Input,
  PageHead,
  Select,
  type DataColumn,
} from "@/components/ui";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { petikCsv, lindungFormula } from "@/lib/csvPeserta";
import { supabase } from "@/lib/supabaseClient";
import { useBahasa } from "@/lib/i18n/BahasaProvider";
import { type KunciKamus } from "@/lib/i18n";
import {
  adminListProfiles,
  adminListUsersMeta,
  logAudit,
  type Profile,
  type UserMeta,
} from "@/lib/data";
import {
  TAB_PENGGUNA,
  tapisPengguna,
  kiraTab,
  emelBelumSah,
  pelanProfil,
  LABEL_PELAN,
  type TabPengguna,
  type StatusPengguna,
} from "@/lib/adminUsers";

const SEBARIS = 25;

// KZ-043: kunci kamus bagi setiap tab dan label pelan; label lib kekal
// English kerana diuji oleh selftest-admin-ui.
const KUNCI_TAB: Record<TabPengguna, KunciKamus> = {
  all: "admin.users.tabAll",
  educators: "admin.users.tabEducators",
  participants: "admin.users.tabStudents",
  admins: "admin.users.tabAdmins",
  pending: "admin.users.tabPending",
  suspended: "admin.users.tabSuspended",
};
const KUNCI_PELAN_PENDEK: Record<string, KunciKamus> = {
  free: "admin.users.planShortFree",
  pro: "admin.users.planShortPro",
  institution: "admin.users.planShortInstitution",
  unlimited: "admin.users.planShortUnlimited",
};

// Format tarikh; lokal pilihan supaya paparan ikut bahasa, tiada nilai
// dipaparkan sebagai label "tiada" yang diberikan pemanggil.
function fmt(d: string | null | undefined, lokal?: string, tiada = "Never") {
  if (!d) return tiada;
  try {
    return new Date(d).toLocaleString(lokal);
  } catch {
    return String(d);
  }
}

/** Label pil peranan; superadmin dipapar "Owner". */
function labelPerananT(role: string, t: (k: KunciKamus) => string) {
  if (role === "superadmin") return t("admin.roleOwner");
  if (role === "admin") return t("admin.roleAdmin");
  if (role === "educator") return t("admin.roleEducator");
  return t("common.student");
}

function SenaraiPengguna({
  users,
  meta,
  onReload,
}: {
  users: Profile[];
  meta: Record<string, UserMeta>;
  onReload: () => void;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const confirm = useConfirm();
  const { t, bahasa } = useBahasa();

  const tabAwal = (TAB_PENGGUNA.find((pas) => pas.key === sp.get("tab"))?.key ?? "all") as TabPengguna;
  const statusAwal = (["verified", "unverified", "expiring"].includes(sp.get("status") || "")
    ? sp.get("status")
    : "all") as StatusPengguna;

  const [tab, setTab] = useState<TabPengguna>(tabAwal);
  const [status, setStatus] = useState<StatusPengguna>(statusAwal);
  const [q, setQ] = useState(sp.get("q") || "");
  const [muka, setMuka] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [alsoApprove, setAlsoApprove] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [mesej, setMesej] = useState<{ baik: boolean; teks: string } | null>(null);

  const ditapis = useMemo(
    () => tapisPengguna(users, meta, { tab, q, status }),
    [users, meta, tab, q, status],
  );
  const kiraan = useMemo(
    () => kiraTab(users, meta, { q, status }),
    [users, meta, q, status],
  );
  const belumSahDalam = useMemo(
    () => ditapis.filter((u) => emelBelumSah(u.id, meta)).map((u) => u.id),
    [ditapis, meta],
  );

  const jumlah = ditapis.length;
  const mula = jumlah === 0 ? 0 : (muka - 1) * SEBARIS + 1;
  const akhir = Math.min(muka * SEBARIS, jumlah);

  const tukarTab = (k: string) => {
    setTab(k as TabPengguna);
    setMuka(1);
  };

  const tukarStatus = (s: string) => {
    setStatus(s as StatusPengguna);
    setMuka(1);
  };

  const toggleSelected = (id: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  /**
   * Sahkan emel secara pukal melalui /api/admin/users/verify. Route itu
   * menulis rekod auditnya sendiri; klien hanya menyampaikan senarai.
   */
  const verifyEmails = async (ids: string[]) => {
    if (ids.length === 0) return;
    const siapa = ids.length > 1 ? t("admin.users.nUsers", { n: ids.length }) : t("admin.users.thisUser");
    if (
      !(await confirm({
        title: t("admin.users.confirmVerify", {
          siapa,
          danLulus: alsoApprove ? t("admin.users.andApprove") : "",
        }),
        tone: "default",
      }))
    )
      return;
    setVerifying(true);
    setMesej(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/admin/users/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` },
        body: JSON.stringify({ userIds: ids, alsoApprove }),
      });
      const out = (await res.json().catch(() => ({}))) as {
        ok?: number;
        total?: number;
        error?: string;
        results?: { id: string; ok: boolean; error?: string }[];
      };
      if (!res.ok) throw new Error(out.error || `HTTP ${res.status}`);
      const gagal = (out.results || []).filter((r) => !r.ok);
      setMesej({
        baik: true,
        teks:
          t("admin.users.verifiedMsg", { ok: out.ok ?? 0, total: out.total ?? ids.length }) +
          (gagal.length
            ? t("admin.users.failedList", {
                senarai: gagal.map((f) => f.error || f.id.slice(0, 8)).join("; "),
              })
            : ""),
      });
      setSelected(new Set());
      onReload();
    } catch (e: unknown) {
      setMesej({ baik: false, teks: e instanceof Error ? e.message : String(e) });
    } finally {
      setVerifying(false);
    }
  };

  // Lajur jadual kit; data dan tindakan sama seperti jadual lama.
  const lajur: DataColumn<Profile>[] = [
    {
      key: "pilih",
      header: "",
      className: "w-10",
      render: (u) =>
        emelBelumSah(u.id, meta) ? (
          <input
            type="checkbox"
            aria-label={t("admin.selectUser", { nama: u.display_name || t("admin.unnamedUser") })}
            className="h-4 w-4 accent-brand-purple"
            checked={selected.has(u.id)}
            onChange={() => toggleSelected(u.id)}
            onClick={(e) => e.stopPropagation()}
          />
        ) : null,
    },
    {
      key: "user",
      header: t("admin.users.colUser"),
      render: (u, i) => {
        const m = meta[u.id];
        return (
          <span className="flex items-center gap-3 py-3">
            <Avatar name={u.display_name || t("admin.unnamedUser")} size="sm" index={i} />
            <span className="min-w-0">
              <span className="block text-[13px] font-bold text-ink truncate">{u.display_name || t("admin.unnamedUser")}</span>
              <span className="block text-[12px] text-ink-faint truncate">{m?.email || t("admin.noEmail")}</span>
            </span>
          </span>
        );
      },
    },
    {
      key: "role",
      header: t("admin.users.colRole"),
      render: (u) => (
        <Badge variant="dim" warna="purple">
          {labelPerananT(u.role, t)}
        </Badge>
      ),
    },
    {
      key: "email",
      header: t("admin.users.colEmail"),
      hideOnMobile: true,
      render: (u) => {
        const m = meta[u.id];
        if (!m?.email) {
          return (
            <Badge variant="dim" warna="gray">
              {t("admin.noEmail")}
            </Badge>
          );
        }
        return m.email_confirmed_at ? (
          <Badge variant="dim" warna="green">
            {t("admin.verified")}
          </Badge>
        ) : (
          <Badge variant="dim" warna="yellow">
            {t("admin.unverified")}
          </Badge>
        );
      },
    },
    {
      key: "account",
      header: t("admin.users.colAccount"),
      render: (u) =>
        u.suspended ? (
          <Badge variant="dim" warna="red">
            {t("admin.suspended")}
          </Badge>
        ) : !u.approved ? (
          <Badge variant="dim" warna="yellow">
            {t("admin.pending")}
          </Badge>
        ) : (
          <Badge variant="dot" warna="green">
            {t("admin.active")}
          </Badge>
        ),
    },
    {
      key: "plan",
      header: t("admin.users.colPlan"),
      hideOnMobile: true,
      render: (u) => {
        const adaPelan = u.role === "educator" || u.role === "admin" || u.role === "superadmin";
        return (
          <span className="text-[13px] text-ink-faint">{adaPelan ? t(KUNCI_PELAN_PENDEK[pelanProfil(u)]) : "-"}</span>
        );
      },
    },
    {
      key: "last",
      header: t("admin.users.colLastActive"),
      hideOnMobile: true,
      render: (u) => {
        const m = meta[u.id];
        return <span className="text-[13px] text-ink-faint whitespace-nowrap">{relTime(m?.last_sign_in_at, undefined, bahasa)}</span>;
      },
    },
  ];

  return (
    <div>
      <Tabs items={TAB_PENGGUNA.map((pas) => ({ ...pas, label: t(KUNCI_TAB[pas.key]), count: kiraan[pas.key] }))} value={tab} onChange={tukarTab} />

      {/* Bar tindakan pukal: hanya timbul bila ada emel belum sah dalam paparan */}
      {belumSahDalam.length > 0 && (
        <div className="my-4 flex flex-wrap items-center gap-2 rounded-[4px] bg-amber-50 border border-amber-200 px-4 py-3 text-[14px]">
          <span className="font-bold text-amber-900">{t("admin.users.unverifiedCount", { n: belumSahDalam.length })}</span>
          <button
            type="button"
            onClick={() => setSelected(new Set(belumSahDalam))}
            className="px-2 py-1 rounded-[4px] bg-white border border-amber-200 text-[12px] font-medium text-amber-900 hover:bg-amber-100"
          >
            {t("admin.users.selectAll")}
          </button>
          {selected.size > 0 && (
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="px-2 py-1 rounded-[4px] bg-white border border-amber-200 text-[12px] font-medium text-amber-900 hover:bg-amber-100"
            >
              {t("admin.users.clear")}
            </button>
          )}
          <label className="flex items-center gap-1.5 text-[12px] text-amber-900 cursor-pointer">
            <input type="checkbox" className="h-4 w-4 accent-brand-purple" checked={alsoApprove} onChange={(e) => setAlsoApprove(e.target.checked)} />
            {t("admin.users.alsoApprove")}
          </label>
          <button
            type="button"
            disabled={selected.size === 0 || verifying}
            onClick={() => verifyEmails(Array.from(selected))}
            className="ml-auto px-3 py-1.5 rounded-[4px] bg-green-600 text-white text-[13px] font-bold hover:bg-green-700 disabled:opacity-40"
          >
            {verifying ? t("admin.users.verifying") : t("admin.users.verifySelected", { n: selected.size })}
          </button>
        </div>
      )}

      {mesej && (
        <Alert tone={mesej.baik ? "success" : "danger"} className="mb-4">
          {mesej.teks}
        </Alert>
      )}

      <DataTable
        className="mt-4"
        label={t("admin.users.tableLabel")}
        columns={lajur}
        rows={ditapis}
        rowKey={(u) => u.id}
        menuItems={(u) => [
          {
            label: t("admin.users.viewDetails"),
            icon: <Eye className="w-4 h-4" />,
            onSelect: () => router.push(`/admin/users/${u.id}`),
          },
        ]}
        menuLabel={t("admin.users.actionsLabel")}
        onRowClick={(u) => router.push(`/admin/users/${u.id}`)}
        halaman={muka}
        saizHalaman={SEBARIS}
        onHalaman={setMuka}
        head={
          <>
            <span className="w-full sm:w-64">
              <Input
                ikonKiri={<Search className="w-4 h-4" />}
                placeholder={t("admin.users.searchPlaceholder")}
                aria-label={t("admin.users.searchAria")}
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setMuka(1);
                }}
              />
            </span>
            <Select value={status} onChange={(e) => tukarStatus(e.target.value)} aria-label={t("admin.users.filterStatusAria")} className="w-auto">
              <option value="all">{t("admin.users.optAllStatuses")}</option>
              <option value="verified">{t("admin.users.optVerified")}</option>
              <option value="unverified">{t("admin.users.optUnverified")}</option>
              <option value="expiring">{t("admin.users.optExpiring")}</option>
            </Select>
            <span className="ml-auto text-[13px] text-ink-faint whitespace-nowrap">
              {t("admin.showingOf", { mula, akhir, jumlah })}
            </span>
          </>
        }
        empty={
          <EmptyState
            icon={<UserIcon className="w-6 h-6" />}
            title={t("admin.users.emptyTitle")}
            text={t("admin.tryDifferentSearch")}
          />
        }
      />

      <p className="text-[12px] text-ink-faint mt-3">{t("admin.auditNote")}</p>
    </div>
  );
}

export default function Page() {
  const { t } = useBahasa();
  const confirm = useConfirm();
  const [users, setUsers] = useState<Profile[]>([]);
  const [meta, setMeta] = useState<Record<string, UserMeta>>({});
  const [muat, setMuat] = useState(true);

  const reload = async () => {
    try {
      const [p, m] = await Promise.all([adminListProfiles(), adminListUsersMeta()]);
      setUsers(p);
      setMeta(m);
    } catch {
      // RLS menolak pembacaan bukan admin; halaman kekal kosong.
    } finally {
      setMuat(false);
    }
  };

  useEffect(() => {
    reload();
  }, []);

  /**
   * Eksport CSV: fungsi lama dikekalkan, ditambah lajur Plan dan Last
   * active. BOM UTF-8 supaya Excel di Windows membaca aksara beraksen.
   */
  const exportCsv = async () => {
    // Fail ini mengandungi emel semua pengguna (temuan kzsec V2-011b):
    // minta pengesahan dan rekod dalam Audit sebelum memuat turun.
    const ok = await confirm({
      title: t("admin.users.exportConfirm", { n: users.length }),
    });
    if (!ok) return;
    await logAudit("users_export", "profile", undefined, { count: users.length });
    const esc = (v: unknown) => petikCsv(lindungFormula(v == null ? "" : String(v)));
    const headers = ["Name", "Username", "Email", "Role", "Email verified", "Suspended", "Approved", "Registered", "Plan", "Last active"];
    const rows = users.map((u) => {
      const m = meta[u.id];
      return [
        u.display_name || "",
        u.username || "",
        m?.email || "",
        u.role,
        m?.email_confirmed_at ? "Yes" : "No",
        u.suspended ? "Yes" : "No",
        u.approved ? "Yes" : "No",
        fmt(m?.created_at || u.created_at),
        LABEL_PELAN[pelanProfil(u)],
        fmt(m?.last_sign_in_at),
      ]
        .map(esc)
        .join(",");
    });
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kuizen-users-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <AdminShell>
      <PageHead
        title={t("admin.users.title")}
        description={t("admin.users.description")}
        secondaryActions={[
          { label: t("admin.exportCsv"), icon: <Download className="w-4 h-4" />, onSelect: exportCsv },
        ]}
      />
      {muat ? (
        <p className="text-[14px] text-ink-faint py-8">{t("common.loadingDots")}</p>
      ) : (
        <Suspense fallback={<div className="text-sm text-ink-faint py-8">{t("common.loadingDots")}</div>}>
          <SenaraiPengguna users={users} meta={meta} onReload={reload} />
        </Suspense>
      )}
    </AdminShell>
  );
}
