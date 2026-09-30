"use client";

/**
 * What they find hard (bahagian D): dua lajur. Kiri soalan Live Quiz
 * paling susar, kanan cabaran aktiviti paling kerap ditolak. Bar peratus
 * ialah div ringkas dengan latar hairline, bukan SVG. Keadaan kosong
 * setiap lajur: "Not enough answers yet."
 */
import type { CabaranSusar, SoalanSusar } from "@/lib/insightsKelas";

/** Bar peratus nipis; NULL (tiada data) dipapar sebagai tiada bar. */
function BarPeratus({ pct, warna }: { pct: number | null; warna: string }) {
  const v = typeof pct === "number" && Number.isFinite(pct) ? Math.min(100, Math.max(0, pct)) : 0;
  if (pct === null) {
    return <div className="h-1.5 rounded-full bg-[#F4F4F6]" />;
  }
  return (
    <div className="h-1.5 rounded-full bg-[#F4F4F6] overflow-hidden">
      <div className={`h-full rounded-full ${warna}`} style={{ width: `${v}%` }} />
    </div>
  );
}

/** Prompt dipangkas supaya baris senarai kekal sebaris ketinggian. */
function potongPrompt(teks: string, had = 90): string {
  const t = teks.trim();
  return t.length <= had ? t : `${t.slice(0, had - 1).trimEnd()}…`;
}

const PERATUS = (v: number | null) =>
  typeof v === "number" && Number.isFinite(v) ? `${Math.round(v)}%` : "-";

const DETIK = (ms: number | null) =>
  typeof ms === "number" && Number.isFinite(ms) ? `${(ms / 1000).toFixed(1)}s` : "-";

export default function Susar({
  questions,
  challenges,
}: {
  questions: readonly SoalanSusar[];
  challenges: readonly CabaranSusar[];
}) {
  return (
    <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Kiri: soalan Live Quiz susar. */}
      <div className="surface p-5">
        <h2 className="section-title">Hardest questions</h2>
        {questions.length === 0 ? (
          <p className="text-sm text-ink-muted mt-3">Not enough answers yet.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {questions.map((q) => (
              <li key={q.question_id} className="border border-hairline rounded-xl p-3">
                <div className="text-sm text-ink">{potongPrompt(q.prompt)}</div>
                <div className="text-xs text-ink-faint mt-0.5">{q.quiz_title}</div>
                <div className="mt-2">
                  <div className="flex items-center justify-between text-xs text-ink-muted mb-1">
                    <span>{PERATUS(q.correct_pct)} correct</span>
                    <span>avg {DETIK(q.avg_ms)}</span>
                  </div>
                  <BarPeratus pct={q.correct_pct} warna="bg-[#7057D9]" />
                </div>
                {q.top_wrong_choice && (
                  <div className="text-xs text-ink-faint mt-1.5">
                    Most picked wrong answer:{" "}
                    {q.top_wrong_choice.label ?? q.top_wrong_choice.key} ({q.top_wrong_choice.count})
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Kanan: cabaran aktiviti paling kerap ditolak. */}
      <div className="surface p-5">
        <h2 className="section-title">Hardest challenges</h2>
        {challenges.length === 0 ? (
          <p className="text-sm text-ink-muted mt-3">Not enough answers yet.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {challenges.map((c) => (
              <li key={c.challenge_id} className="border border-hairline rounded-xl p-3">
                <div className="text-sm text-ink">{potongPrompt(c.title, 80)}</div>
                <div className="text-xs text-ink-faint mt-0.5">{c.hunt_title}</div>
                <div className="mt-2">
                  <div className="flex items-center justify-between text-xs text-ink-muted mb-1">
                    <span>{PERATUS(c.rejected_pct)} rejected</span>
                    <span>{c.pending} pending</span>
                  </div>
                  <BarPeratus pct={c.rejected_pct} warna="bg-[#C0392B]" />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}