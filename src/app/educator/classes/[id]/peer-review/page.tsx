"use client";

/**
 * Peer review (pendidik): pusingan penilaian rakan sebaya, Fasa 1.
 *
 * Dua bahagian: senarai pusingan (cipta, sunting, kira) dan keputusan
 * (papan pemuka berkod warna dengan penapis). Unit penilaian ialah
 * PUSINGAN, milik kelas; bukan aktiviti. Rujukan: docs/SPEC-penilaian-rakan.md.
 *
 * Kerahsiaan dikekalkan di pelayan: identiti penilai tidak pernah dihantar
 * ke pelayar, jadi justifikasi dipaparkan tanpa nama penilai.
 */
import { useCallback, useEffect, useMemo, useState, Fragment } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  ClipboardList,
  Plus,
  RefreshCw,
  Trash2,
  Users,
  X,
} from "lucide-react";
import Shell from "@/components/Shell";
import ClassShell from "@/components/ClassShell";
import { EDU_TABS } from "@/lib/eduTabs";
import { getClass, type Klass } from "@/lib/data";
import { supabase } from "@/lib/supabase";
import { peerApi } from "@/lib/peer-client";
import { useConfirm } from "@/components/ui/ConfirmProvider";

type Pusingan = {
  id: string;
  class_id: string;
  name: string;
  kind: string;
  week: number | null;
  opens_at: string;
  closes_at: string;
  computed_at: string | null;
};

type BarisKeputusan = {
  user_id: string;
  name: string;
  team_id: string;
  team_name: string;
  t_total: number;
  r_count: number;
  valid: boolean;
  p: number | null;
  pbar: number | null;
  f: number | null;
  f_mod: number;
  flag: string | null;
  needs_review: boolean;
  team_at_risk: boolean;
};

type Justifikasi = {
  ratee_id: string;
  ratee_name: string;
  k1: number;
  k2: number;
  k3: number;
  k4: number;
  k5: number;
  justification: string | null;
};

type Keputusan = {
  round: Pusingan;
  results: BarisKeputusan[];
  justifications: Justifikasi[];
  not_submitted: { user_id: string; name: string; team_id: string; team_name: string }[];
};

type Penapis = "semua" | "merah" | "semak" | "risiko" | "belum";

/** Cadangan templat Fasa 1: tiga pusingan formatif (sumatif datang kemudian). */
const TEMPLAT_MINGGU = [4, 6, 9];

function statusPusingan(p: Pusingan): "akan" | "terbuka" | "tertutup" | "dikira" {
  if (p.computed_at) return "dikira";
  const now = Date.now();
  if (now < Date.parse(p.opens_at)) return "akan";
  if (now <= Date.parse(p.closes_at)) return "terbuka";
  return "tertutup";
}

function formatTarikh(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return iso;
  }
}

