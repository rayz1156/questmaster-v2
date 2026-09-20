import { QUIZ_CSV_TEMPLATE } from '@/lib/live-quiz';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/live/quiz-template
 * Templat CSV kosong untuk pendidik isi dan muat naik semula. Tiada data
 * pengguna di sini, jadi tiada semakan auth diperlukan.
 *
 * BOM UTF-8 di hadapan adalah sengaja: tanpanya Excel di Windows membaca
 * fail sebagai ANSI dan merosakkan aksara beraksen apabila pendidik
 * menyimpan semula.
 */
export async function GET() {
  return new Response('﻿' + QUIZ_CSV_TEMPLATE, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="kuizen-quiz-template.csv"',
      'cache-control': 'no-store',
    },
  });
}
