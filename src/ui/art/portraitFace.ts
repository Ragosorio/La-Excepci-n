// Face construction for anime portraits: head shape, ears, eyes, brows, nose, mouth,
// race skin features, beards and mood overlays.
import type { PortraitMood } from './portraits';
import type { Ctx, Geo } from './portraitCtx';
import { S, X, addDef, mkId, useRef } from './portraitCtx';
import type { Pt } from './util';
import { cubicHead, lightOf, linGrad, mix, n, radGrad, shadowOf } from './util';

// ---------------------------------------------------------------------------
// Head shape
// ---------------------------------------------------------------------------

export function buildFacePath(g: Geo): string {
  const { cx, R } = g;
  const tY = g.eyeY - 21;
  const cY = g.eyeY + 3;
  const jL: Pt = { x: X(g, -g.jawU), y: g.jawY };
  const jR: Pt = { x: X(g, g.jawU), y: g.jawY - 1.5 };
  const chx = X(g, 0);
  const cw = g.chinW;
  const cy = g.chinY;
  const L = cx - R;
  const Rr = cx + R;
  return (
    `M${n(L)} ${n(tY)}` +
    `C${n(L - 0.6)} ${n(tY + 9)} ${n(L - 0.6)} ${n(cY - 7)} ${n(L)} ${n(cY)}` +
    `C${n(L + 0.4)} ${n(cY + (jL.y - cY) * 0.55)} ${n(jL.x - (jL.x - L) * 0.3)} ${n(jL.y - 4)} ${n(jL.x)} ${n(jL.y)}` +
    `C${n(jL.x + (chx - cw - jL.x) * 0.38)} ${n(jL.y + (cy - jL.y) * 0.72)} ${n(chx - cw - 5)} ${n(cy)} ${n(chx - cw)} ${n(cy)}` +
    (cw > 0 ? `L${n(chx + cw)} ${n(cy)}` : '') +
    `C${n(chx + cw + 4)} ${n(cy)} ${n(jR.x - (jR.x - chx - cw) * 0.3)} ${n(jR.y + (cy - jR.y) * 0.7)} ${n(jR.x)} ${n(jR.y)}` +
    `C${n(jR.x + (Rr - jR.x) * 0.3)} ${n(jR.y - 4)} ${n(Rr + 0.4)} ${n(cY + (jR.y - cY) * 0.5)} ${n(Rr)} ${n(cY)}` +
    `C${n(Rr + 0.6)} ${n(cY - 7)} ${n(Rr + 0.6)} ${n(tY + 9)} ${n(Rr)} ${n(tY)}` +
    `C${n(Rr + 2.5)} ${n(g.top + 20)} ${n(cx + R * 0.62)} ${n(g.top)} ${n(cx)} ${n(g.top)}` +
    `C${n(cx - R * 0.62)} ${n(g.top)} ${n(L - 2.5)} ${n(g.top + 20)} ${n(L)} ${n(tY)}Z`
  );
}

export function drawNeck(c: Ctx): string {
  const { g, p } = c;
  const nx = g.cx + 1.5;
  const w = g.neckW;
  const y0 = g.jawY - 6;
  const y1 = g.neckY + 6;
  const d =
    `M${n(nx - w)} ${n(y0)}C${n(nx - w)} ${n(y0 + 14)} ${n(nx - w - 0.5)} ${n(y1 - 12)} ${n(nx - w - 3)} ${n(y1)}` +
    `L${n(nx + w + 3)} ${n(y1)}C${n(nx + w + 0.5)} ${n(y1 - 12)} ${n(nx + w)} ${n(y0 + 14)} ${n(nx + w)} ${n(y0)}Z`;
  const chx = X(g, 0);
  const sh =
    `M${n(nx - w)} ${n(y0)}L${n(nx - w)} ${n(g.jawY + 3)}` +
    `Q${n(chx - 2)} ${n(g.chinY + 11)} ${n(nx + w + 0.2)} ${n(g.jawY + 9)}L${n(nx + w)} ${n(y0)}Z`;
  const side = `M${n(nx + w - 3.5)} ${n(g.jawY + 6)}C${n(nx + w - 3)} ${n(y1 - 14)} ${n(nx + w - 1)} ${n(y1 - 6)} ${n(nx + w + 3)} ${n(y1)}L${n(nx + w + 0.5)} ${n(y1)}L${n(nx + w)} ${n(g.jawY)}Z`;
  return (
    `<path d="${d}" fill="${p.skin}" stroke="${p.skinLine}" stroke-width="1.4"/>` +
    `<path d="${sh}" fill="${p.skinSh}"/><path d="${side}" fill="${p.skinSh}"/>`
  );
}

/** Face fill + cel shading (far side band, hair shadow on forehead). */
export function drawFaceBase(c: Ctx): string {
  const { g, p, f } = c;
  const fid = mkId(c, 'fc');
  addDef(c, `<clipPath id="${fid}">${useRef(c.faceId)}</clipPath>`);
  let s = useRef(c.faceId, `fill="${p.skinSh}"`);
  s += `<g clip-path="url(#${fid})">`;
  s += useRef(c.faceId, `transform="translate(-4.2 -2.4)" fill="${p.skin}"`);
  // soft warm light on the near cheek
  s += `<ellipse cx="${n(X(g, -0.45))}" cy="${n(g.eyeY + 10)}" rx="${n(g.R * 0.45)}" ry="${n(g.R * 0.32)}" fill="${p.skinHi}" opacity=".35"/>`;
  // shadow cast by the fringe
  if (c.hairShapes.length && f.headwear !== 'helmet') {
    s += `<g transform="translate(1.6 4.6)" fill="${p.skinSh}">${c.hairShapes.map((id) => useRef(id)).join('')}</g>`;
  }
  if (f.headwear === 'hood' || f.headwear === 'helmet') {
    s += `<rect x="${n(g.cx - g.R - 4)}" y="${n(g.top - 10)}" width="${n(g.R * 2 + 8)}" height="${n(g.eyeY - g.top - 2)}" fill="${p.skinSh2}" opacity=".55"/>`;
  }
  if (f.wrinkles || c.age === 'old') s += wrinkles(c);
  if (f.scales) s += scales(c);
  if (f.cracks) s += cracks(c);
  if (f.freckles) s += freckles(c);
  if (f.facePaint) s += facePaint(c);
  if (f.soot) s += soot(c);
  if (f.beard === 'stubble') s += stubble(c);
  if (c.mood === 'hurt') {
    s += `<ellipse cx="${n(X(g, 0.62))}" cy="${n(g.eyeY + 12)}" rx="7" ry="4.5" fill="#8a4a8a" opacity=".32"/>`;
  }
  if (c.mood === 'scared') {
    const gl = mkId(c, 'gl');
    addDef(c, linGrad(gl, [[0, '#3a3a8a', 0.55], [1, '#3a3a8a', 0]]));
    s += `<rect x="${n(g.cx - g.R)}" y="${n(g.top + 10)}" width="${n(g.R * 2)}" height="${n(g.eyeY - g.top - 6)}" fill="url(#${gl})"/>`;
    for (let i = 0; i < 5; i++) {
      const x = X(g, -0.5 + i * 0.25);
      s += `<path d="M${n(x)} ${n(g.top + 26)}V${n(g.eyeY - 14 - (i % 2) * 3)}" stroke="#2c2a6e" stroke-width="1" opacity=".55"/>`;
    }
  }
  if (c.mood === 'mind') {
    s += `<rect x="${n(g.cx - g.R)}" y="${n(g.top)}" width="${n(g.R * 2)}" height="${n(g.chinY - g.top)}" fill="#9b5cff" opacity=".12"/>`;
  }
  s += `</g>`;
  // blush
  const blushOn = c.mood === 'smile' || c.age === 'child' || (c.gender === 'f' && c.mood !== 'dead' && c.mood !== 'angry');
  if (blushOn && c.mood !== 'shadow') {
    const bid = mkId(c, 'bl');
    addDef(c, radGrad(bid, [[0, p.blush, 0.6], [1, p.blush, 0]]));
    const by = g.eyeY + g.eyeH * 0.62 + 3;
    for (const u of [-g.eyeU - 0.08, g.eyeU + 0.08]) {
      const x = X(g, u);
      s += `<ellipse cx="${n(x)}" cy="${n(by)}" rx="${n(7.5 * S(g, u))}" ry="3.6" fill="url(#${bid})"/>`;
      if (c.mood === 'smile' || c.age === 'child') {
        for (let i = -1; i <= 1; i++) {
          const hx = x + i * 2.6;
          s += `<path d="M${n(hx + 1)} ${n(by - 1.6)}l-1.6 3" stroke="${mix(p.blush, p.skinLine, 0.35)}" stroke-width=".8" stroke-linecap="round" opacity=".7"/>`;
        }
      }
    }
  }
  // outline (drawn over shading)
  s += useRef(c.faceId, `fill="none" stroke="${p.skinLine}" stroke-width="1.7" stroke-linejoin="round"`);
  s += drawNose(c);
  return s;
}

