import balance from '../data/balance.json';
import { rand, randRange } from './rng';
import { TAU } from './geometry';
import type { AntibioticSpec, FlareSpec, Mix, Shape, State, WaveSpec } from './types';

const SHAPES: Shape[] = ['d', 'c', 't', 's'];

function mixOf(s: State, main: Shape): Mix {
  const m = { d: 0.07, c: 0.07, t: 0.07, s: 0.07 } as Mix;
  m[main] = 0.79;
  void s;
  return m;
}

/**
 * Pre-computes the whole run's wave schedule from the seed.
 * Waves overlap, drift in direction and change composition mid-wave; the last act stacks them and adds antibiotic sweeps.
 */
export function buildSchedule(s: State): void {
  const d = balance.director;
  const waves: WaveSpec[] = [];
  const antibiotics: AntibioticSpec[] = [];
  const flares: FlareSpec[] = [];
  const gaps: State['gaps'] = [];
  for (let act = 0; act < d.acts; act++) {
    const start = act * (d.actLen + d.gapLen);
    const last = act === d.acts - 1;
    const nWaves = 2 + act + (last ? 1 : 0);
    for (let i = 0; i < nWaves; i++) {
      const dur = randRange(s, 14, 22);
      const t0 = start + 2 + (i / nWaves) * (d.actLen - dur - 4) + randRange(s, -2, 2);
      const a = SHAPES[Math.floor(rand(s) * 4)];
      let b = SHAPES[Math.floor(rand(s) * 4)];
      if (b === a) b = SHAPES[(SHAPES.indexOf(a) + 1) % 4];
      waves.push({
        t0: Math.max(start + 1, t0), dur,
        center: rand(s) * TAU,
        half: randRange(s, 0.45, 0.85),
        drift: randRange(s, -0.15, 0.15),
        // attacks start as single phages every few seconds and build up act by act
        rate: balance.director.baseRate * Math.pow(balance.director.actGrowth, act) * (1 + randRange(s, 0, 0.4)) * balance.director.rateScale,
        mixA: mixOf(s, a), mixB: mixOf(s, b),
      });
    }
    // infections (pathogen invaders) are switched off for now: set director.invaders to 1 to bring them back
    if (balance.director.invaders && act >= balance.director.invaderFirstAct) {
      const nInv = act - balance.director.invaderFirstAct + 1;
      for (let i = 0; i < nInv; i++) {
        waves.push({
          kind: 'invader', t0: start + 8 + (i / nInv) * (d.actLen - 24) + randRange(s, 0, 4), dur: randRange(s, 8, 12),
          center: rand(s) * TAU, half: randRange(s, 0.6, 1.0), drift: 0,
          rate: randRange(s, 1.0, 1.6), mixA: mixOf(s, 'd'), mixB: mixOf(s, 'd'),
        });
      }
    }
    // inflammation flares: a hot patch on the wall that has to be cooled by rotating calming cells under it
    if (act >= balance.flare.firstAct) {
      const n = act - balance.flare.firstAct + 1;
      for (let i = 0; i < n; i++) {
        flares.push({
          t0: start + 10 + ((i + 0.3) / n) * (d.actLen - 26), dur: balance.flare.dur, center: rand(s) * TAU,
          half: randRange(s, 0.45, 0.7), power: balance.flare.power * (1 + 0.15 * (act - balance.flare.firstAct)),
        });
      }
    }
    if (act >= balance.director.antibioticAct) {
      const n = last ? 2 : 1;
      for (let i = 0; i < n; i++) {
        antibiotics.push({
          t0: start + (d.actLen * (i + 1)) / (n + 1) + 6, center: rand(s) * TAU,
          half: randRange(s, 0.5, 0.8), fired: false,
        });
      }
    }
    if (act < d.acts - 1) gaps.push({ start: start + d.actLen, end: start + d.actLen + d.gapLen, offered: false });
  }
  s.waves = waves;
  s.waveAcc = waves.map(() => 0);
  s.antibiotics = antibiotics;
  s.flares = flares;
  s.gaps = gaps;
  s.endT = d.acts * d.actLen + (d.acts - 1) * d.gapLen;
}

export function mixAt(w: WaveSpec, t: number): Mix {
  const f = Math.min(1, Math.max(0, (t - w.t0) / w.dur));
  const k = f < 0.5 ? 0 : (f - 0.5) * 2; // first half pure A, then morph to B
  const m = {} as Mix;
  for (const sh of SHAPES) m[sh] = w.mixA[sh] * (1 - k) + w.mixB[sh] * k;
  return m;
}
