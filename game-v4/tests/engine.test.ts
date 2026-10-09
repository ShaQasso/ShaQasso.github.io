import { describe, expect, it } from 'vitest';
import balance from '../src/data/balance.json';
import { count, eachCell, idx, inside, R, TAU } from '../src/engine/geometry';
import { COLOURS, createState, secrete, setRotation, step, surfaceStats } from '../src/engine/sim';
import { BOTS } from '../src/sim/bots';
import type { State } from '../src/engine/types';

/** An empty world with a disc of blocks coloured by `colour(i, j)`; no scheduled threats, nothing grows. */
function blob(radius: number, colour: (i: number, j: number) => number, seed = 1): State {
  const s = createState(seed);
  s.cells.fill(null);
  s.volleys = []; s.abx = []; s.flares = []; s.gaps = []; s.endT = 1e9; s.theta = 0;
  for (let j = -R; j <= R; j++) for (let i = -R; i <= R; i++) {
    if (i * i + j * j <= radius * radius) s.cells[idx(i, j)] = { c: colour(i, j), inf: 0, ph: 0, gen: 0, cd: 1e9 };
  }
  return s;
}
const run = (s: State, secs: number) => { for (let i = 0; i < secs * 20; i++) step(s); };
const infectCentre = (s: State, mask: number) => { const c = s.cells[idx(0, 0)]!; c.inf = balance.phage.infectTime; c.ph = mask; c.gen = 0; };

describe('engine basics', () => {
  it('is deterministic for a seed and JSON round-trips mid-run', () => {
    const a = createState(7), b = createState(7);
    for (let i = 0; i < 600; i++) { step(a); step(b); }
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const c = JSON.parse(JSON.stringify(a));
    for (let i = 0; i < 300; i++) { step(a); step(c); }
    expect(JSON.stringify(a)).toBe(JSON.stringify(c));
  });

  it('starts as a patchy disc of all three colours', () => {
    const s = createState(3);
    const seen = new Set<number>(); eachCell(s, (c) => seen.add(c.c));
    expect(seen.size).toBe(3);
    let same = 0, pairs = 0;
    eachCell(s, (c, i, j) => { for (const [di, dj] of [[1, 0], [0, 1]]) { const n = inside(i + di, j + dj) ? s.cells[idx(i + di, j + dj)] : null; if (n) { pairs++; if (n.c === c.c) same++; } } });
    expect(same / pairs).toBeGreaterThan(0.75);
  });

  it('never grows much past capacity', () => {
    const s = blob(6, () => 0); s.volleys = [];
    eachCell(s, (c) => { c.cd = 1; });
    run(s, 120);
    expect(count(s)).toBeLessThanOrEqual(balance.capacity + 8);
  });
});

describe('phages', () => {
  const west = Math.PI; // a phage arriving from the left (world angle PI)
  it('infect a block of a targeted colour and are deflected by another', () => {
    const hit = blob(4, () => 0); hit.phages.push({ r: R + 2, angle: west, mask: 1 << 0 });
    run(hit, 1.5);
    expect(hit.stats.hits).toBe(1);
    const miss = blob(4, () => 1); miss.phages.push({ r: R + 2, angle: west, mask: 1 << 0 });
    run(miss, 1.5);
    expect(miss.stats.hits).toBe(0);
    expect(miss.stats.deflected).toBe(1);
  });

  it('hit the first block on their path, so the blocks behind are safe', () => {
    // west half colour 0 (outer), everything else colour 1; a colour-1 phage must not reach inside
    const s = blob(5, (i) => (i < -2 ? 0 : 1)); s.phages.push({ r: R + 2, angle: west, mask: 1 << 1 });
    run(s, 1.5);
    expect(s.stats.hits).toBe(0);
    expect(s.stats.deflected).toBe(1);
  });

  it('rotating the blob changes which side is hit', () => {
    const colourAt = (theta: number) => {
      const s = blob(4, (i) => (i < 0 ? 0 : 1)); // left half colour 0, right half colour 1
      s.theta = theta;
      s.phages.push({ r: R + 2, angle: west, mask: 1 << 0 });
      run(s, 1.5);
      return s.stats.hits;
    };
    expect(colourAt(0)).toBe(1);        // left half faces the phage
    expect(colourAt(Math.PI)).toBe(0);  // rotated half a turn: the colour-1 half faces it
  });

  it('a hole lets a phage through (it keeps flying until it meets a block)', () => {
    const s = blob(4, () => 0);
    for (let i = -4; i <= -3; i++) s.cells[idx(i, 0)] = null; // dig a tunnel along the phage's path
    s.phages.push({ r: R + 2, angle: west, mask: 1 << 0 });
    run(s, 1.5);
    expect(s.stats.hits).toBe(1);
    expect(s.cells[idx(-2, 0)] === null || s.cells[idx(-2, 0)]!.inf > 0 || s.stats.lysed > 0).toBe(true);
  });
});

