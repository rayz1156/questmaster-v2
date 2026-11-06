// Pengesahan input soalan & tetapan set Arena (sisi pelayan).
import {
  ARENA_QTYPES,
  DEFAULT_SET_SETTINGS,
  type ArenaHint,
  type ChoiceItem,
  type ArenaQType,
  type ArenaQuestionData,
  type ArenaQuestionInput,
  type ArenaSetSettings,
  type QuestionOrigin,
} from '@/lib/arena/types';

type Res<T> = { ok: true; value: T } | { ok: false; error: string };
type Obj = Record<string, unknown>;

const ORIGINS: QuestionOrigin[] = ['ai', 'manual', 'duplicate', 'similar'];

function isObj(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '';
}
function intIn(v: unknown, min: number, max: number, def: number): number | null {
  if (v === undefined || v === null || v === '') return def;
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return null;
  const r = Math.round(n);
  return r < min || r > max ? null : r;
}
// kunci auto: a, b, c ... atau L1/R1
function autoKey(prefix: string, i: number): string {
  return prefix ? `${prefix}${i + 1}` : String.fromCharCode(97 + i);
}
function items(raw: unknown, prefix: string, label: string, min: number, max: number, maxLen: number): Res<{ key: string; text: string }[]> {
  if (!Array.isArray(raw)) return { ok: false, error: `${label} must be an array` };
  if (raw.length < min || raw.length > max) return { ok: false, error: `${label} needs ${min}-${max} items` };
  const out: { key: string; text: string }[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < raw.length; i++) {
    const it = raw[i];
    const o: Obj = isObj(it) ? it : { text: it };
    const text = str(o.text);
    if (!text) return { ok: false, error: `${label}[${i}] text is required` };
    if (text.length > maxLen) return { ok: false, error: `${label}[${i}] text exceeds ${maxLen} characters` };
    let key = str(o.key) || autoKey(prefix, i);
    if (seen.has(key)) key = `${autoKey(prefix, i)}_${i}`;
    if (seen.has(key)) return { ok: false, error: `${label}[${i}] duplicate key` };
    seen.add(key);
    out.push({ key, text });
  }
  return { ok: true, value: out };
}

function validateData(type: ArenaQType, raw: unknown): Res<ArenaQuestionData> {
  const d: Obj = isObj(raw) ? raw : {};
  switch (type) {
    case 'multiple': {
      const list = d.choiceList;
      if (!Array.isArray(list) || list.length < 2 || list.length > 6) return { ok: false, error: 'multiple needs 2-6 choices' };
      const seen = new Set<string>();
      const choiceList: ChoiceItem[] = [];
      for (let i = 0; i < list.length; i++) {
        const c: Obj = isObj(list[i]) ? (list[i] as Obj) : {};
        const text = str(c.text);
        const imageUrl = str(c.imageUrl);
        if (!text && !imageUrl) return { ok: false, error: `choice ${i} text is required` };
        if (text.length > 200) return { ok: false, error: `choice ${i} text exceeds 200 characters` };
        let key = str(c.key) || autoKey('', i);
        if (seen.has(key)) key = `${autoKey('', i)}_${i}`;
        seen.add(key);
        choiceList.push({ key, text, isAnswer: c.isAnswer === true, ...(imageUrl ? { imageUrl } : {}) });
      }
      if (!choiceList.some((c) => c.isAnswer)) return { ok: false, error: 'multiple needs at least one correct choice' };
      return { ok: true, value: { choiceList } };
    }
    case 'subjective': {
      const raw2 = Array.isArray(d.answerList) ? d.answerList : [];
      const answerList = raw2
        .map((a, i) => {
          const o: Obj = isObj(a) ? a : { text: a };
          return { key: str(o.key) || autoKey('', i), text: str(o.text) };
        })
        .filter((a) => a.text.length > 0 && a.text.length <= 200);
      if (answerList.length < 1) return { ok: false, error: 'subjective needs at least one answer text' };
      return {
        ok: true,
        value: {
          answerList,
          ...(typeof d.ignoreSpaces === 'boolean' ? { ignoreSpaces: d.ignoreSpaces } : {}),
          ...(typeof d.ignoreCase === 'boolean' ? { ignoreCase: d.ignoreCase } : {}),
        },
      };
    }
    case 'ox': {
      const a = str(d.answer).toLowerCase();
      if (a !== 'o' && a !== 'x') return { ok: false, error: "ox answer must be 'o' or 'x'" };
      return { ok: true, value: { answer: a } };
    }
    case 'essay': {
      const rubric = str(d.rubric).slice(0, 2000);
      const ml = intIn(d.maxLength, 1, 100000, 1000);
      const maxLength = Math.min(ml ?? 1000, 1000);
      return { ok: true, value: { ...(rubric ? { rubric } : {}), maxLength } };
    }
    case 'match': {
      const l = items(d.leftItems, 'L', 'leftItems', 2, 5, 50);
      if (!l.ok) return l;
      const r = items(d.rightItems, 'R', 'rightItems', 2, 5, 50);
      if (!r.ok) return r;
      const lk = new Set(l.value.map((x) => x.key));
      const rk = new Set(r.value.map((x) => x.key));
      if (!Array.isArray(d.answerPairs)) return { ok: false, error: 'answerPairs must be an array' };
      const pairs: { left: string; right: string }[] = [];
      const used = new Set<string>();
      for (let i = 0; i < d.answerPairs.length; i++) {
        const p: Obj = isObj(d.answerPairs[i]) ? (d.answerPairs[i] as Obj) : {};
        const left = str(p.left);
        const right = str(p.right);
        if (!lk.has(left) || !rk.has(right)) return { ok: false, error: `answerPairs[${i}] references unknown key` };
        if (used.has(left)) return { ok: false, error: `answerPairs[${i}] left item used twice` };
        used.add(left);
        pairs.push({ left, right });
      }
      if (used.size !== lk.size) return { ok: false, error: 'answerPairs must cover every left item exactly once' };
      return { ok: true, value: { leftItems: l.value, rightItems: r.value, answerPairs: pairs } };
    }
    case 'order': {
      const it = items(d.items, '', 'items', 2, 5, 50);
      if (!it.ok) return it;
      return { ok: true, value: { items: it.value } };
    }
  }
}

