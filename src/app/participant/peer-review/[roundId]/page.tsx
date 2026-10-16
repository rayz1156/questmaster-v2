"use client";

/**
 * Borang penilaian rakan sebaya (pelajar), Fasa 1, rupa v3 KZ-023.
 *
 * Satu kad bagi setiap rakan sekumpulan, lima kriteria, tiga butang
 * (Never, Sometimes, Always) memakai kit Button. Justifikasi (kit Field
 * dan Textarea) muncul secara automatik apabila mana mana kriteria
 * dipilih 0 atau 1, dan butang hantar kekal mati sehingga ia diisi.
 * Diri sendiri tidak muncul dalam senarai. Semua penilaian dihantar
 * dalam SATU permintaan, jadi tiada penghantaran separuh. Selepas
 * hantar: skrin pengesahan ringkas sahaja, tanpa skor atau apa apa
 * tentang rakan. Logik data tidak berubah daripada versi sebelum
 * KZ-023.
 */
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { CheckCircle2, ClipboardList, Lock } from "lucide-react";
import ParticipantShell from "@/components/ParticipantShell";
import { useSession } from "@/lib/session";
import { peerApi } from "@/lib/peer-client";
import {
  Alert,
  Button,
  Card,
  CardHead,
  EmptyState,
  Field,
  PageHead,
  Textarea,
} from "@/components/ui";

type Rakan = { id: string; name: string };

type BorangData = {
  round: { id: string; name: string; opens_at: string; closes_at: string };
  in_team: boolean;
  team_id: string | null;
  teammates: Rakan[];
  submitted: boolean;
  submitted_count: number;
  total_to_evaluate: number;
};

const KRITERIA = [
  { kod: "k1", label: "Attendance and punctuality" },
  { kod: "k2", label: "Sharing responsibility" },
  { kod: "k3", label: "Active participation" },
  { kod: "k4", label: "Communication" },
  { kod: "k5", label: "Respect and support" },
] as const;

const SKALA = [
  { nilai: 0, label: "Never" },
  { nilai: 1, label: "Sometimes" },
  { nilai: 2, label: "Always" },
];

type Jawapan = Record<string, { k1: number; k2: number; k3: number; k4: number; k5: number }>;

