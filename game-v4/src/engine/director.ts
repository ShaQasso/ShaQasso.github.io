import balance from '../data/balance.json';
import { rand, randRange } from './rng';
import { TAU } from './geometry';
import type { Abx, Flare, State, Volley } from './types';

const D = balance.director;

/** Pre-computes the run's schedule from the seed: single-colour volleys first, two-colour phages and antibiotics later. */
export function buildSchedule(s: State): void {
  const volleys: Volley[] = [], abx: Abx[] = [], flares: Flare[] = [], gaps: State['gaps'] = [];
  for (let act = 0; act < D.acts; act++) {
    const start = act * (D.actLen + D.gapLen);
    const last = act === D.acts - 1;
    const n = 2 + act + (last ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const dur = randRange(s, 10, 16);
      const colourA = Math.floor(rand(s) * 3);
      let mask = 1 << colourA;
      if (act >= D.twoColourAct && rand(s) < D.twoColourProb) mask |= 1 << ((colourA + 1 + Math.floor(rand(s) * 2)) % 3);
      volleys.push({
        t0: start + 2 + (i / n) * (D.actLen - dur - 4) + randRange(s, -1.5, 1.5), dur,
        angle: rand(s) * TAU, half: randRange(s, D.arcHalf[0], D.arcHalf[1]), drift: randRange(s, -0.12, 0.12),
        rate: D.baseRate * Math.pow(D.actGrowth, act) * (1 + randRange(s, 0, 0.4)) * D.rateScale, mask,
      });
    }
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
  volleys.sort((a, b) => a.t0 - b.t0);
  s.volleys = volleys; s.volAcc = volleys.map(() => 0); s.abx = abx; s.flares = flares; s.gaps = gaps;
  s.endT = D.acts * D.actLen + (D.acts - 1) * D.gapLen;
}
