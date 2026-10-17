'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

type Review = { id: string; rating: number; review_text: string | null; created_at: string; reviewer_name: string };

async function authHeader() {
  const { data } = await supabase.auth.getSession();
  return (data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {}) as Record<string, string>;
}

function Stars({ value, onChange }: { value: number; onChange?: (n: number) => void }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(n => (
        <button key={n} type="button" onClick={() => onChange && onChange(n)} disabled={!onChange} className={`text-xl leading-none ${n <= value ? 'text-amber-500' : 'text-slate-300'} ${onChange ? 'hover:text-amber-600 cursor-pointer' : 'cursor-default'}`} aria-label={`${n} star${n>1?'s':''}`}>★</button>
      ))}
    </div>
  );
}

export default function ReviewsPanel({ courseId, canReview }: { courseId: string; canReview?: boolean }) {
  const [loading, setLoading] = useState(true);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [total, setTotal] = useState(0);
  const [average, setAverage] = useState(0);
  const [myRating, setMyRating] = useState(0);
  const [myText, setMyText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch(`/api/reviews/${courseId}`, { cache: 'no-store' });
      const j = await r.json();
      if (r.ok) { setReviews(j.reviews || []); setTotal(j.total || 0); setAverage(j.average || 0); }
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [courseId]);

  async function submitReview() {
    if (myRating < 1) { setError('Please pick a star rating'); return; }
    setSaving(true); setError(null); setSuccess(null);
    try {
      const r = await fetch(`/api/reviews/${courseId}`, { method: 'POST', headers: { 'content-type': 'application/json', ...(await authHeader()) }, body: JSON.stringify({ rating: myRating, review_text: myText }) });
      const j = await r.json();
      if (!r.ok) { setError(j.error || `HTTP ${r.status}`); return; }
      setSuccess(j.updated ? 'Review updated' : 'Thanks for your review!');
      setMyText(''); setMyRating(0);
      load();
      setTimeout(() => setSuccess(null), 3000);
    } catch (e: any) { setError(e?.message || 'Submit failed'); }
    finally { setSaving(false); }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-baseline gap-3">
        <div className="text-3xl font-bold text-slate-900">{average ? average.toFixed(1) : '—'}</div>
        <Stars value={Math.round(average)} />
        <div className="text-sm text-slate-500">{total} review{total !== 1 ? 's' : ''}</div>
      </div>

      {canReview && (
        <div className="border border-slate-200 rounded-xl p-4 bg-white">
          <div className="text-sm font-medium text-slate-900 mb-2">Leave a review</div>
          <Stars value={myRating} onChange={setMyRating} />
          <textarea value={myText} onChange={e => setMyText(e.target.value)} rows={3} placeholder="What did you think of this course? (optional)" className="mt-3 w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
          {error && <div className="mt-2 text-sm text-rose-700">{error}</div>}
          {success && <div className="mt-2 text-sm text-emerald-700">{success}</div>}
          <button onClick={submitReview} disabled={saving} className="mt-3 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">{saving ? 'Saving...' : 'Submit review'}</button>
        </div>
      )}

      {loading ? <div className="text-sm text-slate-500">Loading reviews...</div> : (
        reviews.length === 0 ? <div className="text-sm text-slate-500">No reviews yet.</div> : (
          <div className="space-y-3">
            {reviews.map(r => (
              <div key={r.id} className="border border-slate-200 rounded-xl p-4 bg-white">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-medium text-slate-900">{r.reviewer_name}</div>
                  <Stars value={r.rating} />
                </div>
                <div className="text-xs text-slate-500 mt-0.5">{new Date(r.created_at).toLocaleDateString()}</div>
                {r.review_text && <p className="mt-2 text-sm text-slate-700 whitespace-pre-wrap">{r.review_text}</p>}
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
