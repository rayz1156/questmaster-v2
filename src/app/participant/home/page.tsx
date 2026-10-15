"use client";

/**
 * Papan pemuka peserta, Versi 1 gaya HiStudy (KZ-018).
 *
 * Logik sedia ada dikekalkan: pilih kelas aktif (susunKelas/statusKelas),
 * banner kelas tamat, CertificateNameBanner, PeerReviewBanner, keadaan
 * kosong "Join your first class", borang sertai kelas, dan "Leave this
 * class". Susun atur baharu direka daripada komponen dalam
 * `src/components/participant-home/` dengan logik tulen daripada
 * `src/lib/papanPemukaPeserta.ts`.
 */

import ParticipantShell from "@/components/ParticipantShell";
import BannerProfil from "@/components/participant-home/BannerProfil";
import KadStatistik from "@/components/participant-home/KadStatistik";
import SenaraiAktiviti, { type BarisAktiviti } from "@/components/participant-home/SenaraiAktiviti";
import PanelPendahulu, { type BarisSkor } from "@/components/participant-home/PanelPendahulu";
import PautanKelas from "@/components/participant-home/PautanKelas";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  listQuestsForParticipant,
  listEnrolledClasses,
  getMyProfile,
  listClassTeamScores,
  listClassIndividualScores,
  joinClassByCode,
  normalizeClassCode,
  leaveClassAsStudent,
  listMyClassActivity,
  type Hunt,
  type ClassIndividualScore,
} from "@/lib/data";
import { useSession } from "@/lib/session";
import { statusKelas, susunKelas, type AktivitiKelas, type KelasUntukStatus } from "@/lib/kelasStatus";
import { bahagiAktiviti, kedudukanSaya, peneranganTarikh } from "@/lib/papanPemukaPeserta";
import { supabase } from "@/lib/supabaseClient";
import PeerReviewBanner from "@/components/PeerReviewBanner";
import CertificateNameBanner from "@/components/CertificateNameBanner";

// Format tarikh ringkas untuk baris maklumat kad aktiviti (kalendar en-GB).
const formatTarikh = (iso: string | null | undefined) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};

