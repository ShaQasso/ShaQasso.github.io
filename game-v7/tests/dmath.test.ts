import { describe, expect, it } from 'vitest';
import { atan2, cos, exp, hypot, log, pow, sin } from '../src/engine/dmath';

const close = (a: number, b: number, rel = 1e-14) => Math.abs(a - b) <= rel * Math.max(1, Math.abs(b));

describe('portable maths agrees with Math.*', () => {
  const xs: number[] = []; let r = 12345;
  for (let k = 0; k < 4000; k++) { r = (r * 1103515245 + 12345) % 2147483648; xs.push((r / 2147483648) * 40 - 20); }
  it('sin and cos', () => { for (const x of xs) { expect(close(sin(x), Math.sin(x))).toBe(true); expect(close(cos(x), Math.cos(x))).toBe(true); } });
  it('exp and log', () => {
    for (const x of xs) expect(close(exp(x), Math.exp(x), 2e-15)).toBe(true);
    for (const x of xs) { const v = Math.abs(x) * 7 + 1e-6; expect(close(log(v), Math.log(v))).toBe(true); }
  });
  it('pow, atan2 and hypot', () => {
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const a = Math.abs(xs[k]) / 4, b = xs[k + 1] / 5;
      expect(close(pow(a, b), Math.pow(a, b), 1e-13)).toBe(true);
      expect(close(atan2(xs[k], xs[k + 1]), Math.atan2(xs[k], xs[k + 1]))).toBe(true);
      expect(close(hypot(xs[k], xs[k + 1]), Math.hypot(xs[k], xs[k + 1]))).toBe(true);
    }
    for (const [y, x] of [[0, 1], [1, 0], [0, -1], [-1, 0], [1, 1], [-1, -1], [1e-9, -1], [-1e-9, -1]]) expect(close(atan2(y, x), Math.atan2(y, x))).toBe(true);
    expect(pow(0, 2)).toBe(0); expect(pow(5, 0)).toBe(1); expect(close(pow(0.3, 1 / 3), Math.cbrt(0.3))).toBe(true);
  });
});
