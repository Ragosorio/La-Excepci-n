/**
 * Casino-specific procedural SVG art (anime-gem style: thick ink outlines, 2–3 tone fills, highlights).
 * Slot symbols, chips, tarot cards (Spanish suits + Major Arcana), relic fallbacks, lobby illustrations.
 * Slot symbols are rasterized (see rasterize()) so gradient ids never collide; inline SVGs get unique ids.
 */
import { slotSymbolSVG, relicItemSVG, relicSVG, RARITY_COLORS, type RelicShape, type Rarity } from '../ui/art/relicArt';
import { tarotCardSVG } from '../ui/art/tarot';

export type SymId = 'moneda' | 'dado' | 'carta' | 'farol' | 'caliz' | 'corona' | 'daga' | 'luna' | 'libro' | 'wild' | 'eclipse';

const INK = '#150b1f';
let uidN = 0;
const U = (p: string) => `${p}${(uidN++).toString(36)}`;

const open = (vb = '0 0 100 100', size: number | string = 100, extra = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${size}" height="${size}" ${extra}>`;

function glowBg(id: string, color: string, op = 0.55): string {
  return `<defs><radialGradient id="${id}"><stop offset="0" stop-color="${color}" stop-opacity="${op}"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient></defs><circle cx="50" cy="50" r="48" fill="url(#${id})"/>`;
}
function lg(id: string, stops: Array<[number, string]>, x2 = 0, y2 = 1): string {
  return `<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}">${stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('')}</linearGradient>`;
}
function rg(id: string, stops: Array<[number, string]>, cx = 0.4, cy = 0.35, r = 0.7): string {
  return `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}">${stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('')}</radialGradient>`;
}
function star(cx: number, cy: number, r: number, fill: string, op = 1): string {
  const p: string[] = [];
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 - Math.PI / 2; const rr = i % 2 === 0 ? r : r * 0.28; p.push(`${(cx + Math.cos(a) * rr).toFixed(1)},${(cy + Math.sin(a) * rr).toFixed(1)}`); }
  return `<polygon points="${p.join(' ')}" fill="${fill}" opacity="${op}"/>`;
}

// ───────────────────────────── slot symbols ─────────────────────────────
// Reel art comes from the shared art module (slotSymbolSVG) plus two relic symbols (relicItemSVG).
// Internal math ids stay stable; this table maps them to art + labels.

const SYM_GLOW: Record<SymId, string> = {
  moneda: '#ff5a6a', dado: '#fff2d0', carta: '#ffd34a', farol: '#ffb347', caliz: '#c77dff', corona: '#ffe066',
  daga: '#ffcf5a', luna: '#ff6a5a', libro: '#7fe3ff', wild: '#ff4fa3', eclipse: '#c7a2ff',
};

function symArt(id: SymId, size: number): string {
  switch (id) {
    case 'moneda': return slotSymbolSVG('cereza', size);
    case 'dado': return slotSymbolSVG('dado', size);
    case 'carta': return slotSymbolSVG('bolsa', size);
    case 'farol': return relicItemSVG('farol', 'rara', { size });
    case 'caliz': return relicItemSVG('caliz', 'epica', { size });
    case 'corona': return slotSymbolSVG('corona', size);
    case 'daga': return slotSymbolSVG('daga', size);
    case 'luna': return slotSymbolSVG('siete', size);
    case 'libro': return slotSymbolSVG('libro', size);
    case 'wild': return slotSymbolSVG('x', size);
    case 'eclipse': return slotSymbolSVG('eclipse', size);
  }
}

/** Full symbol SVG (optionally with a soft colored glow behind, for reels). */
export function symbolSVG(id: SymId, size = 100, glow = true): string {
  const inner = symArt(id, size);
  if (!glow) return inner;
  const gid = U('gg');
  const b64 = inner.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  return `${open('0 0 100 100', size)}${glowBg(gid, SYM_GLOW[id], id === 'eclipse' || id === 'libro' || id === 'wild' ? 0.55 : 0.35)}<svg x="4" y="4" width="92" height="92" viewBox="0 0 100 100">${b64}</svg></svg>`;
}

