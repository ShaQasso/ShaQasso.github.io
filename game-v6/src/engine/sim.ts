import balance from '../data/balance.json';
import { CARD, CARDS } from './cards';
import { rand, randRange } from './rng';
import { NEIGH, R, TAU, W, angDiff, cellAt, count, eachCell, exposed, idx, inside, sectorOfAngle, wrap, worldAngle } from './geometry';
import type { Cell, CycleStats, FlareSeg, State } from './types';

const B = balance;
export const COLOURS = B.colours;
const S = B.wallSectors;
const newCell = (c: number): Cell => ({ c, inf: 0, ph: 0, gen: 0, m: 0, mcd: 0 });
export const phageSpeed = (s: State) => B.phage.speed * (1 + B.phage.speedGrow * (s.cycle - 1));
export const immuneSpeed = (s: State) => B.immune.speed * (1 + B.immune.speedGrow * (s.cycle - 1));
const emptyCyc = (): CycleStats => ({ lost: 0, hits: 0, peak: 0, coats: 0, abx: 0, immune: 0 });

// ---- mods (what the cards do) ------------------------------------------------
export function mod(s: State, key: string, kind: 'mul' | 'add'): number {
  let v = kind === 'mul' ? 1 : 0;
  for (const m of s.mods) {
    const def = CARD[m.id]?.mods;
    if (def && key in def) v = kind === 'mul' ? v * def[key] : v + def[key];
  }
  return v;
}
export const baseInflammation = (s: State) => B.wall.base + s.drift + mod(s, 'baseAdd', 'add');
export const inflammationOf = (wall: number[]) => Math.pow(wall.reduce((a, w) => a + w ** 3, 0) / wall.length, 1 / 3);

// ---- setup -----------------------------------------------------------------------
export function createState(seed: number): State {
  const s: State = {
    rng: seed >>> 0, t: 0, cells: new Array(W * W).fill(null), theta: 0, omega: 0, cmd: 0, cycle: 1, phase: 'groom', offer: [], picksLeft: B.picks, pending: null, sites: [], wallSites: [],
    held: null, mods: [], phaseQueue: null, waveT: 0, waveLen: B.wave.len, abx: [], flares: [], phages: [], immune: [], phageAcc: 0, immuneAcc: 0,
    wall: Array(S).fill(B.wall.base), cooling: Array(S).fill(0), inflammation: B.wall.base, drift: 0, overloadT: 0, coatAcc: 0, coolAcc: 0,
    spawning: true, mutating: true, coating: true, cyc: emptyCyc(), history: [], status: 'run', reason: '',
    stats: { lysed: 0, hits: 0, deflected: 0, blocked: 0, births: 0, abxKilled: 0, immuneKilled: 0, immuneEvaded: 0, flips: 0, coats: 0, cards: 0 },
  };
  const spots: [number, number][] = [];
  for (let j = -R; j <= R; j++) for (let i = -R; i <= R; i++) if (i * i + j * j <= B.startRadius ** 2) spots.push([i, j]);
  const seeds: { i: number; j: number; c: number }[] = [];
  const pool = spots.slice();
  for (let k = 0; k < B.seedPatches; k++) { const [i, j] = pool.splice(Math.floor(rand(s) * pool.length), 1)[0]; seeds.push({ i, j, c: k % COLOURS.length }); }
  for (const [i, j] of spots) {
    let best = seeds[0], bd = Infinity;
    for (const sd of seeds) { const d = (sd.i - i) ** 2 + (sd.j - j) ** 2; if (d < bd) { bd = d; best = sd; } }
    s.cells[idx(i, j)] = newCell(best.c);
  }
  s.theta = rand(s) * TAU;
  drawOffer(s);
  return s;
}

// ---- grooming: cards -----------------------------------------------------------------
export function drawOffer(s: State): void {
  const pool = CARDS.slice();
  s.offer = [];
  for (let k = 0; k < 3 && pool.length; k++) {
    const total = pool.reduce((a, c) => a + c.weight, 0);
    let x = rand(s) * total, pick = 0;
    for (let i = 0; i < pool.length; i++) { x -= pool[i].weight; if (x <= 0) { pick = i; break; } }
    s.offer.push(pool.splice(pick, 1)[0].id);
  }
}