function drawNose(c: Ctx): string {
  const { g, p, f } = c;
  const nx = X(g, 0.1);
  const ny = g.noseY;
  const ln = p.skinLine;
  switch (f.noseKind) {
    case 'long': {
      // goblin: long pointed nose
      const d = `M${n(nx - 2.5)} ${n(ny - 9)}C${n(nx - 1)} ${n(ny - 3)} ${n(nx + 5)} ${n(ny + 1)} ${n(nx + 9)} ${n(ny + 4)}C${n(nx + 5)} ${n(ny + 5.5)} ${n(nx)} ${n(ny + 5)} ${n(nx - 3)} ${n(ny + 3)}`;
      return `<path d="${d}" fill="${p.skin}" stroke="${ln}" stroke-width="1.3" stroke-linejoin="round"/><path d="M${n(nx - 2)} ${n(ny + 2.6)}q2 1 4 .8" stroke="${ln}" stroke-width=".9" fill="none"/><path d="M${n(nx + 2)} ${n(ny + 3.8)}C${n(nx + 5)} ${n(ny + 4.6)} ${n(nx + 7)} ${n(ny + 4.4)} ${n(nx + 8.4)} ${n(ny + 4.1)}L${n(nx + 3)} ${n(ny + 5.2)}Z" fill="${p.skinSh}"/>`;
    }
    case 'broad': {
      const d = `M${n(nx - 7)} ${n(ny + 2)}Q${n(nx - 8)} ${n(ny - 3)} ${n(nx - 3)} ${n(ny - 3)}Q${n(nx)} ${n(ny - 9)} ${n(nx + 3)} ${n(ny - 3)}Q${n(nx + 8)} ${n(ny - 3)} ${n(nx + 7)} ${n(ny + 2)}Q${n(nx)} ${n(ny + 5)} ${n(nx - 7)} ${n(ny + 2)}Z`;
      return `<path d="${d}" fill="${p.skin}" stroke="${ln}" stroke-width="1.3"/><ellipse cx="${n(nx - 3)}" cy="${n(ny + 1)}" rx="1.6" ry="1.1" fill="${p.skinLine}"/><ellipse cx="${n(nx + 3)}" cy="${n(ny + 1)}" rx="1.6" ry="1.1" fill="${p.skinLine}"/>`;
    }
    case 'snout': {
      return `<path d="M${n(nx - 5)} ${n(ny)}Q${n(nx)} ${n(ny - 5)} ${n(nx + 5)} ${n(ny)}Q${n(nx)} ${n(ny + 4)} ${n(nx - 5)} ${n(ny)}Z" fill="${p.skinSh}" stroke="${ln}" stroke-width="1"/><path d="M${n(nx - 3)} ${n(ny)}l1.2 .6M${n(nx + 3)} ${n(ny)}l-1.2 .6" stroke="${ln}" stroke-width="1.1" stroke-linecap="round"/>`;
    }
    case 'hook': {
      const d = `M${n(nx - 1)} ${n(ny - 10)}Q${n(nx + 2)} ${n(ny - 4)} ${n(nx + 4)} ${n(ny + 1)}Q${n(nx + 3)} ${n(ny + 4)} ${n(nx - 1)} ${n(ny + 2)}`;
      return `<path d="${d}" fill="${p.skinSh}" stroke="${ln}" stroke-width="1.2" stroke-linecap="round"/>`;
    }
    default: {
      const big = c.gender === 'm' && c.age !== 'child' ? 1.25 : 1;
      let s = `<path d="M${n(nx + 0.4)} ${n(ny - 4.5 * big)}Q${n(nx + 2.6 * big)} ${n(ny + 0.2)} ${n(nx - 0.6)} ${n(ny + 1.3)}" stroke="${ln}" stroke-width="1.15" fill="none" stroke-linecap="round" opacity=".8"/>`;
      s += `<path d="M${n(nx + 0.6)} ${n(ny - 3)}Q${n(nx + 2.2)} ${n(ny)} ${n(nx)} ${n(ny + 1)}L${n(nx + 1.2)} ${n(ny + 1)}Z" fill="${p.skinSh}" opacity=".8"/>`;
      if (c.gender === 'm' && c.age !== 'child') {
        s += `<path d="M${n(nx - 3.5)} ${n(ny + 1.2)}q1 .8 2.2 .4" stroke="${ln}" stroke-width=".8" fill="none" opacity=".6"/>`;
      }
      return s;
    }
  }
}

// ---------------------------------------------------------------------------
// Ears (drawn before the face so the face covers their root)
// ---------------------------------------------------------------------------

export function drawEars(c: Ctx): string {
  const { f } = c;
  if (f.ears === 'none') return '';
  return drawEar(c, -1) + drawEar(c, 1);
}