export default function Page() {
  const { user } = useSession("participant");
  const [hunts, setHunts] = useState<Hunt[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [aktiviti, setAktiviti] = useState<AktivitiKelas[]>([]);
  const [name, setName] = useState<string>("");
  const [dataReady, setDataReady] = useState(false);
  const [activeClassId, setActiveClassId] = useState<string>("");
  const [scores, setScores] = useState<any[]>([]);
  const [indivScores, setIndivScores] = useState<ClassIndividualScore[]>([]);
  const [joinCode, setJoinCode] = useState<string>("");
  const [joinBusy, setJoinBusy] = useState(false);
  const [joinErr, setJoinErr] = useState<string | null>(null);
  const [joinOk, setJoinOk] = useState<string | null>(null);
  const [bukaSertai, setBukaSertai] = useState(false);
  const [myTeamId, setMyTeamId] = useState<string | null>(null);
  const [scoresLoading, setScoresLoading] = useState(false);
  // Rujukan borang sertai di kaki halaman; butang banner membuka dan menatal ke sana.
  const rujukanSertai = useRef<HTMLDetailsElement>(null);

  const onJoinClass = async (e: any) => {
    e.preventDefault();
    if (!joinCode.trim()) return;
    setJoinErr(null); setJoinOk(null); setJoinBusy(true);
    try {
      // Kod dinormalisasi supaya jarak, sengkang dan huruf O/I/L diterima.
      await joinClassByCode(normalizeClassCode(joinCode));
      setJoinOk("Joined! Reloading…");
      setTimeout(() => { window.location.reload(); }, 700);
    } catch (err: any) {
      const msg = String(err?.message || "Failed");
      setJoinErr(/Invalid class code/i.test(msg) ? "Code not found. Please check the code with your educator." : msg);
    } finally {
      setJoinBusy(false);
    }
  };

  const bukaBorangSertai = () => {
    setBukaSertai(true);
    // Tatal lembut ke borang sedia ada di kaki halaman (tiada laluan baharu).
    requestAnimationFrame(() => rujukanSertai.current?.scrollIntoView({ behavior: "smooth", block: "center" }));
  };

  useEffect(() => { if (!user) return; (async () => {
    const [h, c, p, ak] = await Promise.all([
      listQuestsForParticipant(),
      listEnrolledClasses(),
      getMyProfile(),
      listMyClassActivity().catch(() => [] as AktivitiKelas[]),
    ]);
    setHunts(h);
    setClasses(c as any[]);
    setAktiviti(ak);
    setName(p?.display_name || "");
    // Kelas lalai: kelas aktif pertama ikut susunKelas; jika tiada kelas
    // aktif, kelas tamat pertama.
    const urutan = susunKelas(c, ak);
    const lalai = urutan.find(k => statusKelas(k) === "aktif") ?? urutan[0];
    if (lalai) setActiveClassId(lalai.id);
    setDataReady(true);
  })(); }, [user]);

  // Markah kelas aktif: pasukan, individu dan pasukan saya.
  useEffect(() => {
    if (!activeClassId || !user) { setScores([]); setIndivScores([]); setMyTeamId(null); return; }
    setScoresLoading(true);
    (async () => {
      try {
        const list = await listClassTeamScores(activeClassId);
        const sorted = (list as any[]).slice().sort((a, b) => (Number(b.total_score)||0) - (Number(a.total_score)||0));
        setScores(sorted);
      } catch { setScores([]); }
      try {
        const is = await listClassIndividualScores(activeClassId);
        setIndivScores(is.slice().sort((a, b) => (Number(b.total_score)||0) - (Number(a.total_score)||0)));
      } catch { setIndivScores([]); }
      try {
        const { data } = await supabase
          .from('qm_team_members')
          .select('team_id, qm_teams!inner(class_id)')
          .eq('user_id', (user as any).id)
          .eq('qm_teams.class_id', activeClassId)
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
  const myUserId = (user as any)?.id ? String((user as any).id) : null;
  const myIndivRow = useMemo(
    () => indivScores.find((s) => s.user_id === myUserId) ?? null,
    [indivScores, myUserId]
  );

  // Kelas dalam mod individu: kedudukan dan mata daripada view markah individu.
  const modIndividu = (activeClass as any)?.scoring_mode === "individual";
  const totalPoints = modIndividu
    ? Number(myIndivRow?.total_score) || 0
    : Number(myTeamRow?.total_score) || 0;
  const myRank = modIndividu
    ? kedudukanSaya(indivScores, (s) => s.user_id, (s) => Number(s.total_score) || 0, myUserId)
    : kedudukanSaya(scores, (s) => s.team_id, (s) => Number(s.total_score) || 0, myTeamId);
  const bilKelasAktif = useMemo(
    () => classes.filter((c: KelasUntukStatus) => statusKelas(c) === "aktif").length,
    [classes, aktiviti]
  );

  // Pembahagian tab aktiviti: Active / Ended (keputusan direkod dalam
  // papanPemukaPeserta.ts dan laporan KZ-018-dev.md).
  const tabAktiviti = useMemo(() => bahagiAktiviti(activeQuests), [activeQuests]);

  // Peta nama kelas untuk cip dalam kad aktiviti.
  const namaKelas = useMemo(() => {
    const peta = new Map<string, string>();
    for (const c of classes) peta.set(c.id, c.name);
    return peta;
  }, [classes]);
  const senaraiAktiviti = (senarai: Hunt[]): BarisAktiviti[] =>
    senarai.map((h) => ({
      id: h.id,
      tajuk: h.title,
      kelasNama: namaKelas.get(h.class_id ?? "") || "Class",
      tarikh: peneranganTarikh(formatTarikh(h.start_at) || null, formatTarikh(h.end_at) || null),
      // Laluan sedia ada: halaman activities dengan parameter hunt.
      href: `/participant/activities?hunt=${encodeURIComponent(h.id)}`,
    }));

  // Baris papan pendahulu ternormalisasi (pasukan dan individu sumber berbeza).
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

  return (
    <ParticipantShell>
      <div className="max-w-shell mx-auto px-6 py-10">
        {/* 1. Banner profil. */}
        <BannerProfil
          nama={name}
          kelihatan={dataReady && classes.length > 0}
          cip={[
            ...(activeClass ? [{ teks: activeClass.name }] : []),
            ...(myTeamRow?.team_name ? [{ teks: myTeamRow.team_name }] : []),
            { teks: `${bilKelasAktif} active classes` },
          ]}
          pemilihKelas={
            classes.length > 1 ? (
              <select
                value={activeClassId}
                onChange={e => setActiveClassId(e.target.value)}
                aria-label="Active class"
                className="w-full sm:w-auto min-w-[220px] rounded-xl bg-white/15 text-white border border-white/30 px-3 py-2 text-sm"
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
            ) : null
          }
          onBukaSertai={bukaBorangSertai}
        />

        {activeClass?.ended_at && (
          <div data-class-banner="ended" className="mt-6 rounded-xl bg-[#FEF6E7] px-4 py-3 text-sm text-[#8A6100]">
            <span className="font-medium">This class has ended.</span> You can still review the Intro Board, Learning Board, Activities and the final ranking. New submissions are closed.
          </div>
        )}

        <CertificateNameBanner />
        <PeerReviewBanner />

        {dataReady && classes.length === 0 ? (
          // Keadaan kosong: peserta tanpa kelas masih boleh sertai kelas seperti sekarang.
          <div className="mt-10 max-w-md">
            <div className="section-title">Join your first class</div>
            <p className="text-sm text-ink-muted mt-1">Enter the class code your educator gave you.</p>
            <form onSubmit={onJoinClass} className="mt-4 space-y-3">
              <input
                type="text"
                value={joinCode}
                onChange={e => { setJoinCode(e.target.value.toUpperCase()); setJoinErr(null); }}
                placeholder="ABCD1234"
                maxLength={16}
                required
                className="input font-mono text-center text-lg uppercase tracking-[0.2em]"
              />
              <button type="submit" disabled={joinBusy || !joinCode.trim()} className="btn-primary w-full">
                {joinBusy ? "Joining…" : "Join class"}
              </button>
            </form>
            {joinErr && <p className="mt-2 text-sm text-[#C0392B]">{joinErr}</p>}
            {joinOk && <p className="mt-2 text-sm text-[#2E7D4F]">{joinOk}</p>}
          </div>
        ) : (
          <>
            {/* 2. Empat kad statistik. */}
            {dataReady && (
              <div className="mt-6">
                <KadStatistik
                  bilKelas={classes.length}
                  aktivitiAktif={tabAktiviti.aktif.length}
                  mata={totalPoints}
                  kedudukan={myRank}
                />
              </div>
            )}

            {/* 3. My Activities. */}
            {dataReady && (
              <div className="mt-10">
                <SenaraiAktiviti
                  aktif={senaraiAktiviti(tabAktiviti.aktif)}
                  tamat={senaraiAktiviti(tabAktiviti.tamat)}
                  sedia={dataReady}
                />
              </div>
            )}

            {/* 4. Dua lajur: papan pendahulu dan pautan kelas. Tiada bahagian kuiz langsung: peserta tidak dibenarkan membaca qm_live_sessions (RLS 0018); tiket membenarkan bahagian digugurkan. */}
            {dataReady && (
              <div className="mt-10 flex flex-wrap items-stretch gap-6">
                <PanelPendahulu
                  key={activeClassId}
                  barisPasukan={barisPasukan}
                  barisIndividu={barisIndividu}
                  myTeamId={myTeamId}
                  myUserId={myUserId}
                  defaultMod={modIndividu ? "individu" : "pasukan"}
                  loading={scoresLoading}
                />
                <PautanKelas classId={activeClassId || null} />
              </div>
            )}

            {/* 5. Kaki: sertai kelas lain dan tinggalkan kelas (logik sedia ada). */}
            <div className="mt-16 mb-4 border-t border-hairline pt-6 flex flex-wrap items-start justify-between gap-4">
              <details ref={rujukanSertai} open={bukaSertai} className="min-w-0">
                <summary className="btn-quiet cursor-pointer list-none text-brand-purple">Join another class</summary>
                <form onSubmit={onJoinClass} className="mt-3 flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={joinCode}
                    onChange={e => { setJoinCode(e.target.value.toUpperCase()); setJoinErr(null); }}
                    placeholder="ABCD1234"
                    maxLength={16}
                    required
                    className="input w-[200px] font-mono uppercase tracking-[0.2em]"
                  />
                  <button type="submit" disabled={joinBusy || !joinCode.trim()} className="btn-secondary">
                    {joinBusy ? "Joining…" : "Join"}
                  </button>
                </form>
                {joinErr && <p className="mt-2 text-sm text-[#C0392B]">{joinErr}</p>}
                {joinOk && <p className="mt-2 text-sm text-[#2E7D4F]">{joinOk}</p>}
              </details>

              {activeClassId && (
                <button
                  type="button"
                  onClick={async () => {
                    const target = classes.find((c: any) => c.id === activeClassId);
                    if (!target) return;
                    if (!confirm(`Leave "${target.name}"? You will lose access to its activities and rankings.`)) return;
                    try {
                      await leaveClassAsStudent(activeClassId);
                      const remaining = classes.filter((c: any) => c.id !== activeClassId);
                      setClasses(remaining);
                      // Pilih semula kelas lalai: aktif dahulu, kemudian tamat.
                      const urutanBaki = susunKelas(remaining, aktiviti);
                      const lalai = urutanBaki.find(k => statusKelas(k) === "aktif") ?? urutanBaki[0];
                      setActiveClassId(lalai ? lalai.id : "");
                    } catch (err: any) {
                      alert(err?.message || "Failed to leave class");
                    }
                  }}
                  className="btn-quiet text-[#C0392B]"
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