/**
 * KZ-054: paparan 3D Lumba Solo (Three.js / WebGL).
 *
 * Menggantikan pandangan atas-bawah Canvas 2D dengan kamera kejar di belakang
 * kenderaan. Lengkok trek dikongsi dengan enjin (KZ-056: kenderaan hanyut di
 * selekoh); bukit di sini hiasan visual semata.
 *
 * KZ-057: tiga tema (kereta, basikal, angkasa) berkongsi enjin yang sama.
 *
 * Semua bentuk dibina sendiri daripada geometri asas dan tekstur kanvas yang
 * dilukis dalam kod; tiada model, imej atau bunyi daripada permainan lain.
 *
 * Fail ini dimuat secara dinamik (import()) supaya Three.js hanya dibundel ke
 * halaman /solo. Jika WebGL tiada, pembina melontar ralat dan komponen kekal
 * dengan lukisan 2D (lumbaSoloLukis.ts).
 */

import {
  BackSide,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  DodecahedronGeometry,
  DoubleSide,
  Fog,
  Group,
  HemisphereLight,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshPhongMaterial,
  Object3D,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  Points,
  PointsMaterial,
  RepeatWrapping,
  RingGeometry,
  Scene,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Texture,
  Vector3,
  WebGLRenderer,
} from 'three';
import { WARNA_KOMPUTER, WARNA_PEMAIN, type Pemandangan } from './lumbaSoloLukis';
import { cerunTrekX, tengahTrekX } from './lumbaSoloEnjin';
import type { TemaLumba as TemaSemua } from './lumbaSoloTema';

/** Tema yang dilukis dalam 3D (Lompat ada lukisan 2D sendiri). */
export type TemaLumba = Exclude<TemaSemua, 'lompat'>;

/* ===== Palet setiap tema (KZ-057) ===== */

interface Palet {
  latar: string;
  kabus: [number, number];
  langitAtas: string;
  langitUfuk: string;
  hemi: [number, number, number];
  matahari: [number, number];
  gunung: [number, number];
  rumput: string;
  rumputGelap: string;
  tanah: string;
  rumputJauh: string;
  jalan: number;
  daun: [number, number];
  tiang: number;
  sepanduk: string;
  debu: number;
  /** Kamera: jarak di belakang, tinggi, jarak sasaran di hadapan. */
  kamera: [number, number, number];
  /** Condong kenderaan setiap m/s halaju lateral, dan had condong (radian). */
  condong: [number, number];
}

const PALET: Record<TemaLumba, Palet> = {
  kereta: {
    latar: '#9fd3f5',
    kabus: [70, 520],
    langitAtas: '#3b82c4',
    langitUfuk: '#cdeafc',
    hemi: [0xd8eeff, 0x3d5a2a, 1.25],
    matahari: [0xfff1d6, 2.1],
    gunung: [0x6b8fb0, 0x7c9cba],
    rumput: '#3f8f3a',
    rumputGelap: '#2d6e2e',
    tanah: '#7a6a45',
    rumputJauh: '#4f7f45',
    jalan: 0xffffff,
    daun: [0x2f7d32, 0x3f9c3c],
    tiang: 0x4c1d95,
    sepanduk: '#7c3aed',
    debu: 0xa98a5c,
    kamera: [7.8, 3.1, 14],
    condong: [0, 0],
  },
  basikal: {
    latar: '#f7e3c8',
    kabus: [60, 460],
    langitAtas: '#5aa7e0',
    langitUfuk: '#ffe6c7',
    hemi: [0xfff0dc, 0x5a6b2a, 1.3],
    matahari: [0xffd9a0, 2.0],
    gunung: [0x8f86b5, 0xa79cc4],
    rumput: '#8fbf4a',
    rumputGelap: '#5f9a3a',
    tanah: '#b08d57',
    rumputJauh: '#b7c96a',
    jalan: 0xe6d2ac,
    daun: [0x4c9a3a, 0x7fbf45],
    tiang: 0x9a3412,
    sepanduk: '#ea580c',
    debu: 0xc9a66b,
    kamera: [5.4, 2.3, 11],
    condong: [0.07, 0.38],
  },
  angkasa: {
    latar: '#05060f',
    kabus: [140, 950],
    langitAtas: '#05060f',
    langitUfuk: '#131a3a',
    hemi: [0x8ea2ff, 0x1a0b33, 1.1],
    matahari: [0xffffff, 1.7],
    gunung: [0x6b7280, 0x4b5563],
    rumput: '#000000',
    rumputGelap: '#000000',
    tanah: '#000000',
    rumputJauh: '#000000',
    jalan: 0xffffff,
    daun: [0x6b7280, 0x4b5563],
    tiang: 0x312e81,
    sepanduk: '#0891b2',
    debu: 0x67e8f9,
    kamera: [8.4, 3.2, 15],
    condong: [0.09, 0.5],
  },
};

/** Data satu bingkai untuk paparan 3D: pemandangan 2D + keadaan tambahan. */
export interface Pemandangan3DData extends Pemandangan {
  /** Kelajuan semasa pemain, km/j. */
  kelajuan: number;
  /** Pemain di luar jalan (debu, kamera bergegar). */
  diLuarJalan: boolean;
  /** Ada soalan terbuka (tanda soal terapung di hadapan). */
  soalanAktif: boolean;
}

/* ===== Geometri trek (visual sahaja) ===== */

/** Separuh lebar jalan, meter (sama dengan SEPARUH_JALAN_M enjin). */
const SEPARUH_JALAN = 3.5;
/** Lebar bebendul merah putih di tepi jalan. */
const LEBAR_BEBENDUL = 0.9;
/** Offset lateral tetap kereta komputer, meter. */
const LORONG_KOMPUTER = [-2.1, 2.1] as const;
/** Jarak trek dibina sebelum garisan mula dan selepas penamat. */
const LEBIHAN_TREK = 400;

/** Garis tengah trek: dikongsi dengan enjin supaya hanyutan selekoh sepadan (KZ-056). */
const tengahX = tengahTrekX;
const cerunX = cerunTrekX;
/** Bukit lembut di sepanjang trek. Rata dekat garisan mula. */
function tinggiY(d: number): number {
  const rata = Math.min(1, Math.max(0, d / 180));
  return rata * (7 * Math.sin(d / 190 - 0.6) + 2.6 * Math.sin(d / 61));
}
function cerunY(d: number): number {
  const h = 0.5;
  return (tinggiY(d + h) - tinggiY(d - h)) / (2 * h);
}

/** Hingar deterministik ringan (tiada Math.random supaya trek sama setiap kali). */
function hingar(a: number, b: number): number {
  return 0.5 + 0.5 * Math.sin(a * 0.013 + b * 0.21) * Math.cos(a * 0.007 - b * 0.11 + 0.7);
}
/** Ketinggian rupa bumi pada jarak d dan lateral L dari garis tengah. */
function tinggiTanah(d: number, L: number): number {
  const a = Math.abs(L);
  const dasar = tinggiY(d) - 0.06;
  if (a <= SEPARUH_JALAN + LEBAR_BEBENDUL + 0.6) return dasar;
  const x = (a - (SEPARUH_JALAN + LEBAR_BEBENDUL + 3)) / 50;
  return dasar + Math.pow(Math.max(0, x), 1.7) * 10 * (0.55 + 0.6 * hingar(d, L));
}

