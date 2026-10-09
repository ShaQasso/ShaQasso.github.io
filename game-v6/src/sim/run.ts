import { count } from '../engine/geometry';
import { createState, nextCycle, step } from '../engine/sim';
import { BOTS } from './bots';

const N = Number(process.argv[2] ?? 10);
const only = process.argv[3];

function play(name: string, seed: number) {
  const s = createState(seed);
  let r = seed >>> 0;
  const rnd = () => { r = (r + 0x6d2b79f5) >>> 0; let t = r; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const bot = BOTS[name];
  let tick = 0, cells = 0, ticks = 0, infl = 0;
  while (s.status === 'run') {
    if (s.phase === 'groom') { while (s.phase === 'groom') bot.groom(s, rnd); continue; }
    if (s.phase === 'checkup') { nextCycle(s); continue; }
    if (tick % 5 === 0) bot.tick(s, rnd);
    step(s); tick++;
    if (tick % 20 === 0) { cells += count(s); ticks++; infl += s.inflammation; }
  }
  return { s, cells: cells / Math.max(1, ticks), infl: infl / Math.max(1, ticks) };
}

console.log('bot               win%  cycle  cells  infl  hits  lysed  immune  abx  coats  peak  reasons');
for (const name of Object.keys(BOTS)) {
  if (only && name !== only) continue;
  const a = { win: 0, cycle: 0, cells: 0, infl: 0, hits: 0, lysed: 0, immune: 0, abx: 0, coats: 0, peak: 0 };
  const reasons: Record<string, number> = {};
  for (let seed = 1; seed <= N; seed++) {
    const r = play(name, seed);
    if (r.s.status === 'won') a.win++;
    a.cycle += r.s.cycle; a.cells += r.cells; a.infl += r.infl; a.hits += r.s.stats.hits; a.lysed += r.s.stats.lysed; a.immune += r.s.stats.immuneKilled; a.abx += r.s.stats.abxKilled; a.coats += r.s.stats.coats;
    a.peak += Math.max(...r.s.history.map((h) => h.peak), 0);
    reasons[r.s.reason] = (reasons[r.s.reason] ?? 0) + 1;
  }
  const f = (v: number, d = 0, w = 5) => (v / N).toFixed(d).padStart(w);
  console.log(name.padEnd(17), f(100 * a.win, 0, 4), f(a.cycle, 1, 6), f(a.cells, 0, 6), f(a.infl, 2, 5), f(a.hits, 0, 5), f(a.lysed, 0, 6), f(a.immune, 0, 7), f(a.abx, 0, 4), f(a.coats, 0, 6), f(a.peak, 2, 5), JSON.stringify(reasons));
}
