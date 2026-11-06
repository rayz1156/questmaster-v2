'use client';

import { useEffect, useRef } from 'react';
import type { ArenaMapProps } from '@/lib/arena/types';
import { getMap, isWalkable, questionSpotPixel, spawnPoint, tileAt, type ArenaMapDef } from '@/lib/arena/maps';

// Enjin peta Canvas 2D: semua dilukis secara prosedur (tiada aset).

const PALETTE = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899'];
const SPEED = 150; // piksel/saat
const RADIUS = 10; // jejari perlanggaran
const TOUCH_IN = 0.75; // jubin
const TOUCH_OUT = 1.2; // jubin
const MOVE_MS = 250; // <= 4 panggilan onMove sesaat

type Dir = 'up' | 'down' | 'left' | 'right';

interface Ghost {
  x: number;
  y: number;
  fx: number;
  fy: number;
}

interface EngineState {
  ready: boolean;
  meId: string | null;
  x: number;
  y: number;
  fx: number;
  fy: number;
  lastSentX: number;
  lastSentY: number;
  lastSentAt: number;
  resetSeq: number;
  touchedId: string | null;
  keys: Set<string>;
  pad: Record<Dir, boolean>;
  others: Map<string, Ghost>;
  cssW: number;
  cssH: number;
  dpr: number;
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function colorOf(avatar: number): string {
  const i = ((Math.floor(avatar) % PALETTE.length) + PALETTE.length) % PALETTE.length;
  return PALETTE[i] ?? '#3b82f6';
}

/** Kotak avatar (4 bucu) mesti atas jubin boleh dipijak. */
function canStand(map: ArenaMapDef, x: number, y: number): boolean {
  return (
    isWalkable(map, x - RADIUS, y - RADIUS) &&
    isWalkable(map, x + RADIUS, y - RADIUS) &&
    isWalkable(map, x - RADIUS, y + RADIUS) &&
    isWalkable(map, x + RADIUS, y + RADIUS)
  );
}

function isEditable(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  const tag = t.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable;
}

function keyName(e: KeyboardEvent): string {
  // autofill Chrome boleh hantar keydown tanpa key
  return typeof e.key === 'string' ? e.key.toLowerCase() : '';
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Nombor pseudo-rawak tetap bagi jubin (untuk corak). */
function rnd(tx: number, ty: number, k: number): number {
  const v = Math.sin(tx * 12.9898 + ty * 78.233 + k * 37.719) * 43758.5453;
  return v - Math.floor(v);
}

function drawTile(ctx: CanvasRenderingContext2D, map: ArenaMapDef, ch: string, tx: number, ty: number, t: number): void {
  const s = map.tileSize;
  const x = tx * s;
  const y = ty * s;
  const sandy = map.id === 'pulau';
  const grass = (): void => {
    ctx.fillStyle = (tx + ty) % 2 === 0 ? '#7cc46a' : '#76bd64';
    ctx.fillRect(x, y, s, s);
    ctx.fillStyle = '#5ea650';
    for (let k = 0; k < 3; k++) ctx.fillRect(x + 3 + rnd(tx, ty, k) * (s - 6), y + 3 + rnd(tx, ty, k + 5) * (s - 6), 2, 2);
  };
  switch (ch) {
    case '#': {
      ctx.fillStyle = sandy ? '#78716c' : '#64748b';
      ctx.fillRect(x, y, s, s);
      ctx.fillStyle = sandy ? '#a8a29e' : '#94a3b8';
      ctx.fillRect(x, y, s, 6);
      ctx.fillStyle = sandy ? '#57534e' : '#475569';
      ctx.fillRect(x, y + s - 5, s, 5);
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.fillRect(x + s / 2 - 1, y + 6, 2, s - 11);
      break;
    }
    case '.': {
      if (sandy) {
        ctx.fillStyle = '#f3dc9b';
        ctx.fillRect(x, y, s, s);
        ctx.fillStyle = '#e2c47c';
        for (let k = 0; k < 3; k++) ctx.fillRect(x + 3 + rnd(tx, ty, k) * (s - 6), y + 3 + rnd(tx, ty, k + 9) * (s - 6), 2, 2);
      } else {
        ctx.fillStyle = (tx + ty) % 2 === 0 ? '#e7e5e4' : '#d6d3d1';
        ctx.fillRect(x, y, s, s);
      }
      break;
    }
    case '~': {
      ctx.fillStyle = '#3b9ee0';
      ctx.fillRect(x, y, s, s);
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 1.5;
      for (let k = 0; k < 2; k++) {
        const off = Math.sin(t * 2 + tx * 0.8 + ty * 0.5 + k * 2) * 3;
        const yy = y + 10 + k * 13;
        ctx.beginPath();
        ctx.moveTo(x + 4 + off, yy);
        ctx.quadraticCurveTo(x + 10 + off, yy - 4, x + 16 + off, yy);
        ctx.stroke();
      }
      break;
    }
    case 'T': {
      grass();
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.beginPath();
      ctx.ellipse(x + s / 2, y + s - 5, 10, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#8b5a2b';
      ctx.fillRect(x + s / 2 - 3, y + s / 2 + 2, 6, s / 2 - 6);
      ctx.fillStyle = '#15803d';
      ctx.beginPath();
      ctx.arc(x + s / 2, y + s / 2 - 2, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#22c55e';
      ctx.beginPath();
      ctx.arc(x + s / 2 - 4, y + s / 2 - 6, 5, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case '=': {
      ctx.fillStyle = '#d9bf8f';
      ctx.fillRect(x, y, s, s);
      ctx.fillStyle = '#c4a574';
      ctx.fillRect(x + 4 + rnd(tx, ty, 1) * (s - 10), y + 4 + rnd(tx, ty, 2) * (s - 10), 3, 2);
      break;
    }
    case 'S': {
      ctx.fillStyle = '#d9bf8f';
      ctx.fillRect(x, y, s, s);
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x + s / 2, y + s / 2, 9, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    default:
      grass();
  }
}

function drawBox(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  num: number,
  kind: 'open' | 'done' | 'locked',
  t: number,
): void {
  if (kind === 'open') {
    const pulse = 0.25 + 0.2 * Math.sin(t * 4);
    ctx.fillStyle = `rgba(250,204,21,${pulse.toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(x, y, 19 + 3 * Math.sin(t * 4), 0, Math.PI * 2);
    ctx.fill();
  }
  const body = kind === 'open' ? '#f59e0b' : kind === 'done' ? '#9ca3af' : '#1f2937';
  const lid = kind === 'open' ? '#fbbf24' : kind === 'done' ? '#d1d5db' : '#374151';
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(x - 11, y + 9, 22, 3);
  ctx.fillStyle = body;
  rr(ctx, x - 12, y - 6, 24, 16, 3);
  ctx.fill();
  ctx.fillStyle = lid;
  rr(ctx, x - 13, y - 11, 26, 7, 3);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 1;
  rr(ctx, x - 12, y - 6, 24, 16, 3);
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (kind === 'done') {
    ctx.fillStyle = '#16a34a';
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.fillText('✓', x, y + 2);
  } else if (kind === 'locked') {
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 3.5, Math.PI, 0);
    ctx.stroke();
    ctx.fillStyle = '#e5e7eb';
    ctx.fillRect(x - 5, y, 10, 7);
  } else {
    ctx.fillStyle = '#7c2d12';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.fillText(String(num), x, y + 2);
  }
  // nombor kecil di atas peti
  ctx.fillStyle = 'rgba(15,23,42,0.75)';
  rr(ctx, x - 9, y - 26, 18, 13, 4);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 10px system-ui, sans-serif';
  ctx.fillText(String(num), x, y - 19);
}

function drawAvatar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  fx: number,
  fy: number,
  name: string,
  isMe: boolean,
  alpha: number,
): void {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(x, y + 11, 10, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = isMe ? '#facc15' : '#ffffff';
  ctx.lineWidth = isMe ? 3 : 2;
  ctx.stroke();
  for (const side of [-1, 1]) {
    const ex = x + side * 4.5 + fx * 2;
    const ey = y - 2 + fy * 2;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(ex, ey, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#111827';
    ctx.beginPath();
    ctx.arc(ex + fx * 1.2, ey + fy * 1.2, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
  const label = name.length > 14 ? `${name.slice(0, 13)}…` : name;
  ctx.font = '600 11px system-ui, sans-serif';
  const w = ctx.measureText(label).width + 10;
  ctx.fillStyle = isMe ? 'rgba(37,99,235,0.9)' : 'rgba(15,23,42,0.7)';
  rr(ctx, x - w / 2, y - 33, w, 16, 6);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x, y - 25);
  ctx.globalAlpha = 1;
}

export default function ArenaMap(props: ArenaMapProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const propsRef = useRef<ArenaMapProps>(props);
  const stRef = useRef<EngineState>({
    ready: false,
    meId: null,
    x: 0,
    y: 0,
    fx: 0,
    fy: 1,
    lastSentX: NaN,
    lastSentY: NaN,
    lastSentAt: 0,
    resetSeq: props.resetSeq,
    touchedId: null,
    keys: new Set<string>(),
    pad: { up: false, down: false, left: false, right: false },
    others: new Map<string, Ghost>(),
    cssW: 0,
    cssH: 0,
    dpr: 1,
  });

  // prop terkini untuk gelung RAF
  useEffect(() => {
    propsRef.current = props;
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const st = stRef.current;

    const resize = (): void => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      st.cssW = w;
      st.cssH = h;
      st.dpr = dpr;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
    };
    resize();
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => resize());
      ro.observe(wrap);
    } else {
      window.addEventListener('resize', resize);
    }

    const onKeyDown = (e: KeyboardEvent): void => {
      if (isEditable(e.target)) return;
      const k = keyName(e);
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'].includes(k)) {
        st.keys.add(k);
        if (k.startsWith('arrow')) e.preventDefault();
      }
    };
    const onKeyUp = (e: KeyboardEvent): void => {
      st.keys.delete(keyName(e));
    };
    const clearKeys = (): void => {
      st.keys.clear();
      st.pad.up = st.pad.down = st.pad.left = st.pad.right = false;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', clearKeys);
    document.addEventListener('visibilitychange', clearKeys);

    let raf = 0;
    let last = performance.now();

    const teleport = (map: ArenaMapDef, id: string): void => {
      const sp = spawnPoint(map, hashStr(id));
      st.x = sp.x;
      st.y = sp.y;
      st.lastSentX = NaN;
      st.lastSentY = NaN;
      st.touchedId = null;
    };

    const frame = (now: number): void => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      const t = now / 1000;
      const p = propsRef.current;
      const map = getMap(p.mapId);
      const ts = map.tileSize;
      const me = p.me;

      // mula / tukar pemain
      if (me && me.id !== st.meId) {
        st.meId = me.id;
        st.resetSeq = p.resetSeq;
        const fromServer = !(me.x === 0 && me.y === 0) && canStand(map, me.x, me.y);
        if (fromServer) {
          st.x = me.x;
          st.y = me.y;
          st.lastSentX = Math.round(me.x);
          st.lastSentY = Math.round(me.y);
          st.touchedId = null;
        } else {
          teleport(map, me.id);
        }
        st.ready = true;
      } else if (!me) {
        st.ready = false;
        st.meId = null;
      }

      // Start Together: kembali ke titik mula
      if (p.resetSeq !== st.resetSeq) {
        st.resetSeq = p.resetSeq;
        if (me) teleport(map, me.id);
      }
      if (st.ready && me && !canStand(map, st.x, st.y)) teleport(map, me.id);

      // gerakan
      if (st.ready && !p.frozen) {
        const k = st.keys;
        let dx = 0;
        let dy = 0;
        if (k.has('arrowleft') || k.has('a') || st.pad.left) dx -= 1;
        if (k.has('arrowright') || k.has('d') || st.pad.right) dx += 1;
        if (k.has('arrowup') || k.has('w') || st.pad.up) dy -= 1;
        if (k.has('arrowdown') || k.has('s') || st.pad.down) dy += 1;
        if (dx !== 0 || dy !== 0) {
          const len = Math.hypot(dx, dy);
          dx /= len;
          dy /= len;
          st.fx = dx;
          st.fy = dy;
          const step = SPEED * dt;
          const nx = st.x + dx * step;
          if (canStand(map, nx, st.y)) st.x = nx;
          const ny = st.y + dy * step;
          if (canStand(map, st.x, ny)) st.y = ny;
        }
        // hantar posisi (dihadkan)
        const rx = Math.round(st.x);
        const ry = Math.round(st.y);
        if (now - st.lastSentAt >= MOVE_MS && (rx !== st.lastSentX || ry !== st.lastSentY)) {
          st.lastSentAt = now;
          st.lastSentX = rx;
          st.lastSentY = ry;
          p.onMove(rx, ry);
        }
        // sentuh objek soalan
        if (st.touchedId) {
          const tq = p.questions.find((q) => q.id === st.touchedId);
          if (!tq) st.touchedId = null;
          else {
            const sp = questionSpotPixel(map, tq.order_idx);
            if (Math.hypot(sp.x - st.x, sp.y - st.y) > TOUCH_OUT * ts) st.touchedId = null;
          }
        }
        if (!st.touchedId) {
          for (const q of p.questions) {
            if (q.answered || q.locked) continue;
            const sp = questionSpotPixel(map, q.order_idx);
            if (Math.hypot(sp.x - st.x, sp.y - st.y) < TOUCH_IN * ts) {
              st.touchedId = q.id;
              p.onTouchQuestion(q.id);
              break;
            }
          }
        }
      }

      // pemain lain: interpolasi lancar
      const seen = new Set<string>();
      for (const pl of p.players) {
        if (me && pl.id === me.id) continue;
        seen.add(pl.id);
        const target = pl.x === 0 && pl.y === 0 ? spawnPoint(map, hashStr(pl.id)) : { x: pl.x, y: pl.y };
        const g = st.others.get(pl.id);
        if (!g) {
          st.others.set(pl.id, { x: target.x, y: target.y, fx: 0, fy: 1 });
          continue;
        }
        const ddx = target.x - g.x;
        const ddy = target.y - g.y;
        const dist = Math.hypot(ddx, ddy);
        if (dist > ts * 6) {
          g.x = target.x;
          g.y = target.y;
        } else if (dist > 0.5) {
          const a = Math.min(1, dt * 8);
          g.x += ddx * a;
          g.y += ddy * a;
          g.fx = ddx / dist;
          g.fy = ddy / dist;
        }
      }
      for (const id of Array.from(st.others.keys())) if (!seen.has(id)) st.others.delete(id);

      // ---------------------------------------------------------- lukis
      const vw = st.cssW;
      const vh = st.cssH;
      const dpr = st.dpr;
      const mapW = map.width * ts;
      const mapH = map.height * ts;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = map.id === 'pulau' ? '#2b7fc0' : '#0f172a';
      ctx.fillRect(0, 0, vw, vh);
      if (vw <= 0 || vh <= 0) return;

      const scale = st.ready ? 1 : Math.min(vw / mapW, vh / mapH);
      const viewW = vw / scale;
      const viewH = vh / scale;
      const focusX = st.ready ? st.x : mapW / 2;
      const focusY = st.ready ? st.y : mapH / 2;
      const camX = mapW <= viewW ? (mapW - viewW) / 2 : Math.min(Math.max(focusX - viewW / 2, 0), mapW - viewW);
      const camY = mapH <= viewH ? (mapH - viewH) / 2 : Math.min(Math.max(focusY - viewH / 2, 0), mapH - viewH);
      ctx.setTransform(dpr * scale, 0, 0, dpr * scale, -camX * dpr * scale, -camY * dpr * scale);

      const tx0 = Math.max(0, Math.floor(camX / ts));
      const ty0 = Math.max(0, Math.floor(camY / ts));
      const tx1 = Math.min(map.width - 1, Math.ceil((camX + viewW) / ts));
      const ty1 = Math.min(map.height - 1, Math.ceil((camY + viewH) / ts));
      for (let ty = ty0; ty <= ty1; ty++) {
        for (let tx = tx0; tx <= tx1; tx++) drawTile(ctx, map, tileAt(map, tx, ty), tx, ty, t);
      }

      for (const q of p.questions) {
        const sp = questionSpotPixel(map, q.order_idx);
        const kind = q.answered ? 'done' : q.locked ? 'locked' : 'open';
        drawBox(ctx, sp.x, sp.y, q.order_idx + 1, kind, t);
      }

      for (const pl of p.players) {
        if (me && pl.id === me.id) continue;
        const g = st.others.get(pl.id);
        if (!g) continue;
        const alpha = pl.presence === 'online' ? 1 : 0.4;
        drawAvatar(ctx, g.x, g.y, colorOf(pl.avatar), g.fx, g.fy, pl.nickname, false, alpha);
      }
      if (st.ready && me) drawAvatar(ctx, st.x, st.y, colorOf(me.avatar), st.fx, st.fy, me.nickname, true, 1);

      if (p.frozen) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = 'rgba(15,23,42,0.45)';
        ctx.fillRect(0, 0, vw, vh);
        ctx.fillStyle = '#e0f2fe';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold 48px system-ui, sans-serif';
        ctx.fillText('BEKU', vw / 2, vh / 2);
      }
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      if (ro) ro.disconnect();
      else window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', clearKeys);
      document.removeEventListener('visibilitychange', clearKeys);
    };
  }, []);

  const press = (dir: Dir, on: boolean): void => {
    stRef.current.pad[dir] = on;
  };

  return (
    <div ref={wrapRef} className="relative h-[70vh] min-h-[320px] w-full overflow-hidden rounded-2xl bg-slate-900 select-none">
      <canvas ref={canvasRef} className="block h-full w-full" />
      <div className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs font-medium text-white">
        Jalan ke peti soalan untuk menjawab
      </div>
      <div className="absolute bottom-3 left-3 grid grid-cols-3 grid-rows-3 gap-1 opacity-80">
        <PadButton dir="up" label="▲" title="Atas" onPress={press} className="col-start-2 row-start-1" />
        <PadButton dir="left" label="◀" title="Kiri" onPress={press} className="col-start-1 row-start-2" />
        <PadButton dir="right" label="▶" title="Kanan" onPress={press} className="col-start-3 row-start-2" />
        <PadButton dir="down" label="▼" title="Bawah" onPress={press} className="col-start-2 row-start-3" />
      </div>
    </div>
  );
}

function PadButton(props: {
  dir: Dir;
  label: string;
  title: string;
  className: string;
  onPress: (dir: Dir, on: boolean) => void;
}) {
  const { dir, label, title, className, onPress } = props;
  return (
    <button
      type="button"
      aria-label={title}
      className={`${className} flex h-12 w-12 touch-none items-center justify-center rounded-xl bg-white/85 text-lg text-slate-800 shadow active:bg-amber-300`}
      onPointerDown={(e) => {
        e.preventDefault();
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // abaikan
        }
        onPress(dir, true);
      }}
      onPointerUp={() => onPress(dir, false)}
      onPointerCancel={() => onPress(dir, false)}
      onLostPointerCapture={() => onPress(dir, false)}
      onContextMenu={(e) => e.preventDefault()}
    >
      {label}
    </button>
  );
}