function validateHint(raw: unknown): Res<ArenaHint | null> {
  if (raw === undefined || raw === null) return { ok: true, value: null };
  if (!isObj(raw)) return { ok: false, error: 'hint must be an object' };
  const type = str(raw.type);
  const value = str(raw.value);
  if (!value) return { ok: true, value: null };
  if (type !== 'text' && type !== 'image' && type !== 'youtube') return { ok: false, error: 'hint type must be text, image or youtube' };
  if (value.length > 1000) return { ok: false, error: 'hint value too long' };
  return { ok: true, value: { type, value } };
}

export function validateQuestion(input: unknown): { ok: true; value: ArenaQuestionInput } | { ok: false; error: string } {
  if (!isObj(input)) return { ok: false, error: 'Question must be an object' };
  const type = str(input.type) as ArenaQType;
  if (!(ARENA_QTYPES as readonly string[]).includes(type)) return { ok: false, error: 'Invalid question type' };
  const prompt = str(input.prompt);
  if (prompt.length < 1 || prompt.length > 300) return { ok: false, error: 'prompt must be 1-300 characters' };
  const data = validateData(type, input.data);
  if (!data.ok) return data;
  const hint = validateHint(input.hint);
  if (!hint.ok) return hint;
  const points = intIn(input.points, 1, 10000, 100);
  if (points === null) return { ok: false, error: 'points must be 1-10000' };
  const tl = intIn(input.time_limit_sec, 5, 600, 30);
  if (tl === null) return { ok: false, error: 'time_limit_sec must be 5-600' };
  const originRaw = str(input.origin) as QuestionOrigin;
  const origin: QuestionOrigin = ORIGINS.includes(originRaw) ? originRaw : 'manual';
  const value: ArenaQuestionInput = { type, prompt, data: data.value, hint: hint.value, points, time_limit_sec: tl, origin };
  const oi = input.order_idx;
  if (typeof oi === 'number' && Number.isFinite(oi)) value.order_idx = Math.max(0, Math.round(oi));
  return { ok: true, value };
}

export function normalizeSettings(input: unknown): ArenaSetSettings {
  const out: ArenaSetSettings = { ...DEFAULT_SET_SETTINGS };
  if (!isObj(input)) return out;
  if (typeof input.allowPass === 'boolean') out.allowPass = input.allowPass;
  if (input.answerRevealMode === 'never' || input.answerRevealMode === 'incorrect_only' || input.answerRevealMode === 'always') {
    out.answerRevealMode = input.answerRevealMode;
  }
  if (typeof input.shuffleQuestions === 'boolean') out.shuffleQuestions = input.shuffleQuestions;
  if (typeof input.showRanking === 'boolean') out.showRanking = input.showRanking;
  const pct = typeof input.coopTargetPct === 'number' ? Math.round(input.coopTargetPct) : NaN;
  if (Number.isFinite(pct) && pct >= 1 && pct <= 100) out.coopTargetPct = pct;
  return out;
}
