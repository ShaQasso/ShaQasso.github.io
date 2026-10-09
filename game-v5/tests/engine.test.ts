import { describe, expect, it } from 'vitest';
import balance from '../src/data/balance.json';
import { cellAt, count, eachCell, idx, R, TAU } from '../src/engine/geometry';
import { bestPlan, preview } from '../src/engine/plan';
import { beginTurn, createState, estimateBite, exertEffect, release, skipTurn, step, turnTimer } from '../src/engine/sim';
import type { Announce, State } from '../src/engine/types';

/** A hand-built scenario: a disc of pixels coloured by `colour`, nothing announced, a quiet host. */
function blob(radius: number, colour: (i: number, j: number) => number, seed = 1): State {
  const s = createState(seed);
  s.cells.fill(null);
  for (let j = -R; j <= R; j++) for (let i = -R; i <= R; i++) if (i * i + j * j <= radius * radius) s.cells[idx(i, j)] = { c: colour(i, j), inf: 0, ph: 0, gen: 0 };
  s.theta = 0; s.exert = 0; s.ann = { phages: [], immune: [], abx: null };
  s.section = { kind: 'quiet', left: 99, total: 99, intensity: 0, angle: 0, half: 0 };
  s.mucusTurns = 0; s.mucusCd = 0; s.wall.fill(balance.wall.base);
  return s;
}
const mixed = (i: number, j: number) => (((i + 2 * j) % 3) + 3) % 3;
const west = Math.PI;
const ann = (s: State, a: Partial<Announce>) => { s.ann = { phages: [], immune: [], abx: null, ...a }; };
/** Plays out the resolve and regrow phases. */
const advance = (s: State) => { for (let k = 0; k < 8000 && s.phase !== 'plan' && s.status === 'run'; k++) step(s); };

describe('turns', () => {
  it('is deterministic for a seed, and JSON round-trips mid-run', () => {
    const a = createState(7), b = createState(7);
    release(a); release(b);
    for (let i = 0; i < 300; i++) { step(a); step(b); }
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const c = JSON.parse(JSON.stringify(a));
    for (let i = 0; i < 100; i++) { step(a); step(c); }
    expect(JSON.stringify(a)).toBe(JSON.stringify(c));
  });

  it('opens on turn 1 in the plan phase with an announced wave and a full timer', () => {
    const s = createState(3);
    expect(s.turn).toBe(1); expect(s.phase).toBe('plan');
    expect(s.ann.phages.length).toBe(balance.turns.basePhages);
    expect(s.timer).toBe(balance.turns.timerStart);
    expect(count(s)).toBeGreaterThan(600);
  });

  it('the planning timer shrinks each turn but never below its floor', () => {
    expect(turnTimer(1)).toBe(balance.turns.timerStart);
    expect(turnTimer(5)).toBeLessThan(turnTimer(1));
    expect(turnTimer(500)).toBe(balance.turns.timerMin);
    for (let t = 2; t < 60; t++) expect(turnTimer(t)).toBeLessThanOrEqual(turnTimer(t - 1));
  });

  it('the plan phase freezes the blob; running out of time releases the turn automatically', () => {
    const s = createState(2);
    const before = JSON.stringify(s.cells);
    for (let i = 0; i < 20 * 5; i++) step(s);
    expect(JSON.stringify(s.cells)).toBe(before);
    expect(s.phase).toBe('plan');
    let steps = 0;
    while (s.phase === 'plan' && steps < 20 * 40) { step(s); steps++; }
    expect(s.phase).toBe('resolve');
    expect(s.timer).toBeLessThanOrEqual(0);
    expect(steps + 100).toBeGreaterThan(20 * (balance.turns.timerStart - 1));
  });

  it('a released turn resolves, regrows, then the next turn begins', () => {
    const s = createState(4);
    release(s);
    expect(s.phase).toBe('resolve');
    advance(s);
    expect(s.turn).toBe(2); expect(s.phase).toBe('plan');
  });

  it('difficulty ramps: more phages, two-colour phages and antibiotics only later', () => {
    const wave = (turn: number) => { const s = blob(8, () => 0); s.turn = turn - 1; s.lastAbxTurn = -99; beginTurn(s); return s.ann; };
    expect(wave(25).phages.length).toBeGreaterThan(wave(1).phages.length);
    let early2 = 0, late2 = 0, earlyAbx = 0, lateAbx = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const e = (() => { const s = blob(8, () => 0, seed); s.turn = 2; s.lastAbxTurn = -99; beginTurn(s); return s.ann; })();
      const l = (() => { const s = blob(8, () => 0, seed); s.turn = 24; s.lastAbxTurn = -99; beginTurn(s); return s.ann; })();
      early2 += e.phages.filter((p) => (p.mask & (p.mask - 1)) !== 0).length; late2 += l.phages.filter((p) => (p.mask & (p.mask - 1)) !== 0).length;
      earlyAbx += e.abx ? 1 : 0; lateAbx += l.abx ? 1 : 0;
    }
    expect(early2).toBe(0); expect(late2).toBeGreaterThan(5);
    expect(earlyAbx).toBe(0); expect(lateAbx).toBeGreaterThan(3);
  });
});

