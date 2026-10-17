import * as React from 'react';
import type { CertificateConfig } from '@/lib/certificates/types';

const variantLabel: Record<string, string> = {
  completion: 'Certificate of Completion',
  achievement: 'Certificate of Achievement',
  compliance: 'Certificate of Compliance',
  hrdcorp: 'HRDCorp Claimable Certificate',
  mbot: 'MBOT Professional Certificate',
  microcredential: 'Microcredential Badge',
};

export function CertificateView({ config }: { config: CertificateConfig }) {
  const cd = typeof config.program.completionDate === 'string' ? new Date(config.program.completionDate) : config.program.completionDate;
  const dateStr = cd.toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' });
  return (
    <div className="relative bg-white shadow-elevated mx-auto" style={{ aspectRatio: '297 / 210', width: '100%', maxWidth: 900, background: 'linear-gradient(135deg,#fffef9,#ffffff 50%,#fdf6e3)', border: '8px solid #6576ff', outline: '2px solid #d97706', outlineOffset: 6, fontFamily: "'Nunito','Georgia',serif" }}>
      <Corner pos="tl"/><Corner pos="tr"/><Corner pos="bl"/><Corner pos="br"/>
      <div className="absolute inset-0 flex flex-col items-center justify-center px-12 text-center">
        <KAMark/>
        <p style={{ color: '#d97706', fontSize: 32, fontWeight: 600, marginTop: 16 }}>{variantLabel[config.variant]}</p>
        <div className="flex items-center gap-3 my-3">
          <span style={{ height: 1, width: 60, background: '#d97706' }}/>
          <span style={{ fontStyle: 'italic', color: '#475569' }}>awarded to</span>
          <span style={{ height: 1, width: 60, background: '#d97706' }}/>
        </div>
        <p style={{ fontStyle: 'italic', fontSize: 42, color: '#0f1e35', fontWeight: 600, lineHeight: 1.1, margin: '8px 0' }}>{config.learner.name}</p>
        <p style={{ fontFamily: "'Manrope',sans-serif", color: '#475569', fontSize: 14, marginTop: 8 }}>for successfully completing</p>
        <p style={{ fontSize: 26, color: '#6576ff', fontWeight: 600, marginTop: 6, maxWidth: '80%' }}>&ldquo;{config.program.name}&rdquo;</p>
        <p style={{ fontFamily: "'Manrope',sans-serif", color: '#475569', fontSize: 13, marginTop: 10 }}>{config.program.duration} hours of training · completed on {dateStr}</p>
        {config.program.accreditations.length > 0 && (
          <div className="flex flex-wrap gap-2 justify-center mt-5">
            {config.program.accreditations.map(a => (
              <span key={a} style={{ background: '#fef3c7', color: '#92400e', padding: '4px 12px', borderRadius: 9999, fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', fontFamily: "'Manrope',sans-serif" }}>{a}</span>
            ))}
          </div>
        )}
        {config.signatures && config.signatures.length > 0 && (
          <div className="flex gap-12 mt-6">
            {config.signatures.map((s, i) => (
              <div key={i} className="text-center">
                <div style={{ borderBottom: '1px solid #94a3b8', minWidth: 140, height: 28, marginBottom: 4 }}/>
                <p style={{ fontFamily: "'Manrope',sans-serif", fontSize: 11, color: '#0f1e35', fontWeight: 700 }}>{s.name}</p>
                <p style={{ fontFamily: "'Manrope',sans-serif", fontSize: 10, color: '#64748b' }}>{s.title}</p>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="absolute bottom-3 left-0 right-0 px-10 flex items-end justify-between" style={{ fontFamily: "'Manrope',sans-serif" }}>
        <div style={{ fontSize: 9, color: '#64748b', textAlign: 'left' }}>
          <p style={{ fontWeight: 700, color: '#0f1e35' }}>Issued via StafKita Akademi</p>
          <p>A Veltrix Technology Center Product</p>
          <p>An UPSI Spin-Off Initiative</p>
        </div>
        <div style={{ fontSize: 9, color: '#64748b', textAlign: 'right' }}>
          <p>Certificate ID: <span style={{ fontFamily: 'monospace', color: '#0f1e35' }}>{config.verification.id}</span></p>
          <p>Verify at: <span style={{ color: '#6576ff' }}>{config.verification.verifyUrl}</span></p>
        </div>
      </div>
    </div>
  );
}

function Corner({ pos }: { pos: 'tl'|'tr'|'bl'|'br' }) {
  const s: React.CSSProperties = { position: 'absolute', width: 60, height: 60 };
  if (pos === 'tl') { s.top = 12; s.left = 12; }
  if (pos === 'tr') { s.top = 12; s.right = 12; s.transform = 'scaleX(-1)'; }
  if (pos === 'bl') { s.bottom = 12; s.left = 12; s.transform = 'scaleY(-1)'; }
  if (pos === 'br') { s.bottom = 12; s.right = 12; s.transform = 'scale(-1,-1)'; }
  return (
    <svg style={s} viewBox="0 0 60 60" fill="none">
      <path d="M2 30 Q2 2 30 2" stroke="#d97706" strokeWidth="2"/>
      <path d="M8 30 Q8 8 30 8" stroke="#d97706" strokeWidth="1" opacity="0.5"/>
      <circle cx="2" cy="2" r="2.5" fill="#d97706"/>
      <circle cx="30" cy="2" r="1.5" fill="#d97706"/>
      <circle cx="2" cy="30" r="1.5" fill="#d97706"/>
    </svg>
  );
}

function KAMark({ size = 64 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <path d="M32 4 L56 16 V40 C56 50 44 58 32 60 C20 58 8 50 8 40 V16 Z" fill="#0f1e35"/>
      <path d="M32 10 L50 19 V38 C50 46 41 53 32 55 C23 53 14 46 14 38 V19 Z" fill="#6576ff"/>
      <path d="M24 22 V46 H28 V37 L36 46 H42 L32 34 L41 22 H35 L28 31 V22 Z" fill="#d97706"/>
      <circle cx="46" cy="18" r="3" fill="#d97706"/>
    </svg>
  );
}
