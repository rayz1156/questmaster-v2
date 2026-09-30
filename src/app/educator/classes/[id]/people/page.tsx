"use client";

/**
 * People: pelajar, kumpulan dan pendidik sesebuah kelas dalam satu tempat.
 *
 * Sebelum ini ketiga-tiganya berselerak: ahli pada halaman kelas, kumpulan
 * pada skrin global berasingan, pendidik dalam kad di bawah. Orang ialah
 * satu idea, jadi ia satu skrin dengan tiga sub-tab.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ChevronDown, ChevronUp, Download, Search, Upload, Users, X } from "lucide-react";
import Shell from "@/components/Shell";
import ClassShell from "@/components/ClassShell";
import EducatorsCard from "@/components/EducatorsCard";
import EmailExportButton from "@/components/EmailExportButton";
import { EDU_TABS } from "@/lib/eduTabs";
import { listClassMembers, listTeamsByClass, listClassTeamScores, listClassIndividualScores, type ClassIndividualScore } from "@/lib/data";
import { namaAhli } from "@/lib/namaAhli";
import { formatMata, kiraKedudukan } from "@/lib/markahPeserta";
import { supabase } from "@/lib/supabase";

type Sub = "students" | "teams" | "educators";

/** Markah peserta daripada GET /api/classes/[id]/members/[userId]/scores. */
type MarkahPeserta = {
  name: string;
  totals: { task: number; live: number; adjustment: number; total: number; rank: number; liveSessions: number };
  activities: { huntId: string; title: string; approvedPoints: number; approvedCount: number; pendingCount: number }[];
  liveQuizzes: { sessionId: string; quizTitle: string; playedAt: string; score: number; correct: number; answered: number }[];
  adjustments: { delta: number; reason: string | null; createdAt: string }[];
};