describe('preview is honest', () => {
  it('rotating the blob changes what a phage meets, and the real resolve matches the preview', () => {
    const s = blob(10, (i) => (i < 0 ? 0 : 1)); // left half colour 0 (amber), right half colour 1 (cyan)
    ann(s, { phages: [{ angle: west, mask: 1 << 0 }] });
    s.theta = 0;
    expect(preview(s).phages[0].outcome).toBe('bite');
    s.theta = Math.PI;
    expect(preview(s).phages[0].outcome).toBe('deflect');
    s.theta = 0;
    release(s); advance(s);
    expect(s.stats.hits).toBe(1);
    const t = blob(10, (i) => (i < 0 ? 0 : 1)); ann(t, { phages: [{ angle: west, mask: 1 << 0 }] }); t.theta = Math.PI;
    release(t); advance(t);
    expect(t.stats.hits).toBe(0); expect(t.stats.deflected).toBe(1);
  });

  it('predicts a bite size that matches what really happens, and a mixed blob takes almost nothing', () => {
    const real = (colour: (i: number, j: number) => number, seed: number) => { const s = blob(12, colour, seed); ann(s, { phages: [{ angle: west, mask: 1 << 0 }] }); release(s); for (let i = 0; i < 20 * 8; i++) step(s); return s.stats.lysed; };
    const mono = blob(12, () => 0);
    const est = estimateBite(mono, -12, 0, 1 << 0);
    let avg = 0; for (let seed = 1; seed <= 8; seed++) avg += real(() => 0, seed) / 8;
    expect(est).toBeGreaterThan(avg * 0.6); expect(est).toBeLessThan(avg * 1.6);
    expect(estimateBite(blob(12, mixed), -12, 0, 1 << 0)).toBeLessThan(est / 10);
    expect(estimateBite(blob(12, () => 1), -12, 0, 1 << 1)).toBeLessThan(estimateBite(mono, -12, 0, 1 << 0) / 2); // cyan resists
  });

  it('a hole in the blob lets a phage through; the preview shows it', () => {
    const s = blob(10, () => 0);
    for (let i = -10; i <= -6; i++) s.cells[idx(i, 0)] = null;
    ann(s, { phages: [{ angle: west, mask: 1 << 0 }] });
    expect(preview(s).phages[0].hit).toEqual({ i: -5, j: 0 });
  });

  it('the planner finds a rotation that parries a wave a naive rotation cannot', () => {
    const s = blob(12, (i, j) => (Math.atan2(j, i) > 0 ? 0 : 1)); // top half amber, bottom half cyan
    ann(s, { phages: [{ angle: 1.0, mask: 1 << 0 }, { angle: 2.2, mask: 1 << 0 }] });
    s.theta = 0;
    expect(preview(s).perfect).toBe(false);
    const plan = bestPlan(s);
    expect(plan.perfect).toBe(true);
    s.theta = plan.theta;
    expect(preview(s).perfect).toBe(true);
  });
});

