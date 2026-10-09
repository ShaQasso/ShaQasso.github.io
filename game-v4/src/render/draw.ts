import balance from '../data/balance.json';
import { NEIGH, R, TAU, cellAt, eachCell, exposed, sectorOfAngle, worldAngle } from '../engine/geometry';
import { activeFlares, warnings } from '../engine/sim';
import type { Cell, State } from '../engine/types';

const B = balance;
export const COLOUR_HEX = ['#fbbf24', '#22d3ee', '#a78bfa'];
export const COLOUR_NAME = ['Amber', 'Cyan', 'Violet'];
export const COLOUR_TRAIT = ['mucus capsule: longer shield', 'phage-resistant capsule: damps cascades', 'immune-evasion capsule: survives inflammation, boosts cooling'];
const WALL_R = balance.wallR; // wall radius in pixels (world-fixed)
const WU = 2.4; // wall features (villi, swelling) are drawn this many times bigger than a pixel

export interface View { W: number; H: number; cx: number; cy: number; U: number; dpr: number }
export interface Pick { i: number; j: number }

interface Effect { x: number; y: number; t0: number; life: number; kind: 'burst' | 'puff' | 'pulse' | 'spark' | 'ring' | 'wedge' | 'pix'; colours: string[]; angle?: number; half?: number }

