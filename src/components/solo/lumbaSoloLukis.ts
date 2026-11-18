/**
 * KZ-053: lukisan Canvas 2D Lumba Solo. Fail berasingan daripada komponen
 * supaya gaya lukisan boleh dibaca tanpa React.
 *
 * Pandangan atas-bawah (top-down): paling ringan pada telefon pertengahan;
 * tiada transform 3D, tiada tekstur imej. Semua bentuk dilukis sendiri,
 * tiada aset daripada permainan lain.
 *
 * Kanvas menerima lebar tinggi peranti; semua ukuran dikira daripadanya.
 */

/** Warna tetap lumba: kereta pemain ungu Kuizen, dua kereta komputer. */
export const WARNA_PEMAIN = '#7c3aed';
export const WARNA_KOMPUTER = ['#38bdf8', '#f87171'] as const;

/** Lebar jalan dalam meter (ikut enjin: separuh 3.5 m). */
const LEBAR_JALAN_M = 7;
/** Pandangan ke hadapan dalam meter (kereta komputer hilang di luar ini). */
const PANDANGAN_M = 160;

/** Pemandangan yang perlu dilukis setiap bingkai. */
export interface Pemandangan {
  /** Masa simulasi, ms (untuk animasi seperti garis jalan). */
  masaMs: number;
  /** Jarak pemain, meter. */
  jarakM: number;
  /** Offset lateral pemain, meter. */
  offsetM: number;
  /** Had laju berkesan, km/j (papar sebagai zon sekatan bila penalti). */
  hadLaju: number;
  /** Penalti sedang berkesan (papar kereta melepaskan asap). */
  penalti: boolean;
  /** Kelajuan kereta komputer tetap, km/j, dua lawan. */
  kelajuanKomputer: readonly number[];
  /** Panjang trek, meter (garisan penamat). */
  trekPanjangM: number;
}

/** Skala piksel per meter mengikut lebar kanvas. */
export function skalaPxPerMeter(lebarKanvas: number): number {
  return (lebarKanvas * 0.42) / LEBAR_JALAN_M;
}

