"use client";

/**
 * Kad pautan "Your class" papan pemuka peserta (KZ-018).
 *
 * Pautan Intro Board dan Learning Board sedia ada (laluan tidak diubah),
 * dibina semula dalam gaya kad baharu. classId dikodkan bila diperlukan
 * oleh halaman pemanggil.
 */

import Link from "next/link";
import { ArrowRight, ClipboardList, BookOpen } from "lucide-react";

const PAUTAN = [
  {
    hrefSuffix: "/board",
    label: "Intro Board",
    desc: "Class information, announcements and guidelines.",
    ikon: <ClipboardList className="w-5 h-5" aria-hidden="true" />,
  },
  {
    hrefSuffix: "/learning-board",
    label: "Learning Board",
    desc: "Modules, lessons and materials, session by session.",
    ikon: <BookOpen className="w-5 h-5" aria-hidden="true" />,
  },
];

export default function PautanKelas({ classId }: { classId: string | null }) {
  return (
    <div className="card rounded-2xl p-5 min-w-[300px] flex-1">
      <div className="section-title mb-3">Your class</div>
      <div className="space-y-3">
        {PAUTAN.map((p) => {
          const aktif = !!classId;
          const href = aktif ? `/participant/classes/${encodeURIComponent(classId as string)}${p.hrefSuffix}` : "#";
          return (
            <Link
              key={p.label}
              href={href}
              aria-disabled={!aktif}
              className={`flex items-center gap-4 rounded-xl border border-hairline px-4 py-4 transition ${
                aktif ? "hover:bg-violet-50 hover:border-violet-200" : "pointer-events-none opacity-50"
              }`}
            >
              <span className="shrink-0 w-11 h-11 rounded-xl bg-violet-50 border border-violet-200 text-brand-purple flex items-center justify-center">
                {p.ikon}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-[15px] font-medium text-ink">{p.label}</span>
                <span className="block text-sm text-ink-muted mt-0.5">{p.desc}</span>
              </span>
              <ArrowRight className="w-4 h-4 text-ink-faint shrink-0" aria-hidden="true" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}