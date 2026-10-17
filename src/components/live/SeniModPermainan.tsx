/**
 * Ilustrasi SVG mod permainan (KZ-026) untuk galeri kad PanelMulaSesi.
 * Tiga lakaran sebaris: classic, race, boss. Warna isian tetap (bukan kelas
 * Tailwind) supaya rupa seni tidak berubah walaupun token tema ditukar.
 * Tiada fail imej, tiada pakej baharu.
 */

export type NilaiModPermainan = "classic" | "race" | "boss";

/** Warna latar setiap seni, turut dipakai oleh panel seni kad. */
export const LATAR_SENI: Record<NilaiModPermainan, string> = {
  classic: "#eef0f5",
  race: "#e6efff",
  boss: "#efe8ff",
};

/** Grid jawapan 2x2 gaya Kahoot: satu kotak ungu betul, tiga kotak kosong. */
function SeniClassic() {
  return (
    <>
      {/* Latar panel */}
      <rect x="0" y="0" width="200" height="120" fill="#eef0f5" />
      {/* Segi empat soalan di atas */}
      <rect x="20" y="10" width="160" height="22" rx="3" fill="#ffffff" stroke="#9aa6bd" strokeWidth="1.5" />
      {/* Kotak jawapan betul (kiri atas) dengan tanda semak putih */}
      <rect x="20" y="42" width="76" height="30" rx="3" fill="#854fff" />
      <polyline points="38,57 44,63 56,49" fill="none" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      {/* Tiga kotak jawapan kosong putih bergaris */}
      <rect x="104" y="42" width="76" height="30" rx="3" fill="#ffffff" stroke="#9aa6bd" strokeWidth="1.5" />
      <rect x="20" y="80" width="76" height="30" rx="3" fill="#ffffff" stroke="#9aa6bd" strokeWidth="1.5" />
      <rect x="104" y="80" width="76" height="30" rx="3" fill="#ffffff" stroke="#9aa6bd" strokeWidth="1.5" />
    </>
  );
}

/** Lorong lumba dengan garisan penamat, bendera petak dan tiga pemain. */
function SeniRace() {
  return (
    <>
      {/* Latar lorong */}
      <rect x="0" y="0" width="200" height="120" fill="#e6efff" />
      {/* Tiga lorong putus-putus */}
      <line x1="16" y1="30" x2="150" y2="30" stroke="#9db5e8" strokeWidth="2" strokeDasharray="6 6" />
      <line x1="16" y1="60" x2="150" y2="60" stroke="#9db5e8" strokeWidth="2" strokeDasharray="6 6" />
      <line x1="16" y1="90" x2="150" y2="90" stroke="#9db5e8" strokeWidth="2" strokeDasharray="6 6" />
      {/* Garisan penamat menegak */}
      <line x1="160" y1="14" x2="160" y2="106" stroke="#2f5fc4" strokeWidth="3" />
      {/* Bendera petak di atas garisan penamat */}
      <rect x="154" y="8" width="6" height="6" fill="#2f5fc4" />
      <rect x="160" y="8" width="6" height="6" fill="#ffffff" />
      <rect x="166" y="8" width="6" height="6" fill="#2f5fc4" />
      <rect x="154" y="14" width="6" height="6" fill="#ffffff" />
      <rect x="160" y="14" width="6" height="6" fill="#2f5fc4" />
      <rect x="166" y="14" width="6" height="6" fill="#ffffff" />
      {/* Garis laju di belakang bulatan hadapan */}
      <line x1="100" y1="26" x2="114" y2="26" stroke="#854fff" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="96" y1="30" x2="112" y2="30" stroke="#854fff" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="100" y1="34" x2="114" y2="34" stroke="#854fff" strokeWidth="2.5" strokeLinecap="round" />
      {/* Tiga bulatan pemain pada kedudukan berbeza */}
      <circle cx="130" cy="30" r="9" fill="#854fff" />
      <circle cx="88" cy="60" r="9" fill="#2f5fc4" />
      <circle cx="52" cy="90" r="9" fill="#5c86d9" />
    </>
  );
}

/** Raksasa ungu dengan bar nyawa dan pemain kecil di bawah. */
function SeniBoss() {
  return (
    <>
      {/* Latar gelanggang */}
      <rect x="0" y="0" width="200" height="120" fill="#efe8ff" />
      {/* Bar nyawa: separuh merah */}
      <rect x="20" y="12" width="160" height="12" rx="3" fill="#ffffff" stroke="#6a2fe6" strokeWidth="1.5" />
      <rect x="21" y="13" width="79" height="10" rx="2" fill="#e0475f" />
      {/* Tanduk */}
      <polygon points="84,42 78,24 94,36" fill="#6a2fe6" />
      <polygon points="116,42 122,24 106,36" fill="#6a2fe6" />
      {/* Badan raksasa bulat */}
      <circle cx="100" cy="66" r="30" fill="#854fff" />
      {/* Dua mata putih */}
      <circle cx="89" cy="58" r="5.5" fill="#ffffff" />
      <circle cx="111" cy="58" r="5.5" fill="#ffffff" />
      {/* Mulut zigzag putih */}
      <polyline points="86,74 92,69 98,74 104,69 110,74" fill="none" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      {/* Pemain kecil di bawah */}
      <circle cx="48" cy="104" r="5" fill="#b49bf0" />
      <circle cx="74" cy="108" r="5" fill="#b49bf0" />
      <circle cx="100" cy="104" r="5" fill="#b49bf0" />
      <circle cx="126" cy="108" r="5" fill="#b49bf0" />
      <circle cx="152" cy="104" r="5" fill="#b49bf0" />
    </>
  );
}

/**
 * Satu ilustrasi ikut mod. Saiz dan atribut mengikut tiket:
 * width 100%, height 120, viewBox 0 0 200 120, aria-hidden.
 */
export default function SeniModPermainan({ nilai }: { nilai: NilaiModPermainan }) {
  return (
    <svg width="100%" height="120" viewBox="0 0 200 120" aria-hidden="true" focusable="false">
      {nilai === "classic" && <SeniClassic />}
      {nilai === "race" && <SeniRace />}
      {nilai === "boss" && <SeniBoss />}
    </svg>
  );
}
