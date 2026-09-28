"use client";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

/**
 * Notis had pelan (tiket V2-002b): mesej had dengan butang "Upgrade" ke
 * /#harga. Dipaparkan di tempat mesejHad ditunjukkan kepada pendidik.
 */
export default function HadPelanNotis({ mesej }: { mesej: string }) {
  return (
    <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 flex items-start gap-3">
      <div className="flex-1 text-sm text-ink">{mesej}</div>
      <Link
        href="/#harga"
        className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 px-3 py-1.5 text-xs font-semibold text-white"
      >
        Upgrade <ArrowUpRight className="w-3.5 h-3.5" />
      </Link>
    </div>
  );
}
