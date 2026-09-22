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
import { Download, Search, Upload, Users } from "lucide-react";
import Shell from "@/components/Shell";
import ClassShell from "@/components/ClassShell";
import EducatorsCard from "@/components/EducatorsCard";
import { EDU_TABS } from "@/lib/eduTabs";
import { listClassMembers, listTeamsByClass, listClassTeamScores } from "@/lib/data";
import { supabase } from "@/lib/supabase";

type Sub = "students" | "teams" | "educators";

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
          const [ms, ts, ss, iv] = await Promise.all([
            listClassMembers(id),
            listTeamsByClass(id),
            listClassTeamScores(id).catch(() => []),
            supabase
              .from("qm_team_invites")
              .select("id, team_id, email, nama, role")
              .eq("class_id", id)
              .is("claimed_at", null),
          ]);
          if (!alive) return;
          setMembers((ms || []) as Record<string, unknown>[]);
          setTeams((ts || []) as Record<string, unknown>[]);
          setInvites((iv.data || []) as InviteRow[]);
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

  const name = (m: Record<string, unknown>) =>
    String(m.display_name || m.full_name || m.email || m.user_id || "Student");

  const shownMembers = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return members;
    return members.filter((m) => name(m).toLowerCase().includes(needle));
  }, [members, q]);

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
        </div>

        {err && <div className="text-sm text-red-600 mb-4">{err}</div>}
        {loading && <p className="text-sm text-ink-muted">Loading…</p>}

        {!loading && sub === "students" && (
          shownMembers.length === 0 ? (
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
              <div className="grid grid-cols-[1fr,120px] sm:grid-cols-[1fr,160px,160px] gap-4 px-5 py-3 bg-[#FAFAFB]">
                <div className="t-head">Name</div>
                <div className="t-head hidden sm:block">Status</div>
                <div className="t-head">Joined</div>
              </div>
              {shownMembers.map((m, i) => (
                <div
                  key={String(m.user_id || i)}
                  className="t-row grid grid-cols-[1fr,120px] sm:grid-cols-[1fr,160px,160px] gap-4 px-5 py-3.5 items-center"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`w-9 h-9 rounded-full text-[12px] font-semibold flex items-center justify-center shrink-0 ${PALETTE[i % PALETTE.length]}`}>
                      {initials(name(m))}
                    </span>
                    <span className="text-[15px] text-ink truncate">{name(m)}</span>
                  </div>
                  <div className="hidden sm:flex items-center gap-2 text-sm text-ink-muted">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#4BA972]" /> Active
                  </div>
                  <div className="text-sm text-ink-muted">
                    {m.joined_at
                      ? new Date(String(m.joined_at)).toLocaleDateString(undefined, { day: "numeric", month: "short" })
                      : ","}
                  </div>
                </div>
              ))}
              <div className="px-5 py-3 border-t border-hairline text-xs text-ink-faint">
                {shownMembers.length} of {members.length}
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
                  </ClassShell>
    </Shell>
  );
}
