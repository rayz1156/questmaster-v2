import * as React from 'react';

// Logo teks StafKita Akademi (tiada imej baharu; hanya teks + monogram SVG inline)
export type LogoVariant = 'full' | 'horizontal' | 'mark';
export type LogoColor = 'default' | 'mono-dark' | 'mono-light';

interface Props {
  variant?: LogoVariant;
  color?: LogoColor;
  className?: string;
  height?: number;
  /** Dikekalkan untuk keserasian lama; tidak lagi mempengaruhi rupa logo */
  iconConcept?: 'B' | 'E';
}

function Mark({ size = 40, color = 'default' }: { size?: number; color?: LogoColor }) {
  // Monogram "SK" mudah; gelap pada latar terang, cerah pada latar gelap
  const bg = color === 'mono-light' ? '#ffffff' : '#6576ff';
  const fg = color === 'mono-light' ? '#6576ff' : '#ffffff';
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="4" y="4" width="56" height="56" rx="12" fill={bg} />
      <text x="32" y="41" textAnchor="middle" fontSize="26" fontWeight="800" fontFamily="Nunito, Arial, sans-serif" fill={fg}>SK</text>
    </svg>
  );
}

export function KuizenAcademyLogo({
  variant = 'horizontal',
  color = 'default',
  className = '',
  height = 40,
  iconConcept = 'B',
}: Props) {
  // Warna teks mengikut konteks latar
  const strong = color === 'mono-light' ? '#ffffff' : '#364a63';
  const accent = color === 'mono-light' ? '#ffffff' : '#6576ff';
  void iconConcept; // parameter legasi, tidak digunakan lagi

  if (variant === 'mark') {
    return (
      <span className={className} role="img" aria-label="StafKita Akademi">
        <Mark size={height} color={color} />
      </span>
    );
  }

  if (variant === 'full') {
    // Bertindan: mark di atas, lockup teks penuh di bawah
    return (
      <span className={`inline-flex flex-col items-center gap-2 ${className}`} role="img" aria-label="StafKita Akademi">
        <Mark size={height} color={color} />
        <span className="flex flex-col items-center leading-tight">
          <span className="text-xl font-bold tracking-tight" style={{ color: strong, fontFamily: 'Nunito, var(--font-nunito), sans-serif' }}>
            StafKita <span style={{ color: accent }}>Akademi</span>
          </span>
        </span>
      </span>
    );
  }

  // horizontal (lalai)
  return (
    <span className={`inline-flex items-center gap-3 ${className}`} role="img" aria-label="StafKita Akademi">
      <Mark size={Math.min(height, 40)} color={color} />
      <span className="flex flex-col leading-tight">
        <span className="text-lg font-bold tracking-tight" style={{ color: strong, fontFamily: 'Nunito, var(--font-nunito), sans-serif' }}>
          StafKita <span style={{ color: accent }}>Akademi</span>
        </span>
      </span>
    </span>
  );
}

export default KuizenAcademyLogo;
