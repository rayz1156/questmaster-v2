'use client';
import dynamic from 'next/dynamic';
import { useRef } from 'react';
import '@uiw/react-md-editor/markdown-editor.css';
import '@uiw/react-markdown-preview/markdown.css';

const MDEditor = dynamic(() => import('@uiw/react-md-editor'), { ssr: false });

export function MdEditor({ value, onChange, height = 320 }: { value: string; onChange: (v: string) => void; height?: number }) {
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Allow the editor's own shortcuts (Ctrl+B/I/etc.) to work inside the textarea,
  // but prevent globally conflicting shortcuts (Ctrl+S = save page, Ctrl+P = print)
  // from bubbling to the browser. We do this in capture phase only when focus is
  // inside this editor.
  const onKeyDownCapture = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && (k === 's' || k === 'p')) {
      // Block browser save/print while editing. Fire a blur on the textarea so the
      // app's onBlur autosave path can run.
      const active = document.activeElement as HTMLElement | null;
      if (active && wrapRef.current && wrapRef.current.contains(active)) {
        e.preventDefault();
        e.stopPropagation();
        active.blur();
      }
    }
  };

  return (
    <div
      ref={wrapRef}
      data-color-mode="light"
      className="rounded-lg overflow-hidden border border-slate-200"
      onKeyDownCapture={onKeyDownCapture}
    >
      <MDEditor value={value} onChange={(v) => onChange(v ?? '')} height={height} preview="edit" />
    </div>
  );
}
