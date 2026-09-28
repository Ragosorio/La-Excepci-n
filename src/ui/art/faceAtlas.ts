// Chibi anime face atlas for the 3D TABS-style units (heads are spheres; faces are decals).
// Transparent canvas, one cell per (expression × eye variant). Only eyes + brows + mouth (+ blush / fx).
//
// Layout: cols = FACE_EXPRS.length (one column per expression), rows = variants (eye styles).
// uv(index) returns Three.js texture coordinates (origin bottom-left, i.e. CanvasTexture with
// the default flipY = true): use them directly as `texture.offset.set(u, v)` +
// `texture.repeat.set(w, h)`, or remap a decal's UVs into [u, u+w] × [v, v+h].

export type FaceExpr = 'neutral' | 'angry' | 'scared' | 'hurt' | 'dead' | 'mind' | 'happy' | 'sleep' | 'determined' | 'eating';

export const FACE_EXPRS: FaceExpr[] = ['neutral', 'angry', 'scared', 'hurt', 'dead', 'mind', 'happy', 'sleep', 'determined', 'eating'];

export interface FaceAtlas {
  canvas: HTMLCanvasElement;
  cols: number;
  rows: number;
  variants: number;
  cell: number;
  index(expr: FaceExpr, variant?: number): number;
  uv(index: number): { u: number; v: number; w: number; h: number };
}

/** Eye styles, one per atlas row. */
export const FACE_VARIANTS = ['round', 'sharp', 'sleepy', 'fierce'] as const;
type Variant = (typeof FACE_VARIANTS)[number];

const INK = '#1b0f1f';
const IRIS_TOP = '#241536';
const IRIS_MID = '#4a3a8a';
const IRIS_LOW = '#8fb4ff';
const WHITE = '#fffaf2';
const BLUSH = 'rgba(255,120,140,0.55)';
const MOUTH = '#6a1f30';
const TONGUE = '#e8727f';
const MIND = '#b25cff';

interface Pen {
  ctx: CanvasRenderingContext2D;
  k: number; // scale (cell / 128)
}

function eyeOutline(p: Pen, x: number, y: number, d: number, v: Variant, lid: number, lower: number): Path2D {
  // d: +1 right eye (outer corner to the right), -1 left eye
  const { k } = p;
  const w = (v === 'sharp' ? 23 : v === 'fierce' ? 22 : 24) * k;
  const h = (v === 'round' ? 29 : v === 'sleepy' ? 24 : v === 'sharp' ? 24 : 21) * k;
  const tilt = (v === 'sharp' ? -5 : v === 'fierce' ? -3 : v === 'sleepy' ? 2 : 0) * k;
  const I = { x: x - d * w * 0.5, y: y + h * 0.05 };
  const O = { x: x + d * w * 0.5, y: y + tilt };
  const top = y - h * 0.62 * lid;
  const bot = y + h * 0.5 * lower;
  const path = new Path2D();
  path.moveTo(I.x, I.y);
  path.bezierCurveTo(I.x + d * w * 0.05, top, O.x - d * w * 0.1, top + (v === 'fierce' ? 3 * k : 0), O.x, O.y);
  path.bezierCurveTo(O.x, bot, I.x, bot, I.x, I.y);
  path.closePath();
  return path;
}

