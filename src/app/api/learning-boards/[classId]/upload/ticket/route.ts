import { NextRequest, NextResponse } from 'next/server';
import { requireClassMember } from '@/lib/supabase-route';
import { assertCapability } from '@/lib/capabilities';
import { admin } from '@/lib/mcp/db';
import { s5PresignPut, s5ObjectKey } from '@/lib/s5';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TICKET_TTL_SEC = 15 * 60;

/**
 * POST /api/learning-boards/[classId]/upload/ticket
 * Body: { fileName, mimeType?, size?, boardId? }
 *
 * Mengeluarkan kebenaran terhad masa dan bukan menerima bait. Alat tempatan
 * kemudian PUT fail terus ke storan S5, memintas Nginx dan Node sepenuhnya,
 * jadi saiz besar tidak membebankan memori pelayan dan tiada satu bait pun
 * perlu melalui model sebagai base64.
 */
export async function POST(req: NextRequest, { params }: { params: { classId: string } }) {
  const owner = await requireClassMember(req, params.classId);
  if (owner.response) return owner.response;

  const cap = await assertCapability(owner.supa, owner.user!.id, 'files');
  if (!cap.ok) return NextResponse.json({ error: cap.message }, { status: cap.status });

  const body = await req.json().catch(() => ({} as any));
  const fileName = typeof body.fileName === 'string' ? body.fileName.trim() : '';
  if (!fileName) return NextResponse.json({ error: 'fileName required' }, { status: 400 });

  const mimeType =
    typeof body.mimeType === 'string' && body.mimeType ? body.mimeType : 'application/octet-stream';
  const declaredSize = typeof body.size === 'number' && body.size > 0 ? Math.floor(body.size) : null;

  // Laluan objek SENTIASA dijana oleh pelayan. Menerima laluan daripada klien
  // membenarkan penulisan silang penyewa.
  const objectKey = s5ObjectKey(fileName);
  const uploadUrl = await s5PresignPut(objectKey, mimeType, TICKET_TTL_SEC);
  const expiresAt = new Date(Date.now() + TICKET_TTL_SEC * 1000).toISOString();

  const { data: ticket, error } = await admin()
    .from('upload_tickets')
    .insert({
      user_id: owner.user!.id,
      class_id: params.classId,
      board_id: typeof body.boardId === 'string' ? body.boardId : null,
      object_key: objectKey,
      file_name: fileName,
      mime_type: mimeType,
      declared_size: declaredSize,
      expires_at: expiresAt,
    })
    .select('id')
    .single();

  if (error || !ticket) {
    return NextResponse.json({ error: error?.message || 'Could not create upload ticket' }, { status: 500 });
  }

  console.log(
    `[upload-ticket] user=${owner.user!.id} class=${params.classId} key=${objectKey} declared=${declaredSize ?? '?'}`
  );

  return NextResponse.json({
    ticket_id: (ticket as any).id,
    upload_url: uploadUrl,
    method: 'PUT',
    headers: { 'Content-Type': mimeType },
    expires_at: expiresAt,
  });
}