function parse(hex: string): [number, number, number] { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
export const hexA = (hex: string, a: number) => { const [r, g, b] = parse(hex); return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, a))})`; };
function lighten(hex: string, amt: number): string {
  const [r, g, b] = parse(hex).map((v) => Math.max(0, Math.min(255, Math.round(amt >= 0 ? v + (255 - v) * amt : v * (1 + amt)))));
  return `rgb(${r},${g},${b})`;
}
const lightenHex = (hex: string, amt: number) => lighten(hex, amt);
const SHADES: string[][] = COLOUR_HEX.map((h) => [lightenHex(h, 0.12), lightenHex(h, 0.02), lightenHex(h, -0.08), lightenHex(h, 0.2)]);
export const maskColours = (mask: number) => [0, 1, 2].filter((c) => mask & (1 << c)).map((c) => COLOUR_HEX[c]);

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  view: View = { W: 0, H: 0, cx: 0, cy: 0, U: 1, dpr: 1 };
  private effects: Effect[] = [];
  private born = new WeakMap<Cell, number>();
  private seed = new WeakMap<Cell, number>();
  private flash = new WeakMap<Cell, { c: number; t: number }>();
  private firedSeen = new Set<number>();
  private lastS: State | null = null;
  time = 0;

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
    const top = W < 640 ? 120 : 56, bottom = 110;
    const availH = Math.max(100, H - top - bottom);
    this.view = { W, H, cx: W / 2, cy: top + availH / 2, U: Math.min(W, availH) / 2 / (WALL_R + 7.5), dpr };
  }

  reset(): void { this.effects = []; this.firedSeen.clear(); this.lastS = null; }

  /** Local block coordinates -> screen, through the blob's rotation. */
  toScreen(s: State, i: number, j: number, theta = s.theta): [number, number] {
    const c = Math.cos(theta), sn = Math.sin(theta);
    return [this.view.cx + this.view.U * (i * c - j * sn), this.view.cy + this.view.U * (i * sn + j * c)];
  }

  /** Screen -> the block under it (or null). */
  pick(s: State, px: number, py: number): Pick | null {
    const { cx, cy, U } = this.view;
    const dx = (px - cx) / U, dy = (py - cy) / U;
    const c = Math.cos(-s.theta), sn = Math.sin(-s.theta);
    const i = Math.round(dx * c - dy * sn), j = Math.round(dx * sn + dy * c);
    return cellAt(s, i, j) ? { i, j } : null;
  }

  angleOf(px: number, py: number): number { return Math.atan2(py - this.view.cy, px - this.view.cx); }

  private polar(r: number, a: number): [number, number] { return [this.view.cx + Math.cos(a) * r * this.view.U, this.view.cy + Math.sin(a) * r * this.view.U]; }

  draw(s: State, acc: number, hover: Pick | null, slow: boolean): void {
    const { ctx } = this;
    const { W, H, dpr } = this.view;
    this.time = performance.now() / 1000;
    const theta = s.theta + s.omega * acc; // smooth between ticks
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const shake = s.health < 25 ? ((25 - s.health) / 25) * 2.2 : 0;
    ctx.save();
    if (shake) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    this.drawBackground(s, slow);
    this.drawWall(s);
    this.drawTelegraphs(s);
    this.drainEvents(s, theta);
    this.drawBlob(s, theta, hover);
    this.drawShield(s, theta);
    this.drawPhages(s, acc);
    this.drawEffects();
    ctx.restore();
    this.drawVignette(s);
    this.lastS = s;
  }

  // ---- background and wall ---------------------------------------------------
  private drawBackground(s: State, slow: boolean): void {
    const { ctx } = this;
    const { W, H, cx, cy, U } = this.view;
    const heat = Math.max(0, s.inflammation - 0.4);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.7);
    g.addColorStop(0, `rgb(${14 + heat * 40},${22 - heat * 10},${44 - heat * 24})`);
    g.addColorStop(1, '#04070d');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(120,150,200,0.035)';
    for (let i = 0; i < 36; i++) {
      const a = i * 2.399, r = (i % 7) * 1.3 + 1 + Math.sin(this.time * 0.2 + i) * 0.2;
      const [x, y] = this.polar(r, a + this.time * 0.01);
      ctx.beginPath(); ctx.arc(x, y, U * (0.15 + (i % 3) * 0.1), 0, TAU); ctx.fill();
    }
    if (slow) { ctx.fillStyle = 'rgba(251,191,36,0.05)'; ctx.fillRect(0, 0, W, H); }
  }

  private wallColor(w: number, l = 0): string {
    const stops: [number, number][] = [[0, 195], [0.3, 214], [0.5, 255], [0.68, 325], [0.85, 352], [1, 358]];
    let hue = stops[stops.length - 1][1];
    for (let i = 1; i < stops.length; i++) {
      if (w <= stops[i][0]) { const [w0, h0] = stops[i - 1], [w1, h1] = stops[i]; hue = h0 + ((w - w0) / (w1 - w0)) * (h1 - h0); break; }
    }
    return `hsl(${hue} ${42 + 38 * w}% ${22 + 12 * w + l}%)`;
  }

  private heartbeat(s: State): number {
    const p = (this.time * (0.8 + 1.7 * s.inflammation)) % 1;
    return Math.exp(-p * 7) + 0.6 * Math.exp(-Math.abs(p - 0.3) * 16);
  }

  private drawWall(s: State): void {
    const { ctx } = this;
    const { cx, cy, U } = this.view;
    const S = B.wall.sectors;
    const beat = this.heartbeat(s);
    for (let j = 0; j < S; j++) {
      const w = s.wall[j];
      const a0 = (j / S) * TAU, a1 = ((j + 1) / S) * TAU + 0.004;
      const swell = (0.42 + 0.95 * w) * WU * (1 + 0.07 * w * beat);
      ctx.beginPath();
      ctx.arc(cx, cy, WALL_R * U, a0, a1);
      ctx.arc(cx, cy, (WALL_R + swell) * U, a1, a0, true);
      ctx.closePath();
      ctx.fillStyle = this.wallColor(w); ctx.fill();
      const n = 9;
      for (let v = 0; v < n; v++) {
        const a = a0 + ((v + 0.5) / n) * (a1 - a0);
        const sway = Math.sin(this.time * (0.35 + 0.8 * w) + j * 3 + v) * (0.035 - 0.02 * w);
        const len = (0.36 - 0.18 * w) * WU * (0.85 + 0.3 * ((v * 7 + j) % 3) / 2);
        const [x0, y0] = this.polar(WALL_R, a), [x1, y1] = this.polar(WALL_R - len, a + sway);
        ctx.strokeStyle = this.wallColor(w, 8); ctx.lineWidth = U * (0.12 + 0.1 * w) * WU; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      }
      const mucusBoost = s.mucus > 0 ? 1.8 : 1;
      ctx.strokeStyle = `rgba(250,204,21,${s.mucus > 0 ? 0.35 : 0.22 * (1 - w)})`;
      ctx.lineWidth = U * 0.22 * WU * (1 - 0.8 * w) * mucusBoost;
      ctx.beginPath(); ctx.arc(cx, cy, (WALL_R - 0.42 * WU) * U, a0 + 0.02, a1 - 0.02); ctx.stroke();
      if (w > 0.65) {
        ctx.fillStyle = 'rgba(255,120,110,0.55)';
        for (let d = 0; d < 5; d++) {
          const a = (a0 + a1) / 2 + Math.sin(this.time * 0.7 + d * 2 + j) * 0.12;
          const r = WALL_R - 1.2 - ((this.time * 0.15 + d * 0.31 + j * 0.13) % 1) * 2.2;
          const [x, y] = this.polar(r, a);
          ctx.beginPath(); ctx.arc(x, y, U * 0.16, 0, TAU); ctx.fill();
        }
      }
    }
  }

  private drawVignette(s: State): void {
    const { ctx } = this;
    const { W, H, cx, cy } = this.view;
    const stress = Math.max(0, Math.min(1, (s.inflammation - 0.45) * 1.7));
    const low = Math.max(0, (35 - s.health) / 35);
    const a = Math.max(stress * 0.5, low * 0.65) * (0.65 + 0.35 * this.heartbeat(s));
    if (a < 0.01) return;
    const g = ctx.createRadialGradient(cx, cy, Math.min(W, H) * 0.3, cx, cy, Math.max(W, H) * 0.75);
    g.addColorStop(0, 'rgba(160,10,20,0)'); g.addColorStop(1, `rgba(170,12,24,${a})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }

  // ---- telegraphs -------------------------------------------------------------
  private arc(r: number, a0: number, a1: number): void { this.ctx.beginPath(); this.ctx.arc(this.view.cx, this.view.cy, r * this.view.U, a0, a1); }

  private colourStroke(cols: string[], alpha: number): string | CanvasGradient {
    if (cols.length === 1) return hexA(cols[0], alpha);
    const { ctx } = this; const { cx, cy, U } = this.view;
    const g = ctx.createLinearGradient(cx - 12 * U, cy, cx + 12 * U, cy);
    cols.forEach((c, k) => g.addColorStop(k / (cols.length - 1), hexA(c, alpha)));
    return g;
  }

  private drawTelegraphs(s: State): void {
    const { ctx } = this;
    const { cx, cy, U } = this.view;
    const pulse = 0.55 + 0.45 * Math.sin(this.time * 9);
    const flare = (f: { angle: number; half: number; t0: number }, live: boolean) => {
      ctx.strokeStyle = live ? `rgba(248,113,113,${0.55 + 0.3 * Math.sin(this.time * 6)})` : `rgba(248,113,113,${0.5 * pulse})`;
      ctx.lineWidth = U * 0.18; ctx.lineCap = 'round'; if (!live) ctx.setLineDash([U * 0.22, U * 0.24]);
      this.arc(WALL_R + 3.6, f.angle - f.half, f.angle + f.half); ctx.stroke(); ctx.setLineDash([]);
      const [x, y] = this.polar(WALL_R + 5.2, f.angle);
      ctx.fillStyle = '#fca5a5'; ctx.font = `600 ${U * 1.1}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(live ? 'flare' : `flare ${Math.max(0, f.t0 - s.t).toFixed(0)}`, x, y);
    };
    for (const f of warnings(s).flares) flare(f, false);
    for (const f of activeFlares(s)) flare(f, true);
    for (const a of warnings(s).abx) {
      const left = Math.max(0, a.t0 - s.t), urgency = 1 - Math.min(1, left / B.director.warn);
      ctx.fillStyle = `rgba(253,224,71,${(0.07 + 0.2 * urgency) * (0.6 + 0.4 * Math.sin(this.time * (6 + 14 * urgency)))})`;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, (WALL_R + 0.3) * U, a.angle - a.half, a.angle + a.half); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = `rgba(253,224,71,${0.35 + 0.4 * urgency})`; ctx.lineWidth = 1.5; ctx.stroke();
      const [x, y] = this.polar(WALL_R + 3.0, a.angle);
      ctx.fillStyle = '#fde047'; ctx.font = `700 ${U * 1.1}px system-ui`; ctx.textAlign = 'center';
      ctx.fillText(`antibiotic ${left.toFixed(1)}s`, x, y);
    }
    s.abx.forEach((a, i) => {
      if (a.fired && !this.firedSeen.has(i)) {
        this.firedSeen.add(i);
        this.effects.push({ x: cx, y: cy, t0: this.time, life: 0.8, kind: 'wedge', colours: ['#fde047'], angle: a.angle, half: a.half });
      }
    });
  }

  // ---- events -> effects ------------------------------------------------------
  private drainEvents(s: State, theta: number): void {
    if (!s.events) { s.events = []; return; }
    for (const e of s.events) {
      const [x, y] = e.kind === 'secrete' ? [this.view.cx, this.view.cy] : this.toScreen(s, e.x, e.y, theta);
      const cols = e.mask ? maskColours(e.mask) : e.c !== undefined ? [COLOUR_HEX[e.c]] : ['#94a3b8'];
      const t0 = this.time;
      if (e.kind === 'infect') this.effects.push({ x, y, t0, life: 0.6, kind: 'pulse', colours: cols });
      else if (e.kind === 'deflect') this.effects.push({ x, y, t0, life: 0.35, kind: 'spark', colours: cols });
      else if (e.kind === 'mucus') this.effects.push({ x, y, t0, life: 0.45, kind: 'spark', colours: ['#fde047'] });
      else if (e.kind === 'lysis') { if (this.effects.length < 700) this.effects.push({ x, y, t0, life: 0.55, kind: 'pix', colours: e.mask ? cols : ['#e2e8f0'] }); }
      else if (e.kind === 'abx') { if (this.effects.length < 700) this.effects.push({ x, y, t0, life: 0.5, kind: 'pix', colours: ['#fde047'] }); }
      else if (e.kind === 'immune') { if (this.effects.length < 700) this.effects.push({ x, y, t0, life: 0.45, kind: 'pix', colours: ['#fecaca'] }); }
      else if (e.kind === 'evade') this.effects.push({ x, y, t0, life: 0.5, kind: 'pulse', colours: ['#c4b5fd'] });
      else if (e.kind === 'starve') { if (this.effects.length < 700) this.effects.push({ x, y, t0, life: 0.5, kind: 'pix', colours: ['#94a3b8'] }); }
      else if (e.kind === 'secrete') this.effects.push({ x, y, t0, life: 0.9, kind: 'ring', colours: ['#fde047'] });
    }
    s.events.length = 0;
  }

  // ---- the blob ----------------------------------------------------------------
  private seedOf(c: Cell): number { let v = this.seed.get(c); if (v === undefined) { v = Math.random(); this.seed.set(c, v); } return v; }

  private drawBlob(s: State, theta: number, hover: Pick | null): void {
    const { ctx } = this;
    const { cx, cy, U } = this.view;
    const patch = hover ? this.patchOf(s, hover.i, hover.j) : null;
    const tNow = this.time;
    ctx.save();
    ctx.translate(cx, cy); ctx.rotate(theta); ctx.scale(U, U);
    // soft halo first (one pass): the pixels read as a single living body
    ctx.globalAlpha = 0.1;
    eachCell(s, (c, i, j) => { ctx.fillStyle = COLOUR_HEX[c.c]; ctx.fillRect(i - 1.1, j - 1.1, 2.2, 2.2); });
    ctx.globalAlpha = 1;
    eachCell(s, (c, i, j) => {
      let born = this.born.get(c);
      if (born === undefined) { born = this.lastS ? tNow : -10; this.born.set(c, born); }
      const grow = Math.min(1, (tNow - born) / 0.4);
      const sz = 0.35 + 0.65 * grow;
      let fl = this.flash.get(c);
      if (!fl) { fl = { c: c.c, t: -10 }; this.flash.set(c, fl); }
      if (fl.c !== c.c) { fl.c = c.c; fl.t = tNow; }
      const flash = Math.max(0, 1 - (tNow - fl.t) / 1.0);
      const shade = ((i * 7 + j * 13 + Math.floor(tNow * 0.5 + ((i * 31 + j * 17) & 7))) & 3);
      const base = SHADES[c.c][shade];
      if (c.inf > 0) {
        const cols = maskColours(c.ph);
        const f = c.inf / B.phage.infectTime;
        ctx.fillStyle = Math.sin(tNow * 30 + i + j) > 0 ? cols[0] : cols[cols.length - 1];
        ctx.fillRect(i - 0.5 * sz, j - 0.5 * sz, sz + 0.04, sz + 0.04);
        ctx.fillStyle = `rgba(10,8,20,${0.5 * (1 - f)})`; ctx.fillRect(i - 0.5 * sz, j - 0.5 * sz, sz + 0.04, sz + 0.04);
        return;
      }
      ctx.fillStyle = base;
      ctx.fillRect(i - 0.5 * sz, j - 0.5 * sz, sz + 0.04, sz + 0.04);
      if (flash > 0) { ctx.fillStyle = `rgba(255,255,255,${0.65 * flash})`; ctx.fillRect(i - 0.5 * sz, j - 0.5 * sz, sz + 0.04, sz + 0.04); }
      if (patch && patch.has(i * 1000 + j)) { ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.fillRect(i - 0.5, j - 0.5, 1.04, 1.04); }
    });
    // the capsule detail only shows on the surface, where it matters
    ctx.lineWidth = 0.16;
    eachCell(s, (c, i, j) => {
      if (c.inf > 0 || !exposed(s, i, j)) return;
      if (c.c === 1) { ctx.strokeStyle = 'rgba(8,47,73,0.8)'; ctx.strokeRect(i - 0.35, j - 0.35, 0.7, 0.7); }
      else if (c.c === 2) { ctx.fillStyle = 'rgba(245,243,255,0.7)'; ctx.fillRect(i - 0.12, j - 0.12, 0.24, 0.24); }
      else { ctx.fillStyle = 'rgba(255,251,235,0.55)'; ctx.fillRect(i - 0.3, j - 0.35, 0.34, 0.2); }
    });
    if (hover) { ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 0.25; ctx.strokeRect(hover.i - 0.6, hover.j - 0.6, 1.2, 1.2); }
    ctx.restore();
  }

  patchOf(s: State, i: number, j: number): Set<number> {
    const start = cellAt(s, i, j);
    const seen = new Set<number>();
    if (!start) return seen;
    const q: [number, number][] = [[i, j]]; seen.add(i * 1000 + j);
    for (let h = 0; h < q.length; h++) {
      const [a, b] = q[h];
      for (const [di, dj] of NEIGH) {
        const n = cellAt(s, a + di, b + dj);
        if (n && n.c === start.c && !seen.has((a + di) * 1000 + b + dj)) { seen.add((a + di) * 1000 + b + dj); q.push([a + di, b + dj]); }
      }
    }
    return seen;
  }

  private drawShield(s: State, theta: number): void {
    if (s.mucus <= 0) return;
    const { ctx } = this;
    const { cx, cy, U } = this.view;
    let maxR = 0;
    eachCell(s, (_, i, j) => { maxR = Math.max(maxR, Math.hypot(i, j)); });
    const fade = Math.min(1, s.mucus / 1.2);
    const r = (maxR + 2.2) * U;
    const g = ctx.createRadialGradient(cx, cy, r * 0.7, cx, cy, r * 1.08);
    g.addColorStop(0, 'rgba(253,224,71,0)'); g.addColorStop(0.75, `rgba(253,224,71,${0.12 * fade})`); g.addColorStop(1, `rgba(253,224,71,${0.45 * fade})`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r * 1.08, 0, TAU); ctx.fill();
    ctx.strokeStyle = `rgba(254,240,138,${0.8 * fade})`; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.stroke();
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * TAU + this.time * 0.4 + theta * 0;
      const rr = r + Math.sin(this.time * 2 + k) * U * 0.1;
      ctx.fillStyle = `rgba(254,240,138,${0.5 * fade})`;
      ctx.beginPath(); ctx.arc(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, U * 0.22, 0, TAU); ctx.fill();
    }
  }

  // ---- phages ------------------------------------------------------------------
  private drawPhages(s: State, acc: number): void {
    const { ctx } = this;
    const { U } = this.view;
    for (const p of s.phages) {
      const r = p.r - B.phage.speed * acc;
      if (r < 0) continue;
      const cols = maskColours(p.mask);
      const [x, y] = this.polar(r, p.angle);
      const [tx, ty] = this.polar(r + 3.2, p.angle);
      ctx.strokeStyle = hexA(cols[0], 0.4); ctx.lineWidth = U * 0.28; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(tx, ty); ctx.stroke();
      ctx.save(); ctx.translate(x, y); ctx.rotate(p.angle + Math.PI / 2);
      const hs = U * 0.95;
      ctx.shadowColor = cols[0]; ctx.shadowBlur = 14;
      ctx.beginPath();
      for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU + Math.PI / 6; const px = Math.cos(a) * hs, py = Math.sin(a) * hs * 1.1 - hs * 0.2; if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); }
      ctx.closePath();
      if (cols.length === 1) ctx.fillStyle = cols[0];
      else { const g = ctx.createLinearGradient(-hs, 0, hs, 0); g.addColorStop(0, cols[0]); g.addColorStop(0.499, cols[0]); g.addColorStop(0.501, cols[1]); g.addColorStop(1, cols[1]); ctx.fillStyle = g; }
      ctx.fill(); ctx.shadowBlur = 0;
      ctx.strokeStyle = '#0b1020'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.strokeStyle = cols[cols.length - 1]; ctx.lineWidth = Math.max(1.2, U * 0.16);
      ctx.beginPath(); ctx.moveTo(0, hs * 0.8); ctx.lineTo(0, hs * 1.6); ctx.moveTo(-hs * 0.5, hs * 0.7); ctx.lineTo(-hs * 0.95, hs * 1.5); ctx.moveTo(hs * 0.5, hs * 0.7); ctx.lineTo(hs * 0.95, hs * 1.5); ctx.stroke();
      ctx.restore();
    }
    // immune cells: pale cells with a red glow, fired from the inflamed wall
    for (const m of s.immune) {
      const r = m.r - B.immune.speed * acc;
      if (r < 0) continue;
      const [x, y] = this.polar(r, m.angle);
      const [tx, ty] = this.polar(r + 2.2, m.angle);
      ctx.strokeStyle = 'rgba(254,202,202,0.35)'; ctx.lineWidth = U * 0.3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(tx, ty); ctx.stroke();
      ctx.shadowColor = '#ef4444'; ctx.shadowBlur = 14;
      const g = ctx.createRadialGradient(x, y, 0, x, y, U * 0.95);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.7, '#fecaca'); g.addColorStop(1, '#f87171');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, U * 0.85, 0, TAU); ctx.fill(); ctx.shadowBlur = 0;
      ctx.fillStyle = '#7f1d1d'; ctx.beginPath(); ctx.arc(x + U * 0.15, y - U * 0.1, U * 0.22, 0, TAU); ctx.fill();
    }
  }

  // ---- effects -----------------------------------------------------------------
  private drawEffects(): void {
    const { ctx } = this;
    const { cx, cy, U } = this.view;
    this.effects = this.effects.filter((e) => this.time - e.t0 < e.life);
    for (const e of this.effects) {
      const f = (this.time - e.t0) / e.life, col = e.colours[0], col2 = e.colours[e.colours.length - 1];
      if (e.kind === 'wedge') {
        ctx.fillStyle = `rgba(254,240,138,${0.5 * (1 - f)})`;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, (WALL_R + 0.3) * U, e.angle! - e.half!, e.angle! + e.half!); ctx.closePath(); ctx.fill();
        continue;
      }
      ctx.strokeStyle = hexA(col, 0.9 * (1 - f)); ctx.fillStyle = hexA(col, 0.9 * (1 - f)); ctx.lineWidth = 2;
      if (e.kind === 'ring') { ctx.beginPath(); ctx.arc(e.x, e.y, U * (2 + 20 * f), 0, TAU); ctx.lineWidth = 3 * (1 - f) + 1; ctx.stroke(); }
      else if (e.kind === 'pulse') { ctx.beginPath(); ctx.arc(e.x, e.y, U * (1 + 2.2 * f), 0, TAU); ctx.stroke(); }
      else if (e.kind === 'spark') {
        for (let k = 0; k < 7; k++) { const a = (k / 7) * TAU + 0.5, d = U * (0.6 + 1.8 * f); ctx.beginPath(); ctx.moveTo(e.x + Math.cos(a) * d * 0.5, e.y + Math.sin(a) * d * 0.5); ctx.lineTo(e.x + Math.cos(a) * d, e.y + Math.sin(a) * d); ctx.stroke(); }
      } else if (e.kind === 'burst') {
        ctx.beginPath(); ctx.arc(e.x, e.y, U * (0.4 + 1.1 * f), 0, TAU); ctx.stroke();
        for (let k = 0; k < 10; k++) {
          const a = (k / 10) * TAU + 0.3, d = U * (0.3 + 1.3 * f);
          ctx.fillStyle = hexA(k % 2 ? col : col2, 0.9 * (1 - f)); ctx.beginPath(); ctx.arc(e.x + Math.cos(a) * d, e.y + Math.sin(a) * d, U * 0.1 * (1 - f), 0, TAU); ctx.fill();
        }
      } else if (e.kind === 'pix') {
        for (let k = 0; k < 4; k++) { const a = (k / 4) * TAU + e.x * 0.37, d = U * (0.3 + 1.4 * f); ctx.fillRect(e.x + Math.cos(a) * d - U * 0.25, e.y + Math.sin(a) * d - U * 0.25, U * 0.5 * (1 - f), U * 0.5 * (1 - f)); }
      } else {
        for (let k = 0; k < 5; k++) { const a = (k / 5) * TAU, d = U * (0.15 + 0.5 * f); ctx.beginPath(); ctx.arc(e.x + Math.cos(a) * d, e.y + Math.sin(a) * d, U * 0.07 * (1 - f), 0, TAU); ctx.fill(); }
      }
    }
  }
}
void R; void sectorOfAngle; void worldAngle;
