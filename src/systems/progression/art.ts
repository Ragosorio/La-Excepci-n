/**
 * Progression art: procedural ability badges (school glyph from ui/art/icons + rarity ring + kind marker),
 * locked "???" silhouettes with comprehension pips, and thin wrappers over ui/art relic art.
 */
import type { AbilityDef, AbilityKind, Rarity, RelicDef, School } from '../../data/types';
import { RARITY_INFO, SCHOOL_INFO } from '../../data/schools';
import { icon, type IconName } from '../../ui/art/icons';
import { relicSVG } from '../../ui/art/relicArt';
import { hashString } from '../../core/rng';

const SCHOOL_ICON: Partial<Record<School, IconName>> = {
  arcano: 'arcano', fuego: 'fuego', hielo: 'hielo', rayo: 'rayo', luz: 'luz', sombra: 'sombra', mente: 'mente', naturaleza: 'naturaleza',
  veneno: 'veneno', sangre: 'sangre', fuerza: 'fuerza', tierra: 'tierra', tiempo: 'tiempo', suerte: 'suerte', fisico: 'espada',
};
/** Special glyphs for iconic abilities. */
const ABILITY_ICON: Record<string, IconName> = {
  velo: 'velo', retorno: 'retorno', afinidad_reliquias: 'afinidad', dominar_mente: 'mente', el_alba: 'sol', eclipse_total: 'eclipse',
  traicion: 'eclipse', sanacion: 'curacion', robar: 'bolsa', moneda_trucada: 'ficha', carta_marcada: 'carta', la_casa_gana: 'dado',
  dado_cargado: 'dado', la_torre: 'carta', lluvia_flechas: 'arco', disparo_certero: 'arco', flecha_estelar: 'estrella', ultima_estrella: 'estrella',
  paso_fantasma: 'velo', clones_sombra: 'mascara', metamorfosis: 'mascara', mil_cortes: 'daga', aurora_corte: 'daga', nocturna_drenaje: 'daga',
  segundo_robado: 'reloj', peso_corona: 'corona', mirada_bruma: 'ojo', rostro_prestado: 'mascara', mirada_ciclope: 'ojo', muro_escudos: 'escudo',
  escudo_divino: 'escudo', escudo_arcano: 'escudo', juramento_inquebrantable: 'escudo', cosecha_almas: 'calavera', tercer_ojo: 'ojo',
};
const WATER = '<path d="M12 3.2c3.4 4.3 6 7.6 6 10.8a6 6 0 0 1-12 0c0-3.2 2.6-6.5 6-10.8z"/><path d="M9.2 14.4a2.9 2.9 0 0 0 2.4 2.8" fill="none" stroke="#0d0714" stroke-width="1.4" stroke-linecap="round" opacity=".45"/>';

const KIND_PATH: Record<AbilityKind, string> = {
  projectile: 'M4 12h13M13 7l5 5-5 5',
  aoe: 'M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8',
  cone: 'M4 12L20 5v14z',
  beam: 'M3 12h18M6 9v6M18 9v6',
  dash: 'M5 6l6 6-6 6M12 6l6 6-6 6',
  blink: 'M4 17a8 8 0 0 1 16 0M18 17l2 0 0-2',
  buff: 'M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z',
  debuff: 'M12 4v14M6 12l6 6 6-6',
  summon: 'M8 9a2.5 2.5 0 1 0 0.01 0M16 9a2.5 2.5 0 1 0 0.01 0M4 20c0-3 2-5 4-5s4 2 4 5M12 20c0-3 2-5 4-5s4 2 4 5',
  aura: 'M12 9a3 3 0 1 0 0.01 0M12 5a7 7 0 1 0 0.01 0',
  passive: 'M6 12a3 3 0 1 0 6 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0a3 3 0 1 0-6 0',
  transform: 'M4 9a8 8 0 0 1 14-3M20 15a8 8 0 0 1-14 3M18 3v4h-4M6 21v-4h4',
  channel: 'M3 12c2-4 4-4 6 0s4 4 6 0 4-4 6 0',
  melee: 'M5 19l9-9M14 5h5v5l-8 8M4 16l4 4',
  trap: 'M3 15l3-6 3 6 3-6 3 6 3-6 3 6',
  special: 'M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6L3.3 9.3l6.1-.7z',
};

