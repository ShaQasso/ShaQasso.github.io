import { count } from '../engine/geometry';
import { bestPlan } from '../engine/plan';
import { createState, step } from '../engine/sim';
import { BOTS } from './bots';

const N = Number(process.argv[2] ?? 20);
const only = process.argv[3];

function play(name: string, seed: number) {
  const s = createState(seed);
  let r = seed >>> 0;
  const rnd = () => { r = (r + 0x6d2b79f5) >>> 0; let t = r; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  let turns = 0, perfectAvail = 0, phageTurns = 0, cells = 0, infl = 0;
  while (s.status === 'run') {
    if (s.ann.phages.length > 0 && name === 'planner') { phageTurns++; if (bestPlan(s, 36, 1).perfect) perfectAvail++; }
    BOTS[name](s, rnd);
    for (let k = 0; s.phase !== 'plan' && s.status === 'run' && k < 4000; k++) step(s);
    turns++; cells += count(s); infl += s.inflammation;
  }
  return { s, turns, perfectAvail, phageTurns, cells: cells / turns, infl: infl / turns };
}

console.log('bot            win%  turns  cells  infl  perfect%  avail%  skips  hits  lysed  immune  reasons');
for (const name of Object.keys(BOTS)) {
  if (only && name !== only) continue;
  const a = { win: 0, turns: 0, cells: 0, infl: 0, perf: 0, pt: 0, pa: 0, skips: 0, hits: 0, lysed: 0, immune: 0 };
  const reasons: Record<string, number> = {};
  for (let seed = 1; seed <= N; seed++) {
    const r = play(name, seed);
    if (r.s.status === 'won') a.win++;
    a.turns += r.turns; a.cells += r.cells; a.infl += r.infl; a.perf += r.s.perfects; a.pt += r.phageTurns; a.pa += r.perfectAvail;
    a.skips += r.s.stats.skipsUsed; a.hits += r.s.stats.hits; a.lysed += r.s.stats.lysed; a.immune += r.s.stats.immuneKilled;
    reasons[r.s.reason] = (reasons[r.s.reason] ?? 0) + 1;
  }
  const f = (v: number, d = 0, w = 5) => (v / N).toFixed(d).padStart(w);
  console.log(name.padEnd(14), f(100 * a.win, 0, 4), f(a.turns, 1, 6), f(a.cells, 0, 6), f(a.infl, 2, 5), f(a.perf, 1, 9), (a.pt ? (100 * a.pa / a.pt).toFixed(0) : '-').padStart(7), f(a.skips, 1, 6), f(a.hits, 0, 5), f(a.lysed, 0, 6), f(a.immune, 0, 7), JSON.stringify(reasons));
}
