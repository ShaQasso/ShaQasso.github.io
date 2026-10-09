import balance from '../data/balance.json';
import { rand } from './rng';
import { NEIGH, R, TAU, W, angDiff, cellAt, count, eachCell, exposed, idx, inside, sectorOfAngle, wrap, worldAngle } from './geometry';
import { buildSchedule } from './director';
import type { Cell, State } from './types';

const B = balance;
export const COLOURS = B.colours;

const newCell = (c: number, cd: number): Cell => ({ c, inf: 0, ph: 0, gen: 0, cd });

export function createState(seed: number): State {
  const s: State = {
    t: 0, rng: seed >>> 0, cells: new Array(W * W).fill(null), theta: 0, omega: 0, cmd: 0, phages: [], immune: [],
    spawning: true, immuneSpawning: true, mutating: true, phageAcc: 0, immuneAcc: Array(B.wall.sectors).fill(0), abx: [], flares: [], gaps: [], wall: Array(B.wall.sectors).fill(B.wall.base), inflammation: B.wall.base, health: B.health.start,
    mucus: 0, secreteCd: 0, endT: 0, status: 'run', reason: '',
    stats: { lysed: 0, hits: 0, deflected: 0, blocked: 0, flips: 0, births: 0, abxKilled: 0, immuneKilled: 0, immuneEvaded: 0, secretes: 0, starved: 0 },
  };
  // a disc of blocks made of clonal patches: a seed per colour, everyone takes the colour of the nearest seed
  const spots: [number, number][] = [];
  for (let j = -R; j <= R; j++) for (let i = -R; i <= R; i++) if (i * i + j * j <= B.startRadius ** 2) spots.push([i, j]);
  const seeds: { i: number; j: number; c: number }[] = [];
  const pool = spots.slice();
  for (let k = 0; k < B.seedPatches; k++) {
    const [i, j] = pool.splice(Math.floor(rand(s) * pool.length), 1)[0];
    seeds.push({ i, j, c: k % COLOURS.length });
  }
  for (const [i, j] of spots) {
    let best = seeds[0], bd = Infinity;
    for (const sd of seeds) { const d = (sd.i - i) ** 2 + (sd.j - j) ** 2; if (d < bd) { bd = d; best = sd; } }
    s.cells[idx(i, j)] = newCell(best.c, B.growthInterval * (0.3 + rand(s)));
  }
  s.theta = rand(s) * TAU;
  buildSchedule(s);
  return s;
}

// ---- player actions ---------------------------------------------------------
export function setRotation(s: State, cmd: number): void { s.cmd = Math.max(-1, Math.min(1, cmd)); }

/** Shape of the outside of the blob: this decides how good the shield and the cooling are. */
export function surfaceStats(s: State) {
  const share = [0, 0, 0];
  let n = 0, mucus = 0, evadeAll = 0, total = 0;
  eachCell(s, (c, i, j) => {
    total++; evadeAll += COLOURS[c.c].evade;
    if (exposed(s, i, j)) { n++; share[c.c]++; mucus += COLOURS[c.c].mucus; }
  });
  const uniform = n ? Math.max(...share) / n : 0; // 1/3 .. 1
  return {
    exposed: n, total,
    mucusPower: n ? mucus / n : 0,
    uniformity: n ? Math.max(0, (uniform - 1 / 3) / (2 / 3)) : 0,
    evadePower: total ? evadeAll / total : 0,
    share: share.map((v) => (n ? v / n : 0)),
  };
}

export function secreteReady(s: State): boolean { return s.status === 'run' && s.secreteCd <= 0; }

/** Space: mucus shield and cooling in one go, then a shared cooldown. */
export function secrete(s: State): boolean {
  if (!secreteReady(s)) return false;
  const st = surfaceStats(s);
  s.mucus = B.secrete.baseMucus + B.secrete.mucusGain * st.mucusPower * (0.4 + 0.6 * st.uniformity);
  const cool = B.secrete.baseCool + B.secrete.coolGain * st.evadePower;
  s.wall = s.wall.map((w) => Math.max(0, w - cool));
  s.secreteCd = B.secrete.cooldown;
  s.stats.secretes++;
  s.events?.push({ kind: 'secrete', x: 0, y: 0 });
  return true;
}

