"use client";

/**
 * Sepanduk penilaian rakan untuk halaman peserta.
 * Muncul bila ada pusingan terbuka yang pelajar belum hantar, dan hilang
 * selepas dihantar. Rujukan: docs/SPEC-penilaian-rakan.md, bahagian UI pelajar.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { ClipboardList, ChevronRight } from "lucide-react";
import { pusinganTerbukaBelumHantar, type PusinganTerbuka } from "@/lib/peer-client";

export default function PeerReviewBanner() {
  const [pusingan, setPusingan] = useState<PusinganTerbuka | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setPusingan(await pusinganTerbukaBelumHantar());
      } catch {
        // Tiada sepanduk bila pertanyaan gagal; jangan ganggu halaman.
      }
    })();
  }, []);

  if (!pusingan) return null;
  const tutup = (() => {
    try {
      return new Date(pusingan.closes_at).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      });
    } catch {
      return "";
    }
  })();

  return (
    <Link
      href={`/participant/peer-review/${pusingan.round_id}`}
      className="mt-6 flex items-center gap-3 rounded-xl border border-violet-200 bg-violet-50 p-4 text-sm text-gray-900 transition hover:border-violet-400"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-100">
        <ClipboardList className="h-5 w-5 text-violet-600" />
      </div>
      <span className="min-w-0 flex-1">
        <span className="font-semibold">Peer review is open: {pusingan.name}.</span>{" "}
        <span className="text-gray-600">Rate your teammates confidentially before {tutup}.</span>
      </span>
      <span className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-2 text-xs font-medium text-white">
        Open form <ChevronRight className="h-3.5 w-3.5" />
      </span>
    </Link>
  );
}