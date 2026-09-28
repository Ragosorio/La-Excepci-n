/**
 * Overworld/location icon set (inline SVG strings). Uses the 2D-art module's `icon()` / `crestSVG()` when they
 * exist (looked up lazily so a missing or half-written art file can never break the map) and falls back to
 * these hand-made glyphs otherwise.
 */
import type { ContinentId, LocationKind } from '../../data/types';
import type { PartyKind } from '../../systems/world/state';
import { icon as artIcon, type IconName } from '../../ui/art/icons';
import { crestSVG } from '../../ui/art/heraldry';

const svg = (body: string, vb = '0 0 24 24') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="100%" height="100%">${body}</svg>`;

export const RES_ICON = {
  gold: svg(`<defs><radialGradient id="lxg" cx="40%" cy="35%"><stop offset="0" stop-color="#fff2b0"/><stop offset=".6" stop-color="#e8b847"/><stop offset="1" stop-color="#9a6a1a"/></radialGradient></defs><circle cx="12" cy="12" r="9.5" fill="url(#lxg)" stroke="#6a4410" stroke-width="1.2"/><circle cx="12" cy="12" r="6.6" fill="none" stroke="#9a6a1a" stroke-width="1"/><circle cx="12" cy="12" r="3.6" fill="#6a4410"/><circle cx="12.9" cy="11.2" r="3.1" fill="#f5d99a" opacity=".35"/>`),
  mana: svg(`<defs><linearGradient id="lxm" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#bfe4ff"/><stop offset="1" stop-color="#2a6ad8"/></linearGradient></defs><path d="M12 2.5C9 7 5.5 10.5 5.5 14.5a6.5 6.5 0 0 0 13 0C18.5 10.5 15 7 12 2.5z" fill="url(#lxm)" stroke="#1a3a7a" stroke-width="1.1"/><ellipse cx="9.6" cy="13.4" rx="1.4" ry="2.4" fill="#fff" opacity=".6"/>`),
  essence: svg(`<defs><radialGradient id="lxe"><stop offset="0" stop-color="#fff"/><stop offset=".45" stop-color="#e0a8ff"/><stop offset="1" stop-color="#7a3ad8"/></radialGradient></defs><path d="M12 1.5l2.4 7.1 7.1 2.4-7.1 2.4L12 20.5l-2.4-7.1L2.5 11l7.1-2.4z" fill="url(#lxe)" stroke="#4b2a86" stroke-width=".9"/>`),
  influence: svg(`<path d="M3 18.5h18l-1.4-10-4.3 3.6L12 5l-3.3 7.1L4.4 8.5z" fill="#ffd166" stroke="#8a5a10" stroke-width="1.1" stroke-linejoin="round"/><rect x="3" y="18.5" width="18" height="2.5" rx=".6" fill="#e8a83a" stroke="#8a5a10" stroke-width=".9"/><circle cx="12" cy="14.6" r="1.4" fill="#e2455b"/>`),
  secrets: svg(`<circle cx="8" cy="9" r="4.6" fill="none" stroke="#9ad1c4" stroke-width="2.4"/><path d="M11.4 12.2l8.6 8.3M16.4 16.9l2.2-2.2M18.4 19l2-2" stroke="#9ad1c4" stroke-width="2.4" stroke-linecap="round"/><circle cx="8" cy="9" r="1.3" fill="#9ad1c4"/>`),
  alert: svg(`<path d="M1.5 12S5.5 5 12 5s10.5 7 10.5 7-4 7-10.5 7S1.5 12 1.5 12z" fill="#3a0a14" stroke="#ff5d6c" stroke-width="1.5"/><circle cx="12" cy="12" r="4" fill="#ff5d6c"/><circle cx="12" cy="12" r="1.8" fill="#1a0508"/>`),
  hp: svg(`<path d="M12 20.5S3 14.8 3 8.8A4.8 4.8 0 0 1 12 6a4.8 4.8 0 0 1 9 2.8c0 6-9 11.7-9 11.7z" fill="#e2455b" stroke="#6a1020" stroke-width="1.1"/>`),
} as const;
export type ResIcon = keyof typeof RES_ICON;

const st = (d: string) => svg(`<path d="${d}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`);
const fl = (d: string) => svg(`<path d="${d}" fill="currentColor"/>`);

