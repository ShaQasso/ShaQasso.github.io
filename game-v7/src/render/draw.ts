import balance from '../data/balance.json';
import { NEIGH, TAU, angDiff, cellAt, eachCell } from '../engine/geometry';
import { coatThreshold, immuneSpeed, phageSpeed } from '../engine/sim';
import type { Cell, State } from '../engine/types';

const B = balance;
export const CREAM = '#eef3d4', BLACK = '#0d0d0d', RED = '#d0392a', ORANGE = '#e0701f', YELLOW = '#f2b01e', GREEN = '#1f7a52', BLUE = '#1d6fa5';
export const COLOUR_HEX = [YELLOW, GREEN, BLUE];
export const COLOUR_NAME = ['Yellow', 'Green', 'Blue'];
const WALL_R = B.wallR;
const S = B.wallSectors;
const TICKS = 9; // ticks per wall sector

export interface View { W: number; H: number; cx: number; cy: number; U: number; dpr: number }
export interface Pick { i: number; j: number }
export interface Target { kind: 'blob' | 'wall' | 'any'; i?: number; j?: number; sector?: number; colour?: number; text?: string; clear?: boolean }
interface Effect { x: number; y: number; t0: number; life: number; kind: 'pix' | 'pulse' | 'spark' | 'ring'; colours: string[] }
interface Ghost { i: number; j: number; t0: number }

