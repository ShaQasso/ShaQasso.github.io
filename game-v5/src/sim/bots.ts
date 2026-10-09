import { TAU } from '../engine/geometry';
import { bestPlan } from '../engine/plan';
import { release, skipTurn } from '../engine/sim';
import type { State } from '../engine/types';

export type Bot = (s: State, rnd: () => number) => void;

/** Does nothing: releases the turn with the starting rotation. */
export const idleBot: Bot = (s) => { release(s); };

/** Random rotation and effort direction. */
export const randomBot: Bot = (s, rnd) => { s.theta = rnd() * TAU; s.exert = rnd() * TAU; release(s); };

/** Searches every rotation and effort direction, minimising the predicted loss and maximising the cooling it earns. */
export const plannerBot: Bot = (s) => {
  const p = bestPlan(s);
  s.theta = p.theta; s.exert = p.exert;
  if (p.loss >= 60 && s.skips > 0 && skipTurn(s)) return;
  release(s);
};

/** The planner without the skip: shows what skips are worth. */
export const plannerNoSkipBot: Bot = (s) => { const p = bestPlan(s); s.theta = p.theta; s.exert = p.exert; release(s); };

/** Rotates well but ignores inflammation (random effort direction). */
export const rotateOnlyBot: Bot = (s, rnd) => { const p = bestPlan(s, 72, 1); s.theta = p.theta; s.exert = rnd() * TAU; release(s); };

export const BOTS: Record<string, Bot> = { idle: idleBot, random: randomBot, rotateOnly: rotateOnlyBot, plannerNoSkip: plannerNoSkipBot, planner: plannerBot };
