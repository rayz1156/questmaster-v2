"use client";

/**
 * KZ-053: panel Cabaran Solo untuk halaman kuiz pendidik. Suis hidup/matikan,
 * pautan + butang salin + kod QR (laluan /api/live/qr sedia ada, dest=solo),
 * papan top 10, senarai larian terkini dengan butang padam, dan set semula
 * dengan pengesahan.
 */
import { useCallback, useEffect, useState } from "react";
import { Trash2, Copy, RotateCcw } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useBahasa } from "@/lib/i18n/BahasaProvider";
import { Alert, Button, Card, CardHead } from "@/components/ui";

interface BarisPapan {
  rank: number;
  runId: string;
  nickname: string;
  score: number;
  elapsedMs: number | null;
  finishedAt: string | null;
}

interface LarianGuru {
  id: string;
  nickname: string;
  user_id: string | null;
  score: number;
  correct: number;
  wrong: number;
  elapsed_ms: number | null;
  status: string;
  started_at: string;
  finished_at: string | null;
}

interface KeadaanSolo {
  enabled: boolean;
  code: string | null;
  link: string | null;
  leaderboard: BarisPapan[];
  runs: LarianGuru[];
}

function formatMasa(ms: number | null): string {
  if (ms == null) return "-";
  const jumlahSaat = Math.floor(ms / 1000);
  return `${Math.floor(jumlahSaat / 60)}:${String(jumlahSaat % 60).padStart(2, "0")}`;
}

