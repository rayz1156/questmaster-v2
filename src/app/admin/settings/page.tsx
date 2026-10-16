"use client";

// Settings ruang kerja admin, rupa v3 (KZ-024). Dua bahagian: jadual
// pentadbir (Owner dan Admin, dengan emel dan aktiviti terakhir daripada
// adminListUsersMeta) dan matriks kebenaran peranan baca sahaja. Peranan
// hanya boleh ditukar pada butiran pengguna, bukan di sini, jadi tiada
// butang edit dalam jadual. Jadual guna DataTable kit; data tidak berubah.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, X, User as UserIcon } from "lucide-react";
import AdminShell from "@/components/admin/AdminShell";
import { relTime } from "@/components/admin/ui";
import {
  Avatar,
  Badge,
  CardHead,
  DataTable,
  EmptyState,
  PageHead,
  type DataColumn,
} from "@/components/ui";
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
    <Check className="w-4 h-4 text-kz-up" aria-label="Allowed" />
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

  // Lajur jadual pentadbir; klik baris membuka butiran pengguna seperti sebelum ini.
  const lajurPentadbir: DataColumn<Profile>[] = [
    {
      key: "nama",
      header: "Name",
      render: (u, i) => (
        <span className="flex items-center gap-3 py-3">
          <Avatar name={u.display_name || "Unnamed user"} size="sm" index={i} />
          <Link
            href={`/admin/users/${u.id}`}
            onClick={(e) => e.stopPropagation()}
            className="text-[13px] font-bold text-ink hover:text-brand-purple truncate"
          >
            {u.display_name || "Unnamed user"}
          </Link>
        </span>
      ),
    },
    {
      key: "emel",
      header: "Email",
      hideOnMobile: true,
      render: (u) => (
        <span className="text-[13px] text-ink-faint truncate block max-w-[220px]">
          {meta[u.id]?.email || "No email"}
        </span>
      ),
    },
    {
      key: "peranan",
      header: "Role",
      render: (u) => (
        <Badge variant="dim" warna="purple">
          {u.role === "superadmin" ? "Owner" : "Admin"}
        </Badge>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (u) =>
        u.suspended ? (
          <Badge variant="dim" warna="red">
            Suspended
          </Badge>
        ) : (
          <Badge variant="dot" warna="green">
            Active
          </Badge>
        ),
    },
    {
      key: "aktif",
      header: "Last active",
      hideOnMobile: true,
      render: (u) => (
        <span className="text-[13px] text-ink-faint whitespace-nowrap">
          {relTime(meta[u.id]?.last_sign_in_at)}
        </span>
      ),
    },
  ];

  // Lajur matriks kebenaran: baca sahaja, tiada klik baris.
  const lajurKeenan: DataColumn<(typeof KEENAN)[number]>[] = [
    {
      key: "kebenaran",
      header: "Permission",
      render: (k) => <span className="text-[13px] text-ink">{k.label}</span>,
    },
    {
      key: "owner",
      header: "Owner",
      className: "w-24",
      render: (k) => <SelBenar ok={k.owner} />,
    },
    {
      key: "admin",
      header: "Admin",
      className: "w-24",
      render: (k) => <SelBenar ok={k.admin} />,
    },
  ];

  return (
    <AdminShell>
      <PageHead title="Settings" />

      {muat ? (
        <p className="text-[14px] text-ink-faint py-8">Loading...</p>
      ) : (
        <div className="space-y-8">
          {/* ===== Admin access ===== */}
          <section>
            <CardHead title="Admin access" subtitle="Owners and admins who can reach this workspace." className="mb-3" />
            <DataTable
              label="Admins"
              columns={lajurPentadbir}
              rows={pentadbir}
              rowKey={(u) => u.id}
              onRowClick={(u) => router.push(`/admin/users/${u.id}`)}
              empty={
                <EmptyState
                  icon={<UserIcon className="w-6 h-6" />}
                  title="No admins"
                  text="Admins appear here once they exist."
                />
              }
            />
          </section>

          {/* ===== Role permissions ===== */}
          <section>
            <CardHead title="Role permissions" subtitle="What each admin role can do. Read only." className="mb-3" />
            <DataTable label="Role permissions" columns={lajurKeenan} rows={KEENAN} rowKey={(k) => k.label} />
            <p className="text-[12px] text-ink-faint mt-3">
              To make someone an admin, open their profile in Users and change the role.
            </p>
          </section>
        </div>
      )}
    </AdminShell>
  );
}
