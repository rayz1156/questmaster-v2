/**
 * KZ-043 A2: simpan pilihan bahasa antara muka dalam profil pengguna.
 *
 * POST sahaja: badan { bahasa: 'en' | 'ms' }. Laluan ini hanya mengemas
 * kini baris profil sendiri dan hanya lajur `bahasa`, menggunakan klien
 * yang terikat kepada pengguna (RLS + qm_guard_profile_privileges),
 * bukan klien service role. Tiada GET: profil dibaca terus oleh klien.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase-route';
import { ralatJson } from '@/lib/i18n/ralatApi';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return ralatJson('Invalid request body', 400);
  }

  // Hanya dua nilai sah yang diterima; jangan guna sahBahasa di sini kerana
  // ia meluluskan nilai merapuh sebagai 'en', dan tiket menuntut 400 yang jelas.
  const bahasa = (body as { bahasa?: unknown } | null)?.bahasa;
  if (bahasa !== 'en' && bahasa !== 'ms') {
    return ralatJson('Invalid language', 400);
  }

  // Klien pengguna (auth.supa), bukan service role: RLS dan guard profil
  // memastikan hanya baris sendiri dan hanya lajur bahasa berubah.
  const { error } = await auth.supa
    .from('qm_profiles')
    .update({ bahasa })
    .eq('id', auth.user!.id);

  if (error) return ralatJson('Failed to save language preference', 500);

  return NextResponse.json({ ok: true, bahasa });
}
