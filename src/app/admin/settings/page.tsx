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
import { useBahasa } from "@/lib/i18n/BahasaProvider";

/** Baris matriks kebenaran: siapa boleh melakukan perkara ini. KZ-043: label
 *  diterjemah menerusi kunci kamus pada masa render, bukan pemalar module. */
const KEENAN: { kunci: "permViewEverything" | "permManageUsersClasses" | "permSuspendStudentsEducators" | "permSuspendAdmins" | "permChangePoints" | "permEditAudit"; owner: boolean; admin: boolean }[] = [
  { kunci: "permViewEverything", owner: true, admin: true },
  { kunci: "permManageUsersClasses", owner: true, admin: true },
  { kunci: "permSuspendStudentsEducators", owner: true, admin: true },
  { kunci: "permSuspendAdmins", owner: true, admin: false },
  { kunci: "permChangePoints", owner: true, admin: true },
  { kunci: "permEditAudit", owner: false, admin: false },
];

/** Sel matriks: tanda hijau bila dibenarkan, silang kelabu bila tidak. */
function SelBenar({ ok, ya, tidak }: { ok: boolean; ya: string; tidak: string }) {
  return ok ? (
    <Check className="w-4 h-4 text-kz-up" aria-label={ya} />
  ) : (
    <X className="w-4 h-4 text-ink-faint" aria-label={tidak} />
  );
}

export default function Page() {
  const router = useRouter();
  const { t, bahasa } = useBahasa();
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
      header: t("admin.settings.colName"),
      render: (u, i) => (
        <span className="flex items-center gap-3 py-3">
          <Avatar name={u.display_name || t("admin.unnamedUser")} size="sm" index={i} />
          <Link
            href={`/admin/users/${u.id}`}
            onClick={(e) => e.stopPropagation()}
            className="text-[13px] font-bold text-ink hover:text-brand-purple truncate"
          >
            {u.display_name || t("admin.unnamedUser")}
          </Link>
        </span>
      ),
    },
    {
      key: "emel",
      header: t("admin.users.colEmail"),
      hideOnMobile: true,
      render: (u) => (
        <span className="text-[13px] text-ink-faint truncate block max-w-[220px]">
          {meta[u.id]?.email || t("admin.noEmail")}
        </span>
      ),
    },
    {
      key: "peranan",
      header: t("admin.users.colRole"),
      render: (u) => (
        <Badge variant="dim" warna="purple">
          {u.role === "superadmin" ? t("admin.roleOwner") : t("admin.roleAdmin")}
        </Badge>
      ),
    },
    {
      key: "status",
      header: t("admin.settings.colStatus"),
      render: (u) =>
        u.suspended ? (
          <Badge variant="dim" warna="red">
            {t("admin.suspended")}
          </Badge>
        ) : (
          <Badge variant="dot" warna="green">
            {t("admin.active")}
          </Badge>
        ),
    },
    {
      key: "aktif",
      header: t("admin.users.colLastActive"),
      hideOnMobile: true,
      render: (u) => (
        <span className="text-[13px] text-ink-faint whitespace-nowrap">
          {relTime(meta[u.id]?.last_sign_in_at, undefined, bahasa)}
        </span>
      ),
    },
  ];

  // Lajur matriks kebenaran: baca sahaja, tiada klik baris.
  const lajurKeenan: DataColumn<(typeof KEENAN)[number]>[] = [
    {
      key: "kebenaran",
      header: t("admin.settings.colPermission"),
      render: (k) => <span className="text-[13px] text-ink">{t(`admin.settings.${k.kunci}`)}</span>,
    },
    {
      key: "owner",
      header: t("admin.roleOwner"),
      className: "w-24",
      render: (k) => <SelBenar ok={k.owner} ya={t("admin.settings.allowed")} tidak={t("admin.settings.notAllowed")} />,
    },
    {
      key: "admin",
      header: t("admin.roleAdmin"),
      className: "w-24",
      render: (k) => <SelBenar ok={k.admin} ya={t("admin.settings.allowed")} tidak={t("admin.settings.notAllowed")} />,
    },
  ];

  return (
    <AdminShell>
      <PageHead title={t("admin.settings.title")} />

      {muat ? (
        <p className="text-[14px] text-ink-faint py-8">{t("common.loadingDots")}</p>
      ) : (
        <div className="space-y-8">
          {/* ===== Admin access ===== */}
          <section>
            <CardHead title={t("admin.settings.adminAccess")} subtitle={t("admin.settings.adminAccessSub")} className="mb-3" />
            <DataTable
              label={t("admin.settings.tableLabel")}
              columns={lajurPentadbir}
              rows={pentadbir}
              rowKey={(u) => u.id}
              onRowClick={(u) => router.push(`/admin/users/${u.id}`)}
              empty={
                <EmptyState
                  icon={<UserIcon className="w-6 h-6" />}
                  title={t("admin.settings.noAdmins")}
                  text={t("admin.settings.noAdminsText")}
                />
              }
            />
          </section>

          {/* ===== Role permissions ===== */}
          <section>
            <CardHead title={t("admin.settings.rolePermissions")} subtitle={t("admin.settings.rolePermissionsSub")} className="mb-3" />
            <DataTable label={t("admin.settings.rolePermissions")} columns={lajurKeenan} rows={KEENAN} rowKey={(k) => k.kunci} />
            <p className="text-[12px] text-ink-faint mt-3">
              {t("admin.settings.changeRoleNote")}
            </p>
          </section>
        </div>
      )}
    </AdminShell>
  );
}