export const SYM_LABEL: Record<SymId, string> = {
  moneda: 'Cerezas de Puerto Fortuna', dado: 'Dado de Hueso', carta: 'Bolsa de Oro', farol: 'Farol de Almas', caliz: 'Cáliz Pactado',
  corona: 'Corona Vacía', daga: 'Aurora, la Daga Solar', luna: 'El Siete de Tiburcio', libro: 'El Libro de la Realidad',
  wild: 'X — Comodín', eclipse: 'Eclipse — Dispersión',
};
export const SYM_COLOR = SYM_GLOW;

/** Rasterize an SVG string into a canvas (for fast reel drawing). */
export async function rasterize(svg: string, px: number): Promise<HTMLCanvasElement> {
  const c = document.createElement('canvas');
  c.width = c.height = px;
  const img = new Image();
  img.decoding = 'async';
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  try { await img.decode(); } catch { await new Promise((r) => { img.onload = r; img.onerror = r; }); }
  const g = c.getContext('2d');
  if (g) { try { g.drawImage(img, 0, 0, px, px); } catch { /* broken image */ } }
  return c;
}

// ───────────────────────────── chips ─────────────────────────────

const CHIP_COL: Array<[number, string, string]> = [
  [5000, '#ff8a1a', '#fff0c8'], [1000, '#7a3ad0', '#f5d99a'], [500, '#1a1420', '#f5d99a'], [100, '#1e9a4a', '#ffffff'],
  [50, '#c0303a', '#ffffff'], [25, '#2f6ad0', '#ffffff'], [10, '#e8e2d0', '#2a3a8a'], [1, '#e8e2d0', '#2a3a8a'],
];
export function chipLabel(v: number): string { return v >= 1000 ? `${v / 1000}K` : String(v); }

/** Casino chip (inline SVG, uses page fonts). */
export function chipSVG(value: number, opts: { size?: number; essence?: boolean } = {}): string {
  const size = opts.size ?? 44;
  let base = '#e8e2d0', edge = '#2a3a8a';
  if (opts.essence) { base = '#5a1a8a'; edge = '#e0a8ff'; }
  else for (const [v, b, e] of CHIP_COL) if (value >= v) { base = b; edge = e; break; }
  const dashes = Array.from({ length: 8 }, (_, i) => { const a = (i / 8) * 360; return `<rect x="46" y="4" width="8" height="12" rx="1.5" fill="${edge}" transform="rotate(${a} 50 50)"/>`; }).join('');
  const txtCol = opts.essence ? '#fff' : base === '#e8e2d0' ? '#2a3a8a' : '#fff';
  return `${open('0 0 100 100', size)}<circle cx="50" cy="53" r="45" fill="#000" opacity=".35"/>
  <circle cx="50" cy="50" r="45" fill="${base}" stroke="${INK}" stroke-width="3"/>${dashes}
  <circle cx="50" cy="50" r="31" fill="${base}" stroke="${edge}" stroke-width="3" stroke-dasharray="4 3"/>
  ${opts.essence ? `<path d="M50 30 q12 14 0 30 q-12 -16 0 -30z" fill="#e0a8ff" opacity=".85"/>` : ''}
  <text x="50" y="${opts.essence ? 76 : 60}" text-anchor="middle" font-family="Bangers, Impact, sans-serif" font-size="${opts.essence ? 20 : chipLabel(value).length > 3 ? 24 : 30}" fill="${txtCol}" stroke="${INK}" stroke-width="1" paint-order="stroke">${chipLabel(value)}</text>
  <ellipse cx="34" cy="28" rx="12" ry="5" fill="#fff" opacity=".28" transform="rotate(-30 34 28)"/></svg>`;
}

// ───────────────────────────── tarot (Spanish 48-card deck + Arcanos Mayores) ─────────────────────────────

