export type Shape = 'd' | 'c' | 't' | 's' | 'x'; // 'x' = no phage receptor (pathogens)
export interface Coat { shape: Shape; immune: number; growth: number; armored?: boolean }
export interface SpeciesDef { name: string; interval: number; flip: number; coats: Coat[]; pathogen?: boolean }
export interface MealDef {
  name: string; dur: number;
  growthDefault?: number; growthBySpecies?: Record<string, number>;
  flipMult?: number; flipBias?: { species?: string; coat: number | 'calm'; strength: number };
  inflAdd?: number; phageSpeedMult?: number;
}

export interface Cell { sp: string; coat: number; inf: number; cd: number; gen?: number }
export interface Ring { n: number; off: number; omega: number; cmd: number; cells: (Cell | null)[] }
export interface Particle { r: number; angle: number; shape: Shape; kind?: 'phage' | 'invader' }

export type Mix = Record<Shape, number>;
export interface WaveSpec { kind?: 'phage' | 'invader'; t0: number; dur: number; center: number; half: number; drift: number; rate: number; mixA: Mix; mixB: Mix }
export interface AntibioticSpec { t0: number; center: number; half: number; fired: boolean }

export interface State {
  t: number;
  rng: number;
  rings: Ring[];
  particles: Particle[];
  waves: WaveSpec[];
  waveAcc: number[];
  antibiotics: AntibioticSpec[];
  gaps: { start: number; end: number; offered: boolean }[];
  offer: string[] | null;
  meal: { id: string; left: number } | null;
  inflammation: number;
  health: number;
  dysbiosis: number;
  endT: number;
  status: 'run' | 'won' | 'lost';
  reason: string;
  stats: { lysed: number; flips: number; births: number; killed: number; invaded: number; blocked: number; cleared: number };
}