function afterPick(s: State): void { s.picksLeft--; if (s.picksLeft <= 0) startWave(s); else drawOffer(s); }

/** Choose a card. Cards that work on a site wait for you to choose the site (placeTarget). */
export function pickCard(s: State, i: number): boolean {
  if (s.status !== 'run' || s.phase !== 'groom' || s.pending || !s.offer[i]) return false;
  const card = CARD[s.offer[i]];
  s.stats.cards++;
  if (card.held) s.held = { id: card.id, charges: card.held.charges };
  if (card.mods) s.mods.push({ id: card.id, left: card.cycles ?? 1 });
  if (card.target) { s.pending = { id: card.id, target: card.target }; return true; }
  afterPick(s);
  return true;
}

/** Say where a site card works: a pixel of the blob (food) or a sector of the wall (drug). */
export function placeTarget(s: State, t: { i?: number; j?: number; sector?: number }): boolean {
  if (!s.pending || s.phase !== 'groom') return false;
  const card = CARD[s.pending.id];
  if (s.pending.target === 'blob') {
    if (t.i === undefined || t.j === undefined || !cellAt(s, t.i, t.j)) return false;
    const colour = card.colour ?? 0;
    for (let dj = -B.site.coreR; dj <= B.site.coreR; dj++) for (let di = -B.site.coreR; di <= B.site.coreR; di++) {
      if (di * di + dj * dj > B.site.coreR ** 2) continue;
      const c = cellAt(s, t.i + di, t.j + dj);
      if (c && c.inf === 0) c.c = colour;
    }
    s.sites.push({ i: t.i, j: t.j, r: B.site.blobR, colour, left: B.site.waves });
  } else {
    if (t.sector === undefined) return false;
    s.wallSites.push({ sector: ((t.sector % S) + S) % S, bonus: B.site.wallBonus, left: B.site.wallWaves });
  }
  s.pending = null;
  afterPick(s);
  return true;
}

// ---- waves ----------------------------------------------------------------------------
const randSeg = (s: State, r: number[]) => randRange(s, r[0], r[1]);

function planWave(s: State): void {
  const c = s.cycle;
  s.abx = []; s.flares = [];
  if (c >= B.wave.abxFrom) {
    const k = c >= B.wave.abxLate ? 2 : 1;
    for (let i = 0; i < k; i++) s.abx.push({ t0: (B.wave.len * (i + 1)) / (k + 1) + randRange(s, -3, 3), angle: rand(s) * TAU, half: randRange(s, 0.5, 0.8), fired: false });
  }
  if (c >= B.flare.from) {
    const grow = 1 + B.flare.immuneGrow * c;
    const section = (t: number, angle: number, half: number, scale: number) => {
      const pre = randSeg(s, B.flare.pre), main = randSeg(s, B.flare.main), after = randSeg(s, B.flare.after);
      const segs: FlareSeg[] = [
        { t0: t, t1: t + pre, angle, half, intensity: B.flare.intensity.pre * grow * scale, kind: 'pre' },
        { t0: t + pre, t1: t + pre + main, angle, half, intensity: B.flare.intensity.main * grow * scale, kind: 'flare' },
        { t0: t + pre + main, t1: t + pre + main + after, angle, half, intensity: B.flare.intensity.after * grow * scale, kind: 'after' },
      ];
      s.flares.push(...segs);
    };
    section(randRange(s, 2, 6), rand(s) * TAU, randRange(s, B.flare.half[0], B.flare.half[1]), 1);
    if (c >= B.flare.secondFrom && rand(s) < 0.6) section(randRange(s, 10, 14), rand(s) * TAU, randRange(s, B.flare.half[0], B.flare.half[1]), 0.8);
  }
}

function startWave(s: State): void {
  s.phase = 'wave'; s.waveT = 0; s.waveLen = B.wave.len;
  s.phages = []; s.immune = []; s.phageAcc = 0; s.immuneAcc = 0; s.omega = 0; s.cmd = 0; s.overloadT = 0; s.coatAcc = 0; s.coolAcc = 0;
  s.cyc = emptyCyc();
  planWave(s);
  refreshCooling(s);
}

