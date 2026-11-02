"use client";
/**
 * /lna/[roundId]: halaman jawapan LNA pelajar (KZ-035), telefon dahulu.
 *
 * Perlu log masuk: tanpa sesi, balik ke /login?next=/lna/<roundId>.
 * Notis tetap sebelum menjawab: "Guru anda akan nampak jawapan anda."
 * Bagi setiap item (Outcome atau bebas, KZ-038) dua baris butang 1
 * hingga 5: kepentingan ("Sepenting mana untuk saya") dan keyakinan
 * ("Seyakin mana saya sekarang"). Jawapan boleh dikemas kini selagi
 * pusingan dibuka; kunci item ialah itemId (id qm_lna_items).
 */
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useBahasa } from "@/lib/i18n/BahasaProvider";

interface ItemRound {
  // KZ-038: kunci item ialah itemId (id qm_lna_items).
  itemId: string;
  position: number;
  label: string;
}

interface MaklumatRound {
  id: string;
  kind: "pre" | "post";
  status: "open" | "closed";
  title: string;
}

interface JawapanSendiri {
  itemId: string;
  importance: number;
  currentLevel: number;
}

interface Nilai {
  importance: number | null;
  currentLevel: number | null;
}

export default function HalamanJawabLna() {
  const { t } = useBahasa();
  const params = useParams<{ roundId: string }>();
  const roundId = String(params.roundId || "");
  const router = useRouter();

  const [keadaan, setKeadaan] = useState<"muat" | "sedia" | "ralat">("muat");
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [maklumat, setMaklumat] = useState<MaklumatRound | null>(null);
  const [items, setItems] = useState<ItemRound[]>([]);
  const [nilai, setNilai] = useState<Record<string, Nilai>>({});
  const [busy, setBusy] = useState(false);

  const pengepala = async (): Promise<Record<string, string>> => {
    const ses = await supabase.auth.getSession();
    return ses.data.session
      ? { Authorization: `Bearer ${ses.data.session.access_token}` }
      : {};
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Perlu log masuk sebelum apa-apa dibaca.
      const { data } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!data.user) {
        router.replace("/login?next=" + encodeURIComponent(`/lna/${roundId}`));
        return;
      }
      try {
        const h = await pengepala();
        const r = await fetch(`/api/lna/rounds/${roundId}`, { headers: h });
        const j = await r.json().catch(() => ({}) as Record<string, unknown>);
        if (cancelled) return;
        if (!r.ok) {
          setErr(String(j?.error ?? t("lna.roundNotReadable")));
          setKeadaan("ralat");
          return;
        }
        const round = (j?.round ?? null) as MaklumatRound | null;
        const itemsUi = (j?.items ?? []) as ItemRound[];
        const mine = (j?.myResponses ?? []) as JawapanSendiri[];
        setMaklumat(round);
        setItems(itemsUi);
        const mulai: Record<string, Nilai> = {};
        for (const it of itemsUi) {
          mulai[it.itemId] = { importance: null, currentLevel: null };
        }
        for (const m of mine) {
          mulai[m.itemId] = { importance: m.importance, currentLevel: m.currentLevel };
        }
        setNilai(mulai);
        setKeadaan("sedia");
      } catch {
        if (!cancelled) {
          setErr(t("lna.roundNotReadable"));
          setKeadaan("ralat");
        }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundId]);

  const lengkap = items.length > 0 && items.every((it) => {
    const n = nilai[it.itemId];
    return n && n.importance != null && n.currentLevel != null;
  });

  const hantar = async () => {
    setErr("");
    setOk("");
    if (!lengkap || maklumat?.status !== "open") return;
    setBusy(true);
    try {
      const h = await pengepala();
      const r = await fetch(`/api/lna/rounds/${roundId}/respond`, {
        method: "POST",
        headers: { "content-type": "application/json", ...h },
        body: JSON.stringify({
          answers: items.map((it) => ({
            itemId: it.itemId,
            importance: nilai[it.itemId]!.importance,
            currentLevel: nilai[it.itemId]!.currentLevel,
          })),
        }),
      });
      const j = await r.json().catch(() => ({}) as Record<string, unknown>);
      if (!r.ok) {
        setErr(String(j?.error ?? t("lna.answersNotSubmitted")));
        return;
      }
      setOk(t("lna.answersSubmitted"));
    } catch {
      setErr(t("lna.answersNotSubmitted"));
    } finally {
      setBusy(false);
    }
  };

  const BarisButang = ({
    itemId,
    medan,
    label,
  }: {
    itemId: string;
    medan: "importance" | "currentLevel";
    label: string;
  }) => {
    const semasa = (nilai[itemId] ?? {} as Nilai)[medan] ?? null;
    return (
      <div>
        <p className="text-[13px] text-ink-muted mb-1.5">{label}</p>
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((v) => {
            const dipilih = semasa === v;
            return (
              <button
                key={v}
                type="button"
                disabled={maklumat?.status !== "open" || busy}
                onClick={() =>
                  setNilai((n) => ({
                    ...n,
                    [itemId]: { ...n[itemId], [medan]: v } as Nilai,
                  }))
                }
                className={`h-11 flex-1 rounded-lg text-[15px] font-bold transition ${
                  dipilih
                    ? "text-white bg-gradient-to-r from-violet-600 to-indigo-600"
                    : "bg-white border border-hairline text-ink-muted"
                } disabled:opacity-60`}
              >
                {v}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-canvas">
      <div className="max-w-md mx-auto px-4 py-8 space-y-4">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-wide text-violet-700">
            {t("lna.eyebrow")}
          </p>
          <h1 className="text-[20px] font-bold text-ink mt-0.5">
            {maklumat?.title ?? t("lna.titleFallback")}
          </h1>
          {maklumat ? (
            <p className="text-[13px] text-ink-faint mt-0.5">
              {maklumat.kind === "pre" ? t("lna.roundPre") : t("lna.roundPost")}
            </p>
          ) : null}
        </div>

        {/* Notis tetap: jawapan ini bukan tanpa nama. */}
        <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 text-sm text-violet-800">
          {t("lna.notice")}
        </div>

        {keadaan === "muat" ? (
          <p className="text-sm text-ink-muted">{t("common.loading")}</p>
        ) : null}

        {err ? (
          <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-sm text-rose-700">
            {err}
          </div>
        ) : null}

        {ok ? (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-sm text-emerald-700">
            {ok}
          </div>
        ) : null}

        {maklumat?.status === "closed" ? (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
            {t("lna.roundClosed")}
          </div>
        ) : null}

        {keadaan === "sedia" && items.length === 0 ? (
          <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 text-sm text-violet-800">
            {t("lna.noItems")}
          </div>
        ) : null}

        {items.map((it, idx) => (
          <div key={it.itemId} className="card space-y-3">
            <p className="text-[15px] font-semibold text-ink">
              {idx + 1}. {it.label}
            </p>
            <BarisButang
              itemId={it.itemId}
              medan="importance"
              label={t("lna.importance")}
            />
            <BarisButang
              itemId={it.itemId}
              medan="currentLevel"
              label={t("lna.confidence")}
            />
          </div>
        ))}

        {maklumat?.status === "open" && items.length > 0 ? (
          <button
            type="button"
            disabled={!lengkap || busy}
            onClick={() => void hantar()}
            className="w-full py-2.5 rounded-xl text-white text-sm font-medium bg-gradient-to-r from-violet-600 to-indigo-600 hover:opacity-95 disabled:opacity-50"
          >
            {busy ? t("lna.submitting") : t("lna.submitAnswers")}
          </button>
        ) : null}
      </div>
    </div>
  );
}