export const KIND_NAME: Record<AbilityKind, string> = {
  projectile: 'Proyectil', aoe: 'Área', cone: 'Cono', beam: 'Haz', dash: 'Embestida', blink: 'Teletransporte', buff: 'Mejora',
  debuff: 'Maleficio', summon: 'Invocación', aura: 'Aura', passive: 'Pasiva', transform: 'Transformación', channel: 'Canalizada',
  melee: 'Cuerpo a cuerpo', trap: 'Trampa', special: 'Especial',
};

const RAR_IDX: Record<Rarity, number> = { comun: 0, pococomun: 1, rara: 2, epica: 3, legendaria: 4, mitica: 5 };
export const rarityColor = (r: Rarity): string => RARITY_INFO[r].color;

function nested(svg: string, x: number, y: number): string { return svg.replace('<svg ', `<svg x="${x}" y="${y}" `); }

let gid = 0;
/** Circular ability badge. `progress` (0..1) draws a comprehension arc on locked badges. */
export function abilityIcon(def: AbilityDef, size = 64, opts: { locked?: boolean; progress?: number; pips?: [number, number] } = {}): string {
  const id = `pgi${++gid}`;
  const sc = SCHOOL_INFO[def.school]?.color ?? '#9b5cff';
  const rc = rarityColor(def.rarity);
  const ri = RAR_IDX[def.rarity];
  const h = hashString(def.id);
  const rot = h % 360;
  const locked = !!opts.locked;
  const glyphName = ABILITY_ICON[def.id] ?? SCHOOL_ICON[def.school];
  const glyphCol = locked ? '#3a3046' : '#fff8ec';
  const glyph = def.school === 'agua' && !ABILITY_ICON[def.id]
    ? `<svg x="25" y="23" width="50" height="50" viewBox="0 0 24 24" fill="${glyphCol}">${WATER}</svg>`
    : nested(icon(glyphName ?? 'estrella', { size: 50, color: glyphCol }), 25, 23);
  // spikes by rarity (count), rotated per ability for variety
  let spikes = '';
  const n = [0, 4, 6, 8, 10, 12][ri];
  for (let i = 0; i < n; i++) {
    const a = ((rot + (i * 360) / n) * Math.PI) / 180;
    const x1 = 50 + Math.cos(a) * 44, y1 = 50 + Math.sin(a) * 44;
    const x2 = 50 + Math.cos(a) * 49.5, y2 = 50 + Math.sin(a) * 49.5;
    spikes += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${locked ? '#2a2233' : rc}" stroke-width="${ri >= 4 ? 3 : 2}" stroke-linecap="round"/>`;
  }
  // rune dashes on the inner ring
  const dash = `${2 + (h % 5)} ${3 + ((h >> 3) % 6)}`;
  const kind = KIND_PATH[def.kind] ?? KIND_PATH.special;
  let arc = '';
  if (locked && opts.progress && opts.progress > 0) {
    const p = Math.min(1, opts.progress);
    const r = 40, c = 2 * Math.PI * r;
    arc = `<circle cx="50" cy="50" r="${r}" fill="none" stroke="#c7a2ff" stroke-width="4" stroke-dasharray="${(c * p).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 50 50)" stroke-linecap="round" opacity=".95"/>`;
  }
  let pips = '';
  if (opts.pips && opts.pips[1] > 0 && opts.pips[1] <= 8) {
    const [have, need] = opts.pips;
    const w = need * 9;
    for (let i = 0; i < need; i++) {
      const cx = 50 - w / 2 + 4.5 + i * 9;
      pips += `<circle cx="${cx}" cy="90" r="3.2" fill="${i < have ? '#c7a2ff' : '#1a1024'}" stroke="#c7a2ff" stroke-width="1.2"/>`;
    }
  }
  const bg = locked
    ? `<circle cx="50" cy="50" r="44" fill="url(#${id}l)"/>`
    : `<circle cx="50" cy="50" r="44" fill="url(#${id}b)"/><circle cx="50" cy="50" r="44" fill="url(#${id}s)" opacity=".55"/>`;
  const q = locked ? `<text x="50" y="${glyphName ? 64 : 62}" text-anchor="middle" font-family="Cinzel, serif" font-size="30" font-weight="700" fill="#5a4a70" opacity=".9">?</text>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${size}" height="${size}" class="pg-aicon">
<defs>
<radialGradient id="${id}b" cx="50%" cy="38%" r="65%"><stop offset="0" stop-color="${sc}" stop-opacity=".95"/><stop offset=".55" stop-color="${sc}" stop-opacity=".45"/><stop offset="1" stop-color="#0d0714"/></radialGradient>
<radialGradient id="${id}s" cx="50%" cy="15%" r="55%"><stop offset="0" stop-color="#fff" stop-opacity=".5"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
<radialGradient id="${id}l" cx="50%" cy="40%" r="60%"><stop offset="0" stop-color="#241a30"/><stop offset="1" stop-color="#0a0610"/></radialGradient>
<filter id="${id}g" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
</defs>
${spikes}
${bg}
<circle cx="50" cy="50" r="44" fill="none" stroke="${locked ? '#3a2e48' : rc}" stroke-width="${ri >= 3 ? 4 : 3}"/>
<circle cx="50" cy="50" r="37" fill="none" stroke="${locked ? '#2a2233' : '#fff'}" stroke-opacity="${locked ? 1 : 0.28}" stroke-width="1.2" stroke-dasharray="${dash}" transform="rotate(${rot} 50 50)"/>
${locked ? '' : `<g filter="url(#${id}g)">${glyph}</g>`}${locked && glyphName ? `<g opacity=".35">${glyph}</g>` : ''}${q}
${arc}
${locked ? '' : `<g transform="translate(66 66)"><circle cx="11" cy="11" r="11" fill="#0d0714" stroke="${rc}" stroke-width="1.6"/><svg x="3" y="3" width="16" height="16" viewBox="0 0 24 24"><path d="${kind}" fill="${def.kind === 'buff' || def.kind === 'cone' || def.kind === 'special' ? 'rgba(255,248,236,.25)' : 'none'}" stroke="#fff8ec" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></g>`}
${pips}
</svg>`;
}

