// Heraldic crests of the realms and the "LA EXCEPCIÓN" wordmark.
import { linGrad, mix, n, polar, radGrad, starPoints, svgOpen, uid } from './util';

export type CrestId = 'valdoria' | 'sylvaria' | 'kharaz' | 'morvenna' | 'islas' | 'concordia' | 'excepcion';
export const CREST_IDS: CrestId[] = ['valdoria', 'sylvaria', 'kharaz', 'morvenna', 'islas', 'concordia', 'excepcion'];

const INK = '#140a12';
const SHIELD = 'M10 8H90V54C90 84 71 103 50 113C29 103 10 84 10 54Z';
const FIELD = 'M16 14H84V54C84 80 68 97 50 106C32 97 16 80 16 54Z';

interface CrestStyle {
  field: [string, string];
  metal: [string, string, string];
  border: string;
}

const STYLES: Record<CrestId, CrestStyle> = {
  valdoria: { field: ['#c02a36', '#5e0c16'], metal: ['#fff2bf', '#e8b84a', '#7a4e0c'], border: '#e8c15a' },
  sylvaria: { field: ['#2f8a4e', '#0f3a20'], metal: ['#ffffff', '#dfe8e4', '#6a8278'], border: '#dfe6ee' },
  kharaz: { field: ['#5a2a22', '#1e0c0a'], metal: ['#fff2bf', '#e8b84a', '#7a4e0c'], border: '#c9803a' },
  morvenna: { field: ['#5a2a9a', '#1c0a40'], metal: ['#ffffff', '#d8dcec', '#6a6e8a'], border: '#c8b6ff' },
  islas: { field: ['#1f9a9a', '#073a44'], metal: ['#fff2bf', '#e8b84a', '#7a4e0c'], border: '#e8c15a' },
  concordia: { field: ['#f6f1e6', '#cfc6b2'], metal: ['#fff2bf', '#e0ac3a', '#7a4e0c'], border: '#3b6ab8' },
  excepcion: { field: ['#2a1a40', '#05020a'], metal: ['#ffffff', '#c9a4ff', '#5a2cb0'], border: '#9b5cff' },
};

