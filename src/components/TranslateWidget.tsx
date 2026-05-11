"use client";
import { useEffect, useState } from "react";
import Script from "next/script";
import { Languages } from "lucide-react";

// GTranslate floating widget — free, no account required.
// Renders bottom-right, offers Bahasa Melayu, Mandarin, Arabic, Tamil, etc.
// Uses browser auto-translate as a free fallback when offline.

declare global {
  interface Window {
    gtranslateSettings?: Record<string, unknown>;
  }
}

export default function TranslateWidget() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.gtranslateSettings = {
      default_language: "en",
      detect_browser_language: true,
      languages: [
        "en", "ms", "id", "zh-CN", "zh-TW", "ar", "ta", "hi", "ja", "ko",
      ],
      wrapper_selector: ".gtranslate_wrapper",
      flag_style: "3d",
      switcher_horizontal_position: "right",
      switcher_vertical_position: "bottom",
      float_switcher_open_direction: "top",
      alt_flags: { en: "usa" },
    };
    setMounted(true);
  }, []);

  return (
    <>
      {/* Hidden anchor for GTranslate to mount into */}
      <div
        className="gtranslate_wrapper"
        aria-label="Language selector"
        style={{ position: "fixed", bottom: "80px", right: "16px", zIndex: 50 }}
      />
      {/* Fallback visual hint while script loads */}
      {!mounted && (
        <button
          aria-label="Translate (loading)"
          className="fixed bottom-20 right-4 z-40 rounded-full bg-white shadow-lg border border-gray-200 p-2 opacity-70"
          disabled
        >
          <Languages className="w-5 h-5 text-gray-500" />
        </button>
      )}
      <Script
        src="https://cdn.gtranslate.net/widgets/latest/float.js"
        strategy="afterInteractive"
        defer
      />
    </>
  );
}
