"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Trophy, Users, Timer, Check, X } from "lucide-react";
import LiveLeaderboard from "@/components/LiveLeaderboard";

interface Pilihan { key: string; text: string }
// Soalan dalam cache klien (daripada laluan /questions — tiada correct_key).
interface SoalanPemain { id: string; prompt: string; options: Pilihan[] }
interface CacheSoalan { version: string; questions: SoalanPemain[] }
interface Keadaan {
  fp: string;
  status: string;
  questionIndex: number;
  totalQuestions: number;
  serverNow: string;
  questionStartedAt: string | null;
  timeLimitSec: number | null;
  useCountdown?: boolean;
  questionId: string | null;
  version: string | null;
  myAnswer: { choiceKey: string; locked: boolean } | null;
  reveal: {
    correctKey: string | null;
    myChoice: string | null;
    isCorrect: boolean;
    pointsAwarded: number;
    streakBonus?: number;
    streak?: number;
    rank: number;
    score: number;
  } | null;
}
interface BarisPapan { rank: number; nickname: string; score: number; streak?: number }

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

  // Cache soalan klien (Bahagian 2.4): dimuat turun sekali, disimpan dalam
  // localStorage di bawah kuizen-live-q-<kod>. Tinjauan state hanya
  // memulangkan questionId + version; jika version berbeza, muat semula.
  const [soalan, setSoalan] = useState<CacheSoalan | null>(null);
  const soalanRef = useRef<CacheSoalan | null>(null);
  const versRef = useRef<string>("");

  const muatSoalan = useCallback(async () => {
    const id = identitiRef.current;
    if (!id) return;
    try {
      const r = await fetch(`/api/live/play/${kod}/questions?playerId=${encodeURIComponent(id.playerId)}`);
      if (!r.ok) return;
      const j = await r.json();
      if (!j || !j.version) return;
      const c: CacheSoalan = { version: String(j.version), questions: (j.questions || []) as SoalanPemain[] };
      soalanRef.current = c;
      versRef.current = c.version;
      setSoalan(c);
      try { window.localStorage.setItem("kuizen-live-q-" + kod, JSON.stringify(c)); } catch { /* storan tidak tersedia */ }
    } catch { /* cuba lagi pada kitaran seterusnya */ }
  }, [kod]);

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
      // Pulihkan cache soalan yang disimpan sebelum ini (jika ada).
      const rawQ = window.localStorage.getItem("kuizen-live-q-" + kod);
      if (rawQ) {
        const c = JSON.parse(rawQ) as CacheSoalan;
        if (c && c.version && Array.isArray(c.questions)) {
          soalanRef.current = c;
          versRef.current = c.version;
          setSoalan(c);
        }
      }
    } catch { /* storan tidak tersedia */ }
    setDimuat(true);
  }, [kod]);

  // Panggil laluan questions sekali semasa menyertai (atau memulihkan
  // identiti). Klien kemudian hanya memanggilnya semula bila `version`
  // daripada state berbeza.
  useEffect(() => {
    if (identiti) muatSoalan();
  }, [identiti, muatSoalan]);

  // Kira masa berbaki soalan semasa.
  useEffect(() => {
    const kira = () => {
      const k = keadaan;
      if (!k || k.status !== "asking" || !k.questionStartedAt || !k.timeLimitSec
          || k.useCountdown === false) {
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
          setErr(j.error || "Could not read the session state.");
          return;
        }
        setErr(null);
        if (j.noChange) return;
        fpRef.current = j.fp || "";
        if (j.serverNow) sorokRef.current = Date.now() - new Date(j.serverNow).getTime();
        setKeadaan(j as Keadaan);
        // Version berbeza bermakna guru menyunting soalan atau menekan set
        // semula — muat semula cache soalan.
        if (j.version && j.version !== versRef.current) muatSoalan();
      } catch { /* cuba lagi pada kitaran seterusnya */ }
    };
    tinjau();
    const t = setInterval(tinjau, 2000);
    return () => { hidup = false; clearInterval(t); };
  }, [identiti, kod, muatSoalan]);

  const onSertai = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    const bersih = nama.trim();
    if (bersih.length < 1 || bersih.length > 24) {
      setErr("Your player name must be 1 to 24 characters.");
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
      if (!r.ok) { setErr(j.error || "Could not join the session."); return; }
      const id: Identiti = { playerId: j.playerId, playerToken: j.playerToken, nickname: bersih };
      window.localStorage.setItem("kuizen-live-" + kod, JSON.stringify(id));
      identitiRef.current = id;
      setIdentiti(id);
    } catch {
      setErr("Could not join the session. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const onJawab = async (kunci: string) => {
    const id = identitiRef.current;
    if (!id || !keadaan || keadaan.status !== "asking" || !keadaan.questionId) return;
    if (keadaan.myAnswer) return; // sudah dikunci
    setBusy(true);
    try {
      const r = await fetch(`/api/live/play/${kod}/answer`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          playerId: id.playerId,
          playerToken: id.playerToken,
          questionId: keadaan.questionId,
          choiceKey: kunci,
        }),
      });
      const j = await r.json();
      if (!r.ok) { setErr(j.error || "Your answer was not accepted."); return; }
      setErr(null);
      fpRef.current = ""; // paksa tinjauan penuh supaya jawapan terkunci dipapar
    } catch {
      setErr("Could not send your answer. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const keluar = () => {
    try {
      window.localStorage.removeItem("kuizen-live-" + kod);
      window.localStorage.removeItem("kuizen-live-q-" + kod);
    } catch { /* abaikan */ }
    router.push("/live");
  };

  if (!dimuat) return null;

  if (!identiti) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="card w-full max-w-sm">
          <h1 className="text-xl font-bold text-center mb-1">Join Session {kod}</h1>
          <p className="text-sm text-gray-500 text-center mb-4">Choose your player name.</p>
          <form onSubmit={onSertai}>
            <input
              className="input w-full mb-3"
              placeholder="Player name"
              maxLength={24}
              value={nama}
              onChange={(e) => setNama(e.target.value)}
              autoFocus
            />
            {err && <div className="text-xs text-red-600 mb-2">{err}</div>}
            <button type="submit" disabled={busy} className="btn-primary w-full py-2">
              {busy ? "Joining…" : "Join"}
            </button>
          </form>
          <div className="text-center mt-3">
            <Link href="/live" className="text-xs text-gray-500 hover:text-gray-800">← Back</Link>
          </div>
        </div>
      </div>
    );
  }

  if (!keadaan) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="card w-full max-w-md text-center">
          <p className="text-sm text-gray-500 mb-1">Connecting to session {kod}…</p>
          {err && <p className="text-xs text-red-600">{err}</p>}
        </div>
      </div>
    );
  }

  const k = keadaan;
  // Render soalan daripada cache klien, bukan daripada balasan state.
  const soalanSemasa =
    soalan && k.questionId
      ? soalan.questions.find((q) => q.id === k.questionId) ?? null
      : null;
  const pendahuluSaya = papan?.find((b) => b.nickname === identiti.nickname);

  if (k.status === "ended") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-start justify-center p-4">
        <div className="w-full max-w-md space-y-4 py-6">
          <div className="card text-center">
            <Trophy className="w-10 h-10 mx-auto text-amber-500 mb-2" />
            <h1 className="text-xl font-bold mb-1">Session Over</h1>
            <p className="text-sm text-gray-500 mb-4">Thanks for playing!</p>
            <div className="text-3xl font-bold text-brand-purple mb-1">{k.reveal?.score ?? pendahuluSaya?.score ?? 0}</div>
            <div className="text-xs text-gray-500">total points</div>
            {(pendahuluSaya?.rank ?? 0) > 0 && (
              <div className="text-xs text-gray-500 mt-1">finished #{pendahuluSaya?.rank}</div>
            )}
          </div>
          {papan && (
            <LiveLeaderboard
              rows={papan}
              limit={10}
              highlight={identiti.nickname}
              title="Final leaderboard"
              subtitle="Ranked by points, then by speed."
            />
          )}
          <button onClick={keluar} className="btn-primary w-full py-2">Exit</button>
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
            <h1 className="text-xl font-bold mb-1">Lobby</h1>
            <p className="text-sm text-gray-500 mb-3">Waiting for your educator to start the quiz…</p>
            <div className="text-xs text-gray-400">Session code: <span className="font-mono font-bold text-brand-purple">{kod}</span></div>
          </div>
        )}

        {k.status === "asking" && soalanSemasa && (
          <div className="card">
            <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
              <span>Question {k.questionIndex + 1} / {k.totalQuestions}</span>
              <span className="flex items-center gap-1 font-semibold text-gray-700">
                <Timer className="w-4 h-4" />{" "}
                {k.useCountdown === false
                  ? "No countdown"
                  : berbaki !== null ? `${berbaki}s` : "—"}
              </span>
            </div>
            <div className="font-semibold mb-3">{soalanSemasa.prompt}</div>
            <div className="grid grid-cols-1 gap-2">
              {soalanSemasa.options.map((o) => {
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
                    {dipilih && <span className="float-right text-xs">Answer sent ✓</span>}
                  </button>
                );
              })}
            </div>
            {err && <div className="text-xs text-red-600 mt-2">{err}</div>}
          </div>
        )}

        {k.status === "revealed" && soalanSemasa && (
          <div className="card">
            <div className="text-xs text-gray-500 mb-2">Question {k.questionIndex + 1} / {k.totalQuestions}</div>
            <div className={`text-center mb-3 ${k.reveal?.isCorrect ? "text-green-600" : "text-red-600"}`}>
              {k.reveal?.myChoice ? (
                <>
                  {k.reveal.isCorrect ? <Check className="w-8 h-8 mx-auto" /> : <X className="w-8 h-8 mx-auto" />}
                  <div className="font-bold">
                    {k.reveal.isCorrect
                      ? k.reveal.pointsAwarded > 0
                        ? `Correct! +${k.reveal.pointsAwarded} points`
                        : "Correct, but the time ran out"
                      : "Wrong"}
                  </div>
                  {(k.reveal.streakBonus ?? 0) > 0 && (
                    <div className="text-xs font-semibold text-amber-600 mt-1">
                      includes +{k.reveal.streakBonus} streak bonus ({k.reveal.streak} correct in a row)
                    </div>
                  )}
                </>
              ) : (
                <div className="font-bold text-gray-500">No answer sent</div>
              )}
            </div>
            <div className="space-y-1 mb-3">
              {soalanSemasa.options.map((o) => {
                const betul = o.key === k.reveal?.correctKey;
                const pilihanSaya = o.key === k.reveal?.myChoice;
                return (
                  <div
                    key={o.key}
                    className={`rounded-lg border px-3 py-2 text-sm ${betul ? "border-green-500 bg-green-50 font-semibold text-green-800" : pilihanSaya ? "border-red-300 bg-red-50" : "border-gray-200"}`}
                  >
                    <span className="font-mono mr-1">{o.key}.</span> {o.text}
                    {pilihanSaya && !betul && <span className="text-xs float-right">your choice</span>}
                    {betul && <span className="text-xs float-right">correct answer</span>}
                  </div>
                );
              })}
            </div>
            <div className="text-center text-sm text-gray-600 border-t border-gray-100 pt-2">
              Rank <strong>#{k.reveal?.rank ?? "—"}</strong> · Total points <strong>{k.reveal?.score ?? 0}</strong>
            </div>
          </div>
        )}

        {papan && k.status !== "lobby" && (
          <div className="mt-4">
            <LiveLeaderboard
              rows={papan}
              limit={5}
              highlight={identiti.nickname}
              subtitle="Top five right now"
            />
          </div>
        )}

        <div className="text-center mt-4">
          <button onClick={keluar} className="text-xs text-gray-400 hover:text-gray-700">Leave session</button>
        </div>
      </div>
    </div>
  );
}