/** Tarikh pendek untuk senarai dalam laci; kosong jika tidak sah. */
function tarikhPendek(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/** Kad pecahan markah kecil (Activities, Live Quiz, Adjustments). */
function KadPecahan({ label, nilai }: { label: string; nilai: string }) {
  return (
    <div className="bg-[#FAFAFB] border border-hairline rounded-xl p-3">
      <div className="text-xs text-ink-faint">{label}</div>
      <div className="text-[15px] font-semibold text-ink tabular-nums mt-0.5">{nilai}</div>
    </div>
  );
}

/**
 * Laci butiran markah seorang peserta (V2-013). Lebar 420px pada skrin
 * besar, penuh pada telefon. Tutup dengan Esc, klik luar atau butang X;
 * fokus dikunci dalam laci supaya papan kekunci tidak keluar ke latar.
 */
function LaciMarkah({
  classId,
  userId,
  nama,
  jumlahAhli,
  tutup,
}: {
  classId: string;
  userId: string;
  nama: string;
  jumlahAhli: number;
  tutup: () => void;
}) {
  const [data, setData] = useState<MarkahPeserta | null>(null);
  const [ralat, setRalat] = useState<string | null>(null);
  const [muat, setMuat] = useState(true);
  const panelRef = useRef<HTMLDivElement>(null);
  const butangTutupRef = useRef<HTMLButtonElement>(null);

  // Muat data markah setiap kali laci dibuka untuk peserta baharu.
  useEffect(() => {
    let alive = true;
    setMuat(true);
    setRalat(null);
    setData(null);
    (async () => {
      try {
        const { data: ses } = await supabase.auth.getSession();
        const res = await fetch(`/api/classes/${classId}/members/${userId}/scores`, {
          headers: ses.session ? { Authorization: `Bearer ${ses.session.access_token}` } : {},
          cache: "no-store",
        });
        const j = await res.json().catch(() => null);
        if (!res.ok) {
          if (alive) setRalat(j?.error || "Could not load scores.");
          return;
        }
        if (alive) setData(j as MarkahPeserta);
      } catch {
        if (alive) setRalat("Could not load scores.");
      } finally {
        if (alive) setMuat(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [classId, userId]);

  // Esc menutup laci; Tab berpusing dalam laci sahaja (perangkap fokus).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        tutup();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const boleh = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'button, a, input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (boleh.length === 0) return;
      const pertama = boleh[0];
      const akhir = boleh[boleh.length - 1];
      if (e.shiftKey && document.activeElement === pertama) {
        e.preventDefault();
        akhir.focus();
      } else if (!e.shiftKey && document.activeElement === akhir) {
        e.preventDefault();
        pertama.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    butangTutupRef.current?.focus();
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [tutup]);

  const jumlah = data?.totals.total ?? 0;

  return (
    <div className="fixed inset-0 z-50">
      {/* Latar klik luar menutup laci. */}
      <div className="absolute inset-0 bg-black/40" onClick={tutup} aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`${nama} scores`}
        className="absolute right-0 top-0 h-full w-full sm:w-[420px] bg-white border-l border-hairline shadow-raised flex flex-col"
      >
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-hairline">
          <div className="min-w-0">
            <div className="text-[17px] font-semibold text-ink truncate">{nama}</div>
            {data && (
              <div className="text-sm text-ink-muted mt-0.5">
                Rank {data.totals.rank} of {jumlahAhli}
              </div>
            )}
          </div>
          <button
            ref={butangTutupRef}
            type="button"
            onClick={tutup}
            aria-label="Close"
            className="w-9 h-9 rounded-xl border border-hairline flex items-center justify-center text-ink-muted hover:text-ink shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
          {muat && (
            <div className="space-y-3">
              <div className="h-9 w-2/3 rounded-lg bg-[#EDEEF2] animate-pulse" />
              <div className="h-24 rounded-xl bg-[#EDEEF2] animate-pulse" />
              <div className="h-32 rounded-xl bg-[#EDEEF2] animate-pulse" />
            </div>
          )}

          {!muat && ralat && <div className="text-sm text-red-600">{ralat}</div>}

          {!muat && data && (
            <>
              <div>
                <div className="text-xs text-ink-faint">Total</div>
                <div className="text-3xl font-semibold text-brand-purple tabular-nums mt-1">
                  {formatMata(jumlah)}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <KadPecahan label="Activities" nilai={formatMata(data.totals.task)} />
                <KadPecahan label="Live Quiz" nilai={formatMata(data.totals.live)} />
                <KadPecahan label="Adjustments" nilai={formatMata(data.totals.adjustment)} />
              </div>

              <div>
                <div className="section-title text-sm mb-2">Activities</div>
                {data.activities.length === 0 ? (
                  <p className="text-sm text-ink-muted">No activities yet.</p>
                ) : (
                  <ul className="divide-y divide-hairline border border-hairline rounded-xl">
                    {data.activities.map((a) => (
                      <li key={a.huntId} className="px-4 py-3 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm text-ink truncate">{a.title}</div>
                          <div className="text-xs text-ink-faint mt-0.5">
                            {a.approvedCount} approved, {a.pendingCount} pending
                          </div>
                        </div>
                        <div className="text-sm font-semibold text-ink tabular-nums shrink-0">
                          {formatMata(a.approvedPoints)}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <div className="section-title text-sm mb-2">Live Quiz</div>
                {data.liveQuizzes.length === 0 ? (
                  <p className="text-sm text-ink-muted">No live quizzes yet.</p>
                ) : (
                  <ul className="divide-y divide-hairline border border-hairline rounded-xl">
                    {data.liveQuizzes.map((lq) => (
                      <li key={lq.sessionId} className="px-4 py-3 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm text-ink truncate">{lq.quizTitle}</div>
                          <div className="text-xs text-ink-faint mt-0.5">
                            {tarikhPendek(lq.playedAt)}
                            {lq.answered > 0 ? ` · ${lq.correct}/${lq.answered} correct` : ""}
                          </div>
                        </div>
                        <div className="text-sm font-semibold text-ink tabular-nums shrink-0">
                          {formatMata(lq.score)}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {data.adjustments.length > 0 && (
                <div>
                  <div className="section-title text-sm mb-2">Adjustments</div>
                  <ul className="divide-y divide-hairline border border-hairline rounded-xl">
                    {data.adjustments.map((adj, i) => (
                      <li key={i} className="px-4 py-3 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm text-ink truncate">{adj.reason || "Adjustment"}</div>
                          <div className="text-xs text-ink-faint mt-0.5">{tarikhPendek(adj.createdAt)}</div>
                        </div>
                        <div
                          className={`text-sm font-semibold tabular-nums shrink-0 ${adj.delta < 0 ? "text-red-600" : "text-ink"}`}
                        >
                          {formatMata(adj.delta)}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Baris tunggu yang belum tuntut, dipaparkan dengan label pending. */
type InviteRow = { id: string; team_id: string; email: string; nama: string | null; role: string };

/** Pratonton import daripada POST /api/classes/[id]/teams/import-csv?dryRun=1 */
type TeamImportPreview = {
  ok: boolean;
  dry_run: boolean;
  teams_created: number;
  teams_reused: number;
  joined_now: number;
  pending: number;
  teams: { name: string; action: string; members: number }[];
  emails: { email: string; team: string; action: string }[];
  warnings: { team?: string; message: string }[];
  errors?: { row: number; message: string }[];
};

const PALETTE = [
  "bg-[#EAE6FC] text-[#5B42C4]",
  "bg-[#E4EEFD] text-[#2B5FBF]",
  "bg-[#FDE9E4] text-[#B4552F]",
  "bg-[#E3F5EA] text-[#2E7D4F]",
  "bg-[#FCE8F1] text-[#A83E6E]",
  "bg-[#FBF0DC] text-[#96661A]",
];

function initials(name: string): string {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function ClassPeoplePage() {
  const { id } = useParams<{ id: string }>() as { id: string };
  const [sub, setSub] = useState<Sub>("students");
  const [members, setMembers] = useState<Record<string, unknown>[]>([]);
  const [teams, setTeams] = useState<Record<string, unknown>[]>([]);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [q, setQ] = useState("");
    // V2-013: markah individu daripada view qm_class_individual_scores dan
    // laci butiran markah peserta. Susunan jadual: nama (lalai A-Z) atau
    // jumlah markah, boleh ditukar arah dengan klik kepala lajur.
    const [markahInd, setMarkahInd] = useState<ClassIndividualScore[]>([]);
    const [urut, setUrut] = useState<{ kunci: "nama" | "jumlah"; arah: 1 | -1 }>({ kunci: "nama", arah: 1 });
    const [laciUser, setLaciUser] = useState<{ id: string; nama: string } | null>(null);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);
    // Import kumpulan melalui CSV.
    const [invites, setInvites] = useState<InviteRow[]>([]);
    const [preview, setPreview] = useState<TeamImportPreview | null>(null);
    const [previewErrors, setPreviewErrors] = useState<{ row: number; message: string }[]>([]);
    const [replace, setReplace] = useState(false);
    const [importBusy, setImportBusy] = useState(false);
    const [importErr, setImportErr] = useState<string | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    // Eksport CSV peserta (V2-010): muat turun fail daripada laluan export.
    const [exportBusy, setExportBusy] = useState(false);
    const [exportErr, setExportErr] = useState<string | null>(null);
    const eksportCsv = async () => {
        setExportErr(null);
        setExportBusy(true);
        try {
            const { data: ses } = await supabase.auth.getSession();
            const res = await fetch(`/api/classes/${id}/members/export`, {
                headers: ses.session ? { Authorization: `Bearer ${ses.session.access_token}` } : {},
                cache: "no-store",
            });
            if (!res.ok) {
                let msg = "Export failed.";
                try {
                    const j = await res.json();
                    if (j?.error) msg = j.error;
                } catch { /* badan bukan JSON: guna mesej lalai */ }
                setExportErr(msg);
                return;
            }
            // Nama fail diambil daripada content-disposition pelayan supaya
            // slug nama kelas dikira satu tempat sahaja.
            const blob = await res.blob();
            const cd = res.headers.get("content-disposition") || "";
            const m = /filename="([^"]+)"/.exec(cd);
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = m ? m[1] : "kuizen-participants.csv";
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        } catch {
            setExportErr("Export failed.");
        } finally {
            setExportBusy(false);
        }
    };

    // Muat semula senarai kumpulan dan baris tunggu selepas import.
    const loadTeams = async () => {
      const [ts, iv] = await Promise.all([
        listTeamsByClass(id),
        supabase
          .from("qm_team_invites")
          .select("id, team_id, email, nama, role")
          .eq("class_id", id)
          .is("claimed_at", null),
      ]);
      setTeams((ts || []) as Record<string, unknown>[]);
      setInvites((iv.data || []) as InviteRow[]);
    };

    useEffect(() => {
      if (!id) return;
      let alive = true;
      (async () => {
        try {
          const [ms, ts, ss, iv, mi] = await Promise.all([
            listClassMembers(id),
            listTeamsByClass(id),
            listClassTeamScores(id).catch(() => []),
            supabase
              .from("qm_team_invites")
              .select("id, team_id, email, nama, role")
              .eq("class_id", id)
              .is("claimed_at", null),
            // View ditapis oleh migrasi 0050: educator kelas sahaja nampak
            // markah kelasnya. Kegagalan (mis. skema belum dimuat semula)
            // tidak merosakkan halaman; lajur markah jatuh kepada 0.
            listClassIndividualScores(id).catch(() => []),
          ]);
          if (!alive) return;
          setMembers((ms || []) as Record<string, unknown>[]);
          setTeams((ts || []) as Record<string, unknown>[]);
          setInvites((iv.data || []) as InviteRow[]);
          setMarkahInd((mi || []) as ClassIndividualScore[]);
          const map: Record<string, number> = {};
          for (const s of ss || []) map[s.team_id] = Number(s.total_score) || 0;
          setScores(map);
        } catch (e) {
          if (alive) setErr(e instanceof Error ? e.message : "Could not load this class.");
        } finally {
          if (alive) setLoading(false);
        }
      })();
      return () => { alive = false; };
    }, [id]);

    // Baca fail CSV, hantar untuk pratonton (dryRun=1) atau import sebenar.
    const runImport = async (file: File, confirm: boolean) => {
      setImportErr(null);
      setImportBusy(true);
      try {
        const content = await file.text();
        const { data: ses } = await supabase.auth.getSession();
        const res = await fetch(`/api/classes/${id}/teams/import-csv${confirm ? "" : "?dryRun=1"}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(ses.session ? { Authorization: `Bearer ${ses.session.access_token}` } : {}),
          },
          body: JSON.stringify({ content, replace }),
        });
        const data = await res.json();
        if (!res.ok) {
          if (Array.isArray(data.errors) && data.errors.length > 0) {
            setPreviewErrors(data.errors);
            setPreview(null);
          } else {
            setImportErr(data.error || "Import failed.");
          }
          return;
        }
        setPreviewErrors([]);
        if (confirm) {
          setPreview(null);
          if (fileRef.current) fileRef.current.value = "";
          await loadTeams();
        } else {
          setPreview(data as TeamImportPreview);
        }
      } catch (e) {
        setImportErr(e instanceof Error ? e.message : "Import failed.");
      } finally {
        setImportBusy(false);
      }
    };

  // Tiket V2-007: nama daripada m.qm_profiles (display_name, kemudian emel
  // sebelum @, kemudian "Student"). UUID tidak boleh dipaparkan sebagai nama.
  const name = (m: Record<string, unknown>) => namaAhli(m);

  // V2-013: peta markah per user_id. Pecahan datang daripada view; kedudukan
  // (seri berkongsi kedudukan) dikira sekali di sini dengan kiraKedudukan.
  const petaMarkah = useMemo(() => {
    const kedudukan = kiraKedudukan(markahInd.map((b) => Number(b.total_score) || 0));
    const peta = new Map<
      string,
      { task: number; live: number; adj: number; jumlah: number; kedudukan: number }
    >();
    markahInd.forEach((b, i) => {
      peta.set(String(b.user_id), {
        task: Number(b.task_score) || 0,
        live: Number(b.live_score) || 0,
        adj: Number(b.adjustment_score) || 0,
        jumlah: Number(b.total_score) || 0,
        kedudukan: kedudukan[i] || 0,
      });
    });
    return peta;
  }, [markahInd]);

  // Baris ahli bergabung dengan markah, ditapis ikut carian dan disusun
  // ikut kunci kepala lajur (nama lalai A-Z, atau jumlah markah).
  const barisAhli = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const asas = needle
      ? members.filter((m) => name(m).toLowerCase().includes(needle))
      : members;
    const baris = asas.map((m) => {
      const mk = petaMarkah.get(String(m.user_id || ""));
      return { m, mk };
    });
    baris.sort((a, b) => {
      if (urut.kunci === "jumlah") {
        const ja = a.mk?.jumlah ?? 0;
        const jb = b.mk?.jumlah ?? 0;
        if (ja !== jb) return urut.arah === 1 ? ja - jb : jb - ja;
      }
      const ka = name(a.m).toLowerCase();
      const kb = name(b.m).toLowerCase();
      const banding = ka < kb ? -1 : ka > kb ? 1 : 0;
      return urut.kunci === "nama" ? banding * urut.arah : banding;
    });
    return baris;
  }, [members, q, urut, petaMarkah]);

  const shownTeams = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return teams;
    return teams.filter((t) => String(t.name || "").toLowerCase().includes(needle));
  }, [teams, q]);

  const SubTab = ({ k, label, count }: { k: Sub; label: string; count?: number }) => (
    <button
      onClick={() => setSub(k)}
      className={`relative pb-2.5 px-1 text-[15px] transition ${
        sub === k ? "text-ink font-semibold" : "text-ink-muted hover:text-ink font-medium"
      }`}
    >
      {label}
      {typeof count === "number" && (
        <span className="ml-1.5 text-xs text-ink-faint font-medium">{count}</span>
      )}
      {sub === k && <span className="absolute left-0 right-0 -bottom-px h-[2px] bg-ink rounded-full" />}
    </button>
  );

  return (
    <Shell tabs={EDU_TABS}>
      <ClassShell classId={id} current="people">
        <div className="flex items-end justify-between gap-4 flex-wrap mb-5">
          <div className="flex items-center gap-6 border-b border-hairline w-full sm:w-auto">
            <SubTab k="students" label="Students" count={members.length} />
            <SubTab k="teams" label="Teams" count={teams.length} />
            <SubTab k="educators" label="Educators" />
          </div>

          <div className="flex items-center gap-3">
            {sub !== "educators" && (
              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 text-ink-faint absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  className="input pl-9"
                  placeholder={sub === "students" ? "Search people..." : "Search teams..."}
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </div>
            )}
            {sub === "students" && (
              <button
                type="button"
                onClick={eksportCsv}
                disabled={exportBusy}
                className="btn-quiet text-brand-purple inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                <Download className="w-4 h-4" /> {exportBusy ? "Exporting..." : "Export CSV"}
              </button>
            )}
            <EmailExportButton classId={id} />
          </div>
        </div>

        {err && <div className="text-sm text-red-600 mb-4">{err}</div>}
        {exportErr && <div className="text-sm text-red-600 mb-4">{exportErr}</div>}
        {loading && <p className="text-sm text-ink-muted">Loading…</p>}

        {!loading && sub === "students" && (
          barisAhli.length === 0 ? (
            <div className="surface py-16 text-center">
              <div className="w-14 h-14 rounded-full bg-[#EAE6FC] flex items-center justify-center mx-auto mb-4">
                <Users className="w-6 h-6 text-brand-purple" />
              </div>
              <div className="section-title mb-1">Your class starts with people.</div>
              <p className="text-sm text-ink-muted">
                Share your class code to welcome your first students.
              </p>
            </div>
          ) : (
            <div className="surface">
              <div className="grid grid-cols-[1fr,96px,84px] sm:grid-cols-[1fr,120px,96px,88px,88px,88px,52px] gap-3 sm:gap-4 px-5 py-3 bg-[#FAFAFB] items-center">
                {/* Kepala boleh diklik untuk menyusun: Name (A-Z lalai) dan Total. */}
                <button
                  type="button"
                  onClick={() =>
                    setUrut((u) =>
                      u.kunci === "nama"
                        ? { kunci: "nama", arah: u.arah === 1 ? -1 : 1 }
                        : { kunci: "nama", arah: 1 },
                    )
                  }
                  className="t-head inline-flex items-center gap-1 hover:text-ink"
                >
                  Name
                  {urut.kunci === "nama" &&
                    (urut.arah === 1 ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />)}
                </button>
                <div className="t-head hidden sm:block">Status</div>
                <div className="t-head">Joined</div>
                <div className="t-head hidden sm:block text-right">Activities</div>
                <div className="t-head hidden sm:block text-right">Live Quiz</div>
                <button
                  type="button"
                  onClick={() =>
                    setUrut((u) =>
                      u.kunci === "jumlah"
                        ? { kunci: "jumlah", arah: u.arah === 1 ? -1 : 1 }
                        : { kunci: "jumlah", arah: -1 },
                    )
                  }
                  className="t-head inline-flex items-center gap-1 justify-end hover:text-ink"
                >
                  Total
                  {urut.kunci === "jumlah" &&
                    (urut.arah === 1 ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />)}
                </button>
                <div className="t-head hidden sm:block text-right">Rank</div>
              </div>
              {barisAhli.map(({ m, mk }, i) => {
                const jumlah = mk?.jumlah ?? 0;
                const uid = String(m.user_id || "");
                // Peserta tanpa markah papar 0 dengan warna pudar.
                const pudar = "text-ink-faint";
                return (
                  <div
                    key={uid || i}
                    className="t-row grid grid-cols-[1fr,96px,84px] sm:grid-cols-[1fr,120px,96px,88px,88px,88px,52px] gap-3 sm:gap-4 px-5 py-3.5 items-center"
                  >
                    <div className="min-w-0">
                      <button
                        type="button"
                        onClick={() => setLaciUser({ id: uid, nama: name(m) })}
                        aria-label={`Open scores for ${name(m)}`}
                        className="flex items-center gap-3 min-w-0 text-left group"
                      >
                        <span className={`w-9 h-9 rounded-full text-[12px] font-semibold flex items-center justify-center shrink-0 ${PALETTE[i % PALETTE.length]}`}>
                          {initials(name(m))}
                        </span>
                        <span className="text-[15px] text-ink truncate group-hover:text-brand-purple group-hover:underline underline-offset-2">
                          {name(m)}
                        </span>
                      </button>
                    </div>
                    <div className="hidden sm:flex items-center gap-2 text-sm text-ink-muted">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#4BA972]" /> Active
                    </div>
                    <div className="text-sm text-ink-muted">
                      {m.joined_at
                        ? new Date(String(m.joined_at)).toLocaleDateString(undefined, { day: "numeric", month: "short" })
                        : ","}
                    </div>
                    <div className={`hidden sm:block text-right text-sm tabular-nums ${mk && mk.task > 0 ? "text-ink" : pudar}`}>
                      {formatMata(mk?.task ?? 0)}
                    </div>
                    <div className={`hidden sm:block text-right text-sm tabular-nums ${mk && mk.live > 0 ? "text-ink" : pudar}`}>
                      {formatMata(mk?.live ?? 0)}
                    </div>
                    <div className={`text-right text-[15px] font-medium tabular-nums ${jumlah > 0 ? "text-ink" : pudar}`}>
                      {formatMata(jumlah)}
                    </div>
                    <div className="hidden sm:block text-right text-sm tabular-nums text-ink-faint">
                      {mk?.kedudukan ?? ""}
                    </div>
                  </div>
                );
              })}
              <div className="px-5 py-3 border-t border-hairline text-xs text-ink-faint">
                {barisAhli.length} of {members.length}
              </div>
            </div>
          )
        )}

        {!loading && sub === "teams" && (
          <>
            <div className="flex items-center gap-2 flex-wrap mb-4">
              <a
                href={`/api/classes/${id}/teams/template`}
                className="btn-quiet text-brand-purple inline-flex items-center gap-1.5"
              >
                <Download className="w-4 h-4" /> Download template
              </a>
              <button
                type="button"
                className="btn-quiet text-brand-purple inline-flex items-center gap-1.5 disabled:opacity-50"
                disabled={importBusy}
                onClick={() => fileRef.current?.click()}
              >
                <Upload className="w-4 h-4" /> Upload CSV
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) runImport(f, false);
                }}
              />
            </div>

            {importErr && (
              <div className="surface px-5 py-4 mb-4 text-sm text-red-600">{importErr}</div>
            )}

            {previewErrors.length > 0 && (
              <div className="surface px-5 py-4 mb-4">
                <div className="section-title mb-2 text-sm">
                  Nothing was imported. Fix the rows below and upload again.
                </div>
                <ul className="text-sm text-red-600 space-y-1">
                  {previewErrors.map((e, i) => (
                    <li key={i}>
                      {e.row > 0 ? `Row ${e.row}: ` : ""}
                      {e.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {preview && (
              <div className="surface px-5 py-4 mb-4">
                <div className="section-title mb-2 text-sm">Preview</div>
                <div className="text-sm text-ink-muted mb-3">
                  {preview.teams_created + preview.teams_reused} teams
                  {" ("}{preview.teams_created} new, {preview.teams_reused} reused{")"},{" "}
                  {" | "}{preview.joined_now} will join now, {preview.pending} waiting for sign-up
                </div>
                <ul className="text-sm space-y-1 mb-2">
                  {preview.teams.map((t, i) => (
                    <li key={i}>
                      <span className="text-ink">{t.name}</span>{" "}
                      <span className={`ml-1 px-1.5 py-0.5 rounded-full text-xs ${t.action === "create" ? "bg-[#EAE6FC] text-[#5B42C4]" : "bg-[#E4EEFD] text-[#2B5FBF]"}`}>
                        {t.action === "create" ? "will be created" : "reused"}
                      </span>
                    </li>
                  ))}
                </ul>
                <ul className="text-sm space-y-1 mb-3">
                  {preview.emails.map((m, i) => (
                    <li key={i}>
                      <span className="text-ink">{m.email}</span>{" "}
                      {m.action === "join" ? (
                        <span className="ml-1 px-1.5 py-0.5 rounded-full text-xs bg-[#E3F5EA] text-[#2E7D4F]">
                          joins {m.team} now
                        </span>
                      ) : (
                        <span className="ml-1 px-1.5 py-0.5 rounded-full text-xs bg-[#FBF0DC] text-[#96661A]">
                          waiting for sign-up ({m.team})
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
                {preview.warnings.length > 0 && (
                  <ul className="text-sm text-ink-muted space-y-1 mb-3">
                    {preview.warnings.map((w, i) => (
                      <li key={i}>{w.message}</li>
                    ))}
                  </ul>
                )}
                <div className="flex items-center gap-4 flex-wrap">
                  <label className="text-sm text-ink-muted inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={replace}
                      onChange={(e) => setReplace(e.target.checked)}
                      className="accent-[#5B42C4]"
                    />
                    Replace existing groups
                  </label>
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={importBusy}
                    onClick={() => {
                      if (fileRef.current?.files?.[0]) runImport(fileRef.current.files[0], true);
                    }}
                  >
                    {importBusy ? "Importing..." : "Confirm import"}
                  </button>
                </div>
              </div>
            )}

            {shownTeams.length === 0 ? (

            <div className="surface py-16 text-center">
              <div className="w-14 h-14 rounded-full bg-[#EAE6FC] flex items-center justify-center mx-auto mb-4">
                <Users className="w-6 h-6 text-brand-purple" />
              </div>
              <div className="section-title mb-1">Better learning, together.</div>
              <p className="text-sm text-ink-muted mb-5">Create a team to get started.</p>
              <Link href={`/educator/teams?classId=${id}`} className="btn-primary">Create team</Link>
            </div>
          ) : (
            <div className="surface">
              <div className="flex items-center justify-between px-5 py-3 bg-[#FAFAFB]">
                <div className="t-head">Team</div>
                <div className="flex items-center gap-10">
                  <div className="t-head w-24 text-right">Members</div>
                  <div className="t-head w-16 text-right">Points</div>
                </div>
              </div>
              {shownTeams.map((t, i) => {
                const max = Number(t.max_members) || 6;
                const filled = Number(t.member_count ?? t.members_count ?? 0);
                const pendingRows = invites.filter((iv) => iv.team_id === String(t.id));
                return (
                  <div key={String(t.id || i)} className="t-row px-5 py-3.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[15px] text-ink truncate">{String(t.name || "Team")}</span>
                      <div className="flex items-center gap-10">
                        <div className="w-24 flex items-center justify-end gap-2">
                          <span className="flex gap-0.5" aria-hidden>
                            {Array.from({ length: Math.min(max, 8) }).map((_, k) => (
                              <span
                                key={k}
                                className={`w-2 h-1.5 rounded-full ${k < filled ? "bg-brand-purple" : "bg-hairline"}`}
                              />
                            ))}
                          </span>
                          <span className="text-xs text-ink-muted tabular-nums">{filled} of {max}</span>
                        </div>
                        <div className="w-16 text-right text-[15px] text-ink tabular-nums">
                          {scores[String(t.id)] ?? Number(t.score) ?? 0}
                        </div>
                      </div>
                    </div>
                    {pendingRows.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {pendingRows.map((iv) => (
                          <li key={iv.id} className="flex items-center gap-2 text-sm">
                            <span className="px-1.5 py-0.5 rounded-full text-xs bg-[#FBF0DC] text-[#96661A]">
                              pending
                            </span>
                            <span className="text-ink-muted truncate">{iv.email}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
              <div className="px-5 py-3 border-t border-hairline flex items-center justify-between">
                <span className="text-xs text-ink-faint">{teams.length} teams</span>
                <Link href={`/educator/teams?classId=${id}`} className="btn-quiet text-brand-purple">
                  Manage teams
                </Link>
              </div>
            </div>
          )}</>
                    )}

                    {!loading && sub === "educators" && <EducatorsCard classId={id} />}

                    {/* V2-013: laci butiran markah peserta, dibuka dengan klik nama. */}
                    {laciUser && (
                      <LaciMarkah
                        classId={id}
                        userId={laciUser.id}
                        nama={laciUser.nama}
                        jumlahAhli={markahInd.length}
                        tutup={() => setLaciUser(null)}
                      />
                    )}
                  </ClassShell>
    </Shell>
  );
}
