/**
 * Tetapan lalai sijil pendidik (KZ-B): bacaan, normalisasi dan pewarisan.
 * Satu baris qm_certificate_defaults bagi setiap pendidik.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { normaliseSusunAtur, type SusunAturSijil } from '@/lib/sijil/susunAtur';

export type TemplatEmel = {
  subject?: string;
  body?: string;
  /** KZ-E: isi e-mel permintaan nama sebelum sijil dikeluarkan. */
  body_before_issue?: string;
  from_name?: string;
  reply_to?: string;
};

export type TetapanLalai = {
  educator_id: string;
  background_path: string | null;
  logo_path: string | null;
  signature_path: string | null;
  signer_name: string | null;
  signer_title: string | null;
  layout: SusunAturSijil | Record<string, unknown>;
  email_template: TemplatEmel;
  updated_at?: string;
};

export const LAJUR_LALAI =
  'educator_id, background_path, logo_path, signature_path, signer_name, signer_title, layout, email_template, updated_at';

/** Pemboleh ubah yang disokong dalam subjek dan isi e-mel sijil. */
export const PEMBOLEH_UBAH_EMEL = ['{nama}', '{kursus}', '{tarikh}', '{tempat}', '{kod_sijil}', '{pautan_pengesahan}', '{nama_semasa}', '{pautan_kemaskini_nama}'];

const RE_EMEL = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/;

/**
 * Normalkan templat e-mel. Kunci asing dibuang; rentetan kosong membuang
 * kunci itu. Pulangkan ralat (BM) bila nilai tidak sah.
 */
export function normaliseTemplatEmel(input: unknown): { nilai?: TemplatEmel; ralat?: string } {
  if (input === null) return { nilai: {} };
  if (typeof input !== 'object' || Array.isArray(input)) return { ralat: 'email_template must be an object.' };
  const s = input as Record<string, unknown>;
  const out: TemplatEmel = {};
  const had: Record<keyof TemplatEmel, number> = { subject: 200, body: 8000, body_before_issue: 8000, from_name: 80, reply_to: 200 };
  for (const k of Object.keys(had) as (keyof TemplatEmel)[]) {
    const v = s[k];
    if (v === undefined || v === null) continue;
    if (typeof v !== 'string') return { ralat: `email_template.${k} must be a string.` };
    const t = k === 'body' || k === 'body_before_issue' ? v.replace(/\r\n/g, '\n').trim() : v.replace(/[\r\n]+/g, ' ').trim();
    if (!t) continue;
    if (t.length > had[k]) return { ralat: `email_template.${k} exceeds ${had[k]} characters.` };
    if (k === 'reply_to' && !RE_EMEL.test(t)) return { ralat: 'email_template.reply_to is not a valid email address.' };
    out[k] = t;
  }
  return { nilai: out };
}

/** Pendidik aktif (educator, admin, superadmin; tidak digantung). */
export async function semakPendidikAktif(supa: SupabaseClient, userId: string): Promise<boolean> {
  const { data } = await supa.from('qm_profiles').select('role, suspended').eq('id', userId).maybeSingle();
  return !!data && !data.suspended && ['educator', 'admin', 'superadmin'].includes(String(data.role));
}

/** Baca tetapan lalai pemanggil (klien Bearer, RLS milik sendiri). */
export async function bacaTetapanLalai(supa: SupabaseClient, userId: string): Promise<TetapanLalai | null> {
  const { data } = await supa
    .from('qm_certificate_defaults')
    .select(LAJUR_LALAI)
    .eq('educator_id', userId)
    .maybeSingle();
  return (data as TetapanLalai | null) ?? null;
}

/** Layout lalai yang sudah dinormalkan, atau undefined jika kosong. */
export function layoutLalai(t: TetapanLalai | null): SusunAturSijil | undefined {
  if (!t || !t.layout || Object.keys(t.layout).length === 0) return undefined;
  return normaliseSusunAtur(t.layout);
}

/** Medan penandatangan daripada tetapan lalai, untuk digabung ke fields. */
export function medanPenandatangan(t: TetapanLalai | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (t?.signer_name) out.signer_name = t.signer_name;
  if (t?.signer_title) out.signer_title = t.signer_title;
  return out;
}

