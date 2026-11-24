/**
 * Aliran pautan kemas kini nama oleh peserta (KZ-E). Pelayan sahaja,
 * service role. Laluan awam /api/nama/[token] memanggil fungsi ini selepas
 * bentuk token disahkan; token itu sendiri ialah kebenarannya.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { hashToken } from '@/lib/sijil/namaPenuh';
import { janaSemulaIkutTemplat } from '@/lib/sijil/namaSijil';
import { normaliseSusunAtur } from '@/lib/sijil/susunAtur';
import { formatTarikhBm } from '@/lib/sijil/janaPdf';
import { mulaPekerja } from '@/lib/sijil/pekerjaEmel';

export type BarisToken = {
  id: string;
  participant_id: string;
  class_id: string;
  certificate_id: string | null;
  template_id: string | null;
  purpose: 'after_issue' | 'before_issue';
  status: 'pending' | 'used' | 'expired' | 'revoked';
  expires_at: string;
  failed_attempts: number;
  superseded?: boolean;
  created_by: string | null;
};

export async function cariToken(svc: SupabaseClient, token: string): Promise<BarisToken | null> {
  const { data } = await svc
    .from('qm_name_update_tokens')
    .select('id, participant_id, class_id, certificate_id, template_id, purpose, status, expires_at, failed_attempts, superseded, created_by')
    .eq('token_hash', hashToken(token))
    .maybeSingle();
  return (data as BarisToken | null) ?? null;
}

/** Status berkesan (pending yang sudah lepas tarikh dianggap expired). */
export function statusBerkesan(t: BarisToken): BarisToken['status'] {
  if (t.status === 'pending' && new Date(t.expires_at).getTime() <= Date.now()) return 'expired';
  return t.status;
}

/**
 * Maklumat untuk halaman awam: kursus, tarikh, nama semasa dan pratonton
 * (latar templat bertandatangan 10 minit dan kedudukan nama). TIADA e-mel
 * atau maklumat peserta lain.
 */
export async function maklumatHalaman(svc: SupabaseClient, t: BarisToken) {
  const { data: kelas } = await svc.from('qm_classes').select('name').eq('id', t.class_id).maybeSingle();
  // Templat: sijil token, templat token, atau templat aktif kelas.
  let templateId = t.template_id;
  type SijilRingkas = { name_snapshot: string; program_snapshot: string; issued_at: string | null; template_id: string };
  type TplRingkas = { background_path: string | null; layout: unknown; fields: Record<string, string> | null };
  let sijil = null as SijilRingkas | null;
  if (t.certificate_id) {
    const { data } = await svc
      .from('qm_certificates')
      .select('name_snapshot, program_snapshot, issued_at, template_id')
      .eq('id', t.certificate_id)
      .maybeSingle();
    sijil = (data as SijilRingkas | null) ?? null;
    if (sijil) templateId = sijil.template_id;
  }
  if (!templateId) {
    const { data } = await svc
      .from('qm_certificate_templates')
      .select('id')
      .eq('class_id', t.class_id)
      .eq('is_active', true)
      .maybeSingle();
    templateId = (data as { id?: string } | null)?.id ?? null;
  }
  let tpl = null as TplRingkas | null;
  if (templateId) {
    const { data } = await svc
      .from('qm_certificate_templates')
      .select('background_path, layout, fields')
      .eq('id', templateId)
      .eq('class_id', t.class_id)
      .maybeSingle();
    tpl = (data as TplRingkas | null) ?? null;
  }
  const f = (tpl?.fields ?? {}) as Record<string, string>;
  const { data: kn } = await svc
    .from('qm_class_certificate_names')
    .select('certificate_name')
    .eq('class_id', t.class_id)
    .eq('user_id', t.participant_id)
    .maybeSingle();
  const { data: pr } = await svc
    .from('qm_profiles')
    .select('certificate_name, display_name')
    .eq('id', t.participant_id)
    .maybeSingle();
  const namaSemasa = sijil?.name_snapshot ?? kn?.certificate_name ?? pr?.certificate_name ?? pr?.display_name ?? '';

  let latarUrl: string | null = null;
  if (tpl?.background_path) {
    const { data: signed } = await svc.storage.from('certificate-assets').createSignedUrl(tpl.background_path, 600);
    latarUrl = signed?.signedUrl ?? null;
  }
  const layout = normaliseSusunAtur(tpl?.layout ?? {});
  const tarikh = f.date_start
    ? f.date_end && f.date_end !== f.date_start
      ? `${formatTarikhBm(new Date(f.date_start))} hingga ${formatTarikhBm(new Date(f.date_end))}`
      : formatTarikhBm(new Date(f.date_start))
    : sijil?.issued_at
      ? formatTarikhBm(new Date(sijil.issued_at))
      : null;

  return {
    course: sijil?.program_snapshot || f.course || kelas?.name || '',
    date: tarikh,
    location: f.location || null,
    current_name: namaSemasa,
    purpose: t.purpose,
    expires_at: t.expires_at,
    preview: {
      background_url: latarUrl,
      name: layout.mode === 'full_background' && layout.name ? layout.name : null,
    },
  };
}

