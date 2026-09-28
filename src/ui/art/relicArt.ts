// Relic & item art (inventory, loot reveals, slot reels) + re-exports of heraldry / logo / tarot.
// Every function returns a standalone SVG string with unique gradient ids.
import type { Rng } from './util';
import { lightOf, linGrad, makeRng, mix, n, polar, radGrad, shadowOf, starPoints, svgOpen, uid } from './util';
export { crestSVG, logoSVG } from './heraldry';
export { tarotCardSVG } from './tarot';

export type RelicShape =
  | 'daga'
  | 'espada'
  | 'libro'
  | 'corona'
  | 'anillo'
  | 'amuleto'
  | 'orbe'
  | 'baston'
  | 'caliz'
  | 'mascara'
  | 'moneda'
  | 'dado'
  | 'campana'
  | 'farol'
  | 'pluma'
  | 'reloj'
  | 'brujula'
  | 'estandarte'
  | 'martillo'
  | 'arco'
  | 'guantelete'
  | 'espejo'
  | 'semilla'
  | 'ojo'
  | 'tambor'
  | 'llave'
  | 'collar'
  | 'capa'
  | 'cetro'
  | 'cuerno'
  | 'craneo'
  | 'carta'
  | 'botella'
  | 'escama'
  | 'corazon'
  | 'gema';
export type Rarity = 'comun' | 'pococomun' | 'rara' | 'epica' | 'legendaria' | 'mitica';

export const RARITY_COLORS: Record<Rarity, string> = {
  comun: '#c8c8c8',
  pococomun: '#1eff00',
  rara: '#0070dd',
  epica: '#a335ee',
  legendaria: '#ff8000',
  mitica: '#e6cc80',
};
export const RARITY_NAMES: Record<Rarity, string> = {
  comun: 'Común',
  pococomun: 'Poco común',
  rara: 'Rara',
  epica: 'Épica',
  legendaria: 'Legendaria',
  mitica: 'Mítica',
};

export const RELIC_SHAPES: RelicShape[] = ['daga', 'espada', 'libro', 'corona', 'anillo', 'amuleto', 'orbe', 'baston', 'caliz', 'mascara', 'moneda', 'dado', 'campana', 'farol', 'pluma', 'reloj', 'brujula', 'estandarte', 'martillo', 'arco', 'guantelete', 'espejo', 'semilla', 'ojo', 'tambor', 'llave', 'collar', 'capa', 'cetro', 'cuerno', 'craneo', 'carta', 'botella', 'escama', 'corazon', 'gema'];
export const RARITIES: Rarity[] = ['comun', 'pococomun', 'rara', 'epica', 'legendaria', 'mitica'];
const RANK: Record<Rarity, number> = { comun: 0, pococomun: 1, rara: 2, epica: 3, legendaria: 4, mitica: 5 };

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------

type Tri = [string, string, string]; // light, mid, dark
const METALS: Record<string, Tri> = {
  gold: ['#fff4c4', '#e9b949', '#7a4e0c'],
  silver: ['#ffffff', '#c8cfdb', '#4e5566'],
  bronze: ['#ffdcae', '#c7813c', '#552a0c'],
  iron: ['#c4c8d4', '#6c7080', '#1f212b'],
  obsidian: ['#9c8cc0', '#3a2a52', '#0b0612'],
  bone: ['#fffcf2', '#e4d6b4', '#7e6e4e'],
};
const GEMS: Record<string, Tri> = {
  ruby: ['#ffc2cc', '#e2455b', '#5e0a1c'],
  sapphire: ['#c2dcff', '#3b7bd8', '#0c2462'],
  emerald: ['#c2ffe0', '#2fbf71', '#073f22'],
  amethyst: ['#eadcff', '#9b5cff', '#2e1470'],
  topaz: ['#fff3c0', '#f2b632', '#6e4008'],
  aqua: ['#e6fcff', '#7fe3ff', '#145e7e'],
  onyx: ['#9a90a8', '#2a2233', '#050208'],
};
const ALTS: Record<string, Tri> = {
  wood: ['#e0ae72', '#8a5a2a', '#321a0a'],
  leather: ['#c08a62', '#6a3e22', '#26120a'],
  velvet: ['#f07a8a', '#8a1a2e', '#300410'],
  royal: ['#a490ff', '#4a2aa8', '#170a40'],
  cloth: ['#94a4f0', '#3a4aa8', '#121846'],
  parchment: ['#fffcf2', '#e8d8b0', '#86704a'],
  ivory: ['#ffffff', '#f3ead8', '#9a8a6a'],
};

function tri(base: string): Tri {
  return [lightOf(base, 0.28), base, shadowOf(base, 0.32)];
}

interface RC {
  /** Forced sub-variant for shapes that have several designs (e.g. d6 vs d20). */
  variant?: number;
  id: string;
  defs: string[];
  rng: Rng;
  rar: Rarity;
  rank: number;
  metal: Tri;
  gem: Tri;
  alt: Tri;
  line: string;
  col: string; // rarity color
}

const LINE = '#1a0d1e';

function makeRC(rar: Rarity, seed: string, shape: string, palette?: [string, string]): RC {
  const rng = makeRng(`${seed}|${shape}|${rar}`);
  const rank = RANK[rar];
  const metalPool = [['iron', 'bronze', 'bone'], ['bronze', 'iron', 'silver'], ['silver', 'silver', 'bronze'], ['silver', 'obsidian', 'gold'], ['gold', 'gold', 'silver'], ['gold', 'gold', 'gold', 'silver']][rank] as string[];
  const gemPool = [['onyx', 'topaz', 'aqua'], ['emerald', 'aqua', 'topaz'], ['sapphire', 'aqua', 'emerald'], ['amethyst', 'ruby', 'sapphire'], ['topaz', 'ruby', 'amethyst'], ['amethyst', 'aqua', 'ruby']][rank] as string[];
  const altPool = ['wood', 'leather', 'velvet', 'royal', 'cloth'];
  let metal = METALS[rng.pick(metalPool)] as Tri;
  let gem = GEMS[rng.pick(gemPool)] as Tri;
  const alt = ALTS[rng.pick(altPool)] as Tri;
  if (palette) {
    metal = tri(palette[0]);
    gem = tri(palette[1]);
  }
  return { id: uid('r'), defs: [], rng, rar, rank, metal, gem, alt, line: LINE, col: RARITY_COLORS[rar] };
}

function lg(rc: RC, key: string, t: Tri, dir: 'diag' | 'vert' | 'horiz' = 'diag'): string {
  const id = `${rc.id}${key}`;
  if (!rc.defs.some((d) => d.includes(`id="${id}"`))) {
    const [x2, y2] = dir === 'diag' ? [0.9, 1] : dir === 'vert' ? [0, 1] : [1, 0];
    rc.defs.push(linGrad(id, [[0, t[0]], [0.42, t[1]], [0.58, mix(t[1], t[2], 0.25)], [1, t[2]]], dir === 'diag' ? 0.1 : 0, 0, x2, y2));
  }
  return `url(#${id})`;
}

function rg(rc: RC, key: string, t: Tri): string {
  const id = `${rc.id}${key}`;
  if (!rc.defs.some((d) => d.includes(`id="${id}"`))) {
    rc.defs.push(radGrad(id, [[0, t[0]], [0.45, t[1]], [1, t[2]]], 0.36, 0.32, 0.75));
  }
  return `url(#${id})`;
}

const M = (rc: RC) => lg(rc, 'm', rc.metal);
const G = (rc: RC) => rg(rc, 'g', rc.gem);
const A = (rc: RC) => lg(rc, 'a', rc.alt, 'vert');

function sh(d: string, fill: string, w = 2.2, extra = ''): string {
  return `<path d="${d}" fill="${fill}" stroke="${LINE}" stroke-width="${w}" stroke-linejoin="round"${extra}/>`;
}
function hl(d: string, w = 2.4, o = 0.6): string {
  return `<path d="${d}" fill="none" stroke="#fff" stroke-width="${w}" stroke-linecap="round" stroke-opacity="${o}"/>`;
}
function ln(d: string, col = LINE, w = 1.2, o = 1): string {
  return `<path d="${d}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${o < 1 ? ` stroke-opacity="${o}"` : ''}/>`;
}
function circle(cx: number, cy: number, r: number, fill: string, w = 2): string {
  return `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="${fill}" stroke="${LINE}" stroke-width="${w}"/>`;
}
function gemDot(rc: RC, cx: number, cy: number, r: number): string {
  return circle(cx, cy, r, G(rc), Math.max(1, r * 0.3)) + `<circle cx="${n(cx - r * 0.35)}" cy="${n(cy - r * 0.38)}" r="${n(r * 0.32)}" fill="#fff" opacity=".85"/>`;
}
function faceted(rc: RC, cx: number, cy: number, r: number): string {
  // small brilliant-cut gem seen from the front
  const d = `M${n(cx)} ${n(cy - r)}L${n(cx + r * 0.9)} ${n(cy - r * 0.2)}L${n(cx)} ${n(cy + r)}L${n(cx - r * 0.9)} ${n(cy - r * 0.2)}Z`;
  return (
    sh(d, G(rc), Math.max(1, r * 0.22)) +
    ln(`M${n(cx - r * 0.9)} ${n(cy - r * 0.2)}H${n(cx + r * 0.9)}M${n(cx - r * 0.4)} ${n(cy - r * 0.2)}L${n(cx)} ${n(cy + r)}L${n(cx + r * 0.4)} ${n(cy - r * 0.2)}`, '#fff', Math.max(0.5, r * 0.08), 0.5) +
    `<path d="M${n(cx - r * 0.5)} ${n(cy - r * 0.35)}L${n(cx - r * 0.1)} ${n(cy - r * 0.75)}" stroke="#fff" stroke-width="${n(Math.max(0.8, r * 0.18))}" stroke-linecap="round"/>`
  );
}
function sparkle(x: number, y: number, r: number, col = '#fff', o = 1): string {
  return `<path d="M${n(x)} ${n(y - r)}Q${n(x + r * 0.12)} ${n(y - r * 0.12)} ${n(x + r)} ${n(y)}Q${n(x + r * 0.12)} ${n(y + r * 0.12)} ${n(x)} ${n(y + r)}Q${n(x - r * 0.12)} ${n(y + r * 0.12)} ${n(x - r)} ${n(y)}Q${n(x - r * 0.12)} ${n(y - r * 0.12)} ${n(x)} ${n(y - r)}Z" fill="${col}" opacity="${o}"/>`;
}
function rot(deg: number, body: string, cx = 50, cy = 50): string {
  return `<g transform="rotate(${deg} ${cx} ${cy})">${body}</g>`;
}

