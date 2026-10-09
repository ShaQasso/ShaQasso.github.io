import type { Cell, State } from './types';

export const TAU = Math.PI * 2;
export const wrap = (a: number) => ((a % TAU) + TAU) % TAU;
/** Shortest signed angular difference b - a in (-PI, PI]. */
export const angDiff = (a: number, b: number) => {
  const d = wrap(b - a);
  return d > Math.PI ? d - TAU : d;
};

export function slotAt(s: State, ring: number, angle: number): number {
  const r = s.rings[ring];
  if (r.n === 1) return 0;
  return Math.floor(wrap(angle - r.off) / (TAU / r.n)) % r.n;
}

export function slotAngle(s: State, ring: number, slot: number): number {
  const r = s.rings[ring];
  if (r.n === 1) return 0;
  return wrap(r.off + (slot + 0.5) * (TAU / r.n));
}

/** Same-ring neighbours plus the nearest slot in each adjacent ring. */
export function neighbours(s: State, ring: number, slot: number): [number, number][] {
  const r = s.rings[ring];
  const out: [number, number][] = [];
  if (r.n > 1) {
    out.push([ring, (slot + 1) % r.n]);
    if (r.n > 2) out.push([ring, (slot + r.n - 1) % r.n]);
  }
  const a = slotAngle(s, ring, slot);
  if (ring > 0) out.push([ring - 1, slotAt(s, ring - 1, a)]);
  if (ring < s.rings.length - 1) out.push([ring + 1, slotAt(s, ring + 1, a)]);
  return out;
}

export function allCells(s: State): { ring: number; slot: number; cell: Cell }[] {
  const out: { ring: number; slot: number; cell: Cell }[] = [];
  s.rings.forEach((r, ring) => r.cells.forEach((cell, slot) => { if (cell) out.push({ ring, slot, cell }); }));
  return out;
}

/** Gut-wall sector (0..sectors-1) that an angle faces. */
export const sectorOf = (angle: number, sectors: number) => Math.floor(wrap(angle) / (TAU / sectors)) % sectors;
