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
  users_export: { label: 'Exported users', tone: 'warn' },
  members_export: { label: 'Exported class members', tone: 'warn' },
  // V2-014a: eksport CSV Insights oleh laluan (pemilik, educator, admin).
  insights_export: { label: 'Exported class insights', tone: 'warn' },
  hunt_status: { label: 'Changed activity status', tone: 'neutral' },
  class_archive: { label: 'Archived class', tone: 'neutral' },
  class_unarchive: { label: 'Restored class', tone: 'good' },
  // V2-016a: galeri templat sijil Kuizen oleh admin (laluan
  // /api/admin/certificate-gallery, audit ditulis pelayan).
  certificate_gallery_create: { label: 'Created gallery template', tone: 'good' },
  certificate_gallery_update: { label: 'Updated gallery template', tone: 'neutral' },
  certificate_gallery_delete: { label: 'Deleted gallery template', tone: 'danger' },
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

/* =========================================================
 * Penapis log audit (V2-011c)
 * ========================================================= */

/** Baris qm_audit_log sebagaimana dipulangkan adminListAuditLogPaged. */
export interface BarisAudit {
  id: number;
  actor_id: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  meta: unknown;
  created_at: string;
}

/** Tempoh penapis Period pada halaman Audit. */
export type PeriodAudit = '24h' | '7d' | '30d' | 'all';

/** Jam tempoh setiap pilihan Period, 'all' bermakna tanpa had. */
export const JAM_PERIOD: Record<PeriodAudit, number | null> = {
  '24h': 24,
  '7d': 7 * 24,
  '30d': 30 * 24,
  all: null,
};

/**
 * Tarikh mula (ISO) untuk penapis Period; null bermakna semua masa.
 * Masa rujukan boleh disuntik untuk ujian.
 */
export function mulaPeriod(period: PeriodAudit, nowMs?: number): string | null {
  const jam = JAM_PERIOD[period];
  if (jam === null) return null;
  const kini = typeof nowMs === 'number' ? nowMs : Date.now();
  return new Date(kini - jam * 3_600_000).toISOString();
}

/**
 * Padanan satu baris terhadap tempoh Period. Baris rosak tarikh tidak
 * dipapar bila tempoh aktif (paling selamat: jangan tunjuk entri lama
 * yang tidak boleh dibanding).
 */
export function padanPeriod(r: BarisAudit, period: PeriodAudit, nowMs?: number): boolean {
  const mula = mulaPeriod(period, nowMs);
  if (mula === null) return true;
  const t = new Date(r.created_at).getTime();
  if (Number.isNaN(t)) return false;
  return t >= new Date(mula).getTime();
}

/** Ringkasan alasan untuk lajur Reason: satu baris, dipotong. */
export function ringkasAlasan(meta: unknown, max = 80): string {
  const alasan = alasanAudit(meta);
  if (!alasan) return '-';
  if (alasan.length <= max) return alasan;
  const ruang = alasan.lastIndexOf(' ', max);
  return (ruang > max * 0.5 ? alasan.slice(0, ruang) : alasan.slice(0, max)) + '...';
}

/**
 * Peta nama sasaran audit yang dibina halaman daripada profil, kelas,
 * aktiviti, challenge dan pasukan. Semua medan pilihan supaya halaman
 * boleh menghantar peta separa apabila satu sumber gagal dimuat.
 */
export interface PetaSasaranAudit {
  profil?: Record<string, string | null>;
  kelas?: Record<string, string | null>;
  hunt?: Record<string, string | null>;
  /** challenge_id -> tajuk; digunakan juga untuk pautan butiran aktiviti. */
  challenge?: Record<string, string | null>;
  /** challenge_id -> hunt_id untuk membina pautan. */
  challengeHunt?: Record<string, string>;
  team?: Record<string, string | null>;
}

export interface SasaranAudit {
  /** Nama sasaran jika dapat dipetakan, jika tidak null. */
  nama: string | null;
  /** Jenis sasaran untuk paparan: "User", "Class", "Activity", dsb. */
  jenis: string;
  /** Id dipendekkan kepada 8 aksara untuk fon mono kecil. */
  idPendek: string;
  /** Pautan butiran jika jenis sasaran ada halaman butiran admin. */
  href: string | null;
}

