/**
 * Pengeluaran sijil (V2-003b). Diekstrak daripada laluan
 * POST /api/classes/[id]/certificates/issue supaya laluan itu dan alat MCP
 * (issue_certificates) memanggil fungsi yang sama; logik TIDAK disalin.
 *
 * Kebenaran disemak oleh pemanggil (semakPendidikKelas) dan sekali lagi di
 * dalam fungsi SQL qm_issue_certificates. Klien service role digunakan
 * HANYA untuk storage dan bacaan selepas kebenaran disahkan.
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

/**
 * Keluarkan sijil melalui RPC qm_issue_certificates, jana PDF untuk setiap
 * sijil baharu, muat naik ke bucket `certificates` pada `<class_id>/<code>.pdf`
 * dan kemas kini `pdf_path`. Gagal muat naik tidak menggugurkan sijil:
 * pdf_path dibiarkan NULL dan boleh dijana semula kelak.
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
  const ids: string[] = issued?.issued_ids ?? [];
  if (ids.length === 0) {
    return { issued: 0, certificates: [], skipped: true };
  }

  // Baca sijil baharu dengan klien service role (baca selepas kebenaran).
  const svc = getServiceSupabase();
  const { data: baris } = await svc
    .from('qm_certificates')
    .select('id, code, name_snapshot, program_snapshot, class_id, issued_at, issued_by, template_id')
    .in('id', ids);

  // Nama pengeluar untuk PDF (pendidik yang mengeluarkan sijil).
  const { data: profilPengeluar } = await svc
    .from('qm_profiles')
    .select('display_name')
    .eq('id', issuedById)
    .maybeSingle();
  const pengeluarNama = profilPengeluar?.display_name ?? 'Kuizen';

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

  const hasil: HasilSijil[] = [];
  for (const s of baris ?? []) {
    const namaFail = `${template.class_id}/${s.code}.pdf`;
    const bait = await janaPdfSijil({
      nama: s.name_snapshot,
      program: s.program_snapshot,
      tarikh: formatTarikhBm(new Date(s.issued_at ?? Date.now())),
      pengeluar: pengeluarNama ?? 'Kuizen',
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

  return { issued: issued?.issued_count ?? 0, certificates: hasil, skipped: false };
}
