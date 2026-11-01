/**
 * GET /api/ai-rooms/by-code/[code]: maklumat bilik untuk halaman
 * /bilik/[code] (KZ-033).
 *
 * Kod mesti 6 aksara daripada abjad bilik (400 jika format salah,
 * 404 jika tiada bilik memakai kod itu). Kemudian semakan akses penuh
 * (log masuk + ahli kelas). Pulangkan maklumat bilik + role + muted +
 * aiConfigured (adakah kunci penyedia wujud di pelayan; kunci itu
 * sendiri tidak pernah dedahkan).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase, requireUser } from '@/lib/supabase-route';
import { aksesBilik, REGEX_KOD_BILIK, modelUntukBilik } from '@/lib/bilikAi';
import { penyediaSedia } from '@/lib/ai/penyedia';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function GET(req: NextRequest, { params }: { params: { code: string } }) {
  const kod = String(params.code || '').trim().toUpperCase();
  if (!REGEX_KOD_BILIK.test(kod)) {
    return NextResponse.json(
      { error: 'Kod bilik mesti 6 aksara daripada abjad kod bilik.' },
      { status: 400 },
    );
  }

  // Pembetulan CTO (kzsec #1): log masuk dahulu, supaya pemanggil tanpa
  // sesi tidak dapat membezakan kod wujud (401) dengan kod tiada (404).
  const auth = await requireUser(req);
  if (auth.response) return auth.response;

  // Cari bilik dengan kod ini sebelum semakan akses (404 jika tiada).
  const cari = getServiceSupabase();
  const { data: baris } = await cari
    .from('qm_ai_rooms')
    .select('id')
    .eq('join_code', kod)
    .maybeSingle();
  if (!baris) {
    return NextResponse.json({ error: 'Kod bilik tidak ditemui.' }, { status: 404 });
  }

  const akses = await aksesBilik(req, baris.id);
  if (akses.response) return akses.response;

  const bilik = akses.bilik!;
  const supa = akses.supa!;
  // KZ-034: gunakan modelUntukBilik, bukan bacaan terus model_id, supaya
  // bilik yang modelnya dimatikan jatuh ke model lalai yang didayakan
  // (bilik lama OpenRouter dijawab oleh Qwen tanpa ralat).
  const model = await modelUntukBilik(supa, bilik.model_id);
  const modelLabel = model?.label ?? null;

  return NextResponse.json({
    room: {
      id: bilik.id,
      classId: bilik.class_id,
      title: bilik.title,
      description: bilik.description,
      joinCode: bilik.join_code,
      status: bilik.status,
      aiEnabled: bilik.ai_enabled,
      contextEnabled: bilik.context_enabled,
      contextWindow: bilik.context_window,
      modelId: bilik.model_id,
      modelLabel,
      createdAt: bilik.created_at,
      updatedAt: bilik.updated_at,
    },
    role: akses.role,
    muted: akses.muted,
    // KZ-034: aiConfigured mengikut penyedia model bilik, bukan ditulis
    // keras lagi. Kunci itu sendiri tidak dibalas.
    aiConfigured: !!model && penyediaSedia(model.provider),
  });
}