type HasilRpc = {
  token_id: string;
  participant_id: string;
  class_id: string;
  purpose: 'after_issue' | 'before_issue';
  template_id: string | null;
  created_by: string | null;
  old_name: string | null;
  new_name: string;
  certificate_ids: string[];
};

/** Masukkan sijil ke baris gilir e-mel (idempoten: baris aktif dilangkau). */
async function masukGilir(
  svc: SupabaseClient,
  r: HasilRpc,
  certificateId: string,
  kind: 'certificate' | 'name_updated',
): Promise<boolean> {
  const { error } = await svc.from('qm_certificate_email_queue').insert({
    certificate_id: certificateId,
    class_id: r.class_id,
    participant_id: r.participant_id,
    requested_by: r.created_by,
    idempotency_key: `${certificateId}:${kind}:${r.token_id}`,
    kind,
  });
  return !error;
}

/**
 * Selepas qm_confirm_name_token berjaya: jana semula (after_issue) atau
 * keluarkan (before_issue) sijil, kemudian masukkan ke baris gilir e-mel.
 * Kegagalan di sini tidak membatalkan pengesahan nama; ia dilog.
 */
/** Rekod kegagalan susulan pada token supaya pendidik melihatnya dalam status. */
async function rekodRalat(svc: SupabaseClient, tokenId: string, mesej: string | null): Promise<void> {
  await svc.from('qm_name_update_tokens').update({ followup_error: mesej }).eq('id', tokenId);
}

export async function selepasPengesahan(svc: SupabaseClient, r: HasilRpc): Promise<{ queued: number }> {
  let ids: string[] = [];
  let kind: 'certificate' | 'name_updated' = 'name_updated';
  try {
    if (r.purpose === 'after_issue') {
      ids = r.certificate_ids ?? [];
    } else {
      const { data, error } = await svc.rpc('qm_issue_certificate_for_token', { p_token_id: r.token_id });
      if (error) {
        console.error('[nama] keluarkan sijil selepas pengesahan gagal:', error.message);
        await rekodRalat(svc, r.token_id, `Certificate could not be issued: ${error.message}`);
        return { queued: 0 };
      }
      ids = data ? [String(data)] : [];
      kind = 'certificate';
    }
    if (ids.length === 0) {
      if (r.purpose === 'after_issue') await rekodRalat(svc, r.token_id, 'No active certificate to regenerate.');
      return { queued: 0 };
    }
    // Jana semula satu demi satu: sijil yang PDFnya gagal TIDAK dihantar,
    // supaya peserta tidak menerima PDF bernama lama.
    const gagal: string[] = [];
    let queued = 0;
    for (const id of ids) {
      const pdf = await janaSemulaIkutTemplat(svc, r.class_id, [id]);
      if (pdf.regenerated < 1) {
        gagal.push(id);
        continue;
      }
      if (await masukGilir(svc, r, id, kind)) queued += 1;
    }
    await rekodRalat(svc, r.token_id, gagal.length > 0 ? `PDF regeneration failed for ${gagal.length} certificate(s).` : null);
    if (queued > 0) mulaPekerja();
    return { queued };
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    console.error('[nama] selepas pengesahan gagal:', m);
    await rekodRalat(svc, r.token_id, `Follow-up failed: ${m}`).catch(() => undefined);
    return { queued: 0 };
  }
}
