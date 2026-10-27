"use client";

/**
 * Panel pilihan mod sebelum memulakan sesi Live Quiz (KZ-012, KZ-013):
 * Classic (gaya Kahoot), Speed Race, atau Boss Battle, dengan masa bermain
 * dan cadangan bilangan soalan supaya soalan tidak berulang.
 * KZ-026: kad teks kecil diganti galeri kad bergambar mengikut KZ-DS-v3,
 * dengan tab penapis, panel seni SVG dan butang kit. Props, logik medan
 * minit/tahap, teks cadangan dan nilai yang dihantar semasa mula sesi
 * TIDAK berubah.
 */
import { useState } from "react";
import { Play, X, Check } from "lucide-react";
import { Button, Tabs } from "@/components/ui";
import SeniModPermainan, { LATAR_SENI } from "@/components/live/SeniModPermainan";
import {
  NILAI_BONUS_SEC,
  RACE_MAX_MINUTES,
  RACE_MIN_MINUTES,
  cadanganSoalan,
  cadanganSoalanRaksasa,
  jangkaanRaksasa,
  sahMinitLumba,
  ulanganSoalan,
  type TahapRaksasa,
} from "@/lib/lumba-laju";

interface Props {
  bilSoalan: number;
  mod: "classic" | "race" | "boss";
  setMod: (m: "classic" | "race" | "boss") => void;
  minitTeks: string;
  setMinitTeks: (v: string) => void;
  tahap: TahapRaksasa;
  setTahap: (t: TahapRaksasa) => void;
  bonusSec: number;
  setBonusSec: (n: number) => void;
  busy: boolean;
  onMula: () => void;
  onBatal: () => void;
}

const TAHAP_LABEL: Record<TahapRaksasa, string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
};

/** Kategori penapis tab: mod individu atau seluruh kelas. */
type KategoriMod = "individual" | "class";

/** Konfigurasi galeri mod permainan (KZ-026). Jangan tambah mod lain. */
const MOD_PERMAINAN: {
  nilai: "classic" | "race" | "boss";
  tajuk: string;
  huraian: string;
  kategori: KategoriMod;
  baharu: boolean;
}[] = [
  {
    nilai: "classic",
    tajuk: "Classic",
    huraian: "Everyone answers the same question together, Kahoot style.",
    kategori: "individual",
    baharu: false,
  },
  {
    nilai: "race",
    tajuk: "Speed Race",
    huraian: "Each student races at their own pace. Fast, correct answers move their car further.",
    kategori: "individual",
    baharu: true,
  },
  {
    nilai: "boss",
    tajuk: "Boss Battle",
    huraian: "The whole class teams up. Correct answers hit the boss; fast answers land critical hits.",
    kategori: "class",
    baharu: true,
  },
];

const LABEL_KATEGORI: Record<KategoriMod, string> = {
  individual: "Individual",
  class: "Whole class",
};

/** Keadaan tab penapis; state tempatan komponen sahaja (tidak disimpan). */
type TabPenapis = "semua" | KategoriMod;