/** Nilai untuk input datetime-local daripada ISO string. */
function keInputMasa(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function PeerReviewPage() {
  const params = useParams<{ id: string }>();
  const classId = params.id;
  const confirm = useConfirm();

  const [klass, setKlass] = useState<Klass | null>(null);
  const [rounds, setRounds] = useState<Pusingan[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  // Bahagian pusingan: borang cipta dan templat.
  const [borangTerbuka, setBorangTerbuka] = useState(false);
  const [nama, setNama] = useState("");
  const [minggu, setMinggu] = useState("");
  const [dibuka, setDibuka] = useState("");
  const [ditutup, setDitutup] = useState("");
  const [mulaSemester, setMulaSemester] = useState("");
  const [amaranSatuSudah, setAmaranSatuSudah] = useState(false);

  // Kumpulan dua orang (amaran sahaja, bukan sekatan).
  const [kumpulanDua, setKumpulanDua] = useState<string[]>([]);

  // Bahagian keputusan.
  const [pusinganDipilih, setPusinganDipilih] = useState<string>("");
  const [keputusan, setKeputusan] = useState<Keputusan | null>(null);
  const [penapis, setPenapis] = useState<Penapis>("semua");
  const [barisTerbuka, setBarisTerbuka] = useState<string | null>(null);
  const [kiraBusy, setKiraBusy] = useState(false);
  // Versi memaksa keputusan dimuat semula selepas pengiraan.
  const [versiKeputusan, setVersiKeputusan] = useState(0);

  const muatPusingan = useCallback(async () => {
    try {
      const res = await peerApi(`/api/classes/${classId}/peer-rounds`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load rounds");
      setRounds(json.rounds ?? []);
    } catch (e: any) {
      setMsg(e.message || "Failed to load rounds");
    }
  }, [classId]);

  useEffect(() => {
    (async () => {
      setKlass(await getClass(classId));
      await muatPusingan();
      // Kumpulan dua orang: kumpulan peringkat kelas dengan tepat dua ahli.
      try {
        const { data: teams } = await supabase
          .from("qm_teams")
          .select("id, name, qm_team_members(user_id)")
          .eq("class_id", classId)
          .is("hunt_id", null);
        setKumpulanDua(
          (teams ?? [])
            .filter((t: any) => (t.qm_team_members ?? []).length === 2)
            .map((t: any) => t.name),
        );
      } catch {
        setKumpulanDua([]);
      }
      setLoading(false);
    })();
  }, [classId, muatPusingan]);

  // Muat keputusan bagi pusingan yang dipilih.
  useEffect(() => {
    if (!pusinganDipilih) {
      setKeputusan(null);
      return;
    }
    (async () => {
      try {
        const res = await peerApi(`/api/classes/${classId}/peer-rounds/${pusinganDipilih}/results`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed to load results");
        setKeputusan(json);
      } catch (e: any) {
        setMsg(e.message || "Failed to load results");
        setKeputusan(null);
      }
    })();
  }, [classId, pusinganDipilih, versiKeputusan]);

  // Pusingan lalai bagi bahagian keputusan: yang terkini sudah dikira.
  useEffect(() => {
    if (pusinganDipilih || rounds.length === 0) return;
    const dikira = rounds.filter((r) => r.computed_at);
    if (dikira.length > 0) setPusinganDipilih(dikira[dikira.length - 1].id);
  }, [rounds, pusinganDipilih]);

  /** Tarikh dibuka/tutup daripada minggu dan tarikh mula semester. */
  function tarikhTemplat(week: number): { opens: string; closes: string } {
    const mula = mulaSemester ? new Date(mulaSemester + "T00:00:00") : new Date();
    const opens = new Date(mula);
    opens.setDate(opens.getDate() + (week - 1) * 7);
    const closes = new Date(opens);
    closes.setDate(closes.getDate() + 7);
    return { opens: opens.toISOString(), closes: closes.toISOString() };
  }

  /** Cipta satu pusingan; pulangkan true jika berjaya. */
  async function ciptaPusingan(p: { name: string; week: number | null; opens: string; closes: string }): Promise<boolean> {
    const res = await peerApi(`/api/classes/${classId}/peer-rounds`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: p.name, week: p.week, opens_at: p.opens, closes_at: p.closes }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Failed to create round");
    await muatPusingan();
    return true;
  }

  async function simpanBorang() {
    setMsg(null);
    try {
      if (!nama.trim() || !dibuka || !ditutup) {
        setMsg("A name and both dates are required.");
        return;
      }
      const sebelum = rounds.length;
      await ciptaPusingan(
        { name: nama.trim(), week: minggu ? parseInt(minggu, 10) : null, opens: new Date(dibuka).toISOString(), closes: new Date(ditutup).toISOString() },
      );
      // Amaran satu pusingan: tunjuk sekali sahaja, bila kelas kini hanya
      // ada SATU pusingan. Jangan ulang pada simpanan berikutnya.
      if (sebelum === 0) setAmaranSatuSudah(true);
      setBorangTerbuka(false);
      setNama(""); setMinggu(""); setDibuka(""); setDitutup("");
      setMsg("Round created.");
    } catch (e: any) {
      setMsg(e.message || "Failed to create round");
    }
  }

  async function ciptaTemplat() {
    setMsg(null);
    try {
      for (const week of TEMPLAT_MINGGU) {
        const t = tarikhTemplat(week);
        await ciptaPusingan({ name: `Peer review week ${week}`, week, opens: t.opens, closes: t.closes });
      }
      // Tiga pusingan dicipta, jadi amaran satu pusingan tidak relevan.
      setAmaranSatuSudah(false);
      setMsg("Three formative rounds created. Edit the dates if needed. Marked (summative) rounds will come in a later phase.");
    } catch (e: any) {
      setMsg(e.message || "Failed to create template rounds");
    }
  }

  async function kira(roundId: string) {
    setMsg(null);
    setKiraBusy(true);
    try {
      const res = await peerApi(`/api/classes/${classId}/peer-rounds/${roundId}/compute`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to compute");
      await muatPusingan();
      setVersiKeputusan((v) => v + 1);
      setMsg(`Results computed: ${json.written ?? 0} students.`);
    } catch (e: any) {
      setMsg(e.message || "Failed to compute");
    } finally {
      setKiraBusy(false);
    }
  }

  async function padamPusingan(p: Pusingan) {
    const ok = await confirm({
      title: "Delete this round?",
      description: `\"${p.name}\" will be removed. A round that already has submissions cannot be deleted.`,
      confirmLabel: "Delete round",
      tone: "danger",
    });
    if (!ok) return;
    setMsg(null);
    try {
      const res = await peerApi(`/api/classes/${classId}/peer-rounds/${p.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to delete");
      if (pusinganDipilih === p.id) setPusinganDipilih("");
      await muatPusingan();
      setMsg("Round deleted.");
    } catch (e: any) {
      setMsg(e.message || "Failed to delete");
    }
  }

  const belumLabel: Record<Penapis, string> = {
    semua: "All",
    merah: "Red only",
    semak: "Needs review",
    risiko: "At-risk groups",
    belum: "Not submitted",
  };

  const barisDitapis = useMemo(() => {
    if (!keputusan) return [];
    const semua = [...keputusan.results].sort(
      (a, b) => (a.team_name || "").localeCompare(b.team_name || "") || (a.name || "").localeCompare(b.name || ""),
    );
    switch (penapis) {
      case "merah":
        return semua.filter((b) => b.flag === "MERAH");
      case "semak":
        return semua.filter((b) => b.needs_review);
      case "risiko":
        return semua.filter((b) => b.team_at_risk);
      case "belum":
        return semua.filter((b) => b.r_count === 0);
      default:
        return semua;
    }
  }, [keputusan, penapis]);

  const justifikasiMengikut = useMemo(() => {
    const m = new Map<string, Justifikasi[]>();
    for (const j of keputusan?.justifications ?? []) {
      m.set(j.ratee_id, [...(m.get(j.ratee_id) ?? []), j]);
    }
    return m;
  }, [keputusan]);

  if (loading) {
    return (
      <Shell tabs={EDU_TABS}>
        <div className="p-10 text-sm text-gray-500">Loading peer review...</div>
      </Shell>
    );
  }
  if (!klass) {
    return (
      <Shell tabs={EDU_TABS}>
        <div className="p-10 text-sm text-gray-500">Class not found.</div>
      </Shell>
    );
  }

  return (
    <Shell tabs={EDU_TABS}>
      <ClassShell classId={klass.id} current="overview" klass={klass}>
        <div className="flex flex-wrap items-end justify-between gap-4 mb-4">
          <div className="min-w-0">
            <div className="eyebrow mb-1">Peer review</div>
            <h1 className="page-title">Confidential teammate evaluations.</h1>
            <p className="page-subtitle">Each member rates their teammates on five criteria. Scores stay private; only you see the raw data.</p>
          </div>
          <button
            onClick={() => setBorangTerbuka(!borangTerbuka)}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-2 text-sm font-medium text-white hover:opacity-95"
          >
            <Plus className="h-4 w-4" /> Create round
          </button>
        </div>

        {msg && (
          <div className="mb-4 rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs text-indigo-700">{msg}</div>
        )}

        {borangTerbuka && (
          <div className="card mb-4">
            <div className="flex items-center justify-between mb-3">
              <div className="font-semibold text-gray-900">Create evaluation round</div>
              <button onClick={() => setBorangTerbuka(false)} className="btn-quiet"><X className="w-4 h-4" /></button>
            </div>
            {rounds.length === 0 && (
              <div className="mb-3 rounded-xl border border-violet-200 bg-violet-50 p-4">
                <div className="text-sm font-semibold text-gray-900 mb-1">Suggested: three formative rounds</div>
                <div className="text-xs text-gray-600 mb-3">
                  Weeks 4, 6 and 9 catch group problems early. Marked (summative) rounds will come in a later phase.
                </div>
                <div className="text-xs font-medium text-gray-700 mb-1">Semester start date</div>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="date"
                    value={mulaSemester}
                    onChange={(e) => setMulaSemester(e.target.value)}
                    className="input max-w-[200px]"
                  />
                  <button
                    onClick={ciptaTemplat}
                    disabled={!mulaSemester}
                    className="rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-2 text-xs font-medium text-white hover:opacity-95 disabled:opacity-50"
                  >
                    Create all three rounds
                  </button>
                  <span className="text-xs text-gray-500">
                    Opens at start + (week - 1) weeks; closes seven days later. Not saved anywhere; you can edit each date.
                  </span>
                </div>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <div className="text-xs font-medium text-gray-700 mb-1">Round name</div>
                <input value={nama} onChange={(e) => setNama(e.target.value)} placeholder="Peer review week 4" className="input" />
              </div>
              <div>
                <div className="text-xs font-medium text-gray-700 mb-1">Week label (optional)</div>
                <input type="number" min={1} max={52} value={minggu} onChange={(e) => setMinggu(e.target.value)} className="input" />
              </div>
              <div>
                <div className="text-xs font-medium text-gray-700 mb-1">Opens at</div>
                <input type="datetime-local" value={dibuka} onChange={(e) => setDibuka(e.target.value)} className="input" />
              </div>
              <div>
                <div className="text-xs font-medium text-gray-700 mb-1">Closes at</div>
                <input type="datetime-local" value={ditutup} onChange={(e) => setDitutup(e.target.value)} className="input" />
              </div>
            </div>
            <div className="mt-3 flex justify-end">
              <button onClick={simpanBorang} className="rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-2 text-sm font-medium text-white hover:opacity-95">
                Save round
              </button>
            </div>
          </div>
        )}

        {amaranSatuSudah && (
          <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
            <div className="flex-1 min-w-0">
              <div className="font-semibold">A single round measures but does not detect.</div>
              <div className="text-amber-700">Group problems will only become visible after everything is over. More rounds give earlier warning.</div>
            </div>
            <div className="flex shrink-0 gap-2">
              <button onClick={() => setAmaranSatuSudah(false)} className="rounded-xl border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-900">Continue</button>
              <button onClick={() => { setAmaranSatuSudah(false); setBorangTerbuka(true); }} className="rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-3 py-1.5 text-xs font-medium text-white">Add round</button>
            </div>
          </div>
        )}

        {kumpulanDua.length > 0 && (
          <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 flex items-start gap-3">
            <Users className="h-5 w-5 shrink-0 text-amber-600" />
            <div>
              <div className="font-semibold">Some groups have only two members: {kumpulanDua.join(", ")}.</div>
              <div className="text-amber-700">Each member receives a single evaluation, so no adjustment is made and both members are marked for review.</div>
            </div>
          </div>
        )}

        {/* Bahagian pusingan */}
        <div className="card mb-4">
          <div className="font-semibold text-gray-900 mb-2">Rounds</div>
          {rounds.length === 0 ? (
            <p className="text-sm text-gray-500">No rounds yet. Use the template above or create a round.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {rounds.map((r) => {
                const st = statusPusingan(r);
                const warna =
                  st === "terbuka" ? "bg-emerald-50 text-emerald-700" :
                  st === "akan" ? "bg-sky-50 text-sky-700" :
                  st === "dikira" ? "bg-violet-50 text-violet-700" :
                  "bg-gray-100 text-gray-600";
                return (
                  <div key={r.id} className="flex flex-wrap items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-gray-900 truncate">
                        {r.name}
                        {r.week ? <span className="ml-2 text-xs text-gray-500">week {r.week}</span> : null}
                      </div>
                      <div className="text-xs text-gray-500">
                        {formatTarikh(r.opens_at)} to {formatTarikh(r.closes_at)}
                      </div>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${warna}`}>
                      {st === "akan" ? "Upcoming" : st === "terbuka" ? "Open" : st === "dikira" ? "Computed" : "Closed"}
                    </span>
                    {(st === "tertutup" || st === "dikira") && (
                      <button
                        onClick={() => kira(r.id)}
                        disabled={kiraBusy}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                      >
                        <RefreshCw className={`h-3.5 w-3.5 ${kiraBusy ? "animate-spin" : ""}`} />
                        {st === "dikira" ? "Recompute" : "Compute results"}
                      </button>
                    )}
                    <button
                      onClick={() => setPusinganDipilih(r.id)}
                      className="rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:opacity-95"
                    >
                      Results
                    </button>
                    <button
                      onClick={() => padamPusingan(r)}
                      title="Delete round"
                      className="text-gray-400 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Bahagian keputusan */}
        {keputusan && (
          <div className="card">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <div className="font-semibold text-gray-900">
                Results: {keputusan.round.name}
                {keputusan.round.computed_at
                  ? <span className="ml-2 text-xs text-gray-500">computed {formatTarikh(keputusan.round.computed_at)}</span>
                  : <span className="ml-2 text-xs text-amber-700">not computed yet</span>}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(["semua", "merah", "semak", "risiko", "belum"] as Penapis[]).map((k) => (
                  <button
                    key={k}
                    onClick={() => setPenapis(k)}
                    className={penapis === k
                      ? "rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-3 py-1.5 text-xs font-medium text-white"
                      : "rounded-xl border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"}
                  >
                    {belumLabel[k]}
                  </button>
                ))}
              </div>
            </div>

            {penapis === "belum" ? (
              <div className="divide-y divide-gray-100">
                {keputusan.not_submitted.length === 0 ? (
                  <p className="text-sm text-gray-500 py-3">Everyone has submitted.</p>
                ) : (
                  keputusan.not_submitted.map((m) => (
                    <div key={m.user_id + m.team_id} className="py-2 text-sm">
                      <span className="font-medium text-gray-900">{m.name || "Student"}</span>
                      <span className="text-gray-500"> has not submitted their evaluation ({m.team_name}).</span>
                    </div>
                  ))
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs uppercase tracking-wide text-gray-500">
                      <th className="text-left font-medium px-3 py-2">Student</th>
                      <th className="text-left font-medium px-3 py-2">Group</th>
                      <th className="text-right font-medium px-3 py-2">P</th>
                      <th className="text-right font-medium px-3 py-2">F</th>
                      <th className="text-right font-medium px-3 py-2">Fmod</th>
                      <th className="text-left font-medium px-3 py-2">Flag</th>
                      <th className="text-left font-medium px-3 py-2">Review</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {barisDitapis.map((b) => {
                      const warnaBaris =
                        b.flag === "MERAH" ? "bg-red-50" :
                        b.flag === "KUNING" ? "bg-amber-50" :
                        b.flag === "HIJAU" ? "bg-emerald-50" : "";
                      const warnaTitik =
                        b.flag === "MERAH" ? "bg-red-500" :
                        b.flag === "KUNING" ? "bg-amber-500" :
                        b.flag === "HIJAU" ? "bg-emerald-500" : "bg-gray-300";
                      const just = justifikasiMengikut.get(b.user_id) ?? [];
                      return (
                        <Fragment key={b.user_id}>
                          <tr
                            className={`${warnaBaris} cursor-pointer hover:opacity-90`}
                            onClick={() => setBarisTerbuka(barisTerbuka === b.user_id ? null : b.user_id)}
                          >
                            <td className="px-3 py-2 font-medium text-gray-900">
                              <span className="inline-flex items-center gap-2">
                                <span className={`h-2 w-2 rounded-full ${warnaTitik}`} />
                                {b.name || "Student"}
                                {b.team_at_risk && <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">AT RISK</span>}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-gray-700">{b.team_name}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{b.p === null ? "-" : (Math.round(b.p * 10000) / 10000).toFixed(4)}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{b.f === null ? "-" : (Math.round(b.f * 10000) / 10000).toFixed(4)}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{(Math.round(b.f_mod * 10000) / 10000).toFixed(4)}</td>
                            <td className="px-3 py-2">{b.flag ?? "-"}</td>
                            <td className="px-3 py-2">{b.needs_review ? <span className="font-semibold text-red-700">YES</span> : "-"}</td>
                          </tr>
                          {barisTerbuka === b.user_id && (
                            <tr key={b.user_id + "-just"}>
                              <td colSpan={7} className="px-3 pb-3">
                                <div className="rounded-xl border border-violet-200 bg-violet-50 p-4 text-xs">
                                  <div className="font-semibold text-gray-900 mb-1">
                                    Justifications received about {b.name || "this student"} (raters stay anonymous):
                                  </div>
                                  {just.length === 0 ? (
                                    <div className="text-gray-500">None. The student received no written justification.</div>
                                  ) : (
                                    <ul className="list-disc pl-4 space-y-1 text-gray-700">
                                      {just.map((j, i) => (
                                        <li key={i}>
                                          {j.justification}
                                          <span className="ml-2 text-gray-500">
                                            (K1 {j.k1}, K2 {j.k2}, K3 {j.k3}, K4 {j.k4}, K5 {j.k5})
                                          </span>
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
                {barisDitapis.length === 0 && (
                  <p className="text-sm text-gray-500 py-3">No students match this filter.</p>
                )}
              </div>
            )}
          </div>
        )}
      </ClassShell>
    </Shell>
  );
}