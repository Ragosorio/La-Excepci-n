/**
 * Display metadata shared by UIs (Códice, HUD, tooltips, battle): schools, rarities, statuses, resist tags.
 * Spanish names + colors. Pure data, no imports beyond types.
 */
import type { Rarity, School, StatusId, StatId } from './types';

export const SCHOOL_INFO: Record<School, { name: string; color: string; glyph: string }> = {
  arcano: { name: 'Arcano', color: '#9b5cff', glyph: '✧' },
  fuego: { name: 'Fuego', color: '#ff6a2a', glyph: '🜂' },
  hielo: { name: 'Hielo', color: '#7fe3ff', glyph: '❄' },
  rayo: { name: 'Rayo', color: '#9fd0ff', glyph: 'ϟ' },
  luz: { name: 'Luz', color: '#ffd36b', glyph: '☀' },
  sombra: { name: 'Sombra', color: '#6a4c9c', glyph: '☾' },
  mente: { name: 'Mente', color: '#ff7bf0', glyph: '◎' },
  naturaleza: { name: 'Naturaleza', color: '#6fd05a', glyph: '❦' },
  veneno: { name: 'Veneno', color: '#8dff5a', glyph: '☠' },
  sangre: { name: 'Sangre', color: '#e2455b', glyph: '♥' },
  fuerza: { name: 'Fuerza', color: '#ffb347', glyph: '✊' },
  tierra: { name: 'Tierra', color: '#b08a5a', glyph: '▲' },
  tiempo: { name: 'Tiempo', color: '#ffe8b0', glyph: '⧗' },
  suerte: { name: 'Suerte', color: '#7dffb0', glyph: '♣' },
  agua: { name: 'Agua', color: '#2ab0c8', glyph: '≈' },
  fisico: { name: 'Físico', color: '#d9c9a8', glyph: '⚔' },
};

export const SCHOOL_ORDER: School[] = ['arcano', 'fuego', 'hielo', 'rayo', 'luz', 'sombra', 'mente', 'naturaleza', 'veneno', 'sangre', 'fuerza', 'tierra', 'tiempo', 'suerte', 'agua', 'fisico'];

export const RARITY_ORDER: Rarity[] = ['comun', 'pococomun', 'rara', 'epica', 'legendaria', 'mitica'];

export const RARITY_INFO: Record<Rarity, { name: string; color: string; comprehension: number; weight: number }> = {
  comun: { name: 'Común', color: '#c8c8c8', comprehension: 1, weight: 40 },
  pococomun: { name: 'Poco común', color: '#1eff00', comprehension: 1, weight: 28 },
  rara: { name: 'Rara', color: '#2f8cff', comprehension: 2, weight: 18 },
  epica: { name: 'Épica', color: '#a335ee', comprehension: 3, weight: 9 },
  legendaria: { name: 'Legendaria', color: '#ff8000', comprehension: 4, weight: 4 },
  mitica: { name: 'Mítica', color: '#e6cc80', comprehension: 5, weight: 1 },
};

export function rarityIndex(r: Rarity): number { return RARITY_ORDER.indexOf(r); }
export function rarityUp(r: Rarity, steps = 1): Rarity { return RARITY_ORDER[Math.min(RARITY_ORDER.length - 1, rarityIndex(r) + steps)]; }

