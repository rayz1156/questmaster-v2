"use client";
import { useEffect, useState } from "react";
import { Target, ChevronDown, ChevronUp, Settings } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import Link from "next/link";

type Bucket = "mastered" | "developing" | "struggling" | "not_attempted";

type OutcomeRow = {
  outcome_id: string;
  code: string | null;
  label: string;
  description: string | null;
  tagged_challenges: number;
  mastered_students: number;
  developing_students: number;
  struggling_students: number;
  not_attempted_students: number;
  avg_mastery_pct: number | null;
};

type StudentOutcome = {
  outcome_id: string;
  approved: number;
  rejected: number;
  scored: number;
  total: number;
  mastery_pct: number | null;
  bucket: Bucket;
};

type StudentRow = {
  user_id: string;
  name: string;
  outcomes: StudentOutcome[];
  mastered_count: number;
  struggling_count: number;
};

type Payload = {
  class_id: string;
  totals: { outcomes: number; tagged_challenges: number; students: number };
  outcomes: OutcomeRow[];
  students: StudentRow[];
  generated_at: string;
};

function bucketStyle(b: Bucket | undefined) {
  if (b === "mastered") return "bg-emerald-500 text-white";
  if (b === "developing") return "bg-amber-400 text-white";
  if (b === "struggling") return "bg-rose-500 text-white";
  return "bg-gray-200 text-gray-500";
}

function bucketLabel(b: Bucket | undefined) {
  if (b === "mastered") return "Mastered";
  if (b === "developing") return "Developing";
  if (b === "struggling") return "Struggling";
  return "Not attempted";
}

