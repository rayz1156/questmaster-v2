"use client";

/**
 * Kad kemajuan peserta (KZ-018b), persis pratonton Versi 2: avatar
 * inisial 56px, nama + nama pasukan, jumlah mata besar Bricolage
 * (bukan "Level/XP"), dan kotak amber kedudukan kelas.
 *
 * Kotak amber disembunyi jika tiada kedudukan (tiada pasukan untuk mod
 * pasukan, tiada baris markah untuk mod individu, atau markah 0 tanpa
 * baris). Ayat jarak dikira oleh `ayatKedudukan` (logik tulen, diuji
 * dalam selftest-kz018b).
 */

import { inisial, ayatKedudukan } from "@/lib/papanPemukaPeserta";
import { fonTajuk } from "./fon";

export type BarisAtas = { nama: string; skor: number; kedudukan: number };

export default function KadKemajuan({
  nama,
  namaPasukan,
  jumlahMata,
  kedudukan,
  barisAtas,
}: {
  nama: string;
  namaPasukan: string | null;
  jumlahMata: number;
  kedudukan: number;
  barisAtas: BarisAtas | null;
}) {
  const ayat = ayatKedudukan(kedudukan, jumlahMata, barisAtas);
  return (
    <section
      aria-label="Your progress"
      className="min-w-0 flex-[1_1_300px] rounded-[20px] border border-[#e7e5f2] bg-white p-6 flex flex-col gap-[18px]"
    >
      <div className="flex items-center gap-[14px]">
        <span
          className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#ede9fe] text-[20px] font-extrabold text-[#5b21b6] ${fonTajuk}`}
        >
          {inisial(nama)}
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-[17px] font-bold">{nama || "Student"}</span>
          {namaPasukan && (
            <span className="text-[13px] text-[#5b5878]">{namaPasukan}</span>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <span className={`text-[26px] font-extrabold leading-none ${fonTajuk}`}>
          {(jumlahMata || 0).toLocaleString()} pts
        </span>
        <span className="text-[13px] text-[#5b5878]">Total points</span>
      </div>
      {ayat && kedudukan > 0 && (
        <div className="flex items-center gap-3 rounded-[14px] border border-[#fde68a] bg-[#fffbeb] p-[14px]">
          <span className={`text-[26px] font-extrabold text-[#92400e] ${fonTajuk}`}>
            #{kedudukan}
          </span>
          <span className="text-[13px] leading-[1.4] text-[#78350f]">{ayat}</span>
        </div>
      )}
    </section>
  );
}