export type Suit = 'espadas' | 'copas' | 'oros' | 'bastos';
export type Arcana = 'loco' | 'torre' | 'mundo' | 'sol' | 'luna' | 'muerte' | 'rueda';
/** rank 1..12 (Sota 10, Caballo 11, Rey 12) — matches tarotCardSVG. */
export interface TCard { id: string; suit?: Suit; rank?: number; arcana?: Arcana }

export const SUIT_NAME: Record<Suit, string> = { espadas: 'Espadas', copas: 'Copas', oros: 'Oros', bastos: 'Bastos' };
export const ARCANA_INFO: Record<Arcana, { num: string; name: string; effect: string }> = {
  loco: { num: '0', name: 'EL LOCO', effect: 'Intercambia tu última carta con la carta visible del crupier.' },
  rueda: { num: 'X', name: 'LA RUEDA DE LA FORTUNA', effect: 'La mano paga doble… o cobra doble.' },
  muerte: { num: 'XIII', name: 'LA MUERTE', effect: 'Reinicia la ronda: se devuelven las cartas y la apuesta.' },
  torre: { num: 'XVI', name: 'LA TORRE', effect: 'Descarta la mano y reparte dos cartas nuevas.' },
  luna: { num: 'XVIII', name: 'LA LUNA', effect: 'Tu próxima carta llega boca abajo.' },
  sol: { num: 'XIX', name: 'EL SOL', effect: 'Revela la carta oculta del crupier.' },
  mundo: { num: 'XXI', name: 'EL MUNDO', effect: '21 instantáneo.' },
};

export function cardSVG(c: TCard, width = 110): string {
  if (c.arcana) return tarotCardSVG({ kind: 'arcano', id: c.arcana }, width);
  return tarotCardSVG({ kind: 'palo', suit: c.suit ?? 'oros', value: c.rank ?? 1 }, width);
}
export function cardBackSVG(width = 110): string { return tarotCardSVG({ kind: 'dorso' }, width); }

// ───────────────────────────── relics ─────────────────────────────

export function rarityColor(r: string): string { return (RARITY_COLORS as Record<string, string>)[r] ?? '#c8c8c8'; }

/** Relic art from the shared art module (never throws). */
export function relicArt(shape: string, rarity: string, size = 110): string {
  try { return relicSVG(shape as RelicShape, rarity as Rarity, { size }); } catch { return slotSymbolSVG('libro', size); }
}

// ───────────────────────────── lobby illustrations ─────────────────────────────

export function wheelSVG(size = 120, spin = false): string {
  const p = U('w');
  const n = 37;
  const wedges = Array.from({ length: n }, (_, i) => {
    const a0 = (i / n) * Math.PI * 2 - Math.PI / 2, a1 = ((i + 1) / n) * Math.PI * 2 - Math.PI / 2;
    const col = i === 0 ? '#0d0714' : i % 2 ? '#d99a1a' : '#3a3a8a';
    return `<path d="M50 50 L${(50 + Math.cos(a0) * 44).toFixed(2)} ${(50 + Math.sin(a0) * 44).toFixed(2)} A44 44 0 0 1 ${(50 + Math.cos(a1) * 44).toFixed(2)} ${(50 + Math.sin(a1) * 44).toFixed(2)}z" fill="${col}"/>`;
  }).join('');
  return `${open('0 0 100 100', size)}<defs>${rg(p + 'h', [[0, '#fff0b0'], [1, '#8a6a33']])}</defs>
  <circle cx="50" cy="50" r="48" fill="#5a2a14" stroke="${INK}" stroke-width="2.5"/>
  <g ${spin ? 'class="cs-spin-slow"' : ''} style="transform-origin:50px 50px">${wedges}<circle cx="50" cy="50" r="44" fill="none" stroke="#f5d99a" stroke-width="1.4"/>
  <circle cx="50" cy="50" r="26" fill="#2a1408" stroke="#d9b36c" stroke-width="2"/>
  ${[0, 1, 2, 3].map((i) => `<path d="M50 50 L${(50 + Math.cos(i * Math.PI / 2) * 22).toFixed(1)} ${(50 + Math.sin(i * Math.PI / 2) * 22).toFixed(1)}" stroke="url(#${p}h)" stroke-width="4" stroke-linecap="round"/>`).join('')}
  <circle cx="50" cy="50" r="8" fill="url(#${p}h)" stroke="${INK}" stroke-width="2"/></g>
  <circle cx="50" cy="9" r="3.4" fill="#fff" stroke="${INK}" stroke-width="1.2"/></svg>`;
}

