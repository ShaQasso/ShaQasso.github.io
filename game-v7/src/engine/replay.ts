import { createState, keepGoing, nextCycle, pickCard, placeTarget, setRotation, step } from './sim';
import type { State } from './types';

/**
 * A run is its seed plus the player's moves. Everything else follows from the engine, so a leaderboard
 * server can replay the moves and work out the score itself instead of trusting the browser.
 *
 *   ['r', step, cmd]   turn command from this wave step on (only recorded when it changes)
 *   ['p', card]        pick a card from the offer
 *   ['b', i, j]        place it on a cell of the colony
 *   ['w', sector]      place it on a section of the gut wall
 *   ['n']              continue after the monthly checkup
 *   ['k']              keep going after remission
 */
export type Move = ['r', number, number] | ['p', number] | ['b', number, number] | ['w', number] | ['n'] | ['k'];

export class Recorder {
  moves: Move[] = [];
  steps = 0;
  /** Call around each wave step: the turn command the input set for this step. */
  turn(before: number, after: number): void { if (after !== before) this.moves.push(['r', this.steps, after]); }
  stepped(): void { this.steps++; }
  pick(s: State, i: number): boolean { const ok = pickCard(s, i); if (ok) this.moves.push(['p', i]); return ok; }
  place(s: State, t: { i?: number; j?: number; sector?: number }): boolean {
    const ok = placeTarget(s, t);
    if (ok) this.moves.push(t.sector !== undefined ? ['w', t.sector] : ['b', t.i!, t.j!]);
    return ok;
  }
  next(s: State): void { if (s.status === 'run' && s.phase === 'checkup') { nextCycle(s); this.moves.push(['n']); } }
  more(s: State): boolean { const ok = keepGoing(s); if (ok) this.moves.push(['k']); return ok; }
}

/** Steps a replay may run before it is treated as bogus (about 60 months of waves). */
export const MAX_STEPS = 2_000_000;

/** Replay a run. `complete` is false if the moves stop early, break the rules, or run past the step limit. */
export function replay(seed: number, moves: Move[]): { state: State; complete: boolean } {
  const s = createState(seed);
  let m = 0, steps = 0;
  const fail = () => ({ state: s, complete: false });
  for (;;) {
    const mv = moves[m];
    if (s.status === 'won') {
      if (mv && mv[0] === 'k' && keepGoing(s)) { m++; continue; }
      break;
    }
    if (s.status !== 'run') break;
    if (s.phase === 'groom') {
      if (!mv) return fail();
      const ok = mv[0] === 'p' ? pickCard(s, mv[1]) : mv[0] === 'b' ? placeTarget(s, { i: mv[1], j: mv[2] }) : mv[0] === 'w' ? placeTarget(s, { sector: mv[1] }) : false;
      if (!ok) return fail();
      m++; continue;
    }
    if (s.phase === 'checkup') {
      if (!mv) break; // a run may end at a checkup
      if (mv[0] !== 'n') return fail();
      nextCycle(s); m++; continue;
    }
    // wave
    if (mv && mv[0] === 'r') {
      if (mv[1] < steps) return fail();
      if (mv[1] === steps) { if (typeof mv[2] !== 'number' || !Number.isFinite(mv[2])) return fail(); setRotation(s, mv[2]); m++; continue; }
    }
    step(s); steps++;
    if (steps > MAX_STEPS) return fail();
  }
  return { state: s, complete: m === moves.length };
}

/** The daily seed: everyone who plays on the same date (UTC) gets the same world. */
export function dailySeed(date: string): number {
  let h = 0x811c9dc5;
  for (const ch of `mbiota-remission:${date}`) { h ^= ch.charCodeAt(0); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
export const todayUTC = (d = new Date()) => d.toISOString().slice(0, 10);
