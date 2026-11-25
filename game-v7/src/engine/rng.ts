import type { State } from './types';

/** mulberry32 on a uint32 stored in the state, so a run is fully JSON-serialisable. */
function next(v: number): [number, number] {
  const nv = (v + 0x6d2b79f5) >>> 0;
  let t = nv;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [nv, ((t ^ (t >>> 14)) >>> 0) / 4294967296];
}
/** Biology: growth, colour switches, infection, immune hits. Responds to how you play. */
export function rand(s: State): number { const [v, x] = next(s.rng); s.rng = v; return x; }
/** The world: starting colony, cards offered, phage volleys, flares and antibiotic sweeps.
 *  Each world event always takes the same number of draws, so on a given seed every player faces the same world. */
export function wrand(s: State): number { const [v, x] = next(s.wrng); s.wrng = v; return x; }
export const randRange = (s: State, a: number, b: number) => a + (b - a) * rand(s);
export const wrandRange = (s: State, a: number, b: number) => a + (b - a) * wrand(s);
/** Seed of the biology stream, derived from the run's seed. */
export const bioSeed = (seed: number) => (Math.imul((seed >>> 0) ^ 0x9e3779b9, 0x85ebca6b) ^ 0x2545f491) >>> 0;
