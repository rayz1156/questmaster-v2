"use client";
/**
 * Borang sunting aktiviti (hunt) untuk pendidik.
 *
 * KZ-022b: rupa v3 (PageHead, Card, Field, Input, Select, Textarea, Alert,
 * Button) mengikut corak activities/new. Bahagian papan penghantaran dan
 * penyiapan kumpulan kekal seperti sedia ada; logik, data, laluan dan auth
 * tidak berubah.
 */
import { useEffect, useState, Suspense } from 'react';
import { useParams } from 'next/navigation';
import { useSession } from '@/lib/session';
import Shell from '@/components/Shell';
import { EDU_TABS } from '@/lib/eduTabs';
import { ArrowLeft, CheckCircle, Circle, Copy, ExternalLink, Info, Lock, Plus, Unlock } from "lucide-react";
import { listMyHunts, updateQuestDetails, listQuestCompletions, markTeamCompletion, unmarkTeamCompletion, listTeamsByClass, listMyHuntsByClass, addScoreAdjustment, type Hunt, type QuestCompletion } from '@/lib/data';
import {
  Alert,
  Badge,
  Button,
  Card,
  Field,
  Input,
  PageHead,
  Select,
  Textarea,
} from '@/components/ui';
import { supabase } from '@/lib/supabase';

/** Baris kumpulan seperti yang dipulangkan listTeamsByClass (qm_teams). */
type PasukanKelas = { id: string; name: string | null; score?: number | null };
/** Papan penghantaran seperti JSON /api/submission-boards. */
type PapanHantar = { is_open: boolean };
/** Aktiviti lain dalam kelas yang ada papan (sumber salinan papan). */
type SumberSalin = { id: string; title: string; columns?: number };

/** Mesej ralat selamat daripada nilai balingan `unknown`. */
function mesejRalat(e: unknown, zonkal: string): string {
  return e instanceof Error && e.message ? e.message : zonkal;
}

