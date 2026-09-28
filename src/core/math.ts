import * as THREE from 'three';

export const clamp = (v: number, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const invLerp = (a: number, b: number, v: number) => (a === b ? 0 : (v - a) / (b - a));
export const remap = (v: number, a: number, b: number, c: number, d: number) => lerp(c, d, clamp(invLerp(a, b, v)));
/** Frame-rate independent exponential smoothing. k ~ 5..20 */
export const damp = (a: number, b: number, k: number, dt: number) => lerp(a, b, 1 - Math.exp(-k * dt));
export const smoothstep = (a: number, b: number, v: number) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
export const easeInCubic = (t: number) => t * t * t;
export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOutBack = (t: number) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
export const easeOutElastic = (t: number) => (t === 0 || t === 1 ? t : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1);
export const TAU = Math.PI * 2;

export function angleLerp(a: number, b: number, t: number): number {
  let d = ((b - a + Math.PI) % TAU) - Math.PI;
  if (d < -Math.PI) d += TAU;
  return a + d * t;
}
export function dampAngle(a: number, b: number, k: number, dt: number): number { return angleLerp(a, b, 1 - Math.exp(-k * dt)); }

export function dampVec3(out: THREE.Vector3, target: THREE.Vector3, k: number, dt: number): THREE.Vector3 {
  const t = 1 - Math.exp(-k * dt);
  out.x += (target.x - out.x) * t; out.y += (target.y - out.y) * t; out.z += (target.z - out.z) * t;
  return out;
}

/** Critically damped spring (numbers). Returns new [value, velocity]. */
export function spring(value: number, velocity: number, target: number, omega: number, dt: number): [number, number] {
  const x = omega * dt;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = value - target;
  const temp = (velocity + omega * change) * dt;
  const v = (velocity - omega * temp) * exp;
  return [target + (change + temp) * exp, v];
}

/** Human-friendly number formatting in Spanish (1.234 / 12,4 mil / 3,1 M). */
export function fmt(n: number, decimals = 0): string {
  const abs = Math.abs(n);
  if (abs >= 1e9) return (n / 1e9).toFixed(1).replace('.', ',') + ' MM';
  if (abs >= 1e6) return (n / 1e6).toFixed(1).replace('.', ',') + ' M';
  if (abs >= 1e5) return Math.round(n / 1e3) + ' mil';
  return n.toLocaleString('es-ES', { maximumFractionDigits: decimals, minimumFractionDigits: 0 });
}
export const pct = (v: number) => Math.round(v * 100) + '%';

export const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const tmpV = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];

/** Moon phase glyph for a fractional luna phase 0..1. */
export function moonGlyph(phase: number): string {
  const g = ['🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌗', '🌘'];
  return g[Math.floor((((phase % 1) + 1) % 1) * 8) % 8];
}
