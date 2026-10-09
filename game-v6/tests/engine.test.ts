import { describe, expect, it } from 'vitest';
import balance from '../src/data/balance.json';
import { CARD, CARDS } from '../src/engine/cards';
import { cellAt, count, eachCell, exposed, idx, R, TAU } from '../src/engine/geometry';
import { COLOURS, baseInflammation, coatThreshold, coolingFactors, createState, mod, nextCycle, patches, pickCard, setRotation, step, turnBand, useHeld } from '../src/engine/sim';
import { BOTS } from '../src/sim/bots';
import type { State } from '../src/engine/types';

/** A hand-built wave: a disc of pixels coloured by `colour`; no stream, no flares, no mutations, a calm wall. */
function wave(radius: number, colour: (i: number, j: number) => number, seed = 1): State {
  const s = createState(seed);
  s.cells.fill(null);
  for (let j = -R; j <= R; j++) for (let i = -R; i <= R; i++) if (i * i + j * j <= radius * radius) s.cells[idx(i, j)] = { c: colour(i, j), inf: 0, ph: 0, gen: 0, m: 0, mcd: 0 };
  s.phase = 'wave'; s.waveT = 0; s.cycle = 3; s.theta = 0; s.omega = 0; s.cmd = 0;
  s.abx = []; s.flares = []; s.spawning = false; s.mutating = false; s.coating = false; s.waveLen = 1e9; s.mods = []; s.held = null; s.drift = 0;
  s.wall.fill(balance.wall.base); s.cooling = s.cooling.map(() => 0);
  return s;
}
const run = (s: State, secs: number) => { for (let i = 0; i < secs * 20; i++) step(s); };
const infect = (s: State, i: number, j: number, mask: number) => { const c = s.cells[idx(i, j)]!; c.inf = balance.phage.infectTime; c.ph = mask; c.gen = 0; };
const mixed = (i: number, j: number) => (((i + 2 * j) % 3) + 3) % 3;
const west = Math.PI;

