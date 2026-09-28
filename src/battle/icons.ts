/**
 * Ability icons for the hotbar/results. Uses `icon()` from src/ui/art/icons when that module exists
 * (optional glob import, so a missing file never breaks the build), else a school glyph SVG.
 */
import type { School } from '../data/types';
import { SCHOOL_INFO } from '../data/schools';

type IconFn = (name: string, o?: { size?: number; color?: string }) => string;
const mods = import.meta.glob('../ui/art/icons.ts', { eager: true }) as Record<string, { icon?: IconFn; ICON_NAMES?: string[] }>;
const artMod = Object.values(mods)[0];
const artIcon: IconFn | undefined = artMod?.icon;
const artNames = new Set<string>(artMod?.ICON_NAMES ?? []);
const SCHOOL_ALIAS: Partial<Record<School, string>> = { arcano: 'esencia', fisico: 'espada', agua: 'hielo' };

const GLYPH: Record<School, string> = {
  arcano: 'M32 8 L37 27 L56 32 L37 37 L32 56 L27 37 L8 32 L27 27 Z',
  fuego: 'M32 6 C40 18 48 24 46 38 C45 50 38 57 32 57 C24 57 17 50 18 39 C19 30 25 27 26 18 C30 24 30 30 33 32 C36 26 35 16 32 6 Z',
  hielo: 'M31 6 h2 v52 h-2 Z M8 31 h48 v2 H8 Z M13.6 15 l1.4-1.4 35.4 35.4 -1.4 1.4 Z M49 13.6 l1.4 1.4 -35.4 35.4 -1.4-1.4 Z M26 10 l6 6 6-6 M26 54 l6-6 6 6 M10 26 l6 6 -6 6 M54 26 l-6 6 6 6',
  rayo: 'M36 4 L14 36 H29 L24 60 L50 24 H34 L42 4 Z',
  luz: 'M32 18 A14 14 0 1 1 31.9 18 Z M31 2 h2 v10 h-2 Z M31 52 h2 v10 h-2 Z M2 31 h10 v2 H2 Z M52 31 h10 v2 H52 Z M10 11 l1.4-1.4 7 7 -1.4 1.4 Z M46 47 l1.4-1.4 7 7 -1.4 1.4 Z M53 11 l1.4 1.4 -7 7 -1.4-1.4 Z M17 47 l1.4 1.4 -7 7 -1.4-1.4 Z',
  sombra: 'M40 8 A24 24 0 1 0 56 44 A20 20 0 1 1 40 8 Z',
  mente: 'M32 32 m-2 0 a2 2 0 1 1 4 0 a6 6 0 1 1 -10 0 a10 10 0 1 1 18 0 a14 14 0 1 1 -26 0 a18 18 0 1 1 34 0 a22 22 0 1 1 -42 0',
  naturaleza: 'M12 52 C12 26 30 10 54 10 C54 34 38 52 12 52 Z M12 52 L40 24',
  veneno: 'M32 6 C40 20 50 30 50 40 A18 18 0 0 1 14 40 C14 30 24 20 32 6 Z',
  sangre: 'M32 8 C38 22 48 30 48 42 A16 16 0 0 1 16 42 C16 30 26 22 32 8 Z',
  fuerza: 'M20 22 h24 a6 6 0 0 1 6 6 v14 a10 10 0 0 1 -10 10 h-14 a10 10 0 0 1 -10 -10 v-14 a6 6 0 0 1 4 -6 Z M22 14 h6 v10 h-6 Z M30 12 h6 v12 h-6 Z M38 14 h6 v10 h-6 Z',
  tierra: 'M4 54 L24 18 L34 34 L42 24 L60 54 Z',
  tiempo: 'M16 6 H48 V12 C48 24 36 28 36 32 C36 36 48 40 48 52 V58 H16 V52 C16 40 28 36 28 32 C28 28 16 24 16 12 Z',
  suerte: 'M32 30 C20 30 16 18 24 14 C30 11 32 20 32 30 C32 20 34 11 40 14 C48 18 44 30 32 30 Z M32 30 C20 30 16 42 24 46 C30 49 32 40 32 30 C32 40 34 49 40 46 C48 42 44 30 32 30 Z M32 30 L34 58',
  agua: 'M4 26 C12 18 20 34 28 26 C36 18 44 34 52 26 C56 22 60 24 60 24 V32 C52 40 44 24 36 32 C28 40 20 24 12 32 C8 36 4 34 4 34 Z M4 42 C12 34 20 50 28 42 C36 34 44 50 52 42 L60 40 V48 C52 56 44 40 36 48 C28 56 20 40 12 48 L4 50 Z',
  fisico: 'M46 6 L58 6 L58 18 L28 48 L22 42 Z M18 38 L26 46 L20 52 L12 44 Z M10 46 L18 54 L12 60 L4 52 Z',
};

export function abilityIcon(id: string, school: School, size = 40): string {
  const c = SCHOOL_INFO[school]?.color ?? '#9b5cff';
  if (artIcon) {
    const name = artNames.has(id) ? id : artNames.has(school) ? school : SCHOOL_ALIAS[school] && artNames.has(SCHOOL_ALIAS[school]!) ? SCHOOL_ALIAS[school]! : '';
    if (name) {
      try {
        const g = artIcon(name, { size: Math.round(size * 0.66), color: '#fff7ea' });
        return `<span class="bt-ico" style="--ic:${c};width:${size}px;height:${size}px">${g}</span>`;
      } catch { /* fall back */ }
    }
  }
  const stroke = school === 'hielo' || school === 'mente' || school === 'naturaleza' || school === 'suerte';
  const p = GLYPH[school] ?? GLYPH.arcano;
  return `<svg viewBox="0 0 64 64" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <defs><radialGradient id="g_${school}" cx="50%" cy="40%" r="70%"><stop offset="0" stop-color="${c}" stop-opacity="0.55"/><stop offset="1" stop-color="#0d0714" stop-opacity="0.95"/></radialGradient></defs>
    <rect x="1" y="1" width="62" height="62" rx="12" fill="url(#g_${school})"/>
    <path d="${p}" fill="${stroke ? 'none' : '#fff7ea'}" stroke="${stroke ? '#fff7ea' : c}" stroke-width="${stroke ? 3.5 : 1.5}" stroke-linecap="round" stroke-linejoin="round" style="filter:drop-shadow(0 0 3px ${c})"/>
  </svg>`;
}

export const ECLIPSE_SVG = (on: boolean, size = 18) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}"><circle cx="12" cy="12" r="10" fill="${on ? '#f5d99a' : '#3a2a4a'}" opacity="${on ? 1 : 0.6}"/><circle cx="12" cy="12" r="8.4" fill="#0d0714"/>${on ? '<circle cx="12" cy="12" r="10" fill="none" stroke="#fff7d6" stroke-width="0.8" opacity="0.8"/>' : ''}</svg>`;
