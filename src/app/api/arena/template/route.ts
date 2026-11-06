import { ARENA_CSV_TEMPLATE } from '@/lib/arena/import';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/arena/template
 * Templat CSV untuk import soalan Arena: dibuka oleh Excel, disimpan semula
 * sebagai .csv atau .xlsx, dimuat naik ke /api/arena/sets/[setId]/import.
 * Tiada data pengguna di sini, jadi tiada semakan auth diperlukan.
 *
 * BOM UTF-8 di hadapan adalah sengaja: tanpanya Excel di Windows membaca
 * fail sebagai ANSI dan merosakkan aksara beraksen apabila pendidik
 * menyimpan semula.
 */
export async function GET() {
  return new Response('﻿' + ARENA_CSV_TEMPLATE, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="kuizen-arena-templat.csv"',
      'cache-control': 'no-store',
    },
  });
}