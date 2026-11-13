import { count, eachCell } from './geometry';
import type { State } from './types';

/** Remission quality: calm months, a surviving colony, and a colony that kept all three capsule types. */
export function score(s: State): { total: number; calm: number; size: number; mix: number } {
  const peaks = s.history.map((h) => h.peak);
  if (s.phase === 'wave' && s.status === 'run') peaks.push(s.cyc.peak);
  const calm = Math.round(peaks.reduce((a, p) => a + Math.max(0, 100 - p * 100), 0));
  const n = count(s), by = [0, 0, 0];
  eachCell(s, (c) => { by[c.c]++; });
  const size = Math.round(n / 5), mix = n ? Math.round((Math.min(...by) / n) * 600) : 0;
  return { total: calm + size + mix, calm, size, mix };
}
