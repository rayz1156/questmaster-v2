import * as React from 'react';

export type LogoVariant = 'full' | 'horizontal' | 'mark';
export type LogoColor = 'default' | 'mono-dark' | 'mono-light';

interface Props {
  variant?: LogoVariant;
  color?: LogoColor;
  className?: string;
  height?: number;
  /** Hexagonal Shield (B) or Stacked Books with Quill (E) */
  iconConcept?: 'B' | 'E';
}

function Mark({ size = 40, color = 'default', concept = 'B' }: { size?: number; color?: LogoColor; concept?: 'B' | 'E' }) {
  const academy = color === 'mono-light' ? 'rgba(255,255,255,0.85)' : '#047857';
  const navy    = color === 'mono-light' ? 'rgba(255,255,255,0.40)' : color === 'mono-dark' ? '#0f1e35' : '#0f1e35';
  const gold    = color === 'mono-light' ? '#fbbf24' : color === 'mono-dark' ? '#0f1e35' : '#d97706';

  if (concept === 'E') {
    // Concept E: Stacked Books with Quill — traditional academy authority
    return (
      <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        {/* Bottom book */}
        <rect x="8" y="42" width="44" height="10" rx="1.5" fill={navy} />
        <rect x="8" y="42" width="44" height="2" fill={gold} />
        {/* Middle book */}
        <rect x="12" y="30" width="40" height="10" rx="1.5" fill={academy} />
        <rect x="12" y="30" width="40" height="2" fill={gold} />
        {/* Top book */}
        <rect x="16" y="18" width="36" height="10" rx="1.5" fill={navy} />
        <rect x="16" y="18" width="36" height="2" fill={gold} />
        {/* Quill */}
        <path d="M44 10 L54 6 L52 16 L46 14 Z" fill={gold} />
        <line x1="44" y1="10" x2="36" y2="22" stroke={gold} strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }

  // Concept B: Hexagonal Shield with K-monogram (DEFAULT)
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      {/* Outer shield (Veltrix navy) */}
      <path
        d="M32 4 L56 16 V40 C56 50 44 58 32 60 C20 58 8 50 8 40 V16 Z"
        fill={navy}
      />
      {/* Inner shield (Academy emerald) */}
      <path
        d="M32 10 L50 19 V38 C50 46 41 53 32 55 C23 53 14 46 14 38 V19 Z"
        fill={academy}
      />
      {/* K monogram (gold) — stylized */}
      <path
        d="M24 22 V46 H28 V37 L36 46 H42 L32 34 L41 22 H35 L28 31 V22 Z"
        fill={gold}
      />
      {/* Achievement star (top-right) */}
      <circle cx="46" cy="18" r="3" fill={gold} />
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
  const academy = color === 'mono-light' ? '#ffffff' : '#047857';
  const navy    = color === 'mono-light' ? '#ffffff' : '#0f1e35';
  const muted   = color === 'mono-light' ? 'rgba(255,255,255,0.7)' : '#64748b';

  if (variant === 'mark') {
    return (
      <span className={className} role="img" aria-label="Kuizen Academy">
        <Mark size={height} color={color} concept={iconConcept} />
      </span>
    );
  }

  if (variant === 'full') {
    // Stacked: Mark on top, full lockup below
    return (
      <span className={`inline-flex flex-col items-center gap-2 ${className}`} role="img" aria-label="Kuizen Academy by Veltrix">
        <Mark size={height} color={color} concept={iconConcept} />
        <span className="flex flex-col items-center leading-tight">
          <span className="text-xl font-bold tracking-tight" style={{ color: navy }}>
            Kuizen <span style={{ color: academy }}>Academy</span>
          </span>
          <span className="text-[10px] uppercase tracking-[0.2em] font-semibold mt-0.5" style={{ color: muted }}>
            by Veltrix
          </span>
        </span>
      </span>
    );
  }

  // horizontal (default)
  return (
    <span className={`inline-flex items-center gap-3 ${className}`} role="img" aria-label="Kuizen Academy by Veltrix">
      <Mark size={height} color={color} concept={iconConcept} />
      <span className="flex flex-col leading-tight">
        <span className="text-lg font-bold tracking-tight" style={{ color: navy }}>
          Kuizen <span style={{ color: academy }}>Academy</span>
        </span>
        <span className="text-[9px] uppercase tracking-[0.25em] font-semibold" style={{ color: muted }}>
          by Veltrix
        </span>
      </span>
    </span>
  );
}

export default KuizenAcademyLogo;
