/**
 * Portable maths for the simulation.
 *
 * JavaScript lets each browser compute Math.sin, Math.exp and friends slightly differently in the last bits.
 * Over a five-minute run those differences snowball, so a game played in one browser would not replay
 * exactly in another (or on the leaderboard server). These versions use only + - * /, Math.sqrt, Math.floor
 * and Math.round, which every engine computes identically, so the same inputs give the same run everywhere.
 * They agree with Math.* to about 1e-15; only the simulation needs them, drawing can keep using Math.
 */

const LN2_HI = 6.93147180369123816490e-1;
const LN2_LO = 1.90821492927058770002e-10;
const INV_LN2 = 1.44269504088896338700;
const PIO2_HI = 1.57079632673412561417;
const PIO2_LO = 6.07710050650619224932e-11;
const PI = 3.14159265358979311600;
const PIO2 = PI / 2;

const buf = new DataView(new ArrayBuffer(8));
/** Exactly 2^k for integer k in the normal range, built from the bits. */
function pow2(k: number): number {
  if (k > 1023) return Infinity;
  if (k < -1022) return pow2(k + 1022) * pow2(-1022);
  buf.setUint32(0, (k + 1023) << 20); buf.setUint32(4, 0);
  return buf.getFloat64(0);
}

export function exp(x: number): number {
  if (x !== x) return NaN;
  if (x > 709.78) return Infinity;
  if (x < -745) return 0;
  const k = Math.round(x * INV_LN2);
  const r = (x - k * LN2_HI) - k * LN2_LO; // |r| <= ln2/2
  // Taylor series, Horner form; at |r| <= 0.35 the terms past r^17/17! are far below double precision
  let p = 1 / 355687428096000;
  for (let n = 16; n >= 1; n--) p = p * r + 1 / FACT[n];
  return (p * r + 1) * pow2(k);
}
const FACT: number[] = [1];
for (let n = 1; n <= 20; n++) FACT[n] = FACT[n - 1] * n;

export function log(x: number): number {
  if (x !== x || x < 0) return NaN;
  if (x === 0) return -Infinity;
  if (x === Infinity) return Infinity;
  // x = m * 2^e with m in [sqrt(1/2), sqrt(2))
  buf.setFloat64(0, x);
  let e = ((buf.getUint32(0) >>> 20) & 0x7ff) - 1023;
  if (e === -1023) { return log(x * 4503599627370496) - 52 * (LN2_HI + LN2_LO); } // subnormal
  buf.setUint32(0, (buf.getUint32(0) & 0x800fffff) | (1023 << 20));
  let m = buf.getFloat64(0);
  if (m > Math.SQRT2) { m /= 2; e += 1; }
  // log(m) = 2 atanh(f), f = (m-1)/(m+1), |f| <= 0.1716
  const f = (m - 1) / (m + 1), f2 = f * f;
  let s = 0;
  for (let n = 29; n >= 1; n -= 2) s = s * f2 + 1 / n;
  return 2 * f * s + e * LN2_LO + e * LN2_HI;
}

/** x^y for x >= 0 (all the simulation needs). */
export function pow(x: number, y: number): number {
  if (y === 0) return 1;
  if (x === 0) return y > 0 ? 0 : Infinity;
  if (x < 0) return NaN;
  if (y === 1) return x;
  return exp(y * log(x));
}

/** sin and cos of |r| <= pi/4, Taylor in Horner form. */
function sinSeries(r: number, r2: number): number { let p = 0; for (let n = 19; n >= 3; n -= 2) p = ((n - 1) / 2) % 2 === 1 ? p * r2 - 1 / FACT[n] : p * r2 + 1 / FACT[n]; return r + r * r2 * p; }
function cosK(r: number): number { const r2 = r * r; let p = 0; for (let n = 20; n >= 2; n -= 2) p = (n / 2) % 2 === 1 ? p * r2 - 1 / FACT[n] : p * r2 + 1 / FACT[n]; return 1 + r2 * p; }

function reduce(x: number): [number, number] {
  const k = Math.round(x / PIO2);
  return [(x - k * PIO2_HI) - k * PIO2_LO, ((k % 4) + 4) % 4];
}
export function sin(x: number): number {
  if (!isFinite(x)) return NaN;
  const [r, q] = reduce(x);
  return q === 0 ? sinSeries(r, r * r) : q === 1 ? cosK(r) : q === 2 ? -sinSeries(r, r * r) : -cosK(r);
}
export function cos(x: number): number {
  if (!isFinite(x)) return NaN;
  const [r, q] = reduce(x);
  return q === 0 ? cosK(r) : q === 1 ? -sinSeries(r, r * r) : q === 2 ? -cosK(r) : sinSeries(r, r * r);
}

/** atan of |t| <= 1: halve the angle once (|u| <= 0.415), then a series. */
function atanSmall(t: number): number {
  const u = t / (1 + Math.sqrt(1 + t * t)); // tan(a/2)
  const v = u / (1 + Math.sqrt(1 + u * u)); // tan(a/4), |v| <= 0.1
  const v2 = v * v;
  let s = 0;
  for (let n = 31; n >= 1; n -= 2) s = s * -v2 + 1 / n;
  // atan(v) = v - v^3/3 + v^5/5 - ...; two half-angle steps above, so the angle is 4 atan(v)
  return 4 * v * s;
}
export function atan(t: number): number {
  if (t !== t) return NaN;
  if (t > 1) return PIO2 - atanSmall(1 / t);
  if (t < -1) return -PIO2 - atanSmall(1 / t);
  return atanSmall(t);
}
export function atan2(y: number, x: number): number {
  if (y !== y || x !== x) return NaN;
  if (x === 0 && y === 0) return 0;
  if (x > 0) return atan(y / x);
  if (x < 0) return y >= 0 ? atan(y / x) + PI : atan(y / x) - PI;
  return y > 0 ? PIO2 : -PIO2;
}

export const hypot = (x: number, y: number): number => Math.sqrt(x * x + y * y);