function PageInner() {
  const { id: huntId } = useParams() as { id: string };
  // useSession menghalakan ke log masuk bila tiada sesi pendidik; nilai
  // pengguna tidak diperlukan oleh halaman ini.
  useSession('educator');
  const [hunt, setHunt] = useState<Hunt | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [instructions, setInstructions] = useState('');
  const [link1, setLink1] = useState('');
  const [link2, setLink2] = useState('');
  const [submissionLink, setSubmissionLink] = useState('');
  const [submissionLinkLabel, setSubmissionLinkLabel] = useState('');
  const [submissionLinkEmbed, setSubmissionLinkEmbed] = useState(false);
  const [status, setStatus] = useState<'draft'|'active'|'archived'>('draft');
  const [points, setPoints] = useState<number|string>("")
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [teams, setTeams] = useState<PasukanKelas[]>([]);
  const [completions, setCompletions] = useState<QuestCompletion[]>([]);
  const [toggling, setToggling] = useState("");
  const [bonusFor, setBonusFor] = useState<string>("");
  const [bonusPts, setBonusPts] = useState<string>("");
  const [bonusReason, setBonusReason] = useState<string>("Bonus");
  const [bonusBusy, setBonusBusy] = useState(false);
  const [board, setBoard] = useState<PapanHantar | null>(null);
  const [classId, setClassId] = useState<string | null>(null);
  const [boardBusy, setBoardBusy] = useState(false);
  const [copySources, setCopySources] = useState<SumberSalin[]>([]);
  const [copyFrom, setCopyFrom] = useState<string>("");
  const [copyBusy, setCopyBusy] = useState(false);

  const refresh = async () => {
    const hunts = await listMyHunts();
    const h = hunts.find(x => x.id === huntId) || null;
    setHunt(h);
    if (h) {
      setTitle(h.title); setDescription(h.description || '');
      setInstructions(h.instructions || '');
      setLink1(h.link1 || ''); setLink2(h.link2 || '');
      setSubmissionLink(h.submission_link || '');
      setSubmissionLinkLabel(h.submission_link_label || '');
      setSubmissionLinkEmbed(!!h.submission_link_embed);
      setStatus(h.status || 'draft');
      setPoints(h.points ?? "");
      const cId = h.class_id || null;
      setClassId(cId);
      try { setTeams(cId ? (await listTeamsByClass(cId)) as unknown as PasukanKelas[] : []); } catch { setTeams([]); }
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
      const others = (sibs || []).filter(x => x.id !== huntId);
      const withBoards: SumberSalin[] = [];
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
    } catch (e: unknown) { setErr(mesejRalat(e, 'Failed to copy board')); }
    finally { setCopyBusy(false); }
  };
  const createBoard = async () => {
    if (!classId) return;
    setBoardBusy(true); setErr(null);
    try {
      const r = await authedFetch(`/api/submission-boards/${huntId}/${classId}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: title || 'Submission Board' }) });
      if (!r.ok) { setErr((await r.json()).error || 'Failed to create board'); }
      else { await loadBoard(classId); }
    } catch (e: unknown) { setErr(mesejRalat(e, 'Failed to create board')); }
    finally { setBoardBusy(false); }
  };
  const toggleBoardOpen = async () => {
    if (!classId || !board) return;
    setBoardBusy(true); setErr(null);
    try {
      const r = await authedFetch(`/api/submission-boards/${huntId}/${classId}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ is_open: !board.is_open }) });
      if (!r.ok) { setErr((await r.json()).error || 'Failed to update board'); }
      else { const j = await r.json(); setBoard(j.board || null); }
    } catch (e: unknown) { setErr(mesejRalat(e, 'Failed to update board')); }
    finally { setBoardBusy(false); }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
    } catch (e: unknown) { setErr(mesejRalat(e, 'Failed to apply score')); } finally { setBonusBusy(false); }
  };

  const save = async () => {
    setErr(null); setSaved(false);
    try {
      await updateQuestDetails(huntId, { title, description, instructions, link1, link2, submission_link: submissionLink.trim() || null, submission_link_label: submissionLinkLabel.trim() || null, submission_link_embed: submissionLinkEmbed, status, points: Number(points) || 0 });
      await refresh();
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: unknown) { setErr(mesejRalat(e, 'Save failed')); }
  };

  if (!hunt) return <Shell tabs={EDU_TABS}><div className="p-10 text-[14px] text-ink-muted">Loading activity...</div></Shell>;

  return (
    <Shell tabs={EDU_TABS}>
      <div className="max-w-2xl">
        <PageHead
          title={hunt.title}
          secondaryActions={[{ label: "Back", icon: <ArrowLeft className="w-4 h-4" />, href: "/educator/activities" }]}
        />

        {err && <Alert tone="danger" className="mb-4">{err}</Alert>}

        {/* Borang sunting aktiviti, corak activities/new. */}
        <Card className="space-y-5 mb-4">
          <Field label="Title" htmlFor="sunting-aktiviti-tajuk">
            <Input id="sunting-aktiviti-tajuk" value={title} onChange={e => setTitle(e.target.value)} />
          </Field>
          <Field label="Status" htmlFor="sunting-aktiviti-status">
            <Select id="sunting-aktiviti-status" value={status} onChange={e => setStatus(e.target.value as 'draft'|'active'|'archived')}>
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </Select>
          </Field>
          <Field label="Short description" htmlFor="sunting-aktiviti-huraian">
            <Input id="sunting-aktiviti-huraian" value={description} onChange={e => setDescription(e.target.value)} />
          </Field>
          <Field label="Instructions" htmlFor="sunting-aktiviti-arah">
            <Textarea id="sunting-aktiviti-arah" rows={5} value={instructions} onChange={e => setInstructions(e.target.value)} placeholder="What teams need to do to complete this quest..." />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Instruction Link 1 (any URL)" htmlFor="sunting-aktiviti-pautan1">
              <Input id="sunting-aktiviti-pautan1" value={link1} onChange={e => setLink1(e.target.value)} placeholder="https://drive.google.com/..." />
            </Field>
            <Field label="Instruction Link 2 (any URL)" htmlFor="sunting-aktiviti-pautan2">
              <Input id="sunting-aktiviti-pautan2" value={link2} onChange={e => setLink2(e.target.value)} placeholder="https://youtu.be/..." />
            </Field>
          </div>
          <Alert tone="info" icon={<Info className="w-4 h-4" />}>
            Submission link (optional). When set, the activity board replaces team-column
            submissions with this link (Google Drive, Dropbox, Padlet, etc). Prefer students
            to post their work directly inside Kuizen? Leave this blank and create a Kuizen
            submission board below.
          </Alert>
          <Field label="Submission URL" htmlFor="sunting-aktiviti-penghantaran" note="Optional">
            <Input id="sunting-aktiviti-penghantaran" type="url" value={submissionLink} onChange={e => setSubmissionLink(e.target.value)} placeholder="https://drive.google.com/drive/folders/..." />
          </Field>
          <Field label="Completion points" htmlFor="sunting-aktiviti-mata" note="0 to 1000">
            <Input id="sunting-aktiviti-mata" type="number" min={0} max={1000} value={points} onChange={e => setPoints(e.target.value === "" ? "" : String(parseInt(e.target.value, 10)))} />
          </Field>
          <div className="flex items-center gap-3">
            <Button onClick={save}>Save changes</Button>
            {saved && <span className="text-[13px] font-medium text-[#1ee0ac]">Changes saved</span>}
          </div>
        </Card>

        {/* Papan penghantaran dan penyiapan kumpulan: logik dan tindakan
            kekal; hanya pembalut kad ditukar kepada kit. */}
        <Card className="space-y-3">
          <div>
            <h3 className="text-[14px] font-bold text-ink mb-1">Submission Board</h3>
            <p className="text-[12px] text-ink-faint mb-3">Collect student work in one of two ways: set a <span className="font-medium">Submission link</span> above to point to an external page (Google Drive, Padlet, etc.), or create a <span className="font-medium">Kuizen submission board</span> below where students post directly.</p>
            {!classId && <p className="text-[12px] text-ink-faint">Assign this activity to a class to enable a submission board.</p>}
            {classId && !board && (
              <div className="space-y-3">
                <Button variant="outline" size="sm" onClick={createBoard} disabled={boardBusy}>
                  <Plus className="w-4 h-4" /> {boardBusy ? 'Creating...' : 'Create submission board'}
                </Button>
                {copySources.length > 0 && (
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="text-[12px] text-ink-muted">
                      <div className="mb-1">Or copy a board from another activity in this class</div>
                      <Select value={copyFrom} onChange={e => setCopyFrom(e.target.value)} disabled={copyBusy} className="text-[13px]">
                        <option value="">Select an activity...</option>
                        {copySources.map(cs => (
                          <option key={cs.id} value={cs.id}>{cs.title}{cs.columns ? ` (${cs.columns} column${cs.columns === 1 ? '' : 's'})` : ''}</option>
                        ))}
                      </Select>
                    </div>
                    <Button variant="outline" size="sm" onClick={copyBoard} disabled={copyBusy || !copyFrom}>
                      <Copy className="w-4 h-4" /> {copyBusy ? 'Copying...' : 'Copy board'}
                    </Button>
                  </div>
                )}
                {copySources.length > 0 && <p className="text-[12px] text-ink-faint">Copying brings over the board settings and its columns. Student submissions are not copied.</p>}
              </div>
            )}
            {classId && board && (
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="dim" warna={board.is_open ? 'green' : 'gray'}>
                  {board.is_open ? <Unlock className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                  {board.is_open ? 'Open' : 'Closed'}
                </Badge>
                <Button variant="outline" size="sm" onClick={toggleBoardOpen} disabled={boardBusy}>
                  {board.is_open ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                  {boardBusy ? 'Saving...' : (board.is_open ? 'Close board' : 'Reopen board')}
                </Button>
                <Button variant="outline" size="sm" href={`/educator/activities/${huntId}/submissions/${classId}`}>
                  <ExternalLink className="w-3.5 h-3.5" /> Manage board
                </Button>
              </div>
            )}
            {classId && board && <p className="text-[12px] text-ink-faint mt-2">Closing a board hides it from students and stops new submissions, but keeps all existing submissions. You can reopen it anytime.</p>}
          </div>

          {/* Penyiapan kumpulan */}
          <div className="pt-4 border-t border-hairline">
            <h3 className="text-[14px] font-bold text-ink mb-3">Team Completions</h3>
            {teams.length === 0 ? <p className="text-[12px] text-ink-faint">No teams in this class.</p> :
              <div className="space-y-1">
                {teams.map(t => {
                  const done = completions.some(c => c.team_id === t.id);
                  const openBonus = bonusFor === t.id;
                  return (
                    <div key={t.id} className={`rounded-lg ${done ? 'bg-green-50' : 'bg-gray-50'}`}>
                      <div className={`flex items-center gap-2 p-2 rounded-lg transition ${done ? '' : 'hover:bg-gray-100'}`}>
                        <button type="button" onClick={() => toggleComplete(t.id, done)} className="flex items-center gap-2 flex-1 text-left">
                          {toggling===t.id ? <div className="w-4 h-4 rounded-full border-2 border-gray-300 border-t-purple-600 animate-spin"/> :
                            done ? <CheckCircle className="w-4 h-4 text-green-600"/> : <Circle className="w-4 h-4 text-gray-300"/>}
                          <span className={`text-sm ${done ? 'text-green-700 font-medium' : 'text-gray-600'}`}>{t.name || "Team"}</span>
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
        </Card>
      </div>
    </Shell>
  );
}

export default function Page() {
  return <Suspense fallback={<p>Loading...</p>}><PageInner /></Suspense>;
}