// ---------------------------------------------------------------------------
// Items (100×100, item roughly inside 12..88)
// ---------------------------------------------------------------------------

type Drawer = (rc: RC) => string;

function bladeItem(rc: RC, long: boolean): string {
  const v = rc.rng.int(0, 2); // 0 straight, 1 wavy, 2 broad / curved
  const tip = long ? 6 : 24;
  const base = long ? 64 : 60;
  const w = long ? 7 : 7.5;
  let blade: string;
  if (v === 1) {
    const k = 4;
    let d = `M50 ${tip}`;
    for (let i = 1; i <= k; i++) {
      const y = tip + ((base - tip) * i) / k;
      const x = 50 + w * (i % 2 ? 1.25 : 0.85);
      d += `Q${n(50 + w * 1.5)} ${n(y - (base - tip) / k / 2)} ${n(x)} ${n(y)}`;
    }
    d += `L${n(50 - w)} ${n(base)}`;
    for (let i = k - 1; i >= 0; i--) {
      const y = tip + ((base - tip) * i) / k;
      const x = i === 0 ? 50 : 50 - w * (i % 2 ? 1.25 : 0.85);
      d += `Q${n(50 - w * 1.5)} ${n(y + (base - tip) / k / 2)} ${n(x)} ${n(y)}`;
    }
    blade = d + 'Z';
  } else if (v === 2) {
    blade = `M52 ${tip}C${n(50 + w * 2.2)} ${n(tip + 16)} ${n(50 + w * 1.4)} ${n(base - 16)} ${n(50 + w)} ${n(base)}L${n(50 - w)} ${n(base)}C${n(50 - w * 0.9)} ${n(base - 20)} ${n(50 - w * 0.2)} ${n(tip + 14)} 52 ${tip}Z`;
  } else {
    blade = `M50 ${tip}C${n(50 + w * 0.7)} ${n(tip + 8)} ${n(50 + w)} ${n(tip + 14)} ${n(50 + w)} ${n(tip + 18)}L${n(50 + w)} ${n(base)}L${n(50 - w)} ${n(base)}L${n(50 - w)} ${n(tip + 18)}C${n(50 - w)} ${n(tip + 14)} ${n(50 - w * 0.7)} ${n(tip + 8)} 50 ${tip}Z`;
  }
  const steel = rc.rank >= 4 ? lg(rc, 'st', ['#ffffff', '#dfe6f2', '#6a7488']) : lg(rc, 'st', ['#f4f7fb', '#b8c0cc', '#4a5262']);
  let s = sh(blade, steel, 2);
  s += ln(`M50 ${tip + 8}V${base - 2}`, '#5a6272', 1.4, 0.7);
  s += hl(`M${n(50 - w * 0.55)} ${tip + 14}V${base - 4}`, 1.6, 0.8);
  if (rc.rank >= 3) s += ln(`M50 ${tip + 16}V${base - 10}`, rc.gem[1], 1.8, 0.9);
  const gw = long ? 21 : 16;
  const gy = base;
  s += sh(`M${50 - gw} ${gy + 1}Q50 ${gy - 5} ${50 + gw} ${gy + 1}Q${50 + gw + 3} ${gy + 4} ${50 + gw - 1} ${gy + 7}Q50 ${gy + 3} ${50 - gw + 1} ${gy + 7}Q${50 - gw - 3} ${gy + 4} ${50 - gw} ${gy + 1}Z`, M(rc), 2);
  s += gemDot(rc, 50, gy + 2.5, 3.6);
  const gl = long ? 16 : 15;
  s += sh(`M46 ${gy + 6}H54V${gy + 6 + gl}H46Z`, A(rc), 1.8);
  for (let i = 0; i < 4; i++) s += ln(`M46 ${gy + 9 + i * 3.6}L54 ${gy + 7 + i * 3.6}`, rc.alt[2], 1.2, 0.8);
  s += circle(50, gy + 10 + gl, 5.2, M(rc), 2);
  s += hl(`M47.6 ${gy + 8 + gl}q1.4 -1.2 3 -.6`, 1.2, 0.8);
  return long ? rot(42, s) : `<g transform="translate(50 50) rotate(38) scale(1.12) translate(-50 -54)">${s}</g>`;
}

