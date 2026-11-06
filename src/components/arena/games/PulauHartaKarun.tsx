/**
 * Kuizen Arena, KZ-047: permainan "Pulau Harta Karun" (komponen klien).
 *
 * Dimuatkan oleh halaman main (tiket KZ-046) sebagai eksport lalai
 * `PulauHartaKarun(props: PulauProps)`. Kontrak GameProps dikongsi dengan
 * KZ-048 dalam ./types.ts. Semua logik permainan TULEN berada dalam
 * ./pulauLogik.ts dan peta dalam ./pulauPeta.ts.
 *
 * Kabus perang: disimpan dalam localStorage ikut kunci
 * `kz-pulau:<kod>:<idPemain>` (lihat pulauLogik.kunciKabusSesi), hanya
 * keadaan kabus, tiada token atau data peribadi. Had saiz dalam
 * pulauLogik.HAD_SAIZ_KABUS.
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import { getPulauMap, jubinDi, SAIZ_JUBIN, titikMulaPulau, type PulauMapDef } from './pulauPeta';
import {
  JEJARI_PANDANGAN,
  JEJARI_PETUNJUK,
  HAD_SAIZ_KABUS,
  kunciJubin,
  bolehLaluiJubin,
  bolehLaluiPiksel,
  jubinDariPiksel,
  pusatJubin,
  lingkaran,
  laluanBFS,
  bolehTuju,
  senaraiPeti,
  petiTerdekatBelumDibuka,
  semuaDijawab,
  kodKabus,
  nyahkodKabus,
  kunciKabusSesi,
} from './pulauLogik';
import type { GameProps } from './types';

export interface PemainPulau {
  id: string;
  nickname: string;
  avatar: number;
  /** Kedudukan dalam piksel peta. */
  x: number;
  y: number;
  presence: 'online' | 'away' | 'offline';
}

export type PulauProps = GameProps & {
  sessionId: string;
  code: string;
  mapId?: string;
  players: PemainPulau[];
  meX: number;
  meY: number;
};

// ---------------------------------------------------------------- pemalar

const LAJU = 150; // piksel sesaat (pergerakan pemain)
const TEMPOH_PETUNJUK_MS = 6000; // anak panah petunjuk berkelip 6 saat
const HANTAR_MS = 250; // onMove dihadkan 4 kali sesaat
const WARNA_AVATAR = [
  '#e5484d', '#f76b15', '#eab308', '#46a758',
  '#29a383', '#3e63dd', '#8e4ec6', '#d6409f',
];

interface ArahKekunci { atas: boolean; bawah: boolean; kiri: boolean; kanan: boolean }
interface Zarah { x: number; y: number; vx: number; vy: number; lahir: number; emas: boolean }

/** Indeks titik mula yang stabil bagi satu id pemain (djb2 atas id). */
function indeksMula(id: string): number {
  let h = 5381;
  for (let i = 0; i < id.length; i++) h = ((h << 5) + h + id.charCodeAt(i)) >>> 0;
  return h;
}

/** Vektor arah daripada kekunci/D-pad (keutamaan: atas, bawah, kiri, kanan). */
function vektorArah(a: ArahKekunci): { x: number; y: number } {
  if (a.atas) return { x: 0, y: -1 };
  if (a.bawah) return { x: 0, y: 1 };
  if (a.kiri) return { x: -1, y: 0 };
  if (a.kanan) return { x: 1, y: 0 };
  return { x: 0, y: 0 };
}

// ---------------------------------------------------------------- lukisan jubin

/** Warna dasar setiap jenis jubin. */
function warnaJubin(ch: string): string {
  switch (ch) {
    case '~': return '#0b2a4a'; // air dalam
    case '-': return '#155a8a'; // sungai
    case '.': return '#e7d8a8'; // pantai
    case ',': return '#4f9e4f'; // rumput
    case 't': return '#2f6b3a'; // hutan
    case '%': return '#6b6f76'; // batu
    case '=': return '#8a6a3f'; // jambatan
    case 'c': return '#3a332e'; // gua
    case 'S': return '#63b35f'; // titik mula (rumput terang)
    default: return '#0b2a4a';
  }
}