function drawEar(c: Ctx, side: -1 | 1): string {
  const { g, p, f } = c;
  const bx = side < 0 ? g.cx - g.R + 2.5 : g.cx + g.R - 2.5;
  const k = side < 0 ? 1.06 : 0.9; // far ear slightly foreshortened
  const s = side * k;
  const ey = g.earY;
  const ln = p.skinLine;
  const P = (dx: number, dy: number) => `${n(bx + dx * s)} ${n(ey + dy)}`;
  let out = '';
  switch (f.ears) {
    case 'elf': {
      const d = `M${P(0, -7)}C${P(6, -10)} ${P(16, -22)} ${P(24, -30)}C${P(20, -18)} ${P(14, 6)} ${P(1, 12)}Z`;
      const inner = `M${P(3, -3)}C${P(8, -7)} ${P(14, -16)} ${P(19, -24)}C${P(14, -12)} ${P(10, 2)} ${P(3, 6)}Z`;
      out += `<path d="${d}" fill="${p.skin}" stroke="${ln}" stroke-width="1.5" stroke-linejoin="round"/>`;
      out += `<path d="${inner}" fill="${p.skinSh}"/>`;
      if (f.earrings) out += `<circle cx="${n(bx + 3 * s)}" cy="${n(ey + 12.5)}" r="2.2" fill="none" stroke="${p.trim}" stroke-width="1.2"/>`;
      break;
    }
    case 'goblin': {
      const d = `M${P(0, -9)}C${P(10, -14)} ${P(26, -16)} ${P(38, -20)}C${P(33, -10)} ${P(26, 4)} ${P(16, 10)}C${P(10, 14)} ${P(4, 14)} ${P(0, 12)}Z`;
      const inner = `M${P(3, -4)}C${P(12, -9)} ${P(24, -12)} ${P(32, -16)}C${P(27, -8)} ${P(21, 3)} ${P(13, 6)}C${P(8, 8)} ${P(5, 8)} ${P(3, 6)}Z`;
      out += `<path d="${d}" fill="${p.skin}" stroke="${ln}" stroke-width="1.5" stroke-linejoin="round"/>`;
      out += `<path d="${inner}" fill="${mix(p.skinSh, '#c46a6a', 0.25)}"/>`;
      out += `<path d="M${P(14, -2)}q6 -3 12 -9" stroke="${ln}" stroke-width=".9" fill="none" opacity=".6"/>`;
      if (f.earrings) {
        out += `<circle cx="${n(bx + 15 * s)}" cy="${n(ey + 11)}" r="3" fill="none" stroke="${p.trim}" stroke-width="1.5"/>`;
        out += `<circle cx="${n(bx + 23 * s)}" cy="${n(ey + 5.5)}" r="2.4" fill="none" stroke="${p.trim}" stroke-width="1.3"/>`;
        out += `<circle cx="${n(bx + 30 * s)}" cy="${n(ey - 4)}" r="2" fill="none" stroke="${p.trim}" stroke-width="1.2"/>`;
      }
      break;
    }
    case 'troll': {
      const d = `M${P(0, -6)}C${P(8, -8)} ${P(16, -12)} ${P(24, -16)}C${P(19, -6)} ${P(11, 6)} ${P(1, 10)}Z`;
      out += `<path d="${d}" fill="${p.skin}" stroke="${ln}" stroke-width="1.5" stroke-linejoin="round"/>`;
      out += `<path d="M${P(3, -2)}C${P(9, -5)} ${P(14, -8)} ${P(19, -12)}C${P(14, -4)} ${P(9, 3)} ${P(3, 5)}Z" fill="${p.skinSh}"/>`;
      if (f.earrings) out += `<circle cx="${n(bx + 6 * s)}" cy="${n(ey + 8)}" r="2.6" fill="none" stroke="${p.trim}" stroke-width="1.3"/>`;
      break;
    }
    case 'fin': {
      const fin = mix(p.accent, '#bff6ff', 0.35);
      const d = `M${P(0, -8)}C${P(8, -14)} ${P(14, -22)} ${P(18, -24)}Q${P(17, -16)} ${P(22, -14)}Q${P(18, -8)} ${P(23, -4)}Q${P(17, 0)} ${P(20, 6)}Q${P(12, 7)} ${P(1, 12)}Z`;
      out += `<path d="${d}" fill="${fin}" fill-opacity=".85" stroke="${shadowOf(p.accent, 0.3)}" stroke-width="1.3" stroke-linejoin="round"/>`;
      out += `<path d="M${P(2, -2)}L${P(17, -21)}M${P(2, 1)}L${P(20, -12)}M${P(2, 4)}L${P(20, -3)}M${P(2, 7)}L${P(17, 5)}" stroke="${shadowOf(p.accent, 0.22)}" stroke-width=".9" opacity=".8"/>`;
      break;
    }
    default: {
      const d = `M${P(0, -7)}C${P(6, -10)} ${P(9, -3)} ${P(8, 2)}C${P(7, 8)} ${P(4, 12)} ${P(0, 10)}Z`;
      out += `<path d="${d}" fill="${p.skin}" stroke="${ln}" stroke-width="1.4" stroke-linejoin="round"/>`;
      out += `<path d="M${P(2, -4)}C${P(5.5, -5)} ${P(6, 1)} ${P(3, 4)}" stroke="${ln}" stroke-width=".9" fill="none" opacity=".7"/>`;
      if (f.earrings) out += `<circle cx="${n(bx + 3 * s)}" cy="${n(ey + 12.5)}" r="2.1" fill="none" stroke="${p.trim}" stroke-width="1.2"/>`;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Eyes
// ---------------------------------------------------------------------------

interface EyeP {
  k1: number;
  k2: number;
  m1: number;
  m2: number;
  tilt: number;
  iris: number;
  pupil: number;
  hl: number;
  gazeX: number;
  gazeY: number;
  closed: 'none' | 'squeeze' | 'arc' | 'x';
}

const EYE_MOOD: Record<PortraitMood, Partial<EyeP>> = {
  neutral: {},
  smile: { m1: -0.18, m2: -0.06, k1: 0.84, k2: 0.9 },
  smug: { k1: 0.28, k2: 0.36, m1: 0.52, m2: 0.46, gazeX: 0.1 },
  angry: { k1: 0.08, k2: 0.66, pupil: 0.72, iris: 0.9 },
  scared: { k1: 0.98, k2: 0.98, m1: 0.7, m2: 0.64, iris: 0.6, pupil: 0.42, hl: 1 },
  sad: { k1: 0.84, k2: 0.3, m1: 0.5, m2: 0.52, gazeY: 0.06 },
  surprised: { k1: 1.06, k2: 1.06, m1: 0.74, m2: 0.68, iris: 0.7, pupil: 0.55 },
  mind: { k1: 0.72, k2: 0.78 },
  dead: { closed: 'x' },
  shadow: {},
  hurt: { k1: 0.34, k2: 0.6 },
  determined: { k1: 0.44, k2: 0.6, pupil: 0.9 },
};

function eyeParams(c: Ctx, side: -1 | 1): EyeP {
  const e: EyeP = { k1: 0.78, k2: 0.86, m1: 0.56, m2: 0.5, tilt: -0.04, iris: 1, pupil: 1, hl: 2, gazeX: 0.06, gazeY: 0, closed: 'none' };
  switch (c.f.eyeShape) {
    case 'round':
      e.k1 += 0.06;
      e.k2 += 0.04;
      e.m1 += 0.04;
      break;
    case 'sharp':
      e.tilt = -0.2;
      e.k1 -= 0.14;
      e.k2 -= 0.08;
      e.m1 -= 0.12;
      e.m2 -= 0.08;
      break;
    case 'gentle':
      e.tilt = 0.06;
      e.k2 -= 0.12;
      e.m1 += 0.02;
      break;
    case 'cat':
      e.tilt = -0.26;
      e.k1 -= 0.06;
      e.m1 -= 0.06;
      break;
  }
  const m = EYE_MOOD[c.mood];
  const lidMoods = c.mood === 'smug' || c.mood === 'angry' || c.mood === 'sad' || c.mood === 'determined' || c.mood === 'hurt';
  if (lidMoods) {
    // mood lid shapes override the base upper lid but keep the eye-shape flavour
    const dk = c.f.eyeShape === 'sharp' ? -0.04 : 0;
    e.k1 = (m.k1 ?? e.k1) + dk;
    e.k2 = (m.k2 ?? e.k2) + dk;
  } else {
    if (m.k1 !== undefined) e.k1 = m.k1 + (e.k1 - 0.78) * 0.5;
    if (m.k2 !== undefined) e.k2 = m.k2 + (e.k2 - 0.86) * 0.5;
  }
  if (m.m1 !== undefined) e.m1 = m.m1;
  if (m.m2 !== undefined) e.m2 = m.m2;
  if (m.iris !== undefined) e.iris = m.iris;
  if (m.pupil !== undefined) e.pupil = m.pupil;
  if (m.hl !== undefined) e.hl = m.hl;
  if (m.gazeX !== undefined) e.gazeX = m.gazeX;
  if (m.gazeY !== undefined) e.gazeY = m.gazeY;
  if (m.closed) e.closed = m.closed;
  if (c.mood === 'hurt' && side < 0) e.closed = 'squeeze';
  if (c.mood === 'smug' && side > 0) {
    e.k1 += 0.1;
    e.k2 += 0.08;
  }
  if (c.f.tired && c.mood !== 'surprised' && c.mood !== 'scared') {
    e.k1 -= 0.22;
    e.k2 -= 0.26;
  }
  e.iris *= c.f.irisBoost;
  if (c.age === 'child') {
    e.iris *= 1.04;
  }
  return e;
}

export function drawEyes(c: Ctx): string {
  if (c.mood === 'shadow') return shadowEyes(c);
  return drawEye(c, -1) + drawEye(c, 1);
}

function irisGradient(c: Ctx, color: string, key: string): string {
  const id = mkId(c, key);
  const dark = shadowOf(color, 0.3);
  const light = lightOf(color, 0.2);
  addDef(c, linGrad(id, [[0, mix(dark, '#0b0612', 0.35)], [0.42, dark], [0.72, color], [1, light]]));
  return id;
}

function drawEye(c: Ctx, side: -1 | 1): string {
  const { g, p, f } = c;
  const u = side * g.eyeU;
  const sc = S(g, u);
  const ex = X(g, u);
  const ey = g.eyeY;
  const w = g.eyeW * sc;
  const h = g.eyeH;
  const d = side;
  const e = eyeParams(c, side);
  const lash = mix(p.hairLine, '#140a14', 0.55);
  const lw = (c.gender === 'f' ? 3.3 : c.gender === 'x' ? 2.9 : 2.5) * (c.age === 'child' ? 0.95 : 1) + f.lashBoost;
  const I: Pt = { x: ex - d * w * 0.5, y: ey + h * 0.12 };
  const O: Pt = { x: ex + d * w * 0.5, y: ey + h * e.tilt };

  if (e.closed === 'x') {
    const r = Math.min(w, h) * 0.42;
    const cy = ey + h * 0.04;
    return `<path d="M${n(ex - r)} ${n(cy - r)}L${n(ex + r)} ${n(cy + r)}M${n(ex + r)} ${n(cy - r)}L${n(ex - r)} ${n(cy + r)}" stroke="${lash}" stroke-width="2.6" stroke-linecap="round"/>`;
  }
  if (e.closed === 'squeeze') {
    const tipX = I.x + d * w * 0.1;
    return (
      `<path d="M${n(O.x - d * w * 0.05)} ${n(ey - h * 0.34)}L${n(tipX)} ${n(ey + h * 0.04)}L${n(O.x - d * w * 0.05)} ${n(ey + h * 0.36)}" stroke="${lash}" stroke-width="2.3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>` +
      `<path d="M${n(O.x + d * 3)} ${n(ey - h * 0.1)}l${n(d * 3)} -1.5M${n(O.x + d * 3)} ${n(ey + h * 0.2)}l${n(d * 3)} 1" stroke="${lash}" stroke-width=".9" stroke-linecap="round" opacity=".7"/>`
    );
  }

  const u1: Pt = { x: I.x + d * w * 0.1, y: I.y - h * e.k1 };
  const u2: Pt = { x: O.x - d * w * 0.28, y: O.y - h * e.k2 };
  const l1: Pt = { x: O.x - d * w * 0.1, y: O.y + h * e.m1 };
  const l2: Pt = { x: I.x + d * w * 0.3, y: I.y + h * e.m2 };
  const upperD = `M${n(I.x)} ${n(I.y)}C${n(u1.x)} ${n(u1.y)} ${n(u2.x)} ${n(u2.y)} ${n(O.x)} ${n(O.y)}`;
  const scleraD = `${upperD}C${n(l1.x)} ${n(l1.y)} ${n(l2.x)} ${n(l2.y)} ${n(I.x)} ${n(I.y)}Z`;
  const clip = mkId(c, side < 0 ? 'eL' : 'eR');
  addDef(c, `<clipPath id="${clip}"><path d="${scleraD}"/></clipPath>`);

  const irisCol = side > 0 && p.eye2 ? p.eye2 : p.eye;
  const icx = ex + d * w * 0.02 + e.gazeX * w;
  const icy = ey + h * (0.07 + e.gazeY);
  const rx = w * 0.345 * e.iris;
  const ry = h * 0.5 * e.iris;
  let s = '';
  const glowing = f.eyeKind === 'glow';
  // outer glow behind eye for ring / glowing eyes
  if (f.eyeKind === 'ring' || f.glowEyes || glowing || c.mood === 'mind') {
    const gid = mkId(c, 'eg');
    const gc = c.mood === 'mind' ? '#b56cff' : glowing ? p.glow : f.glowEyes ? irisCol : p.glow;
    if (!c.defs.some((x) => x.includes(`id="${gid}"`))) addDef(c, radGrad(gid, [[0, gc, 0.55], [0.5, gc, 0.18], [1, gc, 0]]));
    s += `<ellipse cx="${n(ex)}" cy="${n(ey)}" rx="${n(w * (glowing ? 1.25 : 0.95))}" ry="${n(h * (glowing ? 1.05 : 0.85))}" fill="url(#${gid})"/>`;
  }
  s += `<path d="${scleraD}" fill="${glowing ? '#f6efff' : '#fffaf3'}"/>`;
  s += `<g clip-path="url(#${clip})">`;
  if (glowing) {
    const gg = mkId(c, 'gw');
    addDef(c, radGrad(gg, [[0, '#ffffff'], [0.45, '#efe2ff'], [1, p.glow]]));
    s += `<ellipse cx="${n(ex)}" cy="${n(ey)}" rx="${n(w * 0.6)}" ry="${n(h * 0.62)}" fill="url(#${gg})"/>`;
    s += `<ellipse cx="${n(icx)}" cy="${n(icy)}" rx="${n(rx * 0.62)}" ry="${n(ry * 0.62)}" fill="none" stroke="#ffffff" stroke-width="1.4" opacity=".9"/>`;
  } else if (c.mood === 'mind') {
    const sg = irisGradient(c, '#a24cff', 'ms');
    s += `<ellipse cx="${n(icx)}" cy="${n(icy)}" rx="${n(rx * 1.05)}" ry="${n(ry * 1.02)}" fill="url(#${sg})"/>`;
    s += `<path d="${spiral(icx, icy + 0.5, Math.min(rx, ry) * 0.95, 3.1, d)}" fill="none" stroke="#ffd1ff" stroke-width="1.05" stroke-linecap="round"/>`;
    s += `<circle cx="${n(icx)}" cy="${n(icy + 0.5)}" r="1.1" fill="#ffe6ff"/>`;
  } else {
    const ig = irisGradient(c, irisCol, side > 0 && p.eye2 !== p.eye ? 'i2' : 'ig');
    const dark = mix(shadowOf(irisCol, 0.38), '#07030c', 0.45);
    s += `<ellipse cx="${n(icx)}" cy="${n(icy)}" rx="${n(rx)}" ry="${n(ry)}" fill="url(#${ig})"/>`;
    // lower luminous crescent
    s += `<ellipse cx="${n(icx)}" cy="${n(icy + ry * 0.52)}" rx="${n(rx * 0.7)}" ry="${n(ry * 0.34)}" fill="${lightOf(irisCol, 0.28)}" opacity=".55"/>`;
    if (f.eyeKind === 'slit') {
      s += `<ellipse cx="${n(icx)}" cy="${n(icy + ry * 0.05)}" rx="${n(rx * 0.17)}" ry="${n(ry * 0.78)}" fill="${dark}"/>`;
    } else {
      s += `<ellipse cx="${n(icx)}" cy="${n(icy + ry * 0.1)}" rx="${n(rx * 0.5 * e.pupil)}" ry="${n(ry * 0.52 * e.pupil)}" fill="${dark}"/>`;
    }
    s += `<ellipse cx="${n(icx)}" cy="${n(icy)}" rx="${n(rx)}" ry="${n(ry)}" fill="none" stroke="${dark}" stroke-width=".9"/>`;
    if (f.eyeKind === 'ring') {
      s += `<ellipse cx="${n(icx)}" cy="${n(icy + ry * 0.08)}" rx="${n(rx * 0.72)}" ry="${n(ry * 0.72)}" fill="none" stroke="${p.glow}" stroke-width="1.3"/>`;
      s += `<ellipse cx="${n(icx)}" cy="${n(icy + ry * 0.08)}" rx="${n(rx * 0.72)}" ry="${n(ry * 0.72)}" fill="none" stroke="#f1e4ff" stroke-width=".45"/>`;
    }
    if (f.glowEyes) {
      s += `<ellipse cx="${n(icx)}" cy="${n(icy)}" rx="${n(rx * 0.8)}" ry="${n(ry * 0.8)}" fill="${lightOf(irisCol, 0.35)}" opacity=".45"/>`;
    }
  }
  // lid shadow over the top of the eyeball
  s += `<path d="${upperD}" fill="none" stroke="${mix(lash, p.skinSh, 0.35)}" stroke-width="${n(h * 0.42)}" opacity="${glowing ? 0.12 : 0.3}"/>`;
  // highlights
  if (!glowing && c.mood !== 'dead') {
    if (e.hl >= 1) {
      const big = c.mood === 'scared' ? 0.55 : 1;
      s += `<ellipse cx="${n(icx - rx * 0.34)}" cy="${n(icy - ry * 0.38)}" rx="${n(w * 0.1 * big)}" ry="${n(h * 0.13 * big)}" transform="rotate(-18 ${n(icx - rx * 0.34)} ${n(icy - ry * 0.38)})" fill="#fff"/>`;
    }
    if (e.hl >= 2) s += `<circle cx="${n(icx + rx * 0.38)}" cy="${n(icy + ry * 0.34)}" r="${n(w * 0.045)}" fill="#fff" opacity=".9"/>`;
  }
  s += `</g>`;
  // upper lash band
  const t = lw;
  const flickX = O.x + d * w * (f.eyeShape === 'cat' ? 0.22 : 0.15);
  const lashD =
    `M${n(I.x - d * 0.6)} ${n(I.y + 0.4)}C${n(u1.x)} ${n(u1.y)} ${n(u2.x)} ${n(u2.y)} ${n(O.x)} ${n(O.y)}` +
    `L${n(flickX)} ${n(O.y + h * 0.04)}` +
    `Q${n(O.x + d * w * 0.06)} ${n(O.y - t * 0.9)} ${n(O.x - d * w * 0.08)} ${n(O.y - t * 1.05)}` +
    `C${n(u2.x)} ${n(u2.y - t * 1.2)} ${n(u1.x)} ${n(u1.y - t * 0.7)} ${n(I.x - d * 0.9)} ${n(I.y - t * 0.25)}Z`;
  s += `<path d="${lashD}" fill="${lash}"/>`;
  if (c.gender === 'f' || f.lashBoost > 0.3) {
    const bx = O.x - d * w * 0.06;
    const by = O.y - t * 1.05;
    s += `<path d="M${n(bx)} ${n(by + 0.4)}L${n(bx + d * w * 0.2)} ${n(by - h * 0.18)}L${n(bx - d * w * 0.06)} ${n(by - 0.6)}Z" fill="${lash}"/>`;
    const b2x = O.x - d * w * 0.25;
    const b2y = O.y - h * e.k2 * 0.72 - t;
    s += `<path d="M${n(b2x)} ${n(b2y + 0.8)}L${n(b2x + d * w * 0.14)} ${n(b2y - h * 0.16)}L${n(b2x - d * w * 0.06)} ${n(b2y)}Z" fill="${lash}"/>`;
  }
  // crease
  const crY = Math.min(u1.y, u2.y) - t - 2.2;
  if (c.mood !== 'angry' && e.k1 > 0.4) {
    s += `<path d="M${n(ex - d * w * 0.18)} ${n(crY + 1.2)}Q${n(ex + d * w * 0.12)} ${n(crY - 0.6)} ${n(O.x - d * w * 0.02)} ${n(O.y - h * e.k2 * 0.62 - t - 1.4)}" stroke="${lash}" stroke-width=".8" fill="none" opacity=".45" stroke-linecap="round"/>`;
  }
  // lower lash line (outer half)
  const [q0, q1, q2, q3] = cubicHead(O, l1, l2, I, 0.55);
  s += `<path d="M${n(q0.x - d * 0.4)} ${n(q0.y + 0.8)}C${n(q1.x)} ${n(q1.y)} ${n(q2.x)} ${n(q2.y)} ${n(q3.x)} ${n(q3.y)}" stroke="${lash}" stroke-width="1.05" fill="none" stroke-linecap="round" opacity=".85"/>`;
  if (c.age === 'old' || (c.age === 'adult' && c.gender === 'm' && c.rng.fork('bags').chance(0.3))) {
    s += `<path d="M${n(ex - d * w * 0.3)} ${n(ey + h * 0.66)}Q${n(ex)} ${n(ey + h * 0.82)} ${n(ex + d * w * 0.35)} ${n(ey + h * 0.58)}" stroke="${p.skinLine}" stroke-width=".7" fill="none" opacity=".45"/>`;
  }
  return s;
}

function spiral(cx: number, cy: number, r: number, turns: number, dir: number): string {
  const pts: string[] = [];
  const steps = Math.round(turns * 18);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = dir * t * turns * Math.PI * 2;
    const rr = r * t;
    pts.push(`${n(cx + Math.cos(a) * rr)} ${n(cy + Math.sin(a) * rr)}`);
  }
  return `M${pts.join('L')}`;
}

function shadowEyes(c: Ctx): string {
  const { g, p } = c;
  const col = p.glow;
  const gid = mkId(c, 'sg');
  addDef(c, radGrad(gid, [[0, col, 0.8], [0.35, col, 0.3], [1, col, 0]]));
  let s = '';
  for (const side of [-1, 1] as const) {
    const u = side * g.eyeU;
    const ex = X(g, u);
    const ey = g.eyeY + 1;
    const w = g.eyeW * S(g, u) * 0.95;
    const d = side;
    s += `<ellipse cx="${n(ex)}" cy="${n(ey)}" rx="${n(w * 1.1)}" ry="${n(w * 0.55)}" fill="url(#${gid})"/>`;
    const inner = ex - d * w * 0.5;
    const outer = ex + d * w * 0.5;
    s += `<path d="M${n(inner)} ${n(ey + 1.5)}Q${n(ex)} ${n(ey - 4.2)} ${n(outer)} ${n(ey - 3)}Q${n(ex)} ${n(ey + 1.8)} ${n(inner)} ${n(ey + 1.5)}Z" fill="${mix(col, '#ffffff', 0.55)}"/>`;
  }
  return s;
}

// ---------------------------------------------------------------------------
// Brows
// ---------------------------------------------------------------------------

const BROW_MOOD: Record<PortraitMood, [number, number, number]> = {
  neutral: [0, 0, 1],
  smile: [-1.6, -0.6, 1.3],
  smug: [0.6, 0.4, 0.7],
  angry: [5.2, -2.6, 0.1],
  scared: [-5.2, 1.4, -0.4],
  sad: [-4.2, 2.2, -0.1],
  surprised: [-6.2, -5, 1.6],
  mind: [-1.5, -1, 1],
  dead: [-1, 1.5, 0.4],
  shadow: [3.5, -1.5, 0.3],
  hurt: [-3.4, 2.2, -0.2],
  determined: [3.2, -1.2, 0.4],
};

export function drawBrows(c: Ctx): string {
  const { g, p, f } = c;
  if (c.mood === 'shadow') return '';
  const [di, dout, arch] = BROW_MOOD[c.mood];
  const col = mix(p.hairLine, p.hair, 0.28);
  const thick = (c.gender === 'm' ? 2.5 : 1.7) * (c.race === 'ogro' || c.race === 'gigante' || c.race === 'enano' ? 1.6 : 1);
  let s = '';
  for (const side of [-1, 1] as const) {
    const u = side * g.eyeU;
    const ex = X(g, u);
    const w = g.eyeW * S(g, u);
    const d = side;
    const by = g.eyeY - g.browGap - (c.f.eyeShape === 'sharp' ? 0 : 0.5);
    let inner = di;
    let outer = dout;
    if (c.mood === 'smug' && side > 0) {
      inner -= 3;
      outer -= 3.5;
    }
    if (f.eyeShape === 'sharp' || f.eyeShape === 'cat') outer -= 1.2;
    const ix = ex - d * w * 0.42;
    const iy = by + inner;
    const ox = ex + d * w * 0.66;
    const oy = by + outer + 1.2;
    const mx = (ix + ox) / 2 + d * w * 0.06;
    const my = (iy + oy) / 2 - 2.4 * arch;
    s += `<path d="M${n(ix)} ${n(iy)}Q${n(mx)} ${n(my - thick * 0.3)} ${n(ox)} ${n(oy)}Q${n(mx)} ${n(my + thick * 0.75)} ${n(ix + d * 0.3)} ${n(iy + thick)}Z" fill="${col}" stroke="${col}" stroke-width=".5" stroke-linejoin="round"/>`;
  }
  if (c.race === 'gigante' || c.race === 'ogro') {
    // heavy brow ridge shadow
    s += `<path d="M${n(X(c.g, -0.85))} ${n(g.eyeY - g.browGap + 3)}Q${n(X(c.g, 0))} ${n(g.eyeY - g.browGap - 3)} ${n(X(c.g, 0.85))} ${n(g.eyeY - g.browGap + 3)}" stroke="${p.skinSh2}" stroke-width="3" fill="none" opacity=".35"/>`;
  }
  return s;
}

// ---------------------------------------------------------------------------
// Mouth
// ---------------------------------------------------------------------------

export function drawMouth(c: Ctx): string {
  const { g, p, f } = c;
  if (c.mood === 'shadow' || f.mask) return '';
  const mx = X(g, 0.05);
  const my = g.mouthY;
  const w = g.mouthW;
  const ln = p.skinLine;
  const dark = p.mouth;
  const teethSharp = c.race === 'duende' || c.race === 'trol';
  let s = '';
  const mood = c.mood;
  if (c.race === 'duende' && (mood === 'neutral' || mood === 'smile' || mood === 'smug' || mood === 'determined')) {
    // signature toothy goblin grin
    const up = mood === 'smug' ? 2.5 : 0;
    const d = `M${n(mx - w * 0.62)} ${n(my - 2)}Q${n(mx)} ${n(my + 2.5)} ${n(mx + w * 0.62)} ${n(my - 3 - up)}Q${n(mx + w * 0.1)} ${n(my + 9)} ${n(mx - w * 0.62)} ${n(my - 2)}Z`;
    s += `<path d="${d}" fill="${dark}" stroke="${ln}" stroke-width="1.3" stroke-linejoin="round"/>`;
    // teeth zigzag along the upper edge
    let tz = `M${n(mx - w * 0.52)} ${n(my - 1.2)}`;
    const k = 6;
    for (let i = 0; i < k; i++) {
      const t0 = (i + 0.5) / k;
      const t1 = (i + 1) / k;
      const x0 = mx - w * 0.52 + w * 1.04 * t0;
      const x1 = mx - w * 0.52 + w * 1.04 * t1;
      const yb = my - 1.2 + 3 * Math.sin(Math.PI * t0) - up * t0;
      tz += `L${n(x0)} ${n(yb + 3)}L${n(x1)} ${n(my - 1.2 + 3 * Math.sin(Math.PI * t1) - up * t1)}`;
    }
    tz += `Q${n(mx)} ${n(my + 0.8)} ${n(mx - w * 0.52)} ${n(my - 1.2)}Z`;
    s += `<path d="${tz}" fill="#fff8e6"/>`;
    if (f.goldTooth) {
      const gx = mx + w * 0.18;
      s += `<path d="M${n(gx - 1.6)} ${n(my + 0.6)}L${n(gx + 1.8)} ${n(my + 0.2)}L${n(gx + 0.2)} ${n(my + 3.6)}Z" fill="#ffd34d" stroke="#a8701a" stroke-width=".5"/>`;
      s += `<circle cx="${n(gx + 0.2)}" cy="${n(my + 1.2)}" r=".5" fill="#fff"/>`;
    }
    return s;
  }
  switch (mood) {
    case 'smile': {
      if (c.gender === 'm' && c.age !== 'child' && !teethSharp) {
        s += `<path d="M${n(mx - w * 0.55)} ${n(my - 1.4)}Q${n(mx)} ${n(my + 3.4)} ${n(mx + w * 0.55)} ${n(my - 1.8)}" stroke="${ln}" stroke-width="1.35" fill="none" stroke-linecap="round"/>`;
        s += `<path d="M${n(mx - 2)} ${n(my + 3.8)}q2 .8 4 0" stroke="${ln}" stroke-width=".7" fill="none" opacity=".4"/>`;
      } else {
        const d = `M${n(mx - w * 0.55)} ${n(my - 1.2)}Q${n(mx)} ${n(my + 0.6)} ${n(mx + w * 0.55)} ${n(my - 1.6)}Q${n(mx + w * 0.3)} ${n(my + 6.5)} ${n(mx)} ${n(my + 6.4)}Q${n(mx - w * 0.32)} ${n(my + 6.2)} ${n(mx - w * 0.55)} ${n(my - 1.2)}Z`;
        s += `<path d="${d}" fill="${dark}" stroke="${ln}" stroke-width="1.2" stroke-linejoin="round"/>`;
        s += `<path d="M${n(mx - w * 0.28)} ${n(my + 5)}Q${n(mx)} ${n(my + 2.2)} ${n(mx + w * 0.28)} ${n(my + 4.8)}Q${n(mx)} ${n(my + 6.3)} ${n(mx - w * 0.28)} ${n(my + 5)}Z" fill="#e0707e"/>`;
        s += `<path d="M${n(mx - w * 0.44)} ${n(my - 0.6)}Q${n(mx)} ${n(my + 1.3)} ${n(mx + w * 0.44)} ${n(my - 0.9)}L${n(mx + w * 0.36)} ${n(my + 0.9)}Q${n(mx)} ${n(my + 2.4)} ${n(mx - w * 0.38)} ${n(my + 1.1)}Z" fill="#fff"/>`;
      }
      break;
    }
    case 'smug': {
      s += `<path d="M${n(mx - w * 0.45)} ${n(my + 0.4)}Q${n(mx + w * 0.08)} ${n(my + 1.8)} ${n(mx + w * 0.56)} ${n(my - 2.4)}" stroke="${ln}" stroke-width="1.35" fill="none" stroke-linecap="round"/>`;
      s += `<path d="M${n(mx + w * 0.5)} ${n(my - 3.6)}q1.4 .9 1 2.4" stroke="${ln}" stroke-width=".8" fill="none" opacity=".7"/>`;
      break;
    }
    case 'angry': {
      const d = `M${n(mx - w * 0.58)} ${n(my + 1.4)}Q${n(mx)} ${n(my - 2.6)} ${n(mx + w * 0.58)} ${n(my + 1.4)}L${n(mx + w * 0.5)} ${n(my + 4.6)}Q${n(mx)} ${n(my + 2.8)} ${n(mx - w * 0.5)} ${n(my + 4.6)}Z`;
      s += `<path d="${d}" fill="#fffaf0" stroke="${ln}" stroke-width="1.25" stroke-linejoin="round"/>`;
      s += `<path d="M${n(mx - w * 0.52)} ${n(my + 2.6)}Q${n(mx)} ${n(my + 0.2)} ${n(mx + w * 0.52)} ${n(my + 2.6)}" stroke="${ln}" stroke-width=".7" fill="none"/>`;
      for (const k of [-0.25, 0, 0.25]) s += `<path d="M${n(mx + w * k)} ${n(my - 0.6)}V${n(my + 3.6)}" stroke="${ln}" stroke-width=".55"/>`;
      if (teethSharp) s += `<path d="M${n(mx - w * 0.35)} ${n(my - 0.6)}l1.2 3l1.2 -3M${n(mx + w * 0.25)} ${n(my - 0.6)}l1.2 3l1.2 -3" fill="#fff" stroke="${ln}" stroke-width=".5"/>`;
      break;
    }
    case 'scared': {
      s += `<path d="M${n(mx - w * 0.42)} ${n(my + 1.6)}Q${n(mx - w * 0.22)} ${n(my - 1.4)} ${n(mx)} ${n(my + 0.6)}Q${n(mx + w * 0.22)} ${n(my + 2.4)} ${n(mx + w * 0.42)} ${n(my - 0.2)}Q${n(mx + w * 0.1)} ${n(my + 5)} ${n(mx - w * 0.42)} ${n(my + 1.6)}Z" fill="${dark}" stroke="${ln}" stroke-width="1.1" stroke-linejoin="round"/>`;
      break;
    }
    case 'sad': {
      s += `<path d="M${n(mx - w * 0.42)} ${n(my + 2)}Q${n(mx)} ${n(my - 1.8)} ${n(mx + w * 0.42)} ${n(my + 1.6)}" stroke="${ln}" stroke-width="1.3" fill="none" stroke-linecap="round"/>`;
      break;
    }
    case 'surprised': {
      s += `<ellipse cx="${n(mx)}" cy="${n(my + 1.8)}" rx="${n(w * 0.22)}" ry="3.2" fill="${dark}" stroke="${ln}" stroke-width="1.2"/>`;
      s += `<ellipse cx="${n(mx)}" cy="${n(my + 3.4)}" rx="${n(w * 0.12)}" ry="1.1" fill="#d86a78"/>`;
      break;
    }
    case 'mind': {
      s += `<path d="M${n(mx - w * 0.3)} ${n(my + 0.8)}Q${n(mx)} ${n(my + 3.4)} ${n(mx + w * 0.3)} ${n(my + 0.6)}Q${n(mx)} ${n(my + 1.6)} ${n(mx - w * 0.3)} ${n(my + 0.8)}Z" fill="${dark}" stroke="${ln}" stroke-width="1" opacity=".85"/>`;
      break;
    }
    case 'dead': {
      s += `<path d="M${n(mx - w * 0.36)} ${n(my)}Q${n(mx)} ${n(my - 1.4)} ${n(mx + w * 0.4)} ${n(my + 0.4)}Q${n(mx + w * 0.2)} ${n(my + 6)} ${n(mx - w * 0.04)} ${n(my + 5.6)}Q${n(mx - w * 0.34)} ${n(my + 5)} ${n(mx - w * 0.36)} ${n(my)}Z" fill="${dark}" stroke="${ln}" stroke-width="1.2"/>`;
      s += `<path d="M${n(mx + w * 0.02)} ${n(my + 3)}q1.6 4.6 3.6 3.4q1.2 -1.4 -.4 -3.6Z" fill="#df7d8a" stroke="${ln}" stroke-width=".6"/>`;
      break;
    }
    case 'hurt': {
      const d = `M${n(mx - w * 0.52)} ${n(my + 2.2)}L${n(mx + w * 0.55)} ${n(my - 0.4)}L${n(mx + w * 0.5)} ${n(my + 3.2)}L${n(mx - w * 0.46)} ${n(my + 4.8)}Z`;
      s += `<path d="${d}" fill="#fffaf0" stroke="${ln}" stroke-width="1.2" stroke-linejoin="round"/>`;
      s += `<path d="M${n(mx - w * 0.48)} ${n(my + 3.4)}L${n(mx + w * 0.52)} ${n(my + 1.4)}" stroke="${ln}" stroke-width=".6"/>`;
      s += `<path d="M${n(mx - w * 0.15)} ${n(my + 1.2)}v3M${n(mx + w * 0.2)} ${n(my + 0.6)}v3" stroke="${ln}" stroke-width=".5"/>`;
      break;
    }
    case 'determined': {
      s += `<path d="M${n(mx - w * 0.5)} ${n(my + 0.6)}Q${n(mx)} ${n(my - 0.6)} ${n(mx + w * 0.5)} ${n(my + 0.8)}" stroke="${ln}" stroke-width="1.45" fill="none" stroke-linecap="round"/>`;
      s += `<path d="M${n(mx - 2)} ${n(my + 3.4)}q2 .6 4 0" stroke="${ln}" stroke-width=".7" fill="none" opacity=".4"/>`;
      break;
    }
    default: {
      if (f.smirk) {
        s += `<path d="M${n(mx - w * 0.4)} ${n(my + 0.6)}Q${n(mx + w * 0.1)} ${n(my + 1.4)} ${n(mx + w * 0.5)} ${n(my - 1.4)}" stroke="${ln}" stroke-width="1.3" fill="none" stroke-linecap="round"/>`;
        break;
      }
      s += `<path d="M${n(mx - w * 0.42)} ${n(my)}Q${n(mx)} ${n(my + 1.5)} ${n(mx + w * 0.42)} ${n(my - 0.2)}" stroke="${ln}" stroke-width="1.3" fill="none" stroke-linecap="round"/>`;
      s += `<path d="M${n(mx - 1.8)} ${n(my + 3.4)}q1.8 .7 3.6 0" stroke="${ln}" stroke-width=".7" fill="none" opacity=".4"/>`;
    }
  }
  return s;
}

/** Tusks / fangs drawn after the mouth. */
export function drawTusks(c: Ctx): string {
  const { g, p, f } = c;
  if (f.tusks === 'none' || c.mood === 'shadow' || f.mask) return '';
  const mx = X(g, 0.05);
  const my = g.mouthY;
  const w = g.mouthW;
  const ivory = '#f4ead2';
  const ln = p.skinLine;
  let s = '';
  if (f.tusks === 'under') {
    for (const k of [-1, 1]) {
      const x = mx + k * w * 0.42;
      s += `<path d="M${n(x - 2.6)} ${n(my + 2.5)}Q${n(x - 2.4 + k * 0.5)} ${n(my - 4)} ${n(x + k * 1.2)} ${n(my - 7.5)}Q${n(x + 1.2 + k * 0.8)} ${n(my - 2)} ${n(x + 2.6)} ${n(my + 2.5)}Z" fill="${ivory}" stroke="${ln}" stroke-width="1.1" stroke-linejoin="round"/>`;
    }
  } else if (f.tusks === 'long') {
    for (const k of [-1, 1]) {
      const x = mx + k * w * 0.5;
      s += `<path d="M${n(x - 2.4)} ${n(my + 3)}Q${n(x + k * 2)} ${n(my - 6)} ${n(x + k * 6)} ${n(my - 15)}Q${n(x + k * 4.5)} ${n(my - 4)} ${n(x + 2.6)} ${n(my + 3)}Z" fill="${ivory}" stroke="${ln}" stroke-width="1.1" stroke-linejoin="round"/>`;
      s += `<path d="M${n(x + k * 1)} ${n(my - 2)}Q${n(x + k * 3)} ${n(my - 7)} ${n(x + k * 5)} ${n(my - 12)}" stroke="#fff" stroke-width=".7" fill="none" opacity=".7"/>`;
    }
  } else if (f.tusks === 'fangs') {
    for (const k of [-1, 1]) {
      const x = mx + k * w * 0.26;
      const y = my + (c.mood === 'smile' || c.mood === 'angry' ? 0.2 : 0.4);
      s += `<path d="M${n(x - 1.2)} ${n(y)}L${n(x + 0.1)} ${n(y + 3.2)}L${n(x + 1.2)} ${n(y)}Z" fill="#fff" stroke="${ln}" stroke-width=".6" stroke-linejoin="round"/>`;
    }
  }
  return s;
}

// ---------------------------------------------------------------------------
// Skin features
// ---------------------------------------------------------------------------

function scales(c: Ctx): string {
  const { g, p } = c;
  const col = c.race === 'sirena' ? mix(p.accent, '#bff6ff', 0.2) : p.skinSh2;
  const hi = c.race === 'sirena' ? '#e8ffff' : p.skinHi;
  let s = '';
  const patch = (u0: number, y0: number, rows: number, cols: number, r: number) => {
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols - (j % 2); i++) {
        const x = X(g, u0) + (i + (j % 2) * 0.5) * r * 1.6 * Math.sign(u0 || 1);
        const y = y0 + j * r * 1.2;
        s += `<path d="M${n(x - r)} ${n(y)}A${n(r)} ${n(r)} 0 0 0 ${n(x + r)} ${n(y)}" fill="${col}" stroke="${mix(col, p.skinLine, 0.4)}" stroke-width=".6" opacity=".85"/>`;
        s += `<circle cx="${n(x - r * 0.3)}" cy="${n(y + r * 0.35)}" r="${n(r * 0.22)}" fill="${hi}" opacity=".7"/>`;
      }
    }
  };
  if (c.race === 'sirena') {
    patch(-0.86, g.eyeY + 6, 3, 3, 2);
    patch(0.84, g.eyeY + 6, 3, 2, 1.8);
  } else {
    patch(-0.9, g.eyeY - 16, 3, 2, 2.2);
    patch(0.9, g.eyeY - 16, 3, 2, 2);
    patch(-0.82, g.eyeY + 12, 2, 2, 2);
    patch(0.8, g.eyeY + 12, 2, 2, 1.8);
    // nose bridge ridge
    s += `<path d="M${n(X(g, 0.02))} ${n(g.eyeY - 6)}L${n(X(g, 0.06))} ${n(g.noseY - 6)}" stroke="${p.skinSh2}" stroke-width="1.4" opacity=".5"/>`;
  }
  return s;
}