const ITEMS: Record<RelicShape, Drawer> = {
  daga: (rc) => bladeItem(rc, false),
  espada: (rc) => bladeItem(rc, true),
  libro: (rc) => {
    const cover = rc.rank >= 3 ? lg(rc, 'cv', ALTS.royal as Tri, 'vert') : A(rc);
    let s = sh('M28 20H74A4 4 0 0 1 78 24V80A4 4 0 0 1 74 84H28Z', lg(rc, 'pg', ALTS.parchment as Tri, 'horiz'), 2);
    for (let i = 0; i < 6; i++) s += ln(`M${76 - i * 0.5} ${24 + i}V${80 - i}`, '#a8946a', 0.8, 0.6);
    s += sh('M22 16H70A4 4 0 0 1 74 20V78A4 4 0 0 1 70 82H22A3 3 0 0 1 19 79V19A3 3 0 0 1 22 16Z', cover, 2.2);
    s += sh('M19 19A3 3 0 0 1 22 16H28V82H22A3 3 0 0 1 19 79Z', lg(rc, 'sp', [rc.alt[1], rc.alt[2], '#0a0408'], 'horiz'), 1.6);
    s += ln('M19 28H28M19 70H28', rc.metal[1], 2);
    // corner caps
    for (const [x, y, sx, sy] of [[74, 16, -1, 1], [74, 82, -1, -1]] as const) {
      s += sh(`M${x} ${y}h${sx * 10}l${-sx * 10} ${sy * 10}z`, M(rc), 1.4);
    }
    const ex = 48;
    const ey = 49;
    s += `<circle cx="${ex}" cy="${ey}" r="14" fill="none" stroke="${LINE}" stroke-width="5"/><circle cx="${ex}" cy="${ey}" r="14" fill="none" stroke="${rc.metal[1]}" stroke-width="3"/>`;
    const emb = rc.rng.int(0, 2);
    if (emb === 0) {
      s += sh(`M${ex - 11} ${ey}Q${ex} ${ey - 10} ${ex + 11} ${ey}Q${ex} ${ey + 10} ${ex - 11} ${ey}Z`, '#f6eedc', 1.4) + gemDot(rc, ex, ey, 4.6);
    } else if (emb === 1) {
      s += circle(ex, ey, 9, '#f6f0ff', 1.2) + circle(ex + 1, ey + 0.8, 7.6, '#07030c', 0.5);
    } else {
      s += faceted(rc, ex, ey, 8);
    }
    s += sh('M72 42H80V56H72Z', M(rc), 1.6);
    s += hl('M24 22V76', 1.4, 0.35);
    return rot(-8, s);
  },
  corona: (rc) => {
    const tips: Array<[number, number]> = [[20, 38], [35, 30], [50, 20], [65, 30], [80, 38]];
    let d = 'M22 64L20 38';
    const valleys = [52, 50, 50, 52];
    for (let i = 1; i < tips.length; i++) {
      const [x0] = tips[i - 1] as [number, number];
      const [x1, y1] = tips[i] as [number, number];
      d += `L${n((x0 + x1) / 2)} ${valleys[i - 1]}L${x1} ${y1}`;
    }
    d += 'L78 64Q50 72 22 64Z';
    let s = sh('M26 62Q50 36 74 62Z', lg(rc, 'vl', ALTS.velvet as Tri, 'vert'), 1.4);
    s += sh(d, M(rc), 2.2);
    s += sh('M21 64Q50 72 79 64L79 76Q50 85 21 76Z', M(rc), 2.2);
    s += ln('M22 69Q50 77 78 69', rc.metal[2], 1, 0.6);
    for (const [x, y] of tips) s += circle(x, y - 2.5, 3.2, lg(rc, 'pr', ['#ffffff', '#f3ead8', '#b8a888']), 1.2);
    s += faceted(rc, 50, 73, 6) + gemDot(rc, 34, 71, 3.6) + gemDot(rc, 66, 71, 3.6);
    s += hl('M26 60L24 42M42 50L36 34', 1.8, 0.5);
    return s;
  },
  anillo: (rc) => {
    const band = 'M26 60A24 16 0 1 0 74 60A24 16 0 1 0 26 60ZM33 62A17 10 0 1 1 67 62A17 10 0 1 1 33 62Z';
    let s = `<path d="${band}" fill="${M(rc)}" fill-rule="evenodd" stroke="${LINE}" stroke-width="2.2"/>`;
    s += hl('M30 56Q36 47 50 46', 2, 0.7);
    // setting
    s += sh('M38 44L42 34H58L62 44Q50 50 38 44Z', M(rc), 1.8);
    s += faceted(rc, 50, 32, 12);
    for (const x of [39, 61]) s += sh(`M${x} 40l${x < 50 ? 3 : -3} -10l${x < 50 ? 2 : -2} 1z`, M(rc), 1);
    s += sparkle(64, 22, 5);
    return s;
  },
  amuleto: (rc) => {
    let s = '';
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      const x = 22 + 56 * t;
      const y = 14 + Math.sin(t * Math.PI) * 30;
      s += `<ellipse cx="${n(x)}" cy="${n(y)}" rx="2.4" ry="1.6" fill="none" stroke="${rc.metal[1]}" stroke-width="1.4" transform="rotate(${n((t - 0.5) * 120)} ${n(x)} ${n(y)})"/>`;
    }
    s += circle(50, 47, 3.4, M(rc), 1.4);
    const v = rc.rng.int(0, 2);
    if (v === 0) {
      s += sh('M50 50C62 56 68 66 66 74C64 84 56 88 50 88C44 88 36 84 34 74C32 66 38 56 50 50Z', M(rc), 2.2) + sh('M50 58C58 62 61 69 60 74C58 80 54 82 50 82C46 82 42 80 40 74C39 69 42 62 50 58Z', G(rc), 1.4);
    } else if (v === 1) {
      s += sh(`M50 50L67 60V78L50 88L33 78V60Z`, M(rc), 2.2) + faceted(rc, 50, 69, 11);
    } else {
      s += circle(50, 69, 18, M(rc), 2.2) + circle(50, 69, 12.5, G(rc), 1.4) + `<path d="M42 64a10 10 0 0 1 12 -5" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" opacity=".7"/>`;
      s += `<circle cx="50" cy="69" r="15.3" fill="none" stroke="${rc.metal[2]}" stroke-width="1" stroke-dasharray="2 2.2"/>`;
    }
    s += hl('M40 60Q44 55 50 54', 1.6, 0.6);
    return s;
  },
  orbe: (rc) => {
    let s = sh('M32 76Q50 92 68 76L64 70Q50 80 36 70Z', M(rc), 2);
    s += `<ellipse cx="50" cy="84" rx="14" ry="3.6" fill="${rc.metal[2]}" stroke="${LINE}" stroke-width="1.6"/>`;
    const og = `${rc.id}ob`;
    rc.defs.push(radGrad(og, [[0, '#ffffff'], [0.25, rc.gem[0]], [0.62, rc.gem[1]], [1, rc.gem[2]]], 0.38, 0.35, 0.72));
    s += circle(50, 48, 25, `url(#${og})`, 2.4);
    s += `<path d="M50 48m-2 0a2 2 0 1 1 4 0 5 5 0 1 1-9 1 9 9 0 1 1 16-3 13 13 0 1 1-20 12" fill="none" stroke="#fff" stroke-width="1.6" opacity=".55" stroke-linecap="round"/>`;
    s += `<ellipse cx="41" cy="37" rx="7" ry="4.5" fill="#fff" opacity=".6" transform="rotate(-30 41 37)"/>`;
    s += `<path d="M62 64Q70 56 71 46" stroke="#fff" stroke-width="1.6" fill="none" opacity=".35" stroke-linecap="round"/>`;
    for (const k of [-1, 1]) s += sh(`M${50 + k * 13} 74C${50 + k * 24} 70 ${50 + k * 26} 60 ${50 + k * 24} 54l${k * -3} 3C${50 + k * 21} 64 ${50 + k * 18} 69 ${50 + k * 10} 72Z`, M(rc), 1.4);
    s += sparkle(58, 52, 4, '#fff', 0.9);
    return s;
  },
  baston: (rc) => {
    let s = sh('M46.5 34H53.5V90A3.5 3.5 0 0 1 46.5 90Z', lg(rc, 'wd', ALTS.wood as Tri, 'horiz'), 2);
    s += ln('M49 40V86', '#fff', 1, 0.3);
    for (const y of [40, 66]) s += sh(`M45 ${y}H55V${y + 5}H45Z`, M(rc), 1.4);
    s += sh('M44 34C34 30 34 14 44 10C40 18 42 26 48 30ZM56 34C66 30 66 14 56 10C60 18 58 26 52 30Z', M(rc), 1.6);
    const cr = rc.rng.chance(0.5);
    if (cr) s += sh('M50 4L59 20L50 36L41 20Z', G(rc), 2) + ln('M41 20H59M50 4V36', '#fff', 1, 0.45);
    else s += circle(50, 21, 10, G(rc), 2) + `<ellipse cx="46" cy="17" rx="3.4" ry="2.2" fill="#fff" opacity=".7"/>`;
    s += sparkle(62, 12, 4);
    return rot(24, s);
  },
  caliz: (rc) => {
    let s = sh('M24 22H76C76 42 66 54 50 54C34 54 24 42 24 22Z', M(rc), 2.2);
    s += `<ellipse cx="50" cy="22" rx="26" ry="5" fill="${lg(rc, 'wn', [rc.gem[0], rc.gem[1], rc.gem[2]], 'horiz')}" stroke="${LINE}" stroke-width="2"/>`;
    s += `<ellipse cx="46" cy="21" rx="10" ry="1.6" fill="#fff" opacity=".45"/>`;
    s += ln('M27 32Q50 42 73 32', rc.metal[2], 1.4, 0.6);
    s += gemDot(rc, 50, 40, 5) + gemDot(rc, 35, 36, 3) + gemDot(rc, 65, 36, 3);
    s += sh('M46 54H54V70H46Z', M(rc), 1.8);
    s += `<ellipse cx="50" cy="62" rx="7.5" ry="4" fill="${M(rc)}" stroke="${LINE}" stroke-width="1.8"/>`;
    s += sh('M30 86Q34 74 46 70H54Q66 74 70 86Z', M(rc), 2);
    s += `<ellipse cx="50" cy="86" rx="20" ry="4" fill="${rc.metal[2]}" stroke="${LINE}" stroke-width="1.8"/>`;
    s += hl('M30 26Q32 42 42 50', 2.2, 0.6);
    return s;
  },
  mascara: (rc) => {
    const full = rc.rng.chance(0.45);
    const porcelain = lg(rc, 'pc', ['#ffffff', '#f1e8f0', '#a898b0']);
    let s = '';
    if (full) {
      s += sh('M50 12C70 12 80 28 78 50C76 72 64 88 50 88C36 88 24 72 22 50C20 28 30 12 50 12Z', porcelain, 2.2);
      s += sh('M30 44Q37 38 44 44Q37 50 30 44ZM56 44Q63 38 70 44Q63 50 56 44Z', '#1a0d1e', 1);
      s += ln('M42 70Q50 66 58 70', LINE, 2);
      s += `<path d="M37 49q-2 10 1 20M63 49q2 10 -1 20" stroke="${rc.gem[1]}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`;
      s += ln('M50 14V26', rc.metal[1], 3);
      s += gemDot(rc, 50, 30, 4);
      s += hl('M30 30Q34 18 46 15', 2, 0.7);
    } else {
      if (rc.rank >= 2) s += sh('M70 36C76 24 86 20 92 12C90 24 84 34 74 40Z', lg(rc, 'fe', [lightOf(rc.gem[1], 0.3), rc.gem[1], rc.gem[2]]), 1.6);
      s += sh('M14 42C26 30 42 32 50 40C58 32 74 30 86 42C86 58 76 66 64 66C57 66 53 60 50 56C47 60 43 66 36 66C24 66 14 58 14 42Z', porcelain, 2.2);
      s += sh('M26 48Q34 40 42 48Q34 55 26 48ZM58 48Q66 40 74 48Q66 55 58 48Z', '#1a0d1e', 1);
      s += `<path d="M15 42C26 31 42 33 50 41C58 33 74 31 85 42" fill="none" stroke="${rc.metal[1]}" stroke-width="3"/>`;
      s += gemDot(rc, 50, 44, 3.6);
      s += `<path d="M22 58q6 5 14 3M78 58q-6 5 -14 3" stroke="${rc.gem[1]}" stroke-width="1.6" fill="none"/>`;
      s += hl('M22 40Q30 34 40 36', 1.8, 0.7);
    }
    return s;
  },
  moneda: (rc) => {
    let s = circle(55, 53, 31, rc.metal[2], 2.2);
    s += circle(50, 50, 31, M(rc), 2.2);
    s += `<circle cx="50" cy="50" r="27" fill="none" stroke="${rc.metal[2]}" stroke-width="1.6" stroke-dasharray="1.6 2.2"/>`;
    s += `<circle cx="50" cy="50" r="22" fill="none" stroke="${rc.metal[2]}" stroke-width="1.4" opacity=".8"/>`;
    const e = rc.rng.int(0, 2);
    if (e === 0) {
      s += `<circle cx="50" cy="50" r="12" fill="none" stroke="${rc.metal[0]}" stroke-width="2.4"/><circle cx="51.5" cy="51" r="10.2" fill="${rc.metal[2]}"/>`;
    } else if (e === 1) {
      s += `<polygon points="${starPoints(50, 50, 14, 6, 8)}" fill="${rc.metal[0]}" stroke="${rc.metal[2]}" stroke-width="1.2"/>`;
    } else {
      s += `<path d="M36 58L34 42L42 50L50 38L58 50L66 42L64 58Z" fill="${rc.metal[0]}" stroke="${rc.metal[2]}" stroke-width="1.4" stroke-linejoin="round"/>`;
    }
    s += hl('M28 40Q34 26 48 22', 2.6, 0.7);
    s += sparkle(70, 30, 5);
    return s;
  },
  dado: (rc) => {
    const d20 = rc.variant !== undefined ? rc.variant === 1 : rc.rng.chance(0.4);
    if (d20) {
      const P = [[50, 12], [82, 30], [82, 70], [50, 88], [18, 70], [18, 30]];
      const T = [[50, 28], [70, 62], [30, 62]];
      const hex = `M${P.map((p) => p.join(' ')).join('L')}Z`;
      let s = sh(hex, rg(rc, 'dg', rc.gem), 2.4);
      s += sh(`M${T.map((p) => p.join(' ')).join('L')}Z`, lg(rc, 'dt', [rc.gem[0], rc.gem[1], rc.gem[1]]), 1.6);
      s += ln('M50 12L50 28M82 30L70 62M18 30L30 62M50 28L82 30M50 28L18 30M70 62L82 70M70 62L50 88M30 62L50 88M30 62L18 70', LINE, 1.4, 0.8);
      s += `<text x="50" y="53" text-anchor="middle" font-family="Cinzel, serif" font-weight="700" font-size="14" fill="#fff" stroke="${LINE}" stroke-width=".6">20</text>`;
      s += hl('M24 32L48 16', 1.8, 0.6);
      return s;
    }
    const face = rc.rank >= 3 ? rc.gem : (ALTS.ivory as Tri);
    let s = sh('M50 14L82 31L50 48L18 31Z', lg(rc, 'd1', [face[0], face[0], face[1]]), 2.2);
    s += sh('M18 31L50 48V86L18 69Z', lg(rc, 'd2', [face[1], face[1], face[2]]), 2.2);
    s += sh('M82 31L50 48V86L82 69Z', lg(rc, 'd3', [mix(face[1], face[2], 0.4), face[2], face[2]]), 2.2);
    const pip = rc.rank >= 3 ? '#fff' : '#1a0d1e';
    const pips: Array<[number, number, number]> = [[50, 31, 4], [27, 45, 3.2], [41, 64, 3.2], [60, 58, 3], [66, 50, 3], [72, 43, 3], [60, 72, 3], [66, 66, 3], [72, 59, 3]];
    for (const [x, y, r] of pips.slice(0, 6)) s += `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${n(r * 0.8)}" fill="${pip}"/>`;
    s += hl('M24 31L48 19', 1.8, 0.7);
    return s;
  },
  campana: (rc) => {
    let s = `<circle cx="50" cy="13" r="6" fill="none" stroke="${LINE}" stroke-width="5.4"/><circle cx="50" cy="13" r="6" fill="none" stroke="${rc.metal[1]}" stroke-width="3"/>`;
    s += sh('M50 18C36 18 30 30 30 45C30 59 26 67 19 73H81C74 67 70 59 70 45C70 30 64 18 50 18Z', M(rc), 2.2);
    s += sh('M18 72Q50 80 82 72L82 77Q50 86 18 77Z', lg(rc, 'bl', [rc.metal[1], rc.metal[2], rc.metal[2]]), 2);
    s += ln('M31 50Q50 56 69 50', rc.metal[2], 2.2, 0.7);
    for (let i = 0; i < 5; i++) s += ln(`M${36 + i * 7} 52.5v-3`, rc.metal[0], 1.4, 0.9);
    s += circle(50, 84, 5, rc.metal[2], 1.8);
    s += hl('M38 28Q34 40 35 56', 2.6, 0.6);
    if (rc.rank >= 3) s += `<path d="M12 50q-4 8 0 16M88 50q4 8 0 16M6 46q-6 12 0 24M94 46q6 12 0 24" stroke="${rc.col}" stroke-width="1.8" fill="none" stroke-linecap="round" opacity=".8"/>`;
    return s;
  },
  farol: (rc) => {
    const fg = `${rc.id}fl`;
    rc.defs.push(radGrad(fg, [[0, '#fffbe0'], [0.3, '#ffd36a'], [0.7, '#ff9a30', 0.7], [1, '#ff7a20', 0.2]], 0.5, 0.55, 0.6));
    let s = `<circle cx="50" cy="12" r="6" fill="none" stroke="${LINE}" stroke-width="5"/><circle cx="50" cy="12" r="6" fill="none" stroke="${rc.metal[1]}" stroke-width="2.6"/>`;
    s += sh('M40 18H60L66 27H34Z', M(rc), 2);
    s += sh('M35 27H65V71H35Z', `url(#${fg})`, 2);
    s += `<path d="M50 60C44 60 42 54 45 49C47 46 49 44 50 38C52 44 54 46 56 49C58 54 56 60 50 60Z" fill="#fffbe6" stroke="#ff9a30" stroke-width="1.2"/>`;
    s += ln('M42.5 27V71M57.5 27V71', LINE, 2.4);
    s += ln('M42.5 27V71M57.5 27V71', rc.metal[1], 1.2);
    s += sh('M33 71H67L62 80H38Z', M(rc), 2);
    s += hl('M38 31V66', 1.6, 0.5);
    return s;
  },
  pluma: (rc) => {
    const vane = rc.rank >= 3 ? lg(rc, 'vn', [rc.gem[0], rc.gem[1], rc.gem[2]]) : lg(rc, 'vn', ['#ffffff', '#e8e4f0', '#8a84a0']);
    let s = sh('M76 10C56 16 36 40 30 66L38 71C52 52 68 34 76 10Z', vane, 2);
    for (let i = 1; i < 7; i++) {
      const t = i / 7;
      const x = 30 + (76 - 30) * t;
      const y = 68 - 58 * t;
      s += ln(`M${n(x + 2)} ${n(y + 1)}l${n(-6 + t * 2)} ${n(-2)}`, LINE, 0.9, 0.5);
      s += ln(`M${n(x + 2)} ${n(y + 1)}l${n(5)} ${n(3 - t * 2)}`, LINE, 0.9, 0.4);
    }
    s += ln('M76 10C60 24 44 44 34 68', LINE, 1.4, 0.8);
    s += sh('M30 66L38 71L30 86L27 84Z', M(rc), 1.8);
    s += `<path d="M28 88q-2 5 0 7q2 -2 0 -7Z" fill="${rc.gem[1]}" stroke="${LINE}" stroke-width="1"/>`;
    s += hl('M70 16Q56 28 46 44', 1.6, 0.7);
    return s;
  },
  reloj: (rc) => {
    let s = `<path d="M70 66C84 70 86 84 76 90" fill="none" stroke="${rc.metal[1]}" stroke-width="2.4" stroke-dasharray="3 1.6"/>`;
    s += `<circle cx="50" cy="16" r="5.4" fill="none" stroke="${LINE}" stroke-width="4.6"/><circle cx="50" cy="16" r="5.4" fill="none" stroke="${rc.metal[1]}" stroke-width="2.4"/>`;
    s += sh('M45 20H55V27H45Z', M(rc), 1.6);
    s += circle(50, 55, 29, M(rc), 2.4);
    s += circle(50, 55, 23, lg(rc, 'fc', ALTS.ivory as Tri, 'vert'), 1.6);
    for (let i = 0; i < 12; i++) {
      const p0 = polar(50, 55, i % 3 === 0 ? 16 : 18.5, i * 30 - 90);
      const p1 = polar(50, 55, 21, i * 30 - 90);
      s += ln(`M${n(p0.x)} ${n(p0.y)}L${n(p1.x)} ${n(p1.y)}`, LINE, i % 3 === 0 ? 2 : 1.1);
    }
    s += ln('M50 55L50 40M50 55L60 60', LINE, 2.2);
    s += circle(50, 55, 2.4, rc.gem[1], 1);
    s += `<path d="M34 44A20 20 0 0 1 48 34" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".6"/>`;
    return s;
  },
  brujula: (rc) => {
    let s = sh('M45 16H55V24H45Z', M(rc), 1.6);
    s += circle(50, 53, 31, M(rc), 2.4);
    s += circle(50, 53, 25, lg(rc, 'cf', ['#3a4a8a', '#1a2450', '#0a0f2a'], 'vert'), 1.6);
    s += `<polygon points="${starPoints(50, 53, 20, 5, 4)}" fill="${rc.metal[1]}" stroke="${LINE}" stroke-width="1" opacity=".9"/>`;
    s += `<polygon points="${starPoints(50, 53, 12, 4, 4, -45)}" fill="${rc.metal[0]}" stroke="${LINE}" stroke-width=".8" opacity=".7"/>`;
    s += sh('M50 30L55 53H45Z', '#e2455b', 1.2) + sh('M50 76L55 53H45Z', '#f3ead8', 1.2);
    s += circle(50, 53, 3, M(rc), 1);
    s += `<path d="M31 42A22 22 0 0 1 44 32" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" opacity=".5"/>`;
    return s;
  },
  estandarte: (rc) => {
    let s = ln('M28 12V92', LINE, 6);
    s += ln('M28 12V92', rc.alt === ALTS.wood ? rc.alt[1] : '#8a5a2a', 3.6);
    s += sh('M28 4L32 12H24Z', M(rc), 1.4);
    s += sh('M26 16H80V21H26Z', M(rc), 1.6);
    const cloth = lg(rc, 'bn', [lightOf(rc.gem[1], 0.1), rc.gem[1], rc.gem[2]], 'horiz');
    s += sh('M31 21H77V80L66 72L54 84L42 72L31 80Z', cloth, 2);
    s += `<path d="M40 21V76M60 21V78" stroke="#000" stroke-width="5" opacity=".12"/>`;
    s += ln('M34 25H74M34 68H74', rc.metal[1], 1.6);
    s += `<circle cx="54" cy="46" r="11" fill="none" stroke="${rc.metal[0]}" stroke-width="2.4"/><circle cx="55.2" cy="47" r="9.2" fill="#07030c"/>`;
    s += sparkle(84, 14, 3.6);
    return s;
  },
  martillo: (rc) => {
    let s = sh('M47 36H53V88H47Z', lg(rc, 'hd', ALTS.wood as Tri, 'horiz'), 1.8);
    for (let i = 0; i < 4; i++) s += ln(`M47 ${64 + i * 5}L53 ${61 + i * 5}`, '#3a2010', 1.4);
    s += circle(50, 90, 4.2, M(rc), 1.6);
    s += sh('M24 20L29 14H71L76 20V38L71 44H29L24 38Z', M(rc), 2.4);
    s += sh('M24 20L29 14V44L24 38Z', rc.metal[2], 1.2) + sh('M76 20L71 14V44L76 38Z', rc.metal[2], 1.2);
    const glow = rc.rank >= 2 ? rc.gem[1] : rc.metal[2];
    s += `<path d="M44 22L50 29L44 36M56 22L50 29L56 36" stroke="${glow}" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
    s += hl('M31 18H68', 2, 0.7);
    return rot(-32, s);
  },
  arco: (rc) => {
    const limb = lg(rc, 'lb', rc.rank >= 3 ? rc.metal : (ALTS.wood as Tri), 'horiz');
    let s = ln('M34 12L34 88', '#efe6d0', 1.2);
    s += `<path d="M34 12C52 20 60 36 57 50C60 64 52 80 34 88" fill="none" stroke="${LINE}" stroke-width="8.4" stroke-linecap="round"/>`;
    s += `<path d="M34 12C52 20 60 36 57 50C60 64 52 80 34 88" fill="none" stroke="${limb}" stroke-width="5.4" stroke-linecap="round"/>`;
    s += `<path d="M34 12q-4 -2 -6 1M34 88q-4 2 -6 -1" stroke="${LINE}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
    s += sh('M54 43H62V57H54Z', A(rc), 1.6);
    s += ln('M24 50H80', LINE, 3.2);
    s += ln('M24 50H80', '#c9a06a', 1.6);
    s += sh('M80 50L90 45V55Z', M(rc), 1.4);
    s += `<path d="M24 50l-6 -5h6l4 5l-4 5h-6Z" fill="${rc.gem[1]}" stroke="${LINE}" stroke-width="1.2"/>`;
    s += hl('M40 18Q52 26 54 38', 1.4, 0.6);
    return rot(-28, s);
  },
  guantelete: (rc) => {
    const m = M(rc);
    let s = sh('M32 70L68 70L70 90L30 90Z', m, 2.2);
    s += ln('M31 80H69', rc.metal[2], 1.4);
    for (const x of [36, 50, 64]) s += circle(x, 85, 1.4, rc.metal[0], 0.8);
    s += sh('M33 70C31 56 33 44 37 36L63 36C67 44 69 56 67 70Z', m, 2.2);
    const fx = [39, 46.5, 54, 61.5];
    const top = [18, 12, 13, 19];
    fx.forEach((x, i) => {
      const t = top[i] as number;
      for (let j = 0; j < 3; j++) {
        const y0 = 36 - j * ((36 - t) / 3);
        const y1 = y0 - (36 - t) / 3 - 1;
        s += sh(`M${x - 3.6} ${n(y0)}L${x - 3.3} ${n(y1)}Q${x} ${n(y1 - 2.4)} ${x + 3.3} ${n(y1)}L${x + 3.6} ${n(y0)}Z`, m, 1.4);
      }
    });
    s += sh('M33 56C26 52 22 44 24 38C28 36 32 40 34 46Z', m, 1.8);
    s += faceted(rc, 50, 52, 7);
    s += hl('M37 44Q36 56 37 66', 1.8, 0.6);
    return s;
  },
  espejo: (rc) => {
    const gl = `${rc.id}gl`;
    rc.defs.push(linGrad(gl, [[0, '#f2fbff'], [0.45, mix('#bfe8ff', rc.gem[0], 0.3)], [1, mix('#6a8ab8', rc.gem[2], 0.3)]], 0.2, 0, 0.8, 1));
    let s = sh('M45 66H55L57 90H43Z', M(rc), 2);
    s += circle(50, 91, 3.6, M(rc), 1.4);
    s += `<ellipse cx="50" cy="38" rx="26" ry="30" fill="${M(rc)}" stroke="${LINE}" stroke-width="2.4"/>`;
    s += `<ellipse cx="50" cy="38" rx="20" ry="24" fill="url(#${gl})" stroke="${LINE}" stroke-width="1.6"/>`;
    if (rc.rank >= 4) s += `<path d="M42 39Q50 31 58 39Q50 47 42 39Z" fill="#fff" fill-opacity=".35" stroke="${rc.col}" stroke-width="1.2"/><circle cx="50" cy="39" r="3" fill="${rc.col}" opacity=".7"/>`;
    s += `<path d="M36 30L48 18M36 40L54 22" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".7"/>`;
    s += gemDot(rc, 50, 8.5, 4);
    for (const k of [-1, 1]) s += `<path d="M${50 + k * 24} 50q${k * 6} 6 ${k * 2} 12" stroke="${rc.metal[1]}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`;
    return s;
  },
  semilla: (rc) => {
    const hg = `${rc.id}sg`;
    rc.defs.push(radGrad(hg, [[0, '#d8ffb0', 0.8], [0.5, '#7bdc5a', 0.25], [1, '#7bdc5a', 0]]));
    let s = `<circle cx="50" cy="56" r="36" fill="url(#${hg})"/>`;
    s += `<path d="M50 34C50 26 50 20 51 12" stroke="${LINE}" stroke-width="4.6" fill="none" stroke-linecap="round"/><path d="M50 34C50 26 50 20 51 12" stroke="#5aa83a" stroke-width="2.4" fill="none" stroke-linecap="round"/>`;
    s += sh('M51 18C58 8 70 8 76 12C70 20 60 22 51 18Z', lg(rc, 'lf', ['#c8f59a', '#5aa83a', '#1f4a14']), 1.6);
    s += sh('M50 22C44 14 34 14 28 18C34 25 43 26 50 22Z', lg(rc, 'lf', ['#c8f59a', '#5aa83a', '#1f4a14']), 1.6);
    s += sh('M50 32C66 38 68 62 50 84C32 62 34 38 50 32Z', lg(rc, 'sd', rc.rank >= 3 ? rc.metal : ['#e8b878', '#9a6a3a', '#3a2010']), 2.2);
    s += `<path d="M50 40V76M50 52L42 46M50 60L58 54M50 68L43 63" stroke="${rc.rank >= 2 ? rc.gem[0] : '#ffe8b0'}" stroke-width="1.6" fill="none" stroke-linecap="round" opacity=".85"/>`;
    s += hl('M43 44Q41 54 44 64', 1.8, 0.6);
    return s;
  },
  ojo: (rc) => {
    let s = '';
    for (let i = 0; i < 14; i++) {
      const a = 180 + (i / 13) * 180;
      const p0 = polar(50, 52, 30, a);
      const p1 = polar(50, 52, i % 2 ? 38 : 44, a);
      s += `<path d="M${n(p0.x)} ${n(p0.y)}L${n(p1.x)} ${n(p1.y)}" stroke="${rc.metal[1]}" stroke-width="${i % 2 ? 2 : 3}" stroke-linecap="round"/>`;
    }
    s += sh('M12 52C28 26 72 26 88 52C72 78 28 78 12 52Z', M(rc), 2.4);
    s += sh('M21 52C34 36 66 36 79 52C66 68 34 68 21 52Z', '#fbf5ea', 1.6);
    const ig = `${rc.id}ir`;
    rc.defs.push(radGrad(ig, [[0, rc.gem[0]], [0.5, rc.gem[1]], [1, rc.gem[2]]], 0.5, 0.6, 0.6));
    s += circle(50, 52, 14, `url(#${ig})`, 1.8);
    s += rc.rank >= 3 ? `<ellipse cx="50" cy="52" rx="3.4" ry="11" fill="#07030c"/>` : `<circle cx="50" cy="52" r="6" fill="#07030c"/>`;
    s += `<circle cx="45" cy="46.5" r="3.6" fill="#fff"/><circle cx="55" cy="57" r="1.6" fill="#fff" opacity=".85"/>`;
    s += `<path d="M21 52C34 36 66 36 79 52" fill="none" stroke="#000" stroke-width="5" opacity=".15"/>`;
    return s;
  },
  tambor: (rc) => {
    let s = ln('M30 12L58 40M70 12L42 40', LINE, 5);
    s += ln('M30 12L58 40M70 12L42 40', '#c9a06a', 2.8);
    s += circle(30, 12, 3.6, '#efe4c8', 1.4) + circle(70, 12, 3.6, '#efe4c8', 1.4);
    s += sh('M22 44V70C22 78 34 84 50 84S78 78 78 70V44', lg(rc, 'dr', rc.rank >= 2 ? (ALTS.velvet as Tri) : (ALTS.wood as Tri), 'horiz'), 2.2);
    for (let i = 0; i < 6; i++) {
      const x0 = 26 + i * 9.6;
      s += ln(`M${n(x0)} ${n(52 + Math.sin(((x0 - 22) / 56) * Math.PI) * 5)}L${n(x0 + 4.8)} ${n(74 + Math.sin(((x0 - 22) / 56) * Math.PI) * 5)}`, '#efe4c8', 1.6);
    }
    s += `<ellipse cx="50" cy="44" rx="28" ry="9" fill="${lg(rc, 'sk', ALTS.parchment as Tri, 'vert')}" stroke="${LINE}" stroke-width="2.2"/>`;
    s += `<ellipse cx="50" cy="44" rx="28" ry="9" fill="none" stroke="${rc.metal[1]}" stroke-width="3"/>`;
    s += `<path d="M22 70C22 78 34 84 50 84S78 78 78 70" fill="none" stroke="${rc.metal[1]}" stroke-width="3"/>`;
    s += `<ellipse cx="44" cy="42" rx="12" ry="3" fill="#fff" opacity=".35"/>`;
    return s;
  },
  llave: (rc) => {
    let s = `<path d="M50 8A14 14 0 1 1 49.9 8ZM50 15A7 7 0 1 0 50.1 15Z" fill="${M(rc)}" fill-rule="evenodd" stroke="${LINE}" stroke-width="2.2"/>`;
    for (let i = 0; i < 4; i++) {
      const p = polar(50, 22, 14, i * 90 - 45);
      s += circle(p.x, p.y, 3.4, M(rc), 1.4);
    }
    s += gemDot(rc, 50, 22, 4.2);
    s += sh('M46.5 36H53.5V84H46.5Z', M(rc), 2);
    s += sh('M44 40H56V44H44ZM44 58H56V61H44Z', M(rc), 1.4);
    s += sh('M53 70H66V76H60V82H53Z', M(rc), 1.8);
    s += hl('M48.5 38V80', 1.4, 0.6);
    return rot(38, s);
  },
  collar: (rc) => {
    let s = '';
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      const x = 16 + 68 * t;
      const y = 16 + Math.sin(t * Math.PI) * 42;
      s += `<circle cx="${n(x)}" cy="${n(y)}" r="2.6" fill="${M(rc)}" stroke="${LINE}" stroke-width="1"/>`;
    }
    for (const t of [0.25, 0.75]) {
      const x = 16 + 68 * t;
      const y = 16 + Math.sin(t * Math.PI) * 42 + 3;
      s += faceted(rc, x, y + 2, 5);
    }
    s += sh('M50 58C60 64 64 72 62 78C60 86 54 90 50 90C46 90 40 86 38 78C36 72 40 64 50 58Z', M(rc), 2.2);
    s += sh('M50 64C56 68 58 73 57 77C55 82 52 84 50 84C48 84 45 82 43 77C42 73 44 68 50 64Z', G(rc), 1.4);
    s += `<path d="M45 70q2 -3 5 -3" stroke="#fff" stroke-width="1.8" fill="none" stroke-linecap="round" opacity=".8"/>`;
    s += sparkle(62, 62, 4);
    return s;
  },
  capa: (rc) => {
    const outer = lg(rc, 'co', rc.alt, 'vert');
    const lining = lg(rc, 'cl', rc.rank >= 3 ? (ALTS.royal as Tri) : (ALTS.velvet as Tri), 'vert');
    let s = sh('M32 16C26 40 18 64 12 88C30 92 70 92 88 88C82 64 74 40 68 16Z', outer, 2.2);
    s += sh('M38 20C35 44 31 66 28 86C42 88 58 88 72 86C69 66 65 44 62 20Z', lining, 1.6);
    s += `<path d="M44 26C42 48 40 68 38 86M56 26C58 48 60 68 62 86" stroke="#000" stroke-width="3" opacity=".18" fill="none"/>`;
    s += sh('M28 12Q50 24 72 12L72 20Q50 32 28 20Z', rc.rank >= 2 ? '#f3ead8' : outer, 2);
    s += circle(50, 22, 6, M(rc), 1.8) + gemDot(rc, 50, 22, 3);
    s += hl('M30 30Q24 56 18 82', 2, 0.45);
    return s;
  },
  cetro: (rc) => {
    let s = sh('M47 38H53V86H47Z', M(rc), 2);
    for (const y of [44, 62, 78]) s += `<ellipse cx="50" cy="${y}" rx="6" ry="3" fill="${M(rc)}" stroke="${LINE}" stroke-width="1.6"/>`;
    s += circle(50, 90, 4.4, M(rc), 1.6);
    s += `<path d="M38 38C36 24 42 12 50 8C58 12 64 24 62 38Z" fill="none" stroke="${LINE}" stroke-width="5.6" stroke-linejoin="round"/>`;
    s += `<path d="M38 38C36 24 42 12 50 8C58 12 64 24 62 38Z" fill="none" stroke="${rc.metal[1]}" stroke-width="3" stroke-linejoin="round"/>`;
    s += `<path d="M44 36C43 26 46 16 50 12M56 36C57 26 54 16 50 12" fill="none" stroke="${rc.metal[1]}" stroke-width="2"/>`;
    s += circle(50, 25, 8.5, G(rc), 1.8) + `<ellipse cx="47" cy="22" rx="3" ry="2" fill="#fff" opacity=".75"/>`;
    s += sh('M40 38H60V42H40Z', M(rc), 1.4);
    s += sparkle(64, 10, 4);
    return rot(20, s);
  },
  cuerno: (rc) => {
    const bone = lg(rc, 'hn', ALTS.ivory as Tri);
    let s = sh('M84 22C70 20 44 28 30 44C22 53 18 62 18 72L36 76C36 66 40 58 46 52C56 42 70 36 86 32Z', bone, 2.2);
    s += `<ellipse cx="27" cy="74" rx="9.4" ry="5" fill="${rc.alt[2]}" stroke="${LINE}" stroke-width="2" transform="rotate(12 27 74)"/>`;
    for (const [x, y, r] of [[58, 34, -22], [42, 46, -38]] as const) s += `<rect x="${x - 3}" y="${y - 9}" width="6" height="18" rx="2" fill="${M(rc)}" stroke="${LINE}" stroke-width="1.4" transform="rotate(${r} ${x} ${y})"/>`;
    s += sh('M83 21L90 22L90 32L85 33Z', M(rc), 1.6);
    s += `<path d="M42 48Q56 60 76 36" stroke="${rc.alt[1]}" stroke-width="3" fill="none" opacity=".9"/>`;
    s += hl('M80 25C64 26 46 34 34 48', 1.8, 0.7);
    return s;
  },
  craneo: (rc) => {
    const bone = lg(rc, 'bn', ALTS.ivory as Tri);
    let s = '';
    if (rc.rank >= 2) {
      s += sh('M46 8H54V20H46Z', '#efe6d0', 1.4);
      s += `<path d="M50 3C52 6 53 8 50 10C47 8 48 6 50 3Z" fill="#ffd36a" stroke="#ff9a30" stroke-width="1"/>`;
    }
    s += sh('M50 18C68 18 80 30 80 46C80 56 75 63 68 67V78A4 4 0 0 1 64 82H36A4 4 0 0 1 32 78V67C25 63 20 56 20 46C20 30 32 18 50 18Z', bone, 2.4);
    const eye = rc.rank >= 3 ? rc.col : '#1a0d1e';
    s += `<ellipse cx="38" cy="48" rx="8" ry="9" fill="#1a0d1e"/><ellipse cx="62" cy="48" rx="8" ry="9" fill="#1a0d1e"/>`;
    if (rc.rank >= 3) s += `<circle cx="38" cy="49" r="3" fill="${eye}"/><circle cx="62" cy="49" r="3" fill="${eye}"/>`;
    s += sh('M50 58L45 66H55Z', '#1a0d1e', 1);
    s += ln('M42 72V81M50 72V81M58 72V81', LINE, 1.6);
    if (rc.rank >= 1) s += faceted(rc, 50, 32, 5);
    s += hl('M30 36Q34 24 46 21', 2.4, 0.7);
    return s;
  },
  carta: (rc) => {
    let s = rot(10, sh('M34 16H70A4 4 0 0 1 74 20V80A4 4 0 0 1 70 84H34A4 4 0 0 1 30 80V20A4 4 0 0 1 34 16Z', '#1a1024', 2) + `<rect x="35" y="21" width="34" height="58" rx="2" fill="none" stroke="${rc.metal[1]}" stroke-width="1.2"/>`, 52, 50);
    const card = 'M30 14H66A4 4 0 0 1 70 18V82A4 4 0 0 1 66 86H30A4 4 0 0 1 26 82V18A4 4 0 0 1 30 14Z';
    let f = sh(card, lg(rc, 'cd', ['#3a2458', '#1f1236', '#0d0714'], 'vert'), 2.2);
    f += `<rect x="30.5" y="18.5" width="35" height="63" rx="2" fill="none" stroke="${rc.metal[1]}" stroke-width="1.6"/>`;
    f += `<rect x="33" y="21" width="30" height="58" rx="1.5" fill="none" stroke="${rc.metal[1]}" stroke-width=".7" opacity=".7"/>`;
    f += `<circle cx="48" cy="50" r="12" fill="none" stroke="${rc.metal[0]}" stroke-width="2"/><circle cx="49.2" cy="51" r="10.2" fill="#07030c"/>`;
    f += `<polygon points="${starPoints(48, 27, 3.4, 1.4, 4)}" fill="${rc.metal[1]}"/><polygon points="${starPoints(48, 73, 3.4, 1.4, 4)}" fill="${rc.metal[1]}"/>`;
    s += rot(-8, f, 48, 50);
    return s;
  },
  botella: (rc) => {
    const v = rc.rng.int(0, 2);
    const glass = `${rc.id}gs`;
    rc.defs.push(linGrad(glass, [[0, '#ffffff', 0.55], [0.5, mix('#dff6ff', rc.gem[0], 0.3), 0.3], [1, '#9ab0d8', 0.4]], 0, 0, 1, 0));
    const liq = lg(rc, 'lq', rc.gem, 'vert');
    let s = '';
    if (v === 0) {
      s += `<path d="M44 22V36A24 24 0 1 0 56 36V22Z" fill="url(#${glass})" stroke="${LINE}" stroke-width="2.2"/>`;
      s += `<path d="M28.6 58A21.4 21.4 0 0 0 71.4 58Q60 54 50 58T28.6 58Z" fill="${liq}"/>`;
      s += `<circle cx="46" cy="68" r="2.4" fill="#fff" opacity=".7"/><circle cx="55" cy="74" r="1.6" fill="#fff" opacity=".6"/><circle cx="52" cy="64" r="1.2" fill="#fff" opacity=".6"/>`;
      s += `<path d="M44 22V36A24 24 0 1 0 56 36V22Z" fill="none" stroke="${LINE}" stroke-width="2.2"/>`;
      s += `<path d="M34 50A18 18 0 0 1 42 40" stroke="#fff" stroke-width="2.6" fill="none" stroke-linecap="round" opacity=".75"/>`;
    } else if (v === 1) {
      s += `<path d="M45 22V34C36 38 34 44 34 50V82A4 4 0 0 0 38 86H62A4 4 0 0 0 66 82V50C66 44 64 38 55 34V22Z" fill="url(#${glass})" stroke="${LINE}" stroke-width="2.2"/>`;
      s += `<path d="M35 56Q50 51 65 56V82A3 3 0 0 1 62 85H38A3 3 0 0 1 35 82Z" fill="${liq}"/>`;
      s += `<path d="M45 22V34C36 38 34 44 34 50V82A4 4 0 0 0 38 86H62A4 4 0 0 0 66 82V50C66 44 64 38 55 34V22Z" fill="none" stroke="${LINE}" stroke-width="2.2"/>`;
      s += sh('M38 62H62V74H38Z', lg(rc, 'lbl', ALTS.parchment as Tri, 'vert'), 1.2) + `<path d="M42 68h16" stroke="#8a7650" stroke-width="1.4"/>`;
      s += `<path d="M39 46V58" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".7"/>`;
    } else {
      s += `<path d="M45 22V32L50 36L55 32V22ZM50 36C60 30 76 34 76 50C76 64 60 76 50 86C40 76 24 64 24 50C24 34 40 30 50 36Z" fill="url(#${glass})" stroke="${LINE}" stroke-width="2.2" stroke-linejoin="round"/>`;
      s += `<path d="M26 56Q50 50 74 56C72 66 60 76 50 84C40 76 28 66 26 56Z" fill="${liq}"/>`;
      s += `<path d="M50 36C60 30 76 34 76 50C76 64 60 76 50 86C40 76 24 64 24 50C24 34 40 30 50 36Z" fill="none" stroke="${LINE}" stroke-width="2.2"/>`;
      s += `<path d="M32 44Q34 38 40 38" stroke="#fff" stroke-width="2.6" fill="none" stroke-linecap="round" opacity=".75"/>`;
    }
    s += sh('M43 12H57V23H43Z', lg(rc, 'ck', ALTS.wood as Tri), 1.8);
    s += sparkle(66, 30, 4);
    return s;
  },
  escama: (rc) => {
    const ir = `${rc.id}ir`;
    rc.defs.push(linGrad(ir, [[0, rc.gem[0]], [0.35, rc.gem[1]], [0.62, mix(rc.gem[1], '#7fe3ff', 0.35)], [1, rc.gem[2]]], 0, 0, 1, 1));
    const outer = 'M50 8C60 22 80 36 82 58C84 78 68 92 50 92C32 92 16 78 18 58C20 36 40 22 50 8Z';
    let s = sh(outer, `url(#${ir})`, 2.4);
    s += `<path d="M50 20C57 30 70 40 71 58C72 72 62 82 50 82C38 82 28 72 29 58C30 40 43 30 50 20Z" fill="none" stroke="#fff" stroke-width="1.2" opacity=".35"/>`;
    for (const k of [-1, -0.5, 0, 0.5, 1]) s += `<path d="M50 14Q${n(50 + k * 14)} 50 ${n(50 + k * 26)} ${n(84 - Math.abs(k) * 10)}" fill="none" stroke="${LINE}" stroke-width="1" opacity=".35"/>`;
    s += `<path d="M24 70Q50 80 76 70" fill="none" stroke="#fff" stroke-width="1" opacity=".3"/>`;
    s += hl('M40 24Q28 40 27 58', 2.4, 0.65);
    s += sparkle(64, 34, 4.4);
    return s;
  },
  corazon: (rc) => {
    const heart = 'M50 86L22 58C8 44 14 20 33 19C43 18.5 48 25 50 31C52 25 57 18.5 67 19C86 20 92 44 78 58Z';
    let s = sh(heart, G(rc), 2.4);
    const c = { x: 50, y: 46 };
    const pts = [[22, 58], [18, 34], [33, 19], [50, 31], [67, 19], [82, 34], [78, 58], [50, 86]];
    pts.forEach((p, i) => {
      const q = pts[(i + 1) % pts.length] as number[];
      const shade = i % 2 ? '#ffffff' : '#000000';
      s += `<path d="M${c.x} ${c.y}L${p[0]} ${p[1]}L${q[0]} ${q[1]}Z" fill="${shade}" opacity="${i % 2 ? 0.14 : 0.12}"/>`;
    });
    s += ln(pts.map((p) => `M${c.x} ${c.y}L${p[0]} ${p[1]}`).join(''), '#fff', 0.9, 0.35);
    s += `<path d="M28 30Q32 24 40 24" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" opacity=".8"/>`;
    s += sparkle(66, 34, 4.6);
    return s;
  },
  gema: (rc) => {
    let s = sh('M22 36L35 20H65L78 36L50 86Z', G(rc), 2.4);
    s += `<path d="M22 36H78L50 86Z" fill="#000" opacity=".16"/>`;
    s += `<path d="M35 20L42 36L50 20L58 36L65 20" fill="#fff" opacity=".18"/>`;
    s += ln('M22 36H78M35 20L42 36L50 86L58 36L65 20M42 36L50 20L58 36M22 36L42 36L50 86M78 36L58 36', '#fff', 1, 0.5);
    s += `<path d="M30 30L37 23" stroke="#fff" stroke-width="2.8" stroke-linecap="round" opacity=".85"/>`;
    s += sparkle(72, 22, 5) + sparkle(28, 58, 3, '#fff', 0.8);
    return s;
  },
};