function parse(hex: string): [number, number, number] { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
export const hexA = (hex: string, a: number) => { const [r, g, b] = parse(hex); return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, a))})`; };
function lighten(hex: string, amt: number): string {
  const [r, g, b] = parse(hex).map((v) => Math.max(0, Math.min(255, Math.round(amt >= 0 ? v + (255 - v) * amt : v * (1 + amt)))));
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}
const mix = (a: string, b: string, t: number): string => { const [r1, g1, b1] = parse(a), [r2, g2, b2] = parse(b); return `rgb(${Math.round(r1 + (r2 - r1) * t)},${Math.round(g1 + (g2 - g1) * t)},${Math.round(b1 + (b2 - b1) * t)})`; };
const SHADES: string[][] = COLOUR_HEX.map((h) => [h, lighten(h, 0.1), lighten(h, -0.07), lighten(h, 0.18)]);
const COAT: string[] = COLOUR_HEX.map((h) => lighten(h, 0.55));
export const maskColours = (mask: number) => [0, 1, 2].filter((c) => mask & (1 << c)).map((c) => COLOUR_HEX[c]);
const hash = (n: number) => { const x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); };
const FONT = "'Inter', system-ui, sans-serif";

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  view: View = { W: 0, H: 0, cx: 0, cy: 0, U: 1, dpr: 1 };
  private tv = { cx: 0, cy: 0, U: 1 };
  private effects: Effect[] = [];
  private ghosts: Ghost[] = [];
  private born = new WeakMap<Cell, number>();
  private lastS: State | null = null;
  private theta = 0;
  private shake = 0;
  private lastT = 0;
  private snap = true;
  target: Target | null = null;
  time = 0;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  resize(): void {
    const dpr = Math.min(2, devicePixelRatio || 1);
    const W = this.canvas.clientWidth, H = this.canvas.clientHeight;
    this.canvas.width = Math.round(W * dpr); this.canvas.height = Math.round(H * dpr);
    this.view = { ...this.view, W, H, dpr }; this.snap = true;
  }
  reset(): void { this.effects = []; this.ghosts = []; this.lastS = null; this.snap = true; }

  /** Where the wall sits on screen for each phase: the colony slides and resizes between screens. */
  private layout(s: State): { cx: number; cy: number; U: number } {
    const { W, H } = this.view, narrow = W < 700;
    const fit = (w: number, h: number) => Math.min(w, h) / 2 / (WALL_R + 7.5);
    if (s.status !== 'run') return { cx: W * 0.5, cy: H * 0.5, U: fit(W, H - 120) };
    if (s.phase === 'groom') { const top = narrow ? 110 : 70, bottom = narrow ? 220 : 270, h = Math.max(120, H - top - bottom); return { cx: W / 2, cy: top + h / 2, U: fit(W, h) }; }
    if (s.phase === 'checkup') { if (narrow) return { cx: W / 2, cy: H * 0.72, U: fit(W, H * 0.42) }; return { cx: W * 0.7, cy: H / 2, U: fit(W * 0.55, H - 140) }; }
    const top = narrow ? 130 : 74, bottom = narrow ? 90 : 100, h = Math.max(120, H - top - bottom);
    return { cx: W / 2, cy: top + h / 2, U: fit(W, h) };
  }
  private ease(s: State): void {
    const now = performance.now() / 1000, dt = Math.min(0.1, now - (this.lastT || now)); this.lastT = now;
    this.tv = this.layout(s);
    const k = this.snap ? 1 : Math.min(1, dt * 5);
    this.view = { ...this.view, cx: this.view.cx + (this.tv.cx - this.view.cx) * k, cy: this.view.cy + (this.tv.cy - this.view.cy) * k, U: this.view.U + (this.tv.U - this.view.U) * k };
    this.snap = false;
  }

  private toScreen(i: number, j: number, theta: number): [number, number] { const c = Math.cos(theta), sn = Math.sin(theta); return [this.view.cx + this.view.U * (i * c - j * sn), this.view.cy + this.view.U * (i * sn + j * c)]; }
  private polar(r: number, a: number): [number, number] { return [this.view.cx + Math.cos(a) * r * this.view.U, this.view.cy + Math.sin(a) * r * this.view.U]; }
  angleOf(px: number, py: number): number { return Math.atan2(py - this.view.cy, px - this.view.cx); }
  distOf(px: number, py: number): number { return Math.hypot(px - this.view.cx, py - this.view.cy) / this.view.U; }
  sectorAt(px: number, py: number): number { const a = ((this.angleOf(px, py) % TAU) + TAU) % TAU; return Math.floor(a / (TAU / S)) % S; }

  pick(s: State, px: number, py: number): Pick | null {
    const dx = (px - this.view.cx) / this.view.U, dy = (py - this.view.cy) / this.view.U;
    const c = Math.cos(-this.theta), sn = Math.sin(-this.theta);
    const i = Math.round(dx * c - dy * sn), j = Math.round(dx * sn + dy * c);
    return cellAt(s, i, j) ? { i, j } : null;
  }
  blobRadius(s: State): number { let m = 0; eachCell(s, (_, i, j) => { m = Math.max(m, Math.hypot(i, j)); }); return m; }

  draw(s: State, acc: number, hover: Pick | null): void {
    const { ctx } = this;
    this.ease(s);
    const { W, H, dpr } = this.view;
    this.time = performance.now() / 1000;
    this.theta = s.theta + (s.phase === 'wave' ? s.omega * acc : 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = BLACK; ctx.fillRect(0, 0, W, H);
    this.shake = Math.max(0, this.shake - 1 / 60);
    const sh = (s.inflammation > 0.7 ? (s.inflammation - 0.7) * 6 : 0) + this.shake * 22;
    ctx.save(); if (sh) ctx.translate((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh);
    this.drawWall(s);
    this.drainEvents(s);
    if (s.phase === 'wave') this.drawTelegraphs(s);
    this.drawBlob(s, hover);
    this.drawSites(s);
    if (s.phase === 'wave') this.drawFlight(s, acc);
    this.drawEffects();
    ctx.restore();
    this.lastS = s;
  }

  // ---- the gut wall: a ring with ticks that lengthen and warm up as inflammation rises --------------
  private heat(w: number): string { return w < 0.5 ? mix(RED, ORANGE, w / 0.5) : mix(ORANGE, YELLOW, (w - 0.5) / 0.5); }
  private heartbeat(s: State): number { const p = (this.time * (0.8 + 1.7 * s.inflammation)) % 1; return Math.exp(-p * 7) + 0.6 * Math.exp(-Math.abs(p - 0.3) * 16); }

  private drawWall(s: State): void {
    const { ctx } = this; const { cx, cy, U } = this.view;
    const beat = this.heartbeat(s);
    ctx.lineCap = 'butt';
    for (let j = 0; j < S; j++) {
      const w = s.wall[j], col = this.heat(Math.min(1, Math.max(0, (w - 0.2) / 0.7)));
      const a0 = (j / S) * TAU, a1 = ((j + 1) / S) * TAU;
      ctx.strokeStyle = col; ctx.lineWidth = U * 0.75;
      ctx.beginPath(); ctx.arc(cx, cy, WALL_R * U, a0 - 0.004, a1 + 0.004); ctx.stroke();
      ctx.lineCap = 'round'; ctx.lineWidth = U * 0.5;
      for (let v = 0; v < TICKS; v++) {
        const seed = j * 100 + v, a = a0 + ((v + 0.5) / TICKS) * (a1 - a0);
        const len = (1.7 + 1.5 * hash(seed + 7)) * (1 + 0.9 * w + 0.12 * w * beat);
        const [x0, y0] = this.polar(WALL_R - 0.2, a), [x1, y1] = this.polar(WALL_R - 0.2 - len, a + Math.sin(this.time * 0.8 + seed) * 0.006);
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      }
      ctx.lineCap = 'butt';
      const f = s.cooling[j] ?? 0;
      if (f > 0.02) { ctx.strokeStyle = hexA(CREAM, 0.12 + 0.5 * f); ctx.lineWidth = U * (0.25 + 1.0 * f); ctx.beginPath(); ctx.arc(cx, cy, (WALL_R - 4.2) * U, a0 + 0.03, a1 - 0.03); ctx.stroke(); }
    }
  }

  // ---- telegraphs: flares and antibiotics --------------------------------------------------------
  private pill(text: string, x: number, y: number, bg: string, fg: string, size = 1.35): void {
    const { ctx } = this; const { U } = this.view;
    const px = Math.max(11, U * size);
    ctx.font = `700 ${px}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const w = ctx.measureText(text).width + px * 1.1, h = px * 1.9;
    ctx.fillStyle = bg; ctx.beginPath(); ctx.roundRect(x - w / 2, y - h / 2, w, h, px * 0.5); ctx.fill();
    ctx.fillStyle = fg; ctx.fillText(text, x, y + px * 0.04);
  }

  private drawTelegraphs(s: State): void {
    const { ctx } = this; const { cx, cy, U } = this.view;
    for (const f of s.flares) {
      if (s.waveT >= f.t1 || f.t0 - s.waveT > 14) continue;
      const live = s.waveT >= f.t0, strong = f.kind === 'flare' && live;
      const name = f.kind === 'pre' ? 'Pre-flare' : f.kind === 'flare' ? 'Flare' : 'After-flare';
      if (live) { ctx.fillStyle = hexA(ORANGE, (strong ? 0.26 : 0.12) * (0.75 + 0.25 * Math.sin(this.time * 4))); ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, (WALL_R + 0.3) * U, f.angle - f.half, f.angle + f.half); ctx.closePath(); ctx.fill(); }
      ctx.strokeStyle = hexA(ORANGE, live ? (strong ? 1 : 0.75) : 0.55); ctx.lineWidth = U * (strong ? 0.8 : 0.5); ctx.lineCap = 'round'; ctx.setLineDash(live && strong ? [] : [U * 0.7, U * 0.8]);
      ctx.beginPath(); ctx.arc(cx, cy, (WALL_R + 3.6) * U, f.angle - f.half, f.angle + f.half); ctx.stroke(); ctx.setLineDash([]);
      const [x, y] = this.polar(WALL_R + 6.3, f.angle);
      this.pill(live ? `${name} · ${Math.ceil(f.t1 - s.waveT)}s` : `${name} in ${Math.ceil(f.t0 - s.waveT)}s`, x, y, ORANGE, BLACK);
    }
    for (const a of s.abx) {
      const left = a.t0 - s.waveT;
      if (a.fired || left > B.abx.warn) continue;
      const urgency = 1 - Math.max(0, left) / B.abx.warn;
      ctx.fillStyle = hexA(CREAM, (0.07 + 0.2 * urgency) * (0.6 + 0.4 * Math.sin(this.time * (6 + 14 * urgency))));
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, (WALL_R + 0.3) * U, a.angle - a.half, a.angle + a.half); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = hexA(CREAM, 0.4 + 0.4 * urgency); ctx.lineWidth = 1.5; ctx.setLineDash([6, 6]); ctx.stroke(); ctx.setLineDash([]);
      const [x, y] = this.polar(WALL_R + 3.4, a.angle);
      this.pill(`Antibiotic ${Math.max(0, left).toFixed(1)}s`, x, y, CREAM, BLACK);
    }
  }

  // ---- in flight: phages with a head, tail and legs; immune cells with the strip they will scrape ----
  /** The leading tip (the legs) sits at (x, y); the body trails outward. Head colour is the cells it infects. */
  private phageSprite(x: number, y: number, angle: number, cols: string[], alpha = 1): void {
    const { ctx } = this; const u = this.view.U / 10;
    ctx.save(); ctx.globalAlpha = alpha; ctx.translate(x, y); ctx.rotate(angle + Math.PI / 2);
    ctx.strokeStyle = hexA(CREAM, 0.4); ctx.lineWidth = Math.max(1.5, u * 2); ctx.setLineDash([u * 2.5, u * 5]);
    ctx.beginPath(); ctx.moveTo(0, u * 4); ctx.lineTo(0, u * 36); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = CREAM; ctx.strokeStyle = CREAM; ctx.lineWidth = Math.max(1.4, u * 2); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, -22 * u); ctx.lineTo(-16 * u, 0); ctx.moveTo(0, -22 * u); ctx.lineTo(-6 * u, 3 * u); ctx.moveTo(0, -22 * u); ctx.lineTo(6 * u, 3 * u); ctx.moveTo(0, -22 * u); ctx.lineTo(16 * u, 0); ctx.stroke();
    ctx.fillRect(-10 * u, -26 * u, 20 * u, 4 * u);
    for (let q = 0; q < 6; q++) { ctx.fillStyle = q % 2 ? '#7e8670' : CREAM; ctx.fillRect(-3 * u, (-58 + q * 5.4) * u, 6 * u, 5.4 * u); }
    ctx.fillStyle = CREAM; ctx.fillRect(-6 * u, -62 * u, 12 * u, 4 * u);
    const head = (fill: string, left: boolean | null) => {
      ctx.fillStyle = fill; ctx.beginPath();
      if (left === null) { ctx.moveTo(0, -92 * u); ctx.lineTo(12 * u, -85 * u); ctx.lineTo(12 * u, -69 * u); ctx.lineTo(0, -62 * u); ctx.lineTo(-12 * u, -69 * u); ctx.lineTo(-12 * u, -85 * u); }
      else if (left) { ctx.moveTo(0, -92 * u); ctx.lineTo(0, -62 * u); ctx.lineTo(-12 * u, -69 * u); ctx.lineTo(-12 * u, -85 * u); }
      else { ctx.moveTo(0, -92 * u); ctx.lineTo(12 * u, -85 * u); ctx.lineTo(12 * u, -69 * u); ctx.lineTo(0, -62 * u); }
      ctx.closePath(); ctx.fill();
    };
    if (cols.length === 1) head(cols[0], null); else { head(cols[0], true); head(cols[1], false); }
    ctx.restore();
  }
  private drawFlight(s: State, acc: number): void {
    const { ctx } = this; const { U } = this.view;
    for (const p of s.phages) {
      const waiting = (p.wait ?? 0) > 0;
      const r = waiting ? p.r : p.r - phageSpeed(s) * acc; if (r < 0) continue;
      const [x, y] = this.polar(r, p.angle);
      if (waiting) { // announced: it sits at the rim and shows its path, so you can turn before it launches
        const [ex, ey] = this.polar(4, p.angle);
        ctx.strokeStyle = hexA(maskColours(p.mask)[0], 0.5); ctx.lineWidth = Math.max(1.5, U * 0.22); ctx.setLineDash([U * 0.5, U * 0.9]);
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ex, ey); ctx.stroke(); ctx.setLineDash([]);
      }
      this.phageSprite(x, y, p.angle, maskColours(p.mask), waiting ? 0.45 + 0.3 * Math.sin(this.time * 10) : 1);
    }
    for (const m of s.immune) {
      const r = m.r - immuneSpeed(s) * acc; if (r < 0) continue;
      const [tx, ty] = this.polar(r - 12, m.angle), [x, y] = this.polar(r, m.angle);
      const hw = (B.immune.stripHalf + 0.5) * U, ca = Math.cos(m.angle), sa = Math.sin(m.angle);
      ctx.fillStyle = hexA(CREAM, 0.14); ctx.beginPath();
      ctx.moveTo(x - sa * hw, y + ca * hw); ctx.lineTo(x + sa * hw, y - ca * hw); ctx.lineTo(tx + sa * hw, ty - ca * hw); ctx.lineTo(tx - sa * hw, ty + ca * hw); ctx.closePath(); ctx.fill();
      ctx.fillStyle = CREAM; ctx.beginPath(); ctx.arc(x, y, U * 1.9, 0, TAU); ctx.fill();
    }
  }

  // ---- the colony ---------------------------------------------------------------------------------------
  patchOf(s: State, i: number, j: number): Set<number> {
    const start = cellAt(s, i, j); const seen = new Set<number>();
    if (!start) return seen;
    const q: [number, number][] = [[i, j]]; seen.add(i * 1000 + j);
    for (let h = 0; h < q.length; h++) {
      const [a, b] = q[h];
      for (const [di, dj] of NEIGH) { const n = cellAt(s, a + di, b + dj); if (n && n.c === start.c && !seen.has((a + di) * 1000 + b + dj)) { seen.add((a + di) * 1000 + b + dj); q.push([a + di, b + dj]); } }
    }
    return seen;
  }

  /** The colony is soft: outer pixels trail behind when it turns. */
  private lagK = 0;
  private lag(i: number, j: number): [number, number] {
    const a = this.lagK * Math.hypot(i, j); if (!a) return [i, j];
    const c = Math.cos(a), sn = Math.sin(a); return [i * c - j * sn, i * sn + j * c];
  }

  private drawBlob(s: State, hover: Pick | null): void {
    this.lagK = s.phase === 'wave' ? -s.omega * 0.0035 : 0;
    const { ctx } = this; const { cx, cy, U } = this.view;
    const patch = hover ? this.patchOf(s, hover.i, hover.j) : null;
    const tNow = this.time;
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(this.theta); ctx.scale(U, U);
    eachCell(s, (c, i, j) => {
      let born = this.born.get(c);
      if (born === undefined) { born = this.lastS ? tNow : -10; this.born.set(c, born); }
      const age = tNow - born, sz = 0.88 * (0.4 + 0.6 * Math.min(1, age / 0.35));
      const [li, lj] = this.lag(i, j), x = li - sz / 2, y = lj - sz / 2;
      if (c.inf > 0) {
        const cols = maskColours(c.ph);
        ctx.fillStyle = Math.sin(tNow * 28 + i + j) > 0 ? CREAM : cols[0];
        ctx.fillRect(x, y, sz, sz);
        return;
      }
      const shade = ((i * 7 + j * 13 + Math.floor(tNow * 0.6 + ((i * 31 + j * 17) & 7))) & 3);
      let fill = c.m > 0 ? COAT[c.c] : SHADES[c.c][shade];
      if (age < 0.7) fill = mix(CREAM, fill, Math.min(1, age / 0.7)); // newborn pixels start pale
      ctx.fillStyle = fill; ctx.fillRect(x, y, sz, sz);
      if (patch && patch.has(i * 1000 + j)) { ctx.fillStyle = hexA(CREAM, 0.25); ctx.fillRect(x, y, sz, sz); }
    });
    // bites leave a fading outline where pixels were, so every hit is visible
    ctx.lineWidth = 0.14;
    this.ghosts = this.ghosts.filter((g) => tNow - g.t0 < 1.1);
    for (const g of this.ghosts) { const f = (tNow - g.t0) / 1.1; const [gi, gj] = this.lag(g.i, g.j); ctx.strokeStyle = hexA(CREAM, 0.9 * (1 - f)); ctx.strokeRect(gi - 0.5, gj - 0.5, 1, 1); }
    // the mucus coat: a cream outline around every coated region
    ctx.strokeStyle = hexA(CREAM, 0.9); ctx.lineWidth = 0.22; ctx.lineCap = 'round';
    ctx.beginPath();
    eachCell(s, (c, i, j) => {
      if (!(c.m > 0)) return;
      const open = (di: number, dj: number) => { const n = cellAt(s, i + di, j + dj); return !n || !(n.m > 0); };
      const [x, y] = this.lag(i, j);
      if (open(1, 0)) { ctx.moveTo(x + 0.5, y - 0.5); ctx.lineTo(x + 0.5, y + 0.5); }
      if (open(-1, 0)) { ctx.moveTo(x - 0.5, y - 0.5); ctx.lineTo(x - 0.5, y + 0.5); }
      if (open(0, 1)) { ctx.moveTo(x - 0.5, y + 0.5); ctx.lineTo(x + 0.5, y + 0.5); }
      if (open(0, -1)) { ctx.moveTo(x - 0.5, y - 0.5); ctx.lineTo(x + 0.5, y - 0.5); }
    });
    ctx.stroke();
    if (hover) { ctx.strokeStyle = CREAM; ctx.lineWidth = 0.2; ctx.strokeRect(hover.i - 0.6, hover.j - 0.6, 1.2, 1.2); }
    ctx.restore();
  }

  // ---- feeding sites, wall treatments, and the drag-and-drop preview ----------------------------------
  private drawSites(s: State): void {
    const { ctx } = this; const { cx, cy, U } = this.view;
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(this.theta); ctx.scale(U, U);
    for (const st of s.sites) {
      ctx.strokeStyle = hexA(CREAM, 0.55); ctx.lineWidth = 0.2; ctx.setLineDash([0.9, 0.8]); ctx.lineDashOffset = -this.time * 1.5;
      ctx.beginPath(); ctx.arc(st.i, st.j, st.r, 0, TAU); ctx.stroke();
    }
    ctx.setLineDash([]);
    const t = this.target;
    if (t && t.kind === 'blob' && t.i !== undefined && t.j !== undefined) {
      ctx.strokeStyle = CREAM; ctx.lineWidth = 0.34; ctx.setLineDash([1, 0.9]); ctx.lineDashOffset = -this.time * 3;
      ctx.beginPath(); ctx.arc(t.i, t.j, t.clear ? B.card.abxR : B.site.blobR, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
      if (t.clear) { ctx.fillStyle = hexA(BLACK, 0.6); ctx.beginPath(); ctx.arc(t.i, t.j, B.card.abxR, 0, TAU); ctx.fill(); }
      else { ctx.fillStyle = hexA(COLOUR_HEX[t.colour ?? 0], 0.5); ctx.beginPath(); ctx.arc(t.i, t.j, B.site.coreR, 0, TAU); ctx.fill(); }
    }
    ctx.restore();
    const arcs: { sector: number; alpha: number }[] = s.wallSites.map((w) => ({ sector: w.sector, alpha: 0.85 }));
    if (t && t.kind === 'wall' && t.sector !== undefined) arcs.push({ sector: t.sector, alpha: 1 });
    for (const a of arcs) {
      const a0 = (a.sector / S) * TAU, a1 = ((a.sector + 1) / S) * TAU;
      ctx.strokeStyle = hexA(CREAM, a.alpha * (0.65 + 0.3 * Math.sin(this.time * 4))); ctx.lineWidth = U * 0.9; ctx.lineCap = 'butt';
      ctx.beginPath(); ctx.arc(cx, cy, (WALL_R - 3.4) * U, a0 + 0.02, a1 - 0.02); ctx.stroke();
    }
    if (t?.text) {
      let x = cx, y = cy;
      if (t.kind === 'blob' && t.i !== undefined && t.j !== undefined) { [x, y] = this.toScreen(t.i, t.j, this.theta); y -= U * (B.site.blobR + 3); }
      else if (t.kind === 'wall' && t.sector !== undefined) [x, y] = this.polar(WALL_R - 8, ((t.sector + 0.5) / S) * TAU);
      this.pill(t.text, x, y, CREAM, BLACK, 1.3);
    }
  }

  // ---- events -> effects -----------------------------------------------------------------------------------
  private drainEvents(s: State): void {
    if (!s.events) { s.events = []; return; }
    for (const e of s.events) {
      const center = e.kind === 'steroid' || e.kind === 'burst' || e.kind === 'turn';
      const [x, y] = center ? [this.view.cx, this.view.cy] : this.toScreen(e.x, e.y, s.theta);
      const cols = e.mask ? maskColours(e.mask) : e.c !== undefined ? [COLOUR_HEX[e.c]] : [CREAM];
      const t0 = this.time, add = (ef: Effect) => { if (this.effects.length < 700) this.effects.push(ef); };
      if (e.kind === 'infect') { add({ x, y, t0, life: 0.6, kind: 'pulse', colours: [CREAM] }); this.shake = Math.max(this.shake, 0.16); }
      else if (e.kind === 'deflect') add({ x, y, t0, life: 0.4, kind: 'spark', colours: cols });
      else if (e.kind === 'coat') add({ x, y, t0, life: 0.5, kind: 'spark', colours: [CREAM] });
      else if (e.kind === 'patch') add({ x, y, t0, life: 0.9, kind: 'pulse', colours: [CREAM] });
      else if (e.kind === 'lysis' || e.kind === 'abx' || e.kind === 'immune') {
        add({ x, y, t0, life: 0.55, kind: 'pix', colours: e.mask ? cols : [CREAM] });
        if (this.ghosts.length < 600) this.ghosts.push({ i: e.x, j: e.y, t0 });
      }
      else if (e.kind === 'evade') add({ x, y, t0, life: 0.5, kind: 'pulse', colours: [COLOUR_HEX[2]] });
      else if (e.kind === 'steroid') add({ x, y, t0, life: 1.1, kind: 'ring', colours: [CREAM] });
      else if (e.kind === 'burst') add({ x, y, t0, life: 1.0, kind: 'ring', colours: [YELLOW] });
      else if (e.kind === 'turn') add({ x, y, t0, life: 0.7, kind: 'ring', colours: [CREAM] });
    }
    s.events.length = 0;
  }

  private drawEffects(): void {
    const { ctx } = this; const { U } = this.view;
    this.effects = this.effects.filter((e) => this.time - e.t0 < e.life);
    for (const e of this.effects) {
      const f = (this.time - e.t0) / e.life, col = e.colours[0], col2 = e.colours[e.colours.length - 1];
      ctx.strokeStyle = hexA(col, 0.9 * (1 - f)); ctx.fillStyle = hexA(col, 0.9 * (1 - f)); ctx.lineWidth = 2;
      if (e.kind === 'ring') { ctx.beginPath(); ctx.arc(this.view.cx, this.view.cy, U * (2 + 22 * f), 0, TAU); ctx.lineWidth = 4 * (1 - f) + 1; ctx.stroke(); }
      else if (e.kind === 'pulse') { ctx.beginPath(); ctx.arc(e.x, e.y, U * (1.2 + 3 * f), 0, TAU); ctx.lineWidth = 3.5 * (1 - f) + 1; ctx.stroke(); }
      else if (e.kind === 'spark') { for (let k = 0; k < 7; k++) { const a = (k / 7) * TAU + 0.5, d = U * (0.6 + 1.8 * f); ctx.beginPath(); ctx.moveTo(e.x + Math.cos(a) * d * 0.5, e.y + Math.sin(a) * d * 0.5); ctx.lineTo(e.x + Math.cos(a) * d, e.y + Math.sin(a) * d); ctx.stroke(); } }
      else if (e.kind === 'pix') { for (let k = 0; k < 4; k++) { const a = (k / 4) * TAU + e.x * 0.37, d = U * (0.3 + 1.4 * f); ctx.fillStyle = hexA(k % 2 ? col : col2, 0.9 * (1 - f)); ctx.fillRect(e.x + Math.cos(a) * d - U * 0.25, e.y + Math.sin(a) * d - U * 0.25, U * 0.5 * (1 - f), U * 0.5 * (1 - f)); } }
    }
  }
}
void angDiff; void coatThreshold;
