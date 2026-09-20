"use client";
import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  getMyProfile,
  updateMyBio,
  updateMyEmail,
  updateMyPassword,
  updateMyIntroDisplayName,
  updateMyUsername,
  softDeleteMyAccount,
} from "@/lib/data";
import type { Profile } from "@/lib/types";

/**
 * Profil, semakan reka bentuk September 2026.
 *
 * Satu skrin, tiga tab dalaman. Tab Profile ialah satu-satunya tempat
 * pengguna melihat kad intro mereka hidup sambil menaip, dan satu-satunya
 * butang violet pada skrin itu ialah "Save changes". Zon bahaya berpindah
 * ke tab Security supaya kerja harian tidak duduk sebelah butang padam.
 */

type TabKey = "profile" | "account" | "security";

const TABS: { key: TabKey; label: string }[] = [
  { key: "profile", label: "Profile" },
  { key: "account", label: "Account" },
  { key: "security", label: "Security" },
];

async function authHeaders(extra: Record<string, string> = {}): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const h: Record<string, string> = { ...extra };
  if (token) h["Authorization"] = `Bearer ${token}`;
  return h;
}

function initialsOf(name: string): string {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-sm font-medium text-ink">{label}</div>
      {hint && <div className="text-xs text-ink-faint mt-0.5">{hint}</div>}
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

/** Kad intro seperti yang orang lain lihat. Hidup sambil menaip. */
function IntroCardPreview({ name, bio, imageUrl }: { name: string; bio: string; imageUrl: string | null }) {
  return (
    <div className="rounded-2xl bg-white border border-hairline overflow-hidden">
      <div className="h-20 bg-[#EAE6FC]" />
      <div className="px-5 pb-5 -mt-9">
        {imageUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={imageUrl} alt={name} className="w-[72px] h-[72px] rounded-full object-cover ring-4 ring-white" />
        ) : (
          <div className="w-[72px] h-[72px] rounded-full bg-brand-purple text-white text-xl font-semibold flex items-center justify-center ring-4 ring-white">
            {initialsOf(name)}
          </div>
        )}
        <div className="mt-3 text-base font-semibold text-ink truncate">{name}</div>
        {bio ? (
          <p className="mt-1.5 text-sm text-ink-muted whitespace-pre-wrap leading-relaxed">{bio}</p>
        ) : (
          <p className="mt-1.5 text-sm text-ink-faint">Your About me text appears here.</p>
        )}
      </div>
    </div>
  );
}