export default function PeerReviewFormPage() {
  const { roundId } = useParams<{ roundId: string }>();
  const router = useRouter();
  const { user, loading: authLoading } = useSession("participant");

  const [borang, setBorang] = useState<BorangData | null>(null);
  const [loading, setLoading] = useState(true);
  const [jawapan, setJawapan] = useState<Jawapan>({});
  const [justifikasi, setJustifikasi] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [ralat, setRalat] = useState<string | null>(null);
  const [selesai, setSelesai] = useState(false);

  useEffect(() => {
    if (authLoading || !user) return;
    (async () => {
      try {
        const res = await peerApi(`/api/peer-rounds/${roundId}/form`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "This evaluation round could not be found.");
        setBorang(json);
        // Mula: semua kriteria belum dipilih (0 bermaksud Never, bukan belum).
        const awal: Jawapan = {};
        for (const r of json.teammates ?? []) {
          awal[r.id] = { k1: -1, k2: -1, k3: -1, k4: -1, k5: -1 };
        }
        setJawapan(awal);
      } catch (e) {
        setRalat((e as { message?: string })?.message || "Something went wrong.");
      } finally {
        setLoading(false);
      }
    })();
  }, [authLoading, user, roundId]);

  function pilih(rakan: string, kriteria: string, nilai: number) {
    setJawapan((j) => ({ ...j, [rakan]: { ...j[rakan], [kriteria]: nilai } }));
  }

  function lengkap(j: { k1: number; k2: number; k3: number; k4: number; k5: number }): boolean {
    return [j.k1, j.k2, j.k3, j.k4, j.k5].every((k) => k >= 0);
  }

  function perluJustifikasi(j: { k1: number; k2: number; k3: number; k4: number; k5: number }): boolean {
    return [j.k1, j.k2, j.k3, j.k4, j.k5].some((k) => k >= 0 && k < 2);
  }

  const semuaLengkap = (borang?.teammates ?? []).every((r) => {
    const j = jawapan[r.id];
    return j && lengkap(j) && (!perluJustifikasi(j) || (justifikasi[r.id] ?? "").trim().length >= 10);
  });
  const rakanSelesai = (borang?.teammates ?? []).filter((r) => jawapan[r.id] && lengkap(jawapan[r.id])).length;
  const jumlahRakan = borang?.teammates.length ?? 0;

  async function hantar() {
    if (!borang) return;
    setBusy(true);
    setRalat(null);
    try {
      const ratings = borang.teammates.map((r) => ({
        ratee_id: r.id,
        ...jawapan[r.id],
        justification: (justifikasi[r.id] ?? "").trim() || null,
      }));
      const res = await peerApi(`/api/peer-rounds/${roundId}/ratings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ratings }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to submit.");
      setSelesai(true);
    } catch (e) {
      setRalat((e as { message?: string })?.message || "Failed to submit.");
    } finally {
      setBusy(false);
    }
  }

  // Skrin pengesahan ringkas: tiada skor, tiada keputusan, tiada rakan.
  if (selesai) {
    return (
      <ParticipantShell>
        <div className="max-w-xl">
          <EmptyState
            icon={<CheckCircle2 className="w-6 h-6" />}
            title="Thank you, your evaluations are in."
            text="They are confidential: your teammates will never see scores or who rated them. Only your educator sees the raw data."
            actionLabel="Back to home"
            onAction={() => router.push("/participant/home")}
          />
        </div>
      </ParticipantShell>
    );
  }

  const tutup = borang ? Date.now() > Date.parse(borang.round.closes_at) : false;

  return (
    <ParticipantShell>
      {loading ? (
        <p className="text-[14px] text-ink-muted">Loading the form...</p>
      ) : ralat && !borang ? (
        <Alert tone="danger">{ralat}</Alert>
      ) : !borang?.in_team ? (
        <Alert tone="info">
          You are not in a group for this evaluation round. Join a team on the Teams page first.
        </Alert>
      ) : borang.submitted ? (
        <Alert tone="info">
          You have already submitted your evaluations for this round. Thank you.
        </Alert>
      ) : tutup ? (
        <Alert tone="warning">
          This evaluation round is closed.
        </Alert>
      ) : (
        <>
          <PageHead
            crumb="Peer review"
            name={borang.round.name}
            description={`${rakanSelesai} of ${jumlahRakan} teammates done`}
          />

          {/* Ayat kerahsiaan: bukan hiasan. Pelajar menilai dengan jujur
              hanya apabila mereka percaya penilaian sulit. */}
          <Alert tone="info" icon={<Lock className="h-4 w-4" />} className="mb-6">
            This evaluation is confidential. Your teammates will never see the scores you give or who gave them, and only your educator sees the raw data.
          </Alert>

          <div className="space-y-4">
            {borang.teammates.map((r) => {
              const j = jawapan[r.id] ?? { k1: -1, k2: -1, k3: -1, k4: -1, k5: -1 };
              const perlu = perluJustifikasi(j);
              return (
                <Card key={r.id}>
                  <CardHead title={r.name || "Teammate"} />
                  <div className="mt-4 space-y-3">
                    {KRITERIA.map((k) => (
                      <div key={k.kod} className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-[14px] text-ink-muted min-w-0 flex-1">{k.label}</div>
                        <div className="flex gap-1.5">
                          {SKALA.map((s) => {
                            const aktif = j[k.kod] === s.nilai;
                            return (
                              <Button
                                key={s.nilai}
                                variant={aktif ? "dim" : "outline"}
                                size="sm"
                                warna="purple"
                                onClick={() => pilih(r.id, k.kod, s.nilai)}
                                ariaLabel={`${k.label}: ${s.label}`}
                              >
                                {s.label}
                              </Button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* Justifikasi muncul secara automatik bila ada kriteria 0 atau 1. */}
                  {perlu && (
                    <div className="mt-4">
                      <Field label="Why the low scores? (required, at least 10 characters)" htmlFor={`justifikasi-${r.id}`}>
                        <Textarea
                          id={`justifikasi-${r.id}`}
                          value={justifikasi[r.id] ?? ""}
                          onChange={(e) => setJustifikasi((s) => ({ ...s, [r.id]: e.target.value }))}
                          rows={2}
                          placeholder="Explain so your educator understands the context."
                        />
                      </Field>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>

          {ralat && <Alert tone="danger" className="mt-4">{ralat}</Alert>}

          <div className="mt-6 flex items-center justify-end gap-3">
            <Button variant="ghost" href="/participant/teams">Cancel</Button>
            <Button
              onClick={hantar}
              disabled={busy || !semuaLengkap || jumlahRakan === 0}
            >
              <ClipboardList className="h-4 w-4" />
              {busy ? "Submitting..." : "Submit all evaluations"}
            </Button>
          </div>
          {!semuaLengkap && (
            <p className="mt-2 text-right text-xs text-gray-500">
              Pick a rating for every teammate; a justification of at least 10 characters is required whenever any criterion is Never or Sometimes.
            </p>
          )}
        </>
      )}
    </ParticipantShell>
  );
}