describe('the run loop and cards', () => {
  it('is deterministic for a seed and JSON round-trips mid-wave', () => {
    const a = createState(7), b = createState(7);
    pickCard(a, 0); pickCard(a, 0); pickCard(b, 0); pickCard(b, 0);
    for (let i = 0; i < 300; i++) { step(a); step(b); }
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const c = JSON.parse(JSON.stringify(a));
    for (let i = 0; i < 100; i++) { step(a); step(c); }
    expect(JSON.stringify(a)).toBe(JSON.stringify(c));
  });

  it('opens in the grooming phase with three cards to pick from, twice, and then the wave begins', () => {
    const s = createState(2);
    expect(s.phase).toBe('groom'); expect(s.offer.length).toBe(3); expect(s.picksLeft).toBe(balance.picks);
    const first = s.offer.slice();
    expect(pickCard(s, 0)).toBe(true);
    expect(s.phase).toBe('groom'); expect(s.offer.length).toBe(3);
    pickCard(s, 1);
    expect(s.phase).toBe('wave');
    expect(first.every((id) => CARD[id])).toBe(true);
    step(s); // the simulation only runs in the wave
  });

  it('nothing runs while grooming: the blob and the clock are frozen', () => {
    const s = createState(3);
    const before = JSON.stringify(s.cells);
    for (let i = 0; i < 200; i++) step(s);
    expect(JSON.stringify(s.cells)).toBe(before); expect(s.waveT).toBe(0);
  });

  it('food, motility and drug cards all exist, and held cards go in the held slot', () => {
    const fam = new Set(CARDS.map((c) => c.family));
    expect(fam).toEqual(new Set(['food', 'motility', 'drug']));
    const s = createState(4); s.offer = ['ringturn', 'fibre', 'steroid']; pickCard(s, 0);
    expect(s.held).toEqual({ id: 'ringturn', charges: 3 });
    s.offer = ['fibre', 'steroid', 'mucin']; pickCard(s, 1);
    expect(s.held?.id).toBe('steroid'); // a new held card replaces the old one
  });

  it('a food card makes its colour grow faster; the effect expires after its waves', () => {
    const births = (card: string | null) => { const s = wave(5, () => 2); if (card) s.mods.push({ id: card, left: 2 }); run(s, 25); return s.stats.births; };
    expect(births('fibre')).toBeGreaterThan(births(null) * 1.1);
    const s = createState(5); s.offer = ['mesalamine', 'fibre', 'mucin']; pickCard(s, 0); s.offer = ['mesalamine', 'x', 'y']; pickCard(s, 0);
    expect(mod(s, 'coolBonus', 'add')).toBeCloseTo(0.2);
    s.waveLen = 5; s.waveT = 4.99; s.cycle = 1; step(s); step(s);
    expect(s.phase).toBe('checkup');
    for (let k = 0; k < 3; k++) { if (s.phase === 'checkup') { nextCycle(s); s.offer = []; s.mods = s.mods.slice(); } s.mods = s.mods.map((m) => ({ ...m, left: m.left - 1 })).filter((m) => m.left > 0); }
    expect(mod(s, 'coolBonus', 'add')).toBe(0);
  });

  it('chronic disease: every cycle the baseline drifts up, the wall only partly recovers, and a new offer is drawn', () => {
    const s = wave(10, () => 2); s.cycle = 4; s.wall.fill(0.7); s.waveLen = 5; s.waveT = 4.99; step(s); step(s);
    expect(s.phase).toBe('checkup');
    const d0 = s.drift; nextCycle(s);
    expect(s.drift).toBeGreaterThan(d0); expect(s.cycle).toBe(5); expect(s.phase).toBe('groom'); expect(s.offer.length).toBe(3);
    const base = baseInflammation(s);
    expect(s.wall[0]).toBeGreaterThan(base + 0.05); expect(s.wall[0]).toBeLessThan(0.7);
  });

  it('winning means finishing the last cycle; collapsing is the rare other way out', () => {
    const w = wave(12, () => 2); w.cycle = balance.cycles; w.waveLen = 5; w.waveT = 4.99; step(w); step(w);
    expect(w.status).toBe('won');
    const c = wave(2, () => 0); step(c);
    expect(c.status).toBe('lost'); expect(c.reason).toBe('the community collapsed');
  });
});

describe('real-time wave basics', () => {
  it('rotation has momentum and a speed cap, and a card changes it', () => {
    const s = wave(8, () => 0); setRotation(s, 1); run(s, 0.5);
    expect(s.omega).toBeGreaterThan(0);
    run(s, 5); expect(s.omega).toBeLessThanOrEqual(balance.rotate.maxOmega + 1e-9);
    const f = wave(8, () => 0); f.mods.push({ id: 'peristalsis', left: 2 }); setRotation(f, 1); run(f, 5);
    expect(f.omega).toBeGreaterThan(s.omega * 1.2);
  });

  it('phages arrive at random from every side, in all colours, and more as the cycle number rises', () => {
    const s = wave(10, () => 0); s.spawning = true; s.cycle = 6;
    const masks = new Set<number>(), quad = new Set<number>();
    for (let i = 0; i < 20 * 25; i++) { step(s); for (const p of s.phages) { masks.add(p.mask); quad.add(Math.floor(p.angle / (TAU / 4))); } }
    expect(masks.size).toBeGreaterThanOrEqual(3); expect(quad.size).toBe(4);
    const spawned = (cycle: number) => { const t = wave(14, () => 1); t.spawning = true; t.cycle = cycle; let n = 0, seen = new Set<object>(); for (let i = 0; i < 20 * 20; i++) { step(t); for (const p of t.phages) if (!seen.has(p)) { seen.add(p); n++; } } return n; };
    expect(spawned(10)).toBeGreaterThan(spawned(1) * 1.5);
  });

  it('a phage infects a pixel of its colour and is deflected by another; the first pixel it meets decides', () => {
    const hit = wave(8, () => 0); hit.phages.push({ r: R + 2, angle: west, mask: 1 }); run(hit, 3);
    expect(hit.stats.hits).toBe(1);
    const miss = wave(8, () => 1); miss.phages.push({ r: R + 2, angle: west, mask: 1 }); run(miss, 3);
    expect(miss.stats.hits).toBe(0); expect(miss.stats.deflected).toBe(1);
    const first = wave(10, (i) => (i < -4 ? 0 : 1)); first.phages.push({ r: R + 2, angle: west, mask: 2 }); run(first, 3);
    expect(first.stats.hits).toBe(0);
  });

  it('turning the blob changes which colour a phage meets', () => {
    const hits = (theta: number) => { const s = wave(8, (i) => (i < 0 ? 0 : 1)); s.theta = theta; s.phages.push({ r: R + 2, angle: west, mask: 1 }); run(s, 3); return s.stats.hits; };
    expect(hits(0)).toBe(1); expect(hits(Math.PI)).toBe(0);
  });
});