function cracks(c: Ctx): string {
  const { g, p, rng } = c;
  const r = rng.fork('cracks');
  let s = '';
  const crack = (x: number, y: number, len: number, ang: number) => {
    let d = `M${n(x)} ${n(y)}`;
    let cx = x;
    let cy = y;
    for (let i = 0; i < 4; i++) {
      const a = ang + r.range(-0.7, 0.7);
      cx += Math.cos(a) * len / 4;
      cy += Math.sin(a) * len / 4;
      d += `L${n(cx)} ${n(cy)}`;
    }
    s += `<path d="${d}" stroke="${p.skinLine}" stroke-width="1" fill="none" opacity=".75" stroke-linejoin="round"/>`;
    s += `<path d="${d}" transform="translate(.8 .8)" stroke="${p.skinHi}" stroke-width=".6" fill="none" opacity=".5"/>`;
  };
  crack(X(g, -0.75), g.eyeY + 10, 14, 1.2);
  crack(X(g, 0.55), g.eyeY - 18, 12, -0.3);
  crack(X(g, 0.7), g.eyeY + 14, 10, 1.9);
  crack(X(g, -0.3), g.top + 30, 10, 0.4);
  return s;
}

function freckles(c: Ctx): string {
  const { g, p, rng } = c;
  const r = rng.fork('freckles');
  let s = '';
  for (const side of [-1, 1]) {
    for (let i = 0; i < 6; i++) {
      const x = X(g, side * r.range(0.2, 0.62));
      const y = g.eyeY + g.eyeH * 0.6 + r.range(1, 6);
      s += `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r.range(0.45, 0.8))}" fill="${p.skinSh2}" opacity=".7"/>`;
    }
  }
  return s;
}

