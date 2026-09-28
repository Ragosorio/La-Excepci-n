// Procedural anime hair.
// Front hair = a "cap" (crown silhouette down to the hairline) + individual blade-shaped locks drawn
// on top of it (overlapping, each with its own cel-shadow sliver, shine and side outlines).
// Back hair = the dark mass behind the head (short / bob / long / tails / bun / floating).
import type { Ctx } from './portraitCtx';
import { X, addDef, defShape, mkId, useRef } from './portraitCtx';
import type { Pt, Rng } from './util';
import { cubicSplit, lerp, mix, n, polar } from './util';

/** Hair geometry is coarse: integer precision keeps the SVG light (sub-pixel at display sizes). */
const P = (p: Pt) => `${Math.round(p.x)} ${Math.round(p.y)}`;

interface LockSpec {
  root: Pt;
  w: number;
  tip: Pt;
  bend: number; // + bows to the left of root→tip direction, − to the right
  full?: number; // leaf-like bulge of both edges (fraction of width)
  streak?: boolean;
}

interface LockShape {
  fill: string;
  shadow: string;
  outline: string;
  /** dasharray (pathLength = 100) drawing only the lower part of both edges */
  dash: string;
  shine: string;
  strand: string;
  streak: boolean;
}

export interface FrontGeo {
  cap: string;
  locks: LockShape[];
  /** ids (in <defs>) of all closed shapes: [cap, ...locks] — for shadows and clips. */
  shapes: string[];
  hl: number;
  hr: number;
  topY: number;
  templeY: number;
  capEdge: number;
  streakRoot: Pt | null;
}

function lockShape(l: LockSpec): LockShape {
  const { root, w, tip } = l;
  const vx = tip.x - root.x;
  const vy = tip.y - root.y;
  const L = Math.hypot(vx, vy) || 1;
  const px = -vy / L;
  const py = vx / L;
  const bx = px * l.bend * L * 0.2;
  const by = py * l.bend * L * 0.2;
  const rL: Pt = { x: root.x - w / 2, y: root.y };
  const rR: Pt = { x: root.x + w / 2, y: root.y };
  const fl = (l.full ?? 0.3) * w;
  const fx = px * fl;
  const fy = py * fl;
  const c1: Pt = { x: rL.x + vx * 0.38 + bx + fx, y: rL.y + vy * 0.38 + by + fy };
  const c2: Pt = { x: tip.x - vx * 0.24 + bx * 0.55 + fx * 0.5, y: tip.y - vy * 0.24 + by * 0.55 + fy * 0.5 };
  const c3: Pt = { x: tip.x - vx * 0.3 + bx * 0.7 - fx * 0.5, y: tip.y - vy * 0.3 + by * 0.7 - fy * 0.5 };
  const c4: Pt = { x: rR.x + vx * 0.42 + bx - fx, y: rR.y + vy * 0.42 + by - fy };
  // domed root so overlapping locks never show a flat, boxy top
  const fill = `M${P(rL)}C${P(c1)} ${P(c2)} ${P(tip)}C${P(c3)} ${P(c4)} ${P(rR)}Q${n(root.x)} ${n(root.y - w * 0.7)} ${P(rL)}Z`;
  // shadow sliver along the right edge, fading in from ~35% of the length down to the tip
  const [rTop] = cubicSplit(tip, c3, c4, rR, 0.62);
  const sA = rTop[3];
  const inner: Pt = { x: lerp(sA.x, tip.x, 0.45) - (rR.x - rL.x) * 0.18 + bx * 0.3, y: lerp(sA.y, tip.y, 0.45) + by * 0.3 };
  const shadow = `M${P(tip)}C${P(rTop[1])} ${P(rTop[2])} ${P(sA)}Q${P(inner)} ${P(tip)}Z`;
  // outline only on the lower part of both edges so overlapping roots blend together
  const [, lTail] = cubicSplit(rL, c1, c2, tip, 0.34);
  const [rHead] = cubicSplit(tip, c3, c4, rR, 0.7);
  const outline = `M${P(lTail[0])}C${P(lTail[1])} ${P(lTail[2])} ${P(lTail[3])}C${P(rHead[1])} ${P(rHead[2])} ${P(rHead[3])}`;
  const polyLen = (pts: Pt[]) => pts.slice(1).reduce((a, q, i) => a + Math.hypot(q.x - (pts[i] as Pt).x, q.y - (pts[i] as Pt).y), 0);
  const lenL = polyLen([rL, c1, c2, tip]) * 0.82;
  const lenR = polyLen([tip, c3, c4, rR]) * 0.82;
  const lenD = w * 1.25;
  const tot = lenL + lenR + lenD;
  const a = ((lenL * 0.34) / tot) * 100;
  const b = ((lenL + lenR * 0.7) / tot) * 100;
  const dash = `${n(b - a)} 200" stroke-dashoffset="${n(-a)}`;
  // shine streak near the root, left half
  const h0: Pt = { x: root.x - w * 0.2 + vx * 0.12 + bx * 0.35, y: root.y + vy * 0.12 + by * 0.35 };
  const h1: Pt = { x: root.x - w * 0.14 + vx * 0.4 + bx * 0.9, y: root.y + vy * 0.4 + by * 0.9 };
  const shine = `M${P(h0)}Q${n((h0.x + h1.x) / 2 + bx * 0.2 - 1.2)} ${n((h0.y + h1.y) / 2)} ${P(h1)}`;
  const m0: Pt = { x: root.x + w * 0.02 + vx * 0.3 + bx * 0.8, y: root.y + vy * 0.3 + by * 0.8 };
  const m1: Pt = { x: tip.x - vx * 0.14 + bx * 0.3, y: tip.y - vy * 0.14 + by * 0.3 };
  const strand = `M${P(m0)}Q${n((m0.x + m1.x) / 2 + bx * 0.25)} ${n((m0.y + m1.y) / 2 + by * 0.25)} ${P(m1)}`;
  return { fill, shadow, outline, dash, shine, strand, streak: !!l.streak };
}

