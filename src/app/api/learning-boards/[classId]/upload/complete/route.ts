import { NextResponse } from 'next/server';
import { ralatJson } from '@/lib/i18n/ralatApi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * POST /api/learning-boards/[classId]/upload/complete
 *
 * KZ-039: muat naik video terus dibuang daripada Kuizen; kad video kini hanya
 * melalui pautan YouTube. Laluan ini kekal sebagai batu nisan supaya klien lama
 * menerima 410 yang jelas, bukan 404 kabur.
 *
 * Balasan dihantar sebelum sebarang kerja: tiada panggilan Bunny/Adilo, tiada
 * tulisan ke qm_learning_cards.
 */
export async function POST() {
  return ralatJson('Muat naik video terus tidak lagi disokong. Kongsi pautan YouTube.', 410);
}
