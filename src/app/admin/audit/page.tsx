"use client";

// Audit log ruang kerja admin, rupa v3 (KZ-024). Jadual kit dengan penapis
// Action, Actor, Period dan carian sasaran di kepala kad; klik baris
// membuka panel kanan Event details dengan beza before/after dan raw data.
// Muat 50 baris serentak dengan butang Load more (offset adminListAuditLogPaged).
// Log ini tambah sahaja: tiada butang sunting atau padam di sini. Data,
// penapis pelayan dan pemuatan tidak berubah.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Search, ScrollText, History } from "lucide-react";
import AdminShell from "@/components/admin/AdminShell";
import { relTime } from "@/components/admin/ui";
import {
  Badge,
  Button,
  Card,
  CardHead,
  DataTable,
  EmptyState,
  Input,
  PageHead,
  Select,
  type DataColumn,
  type WarnaKit,
} from "@/components/ui";
import {
  adminListAuditLogPaged,
  adminListProfiles,
  adminListAllClasses,
  adminListAllHunts,
  adminListAllChallenges,
  adminListAllTeams,
  type AuditLogRow,
  type Profile,
  type Hunt,
  type Challenge,
  type Team,
} from "@/lib/data";
import {
  labelTindakan,
  bezaAudit,
  alasanAudit,
  ringkasAlasan,
  sasaranAudit,
  padanCarianSasaran,
  senaraiTindakan,
  senaraiPelaku,
  mulaPeriod,
  type PeriodAudit,
  type PetaSasaranAudit,
  type AuditTone,
} from "@/lib/adminAudit";
import type { KelasAdmin } from "@/lib/adminClasses";

const SEBARIS = 50;

/** Nada audit admin kepada warna Badge kit. */
const TONE_PIL: Record<AuditTone, WarnaKit> = {
  good: "green",
  warn: "yellow",
  danger: "red",
  neutral: "gray",
};

/** Tarikh penuh untuk tooltip dan panel butiran. */
function fmt(d: string | null | undefined) {
  if (!d) return "-";
  try {
    return new Date(d).toLocaleString();
  } catch {
    return String(d);
  }
}

/** JSON meta berformat untuk <details> Raw data; tidak pernah melontar. */
function jsonRawat(meta: unknown): string {
  try {
    return JSON.stringify(meta ?? null, null, 2);
  } catch {
    return String(meta);
  }
}