/** Crown silhouette from (hr, sideY) over the top to (hl, sideY). */
function crownPath(c: Ctx, hl: number, hr: number, topY: number, sideY: number): string {
  const { g, f } = c;
  const cx = g.cx - 1;
  const rng = c.rng.fork('crown');
  const ccy = sideY - 4;
  const ax = (hr - hl) / 2;
  const ay = ccy - topY;
  const ecx = (hl + hr) / 2;
  const pt = (deg: number, r: number): Pt => {
    const p = polar(0, 0, 1, deg);
    return { x: ecx + p.x * ax * r, y: ccy + p.y * ay * r };
  };
  let d = '';
  if (f.hairTop === 'spiky') {
    const k = 6;
    const a0 = -6;
    const a1 = -174;
    d += `L${P(pt(a0, 1))}`;
    for (let i = 0; i < k; i++) {
      const s0 = lerp(a0, a1, i / k);
      const s1 = lerp(a0, a1, (i + 1) / k);
      const mid = (s0 + s1) / 2;
      const outward = mid > -90 ? 1 : -1;
      const len = 1.24 + rng.range(0.02, 0.2);
      const tip = pt(mid + outward * rng.range(12, 22), len);
      const b1 = pt(s1, 1);
      const c1 = pt(s0 + (mid - s0) * 0.3, 1.1);
      const c2 = pt(mid + (s1 - mid) * 0.6, 1.02);
      d += `Q${P(c1)} ${P(tip)}Q${P(c2)} ${P(b1)}`;
    }
    d += `L${n(hl)} ${n(sideY)}`;
  } else {
    // smooth dome with a few soft lock lumps
    const k = 5;
    const a0 = 0;
    const a1 = -180;
    d += `L${P(pt(a0, 1))}`;
    for (let i = 0; i < k; i++) {
      const s0 = lerp(a0, a1, i / k);
      const s1 = lerp(a0, a1, (i + 1) / k);
      const mid = (s0 + s1) / 2;
      const bump = 1.07 + rng.range(0, 0.05);
      const b1 = pt(s1, 1);
      const cc = pt(mid + (mid > -90 ? 4 : -4), bump + 0.03);
      d += `Q${P(cc)} ${P(b1)}`;
    }
    d += `L${n(hl)} ${n(sideY)}`;
  }
  void cx;
  return d;
}

