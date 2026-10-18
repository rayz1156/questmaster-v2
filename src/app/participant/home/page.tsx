"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Home, Compass, Trophy, User as UserIcon, Users, GraduationCap, Zap, ClipboardList, BarChart3, ArrowRight, Megaphone, CheckCircle2, Clock, Star, KeyRound, BookOpen } from "lucide-react";
import Shell from "@/components/Shell";
import { useSession } from "@/lib/session";
import { listQuestsForParticipant, listEnrolledClasses, getMyProfile, listClassTeamScores, joinClassByCode, leaveClassAsStudent, type Hunt } from "@/lib/data";
import { supabase } from "@/lib/supabaseClient";
import { teks } from "@/i18n/teks";

const tabs = [
  { href: '/participant/home', label: teks.peserta.tabUtama, icon: <Home className="w-5 h-5" /> },
      { href: '/participant/learning', label: teks.peserta.tabPembelajaran, icon: <BookOpen className="w-5 h-5" /> },
      { href: '/participant/activities', label: teks.peserta.tabAktiviti, icon: <Compass className="w-5 h-5" /> },
  { href: '/participant/teams', label: teks.peserta.tabPasukan, icon: <Users className="w-5 h-5" /> },
    { href: '/participant/leaderboard', label: teks.peserta.tabKedudukan, icon: <Trophy className="w-5 h-5" /> },
  { href: '/participant/profile', label: teks.peserta.tabProfil, icon: <UserIcon className="w-5 h-5" /> },
];

function initials(s: string) {
  const parts = (s || '').trim().split(/\s+/).slice(0,2);
  return parts.map(p => p[0]?.toUpperCase() || '').join('') || '?';
}

