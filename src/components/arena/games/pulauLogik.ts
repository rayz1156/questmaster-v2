/**
 * Kuizen Arena, KZ-047: logik tulen permainan Pulau Harta Karun.
 *
 * TULEN: tiada DOM, tiada React, tiada localStorage (penyimpanan kabus
 * diuruskan oleh komponen; di sini hanya pengekodan). Fail ini boleh
 * diuji oleh scripts/selftest-pulau.ts tanpa pelayar.
 *
 * Kabus perang: jubin belum diterokai gelap sepenuhnya. "Diterokai"
 * bermaksud pernah berada dalam jejari pandangan pemain; jubin diterokai
 * kekal kelihatan tetapi malap selepas pemain bergerak jauh.
 */

import { jubinDi, jubinPeti, SAIZ_JUBIN, type PulauMapDef } from './pulauPeta';
import { isGoldenChest } from './emas';

/** Jejari pandangan pemain, dalam jubin (kriteria tiket: 4). */
export const JEJARI_PANDANGAN = 4;
/** Jejari dedahan peta petunjuk sekitar peti terdekat (kriteria tiket: 3). */
export const JEJARI_PETUNJUK = 3;
/** Had saiz rentetan kabus dalam localStorage (kzsec: saiz dihadkan). */
export const HAD_SAIZ_KABUS = 8192;

/** Kunci jubin "x,y" (bentuk standard set kabus). */
export function kunciJubin(x: number, y: number): string {
  return x + ',' + y;
}

/** Adakah aksara jubin ini boleh dilalui? */
export function bolehLaluiChar(ch: string): boolean {
  return ch === '.' || ch === ',' || ch === 't' || ch === '=' || ch === 'c' || ch === 'S';
}

/** Boleh lalui pada koordinat jubin? (luar peta = air dalam). */
export function bolehLaluiJubin(peta: PulauMapDef, tx: number, ty: number): boolean {
  return bolehLaluiChar(jubinDi(peta, tx, ty));
}

/** Boleh lalui pada koordinat PIKSEL peta? */
export function bolehLaluiPiksel(peta: PulauMapDef, px: number, py: number): boolean {
  if (!Number.isFinite(px) || !Number.isFinite(py)) return false;
  return bolehLaluiJubin(peta, Math.floor(px / peta.tileSize), Math.floor(py / peta.tileSize));
}

/** Jubin yang mengandungi titik piksel ini. */
export function jubinDariPiksel(px: number, py: number): { x: number; y: number } {
  return { x: Math.floor(px / SAIZ_JUBIN), y: Math.floor(py / SAIZ_JUBIN) };
}

/** Pusat piksel bagi satu jubin (SAIZ_JUBIN dari pulauPeta). */
export function pusatJubin(tx: number, ty: number): { x: number; y: number } {
  return { x: (tx + 0.5) * SAIZ_JUBIN, y: (ty + 0.5) * SAIZ_JUBIN };
}

/**
 * Jubin dalam lingkaran jejari r sekitar (tx, ty), sebagai kunci "x,y".
 * Lingkaran Euclid: dx*dx + dy*dy <= r*r. r=4 memberi jejari pandangan,
 * r=3 memberi dedahan peta petunjuk.
 */
export function lingkaran(tx: number, ty: number, r: number): string[] {
  const keluar: string[] = [];
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r * r) continue;
      keluar.push(kunciJubin(tx + dx, ty + dy));
    }
  }
  return keluar;
}

/**
 * Laluan BFS 4 arah dari jubin `dari` ke jubin `ke` (kedua-duanya jubin).
 * Memulangkan turutan jubin termasuk `dari` dan `ke`, atau null jika tiada
 * laluan. Dipakai oleh ketik-untuk-berjalan pada telefon.
 */
export function laluanBFS(
  peta: PulauMapDef,
  dari: { x: number; y: number },
  ke: { x: number; y: number },
): { x: number; y: number }[] | null {
  if (!bolehLaluiJubin(peta, dari.x, dari.y) || !bolehLaluiJubin(peta, ke.x, ke.y)) return null;
  const anu = kunciJubin(dari.x, dari.y);
  const sasaran = kunciJubin(ke.x, ke.y);
  if (anu === sasaran) return [{ x: ke.x, y: ke.y }];
  const depan = new Map<string, string | null>();
  const baris: { x: number; y: number }[] = [{ x: dari.x, y: dari.y }];
  depan.set(anu, null);
  while (baris.length > 0) {
    const cur = baris.shift();
    if (!cur) break;
    const nb: [number, number][] = [[cur.x + 1, cur.y], [cur.x - 1, cur.y], [cur.x, cur.y + 1], [cur.x, cur.y - 1]];
    for (const [nx, ny] of nb) {
      const k = kunciJubin(nx, ny);
      if (depan.has(k) || !bolehLaluiJubin(peta, nx, ny)) continue;
      depan.set(k, kunciJubin(cur.x, cur.y));
      if (k === sasaran) {
        // susun semula laluan dari sasaran ke mula
        const laluan: { x: number; y: number }[] = [];
        let nod: string | null = k;
        while (nod !== null) {
          const [px, py] = nod.split(',');
          laluan.push({ x: Number(px), y: Number(py) });
          nod = depan.get(nod) ?? null;
        }
        laluan.reverse();
        return laluan;
      }
      baris.push({ x: nx, y: ny });
    }
  }
  return null;
}

