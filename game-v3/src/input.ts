import { angDiff, TAU } from './engine/geometry';
import { setRotation } from './engine/sim';
import type { State } from './engine/types';
import type { Renderer } from './render/draw';

/**
 * Heavy-ring controls: drag a ring around (it follows with momentum), scroll to step it one slot,
 * or select a ring with Up/Down and rotate it with Left/Right (or A/D).
 */
export class Input {
  selected: number | null = null;
  pointer = { x: -1, y: -1, inside: false };
  slow = false;
  private drag: { ring: number; last: number; target: number } | null = null;
  private targets: (number | null)[] = [];
  private dir = 0;
  onMeal: (i: number) => void = () => {};
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
  }

  bind(getState: () => State | null): void { this.getState = getState; }

  get dragging(): boolean { return !!this.drag; }

  private rel(e: PointerEvent | WheelEvent): [number, number] {
    const r = this.canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  private angleOf(x: number, y: number): number {
    const { cx, cy } = this.renderer.view;
    return Math.atan2(y - cy, x - cx);
  }

  private down(e: PointerEvent): void {
    const s = this.getState();
    if (!s || s.status !== 'run') return;
    const [x, y] = this.rel(e);
    const ring = this.renderer.ringAt(s, x, y);
    if (ring === null) return;
    this.selected = ring;
    this.drag = { ring, last: this.angleOf(x, y), target: s.rings[ring].off };
    this.targets[ring] = null;
    this.canvas.setPointerCapture(e.pointerId);
    this.canvas.classList.add('dragging');
  }

  private move(e: PointerEvent): void {
    const [x, y] = this.rel(e);
    this.pointer = { x, y, inside: true };
    if (!this.drag) return;
    const a = this.angleOf(x, y);
    this.drag.target += angDiff(this.drag.last, a);
    this.drag.last = a;
  }

  private up(): void {
    // let the heavy ring finish travelling to where it was dragged
    if (this.drag) this.targets[this.drag.ring] = this.drag.target;
    this.drag = null;
    this.canvas.classList.remove('dragging');
  }

  private wheel(e: WheelEvent): void {
    const s = this.getState();
    if (!s || s.status !== 'run') return;
    e.preventDefault();
    const [x, y] = this.rel(e);
    const k = this.renderer.ringAt(s, x, y) ?? this.selected;
    if (k === null || k === undefined || k < 1) return;
    this.selected = k;
    const r = s.rings[k];
    this.targets[k] = (this.targets[k] ?? r.off) + Math.sign(e.deltaY) * (TAU / r.n);
  }

  private key(e: KeyboardEvent, down: boolean): void {
    const s = this.getState();
    if (e.code === 'Space') { this.slow = down; if (down) e.preventDefault(); return; }
    if (!down) {
      if (['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD'].includes(e.code)) this.dir = 0;
      return;
    }
    if (e.code === 'Enter' && (!s || s.status !== 'run')) { this.onStart(); return; }
    if (!s || s.status !== 'run') return;
    const rim = s.rings.length - 1;
    if (s.offer && (e.code === 'Digit1' || e.code === 'Digit2')) { this.onMeal(e.code === 'Digit1' ? 0 : 1); return; }
    if (e.code === 'ArrowUp' || e.code === 'KeyW') this.selected = Math.min(rim, (this.selected ?? rim - 1) + 1);
    else if (e.code === 'ArrowDown' || e.code === 'KeyS') this.selected = Math.max(1, (this.selected ?? rim + 1) - 1);
    else if (e.code === 'ArrowLeft' || e.code === 'KeyA') { this.dir = -1; if (this.selected === null) this.selected = rim; }
    else if (e.code === 'ArrowRight' || e.code === 'KeyD') { this.dir = 1; if (this.selected === null) this.selected = rim; }
    else return;
    e.preventDefault();
  }

  /** Called every frame before stepping: turns pointer/keys into ring torque. */
  apply(s: State): void {
    s.rings.forEach((r, k) => {
      if (k === 0) return;
      if (this.drag && this.drag.ring === k) {
        setRotation(s, k, clamp(angDiff(r.off, this.drag.target) * 4 - r.omega * 0.9));
      } else if (this.dir !== 0 && this.selected === k) {
        this.targets[k] = null;
        setRotation(s, k, this.dir);
      } else if (this.targets[k] != null) {
        const err = angDiff(r.off, this.targets[k]!);
        setRotation(s, k, clamp(err * 4 - r.omega * 0.9));
        if (Math.abs(err) < 0.03 && Math.abs(r.omega) < 0.2) this.targets[k] = null;
      } else {
        setRotation(s, k, 0);
      }
    });
  }

  reset(): void { this.drag = null; this.targets = []; this.dir = 0; this.selected = null; }
}

const clamp = (v: number) => Math.max(-1, Math.min(1, v));
