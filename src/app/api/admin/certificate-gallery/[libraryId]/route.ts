/**
 * PATCH/DELETE /api/admin/certificate-gallery/[libraryId]
 *
 * Urus item galeri (V2-016a), pentadbir aktif sahaja (qm_admin_aktif di
 * pelayan), setiap tindakan diaudit dalam qm_audit_log dengan before/after
 * (corak 0047) dan alasan wajib 5 hingga 500 aksara untuk pemadaman.
 *
 *   PATCH: title, kind, text_tone, free_tier, published, sort_order, layout.
 *   DELETE: padam item; objek storan dipadam hanya jika tiada baris lain
 *          (templat kelas atau item pustaka) yang masih merujuknya.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireUser, getServiceSupabase } from '@/lib/supabase-route';
import { dalamHad } from '@/lib/hadKadar';
import { normaliseSusunAtur } from '@/lib/sijil/susunAtur';
import type { ItemPustaka } from '@/lib/sijil/pustaka';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const LAJUR_ITEM =
  'id, scope, owner_id, title, kind, text_tone, background_path, logo_path, layout, free_tier, published, sort_order';

async function adminAktif(supa: import('@supabase/supabase-js').SupabaseClient): Promise<boolean> {
  const { data } = await supa.rpc('qm_admin_aktif');
  return data === true;
}

/** Ringkas baris untuk meta audit: hanya medan yang dikelolakan manusia. */
function snapshot(item: ItemPustaka): Record<string, unknown> {
  return {
    title: item.title,
    kind: item.kind,
    text_tone: item.text_tone,
    free_tier: item.free_tier,
    published: item.published,
    sort_order: item.sort_order,
  };
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { libraryId: string } },
) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;
  const userId = auth.user!.id;

  if (!UUID.test(String(params.libraryId))) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }
  if (!dalamHad(`cert-gallery-admin:${userId}`)) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait a minute and try again.' },
      { status: 429 },
    );
  }
  if (!(await adminAktif(auth.supa))) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  // Baris sedia ada untuk before/after audit (RLS galeri pentadbir).
  const { data: sebelumData } = await auth.supa
    .from('qm_certificate_library')
    .select(LAJUR_ITEM)
    .eq('id', params.libraryId)
    .eq('scope', 'gallery')
    .maybeSingle();
  if (!sebelumData) {
    return NextResponse.json({ error: 'Gallery item not found.' }, { status: 404 });
  }
  const sebelum = sebelumData as ItemPustaka;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const kemas: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.title === 'string' && body.title.trim()) kemas.title = body.title.trim().slice(0, 120);
  if (body.kind === 'participation' || body.kind === 'achievement' || body.kind === null) {
    if ('kind' in body) kemas.kind = body.kind;
  }
  if (body.text_tone === 'light' || body.text_tone === 'dark') kemas.text_tone = body.text_tone;
  if (body.free_tier === true || body.free_tier === false) kemas.free_tier = body.free_tier;
  if (body.published === true || body.published === false) kemas.published = body.published;
  if (typeof body.sort_order === 'number' && Number.isFinite(body.sort_order)) {
    kemas.sort_order = Math.trunc(body.sort_order);
  }
  if (typeof body.layout === 'object' && body.layout !== null) {
    kemas.layout = normaliseSusunAtur(body.layout);
  }

  const { data: item, error: updErr } = await auth.supa
    .from('qm_certificate_library')
    .update(kemas)
    .eq('id', params.libraryId)
    .eq('scope', 'gallery')
    .select(LAJUR_ITEM)
    .single();
  if (updErr || !item) {
    return NextResponse.json({ error: updErr?.message ?? 'Could not update the item.' }, { status: 400 });
  }
  const selepas = item as ItemPustaka;

  const svc = getServiceSupabase();
  await svc.from('qm_audit_log').insert({
    actor_id: userId,
    action: 'certificate_gallery_update',
    target_type: 'certificate_library',
    target_id: params.libraryId,
    meta: { before: snapshot(sebelum), after: snapshot(selepas) },
  });

  return NextResponse.json({ item });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { libraryId: string } },
) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;
  const userId = auth.user!.id;

  if (!UUID.test(String(params.libraryId))) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }
  if (!dalamHad(`cert-gallery-admin:${userId}`)) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait a minute and try again.' },
      { status: 429 },
    );
  }
  if (!(await adminAktif(auth.supa))) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  // Alasan wajib 5 hingga 500 aksara (corak 0047).
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (reason.length < 5 || reason.length > 500) {
    return NextResponse.json(
      { error: 'A reason between 5 and 500 characters is required.' },
      { status: 400 },
    );
  }

  const { data: sebelumData } = await auth.supa
    .from('qm_certificate_library')
    .select(LAJUR_ITEM)
    .eq('id', params.libraryId)
    .eq('scope', 'gallery')
    .maybeSingle();
  if (!sebelumData) {
    return NextResponse.json({ error: 'Gallery item not found.' }, { status: 404 });
  }
  const sebelum = sebelumData as ItemPustaka;

  const { error: delErr } = await auth.supa
    .from('qm_certificate_library')
    .delete()
    .eq('id', params.libraryId)
    .eq('scope', 'gallery');
  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 400 });
  }

  // Audit ditulis SEBELUM pemadaman objek: rekod tidak bergantung pada
  // kerja storan yang boleh gagal.
  const svc = getServiceSupabase();
  await svc.from('qm_audit_log').insert({
    actor_id: userId,
    action: 'certificate_gallery_delete',
    target_type: 'certificate_library',
    target_id: params.libraryId,
    meta: { reason, before: snapshot(sebelum) },
  });

  // Objek storan: templat kelas yang memakai item ini masih menyimpan
  // laluan (library_id menjadi NULL melalui ON DELETE SET NULL), jadi
  // padam hanya jika tiada rujukan tinggal.
  for (const laluan of [sebelum.background_path, sebelum.logo_path]) {
    if (!laluan) continue;
    const { data: dipakai, error: ralatGuna } = await svc.rpc('qm_certificate_asset_in_use', { p_path: laluan });
    if (!ralatGuna && dipakai === false) { // CTO: ralat RPC = jangan padam
      await svc.storage.from('certificate-assets').remove([laluan]).catch(() => undefined);
    }
  }

  return NextResponse.json({ ok: true });
}
