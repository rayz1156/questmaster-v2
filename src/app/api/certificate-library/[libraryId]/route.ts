/**
 * PATCH/DELETE /api/certificate-library/[libraryId]
 *
 * Urus "Templat saya" (V2-016a), milik pemanggil sahaja:
 *   PATCH: tukar tajuk (1 hingga 120 aksara) dan/atau layout kedudukan
 *          (V2-016b, termasuk course/details/signer/signature; sentiasa
 *          dinormalkan oleh normaliseSusunAtur).
 *   DELETE: padam item; objek storan dipadam HANYA jika tiada baris lain
 *          (templat kelas atau item pustaka) yang masih merujuk laluannya
 *          (qm_certificate_asset_in_use, selepas baris item dipadam).
 *
 * Semua tulisan melalui klien pengguna supaya RLS personal
 * (owner_id = auth.uid()) berkuat kuasa.
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
  if (!dalamHad(`cert-lib-edit:${userId}`)) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait a minute and try again.' },
      { status: 429 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const kemas: Record<string, unknown> = { updated_at: new Date().toISOString() };
  // Tajuk pilihan (V2-016b): wajib sah jika diberi; layout juga diterima
  // bersendirian. Sekurang-kurangnya satu medan mesti ada.
  if (typeof body.title === 'string') {
    const title = body.title.trim().slice(0, 120);
    if (!title) {
      return NextResponse.json({ error: 'Title is required.' }, { status: 400 });
    }
    kemas.title = title;
  }
  if (typeof body.layout === 'object' && body.layout !== null && !Array.isArray(body.layout)) {
    // Normalkan pada setiap tulisan layout (V2-016b).
    kemas.layout = normaliseSusunAtur(body.layout);
  }
  if (Object.keys(kemas).length === 1) {
    return NextResponse.json({ error: 'Title or layout is required.' }, { status: 400 });
  }

  // RLS mengecilkan kepada item personal milik sendiri sahaja.
  const { data, error } = await auth.supa
    .from('qm_certificate_library')
    .update(kemas)
    .eq('id', params.libraryId)
    .eq('scope', 'personal')
    .eq('owner_id', userId)
    .select(LAJUR_ITEM)
    .single();
  if (error || !data) {
    return NextResponse.json({ error: 'Template not found.' }, { status: 404 });
  }
  return NextResponse.json({ item: data });
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
  if (!dalamHad(`cert-lib-edit:${userId}`)) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait a minute and try again.' },
      { status: 429 },
    );
  }

  // Baca item dahulu (RLS: personal milik sendiri) untuk dapatkan laluan
  // objek sebelum baris dipadam.
  const { data: item } = await auth.supa
    .from('qm_certificate_library')
    .select(LAJUR_ITEM)
    .eq('id', params.libraryId)
    .eq('scope', 'personal')
    .eq('owner_id', userId)
    .maybeSingle();
  if (!item) {
    return NextResponse.json({ error: 'Template not found.' }, { status: 404 });
  }
  const itemPenuh = item as ItemPustaka;

  const { error: delErr } = await auth.supa
    .from('qm_certificate_library')
    .delete()
    .eq('id', params.libraryId)
    .eq('scope', 'personal')
    .eq('owner_id', userId);
  if (delErr) {
    return NextResponse.json({ error: 'Could not delete the template.' }, { status: 400 });
  }

  // Selepas baris dipadam, semak rujukan: templat kelas yang memakai item
  // ini masih menyimpan laluan (library_id menjadi NULL melalui ON DELETE
  // SET NULL) jadi objek mungkin masih diperlukan.
  const svc = getServiceSupabase();
  for (const laluan of [itemPenuh.background_path, itemPenuh.logo_path]) {
    if (!laluan) continue;
    const { data: dipakai, error: ralatGuna } = await svc.rpc('qm_certificate_asset_in_use', { p_path: laluan });
    if (!ralatGuna && dipakai === false) { // CTO: ralat RPC = jangan padam
      await svc.storage.from('certificate-assets').remove([laluan]).catch(() => undefined);
    }
  }

  return NextResponse.json({ ok: true });
}
