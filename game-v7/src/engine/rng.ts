import type { State } from './types';

/** mulberry32 on a uint32 stored in the state, so a run is fully JSON-serialisable. */
export function rand(s: State): number {
  s.rng = (s.rng + 0x6d2b79f5) >>> 0;
  let t = s.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export const randRange = (s: State, a: number, b: number) => a + (b - a) * rand(s);
