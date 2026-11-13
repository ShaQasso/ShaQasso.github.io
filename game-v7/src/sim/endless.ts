// How far bots get when they keep going after remission: `tsx src/sim/endless.ts [seeds] [bot]`
import { createState, keepGoing, nextCycle, step } from '../engine/sim';
import { score } from '../engine/score';
import { BOTS } from './bots';

const N = Number(process.argv[2] ?? 8), name = process.argv[3] ?? 'smart';
let months = 0, sc = 0, remission = 0; const peaks: number[][] = [];
for (let seed = 1; seed <= N; seed++) {
  const s = createState(seed); const bot = BOTS[name];
  let r = seed >>> 0; const rnd = () => { r = (r + 0x6d2b79f5) >>> 0; let t = r; t = Math.imul(t ^ (t >>> 15), t | 1); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  let k = 0;
  while (s.cycle < 20) {
    if (s.status === 'won') { remission++; keepGoing(s); continue; }
    if (s.status !== 'run') break;
    if (s.phase === 'groom') { while (s.phase === 'groom') bot.groom(s, rnd); continue; }
    if (s.phase === 'checkup') { nextCycle(s); continue; }
    if (k++ % 5 === 0) bot.tick(s, rnd);
    step(s);
  }
  months += s.history.length; sc += score(s).total; peaks.push(s.history.map((h) => Math.round(h.peak * 100)));
}
console.log(`${name}: remission ${remission}/${N}, months survived ${(months / N).toFixed(1)}, score ${Math.round(sc / N)}`);
for (const p of peaks.slice(0, 6)) console.log('  peaks', p.join(' '));
