/**
 * Logo Kuizen.
 *
 * Tanda dilukis terus dalam JSX, bukan dimuat sebagai <img>, supaya ia tajam
 * pada setiap saiz, tiada permintaan rangkaian tambahan, dan tidak berkelip
 * semasa halaman dimuat. Perkataan pula teks HTML sebenar dalam Inter yang
 * sudah dimuat oleh layout, jadi ia sepadan dengan seluruh antara muka
 * daripada segi hinting dan berat, sesuatu yang teks dalam SVG tidak boleh
 * jamin pada mesin yang tiada Inter.
 *
 * Fail SVG di /public kekal untuk kegunaan luar: favicon, ikon PWA, e-mel
 * dan pratonton media sosial.
 */

export function LogoMark({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 256 256"
      role="img"
      aria-label="Kuizen"
      className={className}
    >
      <rect width="256" height="256" rx="58" ry="58" fill="#7057D9" />
      <g fill="none" stroke="#FFFFFF" strokeWidth="20" strokeLinecap="round" strokeLinejoin="round">
        <path d="M66 66 L66 190" />
        <path d="M66 128 L132 66" />
        <path d="M66 128 L122 184 L176 118" />
      </g>
      <circle cx="186" cy="70" r="15" fill="#FFFFFF" />
    </svg>
  );
}

export default function Logo({
  size = 28,
  wordmark = true,
  className = "",
}: {
  size?: number;
  wordmark?: boolean;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark size={size} />
      {wordmark && (
        <span
          className="font-semibold tracking-tight text-ink"
          style={{ fontSize: Math.round(size * 0.68), letterSpacing: "-0.02em" }}
        >
          Kuizen
        </span>
      )}
    </span>
  );
}
