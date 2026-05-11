import { NextRequest } from 'next/server';
import { requireClassMember, getServiceSupabase } from '@/lib/supabase-route';
import { fileluUpload } from '@/lib/filelu';
import { generateAiImage, buildPromptForCard } from '@/lib/ai-image';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 900;

/**
 * Streams Server-Sent Events while generating AI thumbnails for every card that
 * lacks a real image. Targets only "default-thumbnail" cards:
 *   - link cards without link_image_url
 *   - text cards (which never have a thumbnail today)
 *
 * Skips: image cards (already a picture), file cards (use file preview),
 *        qr / video cards (have their own visual), and any card whose link_image_url
 *        is already populated.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { classId: string } }
) {
  const owner = await requireClassMember(req, params.classId);
  if (owner.response) return owner.response;
  const admin = getServiceSupabase();

  // Resolve the board id for this class.
  const { data: board } = await admin
    .from('qm_learning_boards')
    .select('id')
    .eq('class_id', params.classId)
    .single();
  if (!board) {
    return new Response(JSON.stringify({ error: 'Board not found' }), { status: 404 });
  }

  // Pull cards belonging to columns of this board.
  const { data: cols } = await admin
    .from('qm_learning_columns')
    .select('id')
    .eq('board_id', board.id);
  const columnIds = (cols || []).map((c: any) => c.id);
  if (columnIds.length === 0) {
    return new Response('event: done\ndata: {"processed":0,"total":0}\n\n', {
      headers: { 'Content-Type': 'text/event-stream' },
    });
  }

  const { data: allCards } = await admin
    .from('qm_learning_cards')
    .select('*')
    .in('column_id', columnIds);
  const cards = allCards || [];

  // Candidates: link/text cards without a real image set.
  const targets = cards.filter((c: any) => {
    if (c.card_type === 'link') return !c.link_image_url;
    if (c.card_type === 'text') return !c.link_image_url;
    return false;
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, payload: any) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`)
        );
      };

      send('start', { total: targets.length });

      let processed = 0;
      let succeeded = 0;
      let failed = 0;

      // Parallel worker pool. Default 4 workers; tunable via AI_BATCH_CONCURRENCY.
      const concurrency = Math.max(1, Math.min(8, parseInt(process.env.AI_BATCH_CONCURRENCY || '4', 10)));
      let cursor = 0;
      let aborted = false;

      // Heartbeat keeps the SSE connection warm through proxies/load balancers.
      const heartbeat = setInterval(() => {
        try { controller.enqueue(encoder.encode(': keep-alive\n\n')); } catch {}
      }, 15_000);

      const processOne = async (card: any) => {
        if (req.signal.aborted) { aborted = true; return; }
        const prompt = buildPromptForCard(card);
        try {
          const img = await generateAiImage(prompt, { width: 1024, height: 576, signal: req.signal });
          const ext = img.mime.includes('png') ? 'png' : img.mime.includes('webp') ? 'webp' : 'jpg';
          const up = await fileluUpload(
            img.bytes,
            `ai-thumb-${card.id}.${ext}`,
            img.mime
          );
          const fileluFileUrl = `/api/learning-boards/${params.classId}/file-redirect/${up.fileCode}`;
          const updates: any =
            card.card_type === 'image'
              ? { image_url: fileluFileUrl }
              : { link_image_url: fileluFileUrl };
          await admin
            .from('qm_learning_cards')
            .update(updates)
            .eq('id', card.id);
          succeeded++;
          send('progress', {
            cardId: card.id,
            processed: ++processed,
            total: targets.length,
            ok: true,
            fileluFileUrl,
            provider: (img as any).provider,
          });
        } catch (e: any) {
          if (e?.name === 'AbortError') { aborted = true; return; }
          failed++;
          send('progress', {
            cardId: card.id,
            processed: ++processed,
            total: targets.length,
            ok: false,
            error: e?.message || 'failed',
          });
        }
      };

      const worker = async () => {
        while (!aborted) {
          const idx = cursor++;
          if (idx >= targets.length) return;
          if (req.signal.aborted) { aborted = true; return; }
          await processOne(targets[idx]);
        }
      };

      await Promise.all(Array.from({ length: concurrency }, () => worker()));
      clearInterval(heartbeat);

      if (req.signal.aborted) {
        send('aborted', { processed, total: targets.length });
        controller.close();
        return;
      }

      send('done', { processed, succeeded, failed, total: targets.length });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