/**
 * Boleh pemain menetapkan sasaran ketik pada jubin ini? Hanya jubin yang
 * sudah diterokai, atau bersebelahan (4 arah) dengan kawasan diterokai
 * (supaya pemain tidak meneroka buta melalui ketukan).
 */
export function bolehTuju(diterokai: Set<string>, tx: number, ty: number): boolean {
  if (diterokai.has(kunciJubin(tx, ty))) return true;
  const nb: [number, number][] = [[tx + 1, ty], [tx - 1, ty], [tx, ty + 1], [tx, ty - 1]];
  return nb.some(([nx, ny]) => diterokai.has(kunciJubin(nx, ny)));
}

// ---------------------------------------------------------------- peti

export interface PetiPulau {
  questionId: string;
  orderIdx: number;
  /** Jubin peti. */
  x: number;
  y: number;
  emas: boolean;
  dijawab: boolean;
  berkunci: boolean;
}

/** Peti untuk setiap soalan: jubin ikut order_idx, emas ikut isGoldenChest. */
export function senaraiPeti(
  peta: PulauMapDef,
  questions: { id: string; order_idx: number; answered: boolean; locked: boolean }[],
  sessionId: string,
): PetiPulau[] {
  return questions.map((q) => {
    const tile = jubinPeti(peta, q.order_idx);
    return {
      questionId: q.id,
      orderIdx: q.order_idx,
      x: tile.x,
      y: tile.y,
      emas: isGoldenChest(sessionId, q.id),
      dijawab: q.answered,
      berkunci: q.locked,
    };
  });
}

/**
 * Peti terdekat yang BELUM dibuka (soalan belum dijawab) dari satu jubin,
 * mengikut jarak Euclid. null jika semua sudah dijawab.
 */
export function petiTerdekatBelumDibuka(
  peti: PetiPulau[],
  dari: { x: number; y: number },
): PetiPulau | null {
  let terbaik: PetiPulau | null = null;
  let jarakTerbaik = Infinity;
  for (const p of peti) {
    if (p.dijawab) continue;
    const d = (p.x - dari.x) ** 2 + (p.y - dari.y) ** 2;
    if (d < jarakTerbaik) {
      jarakTerbaik = d;
      terbaik = p;
    }
  }
  return terbaik;
}

/** Semua soalan sudah dijawab? (syarat harta karun akhir). */
export function semuaDijawab(questions: { answered: boolean }[]): boolean {
  return questions.length > 0 && questions.every((q) => q.answered);
}

// ------------------------------------------------------- kabus simpanan

/**
 * Kodkan keadaan kabus sebagai rentetan padat: setiap baris peta sebagai
 * bit '0'/'1' per jubin, baris disertai '/'. Saiz <= HAD_SAIZ_KABUS.
 * Hanya keadaan kabus; tiada token, tiada data peribadi (kzsec).
 */
export function kodKabus(peta: PulauMapDef, diterokai: Set<string>): string {
  const baris: string[] = [];
  for (let y = 0; y < peta.height; y++) {
    let s = '';
    for (let x = 0; x < peta.width; x++) s += diterokai.has(kunciJubin(x, y)) ? '1' : '0';
    baris.push(s);
  }
  return baris.join('/');
}

/** Nyahkodkan rentetan kabus; null jika rosak atau saiz tidak sepadan. */
export function nyahkodKabus(peta: PulauMapDef, s: string): Set<string> | null {
  if (typeof s !== 'string' || s.length === 0 || s.length > HAD_SAIZ_KABUS) return null;
  const baris = s.split('/');
  if (baris.length !== peta.height) return null;
  const keluar = new Set<string>();
  for (let y = 0; y < baris.length; y++) {
    const b = baris[y];
    if (b === undefined || b.length !== peta.width) return null;
    for (let x = 0; x < b.length; x++) {
      if (b.charAt(x) === '1') keluar.add(kunciJubin(x, y));
      else if (b.charAt(x) !== '0') return null;
    }
  }
  return keluar;
}

/** Kunci localStorage keadaan kabus (kzsec: `kz-pulau:<kod>:<idPemain>`). */
export function kunciKabusSesi(kod: string, idPemain: string): string {
  return 'kz-pulau:' + kod + ':' + idPemain;
}