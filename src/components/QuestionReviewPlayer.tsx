"use client";

/**
 * Paparan mod perbincangan untuk skrin PEMAIN, KZ-013: dikeluarkan daripada
 * RacePlayer supaya kedua-dua mod (Speed Race dan Boss Battle) memanggil
 * komponen yang sama. Paparan race TIDAK berubah.
 */
import { MessageSquare, Check } from "lucide-react";

export interface PilihanPemain { key: string; text: string }
export interface SoalanReviewPemain {
  id: string;
  prompt: string;
  options: PilihanPemain[];
  timeLimitSec?: number;
}
export interface ReviewPemain {
  index: number;
  total: number;
  revealed: boolean;
  questionId: string;
  myFirstChoice: string | null;
  myFirstCorrect: boolean | null;
  correctKey: string | null;
}

interface Props {
  rv: ReviewPemain;
  q: SoalanReviewPemain;
}

export default function QuestionReviewPlayer({ rv, q }: Props) {
  return (
    <div className="card">
      <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
        <span className="inline-flex items-center gap-1 font-semibold text-violet-700">
          <MessageSquare className="w-4 h-4" /> Class discussion
        </span>
        <span>Question {rv.index + 1} of {rv.total}</span>
      </div>
      <div className="font-semibold mb-3">{q.prompt}</div>
      <div className="space-y-2">
        {q.options.map((o) => {
          const betul = rv.revealed && o.key === rv.correctKey;
          const pertama = o.key === rv.myFirstChoice;
          return (
            <div
              key={o.key}
              className={`rounded-xl border px-3 py-2 text-sm flex items-center gap-2
                ${betul ? "border-green-500 bg-green-50 font-semibold text-green-800"
                  : rv.revealed ? "border-gray-200 opacity-60" : "border-gray-200"}`}
            >
              <span className="font-mono">{o.key}.</span>
              <span className="flex-1">{o.text}</span>
              {pertama && (
                <span className="text-[11px] rounded-full bg-violet-100 text-violet-700 px-2 py-0.5 shrink-0">
                  Your first answer
                </span>
              )}
              {betul && <Check className="w-4 h-4 text-green-600 shrink-0" />}
            </div>
          );
        })}
      </div>
      <div className="mt-3 text-sm text-center">
        {!rv.myFirstChoice ? (
          <span className="text-gray-500">You did not answer this one during the game.</span>
        ) : !rv.revealed ? (
          <span className="text-gray-500">Think about it. Your teacher will reveal the answer soon.</span>
        ) : rv.myFirstCorrect ? (
          <span className="font-semibold text-green-700">You got it right on your first try.</span>
        ) : (
          <span className="font-semibold text-amber-700">Not quite on the first try. Listen to the explanation.</span>
        )}
      </div>
    </div>
  );
}
