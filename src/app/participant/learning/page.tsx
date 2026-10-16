'use client';
/**
 * Learning peserta, rupa v3 KZ-023.
 *
 * Senarai kelas sebagai TileRow dalam Card. Logik data dan alihan
 * automatik (satu kelas terus ke Learning Board kelas itu) tidak
 * berubah daripada versi sebelum KZ-023.
 */
import ParticipantShell from "@/components/ParticipantShell";
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, BookOpen, GraduationCap } from 'lucide-react';
import { listEnrolledClasses } from '@/lib/data';
import { useSession } from '@/lib/session';
import {
  Card,
  CardHead,
  EmptyState,
  PageHead,
  TileRow,
} from "@/components/ui";


export default function ParticipantLearningHome() {
  const { user } = useSession('participant');
  const router = useRouter();
  const [classes, setClasses] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const c = await listEnrolledClasses();
      const list = (c as { id: string; name: string }[]) || [];
      setClasses(list);
      setLoading(false);
    })();
  }, [user]);

  // If exactly one class, redirect straight to its learning board
  useEffect(() => {
    if (!loading && classes.length === 1) {
      router.replace(`/participant/classes/${classes[0].id}/learning-board`);
    }
  }, [loading, classes, router]);

  return (
    <ParticipantShell>
      <PageHead
        title="Pick a class."
        description="Each class keeps its own Learning Board."
      />

      {loading ? (
        <p className="text-[14px] text-ink-muted">Loading…</p>
      ) : classes.length === 0 ? (
        <div className="bg-white rounded-[4px] shadow-card">
          <EmptyState
            icon={<BookOpen className="w-6 h-6" />}
            title="You have not joined any class yet."
            actionLabel="Join a class"
            href="/participant/join"
          />
        </div>
      ) : (
        <Card padat className="max-w-2xl">
          <CardHead
            title="Your classes"
            subtitle="Open the Learning Board of any of your classes."
            right={<GraduationCap className="w-5 h-5 text-ink-faint" aria-hidden="true" />}
          />
          <div className="border-t border-kz-line">
            {classes.map((c, i) => (
              <div key={c.id} className={i > 0 ? "border-t border-kz-line" : ""}>
                <Link href={`/participant/classes/${c.id}/learning-board`}>
                  <TileRow
                    title={c.name}
                    subtitle="Open the Learning Board"
                    value={<ArrowRight className="w-4 h-4 text-ink-faint" aria-hidden="true" />}
                    index={i}
                  />
                </Link>
              </div>
            ))}
          </div>
        </Card>
      )}
    </ParticipantShell>
  );
}
