"use client";
import { useEffect, useState } from "react";
import { AlertTriangle, Copy, ChevronDown, ChevronUp } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

type Student = {
  user_id: string;
  display_name: string | null;
  username: string | null;
  risk_score: number;
  risk_bucket: "high" | "medium" | "low";
  days_since_event: number;
  last_event_at: string | null;
  events_7d: number;
  events_30d: number;
  quest_opens_30d: number;
  quest_submits_30d: number;
  total_subs: number;
  approved_subs: number;
  rejected_subs: number;
  subs_7d: number;
  subs_30d: number;
  last_sub_at: string | null;
  reasons: string[] | null;
};

type Payload = { class_id: string; generated_at: string; students: Student[] };

export default function AtRiskPanel({ classId }: { classId: string | null }) {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "high" | "medium" | "low">("all");

  useEffect(() => {
    if (!classId || classId === "all") { setData(null); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (session?.access_token) headers["Authorization"] = `Bearer ${session.access_token}`;
        const res = await fetch(`/api/analytics/at-risk?class_id=${encodeURIComponent(classId)}`, { headers });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const j = await res.json();
        if (!cancelled) setData(j.data as Payload);
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load at-risk data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [classId]);

  const students = data?.students ?? [];
  const filtered = students.filter(s => filter === "all" || s.risk_bucket === filter);
  const high = students.filter(s => s.risk_bucket === "high").length;
  const medium = students.filter(s => s.risk_bucket === "medium").length;
  const low = students.filter(s => s.risk_bucket === "low").length;

  function bucketStyle(b: Student["risk_bucket"]) {
    if (b === "high") return "bg-rose-100 text-rose-700 ring-rose-200";
    if (b === "medium") return "bg-amber-100 text-amber-700 ring-amber-200";
    return "bg-emerald-100 text-emerald-700 ring-emerald-200";
  }

  function nudgeMessage(s: Student) {
    const name = s.display_name || s.username || "there";
    const lines = [
      `Hi ${name},`,
      "",
      "I noticed you haven\u2019t been very active on Kuizen lately and wanted to check in. A few things I saw:",
      ...(s.reasons ?? []).map(r => `\u2022 ${r}`),
      "",
      "If there\u2019s anything blocking you (technical issue, unclear instructions, scheduling) please reply and let me know. I\u2019m happy to help you catch up.",
      "",
      "Best,",
      "Your educator",
    ];
    return lines.join("\n");
  }

  async function copyNudge(s: Student) {
    try {
      await navigator.clipboard.writeText(nudgeMessage(s));
      setCopiedId(s.user_id);
      setTimeout(() => setCopiedId(prev => prev === s.user_id ? null : prev), 1500);
    } catch {
      // ignore clipboard errors
    }
  }

  if (!classId) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
        <div className="text-sm text-gray-500">Select a class to see at-risk students.</div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
      <div className="flex items-center justify-between p-4 border-b border-gray-100">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
            <AlertTriangle className="w-4 h-4 text-rose-500" /> At-risk students <span className="ml-2 inline-flex items-center justify-center w-6 h-6 rounded-md bg-purple-100 text-purple-700 text-xs font-semibold align-middle" aria-label="Level 5">5</span>
          </div>
          <div className="text-xs text-gray-500 mt-0.5">
            {loading ? "Loading\u2026" : `${students.length} students \u00b7 ${high} high \u00b7 ${medium} medium \u00b7 ${low} low`}
          </div>
        </div>
        <div className="flex items-center gap-1 text-xs">
          {(["all","high","medium","low"] as const).map(b => (
            <button key={b}
              className={`px-2 py-1 rounded-md ring-1 ring-inset ${filter===b ? "bg-gray-900 text-white ring-gray-900" : "bg-white text-gray-700 ring-gray-200 hover:bg-gray-50"}`}
              onClick={() => setFilter(b)}
            >{b}</button>
          ))}
        </div>
      </div>
      {error && <div className="p-4 text-sm text-rose-600">{error}</div>}
      <div className="divide-y divide-gray-100">
        {filtered.length === 0 && !loading && (
          <div className="p-4 text-sm text-gray-500">No students match this filter.</div>
        )}
        {filtered.map(s => {
          const isOpen = !!expanded[s.user_id];
          return (
            <div key={s.user_id} className="p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900 truncate">{s.display_name || s.username || "Unknown"}</span>
                    <span className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full ring-1 ring-inset ${bucketStyle(s.risk_bucket)}`}>{s.risk_bucket}</span>
                    <span className="text-xs text-gray-500">score {s.risk_score}</span>
                  </div>
                  <div className="mt-1 text-xs text-gray-500 flex flex-wrap gap-x-3 gap-y-0.5">
                    <span>last event: {s.last_event_at ? new Date(s.last_event_at).toLocaleDateString() : "never"}</span>
                    <span>subs 7d/30d: {s.subs_7d}/{s.subs_30d}</span>
                    <span>approved/rejected: {s.approved_subs}/{s.rejected_subs}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => copyNudge(s)}
                    className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md bg-violet-600 hover:bg-violet-700 text-white"
                    title="Copy a personalised nudge message to clipboard"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    {copiedId === s.user_id ? "Copied\u2713" : "Copy nudge"}
                  </button>
                  <button
                    onClick={() => setExpanded(prev => ({ ...prev, [s.user_id]: !prev[s.user_id] }))}
                    className="text-gray-500 hover:text-gray-900"
                    aria-label="toggle details"
                  >
                    {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              {isOpen && (
                <div className="mt-3 pl-1 text-xs text-gray-700 space-y-2">
                  {(s.reasons && s.reasons.length > 0) ? (
                    <ul className="list-disc pl-4 space-y-0.5">
                      {s.reasons.map((r,i) => <li key={i}>{r}</li>)}
                    </ul>
                  ) : (
                    <div className="text-gray-500">No specific risk reasons \u2014 keeping an eye for now.</div>
                  )}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-gray-600">
                    <div><span className="text-gray-400">events 7d</span> {s.events_7d}</div>
                    <div><span className="text-gray-400">events 30d</span> {s.events_30d}</div>
                    <div><span className="text-gray-400">opens 30d</span> {s.quest_opens_30d}</div>
                    <div><span className="text-gray-400">submits 30d</span> {s.quest_submits_30d}</div>
                    <div><span className="text-gray-400">subs total</span> {s.total_subs}</div>
                    <div><span className="text-gray-400">approved</span> {s.approved_subs}</div>
                    <div><span className="text-gray-400">rejected</span> {s.rejected_subs}</div>
                    <div><span className="text-gray-400">last sub</span> {s.last_sub_at ? new Date(s.last_sub_at).toLocaleDateString() : "never"}</div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
