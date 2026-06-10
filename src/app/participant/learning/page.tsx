'use client';
import { PARTICIPANT_TABS } from "@/lib/participantTabs";
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
    <Shell tabs={PARTICIPANT_TABS}>
      <div className="max-w-3xl mx-auto p-6">
        <div className="flex items-center gap-3 mb-6">
          <span className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700"><BookOpen className="w-6 h-6" /></span>
          <h1 className="text-2xl font-bold text-slate-900">Learning Board</h1>
        </div>
        {loading ? (
          <div className="text-slate-500">Loading…</div>
        ) : classes.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
            <p className="text-slate-700">You haven&apos;t joined any class yet.</p>
            <Link href="/participant/join" className="mt-4 inline-flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold py-2.5 px-4 rounded-xl transition">Join a class <ArrowRight className="w-4 h-4" /></Link>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-slate-600">Pick a class to open its Learning Board.</p>
            <ul className="space-y-3">
              {classes.map((c: any) => (
                <li key={c.id}>
                  <Link href={`/participant/classes/${c.id}/learning-board`} className="flex items-center justify-between bg-white rounded-2xl shadow-sm border border-slate-100 p-5 hover:border-emerald-300 hover:bg-emerald-50/30 transition group">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 shrink-0"><BookOpen className="w-5 h-5" /></span>
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-900 truncate">{c.name}</div>
                        <div className="text-xs text-slate-500 truncate">Open the Learning Board for this class</div>
                      </div>
                    </div>
                    <ArrowRight className="w-5 h-5 text-emerald-600 group-hover:translate-x-1 transition" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Shell>
  );
}