// ---------------------------------------------------------------------------
// Rarity frame
// ---------------------------------------------------------------------------

function frame(rc: RC, glow: boolean): { back: string; front: string } {
  const col = rc.col;
  const r = rc.rank;
  const bgId = `${rc.id}bg`;
  rc.defs.push(radGrad(bgId, [[0, mix(col, '#1a1024', r === 0 ? 0.88 : 0.72)], [0.7, '#140b1f'], [1, '#0b0612']], 0.5, 0.45, 0.72));
  let back = `<rect x="3" y="3" width="94" height="94" rx="13" fill="url(#${bgId})"/>`;
  if (r >= 5) {
    const ry = `${rc.id}ry`;
    rc.defs.push(radGrad(ry, [[0, '#fff4d0', 0.75], [0.45, col, 0.35], [1, col, 0]]));
    let rays = '';
    for (let i = 0; i < 16; i++) {
      const a = i * 22.5 + 6;
      const p0 = polar(50, 50, 60, a - 5.5);
      const p1 = polar(50, 50, 60, a + 5.5);
      const c = polar(50, 50, 30, a + 14);
      rays += `<path d="M50 50Q${n(c.x)} ${n(c.y)} ${n(p0.x)} ${n(p0.y)}L${n(p1.x)} ${n(p1.y)}Z" fill="url(#${ry})" opacity="${i % 2 ? 0.55 : 0.9}"/>`;
    }
    const cl = `${rc.id}fc`;
    rc.defs.push(`<clipPath id="${cl}"><rect x="3" y="3" width="94" height="94" rx="13"/></clipPath>`);
    back += `<g clip-path="url(#${cl})">${rays}</g>`;
  } else if (r >= 4) {
    const ry = `${rc.id}ry`;
    rc.defs.push(radGrad(ry, [[0, col, 0.55], [1, col, 0]]));
    let rays = '';
    for (let i = 0; i < 12; i++) {
      const a = i * 30;
      const p0 = polar(50, 50, 52, a - 6);
      const p1 = polar(50, 50, 52, a + 6);
      rays += `<path d="M50 50L${n(p0.x)} ${n(p0.y)}L${n(p1.x)} ${n(p1.y)}Z" fill="url(#${ry})"/>`;
    }
    back += rays;
  }
  if (glow && r >= 1) {
    const gl = `${rc.id}gw`;
    const a = [0, 0.3, 0.42, 0.55, 0.65, 0.75][r] as number;
    rc.defs.push(radGrad(gl, [[0, col, a], [0.55, col, a * 0.35], [1, col, 0]]));
    back += `<circle cx="50" cy="50" r="42" fill="url(#${gl})"/>`;
  }
  if (r >= 5) back += `<circle cx="50" cy="50" r="38" fill="none" stroke="#fff4d0" stroke-width=".8" opacity=".55" stroke-dasharray="1 3"/>`;
  back += `<ellipse cx="50" cy="88" rx="24" ry="3.6" fill="#000" opacity=".35"/>`;

  // border (drawn over the item edges)
  const bc = r === 0 ? '#7a7680' : col;
  let front = `<rect x="3" y="3" width="94" height="94" rx="13" fill="none" stroke="#05030a" stroke-width="3.4"/>`;
  front += `<rect x="3" y="3" width="94" height="94" rx="13" fill="none" stroke="${bc}" stroke-width="${r >= 3 ? 2.4 : 1.8}"/>`;
  if (r >= 2) front += `<rect x="7" y="7" width="86" height="86" rx="10" fill="none" stroke="${bc}" stroke-width=".9" opacity=".55"/>`;
  if (r >= 3) {
    const gold = r >= 5 ? '#f7e3a4' : bc;
    for (const [x, y, sx, sy] of [[3, 3, 1, 1], [97, 3, -1, 1], [3, 97, 1, -1], [97, 97, -1, -1]] as const) {
      front += `<path d="M${x + sx * 5} ${y + sy * 18}Q${x + sx * 5} ${y + sy * 5} ${x + sx * 18} ${y + sy * 5}" fill="none" stroke="${gold}" stroke-width="2.2"/>`;
      front += `<path d="M${x + sx * 9} ${y + sy * 14}q${sx * 2} ${sy * -5} ${sx * 5} ${sy * -5}" fill="none" stroke="${gold}" stroke-width="1.2"/>`;
      if (r >= 4) front += `<path d="M${x + sx * 6} ${y + sy * 1.5}l${sx * 4.5} ${sy * 4.5}l${-sx * 4.5} ${sy * 4.5}l${-sx * 4.5} ${-sy * 4.5}z" transform="translate(${sx * 1.5} ${sy * 1.5})" fill="${gold}" stroke="#05030a" stroke-width=".8"/>`;
    }
  }
  if (r >= 4) {
    front += `<path d="M42 3.5Q50 9 58 3.5M42 96.5Q50 91 58 96.5" fill="none" stroke="${r >= 5 ? '#f7e3a4' : bc}" stroke-width="1.6"/>`;
    front += `<circle cx="50" cy="5.6" r="2.2" fill="${r >= 5 ? '#fff4d0' : bc}" stroke="#05030a" stroke-width=".6"/>`;
  }
  if (r >= 5) {
    front += sparkle(18, 22, 3.4, '#fff4d0', 0.9) + sparkle(84, 74, 3, '#fff4d0', 0.8) + sparkle(80, 18, 2.2, '#fff', 0.8);
  }
  return { back, front };
}