export function buildFrontHair(c: Ctx): FrontGeo | null {
  const { g, f } = c;
  if (f.hairTop === 'bald' || f.hairFront === 'none') return null;
  const rng = c.rng.fork('hairfront');
  const cx = g.cx;
  const R = g.R;
  const vol = f.hairVol;
  const hl = cx - R - 7 - vol * 0.6;
  const hr = cx + R + 7 + vol * 0.6;
  const topY = g.top - vol - 6;
  const templeY = g.eyeY - 16;
  const hairline = g.top + 19;
  const capEdge = hairline + 6;
  const sideY = g.eyeY - (f.sideLen >= 1 ? 1 : 9);
  const eyeTop = g.eyeY - g.eyeH * 0.5;
  const style = f.hairFront;

  // ---- cap
  let cap = `M${n(hr - 1)} ${n(sideY + 1)}` + crownPath(c, hl, hr, topY, sideY) + `L${n(hl + 1)} ${n(sideY + 2)}`;
  if (style === 'slick') {
    const mid = X(g, 0.02);
    cap += `C${n(X(g, -0.99))} ${n(templeY)} ${n(X(g, -0.9))} ${n(hairline)} ${n(mid - 14)} ${n(hairline - 2)}Q${n(mid - 4)} ${n(hairline - 1)} ${n(mid)} ${n(hairline + 4)}Q${n(mid + 4)} ${n(hairline - 1)} ${n(mid + 14)} ${n(hairline - 2)}C${n(X(g, 0.9))} ${n(hairline)} ${n(X(g, 0.99))} ${n(templeY)} ${n(hr - 1)} ${n(sideY + 1)}Z`;
  } else if (style === 'blunt') {
    const tipY = g.eyeY - g.browGap + 1;
    const x0 = X(g, -0.95);
    const x1 = X(g, 0.95);
    cap += `C${n(hl + 1)} ${n(templeY)} ${n(x0 - 2)} ${n(tipY - 8)} ${n(x0)} ${n(tipY - 2)}`;
    const k = 9;
    for (let i = 0; i < k; i++) {
      const a = lerp(x0, x1, i / k);
      const b = lerp(x0, x1, (i + 1) / k);
      const m = (a + b) / 2;
      const ty = tipY + rng.range(-1, 1.5) + (i === 0 || i === k - 1 ? -2 : 0);
      cap += `Q${n(lerp(a, m, 0.5))} ${n(ty)} ${n(m)} ${n(ty + 1.5)}Q${n(lerp(m, b, 0.5))} ${n(ty)} ${n(b)} ${n(ty - 2.5)}`;
    }
    cap += `C${n(x1 + 2)} ${n(tipY - 8)} ${n(hr - 1)} ${n(templeY)} ${n(hr - 1)} ${n(sideY + 1)}Z`;
  } else {
    cap += `C${n(X(g, -0.99))} ${n(templeY - 2)} ${n(X(g, -0.6))} ${n(capEdge + 1)} ${n(X(g, 0))} ${n(capEdge)}C${n(X(g, 0.55))} ${n(capEdge + 1)} ${n(X(g, 0.99))} ${n(templeY - 3)} ${n(hr - 1)} ${n(sideY + 1)}Z`;
  }

  // ---- locks
  const specs: LockSpec[] = [];
  const rootY = (u: number) => lerp(capEdge - 17, templeY - 16, Math.pow(Math.abs(u), 1.6));
  const clampTip = (x: number, y: number): number => {
    for (const side of [-1, 1]) {
      const ex = X(g, side * g.eyeU);
      if (Math.abs(x - ex) < g.eyeW * 0.5) return Math.min(y, eyeTop + 1);
    }
    return y;
  };
  const addLock = (u: number, w: number, du: number, tipY: number, bend: number) => {
    const rx = X(g, u);
    const tx = X(g, Math.max(-1, Math.min(1, u + du)));
    specs.push({ root: { x: rx, y: rootY(u) }, w, tip: { x: tx, y: clampTip(tx, tipY) }, bend });
  };

  // side locks first (they sit behind the fringe)
  if (f.sideLen > 0) {
    const tipY = [0, g.eyeY + 8, g.jawY + 4, g.chinY + 14][f.sideLen] as number;
    for (const s of [-1, 1]) {
      const rx = s < 0 ? hl + 10 : hr - 10;
      const tx = s < 0 ? cx - R + 3 : cx + R - 3;
      if (f.sideLen >= 2) specs.push({ root: { x: rx + s * 3, y: templeY - 20 }, w: 16, tip: { x: tx + s * 7, y: tipY - 12 }, bend: s * 0.2, full: 0.2 });
      specs.push({ root: { x: rx, y: templeY - 24 }, w: 22, tip: { x: tx, y: tipY }, bend: s * 0.3, full: 0.22 });
    }
  }
  const sw = f.sweep;
  switch (style) {
    case 'swept': {
      const k = 6;
      for (let i = 0; i < k; i++) {
        const u = lerp(-0.78, 0.78, i / (k - 1)) * (sw > 0 ? 1 : -1);
        const long = (u * sw < 0 ? 5 : 0) + rng.range(-3, 3);
        addLock(u, rng.range(22, 27), sw * rng.range(0.22, 0.34), g.eyeY - 13 + long, sw * rng.range(0.5, 0.8));
      }
      break;
    }
    case 'spiky': {
      const k = 6;
      for (let i = 0; i < k; i++) {
        const u = lerp(-0.8, 0.8, i / (k - 1)) + rng.range(-0.04, 0.04);
        const dir = Math.abs(u) < 0.1 ? sw : Math.sign(u);
        addLock(u, rng.range(21, 25), dir * rng.range(0.12, 0.24), g.eyeY - 15 + rng.range(-4, 4) + (Math.abs(u) < 0.35 ? 4 : 0), dir * 0.45);
      }
      break;
    }
    case 'messy': {
      const k = 7;
      for (let i = 0; i < k; i++) {
        const u = lerp(-0.82, 0.82, i / (k - 1)) + rng.range(-0.05, 0.05);
        const dir = rng.chance(0.5) ? 1 : -1;
        addLock(u, rng.range(19, 23), dir * rng.range(0.08, 0.26), g.eyeY - 14 + rng.range(-5, 4), dir * rng.range(0.3, 0.8));
      }
      break;
    }
    case 'parted': {
      const up = f.part;
      const leftN = up < 0 ? 2 : 3;
      const rightN = 5 - leftN;
      for (let i = 0; i < leftN; i++) {
        const u = lerp(-0.84, up - 0.08, i / Math.max(1, leftN - 1));
        const near = i === leftN - 1;
        addLock(u, near ? 26 : 23, near ? -0.3 : -0.18, near ? g.eyeY - 7 : g.eyeY - 13 + rng.range(-2, 2), -0.6);
      }
      for (let i = 0; i < rightN; i++) {
        const u = lerp(up + 0.08, 0.84, i / Math.max(1, rightN - 1));
        const near = i === 0;
        addLock(u, near ? 26 : 23, near ? 0.32 : 0.18, near ? g.eyeY - 6 : g.eyeY - 13 + rng.range(-2, 2), 0.6);
      }
      break;
    }
    case 'curtain': {
      const up = f.part * 0.3;
      addLock(-0.8, 20, -0.08, g.eyeY - 8, -0.3);
      addLock(0.8, 20, 0.08, g.eyeY - 8, 0.3);
      addLock(up - 0.18, 30, -0.5, g.eyeY - 5, -0.75);
      addLock(up + 0.18, 30, 0.5, g.eyeY - 5, 0.75);
      break;
    }
    default:
      break;
  }
  // draw center locks last (front-most)
  const side = specs.filter((s) => Math.abs(s.root.x - cx) > R * 0.95);
  const front = specs.filter((s) => Math.abs(s.root.x - cx) <= R * 0.95).sort((a, b) => Math.abs(b.root.x - cx) - Math.abs(a.root.x - cx));
  const ordered = [...side, ...front];
  if (f.streak && front.length > 0) {
    // the lock whose tip falls nearest the middle of the face becomes the streak
    let best = front[0] as LockSpec;
    const mid = X(g, 0.02);
    for (const s of front) if (Math.abs(s.tip.x - mid) + Math.abs(s.root.x - mid) * 0.3 < Math.abs(best.tip.x - mid) + Math.abs(best.root.x - mid) * 0.3) best = s;
    best.streak = true;
    best.w *= 0.62;
    best.tip = { x: best.tip.x, y: Math.max(best.tip.y, g.eyeY - 6) };
    // bring it to the front
    ordered.splice(ordered.indexOf(best), 1);
    ordered.push(best);
  }
  const locks = ordered.map(lockShape);
  const streakSpec = ordered.find((o) => o.streak);
  const capId = defShape(c, 'cap', cap);
  const lockIds = locks.map((l, i) => {
    const id = defShape(c, `lk${i}`, l.fill);
    c.defs[c.defs.length - 1] = `<path id="${id}" d="${l.fill}" pathLength="100"/>`;
    return id;
  });
  return { cap, locks, shapes: [capId, ...lockIds], hl, hr, topY, templeY, capEdge, streakRoot: streakSpec ? streakSpec.root : null };
}

