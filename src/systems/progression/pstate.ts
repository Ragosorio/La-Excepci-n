/**
 * Progression's own serializable slice (G.run.modules.progression) + the events this module emits.
 * Kept separate so logic files (codex / relics / stats / reality) can share it without import cycles.
 */
import { G, registerModule, type RunState } from '../../core/state';
import type { RaceId } from '../../data/types';

export interface RewriteLog { rewrite: string; sacrifice: string; luna: number; detail?: string }

export interface ProgressionState {
  /** Acquired but not yet seen in the Códice ("NUEVA" badge). */
  newAbilities: string[];
  /** Relic instance uids not yet seen in the inventory. */
  newRelics: string[];
  /** Abilities sacrificed to the Libro de la Realidad: cannot be re-learned this cycle. */
  forgotten: string[];
  /** Max-HP multiplier from sacrifices (−20% each). */
  hpPenalty: number;
  /** Luna until which "El oro vale el doble" is active (exclusive). */
  goldDoubleUntil: number;
  freeRewritesUsed: number;
  rewrites: RewriteLog[];
  /** Academia lessons bought per ability id. */
  lessons: Record<string, number>;
  fusionsMade: number;
  /** Last luna the Libro de Cuentas paid interest. */
  interestLuna: number;
}

declare module '../../core/state' {
  interface RunModules { progression: ProgressionState }
}

declare module '../../core/events' {
  interface GameEvents {
    /** An ability rank went up (Códice / Academia). */
    'codex:rankup': { abilityId: string; rank: number };
    /** An ability was sacrificed (Libro de la Realidad). */
    'codex:forgotten': { abilityId: string };
    /** The ability loadout (1–4/5, Q, E, R) changed. */
    'loadout:change': { slots: (string | null)[]; relics: (string | null)[]; ultimate: string | null };
    /** A relic was equipped / unequipped. */
    'relics:equip': { uid: string; relicId: string; equipped: boolean };
    /** Forge upgrade. */
    'relic:upgraded': { uid: string; relicId: string; level: number };
    /** A relic left the inventory (sacrifice, fusion). */
    'relic:lost': { uid: string; relicId: string; reason: 'sacrificio' | 'fusion' | 'otro' };
    /** A racial passive was gained by corrupting a continent. */
    'progression:racial': { power: string; race: RaceId };
    /** Derived stats changed (hpMax / manaMax / armor / slots...). */
    'progression:stats': { hpMax: number; manaMax: number };
    /** A fusion was created. */
    'fusion:created': { abilityId: string; a: string; b: string };
    /** Aurora + Nocturna were fused into Eclipse at the Forja Primigenia. */
    'forge:eclipse': { uid: string };
  }
}

export function defaultProgression(): ProgressionState {
  return {
    newAbilities: [], newRelics: [], forgotten: [], hpPenalty: 1, goldDoubleUntil: -1, freeRewritesUsed: 0,
    rewrites: [], lessons: {}, fusionsMade: 0, interestLuna: -1,
  };
}

registerModule('progression', (_run: RunState) => defaultProgression());

/** The slice for the current run (created on the fly for old saves). */
export function PS(): ProgressionState {
  const mods = G.run.modules as { progression?: ProgressionState };
  if (!mods.progression) mods.progression = defaultProgression();
  const s = mods.progression;
  // forward-compat: fill missing keys from defaults
  const d = defaultProgression() as unknown as Record<string, unknown>;
  const sr = s as unknown as Record<string, unknown>;
  for (const k of Object.keys(d)) if (sr[k] === undefined) sr[k] = d[k];
  return s;
}

export const hasRun = (): boolean => !!(G.run as RunState | null);