export default function Page() {
  const { user } = useSession('participant');
  const [hunts, setHunts] = useState<Hunt[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [name, setName] = useState<string>("");
  const [dataReady, setDataReady] = useState(false);
  const [activeClassId, setActiveClassId] = useState<string>("");
  const [scores, setScores] = useState<any[]>([]);
  const [joinCode, setJoinCode] = useState<string>("");
  const [joinBusy, setJoinBusy] = useState(false);
  const [joinErr, setJoinErr] = useState<string | null>(null);
  const [joinOk, setJoinOk] = useState<string | null>(null);
  const onJoinClass = async (e: any) => {
    e.preventDefault();
    if (!joinCode.trim()) return;
    setJoinErr(null); setJoinOk(null); setJoinBusy(true);
    try {
      await joinClassByCode(joinCode.trim().toUpperCase());
      setJoinOk(teks.peserta.berjayaSertai);
      setTimeout(() => { window.location.reload(); }, 700);
    } catch (err: any) {
      const msg = String(err?.message || teks.peserta.gagal);
      setJoinErr(/Invalid class code/i.test(msg) ? teks.peserta.kodTidakSah(joinCode.trim().toUpperCase()) : msg);
    } finally {
      setJoinBusy(false);
    }
  };
  const [myTeamId, setMyTeamId] = useState<string | null>(null);
  const [scoresLoading, setScoresLoading] = useState(false);

  useEffect(() => { if (!user) return; (async () => {
    const [h, c, p] = await Promise.all([
      listQuestsForParticipant(),
      listEnrolledClasses(),
      getMyProfile(),
    ]);
    setHunts(h);
    setClasses(c);
    setName(p?.display_name || "");
    if (c && c.length > 0) setActiveClassId((c[0] as any).id);
    setDataReady(true);
  })(); }, [user]);

  // Ambil papan pendahulu kelas + pasukan saya untuk kelas aktif
  useEffect(() => {
    if (!activeClassId || !user) { setScores([]); setMyTeamId(null); return; }
    setScoresLoading(true);
    (async () => {
      try {
        const list = await listClassTeamScores(activeClassId);
        const sorted = (list as any[]).slice().sort((a, b) => (Number(b.total_score)||0) - (Number(a.total_score)||0));
        setScores(sorted);
      } catch { setScores([]); }
      try {
        const { data } = await supabase
          .from('lms_team_members')
          .select('team_id, lms_teams!inner(class_id)')
          .eq('user_id', (user as any).id)
          .eq('lms_teams.class_id', activeClassId)
          .maybeSingle();
        setMyTeamId((data as any)?.team_id ?? null);
      } catch { setMyTeamId(null); }
      setScoresLoading(false);
    })();
  }, [activeClassId, user]);

  const activeClass = useMemo(() => classes.find((c: any) => c.id === activeClassId), [classes, activeClassId]);
  const activeQuests = useMemo(() => hunts.filter((h: any) => activeClassId ? h.class_id === activeClassId : true), [hunts, activeClassId]);
  const activeQuestCount = activeQuests.length;
  const myTeamRow = useMemo(() => scores.find((s: any) => s.team_id === myTeamId), [scores, myTeamId]);
  const myRank = useMemo(() => myTeamId ? (scores.findIndex((s: any) => s.team_id === myTeamId) + 1) : 0, [scores, myTeamId]);
  const totalPoints = Number(myTeamRow?.total_score) || 0;
  const top4 = scores.slice(0, 4);

  const medalBg = ['bg-gradient-to-br from-amber-300 to-yellow-500', 'bg-gradient-to-br from-slate-300 to-slate-400', 'bg-gradient-to-br from-orange-400 to-amber-700'];
  const teamPalette = ['bg-emerald-100 text-emerald-700','bg-primary-subtle text-primary-hover','bg-pink-100 text-pink-700','bg-sky-100 text-sky-700','bg-amber-100 text-amber-700'];

  return (
    <Shell tabs={tabs}>
      <div className="space-y-5">
        {/* Hero aluan */}
        <div className="relative overflow-hidden rounded bg-primary-subtle border border-primary-subtle p-6 sm:p-8">
          <div className="relative z-10 max-w-[60%]">
            <div className="text-xs font-semibold text-primary-hover tracking-widest mb-1">{teks.peserta.aluanPinggir}</div>
            <div className="text-3xl sm:text-4xl font-extrabold text-slate-900">{dataReady ? (name || teks.peserta.peserta) : ''}</div>
            <div className="mt-2 text-sm text-slate-600">{teks.peserta.aluanCepat} <span className="text-amber-500">⭐</span></div>
          </div>
          <div aria-hidden className="hidden sm:block absolute right-6 top-1/2 -translate-y-1/2 text-7xl select-none">
            <span className="inline-block">🏆</span>
          </div>
        </div>

        {/* Pemilih kelas + Tindakan pantas (kiri)  Papan Pengenalan (kanan) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="space-y-5 lg:col-span-1">
            <div className="bg-white rounded shadow-sm border border-slate-200 p-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="inline-flex items-center justify-center w-9 h-9 rounded bg-primary-subtle text-primary"><Users className="w-5 h-5" /></span>
                <span className="font-semibold text-slate-800">{teks.peserta.pilihKelas}</span>
              </div>
              {classes.length === 0 ? (
                <p className="text-sm text-slate-500">{teks.peserta.belumSertai} <Link href="/participant/join" className="text-primary-hover underline">{teks.peserta.belumSertaiLink}</Link>.</p>
              ) : (
                <select value={activeClassId} onChange={e => setActiveClassId(e.target.value)} className="w-full px-3 py-2.5 rounded border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/40">
                  {classes.map((c: any) => (<option key={c.id} value={c.id}>{c.name}</option>))}
                </select>
              )}
              <div className="mt-3 flex items-center gap-2 text-xs text-status-success">
                <span className="inline-block w-2 h-2 rounded-full bg-status-success" />
                <span>{teks.peserta.kelasAktif}</span>
              </div>
                {activeClass?.ended_at && (
                  <div data-class-banner="ended" className="mt-3 flex items-start gap-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    <span className="mt-0.5 inline-block w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold">{teks.peserta.kelasTamat}</div>
                      <div className="text-amber-700 mt-0.5">{teks.peserta.kelasTamatSub}</div>
                    </div>
                  </div>
                )}
              {activeClassId && (
                <button
                  type="button"
                  onClick={async () => {
                    const target = classes.find((c: any) => c.id === activeClassId);
                    if (!target) return;
                    if (!confirm(teks.peserta.tinggalkanSoalan(target.name))) return;
                    try {
                      await leaveClassAsStudent(activeClassId);
                      const remaining = classes.filter((c: any) => c.id !== activeClassId);
                      setClasses(remaining);
                      setActiveClassId(remaining[0]?.id || "");
                    } catch (err: any) {
                      alert(err?.message || teks.peserta.gagalTinggalkan);
                    }
                  }}
                  className="mt-3 w-full text-xs font-medium text-rose-600 hover:text-white hover:bg-rose-500 border border-rose-200 hover:border-rose-500 rounded px-3 py-2 transition"
                >
                  {teks.peserta.tinggalkanButang}
                </button>
              )}
            </div>

            <div className="bg-white rounded shadow-sm border border-slate-200 p-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="inline-flex items-center justify-center w-9 h-9 rounded bg-primary-subtle text-primary"><KeyRound className="w-5 h-5" /></span>
                <span className="font-semibold text-slate-800">{teks.peserta.sertaiKelas}</span>
              </div>
              <form onSubmit={onJoinClass} className="space-y-2">
                <input
                  type="text"
                  value={joinCode}
                  onChange={e => { setJoinCode(e.target.value.toUpperCase()); setJoinErr(null); }}
                  placeholder="ABCD1234"
                  maxLength={16}
                  required
                  className="w-full px-3 py-2.5 rounded border border-slate-200 bg-white text-center font-mono text-lg uppercase tracking-wider focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
                <button
                  type="submit"
                  disabled={joinBusy || !joinCode.trim()}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded bg-primary text-white text-sm font-semibold hover:bg-primary-hover disabled:opacity-60 disabled:cursor-not-allowed transition"
                >
                  {joinBusy ? teks.peserta.menyertai : (<><Compass className="w-4 h-4" /> {teks.peserta.sertaiButang}</>)}
                </button>
              </form>
              {joinErr && <p className="mt-2 text-xs text-status-danger">{joinErr}</p>}
              {joinOk && <p className="mt-2 text-xs text-status-success">{joinOk}</p>}
              {!joinErr && !joinOk && <p className="mt-3 text-xs text-slate-500">{teks.peserta.masukkanKod}</p>}
            </div>
          </div>

          {/* Papan Pengenalan */}
          <div className="relative overflow-hidden bg-white rounded shadow-sm border border-slate-200 p-6">
            <div className="flex items-start gap-3">
              <span className="inline-flex items-center justify-center w-10 h-10 rounded bg-primary-subtle text-primary shrink-0"><ClipboardList className="w-5 h-5" /></span>
              <div className="flex-1">
                <div className="text-xl font-bold text-slate-900">{teks.peserta.papanPengenalan}</div>
                {activeClass && (<div className="mt-1 inline-block text-xs font-medium text-primary-hover bg-primary-subtle px-3 py-1 rounded-full">{activeClass.name}</div>)}
                <p className="mt-3 text-sm text-slate-600 max-w-md">{teks.peserta.pengenalanSub}</p>
                <ul className="mt-4 space-y-2 text-sm text-slate-700">
                  <li className="flex items-center gap-2"><Clock className="w-4 h-4 text-primary" /> {teks.peserta.maklumatKelas}</li>
                  <li className="flex items-center gap-2"><Megaphone className="w-4 h-4 text-primary" /> {teks.peserta.pengumuman}</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-primary" /> {teks.peserta.garisPanduan}</li>
                </ul>
              </div>
              <div aria-hidden className="hidden sm:flex w-32 h-32 rounded-full bg-primary-subtle items-center justify-center shrink-0"><ClipboardList className="w-16 h-16 text-primary" /></div>
            </div>
            {activeClassId ? (
              <Link href={`/participant/classes/${activeClassId}/board`} className="mt-5 flex items-center justify-center gap-2 w-full bg-primary hover:bg-primary-hover text-white font-semibold py-3 rounded transition">
                {teks.peserta.bukaPapanPengenalan} <ArrowRight className="w-4 h-4" />
              </Link>
            ) : (
              <button disabled className="mt-5 flex items-center justify-center gap-2 w-full bg-slate-200 text-slate-500 font-semibold py-3 rounded cursor-not-allowed">{teks.peserta.pilihUntukPengenalan}</button>
            )}
          </div>

        {/* Papan Pembelajaran */}
        <div className="relative overflow-hidden bg-white rounded shadow-sm border border-slate-200 p-6">
          <div className="flex items-start gap-3">
            <span className="inline-flex items-center justify-center w-10 h-10 rounded bg-emerald-100 text-emerald-700 shrink-0"><BookOpen className="w-5 h-5" /></span>
            <div className="flex-1">
              <div className="text-xl font-bold text-slate-900">{teks.peserta.papanPembelajaran}</div>
              {activeClass && (<div className="mt-1 inline-block text-xs font-medium text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full">{activeClass.name}</div>)}
              <p className="mt-3 text-sm text-slate-600 max-w-md">{teks.peserta.pembelajaranSub}</p>
              <ul className="mt-4 space-y-2 text-sm text-slate-700">
                <li className="flex items-center gap-2"><ClipboardList className="w-4 h-4 text-emerald-600" /> {teks.peserta.modulPelajaran}</li>
                <li className="flex items-center gap-2"><Star className="w-4 h-4 text-emerald-600" /> {teks.peserta.bahanPembelajaran}</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-600" /> {teks.peserta.jejakKemajuan}</li>
              </ul>
            </div>
            <div aria-hidden className="hidden sm:flex w-32 h-32 rounded-full bg-emerald-50 items-center justify-center shrink-0"><BookOpen className="w-16 h-16 text-emerald-500" /></div>
          </div>
          {activeClassId ? (
            <Link href={`/participant/classes/${activeClassId}/learning-board`} className="mt-5 flex items-center justify-center gap-2 w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 rounded transition">
              {teks.peserta.teruskanPembelajaran} <ArrowRight className="w-4 h-4" />
            </Link>
          ) : (
            <button disabled className="mt-5 flex items-center justify-center gap-2 w-full bg-slate-200 text-slate-500 font-semibold py-3 rounded cursor-not-allowed">{teks.peserta.pilihUntukPembelajaran}</button>
          )}
        </div>
        </div>

        {/* 3 kad statistik */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-primary-subtle rounded p-5 flex items-center gap-4">
            <span className="inline-flex items-center justify-center w-14 h-14 rounded bg-white text-primary shrink-0"><ClipboardList className="w-7 h-7" /></span>
            <div className="min-w-0">
              <div className="text-3xl font-extrabold text-primary-hover">{dataReady ? activeQuestCount : 0}</div>
              <div className="font-semibold text-slate-800">{teks.peserta.aktivitiAktif}</div>
              <div className="text-xs text-slate-500 mt-0.5">{teks.peserta.teruskanAktiviti}</div>
              <Link href="/participant/activities" className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-primary-hover hover:text-primary">{teks.peserta.pergiAktiviti} <ArrowRight className="w-3 h-3" /></Link>
            </div>
          </div>
          <div className="bg-emerald-50 rounded p-5 flex items-center gap-4">
            <span className="inline-flex items-center justify-center w-14 h-14 rounded bg-emerald-100 text-emerald-700 shrink-0"><Trophy className="w-7 h-7" /></span>
            <div className="min-w-0">
              <div className="text-3xl font-extrabold text-emerald-700">{totalPoints.toLocaleString()}</div>
              <div className="font-semibold text-slate-800">{teks.peserta.jumlahMata}</div>
              <div className="text-xs text-slate-500 mt-0.5">{totalPoints > 0 ? teks.peserta.mataBagus : teks.peserta.mataKosong}</div>
            </div>
          </div>
          <div className="bg-orange-50 rounded p-5 flex items-center gap-4">
            <span className="inline-flex items-center justify-center w-14 h-14 rounded bg-orange-100 text-orange-700 shrink-0"><BarChart3 className="w-7 h-7" /></span>
            <div className="min-w-0">
              <div className="text-3xl font-extrabold text-orange-700">{myRank > 0 ? `#${myRank}` : '-'}</div>
              <div className="font-semibold text-slate-800">{teks.peserta.kedudukanPapan}</div>
              <div className="text-xs text-slate-500 mt-0.5">{myRank > 0 && myRank <= 3 ? teks.peserta.tigaTeratas : myRank > 0 ? teks.peserta.dakiLagi : teks.peserta.sertaiUntukKedudukan}</div>
            </div>
          </div>
        </div>

        {/* Papan Pendahulu Kelas */}
        <div className="bg-white rounded shadow-sm border border-slate-200 p-5">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="flex items-start gap-3">
              <span className="inline-flex items-center justify-center w-10 h-10 rounded bg-primary-subtle text-primary shrink-0"><BarChart3 className="w-5 h-5" /></span>
              <div>
                <div className="font-bold text-slate-900">{teks.peserta.papanPendahuluKelas}</div>
                <div className="text-xs text-slate-500">{teks.peserta.terbaik}{activeClass ? teks.peserta.terbaikDalam(activeClass.name) : ''}</div>
              </div>
            </div>
            <Link href="/participant/leaderboard" className="text-sm font-semibold text-primary-hover hover:text-primary inline-flex items-center gap-1">{teks.peserta.lihatPapanPenuh} <ArrowRight className="w-4 h-4" /></Link>
          </div>

          {scoresLoading ? (
            <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-14 bg-slate-100 rounded animate-pulse" />)}</div>
          ) : top4.length === 0 ? (
            <p className="text-sm text-slate-500 py-6 text-center">{teks.peserta.belumSkor}</p>
          ) : (
            <div className="space-y-2">
              {top4.map((r: any, idx: number) => {
                const isMine = r.team_id === myTeamId;
                return (
                  <div key={r.team_id} className={`flex items-center gap-3 p-3 rounded border transition ${isMine ? 'bg-primary-subtle border-primary/40' : 'border-slate-200 hover:border-primary/40'}`}>
                    <span className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm ${idx < 3 ? `${medalBg[idx]} text-white` : 'bg-slate-100 text-slate-600'}`}>
                      {idx + 1}
                    </span>
                    <span className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs ${teamPalette[idx % teamPalette.length]}`}>
                      {initials(r.team_name || teks.peserta.pasukanNama(String(r.team_id).slice(0,2)))}
                    </span>
                    <div className="flex-1 min-w-0">
                      <span className="font-semibold text-slate-900 truncate">{r.team_name || teks.peserta.pasukanNama(String(r.team_id).slice(0,8))}</span>
                      {isMine && <span className="ml-2 text-xs text-primary-hover font-medium">{teks.peserta.pasukanAnda}</span>}
                    </div>
                    <div className="text-primary-hover font-bold text-sm whitespace-nowrap">{(Number(r.total_score)||0).toLocaleString()} {teks.peserta.mata}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Sepanduk pengaki */}
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-100 rounded p-4">
          <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-amber-100 text-amber-600 shrink-0"><Star className="w-5 h-5" /></span>
          <div className="flex-1 text-sm text-slate-700">{teks.peserta.pengaki}</div>
          <Link href="/participant/activities" className="text-sm font-semibold text-amber-600 hover:text-amber-800 inline-flex items-center gap-1 whitespace-nowrap">{teks.peserta.pergiAktiviti} <ArrowRight className="w-4 h-4" /></Link>
        </div>
      </div>
    </Shell>
  );
}
