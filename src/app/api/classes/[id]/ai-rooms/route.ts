/**
 * GET  /api/classes/[id]/ai-rooms: senarai bilik AI dalam satu kelas.
 * POST /api/classes/[id]/ai-rooms: cipta bilik (hanya pendidik).
 *
 * KZ-033. RLS aktif tanpa polisi pada jadual qm_ai_*; semua akses
 * melalui service role setelah kebenaran disemak di sini.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireClassMember, requireUser, getServiceSupabase } from '@/lib/supabase-route';
import { janaKodBilik, ralatBilik, bacaJsonKecil } from '@/lib/bilikAi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const LAJUR_BILIK =
  'id, title, description, join_code, status, ai_enabled, context_enabled, context_window, model_id, created_at, updated_at, qm_ai_models(label)';

/** Semak pengguna ialah pemilik kelas atau ko-pendidik yang diterima. */
async function guruKelas(
  supa: ReturnType<typeof getServiceSupabase>,
  classId: string,
  userId: string,
): Promise<boolean> {
  const { data: kelas } = await supa
    .from('qm_classes')
    .select('owner_id')
    .eq('id', classId)
    .maybeSingle();
  if (kelas?.owner_id === userId) return true;
  const { data: edu } = await supa
    .from('qm_class_educators')
    .select('educator_id')
    .eq('class_id', classId)
    .eq('educator_id', userId)
    .not('accepted_at', 'is', null)
    .maybeSingle();
  return !!edu;
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  // Pendidik DAN peserta kelas dibenarkan melihat senarai bilik.
  const auth = await requireClassMember(req, params.id);
  if (auth.response) return auth.response;

  const supa = getServiceSupabase();
  const { data, error } = await supa
    .from('qm_ai_rooms')
    .select(LAJUR_BILIK)
    .eq('class_id', params.id)
    .order('created_at', { ascending: false });
  if (error) {
    return NextResponse.json({ error: 'Senarai bilik tidak dapat dibaca.' }, { status: 500 });
  }
  return NextResponse.json({ rooms: data ?? [] });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;
  const user = auth.user!;
  const supa = getServiceSupabase();

  const { data: kelas } = await supa
    .from('qm_classes')
    .select('id')
    .eq('id', params.id)
    .maybeSingle();
  if (!kelas) {
    return NextResponse.json({ error: 'Kelas tidak ditemui.' }, { status: 404 });
  }
  if (!(await guruKelas(supa, params.id, user.id))) {
    return ralatBilik(403, 'NOT_EDUCATOR', 'Hanya pendidik kelas boleh mencipta bilik.');
  }

  const hasil = await bacaJsonKecil(req);
  if (!hasil.ok) return hasil.response;
  const body = hasil.body;

  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (title.length < 1 || title.length > 80) {
    return NextResponse.json({ error: 'Tajuk bilik mesti 1 hingga 80 aksara.' }, { status: 400 });
  }
  let description: string | null = null;
  if (typeof body.description === 'string') {
    description = body.description.trim() || null;
  }
  if (description && description.length > 300) {
    return NextResponse.json({ error: 'Penerangan bilik maksimum 300 aksara.' }, { status: 400 });
  }

  // Model: lalai (is_default) jika tidak diberi; mesti didayakan.
  let modelId: string | null = null;
  if (typeof body.modelId === 'string' && body.modelId) {
    const { data: model } = await supa
      .from('qm_ai_models')
      .select('id')
      .eq('id', body.modelId)
      .eq('enabled', true)
      .maybeSingle();
    if (!model) {
      return NextResponse.json({ error: 'Model tidak ditemui atau tidak didayakan.' }, { status: 400 });
    }
    modelId = model.id;
  } else {
    const { data: lalai } = await supa
      .from('qm_ai_models')
      .select('id')
      .eq('enabled', true)
      .eq('is_default', true)
      .limit(1)
      .maybeSingle();
    if (lalai) modelId = lalai.id;
  }

  // Kod 6 aksara rawak; cuba semula jika bertembung dengan bilik lain.
  let room: Record<string, unknown> | null = null;
  let ralatAkhir: string | null = null;
  for (let cuba = 0; cuba < 5 && !room; cuba += 1) {
    const { data: b, error: e } = await supa
      .from('qm_ai_rooms')
      .insert({
        class_id: params.id,
        created_by: user.id,
        title,
        description,
        join_code: janaKodBilik(),
        model_id: modelId,
      })
      .select(LAJUR_BILIK)
      .single();
    if (e) {
      // 23505: kod sudah dipakai bilik lain; jana kod baharu.
      if (e.code === '23505') continue;
      ralatAkhir = e.message;
      break;
    }
    room = b as Record<string, unknown>;
  }
  if (!room) {
    console.error('[bilik-ai] cipta bilik gagal:', ralatAkhir ?? 'kod bertembung');
    return NextResponse.json({ error: 'Bilik tidak dapat dicipta.' }, { status: 500 });
  }
  return NextResponse.json({ room }, { status: 201 });
}