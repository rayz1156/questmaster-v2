import { NextRequest, NextResponse } from 'next/server';
import { requireClassMember } from '@/lib/supabase-route';

export const dynamic = 'force-dynamic';

async function isEducator(supa: any, classId: string, userId: string, ownerId: string): Promise<boolean> {
  if (ownerId === userId) return true;
  const { data } = await supa.from('qm_class_educators').select('user_id').eq('class_id', classId).eq('user_id', userId).maybeSingle();
  return Boolean(data);
}

export async function GET(req: NextRequest, { params }: { params: { huntId: string; classId: string } }) {
  const auth = await requireClassMember(req, params.classId);
  if (auth.response) return auth.response;
  const { supa, klass, user } = auth;

  const { data: board } = await supa
    .from('qm_submission_boards')
    .select('*')
    .eq('activity_id', params.huntId)
    .eq('class_id', params.classId)
    .maybeSingle();

  if (!board) {
    const educator = await isEducator(supa, params.classId, user!.id, klass!.owner_id);
    const myRole: 'educator' | 'student' = educator ? 'educator' : 'student';
    return NextResponse.json({ board: null, items: [], myRole, myId: user!.id });
  }

  const { data: items } = await supa
    .from('qm_submission_board_items')
    .select('*')
    .eq('board_id', board.id)
    .order('created_at', { ascending: false });

  // Enrich items with submitter profiles
  const submitterIds = Array.from(new Set((items || []).map((i: any) => i.submitted_by)));
  let profiles: any[] = [];
  if (submitterIds.length) {
    const { data: profs } = await supa.from('qm_profiles').select('id, display_name, avatar_url').in('id', submitterIds);
    profiles = profs || [];
  }
  const profById = new Map(profiles.map((p: any) => [p.id, p]));
  const enriched = (items || []).map((i: any) => ({ ...i, submitter: profById.get(i.submitted_by) || null }));

  const educator = await isEducator(supa, params.classId, user!.id, klass!.owner_id);
  const myRole: 'educator' | 'student' = educator ? 'educator' : 'student';

  return NextResponse.json({ board, items: enriched, myRole, myId: user!.id });
}

export async function POST(req: NextRequest, { params }: { params: { huntId: string; classId: string } }) {
  // Create the board (educator only)
  const auth = await requireClassMember(req, params.classId);
  if (auth.response) return auth.response;
  const { supa, klass, user } = auth;
  const educator = await isEducator(supa, params.classId, user!.id, klass!.owner_id);
  if (!educator) return NextResponse.json({ error: 'Only educators can create submission boards' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const title: string = typeof body.title === 'string' && body.title.trim() ? body.title.trim() : 'Submission Board';
  const description: string | null = typeof body.description === 'string' ? body.description : null;
  const visibility: string = ['public', 'private', 'class_scoped'].includes(body.visibility) ? body.visibility : 'class_scoped';

  const { data, error } = await supa
    .from('qm_submission_boards')
    .insert({
      activity_id: params.huntId,
      class_id: params.classId,
      title,
      description,
      visibility,
      created_by: user!.id,
    })
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ board: data });
}

export async function PATCH(req: NextRequest, { params }: { params: { huntId: string; classId: string } }) {
  const auth = await requireClassMember(req, params.classId);
  if (auth.response) return auth.response;
  const { supa, klass, user } = auth;
  const educator = await isEducator(supa, params.classId, user!.id, klass!.owner_id);
  if (!educator) return NextResponse.json({ error: 'Only educators can edit the board' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const updates: any = {};
  if (typeof body.title === 'string') updates.title = body.title.trim();
  if (typeof body.description === 'string') updates.description = body.description;
  if (['public', 'private', 'class_scoped'].includes(body.visibility)) updates.visibility = body.visibility;
  if (typeof body.is_open === 'boolean') updates.is_open = body.is_open;
  if (!Object.keys(updates).length) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });

  const { data, error } = await supa
    .from('qm_submission_boards')
    .update(updates)
    .eq('activity_id', params.huntId)
    .eq('class_id', params.classId)
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ board: data });
}
