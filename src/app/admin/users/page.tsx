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
  LABEL_PELAN_PENDEK,
  type TabPengguna,
  type StatusPengguna,
} from "@/lib/adminUsers";

const SEBARIS = 25;

function fmt(d: string | null | undefined) {
  if (!d) return "Never";
  try {
    return new Date(d).toLocaleString();
  } catch {
    return String(d);
  }
}

/** Label pil peranan; superadmin dipapar "Owner". */
function labelPeranan(role: string) {
  if (role === "superadmin") return "Owner";
  if (role === "admin") return "Admin";
  if (role === "educator") return "Educator";
  return "Participant";
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

  const tabAwal = (TAB_PENGGUNA.find((t) => t.key === sp.get("tab"))?.key ?? "all") as TabPengguna;
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
    const siapa = ids.length > 1 ? `${ids.length} users` : "this user";
    if (
      !(await confirm({
        title: `Mark ${siapa} as email verified${alsoApprove ? " and approve them" : ""}?`,
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
          `Verified ${out.ok ?? 0}/${out.total ?? ids.length}.` +
          (gagal.length ? ` Failed: ${gagal.map((f) => f.error || f.id.slice(0, 8)).join("; ")}` : ""),
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
            aria-label={`Select ${u.display_name || "user"}`}
            className="h-4 w-4 accent-brand-purple"
            checked={selected.has(u.id)}
            onChange={() => toggleSelected(u.id)}
            onClick={(e) => e.stopPropagation()}
          />
        ) : null,
    },
    {
      key: "user",
      header: "User",
      render: (u, i) => {
        const m = meta[u.id];
        return (
          <span className="flex items-center gap-3 py-3">
            <Avatar name={u.display_name || "Unnamed user"} size="sm" index={i} />
            <span className="min-w-0">
              <span className="block text-[13px] font-bold text-ink truncate">{u.display_name || "Unnamed user"}</span>
              <span className="block text-[12px] text-ink-faint truncate">{m?.email || "No email"}</span>
            </span>
          </span>
        );
      },
    },
    {
      key: "role",
      header: "Role",
      render: (u) => (
        <Badge variant="dim" warna="purple">
          {labelPeranan(u.role)}
        </Badge>
      ),
    },
    {
      key: "email",
      header: "Email",
      hideOnMobile: true,
      render: (u) => {
        const m = meta[u.id];
        if (!m?.email) {
          return (
            <Badge variant="dim" warna="gray">
              No email
            </Badge>
          );
        }
        return m.email_confirmed_at ? (
          <Badge variant="dim" warna="green">
            Verified
          </Badge>
        ) : (
          <Badge variant="dim" warna="yellow">
            Unverified
          </Badge>
        );
      },
    },
    {
      key: "account",
      header: "Account",
      render: (u) =>
        u.suspended ? (
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
        ),
    },
    {
      key: "plan",
      header: "Plan",
      hideOnMobile: true,
      render: (u) => {
        const adaPelan = u.role === "educator" || u.role === "admin" || u.role === "superadmin";
        return <span className="text-[13px] text-ink-faint">{adaPelan ? LABEL_PELAN_PENDEK[pelanProfil(u)] : "-"}</span>;
      },
    },
    {
      key: "last",
      header: "Last active",
      hideOnMobile: true,
      render: (u) => {
        const m = meta[u.id];
        return <span className="text-[13px] text-ink-faint whitespace-nowrap">{relTime(m?.last_sign_in_at)}</span>;
      },
    },
  ];

  return (
    <div>
      <Tabs items={TAB_PENGGUNA.map((t) => ({ ...t, count: kiraan[t.key] }))} value={tab} onChange={tukarTab} />

      {/* Bar tindakan pukal: hanya timbul bila ada emel belum sah dalam paparan */}
      {belumSahDalam.length > 0 && (
        <div className="my-4 flex flex-wrap items-center gap-2 rounded-[4px] bg-amber-50 border border-amber-200 px-4 py-3 text-[14px]">
          <span className="font-bold text-amber-900">{belumSahDalam.length} unverified</span>
          <button
            type="button"
            onClick={() => setSelected(new Set(belumSahDalam))}
            className="px-2 py-1 rounded-[4px] bg-white border border-amber-200 text-[12px] font-medium text-amber-900 hover:bg-amber-100"
          >
            Select all
          </button>
          {selected.size > 0 && (
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="px-2 py-1 rounded-[4px] bg-white border border-amber-200 text-[12px] font-medium text-amber-900 hover:bg-amber-100"
            >
              Clear
            </button>
          )}
          <label className="flex items-center gap-1.5 text-[12px] text-amber-900 cursor-pointer">
            <input type="checkbox" className="h-4 w-4 accent-brand-purple" checked={alsoApprove} onChange={(e) => setAlsoApprove(e.target.checked)} />
            Also approve
          </label>
          <button
            type="button"
            disabled={selected.size === 0 || verifying}
            onClick={() => verifyEmails(Array.from(selected))}
            className="ml-auto px-3 py-1.5 rounded-[4px] bg-green-600 text-white text-[13px] font-bold hover:bg-green-700 disabled:opacity-40"
          >
            {verifying ? "Verifying..." : `Verify selected (${selected.size})`}
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
        label="Users"
        columns={lajur}
        rows={ditapis}
        rowKey={(u) => u.id}
        menuItems={(u) => [
          {
            label: "View details",
            icon: <Eye className="w-4 h-4" />,
            onSelect: () => router.push(`/admin/users/${u.id}`),
          },
        ]}
        menuLabel="User actions"
        onRowClick={(u) => router.push(`/admin/users/${u.id}`)}
        halaman={muka}
        saizHalaman={SEBARIS}
        onHalaman={setMuka}
        head={
          <>
            <span className="w-full sm:w-64">
              <Input
                ikonKiri={<Search className="w-4 h-4" />}
                placeholder="Search name, username or email"
                aria-label="Search users"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setMuka(1);
                }}
              />
            </span>
            <Select value={status} onChange={(e) => tukarStatus(e.target.value)} aria-label="Filter by status" className="w-auto">
              <option value="all">All statuses</option>
              <option value="verified">Verified</option>
              <option value="unverified">Unverified</option>
              <option value="expiring">Plan expiring (14 days)</option>
            </Select>
            <span className="ml-auto text-[13px] text-ink-faint whitespace-nowrap">
              Showing {mula}-{akhir} of {jumlah}
            </span>
          </>
        }
        empty={
          <EmptyState
            icon={<UserIcon className="w-6 h-6" />}
            title="No users match"
            text="Try a different search or filter."
          />
        }
      />

      <p className="text-[12px] text-ink-faint mt-3">Account changes are recorded in Audit.</p>
    </div>
  );
}

export default function Page() {
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
      title: `Export ${users.length} users with their email addresses? This is recorded in Audit.`,
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
        title="Users"
        description="Find anyone on Kuizen and manage their account."
        secondaryActions={[
          { label: "Export CSV", icon: <Download className="w-4 h-4" />, onSelect: exportCsv },
        ]}
      />
      {muat ? (
        <p className="text-[14px] text-ink-faint py-8">Loading...</p>
      ) : (
        <Suspense fallback={<div className="text-sm text-ink-faint py-8">Loading...</div>}>
          <SenaraiPengguna users={users} meta={meta} onReload={reload} />
        </Suspense>
      )}
    </AdminShell>
  );
}
