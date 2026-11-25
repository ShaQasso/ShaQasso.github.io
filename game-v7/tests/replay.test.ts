import { describe, expect, it } from 'vitest';
import { cellAt, eachCell } from '../src/engine/geometry';
import { Recorder, dailySeed, replay, type Move } from '../src/engine/replay';
import { score } from '../src/engine/score';
import { createState, nextCycle, step } from '../src/engine/sim';
import type { State } from '../src/engine/types';
import { BOTS } from '../src/sim/bots';

const mkRnd = (seed: number) => { let r = seed >>> 0; return () => { r = (r + 0x6d2b79f5) >>> 0; let t = r; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

/** Play like a person would, through the recorder: the smart bot steers, cards go to random valid spots. */
function playRecorded(seed: number, monthsCap: number): { s: State; moves: Move[] } {
  const s = createState(seed), rec = new Recorder(), rnd = mkRnd(seed * 7 + 1), bot = BOTS.smart;
  let k = 0, wentOn = false;
  for (let guard = 0; guard < 3_000_000; guard++) {
    if (s.status === 'won' && !wentOn) { wentOn = true; rec.more(s); continue; }
    if (s.status !== 'run') break;
    if (s.phase === 'groom') {
      if (!s.pending) { rec.pick(s, Math.floor(rnd() * s.offer.length)); continue; }
      if (s.pending.target === 'blob') { const cells: [number, number][] = []; eachCell(s, (_, i, j) => cells.push([i, j])); const [i, j] = cells[Math.floor(rnd() * cells.length)]; rec.place(s, { i, j }); }
      else rec.place(s, { sector: Math.floor(rnd() * s.wall.length) });
      continue;
    }
    if (s.phase === 'checkup') { if (s.cycle >= monthsCap) break; rec.next(s); continue; }
    const before = s.cmd;
    if (k++ % 5 === 0) bot.tick(s, rnd);
    rec.turn(before, s.cmd); step(s); rec.stepped();
  }
  return { s, moves: rec.moves };
}

const fingerprint = (s: State) => JSON.stringify({ status: s.status, cycle: s.cycle, stats: s.stats, theta: s.theta, wall: s.wall, cells: s.cells, score: score(s) });

describe('replays', () => {
  it('a recorded run replays to exactly the same game', () => {
    for (const seed of [11, 2026]) {
      const { s, moves } = playRecorded(seed, 8);
      const r = replay(seed, moves);
      expect(r.complete).toBe(true);
      expect(fingerprint(r.state)).toBe(fingerprint(s));
    }
  }, 280000);

  it('a doctored run is caught: a different move gives a different score, a bogus move is refused', () => {
    const seed = 5, { s, moves } = playRecorded(seed, 4);
    const turns = moves.map((m, i) => [m, i] as const).filter(([m]) => m[0] === 'r');
    const doctored = moves.slice(); const [m, at] = turns[Math.floor(turns.length / 2)];
    doctored[at] = ['r', m[1] as number, -(m[2] as number) || 1];
    expect(fingerprint(replay(seed, doctored).state)).not.toBe(fingerprint(s));
    expect(replay(seed, [['p', 9]]).complete).toBe(false); // there is no tenth card
    expect(replay(seed, [...moves, ['r', 0, 1]]).complete).toBe(false); // a turn back in time
  }, 280000);
});

describe('the daily world', () => {
  /** Everything the world throws at the colony: cards offered, flares (when and how big), antibiotic sweeps and phage volleys. */
  function worldLog(bot: string, seed: number, months: number): string[] {
    const s = createState(seed), b = BOTS[bot], rnd = mkRnd(seed), log: string[] = [], seen = new WeakSet<object>();
    let k = 0, waveStep = 0;
    while (s.status === 'run' && s.cycle <= months) {
      if (s.phase === 'groom') { log.push(`m${s.cycle} offer ${s.offer.join(',')}`); while (s.phase === 'groom') b.groom(s, rnd); waveStep = 0; continue; }
      if (s.phase === 'checkup') { nextCycle(s); continue; }
      if (waveStep === 0) {
        for (const f of s.flares) log.push(`m${s.cycle} flare ${f.kind} ${f.t0.toFixed(9)}-${f.t1.toFixed(9)} half ${f.half.toFixed(9)}`);
        for (const a of s.abx) log.push(`m${s.cycle} abx ${a.t0.toFixed(9)} ${a.angle.toFixed(9)}`);
      }
      if (k++ % 5 === 0) b.tick(s, rnd);
      step(s); waveStep++;
      for (const p of s.phages) if (!seen.has(p)) { seen.add(p); log.push(`m${s.cycle} step ${waveStep} phage ${p.mask} ${p.angle.toFixed(9)}`); }
    }
    return log;
  }
  it('an idle player and a smart player face the same cards, flares, sweeps and phages on the same seed', () => {
    const seed = dailySeed('2026-11-25');
    const a = worldLog('idle', seed, 4), b = worldLog('smart', seed, 4);
    // the idle player loses in month 3 on this seed, so compare everything up to that point (offers, flares, sweeps and about 40 volleys)
    const n = Math.min(a.length, b.length);
    expect(a.slice(0, n)).toEqual(b.slice(0, n));
    expect(n).toBeGreaterThan(60);
  }, 280000);

  it('each day has its own seed, and a day always has the same one', () => {
    expect(dailySeed('2026-11-25')).toBe(dailySeed('2026-11-25'));
    expect(dailySeed('2026-11-25')).not.toBe(dailySeed('2026-11-26'));
    const a = createState(dailySeed('2026-11-25')), b = createState(dailySeed('2026-11-26'));
    let same = 0, all = 0; eachCell(a, (c, i, j) => { all++; if (cellAt(b, i, j)?.c === c.c) same++; });
    expect(same).toBeLessThan(all);
  });
});
