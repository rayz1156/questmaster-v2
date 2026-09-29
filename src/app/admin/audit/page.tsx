"use client";

// Audit log ruang kerja admin (V2-011c). Jadual dengan penapis Action,
// Actor, Period dan carian sasaran; klik baris membuka panel kanan
// Event details dengan beza before/after dan raw data. Muat 50 baris
// serentak dengan butang Load more (offset adminListAuditLogPaged).
// Log ini tambah sahaja: tiada butang sunting atau padam di sini.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import AdminShell from "@/components/admin/AdminShell";
import { Card, Pill, EmptyState, relTime } from "@/components/admin/ui";
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

/** Nada audit admin kepada nada Pill. */
const TONE_PIL: Record<AuditTone, "green" | "yellow" | "red" | "gray"> = {
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

  return (
    <AdminShell title="Audit log">
      <p className="text-ink-muted text-sm mb-6">
        Every admin action, who did it and why. Entries can&apos;t be edited or deleted.
      </p>

      {/* ===== Penapis ===== */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <select
          value={tindakan}
          onChange={(e) => setTindakan(e.target.value)}
          className="h-10 rounded-xl bg-white border border-hairline px-3 text-sm text-ink"
          aria-label="Filter by action"
        >
          <option value="">All actions</option>
          {tindakanWujud.map((a) => (
            <option key={a} value={a}>
              {labelTindakan(a).label}
            </option>
          ))}
        </select>
        <select
          value={pelaku}
          onChange={(e) => setPelaku(e.target.value)}
          className="h-10 rounded-xl bg-white border border-hairline px-3 text-sm text-ink"
          aria-label="Filter by actor"
        >
          <option value="">All actors</option>
          {pelakuWujud.map((id) => (
            <option key={id} value={id}>
              {profById.get(id)?.display_name || "Unnamed user"}
            </option>
          ))}
        </select>
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value as PeriodAudit)}
          className="h-10 rounded-xl bg-white border border-hairline px-3 text-sm text-ink"
          aria-label="Filter by period"
        >
          <option value="24h">24 hours</option>
          <option value="7d">7 days</option>
          <option value="30d">30 days</option>
          <option value="all">All</option>
        </select>
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-faint" />
          <input
            className="w-full h-10 pl-9 pr-3 rounded-xl bg-white border border-hairline text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-brand-purple/30"
            placeholder="Search target, id or actor"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>

      <div className="grid lg:grid-cols-5 gap-4 items-start">
        {/* ===== Jadual ===== */}
        <Card className="lg:col-span-3 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-ink-faint border-b border-hairline">
                  <th className="px-4 py-3 font-medium">Time</th>
                  <th className="px-4 py-3 font-medium">Actor</th>
                  <th className="px-4 py-3 font-medium">Action</th>
                  <th className="px-4 py-3 font-medium">Target</th>
                  <th className="px-4 py-3 font-medium">Reason</th>
                </tr>
              </thead>
              <tbody>
                {ditapis.map((r) => {
                  const label = labelTindakan(r.action);
                  const sasaran = sasaranAudit(r, petaSasaran);
                  return (
                    <tr
                      key={r.id}
                      onClick={() => setDipilih(r.id)}
                      className={`border-b border-hairline last:border-b-0 cursor-pointer transition ${
                        dipilih === r.id ? "bg-[#F1EEFC]" : "hover:bg-[#F7F7F9]"
                      }`}
                    >
                      <td className="px-4 py-3 text-ink-muted whitespace-nowrap" title={fmt(r.created_at)}>
                        {relTime(r.created_at)}
                      </td>
                      <td className="px-4 py-3 text-ink truncate max-w-[140px]">
                        {r.actor_id ? profById.get(r.actor_id)?.display_name || "Unnamed user" : "Unknown"}
                      </td>
                      <td className="px-4 py-3">
                        <Pill tone={TONE_PIL[label.tone]}>{label.label}</Pill>
                      </td>
                      <td className="px-4 py-3 max-w-[180px]">
                        {sasaran.nama ? (
                          <span className="text-ink truncate block">{sasaran.nama}</span>
                        ) : (
                          <span className="text-ink-muted">
                            {sasaran.jenis}
                            {sasaran.idPendek && (
                              <code className="ml-1.5 text-[11px] font-mono text-ink-faint">{sasaran.idPendek}</code>
                            )}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-ink-muted max-w-[200px]">
                        <span className="block truncate">{ringkasAlasan(r.meta)}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {muat ? (
            <div className="text-sm text-ink-faint py-8 text-center">Loading...</div>
          ) : (
            ditapis.length === 0 && <EmptyState title="No entries match." body="Try different filters." />
          )}

          {!muat && adaLagi && ditapis.length > 0 && (
            <div className="px-4 py-3 border-t border-hairline text-center">
              <button
                type="button"
                disabled={muatLagi}
                onClick={muatLagiBtn}
                className="bg-white border border-hairline rounded-xl px-4 py-2 text-sm font-medium text-ink hover:bg-[#F7F7F9] disabled:opacity-40"
              >
                {muatLagi ? "Loading..." : "Load more"}
              </button>
            </div>
          )}
        </Card>

        {/* ===== Panel kanan butiran ===== */}
        <div className="lg:col-span-2">
          {!item ? (
            <Card>
              <EmptyState title="Select an entry." body="Click a row to see the full event." />
            </Card>
          ) : (
            <Card className="lg:sticky lg:top-20 p-4">
              <div className="text-sm font-semibold text-ink mb-3">Event details</div>

              <div className="space-y-3 text-sm">
                <div>
                  <div className="text-xs font-medium uppercase tracking-wide text-ink-faint">Actor</div>
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
                  <div className="text-xs font-medium uppercase tracking-wide text-ink-faint">Time</div>
                  <div className="text-ink">{fmt(item.created_at)}</div>
                </div>

                <div>
                  <div className="text-xs font-medium uppercase tracking-wide text-ink-faint">Action</div>
                  <div className="mt-1">
                    <Pill tone={TONE_PIL[labelTindakan(item.action).tone]}>{labelTindakan(item.action).label}</Pill>
                  </div>
                </div>

                {sasaranItem && (
                  <div>
                    <div className="text-xs font-medium uppercase tracking-wide text-ink-faint">Target</div>
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
                  <div className="text-xs font-medium uppercase tracking-wide text-ink-faint">Reason</div>
                  <div className="text-ink whitespace-pre-wrap break-words">
                    {alasanAudit(item.meta) || "(none)"}
                  </div>
                </div>

                {bezaAudit(item.meta).length > 0 && (
                  <div>
                    <div className="text-xs font-medium uppercase tracking-wide text-ink-faint mb-1">Changes</div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-left text-ink-faint border-b border-hairline">
                            <th className="py-1.5 pr-3 font-medium">Field</th>
                            <th className="py-1.5 pr-3 font-medium">Before</th>
                            <th className="py-1.5 font-medium">After</th>
                          </tr>
                        </thead>
                        <tbody>
                          {bezaAudit(item.meta).map((b) => (
                            <tr key={b.key} className="border-b border-hairline last:border-b-0">
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

                <details className="border-t border-hairline pt-3">
                  <summary className="text-xs font-medium text-ink-muted cursor-pointer">Raw data</summary>
                  <pre className="mt-2 text-[11px] font-mono text-ink-muted whitespace-pre-wrap break-words bg-[#F7F7F9] rounded-xl p-3 overflow-x-auto">
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