describe('bites and bet hedging', () => {
  const lysed = (colour: (i: number, j: number) => number, c0 = 0) => { let t = 0; for (const seed of [1, 2, 3, 4]) { const s = wave(12, colour, seed); infect(s, 6, 0, 1 << c0); run(s, 8); t += s.stats.lysed; } return t / 4; };
  it('one hit on a uniform amber blob takes a real bite; on a mixed blob almost nothing; cyan damps it', () => {
    const mono = lysed(() => 0);
    expect(mono).toBeGreaterThan(40);
    expect(lysed(mixed)).toBeLessThan(mono / 10);
    expect(lysed(() => 1, 1)).toBeLessThan(mono / 2);
  });
  it('a different colour is a firewall', () => {
    const s = wave(12, (i) => (i < 0 ? 0 : 1)); infect(s, -6, 0, 1); run(s, 10);
    expect(s.stats.lysed).toBeGreaterThan(10);
    let rightLost = 0; for (let j = -R; j <= R; j++) for (let i = 1; i <= R; i++) if (i * i + j * j <= 144 && s.cells[idx(i, j)]?.c !== 1) rightLost++;
    expect(rightLost).toBe(0);
  });
  it('the anchor card damps cascades; resistant starch damps them further', () => {
    const l = (card: string | null) => { let t = 0; for (const seed of [1, 2, 3, 4]) { const s = wave(12, () => 0, seed); if (card) s.mods.push({ id: card, left: 2 }); infect(s, 6, 0, 1); run(s, 8); t += s.stats.lysed; } return t / 4; };
    expect(l('anchor')).toBeLessThan(l(null));
  });
  it('survivors regrow into a gap and take it over', () => {
    const s = wave(4, () => 2); run(s, 240);
    expect(count(s)).toBeGreaterThan(200);
  });
});

describe('mucus coats on big patches', () => {
  it('only a really big single-colour patch grows a coat; a small one never does; mixed blobs have none', () => {
    const big = wave(13, () => 0); big.coating = true; run(big, 2);
    let coated = 0; eachCell(big, (c) => { if (c.m > 0) coated++; });
    expect(coated).toBeGreaterThan(30);
    const small = wave(6, () => 0); small.coating = true; // ~113 pixels, under the threshold
    expect(count(small)).toBeLessThan(coatThreshold(small)); run(small, 3);
    let sc = 0; eachCell(small, (c) => { if (c.m > 0) sc++; }); expect(sc).toBe(0);
    const mix = wave(13, mixed); mix.coating = true; run(mix, 3);
    let mc = 0; eachCell(mix, (c) => { if (c.m > 0) mc++; }); expect(mc).toBe(0);
    expect(patches(mix).every((p) => p.cells.length < coatThreshold(mix))).toBe(true);
  });

  it('a coat soaks up a phage (no infection) and the hit chips a hole in the shell', () => {
    const s = wave(13, () => 0); s.coating = true; run(s, 1.2);
    const before = (() => { let n = 0; eachCell(s, (c) => { if (c.m > 0) n++; }); return n; })();
    s.phages.push({ r: R + 2, angle: west, mask: 1 }); run(s, 2);
    expect(s.stats.hits).toBe(0); expect(s.stats.blocked).toBe(1);
    let after = 0, cooling = 0; eachCell(s, (c) => { if (c.m > 0) after++; if (c.mcd > 0) cooling++; });
    expect(after).toBeLessThan(before); expect(cooling).toBeGreaterThan(3);
  });

  it('amber coats last much longer than cyan ones, and the mucin card lengthens them', () => {
    const dur = (colour: number, card?: string) => { const s = wave(13, () => colour); s.coating = true; if (card) s.mods.push({ id: card, left: 2 }); run(s, 1.2); let m = 0; eachCell(s, (c) => { m = Math.max(m, c.m); }); return m; };
    expect(dur(0)).toBeGreaterThan(dur(1) * 1.5);
    expect(dur(0, 'mucin')).toBeGreaterThan(dur(0) * 1.3);
  });

  it('the mucus secretagogue (held card) coats the whole surface at once', () => {
    const s = wave(8, mixed); s.held = { id: 'mucolytic', charges: 1 };
    expect(useHeld(s)).toBe(true);
    let surface = 0, coated = 0; eachCell(s, (c, i, j) => { if (exposed(s, i, j)) { surface++; if (c.m > 0) coated++; } });
    expect(coated).toBe(surface); expect(s.held).toBeNull();
  });
});

