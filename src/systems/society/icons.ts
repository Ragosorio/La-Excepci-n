/**
 * Procedural SVG icons for the society UIs (goods, resources, businesses, continent crests).
 * Chunky anime look: dark ink outline + two-tone fill + a highlight.
 */
import type { ContinentId, GoodId } from '../../data/types';
import type { BusinessKind } from './types';

const INK = '#150b1f';
const svg = (inner: string, size = 32, vb = 32) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vb} ${vb}" width="${size}" height="${size}" style="overflow:visible">${inner}</svg>`;
const S = `stroke="${INK}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"`;

const GOOD_SVG: Record<GoodId, string> = {
  grano: `<path d="M16 29 V10" ${S} fill="none"/>
    ${[0, 1, 2, 3].map((i) => `<ellipse cx="${13 - (i % 2 ? -6 : 0)}" cy="${11 + i * 4}" rx="3" ry="4.6" transform="rotate(${i % 2 ? 30 : -30} ${13 - (i % 2 ? -6 : 0)} ${11 + i * 4})" fill="#f1cd6a" ${S}/>`).join('')}
    <ellipse cx="16" cy="7" rx="2.6" ry="4.4" fill="#ffe08a" ${S}/><path d="M11 9 q-2 -3 -1 -6 M21 9 q2 -3 1 -6" stroke="#b8902a" stroke-width="1" fill="none"/>`,
  madera: `<rect x="4" y="11" width="22" height="11" rx="3" fill="#a3743f" ${S}/><ellipse cx="26" cy="16.5" rx="3.5" ry="5.5" fill="#e8c38a" ${S}/>
    <ellipse cx="26" cy="16.5" rx="1.6" ry="2.6" fill="none" stroke="#a3743f" stroke-width="1"/><path d="M7 14 h12 M9 19 h10" stroke="#7a5228" stroke-width="1.2"/>`,
  hierro: `<path d="M5 22 L9 13 H25 L28 22 Z" fill="#9aa0a8" ${S}/><path d="M9 13 L12 9 H22 L25 13 Z" fill="#c9ced6" ${S}/><path d="M11 18 h10" stroke="#fff" stroke-width="1.2" opacity=".7"/>`,
  especias: `<path d="M8 12 h16 l-2 16 h-12 z" fill="#b84a2a" ${S}/><path d="M7 9 h18 v4 h-18 z" fill="#e2703a" ${S}/>
    <path d="M13 4 q3 -3 6 0 q-1 3 -3 5 q-2 -2 -3 -5z" fill="#e2455b" ${S}/><circle cx="12" cy="19" r="1.2" fill="#ffd166"/><circle cx="17" cy="23" r="1.2" fill="#ffd166"/><circle cx="20" cy="17" r="1" fill="#ffd166"/>`,
  seda: `<path d="M4 20 q6 -12 14 -6 q6 4 10 -4 v10 q-4 8 -10 4 q-8 -6 -14 4z" fill="#d45a92" ${S}/><path d="M7 21 q5 -8 11 -4" stroke="#ffb3d4" stroke-width="1.4" fill="none"/>
    <circle cx="27" cy="11" r="3" fill="#c0407a" ${S}/>`,
  pociones: `<path d="M13 4 h6 v6 l6 10 a7 7 0 0 1 -6 9 h-6 a7 7 0 0 1 -6 -9 l6 -10z" fill="#e8f7ff" ${S}/><path d="M9 20 h14 a6 6 0 0 1 -5 7 h-4 a6 6 0 0 1 -5 -7z" fill="#8dff5a"/>
    <rect x="12" y="2.5" width="8" height="3" rx="1" fill="#8a6a3a" ${S}/><circle cx="14" cy="22" r="1.3" fill="#fff" opacity=".8"/><circle cx="18" cy="24.5" r=".9" fill="#fff" opacity=".7"/>`,
  gemas: `<path d="M16 29 L4 13 L9 6 H23 L28 13 Z" fill="#46c8f0" ${S}/><path d="M4 13 H28 M9 6 L12 13 L16 29 L20 13 L23 6 M12 13 L16 6 L20 13" stroke="${INK}" stroke-width="1" fill="none"/>
    <path d="M10 8 l2 4" stroke="#fff" stroke-width="1.4" opacity=".85"/>`,
  cristal: `<path d="M16 3 L22 12 L19 29 H13 L10 12 Z" fill="#9b5cff" ${S}/><path d="M8 17 L11 12 L13 29 L9 26 Z" fill="#7a3fe0" ${S}/><path d="M24 17 L21 12 L19 29 L23 26 Z" fill="#b48cff" ${S}/>
    <path d="M14 8 l1.5 10" stroke="#fff" stroke-width="1.3" opacity=".8"/>`,
};

