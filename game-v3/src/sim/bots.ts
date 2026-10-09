import { angDiff, sectorOf, TAU, wrap } from '../engine/geometry';
import balance from '../data/balance.json';
import { activeWaves, chooseMeal, coatOf, setRotation, SPECIES, warnings } from '../engine/sim';
import { mixAt } from '../engine/director';
import type { Shape, State } from '../engine/types';

export type Bot = (s: State) => void;

/** The most pressing threat: highest-rate active (or about to start) wave, with its dominant shape. */
function threat(s: State): { center: number; half: number; shape: Shape } | null {
  const act = activeWaves(s).filter((w) => w.kind !== 'invader');
  const pool = act.length ? act : warnings(s).waves.filter((w) => w.kind !== 'invader');
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

function steer(s: State, ring: number, cost: (off: number) => number, margin = 0) {
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
  // hysteresis: only move when the best arrangement clearly beats staying put (constant stirring exposes every cell)
  if (margin > 0 && cost(r.off) - bestScore < margin) { setRotation(s, ring, Math.max(-1, Math.min(1, -r.omega * 0.8))); return; }
  const err = angDiff(r.off, r.off + best * stepA);
  // simple PD controller on a ring with momentum
  setRotation(s, ring, Math.max(-1, Math.min(1, err * 3 - r.omega * 0.8)));
}

function inArc(angle: number, c: number, half: number) {
  return Math.abs(angDiff(c, angle)) <= half;
}

/** Sponge candidates are only cells whose (species, coat) type is common, so losing them costs little. */
function typeCounts(s: State) {
  const m = new Map<string, number>();
  for (const r of s.rings) for (const c of r.cells) if (c) m.set(`${c.sp}:${c.coat}`, (m.get(`${c.sp}:${c.coat}`) ?? 0) + 1);
  return m;
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

/** Antibiotic about to strike: put pathogens (and armored cells) in the arc, sensitive commensals out of it. */
function antibioticPlan(s: State): boolean {
  const ab = warnings(s).antibiotics[0];
  if (!ab) return false;
  const pathogens = s.rings.some((r) => r.cells.some((c) => c && SPECIES[c.sp].pathogen));
  if (!pathogens) return false;
  s.rings.forEach((r, k) => steer(s, k, (off) => {
    let cost = 0;
    r.cells.forEach((c, i) => {
      if (!c) return;
      const ang = wrap(off + (i + 0.5) * (TAU / r.n));
      if (!inArc(ang, ab.center, ab.half)) { if (SPECIES[c.sp].pathogen) cost += 2; return; }
      if (SPECIES[c.sp].pathogen) cost -= 2;
      else if (!coatOf(c).armored) cost += 1;
    });
    return cost;
  }));
  return true;
}

export const idleBot: Bot = (s) => pickMeal(s);

export const spinBot: Bot = (s) => {
  pickMeal(s);
  if (Math.floor(s.t * 20) % 40 === 0) s.rings.forEach((_, k) => setRotation(s, k, Math.random() * 2 - 1));
};

/** Dodge: keep cells that match the incoming shape out of the wave's arc, on every ring. */
export const dodgeBot: Bot = (s) => {
  pickMeal(s);
  if (antibioticPlan(s)) return;
  const th = threat(s);
  if (!th) { s.rings.forEach((_, k) => setRotation(s, k, 0)); return; }
  s.rings.forEach((_, k) => steer(s, k, (off) => cellsInArc(s, k, off, th).match));
};

/** Sponge: a couple of matching cells on the rim soak the stream; every inner ring dodges. */
export const spongeBot: Bot = (s) => {
  pickMeal(s);
  if (antibioticPlan(s)) return;
  const th = threat(s);
  if (!th) { s.rings.forEach((_, k) => setRotation(s, k, 0)); return; }
  const rim = s.rings.length - 1;
  s.rings.forEach((_, k) => {
    if (k === rim) {
      const tc = typeCounts(s);
      steer(s, k, (off) => {
        const r = s.rings[k];
        let spongeOK = 0, bad = 0;
        r.cells.forEach((c, i) => {
          if (!c || coatOf(c).shape !== th.shape) return;
          if (!inArc(wrap(off + (i + 0.5) * (TAU / r.n)), th.center, th.half)) return;
          if ((tc.get(`${c.sp}:${c.coat}`) ?? 0) >= 3) spongeOK++; else bad++;
        });
        return -Math.min(spongeOK, 2) + 1.5 * bad + 0.5 * Math.max(0, spongeOK - 2);
      });
    }
    else steer(s, k, (off) => cellsInArc(s, k, off, th).match);
  });
};

/** Cooling cost for a ring at an offset: calming cells under hot sectors are good, red cells under hot sectors are bad. */
function coolingCost(s: State, ring: number, off: number): number {
  const r = s.rings[ring];
  const depth = s.rings.length - 1 - ring;
  const w = balance.wall.depthWeights[Math.min(depth, balance.wall.depthWeights.length - 1)];
  let cost = 0;
  r.cells.forEach((c, i) => {
    if (!c) return;
    const hot = s.wall[sectorOf(off + (i + 0.5) * (TAU / r.n), balance.wall.sectors)];
    const imm = SPECIES[c.sp].pathogen ? -3 : coatOf(c).immune;
    cost -= imm * w * (hot - 0.3);
  });
  return cost;
}

/** Dodge incoming phages while putting calming cells under the hottest wall sectors. */
export const coolBot: Bot = (s) => {
  pickMeal(s);
  if (antibioticPlan(s)) return;
  const th = threat(s);
  const rim = s.rings.length - 1;
  s.rings.forEach((_, k) => {
    // the rim is busy dodging; inner rings (protected) do most of the cooling
    const dodge = (off: number) => (th ? 3 * cellsInArc(s, k, off, th).match : 0);
    if (k === rim && th) steer(s, k, dodge, 0.5);
    else steer(s, k, (off) => dodge(off) + coolingCost(s, k, off), 2.5);
  });
};

export const BOTS: Record<string, Bot> = { idle: idleBot, spin: spinBot, dodge: dodgeBot, sponge: spongeBot, cool: coolBot };
