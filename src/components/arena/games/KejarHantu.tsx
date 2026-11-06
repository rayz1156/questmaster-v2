'use client';

// Permainan "Kejar Hantu": maze-chase klasik untuk Kuizen Arena (KZ-048).
// Semua grafik dilukis Canvas 2D, tiada aset luar. Logik keputusan
// (sasaran hantu, arah simpang, kitaran mod, terowong) di kejarHantuLogik.ts.

import { useEffect, useRef, useState } from 'react';
import type { GameProps } from './types';
import {
  ATAS,
  BILANGAN_BUTIR,
  FAKTOR_GELISAH,
  FAKTOR_HANTU,
  FAKTOR_MAKAN_BUTIR,
  FAKTOR_TEROWONG,
  JEDA_MATI,
  JEDA_TAHAP,
  KANAN,
  KELAJUAN_ASAS,
  KELAJUAN_MATA,
  KIRI,
  LABIRIN,
  BAWAH,
  LEBAR,
  MASA_KELIP,
  MASA_KUASA,
  MATA_BUTIR,
  MATA_HANTU,
  MULAI_HANTU,
  MULAI_KUIZI,
  NYAWA_AWAL,
  PECUTAN_TAHAP,
  PINTU_KELUAR,
  PUSAT_RUMAH,
  TAHAP_MAKSIMUM,
  TINGGI,
  WARNA_HANTU,
  arahSama,
  balikArah,
  bolehLalui,
  dalamTerowong,
  fasaModPadaMasa,
  modPadaMasa,
  petakanPeti,
  pilihArahKeSasaran,
  pilihArahRawak,
  pusatDestinasi,
  sasaranHantu,
  wrapX,
  type Arah,
  type Jubin,
} from './kejarHantuLogik';

const T = 16; // saiz jubin piksel (kanvas dalaman)
const KANVAS_L = LEBAR * T;
const KANVAS_T = TINGGI * T;

type Fasa = 'sedia' | 'main' | 'matiJeda' | 'tahapSelesai' | 'tamat';
type KeadaanHantu = 'rumah' | 'keluar' | 'aktif' | 'mata';

interface Hantu {
  x: number;
  y: number;
  arah: Arah;
  keadaan: KeadaanHantu;
  gelisah: boolean;
  bilaKeluar: number; // masa permainan bila boleh keluar rumah
  butirKeluar: number | null; // bilangan butir perlu dimakan sebelum keluar
  mulaY: number; // kedudukan bounce dalam rumah
}

interface Keadaan {
  fasa: Fasa;
  tahap: number;
  nyawa: number;
  skor: number;
  butir: boolean[][]; // [baris][kolum]: butir kecil masih ada
  butirDimakan: number;
  masa: number; // jam permainan, hanya bergerak semasa aktif
  masaFasa: number; // pengatur jeda matiJeda / tahapSelesai
  modLalu: number; // fasa Scatter/Chase sebelumnya
  masaKuasa: number; // baki masa mod kuasa
  combo: number; // hantu ke-berapa dimakan berturutan dalam satu mod kuasa
  kuizi: { x: number; y: number; arah: Arah; buffer: Arah | null; bergerak: boolean };
  hantu: Hantu[];
  peti: { lokasi: Jubin; questionId: string }[];
  petiHilang: Set<string>;
  menunggu: string | null; // questionId yang menunggu hasil powerUp
  seqPowerLalu: number;
  seqResetLalu: number;
}

interface Paparan {
  fasa: Fasa;
  skor: number;
  nyawa: number;
  tahap: number;
  kuasa: number;
}

function butirSegar(): boolean[][] {
  const senarai: boolean[][] = [];
  for (let y = 0; y < TINGGI; y++) {
    const baris: boolean[] = [];
    const teks = LABIRIN[y] ?? '';
    for (let x = 0; x < LEBAR; x++) baris.push(teks[x] === '.');
    senarai.push(baris);
  }
  return senarai;
}

