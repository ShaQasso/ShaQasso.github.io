import { angDiff, TAU, wrap } from './engine/geometry';
import { release, skipTurn } from './engine/sim';
import type { State } from './engine/types';
import type { Renderer } from './render/draw';

/**
 * Plan-phase controls. Drag on the blob to turn it. Click or drag outside the blob to aim the cooling effort.
 * Keys: A/D turn the blob, Q/E move the effort, Enter releases, S skips, hold Space to fast-forward the resolve.
 */
export class Input {
  pointer = { x: -1, y: -1, inside: false };
  fast = false;
  private mode: 'turn' | 'aim' | null = null;
  private grab = { angle: 0, theta: 0 };
  private keys = new Set<string>();
  onStart: () => void = () => {};
  private getState: () => State | null = () => null;

  constructor(private canvas: HTMLCanvasElement, private renderer: Renderer) {
    canvas.addEventListener('pointerdown', (e) => this.down(e));
    canvas.addEventListener('pointermove', (e) => this.move(e));
    canvas.addEventListener('pointerup', () => this.up());
    canvas.addEventListener('pointercancel', () => this.up());
    canvas.addEventListener('pointerleave', () => { this.pointer.inside = false; });
    canvas.addEventListener('wheel', (e) => this.wheel(e), { passive: false });
    addEventListener('keydown', (e) => this.key(e, true));
    addEventListener('keyup', (e) => this.key(e, false));
    document.getElementById('release')?.addEventListener('click', () => { const s = this.getState(); if (s) release(s); });
    document.getElementById('skip')?.addEventListener('click', () => { const s = this.getState(); if (s) skipTurn(s); });
  }

  bind(getState: () => State | null): void { this.getState = getState; }
  get dragging(): boolean { return this.mode !== null; }

  private rel(e: PointerEvent | WheelEvent): [number, number] { const r = this.canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
  private planning(): State | null { const s = this.getState(); return s && s.status === 'run' && s.phase === 'plan' ? s : null; }

  private down(e: PointerEvent): void {
    const s = this.planning(); if (!s) return;
    const [x, y] = this.rel(e);
    const a = this.renderer.angleOf(x, y);
    if (this.renderer.distOf(x, y) > this.renderer.blobRadius(s) + 2.5) { this.mode = 'aim'; s.exert = wrap(a); }
    else { this.mode = 'turn'; this.grab = { angle: a, theta: s.theta }; }
    this.canvas.setPointerCapture(e.pointerId);
    this.canvas.classList.add('dragging');
  }

  private move(e: PointerEvent): void {
    const [x, y] = this.rel(e);
    this.pointer = { x, y, inside: true };
    const s = this.planning(); if (!s || !this.mode) return;
    const a = this.renderer.angleOf(x, y);
    if (this.mode === 'aim') s.exert = wrap(a);
    else s.theta = wrap(this.grab.theta + angDiff(this.grab.angle, a));
  }

  private up(): void { this.mode = null; this.canvas.classList.remove('dragging'); }

  private wheel(e: WheelEvent): void {
    const s = this.planning(); if (!s) return;
    e.preventDefault();
    s.theta = wrap(s.theta + Math.sign(e.deltaY) * (TAU / 48));
  }

  private key(e: KeyboardEvent, down: boolean): void {
    const s = this.getState();
    if (e.code === 'Space') { this.fast = down; if (down) e.preventDefault(); return; }
    if (!down) { this.keys.delete(e.code); return; }
    if (e.code === 'Enter') { if (!s || s.status !== 'run') this.onStart(); else release(s); e.preventDefault(); return; }
    if (!s || s.status !== 'run') return;
    if (e.code === 'KeyS') { skipTurn(s); return; }
    if (['KeyA', 'KeyD', 'ArrowLeft', 'ArrowRight', 'KeyQ', 'KeyE'].includes(e.code)) { this.keys.add(e.code); e.preventDefault(); }
  }

  /** Per frame: held keys turn the blob or move the effort marker. */
  tick(dt: number): void {
    const s = this.planning(); if (!s) return;
    const turn = (this.keys.has('KeyD') || this.keys.has('ArrowRight') ? 1 : 0) - (this.keys.has('KeyA') || this.keys.has('ArrowLeft') ? 1 : 0);
    const aim = (this.keys.has('KeyE') ? 1 : 0) - (this.keys.has('KeyQ') ? 1 : 0);
    if (turn) s.theta = wrap(s.theta + turn * 1.6 * dt);
    if (aim) s.exert = wrap(s.exert + aim * 1.6 * dt);
  }

  reset(): void { this.mode = null; this.keys.clear(); }
}
