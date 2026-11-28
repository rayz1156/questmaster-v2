"use client";

/**
 * KZ-UTT Fasa 4: pelan pengukuran, status susulan dan eksport data kajian
 * untuk panel Cabaran Solo pendidik (mod ujian sahaja).
 *
 * Tetingkap T2 dan T3 ialah STANDARD v1 dan tidak boleh diubah di sini;
 * pendidik hanya menetapkan masa mula Modul 1, masa tamat kursus, teks
 * persetujuan dan suis e-mel.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useBahasa } from "@/lib/i18n/BahasaProvider";

interface Pelan {
  module1_start_at: string | null;
  course_end_at: string | null;
  emails_enabled: boolean;
  consent_text: string | null;
  consent_version: number;
  day_length_sec: number;
}

interface EmelPeserta {
  point: string;
  seq: number;
  status: "queued" | "sent" | "failed" | "cancelled";
  reason: string | null;
  dueAt: string;
  sentAt: string | null;
}

interface StatusPeserta {
  userId: string;
  name: string;
  consent: "agree" | "decline" | null;
  unsubscribed: boolean;
  withdrawn: boolean;
  t1: string | null;
  t2: string | null;
  t3: string | null;
  t3Opens: string | null;
  t3Closes: string | null;
  emails: EmelPeserta[];
}

interface Respons {
  plan: Pelan | null;
  standard: { t2TutupHari: number; t3BukaHari: number; t3TutupHari: number };
  classLinked: boolean;
  t2Window: { opens: string; closes: string } | null;
  participants: StatusPeserta[];
}

/** ISO kepada nilai input datetime-local (waktu tempatan pelayar). */
function keInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function tarikhPendek(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function PanelKajianSolo({ quizId }: { quizId: string }) {
  const { t } = useBahasa();
  const [data, setData] = useState<Respons | null>(null);
  const [m1, setM1] = useState("");
  const [tamat, setTamat] = useState("");
  const [teks, setTeks] = useState("");
  const [emel, setEmel] = useState(false);
  const [hari, setHari] = useState("86400");
  const [sibuk, setSibuk] = useState(false);
  const [ralat, setRalat] = useState<string | null>(null);
  const [mesej, setMesej] = useState<string | null>(null);

  const token = useCallback(async (): Promise<Record<string, string>> => {
    const { data: { session } } = await supabase.auth.getSession();
    const h: Record<string, string> = {};
    if (session) h.Authorization = "Bearer " + session.access_token;
    return h;
  }, []);

  const muat = useCallback(async () => {
    try {
      const res = await fetch(`/api/live/quizzes/${quizId}/research`, { headers: await token(), cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : t("solo.loadFailed"));
      const r = json as Respons;
      setData(r);
      setM1(keInput(r.plan?.module1_start_at ?? null));
      setTamat(keInput(r.plan?.course_end_at ?? null));
      setTeks(r.plan?.consent_text ?? "");
      setEmel(r.plan?.emails_enabled === true);
      setHari(String(r.plan?.day_length_sec ?? 86400));
      setRalat(null);
    } catch (e) {
      setRalat(e instanceof Error && e.message ? e.message : t("solo.loadFailed"));
    }
  }, [quizId, t, token]);

  useEffect(() => {
    void muat();
  }, [muat]);

  const simpan = async () => {
    setSibuk(true);
    setRalat(null);
    setMesej(null);
    try {
      const res = await fetch(`/api/live/quizzes/${quizId}/research`, {
        method: "PUT",
        headers: { ...(await token()), "content-type": "application/json" },
        body: JSON.stringify({
          module1_start_at: m1 ? new Date(m1).toISOString() : null,
          course_end_at: tamat ? new Date(tamat).toISOString() : null,
          consent_text: teks,
          emails_enabled: emel,
          day_length_sec: Number(hari),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : t("solo.loadFailed"));
      setMesej(t("solo.planSavedNotice"));
      await muat();
    } catch (e) {
      setRalat(e instanceof Error && e.message ? e.message : t("solo.loadFailed"));
    } finally {
      setSibuk(false);
    }
  };

  const eksport = async () => {
    setSibuk(true);
    setRalat(null);
    try {
      const res = await fetch(`/api/live/quizzes/${quizId}/research/export`, { headers: await token(), cache: "no-store" });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(typeof json.error === "string" ? json.error : t("solo.exportFailed"));
      }
      const blob = await res.blob();
      const nama = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") || "")?.[1] || "kajian.csv";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = nama;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setRalat(e instanceof Error && e.message ? e.message : t("solo.exportFailed"));
    } finally {
      setSibuk(false);
    }
  };

  if (!data) {
    return ralat ? <p className="mt-4 text-[12px] text-red-700">{ralat}</p> : null;
  }

  const labelEmel: Record<EmelPeserta["status"], string> = {
    queued: t("solo.emailQueued"),
    sent: t("solo.emailSent"),
    failed: t("solo.emailFailed"),
    cancelled: t("solo.emailCancelled"),
  };
  const input = "mt-1 w-full rounded-xl border border-violet-200 bg-white px-3 py-2 text-[13px] text-ink outline-none focus:border-violet-500";

  return (
    <div className="mt-4 border-t border-violet-200 pt-3 space-y-3">
      <div>
        <p className="text-[13px] font-semibold text-ink">{t("solo.planTitle")}</p>
        <p className="text-[12px] text-ink-faint mt-0.5">
          {t("solo.planDesc", { t2: data.standard.t2TutupHari, a: data.standard.t3BukaHari, b: data.standard.t3TutupHari })}
        </p>
      </div>

      {!data.classLinked ? (
        <p className="text-[12px] text-amber-700">{t("solo.planNoClass")}</p>
      ) : (
        <>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block">
              <span className="text-[12px] font-semibold text-ink">{t("solo.planModule1")}</span>
              <input type="datetime-local" value={m1} onChange={(e) => setM1(e.target.value)} className={input} />
            </label>
            <label className="block">
              <span className="text-[12px] font-semibold text-ink">{t("solo.planCourseEnd")}</span>
              <input type="datetime-local" value={tamat} onChange={(e) => setTamat(e.target.value)} className={input} />
            </label>
          </div>
          {data.t2Window && (
            <p className="text-[12px] text-ink">
              {t("solo.planT2Window", { a: tarikhPendek(data.t2Window.opens), b: tarikhPendek(data.t2Window.closes) })}
            </p>
          )}
          <label className="block">
            <span className="text-[12px] font-semibold text-ink">{t("solo.planConsentText")}</span>
            <textarea value={teks} onChange={(e) => setTeks(e.target.value)} rows={5} className={input} />
            <span className="block text-[11px] text-ink-faint mt-0.5">{t("solo.planConsentHint")}</span>
          </label>
          <label className="flex items-start gap-2">
            <input type="checkbox" checked={emel} onChange={(e) => setEmel(e.target.checked)} className="mt-1" />
            <span>
              <span className="block text-[12px] font-semibold text-ink">{t("solo.planEmails")}</span>
              <span className="block text-[11px] text-ink-faint">{t("solo.planEmailsDesc")}</span>
            </span>
          </label>
          <label className="block max-w-[260px]">
            <span className="text-[12px] font-semibold text-ink">{t("solo.planDayLength")}</span>
            <input type="number" min={60} max={86400} value={hari} onChange={(e) => setHari(e.target.value)} className={input} />
            <span className="block text-[11px] text-ink-faint mt-0.5">{t("solo.planDayLengthHint")}</span>
          </label>
          {ralat && <p className="text-[12px] text-red-700">{ralat}</p>}
          {mesej && <p className="text-[12px] text-emerald-700">{mesej}</p>}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={sibuk}
              onClick={() => void simpan()}
              className="px-3 py-1.5 rounded-lg text-white text-[12px] font-semibold bg-gradient-to-r from-violet-600 to-indigo-600 disabled:opacity-50"
            >
              {t("solo.planSave")}
            </button>
            {data.plan && (
              <button
                type="button"
                disabled={sibuk}
                onClick={() => void eksport()}
                className="px-3 py-1.5 rounded-lg text-[12px] font-semibold text-violet-700 border border-violet-300 bg-white disabled:opacity-50"
              >
                {t("solo.exportCsv")}
              </button>
            )}
          </div>
          {data.plan && <p className="text-[11px] text-ink-faint">{t("solo.exportNote")}</p>}

          <div>
            <p className="text-[13px] font-semibold text-ink">{t("solo.statusTitle")}</p>
            {data.participants.length === 0 ? (
              <p className="text-[12px] text-ink-faint">{t("solo.statusNone")}</p>
            ) : (
              <div className="mt-1 overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="text-left text-ink-faint">
                      <th className="py-1 pr-2 font-semibold">{t("solo.nickname")}</th>
                      <th className="py-1 pr-2 font-semibold">{t("solo.statusConsent")}</th>
                      <th className="py-1 pr-2 font-semibold">T1</th>
                      <th className="py-1 pr-2 font-semibold">T2</th>
                      <th className="py-1 pr-2 font-semibold">T3</th>
                      <th className="py-1 font-semibold">{t("solo.statusEmails")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.participants.map((p) => (
                      <tr key={p.userId} className="border-t border-slate-100 align-top">
                        <td className="py-1 pr-2 text-ink">{p.name || "-"}</td>
                        <td className="py-1 pr-2">
                          {p.consent === "agree" ? t("solo.statusAgree") : p.consent === "decline" ? t("solo.statusDecline") : t("solo.statusPending")}
                          {p.unsubscribed && <span className="block text-amber-700">{t("solo.statusUnsubscribed")}</span>}
                          {p.withdrawn && <span className="block text-red-700">{t("solo.statusWithdrawn")}</span>}
                        </td>
                        <td className="py-1 pr-2">{tarikhPendek(p.t1)}</td>
                        <td className="py-1 pr-2">{tarikhPendek(p.t2)}</td>
                        <td className="py-1 pr-2">
                          {p.t3 ? tarikhPendek(p.t3) : p.t3Opens ? t("solo.statusT3Window", { a: tarikhPendek(p.t3Opens), b: tarikhPendek(p.t3Closes) }) : "-"}
                        </td>
                        <td className="py-1">
                          {p.emails.length === 0
                            ? "-"
                            : p.emails.map((e) => (
                                <span key={`${e.point}-${e.seq}`} className="block">
                                  {e.point}#{e.seq}: {labelEmel[e.status]}
                                  {e.reason ? ` (${e.reason})` : ""}
                                </span>
                              ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