export function diceCupSVG(size = 120): string {
  const p = U('d');
  const die = (x: number, y: number, r: number, pips: Array<[number, number]>) => `<g transform="translate(${x} ${y}) rotate(${r})"><rect x="-11" y="-11" width="22" height="22" rx="5" fill="#fffaf0" stroke="${INK}" stroke-width="2.4"/>${pips.map(([a, b]) => `<circle cx="${a}" cy="${b}" r="2.4" fill="${INK}"/>`).join('')}</g>`;
  return `${open('0 0 100 100', size)}<defs>${lg(p + 'c', [[0, '#8a3a2a'], [1, '#3a1208']], 1, 0)}</defs>
  <ellipse cx="50" cy="84" rx="40" ry="8" fill="#000" opacity=".35"/>
  <g transform="rotate(-24 36 50)"><path d="M18 22 h36 l-5 52 h-26z" fill="url(#${p}c)" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/><path d="M16 22 h40" stroke="#d9b36c" stroke-width="5" stroke-linecap="round"/><path d="M22 64 h30" stroke="#d9b36c" stroke-width="2.4"/></g>
  ${die(66, 74, 12, [[-5, -5], [0, 0], [5, 5]])}${die(84, 58, -18, [[-5, -5], [5, -5], [-5, 5], [5, 5]])}${die(56, 52, 30, [[0, 0]])}</svg>`;
}

export function wellSVG(size = 120): string {
  const p = U('p');
  return `${open('0 0 100 100', size)}<defs>${lg(p + 'beam', [[0, '#ffe06600'], [0.5, '#ffe066'], [1, '#fff8d0']])}${lg(p + 's', [[0, '#8a8aa0'], [1, '#4a4a60']])}</defs>
  <path d="M40 6 h20 l6 60 h-32z" fill="url(#${p}beam)" opacity=".7"/>
  <ellipse cx="50" cy="62" rx="30" ry="9" fill="#1a3a5a" stroke="${INK}" stroke-width="2.4"/>
  <ellipse cx="50" cy="62" rx="20" ry="5" fill="#7fe3ff" opacity=".6"/>
  <path d="M20 62 v20 q30 12 60 0 v-20 q-30 12 -60 0z" fill="url(#${p}s)" stroke="${INK}" stroke-width="2.6"/>
  <path d="M24 70 h10 M40 74 h12 M60 72 h12 M28 80 h12 M50 82 h14" stroke="#2a2a3a" stroke-width="1.6"/>
  <path d="M22 60 v-34 M78 60 v-34" stroke="#6a4a2a" stroke-width="4"/><path d="M16 28 l34 -14 l34 14z" fill="#8a2a2a" stroke="${INK}" stroke-width="2.4"/>
  ${star(36, 40, 4, '#fff')}${star(62, 30, 5, '#ffe066')}${star(56, 50, 3, '#fff')}</svg>`;
}