export function goodIcon(g: GoodId, size = 32): string { return svg(GOOD_SVG[g] ?? GOOD_SVG.grano, size); }

export type ResIcon = 'oro' | 'secreto' | 'influencia' | 'mana' | 'alerta' | 'carga' | 'deuda' | 'acciones';
const RES_SVG: Record<ResIcon, string> = {
  oro: `<circle cx="16" cy="16" r="11" fill="#f5c542" ${S}/><circle cx="16" cy="16" r="7.5" fill="none" stroke="#b8862a" stroke-width="1.4"/><path d="M13 12 q3 -2 6 0 M13 20 q3 2 6 0 M16 10 v12" stroke="#8a5a14" stroke-width="1.6" fill="none"/><path d="M9 11 q2 -3 5 -4" stroke="#fff6c8" stroke-width="1.4" fill="none"/>`,
  secreto: `<circle cx="11" cy="11" r="6.5" fill="#9ad1c4" ${S}/><circle cx="11" cy="11" r="2.4" fill="#2a4a44"/><path d="M15.5 15.5 L27 27 M22 22 l3 -3 M25 25 l3 -3" ${S} fill="none"/>`,
  influencia: `<path d="M5 24 L7 10 L12 16 L16 7 L20 16 L25 10 L27 24 Z" fill="#ffd166" ${S}/><rect x="5" y="23" width="22" height="4" rx="1" fill="#e0a83a" ${S}/><circle cx="16" cy="18" r="2" fill="#e2455b" ${S}/>`,
  mana: `<path d="M16 4 C22 12 25 16 25 20 a9 9 0 0 1 -18 0 C7 16 10 12 16 4z" fill="#5aa9ff" ${S}/><path d="M11 19 a5 5 0 0 0 4 6" stroke="#dff0ff" stroke-width="1.6" fill="none"/>`,
  alerta: `<path d="M3 16 Q16 4 29 16 Q16 28 3 16z" fill="#fff" ${S}/><circle cx="16" cy="16" r="5.5" fill="#ff5d6c" ${S}/><circle cx="16" cy="16" r="2.2" fill="${INK}"/>`,
  carga: `<rect x="5" y="11" width="22" height="15" rx="2" fill="#a3743f" ${S}/><path d="M5 16 h22 M16 11 v15" stroke="${INK}" stroke-width="1.2"/><path d="M9 11 l3 -5 h8 l3 5" fill="#c9965a" ${S}/>`,
  deuda: `<path d="M8 4 h13 l5 5 v19 h-18z" fill="#f3ead8" ${S}/><path d="M11 13 h11 M11 17 h11 M11 21 h7" stroke="#8a6a3a" stroke-width="1.3"/><circle cx="23" cy="24" r="5" fill="#e2455b" ${S}/><path d="M23 21.5 v3 M23 26.5 v.5" stroke="#fff" stroke-width="1.6"/>`,
  acciones: `<rect x="5" y="17" width="5" height="10" fill="#3ab06a" ${S}/><rect x="13.5" y="11" width="5" height="16" fill="#3ab06a" ${S}/><rect x="22" y="6" width="5" height="21" fill="#6fe39a" ${S}/><path d="M4 12 L12 7 L18 9 L27 3" stroke="#ffd166" stroke-width="1.8" fill="none"/>`,
};
export function resIcon(k: ResIcon, size = 20): string { return svg(RES_SVG[k], size); }

