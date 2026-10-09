import { TAU, angDiff, cellAt, eachCell, idx, wrap } from '../engine/geometry';
import { CARD } from '../engine/cards';
import { COLOURS, coolingFactors, depthMap, pickCard, setRotation, useHeld, baseInflammation } from '../engine/sim';
import type { State } from '../engine/types';

export type Bot = (s: State, rnd: () => number) => void;
const clamp = (v: number) => Math.max(-1, Math.min(1, v));

function firstPixel(s: State, angle: number, r0: number, theta: number) {
  const psi = angle - theta;
  for (let rr = r0; rr > 0; rr -= 0.5) { const c = cellAt(s, Math.round(rr * Math.cos(psi)), Math.round(rr * Math.sin(psi))); if (c) return c; }
  return null;
}

/** Expected damage if the blob sat at `theta`: matching phages in flight, immune cells on non-evasive pixels. */
function exposure(s: State, theta: number): number {
  let cost = 0;
  for (const p of s.phages) { const c = firstPixel(s, p.angle, p.r, theta); if (c && c.m <= 0 && c.inf === 0 && (p.mask & (1 << c.c))) cost += 1; }
  for (const m of s.immune) { const c = firstPixel(s, m.angle, m.r, theta); if (c && c.m <= 0) cost += 0.3 * (1 - COLOURS[c.c].evade); }
  return cost;
}

/** How much a rotation is worth for cooling: hot sectors that the facing pixels cool badly are penalised. */
function heatPenalty(s: State, theta: number, depth: Map<number, number>): number {
  const f = coolingFactors(s, theta, depth), base = baseInflammation(s);
  let p = 0;
  s.wall.forEach((w, j) => { p += Math.max(0, w - base) * (1 - f[j]) * 40; });
  return p;
}

function steer(s: State, useCooling: boolean): void {
  const hot = s.wall.some((w) => w > baseInflammation(s) + 0.05);
  if (!s.phages.length && !s.immune.length && !(useCooling && hot)) { setRotation(s, clamp(-s.omega * 0.9)); return; }
  const depth = useCooling ? depthMap(s) : new Map<number, number>();
  let best = s.theta, bestScore = Infinity;
  for (let k = 0; k < 72; k++) {
    const cand = (k / 72) * TAU;
    const score = exposure(s, cand) + (useCooling ? heatPenalty(s, cand, depth) : 0) + 0.1 * Math.abs(angDiff(s.theta, cand));
    if (score < bestScore) { bestScore = score; best = cand; }
  }
  const stay = exposure(s, s.theta) + (useCooling ? heatPenalty(s, s.theta, depth) : 0);
  if (stay - bestScore < 0.8) { setRotation(s, clamp(-s.omega * 0.9)); return; }
  setRotation(s, clamp(angDiff(s.theta, best) * 3 - s.omega * 0.9));
}

// ---- card drafting policies --------------------------------------------------------------------
const SCORE: Record<string, number> = {
  mesalamine: 9, antitnf: 8, immunomod: 6, steroid: 7, fibre: 6, mucin: 5, starch: 5, peristalsis: 4, anchor: 3, mucolytic: 5, ringturn: 2,
  sugar: 1, phase_a: 2, phase_c: 2, phase_v: 4,
};
export function draftSmart(s: State): void { const i = s.offer.map((id) => SCORE[id] ?? 0).reduce((b, v, k, a) => (v > a[b] ? k : b), 0); pickCard(s, i); }
export function draftRandom(s: State, rnd: () => number): void { pickCard(s, Math.floor(rnd() * s.offer.length)); }
export function draftFirst(s: State): void { pickCard(s, 0); }

function useCards(s: State): void {
  if (!s.held) return;
  if (s.held.id === 'steroid' && s.inflammation >= 0.6) useHeld(s);
  else if (s.held.id === 'mucolytic' && (s.phages.length >= 6 || s.inflammation >= 0.65)) useHeld(s);
}

// ---- bots (they act every wave tick through `tick`; grooming through `groom`) ----------------------
export interface BotDef { groom: (s: State, rnd: () => number) => void; tick: (s: State, rnd: () => number) => void }
export const BOTS: Record<string, BotDef> = {
  idle: { groom: draftFirst, tick: () => {} },
  random: { groom: draftRandom, tick: (s, rnd) => { if (Math.floor(s.waveT * 20) % 30 === 0) setRotation(s, rnd() * 2 - 1); } },
  dodge: { groom: draftSmart, tick: (s) => { steer(s, false); useCards(s); } },
  smart: { groom: draftSmart, tick: (s) => { steer(s, true); useCards(s); } },
  smartRandomCards: { groom: draftRandom, tick: (s) => { steer(s, true); useCards(s); } },
};
void eachCell; void idx; void wrap; void CARD;
