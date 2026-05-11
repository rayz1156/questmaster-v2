import { NextRequest, NextResponse } from 'next/server';
import { requireClassMember, getServiceSupabase } from '@/lib/supabase-route';
import { fileluUpload } from '@/lib/filelu';
import { generateAiImage, buildPromptForCard } from '@/lib/ai-image';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(
  req: NextRequest,
  { params }: { params: { classId: string; cardId: string } }
) {
  const owner = await requireClassMember(req, params.classId);
  if (owner.response) return owner.response;
  const admin = getServiceSupabase();

  // Load the card to build a prompt from its title/description/url.
  const { data: card, error: loadErr } = await admin
    .from('qm_learning_cards')
    .select('*')
    .eq('id', params.cardId)
    .single();
  if (loadErr || !card) {
    return NextResponse.json({ error: 'Card not found' }, { status: 404 });
  }

  let body: any = {};
  try { body = await req.json(); } catch {}
  const customPrompt: string = typeof body?.prompt === 'string' ? body.prompt.trim() : '';
  const prompt = customPrompt || buildPromptForCard(card);

  let img;
  try {
    img = await generateAiImage(prompt, { width: 1024, height: 576 });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'AI image generation failed' },
      { status: 502 }
    );
  }

  // Push to FileLu using the same helper the manual upload uses.
  let uploaded;
  try {
    const ext = (img.mime.includes('png') ? 'png' : 'jpg');
    uploaded = await fileluUpload(
      img.bytes,
      `ai-thumb-${params.cardId}.${ext}`,
      img.mime
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'FileLu upload failed' },
      { status: 502 }
    );
  }

  const fileluFileUrl = `/api/learning-boards/${params.classId}/file-redirect/${uploaded.fileCode}`;

  // Persist into the right field depending on card type.
  const updates: any = {};
  if (card.card_type === 'image') {
    updates.image_url = fileluFileUrl;
  } else {
    updates.link_image_url = fileluFileUrl;
  }

  const { data: updated, error: updErr } = await admin
    .from('qm_learning_cards')
    .update(updates)
    .eq('id', params.cardId)
    .select('*')
    .single();
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    card: updated,
    fileluFileUrl,
    prompt,
  });
}
