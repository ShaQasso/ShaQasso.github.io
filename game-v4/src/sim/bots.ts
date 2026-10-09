import { TAU, angDiff, cellAt, wrap } from '../engine/geometry';
import { COLOURS, secrete, secreteReady, setRotation, warnings } from '../engine/sim';
import type { State } from '../engine/types';

export type Bot = (s: State) => void;
const clamp = (v: number) => Math.max(-1, Math.min(1, v));

/** The first pixel an incoming particle would meet if the blob were turned to `theta`. */
function firstPixel(s: State, angle: number, r0: number, theta: number) {
  const psi = angle - theta;
  for (let rr = r0; rr > 0; rr -= 0.5) {
    const x = Math.round(rr * Math.cos(psi)), y = Math.round(rr * Math.sin(psi));
    const c = cellAt(s, x, y);
    if (c) return c;
  }
  return null;
}

/** Expected damage if the blob sat at `theta`: matching phages in flight, plus immune cells hitting non-evasive colours. */
function exposureCost(s: State, theta: number): number {
  let cost = 0;
  for (const p of s.phages) { const c = firstPixel(s, p.angle, p.r, theta); if (c && c.inf === 0 && (p.mask & (1 << c.c))) cost += 1; }
  for (const m of s.immune) { const c = firstPixel(s, m.angle, m.r, theta); if (c) cost += 0.3 * (1 - COLOURS[c.c].evade); }
  return cost;
}

function rotateTo(s: State, target: number) { setRotation(s, clamp(angDiff(s.theta, target) * 3 - s.omega * 0.9)); }

function dodgeSteer(s: State): void {
  if (!s.phages.length && !s.immune.length) { setRotation(s, clamp(-s.omega * 0.9)); return; }
  let best = s.theta, bestScore = Infinity;
  for (let k = 0; k < 72; k++) {
    const cand = (k / 72) * TAU;
    const score = exposureCost(s, cand) + 0.1 * Math.abs(angDiff(s.theta, cand));
    if (score < bestScore) { bestScore = score; best = cand; }
  }
  if (exposureCost(s, s.theta) - bestScore < 0.8) { setRotation(s, clamp(-s.omega * 0.9)); return; } // hysteresis: don't churn
  rotateTo(s, best);
}

export const idleBot: Bot = () => {};
export const spinBot: Bot = (s) => { if (Math.floor(s.t * 20) % 40 === 0) setRotation(s, Math.random() * 2 - 1); };
export const dodgeBot: Bot = (s) => dodgeSteer(s);

/** Dodge plus a sensible use of Space: shield before a hard hit or an antibiotic, cool when the wall is hot. */
export const secreterBot: Bot = (s) => {
  dodgeSteer(s);
  if (!secreteReady(s)) return;
  const incoming = exposureCost(s, s.theta);
  const abxSoon = warnings(s).abx.some((a) => a.t0 - s.t < 1.5);
  const hot = s.inflammation >= 0.55 || s.immune.length >= 4;
  if (abxSoon || hot || incoming >= 3) secrete(s);
};

/** Naive: opens the shield the moment it is ready. */
export const spamBot: Bot = (s) => { dodgeSteer(s); secrete(s); };

export const BOTS: Record<string, Bot> = { idle: idleBot, spin: spinBot, dodge: dodgeBot, secreter: secreterBot, spam: spamBot };
void wrap;
