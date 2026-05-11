"use client";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Shell from "@/components/Shell";
import { GraduationCap, ListChecks, Users, BarChart3, User as UserIcon, Activity, Target, Plus, Trash2, Save, X, Tag } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useSearchParams } from "next/navigation";

const tabs = [
  { href: "/educator/classes",    label: "Classes",    icon: <GraduationCap className="w-5 h-5"/> },
  { href: "/educator/activities", label: "Activities", icon: <ListChecks className="w-5 h-5"/> },
  { href: "/educator/teams",      label: "Teams",      icon: <Users className="w-5 h-5"/> },
  { href: "/educator/rankings",   label: "Rankings",   icon: <BarChart3 className="w-5 h-5"/> },
  { href: "/educator/analytics",  label: "Analytics",  icon: <Activity className="w-5 h-5"/> },
  { href: "/educator/profile",    label: "Profile",    icon: <UserIcon className="w-5 h-5"/> },
];

type Outcome = { id: string; class_id: string; code: string | null; label: string; description: string | null };
type Hunt = { id: string; title: string };
type Challenge = { id: string; hunt_id: string; prompt: string; points: number; order_idx: number };
type Klass = { id: string; name: string };

async function authedFetch(input: string, init: RequestInit = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const headers = new Headers(init.headers || {});
  headers.set("Content-Type", "application/json");
  if (session?.access_token) headers.set("Authorization", `Bearer ${session.access_token}`);
  return fetch(input, { ...init, headers });
}

