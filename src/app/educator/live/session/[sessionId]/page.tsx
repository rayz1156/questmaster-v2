"use client";

/**
 * Skrin hos sesi kuiz langsung (dipaparkan pada projektor kelas). KZ-025:
 * HANYA bingkai luar ditukar ke kit v3 (PageHead, kad Card, butang kit,
 * Alert). Kandungan besar untuk projektor (teks soalan, pemasa, kod sertai,
 * papan keputusan) dan saiz fonnya TIDAK diubah. Logik realtime/polling,
 * peralihan status (lobby/asking/revealed/ended) dan token hos kekal sama.
 */

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Shell from "@/components/Shell";
import { EDU_TABS } from "@/lib/eduTabs";
import { ArrowLeft, Users, Play, Eye, SkipForward, Square, RotateCcw, Copy, Check, Maximize2, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import LiveLeaderboard from "@/components/LiveLeaderboard";
import RaceHostPanel, { type PemainLumba, type ReviewHos } from "@/components/RaceHostPanel";
import BossHostPanel, { type PemainRaksasa, type SeranganFeed, type StatsRaksasa } from "@/components/BossHostPanel";
import { Alert, Badge, Button, Card, CardHead, PageHead } from "@/components/ui";

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
  // KZ-012: Speed Race
  game_mode?: string | null;
  race_minutes?: number | null;
  race_ends_at?: string | null;
  race_finished?: number | null;
  review_index?: number | null;
  review_revealed?: boolean | null;
  // KZ-013: Boss Battle
  boss_k?: number | null;
  boss_max_hp?: number | null;
  boss_hp?: number | null;
  boss_crits?: number | null;
  boss_healed?: number | null;
  boss_last_hit?: string | null;
  boss_result?: string | null;
}
interface KeadaanHos {
  session: Sesi;
  quiz: { id: string; title: string } | null;
  questions: Soalan[];
  players: Pemain[];
  playerCount: number;
  currentQuestion: Soalan | null;
  distribution: Record<string, number> | null;
  serverNow?: string;
  review?: ReviewHos | null;
  // KZ-013: medan tambahan sesi Boss Battle.
  feed?: SeranganFeed[] | null;
  lastHitName?: string | null;
  stats?: StatsRaksasa | null;
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

  // Tinjauan setiap 2 saat; setiap 1 saat semasa Speed Race atau Boss Battle
  // berjalan supaya arena dan kereta bergerak lancar di skrin projektor
  // (KZ-012, KZ-013).
  const pantasRef = useRef(false);
  pantasRef.current =
    (state?.session.game_mode === "race" || state?.session.game_mode === "boss") &&
    state?.session.status === "asking";
  useEffect(() => {
    if (!sessionId) return;
    let hidup = true;
    let pemasa: ReturnType<typeof setTimeout> | null = null;
    const kitar = async () => {
      await muat();
      if (hidup) pemasa = setTimeout(kitar, pantasRef.current ? 1000 : 2000);
    };
    kitar();
    return () => { hidup = false; if (pemasa) clearTimeout(pemasa); };
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
        <p className="text-sm text-ink-muted">Loading…</p>
      </Shell>
    );
  }
  if (!state) {
    return (
      <Shell tabs={EDU_TABS}>
        <p className="text-sm text-ink-muted">{err || "Session not found."} <Link href="/educator/live" className="text-brand-purple font-semibold">Back →</Link></p>
      </Shell>
    );
  }

  const { session, quiz, questions, players, playerCount, currentQuestion, distribution } = state;
  const totalSoalan = questions.length;
  const lumba = session.game_mode === "race";
  const raksasa = session.game_mode === "boss";
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

  // Label status yang sama seperti sebelum ini (Racing/Battling/perbincangan).
  const labelStatus =
    (lumba || raksasa) && session.status === "asking"
      ? raksasa
        ? "Battling"
        : "Racing"
      : (lumba || raksasa) && session.status === "ended" && (session.review_index ?? -1) >= 0
        ? "Class discussion"
        : LABEL_STATUS[session.status] || session.status;

