import { NextRequest, NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { requireClassMember, getServiceSupabase } from '@/lib/supabase-route';
import { fileluUpload, fileluShareUrl } from '@/lib/filelu';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/learning-boards/[classId]/qr-card
 * Body: { columnId, url, title?, insertIndex? }
 * Generates a QR PNG for the given URL, uploads it to FileLu, and creates a
 * 'link' card whose link_image_url points to the QR PNG. The card is clickable
 * (opens the URL) and the QR shows as the card image.
 */
export async function POST(req: NextRequest, { params }: { params: { classId: string } }) {
  const owner = await requireClassMember(req, params.classId);
  if (owner.response) return owner.response;
  const admin = getServiceSupabase();
  const body = await req.json().catch(() => ({}));
  const { columnId, url, title, insertIndex } = body || {};
  if (!columnId || typeof columnId !== 'string') {
    return NextResponse.json({ error: 'columnId required' }, { status: 400 });
  }
  if (!url || typeof url !== 'string') {
    return NextResponse.json({ error: 'url required' }, { status: 400 });
  }
  const trimmed = url.trim();
  // basic URL validation; allow http/https only
  let parsed: URL;
  try { parsed = new URL(trimmed); } catch { return NextResponse.json({ error: 'Invalid URL' }, { status: 400 }); }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return NextResponse.json({ error: 'Only http(s) URLs allowed' }, { status: 400 });
  }

  // Verify column belongs to this class's board
  const { data: col } = await admin
    .from('qm_learning_columns')
    .select('id, board_id')
    .eq('id', columnId)
    .single();
  if (!col) return NextResponse.json({ error: 'Column not found' }, { status: 404 });

  // Generate QR PNG buffer (high error correction so logo overlays could fit later)
  let pngBuf: Buffer;
  try {
    pngBuf = await QRCode.toBuffer(trimmed, {
      type: 'png',
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 512,
      color: { dark: '#111827', light: '#ffffff' },
    });
  } catch (e: any) {
    return NextResponse.json({ error: `QR generation failed: ${e?.message || e}` }, { status: 500 });
  }

  // Upload PNG to FileLu
  let uploaded;
  try {
    const safeHost = parsed.hostname.replace(/[^a-z0-9.-]/gi, '_').slice(0, 40);
    const filename = `qr-${safeHost}-${Date.now()}.png`;
    uploaded = await fileluUpload(pngBuf, filename, 'image/png');
  } catch (e: any) {
    return NextResponse.json({ error: `Upload failed: ${e?.message || e}` }, { status: 502 });
  }
  const qrImageUrl = fileluShareUrl(uploaded.fileCode);

  // Compute next position with optional insertIndex shift (mirrors cards/route.ts)
  const { data: existingCards } = await admin
    .from('qm_learning_cards')
    .select('id, position')
    .eq('column_id', columnId)
    .order('position', { ascending: true });
  const cardsList = existingCards || [];
  const maxPos = cardsList.length ? cardsList[cardsList.length - 1].position : -1;
  const hasInsert = typeof insertIndex === 'number' && insertIndex >= 0 && insertIndex <= cardsList.length;
  const nextPos = hasInsert ? insertIndex : maxPos + 1;
  if (hasInsert) {
    for (let i = cardsList.length - 1; i >= 0; i--) {
      const c = cardsList[i];
      if (c.position >= insertIndex) {
        await admin.from('qm_learning_cards').update({ position: c.position + 1 }).eq('id', c.id);
      }
    }
  }

  const insert: any = {
    column_id: columnId,
    board_id: col.board_id,
    position: nextPos,
    card_type: 'link',
    title: typeof title === 'string' && title.trim() ? title.trim() : null,
    description: null,
    link_url: trimmed,
    link_title: null,
    link_description: null,
    link_image_url: qrImageUrl,
    link_site_name: parsed.hostname,
    link_favicon_url: null,
    is_qr: true,
    qr_filelu_file_code: uploaded.fileCode,
    created_by: owner.user!.id,
  };

  const { data, error } = await admin
    .from('qm_learning_cards')
    .insert(insert)
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ card: data });
}
