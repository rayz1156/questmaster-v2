"use client";
/**
 * Learning outcomes pendidik, rupa v3 KZ-022.
 *
 * Borang tambah dalam Card + Field; senarai outcomes guna DataTable kit
 * (menu tindakan, penomboran pelanggan). Fungsi authedFetch, muat data,
 * cipta/sunting/padam dan toggle tag tidak berubah.
 */
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Shell from "@/components/Shell";
import { EDU_TABS } from '@/lib/eduTabs';
import { Pencil, Plus, Save, Tag, Trash2, X } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useSearchParams } from "next/navigation";
import { useConfirm } from '@/components/ui/ConfirmProvider';
import {
  Button,
  Card,
  CardHead,
  DataTable,
  EmptyState,
  Field,
  Input,
  PageHead,
  Select,
  type DataColumn,
} from "@/components/ui";

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
  const confirm = useConfirm();
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
  const [halaman, setHalaman] = useState(1);

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
    if (!(await confirm({ title: "Delete this outcome and all its tags?", tone: 'danger' }))) return;
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

  const lajur: DataColumn<Outcome>[] = [
    {
      key: "outcome",
      header: "Outcome",
      render: (o) => (
        <span className="block min-w-0 py-2">
          <span className="flex items-baseline gap-1.5">
            {o.code && <span className="text-[12px] text-ink-faint">{o.code}</span>}
            <span className="text-[14px] font-bold text-ink truncate">{o.label}</span>
          </span>
          {o.description && <span className="block text-[12px] text-ink-faint truncate">{o.description}</span>}
        </span>
      ),
    },
    {
      key: "tagged",
      header: "Tagged challenges",
      render: (o) => {
        const n = tagsByOutcome[o.id]?.size ?? 0;
        return <span className="text-[13px] text-ink-faint tabular-nums">{n}</span>;
      },
    },
  ];

  return (
    <Shell tabs={EDU_TABS}>
      <PageHead
        title="Learning outcomes"
        description="Define what you want students to learn, then tag the challenges that address each outcome. Mastery is computed from approved/rejected submissions on those tagged challenges."
      />

      <div className="flex items-center gap-2 mb-4">
        <Select
          value={classId ?? ""}
          onChange={(e) => setClassId(e.target.value || null)}
          aria-label="Select class"
          className="w-auto"
        >
          <option value="">Select a class…</option>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </div>

      {error && <div className="text-sm text-kz-down mb-4">{error}</div>}

      {classId && (
        <Card className="mb-4">
          <CardHead title="Add a new outcome" subtitle="Code is optional; the label is required." />
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 mt-4">
            <Field label="Code" htmlFor="outcome-kode">
              <Input id="outcome-kode" value={newCode} onChange={(e) => setNewCode(e.target.value)} placeholder="e.g. LO1" />
            </Field>
            <Field label="Label" htmlFor="outcome-label" className="md:col-span-4">
              <Input id="outcome-label" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Label (required)" />
            </Field>
            <Field label="Description" htmlFor="outcome-desc" className="md:col-span-5">
              <Input id="outcome-desc" value={newDescription} onChange={(e) => setNewDescription(e.target.value)} placeholder="Description (optional)" />
            </Field>
            <div className="md:col-span-2 flex items-end">
              <Button onClick={createOutcome} disabled={!newLabel.trim()} className="w-full">
                <Plus className="w-4 h-4" /> Add
              </Button>
            </div>
          </div>
        </Card>
      )}

      {classId && (
        <DataTable
          label={`Learning outcomes (${outcomes.length})${loading ? " · loading…" : ""}`}
          columns={lajur}
          rows={outcomes}
          rowKey={(o) => o.id}
          menuItems={(o) => [
            {
              label: editing === o.id ? "Close editor" : "Edit",
              icon: <Pencil className="w-4 h-4" />,
              onSelect: () => {
                if (editing === o.id) { setEditing(null); return; }
                setEditing(o.id);
                setEditForm({ code: o.code ?? "", label: o.label, description: o.description ?? "" });
              },
            },
            {
              label: tagOpen === o.id ? "Close tagging" : "Tag challenges",
              icon: <Tag className="w-4 h-4" />,
              onSelect: () => setTagOpen(tagOpen === o.id ? null : o.id),
            },
            {
              label: "Delete",
              icon: <Trash2 className="w-4 h-4" />,
              danger: true,
              onSelect: () => deleteOutcome(o.id),
            },
          ]}
          menuLabel="Outcome actions"
          renderRowExtra={(o) => {
            const isEditing = editing === o.id;
            const isTagging = tagOpen === o.id;
            const tagSet = tagsByOutcome[o.id] ?? new Set<string>();
            if (!isEditing && !isTagging) return null;
            return (
              <div className="py-3 space-y-3">
                {isEditing && (
                  <div>
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                      <div className="md:col-span-2">
                        <Field label="Code" htmlFor={`sunting-kode-${o.id}`}>
                          <Input id={`sunting-kode-${o.id}`} value={editForm.code} onChange={(e) => setEditForm({ ...editForm, code: e.target.value })} placeholder="Code" />
                        </Field>
                      </div>
                      <div className="md:col-span-4">
                        <Field label="Label" htmlFor={`sunting-label-${o.id}`}>
                          <Input id={`sunting-label-${o.id}`} value={editForm.label} onChange={(e) => setEditForm({ ...editForm, label: e.target.value })} placeholder="Label" />
                        </Field>
                      </div>
                      <div className="md:col-span-6">
                        <Field label="Description" htmlFor={`sunting-desc-${o.id}`}>
                          <Input id={`sunting-desc-${o.id}`} value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} placeholder="Description" />
                        </Field>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-3">
                      <Button onClick={() => saveEdit(o.id)}>
                        <Save className="w-4 h-4" /> Save
                      </Button>
                      <Button variant="outline" onClick={() => setEditing(null)}>
                        <X className="w-4 h-4" /> Cancel
                      </Button>
                    </div>
                  </div>
                )}
                {isTagging && (
                  <div className="rounded-[4px] border border-hairline p-3 bg-canvas">
                    <div className="text-[11px] font-bold uppercase tracking-[2.2px] text-ink-faint mb-2">Tag challenges</div>
                    {hunts.length === 0 && <div className="text-xs text-ink-faint">No hunts in this class yet.</div>}
                    {hunts.map((h) => {
                      const list = challengesByHunt.get(h.id) ?? [];
                      if (list.length === 0) return null;
                      return (
                        <div key={h.id} className="mb-2">
                          <div className="text-[13px] font-medium text-ink-muted mb-1">{h.title}</div>
                          <div className="flex flex-wrap gap-1">
                            {list.map((c) => {
                              const tagged = tagSet.has(c.id);
                              const preview = (c.prompt || "Challenge").slice(0, 60);
                              return (
                                <button
                                  key={c.id}
                                  onClick={() => toggleTag(o.id, c.id, tagged)}
                                  className={`text-[11px] px-2 py-1 rounded-[3px] border transition ${
                                    tagged
                                      ? "bg-brand-purple text-white border-brand-purple"
                                      : "bg-white text-ink-muted border-hairline hover:bg-[#f8f9fc]"
                                  }`}
                                  title={c.prompt ?? undefined}
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
          }}
          halaman={halaman}
          saizHalaman={8}
          onHalaman={setHalaman}
          empty={
            <EmptyState
              icon={<Tag className="w-6 h-6" />}
              title="No outcomes yet."
              text="Add one above to start tagging challenges."
            />
          }
        />
      )}
    </Shell>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-ink-muted">Loading…</div>}>
      <OutcomesPageInner />
    </Suspense>
  );
}