// ---- queries ----------------------------------------------------------------
export function warnings(s: State) {
  return {
    abx: s.abx.filter((a) => !a.fired && s.t >= a.t0 - B.director.warn),
    flares: s.flares.filter((f) => s.t >= f.t0 - B.director.warn && s.t < f.t0),
  };
}
export const activeFlares = (s: State) => s.flares.filter((f) => s.t >= f.t0 && s.t < f.t0 + f.dur);

export function diversity(s: State): number {
  const k = [0, 0, 0]; let n = 0;
  eachCell(s, (c) => { k[c.c]++; n++; });
  if (!n) return 0;
  let h = 0;
  for (const v of k) if (v) h -= (v / n) * Math.log(v / n);
  return h / Math.log(3);
}

// ---- helpers ----------------------------------------------------------------
function kill(s: State, i: number, j: number, why: 'abx' | 'immune' | 'starve' | 'lysis', mask?: number): void {
  s.cells[idx(i, j)] = null;
  s.events?.push({ kind: why, x: i, y: j, mask });
}

function pickColour(s: State, parent: Cell, ei: number, ej: number): number {
  const votes = [0, 0, 0];
  votes[parent.c] += B.parentWeight;
  for (const [di, dj] of NEIGH) {
    const n = cellAt(s, ei + di, ej + dj);
    if (n && n !== parent && n.inf === 0) votes[n.c] += 1;
  }
  let x = rand(s) * (votes[0] + votes[1] + votes[2]);
  for (let c = 0; c < 3; c++) { x -= votes[c]; if (x <= 0) return c; }
  return parent.c;
}

/** Distance (in blocks) from the open surface, for each occupied cell. */
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