function facePaint(c: Ctx): string {
  const { g, p } = c;
  const col = c.race === 'trol' ? '#f1ead8' : p.accent;
  let s = '';
  for (const side of [-1, 1]) {
    const u = side * 0.62;
    const x = X(g, u);
    for (let i = 0; i < 2; i++) {
      const y = g.eyeY + 9 + i * 4;
      s += `<path d="M${n(x - 5 * S(g, u))} ${n(y)}L${n(x + 5 * S(g, u))} ${n(y + side * 0.8)}" stroke="${col}" stroke-width="1.8" stroke-linecap="round" opacity=".85"/>`;
    }
  }
  s += `<path d="M${n(X(g, 0.03))} ${n(g.eyeY - 22)}v6" stroke="${col}" stroke-width="2" stroke-linecap="round" opacity=".85"/>`;
  return s;
}

function soot(c: Ctx): string {
  const { g } = c;
  return (
    `<ellipse cx="${n(X(g, 0.6))}" cy="${n(g.eyeY + 13)}" rx="6" ry="3" fill="#3a2f2a" opacity=".28" transform="rotate(-15 ${n(X(g, 0.6))} ${n(g.eyeY + 13)})"/>` +
    `<ellipse cx="${n(X(g, -0.4))}" cy="${n(g.top + 32)}" rx="5" ry="2.2" fill="#3a2f2a" opacity=".22"/>`
  );
}