export const UI_ICON = {
  codex: st('M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5zM4 4.5v17M8 7h8M8 10.5h6'),
  relics: svg(`<path d="M12 2.5l6 6-6 13-6-13z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M6 8.5h12M9.5 8.5L12 21.5l2.5-13M9 2.8l.5 5.7M15 2.8l-.5 5.7" fill="none" stroke="currentColor" stroke-width="1.2"/>`),
  army: st('M5 19L19 5M15 5h4v4M19 19L5 5M9 5H5v4M3.5 17.5l3 3M20.5 17.5l-3 3'),
  quests: st('M7 3h11a2 2 0 0 1 2 2v2h-4M7 3a2 2 0 0 0-2 2v12a2 2 0 0 1-2 2h11a2 2 0 0 0 2-2V5a2 2 0 0 1 2-2M8 8h5M8 11.5h5M8 15h3'),
  map: st('M3 6l6-2.5 6 2.5 6-2.5V18l-6 2.5-6-2.5-6 2.5zM9 3.5v14.5M15 6v14.5'),
  book: svg(`<path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8 10.5s2-3 4.5-3 4.5 3 4.5 3-2 3-4.5 3S8 10.5 8 10.5z" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="12.5" cy="10.5" r="1.3" fill="currentColor"/>`),
  veil: st('M12 3c-4.5 0-7 3.5-7 8v9l3.5-2 3.5 2 3.5-2 3.5 2v-9c0-4.5-2.5-8-7-8zM9 11h.01M15 11h.01'),
  pause: fl('M6 4h4v16H6zM14 4h4v16h-4z'),
  play: fl('M7 4l12 8-12 8z'),
  fast: fl('M3 5l8 7-8 7zM12 5l8 7-8 7z'),
  faster: fl('M2 6l6 6-6 6zM9 6l6 6-6 6zM16 6l6 6-6 6z'),
  pin: st('M12 21s-6.5-6.2-6.5-11A6.5 6.5 0 0 1 12 3.5 6.5 6.5 0 0 1 18.5 10c0 4.8-6.5 11-6.5 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z'),
  collapse: st('M6 15l6-6 6 6'),
  expand: st('M6 9l6 6 6-6'),
  enter: st('M10 17l5-5-5-5M15 12H3M14 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5'),
  star: fl('M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.3l-6.1 3.3 1.4-6.8L2.2 9.1l6.9-.8z'),
  eclipse: svg(`<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.4" opacity=".9"/><circle cx="12" cy="12" r="7.2" fill="#0d0714"/><circle cx="12" cy="12" r="7.8" fill="none" stroke="currentColor" stroke-width=".7" opacity=".7"/>`),
  close: st('M6 6l12 12M18 6L6 18'),
  sword: st('M14.5 3.5L20.5 3.5 20.5 9.5 9 21 3 21 3 15zM6.5 13.5l4 4'),
  temple: st('M3 21h18M5 21V10M9 21V10M15 21V10M19 21V10M2.5 10h19L12 3z'),
  rest: st('M3 18v-6h18v6M3 14h18M6 12V8h5v4M3 21v-3M21 21v-3'),
  skull: st('M12 3a7 7 0 0 0-7 7c0 2.6 1.3 4.2 3 5v3h8v-3c1.7-.8 3-2.4 3-5a7 7 0 0 0-7-7zM9 11h.01M15 11h.01M10 18v3M14 18v3'),
} as const;

const OWN_KIND: Record<LocationKind, string> = {
  capital: fl('M3 21V10l3 2V7l3 2V4l3 3 3-3v5l3-2v5l3-2v11h-7v-5h-4v5z'),
  ciudad: fl('M2 21v-9l5-4 5 4v9h-3v-5H5v5zM13 21V9l4.5-4L22 9v12h-3v-4h-3v4z'),
  aldea: fl('M3 21v-8l9-8 9 8v8h-6v-6H9v6z'),
  fortaleza: fl('M5 21V8H3V3h3v2h2V3h3v2h2V3h3v2h2V3h3v5h-2v13h-5v-5h-4v5z'),
  ruina: fl('M4 21v-2h16v2zM5.5 18V9l3-1v10zM10.5 18V6h3v12zM15.5 18v-7.5l3 1.5v6zM4 6l6-2-1 3-5 1z'),
  templo: svg(`<circle cx="12" cy="6" r="3.2" fill="currentColor"/><path d="M2.5 12h19v2h-19zM4 15h2.5v5H4zM9 15h2.5v5H9zM13.5 15H16v5h-2.5zM18 15h2.5v5H18zM2.5 20.5h19V22h-19z" fill="currentColor"/>`),
  especial: fl('M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.3l-6.1 3.3 1.4-6.8L2.2 9.1l6.9-.8z'),
  casino: svg(`<rect x="3.5" y="3.5" width="17" height="17" rx="3.5" fill="currentColor"/><circle cx="8.5" cy="8.5" r="1.6" fill="#0d0714"/><circle cx="15.5" cy="15.5" r="1.6" fill="#0d0714"/><circle cx="12" cy="12" r="1.6" fill="#0d0714"/><circle cx="15.5" cy="8.5" r="1.6" fill="#0d0714"/><circle cx="8.5" cy="15.5" r="1.6" fill="#0d0714"/>`),
  arena: svg(`<circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M7 7l10 10M17 7L7 17" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>`),
  puerto: st('M12 5a2 2 0 1 0 0-.01zM12 7v14M5 13a7 7 0 0 0 14 0M8 10h8'),
  santuario: svg(`<circle cx="12" cy="12" r="9.5" fill="currentColor" opacity=".35"/><circle cx="12" cy="12" r="7" fill="#0d0714"/><circle cx="12" cy="12" r="8.2" fill="none" stroke="currentColor" stroke-width="1.3"/>`),
  concilio: fl('M2 21v-2h20v2zM3 18V9l1.5-2L6 9v9zM7.5 18V7L9 5l1.5 2v11zM12 18V5l1.5-2L15 5v13zM16.5 18V7L18 5l1.5 2v11zM20.5 18V10l.75-1 .75 1v8z'),
};

