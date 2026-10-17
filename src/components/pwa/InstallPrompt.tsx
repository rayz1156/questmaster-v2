"use client";

import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "cendekia_pwa_install_dismissed_at";
const DISMISS_COOLDOWN_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

function isMobile() {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}
function isIOS() {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod/i.test(navigator.userAgent) && !(window as any).MSStream;
}
function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as any).standalone === true
  );
}
function recentlyDismissed() {
  try {
    const v = localStorage.getItem(DISMISS_KEY);
    if (!v) return false;
    return Date.now() - Number(v) < DISMISS_COOLDOWN_MS;
  } catch {
    return false;
  }
}

export default function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [show, setShow] = useState(false);
  const [showIOSHint, setShowIOSHint] = useState(false);

  useEffect(() => {
    if (!isMobile() || isStandalone() || recentlyDismissed()) return;

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setShow(true);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);

    if (isIOS()) {
      // iOS Safari has no beforeinstallprompt; show our own hint after a small delay.
      const t = setTimeout(() => setShowIOSHint(true), 1500);
      return () => {
        clearTimeout(t);
        window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      };
    }

    const onInstalled = () => {
      setShow(false);
      setShowIOSHint(false);
    };
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {}
    setShow(false);
    setShowIOSHint(false);
  };

  const install = async () => {
    if (!deferred) return;
    try {
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      if (outcome === "accepted") {
        setShow(false);
      } else {
        dismiss();
      }
    } finally {
      setDeferred(null);
    }
  };

  if (!show && !showIOSHint) return null;

  return (
    <div
      role="dialog"
      aria-label="Pasang StafKita Akademi"
      className="fixed inset-x-3 bottom-3 z-[1000] rounded bg-white shadow-elevated ring-1 ring-primary-subtle p-4 flex items-start gap-3 sm:hidden"
    >
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-primary text-white text-xl font-bold">
        SK
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-slate-900">Pasang StafKita Akademi</div>
        {deferred ? (
          <p className="text-sm text-slate-600 mt-0.5">
            Tambah ke skrin utama anda untuk pengalaman yang lebih pantas dan skrin penuh.
          </p>
        ) : (
          <p className="text-sm text-slate-600 mt-0.5">
            Ketik ikon Kongsi, kemudian pilih <strong>Tambah ke Skrin Utama</strong>.
          </p>
        )}
        <div className="mt-2 flex gap-2">
          {deferred && (
            <button
              onClick={install}
              className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-hover"
            >
              Pasang
            </button>
          )}
          <button
            onClick={dismiss}
            className="rounded px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            Bukan sekarang
          </button>
        </div>
      </div>
      <button
        onClick={dismiss}
        aria-label="Tutup"
        className="text-gray-400 hover:text-gray-600 -mt-1 -mr-1 p-1"
      >
        ✕
      </button>
    </div>
  );
}
