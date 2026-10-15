"use client";

/**
 * Papan pemuka peserta, Versi 2 fokus satu tindakan (KZ-018b).
 *
 * SETIA kepada pratonton Versi2-pratonton.dc.html: nilai gaya sebaris
 * pratonton diterjemah kepada kelas Tailwind arbitrari yang sama
 * (rounded-[20px], text-[#5b5878], p-[28px], text-[34px] dsb.) dan kelas
 * reka bentuk lama (card, section-title, btn-primary) TIDAK digunakan
 * dalam bahagian baharu.
 *
 * Kekal dari Versi 1: pilih kelas aktif (susunKelas/statusKelas), banner
 * kelas tamat, CertificateNameBanner, PeerReviewBanner, keadaan kosong
 * "Join your first class", borang kod kelas (joinClassByCode /
 * normalizeClassCode) dan "Leave this class". Logik tulen berada dalam
 * src/lib/papanPemukaPeserta.ts (KZ-018 + bahagian KZ-018b).
 */

import ParticipantShell from "@/components/ParticipantShell";
import PeerReviewBanner from "@/components/PeerReviewBanner";
import CertificateNameBanner from "@/components/CertificateNameBanner";
import KadTindakan, { type SesiLive, type AktivitiSeterusnya } from "@/components/participant-home/KadTindakan";
import KadKemajuan, { type BarisAtas } from "@/components/participant-home/KadKemajuan";
import SenaraiQuest, { type BarisQuest } from "@/components/participant-home/SenaraiQuest";
import PapanPendahulu, { type BarisSkor } from "@/components/participant-home/PapanPendahulu";
import KadKelas from "@/components/participant-home/KadKelas";
import { bricolage, jakarta } from "@/components/participant-home/fon";
import { useEffect, useMemo, useState } from "react";
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
import {
  bahagiAktiviti,
  kedudukanSaya,
  labelTarikhQuest,
  pilihAktivitiSeterusnya,
  pilihSesiTerkini,
  sesiBolehMasuk,
  warnaKelas,
} from "@/lib/papanPemukaPeserta";
import { supabase } from "@/lib/supabaseClient";