export function arenaSVG(size = 120): string {
  return `${open('0 0 100 100', size)}<ellipse cx="50" cy="60" rx="44" ry="26" fill="#1a4a6a" stroke="${INK}" stroke-width="2.4"/>
  <path d="M50 60 m-34 0 a34 18 0 1 1 68 0 a26 13 0 1 1 -52 0 a18 9 0 1 1 36 0 a10 5 0 1 1 -20 0" fill="none" stroke="#7fe3ff" stroke-width="3" opacity=".8"/>
  <path d="M26 20 L66 64" stroke="#dfe3ea" stroke-width="6" stroke-linecap="round"/><path d="M26 20 L66 64" stroke="${INK}" stroke-width="1.5" opacity=".5"/>
  <path d="M74 20 L34 64" stroke="#dfe3ea" stroke-width="6" stroke-linecap="round"/>
  <path d="M60 58 l12 -4 M40 58 l-12 -4" stroke="#d9b36c" stroke-width="5" stroke-linecap="round"/>
  <circle cx="24" cy="18" r="5" fill="#e2455b" stroke="${INK}" stroke-width="2"/><circle cx="76" cy="18" r="5" fill="#2f8cff" stroke="${INK}" stroke-width="2"/></svg>`;
}

export function reelsSVG(size = 120): string {
  const cell = (x: number, sym: SymId) => `<svg x="${x}" y="31" width="24" height="24" viewBox="0 0 100 100">${symArt(sym, 100).replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '')}</svg>`;
  return `${open('0 0 100 100', size)}<rect x="8" y="22" width="84" height="50" rx="8" fill="#2a0f18" stroke="#f5d99a" stroke-width="3"/>
  <rect x="12" y="28" width="24" height="38" rx="3" fill="#fff8ec"/><rect x="38" y="28" width="24" height="38" rx="3" fill="#fff8ec"/><rect x="64" y="28" width="24" height="38" rx="3" fill="#fff8ec"/>
  ${cell(12, 'luna')}${cell(38, 'luna')}${cell(64, 'luna')}
  <path d="M8 47 h84" stroke="#ff4fa3" stroke-width="2" opacity=".8"/>
  <rect x="30" y="8" width="40" height="12" rx="4" fill="#e2455b" stroke="${INK}" stroke-width="2"/><text x="50" y="17.5" text-anchor="middle" font-family="Bangers,Impact" font-size="10" fill="#ffe066">BOTE</text>
  <path d="M92 40 h4 v-18" stroke="#b8b8c8" stroke-width="3" fill="none"/><circle cx="96" cy="20" r="4" fill="#e2455b" stroke="${INK}" stroke-width="1.6"/>
  <rect x="14" y="76" width="72" height="10" rx="3" fill="#8a2a3a" stroke="${INK}" stroke-width="2"/></svg>`;
}

export function tarotFanSVG(size = 120): string {
  const back = (r: number, x: number) => `<g transform="rotate(${r} 50 90)"><rect x="${x}" y="22" width="34" height="52" rx="4" fill="#3a1a6a" stroke="${INK}" stroke-width="2.4"/><rect x="${x + 4}" y="26" width="26" height="44" rx="2" fill="none" stroke="#d9b36c" stroke-width="1.4"/><circle cx="${x + 17}" cy="48" r="7" fill="#f5d99a"/><circle cx="${x + 18}" cy="47.4" r="6" fill="#0d0714"/></g>`;
  return `${open('0 0 100 100', size)}${back(-24, 26)}${back(-8, 30)}
  <g transform="rotate(14 50 90)"><rect x="40" y="18" width="34" height="54" rx="4" fill="#fffaf0" stroke="${INK}" stroke-width="2.4"/>
  <rect x="44" y="24" width="26" height="36" fill="#7fc8ff"/><circle cx="57" cy="42" r="9" fill="#ffe066" stroke="${INK}" stroke-width="1.6"/>
  <path d="M53 41 q1.5 -1.5 3 0 M58 41 q1.5 -1.5 3 0 M54 45 q3 3 6 0" stroke="${INK}" stroke-width="1.1" fill="none"/>
  <rect x="42" y="62" width="30" height="7" fill="#3a1a6a"/><text x="57" y="67.8" text-anchor="middle" font-family="Cinzel,serif" font-size="5" font-weight="700" fill="#f5d99a">EL SOL</text></g></svg>`;
}
