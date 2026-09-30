"use client";

/**
 * Panel Insights kelas (bahagian A hingga F tiket V2-014b): muat
 * /api/classes/[id]/insights dengan Bearer dan papar pulse, perhatian,
 * agihan, bahagian susar, progres dan pasukan mengikut urutan itu.
 * Dialog eksport (G) dikawal oleh kepala halaman, bukan panel ini.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { InsightsKelas } from "@/lib/insightsKelas";
import PulseKelas from "@/components/insights/PulseKelas";
import Perhatian from "@/components/insights/Perhatian";
import Agihan from "@/components/insights/Agihan";
import Susar from "@/components/insights/Susar";
import Progres from "@/components/insights/Progres";
import Pasukan from "@/components/insights/Pasukan";

/** Rangka kelabu semasa memuat: bentuk halaman kekal, tiada lompatan. */
function Rangka() {
  return (
    <div className="space-y-4" aria-label="Loading insights">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="card p-5">
            <div className="h-8 w-2/3 rounded-lg bg-[#EDEEF2] animate-pulse" />
            <div className="h-4 w-1/2 rounded bg-[#EDEEF2] animate-pulse mt-3" />
          </div>
        ))}
      </div>
      <div className="surface p-5 space-y-3">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-10 rounded-xl bg-[#EDEEF2] animate-pulse" />
        ))}
      </div>
      <div className="surface p-5">
        <div className="h-48 rounded-xl bg-[#EDEEF2] animate-pulse" />
      </div>
    </div>
  );
}

export default function PanelInsights({ classId }: { classId: string }) {
  const [data, setData] = useState<InsightsKelas | null>(null);
  const [muat, setMuat] = useState(true);
  const [tiadaAkses, setTiadaAkses] = useState(false);
  const [ralat, setRalat] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setMuat(true);
    setRalat(null);
    setTiadaAkses(false);
    setData(null);
    (async () => {
      try {
        const { data: ses } = await supabase.auth.getSession();
        const res = await fetch(`/api/classes/${classId}/insights`, {
          headers: ses.session ? { Authorization: `Bearer ${ses.session.access_token}` } : {},
          cache: "no-store",
        });
        if (!alive) return;
        if (res.status === 403) {
          setTiadaAkses(true);
          return;
        }
        const j = await res.json().catch(() => null);
        if (!res.ok) {
          setRalat(j?.error || "Failed to load insights.");
          return;
        }
        setData(j.data as InsightsKelas);
      } catch {
        if (alive) setRalat("Failed to load insights.");
      } finally {
        if (alive) setMuat(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [classId]);

  if (muat) return <Rangka />;

  if (tiadaAkses) {
    return (
      <div className="surface p-5">
        <p className="text-sm text-ink-muted">
          You don&apos;t have access to this class&apos;s insights.
        </p>
      </div>
    );
  }

  if (ralat) {
    return (
      <div className="text-sm text-red-600" role="alert">
        {ralat}
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-4">
      <PulseKelas pulse={data.pulse} />
      <Perhatian students={data.students} classId={classId} jumlahAhli={data.pulse.members} />
      <Agihan agihan={data.distribution} />
      <Susar questions={data.hard_questions} challenges={data.hard_challenges} />
      <Progres students={data.students} />
      <Pasukan teams={data.teams} students={data.students} />
    </div>
  );
}