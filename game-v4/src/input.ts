import { angDiff, TAU } from './engine/geometry';
import { secrete, setRotation } from './engine/sim';
import type { State } from './engine/types';
import type { Renderer } from './render/draw';

/** Controls: drag anywhere to turn the heavy blob, scroll to nudge it, A/D or arrows to push, Space to secrete, hold Shift for slow-mo. */
export class Input {
  pointer = { x: -1, y: -1, inside: false };
  slow = false;
  private drag: { last: number; target: number } | null = null;
  private target: number | null = null;
  private dir = 0;
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
    const slow = document.getElementById('slow');
    slow?.addEventListener('pointerdown', () => { this.slow = true; });
    addEventListener('pointerup', () => { if (slow) this.slow = false; });
    document.getElementById('secrete')?.addEventListener('click', () => { const s = this.getState(); if (s) secrete(s); });
  }

  bind(getState: () => State | null): void { this.getState = getState; }
  get dragging(): boolean { return !!this.drag; }

  private rel(e: PointerEvent | WheelEvent): [number, number] {
    const r = this.canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  private down(e: PointerEvent): void {
    const s = this.getState();
    if (!s || s.status !== 'run') return;
    const [x, y] = this.rel(e);
    this.drag = { last: this.renderer.angleOf(x, y), target: s.theta };
    this.target = null;
    this.canvas.setPointerCapture(e.pointerId);
    this.canvas.classList.add('dragging');
  }

  private move(e: PointerEvent): void {
    const [x, y] = this.rel(e);
    this.pointer = { x, y, inside: true };
    if (!this.drag) return;
    const a = this.renderer.angleOf(x, y);
    this.drag.target += angDiff(this.drag.last, a);
    this.drag.last = a;
  }

  private up(): void {
    if (this.drag) this.target = this.drag.target; // the heavy blob finishes the turn you started
    this.drag = null;
    this.canvas.classList.remove('dragging');
  }

  private wheel(e: WheelEvent): void {
    const s = this.getState();
    if (!s || s.status !== 'run') return;
    e.preventDefault();
    this.target = (this.target ?? s.theta) + Math.sign(e.deltaY) * (TAU / 16);
  }

  private key(e: KeyboardEvent, down: boolean): void {
    const s = this.getState();
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') { this.slow = down; return; }
    if (!down) { if (['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD'].includes(e.code)) this.dir = 0; return; }
    if (e.code === 'Enter' && (!s || s.status !== 'run')) { this.onStart(); return; }
    if (!s || s.status !== 'run') return;
    if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) secrete(s); return; }
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') this.dir = -1;
    else if (e.code === 'ArrowRight' || e.code === 'KeyD') this.dir = 1;
    else return;
    e.preventDefault();
  }

  apply(s: State): void {
    if (this.drag) setRotation(s, clamp(angDiff(s.theta, this.drag.target) * 4 - s.omega * 0.9));
    else if (this.dir !== 0) { this.target = null; setRotation(s, this.dir); }
    else if (this.target !== null) {
      const err = angDiff(s.theta, this.target);
      setRotation(s, clamp(err * 4 - s.omega * 0.9));
      if (Math.abs(err) < 0.02 && Math.abs(s.omega) < 0.1) this.target = null;
    } else setRotation(s, 0);
  }

  reset(): void { this.drag = null; this.target = null; this.dir = 0; }
}

const clamp = (v: number) => Math.max(-1, Math.min(1, v));
