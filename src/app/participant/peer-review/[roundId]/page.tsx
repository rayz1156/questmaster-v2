"use client";

/**
 * Borang penilaian rakan sebaya (pelajar), Fasa 1.
 *
 * Satu kad bagi setiap rakan sekumpulan, lima kriteria, tiga butang
 * (Never, Sometimes, Always). Justifikasi muncul secara automatik apabila
 * mana mana kriteria dipilih 0 atau 1, dan butang hantar kekal mati
 * sehingga ia diisi. Diri sendiri tidak muncul dalam senarai. Semua
 * penilaian dihantar dalam SATU permintaan, jadi tiada penghantaran
 * separuh. Selepas hantar: skrin pengesahan ringkas sahaja, tanpa skor
 * atau apa apa tentang rakan.
 */
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, ClipboardList, Lock } from "lucide-react";
import ParticipantShell from "@/components/ParticipantShell";
import { useSession } from "@/lib/session";
import { peerApi } from "@/lib/peer-client";

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
      } catch (e: any) {
        setRalat(e.message || "Something went wrong.");
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
    } catch (e: any) {
      setRalat(e.message || "Failed to submit.");
    } finally {
      setBusy(false);
    }
  }

  // Skrin pengesahan ringkas: tiada skor, tiada keputusan, tiada rakan.
  if (selesai) {
    return (
      <ParticipantShell>
        <div className="max-w-shell mx-auto px-6 py-16 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-violet-100">
            <CheckCircle2 className="h-7 w-7 text-violet-600" />
          </div>
          <h1 className="page-title mb-2">Thank you, your evaluations are in.</h1>
          <p className="page-subtitle">
            They are confidential: your teammates will never see scores or who rated them. Only your educator sees the raw data.
          </p>
          <button onClick={() => router.push("/participant/home")} className="mt-6 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:opacity-95">
            Back to home
          </button>
        </div>
      </ParticipantShell>
    );
  }

  const tutup = borang ? Date.now() > Date.parse(borang.round.closes_at) : false;

  return (
    <ParticipantShell>
      <div className="max-w-shell mx-auto px-6 py-10">
        {loading ? (
          <p className="text-sm text-gray-500">Loading the form...</p>
        ) : ralat && !borang ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{ralat}</div>
        ) : !borang?.in_team ? (
          <div className="rounded-xl border border-violet-200 bg-violet-50 p-4 text-sm text-gray-700">
            You are not in a group for this evaluation round. Join a team on the Teams page first.
          </div>
        ) : borang.submitted ? (
          <div className="rounded-xl border border-violet-200 bg-violet-50 p-4 text-sm text-gray-700">
            You have already submitted your evaluations for this round. Thank you.
          </div>
        ) : tutup ? (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            This evaluation round is closed.
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-end justify-between gap-4 mb-4">
              <div className="min-w-0">
                <div className="eyebrow mb-1">Peer review</div>
                <h1 className="page-title">{borang.round.name}</h1>
              </div>
              <div className="text-sm text-gray-500">
                {rakanSelesai} of {jumlahRakan} teammates done
              </div>
            </div>

            {/* Ayat kerahsiaan: bukan hiasan. Pelajar menilai dengan jujur
                hanya apabila mereka percaya penilaian sulit. */}
            <div className="mb-6 flex items-start gap-3 rounded-xl border border-violet-200 bg-violet-50 p-4 text-sm text-gray-700">
              <Lock className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" />
              <span>
                This evaluation is confidential. Your teammates will never see the scores you give or who gave them, and only your educator sees the raw data.
              </span>
            </div>

            <div className="space-y-4">
              {borang.teammates.map((r) => {
                const j = jawapan[r.id] ?? { k1: -1, k2: -1, k3: -1, k4: -1, k5: -1 };
                const perlu = perluJustifikasi(j);
                const justAda = (justifikasi[r.id] ?? "").trim().length >= 10;
                return (
                  <div key={r.id} className="card">
                    <div className="font-semibold text-gray-900 mb-3">{r.name || "Teammate"}</div>
                    <div className="space-y-3">
                      {KRITERIA.map((k) => (
                        <div key={k.kod} className="flex flex-wrap items-center justify-between gap-2">
                          <div className="text-sm text-gray-700 min-w-0 flex-1">{k.label}</div>
                          <div className="flex gap-1.5">
                            {SKALA.map((s) => {
                              const aktif = (j as any)[k.kod] === s.nilai;
                              return (
                                <button
                                  key={s.nilai}
                                  type="button"
                                  onClick={() => pilih(r.id, k.kod, s.nilai)}
                                  className={aktif
                                    ? "rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-3 py-1.5 text-xs font-medium text-white"
                                    : "rounded-xl border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"}
                                >
                                  {s.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                    {/* Justifikasi muncul secara automatik bila ada kriteria 0 atau 1. */}
                    {perlu && (
                      <div className="mt-3">
                        <div className="text-xs font-medium text-gray-700 mb-1">
                          Why the low scores? (required, at least 10 characters)
                        </div>
                        <textarea
                          value={justifikasi[r.id] ?? ""}
                          onChange={(e) => setJustifikasi((s) => ({ ...s, [r.id]: e.target.value }))}
                          rows={2}
                          className="input"
                          placeholder="Explain so your educator understands the context."
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {ralat && (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{ralat}</div>
            )}

            <div className="mt-6 flex items-center justify-end gap-3">
              <Link href="/participant/teams" className="text-sm text-gray-500 hover:text-gray-700">
                Cancel
              </Link>
              <button
                onClick={hantar}
                disabled={busy || !semuaLengkap || jumlahRakan === 0}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:opacity-95 disabled:opacity-50"
              >
                <ClipboardList className="h-4 w-4" />
                {busy ? "Submitting..." : "Submit all evaluations"}
              </button>
            </div>
            {!semuaLengkap && (
              <p className="mt-2 text-right text-xs text-gray-500">
                Pick a rating for every teammate; a justification of at least 10 characters is required whenever any criterion is Never or Sometimes.
              </p>
            )}
          </>
        )}
      </div>
    </ParticipantShell>
  );
}