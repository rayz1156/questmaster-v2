"use client";

/**
 * Bendera UI akaun pendidik (KZ-D): ui_hide_encharge dan ui_hide_certificates
 * pada qm_profiles. Hanya menyembunyikan butang dan tab; laluan API dan alat
 * connector MCP tidak terjejas. Dibaca sekali bagi setiap sesi halaman.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type BenderaUi = { hideEncharge: boolean; hideCertificates: boolean };

const LALAI: BenderaUi = { hideEncharge: false, hideCertificates: false };
// Cache mengikut pengguna supaya log keluar/masuk dalam tab sama tidak
// memakai bendera pengguna lain.
const cache = new Map<string, Promise<BenderaUi>>();

async function bacaBendera(): Promise<BenderaUi> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return LALAI;
  const uid = session.user.id;
  let p = cache.get(uid);
  if (!p) {
    p = bacaBenderaPengguna(uid);
    cache.set(uid, p);
    p.catch(() => cache.delete(uid));
  }
  return p;
}

async function bacaBenderaPengguna(uid: string): Promise<BenderaUi> {
  try {
    const session = { user: { id: uid } };
    const { data } = await supabase
      .from("qm_profiles")
      .select("ui_hide_encharge, ui_hide_certificates")
      .eq("id", session.user.id)
      .maybeSingle();
    return {
      hideEncharge: data?.ui_hide_encharge === true,
      hideCertificates: data?.ui_hide_certificates === true,
    };
  } catch {
    return LALAI;
  }
}

export function useBenderaUi(): BenderaUi {
  const [b, setB] = useState<BenderaUi>(LALAI);
  useEffect(() => {
    let hidup = true;
    bacaBendera().then((v) => { if (hidup) setB(v); }).catch(() => undefined);
    return () => { hidup = false; };
  }, []);
  return b;
}
