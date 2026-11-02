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
import { useBahasa } from "@/lib/i18n/BahasaProvider";

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

// Kriteria penilaian: label diterjemah masa render melalui kunci kamus.
const KRITERIA = [
  { kod: "k1", kunci: "participant.criterionAttendance" },
  { kod: "k2", kunci: "participant.criterionResponsibility" },
  { kod: "k3", kunci: "participant.criterionParticipation" },
  { kod: "k4", kunci: "participant.criterionCommunication" },
  { kod: "k5", kunci: "participant.criterionRespect" },
] as const;

const SKALA = [
  { nilai: 0, kunci: "participant.never" },
  { nilai: 1, kunci: "participant.sometimes" },
  { nilai: 2, kunci: "participant.always" },
] as const;

type Jawapan = Record<string, { k1: number; k2: number; k3: number; k4: number; k5: number }>;

export default function PeerReviewFormPage() {
  const { t } = useBahasa();
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
        if (!res.ok) throw new Error(json.error || t("participant.roundNotFound"));
        setBorang(json);
        // Mula: semua kriteria belum dipilih (0 bermaksud Never, bukan belum).
        const awal: Jawapan = {};
        for (const r of json.teammates ?? []) {
          awal[r.id] = { k1: -1, k2: -1, k3: -1, k4: -1, k5: -1 };
        }
        setJawapan(awal);
      } catch (e) {
        setRalat((e as { message?: string })?.message || t("participant.somethingWentWrong"));
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
      if (!res.ok) throw new Error(json.error || t("participant.failedToSubmit"));
      setSelesai(true);
    } catch (e) {
      setRalat((e as { message?: string })?.message || t("participant.failedToSubmit"));
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
            title={t("participant.thankYouTitle")}
            text={t("participant.thankYouText")}
            actionLabel={t("participant.backToHomeAction")}
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
        <p className="text-[14px] text-ink-muted">{t("participant.loadingForm")}</p>
      ) : ralat && !borang ? (
        <Alert tone="danger">{ralat}</Alert>
      ) : !borang?.in_team ? (
        <Alert tone="info">
          {t("participant.notInGroup")}
        </Alert>
      ) : borang.submitted ? (
        <Alert tone="info">
          {t("participant.alreadySubmitted")}
        </Alert>
      ) : tutup ? (
        <Alert tone="warning">
          {t("participant.roundClosed")}
        </Alert>
      ) : (
        <>
          <PageHead
            crumb={t("participant.peerReviewCrumb")}
            name={borang.round.name}
            description={t("participant.teammatesDone", { selesai: rakanSelesai, jumlah: jumlahRakan })}
          />

          {/* Ayat kerahsiaan: bukan hiasan. Pelajar menilai dengan jujur
              hanya apabila mereka percaya penilaian sulit. */}
          <Alert tone="info" icon={<Lock className="h-4 w-4" />} className="mb-6">
            {t("participant.confidentiality")}
          </Alert>

          <div className="space-y-4">
            {borang.teammates.map((r) => {
              const j = jawapan[r.id] ?? { k1: -1, k2: -1, k3: -1, k4: -1, k5: -1 };
              const perlu = perluJustifikasi(j);
              return (
                <Card key={r.id}>
                  <CardHead title={r.name || t("participant.teammate")} />
                  <div className="mt-4 space-y-3">
                    {KRITERIA.map((k) => (
                      <div key={k.kod} className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-[14px] text-ink-muted min-w-0 flex-1">{t(k.kunci)}</div>
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
                                ariaLabel={`${t(k.kunci)}: ${t(s.kunci)}`}
                              >
                                {t(s.kunci)}
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
                      <Field label={t("participant.lowScoresQuestion")} htmlFor={`justifikasi-${r.id}`}>
                        <Textarea
                          id={`justifikasi-${r.id}`}
                          value={justifikasi[r.id] ?? ""}
                          onChange={(e) => setJustifikasi((s) => ({ ...s, [r.id]: e.target.value }))}
                          rows={2}
                          placeholder={t("participant.lowScoresPlaceholder")}
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
            <Button variant="ghost" href="/participant/teams">{t("common.cancel")}</Button>
            <Button
              onClick={hantar}
              disabled={busy || !semuaLengkap || jumlahRakan === 0}
            >
              <ClipboardList className="h-4 w-4" />
              {busy ? t("participant.submitting") : t("participant.submitAll")}
            </Button>
          </div>
          {!semuaLengkap && (
            <p className="mt-2 text-right text-xs text-gray-500">
              {t("participant.submitHint")}
            </p>
          )}
        </>
      )}
    </ParticipantShell>
  );
}