/** Label jenis sasaran daripada target_type log. */
export function jenisSasaran(targetType: string | null | undefined): string {
  const t = String(targetType || '').toLowerCase();
  if (t === 'profile' || t === 'user') return 'User';
  if (t === 'class') return 'Class';
  if (t === 'hunt' || t === 'activity') return 'Activity';
  if (t === 'challenge') return 'Challenge';
  if (t === 'team') return 'Team';
  if (t === 'submission') return 'Submission';
  // V2-016a: item galeri templat sijil (qm_certificate_library).
  if (t === 'certificate_library') return 'Gallery template';
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : 'Target';
}

/**
 * Paparan sasaran satu baris audit: nama dipetakan daripada peta jika
 * boleh; jika tidak, jenis sasaran dengan id 8 aksara. Pautan dibina
 * hanya untuk sasaran yang ada halaman butiran admin. UUID penuh tidak
 * pernah dipaparkan sebagai nama.
 */
export function sasaranAudit(r: BarisAudit, peta: PetaSasaranAudit): SasaranAudit {
  const id = r.target_id || '';
  const jenis = jenisSasaran(r.target_type);
  const idPendek = id ? id.slice(0, 8) : '';
  const t = String(r.target_type || '').toLowerCase();
  let nama: string | null = null;
  let href: string | null = null;
  if (t === 'profile' || t === 'user') {
    nama = (peta.profil?.[id] || '').trim() || null;
    href = id ? `/admin/users/${id}` : null;
  } else if (t === 'class') {
    nama = (peta.kelas?.[id] || '').trim() || null;
    href = id ? `/admin/classes/${id}` : null;
  } else if (t === 'hunt' || t === 'activity') {
    nama = (peta.hunt?.[id] || '').trim() || null;
    href = id ? `/admin/hunts/${id}` : null;
  } else if (t === 'challenge') {
    nama = (peta.challenge?.[id] || '').trim() || null;
    const huntId = peta.challengeHunt?.[id];
    href = huntId ? `/admin/hunts/${huntId}` : null;
  } else if (t === 'team') {
    nama = (peta.team?.[id] || '').trim() || null;
  }
  return { nama, jenis, idPendek, href };
}

/**
 * Carian sasaran di klien terhadap senarai yang sudah dimuat: id penuh,
 * id pendek, nama sasaran, nama pelaku atau nama kelas/pengguna dalam
 * teks paparan. Tidak peka huruf besar.
 */
export function padanCarianSasaran(
  r: BarisAudit,
  q: string,
  peta: PetaSasaranAudit,
  namaPelaku: Record<string, string | null>,
): boolean {
  const jarum = q.trim().toLowerCase();
  if (!jarum) return true;
  if (r.target_id && r.target_id.toLowerCase().includes(jarum)) return true;
  if (r.target_id && r.target_id.slice(0, 8).toLowerCase().includes(jarum)) return true;
  const sasaran = sasaranAudit(r, peta);
  if (sasaran.nama && sasaran.nama.toLowerCase().includes(jarum)) return true;
  if (jenisSasaran(r.target_type).toLowerCase().includes(jarum)) return true;
  const pelaku = r.actor_id ? (namaPelaku[r.actor_id] || '').trim() : '';
  if (pelaku && pelaku.toLowerCase().includes(jarum)) return true;
  return false;
}

/**
 * Susunan tindakan untuk pilihan Action: hanya tindakan yang betul-betul
 * wujud dalam baris yang dimuat, menaik mengikut abjad.
 */
export function senaraiTindakan(rows: BarisAudit[]): string[] {
  return Array.from(new Set(rows.map((r) => r.action).filter(Boolean))).sort();
}

/**
 * Id pelaku yang wujud dalam baris, menaik mengikut abjad; halaman peta
 * nama pelaku daripada adminListProfiles untuk pilihan Actor.
 */
export function senaraiPelaku(rows: BarisAudit[]): string[] {
  return Array.from(new Set(rows.map((r) => r.actor_id).filter((x): x is string => !!x))).sort();
}