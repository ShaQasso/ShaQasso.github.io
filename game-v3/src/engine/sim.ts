import balance from '../data/balance.json';
import speciesData from '../data/species.json';
import mealsData from '../data/meals.json';
import { rand } from './rng';
import { angDiff, allCells, neighbours, slotAt, TAU, wrap } from './geometry';
import { buildSchedule, mixAt } from './director';
import type { Cell, MealDef, Shape, SpeciesDef, State } from './types';

export const SPECIES = speciesData.species as unknown as Record<string, SpeciesDef>;
export const MEALS = mealsData as unknown as Record<string, MealDef>;
const B = balance;

export const coatOf = (c: Cell) => SPECIES[c.sp].coats[c.coat];

function newRing(n: number): State['rings'][number] {
  return { n, off: 0, omega: 0, cmd: 0, cells: Array(n).fill(null) };
}

function makeCell(s: State, sp: string, coat?: number): Cell {
  const def = SPECIES[sp];
  return { sp, coat: coat ?? Math.floor(rand(s) * def.coats.length), inf: 0, cd: def.interval * (0.3 + rand(s)) };
}

export function createState(seed: number): State {
  const s: State = {
    t: 0, rng: seed >>> 0, rings: [], particles: [], waves: [], waveAcc: [], antibiotics: [], gaps: [],
    offer: null, meal: null, inflammation: B.inflammation.base, health: B.health.start, dysbiosis: 0, endT: 0,
    status: 'run', reason: '', stats: { lysed: 0, flips: 0, births: 0, killed: 0, invaded: 0, blocked: 0, cleared: 0 },
  };
  for (let k = 0; k < B.startRings; k++) {
    const ring = newRing(B.ringSize[k]);
    for (let i = 0; i < ring.n; i++) {
      if (rand(s) < B.startFill[k]) {
        const sp = speciesData.start[Math.floor(rand(s) * speciesData.start.length)];
        ring.cells[i] = makeCell(s, sp);
      }
    }
    ring.off = rand(s) * TAU;
    s.rings.push(ring);
  }
  buildSchedule(s);
  return s;
}

// ---- player actions --------------------------------------------------------
export function setRotation(s: State, ring: number, cmd: number): void {
  if (s.rings[ring]) s.rings[ring].cmd = Math.max(-1, Math.min(1, cmd));
}

export function chooseMeal(s: State, idx: number): void {
  if (!s.offer || !s.offer[idx]) return;
  s.meal = { id: s.offer[idx], left: MEALS[s.offer[idx]].dur };
  s.offer = null;
}

