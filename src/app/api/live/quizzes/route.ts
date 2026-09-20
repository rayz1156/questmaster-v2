import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase-route';
import { requireLiveHost } from '@/lib/live-quiz';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/live/quizzes — cipta kuiz langsung. Badan: {classId,title,description?} */
export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;

  const body = await req.json().catch(() => ({}));
  const { classId, title } = body;
  if (!classId) return NextResponse.json({ error: 'classId diperlukan.' }, { status: 400 });
  if (typeof title !== 'string' || !title.trim()) {
    return NextResponse.json({ error: 'Tajuk diperlukan.' }, { status: 400 });
  }

  const host = await requireLiveHost(req, classId);
  if (host.response) return host.response;

  const description = typeof body.description === 'string' ? body.description : null;

  const { data: quiz, error } = await auth.supa
    .from('qm_live_quizzes')
    .insert({
      class_id: classId,
      owner_id: auth.user!.id,
      title: title.trim(),
      description,
    })
    .select('id, class_id, owner_id, title, description, created_at')
    .single();

  if (error || !quiz) {
    return NextResponse.json({ error: error?.message || 'Kuiz tidak dapat dicipta.' }, { status: 500 });
  }
  return NextResponse.json({ data: quiz }, { status: 201 });
}

/** GET /api/live/quizzes?classId= — senarai kuiz langsung bagi kelas. */
export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;

  const classId = req.nextUrl.searchParams.get('classId');
  if (!classId) return NextResponse.json({ error: 'classId diperlukan.' }, { status: 400 });

  const host = await requireLiveHost(req, classId);
  if (host.response) return host.response;

  const { data: quizzes, error } = await auth.supa
    .from('qm_live_quizzes')
    .select('id, class_id, owner_id, title, description, created_at')
    .eq('class_id', classId)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: quizzes || [] });
}
