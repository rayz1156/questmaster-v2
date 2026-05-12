'use client';

import React, { createContext, useCallback, useContext, useState } from 'react';
import { ConfirmDialog } from './PromptDialog';

export type ConfirmOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'default';
};

type Pending = ConfirmOptions & { resolve: (ok: boolean) => void };

const Ctx = createContext<((opts: ConfirmOptions) => Promise<boolean>) | null>(null);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);

  const confirm = useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setPending({ ...opts, resolve });
    });
  }, []);

  const close = (ok: boolean) => {
    if (pending) {
      pending.resolve(ok);
      setPending(null);
    }
  };

  return (
    <Ctx.Provider value={confirm}>
      {children}
      <ConfirmDialog
        open={!!pending}
        title={pending?.title ?? ''}
        description={pending?.description}
        confirmLabel={pending?.confirmLabel ?? 'Confirm'}
        cancelLabel={pending?.cancelLabel ?? 'Cancel'}
        tone={pending?.tone ?? 'default'}
        onConfirm={() => close(true)}
        onCancel={() => close(false)}
      />
    </Ctx.Provider>
  );
}

export function useConfirm() {
  const fn = useContext(Ctx);
  if (!fn) {
    // Fallback to native confirm if provider missing (defensive; should not happen in app).
    return async (opts: ConfirmOptions) => {
      if (typeof window === 'undefined') return false;
      const msg = opts.description ? `${opts.title}\n\n${opts.description}` : opts.title;
      return window.confirm(msg);
    };
  }
  return fn;
}