export default function PanelMulaSesi({
  bilSoalan, mod, setMod, minitTeks, setMinitTeks, tahap, setTahap, bonusSec, setBonusSec, busy, onMula, onBatal,
}: Props) {
  const [tab, setTab] = useState<TabPenapis>("semua");

  const minit = sahMinitLumba(minitTeks);
  const cadangan = minit !== null && mod === "race" ? cadanganSoalan(minit) : null;
  const cadanganRaksasa = minit !== null && mod === "boss" ? cadanganSoalanRaksasa(minit) : null;
  const disyorkan = cadangan?.disyorkan ?? cadanganRaksasa ?? 0;
  const ulang = disyorkan > 0 ? ulanganSoalan(disyorkan, bilSoalan) : 0;
  const cukup = disyorkan > 0 ? bilSoalan >= disyorkan : false;
  const bolehMula = bilSoalan > 0 && (mod === "classic" || minit !== null);

  // Kiraan tab dikira daripada konfigurasi; tab kosong tidak dipapar.
  const bilIndividu = MOD_PERMAINAN.filter((m) => m.kategori === "individual").length;
  const bilKelas = MOD_PERMAINAN.filter((m) => m.kategori === "class").length;
  const tabItem = [
    { label: `All (${MOD_PERMAINAN.length})`, onSelect: () => setTab("semua"), aktif: tab === "semua" },
    ...(bilIndividu > 0
      ? [{ label: `Individual (${bilIndividu})`, onSelect: () => setTab("individual"), aktif: tab === "individual" }]
      : []),
    ...(bilKelas > 0
      ? [{ label: `Whole class (${bilKelas})`, onSelect: () => setTab("class"), aktif: tab === "class" }]
      : []),
  ];

  const kad = (m: (typeof MOD_PERMAINAN)[number]) => {
    const dipilih = mod === m.nilai;
    return (
      <button
        key={m.nilai}
        type="button"
        onClick={() => setMod(m.nilai)}
        aria-pressed={dipilih}
        className="text-left flex flex-col bg-white rounded-[6px] border-2 transition"
        style={{
          borderColor: dipilih ? "#854fff" : "#e5e9f2",
          boxShadow: "0 0 25px -12px rgba(31,43,58,.15)",
        }}
      >
        {/* Panel seni 150px, warna latar ikut seni */}
        <div
          className="relative flex items-center justify-center overflow-hidden"
          style={{ height: 150, backgroundColor: LATAR_SENI[m.nilai] }}
        >
          <SeniModPermainan nilai={m.nilai} />
          {m.baharu && (
            <span
              className="absolute left-3 top-3 text-white font-bold"
              style={{ backgroundColor: "#854fff", fontSize: 11, borderRadius: 3, padding: "2px 6px" }}
            >
              New
            </span>
          )}
          {dipilih && (
            <span
              aria-hidden="true"
              className="absolute right-3 top-3 flex items-center justify-center rounded-full text-white"
              style={{ width: 26, height: 26, backgroundColor: "#854fff" }}
            >
              <Check className="w-4 h-4" strokeWidth={3} />
            </span>
          )}
        </div>
        {/* Badan kad */}
        <div className="p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[16px] font-bold" style={{ color: "#364a63" }}>
              {m.tajuk}
            </span>
            <span
              className="text-[11px] font-bold whitespace-nowrap"
              style={{ backgroundColor: "#f5f6fa", color: "#526484", borderRadius: 999, padding: "3px 10px" }}
            >
              {LABEL_KATEGORI[m.kategori]}
            </span>
          </div>
          <p className="text-[13px] mt-2" style={{ color: "#526484" }}>
            {m.huraian}
          </p>
          <div className="mt-3 pt-3" style={{ borderTop: "1px solid #e5e9f2" }}>
            <span className="text-[12px]" style={{ color: "#6b7a99" }}>
              Uses this quiz&apos;s questions
            </span>
          </div>
        </div>
      </button>
    );
  };

  return (
    <div className="card mb-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-semibold" style={{ color: "#364a63" }}>
            Choose a game mode
          </div>
          <p className="text-[13px]" style={{ color: "#526484" }}>
            Same questions, different ways to play.
          </p>
        </div>
        <button
          type="button"
          onClick={onBatal}
          aria-label="Close"
          title="Close"
          className="w-11 h-11 shrink-0 flex items-center justify-center rounded-[4px] transition hover:bg-[#ebeef2]"
          style={{ color: "#526484" }}
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Tab penapis atas grid */}
      <Tabs items={tabItem} className="mt-2" />

      <div
        className="mt-4"
        style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "20px" }}
      >
        {MOD_PERMAINAN.filter((m) => tab === "semua" || m.kategori === tab).map(kad)}
      </div>

      {(mod === "race" || mod === "boss") && (
        <div className="mt-4 space-y-3">
          <div>
            <label
              htmlFor="race-minutes"
              className="block text-sm font-medium mb-1"
              style={{ color: "#344357" }}
            >
              {mod === "race" ? "Race time (minutes)" : "Battle time (minutes)"}
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
              className={`input rounded-[4px] w-32 ${minit === null ? "border-red-400" : ""}`}
            />
            {minit === null && (
              <p className="text-xs text-red-600 mt-1">
                Enter a whole number of minutes from {RACE_MIN_MINUTES} to {RACE_MAX_MINUTES}.
              </p>
            )}
          </div>

          {/* KZ-032: tempoh bar bonus kelajuan, dipilih guru untuk semua soalan. */}
          <div>
            <div className="block text-sm font-medium mb-1" style={{ color: "#344357" }}>
              Speed bonus
            </div>
            <div className="flex gap-2" role="radiogroup" aria-label="Speed bonus">
              {NILAI_BONUS_SEC.map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={bonusSec === n}
                  onClick={() => setBonusSec(n)}
                  className={`px-4 py-3 rounded-[4px] border-2 text-sm font-bold transition
                    ${bonusSec === n
                      ? "border-[#854fff] text-[#854fff]"
                      : "border-[#dbdfea] text-[#526484] hover:border-[#854fff]"}`}
                  style={{ backgroundColor: bonusSec === n ? "#ebe2ff" : "#fff" }}
                >
                  {n}s
                </button>
              ))}
            </div>
            <p className="text-xs mt-2" style={{ color: "#6b7a99" }}>
              Answering before the bar empties gives a speed bonus. Players can still answer after it empties.
            </p>
          </div>

          {mod === "boss" && (
            <>
              <div>
                <div className="block text-sm font-medium mb-1" style={{ color: "#344357" }}>
                  Boss level
                </div>
                <div className="flex gap-2" role="radiogroup" aria-label="Boss level">
                  {(Object.keys(TAHAP_LABEL) as TahapRaksasa[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      role="radio"
                      aria-checked={tahap === t}
                      onClick={() => setTahap(t)}
                      className={`px-4 py-3 rounded-[4px] border-2 text-sm font-bold transition
                        ${tahap === t
                          ? "border-[#854fff] text-[#854fff]"
                          : "border-[#dbdfea] text-[#526484] hover:border-[#854fff]"}`}
                      style={{ backgroundColor: tahap === t ? "#ebe2ff" : "#fff" }}
                    >
                      {TAHAP_LABEL[t]}
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-sm" style={{ color: "#526484" }}>
                {jangkaanRaksasa(tahap)}
              </p>
            </>
          )}

          {mod === "race" && cadangan && (
            <div className="rounded-[4px] p-4" style={{ backgroundColor: "#f5f6fa", border: "1px solid #e5e9f2" }}>
              <div className="text-sm" style={{ color: "#364a63" }}>
                Recommended: at least <strong className="text-lg">{cadangan.disyorkan}</strong> questions so no
                question repeats in a {minit}-minute race.
              </div>
              <div
                className={`text-sm rounded-[4px] px-3 py-1.5 mt-2 inline-block ${cukup ? "bg-green-50 text-green-800 border border-green-200" : "bg-amber-50 text-amber-800 border border-amber-200"}`}
              >
                {cukup
                  ? `This quiz has ${bilSoalan} questions. Enough, no repeats.`
                  : `This quiz has ${bilSoalan} questions. Each question will repeat up to ${ulang} times. Add ${cadangan.disyorkan - bilSoalan} more.`}
              </div>
              <ul className="text-xs mt-2 space-y-0.5 list-disc pl-4" style={{ color: "#526484" }}>
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

          {mod === "boss" && cadanganRaksasa !== null && (
            <div className="rounded-[4px] p-4" style={{ backgroundColor: "#f5f6fa", border: "1px solid #e5e9f2" }}>
              <div className="text-sm" style={{ color: "#364a63" }}>
                Recommended: at least <strong className="text-lg">{cadanganRaksasa}</strong> questions so no
                question repeats in a {minit}-minute battle.
              </div>
              <div
                className={`text-sm rounded-[4px] px-3 py-1.5 mt-2 inline-block ${cukup ? "bg-green-50 text-green-800 border border-green-200" : "bg-amber-50 text-amber-800 border border-amber-200"}`}
              >
                {cukup
                  ? `This quiz has ${bilSoalan} questions. Enough, no repeats.`
                  : `This quiz has ${bilSoalan} questions. Each question will repeat up to ${ulang} times. Add ${cadanganRaksasa - bilSoalan} more.`}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 mt-4">
        <span className="text-[13px]" style={{ color: "#526484" }}>
          Selected mode: <strong style={{ color: "#364a63" }}>{MOD_PERMAINAN.find((m) => m.nilai === mod)?.tajuk}</strong>
        </span>
        <div className="flex items-center gap-2">
          <Button size="lg" onClick={onMula} disabled={busy || !bolehMula}>
            <Play className="w-4 h-4" />
            {busy
              ? "Starting…"
              : mod === "race"
                ? "Start Speed Race"
                : mod === "boss"
                  ? "Start Boss Battle"
                  : "Start session"}
          </Button>
          <Button size="lg" variant="outline" onClick={onBatal}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
