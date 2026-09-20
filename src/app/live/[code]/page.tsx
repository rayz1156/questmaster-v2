"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Trophy, Users, Timer, Check, X } from "lucide-react";

interface Pilihan { key: string; text: string }
interface SoalanPemain { id: string; prompt: string; options: Pilihan[] }
interface Keadaan {
  fp: string;
  status: string;
  questionIndex: number;
  totalQuestions: number;
  serverNow: string;
  questionStartedAt: string | null;
  timeLimitSec: number | null;
  question: SoalanPemain | null;
  myAnswer: { choiceKey: string; locked: boolean } | null;
  reveal: {
    correctKey: string | null;
    myChoice: string | null;
    isCorrect: boolean;
    pointsAwarded: number;
    rank: number;
    score: number;
  } | null;
}
interface BarisPapan { rank: number; nickname: string; score: number }

interface Identiti {
  playerId: string;
  playerToken: string;
  nickname: string;
}

export default function SkrinMainLangsung() {
  const { code } = useParams<{ code: string }>() as { code: string };
  const kod = String(code || "").toUpperCase();
  const router = useRouter();

  const [identiti, setIdentiti] = useState<Identiti | null>(null);
  const [dimuat, setDimuat] = useState(false);
  const [nama, setNama] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [keadaan, setKeadaan] = useState<Keadaan | null>(null);
  const [papan, setPapan] = useState<BarisPapan[] | null>(null);
  const [berbaki, setBerbaki] = useState<number | null>(null);

  const fpRef = useRef<string>("");
  const identitiRef = useRef<Identiti | null>(null);
  const sorokRef = useRef<number>(0); // beza jam pelayar dengan pelayan (ms)

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("kuizen-live-" + kod);
      if (raw) {
        const id = JSON.parse(raw) as Identiti;
        if (id && id.playerId && id.playerToken) {
          identitiRef.current = id;
          setIdentiti(id);
        }
      }
    } catch { /* storan tidak tersedia */ }
    setDimuat(true);
  }, [kod]);

  // Kira masa berbaki soalan semasa.
  useEffect(() => {
    const kira = () => {
      const k = keadaan;
      if (!k || k.status !== "asking" || !k.questionStartedAt || !k.timeLimitSec) {
        setBerbaki(null);
        return;
      }
      const mula = new Date(k.questionStartedAt).getTime();
      const tamat = mula + k.timeLimitSec * 1000;
      const sekarang = Date.now() - sorokRef.current;
      setBerbaki(Math.max(0, Math.ceil((tamat - sekarang) / 1000)));
    };
    kira();
    const t = setInterval(kira, 250);
    return () => clearInterval(t);
  }, [keadaan]);

  // Tinjauan papan pendahulu bila soalan ditutup atau sesi tamat.
  useEffect(() => {
    const perluPapan = keadaan && (keadaan.status === "revealed" || keadaan.status === "ended");
    if (!perluPapan) { setPapan(null); return; }
    let hidup = true;
    const muat = async () => {
      try {
        const r = await fetch(`/api/live/play/${kod}/leaderboard`);
        const j = await r.json();
        if (hidup && r.ok) setPapan(j.leaderboard || []);
      } catch { /* abaikan */ }
    };
    muat();
    const t = setInterval(muat, 2000);
    return () => { hidup = false; clearInterval(t); };
  }, [keadaan?.status, kod]);

  // Tinjauan keadaan setiap 2 saat; hantar fp terakhir diterima.
  useEffect(() => {
    if (!identiti) return;
    let hidup = true;
    const tinjau = async () => {
      const id = identitiRef.current;
      if (!id || !hidup) return;
      try {
        const url = `/api/live/play/${kod}/state?playerId=${encodeURIComponent(id.playerId)}&fp=${encodeURIComponent(fpRef.current)}`;
        const r = await fetch(url);
        const j = await r.json();
        if (!hidup) return;
        if (!r.ok) {
          setErr(j.error || "Gagal mendapatkan keadaan sesi.");
          return;
        }
        setErr(null);
        if (j.noChange) return;
        fpRef.current = j.fp || "";
        if (j.serverNow) sorokRef.current = Date.now() - new Date(j.serverNow).getTime();
        setKeadaan(j as Keadaan);
      } catch { /* cuba lagi pada kitaran seterusnya */ }
    };
    tinjau();
    const t = setInterval(tinjau, 2000);
    return () => { hidup = false; clearInterval(t); };
  }, [identiti, kod]);

  const onSertai = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    const bersih = nama.trim();
    if (bersih.length < 1 || bersih.length > 24) {
      setErr("Nama pemain mesti antara 1 hingga 24 aksara.");
      return;
    }
    setBusy(true);
    try {
      const r = await fetch(`/api/live/play/${kod}/join`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nickname: bersih }),
      });
      const j = await r.json();
      if (!r.ok) { setErr(j.error || "Gagal menyertai sesi."); return; }
      const id: Identiti = { playerId: j.playerId, playerToken: j.playerToken, nickname: bersih };
      window.localStorage.setItem("kuizen-live-" + kod, JSON.stringify(id));
      identitiRef.current = id;
      setIdentiti(id);
    } catch {
      setErr("Gagal menyertai sesi. Cuba lagi.");
    } finally {
      setBusy(false);
    }
  };

  const onJawab = async (kunci: string) => {
    const id = identitiRef.current;
    if (!id || !keadaan || keadaan.status !== "asking" || !keadaan.question) return;
    if (keadaan.myAnswer) return; // sudah dikunci
    setBusy(true);
    try {
      const r = await fetch(`/api/live/play/${kod}/answer`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          playerId: id.playerId,
          playerToken: id.playerToken,
          questionId: keadaan.question.id,
          choiceKey: kunci,
        }),
      });
      const j = await r.json();
      if (!r.ok) { setErr(j.error || "Jawapan tidak diterima."); return; }
      setErr(null);
      fpRef.current = ""; // paksa tinjauan penuh supaya jawapan terkunci dipapar
    } catch {
      setErr("Gagal menghantar jawapan. Cuba lagi.");
    } finally {
      setBusy(false);
    }
  };

  const keluar = () => {
    try { window.localStorage.removeItem("kuizen-live-" + kod); } catch { /* abaikan */ }
    router.push("/live");
  };

  if (!dimuat) return null;

  if (!identiti) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="card w-full max-w-sm">
          <h1 className="text-xl font-bold text-center mb-1">Masuk Sesi {kod}</h1>
          <p className="text-sm text-gray-500 text-center mb-4">Pilih nama pemain anda.</p>
          <form onSubmit={onSertai}>
            <input
              className="input w-full mb-3"
              placeholder="Nama pemain"
              maxLength={24}
              value={nama}
              onChange={(e) => setNama(e.target.value)}
              autoFocus
            />
            {err && <div className="text-xs text-red-600 mb-2">{err}</div>}
            <button type="submit" disabled={busy} className="btn-primary w-full py-2">
              {busy ? "Menyertai…" : "Sertai"}
            </button>
          </form>
          <div className="text-center mt-3">
            <Link href="/live" className="text-xs text-gray-500 hover:text-gray-800">← Kembali</Link>
          </div>
        </div>
      </div>
    );
  }

  if (!keadaan) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="card w-full max-w-md text-center">
          <p className="text-sm text-gray-500 mb-1">Sedang menyambung ke sesi {kod}…</p>
          {err && <p className="text-xs text-red-600">{err}</p>}
        </div>
      </div>
    );
  }

  const k = keadaan;
  const pendahuluSaya = papan?.find((b) => b.nickname === identiti.nickname);

  if (k.status === "ended") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="card w-full max-w-md text-center">
          <Trophy className="w-10 h-10 mx-auto text-amber-500 mb-2" />
          <h1 className="text-xl font-bold mb-1">Sesi Tamat</h1>
          <p className="text-sm text-gray-500 mb-4">Terima kasih kerana bermain!</p>
          <div className="text-3xl font-bold text-brand-purple mb-1">{k.reveal?.score ?? pendahuluSaya?.score ?? 0}</div>
          <div className="text-xs text-gray-500 mb-4">jumlah mata</div>
          {papan && (
            <div className="text-left border-t border-gray-100 pt-3">
              <div className="text-xs font-semibold text-gray-500 mb-2">Papan pendahulu</div>
              <ol className="text-sm space-y-1">
                {papan.slice(0, 10).map((b) => (
                  <li key={b.rank} className={`flex items-center justify-between ${b.nickname === identiti.nickname ? "font-semibold text-brand-purple" : ""}`}>
                    <span>{b.rank}. {b.nickname}</span>
                    <span>{b.score}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
          <button onClick={keluar} className="btn-primary w-full py-2 mt-4">Keluar</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {k.status === "lobby" && (
          <div className="card text-center">
            <Users className="w-8 h-8 mx-auto text-indigo-600 mb-2" />
            <h1 className="text-xl font-bold mb-1">Lobi</h1>
            <p className="text-sm text-gray-500 mb-3">Menunggu pendidik memulakan kuiz…</p>
            <div className="text-xs text-gray-400">Kod sesi: <span className="font-mono font-bold text-brand-purple">{kod}</span></div>
          </div>
        )}

        {k.status === "asking" && k.question && (
          <div className="card">
            <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
              <span>Soalan {k.questionIndex + 1} / {k.totalQuestions}</span>
              <span className="flex items-center gap-1 font-semibold text-gray-700">
                <Timer className="w-4 h-4" /> {berbaki !== null ? `${berbaki}s` : "—"}
              </span>
            </div>
            <div className="font-semibold mb-3">{k.question.prompt}</div>
            <div className="grid grid-cols-1 gap-2">
              {k.question.options.map((o) => {
                const terkunci = !!k.myAnswer;
                const dipilih = k.myAnswer?.choiceKey === o.key;
                return (
                  <button
                    key={o.key}
                    onClick={() => onJawab(o.key)}
                    disabled={terkunci || busy || berbaki === 0}
                    className={`rounded-lg border px-3 py-2 text-left text-sm transition
                      ${dipilih ? "border-brand-purple bg-purple-50 font-semibold" : "border-gray-200 hover:border-brand-purple hover:bg-purple-50"}
                      ${terkunci && !dipilih ? "opacity-50" : ""}`}
                  >
                    <span className="font-mono mr-1">{o.key}.</span> {o.text}
                    {dipilih && <span className="float-right text-xs">Jawapan dihantar ✓</span>}
                  </button>
                );
              })}
            </div>
            {err && <div className="text-xs text-red-600 mt-2">{err}</div>}
          </div>
        )}

        {k.status === "revealed" && k.question && (
          <div className="card">
            <div className="text-xs text-gray-500 mb-2">Soalan {k.questionIndex + 1} / {k.totalQuestions}</div>
            <div className={`text-center mb-3 ${k.reveal?.isCorrect ? "text-green-600" : "text-red-600"}`}>
              {k.reveal?.myChoice ? (
                <>
                  {k.reveal.isCorrect ? <Check className="w-8 h-8 mx-auto" /> : <X className="w-8 h-8 mx-auto" />}
                  <div className="font-bold">
                    {k.reveal.isCorrect ? `Betul! +${k.reveal.pointsAwarded} mata` : "Salah"}
                  </div>
                </>
              ) : (
                <div className="font-bold text-gray-500">Tiada jawapan dihantar</div>
              )}
            </div>
            <div className="space-y-1 mb-3">
              {k.question.options.map((o) => {
                const betul = o.key === k.reveal?.correctKey;
                const pilihanSaya = o.key === k.reveal?.myChoice;
                return (
                  <div
                    key={o.key}
                    className={`rounded-lg border px-3 py-2 text-sm ${betul ? "border-green-500 bg-green-50 font-semibold text-green-800" : pilihanSaya ? "border-red-300 bg-red-50" : "border-gray-200"}`}
                  >
                    <span className="font-mono mr-1">{o.key}.</span> {o.text}
                    {pilihanSaya && !betul && <span className="text-xs float-right">pilihan anda</span>}
                    {betul && <span className="text-xs float-right">jawapan betul</span>}
                  </div>
                );
              })}
            </div>
            <div className="text-center text-sm text-gray-600 border-t border-gray-100 pt-2">
              Kedudukan <strong>#{k.reveal?.rank ?? "—"}</strong> · Mata keseluruhan <strong>{k.reveal?.score ?? 0}</strong>
            </div>
          </div>
        )}

        {papan && k.status !== "lobby" && (
          <div className="card mt-4">
            <div className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1"><Trophy className="w-4 h-4 text-amber-500" /> Papan pendahulu</div>
            <ol className="text-sm space-y-1">
              {papan.slice(0, 5).map((b) => (
                <li key={b.rank} className={`flex items-center justify-between ${b.nickname === identiti.nickname ? "font-semibold text-brand-purple" : ""}`}>
                  <span>{b.rank}. {b.nickname}</span>
                  <span>{b.score}</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        <div className="text-center mt-4">
          <button onClick={keluar} className="text-xs text-gray-400 hover:text-gray-700">Keluar daripada sesi</button>
        </div>
      </div>
    </div>
  );
}