export function relicSVG(shape: RelicShape, rarity: Rarity, opts: { size?: number; seed?: string; palette?: [string, string]; glow?: boolean } = {}): string {
  const size = opts.size ?? 96;
  const rc = makeRC(rarity, opts.seed ?? shape, shape, opts.palette);
  const f = frame(rc, opts.glow !== false);
  const draw = ITEMS[shape] ?? ITEMS.gema;
  const item = draw(rc);
  return `${svgOpen(size, 100, 100)}<defs>${rc.defs.join('')}</defs>${f.back}<g>${item}</g>${f.front}</svg>`;
}

/** Just the item (no frame / glow) — handy for tooltips, cut-ins or 3D sprites. */
export function relicItemSVG(shape: RelicShape, rarity: Rarity, opts: { size?: number; seed?: string; palette?: [string, string] } = {}): string {
  const size = opts.size ?? 96;
  const rc = makeRC(rarity, opts.seed ?? shape, shape, opts.palette);
  const item = (ITEMS[shape] ?? ITEMS.gema)(rc);
  return `${svgOpen(size, 100, 100)}<defs>${rc.defs.join('')}</defs>${item}</svg>`;
}

// ---------------------------------------------------------------------------
// Slot machine symbols (glossy, bold outlines, transparent background)
// ---------------------------------------------------------------------------

