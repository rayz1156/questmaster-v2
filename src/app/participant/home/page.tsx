"use client";

/**
 * Papan pemuka peserta, rupa LMS Oktober 2026 (KZ-020).
 *
 * Susun atur papan pemuka gaya LMS: kepala blok "Dashboard", kad
 * lebar penuh "My Progress" dengan carta bar markah kelas, kad
 * "Live now" / "Next up", kad "My Activities" / "Leaderboard",
 * kad "Your class" dan kaki tindakan kelas.
 *
 * Kekal dari KZ-018/KZ-018b: pilih kelas aktif (susunKelas/statusKelas),
 * banner kelas tamat, CertificateNameBanner, PeerReviewBanner, keadaan
 * kosong "Join your first class", borang kod kelas (joinClassByCode /
 * normalizeClassCode) dan "Leave this class". Logik tulen berada dalam
 * src/lib/papanPemukaPeserta.ts. Komponen Versi 2 tidak digunakan lagi.
 */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, BookOpen, ClipboardList, CopyPlus } from "lucide-react";
import ParticipantShell from "@/components/ParticipantShell";
import PeerReviewBanner from "@/components/PeerReviewBanner";
import CertificateNameBanner from "@/components/CertificateNameBanner";
import {
  listQuestsForParticipant,
  listEnrolledClasses,
  getMyProfile,
  listClassTeamScores,
  listClassIndividualScores,
  listMyClassActivity,
  joinClassByCode,
  normalizeClassCode,
  leaveClassAsStudent,
  type Hunt,
  type Klass,
  type ClassTeamScore,
  type ClassIndividualScore,
} from "@/lib/data";
import { useSession } from "@/lib/session";
import { statusKelas, susunKelas, type AktivitiKelas, type KelasUntukStatus } from "@/lib/kelasStatus";
import { KUNCI_KELAS_AKTIF } from "@/lib/kelasNav";
import {
  atas5DenganSaya,
  ayatKedudukan,
  bahagiAktiviti,
  dataCartaBar,
  inisial,
  kedudukanSaya,
  labelTarikhQuest,
  pilihAktivitiSeterusnya,
  pilihSesiTerkini,
  sesiBolehMasuk,
  warnaIndeks,
} from "@/lib/papanPemukaPeserta";
import { supabase } from "@/lib/supabaseClient";

/** Satu sesi kuiz langsung daripada /api/participant/live-now. */
type SesiLive = {
  code: string;
  title: string | null;
  class_id: string | null;
  class_name: string | null;
  status: string;
  player_count: number;
  started_at: string | null;
};

/** Baris teratas papan pendahulu yang siap dipapar. */
type BarisSkor = { id: string; label: string; skor: number };

/** Baris senarai "My Activities" yang siap dipapar. */
type BarisAktivitiUi = {
  id: string;
  tajuk: string;
  kelasNama: string;
  indeksKelas: number;
  labelTarikh: string;
  segera: boolean;
  tamat: boolean;
  href: string;
};

