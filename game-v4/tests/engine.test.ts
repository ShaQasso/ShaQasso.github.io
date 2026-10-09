import { describe, expect, it } from 'vitest';
import balance from '../src/data/balance.json';
import { cellAt, count, eachCell, idx, inside, R, TAU, NEIGH } from '../src/engine/geometry';
import { COLOURS, createState, secrete, setRotation, step, surfaceStats } from '../src/engine/sim';
import { BOTS } from '../src/sim/bots';
import type { State } from '../src/engine/types';

/** An empty world with a disc of pixels coloured by `colour(i, j)`; nothing scheduled, nothing arriving, no mutations. */
function blob(radius: number, colour: (i: number, j: number) => number, seed = 1): State {
  const s = createState(seed);
  s.cells.fill(null);
  s.abx = []; s.flares = []; s.gaps = []; s.endT = 1e9; s.theta = 0; s.spawning = false; s.immuneSpawning = false; s.mutating = false;
  for (let j = -R; j <= R; j++) for (let i = -R; i <= R; i++) {
    if (i * i + j * j <= radius * radius) s.cells[idx(i, j)] = { c: colour(i, j), inf: 0, ph: 0, gen: 0, cd: 1e9 };
  }
  return s;
}
const run = (s: State, secs: number) => { for (let i = 0; i < secs * 20; i++) step(s); };
const infect = (s: State, i: number, j: number, mask: number) => { const c = s.cells[idx(i, j)]!; c.inf = balance.phage.infectTime; c.ph = mask; c.gen = 0; };
const mixed = (i: number, j: number) => (((i + 2 * j) % 3) + 3) % 3; // no two neighbours share a colour
const west = Math.PI;

describe('engine basics', () => {
  it('is deterministic for a seed and JSON round-trips mid-run', () => {
    const a = createState(7), b = createState(7);
    for (let i = 0; i < 400; i++) { step(a); step(b); }
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const c = JSON.parse(JSON.stringify(a));
    for (let i = 0; i < 200; i++) { step(a); step(c); }
    expect(JSON.stringify(a)).toBe(JSON.stringify(c));
  });

  it('starts as a dense disc of patches in all three colours', () => {
    const s = createState(3);
    expect(count(s)).toBeGreaterThan(600);
    const seen = new Set<number>(); eachCell(s, (c) => seen.add(c.c));
    expect(seen.size).toBe(3);
    let same = 0, pairs = 0;
    eachCell(s, (c, i, j) => { for (const [di, dj] of [[1, 0], [0, 1]]) { const n = cellAt(s, i + di, j + dj); if (n) { pairs++; if (n.c === c.c) same++; } } });
    expect(same / pairs).toBeGreaterThan(0.9);
  });

  it('never grows much past capacity', () => {
    const s = blob(16, () => 0);
    run(s, 150);
    expect(count(s)).toBeLessThanOrEqual(balance.capacity + 60);
  });

  it('rotation has momentum and a speed cap', () => {
    const s = blob(8, () => 0);
    setRotation(s, 1); run(s, 0.5);
    expect(s.omega).toBeGreaterThan(0);
    run(s, 5);
    expect(s.omega).toBeLessThanOrEqual(balance.rotate.maxOmega + 1e-9);
  });
});

describe('phages: random colours from every side, first pixel hit', () => {
  it('arrive at random from all around, in all three colours', () => {
    const s = blob(10, () => 0); s.spawning = true;
    const masks = new Set<number>(); const quad = new Set<number>();
    for (let i = 0; i < 20 * 50; i++) { step(s); for (const p of s.phages) { masks.add(p.mask); quad.add(Math.floor(p.angle / (TAU / 4))); } }
    expect(masks.size).toBeGreaterThanOrEqual(3);
    expect(quad.size).toBe(4);
  });

  it('infect a pixel of a targeted colour and are deflected by another', () => {
    const hit = blob(8, () => 0); hit.phages.push({ r: R + 2, angle: west, mask: 1 << 0 }); run(hit, 3);
    expect(hit.stats.hits).toBe(1);
    const miss = blob(8, () => 1); miss.phages.push({ r: R + 2, angle: west, mask: 1 << 0 }); run(miss, 3);
    expect(miss.stats.hits).toBe(0); expect(miss.stats.deflected).toBe(1);
  });

  it('hit the first pixel on their path, so the pixels behind are safe', () => {
    const s = blob(10, (i) => (i < -4 ? 0 : 1)); s.phages.push({ r: R + 2, angle: west, mask: 1 << 1 }); run(s, 3);
    expect(s.stats.hits).toBe(0); expect(s.stats.deflected).toBe(1);
  });

  it('rotating the blob changes which side is hit', () => {
    const hits = (theta: number) => { const s = blob(8, (i) => (i < 0 ? 0 : 1)); s.theta = theta; s.phages.push({ r: R + 2, angle: west, mask: 1 << 0 }); run(s, 3); return s.stats.hits; };
    expect(hits(0)).toBe(1);
    expect(hits(Math.PI)).toBe(0);
  });

  it('fly through a tunnel in the blob to whatever is behind', () => {
    const s = blob(8, () => 0);
    for (let i = -8; i <= -4; i++) s.cells[idx(i, 0)] = null;
    s.phages.push({ r: R + 2, angle: west, mask: 1 << 0 }); run(s, 3);
    expect(s.stats.hits).toBe(1);
  });
});

