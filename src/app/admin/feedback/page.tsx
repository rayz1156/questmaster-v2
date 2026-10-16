'use client';

// Feedback ruang kerja admin, rupa v3 (KZ-024). Senarai maklum balas
// pengguna guna DataTable kit: penapis status/jenis di kepala kad,
// tindakan tukar status melalui menu "..." (fungsi updateStatus sama),
// mesej penuh dipapar sebagai baris tambahan di bawah setiap baris.
// Panggilan /api/admin/feedback, penapis dan kiraan tidak berubah.

import { useEffect, useState, useCallback } from 'react';
import { MessageSquare, RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import AdminShell from '@/components/admin/AdminShell';
import {
  Alert,
  Badge,
  Card,
  DataTable,
  EmptyState,
  PageHead,
  Select,
  StatGroup,
  type DataColumn,
  type WarnaKit,
} from '@/components/ui';

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
const STATUS_WARNA: Record<string, WarnaKit> = {
  open: 'yellow',
  in_review: 'blue',
  resolved: 'green',
  closed: 'gray',
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
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = {};
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
      const res = await fetch(`/api/admin/feedback?${params.toString()}`, { headers });
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
    const { data: { session } } = await supabase.auth.getSession();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
    const res = await fetch('/api/admin/feedback', {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ id, status }),
    });
    if (res.ok) {
      setItems(prev => prev.map(it => it.id === id ? { ...it, status } : it));
    }
  }

  const counts = items.reduce((acc, it) => { acc[it.status] = (acc[it.status] ?? 0) + 1; return acc; }, {} as Record<string, number>);

  const lajur: DataColumn<FeedbackItem>[] = [
    {
      key: 'subjek',
      header: 'Feedback',
      render: (it) => (
        <span className="min-w-0">
          <span className="block text-[13px] font-bold text-ink truncate">{it.subject}</span>
          <span className="block text-[12px] text-ink-faint truncate">
            {it.user_email ?? 'anonymous'}{it.page_url ? ` · ${it.page_url}` : ''}
          </span>
        </span>
      ),
    },
    {
      key: 'jenis',
      header: 'Type',
      render: (it) => (
        <Badge variant="dim" warna="purple">
          {TYPE_LABELS[it.type] ?? it.type}
        </Badge>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (it) => (
        <Badge variant="dim" warna={STATUS_WARNA[it.status] ?? 'gray'}>
          {it.status}
        </Badge>
      ),
    },
    {
      key: 'masa',
      header: 'Received',
      hideOnMobile: true,
      render: (it) => (
        <span className="text-[13px] text-ink-faint whitespace-nowrap">
          {new Date(it.created_at).toLocaleString()}
        </span>
      ),
    },
  ];

  return (
    <AdminShell>
      <PageHead
        title="Feedback"
        description="Submissions from the /help page."
        secondaryActions={[
          { label: 'Refresh', icon: <RefreshCw className="w-4 h-4" />, onSelect: load },
        ]}
      />

      {/* Kiraan status sebenar; tiada data perubahan, jadi tiada anak panah. */}
      <Card className="mb-5">
        <StatGroup
          stats={STATUS_OPTIONS.map((s) => ({
            label: s === 'in_review' ? 'In review' : s.charAt(0).toUpperCase() + s.slice(1),
            value: counts[s] ?? 0,
          }))}
        />
      </Card>

      {loading && <p className="text-[14px] text-ink-faint mb-4">Loading…</p>}
      {error && (
        <Alert tone="danger" className="mb-4">
          {error}
        </Alert>
      )}

      {!loading && (
        <DataTable
          label="Feedback"
          columns={lajur}
          rows={items}
          rowKey={(it) => it.id}
          menuItems={(it) =>
            STATUS_OPTIONS.map((s) => ({
              label: `Mark ${s.replace('_', ' ')}`,
              onSelect: () => updateStatus(it.id, s),
              disabled: s === it.status,
            }))
          }
          menuLabel="Feedback actions"
          renderRowExtra={(it) => (
            <p className="px-4 pb-3 text-[13px] text-ink-muted whitespace-pre-wrap">{it.message}</p>
          )}
          head={
            <>
              <Select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                aria-label="Filter by status"
                className="w-auto"
              >
                <option value="">All statuses</option>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
              <Select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                aria-label="Filter by type"
                className="w-auto"
              >
                <option value="">All types</option>
                {Object.entries(TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </>
          }
          empty={
            !error ? (
              <EmptyState
                icon={<MessageSquare className="w-6 h-6" />}
                title="No feedback yet"
                text="Submissions from the /help page appear here."
              />
            ) : null
          }
        />
      )}
    </AdminShell>
  );
}
