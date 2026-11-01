"use client";
/**
 * /lna/[roundId]: halaman jawapan LNA pelajar (KZ-035), telefon dahulu.
 *
 * Perlu log masuk: tanpa sesi, balik ke /login?next=/lna/<roundId>.
 * Notis tetap sebelum menjawab: "Guru anda akan nampak jawapan anda."
 * Bagi setiap item (Outcome) dua baris butang 1 hingga 5: kepentingan
 * ("Sepenting mana untuk saya") dan keyakinan ("Seyakin mana saya
 * sekarang"). Jawapan boleh dikemas kini selagi pusingan dibuka.
 */
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

interface ItemRound {
  outcomeId: string;
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
  outcomeId: string;
  importance: number;
  currentLevel: number;
}

interface Nilai {
  importance: number | null;
  currentLevel: number | null;
}

const NOTIS = "Guru anda akan nampak jawapan anda.";

export default function HalamanJawabLna() {
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
          setErr(String(j?.error ?? "Pusingan tidak dapat dibaca."));
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
          mulai[it.outcomeId] = { importance: null, currentLevel: null };
        }
        for (const m of mine) {
          mulai[m.outcomeId] = { importance: m.importance, currentLevel: m.currentLevel };
        }
        setNilai(mulai);
        setKeadaan("sedia");
      } catch {
        if (!cancelled) {
          setErr("Pusingan tidak dapat dibaca.");
          setKeadaan("ralat");
        }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundId]);

  const lengkap = items.length > 0 && items.every((it) => {
    const n = nilai[it.outcomeId];
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
            outcomeId: it.outcomeId,
            importance: nilai[it.outcomeId]!.importance,
            currentLevel: nilai[it.outcomeId]!.currentLevel,
          })),
        }),
      });
      const j = await r.json().catch(() => ({}) as Record<string, unknown>);
      if (!r.ok) {
        setErr(String(j?.error ?? "Jawapan tidak dapat dihantar."));
        return;
      }
      setOk("Jawapan dihantar. Anda boleh mengubahnya selagi pusingan dibuka.");
    } catch {
      setErr("Jawapan tidak dapat dihantar.");
    } finally {
      setBusy(false);
    }
  };

  const BarisButang = ({
    outcomeId,
    medan,
    label,
  }: {
    outcomeId: string;
    medan: "importance" | "currentLevel";
    label: string;
  }) => {
    const semasa = (nilai[outcomeId] ?? {} as Nilai)[medan] ?? null;
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
                    [outcomeId]: { ...n[outcomeId], [medan]: v } as Nilai,
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
            Learning Needs Analysis
          </p>
          <h1 className="text-[20px] font-bold text-ink mt-0.5">
            {maklumat?.title ?? "Analisis Keperluan Pembelajaran"}
          </h1>
          {maklumat ? (
            <p className="text-[13px] text-ink-faint mt-0.5">
              Pusingan {maklumat.kind === "pre" ? "PRA" : "PASCA"}
            </p>
          ) : null}
        </div>

        {/* Notis tetap: jawapan ini bukan tanpa nama. */}
        <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 text-sm text-violet-800">
          {NOTIS}
        </div>

        {keadaan === "muat" ? (
          <p className="text-sm text-ink-muted">Memuat…</p>
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
            Pusingan ini sudah ditutup. Jawapan tidak lagi boleh diubah.
          </div>
        ) : null}

        {keadaan === "sedia" && items.length === 0 ? (
          <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 text-sm text-violet-800">
            LNA ini belum ada item. Hubungi guru anda.
          </div>
        ) : null}

        {items.map((it, idx) => (
          <div key={it.outcomeId} className="card space-y-3">
            <p className="text-[15px] font-semibold text-ink">
              {idx + 1}. {it.label}
            </p>
            <BarisButang
              outcomeId={it.outcomeId}
              medan="importance"
              label="Sepenting mana untuk saya"
            />
            <BarisButang
              outcomeId={it.outcomeId}
              medan="currentLevel"
              label="Seyakin mana saya sekarang"
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
            {busy ? "Menghantar…" : "Hantar jawapan"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