function hantuAwal(masaSekarang: number, lepasMati: boolean): Hantu[] {
  return MULAI_HANTU.map((m, i) => ({
    x: m.x,
    y: m.y,
    mulaY: m.y,
    arah: i % 2 === 0 ? KIRI : KANAN,
    keadaan: 'rumah' as KeadaanHantu,
    gelisah: false,
    bilaKeluar: lepasMati
      ? masaSekarang + i * 2 // selepas mati: 0s, 2s, 4s, 6s
      : i === 1
        ? 2
        : i === 0
          ? 0
          : Infinity,
    butirKeluar: lepasMati ? null : i === 2 ? 30 : i === 3 ? 60 : null,
  }));
}

function buatKeadaan(p: GameProps): Keadaan {
  const idSoalan = p.questions.filter((q) => !q.answered && !q.locked).map((q) => q.id);
  return {
    fasa: 'sedia',
    tahap: 1,
    nyawa: NYAWA_AWAL,
    skor: 0,
    butir: butirSegar(),
    butirDimakan: 0,
    masa: 0,
    masaFasa: 0,
    modLalu: 0,
    masaKuasa: 0,
    combo: 0,
    kuizi: { x: MULAI_KUIZI.x, y: MULAI_KUIZI.y, arah: KIRI, buffer: null, bergerak: false },
    hantu: hantuAwal(0, false),
    peti: petakanPeti(idSoalan),
    petiHilang: new Set(),
    menunggu: null,
    seqPowerLalu: -1,
    seqResetLalu: p.resetSeq,
  };
}

/** Set semula kedudukan sahaja (selepas mati atau mula tahap baharu). */
function resetKedudukan(st: Keadaan, lepasMati: boolean): void {
  st.kuizi = { x: MULAI_KUIZI.x, y: MULAI_KUIZI.y, arah: KIRI, buffer: null, bergerak: false };
  st.masa = 0;
  st.modLalu = 0;
  st.masaKuasa = 0;
  st.combo = 0;
  st.menunggu = null;
  st.hantu = hantuAwal(0, lepasMati);
}

function isEditable(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  const tag = t.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable;
}

