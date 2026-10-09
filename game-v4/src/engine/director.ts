import balance from '../data/balance.json';
import { rand, randRange } from './rng';
import { TAU } from './geometry';
import type { Abx, Flare, State } from './types';

const D = balance.director;

/** Pre-computes antibiotic sweeps, inflammation flares and calm gaps. Phages arrive randomly from every side (see sim.ts). */
export function buildSchedule(s: State): void {
  const abx: Abx[] = [], flares: Flare[] = [], gaps: State['gaps'] = [];
  for (let act = 0; act < D.acts; act++) {
    const start = act * (D.actLen + D.gapLen);
    const last = act === D.acts - 1;
    if (act >= D.abxAct) {
      const k = last ? 2 : 1;
      for (let i = 0; i < k; i++) abx.push({ t0: start + (D.actLen * (i + 1)) / (k + 1) + 5, angle: rand(s) * TAU, half: randRange(s, 0.5, 0.8), fired: false });
    }
    if (act >= D.flareAct) {
      const k = act - D.flareAct + 1;
      for (let i = 0; i < k; i++) {
        flares.push({ t0: start + 10 + ((i + 0.3) / k) * (D.actLen - 26), dur: balance.flare.dur, angle: rand(s) * TAU,
          half: randRange(s, 0.45, 0.7), power: balance.flare.power * (1 + 0.15 * (act - D.flareAct)) });
      }
    }
    if (act < D.acts - 1) gaps.push({ start: start + D.actLen, end: start + D.actLen + D.gapLen });
  }
  s.abx = abx; s.flares = flares; s.gaps = gaps;
  s.endT = D.acts * D.actLen + (D.acts - 1) * D.gapLen;
}