export default function Page() {
  const [muat, setMuat] = useState(true);
  const [rows, setRows] = useState<AuditLogRow[]>([]);
  const [muatLagi, setMuatLagi] = useState(false);
  const [adaLagi, setAdaLagi] = useState(true);

  // Penapis pelayan: action, actor, tempoh (sinceIso).
  const [tindakan, setTindakan] = useState("");
  const [pelaku, setPelaku] = useState("");
  const [period, setPeriod] = useState<PeriodAudit>("all");
  // Carian sasaran di klien terhadap baris yang sudah dimuat.
  const [q, setQ] = useState("");
  const [dipilih, setDipilih] = useState<number | null>(null);

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [kelas, setKelas] = useState<KelasAdmin[]>([]);
  const [hunts, setHunts] = useState<Hunt[]>([]);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);

  // ===== Muat halaman pertama setiap kali penapis pelayan berubah =====
  useEffect(() => {
    let cancelled = false;
    setMuat(true);
    (async () => {
      try {
        const since = mulaPeriod(period) ?? undefined;
        const data = await adminListAuditLogPaged({
          limit: SEBARIS,
          offset: 0,
          action: tindakan || undefined,
          actorId: pelaku || undefined,
          sinceIso: since || undefined,
        });
        if (cancelled) return;
        setRows(data);
        setAdaLagi(data.length >= SEBARIS);
      } catch {
        if (!cancelled) {
          setRows([]);
          setAdaLagi(false);
        }
      } finally {
        if (!cancelled) setMuat(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tindakan, pelaku, period]);

  // ===== Peta nama untuk pelaku dan sasaran, dimuat sekali =====
  useEffect(() => {
    (async () => {
      try {
        const [p, k, h, c, t] = await Promise.all([
          adminListProfiles(),
          adminListAllClasses(),
          adminListAllHunts(),
          adminListAllChallenges(),
          adminListAllTeams(),
        ]);
        setProfiles(p);
        setKelas((k || []) as KelasAdmin[]);
        setHunts(h);
        setChallenges(c);
        setTeams(t);
      } catch {
        // Peta separa: nama kekal tidak dipetakan, jenis sasaran dipapar.
      }
    })();
  }, []);

  const profById = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);

  const namaPelaku = useMemo(() => {
    const peta: Record<string, string | null> = {};
    for (const p of profiles) peta[p.id] = p.display_name || null;
    return peta;
  }, [profiles]);

  const petaSasaran = useMemo<PetaSasaranAudit>(
    () => ({
      profil: namaPelaku,
      kelas: Object.fromEntries(kelas.map((k) => [k.id, k.name || null])),
      hunt: Object.fromEntries(hunts.map((h) => [h.id, h.title || null])),
      challenge: Object.fromEntries(challenges.map((c) => [c.id, c.title || null])),
      challengeHunt: Object.fromEntries(challenges.map((c) => [c.id, c.hunt_id])),
      team: Object.fromEntries(teams.map((t) => [t.id, t.name || null])),
    }),
    [namaPelaku, kelas, hunts, challenges, teams],
  );

  // Baris yang dipaparkan: carian sasaran di klien sahaja.
  const ditapis = useMemo(
    () => rows.filter((r) => padanCarianSasaran(r, q, petaSasaran, namaPelaku)),
    [rows, q, petaSasaran, namaPelaku],
  );

  const tindakanWujud = useMemo(() => senaraiTindakan(rows), [rows]);
  const pelakuWujud = useMemo(() => senaraiPelaku(rows), [rows]);

  const item = rows.find((r) => r.id === dipilih) || null;
  const sasaranItem = item ? sasaranAudit(item, petaSasaran) : null;

  /** Muat 50 baris berikutnya dengan offset; dilumpuhkan bila halaman pendek. */
  const muatLagiBtn = useCallback(async () => {
    if (muatLagi || !adaLagi) return;
    setMuatLagi(true);
    try {
      const since = mulaPeriod(period) ?? undefined;
      const data = await adminListAuditLogPaged({
        limit: SEBARIS,
        offset: rows.length,
        action: tindakan || undefined,
        actorId: pelaku || undefined,
        sinceIso: since || undefined,
      });
      setRows((lama) => lama.concat(data));
      setAdaLagi(data.length >= SEBARIS);
    } catch {
      setAdaLagi(false);
    } finally {
      setMuatLagi(false);
    }
  }, [muatLagi, adaLagi, period, rows.length, tindakan, pelaku]);

  // Lajur jadual audit; baris terpilih ditandakan pada lajur masa kerana
  // DataTable kit tidak menyokong sorotan baris terpilih.
  const lajur: DataColumn<AuditLogRow>[] = [
    {
      key: "masa",
      header: "Time",
      render: (r) => (
        <span
          title={fmt(r.created_at)}
          className={`text-[13px] whitespace-nowrap ${dipilih === r.id ? "font-bold text-brand-purple" : "text-ink-faint"}`}
        >
          {relTime(r.created_at)}
        </span>
      ),
    },
    {
      key: "pelaku",
      header: "Actor",
      render: (r) => (
        <span className="text-[13px] text-ink truncate block max-w-[140px]">
          {r.actor_id ? profById.get(r.actor_id)?.display_name || "Unnamed user" : "Unknown"}
        </span>
      ),
    },
    {
      key: "tindakan",
      header: "Action",
      render: (r) => {
        const label = labelTindakan(r.action);
        return (
          <Badge variant="dim" warna={TONE_PIL[label.tone]}>
            {label.label}
          </Badge>
        );
      },
    },
    {
      key: "sasaran",
      header: "Target",
      render: (r) => {
        const sasaran = sasaranAudit(r, petaSasaran);
        if (sasaran.nama) {
          return <span className="text-[13px] text-ink truncate block max-w-[180px]">{sasaran.nama}</span>;
        }
        return (
          <span className="text-[13px] text-ink-muted">
            {sasaran.jenis}
            {sasaran.idPendek && (
              <code className="ml-1.5 text-[11px] font-mono text-ink-faint">{sasaran.idPendek}</code>
            )}
          </span>
        );
      },
    },
    {
      key: "alasan",
      header: "Reason",
      hideOnMobile: true,
      render: (r) => (
        <span className="block truncate text-[13px] text-ink-muted max-w-[200px]">{ringkasAlasan(r.meta)}</span>
      ),
    },
  ];

  return (
    <AdminShell>
      <PageHead
        title="Audit log"
        description="Every admin action, who did it and why. Entries can't be edited or deleted."
      />

      <div className="grid lg:grid-cols-5 gap-5 items-start">
        {/* ===== Jadual ===== */}
        <div className="lg:col-span-3">
          {muat ? (
            <Card>
              <p className="text-[14px] text-ink-faint py-8 text-center">Loading...</p>
            </Card>
          ) : (
            <>
              <DataTable
                label="Audit log"
                columns={lajur}
                rows={ditapis}
                rowKey={(r) => String(r.id)}
                onRowClick={(r) => setDipilih(r.id)}
                head={
                  <>
                    <Select
                      value={tindakan}
                      onChange={(e) => setTindakan(e.target.value)}
                      aria-label="Filter by action"
                      className="w-auto"
                    >
                      <option value="">All actions</option>
                      {tindakanWujud.map((a) => (
                        <option key={a} value={a}>
                          {labelTindakan(a).label}
                        </option>
                      ))}
                    </Select>
                    <Select
                      value={pelaku}
                      onChange={(e) => setPelaku(e.target.value)}
                      aria-label="Filter by actor"
                      className="w-auto"
                    >
                      <option value="">All actors</option>
                      {pelakuWujud.map((id) => (
                        <option key={id} value={id}>
                          {profById.get(id)?.display_name || "Unnamed user"}
                        </option>
                      ))}
                    </Select>
                    <Select
                      value={period}
                      onChange={(e) => setPeriod(e.target.value as PeriodAudit)}
                      aria-label="Filter by period"
                      className="w-auto"
                    >
                      <option value="24h">24 hours</option>
                      <option value="7d">7 days</option>
                      <option value="30d">30 days</option>
                      <option value="all">All</option>
                    </Select>
                    <span className="w-full sm:w-56">
                      <Input
                        ikonKiri={<Search className="w-4 h-4" />}
                        placeholder="Search target, id or actor"
                        aria-label="Search audit entries"
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                      />
                    </span>
                  </>
                }
                empty={
                  <EmptyState
                    icon={<ScrollText className="w-6 h-6" />}
                    title="No entries match"
                    text="Try different filters."
                  />
                }
              />

              {!muat && adaLagi && ditapis.length > 0 && (
                <div className="mt-4 text-center">
                  <Button variant="outline" disabled={muatLagi} onClick={muatLagiBtn}>
                    {muatLagi ? "Loading..." : "Load more"}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>

        {/* ===== Panel kanan butiran ===== */}
        <div className="lg:col-span-2">
          {!item ? (
            <Card>
              <EmptyState
                icon={<History className="w-6 h-6" />}
                title="Select an entry"
                text="Click a row to see the full event."
              />
            </Card>
          ) : (
            <Card className="lg:sticky lg:top-20">
              <CardHead title="Event details" />

              <div className="mt-4 space-y-4 text-[14px]">
                <div>
                  <div className="text-[11px] font-medium uppercase tracking-[2.2px] text-ink-faint">Actor</div>
                  {item.actor_id ? (
                    <Link
                      href={`/admin/users/${item.actor_id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="text-ink font-medium hover:text-brand-purple"
                    >
                      {profById.get(item.actor_id)?.display_name || "Unnamed user"}
                    </Link>
                  ) : (
                    <div className="text-ink-muted">Unknown</div>
                  )}
                </div>

                <div>
                  <div className="text-[11px] font-medium uppercase tracking-[2.2px] text-ink-faint">Time</div>
                  <div className="text-ink">{fmt(item.created_at)}</div>
                </div>

                <div>
                  <div className="text-[11px] font-medium uppercase tracking-[2.2px] text-ink-faint">Action</div>
                  <div className="mt-1">
                    <Badge variant="dim" warna={TONE_PIL[labelTindakan(item.action).tone]}>
                      {labelTindakan(item.action).label}
                    </Badge>
                  </div>
                </div>

                {sasaranItem && (
                  <div>
                    <div className="text-[11px] font-medium uppercase tracking-[2.2px] text-ink-faint">Target</div>
                    {sasaranItem.nama ? (
                      sasaranItem.href ? (
                        <Link
                          href={sasaranItem.href}
                          onClick={(e) => e.stopPropagation()}
                          className="text-ink font-medium hover:text-brand-purple break-words"
                        >
                          {sasaranItem.nama}
                        </Link>
                      ) : (
                        <div className="text-ink font-medium break-words">{sasaranItem.nama}</div>
                      )
                    ) : (
                      <div className="text-ink-muted">
                        {sasaranItem.jenis}
                        {sasaranItem.idPendek && (
                          <code className="ml-1.5 text-[11px] font-mono text-ink-faint">{sasaranItem.idPendek}</code>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <div className="text-[11px] font-medium uppercase tracking-[2.2px] text-ink-faint">Reason</div>
                  <div className="text-ink whitespace-pre-wrap break-words">
                    {alasanAudit(item.meta) || "(none)"}
                  </div>
                </div>

                {bezaAudit(item.meta).length > 0 && (
                  <div>
                    <div className="text-[11px] font-medium uppercase tracking-[2.2px] text-ink-faint mb-1.5">Changes</div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-[12px]">
                        <thead>
                          <tr className="text-left text-ink-faint border-b border-kz-line">
                            <th className="py-1.5 pr-3 font-medium">Field</th>
                            <th className="py-1.5 pr-3 font-medium">Before</th>
                            <th className="py-1.5 font-medium">After</th>
                          </tr>
                        </thead>
                        <tbody>
                          {bezaAudit(item.meta).map((b) => (
                            <tr key={b.key} className="border-b border-kz-line last:border-b-0">
                              <td className="py-1.5 pr-3 text-ink-muted">{b.key}</td>
                              <td className="py-1.5 pr-3 text-ink-muted break-words">{b.before}</td>
                              <td className="py-1.5 text-ink font-medium break-words">{b.after}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <details className="border-t border-kz-line pt-3">
                  <summary className="text-[12px] font-medium text-ink-muted cursor-pointer">Raw data</summary>
                  <pre className="mt-2 text-[11px] font-mono text-ink-muted whitespace-pre-wrap break-words bg-canvas rounded-[4px] p-3 overflow-x-auto">
                    {jsonRawat(item.meta)}
                  </pre>
                </details>
              </div>
            </Card>
          )}
        </div>
      </div>
    </AdminShell>
  );
}
