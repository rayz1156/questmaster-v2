"use client";

// Settings ruang kerja admin (V2-011c). Dua bahagian: jadual pentadbir
// (Owner dan Admin, dengan emel dan aktiviti terakhir daripada
// adminListUsersMeta) dan matriks kebenaran peranan baca sahaja. Peranan
// hanya boleh ditukar pada butiran pengguna, bukan di sini, jadi tiada
// butang edit dalam jadual.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import AdminShell from "@/components/admin/AdminShell";
import { Card, Pill, EmptyState, relTime, initials } from "@/components/admin/ui";
import {
  adminListProfiles,
  adminListUsersMeta,
  type Profile,
  type UserMeta,
} from "@/lib/data";

/** Baris matriks kebenaran: siapa boleh melakukan perkara ini. */
const KEENAN = [
  { label: "View everything", owner: true, admin: true },
  { label: "Manage users and classes", owner: true, admin: true },
  { label: "Suspend participants and educators", owner: true, admin: true },
  { label: "Suspend admins", owner: true, admin: false },
  { label: "Change points and override reviews with a reason", owner: true, admin: true },
  { label: "Edit or delete audit entries", owner: false, admin: false },
];

/** Sel matriks: tanda hijau bila dibenarkan, silang kelabu bila tidak. */
function SelBenar({ ok }: { ok: boolean }) {
  return ok ? (
    <Check className="w-4 h-4 text-green-600" aria-label="Allowed" />
  ) : (
    <X className="w-4 h-4 text-ink-faint" aria-label="Not allowed" />
  );
}

export default function Page() {
  const router = useRouter();
  const [muat, setMuat] = useState(true);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [meta, setMeta] = useState<Record<string, UserMeta>>({});

  useEffect(() => {
    (async () => {
      try {
        const [p, m] = await Promise.all([adminListProfiles(), adminListUsersMeta()]);
        setProfiles(p);
        setMeta(m);
      } catch {
        // RLS menolak pembacaan bukan admin; halaman kekal kosong.
      } finally {
        setMuat(false);
      }
    })();
  }, []);

  // Pentadbir sahaja: superadmin (Owner) di atas, kemudian admin mengikut nama.
  const pentadbir = useMemo(
    () =>
      profiles
        .filter((p) => p.role === "admin" || p.role === "superadmin")
        .sort((a, b) => {
          if (a.role !== b.role) return a.role === "superadmin" ? -1 : 1;
          const na = String(a.display_name || "").toLowerCase();
          const nb = String(b.display_name || "").toLowerCase();
          return na < nb ? -1 : na > nb ? 1 : 0;
        }),
    [profiles],
  );

  return (
    <AdminShell title="Settings">
      {muat ? (
        <div className="text-sm text-ink-faint py-8">Loading...</div>
      ) : (
        <div className="space-y-6">
          {/* ===== Admin access ===== */}
          <section>
            <h2 className="text-sm font-semibold text-ink mb-3">Admin access</h2>
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-ink-faint border-b border-hairline">
                      <th className="px-4 py-3 font-medium">Name</th>
                      <th className="px-4 py-3 font-medium">Email</th>
                      <th className="px-4 py-3 font-medium">Role</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Last active</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pentadbir.map((u) => {
                      const m = meta[u.id];
                      return (
                        <tr
                          key={u.id}
                          onClick={() => router.push(`/admin/users/${u.id}`)}
                          className="border-b border-hairline last:border-b-0 hover:bg-[#F7F7F9] cursor-pointer transition"
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3 min-w-0">
                              <span className="w-9 h-9 rounded-full bg-[#EAE6FC] text-brand-purple text-[12px] font-semibold flex items-center justify-center shrink-0">
                                {initials(u.display_name)}
                              </span>
                              <Link
                                href={`/admin/users/${u.id}`}
                                onClick={(e) => e.stopPropagation()}
                                className="font-medium text-ink hover:text-brand-purple truncate"
                              >
                                {u.display_name || "Unnamed user"}
                              </Link>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-ink-muted truncate max-w-[220px]">{m?.email || "No email"}</td>
                          <td className="px-4 py-3">
                            <Pill tone="violet">{u.role === "superadmin" ? "Owner" : "Admin"}</Pill>
                          </td>
                          <td className="px-4 py-3">
                            {u.suspended ? <Pill tone="red">Suspended</Pill> : <Pill tone="green">Active</Pill>}
                          </td>
                          <td className="px-4 py-3 text-ink-muted whitespace-nowrap">{relTime(m?.last_sign_in_at)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {pentadbir.length === 0 && (
                <EmptyState title="No admins." body="Admins appear here once they exist." />
              )}
            </Card>
          </section>

          {/* ===== Role permissions ===== */}
          <section>
            <h2 className="text-sm font-semibold text-ink mb-3">Role permissions</h2>
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-ink-faint border-b border-hairline">
                      <th className="px-4 py-3 font-medium">Permission</th>
                      <th className="px-4 py-3 font-medium w-24">Owner</th>
                      <th className="px-4 py-3 font-medium w-24">Admin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {KEENAN.map((k) => (
                      <tr key={k.label} className="border-b border-hairline last:border-b-0">
                        <td className="px-4 py-3 text-ink">{k.label}</td>
                        <td className="px-4 py-3">
                          <SelBenar ok={k.owner} />
                        </td>
                        <td className="px-4 py-3">
                          <SelBenar ok={k.admin} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-ink-faint px-4 py-3 border-t border-hairline">
                To make someone an admin, open their profile in Users and change the role.
              </p>
            </Card>
          </section>
        </div>
      )}
    </AdminShell>
  );
}