/** Bentuk awam (tanpa laluan storan mentah) untuk respons API. */
export function bentukAwam(t: TetapanLalai | null) {
  if (!t) {
    return {
      exists: false,
      has_background: false,
      has_logo: false,
      has_signature: false,
      signer_name: null,
      signer_title: null,
      layout: {},
      email_template: {},
      supported_email_variables: PEMBOLEH_UBAH_EMEL,
    };
  }
  return {
    exists: true,
    has_background: !!t.background_path,
    has_logo: !!t.logo_path,
    has_signature: !!t.signature_path,
    signer_name: t.signer_name,
    signer_title: t.signer_title,
    layout: t.layout ?? {},
    email_template: t.email_template ?? {},
    supported_email_variables: PEMBOLEH_UBAH_EMEL,
    updated_at: t.updated_at,
  };
}

/**
 * Semakan bebas KZ-B (T1): salin aset lalai ke folder templat dan lekatkan.
 * Hanya bila pelan pemilik kelas berbayar (selari asset-finalize). Objek
 * disalin dengan service role SELEPAS pemanggil disahkan pendidik kelas;
 * kemas kini templat melalui klien Bearer (RLS dan pencetus pelan).
 * Gagal kemas kini: objek salinan dibuang. Aset lama templat dipadam hanya
 * jika tiada rujukan lain.
 */
export async function salinAsetLalai(
  supa: SupabaseClient,
  lalai: TetapanLalai,
  classId: string,
  templateId: string,
  jenis: { background?: boolean; logo?: boolean; signature?: boolean },
): Promise<{ dikemaskini: Record<string, unknown> | null; disalin: string[]; dilangkau_pelan: boolean }> {
  const { getServiceSupabase } = await import('@/lib/supabase-route');
  const { pelanSijilBerbayar, pelanPemilikKelas } = await import('@/lib/sijil/pelanSijil');
  const { salinAsetKeTemplat, buangObjek, padamJikaTidakDipakai } = await import('@/lib/sijil/asetMasuk');

  const peta: [keyof typeof jenis, 'background_path' | 'logo_path' | 'signature_path'][] = [
    ['background', 'background_path'],
    ['logo', 'logo_path'],
    ['signature', 'signature_path'],
  ];
  const diminta = peta.filter(([k, lajur]) => jenis[k] && lalai[lajur]);
  if (diminta.length === 0) return { dikemaskini: null, disalin: [], dilangkau_pelan: false };
  if (!pelanSijilBerbayar(await pelanPemilikKelas(supa, classId))) {
    return { dikemaskini: null, disalin: [], dilangkau_pelan: true };
  }

  const svc = getServiceSupabase();
  const { data: lama } = await supa
    .from('qm_certificate_templates')
    .select('background_path, logo_path, signature_path')
    .eq('id', templateId)
    .eq('class_id', classId)
    .maybeSingle();
  const kemas: Record<string, string> = {};
  const baru: string[] = [];
  const disalin: string[] = [];
  for (const [k, lajur] of diminta) {
    const p = await salinAsetKeTemplat(svc, String(lalai[lajur]), classId, templateId, k);
    if (p) {
      kemas[lajur] = p;
      baru.push(p);
      disalin.push(k);
    }
  }
  if (baru.length === 0) return { dikemaskini: null, disalin: [], dilangkau_pelan: false };

  const { data, error } = await supa
    .from('qm_certificate_templates')
    .update({ ...kemas, updated_at: new Date().toISOString() })
    .eq('id', templateId)
    .eq('class_id', classId)
    .select('id, title, criteria, background_path, logo_path, layout, fields, signature_path')
    .single();
  if (error || !data) {
    await buangObjek(svc, baru);
    return { dikemaskini: null, disalin: [], dilangkau_pelan: false };
  }
  for (const [, lajur] of diminta) {
    const p = (lama as Record<string, string | null> | null)?.[lajur];
    if (p && p !== kemas[lajur]) await padamJikaTidakDipakai(svc, p);
  }
  return { dikemaskini: data as Record<string, unknown>, disalin, dilangkau_pelan: false };
}
