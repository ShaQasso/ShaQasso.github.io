import balance from '../data/balance.json';
import { TAU, angDiff, cellAt, eachCell, idx, wrap } from './geometry';
import { COLOURS, depthMap, estimateBite, exertEffect } from './sim';
import type { State } from './types';

const B = balance;

export interface PhagePreview { angle: number; mask: number; hit: { i: number; j: number } | null; outcome: 'bite' | 'deflect' | 'miss' | 'blocked'; size: number }
export interface ImmunePreview { angle: number; hit: { i: number; j: number } | null; outcome: 'bite' | 'evade' | 'miss' | 'blocked'; size: number; evadeChance: number }
export interface Preview {
  phages: PhagePreview[]; immune: ImmunePreview[];
  abx: { angle: number; half: number; killed: number } | null;
  exert: { power: number; reduction: number[]; cooled: number };
  expectedLoss: number; perfect: boolean; blocked: boolean;
}

/** The first pixel an incoming particle meets if the blob is turned to `theta`. */
export function firstPixel(s: State, angle: number, r0: number, theta: number): { i: number; j: number } | null {
  const psi = angle - theta;
  for (let rr = r0; rr > 0; rr -= 0.25) {
    const i = Math.round(rr * Math.cos(psi)), j = Math.round(rr * Math.sin(psi));
    if (cellAt(s, i, j)) return { i, j };
  }
  return null;
}

/** What this turn would do to the blob with the current (or a candidate) rotation and effort direction. Honest: it uses the real rules. */
export function preview(s: State, theta = s.theta, exertAngle = s.exert, depth = depthMap(s)): Preview {
  const blocked = s.mucusTurns > 0;
  const phages: PhagePreview[] = s.ann.phages.map((p) => {
    const hit = firstPixel(s, p.angle, B.phage.spawnR, theta);
    if (!hit) return { ...p, hit: null, outcome: 'miss', size: 0 };
    if (blocked) return { ...p, hit, outcome: 'blocked', size: 0 };
    const c = cellAt(s, hit.i, hit.j)!;
    if (!(p.mask & (1 << c.c))) return { ...p, hit, outcome: 'deflect', size: 0 };
    return { ...p, hit, outcome: 'bite', size: estimateBite(s, hit.i, hit.j, p.mask) };
  });
  const immune: ImmunePreview[] = s.ann.immune.map((m) => {
    const hit = firstPixel(s, m.angle, B.wallR, theta);
    if (!hit) return { angle: m.angle, hit: null, outcome: 'miss', size: 0, evadeChance: 0 };
    if (blocked) return { angle: m.angle, hit, outcome: 'blocked', size: 0, evadeChance: 0 };
    const c = cellAt(s, hit.i, hit.j)!;
    const evadeChance = COLOURS[c.c].evade * B.immune.evadeFactor;
    return { angle: m.angle, hit, outcome: evadeChance > 0.5 ? 'evade' : 'bite', size: (1 + 4 * B.immune.bite) * (1 - evadeChance), evadeChance };
  });
  let abx: Preview['abx'] = null;
  if (s.ann.abx) {
    const a = s.ann.abx; let n = 0;
    eachCell(s, (_, i, j) => { if ((depth.get(idx(i, j)) ?? 99) <= B.abx.depth && Math.abs(angDiff(a.angle, wrap(Math.atan2(j, i) + theta))) <= a.half) n++; });
    abx = { angle: a.angle, half: a.half, killed: Math.round(n * B.abx.kill * (blocked ? 0.5 : 1)) };
  }
  const fx = exertEffect(s, exertAngle, theta, depth);
  const cooled = fx.reduction.reduce((a, r, j) => a + Math.min(r, Math.max(0, s.wall[j] - 0)), 0);
  const expectedLoss = phages.reduce((a, p) => a + p.size, 0) + immune.reduce((a, m) => a + m.size, 0) + (abx?.killed ?? 0);
  const perfect = phages.length > 0 && phages.every((p) => p.outcome !== 'bite');
  return { phages, immune, abx, exert: { power: fx.power, reduction: fx.reduction, cooled }, expectedLoss, perfect, blocked };
}

/** Lower is better: predicted pixels lost, minus what the cooling is worth (heat taken off hot sectors is worth roughly its weight in pixels). */
export function coolingValue(s: State, reduction: number[]): number {
  let v = 0;
  reduction.forEach((r, j) => { v += Math.min(r, Math.max(0, s.wall[j] - B.wall.base)) * 450; });
  return v;
}

export function bestPlan(s: State, thetas = 72, exerts = 24): { theta: number; exert: number; loss: number; cooled: number; perfect: boolean } {
  const depth = depthMap(s);
  let best = { theta: s.theta, exert: s.exert, loss: Infinity, cooled: 0, score: Infinity, perfect: false };
  for (let a = 0; a < thetas; a++) {
    const theta = (a / thetas) * TAU;
    const base = preview(s, theta, s.exert, depth); // the attackers do not depend on the effort direction: compute them once per rotation
    for (let e = 0; e < exerts; e++) {
      const exertAngle = (e / exerts) * TAU;
      const fx = exertEffect(s, exertAngle, theta, depth);
      const cooled = coolingValue(s, fx.reduction);
      const score = base.expectedLoss - cooled;
      if (score < best.score) best = { theta, exert: exertAngle, loss: base.expectedLoss, cooled, score, perfect: base.perfect };
    }
  }
  return { theta: best.theta, exert: best.exert, loss: best.loss, cooled: best.cooled, perfect: best.perfect };
}
