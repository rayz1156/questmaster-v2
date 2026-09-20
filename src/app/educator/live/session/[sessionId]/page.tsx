"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Shell from "@/components/Shell";
import { EDU_TABS } from "@/lib/eduTabs";
import { Users, Play, Eye, SkipForward, Square, RotateCcw, Copy, Check, Maximize2, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import LiveLeaderboard from "@/components/LiveLeaderboard";

interface Pilihan { key: string; text: string }
interface Soalan {
  id: string; order_idx: number; prompt: string; options: Pilihan[];
  correct_key: string; points: number; time_limit_sec: number;
  use_countdown?: boolean; double_points?: boolean;
}
interface Pemain {
  id: string; nickname: string; score: number; joined_at: string;
  streak?: number; best_streak?: number;
}
interface Sesi {
  id: string; code: string; status: string; current_index: number;
  question_started_at: string | null;
  max_players?: number;
}
interface KeadaanHos {
  session: Sesi;
  quiz: { id: string; title: string } | null;
  questions: Soalan[];
  players: Pemain[];
  playerCount: number;
  currentQuestion: Soalan | null;
  distribution: Record<string, number> | null;
}

async function authedFetch(url: string, init?: RequestInit) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(session ? { Authorization: "Bearer " + session.access_token } : {}),
      ...(init?.headers || {}),
    },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "Request failed.");
  return json;
}

const LABEL_STATUS: Record<string, string> = {
  lobby: "Lobby",
  asking: "Answering",
  revealed: "Answer revealed",
  ended: "Session over",
};

