/**
 * KZ-058: lukisan Canvas 2D untuk permainan platform "Lompat".
 *
 * Semua bentuk (watak, peti, duri, bintang, burung saingan, latar) dilukis
 * dengan kod di sini; tiada imej atau aset daripada permainan lain.
 */

import { ARAS_PANJANG_M, WATAK_LEBAR, WATAK_TINGGI, type KeadaanLompat } from './lompatEnjin';
import { WARNA_KOMPUTER, WARNA_PEMAIN } from './lumbaSoloLukis';

export interface DataLukisLompat {
  L: KeadaanLompat;
  masaMs: number;
  /** Penalti jawapan salah sedang aktif (watak perlahan). */
  penalti: boolean;
  /** Watak sedang kebal selepas jatuh (berkelip). */
  kebal: boolean;
  /** Kemajuan dua saingan komputer, 0 hingga 1. */
  kemajuanKomputer: readonly number[];
}

function segiBulat(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const j = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + j, y);
  ctx.arcTo(x + w, y, x + w, y + h, j);
  ctx.arcTo(x + w, y + h, x, y + h, j);
  ctx.arcTo(x, y + h, x, y, j);
  ctx.arcTo(x, y, x + w, y, j);
  ctx.closePath();
}

function bintang(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, putar: number): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const s = putar + (i * Math.PI) / 5 - Math.PI / 2;
    const j = i % 2 === 0 ? r : r * 0.45;
    const px = cx + Math.cos(s) * j;
    const py = cy + Math.sin(s) * j;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function bukit(
  ctx: CanvasRenderingContext2D,
  w: number,
  dasar: number,
  anjak: number,
  tinggi: number,
  panjang: number,
  warna: string,
): void {
  ctx.fillStyle = warna;
  ctx.beginPath();
  ctx.moveTo(0, dasar);
  for (let x = 0; x <= w + 16; x += 16) {
    const u = (x + anjak) / panjang;
    ctx.lineTo(x, dasar - tinggi * (0.55 + 0.3 * Math.sin(u) + 0.15 * Math.sin(u * 2.7 + 1.3)));
  }
  ctx.lineTo(w, dasar);
  ctx.closePath();
  ctx.fill();
}

