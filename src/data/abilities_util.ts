/**
 * Authoring helper for ability data: fills comprehension from rarity (GDD §4.3) and type-checks sfx/vfx names.
 * Only type imports from audio → no runtime dependency.
 */
import type { AbilityDef, Rarity } from './types';
import type { SfxName } from '../audio';

/** Fx presets from render/fx.ts (kept as a literal union so typos fail the type-check). */
export type VfxName =
  | 'spark' | 'hit' | 'magic' | 'arcane' | 'fire' | 'ice' | 'lightning' | 'light' | 'shadow' | 'mind' | 'poison'
  | 'nature' | 'ink' | 'smoke' | 'dust' | 'explosion' | 'coins' | 'essence' | 'heal' | 'stars' | 'leaves'
  | 'confetti' | 'blood' | 'earth' | 'time' | 'luck';

export const COMPREHENSION_BY_RARITY: Record<Rarity, number> = { comun: 1, pococomun: 1, rara: 2, epica: 3, legendaria: 4, mitica: 5 };

export type AbilityInput = Omit<AbilityDef, 'comprehension' | 'sfx' | 'vfx' | 'source'> & {
  comprehension?: number;
  sfx?: SfxName;
  vfx?: VfxName;
  source?: AbilityDef['source'];
};

/** Build an AbilityDef; comprehension defaults to the rarity table; source defaults to {} (back-filled later). */
export function A(d: AbilityInput): AbilityDef {
  return { ...d, source: d.source ?? {}, comprehension: d.comprehension ?? COMPREHENSION_BY_RARITY[d.rarity] } as AbilityDef;
}

export function defs(list: AbilityDef[]): Record<string, AbilityDef> {
  const out: Record<string, AbilityDef> = {};
  for (const a of list) out[a.id] = a;
  return out;
}