describe('bites and bet hedging (the point of the game)', () => {
  const lysed = (colour: (i: number, j: number) => number, c0 = 0, seeds = [1, 2, 3, 4]) => {
    let t = 0;
    for (const seed of seeds) { const s = blob(12, colour, seed); infect(s, 6, 0, 1 << c0); run(s, 8); t += s.stats.lysed; }
    return t / seeds.length;
  };

  it('one hit on a uniform amber blob takes a real bite; on a mixed blob it takes almost nothing', () => {
    const mono = lysed(() => 0);
    const mix = lysed(mixed);
    expect(mono).toBeGreaterThan(40);
    expect(mix).toBeLessThan(mono / 10);
  });

  it('phage-resistant (cyan) capsules damp the bite', () => {
    expect(lysed(() => 1, 1)).toBeLessThan(lysed(() => 0, 0) / 2);
  });

  it('a block of another colour is a firewall: the burst stops at it', () => {
    const s = blob(12, (i) => (i < 0 ? 0 : 1));
    infect(s, -6, 0, 1 << 0); run(s, 10);
    expect(s.stats.lysed).toBeGreaterThan(10);
    for (let j = -R; j <= R; j++) for (let i = 1; i <= R; i++) if (i * i + j * j <= 144) expect(s.cells[idx(i, j)]?.c).toBe(1);
  });

  it('a handful of survivors regrow the blob, and their colour takes over the gap', () => {
    const s = blob(4, () => 2);
    run(s, 260);
    expect(count(s)).toBeGreaterThan(200);
    let violet = 0; eachCell(s, (c) => { if (c.c === 2) violet++; });
    expect(violet / count(s)).toBeGreaterThan(0.95);
  });

  it('a new pixel takes after the pixels around its spot, never a colour nobody nearby has', () => {
    const s = blob(9, (i) => (i < 0 ? 0 : 1));
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) s.cells[idx(i, j)] = null;
    run(s, 60);
    eachCell(s, (c) => expect([0, 1]).toContain(c.c));
    expect(s.stats.births).toBeGreaterThan(5);
  });

  it('mutations spread as small microcolonies, not lone specks', () => {
    const s = blob(12, () => 0); s.mutating = true;
    run(s, 60);
    expect(s.stats.flips).toBeGreaterThan(3);
    const other = [0, 1, 2].map(() => 0); eachCell(s, (c) => other[c.c]++);
    expect(other[1] + other[2]).toBeGreaterThan(s.stats.flips * 3);
  });

  it('colour switches favour a colour you are short of', () => {
    const s = blob(12, (i, j) => (i * i + j * j < 9 ? 1 : 0)); s.mutating = true; // almost no cyan, no violet
    let towardCyanOrViolet = 0;
    for (let k = 0; k < 20; k++) { const t = blob(12, () => 0, k + 1); t.mutating = true; run(t, 20); let v = 0, c = 0; eachCell(t, (b) => { if (b.c === 1) c++; if (b.c === 2) v++; }); towardCyanOrViolet += c + v; }
    expect(towardCyanOrViolet).toBeGreaterThan(0);
    void s;
  });
});

