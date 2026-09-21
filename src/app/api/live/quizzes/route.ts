import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase-route';
import { requireLiveHost } from '@/lib/live-quiz';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Next.js men-cache panggilan fetch Supabase di dalam route handler secara
// lalai, yang membekukan keadaan sesi langsung (status kekal 'asking' walaupun
// pangkalan data sudah 'revealed'). Paksa setiap bacaan pergi ke pangkalan data.
export const fetchCache = 'force-no-store';

/** POST /api/live/quizzes, cipta kuiz langsung. Badan: {classId?,title,description?}
 *  classId pilihan (Fasa 2): kosong bermakna kuiz peribadi (class_id null). */
export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;

  const body = await req.json().catch(() => ({}));
  const { classId, title } = body;
  if (classId !== undefined && classId !== null && typeof classId !== 'string') {
    return NextResponse.json({ error: 'classId is invalid.' }, { status: 400 });
  }
  if (typeof title !== 'string' || !title.trim()) {
    return NextResponse.json({ error: 'A title is required.' }, { status: 400 });
  }

  // Jika classId diberi, sahkan pemanggil pendidik/pemilik kelas itu.
  // Jika tidak diberi, kuiz disimpan sebagai peribadi (class_id null).
  if (classId) {
    const host = await requireLiveHost(req, classId);
    if (host.response) return host.response;
  }

  const description = typeof body.description === 'string' ? body.description : null;

  const { data: quiz, error } = await auth.supa
    .from('qm_live_quizzes')
    .insert({
      class_id: classId || null,
      owner_id: auth.user!.id,
      title: title.trim(),
      description,
    })
    .select('id, class_id, owner_id, title, description, created_at')
    .single();

  if (error || !quiz) {
    return NextResponse.json({ error: error?.message || 'The quiz could not be created.' }, { status: 500 });
  }
  return NextResponse.json({ data: quiz }, { status: 201 });
}

/** GET /api/live/quizzes, senarai kuiz langsung.
 *  Dengan ?classId= : senarai kuiz bagi kelas itu (kelakuan asal).
 *  Tanpa classId   : semua kuiz yang boleh dihoskan oleh pengguna ,
 *  kuiz peribadi miliknya (class_id null) serta kuiz berkongsi dengan
 *  kelas yang jemputan pendidiknya sudah diterima. Termasuk nama kelas
 *  untuk label "Peribadi"/kelas pada senarai UI. */
export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;

  const classId = req.nextUrl.searchParams.get('classId');
  if (classId) {
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

  // Tiada classId: kuiz milik sendiri + kuiz kelas yang dijadikan pendidik.
  const { data: eduClasses } = await auth.supa
    .from('qm_class_educators')
    .select('class_id')
    .eq('educator_id', auth.user!.id)
    .not('accepted_at', 'is', null);
  const classIds = (eduClasses || []).map((c: { class_id: string }) => c.class_id);

  const query = auth.supa
    .from('qm_live_quizzes')
    .select('id, class_id, owner_id, title, description, created_at, class:qm_classes(name)')
    .or(`owner_id.eq.${auth.user!.id}${classIds.length ? `,class_id.in.(${classIds.join(',')})` : ''}`)
    .order('created_at', { ascending: false });

  const { data: quizzes, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: quizzes || [] });
}
