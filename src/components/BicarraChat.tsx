"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

// Chatbot "Pembantu Kuizen" di Bicarra (bicarra.com).
// Borang sebelum sembang: nama + e-mel wajib, No. WhatsApp pilihan (ditetapkan di papan pemuka Bicarra).
const CHATBOT_ID = "37938a31-dc16-4681-b1ba-056d83f446b2";

// Gelembung sembang disembunyikan semasa kuiz dan aktiviti supaya tidak
// menutup butang jawapan atau peta permainan: kuiz langsung, Arena (main dan
// demo), skrin hos guru, aktiviti pelajar, penilaian rakan, LNA dan sijil.
const HIDDEN_PREFIXES = [
  "/live",
  "/j",
  "/tjoin",
  "/sijil",
  "/arena",
  "/lna",
  "/participant/activities",
  "/participant/peer-review",
  "/educator/live/session",
  "/educator/arena/session",
];

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
