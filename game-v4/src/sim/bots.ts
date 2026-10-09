import { TAU, angDiff, eachCell, idx, wrap, worldAngle } from '../engine/geometry';
import { activeFlares, activeVolleys, depthMap, secrete, secreteReady, setRotation, surfaceStats, warnings } from '../engine/sim';
import type { State } from '../engine/types';

export type Bot = (s: State) => void;
const clamp = (v: number) => Math.max(-1, Math.min(1, v));

function threat(s: State) {
  const act = activeVolleys(s);
  const pool = act.length ? act : warnings(s).volleys;
  if (!pool.length) return null;
  const v = pool.reduce((a, b) => (b.rate > a.rate ? b : a));
  const t = Math.max(s.t, v.t0);
  return { angle: wrap(v.angle + v.drift * (t - v.t0)), half: v.half, mask: v.mask };
}

/** Cost of facing the threat with the blob at rotation `theta`: matching blocks in the outer layers inside the arc. */
function exposureCost(s: State, th: { angle: number; half: number; mask: number }, theta: number, depth: Map<number, number>): number {
  let cost = 0;
  eachCell(s, (c, i, j) => {
    if (!(th.mask & (1 << c.c))) return;
    const d = depth.get(idx(i, j)) ?? 9;
    if (d > 2) return;
    if (Math.abs(angDiff(th.angle, wrap(Math.atan2(j, i) + theta))) <= th.half) cost += d === 0 ? 1 : d === 1 ? 0.5 : 0.25;
  });
  return cost;
}

function rotateTo(s: State, target: number) {
  setRotation(s, clamp(angDiff(s.theta, target) * 3 - s.omega * 0.9));
}

function dodgeSteer(s: State): void {
  const th = threat(s);
  if (!th) { setRotation(s, clamp(-s.omega * 0.9)); return; }
  const depth = depthMap(s);
  let best = s.theta, bestScore = Infinity;
  for (let k = 0; k < 72; k++) {
    const cand = (k / 72) * TAU;
    const score = exposureCost(s, th, cand, depth) + 0.15 * Math.abs(angDiff(s.theta, cand));
    if (score < bestScore) { bestScore = score; best = cand; }
  }
  const stay = exposureCost(s, th, s.theta, depth);
  if (stay - bestScore < 0.8) { setRotation(s, clamp(-s.omega * 0.9)); return; } // hysteresis: don't churn
  rotateTo(s, best);
}

export const idleBot: Bot = () => {};

export const spinBot: Bot = (s) => {
  if (Math.floor(s.t * 20) % 40 === 0) setRotation(s, Math.random() * 2 - 1);
};

export const dodgeBot: Bot = (s) => dodgeSteer(s);

/** Dodge plus a sensible use of Space: shield before a hard hit or an antibiotic, cool when the wall is hot. */
export const secreterBot: Bot = (s) => {
  dodgeSteer(s);
  if (!secreteReady(s)) return;
  const w = warnings(s);
  const th = threat(s);
  const st = surfaceStats(s);
  const incoming = s.phages.length >= 2 && th !== null && th.mask !== 0;
  const abxSoon = w.abx.some((a) => a.t0 - s.t < 1.5);
  const matching = th ? [0, 1, 2].reduce((a, c) => a + ((th.mask & (1 << c)) ? st.share[c] : 0), 0) : 0;
  const hot = s.inflammation >= 0.55 || activeFlares(s).length > 0 && s.inflammation >= 0.48;
  if (abxSoon || hot || (incoming && matching >= 0.4)) secrete(s);
};

/** Always opens with the shield as soon as it is ready (a naive "mucus spam" strategy). */
export const spamBot: Bot = (s) => {
  dodgeSteer(s);
  secrete(s);
};

export const BOTS: Record<string, Bot> = { idle: idleBot, spin: spinBot, dodge: dodgeBot, secreter: secreterBot, spam: spamBot };
void worldAngle;