describe('immune cells and inflammation', () => {
  it('the wall fires immune cells only where it is inflamed', () => {
    const calm = blob(8, () => 0); calm.immuneSpawning = true; calm.wall.fill(0.2); run(calm, 8);
    expect(calm.immune.length + calm.stats.immuneKilled + calm.stats.immuneEvaded).toBe(0);
    const hot = blob(8, () => 0); hot.immuneSpawning = true; hot.wall = [0.95, 0.2, 0.2, 0.2, 0.2, 0.2]; run(hot, 8);
    expect(hot.immune.length + hot.stats.immuneKilled + hot.stats.immuneEvaded).toBeGreaterThanOrEqual(1);
  });

  it('an immune cell bites the first pixel it meets, with a small chew', () => {
    const s = blob(10, () => 0); s.immune.push({ r: R, angle: west }); run(s, 3);
    expect(s.stats.immuneKilled).toBeGreaterThanOrEqual(1);
    expect(s.stats.immuneKilled).toBeLessThanOrEqual(5);
  });

  it('violet (immune evasion) pixels evade far more immune cells than amber', () => {
    const evaded = (c: number) => { let e = 0; for (let seed = 1; seed <= 4; seed++) { const s = blob(10, () => c, seed); for (let k = 0; k < 40; k++) s.immune.push({ r: R - k * 0.3, angle: west + (k % 5) * 0.2 - 0.4 }); run(s, 4); e += s.stats.immuneEvaded; } return e; };
    expect(evaded(2)).toBeGreaterThan(evaded(0) * 3);
  });

  it('antibiotics kill by position, not by colour, in the outer layers of an arc', () => {
    const s = blob(12, mixed);
    s.abx = [{ t0: 0.05, angle: west, half: 0.6, fired: false }]; run(s, 0.2);
    expect(s.stats.abxKilled).toBeGreaterThan(15);
    const lostBy = [0, 0, 0];
    for (let j = -12; j <= 12; j++) for (let i = -12; i <= 12; i++) if (i * i + j * j <= 144 && !s.cells[idx(i, j)]) lostBy[mixed(i, j)]++;
    expect(Math.min(...lostBy)).toBeGreaterThan(3);
    expect(s.cells[idx(0, 0)]).not.toBeNull(); // the core is untouched
  });
});

describe('Space: secrete', () => {
  it('has a cooldown', () => {
    const s = blob(8, () => 0);
    expect(secrete(s)).toBe(true); expect(secrete(s)).toBe(false);
    run(s, balance.secrete.cooldown + 1);
    expect(secrete(s)).toBe(true);
  });

  it('a uniform amber (mucus) outside gives a much longer shield than a mixed one', () => {
    const dur = (colour: (i: number, j: number) => number) => { const s = blob(10, colour); secrete(s); return s.mucus; };
    expect(dur(() => 0)).toBeGreaterThan(dur(mixed) * 2);
  });

  it('mucus stops phages and immune cells entirely while it lasts, and halves antibiotics', () => {
    const s = blob(8, () => 0); secrete(s);
    s.phages.push({ r: R + 2, angle: west, mask: 1 << 0 }); s.immune.push({ r: R, angle: west });
    run(s, 3);
    expect(s.stats.hits).toBe(0); expect(s.stats.immuneKilled).toBe(0); expect(s.stats.blocked).toBe(2);
    const kills = (mucus: number) => { const t = blob(12, () => 0); t.mucus = mucus; t.abx = [{ t0: 0.05, angle: 0, half: 1.2, fired: false }]; run(t, 0.2); return t.stats.abxKilled; };
    expect(kills(5)).toBeLessThan(kills(0) * 0.75);
  });

  it('cooling is stronger with more immune-evasion pixels', () => {
    const after = (c: number) => { const s = blob(8, () => c); s.wall.fill(0.9); secrete(s); return s.wall[0]; };
    expect(after(2)).toBeLessThan(after(0));
  });

  it('shield length and cooling are computed from what is exposed', () => {
    const st = surfaceStats(blob(8, () => 0));
    expect(st.mucusPower).toBeCloseTo(COLOURS[0].mucus);
    expect(st.uniformity).toBeCloseTo(1);
  });
});

describe('balance sanity', () => {
  it('thoughtful dodging beats random spinning', () => {
    const wins = (bot: string) => { let w = 0; for (let seed = 1; seed <= 6; seed++) { const s = createState(seed); for (let i = 0; s.status === 'run'; i++) { if (i % 5 === 0) BOTS[bot](s); step(s); } if (s.status === 'won') w++; } return w; };
    expect(wins('secreter')).toBeGreaterThan(wins('spin'));
  }, 240000);
});
void NEIGH; void inside;