/** Lukis satu jubin dengan hiasan ringkas (prosedur, tiada aset luar). */
function lukisJubin(
  ctx: CanvasRenderingContext2D,
  ch: string,
  px: number,
  py: number,
  tx: number,
  ty: number,
  masa: number,
): void {
  const s = SAIZ_JUBIN;
  ctx.fillStyle = warnaJubin(ch);
  ctx.fillRect(px, py, s, s);
  const h = ((tx * 31 + ty * 17) % 97) / 97; // variasi stabil jubin ke jubin
  switch (ch) {
    case '~': {
      // ombak bergerak perlahan
      ctx.fillStyle = 'rgba(70,130,190,0.35)';
      const f = Math.sin(masa / 900 + tx * 0.7 + ty * 0.9) * 3;
      ctx.fillRect(px + 2, py + 10 + f, s - 4, 3);
      ctx.fillRect(px + 8, py + 22 - f, s - 16, 2);
      break;
    }
    case '-': {
      ctx.fillStyle = 'rgba(120,190,240,0.3)';
      const f = Math.sin(masa / 700 + tx * 0.9) * 2;
      ctx.fillRect(px + 1, py + 8 + f, s - 2, 3);
      ctx.fillRect(px + 4, py + 20 - f, s - 8, 2);
      break;
    }
    case '.': {
      // pasir: titik-titik
      ctx.fillStyle = 'rgba(180,150,90,0.4)';
      ctx.fillRect(px + 4 + h * 8, py + 6 + h * 12, 3, 2);
      ctx.fillRect(px + 20 - h * 8, py + 22, 3, 2);
      break;
    }
    case ',': {
      ctx.fillStyle = 'rgba(30,90,40,0.5)';
      ctx.fillRect(px + 6 + h * 6, py + 8, 2, 5);
      ctx.fillRect(px + 18 + h * 8, py + 18, 2, 6);
      ctx.fillRect(px + 26, py + 9 + h * 5, 2, 4);
      break;
    }
    case 't': {
      // pokok: batang + silara
      ctx.fillStyle = '#5b3a1e';
      ctx.fillRect(px + 14, py + 20, 4, 10);
      ctx.fillStyle = '#1d4b28';
      ctx.beginPath();
      ctx.arc(px + 16, py + 14, 9 + h * 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(60,140,80,0.5)';
      ctx.beginPath();
      ctx.arc(px + 12 - h * 3, py + 10, 5, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case '%': {
      // batu besar
      ctx.fillStyle = '#54585f';
      ctx.beginPath();
      ctx.moveTo(px + 4, py + 26);
      ctx.lineTo(px + 14 + h * 4, py + 6);
      ctx.lineTo(px + 28, py + 26);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(230,230,235,0.25)';
      ctx.fillRect(px + 12 + h * 4, py + 10, 6, 3);
      break;
    }
    case '=': {
      // papan jambatan
      ctx.fillStyle = '#6f5330';
      for (let i = 0; i < 4; i++) ctx.fillRect(px + 1, py + 2 + i * 8, s - 2, 5);
      ctx.fillStyle = 'rgba(40,28,12,0.5)';
      ctx.fillRect(px, py + s - 3, s, 3);
      break;
    }
    case 'c': {
      // lantai gua: gelap berbintik
      ctx.fillStyle = 'rgba(20,16,12,0.5)';
      ctx.fillRect(px + 3 + h * 6, py + 4 + h * 8, 4, 3);
      ctx.fillRect(px + 22 - h * 6, py + 20, 3, 3);
      break;
    }
    case 'S': {
      // bendera titik mula
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillRect(px + 15, py + 8, 2, 16);
      ctx.fillStyle = '#f76b15';
      ctx.beginPath();
      ctx.moveTo(px + 17, py + 8);
      ctx.lineTo(px + 27, py + 12);
      ctx.lineTo(px + 17, py + 16);
      ctx.closePath();
      ctx.fill();
      break;
    }
    default:
      break;
  }
}

/** Lukis sebutir peti (tertutup / terbuka; kayu atau emas bercahaya). */
function lukisPeti(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  emas: boolean,
  terbuka: boolean,
  betul: boolean,
  masa: number,
): void {
  const w = 22;
  const h = terbuka ? 12 : 16;
  const x = cx - w / 2;
  const y = cy - h / 2;
  const badan = emas ? '#c9932e' : '#8b5a2b';
  const gelap = emas ? '#8f661c' : '#5f3d1d';
  if (emas) {
    // sinar peti emas berdenyut
    const denyut = 8 + Math.sin(masa / 260) * 5;
    ctx.save();
    ctx.shadowColor = '#ffd24a';
    ctx.shadowBlur = denyut + 8;
    ctx.fillStyle = badan;
    ctx.fillRect(x, y, w, h);
    ctx.restore();
  }
  ctx.fillStyle = badan;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = gelap;
  ctx.fillRect(x, y, w, 4); // penutup
  ctx.fillStyle = emas ? '#ffe28a' : '#c9a26b';
  ctx.fillRect(x + w / 2 - 2, y, 4, h); // pemegang/lingkaran logam
  if (terbuka) {
    // peti terbuka: dalam gelap; betul: syiling bertaburan di mulut peti
    ctx.fillStyle = '#241708';
    ctx.fillRect(x + 2, y + 4, w - 4, h - 5);
    if (betul) {
      ctx.fillStyle = '#ffd24a';
      ctx.beginPath();
      ctx.arc(cx - 5, cy + 4, 3.4, 0, Math.PI * 2);
      ctx.arc(cx, cy + 2, 3.4, 0, Math.PI * 2);
      ctx.arc(cx + 5, cy + 4, 3.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#8f661c';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx - 5, cy + 4, 3.4, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

// ---------------------------------------------------------------- komponen

export default function PulauHartaKarun(props: PulauProps) {
  const { me, questions, frozen, resetSeq, paused, powerUp, onTouchQuestion, onMove } = props;
  const { sessionId, code, mapId, players, meX, meY } = props;

  const peta: PulauMapDef = getPulauMap(mapId);

  const kanvasRef = useRef<HTMLCanvasElement | null>(null);
  const posRef = useRef<{ x: number; y: number } | null>(null);
  const kabusRef = useRef<Set<string>>(new Set<string>());
  const jubinLaluRef = useRef<{ x: number; y: number } | null>(null);
  const kekunciRef = useRef<ArahKekunci>({ atas: false, bawah: false, kiri: false, kanan: false });
  const dpadRef = useRef<string | null>(null);
  const laluanRef = useRef<{ x: number; y: number }[]>([]);
  const pemainPosRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const petunjukRef = useRef<{ tx: number; ty: number; hingga: number } | null>(null);
  const betulRef = useRef<Set<string>>(new Set<string>());
  const zarahRef = useRef<Zarah[]>([]);
  const sentuhRef = useRef<{ qid: string; hingga: number } | null>(null);
  const kameraRef = useRef({ x: 0, y: 0 });
  const saizRef = useRef({ w: 640, h: 380 });
  const hantarRef = useRef({ masa: 0, x: -1, y: -1 });
  const selesaiHartaRef = useRef(false);
  const powerSeqRef = useRef(0);
  const [jumpaHarta, setJumpaHarta] = useState(false);

  // props terkini untuk gelung rAF (elak memulakan gelung semula setiap render)
  const semasaRef = useRef(props);
  semasaRef.current = props;

  const idSaya = me ? me.id : 'tanpa-pemain';

  // ------ kedudukan awal dan tukar pulau: kembali ke titik mula
  useEffect(() => {
    const spawn = titikMulaPulau(peta, indeksMula(idSaya));
    posRef.current = meX !== 0 || meY !== 0 ? { x: meX, y: meY } : spawn;
    jubinLaluRef.current = null;
    laluanRef.current = [];
    // penerokaan milik pulau: tukar pulau mula dengan kabus kosong
    kabusRef.current = new Set<string>();
  }, [peta.id, idSaya, meX, meY]);

  // ------ Start Together (resetSeq): kembali ke titik mula, kabus DIKEKALKAN
  useEffect(() => {
    if (posRef.current === null) return;
    posRef.current = titikMulaPulau(peta, indeksMula(idSaya));
    laluanRef.current = [];
    jubinLaluRef.current = null;
  }, [resetSeq, peta, idSaya]);

  // ------ muat kabus dari localStorage (bertahan selepas muat semula)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const simpan = window.localStorage.getItem(kunciKabusSesi(code, idSaya));
      if (simpan === null) return;
      const kabus = nyahkodKabus(peta, simpan);
      if (kabus !== null) {
        // gabung: kabus simpanan dipermudahkan selepas reset pulau
        kabus.forEach((k) => kabusRef.current.add(k));
      }
    } catch {
      // localStorage tidak tersedia atau disekat: teruskan tanpa simpanan
    }
  }, [code, idSaya, peta]);

  // ------ simpan kabus secara berkala + bila tamat halaman
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const simpan = () => {
      try {
        const kod = kodKabus(peta, kabusRef.current);
        if (kod.length > 0 && kod.length <= HAD_SAIZ_KABUS) {
          window.localStorage.setItem(kunciKabusSesi(code, idSaya), kod);
        }
      } catch {
        // abaikan: peribadi pantas menyekat penulisan
      }
    };
    const pemasa = window.setInterval(simpan, 4000);
    window.addEventListener('pagehide', simpan);
    return () => {
      window.clearInterval(pemasa);
      window.removeEventListener('pagehide', simpan);
      simpan();
    };
  }, [code, idSaya, peta]);

  // ------ kekunci anak panah + WASD
  useEffect(() => {
    const tetap = (kod: string, tekan: boolean) => {
      const a = kekunciRef.current;
      if (kod === 'ArrowUp' || kod === 'KeyW') a.atas = tekan;
      else if (kod === 'ArrowDown' || kod === 'KeyS') a.bawah = tekan;
      else if (kod === 'ArrowLeft' || kod === 'KeyA') a.kiri = tekan;
      else if (kod === 'ArrowRight' || kod === 'KeyD') a.kanan = tekan;
      else return false;
      return true;
    };
    const turun = (e: KeyboardEvent) => {
      if (tetap(e.code, true)) {
        e.preventDefault();
        laluanRef.current = []; // input manual batalkan laluan ketik
      }
    };
    const naik = (e: KeyboardEvent) => {
      tetap(e.code, false);
    };
    window.addEventListener('keydown', turun);
    window.addEventListener('keyup', naik);
    return () => {
      window.removeEventListener('keydown', turun);
      window.removeEventListener('keyup', naik);
    };
  }, []);

  // ------ peta petunjuk selepas jawapan betul (powerUp.seq berubah)
  useEffect(() => {
    if (!powerUp) return;
    if (powerUp.seq === 0) return; // 0 = tiada keputusan lagi
    if (powerUp.seq === powerSeqRef.current) return; // keputusan sama, jangan ulang
    powerSeqRef.current = powerUp.seq;
    const semasa = semasaRef.current;
    const petiSekarang = senaraiPeti(peta, semasa.questions, semasa.sessionId);
    const posSaya = posRef.current;
    const jubinSaya =
      posSaya !== null ? jubinDariPiksel(posSaya.x, posSaya.y) : { x: peta.starts[0]?.x ?? 0, y: peta.starts[0]?.y ?? 0 };
    if (powerUp.correct) {
      // jawapan betul: syiling bertaburan di peti soalan itu
      betulRef.current.add(powerUp.questionId);
      const petiSendiri = petiSekarang.filter((p) => p.questionId === powerUp.questionId)[0];
      if (petiSendiri) {
        const pusat = pusatJubin(petiSendiri.x, petiSendiri.y);
        const sekarang = performance.now();
        for (let i = 0; i < 12; i++) {
          const sudut = (i / 12) * Math.PI * 2;
          zarahRef.current.push({
            x: pusat.x,
            y: pusat.y,
            vx: Math.cos(sudut) * (40 + (i % 3) * 18),
            vy: Math.sin(sudut) * (40 + (i % 3) * 18) - 30,
            lahir: sekarang,
            emas: true,
          });
        }
      }
      // mendedahkan kabus dalam jejari 3 sekitar peti terdekat yang belum
      // dibuka, dengan anak panah petunjuk berkelip ke arahnya 6 saat
      const dekat = petiTerdekatBelumDibuka(petiSekarang, jubinSaya);
      if (dekat) {
        lingkaran(dekat.x, dekat.y, JEJARI_PETUNJUK).forEach((k) => kabusRef.current.add(k));
        petunjukRef.current = { tx: dekat.x, ty: dekat.y, hingga: performance.now() + TEMPOH_PETUNJUK_MS };
      }
    }
    // jawapan salah: tiada petunjuk, peti kelihatan kosong bila dibuka
  }, [powerUp?.seq, powerUp, peta]);

  // ------ gelung permainan (rAF): gerak, kabus, sentuh peti, lukis
  useEffect(() => {
    const kanvas = kanvasRef.current;
    if (kanvas === null) return;
    const ctx = kanvas.getContext('2d');
    if (ctx === null) return;

    let hidup = true;
    let masaLalu = performance.now();

    const langkah = (masa: number) => {
      if (!hidup) return;
      const semasa = semasaRef.current;
      const { questions: soalan, frozen: beku, paused: jeda, onTouchQuestion: sentuhSoalan, onMove: gerak } = semasa;
      const dt = Math.min(0.05, (masa - masaLalu) / 1000);
      masaLalu = masa;
      const pos = posRef.current;
      if (pos === null) {
        requestAnimationFrame(langkah);
        return;
      }
      const bolehGerak = !beku && !jeda;
      const peti = senaraiPeti(peta, soalan, semasa.sessionId);

      // ---- pergerakan
      if (bolehGerak) {
        const kekunci = kekunciRef.current;
        const dpad = dpadRef.current;
        const arah: ArahKekunci = {
          atas: kekunci.atas || dpad === 'atas',
          bawah: kekunci.bawah || dpad === 'bawah',
          kiri: kekunci.kiri || dpad === 'kiri',
          kanan: kekunci.kanan || dpad === 'kanan',
        };
        const v = vektorArah(arah);
        if (v.x !== 0 || v.y !== 0) {
          laluanRef.current = [];
          const cx = pos.x + v.x * LAJU * dt;
          if (bolehLaluiPiksel(peta, cx, pos.y)) pos.x = cx;
          const cy = pos.y + v.y * LAJU * dt;
          if (bolehLaluiPiksel(peta, pos.x, cy)) pos.y = cy;
        } else if (laluanRef.current.length > 0) {
          // ikut laluan BFS ketik-untuk-berjalan
          const laluan = laluanRef.current;
          const sasaranRaw = laluan[0];
          if (sasaranRaw !== undefined) {
            const pusat = pusatJubin(sasaranRaw.x, sasaranRaw.y);
            const dx = pusat.x - pos.x;
            const dy = pusat.y - pos.y;
            const jauh = Math.hypot(dx, dy);
            if (jauh < 2) {
              laluanRef.current = laluan.slice(1);
            } else {
              const cx = pos.x + (dx / jauh) * LAJU * dt;
              if (bolehLaluiPiksel(peta, cx, pos.y)) pos.x = cx;
              const cy = pos.y + (dy / jauh) * LAJU * dt;
              if (bolehLaluiPiksel(peta, pos.x, cy)) pos.y = cy;
            }
          }
        }
      }

      // ---- kabus: dedah jejari pandangan apabila bertukar jubin
      const jubin = jubinDariPiksel(pos.x, pos.y);
      const lalu = jubinLaluRef.current;
      if (lalu === null || lalu.x !== jubin.x || lalu.y !== jubin.y) {
        lingkaran(jubin.x, jubin.y, JEJARI_PANDANGAN).forEach((k) => kabusRef.current.add(k));
        jubinLaluRef.current = jubin;
      }

      // ---- sentuh peti: belum dijawab dan tidak berkunci
      const sentuhDahulu = sentuhRef.current;
      if (
        sentuhDahulu === null ||
        masa > sentuhDahulu.hingga ||
        sentuhDahulu.qid !== kunciJubin(jubin.x, jubin.y)
      ) {
        const diSini = peti.filter(
          (p) => p.x === jubin.x && p.y === jubin.y && !p.dijawab && !p.berkunci,
        )[0];
        if (diSini !== undefined) {
          sentuhSoalan(diSini.questionId);
          sentuhRef.current = { qid: kunciJubin(jubin.x, jubin.y), hingga: masa + 900 };
        }
      }

      // ---- harta karun akhir: bila semua soalan dijawab dan pemain tiba
      if (semuaDijawab(soalan)) {
        const pusatHarta = pusatJubin(peta.treasure.x, peta.treasure.y);
        if (!selesaiHartaRef.current && Math.hypot(pusatHarta.x - pos.x, pusatHarta.y - pos.y) < 26) {
          selesaiHartaRef.current = true;
          setJumpaHarta(true);
        }
      }

      // ---- laporkan pergerakan sendiri (had 4 kali sesaat)
      if (gerak !== undefined && bolehGerak) {
        const h = hantarRef.current;
        if (
          masa - h.masa >= HANTAR_MS &&
          (h.x < 0 || Math.abs(pos.x - h.x) > 1 || Math.abs(pos.y - h.y) > 1)
        ) {
          hantarRef.current = { masa, x: pos.x, y: pos.y };
          gerak(Math.round(pos.x), Math.round(pos.y));
        }
      }

      // ---- interpolasi pemain lain ke kedudukan terbaru
      const petaPemain = pemainPosRef.current;
      semasa.players.forEach((pemain) => {
        if (pemain.id === semasa.me?.id) return;
        const sedia = petaPemain.get(pemain.id);
        if (sedia === undefined) {
          petaPemain.set(pemain.id, { x: pemain.x, y: pemain.y });
          return;
        }
        const tahap = Math.min(1, dt * 8);
        sedia.x += (pemain.x - sedia.x) * tahap;
        sedia.y += (pemain.y - sedia.y) * tahap;
      });

      // ---- zarah syiling
      const zarahHidup: Zarah[] = [];
      zarahRef.current.forEach((z) => {
        const umur = (masa - z.lahir) / 1000;
        if (umur > 1.2) return;
        zarahHidup.push(z);
      });
      zarahRef.current.forEach((z) => {
        z.vy += 500 * dt;
        z.x += z.vx * dt;
        z.y += z.vy * dt;
      });
      zarahRef.current = zarahHidup;

      // ---- kamera ikut pemain, kekang dalam sempadan peta
      const lebarPeta = peta.width * SAIZ_JUBIN;
      const tinggiPeta = peta.height * SAIZ_JUBIN;
      const { w: lebarPaparan, h: tinggiPaparan } = saizRef.current;
      const kameraX =
        lebarPeta <= lebarPaparan
          ? (lebarPeta - lebarPaparan) / 2
          : Math.max(0, Math.min(lebarPeta - lebarPaparan, pos.x - lebarPaparan / 2));
      const kameraY =
        tinggiPeta <= tinggiPaparan
          ? (tinggiPeta - tinggiPaparan) / 2
          : Math.max(0, Math.min(tinggiPeta - tinggiPaparan, pos.y - tinggiPaparan / 2));
      kameraRef.current = { x: kameraX, y: kameraY };

      // ================================================================ lukis
      const dpr = window.devicePixelRatio || 1;
      if (lebarKanvas(kanvas) !== Math.round(lebarPaparan * dpr)) {
        kanvas.width = Math.round(lebarPaparan * dpr);
        kanvas.height = Math.round(tinggiPaparan * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, lebarPaparan, tinggiPaparan);
      ctx.save();
      ctx.translate(-kameraX, -kameraY);

      const kabus = kabusRef.current;
      const nampakSekarang = new Set<string>(lingkaran(jubin.x, jubin.y, JEJARI_PANDANGAN));

      // jubin dalam pandangan kamera sahaja
      const x0 = Math.max(0, Math.floor(kameraX / SAIZ_JUBIN));
      const x1 = Math.min(peta.width - 1, Math.ceil((kameraX + lebarPaparan) / SAIZ_JUBIN));
      const y0 = Math.max(0, Math.floor(kameraY / SAIZ_JUBIN));
      const y1 = Math.min(peta.height - 1, Math.ceil((kameraY + tinggiPaparan) / SAIZ_JUBIN));
      for (let ty = y0; ty <= y1; ty++) {
        for (let tx = x0; tx <= x1; tx++) {
          lukisJubin(ctx, jubinDi(peta, tx, ty), tx * SAIZ_JUBIN, ty * SAIZ_JUBIN, tx, ty, masa);
        }
      }

      // peti soalan (di bawah kabus: tersembunyi bila belum diterokai)
      peti.forEach((p) => {
        const pusat = pusatJubin(p.x, p.y);
        lukisPeti(ctx, pusat.x, pusat.y, p.emas, p.dijawab, p.dijawab && betulRef.current.has(p.questionId), masa);
        if (p.berkunci) {
          // gembok kelabu: soalan berkunci tidak boleh dibuka
          ctx.fillStyle = '#2a2a30';
          ctx.fillRect(pusat.x - 3, pusat.y - 14, 6, 5);
          ctx.strokeStyle = '#2a2a30';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(pusat.x, pusat.y - 14, 3, Math.PI, Math.PI * 2);
          ctx.stroke();
        }
      });

      // kabus: belum diterokai gelap, pernah dilihat malap, kini jelas
      for (let ty = y0; ty <= y1; ty++) {
        for (let tx = x0; tx <= x1; tx++) {
          const k = kunciJubin(tx, ty);
          if (nampakSekarang.has(k)) continue;
          if (kabus.has(k)) {
            ctx.fillStyle = 'rgba(8,10,24,0.55)';
            ctx.fillRect(tx * SAIZ_JUBIN, ty * SAIZ_JUBIN, SAIZ_JUBIN, SAIZ_JUBIN);
          } else {
            ctx.fillStyle = '#06070f';
            ctx.fillRect(tx * SAIZ_JUBIN, ty * SAIZ_JUBIN, SAIZ_JUBIN, SAIZ_JUBIN);
          }
        }
      }

      // tanda X harta karun akhir bila semua soalan dijawab
      if (semuaDijawab(soalan) && !jumpaHarta) {
        const pusat = pusatJubin(peta.treasure.x, peta.treasure.y);
        const denyut = 0.7 + 0.3 * Math.sin(masa / 300);
        ctx.save();
        ctx.globalAlpha = denyut;
        ctx.strokeStyle = '#ff4d4d';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(pusat.x - 9, pusat.y - 9);
        ctx.lineTo(pusat.x + 9, pusat.y + 9);
        ctx.moveTo(pusat.x + 9, pusat.y - 9);
        ctx.lineTo(pusat.x - 9, pusat.y + 9);
        ctx.stroke();
        ctx.restore();
      }

      // pemain lain: hanya pada kawasan yang sudah diterokai pemain ini
      semasa.players.forEach((pemain) => {
        if (pemain.id === semasa.me?.id) return;
        const kedudukan = pemainPosRef.current.get(pemain.id);
        if (kedudukan === undefined) return;
        const jubinPemain = jubinDariPiksel(kedudukan.x, kedudukan.y);
        if (!kabus.has(kunciJubin(jubinPemain.x, jubinPemain.y))) return;
        const alfa = pemain.presence === 'online' ? 1 : pemain.presence === 'away' ? 0.7 : 0.45;
        lukisAvatar(ctx, kedudukan.x, kedudukan.y, pemain.avatar, pemain.nickname, alfa);
      });

      // saya
      lukisAvatar(ctx, pos.x, pos.y, semasa.me?.avatar ?? 0, semasa.me?.nickname ?? 'Saya', 1);

      // zarah syiling bertaburan
      zarahRef.current.forEach((z) => {
        const umur = (masa - z.lahir) / 1000;
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - umur / 1.2);
        ctx.fillStyle = z.emas ? '#ffd24a' : '#c9a26b';
        ctx.beginPath();
        ctx.arc(z.x, z.y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });

      // anak panah petunjuk berkelip ke peti terdekat (6 saat)
      const petunjuk = petunjukRef.current;
      if (petunjuk !== null && masa < petunjuk.hingga) {
        const pusatSasaran = pusatJubin(petunjuk.tx, petunjuk.ty);
        const sudut = Math.atan2(pusatSasaran.y - pos.y, pusatSasaran.x - pos.x);
        const kelip = Math.sin(masa / 130) > 0;
        if (kelip) {
          ctx.save();
          ctx.translate(pos.x + Math.cos(sudut) * 34, pos.y + Math.sin(sudut) * 34);
          ctx.rotate(sudut);
          ctx.fillStyle = '#ffd24a';
          ctx.strokeStyle = '#5f3d1d';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(10, 0);
          ctx.lineTo(-6, -7);
          ctx.lineTo(-6, 7);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        }
      }

      // animasi peti harta apabila jumpaHarta
      if (jumpaHarta) {
        const pusat = pusatJubin(peta.treasure.x, peta.treasure.y);
        // sinar berputar
        ctx.save();
        ctx.translate(pusat.x, pusat.y);
        for (let i = 0; i < 8; i++) {
          const a = masa / 600 + (i * Math.PI) / 4;
          ctx.strokeStyle = 'rgba(255,210,74,0.5)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * 14, Math.sin(a) * 14);
          ctx.lineTo(Math.cos(a) * (24 + Math.sin(masa / 250 + i) * 4), Math.sin(a) * (24 + Math.sin(masa / 250 + i) * 4));
          ctx.stroke();
        }
        ctx.restore();
        lukisPeti(ctx, pusat.x, pusat.y - 4, true, false, true, masa);
      }

      ctx.restore();

      // ---- peta mini (kabus dipatuhi) di penjuru atas kanan
      const mmSkala = 3;
      const mmW = peta.width * mmSkala;
      const mmH = peta.height * mmSkala;
      const mmX = lebarPaparan - mmW - 10;
      const mmY = 10;
      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = 'rgba(5,8,18,0.8)';
      ctx.fillRect(mmX - 3, mmY - 3, mmW + 6, mmH + 6);
      for (let ty = 0; ty < peta.height; ty++) {
        for (let tx = 0; tx < peta.width; tx++) {
          const k = kunciJubin(tx, ty);
          if (!kabus.has(k)) continue; // kabus: hanya kawasan diterokai
          ctx.fillStyle = warnaJubin(jubinDi(peta, tx, ty));
          ctx.fillRect(mmX + tx * mmSkala, mmY + ty * mmSkala, mmSkala, mmSkala);
        }
      }
      if (semuaDijawab(soalan)) {
        ctx.fillStyle = '#ff4d4d';
        ctx.fillRect(mmX + peta.treasure.x * mmSkala - 1, mmY + peta.treasure.y * mmSkala - 1, mmSkala + 2, mmSkala + 2);
      }
      // kedudukan saya pada peta mini
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(mmX + (pos.x / SAIZ_JUBIN) * mmSkala, mmY + (pos.y / SAIZ_JUBIN) * mmSkala, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // ---- kompas di penjuru atas kiri
      const kpX = 34;
      const kpY = 40;
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = 'rgba(5,8,18,0.65)';
      ctx.beginPath();
      ctx.arc(kpX, kpY, 24, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(kpX, kpY, 24, 0, Math.PI * 2);
      ctx.stroke();
      // jarum merah ke utara
      ctx.fillStyle = '#ff4d4d';
      ctx.beginPath();
      ctx.moveTo(kpX, kpY - 18);
      ctx.lineTo(kpX - 5, kpY + 2);
      ctx.lineTo(kpX + 5, kpY + 2);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.beginPath();
      ctx.moveTo(kpX, kpY + 14);
      ctx.lineTo(kpX - 4, kpY + 1);
      ctx.lineTo(kpX + 4, kpY + 1);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 9px ui-sans-serif, system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('U', kpX, kpY - 26 + 24 - 6);
      ctx.restore();

      requestAnimationFrame(langkah);
    };

    requestAnimationFrame(langkah);
    return () => {
      hidup = false;
    };
  }, [peta, jumpaHarta]);

  // ------ saiz kanvas responsif (sehingga lebar 360 px masih selesa)
  useEffect(() => {
    const kanvas = kanvasRef.current;
    if (kanvas === null) return;
    const ukur = () => {
      const lebar = Math.max(300, Math.min(720, kanvas.parentElement?.clientWidth ?? 640));
      const tinggi = Math.max(300, Math.min(480, Math.round(lebar * 0.58)));
      saizRef.current = { w: lebar, h: tinggi };
      kanvas.style.width = lebar + 'px';
      kanvas.style.height = tinggi + 'px';
    };
    ukur();
    window.addEventListener('resize', ukur);
    return () => window.removeEventListener('resize', ukur);
  }, []);

  // ------ ketik-untuk-berjalan (BFS ke jubin yang diketik)
  const ketikPeta = (e: { clientX: number; clientY: number }) => {
    if (frozen || paused) return;
    const kanvas = kanvasRef.current;
    if (kanvas === null) return;
    if (posRef.current === null) return;
    const petak = kanvas.getBoundingClientRect();
    const px = e.clientX - petak.left + kameraRef.current.x;
    const py = e.clientY - petak.top + kameraRef.current.y;
    const jubin = jubinDariPiksel(px, py);
    if (!bolehLaluiJubin(peta, jubin.x, jubin.y)) return;
    // hanya jubin yang sudah diterokai atau bersebelahan dengannya
    if (!bolehTuju(kabusRef.current, jubin.x, jubin.y)) return;
    const sini = jubinDariPiksel(posRef.current.x, posRef.current.y);
    const laluan = laluanBFS(peta, sini, jubin);
    if (laluan !== null) laluanRef.current = laluan.slice(1); // titik semasa dibuang
  };

  // ------ D-pad
  const tetapDpad = (arah: string) => {
    dpadRef.current = arah;
    laluanRef.current = [];
  };
  const lepaskanDpad = () => {
    dpadRef.current = null;
  };

  const bilDijawab = questions.filter((q) => q.answered).length;

  if (!me) {
    return (
      <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 text-slate-700">
        Sertai sesi dahulu untuk meneroka pulau.
      </div>
    );
  }

  return (
    <div className="w-full max-w-[720px] mx-auto select-none">
      {/* bar atas: kemajuan dan status */}
      <div className="flex flex-wrap items-center gap-2 mb-2 text-sm">
        <span className="px-2 py-1 rounded-lg bg-slate-800 text-white font-medium">
          {peta.name}
        </span>
        <span className="px-2 py-1 rounded-lg bg-violet-50 border border-violet-200 text-slate-700">
          Soalan dijawab: {bilDijawab}/{questions.length}
        </span>
        {frozen ? (
          <span className="px-2 py-1 rounded-lg bg-amber-100 border border-amber-300 text-amber-800 font-medium">
            Permainan dibekukan
          </span>
        ) : null}
        {paused ? (
          <span className="px-2 py-1 rounded-lg bg-slate-100 border border-slate-300 text-slate-600">
            Dijeda
          </span>
        ) : null}
        {semuaDijawab(questions) ? (
          <span className="px-2 py-1 rounded-lg bg-yellow-100 border border-yellow-300 text-yellow-800">
            Harta karun menanti di X!
          </span>
        ) : null}
      </div>

      {/* kanvas permainan */}
      <div className="relative rounded-xl overflow-hidden border border-slate-300 bg-[#06070f]">
        <canvas
          ref={kanvasRef}
          className="block touch-none"
          style={{ width: saizRef.current.w, height: saizRef.current.h }}
          onPointerDown={(e) => {
            // ketik pada kanvas memulakan pergerakan BFS
            if (e.pointerType === 'mouse') return;
            ketikPeta(e);
          }}
          onClick={(e) => {
            ketikPeta(e);
          }}
        />
        {jumpaHarta ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 p-4">
            <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 text-center max-w-xs">
              <div className="text-3xl mb-2">🏆</div>
              <p className="text-slate-800 font-semibold mb-3">
                Tahniah! Anda menemui harta karun
              </p>
              <button
                type="button"
                className="px-4 py-2 rounded-lg text-white font-medium bg-gradient-to-r from-violet-600 to-indigo-600"
                onClick={() => setJumpaHarta(false)}
              >
                Teruskan meneroka
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {/* D-pad telefon */}
      <div className="mt-3 flex items-center justify-center gap-6">
        <div className="grid grid-cols-3 grid-rows-3 gap-1 w-40">
          <span />
          <button
            type="button"
            aria-label="Atas"
            className="h-11 rounded-lg bg-violet-50 border border-violet-200 text-slate-700 active:bg-violet-200"
            onPointerDown={() => tetapDpad('atas')}
            onPointerUp={lepaskanDpad}
            onPointerLeave={lepaskanDpad}
            onPointerCancel={lepaskanDpad}
          >
            ▲
          </button>
          <span />
          <button
            type="button"
            aria-label="Kiri"
            className="h-11 rounded-lg bg-violet-50 border border-violet-200 text-slate-700 active:bg-violet-200"
            onPointerDown={() => tetapDpad('kiri')}
            onPointerUp={lepaskanDpad}
            onPointerLeave={lepaskanDpad}
            onPointerCancel={lepaskanDpad}
          >
            ◀
          </button>
          <button
            type="button"
            aria-label="Bawah"
            className="h-11 rounded-lg bg-violet-50 border border-violet-200 text-slate-700 active:bg-violet-200"
            onPointerDown={() => tetapDpad('bawah')}
            onPointerUp={lepaskanDpad}
            onPointerLeave={lepaskanDpad}
            onPointerCancel={lepaskanDpad}
          >
            ▼
          </button>
          <button
            type="button"
            aria-label="Kanan"
            className="h-11 rounded-lg bg-violet-50 border border-violet-200 text-slate-700 active:bg-violet-200"
            onPointerDown={() => tetapDpad('kanan')}
            onPointerUp={lepaskanDpad}
            onPointerLeave={lepaskanDpad}
            onPointerCancel={lepaskanDpad}
          >
            ▶
          </button>
        </div>
        <p className="text-xs text-slate-500 max-w-[180px] hidden sm:block">
          Papan kekunci: anak panah atau WASD. Telefon: D-pad atau ketik jubin
          untuk berjalan ke situ.
        </p>
      </div>
    </div>
  );
}

/** Lebar sebenar kanvas dalam piksel peranti. */
function lebarKanvas(kanvas: HTMLCanvasElement): number {
  return kanvas.width;
}

/** Lukis seorang avatar pemain dengan label nama. */
function lukisAvatar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  avatar: number,
  nama: string,
  alfa: number,
): void {
  const warna = WARNA_AVATAR[avatar % WARNA_AVATAR.length] ?? '#3e63dd';
  ctx.save();
  ctx.globalAlpha = alfa;
  // bayang berdenyut halus supaya pemain mudah dilihat
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(x, y + 10, 8, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = warna;
  ctx.beginPath();
  ctx.arc(x, y, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, 9, 0, Math.PI * 2);
  ctx.stroke();
  // huruf awal nama
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 10px ui-sans-serif, system-ui';
  ctx.textAlign = 'center';
  ctx.fillText(nama.charAt(0).toUpperCase(), x, y + 3.5);
  // nama di atas kepala
  ctx.font = '10px ui-sans-serif, system-ui';
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.strokeStyle = 'rgba(0,0,0,0.7)';
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.strokeText(nama, x, y - 14);
  ctx.fillText(nama, x, y - 14);
  ctx.restore();
}