function OutcomesPageInner() {
  const sp = useSearchParams();
  const initialClassId = sp.get("class_id");
  const [classes, setClasses] = useState<Klass[]>([]);
  const [classId, setClassId] = useState<string | null>(initialClassId);
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const [hunts, setHunts] = useState<Hunt[]>([]);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [tagsByOutcome, setTagsByOutcome] = useState<Record<string, Set<string>>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newCode, setNewCode] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ code: string; label: string; description: string }>({ code: "", label: "", description: "" });
  const [tagOpen, setTagOpen] = useState<string | null>(null);

  // Load classes the educator can edit
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: owned } = await supabase
        .from("qm_classes")
        .select("id, name")
        .eq("owner_id", user.id);
      const { data: coed } = await supabase
        .from("qm_class_educators")
        .select("class_id, qm_classes:class_id(id, name)")
        .eq("educator_id", user.id);
      const list: Klass[] = [];
      (owned ?? []).forEach((c) => list.push({ id: c.id as string, name: c.name as string }));
      (coed ?? []).forEach((row) => {
        const raw = (row as { qm_classes?: { id: string; name: string } | { id: string; name: string }[] }).qm_classes;
        const c = Array.isArray(raw) ? raw[0] : raw;
        if (c && !list.find((x) => x.id === c.id)) list.push({ id: c.id, name: c.name });
      });
      setClasses(list);
      if (!classId && list.length > 0) setClassId(list[0].id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadData = useCallback(async () => {
    if (!classId) return;
    setLoading(true);
    setError(null);
    try {
      const [outcomesRes, challengesRes] = await Promise.all([
        authedFetch(`/api/outcomes?class_id=${encodeURIComponent(classId)}`),
        authedFetch(`/api/classes/${encodeURIComponent(classId)}/challenges`),
      ]);
      const outcomesJ = await outcomesRes.json();
      const challengesJ = await challengesRes.json();
      if (!outcomesRes.ok) throw new Error(outcomesJ.error || "Failed to load outcomes");
      if (!challengesRes.ok) throw new Error(challengesJ.error || "Failed to load challenges");
      setOutcomes(outcomesJ.data ?? []);
      setHunts(challengesJ.data?.hunts ?? []);
      setChallenges(challengesJ.data?.challenges ?? []);
      // Load tags per outcome
      const tagMap: Record<string, Set<string>> = {};
      await Promise.all((outcomesJ.data ?? []).map(async (o: Outcome) => {
        const r = await authedFetch(`/api/outcomes/${o.id}/tags`);
        const j = await r.json();
        if (r.ok && Array.isArray(j.data)) {
          tagMap[o.id] = new Set(j.data.map((t: { challenge_id: string }) => t.challenge_id));
        }
      }));
      setTagsByOutcome(tagMap);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }, [classId]);

  useEffect(() => { void loadData(); }, [loadData]);

  const challengesByHunt = useMemo(() => {
    const m = new Map<string, Challenge[]>();
    challenges.forEach((c) => {
      const arr = m.get(c.hunt_id) || [];
      arr.push(c);
      m.set(c.hunt_id, arr);
    });
    return m;
  }, [challenges]);

  async function createOutcome() {
    if (!classId || !newLabel.trim()) return;
    const r = await authedFetch("/api/outcomes", {
      method: "POST",
      body: JSON.stringify({ class_id: classId, code: newCode.trim() || null, label: newLabel.trim(), description: newDescription.trim() || null }),
    });
    const j = await r.json();
    if (!r.ok) { setError(j.error || "Create failed"); return; }
    setNewCode(""); setNewLabel(""); setNewDescription("");
    void loadData();
  }

  async function saveEdit(id: string) {
    const r = await authedFetch(`/api/outcomes/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ code: editForm.code || null, label: editForm.label, description: editForm.description || null }),
    });
    const j = await r.json();
    if (!r.ok) { setError(j.error || "Save failed"); return; }
    setEditing(null);
    void loadData();
  }

  async function deleteOutcome(id: string) {
    if (!confirm("Delete this outcome and all its tags?")) return;
    const r = await authedFetch(`/api/outcomes/${id}`, { method: "DELETE" });
    if (!r.ok) { const j = await r.json(); setError(j.error || "Delete failed"); return; }
    void loadData();
  }

  async function toggleTag(outcomeId: string, challengeId: string, currentlyTagged: boolean) {
    if (currentlyTagged) {
      const r = await authedFetch(`/api/outcomes/${outcomeId}/tags?challenge_id=${encodeURIComponent(challengeId)}`, { method: "DELETE" });
      if (!r.ok) { const j = await r.json(); setError(j.error || "Untag failed"); return; }
    } else {
      const r = await authedFetch(`/api/outcomes/${outcomeId}/tags`, {
        method: "POST",
        body: JSON.stringify({ challenge_id: challengeId }),
      });
      if (!r.ok) { const j = await r.json(); setError(j.error || "Tag failed"); return; }
    }
    setTagsByOutcome((prev) => {
      const next = { ...prev };
      const set = new Set(next[outcomeId] ?? []);
      if (currentlyTagged) set.delete(challengeId); else set.add(challengeId);
      next[outcomeId] = set;
      return next;
    });
  }

  return (
    <Shell tabs={tabs}>
      <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
        <div className="flex items-center gap-3">
          <Target className="w-6 h-6 text-indigo-500" />
          <h1 className="text-2xl font-bold text-gray-900">Learning outcomes</h1>
        </div>
        <p className="text-sm text-gray-600 -mt-2">Define what you want students to learn, then tag the challenges that address each outcome. Mastery is computed from approved/rejected submissions on those tagged challenges.</p>

        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-700">Class</label>
          <select
            value={classId ?? ""}
            onChange={(e) => setClassId(e.target.value || null)}
            className="text-sm rounded-md border border-gray-300 px-2 py-1.5 bg-white"
          >
            <option value="">Select a class…</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        {error && <div className="text-sm text-rose-600">{error}</div>}

        {classId && (
          <div className="rounded-2xl border border-gray-200 bg-white p-4 space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Add a new outcome</div>
            <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
              <input value={newCode} onChange={(e) => setNewCode(e.target.value)} placeholder="Code (e.g. LO1)" className="md:col-span-2 text-sm rounded-md border border-gray-300 px-2 py-1.5" />
              <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Label (required)" className="md:col-span-4 text-sm rounded-md border border-gray-300 px-2 py-1.5" />
              <input value={newDescription} onChange={(e) => setNewDescription(e.target.value)} placeholder="Description (optional)" className="md:col-span-5 text-sm rounded-md border border-gray-300 px-2 py-1.5" />
              <button onClick={createOutcome} disabled={!newLabel.trim()} className="md:col-span-1 inline-flex items-center justify-center gap-1 text-sm rounded-md bg-indigo-600 text-white px-2 py-1.5 disabled:opacity-50">
                <Plus className="w-4 h-4" /> Add
              </button>
            </div>
          </div>
        )}

        {classId && (
          <div className="rounded-2xl border border-gray-200 bg-white">
            <div className="px-4 py-3 border-b border-gray-100 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Outcomes ({outcomes.length}){loading ? " \u00b7 loading\u2026" : ""}
            </div>
            {outcomes.length === 0 && !loading && (
              <div className="p-4 text-sm text-gray-500">No outcomes yet. Add one above.</div>
            )}
            <div className="divide-y divide-gray-100">
              {outcomes.map((o) => {
                const isEditing = editing === o.id;
                const isTagging = tagOpen === o.id;
                const tagSet = tagsByOutcome[o.id] ?? new Set<string>();
                return (
                  <div key={o.id} className="p-4">
                    {!isEditing ? (
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold text-gray-900">
                            {o.code ? <span className="text-gray-500 mr-1">{o.code}</span> : null}{o.label}
                          </div>
                          {o.description && <div className="text-xs text-gray-600 mt-0.5">{o.description}</div>}
                          <div className="text-xs text-gray-500 mt-1">{tagSet.size} tagged challenge{tagSet.size === 1 ? "" : "s"}</div>
                        </div>
                        <div className="shrink-0 flex items-center gap-1">
                          <button onClick={() => { setEditing(o.id); setEditForm({ code: o.code ?? "", label: o.label, description: o.description ?? "" }); }} className="text-xs px-2 py-1 rounded-md ring-1 ring-inset ring-gray-200 text-gray-700 hover:bg-gray-50">Edit</button>
                          <button onClick={() => setTagOpen(isTagging ? null : o.id)} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md ring-1 ring-inset ring-indigo-200 text-indigo-700 hover:bg-indigo-50">
                            <Tag className="w-3 h-3" /> {isTagging ? "Close" : "Tag challenges"}
                          </button>
                          <button onClick={() => deleteOutcome(o.id)} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md ring-1 ring-inset ring-rose-200 text-rose-700 hover:bg-rose-50">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
                          <input value={editForm.code} onChange={(e) => setEditForm({ ...editForm, code: e.target.value })} placeholder="Code" className="md:col-span-2 text-sm rounded-md border border-gray-300 px-2 py-1.5" />
                          <input value={editForm.label} onChange={(e) => setEditForm({ ...editForm, label: e.target.value })} placeholder="Label" className="md:col-span-4 text-sm rounded-md border border-gray-300 px-2 py-1.5" />
                          <input value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} placeholder="Description" className="md:col-span-6 text-sm rounded-md border border-gray-300 px-2 py-1.5" />
                        </div>
                        <div className="flex items-center gap-1">
                          <button onClick={() => saveEdit(o.id)} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-indigo-600 text-white"><Save className="w-3 h-3" /> Save</button>
                          <button onClick={() => setEditing(null)} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md ring-1 ring-inset ring-gray-200 text-gray-700"><X className="w-3 h-3" /> Cancel</button>
                        </div>
                      </div>
                    )}
                    {isTagging && (
                      <div className="mt-3 rounded-md ring-1 ring-inset ring-gray-200 p-3 bg-gray-50/40">
                        <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Tag challenges</div>
                        {hunts.length === 0 && <div className="text-xs text-gray-500">No hunts in this class yet.</div>}
                        {hunts.map((h) => {
                          const list = challengesByHunt.get(h.id) ?? [];
                          if (list.length === 0) return null;
                          return (
                            <div key={h.id} className="mb-2">
                              <div className="text-xs font-medium text-gray-700 mb-1">{h.title}</div>
                              <div className="flex flex-wrap gap-1">
                                {list.map((c) => {
                                  const tagged = tagSet.has(c.id);
                                  const preview = (c.prompt || "Challenge").slice(0, 60);
                                  return (
                                    <button
                                      key={c.id}
                                      onClick={() => toggleTag(o.id, c.id, tagged)}
                                      className={`text-[11px] px-2 py-1 rounded-full ring-1 ring-inset ${tagged ? "bg-indigo-600 text-white ring-indigo-600" : "bg-white text-gray-700 ring-gray-200 hover:bg-gray-50"}`}
                                      title={c.prompt}
                                    >
                                      {tagged ? "\u2713 " : "+ "}#{c.order_idx + 1} {preview}{(c.prompt || "").length > 60 ? "\u2026" : ""}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </Shell>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-gray-500">Loading…</div>}>
      <OutcomesPageInner />
    </Suspense>
  );
}