const BIZ_SVG: Record<BusinessKind, string> = {
  molino: `<path d="M12 28 L14 13 H18 L20 28 Z" fill="#e8d8b0" ${S}/><g transform="rotate(20 16 12)"><path d="M16 12 L16 2 L19 3 L18 12 M16 12 L26 12 L25 15 L16 14 M16 12 L16 22 L13 21 L14 12 M16 12 L6 12 L7 9 L16 10" fill="#c9965a" ${S}/></g><circle cx="16" cy="12" r="1.6" fill="${INK}"/>`,
  aserradero: `<circle cx="16" cy="15" r="9" fill="#c9ced6" ${S}/>${Array.from({ length: 12 }, (_, i) => { const a = (i / 12) * Math.PI * 2; return `<path d="M${16 + Math.cos(a) * 9} ${15 + Math.sin(a) * 9} l${Math.cos(a + 0.6) * 3} ${Math.sin(a + 0.6) * 3}" ${S}/>`; }).join('')}<circle cx="16" cy="15" r="2.5" fill="#8a6a3a" ${S}/><rect x="3" y="25" width="26" height="4" rx="1" fill="#a3743f" ${S}/>`,
  mina: `<path d="M5 27 L16 5 L27 27 Z" fill="#7a6a5a" ${S}/><path d="M11 27 a5 6 0 0 1 10 0z" fill="${INK}"/><path d="M20 9 L28 4 M24 6 l2 4" stroke="#c9ced6" stroke-width="2" stroke-linecap="round"/><circle cx="14" cy="17" r="1.4" fill="#46c8f0"/>`,
  taller: `<path d="M9 13 h14 l-2 14 h-10 z" fill="#4a5a3a" ${S}/><path d="M7 10 h18 v4 h-18z" fill="#6a7a4a" ${S}/><path d="M12 8 q-2 -4 1 -6 M17 8 q2 -3 -1 -6 M21 8 q1 -2 0 -4" stroke="#8dff5a" stroke-width="1.5" fill="none"/><circle cx="16" cy="20" r="2.2" fill="#8dff5a"/>`,
  taberna: `<path d="M8 9 h13 v16 a3 3 0 0 1 -3 3 h-7 a3 3 0 0 1 -3 -3z" fill="#e8b24a" ${S}/><path d="M21 13 h3 a3 3 0 0 1 0 8 h-3" fill="none" ${S}/><path d="M7 9 q2 -5 7 -3 q4 -3 8 1 v2 h-15z" fill="#fff6dc" ${S}/>`,
  sedas: `<path d="M4 8 h24 v4 h-24z" fill="#8a2a5a" ${S}/><path d="M6 12 q2 14 -1 16 h8 q-3 -6 0 -16z M26 12 q-2 14 1 16 h-8 q3 -6 0 -16z" fill="#d45a92" ${S}/><circle cx="16" cy="18" r="3" fill="#ffd166" ${S}/>`,
  naviera: `<path d="M4 20 h24 l-4 7 h-16z" fill="#8a5a2a" ${S}/><path d="M15 4 v16" ${S}/><path d="M16 5 q9 5 0 13z" fill="#f3ead8" ${S}/><path d="M15 7 q-7 4 0 10z" fill="#e8dcc0" ${S}/><path d="M2 29 q4 -2 7 0 q4 2 7 0 q4 -2 7 0 q4 2 7 0" stroke="#4fc8ff" stroke-width="1.5" fill="none"/>`,
  cristaleria: `<path d="M11 28 h10 l2 -10 h-14z" fill="#e8f0ff" ${S}/><path d="M16 3 L20 10 L18 18 H14 L12 10 Z" fill="#9b5cff" ${S}/><path d="M10 24 h12" stroke="#9b5cff" stroke-width="2"/>`,
};
export function bizIcon(k: BusinessKind, size = 34): string { return svg(BIZ_SVG[k] ?? BIZ_SVG.taberna, size); }