// ---- queries ---------------------------------------------------------------
export function diversity(s: State): number {
  const counts = new Map<string, number>();
  let n = 0;
  for (const { cell } of allCells(s)) {
    if (SPECIES[cell.sp].pathogen) continue;
    const key = `${cell.sp}:${cell.coat}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    n++;
  }
  if (n === 0) return 0;
  let h = 0;
  for (const c of counts.values()) h -= (c / n) * Math.log(c / n);
  return Math.min(1, h / Math.log(9));
}

export function activeWaves(s: State) {
  return s.waves.filter((w) => s.t >= w.t0 && s.t < w.t0 + w.dur);
}
export function warnings(s: State) {
  return {
    waves: s.waves.filter((w) => s.t >= w.t0 - B.director.warn && s.t < w.t0),
    antibiotics: s.antibiotics.filter((a) => !a.fired && s.t >= a.t0 - B.director.warn),
  };
}

// ---- helpers ---------------------------------------------------------------
function killAt(s: State, ring: number, slot: number): void {
  s.rings[ring].cells[slot] = null;
}

function infect(cell: Cell, gen = 0): void {
  if (cell.inf === 0) { cell.inf = B.phage.infectTime; cell.gen = gen; }
}

function mealFlipBias(s: State, cell: Cell): number[] {
  const def = SPECIES[cell.sp];
  const w = def.coats.map(() => 1);
  const m = s.meal ? MEALS[s.meal.id] : null;
  if (m?.flipBias && (!m.flipBias.species || m.flipBias.species === cell.sp)) {
    if (m.flipBias.coat === 'calm') {
      let best = 0;
      def.coats.forEach((c, i) => { if (c.immune > def.coats[best].immune) best = i; });
      w[best] += m.flipBias.strength;
    } else if (m.flipBias.coat < w.length) {
      w[m.flipBias.coat] += m.flipBias.strength;
    }
  }
  w[cell.coat] = 0; // a flip always changes the coat
  return w;
}

function growthMult(s: State, cell: Cell): number {
  const m = s.meal ? MEALS[s.meal.id] : null;
  let g = coatOf(cell).growth;
  if (m) g *= m.growthBySpecies?.[cell.sp] ?? m.growthDefault ?? 1;
  // commensals are slowed by inflammation; pathogens thrive on it
  return g * (SPECIES[cell.sp].pathogen ? 1 + s.inflammation : Math.max(0.3, 1 - 0.5 * s.inflammation));
}

// ---- the step ---------------------------------------------------------------
export function step(s: State, dt: number = B.dt): void {
  if (s.status !== 'run') return;
  s.t += dt;
  const meal = s.meal ? MEALS[s.meal.id] : null;

  // rings: momentum + friction + speed cap (inner rings are heavier)
  s.rings.forEach((r, k) => {
    const cap = B.ring.maxOmega / (1 + B.ring.innerDrag * (s.rings.length - 1 - k));
    r.omega += (r.cmd * B.ring.accel - B.ring.friction * r.omega) * dt;
    r.omega = Math.max(-cap, Math.min(cap, r.omega));
    r.off = wrap(r.off + r.omega * dt);
  });

  // meal offers during calm gaps, meal expiry
  for (const g of s.gaps) {
    if (!g.offered && s.t >= g.start) {
      g.offered = true;
      const ids = Object.keys(MEALS);
      const a = ids.splice(Math.floor(rand(s) * ids.length), 1)[0];
      const b = ids[Math.floor(rand(s) * ids.length)];
      s.offer = [a, b];
    }
    if (s.offer && s.t >= g.end) s.offer = null;
  }
  if (s.meal) { s.meal.left -= dt; if (s.meal.left <= 0) s.meal = null; }

  // wave spawning
  s.waves.forEach((w, i) => {
    if (s.t < w.t0 || s.t >= w.t0 + w.dur) return;
    s.waveAcc[i] += w.rate * dt;
    while (s.waveAcc[i] >= 1) {
      s.waveAcc[i] -= 1;
      const mix = mixAt(w, s.t);
      let x = rand(s), shape: Shape = 'd';
      for (const sh of ['d', 'c', 't', 's'] as Shape[]) { x -= mix[sh]; if (x <= 0) { shape = sh; break; } }
      const centre = w.center + w.drift * (s.t - w.t0);
      s.particles.push({ r: s.rings.length + 2, angle: wrap(centre + (rand(s) * 2 - 1) * w.half), shape, kind: w.kind ?? 'phage' });
    }
  });

  // antibiotic strikes
  for (const a of s.antibiotics) {
    if (a.fired || s.t < a.t0) continue;
    a.fired = true;
    s.rings.forEach((r, k) => r.cells.forEach((c, i) => {
      if (!c) return;
      const ang = wrap(r.n === 1 ? a.center : r.off + (i + 0.5) * (TAU / r.n));
      if ((r.n === 1 || Math.abs(angDiff(a.center, ang)) <= a.half) && !coatOf(c).armored) {
        killAt(s, k, i);
        if (SPECIES[c.sp].pathogen) s.stats.cleared++; else s.stats.killed++;
      }
    }));
  }

  // particles fly inward, interacting with the cell they cross at each ring radius
  const speed = B.phage.speed * (meal?.phageSpeedMult ?? 1);
  const alive: typeof s.particles = [];
  for (const p of s.particles) {
    const r0 = p.r;
    p.r -= speed * dt;
    let consumed = false;
    for (let k = s.rings.length - 1; k >= 0 && !consumed; k--) {
      if (k > r0 || k <= p.r) continue; // ring radius k crossed this tick: r0 >= k > p.r
      const slot = slotAt(s, k, p.angle);
      const cell = s.rings[k].cells[slot];
      if (p.kind === 'invader') {
        // colonisation resistance: a dense colony blocks invaders; holes are the way in
        if (!cell) {
          if (rand(s) < B.invader.landProb) {
            s.rings[k].cells[slot] = { sp: 'pathogen', coat: 0, inf: 0, cd: SPECIES.pathogen.interval };
            s.stats.invaded++;
          }
          consumed = true;
        } else if (rand(s) < B.invader.resist) { consumed = true; s.stats.blocked++; }
        continue;
      }
      if (!cell) continue;
      if (cell.inf > 0) { consumed = true; continue; } // wasted on an already infected cell
      if (coatOf(cell).shape === p.shape) { infect(cell); consumed = true; }
    }
    if (!consumed && p.r > -0.5) alive.push(p);
  }
  s.particles = alive;

  // lysis
  const lysing: { ring: number; slot: number; shape: Shape; gen: number }[] = [];
  for (const { ring, slot, cell } of allCells(s)) {
    if (cell.inf > 0) { cell.inf -= dt; if (cell.inf <= 0) lysing.push({ ring, slot, shape: coatOf(cell).shape, gen: cell.gen ?? 0 }); }
  }
  for (const l of lysing) {
    killAt(s, l.ring, l.slot);
    s.stats.lysed++;
    s.inflammation = Math.min(1, s.inflammation + B.phage.lysisInflammation);
    // containment: only immediate neighbours, at most burstMax, with chance shrinking each generation
    const pBurst = B.phage.burst[Math.min(l.gen, B.phage.burst.length - 1)];
    const hosts = neighbours(s, l.ring, l.slot).filter(([nr, ns]) => {
      const n = s.rings[nr].cells[ns];
      return n && n.inf === 0 && coatOf(n).shape === l.shape;
    });
    for (let i = hosts.length - 1; i > 0; i--) { const j = Math.floor(rand(s) * (i + 1)); [hosts[i], hosts[j]] = [hosts[j], hosts[i]]; }
    for (const [nr, ns] of hosts.slice(0, B.phage.burstMax)) {
      if (rand(s) < pBurst) infect(s.rings[nr].cells[ns]!, l.gen + 1);
    }
  }

  // per-cell: flips, inflammation damage, growth
  const births: { ring: number; slot: number }[] = [];
  const damageRate = B.inflammation.damage;
  for (const { ring, slot, cell } of allCells(s)) {
    if (cell.inf > 0) continue;
    const def = SPECIES[cell.sp];
    const lambda = def.flip * (1 + 2 * s.inflammation) * (meal?.flipMult ?? 1);
    if (rand(s) < 1 - Math.exp(-lambda * dt)) {
      const w = mealFlipBias(s, cell);
      let x = rand(s) * w.reduce((a, b) => a + b, 0), pick = 0;
      for (let i = 0; i < w.length; i++) { x -= w[i]; if (x <= 0) { pick = i; break; } }
      cell.coat = pick;
      s.stats.flips++;
    }
    const imm = coatOf(cell).immune;
    if (imm < 0 && !def.pathogen && rand(s) < 1 - Math.exp(-s.inflammation * -imm * damageRate * dt)) { killAt(s, ring, slot); s.stats.killed++; continue; }
    cell.cd -= dt * growthMult(s, cell) * B.growthScale;
    if (cell.cd <= 0) births.push({ ring, slot });
  }
  for (const b of births) {
    const cell = s.rings[b.ring].cells[b.slot];
    if (!cell) continue;
    const empties = neighbours(s, b.ring, b.slot).filter(([r, i]) => !s.rings[r].cells[i]);
    if (empties.length === 0) { cell.cd = 0.5; continue; }
    const [er, ei] = empties[Math.floor(rand(s) * empties.length)];
    s.rings[er].cells[ei] = { sp: cell.sp, coat: cell.coat, inf: 0, cd: SPECIES[cell.sp].interval * (0.5 + rand(s)) };
    cell.cd = SPECIES[cell.sp].interval;
    s.stats.births++;
  }

  // the bubble expands when the rim is full
  const rim = s.rings[s.rings.length - 1];
  if (s.rings.length < B.ringSize.length && rim.cells.filter(Boolean).length / rim.n >= B.expandFill) {
    s.rings.push(newRing(B.ringSize[s.rings.length]));
  }

  // host mood: immune balance is the real fight
  const cells = allCells(s);
  const commensals = cells.filter((c) => !SPECIES[c.cell.sp].pathogen);
  const nPath = cells.length - commensals.length;
  const n = commensals.length;
  const avgImm = cells.length ? cells.reduce((a, c) => a + coatOf(c.cell).immune, 0) / cells.length : 0;
  // dysbiosis (one species dominating the commensals) makes inflammation worse instead of ending the run
  const bySp = new Map<string, number>();
  for (const c of commensals) bySp.set(c.cell.sp, (bySp.get(c.cell.sp) ?? 0) + 1);
  const top = n ? Math.max(...bySp.values()) / n : 1;
  s.dysbiosis = Math.max(0, (top - 0.5) / 0.5);
  const target = Math.max(0, Math.min(1, B.inflammation.base - B.inflammation.immuneWeight * avgImm
    + B.inflammation.particleWeight * s.particles.length + B.inflammation.pathogenWeight * nPath
    + B.inflammation.dysbiosisWeight * s.dysbiosis + (meal?.inflAdd ?? 0)));
  s.inflammation += (target - s.inflammation) * B.inflammation.relax * dt;
  s.inflammation = Math.max(0, Math.min(1, s.inflammation));
  const div = diversity(s);
  s.health += (B.health.inflWeight * (B.health.inflCenter - s.inflammation) + B.health.divWeight * (div - B.health.divCenter)) * dt;
  s.health = Math.max(0, Math.min(100, s.health));

  // end conditions
  if (n < B.lose.minCells) { s.status = 'lost'; s.reason = 'colony collapsed'; }
  else if (s.health <= 0) { s.status = 'lost'; s.reason = 'immune balance lost'; }
  else if (s.t >= s.endT) { s.status = 'won'; s.reason = 'survived'; }
}
