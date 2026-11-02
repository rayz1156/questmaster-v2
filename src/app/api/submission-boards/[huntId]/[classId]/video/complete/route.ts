import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/submission-boards/[huntId]/[classId]/video/complete
 *
 * KZ-039: muat naik video terus dibuang. Laluan ini hanya pernah memuktamadkan
 * muat naik Bunny (tiada cabang YouTube di sini: klien YouTube papan hantaran
 * menghantar terus ke /items dengan provider youtube), jadi keseluruhan laluan
 * menjadi batu nisan 410.
 *
 * Balasan dihantar sebelum sebarang kerja: tiada panggilan Bunny/Adilo.
 */
export async function POST() {
  return NextResponse.json(
    { error: 'Muat naik video terus tidak lagi disokong. Kongsi pautan YouTube.' },
    { status: 410 },
  );
}