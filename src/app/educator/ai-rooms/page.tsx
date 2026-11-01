"use client";
/**
 * /educator/ai-rooms: pilihan kelas untuk AI Chatroom (KZ-033).
 *
 * Tab bar sisi "AI Chatroom" (src/lib/eduTabs.tsx) menunjuk ke sini.
 * Bilik itu sendiri sentiasa milik satu kelas, jadi halaman ini cuma
 * menyenaraikan kelas yang diajar dan menunjukkan bilik mana yang
 * sudah ada, kemudian pautan ke /educator/classes/[id]/ai-rooms.
 */
import { useEffect, useState } from "react";
import { Bot, ChevronRight } from "lucide-react";
import Shell from "@/components/Shell";
import { EDU_TABS } from "@/lib/eduTabs";
import { listMyClasses, type Klass } from "@/lib/data";
import { Alert, Card, CardHead, EmptyState, PageHead } from "@/components/ui";

export default function SenaraiKelasBilikAi() {
  const [kelas, setKelas] = useState<Klass[]>([]);
  const [err, setErr] = useState("");
  const [sedia, setSedia] = useState(false);

  useEffect(() => {
    let hidup = true;
    const muat = async () => {
      try {
        const senarai = await listMyClasses();
        if (!hidup) return;
        setKelas(senarai);
      } catch {
        if (hidup) setErr("Senarai kelas tidak dapat dibaca.");
      } finally {
        if (hidup) setSedia(true);
      }
    };
    void muat();
    return () => {
      hidup = false;
    };
  }, []);

  return (
    <Shell tabs={EDU_TABS}>
      <div className="max-w-4xl mx-auto">
        <PageHead
          crumb="Teaching"
          name="AI Chatroom"
          description="Sembang kelas masa nyata dan tanya AI dalam chatroom yang sama."
        />
        <div className="mt-6">
          {err ? (
            <Alert tone="danger" className="mb-4">
              {err}
            </Alert>
          ) : null}
          {sedia && kelas.length === 0 && !err ? (
            <Card>
              <EmptyState
                icon={<Bot className="w-6 h-6" />}
                title="Tiada kelas lagi"
                text="Cipta kelas dahulu, kemudian buka AI Chatroom dalam kelas itu."
              />
            </Card>
          ) : null}
          {kelas.length > 0 ? (
            <Card padat>
              <CardHead
                title="Pilih kelas"
                subtitle="AI Chatroom wujud dalam satu kelas pada satu masa."
                className="px-6 pt-6 pb-4"
              />
              <div className="divide-y divide-hairline">
                {kelas.map((k) => (
                  <a
                    key={String(k.id)}
                    href={`/educator/classes/${k.id}/ai-rooms`}
                    className="flex items-center justify-between gap-4 px-6 py-4 hover:bg-canvas transition"
                  >
                    <p className="text-[14px] font-bold text-ink truncate">{String((k as { name?: string }).name ?? "")}</p>
                    <ChevronRight className="w-4 h-4 text-ink-faint shrink-0" />
                  </a>
                ))}
              </div>
            </Card>
          ) : null}
        </div>
      </div>
    </Shell>
  );
}