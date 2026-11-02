"use client";
/**
 * LnaPanel (KZ-035): ringkasan LNA terkini satu kelas dalam
 * /educator/analytics. 5 outcome keutamaan tertinggi (MWDS), bilangan
 * bendera "yakin tetapi lemah", peningkatan pra/pasca jika ada, dan
 * pautan ke laporan penuh. Keadaan kosong: satu tindakan jelas
 * "Cipta LNA untuk kelas ini".
 */
import { useEffect, useState } from "react";
import { ClipboardList } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import type { LaporanLna, PerbandinganLna } from "@/lib/lna";

interface LnaRingkas {
  id: string;
  title: string;
  rounds: { id: string; kind: string; status: string }[];
}

interface LaporanPenuh {
  pra: LaporanLna | null;
  pasca: LaporanLna | null;
  perbandingan: PerbandinganLna | null;
}

export default function LnaPanel({ classId }: { classId: string | null }) {
  const [senarai, setSenarai] = useState<LnaRingkas[]>([]);
  const [laporan, setLaporan] = useState<LaporanPenuh | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!classId || classId === "all") {
      setSenarai([]);
      setLaporan(null);
      return;
    }
    (async () => {
      try {
        setError(null);
        setLoading(true);
        const { data: { session } } = await supabase.auth.getSession();
        const headers: Record<string, string> = {};
        if (session?.access_token) headers["Authorization"] = `Bearer ${session.access_token}`;
        const res = await fetch(`/api/classes/${encodeURIComponent(classId)}/lna`, { headers });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
        const senaraiLna = (j?.lna ?? []) as LnaRingkas[];
        if (cancelled) return;
        setSenarai(senaraiLna);
        setLaporan(null);
        // LNA terkini = yang paling akhir dicipta.
        const terkini = senaraiLna[senaraiLna.length - 1];
        if (terkini) {
          const res2 = await fetch(`/api/lna/${terkini.id}/report`, { headers });
          const j2 = await res2.json();
          if (!res2.ok) throw new Error(j2.error || `HTTP ${res2.status}`);
          if (!cancelled) setLaporan(j2 as LaporanPenuh);
        }
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [classId]);

  if (!classId || classId === "all") return null;

  const terkini = senarai[senarai.length - 1] ?? null;
  const laporanAktif = laporan ? (laporan.pra ?? laporan.pasca) : null;

  // 5 keutamaan tertinggi ikut MWDS menurun.
  const keutamaan = (laporanAktif?.outcomes ?? [])
    .filter((o) => o.mwds != null)
    .sort((a, b) => (b.mwds ?? 0) - (a.mwds ?? 0))
    .slice(0, 5);

  const benderaLemah =
    (laporan ? (laporan.pasca ?? laporan.pra) : null)?.bendera.filter(
      (b) => b.bendera === "yakin_tetapi_lemah",
    ).length ?? 0;

  // Peningkatan pra/pasca: purata delta keyakinan dan delta penguasaan.
  let purataDeltaC: number | null = null;
  let purataDeltaMastery: number | null = null;
  if (laporan?.perbandingan) {
    const dC = laporan.perbandingan.outcomes
      .map((d) => d.deltaMeanC)
      .filter((v): v is number => v != null);
    if (dC.length > 0) {
      purataDeltaC =
        Math.round((dC.reduce((a, b) => a + b, 0) / dC.length) * 100) / 100;
    }
    const dM = laporan.perbandingan.outcomes
      .map((d) => d.deltaMastery)
      .filter((v): v is number => v != null);
    if (dM.length > 0) {
      purataDeltaMastery =
        Math.round((dM.reduce((a, b) => a + b, 0) / dM.length) * 100) / 100;
    }
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center justify-between gap-3 p-4 border-b border-gray-100">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
          <ClipboardList className="w-4 h-4 text-indigo-500" />
          Learning Needs Analysis (LNA)
        </div>
        {terkini ? (
          <a
            href={`/educator/classes/${classId}/lna`}
            className="text-[13px] text-indigo-600 hover:underline"
          >
            View full report
          </a>
        ) : null}
      </div>

      <div className="p-4">
        {loading ? <p className="text-sm text-gray-500">Loading…</p> : null}
        {error ? <p className="text-sm text-rose-600">{error}</p> : null}

        {!loading && !error && !terkini ? (
          <div className="text-center py-6">
            <p className="text-[14px] text-gray-500 mb-3">
              Belum ada LNA untuk kelas ini.
            </p>
            <a
              href={`/educator/classes/${classId}/lna`}
              className="inline-flex items-center gap-1.5 text-sm font-semibold rounded-lg px-4 py-2 text-white bg-gradient-to-r from-violet-600 to-indigo-600"
            >
              Cipta LNA untuk kelas ini
            </a>
          </div>
        ) : null}

        {terkini ? (
          <>
            <p className="text-[13px] text-gray-500 mb-3">
              {terkini.title}
            </p>

            {keutamaan.length === 0 ? (
              <p className="text-[13px] text-gray-500">
                Belum ada jawapan pelajar untuk LNA ini.
              </p>
            ) : (
              <ol className="space-y-1.5">
                {keutamaan.map((o, i) => (
                  <li key={o.itemId} className="flex items-start gap-2 text-[13px] text-gray-800">
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-purple-100 text-purple-700 text-[11px] font-bold shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    <span>
                      {o.label}
                      <span className="text-gray-400"> · MWDS {o.mwds}</span>
                    </span>
                  </li>
                ))}
              </ol>
            )}

            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[13px]">
              <span className="text-gray-600">
                Yakin tetapi lemah:{" "}
                <span className="font-semibold text-rose-600">{benderaLemah ?? 0}</span>
              </span>
              {purataDeltaC != null ? (
                <span className="text-gray-600">
                  Delta keyakinan pra/pasca:{" "}
                  <span className="font-semibold text-indigo-600">
                    {purataDeltaC > 0 ? "+" : ""}
                    {purataDeltaC}
                  </span>
                </span>
              ) : null}
              {purataDeltaMastery != null ? (
                <span className="text-gray-600">
                  Delta penguasaan pra/pasca:{" "}
                  <span className="font-semibold text-indigo-600">
                    {purataDeltaMastery > 0 ? "+" : ""}
                    {purataDeltaMastery}
                  </span>
                </span>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
