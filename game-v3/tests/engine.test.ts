import { describe, expect, it } from 'vitest';
import { chooseMeal, coatOf, createState, diversity, setRotation, step } from '../src/engine/sim';
import balance from '../src/data/balance.json';
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

describe('containment, infections and immune balance', () => {
  const ringOf = (s: ReturnType<typeof createState>, k: number) => s.rings[k].cells;

  it('a lysing cell only reaches immediate neighbours, and the chain fades', () => {
    // full rim of 12 same-shape cells, first one infected: far cells must survive a while
    const s = sandbox(); s.endT = 1e9;
    s.rings[2].cells = s.rings[2].cells.map(() => ({ sp: 'cool', coat: 0, inf: 0, cd: 999 })); // all shape 'c'
    s.rings[2].cells[0]!.inf = 0.05;
    for (let i = 0; i < 12; i++) step(s); // first lysis happens, ~0.6s
    const infected = ringOf(s, 2).filter((c) => c && c.inf > 0).length;
    expect(infected).toBeLessThanOrEqual(balance.phage.burstMax);
    expect(ringOf(s, 2)[6]?.inf).toBe(0); // opposite side untouched
  });

  it('chain generations stop eventually (burst probability reaches zero)', () => {
    expect(balance.phage.burst[balance.phage.burst.length - 1]).toBe(0);
  });

  it('invaders are blocked by a dense colony but land in holes', () => {
    const s = sandbox(); s.endT = 1e9;
    s.rings[2].cells = s.rings[2].cells.map(() => ({ sp: 'cool', coat: 0, inf: 0, cd: 999 }));
    for (let i = 0; i < 400; i++) s.particles.push({ r: 4, angle: (i % 12 + 0.5) * Math.PI * 2 / 12, shape: 'd', kind: 'invader' });
    for (let i = 0; i < 60; i++) step(s);
    const landedFull = ringOf(s, 2).filter((c) => c?.sp === 'pathogen').length;
    expect(landedFull).toBeLessThan(2);
    s.rings[2].cells[3] = null;
    for (let i = 0; i < 400; i++) s.particles.push({ r: 4, angle: 3.5 * Math.PI * 2 / 12, shape: 'd', kind: 'invader' });
    for (let i = 0; i < 60; i++) step(s);
    expect(ringOf(s, 2)[3]?.sp === 'pathogen' || ringOf(s, 1).some((c) => c?.sp === 'pathogen')).toBe(true);
  });

  it('pathogens ignore phages and inflammation damage but die to antibiotics', () => {
    const s = sandbox(); s.endT = 1e9;
    s.rings[2].cells[0] = { sp: 'pathogen', coat: 0, inf: 0, cd: 999 };
    s.particles.push({ r: 4, angle: 0.5 * Math.PI * 2 / 12, shape: 'd' });
    for (let i = 0; i < 60; i++) { s.wall.fill(1); step(s); }
    expect(ringOf(s, 2)[0]?.sp).toBe('pathogen');
    s.antibiotics = [{ t0: s.t + 0.1, center: 0.5 * Math.PI * 2 / 12, half: 0.3, fired: false }];
    for (let i = 0; i < 10; i++) step(s);
    expect(ringOf(s, 2)[0]).toBeNull();
    expect(s.stats.cleared).toBe(1);
  });

  it('dysbiosis raises inflammation but does not end the run by itself', () => {
    const s = sandbox(); s.endT = 1e9;
    const mono = sandbox(); mono.endT = 1e9;
    // 1 species only (dysbiotic) vs mixed, same immune values (coat 2 = neutral for all three)
    s.rings[2].cells = s.rings[2].cells.map(() => ({ sp: 'cool', coat: 2, inf: 0, cd: 999 }));
    mono.rings[2].cells = mono.rings[2].cells.map((_, i) => ({ sp: ['cool', 'funny', 'spicy'][i % 3], coat: 2, inf: 0, cd: 999 }));
    for (let i = 0; i < 400; i++) { step(s); step(mono); }
    expect(s.dysbiosis).toBeGreaterThan(mono.dysbiosis);
    expect(s.inflammation).toBeGreaterThan(mono.inflammation);
    expect(s.status).toBe('run');
  });
});

describe('gut wall hot spots and recovery', () => {
  const settle = (calmOffset: number) => {
    const s = sandbox(); s.endT = 1e9;
    s.rings[2].cells[1] = { sp: 'pathogen', coat: 0, inf: 0, cd: 999 }; // immune -2 at the rim (doesn't die to inflammation), 45 deg -> sector 1
    s.rings[1].cells[0] = { sp: 'cool', coat: 0, inf: 0, cd: 999 };  // immune +2, 30 deg -> sector 1 when aligned
    s.rings[1].off = calmOffset;
    for (let i = 0; i < 20 * 40; i++) {
      step(s);
      // pin coats so random flips don't add noise to the experiment
      s.rings[1].cells.forEach((c, j) => { if (c) c.coat = j === 0 ? 0 : 2; });
    }
    return s;
  };

  it('a hot cell heats its own sector of the wall', () => {
    const s = settle(Math.PI);
    expect(s.wall[1]).toBeGreaterThan(s.wall[6]);
  });

  it('putting calming cells under the hot sector cools it and lowers overall inflammation', () => {
    const aligned = settle(0);
    const misplaced = settle(Math.PI);
    expect(aligned.wall[1]).toBeLessThan(misplaced.wall[1] - 0.1);
    expect(aligned.inflammation).toBeLessThan(misplaced.inflammation);
  });

  it('heat spreads a little to neighbouring sectors', () => {
    const s = settle(Math.PI);
    expect(s.wall[2]).toBeGreaterThan(s.wall[6]);
  });

  it('calm gaps heal a little, but only a little', () => {
    const mk = (gap: boolean) => {
      const s = sandbox(); s.endT = 1e9; s.health = 50;
      s.gaps = gap ? [{ start: 0, end: 8, offered: true }] : [];
      for (let i = 0; i < 20 * 5; i++) step(s);
      return s.health;
    };
    const diff = mk(true) - mk(false);
    expect(diff).toBeGreaterThan(1);
    expect(diff).toBeLessThan(5);
  });
});