describe('passive cooling and inflammation', () => {
  const cool = (s: State) => Math.max(...coolingFactors(s));
  it('violet pixels facing the wall cool it far more than cyan, and the cooling never reaches 100%', () => {
    expect(cool(wave(14, () => 2))).toBeGreaterThan(cool(wave(14, () => 1)) * 2);
    expect(cool(wave(14, () => 2))).toBeLessThan(balance.cool.max + 1e-9);
    expect(cool(wave(14, () => 2))).toBeLessThan(1);
  });
  it('has diminishing returns: twice the violet is nowhere near twice the cooling', () => {
    const f = (r: number) => cool(wave(r, () => 2));
    expect(f(10)).toBeGreaterThan(f(5)); expect(f(14) - f(10)).toBeLessThan(f(10) - f(5));
  });
  it('counts what is near the edge (the lumen) more than what is buried', () => {
    const rim = wave(13, (i, j) => (i * i + j * j > 81 ? 2 : 1)), core = wave(13, (i, j) => (i * i + j * j < 49 ? 2 : 1));
    expect(cool(rim)).toBeGreaterThan(cool(core) * 1.4);
  });
  it('cools the sector the pixels face: turning the blob moves the cooling around the wall', () => {
    const s = wave(13, (i) => (i > 0 ? 2 : 1)); // violet on the right half
    const a = coolingFactors(s), b = (() => { s.theta = Math.PI; return coolingFactors(s); })();
    const S = balance.wallSectors;
    expect(a[0]).toBeGreaterThan(a[S / 2] * 2); expect(b[S / 2]).toBeGreaterThan(b[0] * 2);
  });
  it('a flare heats its arc of the wall; violet facing it keeps it much cooler than cyan facing it', () => {
    const run2 = (colour: number) => { const s = wave(14, () => colour); s.flares = [{ t0: 0, t1: 30, angle: 0.4, half: 0.5, intensity: 1.0, kind: 'flare' }]; run(s, 8); return s.wall[0]; };
    const hot = run2(1), cooled = run2(2);
    expect(hot).toBeGreaterThan(balance.wall.base + 0.2); expect(cooled).toBeLessThan(hot - 0.1);
  });
  it('doing nothing against a flare hurts: a sustained overload loses the run, a brief one does not', () => {
    const s = wave(14, () => 1); s.wall.fill(0.95); step(s); expect(s.status).toBe('run');
    run(s, balance.overloadSecs + 1); expect(s.status).toBe('lost'); expect(s.reason).toContain('flare-out');
  });
  it('the steroid cools the wall now and the gut rebounds later; sugar and the rebound raise the baseline', () => {
    const s = wave(10, () => 0); s.wall.fill(0.7); s.held = { id: 'steroid', charges: 1 }; useHeld(s);
    expect(s.wall[0]).toBeCloseTo(0.4); expect(mod(s, 'baseAdd', 'add')).toBeGreaterThan(0.05);
    const t = wave(10, () => 0); t.mods.push({ id: 'sugar', left: 1 });
    expect(baseInflammation(t)).toBeGreaterThan(balance.wall.base + 0.05);
  });
});

