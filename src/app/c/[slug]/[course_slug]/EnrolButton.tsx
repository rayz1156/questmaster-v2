'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export function EnrolButton({ courseId, isFree, themeColor }: { courseId: string; isFree: boolean; themeColor: string }) {
  const router = useRouter();
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [enrolled, setEnrolled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setAuthed(!!user);
      if (user) {
        const { data } = await supabase.from('lms_enrollments').select('id').eq('user_id', user.id).eq('course_id', courseId).maybeSingle();
        setEnrolled(!!data);
      }
    })();
  }, [courseId]);

  async function handleClick() {
    if (!authed) { router.push(`/login?next=${encodeURIComponent(window.location.pathname)}`); return; }
    if (enrolled) { router.push(`/learn/${courseId}`); return; }
    if (!isFree) { setError('Paid checkout ships in Milestone 5.'); return; }
    setBusy(true); setError(null);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setBusy(false); return; }
    const { error: e } = await supabase.from('lms_enrollments').insert({ user_id: user.id, course_id: courseId, source: 'free' });
    setBusy(false);
    if (e) { setError(e.message); return; }
    router.push(`/learn/${courseId}`);
  }

  const label = enrolled ? 'Continue learning →' : !authed ? (isFree ? 'Enrol free' : 'Buy now') : isFree ? 'Enrol now' : 'Buy now';

  return (
    <div className="mt-4">
      <button onClick={handleClick} disabled={busy} className="w-full py-3 rounded-lg text-white font-semibold text-base hover:opacity-95 disabled:opacity-60 transition" style={{ background: themeColor }}>
        {busy ? 'Enrolling…' : label}
      </button>
      {error && <div className="mt-2 text-sm text-rose-600">{error}</div>}
    </div>
  );
}
