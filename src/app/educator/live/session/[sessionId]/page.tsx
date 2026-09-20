"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Shell from "@/components/Shell";
import { EDU_TABS } from "@/lib/eduTabs";
import { Users, Play, Eye, SkipForward, Square, RotateCcw, Copy, Check } from "lucide-react";
import { supabase } from "@/lib/supabase";

interface Pilihan { key: string; text: string }
interface Soalan {
  id: string; order_idx: number; prompt: string; options: Pilihan[];
  correct_key: string; points: number; time_limit_sec: number;
}
interface Pemain { id: string; nickname: string; score: number; joined_at: string }
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

      <div className="card mb-4 flex items-center gap-4 flex-wrap">
        <div>
          <div className="text-xs text-gray-500">Session code — ask participants to join at /live</div>
          <button onClick={salinKod} className="flex items-center gap-2 font-mono text-3xl font-bold tracking-widest text-brand-purple">
            {session.code}
            {disalin ? <Check className="w-5 h-5 text-green-600" /> : <Copy className="w-5 h-5 text-gray-400" />}
          </button>
        </div>
        <div className="ml-auto flex items-center gap-2 text-sm text-gray-600">
          <Users className="w-5 h-5 text-indigo-600" />
          <span><strong>{playerCount}</strong>{hadPemain !== null ? <> / {hadPemain}</> : null} participants</span>
        </div>
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
        <div className="card mb-4">
          <div className="font-semibold mb-2">The session has ended</div>
          <p className="text-sm text-gray-500 mb-3">Final leaderboard:</p>
          <ol className="text-sm space-y-1">
            {players.slice(0, 10).map((p, i) => (
              <li key={p.id} className="flex items-center justify-between">
                <span>{i + 1}. {p.nickname}</span>
                <span className="font-semibold">{p.score}</span>
              </li>
            ))}
          </ol>
        </div>
      ) : session.status === "lobby" ? (
        <div className="card mb-4">
          <div className="font-semibold mb-1">Waiting in the lobby…</div>
          <p className="text-sm text-gray-500">Participants appear here as they join. Press &quot;Start quiz&quot; when you are ready.</p>
        </div>
      ) : currentQuestion && (
        <div className="card mb-4">
          <div className="text-xs text-gray-500 mb-1">Question {session.current_index + 1} / {totalSoalan}</div>
          <div className="font-semibold mb-2">{currentQuestion.prompt}</div>
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

      <div className="card">
        <div className="font-semibold mb-2 flex items-center gap-2"><Users className="w-4 h-4 text-indigo-600" /> Participants ({playerCount})</div>
        {players.length === 0 ? (
          <p className="text-sm text-gray-500">No participants yet.</p>
        ) : (
          <ol className="text-sm space-y-1">
            {players.map((p, i) => (
              <li key={p.id} className="flex items-center justify-between">
                <span>{i + 1}. {p.nickname}</span>
                <span className="font-semibold">{p.score}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </Shell>
  );
}
