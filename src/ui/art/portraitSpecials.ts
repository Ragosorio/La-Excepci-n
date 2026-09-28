// Hand-built signature portraits that are not humanoid busts (Bruma, the Shadow, the Narrator)
// plus background effects used by special characters.
import type { PortraitSpec } from './portraits';
import type { Ctx } from './portraitCtx';
import { addDef, mkId } from './portraitCtx';
import { lerp, linGrad, makeRng, mix, n, polar, radGrad, svgOpen, uid } from './util';

// ---------------------------------------------------------------------------
// Background effects
// ---------------------------------------------------------------------------

export function drawAura(c: Ctx, col: string, strength = 0.4, key = 'au'): string {
  const id = mkId(c, key);
  addDef(c, radGrad(id, [[0, col, strength], [0.55, col, strength * 0.35], [1, col, 0]]));
  return `<circle cx="100" cy="${n(c.g.eyeY - 4)}" r="98" fill="url(#${id})"/>`;
}

export function drawEclipseHalo(c: Ctx): string {
  const cx = c.g.cx;
  const cy = c.g.eyeY - 22;
  const r = 58;
  const id = mkId(c, 'co');
  addDef(c, radGrad(id, [[0, '#9b5cff', 0], [0.7, '#9b5cff', 0], [0.8, '#f4ecff', 0.95], [0.86, '#b98cff', 0.6], [1, '#6a2cff', 0]]));
  let s = `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r * 1.35)}" fill="url(#${id})"/>`;
  for (let i = 0; i < 24; i++) {
    const a = i * 15 + (i % 2) * 5;
    const p0 = polar(cx, cy, r + 4, a);
    const p1 = polar(cx, cy, r + (i % 3 === 0 ? 34 : 18), a);
    s += `<path d="M${n(p0.x)} ${n(p0.y)}L${n(p1.x)} ${n(p1.y)}" stroke="#d9c2ff" stroke-width="${i % 3 === 0 ? 1.2 : 0.6}" opacity=".55"/>`;
  }
  s += `<circle cx="${n(cx)}" cy="${n(cy)}" r="${r}" fill="#07030c"/>`;
  s += `<circle cx="${n(cx)}" cy="${n(cy)}" r="${r}" fill="none" stroke="#f6f0ff" stroke-width="1.6"/>`;
  s += `<circle cx="${n(cx)}" cy="${n(cy)}" r="${r + 3}" fill="none" stroke="#b98cff" stroke-width="2.4" opacity=".5"/>`;
  return s;
}

// ---------------------------------------------------------------------------
// Bruma — the calm white-grey dog
// ---------------------------------------------------------------------------

function fluffCircle(cx: number, cy: number, rx: number, ry: number, bumps: number, amp: number, seed: string): string {
  const rng = makeRng(seed);
  let d = '';
  for (let i = 0; i <= bumps; i++) {
    const a = (i / bumps) * Math.PI * 2;
    const x = cx + Math.cos(a) * rx;
    const y = cy + Math.sin(a) * ry;
    if (i === 0) {
      d += `M${n(x)} ${n(y)}`;
      continue;
    }
    const am = ((i - 0.5) / bumps) * Math.PI * 2;
    const k = 1 + amp * rng.range(0.7, 1.3);
    d += `Q${n(cx + Math.cos(am) * rx * k)} ${n(cy + Math.sin(am) * ry * k)} ${n(x)} ${n(y)}`;
  }
  return d + 'Z';
}