export default function KejarHantu(props: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const propsRef = useRef<GameProps>(props);
  const stRef = useRef<Keadaan | null>(null);
  const [papar, setPapar] = useState<Paparan>({ fasa: 'sedia', skor: 0, nyawa: NYAWA_AWAL, tahap: 1, kuasa: 0 });
  const paparRef = useRef<Paparan>(papar);

  useEffect(() => {
    propsRef.current = props;
  });

  // kemas kini paparan HUD hanya bila nilai berubah
  const kemasPapar = (st: Keadaan): void => {
    const semasa: Paparan = {
      fasa: st.fasa,
      skor: st.skor,
      nyawa: st.nyawa,
      tahap: st.tahap,
      kuasa: st.masaKuasa > 0 ? Math.ceil(st.masaKuasa) : 0,
    };
    const lalu = paparRef.current;
    if (
      semasa.fasa !== lalu.fasa ||
      semasa.skor !== lalu.skor ||
      semasa.nyawa !== lalu.nyawa ||
      semasa.tahap !== lalu.tahap ||
      semasa.kuasa !== lalu.kuasa
    ) {
      paparRef.current = semasa;
      setPapar(semasa);
    }
  };

  useEffect(() => {
    if (!stRef.current) stRef.current = buatKeadaan(propsRef.current);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const st = stRef.current as Keadaan;

    // penampan dinding statik (dilukis sekali)
    const penampan = document.createElement('canvas');
    penampan.width = KANVAS_L;
    penampan.height = KANVAS_T;
    const bctx = penampan.getContext('2d');
    if (!bctx) return;
    bctx.fillStyle = '#0b1026';
    bctx.fillRect(0, 0, KANVAS_L, KANVAS_T);
    for (let y = 0; y < TINGGI; y++) {
      for (let x = 0; x < LEBAR; x++) {
        if ((LABIRIN[y] ?? '')[x] !== '#') continue;
        bctx.fillStyle = '#151b52';
        bctx.fillRect(x * T, y * T, T, T);
        bctx.strokeStyle = '#4356e0';
        bctx.lineWidth = 1.5;
        bctx.beginPath();
        if ((LABIRIN[y - 1] ?? '')[x] !== '#') {
          bctx.moveTo(x * T, y * T + 0.75);
          bctx.lineTo(x * T + T, y * T + 0.75);
        }
        if ((LABIRIN[y + 1] ?? '')[x] !== '#') {
          bctx.moveTo(x * T, y * T + T - 0.75);
          bctx.lineTo(x * T + T, y * T + T - 0.75);
        }
        if ((LABIRIN[y] ?? '')[x - 1] !== '#') {
          bctx.moveTo(x * T + 0.75, y * T);
          bctx.lineTo(x * T + 0.75, y * T + T);
        }
        if ((LABIRIN[y] ?? '')[x + 1] !== '#') {
          bctx.moveTo(x * T + T - 0.75, y * T);
          bctx.lineTo(x * T + T - 0.75, y * T + T);
        }
        bctx.stroke();
      }
    }
    // pintu rumah hantu
    bctx.strokeStyle = '#f9a8d4';
    bctx.lineWidth = 3;
    bctx.beginPath();
    bctx.moveTo(13 * T + 2, 11 * T + T / 2);
    bctx.lineTo(15 * T - 2, 11 * T + T / 2);
    bctx.stroke();

    const setInput = (a: Arah): void => {
      st.kuizi.buffer = a;
    };

    const onKeyDown = (e: KeyboardEvent): void => {
      if (isEditable(e.target)) return;
      const k = typeof e.key === 'string' ? e.key.toLowerCase() : '';
      if (k === 'arrowup' || k === 'w') setInput(ATAS);
      else if (k === 'arrowdown' || k === 's') setInput(BAWAH);
      else if (k === 'arrowleft' || k === 'a') setInput(KIRI);
      else if (k === 'arrowright' || k === 'd') setInput(KANAN);
      else return;
      if (k.startsWith('arrow')) e.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);

    // leret pada kanvas untuk telefon
    let sentuhX = 0;
    let sentuhY = 0;
    const onSentuhMula = (e: TouchEvent): void => {
      const t0 = e.touches[0];
      if (t0) {
        sentuhX = t0.clientX;
        sentuhY = t0.clientY;
      }
    };
    const onSentuhTamat = (e: TouchEvent): void => {
      const t0 = e.changedTouches[0];
      if (!t0) return;
      const dx = t0.clientX - sentuhX;
      const dy = t0.clientY - sentuhY;
      if (Math.abs(dx) < 18 && Math.abs(dy) < 18) return;
      if (Math.abs(dx) > Math.abs(dy)) setInput(dx > 0 ? KANAN : KIRI);
      else setInput(dy > 0 ? BAWAH : ATAS);
    };
    canvas.addEventListener('touchstart', onSentuhMula, { passive: true });
    canvas.addEventListener('touchend', onSentuhTamat, { passive: true });

    // ------------------------------------------------------ enjin pergerakan

    const kunciPeti = (x: number, y: number): string => `${x},${y}`;

    const petiAktif = (x: number, y: number): boolean => {
      const p = propsRef.current;
      const entri = st.peti.find((e) => e.lokasi.x === x && e.lokasi.y === y);
      if (!entri) return false;
      if (st.petiHilang.has(kunciPeti(x, y))) return false;
      const q = p.questions.find((qq) => qq.id === entri.questionId);
      if (!q || q.answered || q.locked) return false;
      return true;
    };

    /** Dipanggil bila Kuizi tiba di pusat jubin (bulat). */
    const prosesJubin = (nx: number, ny: number): boolean => {
      const kx = ((nx % LEBAR) + LEBAR) % LEBAR;
      const baris = st.butir[ny];
      if (baris && baris[kx]) {
        baris[kx] = false;
        st.butirDimakan++;
        st.skor += MATA_BUTIR;
        if (st.butirDimakan >= BILANGAN_BUTIR) {
          st.fasa = 'tahapSelesai';
          st.masaFasa = JEDA_TAHAP;
          return true;
        }
      }
      if (petiAktif(kx, ny)) {
        const entri = st.peti.find((e) => e.lokasi.x === kx && e.lokasi.y === ny);
        if (entri) {
          st.petiHilang.add(kunciPeti(kx, ny));
          st.menunggu = entri.questionId;
          propsRef.current.onTouchQuestion(entri.questionId);
        }
      }
      return false;
    };

    const langkahKuizi = (dt: number): void => {
      const k = st.kuizi;
      const p = propsRef.current;
      if (p.paused || p.frozen || st.menunggu) return;
      // kelajuan: perlahan sedikit semasa menuju jubin berbutir
      const bx = Math.round(k.x + k.arah.dx);
      const by = Math.round(k.y + k.arah.dy);
      const menujuButir = bolehLalui(bx, by) && (st.butir[by] ?? [])[bx] === true;
      const laju = KELAJUAN_ASAS * (menujuButir ? FAKTOR_MAKAN_BUTIR : 1);
      let sisa = laju * dt;
      // berpatah balik serta-merta dibenarkan
      if (k.buffer && arahSama(k.buffer, balikArah(k.arah))) {
        k.arah = k.buffer;
        k.buffer = null;
      }
      k.bergerak = true;
      let iter = 0;
      while (sisa > 1e-9 && iter++ < 60) {
        const cx = Math.round(k.x);
        const cy = Math.round(k.y);
        const diPusat = Math.abs(k.x - cx) < 1e-7 && Math.abs(k.y - cy) < 1e-7;
        if (diPusat) {
          if (k.buffer && bolehLalui(cx + k.buffer.dx, cy + k.buffer.dy)) {
            k.arah = k.buffer;
            k.buffer = null;
          }
          if (!bolehLalui(cx + k.arah.dx, cy + k.arah.dy)) {
            k.bergerak = false;
            return; // terbentur: berhenti di pusat jubin
          }
        }
        const dest = pusatDestinasi(k.x, k.y, k.arah);
        const nx = dest.x;
        const ny = dest.y;
        const jarak = Math.abs(nx - k.x) + Math.abs(ny - k.y);
        if (jarak > sisa) {
          k.x += k.arah.dx * sisa;
          k.y += k.arah.dy * sisa;
          sisa = 0;
        } else {
          k.x = nx;
          k.y = ny;
          sisa -= jarak;
          k.x = wrapX(k.x);
          if (prosesJubin(Math.round(wrapX(k.x)), Math.round(k.y))) return;
        }
      }
    };

    const kelajuanHantu = (h: Hantu): number => {
      let laju = KELAJUAN_ASAS * FAKTOR_HANTU * (1 + (st.tahap - 1) * PECUTAN_TAHAP);
      if (h.gelisah) laju *= FAKTOR_GELISAH;
      else if (dalamTerowong(h.x, h.y)) laju *= FAKTOR_TEROWONG;
      return laju;
    };

    const langkahHantu = (h: Hantu, indeks: number, dt: number): void => {
      const laju = kelajuanHantu(h);
      let sisa = laju * dt;
      let iter = 0;
      while (sisa > 1e-9 && iter++ < 60) {
        if (h.keadaan === 'aktif') {
          const cx = Math.round(h.x);
          const cy = Math.round(h.y);
          const diPusat = Math.abs(h.x - cx) < 1e-7 && Math.abs(h.y - cy) < 1e-7;
          if (diPusat) {
            if (h.gelisah) {
              h.arah = pilihArahRawak(cx, cy, h.arah, true);
            } else {
              const mod = modPadaMasa(st.masa);
              const sasaran = sasaranHantu({
                indeks,
                mod,
                kuiziX: Math.round(st.kuizi.x),
                kuiziY: Math.round(st.kuizi.y),
                kuiziDx: st.kuizi.arah.dx,
                kuiziDy: st.kuizi.arah.dy,
                hantuX: cx,
                hantuY: cy,
                merahX: Math.round(st.hantu[0]?.x ?? cx),
                merahY: Math.round(st.hantu[0]?.y ?? cy),
              });
              h.arah = pilihArahKeSasaran(cx, cy, h.arah, sasaran, true);
            }
            if (!bolehLalui(cx + h.arah.dx, cy + h.arah.dy)) return;
          }
          const dest = pusatDestinasi(h.x, h.y, h.arah);
          const nx = dest.x;
          const ny = dest.y;
          const jarak = Math.abs(nx - h.x) + Math.abs(ny - h.y);
          if (jarak > sisa) {
            h.x += h.arah.dx * sisa;
            h.y += h.arah.dy * sisa;
            sisa = 0;
          } else {
            h.x = nx;
            h.y = ny;
            sisa -= jarak;
          }
          h.x = wrapX(h.x);
        } else {
          // keluar rumah / mata pulang / bounce: gerakan linear
          sisa = 0;
          if (h.keadaan === 'mata') {
            const dx = PUSAT_RUMAH.x - h.x;
            const dy = PUSAT_RUMAH.y - h.y;
            const jauh = Math.hypot(dx, dy);
            if (jauh < 0.15) {
              h.keadaan = 'rumah';
              h.bilaKeluar = st.masa;
              h.butirKeluar = null;
            } else {
              h.x += (dx / jauh) * KELAJUAN_MATA * dt;
              h.y += (dy / jauh) * KELAJUAN_MATA * dt;
              h.arah = { dx: dx / jauh, dy: dy / jauh }; // mata melihat arah pulang
            }
          } else if (h.keadaan === 'keluar') {
            const langkah = laju * dt;
            if (Math.abs(h.x - PINTU_KELUAR.x) > 0.05) {
              const keArah = Math.sign(PINTU_KELUAR.x - h.x);
              h.x += keArah * Math.min(langkah, Math.abs(PINTU_KELUAR.x - h.x));
            } else {
              h.x = PINTU_KELUAR.x;
              h.y -= langkah;
              if (h.y <= PINTU_KELUAR.y) {
                h.y = PINTU_KELUAR.y;
                h.keadaan = 'aktif';
                h.arah = Math.random() < 0.5 ? KIRI : KANAN;
              }
            }
          } else if (h.keadaan === 'rumah') {
            // menunggu: bounce kecil
            if (
              st.masa >= h.bilaKeluar ||
              (h.butirKeluar !== null && st.butirDimakan >= h.butirKeluar)
            ) {
              h.keadaan = 'keluar';
              h.gelisah = false;
            }
          }
        }
      }
    };

    const mulaKuasa = (): void => {
      st.masaKuasa = MASA_KUASA;
      st.combo = 0;
      for (const h of st.hantu) {
        if (h.keadaan === 'aktif') {
          h.gelisah = true;
          h.arah = balikArah(h.arah); // hantu berpatah balik bila ketakutan
        }
      }
    };

    const perlanggaran = (): boolean => {
      const k = st.kuizi;
      for (const h of st.hantu) {
        if (h.keadaan !== 'aktif') continue;
        const jauh = Math.hypot(h.x - k.x, h.y - k.y);
        if (jauh > 0.6) continue;
        if (h.gelisah) {
          st.skor += MATA_HANTU[Math.min(st.combo, MATA_HANTU.length - 1)] ?? 200;
          st.combo++;
          h.keadaan = 'mata';
          h.gelisah = false;
        } else {
          st.nyawa--;
          st.fasa = 'matiJeda';
          st.masaFasa = JEDA_MATI;
          st.masaKuasa = 0;
          st.combo = 0;
          return true;
        }
      }
      return false;
    };

    // ------------------------------------------------------------- lukisan

    const lukisButir = (): void => {
      ctx.fillStyle = '#f6d38b';
      for (let y = 0; y < TINGGI; y++) {
        const baris = st.butir[y];
        if (!baris) continue;
        for (let x = 0; x < LEBAR; x++) {
          if (!baris[x]) continue;
          ctx.beginPath();
          ctx.arc(x * T + T / 2, y * T + T / 2, T * 0.11, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };

    const lukisPeti = (t: number): void => {
      for (const e of st.peti) {
        if (!petiAktif(e.lokasi.x, e.lokasi.y)) continue;
        const px = e.lokasi.x * T + T / 2;
        const py = e.lokasi.y * T + T / 2;
        const denyut = 0.25 + 0.15 * Math.sin(t * 5);
        ctx.fillStyle = `rgba(245,158,11,${denyut.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(px, py, T * 0.55 + Math.sin(t * 5) * 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#f59e0b';
        ctx.beginPath();
        ctx.arc(px, py, T * 0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#1f2937';
        ctx.font = `bold ${Math.round(T * 0.55)}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('?', px, py + 0.5);
      }
    };

    const lukisKuizi = (t: number): void => {
      const k = st.kuizi;
      const px = k.x * T + T / 2;
      const py = k.y * T + T / 2;
      // Maskot Kuizen sendiri: badan bulat ungu yang melantun, topi graduan dan
      // mata yang memandang arah gerak. Sengaja TIADA bentuk baji mulut.
      const r = T * 0.44;
      const lantun = k.bergerak ? Math.abs(Math.sin(t * 10)) * r * 0.12 : 0;
      const by = py - lantun;
      ctx.fillStyle = '#7c3aed';
      ctx.beginPath();
      ctx.ellipse(px, by, r * (1 + lantun / (r * 2)), r * (1 - lantun / (r * 2)), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#a78bfa';
      ctx.beginPath();
      ctx.arc(px - r * 0.35, by - r * 0.35, r * 0.22, 0, Math.PI * 2);
      ctx.fill();
      // topi graduan
      const topY = by - r * 0.95;
      ctx.fillStyle = '#111827';
      ctx.beginPath();
      ctx.moveTo(px - r * 0.85, topY);
      ctx.lineTo(px, topY - r * 0.35);
      ctx.lineTo(px + r * 0.85, topY);
      ctx.lineTo(px, topY + r * 0.35);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = Math.max(1, T * 0.06);
      ctx.beginPath();
      ctx.moveTo(px, topY);
      ctx.lineTo(px + r * 0.6, topY + r * 0.15);
      ctx.lineTo(px + r * 0.6, topY + r * 0.55);
      ctx.stroke();
      // mata putih dengan anak mata ikut arah
      for (const sisi of [-1, 1]) {
        const ex = px + sisi * r * 0.36;
        const ey = by - r * 0.05;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(ex, ey, r * 0.27, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#1f2937';
        ctx.beginPath();
        ctx.arc(ex + k.arah.dx * r * 0.12, ey + k.arah.dy * r * 0.12, r * 0.13, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const lukisHantu = (h: Hantu, i: number, t: number): void => {
      const px = h.x * T + T / 2;
      const py = h.y * T + T / 2;
      const r = T * 0.45;
      if (h.keadaan === 'mata') {
        // mata sahaja: pulang ke rumah
        ctx.fillStyle = '#ffffff';
        for (const sisi of [-1, 1]) {
          ctx.beginPath();
          ctx.arc(px + sisi * r * 0.35, py - r * 0.15, r * 0.22, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = '#2563eb';
        for (const sisi of [-1, 1]) {
          ctx.beginPath();
          ctx.arc(px + sisi * r * 0.35 + h.arah.dx * r * 0.1, py - r * 0.15 + h.arah.dy * r * 0.1, r * 0.1, 0, Math.PI * 2);
          ctx.fill();
        }
        return;
      }
      // badan: kubah atas + bawah beralun
      const kelip = st.masaKuasa > 0 && st.masaKuasa < MASA_KELIP && Math.sin(t * 14) > 0;
      const warna = h.gelisah ? (kelip ? '#fde68a' : '#14b8a6') : WARNA_HANTU[i] ?? '#ef4444';
      ctx.fillStyle = warna;
      ctx.beginPath();
      const kubahY = py - r * 0.1;
      ctx.arc(px, kubahY, r, Math.PI, 0);
      const bawahY = py + r * 0.85;
      ctx.lineTo(px - r, bawahY);
      const gel = 3;
      const seg = (2 * r) / (gel * 2);
      for (let g = 0; g < gel; g++) {
        const x1 = px - r + (2 * g + 1) * seg;
        const x2 = px - r + (2 * g + 2) * seg;
        const naik = (g + Math.floor(t * 8)) % 2 === 0;
        ctx.quadraticCurveTo(x1, bawahY + (naik ? -r * 0.18 : r * 0.18), x2, bawahY);
      }
      ctx.closePath();
      ctx.fill();
      if (h.gelisah) {
        // muka putih kosong semasa ketakutan
        ctx.fillStyle = '#f8fafc';
        for (const sisi of [-1, 1]) {
          ctx.beginPath();
          ctx.arc(px + sisi * r * 0.35, py - r * 0.15, r * 0.13, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.strokeStyle = '#f8fafc';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        const my = py + r * 0.35;
        ctx.moveTo(px - r * 0.5, my);
        for (let g = 0; g < 4; g++) {
          ctx.lineTo(px - r * 0.5 + (g + 0.5) * r * 0.25, my + (g % 2 === 0 ? -3 : 0));
        }
        ctx.stroke();
      } else {
        // mata melihat arah gerakan
        ctx.fillStyle = '#ffffff';
        for (const sisi of [-1, 1]) {
          ctx.beginPath();
          ctx.arc(px + sisi * r * 0.35, py - r * 0.15, r * 0.24, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = '#1f2937';
        for (const sisi of [-1, 1]) {
          ctx.beginPath();
          ctx.arc(
            px + sisi * r * 0.35 + h.arah.dx * r * 0.1,
            py - r * 0.15 + h.arah.dy * r * 0.1,
            r * 0.11,
            0,
            Math.PI * 2,
          );
          ctx.fill();
        }
      }
    };

    // ------------------------------------------------------------- gelung

    let raf = 0;
    let lepas = performance.now();
    const frame = (now: number): void => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, Math.max(0, (now - lepas) / 1000));
      lepas = now;
      const tSaat = now / 1000;
      const p = propsRef.current;

      // Start Together: set semula penuh
      if (p.resetSeq !== st.seqResetLalu) {
        st.seqResetLalu = p.resetSeq;
        Object.assign(st, buatKeadaan(p));
      }

      // hasil jawapan popup soalan
      if (p.powerUp && p.powerUp.seq !== st.seqPowerLalu) {
        st.seqPowerLalu = p.powerUp.seq;
        const betul = p.powerUp.correct && p.powerUp.questionId === st.menunggu;
        st.menunggu = null;
        if (betul) mulaKuasa();
      }

      const aktif = st.fasa === 'main' && !p.paused && !p.frozen && !st.menunggu;
      if (aktif) {
        st.masa += dt;
        // pertukaran mod Scatter/Chase: hantu berpatah balik
        const fasa = fasaModPadaMasa(st.masa);
        if (fasa !== st.modLalu) {
          st.modLalu = fasa;
          for (const h of st.hantu) {
            if (h.keadaan === 'aktif' && !h.gelisah) h.arah = balikArah(h.arah);
          }
        }
        // tamat mod kuasa
        if (st.masaKuasa > 0) {
          st.masaKuasa -= dt;
          if (st.masaKuasa <= 0) {
            st.masaKuasa = 0;
            st.combo = 0;
            for (const h of st.hantu) if (h.keadaan === 'aktif') h.gelisah = false;
          }
        }
        langkahKuizi(dt);
        if (st.fasa === 'main') {
          for (let i = 0; i < st.hantu.length; i++) {
            langkahHantu(st.hantu[i] as Hantu, i, dt);
          }
          perlanggaran();
        }
      } else if (st.fasa === 'matiJeda' && !p.paused && !p.frozen) {
        st.masaFasa -= dt;
        if (st.masaFasa <= 0) {
          if (st.nyawa > 0) {
            resetKedudukan(st, true);
            st.fasa = 'main';
          } else {
            st.fasa = 'tamat';
          }
        }
      } else if (st.fasa === 'tahapSelesai' && !p.paused && !p.frozen) {
        st.masaFasa -= dt;
        if (st.masaFasa <= 0) {
          if (st.tahap < TAHAP_MAKSIMUM) {
            st.tahap++;
            st.butir = butirSegar();
            st.butirDimakan = 0;
            st.petiHilang = new Set();
            st.peti = petakanPeti(p.questions.filter((q) => !q.answered && !q.locked).map((q) => q.id));
            resetKedudukan(st, false);
            st.fasa = 'main';
          } else {
            st.fasa = 'tamat';
          }
        }
      }

      kemasPapar(st);

      // lukis
      ctx.clearRect(0, 0, KANVAS_L, KANVAS_T);
      ctx.drawImage(penampan, 0, 0);
      lukisButir();
      lukisPeti(tSaat);
      for (let i = 0; i < st.hantu.length; i++) lukisHantu(st.hantu[i] as Hantu, i, tSaat);
      // Kuizi hilang seketika semasa jeda mati (kesan tertangkap)
      if (st.fasa !== 'matiJeda') lukisKuizi(tSaat);
      if (p.frozen && st.fasa !== 'tamat') {
        ctx.fillStyle = 'rgba(15,23,42,0.55)';
        ctx.fillRect(0, 0, KANVAS_L, KANVAS_T);
        ctx.fillStyle = '#e0f2fe';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold 28px system-ui, sans-serif';
        ctx.fillText('Permainan dibekukan', KANVAS_L / 2, KANVAS_T / 2);
      }
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKeyDown);
      canvas.removeEventListener('touchstart', onSentuhMula);
      canvas.removeEventListener('touchend', onSentuhTamat);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tekanPad = (a: Arah): void => {
    const st = stRef.current;
    if (st) st.kuizi.buffer = a;
  };

  const mula = (): void => {
    const st = stRef.current;
    const canvas = canvasRef.current;
    if (!st || !canvas) return;
    if (st.fasa === 'sedia') {
      st.fasa = 'main';
      paparRef.current = { ...paparRef.current, fasa: 'main' };
      setPapar({ ...paparRef.current });
      return;
    }
    if (st.fasa === 'tamat') {
      // Main semula: butir, skor dan nyawa diset semula; soalan yang sudah
      // dijawab kekal dijawab (peti untuk soalan itu tidak muncul lagi).
      Object.assign(st, buatKeadaan(propsRef.current));
      st.fasa = 'main';
      paparRef.current = { ...paparRef.current, fasa: 'main' };
      setPapar({ ...paparRef.current });
    }
  };

  const fasaTamat = papar.fasa === 'tamat';
  const fasaSedia = papar.fasa === 'sedia';

  return (
    <div className="mx-auto w-full max-w-[480px] select-none">
      {/* HUD */}
      <div className="mb-2 flex items-center justify-between rounded-xl border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-900">
        <span>Skor permainan: {papar.skor}</span>
        <span aria-label="Nyawa">
          {'❤️'.repeat(Math.max(0, papar.nyawa))}
          {'🖤'.repeat(Math.max(0, NYAWA_AWAL - papar.nyawa))}
        </span>
        <span>Tahap: {papar.tahap}/{TAHAP_MAKSIMUM}</span>
      </div>
      {papar.kuasa > 0 && (
        <div className="mb-2 text-center text-xs font-bold text-blue-700">
          Kuasa berjalan: {papar.kuasa}s, hantu boleh dimakan!
        </div>
      )}
      <div className="relative overflow-hidden rounded-2xl bg-slate-900">
        <canvas
          ref={canvasRef}
          width={KANVAS_L}
          height={KANVAS_T}
          className="block w-full"
          style={{ touchAction: 'none' }}
        />
        {(fasaSedia || fasaTamat) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950/70 text-center">
            <p className="text-lg font-bold text-white">
              {fasaTamat ? 'Permainan tamat' : 'Kejar Hantu'}
            </p>
            <p className="max-w-[90%] text-sm text-slate-300">
              {fasaTamat
                ? `Skor akhir: ${papar.skor}. Soalan yang sudah dijawab kekal dijawab.`
                : 'Makan semua butir. Sentuh peti soalan untuk kuasa.'}
            </p>
            <button
              type="button"
              onClick={mula}
              className="rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-6 py-2 text-sm font-semibold text-white shadow active:scale-95"
            >
              {fasaTamat ? 'Main semula' : 'Mulakan'}
            </button>
          </div>
        )}
        {papar.fasa === 'tahapSelesai' && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-950/40">
            <p className="rounded-xl bg-white/90 px-6 py-2 text-lg font-bold text-violet-900">Tahap selesai</p>
          </div>
        )}
      </div>
      {/* D-pad telefon */}
      <div className="mt-3 flex justify-center">
        <div className="grid grid-cols-3 grid-rows-3 gap-1 opacity-90">
          <PadButton label="▲" title="Atas" className="col-start-2 row-start-1" onPress={() => tekanPad(ATAS)} />
          <PadButton label="◀" title="Kiri" className="col-start-1 row-start-2" onPress={() => tekanPad(KIRI)} />
          <PadButton label="▶" title="Kanan" className="col-start-3 row-start-2" onPress={() => tekanPad(KANAN)} />
          <PadButton label="▼" title="Bawah" className="col-start-2 row-start-3" onPress={() => tekanPad(BAWAH)} />
        </div>
      </div>
    </div>
  );
}

function PadButton(props: { label: string; title: string; className: string; onPress: () => void }) {
  const { label, title, className, onPress } = props;
  return (
    <button
      type="button"
      aria-label={title}
      className={`${className} flex h-12 w-12 touch-none items-center justify-center rounded-xl bg-white/85 text-lg text-slate-800 shadow active:bg-amber-300`}
      onPointerDown={(e) => {
        e.preventDefault();
        onPress();
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {label}
    </button>
  );
}
