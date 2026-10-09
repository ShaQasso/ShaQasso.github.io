import balance from '../data/balance.json';
import { rand, randRange } from './rng';
import { NEIGH, R, TAU, W, angDiff, cellAt, count, eachCell, exposed, idx, inside, sectorOfAngle, wrap, worldAngle } from './geometry';
import type { Announce, Cell, Section, State } from './types';

const B = balance;
export const COLOURS = B.colours;
const newCell = (c: number): Cell => ({ c, inf: 0, ph: 0, gen: 0 });
const randInt = (s: State, a: number, b: number) => a + Math.floor(rand(s) * (b - a + 1));

// ---- setup ------------------------------------------------------------------
export function createState(seed: number): State {
  const s: State = {
    rng: seed >>> 0, t: 0, cells: new Array(W * W).fill(null), theta: 0, exert: 0, turn: 0, phase: 'plan', phaseT: 0, timer: 0, timerMax: 0,
    ann: { phages: [], immune: [], abx: null }, phages: [], immune: [],
    section: { kind: 'quiet', left: B.section.startTurn, total: B.section.startTurn, intensity: 0, angle: 0, half: 0 }, lastAbxTurn: -99,
    wall: Array(B.wallSectors).fill(B.wall.base), inflammation: B.wall.base, mucusTurns: 0, mucusCd: 0,
    skips: 0, streak: 0, bestStreak: 0, perfects: 0, skipped: false, turnHits: 0, turnBites: 0, status: 'run', reason: '',
    stats: { lysed: 0, hits: 0, deflected: 0, blocked: 0, births: 0, abxKilled: 0, immuneKilled: 0, immuneEvaded: 0, flips: 0, skipsUsed: 0 },
  };
  // a dense disc of clonal patches: a seed per patch, every pixel takes the colour of the nearest seed
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
  s.theta = rand(s) * TAU; s.exert = rand(s) * TAU;
  beginTurn(s);
  return s;
}

// ---- geometry-flavoured queries ----------------------------------------------
export const turnTimer = (turn: number) => Math.max(B.turns.timerMin, B.turns.timerStart - B.turns.timerDrop * (turn - 1));
export const inflammationOf = (wall: number[]) => Math.pow(wall.reduce((a, w) => a + w ** 3, 0) / wall.length, 1 / 3);

export function depthMap(s: State): Map<number, number> {
  const d = new Map<number, number>();
  const q: [number, number][] = [];
  eachCell(s, (_, i, j) => { if (exposed(s, i, j)) { d.set(idx(i, j), 0); q.push([i, j]); } });
  for (let h = 0; h < q.length; h++) {
    const [i, j] = q[h];
    for (const [di, dj] of NEIGH) {
      const a = i + di, b = j + dj;
      if (inside(a, b) && s.cells[idx(a, b)] && !d.has(idx(a, b))) { d.set(idx(a, b), d.get(idx(i, j))! + 1); q.push([a, b]); }
    }
  }
  return d;
}

/** Composition of the outside of the blob: drives the mucus bloom. */
export function surfaceStats(s: State) {
  const share = [0, 0, 0]; let n = 0, mucus = 0;
  eachCell(s, (c, i, j) => { if (exposed(s, i, j)) { n++; share[c.c]++; mucus += COLOURS[c.c].mucus; } });
  const top = n ? Math.max(...share) / n : 0;
  return { exposed: n, share: share.map((v) => (n ? v / n : 0)), top, topColour: share.indexOf(Math.max(...share)), mucusPower: n ? mucus / n : 0 };
}

/**
 * How strongly the anti-inflammatory effort works in a direction: anti-inflammatory pixels near the edge (the lumen) count most.
 * Returns power (0..~1.5) and the heat taken off each wall sector.
 */
