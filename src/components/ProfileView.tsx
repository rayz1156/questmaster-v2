"use client";
import React, { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  getMyProfile,
  updateMyBio,
  updateMyEmail,
  updateMyPassword,
  updateMyDisplayName,
  updateMyIntroDisplayName,
  updateMyUsername,
  softDeleteMyAccount,
} from "@/lib/data";
import type { Profile } from "@/lib/types";
import { Save, Eye, AlertTriangle, Trash2, Image as ImageIcon, Video, User as UserIcon, Lock, Mail } from "lucide-react";

async function authHeaders(extra: Record<string, string> = {}): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const h: Record<string, string> = { ...extra };
  if (token) h["Authorization"] = `Bearer ${token}`;
  return h;
}

function Section({ title, subtitle, children, className = "" }: { title: string; subtitle?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded-2xl border border-gray-200 p-6 shadow-sm ${className}`}>
      <div className="mb-5">
        <h2 className="text-lg font-bold text-gray-900">{title}</h2>
        {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function PrimaryButton({ children, onClick, disabled, type = "button", variant = "black" }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; type?: "button" | "submit"; variant?: "black" | "red" }) {
  const cls = variant === "red"
    ? "bg-red-600 hover:bg-red-700 text-white"
    : "bg-black hover:bg-gray-800 text-white";
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      className={`${cls} px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed`}>{children}</button>
  );
}

function IntroCardPreview({ name, bio, mediaType, imageUrl, videoThumb }: { name: string; bio: string; mediaType: "image" | "video" | null; imageUrl: string | null; videoThumb: string | null }) {
  const usingDefault = !imageUrl && !videoThumb;
  return (
    <div className="w-full max-w-sm mx-auto rounded-2xl border border-gray-200 overflow-hidden bg-white">
      <div className="relative h-48 bg-gradient-to-br from-purple-500 via-indigo-500 to-blue-500 flex items-center justify-center">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt="intro" className="absolute inset-0 w-full h-full object-cover" />
        ) : videoThumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={videoThumb} alt="intro video" className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src="/default-intro-avatar.svg" alt="default avatar" className="w-28 h-28" />
        )}
      </div>
      <div className="p-4 text-center">
        <div className="font-bold text-gray-900 text-lg">{name || "Your name"}</div>
        {bio && (
          <>
            <div className="mt-3 mb-2 h-px bg-gray-200" />
            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{bio}</p>
          </>
        )}
        {usingDefault && (
          <div className="mt-3 text-xs text-gray-400 flex items-center justify-center gap-1">
            <UserIcon className="w-3.5 h-3.5" /> Using default avatar
          </div>
        )}
      </div>
    </div>
  );
}

export default function ProfileView({ role }: { role: "educator" | "participant" }) {
  const router = useRouter();
  const [p, setP] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  // Intro card local state
  const [introName, setIntroName] = useState("");
  const [bio, setBio] = useState("");
  const [introSaving, setIntroSaving] = useState(false);
  const [mediaType, setMediaType] = useState<"image" | "video" | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [videoThumb, setVideoThumb] = useState<string | null>(null);
  const [mediaBusy, setMediaBusy] = useState(false);
  const [mediaProgress, setMediaProgress] = useState(0);
  const imgInputRef = useRef<HTMLInputElement>(null);
  const vidInputRef = useRef<HTMLInputElement>(null);
  // Account local state
  const [username, setUsername] = useState("");
  const [usernameSaving, setUsernameSaving] = useState(false);
  const [email, setEmail] = useState("");
  const [emailSaving, setEmailSaving] = useState(false);
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  // Danger zone
  const [showDel, setShowDel] = useState(false);
  const [delText, setDelText] = useState("");
  const [delBusy, setDelBusy] = useState(false);

  function flash(kind: "ok" | "err", text: string) {
    setMsg({ kind, text });
    setTimeout(() => setMsg(null), 4000);
  }

  function refreshFromProfile(pr: Profile) {
    setP(pr);
    setIntroName((pr.intro_display_name as any) || "");
    setBio((pr.bio as any) || "");
    const mt = (pr as any).intro_media_type as "image" | "video" | null;
    setMediaType(mt || null);
    if (mt === "image" && (pr as any).intro_image_file_code) {
      setImageUrl(`/api/profile/image/${(pr as any).intro_image_file_code}`);
      setVideoThumb(null);
    } else if (mt === "video" && (pr as any).intro_video_thumbnail_url) {
      setVideoThumb((pr as any).intro_video_thumbnail_url);
      setImageUrl(null);
    } else {
      setImageUrl(null);
      setVideoThumb(null);
    }
    setUsername((pr as any).username || "");
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [pr, au] = await Promise.all([getMyProfile(), supabase.auth.getUser()]);
        if (!alive) return;
        if (pr) refreshFromProfile(pr);
        setEmail(au.data.user?.email || "");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  async function reloadProfile() {
    const pr = await getMyProfile();
    if (pr) refreshFromProfile(pr);
  }

  async function saveIntroCard() {
    setIntroSaving(true);
    try {
      await updateMyIntroDisplayName(introName);
      await updateMyBio(bio);
      await reloadProfile();
      flash("ok", "Intro card saved");
    } catch (e: any) {
      flash("err", e?.message || "Failed to save intro card");
    } finally {
      setIntroSaving(false);
    }
  }

  async function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 15 * 1024 * 1024) { flash("err", "Photo must be ≤ 15 MB"); return; }
    setMediaBusy(true); setMediaProgress(0);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const r = await fetch("/api/profile/intro/upload-image", { method: "POST", body: fd, headers: await authHeaders() });
      if (!r.ok) throw new Error(await r.text());
      await reloadProfile();
      flash("ok", "Photo uploaded");
    } catch (e: any) {
      flash("err", e?.message || "Upload failed");
    } finally {
      setMediaBusy(false); setMediaProgress(0);
      if (imgInputRef.current) imgInputRef.current.value = "";
    }
  }

  async function onPickVideo(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 200 * 1024 * 1024) { flash("err", "Video must be ≤ 200 MB"); return; }
    const filename = f.name;
    const mimeType = f.type || "video/mp4";
    const sizeBytes = f.size;
    setMediaBusy(true); setMediaProgress(0);
    try {
      const startRes = await fetch("/api/profile/intro/video/start", {
        method: "POST",
        headers: await authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ filename, mimeType, sizeBytes }),
      });
      if (!startRes.ok) throw new Error(await startRes.text());
      const { signedUrl, uploadId, key, projectId } = await startRes.json();
      const putRes = await fetch(signedUrl, { method: "PUT", headers: { "Content-Type": mimeType }, body: f });
      if (!putRes.ok) throw new Error("Adilo upload failed");
      const eTag = (putRes.headers.get("ETag") || "").replace(/"/g, "");
      const completeRes = await fetch("/api/profile/intro/video/complete", {
        method: "POST",
        headers: await authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ uploadId, key, eTag, projectId, filename, mimeType, sizeBytes }),
      });
      if (!completeRes.ok) throw new Error(await completeRes.text());
      await reloadProfile();
      flash("ok", "Video uploaded");
    } catch (e: any) {
      flash("err", e?.message || "Video upload failed");
    } finally {
      setMediaBusy(false); setMediaProgress(0);
      if (vidInputRef.current) vidInputRef.current.value = "";
    }
  }

  async function saveUsername() {
    setUsernameSaving(true);
    try {
      await updateMyUsername(username);
      await reloadProfile();
      flash("ok", "Username updated");
    } catch (e: any) {
      flash("err", e?.message || "Failed to update username");
    } finally { setUsernameSaving(false); }
  }

  async function saveEmail() {
    setEmailSaving(true);
    try {
      await updateMyEmail(email);
      flash("ok", "Email update requested. Check your inbox to confirm.");
    } catch (e: any) {
      flash("err", e?.message || "Failed to update email");
    } finally { setEmailSaving(false); }
  }

  async function savePassword() {
    if (newPw.length < 8) { flash("err", "Password must be at least 8 characters"); return; }
    if (newPw !== confirmPw) { flash("err", "Passwords do not match"); return; }
    setPwSaving(true);
    try {
      await updateMyPassword(newPw);
      setNewPw(""); setConfirmPw("");
      flash("ok", "Password updated");
    } catch (e: any) {
      flash("err", e?.message || "Failed to update password");
    } finally { setPwSaving(false); }
  }

  async function doDelete() {
    if (delText.trim().toUpperCase() !== "DELETE") { flash("err", "Type DELETE to confirm"); return; }
    setDelBusy(true);
    try {
      await softDeleteMyAccount();
      router.replace("/login");
    } catch (e: any) {
      flash("err", e?.message || "Failed to deactivate account");
      setDelBusy(false);
    }
  }

  if (loading) return <div className="p-6 text-sm text-gray-500">Loading profile…</div>;

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto space-y-6">
      <div className="mb-2">
        <h1 className="text-2xl font-bold text-gray-900">Profile</h1>
        <p className="text-sm text-gray-500 mt-1">Manage your public intro card and account settings.</p>
      </div>

      {msg && (
        <div className={`rounded-xl px-4 py-3 text-sm ${msg.kind === "ok" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-red-700 border border-red-200"}`}>{msg.text}</div>
      )}

      {/* Intro card */}
      <Section
        title="Intro card"
        subtitle="This will appear on every class intro board you join."
      >
        <div className="text-xs text-gray-400 -mt-3 mb-5">(this is what others see)</div>
        <div className="grid md:grid-cols-2 gap-8">
          <div className="flex items-start justify-center md:justify-start">
            <IntroCardPreview name={introName || (p as any)?.display_name || "Your name"} bio={bio} mediaType={mediaType} imageUrl={imageUrl} videoThumb={videoThumb} />
          </div>
          <div className="space-y-5">
            <div>
              <label className="text-sm font-medium text-gray-700">Display name</label>
              <p className="text-xs text-gray-500 mb-1">Leave blank to use your account username.</p>
              <input value={introName} onChange={e => setIntroName(e.target.value)} name="intro-display-name" autoComplete="off" placeholder={(p as any)?.display_name || "Your name"}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" maxLength={80} />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">About me</label>
              <p className="text-xs text-gray-500 mb-1">Shown on your intro card.</p>
              <textarea value={bio} onChange={e => setBio(e.target.value)} rows={4} maxLength={500}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              <div className="text-xs text-gray-400 mt-1">{bio.length}/500</div>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Photo or video</label>
              <p className="text-xs text-gray-500 mb-2">Add a photo or short video to personalize your intro card.</p>
              <div className="flex gap-2">
                <input ref={imgInputRef} type="file" accept="image/*" hidden onChange={onPickImage} />
                <input ref={vidInputRef} type="file" accept="video/*" hidden onChange={onPickVideo} />
                <button onClick={() => imgInputRef.current?.click()} disabled={mediaBusy}
                  className="px-3 py-2 rounded-lg border border-gray-300 text-sm flex items-center gap-2 hover:bg-gray-50 disabled:opacity-50">
                  <ImageIcon className="w-4 h-4" /> Upload photo
                </button>
                <button onClick={() => vidInputRef.current?.click()} disabled={mediaBusy}
                  className="px-3 py-2 rounded-lg border border-gray-300 text-sm flex items-center gap-2 hover:bg-gray-50 disabled:opacity-50">
                  <Video className="w-4 h-4" /> Upload video
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-2 leading-relaxed">
                Photos up to 15 MB.<br />
                Videos up to 200 MB.<br />
                One photo OR one video at a time.
              </p>
              {mediaBusy && <div className="mt-2 text-xs text-indigo-600">Uploading…</div>}
            </div>
          </div>
        </div>
        <div className="mt-6 flex justify-end">
          <PrimaryButton onClick={saveIntroCard} disabled={introSaving}>
            <Save className="w-4 h-4" /> {introSaving ? "Saving…" : "Save intro card"}
          </PrimaryButton>
        </div>
      </Section>

      {/* Account info */}
      <Section title="Account information" subtitle="Manage your account details.">
        <div className="space-y-5">
          <div>
            <label className="text-sm font-medium text-gray-700">Username</label>
            <div className="flex gap-2 mt-1">
              <input value={username} onChange={e => setUsername(e.target.value.toLowerCase())} name="profile-username" autoComplete="username" placeholder="your_username"
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              <PrimaryButton onClick={saveUsername} disabled={usernameSaving}>
                <Save className="w-4 h-4" /> {usernameSaving ? "Saving…" : "Save username"}
              </PrimaryButton>
            </div>
            <p className="text-xs text-gray-400 mt-1">3–30 chars, lowercase letters, digits, dot, hyphen, underscore.</p>
          </div>
          <div className="h-px bg-gray-100" />
          <div>
            <label className="text-sm font-medium text-gray-700">Email</label>
            <div className="flex gap-2 mt-1">
              <input value={email} onChange={e => setEmail(e.target.value)} type="email" name="profile-email" autoComplete="email"
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              <PrimaryButton onClick={saveEmail} disabled={emailSaving}>
                <Mail className="w-4 h-4" /> {emailSaving ? "Saving…" : "Save email"}
              </PrimaryButton>
            </div>
          </div>
          <div className="h-px bg-gray-100" />
          <div>
            <label className="text-sm font-medium text-gray-700">Password</label>
            <p className="text-xs text-gray-500 mb-1">Choose a strong password to keep your account secure.</p>
            <div className="grid sm:grid-cols-2 gap-2">
              <input value={newPw} onChange={e => setNewPw(e.target.value)} type="password" autoComplete="new-password" placeholder="New password"
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              <input value={confirmPw} onChange={e => setConfirmPw(e.target.value)} type="password" autoComplete="new-password" placeholder="Confirm password"
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div className="mt-2 flex justify-end">
              <PrimaryButton onClick={savePassword} disabled={pwSaving}>
                <Lock className="w-4 h-4" /> {pwSaving ? "Updating…" : "Change password"}
              </PrimaryButton>
            </div>
          </div>
        </div>
      </Section>

      {/* Danger zone */}
      <div className="bg-red-50 border border-red-200 rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle className="w-5 h-5 text-red-600" />
          <h2 className="text-base font-bold text-red-700">Danger zone</h2>
        </div>
        <p className="text-sm text-red-700">Deleting your account will deactivate it. You will be signed out and lose access.</p>
        <p className="text-sm text-red-700 mt-1">Contact an administrator if you change your mind.</p>
        {!showDel ? (
          <div className="mt-4">
            <PrimaryButton onClick={() => setShowDel(true)} variant="red">
              <Trash2 className="w-4 h-4" /> Delete account
            </PrimaryButton>
          </div>
        ) : (
          <div className="mt-4 bg-white border border-red-200 rounded-xl p-4">
            <p className="text-sm text-gray-800 mb-2">Type <span className="font-mono font-bold">DELETE</span> to confirm deactivation.</p>
            <div className="flex gap-2">
              <input value={delText} onChange={e => setDelText(e.target.value)} placeholder="DELETE"
                className="flex-1 border border-red-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500" />
              <PrimaryButton onClick={doDelete} disabled={delBusy} variant="red">
                {delBusy ? "Deactivating…" : "Confirm"}
              </PrimaryButton>
              <button onClick={() => { setShowDel(false); setDelText(""); }}
                className="px-3 py-2 rounded-lg border border-gray-300 text-sm">Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