// ---------------------------------------------------------------------------
// Back hair
// ---------------------------------------------------------------------------

function zigzag(x0: number, x1: number, yTip: number, yNotch: number, k: number, rng: Rng): string {
  let d = '';
  for (let i = 0; i < k; i++) {
    const a = lerp(x0, x1, i / k);
    const b = lerp(x0, x1, (i + 1) / k);
    const tx = lerp(a, b, 0.55);
    const ty = yTip + rng.range(-4, 4);
    const ny = yNotch + rng.range(-3, 3);
    d += `Q${n(lerp(a, tx, 0.6))} ${n(lerp(ny, ty, 0.35))} ${n(tx)} ${n(ty)}Q${n(lerp(tx, b, 0.3))} ${n(lerp(ty, ny, 0.6))} ${n(b)} ${n(i === k - 1 ? yNotch : ny)}`;
  }
  return d;
}

export function drawBackHair(c: Ctx): string {
  const { g, p, f } = c;
  if (f.hairTop === 'bald' && f.hairBack === 'none') return '';
  const rng = c.rng.fork('hairback');
  const cx = g.cx;
  const R = g.R;
  const vol = f.hairVol;
  const hl = cx - R - 7 - vol * 0.6;
  const hr = cx + R + 7 + vol * 0.6;
  const topY = g.top - vol - 6;
  const templeY = g.eyeY - 16;
  const fill = p.hairSh;
  const ln = p.hairLine;
  let s = '';
  const path = (d: string, col = fill) => `<path d="${d}" fill="${col}" stroke="${ln}" stroke-width="1.6" stroke-linejoin="round"/>`;
  const cap = `M${n(cx)} ${n(topY)}`;
  const capR = `C${n(cx + R + 2)} ${n(topY)} ${n(hr + 3)} ${n(templeY - 18)} `;
  switch (f.hairBack) {
    case 'short':
    case 'nape':
    case 'bun':
    case 'ponytail': {
      const by = f.hairBack === 'nape' ? g.chinY + 6 : g.jawY + 2;
      let d = `${cap}${capR}${n(hr + 1)} ${n(templeY + 8)}`;
      d += `C${n(hr)} ${n(g.eyeY + 12)} ${n(cx + R)} ${n(by - 6)} ${n(cx + R - 3)} ${n(by)}`;
      d += f.hairBack === 'nape' ? zigzag(cx + R - 3, cx - R + 3, by + 6, by - 2, 5, rng) : `L${n(cx - R + 3)} ${n(by)}`;
      d += `C${n(cx - R)} ${n(by - 6)} ${n(hl)} ${n(g.eyeY + 12)} ${n(hl - 1)} ${n(templeY + 8)}`;
      d += `C${n(hl - 3)} ${n(templeY - 18)} ${n(cx - R - 2)} ${n(topY)} ${n(cx)} ${n(topY)}Z`;
      if (f.hairBack === 'ponytail') {
        const tail =
          `M${n(cx + R * 0.3)} ${n(topY + 6)}C${n(cx + R + 30)} ${n(topY - 8)} ${n(hr + 30)} ${n(g.eyeY)} ${n(hr + 22)} ${n(150)}` +
          `Q${n(hr + 20)} ${n(164)} ${n(hr + 11)} ${n(182)}Q${n(hr + 12)} ${n(162)} ${n(hr + 6)} ${n(152)}` +
          `C${n(hr + 12)} ${n(g.eyeY)} ${n(hr + 2)} ${n(topY + 18)} ${n(cx + R * 0.55)} ${n(topY + 20)}Z`;
        s += path(tail);
        s += `<path d="M${n(hr + 4)} ${n(topY + 26)}Q${n(hr + 22)} ${n(g.eyeY)} ${n(hr + 14)} ${n(162)}" stroke="${ln}" stroke-width=".8" fill="none" opacity=".4"/>`;
      }
      s += path(d);
      break;
    }
    case 'bob': {
      const by = g.chinY + 6;
      let d = `${cap}${capR}${n(hr + 6)} ${n(templeY + 10)}`;
      d += `C${n(hr + 9)} ${n(g.jawY)} ${n(hr + 5)} ${n(by - 2)} ${n(hr - 3)} ${n(by)}`;
      d += zigzag(hr - 3, hl + 3, by + 4, by - 3, 6, rng);
      d += `C${n(hl - 5)} ${n(by - 2)} ${n(hl - 9)} ${n(g.jawY)} ${n(hl - 6)} ${n(templeY + 10)}`;
      d += `C${n(hl - 3)} ${n(templeY - 18)} ${n(cx - R - 2)} ${n(topY)} ${n(cx)} ${n(topY)}Z`;
      s += path(d);
      break;
    }
    case 'long':
    case 'wild':
    case 'lowbun': {
      const wild = f.hairBack === 'wild';
      const low = f.hairBack === 'lowbun';
      const spread = wild ? 24 : low ? 4 : 14;
      const by = low ? g.chinY + 10 : 204;
      let d = `${cap}${capR}${n(hr + 7)} ${n(templeY + 12)}`;
      if (wild) {
        d += `L${n(hr + 16)} ${n(g.eyeY + 4)}L${n(hr + 10)} ${n(g.eyeY + 12)}L${n(hr + 24)} ${n(g.chinY - 2)}L${n(hr + 15)} ${n(g.chinY + 6)}L${n(hr + 28)} ${n(g.neckY)}`;
      }
      d += `C${n(hr + spread * 0.6)} ${n(g.chinY + 10)} ${n(hr + spread)} ${n(150)} ${n(hr + spread)} ${n(by - 4)}`;
      d += zigzag(hr + spread, hl - spread, by + 5, by - 8, wild ? 8 : 6, rng);
      if (wild) {
        d += `L${n(hl - 28)} ${n(g.neckY)}L${n(hl - 15)} ${n(g.chinY + 6)}L${n(hl - 24)} ${n(g.chinY - 2)}L${n(hl - 10)} ${n(g.eyeY + 12)}L${n(hl - 16)} ${n(g.eyeY + 4)}`;
      } else {
        d += `C${n(hl - spread)} ${n(150)} ${n(hl - spread * 0.6)} ${n(g.chinY + 10)} ${n(hl - 7)} ${n(templeY + 12)}`;
      }
      d += `L${n(hl - 7)} ${n(templeY + 12)}C${n(hl - 3)} ${n(templeY - 18)} ${n(cx - R - 2)} ${n(topY)} ${n(cx)} ${n(topY)}Z`;
      s += path(d);
      if (low) s += `<ellipse cx="${n(cx - 2)}" cy="${n(g.chinY + 8)}" rx="17" ry="11" fill="${fill}" stroke="${ln}" stroke-width="1.5"/>`;
      for (let i = 0; i < 6; i++) {
        const sd = i % 2 === 0 ? -1 : 1;
        const x = sd < 0 ? hl - 1 - i : hr + 1 + i;
        s += `<path d="M${n(x)} ${n(g.eyeY)}Q${n(x + sd * (spread * 0.5))} ${n(150)} ${n(x + sd * spread * 0.8)} ${n(by - 12)}" stroke="${ln}" stroke-width=".8" fill="none" opacity=".35"/>`;
      }
      break;
    }
    case 'twintails': {
      let d = `${cap}${capR}${n(hr + 1)} ${n(templeY + 8)}`;
      d += `L${n(cx + R - 3)} ${n(g.jawY + 2)}L${n(cx - R + 3)} ${n(g.jawY + 2)}L${n(hl - 1)} ${n(templeY + 8)}`;
      d += `C${n(hl - 3)} ${n(templeY - 18)} ${n(cx - R - 2)} ${n(topY)} ${n(cx)} ${n(topY)}Z`;
      for (const sd of [-1, 1]) {
        const ax = sd < 0 ? hl + 8 : hr - 8;
        const ay = templeY - 20;
        const ox = ax + sd * 30;
        const tail =
          `M${n(ax)} ${n(ay - 6)}C${n(ox + sd * 4)} ${n(ay - 8)} ${n(ox + sd * 7)} ${n(g.eyeY + 20)} ${n(ox - sd * 1)} ${n(170)}` +
          `Q${n(ox - sd * 5)} ${n(184)} ${n(ox - sd * 12)} ${n(196)}Q${n(ox - sd * 10)} ${n(172)} ${n(ox - sd * 14)} ${n(152)}` +
          `C${n(ox - sd * 12)} ${n(g.eyeY + 10)} ${n(ax + sd * 10)} ${n(ay + 12)} ${n(ax)} ${n(ay + 8)}Z`;
        s += path(tail);
        s += `<path d="M${n(ax + sd * 12)} ${n(ay + 4)}Q${n(ox)} ${n(g.eyeY + 10)} ${n(ox - sd * 8)} ${n(174)}" stroke="${ln}" stroke-width=".8" fill="none" opacity=".4"/>`;
      }
      s += path(d);
      break;
    }
    case 'floating': {
      const k = 11;
      const ccy = g.eyeY - 6;
      let d = `M${n(hl + 4)} ${n(g.eyeY + 24)}`;
      for (let i = 0; i < k; i++) {
        const a0 = lerp(205, -25, i / k);
        const a1 = lerp(205, -25, (i + 1) / k);
        const am = (a0 + a1) / 2;
        const tip = polar(cx, ccy - 4, 84 + rng.range(-10, 14), am - 10 + rng.range(-6, 6));
        const b = polar(cx, ccy, 48, a1);
        const c1 = polar(cx, ccy, 64, a0 - 6);
        d += `Q${P(c1)} ${P(tip)}Q${P(polar(cx, ccy, 60, am + 8))} ${P(b)}`;
      }
      d += `L${n(hr - 4)} ${n(g.eyeY + 24)}Z`;
      s += path(d);
      for (let i = 0; i < 9; i++) {
        const a = lerp(200, -20, i / 8);
        const p0 = polar(cx, ccy, 50, a);
        const p1 = polar(cx, ccy - 4, 78, a - 9);
        s += `<path d="M${P(p0)}L${P(p1)}" stroke="${mix(p.hairHi, p.glow, 0.5)}" stroke-width=".9" opacity=".5"/>`;
      }
      break;
    }
    default:
      break;
  }
  return s;
}