function drawOpenEye(p: Pen, x: number, y: number, d: number, v: Variant, o: { lid?: number; lower?: number; iris?: number; pupil?: number; mind?: boolean; slant?: number; glint?: boolean }): void {
  const { ctx, k } = p;
  const lid = o.lid ?? (v === 'sleepy' ? 0.62 : 1);
  const lower = o.lower ?? 1;
  const shape = eyeOutline(p, x, y, d, v, lid, lower);
  ctx.save();
  ctx.fillStyle = WHITE;
  ctx.fill(shape);
  ctx.clip(shape);
  const irisS = o.iris ?? (v === 'fierce' ? 0.78 : 1);
  const rx = 9.5 * k * irisS;
  const ry = 13 * k * irisS;
  const ix = x + d * 0.8 * k;
  const iy = y + 2 * k;
  if (o.mind) {
    const gg = ctx.createRadialGradient(ix, iy, 1, ix, iy, ry * 1.3);
    gg.addColorStop(0, '#ffd6ff');
    gg.addColorStop(0.45, MIND);
    gg.addColorStop(1, '#3a0a6a');
    ctx.fillStyle = gg;
    ctx.beginPath();
    ctx.ellipse(ix, iy, rx * 1.15, ry * 1.1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffe6ff';
    ctx.lineWidth = 2 * k;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i <= 60; i++) {
      const t = i / 60;
      const a = d * t * Math.PI * 6;
      const r = t * rx * 1.05;
      const px = ix + Math.cos(a) * r;
      const py = iy + Math.sin(a) * r * 1.2;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  } else {
    const g = ctx.createLinearGradient(0, iy - ry, 0, iy + ry);
    g.addColorStop(0, IRIS_TOP);
    g.addColorStop(0.55, IRIS_MID);
    g.addColorStop(1, IRIS_LOW);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(ix, iy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0c0614';
    const ps = o.pupil ?? 1;
    ctx.beginPath();
    ctx.ellipse(ix, iy + 1.5 * k, rx * 0.5 * ps, ry * 0.5 * ps, 0, 0, Math.PI * 2);
    ctx.fill();
    // lid shadow
    ctx.fillStyle = 'rgba(40,20,60,0.35)';
    ctx.beginPath();
    ctx.ellipse(x, y - 13 * k * lid, 16 * k, 8 * k, 0, 0, Math.PI * 2);
    ctx.fill();
    // highlights
    ctx.fillStyle = '#ffffff';
    const hs = (o.iris ?? 1) < 0.7 ? 0.5 : 1;
    ctx.beginPath();
    ctx.ellipse(ix - rx * 0.35, iy - ry * 0.4, 3.6 * k * hs, 4.6 * k * hs, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ix + rx * 0.38, iy + ry * 0.38, 1.8 * k * hs, 0, Math.PI * 2);
    ctx.fill();
    if (o.glint) {
      ctx.beginPath();
      ctx.arc(ix + rx * 0.1, iy - ry * 0.05, 1.2 * k, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
  // outline + thick upper lash
  ctx.strokeStyle = INK;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.lineWidth = 2 * k;
  ctx.stroke(shape);
  const w = (v === 'sharp' ? 23 : v === 'fierce' ? 22 : 24) * k;
  const h = (v === 'round' ? 29 : v === 'sleepy' ? 24 : v === 'sharp' ? 24 : 21) * k;
  const tilt = (v === 'sharp' ? -5 : v === 'fierce' ? -3 : v === 'sleepy' ? 2 : 0) * k;
  const top = y - h * 0.62 * lid;
  ctx.lineWidth = 4.6 * k;
  ctx.beginPath();
  ctx.moveTo(x - d * w * 0.5, y + h * 0.05);
  ctx.bezierCurveTo(x - d * w * 0.45, top, x + d * w * 0.4, top + (v === 'fierce' ? 3 * k : 0), x + d * w * 0.5, y + tilt);
  ctx.lineTo(x + d * w * 0.72, y + tilt + (v === 'sharp' ? -2 : 1) * k);
  ctx.stroke();
  if (o.slant) {
    // angry lid: a straight cut descending toward the nose
    ctx.fillStyle = 'rgba(0,0,0,0)';
  }
}

function brow(p: Pen, x: number, y: number, d: number, inner: number, outer: number, thick = 3.2): void {
  const { ctx, k } = p;
  ctx.strokeStyle = INK;
  ctx.lineCap = 'round';
  ctx.lineWidth = thick * k;
  ctx.beginPath();
  const ix = x - d * 9 * k;
  const ox = x + d * 11 * k;
  ctx.moveTo(ix, y + inner * k);
  ctx.quadraticCurveTo((ix + ox) / 2, y + (Math.min(inner, outer) - 3) * k, ox, y + outer * k);
  ctx.stroke();
}

function arcEye(p: Pen, x: number, y: number, up: boolean, width = 22): void {
  const { ctx, k } = p;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 4 * k;
  ctx.lineCap = 'round';
  ctx.beginPath();
  const w = width * k;
  if (up) {
    ctx.moveTo(x - w / 2, y + 4 * k);
    ctx.quadraticCurveTo(x, y - 12 * k, x + w / 2, y + 4 * k);
  } else {
    ctx.moveTo(x - w / 2, y - 2 * k);
    ctx.quadraticCurveTo(x, y + 9 * k, x + w / 2, y - 2 * k);
  }
  ctx.stroke();
}

function blush(p: Pen, cx: number, y: number, strong = false): void {
  const { ctx, k } = p;
  for (const d of [-1, 1]) {
    const x = cx + d * 34 * k;
    const g = ctx.createRadialGradient(x, y, 1, x, y, 12 * k);
    g.addColorStop(0, BLUSH);
    g.addColorStop(1, 'rgba(255,120,140,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y, 13 * k, 7 * k, 0, 0, Math.PI * 2);
    ctx.fill();
    if (strong) {
      ctx.strokeStyle = 'rgba(214,70,100,0.7)';
      ctx.lineWidth = 1.4 * k;
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(x + i * 4 * k + 2 * k, y - 3 * k);
        ctx.lineTo(x + i * 4 * k - 1 * k, y + 3 * k);
        ctx.stroke();
      }
    }
  }
}

function sweat(p: Pen, x: number, y: number): void {
  const { ctx, k } = p;
  ctx.fillStyle = '#b8ecff';
  ctx.strokeStyle = '#2f6a9a';
  ctx.lineWidth = 1.4 * k;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x - 6 * k, y + 9 * k, x - 5 * k, y + 12 * k);
  ctx.arc(x, y + 12 * k, 5 * k, Math.PI, 0, true);
  ctx.quadraticCurveTo(x + 6 * k, y + 9 * k, x, y);
  ctx.fill();
  ctx.stroke();
}

function drawCell(ctx: CanvasRenderingContext2D, ox: number, oy: number, cell: number, expr: FaceExpr, v: Variant): void {
  const k = cell / 128;
  const p: Pen = { ctx, k };
  ctx.save();
  ctx.translate(ox, oy);
  const cx = 64 * k;
  const ey = 60 * k;
  const ex = 22 * k;
  const by = ey - 22 * k;
  const my = 92 * k;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const fierce = v === 'fierce';
  const browT = fierce ? 4.4 : 3;
  const browBase = fierce ? 2 : 0;
  switch (expr) {
    case 'neutral': {
      for (const d of [-1, 1]) {
        drawOpenEye(p, cx + d * ex, ey, d, v, {});
        brow(p, cx + d * ex, by, d, browBase + (fierce ? 2 : 0), -1, browT);
      }
      ctx.strokeStyle = INK;
      ctx.lineWidth = 3 * k;
      ctx.beginPath();
      ctx.moveTo(cx - 6 * k, my);
      ctx.quadraticCurveTo(cx, my + 3 * k, cx + 6 * k, my - 0.5 * k);
      ctx.stroke();
      break;
    }
    case 'angry': {
      for (const d of [-1, 1]) {
        drawOpenEye(p, cx + d * ex, ey + 2 * k, d, v, { lid: 0.62, pupil: 0.7, iris: 0.85 });
        // slanted lid line
        ctx.strokeStyle = INK;
        ctx.lineWidth = 4.6 * k;
        ctx.beginPath();
        ctx.moveTo(cx + d * (ex - 13 * k), ey - 4 * k);
        ctx.lineTo(cx + d * (ex + 14 * k), ey - 14 * k);
        ctx.stroke();
        brow(p, cx + d * ex, by, d, 9, -5, browT + 0.8);
      }
      // gritted teeth
      ctx.fillStyle = WHITE;
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2.6 * k;
      ctx.beginPath();
      ctx.moveTo(cx - 13 * k, my + 2 * k);
      ctx.quadraticCurveTo(cx, my - 7 * k, cx + 13 * k, my + 2 * k);
      ctx.lineTo(cx + 11 * k, my + 8 * k);
      ctx.quadraticCurveTo(cx, my + 4 * k, cx - 11 * k, my + 8 * k);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.lineWidth = 1.4 * k;
      ctx.beginPath();
      ctx.moveTo(cx - 12 * k, my + 4.5 * k);
      ctx.quadraticCurveTo(cx, my - 1 * k, cx + 12 * k, my + 4.5 * k);
      for (const t of [-6, 0, 6]) {
        ctx.moveTo(cx + t * k, my - 2 * k);
        ctx.lineTo(cx + t * k, my + 6.5 * k);
      }
      ctx.stroke();
      // anger mark
      ctx.strokeStyle = '#e2455b';
      ctx.lineWidth = 2.4 * k;
      const ax = cx + 44 * k;
      const ay = 24 * k;
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
        ctx.beginPath();
        ctx.moveTo(ax + sx * 7 * k, ay + sy * 2 * k);
        ctx.quadraticCurveTo(ax + sx * 2 * k, ay + sy * 2 * k, ax + sx * 2 * k, ay + sy * 7 * k);
        ctx.stroke();
      }
      break;
    }
    case 'scared': {
      for (const d of [-1, 1]) {
        drawOpenEye(p, cx + d * ex, ey, d, v === 'sleepy' ? 'round' : v, { lid: 1.08, iris: 0.55, pupil: 0.45 });
        brow(p, cx + d * ex, by - 5 * k, d, -6, 3, browT);
      }
      ctx.fillStyle = MOUTH;
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2.4 * k;
      ctx.beginPath();
      ctx.moveTo(cx - 10 * k, my + 3 * k);
      ctx.quadraticCurveTo(cx - 5 * k, my - 3 * k, cx, my + 1 * k);
      ctx.quadraticCurveTo(cx + 5 * k, my + 5 * k, cx + 10 * k, my);
      ctx.quadraticCurveTo(cx + 2 * k, my + 11 * k, cx - 10 * k, my + 3 * k);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      sweat(p, cx + 46 * k, 26 * k);
      // gloom lines
      ctx.strokeStyle = 'rgba(70,60,170,0.55)';
      ctx.lineWidth = 2 * k;
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(cx + i * 7 * k, 14 * k);
        ctx.lineTo(cx + i * 7 * k, (26 + (i % 2) * 4) * k);
        ctx.stroke();
      }
      break;
    }
    case 'hurt': {
      for (const d of [-1, 1]) {
        const x = cx + d * ex;
        ctx.strokeStyle = INK;
        ctx.lineWidth = 4.2 * k;
        ctx.beginPath();
        ctx.moveTo(x + d * 10 * k, ey - 10 * k);
        ctx.lineTo(x - d * 8 * k, ey);
        ctx.lineTo(x + d * 10 * k, ey + 10 * k);
        ctx.stroke();
        brow(p, x, by, d, -5, 4, browT);
      }
      ctx.fillStyle = WHITE;
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2.4 * k;
      ctx.beginPath();
      ctx.moveTo(cx - 12 * k, my + 3 * k);
      ctx.lineTo(cx - 6 * k, my - 2 * k);
      ctx.lineTo(cx, my + 3 * k);
      ctx.lineTo(cx + 6 * k, my - 2 * k);
      ctx.lineTo(cx + 12 * k, my + 3 * k);
      ctx.lineTo(cx + 10 * k, my + 8 * k);
      ctx.lineTo(cx - 10 * k, my + 8 * k);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - 11 * k, my + 5 * k);
      ctx.lineTo(cx + 11 * k, my + 5 * k);
      ctx.lineWidth = 1.2 * k;
      ctx.stroke();
      sweat(p, cx - 48 * k, 30 * k);
      break;
    }
    case 'dead': {
      ctx.strokeStyle = INK;
      ctx.lineWidth = 5 * k;
      for (const d of [-1, 1]) {
        const x = cx + d * ex;
        const r = 10 * k;
        ctx.beginPath();
        ctx.moveTo(x - r, ey - r);
        ctx.lineTo(x + r, ey + r);
        ctx.moveTo(x + r, ey - r);
        ctx.lineTo(x - r, ey + r);
        ctx.stroke();
      }
      ctx.fillStyle = MOUTH;
      ctx.lineWidth = 2.6 * k;
      ctx.beginPath();
      ctx.ellipse(cx, my + 3 * k, 8 * k, 9 * k, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = TONGUE;
      ctx.beginPath();
      ctx.ellipse(cx + 2 * k, my + 8 * k, 4.5 * k, 3.4 * k, 0.3, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'mind': {
      const g = ctx.createRadialGradient(cx, ey, 4 * k, cx, ey, 60 * k);
      g.addColorStop(0, 'rgba(178,92,255,0.35)');
      g.addColorStop(1, 'rgba(178,92,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, cell, cell);
      for (const d of [-1, 1]) {
        drawOpenEye(p, cx + d * ex, ey, d, v, { mind: true, lid: 0.9 });
        brow(p, cx + d * ex, by - 2 * k, d, -2, -1, browT - 0.6);
      }
      ctx.fillStyle = MOUTH;
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2.2 * k;
      ctx.beginPath();
      ctx.ellipse(cx, my + 2 * k, 6 * k, 3.4 * k, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      break;
    }
    case 'happy': {
      for (const d of [-1, 1]) {
        arcEye(p, cx + d * ex, ey + 2 * k, true, 24);
        brow(p, cx + d * ex, by - 3 * k, d, -1, 0, browT - 0.4);
      }
      blush(p, cx, ey + 20 * k, true);
      ctx.fillStyle = MOUTH;
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2.6 * k;
      ctx.beginPath();
      ctx.moveTo(cx - 12 * k, my - 3 * k);
      ctx.quadraticCurveTo(cx, my + 1 * k, cx + 12 * k, my - 3 * k);
      ctx.quadraticCurveTo(cx + 9 * k, my + 13 * k, cx, my + 13 * k);
      ctx.quadraticCurveTo(cx - 9 * k, my + 13 * k, cx - 12 * k, my - 3 * k);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = TONGUE;
      ctx.beginPath();
      ctx.ellipse(cx, my + 9.5 * k, 6 * k, 3 * k, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'sleep': {
      for (const d of [-1, 1]) {
        arcEye(p, cx + d * ex, ey + 2 * k, false, 22);
        ctx.lineWidth = 1.8 * k;
        ctx.beginPath();
        ctx.moveTo(cx + d * (ex + 9 * k), ey + 3 * k);
        ctx.lineTo(cx + d * (ex + 13 * k), ey + 6 * k);
        ctx.stroke();
      }
      blush(p, cx, ey + 20 * k);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2.6 * k;
      ctx.beginPath();
      ctx.ellipse(cx + 2 * k, my + 1 * k, 3.6 * k, 3 * k, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = INK;
      ctx.font = `bold ${Math.round(15 * k)}px sans-serif`;
      ctx.fillText('z', cx + 36 * k, 30 * k);
      ctx.font = `bold ${Math.round(11 * k)}px sans-serif`;
      ctx.fillText('z', cx + 47 * k, 20 * k);
      break;
    }
    case 'determined': {
      for (const d of [-1, 1]) {
        drawOpenEye(p, cx + d * ex, ey + 1 * k, d, v, { lid: 0.78, glint: true });
        brow(p, cx + d * ex, by + 1 * k, d, 6, -3, browT + 0.8);
      }
      ctx.strokeStyle = INK;
      ctx.lineWidth = 3.2 * k;
      ctx.beginPath();
      ctx.moveTo(cx - 9 * k, my + 1 * k);
      ctx.quadraticCurveTo(cx, my - 2 * k, cx + 9 * k, my + 1.5 * k);
      ctx.stroke();
      // sparkle
      ctx.fillStyle = '#fff4c0';
      ctx.beginPath();
      const sx = cx + 46 * k;
      const sy = 30 * k;
      ctx.moveTo(sx, sy - 8 * k);
      ctx.quadraticCurveTo(sx + 1 * k, sy - 1 * k, sx + 8 * k, sy);
      ctx.quadraticCurveTo(sx + 1 * k, sy + 1 * k, sx, sy + 8 * k);
      ctx.quadraticCurveTo(sx - 1 * k, sy + 1 * k, sx - 8 * k, sy);
      ctx.quadraticCurveTo(sx - 1 * k, sy - 1 * k, sx, sy - 8 * k);
      ctx.fill();
      break;
    }
    case 'eating': {
      for (const d of [-1, 1]) {
        arcEye(p, cx + d * ex, ey + 2 * k, true, 22);
        brow(p, cx + d * ex, by - 2 * k, d, 0, 0, browT - 0.4);
      }
      // puffed cheeks: round bulges (outer arcs) + blush
      blush(p, cx, my - 3 * k);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2.6 * k;
      for (const d of [-1, 1]) {
        const x = cx + d * 26 * k;
        const a0 = d > 0 ? -1.15 : Math.PI - 1.15;
        ctx.beginPath();
        ctx.arc(x, my - 3 * k, 12 * k, a0, a0 + 2.3, false);
        ctx.stroke();
      }
      ctx.lineWidth = 2.6 * k;
      ctx.beginPath();
      ctx.moveTo(cx - 6 * k, my - 1 * k);
      ctx.quadraticCurveTo(cx - 3 * k, my + 4.5 * k, cx, my - 0.5 * k);
      ctx.quadraticCurveTo(cx + 3 * k, my + 4.5 * k, cx + 6 * k, my - 1 * k);
      ctx.stroke();
      ctx.fillStyle = '#e8c078';
      ctx.beginPath();
      ctx.arc(cx + 11 * k, my + 7 * k, 2 * k, 0, Math.PI * 2);
      ctx.arc(cx + 15 * k, my + 4 * k, 1.4 * k, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
  }
  ctx.restore();
}

export function createFaceAtlas(cell = 128): FaceAtlas {
  const cols = FACE_EXPRS.length;
  const variants = FACE_VARIANTS.length;
  const rows = variants;
  const canvas = document.createElement('canvas');
  canvas.width = cols * cell;
  canvas.height = rows * cell;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        drawCell(ctx, c * cell, r * cell, cell, FACE_EXPRS[c] as FaceExpr, FACE_VARIANTS[r] as Variant);
      }
    }
  }
  const index = (expr: FaceExpr, variant = 0): number => {
    const ci = Math.max(0, FACE_EXPRS.indexOf(expr));
    const ri = ((Math.floor(variant) % variants) + variants) % variants;
    return ri * cols + ci;
  };
  const uv = (i: number): { u: number; v: number; w: number; h: number } => {
    const col = i % cols;
    const row = Math.floor(i / cols) % rows;
    return { u: col / cols, v: 1 - (row + 1) / rows, w: 1 / cols, h: 1 / rows };
  };
  return { canvas, cols, rows, variants, cell, index, uv };
}
