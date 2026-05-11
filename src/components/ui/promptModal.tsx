"use client";
import { createRoot, type Root } from 'react-dom/client';
import { useEffect, useRef, useState } from 'react';

type PromptOptions = {
  title: string;
  description?: string;
  initialValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  inputType?: 'text' | 'number';
};

type ConfirmOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'default';
};

function PromptModal({ opts, onDone }: { opts: PromptOptions; onDone: (v: string | null) => void }) {
  const [value, setValue] = useState(opts.initialValue ?? '');
  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    const t = setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select(); }, 30);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/40 px-4" onMouseDown={() => onDone(null)}>
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="text-base font-semibold text-slate-900">{opts.title}</div>
        {opts.description && <div className="mt-1 text-sm text-slate-500">{opts.description}</div>}
        <input
          ref={inputRef}
          type={opts.inputType ?? 'text'}
          value={value}
          placeholder={opts.placeholder}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); onDone(value); }
            if (e.key === 'Escape') { e.preventDefault(); onDone(null); }
          }}
          className="mt-3 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
        />
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={() => onDone(null)} className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100">{opts.cancelLabel ?? 'Cancel'}</button>
          <button type="button" onClick={() => onDone(value)} className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700">{opts.confirmLabel ?? 'OK'}</button>
        </div>
      </div>
    </div>
  );
}

function ConfirmModal({ opts, onDone }: { opts: ConfirmOptions; onDone: (ok: boolean) => void }) {
  const confirmClass = (opts.tone ?? 'default') === 'danger' ? 'bg-red-600 hover:bg-red-700' : 'bg-indigo-600 hover:bg-indigo-700';
  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/40 px-4" onMouseDown={() => onDone(false)}>
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="text-base font-semibold text-slate-900">{opts.title}</div>
        {opts.description && <div className="mt-1 text-sm text-slate-500">{opts.description}</div>}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={() => onDone(false)} className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100">{opts.cancelLabel ?? 'Cancel'}</button>
          <button type="button" onClick={() => onDone(true)} className={`rounded-lg ${confirmClass} px-4 py-1.5 text-sm font-semibold text-white`}>{opts.confirmLabel ?? 'Confirm'}</button>
        </div>
      </div>
    </div>
  );
}

function mount(): { root: Root; el: HTMLDivElement } {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = createRoot(el);
  return { root, el };
}

export function showPrompt(opts: PromptOptions): Promise<string | null> {
  if (typeof window === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const { root, el } = mount();
    const cleanup = () => { try { root.unmount(); } catch {} try { el.remove(); } catch {} };
    root.render(<PromptModal opts={opts} onDone={(v) => { cleanup(); resolve(v); }} />);
  });
}

export function showConfirm(opts: ConfirmOptions): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  return new Promise((resolve) => {
    const { root, el } = mount();
    const cleanup = () => { try { root.unmount(); } catch {} try { el.remove(); } catch {} };
    root.render(<ConfirmModal opts={opts} onDone={(v) => { cleanup(); resolve(v); }} />);
  });
}
