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
import { mampatImej } from "@/lib/mampatImej";
import { useBahasa } from "@/lib/i18n/BahasaProvider";

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
  const { t } = useBahasa();
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
          <p className="mt-1.5 text-sm text-ink-faint">{t('ui.profil.aboutMePreview')}</p>
        )}
      </div>
    </div>
  );
}

export default function ProfileView({ role }: { role: "educator" | "participant" }) {
  const router = useRouter();
  const { t } = useBahasa();
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
      flash("ok", t('ui.profil.changesSaved'));
    } catch (e: any) {
      flash("err", e?.message || t('ui.profil.saveFailed'));
    } finally {
      setIntroSaving(false);
    }
  }

  async function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 15 * 1024 * 1024) { flash("err", t('ui.profil.photoSize')); return; }
    setMediaBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", await mampatImej(f));
      const r = await fetch("/api/profile/intro/upload-image", { method: "POST", body: fd, headers: await authHeaders() });
      if (!r.ok) throw new Error(await r.text());
      await reloadProfile();
      flash("ok", t('ui.profil.photoUpdated'));
    } catch (e: any) {
      flash("err", e?.message || t('ui.profil.uploadFailed'));
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
      flash("ok", t('ui.profil.usernameUpdated'));
    } catch (e: any) {
      flash("err", e?.message || t('ui.profil.usernameFailed'));
    } finally { setUsernameSaving(false); }
  }

  async function saveEmail() {
    setEmailSaving(true);
    try {
      await updateMyEmail(email);
      flash("ok", t('ui.profil.emailRequested'));
    } catch (e: any) {
      flash("err", e?.message || t('ui.profil.emailFailed'));
    } finally { setEmailSaving(false); }
  }

  async function savePassword() {
    if (newPw.length < 8) { flash("err", t('ui.profil.pwShort')); return; }
    if (newPw !== confirmPw) { flash("err", t('ui.profil.pwMismatch')); return; }
    setPwSaving(true);
    try {
      await updateMyPassword(newPw);
      setNewPw(""); setConfirmPw("");
      flash("ok", t('ui.profil.pwUpdated'));
    } catch (e: any) {
      flash("err", e?.message || t('ui.profil.pwFailed'));
    } finally { setPwSaving(false); }
  }

  async function doDelete() {
    if (delText.trim().toUpperCase() !== "DELETE") { flash("err", t('ui.profil.typeDelete')); return; }
    setDelBusy(true);
    try {
      await softDeleteMyAccount();
      router.replace("/login");
    } catch (e: any) {
      flash("err", e?.message || t('ui.profil.deactivateFailed'));
      setDelBusy(false);
    }
  }

  const shownName = introName || ((p as any)?.display_name as string) || ((p as any)?.username as string) || t('ui.profil.nameFallback');

  // Label tab ikut bahasa; pemalar TABS di atas kekal untuk kunci sahaja.
  const tabLabel: Record<TabKey, string> = {
    profile: t('ui.profil.tabProfile'),
    account: t('ui.profil.tabAccount'),
    security: t('ui.profil.tabSecurity'),
  };

  if (loading) {
    return <div className="max-w-shell mx-auto px-6 py-10 text-sm text-ink-muted">{t('ui.profil.loading')}</div>;
  }

  return (
    <div className="max-w-shell mx-auto px-6 py-10">
      <div className="max-w-2xl">
        <div className="eyebrow mb-1">{t('ui.profil.eyebrow')}</div>
        <h1 className="page-title">{t('ui.profil.title')}</h1>
        <p className="page-subtitle">
          {role === "educator"
            ? t('ui.profil.subtitleEducator')
            : t('ui.profil.subtitleParticipant')}
        </p>
      </div>

      <div className="mt-7 flex items-center gap-7 border-b border-hairline">
        {TABS.map(tabItem => (
          <button
            key={tabItem.key}
            onClick={() => setTab(tabItem.key)}
            className={`pb-3 -mb-px text-sm font-medium border-b-2 transition ${
              tab === tabItem.key ? "border-brand-purple text-ink" : "border-transparent text-ink-muted hover:text-ink"
            }`}
          >
            {tabLabel[tabItem.key]}
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
                  {mediaBusy ? t('ui.profil.uploading') : t('ui.profil.changePhoto')}
                </button>
                <div className="text-xs text-ink-faint mt-1">{t('ui.profil.photoHint')}</div>
              </div>
            </div>

            <Field label={t('ui.profil.displayNameLabel')} hint={t('ui.profil.displayNameHint')}>
              <input
                value={introName}
                onChange={e => setIntroName(e.target.value)}
                name="intro-display-name"
                autoComplete="off"
                maxLength={80}
                placeholder={((p as any)?.display_name as string) || t('ui.profil.nameFallback')}
                className="input"
              />
            </Field>

            <div>
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-medium text-ink">{t('ui.profil.aboutMe')}</span>
                <span className="text-xs text-ink-faint tabular-nums">{bio.length}/500</span>
              </div>
              <textarea
                value={bio}
                onChange={e => setBio(e.target.value)}
                rows={5}
                maxLength={500}
                placeholder={t('ui.profil.aboutPlaceholder')}
                className="input mt-1.5 resize-y leading-relaxed"
              />
            </div>

            <div>
              <button onClick={saveIntroCard} disabled={introSaving} className="btn-primary">
                {introSaving ? t('ui.profil.saving') : t('ui.profil.saveChanges')}
              </button>
            </div>
          </div>

          <div>
            <div className="eyebrow mb-2">{t('ui.profil.introCard')}</div>
            <IntroCardPreview name={shownName} bio={bio} imageUrl={imageUrl} />
            <p className="text-xs text-ink-faint mt-3 leading-relaxed">{t('ui.profil.introNote')}</p>
          </div>
        </div>
      )}

      {tab === "account" && (
        <div className="mt-8 max-w-lg space-y-8">
          <div>
            <Field label={t('ui.profil.usernameLabel')} hint={t('ui.profil.usernameHint')}>
              <input
                value={username}
                onChange={e => setUsername(e.target.value.toLowerCase())}
                name="profile-username"
                autoComplete="username"
                placeholder={t('ui.profil.usernamePlaceholder')}
                className="input"
              />
            </Field>
            <div className="mt-3">
              <button onClick={saveUsername} disabled={usernameSaving} className="btn-secondary">
                {usernameSaving ? t('ui.profil.saving') : t('ui.profil.saveUsername')}
              </button>
            </div>
          </div>

          <div className="h-px bg-hairline" />

          <div>
            <Field label={t('ui.profil.emailLabel')} hint={t('ui.profil.emailHint')}>
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
                {emailSaving ? t('ui.profil.saving') : t('ui.profil.saveEmail')}
              </button>
            </div>
          </div>
        </div>
      )}

      {tab === "security" && (
        <div className="mt-8 max-w-lg space-y-8">
          <div>
            <div className="section-title">{t('ui.profil.passwordTitle')}</div>
            <p className="text-sm text-ink-muted mt-1">{t('ui.profil.passwordHint')}</p>
            <div className="mt-4 space-y-3">
              <input
                value={newPw}
                onChange={e => setNewPw(e.target.value)}
                type="password"
                autoComplete="new-password"
                placeholder={t('ui.profil.newPasswordPlaceholder')}
                className="input"
              />
              <input
                value={confirmPw}
                onChange={e => setConfirmPw(e.target.value)}
                type="password"
                autoComplete="new-password"
                placeholder={t('ui.profil.confirmPasswordPlaceholder')}
                className="input"
              />
            </div>
            <div className="mt-4">
              <button onClick={savePassword} disabled={pwSaving} className="btn-primary">
                {pwSaving ? t('ui.profil.updating') : t('ui.profil.changePassword')}
              </button>
            </div>
          </div>

          <div className="h-px bg-hairline" />

          <div>
            <div className="section-title">{t('ui.profil.deleteAccountTitle')}</div>
            <p className="text-sm text-ink-muted mt-1">
              {t('ui.profil.deleteAccountDesc')}
            </p>
            {!showDel ? (
              <button onClick={() => setShowDel(true)} className="btn-quiet text-[#C0392B] mt-3">
                {t('ui.profil.deleteAccountTitle')}
              </button>
            ) : (
              <div className="mt-4 rounded-xl border border-hairline p-4">
                <p className="text-sm text-ink">
                  {t('ui.profil.typeDeletePrefix')}<span className="font-mono font-semibold">DELETE</span>{t('ui.profil.typeDeleteSuffix')}
                </p>
                <div className="mt-3 flex gap-2">
                  <input value={delText} onChange={e => setDelText(e.target.value)} placeholder="DELETE" className="input flex-1" />
                  <button onClick={doDelete} disabled={delBusy} className="btn-secondary text-[#C0392B] shrink-0">
                    {delBusy ? t('ui.profil.deactivating') : t('common.confirm')}
                  </button>
                  <button onClick={() => { setShowDel(false); setDelText(""); }} className="btn-quiet shrink-0 px-2">
                    {t('common.cancel')}
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