function stubble(c: Ctx): string {
  const { g, p, rng } = c;
  const r = rng.fork('stubble');
  const col = mix(p.hairSh, p.skinSh2, 0.4);
  // soft shadow on chin + upper lip only
  let s = `<path d="M${n(X(g, -0.62))} ${n(g.jawY + 2)}Q${n(X(g, -0.3))} ${n(g.chinY + 1)} ${n(X(g, 0))} ${n(g.chinY)}Q${n(X(g, 0.32))} ${n(g.chinY + 1)} ${n(X(g, 0.6))} ${n(g.jawY)}Q${n(X(g, 0.3))} ${n(g.mouthY + 5)} ${n(X(g, 0.02))} ${n(g.mouthY + 5)}Q${n(X(g, -0.3))} ${n(g.mouthY + 5)} ${n(X(g, -0.62))} ${n(g.jawY + 2)}Z" fill="${col}" opacity=".22"/>`;
  s += `<path d="M${n(X(g, -0.3))} ${n(g.mouthY - 3)}Q${n(X(g, 0.05))} ${n(g.mouthY - 5.5)} ${n(X(g, 0.36))} ${n(g.mouthY - 3)}" stroke="${col}" stroke-width="2.4" fill="none" opacity=".22"/>`;
  for (let i = 0; i < 22; i++) {
    const u = r.range(-0.5, 0.5);
    const y = r.range(g.mouthY + 4, g.chinY - 1);
    s += `<circle cx="${n(X(g, u))}" cy="${n(y)}" r=".4" fill="${col}" opacity=".5"/>`;
  }
  return s;
}

function wrinkles(c: Ctx): string {
  const { g, p } = c;
  let s = '';
  const ln = p.skinLine;
  for (const side of [-1, 1]) {
    const u = side * g.eyeU;
    const ex = X(g, u) + side * g.eyeW * 0.62 * S(g, u);
    s += `<path d="M${n(ex)} ${n(g.eyeY - 1)}l${n(side * 3)} -1.5M${n(ex + side * 0.4)} ${n(g.eyeY + 2)}l${n(side * 3)} .6" stroke="${ln}" stroke-width=".7" opacity=".5" stroke-linecap="round"/>`;
    const nx = X(g, side * 0.3);
    s += `<path d="M${n(nx)} ${n(g.noseY + 1)}Q${n(nx + side * 3)} ${n(g.mouthY - 2)} ${n(nx + side * 2)} ${n(g.mouthY + 3)}" stroke="${ln}" stroke-width=".75" fill="none" opacity=".45"/>`;
  }
  return s;
}

// ---------------------------------------------------------------------------
// Beards
// ---------------------------------------------------------------------------