/** Location kind glyphs: the shared art set where it has a matching icon, ours otherwise. */
export const KIND_ICON: Record<LocationKind, string> = {
  ...OWN_KIND,
  capital: art('castillo', OWN_KIND.capital),
  ruina: art('ruina', OWN_KIND.ruina),
  templo: art('templo', OWN_KIND.templo),
  casino: art('casino', OWN_KIND.casino),
  arena: art('arena', OWN_KIND.arena),
  puerto: art('barco', OWN_KIND.puerto),
  santuario: art('eclipse', OWN_KIND.santuario),
  concilio: art('concilio', OWN_KIND.concilio),
};

export const PARTY_ICON: Record<PartyKind, string> = {
  caravana: art('caravana', st('M3 16V8h11v8M14 11h4l3 3v2h-7M7 19a2 2 0 1 0 0-.01zM17 19a2 2 0 1 0 0-.01z')),
  patrulla: st('M12 2v20M9 5l3-3 3 3M8 12h8'),
  ejercito: st('M5 21V3M5 4h12l-3 4 3 4H5'),
  cazadores: svg(`<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 1.5v5M12 17.5v5M1.5 12h5M17.5 12h5" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="1.8" fill="currentColor"/>`),
  nemesis: art('calavera', UI_ICON.skull),
  rival: st('M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM15.5 8.5l-2 5-5 2 2-5z'),
  refugiados: st('M8 20c-1.5 0-2-1.5-2-3s1-4 2-4 2 2.5 2 4-.5 3-2 3zM16 13c-1.5 0-2-1.5-2-3s1-4 2-4 2 2.5 2 4-.5 3-2 3z'),
  aurel: svg(`<circle cx="12" cy="12" r="4.5" fill="currentColor"/><path d="M12 1.5v3.5M12 19v3.5M1.5 12H5M19 12h3.5M4.6 4.6l2.5 2.5M16.9 16.9l2.5 2.5M4.6 19.4l2.5-2.5M16.9 7.1l2.5-2.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>`),
  bandidos: st('M14.5 3.5L20.5 3.5 20.5 9.5 9 21 3 21 3 15zM6.5 13.5l4 4'),
  alianza: fl('M12 2l1.8 3.9 4.2.5-3.1 2.9.9 4.2L12 11.4l-3.8 2.1.9-4.2L6 6.4l4.2-.5zM5 14l1 2.2 2.4.3-1.8 1.6.5 2.4L5 19.3l-2.1 1.2.5-2.4-1.8-1.6 2.4-.3zM19 14l1 2.2 2.4.3-1.8 1.6.5 2.4-2.1-1.2-2.1 1.2.5-2.4-1.8-1.6 2.4-.3z'),
  cobradores: art('oro', st('M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v10M9 9.5c0-1.4 1.3-2 3-2s3 .7 3 2-1.3 1.8-3 2.2-3 .9-3 2.3 1.3 2 3 2 3-.6 3-2')),
};

const CREST_SYMBOL: Record<ContinentId, string> = {
  valdoria: 'M7 17h10l-1-7-2.5 2L12 7l-1.5 5L8 10z',
  sylvaria: 'M12 5l4.5 7h-2.5l3 4.5h-10l3-4.5H7.5zM11 16.5h2V19h-2z',
  kharaz: 'M5 17l5-8 2.5 3.5L15 9l4 8zM10.2 6.5h3.6l-1.8-2z',
  morvenna: 'M14.5 5.5a6.5 6.5 0 1 0 3.5 11.8A5.2 5.2 0 0 1 14.5 5.5z',
  islas: 'M12 5.5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11zm0 2.2a3.3 3.3 0 1 0 0 6.6 3.3 3.3 0 0 0 0-6.6z',
  concordia: 'M6 17V10l1-1.2L8 10v7zM9.3 17V8.5l1-1.2 1 1.2V17zM12.6 17V8.5l1-1.2 1 1.2V17zM16 17V10l1-1.2 1 1.2v7zM5 18h14v1.2H5z',
};
const CREST_COLOR: Record<ContinentId, [string, string]> = {
  valdoria: ['#8f2430', '#e8c46a'], sylvaria: ['#2f6a3a', '#ffe08a'], kharaz: ['#7a3a1a', '#ffb070'],
  morvenna: ['#3a2a6a', '#d8c0ff'], islas: ['#0f6a7a', '#ffd166'], concordia: ['#e8e2d0', '#8a6a33'],
};

