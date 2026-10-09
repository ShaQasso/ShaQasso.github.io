import balance from '../data/balance.json';
import { SPECIES, activeWaves, coatOf, warnings } from '../engine/sim';
import { mixAt } from '../engine/director';
import { TAU, wrap } from '../engine/geometry';
import type { Cell, Shape, State } from '../engine/types';

export interface View { W: number; H: number; cx: number; cy: number; U: number; dpr: number }
export interface Hover { ring: number; slot: number }

const B = balance;
const SECTORS = B.wall.sectors;

// ---- palette ---------------------------------------------------------------
const IMMUNE_COLORS: Record<string, string> = { '-2': '#ef4444', '-1': '#f2917f', '0': '#a5b4c8', '1': '#79aefc', '2': '#2f7bff' };
export const immuneColor = (imm: number) => IMMUNE_COLORS[String(Math.max(-2, Math.min(2, Math.round(imm))))];

/** Rod proportions per species (length, width as multiples of U). */
const LOOK: Record<string, { len: number; wid: number }> = {
  cool: { len: 0.86, wid: 0.4 }, funny: { len: 0.7, wid: 0.46 }, spicy: { len: 0.9, wid: 0.4 },
  sneaky: { len: 0.8, wid: 0.34 }, hungry: { len: 0.92, wid: 0.42 }, chonky: { len: 0.82, wid: 0.56 },
  pathogen: { len: 0.84, wid: 0.36 },
};

export function drawGlyph(ctx: CanvasRenderingContext2D, shape: Shape, x: number, y: number, r: number): void {
  ctx.beginPath();
  if (shape === 'c') ctx.arc(x, y, r, 0, TAU);
  else if (shape === 'd') { ctx.moveTo(x, y - r * 1.25); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r * 1.25); ctx.lineTo(x - r, y); ctx.closePath(); }
  else if (shape === 't') { ctx.moveTo(x, y - r * 1.15); ctx.lineTo(x + r * 1.1, y + r * 0.85); ctx.lineTo(x - r * 1.1, y + r * 0.85); ctx.closePath(); }
  else if (shape === 's') ctx.rect(x - r * 0.9, y - r * 0.9, r * 1.8, r * 1.8);
  else { ctx.moveTo(x - r, y); ctx.lineTo(x + r, y); ctx.moveTo(x, y - r); ctx.lineTo(x, y + r); }
}