export function setRotation(s: State, cmd: number): void { s.cmd = Math.max(-1, Math.min(1, cmd)); }

/** The next cycle's grooming: chronic drift, partial recovery, cards tick down. */
export function nextCycle(s: State): void {
  if (s.status !== 'run' || s.phase !== 'checkup') return;
  s.cycle++;
  s.drift += B.chronic.perCycle * mod(s, 'chronicMul', 'mul');
  const base = baseInflammation(s);
  s.wall = s.wall.map((w) => base + (w - base) * B.chronic.recover);
  s.inflammation = inflammationOf(s.wall);
  s.phase = 'groom'; s.picksLeft = B.picks; s.pending = null;
  eachCell(s, (c) => { c.m = 0; c.mcd = 0; });
  drawOffer(s);
}

// ---- geometry-flavoured queries ----------------------------------------------------------
export function depthMap(s: State): Map<number, number> {
  const d = new Map<number, number>(); const q: [number, number][] = [];
  eachCell(s, (_, i, j) => { if (exposed(s, i, j)) { d.set(idx(i, j), 0); q.push([i, j]); } });
  for (let h = 0; h < q.length; h++) {
    const [i, j] = q[h];
    for (const [di, dj] of NEIGH) { const a = i + di, b = j + dj; if (inside(a, b) && s.cells[idx(a, b)] && !d.has(idx(a, b))) { d.set(idx(a, b), d.get(idx(i, j))! + 1); q.push([a, b]); } }
  }
  return d;
}

/** Passive cooling of each wall sector: anti-inflammatory pixels facing it count, by proximity to the lumen, with diminishing returns. */
export function coolingFactors(s: State, theta = s.theta, depth = depthMap(s)): number[] {
  const sum = new Array<number>(S).fill(0);
  eachCell(s, (c, i, j) => {
    const a = wrap(Math.atan2(j, i) + theta);
    const w = COLOURS[c.c].anti / (1 + B.cool.proximity * (depth.get(idx(i, j)) ?? 9));
    const j0 = Math.floor((a / TAU) * S);
    for (let k = -2; k <= 2; k++) {
      const sec = (j0 + k + S * 4) % S;
      const dd = Math.abs(angDiff(a, ((sec + 0.5) / S) * TAU));
      if (dd <= B.cool.half) sum[sec] += w * (1 - dd / B.cool.half);
    }
  });
  const bonus = mod(s, 'coolBonus', 'add');
  const site = new Array<number>(S).fill(0);
  for (const w of s.wallSites) for (let k = -1; k <= 1; k++) site[(w.sector + k + S) % S] += w.bonus * (k === 0 ? 1 : 0.5);
  return sum.map((v, j) => Math.min(B.cool.max + 0.1, Math.min(B.cool.max, 1 - Math.exp(-v / B.cool.K) + bonus) + site[j]));
}
function refreshCooling(s: State): void { s.cooling = coolingFactors(s); }

/** Connected single-colour patches (flood fill): the unit that mucus coats and cascades work on. */
export function patches(s: State): { colour: number; cells: [number, number][] }[] {
  const seen = new Set<number>(); const out: { colour: number; cells: [number, number][] }[] = [];
  eachCell(s, (c, i, j) => {
    if (seen.has(idx(i, j))) return;
    const q: [number, number][] = [[i, j]]; seen.add(idx(i, j));
    for (let h = 0; h < q.length; h++) {
      const [a, b] = q[h];
      for (const [di, dj] of NEIGH) { const n = cellAt(s, a + di, b + dj); if (n && n.c === c.c && !seen.has(idx(a + di, b + dj))) { seen.add(idx(a + di, b + dj)); q.push([a + di, b + dj]); } }
    }
    out.push({ colour: c.c, cells: q });
  });
  return out;
}

export function coatThreshold(s: State): number { return Math.max(B.coat.minPixels, B.coat.minFrac * count(s)); }