/** Lukis satu bingkai pemandangan. ctx perlu bersih setiap bingkai. */
export function lukisPemandangan(
  ctx: CanvasRenderingContext2D,
  lebar: number,
  tinggi: number,
  p: Pemandangan,
): void {
  const pxm = skalaPxPerMeter(lebar);
  const tengahX = lebar / 2;
  const jalanPx = LEBAR_JALAN_M * pxm;

  // Rumput (luar jalan) hijau gelap, jalur jalan kelabu gelap.
  ctx.fillStyle = '#20351f';
  ctx.fillRect(0, 0, lebar, tinggi);

  // Jalur selebar jalan lebih cerah sedikit supaya tepi jalan jelas.
  ctx.fillStyle = p.penalti ? '#453225' : '#2f3b2c';
  ctx.fillRect(tengahX - jalanPx / 2 - pxm * 1.5, 0, jalanPx + pxm * 3, tinggi);

  ctx.fillStyle = '#3b4038';
  ctx.fillRect(tengahX - jalanPx / 2, 0, jalanPx, tinggi);

  // Garis tengah putus-putus, bergerak mengikut jarak (kilometer tiruan).
  const panjangDash = 8 * pxm;
  const ulang = 16 * pxm;
  const anjak = (p.jarakM * pxm) % ulang;
  ctx.fillStyle = '#e5e7eb';
  for (let y = -ulang; y < tinggi + ulang; y += ulang) {
    const atas = y + anjak;
    ctx.fillRect(tengahX - 1.5, atas, 3, panjangDash);
  }

  // Tepi jalan: batu penanda setiap 30 meter, kiri dan kanan.
  const ulangBatu = 30 * pxm;
  const anjakBatu = (p.jarakM * pxm) % ulangBatu;
  ctx.fillStyle = '#94a3b8';
  for (let y = -ulangBatu; y < tinggi + ulangBatu; y += ulangBatu) {
    const atas = y + anjakBatu;
    ctx.fillRect(tengahX - jalanPx / 2 - 6, atas, 6, 6);
    ctx.fillRect(tengahX + jalanPx / 2, atas, 6, 6);
  }

  // Garisan penamat bila hampir: jarak Tinggi - sisaM * pxm.
  const sisaM = Math.max(0, p.trekPanjangM - p.jarakM);
  if (sisaM * pxm < tinggi) {
    const yPenamat = tinggi - sisaM * pxm;
    const segmen = 12;
    for (let i = 0; i < segmen; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#f8fafc' : '#111827';
      ctx.fillRect(tengahX - jalanPx / 2 + (i * jalanPx) / segmen, yPenamat - 6, jalanPx / segmen, 12);
    }
  }

  // Kereta komputer: lebih jauh bermakna lebih tinggi di skrin.
  const pemainY = tinggi * 0.8;
  for (let i = 0; i < 2; i++) {
    const kelajuan = p.kelajuanKomputer[i] ?? 150;
    const jarakKomputer = (kelajuan / 3.6) * (p.masaMs / 1000);
    const deltaM = jarakKomputer - p.jarakM;
    if (deltaM < 2 || deltaM > PANDANGAN_M) continue;
    const y = pemainY - deltaM * pxm;
    if (y < -40) continue;
    lukisKereta(ctx, tengahX, y, 26, 44, WARNA_KOMPUTER[i] ?? '#38bdf8', pxm);
  }

  // Kereta pemain, ungu Kuizen, dengan bayang lembut.
  const pemainX = tengahX + p.offsetM * pxm;
  ctx.save();
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = '#000000';
  ctx.beginPath();
  ctx.ellipse(pemainX + 3, pemainY + 6, 16, 24, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  lukisKereta(ctx, pemainX, pemainY, 28, 48, WARNA_PEMAIN, pxm);

  // Asap penalti: jalur kelabu di belakang kereta pemain.
  if (p.penalti) {
    ctx.fillStyle = 'rgba(148,163,184,0.5)';
    const goyang = Math.sin(p.masaMs / 120) * 4;
    ctx.beginPath();
    ctx.ellipse(pemainX + goyang, pemainY + 40, 12, 18, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Lukis satu kereta (badan, cermin, tayar) pada kedudukan tengahnya. */
export function lukisKereta(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  lebar: number,
  tinggi: number,
  warna: string,
  _pxm: number,
): void {
  const rx = lebar / 2;
  const ry = tinggi / 2;

  // Tayar empat penjuru.
  ctx.fillStyle = '#111827';
  const tayar = { w: 6, h: 10 };
  ctx.fillRect(x - rx - 2, y - ry + 4, tayar.w, tayar.h);
  ctx.fillRect(x + rx - 4, y - ry + 4, tayar.w, tayar.h);
  ctx.fillRect(x - rx - 2, y + ry - 14, tayar.w, tayar.h);
  ctx.fillRect(x + rx - 4, y + ry - 14, tayar.w, tayar.h);

  // Badan bulat (kereta melihat ke atas).
  ctx.fillStyle = warna;
  ctx.beginPath();
  const r = Math.min(rx, ry) * 0.55;
  ctx.moveTo(x - rx + 3, y - ry + 3);
  ctx.quadraticCurveTo(x, y - ry - 6, x + rx - 3, y - ry + 3);
  ctx.lineTo(x + rx - 3, y + ry - 3);
  ctx.quadraticCurveTo(x, y + ry + 6, x - rx + 3, y + ry - 3);
  ctx.closePath();
  ctx.fill();

  // Cermin depan dan bumbung lebih cerah.
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.beginPath();
  ctx.ellipse(x, y - ry * 0.35, rx * 0.72, ry * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(17,24,39,0.55)';
  ctx.beginPath();
  ctx.ellipse(x, y + ry * 0.25, rx * 0.6, ry * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();
  void r;
}