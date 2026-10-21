// KZ-031: urus kunci API pencipta oleh pencipta yang log masuk.
// GET senarai kunci, POST jana kunci (dipaparkan sekali sahaja dalam
// respons), PATCH batalkan kunci (revoked_at). RLS lms_api_keys milik
// sendiri menyempadkan akses; key_hash tidak pernah dipulangkan.
import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase-route';
import { awalanKunci, cincangKunci, janaKunciApi } from '@/lib/integrasi-pay';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;
  const { data, error } = await auth.supa
    .from('lms_api_keys')
    .select('id, label, key_prefix, created_at, last_used_at, revoked_at')
    .eq('user_id', auth.user!.id)
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ kunci: data });
}

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;

  let mentah: unknown;
  try {
    mentah = await req.json();
  } catch {
    return NextResponse.json({ error: 'Badan bukan JSON yang sah' }, { status: 400 });
  }
  const o = (mentah ?? {}) as Record<string, unknown>;
  const label = typeof o.label === 'string' ? o.label.trim() : '';
  if (!label || label.length > 120) {
    return NextResponse.json({ error: 'Label tidak sah (1 hingga 120 aksara)' }, { status: 400 });
  }

  // Kunci hanya berguna jika profil pencipta wujud (kursus dijual milik pencipta)
  const { data: pencipta } = await auth.supa
    .from('lms_creators')
    .select('id')
    .eq('owner_id', auth.user!.id)
    .maybeSingle();
  if (!pencipta) {
    return NextResponse.json({ error: 'Profil pencipta diperlukan' }, { status: 400 });
  }

  const kunci = janaKunciApi();
  const { data: baris, error } = await auth.supa
    .from('lms_api_keys')
    .insert({
      user_id: auth.user!.id,
      label,
      key_prefix: awalanKunci(kunci),
      key_hash: cincangKunci(kunci),
    })
    .select('id, key_prefix, created_at')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Kunci penuh dipulangkan SEKALI sahaja; DB hanya simpan awalan + cincangan
  return NextResponse.json({ kunci, meta: baris }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;

  let mentah: unknown;
  try {
    mentah = await req.json();
  } catch {
    return NextResponse.json({ error: 'Badan bukan JSON yang sah' }, { status: 400 });
  }
  const o = (mentah ?? {}) as Record<string, unknown>;
  if (typeof o.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(o.id)) {
    return NextResponse.json({ error: 'id kunci tidak sah' }, { status: 400 });
  }

  const { data, error } = await auth.supa
    .from('lms_api_keys')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', o.id)
    .eq('user_id', auth.user!.id)
    .is('revoked_at', null)
    .select('id, revoked_at')
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Kunci tidak dijumpai' }, { status: 404 });
  return NextResponse.json({ ok: true, kunci: data });
}
