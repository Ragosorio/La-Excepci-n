/**
 * ABILITIES — every power in the world (GDD §4.3). Canonical exports: ABILITIES, HERO_KIT, BASIC.
 * Content is split by theme (abilities_kit / _races / _jobs / _unique / _fusion); this file merges them and
 * back-fills `source` (where to find each power) from RACES, UNITS, NPCS and RELICS so the Códice can hint it.
 *
 * ── Executor conventions (battle module implements a generic executor for every AbilityKind) ──────────────
 * power: damage per target at rank I (or the heal amount for ally/self heals). Use scaleAbility() for ranks.
 * projectile: flies at `speed` up to `range`; `radius` > 0 → splash on impact; `count` > 1 → fan of projectiles.
 * aoe: target 'ground' → at a point within `range`; 'self' → centered on the caster; hits enemies in `radius`.
 *      `duration` → the area lingers and re-applies its effects to enemies inside every 0.5 s (damage once);
 *      `count` > 1 → that many impacts land at random spots in the radius over `duration`, each dealing `power` in ~1.5 m.
 * cone: in front of the caster, `range` long, `radius` wide at the end. `duration` → sustained (breath).
 * beam: instant line up to `range` (width `radius` ?? 1). `count` > 1 → chains to that many enemies (−15% per jump).
 * dash: caster travels `range` in direction (or to target), damaging along the path. `count` > 1 → repeated dashes
 *      toward nearby enemies. With target 'ground' + radius → leap and slam on landing.
 * blink: instant teleport up to `range` (with `count`/power → damage on arrival, chained like a beam).
 * buff: effects on self; `radius` → also allies around; target 'ally' → one ally in `range` (or self).
 * debuff: effects on one enemy in `range` (target 'enemy').
 * aura: persistent area around the caster for `duration`; positive statuses → allies, negative → enemies.
 * summon: spawns `count` units of SUMMONS[id] (default 'clon_sombra') for `duration`; `power` = their hit damage.
 * transform / passive / special: handled by id (metamorfosis, hambre_titanica, fuerza_titanica, retorno, traicion,
 *      afinidad_reliquias, resurreccion_menor).
 * channel: sustained for `duration`, `count` ticks, `power` split over the ticks.
 * melee: close attack within `range`. trap: placed at a ground point, arms after 0.5 s, triggers on enemies in
 *      `radius`, lasts `duration`.
 * EffectSpec: `status` applied to each target hit (positive statuses on buff/aura → caster/allies). `magnitude`:
 *      lento/prisa = speed fraction; furia = +damage fraction; escudo ≤ 1 = damage reduction, > 1 = flat absorb;
 *      regeneracion/veneno/quemadura/sangrado = HP per second; maldicion = armor reduction; marcado = extra damage taken;
 *      robo_vida = fraction of damage healed. `knockback` impulse (10 punch, 25 giant stomp, 30 golpe titánico);
 *      `pull` toward caster; `heal` on an offensive ability heals the CASTER per target hit, on a buff heals targets;
 *      `damage` extra flat damage; `chance` per target (default 1).
 */
import type { AbilityDef, RaceId, School } from './types';
import { KIT_ABILITIES } from './abilities_kit';
import { RACE_ABILITIES } from './abilities_races';
import { JOB_ABILITIES } from './abilities_jobs';
import { UNIQUE_ABILITIES } from './abilities_unique';
import { FUSION_ABILITIES } from './abilities_fusion';
import { RACES } from './races';
import { UNITS } from './units';
import { NPCS } from './npcs';
import { RELICS } from './relics';

export const ABILITIES: Record<string, AbilityDef> = {};
for (const list of [KIT_ABILITIES, RACE_ABILITIES, JOB_ABILITIES, UNIQUE_ABILITIES, FUSION_ABILITIES]) {
  for (const a of list) {
    if (ABILITIES[a.id]) console.warn(`[abilities] duplicate id ${a.id}`);
    ABILITIES[a.id] = a;
  }
}

