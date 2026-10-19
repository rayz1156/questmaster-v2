/**
 * Pengeluaran sijil (V2-003b). Diekstrak daripada laluan
 * POST /api/classes/[id]/certificates/issue supaya laluan itu dan alat MCP
 * (issue_certificates) memanggil fungsi yang sama; logik TIDAK disalin.
 *
 * Kebenaran disemak oleh pemanggil (semakPendidikKelas) dan sekali lagi di
 * dalam fungsi SQL qm_issue_certificates. Klien service role digunakan
 * HANYA untuk storage dan bacaan selepas kebenaran disahkan.
 *
 * KZ-029: gelung jana+muat naik PDF diekstrak kepada janaSemulaPdfSijil()
 * supaya laluan regenerate boleh menjana semula PDF sijil sedia ada dengan
 * templat aktif tanpa menukar kod, nama, tarikh atau status emel.
 */
import { getServiceSupabase } from '@/lib/supabase-route';
import { janaPdfSijil, formatTarikhBm } from '@/lib/sijil/janaPdf';
import { normaliseSusunAtur } from '@/lib/sijil/susunAtur';
import { pelanSijilBerbayar, pelanPemilikKelas } from '@/lib/sijil/pelanSijil';
import type { SupabaseClient } from '@supabase/supabase-js';

/** Templat yang diperlukan untuk jana PDF (lajur yang sama dibaca oleh laluan). */
export type TemplatSijil = {
  id: string;
  class_id: string;
  title: string;
  background_path: string | null;
  logo_path: string | null;
  layout: Record<string, unknown> | null;
  /** Medan isian sijil (V2-016b). */
  fields: Record<string, unknown> | null;
  /** Laluan imej tandatangan (V2-016b). */
  signature_path: string | null;
  /** Item pustaka asal (V2-016a); null untuk templat luar pustaka. */
  library_id?: string | null;
};

/** Satu sijil yang berjaya dikeluarkan dan (mungkin) dimuat naik PDFnya. */
export type HasilSijil = { id: string; code: string; pdf_path: string | null };

export type HasilKeluarkan = {
  issued: number;
  certificates: HasilSijil[];
  skipped: boolean;
};

/** Hasil RPC qm_issue_certificates selepas dinormalkan. */
export type HasilRpcKeluarkan = { issued_count: number; issued_ids: string[] };

/**
 * Normalkan hasil RPC qm_issue_certificates (KZ-007). PostgREST memulangkan
 * TATASUSUNAN [{issued_count, issued_ids}] untuk fungsi RETURNS TABLE, tetapi
 * sesetengah pemanggil (alat MCP) terima objek tunggal. Tanpa normalisasi ini
 * ids sentiasa [] dan PDF tidak pernah dijana (pdf_path kekal NULL).
 */
export function normaliseHasilKeluaran(
  issued: unknown,
): HasilRpcKeluarkan | null {
  const r = (Array.isArray(issued) ? issued[0] : issued) as
    | { issued_count?: number; issued_ids?: string[] }
    | null;
  if (!r || typeof r !== 'object') return null;
  return {
    issued_count: typeof r.issued_count === 'number' ? r.issued_count : 0,
    issued_ids: Array.isArray(r.issued_ids) ? r.issued_ids : [],
  };
}

/** Hasil RPC qm_rebind_certificates selepas dinormalkan (KZ-029). */
export type HasilRpcRebind = { updated_ids: string[]; skipped_count: number };

/**
 * Normalkan hasil RPC qm_rebind_certificates (KZ-029): PostgREST memulangkan
 * TATASUSUNAN [{updated_ids, skipped_count}] untuk fungsi RETURNS TABLE.
 */
export function normaliseHasilRebind(nilai: unknown): HasilRpcRebind | null {
  const r = (Array.isArray(nilai) ? nilai[0] : nilai) as
    | { updated_ids?: unknown; skipped_count?: unknown }
    | null;
  if (!r || typeof r !== 'object') return null;
  return {
    updated_ids: Array.isArray(r.updated_ids)
      ? r.updated_ids.filter((x): x is string => typeof x === 'string')
      : [],
    skipped_count: typeof r.skipped_count === 'number' ? r.skipped_count : 0,
  };
}

