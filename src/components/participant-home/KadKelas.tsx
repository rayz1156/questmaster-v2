"use client";

/**
 * Kad "Your class" papan pemuka peserta (KZ-018b): menggantikan kad
 * "Akan Datang" pratonton dengan gaya kad yang sama, membawa dua pautan
 * sedia ada: Intro Board dan Learning Board.
 */

import Link from "next/link";
import { ArrowRight, BookOpen, ClipboardList } from "lucide-react";
import { fonTajuk } from "./fon";

const PAUTAN = [
  {
    hrefSuffix: "/board",
    label: "Intro Board",
    ikon: ClipboardList,
  },
  {
    hrefSuffix: "/learning-board",
    label: "Learning Board",
    ikon: BookOpen,
  },
];

export default function KadKelas({ classId }: { classId: string | null }) {
  return (
    <section className="min-w-0 rounded-[20px] border border-[#e7e5f2] bg-white p-[22px]">
      <h2 className={`m-0 mb-3 text-[19px] font-extrabold ${fonTajuk}`}>Your class</h2>
      <div className="flex flex-col gap-2.5">
        {PAUTAN.map((p) => {
          const aktif = !!classId;
          const href = aktif
            ? `/participant/classes/${encodeURIComponent(classId as string)}${p.hrefSuffix}`
            : "#";
          const Ikon = p.ikon;
          return (
            <Link
              key={p.label}
              href={href}
              aria-disabled={!aktif}
              className={`flex items-center gap-3 rounded-[12px] border border-[#e7e5f2] px-3.5 py-3 no-underline transition ${
                aktif
                  ? "hover:border-violet-300 hover:bg-violet-50"
                  : "pointer-events-none opacity-50"
              }`}
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-[#f6f5fb] text-[#1e1b3a]">
                <Ikon className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="flex-1 text-sm font-bold">{p.label}</span>
              <ArrowRight className="h-4 w-4 shrink-0 text-[#5b5878]" aria-hidden="true" />
            </Link>
          );
        })}
      </div>
    </section>
  );
}
