import { NextRequest, NextResponse } from 'next/server';
import QRCode from 'qrcode';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/live/qr?code=ABC123&size=220
 * PNG kod QR yang membawa pemain terus ke /live/<code>.
 *
 * Tiada auth: kod sesi itu sendiri ialah tiket masuk, dan sesiapa yang boleh
 * melihat QR ini memang dijemput menyertai. Tiada data pengguna dibaca.
 *
 * Hos diambil daripada pengepala permintaan supaya pautan betul pada staging
 * mahupun pengeluaran tanpa pembolehubah persekitaran tambahan.
 */
export async function GET(req: NextRequest) {
  const code = (req.nextUrl.searchParams.get('code') || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code)) {
    return NextResponse.json({ error: 'A six character session code is required.' }, { status: 400 });
  }

  const sizeRaw = Number(req.nextUrl.searchParams.get('size') || 220);
  const size = Number.isFinite(sizeRaw) ? Math.min(1200, Math.max(120, Math.floor(sizeRaw))) : 220;

  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || '';
  if (!/^[a-z0-9.-]+(:\d+)?$/i.test(host)) {
    return NextResponse.json({ error: 'The request host could not be read.' }, { status: 400 });
  }
  const proto = (req.headers.get('x-forwarded-proto') || 'https').split(',')[0].trim();
  const url = `${proto === 'http' ? 'http' : 'https'}://${host}/live/${code}`;

  try {
    const png = await QRCode.toBuffer(url, {
      type: 'png',
      errorCorrectionLevel: 'M',
      margin: 2,
      width: size,
      color: { dark: '#111827', light: '#ffffff' },
    });
    return new Response(new Uint8Array(png), {
      status: 200,
      headers: {
        'content-type': 'image/png',
        'cache-control': 'public, max-age=300',
      },
    });
  } catch {
    return NextResponse.json({ error: 'The QR code could not be drawn.' }, { status: 500 });
  }
}