function coatCheck(s: State): void {
  const thr = coatThreshold(s), depth = depthMap(s);
  for (const p of patches(s)) {
    if (p.cells.length < thr) continue;
    const dur = (B.coat.base + B.coat.perMucus * COLOURS[p.colour].mucus) * mod(s, 'coatMul', 'mul');
    let n = 0;
    for (const [i, j] of p.cells) {
      const c = s.cells[idx(i, j)]!;
      if (c.m <= 0 && c.mcd <= 0 && (depth.get(idx(i, j)) ?? 9) < B.coat.depth) { c.m = dur; n++; }
    }
    if (n > 4) { s.stats.coats++; s.cyc.coats++; s.events?.push({ kind: 'patch', x: p.cells[0][0], y: p.cells[0][1], c: p.colour }); }
  }
}

function chipCoat(s: State, x: number, y: number): void {
  for (let dj = -B.coat.breakRadius; dj <= B.coat.breakRadius; dj++) for (let di = -B.coat.breakRadius; di <= B.coat.breakRadius; di++) {
    if (di * di + dj * dj > B.coat.breakRadius ** 2) continue;
    const c = cellAt(s, x + di, y + dj);
    if (c && c.m > 0) { c.m = 0; c.mcd = B.coat.cooldown; }
  }
}

// ---- held card (Space) ------------------------------------------------------------------------
export function useHeld(s: State, reverse = false): boolean {
  if (s.status !== 'run' || s.phase !== 'wave' || !s.held || s.held.charges <= 0) return false;
  const id = s.held.id;
  if (id === 'ringturn') turnBand(s, reverse ? -1 : 1);
  else if (id === 'steroid') {
    s.wall = s.wall.map((w) => Math.max(0, w - 0.3)); s.inflammation = inflammationOf(s.wall);
    s.mods.push({ id: 'steroid_rebound', left: 1 }); s.events?.push({ kind: 'steroid', x: 0, y: 0 });
  } else if (id === 'mucolytic') {
    eachCell(s, (c, i, j) => { if (exposed(s, i, j)) { c.m = B.coat.burstSecs; c.mcd = 0; } });
    s.events?.push({ kind: 'burst', x: 0, y: 0 });
  }
  s.held.charges--;
  if (s.held.charges <= 0) s.held = null;
  return true;
}

/** Turn the outer band of the blob against the core (shape the blob). */
export function turnBand(s: State, dir: number): void {
  let maxR = 0;
  eachCell(s, (_, i, j) => { maxR = Math.max(maxR, Math.hypot(i, j)); });
  const rin = maxR - B.band.width, ang = dir * B.band.angle, ca = Math.cos(ang), sa = Math.sin(ang);
  const next = s.cells.slice();
  for (let j = -R; j <= R; j++) for (let i = -R; i <= R; i++) {
    const r = Math.hypot(i, j);
    if (r < rin || r > maxR + 1.5) continue;
    const si = Math.round(i * ca + j * sa), sj = Math.round(-i * sa + j * ca);
    const sr = Math.hypot(si, sj), src = inside(si, sj) && sr >= rin && sr <= maxR + 1.5 ? s.cells[idx(si, sj)] : null;
    next[idx(i, j)] = src ? { ...src } : null;
  }
  s.cells = next;
  s.events?.push({ kind: 'turn', x: 0, y: 0 });
}

// ---- helpers ----------------------------------------------------------------------------------
function kill(s: State, i: number, j: number, why: 'abx' | 'immune' | 'lysis', mask?: number): void {
  s.cells[idx(i, j)] = null; s.cyc.lost++;
  s.events?.push({ kind: why, x: i, y: j, mask });
}

function finishWave(s: State): void {
  s.cyc.peak = Math.max(s.cyc.peak, s.inflammation);
  s.history.push({ ...s.cyc });
  s.mods = s.mods.map((m) => ({ ...m, left: m.left - 1 })).filter((m) => m.left > 0);
  s.sites = s.sites.map((x) => ({ ...x, left: x.left - 1 })).filter((x) => x.left > 0);
  s.wallSites = s.wallSites.map((x) => ({ ...x, left: x.left - 1 })).filter((x) => x.left > 0);
  s.phages = []; s.immune = [];
  if (s.cycle >= B.cycles) { s.status = 'won'; s.reason = 'a year in remission'; return; }
  s.phase = 'checkup';
}

