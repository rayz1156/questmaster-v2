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
import { useBahasa } from '@/lib/i18n/BahasaProvider';
import { terjemahBilangan } from '@/lib/i18n';

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
  const { t, bahasa } = useBahasa();
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
      if (!r.ok) { setErr((await r.json()).error || t('educator.activityDetail.copyFailed')); }
      else { setCopyFrom(""); await loadBoard(classId); }
    } catch (e: unknown) { setErr(mesejRalat(e, t('educator.activityDetail.copyFailed'))); }
    finally { setCopyBusy(false); }
  };
  const createBoard = async () => {
    if (!classId) return;
    setBoardBusy(true); setErr(null);
    try {
      const r = await authedFetch(`/api/submission-boards/${huntId}/${classId}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: title || 'Submission Board' }) });
      if (!r.ok) { setErr((await r.json()).error || t('educator.activityDetail.createBoardFailed')); }
      else { await loadBoard(classId); }
    } catch (e: unknown) { setErr(mesejRalat(e, t('educator.activityDetail.createBoardFailed'))); }
    finally { setBoardBusy(false); }
  };
  const toggleBoardOpen = async () => {
    if (!classId || !board) return;
    setBoardBusy(true); setErr(null);
    try {
      const r = await authedFetch(`/api/submission-boards/${huntId}/${classId}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ is_open: !board.is_open }) });
      if (!r.ok) { setErr((await r.json()).error || t('educator.activityDetail.updateBoardFailed')); }
      else { const j = await r.json(); setBoard(j.board || null); }
    } catch (e: unknown) { setErr(mesejRalat(e, t('educator.activityDetail.updateBoardFailed'))); }
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
    } catch (e: unknown) { setErr(mesejRalat(e, t('educator.activityDetail.applyScoreFailed'))); } finally { setBonusBusy(false); }
  };

  const save = async () => {
    setErr(null); setSaved(false);
    try {
      await updateQuestDetails(huntId, { title, description, instructions, link1, link2, submission_link: submissionLink.trim() || null, submission_link_label: submissionLinkLabel.trim() || null, submission_link_embed: submissionLinkEmbed, status, points: Number(points) || 0 });
      await refresh();
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: unknown) { setErr(mesejRalat(e, t('educator.activityDetail.saveFailed'))); }
  };

  if (!hunt) return <Shell tabs={EDU_TABS}><div className="p-10 text-[14px] text-ink-muted">{t('educator.activityDetail.loading')}</div></Shell>;

  return (
    <Shell tabs={EDU_TABS}>
      <div className="max-w-2xl">
        <PageHead
          title={hunt.title}
          secondaryActions={[{ label: t('common.back'), icon: <ArrowLeft className="w-4 h-4" />, href: "/educator/activities" }]}
        />

        {err && <Alert tone="danger" className="mb-4">{err}</Alert>}

        {/* Borang sunting aktiviti, corak activities/new. */}
        <Card className="space-y-5 mb-4">
          <Field label={t('educator.activityNew.titleLabel')} htmlFor="sunting-aktiviti-tajuk">
            <Input id="sunting-aktiviti-tajuk" value={title} onChange={e => setTitle(e.target.value)} />
          </Field>
          <Field label={t('educator.activityNew.statusLabel')} htmlFor="sunting-aktiviti-status">
            <Select id="sunting-aktiviti-status" value={status} onChange={e => setStatus(e.target.value as 'draft'|'active'|'archived')}>
              <option value="draft">{t('educator.activityDetail.statusDraft')}</option>
              <option value="active">{t('educator.activityDetail.statusActive')}</option>
              <option value="archived">{t('educator.activityDetail.statusArchived')}</option>
            </Select>
          </Field>
          <Field label={t('educator.activityNew.descLabel')} htmlFor="sunting-aktiviti-huraian">
            <Input id="sunting-aktiviti-huraian" value={description} onChange={e => setDescription(e.target.value)} />
          </Field>
          <Field label={t('educator.activityNew.instructionsLabel')} htmlFor="sunting-aktiviti-arah">
            <Textarea id="sunting-aktiviti-arah" rows={5} value={instructions} onChange={e => setInstructions(e.target.value)} placeholder={t('educator.activityNew.instructionsPlaceholder')} />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label={t('educator.activityNew.link1Label')} htmlFor="sunting-aktiviti-pautan1">
              <Input id="sunting-aktiviti-pautan1" value={link1} onChange={e => setLink1(e.target.value)} placeholder="https://drive.google.com/..." />
            </Field>
            <Field label={t('educator.activityNew.link2Label')} htmlFor="sunting-aktiviti-pautan2">
              <Input id="sunting-aktiviti-pautan2" value={link2} onChange={e => setLink2(e.target.value)} placeholder="https://youtu.be/..." />
            </Field>
          </div>
          <Alert tone="info" icon={<Info className="w-4 h-4" />}>
            {t('educator.activityDetail.alertSubmission')}
          </Alert>
          <Field label={t('educator.activityNew.submissionUrlLabel')} htmlFor="sunting-aktiviti-penghantaran" note={t('educator.activityNew.optional')}>
            <Input id="sunting-aktiviti-penghantaran" type="url" value={submissionLink} onChange={e => setSubmissionLink(e.target.value)} placeholder="https://drive.google.com/drive/folders/..." />
          </Field>
          <Field label={t('educator.activityNew.pointsLabel')} htmlFor="sunting-aktiviti-mata" note={t('educator.activityNew.pointsNote')}>
            <Input id="sunting-aktiviti-mata" type="number" min={0} max={1000} value={points} onChange={e => setPoints(e.target.value === "" ? "" : String(parseInt(e.target.value, 10)))} />
          </Field>
          <div className="flex items-center gap-3">
            <Button onClick={save}>{t('educator.activityDetail.saveChanges')}</Button>
            {saved && <span className="text-[13px] font-medium text-[#1ee0ac]">{t('educator.activityDetail.changesSaved')}</span>}
          </div>
        </Card>

        {/* Papan penghantaran dan penyiapan kumpulan: logik dan tindakan
            kekal; hanya pembalut kad ditukar kepada kit. */}
        <Card className="space-y-3">
          <div>
            <h3 className="text-[14px] font-bold text-ink mb-1">{t('educator.activityDetail.boardTitle')}</h3>
            <p className="text-[12px] text-ink-faint mb-3">{t('educator.activityDetail.boardDescIntro')} <span className="font-medium">{t('educator.activityDetail.boardDescLinkLabel')}</span> {t('educator.activityDetail.boardDescMid')} <span className="font-medium">{t('educator.activityDetail.boardDescBoardLabel')}</span> {t('educator.activityDetail.boardDescEnd')}</p>
            {!classId && <p className="text-[12px] text-ink-faint">{t('educator.activityDetail.assignClassFirst')}</p>}
            {classId && !board && (
              <div className="space-y-3">
                <Button variant="outline" size="sm" onClick={createBoard} disabled={boardBusy}>
                  <Plus className="w-4 h-4" /> {boardBusy ? t('educator.activityDetail.creating') : t('educator.activityDetail.createBoard')}
                </Button>
                {copySources.length > 0 && (
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="text-[12px] text-ink-muted">
                      <div className="mb-1">{t('educator.activityDetail.copyFromIntro')}</div>
                      <Select value={copyFrom} onChange={e => setCopyFrom(e.target.value)} disabled={copyBusy} className="text-[13px]">
                        <option value="">{t('educator.activityDetail.selectActivity')}</option>
                        {copySources.map(cs => (
                          <option key={cs.id} value={cs.id}>{cs.title}{cs.columns ? ' ' + terjemahBilangan(bahasa, 'educator.activityDetail.columnOne', 'educator.activityDetail.columnOther', cs.columns, { n: cs.columns }) : ''}</option>
                        ))}
                      </Select>
                    </div>
                    <Button variant="outline" size="sm" onClick={copyBoard} disabled={copyBusy || !copyFrom}>
                      <Copy className="w-4 h-4" /> {copyBusy ? t('educator.activityDetail.copying') : t('educator.activityDetail.copyBoard')}
                    </Button>
                  </div>
                )}
                {copySources.length > 0 && <p className="text-[12px] text-ink-faint">{t('educator.activityDetail.copyNote')}</p>}
              </div>
            )}
            {classId && board && (
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="dim" warna={board.is_open ? 'green' : 'gray'}>
                  {board.is_open ? <Unlock className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                  {board.is_open ? t('educator.activityDetail.open') : t('educator.activityDetail.closed')}
                </Badge>
                <Button variant="outline" size="sm" onClick={toggleBoardOpen} disabled={boardBusy}>
                  {board.is_open ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                  {boardBusy ? t('educator.activityDetail.saving') : (board.is_open ? t('educator.activityDetail.closeBoard') : t('educator.activityDetail.reopenBoard'))}
                </Button>
                <Button variant="outline" size="sm" href={`/educator/activities/${huntId}/submissions/${classId}`}>
                  <ExternalLink className="w-3.5 h-3.5" /> {t('educator.activityDetail.manageBoard')}
                </Button>
              </div>
            )}
            {classId && board && <p className="text-[12px] text-ink-faint mt-2">{t('educator.activityDetail.closeNote')}</p>}
          </div>

          {/* Penyiapan kumpulan */}
          <div className="pt-4 border-t border-hairline">
            <h3 className="text-[14px] font-bold text-ink mb-3">{t('educator.activityDetail.teamCompletions')}</h3>
            {teams.length === 0 ? <p className="text-[12px] text-ink-faint">{t('educator.activityDetail.noTeams')}</p> :
              <div className="space-y-1">
                {teams.map(pas => {
                  const done = completions.some(c => c.team_id === pas.id);
                  const openBonus = bonusFor === pas.id;
                  return (
                    <div key={pas.id} className={`rounded-lg ${done ? 'bg-green-50' : 'bg-gray-50'}`}>
                      <div className={`flex items-center gap-2 p-2 rounded-lg transition ${done ? '' : 'hover:bg-gray-100'}`}>
                        <button type="button" onClick={() => toggleComplete(pas.id, done)} className="flex items-center gap-2 flex-1 text-left">
                          {toggling===pas.id ? <div className="w-4 h-4 rounded-full border-2 border-gray-300 border-t-purple-600 animate-spin"/> :
                            done ? <CheckCircle className="w-4 h-4 text-green-600"/> : <Circle className="w-4 h-4 text-gray-300"/>}
                          <span className={`text-sm ${done ? 'text-green-700 font-medium' : 'text-gray-600'}`}>{pas.name || t('common.team')}</span>
                          {done && <span className="text-xs text-green-500">{t('educator.activityDetail.complete')}</span>}
                        </button>
                        <button type="button" onClick={() => { setBonusFor(openBonus ? "" : pas.id); setBonusPts(""); setBonusReason("Bonus"); }} className="text-xs text-purple-600 hover:text-purple-800 flex items-center gap-1 px-2 py-1 rounded-lg border border-purple-200 whitespace-nowrap">
                          <Plus className="w-3 h-3"/>{t('educator.activityDetail.scoreBonus')}
                        </button>
                      </div>
                      {openBonus && (
                        <div className="flex flex-wrap items-center gap-2 px-2 pb-2">
                          <input type="number" value={bonusPts} onChange={e=>setBonusPts(e.target.value)} placeholder={t('educator.activityDetail.bonusPointsPlaceholder')} className="border rounded-lg px-3 py-2 text-sm w-40" />
                          <input type="text" value={bonusReason} onChange={e=>setBonusReason(e.target.value)} placeholder={t('educator.activityDetail.bonusReasonPlaceholder')} className="border rounded-lg px-3 py-2 text-sm flex-1 min-w-[8rem]" />
                          <button type="button" disabled={bonusBusy || !bonusPts.trim()} onClick={() => giveBonus(pas.id)} className="bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white text-sm px-4 py-2 rounded-lg">{bonusBusy ? t('educator.activityDetail.saving') : t('educator.activityDetail.apply')}</button>
                          <button type="button" onClick={() => setBonusFor("")} className="border border-gray-300 text-gray-600 text-sm px-4 py-2 rounded-lg">{t('common.cancel')}</button>
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
  const { t } = useBahasa();
  return <Suspense fallback={<p>{t('common.loadingDots')}</p>}><PageInner /></Suspense>;
}
