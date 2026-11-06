// Soalan selamat untuk peserta (tanpa kunci jawapan) + utiliti kod/token/kehadiran.
import { randomBytes, randomInt } from 'crypto';
import {
  PRESENCE_AWAY_MS,
  PRESENCE_ONLINE_MS,
  type ArenaQuestion,
  type EssayData,
  type MatchData,
  type MultipleData,
  type OrderData,
  type PresenceStatus,
  type PublicQuestion,
} from '@/lib/arena/types';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function mulberry32(a: number): () => number {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// kocok berbenih (deterministik)
function seededShuffle<T>(arr: T[], seed: string): T[] {
  const out = arr.slice();
  const rnd = mulberry32(hashStr(seed));
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function toPublicQuestion(q: ArenaQuestion, seed: string): PublicQuestion {
  const base: PublicQuestion = {
    id: q.id,
    order_idx: q.order_idx,
    type: q.type,
    prompt: q.prompt,
    hint: q.hint ?? null,
    points: q.points,
    time_limit_sec: q.time_limit_sec,
  };
  switch (q.type) {
    case 'multiple': {
      const list = (q.data as MultipleData).choiceList ?? [];
      base.options = list.map((c) => (c.imageUrl ? { key: c.key, text: c.text, imageUrl: c.imageUrl } : { key: c.key, text: c.text }));
      base.multiSelect = list.filter((c) => c.isAnswer).length > 1;
      break;
    }
    case 'essay':
      base.maxLength = Math.min((q.data as EssayData).maxLength ?? 1000, 1000);
      break;
    case 'match': {
      const d = q.data as MatchData;
      base.left = (d.leftItems ?? []).map((x) => ({ key: x.key, text: x.text }));
      base.right = seededShuffle((d.rightItems ?? []).map((x) => ({ key: x.key, text: x.text })), `${seed}:${q.id}:r`);
      break;
    }
    case 'order': {
      const orig = ((q.data as OrderData).items ?? []).map((x) => ({ key: x.key, text: x.text }));
      let sh = orig;
      // cuba elak turutan yang sudah betul
      for (let t = 0; t < 6; t++) {
        sh = seededShuffle(orig, `${seed}:${q.id}:o${t}`);
        if (orig.length < 2 || sh.some((x, i) => x.key !== orig[i].key)) break;
      }
      if (orig.length >= 2 && sh.every((x, i) => x.key === orig[i].key)) sh = [...orig.slice(1), orig[0]];
      base.items = sh;
      break;
    }
    default:
      break;
  }
  return base;
}

export function makeSessionCode(): string {
  let s = '';
  for (let i = 0; i < 6; i++) s += CODE_CHARS[randomInt(0, CODE_CHARS.length)];
  return s;
}

export function makePlayerToken(): string {
  return randomBytes(24).toString('hex');
}

export function presenceOf(lastSeenIso: string, nowMs: number = Date.now()): PresenceStatus {
  const t = Date.parse(lastSeenIso);
  if (!Number.isFinite(t)) return 'offline';
  const age = nowMs - t;
  if (age < PRESENCE_ONLINE_MS) return 'online';
  if (age < PRESENCE_AWAY_MS) return 'away';
  return 'offline';
}
