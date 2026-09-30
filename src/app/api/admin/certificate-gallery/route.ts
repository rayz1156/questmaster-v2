/**
 * GET/POST /api/admin/certificate-gallery
 *
 * Galeri templat sijil Kuizen (V2-016a), untuk pentadbir aktif sahaja
 * (qm_admin_aktif melalui klien pengguna; semakan pelayan, bukan dipercayai
 * daripada UI). Setiap tindakan direkodkan dalam qm_audit_log melalui
 * klien service role selepas semakan lulus (corak laluan admin verify).
 *
 *   GET: senarai semua item galeri (termasuk draf), setiap satu dengan
 *        preview_url latar bertandatangan 10 minit.
 *   POST: cipta item galeri { title, kind?, text_tone?, free_tier?,
 *        sort_order? }; layout lalai ialah Grid Sijil Kuizen v1; item
 *        bermula TIDAK diterbitkan.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireUser, getServiceSupabase } from '@/lib/supabase-route';
import { dalamHad } from '@/lib/hadKadar';
import { susunAturGridV1 } from '@/lib/sijil/grid';
import type { ItemPustaka } from '@/lib/sijil/pustaka';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const LAJUR_ITEM =
  'id, scope, owner_id, title, kind, text_tone, background_path, logo_path, layout, free_tier, published, sort_order';

const SAAT_URL = 600;

/** Semakan pentadbir aktif pelayan; true hanya untuk admin/superadmin yang tidak digantung. */
async function adminAktif(supa: import('@supabase/supabase-js').SupabaseClient): Promise<boolean> {
  const { data } = await supa.rpc('qm_admin_aktif');
  return data === true;
}

export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;
  const userId = auth.user!.id;

  if (!dalamHad(`cert-gallery-admin:${userId}`)) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait a minute and try again.' },
      { status: 429 },
    );
  }

  if (!(await adminAktif(auth.supa))) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  // RLS galeri pentadbir membenarkan semua baris gallery.
  const { data, error } = await auth.supa
    .from('qm_certificate_library')
    .select(LAJUR_ITEM)
    .eq('scope', 'gallery')
    .order('sort_order', { ascending: true })
    .order('title', { ascending: true })
    .limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // URL pratonton latar melalui service role selepas semakan admin.
  const svc = getServiceSupabase();
  const items = await Promise.all(
    ((data as ItemPustaka[] | null) ?? []).map(async (i) => {
      if (!i.background_path) return { ...i, preview_url: null };
      const { data: signed } = await svc.storage
        .from('certificate-assets')
        .createSignedUrl(i.background_path, SAAT_URL);
      return { ...i, preview_url: signed?.signedUrl ?? null };
    }),
  );
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;
  const userId = auth.user!.id;

  if (!dalamHad(`cert-gallery-admin:${userId}`)) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait a minute and try again.' },
      { status: 429 },
    );
  }

  if (!(await adminAktif(auth.supa))) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const title = typeof body.title === 'string' ? body.title.trim().slice(0, 120) : '';
  if (!title) return NextResponse.json({ error: 'Title is required.' }, { status: 400 });

  const kind =
    body.kind === 'participation' || body.kind === 'achievement' ? body.kind : null;
  const textTone = body.text_tone === 'light' ? 'light' : 'dark';
  const freeTier = body.free_tier === true;
  const sortOrder =
    typeof body.sort_order === 'number' && Number.isFinite(body.sort_order)
      ? Math.trunc(body.sort_order)
      : 0;

  // Sisipan melalui klien pengguna: polisi insert galeri memerlukan
  // qm_admin_aktif() dan pengawal pustaka menghalang scope personal.
  const { data: item, error: insErr } = await auth.supa
    .from('qm_certificate_library')
    .insert({
      scope: 'gallery',
      title,
      kind,
      text_tone: textTone,
      layout: susunAturGridV1(textTone),
      free_tier: freeTier,
      published: false,
      sort_order: sortOrder,
      created_by: userId,
    })
    .select(LAJUR_ITEM)
    .single();
  if (insErr || !item) {
    return NextResponse.json({ error: insErr?.message ?? 'Could not create the item.' }, { status: 400 });
  }

  // Audit (corak 0047: meta dibina dengan jsonb di pelayan; insert melalui
  // service role selepas tindakan berjaya).
  const svc = getServiceSupabase();
  await svc.from('qm_audit_log').insert({
    actor_id: userId,
    action: 'certificate_gallery_create',
    target_type: 'certificate_library',
    target_id: (item as ItemPustaka).id,
    meta: { title, kind, text_tone: textTone, free_tier: freeTier, sort_order: sortOrder },
  });

  return NextResponse.json({ item }, { status: 201 });
}
