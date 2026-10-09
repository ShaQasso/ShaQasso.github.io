import { angDiff, TAU, wrap } from '../engine/geometry';
import { activeWaves, chooseMeal, coatOf, setRotation, warnings } from '../engine/sim';
import { mixAt } from '../engine/director';
import type { Shape, State } from '../engine/types';

export type Bot = (s: State) => void;

/** The most pressing threat: highest-rate active (or about to start) wave, with its dominant shape. */
function threat(s: State): { center: number; half: number; shape: Shape } | null {
  const act = activeWaves(s);
  const pool = act.length ? act : warnings(s).waves;
  if (!pool.length) return null;
  const w = pool.reduce((a, b) => (b.rate > a.rate ? b : a));
  const t = Math.max(s.t, w.t0);
  const mix = mixAt(w, t);
  const shape = (Object.keys(mix) as Shape[]).reduce((a, b) => (mix[b] > mix[a] ? b : a));
  return { center: wrap(w.center + w.drift * (t - w.t0)), half: w.half, shape };
}

function pickMeal(s: State) {
  if (s.offer) chooseMeal(s, 0);
}

function steer(s: State, ring: number, cost: (off: number) => number) {
  const r = s.rings[ring];
  if (r.n === 1) return;
  const stepA = TAU / r.n;
  let best = 0, bestScore = Infinity;
  for (let m = 0; m < r.n; m++) {
    const off = r.off + m * stepA;
    const travel = Math.abs(angDiff(r.off, off));
    const score = cost(off) + 0.3 * travel;
    if (score < bestScore) { bestScore = score; best = m; }
  }
  const err = angDiff(r.off, r.off + best * stepA);
  // simple PD controller on a ring with momentum
  setRotation(s, ring, Math.max(-1, Math.min(1, err * 3 - r.omega * 0.8)));
}

function inArc(angle: number, c: number, half: number) {
  return Math.abs(angDiff(c, angle)) <= half;
}

function cellsInArc(s: State, ring: number, off: number, th: { center: number; half: number; shape: Shape }) {
  const r = s.rings[ring];
  let match = 0, other = 0;
  r.cells.forEach((c, i) => {
    if (!c) return;
    const ang = wrap(off + (i + 0.5) * (TAU / r.n));
    if (!inArc(ang, th.center, th.half)) return;
    if (coatOf(c).shape === th.shape) match++; else other++;
  });
  return { match, other };
}

export const idleBot: Bot = (s) => pickMeal(s);

export const spinBot: Bot = (s) => {
  pickMeal(s);
  if (Math.floor(s.t * 20) % 40 === 0) s.rings.forEach((_, k) => setRotation(s, k, Math.random() * 2 - 1));
};

/** Dodge: keep cells that match the incoming shape out of the wave's arc, on every ring. */
export const dodgeBot: Bot = (s) => {
  pickMeal(s);
  const th = threat(s);
  if (!th) { s.rings.forEach((_, k) => setRotation(s, k, 0)); return; }
  s.rings.forEach((_, k) => steer(s, k, (off) => cellsInArc(s, k, off, th).match));
};

/** Sponge: a couple of matching cells on the rim soak the stream; every inner ring dodges. */
export const spongeBot: Bot = (s) => {
  pickMeal(s);
  const th = threat(s);
  if (!th) { s.rings.forEach((_, k) => setRotation(s, k, 0)); return; }
  const rim = s.rings.length - 1;
  s.rings.forEach((_, k) => {
    if (k === rim) steer(s, k, (off) => { const c = cellsInArc(s, k, off, th); return -Math.min(c.match, 2) + 0.5 * Math.max(0, c.match - 2); });
    else steer(s, k, (off) => cellsInArc(s, k, off, th).match);
  });
};

export const BOTS: Record<string, Bot> = { idle: idleBot, spin: spinBot, dodge: dodgeBot, sponge: spongeBot };
