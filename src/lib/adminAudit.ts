// adminAudit.ts
// Pemformat log audit ruang kerja admin (V2-011a). Fungsi tulen tanpa
// sambungan pangkalan data. Teks paparan Bahasa Inggeris mengikut keputusan
// istilah antara muka (Quiz, bukan Kuiz). Fungsi di sini tidak pernah melontar.

export type AuditTone = 'neutral' | 'good' | 'warn' | 'danger';

export interface AuditLabel {
  label: string;
  tone: AuditTone;
}

// Tindakan sedia ada dalam produksi serta tindakan baharu migrasi 0047.
const LABELS: Record<string, AuditLabel> = {
  user_suspend: { label: 'Suspended account', tone: 'danger' },
  user_unsuspend: { label: 'Restored account', tone: 'good' },
  suspend: { label: 'Suspended account', tone: 'danger' },
  unsuspend: { label: 'Restored account', tone: 'good' },
  role_change: { label: 'Changed role', tone: 'warn' },
  set_plan: { label: 'Changed plan', tone: 'warn' },
  set_class_limits: { label: 'Changed class limits', tone: 'neutral' },
  approve: { label: 'Approved educator', tone: 'good' },
  unapprove: { label: 'Revoked approval', tone: 'warn' },
  delete_user: { label: 'Deleted user', tone: 'danger' },
  verify_email_manual: { label: 'Verified email', tone: 'good' },
  verify_email_manual_and_approve: { label: 'Verified email and approved', tone: 'good' },
  enable_capability: { label: 'Enabled upload', tone: 'neutral' },
  disable_capability: { label: 'Disabled upload', tone: 'neutral' },
  class_edit: { label: 'Edited class', tone: 'neutral' },
  class_delete: { label: 'Deleted class', tone: 'danger' },
  team_edit: { label: 'Edited team', tone: 'neutral' },
  team_delete: { label: 'Deleted team', tone: 'danger' },
  challenge_points: { label: 'Changed points', tone: 'warn' },
  moderation_override: { label: 'Overrode review', tone: 'warn' },
  password_reset_sent: { label: 'Sent password reset', tone: 'neutral' },
  class_archive: { label: 'Archived class', tone: 'neutral' },
  class_unarchive: { label: 'Restored class', tone: 'good' },
};

export function labelTindakan(action: string): AuditLabel {
  const dikenali = LABELS[action];
  if (dikenali) return dikenali;
  // Tindakan tidak dikenali: snake_case menjadi ayat, tone neutral.
  const ayat = action.replace(/_/g, ' ').trim();
  const label = ayat.length === 0 ? '' : ayat.charAt(0).toUpperCase() + ayat.slice(1);
  return { label, tone: 'neutral' };
}

// Nilai kepada rentetan untuk lajur bezaAudit: null dan undefined menjadi
// "(none)", objek dan tatasusunan diJSONkan, selebihnya dipaparkan terus.
function nilaiKepadaTeks(nilai: unknown): string {
  if (nilai === null || nilai === undefined) return '(none)';
  if (typeof nilai === 'object') return JSON.stringify(nilai);
  return String(nilai);
}

function objekBiasa(nilai: unknown): Record<string, unknown> | null {
  if (nilai === null || typeof nilai !== 'object' || Array.isArray(nilai)) return null;
  return nilai as Record<string, unknown>;
}

export interface AuditBeza {
  key: string;
  before: string;
  after: string;
}

// Membaca meta.before dan meta.after, kesatuan kunci tersusun. Meta tanpa
// before/after (bukan objek) menghasilkan senarai kosong. Tidak pernah melontar.
export function bezaAudit(meta: unknown): AuditBeza[] {
  try {
    const punca = objekBiasa(meta);
    if (!punca) return [];
    const sebelum = objekBiasa(punca['before']);
    const selepas = objekBiasa(punca['after']);
    if (!sebelum && !selepas) return [];
    const kunci = Array.from(new Set([
      ...Object.keys(sebelum || {}),
      ...Object.keys(selepas || {}),
    ])).sort();
    return kunci.map((key) => ({
      key,
      before: nilaiKepadaTeks(sebelum ? sebelum[key] : undefined),
      after: nilaiKepadaTeks(selepas ? selepas[key] : undefined),
    }));
  } catch {
    return [];
  }
}

// Alasan tindakan yang disimpan dalam meta.reason oleh RPC 0047.
export function alasanAudit(meta: unknown): string | null {
  try {
    const punca = objekBiasa(meta);
    const alasan = punca ? punca['reason'] : undefined;
    if (typeof alasan === 'string') return alasan;
    return null;
  } catch {
    return null;
  }
}