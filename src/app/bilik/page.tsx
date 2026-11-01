"use client";
/**
 * /bilik: masuk Bilik AI dengan kod 6 aksara (KZ-033).
 *
 * Halaman ini umum (tiada Shell): log masuk disemak oleh API semasa
 * membaca bilik. Kod mesti 6 aksara daripada abjad bilik
 * ABCDEFGHJKLMNPQRSTUVWXYZ23456789 (tiada 0, O, 1, I).
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bot } from "lucide-react";

const REGEX_KOD = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;

export default function MasukBilik() {
  const router = useRouter();
  const [kod, setKod] = useState("");
  const [ralat, setRalat] = useState("");
  const bersih = kod.trim().toUpperCase();

  const masuk = (e: React.FormEvent) => {
    e.preventDefault();
    if (!REGEX_KOD.test(bersih)) {
      setRalat("Kod bilik mesti 6 aksara; tiada 0, O, 1 atau I.");
      return;
    }
    router.push(`/bilik/${bersih}`);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#f5f6fa]">
      <div className="w-full max-w-sm">
        <div className="bg-violet-50 border border-violet-200 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-5">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white">
              <Bot className="w-5 h-5" />
            </span>
            <div>
              <h1 className="text-[18px] font-bold text-ink">Bilik AI</h1>
              <p className="text-[13px] text-ink-faint">Masukkan kod bilik 6 aksara.</p>
            </div>
          </div>
          <form onSubmit={masuk} className="grid gap-3">
            <input
              value={kod}
              onChange={(e) => {
                setKod(e.target.value.toUpperCase());
                setRalat("");
              }}
              placeholder="ABC234"
              autoFocus
              maxLength={12}
              inputMode="text"
              autoComplete="off"
              spellCheck={false}
              aria-label="Kod bilik"
              className="w-full h-11 rounded-xl border border-violet-200 bg-white px-4 text-center text-[18px] font-bold tracking-[0.35em] uppercase outline-none focus:border-violet-500"
            />
            {ralat ? <p className="text-[13px] text-red-600">{ralat}</p> : null}
            <button
              type="submit"
              disabled={!REGEX_KOD.test(bersih)}
              className="w-full py-2.5 rounded-xl text-white text-sm font-medium bg-gradient-to-r from-violet-600 to-indigo-600 hover:opacity-95 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Masuk bilik
            </button>
          </form>
          <p className="text-[12px] text-ink-faint mt-3">
            Anda perlu log masuk dan menjadi ahli kelas bilik ini untuk masuk.
          </p>
        </div>
      </div>
    </div>
  );
}