export default function PanelCabaranSolo({ quizId }: { quizId: string }) {
  const { t } = useBahasa();
  const [keadaan, setKeadaan] = useState<KeadaanSolo | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const [ralat, setRalat] = useState<string | null>(null);
  const [mesej, setMesej] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  /** Permintaan dengan token Bearer pendidik. */
  const authedFetch = useCallback(async (url: string, init?: RequestInit) => {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(url, {
      ...init,
      headers: {
        ...(init?.headers || {}),
        ...(session ? { Authorization: "Bearer " + session.access_token } : {}),
        ...(init?.body ? { "content-type": "application/json" } : {}),
      },
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "Request failed.");
    return json;
  }, []);

  const muat = useCallback(async () => {
    try {
      const json = (await authedFetch(`/api/live/quizzes/${quizId}/solo`)) as KeadaanSolo;
      setKeadaan(json);
      setRalat(null);
    } catch (e) {
      setRalat(e instanceof Error && e.message ? e.message : t("solo.loadFailed"));
    }
  }, [authedFetch, quizId, t]);

  useEffect(() => {
    void muat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quizId]);

  const toggleSuai = async () => {
    if (!keadaan) return;
    setSibuk(true);
    setMesej(null);
    setRalat(null);
    try {
      const json = (await authedFetch(`/api/live/quizzes/${quizId}/solo`, {
        method: "POST",
        body: JSON.stringify({ enabled: !keadaan.enabled }),
      })) as { enabled: boolean; code: string | null };
      await muat();
      setMesej(
        json.enabled
          ? t("solo.enabledNotice")
          : t("solo.disabledNotice"),
      );
    } catch (e) {
      setRalat(e instanceof Error && e.message ? e.message : t("solo.loadFailed"));
    } finally {
      setSibuk(false);
    }
  };

  const salinPautan = async () => {
    if (!keadaan?.link) return;
    try {
      await navigator.clipboard.writeText(keadaan.link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setRalat(t("solo.copyFailed"));
    }
  };

  const padamLarian = async (runId: string) => {
    setSibuk(true);
    setMesej(null);
    setRalat(null);
    try {
      await authedFetch(`/api/live/quizzes/${quizId}/solo/runs/${runId}`, { method: "DELETE" });
      await muat();
      setMesej(t("solo.runDeleted"));
    } catch (e) {
      setRalat(e instanceof Error && e.message ? e.message : t("solo.loadFailed"));
    } finally {
      setSibuk(false);
    }
  };

  const setSemula = async () => {
    if (!window.confirm(t("solo.resetConfirm"))) return;
    setSibuk(true);
    setMesej(null);
    setRalat(null);
    try {
      const json = (await authedFetch(`/api/live/quizzes/${quizId}/solo/reset`, {
        method: "POST",
      })) as { deleted: number };
      await muat();
      setMesej(t("solo.resetDone", { n: json.deleted }));
    } catch (e) {
      setRalat(e instanceof Error && e.message ? e.message : t("solo.loadFailed"));
    } finally {
      setSibuk(false);
    }
  };

  const labelStatus = (status: string): string => {
    if (status === "finished") return t("solo.runFinished");
    if (status === "expired") return t("solo.runExpired");
    return t("solo.runPlaying");
  };

  if (!keadaan) {
    return (
      <Card className="mb-4">
        <CardHead title={t("solo.challenge")} />
        <p className="text-[12px] text-ink-faint mt-3">{ralat || t("solo.loading")}</p>
      </Card>
    );
  }

  return (
    <Card className="mb-4">
      <CardHead title={t("solo.challenge")} />
      <p className="text-[12px] text-ink-faint mt-3 mb-3">{t("solo.panelDesc")}</p>

      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          role="switch"
          aria-checked={keadaan.enabled}
          disabled={sibuk}
          onClick={() => void toggleSuai()}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            keadaan.enabled ? "bg-violet-600" : "bg-slate-300"
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              keadaan.enabled ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
        <span className="text-[13px] font-semibold text-ink">
          {keadaan.enabled ? t("solo.enabledLabel") : t("solo.disabledLabel")}
        </span>
      </div>

      {keadaan.enabled && keadaan.code && (
        <div className="mt-4 flex items-start gap-4 flex-wrap">
          <div className="flex-1 min-w-[220px]">
            <p className="text-[12px] font-semibold text-ink">{t("solo.linkLabel")}</p>
            <div className="mt-1 flex items-center gap-2">
              <input
                readOnly
                value={keadaan.link || ""}
                onFocus={(e) => e.currentTarget.select()}
                className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-[12px] text-ink-faint outline-none"
              />
              <Button
                variant="icon"
                size="sm"
                title={t("solo.copyLink")}
                ariaLabel={t("solo.copyLink")}
                onClick={() => void salinPautan()}
              >
                <Copy className="w-4 h-4" />
              </Button>
            </div>
            {copied && (
              <p className="text-[12px] text-emerald-700 mt-1">{t("solo.copied")}</p>
            )}
            <p className="text-[11px] text-ink-faint mt-2">
              {t("solo.code")} <span className="font-mono font-bold text-ink">{keadaan.code}</span>
            </p>
          </div>
          {/* Kod QR melalui laluan QR sedia ada, dest=solo supaya imbas membawa
              pelajar ke /solo/<kod> dan bukan /live/<kod>. */}
          <img
            src={`/api/live/qr?code=${encodeURIComponent(keadaan.code)}&dest=solo&size=180`}
            alt={t("solo.qrAlt")}
            width={120}
            height={120}
            className="rounded-lg border border-slate-200 bg-white"
          />
        </div>
      )}

      {/* Papan top 10 */}
      <div className="mt-4 bg-violet-50 border border-violet-200 rounded-xl p-4">
        <p className="text-[13px] font-bold text-ink mb-2">{t("solo.leaderboard")}</p>
        {keadaan.leaderboard.length === 0 ? (
          <p className="text-[12px] text-ink-faint">{t("solo.leaderboardEmpty")}</p>
        ) : (
          <ol className="space-y-1">
            {keadaan.leaderboard.map((b) => (
              <li key={b.runId} className="flex items-center gap-2 text-[13px]">
                <span className="w-6 text-right text-ink-faint">{b.rank}</span>
                <span className="flex-1 truncate">{b.nickname}</span>
                <span className="text-ink-faint">{b.score}</span>
                <span className="w-14 text-right text-ink-faint">{formatMasa(b.elapsedMs)}</span>
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* Senarai larian terkini */}
      <div className="mt-4">
        <p className="text-[13px] font-bold text-ink mb-2">{t("solo.recentRuns")}</p>
        {keadaan.runs.length === 0 ? (
          <p className="text-[12px] text-ink-faint">{t("solo.noRuns")}</p>
        ) : (
          <div className="space-y-1">
            {keadaan.runs.map((r) => (
              <div
                key={r.id}
                className="flex items-center gap-2 text-[12px] rounded-lg bg-slate-50 px-3 py-2"
              >
                <span className="flex-1 truncate font-medium text-ink">{r.nickname}</span>
                <span className="text-ink-faint tabular-nums">{t("solo.score")} {r.score}</span>
                <span className="text-ink-faint tabular-nums">{formatMasa(r.elapsed_ms)}</span>
                <span className="text-[11px] text-ink-faint">{labelStatus(r.status)}</span>
                <Button
                  variant="icon"
                  size="sm"
                  title={t("solo.deleteRun")}
                  ariaLabel={t("solo.deleteRun")}
                  className="text-[#e85347] hover:bg-[#fce4e2]"
                  onClick={() => void padamLarian(r.id)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
        <div className="mt-3">
          <Button
            variant="outline"
            size="sm"
            disabled={sibuk || keadaan.runs.length === 0}
            onClick={() => void setSemula()}
          >
            <RotateCcw className="w-4 h-4" /> {t("solo.resetRuns")}
          </Button>
        </div>
      </div>

      {mesej && <Alert tone="success" className="mt-3">{mesej}</Alert>}
      {ralat && <Alert tone="danger" className="mt-3">{ralat}</Alert>}
    </Card>
  );
}