export function exertEffect(s: State, angle: number, theta = s.theta, depth = depthMap(s)) {
  let sum = 0;
  eachCell(s, (c, i, j) => {
    const a = wrap(Math.atan2(j, i) + theta);
    if (Math.abs(angDiff(angle, a)) > B.exert.half) return;
    const d = depth.get(idx(i, j)) ?? 9;
    sum += COLOURS[c.c].anti / (1 + B.exert.proximity * d);
  });
  const power = Math.min(1.5, sum / B.exert.norm);
  const S = B.wallSectors, half = TAU / S / 2;
  const reduction = Array.from({ length: S }, (_, j) => {
    const w = Math.max(0, 1 - Math.abs(angDiff(angle, ((j + 0.5) / S) * TAU)) / (B.exert.half + half));
    return B.exert.max * power * w;
  });
  return { power, reduction };
}

// ---- cascade estimate (used by the preview) -----------------------------------
/** Expected size of the bite a phage of `mask` would open at pixel (i, j): a deterministic Monte-Carlo run of the real cascade rules. */
export function estimateBite(s: State, i: number, j: number, mask: number, samples = 10): number {
  const start = cellAt(s, i, j);
  if (!start || !(mask & (1 << start.c)) || start.inf > 0) return 0;
  let seed = (i * 73856093) ^ (j * 19349663) ^ (mask * 83492791) ^ 0x9e3779b9;
  const rnd = () => { seed = (seed + 0x6d2b79f5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  let total = 0;
  for (let k = 0; k < samples; k++) {
    const seen = new Set<number>([idx(i, j)]);
    let frontier: [number, number][] = [[i, j]];
    let n = 1;
    for (let gen = 0; frontier.length && gen < B.phage.burst.length; gen++) {
      const p0 = B.phage.burst[gen];
      const next: [number, number][] = [];
      for (const [a, b] of frontier) {
        for (const [di, dj] of NEIGH) {
          const x = a + di, y = b + dj, n2 = cellAt(s, x, y);
          if (!n2 || n2.inf > 0 || seen.has(idx(x, y)) || !(mask & (1 << n2.c))) continue;
          if (rnd() < p0 * (1 - B.phage.resistFactor * COLOURS[n2.c].resist)) { seen.add(idx(x, y)); next.push([x, y]); n++; }
        }
      }
      frontier = next;
    }
    total += n;
  }
  return Math.round(total / samples);
}

// ---- turns ---------------------------------------------------------------------
function genAnnounce(s: State): Announce {
  const n = s.turn;
  const ann: Announce = { phages: [], immune: [], abx: null };
  const nPh = Math.min(B.turns.maxPhages, B.turns.basePhages + Math.floor((n - 1) / B.turns.phagesEvery));
  for (let k = 0; k < nPh; k++) {
    let mask = 1 << Math.floor(rand(s) * 3);
    if (n >= B.turns.twoColourFrom && rand(s) < Math.min(0.6, 0.1 + 0.03 * (n - B.turns.twoColourFrom))) mask |= 1 << Math.floor(rand(s) * 3);
    ann.phages.push({ angle: rand(s) * TAU, mask });
  }
  if (n >= B.turns.abxFrom && n - s.lastAbxTurn >= B.turns.abxGap && rand(s) < Math.min(0.55, 0.25 + 0.015 * (n - B.turns.abxFrom))) {
    ann.abx = { angle: rand(s) * TAU, half: randRange(s, 0.5, 0.8) };
  }
  const sec = s.section;
  if (sec.kind !== 'quiet') {
    const k = Math.max(1, Math.round(sec.intensity * (B.immune.base + B.immune.perTurn * n)));
    for (let m = 0; m < k; m++) ann.immune.push({ angle: wrap(sec.angle + (rand(s) * 2 - 1) * sec.half * 1.2) });
  }
  return ann;
}

function mucusGate(s: State): void {
  if (s.mucusTurns > 0) return;
  if (s.mucusCd > 0) return;
  const st = surfaceStats(s);
  if (st.top >= B.mucus.gate) s.mucusTurns = Math.max(1, Math.round(1 + B.mucus.perMucus * (COLOURS[st.topColour].mucus - 0.1)));
}

export function beginTurn(s: State): void {
  s.turn++;
  s.phase = 'plan'; s.phaseT = 0; s.skipped = false;
  s.timerMax = turnTimer(s.turn); s.timer = s.timerMax;
  mucusGate(s);
  s.ann = genAnnounce(s);
  s.turnHits = 0; s.turnBites = 0;
}

function kill(s: State, i: number, j: number, why: 'abx' | 'immune' | 'lysis', mask?: number): void {
  s.cells[idx(i, j)] = null;
  s.events?.push({ kind: why, x: i, y: j, mask });
}

/** Spend the turn's anti-inflammatory effort. */
function applyExert(s: State): void {
  const fx = exertEffect(s, s.exert);
  const before = s.wall.reduce((a, w) => a + w, 0);
  s.wall = s.wall.map((w, j) => Math.max(0, w - fx.reduction[j]));
  s.inflammation = inflammationOf(s.wall);
  if (before - s.wall.reduce((a, w) => a + w, 0) > 0.02) s.events?.push({ kind: 'cool', x: Math.cos(s.exert) * B.wallR, y: Math.sin(s.exert) * B.wallR });
}

/** Lock in the plan: everything announced lands. */
export function release(s: State): void {
  if (s.status !== 'run' || s.phase !== 'plan') return;
  applyExert(s);
  for (const p of s.ann.phages) s.phages.push({ r: B.phage.spawnR, angle: p.angle, mask: p.mask });
  for (const m of s.ann.immune) s.immune.push({ r: B.wallR, angle: m.angle });
  if (s.ann.abx) {
    s.lastAbxTurn = s.turn;
    const depth = depthMap(s), a = s.ann.abx;
    eachCell(s, (c, i, j) => {
      if ((depth.get(idx(i, j)) ?? 99) > B.abx.depth || Math.abs(angDiff(a.angle, worldAngle(s, i, j))) > a.half) return;
      if (rand(s) < B.abx.kill * (s.mucusTurns > 0 ? 0.5 : 1)) { kill(s, i, j, 'abx'); s.stats.abxKilled++; }
    });
  }
  s.phase = 'resolve'; s.phaseT = 0;
}

/** Skip the turn: the announced attack is cancelled (costs a token). The blob still regrows and the effort is still spent. */
export function skipTurn(s: State): boolean {
  if (s.status !== 'run' || s.phase !== 'plan' || s.skips <= 0) return false;
  s.skips--; s.stats.skipsUsed++; s.skipped = true;
  applyExert(s);
  s.ann = { phages: [], immune: [], abx: null };
  s.events?.push({ kind: 'skip', x: 0, y: 0 });
  startRegrow(s);
  return true;
}

function startRegrow(s: State): void {
  s.phase = 'regrow'; s.phaseT = 0;
  // colour switches: small microcolonies of the colour you are short of
  const share = [0, 0, 0]; let n = 0;
  eachCell(s, (c) => { share[c.c]++; n++; });
  const w = share.map((v) => 1 / (v / Math.max(1, n) + 0.08));
  const cellsList: [number, number][] = [];
  eachCell(s, (_, i, j) => { cellsList.push([i, j]); });
  for (let m = 0; m < B.turns.mutants && cellsList.length; m++) {
    const [ci, cj] = cellsList[Math.floor(rand(s) * cellsList.length)];
    const here = cellAt(s, ci, cj)!;
    const ww = w.map((v, k) => (k === here.c ? 0 : v));
    let x = rand(s) * (ww[0] + ww[1] + ww[2]), pick = (here.c + 1) % 3;
    for (let k = 0; k < 3; k++) { x -= ww[k]; if (x <= 0) { pick = k; break; } }
    const rad = B.turns.mutantRadius[0] + rand(s) * (B.turns.mutantRadius[1] - B.turns.mutantRadius[0]);
    for (let dj = -3; dj <= 3; dj++) for (let di = -3; di <= 3; di++) {
      if (di * di + dj * dj > rad * rad) continue;
      const nb = cellAt(s, ci + di, cj + dj);
      if (nb && nb.inf === 0) nb.c = pick;
    }
    s.stats.flips++;
  }
}

function advanceSection(s: State): void {
  const sec = s.section;
  sec.left--;
  if (sec.left > 0) return;
  const pick = (r: number[]) => randInt(s, r[0], r[1]);
  const mk = (kind: Section['kind'], left: number, intensity: number): Section => ({ kind, left, total: left, intensity, angle: sec.angle, half: sec.half });
  const grow = 1 + B.section.growth * s.turn;
  if (sec.kind === 'quiet') s.section = { ...mk('pre', pick(B.section.pre), B.section.intensity.pre * grow), angle: rand(s) * TAU, half: randRange(s, B.section.half[0], B.section.half[1]) };
  else if (sec.kind === 'pre') s.section = mk('flare', pick(B.section.flare), B.section.intensity.flare * grow);
  else if (sec.kind === 'flare') s.section = mk('after', pick(B.section.after), B.section.intensity.after * grow);
  else s.section = mk('quiet', pick(B.section.quiet), 0);
}

function endTurn(s: State): void {
  // inflammation: the section that was active this turn heats its arc; everything relaxes toward the base
  const sec = s.section, S = B.wallSectors;
  s.wall = s.wall.map((w, j) => {
    let v = w + (B.wall.base - w) * B.wall.decay;
    if (sec.kind !== 'quiet' && Math.abs(angDiff(sec.angle, ((j + 0.5) / S) * TAU)) <= sec.half + TAU / S / 2) v += sec.intensity * B.section.heat;
    return Math.max(0, Math.min(1, v));
  });
  s.inflammation = inflammationOf(s.wall);
  advanceSection(s);
  // mucus bloom countdown
  if (s.mucusTurns > 0) { s.mucusTurns--; if (s.mucusTurns === 0) s.mucusCd = B.mucus.cooldown; } else if (s.mucusCd > 0) s.mucusCd--;
  // parries earn skips
  if (!s.skipped && s.ann.phages.length > 0 && s.turnHits === 0) {
    s.perfects++; s.streak++; s.bestStreak = Math.max(s.bestStreak, s.streak);
    s.skips = Math.min(B.turns.maxSkips, s.skips + 1);
    s.events?.push({ kind: 'perfect', x: 0, y: 0 });
  } else if (!s.skipped) s.streak = 0;

  if (count(s) < B.lose.minCells) { s.status = 'lost'; s.reason = 'the blob collapsed'; return; }
  if (s.inflammation >= B.overload) { s.status = 'lost'; s.reason = 'inflammation overload'; return; }
  if (s.turn >= B.turns.toWin) { s.status = 'won'; s.reason = 'survived'; return; }
  beginTurn(s);
}

/** Advances the clock. In the plan phase only the timer runs; resolve and regrow run the pixel simulation. */
export function step(s: State, dt: number = B.dt): void {
  if (s.status !== 'run') return;
  if (s.phase === 'plan') { s.timer -= dt; if (s.timer <= 0) release(s); return; }
  s.t += dt; s.phaseT += dt;

  if (s.phase === 'resolve') {
    // phages fly in and hit the first pixel on their path
    const alive: typeof s.phages = [];
    for (const p of s.phages) {
      const r0 = p.r; p.r -= B.phage.speed * dt;
      const psi = p.angle - s.theta;
      let done = false;
      for (let rr = r0; rr > p.r && !done; rr -= 0.25) {
        const x = Math.round(rr * Math.cos(psi)), y = Math.round(rr * Math.sin(psi));
        const c = cellAt(s, x, y);
        if (!c) continue;
        done = true;
        if (s.mucusTurns > 0) { s.stats.blocked++; s.events?.push({ kind: 'mucus', x, y }); }
        else if (c.inf > 0) { /* wasted on an already infected pixel */ }
        else if (p.mask & (1 << c.c)) { c.inf = B.phage.infectTime; c.ph = p.mask; c.gen = 0; s.stats.hits++; s.turnHits++; s.events?.push({ kind: 'infect', x, y, mask: p.mask, c: c.c }); }
        else { s.stats.deflected++; s.events?.push({ kind: 'deflect', x, y, mask: p.mask, c: c.c }); }
      }
      if (!done && p.r > 0) alive.push(p);
    }
    s.phages = alive;
    // immune cells: bite the first pixel they meet (small chew), unless it evades or mucus stops them
    const aliveI: typeof s.immune = [];
    for (const m of s.immune) {
      const r0 = m.r; m.r -= B.immune.speed * dt;
      const psi = m.angle - s.theta;
      let done = false;
      for (let rr = r0; rr > m.r && !done; rr -= 0.25) {
        const x = Math.round(rr * Math.cos(psi)), y = Math.round(rr * Math.sin(psi));
        const c = cellAt(s, x, y);
        if (!c) continue;
        done = true;
        if (s.mucusTurns > 0) { s.stats.blocked++; s.events?.push({ kind: 'mucus', x, y }); }
        else if (rand(s) < COLOURS[c.c].evade * B.immune.evadeFactor) { s.stats.immuneEvaded++; s.events?.push({ kind: 'evade', x, y, c: c.c }); }
        else {
          kill(s, x, y, 'immune'); s.stats.immuneKilled++; s.turnBites++;
          for (const [di, dj] of NEIGH) if (cellAt(s, x + di, y + dj) && rand(s) < B.immune.bite) { kill(s, x + di, y + dj, 'immune'); s.stats.immuneKilled++; }
        }
      }
      if (!done && m.r > 0) aliveI.push(m);
    }
    s.immune = aliveI;
    // infection timers, lysis and the burst through same-colour neighbours
    const lysing: { i: number; j: number; c: Cell }[] = [];
    eachCell(s, (c, i, j) => { if (c.inf > 0) { c.inf -= dt; if (c.inf <= 0) lysing.push({ i, j, c }); } });
    for (const { i, j, c } of lysing) {
      kill(s, i, j, 'lysis', c.ph); s.stats.lysed++;
      const sec = sectorOfAngle(worldAngle(s, i, j), B.wallSectors);
      s.wall[sec] = Math.min(1, s.wall[sec] + B.wall.lysisPulse);
      const p0 = B.phage.burst[Math.min(c.gen, B.phage.burst.length - 1)];
      for (const [di, dj] of NEIGH) {
        const n = cellAt(s, i + di, j + dj);
        if (!n || n.inf > 0 || !(c.ph & (1 << n.c))) continue;
        if (rand(s) < p0 * (1 - B.phage.resistFactor * COLOURS[n.c].resist)) { n.inf = B.phage.infectTime; n.ph = c.ph; n.gen = c.gen + 1; }
      }
    }
    let infected = false;
    eachCell(s, (c) => { if (c.inf > 0) infected = true; });
    if (!s.phages.length && !s.immune.length && !infected && s.phaseT > 0.4) startRegrow(s);
    else if (s.phaseT > 14) startRegrow(s); // safety net
    return;
  }

  // regrow: pixels divide into the holes, fast (the turn's quiet moment)
  const n0 = count(s);
  const room = Math.max(0, 1 - n0 / B.capacity);
  const parents: [number, number][] = [];
  eachCell(s, (c, i, j) => {
    if (c.inf > 0) return;
    if (rand(s) < 1 - Math.exp(-dt * B.turns.regrowBoost * (COLOURS[c.c].growth / B.growthInterval) * room)) parents.push([i, j]);
  });
  for (const [i, j] of parents) {
    const p = s.cells[idx(i, j)];
    if (!p) continue;
    const empties = NEIGH.map(([di, dj]) => [i + di, j + dj] as [number, number]).filter(([a, b]) => inside(a, b) && !s.cells[idx(a, b)]);
    if (!empties.length) continue;
    const [ei, ej] = empties[Math.floor(rand(s) * empties.length)];
    const votes = [0, 0, 0]; votes[p.c] += B.parentWeight;
    for (const [di, dj] of NEIGH) { const nb = cellAt(s, ei + di, ej + dj); if (nb && nb !== p && nb.inf === 0) votes[nb.c] += 1; }
    let x = rand(s) * (votes[0] + votes[1] + votes[2]), pick = p.c;
    for (let c = 0; c < 3; c++) { x -= votes[c]; if (x <= 0) { pick = c; break; } }
    s.cells[idx(ei, ej)] = newCell(pick);
    s.stats.births++;
  }
  if (s.phaseT >= B.turns.regrowSecs) endTurn(s);
}
