import balance from '../data/balance.json';
import { NEIGH, TAU, angDiff, cellAt, eachCell, exposed, wrap } from '../engine/geometry';
import type { Preview } from '../engine/plan';
import type { Cell, State } from '../engine/types';

const B = balance;
export const COLOUR_HEX = ['#fbbf24', '#22d3ee', '#a78bfa'];
export const COLOUR_NAME = ['Amber', 'Cyan', 'Violet'];
const WALL_R = B.wallR;
const WU = 2.4; // wall features are drawn this many times bigger than a pixel
const S = B.wallSectors;

export interface View { W: number; H: number; cx: number; cy: number; U: number; dpr: number }
export interface Pick { i: number; j: number }

interface Effect { x: number; y: number; t0: number; life: number; kind: 'pix' | 'pulse' | 'spark' | 'ring' | 'wedge' | 'cool'; colours: string[]; angle?: number; half?: number }

function parse(hex: string): [number, number, number] { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
export const hexA = (hex: string, a: number) => { const [r, g, b] = parse(hex); return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, a))})`; };
function lighten(hex: string, amt: number): string {
  const [r, g, b] = parse(hex).map((v) => Math.max(0, Math.min(255, Math.round(amt >= 0 ? v + (255 - v) * amt : v * (1 + amt)))));
  return `rgb(${r},${g},${b})`;
}
const SHADES: string[][] = COLOUR_HEX.map((h) => [lighten(h, 0.12), lighten(h, 0.02), lighten(h, -0.08), lighten(h, 0.2)]);
export const maskColours = (mask: number) => [0, 1, 2].filter((c) => mask & (1 << c)).map((c) => COLOUR_HEX[c]);

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  view: View = { W: 0, H: 0, cx: 0, cy: 0, U: 1, dpr: 1 };
  private effects: Effect[] = [];
  private born = new WeakMap<Cell, number>();
  private flash = new WeakMap<Cell, { c: number; t: number }>();
  private lastS: State | null = null;
  private dispTheta = 0;
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
    const top = W < 640 ? 150 : 74, bottom = 118;
    const availH = Math.max(100, H - top - bottom);
    this.view = { W, H, cx: W / 2, cy: top + availH / 2, U: Math.min(W, availH) / 2 / (WALL_R + 7.5), dpr };
  }

  reset(): void { this.effects = []; this.lastS = null; }

  toScreen(i: number, j: number, theta: number): [number, number] {
    const c = Math.cos(theta), sn = Math.sin(theta);
    return [this.view.cx + this.view.U * (i * c - j * sn), this.view.cy + this.view.U * (i * sn + j * c)];
  }
  private polar(r: number, a: number): [number, number] { return [this.view.cx + Math.cos(a) * r * this.view.U, this.view.cy + Math.sin(a) * r * this.view.U]; }
  angleOf(px: number, py: number): number { return Math.atan2(py - this.view.cy, px - this.view.cx); }
  distOf(px: number, py: number): number { return Math.hypot(px - this.view.cx, py - this.view.cy) / this.view.U; }

  pick(s: State, px: number, py: number): Pick | null {
    const dx = (px - this.view.cx) / this.view.U, dy = (py - this.view.cy) / this.view.U;
    const c = Math.cos(-this.dispTheta), sn = Math.sin(-this.dispTheta);
    const i = Math.round(dx * c - dy * sn), j = Math.round(dx * sn + dy * c);
    return cellAt(s, i, j) ? { i, j } : null;
  }

  /** Radius of the blob in pixels (so the input can tell "turn the blob" from "aim the effort"). */
  blobRadius(s: State): number { let m = 0; eachCell(s, (_, i, j) => { m = Math.max(m, Math.hypot(i, j)); }); return m; }

  draw(s: State, pv: Preview | null, hover: Pick | null): void {
    const { ctx } = this;
    const { W, H, dpr } = this.view;
    this.time = performance.now() / 1000;
    this.dispTheta += angDiff(this.dispTheta, s.theta) * 0.35; // the blob turns fast but visibly
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    this.drawBackground(s);
    this.drawWall(s);
    this.drainEvents(s);
    if (s.phase === 'plan' && pv) this.drawAnnouncements(s, pv);
    this.drawSection(s);
    this.drawBlob(s, hover);
    this.drawShield(s);
    this.drawFlight(s);
    this.drawEffects();
    this.drawVignette(s);
    this.lastS = s;
  }

  // ---- background and wall ---------------------------------------------------
  private drawBackground(s: State): void {
    const { ctx } = this; const { W, H, cx, cy, U } = this.view;
    const heat = Math.max(0, s.inflammation - 0.35);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.7);
    g.addColorStop(0, `rgb(${14 + heat * 50},${22 - heat * 10},${44 - heat * 24})`); g.addColorStop(1, '#04070d');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(120,150,200,0.035)';
    for (let i = 0; i < 36; i++) { const a = i * 2.399, r = (i % 7) * 1.3 + 1 + Math.sin(this.time * 0.2 + i) * 0.2; const [x, y] = this.polar(r, a + this.time * 0.01); ctx.beginPath(); ctx.arc(x, y, U * (0.15 + (i % 3) * 0.1), 0, TAU); ctx.fill(); }
  }

  private wallColor(w: number, l = 0): string {
    const stops: [number, number][] = [[0, 195], [0.3, 214], [0.5, 255], [0.68, 325], [0.85, 352], [1, 358]];
    let hue = 358;
    for (let i = 1; i < stops.length; i++) if (w <= stops[i][0]) { const [w0, h0] = stops[i - 1], [w1, h1] = stops[i]; hue = h0 + ((w - w0) / (w1 - w0)) * (h1 - h0); break; }
    return `hsl(${hue} ${42 + 38 * w}% ${22 + 12 * w + l}%)`;
  }
  private heartbeat(s: State): number { const p = (this.time * (0.8 + 1.7 * s.inflammation)) % 1; return Math.exp(-p * 7) + 0.6 * Math.exp(-Math.abs(p - 0.3) * 16); }

  private drawWall(s: State): void {
    const { ctx } = this; const { cx, cy, U } = this.view;
    const beat = this.heartbeat(s);
    for (let j = 0; j < S; j++) {
      const w = s.wall[j];
      const a0 = (j / S) * TAU, a1 = ((j + 1) / S) * TAU + 0.004;
      const swell = (0.42 + 0.95 * w) * WU * (1 + 0.07 * w * beat);
      ctx.beginPath(); ctx.arc(cx, cy, WALL_R * U, a0, a1); ctx.arc(cx, cy, (WALL_R + swell) * U, a1, a0, true); ctx.closePath();
      ctx.fillStyle = this.wallColor(w); ctx.fill();
      for (let v = 0; v < 8; v++) {
        const a = a0 + ((v + 0.5) / 8) * (a1 - a0);
        const sway = Math.sin(this.time * (0.35 + 0.8 * w) + j * 3 + v) * (0.035 - 0.02 * w);
        const len = (0.36 - 0.18 * w) * WU * (0.85 + 0.3 * ((v * 7 + j) % 3) / 2);
        const [x0, y0] = this.polar(WALL_R, a), [x1, y1] = this.polar(WALL_R - len, a + sway);
        ctx.strokeStyle = this.wallColor(w, 8); ctx.lineWidth = U * (0.12 + 0.1 * w) * WU; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      }
      ctx.strokeStyle = `rgba(110,200,190,${0.22 * (1 - w)})`; ctx.lineWidth = U * 0.22 * WU * (1 - 0.8 * w);
      ctx.beginPath(); ctx.arc(cx, cy, (WALL_R - 0.42 * WU) * U, a0 + 0.02, a1 - 0.02); ctx.stroke();
      if (w > 0.65) {
        ctx.fillStyle = 'rgba(255,120,110,0.55)';
        for (let d = 0; d < 5; d++) { const a = (a0 + a1) / 2 + Math.sin(this.time * 0.7 + d * 2 + j) * 0.12; const r = WALL_R - 1.2 - ((this.time * 0.15 + d * 0.31 + j * 0.13) % 1) * 2.2; const [x, y] = this.polar(r, a); ctx.beginPath(); ctx.arc(x, y, U * 0.16, 0, TAU); ctx.fill(); }
      }
    }
  }

  private drawVignette(s: State): void {
    const { ctx } = this; const { W, H, cx, cy } = this.view;
    const a = Math.max(0, Math.min(1, (s.inflammation - 0.4) * 2.2)) * 0.55 * (0.65 + 0.35 * this.heartbeat(s));
    if (a < 0.01) return;
    const g = ctx.createRadialGradient(cx, cy, Math.min(W, H) * 0.3, cx, cy, Math.max(W, H) * 0.75);
    g.addColorStop(0, 'rgba(160,10,20,0)'); g.addColorStop(1, `rgba(170,12,24,${a})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }

  // ---- the immune section on the wall --------------------------------------------
  private drawSection(s: State): void {
    const sec = s.section; if (sec.kind === 'quiet') return;
    const { ctx } = this; const { U } = this.view;
    const label = sec.kind === 'pre' ? 'pre-flare' : sec.kind === 'flare' ? 'FLARE' : 'after-flare';
    const strong = sec.kind === 'flare';
    ctx.strokeStyle = `rgba(248,113,113,${(strong ? 0.85 : 0.5) * (0.7 + 0.3 * Math.sin(this.time * (strong ? 7 : 3)))})`;
    ctx.lineWidth = U * (strong ? 0.5 : 0.3); ctx.lineCap = 'round'; ctx.setLineDash(strong ? [] : [U * 0.6, U * 0.7]);
    ctx.beginPath(); ctx.arc(this.view.cx, this.view.cy, (WALL_R + 4.6) * U, sec.angle - sec.half, sec.angle + sec.half); ctx.stroke(); ctx.setLineDash([]);
    const [x, y] = this.polar(WALL_R + 6.4, sec.angle);
    this.label(`${label} · ${sec.left} turn${sec.left === 1 ? '' : 's'} left`, x, y, '#fca5a5');
  }

  // ---- announcements: where everything is going to land -----------------------------
  private drawAnnouncements(s: State, pv: Preview): void {
    const { ctx } = this; const { cx, cy, U } = this.view;
    const th = this.dispTheta;
    const lineTo = (angle: number, hit: { i: number; j: number } | null, col: string, ok: boolean) => {
      const [x0, y0] = this.polar(WALL_R + 3, angle);
      const [x1, y1] = hit ? this.toScreen(hit.i, hit.j, th) : this.polar(0, angle);
      ctx.strokeStyle = hexA(col, ok ? 0.55 : 0.85); ctx.lineWidth = Math.max(1.5, U * 0.22); ctx.setLineDash([U * 0.7, U * 0.55]); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); ctx.setLineDash([]);
      return [x1, y1] as [number, number];
    };
    for (const p of pv.phages) {
      const cols = maskColours(p.mask);
      const ok = p.outcome !== 'bite';
      const [ex, ey] = lineTo(p.angle, p.hit, cols[0], ok);
      this.phageSprite(...this.polar(WALL_R + 3, p.angle), p.angle, cols, 1);
      if (p.outcome === 'bite') {
        const rad = Math.max(1.4, Math.sqrt(p.size / Math.PI)) * U;
        ctx.strokeStyle = '#fb7185'; ctx.lineWidth = 2.5; ctx.setLineDash([6, 4]);
        ctx.beginPath(); ctx.arc(ex, ey, rad, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(251,113,133,0.12)'; ctx.beginPath(); ctx.arc(ex, ey, rad, 0, TAU); ctx.fill();
        this.label(`~${p.size} px`, ex, ey - rad - U * 1.2, '#fecdd3');
      } else if (p.outcome === 'deflect' || p.outcome === 'blocked') {
        ctx.strokeStyle = '#4ade80'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(ex, ey, U * 1.1, 0, TAU); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(ex - U * 0.5, ey); ctx.lineTo(ex - U * 0.1, ey + U * 0.45); ctx.lineTo(ex + U * 0.6, ey - U * 0.5); ctx.stroke();
      }
    }
    for (const m of pv.immune) {
      const [ex, ey] = lineTo(m.angle, m.hit, '#fecaca', m.outcome !== 'bite');
      this.immuneSprite(...this.polar(WALL_R + 3, m.angle), 1);
      if (m.hit) {
        ctx.strokeStyle = m.outcome === 'bite' ? '#fca5a5' : '#c4b5fd'; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.arc(ex, ey, U * 0.9, 0, TAU); ctx.stroke();
      }
    }
    if (pv.abx) {
      const a = pv.abx;
      ctx.fillStyle = `rgba(253,224,71,${0.12 + 0.08 * Math.sin(this.time * 6)})`;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, (WALL_R + 0.3) * U, a.angle - a.half, a.angle + a.half); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(253,224,71,0.7)'; ctx.lineWidth = 1.5; ctx.stroke();
      const [x, y] = this.polar(WALL_R + 3.2, a.angle);
      this.label(`antibiotic ~${a.killed} px`, x, y, '#fde047');
    }
    // the effort: a gold arc on the wall with how much it would cool
    const fx = pv.exert;
    ctx.strokeStyle = `rgba(250,204,21,${0.55 + 0.25 * Math.sin(this.time * 4)})`; ctx.lineWidth = U * 0.55; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(cx, cy, (WALL_R - 1.6) * U, s.exert - B.exert.half, s.exert + B.exert.half); ctx.stroke();
    const [gx, gy] = this.polar(WALL_R + 3.4, s.exert);
    this.label(`cooling ${Math.round(Math.min(1, fx.power) * 100)}%`, gx, gy, '#fde68a');
  }

  /** Text on a dark pill so it stays readable over pixels and the wall. */
  private label(text: string, x: number, y: number, color: string, size = 1.05): void {
    const { ctx } = this; const { U } = this.view;
    ctx.font = `700 ${U * size}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const w = ctx.measureText(text).width + U * 0.9, h = U * (size + 0.7);
    ctx.fillStyle = 'rgba(6,10,20,0.78)'; ctx.beginPath(); ctx.roundRect(x - w / 2, y - h / 2, w, h, h / 2); ctx.fill();
    ctx.fillStyle = color; ctx.fillText(text, x, y);
  }

  private phageSprite(x: number, y: number, angle: number, cols: string[], k: number): void {
    const { ctx } = this; const { U } = this.view;
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle + Math.PI / 2);
    const hs = U * 0.95 * k;
    ctx.shadowColor = cols[0]; ctx.shadowBlur = 12;
    ctx.beginPath();
    for (let q = 0; q < 6; q++) { const a = (q / 6) * TAU + Math.PI / 6; const px = Math.cos(a) * hs, py = Math.sin(a) * hs * 1.1 - hs * 0.2; if (q === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); }
    ctx.closePath();
    if (cols.length === 1) ctx.fillStyle = cols[0];
    else { const g = ctx.createLinearGradient(-hs, 0, hs, 0); g.addColorStop(0, cols[0]); g.addColorStop(0.499, cols[0]); g.addColorStop(0.501, cols[1]); g.addColorStop(1, cols[1]); ctx.fillStyle = g; }
    ctx.fill(); ctx.shadowBlur = 0; ctx.strokeStyle = '#0b1020'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.strokeStyle = cols[cols.length - 1]; ctx.lineWidth = Math.max(1.2, U * 0.16);
    ctx.beginPath(); ctx.moveTo(0, hs * 0.8); ctx.lineTo(0, hs * 1.6); ctx.moveTo(-hs * 0.5, hs * 0.7); ctx.lineTo(-hs * 0.95, hs * 1.5); ctx.moveTo(hs * 0.5, hs * 0.7); ctx.lineTo(hs * 0.95, hs * 1.5); ctx.stroke();
    ctx.restore();
  }
  private immuneSprite(x: number, y: number, k: number): void {
    const { ctx } = this; const { U } = this.view;
    ctx.shadowColor = '#ef4444'; ctx.shadowBlur = 14;
    const g = ctx.createRadialGradient(x, y, 0, x, y, U * 0.95 * k);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.7, '#fecaca'); g.addColorStop(1, '#f87171');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, U * 0.85 * k, 0, TAU); ctx.fill(); ctx.shadowBlur = 0;
    ctx.fillStyle = '#7f1d1d'; ctx.beginPath(); ctx.arc(x + U * 0.15, y - U * 0.1, U * 0.22 * k, 0, TAU); ctx.fill();
  }

  // ---- in flight (resolve phase) ---------------------------------------------------------
  private drawFlight(s: State): void {
    const { ctx } = this; const { U } = this.view;
    for (const p of s.phages) {
      const [tx, ty] = this.polar(p.r + 3.2, p.angle), [x, y] = this.polar(p.r, p.angle), cols = maskColours(p.mask);
      ctx.strokeStyle = hexA(cols[0], 0.4); ctx.lineWidth = U * 0.28; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(tx, ty); ctx.stroke();
      this.phageSprite(x, y, p.angle, cols, 1);
    }
    for (const m of s.immune) {
      const [tx, ty] = this.polar(m.r + 2.2, m.angle), [x, y] = this.polar(m.r, m.angle);
      ctx.strokeStyle = 'rgba(254,202,202,0.35)'; ctx.lineWidth = U * 0.3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(tx, ty); ctx.stroke();
      this.immuneSprite(x, y, 1);
    }
  }

  // ---- the blob -----------------------------------------------------------------------------
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

  private drawBlob(s: State, hover: Pick | null): void {
    const { ctx } = this; const { cx, cy, U } = this.view;
    const patch = hover ? this.patchOf(s, hover.i, hover.j) : null;
    const tNow = this.time;
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(this.dispTheta); ctx.scale(U, U);
    ctx.globalAlpha = 0.1;
    eachCell(s, (c, i, j) => { ctx.fillStyle = COLOUR_HEX[c.c]; ctx.fillRect(i - 1.1, j - 1.1, 2.2, 2.2); });
    ctx.globalAlpha = 1;
    eachCell(s, (c, i, j) => {
      let born = this.born.get(c);
      if (born === undefined) { born = this.lastS ? tNow : -10; this.born.set(c, born); }
      const sz = 0.35 + 0.65 * Math.min(1, (tNow - born) / 0.4);
      let fl = this.flash.get(c);
      if (!fl) { fl = { c: c.c, t: -10 }; this.flash.set(c, fl); }
      if (fl.c !== c.c) { fl.c = c.c; fl.t = tNow; }
      const flash = Math.max(0, 1 - (tNow - fl.t) / 1.2);
      const shade = ((i * 7 + j * 13 + Math.floor(tNow * 0.5 + ((i * 31 + j * 17) & 7))) & 3);
      if (c.inf > 0) {
        const cols = maskColours(c.ph);
        ctx.fillStyle = Math.sin(tNow * 30 + i + j) > 0 ? cols[0] : cols[cols.length - 1];
        ctx.fillRect(i - 0.5 * sz, j - 0.5 * sz, sz + 0.04, sz + 0.04);
        ctx.fillStyle = `rgba(10,8,20,${0.5 * (1 - c.inf / B.phage.infectTime)})`; ctx.fillRect(i - 0.5 * sz, j - 0.5 * sz, sz + 0.04, sz + 0.04);
        return;
      }
      ctx.fillStyle = SHADES[c.c][shade]; ctx.fillRect(i - 0.5 * sz, j - 0.5 * sz, sz + 0.04, sz + 0.04);
      if (flash > 0) { ctx.fillStyle = `rgba(255,255,255,${0.7 * flash})`; ctx.fillRect(i - 0.5 * sz, j - 0.5 * sz, sz + 0.04, sz + 0.04); }
      if (patch && patch.has(i * 1000 + j)) { ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.fillRect(i - 0.5, j - 0.5, 1.04, 1.04); }
    });
    ctx.lineWidth = 0.16;
    eachCell(s, (c, i, j) => {
      if (c.inf > 0 || !exposed(s, i, j)) return;
      if (c.c === 1) { ctx.strokeStyle = 'rgba(8,47,73,0.8)'; ctx.strokeRect(i - 0.35, j - 0.35, 0.7, 0.7); }
      else if (c.c === 2) { ctx.fillStyle = 'rgba(245,243,255,0.7)'; ctx.fillRect(i - 0.12, j - 0.12, 0.24, 0.24); }
      else { ctx.fillStyle = 'rgba(255,251,235,0.55)'; ctx.fillRect(i - 0.3, j - 0.35, 0.34, 0.2); }
    });
    if (hover) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 0.25; ctx.strokeRect(hover.i - 0.6, hover.j - 0.6, 1.2, 1.2); }
    ctx.restore();
  }

  private drawShield(s: State): void {
    if (s.mucusTurns <= 0) return;
    const { ctx } = this; const { cx, cy, U } = this.view;
    const r = (this.blobRadius(s) + 2.2) * U, pulse = 0.85 + 0.15 * Math.sin(this.time * 3);
    const g = ctx.createRadialGradient(cx, cy, r * 0.7, cx, cy, r * 1.08);
    g.addColorStop(0, 'rgba(253,224,71,0)'); g.addColorStop(0.75, `rgba(253,224,71,${0.12 * pulse})`); g.addColorStop(1, `rgba(253,224,71,${0.45 * pulse})`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r * 1.08, 0, TAU); ctx.fill();
    ctx.strokeStyle = `rgba(254,240,138,${0.8 * pulse})`; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.stroke();
    for (let k = 0; k < 14; k++) { const a = (k / 14) * TAU + this.time * 0.4, rr = r + Math.sin(this.time * 2 + k) * U * 0.1; ctx.fillStyle = `rgba(254,240,138,${0.5 * pulse})`; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, U * 0.22, 0, TAU); ctx.fill(); }
  }

  // ---- events -> effects -------------------------------------------------------------------------
  private drainEvents(s: State): void {
    if (!s.events) { s.events = []; return; }
    for (const e of s.events) {
      const [x, y] = e.kind === 'skip' || e.kind === 'perfect' ? [this.view.cx, this.view.cy] : e.kind === 'cool' ? [this.view.cx + e.x * this.view.U, this.view.cy + e.y * this.view.U] : this.toScreen(e.x, e.y, s.theta);
      const cols = e.mask ? maskColours(e.mask) : e.c !== undefined ? [COLOUR_HEX[e.c]] : ['#94a3b8'];
      const t0 = this.time, add = (ef: Effect) => { if (this.effects.length < 700) this.effects.push(ef); };
      if (e.kind === 'infect') add({ x, y, t0, life: 0.6, kind: 'pulse', colours: cols });
      else if (e.kind === 'deflect') add({ x, y, t0, life: 0.4, kind: 'spark', colours: cols });
      else if (e.kind === 'mucus') add({ x, y, t0, life: 0.45, kind: 'spark', colours: ['#fde047'] });
      else if (e.kind === 'lysis') add({ x, y, t0, life: 0.55, kind: 'pix', colours: e.mask ? cols : ['#e2e8f0'] });
      else if (e.kind === 'abx') add({ x, y, t0, life: 0.5, kind: 'pix', colours: ['#fde047'] });
      else if (e.kind === 'immune') add({ x, y, t0, life: 0.45, kind: 'pix', colours: ['#fecaca'] });
      else if (e.kind === 'evade') add({ x, y, t0, life: 0.5, kind: 'pulse', colours: ['#c4b5fd'] });
      else if (e.kind === 'cool') add({ x, y, t0, life: 0.9, kind: 'cool', colours: ['#fde047'] });
      else if (e.kind === 'perfect') add({ x, y, t0, life: 1.0, kind: 'ring', colours: ['#4ade80'] });
      else if (e.kind === 'skip') add({ x, y, t0, life: 0.9, kind: 'ring', colours: ['#fde047'] });
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
      else if (e.kind === 'cool') { ctx.beginPath(); ctx.arc(e.x, e.y, U * (1 + 5 * f), 0, TAU); ctx.lineWidth = 4 * (1 - f) + 1; ctx.stroke(); }
      else if (e.kind === 'pulse') { ctx.beginPath(); ctx.arc(e.x, e.y, U * (1 + 2.2 * f), 0, TAU); ctx.stroke(); }
      else if (e.kind === 'spark') { for (let k = 0; k < 7; k++) { const a = (k / 7) * TAU + 0.5, d = U * (0.6 + 1.8 * f); ctx.beginPath(); ctx.moveTo(e.x + Math.cos(a) * d * 0.5, e.y + Math.sin(a) * d * 0.5); ctx.lineTo(e.x + Math.cos(a) * d, e.y + Math.sin(a) * d); ctx.stroke(); } }
      else if (e.kind === 'pix') { for (let k = 0; k < 4; k++) { const a = (k / 4) * TAU + e.x * 0.37, d = U * (0.3 + 1.4 * f); ctx.fillStyle = hexA(k % 2 ? col : col2, 0.9 * (1 - f)); ctx.fillRect(e.x + Math.cos(a) * d - U * 0.25, e.y + Math.sin(a) * d - U * 0.25, U * 0.5 * (1 - f), U * 0.5 * (1 - f)); } }
    }
  }
}
void wrap;