/** Bun on top of the head (drawn after the face, before the front hair). */
export function drawBun(c: Ctx): string {
  const { g, p, f } = c;
  if (f.hairBack !== 'bun') return '';
  const x = g.cx + 4;
  const y = g.top - f.hairVol - 8;
  let s = `<circle cx="${n(x)}" cy="${n(y)}" r="16" fill="${p.hair}" stroke="${p.hairLine}" stroke-width="1.6"/>`;
  s += `<path d="M${n(x - 12)} ${n(y + 2)}Q${n(x - 3)} ${n(y - 13)} ${n(x + 11)} ${n(y - 6)}M${n(x - 9)} ${n(y + 9)}Q${n(x + 4)} ${n(y - 2)} ${n(x + 13)} ${n(y + 4)}" stroke="${p.hairSh}" stroke-width="1.3" fill="none"/>`;
  s += `<path d="M${n(x - 7)} ${n(y - 10)}Q${n(x)} ${n(y - 14)} ${n(x + 7)} ${n(y - 11)}" stroke="${p.hairHi}" stroke-width="1.8" fill="none" opacity=".8" stroke-linecap="round"/>`;
  s += `<path d="M${n(x - 21)} ${n(y + 8)}L${n(x + 21)} ${n(y - 10)}" stroke="${p.trim}" stroke-width="2.2" stroke-linecap="round"/>`;
  s += `<circle cx="${n(x + 21)}" cy="${n(y - 10)}" r="2.4" fill="${p.accent}" stroke="${p.trimSh}" stroke-width=".6"/>`;
  return s;
}

