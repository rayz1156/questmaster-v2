"use client";

// Users ruang kerja admin (V2-011b). Jadual carian: tab, carian dan
// penapis status dibaca daripada ?tab= ?q= ?status= supaya kad "Needs
// attention" di Overview boleh mendarat terus ke konteks yang betul.
//
// Ciri tindakan pukal kekal: kotak semak pada baris belum sah emel
// memanggil /api/admin/users/verify (kerja sebenar di pelayan dengan
// service_role; klien tidak pernah menandakan emel sendiri).
// Semua tindakan satu-pengguna berpindah ke halaman butiran.

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, Download, ChevronLeft, ChevronRight } from "lucide-react";
import AdminShell from "@/components/admin/AdminShell";
import { Card, Pill, Tabs, EmptyState, relTime, initials } from "@/components/admin/ui";
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
  const barisMuka = ditapis.slice((muka - 1) * SEBARIS, muka * SEBARIS);

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

  return (
    <div>
      <p className="text-ink-muted text-sm mb-6">Find anyone on Kuizen and manage their account.</p>

      <Tabs items={TAB_PENGGUNA.map((t) => ({ ...t, count: kiraan[t.key] }))} value={tab} onChange={tukarTab} />

      <div className="flex flex-wrap items-center gap-2 py-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-faint" />
          <input
            className="w-full h-10 pl-9 pr-3 rounded-xl bg-white border border-hairline text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-brand-purple/30"
            placeholder="Search name, username or email"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setMuka(1);
            }}
          />
        </div>
        <select
          value={status}
          onChange={(e) => tukarStatus(e.target.value)}
          className="h-10 rounded-xl bg-white border border-hairline px-3 text-sm text-ink"
          aria-label="Filter by status"
        >
          <option value="all">All statuses</option>
          <option value="verified">Verified</option>
          <option value="unverified">Unverified</option>
          <option value="expiring">Plan expiring (14 days)</option>
        </select>
      </div>

      {/* Bar tindakan pukal: hanya timbul bila ada emel belum sah dalam paparan */}
      {belumSahDalam.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-sm">
          <span className="font-medium text-amber-900">{belumSahDalam.length} unverified</span>
          <button
            type="button"
            onClick={() => setSelected(new Set(belumSahDalam))}
            className="px-2 py-1 rounded-lg bg-white border border-amber-200 text-xs text-amber-900 hover:bg-amber-100"
          >
            Select all
          </button>
          {selected.size > 0 && (
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="px-2 py-1 rounded-lg bg-white border border-amber-200 text-xs text-amber-900 hover:bg-amber-100"
            >
              Clear
            </button>
          )}
          <label className="flex items-center gap-1.5 text-xs text-amber-900 cursor-pointer">
            <input type="checkbox" checked={alsoApprove} onChange={(e) => setAlsoApprove(e.target.checked)} />
            Also approve
          </label>
          <button
            type="button"
            disabled={selected.size === 0 || verifying}
            onClick={() => verifyEmails(Array.from(selected))}
            className="ml-auto px-3 py-1.5 rounded-xl bg-green-600 text-white text-sm font-semibold hover:bg-green-700 disabled:opacity-40"
          >
            {verifying ? "Verifying..." : `Verify selected (${selected.size})`}
          </button>
        </div>
      )}

      {mesej && (
        <div
          className={`mb-4 text-sm rounded-lg px-3 py-2 inline-block ${
            mesej.baik ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          {mesej.teks}
        </div>
      )}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-ink-faint border-b border-hairline">
                <th className="w-10 px-4 py-3"></th>
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Account</th>
                <th className="px-4 py-3 font-medium">Plan</th>
                <th className="px-4 py-3 font-medium">Last active</th>
              </tr>
            </thead>
            <tbody>
              {barisMuka.map((u) => {
                const m = meta[u.id];
                const belum = emelBelumSah(u.id, meta);
                const adaPelan = u.role === "educator" || u.role === "admin" || u.role === "superadmin";
                return (
                  <tr
                    key={u.id}
                    onClick={() => router.push(`/admin/users/${u.id}`)}
                    className="border-b border-hairline last:border-b-0 hover:bg-[#F7F7F9] cursor-pointer transition"
                  >
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      {belum && (
                        <input
                          type="checkbox"
                          aria-label={`Select ${u.display_name || "user"}`}
                          checked={selected.has(u.id)}
                          onChange={() => toggleSelected(u.id)}
                        />
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="w-9 h-9 rounded-full bg-[#EAE6FC] text-brand-purple text-[12px] font-semibold flex items-center justify-center shrink-0">
                          {initials(u.display_name)}
                        </span>
                        <span className="min-w-0">
                          <span className="block font-medium text-ink truncate">{u.display_name || "Unnamed user"}</span>
                          <span className="block text-xs text-ink-faint truncate">{m?.email || "No email"}</span>
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Pill tone="violet">{labelPeranan(u.role)}</Pill>
                    </td>
                    <td className="px-4 py-3">
                      {!m?.email ? (
                        <Pill>No email</Pill>
                      ) : m.email_confirmed_at ? (
                        <Pill tone="green">Verified</Pill>
                      ) : (
                        <Pill tone="yellow">Unverified</Pill>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {u.suspended ? (
                        <Pill tone="red">Suspended</Pill>
                      ) : !u.approved ? (
                        <Pill tone="yellow">Pending</Pill>
                      ) : (
                        <Pill tone="green">Active</Pill>
                      )}
                    </td>
                    <td className="px-4 py-3 text-ink-muted">
                      {adaPelan ? LABEL_PELAN_PENDEK[pelanProfil(u)] : "-"}
                    </td>
                    <td className="px-4 py-3 text-ink-muted whitespace-nowrap">{relTime(m?.last_sign_in_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {jumlah === 0 && <EmptyState title="No users match." body="Try a different search or filter." />}

        <div className="flex items-center justify-between px-4 py-3 border-t border-hairline">
          <span className="text-xs text-ink-faint">
            Showing {mula}-{akhir} of {jumlah}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={muka <= 1}
              onClick={() => setMuka((v) => Math.max(1, v - 1))}
              className="p-2 rounded-xl border border-hairline text-ink-muted hover:text-ink disabled:opacity-40"
              aria-label="Previous page"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              disabled={muka * SEBARIS >= jumlah}
              onClick={() => setMuka((v) => v + 1)}
              className="p-2 rounded-xl border border-hairline text-ink-muted hover:text-ink disabled:opacity-40"
              aria-label="Next page"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </Card>

      <p className="text-xs text-ink-faint mt-3">Account changes are recorded in Audit.</p>
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
    <AdminShell
      title="Users"
      actions={
        <button
          type="button"
          onClick={exportCsv}
          className="inline-flex items-center gap-1.5 bg-white border border-hairline rounded-xl px-4 py-2 text-sm font-medium text-ink hover:bg-[#F7F7F9]"
        >
          <Download className="w-4 h-4 text-ink-faint" /> Export CSV
        </button>
      }
    >
      {muat ? (
        <div className="text-sm text-ink-faint py-8">Loading...</div>
      ) : (
        <Suspense fallback={<div className="text-sm text-ink-faint py-8">Loading...</div>}>
          <SenaraiPengguna users={users} meta={meta} onReload={reload} />
        </Suspense>
      )}
    </AdminShell>
  );
}
