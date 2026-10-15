"use client";

/**
 * Senarai "My Quests" papan pemuka peserta (KZ-018b), persis pratonton
 * Versi 2: tab "Active · N" / "Ended · N", baris dengan jalur warna
 * kelas, nama kelas kecil, tajuk, ayat tarikh; kanan label tarikh
 * ringkas (merah tebal jika tamat <= 1 hari) dan butang gelap
 * "Continue" / butang garis ungu "View".
 *
 * TIADA bar peratus: tiada data kemajuan per pelajar (keputusan KZ-018).
 * Susunan ikut end_at terdekat dilakukan oleh halaman pemanggil.
 */

import { useState } from "react";
import Link from "next/link";
import { fonTajuk } from "./fon";

/** Satu baris quest yang sudah siap untuk dipapar. */
export type BarisQuest = {
  id: string;
  tajuk: string;
  kelasNama: string;
  warna: string; // jalur warna kelas, daripada warnaKelas()
  ayatTarikh: string; // ayat kecil di bawah tajuk, cth. "Due in 5 days"
  labelTarikh: string; // label ringkas kanan, cth. "24 Oct"
  segera: boolean; // merah tebal jika tamat <= 1 hari
  tamat: boolean; // tab Ended: butang garis "View"
  href: string;
};

function ButangRow({ q }: { q: BarisQuest }) {
  const asas =
    "inline-flex min-h-[44px] min-w-[104px] items-center justify-center rounded-[12px] px-4 text-sm font-bold no-underline";
  return q.tamat ? (
    <Link
      href={q.href}
      className={`${asas} border-[1.5px] border-[#c4b5fd] bg-white text-[#5b21b6]`}
    >
      View
    </Link>
  ) : (
    <Link href={q.href} className={`${asas} bg-[#1e1b3a] text-white`}>
      Continue
    </Link>
  );
}

export default function SenaraiQuest({
  aktif,
  tamat,
}: {
  aktif: BarisQuest[];
  tamat: BarisQuest[];
}) {
  const [tab, setTab] = useState<"aktif" | "tamat">("aktif");
  const senarai = tab === "aktif" ? aktif : tamat;

  const tabAsas =
    "min-h-[38px] rounded-[9px] px-[14px] text-[13px] font-semibold";
  const tabHidup = `${tabAsas} bg-white text-[#5b21b6] shadow-[0_1px_3px_rgba(30,27,58,0.12)]`;
  const tabMati = `${tabAsas} bg-transparent text-[#5b5878]`;

  return (
    <section className="min-w-0 flex-[999_1_520px] rounded-[20px] border border-[#e7e5f2] bg-white p-[22px]">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <h2 className={`m-0 text-[22px] font-extrabold ${fonTajuk}`}>My Quests</h2>
        <div
          role="tablist"
          aria-label="Quest status"
          className="flex gap-1 rounded-[12px] bg-[#f6f5fb] p-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === "aktif"}
            onClick={() => setTab("aktif")}
            className={tab === "aktif" ? tabHidup : tabMati}
          >
            Active · {aktif.length}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "tamat"}
            onClick={() => setTab("tamat")}
            className={tab === "tamat" ? tabHidup : tabMati}
          >
            Ended · {tamat.length}
          </button>
        </div>
      </div>
      {senarai.length === 0 ? (
        <p className="m-0 pt-4 text-[13px] text-[#5b5878]">
          {tab === "aktif"
            ? "No active quests right now."
            : "No ended quests yet."}
        </p>
      ) : (
        <ul className="m-0 list-none p-0 flex flex-col">
          {senarai.map((q) => (
            <li
              key={q.id}
              className="flex flex-wrap items-center gap-x-[18px] gap-y-3 border-t border-[#efedf6] py-4"
            >
              <span
                aria-hidden="true"
                className="h-[44px] w-[10px] shrink-0 rounded-full"
                style={{ background: q.warna }}
              />
              <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-1">
                <span className="text-[12px] font-bold text-[#5b5878]">
                  {q.kelasNama}
                </span>
                <span className="text-[16px] font-bold leading-[1.35]">
                  {q.tajuk}
                </span>
                {q.ayatTarikh && (
                  <span className="text-[13px] text-[#3b3857]">{q.ayatTarikh}</span>
                )}
              </div>
              <span
                className={`text-[12px] ${
                  q.segera ? "font-bold text-[#b91c1c]" : "text-[#5b5878]"
                }`}
              >
                {q.labelTarikh}
              </span>
              <ButangRow q={q} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