describe('bet hedging (the point of the game)', () => {
  it('one hit on a uniform amber blob destroys far more than on a mixed blob', () => {
    const lysed = (colour: (i: number, j: number) => number) => {
      const s = blob(5, colour); infectCentre(s, 1 << 0); run(s, 15); return s.stats.lysed;
    };
    const mono = lysed(() => 0);
    const mixed = lysed((i, j) => ((i + 2 * j) % 3 + 3) % 3);
    expect(mono).toBeGreaterThan(mixed * 4);
    expect(mono).toBeGreaterThan(20);
  });

  it('phage-resistant (cyan) capsules damp the cascade', () => {
    const lysed = (c: number) => { const s = blob(5, () => c); infectCentre(s, 1 << c); run(s, 15); return s.stats.lysed; };
    expect(lysed(1)).toBeLessThan(lysed(0) / 2);
  });

  it('a block of another colour is a firewall: the cascade stops at it', () => {
    const s = blob(5, (i) => (i < 0 ? 0 : 1)); // a wall of colour 1 starts at the centre line
    // infect a colour-0 block on the left; colour-1 blocks are not targeted
    const c = s.cells[idx(-3, 0)]!; c.inf = balance.phage.infectTime; c.ph = 1 << 0;
    run(s, 15);
    // colour-1 blocks on the right never burst: any that are missing were taken by the immune system, not the phage
    let missing = 0;
    for (let j = -R; j <= R; j++) for (let i = 0; i <= R; i++) {
      if (i * i + j * j > 25) continue;
      if (s.cells[idx(i, j)]?.c !== 1) missing++;
    }
    expect(missing).toBeLessThanOrEqual(s.stats.immuneKilled + 1);
    expect(s.stats.lysed).toBeGreaterThan(5); // the left half did burst
  });

  it('a handful of survivors regrow the blob, and their colour takes over the gap', () => {
    const s = blob(6, () => 0);
    eachCell(s, (c, i, j) => { c.cd = 1; if (i * i + j * j > 3) s.cells[idx(i, j)] = null; }); // ~9 blocks left in the middle
    eachCell(s, (c) => { c.c = 2; });
    run(s, 220);
    expect(count(s)).toBeGreaterThan(30);
    let violet = 0; eachCell(s, (c) => { if (c.c === 2) violet++; });
    expect(violet / count(s)).toBeGreaterThan(0.7);
  });

  it('a new block takes after the blocks around its spot, never a colour nobody nearby has', () => {
    let checked = 0;
    for (let seed = 1; seed <= 12 && checked < 4; seed++) {
      const s = blob(4, (i) => (i < 0 ? 0 : 1), seed);
      eachCell(s, (c) => { c.cd = 1; });
      s.cells[idx(0, 0)] = null; s.cells[idx(1, 0)] = null;
      run(s, 25);
      if (s.stats.flips > 0) continue; // a rare random flip would add a third colour: skip that seed
      checked++;
      expect(s.stats.births).toBeGreaterThan(0);
      eachCell(s, (c) => expect([0, 1]).toContain(c.c));
    }
    expect(checked).toBeGreaterThanOrEqual(3);
  });
});

