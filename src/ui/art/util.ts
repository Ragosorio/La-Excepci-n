// Shared helpers for the procedural 2D art modules (portraits, icons, relics, face atlas).
// Pure functions only: deterministic RNG from string seeds, color math, SVG id + number helpers.

// ---------------------------------------------------------------------------
// Deterministic RNG
// ---------------------------------------------------------------------------

/** FNV-1a 32-bit hash with a final avalanche step. */
export function hashString(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 2246822507);
  h ^= h >>> 13;
  h = Math.imul(h, 3266489909);
  h ^= h >>> 16;
  return h >>> 0;
}

/** mulberry32 PRNG → floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Rng {
  next(): number;
  range(min: number, max: number): number;
  /** Inclusive integer range. */
  int(min: number, max: number): number;
  pick<T>(arr: readonly T[]): T;
  chance(p: number): boolean;
  /** Independent sub-stream: adding draws to one feature never shifts another. */
  fork(label: string): Rng;
}

export function makeRng(seed: string | number): Rng {
  const base = typeof seed === 'number' ? seed >>> 0 : hashString(seed);
  const r = mulberry32(base);
  return {
    next: r,
    range: (a, b) => a + (b - a) * r(),
    int: (a, b) => a + Math.floor(r() * (b - a + 1)),
    pick: <T>(arr: readonly T[]): T => arr[Math.floor(r() * arr.length) % Math.max(1, arr.length)] as T,
    chance: (p) => r() < p,
    fork: (label) => makeRng((base ^ hashString(label)) >>> 0),
  };
}

// ---------------------------------------------------------------------------
// Unique ids (gradients / clipPaths / filters) — one prefix per generated SVG
// ---------------------------------------------------------------------------

let uidCounter = 0;
const uidSession = Math.floor(Math.random() * 46655).toString(36);

export function uid(tag: string): string {
  uidCounter = (uidCounter + 1) % 2147483647;
  return `${tag}${uidSession}${uidCounter.toString(36)}`;
}

// ---------------------------------------------------------------------------
// Numbers / geometry
// ---------------------------------------------------------------------------

/** Round to 1 decimal for compact path data. */
export function n(v: number): string {
  const r = Math.round(v * 10) / 10;
  return Object.is(r, -0) ? '0' : String(r);
}

/** Round to 2 decimals (for small viewBoxes such as 24×24 icons). */
export function n2(v: number): string {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? '0' : String(r);
}

export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export interface Pt {
  x: number;
  y: number;
}

/** Point on a circle, angle in degrees (0 = right, 90 = down). */
export function polar(cx: number, cy: number, r: number, deg: number): Pt {
  const a = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

/** Regular star / polygon points string. */
export function starPoints(cx: number, cy: number, rOuter: number, rInner: number, points: number, rotDeg = -90): string {
  const out: string[] = [];
  const total = points * 2;
  for (let i = 0; i < total; i++) {
    const r = i % 2 === 0 ? rOuter : rInner;
    const p = polar(cx, cy, r, rotDeg + (i * 360) / total);
    out.push(`${n(p.x)},${n(p.y)}`);
  }
  return out.join(' ');
}

/** Split a cubic bezier at t, returning the first part's control points (for partial strokes). */
export function cubicHead(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): [Pt, Pt, Pt, Pt] {
  const L = (a: Pt, b: Pt): Pt => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });
  const a = L(p0, p1);
  const b = L(p1, p2);
  const c = L(p2, p3);
  const d = L(a, b);
  const e = L(b, c);
  const f = L(d, e);
  return [p0, a, d, f];
}

/** Split a cubic bezier at t into [head, tail] control point sets. */
export function cubicSplit(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): [[Pt, Pt, Pt, Pt], [Pt, Pt, Pt, Pt]] {
  const L = (a: Pt, b: Pt): Pt => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });
  const a = L(p0, p1);
  const b = L(p1, p2);
  const c = L(p2, p3);
  const d = L(a, b);
  const e = L(b, c);
  const f = L(d, e);
  return [
    [p0, a, d, f],
    [f, e, c, p3],
  ];
}

export function cubicPoint(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt {
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
  };
}

