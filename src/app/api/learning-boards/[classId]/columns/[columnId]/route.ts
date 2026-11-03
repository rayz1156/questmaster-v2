import { NextRequest, NextResponse } from 'next/server';
import { requireClassMember, getServiceSupabase } from '@/lib/supabase-route';
import { ralatJson } from '@/lib/i18n/ralatApi';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest, { params }: { params: { classId: string; columnId: string } }) {
  const owner = await requireClassMember(req, params.classId);
  if (owner.response) return owner.response;
  const admin = getServiceSupabase();
  const body = await req.json().catch(() => ({}));
  const updates: any = {};
  if (typeof body.title === 'string') updates.title = body.title;
  if (typeof body.position === 'number') updates.position = body.position;
  if (Object.keys(updates).length === 0) return ralatJson('Nothing to update', 400);
  const { data, error } = await owner.supa
    .from('qm_learning_columns')
    .update(updates)
    .eq('id', params.columnId)
    .select('*')
    .single();
  if (error) return ralatJson(error.message, 500);
  return NextResponse.json({ column: data });
}

export async function DELETE(req: NextRequest, { params }: { params: { classId: string; columnId: string } }) {
  const owner = await requireClassMember(req, params.classId);
  if (owner.response) return owner.response;
  const admin = getServiceSupabase();
  const { error } = await admin.from('qm_learning_columns').delete().eq('id', params.columnId);
  if (error) return ralatJson(error.message, 500);
  return NextResponse.json({ ok: true });
}
