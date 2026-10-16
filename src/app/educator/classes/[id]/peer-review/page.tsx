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
 *
 * KZ-022b: rupa v3 dengan kit (Card, CardHead, Field, Input, Alert, Badge,
 * Button, DataTable, EmptyState; kepala halaman dibekalkan ClassShell).
 * Logik, data, panggilan API dan pengendali klik tidak berubah.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  AlertTriangle,
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
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHead,
  DataTable,
  EmptyState,
  Field,
  Input,
  type DataColumn,
} from "@/components/ui";

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

/** Kumpulan seperti yang dipulangkan oleh pertanyaan qm_teams dengan ahli. */
type PasukanRingkas = {
  id: string;
  name: string | null;
  qm_team_members?: { user_id: string }[];
};

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

/** Mesej ralat selamat daripada nilai balingan `unknown`. */
function mesejRalat(e: unknown, zonkal: string): string {
  return e instanceof Error && e.message ? e.message : zonkal;
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
    } catch (e: unknown) {
      setMsg(mesejRalat(e, "Failed to load rounds"));
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
        const senarai = (teams ?? []) as unknown as PasukanRingkas[];
        setKumpulanDua(
          senarai
            .filter((t) => (t.qm_team_members ?? []).length === 2)
            .map((t) => t.name ?? "")
            .filter((n) => n !== ""),
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
      } catch (e: unknown) {
        setMsg(mesejRalat(e, "Failed to load results"));
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
    } catch (e: unknown) {
      setMsg(mesejRalat(e, "Failed to create round"));
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
    } catch (e: unknown) {
      setMsg(mesejRalat(e, "Failed to create template rounds"));
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
    } catch (e: unknown) {
      setMsg(mesejRalat(e, "Failed to compute"));
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
    } catch (e: unknown) {
      setMsg(mesejRalat(e, "Failed to delete"));
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
        <div className="p-10 text-[14px] text-ink-muted">Loading peer review...</div>
      </Shell>
    );
  }
  if (!klass) {
    return (
      <Shell tabs={EDU_TABS}>
        <div className="p-10 text-[14px] text-ink-muted">Class not found.</div>
      </Shell>
    );
  }

  // Titik warna bendera pada lajur pelajar (palet pejal KZ-DS-v3).
  const titikBendera: Record<string, string> = {
    MERAH: "#e85347",
    KUNING: "#f4bd0e",
    HIJAU: "#1ee0ac",
  };

  // Lajur jadual keputusan (DataTable kit). Klik baris membuka justifikasi
  // yang diterima (tindakan sedia ada).
  const lajurKeputusan: DataColumn<BarisKeputusan>[] = [
    {
      key: "pelajar",
      header: "Student",
      render: (b) => (
        <span className="flex items-center gap-2 min-w-0">
          <span
            aria-hidden="true"
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: b.flag ? (titikBendera[b.flag] ?? "#dbdfea") : "#dbdfea" }}
          />
          <span className="text-[13px] font-medium text-ink truncate">{b.name || "Student"}</span>
          {b.team_at_risk && (
            <Badge variant="dim" warna="red">AT RISK</Badge>
          )}
        </span>
      ),
    },
    {
      key: "kumpulan",
      header: "Group",
      render: (b) => <span className="text-[13px] text-ink-muted">{b.team_name}</span>,
    },
    {
      key: "p",
      header: "P",
      className: "text-right",
      hideOnMobile: true,
      render: (b) => (
        <span className="text-[13px] text-ink-muted tabular-nums">{b.p === null ? "-" : (Math.round(b.p * 10000) / 10000).toFixed(4)}</span>
      ),
    },
    {
      key: "f",
      header: "F",
      className: "text-right",
      hideOnMobile: true,
      render: (b) => (
        <span className="text-[13px] text-ink-muted tabular-nums">{b.f === null ? "-" : (Math.round(b.f * 10000) / 10000).toFixed(4)}</span>
      ),
    },
    {
      key: "fmod",
      header: "Fmod",
      className: "text-right",
      hideOnMobile: true,
      render: (b) => (
        <span className="text-[13px] text-ink-muted tabular-nums">{(Math.round(b.f_mod * 10000) / 10000).toFixed(4)}</span>
      ),
    },
    {
      key: "bendera",
      header: "Flag",
      render: (b) => (
        <span className="text-[12px] font-medium" style={{ color: b.flag ? (titikBendera[b.flag] ?? "#8094ae") : "#8094ae" }}>
          {b.flag ?? "-"}
        </span>
      ),
    },
    {
      key: "semak",
      header: "Review",
      render: (b) => (
        b.needs_review
          ? <span className="text-[12px] font-bold text-kz-down">YES</span>
          : <span className="text-[13px] text-ink-faint">-</span>
      ),
    },
  ];

  return (
    <Shell tabs={EDU_TABS}>
      <ClassShell classId={klass.id} current="peer-review" klass={klass}>
        {msg && (
          <Alert tone="info" className="mb-4">{msg}</Alert>
        )}

        {borangTerbuka && (
          <Card className="mb-4">
            <CardHead
              title="Create evaluation round"
              right={
                <Button variant="icon" ariaLabel="Close form" onClick={() => setBorangTerbuka(false)}>
                  <X className="w-4 h-4" />
                </Button>
              }
            />
            {rounds.length === 0 && (
              <Alert tone="info" className="my-4">
                <div className="font-bold text-ink mb-1">Suggested: three formative rounds</div>
                <p className="mb-3">Weeks 4, 6 and 9 catch group problems early. Marked (summative) rounds will come in a later phase.</p>
                <p className="text-[14px] font-medium text-[#344357] mb-2">Semester start date</p>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    type="date"
                    value={mulaSemester}
                    onChange={(e) => setMulaSemester(e.target.value)}
                    className="max-w-[200px]"
                    aria-label="Semester start date"
                  />
                  <Button size="sm" disabled={!mulaSemester} onClick={ciptaTemplat}>
                    Create all three rounds
                  </Button>
                  <span className="text-[12px] text-ink-faint">
                    Opens at start + (week - 1) weeks; closes seven days later. Not saved anywhere; you can edit each date.
                  </span>
                </div>
              </Alert>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
              <Field label="Round name" htmlFor="pusingan-nama">
                <Input id="pusingan-nama" value={nama} onChange={(e) => setNama(e.target.value)} placeholder="Peer review week 4" />
              </Field>
              <Field label="Week label (optional)" htmlFor="pusingan-minggu">
                <Input id="pusingan-minggu" type="number" min={1} max={52} value={minggu} onChange={(e) => setMinggu(e.target.value)} />
              </Field>
              <Field label="Opens at" htmlFor="pusingan-dibuka">
                <Input id="pusingan-dibuka" type="datetime-local" value={dibuka} onChange={(e) => setDibuka(e.target.value)} />
              </Field>
              <Field label="Closes at" htmlFor="pusingan-ditutup">
                <Input id="pusingan-ditutup" type="datetime-local" value={ditutup} onChange={(e) => setDitutup(e.target.value)} />
              </Field>
            </div>
            <div className="mt-4 flex justify-end">
              <Button onClick={simpanBorang}>Save round</Button>
            </div>
          </Card>
        )}

        {amaranSatuSudah && (
          <Alert tone="warning" icon={<AlertTriangle className="w-4 h-4" />} className="mb-4">
            <div className="font-bold">A single round measures but does not detect.</div>
            <p className="mb-3">Group problems will only become visible after everything is over. More rounds give earlier warning.</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setAmaranSatuSudah(false)}>Continue</Button>
              <Button size="sm" onClick={() => { setAmaranSatuSudah(false); setBorangTerbuka(true); }}>Add round</Button>
            </div>
          </Alert>
        )}

        {kumpulanDua.length > 0 && (
          <Alert tone="warning" icon={<Users className="w-4 h-4" />} className="mb-4">
            <div className="font-bold">Some groups have only two members: {kumpulanDua.join(", ")}.</div>
            <p>Each member receives a single evaluation, so no adjustment is made and both members are marked for review.</p>
          </Alert>
        )}

        {/* Bahagian pusingan */}
        <Card className="mb-4">
          <CardHead
            title="Rounds"
            subtitle="Each member rates their teammates on five criteria. Scores stay private; only you see the raw data."
            right={
              <Button size="sm" onClick={() => setBorangTerbuka(!borangTerbuka)}>
                <Plus className="w-4 h-4" /> Create round
              </Button>
            }
          />
          {rounds.length === 0 ? (
            <EmptyState
              icon={<Users className="w-6 h-6" />}
              title="No rounds yet"
              text="Use the suggested template or create a round."
              actionLabel="Create round"
              onAction={() => setBorangTerbuka(true)}
            />
          ) : (
            <div className="divide-y divide-kz-line">
              {rounds.map((r) => {
                const st = statusPusingan(r);
                const warna =
                  st === "terbuka" ? "green" :
                  st === "akan" ? "info" :
                  st === "dikira" ? "purple" :
                  "gray";
                return (
                  <div key={r.id} className="flex flex-wrap items-center gap-3 py-4">
                    <div className="min-w-0 flex-1">
                      <div className="text-[14px] font-medium text-ink truncate">
                        {r.name}
                        {r.week ? <span className="ml-2 text-[12px] text-ink-faint font-normal">week {r.week}</span> : null}
                      </div>
                      <div className="text-[12px] text-ink-faint">
                        {formatTarikh(r.opens_at)} to {formatTarikh(r.closes_at)}
                      </div>
                    </div>
                    <Badge variant="dot" warna={warna}>
                      {st === "akan" ? "Upcoming" : st === "terbuka" ? "Open" : st === "dikira" ? "Computed" : "Closed"}
                    </Badge>
                    {(st === "tertutup" || st === "dikira") && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => kira(r.id)}
                        disabled={kiraBusy}
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${kiraBusy ? "animate-spin" : ""}`} />
                        {st === "dikira" ? "Recompute" : "Compute results"}
                      </Button>
                    )}
                    <Button size="sm" onClick={() => setPusinganDipilih(r.id)}>
                      Results
                    </Button>
                    <Button
                      variant="icon"
                      ariaLabel={`Delete round ${r.name}`}
                      onClick={() => padamPusingan(r)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Bahagian keputusan: penapis kecil pada kepala kad, klik baris
            membuka justifikasi terima (penilai kekal tanpa nama). */}
        {keputusan && (
          penapis === "belum" ? (
            <div className="bg-white rounded-[4px] shadow-card">
              <CardHead
                title={`Results: ${keputusan.round.name}`}
                subtitle={
                  keputusan.round.computed_at
                    ? `Computed ${formatTarikh(keputusan.round.computed_at)}`
                    : "Not computed yet"
                }
                right={
                  <div className="flex flex-wrap gap-1.5">
                    {(["semua", "merah", "semak", "risiko", "belum"] as Penapis[]).map((k) => (
                      <Button
                        key={k}
                        size="sm"
                        variant={penapis === k ? "primary" : "outline"}
                        onClick={() => setPenapis(k)}
                      >
                        {belumLabel[k]}
                      </Button>
                    ))}
                  </div>
                }
              />
              <div className="px-6 pb-2">
                {keputusan.not_submitted.length === 0 ? (
                  <p className="text-[14px] text-ink-faint py-3">Everyone has submitted.</p>
                ) : (
                  <ul className="divide-y divide-kz-line">
                    {keputusan.not_submitted.map((m) => (
                      <li key={m.user_id + m.team_id} className="py-3 text-[13px]">
                        <span className="font-medium text-ink">{m.name || "Student"}</span>
                        <span className="text-ink-muted"> has not submitted their evaluation ({m.team_name}).</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ) : (
            <DataTable
              label={`Peer review results for ${keputusan.round.name}`}
              columns={lajurKeputusan}
              rows={barisDitapis}
              rowKey={(b) => b.user_id}
              onRowClick={(b) => setBarisTerbuka(barisTerbuka === b.user_id ? null : b.user_id)}
              head={
                <CardHead
                  title={`Results: ${keputusan.round.name}`}
                  subtitle={
                    keputusan.round.computed_at
                      ? `Computed ${formatTarikh(keputusan.round.computed_at)}`
                      : "Not computed yet"
                  }
                  right={
                    <div className="flex flex-wrap gap-1.5">
                      {(["semua", "merah", "semak", "risiko", "belum"] as Penapis[]).map((k) => (
                        <Button
                          key={k}
                          size="sm"
                          variant={penapis === k ? "primary" : "outline"}
                          onClick={() => setPenapis(k)}
                        >
                          {belumLabel[k]}
                        </Button>
                      ))}
                    </div>
                  }
                />
              }
              empty={
                <EmptyState
                  icon={<Users className="w-6 h-6" />}
                  title="No students match this filter."
                  text="Try another filter."
                />
              }
              renderRowExtra={(b) => {
                if (barisTerbuka !== b.user_id) return null;
                const just = justifikasiMengikut.get(b.user_id) ?? [];
                return (
                  <div className="rounded-[4px] border border-hairline bg-[#f8f9fc] p-4 text-[12px]">
                    <div className="font-bold text-ink mb-1">
                      Justifications received about {b.name || "this student"} (raters stay anonymous):
                    </div>
                    {just.length === 0 ? (
                      <p className="text-ink-faint">None. The student received no written justification.</p>
                    ) : (
                      <ul className="list-disc pl-4 space-y-1 text-ink-muted">
                        {just.map((j, i) => (
                          <li key={i}>
                            {j.justification}
                            <span className="ml-2 text-ink-faint">
                              (K1 {j.k1}, K2 {j.k2}, K3 {j.k3}, K4 {j.k4}, K5 {j.k5})
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              }}
            />
          )
        )}
      </ClassShell>
    </Shell>
  );
}