export default function PanelHosSesi() {
  const { sessionId } = useParams<{ sessionId: string }>() as { sessionId: string };

  const [state, setState] = useState<KeadaanHos | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [disalin, setDisalin] = useState(false);
  const [pautanDisalin, setPautanDisalin] = useState(false);
  const [paparPenuh, setPaparPenuh] = useState(false);
  // Asal URL diambil daripada pelayar supaya pautan sertai betul pada
  // staging mahupun pengeluaran tanpa tetapan tambahan.
  const [asal, setAsal] = useState("");

  useEffect(() => {
    setAsal(window.location.origin);
  }, []);

  const muat = async () => {
    try {
      const json = await authedFetch("/api/live/sessions/" + sessionId);
      setState(json.data);
      setErr(null);
    } catch (e) {
      setErr((e instanceof Error ? e.message : null) || "Could not load the session.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!sessionId) return;
    muat();
    // Tinjauan setiap 2 saat.
    const id = setInterval(muat, 2000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const kawal = async (action: string) => {
    setBusy(true);
    try {
      await authedFetch(`/api/live/sessions/${sessionId}/control`, {
        method: "POST",
        body: JSON.stringify({ action }),
      });
      await muat();
    } catch (e) {
      alert((e instanceof Error ? e.message : null) || "Action failed.");
    } finally {
      setBusy(false);
    }
  };

  const salinKod = async () => {
    if (!state) return;
    try {
      await navigator.clipboard.writeText(state.session.code);
      setDisalin(true);
      setTimeout(() => setDisalin(false), 1500);
    } catch { /* pelayar mungkin tidak membenarkan */ }
  };

  const salinPautan = async () => {
    if (!state) return;
    try {
      await navigator.clipboard.writeText(asal + "/live/" + state.session.code);
      setPautanDisalin(true);
      setTimeout(() => setPautanDisalin(false), 1500);
    } catch { /* pelayar mungkin tidak membenarkan */ }
  };

  if (loading) {
    return (
      <Shell tabs={EDU_TABS}>
        <p className="text-sm text-gray-500">Loading…</p>
      </Shell>
    );
  }
  if (!state) {
    return (
      <Shell tabs={EDU_TABS}>
        <p className="text-sm text-gray-500">{err || "Session not found."} <Link href="/educator/live" className="text-brand-purple font-semibold">Back →</Link></p>
      </Shell>
    );
  }

  const { session, quiz, questions, players, playerCount, currentQuestion, distribution } = state;
  const totalSoalan = questions.length;
  const hadPemain = session.max_players ?? null;
  const sesiPenuh = hadPemain !== null && playerCount >= hadPemain;
  const pautanSertai = asal + "/live/" + session.code;
  const pautanAsas = (asal || "") + "/live";
  // Satu bentuk baris untuk komponen leaderboard yang dikongsi dengan
  // leaderboard aktiviti.
  const barisPapan = players.map((p, i) => ({
    rank: i + 1,
    nickname: p.nickname,
    score: p.score,
    streak: session.status === "ended" ? p.best_streak : p.streak,
  }));

  return (
    <Shell tabs={EDU_TABS}>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div>
          <h2 className="page-title">{quiz?.title || "Live session"}</h2>
          <Link href="/educator/live" className="text-xs text-gray-500 hover:text-gray-800">← All quizzes</Link>
        </div>
        <span className={`text-xs font-semibold px-2 py-1 rounded-full ${session.status === "ended" ? "bg-gray-100 text-gray-600" : "bg-green-100 text-green-700"}`}>
          {LABEL_STATUS[session.status] || session.status}
        </span>
      </div>

      {/* Tiga cara masuk: imbas QR, buka pautan, atau taip kod di /live. */}
      <div className="card mb-4">
        <div className="flex items-start gap-5 flex-wrap">
          <div className="text-center shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/live/qr?code=${session.code}&size=220`}
              alt={`QR code for session ${session.code}`}
              width={140}
              height={140}
              className="rounded-lg border border-gray-200"
            />
            <div className="text-[11px] text-gray-500 mt-1">Scan to join</div>
          </div>

          <div className="min-w-0 flex-1">
            <div className="text-xs text-gray-500">Session code</div>
            <button
              onClick={salinKod}
              title="Copy the code"
              className="flex items-center gap-2 font-mono text-3xl font-bold tracking-widest text-brand-purple"
            >
              {session.code}
              {disalin ? <Check className="w-5 h-5 text-green-600" /> : <Copy className="w-5 h-5 text-gray-400" />}
            </button>

            <div className="text-xs text-gray-500 mt-3">Join link</div>
            <button
              onClick={salinPautan}
              title="Copy the link"
              className="flex items-center gap-2 text-sm text-gray-700 hover:text-brand-purple max-w-full"
            >
              <span className="font-mono truncate">{pautanSertai || "/live/" + session.code}</span>
              {pautanDisalin
                ? <Check className="w-4 h-4 text-green-600 shrink-0" />
                : <Copy className="w-4 h-4 text-gray-400 shrink-0" />}
            </button>

            <div className="flex items-center gap-3 mt-3 flex-wrap">
              <button
                onClick={() => setPaparPenuh(true)}
                className="px-3 py-1.5 rounded-lg border border-violet-300 text-violet-700 hover:bg-violet-50 text-sm flex items-center gap-1"
              >
                <Maximize2 className="w-4 h-4" /> Show on screen
              </button>
              <span className="flex items-center gap-2 text-sm text-gray-600">
                <Users className="w-5 h-5 text-indigo-600" />
                <strong>{playerCount}</strong>{hadPemain !== null ? <> / {hadPemain}</> : null} participants
              </span>
            </div>
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-3">
          Three ways in: scan the QR code, open the link, or go to{" "}
          <span className="font-mono">{pautanAsas}</span> and type the code.
        </p>
      </div>

      {sesiPenuh && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          This session has reached its limit of {hadPemain} players. New players are turned away for now.
        </div>
      )}

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {session.status === "lobby" && (
          <button onClick={() => kawal("start")} disabled={busy} className="btn-primary py-1.5 px-3 text-sm flex items-center gap-1">
            <Play className="w-4 h-4" /> Start quiz
          </button>
        )}
        {session.status === "asking" && (
          <button onClick={() => kawal("reveal")} disabled={busy} className="btn-primary py-1.5 px-3 text-sm flex items-center gap-1">
            <Eye className="w-4 h-4" /> Reveal answer
          </button>
        )}
        {(session.status === "asking" || session.status === "revealed") && (
          <button onClick={() => kawal("next")} disabled={busy} className="btn-primary py-1.5 px-3 text-sm flex items-center gap-1">
            <SkipForward className="w-4 h-4" /> Next question
          </button>
        )}
        {session.status !== "ended" && (
          <>
            <button onClick={() => kawal("end")} disabled={busy} className="px-3 py-1.5 rounded-lg border border-red-300 text-red-600 hover:bg-red-50 text-sm flex items-center gap-1">
              <Square className="w-4 h-4" /> End session
            </button>
            <button onClick={() => kawal("reset")} disabled={busy} className="px-3 py-1.5 rounded-lg border border-gray-300 hover:bg-gray-50 text-sm flex items-center gap-1">
              <RotateCcw className="w-4 h-4" /> Reset
            </button>
          </>
        )}
      </div>

      {session.status === "ended" ? (
        <div className="mb-4">
          <LiveLeaderboard
            rows={barisPapan}
            limit={10}
            title="Final leaderboard"
            subtitle="Ranked by points, then by speed."
          />
        </div>
      ) : session.status === "lobby" ? (
        <div className="card mb-4">
          <div className="font-semibold mb-1">Waiting in the lobby…</div>
          <p className="text-sm text-gray-500">Participants appear here as they join. Press &quot;Start quiz&quot; when you are ready.</p>
        </div>
      ) : currentQuestion && (
        <div className="card mb-4">
          <div className="text-xs text-gray-500 mb-1">Question {session.current_index + 1} / {totalSoalan}</div>
          <div className="font-semibold mb-1">{currentQuestion.prompt}</div>
          <div className="text-xs text-gray-400 mb-2">
            {currentQuestion.use_countdown === false
              ? "No countdown. Reveal when you are ready; faster answers still score higher."
              : `${currentQuestion.time_limit_sec}s countdown`}
            {currentQuestion.double_points ? " · double points" : ""}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {currentQuestion.options.map((o) => {
              const betul = session.status === "revealed" && o.key === currentQuestion.correct_key;
              const jumlah = distribution ? distribution[o.key] || 0 : 0;
              return (
                <div
                  key={o.key}
                  className={`rounded-lg border px-3 py-2 text-sm ${betul ? "border-green-500 bg-green-50 font-semibold text-green-800" : "border-gray-200"}`}
                >
                  <span className="font-mono mr-1">{o.key}.</span> {o.text}
                  {distribution && (
                    <span className="float-right text-xs text-gray-500">{jumlah} answers</span>
                  )}
                </div>
              );
            })}
          </div>
          {session.status !== "revealed" && (
            <p className="text-xs text-gray-400 mt-2">The correct answer stays hidden until you reveal it.</p>
          )}
        </div>
      )}

      {session.status === "lobby" ? (
        <div className="card">
          <div className="font-semibold mb-2 flex items-center gap-2"><Users className="w-4 h-4 text-indigo-600" /> Participants ({playerCount})</div>
          {players.length === 0 ? (
            <p className="text-sm text-gray-500">No participants yet.</p>
          ) : (
            <ol className="text-sm space-y-1">
              {players.map((p, i) => (
                <li key={p.id} className="flex items-center justify-between">
                  <span>{i + 1}. {p.nickname}</span>
                  <span className="text-xs text-gray-400">joined</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      ) : session.status === "ended" ? null : (
        <LiveLeaderboard
          rows={barisPapan}
          subtitle={`${playerCount} taking part, ranked by points then speed.`}
        />
      )}
      {/* Paparan skrin penuh untuk projektor kelas. */}
      {paparPenuh && (
        <div className="fixed inset-0 z-50 bg-white flex flex-col items-center justify-center p-6">
          <button
            onClick={() => setPaparPenuh(false)}
            title="Close"
            className="absolute top-4 right-4 text-gray-400 hover:text-gray-700"
          >
            <X className="w-7 h-7" />
          </button>
          <div className="text-lg text-gray-500 mb-3">Join the quiz</div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/live/qr?code=${session.code}&size=900`}
            alt={`QR code for session ${session.code}`}
            className="w-[min(52vh,52vw)] h-[min(52vh,52vw)]"
          />
          <div className="font-mono text-6xl sm:text-7xl font-bold tracking-widest text-brand-purple mt-4">
            {session.code}
          </div>
          <div className="text-base text-gray-600 mt-2 font-mono break-all text-center">
            {pautanSertai}
          </div>
          <div className="text-sm text-gray-500 mt-4 flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-600" />
            <strong>{playerCount}</strong>{hadPemain !== null ? <> / {hadPemain}</> : null} joined
          </div>
        </div>
      )}
    </Shell>
  );
}
