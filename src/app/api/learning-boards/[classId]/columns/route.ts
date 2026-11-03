import { NextRequest, NextResponse } from 'next/server';
import { requireClassMember, getServiceSupabase } from '@/lib/supabase-route';
import { ralatJson } from '@/lib/i18n/ralatApi';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: { classId: string } }) {
  const owner = await requireClassMember(req, params.classId);
  if (owner.response) return owner.response;
  const admin = getServiceSupabase();
  const { title } = await req.json().catch(() => ({}));
  if (!title || typeof title !== 'string') return ralatJson('title required', 400);
  const { data: board } = await admin.from('qm_learning_boards').select('id').eq('class_id', params.classId).single();
  if (!board) return ralatJson('Board not found', 404);
  const { data: maxRow } = await owner.supa
    .from('qm_learning_columns')
    .select('position')
    .eq('board_id', board.id)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextPos = (maxRow?.position ?? -1) + 1;
  const { data, error } = await owner.supa
    .from('qm_learning_columns')
    .insert({ board_id: board.id, title, position: nextPos })
    .select('*')
    .single();
  if (error) return ralatJson(error.message, 500);
  return NextResponse.json({ column: data });
}
