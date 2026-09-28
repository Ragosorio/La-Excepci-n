// Bodies, job outfits and headwear for anime portraits.
import type { Ctx } from './portraitCtx';
import { X, addDef, defShape, mkId, useRef } from './portraitCtx';
import { lerp, lightOf, linGrad, mix, n, polar, radGrad, shadowOf, starPoints } from './util';

type Neck = 'round' | 'v' | 'deepv' | 'boat' | 'high' | 'wrap';

interface BodyG {
  cx: number;
  y0: number;
  wl: number;
  wr: number;
  nw: number;
}

function bg(c: Ctx): BodyG {
  const { g } = c;
  return { cx: g.cx + 2, y0: g.neckY, wl: g.shW + 2, wr: g.shW - 2, nw: g.neckW + 3 };
}

/** Torso silhouette with a neckline (clockwise from left neck point). */
function torsoPath(c: Ctx, neck: Neck, inset = 0, drop = 0): string {
  const { cx, y0, nw } = bg(c);
  const wl = bg(c).wl - inset;
  const wr = bg(c).wr - inset;
  const y = y0 + drop;
  let d = `M${n(cx - nw)} ${n(y - 3)}`;
  d += `C${n(cx - nw - 10)} ${n(y + 1)} ${n(cx - wl + 16)} ${n(y + 2)} ${n(cx - wl + 3)} ${n(y + 11)}`;
  d += `C${n(cx - wl - 5)} ${n(y + 17)} ${n(cx - wl - 8)} ${n(y + 32)} ${n(cx - wl - 10)} 206`;
  d += `L${n(cx + wr + 10)} 206`;
  d += `C${n(cx + wr + 8)} ${n(y + 32)} ${n(cx + wr + 5)} ${n(y + 17)} ${n(cx + wr - 3)} ${n(y + 11)}`;
  d += `C${n(cx + wr - 16)} ${n(y + 2)} ${n(cx + nw + 10)} ${n(y + 1)} ${n(cx + nw)} ${n(y - 3)}`;
  switch (neck) {
    case 'v':
      d += `L${n(cx)} ${n(y + 17)}L${n(cx - nw)} ${n(y - 3)}`;
      break;
    case 'deepv':
      d += `L${n(cx)} ${n(y + 30)}L${n(cx - nw)} ${n(y - 3)}`;
      break;
    case 'boat':
      d = d.replace(/^M[^C]+/, `M${n(cx - nw - 12)} ${n(y + 3)}`);
      d += `L${n(cx + nw + 12)} ${n(y + 3)}Q${n(cx)} ${n(y + 12)} ${n(cx - nw - 12)} ${n(y + 3)}`;
      break;
    case 'high':
      d += `L${n(cx + nw - 2)} ${n(y - 16)}Q${n(cx)} ${n(y - 12)} ${n(cx - nw + 2)} ${n(y - 16)}L${n(cx - nw)} ${n(y - 3)}`;
      break;
    case 'wrap':
      d += `L${n(cx - 6)} ${n(y + 22)}L${n(cx - nw)} ${n(y - 3)}`;
      break;
    default:
      d += `Q${n(cx)} ${n(y + 8)} ${n(cx - nw)} ${n(y - 3)}`;
  }
  return d + 'Z';
}

/** Filled + cel shaded garment layer. */
function garment(c: Ctx, d: string, col: string, opts: { line?: string; shade?: string; folds?: boolean } = {}): string {
  const sh = opts.shade ?? shadowOf(col, 0.13);
  const ln = opts.line ?? mix(shadowOf(col, 0.4), '#12081a', 0.55);
  const k = c.defs.length;
  const pid = defShape(c, `gp${k}`, d);
  const clip = mkId(c, `g${k}`);
  addDef(c, `<clipPath id="${clip}">${useRef(pid)}</clipPath>`);
  const { cx, y0 } = bg(c);
  let s = useRef(pid, `fill="${sh}"`);
  s += `<g clip-path="url(#${clip})">${useRef(pid, `transform="translate(-6.5 -1.5)" fill="${col}"`)}`;
  s += `<ellipse cx="${n(cx)}" cy="${n(y0 + 1)}" rx="${n(c.g.neckW + 12)}" ry="7" fill="${sh}" opacity=".9"/>`;
  if (opts.folds !== false) {
    s += `<path d="M${n(cx - 30)} 206Q${n(cx - 26)} ${n(y0 + 30)} ${n(cx - 18)} ${n(y0 + 20)}M${n(cx + 24)} 206Q${n(cx + 22)} ${n(y0 + 34)} ${n(cx + 30)} ${n(y0 + 24)}" stroke="${sh}" stroke-width="2.2" fill="none" opacity=".8"/>`;
  }
  s += `</g>${useRef(pid, `fill="none" stroke="${ln}" stroke-width="1.6" stroke-linejoin="round"`)}`;
  return s;
}

function lineOn(col: string): string {
  return mix(shadowOf(col, 0.4), '#12081a', 0.55);
}

// ---------------------------------------------------------------------------
// Emblems
// ---------------------------------------------------------------------------

export function emblem(kind: string, x: number, y: number, r: number, col: string, dark: string): string {
  switch (kind) {
    case 'sun': {
      let s = '';
      for (let i = 0; i < 12; i++) {
        const a = -90 + i * 30;
        const p0 = polar(x, y, r * 0.55, a);
        const p1 = polar(x, y, i % 2 ? r * 0.85 : r, a);
        s += `<path d="M${n(p0.x)} ${n(p0.y)}L${n(p1.x)} ${n(p1.y)}" stroke="${col}" stroke-width="${n(r * 0.14)}" stroke-linecap="round"/>`;
      }
      return s + `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r * 0.45)}" fill="${col}" stroke="${dark}" stroke-width=".7"/>`;
    }
    case 'dawn': {
      let s = '';
      for (let i = 0; i < 7; i++) {
        const a = -180 + i * 30;
        const p0 = polar(x, y, r * 0.62, a);
        const p1 = polar(x, y, r * (i % 2 ? 0.95 : 1.15), a);
        s += `<path d="M${n(p0.x)} ${n(p0.y)}L${n(p1.x)} ${n(p1.y)}" stroke="${col}" stroke-width="${n(r * 0.13)}" stroke-linecap="round"/>`;
      }
      s += `<path d="M${n(x - r * 0.5)} ${n(y)}A${n(r * 0.5)} ${n(r * 0.5)} 0 0 1 ${n(x + r * 0.5)} ${n(y)}Z" fill="${col}" stroke="${dark}" stroke-width=".7"/>`;
      s += `<path d="M${n(x - r)} ${n(y + r * 0.14)}H${n(x + r)}" stroke="${col}" stroke-width="${n(r * 0.12)}" stroke-linecap="round"/>`;
      return s;
    }
    case 'eclipse':
      return (
        `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="none" stroke="${col}" stroke-width="${n(r * 0.16)}"/>` +
        `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r * 0.78)}" fill="#07030c"/>` +
        `<path d="M${n(x - r * 0.62)} ${n(y - r * 0.3)}A${n(r * 0.7)} ${n(r * 0.7)} 0 0 1 ${n(x + r * 0.3)} ${n(y - r * 0.66)}" stroke="#ffffff" stroke-width="${n(r * 0.1)}" fill="none" opacity=".85"/>`
      );
    case 'rings': {
      let s = '';
      for (let i = 0; i < 5; i++) {
        const p = polar(x, y, r * 0.5, -90 + i * 72);
        s += `<circle cx="${n(p.x)}" cy="${n(p.y)}" r="${n(r * 0.36)}" fill="none" stroke="${col}" stroke-width="${n(r * 0.12)}"/>`;
      }
      return s;
    }
    case 'olive': {
      let s = `<path d="M${n(x - r)} ${n(y + r * 0.6)}Q${n(x)} ${n(y + r * 0.2)} ${n(x + r)} ${n(y - r * 0.7)}" stroke="${dark}" stroke-width="${n(r * 0.14)}" fill="none" stroke-linecap="round"/>`;
      for (let i = 0; i < 4; i++) {
        const t = 0.2 + i * 0.22;
        const px = lerp(x - r, x + r, t);
        const py = lerp(y + r * 0.6, y - r * 0.7, t) + Math.sin(t * Math.PI) * r * 0.1;
        for (const k of [-1, 1]) {
          s += `<ellipse cx="${n(px + k * r * 0.15)}" cy="${n(py + k * r * 0.22)}" rx="${n(r * 0.28)}" ry="${n(r * 0.12)}" transform="rotate(${-35 + k * 35} ${n(px + k * r * 0.15)} ${n(py + k * r * 0.22)})" fill="${col}"/>`;
        }
      }
      return s + `<circle cx="${n(x + r * 0.25)}" cy="${n(y + r * 0.35)}" r="${n(r * 0.16)}" fill="#4a5a24"/>`;
    }
    case 'leaf':
      return `<path d="M${n(x)} ${n(y + r)}Q${n(x - r)} ${n(y)} ${n(x)} ${n(y - r)}Q${n(x + r)} ${n(y)} ${n(x)} ${n(y + r)}Z" fill="${col}" stroke="${dark}" stroke-width=".7"/><path d="M${n(x)} ${n(y + r)}V${n(y - r * 0.6)}" stroke="${dark}" stroke-width=".6"/>`;
    case 'star':
      return `<polygon points="${starPoints(x, y, r, r * 0.45, 5)}" fill="${col}" stroke="${dark}" stroke-width=".6"/>`;
    case 'moon':
      return `<path d="M${n(x + r * 0.3)} ${n(y - r)}A${n(r)} ${n(r)} 0 1 0 ${n(x + r * 0.3)} ${n(y + r)}A${n(r * 0.75)} ${n(r * 0.75)} 0 1 1 ${n(x + r * 0.3)} ${n(y - r)}Z" fill="${col}" stroke="${dark}" stroke-width=".6"/>`;
    case 'coin':
      return `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="${col}" stroke="${dark}" stroke-width=".8"/><circle cx="${n(x)}" cy="${n(y)}" r="${n(r * 0.62)}" fill="none" stroke="${dark}" stroke-width=".6"/>`;
    case 'skull':
      return `<path d="M${n(x - r * 0.8)} ${n(y)}A${n(r * 0.8)} ${n(r * 0.8)} 0 1 1 ${n(x + r * 0.8)} ${n(y)}L${n(x + r * 0.5)} ${n(y + r * 0.8)}H${n(x - r * 0.5)}Z" fill="${col}"/><circle cx="${n(x - r * 0.32)}" cy="${n(y - r * 0.05)}" r="${n(r * 0.22)}" fill="${dark}"/><circle cx="${n(x + r * 0.32)}" cy="${n(y - r * 0.05)}" r="${n(r * 0.22)}" fill="${dark}"/>`;
    case 'lion':
      return `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="${col}"/><circle cx="${n(x)}" cy="${n(y + r * 0.1)}" r="${n(r * 0.55)}" fill="${dark}"/><circle cx="${n(x - r * 0.2)}" cy="${n(y)}" r="${n(r * 0.1)}" fill="${col}"/><circle cx="${n(x + r * 0.2)}" cy="${n(y)}" r="${n(r * 0.1)}" fill="${col}"/>`;
    default:
      return `<path d="M${n(x)} ${n(y - r)}L${n(x + r * 0.8)} ${n(y)}L${n(x)} ${n(y + r)}L${n(x - r * 0.8)} ${n(y)}Z" fill="${col}" stroke="${dark}" stroke-width=".7"/>`;
  }
}

function gem(x: number, y: number, r: number, col: string): string {
  return (
    `<path d="M${n(x)} ${n(y - r)}L${n(x + r * 0.85)} ${n(y)}L${n(x)} ${n(y + r)}L${n(x - r * 0.85)} ${n(y)}Z" fill="${col}" stroke="${shadowOf(col, 0.35)}" stroke-width=".7"/>` +
    `<path d="M${n(x - r * 0.35)} ${n(y - r * 0.2)}L${n(x)} ${n(y - r * 0.65)}" stroke="#fff" stroke-width="${n(Math.max(0.6, r * 0.22))}" stroke-linecap="round" opacity=".85"/>`
  );
}

