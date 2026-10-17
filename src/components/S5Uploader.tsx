'use client';

import { useState, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';

export type S5UploadKind = 'avatar' | 'cover' | 'resource';

export interface S5UploaderProps {
  kind: S5UploadKind;
  currentUrl?: string | null;
  onUploaded: (publicUrl: string, info: { key: string; filename: string; contentType: string; sizeBytes: number }) => void;
  onClear?: () => void;
  accept?: string;
  label?: string;
  className?: string;
}

export default function S5Uploader({ kind, currentUrl, onUploaded, onClear, accept, label, className }: S5UploaderProps) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const defaultAccept = kind === 'resource' ? '.pdf,.zip,.docx,.xlsx,.pptx,.txt,.md' : 'image/jpeg,image/png,image/webp,image/gif,image/avif';
  const acceptAttr = accept || defaultAccept;
  const isImage = kind !== 'resource';

  async function handleFile(file: File) {
    setError(null); setBusy(true); setProgress(0);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess?.session?.access_token;
      if (!token) throw new Error('Not signed in');
      const presignRes = await fetch('/api/upload/presign', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ kind, filename: file.name, contentType: file.type || 'application/octet-stream', sizeBytes: file.size }) });
      const presign = await presignRes.json();
      if (!presignRes.ok) throw new Error(presign.error || 'Failed to get upload URL');
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', presign.uploadUrl);
        xhr.setRequestHeader('Content-Type', presign.contentType);
        xhr.upload.onprogress = (e) => { if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100)); };
        xhr.onload = () => { if (xhr.status >= 200 && xhr.status < 300) resolve(); else reject(new Error('Upload failed: ' + xhr.status)); };
        xhr.onerror = () => reject(new Error('Network error during upload'));
        xhr.send(file);
      });
      setProgress(100);
      onUploaded(presign.publicUrl, { key: presign.key, filename: file.name, contentType: presign.contentType, sizeBytes: file.size });
    } catch (e: any) {
      setError(e?.message || 'Upload failed');
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  return (
    <div className={className || ''}>
      {label && <div className='text-xs uppercase tracking-wide text-slate-500 mb-1'>{label}</div>}
      <div onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f && !busy) handleFile(f); }} className={`rounded-lg border-2 border-dashed transition-colors ${dragOver ? 'border-emerald-500 bg-emerald-50' : 'border-slate-300 bg-slate-50'} ${busy ? 'opacity-60 pointer-events-none' : 'hover:border-emerald-400 hover:bg-emerald-50/40'} p-4 flex flex-col items-center justify-center gap-2 cursor-pointer`} onClick={() => fileInputRef.current?.click()}>
        {isImage && currentUrl ? (
          <img src={currentUrl} alt='preview' className='max-h-48 rounded shadow-sm object-cover' />
        ) : currentUrl ? (
          <div className='text-sm text-slate-700 break-all'>{decodeURIComponent(currentUrl.split('/').pop() || 'file')}</div>
        ) : (
          <div className='text-3xl text-slate-400'>{isImage ? '🖼️' : '📎'}</div>
        )}
        <div className='text-sm text-slate-600'>{busy ? `Uploading… ${progress}%` : currentUrl ? 'Click or drop to replace' : 'Click or drop a file'}</div>
        {busy && (<div className='w-full max-w-xs h-1 bg-slate-200 rounded'><div className='h-full bg-emerald-500 rounded transition-all' style={{ width: `${progress}%` }} /></div>)}
        <input ref={fileInputRef} type='file' accept={acceptAttr} className='hidden' onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
      </div>
      {error && <div className='mt-2 text-sm text-rose-600'>{error}</div>}
      {currentUrl && onClear && !busy && (<button type='button' onClick={onClear} className='mt-2 text-xs text-slate-500 hover:text-rose-600 underline'>Remove</button>)}
    </div>
  );
}