describe('parries, skips and the mucus bloom', () => {
  it('a perfect parry earns a skip token and a streak; a bite resets the streak', () => {
    const noMucus = (t: State) => { t.mucusTurns = 0; t.mucusCd = 99; };
    const s = blob(10, () => 1); noMucus(s); ann(s, { phages: [{ angle: west, mask: 1 << 0 }] });
    release(s); advance(s);
    expect(s.skips).toBe(1); expect(s.streak).toBe(1); expect(s.perfects).toBe(1);
    noMucus(s); ann(s, { phages: [{ angle: west, mask: 1 << 1 }] });
    release(s); advance(s);
    expect(s.skips).toBe(1); expect(s.streak).toBe(0);
  });

  it('skip tokens are capped', () => {
    const s = blob(10, () => 1);
    for (let k = 0; k < 6; k++) { ann(s, { phages: [{ angle: west, mask: 1 << 0 }] }); release(s); advance(s); }
    expect(s.skips).toBe(balance.turns.maxSkips);
  });

  it('skipping cancels the announced attack, costs a token, and the blob still regrows', () => {
    const s = blob(10, () => 0); s.skips = 2;
    ann(s, { phages: [{ angle: west, mask: 1 << 0 }, { angle: 0, mask: 1 << 0 }], abx: { angle: 1, half: 0.6 } });
    for (let i = -3; i <= 3; i++) s.cells[idx(i, 0)] = null; // some room to regrow into
    const n0 = count(s);
    expect(skipTurn(s)).toBe(true);
    advance(s);
    expect(s.skips).toBe(1); expect(s.stats.hits).toBe(0); expect(s.stats.abxKilled).toBe(0);
    expect(count(s)).toBeGreaterThan(n0); expect(s.turn).toBe(2);
    s.skips = 0; ann(s, { phages: [{ angle: west, mask: 1 << 0 }] });
    expect(skipTurn(s)).toBe(false);
  });

  it('a uniform amber outside blooms a mucus layer for several turns that blocks phages, then goes on cooldown', () => {
    const s = blob(10, () => 0); s.turn = 3; beginTurn(s);
    expect(s.mucusTurns).toBeGreaterThanOrEqual(2);
    ann(s, { phages: [{ angle: west, mask: 1 << 0 }] });
    expect(preview(s).phages[0].outcome).toBe('blocked');
    const turns = s.mucusTurns;
    release(s); advance(s);
    expect(s.stats.hits).toBe(0); expect(s.stats.blocked).toBe(1);
    for (let k = 1; k < turns; k++) { ann(s, {}); release(s); advance(s); }
    expect(s.mucusTurns).toBe(0); expect(s.mucusCd).toBeGreaterThan(0);
  });

  it('a mixed outside, or a uniform cyan one, gets little or no mucus', () => {
    const m = blob(10, mixed); m.turn = 3; beginTurn(m);
    expect(m.mucusTurns).toBe(0);
    const c = blob(10, () => 1); c.turn = 3; beginTurn(c);
    expect(c.mucusTurns).toBeLessThanOrEqual(1);
  });
});