function buttons(x: number, y0: number, count: number, gap: number, col: string, r = 1.6): string {
  let s = '';
  for (let i = 0; i < count; i++) {
    s += `<circle cx="${n(x)}" cy="${n(y0 + i * gap)}" r="${n(r)}" fill="${col}" stroke="${shadowOf(col, 0.35)}" stroke-width=".6"/>`;
    s += `<circle cx="${n(x - r * 0.3)}" cy="${n(y0 + i * gap - r * 0.3)}" r="${n(r * 0.35)}" fill="#fff" opacity=".7"/>`;
  }
  return s;
}

function metalGrad(c: Ctx, base: string, key = 'mg'): string {
  const id = mkId(c, key);
  if (!c.defs.some((d) => d.includes(`id="${id}"`))) {
    addDef(c, linGrad(id, [[0, lightOf(base, 0.22)], [0.45, base], [0.55, shadowOf(base, 0.1)], [1, shadowOf(base, 0.26)]], 0, 0, 0.35, 1));
  }
  return `url(#${id})`;
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function neckSkin(c: Ctx): string {
  const { g, p } = c;
  const { cx, y0, nw } = bg(c);
  const d = `M${n(cx - nw - 1)} ${n(y0 - 8)}L${n(cx + nw + 1)} ${n(y0 - 8)}L${n(cx + nw + 24)} ${n(y0 + 8)}L${n(cx + nw + 24)} ${n(y0 + 44)}L${n(cx - nw - 26)} ${n(y0 + 44)}L${n(cx - nw - 26)} ${n(y0 + 8)}Z`;
  let s = `<path d="${d}" fill="${p.skin}"/>`;
  s += `<path d="M${n(cx - 12)} ${n(y0 + 7)}q6 2.5 10 1.5M${n(cx + 3)} ${n(y0 + 8.5)}q5 1 10 -1.5" stroke="${p.skinSh2}" stroke-width=".8" fill="none" opacity=".7"/>`;
  void g;
  return s;
}

function shirtCollar(c: Ctx, col: string, spread = 1): string {
  const { cx, y0, nw } = bg(c);
  const ln = lineOn(col);
  let s = '';
  for (const k of [-1, 1]) {
    const d = `M${n(cx + k * (nw - 1))} ${n(y0 - 9)}L${n(cx + k * (nw + 4 * spread))} ${n(y0 + 5)}L${n(cx + k * 2)} ${n(y0 + 6)}Z`;
    s += `<path d="${d}" fill="${col}" stroke="${ln}" stroke-width="1.2" stroke-linejoin="round"/>`;
  }
  return s;
}

function lapels(c: Ctx, col: string, depth = 34, width = 14, trim?: string): string {
  const { cx, y0, nw } = bg(c);
  const ln = lineOn(col);
  let s = '';
  for (const k of [-1, 1]) {
    const d = `M${n(cx + k * (nw + 1))} ${n(y0 - 4)}L${n(cx + k * (nw + width))} ${n(y0 + 6)}L${n(cx + k * (width * 0.6))} ${n(y0 + depth * 0.62)}L${n(cx + k * 1)} ${n(y0 + depth)}L${n(cx + k * 3)} ${n(y0 + 8)}Z`;
    s += `<path d="${d}" fill="${col}" stroke="${ln}" stroke-width="1.3" stroke-linejoin="round"/>`;
    if (trim) s += `<path d="M${n(cx + k * (nw + width))} ${n(y0 + 6)}L${n(cx + k * (width * 0.6))} ${n(y0 + depth * 0.62)}L${n(cx + k * 1)} ${n(y0 + depth)}" stroke="${trim}" stroke-width="1.3" fill="none"/>`;
  }
  return s;
}

function pauldrons(c: Ctx, metal: string, trim: string | null, lames = 3): string {
  const { cx, y0, wl, wr } = bg(c);
  const fill = metalGrad(c, metal);
  const ln = mix(shadowOf(metal, 0.45), '#10081a', 0.5);
  let s = '';
  for (const k of [-1, 1]) {
    const w = k < 0 ? wl : wr;
    const sx = cx + k * (w - 6);
    const sy = y0 + 12;
    for (let i = lames - 1; i >= 0; i--) {
      const oy = i * 7;
      const ow = 1 - i * 0.08;
      const d = `M${n(sx - k * 22 * ow)} ${n(sy - 6 + oy)}C${n(sx - k * 14)} ${n(sy - 20 + oy)} ${n(sx + k * 16 * ow)} ${n(sy - 18 + oy)} ${n(sx + k * 20 * ow)} ${n(sy + 6 + oy)}C${n(sx + k * 10 * ow)} ${n(sy + 2 + oy)} ${n(sx - k * 10 * ow)} ${n(sy + 2 + oy)} ${n(sx - k * 22 * ow)} ${n(sy - 6 + oy)}Z`;
      s += `<path d="${d}" fill="${fill}" stroke="${ln}" stroke-width="1.4" stroke-linejoin="round"/>`;
      if (trim) s += `<path d="M${n(sx - k * 21 * ow)} ${n(sy - 5.5 + oy)}C${n(sx - k * 10 * ow)} ${n(sy + 1.5 + oy)} ${n(sx + k * 10 * ow)} ${n(sy + 1.5 + oy)} ${n(sx + k * 19 * ow)} ${n(sy + 5 + oy)}" stroke="${trim}" stroke-width="1.6" fill="none"/>`;
    }
    s += `<path d="M${n(sx - k * 12)} ${n(sy - 12)}Q${n(sx)} ${n(sy - 18)} ${n(sx + k * 10)} ${n(sy - 12)}" stroke="#fff" stroke-width="1.4" fill="none" opacity=".55" stroke-linecap="round"/>`;
    s += `<circle cx="${n(sx - k * 12)}" cy="${n(sy - 5)}" r="1.2" fill="${lightOf(metal, 0.2)}" stroke="${ln}" stroke-width=".5"/>`;
  }
  return s;
}

function breastplate(c: Ctx, metal: string, trim: string | null): string {
  const { cx, y0, nw } = bg(c);
  const fill = metalGrad(c, metal, 'bp');
  const ln = mix(shadowOf(metal, 0.45), '#10081a', 0.5);
  const d = `M${n(cx - nw - 12)} ${n(y0 + 4)}Q${n(cx)} ${n(y0 + 12)} ${n(cx + nw + 12)} ${n(y0 + 4)}C${n(cx + 40)} ${n(y0 + 14)} ${n(cx + 40)} ${n(y0 + 40)} ${n(cx + 36)} 206L${n(cx - 38)} 206C${n(cx - 42)} ${n(y0 + 40)} ${n(cx - 42)} ${n(y0 + 14)} ${n(cx - nw - 12)} ${n(y0 + 4)}Z`;
  let s = `<path d="${d}" fill="${fill}" stroke="${ln}" stroke-width="1.5" stroke-linejoin="round"/>`;
  s += `<path d="M${n(cx)} ${n(y0 + 10)}V206" stroke="${ln}" stroke-width="1" opacity=".6"/>`;
  s += `<path d="M${n(cx - 2)} ${n(y0 + 12)}V206" stroke="#fff" stroke-width="1" opacity=".35"/>`;
  s += `<path d="M${n(cx + 20)} ${n(y0 + 16)}Q${n(cx + 30)} ${n(y0 + 30)} ${n(cx + 28)} 206" stroke="${shadowOf(metal, 0.2)}" stroke-width="7" fill="none" opacity=".45"/>`;
  s += `<path d="M${n(cx - 30)} ${n(y0 + 18)}Q${n(cx - 26)} ${n(y0 + 14)} ${n(cx - 16)} ${n(y0 + 13)}" stroke="#fff" stroke-width="1.6" fill="none" opacity=".6" stroke-linecap="round"/>`;
  if (trim) s += `<path d="M${n(cx - nw - 11)} ${n(y0 + 5.5)}Q${n(cx)} ${n(y0 + 13.5)} ${n(cx + nw + 11)} ${n(y0 + 5.5)}" stroke="${trim}" stroke-width="2" fill="none"/>`;
  return s;
}

function gorget(c: Ctx, metal: string, trim: string | null): string {
  const { cx, y0, nw } = bg(c);
  const fill = metalGrad(c, metal, 'gg');
  const ln = mix(shadowOf(metal, 0.45), '#10081a', 0.5);
  const d = `M${n(cx - nw - 3)} ${n(y0 - 10)}Q${n(cx)} ${n(y0 - 4)} ${n(cx + nw + 3)} ${n(y0 - 10)}L${n(cx + nw + 9)} ${n(y0 + 4)}Q${n(cx)} ${n(y0 + 12)} ${n(cx - nw - 9)} ${n(y0 + 4)}Z`;
  let s = `<path d="${d}" fill="${fill}" stroke="${ln}" stroke-width="1.4" stroke-linejoin="round"/>`;
  s += `<path d="M${n(cx - nw - 6)} ${n(y0 - 3)}Q${n(cx)} ${n(y0 + 4)} ${n(cx + nw + 6)} ${n(y0 - 3)}" stroke="${ln}" stroke-width=".9" fill="none" opacity=".6"/>`;
  if (trim) s += `<path d="M${n(cx - nw - 8.5)} ${n(y0 + 3.5)}Q${n(cx)} ${n(y0 + 11.5)} ${n(cx + nw + 8.5)} ${n(y0 + 3.5)}" stroke="${trim}" stroke-width="1.6" fill="none"/>`;
  return s;
}

function strap(c: Ctx, col: string, buckle: string, w = 7, dir = 1): string {
  const { cx, y0, wl, wr } = bg(c);
  const x0 = dir > 0 ? cx - wl + 16 : cx + wr - 16;
  const x1 = dir > 0 ? cx + 34 : cx - 34;
  const d = `M${n(x0 - w * 0.6)} ${n(y0 + 4)}L${n(x0 + w * 0.6)} ${n(y0 + 2)}L${n(x1 + w * 0.7)} 206L${n(x1 - w * 0.7)} 206Z`;
  const ln = lineOn(col);
  let s = `<path d="${d}" fill="${col}" stroke="${ln}" stroke-width="1.2" stroke-linejoin="round"/>`;
  const bx = lerp(x0, x1, 0.45);
  const by = lerp(y0 + 3, 206, 0.45);
  s += `<rect x="${n(bx - 4.5)}" y="${n(by - 3.5)}" width="9" height="7" rx="1.2" fill="none" stroke="${buckle}" stroke-width="1.8" transform="rotate(${dir > 0 ? -38 : 38} ${n(bx)} ${n(by)})"/>`;
  return s;
}

function sash(c: Ctx, col: string, trim: string): string {
  const { cx, y0, wl, wr } = bg(c);
  const d = `M${n(cx - wl + 10)} ${n(y0 + 8)}L${n(cx - wl + 30)} ${n(y0 + 2)}L${n(cx + wr - 4)} 206L${n(cx + wr - 30)} 206Z`;
  const ln = lineOn(col);
  return `<path d="${d}" fill="${col}" stroke="${ln}" stroke-width="1.3" stroke-linejoin="round"/><path d="M${n(cx - wl + 14)} ${n(y0 + 8.5)}L${n(cx + wr - 27)} 206M${n(cx - wl + 27)} ${n(y0 + 4)}L${n(cx + wr - 8)} 206" stroke="${trim}" stroke-width="1.1"/>`;
}

function capeBack(c: Ctx, col: string): string {
  const { cx, y0, wl, wr } = bg(c);
  const d = `M${n(cx - wl + 6)} ${n(y0 + 4)}C${n(cx - wl - 12)} ${n(y0 + 18)} ${n(cx - wl - 20)} ${n(180)} ${n(cx - wl - 24)} 206L${n(cx + wr + 24)} 206C${n(cx + wr + 20)} ${n(180)} ${n(cx + wr + 12)} ${n(y0 + 18)} ${n(cx + wr - 6)} ${n(y0 + 4)}Z`;
  return `<path d="${d}" fill="${shadowOf(col, 0.12)}" stroke="${lineOn(col)}" stroke-width="1.5"/>`;
}

function mantle(c: Ctx, col: string, trim: string | null, clasp: string | null, len = 26): string {
  const { cx, y0, wl, wr, nw } = bg(c);
  const d = `M${n(cx - nw - 2)} ${n(y0 - 6)}C${n(cx - nw - 14)} ${n(y0 - 2)} ${n(cx - wl + 8)} ${n(y0)} ${n(cx - wl - 4)} ${n(y0 + 16)}C${n(cx - wl - 8)} ${n(y0 + len)} ${n(cx - wl + 2)} ${n(y0 + len + 6)} ${n(cx - wl + 10)} ${n(y0 + len + 2)}Q${n(cx - 20)} ${n(y0 + len + 12)} ${n(cx)} ${n(y0 + len + 4)}Q${n(cx + 20)} ${n(y0 + len + 12)} ${n(cx + wr - 10)} ${n(y0 + len + 2)}C${n(cx + wr - 2)} ${n(y0 + len + 6)} ${n(cx + wr + 8)} ${n(y0 + len)} ${n(cx + wr + 4)} ${n(y0 + 16)}C${n(cx + wr - 8)} ${n(y0)} ${n(cx + nw + 14)} ${n(y0 - 2)} ${n(cx + nw + 2)} ${n(y0 - 6)}Q${n(cx)} ${n(y0 + 4)} ${n(cx - nw - 2)} ${n(y0 - 6)}Z`;
  let s = garment(c, d, col, { folds: false });
  if (trim) s += `<path d="M${n(cx - wl - 5)} ${n(y0 + len - 2)}Q${n(cx - wl)} ${n(y0 + len + 6)} ${n(cx - wl + 10)} ${n(y0 + len + 2)}Q${n(cx - 20)} ${n(y0 + len + 12)} ${n(cx)} ${n(y0 + len + 4)}Q${n(cx + 20)} ${n(y0 + len + 12)} ${n(cx + wr - 10)} ${n(y0 + len + 2)}Q${n(cx + wr)} ${n(y0 + len + 6)} ${n(cx + wr + 5)} ${n(y0 + len - 2)}" stroke="${trim}" stroke-width="2" fill="none"/>`;
  if (clasp) s += `<circle cx="${n(cx)}" cy="${n(y0 + 1)}" r="4" fill="${clasp}" stroke="${shadowOf(clasp, 0.35)}" stroke-width="1"/><circle cx="${n(cx - 1.2)}" cy="${n(y0 - 0.2)}" r="1.2" fill="#fff" opacity=".8"/>`;
  return s;
}

function furCollar(c: Ctx, col: string, spots: boolean): string {
  const { cx, y0, wl, wr, nw } = bg(c);
  const rng = c.rng.fork('fur');
  const pts: string[] = [];
  const k = 14;
  // puffy scalloped band across the shoulders
  let d = `M${n(cx - wl - 2)} ${n(y0 + 20)}`;
  for (let i = 0; i <= k; i++) {
    const t = i / k;
    const x = lerp(cx - wl - 2, cx + wr + 2, t);
    const y = y0 + 20 - Math.sin(t * Math.PI) * 30 + 4;
    d += `Q${n(x - 4)} ${n(y - 7 + rng.range(-1, 1))} ${n(x)} ${n(y - 3)}`;
    pts.push(`${n(x)},${n(y)}`);
  }
  d += `L${n(cx + wr + 4)} ${n(y0 + 34)}`;
  for (let i = k; i >= 0; i--) {
    const t = i / k;
    const x = lerp(cx + wr + 4, cx - wl - 4, 1 - t);
    const y = y0 + 34 - Math.sin(t * Math.PI) * 18 + 8;
    d += `Q${n(x + 4)} ${n(y + 6)} ${n(x)} ${n(y + 2)}`;
  }
  d += 'Z';
  let s = `<path d="${d}" fill="${col}" stroke="${lineOn(col)}" stroke-width="1.3" stroke-linejoin="round"/>`;
  s += `<path d="M${n(cx - nw - 6)} ${n(y0 - 6)}Q${n(cx)} ${n(y0 + 6)} ${n(cx + nw + 6)} ${n(y0 - 6)}" stroke="${shadowOf(col, 0.15)}" stroke-width="4" fill="none" opacity=".7"/>`;
  if (spots) {
    for (let i = 0; i < 9; i++) {
      const t = (i + 0.5) / 9;
      const x = lerp(cx - wl + 6, cx + wr - 6, t);
      const y = y0 + 22 - Math.sin(t * Math.PI) * 20 + rng.range(-2, 2);
      s += `<path d="M${n(x)} ${n(y - 3)}l1.4 3.5l-1.4 2.5l-1.4 -2.5Z" fill="#1b1418"/>`;
    }
  }
  return s;
}

function necklace(c: Ctx, style: 'pearls' | 'gold' | 'beads' | 'bones' | 'coins', col: string, pendant?: string): string {
  const { cx, y0 } = bg(c);
  let s = '';
  const k = style === 'beads' ? 11 : 13;
  for (let i = 0; i <= k; i++) {
    const t = i / k;
    const x = lerp(cx - 17, cx + 17, t);
    const y = y0 + 2 + Math.sin(t * Math.PI) * 12;
    if (style === 'bones') {
      s += `<path d="M${n(x)} ${n(y)}l-1.2 5l1.2 1.2l1.2 -1.2Z" fill="#efe4c8" stroke="#6b5a40" stroke-width=".5"/>`;
    } else if (style === 'coins') {
      s += `<circle cx="${n(x)}" cy="${n(y + 1.5)}" r="2.1" fill="#f0c65a" stroke="#8a5e12" stroke-width=".5"/>`;
    } else {
      const r = style === 'beads' ? 2.2 : style === 'pearls' ? 1.4 : 1;
      s += `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="${col}" stroke="${shadowOf(col, 0.35)}" stroke-width=".4"/>`;
    }
  }
  if (pendant) s += gem(cx, y0 + 18, 3.6, pendant);
  return s;
}

function bowtie(c: Ctx, col: string): string {
  const { cx, y0 } = bg(c);
  const y = y0 - 1;
  const ln = lineOn(col);
  return `<path d="M${n(cx)} ${n(y)}L${n(cx - 8)} ${n(y - 5)}L${n(cx - 8)} ${n(y + 5)}Z M${n(cx)} ${n(y)}L${n(cx + 8)} ${n(y - 5)}L${n(cx + 8)} ${n(y + 5)}Z" fill="${col}" stroke="${ln}" stroke-width="1.1" stroke-linejoin="round"/><rect x="${n(cx - 2)}" y="${n(y - 2.4)}" width="4" height="4.8" rx="1" fill="${shadowOf(col, 0.1)}" stroke="${ln}" stroke-width=".8"/>`;
}

function cravat(c: Ctx, col: string): string {
  const { cx, y0 } = bg(c);
  const ln = lineOn(col);
  return `<path d="M${n(cx - 6)} ${n(y0 - 6)}Q${n(cx)} ${n(y0 - 2)} ${n(cx + 6)} ${n(y0 - 6)}L${n(cx + 5)} ${n(y0 + 4)}Q${n(cx + 7)} ${n(y0 + 14)} ${n(cx)} ${n(y0 + 20)}Q${n(cx - 7)} ${n(y0 + 14)} ${n(cx - 5)} ${n(y0 + 4)}Z" fill="${col}" stroke="${ln}" stroke-width="1.1"/><path d="M${n(cx - 3)} ${n(y0 + 6)}Q${n(cx)} ${n(y0 + 10)} ${n(cx + 3)} ${n(y0 + 6)}" stroke="${ln}" stroke-width=".7" fill="none"/>`;
}

function ruff(c: Ctx, col: string): string {
  const { cx, y0, nw } = bg(c);
  let s = '';
  const k = 11;
  for (let i = 0; i < k; i++) {
    const t = (i + 0.5) / k;
    const x = lerp(cx - nw - 12, cx + nw + 12, t);
    const y = y0 - 4 + Math.sin(t * Math.PI) * 6;
    s += `<ellipse cx="${n(x)}" cy="${n(y)}" rx="4.4" ry="5.6" fill="${col}" stroke="${lineOn(col)}" stroke-width=".9"/>`;
  }
  return s;
}

function highCollar(c: Ctx, outer: string, inner: string, h = 34, flare = 20): string {
  const { cx, y0, nw } = bg(c);
  const lnO = lineOn(outer);
  let s = '';
  for (const k of [-1, 1]) {
    const X0 = (dx: number) => n(cx + k * dx);
    const A = [nw - 1, y0 + 10];
    const B = [nw + 1, y0 - h * 0.45];
    const T = [nw + flare, y0 - h];
    const C = [nw + flare + 10, y0 - h * 0.4];
    const D = [nw + flare + 16, y0 + 16];
    const shell = `M${X0(A[0] as number)} ${n(A[1] as number)}C${X0((A[0] as number) - 1)} ${n((A[1] as number) - 16)} ${X0(B[0] as number)} ${n((B[1] as number) + 10)} ${X0(B[0] as number)} ${n(B[1] as number)}Q${X0((B[0] as number) + 2)} ${n((T[1] as number) + 8)} ${X0(T[0] as number)} ${n(T[1] as number)}Q${X0((C[0] as number) + 2)} ${n((C[1] as number) - 10)} ${X0(C[0] as number)} ${n(C[1] as number)}Q${X0((D[0] as number) + 1)} ${n((D[1] as number) - 20)} ${X0(D[0] as number)} ${n(D[1] as number)}Z`;
    const lining = `M${X0((A[0] as number) + 3)} ${n((A[1] as number) - 2)}C${X0((A[0] as number) + 2)} ${n((A[1] as number) - 16)} ${X0((B[0] as number) + 3)} ${n((B[1] as number) + 10)} ${X0((B[0] as number) + 3)} ${n((B[1] as number) + 1)}Q${X0((B[0] as number) + 5)} ${n((T[1] as number) + 11)} ${X0((T[0] as number) - 1)} ${n((T[1] as number) + 5)}Q${X0((C[0] as number) - 2)} ${n((C[1] as number) - 4)} ${X0((C[0] as number) - 4)} ${n((C[1] as number) + 2)}Q${X0((D[0] as number) - 5)} ${n((D[1] as number) - 16)} ${X0((D[0] as number) - 7)} ${n((D[1] as number) - 2)}Z`;
    s += `<path d="${shell}" fill="${outer}" stroke="${lnO}" stroke-width="1.5" stroke-linejoin="round"/>`;
    s += `<path d="${lining}" fill="${inner}"/>`;
    s += `<path d="M${X0((B[0] as number) + 5)} ${n((B[1] as number) + 4)}Q${X0((B[0] as number) + 8)} ${n((T[1] as number) + 14)} ${X0((T[0] as number) - 3)} ${n((T[1] as number) + 9)}" stroke="${lightOf(inner, 0.2)}" stroke-width="1" fill="none" opacity=".7"/>`;
    s += `<path d="M${X0((A[0] as number) + 4)} ${n((A[1] as number) - 4)}Q${X0((A[0] as number) + 8)} ${n((A[1] as number) - 20)} ${X0((C[0] as number) - 6)} ${n((C[1] as number) + 6)}" stroke="${shadowOf(inner, 0.2)}" stroke-width="3" fill="none" opacity=".5"/>`;
  }
  return s;
}

function eclipseSigil(c: Ctx, x: number, y: number, r: number): string {
  const gid = mkId(c, 'sig');
  addDef(c, radGrad(gid, [[0, '#c9a4ff', 0.85], [0.45, '#9b5cff', 0.35], [1, '#9b5cff', 0]]));
  return (
    `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r * 2.1)}" fill="url(#${gid})"/>` +
    `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r * 1.2)}" fill="none" stroke="#cfcbe0" stroke-width="1"/>` +
    `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="#f6f0ff"/>` +
    `<circle cx="${n(x + r * 0.1)}" cy="${n(y + r * 0.08)}" r="${n(r * 0.86)}" fill="#07030c"/>` +
    `<path d="M${n(x - r * 1.5)} ${n(y)}H${n(x - r * 1.22)}M${n(x + r * 1.22)} ${n(y)}H${n(x + r * 1.5)}M${n(x)} ${n(y - r * 1.5)}V${n(y - r * 1.22)}M${n(x)} ${n(y + r * 1.22)}V${n(y + r * 1.5)}" stroke="#cfcbe0" stroke-width=".9"/>`
  );
}

// ---------------------------------------------------------------------------
// Outfits
// ---------------------------------------------------------------------------

export function drawBackGear(c: Ctx): string {
  const { g, p, f } = c;
  let s = '';
  if (f.halo) {
    const id = mkId(c, 'ha');
    addDef(c, radGrad(id, [[0, '#fff6d8', 0.9], [0.55, '#ffe7a0', 0.35], [1, '#ffd36a', 0]]));
    s += `<circle cx="${n(g.cx)}" cy="${n(g.eyeY - 18)}" r="${n(g.R + 30)}" fill="url(#${id})"/>`;
    s += `<circle cx="${n(g.cx)}" cy="${n(g.eyeY - 18)}" r="${n(g.R + 22)}" fill="none" stroke="#f3d27a" stroke-width="2.2"/>`;
    s += `<circle cx="${n(g.cx)}" cy="${n(g.eyeY - 18)}" r="${n(g.R + 18)}" fill="none" stroke="#fff3c8" stroke-width=".8" stroke-dasharray="2 3"/>`;
  }
  if (f.cape) s += capeBack(c, p.accent);
  if (f.quiver) {
    const { cx, y0, wr } = bg(c);
    const qx = cx + wr - 18;
    s += `<path d="M${n(qx - 7)} ${n(y0 - 14)}L${n(qx + 5)} ${n(y0 - 18)}L${n(qx + 12)} ${n(y0 + 20)}L${n(qx)} ${n(y0 + 24)}Z" fill="#6b4226" stroke="#2a160c" stroke-width="1.3"/>`;
    for (let i = 0; i < 4; i++) {
      const x = qx - 4 + i * 3.5;
      const y = y0 - 18 - i * 2;
      s += `<path d="M${n(x)} ${n(y)}V${n(y - 10)}" stroke="#7a5a3a" stroke-width="1.1"/><path d="M${n(x)} ${n(y - 9)}l-2.6 -7l2.6 2l2.6 -2Z" fill="${i % 2 ? '#e8e0d0' : p.accent}" stroke="#2a160c" stroke-width=".6"/>`;
    }
  }
  if (f.headwear === 'hood') s += hoodBack(c);
  return s;
}

export function drawBody(c: Ctx): string {
  const { p, f } = c;
  const { cx, y0, nw } = bg(c);
  let s = neckSkin(c);
  const O = p.outfit;
  const A = p.accent;
  const T = p.trim;
  switch (f.outfit) {
    case 'armor': {
      s += garment(c, torsoPath(c, 'round'), mix(O, '#2a2230', 0.45));
      s += breastplate(c, p.metal, c.spec.special === 'aurel' || c.spec.special === 'aurel_old' || c.race === 'caballero' || c.job === 'guardian' ? T : null);
      const emb = c.spec.special?.startsWith('aurel') ? 'dawn' : c.rng.fork('emb').pick(['lion', 'star', 'sun', 'diamond']);
      s += emblem(emb, cx, y0 + 30, 9, c.spec.special?.startsWith('aurel') ? '#f2c14e' : A, '#5a3a10');
      s += gorget(c, p.metal, T);
      s += pauldrons(c, p.metal, c.job === 'soldado' ? null : T);
      if (f.lightCracks === false && c.spec.special === 'aurel_old') s += armorCracks(c);
      break;
    }
    case 'lightarmor': {
      s += garment(c, torsoPath(c, 'round'), O);
      for (let i = -3; i <= 3; i++) s += `<path d="M${n(cx + i * 9)} ${n(y0 + 10)}V206" stroke="${p.outfitSh}" stroke-width="1" opacity=".7"/>`;
      s += strap(c, '#5a3a22', T, 6);
      s += gorget(c, p.metal, null);
      break;
    }
    case 'robe':
    case 'scholar': {
      s += garment(c, torsoPath(c, 'v'), O);
      s += `<path d="M${n(cx - 8)} ${n(y0 + 2)}L${n(cx)} ${n(y0 + 17)}L${n(cx + 8)} ${n(y0 + 2)}Z" fill="${mix(A, '#f3ead8', 0.5)}"/>`;
      s += lapels(c, shadowOf(O, 0.08), 44, 16, T);
      if (f.outfit === 'robe') {
        for (let i = 0; i < 3; i++) s += emblem('star', cx - 24 + i * 3, y0 + 18 + i * 9, 2.2, T, p.trimSh);
        s += gem(cx, y0 + 22, 4.2, A);
      } else {
        s += `<path d="M${n(cx - 22)} ${n(y0 + 2)}Q${n(cx - 30)} ${n(y0 - 8)} ${n(cx - 18)} ${n(y0 - 10)}" stroke="${p.outfitSh}" stroke-width="5" fill="none" stroke-linecap="round"/>`;
        s += `<path d="M${n(cx + 20)} ${n(y0 + 28)}l10 -26" stroke="#f3ead8" stroke-width="2.2" stroke-linecap="round"/><path d="M${n(cx + 30)} ${n(y0 + 2)}l2 -6l-4 3Z" fill="#3a2a1a"/>`;
      }
      break;
    }
    case 'sorcerer': {
      s += garment(c, torsoPath(c, 'round'), O);
      s += highCollar(c, O, A, 36, 14);
      s += `<path d="M${n(cx)} ${n(y0 + 6)}V206" stroke="${T}" stroke-width="2.2"/>`;
      for (let i = 0; i < 4; i++) s += `<path d="M${n(cx - 3)} ${n(y0 + 16 + i * 10)}h6" stroke="${T}" stroke-width="1.4"/>`;
      s += necklace(c, 'gold', T, A);
      break;
    }
    case 'clergy': {
      s += garment(c, torsoPath(c, 'round'), O);
      s += mantle(c, mix(O, '#ffffff', 0.35), T, null, 20);
      for (const k of [-1, 1]) {
        const x = cx + k * 11;
        s += `<path d="M${n(x - 5)} ${n(y0 + 4)}L${n(x + 5)} ${n(y0 + 4)}L${n(x + 6)} 206L${n(x - 6)} 206Z" fill="${A}" stroke="${p.accentLine}" stroke-width="1.1"/>`;
        s += `<path d="M${n(x - 4)} ${n(y0 + 6)}L${n(x - 5)} 206M${n(x + 4)} ${n(y0 + 6)}L${n(x + 5)} 206" stroke="${T}" stroke-width=".9"/>`;
        s += emblem('sun', x, y0 + 30, 4.6, T, p.trimSh);
      }
      break;
    }
    case 'monk': {
      s += garment(c, torsoPath(c, 'wrap'), O);
      s += `<path d="M${n(cx + nw)} ${n(y0 - 3)}L${n(cx - 6)} ${n(y0 + 22)}L${n(cx - 30)} 206" stroke="${p.outfitSh}" stroke-width="3" fill="none"/>`;
      s += necklace(c, 'beads', '#7a3a20');
      break;
    }
    case 'leather': {
      s += garment(c, torsoPath(c, 'v'), O);
      s += `<path d="M${n(cx - 4)} ${n(y0 + 4)}L${n(cx + 4)} ${n(y0 + 9)}M${n(cx + 4)} ${n(y0 + 4)}L${n(cx - 4)} ${n(y0 + 9)}" stroke="#3a2412" stroke-width=".9"/>`;
      const vest = mix('#6b4226', O, 0.25);
      for (const k of [-1, 1]) {
        const d = `M${n(cx + k * (nw + 4))} ${n(y0 - 2)}C${n(cx + k * 26)} ${n(y0 + 2)} ${n(cx + k * 40)} ${n(y0 + 8)} ${n(cx + k * 44)} 206L${n(cx + k * 12)} 206L${n(cx + k * 7)} ${n(y0 + 20)}Z`;
        s += garment(c, d, vest, { folds: false });
      }
      s += strap(c, '#4a2c16', T, 6.5);
      if (c.job === 'cazador') s += furCollar(c, '#8a7058', false);
      break;
    }
    case 'rogue': {
      s += garment(c, torsoPath(c, 'high'), O);
      s += `<path d="M${n(cx - nw)} ${n(y0 - 3)}L${n(cx + 10)} ${n(y0 + 30)}" stroke="${p.outfitSh}" stroke-width="2" fill="none"/>`;
      s += strap(c, '#2a1c1c', '#8a8a96', 6, -1);
      for (let i = 0; i < 3; i++) {
        const x = cx - 26 + i * 7;
        const y = y0 + 22 + i * 7;
        s += `<path d="M${n(x)} ${n(y)}l-2 -9" stroke="#c9ccd6" stroke-width="2.2" stroke-linecap="round"/><rect x="${n(x - 2)}" y="${n(y - 1)}" width="4" height="5" rx="1" fill="#3a2418"/>`;
      }
      break;
    }
    case 'merchant': {
      s += garment(c, torsoPath(c, 'v'), mix(A, '#f3ead8', 0.6));
      const coat = O;
      for (const k of [-1, 1]) {
        const d = `M${n(cx + k * (nw + 2))} ${n(y0 - 4)}C${n(cx + k * 30)} ${n(y0)} ${n(cx + k * 46)} ${n(y0 + 8)} ${n(cx + k * 52)} 206L${n(cx + k * 10)} 206L${n(cx + k * 4)} ${n(y0 + 16)}Z`;
        s += garment(c, d, coat, { folds: false });
        s += `<path d="M${n(cx + k * 10)} 206L${n(cx + k * 4)} ${n(y0 + 16)}L${n(cx + k * (nw + 2))} ${n(y0 - 4)}" stroke="${T}" stroke-width="1.6" fill="none"/>`;
      }
      s += `<path d="M${n(cx - 16)} ${n(y0 - 6)}Q${n(cx)} ${n(y0 + 10)} ${n(cx + 16)} ${n(y0 - 6)}Q${n(cx + 10)} ${n(y0 + 18)} ${n(cx - 2)} ${n(y0 + 30)}L${n(cx - 6)} ${n(y0 + 12)}Q${n(cx - 14)} ${n(y0 + 6)} ${n(cx - 16)} ${n(y0 - 6)}Z" fill="${A}" stroke="${p.accentLine}" stroke-width="1.2"/>`;
      s += necklace(c, 'coins', T);
      break;
    }
    case 'gown': {
      s += garment(c, torsoPath(c, 'boat'), O);
      // modest sheer lace up to the neck
      s += `<path d="M${n(cx - nw - 12)} ${n(y0 + 3)}Q${n(cx)} ${n(y0 + 12)} ${n(cx + nw + 12)} ${n(y0 + 3)}L${n(cx + nw)} ${n(y0 - 12)}Q${n(cx)} ${n(y0 - 8)} ${n(cx - nw)} ${n(y0 - 12)}Z" fill="${mix(O, '#ffffff', 0.55)}" fill-opacity=".45" stroke="${lineOn(O)}" stroke-width=".8"/>`;
      for (let i = 0; i < 6; i++) s += `<circle cx="${n(cx - 15 + i * 6)}" cy="${n(y0 + 2 + Math.sin(((i + 0.5) / 6) * Math.PI) * 4)}" r="1.6" fill="none" stroke="${mix(O, '#fff', 0.6)}" stroke-width=".6"/>`;
      s += `<path d="M${n(cx - 34)} ${n(y0 + 12)}Q${n(cx - 20)} ${n(y0 + 30)} ${n(cx - 6)} 206M${n(cx + 32)} ${n(y0 + 12)}Q${n(cx + 18)} ${n(y0 + 30)} ${n(cx + 6)} 206" stroke="${T}" stroke-width="1.4" fill="none" opacity=".9"/>`;
      s += necklace(c, 'pearls', '#f6efe4', A);
      break;
    }
    case 'apron': {
      s += garment(c, torsoPath(c, 'v'), mix(O, '#e8dcc6', 0.5));
      s += shirtCollar(c, mix(O, '#f3ead8', 0.7));
      const ap = c.job === 'tabernero' ? '#efe6d2' : '#6b4a30';
      const d = `M${n(cx - 22)} ${n(y0 + 14)}L${n(cx + 22)} ${n(y0 + 14)}L${n(cx + 26)} 206L${n(cx - 26)} 206Z`;
      s += garment(c, d, ap, { folds: false });
      s += `<path d="M${n(cx - 20)} ${n(y0 + 15)}L${n(cx - nw - 8)} ${n(y0 - 4)}M${n(cx + 20)} ${n(y0 + 15)}L${n(cx + nw + 8)} ${n(y0 - 4)}" stroke="${shadowOf(ap, 0.2)}" stroke-width="3.2"/>`;
      s += `<rect x="${n(cx - 10)}" y="${n(y0 + 26)}" width="20" height="12" rx="2" fill="${shadowOf(ap, 0.08)}" stroke="${lineOn(ap)}" stroke-width="1"/>`;
      if (c.job === 'alquimista') {
        const vc = ['#7fe3ff', '#e2455b', '#9bdc5a'];
        for (let i = 0; i < 3; i++) s += `<rect x="${n(cx - 8 + i * 6)}" y="${n(y0 + 18)}" width="4" height="12" rx="1.5" fill="${vc[i]}" stroke="#2a1a20" stroke-width=".7"/>`;
      }
      if (c.job === 'tabernero') s += `<path d="M${n(cx + 30)} ${n(y0 - 2)}l16 6l-4 26l-10 -2Z" fill="#f3ead8" stroke="#6a5a4a" stroke-width="1"/>`;
      break;
    }
    case 'noble':
    case 'royal': {
      const royal = f.outfit === 'royal';
      s += garment(c, torsoPath(c, 'round'), O);
      for (const k of [-1, 1]) s += `<path d="M${n(cx + k * 8)} ${n(y0 + 6)}Q${n(cx + k * 18)} ${n(y0 + 30)} ${n(cx + k * 14)} 206" stroke="${T}" stroke-width="1.2" fill="none" opacity=".85"/>`;
      if (royal) {
        s += furCollar(c, '#f6f1ea', true);
        s += `<path d="M${n(cx - 24)} ${n(y0 + 8)}Q${n(cx)} ${n(y0 + 40)} ${n(cx + 24)} ${n(y0 + 8)}" stroke="${T}" stroke-width="2.4" fill="none"/>`;
        s += emblem('sun', cx, y0 + 34, 7, T, p.trimSh);
      } else {
        s += ruff(c, '#f6f1ea');
        s += gem(cx, y0 + 16, 4, A);
        s += sash(c, A, T);
      }
      break;
    }
    case 'peasant': {
      s += garment(c, torsoPath(c, 'v'), O);
      s += `<path d="M${n(cx - 4)} ${n(y0 + 3)}L${n(cx + 4)} ${n(y0 + 8)}M${n(cx + 4)} ${n(y0 + 3)}L${n(cx - 4)} ${n(y0 + 8)}" stroke="${lineOn(O)}" stroke-width=".8"/>`;
      s += `<path d="M${n(cx - 16)} ${n(y0 - 6)}Q${n(cx)} ${n(y0 + 8)} ${n(cx + 16)} ${n(y0 - 6)}L${n(cx + 6)} ${n(y0 + 12)}L${n(cx)} ${n(y0 + 22)}L${n(cx - 6)} ${n(y0 + 12)}Z" fill="${A}" stroke="${p.accentLine}" stroke-width="1"/>`;
      s += `<rect x="${n(cx - 34)}" y="${n(y0 + 30)}" width="10" height="9" fill="${shadowOf(O, 0.08)}" stroke="${lineOn(O)}" stroke-width=".7" stroke-dasharray="1.5 1"/>`;
      break;
    }
    case 'banker':
    case 'dealer': {
      const banker = f.outfit === 'banker';
      s += garment(c, torsoPath(c, 'deepv'), banker ? '#2a2230' : '#1b1620');
      s += `<path d="M${n(cx - nw - 1)} ${n(y0 - 4)}L${n(cx)} ${n(y0 + 30)}L${n(cx + nw + 1)} ${n(y0 - 4)}Z" fill="#f6f2ea"/>`;
      const vest = banker ? O : '#2b2b33';
      for (const k of [-1, 1]) {
        const d = `M${n(cx + k * 6)} ${n(y0 + 6)}L${n(cx + k * 24)} ${n(y0 + 2)}L${n(cx + k * 30)} 206L${n(cx + k * 1)} 206Z`;
        s += garment(c, d, vest, { folds: false });
        if (banker) for (let i = 0; i < 4; i++) s += `<path d="M${n(cx + k * 10)} ${n(y0 + 14 + i * 10)}l${n(k * 8)} 5l${n(-k * 8)} 5" stroke="${lightOf(vest, 0.1)}" stroke-width=".8" fill="none" opacity=".6"/>`;
      }
      s += buttons(cx, y0 + 14, 3, 10, T);
      s += shirtCollar(c, '#fbf8f2', 0.6);
      s += banker ? cravat(c, A) : bowtie(c, A);
      if (banker) s += `<path d="M${n(cx + 4)} ${n(y0 + 24)}Q${n(cx + 14)} ${n(y0 + 32)} ${n(cx + 22)} ${n(y0 + 26)}" stroke="${T}" stroke-width="1" fill="none" stroke-dasharray="1.5 .8"/>`;
      if (banker) s += lapels(c, '#241c2a', 36, 16);
      break;
    }
    case 'captain': {
      s += garment(c, torsoPath(c, 'round'), O);
      s += highCollar(c, O, p.outfitSh, 14, 4);
      for (const k of [-1, 1]) s += buttons(cx + k * 9, y0 + 12, 4, 10, T, 1.8);
      s += epaulettes(c, T);
      s += sash(c, A, T);
      break;
    }
    case 'pirate': {
      s += garment(c, torsoPath(c, 'deepv'), '#efe6d6');
      s += `<path d="M${n(cx - 6)} ${n(y0 + 10)}l5 3M${n(cx + 6)} ${n(y0 + 10)}l-5 3M${n(cx - 5)} ${n(y0 + 18)}l4 3M${n(cx + 5)} ${n(y0 + 18)}l-4 3" stroke="#8a7a60" stroke-width=".9"/>`;
      for (const k of [-1, 1]) {
        const d = `M${n(cx + k * (nw + 4))} ${n(y0 - 4)}C${n(cx + k * 30)} ${n(y0)} ${n(cx + k * 46)} ${n(y0 + 8)} ${n(cx + k * 54)} 206L${n(cx + k * 16)} 206L${n(cx + k * 10)} ${n(y0 + 26)}Z`;
        s += garment(c, d, O, { folds: false });
        s += `<path d="M${n(cx + k * 16)} 206L${n(cx + k * 10)} ${n(y0 + 26)}L${n(cx + k * (nw + 4))} ${n(y0 - 4)}" stroke="${T}" stroke-width="2" fill="none"/>`;
      }
      s += strap(c, '#3a2414', T, 6, -1);
      break;
    }
    case 'council': {
      s += garment(c, torsoPath(c, 'high'), O);
      s += `<path d="M${n(cx)} ${n(y0 - 14)}V206" stroke="${T}" stroke-width="1.4"/>`;
      s += sash(c, A, T);
      if (c.spec.special === 'ione') {
        s += `<circle cx="${n(cx - 22)}" cy="${n(y0 + 20)}" r="8" fill="#f6f1e4" stroke="${T}" stroke-width="1.4"/>`;
        s += emblem('olive', cx - 22, y0 + 20, 6, '#7a9a3a', '#4a5a24');
      } else {
        s += emblem('rings', cx - 22, y0 + 18, 6, T, p.trimSh);
      }
      break;
    }
    case 'miner': {
      s += garment(c, torsoPath(c, 'round'), O);
      for (const k of [-1, 1]) s += `<path d="M${n(cx + k * 16)} ${n(y0 + 2)}L${n(cx + k * 20)} 206" stroke="#5a3a22" stroke-width="4"/><rect x="${n(cx + k * 16 - 3)}" y="${n(y0 + 20)}" width="6" height="5" fill="none" stroke="#a8a8b0" stroke-width="1.2"/>`;
      s += `<ellipse cx="${n(cx + 24)}" cy="${n(y0 + 34)}" rx="7" ry="4" fill="#2a2420" opacity=".3"/>`;
      break;
    }
    case 'shaman': {
      s += garment(c, torsoPath(c, 'v'), O);
      s += furCollar(c, '#7a6048', false);
      s += necklace(c, 'bones', '#efe4c8');
      for (let i = 0; i < 3; i++) s += `<path d="M${n(cx + 30 + i * 5)} ${n(y0 + 10)}q2 12 -1 20" stroke="${['#e2455b', '#d9b36c', '#3a8a8a'][i]}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`;
      break;
    }
    case 'bard': {
      s += garment(c, torsoPath(c, 'round'), O);
      for (const k of [-1, 1]) {
        const { wl, wr } = bg(c);
        const x = cx + k * ((k < 0 ? wl : wr) - 12);
        s += `<ellipse cx="${n(x)}" cy="${n(y0 + 14)}" rx="16" ry="11" fill="${A}" stroke="${p.accentLine}" stroke-width="1.3"/>`;
        for (let i = -1; i <= 1; i++) s += `<path d="M${n(x + i * 6)} ${n(y0 + 5)}Q${n(x + i * 7)} ${n(y0 + 14)} ${n(x + i * 6)} ${n(y0 + 23)}" stroke="${O}" stroke-width="2.4" fill="none"/>`;
      }
      s += ruff(c, '#f6f1ea');
      s += strap(c, '#6b4226', T, 5, -1);
      break;
    }
    case 'witch': {
      s += garment(c, torsoPath(c, 'v'), O);
      for (let i = 0; i < 3; i++) s += `<path d="M${n(cx - 5)} ${n(y0 + 20 + i * 7)}L${n(cx + 5)} ${n(y0 + 24 + i * 7)}M${n(cx + 5)} ${n(y0 + 20 + i * 7)}L${n(cx - 5)} ${n(y0 + 24 + i * 7)}" stroke="${T}" stroke-width=".9"/>`;
      s += mantle(c, A, null, null, 18);
      s += emblem('moon', cx, y0 + 6, 4.5, T, p.trimSh);
      break;
    }
    case 'healer': {
      s += garment(c, torsoPath(c, 'v'), O);
      s += lapels(c, mix(O, '#ffffff', 0.4), 30, 12, A);
      s += strap(c, '#7a5a3a', T, 5.5);
      s += emblem('leaf', cx + 26, y0 + 22, 5, '#7bbf5a', '#2f5a24');
      break;
    }
    case 'elias': {
      s += garment(c, torsoPath(c, 'v'), '#1a161f', { line: '#07050a' });
      s += `<path d="M${n(cx - 9)} ${n(y0 + 1)}L${n(cx)} ${n(y0 + 20)}L${n(cx + 9)} ${n(y0 + 1)}Z" fill="#ece8f2"/>`;
      s += highCollar(c, '#15111b', '#5b2a9a', 46, 17);
      s += cravat(c, '#2e1c44');
      s += lapels(c, '#262030', 50, 22, '#bdb7cc');
      s += `<path d="M${n(cx - 30)} ${n(y0 + 34)}L${n(cx - 6)} 206M${n(cx + 30)} ${n(y0 + 34)}L${n(cx + 6)} 206" stroke="#6b34b8" stroke-width="1.8" opacity=".85"/>`;
      s += `<path d="M${n(cx - 17)} ${n(y0 + 30)}Q${n(cx)} ${n(y0 + 42)} ${n(cx + 17)} ${n(y0 + 30)}" stroke="#cfcbe0" stroke-width="1.1" fill="none" stroke-dasharray="2.2 1.2"/>`;
      s += buttons(cx + 17, y0 + 38, 2, 9, '#cfcbe0', 1.5);
      s += eclipseSigil(c, cx - 25, y0 + 24, 7);
      break;
    }
    case 'dress': {
      s += garment(c, torsoPath(c, 'round'), O);
      s += `<path d="M${n(cx - 20)} ${n(y0 + 14)}L${n(cx + 20)} ${n(y0 + 14)}L${n(cx + 22)} 206L${n(cx - 22)} 206Z" fill="#efe6d2" stroke="#8a7a60" stroke-width="1"/>`;
      s += mantle(c, A, null, T, 22);
      break;
    }
    default: {
      // generic commoner outfits (variety by seed)
      const v = c.rng.fork('tunic').int(0, 3);
      if (v === 0) {
        s += garment(c, torsoPath(c, 'v'), O);
        s += `<path d="M${n(cx - 5)} ${n(y0 + 4)}L${n(cx + 5)} ${n(y0 + 10)}M${n(cx + 5)} ${n(y0 + 4)}L${n(cx - 5)} ${n(y0 + 10)}" stroke="${lineOn(O)}" stroke-width=".9"/>`;
        s += mantle(c, A, null, T, 22);
      } else if (v === 1) {
        // shirt + open vest
        s += garment(c, torsoPath(c, 'v'), mix(A, '#f3ead8', 0.7));
        s += shirtCollar(c, mix(A, '#f3ead8', 0.8));
        for (const k of [-1, 1]) {
          const d = `M${n(cx + k * (nw + 3))} ${n(y0 - 2)}C${n(cx + k * 28)} ${n(y0 + 2)} ${n(cx + k * 42)} ${n(y0 + 8)} ${n(cx + k * 46)} 206L${n(cx + k * 9)} 206L${n(cx + k * 6)} ${n(y0 + 18)}Z`;
          s += garment(c, d, O, { folds: false });
        }
        s += buttons(cx - 12, y0 + 26, 2, 10, T, 1.4);
      } else if (v === 2) {
        // tunic with hood down behind the neck + scarf
        s += garment(c, torsoPath(c, 'round'), O);
        s += `<path d="M${n(cx - nw - 14)} ${n(y0 - 2)}Q${n(cx)} ${n(y0 + 18)} ${n(cx + nw + 14)} ${n(y0 - 2)}Q${n(cx + nw + 6)} ${n(y0 + 12)} ${n(cx)} ${n(y0 + 14)}Q${n(cx - nw - 6)} ${n(y0 + 12)} ${n(cx - nw - 14)} ${n(y0 - 2)}Z" fill="${A}" stroke="${p.accentLine}" stroke-width="1.2"/>`;
        s += `<path d="M${n(cx + 8)} ${n(y0 + 10)}l6 22l-8 -2Z" fill="${A}" stroke="${p.accentLine}" stroke-width="1"/>`;
      } else {
        // belted tunic with a shoulder strap
        s += garment(c, torsoPath(c, 'round'), O);
        s += `<path d="M${n(cx - 20)} ${n(y0 + 4)}Q${n(cx)} ${n(y0 + 14)} ${n(cx + 20)} ${n(y0 + 4)}" stroke="${shadowOf(O, 0.2)}" stroke-width="2" fill="none"/>`;
        s += strap(c, '#6b4a30', T, 5);
      }
    }
  }
  return s;
}

function epaulettes(c: Ctx, col: string): string {
  const { cx, y0, wl, wr } = bg(c);
  let s = '';
  for (const k of [-1, 1]) {
    const x = cx + k * ((k < 0 ? wl : wr) - 8);
    s += `<ellipse cx="${n(x)}" cy="${n(y0 + 6)}" rx="15" ry="6" fill="${col}" stroke="${shadowOf(col, 0.35)}" stroke-width="1.1"/>`;
    for (let i = -5; i <= 5; i++) s += `<path d="M${n(x + i * 2.6)} ${n(y0 + 10)}v${n(6 + (i % 2) * 1.5)}" stroke="${col}" stroke-width="1.3"/>`;
  }
  return s;
}

function armorCracks(c: Ctx): string {
  const { cx, y0 } = bg(c);
  return `<path d="M${n(cx - 20)} ${n(y0 + 20)}l6 6l-2 8l7 6M${n(cx + 18)} ${n(y0 + 34)}l-5 5l3 6M${n(cx - 44)} ${n(y0 + 6)}l6 5l-1 5" stroke="#3a2a30" stroke-width="1.1" fill="none" stroke-linejoin="round"/>`;
}

// ---------------------------------------------------------------------------
// Hood
// ---------------------------------------------------------------------------

function hoodBack(c: Ctx): string {
  const { g, p } = c;
  const cx = g.cx;
  const R = g.R;
  const col = shadowOf(p.outfit, 0.22);
  const d = `M${n(cx - R - 18)} ${n(g.neckY + 14)}C${n(cx - R - 26)} ${n(g.top + 4)} ${n(cx - R * 0.6)} ${n(g.top - 26)} ${n(cx)} ${n(g.top - 26)}C${n(cx + R * 0.6)} ${n(g.top - 26)} ${n(cx + R + 26)} ${n(g.top + 4)} ${n(cx + R + 18)} ${n(g.neckY + 14)}Z`;
  return `<path d="${d}" fill="${mix(col, '#07030c', 0.45)}" stroke="${lineOn(col)}" stroke-width="1.5"/>`;
}

function hoodFront(c: Ctx): string {
  const { g, p } = c;
  const cx = g.cx;
  const R = g.R;
  const col = p.outfit;
  const outer = `M${n(cx - R - 32)} ${n(g.neckY + 30)}C${n(cx - R - 28)} ${n(g.neckY)} ${n(cx - R - 30)} ${n(g.top + 6)} ${n(cx - R * 0.55)} ${n(g.top - 22)}Q${n(cx)} ${n(g.top - 34)} ${n(cx + R * 0.55)} ${n(g.top - 22)}C${n(cx + R + 30)} ${n(g.top + 6)} ${n(cx + R + 26)} ${n(g.neckY)} ${n(cx + R + 30)} ${n(g.neckY + 30)}Q${n(cx)} ${n(g.neckY + 44)} ${n(cx - R - 32)} ${n(g.neckY + 30)}Z`;
  const inner = `M${n(cx - R + 1)} ${n(g.jawY + 2)}C${n(cx - R - 6)} ${n(g.eyeY - 14)} ${n(cx - R * 0.55)} ${n(g.top + 10)} ${n(cx)} ${n(g.top + 10)}C${n(cx + R * 0.55)} ${n(g.top + 10)} ${n(cx + R + 6)} ${n(g.eyeY - 14)} ${n(cx + R - 1)} ${n(g.jawY + 2)}C${n(cx + R - 4)} ${n(g.chinY + 14)} ${n(cx + 8)} ${n(g.chinY + 22)} ${n(cx)} ${n(g.chinY + 22)}C${n(cx - 8)} ${n(g.chinY + 22)} ${n(cx - R + 4)} ${n(g.chinY + 14)} ${n(cx - R + 1)} ${n(g.jawY + 2)}Z`;
  const d = outer + inner;
  const clip = mkId(c, 'hd');
  addDef(c, `<clipPath id="${clip}"><path d="${d}" clip-rule="evenodd"/></clipPath>`);
  const sh = shadowOf(col, 0.14);
  let s = `<path d="${d}" fill="${sh}" fill-rule="evenodd"/>`;
  s += `<g clip-path="url(#${clip})"><path d="${outer}" transform="translate(-7 -2)" fill="${col}"/></g>`;
  s += `<path d="${d}" fill="none" fill-rule="evenodd" stroke="${lineOn(col)}" stroke-width="1.6" stroke-linejoin="round"/>`;
  s += `<path d="M${n(cx - R - 14)} ${n(g.eyeY)}Q${n(cx - R - 16)} ${n(g.top + 10)} ${n(cx - R * 0.4)} ${n(g.top - 16)}" stroke="${lightOf(col, 0.12)}" stroke-width="1.6" fill="none" opacity=".7"/>`;
  s += `<path d="M${n(cx + R + 8)} ${n(g.chinY)}Q${n(cx + R + 14)} ${n(g.eyeY)} ${n(cx + R * 0.7)} ${n(g.top - 8)}" stroke="${shadowOf(col, 0.25)}" stroke-width="1.4" fill="none" opacity=".8"/>`;
  return s;
}

// ---------------------------------------------------------------------------
// Headwear (after front hair)
// ---------------------------------------------------------------------------

export function drawHeadwear(c: Ctx): string {
  const { g, p, f } = c;
  const cx = g.cx;
  const R = g.R;
  const top = g.top - f.hairVol;
  let s = '';
  switch (f.headwear) {
    case 'hood':
      s += hoodFront(c);
      break;
    case 'wizard':
    case 'witch': {
      const witch = f.headwear === 'witch';
      const col = witch ? mix(p.outfit, '#1a1024', 0.35) : p.outfit;
      const ln = lineOn(col);
      const by = top + 16;
      const bw = witch ? R + 36 : R + 20;
      const brim = `M${n(cx - bw)} ${n(by + 4)}Q${n(cx - bw * 0.5)} ${n(by - 8)} ${n(cx + 2)} ${n(by - 9)}Q${n(cx + bw * 0.5)} ${n(by - 8)} ${n(cx + bw)} ${n(by + 2)}Q${n(cx + bw * 0.4)} ${n(by + 13)} ${n(cx)} ${n(by + 12)}Q${n(cx - bw * 0.45)} ${n(by + 13)} ${n(cx - bw)} ${n(by + 4)}Z`;
      const tipX = cx + (witch ? 34 : 26);
      const tipY = witch ? top - 64 : top - 58;
      const cone = `M${n(cx - R + 4)} ${n(by - 2)}C${n(cx - R + 10)} ${n(by - 30)} ${n(cx - 8)} ${n(top - 30)} ${n(cx + 4)} ${n(top - 42)}Q${n(tipX - 6)} ${n(tipY + 4)} ${n(tipX)} ${n(tipY)}Q${n(cx + 18)} ${n(top - 30)} ${n(cx + R - 2)} ${n(by - 4)}Z`;
      s += garment(c, brim, col, { folds: false, line: ln });
      s += garment(c, cone, col, { folds: false, line: ln });
      s += `<path d="M${n(cx - R + 5)} ${n(by - 6)}Q${n(cx)} ${n(by - 2)} ${n(cx + R - 3)} ${n(by - 8)}L${n(cx + R - 5)} ${n(by - 14)}Q${n(cx)} ${n(by - 8)} ${n(cx - R + 7)} ${n(by - 12)}Z" fill="${p.accent}" stroke="${p.accentLine}" stroke-width="1"/>`;
      if (witch) s += `<rect x="${n(cx - 5)}" y="${n(by - 14)}" width="10" height="8" rx="1" fill="none" stroke="${p.trim}" stroke-width="1.8"/>`;
      else s += emblem('star', cx + 6, top - 20, 4.5, p.trim, p.trimSh) + emblem('moon', cx - 6, top - 6, 3.2, p.trim, p.trimSh);
      break;
    }
    case 'mitre': {
      const col = '#f6f1e6';
      const by = top + 18;
      const d = `M${n(cx - R + 6)} ${n(by)}C${n(cx - R + 2)} ${n(top - 10)} ${n(cx - 12)} ${n(top - 36)} ${n(cx)} ${n(top - 46)}C${n(cx + 12)} ${n(top - 36)} ${n(cx + R - 2)} ${n(top - 10)} ${n(cx + R - 6)} ${n(by)}Q${n(cx)} ${n(by + 5)} ${n(cx - R + 6)} ${n(by)}Z`;
      s += garment(c, d, col, { folds: false });
      s += `<path d="M${n(cx)} ${n(top - 44)}V${n(by + 3)}" stroke="${p.trim}" stroke-width="4"/>`;
      s += `<path d="M${n(cx - R + 7)} ${n(by - 4)}Q${n(cx)} ${n(by + 1)} ${n(cx + R - 7)} ${n(by - 4)}" stroke="${p.trim}" stroke-width="3.6" fill="none"/>`;
      s += emblem('sun', cx, top - 14, 6, p.trim, p.trimSh);
      break;
    }
    case 'tricorn': {
      const col = '#2a1e1c';
      const by = top + 14;
      const d = `M${n(cx - R - 24)} ${n(by - 6)}Q${n(cx - R)} ${n(by + 8)} ${n(cx + 2)} ${n(by + 16)}Q${n(cx + R)} ${n(by + 8)} ${n(cx + R + 24)} ${n(by - 8)}Q${n(cx + R + 6)} ${n(top - 12)} ${n(cx + R - 4)} ${n(top - 16)}Q${n(cx)} ${n(top - 30)} ${n(cx - R + 2)} ${n(top - 16)}Q${n(cx - R - 8)} ${n(top - 12)} ${n(cx - R - 24)} ${n(by - 6)}Z`;
      s += garment(c, d, col, { folds: false });
      s += `<path d="M${n(cx - R - 22)} ${n(by - 5)}Q${n(cx - R)} ${n(by + 7)} ${n(cx + 2)} ${n(by + 14.5)}Q${n(cx + R)} ${n(by + 7)} ${n(cx + R + 22)} ${n(by - 7)}" stroke="${p.trim}" stroke-width="2" fill="none"/>`;
      s += emblem('skull', cx + 2, by - 4, 6, '#f3ead8', col);
      break;
    }
    case 'tophat': {
      const col = '#1f1a22';
      const by = top + 12;
      const brim = `M${n(cx - R - 16)} ${n(by + 2)}Q${n(cx)} ${n(by - 10)} ${n(cx + R + 16)} ${n(by)}Q${n(cx + R + 8)} ${n(by + 9)} ${n(cx)} ${n(by + 9)}Q${n(cx - R - 8)} ${n(by + 10)} ${n(cx - R - 16)} ${n(by + 2)}Z`;
      const crown = `M${n(cx - R + 2)} ${n(by - 2)}L${n(cx - R)} ${n(top - 44)}Q${n(cx)} ${n(top - 50)} ${n(cx + R + 2)} ${n(top - 44)}L${n(cx + R - 1)} ${n(by - 4)}Q${n(cx)} ${n(by + 2)} ${n(cx - R + 2)} ${n(by - 2)}Z`;
      s += garment(c, crown, col, { folds: false });
      s += `<path d="M${n(cx - R + 1.6)} ${n(by - 10)}Q${n(cx)} ${n(by - 4)} ${n(cx + R - 1.4)} ${n(by - 12)}L${n(cx + R - 1.2)} ${n(by - 19)}Q${n(cx)} ${n(by - 11)} ${n(cx - R + 1.4)} ${n(by - 17)}Z" fill="${p.accent}" stroke="${p.accentLine}" stroke-width="1"/>`;
      s += `<rect x="${n(cx - 5)}" y="${n(by - 18)}" width="10" height="8" rx="1" fill="none" stroke="${p.trim}" stroke-width="1.6"/>`;
      s += `<path d="M${n(cx - R + 6)} ${n(top - 40)}L${n(cx - R + 7)} ${n(by - 20)}" stroke="#ffffff" stroke-width="2" opacity=".2"/>`;
      s += garment(c, brim, col, { folds: false });
      break;
    }
    case 'visor': {
      const y = top + 26;
      s += `<path d="M${n(cx - R - 3)} ${n(y + 4)}Q${n(cx)} ${n(y - 6)} ${n(cx + R + 3)} ${n(y + 2)}" stroke="#1a1a1a" stroke-width="3" fill="none"/>`;
      s += `<path d="M${n(cx - R + 2)} ${n(y + 2)}Q${n(cx)} ${n(y - 5)} ${n(cx + R - 2)} ${n(y)}Q${n(cx + R - 4)} ${n(y + 16)} ${n(cx)} ${n(y + 18)}Q${n(cx - R + 4)} ${n(y + 16)} ${n(cx - R + 2)} ${n(y + 2)}Z" fill="#2fbf71" fill-opacity=".55" stroke="#0f5a33" stroke-width="1.3"/>`;
      s += `<path d="M${n(cx - R + 8)} ${n(y + 6)}Q${n(cx)} ${n(y + 1)} ${n(cx + R - 10)} ${n(y + 4)}" stroke="#bfffd8" stroke-width="1" fill="none" opacity=".7"/>`;
      break;
    }
    case 'helmet':
      s += helmet(c);
      break;
    case 'kettle': {
      const col = p.metal;
      const fill = metalGrad(c, col, 'kt');
      const ln = lineOn(col);
      const by = top + 18;
      s += `<path d="M${n(cx - R + 2)} ${n(by)}C${n(cx - R)} ${n(top - 18)} ${n(cx + R)} ${n(top - 18)} ${n(cx + R - 2)} ${n(by)}Z" fill="${fill}" stroke="${ln}" stroke-width="1.4"/>`;
      s += `<path d="M${n(cx - R - 14)} ${n(by + 4)}Q${n(cx)} ${n(by - 8)} ${n(cx + R + 14)} ${n(by + 2)}Q${n(cx)} ${n(by + 8)} ${n(cx - R - 14)} ${n(by + 4)}Z" fill="${fill}" stroke="${ln}" stroke-width="1.4"/>`;
      s += `<path d="M${n(cx - R * 0.5)} ${n(top - 4)}Q${n(cx - 4)} ${n(top - 12)} ${n(cx + 8)} ${n(top - 10)}" stroke="#fff" stroke-width="1.6" fill="none" opacity=".5"/>`;
      break;
    }
    case 'miner': {
      const col = '#c9a13a';
      const fill = metalGrad(c, col, 'mn');
      const ln = lineOn(col);
      const by = top + 18;
      s += `<path d="M${n(cx - R)} ${n(by)}C${n(cx - R - 2)} ${n(top - 16)} ${n(cx + R + 2)} ${n(top - 16)} ${n(cx + R)} ${n(by)}Z" fill="${fill}" stroke="${ln}" stroke-width="1.4"/>`;
      s += `<path d="M${n(cx - R - 6)} ${n(by + 2)}Q${n(cx)} ${n(by - 6)} ${n(cx + R + 6)} ${n(by + 1)}L${n(cx + R + 5)} ${n(by + 5)}Q${n(cx)} ${n(by - 1)} ${n(cx - R - 5)} ${n(by + 6)}Z" fill="${fill}" stroke="${ln}" stroke-width="1.2"/>`;
      const gid = mkId(c, 'lamp');
      addDef(c, radGrad(gid, [[0, '#fff6c8', 0.95], [0.4, '#ffd36a', 0.5], [1, '#ffb030', 0]]));
      s += `<circle cx="${n(cx)}" cy="${n(top - 2)}" r="16" fill="url(#${gid})"/>`;
      s += `<rect x="${n(cx - 5)}" y="${n(top - 7)}" width="10" height="10" rx="2" fill="#6a5a4a" stroke="#2a2018" stroke-width="1"/><circle cx="${n(cx)}" cy="${n(top - 2)}" r="3.4" fill="#fff4c0"/>`;
      break;
    }
    case 'straw': {
      const col = '#e3c77a';
      const by = top + 16;
      s += `<path d="M${n(cx - R - 30)} ${n(by + 6)}Q${n(cx)} ${n(by - 14)} ${n(cx + R + 30)} ${n(by + 4)}Q${n(cx)} ${n(by + 14)} ${n(cx - R - 30)} ${n(by + 6)}Z" fill="${col}" stroke="#7a5a24" stroke-width="1.3"/>`;
      s += `<path d="M${n(cx - R + 2)} ${n(by - 2)}C${n(cx - R + 2)} ${n(top - 16)} ${n(cx + R - 2)} ${n(top - 16)} ${n(cx + R - 2)} ${n(by - 4)}Z" fill="${col}" stroke="#7a5a24" stroke-width="1.3"/>`;
      s += `<path d="M${n(cx - R + 3)} ${n(by - 6)}Q${n(cx)} ${n(by - 2)} ${n(cx + R - 3)} ${n(by - 8)}" stroke="${p.accent}" stroke-width="3" fill="none"/>`;
      for (let i = 0; i < 6; i++) s += `<path d="M${n(cx - R - 20 + i * 18)} ${n(by + 2)}l6 -2" stroke="#b08a3a" stroke-width=".8"/>`;
      break;
    }
    case 'beret': {
      const col = p.accent;
      const by = top + 16;
      const d = `M${n(cx - R - 2)} ${n(by)}C${n(cx - R - 10)} ${n(top - 10)} ${n(cx + R + 20)} ${n(top - 14)} ${n(cx + R + 16)} ${n(by - 6)}Q${n(cx)} ${n(by + 6)} ${n(cx - R - 2)} ${n(by)}Z`;
      s += garment(c, d, col, { folds: false });
      s += `<path d="M${n(cx + R - 4)} ${n(by - 8)}C${n(cx + R + 8)} ${n(top - 30)} ${n(cx + R + 26)} ${n(top - 36)} ${n(cx + R + 34)} ${n(top - 40)}C${n(cx + R + 24)} ${n(top - 26)} ${n(cx + R + 12)} ${n(top - 14)} ${n(cx + R - 2)} ${n(by - 6)}Z" fill="#f6f1ea" stroke="#6a5a4a" stroke-width="1"/>`;
      s += `<path d="M${n(cx + R)} ${n(by - 8)}Q${n(cx + R + 16)} ${n(top - 24)} ${n(cx + R + 32)} ${n(top - 38)}" stroke="#b8a890" stroke-width=".8" fill="none"/>`;
      break;
    }
    case 'bandana': {
      const col = p.accent;
      const by = top + 22;
      const d = `M${n(cx - R - 3)} ${n(by)}C${n(cx - R - 4)} ${n(top - 6)} ${n(cx + R + 4)} ${n(top - 6)} ${n(cx + R + 3)} ${n(by - 2)}Q${n(cx)} ${n(by - 8)} ${n(cx - R - 3)} ${n(by)}Z`;
      s += garment(c, d, col, { folds: false });
      for (let i = 0; i < 5; i++) s += `<circle cx="${n(cx - R + 8 + i * 13)}" cy="${n(top + 8 + (i % 2) * 5)}" r="1.6" fill="#f3ead8" opacity=".85"/>`;
      s += `<path d="M${n(cx + R + 2)} ${n(by - 2)}l10 8l-3 14l-5 -12Z M${n(cx + R + 2)} ${n(by - 2)}l14 2l2 12Z" fill="${col}" stroke="${p.accentLine}" stroke-width="1"/>`;
      break;
    }
    case 'turban': {
      const col = p.accent;
      const by = top + 20;
      const d = `M${n(cx - R - 5)} ${n(by)}C${n(cx - R - 12)} ${n(top - 22)} ${n(cx + R + 12)} ${n(top - 22)} ${n(cx + R + 5)} ${n(by - 2)}Q${n(cx)} ${n(by + 4)} ${n(cx - R - 5)} ${n(by)}Z`;
      s += garment(c, d, col, { folds: false });
      for (let i = 0; i < 3; i++) s += `<path d="M${n(cx - R - 3 + i * 3)} ${n(by - 6 - i * 10)}Q${n(cx)} ${n(by - 2 - i * 14)} ${n(cx + R + 3 - i * 3)} ${n(by - 10 - i * 10)}" stroke="${shadowOf(col, 0.14)}" stroke-width="1.6" fill="none"/>`;
      s += gem(cx, by - 8, 5, p.metal === '#aeb8c4' ? '#e2455b' : '#e2455b');
      s += `<path d="M${n(cx)} ${n(by - 13)}q2 -10 8 -14" stroke="#f3ead8" stroke-width="2" fill="none" stroke-linecap="round"/>`;
      break;
    }
    case 'coinveil':
    case 'veil': {
      const coin = f.headwear === 'coinveil';
      const col = coin ? mix(p.accent, '#1a1024', 0.25) : mix(p.outfit, '#ffffff', 0.35);
      const d = `M${n(cx - R - 14)} ${n(g.neckY + 20)}C${n(cx - R - 16)} ${n(g.eyeY)} ${n(cx - R - 14)} ${n(top - 4)} ${n(cx)} ${n(top - 8)}C${n(cx + R + 14)} ${n(top - 4)} ${n(cx + R + 16)} ${n(g.eyeY)} ${n(cx + R + 14)} ${n(g.neckY + 20)}L${n(cx + R + 4)} ${n(g.neckY + 20)}C${n(cx + R + 6)} ${n(g.eyeY)} ${n(cx + R + 2)} ${n(top + 14)} ${n(cx)} ${n(top + 12)}C${n(cx - R - 2)} ${n(top + 14)} ${n(cx - R - 6)} ${n(g.eyeY)} ${n(cx - R - 4)} ${n(g.neckY + 20)}Z`;
      s += `<path d="${d}" fill="${col}" fill-opacity="${coin ? 0.9 : 0.55}" stroke="${lineOn(col)}" stroke-width="1.3" stroke-linejoin="round"/>`;
      s += `<path d="M${n(cx - R - 8)} ${n(g.eyeY + 20)}Q${n(cx - R - 10)} ${n(g.eyeY - 16)} ${n(cx - R * 0.4)} ${n(top - 2)}" stroke="${lightOf(col, 0.15)}" stroke-width="1.2" fill="none" opacity=".7"/>`;
      const by = top + 16;
      s += `<path d="M${n(cx - R - 1)} ${n(by + 2)}Q${n(cx)} ${n(by - 8)} ${n(cx + R + 1)} ${n(by)}" stroke="${p.trim}" stroke-width="2.4" fill="none"/>`;
      if (coin) {
        for (let i = 0; i < 9; i++) {
          const t = (i + 0.5) / 9;
          const x = lerp(cx - R + 2, cx + R - 2, t);
          const y = by + 2 - Math.sin(t * Math.PI) * 5 + 4;
          s += `<path d="M${n(x)} ${n(y - 4)}V${n(y)}" stroke="${p.trimSh}" stroke-width=".6"/><circle cx="${n(x)}" cy="${n(y + 2)}" r="2.3" fill="#f2c65a" stroke="#8a5e12" stroke-width=".6"/>`;
        }
        s += gem(cx, by - 3, 3.6, '#7fe3ff');
      } else {
        s += gem(cx, by - 3, 3.4, p.accent);
      }
      break;
    }
    default:
      break;
  }
  if (f.goggles) s += goggles(c);
  if (f.crown) s += crown(c);
  if (f.horns) s += horns(c);
  return s;
}

function helmet(c: Ctx): string {
  const { g, p, f } = c;
  const cx = g.cx;
  const R = g.R;
  const top = g.top - 6;
  const col = p.metal;
  const fill = metalGrad(c, col, 'hm');
  const ln = mix(shadowOf(col, 0.45), '#10081a', 0.5);
  const oy = g.eyeY - 15;
  const d =
    `M${n(cx - R - 7)} ${n(g.eyeY + 8)}C${n(cx - R - 10)} ${n(top - 2)} ${n(cx - R * 0.55)} ${n(top - 14)} ${n(cx)} ${n(top - 14)}` +
    `C${n(cx + R * 0.55)} ${n(top - 14)} ${n(cx + R + 10)} ${n(top - 2)} ${n(cx + R + 7)} ${n(g.eyeY + 8)}` +
    `L${n(cx + R + 5)} ${n(g.jawY + 8)}Q${n(cx + R - 1)} ${n(g.jawY + 13)} ${n(X(g, 0.78))} ${n(g.jawY + 3)}` +
    `L${n(X(g, 0.8))} ${n(oy + 6)}Q${n(X(g, 0.02))} ${n(oy - 5)} ${n(X(g, -0.8))} ${n(oy + 6)}` +
    `L${n(X(g, -0.78))} ${n(g.jawY + 3)}Q${n(cx - R + 1)} ${n(g.jawY + 13)} ${n(cx - R - 5)} ${n(g.jawY + 8)}Z`;
  let s = '';
  if (f.plume) {
    s += `<path d="M${n(cx - 2)} ${n(top - 12)}C${n(cx - 10)} ${n(top - 40)} ${n(cx + 20)} ${n(top - 50)} ${n(cx + 44)} ${n(top - 30)}C${n(cx + 30)} ${n(top - 34)} ${n(cx + 14)} ${n(top - 28)} ${n(cx + 6)} ${n(top - 10)}Z" fill="${p.accent}" stroke="${p.accentLine}" stroke-width="1.3"/>`;
    s += `<path d="M${n(cx + 2)} ${n(top - 16)}Q${n(cx + 14)} ${n(top - 36)} ${n(cx + 36)} ${n(top - 32)}" stroke="${lightOf(p.accent, 0.2)}" stroke-width="1.2" fill="none"/>`;
  }
  s += `<path d="${d}" fill="${fill}" stroke="${ln}" stroke-width="1.6" stroke-linejoin="round"/>`;
  s += `<path d="M${n(cx)} ${n(top - 13)}V${n(oy - 10)}" stroke="${ln}" stroke-width="1.2" opacity=".6"/>`;
  s += `<path d="M${n(cx - R * 0.7)} ${n(top + 6)}Q${n(cx - R * 0.4)} ${n(top - 8)} ${n(cx - 4)} ${n(top - 10)}" stroke="#fff" stroke-width="2" fill="none" opacity=".55" stroke-linecap="round"/>`;
  // raised visor band
  const vy = top + 4;
  const visor = `M${n(cx - R - 6)} ${n(vy + 10)}Q${n(cx)} ${n(vy - 6)} ${n(cx + R + 6)} ${n(vy + 8)}L${n(cx + R + 5)} ${n(vy + 20)}Q${n(cx)} ${n(vy + 8)} ${n(cx - R - 5)} ${n(vy + 22)}Z`;
  s += `<path d="${visor}" fill="${fill}" stroke="${ln}" stroke-width="1.5" stroke-linejoin="round"/>`;
  for (let i = -2; i <= 2; i++) s += `<path d="M${n(cx + i * 9 - 3)} ${n(vy + 11 - Math.abs(i) * 0.4)}h6" stroke="${ln}" stroke-width="1.6" stroke-linecap="round"/>`;
  if (p.trim) s += `<path d="M${n(X(g, -0.8))} ${n(oy + 6)}Q${n(X(g, 0.02))} ${n(oy - 5)} ${n(X(g, 0.8))} ${n(oy + 6)}" stroke="${p.trim}" stroke-width="1.6" fill="none"/>`;
  for (const k of [-1, 1]) s += `<circle cx="${n(cx + k * (R + 3))}" cy="${n(vy + 16)}" r="2.2" fill="${lightOf(col, 0.2)}" stroke="${ln}" stroke-width=".8"/>`;
  return s;
}

function goggles(c: Ctx): string {
  const { g } = c;
  const cx = g.cx;
  const R = g.R;
  const y = g.top + 16 - c.f.hairVol * 0.4;
  const lens = c.job === 'alquimista' ? '#8ee06a' : '#f0a640';
  let s = `<path d="M${n(cx - R - 5)} ${n(y + 4)}Q${n(cx)} ${n(y - 8)} ${n(cx + R + 5)} ${n(y + 2)}" stroke="#3a2a1e" stroke-width="4" fill="none"/>`;
  for (const k of [-1, 1]) {
    const x = cx + k * 12 + 2;
    s += `<circle cx="${n(x)}" cy="${n(y)}" r="8" fill="#8a6a3a" stroke="#3a2a1e" stroke-width="1.3"/>`;
    s += `<circle cx="${n(x)}" cy="${n(y)}" r="5.6" fill="${lens}" stroke="#3a2a1e" stroke-width=".8"/>`;
    s += `<path d="M${n(x - 3)} ${n(y - 2)}q2 -2.4 5 -1.8" stroke="#fff" stroke-width="1.2" fill="none" opacity=".8"/>`;
  }
  return s;
}

function crown(c: Ctx): string {
  const { g, f } = c;
  const cx = g.cx + 1;
  const y = g.top - f.hairVol + 8;
  const w = g.R * 0.78;
  const gold = '#f0c75a';
  const dark = '#8a5e12';
  let d = `M${n(cx - w)} ${n(y + 10)}L${n(cx - w)} ${n(y - 4)}`;
  const k = 5;
  for (let i = 0; i < k; i++) {
    const x0 = lerp(cx - w, cx + w, i / k);
    const x1 = lerp(cx - w, cx + w, (i + 1) / k);
    const tipH = i === 2 ? 18 : i % 2 ? 11 : 14;
    d += `L${n((x0 + x1) / 2)} ${n(y - 4 - tipH)}L${n(x1)} ${n(y - 4)}`;
  }
  d += `L${n(cx + w)} ${n(y + 10)}Q${n(cx)} ${n(y + 14)} ${n(cx - w)} ${n(y + 10)}Z`;
  let s = `<path d="${d}" fill="${gold}" stroke="${dark}" stroke-width="1.3" stroke-linejoin="round"/>`;
  s += `<path d="M${n(cx - w)} ${n(y + 2)}Q${n(cx)} ${n(y + 6)} ${n(cx + w)} ${n(y + 2)}" stroke="${dark}" stroke-width=".8" fill="none"/>`;
  for (let i = 0; i < k; i++) {
    const x = lerp(cx - w, cx + w, (i + 0.5) / k);
    const tipH = i === 2 ? 18 : i % 2 ? 11 : 14;
    s += `<circle cx="${n(x)}" cy="${n(y - 5 - tipH)}" r="1.8" fill="#fff4d6" stroke="${dark}" stroke-width=".5"/>`;
  }
  s += gem(cx, y + 5, 3.4, '#e2455b') + gem(cx - w * 0.55, y + 5, 2.4, '#3b7bd8') + gem(cx + w * 0.55, y + 5, 2.4, '#3b7bd8');
  s += `<path d="M${n(cx - w + 2)} ${n(y + 7)}V${n(y - 2)}" stroke="#fff" stroke-width="1.2" opacity=".5"/>`;
  return s;
}

function horns(c: Ctx): string {
  const { g, p } = c;
  const col = p.accent === '#000000' ? '#3b2a2a' : mix('#2e2228', p.hairSh, 0.3);
  const tip = '#e9dcc0';
  const id = mkId(c, 'hn');
  addDef(c, linGrad(id, [[0, col], [0.7, mix(col, tip, 0.5)], [1, tip]], 0, 1, 0, 0));
  let s = '';
  for (const k of [-1, 1]) {
    const bx = g.cx + k * g.R * 0.52;
    const by = g.top + 12;
    const d = `M${n(bx - k * 6)} ${n(by + 4)}C${n(bx - k * 4)} ${n(by - 18)} ${n(bx + k * 14)} ${n(by - 30)} ${n(bx + k * 30)} ${n(by - 36)}C${n(bx + k * 18)} ${n(by - 22)} ${n(bx + k * 10)} ${n(by - 8)} ${n(bx + k * 8)} ${n(by + 4)}Z`;
    s += `<path d="${d}" fill="url(#${id})" stroke="${lineOn(col)}" stroke-width="1.4" stroke-linejoin="round"/>`;
    for (let i = 1; i <= 3; i++) {
      const t = i / 4;
      const x = lerp(bx, bx + k * 22, t);
      const y = lerp(by, by - 28, t);
      s += `<path d="M${n(x - k * 5 * (1 - t))} ${n(y + 2)}q${n(k * 4)} -3 ${n(k * 9 * (1 - t) + k * 2)} ${n(-1)}" stroke="${lineOn(col)}" stroke-width=".8" fill="none" opacity=".6"/>`;
    }
  }
  return s;
}

/** Items in front of everything (fan). */
export function drawFrontGear(c: Ctx): string {
  const { p, f } = c;
  if (!f.fan) return '';
  const px = 40;
  const py = 204;
  const r = 50;
  const steel = '#c9cfdc';
  let d = `M${n(px)} ${n(py)}`;
  const a0 = -168;
  const a1 = -70;
  const k = 9;
  for (let i = 0; i <= k; i++) {
    const a = lerp(a0, a1, i / k);
    const q = polar(px, py, r + (i % 2 ? -2 : 2), a);
    d += `L${n(q.x)} ${n(q.y)}`;
  }
  d += 'Z';
  let s = `<path d="${d}" fill="${mix(p.accent, '#1a1024', 0.2)}" stroke="#2a1a2a" stroke-width="1.4" stroke-linejoin="round"/>`;
  s += `<path d="${d}" fill="none" stroke="${steel}" stroke-width=".8" transform="translate(0 0)" opacity=".7"/>`;
  for (let i = 0; i <= k; i++) {
    const a = lerp(a0, a1, i / k);
    const q = polar(px, py, r - 3, a);
    s += `<path d="M${n(px)} ${n(py)}L${n(q.x)} ${n(q.y)}" stroke="${steel}" stroke-width="1.1"/>`;
  }
  const arc0 = polar(px, py, r * 0.66, a0);
  const arc1 = polar(px, py, r * 0.66, a1);
  s += `<path d="M${n(arc0.x)} ${n(arc0.y)}A${n(r * 0.66)} ${n(r * 0.66)} 0 0 1 ${n(arc1.x)} ${n(arc1.y)}" stroke="${p.trim}" stroke-width="1.6" fill="none"/>`;
  const fl = polar(px, py, r * 0.82, -120);
  s += emblem('moon', fl.x, fl.y, 4, p.trim, p.trimSh);
  s += `<circle cx="${n(px)}" cy="${n(py - 2)}" r="3" fill="${p.trim}" stroke="${p.trimSh}" stroke-width=".8"/>`;
  return s;
}