export default function MasteryPanel({ classId }: { classId: string | null }) {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    if (!classId || classId === "all") { setData(null); return; }
    (async () => {
      try {
        setError(null);
        setLoading(true);
        const { data: { session } } = await supabase.auth.getSession();
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (session?.access_token) headers["Authorization"] = `Bearer ${session.access_token}`;
        const res = await fetch(`/api/analytics/mastery?class_id=${encodeURIComponent(classId)}`, { headers });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
        if (!cancelled) setData(j.data as Payload);
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [classId]);

  const outcomes = data?.outcomes ?? [];
  const students = data?.students ?? [];

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center justify-between gap-3 p-4 border-b border-gray-100">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
            <Target className="w-4 h-4 text-indigo-500" /> Learning outcomes &amp; mastery (Tier 4)
          </div>
          <div className="text-xs text-gray-500 mt-0.5">
            {loading ? "Loading\u2026" : data
              ? `${data.totals.outcomes} outcomes \u00b7 ${data.totals.tagged_challenges} tagged challenges \u00b7 ${data.totals.students} students`
              : "Select a class to view mastery"}
          </div>
        </div>
        {classId && (
          <Link
            href={`/educator/outcomes?class_id=${encodeURIComponent(classId)}`}
            className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-md ring-1 ring-inset ring-gray-200 text-gray-700 hover:bg-gray-50"
          >
            <Settings className="w-3.5 h-3.5" /> Manage outcomes
          </Link>
        )}
      </div>
      {error && <div className="p-4 text-sm text-rose-600">{error}</div>}

      {data && data.totals.outcomes === 0 && (
        <div className="p-6 text-center">
          <div className="text-sm text-gray-600">No outcomes defined yet for this class.</div>
          <div className="text-xs text-gray-500 mt-1">Create outcomes and tag challenges to start tracking mastery.</div>
          {classId && (
            <Link
              href={`/educator/outcomes?class_id=${encodeURIComponent(classId)}`}
              className="inline-flex items-center gap-1.5 mt-3 text-xs font-medium px-3 py-1.5 rounded-md bg-indigo-600 text-white hover:bg-indigo-700"
            >
              <Settings className="w-3.5 h-3.5" /> Set up outcomes
            </Link>
          )}
        </div>
      )}

      {data && data.totals.outcomes > 0 && (
        <>
          <div className="p-4 border-b border-gray-100">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Outcomes overview</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {outcomes.map((o) => (
                <div key={o.outcome_id} className="rounded-xl border border-gray-200 bg-white p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-gray-900 truncate">
                        {o.code ? <span className="text-gray-500 mr-1">{o.code}</span> : null}{o.label}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">{o.tagged_challenges} tagged challenge{o.tagged_challenges === 1 ? "" : "s"}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-lg font-semibold text-gray-900">{o.avg_mastery_pct ?? "\u2014"}{o.avg_mastery_pct !== null ? "%" : ""}</div>
                      <div className="text-[10px] text-gray-500">avg mastery</div>
                    </div>
                  </div>
                  <div className="mt-2 flex h-1.5 w-full rounded-full overflow-hidden bg-gray-100">
                    {(() => {
                      const total = o.mastered_students + o.developing_students + o.struggling_students + o.not_attempted_students;
                      if (total === 0) return null;
                      const pct = (n: number) => `${(n / total) * 100}%`;
                      return (
                        <>
                          <div style={{ width: pct(o.mastered_students) }} className="bg-emerald-500" />
                          <div style={{ width: pct(o.developing_students) }} className="bg-amber-400" />
                          <div style={{ width: pct(o.struggling_students) }} className="bg-rose-500" />
                          <div style={{ width: pct(o.not_attempted_students) }} className="bg-gray-300" />
                        </>
                      );
                    })()}
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-[10px] text-gray-500">
                    <span><span className="inline-block w-2 h-2 rounded-full bg-emerald-500 mr-1 align-middle" />{o.mastered_students} mastered</span>
                    <span><span className="inline-block w-2 h-2 rounded-full bg-amber-400 mr-1 align-middle" />{o.developing_students} dev.</span>
                    <span><span className="inline-block w-2 h-2 rounded-full bg-rose-500 mr-1 align-middle" />{o.struggling_students} strug.</span>
                    <span><span className="inline-block w-2 h-2 rounded-full bg-gray-300 mr-1 align-middle" />{o.not_attempted_students} n/a</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Per-student matrix</div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead>
                  <tr>
                    <th className="text-left px-2 py-1.5 text-gray-500 font-medium sticky left-0 bg-white">Student</th>
                    {outcomes.map((o) => (
                      <th key={o.outcome_id} className="px-2 py-1.5 text-gray-500 font-medium text-center min-w-[5rem]" title={o.label}>
                        {o.code || o.label.slice(0, 14)}
                      </th>
                    ))}
                    <th className="px-2 py-1.5 text-gray-500 font-medium text-right">Mastered</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {students.map((s) => {
                    const isOpen = !!expanded[s.user_id];
                    const byId = new Map(s.outcomes.map((o) => [o.outcome_id, o]));
                    return (
                      <>
                        <tr key={s.user_id} className="hover:bg-gray-50">
                          <td className="px-2 py-1.5 sticky left-0 bg-white max-w-[14rem]">
                            <button
                              onClick={() => setExpanded((p) => ({ ...p, [s.user_id]: !p[s.user_id] }))}
                              className="inline-flex items-center gap-1 text-gray-900 font-medium truncate"
                            >
                              {isOpen ? <ChevronUp className="w-3 h-3 text-gray-400" /> : <ChevronDown className="w-3 h-3 text-gray-400" />}
                              <span className="truncate">{s.name}</span>
                            </button>
                          </td>
                          {outcomes.map((o) => {
                            const c = byId.get(o.outcome_id);
                            return (
                              <td key={o.outcome_id} className="px-1 py-1.5 text-center">
                                <span
                                  title={`${bucketLabel(c?.bucket)}${c && c.mastery_pct !== null ? ` \u00b7 ${c.mastery_pct}%` : ""}${c ? ` \u00b7 ${c.approved}/${c.scored} approved` : ""}`}
                                  className={`inline-flex items-center justify-center w-8 h-5 rounded text-[10px] font-semibold ${bucketStyle(c?.bucket)}`}
                                >
                                  {c && c.mastery_pct !== null ? `${c.mastery_pct}` : "\u2014"}
                                </span>
                              </td>
                            );
                          })}
                          <td className="px-2 py-1.5 text-right text-gray-700">{s.mastered_count}/{outcomes.length}</td>
                        </tr>
                        {isOpen && (
                          <tr key={s.user_id + ":d"}>
                            <td colSpan={outcomes.length + 2} className="px-2 py-2 bg-gray-50">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-1 text-[11px]">
                                {outcomes.map((o) => {
                                  const c = byId.get(o.outcome_id);
                                  return (
                                    <div key={o.outcome_id} className="flex items-center justify-between gap-2">
                                      <span className="truncate text-gray-700">{o.code ? `${o.code} ` : ""}{o.label}</span>
                                      <span className="text-gray-500 shrink-0">
                                        {c ? `${c.approved}/${c.scored} approved \u00b7 ${c.mastery_pct ?? "\u2014"}${c.mastery_pct !== null ? "%" : ""} \u00b7 ${bucketLabel(c.bucket)}` : "\u2014"}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