/** Long locks falling in front of the shoulders (drawn after the body, before the face). */
export function drawHairDrapes(c: Ctx): string {
  const { g, p, f } = c;
  if (!(f.hairBack === 'long' || f.hairBack === 'wild') || f.sideLen < 3 || f.headwear === 'hood') return '';
  const rng = c.rng.fork('drapes');
  const cx = g.cx;
  const R = g.R;
  let s = '';
  for (const sd of [-1, 1] as const) {
    const specs: LockSpec[] = [];
    const bx = sd < 0 ? cx - R - 2 : cx + R + 2;
    const tipBase = 186 + rng.range(-6, 8);
    specs.push({ root: { x: bx + sd * 8, y: g.eyeY - 6 }, w: 26, tip: { x: bx + sd * 20, y: tipBase }, bend: sd * -0.22, full: 0.3 });
    specs.push({ root: { x: bx + sd * 2, y: g.eyeY + 4 }, w: 16, tip: { x: bx + sd * 6, y: tipBase - 18 + rng.range(-4, 4) }, bend: sd * -0.2, full: 0.25 });
    for (const sp of specs) {
      const l = lockShape(sp);
      s += `<path d="${l.fill}" fill="${p.hair}"/><path d="${l.shadow}" fill="${p.hairSh}"/><path d="${l.shine}" stroke="${p.hairHi}" stroke-width="1.6" fill="none" stroke-linecap="round" opacity=".7"/><path d="${l.outline}" fill="none" stroke="${p.hairLine}" stroke-width="1.5" stroke-linejoin="round"/>`;
    }
  }
  return s;
}

// ---------------------------------------------------------------------------
// Front hair rendering
// ---------------------------------------------------------------------------