export function fallbackCrest(c: ContinentId): string {
  const [bg, fg] = CREST_COLOR[c];
  return svg(`<path d="M12 1.8l8.2 3v6.4c0 5.3-3.6 9.3-8.2 11-4.6-1.7-8.2-5.7-8.2-11V4.8z" fill="${bg}" stroke="#d9b36c" stroke-width="1.2"/><path d="${CREST_SYMBOL[c]}" fill="${fg}"/>`);
}

// ───────────────────────── art module (src/ui/art) ─────────────────────────

/** Icon from the shared 2D-art set, falling back to our own glyph if it throws. */
export function art(name: IconName, fallback = ''): string {
  try { return artIcon(name, { size: 24 }); } catch { return fallback; }
}

/** Kept for API compatibility (art is statically imported now). */
export function loadArt(onReady?: () => void): void { onReady?.(); }

export function crest(c: ContinentId | 'excepcion'): string {
  try {
    const s = crestSVG(c, 96);
    if (s && s.includes('<svg')) return s;
  } catch { /* fall back */ }
  return c === 'excepcion' ? UI_ICON.eclipse : fallbackCrest(c);
}

/** Location action icons. */
export const ACTION_ICON = {
  talk: st('M4 5h16v11H9l-5 4zM8 9h8M8 12h5'),
  market: st('M12 3v18M5 7h14M5 7l-2.5 6a2.5 2.5 0 0 0 5 0zM19 7l-2.5 6a2.5 2.5 0 0 0 5 0zM8 21h8'),
  recruit: st('M6 21V4M6 5h11l-2.5 3.5L17 12H6M14 21v-3a3 3 0 0 1 6 0v3M17 13.5a2 2 0 1 0 0 .01'),
  tavern: st('M5 7h10v11a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3zM15 10h2.5a2.5 2.5 0 0 1 0 5H15M5 7c0-2 1.5-3.5 5-3.5S15 5 15 7'),
  sedas: st('M12 20L4 8a8 8 0 0 1 16 0zM12 20V8M8 9.5L12 20M16 9.5L12 20'),
  bank: st('M3 10l9-6 9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18'),
  temple: UI_ICON.temple,
  forge: st('M3 9h11l3-3h4v3l-3 2v2H3zM7 13v3M12 13v3M5 20h10l-2-4H7z'),
  academy: st('M2 9l10-5 10 5-10 5zM6 11v5c0 1.5 3 3 6 3s6-1.5 6-3v-5M21 9v6'),
  casino: KIND_ICON.casino,
  arena: KIND_ICON.arena,
  council: KIND_ICON.concilio,
  ruin: KIND_ICON.ruina,
  siege: st('M4 20l6-6M14 4l6 6M8.5 12.5l3 3M12 5l7 7-3 3-7-7zM3 21l2-2'),
  terror: UI_ICON.skull,
  mind: svg(`<path d="M12 12m-1 0a1 1 0 1 0 2 0 3 3 0 1 0-6 0 5 5 0 1 0 10 0 7 7 0 1 0-14 0 9 9 0 1 0 18 0" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>`),
  invest: st('M12 3v18M16.5 7.5c-.8-1.3-2.4-2-4.5-2-2.8 0-4.5 1.3-4.5 3.2 0 4.3 9.5 2.2 9.5 6.6 0 2-1.9 3.3-5 3.3-2.3 0-4.2-.9-5-2.4'),
  raid: st('M12 2c1 3 4 4.5 4 8a4 4 0 0 1-8 0c0-1.5.6-2.6 1.5-3.5C9.8 8 11 7.5 11 5.5 11 4 11.5 3 12 2zM9 21h6M12 14v7'),
  infiltrate: UI_ICON.veil,
  sanctuary: KIND_ICON.santuario,
  rest: st('M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z'),
  leave: st('M15 18l-6-6 6-6M9 12h12'),
  heist: st('M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4M12 15v2'),
  trunk: st('M3 18h18M6 18c0-4 2-6 6-6s6 2 6 6M12 12V6M9 8l3-2 3 2'),
};
