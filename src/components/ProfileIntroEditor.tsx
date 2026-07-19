"use client";
import { useEffect, useRef, useState } from 'react';
import { Save, Image as ImageIcon, Trash2, Loader2 } from 'lucide-react';
import { getMyProfile, updateMyIntroDisplayName, type Profile } from '@/lib/data';

const MAX_IMAGE_BYTES = 15 * 1024 * 1024; // 15 MB

export default function ProfileIntroEditor() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [introName, setIntroName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const imageRef = useRef<HTMLInputElement | null>(null);

  async function reload() {
    const p = await getMyProfile();
    setProfile(p);
    setIntroName((p as any)?.intro_display_name || '');
  }
  useEffect(() => { reload(); }, []);

  const cardName = (profile as any)?.intro_display_name || profile?.display_name || '';
  const mediaType = (profile as any)?.intro_media_type as ('image'|'video'|null);
  const imageCode = (profile as any)?.intro_image_file_code as (string|null);
  const previewUrl =
    mediaType === 'image' && imageCode ? `/api/profile/image/${imageCode}` :
    '/default-intro-avatar.svg';
  const usingDefault = !mediaType;

  async function saveName() {
    setSavingName(true); setErr(null);
    try { await updateMyIntroDisplayName(introName); await reload(); }
    catch (e: any) { setErr(e?.message || 'Failed'); }
    finally { setSavingName(false); }
  }

  async function uploadImage(file: File) {
    if (file.size > MAX_IMAGE_BYTES) { setErr(`Image too large. Max ${MAX_IMAGE_BYTES/1024/1024} MB`); return; }
    setBusy(true); setErr(null); setProgress('Uploading image...');
    try {
      const fd = new FormData(); fd.append('file', file);
      const r = await fetch('/api/profile/intro/upload-image', { method: 'POST', body: fd, credentials: 'include' });
      if (!r.ok) throw new Error((await r.json().catch(()=>({}))).error || `HTTP ${r.status}`);
      await reload();
      setProgress('Done.');
      setTimeout(() => setProgress(null), 1500);
    } catch (e: any) { setErr(e?.message || 'Upload failed'); setProgress(null); }
    finally { setBusy(false); }
  }

  async function clearMedia() {
    setBusy(true); setErr(null); setProgress('Clearing...');
    try {
      const r = await fetch('/api/profile/intro/clear-media', { method: 'POST', credentials: 'include' });
      if (!r.ok) throw new Error((await r.json().catch(()=>({}))).error || `HTTP ${r.status}`);
      await reload();
      setProgress(null);
    } catch (e: any) { setErr(e?.message || 'Failed'); setProgress(null); }
    finally { setBusy(false); }
  }

  return (
    <div className="card mb-3">
      <div className="text-sm font-semibold mb-2">Intro card</div>
      <div className="text-xs text-gray-500 mb-3">This is exactly how you appear on every class intro board you join.</div>

      {/* Live preview */}
      <div className="flex gap-3 items-start mb-4">
        <div className="w-24 h-24 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewUrl} alt={cardName || 'intro'} className="w-full h-full object-cover" />
        </div>
        <div className="flex-1">
          <div className="text-xs text-gray-500">Card preview</div>
          <div className="text-sm font-semibold truncate">{cardName || '(no display name set)'}</div>
          {profile && (profile as any).bio && (
            <div className="text-xs text-gray-600 whitespace-pre-wrap break-words">{(profile as any).bio}</div>
          )}
          {usingDefault && <div className="text-[11px] text-gray-400 mt-1">Using default avatar</div>}
        </div>
      </div>

      {/* Display name on intro board */}
      <label className="text-xs text-gray-500">Display name on intro board <span className="text-gray-400">(leave blank to use your account username)</span></label>
      <input
        className="w-full border rounded-lg px-3 py-2 mt-1"
        maxLength={80}
        value={introName}
        onChange={(e)=>setIntroName(e.target.value)}
        placeholder={profile?.display_name || 'e.g. Cikgu Hariz'}
      />
      <div className="flex justify-end mt-2">
        <button onClick={saveName} disabled={savingName} className="px-3 py-2 rounded-xl bg-black text-white text-sm flex items-center gap-1 disabled:opacity-50">
          <Save className="w-4 h-4" />{savingName ? 'Saving...' : 'Save name'}
        </button>
      </div>

      <div className="border-t mt-4 pt-3">
        <div className="text-xs text-gray-500 mb-2">Photo</div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => imageRef.current?.click()}
            className="px-3 py-2 rounded-xl bg-white border text-sm flex items-center gap-1 disabled:opacity-50"
          ><ImageIcon className="w-4 h-4" />Upload photo</button>
          <input ref={imageRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImage(f); e.currentTarget.value = ''; }} />

          {!usingDefault && (
            <button
              type="button"
              disabled={busy}
              onClick={clearMedia}
              className="px-3 py-2 rounded-xl bg-white border text-sm flex items-center gap-1 text-red-600 disabled:opacity-50"
            ><Trash2 className="w-4 h-4" />Use default</button>
          )}
        </div>
        {progress && (
          <div className="text-xs text-gray-600 mt-2 flex items-center gap-1">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />{progress}
          </div>
        )}
        {err && <div className="text-xs text-red-600 mt-2">{err}</div>}
        <div className="text-[11px] text-gray-400 mt-2">Photos are stored on FileLu (≤ 15 MB).</div>
      </div>
    </div>
  );
}
