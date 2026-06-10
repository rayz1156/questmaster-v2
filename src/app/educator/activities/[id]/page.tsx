"use client";
import { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useSession } from '@/lib/session';
import Shell from '@/components/Shell';
import { EDU_TABS } from '@/lib/eduTabs';
import { GraduationCap, ListChecks, Users, BarChart3, Settings as SettingsIcon, ArrowLeft, User as UserIcon, Activity } from "lucide-react";
import { listMyHunts, updateQuestDetails, type Hunt, listQuestCompletions, markTeamCompletion, unmarkTeamCompletion, listTeamsByClass, listMyHuntsByClass, addScoreAdjustment } from '@/lib/data';
import { CheckCircle, Circle, Plus, Lock, Unlock, ExternalLink, Copy } from 'lucide-react';
import { supabase } from '@/lib/supabase';

function PageInner() {
  const { id: huntId } = useParams() as { id: string };
  const { user } = useSession('educator');
  const [hunt, setHunt] = useState<Hunt | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [instructions, setInstructions] = useState('');
  const [link1, setLink1] = useState('');
  const [link2, setLink2] = useState('');
  const [submissionLink, setSubmissionLink] = useState('');
  const [submissionLinkLabel, setSubmissionLinkLabel] = useState('');
  const [submissionLinkEmbed, setSubmissionLinkEmbed] = useState(false);
  const [status, setStatus] = useState('draft');
  const [points, setPoints] = useState<number|string>("")
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [teams, setTeams] = useState<any[]>([]);
  const [completions, setCompletions] = useState<any[]>([]);
  const [toggling, setToggling] = useState("");
  const [bonusFor, setBonusFor] = useState<string>("");
  const [bonusPts, setBonusPts] = useState<string>("");
  const [bonusReason, setBonusReason] = useState<string>("Bonus");
  const [bonusBusy, setBonusBusy] = useState(false);
  const [board, setBoard] = useState<any>(null);
  const [classId, setClassId] = useState<string | null>(null);
  const [boardBusy, setBoardBusy] = useState(false);
  const [copySources, setCopySources] = useState<any[]>([]);
  const [copyFrom, setCopyFrom] = useState<string>("");
  const [copyBusy, setCopyBusy] = useState(false);

  const refresh = async () => {
    const hunts = await listMyHunts();
    const h = hunts.find(x => x.id === huntId) || null;
    setHunt(h);
    if (h) {
      setTitle(h.title); setDescription((h as any).description || '');
      setInstructions((h as any).instructions || '');
      setLink1((h as any).link1 || ''); setLink2((h as any).link2 || '');
      setSubmissionLink((h as any).submission_link || '');
      setSubmissionLinkLabel((h as any).submission_link_label || '');
      setSubmissionLinkEmbed(!!(h as any).submission_link_embed);
      setStatus((h as any).status || 'draft');
      setPoints((h as any).points ?? "");
      const cId = (h as any).class_id || null;
      setClassId(cId);
      try { setTeams(cId ? await listTeamsByClass(cId) : []); } catch { setTeams([]); }
      try { setCompletions(await listQuestCompletions(huntId)); } catch {}
      await loadBoard(cId);
    }
  };
  async function authedFetch(input: RequestInfo | URL, init: RequestInit = {}) {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    const headers = new Headers(init.headers || {});
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return fetch(input, { ...init, headers });
  }
  const loadBoard = async (cId: string | null) => {
    if (!cId) { setBoard(null); setCopySources([]); return; }
    try {
      const r = await authedFetch(`/api/submission-boards/${huntId}/${cId}`, { cache: 'no-store' });
      if (!r.ok) { setBoard(null); return; }
      const j = await r.json();
      setBoard(j.board || null);
      if (!j.board) { await loadCopySources(cId); } else { setCopySources([]); }
    } catch { setBoard(null); }
  };
  const loadCopySources = async (cId: string) => {
    try {
      const sibs = await listMyHuntsByClass(cId);
      const others = (sibs || []).filter((x: any) => x.id !== huntId);
      const withBoards: any[] = [];
      for (const o of others) {
        try {
          const rr = await authedFetch(`/api/submission-boards/${huntId}/${cId}`.replace(`/${huntId}/`, `/${o.id}/`), { cache: 'no-store' });
          if (!rr.ok) continue;
          const jj = await rr.json();
          if (jj.board) withBoards.push({ id: o.id, title: o.title, columns: (jj.columns || []).length });
        } catch {}
      }
      setCopySources(withBoards);
    } catch { setCopySources([]); }
  };
  const copyBoard = async () => {
    if (!classId || !copyFrom) return;
    setCopyBusy(true); setErr(null);
    try {
      const r = await authedFetch(`/api/submission-boards/${huntId}/${classId}/copy-from`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sourceActivityId: copyFrom }) });
      if (!r.ok) { setErr((await r.json()).error || 'Failed to copy board'); }
      else { setCopyFrom(""); await loadBoard(classId); }
    } catch (e: any) { setErr(e?.message || 'Failed to copy board'); }
    finally { setCopyBusy(false); }
  };
  const createBoard = async () => {
    if (!classId) return;
    setBoardBusy(true); setErr(null);
    try {
      const r = await authedFetch(`/api/submission-boards/${huntId}/${classId}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: title || 'Submission Board' }) });
      if (!r.ok) { setErr((await r.json()).error || 'Failed to create board'); }
      else { await loadBoard(classId); }
    } catch (e: any) { setErr(e?.message || 'Failed to create board'); }
    finally { setBoardBusy(false); }
  };
  const toggleBoardOpen = async () => {
    if (!classId || !board) return;
    setBoardBusy(true); setErr(null);
    try {
      const r = await authedFetch(`/api/submission-boards/${huntId}/${classId}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ is_open: !board.is_open }) });
      if (!r.ok) { setErr((await r.json()).error || 'Failed to update board'); }
      else { const j = await r.json(); setBoard(j.board || null); }
    } catch (e: any) { setErr(e?.message || 'Failed to update board'); }
    finally { setBoardBusy(false); }
  };
  useEffect(() => { refresh(); }, [huntId]);

  const toggleComplete = async (teamId: string, isDone: boolean) => {
    setToggling(teamId);
    try {
      if (isDone) await unmarkTeamCompletion(huntId, teamId);
      else await markTeamCompletion(huntId, teamId);
      setCompletions(await listQuestCompletions(huntId));
    } catch {} finally { setToggling(""); }
  };

  const giveBonus = async (teamId: string) => {
    const n = parseInt(bonusPts, 10);
    if (!n || Number.isNaN(n)) return;
    setBonusBusy(true);
    try {
      await addScoreAdjustment(huntId, teamId, n, bonusReason.trim() || "Bonus");
      setBonusFor(""); setBonusPts(""); setBonusReason("Bonus");
    } catch (e: any) { setErr(e.message); } finally { setBonusBusy(false); }
  };

  const save = async () => {
    setErr(null); setSaved(false);
    try {
      await updateQuestDetails(huntId, { title, description, instructions, link1, link2, submission_link: submissionLink.trim() || null, submission_link_label: submissionLinkLabel.trim() || null, submission_link_embed: submissionLinkEmbed, status: status as any, points: Number(points) || 0 });
      await refresh();
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: any) { setErr(e?.message || 'Save failed'); }
  };

  if (!hunt) return <Shell tabs={EDU_TABS}><p className="text-sm text-gray-500">Loading activity...</p></Shell>;

  return (
    <Shell tabs={EDU_TABS}>
      <div className="flex items-center gap-2 mb-3">
        <Link href="/educator/activities" className="text-sm text-gray-600 hover:underline flex items-center gap-1"><ArrowLeft className="w-4 h-4"/> Back</Link>
      </div>
      <h2 className="font-bold text-lg mb-1">{hunt.title}</h2>
      {err && <div className="text-xs text-red-600 mb-2">{err}</div>}
      <div className="card space-y-3">
        <label className="text-sm">
          <div className="text-gray-600 mb-1">Title</div>
          <input className="input w-full" value={title} onChange={e => setTitle(e.target.value)} />
        </label>
        <label className="text-sm">
          <div className="text-gray-600 mb-1">Status</div>
          <select className="input w-full" value={status} onChange={e => setStatus(e.target.value)}>
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="archived">Archived</option>
          </select>
        </label>
        <label className="text-sm">
          <div className="text-gray-600 mb-1">Short description</div>
          <input className="input w-full" value={description} onChange={e => setDescription(e.target.value)} />
        </label>
        <label className="text-sm">
          <div className="text-gray-600 mb-1">Instructions</div>
          <textarea className="input w-full" rows={5} value={instructions} onChange={e => setInstructions(e.target.value)} placeholder="What teams need to do to complete this quest..." />
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-sm">
            <div className="text-gray-600 mb-1">Instruction Link 1 (any URL)</div>
            <input className="input w-full" value={link1} onChange={e => setLink1(e.target.value)} placeholder="https://drive.google.com/..." />
          </label>
          <label className="text-sm">
            <div className="text-gray-600 mb-1">Instruction Link 2 (any URL)</div>
            <input className="input w-full" value={link2} onChange={e => setLink2(e.target.value)} placeholder="https://youtu.be/..." />
          </label>
        </div>
        <div className="mt-2 p-3 rounded-lg border bg-purple-50/40 space-y-2">
          <div className="text-sm font-semibold text-purple-800">Submission link (optional)</div>
          <div className="text-xs text-gray-600">When set, the activity board replaces team-column submissions with this link (Google Drive, Dropbox, Padlet, etc).</div>
          <label className="text-sm block">
            <div className="text-gray-600 mb-1">Submission URL</div>
            <input className="input w-full" type="url" value={submissionLink} onChange={e => setSubmissionLink(e.target.value)} placeholder="https://drive.google.com/drive/folders/..." />
          </label>
        </div>
        <label className="text-sm">
          <div className="text-gray-600 mb-1">Completion points</div>
          <input type="number" min={0} max={1000} className="input w-full" value={points} onChange={e => setPoints(e.target.value === "" ? "" : parseInt(e.target.value, 10))} />
        </label>
        <div>
          <button onClick={save} className="btn-primary px-4 py-2 text-sm">Save changes</button>
          {saved && <span className="ml-3 text-sm text-green-600 font-medium">Changes saved</span>}
          {err && <span className="ml-3 text-sm text-red-600">{err}</span>}
        </div>
      {/* Submission Board */}
        <div className="mt-6 pt-4 border-t">
          <h3 className="font-semibold text-sm mb-1">Submission Board</h3>
          <p className="text-xs text-gray-500 mb-3">Collect student work in one of two ways: set a <span className="font-medium">Submission link</span> above to point to an external page (Google Drive, Padlet, etc.), or create a <span className="font-medium">Kuizen submission board</span> below where students post directly.</p>
          {!classId && <p className="text-xs text-gray-400">Assign this activity to a class to enable a submission board.</p>}
          {classId && !board && (
            <div className="space-y-3">
              <button onClick={createBoard} disabled={boardBusy} className="btn-secondary inline-flex items-center gap-1 px-3 py-1.5 text-sm">
                <Plus className="w-4 h-4" /> {boardBusy ? 'Creating...' : 'Create submission board'}
              </button>
              {copySources.length > 0 && (
                <div className="flex flex-wrap items-end gap-2">
                  <label className="text-xs text-gray-600">
                    <div className="mb-1">Or copy a board from another activity in this class</div>
                    <select className="input text-sm" value={copyFrom} onChange={e => setCopyFrom(e.target.value)} disabled={copyBusy}>
                      <option value="">Select an activity...</option>
                      {copySources.map((cs: any) => (
                        <option key={cs.id} value={cs.id}>{cs.title}{cs.columns ? ` (${cs.columns} column${cs.columns === 1 ? '' : 's'})` : ''}</option>
                      ))}
                    </select>
                  </label>
                  <button onClick={copyBoard} disabled={copyBusy || !copyFrom} className="btn-secondary inline-flex items-center gap-1 px-3 py-1.5 text-sm">
                    <Copy className="w-4 h-4" /> {copyBusy ? 'Copying...' : 'Copy board'}
                  </button>
                </div>
              )}
              {copySources.length > 0 && <p className="text-xs text-gray-400">Copying brings over the board settings and its columns. Student submissions are not copied.</p>}
            </div>
          )}
          {classId && board && (
            <div className="flex flex-wrap items-center gap-2">
              <span className={`px-2 py-0.5 rounded inline-flex items-center gap-1 text-xs ${board.is_open ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-200 text-gray-700'}`}>
                {board.is_open ? <Unlock className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                {board.is_open ? 'Open' : 'Closed'}
              </span>
              <button onClick={toggleBoardOpen} disabled={boardBusy} className="btn-secondary inline-flex items-center gap-1 px-3 py-1.5 text-xs">
                {board.is_open ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                {boardBusy ? 'Saving...' : (board.is_open ? 'Close board' : 'Reopen board')}
              </button>
              <Link href={`/educator/activities/${huntId}/submissions/${classId}`} className="btn-secondary inline-flex items-center gap-1 px-3 py-1.5 text-xs">
                <ExternalLink className="w-3 h-3" /> Manage board
              </Link>
            </div>
          )}
          {classId && board && <p className="text-xs text-gray-400 mt-2">Closing a board hides it from students and stops new submissions, but keeps all existing submissions. You can reopen it anytime.</p>}
        </div>

        {/* Team Completions */}
      <div className="mt-6 pt-4 border-t">
        <h3 className="font-semibold text-sm mb-3">Team Completions</h3>
        {teams.length === 0 ? <p className="text-xs text-gray-400">No teams in this class.</p> :
          <div className="space-y-1">
            {teams.map((t: any) => {
              const done = completions.some((c: any) => c.team_id === t.id);
              const openBonus = bonusFor === t.id;
              return (
                <div key={t.id} className={`rounded-lg ${done ? 'bg-green-50' : 'bg-gray-50'}`}>
                  <div className={`flex items-center gap-2 p-2 rounded-lg transition ${done ? '' : 'hover:bg-gray-100'}`}>
                    <button type="button" onClick={() => toggleComplete(t.id, done)} className="flex items-center gap-2 flex-1 text-left">
                      {toggling===t.id ? <div className="w-4 h-4 rounded-full border-2 border-gray-300 border-t-purple-600 animate-spin"/> :
                        done ? <CheckCircle className="w-4 h-4 text-green-600"/> : <Circle className="w-4 h-4 text-gray-300"/>}
                      <span className={`text-sm ${done ? 'text-green-700 font-medium' : 'text-gray-600'}`}>{t.name}</span>
                      {done && <span className="text-xs text-green-500">Complete</span>}
                    </button>
                    <button type="button" onClick={() => { setBonusFor(openBonus ? "" : t.id); setBonusPts(""); setBonusReason("Bonus"); }} className="text-xs text-purple-600 hover:text-purple-800 flex items-center gap-1 px-2 py-1 rounded-lg border border-purple-200 whitespace-nowrap">
                      <Plus className="w-3 h-3"/>Score / Bonus
                    </button>
                  </div>
                  {openBonus && (
                    <div className="flex flex-wrap items-center gap-2 px-2 pb-2">
                      <input type="number" value={bonusPts} onChange={e=>setBonusPts(e.target.value)} placeholder="Points (- to deduct)" className="border rounded-lg px-3 py-2 text-sm w-40" />
                      <input type="text" value={bonusReason} onChange={e=>setBonusReason(e.target.value)} placeholder="Reason" className="border rounded-lg px-3 py-2 text-sm flex-1 min-w-[8rem]" />
                      <button type="button" disabled={bonusBusy || !bonusPts.trim()} onClick={() => giveBonus(t.id)} className="bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white text-sm px-4 py-2 rounded-lg">{bonusBusy ? 'Saving...' : 'Apply'}</button>
                      <button type="button" onClick={() => setBonusFor("")} className="border border-gray-300 text-gray-600 text-sm px-3 py-2 rounded-lg">Cancel</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        }
      </div>
      </div>
    </Shell>
  );
}

export default function Page() {
  return <Suspense fallback={<p>Loading...</p>}><PageInner /></Suspense>;
}