/** Tarikh ringkas "24 Oct" untuk lajur tarikh. */
function tarikhRingkas(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export default function Page() {
  const { user } = useSession("participant");
  const [hunts, setHunts] = useState<Hunt[]>([]);
  const [classes, setClasses] = useState<Klass[]>([]);
  const [aktiviti, setAktiviti] = useState<AktivitiKelas[]>([]);
  const [name, setName] = useState<string>("");
  const [dataReady, setDataReady] = useState(false);
  const [activeClassId, setActiveClassId] = useState<string>("");
  const [scores, setScores] = useState<ClassTeamScore[]>([]);
  const [indivScores, setIndivScores] = useState<ClassIndividualScore[]>([]);
  const [joinCode, setJoinCode] = useState<string>("");
  const [joinBusy, setJoinBusy] = useState(false);
  const [joinErr, setJoinErr] = useState<string | null>(null);
  const [joinOk, setJoinOk] = useState<string | null>(null);
  const [borangJoin, setBorangJoin] = useState(false);

  // Pasukan saya merentas kelas: peta class_id -> { team_id, team_name }.
  const [pasukanSaya, setPasukanSaya] = useState<Map<string, { team_id: string; team_name: string | null }>>(new Map());
  // Sesi kuiz langsung yang boleh dimasuki, daripada /api/participant/live-now.
  const [sesiLive, setSesiLive] = useState<SesiLive[]>([]);
  // Penapis "My Activities": Active / Ended.
  const [tabAktiviti, setTabAktiviti] = useState<"Active" | "Ended">("Active");
  // Togol "Leaderboard": Teams / Individuals, lalai ikut scoring_mode kelas.
  const [modPapan, setModPapan] = useState<"Teams" | "Individuals">("Teams");

  const onJoinClass = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!joinCode.trim()) return;
    setJoinErr(null); setJoinOk(null); setJoinBusy(true);
    try {
      // Kod dinormalisasi supaya jarak, sengkang dan huruf O/I/L diterima.
      await joinClassByCode(normalizeClassCode(joinCode));
      setJoinOk("Joined! Reloading…");
      setTimeout(() => { window.location.reload(); }, 700);
    } catch (err: unknown) {
      const msg = String((err as { message?: string })?.message || "Failed");
      setJoinErr(/Invalid class code/i.test(msg) ? "Code not found. Please check the code with your educator." : msg);
    } finally {
      setJoinBusy(false);
    }
  };

  useEffect(() => { if (!user) return; (async () => {
    const [h, c, p, ak] = await Promise.all([
      listQuestsForParticipant(),
      listEnrolledClasses(),
      getMyProfile(),
      listMyClassActivity().catch(() => [] as AktivitiKelas[]),
    ]);
    setHunts(h);
    setClasses(c);
    setAktiviti(ak);
    setName(p?.display_name || "");
    // Kelas lalai: kelas aktif pertama ikut susunKelas; jika tiada kelas
    // aktif, kelas tamat pertama.
    const urutan = susunKelas(c, ak);
    const lalai = urutan.find(k => statusKelas(k) === "aktif") ?? urutan[0];
    if (lalai) setActiveClassId(lalai.id);
    setDataReady(true);
  })(); }, [user]);

  // KZ-022c: ingat kelas yang dipilih supaya Intro Board dan Learning Board
  // di menu sisi memaut ke kelas yang sama. Storan disekat: abaikan.
  useEffect(() => {
    if (!activeClassId) return;
    try {
      window.localStorage.setItem(KUNCI_KELAS_AKTIF, activeClassId);
      window.dispatchEvent(new Event(KUNCI_KELAS_AKTIF));
    } catch { /* abaikan */ }
  }, [activeClassId]);

  // Pasukan saya merentas semua kelas (satu pertanyaan sahaja).
  useEffect(() => {
    if (!user) { setPasukanSaya(new Map()); return; }
    (async () => {
      try {
        const { data } = await supabase
          .from('qm_team_members')
          .select('team_id, qm_teams!inner(class_id, name)')
          .eq('user_id', user.id);
        const peta = new Map<string, { team_id: string; team_name: string | null }>();
        const baris = ((data ?? []) as unknown as Array<{ team_id: string; qm_teams: { class_id: string; name: string | null } }>) || [];
        for (const r of baris) {
          if (r.qm_teams?.class_id) {
            peta.set(String(r.qm_teams.class_id), { team_id: String(r.team_id), team_name: r.qm_teams.name ?? null });
          }
        }
        setPasukanSaya(peta);
      } catch { setPasukanSaya(new Map()); }
    })();
  }, [user]);

  // Markah kelas aktif: pasukan dan individu.
  useEffect(() => {
    if (!activeClassId || !user) { setScores([]); setIndivScores([]); return; }
    // Keselamatan (KZ-023 B1): apabila pendidik menyembunyikan leaderboard
    // kelas ini, simpan baris milik sendiri sahaja (mata sendiri kekal),
    // supaya markah dan nama rakan sekelas tidak dipapar.
    const sorok = classes.find((c) => c.id === activeClassId)?.leaderboard_visible === false;
    const pasukanIni = pasukanSaya.get(activeClassId)?.team_id ?? null;
    (async () => {
      try {
        const list = await listClassTeamScores(activeClassId);
        const tapis = sorok ? list.filter((r) => r.team_id === pasukanIni) : list;
        setScores(tapis.slice().sort((a, b) => (Number(b.total_score)||0) - (Number(a.total_score)||0)));
      } catch { setScores([]); }
      try {
        const is = await listClassIndividualScores(activeClassId);
        const tapis = sorok ? is.filter((r) => r.user_id === user.id) : is;
        setIndivScores(tapis.slice().sort((a, b) => (Number(b.total_score)||0) - (Number(a.total_score)||0)));
      } catch { setIndivScores([]); }
    })();
  }, [activeClassId, user, pasukanSaya, classes]);

  // Tinjau sesi langsung setiap 30 saat; berhenti apabila tab tersembunyi.
  useEffect(() => {
    if (!user) return;
    let henti = false;
    const tinjau = async () => {
      if (typeof document === "undefined" || document.visibilityState !== "visible") return;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) return;
        const r = await fetch("/api/participant/live-now", {
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: "no-store",
        });
        if (!r.ok) return; // 401/429/500: cuba lagi pada kitaran berikutnya
        const j = await r.json();
        if (!henti && Array.isArray(j?.data)) setSesiLive(j.data);
      } catch {
        // Senyap: tinjauan seterusnya akan cuba semula.
      }
    };
    tinjau();
    const pemasa = setInterval(tinjau, 30_000);
    const onNampak = () => { if (document.visibilityState === "visible") tinjau(); };
    document.addEventListener("visibilitychange", onNampak);
    return () => {
      henti = true;
      clearInterval(pemasa);
      document.removeEventListener("visibilitychange", onNampak);
    };
  }, [user]);

  const activeClass = useMemo(() => classes.find((c) => c.id === activeClassId), [classes, activeClassId]);
  const myUserId = user?.id ?? null;
  const myTeamId = useMemo(
    () => (activeClassId ? pasukanSaya.get(activeClassId)?.team_id ?? null : null),
    [pasukanSaya, activeClassId]
  );
  const myTeamRow = useMemo(
    () => scores.find((s) => s.team_id === myTeamId) ?? null,
    [scores, myTeamId]
  );
  const myIndivRow = useMemo(
    () => indivScores.find((s) => s.user_id === myUserId) ?? null,
    [indivScores, myUserId]
  );

  // Kelas dalam mod individu: kedudukan dan mata daripada view markah individu.
  const modIndividu = activeClass?.scoring_mode === "individual";
  const totalPoints = modIndividu
    ? Number(myIndivRow?.total_score) || 0
    : Number(myTeamRow?.total_score) || 0;
  const myRank = modIndividu
    ? kedudukanSaya(indivScores, (s) => s.user_id, (s) => Number(s.total_score) || 0, myUserId)
    : kedudukanSaya(scores, (s) => s.team_id, (s) => Number(s.total_score) || 0, myTeamId);
  // Leaderboard disembunyikan pendidik: tiada kedudukan, carta atau papan kedudukan.
  const papanSorok = activeClass?.leaderboard_visible === false;

  // Baris di atas saya (untuk ayat jarak). Kedudukan baris atas dikira
  // mengikut markah sebenar, jadi ayat kekal betul bila seri.
  const barisAtas: { nama: string; skor: number; kedudukan: number } | null = useMemo(() => {
    if (myRank <= 1) return null;
    const senarai: Array<{ id: string; nama: string; skor: number }> = modIndividu
      ? indivScores.map((s) => ({ id: s.user_id, nama: s.display_name || "Student", skor: Number(s.total_score) || 0 }))
      : scores.map((s) => ({ id: s.team_id, nama: s.team_name || "Team", skor: Number(s.total_score) || 0 }));
    // Baris tepat di atas saya: markah TERENDAH yang masih melebihi markah saya (kzsec M1).
    const atas = senarai.reduce<(typeof senarai)[number] | null>((terbaik, r) => (r.skor > totalPoints && (!terbaik || r.skor < terbaik.skor) ? r : terbaik), null);
    if (!atas) return null;
    return {
      nama: atas.nama,
      skor: atas.skor,
      kedudukan: kedudukanSaya(senarai, (r) => r.id, (r) => r.skor, atas.id),
    };
  }, [myRank, modIndividu, indivScores, scores, totalPoints]);
  const ayatJarak = ayatKedudukan(myRank, totalPoints, barisAtas);

  // Peta nama kelas dan indeks kelas (untuk warna petak inisial stabil).
  const namaKelas = useMemo(() => {
    const peta = new Map<string, string>();
    for (const c of classes) peta.set(c.id, c.name);
    return peta;
  }, [classes]);
  const indeksKelas = useMemo(() => {
    const urutan = susunKelas(classes, aktiviti);
    const peta = new Map<string, number>();
    urutan.forEach((c: KelasUntukStatus, i: number) => peta.set(c.id, i));
    return peta;
  }, [classes, aktiviti]);

  // Semua quest merentas kelas, dibahagi penapis Active / Ended.
  const semuaTab = useMemo(() => bahagiAktiviti(hunts), [hunts]);
  const barisAktif: BarisAktivitiUi[] = useMemo(
    () => kawalBarisAktiviti(semuaTab.aktif, false, namaKelas, indeksKelas),
    [semuaTab, namaKelas, indeksKelas]
  );
  const barisTamat: BarisAktivitiUi[] = useMemo(
    () => kawalBarisAktiviti(semuaTab.tamat, true, namaKelas, indeksKelas),
    [semuaTab, namaKelas, indeksKelas]
  );
  const barisPapar = tabAktiviti === "Active" ? barisAktif : barisTamat;

  // Aktiviti "Next up": aktif dengan end_at terdekat (logik tulen).
  const aktivitiSeterusnya: { id: string; title: string; kelasNama: string; labelTarikh: string } | null = useMemo(() => {
    const pilihan = pilihAktivitiSeterusnya(semuaTab.aktif);
    if (!pilihan) return null;
    return {
      id: pilihan.id,
      title: pilihan.title,
      kelasNama: namaKelas.get(pilihan.class_id ?? "") || "Class",
      labelTarikh: labelTarikhQuest(pilihan.end_at, false).label,
    };
  }, [semuaTab, namaKelas]);

  // Sesi LIVE: yang terkini jadi wira, yang lain pautan "Also live".
  const sesiSusun = useMemo(() => {
    const sen = (sesiLive || []).filter((s) => sesiBolehMasuk(s.status));
    const hero = pilihSesiTerkini(sen);
    if (!hero) return [] as SesiLive[];
    return [hero, ...sen.filter((s) => s !== hero)];
  }, [sesiLive]);
  const sesiHero = sesiSusun[0] ?? null;

  // Baris papan pendahulu ternormalizasi (pasukan dan individu).
  const barisPasukan: BarisSkor[] = useMemo(
    () => scores.map((r) => ({
      id: r.team_id,
      label: r.team_name || "Team " + String(r.team_id).slice(0, 8),
      skor: Number(r.total_score) || 0,
    })),
    [scores]
  );
  const barisIndividu: BarisSkor[] = useMemo(
    // Papar nama paparan sahaja; tiada emel dan tiada id pengguna lain.
    () => indivScores.map((r) => ({
      id: r.user_id,
      label: r.display_name || "Student",
      skor: Number(r.total_score) || 0,
    })),
    [indivScores]
  );

  // Mod papan lalai mengikut scoring_mode kelas aktif.
  useEffect(() => { setModPapan(modIndividu ? "Individuals" : "Teams"); }, [modIndividu]);
  const barisPapan = modPapan === "Teams" ? barisPasukan : barisIndividu;
  const idPapan = modPapan === "Teams" ? myTeamId : myUserId;
  const potongan = atas5DenganSaya(barisPapan, (r) => r.id, (r) => r.skor, idPapan);

  // Data carta bar My Progress: 12 teratas kelas ikut mod pemarkahan.
  const carta = useMemo(
    () => dataCartaBar(
      modIndividu ? barisIndividu : barisPasukan,
      (r) => r.id,
      (r) => r.label,
      (r) => r.skor,
      modIndividu ? myUserId : myTeamId,
      12
    ),
    [modIndividu, barisIndividu, barisPasukan, myUserId, myTeamId]
  );

  return (
    <ParticipantShell>
      <div className="flex min-w-0 flex-col gap-6">

        {/* Kepala blok: tajuk, keterangan, pemilih kelas, butang kanan. */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="page-title">Dashboard</h1>
            <p className="page-subtitle">Welcome back, {name || "student"}.</p>
            {classes.length > 1 && (
              <select
                value={activeClassId}
                onChange={e => setActiveClassId(e.target.value)}
                aria-label="Active class"
                className="input mt-3 w-auto"
              >
                {/* Pemilih mengasingkan kelas aktif dan kelas tamat (V2-005). */}
                <optgroup label="Active">
                  {susunKelas(classes.filter((c: KelasUntukStatus) => statusKelas(c) === "aktif"), aktiviti).map((c: KelasUntukStatus) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </optgroup>
                <optgroup label="Ended">
                  {susunKelas(classes.filter((c: KelasUntukStatus) => statusKelas(c) === "tamat"), aktiviti).map((c: KelasUntukStatus) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </optgroup>
              </select>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setBorangJoin(v => !v)} className="btn-secondary">
              <CopyPlus className="w-4 h-4" /> Enter class code
            </button>
            <Link href="/live" className="btn-primary">Join live quiz</Link>
          </div>
        </div>

        {/* Borang kod kelas, dibuka butang "Enter class code". */}
        {borangJoin && (
          <section className="card">
            <h2 className="section-title">Enter class code</h2>
            <p className="mt-1 text-[13px] text-ink-faint">Enter the class code your educator gave you.</p>
            <form onSubmit={onJoinClass} className="mt-4 flex flex-wrap items-center gap-2">
              <input
                type="text"
                inputMode="text"
                autoComplete="off"
                value={joinCode}
                onChange={e => { setJoinCode(e.target.value.toUpperCase()); setJoinErr(null); }}
                placeholder="e.g. AB12CD"
                maxLength={16}
                aria-label="Class code"
                className="input w-[180px]"
              />
              <button type="submit" disabled={joinBusy || !joinCode.trim()} className="btn-primary">
                {joinBusy ? "Joining…" : "Join"}
              </button>
            </form>
            {joinErr && <p className="mt-2 text-sm text-kz-down">{joinErr}</p>}
            {joinOk && <p className="mt-2 text-sm text-kz-up">{joinOk}</p>}
          </section>
        )}

        {/* Banner sedia ada: kelas tamat, nama sijil, semakan rakan. */}
        {activeClass?.ended_at && (
          <div data-class-banner="ended" className="card border-l-4 border-l-kz-warn p-4 text-sm text-ink-muted">
            <span className="font-bold text-ink">This class has ended.</span> You can still review the Intro Board, Learning Board, Activities and the final ranking. New submissions are closed.
          </div>
        )}
        <CertificateNameBanner />
        <PeerReviewBanner />

        {dataReady && classes.length === 0 ? (
          // Keadaan kosong: peserta tanpa kelas.
          <section className="card">
            <h2 className="section-title">Join your first class</h2>
            <p className="mt-1 text-sm text-ink-muted">
              Enter the class code your educator gave you.
            </p>
            <form onSubmit={onJoinClass} className="mt-4 flex flex-wrap items-center gap-2">
              <input
                type="text"
                inputMode="text"
                autoComplete="off"
                value={joinCode}
                onChange={e => { setJoinCode(e.target.value.toUpperCase()); setJoinErr(null); }}
                placeholder="e.g. AB12CD"
                maxLength={16}
                required
                aria-label="Class code"
                className="input w-[180px]"
              />
              <button type="submit" disabled={joinBusy || !joinCode.trim()} className="btn-primary">
                {joinBusy ? "Joining…" : "Join"}
              </button>
            </form>
            {joinErr && <p className="mt-2 text-sm text-kz-down">{joinErr}</p>}
            {joinOk && <p className="mt-2 text-sm text-kz-up">{joinOk}</p>}
          </section>
        ) : (
          <>

            {/* Kad lebar penuh: My Progress + carta bar markah kelas. */}
            {dataReady && (
              <section className="card" aria-label="My progress">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="section-title">My Progress</h2>
                    <p className="text-[13px] text-ink-faint">{activeClass?.name || ""}</p>
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap items-start gap-x-14 gap-y-4">
                  <div>
                    <div className="amount">{totalPoints.toLocaleString()}</div>
                    <div className="mt-1 text-[13px] text-ink-faint">Total points</div>
                  </div>
                  {!papanSorok && (
                    <div>
                      <div className="amount">{myRank > 0 ? `#${myRank}` : "-"}</div>
                      <div className="mt-1 text-[13px] text-ink-faint">Class rank</div>
                    </div>
                  )}
                  {ayatJarak && !papanSorok && (
                    <p className="max-w-[360px] self-end text-[13px] leading-snug text-ink-muted">
                      #{myRank} {ayatJarak}
                    </p>
                  )}
                </div>

                {/* Carta bar mudah (div sahaja): 12 teratas kelas, bar saya biru. */}
                {carta.length > 0 && !papanSorok && (
                  <div className="mt-6 flex h-[120px] items-end gap-1.5" role="img" aria-label="Class scores">
                    {carta.map((b) => (
                      <div
                        key={b.baris.id}
                        title={`${b.label}: ${b.skor.toLocaleString()} pts`}
                        className="min-h-[2px] flex-1 rounded-t-[2px]"
                        style={{
                          height: `${Math.max(b.nisbah * 100, 1)}%`,
                          backgroundColor: b.saya ? "#6576ff" : "#e5e9ff",
                        }}
                      />
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* Baris dua kad: Live now dan Next up. */}
            {dataReady && (
              <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <section className="card" aria-label="Live now">
                  <div className="flex items-center gap-2">
                    {sesiHero && (
                      <span className="inline-flex items-center gap-1.5 text-[13px] font-bold text-kz-down">
                        <span className="h-1.5 w-1.5 rounded-full bg-kz-down motion-safe:animate-pulse-dot" />
                        LIVE
                      </span>
                    )}
                    <h2 className="section-title">Live now</h2>
                  </div>
                  {sesiHero ? (
                    <>
                      <p className="mt-4 text-[15px] font-bold text-ink">{sesiHero.title || "Live Quiz"}</p>
                      <p className="text-[13px] text-ink-faint">
                        {sesiHero.class_name || "Class"} · {sesiHero.player_count} classmates in
                      </p>
                      <Link href={`/live/${encodeURIComponent(sesiHero.code)}`} className="btn-primary mt-4">
                        Join now
                      </Link>
                      {sesiSusun.length > 1 && (
                        <div className="mt-3 flex flex-col gap-1">
                          {sesiSusun.slice(1).map((s) => (
                            <Link
                              key={s.code}
                              href={`/live/${encodeURIComponent(s.code)}`}
                              className="text-[13px] text-brand-purple hover:underline"
                            >
                              Also live: {s.title || "Live Quiz"} · {s.code}
                            </Link>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="mt-4 text-sm text-ink-faint">No live quiz right now.</p>
                  )}
                </section>

                <section className="card" aria-label="Next up">
                  <h2 className="section-title">Next up</h2>
                  {aktivitiSeterusnya ? (
                    <>
                      <p className="mt-4 text-[15px] font-bold text-ink">{aktivitiSeterusnya.title}</p>
                      <p className="text-[13px] text-ink-faint">
                        {aktivitiSeterusnya.kelasNama}
                        {aktivitiSeterusnya.labelTarikh ? ` · ${aktivitiSeterusnya.labelTarikh}` : ""}
                      </p>
                      <Link
                        href={`/participant/activities?hunt=${encodeURIComponent(aktivitiSeterusnya.id)}`}
                        className="mt-4 inline-flex text-[13px] font-bold text-brand-purple hover:underline"
                      >
                        Continue
                      </Link>
                    </>
                  ) : (
                    <p className="mt-4 text-sm text-ink-faint">{"You're all caught up."}</p>
                  )}
                </section>
              </div>
            )}

            {/* Baris dua kad: My Activities dan Leaderboard. */}
            {dataReady && (
              <div className={`grid grid-cols-1 gap-6 ${papanSorok ? "" : "xl:grid-cols-2"}`}>
                <section className="card p-0" aria-label="My activities">
                  <div className="flex flex-wrap items-center justify-between gap-2 px-6 pb-3 pt-5">
                    <h2 className="section-title">My Activities</h2>
                    <div className="flex gap-1" role="tablist" aria-label="Activity status">
                      {(["Active", "Ended"] as const).map((t) => (
                        <button
                          key={t}
                          type="button"
                          role="tab"
                          aria-selected={tabAktiviti === t}
                          onClick={() => setTabAktiviti(t)}
                          className={`rounded-md px-2.5 py-1 text-[12px] font-bold transition ${
                            tabAktiviti === t ? "bg-kz-menu-active text-brand-purple" : "text-ink-faint hover:text-ink"
                          }`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    {barisPapar.length === 0 ? (
                      <p className="px-6 pb-5 pt-2 text-sm text-ink-faint">
                        {tabAktiviti === "Active" ? "No active activities right now." : "No ended activities yet."}
                      </p>
                    ) : (
                      barisPapar.map((q) => {
                        const warna = warnaIndeks(q.indeksKelas);
                        return (
                          <div key={q.id} className="list-row flex items-center gap-3">
                            <span
                              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[4px] text-[14px] font-bold"
                              style={{ backgroundColor: warna.latar, color: warna.teks }}
                              aria-hidden="true"
                            >
                              {inisial(q.tajuk)}
                            </span>
                            <div className="min-w-0 flex-1">
                              <Link href={q.href} className="block truncate text-[14px] font-medium text-ink hover:text-brand-purple">
                                {q.tajuk}
                              </Link>
                              <div className="truncate text-xs text-ink-faint">{q.kelasNama}</div>
                            </div>
                            <span className={`shrink-0 text-[13px] ${q.segera ? "font-bold text-kz-down" : "text-ink-faint"}`}>
                              {q.labelTarikh}
                            </span>
                          </div>
                        );
                      })
                    )}
                  </div>
                </section>

                {!papanSorok && (<section className="card" aria-label="Leaderboard">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="section-title">Leaderboard</h2>
                    <div className="flex gap-1" role="tablist" aria-label="Leaderboard mode">
                      {(["Teams", "Individuals"] as const).map((m) => (
                        <button
                          key={m}
                          type="button"
                          role="tab"
                          aria-selected={modPapan === m}
                          onClick={() => setModPapan(m)}
                          className={`rounded-md px-2.5 py-1 text-[12px] font-bold transition ${
                            modPapan === m ? "bg-kz-menu-active text-brand-purple" : "text-ink-faint hover:text-ink"
                          }`}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  </div>
                  <ul className="mt-3 flex flex-col gap-0.5">
                    {potongan.atas.length === 0 && (
                      <li className="py-3 text-sm text-ink-faint">No scores yet.</li>
                    )}
                    {potongan.atas.map((p) => (
                      <BarisPapanKunci key={p.baris.id} p={p} modPasukan={modPapan === "Teams"} indeks={p.kedudukan} />
                    ))}
                    {potongan.terpisah && <li className="my-1 border-t border-kz-line" aria-hidden="true" />}
                    {potongan.saya && (
                      <BarisPapanKunci p={potongan.saya} modPasukan={modPapan === "Teams"} indeks={potongan.saya.kedudukan} />
                    )}
                  </ul>
                  <Link href="/participant/leaderboard" className="mt-4 inline-flex text-[13px] font-bold text-brand-purple hover:underline">
                    View All
                  </Link>
                </section>)}
              </div>
            )}

            {/* Kad Your class: Intro Board dan Learning Board. */}
            {dataReady && (
              <section className="card p-0" aria-label="Your class">
                <h2 className="section-title px-6 pb-3 pt-5">Your class</h2>
                {[
                  { hrefSuffix: "/board", label: "Intro Board", ikon: ClipboardList },
                  { hrefSuffix: "/learning-board", label: "Learning Board", ikon: BookOpen },
                ].map((p) => {
                  const aktif = !!activeClassId;
                  const href = aktif
                    ? `/participant/classes/${encodeURIComponent(activeClassId)}${p.hrefSuffix}`
                    : "#";
                  const Ikon = p.ikon;
                  return (
                    <Link
                      key={p.label}
                      href={href}
                      aria-disabled={!aktif}
                      className={`list-row flex items-center gap-3 transition hover:bg-canvas ${aktif ? "" : "pointer-events-none opacity-50"}`}
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[4px] bg-kz-accent-soft text-brand-purple">
                        <Ikon className="h-5 w-5" aria-hidden="true" />
                      </span>
                      <span className="flex-1 text-[14px] font-medium text-ink">{p.label}</span>
                      <ArrowRight className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden="true" />
                    </Link>
                  );
                })}
              </section>
            )}

            {/* Kaki: sertai kelas lain dan tinggalkan kelas semasa. */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-kz-line pt-4">
              <Link href="/participant/join" className="text-[13px] font-bold text-brand-purple hover:underline">
                Join another class
              </Link>
              {activeClassId && (
                <button
                  type="button"
                  onClick={async () => {
                    const target = classes.find((c) => c.id === activeClassId);
                    if (!target) return;
                    if (!confirm(`Leave "${target.name}"? You will lose access to its activities and rankings.`)) return;
                    try {
                      await leaveClassAsStudent(activeClassId);
                      const remaining = classes.filter((c) => c.id !== activeClassId);
                      setClasses(remaining);
                      // Pilih semula kelas lalai: aktif dahulu, kemudian tamat.
                      const urutanBaki = susunKelas(remaining, aktiviti);
                      const lalai = urutanBaki.find(k => statusKelas(k) === "aktif") ?? urutanBaki[0];
                      setActiveClassId(lalai ? lalai.id : "");
                    } catch (err: unknown) {
                      alert((err as { message?: string })?.message || "Failed to leave class");
                    }
                  }}
                  className="text-[13px] font-bold text-kz-down hover:underline"
                >
                  Leave this class
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </ParticipantShell>
  );
}

/** Satu baris kad Leaderboard: avatar inisial, nama, sub, mata. */
function BarisPapanKunci({
  p,
  modPasukan,
  indeks,
}: {
  p: { baris: BarisSkor; kedudukan: number; saya: boolean };
  modPasukan: boolean;
  indeks: number;
}) {
  const warna = warnaIndeks(indeks - 1);
  const sub = p.saya ? (modPasukan ? "Your team" : "You") : modPasukan ? "Team" : "";
  return (
    <li className={`flex items-center gap-3 rounded-md px-2 py-2 ${p.saya ? "bg-canvas" : ""}`}>
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[13px] font-bold"
        style={{ backgroundColor: warna.latar, color: warna.teks }}
        aria-hidden="true"
      >
        {inisial(p.baris.label)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-medium text-ink">{p.baris.label}</div>
        {sub && <div className="text-xs text-ink-faint">{sub}</div>}
      </div>
      <span className="shrink-0 text-[14px] font-bold text-ink">{p.baris.skor.toLocaleString()}</span>
    </li>
  );
}

/** Bina baris My Activities siap papar daripada senarai aktiviti. */
function kawalBarisAktiviti(
  senarai: Hunt[],
  tamat: boolean,
  namaKelas: Map<string, string>,
  indeksKelas: Map<string, number>
): BarisAktivitiUi[] {
  return senarai.map((h) => {
    const label = labelTarikhQuest(h.end_at, tamat);
    return {
      id: h.id,
      tajuk: h.title,
      kelasNama: namaKelas.get(h.class_id ?? "") || "Class",
      indeksKelas: indeksKelas.get(h.class_id ?? "") ?? 0,
      labelTarikh: label.label || (tamat ? "Ended" : tarikhRingkas(h.end_at) || "Open"),
      segera: label.segera,
      tamat,
      href: `/participant/activities?hunt=${encodeURIComponent(h.id)}`,
    };
  });
}
