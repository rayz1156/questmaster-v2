"use client";

/**
 * Kad "Leaderboard" papan pemuka peserta (KZ-018b), persis pratonton
 * Versi 2: togol kecil "Teams" / "Individuals", nama kelas di bawah
 * tajuk, 5 teratas dengan bulatan kedudukan 28px (pingat emas/perak/
 * gangsa), baris sendiri dengan latar #f5f3ff outline #ddd6fe dan
 * "(you)" / "(your team)", baris sendiri di luar 5 teratas di bawah
 * pemisah, pautan "See full board".
 *
 * Logik 5-teratas diguna semula daripada `atas5DenganSaya` (KZ-018).
 */

import { useState } from "react";
import Link from "next/link";
import { atas5DenganSaya, type BarisPendahulu } from "@/lib/papanPemukaPeserta";
import { fonTajuk } from "./fon";

export type BarisSkor = { id: string; label: string; skor: number };

const PINGAT = ["#b45309", "#64748b", "#9a3412"];

export default function PapanPendahulu({
  barisPasukan,
  barisIndividu,
  myTeamId,
  myUserId,
  defaultMod,
  namaKelas,
}: {
  barisPasukan: BarisSkor[];
  barisIndividu: BarisSkor[];
  myTeamId: string | null;
  myUserId: string | null;
  defaultMod: "pasukan" | "individu";
  namaKelas: string;
}) {
  const [mod, setMod] = useState<"pasukan" | "individu">(defaultMod);
  const baris = mod === "pasukan" ? barisPasukan : barisIndividu;
  const myId = mod === "pasukan" ? myTeamId : myUserId;
  const potongan = atas5DenganSaya(baris, (r) => r.id, (r) => r.skor, myId);

  const butAsas = "min-h-8 rounded-lg px-2.5 text-[12px] font-semibold";
  const butHidup = `${butAsas} bg-white text-[#5b21b6] shadow-[0_1px_3px_rgba(30,27,58,0.12)]`;
  const butMati = `${butAsas} bg-transparent text-[#5b5878]`;

  const Baris = ({ p, saya }: { p: BarisPendahulu<BarisSkor>; saya: boolean }) => (
    <li
      className={`flex items-center gap-2.5 rounded-[10px] px-2.5 py-2 ${
        saya ? "bg-[#f5f3ff] outline outline-1 outline-[#ddd6fe]" : ""
      }`}
    >
      <span
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-extrabold ${
          p.kedudukan <= 3
            ? "text-white"
            : "bg-[#f1f0f7] text-[#3b3857]"
        }`}
        style={p.kedudukan <= 3 ? { background: PINGAT[p.kedudukan - 1] } : undefined}
      >
        {p.kedudukan}
      </span>
      <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-sm font-semibold">
        {p.baris.label}
        {saya && (mod === "pasukan" ? " (your team)" : " (you)")}
      </span>
      <span className="text-[13px] font-bold text-[#5b21b6]">
        {p.baris.skor.toLocaleString()}
      </span>
    </li>
  );

  return (
    <section className="min-w-0 rounded-[20px] border border-[#e7e5f2] bg-white p-[22px]">
      <div className="mb-1 flex items-center justify-between gap-3">
        <h2 className={`m-0 text-[19px] font-extrabold ${fonTajuk}`}>Leaderboard</h2>
        <div className="flex gap-0.5 rounded-[10px] bg-[#f6f5fb] p-[3px]">
          <button
            type="button"
            onClick={() => setMod("pasukan")}
            className={mod === "pasukan" ? butHidup : butMati}
          >
            Teams
          </button>
          <button
            type="button"
            onClick={() => setMod("individu")}
            className={mod === "individu" ? butHidup : butMati}
          >
            Individuals
          </button>
        </div>
      </div>
      <span className="text-[12px] text-[#5b5878]">{namaKelas}</span>
      {baris.length === 0 ? (
        <p className="mb-0 mt-3 text-[13px] text-[#5b5878]">
          No scores in this class yet.
        </p>
      ) : (
        <ol className="m-0 mt-3 list-none p-0 flex flex-col gap-1">
          {potongan.atas.map((p) => (
            <Baris key={p.baris.id} p={p} saya={p.saya} />
          ))}
          {potongan.saya && potongan.terpisah && (
            <>
              <li aria-hidden="true" className="mt-2 border-t border-[#e7e5f2]" />
              <Baris p={potongan.saya} saya />
            </>
          )}
        </ol>
      )}
      <Link
        href="/participant/leaderboard"
        className="mt-3 block text-[13px] font-semibold text-[#5b21b6]"
      >
        See full board
      </Link>
    </section>
  );
}
