/**
 * Name generation. Canonical exports: randomName(race, gender, rng), captainTitle(rng), NAMES.
 * Pools live in races.ts (RaceDef.namePool). Nemesis captains get titles from CAPTAIN_TITLES.
 */
import type { RaceId } from './types';
import type { Rng } from '../core/rng';
import { RACES } from './races';

/** Per-race name pools (alias of RACES[race].namePool). */
export const NAMES: Record<RaceId, { m: string[]; f: string[]; surnames: string[] }> = Object.fromEntries(
  (Object.keys(RACES) as RaceId[]).map((r) => [r, RACES[r].namePool]),
) as Record<RaceId, { m: string[]; f: string[]; surnames: string[] }>;

/** Races whose "surnames" are epithets ("Pie de Valle", "el Paciente") and read better with a connector. */
const EPITHET_RACES: Partial<Record<RaceId, true>> = { gigante: true, ogro: true, trol: true, draconido: true };

const FALLBACK = { m: ['Brann', 'Oren'], f: ['Ilse', 'Vela'], surnames: ['del Vado'] };

/**
 * "Chepe Tornillo", "Doña Chabela Pisto", "Borr Pie de Valle", "Aelar Rocíoalba".
 * gender 'x' picks from both pools.
 */
export function randomName(race: RaceId, gender: 'f' | 'm' | 'x', rng: Rng): string {
  const pool = NAMES[race] ?? FALLBACK;
  const g: 'm' | 'f' = gender === 'x' ? (rng.chance(0.5) ? 'm' : 'f') : gender;
  const firsts = pool[g].length ? pool[g] : pool.m.length ? pool.m : FALLBACK.m;
  const first = rng.pick(firsts);
  const sur = pool.surnames.length ? rng.pick(pool.surnames) : '';
  if (race === 'excepcion') return 'Elias Veyr';
  if (race === 'duende') {
    // Old goblins get a respectful "Don/Doña" — the Banca runs on respect (and interest).
    const honor = rng.chance(0.22) ? (g === 'f' ? 'Doña ' : 'Don ') : '';
    return `${honor}${first} ${sur}`.trim();
  }
  // Epithet races ("Borr Pie de Valle", "Zanko el Paciente") sometimes go by the first name alone.
  if (EPITHET_RACES[race] && rng.chance(0.15)) return first;
  return sur ? `${first} ${sur}` : first;
}

/** Just a first name (for rank-and-file units that get named on promotion). */
export function randomFirstName(race: RaceId, gender: 'f' | 'm' | 'x', rng: Rng): string {
  const pool = NAMES[race] ?? FALLBACK;
  const g: 'm' | 'f' = gender === 'x' ? (rng.chance(0.5) ? 'm' : 'f') : gender;
  const firsts = pool[g].length ? pool[g] : pool.m;
  return rng.pick(firsts.length ? firsts : FALLBACK.m);
}

/** Nemesis titles. Masculine/feminine variants are resolved by `captainTitle(rng, gender)`. */
export const CAPTAIN_TITLES: Array<string | [string, string]> = [
  ['el Rompehuesos', 'la Rompehuesos'],
  ['el que No Parpadea', 'la que No Parpadea'],
  'Matador de Excepciones',
  ['el Terco', 'la Terca'],
  ['el Dos Veces Quemado', 'la Dos Veces Quemada'],
  'Muerde-Magos',
  ['el Paciente', 'la Paciente'],
  'Cara de Yunque',
  ['el Sin Sombra', 'la Sin Sombra'],
  'Tres Cicatrices',
  ['el Carnicero del Vado', 'la Carnicera del Vado'],
  'Ojo de Cuervo',
  ['el Hambriento', 'la Hambrienta'],
  'Mano de Hierro',
  ['el Que Volvió', 'la Que Volvió'],
  'Rompe-Juramentos',
  ['el Maldito', 'la Maldita'],
  'Voz de Trueno',
  ['el Apostador', 'la Apostadora'],
  'Diente de Oro',
  ['el Cazabrujos', 'la Cazabrujas'],
  'Sangre Fría',
  ['el Invicto', 'la Invicta'],
  'Pesadilla de Valdoria',
  ['el Risueño', 'la Risueña'],
  'Lengua de Plata',
  ['el Último en Caer', 'la Última en Caer'],
  'Hijo de Nadie',
  ['el Que Te Vio Morir', 'la Que Te Vio Morir'],
  'Azote de la Excepción',
  ['el Silencioso', 'la Silenciosa'],
  'Come-Piedras',
  ['el Rencoroso', 'la Rencorosa'],
  'Garra Rota',
  ['el Afortunado', 'la Afortunada'],
  'Portador de Malas Noticias',
];

/** Titles earned when a nemesis rises after killing Elias (society module may prefer these on promotion). */
export const PROMOTION_TITLES: Array<string | [string, string]> = [
  'Matador de Excepciones',
  ['el Que Te Vio Morir', 'la Que Te Vio Morir'],
  'Azote de la Excepción',
  ['el Que Volvió', 'la Que Volvió'],
  ['el Invicto', 'la Invicta'],
  'Verdugo del Muerto que Camina',
];

function resolveTitle(t: string | [string, string], gender: 'f' | 'm' | 'x'): string {
  if (typeof t === 'string') return t;
  return gender === 'f' ? t[1] : t[0];
}

export function captainTitle(rng: Rng, gender: 'f' | 'm' | 'x' = 'm'): string {
  return resolveTitle(rng.pick(CAPTAIN_TITLES), gender);
}

export function promotionTitle(rng: Rng, gender: 'f' | 'm' | 'x' = 'm'): string {
  return resolveTitle(rng.pick(PROMOTION_TITLES), gender);
}
