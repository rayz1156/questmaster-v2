"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

// Chatbot "Pembantu Kuizen" di Bicarra (bicarra.com).
// Borang sebelum sembang: nama + e-mel wajib, No. WhatsApp pilihan (ditetapkan di papan pemuka Bicarra).
const CHATBOT_ID = "37938a31-dc16-4681-b1ba-056d83f446b2";

// Gelembung sembang hanya dipaparkan pada dua tempat: laman awam kuizen.fun
// (laman utama, blog, panduan, bantuan, naik taraf) dan papan pemuka kelas.
// Semua skrin lain (kuiz, aktiviti, sijil, log masuk, tetapan) disembunyikan.
const PUBLIC_EXACT = ["/", "/en", "/blog", "/help", "/naik-taraf"];
const PUBLIC_PREFIXES = ["/blog", "/panduan", "/help"];
// Papan pemuka kelas: /educator/classes/<id> dan halaman kelas pelajar.
const CLASS_DASHBOARD = [
  /^\/educator\/classes\/[^/]+\/?$/,
  /^\/participant\/classes\/[^/]+(\/(board|learning-board))?\/?$/,
];

function isAllowed(pathname: string): boolean {
  if (PUBLIC_EXACT.includes(pathname)) return true;
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p + "/"))) return true;
  return CLASS_DASHBOARD.some((re) => re.test(pathname));
}

export default function BicarraChat() {
  const pathname = usePathname() || "/";
  const hidden = !isAllowed(pathname);

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
