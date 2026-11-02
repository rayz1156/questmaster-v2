"use client";
/**
 * Sertai kelas melalui kod, rupa v3 KZ-023.
 *
 * Kad tengah gaya AuthSplit: borang Field/Input kit dalam Card kit.
 * Aliran tidak berubah: semak sesi dahulu (belum log masuk -> halaman
 * log masuk dengan next), kod dalam URL -> alih ke /j/<kod
 * dinormalisasi>, dan borang tetap memanggil joinClassByCode dengan
 * normalizeClassCode.
 */
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { joinClassByCode, normalizeClassCode } from "@/lib/data";
import {
  Alert,
  Button,
  Card,
  CardHead,
  Field,
  Input,
} from "@/components/ui";
import { useBahasa } from "@/lib/i18n/BahasaProvider";

function Inner() {
  const { t } = useBahasa();
  const router = useRouter();
  const sp = useSearchParams();
  const [code, setCode] = useState(sp.get('code') || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Wait for Supabase to hydrate the session before redirecting to login
      const { supabase } = await import('@/lib/supabase');
      const { data } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!data.user) {
        router.replace(`/login?next=${encodeURIComponent('/participant/join' + (code ? `?code=${code}` : ''))}`);
      } else {
        // Satu aliran sahaja: jika kod ada di URL, alih ke /j/<kod
        // dinormalisasi> (tiket V2-004). Tiada penyertaan automatik di sini.
        if (code && code.trim()) {
          router.replace(`/j/${normalizeClassCode(code.trim())}`);
          return;
        }
      }
    })();
    return () => { cancelled = true; };
    // Dijalankan sekali semasa muat, seperti versi asal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null); setOk(null); setBusy(true);
    // Kod dinormalisasi sebelum dihantar supaya jarak, sengkang dan
    // huruf O/I/L tidak menghalang penyertaan.
    try { await joinClassByCode(normalizeClassCode(code)); setOk(t("participant.joinedRedirecting")); setTimeout(() => router.replace('/participant/home'), 800); }
    catch (e: unknown) { const m = String((e as { message?: string })?.message || t("participant.failedGeneric")); setErr(/Invalid class code/i.test(m) ? t("participant.codeNotFound") : m); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={onSubmit} className="w-full max-w-sm">
      <Card>
        <div className="mb-5">
          <Button variant="ghost" href="/participant/home" ariaLabel={t("participant.backToHome")}>
            <ArrowLeft className="w-4 h-4" /> {t("participant.backToHome")}
          </Button>
        </div>
        <CardHead
          title={t("participant.joinClassTitle")}
          subtitle={t("participant.enterCodeGiven")}
        />
        <div className="mt-5">
          <Field label={t("participant.classCode")} htmlFor="kod-kelas">
            <Input
              id="kod-kelas"
              className="text-center font-mono text-lg uppercase tracking-[0.2em]"
              placeholder={t("common.codeExample")}
              value={code}
              onChange={e => { setCode(e.target.value.toUpperCase()); setErr(null); }}
              required
              maxLength={16}
            />
          </Field>
        </div>
        <Button type="submit" disabled={busy} className="mt-5 w-full py-2">
          {busy ? t('participant.joining') : t('participant.joinClassButton')}
        </Button>
        {err && <Alert tone="danger" className="mt-3">{err}</Alert>}
        {ok && <Alert tone="success" className="mt-3">{ok}</Alert>}
      </Card>
    </form>
  );
}
export default function ParticipantJoin() {
  const { t } = useBahasa();
  return (<div className="min-h-screen bg-canvas flex items-center justify-center p-4"><Suspense fallback={<div className="card w-full max-w-sm">{t("common.loading")}</div>}><Inner/></Suspense></div>);
}
