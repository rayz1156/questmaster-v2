"use client";

/**
 * Panel pilihan mod sebelum memulakan sesi Live Quiz (KZ-012):
 * Classic (gaya Kahoot) atau Speed Race, dengan masa lumba dan cadangan
 * bilangan soalan supaya soalan tidak berulang.
 */
import { Flag, Users, Play, X } from "lucide-react";
import {
  RACE_MAX_MINUTES,
  RACE_MIN_MINUTES,
  cadanganSoalan,
  sahMinitLumba,
  ulanganSoalan,
} from "@/lib/lumba-laju";

interface Props {
  bilSoalan: number;
  mod: "classic" | "race";
  setMod: (m: "classic" | "race") => void;
  minitTeks: string;
  setMinitTeks: (v: string) => void;
  busy: boolean;
  onMula: () => void;
  onBatal: () => void;
}

export default function PanelMulaSesi({
  bilSoalan, mod, setMod, minitTeks, setMinitTeks, busy, onMula, onBatal,
}: Props) {
  const minit = sahMinitLumba(minitTeks);
  const cadangan = minit !== null ? cadanganSoalan(minit) : null;
  const ulang = cadangan ? ulanganSoalan(cadangan.disyorkan, bilSoalan) : 0;
  const cukup = cadangan ? bilSoalan >= cadangan.disyorkan : false;
  const bolehMula = bilSoalan > 0 && (mod === "classic" || minit !== null);

  const kad = (nilai: "classic" | "race", tajuk: string, huraian: string, Ikon: typeof Flag) => (
    <button
      type="button"
      onClick={() => setMod(nilai)}
      aria-pressed={mod === nilai}
      className={`text-left rounded-xl border p-4 transition flex gap-3 items-start
        ${mod === nilai ? "border-violet-500 bg-violet-50 ring-2 ring-violet-200" : "border-gray-200 hover:border-violet-300"}`}
    >
      <Ikon className={`w-5 h-5 mt-0.5 shrink-0 ${mod === nilai ? "text-violet-700" : "text-gray-400"}`} />
      <span>
        <span className="block font-semibold text-gray-900">{tajuk}</span>
        <span className="block text-sm text-gray-500 mt-0.5">{huraian}</span>
      </span>
    </button>
  );

  return (
    <div className="card mb-4">
      <div className="flex items-center justify-between mb-3">
        <div className="font-semibold">Choose a game mode</div>
        <button type="button" onClick={onBatal} title="Close" className="text-gray-400 hover:text-gray-700">
          <X className="w-5 h-5" />
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {kad("classic", "Classic", "Everyone answers the same question together, Kahoot style.", Users)}
        {kad("race", "Speed Race", "Each student races at their own pace. Fast, correct answers move their car further.", Flag)}
      </div>

      {mod === "race" && (
        <div className="mt-4 space-y-3">
          <div>
            <label htmlFor="race-minutes" className="block text-sm font-medium text-gray-700 mb-1">
              Race time (minutes)
            </label>
            <input
              id="race-minutes"
              type="number"
              inputMode="numeric"
              min={RACE_MIN_MINUTES}
              max={RACE_MAX_MINUTES}
              step={1}
              value={minitTeks}
              onChange={(e) => setMinitTeks(e.target.value)}
              className={`input rounded-xl w-32 ${minit === null ? "border-red-400" : ""}`}
            />
            {minit === null && (
              <p className="text-xs text-red-600 mt-1">
                Enter a whole number of minutes from {RACE_MIN_MINUTES} to {RACE_MAX_MINUTES}.
              </p>
            )}
          </div>

          {cadangan && (
            <div className="rounded-xl bg-violet-50 border border-violet-200 p-4">
              <div className="text-sm text-violet-900">
                Recommended: at least <strong className="text-lg">{cadangan.disyorkan}</strong> questions so no
                question repeats in a {minit}-minute race.
              </div>
              <div
                className={`text-sm rounded-lg px-3 py-1.5 mt-2 inline-block ${cukup ? "bg-green-50 text-green-800 border border-green-200" : "bg-amber-50 text-amber-800 border border-amber-200"}`}
              >
                {cukup
                  ? `This quiz has ${bilSoalan} questions. Enough, no repeats.`
                  : `This quiz has ${bilSoalan} questions. Each question will repeat up to ${ulang} times. Add ${cadangan.disyorkan - bilSoalan} more.`}
              </div>
              <ul className="text-xs text-violet-900/70 mt-2 space-y-0.5 list-disc pl-4">
                {cadangan.profil.map((p) => (
                  <li key={p.nama}>
                    {p.nama === "laju" ? "Fast student" : p.nama === "biasa" ? "Typical student" : "Struggling student"}:{" "}
                    {p.sampai
                      ? `finishes in about ${Math.max(1, Math.round(p.saatSampai / 60))} min after ${p.jumlah} answers`
                      : `will not reach the finish, about ${p.dalamMasa} answers`}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 mt-4">
        <button
          type="button"
          onClick={onMula}
          disabled={busy || !bolehMula}
          className="py-2 px-4 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-violet-600 to-indigo-600 disabled:opacity-50 flex items-center gap-1"
        >
          <Play className="w-4 h-4" /> {busy ? "Starting…" : mod === "race" ? "Start Speed Race" : "Start session"}
        </button>
        <button type="button" onClick={onBatal} className="px-3 py-2 rounded-xl border border-gray-300 hover:bg-gray-50 text-sm">
          Cancel
        </button>
      </div>
    </div>
  );
}
