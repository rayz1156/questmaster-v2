import { NextResponse } from 'next/server';
import { ralatJson } from '@/lib/i18n/ralatApi';

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
  return ralatJson('Direct video upload is no longer supported. Share a YouTube link.', 410);
}