  return (
    <Shell tabs={EDU_TABS}>
      <PageHead
        crumb="Live Quiz"
        name={quiz?.title || "Live session"}
        secondaryActions={[{ label: "All quizzes", icon: <ArrowLeft className="w-4 h-4" />, href: "/educator/live" }]}
        actions={
          <Badge variant="dot" warna={session.status === "ended" ? "gray" : "green"}>
            {labelStatus}
          </Badge>
        }
      />

      {/* Tiga cara masuk: imbas QR, buka pautan, atau taip kod di /live.
          Speed Race / Boss Battle: disorok selepas permainan tamat supaya
          keputusan dan perbincangan berada di atas. */}
      {(!(lumba || raksasa) || session.status !== "ended") && (
      <Card className="mb-4">
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
              <Button variant="outline" size="sm" onClick={() => setPaparPenuh(true)}>
                <Maximize2 className="w-4 h-4" /> Show on screen
              </Button>
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
      </Card>
      )}

      {sesiPenuh && (
        <Alert tone="warning" className="mb-4">
          This session has reached its limit of {hadPemain} players. New players are turned away for now.
        </Alert>
      )}

      {lumba ? (
        <RaceHostPanel
          session={session}
          players={players as unknown as PemainLumba[]}
          questionCount={totalSoalan}
          serverNow={state.serverNow ?? null}
          review={state.review ?? null}
          busy={busy}
          kawal={kawal}
        />
      ) : raksasa ? (
        <BossHostPanel
          session={session}
          players={players as unknown as PemainRaksasa[]}
          questionCount={totalSoalan}
          serverNow={state.serverNow ?? null}
          review={state.review ?? null}
          feed={state.feed ?? []}
          lastHitName={state.lastHitName ?? null}
          stats={state.stats ?? null}
          busy={busy}
          kawal={kawal}
        />
      ) : (
      <>
      {/* Panel kawalan hos (mod klasik): fungsi kawal yang sama, rupa kit. */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {session.status === "lobby" && (
          <Button onClick={() => kawal("start")} disabled={busy}>
            <Play className="w-4 h-4" /> Start quiz
          </Button>
        )}
        {session.status === "asking" && (
          <Button onClick={() => kawal("reveal")} disabled={busy}>
            <Eye className="w-4 h-4" /> Reveal answer
          </Button>
        )}
        {(session.status === "asking" || session.status === "revealed") && (
          <Button onClick={() => kawal("next")} disabled={busy}>
            <SkipForward className="w-4 h-4" /> Next question
          </Button>
        )}
        {session.status !== "ended" && (
          <>
            <Button variant="dim" warna="red" onClick={() => kawal("end")} disabled={busy}>
              <Square className="w-4 h-4" /> End session
            </Button>
            <Button variant="outline" onClick={() => kawal("reset")} disabled={busy}>
              <RotateCcw className="w-4 h-4" /> Reset
            </Button>
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
        <Card className="mb-4">
          <CardHead title="Waiting in the lobby…" />
          <p className="text-sm text-gray-500 mt-2">Participants appear here as they join. Press &quot;Start quiz&quot; when you are ready.</p>
        </Card>
      ) : currentQuestion && (
        <Card className="mb-4">
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
        </Card>
      )}

      {session.status === "lobby" ? (
        <Card>
          <CardHead
            title={
              <span className="flex items-center gap-2">
                <Users className="w-4 h-4 text-indigo-600" /> Participants ({playerCount})
              </span>
            }
          />
          {players.length === 0 ? (
            <p className="text-sm text-gray-500 mt-2">No participants yet.</p>
          ) : (
            <ol className="text-sm space-y-1 mt-2">
              {players.map((p, i) => (
                <li key={p.id} className="flex items-center justify-between">
                  <span>{i + 1}. {p.nickname}</span>
                  <span className="text-xs text-gray-400">joined</span>
                </li>
              ))}
            </ol>
          )}
        </Card>
      ) : session.status === "ended" ? null : (
        <LiveLeaderboard
          rows={barisPapan}
          subtitle={`${playerCount} taking part, ranked by points then speed.`}
        />
      )}
      </>
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
