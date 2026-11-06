/**
 * Kuizen Arena: logik mod permainan (tulen, tiada akses pangkalan data).
 */
import type { ArenaMode } from './types';

/** Tentukan soalan yang boleh dijawab (available) dan yang dikunci (locked). */
export function questionAccess(args: {
  mode: ArenaMode;
  orderedIds: string[];
  answeredIds: Set<string>;
  currentIndex: number;
  allowPass: boolean;
}): { available: string[]; locked: string[] } {
  const { mode, orderedIds, answeredIds, currentIndex } = args;
  const unanswered = orderedIds.filter((id) => !answeredIds.has(id));

  if (mode === 'sequencing') {
    // hanya soalan pertama yang belum dijawab (pass dibuat melalui laluan jawapan)
    const first: string | undefined = unanswered[0];
    return { available: first ? [first] : [], locked: unanswered.slice(1) };
  }

  if (mode === 'round') {
    // hanya soalan semasa yang dipilih guru
    const cur: string | undefined =
      currentIndex >= 0 && currentIndex < orderedIds.length ? orderedIds[currentIndex] : undefined;
    const available = cur && !answeredIds.has(cur) ? [cur] : [];
    return { available, locked: unanswered.filter((id) => id !== cur) };
  }

  // freestyle / team / coop: semua yang belum dijawab terbuka
  return { available: unanswered, locked: [] };
}

/** Jumlah markah setiap pasukan 0..teamCount-1 (semua pasukan disenaraikan, termasuk 0). */
export function teamScores(
  players: { team: number | null; score: number }[],
  teamCount: number,
): { team: number; score: number }[] {
  const n = Math.max(0, Math.floor(Number(teamCount) || 0));
  const out = Array.from({ length: n }, (_, team) => ({ team, score: 0 }));
  for (const p of players) {
    if (p.team === null || !Number.isInteger(p.team) || p.team < 0 || p.team >= n) continue;
    const t = out[p.team];
    if (t) t.score += Number(p.score) || 0;
  }
  return out;
}

/** Kemajuan mod coop: sasaran = jumlah mata x bil. pemain x peratus sasaran. */
export function coopProgress(
  totalScore: number,
  totalPoints: number,
  playerCount: number,
  targetPct: number,
): { total: number; target: number } {
  return {
    total: totalScore,
    target: Math.round((totalPoints * playerCount * targetPct) / 100),
  };
}