export function brumaSVG(spec: PortraitSpec, size: number): string {
  const id = uid('br');
  const mood = spec.mood ?? 'neutral';
  const old = spec.age === 'old';
  const fur = old ? '#e6e3de' : '#f4f2ee';
  const furSh = old ? '#c2bdb8' : '#d6d1cc';
  const grey = old ? '#a9a39d' : '#b9b3ad';
  const line = '#4a3f45';
  const defs: string[] = [];
  defs.push(radGrad(`${id}g`, [[0, '#fff7e6', 0.55], [1, '#fff7e6', 0]]));
  let s = '';
  s += `<circle cx="100" cy="100" r="96" fill="url(#${id}g)"/>`;
  // chest fluff
  s += `<path d="${fluffCircle(100, 196, 70, 46, 18, 0.12, 'brchest')}" fill="${fur}" stroke="${line}" stroke-width="1.6"/>`;
  s += `<path d="M60 176Q100 196 140 174" stroke="${furSh}" stroke-width="6" fill="none" opacity=".7"/>`;
  // collar
  s += `<path d="M62 150Q100 170 138 150" stroke="#3aa6a0" stroke-width="7" fill="none" stroke-linecap="round"/>`;
  s += `<path d="M62 150Q100 170 138 150" stroke="#2a6a6a" stroke-width="7" fill="none" stroke-linecap="round" opacity=".25" transform="translate(0 2)"/>`;
  s += `<circle cx="100" cy="166" r="6" fill="#e8c15a" stroke="#8a5e12" stroke-width="1.2"/><path d="M97 166h6" stroke="#8a5e12" stroke-width="1"/>`;
  // ears (behind head)
  const earDown = mood === 'sad' || mood === 'scared' || mood === 'hurt' ? 10 : 0;
  s += `<path d="M58 62C40 60 30 84 34 ${112 + earDown}C38 ${128 + earDown} 52 ${126 + earDown} 58 ${112 + earDown}C62 98 66 80 70 70Z" fill="${grey}" stroke="${line}" stroke-width="1.6" stroke-linejoin="round"/>`;
  s += `<path d="M142 62C160 60 170 84 166 ${112 + earDown}C162 ${128 + earDown} 148 ${126 + earDown} 142 ${112 + earDown}C138 98 134 80 130 70Z" fill="${grey}" stroke="${line}" stroke-width="1.6" stroke-linejoin="round"/>`;
  s += `<path d="M46 80Q40 96 42 ${110 + earDown}M154 80Q160 96 158 ${110 + earDown}" stroke="${mix(grey, '#000', 0.2)}" stroke-width="1.2" fill="none" opacity=".6"/>`;
  // head
  s += `<path d="${fluffCircle(100, 98, 46, 44, 22, 0.1, 'brhead')}" fill="${fur}" stroke="${line}" stroke-width="1.7" stroke-linejoin="round"/>`;
  s += `<path d="M132 76Q148 104 128 132Q140 104 132 76Z" fill="${furSh}" opacity=".8"/>`;
  s += `<path d="M78 60Q92 52 110 56" stroke="#fff" stroke-width="3" fill="none" opacity=".8" stroke-linecap="round"/>`;
  // grey patch over one eye (identity mark)
  s += `<path d="M104 78Q124 70 134 86Q136 100 124 104Q112 102 106 92Z" fill="${grey}" opacity=".55"/>`;
  // muzzle
  s += `<path d="${fluffCircle(100, 120, 22, 15, 12, 0.08, 'brmuz')}" fill="#fbfaf7" stroke="${mix(line, fur, 0.4)}" stroke-width="1"/>`;
  // eyes
  const eyeY = 94;
  for (const k of [-1, 1]) {
    const ex = 100 + k * 20;
    if (mood === 'dead') {
      s += `<path d="M${ex - 5} ${eyeY - 5}l10 10M${ex + 5} ${eyeY - 5}l-10 10" stroke="#241a20" stroke-width="2.6" stroke-linecap="round"/>`;
      continue;
    }
    if (mood === 'smile') {
      s += `<path d="M${ex - 7} ${eyeY + 2}Q${ex} ${eyeY - 7} ${ex + 7} ${eyeY + 2}" stroke="#241a20" stroke-width="2.8" fill="none" stroke-linecap="round"/>`;
      continue;
    }
    const r = mood === 'surprised' || mood === 'scared' ? 7.8 : 7;
    s += `<ellipse cx="${ex}" cy="${eyeY}" rx="${r}" ry="${n(r * 1.08)}" fill="${old ? '#3a3040' : '#1f1418'}"/>`;
    s += `<ellipse cx="${ex}" cy="${eyeY + 2}" rx="${n(r * 0.6)}" ry="${n(r * 0.4)}" fill="#4a3a38" opacity=".7"/>`;
    if (old) s += `<ellipse cx="${ex}" cy="${eyeY}" rx="${n(r * 0.7)}" ry="${n(r * 0.7)}" fill="#9aa6c0" opacity=".25"/>`;
    s += `<circle cx="${ex - 2.4}" cy="${eyeY - 2.6}" r="2.3" fill="#fff"/><circle cx="${ex + 2.2}" cy="${eyeY + 2.4}" r="1" fill="#fff" opacity=".9"/>`;
    // calm lid
    if (mood !== 'surprised' && mood !== 'scared') s += `<path d="M${ex - 8} ${eyeY - 4}Q${ex} ${eyeY - 10} ${ex + 8} ${eyeY - 4}" stroke="${fur}" stroke-width="3" fill="none"/>`;
    // brow tufts
    const lift = mood === 'sad' || mood === 'scared' ? -3 : mood === 'angry' ? 3 : 0;
    s += `<path d="M${ex - k * 7} ${eyeY - 13 + lift}Q${ex} ${eyeY - 16} ${ex + k * 6} ${eyeY - 12 - lift * 0.5}" stroke="${grey}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
  }
  // nose + mouth
  s += `<path d="M91 110Q100 104 109 110Q108 117 100 119Q92 117 91 110Z" fill="#231a1e"/><ellipse cx="97" cy="110" rx="2.6" ry="1.4" fill="#fff" opacity=".6"/>`;
  s += `<path d="M100 119V124M100 124Q94 130 88 126M100 124Q106 130 112 126" stroke="#231a1e" stroke-width="1.6" fill="none" stroke-linecap="round"/>`;
  if (mood === 'smile' || mood === 'neutral') {
    if (mood === 'smile') s += `<path d="M95 127Q100 142 105 127Z" fill="#e87a8a" stroke="#8a2a3a" stroke-width="1"/><path d="M100 129v6" stroke="#b8505e" stroke-width=".8"/>`;
  }
  if (mood === 'angry') s += `<path d="M90 126l3 4l3 -4l4 4l4 -4l3 4l3 -4" stroke="#fff" stroke-width="1.5" fill="none"/>`;
  // cheeks
  s += `<ellipse cx="72" cy="112" rx="6" ry="3" fill="#ffb3b8" opacity=".35"/><ellipse cx="128" cy="112" rx="6" ry="3" fill="#ffb3b8" opacity=".35"/>`;
  if (mood === 'sad') s += `<path d="M122 102q-1.5 6 0 10q1.5 -4 0 -10Z" fill="#9fdcff"/>`;
  return `${svgOpen(size, 200, 200)}<defs>${defs.join('')}</defs>${s}</svg>`;
}

// ---------------------------------------------------------------------------
// The Shadow — a silhouette dissolving into fog, two thin violet eyes
// ---------------------------------------------------------------------------

export function shadowFigureSVG(spec: PortraitSpec, size: number): string {
  const id = uid('sh');
  const mood = spec.mood ?? 'neutral';
  const rng = makeRng(`${spec.seed}|shadow`);
  const defs: string[] = [];
  defs.push(linGrad(`${id}b`, [[0, '#0a0610'], [0.55, '#0d0816'], [0.8, '#1a1024', 0.7], [1, '#1a1024', 0]]));
  defs.push(radGrad(`${id}f`, [[0, '#3a2a52', 0.55], [1, '#3a2a52', 0]]));
  defs.push(radGrad(`${id}e`, [[0, '#c9a4ff', 0.9], [0.3, '#9b5cff', 0.45], [1, '#9b5cff', 0]]));
  defs.push(radGrad(`${id}a`, [[0, '#2a1a40', 0.6], [1, '#2a1a40', 0]]));
  let s = `<circle cx="100" cy="96" r="96" fill="url(#${id}a)"/>`;
  // fog behind
  for (let i = 0; i < 7; i++) {
    const x = lerp(20, 180, i / 6) + rng.range(-8, 8);
    s += `<ellipse cx="${n(x)}" cy="${n(172 + rng.range(-10, 10))}" rx="${n(rng.range(34, 52))}" ry="${n(rng.range(14, 22))}" fill="url(#${id}f)"/>`;
  }
  // silhouette
  const body = `M100 34C124 34 134 54 133 78C132 96 126 110 116 120C114 128 116 134 124 138C150 144 170 154 176 176L182 206H18L24 176C30 154 50 144 76 138C84 134 86 128 84 120C74 110 68 96 67 78C66 54 76 34 100 34Z`;
  s += `<path d="${body}" fill="url(#${id}b)"/>`;
  // dissolving wisps
  for (let i = 0; i < 9; i++) {
    const side = i % 2 ? 1 : -1;
    const y = rng.range(60, 170);
    const x0 = 100 + side * (y < 120 ? 30 : 50 + (y - 120) * 0.7);
    const x1 = x0 + side * rng.range(14, 34);
    const y1 = y - rng.range(12, 30);
    s += `<path d="M${n(x0)} ${n(y)}Q${n((x0 + x1) / 2 + side * 6)} ${n(y - 4)} ${n(x1)} ${n(y1)}" stroke="#120a1c" stroke-width="${n(rng.range(2, 5))}" fill="none" stroke-linecap="round" opacity="${n(rng.range(0.35, 0.8))}"/>`;
  }
  for (let i = 0; i < 12; i++) {
    const a = rng.range(0, Math.PI * 2);
    const r = rng.range(36, 44);
    s += `<circle cx="${n(100 + Math.cos(a) * r * 0.85)}" cy="${n(80 + Math.sin(a) * r)}" r="${n(rng.range(2, 6))}" fill="#0d0816" opacity="${n(rng.range(0.3, 0.8))}"/>`;
  }
  // eyes
  const tilt = mood === 'angry' ? 3 : mood === 'sad' ? -2 : 1;
  const open = mood === 'surprised' ? 3.4 : 1.8;
  for (const k of [-1, 1]) {
    const ex = 100 + k * 15;
    const ey = 84;
    s += `<ellipse cx="${ex}" cy="${ey}" rx="16" ry="9" fill="url(#${id}e)"/>`;
    s += `<path d="M${ex - k * 8} ${ey + tilt}Q${ex} ${n(ey - open - 0.5)} ${ex + k * 9} ${ey - tilt}Q${ex} ${n(ey + open * 0.5)} ${ex - k * 8} ${ey + tilt}Z" fill="#efe2ff"/>`;
  }
  return `${svgOpen(size, 200, 200)}<defs>${defs.join('')}</defs>${s}</svg>`;
}

// ---------------------------------------------------------------------------
// The Narrator — an open book with a single eye
// ---------------------------------------------------------------------------

export function narratorSVG(spec: PortraitSpec, size: number): string {
  const id = uid('nr');
  const mood = spec.mood ?? 'neutral';
  const defs: string[] = [];
  defs.push(radGrad(`${id}g`, [[0, '#ffe7a8', 0.7], [0.4, '#d9b36c', 0.25], [1, '#d9b36c', 0]]));
  defs.push(linGrad(`${id}p`, [[0, '#fbf5e8'], [1, '#e2d4b4']], 0, 0, 1, 0));
  defs.push(linGrad(`${id}q`, [[0, '#e2d4b4'], [1, '#fbf5e8']], 0, 0, 1, 0));
  defs.push(linGrad(`${id}i`, [[0, '#2a1450'], [0.5, '#7a3ad8'], [1, '#e3c8ff']]));
  let s = `<circle cx="100" cy="96" r="94" fill="url(#${id}g)"/>`;
  // rays
  for (let i = 0; i < 16; i++) {
    const a = -180 + i * 12;
    const p0 = polar(100, 92, 48, a);
    const p1 = polar(100, 92, i % 2 ? 78 : 92, a);
    s += `<path d="M${n(p0.x)} ${n(p0.y)}L${n(p1.x)} ${n(p1.y)}" stroke="#e8c77a" stroke-width="${i % 2 ? 1 : 1.8}" opacity=".6" stroke-linecap="round"/>`;
  }
  // book cover
  s += `<path d="M18 138L100 150L182 138L186 178L100 190L14 178Z" fill="#3a1f2a" stroke="#170a10" stroke-width="2" stroke-linejoin="round"/>`;
  s += `<path d="M18 138L14 178L24 179M182 138L186 178L176 179" stroke="#d9b36c" stroke-width="2.4" fill="none"/>`;
  // pages
  s += `<path d="M100 150C80 138 50 136 22 140L26 108C52 102 82 106 100 118Z" fill="url(#${id}p)" stroke="#5a4630" stroke-width="1.4" stroke-linejoin="round"/>`;
  s += `<path d="M100 150C120 138 150 136 178 140L174 108C148 102 118 106 100 118Z" fill="url(#${id}q)" stroke="#5a4630" stroke-width="1.4" stroke-linejoin="round"/>`;
  s += `<path d="M100 118V150" stroke="#5a4630" stroke-width="1.6"/>`;
  for (let i = 0; i < 4; i++) {
    const y = 114 + i * 7;
    s += `<path d="M${36} ${y + 2}Q60 ${y - 2} ${90} ${y + 6}" stroke="#8a7658" stroke-width=".9" fill="none" opacity=".55"/>`;
    s += `<path d="M${110} ${y + 6}Q140 ${y - 2} ${164} ${y + 2}" stroke="#8a7658" stroke-width=".9" fill="none" opacity=".55"/>`;
  }
  s += `<path d="M22 140L26 108M178 140L174 108" stroke="#c9b48a" stroke-width="1"/>`;
  // the eye
  const ey = 80;
  let open = 18;
  if (mood === 'surprised' || mood === 'scared') open = 24;
  if (mood === 'angry' || mood === 'determined') open = 11;
  if (mood === 'smug') open = 9;
  if (mood === 'sad') open = 13;
  if (mood === 'dead' || mood === 'shadow') open = 2;
  const eyeD = `M52 ${ey}Q100 ${ey - open * 2} 148 ${ey}Q100 ${ey + open * 1.6} 52 ${ey}Z`;
  const clip = `${id}c`;
  defs.push(`<clipPath id="${clip}"><path d="${eyeD}"/></clipPath>`);
  // lashes (rays of the lid)
  for (let i = 0; i < 9; i++) {
    const t = (i + 1) / 10;
    const x = lerp(56, 144, t);
    const y = ey - Math.sin(t * Math.PI) * open * 1;
    const ang = lerp(-150, -30, t);
    const q = polar(x, y, 9, ang);
    s += `<path d="M${n(x)} ${n(y)}L${n(q.x)} ${n(q.y)}" stroke="#2a1420" stroke-width="2" stroke-linecap="round"/>`;
  }
  s += `<path d="${eyeD}" fill="#fffaf0" stroke="#2a1420" stroke-width="2.6" stroke-linejoin="round"/>`;
  if (open > 3) {
    s += `<g clip-path="url(#${clip})">`;
    if (mood === 'mind') {
      s += `<circle cx="100" cy="${ey}" r="19" fill="url(#${id}i)"/>`;
      let d = 'M100 ' + ey;
      for (let i = 1; i <= 50; i++) {
        const a = (i / 50) * Math.PI * 6;
        const r = (i / 50) * 17;
        d += `L${n(100 + Math.cos(a) * r)} ${n(ey + Math.sin(a) * r)}`;
      }
      s += `<path d="${d}" stroke="#ffd1ff" stroke-width="1.4" fill="none"/>`;
    } else {
      s += `<circle cx="100" cy="${ey + 1}" r="19" fill="url(#${id}i)" stroke="#1a0a30" stroke-width="1.2"/>`;
      s += `<ellipse cx="100" cy="${ey + 1}" rx="${mood === 'angry' ? 3 : 7}" ry="${mood === 'angry' ? 13 : 9}" fill="#0a0414"/>`;
      s += `<circle cx="92" cy="${ey - 7}" r="4.6" fill="#fff"/><circle cx="108" cy="${ey + 8}" r="2" fill="#fff" opacity=".85"/>`;
    }
    s += `<path d="M52 ${ey}Q100 ${ey - open * 2} 148 ${ey}" stroke="#2a1420" stroke-width="${n(open * 0.5)}" fill="none" opacity=".18"/>`;
    s += `</g>`;
  }
  if (mood === 'sad') s += `<path d="M112 ${ey + 18}q-3 8 0 14q3 -6 0 -14Z" fill="#9fdcff"/>`;
  return `${svgOpen(size, 200, 200)}<defs>${defs.join('')}</defs>${s}</svg>`;
}
