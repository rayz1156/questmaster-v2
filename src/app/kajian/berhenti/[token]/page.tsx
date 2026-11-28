"use client";

/**
 * KZ-UTT Fasa 4: halaman awam berhenti langganan e-mel kajian dan tarik
 * diri: /kajian/berhenti/[token]. Tanpa log masuk; token datang daripada
 * e-mel susulan. Akses kelas peserta tidak disentuh.
 */
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useBahasa } from "@/lib/i18n/BahasaProvider";

type Keadaan = { quiz: string; unsubscribed: boolean; withdrawn: boolean };

export default function HalamanBerhentiKajian() {
  const { t } = useBahasa();
  const { token } = useParams<{ token: string }>() as { token: string };
  const [k, setK] = useState<Keadaan | null>(null);
  const [tidakSah, setTidakSah] = useState(false);
  const [sibuk, setSibuk] = useState(false);
  const [ralat, setRalat] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch(`/api/research/unsubscribe?token=${encodeURIComponent(token)}`, { cache: "no-store" });
      if (!res.ok) {
        setTidakSah(true);
        return;
      }
      setK((await res.json()) as Keadaan);
    })();
  }, [token]);

  const hantar = async (tarikDiri: boolean) => {
    setSibuk(true);
    setRalat(null);
    try {
      const res = await fetch("/api/research/unsubscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, withdraw: tarikDiri }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : t("solo.loadFailed"));
      setK((lama) => (lama ? { ...lama, unsubscribed: true, withdrawn: lama.withdrawn || tarikDiri } : lama));
    } catch (e) {
      setRalat(e instanceof Error ? e.message : t("solo.loadFailed"));
    } finally {
      setSibuk(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl bg-white border border-slate-200 p-5 shadow-sm space-y-3">
        <h1 className="text-[20px] font-bold text-ink">{t("solo.unsubTitle")}</h1>
        {tidakSah ? (
          <p className="text-[13px] text-ink-faint">{t("solo.unsubInvalid")}</p>
        ) : !k ? (
          <p className="text-[13px] text-ink-faint">{t("solo.loading")}</p>
        ) : (
          <>
            <p className="text-[13px] text-ink">{t("solo.unsubIntro", { q: k.quiz })}</p>
            {k.withdrawn ? (
              <p className="text-[13px] font-semibold text-emerald-700">{t("solo.unsubWithdrawn")}</p>
            ) : k.unsubscribed ? (
              <p className="text-[13px] font-semibold text-emerald-700">{t("solo.unsubDone")}</p>
            ) : (
              <button
                type="button"
                disabled={sibuk}
                onClick={() => void hantar(false)}
                className="w-full px-4 py-2.5 rounded-xl text-white text-[14px] font-semibold bg-gradient-to-r from-violet-600 to-indigo-600 disabled:opacity-50"
              >
                {t("solo.unsubButton")}
              </button>
            )}
            {!k.withdrawn && (
              <div className="rounded-xl bg-violet-50 border border-violet-200 p-4 space-y-2">
                <p className="text-[12px] text-ink">{t("solo.unsubWithdrawNote")}</p>
                <button
                  type="button"
                  disabled={sibuk}
                  onClick={() => void hantar(true)}
                  className="w-full px-4 py-2 rounded-xl text-[13px] font-semibold text-red-700 border border-red-200 bg-white disabled:opacity-50"
                >
                  {t("solo.unsubWithdraw")}
                </button>
              </div>
            )}
            {ralat && <p className="text-[12px] text-red-700">{ralat}</p>}
          </>
        )}
      </div>
    </div>
  );
}