export function drawBeard(c: Ctx): string {
  const { g, p, f } = c;
  if (f.beard === 'none' || f.beard === 'stubble') return '';
  const hair = p.hair;
  const sh = p.hairSh;
  const ln = p.hairLine;
  const mx = X(g, 0.05);
  const my = g.mouthY;
  let s = '';
  const must = (big: number) => {
    const w = g.mouthW * 0.75 * big;
    const d = `M${n(mx)} ${n(my - 4)}C${n(mx - w * 0.5)} ${n(my - 6)} ${n(mx - w)} ${n(my - 4)} ${n(mx - w * 1.35)} ${n(my + 2 * big)}C${n(mx - w * 0.9)} ${n(my)} ${n(mx - w * 0.4)} ${n(my - 1)} ${n(mx)} ${n(my - 1.5)}C${n(mx + w * 0.4)} ${n(my - 1)} ${n(mx + w * 0.9)} ${n(my)} ${n(mx + w * 1.35)} ${n(my + 2 * big)}C${n(mx + w)} ${n(my - 4)} ${n(mx + w * 0.5)} ${n(my - 6)} ${n(mx)} ${n(my - 4)}Z`;
    return `<path d="${d}" fill="${hair}" stroke="${ln}" stroke-width="1.1" stroke-linejoin="round"/><path d="M${n(mx - w * 0.9)} ${n(my - 2.4)}q${n(w * 0.4)} -1.6 ${n(w * 0.8)} -.6M${n(mx + w * 0.1)} ${n(my - 3)}q${n(w * 0.4)} -.8 ${n(w * 0.8)} .6" stroke="${sh}" stroke-width=".8" fill="none"/>`;
  };
  if (f.beard === 'mustache') return must(1);
  if (f.beard === 'goatee') {
    s += `<path d="M${n(mx - 5)} ${n(my + 4)}Q${n(mx)} ${n(my + 2.6)} ${n(mx + 5)} ${n(my + 4)}Q${n(mx + 4)} ${n(g.chinY + 6)} ${n(mx)} ${n(g.chinY + 9)}Q${n(mx - 4)} ${n(g.chinY + 6)} ${n(mx - 5)} ${n(my + 4)}Z" fill="${hair}" stroke="${ln}" stroke-width="1.1"/>`;
    return s + must(0.8);
  }
  const L = X(g, -0.97);
  const Rr = X(g, 0.97);
  const topY = g.eyeY + (f.beard === 'dwarf' ? 7 : 10);
  const bottom = f.beard === 'dwarf' ? 196 : f.beard === 'full' ? g.chinY + 18 : g.chinY + 5;
  const spread = f.beard === 'dwarf' ? 14 : f.beard === 'full' ? 4 : 1;
  const outer =
    `M${n(L)} ${n(topY)}C${n(L - spread * 0.3)} ${n(g.jawY)} ${n(L - spread)} ${n(bottom - 20)} ${n(mx - spread * 1.2 - 4)} ${n(bottom - 4)}` +
    `L${n(mx)} ${n(bottom)}L${n(mx + spread * 1.2 + 4)} ${n(bottom - 4)}C${n(Rr + spread)} ${n(bottom - 20)} ${n(Rr + spread * 0.3)} ${n(g.jawY)} ${n(Rr)} ${n(topY)}` +
    `L${n(X(g, 0.78))} ${n(topY + 2)}C${n(X(g, 0.7))} ${n(g.mouthY + 6)} ${n(X(g, 0.4))} ${n(g.mouthY + 7)} ${n(mx)} ${n(g.mouthY + 6)}C${n(X(g, -0.4))} ${n(g.mouthY + 7)} ${n(X(g, -0.7))} ${n(g.mouthY + 6)} ${n(X(g, -0.78))} ${n(topY + 2)}Z`;
  s += `<path d="${outer}" fill="${hair}" stroke="${ln}" stroke-width="1.4" stroke-linejoin="round"/>`;
  // strands
  for (let i = -3; i <= 3; i++) {
    const x0 = mx + i * 6;
    s += `<path d="M${n(x0)} ${n(g.mouthY + 9)}Q${n(x0 + i * 1.2)} ${n((g.mouthY + bottom) / 2)} ${n(mx + i * (4 + spread * 0.5))} ${n(bottom - 6)}" stroke="${sh}" stroke-width="1" fill="none" opacity=".8"/>`;
  }
  if (f.beard === 'dwarf') {
    // braid rings
    for (const k of [-1, 1]) {
      const bx = mx + k * 10;
      s += `<rect x="${n(bx - 4)}" y="${n(bottom - 22)}" width="8" height="4" rx="1.4" fill="${p.trim}" stroke="${p.trimSh}" stroke-width=".7"/>`;
    }
    s += `<rect x="${n(mx - 4.5)}" y="${n(bottom - 14)}" width="9" height="4.6" rx="1.4" fill="${p.trim}" stroke="${p.trimSh}" stroke-width=".7"/>`;
  }
  s += must(f.beard === 'dwarf' ? 1.4 : 1.05);
  return s;
}

/** Dwarf-style hanging braids (also used for female dwarves). */
export function drawBraids(c: Ctx): string {
  const { g, p, f } = c;
  if (!f.braids) return '';
  let s = '';
  for (const side of [-1, 1] as const) {
    const x0 = side < 0 ? g.cx - g.R - 3 : g.cx + g.R + 3;
    const y0 = g.eyeY + 4;
    const segs = 8;
    const x1 = x0 + side * 8;
    for (let i = segs - 1; i >= 0; i--) {
      const t = i / segs;
      const x = x0 + (x1 - x0) * t;
      const y = y0 + t * (190 - y0);
      s += `<ellipse cx="${n(x)}" cy="${n(y)}" rx="5.2" ry="7" fill="${p.hair}" stroke="${p.hairLine}" stroke-width="1.1"/>`;
      s += `<path d="M${n(x - 3.5)} ${n(y - 2)}Q${n(x)} ${n(y + 3)} ${n(x + 3.5)} ${n(y - 2)}" stroke="${p.hairSh}" stroke-width="1" fill="none"/>`;
    }
    s += `<rect x="${n(x1 - 5)}" y="182" width="10" height="5" rx="1.5" fill="${p.trim}" stroke="${p.trimSh}" stroke-width=".8"/>`;
  }
  return s;
}

// ---------------------------------------------------------------------------
// Accessories on the face and mood overlays
// ---------------------------------------------------------------------------

export function drawFaceAccessories(c: Ctx): string {
  const { g, p, f } = c;
  let s = '';
  if (f.scar && c.mood !== 'shadow') {
    const col = mix(p.skinSh2, '#c0566a', 0.35);
    if (f.scarKind === 'nose') {
      const x0 = X(g, -0.3);
      const x1 = X(g, 0.34);
      const y0 = g.eyeY + 6;
      const y1 = g.eyeY + 1;
      s += `<path d="M${n(x0)} ${n(y0)}Q${n((x0 + x1) / 2)} ${n(y0 - 1)} ${n(x1)} ${n(y1)}" stroke="${p.skinLine}" stroke-width="2.6" stroke-linecap="round" fill="none" opacity=".35"/>`;
      s += `<path d="M${n(x0)} ${n(y0)}Q${n((x0 + x1) / 2)} ${n(y0 - 1)} ${n(x1)} ${n(y1)}" stroke="${col}" stroke-width="1.9" stroke-linecap="round" fill="none"/>`;
      s += `<path d="M${n(x0 + 2)} ${n(y0 + 0.4)}Q${n((x0 + x1) / 2)} ${n(y0 - 0.2)} ${n(x1 - 2)} ${n(y1 + 0.8)}" stroke="#ffd8d8" stroke-width=".5" fill="none" opacity=".6"/>`;
    } else if (f.scarKind === 'eye') {
      const x = X(g, g.eyeU) + 1;
      s += `<path d="M${n(x - 2)} ${n(g.eyeY - 16)}L${n(x + 3)} ${n(g.eyeY + 14)}" stroke="${col}" stroke-width="1.7" stroke-linecap="round"/>`;
      for (let i = 0; i < 3; i++) s += `<path d="M${n(x - 2.4 + i * 2)} ${n(g.eyeY - 10 + i * 9)}h4" stroke="${col}" stroke-width=".9"/>`;
    } else {
      const x = X(g, -0.62);
      s += `<path d="M${n(x - 4)} ${n(g.eyeY + 10)}L${n(x + 3)} ${n(g.eyeY + 17)}" stroke="${col}" stroke-width="1.6" stroke-linecap="round"/>`;
    }
  }
  if (f.thirdEye) {
    const x = X(g, 0.02);
    const y = g.eyeY - 20;
    s += `<path d="M${n(x - 5)} ${n(y)}Q${n(x)} ${n(y - 5)} ${n(x + 5)} ${n(y)}Q${n(x)} ${n(y + 5)} ${n(x - 5)} ${n(y)}Z" fill="#fff6e8" stroke="${p.line}" stroke-width="1.1"/>`;
    s += `<circle cx="${n(x)}" cy="${n(y)}" r="2.4" fill="${p.glow}"/><circle cx="${n(x - 0.8)}" cy="${n(y - 0.8)}" r=".8" fill="#fff"/>`;
  }
  if (f.eyepatch) {
    const u = -g.eyeU;
    const x = X(g, u);
    const y = g.eyeY + 1;
    s += `<path d="M${n(g.cx - g.R - 2)} ${n(g.eyeY - 16)}L${n(g.cx + g.R + 2)} ${n(g.eyeY - 26)}" stroke="#1d1418" stroke-width="1.6"/>`;
    s += `<path d="M${n(x - 9)} ${n(y - 7)}Q${n(x)} ${n(y - 10)} ${n(x + 9)} ${n(y - 6)}Q${n(x + 8)} ${n(y + 8)} ${n(x)} ${n(y + 9)}Q${n(x - 8)} ${n(y + 7)} ${n(x - 9)} ${n(y - 7)}Z" fill="#221820" stroke="#0e080c" stroke-width="1.1"/>`;
    s += `<path d="M${n(x - 5)} ${n(y - 5)}q5 -2 9 0" stroke="#5a4650" stroke-width=".8" fill="none"/>`;
  }
  if (f.glasses) {
    const ln = mix(p.trimSh, '#2a1a10', 0.3);
    let d = '';
    for (const side of [-1, 1]) {
      const u = side * g.eyeU;
      d += `<circle cx="${n(X(g, u))}" cy="${n(g.eyeY + 1)}" r="${n(g.eyeW * 0.62 * S(g, u))}" fill="#dff4ff" fill-opacity=".15" stroke="${ln}" stroke-width="1.3"/>`;
    }
    d += `<path d="M${n(X(g, -g.eyeU) + g.eyeW * 0.6)} ${n(g.eyeY)}Q${n(X(g, 0))} ${n(g.eyeY - 3)} ${n(X(g, g.eyeU) - g.eyeW * 0.55)} ${n(g.eyeY)}" stroke="${ln}" stroke-width="1.1" fill="none"/>`;
    s += d;
  }
  if (f.monocle) {
    const u = g.eyeU;
    const x = X(g, u);
    const r = g.eyeW * 0.7;
    s += `<circle cx="${n(x)}" cy="${n(g.eyeY + 1)}" r="${n(r)}" fill="#e9fbff" fill-opacity=".22" stroke="#e8c15a" stroke-width="1.8"/>`;
    s += `<circle cx="${n(x)}" cy="${n(g.eyeY + 1)}" r="${n(r)}" fill="none" stroke="#8a5e12" stroke-width=".6"/>`;
    s += `<path d="M${n(x - r * 0.5)} ${n(g.eyeY - r * 0.4)}q${n(r * 0.3)} -${n(r * 0.35)} ${n(r * 0.7)} -${n(r * 0.3)}" stroke="#fff" stroke-width="1" fill="none" opacity=".8"/>`;
    s += `<path d="M${n(x + r * 0.7)} ${n(g.eyeY + r * 0.7)}C${n(x + r + 6)} ${n(g.eyeY + 20)} ${n(x + 10)} ${n(g.chinY + 10)} ${n(x + 18)} ${n(g.neckY + 16)}" stroke="#e8c15a" stroke-width=".9" fill="none" stroke-dasharray="1.6 1"/>`;
  }
  return s;
}

