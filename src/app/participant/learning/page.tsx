'use client';
import ParticipantShell from "@/components/ParticipantShell";
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Home, Compass, Trophy, User as UserIcon, Users, BookOpen, BarChart3, ArrowRight } from 'lucide-react';
import Shell from '@/components/Shell';
import { listEnrolledClasses } from '@/lib/data';
import { useSession } from '@/lib/session';


export default function ParticipantLearningHome() {
  const { user } = useSession('participant');
  const router = useRouter();
  const [classes, setClasses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string>('');

  useEffect(() => {
    if (!user) return;
    (async () => {
      const c = await listEnrolledClasses();
      const list = (c as any[]) || [];
      setClasses(list);
      if (list.length > 0) setActiveId(list[0].id);
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
      <div className="max-w-shell mx-auto px-6 py-10">
        <div className="max-w-2xl mb-8">
          <div className="eyebrow mb-1">Learning</div>
          <h1 className="page-title">Pick a class.</h1>
          <p className="page-subtitle">Each class keeps its own Learning Board.</p>
        </div>
        {loading ? (
          <div className="text-sm text-ink-muted">Loading…</div>
        ) : classes.length === 0 ? (
          <div className="max-w-md">
            <p className="text-sm text-ink-muted">You have not joined any class yet.</p>
            <Link href="/participant/join" className="btn-primary mt-4">Join a class</Link>
          </div>
        ) : (
          <div className="surface max-w-2xl">
            <ul className="divide-y divide-hairline">
              {classes.map((c: any) => (
                <li key={c.id}>
                  <Link href={`/participant/classes/${c.id}/learning-board`} className="flex items-center gap-4 px-5 py-4 hover:bg-[#FAFAFB]">
                    <span className="w-10 h-10 rounded-full bg-[#EAE6FC] text-brand-purple flex items-center justify-center shrink-0"><BookOpen className="w-5 h-5" /></span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-[15px] font-medium text-ink truncate">{c.name}</span>
                      <span className="block text-sm text-ink-muted mt-0.5">Open the Learning Board</span>
                    </span>
                    <ArrowRight className="w-4 h-4 text-ink-faint shrink-0" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </ParticipantShell>
  );
}
