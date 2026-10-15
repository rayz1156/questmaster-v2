"use client";

/**
 * Banner profil papan pemuka peserta (KZ-018, gaya HiStudy).
 *
 * Kecerunan violet-indigo, bulatan hiasan lutsinar di kanan atas,
 * avatar inisial, cip maklumat dan dua butang tindakan. Tiada bar XP:
 * tahap/XP/lencana tidak wujud dalam skema dan tidak akan direka.
 */

import Link from "next/link";
import { Zap, KeyRound } from "lucide-react";
import { inisial } from "@/lib/papanPemukaPeserta";

type Cip = { teks: string };

export default function BannerProfil({
  nama,
  kelihatan,
  cip,
  pemilihKelas,
  onBukaSertai,
}: {
  /** Nama paparan pengguna. */
  nama: string;
  /** Log untuk binaan sisi pelayan: komponen ini hanya dipaparkan selepas data tiba. */
  kelihatan?: boolean;
  /** Cip lutsinar: nama kelas aktif, nama pasukan, bilangan kelas aktif. */
  cip: Cip[];
  /** Slot pemilih kelas (dituntut halaman apabila ada lebih satu kelas). */
  pemilihKelas?: React.ReactNode;
  /** Buka borang sertai kelas sedia ada di kaki halaman. */
  onBukaSertai: () => void;
}) {
  if (kelihatan === false) return null;

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-violet-700 to-indigo-600 text-white p-6 sm:p-7">
      {/* Bulatan hiasan lutsinar di kanan atas; hiasan sahaja, tiada fungsi. */}
      <div aria-hidden="true" className="pointer-events-none absolute -top-12 -right-10 w-44 h-44 rounded-full bg-white/10" />
      <div aria-hidden="true" className="pointer-events-none absolute top-20 right-24 w-20 h-20 rounded-full bg-white/10" />

      <div className="relative flex flex-wrap items-center gap-5">
        {/* Avatar 80 hingga 96px: latar putih, teks violet, inisial nama. */}
        <div className="w-20 h-20 sm:w-24 sm:h-24 shrink-0 rounded-full bg-white text-violet-700 flex items-center justify-center text-2xl sm:text-3xl font-bold select-none">
          {inisial(nama)}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm text-white/80">Welcome back,</p>
          <h1 className="text-2xl sm:text-3xl font-bold truncate">{nama || "Participant"}</h1>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {cip.map((c) => (
              <span key={c.teks} className="inline-flex items-center bg-white/15 rounded-full px-3 py-1 text-sm">
                {c.teks}
              </span>
            ))}
          </div>
        </div>

        {/* Sentuh minimum 44px pada butang tindakan. */}
        <div className="flex flex-wrap gap-2.5">
          {/* Laluan sedia ada: /live ialah halaman input kod sesi kuiz langsung. */}
          <Link
            href="/live"
            className="inline-flex items-center gap-2 min-h-[44px] rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-violet-700 hover:bg-violet-50"
          >
            <Zap className="w-4 h-4" aria-hidden="true" />
            Join live quiz
          </Link>
          <button
            type="button"
            onClick={onBukaSertai}
            className="inline-flex items-center gap-2 min-h-[44px] rounded-xl border border-white/70 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/10"
          >
            <KeyRound className="w-4 h-4" aria-hidden="true" />
            Enter class code
          </button>
        </div>
      </div>

      {/* Pemilih kelas diletakkan tepat di bawah banner apabila ada lebih satu kelas. */}
      {pemilihKelas && <div className="relative mt-4">{pemilihKelas}</div>}
    </div>
  );
}