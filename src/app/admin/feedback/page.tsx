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
import { useBahasa } from '@/lib/i18n/BahasaProvider';
import { LOKAL } from '@/lib/i18n';
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
const STATUS_WARNA: Record<string, WarnaKit> = {
  open: 'yellow',
  in_review: 'blue',
  resolved: 'green',
  closed: 'gray',
};

export default function AdminFeedbackPage() {
  const { t, bahasa } = useBahasa();
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterType, setFilterType] = useState<string>('');

  // KZ-043: label paparan jenis diterjemah pada masa render; nilai teknikal
  // (bug/idea/question/other dalam DB) kekal.
  const labelJenis: Record<string, string> = {
    bug: t('admin.feedback.typeBug'),
    idea: t('admin.feedback.typeIdea'),
    question: t('admin.feedback.typeQuestion'),
    other: t('admin.feedback.typeOther'),
  };
  const labelStatus: Record<string, string> = {
    open: t('admin.feedback.statOpen'),
    in_review: t('admin.feedback.statInReview'),
    resolved: t('admin.feedback.statResolved'),
    closed: t('admin.feedback.statClosed'),
  };
  const labelTanda: Record<string, string> = {
    open: t('admin.feedback.markOpen'),
    in_review: t('admin.feedback.markInReview'),
    resolved: t('admin.feedback.markResolved'),
    closed: t('admin.feedback.markClosed'),
  };

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
      if (!res.ok) throw new Error(res.status === 403 ? t('admin.feedback.adminRequired') : t('admin.feedback.loadFailed'));
      const json = await res.json();
      setItems(json.items ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t('admin.feedback.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterType, t]);

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
      header: t('admin.feedback.colFeedback'),
      render: (it) => (
        <span className="min-w-0">
          <span className="block text-[13px] font-bold text-ink truncate">{it.subject}</span>
          <span className="block text-[12px] text-ink-faint truncate">
            {it.user_email ?? t('admin.feedback.anonymous')}{it.page_url ? ` · ${it.page_url}` : ''}
          </span>
        </span>
      ),
    },
    {
      key: 'jenis',
      header: t('admin.feedback.colType'),
      render: (it) => (
        <Badge variant="dim" warna="purple">
          {labelJenis[it.type] ?? it.type}
        </Badge>
      ),
    },
    {
      key: 'status',
      header: t('admin.feedback.colStatus'),
      render: (it) => (
        <Badge variant="dim" warna={STATUS_WARNA[it.status] ?? 'gray'}>
          {it.status}
        </Badge>
      ),
    },
    {
      key: 'masa',
      header: t('admin.feedback.colReceived'),
      hideOnMobile: true,
      render: (it) => (
        <span className="text-[13px] text-ink-faint whitespace-nowrap">
          {new Date(it.created_at).toLocaleString(LOKAL[bahasa])}
        </span>
      ),
    },
  ];

  return (
    <AdminShell>
      <PageHead
        title={t('admin.feedback.title')}
        description={t('admin.feedback.description')}
        secondaryActions={[
          { label: t('common.refresh'), icon: <RefreshCw className="w-4 h-4" />, onSelect: load },
        ]}
      />

      {/* Kiraan status sebenar; tiada data perubahan, jadi tiada anak panah. */}
      <Card className="mb-5">
        <StatGroup
          stats={STATUS_OPTIONS.map((s) => ({
            label: labelStatus[s],
            value: counts[s] ?? 0,
          }))}
        />
      </Card>

      {loading && <p className="text-[14px] text-ink-faint mb-4">{t('common.loading')}</p>}
      {error && (
        <Alert tone="danger" className="mb-4">
          {error}
        </Alert>
      )}

      {!loading && (
        <DataTable
          label={t('admin.feedback.title')}
          columns={lajur}
          rows={items}
          rowKey={(it) => it.id}
          menuItems={(it) =>
            STATUS_OPTIONS.map((s) => ({
              label: labelTanda[s],
              onSelect: () => updateStatus(it.id, s),
              disabled: s === it.status,
            }))
          }
          menuLabel={t('admin.feedback.actionsLabel')}
          renderRowExtra={(it) => (
            <p className="px-4 pb-3 text-[13px] text-ink-muted whitespace-pre-wrap">{it.message}</p>
          )}
          head={
            <>
              <Select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                aria-label={t('admin.feedback.filterStatusAria')}
                className="w-auto"
              >
                <option value="">{t('admin.feedback.allStatuses')}</option>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
              <Select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                aria-label={t('admin.feedback.filterTypeAria')}
                className="w-auto"
              >
                <option value="">{t('admin.feedback.allTypes')}</option>
                {Object.entries(labelJenis).map(([k, v]) => (
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
                title={t('admin.feedback.emptyTitle')}
                text={t('admin.feedback.emptyText')}
              />
            ) : null
          }
        />
      )}
    </AdminShell>
  );
}
