import { createState, diversity, step } from '../engine/sim';
import { allCells } from '../engine/geometry';
import { BOTS } from './bots';

const N = Number(process.argv[2] ?? 100);
const only = process.argv[3];

function play(botName: string, seed: number) {
  const s = createState(seed);
  const bot = BOTS[botName];
  let tick = 0, inflSum = 0;
  while (s.status === 'run') {
    if (tick % 5 === 0) bot(s);
    step(s);
    inflSum += s.inflammation;
    tick++;
  }
  return { s, div: diversity(s), cells: allCells(s).length, avgInfl: inflSum / tick };
}

console.log('bot      win%   avg t(s)  cells  diversity  lysed  invaded cleared  infl  mean-infl  reasons');
for (const name of Object.keys(BOTS)) {
  if (only && name !== only) continue;
  let avgI = 0, wins = 0, t = 0, cells = 0, div = 0, lysed = 0, inv = 0, clr = 0, infl = 0;
  const reasons: Record<string, number> = {};
  for (let seed = 1; seed <= N; seed++) {
    const r = play(name, seed);
    if (r.s.status === 'won') wins++;
    t += r.s.t; cells += r.cells; div += r.div; lysed += r.s.stats.lysed; inv += r.s.stats.invaded; clr += r.s.stats.cleared; infl += r.s.inflammation; avgI += r.avgInfl;
    reasons[r.s.reason] = (reasons[r.s.reason] ?? 0) + 1;
  }
  console.log(
    name.padEnd(8), (100 * wins / N).toFixed(0).padStart(4), t / N > 0 ? (t / N).toFixed(0).padStart(9) : '',
    (cells / N).toFixed(0).padStart(6), (div / N).toFixed(2).padStart(9), (lysed / N).toFixed(0).padStart(7), (inv / N).toFixed(0).padStart(8), (clr / N).toFixed(0).padStart(7), (infl / N).toFixed(2).padStart(6), (avgI / N).toFixed(2).padStart(10), JSON.stringify(reasons),
  );
}
