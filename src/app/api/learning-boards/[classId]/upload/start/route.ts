import { NextResponse } from 'next/server';
import { ralatJson } from '@/lib/i18n/ralatApi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * POST /api/learning-boards/[classId]/upload/start
 *
 * KZ-039: muat naik video terus dibuang daripada Kuizen. Video kini hanya
 * melalui pautan luar (tab YouTube atau kad pautan). Laluan ini kekal sebagai
 * batu nisan supaya klien lama menerima 410 yang jelas, bukan 404 kabur.
 *
 * Balasan dihantar sebelum sebarang kerja: tiada semakan kebenaran, tiada
 * panggilan Bunny/Adilo, tiada bait masuk.
 */
export async function POST() {
  return ralatJson('Direct video upload is no longer supported. Share a YouTube link.', 410);
}