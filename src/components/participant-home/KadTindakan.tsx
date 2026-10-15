"use client";

/**
 * Kad tindakan utama papan pemuka peserta (KZ-018b), persis pratonton
 * Versi 2. Dua keadaan:
 *
 * - LIVE: kad gelap #1e1b3a dengan cahaya radial ungu, pil merah
 *   "LIVE NOW" dengan titik putih, tajuk sesi, butang putih besar
 *   "Join now" (ikon kilat) ke /live/{code}. Sesi lain dipapar sebagai
 *   pautan kecil "Also live: ..." di bawah butang.
 * - TIADA LIVE: kecerunan #6d28d9 -> #4f46e5, label "NEXT UP FOR YOU",
 *   aktiviti aktif dengan end_at terdekat, butang "Continue".
 * - Tiada live dan tiada aktiviti aktif: "You're all caught up".
 *
 * Semua nilai gaya adalah Tailwind arbitrari yang SAMA dengan
 * style="..." pratonton (lihat KZ-018b-nota.md untuk petikan baris).
 */

import Link from "next/link";
import { Zap } from "lucide-react";
import { ayatKadLive } from "@/lib/papanPemukaPeserta";
import { fonTajuk } from "./fon";

/** Satu sesi langsung daripada /api/participant/live-now. */
export type SesiLive = {
  code: string;
  title: string | null;
  class_id: string | null;
  class_name: string | null;
  status: string;
  player_count: number;
  started_at: string | null;
};

/** Aktiviti NEXT UP, sudah dipilih oleh pilihAktivitiSeterusnya. */
export type AktivitiSeterusnya = {
  id: string;
  title: string;
  kelasNama: string;
  labelTarikh: string;
};

export default function KadTindakan({
  sesi, // sesi boleh masuk, semua kelas ahli
  aktiviti, // aktiviti aktif terdekat, atau null
  adaPasukan, // peserta ada pasukan dalam kelas sesi langsung
}: {
  sesi: SesiLive[];
  aktiviti: AktivitiSeterusnya | null;
  adaPasukan: boolean;
}) {
  if (sesi.length > 0) {
    // Keadaan LIVE: yang terbaru jadi wira, yang lain pautan kecil.
    const utama = sesi[0];
    const lain = sesi.slice(1);
    return (
      <section
        aria-label="Next action"
        className="relative min-w-0 flex-[999_1_520px] overflow-hidden rounded-[20px] bg-[#1e1b3a] p-[28px] text-white flex flex-col gap-[14px]"
      >
        {/* Cahaya radial ungu kanan bawah (pratonton l.52). */}
        <div
          aria-hidden="true"
          className="absolute -bottom-[90px] -right-[70px] h-[280px] w-[280px] rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(124,58,237,0.55), rgba(124,58,237,0) 70%)",
          }}
        />
        <span className="relative inline-flex items-center gap-2 self-start rounded-full bg-[#dc2626] px-3 py-[5px] text-xs font-bold tracking-[0.06em]">
          <span className="h-2 w-2 rounded-full bg-white" />
          LIVE NOW
        </span>
        <h1 className={`relative m-0 text-[34px] font-extrabold leading-[1.1] ${fonTajuk}`}>
          {utama.title || "Live Quiz"}
        </h1>
        <p className="relative m-0 text-[15px] text-[#d6d3ea]">
          {ayatKadLive(utama.class_name || "", utama.player_count, adaPasukan)}
        </p>
        <Link
          href={`/live/${encodeURIComponent(utama.code)}`}
          className="relative inline-flex min-h-[52px] items-center self-start gap-2.5 rounded-[14px] bg-white px-[26px] text-base font-extrabold text-[#1e1b3a] no-underline"
        >
          <Zap className="h-5 w-5" aria-hidden="true" strokeWidth={2.4} />
          Join now
        </Link>
        {lain.length > 0 && (
          <div className="relative flex flex-col gap-1 text-[13px] text-[#d6d3ea]">
            {lain.map((s) => (
              <Link
                key={s.code}
                href={`/live/${encodeURIComponent(s.code)}`}
                className="text-[#c4b5fd] underline-offset-2 hover:underline"
              >
                Also live: {s.title || "Live Quiz"} · {s.code}
              </Link>
            ))}
          </div>
        )}
      </section>
    );
  }

  // Keadaan tanpa LIVE: kecerunan ungu.
  return (
    <section
      aria-label="Next action"
      className="min-w-0 flex-[999_1_520px] rounded-[20px] text-white flex flex-col gap-[14px] p-[28px]"
      style={{ background: "linear-gradient(120deg, #6d28d9, #4f46e5)" }}
    >
      <span className="text-[13px] font-bold tracking-[0.06em] opacity-85">
        NEXT UP FOR YOU
      </span>
      {aktiviti ? (
        <>
          <h1 className={`m-0 text-[34px] font-extrabold leading-[1.1] ${fonTajuk}`}>
            {aktiviti.title}
          </h1>
          <p className="m-0 text-[15px] text-[#e4e0fb]">
            {aktiviti.labelTarikh
              ? `${aktiviti.kelasNama} · ${aktiviti.labelTarikh}`
              : aktiviti.kelasNama}
          </p>
          <Link
            href={`/participant/activities?hunt=${encodeURIComponent(aktiviti.id)}`}
            className="inline-flex min-h-[52px] items-center self-start rounded-[14px] bg-white px-[26px] text-base font-extrabold text-[#4c1d95] no-underline"
          >
            Continue
          </Link>
        </>
      ) : (
        <>
          <h1 className={`m-0 text-[34px] font-extrabold leading-[1.1] ${fonTajuk}`}>
            {"You're all caught up"}
          </h1>
          <p className="m-0 text-[15px] text-[#e4e0fb]">
            No active activities right now. Check back after your next class.
          </p>
        </>
      )}
    </section>
  );
}
