"use client";
/**
 * Overview kelas pendidik: rupa v3 KZ-022b.
 *
 * Semua bahagian dibungkus dengan kit (Card, CardHead, StatGroup, DataTable,
 * Modal, Button, Field). Statistik hanya nombor sebenar yang sudah dimuat
 * (ahli, pendidik aktif, jemputan pendidik tertunda); tiada nombor rekaan.
 * Logik, panggilan data dan pengendali klik tidak berubah: nama kelas,
 * penerangan, tamat/buka semula kelas, ketampakan papan pendahulu, kod kelas,
 * markah bonus/penalti dan buang ahli semua kekal memanggil fungsi yang sama.
 */
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Award, Check, ClipboardList, Copy, EyeOff, Inbox, Minus, Pencil, Plus, Search, Trash2, Trophy, UserPlus, Users, X } from "lucide-react";
import Shell from "@/components/Shell";
import ClassShell from "@/components/ClassShell";
import { EDU_TABS } from "@/lib/eduTabs";
import { PAPAR_PENILAIAN_RAKAN } from "@/lib/ciriPaparan";
import { listClassEducators, getClass, listClassMembers, removeClassMember, listClassInvites, updateClass, endClass, reopenClass, addStudentScoreAdjustment, listStudentScoreAdjustments, deleteStudentScoreAdjustment, Klass, ClassInvite, StudentScoreAdjustment } from "@/lib/data";
import EducatorsCard from "@/components/EducatorsCard";
import InviteParticipantsModal from "@/components/InviteParticipantsModal";
import { useBahasa } from "@/lib/i18n/BahasaProvider";
import { LOKAL, terjemah, type Bahasa } from "@/lib/i18n";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  CardHead,
  CardLink,
  DataTable,
  EmptyState,
  Field,
  Input,
  Modal,
  Select,
  StatGroup,
  Textarea,
  type DataColumn,
} from "@/components/ui";

// Format tarikh sertai ikut bahasa semasa (en-GB / ms-MY).
function formatJoined(iso: string | null | undefined, bahasa: Bahasa) {
  if (!iso) return ",";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(LOKAL[bahasa], { month: "short", day: "numeric", year: "numeric" });
  } catch { return ","; }
}

// "Hari ini / Semalam" diterjemah melalui kamus, masa ikut lokal bahasa.
function formatLastActive(iso: string | null | undefined, bahasa: Bahasa) {
  if (!iso) return ",";
  try {
    const d = new Date(iso);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    const yest = new Date(now); yest.setDate(now.getDate() - 1);
    const isYest = d.toDateString() === yest.toDateString();
    const time = d.toLocaleTimeString(LOKAL[bahasa], { hour: "numeric", minute: "2-digit" });
    if (sameDay) return terjemah(bahasa, "educator.classDetail.today", { masa: time });
    if (isYest) return terjemah(bahasa, "educator.classDetail.yesterday", { masa: time });
    return d.toLocaleDateString(LOKAL[bahasa], { month: "short", day: "numeric", year: "numeric" }) + `, ${time}`;
  } catch { return ","; }
}

type SortKey = "recent" | "name" | "joined";

/** Ahli kelas seperti yang dikembalikan listClassMembers. */
type AhliKelas = {
  user_id: string;
  joined_at?: string | null;
  qm_profiles?: {
    display_name?: string | null;
    email?: string | null;
    last_active_at?: string | null;
  } | null;
};