export function drawMask(c: Ctx): string {
  const { g, p, f } = c;
  if (!f.mask) return '';
  const col = mix(p.outfit, '#1a1420', 0.45);
  const sh = shadowOf(col, 0.1);
  const L = g.cx - g.R - 2;
  const Rr = g.cx + g.R + 2;
  const top = g.noseY - 5;
  const nx = X(g, 0.08);
  const d = `M${n(L)} ${n(top + 2)}Q${n(nx - 12)} ${n(top - 3)} ${n(nx)} ${n(top - 4)}Q${n(nx + 12)} ${n(top - 3)} ${n(Rr)} ${n(top + 1)}L${n(Rr + 2)} ${n(g.neckY + 4)}L${n(L - 2)} ${n(g.neckY + 4)}Z`;
  let s = `<path d="${d}" fill="${col}" stroke="${p.line}" stroke-width="1.4" stroke-linejoin="round"/>`;
  s += `<path d="M${n(nx)} ${n(top - 3)}Q${n(nx + 3)} ${n(g.mouthY)} ${n(nx + 1)} ${n(g.chinY + 6)}" stroke="${sh}" stroke-width="1.2" fill="none"/>`;
  s += `<path d="M${n(L + 4)} ${n(g.chinY)}Q${n(nx)} ${n(g.chinY + 10)} ${n(Rr - 4)} ${n(g.chinY - 2)}" stroke="${sh}" stroke-width="1.1" fill="none"/>`;
  s += `<path d="M${n(Rr - 6)} ${n(top + 4)}L${n(Rr)} ${n(g.neckY)}L${n(Rr - 8)} ${n(g.neckY)}Z" fill="${sh}" opacity=".7"/>`;
  return s;
}

export function drawMoodOverlay(c: Ctx): string {
  const { g, p } = c;
  let s = '';
  switch (c.mood) {
    case 'angry': {
      const x = g.cx + g.R * 0.62;
      const y = g.top + 22;
      const r = 5;
      const col = '#e2455b';
      s += `<g stroke="${col}" stroke-width="2" fill="none" stroke-linecap="round">`;
      s += `<path d="M${n(x - r)} ${n(y - 1.5)}Q${n(x - 1.5)} ${n(y - 1.5)} ${n(x - 1.5)} ${n(y - r)}"/>`;
      s += `<path d="M${n(x + r)} ${n(y - 1.5)}Q${n(x + 1.5)} ${n(y - 1.5)} ${n(x + 1.5)} ${n(y - r)}"/>`;
      s += `<path d="M${n(x - r)} ${n(y + 1.5)}Q${n(x - 1.5)} ${n(y + 1.5)} ${n(x - 1.5)} ${n(y + r)}"/>`;
      s += `<path d="M${n(x + r)} ${n(y + 1.5)}Q${n(x + 1.5)} ${n(y + 1.5)} ${n(x + 1.5)} ${n(y + r)}"/></g>`;
      break;
    }
    case 'scared': {
      s += sweat(g.cx + g.R + 2, g.eyeY - 16, 1.2);
      s += sweat(g.cx - g.R + 4, g.eyeY - 8, 0.8);
      break;
    }
    case 'hurt': {
      // bandage on cheek + small blood trickle
      const x = X(g, 0.62);
      const y = g.eyeY + 13;
      s += `<g transform="rotate(-20 ${n(x)} ${n(y)})"><rect x="${n(x - 6)}" y="${n(y - 2.2)}" width="12" height="4.4" rx="1.6" fill="#f3e3cf" stroke="${p.skinLine}" stroke-width=".7"/><rect x="${n(x - 2)}" y="${n(y - 2.2)}" width="4" height="4.4" fill="#e6cfb4"/></g>`;
      const bx = X(g, -0.5);
      s += `<path d="M${n(bx)} ${n(g.top + 30)}q1 5 -.5 9q-1.6 1.5 -2.2 -.5q0 -3 2.7 -8.5Z" fill="#c4283f"/>`;
      s += sweat(g.cx - g.R + 3, g.eyeY - 14, 0.8);
      break;
    }
    case 'sad': {
      // brimming tears on the lower lids + streams down the cheeks
      for (const side of [-1, 1]) {
        const u = side * g.eyeU;
        const ex = X(g, u);
        const w = g.eyeW * S(g, u);
        const y = g.eyeY + g.eyeH * 0.42;
        s += `<path d="M${n(ex - w * 0.42)} ${n(y)}Q${n(ex)} ${n(y + 3.2)} ${n(ex + w * 0.42)} ${n(y - 0.4)}" stroke="#bfe8ff" stroke-width="1.6" fill="none" opacity=".9" stroke-linecap="round"/>`;
        const x = ex + side * w * 0.2;
        s += `<path d="M${n(x - 1.3)} ${n(y + 1)}C${n(x - 2.4)} ${n(y + 8)} ${n(x + side * 1.5)} ${n(y + 13)} ${n(x + side * 0.5)} ${n(y + 20)}L${n(x + side * 2.6)} ${n(y + 20)}C${n(x + side * 3)} ${n(y + 13)} ${n(x + 1.8)} ${n(y + 7)} ${n(x + 1.3)} ${n(y + 1)}Z" fill="#a8e2ff" stroke="#4a8ac0" stroke-width=".5" opacity=".88"/>`;
        s += `<path d="M${n(x + side * 1.6 - 1.8)} ${n(y + 23)}q1.8 -3.4 3.6 0q0 2.6 -1.8 2.6q-1.8 0 -1.8 -2.6Z" fill="#bfe8ff" stroke="#4a8ac0" stroke-width=".5"/>`;
      }
      const gl = mkId(c, 'sd');
      addDef(c, linGrad(gl, [[0, '#4a5aa8', 0.35], [1, '#4a5aa8', 0]]));
      s += useRef(c.faceId, `fill="url(#${gl})" opacity=".8"`);
      break;
    }
    case 'determined': {
      // "kira" glint next to the far eye + a sharp shine line
      const x = X(g, g.eyeU) + g.eyeW * 0.7;
      const y = g.eyeY - g.eyeH * 0.7;
      s += `<path d="M${n(x)} ${n(y - 5)}Q${n(x + 0.5)} ${n(y - 0.5)} ${n(x + 5)} ${n(y)}Q${n(x + 0.5)} ${n(y + 0.5)} ${n(x)} ${n(y + 5)}Q${n(x - 0.5)} ${n(y + 0.5)} ${n(x - 5)} ${n(y)}Q${n(x - 0.5)} ${n(y - 0.5)} ${n(x)} ${n(y - 5)}Z" fill="#fff6c8"/>`;
      s += `<path d="M${n(g.cx + g.R + 6)} ${n(g.top + 16)}l7 -5M${n(g.cx + g.R + 9)} ${n(g.top + 24)}l8 -2" stroke="#fff6c8" stroke-width="1.6" stroke-linecap="round" opacity=".85"/>`;
      break;
    }
    case 'surprised': {
      const x = g.cx + g.R + 8;
      const y = g.top + 10;
      s += `<g stroke="${p.line}" stroke-width="1.8" stroke-linecap="round"><path d="M${n(x)} ${n(y + 8)}l6 -6"/><path d="M${n(x + 2)} ${n(y + 14)}l9 -2"/><path d="M${n(x - 4)} ${n(y + 4)}l1 -8"/></g>`;
      break;
    }
    case 'smile': {
      const x = g.cx + g.R + 10;
      const y = g.top + 14;
      s += `<path d="M${n(x)} ${n(y - 5)}Q${n(x + 0.6)} ${n(y - 0.6)} ${n(x + 5)} ${n(y)}Q${n(x + 0.6)} ${n(y + 0.6)} ${n(x)} ${n(y + 5)}Q${n(x - 0.6)} ${n(y + 0.6)} ${n(x - 5)} ${n(y)}Q${n(x - 0.6)} ${n(y - 0.6)} ${n(x)} ${n(y - 5)}Z" fill="#ffe9a8"/>`;
      break;
    }
    case 'mind': {
      const x = g.cx - g.R - 12;
      const y = g.top + 14;
      s += `<path d="${spiral(x, y, 6, 2, 1)}" stroke="#c48bff" stroke-width="1.3" fill="none" opacity=".85"/>`;
      s += `<path d="${spiral(g.cx + g.R + 12, g.top + 30, 4.5, 2, -1)}" stroke="#c48bff" stroke-width="1.1" fill="none" opacity=".7"/>`;
      break;
    }
    default:
      break;
  }
  return s;
}

function sweat(x: number, y: number, k: number): string {
  return `<path d="M${n(x)} ${n(y)}q${n(-4 * k)} ${n(6 * k)} ${n(-3.6 * k)} ${n(8.6 * k)}q${n(0.6 * k)} ${n(3 * k)} ${n(3.6 * k)} ${n(3 * k)}q${n(3 * k)} 0 ${n(3.6 * k)} ${n(-3 * k)}q${n(0.4 * k)} ${n(-2.6 * k)} ${n(-3.6 * k)} ${n(-8.6 * k)}Z" fill="#aee6ff" stroke="#3d7fb0" stroke-width=".8"/><path d="M${n(x - 1.6 * k)} ${n(y + 6 * k)}q-.6 1.6 0 3" stroke="#fff" stroke-width="${n(0.9 * k)}" fill="none" stroke-linecap="round"/>`;
}

/** Glowing fissures of light (elias_god). */
export function drawLightCracks(c: Ctx): string {
  const { g, p } = c;
  const col = '#f3e8ff';
  const glow = p.glow;
  const paths = [
    `M${n(X(g, -0.9))} ${n(g.eyeY + 8)}l5 3l2 6l5 2`,
    `M${n(X(g, 0.7))} ${n(g.top + 26)}l-4 6l1 6l-5 4`,
    `M${n(X(g, 0.4))} ${n(g.chinY - 6)}l4 5l-1 6`,
    `M${n(g.cx - 6)} ${n(g.neckY - 16)}l3 8l-2 6`,
  ];
  let s = '';
  for (const d of paths) {
    s += `<path d="${d}" stroke="${glow}" stroke-width="3.2" fill="none" opacity=".45" stroke-linejoin="round"/>`;
    s += `<path d="${d}" stroke="${col}" stroke-width="1" fill="none" stroke-linejoin="round"/>`;
  }
  return s;
}
