export interface Cell { c: number; inf: number; ph: number; gen: number }
export interface Phage { r: number; angle: number; mask: number }
export interface ImmuneCell { r: number; angle: number }
export interface Announce {
  phages: { angle: number; mask: number }[];
  immune: { angle: number }[];
  abx: { angle: number; half: number } | null;
}
export type SectionKind = 'quiet' | 'pre' | 'flare' | 'after';
export interface Section { kind: SectionKind; left: number; total: number; intensity: number; angle: number; half: number }
export interface GameEvent { kind: 'infect' | 'deflect' | 'mucus' | 'lysis' | 'abx' | 'immune' | 'evade' | 'cool' | 'perfect' | 'skip'; x: number; y: number; mask?: number; c?: number }

export type Phase = 'plan' | 'resolve' | 'regrow';

export interface State {
  rng: number;
  t: number; // animation clock (seconds of resolve/regrow)
  cells: (Cell | null)[]; // (2R+1)^2 pixel grid, local blob-fixed coordinates, centre (0,0)
  theta: number; // rotation chosen for this turn
  exert: number; // direction (world angle) of the anti-inflammatory effort
  turn: number;
  phase: Phase;
  phaseT: number;
  timer: number; timerMax: number;
  ann: Announce;
  phages: Phage[]; immune: ImmuneCell[]; // in flight during a resolve
  section: Section;
  lastAbxTurn: number;
  wall: number[]; // inflammation per world sector
  inflammation: number;
  mucusTurns: number; mucusCd: number;
  skips: number; streak: number; bestStreak: number; perfects: number;
  skipped: boolean;
  turnHits: number; turnBites: number; // per-turn counters used for the parry rule
  status: 'run' | 'won' | 'lost';
  reason: string;
  events?: GameEvent[];
  stats: { lysed: number; hits: number; deflected: number; blocked: number; births: number; abxKilled: number; immuneKilled: number; immuneEvaded: number; flips: number; skipsUsed: number };
}
