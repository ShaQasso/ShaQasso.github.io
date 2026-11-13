import { count, eachCell } from './geometry';
import balance from '../data/balance.json';
import type { State } from './types';

const B = balance;

/** Remission quality: calm months, a surviving colony, and a colony that kept all three capsule types. */
export function score(s: State): { total: number; calm: number; size: number; mix: number } {
  // each month scores its calm; a calm month on a streak counts more
  const months = s.history.map((h) => ({ peak: h.peak, streak: h.streak ?? 0 }));
  if (s.phase === 'wave' && s.status === 'run') months.push({ peak: s.cyc.peak, streak: 0 });
  const calm = Math.round(months.reduce((a, m) => a + Math.max(0, 100 - m.peak * 100) * (1 + B.heal.streakScore * Math.max(0, m.streak - 1)), 0));
  const n = count(s), by = [0, 0, 0];
  eachCell(s, (c) => { by[c.c]++; });
  const size = Math.round(n / 5), mix = n ? Math.round((Math.min(...by) / n) * 600) : 0;
  return { total: calm + size + mix, calm, size, mix };
}
