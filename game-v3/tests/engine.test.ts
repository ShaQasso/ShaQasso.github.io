import { describe, expect, it } from 'vitest';
import { chooseMeal, coatOf, createState, diversity, setRotation, step } from '../src/engine/sim';
import { allCells } from '../src/engine/geometry';
import { BOTS } from '../src/sim/bots';

const run = (seed: number, bot = 'idle', secs = 300) => {
  const s = createState(seed);
  for (let i = 0; i < secs * 20 && s.status === 'run'; i++) { if (i % 5 === 0) BOTS[bot](s); step(s); }
  return s;
};

/** Empty board with six inert shape-'d' cells in ring 1 so the run isn't instantly lost for being too small. */
const sandbox = (seed = 1) => {
  const s = createState(seed);
  s.waves = []; s.antibiotics = []; s.gaps = [];
  s.rings.forEach((r) => r.cells.fill(null));
  s.rings[1].cells = s.rings[1].cells.map(() => ({ sp: 'cool', coat: 2, inf: 0, cd: 999 }));
  s.rings.forEach((r) => { r.off = 0; });
  return s;
};

describe('engine', () => {
  it('is deterministic for a given seed', () => {
    expect(JSON.stringify(run(7))).toBe(JSON.stringify(run(7)));
  });

  it('state round-trips through JSON mid-run', () => {
    const a = createState(3);
    for (let i = 0; i < 400; i++) step(a);
    const b = JSON.parse(JSON.stringify(a));
    for (let i = 0; i < 400; i++) { step(a); step(b); }
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('a phage of the right shape infects, and wrong shapes pass through', () => {
    const s = sandbox();
    s.rings[2].cells[0] = { sp: 'cool', coat: 0, inf: 0, cd: 999 }; // shape 'c'
    const ang = 0.5 * (Math.PI * 2 / 12); // column of rim slot 0
    s.particles.push({ r: 4, angle: ang, shape: 't' });
    for (let i = 0; i < 100; i++) step(s);
    expect(s.rings[2].cells[0]?.inf).toBe(0);
    s.particles.push({ r: 4, angle: ang, shape: 'c' });
    for (let i = 0; i < 25; i++) step(s);
    expect(s.rings[2].cells[0]?.inf).toBeGreaterThan(0);
  });

  it('an infected cell soaks up further phages', () => {
    const s = sandbox();
    s.rings[2].cells[0] = { sp: 'cool', coat: 0, inf: 1.9, cd: 999 };
    const ang = 0.5 * (Math.PI * 2 / 12);
    s.particles.push({ r: 4, angle: ang, shape: 'd' }); // would infect the ring-1 cell behind it
    for (let i = 0; i < 30; i++) step(s);
    expect(s.particles.length).toBe(0);
    expect(s.rings[1].cells[0]?.inf).toBe(0);
  });

  it('rotation has momentum and a speed cap', () => {
    const s = sandbox(); s.endT = 1e9;
    const k = 2, before = s.rings[k].off;
    setRotation(s, k, 1);
    for (let i = 0; i < 20; i++) step(s);
    expect(s.rings[k].omega).toBeGreaterThan(0);
    expect(s.rings[k].omega).toBeLessThanOrEqual(3.2);
    expect(s.rings[k].off).not.toBe(before);
  });

  it('a flip always changes the coat and never creates an invalid coat', () => {
    const s = run(11, 'idle', 120);
    for (const { cell } of allCells(s)) expect(coatOf(cell)).toBeDefined();
    expect(s.stats.flips).toBeGreaterThan(0);
  });

  it('diversity is 0 for empty and in [0,1]', () => {
    const s = createState(2);
    expect(diversity(s)).toBeGreaterThan(0);
    expect(diversity(s)).toBeLessThanOrEqual(1);
    s.rings.forEach((r) => r.cells.fill(null));
    expect(diversity(s)).toBe(0);
  });

  it('meals can be chosen during a calm gap', () => {
    const s = createState(5);
    s.endT = 1e9;
    s.waves = []; s.antibiotics = [];
    while (!s.offer && s.t < 100) step(s);
    expect(s.offer).not.toBeNull();
    chooseMeal(s, 0);
    expect(s.meal).not.toBeNull();
  });

  it('smart play beats random spinning (balance sanity)', () => {
    let dodge = 0, spin = 0;
    for (let seed = 1; seed <= 30; seed++) {
      if (run(seed, 'dodge').status === 'won') dodge++;
      if (run(seed, 'spin').status === 'won') spin++;
    }
    expect(dodge).toBeGreaterThan(spin);
  }, 60000);
});