// ---------------------------------------------------------------------------
// Color math
// ---------------------------------------------------------------------------

export function hexToRgb(hex: string): [number, number, number] {
  let h = hex.trim().replace('#', '');
  if (h.length === 3 || h.length === 4) h = h.slice(0, 3).split('').map((c) => c + c).join('');
  const v = parseInt(h.slice(0, 6), 16);
  if (Number.isNaN(v)) return [128, 128, 128];
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

export function mix(a: string, b: string, t: number): string {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return rgbToHex(lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t));
}

export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return [h, s, l];
}

export function hslToHex(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360;
  s = clamp(s, 0, 1);
  l = clamp(l, 0, 1);
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

export function toHsl(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHsl(r, g, b);
}

function hueToward(h: number, target: number, maxDeg: number): number {
  let d = ((target - h + 540) % 360) - 180;
  if (Math.abs(d) > maxDeg) d = Math.sign(d) * maxDeg;
  return h + d;
}

/** Anime cel shadow: darker, a bit more saturated, hue drifting toward violet. */
export function shadowOf(hex: string, amt = 0.16): string {
  const [h, s, l] = toHsl(hex);
  const nh = s < 0.06 ? 265 : hueToward(h, 268, 16);
  const ns = s < 0.06 ? 0.1 : Math.min(1, s * 1.08 + 0.04);
  return hslToHex(nh, ns, Math.max(0.03, l - amt));
}

/** Cel shadow by mixing toward a deep violet-brown (keeps hues natural: blond → tan, skin → rose). */
export function deepShade(hex: string, t = 0.28): string {
  return luminance(hex) < 0.22 ? mix(hex, '#05030a', t * 1.1) : mix(hex, '#2a1830', t);
}

/** Warm light: lighter, hue drifting toward gold. */
export function lightOf(hex: string, amt = 0.14): string {
  const [h, s, l] = toHsl(hex);
  const nh = s < 0.06 ? h : hueToward(h, 50, 8);
  return hslToHex(nh, s, Math.min(0.97, l + amt));
}

/** Outline color for a fill: very dark, tinted. */
export function lineOf(hex: string): string {
  const [h, s, l] = toHsl(hex);
  const nh = s < 0.06 ? 280 : hueToward(h, 300, 30);
  return hslToHex(nh, Math.min(0.55, s * 0.6 + 0.15), Math.min(0.2, l * 0.25 + 0.05));
}

export function withLightness(hex: string, l: number): string {
  const [h, s] = toHsl(hex);
  return hslToHex(h, s, l);
}

export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

// ---------------------------------------------------------------------------
// SVG helpers
// ---------------------------------------------------------------------------

export function svgOpen(size: number | string, vbW: number, vbH: number, extra = ''): string {
  const w = typeof size === 'number' ? n(size) : size;
  const h = typeof size === 'number' ? n((size * vbH) / vbW) : size;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vbW} ${vbH}" width="${w}" height="${h}"${extra}>`;
}

export function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Linear gradient def (vertical by default). stops: [offset 0..1, color, opacity?] */
export function linGrad(id: string, stops: Array<[number, string, number?]>, x1 = 0, y1 = 0, x2 = 0, y2 = 1, extra = ''): string {
  const s = stops
    .map(([o, c, a]) => `<stop offset="${n2(o)}" stop-color="${c}"${a !== undefined && a < 1 ? ` stop-opacity="${n2(a)}"` : ''}/>`)
    .join('');
  return `<linearGradient id="${id}" x1="${n2(x1)}" y1="${n2(y1)}" x2="${n2(x2)}" y2="${n2(y2)}"${extra}>${s}</linearGradient>`;
}

export function radGrad(id: string, stops: Array<[number, string, number?]>, cx = 0.5, cy = 0.5, r = 0.5, extra = ''): string {
  const s = stops
    .map(([o, c, a]) => `<stop offset="${n2(o)}" stop-color="${c}"${a !== undefined && a < 1 ? ` stop-opacity="${n2(a)}"` : ''}/>`)
    .join('');
  return `<radialGradient id="${id}" cx="${n2(cx)}" cy="${n2(cy)}" r="${n2(r)}"${extra}>${s}</radialGradient>`;
}