/** Relic art with rarity frame/glow (ui/art). */
export function relicArt(def: RelicDef, size = 96, glow = true): string {
  try { return relicSVG(def.shape, def.rarity, { size, seed: def.id, glow }); } catch { return `<svg width="${size}" height="${size}"></svg>`; }
}

/** Racial power → icon name. */
export const RACIAL_ICON: Record<string, IconName> = {
  ojo_elfico: 'ojo', juramento: 'escudo', piel_montana: 'montana', estomago_hierro: 'corazon', suerte_duende: 'suerte',
  erudicion: 'libro', maleficio: 'calavera', barba_hierro: 'hierro', adaptable: 'estrella', regeneracion_trol: 'curacion',
  gracia: 'luz', sombra: 'sombra', canto: 'mente', sangre_dragon: 'fuego', la_excepcion: 'eclipse',
};

export function racialIcon(powerId: string, size = 28, color = '#f5d99a'): string {
  return icon(RACIAL_ICON[powerId] ?? 'estrella', { size, color });
}

export function schoolIcon(s: School, size = 18, color?: string): string {
  if (s === 'agua') return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}" fill="${color ?? SCHOOL_INFO.agua.color}">${WATER}</svg>`;
  return icon(SCHOOL_ICON[s] ?? 'estrella', { size, color: color ?? SCHOOL_INFO[s].color });
}

/** Resist tag → icon (schools share names with most tags). */
export function tagIcon(tag: string, size = 22, color?: string): string {
  const map: Record<string, IconName> = { fisico: 'espada', miedo: 'calavera', encanto: 'corazon', maldicion: 'calavera', transformacion: 'mascara' };
  if (tag === 'agua') return schoolIcon('agua', size, color);
  const name = (map[tag] ?? (SCHOOL_ICON as Record<string, IconName>)[tag] ?? 'estrella') as IconName;
  return icon(name, { size, color });
}

export { icon };