/** UUID sah (huruf kecil dan besar, versi 1 hingga 8 bentuk longgar). */
const REGEX_UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** Had maksimum sijil yang boleh dipilih untuk emel (selari dengan RPC). */
export const MAX_ID_EMEL = 200;

/**
 * Tapis senarai id sijil daripada badan permintaan (KZ-007): hanya rentetan
 * UUID yang sah, dihapus pendua, maksimum 200. Baris bukan array atau yang
 * tidak sah dibuang secara senyap (badan permintaan adalah input tidak dipercayai).
 */
export function tapiskanIdSijil(nilai: unknown): string[] {
  if (!Array.isArray(nilai)) return [];
  const keluar: string[] = [];
  for (const v of nilai) {
    if (typeof v === 'string' && REGEX_UUID.test(v) && !keluar.includes(v)) {
      keluar.push(v);
      if (keluar.length >= MAX_ID_EMEL) break;
    }
  }
  return keluar;
}

/** Baca templat kelas ini; pulangkan null jika tiada atau bukan milik kelas. */
export async function bacaTemplatKelas(
  supa: SupabaseClient,
  templateId: string,
  classId: string,
): Promise<TemplatSijil | null> {
  const { data: template } = await supa
    .from('qm_certificate_templates')
    .select('id, class_id, title, background_path, logo_path, layout, fields, signature_path, library_id')
    .eq('id', templateId)
    .eq('class_id', classId)
    .maybeSingle();
  return (template as TemplatSijil | null) ?? null;
}

/** Satu baris sijil yang PDFnya perlu dijana (isu atau jana semula). */
export type BarisPdfSijil = {
  id: string;
  code: string;
  name_snapshot: string;
  /** NOT NULL pada skema (0042). */
  program_snapshot: string;
  issued_at: string | null;
  /**
   * KZ-029: nama pengeluar sedia ada untuk jana semula; pemanggil (laluan
   * regenerate) membacanya daripada issued_by sijil asal. Bila kosong,
   * nama daripada issuedById (aliran issue) yang digunakan.
   */
  pengeluar?: string;
};

/**
 * KZ-029: jana semula PDF untuk baris sijil yang diberi dengan templat yang
 * diberi dan muat naik ke bucket `certificates` pada laluan sama
 * `<class_id>/<code>.pdf` (upsert: true), kemudian kemas kini pdf_path.
 * Gagal muat naik tidak menggugurkan sijil: pdf_path dibiarkan NULL dan
 * boleh dicuba semula. Dipakai oleh keluarkanSijil (isu) dan laluan
 * regenerate (kemas kini reka bentuk).
 */