export const STATUS_INFO: Record<StatusId, { name: string; good: boolean; color: string; desc: string }> = {
  quemadura: { name: 'Quemadura', good: false, color: '#ff6a2a', desc: 'Pierde vida por segundo.' },
  congelado: { name: 'Congelado', good: false, color: '#7fe3ff', desc: 'No puede moverse ni atacar.' },
  lento: { name: 'Lento', good: false, color: '#9fd0ff', desc: 'Se mueve y ataca más despacio.' },
  aturdido: { name: 'Aturdido', good: false, color: '#ffe066', desc: 'No puede actuar.' },
  veneno: { name: 'Veneno', good: false, color: '#8dff5a', desc: 'Pierde vida por segundo.' },
  encanto: { name: 'Encanto', good: false, color: '#ff7bf0', desc: 'Deja de pelear, embelesado.' },
  mente: { name: 'Dominado', good: false, color: '#ff7bf0', desc: 'Pelea para el enemigo (ojos en espiral).' },
  miedo: { name: 'Miedo', good: false, color: '#6a4c9c', desc: 'Huye aterrado.' },
  sapo: { name: 'Sapo', good: false, color: '#6fd05a', desc: 'Es un sapo. Croa con resentimiento.' },
  ceguera: { name: 'Ceguera', good: false, color: '#fff7d6', desc: 'Falla la mayoría de sus ataques.' },
  silencio: { name: 'Silencio', good: false, color: '#c8c8c8', desc: 'No puede lanzar habilidades.' },
  raiz: { name: 'Enraizado', good: false, color: '#6fd05a', desc: 'No puede moverse.' },
  invisible: { name: 'Invisible', good: true, color: '#4b2a86', desc: 'Nadie lo ve. El primer golpe es crítico.' },
  escudo: { name: 'Escudo', good: true, color: '#d9b36c', desc: 'Recibe menos daño.' },
  regeneracion: { name: 'Regeneración', good: true, color: '#6fe39a', desc: 'Recupera vida por segundo.' },
  prisa: { name: 'Prisa', good: true, color: '#7dffb0', desc: 'Se mueve y ataca más rápido.' },
  robo_vida: { name: 'Robo de vida', good: true, color: '#e2455b', desc: 'Se cura con el daño que hace.' },
  maldicion: { name: 'Maldición', good: false, color: '#8a3ab0', desc: 'Pierde armadura y no se regenera.' },
  furia: { name: 'Furia', good: true, color: '#ff4a1a', desc: 'Hace más daño.' },
  inmortal: { name: 'Inmortal', good: true, color: '#fff7c2', desc: 'Su vida no baja de 1.' },
  sangrado: { name: 'Sangrado', good: false, color: '#9b2a4a', desc: 'Pierde vida por segundo al moverse.' },
  marcado: { name: 'Marcado', good: false, color: '#e2455b', desc: 'Recibe más daño.' },
  traicion: { name: 'Traición', good: false, color: '#e6cc80', desc: 'Se vuelve contra su propio ejército.' },
  provocar: { name: 'Provocado', good: false, color: '#ffb347', desc: 'Solo puede atacar a quien lo provocó.' },
};

/** Resist tags (La Excepción): copying an ability grants resistance to its tags. */
export const TAG_INFO: Record<string, { name: string; color: string }> = {
  fuego: { name: 'Fuego', color: '#ff6a2a' },
  hielo: { name: 'Hielo', color: '#7fe3ff' },
  rayo: { name: 'Rayo', color: '#9fd0ff' },
  veneno: { name: 'Veneno', color: '#8dff5a' },
  mente: { name: 'Mente', color: '#ff7bf0' },
  sombra: { name: 'Sombra', color: '#6a4c9c' },
  luz: { name: 'Luz', color: '#ffd36b' },
  fisico: { name: 'Físico', color: '#d9c9a8' },
  tierra: { name: 'Tierra', color: '#b08a5a' },
  sangre: { name: 'Sangre', color: '#e2455b' },
  tiempo: { name: 'Tiempo', color: '#ffe8b0' },
  suerte: { name: 'Suerte', color: '#7dffb0' },
  agua: { name: 'Agua', color: '#2ab0c8' },
  arcano: { name: 'Arcano', color: '#9b5cff' },
  naturaleza: { name: 'Naturaleza', color: '#6fd05a' },
  miedo: { name: 'Miedo', color: '#8a6ab0' },
  encanto: { name: 'Encanto', color: '#ff9ad5' },
  maldicion: { name: 'Maldición', color: '#8a3ab0' },
  transformacion: { name: 'Transformación', color: '#9dff7a' },
};

export function tagName(tag: string): string { return TAG_INFO[tag]?.name ?? tag.charAt(0).toUpperCase() + tag.slice(1); }

export const STAT_INFO: Record<StatId, { name: string; short: string }> = {
  fuerza: { name: 'Fuerza', short: 'FUE' },
  magia: { name: 'Magia', short: 'MAG' },
  velocidad: { name: 'Velocidad', short: 'VEL' },
  presencia: { name: 'Presencia', short: 'PRE' },
  suerte: { name: 'Suerte', short: 'SUE' },
  vida: { name: 'Vida', short: 'VID' },
  mana: { name: 'Maná', short: 'MAN' },
  armadura: { name: 'Armadura', short: 'ARM' },
};
