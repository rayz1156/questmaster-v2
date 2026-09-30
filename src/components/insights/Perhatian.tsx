"use client";

/**
 * Needs your attention (bahagian B): peserta dengan bendera selain
 * improving, disusun oleh susunPerhatian. Delapan baris pertama
 * dipaparkan; "Show all (N)" membuka yang lain. Klik nama membuka laci
 * markah peserta yang sama seperti halaman People. Warna pil: rose untuk
 * bottom_20/declining (prestasi), amber untuk bendera tingkah laku.
 */
import { useState } from "react";
import { ChevronDown, ChevronUp, CheckCircle2 } from "lucide-react";
import LaciMarkahPeserta from "@/components/people/LaciMarkahPeserta";
import { LABEL_BENDERA, type Bendera, type PelajarInsights } from "@/lib/insightsKelas";
import { formatMata } from "@/lib/markahPeserta";
import { susunPerhatian } from "@/lib/insightsUi";

const HAD_PAPARAN = 8;

/** Pil bendera; bendera tidak dikenali kekal dipapar sebagai apa adanya. */
function PilBendera({ flag }: { flag: string }) {
  const rose = flag === "bottom_20" || flag === "declining";
  const kelas = rose
    ? "bg-[#FDEBEA] text-[#C0392B]"
    : "bg-[#FDF3D7] text-[#96661A]";
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full ${kelas}`}>
      {LABEL_BENDERA[flag as Bendera] ?? flag}
    </span>
  );
}

export default function Perhatian({
  students,
  classId,
  jumlahAhli,
}: {
  students: readonly PelajarInsights[];
  classId: string;
  jumlahAhli: number;
}) {
  const [semua, setSemua] = useState(false);
  const [laci, setLaci] = useState<PelajarInsights | null>(null);

  const senarai = susunPerhatian(students);
  const dipapar = semua ? senarai : senarai.slice(0, HAD_PAPARAN);
  const disorok = senarai.length - dipapar.length;

  return (
    <section className="surface p-5">
      <h2 className="section-title">Needs your attention</h2>

      {senarai.length === 0 ? (
        <div className="flex items-center gap-3 mt-3">
          <CheckCircle2 className="w-5 h-5 text-[#2E7D4F]" />
          <p className="text-sm text-ink-muted">Everyone is on track.</p>
        </div>
      ) : (
        <>
          <ul className="divide-y divide-hairline border border-hairline rounded-xl mt-3">
            {dipapar.map((s) => (
              <li key={s.user_id} className="px-4 py-3 flex items-center gap-3 flex-wrap">
                <button
                  type="button"
                  onClick={() => setLaci(s)}
                  className="text-sm text-ink hover:text-brand-purple text-left truncate min-w-0"
                >
                  {s.name ?? "Unnamed learner"}
                </button>
                <span className="flex items-center gap-1.5 flex-wrap">
                  {s.flags
                    .filter((f) => f !== "improving")
                    .map((f) => (
                      <PilBendera key={f} flag={f} />
                    ))}
                </span>
                <span className="text-sm text-ink-muted tabular-nums ml-auto shrink-0">
                  {formatMata(s.total_score)}
                </span>
              </li>
            ))}
          </ul>
          {disorok > 0 && (
            <button
              type="button"
              onClick={() => setSemua(true)}
              className="btn-quiet mt-3 text-brand-purple"
            >
              Show all ({senarai.length}) <ChevronDown className="w-4 h-4 inline" />
            </button>
          )}
          {semua && senarai.length > HAD_PAPARAN && (
            <button
              type="button"
              onClick={() => setSemua(false)}
              className="btn-quiet mt-3 text-brand-purple"
            >
              Show fewer <ChevronUp className="w-4 h-4 inline" />
            </button>
          )}
        </>
      )}

      {/* Laci markah yang sama seperti halaman People (V2-013). */}
      {laci && (
        <LaciMarkahPeserta
          classId={classId}
          userId={laci.user_id}
          nama={laci.name ?? "Unnamed learner"}
          jumlahAhli={jumlahAhli}
          tutup={() => setLaci(null)}
        />
      )}
    </section>
  );
}