// ---- the step ---------------------------------------------------------------
export function step(s: State, dt: number = B.dt): void {
  if (s.status !== 'run') return;
  s.t += dt;
  const n0 = count(s);

  // whole-blob rotation: weight, momentum, a speed cap
  s.omega += (s.cmd * B.rotate.accel - B.rotate.friction * s.omega) * dt;
  s.omega = Math.max(-B.rotate.maxOmega, Math.min(B.rotate.maxOmega, s.omega));
  s.theta = wrap(s.theta + s.omega * dt);
  s.mucus = Math.max(0, s.mucus - dt);
  s.secreteCd = Math.max(0, s.secreteCd - dt);

  // phages arrive at random from every side (none during calm gaps), more of them each act
  const inGap = s.gaps.some((g) => s.t >= g.start && s.t < g.end);
  if (s.spawning && !inGap) {
    const act = Math.min(B.director.acts - 1, Math.floor(s.t / (B.director.actLen + B.director.gapLen)));
    s.phageAcc += B.spawn.base * Math.pow(B.spawn.growth, act) * B.spawn.rateScale * dt;
    while (s.phageAcc >= 1) {
      s.phageAcc -= 1;
      let mask = 1 << Math.floor(rand(s) * 3);
      if (act >= B.spawn.twoColourAct && rand(s) < B.spawn.twoColourProb) mask |= 1 << Math.floor(rand(s) * 3);
      s.phages.push({ r: B.phage.spawnR, angle: rand(s) * TAU, mask });
    }
  }
  // the inflamed wall fires immune cells at the blob (none while it is calm)
  if (s.immuneSpawning) {
    for (let j = 0; j < B.wall.sectors; j++) {
      s.immuneAcc[j] += B.immune.rate * Math.max(0, s.wall[j] - B.immune.threshold) * dt;
      while (s.immuneAcc[j] >= 1) {
        s.immuneAcc[j] -= 1;
        s.immune.push({ r: B.wallR, angle: ((j + rand(s)) / B.wall.sectors) * TAU });
      }
    }
  }

  // antibiotics: a telegraphed arc over the outer layers, colour-blind
  for (const a of s.abx) {
    if (a.fired || s.t < a.t0) continue;
    a.fired = true;
    const depth = depthMap(s);
    eachCell(s, (c, i, j) => {
      const d = depth.get(idx(i, j)) ?? 99;
      if (d > B.abx.depth || Math.abs(angDiff(a.angle, worldAngle(s, i, j))) > a.half) return;
      if (rand(s) < B.abx.kill * (s.mucus > 0 ? B.secrete.mucusAbxFactor : 1)) { kill(s, i, j, 'abx'); s.stats.abxKilled++; }
    });
    s.events?.push({ kind: 'abx', x: Math.cos(a.angle) * R, y: Math.sin(a.angle) * R });
  }

  // phages fly in and hit the first block on their path
  const alive: typeof s.phages = [];
  for (const p of s.phages) {
    const r0 = p.r;
    p.r -= B.phage.speed * dt;
    const psi = p.angle - s.theta;
    let done = false;
    for (let rr = r0; rr > p.r && !done; rr -= 0.25) {
      const x = Math.round(rr * Math.cos(psi)), y = Math.round(rr * Math.sin(psi));
      const c = cellAt(s, x, y);
      if (!c) continue;
      done = true;
      if (s.mucus > 0) { s.stats.blocked++; s.events?.push({ kind: 'mucus', x, y }); }
      else if (c.inf > 0) { /* wasted on an already infected block */ }
      else if (p.mask & (1 << c.c)) { c.inf = B.phage.infectTime; c.ph = p.mask; c.gen = 0; s.stats.hits++; s.events?.push({ kind: 'infect', x, y, mask: p.mask, c: c.c }); }
      else { s.stats.deflected++; s.events?.push({ kind: 'deflect', x, y, mask: p.mask, c: c.c }); }
    }
    if (!done && p.r > 0) alive.push(p);
  }
  s.phages = alive;

  // immune cells: they bite the first block they meet (a small chew), unless it evades or mucus stops them
  const aliveI: typeof s.immune = [];
  for (const m of s.immune) {
    const r0 = m.r;
    m.r -= B.immune.speed * dt;
    const psi = m.angle - s.theta;
    let done = false;
    for (let rr = r0; rr > m.r && !done; rr -= 0.25) {
      const x = Math.round(rr * Math.cos(psi)), y = Math.round(rr * Math.sin(psi));
      const c = cellAt(s, x, y);
      if (!c) continue;
      done = true;
      if (s.mucus > 0) { s.stats.blocked++; s.events?.push({ kind: 'mucus', x, y }); }
      else if (rand(s) < COLOURS[c.c].evade * B.immune.evadeFactor) { s.stats.immuneEvaded++; s.events?.push({ kind: 'evade', x, y, c: c.c }); }
      else {
        kill(s, x, y, 'immune'); s.stats.immuneKilled++;
        for (const [di, dj] of NEIGH) if (cellAt(s, x + di, y + dj) && rand(s) < B.immune.bite) { kill(s, x + di, y + dj, 'immune'); s.stats.immuneKilled++; }
      }
    }
    if (!done && m.r > 0) aliveI.push(m);
  }
  s.immune = aliveI;

  // lysis and cascades: neighbours of the targeted colour, odds fading each generation, damped by phage-resistant capsules
  const lysing: { i: number; j: number; c: Cell }[] = [];
  eachCell(s, (c, i, j) => { if (c.inf > 0) { c.inf -= dt; if (c.inf <= 0) lysing.push({ i, j, c }); } });
  for (const { i, j, c } of lysing) {
    kill(s, i, j, 'lysis', c.ph);
    s.stats.lysed++;
    const sec = sectorOfAngle(worldAngle(s, i, j), B.wall.sectors);
    s.wall[sec] = Math.min(1, s.wall[sec] + B.wall.lysisPulse);
    const p0 = B.phage.burst[Math.min(c.gen, B.phage.burst.length - 1)];
    for (const [di, dj] of NEIGH) {
      const n = cellAt(s, i + di, j + dj);
      if (!n || n.inf > 0 || !(c.ph & (1 << n.c))) continue;
      if (rand(s) < p0 * (1 - B.phage.resistFactor * COLOURS[n.c].resist)) { n.inf = B.phage.infectTime; n.ph = c.ph; n.gen = c.gen + 1; }
    }
  }

  // flips (rare, random), growth (logistic: capacity), starvation
  const K = B.capacity;
  const room = Math.max(0, 1 - n0 / K);
  const parents: [number, number][] = [];
  const share = [0, 0, 0];
  eachCell(s, (c) => { share[c.c]++; });
  const rareW = share.map((v) => 1 / (v / Math.max(1, n0) + B.flipRareBias)); // flips favour the colours you are short of
  eachCell(s, (c, i, j) => {
    if (c.inf > 0) return;
    if (s.mutating && rand(s) < 1 - Math.exp(-B.flip * (1 + s.inflammation) * dt)) {
      // a phase switch spreads as a small microcolony of the new colour (favouring the colour you are short of), not a lone speck
      const w = rareW.map((v, k) => (k === c.c ? 0 : v));
      let x = rand(s) * (w[0] + w[1] + w[2]);
      let pick = (c.c + 1) % 3;
      for (let k = 0; k < 3; k++) { x -= w[k]; if (x <= 0) { pick = k; break; } }
      const rad = B.flipRadius[0] + rand(s) * (B.flipRadius[1] - B.flipRadius[0]);
      for (let dj = -3; dj <= 3; dj++) for (let di = -3; di <= 3; di++) {
        if (di * di + dj * dj > rad * rad) continue;
        const nb = cellAt(s, i + di, j + dj);
        if (nb && nb.inf === 0) nb.c = pick;
      }
      s.stats.flips++;
    }
    if (rand(s) < 1 - Math.exp(-dt * (COLOURS[c.c].growth / B.growthInterval) * room)) parents.push([i, j]);
  });
  for (const [i, j] of parents) {
    const p = s.cells[idx(i, j)];
    if (!p || p.inf > 0) continue;
    const empties = NEIGH.map(([di, dj]) => [i + di, j + dj] as [number, number]).filter(([a, b]) => inside(a, b) && !s.cells[idx(a, b)]);
    if (!empties.length) continue;
    const [ei, ej] = empties[Math.floor(rand(s) * empties.length)];
    s.cells[idx(ei, ej)] = newCell(pickColour(s, p, ei, ej), B.growthInterval);
    s.stats.births++;
  }
  if (n0 > K && rand(s) < B.starve * (n0 - K) * dt) {
    const outs: [number, number][] = [];
    eachCell(s, (_, i, j) => { if (exposed(s, i, j)) outs.push([i, j]); });
    if (outs.length) { const [i, j] = outs[Math.floor(rand(s) * outs.length)]; kill(s, i, j, 'starve'); s.stats.starved++; }
  }

  // inflammation on the gut wall (world sectors): flares heat it; the immune system kills exposed blocks in hot sectors
  const S = B.wall.sectors;
  const heat = new Array<number>(S).fill(0);
  for (const f of activeFlares(s)) {
    for (let j = 0; j < S; j++) if (Math.abs(angDiff(f.angle, ((j + 0.5) / S) * TAU)) <= f.half + TAU / S / 2) heat[j] += f.power * B.wall.flareHeat;
  }
  s.wall = s.wall.map((w, j) => {
    const nb = (s.wall[(j + 1) % S] + s.wall[(j + S - 1) % S]) / 2;
    return Math.max(0, Math.min(1, w + (((B.wall.base + heat[j]) - w) * B.wall.relax + (nb - w) * B.wall.spread) * dt));
  });
  s.inflammation = Math.pow(s.wall.reduce((a, w) => a + w ** 3, 0) / S, 1 / 3);
  s.health += B.health.weight * (B.health.center - s.inflammation) * dt;
  if (s.gaps.some((g) => s.t >= g.start && s.t < g.end)) s.health += B.health.gapHeal * dt;
  s.health = Math.max(0, Math.min(100, s.health));

  // end conditions
  if (count(s) < B.lose.minCells) { s.status = 'lost'; s.reason = 'the blob collapsed'; }
  else if (s.health <= 0) { s.status = 'lost'; s.reason = 'immune balance lost'; }
  else if (s.t >= s.endT) { s.status = 'won'; s.reason = 'survived'; }
}
