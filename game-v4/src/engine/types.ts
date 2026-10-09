export interface Cell { c: number; inf: number; ph: number; gen: number; cd: number }
export interface Phage { r: number; angle: number; mask: number }
export interface ImmuneCell { r: number; angle: number }
export interface Abx { t0: number; angle: number; half: number; fired: boolean }
export interface Flare { t0: number; dur: number; angle: number; half: number; power: number }
export interface GameEvent { kind: 'infect' | 'deflect' | 'mucus' | 'lysis' | 'abx' | 'secrete' | 'starve' | 'immune' | 'evade'; x: number; y: number; mask?: number; c?: number }

export interface State {
  t: number;
  rng: number;
  cells: (Cell | null)[]; // (2R+1)^2 grid of pixels, row-major, local (blob-fixed) coordinates, centre at (0,0)
  theta: number; omega: number; cmd: number; // whole-blob rotation
  phages: Phage[]; immune: ImmuneCell[];
  spawning: boolean; // random phages and immune cells (tests switch this off)
  immuneSpawning: boolean; // the inflamed wall fires immune cells
  mutating: boolean; // colour phase switches (tests switch this off)
  phageAcc: number; immuneAcc: number[];
  abx: Abx[]; flares: Flare[];
  gaps: { start: number; end: number }[];
  wall: number[]; // inflammation per world sector
  inflammation: number;
  health: number;
  mucus: number; // seconds of mucus left
  secreteCd: number;
  endT: number;
  status: 'run' | 'won' | 'lost';
  reason: string;
  events?: GameEvent[];
  stats: { lysed: number; hits: number; deflected: number; blocked: number; flips: number; births: number; abxKilled: number; immuneKilled: number; immuneEvaded: number; secretes: number; starved: number };
}
