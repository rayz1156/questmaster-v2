"use client";

/**
 * Halaman awam pengesahan nama penuh: /nama/[token] (KZ-E).
 *
 * Tanpa log masuk dan tanpa Shell aplikasi. Peserta membuka pautan daripada
 * e-mel, mengisi nama penuh seperti dalam kad pengenalan, melihat pratonton
 * rupa nama pada sijil (layout templat), menanda kotak pengesahan dan
 * menghantar. Pengesahan input sebenar di pelayan; semakan di sini untuk
 * maklum balas segera sahaja. Tidak dipengaruhi bendera ui_hide_certificates.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";

type Pratonton = {
  background_url: string | null;
  name: { x: number; y: number; maxWidth: number; size: number; color: string; align?: "center" | "left"; weight?: string } | null;
};
type Maklumat = {
  status: "pending" | "used" | "expired" | "revoked" | "not_found";
  message?: string;
  course?: string;
  date?: string | null;
  location?: string | null;
  current_name?: string;
  purpose?: "after_issue" | "before_issue";
  expires_at?: string;
  preview?: Pratonton;
};

// Lebar halaman A4 landskap dalam point, sama dengan janaPdf.ts.
const A4_W = 841.89;
const A4_H = 595.28;

function semakSegera(nama: string): string | null {
  const n = nama.replace(/\s+/g, " ").trim();
  if (n.length < 5) return "Nama terlalu pendek.";
  if (/[0-9_]/.test(n)) return "Nama tidak boleh mengandungi nombor atau garis bawah.";
  if (n.split(" ").length < 2) return "Tulis nama penuh sekurang-kurangnya dua perkataan.";
  return null;
}

function NamaPadaSijil({ nama, p }: { nama: string; p: Pratonton }) {
  const kotak = useRef<HTMLDivElement | null>(null);
  const [lebar, setLebar] = useState(0);
  const [nisbah, setNisbah] = useState(A4_H / A4_W);

  useEffect(() => {
    const el = kotak.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setLebar(el.clientWidth));
    ro.observe(el);
    setLebar(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const n = p.name ?? { x: 0.5, y: 0.48, maxWidth: 0.6, size: 40, color: "#0F2340", align: "center" as const };
  const teks = nama.replace(/\s+/g, " ").trim() || " ";
  // Saiz fon dalam piksel: skala point A4 kepada lebar kotak, dikecilkan
  // supaya nama muat maxWidth (seperti janaPdf, minimum 12pt).
  const saizPx = useMemo(() => {
    if (!lebar) return 0;
    const skala = lebar / A4_W;
    let pt = n.size;
    if (typeof document !== "undefined") {
      const c = document.createElement("canvas").getContext("2d");
      if (c) {
        const ukur = (s: number) => {
          c.font = `bold ${s * skala}px Helvetica, Arial, sans-serif`;
          return c.measureText(teks).width;
        };
        while (pt > 12 && ukur(pt) > n.maxWidth * lebar) pt -= 1;
      }
    }
    return pt * skala;
  }, [lebar, n.size, n.maxWidth, teks]);

  return (
    <div
      ref={kotak}
      className="relative w-full rounded-lg overflow-hidden border border-slate-200 bg-white shadow-sm"
      style={{ paddingTop: `${nisbah * 100}%` }}
    >
      {p.background_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={p.background_url}
          alt="Pratonton sijil"
          className="absolute inset-0 w-full h-full object-cover"
          onLoad={(e) => {
            const i = e.currentTarget;
            if (i.naturalWidth && i.naturalHeight) setNisbah(i.naturalHeight / i.naturalWidth);
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-violet-50 to-indigo-50" />
      )}
      <div
        className="absolute whitespace-nowrap font-bold"
        style={{
          left: `${n.x * 100}%`,
          top: `${n.y * 100}%`,
          transform: `translate(${n.align === "left" ? "0" : "-50%"}, -80%)`,
          fontSize: saizPx ? `${saizPx}px` : undefined,
          color: n.color,
          fontFamily: "Helvetica, Arial, sans-serif",
          lineHeight: 1,
        }}
      >
        {teks}
      </div>
    </div>
  );
}

export default function HalamanNama() {
  const params = useParams<{ token: string }>();
  const token = String(params?.token ?? "");
  const [m, setM] = useState<Maklumat | null>(null);
  const [nama, setNama] = useState("");
  const [setuju, setSetuju] = useState(false);
  const [sibuk, setSibuk] = useState(false);
  const [ralat, setRalat] = useState<string | null>(null);
  const [siap, setSiap] = useState<string | null>(null);

  useEffect(() => {
    let hidup = true;
    fetch(`/api/nama/${encodeURIComponent(token)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: Maklumat) => {
        if (!hidup) return;
        setM(j);
        if (j.current_name) setNama(j.current_name);
      })
      .catch(() => hidup && setM({ status: "not_found", message: "Halaman tidak dapat dimuatkan. Sila cuba lagi." }));
    return () => { hidup = false; };
  }, [token]);

  const amaran = nama ? semakSegera(nama) : null;

  const hantar = async () => {
    setRalat(null);
    setSibuk(true);
    try {
      const r = await fetch(`/api/nama/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ full_name: nama, confirmed: setuju }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok) {
        setSiap(j.message ?? "Terima kasih. Sijil dengan nama penuh anda akan dihantar ke e-mel anda dalam beberapa minit.");
      } else if (j.status && j.status !== "pending") {
        setM({ status: j.status, message: j.error });
      } else {
        setRalat(
          (j.error ?? "Nama tidak dapat disimpan.") +
            (typeof j.attempts_left === "number" ? ` (Baki cubaan: ${j.attempts_left})` : ""),
        );
      }
    } catch {
      setRalat("Sambungan gagal. Sila cuba lagi.");
    } finally {
      setSibuk(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 flex items-start sm:items-center justify-center p-4 sm:p-8">
      <div className="w-full max-w-2xl bg-white border border-slate-200 rounded-2xl shadow-sm p-5 sm:p-8">
        <p className="text-xs font-semibold tracking-wide text-violet-600 uppercase mb-1">Kuizen</p>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 mb-4">Sahkan nama penuh untuk sijil</h1>

        {!m && <p className="text-sm text-slate-500">Memuatkan...</p>}

        {m && m.status !== "pending" && !siap && (
          <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 text-sm text-slate-700">{m.message}</div>
        )}

        {siap && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-sm text-emerald-800">{siap}</div>
        )}

        {m && m.status === "pending" && !siap && (
          <div className="space-y-5">
            <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
              <div className="sm:col-span-3">
                <dt className="text-slate-500">Kursus</dt>
                <dd className="font-medium text-slate-900">{m.course}</dd>
              </div>
              {m.date && (
                <div>
                  <dt className="text-slate-500">Tarikh</dt>
                  <dd className="font-medium text-slate-900">{m.date}</dd>
                </div>
              )}
              {m.location && (
                <div className="sm:col-span-2">
                  <dt className="text-slate-500">Tempat</dt>
                  <dd className="font-medium text-slate-900">{m.location}</dd>
                </div>
              )}
              <div className="sm:col-span-3">
                <dt className="text-slate-500">Nama pada sijil sekarang</dt>
                <dd className="font-medium text-slate-900">{m.current_name || "-"}</dd>
              </div>
            </dl>

            <div>
              <label htmlFor="nama" className="block text-sm font-medium text-slate-800 mb-1">
                Nama penuh seperti dalam kad pengenalan
              </label>
              <input
                id="nama"
                type="text"
                value={nama}
                maxLength={120}
                autoComplete="name"
                onChange={(e) => setNama(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-violet-400"
              />
              <p className="text-xs text-slate-500 mt-1">
                Contoh: Norfarahin binti Amat @ Adnin. Jangan gunakan nama panggilan atau gelaran seperti &quot;Bro&quot; atau &quot;Puan&quot;.
              </p>
              {amaran && <p className="text-xs text-amber-700 mt-1">{amaran}</p>}
            </div>

            {m.preview && (
              <div>
                <p className="text-sm font-medium text-slate-800 mb-2">Pratonton nama pada sijil</p>
                <NamaPadaSijil nama={nama} p={m.preview} />
              </div>
            )}

            <label className="flex items-start gap-3 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={setuju}
                onChange={(e) => setSetuju(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-violet-600"
              />
              <span>Saya mengesahkan nama ini betul dan akan dicetak pada sijil saya.</span>
            </label>

            {ralat && <div className="text-sm rounded-lg bg-rose-50 border border-rose-200 text-rose-700 px-3 py-2">{ralat}</div>}

            <button
              type="button"
              disabled={!setuju || sibuk || !!amaran || !nama.trim()}
              onClick={hantar}
              className="w-full sm:w-auto rounded-xl px-5 py-3 text-sm font-semibold text-white bg-gradient-to-r from-violet-600 to-indigo-600 disabled:opacity-50"
            >
              {sibuk ? "Menghantar..." : "Sahkan dan hantar sijil baharu"}
            </button>

            {m.expires_at && (
              <p className="text-xs text-slate-400">
                Pautan sah sehingga {new Date(m.expires_at).toLocaleDateString("ms-MY", { day: "numeric", month: "long", year: "numeric" })}.
              </p>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
