"use client";

export const dynamic = "force-dynamic";
/**
 * Jemputan pendidik bersama, rupa v3 KZ-022.
 *
 * Borang terima guna Card + Field + Input + Button; senarai jemputan
 * tergantung guna DataTable kit dengan penomboran pelanggan. Fungsi
 * terima jemputan, muat semula dan pengalihan tidak berubah.
 */
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Shell from "@/components/Shell";
import { EDU_TABS } from '@/lib/eduTabs';
import { Mail, Check } from "lucide-react";
import {
  acceptClassEducatorInviteByCode,
  listMyClassEducatorInvites,
} from "@/lib/data";
import type { MyClassEducatorInvite } from "@/lib/types";
import {
  Button,
  Card,
  CardHead,
  DataTable,
  Field,
  Input,
  PageHead,
  type DataColumn,
} from "@/components/ui";
import { useBahasa } from "@/lib/i18n/BahasaProvider";
import { LOKAL } from "@/lib/i18n";

function EducatorInvitesPageInner() {
  const router = useRouter();
  const { t, bahasa } = useBahasa();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [invites, setInvites] = useState<MyClassEducatorInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [halaman, setHalaman] = useState(1);

  async function reload() {
    try {
      const list = await listMyClassEducatorInvites();
      setInvites(list);
    } catch (err: unknown) {
      setMsg({ type: "err", text: err instanceof Error ? err.message : t('educator.invites.loadFailed') });
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const search = useSearchParams();
  useEffect(() => {
    const c = (search?.get("code") || "").trim().toUpperCase();
    if (c) setCode(c);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function accept(c: string) {
    if (!c.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      const classId = await acceptClassEducatorInviteByCode(c.trim());
      setMsg({ type: "ok", text: t('educator.invites.accepted') });
      setTimeout(() => router.push(`/educator/classes/${classId}`), 600);
    } catch (err: unknown) {
      setMsg({ type: "err", text: err instanceof Error ? err.message : t('educator.invites.acceptFailed') });
    } finally {
      setBusy(false);
    }
  }

  const lajur: DataColumn<MyClassEducatorInvite>[] = [
    {
      key: "class",
      header: t('educator.invites.colClass'),
      render: (i) => (
        <span className="flex items-center gap-3 py-3">
          <span
            aria-hidden="true"
            className="h-10 w-10 shrink-0 rounded-[4px]"
            style={{ backgroundColor: i.class_color || "#6366f1" }}
          />
          <span className="min-w-0">
            <span className="block text-[13px] font-bold text-ink truncate">{i.class_name}</span>
            <span className="block text-[12px] text-ink-faint truncate">
              {t('educator.invites.invitedBy', { nama: i.inviter_name || t('educator.classes.anotherEducator') })}
            </span>
          </span>
        </span>
      ),
    },
    {
      key: "expires",
      header: t('educator.invites.colExpires'),
      hideOnMobile: true,
      render: (i) => (
        <span className="text-[13px] text-ink-faint">
          {new Date(i.expires_at).toLocaleDateString(LOKAL[bahasa])}
        </span>
      ),
    },
    {
      key: "code",
      header: t('educator.invites.colCode'),
      render: (i) => (
        <code className="font-mono text-[12px] bg-canvas border border-hairline rounded-[4px] px-2 py-1 text-ink-muted">
          {i.code}
        </code>
      ),
    },
    {
      key: "aksi",
      header: "",
      className: "text-right",
      render: (i) => (
        <Button size="sm" disabled={busy} onClick={() => accept(i.code)}>
          <Check className="w-4 h-4" /> {t('educator.invites.accept')}
        </Button>
      ),
    },
  ];

  return (
    <Shell tabs={EDU_TABS}>
      <div className="flex items-center gap-2 mb-3">
        <Link href="/educator/classes" className="text-sm text-ink-faint hover:text-ink transition">← {t('educator.invites.backToClasses')}</Link>
      </div>

      <PageHead
        title={t('educator.invites.title')}
        description={t('educator.invites.desc')}
      />

      <Card className="mb-4">
        <CardHead
          title={t('educator.invites.cardTitle')}
          subtitle={t('educator.invites.cardSubtitle')}
        />
        <form
          onSubmit={(e) => {
            e.preventDefault();
            accept(code);
          }}
          className="flex flex-wrap items-end gap-3 mt-4"
        >
          <Field label={t('educator.invites.codeLabel')} htmlFor="kod-jemputan" className="flex-1 min-w-[220px]">
            <Input
              id="kod-jemputan"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder={t('educator.invites.codePlaceholder')}
              className="font-mono uppercase tracking-wider"
              maxLength={12}
              autoFocus
            />
          </Field>
          <Button type="submit" disabled={busy || !code.trim()}>
            <Check className="w-4 h-4" /> {t('educator.invites.accept')}
          </Button>
        </form>
        {msg && (
          <div className={"text-xs mt-2 " + (msg.type === "ok" ? "text-kz-up" : "text-kz-down")}>{msg.text}</div>
        )}
      </Card>

      <CardHead
        title={t('educator.invites.pendingTitle', { n: invites.length })}
        subtitle={t('educator.invites.pendingSubtitle')}
        className="mb-3"
      />
      {loading ? (
        <p className="text-sm text-ink-muted">{t('common.loadingDots')}</p>
      ) : (
        <DataTable
          label={t('educator.invites.tableLabel')}
          columns={lajur}
          rows={invites}
          rowKey={(i) => i.id}
          halaman={halaman}
          saizHalaman={10}
          onHalaman={setHalaman}
          empty={
            <div className="py-8 text-center">
              <Mail className="w-6 h-6 mx-auto mb-2 text-ink-faint" aria-hidden="true" />
              <p className="text-[14px] text-ink-faint">{t('educator.invites.empty')}</p>
            </div>
          }
        />
      )}
    </Shell>
  );
}

export default function EducatorInvitesPage() {
  return (
    <Suspense fallback={null}>
      <EducatorInvitesPageInner />
    </Suspense>
  );
}