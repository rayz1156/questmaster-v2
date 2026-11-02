"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { previewClassByCode, joinClassByCode, normalizeClassCode, type ClassPreview } from "@/lib/data";
import { supabase } from "@/lib/supabase";
import { useBahasa } from "@/lib/i18n/BahasaProvider";

export const dynamic = "force-dynamic";

/**
 * Aliran sertai kelas melalui pautan pendek /j/[kod] (tiket V2-004).
 * Kod di URL boleh berhuruf kecil, bersambung sengkang atau mengandungi
 * huruf O/I/L; semua dinormalisasi sebelum RPC dipanggil.
 */
export default function JoinByCodePage({ params }: { params: { kod: string } }) {
  const { t } = useBahasa();
  const router = useRouter();
  const kod = params?.kod || "";

  const [state, setState] = useState<"loading" | "preview" | "ended" | "member" | "missing">("loading");
  const [preview, setPreview] = useState<ClassPreview | null>(null);
  const [activeCode, setActiveCode] = useState("");
  const [manualCode, setManualCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  // Memuat pratonton untuk satu kod (kod manual atau kod dari URL).
  const loadPreview = async (code: string) => {
    setBusy(true); setErr(null); setOk(null);
    try {
      const p = await previewClassByCode(code);
      setActiveCode(normalizeClassCode(code));
      if (!p) {
        setState("missing");
      } else if (p.already_member) {
        setState("member");
        setTimeout(() => router.replace("/participant/home"), 900);
      } else if (p.is_ended) {
        setState("ended");
      } else {
        setPreview(p);
        setState("preview");
      }
    } catch (e) {
      setErr(String((e as Error)?.message || t("sertai.somethingWentWrong")));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Tunggu sesi terhidrasi sebelum membuat keputusan log masuk.
      const { data } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!data.user) {
        router.replace("/login?next=" + encodeURIComponent("/j/" + kod));
        return;
      }
      if (kod) await loadPreview(kod);
      else setState("missing");
    })();
    return () => { cancelled = true; };
  }, []);

  const onJoin = async () => {
    if (!preview) return;
    setBusy(true); setErr(null);
    try {
      await joinClassByCode(activeCode || normalizeClassCode(kod));
      setOk(t("sertai.youHaveJoined", { kelas: preview.class_name }));
      setTimeout(() => router.replace("/participant/home"), 700);
    } catch (e) {
      const msg = String((e as Error)?.message || t("participant.failedGeneric"));
      setErr(/Invalid class code/i.test(msg) ? t("participant.codeNotFound") : msg);
    } finally { setBusy(false); }
  };

  // Kad ralat ringkas dengan gaya kotak sedia ada.
  const ErrBox = () => err ? <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-sm text-rose-700">{err}</div> : null;
  const OkBox = () => ok ? <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-sm text-emerald-700">{ok}</div> : null;

  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center p-4">
      <div className="card w-full max-w-sm space-y-3">
        <h1 className="section-title">{t("sertai.joinClassTitle")}</h1>

        {state === "loading" && <p className="text-sm text-ink-muted">{t("common.loading")}</p>}

        {state === "member" && (
          <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 text-sm text-violet-800">
            {t("sertai.alreadyMember")}
          </div>
        )}

        {state === "ended" && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
            {t("sertai.classEndedNoNewMembers")}
          </div>
        )}

        {state === "missing" && (
          <>
            <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 text-sm text-violet-800">
              {t("participant.codeNotFound")}
            </div>
            <form
              onSubmit={(e) => { e.preventDefault(); if (manualCode.trim()) loadPreview(normalizeClassCode(manualCode.trim())); }}
              className="space-y-3"
            >
              <input
                className="input text-center font-mono text-lg uppercase tracking-[0.2em]"
                placeholder={t("common.codeExample")}
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value.toUpperCase())}
                maxLength={16}
                required
              />
              <button disabled={busy} className="btn-primary w-full py-2">{busy ? t("sertai.checking") : t("sertai.checkCode")}</button>
            </form>
          </>
        )}

        {state === "preview" && preview && (
          <>
            <div
              className="bg-violet-50 border border-violet-200 rounded-xl p-4 flex items-center gap-3"
              style={preview.class_color ? { borderLeft: `6px solid ${preview.class_color}` } : undefined}
            >
              <div className="flex-1">
                <div className="font-semibold text-gray-900">{t("sertai.joinQuestion", { nama: preview.class_name })}</div>
                <div className="text-xs text-gray-500 mt-0.5">{t("sertai.byEducator", { pendidik: preview.educator_name })}</div>
              </div>
            </div>
            <button disabled={busy} onClick={onJoin} className="w-full py-2.5 rounded-xl text-white text-sm font-medium bg-gradient-to-r from-violet-600 to-indigo-600 hover:opacity-95 disabled:opacity-50">
              {busy ? t("participant.joining") : t("participant.joinClassButton")}
            </button>
            <button disabled={busy} onClick={() => router.replace("/participant/home")} className="w-full py-2 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50">
              {t("common.notNow")}
            </button>
          </>
        )}

        <ErrBox />
        <OkBox />
      </div>
    </div>
  );
}