export function lukisLompat(ctx: CanvasRenderingContext2D, w: number, h: number, d: DataLukisLompat): void {
  const { L } = d;
  const masaS = d.masaMs / 1000;
  /** Piksel setiap meter: kira-kira 10 m kelihatan menegak. */
  const sk = h / 10;
  const tanahY = h * 0.78;
  const kamX = Math.max(-2, L.x - (w / sk) * 0.35);
  const sx = (x: number): number => (x - kamX) * sk;
  const sy = (y: number): number => tanahY - y * sk;

  // Langit, matahari.
  const langit = ctx.createLinearGradient(0, 0, 0, h);
  langit.addColorStop(0, '#7cc4f4');
  langit.addColorStop(0.75, '#d9f0ff');
  langit.addColorStop(1, '#eaf7ff');
  ctx.fillStyle = langit;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(255, 244, 200, 0.9)';
  ctx.beginPath();
  ctx.arc(w * 0.82, h * 0.16, h * 0.07, 0, Math.PI * 2);
  ctx.fill();

  // Awan (paralaks perlahan).
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  for (let i = 0; i < 6; i++) {
    const jarak = w + 240;
    const ax = ((((i * 331 - kamX * sk * 0.08) % jarak) + jarak) % jarak) - 120;
    const ay = h * (0.1 + ((i * 37) % 23) / 100);
    const s = h * (0.035 + (i % 3) * 0.008);
    ctx.beginPath();
    ctx.ellipse(ax, ay, s * 2.2, s, 0, 0, Math.PI * 2);
    ctx.ellipse(ax + s * 1.4, ay + s * 0.25, s * 1.6, s * 0.8, 0, 0, Math.PI * 2);
    ctx.ellipse(ax - s * 1.3, ay + s * 0.3, s * 1.4, s * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Bukit berlapis.
  bukit(ctx, w, tanahY + 4, kamX * sk * 0.15, h * 0.34, 210, '#a9d7b0');
  bukit(ctx, w, tanahY + 4, kamX * sk * 0.32 + 500, h * 0.22, 140, '#7fc48a');

  // Gaung di bawah aras tanah (kelihatan di dalam lubang).
  const gaung = ctx.createLinearGradient(0, tanahY, 0, h);
  gaung.addColorStop(0, '#3b5a7a');
  gaung.addColorStop(1, '#16263a');
  ctx.fillStyle = gaung;
  ctx.fillRect(0, tanahY, w, h - tanahY);

  // Tanah dan rumput.
  for (const [a, b] of L.aras.tanah) {
    const x1 = Math.max(-4, sx(a));
    const x2 = Math.min(w + 4, sx(b));
    if (x2 <= x1) continue;
    ctx.fillStyle = '#8a5a34';
    ctx.fillRect(x1, tanahY, x2 - x1, h - tanahY);
    ctx.fillStyle = '#74492a';
    for (let m = Math.ceil(Math.max(a, kamX) / 1.5) * 1.5; m < b && sx(m) < w; m += 1.5) {
      ctx.fillRect(sx(m), tanahY + sk * (0.55 + ((m * 7) % 5) * 0.12), sk * 0.35, sk * 0.14);
    }
    ctx.fillStyle = '#4caf50';
    ctx.fillRect(x1, tanahY, x2 - x1, sk * 0.28);
    ctx.fillStyle = '#6fd06a';
    ctx.fillRect(x1, tanahY, x2 - x1, sk * 0.09);
  }

  // Papan mula dan bendera penamat.
  const tiang = (x: number, warna: string): void => {
    ctx.fillStyle = warna;
    ctx.fillRect(sx(x) - sk * 0.06, sy(3.4), sk * 0.12, sk * 3.4);
  };
  if (sx(0.6) > -sk * 3) {
    tiang(0.6, '#6b7280');
    ctx.fillStyle = WARNA_PEMAIN;
    segiBulat(ctx, sx(0.6), sy(3.4), sk * 1.9, sk * 0.8, sk * 0.12);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.round(sk * 0.42)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('KUIZEN', sx(0.6) + sk * 0.95, sy(3.0));
  }
  if (sx(ARAS_PANJANG_M) < w + sk * 3) {
    tiang(ARAS_PANJANG_M, '#e5e7eb');
    const fx = sx(ARAS_PANJANG_M) + sk * 0.06;
    const petak = sk * 0.3;
    for (let i = 0; i < 5; i++) {
      for (let j = 0; j < 3; j++) {
        ctx.fillStyle = (i + j) % 2 === 0 ? '#111827' : '#f8fafc';
        ctx.fillRect(fx + i * petak, sy(3.4) + j * petak + Math.sin(masaS * 5 + i * 0.7) * sk * 0.04, petak, petak);
      }
    }
  }

  // Blok.
  for (const b of L.aras.blok) {
    const x = sx(b.x);
    const lebar = b.w * sk;
    if (x > w + 8 || x + lebar < -8) continue;
    const y = sy(b.y + b.h);
    const tinggi = b.h * sk;
    if (b.jenis === 'peti') {
      ctx.fillStyle = '#c98b4a';
      ctx.fillRect(x, y, lebar, tinggi);
      ctx.strokeStyle = '#8a5a2b';
      ctx.lineWidth = Math.max(2, sk * 0.08);
      ctx.strokeRect(x + ctx.lineWidth / 2, y + ctx.lineWidth / 2, lebar - ctx.lineWidth, tinggi - ctx.lineWidth);
      ctx.beginPath();
      ctx.moveTo(x + 4, y + 4);
      ctx.lineTo(x + lebar - 4, y + tinggi - 4);
      ctx.moveTo(x + lebar - 4, y + 4);
      ctx.lineTo(x + 4, y + tinggi - 4);
      ctx.stroke();
    } else if (b.jenis === 'pelantar') {
      ctx.fillStyle = '#6d28d9';
      segiBulat(ctx, x, y, lebar, tinggi, sk * 0.12);
      ctx.fill();
      ctx.fillStyle = '#a78bfa';
      segiBulat(ctx, x, y, lebar, tinggi * 0.4, sk * 0.12);
      ctx.fill();
    } else {
      const bil = 3;
      const seg = lebar / bil;
      ctx.fillStyle = '#475569';
      ctx.fillRect(x, y + tinggi * 0.8, lebar, tinggi * 0.2);
      for (let i = 0; i < bil; i++) {
        ctx.fillStyle = '#94a3b8';
        ctx.beginPath();
        ctx.moveTo(x + i * seg, y + tinggi * 0.82);
        ctx.lineTo(x + (i + 0.5) * seg, y);
        ctx.lineTo(x + (i + 1) * seg, y + tinggi * 0.82);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#e2e8f0';
        ctx.beginPath();
        ctx.moveTo(x + (i + 0.5) * seg, y);
        ctx.lineTo(x + (i + 0.72) * seg, y + tinggi * 0.5);
        ctx.lineTo(x + (i + 0.5) * seg, y + tinggi * 0.5);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  // Bintang.
  for (const s of L.aras.bintang) {
    if (s.diambil) continue;
    const x = sx(s.x);
    if (x < -20 || x > w + 20) continue;
    const y = sy(s.y) + Math.sin(masaS * 3 + s.x) * sk * 0.08;
    ctx.fillStyle = '#facc15';
    bintang(ctx, x, y, sk * 0.3, Math.sin(masaS * 2 + s.x) * 0.25);
    ctx.fill();
    ctx.strokeStyle = '#ca8a04';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // Burung saingan (terbang di atas, tiada perlanggaran).
  d.kemajuanKomputer.forEach((kemajuan, i) => {
    const x = sx(Math.min(1.05, kemajuan) * ARAS_PANJANG_M);
    if (x < -40 || x > w + 40) return;
    const y = sy(5.2 + i * 1.1) + Math.sin(masaS * 2.4 + i * 2) * sk * 0.25;
    const kepak = Math.sin(masaS * 14 + i);
    ctx.fillStyle = WARNA_KOMPUTER[i] ?? '#38bdf8';
    ctx.beginPath();
    ctx.ellipse(x, y, sk * 0.42, sk * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x - sk * 0.2, y);
    ctx.lineTo(x - sk * 0.05, y - sk * 0.55 * kepak);
    ctx.lineTo(x + sk * 0.2, y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.moveTo(x + sk * 0.38, y - sk * 0.06);
    ctx.lineTo(x + sk * 0.62, y + sk * 0.02);
    ctx.lineTo(x + sk * 0.38, y + sk * 0.1);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x + sk * 0.2, y - sk * 0.07, sk * 0.08, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#111827';
    ctx.beginPath();
    ctx.arc(x + sk * 0.22, y - sk * 0.07, sk * 0.04, 0, Math.PI * 2);
    ctx.fill();
  });

  // Watak pemain: makhluk bulat ungu berantena (rekaan asal Kuizen).
  const kelip = d.kebal && Math.floor(masaS * 12) % 2 === 0;
  if (!kelip) {
    const px = sx(L.x);
    const py = sy(L.y);
    const lw = WATAK_LEBAR * sk;
    const lt = WATAK_TINGGI * sk;
    const hadap = L.arah;
    const lari = L.diTanah ? Math.sin(L.x * 5.5) : 0.6;
    // Bayang.
    if (L.y >= 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.beginPath();
      ctx.ellipse(px, tanahY + sk * 0.06, lw * 0.5, sk * 0.08, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // Kaki.
    ctx.strokeStyle = '#3b0764';
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(3, sk * 0.14);
    for (const s of [-1, 1]) {
      const ayun = L.diTanah ? lari * s * lw * 0.32 : s * lw * 0.12;
      ctx.beginPath();
      ctx.moveTo(px + s * lw * 0.16, py - lt * 0.3);
      ctx.lineTo(px + s * lw * 0.16 + ayun, py - (L.diTanah ? 0 : lt * 0.08));
      ctx.stroke();
    }
    // Badan.
    const lantun = L.diTanah ? Math.abs(lari) * sk * 0.04 : 0;
    ctx.fillStyle = d.penalti ? '#b45309' : WARNA_PEMAIN;
    segiBulat(ctx, px - lw / 2, py - lt - lantun, lw, lt * 0.8, lw * 0.42);
    ctx.fill();
    // Perut cerah.
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.beginPath();
    ctx.ellipse(px + hadap * lw * 0.06, py - lt * 0.5 - lantun, lw * 0.26, lt * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
    // Antena.
    ctx.strokeStyle = '#3b0764';
    ctx.lineWidth = Math.max(2, sk * 0.06);
    ctx.beginPath();
    ctx.moveTo(px, py - lt - lantun);
    ctx.lineTo(px - hadap * lw * 0.12, py - lt * 1.22 - lantun);
    ctx.stroke();
    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.arc(px - hadap * lw * 0.12, py - lt * 1.24 - lantun, sk * 0.09, 0, Math.PI * 2);
    ctx.fill();
    // Mata.
    for (const s of [0.05, 0.3]) {
      const ex = px + hadap * lw * s;
      const ey = py - lt * 0.74 - lantun;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(ex, ey, sk * 0.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#111827';
      ctx.beginPath();
      ctx.arc(ex + hadap * sk * 0.03, ey, sk * 0.05, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Kiraan bintang.
  ctx.fillStyle = 'rgba(15,23,42,0.55)';
  segiBulat(ctx, 10, 10, 78, 30, 10);
  ctx.fill();
  ctx.fillStyle = '#facc15';
  bintang(ctx, 28, 25, 9, 0);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(L.bintangDiambil), 44, 26);
}