export default function ProfileView({ role }: { role: "educator" | "participant" }) {
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>("profile");
  const [p, setP] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  // Kad intro
  const [introName, setIntroName] = useState("");
  const [bio, setBio] = useState("");
  const [introSaving, setIntroSaving] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [mediaBusy, setMediaBusy] = useState(false);
  const imgInputRef = useRef<HTMLInputElement>(null);
  // Akaun
  const [username, setUsername] = useState("");
  const [usernameSaving, setUsernameSaving] = useState(false);
  const [email, setEmail] = useState("");
  const [emailSaving, setEmailSaving] = useState(false);
  // Keselamatan
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [showDel, setShowDel] = useState(false);
  const [delText, setDelText] = useState("");
  const [delBusy, setDelBusy] = useState(false);

  function flash(kind: "ok" | "err", text: string) {
    setMsg({ kind, text });
    setTimeout(() => setMsg(null), 4000);
  }

  function refreshFromProfile(pr: Profile) {
    setP(pr);
    setIntroName(((pr as any).intro_display_name as string) || "");
    setBio(((pr as any).bio as string) || "");
    const imgCode = (pr as any).intro_image_file_code as string | null;
    setImageUrl(imgCode ? `/api/profile/image/${imgCode}` : null);
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
      flash("ok", "Changes saved");
    } catch (e: any) {
      flash("err", e?.message || "Failed to save changes");
    } finally {
      setIntroSaving(false);
    }
  }

  async function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 15 * 1024 * 1024) { flash("err", "Photo must be 15 MB or smaller"); return; }
    setMediaBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const r = await fetch("/api/profile/intro/upload-image", { method: "POST", body: fd, headers: await authHeaders() });
      if (!r.ok) throw new Error(await r.text());
      await reloadProfile();
      flash("ok", "Photo updated");
    } catch (e: any) {
      flash("err", e?.message || "Upload failed");
    } finally {
      setMediaBusy(false);
      if (imgInputRef.current) imgInputRef.current.value = "";
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

  const shownName = introName || ((p as any)?.display_name as string) || ((p as any)?.username as string) || "Your name";

  if (loading) {
    return <div className="max-w-shell mx-auto px-6 py-10 text-sm text-ink-muted">Loading profile…</div>;
  }

  return (
    <div className="max-w-shell mx-auto px-6 py-10">
      <div className="max-w-2xl">
        <div className="eyebrow mb-1">Your account</div>
        <h1 className="page-title">Make it yours.</h1>
        <p className="page-subtitle">
          {role === "educator"
            ? "Your intro card is the first thing learners see when they join one of your classes."
            : "Your intro card is what classmates see on every intro board you join."}
        </p>
      </div>

      <div className="mt-7 flex items-center gap-7 border-b border-hairline">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`pb-3 -mb-px text-sm font-medium border-b-2 transition ${
              tab === t.key ? "border-brand-purple text-ink" : "border-transparent text-ink-muted hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {msg && (
        <div className={`mt-5 rounded-lg px-3.5 py-2.5 text-sm ${msg.kind === "ok" ? "bg-[#E3F5EA] text-[#2E7D4F]" : "bg-[#FDEBEA] text-[#C0392B]"}`}>
          {msg.text}
        </div>
      )}

      {tab === "profile" && (
        <div className="mt-8 grid gap-12 md:grid-cols-[minmax(0,1fr)_300px]">
          <div className="max-w-lg space-y-7">
            <div className="flex items-center gap-4">
              {imageUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={imageUrl} alt={shownName} className="w-20 h-20 rounded-full object-cover" />
              ) : (
                <div className="w-20 h-20 rounded-full bg-[#EAE6FC] text-brand-purple text-2xl font-semibold flex items-center justify-center">
                  {initialsOf(shownName)}
                </div>
              )}
              <div>
                <input ref={imgInputRef} type="file" accept="image/*" hidden onChange={onPickImage} />
                <button onClick={() => imgInputRef.current?.click()} disabled={mediaBusy} className="btn-quiet text-brand-purple disabled:opacity-40">
                  {mediaBusy ? "Uploading…" : "Change photo"}
                </button>
                <div className="text-xs text-ink-faint mt-1">JPG or PNG, up to 15 MB.</div>
              </div>
            </div>

            <Field label="Display name" hint="Leave blank to use your username.">
              <input
                value={introName}
                onChange={e => setIntroName(e.target.value)}
                name="intro-display-name"
                autoComplete="off"
                maxLength={80}
                placeholder={((p as any)?.display_name as string) || "Your name"}
                className="input"
              />
            </Field>

            <div>
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-medium text-ink">About me</span>
                <span className="text-xs text-ink-faint tabular-nums">{bio.length}/500</span>
              </div>
              <textarea
                value={bio}
                onChange={e => setBio(e.target.value)}
                rows={5}
                maxLength={500}
                placeholder="A sentence or two about you."
                className="input mt-1.5 resize-y leading-relaxed"
              />
            </div>

            <div>
              <button onClick={saveIntroCard} disabled={introSaving} className="btn-primary">
                {introSaving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>

          <div>
            <div className="eyebrow mb-2">Your intro card</div>
            <IntroCardPreview name={shownName} bio={bio} imageUrl={imageUrl} />
            <p className="text-xs text-ink-faint mt-3 leading-relaxed">This is exactly what other people see.</p>
          </div>
        </div>
      )}

      {tab === "account" && (
        <div className="mt-8 max-w-lg space-y-8">
          <div>
            <Field label="Username" hint="3 to 30 characters: lowercase letters, digits, dot, hyphen or underscore.">
              <input
                value={username}
                onChange={e => setUsername(e.target.value.toLowerCase())}
                name="profile-username"
                autoComplete="username"
                placeholder="your_username"
                className="input"
              />
            </Field>
            <div className="mt-3">
              <button onClick={saveUsername} disabled={usernameSaving} className="btn-secondary">
                {usernameSaving ? "Saving…" : "Save username"}
              </button>
            </div>
          </div>

          <div className="h-px bg-hairline" />

          <div>
            <Field label="Email" hint="We send a confirmation link before the change takes effect.">
              <input
                value={email}
                onChange={e => setEmail(e.target.value)}
                type="email"
                name="profile-email"
                autoComplete="email"
                className="input"
              />
            </Field>
            <div className="mt-3">
              <button onClick={saveEmail} disabled={emailSaving} className="btn-secondary">
                {emailSaving ? "Saving…" : "Save email"}
              </button>
            </div>
          </div>
        </div>
      )}

      {tab === "security" && (
        <div className="mt-8 max-w-lg space-y-8">
          <div>
            <div className="section-title">Password</div>
            <p className="text-sm text-ink-muted mt-1">At least 8 characters. Choose something you do not use elsewhere.</p>
            <div className="mt-4 space-y-3">
              <input
                value={newPw}
                onChange={e => setNewPw(e.target.value)}
                type="password"
                autoComplete="new-password"
                placeholder="New password"
                className="input"
              />
              <input
                value={confirmPw}
                onChange={e => setConfirmPw(e.target.value)}
                type="password"
                autoComplete="new-password"
                placeholder="Confirm password"
                className="input"
              />
            </div>
            <div className="mt-4">
              <button onClick={savePassword} disabled={pwSaving} className="btn-primary">
                {pwSaving ? "Updating…" : "Change password"}
              </button>
            </div>
          </div>

          <div className="h-px bg-hairline" />

          <div>
            <div className="section-title">Delete account</div>
            <p className="text-sm text-ink-muted mt-1">
              This deactivates your account and signs you out. Nothing you created is removed, and an administrator can restore access.
            </p>
            {!showDel ? (
              <button onClick={() => setShowDel(true)} className="btn-quiet text-[#C0392B] mt-3">
                Delete account
              </button>
            ) : (
              <div className="mt-4 rounded-xl border border-hairline p-4">
                <p className="text-sm text-ink">
                  Type <span className="font-mono font-semibold">DELETE</span> to confirm.
                </p>
                <div className="mt-3 flex gap-2">
                  <input value={delText} onChange={e => setDelText(e.target.value)} placeholder="DELETE" className="input flex-1" />
                  <button onClick={doDelete} disabled={delBusy} className="btn-secondary text-[#C0392B] shrink-0">
                    {delBusy ? "Deactivating…" : "Confirm"}
                  </button>
                  <button onClick={() => { setShowDel(false); setDelText(""); }} className="btn-quiet shrink-0 px-2">
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
