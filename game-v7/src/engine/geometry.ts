import balance from '../data/balance.json';
import type { Cell, State } from './types';

export const TAU = Math.PI * 2;
export const R = balance.R;
export const W = 2 * R + 1;
export const wrap = (a: number) => ((a % TAU) + TAU) % TAU;
export const angDiff = (a: number, b: number) => { const d = wrap(b - a); return d > Math.PI ? d - TAU : d; };

export const inside = (i: number, j: number) => i * i + j * j <= R * R;
export const idx = (i: number, j: number) => (j + R) * W + (i + R);
export const cellAt = (s: State, i: number, j: number): Cell | null => (inside(i, j) ? s.cells[idx(i, j)] : null);
export const NEIGH: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export function eachCell(s: State, f: (c: Cell, i: number, j: number) => void): void {
  for (let j = -R; j <= R; j++) for (let i = -R; i <= R; i++) {
    const c = s.cells[idx(i, j)];
    if (c) f(c, i, j);
  }
}
export const count = (s: State) => { let n = 0; eachCell(s, () => n++); return n; };

/** World angle (radians, clockwise) of a local cell given the blob's rotation. */
export const worldAngle = (s: State, i: number, j: number) => wrap(Math.atan2(j, i) + s.theta);
export const sectorOfAngle = (a: number, sectors: number) => Math.floor(wrap(a) / (TAU / sectors)) % sectors;

/** A cell is exposed when it touches empty space (it is on the surface). */
export function exposed(s: State, i: number, j: number): boolean {
  for (const [di, dj] of NEIGH) if (!inside(i + di, j + dj) || !s.cells[idx(i + di, j + dj)]) return true;
  return false;
}