function charge(id: CrestId, m: string, dark: string, light: string): string {
  const sh = (d: string, fill = m, w = 1.8) => `<path d="${d}" fill="${fill}" stroke="${INK}" stroke-width="${w}" stroke-linejoin="round"/>`;
  switch (id) {
    case 'valdoria': {
      // lion head with mane beneath a crown
      let mane = '';
      const k = 18;
      for (let i = 0; i <= k; i++) {
        const a = (i / k) * 360;
        const r = i % 2 ? 23 : 18;
        const p = polar(50, 66, r, a - 90);
        mane += `${i === 0 ? 'M' : 'L'}${n(p.x)} ${n(p.y)}`;
      }
      let s = sh(mane + 'Z', m, 1.8);
      s += sh('M38 60C38 52 44 48 50 48C56 48 62 52 62 60C62 68 58 78 50 80C42 78 38 68 38 60Z', light, 1.6);
      s += `<path d="M42 58l5 2M58 58l-5 2" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>`;
      s += sh('M46 66H54L50 71Z', INK, 1);
      s += `<path d="M50 71V74M45 76Q50 79 55 76" stroke="${INK}" stroke-width="1.4" fill="none" stroke-linecap="round"/>`;
      s += sh('M34 40L32 24L41 32L50 20L59 32L68 24L66 40Z', m, 1.8);
      s += `<circle cx="50" cy="35" r="2.6" fill="#c02a36" stroke="${INK}" stroke-width=".8"/>`;
      for (const [x, y] of [[32, 24], [50, 20], [68, 24]] as const) s += `<circle cx="${x}" cy="${y - 1.5}" r="2" fill="${light}" stroke="${INK}" stroke-width=".8"/>`;
      return s;
    }
    case 'sylvaria': {
      let s = sh('M47 94C47 84 48 76 47 66H53C52 76 53 84 53 94Z', m, 1.6);
      s += `<path d="M47 90C40 92 34 96 28 97M53 90C60 92 66 96 72 97M50 92V99" stroke="${m}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
      s += `<path d="M47 90C40 92 34 96 28 97M53 90C60 92 66 96 72 97" stroke="${INK}" stroke-width="1" fill="none" opacity=".5"/>`;
      s += sh('M50 20C60 20 66 26 67 33C74 33 80 40 78 48C84 53 82 64 74 67C70 73 60 73 56 69C52 72 46 72 43 69C38 73 28 73 25 66C18 63 17 53 23 48C21 40 27 33 33 33C35 26 41 20 50 20Z', m, 1.8);
      s += `<path d="M36 46Q42 42 48 46M52 40Q58 36 64 40M40 58Q46 54 52 58M56 56Q62 52 68 56" stroke="${dark}" stroke-width="1.6" fill="none" stroke-linecap="round" opacity=".7"/>`;
      s += `<path d="M50 66V52M50 60L42 54M50 58L58 51" stroke="${dark}" stroke-width="1.8" fill="none" stroke-linecap="round"/>`;
      return s;
    }
    case 'kharaz': {
      let s = sh('M18 70L34 38L42 50L52 28L64 50L70 42L84 70Z', mix(m, '#ffffff', 0.55), 1.6);
      s += `<path d="M30 46L34 38L38 45M48 36L52 28L56 36" stroke="#fff" stroke-width="2.2" fill="none"/>`;
      s += sh('M26 66H74V72C68 72 64 74 62 78H56V86H66V92H34V86H44V78H38C36 74 30 72 26 72Z', m, 1.8);
      s += sh('M74 66H82C82 70 78 72 74 72Z', m, 1.4);
      s += `<path d="M30 68H70" stroke="${light}" stroke-width="1.6" opacity=".8"/>`;
      return s;
    }
    case 'morvenna': {
      let s = sh('M62 22A34 34 0 1 0 62 92A28 28 0 1 1 62 22Z', m, 1.8);
      s += sh('M34 57C40 48 58 48 64 57C58 66 40 66 34 57Z', '#fffaf0', 1.4);
      s += `<circle cx="49" cy="57" r="6" fill="#e8b84a" stroke="${INK}" stroke-width="1.2"/><ellipse cx="49" cy="57" rx="1.8" ry="5" fill="${INK}"/>`;
      s += `<polygon points="${starPoints(72, 36, 4.6, 1.8, 4)}" fill="${m}" stroke="${INK}" stroke-width=".8"/>`;
      s += `<polygon points="${starPoints(76, 74, 3.4, 1.4, 4)}" fill="${m}" stroke="${INK}" stroke-width=".8"/>`;
      s += `<polygon points="${starPoints(68, 90, 2.6, 1, 4)}" fill="${m}"/>`;
      return s;
    }
    case 'islas': {
      let s = sh('M50 24L72 36L50 48L28 36Z', '#fffaf0', 1.6);
      s += sh('M28 36L50 48V72L28 60Z', '#ece2cc', 1.6);
      s += sh('M72 36L50 48V72L72 60Z', '#cfc2a4', 1.6);
      for (const [x, y] of [[50, 36], [36, 48], [42, 58], [57, 56], [65, 50], [61, 62]] as const) s += `<ellipse cx="${x}" cy="${y}" rx="2.4" ry="1.9" fill="${INK}"/>`;
      const wave = (y: number) => `M16 ${y}C22 ${y - 7} 28 ${y - 7} 32 ${y - 2}C29 ${y - 4} 25 ${y - 2} 27 ${y + 1}C31 ${y + 4} 38 ${y} 42 ${y - 4}C48 ${y - 10} 56 ${y - 10} 60 ${y - 4}C56 ${y - 6} 53 ${y - 3} 55 ${y}C59 ${y + 3} 66 ${y} 70 ${y - 4}C75 ${y - 9} 82 ${y - 8} 86 ${y - 3}`;
      s += `<path d="${wave(84)}" fill="none" stroke="${INK}" stroke-width="5.4" stroke-linecap="round"/><path d="${wave(84)}" fill="none" stroke="${m}" stroke-width="3" stroke-linecap="round"/>`;
      s += `<path d="${wave(96)}" fill="none" stroke="${INK}" stroke-width="5" stroke-linecap="round" transform="translate(4 0) scale(.94 1)"/><path d="${wave(96)}" fill="none" stroke="${m}" stroke-width="2.6" stroke-linecap="round" transform="translate(4 0) scale(.94 1)"/>`;
      return s;
    }
    case 'concordia': {
      let s = '';
      for (let i = 0; i < 5; i++) {
        const p = polar(50, 58, 17, -90 + i * 72);
        s += `<circle cx="${n(p.x)}" cy="${n(p.y)}" r="11" fill="none" stroke="${INK}" stroke-width="5.6"/>`;
        s += `<circle cx="${n(p.x)}" cy="${n(p.y)}" r="11" fill="none" stroke="${m}" stroke-width="3.4"/>`;
      }
      s += `<polygon points="${starPoints(50, 58, 6, 2.6, 5)}" fill="#3b6ab8" stroke="${INK}" stroke-width="1"/>`;
      return s;
    }
    case 'excepcion': {
      let s = '';
      for (let i = 0; i < 24; i++) {
        const a = i * 15;
        const p0 = polar(50, 58, 25, a);
        const p1 = polar(50, 58, i % 3 === 0 ? 38 : 31, a);
        s += `<path d="M${n(p0.x)} ${n(p0.y)}L${n(p1.x)} ${n(p1.y)}" stroke="${m}" stroke-width="${i % 3 === 0 ? 1.6 : 0.9}" stroke-linecap="round" opacity=".8"/>`;
      }
      s += `<circle cx="50" cy="58" r="22" fill="#f6f0ff"/>`;
      s += `<circle cx="51.6" cy="59.4" r="19.6" fill="#05020a"/>`;
      s += `<circle cx="50" cy="58" r="24.5" fill="none" stroke="${m}" stroke-width="1.4" opacity=".7"/>`;
      return s;
    }
  }
}

export function crestSVG(id: 'valdoria' | 'sylvaria' | 'kharaz' | 'morvenna' | 'islas' | 'concordia' | 'excepcion', size = 96): string {
  const st = STYLES[id] ?? STYLES.excepcion;
  const u = uid('cr');
  const defs = [
    linGrad(`${u}f`, [[0, st.field[0]], [1, st.field[1]]], 0.2, 0, 0.8, 1),
    linGrad(`${u}b`, [[0, mix(st.border, '#ffffff', 0.45)], [0.5, st.border], [1, mix(st.border, '#000000', 0.45)]], 0, 0, 1, 1),
    `<clipPath id="${u}c"><path d="${FIELD}"/></clipPath>`,
  ];
  if (id === 'excepcion') defs.push(radGrad(`${u}g`, [[0, '#9b5cff', 0.55], [1, '#9b5cff', 0]], 0.5, 0.48, 0.5));
  const [light, mid, dark] = st.metal;
  let s = `<path d="${SHIELD}" fill="${INK}" transform="translate(2 3)" opacity=".45"/>`;
  s += `<path d="${SHIELD}" fill="url(#${u}b)" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>`;
  s += `<path d="${FIELD}" fill="url(#${u}f)" stroke="${INK}" stroke-width="1.6"/>`;
  s += `<g clip-path="url(#${u}c)">`;
  if (id === 'excepcion') s += `<circle cx="50" cy="58" r="48" fill="url(#${u}g)"/>`;
  if (id === 'concordia') s += `<path d="M16 14H84V30H16Z" fill="#3b6ab8" opacity=".85"/><path d="M16 30H84" stroke="${INK}" stroke-width="1.2"/>`;
  // subtle damask diagonal pattern
  s += `<path d="M0 30L70 -40M0 60L100 -40M0 90L100 -10M0 120L100 20M10 140L100 50" stroke="#fff" stroke-width=".6" opacity=".06"/>`;
  s += charge(id, mid, dark, light);
  s += `<path d="M16 14H84V30C60 22 40 26 16 44Z" fill="#fff" opacity=".12"/>`;
  s += `</g>`;
  s += `<path d="M13 11H87" stroke="#fff" stroke-width="1" opacity=".45"/>`;
  for (const [x, y] of [[13, 11], [87, 11], [50, 110]] as const) s += `<circle cx="${x}" cy="${y}" r="2" fill="${light}" stroke="${INK}" stroke-width=".8"/>`;
  return `${svgOpen(size, 100, 120)}<defs>${defs.join('')}</defs>${s}</svg>`;
}

// ---------------------------------------------------------------------------
// Wordmark
// ---------------------------------------------------------------------------

// Approximate Cinzel Bold advance widths (em) — glyphs are placed individually (text-anchor middle)
// so the layout stays stable even if the exact font metrics differ slightly.
const ADV: Record<string, number> = { L: 0.6, A: 0.74, E: 0.64, X: 0.74, C: 0.72, P: 0.63, I: 0.34, N: 0.82, O: 0.82 };

export function logoSVG(width = 640): string {
  const u = uid('lg');
  const W = 640;
  const H = 210;
  const fs = 92;
  const track = 0.05 * fs;
  const word = ['E', 'X', 'C', 'E', 'P', 'C', 'I', 'O', 'N'];
  const total = word.reduce((a, ch) => a + (ADV[ch] ?? 0.7) * fs, 0) + track * (word.length - 1);
  let x = (W - total) / 2;
  const base = 158;
  const capH = 0.7 * fs;
  const defs = [
    linGrad(`${u}g`, [[0, '#fff6dc'], [0.45, '#f0d08a'], [0.55, '#d9b36c'], [1, '#8a6a2a']], 0, 0, 0, 1),
    radGrad(`${u}c`, [[0, '#9b5cff', 0], [0.66, '#9b5cff', 0], [0.73, '#ffffff', 1], [0.8, '#c9a4ff', 0.85], [1, '#6a2cff', 0]]),
    radGrad(`${u}h`, [[0, '#9b5cff', 0.35], [1, '#9b5cff', 0]]),
  ];
  const txt = (ch: string, cx: number, y: number, size: number, extra = '') =>
    `<text x="${n(cx)}" y="${n(y)}" text-anchor="middle" font-family="Cinzel, 'Cinzel Decorative', serif" font-weight="700" font-size="${size}" fill="url(#${u}g)" stroke="#1a0d1e" stroke-width="${n(size * 0.045)}" paint-order="stroke" stroke-linejoin="round"${extra}>${ch}</text>`;
  let s = `<ellipse cx="${W / 2}" cy="${base - capH / 2}" rx="${n(total * 0.55)}" ry="70" fill="url(#${u}h)"/>`;
  let eclipseX = 0;
  for (const ch of word) {
    const w = (ADV[ch] ?? 0.7) * fs;
    const cx = x + w / 2;
    if (ch === 'O') {
      eclipseX = cx;
    } else {
      s += txt(ch, cx, base, fs);
    }
    x += w + track;
  }
  // the Ó as an eclipse
  const ey = base - capH / 2;
  const r = capH * 0.5;
  s += `<circle cx="${n(eclipseX)}" cy="${n(ey)}" r="${n(r * 1.75)}" fill="url(#${u}c)"/>`;
  for (let i = 0; i < 20; i++) {
    const a = i * 18 + 9;
    const p0 = polar(eclipseX, ey, r * 1.12, a);
    const p1 = polar(eclipseX, ey, r * (i % 2 ? 1.45 : 1.7), a);
    s += `<path d="M${n(p0.x)} ${n(p0.y)}L${n(p1.x)} ${n(p1.y)}" stroke="#e2d2ff" stroke-width="${i % 2 ? 0.8 : 1.4}" stroke-linecap="round" opacity=".75"/>`;
  }
  s += `<circle cx="${n(eclipseX)}" cy="${n(ey)}" r="${n(r)}" fill="#07030c" stroke="#1a0d1e" stroke-width="3"/>`;
  s += `<circle cx="${n(eclipseX)}" cy="${n(ey)}" r="${n(r)}" fill="none" stroke="#f6f0ff" stroke-width="2.2"/>`;
  s += `<circle cx="${n(eclipseX - r * 0.62)}" cy="${n(ey - r * 0.62)}" r="3" fill="#ffffff"/>`;
  // acute accent as a thin shard of light
  const ax = eclipseX + r * 0.3;
  const ay = ey - r - 9;
  s += `<path d="M${n(ax - 9)} ${n(ay + 3)}L${n(ax + 11)} ${n(ay - 19)}L${n(ax + 16)} ${n(ay - 15)}L${n(ax - 3)} ${n(ay + 6)}Z" fill="url(#${u}g)" stroke="#1a0d1e" stroke-width="2.4" paint-order="stroke" stroke-linejoin="round"/>`;
  s += `<path d="M${n(ax - 5)} ${n(ay + 1)}L${n(ax + 11)} ${n(ay - 16)}" stroke="#fff6dc" stroke-width="1" opacity=".8"/>`;
  // "LA" with flourishes
  const laY = 52;
  s += `<text x="${W / 2}" y="${laY}" text-anchor="middle" font-family="Cinzel, serif" font-weight="700" font-size="34" letter-spacing="10" fill="url(#${u}g)" stroke="#1a0d1e" stroke-width="1.6" paint-order="stroke">LA</text>`;
  for (const k of [-1, 1]) {
    const x0 = W / 2 + k * 44;
    const x1 = W / 2 + k * 170;
    s += `<path d="M${n(x0)} ${laY - 12}L${n(x1)} ${laY - 12}" stroke="#d9b36c" stroke-width="1.6"/>`;
    s += `<path d="M${n(x1)} ${laY - 17}l${n(k * 6)} 5l${n(-k * 6)} 5l${n(-k * 6)} -5Z" fill="#d9b36c" stroke="#1a0d1e" stroke-width=".8"/>`;
    s += `<circle cx="${n(W / 2 + k * 58)}" cy="${laY - 12}" r="2.4" fill="#9b5cff"/>`;
  }
  // underline ornament
  const uy = base + 22;
  s += `<path d="M${n(W / 2 - total * 0.42)} ${uy}H${n(W / 2 - 16)}M${n(W / 2 + 16)} ${uy}H${n(W / 2 + total * 0.42)}" stroke="#d9b36c" stroke-width="1.4" opacity=".85"/>`;
  s += `<circle cx="${W / 2}" cy="${uy}" r="7" fill="none" stroke="#f6f0ff" stroke-width="1.2"/><circle cx="${W / 2 + 0.8}" cy="${uy + 0.6}" r="5.8" fill="#07030c"/>`;
  return `${svgOpen(width, W, H)}<defs>${defs.join('')}</defs>${s}</svg>`;
}
