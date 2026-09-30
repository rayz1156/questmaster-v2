"use client";

/**
 * Class pulse (bahagian A): empat nombor yang menjawab keadaan kelas hari
 * ini. Purata markah dengan median sebagai hint, penyertaan Live Quiz,
 * ketepatan jawapan dan submission menunggu semakan. NULL bermakna tiada
 * data, dipapar sebagai sempang, bukan sifar.
 */
import { CheckCircle2, ClipboardCheck, Target, Zap } from "lucide-react";
import Stat from "@/components/insights/Stat";
import { formatMata } from "@/lib/markahPeserta";
import type { PulseInsights as Pulse } from "@/lib/insightsKelas";

export default function PulseKelas({ pulse }: { pulse: Pulse }) {
  // Medan peratus sudah dibundarkan 1 titik perpuluhan oleh SQL.
  const peratus = (v: number | null) =>
    typeof v === "number" && Number.isFinite(v) ? `${Math.round(v)}%` : "-";

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <Stat
        icon={<Target className="w-5 h-5" />}
        label="Average score"
        value={pulse.avg_total === null ? "-" : formatMata(pulse.avg_total)}
        hint={
          pulse.median_total === null
            ? undefined
            : `median ${formatMata(pulse.median_total)}`
        }
      />
      <Stat
        icon={<Zap className="w-5 h-5" />}
        label="Joined a Live Quiz"
        value={peratus(pulse.live_participation_pct)}
        hint={pulse.live_sessions === 1 ? "1 session" : `${pulse.live_sessions} sessions`}
      />
      <Stat
        icon={<CheckCircle2 className="w-5 h-5" />}
        label="Correct answers"
        value={peratus(pulse.accuracy_pct)}
        tone="green"
      />
      <Stat
        icon={<ClipboardCheck className="w-5 h-5" />}
        label="Waiting for review"
        value={formatMata(pulse.pending_reviews)}
        tone={pulse.pending_reviews > 0 ? "rose" : "green"}
      />
    </div>
  );
}