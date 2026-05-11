'use client';

import { useEffect, useState, useCallback } from 'react';

type FeedbackItem = {
  id: string;
  user_email: string | null;
  type: string;
  subject: string;
  message: string;
  page_url: string | null;
  status: string;
  created_at: string;
};

const STATUS_OPTIONS = ['open', 'in_review', 'resolved', 'closed'] as const;
const TYPE_LABELS: Record<string, string> = { bug: 'Bug', idea: 'Idea', question: 'Question', other: 'Other' };
const STATUS_COLORS: Record<string, string> = {
  open: 'bg-amber-100 text-amber-700',
  in_review: 'bg-blue-100 text-blue-700',
  resolved: 'bg-emerald-100 text-emerald-700',
  closed: 'bg-gray-100 text-gray-600',
};

export default function AdminFeedbackPage() {
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterType, setFilterType] = useState<string>('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filterStatus) params.set('status', filterStatus);
      if (filterType) params.set('type', filterType);
      const res = await fetch(`/api/admin/feedback?${params.toString()}`, { credentials: 'include' });
      if (!res.ok) throw new Error(res.status === 403 ? 'Admin access required.' : 'Failed to load feedback.');
      const json = await res.json();
      setItems(json.items ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load feedback.');
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterType]);

  useEffect(() => { load(); }, [load]);

  async function updateStatus(id: string, status: string) {
    const res = await fetch('/api/admin/feedback', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ id, status }),
    });
    if (res.ok) {
      setItems(prev => prev.map(it => it.id === id ? { ...it, status } : it));
    }
  }

  const counts = items.reduce((acc, it) => { acc[it.status] = (acc[it.status] ?? 0) + 1; return acc; }, {} as Record<string, number>);

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Feedback Inbox</h1>
          <p className="text-sm text-gray-500">Submissions from the /help page.</p>
        </div>
        <button onClick={load} className="px-3 py-1.5 text-sm rounded-md border bg-white hover:bg-gray-50">Refresh</button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {STATUS_OPTIONS.map(s => (
          <div key={s} className="rounded-lg border bg-white p-3">
            <div className="text-xs uppercase tracking-wide text-gray-500">{s.replace('_', ' ')}</div>
            <div className="text-2xl font-bold mt-1">{counts[s] ?? 0}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="px-3 py-1.5 text-sm rounded-md border bg-white">
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filterType} onChange={e => setFilterType(e.target.value)} className="px-3 py-1.5 text-sm rounded-md border bg-white">
          <option value="">All types</option>
          {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {loading && <div className="text-sm text-gray-500">Loading…</div>}
      {error && <div className="text-sm text-red-600">{error}</div>}

      <div className="space-y-3">
        {items.map(item => (
          <div key={item.id} className="rounded-lg border bg-white p-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">{TYPE_LABELS[item.type] ?? item.type}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[item.status] ?? 'bg-gray-100 text-gray-600'}`}>{item.status}</span>
                  <span className="text-xs text-gray-500">{new Date(item.created_at).toLocaleString()}</span>
                </div>
                <div className="font-semibold">{item.subject}</div>
                <div className="text-xs text-gray-500 mt-0.5">{item.user_email ?? 'anonymous'} {item.page_url ? `• ${item.page_url}` : ''}</div>
                <p className="text-sm text-gray-700 mt-2 whitespace-pre-wrap">{item.message}</p>
              </div>
              <select value={item.status} onChange={e => updateStatus(item.id, e.target.value)} className="text-xs px-2 py-1 rounded border bg-white">
                {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
        ))}
        {!loading && items.length === 0 && !error && (
          <div className="text-center text-sm text-gray-500 py-12">No feedback yet.</div>
        )}
      </div>
    </div>
  );
}