export type SlotSymbol = 'eclipse' | 'x' | 'siete' | 'cereza' | 'bolsa' | 'dado' | 'corona' | 'daga' | 'libro' | 'calavera';
export const SLOT_SYMBOLS: SlotSymbol[] = ['eclipse', 'x', 'siete', 'cereza', 'bolsa', 'dado', 'corona', 'daga', 'libro', 'calavera'];

export function slotSymbolSVG(sym: SlotSymbol, size = 96): string {
  const id = uid('sl');
  const defs: string[] = [];
  const gl = (key: string, a: string, b: string, c: string): string => {
    defs.push(linGrad(`${id}${key}`, [[0, a], [0.5, b], [1, c]]));
    return `url(#${id}${key})`;
  };
  const shine = (d: string): string => `<path d="${d}" fill="#fff" opacity=".55"/>`;
  const O = '#12081a';
  let s = '';
  switch (sym) {
    case 'eclipse': {
      defs.push(radGrad(`${id}co`, [[0, '#9b5cff', 0], [0.62, '#9b5cff', 0], [0.7, '#ffffff', 1], [0.78, '#c9a4ff', 0.8], [1, '#6a2cff', 0]]));
      s += `<circle cx="50" cy="50" r="46" fill="url(#${id}co)"/>`;
      for (let i = 0; i < 16; i++) {
        const a = i * 22.5;
        const p0 = polar(50, 50, 34, a);
        const p1 = polar(50, 50, i % 2 ? 44 : 48, a);
        s += `<path d="M${n(p0.x)} ${n(p0.y)}L${n(p1.x)} ${n(p1.y)}" stroke="#e9dcff" stroke-width="${i % 2 ? 1.2 : 2}" stroke-linecap="round" opacity=".8"/>`;
      }
      s += `<circle cx="50" cy="50" r="30" fill="#07030c" stroke="${O}" stroke-width="3"/>`;
      s += `<circle cx="50" cy="50" r="30.5" fill="none" stroke="#f6f0ff" stroke-width="2"/>`;
      s += `<path d="M28 38A24 24 0 0 1 44 24" stroke="#b98cff" stroke-width="3" fill="none" stroke-linecap="round" opacity=".7"/>`;
      s += sparkle(28, 26, 6, '#fff');
      break;
    }
    case 'x': {
      const d = 'M20 14H38L50 34L62 14H80L60 48L82 86H64L50 62L36 86H18L40 48Z';
      s += `<path d="${d}" fill="${O}" transform="translate(3 4)" opacity=".5"/>`;
      s += `<path d="${d}" fill="${gl('x', '#e6d0ff', '#9b5cff', '#3a1480')}" stroke="${O}" stroke-width="4" stroke-linejoin="round"/>`;
      s += `<path d="${d}" fill="none" stroke="#f3d27a" stroke-width="1.6" stroke-linejoin="round" transform="translate(50 50) scale(.86) translate(-50 -50)"/>`;
      s += shine('M24 17H36L44 30L40 32Z');
      s += sparkle(74, 20, 6);
      break;
    }
    case 'siete': {
      const d = 'M20 14H82V28C68 40 58 58 54 86H32C36 62 46 44 58 30H36V38H20Z';
      s += `<path d="${d}" fill="${O}" transform="translate(3 4)" opacity=".5"/>`;
      s += `<path d="${d}" fill="${gl('7', '#ffb8c2', '#e2455b', '#7a0a20')}" stroke="${O}" stroke-width="4.4" stroke-linejoin="round"/>`;
      s += `<path d="${d}" fill="none" stroke="#ffe08a" stroke-width="1.8" stroke-linejoin="round" transform="translate(51 50) scale(.84) translate(-51 -50)"/>`;
      s += shine('M24 17H78V22H24Z');
      s += sparkle(80, 60, 5);
      break;
    }
    case 'cereza': {
      s += `<path d="M36 58C38 40 46 26 60 14M64 60C62 44 60 30 60 14" fill="none" stroke="${O}" stroke-width="6" stroke-linecap="round"/>`;
      s += `<path d="M36 58C38 40 46 26 60 14M64 60C62 44 60 30 60 14" fill="none" stroke="#5aa83a" stroke-width="3.2" stroke-linecap="round"/>`;
      s += `<path d="M60 14C68 6 82 8 88 16C80 22 68 22 60 14Z" fill="${gl('lf', '#c8f59a', '#5aa83a', '#1f4a14')}" stroke="${O}" stroke-width="3"/>`;
      for (const [x, y] of [[34, 68], [66, 70]] as const) {
        s += `<circle cx="${x}" cy="${y}" r="18" fill="${gl(`c${x}`, '#ff9aa8', '#e2455b', '#6a0a1c')}" stroke="${O}" stroke-width="3.4"/>`;
        s += `<ellipse cx="${x - 6}" cy="${y - 7}" rx="5.5" ry="3.6" fill="#fff" opacity=".75" transform="rotate(-30 ${x - 6} ${y - 7})"/>`;
      }
      break;
    }
    case 'bolsa': {
      s += `<path d="M38 26L32 12H68L62 26C78 34 88 50 88 66C88 80 78 88 64 88H36C22 88 12 80 12 66C12 50 22 34 38 26Z" fill="${gl('bg', '#e8c89a', '#a8743a', '#4a2a10')}" stroke="${O}" stroke-width="4" stroke-linejoin="round"/>`;
      s += `<path d="M36 26H64" stroke="${O}" stroke-width="6" stroke-linecap="round"/><path d="M36 26H64" stroke="#e9b949" stroke-width="3" stroke-linecap="round"/>`;
      s += `<circle cx="50" cy="60" r="15" fill="${gl('cn', '#fff4c4', '#e9b949', '#7a4e0c')}" stroke="${O}" stroke-width="3"/>`;
      s += `<circle cx="50" cy="60" r="10" fill="none" stroke="#7a4e0c" stroke-width="1.6"/><circle cx="51.4" cy="61" r="7" fill="#7a4e0c"/>`;
      s += shine('M22 56Q26 40 38 34L40 38Q30 46 28 58Z');
      break;
    }
    case 'dado':
    case 'corona':
    case 'daga':
    case 'libro':
    case 'calavera': {
      const map: Record<string, RelicShape> = { dado: 'dado', corona: 'corona', daga: 'daga', libro: 'libro', calavera: 'craneo' };
      const rc = makeRC('legendaria', `slot-${sym}`, sym, sym === 'corona' ? ['#e9b949', '#e2455b'] : sym === 'libro' ? ['#e9b949', '#9b5cff'] : sym === 'dado' ? ['#e9b949', '#f3ead8'] : undefined);
      if (sym === 'dado') rc.variant = 0;
      const body = (ITEMS[map[sym] as RelicShape] as Drawer)(rc);
      defs.push(...rc.defs);
      s += `<g transform="translate(50 50) scale(1.08) translate(-50 -50)">${body}</g>`;
      break;
    }
  }
  return `${svgOpen(size, 100, 100)}<defs>${defs.join('')}</defs>${s}</svg>`;
}