describe('inflammation: sections, immune cells, and the anti-inflammatory effort', () => {
  it('the immune section cycles quiet, pre-flare, flare, after, quiet with random lengths, and immune cells only come while it is on', () => {
    const s = createState(11);
    const kinds: string[] = []; let immuneInQuiet = 0, immuneInSection = 0;
    for (let k = 0; k < 24 && s.status === 'run'; k++) {
      kinds.push(s.section.kind);
      if (s.section.kind === 'quiet') immuneInQuiet += s.ann.immune.length; else immuneInSection += s.ann.immune.length;
      s.exert = 0; release(s); advance(s);
    }
    expect(new Set(kinds)).toEqual(new Set(['quiet', 'pre', 'flare', 'after']));
    expect(immuneInQuiet).toBe(0); expect(immuneInSection).toBeGreaterThan(0);
    const order = kinds.filter((k, i) => i === 0 || k !== kinds[i - 1]);
    for (let i = 1; i < order.length; i++) expect({ quiet: 'pre', pre: 'flare', flare: 'after', after: 'quiet' }[order[i - 1] as 'quiet'] ).toBe(order[i]);
    const runs: number[] = []; let len = 0;
    kinds.forEach((k, i) => { if (i > 0 && k !== kinds[i - 1]) { runs.push(len); len = 0; } len++; });
    expect(new Set(runs).size).toBeGreaterThan(1); // the number of turns varies
  });

  it('the flare heats its arc of the wall and an unattended flare ends the run in overload', () => {
    const s = blob(12, () => 0);
    s.section = { kind: 'flare', left: 99, total: 99, intensity: 1.3, angle: 1.0, half: 0.9 };
    for (let k = 0; k < 20 && s.status === 'run'; k++) { ann(s, {}); s.exert = 4; release(s); advance(s); s.section.left = 99; s.section.kind = 'flare'; }
    expect(s.status).toBe('lost'); expect(s.reason).toBe('inflammation overload');
  });

  it('the effort works by how many anti-inflammatory (violet) pixels sit near the edge in that direction', () => {
    const violet = blob(12, () => 2), amber = blob(12, () => 0), cyan = blob(12, () => 1);
    const p = (s: State) => exertEffect(s, 0).power;
    expect(p(violet)).toBeGreaterThan(p(amber) * 1.5);
    expect(p(amber)).toBeGreaterThan(p(cyan));
    // the same violet pixels buried inside the blob count for less than at the edge
    const core = blob(12, (i, j) => (i * i + j * j < 36 ? 2 : 1));
    const rim = blob(12, (i, j) => (i * i + j * j > 100 ? 2 : 1));
    expect(exertEffect(rim, 0).power).toBeGreaterThan(exertEffect(core, 0).power * 1.5);
    // and it only helps the direction you point at
    const half = blob(12, (i) => (i > 0 ? 2 : 1));
    expect(exertEffect(half, 0).power).toBeGreaterThan(exertEffect(half, Math.PI).power * 3);
  });

  it('pointing the effort at a hot sector cools it, pointing away does not', () => {
    const run = (angle: number) => { const s = blob(12, () => 2); s.wall.fill(0.3); s.wall[0] = 0.9; s.exert = angle; release(s); return s.wall[0]; };
    const toward = run(0.5 * TAU / balance.wallSectors);
    const away = run(Math.PI + 0.5 * TAU / balance.wallSectors);
    expect(toward).toBeLessThan(away - 0.15);
  });

  it('immune cells bite the first pixel they meet; violet evades most of them; the preview says so', () => {
    const bites = (c: number) => { let total = 0; for (let seed = 1; seed <= 6; seed++) { const s = blob(10, () => c, seed); ann(s, { immune: Array.from({ length: 6 }, (_, k) => ({ angle: west + (k - 3) * 0.1 })) }); release(s); advance(s); total += s.stats.immuneKilled; } return total; };
    expect(bites(2)).toBeLessThan(bites(0) / 2);
    const s = blob(10, () => 2); ann(s, { immune: [{ angle: west }] });
    expect(preview(s).immune[0].outcome).toBe('evade');
  });
});

describe('losing and winning', () => {
  it('loses when the population collapses', () => {
    const s = blob(2, () => 0); // far under the minimum
    release(s); advance(s);
    expect(s.status).toBe('lost'); expect(s.reason).toBe('the blob collapsed');
  });

  it('wins by surviving the final turn', () => {
    const s = blob(14, () => 1);
    s.turn = balance.turns.toWin - 1; beginTurn(s); ann(s, {});
    release(s); advance(s);
    expect(s.status).toBe('won');
  });
});

describe('balance sanity', () => {
  it('a planner that searches rotations and the effort direction beats doing nothing', () => {
    const play = (smart: boolean, seed: number) => {
      const s = createState(seed);
      while (s.status === 'run') { if (smart) { const p = bestPlan(s, 36, 12); s.theta = p.theta; s.exert = p.exert; } release(s); advance(s); }
      return s.turn;
    };
    let smart = 0, idle = 0;
    for (const seed of [1, 2, 3]) { smart += play(true, seed); idle += play(false, seed); }
    expect(smart).toBeGreaterThan(idle);
  }, 240000);
});
void cellAt; void eachCell;