interface Effect { x: number; y: number; t0: number; life: number; kind: 'burst' | 'puff' | 'strike'; color: string; angle?: number; half?: number }

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  view: View = { W: 0, H: 0, cx: 0, cy: 0, U: 1, dpr: 1 };
  private effects: Effect[] = [];
  private prev = new Map<Cell, { x: number; y: number; inf: number }>();
  private born = new WeakMap<Cell, number>();
  private seeds = new WeakMap<Cell, number>();
  private coats = new WeakMap<Cell, { coat: number; flash: number }>();
  private firedSeen = new Set<number>();
  private wallR = 2.6;
  time = 0;
  private lastS: State | null = null;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  resize(): void {
    const dpr = Math.min(2, devicePixelRatio || 1);
    const W = this.canvas.clientWidth, H = this.canvas.clientHeight;
    this.canvas.width = Math.round(W * dpr);
    this.canvas.height = Math.round(H * dpr);
    const top = W < 640 ? 130 : 56, bottom = 84;
    const availH = Math.max(100, H - top - bottom);
    this.view = { W, H, cx: W / 2, cy: top + availH / 2, U: Math.min(W, availH) / 2 / 6.2, dpr };
  }

  reset(): void {
    this.effects = []; this.prev.clear(); this.firedSeen.clear(); this.wallR = 2.6; this.lastS = null;
  }

  /** Screen position of a polar point in engine units (radius in rings, angle in radians). */
  pt(r: number, a: number): [number, number] {
    const { cx, cy, U } = this.view;
    return [cx + Math.cos(a) * r * U, cy + Math.sin(a) * r * U];
  }

  cellAngle(s: State, ring: number, slot: number, acc: number): number {
    const r = s.rings[ring];
    return r.off + r.omega * acc + (slot + 0.5) * (TAU / r.n);
  }

  /** Hit-test the cell under a screen point. */
  cellAt(s: State, px: number, py: number, acc: number): Hover | null {
    const { cx, cy, U } = this.view;
    let best: Hover | null = null, bd = (0.5 * U) ** 2;
    s.rings.forEach((r, k) => r.cells.forEach((c, i) => {
      if (!c) return;
      const [x, y] = k === 0 ? [cx, cy] : this.pt(k, this.cellAngle(s, k, i, acc));
      const d = (x - px) ** 2 + (y - py) ** 2;
      if (d < bd) { bd = d; best = { ring: k, slot: i }; }
    }));
    return best;
  }

  ringAt(s: State, px: number, py: number): number | null {
    const { cx, cy, U } = this.view;
    const d = Math.hypot(px - cx, py - cy) / U;
    const k = Math.round(d);
    if (k < 1 || k > s.rings.length - 1 || Math.abs(d - k) > 0.5) return null;
    return k;
  }

  draw(s: State, acc: number, hover: Hover | null, selectedRing: number | null, slow: boolean): void {
    const { ctx } = this;
    const { W, H, dpr } = this.view;
    this.time = performance.now() / 1000;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const shake = s.health < 25 ? (25 - s.health) / 25 * 2.2 : 0;
    ctx.save();
    if (shake) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);

    this.drawBackground(s, slow);
    this.drawWall(s);
    this.drawWarnings(s);
    this.drawRingGuides(s, selectedRing);
    this.drawCells(s, acc, hover);
    this.drawParticles(s, acc);
    this.drawEffects();
    ctx.restore();
    this.drawVignette(s);
    this.lastS = s;
  }

  private drawBackground(s: State, slow: boolean): void {
    const { ctx } = this;
    const { W, H, cx, cy, U } = this.view;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.7);
    const heat = Math.max(0, s.inflammation - 0.4);
    g.addColorStop(0, `rgb(${14 + heat * 40},${22 - heat * 10},${44 - heat * 24})`);
    g.addColorStop(1, '#04070d');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // faint lumen texture
    ctx.fillStyle = 'rgba(120,150,200,0.035)';
    for (let i = 0; i < 40; i++) {
      const a = i * 2.399, r = (i % 7) * 0.9 + 0.5 + Math.sin(this.time * 0.2 + i) * 0.15;
      const [x, y] = this.pt(r, a + this.time * 0.01);
      ctx.beginPath(); ctx.arc(x, y, U * (0.12 + (i % 3) * 0.08), 0, TAU); ctx.fill();
    }
    if (slow) { ctx.fillStyle = 'rgba(251,191,36,0.05)'; ctx.fillRect(0, 0, W, H); }
  }

  /** Calm = cool blue, stressed = magenta, inflamed = red. */
  private wallColor(w: number, l = 0): string {
    const stops: [number, number][] = [[0, 195], [0.3, 214], [0.5, 255], [0.68, 325], [0.85, 352], [1, 358]];
    let hue = stops[stops.length - 1][1];
    for (let i = 1; i < stops.length; i++) {
      if (w <= stops[i][0]) { const [w0, h0] = stops[i - 1], [w1, h1] = stops[i]; hue = h0 + ((w - w0) / (w1 - w0)) * (h1 - h0); break; }
    }
    return `hsl(${hue} ${42 + 38 * w}% ${22 + 12 * w + l}%)`;
  }

  private drawWall(s: State): void {
    const { ctx } = this;
    const { U } = this.view;
    const target = s.rings.length - 1 + 1.55;
    this.wallR += (target - this.wallR) * 0.04;
    const R = this.wallR;
    const beat = this.heartbeat(s);
    for (let j = 0; j < SECTORS; j++) {
      const w = s.wall[j];
      const a0 = (j / SECTORS) * TAU, a1 = ((j + 1) / SECTORS) * TAU + 0.004;
      const swell = (0.42 + 0.95 * w) * (1 + 0.07 * w * beat);
      const inner = R, outer = R + swell;
      ctx.beginPath();
      ctx.arc(this.view.cx, this.view.cy, inner * U, a0, a1);
      ctx.arc(this.view.cx, this.view.cy, outer * U, a1, a0, true);
      ctx.closePath();
      ctx.fillStyle = this.wallColor(w);
      ctx.fill();
      // villi: slim and swaying when healthy, stubby and angry when inflamed
      const n = 7;
      for (let v = 0; v < n; v++) {
        const a = a0 + ((v + 0.5) / n) * (a1 - a0);
        const sway = Math.sin(this.time * (1 + 2.5 * w) + j * 3 + v) * (0.09 - 0.05 * w);
        const len = (0.36 - 0.18 * w) * (0.85 + 0.3 * ((v * 7 + j) % 3) / 2);
        const [x0, y0] = this.pt(inner, a);
        const [x1, y1] = this.pt(inner - len, a + sway);
        ctx.strokeStyle = this.wallColor(w, 8);
        ctx.lineWidth = U * (0.12 + 0.1 * w);
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      }
      // mucus thins out with inflammation
      ctx.strokeStyle = `rgba(110,200,190,${0.28 * (1 - w)})`;
      ctx.lineWidth = U * 0.22 * (1 - 0.8 * w);
      ctx.beginPath(); ctx.arc(this.view.cx, this.view.cy, (inner - 0.42) * U, a0 + 0.02, a1 - 0.02); ctx.stroke();
      // debris from the angriest patches
      if (w > 0.65) {
        ctx.fillStyle = 'rgba(255,120,110,0.55)';
        for (let d = 0; d < 5; d++) {
          const a = (a0 + a1) / 2 + Math.sin(this.time * 0.7 + d * 2 + j) * 0.12;
          const r = inner - 0.5 - ((this.time * 0.15 + d * 0.31 + j * 0.13) % 1) * 0.9;
          const [x, y] = this.pt(r, a);
          ctx.beginPath(); ctx.arc(x, y, U * 0.05, 0, TAU); ctx.fill();
        }
      }
    }
  }

  private heartbeat(s: State): number {
    const p = (this.time * (0.8 + 1.7 * s.inflammation)) % 1;
    return Math.exp(-p * 7) + 0.6 * Math.exp(-Math.abs(p - 0.3) * 16);
  }

  private drawVignette(s: State): void {
    const { ctx } = this;
    const { W, H, cx, cy } = this.view;
    const stress = Math.max(0, Math.min(1, (s.inflammation - 0.45) * 1.7));
    const low = Math.max(0, (35 - s.health) / 35);
    const a = Math.max(stress * 0.5, low * 0.65) * (0.65 + 0.35 * this.heartbeat(s));
    if (a < 0.01) return;
    const g = ctx.createRadialGradient(cx, cy, Math.min(W, H) * 0.3, cx, cy, Math.max(W, H) * 0.75);
    g.addColorStop(0, 'rgba(160,10,20,0)');
    g.addColorStop(1, `rgba(170,12,24,${a})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  private drawRingGuides(s: State, selected: number | null): void {
    const { ctx } = this;
    const { cx, cy, U } = this.view;
    s.rings.forEach((_, k) => {
      if (k === 0) return;
      ctx.strokeStyle = k === selected ? 'rgba(250,204,21,0.55)' : 'rgba(150,175,220,0.1)';
      ctx.lineWidth = k === selected ? 1.6 : 1;
      ctx.setLineDash(k === selected ? [] : [3, 6]);
      ctx.beginPath(); ctx.arc(cx, cy, k * U, 0, TAU); ctx.stroke();
    });
    ctx.setLineDash([]);
  }

  private arcPath(r: number, a0: number, a1: number): void {
    const { cx, cy, U } = this.view;
    this.ctx.beginPath();
    this.ctx.arc(cx, cy, r * U, a0, a1);
  }

  private drawWarnings(s: State): void {
    const { ctx } = this;
    const { cx, cy, U } = this.view;
    const edge = this.wallR + 1.7;
    const tPulse = 0.55 + 0.45 * Math.sin(this.time * 9);

    // active phage / invader waves: a bright arc plus the *current* dominant receptor so you can watch it change
    for (const w of activeWaves(s)) {
      const c = w.center + w.drift * (s.t - w.t0);
      const inv = w.kind === 'invader';
      ctx.strokeStyle = inv ? 'rgba(74,222,128,0.55)' : 'rgba(192,132,252,0.55)';
      ctx.lineWidth = U * 0.1; ctx.lineCap = 'round';
      this.arcPath(edge, c - w.half, c + w.half); ctx.stroke();
      const [x, y] = this.pt(edge + 0.55, c);
      if (inv) { ctx.fillStyle = 'rgba(74,222,128,0.9)'; ctx.font = `${U * 0.4}px system-ui`; ctx.textAlign = 'center'; ctx.fillText('invaders', x, y); }
      else {
        const mix = mixAt(w, s.t);
        const dom = (Object.keys(mix) as Shape[]).reduce((a, b) => (mix[b] > mix[a] ? b : a));
        ctx.fillStyle = '#d8b4fe'; drawGlyph(ctx, dom, x, y, U * 0.2); ctx.fill();
      }
    }
    // upcoming waves: pulsing dotted arc with a countdown
    for (const w of warnings(s).waves) {
      const left = w.t0 - s.t;
      ctx.strokeStyle = w.kind === 'invader' ? `rgba(74,222,128,${0.35 * tPulse})` : `rgba(192,132,252,${0.45 * tPulse})`;
      ctx.lineWidth = U * 0.08; ctx.setLineDash([U * 0.15, U * 0.2]);
      this.arcPath(edge, w.center - w.half, w.center + w.half); ctx.stroke(); ctx.setLineDash([]);
      const [x, y] = this.pt(edge + 0.6, w.center);
      ctx.fillStyle = 'rgba(220,200,255,0.9)'; ctx.font = `600 ${U * 0.36}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(w.kind === 'invader' ? `invaders ${left.toFixed(0)}` : `phages ${left.toFixed(0)}`, x, y);
    }
    // antibiotic: a wedge across the whole colony
    for (const a of warnings(s).antibiotics) {
      const left = Math.max(0, a.t0 - s.t);
      const urgency = 1 - Math.min(1, left / balance.director.warn);
      const al = (0.07 + 0.2 * urgency) * (0.6 + 0.4 * Math.sin(this.time * (6 + 14 * urgency)));
      ctx.fillStyle = `rgba(253,224,71,${al})`;
      ctx.beginPath(); ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, (this.wallR + 0.2) * U, a.center - a.half, a.center + a.half); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = `rgba(253,224,71,${0.35 + 0.4 * urgency})`; ctx.lineWidth = 1.5;
      ctx.stroke();
      const [x, y] = this.pt(edge + 0.2, a.center);
      ctx.fillStyle = '#fde047'; ctx.font = `700 ${U * 0.38}px system-ui`; ctx.textAlign = 'center';
      ctx.fillText(`antibiotic ${left.toFixed(1)}s`, x, y);
    }
    // antibiotic strikes that just fired
    s.antibiotics.forEach((a, i) => {
      if (a.fired && !this.firedSeen.has(i)) {
        this.firedSeen.add(i);
        this.effects.push({ x: cx, y: cy, t0: this.time, life: 0.7, kind: 'strike', color: '#fde047', angle: a.center, half: a.half });
      }
    });
  }

  private seedOf(c: Cell): number {
    let v = this.seeds.get(c);
    if (v === undefined) { v = Math.random(); this.seeds.set(c, v); }
    return v;
  }

  private drawCells(s: State, acc: number, hover: Hover | null): void {
    const { ctx } = this;
    const { cx, cy, U } = this.view;
    const now = new Map<Cell, { x: number; y: number; inf: number }>();

    s.rings.forEach((ring, k) => ring.cells.forEach((c, i) => {
      if (!c) return;
      const a = k === 0 ? 0 : this.cellAngle(s, k, i, acc);
      const [x, y] = k === 0 ? [cx, cy] : this.pt(k, a);
      now.set(c, { x, y, inf: c.inf });
      this.drawCell(s, c, x, y, a, k === 0, hover?.ring === k && hover.slot === i);
    }));

    // death / lysis effects for cells that vanished since last frame
    for (const [c, p] of this.prev) {
      if (!now.has(c)) {
        this.effects.push(p.inf > 0
          ? { x: p.x, y: p.y, t0: this.time, life: 0.7, kind: 'burst', color: '#c084fc' }
          : { x: p.x, y: p.y, t0: this.time, life: 0.5, kind: 'puff', color: '#94a3b8' });
      }
    }
    this.prev = now;
    void U;
  }

  private drawCell(s: State, c: Cell, x: number, y: number, ang: number, core: boolean, hovered: boolean): void {
    const { ctx } = this;
    const { U } = this.view;
    const def = SPECIES[c.sp];
    const coat = coatOf(c);
    const look = LOOK[c.sp] ?? LOOK.cool;
    const seed = this.seedOf(c);

    // birth animation
    let born = this.born.get(c);
    if (born === undefined) { born = this.lastS ? this.time : -10; this.born.set(c, born); }
    const grow = Math.min(1, (this.time - born) / 0.45);
    const scale = 0.3 + 0.7 * (1 - Math.pow(1 - grow, 3));

    // reporter flash on coat flips
    let cs = this.coats.get(c);
    if (!cs) { cs = { coat: c.coat, flash: -10 }; this.coats.set(c, cs); }
    if (cs.coat !== c.coat) { cs.coat = c.coat; cs.flash = this.time; }
    const flash = Math.max(0, 1 - (this.time - cs.flash) / 0.9);

    const infected = c.inf > 0;
    const path = !!def.pathogen;
    let col = path ? '#1f6f4a' : immuneColor(coat.immune);
    const jitter = (seed - 0.5) * 0.5;
    const rot = ang + Math.PI / 2 + jitter + (core ? seed * TAU : 0);
    const len = look.len * U * scale, wid = look.wid * U * scale;
    const wob = infected ? Math.sin(this.time * 38 + seed * 9) * 0.04 * U : 0;

    ctx.save();
    ctx.translate(x + wob, y);
    // soft glow
    const glowR = U * (0.62 + 0.5 * flash);
    const gl = ctx.createRadialGradient(0, 0, 0, 0, 0, glowR);
    gl.addColorStop(0, hexA(infected ? '#a855f7' : col, 0.28 + 0.5 * flash));
    gl.addColorStop(1, hexA(col, 0));
    ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(0, 0, glowR, 0, TAU); ctx.fill();

    ctx.rotate(rot);
    const r = Math.min(len, wid) / 2;
    ctx.beginPath(); ctx.roundRect(-len / 2, -wid / 2, len, wid, r);
    const body = ctx.createLinearGradient(0, -wid / 2, 0, wid / 2);
    body.addColorStop(0, lighten(col, 0.28)); body.addColorStop(1, lighten(col, -0.18));
    ctx.fillStyle = body; ctx.fill();
    ctx.lineWidth = coat.armored ? 2.4 : 1.2;
    ctx.strokeStyle = hovered ? '#fde68a' : coat.armored ? '#e5e7eb' : 'rgba(0,0,0,0.5)';
    ctx.stroke();

    if (path) { // spikes
      ctx.strokeStyle = '#86efac'; ctx.lineWidth = 1.4;
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath(); ctx.moveTo(i * len * 0.18, -wid / 2); ctx.lineTo(i * len * 0.18 + 2, -wid / 2 - U * 0.1); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(i * len * 0.18, wid / 2); ctx.lineTo(i * len * 0.18 - 2, wid / 2 + U * 0.1); ctx.stroke();
      }
    }
    ctx.restore();

    // phage receptor glyph
    if (!path) {
      ctx.save(); ctx.translate(x + wob, y);
      ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 1;
      drawGlyph(ctx, coat.shape, 0, 0, U * 0.1 * scale); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    if (infected) {
      ctx.save(); ctx.translate(x + wob, y);
      const f = c.inf / balance.phage.infectTime;
      ctx.fillStyle = `rgba(168,85,247,${0.35 + 0.35 * Math.sin(this.time * 14 * (1.5 - f))})`;
      ctx.beginPath(); ctx.arc(0, 0, U * 0.38, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#e9d5ff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, U * 0.44, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - f)); ctx.stroke();
      ctx.restore();
    }
    if (flash > 0) {
      ctx.save(); ctx.translate(x + wob, y);
      ctx.strokeStyle = `rgba(255,255,255,${0.9 * flash})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, U * (0.4 + 0.5 * (1 - flash)), 0, TAU); ctx.stroke();
      ctx.restore();
    }
    void s;
  }

  private drawParticles(s: State, acc: number): void {
    const { ctx } = this;
    const { U } = this.view;
    const speed = balance.phage.speed;
    for (const p of s.particles) {
      const r = p.r - speed * acc;
      if (r < -0.2) continue;
      const [x, y] = this.pt(r, p.angle);
      const [tx, ty] = this.pt(r + 0.5, p.angle);
      const inv = p.kind === 'invader';
      ctx.strokeStyle = inv ? 'rgba(74,222,128,0.5)' : 'rgba(192,132,252,0.55)';
      ctx.lineWidth = U * 0.05;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(tx, ty); ctx.stroke();
      if (inv) {
        ctx.fillStyle = '#4ade80'; ctx.beginPath(); ctx.arc(x, y, U * 0.12, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#bbf7d0'; ctx.lineWidth = 1;
        for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + this.time * 3; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * U * 0.2, y + Math.sin(a) * U * 0.2); ctx.stroke(); }
      } else {
        ctx.fillStyle = '#a855f7'; ctx.strokeStyle = '#f3e8ff'; ctx.lineWidth = 1.2;
        drawGlyph(ctx, p.shape, x, y, U * 0.16); ctx.fill(); ctx.stroke();
      }
    }
  }

  private drawEffects(): void {
    const { ctx } = this;
    const { cx, cy, U } = this.view;
    this.effects = this.effects.filter((e) => this.time - e.t0 < e.life);
    for (const e of this.effects) {
      const f = (this.time - e.t0) / e.life;
      if (e.kind === 'strike') {
        ctx.fillStyle = `rgba(254,240,138,${0.5 * (1 - f)})`;
        ctx.beginPath(); ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, (this.wallR + 0.3) * U, e.angle! - e.half!, e.angle! + e.half!); ctx.closePath(); ctx.fill();
        continue;
      }
      ctx.strokeStyle = hexA(e.color, 0.8 * (1 - f)); ctx.fillStyle = hexA(e.color, 0.8 * (1 - f)); ctx.lineWidth = 2;
      if (e.kind === 'burst') {
        ctx.beginPath(); ctx.arc(e.x, e.y, U * (0.3 + 0.9 * f), 0, TAU); ctx.stroke();
        for (let i = 0; i < 9; i++) {
          const a = (i / 9) * TAU + 0.4, d = U * (0.2 + 1.0 * f);
          ctx.beginPath(); ctx.arc(e.x + Math.cos(a) * d, e.y + Math.sin(a) * d, U * 0.06 * (1 - f), 0, TAU); ctx.fill();
        }
      } else {
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * TAU, d = U * (0.1 + 0.4 * f);
          ctx.beginPath(); ctx.arc(e.x + Math.cos(a) * d, e.y + Math.sin(a) * d, U * 0.05 * (1 - f), 0, TAU); ctx.fill();
        }
      }
    }
  }
}

// ---- tiny colour helpers ----------------------------------------------------
function parse(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function hexA(hex: string, a: number): string {
  const [r, g, b] = parse(hex);
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, a))})`;
}
function lighten(hex: string, amt: number): string {
  const [r, g, b] = parse(hex).map((v) => Math.max(0, Math.min(255, Math.round(amt >= 0 ? v + (255 - v) * amt : v * (1 + amt)))));
  return `rgb(${r},${g},${b})`;
}
void wrap;