export function drawFrontHair(c: Ctx, fg: FrontGeo | null): string {
  const { g, p, f } = c;
  let s = '';
  if (!fg) {
    if (f.hairTop === 'bald') s += baldShine(c);
    if (f.hairTop === 'crest') s += crest(c);
    return s;
  }
  const clip = mkId(c, 'hc');
  const capId = fg.shapes[0] as string;
  addDef(c, `<clipPath id="${clip}">${useRef(capId)}</clipPath>`);
  // cap: base colour with a far-side cel shadow; darker "inner hair" below the lock roots (seen between the bangs)
  s += useRef(capId, `fill="${p.hairSh}"`);
  s += `<g clip-path="url(#${clip})">`;
  s += useRef(capId, `transform="translate(-5 0)" fill="${p.hair}"`);
  if (f.hairFront !== 'slick' && f.hairFront !== 'blunt') {
    const cTop = fg.capEdge - 5;
    const sTop = fg.templeY - 2;
    s += `<path d="M${n(fg.hl - 12)} ${n(sTop)}Q${n(g.cx)} ${n(cTop - (sTop - cTop))} ${n(fg.hr + 12)} ${n(sTop)}V${n(g.chinY)}H${n(fg.hl - 12)}Z" fill="${p.hairSh}"/>`;
  }
  s += angelRing(c, fg);
  if (f.hairFront === 'slick' || f.hairFront === 'blunt') {
    for (let i = 0; i < 5; i++) {
      const x = lerp(fg.hl + 8, fg.hr - 8, (i + 0.5) / 5);
      s += `<path d="M${n(x + (x - g.cx) * 0.1)} ${n(fg.capEdge - 2)}Q${n(x + (x - g.cx) * 0.2)} ${n(fg.topY + 16)} ${n(lerp(x, g.cx, 0.4))} ${n(fg.topY + 4)}" stroke="${p.hairLine}" stroke-width=".8" fill="none" opacity=".35"/>`;
    }
  }
  if (f.greyStreaks) {
    for (let i = 0; i < 5; i++) {
      const x = lerp(fg.hl + 8, fg.hr - 8, (i + 0.5) / 5);
      s += `<path d="M${n(lerp(x, g.cx, 0.5))} ${n(fg.topY + 3)}Q${n(x)} ${n(g.top + 14)} ${n(x + (x - g.cx) * 0.1)} ${n(fg.capEdge)}" stroke="#dcd9d2" stroke-width="1.5" fill="none" opacity=".7"/>`;
    }
  }
  s += `</g>${useRef(capId, `fill="none" stroke="${p.hairLine}" stroke-width="1.7" stroke-linejoin="round"`)}`;
  // locks
  const streakCol = f.streak ?? p.hair;
  fg.locks.forEach((l, i) => {
    const base = l.streak ? streakCol : p.hair;
    const sh = l.streak ? mix(streakCol, '#6a6a8a', 0.35) : p.hairSh;
    s += `${useRef(fg.shapes[i + 1] as string, `fill="${base}"`)}<path d="${l.shadow}" fill="${sh}"/>`;
    if (i >= fg.locks.length - 4) s += `<path d="${l.strand}" stroke="${p.hairLine}" stroke-width=".8" fill="none" opacity=".35"/>`;
    s += `<path d="${l.shine}" stroke="${l.streak ? '#ffffff' : p.hairHi}" stroke-width="1.5" fill="none" stroke-linecap="round" opacity=".75"/>`;
    // outline only along the lower part of both edges (dash over the shared shape; roots stay seamless)
    s += useRef(fg.shapes[i + 1] as string, `fill="none" stroke="${p.hairLine}" stroke-width="1.5" stroke-dasharray="${l.dash}"`);
  });
  if (f.streak && fg.streakRoot) {
    // the streak continues up over the crown (clipped to the cap so it never pokes out)
    const r = fg.streakRoot;
    const topX = g.cx - 8;
    const d = `M${n(r.x - 5)} ${n(r.y + 6)}C${n(r.x - 7)} ${n(r.y - 8)} ${n(topX - 7)} ${n(fg.topY + 12)} ${n(topX - 3)} ${n(fg.topY - 4)}L${n(topX + 5)} ${n(fg.topY - 4)}C${n(topX + 3)} ${n(fg.topY + 14)} ${n(r.x + 3)} ${n(r.y - 6)} ${n(r.x + 5)} ${n(r.y + 6)}Z`;
    s += `<g clip-path="url(#${clip})"><path d="${d}" fill="${streakCol}"/><path d="M${n(r.x - 2)} ${n(r.y + 2)}C${n(r.x - 4)} ${n(r.y - 8)} ${n(topX - 3)} ${n(fg.topY + 12)} ${n(topX)} ${n(fg.topY)}" stroke="#ffffff" stroke-width="1" fill="none" opacity=".8"/><path d="M${n(r.x + 5)} ${n(r.y + 6)}C${n(r.x + 3)} ${n(r.y - 6)} ${n(topX + 3)} ${n(fg.topY + 14)} ${n(topX + 5)} ${n(fg.topY - 4)}" stroke="${p.hairLine}" stroke-width=".9" fill="none"/></g>`;
  }
  if (f.ahoge) s += ahoge(c, fg);
  return s;
}

/** Shapes used to cast the fringe shadow on the forehead. */
export function hairShadowShapes(fg: FrontGeo | null): string[] {
  return fg ? fg.shapes : [];
}

