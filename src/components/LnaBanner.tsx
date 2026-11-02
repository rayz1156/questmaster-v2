"use client";

/**
 * Sepanduk LNA untuk halaman peserta (KZ-035).
 * Muncul bila ada pusingan LNA terbuka dalam kelas yang pelajar sertai dan
 * pelajar belum menjawabnya; hilang selepas dijawab. Hanya memanggil API
 * sedia ada: GET /api/classes/[id]/lna (pelajar hanya nampak LNA terbuka)
 * dan GET /api/lna/rounds/[roundId] (jawapan sendiri).
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { ClipboardList, ChevronRight } from "lucide-react";
import { supabase } from "@/lib/supabase";

interface LnaTerbuka {
  roundId: string;
  title: string;
}

interface RoundSenarai {
  id: string;
  status: string;
}

interface LnaSenarai {
  title: string;
  rounds?: RoundSenarai[];
}

async function cariLnaBelumDijawab(classIds: string[]): Promise<LnaTerbuka | null> {
  const ses = await supabase.auth.getSession();
  const token = ses.data.session?.access_token;
  if (!token) return null;
  const h = { Authorization: `Bearer ${token}` };

  for (const classId of classIds) {
    const r = await fetch(`/api/classes/${classId}/lna`, { headers: h });
    if (!r.ok) continue;
    const j = await r.json().catch(() => null);
    if (j?.role !== "student") continue;
    for (const lna of (j?.lna ?? []) as LnaSenarai[]) {
      const terbuka = (lna.rounds ?? []).find((x) => x.status === "open");
      if (!terbuka) continue;
      const rr = await fetch(`/api/lna/rounds/${terbuka.id}`, { headers: h });
      if (!rr.ok) continue;
      const jr = await rr.json().catch(() => null);
      if (Array.isArray(jr?.myResponses) && jr.myResponses.length > 0) continue;
      return { roundId: terbuka.id, title: String(lna.title ?? "") };
    }
  }
  return null;
}

export default function LnaBanner({ classIds }: { classIds: string[] }) {
  const [lna, setLna] = useState<LnaTerbuka | null>(null);
  const kunci = classIds.join(",");

  useEffect(() => {
    let cancelled = false;
    if (!kunci) return;
    (async () => {
      try {
        const hasil = await cariLnaBelumDijawab(kunci.split(","));
        if (!cancelled) setLna(hasil);
      } catch {
        // Tiada sepanduk bila pertanyaan gagal; jangan ganggu halaman.
      }
    })();
    return () => { cancelled = true; };
  }, [kunci]);

  if (!lna) return null;

  return (
    <Link
      href={`/lna/${lna.roundId}`}
      className="mt-6 flex items-center gap-3 rounded-xl border border-violet-200 bg-violet-50 p-4 text-sm text-gray-900 transition hover:border-violet-400"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-100">
        <ClipboardList className="h-5 w-5 text-violet-600" />
      </div>
      <span className="min-w-0 flex-1">
        <span className="font-semibold">LNA dibuka: {lna.title}.</span>{" "}
        <span className="text-gray-600">Nilai kepentingan dan keyakinan anda supaya guru tahu apa yang perlu diajar.</span>
      </span>
      <span className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-2 text-xs font-medium text-white">
        Jawab <ChevronRight className="h-3.5 w-3.5" />
      </span>
    </Link>
  );
}