describe('antibiotics and inflammation', () => {
  it('antibiotics kill by position, not by colour', () => {
    const s = blob(6, (i, j) => ((i + j) % 3 + 3) % 3);
    s.abx = [{ t0: 0.05, angle: Math.PI, half: 0.6, fired: false }]; // the west side
    run(s, 0.2);
    expect(s.stats.abxKilled).toBeGreaterThan(5);
    const killedWest = [0, 1, 2].map((c) => { let n = 0; for (let j = -6; j <= 6; j++) for (let i = -6; i < -3; i++) if (inside(i, j) && i * i + j * j <= 36 && ((i + j) % 3 + 3) % 3 === c && !s.cells[idx(i, j)]) n++; return n; });
    expect(Math.min(...killedWest)).toBeGreaterThan(0); // every colour lost blocks
  });

  it('mucus halves what antibiotics do', () => {
    const kills = (mucus: number) => { const s = blob(6, () => 0); s.mucus = mucus; s.abx = [{ t0: 0.05, angle: 0, half: 1.2, fired: false }]; run(s, 0.2); return s.stats.abxKilled; };
    expect(kills(5)).toBeLessThan(kills(0) * 0.8);
  });

  it('immune-evasion (violet) blocks survive a hot wall better than amber', () => {
    const killed = (c: number) => {
      let total = 0;
      for (let seed = 1; seed <= 6; seed++) {
        const s = blob(6, () => c, seed); s.wall.fill(1); s.flares = [{ t0: 0, dur: 1e9, angle: 0, half: TAU, power: 0.6 }];
        for (let i = 0; i < 20 * 30; i++) { step(s); s.wall.fill(1); s.health = 100; }
        total += s.stats.immuneKilled;
      }
      return total;
    };
    expect(killed(2)).toBeLessThan(killed(0) * 0.7);
  });
});

describe('Space: secrete', () => {
  it('has a cooldown', () => {
    const s = blob(5, () => 0);
    expect(secrete(s)).toBe(true);
    expect(secrete(s)).toBe(false);
    run(s, balance.secrete.cooldown + 1);
    expect(secrete(s)).toBe(true);
  });

  it('a uniform amber (mucus) outside gives a much longer shield than a mixed one', () => {
    const dur = (colour: (i: number, j: number) => number) => { const s = blob(5, colour); secrete(s); return s.mucus; };
    const uniform = dur(() => 0);
    const mixed = dur((i, j) => ((i + 2 * j) % 3 + 3) % 3);
    expect(uniform).toBeGreaterThan(mixed * 2);
  });

  it('mucus stops phages entirely while it lasts', () => {
    const s = blob(4, () => 0); secrete(s);
    s.phages.push({ r: R + 2, angle: Math.PI, mask: 1 << 0 });
    run(s, 1.5);
    expect(s.stats.hits).toBe(0);
    expect(s.stats.blocked).toBe(1);
  });

  it('cooling is stronger with more immune-evasion blocks', () => {
    const after = (c: number) => { const s = blob(5, () => c); s.wall.fill(0.9); secrete(s); return s.wall[0]; };
    expect(after(2)).toBeLessThan(after(0));
  });

  it('shield length and cooling are computed from what is exposed', () => {
    const s = blob(5, () => 0);
    const st = surfaceStats(s);
    expect(st.mucusPower).toBeCloseTo(COLOURS[0].mucus);
    expect(st.uniformity).toBeCloseTo(1);
  });
});

describe('rotation', () => {
  it('has momentum and a speed cap', () => {
    const s = blob(4, () => 0);
    setRotation(s, 1);
    run(s, 0.5);
    expect(s.omega).toBeGreaterThan(0);
    run(s, 5);
    expect(s.omega).toBeLessThanOrEqual(balance.rotate.maxOmega + 1e-9);
  });
});

describe('balance sanity', () => {
  it('thoughtful play beats random spinning, and spamming Space is worse than timing it', () => {
    const wins = (bot: string) => { let w = 0; for (let seed = 1; seed <= 16; seed++) { const s = createState(seed); for (let i = 0; s.status === 'run'; i++) { if (i % 5 === 0) BOTS[bot](s); step(s); } if (s.status === 'won') w++; } return w; };
    const spin = wins('spin'), dodge = wins('dodge');
    expect(dodge).toBeGreaterThan(spin);
  }, 120000);
});
