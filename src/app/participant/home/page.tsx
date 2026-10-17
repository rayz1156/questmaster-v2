"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Home, Compass, Trophy, User as UserIcon, Users, GraduationCap, Zap, ClipboardList, BarChart3, ArrowRight, Megaphone, CheckCircle2, Clock, Star, KeyRound, BookOpen } from "lucide-react";
import Shell from "@/components/Shell";
import { useSession } from "@/lib/session";
import { listQuestsForParticipant, listEnrolledClasses, getMyProfile, listClassTeamScores, joinClassByCode, leaveClassAsStudent, type Hunt } from "@/lib/data";
import { supabase } from "@/lib/supabaseClient";

const tabs = [
  { href: '/participant/home', label: 'Utama', icon: <Home className="w-5 h-5" /> },
      { href: '/participant/learning', label: 'Pembelajaran', icon: <BookOpen className="w-5 h-5" /> },
      { href: '/participant/activities', label: 'Aktiviti', icon: <Compass className="w-5 h-5" /> },
  { href: '/participant/teams', label: 'Pasukan', icon: <Users className="w-5 h-5" /> },
    { href: '/participant/leaderboard', label: 'Kedudukan', icon: <Trophy className="w-5 h-5" /> },
  { href: '/participant/profile', label: 'Profil', icon: <UserIcon className="w-5 h-5" /> },
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
      setJoinOk("Berjaya disertai! Memuatkan semula…");
      setTimeout(() => { window.location.reload(); }, 700);
    } catch (err: any) {
      const msg = String(err?.message || "Gagal");
      setJoinErr(/Invalid class code/i.test(msg) ? `Kod "${joinCode.trim().toUpperCase()}" tidak sah. Sila semak dengan pendidik anda.` : msg);
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
            <div className="text-xs font-semibold text-primary-hover tracking-widest mb-1">✋ SELAMAT DATANG</div>
            <div className="text-3xl sm:text-4xl font-extrabold text-slate-900">{dataReady ? (name || 'Peserta') : ''}</div>
            <div className="mt-2 text-sm text-slate-600">Terus belajar, terus berkembang! Anda sedang hebat! <span className="text-amber-500">⭐</span></div>
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
                <span className="font-semibold text-slate-800">Pilih kelas anda</span>
              </div>
              {classes.length === 0 ? (
                <p className="text-sm text-slate-500">Belum sertai mana-mana kelas. <Link href="/participant/join" className="text-primary-hover underline">Sertai satu</Link>.</p>
              ) : (
                <select value={activeClassId} onChange={e => setActiveClassId(e.target.value)} className="w-full px-3 py-2.5 rounded border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/40">
                  {classes.map((c: any) => (<option key={c.id} value={c.id}>{c.name}</option>))}
                </select>
              )}
              <div className="mt-3 flex items-center gap-2 text-xs text-status-success">
                <span className="inline-block w-2 h-2 rounded-full bg-status-success" />
                <span>Kelas aktif</span>
              </div>
                {activeClass?.ended_at && (
                  <div data-class-banner="ended" className="mt-3 flex items-start gap-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    <span className="mt-0.5 inline-block w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold">Kelas ini telah tamat.</div>
                      <div className="text-amber-700 mt-0.5">Anda masih boleh menyemak Papan Pembelajaran, Aktiviti dan Kedudukan akhir. Penghantaran baharu telah ditutup.</div>
                    </div>
                  </div>
                )}
              {activeClassId && (
                <button
                  type="button"
                  onClick={async () => {
                    const target = classes.find((c: any) => c.id === activeClassId);
                    if (!target) return;
                    if (!confirm(`Tinggalkan "${target.name}"? Anda akan hilang akses kepada aktiviti dan kedudukannya.`)) return;
                    try {
                      await leaveClassAsStudent(activeClassId);
                      const remaining = classes.filter((c: any) => c.id !== activeClassId);
                      setClasses(remaining);
                      setActiveClassId(remaining[0]?.id || "");
                    } catch (err: any) {
                      alert(err?.message || "Gagal meninggalkan kelas");
                    }
                  }}
                  className="mt-3 w-full text-xs font-medium text-rose-600 hover:text-white hover:bg-rose-500 border border-rose-200 hover:border-rose-500 rounded px-3 py-2 transition"
                >
                  Tinggalkan kelas ini
                </button>
              )}
            </div>

            <div className="bg-white rounded shadow-sm border border-slate-200 p-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="inline-flex items-center justify-center w-9 h-9 rounded bg-primary-subtle text-primary"><KeyRound className="w-5 h-5" /></span>
                <span className="font-semibold text-slate-800">Sertai Kelas</span>
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
                  {joinBusy ? "Menyertai…" : (<><Compass className="w-4 h-4" /> Sertai kelas</>)}
                </button>
              </form>
              {joinErr && <p className="mt-2 text-xs text-status-danger">{joinErr}</p>}
              {joinOk && <p className="mt-2 text-xs text-status-success">{joinOk}</p>}
              {!joinErr && !joinOk && <p className="mt-3 text-xs text-slate-500">Masukkan kod kelas yang diberikan oleh pendidik anda.</p>}
            </div>
          </div>

          {/* Papan Pengenalan */}
          <div className="relative overflow-hidden bg-white rounded shadow-sm border border-slate-200 p-6">
            <div className="flex items-start gap-3">
              <span className="inline-flex items-center justify-center w-10 h-10 rounded bg-primary-subtle text-primary shrink-0"><ClipboardList className="w-5 h-5" /></span>
              <div className="flex-1">
                <div className="text-xl font-bold text-slate-900">Papan Pengenalan</div>
                {activeClass && (<div className="mt-1 inline-block text-xs font-medium text-primary-hover bg-primary-subtle px-3 py-1 rounded-full">{activeClass.name}</div>)}
                <p className="mt-3 text-sm text-slate-600 max-w-md">Semua yang anda perlukan untuk bermula dalam kelas anda. Cari maklumat kelas, pengumuman dan garis panduan.</p>
                <ul className="mt-4 space-y-2 text-sm text-slate-700">
                  <li className="flex items-center gap-2"><Clock className="w-4 h-4 text-primary" /> Maklumat kelas</li>
                  <li className="flex items-center gap-2"><Megaphone className="w-4 h-4 text-primary" /> Pengumuman</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-primary" /> Garis panduan &amp; sumber</li>
                </ul>
              </div>
              <div aria-hidden className="hidden sm:flex w-32 h-32 rounded-full bg-primary-subtle items-center justify-center shrink-0"><ClipboardList className="w-16 h-16 text-primary" /></div>
            </div>
            {activeClassId ? (
              <Link href={`/participant/classes/${activeClassId}/board`} className="mt-5 flex items-center justify-center gap-2 w-full bg-primary hover:bg-primary-hover text-white font-semibold py-3 rounded transition">
                Buka Papan Pengenalan <ArrowRight className="w-4 h-4" />
              </Link>
            ) : (
              <button disabled className="mt-5 flex items-center justify-center gap-2 w-full bg-slate-200 text-slate-500 font-semibold py-3 rounded cursor-not-allowed">Pilih kelas untuk membuka Papan Pengenalan</button>
            )}
          </div>

        {/* Papan Pembelajaran */}
        <div className="relative overflow-hidden bg-white rounded shadow-sm border border-slate-200 p-6">
          <div className="flex items-start gap-3">
            <span className="inline-flex items-center justify-center w-10 h-10 rounded bg-emerald-100 text-emerald-700 shrink-0"><BookOpen className="w-5 h-5" /></span>
            <div className="flex-1">
              <div className="text-xl font-bold text-slate-900">Papan Pembelajaran</div>
              {activeClass && (<div className="mt-1 inline-block text-xs font-medium text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full">{activeClass.name}</div>)}
              <p className="mt-3 text-sm text-slate-600 max-w-md">Pusat pembelajaran harian anda. Akses modul, pelajaran dan bahan, serta jejak kemajuan anda.</p>
              <ul className="mt-4 space-y-2 text-sm text-slate-700">
                <li className="flex items-center gap-2"><ClipboardList className="w-4 h-4 text-emerald-600" /> Modul &amp; pelajaran</li>
                <li className="flex items-center gap-2"><Star className="w-4 h-4 text-emerald-600" /> Bahan pembelajaran</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-600" /> Jejak kemajuan anda</li>
              </ul>
            </div>
            <div aria-hidden className="hidden sm:flex w-32 h-32 rounded-full bg-emerald-50 items-center justify-center shrink-0"><BookOpen className="w-16 h-16 text-emerald-500" /></div>
          </div>
          {activeClassId ? (
            <Link href={`/participant/classes/${activeClassId}/learning-board`} className="mt-5 flex items-center justify-center gap-2 w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 rounded transition">
              Teruskan Pembelajaran <ArrowRight className="w-4 h-4" />
            </Link>
          ) : (
            <button disabled className="mt-5 flex items-center justify-center gap-2 w-full bg-slate-200 text-slate-500 font-semibold py-3 rounded cursor-not-allowed">Pilih kelas untuk membuka Papan Pembelajaran</button>
          )}
        </div>
        </div>

        {/* 3 kad statistik */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-primary-subtle rounded p-5 flex items-center gap-4">
            <span className="inline-flex items-center justify-center w-14 h-14 rounded bg-white text-primary shrink-0"><ClipboardList className="w-7 h-7" /></span>
            <div className="min-w-0">
              <div className="text-3xl font-extrabold text-primary-hover">{dataReady ? activeQuestCount : 0}</div>
              <div className="font-semibold text-slate-800">Aktiviti Aktif</div>
              <div className="text-xs text-slate-500 mt-0.5">Teruskan! Lengkapkan lebih banyak untuk meraih mata.</div>
              <Link href="/participant/activities" className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-primary-hover hover:text-primary">Pergi ke Aktiviti <ArrowRight className="w-3 h-3" /></Link>
            </div>
          </div>
          <div className="bg-emerald-50 rounded p-5 flex items-center gap-4">
            <span className="inline-flex items-center justify-center w-14 h-14 rounded bg-emerald-100 text-emerald-700 shrink-0"><Trophy className="w-7 h-7" /></span>
            <div className="min-w-0">
              <div className="text-3xl font-extrabold text-emerald-700">{totalPoints.toLocaleString()}</div>
              <div className="font-semibold text-slate-800">Jumlah Mata</div>
              <div className="text-xs text-slate-500 mt-0.5">{totalPoints > 0 ? 'Bagus! Terus mendaki papan pendahulu.' : 'Sertai pasukan dan raih mata untuk melihat skor anda.'}</div>
            </div>
          </div>
          <div className="bg-orange-50 rounded p-5 flex items-center gap-4">
            <span className="inline-flex items-center justify-center w-14 h-14 rounded bg-orange-100 text-orange-700 shrink-0"><BarChart3 className="w-7 h-7" /></span>
            <div className="min-w-0">
              <div className="text-3xl font-extrabold text-orange-700">{myRank > 0 ? `#${myRank}` : '—'}</div>
              <div className="font-semibold text-slate-800">Kedudukan Papan Pendahulu</div>
              <div className="text-xs text-slate-500 mt-0.5">{myRank > 0 && myRank <= 3 ? "Anda dalam 3 teratas. Teruskan!" : myRank > 0 ? 'Daki lebih tinggi — anda boleh buat!' : 'Sertai pasukan untuk dikedudukkan.'}</div>
            </div>
          </div>
        </div>

        {/* Papan Pendahulu Kelas */}
        <div className="bg-white rounded shadow-sm border border-slate-200 p-5">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="flex items-start gap-3">
              <span className="inline-flex items-center justify-center w-10 h-10 rounded bg-primary-subtle text-primary shrink-0"><BarChart3 className="w-5 h-5" /></span>
              <div>
                <div className="font-bold text-slate-900">Papan Pendahulu Kelas</div>
                <div className="text-xs text-slate-500">Terbaik{activeClass ? ` dalam ${activeClass.name}` : ''}</div>
              </div>
            </div>
            <Link href="/participant/leaderboard" className="text-sm font-semibold text-primary-hover hover:text-primary inline-flex items-center gap-1">Lihat papan pendahulu penuh <ArrowRight className="w-4 h-4" /></Link>
          </div>

          {scoresLoading ? (
            <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-14 bg-slate-100 rounded animate-pulse" />)}</div>
          ) : top4.length === 0 ? (
            <p className="text-sm text-slate-500 py-6 text-center">Belum ada skor pasukan untuk kelas ini.</p>
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
                      {initials(r.team_name || ('Pasukan ' + String(r.team_id).slice(0,2)))}
                    </span>
                    <div className="flex-1 min-w-0">
                      <span className="font-semibold text-slate-900 truncate">{r.team_name || ('Pasukan ' + String(r.team_id).slice(0,8))}</span>
                      {isMine && <span className="ml-2 text-xs text-primary-hover font-medium">(Pasukan Anda)</span>}
                    </div>
                    <div className="text-primary-hover font-bold text-sm whitespace-nowrap">{(Number(r.total_score)||0).toLocaleString()} mata</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Sepanduk pengaki */}
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-100 rounded p-4">
          <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-amber-100 text-amber-600 shrink-0"><Star className="w-5 h-5" /></span>
          <div className="flex-1 text-sm text-slate-700">Lengkapkan aktiviti, raih mata dan daki papan pendahulu!</div>
          <Link href="/participant/activities" className="text-sm font-semibold text-amber-600 hover:text-amber-800 inline-flex items-center gap-1 whitespace-nowrap">Pergi ke Aktiviti <ArrowRight className="w-4 h-4" /></Link>
        </div>
      </div>
    </Shell>
  );
}
