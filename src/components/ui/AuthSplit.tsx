import type { ReactNode } from "react";
import Link from "next/link";
import Logo from "@/components/Logo";

/**
 * Rangka halaman auth (KZ-021, KZ-DS-v3 bahagian 2: AuthSplit).
 *
 * Kiri putih 45%: logo atas, tajuk, borang, pautan, kaki kecil terma.
 * Kanan latar #f5f6fa: ilustrasi Kuizen sendiri (kad kuiz bertindan,
 * palet ungu, SVG tulis tangan; BUKAN imej demo) + "Kuizen" + satu
 * ayat keterangan sedia ada platform. Telefon: kiri sahaja.
 *
 * Halaman (login, register, forgot-password, reset-password,
 * pending-approval) menghantar borang mereka sebagai children; logik
 * borang, Google login, pautan dan teks sedia ada tidak berubah.
 */
export default function AuthSplit({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-white">
      {/* ===== Panel kiri (45%, putih) ===== */}
      <div className="flex min-h-screen w-full flex-col lg:w-[45%]">
        <div className="px-8 pt-7">
          <Logo size={30} />
        </div>
        <div className="flex flex-1 items-center justify-center px-6 py-10">{children}</div>
        <div className="pb-8 text-center text-xs text-ink-faint tracking-wide space-y-2">
          <div>UPSI &nbsp;·&nbsp; AFK &nbsp;·&nbsp; Veltrix</div>
          <div className="space-x-4">
            <Link href="/privacy" className="hover:text-ink-muted">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-ink-muted">
              Terms
            </Link>
          </div>
        </div>
      </div>

      {/* ===== Panel kanan (55%, ilustrasi) ===== */}
      <div className="hidden lg:flex w-[55%] items-center justify-center bg-canvas p-10">
        <div className="max-w-md text-center">
          <IlustrasiKadKuiz />
          <h2 className="mt-8 text-[32px] font-bold tracking-tight text-ink">Kuizen</h2>
          <p className="mt-2 text-[16px] text-ink-muted">
            Your next great class starts here.
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Ilustrasi buatan sendiri: tiga kad kuiz bertindan dalam palet ungu
 * Kuizen (#854fff, #ebe2ff), tiada aset pihak ketiga.
 */
function IlustrasiKadKuiz() {
  return (
    <svg
      viewBox="0 0 320 240"
      className="w-full max-w-[320px] mx-auto"
      role="img"
      aria-label="Stacked quiz cards illustration"
    >
      {/* Kad belakang (kiri, condong) */}
      <g transform="rotate(-8 160 120)">
        <rect x="80" y="60" width="160" height="104" rx="6" fill="#ebe2ff" />
        <rect x="96" y="78" width="80" height="8" rx="4" fill="#d6c3ff" />
        <rect x="96" y="94" width="56" height="8" rx="4" fill="#e0d0ff" />
      </g>
      {/* Kad hadapan (kanan, condong) */}
      <g transform="rotate(6 160 120)">
        <rect x="96" y="72" width="150" height="98" rx="6" fill="#ffffff" stroke="#dbdfea" strokeWidth="1.5" />
        <rect x="112" y="88" width="64" height="8" rx="4" fill="#854fff" />
        <rect x="112" y="104" width="96" height="6" rx="3" fill="#e5e9f2" />
        <rect x="112" y="118" width="80" height="6" rx="3" fill="#e5e9f2" />
        {/* Bulangan jawapan */}
        <circle cx="118" cy="140" r="5" fill="#ebe2ff" stroke="#854fff" strokeWidth="1.5" />
        <rect x="128" y="136" width="52" height="8" rx="4" fill="#e5e9f2" />
        <circle cx="118" cy="156" r="5" fill="#ebe2ff" stroke="#854fff" strokeWidth="1.5" />
        <rect x="128" y="152" width="40" height="8" rx="4" fill="#e5e9f2" />
      </g>
      {/* Titik hiasan */}
      <circle cx="52" cy="52" r="6" fill="#ebe2ff" />
      <circle cx="268" cy="188" r="8" fill="#ebe2ff" />
      <circle cx="276" cy="48" r="4" fill="#d6c3ff" />
    </svg>
  );
}
