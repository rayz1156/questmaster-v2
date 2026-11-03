import { NextResponse } from 'next/server';
import { ralatJson } from '@/lib/i18n/ralatApi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * POST /api/intro-boards/[boardId]/video/start
 *
 * KZ-039: muat naik video terus dibuang; video intro kini hanya melalui pautan
 * YouTube, yang dikendalikan oleh video/complete dengan provider='youtube'
 * (boleh digunakan ahli kelas biasa juga). Batu nisan 410 supaya klien lama
 * menerima mesej yang jelas, bukan 404 kabur.
 *
 * Balasan dihantar sebelum sebarang kerja: tiada semakan kebenaran, tiada
 * panggilan Bunny/Adilo, tiada bait masuk.
 */
export async function POST() {
  return ralatJson('Muat naik video terus tidak lagi disokong. Kongsi pautan YouTube.', 410);
}
