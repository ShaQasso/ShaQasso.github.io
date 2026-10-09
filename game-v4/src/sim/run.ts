import { count } from '../engine/geometry';
import { createState, diversity, step } from '../engine/sim';
import { BOTS } from './bots';

const N = Number(process.argv[2] ?? 60);
const only = process.argv[3];

function play(name: string, seed: number) {
  const s = createState(seed);
  let tick = 0, cells = 0, div = 0, samples = 0, infl = 0;
  while (s.status === 'run') {
    if (tick % 5 === 0) BOTS[name](s);
    step(s);
    if (tick % 20 === 0) { cells += count(s); div += diversity(s); infl += s.inflammation; samples++; }
    tick++;
  }
  return { s, cells: cells / samples, div: div / samples, infl: infl / samples };
}

console.log('bot       win%  t(s)  cells  div  hits  lysed  casc  deflect  mucus  secr  abx  immune  infl  reasons');
for (const name of Object.keys(BOTS)) {
  if (only && name !== only) continue;
  const a = { win: 0, t: 0, cells: 0, div: 0, hits: 0, lysed: 0, defl: 0, blocked: 0, secr: 0, abx: 0, immune: 0, infl: 0 };
  const reasons: Record<string, number> = {};
  for (let seed = 1; seed <= N; seed++) {
    const r = play(name, seed);
    if (r.s.status === 'won') a.win++;
    a.t += r.s.t; a.cells += r.cells; a.div += r.div; a.hits += r.s.stats.hits; a.lysed += r.s.stats.lysed; a.defl += r.s.stats.deflected;
    a.blocked += r.s.stats.blocked; a.secr += r.s.stats.secretes; a.abx += r.s.stats.abxKilled; a.immune += r.s.stats.immuneKilled; a.infl += r.infl;
    reasons[r.s.reason] = (reasons[r.s.reason] ?? 0) + 1;
  }
  const f = (v: number, d = 0, w = 5) => (v / N).toFixed(d).padStart(w);
  console.log(name.padEnd(9), f(100 * a.win, 0, 4), f(a.t, 0, 5), f(a.cells, 0, 6), f(a.div, 2, 5), f(a.hits, 0, 5), f(a.lysed, 0, 6),
    (a.lysed / Math.max(1, a.hits)).toFixed(2).padStart(5), f(a.defl, 0, 8), f(a.blocked, 0, 6), f(a.secr, 1, 5), f(a.abx, 0, 4), f(a.immune, 0, 7), f(a.infl, 2, 5), JSON.stringify(reasons));
}
