"use client";

/**
 * Borang minat pelan (tiket V2-006). Satu baris dimasukkan ke qm_feedback
 * dengan type 'plan_interest' melalui /api/naik-taraf. Belum log masuk:
 * ke /login?next=/naik-taraf?pelan=... (dikodkan). Halaman ini dalam
 * Bahasa Inggeris seperti bahagian aplikasi lain.
 */
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { HARGA_PELAN } from "@/lib/pelan";
import { formatRM } from "@/lib/kadHarga";

type PelanMinat = "pro" | "institution";
type Bil = "tahunan" | "bulanan";

export default function BorangNaikTaraf() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pelan: PelanMinat = searchParams.get("pelan") === "institution" ? "institution" : "pro";

  const [bil, setBil] = useState<Bil>("tahunan");
  const [institutionName, setInstitutionName] = useState("");
  const [educatorCount, setEducatorCount] = useState("10");
  const [message, setMessage] = useState("");
  const [hantar, setHantar] = useState(false);
  const [berjaya, setBerjaya] = useState(false);
  const [ralat, setRalat] = useState<string | null>(null);
  const [semakSesi, setSemakSesi] = useState(true);

  // Semak sesi localStorage (storageKey 'qm-auth'). Belum log masuk: ke
  // /login dengan next dienkod; halaman login sahkan next bermula '/'.
  useEffect(() => {
    let batal = false;
    supabase.auth.getSession().then(({ data }) => {
      if (batal) return;
      if (!data.session) {
        router.replace(
          `/login?next=${encodeURIComponent(`/naik-taraf?pelan=${pelan}`)}`,
        );
        return;
      }
      setSemakSesi(false);
    });
    return () => {
      batal = true;
    };
  }, [pelan, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setHantar(true);
    setRalat(null);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        router.replace(
          `/login?next=${encodeURIComponent(`/naik-taraf?pelan=${pelan}`)}`,
        );
        return;
      }
      const res = await fetch("/api/naik-taraf", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          pelan,
          bil: pelan === "pro" ? bil : undefined,
          institutionName: pelan === "institution" ? institutionName : undefined,
          educatorCount: pelan === "institution" ? Number(educatorCount) || undefined : undefined,
          message,
          page_url: window.location.href,
        }),
      });
      const j = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setRalat(j?.error || "Could not save your request.");
        return;
      }
      setBerjaya(true);
    } catch {
      setRalat("Could not save your request.");
    } finally {
      setHantar(false);
    }
  }

  if (semakSesi) {
    return (
      <div className="mx-auto w-full max-w-[560px] px-6 py-24 text-center text-sm text-ink-muted">
        Loading...
      </div>
    );
  }

  if (berjaya) {
    return (
      <div className="mx-auto w-full max-w-[560px] px-6 py-24">
        <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 text-center">
          <p className="text-[16px] font-medium text-ink">
            Thank you. We will contact you by email.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[560px] px-6 py-16">
      <h1 className="text-[28px] font-semibold tracking-tight text-ink">
        {pelan === "pro" ? "Upgrade to Pro" : "Institution plan"}
      </h1>
      <p className="mt-2 text-[15px] text-ink-muted">
        Tell us what you need and we will get back to you by email.
      </p>

      <form onSubmit={submit} className="mt-8 space-y-5">
        {pelan === "pro" ? (
          <div>
            <label className="block text-[13px] font-medium text-ink mb-1.5">Billing</label>
            <div className="inline-flex rounded-xl border border-hairline p-0.5 text-sm">
              {(["tahunan", "bulanan"] as Bil[]).map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => setBil(b)}
                  aria-pressed={bil === b}
                  className={`rounded-lg px-4 py-1.5 font-medium transition ${
                    bil === b ? "bg-brand-purple text-white" : "text-ink-muted hover:text-ink"
                  }`}
                >
                  {b === "tahunan"
                    ? `Yearly (${formatRM(HARGA_PELAN.pro.tahunanSebulan)} / month)`
                    : `Monthly (${formatRM(HARGA_PELAN.pro.bulanan)} / month)`}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            <div>
              <label htmlFor="institution-name" className="block text-[13px] font-medium text-ink mb-1.5">
                Institution name
              </label>
              <input
                id="institution-name"
                className="input w-full"
                value={institutionName}
                onChange={(e) => setInstitutionName(e.target.value)}
                maxLength={200}
              />
            </div>
            <div>
              <label htmlFor="educator-count" className="block text-[13px] font-medium text-ink mb-1.5">
                Number of educators
              </label>
              <input
                id="educator-count"
                type="number"
                min={1}
                className="input w-full"
                value={educatorCount}
                onChange={(e) => setEducatorCount(e.target.value)}
              />
            </div>
          </>
        )}

        <div>
          <label htmlFor="naik-taraf-message" className="block text-[13px] font-medium text-ink mb-1.5">
            Message (optional)
          </label>
          <textarea
            id="naik-taraf-message"
            className="input w-full min-h-[96px]"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={2000}
          />
        </div>

        {ralat ? (
          <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 text-[14px] text-ink">
            {ralat}
          </div>
        ) : null}

        <button type="submit" disabled={hantar} className="btn-primary w-full">
          {hantar ? "Sending..." : "Send request"}
        </button>
      </form>
    </div>
  );
}