export async function janaSemulaPdfSijil(
  svc: SupabaseClient,
  template: TemplatSijil,
  baris: BarisPdfSijil[],
  issuedById?: string,
): Promise<HasilSijil[]> {
  // Latar/logo: muat turun bait hanya jika templat memanggilnya.
  let latarBait: Uint8Array | undefined;
  let logoBait: Uint8Array | undefined;
  try {
    if (template.background_path) {
      const { data: d } = await svc.storage.from('certificate-assets').download(template.background_path);
      if (d) latarBait = new Uint8Array(await d.arrayBuffer());
    }
  } catch {
    latarBait = undefined;
  }
  try {
    if (template.logo_path) {
      const { data: d } = await svc.storage.from('certificate-assets').download(template.logo_path);
      if (d) logoBait = new Uint8Array(await d.arrayBuffer());
    }
  } catch {
    logoBait = undefined;
  }
  // Imej tandatangan (V2-016b): dimuat turun hanya jika templat memanggilnya.
  let tandatanganBait: Uint8Array | undefined;
  try {
    if (template.signature_path) {
      const { data: d } = await svc.storage.from('certificate-assets').download(template.signature_path);
      if (d) tandatanganBait = new Uint8Array(await d.arrayBuffer());
    }
  } catch {
    tandatanganBait = undefined;
  }

  // Normalkan layout (V2-015) sebelum PDF dijana: kunci asing dibuang dan
  // semua nombor diapit, untuk templat lama dan baharu sama.
  const layout = normaliseSusunAtur(template.layout);
  // Tera "Dijana dengan Kuizen" hanya untuk pelan percuma pemilik kelas (CTO V2-015).
  const tera = !pelanSijilBerbayar(await pelanPemilikKelas(svc, template.class_id));

  // Nama pengeluar untuk aliran issue (pendidik yang mengeluarkan sijil).
  let namaIssue: string | null = null;
  if (issuedById) {
    const { data: profilPengeluar } = await svc
      .from('qm_profiles')
      .select('display_name')
      .eq('id', issuedById)
      .maybeSingle();
    namaIssue = profilPengeluar?.display_name ?? 'Kuizen';
  }

  const hasil: HasilSijil[] = [];
  for (const s of baris) {
    const namaFail = `${template.class_id}/${s.code}.pdf`;
    const bait = await janaPdfSijil({
      nama: s.name_snapshot,
      program: s.program_snapshot,
      tarikh: formatTarikhBm(new Date(s.issued_at ?? Date.now())),
      pengeluar: s.pengeluar ?? namaIssue ?? 'Kuizen',
      kod: s.code,
      urlSah: `https://kuizen.fun/sijil/${s.code}`,
      latar: latarBait,
      logo: logoBait,
      tera,
      layout,
      // Medan isian dan imej tandatangan (V2-016b).
      medan: template.fields,
      tandatangan: tandatanganBait,
    });
    const { error: upErr } = await svc.storage
      .from('certificates')
      .upload(namaFail, bait, { contentType: 'application/pdf', upsert: true });
    if (upErr) {
      hasil.push({ id: s.id, code: s.code, pdf_path: null });
      continue;
    }
    await svc.from('qm_certificates').update({ pdf_path: namaFail }).eq('id', s.id);
    hasil.push({ id: s.id, code: s.code, pdf_path: namaFail });
  }
  return hasil;
}

/**
 * Keluarkan sijil melalui RPC qm_issue_certificates, jana PDF untuk setiap
 * sijil baharu (melalui janaSemulaPdfSijil) dan kemas kini pdf_path.
 * Tingkah laku issue TIDAK berubah berbanding sebelum KZ-029.
 */
export async function keluarkanSijil(
  supa: SupabaseClient,
  template: TemplatSijil,
  participantIds: string[] | null,
  issuedById: string,
): Promise<HasilKeluarkan> {
  const { data: issued, error: issueErr } = await supa.rpc('qm_issue_certificates', {
    p_template: template.id,
    p_participants: participantIds,
  });
  if (issueErr) {
    throw new Error(issueErr.message);
  }
  // KZ-007: PostgREST memulangkan tatasusunan [{issued_count, issued_ids}]
  // untuk fungsi RETURNS TABLE; normalisasi supaya ids tidak sentiasa [].
  const hasilRpc = normaliseHasilKeluaran(issued);
  const ids: string[] = hasilRpc?.issued_ids ?? [];
  if (ids.length === 0) {
    return { issued: 0, certificates: [], skipped: true };
  }

  // Baca sijil baharu dengan klien service role (baca selepas kebenaran).
  const svc = getServiceSupabase();
  const { data: baris } = await svc
    .from('qm_certificates')
    .select('id, code, name_snapshot, program_snapshot, class_id, issued_at, issued_by, template_id')
    .in('id', ids);

  // Baris PDF: nama pengeluar diselesaikan di dalam janaSemulaPdfSijil
  // daripada issuedById (pendidik yang mengeluarkan sijil).
  const barisPdf: BarisPdfSijil[] = (baris ?? []).map((s) => ({
    id: s.id,
    code: s.code,
    name_snapshot: s.name_snapshot,
    program_snapshot: s.program_snapshot,
    issued_at: s.issued_at,
  }));
  const hasil = await janaSemulaPdfSijil(svc, template, barisPdf, issuedById);

  return { issued: hasilRpc?.issued_count ?? 0, certificates: hasil, skipped: false };
}