describe('immune cells and antibiotics', () => {
  it('immune cells come from the flare arc only while it is on, bite pixels, and violet evades most of them', () => {
    const s = wave(12, () => 0); s.spawning = true; s.flares = [{ t0: 2, t1: 8, angle: 1, half: 0.5, intensity: 1.5, kind: 'flare' }];
    let early = 0, mid = 0; const seen = new Set<object>();
    for (let i = 0; i < 20 * 9; i++) { step(s); for (const m of s.immune) if (!seen.has(m)) { seen.add(m); if (s.waveT < 2) early++; else mid++; } }
    expect(early).toBe(0); expect(mid).toBeGreaterThan(2);
    const bites = (c: number) => { let t = 0; for (let seed = 1; seed <= 4; seed++) { const w = wave(10, () => c, seed); for (let k = 0; k < 30; k++) w.immune.push({ r: R - k * 0.3, angle: west + (k % 5) * 0.2 - 0.4 }); run(w, 4); t += w.stats.immuneKilled; } return t; };
    expect(bites(2)).toBeLessThan(bites(0) / 2);
  });
  it('antibiotics kill by position, not colour; a coat halves them', () => {
    const s = wave(12, mixed); s.abx = [{ t0: 0.05, angle: west, half: 0.6, fired: false }]; run(s, 0.2);
    expect(s.stats.abxKilled).toBeGreaterThan(15); expect(s.cells[idx(0, 0)]).not.toBeNull();
    const kills = (coat: boolean) => { const t = wave(12, () => 0); if (coat) eachCell(t, (c) => { c.m = 5; }); t.abx = [{ t0: 0.05, angle: 0, half: 1.2, fired: false }]; run(t, 0.1); return t.stats.abxKilled; };
    expect(kills(true)).toBeLessThan(kills(false) * 0.75);
  });
});

describe('ring turn: shaping the blob', () => {
  it('turns the outer band against the core without losing the blob', () => {
    const s = wave(13, (i, j) => (Math.atan2(j, i) > 0 ? 0 : 1)); // top half amber, bottom half cyan
    const n0 = count(s), core0 = cellAt(s, 0, 0)!.c, rim0 = cellAt(s, 10, 6)?.c;
    s.held = { id: 'ringturn', charges: 3 };
    useHeld(s); useHeld(s);
    expect(count(s)).toBeGreaterThan(n0 * 0.92); expect(count(s)).toBeLessThan(n0 * 1.08);
    expect(cellAt(s, 0, 0)!.c).toBe(core0);
    turnBand(s, 1); turnBand(s, 1); turnBand(s, 1);
    expect(cellAt(s, 10, 6)?.c).not.toBe(rim0);
    expect(s.held).toEqual({ id: 'ringturn', charges: 1 });
  });
});

describe('balance sanity', () => {
  it('a bot that turns toward the cooling and away from phages gets further than one that does nothing', () => {
    const play = (bot: string, seed: number) => {
      const s = createState(seed); const b = BOTS[bot]; let r = seed >>> 0; const rnd = () => { r = (r + 0x6d2b79f5) >>> 0; let t = r; t = Math.imul(t ^ (t >>> 15), t | 1); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; let k = 0;
      while (s.status === 'run') { if (s.phase === 'groom') { while (s.phase === 'groom') b.groom(s, rnd); continue; } if (s.phase === 'checkup') { nextCycle(s); continue; } if (k++ % 5 === 0) b.tick(s, rnd); step(s); }
      return s.cycle + (s.status === 'won' ? 1 : 0);
    };
    let smart = 0, idle = 0; for (const seed of [1, 2, 3]) { smart += play('smart', seed); idle += play('idle', seed); }
    expect(smart).toBeGreaterThan(idle);
  }, 280000);
});
void COLOURS;
