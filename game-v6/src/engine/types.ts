export interface Cell { c: number; inf: number; ph: number; gen: number; m: number; mcd: number }
export interface Phage { r: number; angle: number; mask: number }
export interface ImmuneCell { r: number; angle: number }
export interface Abx { t0: number; angle: number; half: number; fired: boolean }
export interface FlareSeg { t0: number; t1: number; angle: number; half: number; intensity: number; kind: 'pre' | 'flare' | 'after' }
export interface Mod { id: string; left: number }
export interface Held { id: string; charges: number }
export interface GameEvent { kind: 'infect' | 'deflect' | 'coat' | 'lysis' | 'abx' | 'immune' | 'evade' | 'steroid' | 'burst' | 'turn' | 'patch'; x: number; y: number; mask?: number; c?: number }
export type Phase = 'groom' | 'wave' | 'checkup';

export interface CycleStats { lost: number; hits: number; peak: number; coats: number; abx: number; immune: number }

export interface State {
  rng: number;
  t: number; // total real time in waves
  cells: (Cell | null)[]; // (2R+1)^2 pixel grid in blob-fixed coordinates
  theta: number; omega: number; cmd: number;
  cycle: number; phase: Phase;
  offer: string[]; picksLeft: number;
  held: Held | null; mods: Mod[];
  phaseQueue: { colour: number; n: number } | null;
  waveT: number; waveLen: number;
  abx: Abx[]; flares: FlareSeg[];
  phages: Phage[]; immune: ImmuneCell[];
  phageAcc: number; immuneAcc: number;
  wall: number[]; cooling: number[]; inflammation: number; drift: number;
  overloadT: number; coatAcc: number; coolAcc: number;
  spawning: boolean; mutating: boolean; coating: boolean;
  cyc: CycleStats; history: CycleStats[];
  status: 'run' | 'won' | 'lost'; reason: string;
  events?: GameEvent[];
  stats: { lysed: number; hits: number; deflected: number; blocked: number; births: number; abxKilled: number; immuneKilled: number; immuneEvaded: number; flips: number; coats: number; cards: number };
}