function angelRing(c: Ctx, fg: FrontGeo): string {
  const { g, p } = c;
  const rng = c.rng.fork('ring');
  const y0 = fg.topY + (fg.capEdge - fg.topY) * 0.32;
  const hi = p.hairHi;
  const rx = g.R * 0.95;
  const arcY = (x: number) => y0 + Math.pow((x - g.cx) / rx, 2) * 11;
  // classic "angel ring": a thin crescent band broken into tapered segments
  const cuts = [0, 0.3 + rng.range(-0.05, 0.05), 0.62 + rng.range(-0.05, 0.05), 1];
  let s = '';
  for (let i = 0; i < 3; i++) {
    const x0 = lerp(g.cx - rx, g.cx + rx, (cuts[i] as number) + 0.03);
    const x1 = lerp(g.cx - rx, g.cx + rx, (cuts[i + 1] as number) - 0.03);
    const th = 3 + rng.range(0, 1);
    let top = `M${n(x0)} ${n(arcY(x0))}`;
    let bot = '';
    const steps = 6;
    for (let j = 1; j <= steps; j++) {
      const x = lerp(x0, x1, j / steps);
      top += `L${n(x)} ${n(arcY(x) - th * 0.45 * Math.sin((j / steps) * Math.PI))}`;
    }
    for (let j = steps - 1; j > 0; j--) {
      const x = lerp(x0, x1, j / steps);
      bot += `L${n(x)} ${n(arcY(x) + th * 0.55 * Math.sin((j / steps) * Math.PI))}`;
    }
    s += `<path d="${top}${bot}Z" fill="${hi}" opacity=".8"/>`;
  }
  return s;
}

function ahoge(c: Ctx, fg: FrontGeo): string {
  const { g, p } = c;
  const x = g.cx + 4;
  const y = fg.topY + 3;
  const d = `M${n(x - 3)} ${n(y + 2)}C${n(x - 2)} ${n(y - 10)} ${n(x + 8)} ${n(y - 18)} ${n(x + 14)} ${n(y - 16)}C${n(x + 8)} ${n(y - 13)} ${n(x + 2)} ${n(y - 6)} ${n(x + 3)} ${n(y + 2)}Z`;
  return `<path d="${d}" fill="${p.hair}" stroke="${p.hairLine}" stroke-width="1.4" stroke-linejoin="round"/>`;
}

function baldShine(c: Ctx): string {
  const { g } = c;
  return `<path d="M${n(g.cx - g.R * 0.55)} ${n(g.top + 12)}Q${n(g.cx - g.R * 0.2)} ${n(g.top + 3)} ${n(g.cx + g.R * 0.15)} ${n(g.top + 5)}" stroke="#ffffff" stroke-width="3" fill="none" opacity=".35" stroke-linecap="round"/>`;
}

function crest(c: Ctx): string {
  const { g, p } = c;
  const rng = c.rng.fork('crest');
  const cx = g.cx + 1;
  const base = g.top + 16;
  const k = 7;
  let d = `M${n(cx - 11)} ${n(base)}`;
  for (let i = 0; i < k; i++) {
    const t0 = i / k;
    const t1 = (i + 1) / k;
    const ang = lerp(-150, -30, (t0 + t1) / 2);
    const len = 58 + rng.range(-6, 10) - Math.abs(ang + 90) * 0.25;
    const tip = polar(cx, base + 8, len, ang);
    const bx = lerp(cx - 11, cx + 11, t1);
    const by = base - Math.sin(Math.PI * t1) * 22;
    d += `Q${n(lerp(cx - 11, cx + 11, t0) + (tip.x - cx) * 0.3)} ${n(by - 10)} ${P(tip)}Q${n(bx + (tip.x - cx) * 0.2)} ${n(by - 6)} ${n(bx)} ${n(by)}`;
  }
  d += `Q${n(cx)} ${n(base + 8)} ${n(cx - 11)} ${n(base)}Z`;
  let s = `<path d="${d}" fill="${p.hair}" stroke="${p.hairLine}" stroke-width="1.6" stroke-linejoin="round"/>`;
  for (let i = 0; i < 4; i++) {
    const a = lerp(-135, -45, i / 3);
    const p0 = polar(cx, base + 6, 12, a);
    const p1 = polar(cx, base + 6, 40, a);
    s += `<path d="M${P(p0)}L${P(p1)}" stroke="${p.hairHi}" stroke-width="1.4" opacity=".6"/>`;
  }
  return baldShine(c) + s;
}

/** Hair ties / ribbons for tails (front layer). */
export function drawHairTies(c: Ctx): string {
  const { g, p, f } = c;
  if (f.hairBack !== 'twintails') return '';
  const cx = g.cx;
  const R = g.R;
  const hl = cx - R - 6 - f.hairVol * 0.55;
  const hr = cx + R + 6 + f.hairVol * 0.55;
  const y = g.eyeY - 16 - 20;
  let s = '';
  for (const sd of [-1, 1]) {
    const x = sd < 0 ? hl + 6 : hr - 6;
    s += `<path d="M${n(x)} ${n(y)}l${n(sd * -8)} -7v14Z M${n(x)} ${n(y)}l${n(sd * 8)} -7v14Z" fill="${p.accent}" stroke="${p.accentLine}" stroke-width="1" stroke-linejoin="round"/>`;
    s += `<circle cx="${n(x)}" cy="${n(y)}" r="2.8" fill="${p.accentSh}" stroke="${p.accentLine}" stroke-width=".8"/>`;
  }
  return s;
}
