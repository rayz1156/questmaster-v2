"use client";

/**
 * Paparan mod perbincangan soalan untuk hos, KZ-013: dikeluarkan daripada
 * RaceHostPanel supaya panel Speed Race dan Boss Battle memanggil komponen
 * yang sama. Paparan race TIDAK berubah. Parent membungkus komponen ini
 * dengan kad biasa atau lapisan skrin penuh projektor.
 */
import { MessageSquare, Eye, ChevronLeft, ChevronRight, Check, Maximize2, Minimize2 } from "lucide-react";

export interface PilihanReview { key: string; text: string }
export interface ReviewHos {
  index: number;
  total: number;
  revealed: boolean;
  question: { id: string; prompt: string; options: PilihanReview[]; correct_key: string | null };
  distribution: {
    pilihan: Record<string, number>;
    jumlahPertama: number;
    betulPertama: number;
    peratusBetulPertama: number | null;
    jumlahSemuaCubaan: number;
  };
}

interface Props {
  review: ReviewHos;
  busy: boolean;
  kawal: (action: string) => void;
  penuh: boolean;
  setPenuh: (v: boolean) => void;
}

const WARNA_JUBIN = ["bg-rose-500", "bg-sky-500", "bg-amber-500", "bg-emerald-500", "bg-violet-500", "bg-slate-500"];

export default function QuestionReview({ review: rv, busy, kawal, penuh, setPenuh }: Props) {
  const tertinggi = Math.max(1, ...Object.values(rv.distribution.pilihan));
  const akhir = rv.index >= rv.total - 1;
  const butangPenuh = (
    <button
      onClick={() => setPenuh(!penuh)}
      className="px-3 py-1.5 rounded-lg border border-violet-300 text-violet-700 hover:bg-violet-50 text-sm flex items-center gap-1"
      title={penuh ? "Exit projector view" : "Projector view"}
    >
      {penuh ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
      {penuh ? "Exit projector view" : "Projector view"}
    </button>
  );
  return (
    <div className={penuh ? "w-full max-w-6xl" : ""}>
      <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-violet-700">
          <MessageSquare className="w-4 h-4" /> Question {rv.index + 1} of {rv.total}
        </span>
        <div className="flex items-center gap-2 flex-wrap">{butangPenuh}</div>
      </div>
      <div className={`font-bold text-gray-900 mb-5 text-center ${penuh ? "text-3xl sm:text-4xl" : "text-xl"}`}>
        {rv.question.prompt}
      </div>

      {/* Carta bar cubaan pertama, satu bar di atas setiap jubin. */}
      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${rv.question.options.length}, minmax(0, 1fr))` }}>
        {rv.question.options.map((o, i) => {
          const n = rv.distribution.pilihan[o.key] ?? 0;
          const betul = rv.revealed && o.key === rv.question.correct_key;
          return (
            <div key={o.key} className="flex flex-col items-center justify-end">
              <div className="text-sm font-bold text-gray-700 tabular-nums mb-1">{n}</div>
              <div
                className={`w-full max-w-[90px] rounded-t-lg ${WARNA_JUBIN[i % WARNA_JUBIN.length]} ${rv.revealed && !betul ? "opacity-30" : ""} motion-safe:transition-all motion-safe:duration-500`}
                style={{ height: `${Math.max(4, Math.round((n / tertinggi) * (penuh ? 180 : 110)))}px` }}
              />
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4">
        {rv.question.options.map((o, i) => {
          const betul = rv.revealed && o.key === rv.question.correct_key;
          return (
            <div
              key={o.key}
              className={`rounded-xl px-4 py-3 text-white font-semibold flex items-center gap-3 ${WARNA_JUBIN[i % WARNA_JUBIN.length]}
                ${rv.revealed && !betul ? "opacity-35" : ""} ${betul ? "ring-4 ring-green-400" : ""} ${penuh ? "text-xl" : "text-sm"}`}
            >
              <span className="font-mono">{o.key}</span>
              <span className="flex-1">{o.text}</span>
              {betul && <Check className="w-6 h-6" />}
            </div>
          );
        })}
      </div>

      <div className="mt-4 text-center text-sm text-gray-600 min-h-[1.5rem]">
        {rv.revealed ? (
          rv.distribution.jumlahPertama > 0 ? (
            <>
              <strong className="text-gray-900">{rv.distribution.peratusBetulPertama}%</strong> got it right on the first try
              ({rv.distribution.betulPertama} of {rv.distribution.jumlahPertama} students). Total attempts: {rv.distribution.jumlahSemuaCubaan}.
            </>
          ) : (
            "Nobody answered this question during the race."
          )
        ) : (
          <>Bars show each student&apos;s first answer. Ask the class why before you reveal.</>
        )}
      </div>

      <div className="flex items-center justify-center gap-2 mt-4 flex-wrap">
        <button
          onClick={() => kawal("review_prev")}
          disabled={busy || rv.index === 0}
          className="px-3 py-2 rounded-xl border border-gray-300 hover:bg-gray-50 text-sm flex items-center gap-1 disabled:opacity-40"
        >
          <ChevronLeft className="w-4 h-4" /> Previous
        </button>
        {!rv.revealed && (
          <button
            onClick={() => kawal("review_reveal")}
            disabled={busy}
            className="py-2 px-4 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-violet-600 to-indigo-600 flex items-center gap-1 disabled:opacity-50"
          >
            <Eye className="w-4 h-4" /> Reveal answer
          </button>
        )}
        {akhir ? (
          <button
            onClick={() => kawal("review_end")}
            disabled={busy}
            className="px-3 py-2 rounded-xl border border-violet-300 text-violet-700 hover:bg-violet-50 text-sm flex items-center gap-1"
          >
            <Check className="w-4 h-4" /> Finish discussion
          </button>
        ) : (
          <button
            onClick={() => kawal("review_next")}
            disabled={busy}
            className="px-3 py-2 rounded-xl border border-gray-300 hover:bg-gray-50 text-sm flex items-center gap-1 disabled:opacity-40"
          >
            Next question <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </div>
      <p className="text-[11px] text-gray-400 text-center mt-2">Keyboard: ← previous · → next · R reveal</p>
    </div>
  );
}
