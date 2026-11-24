"use client";

/**
 * Sepanduk kecil di /participant/home: minta peserta mengesahkan nama yang
 * dicetak pada sijil. Muncul HANYA jika certificate_name_confirmed_at masih
 * NULL dan ada kelas dengan templat sijil (RPC qm_certificate_classes_
 * needing_name). Pautan ke /participant/certificates tempat kad pengesahan.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { Award } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useBahasa } from "@/lib/i18n/BahasaProvider";

export default function CertificateNameBanner() {
  const { t } = useBahasa();
  const [tunjuk, setTunjuk] = useState(false);
  // KZ-A: notis bila pendidik mengemas kini nama profil peserta.
  const [notisNama, setNotisNama] = useState<string | null>(null);
  const [uid, setUid] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user || !alive) return;
      const { data: profil } = await supabase
        .from("qm_profiles")
        .select("certificate_name, certificate_name_confirmed_at, certificate_name_notice_at, certificate_name_notice_seen_at")
        .eq("id", session.user.id)
        .maybeSingle();
      if (!alive) return;
      setUid(session.user.id);
      if (profil?.certificate_name_notice_at && !profil?.certificate_name_notice_seen_at && profil?.certificate_name) {
        setNotisNama(profil.certificate_name);
      }
      if (profil?.certificate_name_confirmed_at) return;
      const { data: perlu } = await supabase.rpc("qm_certificate_classes_needing_name");
      if (alive) setTunjuk(!!perlu && perlu.length > 0);
    })().catch(() => {
      /* sepanduk kekal tersembunyi jika semakan gagal */
    });
    return () => {
      alive = false;
    };
  }, []);

  async function tutupNotis() {
    setNotisNama(null);
    if (!uid) return;
    await supabase
      .from("qm_profiles")
      .update({ certificate_name_notice_seen_at: new Date().toISOString() })
      .eq("id", uid);
  }

  if (notisNama) {
    return (
      <div className="mb-6 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
        <span className="text-sm text-slate-700 flex items-center gap-2">
          <Award className="w-4 h-4 text-brand-purple" />
          {t("banner.nameUpdatedByEducator", { nama: notisNama })}
        </span>
        <button type="button" onClick={tutupNotis} className="btn-quiet text-brand-purple">
          {t("banner.dismiss")}
        </button>
      </div>
    );
  }

  if (!tunjuk) return null;

  return (
    <div className="mb-6 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
      <span className="text-sm text-slate-700 flex items-center gap-2">
        <Award className="w-4 h-4 text-brand-purple" />
        {t("banner.confirmNameToPrint")}
      </span>
      <Link href="/participant/certificates" className="btn-quiet text-brand-purple">
        {t("banner.confirmName")}
      </Link>
    </div>
  );
}