/** Tarikh ringkas "24 Oct" untuk label kanan baris quest. */
function tarikhRingkas(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** Susun quest ikut end_at: aktif terdekat dahulu, tamat baru dahulu. */
function susunIkutTarikh(senarai: Hunt[], tamat: boolean): Hunt[] {
  return senarai.slice().sort((a, b) => {
    const ma = a.end_at ? new Date(a.end_at).getTime() : null;
    const mb = b.end_at ? new Date(b.end_at).getTime() : null;
    if (ma === null && mb === null)
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    if (ma === null) return 1;
    if (mb === null) return -1;
    // Aktif: end_at terdekat dahulu. Tamat: yang baru berakhir dahulu.
    return tamat ? mb - ma : ma - mb;
  });
}

/** Bina baris quest siap papar daripada senarai aktiviti. */
function kawalBarisQuest(
  senarai: Hunt[],
  tamat: boolean,
  namaKelas: Map<string, string>,
  indeksKelas: Map<string, number>
): BarisQuest[] {
  return susunIkutTarikh(senarai, tamat).map((h) => {
    const label = labelTarikhQuest(h.end_at, tamat);
    return {
      id: h.id,
      tajuk: h.title,
      kelasNama: namaKelas.get(h.class_id ?? "") || "Class",
      warna: warnaKelas(indeksKelas.get(h.class_id ?? "") ?? 0),
      ayatTarikh: label.label,
      labelTarikh: label.segera ? label.label : tamat ? "Ended" : tarikhRingkas(h.end_at),
      segera: label.segera,
      tamat,
      href: `/participant/activities?hunt=${encodeURIComponent(h.id)}`,
    };
  });
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

  // Pasukan saya merentas kelas: peta class_id -> { team_id, team_name },
  // untuk ayat "Your team is waiting." pada kad LIVE.
  const [pasukanSaya, setPasukanSaya] = useState<Map<string, { team_id: string; team_name: string | null }>>(new Map());
  // Sesi kuiz langsung yang boleh dimasuki, daripada /api/participant/live-now.
  const [sesiLive, setSesiLive] = useState<SesiLive[]>([]);

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
    (async () => {
      try {
        const list = await listClassTeamScores(activeClassId);
        setScores(list.slice().sort((a, b) => (Number(b.total_score)||0) - (Number(a.total_score)||0)));
      } catch { setScores([]); }
      try {
        const is = await listClassIndividualScores(activeClassId);
        setIndivScores(is.slice().sort((a, b) => (Number(b.total_score)||0) - (Number(a.total_score)||0)));
      } catch { setIndivScores([]); }
      // Pasukan saya diperoleh daripada peta merentas kelas di atas.
    })();
  }, [activeClassId, user, pasukanSaya]);

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

  // Baris di atas saya (untuk ayat jarak kotak amber). Kedudukan baris
  // atas dikira mengikut markah sebenar, jadi ayat kekal betul bila seri.
  const barisAtas: BarisAtas | null = useMemo(() => {
    if (myRank <= 1) return null;
    const senarai: Array<{ id: string; nama: string; skor: number }> = modIndividu
      ? indivScores.map((s) => ({ id: s.user_id, nama: s.display_name || "Student", skor: Number(s.total_score) || 0 }))
      : scores.map((s) => ({ id: s.team_id, nama: s.team_name || "Team", skor: Number(s.total_score) || 0 }));
    const atas = senarai.find((r) => r.skor > totalPoints);
    if (!atas) return null;
    return {
      nama: atas.nama,
      skor: atas.skor,
      kedudukan: kedudukanSaya(senarai, (r) => r.id, (r) => r.skor, atas.id),
    };
  }, [myRank, modIndividu, indivScores, scores, totalPoints]);

  // Peta nama kelas dan indeks kelas (untuk warna jalur stabil).
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

  // Semua quest merentas kelas, dibahagi tab Active / Ended.
  const semuaTab = useMemo(() => bahagiAktiviti(hunts), [hunts]);
  const barisAktif = useMemo(
    () => kawalBarisQuest(semuaTab.aktif, false, namaKelas, indeksKelas),
    [semuaTab, namaKelas, indeksKelas]
  );
  const barisTamat = useMemo(
    () => kawalBarisQuest(semuaTab.tamat, true, namaKelas, indeksKelas),
    [semuaTab, namaKelas, indeksKelas]
  );

  // Aktiviti NEXT UP: aktif dengan end_at terdekat (logik tulen).
  const aktivitiSeterusnya: AktivitiSeterusnya | null = useMemo(() => {
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
    if (!hero) return [];
    return [hero, ...sen.filter((s) => s !== hero)];
  }, [sesiLive]);
  const sesiHero = sesiSusun[0] ?? null;
  const adaPasukanLive = !!sesiHero && pasukanSaya.has(sesiHero.class_id ?? "");

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

  return (
    <ParticipantShell>
      <div
        className={`${bricolage.variable} ${jakarta.variable} font-[family-name:var(--pp-jakarta)] -mx-5 -mt-8 min-w-0 bg-[#f6f5fb] px-5 pb-12 pt-6 text-[#1e1b3a]`}
      >
        <div className="mx-auto flex max-w-[1180px] flex-col gap-6">

          {/* Baris atas: pemilih kelas (jika >1) dan borang kod kelas. */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            {classes.length > 1 ? (
              <select
                value={activeClassId}
                onChange={e => setActiveClassId(e.target.value)}
                aria-label="Active class"
                className="rounded-[12px] border border-[#e7e5f2] bg-[#f6f5fb] px-3 py-2.5 text-sm text-[#1e1b3a]"
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
            ) : (
              <span className="text-sm font-semibold text-[#5b5878]">
                {activeClass?.name || ""}
              </span>
            )}
            <form
              onSubmit={onJoinClass}
              className="flex items-center gap-1.5 rounded-[12px] border border-[#e7e5f2] bg-[#f6f5fb] py-1 pl-3 pr-1"
            >
              <label htmlFor="kod-kelas" className="whitespace-nowrap text-[13px] text-[#5b5878]">
                Class code
              </label>
              <input
                id="kod-kelas"
                type="text"
                inputMode="text"
                autoComplete="off"
                value={joinCode}
                onChange={e => { setJoinCode(e.target.value.toUpperCase()); setJoinErr(null); }}
                placeholder="e.g. AB12CD"
                maxLength={16}
                className="w-[110px] border-0 bg-transparent text-sm font-semibold tracking-[0.08em] text-[#1e1b3a] outline-none"
              />
              <button
                type="submit"
                disabled={joinBusy || !joinCode.trim()}
                className="min-h-9 rounded-[9px] bg-[#1e1b3a] px-3.5 text-[13px] font-bold text-white disabled:opacity-50"
              >
                {joinBusy ? "Joining…" : "Join"}
              </button>
            </form>
          </div>

          {/* Banner sedia ada: kelas tamat, nama sijil, semakan rakan. */}
          {activeClass?.ended_at && (
            <div data-class-banner="ended" className="rounded-[12px] bg-[#FEF6E7] px-4 py-3 text-sm text-[#8A6100]">
              <span className="font-medium">This class has ended.</span> You can still review the Intro Board, Learning Board, Activities and the final ranking. New submissions are closed.
            </div>
          )}
          <CertificateNameBanner />
          <PeerReviewBanner />

          {dataReady && classes.length === 0 ? (
            // Keadaan kosong: peserta tanpa kelas, gaya kad pratonton.
            <section className="rounded-[20px] border border-[#e7e5f2] bg-white p-[22px]">
              <h2 className="m-0 text-[19px] font-extrabold">Join your first class</h2>
              <p className="mt-1 text-sm text-[#5b5878]">
                Enter the class code your educator gave you.
              </p>
              <form onSubmit={onJoinClass} className="mt-4 flex flex-wrap items-center gap-1.5 rounded-[12px] border border-[#e7e5f2] bg-[#f6f5fb] py-1 pl-3 pr-1">
                <label htmlFor="kod-pertama" className="whitespace-nowrap text-[13px] text-[#5b5878]">
                  Class code
                </label>
                <input
                  id="kod-pertama"
                  type="text"
                  inputMode="text"
                  autoComplete="off"
                  value={joinCode}
                  onChange={e => { setJoinCode(e.target.value.toUpperCase()); setJoinErr(null); }}
                  placeholder="e.g. AB12CD"
                  maxLength={16}
                  required
                  className="min-w-0 flex-1 border-0 bg-transparent text-sm font-semibold tracking-[0.08em] text-[#1e1b3a] outline-none"
                />
                <button
                  type="submit"
                  disabled={joinBusy || !joinCode.trim()}
                  className="min-h-9 rounded-[9px] bg-[#1e1b3a] px-3.5 text-[13px] font-bold text-white disabled:opacity-50"
                >
                  {joinBusy ? "Joining…" : "Join"}
                </button>
              </form>
              {joinErr && <p className="mt-2 text-sm text-[#C0392B]">{joinErr}</p>}
              {joinOk && <p className="mt-2 text-sm text-[#2E7D4F]">{joinOk}</p>}
            </section>
          ) : (
            <>
              {/* Baris wira: kad tindakan dan kad kemajuan. */}
              {dataReady && (
                <div className="flex flex-wrap items-stretch gap-5">
                  <KadTindakan sesi={sesiSusun} aktiviti={aktivitiSeterusnya} adaPasukan={adaPasukanLive} />
                  <KadKemajuan
                    nama={name}
                    namaPasukan={myTeamRow?.team_name ?? pasukanSaya.get(activeClassId)?.team_name ?? null}
                    jumlahMata={totalPoints}
                    kedudukan={myRank}
                    barisAtas={barisAtas}
                  />
                </div>
              )}

              {/* Baris bawah: My Quests dan lajur kanan. */}
              {dataReady && (
                <div className="flex flex-wrap items-start gap-6">
                  <SenaraiQuest aktif={barisAktif} tamat={barisTamat} />
                  <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-6">
                    <PapanPendahulu
                      key={activeClassId}
                      barisPasukan={barisPasukan}
                      barisIndividu={barisIndividu}
                      myTeamId={myTeamId}
                      myUserId={myUserId}
                      defaultMod={modIndividu ? "individu" : "pasukan"}
                      namaKelas={activeClass?.name || ""}
                    />
                    <KadKelas classId={activeClassId || null} />
                  </div>
                </div>
              )}

              {/* Kaki: tinggalkan kelas (pautan kecil merah). */}
              <div className="flex justify-end border-t border-[#e7e5f2] pt-4">
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
                    className="text-[13px] font-semibold text-[#b91c1c]"
                  >
                    Leave this class
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </ParticipantShell>
  );
}
