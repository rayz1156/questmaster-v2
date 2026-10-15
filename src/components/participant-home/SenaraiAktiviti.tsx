"use client";

/**
 * Bahagian "My Activities" papan pemuka peserta (KZ-018).
 *
 * Tab "Active" / "Ended" berdasarkan status dan end_at aktiviti
 * (keputusan reka bentuk tiket: status "siap" tidak boleh ditentukan
 * dengan pasti kerana rekod siap milik pasukan dan tiada rekod bagi
 * kelas mod individu), maka tiada bar kemajuan dipaparkan.
 */

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, CalendarDays } from "lucide-react";

/** Satu kad aktiviti yang sudah siap dikira di halaman. */
export type BarisAktiviti = {
  id: string;
  tajuk: string;
  kelasNama: string;
  tarikh: string;
  href: string;
};

// Putaran tiga kecerunan jalur penutup ikut indeks (violet-indigo, cyan-biru, amber-merah jambu).
const GRADEN = [
  "from-violet-500 to-indigo-500",
  "from-cyan-500 to-blue-500",
  "from-amber-500 to-pink-500",
];

function Kad({ a, indeks }: { a: BarisAktiviti; indeks: number }) {
  return (
    <div className="card rounded-xl overflow-hidden flex flex-col">
      {/* Jalur penutup 90px dengan cip nama kelas. */}
      <div className={`h-[90px] bg-gradient-to-r ${GRADEN[indeks % GRADEN.length]} p-3 flex items-start`}>
        <span className="inline-flex items-center bg-white/25 text-white rounded-full px-3 py-1 text-xs font-medium max-w-full">
          <span className="truncate">{a.kelasNama || "Class"}</span>
        </span>
      </div>
      <div className="p-4 flex flex-col grow">
        <div className="text-[15px] font-medium text-ink line-clamp-2">{a.tajuk}</div>
        {a.tarikh && (
          <div className="mt-2 flex items-center gap-1.5 text-xs text-ink-muted">
            <CalendarDays className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{a.tarikh}</span>
          </div>
        )}
        <Link
          href={a.href}
          className="mt-3 inline-flex items-center justify-center gap-1.5 min-h-[44px] rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
        >
          Continue
          <ArrowRight className="w-4 h-4" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}

export default function SenaraiAktiviti({
  aktif,
  tamat,
  sedia,
}: {
  aktif: BarisAktiviti[];
  tamat: BarisAktiviti[];
  sedia: boolean;
}) {
  const [tab, setTab] = useState<"aktif" | "tamat">("aktif");
  const senarai = tab === "aktif" ? aktif : tamat;

  if (sedia && aktif.length === 0 && tamat.length === 0) {
    return (
      <div>
        <div className="section-title mb-3">My Activities</div>
        <p className="text-sm text-ink-muted py-6">No activities yet for this class.</p>
      </div>
    );
  }

  const tabDef: { nama: "aktif" | "tamat"; label: string; kira: number }[] = [
    { nama: "aktif", label: "Active", kira: aktif.length },
    { nama: "tamat", label: "Ended", kira: tamat.length },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="section-title">My Activities</div>
        {/* Tab boleh capai papan kekunci: butang biasa dengan aria-selected. */}
        <div role="tablist" aria-label="Activities" className="inline-flex rounded-xl border border-hairline bg-[#F7F7FA] p-1">
          {tabDef.map((t) => (
            <button
              key={t.nama}
              type="button"
              role="tab"
              aria-selected={tab === t.nama}
              onClick={() => setTab(t.nama)}
              className={`min-h-[36px] px-4 py-1.5 rounded-lg text-sm font-medium transition ${
                tab === t.nama ? "bg-white text-brand-purple shadow-sm" : "text-ink-muted hover:text-ink"
              }`}
            >
              {t.label} ({t.kira})
            </button>
          ))}
        </div>
      </div>

      {senarai.length === 0 ? (
        <p className="text-sm text-ink-muted py-6">
          {tab === "aktif" ? "No active activities right now." : "No ended activities yet."}
        </p>
      ) : (
        <div
          role="tabpanel"
          aria-label={tab === "aktif" ? "Active activities" : "Ended activities"}
          className="mt-4 grid gap-4"
          style={{ gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))" }}
        >
          {senarai.map((a, i) => (
            <Kad key={a.id} a={a} indeks={i} />
          ))}
        </div>
      )}
    </div>
  );
}