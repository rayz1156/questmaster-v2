"use client";

/**
 * Suis Bulanan/Tahunan untuk bahagian harga landing page (tiket V2-006).
 *
 * Bahagian harga ialah server component; hanya suis ini dan paparan harga Pro
 * perlu interaktiviti. Keadaan dikongsi melalui context supaya kad Pro
 * bertindak balas tanpa menjadikan seluruh grid kad sebagai komponen klien.
 * Tahunan ialah lalai, seperti spesifikasi tiket.
 */
import { createContext, useContext, useState, type ReactNode } from "react";

export type Bil = "tahunan" | "bulanan";

const BilContext = createContext<Bil>("tahunan");

export function useBil(): Bil {
  return useContext(BilContext);
}

type LabelSuis = { tahunan: string; bulanan: string };

export default function SuisBil({
  label,
  children,
}: {
  label: LabelSuis;
  children: ReactNode;
}) {
  const [bil, setBil] = useState<Bil>("tahunan");
  const pilihan: Array<{ b: Bil; teks: string }> = [
    { b: "tahunan", teks: label.tahunan },
    { b: "bulanan", teks: label.bulanan },
  ];
  return (
    <BilContext.Provider value={bil}>
      <div className="mt-8 flex justify-center">
        <div
          role="group"
          aria-label={label.tahunan + " / " + label.bulanan}
          className="inline-flex rounded-full border border-hairline p-0.5 text-sm"
        >
          {pilihan.map((p) => (
            <button
              key={p.b}
              type="button"
              onClick={() => setBil(p.b)}
              aria-pressed={bil === p.b}
              className={`rounded-full px-4 py-1.5 font-medium transition ${
                bil === p.b
                  ? "bg-brand-purple text-white"
                  : "text-ink-muted hover:text-ink"
              }`}
            >
              {p.teks}
            </button>
          ))}
        </div>
      </div>
      {children}
    </BilContext.Provider>
  );
}

/**
 * Paparan harga kad Pro yang bertukar mengikut suis. Angka datang siap
 * diformat daripada HARGA_PELAN; komponen ini hanya memilih varian.
 */
export function HargaProBil({
  tahunanSebulan,
  bulanan,
  dibilkan,
  sebulan,
}: {
  tahunanSebulan: string;
  bulanan: string;
  dibilkan: string;
  sebulan: string;
}) {
  const bil = useBil();
  if (bil === "tahunan") {
    return (
      <div>
        <p className="text-[34px] leading-none font-semibold tracking-tight text-ink">
          {tahunanSebulan}{" "}
          <span className="text-[15px] font-normal text-ink-muted">{sebulan}</span>
        </p>
        <p className="mt-2 text-[13px] text-ink-faint">{dibilkan}</p>
      </div>
    );
  }
  return (
    <div>
      <p className="text-[34px] leading-none font-semibold tracking-tight text-ink">
        {bulanan}{" "}
        <span className="text-[15px] font-normal text-ink-muted">{sebulan}</span>
      </p>
    </div>
  );
}
