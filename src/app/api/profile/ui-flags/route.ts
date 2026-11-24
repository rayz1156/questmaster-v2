/**
 * GET/PATCH /api/profile/ui-flags (KZ-D)
 *
 * Bendera UI akaun pemanggil: ui_hide_encharge dan ui_hide_certificates.
 * Bendera hanya menyembunyikan UI; laluan API dan alat connector terus
 * berfungsi. Tulisan melalui klien Bearer pada profil sendiri.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase-route';
import { ralatJson } from '@/lib/i18n/ralatApi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;
  const { data, error } = await auth.supa
    .from('qm_profiles')
    .select('ui_hide_encharge, ui_hide_certificates')
    .eq('id', auth.user!.id)
    .maybeSingle();
  if (error) return ralatJson(error.message, 400);
  return NextResponse.json({ flags: data ?? { ui_hide_encharge: false, ui_hide_certificates: false } });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const kemas: Record<string, boolean> = {};
  for (const k of ['ui_hide_encharge', 'ui_hide_certificates']) {
    if (body[k] !== undefined) {
      if (typeof body[k] !== 'boolean') return ralatJson(`${k} must be true or false.`, 400);
      kemas[k] = body[k] as boolean;
    }
  }
  if (Object.keys(kemas).length === 0) return ralatJson('No fields to update.', 400);
  const { data, error } = await auth.supa
    .from('qm_profiles')
    .update(kemas)
    .eq('id', auth.user!.id)
    .select('ui_hide_encharge, ui_hide_certificates')
    .single();
  if (error) return ralatJson(error.message, 400);
  return NextResponse.json({ flags: data });
}