/** Penjana nombor rawak berbiji (mulberry32). */
function rawakBerbiji(biji: number): () => number {
  let s = biji >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Kedudukan dunia bagi jarak d dan offset lateral (positif ke kanan). */
function titikTrek(d: number, offset: number, keluar: Vector3, naik = 0): Vector3 {
  const dx = cerunX(d);
  const n = Math.sqrt(1 + dx * dx);
  // Hadapan = (dx, 0, -1)/n; kanan = (1, 0, dx)/n.
  keluar.set(tengahX(d) + offset / n, tinggiY(d) + naik, -d + (offset * dx) / n);
  return keluar;
}

/* ===== Tekstur kanvas (dilukis sendiri) ===== */

function kanvasBaru(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('canvas 2d tiada');
  return [c, ctx];
}

function teksturJalan(angkasa = false): CanvasTexture {
  const [c, ctx] = kanvasBaru(256, 512);
  if (angkasa) {
    // Landasan tenaga: gelap dengan grid neon.
    ctx.fillStyle = '#0b1030';
    ctx.fillRect(0, 0, 256, 512);
    ctx.fillStyle = 'rgba(56,189,248,0.35)';
    for (let x = 32; x < 256; x += 32) ctx.fillRect(x - 1, 0, 2, 512);
    for (let y = 0; y < 512; y += 64) ctx.fillRect(0, y, 256, 2);
    ctx.fillStyle = '#22d3ee';
    ctx.fillRect(4, 0, 8, 512);
    ctx.fillRect(244, 0, 8, 512);
    ctx.fillStyle = '#e879f9';
    ctx.fillRect(123, 0, 10, 200);
  } else {
    ctx.fillStyle = '#3d4148';
    ctx.fillRect(0, 0, 256, 512);
    const r = rawakBerbiji(7);
    for (let i = 0; i < 2600; i++) {
      const g = 50 + Math.floor(r() * 30);
      ctx.fillStyle = `rgb(${g},${g + 2},${g + 6})`;
      ctx.fillRect(r() * 256, r() * 512, 2, 2);
    }
    // Garis tepi putih.
    ctx.fillStyle = '#e8ebef';
    ctx.fillRect(8, 0, 7, 512);
    ctx.fillRect(241, 0, 7, 512);
    // Garis tengah putus-putus.
    ctx.fillStyle = '#f5f7fa';
    ctx.fillRect(124, 0, 8, 260);
  }
  const t = new CanvasTexture(c);
  t.wrapS = RepeatWrapping;
  t.wrapT = RepeatWrapping;
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function teksturBebendul(): CanvasTexture {
  const [c, ctx] = kanvasBaru(16, 64);
  ctx.fillStyle = '#e11d48';
  ctx.fillRect(0, 0, 16, 32);
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 32, 16, 32);
  const t = new CanvasTexture(c);
  t.wrapS = RepeatWrapping;
  t.wrapT = RepeatWrapping;
  t.colorSpace = SRGBColorSpace;
  return t;
}

function teksturPetak(lajur: number, baris: number): CanvasTexture {
  const [c, ctx] = kanvasBaru(lajur * 16, baris * 16);
  for (let i = 0; i < lajur; i++) {
    for (let j = 0; j < baris; j++) {
      ctx.fillStyle = (i + j) % 2 === 0 ? '#f8fafc' : '#111827';
      ctx.fillRect(i * 16, j * 16, 16, 16);
    }
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

function teksturSepanduk(teks: string, latar: string): CanvasTexture {
  const [c, ctx] = kanvasBaru(512, 64);
  ctx.fillStyle = latar;
  ctx.fillRect(0, 0, 512, 64);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(0, 0, 512, 8);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 42px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(teks, 256, 35);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

function teksturBulat(dalam: string, luar: string): CanvasTexture {
  const [c, ctx] = kanvasBaru(64, 64);
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 31);
  g.addColorStop(0, dalam);
  g.addColorStop(1, luar);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(32, 32, 31, 0, Math.PI * 2);
  ctx.fill();
  return new CanvasTexture(c);
}

function teksturTandaSoal(): CanvasTexture {
  const [c, ctx] = kanvasBaru(128, 128);
  const g = ctx.createRadialGradient(64, 64, 10, 64, 64, 62);
  g.addColorStop(0, 'rgba(167,139,250,1)');
  g.addColorStop(0.7, 'rgba(124,58,237,0.95)');
  g.addColorStop(1, 'rgba(124,58,237,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(64, 64, 62, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 84px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('?', 64, 70);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/* ===== Binaan jalur trek ===== */

/**
 * Bina jalur sepanjang trek antara dua offset lateral. vSkala: meter setiap
 * ulangan tekstur dalam arah perjalanan.
 */
function jalurTrek(
  dariL: number,
  keL: number,
  naik: number,
  langkahM: number,
  vSkala: number,
): BufferGeometry {
  const mula = -LEBIHAN_TREK;
  const akhir = 4800 + LEBIHAN_TREK;
  const n = Math.ceil((akhir - mula) / langkahM) + 1;
  const pos = new Float32Array(n * 2 * 3);
  const uv = new Float32Array(n * 2 * 2);
  const ind: number[] = [];
  const v = new Vector3();
  for (let i = 0; i < n; i++) {
    const d = mula + i * langkahM;
    titikTrek(d, dariL, v, naik);
    pos.set([v.x, v.y, v.z], i * 6);
    titikTrek(d, keL, v, naik);
    pos.set([v.x, v.y, v.z], i * 6 + 3);
    uv.set([0, d / vSkala, 1, d / vSkala], i * 4);
    if (i > 0) {
      const a = (i - 1) * 2;
      const b = i * 2;
      ind.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('uv', new BufferAttribute(uv, 2));
  g.setIndex(ind);
  g.computeVertexNormals();
  return g;
}

/** Rupa bumi berwarna titik di kiri dan kanan trek. */
function rupaBumi(palet: Palet): BufferGeometry {
  const lateral = [-220, -130, -80, -48, -28, -16, -9, -6, -4.3, 4.3, 6, 9, 16, 28, 48, 80, 130, 220];
  const mula = -LEBIHAN_TREK;
  const akhir = 4800 + LEBIHAN_TREK;
  const langkah = 8;
  const n = Math.ceil((akhir - mula) / langkah) + 1;
  const m = lateral.length;
  const pos = new Float32Array(n * m * 3);
  const warna = new Float32Array(n * m * 3);
  const ind: number[] = [];
  const v = new Vector3();
  const c = new Color();
  const rumput = new Color(palet.rumput);
  const rumputGelap = new Color(palet.rumputGelap);
  const tanah = new Color(palet.tanah);
  const jauh = new Color(palet.rumputJauh);
  for (let i = 0; i < n; i++) {
    const d = mula + i * langkah;
    for (let j = 0; j < m; j++) {
      const L = lateral[j];
      titikTrek(d, L, v);
      v.y = tinggiTanah(d, L);
      pos.set([v.x, v.y, v.z], (i * m + j) * 3);
      const h = hingar(d * 1.7, L * 2.3);
      c.copy(rumputGelap).lerp(rumput, h);
      if (Math.abs(L) < 7) c.lerp(tanah, 0.35);
      if (Math.abs(L) > 60) c.lerp(jauh, 0.4);
      warna.set([c.r, c.g, c.b], (i * m + j) * 3);
      if (i > 0 && j > 0) {
        const a = (i - 1) * m + (j - 1);
        const b = i * m + (j - 1);
        // Lompat jalur di bawah jalan (antara -4.3 dan 4.3).
        if (!(lateral[j - 1] < 0 && lateral[j] > 0)) {
          ind.push(a, a + 1, b, a + 1, b + 1, b);
        }
      }
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('color', new BufferAttribute(warna, 3));
  g.setIndex(ind);
  g.computeVertexNormals();
  return g;
}

/* ===== Kereta (dibina daripada kotak dan silinder) ===== */

interface Kereta {
  kumpulan: Group;
  roda: Group[];
  /** Jejari roda dalam meter dunia (untuk putaran). */
  jejariRoda: number;
  lampuBelakang: MeshBasicMaterial;
  /** Warna lampu belakang: [biasa, semasa membrek]. */
  lampu: [number, number];
  badan: MeshPhongMaterial;
  /** Tinggi terapung di atas trek (kapal angkasa). */
  apung: number;
  /** Kaki penunggang basikal (peha dan betis setiap sisi). */
  kaki?: { sisi: number; peha: Mesh; betis: Mesh }[];
  fasaKayuh: number;
  /** Api enjin kapal angkasa. */
  api?: Mesh[];
}

function binaKenderaan(tema: TemaLumba, warna: string, pemain: boolean): Kereta {
  if (tema === 'basikal') return binaBasikal(warna, pemain);
  if (tema === 'angkasa') return binaKapal(warna, pemain);
  return binaKereta(warna, pemain);
}

/** Letak kotak (paksi panjang y) antara dua titik pada satah YZ. */
function rentangYZ(m: Mesh, x: number, y1: number, z1: number, y2: number, z2: number): void {
  const dy = y2 - y1;
  const dz = z2 - z1;
  m.position.set(x, (y1 + y2) / 2, (z1 + z2) / 2);
  m.scale.y = Math.max(0.01, Math.hypot(dy, dz));
  m.rotation.x = Math.atan2(dz, dy);
}

/* ===== Basikal dan penunggang (KZ-057) ===== */

const SKALA_BASIKAL = 1.35;
const PINGGUL: [number, number] = [1.0, 0.2];
const ENGKOL: [number, number] = [0.34, 0.05];
const JEJARI_ENGKOL = 0.17;
const PEHA = 0.44;
const BETIS = 0.46;

function binaBasikal(warna: string, pemain: boolean): Kereta {
  const kumpulan = new Group();
  kumpulan.rotation.order = 'YXZ';
  const dalam = new Group();
  dalam.scale.setScalar(SKALA_BASIKAL);
  kumpulan.add(dalam);

  const badan = new MeshPhongMaterial({ color: warna, shininess: 70, specular: 0x555555 });
  const rangka = new MeshPhongMaterial({ color: pemain ? 0xf8fafc : 0x334155, shininess: 90 });
  const gelap = new MeshPhongMaterial({ color: 0x1f2937, shininess: 20 });
  const kulit = new MeshLambertMaterial({ color: 0xe0b08a });

  const kotak = (m: Material, w: number, h: number, d: number): Mesh => {
    const mesh = new Mesh(new BoxGeometry(w, h, d), m);
    mesh.castShadow = true;
    dalam.add(mesh);
    return mesh;
  };
  const batang = (m: Material, tebal: number, y1: number, z1: number, y2: number, z2: number, x = 0): Mesh => {
    const mesh = kotak(m, tebal, 1, tebal);
    rentangYZ(mesh, x, y1, z1, y2, z2);
    return mesh;
  };

  // Rangka: hab depan (0.34,-0.56), hab belakang (0.34,0.56), kepala (0.82,-0.42), tempat duduk (0.88,0.22).
  batang(rangka, 0.05, 0.8, -0.42, 0.84, 0.2);
  batang(rangka, 0.055, 0.78, -0.42, ENGKOL[0], ENGKOL[1]);
  batang(rangka, 0.05, ENGKOL[0], ENGKOL[1], 0.9, 0.22);
  batang(rangka, 0.04, 0.34, -0.56, 0.92, -0.4);
  batang(rangka, 0.035, ENGKOL[0], ENGKOL[1], 0.34, 0.56);
  batang(rangka, 0.035, 0.34, 0.56, 0.84, 0.22);
  kotak(gelap, 0.5, 0.04, 0.04).position.set(0, 0.93, -0.42);
  kotak(gelap, 0.15, 0.05, 0.3).position.set(0, 0.92, 0.22);

  // Roda dengan jejari supaya putaran kelihatan.
  const tayar = new MeshPhongMaterial({ color: 0x111111, shininess: 10 });
  const jejari = new MeshLambertMaterial({ color: 0xcbd5e1 });
  const gTayar = new CylinderGeometry(0.34, 0.34, 0.06, 20);
  const gJejari = new BoxGeometry(0.02, 0.6, 0.03);
  const roda: Group[] = [];
  for (const z of [-0.56, 0.56]) {
    const r = new Group();
    r.position.set(0, 0.34, z);
    const t = new Mesh(gTayar, tayar);
    t.rotation.z = Math.PI / 2;
    t.castShadow = true;
    const j1 = new Mesh(gJejari, jejari);
    const j2 = new Mesh(gJejari, jejari);
    j2.rotation.x = Math.PI / 2;
    j1.position.x = 0.035;
    j2.position.x = 0.035;
    const j3 = j1.clone();
    const j4 = j2.clone();
    j3.position.x = -0.035;
    j4.position.x = -0.035;
    r.add(t, j1, j2, j3, j4);
    dalam.add(r);
    roda.push(r);
  }

  // Penunggang: badan condong ke hadapan, kepala, topi keledar, lengan.
  const torso = kotak(badan, 0.36, 1, 0.22);
  rentangYZ(torso, 0, PINGGUL[0], PINGGUL[1], 1.48, -0.24);
  const kepala = new Mesh(new SphereGeometry(0.14, 12, 10), kulit);
  kepala.position.set(0, 1.6, -0.33);
  kepala.castShadow = true;
  const topi = new Mesh(new SphereGeometry(0.165, 12, 8, 0, Math.PI * 2, 0, Math.PI / 1.9), pemain ? rangka : gelap);
  topi.position.set(0, 1.62, -0.32);
  topi.rotation.x = -0.35;
  dalam.add(kepala, topi);
  for (const x of [-0.2, 0.2]) batang(kulit, 0.075, 1.42, -0.2, 0.95, -0.42, x);

  // Kaki: dikemas kini setiap bingkai (kayuhKaki).
  const seluar = new MeshLambertMaterial({ color: 0x111827 });
  const kaki = [-1, 1].map((sisi) => ({
    sisi,
    peha: kotak(seluar, 0.13, 1, 0.13),
    betis: kotak(kulit, 0.09, 1, 0.09),
  }));

  // Lampu belakang kecil.
  const lampuBelakang = new MeshBasicMaterial({ color: 0x7f1d1d });
  const lampu = new Mesh(new BoxGeometry(0.07, 0.07, 0.04), lampuBelakang);
  lampu.position.set(0, 0.8, 0.3);
  dalam.add(lampu);

  const k: Kereta = {
    kumpulan,
    roda,
    jejariRoda: 0.34 * SKALA_BASIKAL,
    lampuBelakang,
    lampu: [0x7f1d1d, 0xff3b3b],
    badan,
    apung: 0,
    kaki,
    fasaKayuh: pemain ? 0 : 1.3,
  };
  kayuhKaki(k);
  return k;
}

/** Kinematik songsang dua ruas pada satah YZ: pinggul ke pedal. */
function kayuhKaki(k: Kereta): void {
  if (!k.kaki) return;
  for (const kk of k.kaki) {
    const f = k.fasaKayuh + (kk.sisi > 0 ? Math.PI : 0);
    const py = ENGKOL[0] + JEJARI_ENGKOL * Math.sin(f);
    const pz = ENGKOL[1] + JEJARI_ENGKOL * Math.cos(f);
    const dy = py - PINGGUL[0];
    const dz = pz - PINGGUL[1];
    const L = Math.min(PEHA + BETIS - 0.01, Math.hypot(dy, dz));
    const a = (PEHA * PEHA - BETIS * BETIS + L * L) / (2 * L);
    const h = Math.sqrt(Math.max(0, PEHA * PEHA - a * a));
    // Unit sepanjang kaki dan serenjang menghala ke hadapan (lutut ke depan).
    const uy = dy / L;
    const uz = dz / L;
    const ly = PINGGUL[0] + uy * a - uz * h;
    const lz = PINGGUL[1] + uz * a + uy * h;
    const x = kk.sisi * 0.11;
    rentangYZ(kk.peha, x, PINGGUL[0], PINGGUL[1], ly, lz);
    rentangYZ(kk.betis, x, ly, lz, py, pz);
  }
}

/* ===== Kapal angkasa (KZ-057) ===== */

function binaKapal(warna: string, pemain: boolean): Kereta {
  const kumpulan = new Group();
  kumpulan.rotation.order = 'YXZ';
  const badan = new MeshPhongMaterial({ color: warna, shininess: 110, specular: 0x8899bb });
  const gelap = new MeshPhongMaterial({ color: 0x1e293b, shininess: 50 });
  const kaca = new MeshPhongMaterial({ color: 0x0ea5e9, shininess: 160, specular: 0xffffff, emissive: 0x0c4a6e });

  const tambah = (g: BufferGeometry, m: Material, x: number, y: number, z: number): Mesh => {
    const mesh = new Mesh(g, m);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    kumpulan.add(mesh);
    return mesh;
  };

  // Badan, muncung, kokpit.
  tambah(new BoxGeometry(0.95, 0.46, 2.4), badan, 0, 0, 0);
  tambah(new ConeGeometry(0.52, 1.7, 8), badan, 0, 0, -2.03).rotation.x = -Math.PI / 2;
  const kokpit = tambah(new SphereGeometry(0.4, 14, 10), kaca, 0, 0.26, -0.55);
  kokpit.scale.set(1, 0.7, 1.7);

  // Sayap sapu ke belakang, hujung sayap, sirip.
  for (const s of [-1, 1]) {
    const sayap = tambah(new BoxGeometry(1.55, 0.08, 1.05), badan, s * 1.1, -0.05, 0.6);
    sayap.rotation.y = s * 0.32;
    sayap.rotation.z = s * 0.07;
    tambah(new BoxGeometry(0.1, 0.4, 1.0), gelap, s * 1.86, 0.08, 0.92);
  }
  tambah(new BoxGeometry(0.08, 0.62, 0.8), pemain ? badan : gelap, 0, 0.5, 0.85);
  if (pemain) {
    tambah(new BoxGeometry(0.2, 0.02, 1.9), new MeshPhongMaterial({ color: 0xffffff, shininess: 60 }), 0, 0.24, 0.45);
  }

  // Enjin berkembar, cakera cahaya dan api.
  const lampuBelakang = new MeshBasicMaterial({ color: 0x67e8f9 });
  const bahanApi = new MeshBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.75, depthWrite: false });
  const api: Mesh[] = [];
  for (const s of [-1, 1]) {
    tambah(new CylinderGeometry(0.24, 0.27, 0.95, 12), gelap, s * 0.5, 0, 1.3).rotation.x = Math.PI / 2;
    tambah(new CylinderGeometry(0.19, 0.19, 0.05, 12), lampuBelakang, s * 0.5, 0, 1.79).rotation.x = Math.PI / 2;
    const a = new Mesh(new ConeGeometry(0.19, 1, 10), bahanApi);
    a.rotation.x = Math.PI / 2;
    a.position.set(s * 0.5, 0, 2.3);
    kumpulan.add(a);
    api.push(a);
  }
  return {
    kumpulan,
    roda: [],
    jejariRoda: 1,
    lampuBelakang,
    lampu: [0x67e8f9, 0xff7a3b],
    badan,
    apung: 1.0,
    fasaKayuh: 0,
    api,
  };
}

function binaKereta(warna: string, pemain: boolean): Kereta {
  const kumpulan = new Group();
  kumpulan.rotation.order = 'YXZ';
  const badan = new MeshPhongMaterial({ color: warna, shininess: 90, specular: 0x666666 });
  const gelap = new MeshPhongMaterial({ color: 0x1f2937, shininess: 30 });
  const kaca = new MeshPhongMaterial({ color: 0x0f172a, shininess: 140, specular: 0xaabbcc });

  const tambah = (g: BufferGeometry, m: Material, x: number, y: number, z: number): Mesh => {
    const mesh = new Mesh(g, m);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    kumpulan.add(mesh);
    return mesh;
  };

  // Badan bawah, hidung condong, kabin kaca, sisi gelap.
  tambah(new BoxGeometry(1.86, 0.42, 4.1), badan, 0, 0.52, 0);
  const hidung = tambah(new BoxGeometry(1.7, 0.26, 1.2), badan, 0, 0.62, -1.95);
  hidung.rotation.x = 0.16;
  tambah(new BoxGeometry(1.9, 0.16, 4.0), gelap, 0, 0.3, 0);
  tambah(new BoxGeometry(1.42, 0.46, 1.9), kaca, 0, 0.95, 0.25);
  tambah(new BoxGeometry(1.3, 0.06, 1.5), badan, 0, 1.2, 0.3);

  // Sayap belakang.
  tambah(new BoxGeometry(0.1, 0.32, 0.1), gelap, -0.6, 0.86, 1.85);
  tambah(new BoxGeometry(0.1, 0.32, 0.1), gelap, 0.6, 0.86, 1.85);
  tambah(new BoxGeometry(1.96, 0.07, 0.5), pemain ? badan : gelap, 0, 1.04, 1.9);

  // Jalur Kuizen putih pada bonet (pemain sahaja).
  if (pemain) {
    const jalur = new MeshPhongMaterial({ color: 0xffffff, shininess: 60 });
    tambah(new BoxGeometry(0.34, 0.02, 2.0), jalur, 0, 0.745, -1.0);
    tambah(new BoxGeometry(0.34, 0.02, 1.4), jalur, 0, 1.24, 0.3);
  }

  // Lampu hadapan dan belakang.
  const lampuDepan = new MeshBasicMaterial({ color: 0xfff7d6 });
  tambah(new BoxGeometry(0.42, 0.12, 0.05), lampuDepan, -0.58, 0.62, -2.06);
  tambah(new BoxGeometry(0.42, 0.12, 0.05), lampuDepan, 0.58, 0.62, -2.06);
  const lampuBelakang = new MeshBasicMaterial({ color: 0x7f1d1d });
  tambah(new BoxGeometry(0.5, 0.12, 0.05), lampuBelakang, -0.6, 0.6, 2.06);
  tambah(new BoxGeometry(0.5, 0.12, 0.05), lampuBelakang, 0.6, 0.6, 2.06);

  // Roda: kumpulan berputar pada paksi x, silinder diputar 90 darjah.
  const tayar = new MeshPhongMaterial({ color: 0x111111, shininess: 10 });
  const hab = new MeshPhongMaterial({ color: 0xcbd5e1, shininess: 80 });
  const gTayar = new CylinderGeometry(0.38, 0.38, 0.32, 18);
  const gHab = new CylinderGeometry(0.2, 0.2, 0.34, 6);
  const roda: Group[] = [];
  for (const [x, z] of [
    [-0.93, -1.32],
    [0.93, -1.32],
    [-0.93, 1.32],
    [0.93, 1.32],
  ] as const) {
    const r = new Group();
    r.position.set(x, 0.38, z);
    const t = new Mesh(gTayar, tayar);
    t.rotation.z = Math.PI / 2;
    t.castShadow = true;
    const h = new Mesh(gHab, hab);
    h.rotation.z = Math.PI / 2;
    r.add(t, h);
    kumpulan.add(r);
    roda.push(r);
  }
  return { kumpulan, roda, jejariRoda: 0.38, lampuBelakang, lampu: [0x7f1d1d, 0xff3b3b], badan, apung: 0, fasaKayuh: 0 };
}

/* ===== Asap / debu (pool sprite) ===== */

interface Zarah {
  sprite: Sprite;
  hayat: number;
  umur: number;
  vel: Vector3;
}

/* ===== Kelas utama ===== */

export class Pemandangan3D {
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private kamera: PerspectiveCamera;
  private matahari: DirectionalLight;
  private langit = new Group();
  private pemain: Kereta;
  private komputer: Kereta[];
  private garisLaju: LineSegments;
  private garisPos: Float32Array;
  private garisData: { x: number; y: number; z: number }[] = [];
  private zarah: Zarah[] = [];
  private zarahSeterus = 0;
  private tandaSoal: Sprite;
  private masaLepas = 0;
  private jarakLepas = 0;
  private kelajuanLepas = 0;
  private kamPos = new Vector3();
  private kamSasar = new Vector3();
  private sedia = false;
  private v1 = new Vector3();
  private v2 = new Vector3();
  private lebar = 0;
  private tinggi = 0;
  private telefon: boolean;
  private tema: TemaLumba;
  private palet: Palet;
  private offsetLepas = 0;
  private condong = 0;

  constructor(kanvas: HTMLCanvasElement, tema: TemaLumba = 'kereta') {
    this.tema = tema;
    this.palet = PALET[tema];
    const pal = this.palet;
    this.telefon = typeof window !== 'undefined' && window.innerWidth < 760;
    // Lontar jika WebGL tiada; pemanggil kekal dengan 2D.
    this.renderer = new WebGLRenderer({
      canvas: kanvas,
      antialias: !this.telefon,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.shadowMap.enabled = tema !== 'angkasa';
    this.renderer.shadowMap.type = PCFSoftShadowMap;

    const langitWarna = new Color(pal.latar);
    this.scene.background = langitWarna;
    this.scene.fog = new Fog(langitWarna, pal.kabus[0], pal.kabus[1]);

    this.kamera = new PerspectiveCamera(62, 16 / 9, 0.3, 3200);
    this.scene.add(this.kamera);

    // Cahaya.
    this.scene.add(new HemisphereLight(pal.hemi[0], pal.hemi[1], pal.hemi[2]));
    this.matahari = new DirectionalLight(pal.matahari[0], pal.matahari[1]);
    this.matahari.castShadow = true;
    const saiz = this.telefon ? 1024 : 2048;
    this.matahari.shadow.mapSize.set(saiz, saiz);
    const kb = this.matahari.shadow.camera;
    kb.left = -22;
    kb.right = 22;
    kb.top = 22;
    kb.bottom = -22;
    kb.near = 1;
    kb.far = 120;
    this.matahari.shadow.bias = -0.0008;
    this.scene.add(this.matahari, this.matahari.target);

    if (tema === 'angkasa') this.binaLangitAngkasa();
    else this.binaLangit();
    this.binaTrek();
    if (tema === 'angkasa') this.binaPemandanganAngkasa();
    else this.binaPemandangan();
    this.binaGerbang();

    this.pemain = binaKenderaan(tema, WARNA_PEMAIN, true);
    this.scene.add(this.pemain.kumpulan);
    this.komputer = WARNA_KOMPUTER.map((w) => {
      const k = binaKenderaan(tema, w, false);
      this.scene.add(k.kumpulan);
      return k;
    });

    // Garis laju dalam ruang kamera.
    const bil = 80;
    this.garisPos = new Float32Array(bil * 2 * 3);
    const r = rawakBerbiji(42);
    for (let i = 0; i < bil; i++) {
      const sudut = r() * Math.PI * 2;
      const jejari = 2.2 + r() * 4.5;
      this.garisData.push({ x: Math.cos(sudut) * jejari, y: Math.sin(sudut) * jejari * 0.7, z: -5 - r() * 60 });
    }
    const gg = new BufferGeometry();
    gg.setAttribute('position', new BufferAttribute(this.garisPos, 3));
    this.garisLaju = new LineSegments(
      gg,
      new LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, fog: false }),
    );
    this.garisLaju.frustumCulled = false;
    this.kamera.add(this.garisLaju);

    // Pool zarah asap / debu.
    const tAsap = teksturBulat('rgba(255,255,255,0.9)', 'rgba(255,255,255,0)');
    for (let i = 0; i < 36; i++) {
      const s = new Sprite(new SpriteMaterial({ map: tAsap, transparent: true, depthWrite: false, opacity: 0 }));
      s.visible = false;
      this.scene.add(s);
      this.zarah.push({ sprite: s, hayat: 1, umur: 2, vel: new Vector3() });
    }

    // Tanda soal terapung semasa soalan dibuka.
    this.tandaSoal = new Sprite(new SpriteMaterial({ map: teksturTandaSoal(), transparent: true, depthWrite: false, fog: false }));
    this.tandaSoal.scale.set(3.2, 3.2, 1);
    this.tandaSoal.visible = false;
    this.scene.add(this.tandaSoal);

    this.sedia = true;
  }

  private binaLangit(): void {
    // Kubah langit kecerunan (mengikut kamera, tanpa kabus).
    const g = new SphereGeometry(2600, 32, 16);
    const warna: number[] = [];
    const atas = new Color(this.palet.langitAtas);
    const ufuk = new Color(this.palet.langitUfuk);
    const p = g.getAttribute('position');
    const c = new Color();
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i) / 2600;
      c.copy(ufuk).lerp(atas, Math.max(0, Math.min(1, y * 2.2)));
      warna.push(c.r, c.g, c.b);
    }
    g.setAttribute('color', new BufferAttribute(new Float32Array(warna), 3));
    this.langit.add(new Mesh(g, new MeshBasicMaterial({ vertexColors: true, side: BackSide, fog: false, depthWrite: false })));

    // Gunung jauh.
    const r = rawakBerbiji(11);
    const gunungBahan = [
      new MeshLambertMaterial({ color: this.palet.gunung[0], fog: false, flatShading: true }),
      new MeshLambertMaterial({ color: this.palet.gunung[1], fog: false, flatShading: true }),
    ];
    for (let i = 0; i < 22; i++) {
      const sudut = (i / 22) * Math.PI * 2 + r() * 0.2;
      const jejari = 1500 + r() * 500;
      const tinggi = 180 + r() * 320;
      const m = new Mesh(new ConeGeometry(220 + r() * 260, tinggi, 6), gunungBahan[i % 2]);
      m.position.set(Math.cos(sudut) * jejari, tinggi / 2 - 40, Math.sin(sudut) * jejari);
      m.rotation.y = r() * Math.PI;
      this.langit.add(m);
    }

    // Awan putih (gugusan sfera).
    const awanBahan = new MeshLambertMaterial({ color: 0xffffff, fog: false, emissive: 0x9fb3c8 });
    const gAwan = new SphereGeometry(1, 10, 8);
    for (let i = 0; i < 14; i++) {
      const awan = new Group();
      const sudut = r() * Math.PI * 2;
      const jejari = 700 + r() * 900;
      awan.position.set(Math.cos(sudut) * jejari, 260 + r() * 220, Math.sin(sudut) * jejari);
      for (let j = 0; j < 4; j++) {
        const s = new Mesh(gAwan, awanBahan);
        s.position.set((j - 1.5) * 38 + r() * 20, r() * 14, r() * 30);
        s.scale.set(48 + r() * 30, 22 + r() * 10, 36 + r() * 20);
        awan.add(s);
      }
      this.langit.add(awan);
    }
    this.scene.add(this.langit);
  }

  /** Langit angkasa: bintang, planet bercincin dan bulan (KZ-057). */
  private binaLangitAngkasa(): void {
    const r = rawakBerbiji(77);
    const bil = this.telefon ? 900 : 1800;
    const pos = new Float32Array(bil * 3);
    const warna = new Float32Array(bil * 3);
    const c = new Color();
    for (let i = 0; i < bil; i++) {
      const u = r() * 2 - 1;
      const sudut = r() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      pos.set([Math.cos(sudut) * s * 2400, u * 2400, Math.sin(sudut) * s * 2400], i * 3);
      c.setHSL(0.55 + r() * 0.2, 0.5, 0.65 + r() * 0.35);
      warna.set([c.r, c.g, c.b], i * 3);
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(pos, 3));
    g.setAttribute('color', new BufferAttribute(warna, 3));
    const bintang = new Points(
      g,
      new PointsMaterial({ size: 2.4, sizeAttenuation: false, vertexColors: true, fog: false, depthWrite: false }),
    );
    bintang.frustumCulled = false;
    this.langit.add(bintang);

    const planet = (x: number, y: number, z: number, jejari: number, warnaP: number, cincin: number | null): void => {
      const m = new Mesh(
        new SphereGeometry(jejari, 28, 18),
        new MeshLambertMaterial({ color: warnaP, fog: false, flatShading: true }),
      );
      m.position.set(x, y, z);
      this.langit.add(m);
      if (cincin !== null) {
        const c2 = new Mesh(
          new RingGeometry(jejari * 1.35, jejari * 2.1, 56),
          new MeshBasicMaterial({ color: cincin, side: DoubleSide, transparent: true, opacity: 0.55, fog: false, depthWrite: false }),
        );
        c2.position.set(x, y, z);
        c2.rotation.set(Math.PI / 2 - 0.35, 0.25, 0);
        this.langit.add(c2);
      }
    };
    planet(-900, 520, -1500, 260, 0xd97706, 0xfde68a);
    planet(1200, 300, -900, 120, 0x38bdf8, null);
    planet(500, 760, 1400, 180, 0xa78bfa, 0xe9d5ff);
    planet(-1500, 180, 700, 90, 0x94a3b8, null);
    this.scene.add(this.langit);
  }

  private binaTrek(): void {
    const angkasa = this.tema === 'angkasa';
    const tJalan = teksturJalan(angkasa);
    const jalan = new Mesh(
      jalurTrek(-SEPARUH_JALAN, SEPARUH_JALAN, 0.03, 3, 18),
      angkasa
        ? new MeshBasicMaterial({ map: tJalan })
        : new MeshLambertMaterial({ map: tJalan, color: this.palet.jalan }),
    );
    jalan.receiveShadow = true;
    this.scene.add(jalan);

    const tBebendul = teksturBebendul();
    const bahanBebendul = angkasa
      ? new MeshBasicMaterial({ color: 0xe879f9 })
      : new MeshLambertMaterial({ map: tBebendul });
    for (const [a, b] of [
      [-SEPARUH_JALAN - LEBAR_BEBENDUL, -SEPARUH_JALAN],
      [SEPARUH_JALAN, SEPARUH_JALAN + LEBAR_BEBENDUL],
    ] as const) {
      const m = new Mesh(jalurTrek(a, b, 0.06, 3, 6), bahanBebendul);
      m.receiveShadow = true;
      this.scene.add(m);
    }

    if (!angkasa) {
      const tanah = new Mesh(rupaBumi(this.palet), new MeshLambertMaterial({ vertexColors: true }));
      tanah.receiveShadow = true;
      this.scene.add(tanah);
    }

    // Petak mula dan penamat pada permukaan jalan.
    const tPetak = teksturPetak(14, 2);
    const bahanPetak = new MeshLambertMaterial({ map: tPetak });
    for (const d of [0, 4800]) {
      const g = new PlaneGeometry(SEPARUH_JALAN * 2, 1.6);
      const m = new Mesh(g, bahanPetak);
      titikTrek(d, 0, m.position, 0.05);
      m.rotation.order = 'YXZ';
      m.rotation.y = Math.atan2(-cerunX(d), 1);
      m.rotation.x = -Math.PI / 2;
      m.receiveShadow = true;
      this.scene.add(m);
    }
  }

  private binaPemandangan(): void {
    const r = rawakBerbiji(2026);

    // Pokok: batang + dua kon daun (InstancedMesh, satu panggilan lukis setiap bahagian).
    const bil = this.telefon ? 520 : 900;
    const batang = new InstancedMesh(
      new CylinderGeometry(0.22, 0.32, 2.2, 6),
      new MeshLambertMaterial({ color: 0x6b4423 }),
      bil,
    );
    const daun1 = new InstancedMesh(new ConeGeometry(1.9, 3.6, 7), new MeshLambertMaterial({ color: this.palet.daun[0], flatShading: true }), bil);
    const daun2 = new InstancedMesh(new ConeGeometry(1.4, 2.8, 7), new MeshLambertMaterial({ color: this.palet.daun[1], flatShading: true }), bil);
    const o = new Object3D();
    const v = new Vector3();
    for (let i = 0; i < bil; i++) {
      const d = -LEBIHAN_TREK + r() * (4800 + LEBIHAN_TREK * 2);
      const sisi = r() < 0.5 ? -1 : 1;
      const L = sisi * (9 + Math.pow(r(), 1.4) * 95);
      titikTrek(d, L, v);
      const y = tinggiTanah(d, L);
      const sk = 0.7 + r() * 0.9;
      o.position.set(v.x, y + 1.1 * sk, v.z);
      o.rotation.set(0, r() * Math.PI, 0);
      o.scale.set(sk, sk, sk);
      o.updateMatrix();
      batang.setMatrixAt(i, o.matrix);
      o.position.y = y + (2.2 + 1.5) * sk;
      o.updateMatrix();
      daun1.setMatrixAt(i, o.matrix);
      o.position.y = y + (2.2 + 3.1) * sk;
      o.updateMatrix();
      daun2.setMatrixAt(i, o.matrix);
    }
    for (const m of [batang, daun1, daun2]) {
      m.castShadow = false;
      m.receiveShadow = false;
      this.scene.add(m);
    }

    // Batu kecil di tepi.
    const batu = new InstancedMesh(new DodecahedronGeometry(0.7, 0), new MeshLambertMaterial({ color: 0x8a8f98, flatShading: true }), 260);
    for (let i = 0; i < 260; i++) {
      const d = -LEBIHAN_TREK + r() * (4800 + LEBIHAN_TREK * 2);
      const L = (r() < 0.5 ? -1 : 1) * (6.4 + r() * 30);
      titikTrek(d, L, v);
      const sk = 0.4 + r() * 1.3;
      o.position.set(v.x, tinggiTanah(d, L) + 0.2 * sk, v.z);
      o.rotation.set(r() * 3, r() * 3, r() * 3);
      o.scale.set(sk, sk * 0.7, sk);
      o.updateMatrix();
      batu.setMatrixAt(i, o.matrix);
    }
    this.scene.add(batu);
    this.binaBendera();
  }

  /** Asteroid terapung dan suar neon di tepi landasan (KZ-057). */
  private binaPemandanganAngkasa(): void {
    const r = rawakBerbiji(909);
    const o = new Object3D();
    const v = new Vector3();
    const bil = this.telefon ? 320 : 600;
    const batu = new InstancedMesh(
      new DodecahedronGeometry(1, 0),
      new MeshLambertMaterial({ color: this.palet.daun[0], flatShading: true }),
      bil,
    );
    for (let i = 0; i < bil; i++) {
      const d = -LEBIHAN_TREK + r() * (4800 + LEBIHAN_TREK * 2);
      const L = (r() < 0.5 ? -1 : 1) * (9 + Math.pow(r(), 1.5) * 150);
      titikTrek(d, L, v);
      const sk = 0.5 + Math.pow(r(), 2) * 6;
      o.position.set(v.x, tinggiY(d) + (r() - 0.35) * (14 + Math.abs(L) * 0.5), v.z);
      o.rotation.set(r() * 3, r() * 3, r() * 3);
      o.scale.set(sk, sk * (0.6 + r() * 0.5), sk);
      o.updateMatrix();
      batu.setMatrixAt(i, o.matrix);
    }
    this.scene.add(batu);

    // Suar neon di kedua-dua tepi setiap 30 m, warna berselang.
    const jarak = 30;
    const n = Math.floor((4800 + 400) / (jarak * 2)) * 2;
    const gSuar = new BoxGeometry(0.25, 1.6, 0.25);
    const tepi = SEPARUH_JALAN + LEBAR_BEBENDUL + 0.5;
    [0x22d3ee, 0xe879f9].forEach((warnaS, w) => {
      const suar = new InstancedMesh(gSuar, new MeshBasicMaterial({ color: warnaS }), n);
      o.rotation.set(0, 0, 0);
      o.scale.set(1, 1, 1);
      for (let i = 0; i < n / 2; i++) {
        const d = -200 + (i * 2 + w) * jarak;
        for (const sisi of [-1, 1]) {
          titikTrek(d, sisi * tepi, v, 0.8);
          o.position.copy(v);
          o.updateMatrix();
          suar.setMatrixAt(i * 2 + (sisi > 0 ? 1 : 0), o.matrix);
        }
      }
      this.scene.add(suar);
    });
  }

  /** Gerbang: mula, penamat, dan gerbang Kuizen setiap 600 m. */
  private binaGerbang(): void {
    const tiang = new MeshPhongMaterial({
      color: this.palet.tiang,
      shininess: 60,
      emissive: this.tema === 'angkasa' ? 0x3730a3 : 0x000000,
    });
    const gTiang = new BoxGeometry(0.6, 6.4, 0.6);
    const lebarGerbang = (SEPARUH_JALAN + LEBAR_BEBENDUL + 0.9) * 2;
    const gerbang = (d: number, sepanduk: Material, kaki: Material): void => {
      const g = new Group();
      titikTrek(d, 0, g.position);
      g.rotation.y = Math.atan2(-cerunX(d), 1);
      for (const x of [-lebarGerbang / 2, lebarGerbang / 2]) {
        const t = new Mesh(gTiang, kaki);
        t.position.set(x, 3.2, 0);
        t.castShadow = true;
        g.add(t);
      }
      const rasuk = new Mesh(new BoxGeometry(lebarGerbang + 0.6, 1.3, 0.4), [
        tiang,
        tiang,
        tiang,
        tiang,
        sepanduk,
        sepanduk,
      ]);
      rasuk.position.set(0, 6.4, 0);
      g.add(rasuk);
      this.scene.add(g);
    };
    const sepandukKuizen = new MeshBasicMaterial({ map: teksturSepanduk('KUIZEN', this.palet.sepanduk) });
    const sepandukPetak = new MeshBasicMaterial({ map: teksturPetak(16, 2) });
    gerbang(-2, sepandukPetak, tiang);
    gerbang(4800, sepandukPetak, tiang);
    for (let d = 600; d < 4800; d += 600) gerbang(d, sepandukKuizen, tiang);
  }

  /** Bendera kecil berwarna di sepanjang tepi berhampiran mula. */
  private binaBendera(): void {
    const warnaBendera = [0x7c3aed, 0x38bdf8, 0xf87171, 0xfacc15];
    const gBendera = new BoxGeometry(0.05, 0.8, 1.1);
    const gTiangBendera = new CylinderGeometry(0.04, 0.04, 3, 5);
    const bahanTiang = new MeshLambertMaterial({ color: 0xe5e7eb });
    for (let i = 0; i < 24; i++) {
      const d = -60 + i * 12;
      for (const sisi of [-1, 1]) {
        const L = sisi * (SEPARUH_JALAN + LEBAR_BEBENDUL + 1.6);
        const p = titikTrek(d, L, new Vector3());
        p.y = tinggiTanah(d, L);
        const t = new Mesh(gTiangBendera, bahanTiang);
        t.position.set(p.x, p.y + 1.5, p.z);
        const b = new Mesh(gBendera, new MeshLambertMaterial({ color: warnaBendera[(i + (sisi > 0 ? 1 : 0)) % 4] }));
        b.position.set(p.x, p.y + 2.55, p.z - 0.55);
        this.scene.add(t, b);
      }
    }
  }

  /** Laraskan saiz kanvas (piksel CSS) dan nisbah piksel. */
  ubahSaiz(lebar: number, tinggi: number, dpr: number): void {
    if (lebar === this.lebar && tinggi === this.tinggi) return;
    this.lebar = lebar;
    this.tinggi = tinggi;
    this.renderer.setPixelRatio(Math.min(dpr, this.telefon ? 1.5 : 2));
    this.renderer.setSize(lebar, tinggi, false);
    this.kamera.aspect = lebar / Math.max(1, tinggi);
    this.kamera.updateProjectionMatrix();
  }

  /** jarakGerak: meter yang dilalui sejak bingkai lepas (putaran roda, kayuhan). */
  private letakKereta(k: Kereta, d: number, offset: number, jarakGerak: number, condong = 0, masaS = 0): void {
    const apung = k.apung > 0 ? k.apung + Math.sin(masaS * 2.3 + offset) * 0.12 : 0;
    titikTrek(d, offset, k.kumpulan.position, apung);
    k.kumpulan.rotation.y = Math.atan2(-cerunX(d), 1);
    k.kumpulan.rotation.x = Math.atan(cerunY(d));
    k.kumpulan.rotation.z = -condong;
    for (const r of k.roda) r.rotation.x -= jarakGerak / k.jejariRoda;
    if (k.kaki) {
      k.fasaKayuh -= jarakGerak / (k.jejariRoda * 2.8);
      kayuhKaki(k);
    }
  }

  private semburZarah(pos: Vector3, warna: number, kelajuanMs: number): void {
    const z = this.zarah[this.zarahSeterus];
    this.zarahSeterus = (this.zarahSeterus + 1) % this.zarah.length;
    z.sprite.position.copy(pos);
    z.sprite.position.x += (Math.random() - 0.5) * 0.8;
    z.sprite.visible = true;
    (z.sprite.material as SpriteMaterial).color.setHex(warna);
    z.umur = 0;
    z.hayat = 0.8 + Math.random() * 0.5;
    z.vel.set((Math.random() - 0.5) * 1.2, 1.2 + Math.random() * 1.4, Math.min(12, kelajuanMs * 0.25));
  }

  /** Lukis satu bingkai. */
  render(p: Pemandangan3DData): void {
    if (!this.sedia) return;
    let dt = (p.masaMs - this.masaLepas) / 1000;
    // dt <= 0 (masa tidak bergerak) menghasilkan 0/0 = NaN dalam halaju
    // lateral; NaN melekat pada this.condong dan kereta pemain hilang.
    if (!(dt > 0) || dt > 0.25) dt = 0.016;
    this.masaLepas = p.masaMs;
    const masaS = p.masaMs / 1000;
    const ms = p.kelajuan / 3.6;
    const pecahanLaju = Math.max(0, Math.min(1, (p.kelajuan - 60) / 180));

    // Kereta pemain.
    const gerak = Math.max(0, p.jarakM - this.jarakLepas) || 0;
    this.jarakLepas = p.jarakM;
    // Condong ke arah gerakan lateral (basikal dan kapal angkasa sahaja).
    const halajuL = (p.offsetM - this.offsetLepas) / dt;
    this.offsetLepas = p.offsetM;
    const [pekali, had] = this.palet.condong;
    const sasarCondong = Math.max(-had, Math.min(had, halajuL * pekali));
    this.condong += (sasarCondong - this.condong) * Math.min(1, dt * 8);
    if (!Number.isFinite(this.condong)) this.condong = 0;
    this.letakKereta(this.pemain, p.jarakM, p.offsetM, gerak, this.condong, masaS);
    const brek = p.kelajuan < this.kelajuanLepas - 0.05;
    this.kelajuanLepas = p.kelajuan;
    this.pemain.lampuBelakang.color.setHex(this.pemain.lampu[brek ? 1 : 0]);
    if (this.pemain.api) {
      const panjang = 0.25 + pecahanLaju * 1.5 + Math.random() * 0.15;
      for (const a of this.pemain.api) {
        a.scale.y = panjang;
        a.position.z = 1.8 + panjang / 2;
      }
    }
    if (p.penalti) {
      const kelip = Math.sin(masaS * 18) > 0;
      this.pemain.badan.emissive.setHex(kelip ? 0x7c2d12 : 0x000000);
    } else {
      this.pemain.badan.emissive.setHex(0x000000);
    }
    if (p.diLuarJalan) {
      this.pemain.kumpulan.position.y += Math.sin(masaS * 40) * 0.04;
    }

    // Kereta komputer.
    for (let i = 0; i < this.komputer.length; i++) {
      const kmj = p.kelajuanKomputer[i] ?? 150;
      // KZ-UTT: mod ujian memberi masaKomputerMs (tolak masa soalan) supaya
      // lawan berhenti bersama pemain; animasi lain kekal pada masaMs.
      const d = Math.min(p.trekPanjangM + 30, (kmj / 3.6) * ((p.masaKomputerMs ?? p.masaMs) / 1000));
      const k = this.komputer[i];
      const nampak = Math.abs(d - p.jarakM) < 500;
      k.kumpulan.visible = nampak;
      if (nampak) this.letakKereta(k, d, LORONG_KOMPUTER[i] ?? 0, (kmj / 3.6) * dt, 0, masaS + i * 2);
    }

    // Kamera kejar: belakang dan atas, melihat ke hadapan.
    const [kamBelakang, kamAtas, kamHadapan] = this.palet.kamera;
    titikTrek(p.jarakM - kamBelakang, p.offsetM * 0.7, this.v1, kamAtas - pecahanLaju * 0.5);
    titikTrek(p.jarakM + kamHadapan, p.offsetM * 0.85, this.v2, 1.0);
    if (this.kamPos.lengthSq() === 0) {
      this.kamPos.copy(this.v1);
      this.kamSasar.copy(this.v2);
    }
    const lic = Math.min(1, dt * 7);
    this.kamPos.lerp(this.v1, lic);
    this.kamSasar.lerp(this.v2, Math.min(1, dt * 9));
    this.kamera.position.copy(this.kamPos);
    if (p.diLuarJalan || p.kelajuan > 200) {
      const g = p.diLuarJalan ? 0.06 : 0.02 * pecahanLaju;
      this.kamera.position.x += (Math.random() - 0.5) * g;
      this.kamera.position.y += (Math.random() - 0.5) * g;
    }
    this.kamera.lookAt(this.kamSasar);
    const fov = 60 + pecahanLaju * 16;
    if (Math.abs(this.kamera.fov - fov) > 0.05) {
      this.kamera.fov += (fov - this.kamera.fov) * Math.min(1, dt * 3);
      this.kamera.updateProjectionMatrix();
    }

    // Langit dan matahari mengikut pemain.
    this.langit.position.set(this.kamera.position.x, 0, this.kamera.position.z);
    const pk = this.pemain.kumpulan.position;
    this.matahari.position.set(pk.x + 30, pk.y + 55, pk.z + 18);
    this.matahari.target.position.copy(pk);

    // Garis laju.
    const mat = this.garisLaju.material as LineBasicMaterial;
    mat.opacity = Math.max(0, Math.min(0.5, (p.kelajuan - 150) / 160));
    this.garisLaju.visible = mat.opacity > 0.01;
    if (this.garisLaju.visible) {
      const panjang = 1 + pecahanLaju * 5;
      for (let i = 0; i < this.garisData.length; i++) {
        const g = this.garisData[i];
        g.z += ms * dt * 1.4;
        if (g.z > -3) g.z -= 62;
        this.garisPos.set([g.x, g.y, g.z, g.x, g.y, g.z - panjang], i * 6);
      }
      (this.garisLaju.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
    }

    // Asap penalti (kelabu) atau debu luar jalan (perang).
    if (p.penalti || (p.diLuarJalan && p.kelajuan > 15)) {
      if (Math.random() < 0.6) {
        titikTrek(p.jarakM - 2.3, p.offsetM, this.v1, 0.5);
        this.semburZarah(this.v1, p.penalti ? 0x9ca3af : this.palet.debu, ms);
      }
    }
    for (const z of this.zarah) {
      if (!z.sprite.visible) continue;
      z.umur += dt;
      if (z.umur >= z.hayat) {
        z.sprite.visible = false;
        continue;
      }
      const f = z.umur / z.hayat;
      z.sprite.position.addScaledVector(z.vel, dt);
      const s = 0.8 + f * 2.6;
      z.sprite.scale.set(s, s, 1);
      (z.sprite.material as SpriteMaterial).opacity = 0.55 * (1 - f);
    }

    // Tanda soal terapung di hadapan.
    this.tandaSoal.visible = p.soalanAktif;
    if (p.soalanAktif) {
      titikTrek(p.jarakM + 22, 0, this.tandaSoal.position, 4.2 + Math.sin(masaS * 3) * 0.35);
      const s = 3.2 + Math.sin(masaS * 5) * 0.2;
      this.tandaSoal.scale.set(s, s, 1);
    }

    this.renderer.render(this.scene, this.kamera);
  }

  /** Lepaskan semua sumber GPU. */
  buang(): void {
    this.sedia = false;
    const tekstur = new Set<Texture>();
    this.scene.traverse((o) => {
      const m = o as Mesh;
      if (m.geometry) m.geometry.dispose();
      const bahan = (m as { material?: Material | Material[] }).material;
      const senarai = Array.isArray(bahan) ? bahan : bahan ? [bahan] : [];
      for (const b of senarai) {
        const peta = (b as { map?: Texture | null }).map;
        if (peta) tekstur.add(peta);
        b.dispose();
      }
    });
    tekstur.forEach((t) => t.dispose());
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
