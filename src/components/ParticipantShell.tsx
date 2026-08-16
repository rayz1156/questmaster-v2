"use client";

import Shell from "@/components/Shell";
import { useParticipantTabs } from "@/lib/participantTabs";

/**
 * Shell untuk semua halaman peserta.
 *
 * Wujud supaya logik keterlihatan tab tinggal di SATU tempat. Hook dipanggil
 * di dalam komponen ini, bukan dalam setiap halaman, jadi halaman yang
 * mempunyai early return tidak berisiko mengubah susunan hook.
 */
export default function ParticipantShell({ children }: { children: React.ReactNode }) {
  const tabs = useParticipantTabs();
  return <Shell tabs={tabs}>{children}</Shell>;
}