// ───────────────────────────── crests ─────────────────────────────

const CREST_COLORS: Record<ContinentId, [string, string]> = {
  valdoria: ['#c0392b', '#f5d99a'], sylvaria: ['#2f6a3a', '#ffd36b'], kharaz: ['#5a4034', '#ff6a2a'],
  morvenna: ['#3a2a5a', '#b48cff'], islas: ['#1f7a8a', '#ffd166'], concordia: ['#f3ead8', '#d9b36c'],
};

const CREST_EMBLEM: Record<ContinentId, string> = {
  valdoria: `<path d="M8 19 L9 10 L12.5 14 L16 8 L19.5 14 L23 10 L24 19 Z" fill="{b}" ${S}/><rect x="8" y="19" width="16" height="3" fill="{b}" ${S}/>`,
  sylvaria: `<path d="M16 25 V17" stroke="{b}" stroke-width="2.4"/><circle cx="16" cy="13" r="6" fill="{b}" ${S}/><circle cx="11" cy="15.5" r="3.5" fill="{b}" ${S}/><circle cx="21" cy="15.5" r="3.5" fill="{b}" ${S}/>`,
  kharaz: `<path d="M6 24 L13 11 L17 17 L20 13 L26 24 Z" fill="{b}" ${S}/><path d="M14 6 h8 v5 h-8z" fill="{b}" ${S}/><path d="M18 11 v8" stroke="${INK}" stroke-width="2"/>`,
  morvenna: `<path d="M20 7 a9 9 0 1 0 0 18 a7 7 0 1 1 0 -18z" fill="{b}" ${S}/><circle cx="15" cy="16" r="2.2" fill="${INK}"/><circle cx="15" cy="16" r="1" fill="{b}"/>`,
  islas: `<circle cx="13" cy="17" r="6" fill="{b}" ${S}/><circle cx="13" cy="17" r="3.5" fill="none" stroke="${INK}" stroke-width="1"/><rect x="17" y="9" width="8" height="8" rx="1.5" fill="#f3ead8" ${S}/><circle cx="19.5" cy="11.5" r=".9" fill="${INK}"/><circle cx="22.5" cy="14.5" r=".9" fill="${INK}"/>`,
  concordia: `<path d="M8 22 Q16 20 24 10" stroke="{b}" stroke-width="2" fill="none"/>${[0, 1, 2, 3].map((i) => `<ellipse cx="${11 + i * 3.4}" cy="${19.5 - i * 2.6}" rx="2.6" ry="1.2" transform="rotate(-40 ${11 + i * 3.4} ${19.5 - i * 2.6})" fill="{b}" ${S}/>`).join('')}`,
};

/** Heraldic shield for a continent (fallback-safe; used by council cards and banners). */
export function crest(c: ContinentId, size = 40): string {
  const [a, b] = CREST_COLORS[c] ?? CREST_COLORS.concordia;
  const shield = `<path d="M4 4 H28 V16 C28 23 22 28 16 30 C10 28 4 23 4 16 Z" fill="${a}" ${S}/><path d="M6.5 6.5 H25.5 V16 C25.5 21.5 21 25.5 16 27.4" stroke="${b}" stroke-width="1" fill="none" opacity=".6"/>`;
  return svg(shield + (CREST_EMBLEM[c] ?? '').replace(/\{b\}/g, b), size);
}

export function crestColors(c: ContinentId): [string, string] { return CREST_COLORS[c] ?? CREST_COLORS.concordia; }

/** Tiny sparkline for price/share history. */
export function sparkline(values: number[], w = 120, h = 32, color = '#ffd166'): string {
  if (values.length < 2) return svg('', w, 32);
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * (w - 4) + 2},${h - 3 - ((v - min) / span) * (h - 6)}`).join(' ');
  const last = pts.split(' ').pop()!.split(',');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/><circle cx="${last[0]}" cy="${last[1]}" r="3" fill="${color}"/></svg>`;
}