// ---- the real-time wave -------------------------------------------------------------------------
export function step(s: State, dt: number = B.dt): void {
  if (s.status !== 'run' || s.phase !== 'wave') return;
  s.t += dt; s.waveT += dt;
  const c = s.cycle, progress = s.waveT / s.waveLen;

  // whole-blob rotation: weight, momentum, a speed cap (cards change it)
  const accel = B.rotate.accel * mod(s, 'rotAccel', 'mul'), cap = B.rotate.maxOmega * mod(s, 'rotMax', 'mul');
  s.omega += (s.cmd * accel - B.rotate.friction * s.omega) * dt;
  s.omega = Math.max(-cap, Math.min(cap, s.omega));
  s.theta = wrap(s.theta + s.omega * dt);

  // a stream of phages from every side, building through the wave and across cycles
  if (s.spawning) {
    const rate = B.wave.base * Math.pow(B.wave.growth, c - 1) * (B.wave.ramp[0] + (B.wave.ramp[1] - B.wave.ramp[0]) * progress);
    s.phageAcc += rate * dt;
    while (s.phageAcc >= 1) {
      s.phageAcc -= 1;
      let mask = 1 << Math.floor(rand(s) * 3);
      if (c >= B.wave.twoColourFrom && rand(s) < B.wave.twoColourProb) mask |= 1 << Math.floor(rand(s) * 3);
      s.phages.push({ r: B.phage.spawnR, angle: rand(s) * TAU, mask });
    }
  }
  // flares: heat their arc of the wall and fire immune cells from it
  const heat = new Array<number>(S).fill(0);
  for (const f of s.flares) {
    if (s.waveT < f.t0 || s.waveT >= f.t1) continue;
    const flareMul = mod(s, 'flareMul', 'mul');
    for (let j = 0; j < S; j++) if (Math.abs(angDiff(f.angle, ((j + 0.5) / S) * TAU)) <= f.half + TAU / S / 2) heat[j] += f.intensity * B.flare.heat * flareMul;
    if (s.spawning) {
      s.immuneAcc += B.flare.immunePerSec * f.intensity * mod(s, 'immuneMul', 'mul') * dt * (1 + 0.1 * c);
      while (s.immuneAcc >= 1) { s.immuneAcc -= 1; s.immune.push({ r: B.wallR, angle: wrap(f.angle + (rand(s) * 2 - 1) * f.half * 1.2) }); }
    }
  }
  // antibiotics: a telegraphed arc through the outer layers
  for (const a of s.abx) {
    if (a.fired || s.waveT < a.t0) continue;
    a.fired = true;
    const depth = depthMap(s);
    eachCell(s, (cell, i, j) => {
      if ((depth.get(idx(i, j)) ?? 99) > B.abx.depth || Math.abs(angDiff(a.angle, worldAngle(s, i, j))) > a.half) return;
      if (rand(s) < B.abx.kill * (cell.m > 0 ? 0.5 : 1)) { kill(s, i, j, 'abx'); s.stats.abxKilled++; s.cyc.abx++; }
    });
  }

  // phages hit the first pixel on their path; a coat soaks the hit and chips
  const alive: typeof s.phages = [];
  for (const p of s.phages) {
    const r0 = p.r; p.r -= phageSpeed(s) * dt;
    const psi = p.angle - s.theta; let done = false;
    for (let rr = r0; rr > p.r && !done; rr -= 0.25) {
      const x = Math.round(rr * Math.cos(psi)), y = Math.round(rr * Math.sin(psi));
      const cell = cellAt(s, x, y);
      if (!cell) continue;
      done = true;
      if (cell.m > 0) { s.stats.blocked++; s.events?.push({ kind: 'coat', x, y }); chipCoat(s, x, y); }
      else if (cell.inf > 0) { /* wasted on an infected pixel */ }
      else if (p.mask & (1 << cell.c)) { cell.inf = B.phage.infectTime; cell.ph = p.mask; cell.gen = 0; s.stats.hits++; s.cyc.hits++; s.events?.push({ kind: 'infect', x, y, mask: p.mask, c: cell.c }); }
      else { s.stats.deflected++; s.events?.push({ kind: 'deflect', x, y, mask: p.mask, c: cell.c }); }
    }
    if (!done && p.r > 0) alive.push(p);
  }
  s.phages = alive;
  // immune cells bite (small chew) unless the pixel evades or is coated
  const aliveI: typeof s.immune = [];
  for (const m of s.immune) {
    const r0 = m.r; m.r -= immuneSpeed(s) * dt;
    const psi = m.angle - s.theta; let done = false;
    for (let rr = r0; rr > m.r && !done; rr -= 0.25) {
      const x = Math.round(rr * Math.cos(psi)), y = Math.round(rr * Math.sin(psi));
      const cell = cellAt(s, x, y);
      if (!cell) continue;
      done = true;
      if (cell.m > 0) { s.stats.blocked++; s.events?.push({ kind: 'coat', x, y }); chipCoat(s, x, y); }
      else if (rand(s) < COLOURS[cell.c].evade * B.immune.evadeFactor) { s.stats.immuneEvaded++; s.events?.push({ kind: 'evade', x, y, c: cell.c }); }
      else {
        // the cell scrapes a strip: a few pixels wide, a few deep along its path; coats and evasive pixels survive
        const ux = Math.cos(psi), uy = Math.sin(psi), H = B.immune.stripHalf, D = B.immune.stripDepth;
        const seen = new Set<number>();
        for (let d = 0; d <= D; d++) for (let w = -H; w <= H; w++) {
          const px = Math.round(x - ux * d - uy * w), py = Math.round(y - uy * d + ux * w);
          const k = px * 1000 + py; if (seen.has(k)) continue; seen.add(k);
          const t = cellAt(s, px, py); if (!t || t.m > 0) continue;
          if (rand(s) < COLOURS[t.c].evade * B.immune.evadeFactor) { s.stats.immuneEvaded++; continue; }
          kill(s, px, py, 'immune'); s.stats.immuneKilled++; s.cyc.immune++;
        }
      }
    }
    if (!done && m.r > 0) aliveI.push(m);
  }
  s.immune = aliveI;

  // infection timers, lysis and the burst through same-colour neighbours
  const damp = mod(s, 'biteDamp', 'mul'), resistAdd = mod(s, 'resistAdd', 'add');
  const lysing: { i: number; j: number; cell: Cell }[] = [];
  eachCell(s, (cell, i, j) => { if (cell.inf > 0) { cell.inf -= dt; if (cell.inf <= 0) lysing.push({ i, j, cell }); } });
  for (const { i, j, cell } of lysing) {
    kill(s, i, j, 'lysis', cell.ph); s.stats.lysed++;
    const sec = sectorOfAngle(worldAngle(s, i, j), S);
    s.wall[sec] = Math.min(1, s.wall[sec] + B.wall.lysisPulse);
    const p0 = B.phage.burst[Math.min(cell.gen, B.phage.burst.length - 1)] * damp;
    for (const [di, dj] of NEIGH) {
      const n = cellAt(s, i + di, j + dj);
      if (!n || n.inf > 0 || n.m > 0 || !(cell.ph & (1 << n.c))) continue;
      if (rand(s) < p0 * (1 - Math.min(0.95, B.phage.resistFactor * COLOURS[n.c].resist + resistAdd))) { n.inf = B.phage.infectTime; n.ph = cell.ph; n.gen = cell.gen + 1; }
    }
  }

  // growth into holes (capacity, card multipliers), colour switches as microcolonies
  const capacity = B.capacity * mod(s, 'capMul', 'mul'), n0 = count(s);
  const room = Math.max(0, 1 - n0 / capacity);
  const share = [0, 0, 0]; eachCell(s, (cell) => { share[cell.c]++; });
  const rareW = share.map((v) => 1 / (v / Math.max(1, n0) + B.mutate.rareBias));
  const gAll = mod(s, 'growthAll', 'mul');
  const parents: [number, number][] = [];
  eachCell(s, (cell, i, j) => {
    if (cell.inf > 0) return;
    if (s.mutating && rand(s) < 1 - Math.exp(-B.mutate.rate * (1 + s.inflammation) * dt)) {
      let pick: number;
      if (s.phaseQueue && s.phaseQueue.n > 0) { pick = s.phaseQueue.colour; s.phaseQueue.n--; if (s.phaseQueue.n <= 0) s.phaseQueue = null; }
      else {
        const w = rareW.map((v, k) => (k === cell.c ? 0 : v));
        let x = rand(s) * (w[0] + w[1] + w[2]); pick = (cell.c + 1) % 3;
        for (let k = 0; k < 3; k++) { x -= w[k]; if (x <= 0) { pick = k; break; } }
      }
      const rad = B.mutate.radius[0] + rand(s) * (B.mutate.radius[1] - B.mutate.radius[0]);
      for (let dj = -3; dj <= 3; dj++) for (let di = -3; di <= 3; di++) { if (di * di + dj * dj > rad * rad) continue; const nb = cellAt(s, i + di, j + dj); if (nb && nb.inf === 0) nb.c = pick; }
      s.stats.flips++;
    }
    let g = (COLOURS[cell.c].growth / B.growthInterval) * gAll * mod(s, `growth${cell.c}`, 'mul') * room;
    for (const st of s.sites) if ((i - st.i) ** 2 + (j - st.j) ** 2 <= st.r * st.r) { g *= B.site.growMul; break; }
    if (rand(s) < 1 - Math.exp(-dt * g)) parents.push([i, j]);
    if (cell.m > 0) { cell.m -= dt; if (cell.m <= 0) cell.mcd = B.coat.cooldown; } else if (cell.mcd > 0) cell.mcd -= dt;
  });
  for (const [i, j] of parents) {
    const p = s.cells[idx(i, j)];
    if (!p || p.inf > 0) continue;
    const empties = NEIGH.map(([di, dj]) => [i + di, j + dj] as [number, number]).filter(([a, b]) => inside(a, b) && !s.cells[idx(a, b)]);
    if (!empties.length) continue;
    const [ei, ej] = empties[Math.floor(rand(s) * empties.length)];
    const votes = [0, 0, 0]; votes[p.c] += B.parentWeight;
    for (const [di, dj] of NEIGH) { const nb = cellAt(s, ei + di, ej + dj); if (nb && nb !== p && nb.inf === 0) votes[nb.c] += 1; }
    let x = rand(s) * (votes[0] + votes[1] + votes[2]), pick = p.c;
    for (let k = 0; k < 3; k++) { x -= votes[k]; if (x <= 0) { pick = k; break; } }
    for (const st of s.sites) if ((ei - st.i) ** 2 + (ej - st.j) ** 2 <= st.r * st.r && rand(s) < B.site.newbornP) { pick = st.colour; break; }
    s.cells[idx(ei, ej)] = newCell(pick); s.stats.births++;
  }

  // mucus coats on big patches (checked about once a second); passive cooling refreshed a few times a second
  s.coatAcc += dt; if (s.coatAcc >= B.coat.check) { s.coatAcc = 0; if (s.coating) coatCheck(s); }
  s.coolAcc += dt; if (s.coolAcc >= B.cool.refresh) { s.coolAcc = 0; refreshCooling(s); }

  // the wall: flares heat it, facing violet cools it, it relaxes toward the (chronically rising) baseline
  const base = baseInflammation(s);
  s.wall = s.wall.map((w, j) => Math.max(0, Math.min(1, w + (heat[j] - (w > base ? s.cooling[j] * B.cool.rate : 0) - B.wall.decay * (w - base)) * dt)));
  s.inflammation = inflammationOf(s.wall);
  s.cyc.peak = Math.max(s.cyc.peak, s.inflammation);

  // end conditions: a sustained overload is a flare-out; the community collapsing is the rare other way to lose
  s.overloadT = s.inflammation >= B.overload ? s.overloadT + dt : Math.max(0, s.overloadT - dt * 0.5);
  if (count(s) < B.lose.minCells) { s.status = 'lost'; s.reason = 'the community collapsed'; return; }
  if (s.overloadT >= B.overloadSecs) { s.status = 'lost'; s.reason = 'flare-out: inflammation overload'; return; }
  if (s.waveT >= s.waveLen) finishWave(s);
}