export default function ClassDetail() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { t, bahasa } = useBahasa();
  const [klass, setKlass] = useState<Klass | null>(null);
  const confirm = useConfirm();
  const [members, setMembers] = useState<AhliKelas[]>([]);
  const [marksFor, setMarksFor] = useState<{ user_id: string; name: string } | null>(null);
  const [marksAdj, setMarksAdj] = useState<StudentScoreAdjustment[]>([]);
  const [marksDelta, setMarksDelta] = useState('');
  const [marksReason, setMarksReason] = useState('');
  const [marksSign, setMarksSign] = useState(1);
  const [marksBusy, setMarksBusy] = useState(false);
  // Modal jemputan peserta (QR, salin pautan, WhatsApp).
  const [inviteOpen, setInviteOpen] = useState(false);

  async function openMarks(m: AhliKelas) {
    const name = m.qm_profiles?.display_name || t('common.user', { id: String(m.user_id).slice(0, 8) });
    setMarksFor({ user_id: m.user_id, name });
    setMarksDelta(''); setMarksReason(''); setMarksSign(1);
    try { setMarksAdj(await listStudentScoreAdjustments(id, m.user_id)); } catch { setMarksAdj([]); }
  }
  async function submitMark() {
    if (!marksFor) return;
    const n = parseInt(marksDelta, 10);
    if (!n || n <= 0) return;
    setMarksBusy(true);
    try {
      await addStudentScoreAdjustment(id, marksFor.user_id, marksSign * n, marksReason.trim() || undefined);
      setMarksAdj(await listStudentScoreAdjustments(id, marksFor.user_id));
      setMarksDelta(''); setMarksReason('');
    } catch (e: unknown) { setMsg(e instanceof Error ? e.message : t('educator.classDetail.addMarkFailed')); }
    finally { setMarksBusy(false); }
  }
  async function removeMark(adjId: string) {
    setMarksBusy(true);
    try { await deleteStudentScoreAdjustment(adjId); if (marksFor) setMarksAdj(await listStudentScoreAdjustments(id, marksFor.user_id)); }
    catch (e: unknown) { setMsg(e instanceof Error ? e.message : t('educator.classDetail.deleteFailed')); }
    finally { setMarksBusy(false); }
  }
  const [educators, setEducators] = useState<Record<string, unknown>[]>([]);
  const [invites, setInvites] = useState<ClassInvite[]>([]);
  const [busy, setBusy] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  // Suntingan penerangan kelas, ikut corak butang Rename di atas.
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("recent");

  const reload = async () => {
    const k = await getClass(id); setKlass(k);
    setMembers(await listClassMembers(id));
    try { setEducators(await listClassEducators(id)); } catch { setEducators([]); }
    setInvites(await listClassInvites(id));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { reload(); }, [id]);

  const pendingInvites = invites.filter(i => !i.accepted_at).length;

  const filteredMembers = useMemo(() => {
    const q = search.trim().toLowerCase();
    let arr = [...members];
    if (q) {
      arr = arr.filter(m => {
        const name = (m.qm_profiles?.display_name || "").toLowerCase();
        const email = (m.qm_profiles?.email || "").toLowerCase();
        return name.includes(q) || email.includes(q);
      });
    }
    if (sortBy === "name") {
      arr.sort((a, b) => (a.qm_profiles?.display_name || "").localeCompare(b.qm_profiles?.display_name || ""));
    } else if (sortBy === "joined") {
      arr.sort((a, b) => new Date(a.joined_at || 0).getTime() - new Date(b.joined_at || 0).getTime());
    } else {
      arr.sort((a, b) => new Date(b.joined_at || 0).getTime() - new Date(a.joined_at || 0).getTime());
    }
    return arr;
  }, [members, search, sortBy]);

  if (!klass) return <Shell tabs={EDU_TABS}><p className="text-sm text-ink-muted">{t('common.loading')}</p></Shell>;

  // Lajur jadual ahli (DataTable kit, gaya "Students").
  const lajurAhli: DataColumn<AhliKelas>[] = [
    {
      key: "nama",
      header: t('educator.classDetail.colName'),
      render: (m, i) => (
        <span className="flex items-center gap-3 py-3 min-w-0">
          <Avatar name={m.qm_profiles?.display_name || t('common.user', { id: String(m.user_id).slice(0, 8) })} size="sm" index={i} />
          <span className="text-[13px] font-bold text-ink truncate min-w-0">{m.qm_profiles?.display_name || t('common.user', { id: String(m.user_id).slice(0, 8) })}</span>
        </span>
      ),
    },
    {
      key: "emel",
      header: t('educator.classDetail.colEmail'),
      hideOnMobile: true,
      render: (m) => <span className="text-[13px] text-ink-faint truncate">{m.qm_profiles?.email || ''}</span>,
    },
    {
      key: "status",
      header: t('educator.classDetail.colStatus'),
      render: () => <Badge variant="dot" warna="green">{t('educator.classDetail.statusActive')}</Badge>,
    },
    {
      key: "serta",
      header: t('educator.classDetail.colJoined'),
      hideOnMobile: true,
      render: (m) => <span className="text-[13px] text-ink-faint">{formatJoined(m.joined_at, bahasa)}</span>,
    },
    {
      key: "aktif",
      header: t('educator.classDetail.colLastActive'),
      hideOnMobile: true,
      render: (m) => <span className="text-[13px] text-ink-faint">{formatLastActive(m.qm_profiles?.last_active_at || m.joined_at, bahasa)}</span>,
    },
  ];

  return (
    <Shell tabs={EDU_TABS}>
      <ClassShell classId={klass.id} current="overview" klass={klass}>

      {/* Statistik: hanya nombor sebenar yang sudah dimuat. */}
      <Card className="mb-4">
        <StatGroup
          stats={[
            { label: t('common.members'), value: String(members.length) },
            { label: t('educator.classDetail.statActiveEducators'), value: String(educators.length) },
            { label: t('educator.classDetail.statPendingInvites'), value: String(pendingInvites) },
          ]}
        />
      </Card>

      {msg && (
        <Alert tone="info" icon={<Check className="w-4 h-4" />} className="mb-4">{msg}</Alert>
      )}

      {/* Butiran kelas: nama, penerangan, tamat kelas. */}
      <Card className="mb-4">
        <CardHead
          title={t('educator.classDetail.detailsTitle')}
          right={
            editingName ? (
              <span className="flex items-center gap-1">
                <Button
                  size="sm"
                  disabled={busy || !nameDraft.trim()}
                  onClick={async () => {
                    const v = nameDraft.trim();
                    if (!v || v === klass.name) { setEditingName(false); return; }
                    setBusy(true); setMsg(null);
                    try {
                      await updateClass(klass.id, { name: v });
                      setEditingName(false);
                      await reload();
                      setMsg(t('educator.classDetail.renamed'));
                    } catch (err: unknown) { setMsg(err instanceof Error ? err.message : t('educator.classDetail.renameFailed')); }
                    finally { setBusy(false); }
                  }}
                >
                  <Check className="w-4 h-4" /> {t('educator.classDetail.save')}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setEditingName(false)}>
                  <X className="w-4 h-4" /> {t('common.cancel')}
                </Button>
              </span>
            ) : (
              <Button variant="outline" size="sm" onClick={() => { setNameDraft(klass.name); setEditingName(true); }}>
                <Pencil className="w-3.5 h-3.5" /> {t('educator.classDetail.rename')}
              </Button>
            )
          }
        />
        <div className="mt-4">
          {editingName ? (
            <Field label={t('educator.classDetail.nameLabel')} htmlFor="nama-kelas">
              <Input id="nama-kelas" value={nameDraft} onChange={e => setNameDraft(e.target.value)} autoFocus />
            </Field>
          ) : (
            <p className="text-[14px] text-ink font-medium truncate">{klass.name}</p>
          )}
        </div>

        <div className="mt-4">
          {editingDesc ? (
            // Mod suntingan penerangan: textarea, kiraan aksara, simpan/buang/batal.
            <div>
              <Field label={t('educator.classDetail.descLabel')} htmlFor="penerangan-kelas">
                <Textarea id="penerangan-kelas" value={descDraft} onChange={e => setDescDraft(e.target.value)} maxLength={2000} rows={3} autoFocus />
              </Field>
              <div className="flex items-center justify-between gap-2 mt-2">
                <span className="text-[12px] text-ink-faint">{descDraft.length}/2000</span>
                <div className="flex items-center gap-2">
                  {klass.description && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={async () => {
                        const ok = await confirm({ title: t('educator.classDetail.removeDescConfirm'), tone: 'danger' });
                        if (!ok) return;
                        setBusy(true); setMsg(null);
                        try {
                          await updateClass(klass.id, { description: null });
                          setEditingDesc(false);
                          await reload();
                          setMsg(t('educator.classDetail.descRemoved'));
                        } catch (err) { setMsg(err instanceof Error ? err.message : t('educator.classDetail.removeDescFailed')); }
                        finally { setBusy(false); }
                      }}
                    >
                      <Trash2 className="w-3.5 h-3.5" /> {t('educator.classDetail.removeDesc')}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={async () => {
                      // Nilai disimpan trim; rentetan kosong disimpan sebagai null.
                      const v = descDraft.trim();
                      const next = v === "" ? null : v;
                      if (next === (klass.description ?? null)) { setEditingDesc(false); return; }
                      setBusy(true); setMsg(null);
                      try {
                        await updateClass(klass.id, { description: next });
                        setEditingDesc(false);
                        await reload();
                        setMsg(next ? t('educator.classDetail.descUpdated') : t('educator.classDetail.descRemoved'));
                      } catch (err) { setMsg(err instanceof Error ? err.message : t('educator.classDetail.updateDescFailed')); }
                      finally { setBusy(false); }
                    }}
                  >
                    <Check className="w-4 h-4" /> {t('educator.classDetail.save')}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setEditingDesc(false)}>
                    <X className="w-4 h-4" /> {t('common.cancel')}
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 flex-wrap">
              {klass.description
                ? <p className="text-[13px] text-ink-muted whitespace-pre-wrap break-words min-w-0">{klass.description}</p>
                : <p className="text-[13px] text-ink-faint">{t('educator.classDetail.noDesc')}</p>}
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => { setDescDraft(klass.description || ""); setEditingDesc(true); }}
              >
                <Pencil className="w-3.5 h-3.5" /> {klass.description ? t('educator.classDetail.editDesc') : t('educator.classDetail.addDesc')}
              </Button>
            </div>
          )}
        </div>

        {/* class-end-banner */}
        {klass.ended_at ? (
          <div className="mt-4 flex flex-wrap items-center gap-2 rounded-[4px] border border-[#f4bd0e]/50 bg-[#fef6e0] px-4 py-3 text-[13px] text-[#1f2b3a]">
            <Inbox className="w-4 h-4 shrink-0 text-[#96661a]" />
            <span className="flex-1 min-w-0">
              <span className="font-bold">{t('educator.classDetail.endedTitle')}</span>
              <span className="text-[#96661a]">{t('educator.classDetail.endedOn', { tarikh: new Date(klass.ended_at).toLocaleDateString(LOKAL[bahasa], { month: 'short', day: 'numeric', year: 'numeric' }) })}</span>
              <span className="text-[#96661a]"> {t('educator.classDetail.endedNote')}</span>
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={async () => {
                const ok = await confirm({ title: t('educator.classDetail.reopenConfirmTitle'), description: t('educator.classDetail.reopenConfirmDesc'), confirmLabel: t('educator.classDetail.reopenLabel'), tone: 'default' });
                if (!ok) return;
                setBusy(true); setMsg(null);
                try { await reopenClass(klass.id); setMsg(t('educator.classDetail.reopened')); await reload(); }
                catch (err: unknown) { setMsg(err instanceof Error ? err.message : t('educator.classDetail.reopenFailed')); }
                finally { setBusy(false); }
              }}
            >
              {t('educator.classDetail.reopenLabel')}
            </Button>
          </div>
        ) : (
          <div className="mt-4 flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={async () => {
                const ok = await confirm({ title: t('educator.classDetail.endConfirmTitle'), description: t('educator.classDetail.endConfirmDesc'), confirmLabel: t('educator.classDetail.endLabel'), tone: 'danger' });
                if (!ok) return;
                setBusy(true); setMsg(null);
                try { await endClass(klass.id); setMsg(t('educator.classDetail.ended')); await reload(); }
                catch (err: unknown) { setMsg(err instanceof Error ? err.message : t('educator.classDetail.endFailed')); }
                finally { setBusy(false); }
              }}
            >
              {t('educator.classDetail.endLabel')}
            </Button>
          </div>
        )}
      </Card>

      {/* Ketampakan papan pendahulu peserta. */}
      <Card className="mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <span
              aria-hidden="true"
              className={`flex h-10 w-10 items-center justify-center rounded-full shrink-0 ${klass.leaderboard_visible === false ? "bg-[#eff1f5] text-[#8094ae]" : "bg-[#e6fcf6] text-[#1ee0ac]"}`}
            >
              {klass.leaderboard_visible === false
                ? <EyeOff className="w-5 h-5" />
                : <Trophy className="w-5 h-5" />}
            </span>
            <div className="flex-1 min-w-0">
              <h3 className="text-[16.8px] font-bold text-ink">{t('educator.classDetail.leaderboardTitle')}</h3>
              <p className="text-[13px] text-ink-faint mt-0.5">
                {klass.leaderboard_visible === false
                  ? t('educator.classDetail.leaderboardHidden')
                  : t('educator.classDetail.leaderboardVisible')}
              </p>
            </div>
          </div>
          <Button
            variant={klass.leaderboard_visible === false ? "primary" : "outline"}
            size="sm"
            disabled={busy}
            onClick={async () => {
              const next = klass.leaderboard_visible === false;
              setBusy(true); setMsg(null);
              try {
                await updateClass(klass.id, { leaderboard_visible: next });
                await reload();
                setMsg(next ? t('educator.classDetail.leaderboardNowVisible') : t('educator.classDetail.leaderboardNowHidden'));
              } catch (err: unknown) {
                setMsg(err instanceof Error ? err.message : t('educator.classDetail.visibilityFailed'));
              } finally { setBusy(false); }
            }}
          >
            {klass.leaderboard_visible === false ? t('educator.classDetail.show') : t('educator.classDetail.hide')}
          </Button>
        </div>
      </Card>

      {/* Jemputan peserta: kod kelas + modal QR. */}
      <Card className="mb-4">
        <CardHead
          title={t('educator.classDetail.inviteTitle')}
          subtitle={t('educator.classDetail.inviteSubtitle')}
        />
        <div className="mt-4 flex flex-wrap items-stretch gap-3">
          <div className="flex-1 min-w-[180px] rounded-[4px] bg-[#f5f6fa] border border-hairline px-4 py-3 flex items-center justify-center font-mono text-lg tracking-[0.3em] font-bold text-ink">{klass.join_code}</div>
          <Button
            variant="outline"
            onClick={() => { navigator.clipboard.writeText(klass.join_code); setMsg(t('educator.classDetail.codeCopied')); }}
          >
            <Copy className="w-4 h-4" /> {t('educator.classDetail.copy')}
          </Button>
          <Button onClick={() => setInviteOpen(true)}>
            <UserPlus className="w-4 h-4" /> {t('educator.classDetail.inviteTitle')}
          </Button>
        </div>
      </Card>

      <InviteParticipantsModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        joinCode={klass.join_code}
        className={klass.name}
      />

      {/* Pusingan penilaian rakan sebaya (disembunyikan melalui ciriPaparan). */}
      {PAPAR_PENILAIAN_RAKAN && (
      <Card className="mb-4">
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className="flex h-10 w-10 items-center justify-center rounded-full bg-[#ebe2ff] text-brand-purple shrink-0">
            <ClipboardList className="w-5 h-5" />
          </span>
          <div className="flex-1 min-w-0">
            <h3 className="text-[16.8px] font-bold text-ink">{t('educator.classDetail.peerReviewTitle')}</h3>
            <p className="text-[13px] text-ink-faint mt-0.5">{t('educator.classDetail.peerReviewDesc')}</p>
          </div>
          <CardLink href={`/educator/classes/${klass.id}/peer-review`}>{t('educator.classDetail.open')}</CardLink>
        </div>
      </Card>
      )}

      {/* Senarai ahli. */}
      <div id="member-list" className="mb-4">
        <DataTable
          label={t('educator.classDetail.tableLabel')}
          columns={lajurAhli}
          rows={filteredMembers}
          rowKey={(m) => String(m.user_id)}
          head={
            <>
              <span className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-faint pointer-events-none" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t('educator.classDetail.searchPlaceholder')}
                  aria-label={t('educator.classDetail.searchAria')}
                  className="h-9 w-56 rounded-[6px] border border-hairline bg-white pl-9 pr-3 text-[13px] outline-none focus:border-brand-purple"
                />
              </span>
              <Select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortKey)}
                aria-label={t('educator.classDetail.sortAria')}
                className="w-56"
              >
                <option value="recent">{t('educator.classDetail.sortRecent')}</option>
                <option value="name">{t('educator.classDetail.sortName')}</option>
                <option value="joined">{t('educator.classDetail.sortOldest')}</option>
              </Select>
            </>
          }
          menuItems={(m) => [
            { label: t('educator.classDetail.menuMarks'), icon: <Award className="w-4 h-4" />, onSelect: () => openMarks(m) },
            {
              label: t('educator.classDetail.menuRemove'),
              icon: <Trash2 className="w-4 h-4" />,
              danger: true,
              onSelect: async () => {
                const ok = await confirm({ title: t('educator.classDetail.removeConfirm'), tone: 'danger' });
                if (ok) { await removeClassMember(id, m.user_id); reload(); }
              },
            },
          ]}
          menuLabel={t('educator.classDetail.menuLabel')}
          empty={
            <EmptyState
              icon={<Users className="w-6 h-6" />}
              title={t('educator.classDetail.emptyTitle')}
              text={members.length === 0
                ? t('educator.classDetail.emptyNone')
                : t('educator.classDetail.emptySearch')}
            />
          }
        />
      </div>

      {/* Pengurusan pendidik (komponen sedia ada di bawah). */}
      <div id="educators-section">
        <EducatorsCard classId={id} />
      </div>

      {/* Laci markah bonus & penalti. */}
      <Modal
        open={!!marksFor}
        onClose={() => setMarksFor(null)}
        title={t('educator.classDetail.marksTitle')}
        footer={
          <Button variant="outline" size="sm" onClick={() => setMarksFor(null)}>{t('educator.classDetail.close')}</Button>
        }
      >
        {marksFor && (
          <>
            <p className="text-[13px] text-ink-faint mb-4">{marksFor.name}</p>
            <div className="bg-[#ebe2ff] border border-[#ebe2ff] rounded-[4px] px-4 py-3 mb-4 flex items-center justify-between">
              <span className="text-[14px] text-ink-muted">{t('educator.classDetail.adjustTotal')}</span>
              <span className={`font-extrabold text-[18px] ${marksAdj.reduce((t, a) => t + a.delta, 0) >= 0 ? 'text-[#1ee0ac]' : 'text-[#e85347]'}`}>
                {marksAdj.reduce((t, a) => t + a.delta, 0) >= 0 ? '+' : ''}{marksAdj.reduce((t, a) => t + a.delta, 0)}
              </span>
            </div>
            <div className="space-y-3 mb-4">
              <div className="flex gap-2">
                <span className="inline-flex rounded-[4px] overflow-hidden border border-hairline">
                  <button
                    type="button"
                    onClick={() => setMarksSign(1)}
                    aria-pressed={marksSign === 1}
                    aria-label={t('educator.classDetail.bonusAria')}
                    className={`w-11 h-9 flex items-center justify-center ${marksSign === 1 ? 'bg-[#1ee0ac] text-white' : 'bg-white text-ink-muted'}`}
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setMarksSign(-1)}
                    aria-pressed={marksSign === -1}
                    aria-label={t('educator.classDetail.penaltyAria')}
                    className={`w-11 h-9 flex items-center justify-center ${marksSign === -1 ? 'bg-[#e85347] text-white' : 'bg-white text-ink-muted'}`}
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                </span>
                <Input
                  value={marksDelta}
                  onChange={(e) => setMarksDelta(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder={t('common.points')}
                  className="w-28"
                  aria-label={t('common.points')}
                />
                <Input
                  value={marksReason}
                  onChange={(e) => setMarksReason(e.target.value)}
                  placeholder={t('educator.classDetail.reasonPlaceholder')}
                  className="flex-1 min-w-[8rem]"
                  aria-label={t('educator.classDetail.reasonAria')}
                />
              </div>
              <Button
                disabled={!marksDelta || marksBusy}
                onClick={submitMark}
                className="w-full"
              >
                {marksSign === 1 ? t('educator.classDetail.awardBonus') : t('educator.classDetail.awardPenalty')}
              </Button>
            </div>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {marksAdj.length === 0
                ? <p className="text-[12px] text-ink-faint text-center py-3">{t('educator.classDetail.noAdjustments')}</p>
                : marksAdj.map(a => (
                  <div key={a.id} className="flex items-center gap-2 py-1.5 px-2 rounded-[4px] hover:bg-[#f8f9fc] text-[13px]">
                    <span className={`font-bold w-12 ${a.delta >= 0 ? 'text-[#1ee0ac]' : 'text-[#e85347]'}`}>{a.delta >= 0 ? '+' : ''}{a.delta}</span>
                    <span className="flex-1 text-ink-muted text-[12px] truncate">{a.reason || t('educator.classDetail.noReason')}</span>
                    <button
                      type="button"
                      onClick={() => removeMark(a.id)}
                      disabled={marksBusy}
                      aria-label={t('educator.classDetail.deleteAdjAria', { nilai: a.delta })}
                      className="text-ink-faint hover:text-[#e85347]"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
            </div>
          </>
        )}
      </Modal>
      </ClassShell>
    </Shell>
  );
}