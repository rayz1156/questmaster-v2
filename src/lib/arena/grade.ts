// Penggred jawapan Arena (sisi pelayan sahaja). Semua-atau-tiada.
import type {
  AnswerRevealMode,
  ArenaAnswer,
  ArenaQuestion,
  ArenaReveal,
  EssayData,
  GradeResult,
  MatchData,
  MultipleData,
  OrderData,
  OxData,
  SubjectiveData,
} from '@/lib/arena/types';

function normText(s: string, ignoreCase: boolean, ignoreSpaces: boolean): string {
  let t = String(s ?? '').normalize('NFC').trim();
  if (ignoreCase) t = t.toLowerCase();
  if (ignoreSpaces) t = t.replace(/\s+/g, '');
  return t;
}

function isCorrectAnswer(q: ArenaQuestion, a: ArenaAnswer): boolean {
  if (!a || a.type !== q.type) return false;
  switch (a.type) {
    case 'multiple': {
      const d = q.data as MultipleData;
      const correct = new Set((d.choiceList ?? []).filter((c) => c.isAnswer).map((c) => c.key));
      const keys = Array.isArray(a.keys) ? a.keys.map(String) : [];
      const picked = new Set(keys);
      if (picked.size !== correct.size || picked.size === 0) return false;
      return keys.every((k) => correct.has(k));
    }
    case 'subjective': {
      const d = q.data as SubjectiveData;
      const ic = d.ignoreCase !== false;
      const is = d.ignoreSpaces === true;
      const given = normText(typeof a.text === 'string' ? a.text : '', ic, is);
      if (!given) return false;
      return (d.answerList ?? []).some((x) => normText(x.text, ic, is) === given);
    }
    case 'ox': {
      const d = q.data as OxData;
      return a.value === d.answer;
    }
    case 'essay':
      return false;
    case 'match': {
      const d = q.data as MatchData;
      const pairs = Array.isArray(a.pairs) ? a.pairs : [];
      const given = new Map<string, string>();
      for (const p of pairs) {
        if (!p || typeof p.left !== 'string' || typeof p.right !== 'string') return false;
        if (given.has(p.left)) return false;
        given.set(p.left, p.right);
      }
      const key = d.answerPairs ?? [];
      if (key.length === 0 || given.size !== key.length) return false;
      return key.every((p) => given.get(p.left) === p.right);
    }
    case 'order': {
      const d = q.data as OrderData;
      const want = (d.items ?? []).map((x) => x.key);
      const keys = Array.isArray(a.keys) ? a.keys.map(String) : [];
      return want.length > 0 && keys.length === want.length && want.every((k, i) => keys[i] === k);
    }
  }
}

export function gradeAnswer(q: ArenaQuestion, a: ArenaAnswer, opts?: { elapsedMs?: number; speedBonus?: boolean }): GradeResult {
  // esei: tunggu gred pendidik
  if (q.type === 'essay' && a && a.type === 'essay') return { isCorrect: null, score: 0, pending: true };
  const ok = isCorrectAnswer(q, a);
  if (!ok) return { isCorrect: false, score: 0, pending: false };
  const points = Number(q.points) || 0;
  let score = points;
  if (opts?.speedBonus) {
    const limitMs = Math.max(1, (Number(q.time_limit_sec) || 30) * 1000);
    const el = Math.max(0, Number(opts.elapsedMs) || 0);
    score = Math.round(points * (0.5 + 0.5 * Math.max(0, 1 - el / limitMs)));
  }
  return { isCorrect: true, score, pending: false };
}

export function revealFor(q: ArenaQuestion): ArenaReveal {
  switch (q.type) {
    case 'multiple':
      return { type: 'multiple', keys: ((q.data as MultipleData).choiceList ?? []).filter((c) => c.isAnswer).map((c) => c.key) };
    case 'subjective':
      return { type: 'subjective', texts: ((q.data as SubjectiveData).answerList ?? []).map((x) => x.text) };
    case 'ox':
      return { type: 'ox', value: (q.data as OxData).answer };
    case 'essay':
      void (q.data as EssayData);
      return { type: 'essay' };
    case 'match':
      return { type: 'match', pairs: ((q.data as MatchData).answerPairs ?? []).map((p) => ({ left: p.left, right: p.right })) };
    case 'order':
      return { type: 'order', keys: ((q.data as OrderData).items ?? []).map((x) => x.key) };
  }
}

export function shouldReveal(mode: AnswerRevealMode, isCorrect: boolean | null): boolean {
  if (mode === 'always') return true;
  if (mode === 'incorrect_only') return isCorrect === false;
  return false;
}