export const HERO_KIT = ['dominar_mente', 'velo', 'fuerza_titanica', 'afinidad_reliquias', 'retorno'] as const;
export const BASIC = { attack: 'chispa_arcana', dodge: 'esquivar', titanPunch: 'golpe_titanico' } as const;

/** Libro del Aprendizaje teachings. */
export const BOOK_ABILITIES = ['paso_fantasma', 'mil_cortes', 'clones_sombra', 'metamorfosis'] as const;

/** Unit spawned by each summon ability (battle executor). */
export const SUMMONS: Record<string, string> = {
  clones_sombra: 'clon_sombra',
  legion_invisible: 'clon_sombra',
  lluvia_clones: 'clon_sombra',
  turba_enfurecida: 'miliciano',
  espiritus_ancestrales: 'espiritu_ancestral',
};

// ───────────────────────────── source back-fill ─────────────────────────────

function pushUnique<T>(arr: T[] | undefined, v: T): T[] {
  const out = arr ?? [];
  if (!out.includes(v)) out.push(v);
  return out;
}

/** Re-derives `source` hints from the other data tables. Safe to call again after data hot-reloads. */
export function backfillSources(): void {
  for (const race of Object.values(RACES)) {
    for (const id of race.abilities) {
      const a = ABILITIES[id];
      if (a) a.source.races = pushUnique(a.source.races, race.id);
    }
  }
  for (const u of Object.values(UNITS)) {
    for (const id of u.abilities) {
      const a = ABILITIES[id];
      if (a) a.source.units = pushUnique(a.source.units, u.id);
    }
  }
  for (const n of Object.values(NPCS)) {
    for (const id of n.combat?.abilities ?? []) {
      const a = ABILITIES[id];
      if (a) a.source.npcs = pushUnique(a.source.npcs, n.id);
    }
  }
  for (const r of Object.values(RELICS)) {
    if (r.grants && ABILITIES[r.grants] && !ABILITIES[r.grants].source.relic) ABILITIES[r.grants].source.relic = r.id;
  }
}
backfillSources();

// ───────────────────────────── queries & scaling ─────────────────────────────

export function ability(id: string): AbilityDef | undefined { return ABILITIES[id]; }

/** Abilities that La Excepción can copy (comprehension > 0). */
export function copyableAbilities(): AbilityDef[] { return Object.values(ABILITIES).filter((a) => a.comprehension > 0); }

export function abilitiesWithTag(tag: string): AbilityDef[] { return Object.values(ABILITIES).filter((a) => a.tags.includes(tag)); }
export function abilitiesOfSchool(s: School): AbilityDef[] { return Object.values(ABILITIES).filter((a) => a.school === s); }
export function abilitiesOfRace(r: RaceId): AbilityDef[] { return (RACES[r]?.abilities ?? []).map((id) => ABILITIES[id]).filter(Boolean); }

/** Rank scaling (Códice ranks I–V): +25% power per rank, −5% cooldown per rank, +25% durations at III, +1 count & +20% radius at V. */
export function scaleAbility(def: AbilityDef, rank: number): AbilityDef {
  const r = Math.max(1, Math.min(5, Math.floor(rank)));
  if (r === 1) return def;
  const durMul = r >= 3 ? 1.25 : 1;
  const out: AbilityDef = {
    ...def,
    power: Math.round(def.power * (1 + 0.25 * (r - 1))),
    cooldown: Math.round(def.cooldown * (1 - 0.05 * (r - 1)) * 100) / 100,
    duration: def.duration !== undefined ? def.duration * durMul : undefined,
    radius: def.radius !== undefined && r >= 5 ? def.radius * 1.2 : def.radius,
    count: def.count !== undefined && def.count > 1 && r >= 5 ? def.count + 1 : def.count,
    effects: def.effects?.map((e) => ({ ...e, duration: e.duration !== undefined ? e.duration * durMul : undefined })),
  };
  return out;
}

/** Short Roman numeral for ranks. */
export const RANK_ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];
