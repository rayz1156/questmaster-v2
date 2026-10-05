"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

// Chatbot "Pembantu Kuizen" di Bicarra (bicarra.com).
// Borang sebelum sembang: nama + e-mel wajib, No. WhatsApp pilihan (ditetapkan di papan pemuka Bicarra).
const CHATBOT_ID = "37938a31-dc16-4681-b1ba-056d83f446b2";

// Skrin kuiz langsung, paparan projektor dan sijil: gelembung sembang disembunyikan.
const HIDDEN_PREFIXES = ["/live", "/j", "/tjoin", "/sijil"];

export default function BicarraChat() {
  const pathname = usePathname() || "/";
  const hidden = HIDDEN_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );

  useEffect(() => {
    document.documentElement.classList.toggle("kz-hide-bicarra", hidden);
  }, [hidden]);

  return (
    <Script
      id="bicarra-kuizen"
      src={`https://bicarra.com/api/widget/${CHATBOT_ID}`}
      strategy="lazyOnload"
    />
  );
}
