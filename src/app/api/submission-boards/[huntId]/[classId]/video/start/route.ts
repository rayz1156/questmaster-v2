import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * POST /api/submission-boards/[huntId]/[classId]/video/start
 *
 * KZ-039: muat naik video terus dibuang; item video papan hantaran kini hanya
 * melalui pautan YouTube (item_type 'video' dengan provider youtube, disahkan
 * oleh laluan /items). Batu nisan 410 supaya klien lama dapat mesej yang jelas.
 *
 * Balasan dihantar sebelum sebarang kerja: tiada semakan kebenaran, tiada
 * panggilan Bunny/Adilo, tiada bait masuk.
 */
export async function POST() {
  return NextResponse.json(
    { error: 'Muat naik video terus tidak lagi disokong. Kongsi pautan YouTube.' },
    { status: 410 },
  );
}
