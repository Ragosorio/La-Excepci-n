/**
 * Definition resolver for battles: UnitDef → UnitSpec (body dims, gear meshes, colors, attack style),
 * AbilityDef → AbilityRT (runtime registry with school visuals / AI classification).
 * Canonical data comes from src/data; anything missing falls back to ./testdata so battles never break.
 */
import type { AbilityDef, JobId, RaceId, School, StatusId, UnitDef, UnitRole, WeaponKind } from '../data/types';
import type { SfxName } from '../audio';
import { UNITS } from '../data/units';
import { ABILITIES } from '../data/abilities';
import { RACES } from '../data/races';
import { JOBS } from '../data/jobs';
import { SCHOOL_INFO } from '../data/schools';
import { TEST_ABILITIES, TEST_UNITS } from './testdata';
import { EXTRA_KINDS, HAIR_KINDS, HEADGEAR_KINDS, WEAPON_KINDS, type ExtraKind, type HairKind, type HeadgearKind } from './geo';
import { AS_BOW, AS_CAST, AS_GUN, AS_PUNCH, AS_SWING, AS_THROW, AS_THRUST, GOOD_STATUS, P_ORB, PROJ_BY_NAME } from './const';

// ───────────────────────────── data scanning (robust to how content files are split) ─────────────────────────────

const abilityMods = import.meta.glob('../data/abilities*.ts', { eager: true }) as Record<string, Record<string, unknown>>;
const unitMods = import.meta.glob('../data/units*.ts', { eager: true }) as Record<string, Record<string, unknown>>;

function looksAbility(o: unknown): o is AbilityDef {
  const a = o as AbilityDef;
  return !!a && typeof a === 'object' && typeof a.id === 'string' && typeof a.kind === 'string' && typeof a.school === 'string';
}
function looksUnit(o: unknown): o is UnitDef {
  const u = o as UnitDef;
  return !!u && typeof u === 'object' && typeof u.id === 'string' && typeof u.race === 'string' && typeof u.hp === 'number' && typeof u.role === 'string';
}
function scan<T>(mods: Record<string, Record<string, unknown>>, test: (o: unknown) => o is T): Record<string, T> {
  const out: Record<string, T> = {};
  const take = (v: unknown) => { if (test(v)) out[(v as unknown as { id: string }).id] ??= v; };
  for (const mod of Object.values(mods)) {
    for (const val of Object.values(mod ?? {})) {
      if (Array.isArray(val)) val.forEach(take);
      else if (val && typeof val === 'object') { if (test(val)) take(val); else Object.values(val as Record<string, unknown>).forEach(take); }
    }
  }
  return out;
}
let scannedA: Record<string, AbilityDef> | null = null;
let scannedU: Record<string, UnitDef> | null = null;
const sA = () => (scannedA ??= scan(abilityMods, looksAbility));
const sU = () => (scannedU ??= scan(unitMods, looksUnit));

export function getAbilityDef(id: string): AbilityDef | null {
  return ABILITIES[id] ?? sA()[id] ?? TEST_ABILITIES[id] ?? null;
}
export function hasUnitDef(id: string): boolean { return !!(UNITS[id] ?? sU()[id] ?? TEST_UNITS[id]); }
export function getUnitDef(id: string): UnitDef {
  const d = UNITS[id] ?? sU()[id] ?? TEST_UNITS[id];
  if (d) return d;
  return { ...TEST_UNITS.soldado, id, name: prettyId(id) };
}
/** Every known unit def (canonical first) — used by debug setups. */
export function allUnitDefs(): UnitDef[] {
  const seen = new Map<string, UnitDef>();
  for (const src of [UNITS, sU(), TEST_UNITS]) for (const u of Object.values(src)) if (!seen.has(u.id)) seen.set(u.id, u);
  return [...seen.values()];
}
export function prettyId(id: string): string { return id.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()); }

// ───────────────────────────── school visuals ─────────────────────────────

const SCHOOL_FX: Record<School, { preset: string; sfx: SfxName }> = {
  arcano: { preset: 'arcane', sfx: 'cast_arcane' }, fuego: { preset: 'fire', sfx: 'cast_fire' }, hielo: { preset: 'ice', sfx: 'cast_ice' },
  rayo: { preset: 'lightning', sfx: 'cast_lightning' }, luz: { preset: 'light', sfx: 'cast_light' }, sombra: { preset: 'shadow', sfx: 'cast_shadow' },
  mente: { preset: 'mind', sfx: 'cast_mind' }, naturaleza: { preset: 'nature', sfx: 'cast_nature' }, veneno: { preset: 'poison', sfx: 'cast_poison' },
  sangre: { preset: 'blood', sfx: 'cast_blood' }, fuerza: { preset: 'hit', sfx: 'punch_launch' }, tierra: { preset: 'earth', sfx: 'cast_earth' },
  tiempo: { preset: 'time', sfx: 'cast_time' }, suerte: { preset: 'luck', sfx: 'cast_luck' }, agua: { preset: 'ice', sfx: 'splash' },
  fisico: { preset: 'spark', sfx: 'sword_swing' },
};
export function schoolColor(s: School): string { return SCHOOL_INFO[s]?.color ?? '#c7a2ff'; }
export function schoolPreset(s: School): string { return SCHOOL_FX[s]?.preset ?? 'magic'; }

// ───────────────────────────── ability runtime registry ─────────────────────────────

export interface AbilityRT {
  idx: number;
  id: string;
  def: AbilityDef;
  name: string;
  school: School;
  color: string;
  preset: string;
  sfx: SfxName;
  copyable: boolean;
  /** Helps allies (heals / good statuses). */
  positive: boolean;
  heal: number;
  knock: number;
  statuses: StatusId[];
  /** Applies control (stun, freeze, toad, mind, charm, fear, root, sleep...). */
  control: boolean;
  range: number;
  radius: number;
}
const rts: AbilityRT[] = [];
const rtIndex = new Map<string, number>();
const CONTROL = new Set<StatusId>(['aturdido', 'congelado', 'sapo', 'mente', 'encanto', 'miedo', 'raiz', 'traicion', 'silencio', 'ceguera']);

function makeRT(id: string, def: AbilityDef): AbilityRT {
  const eff = def.effects ?? [];
  const statuses = eff.map((e) => e.status).filter((s): s is StatusId => !!s);
  const heal = eff.reduce((s, e) => s + (e.heal ?? 0), 0);
  const knock = eff.reduce((s, e) => Math.max(s, e.knockback ?? 0), 0);
  const allGood = statuses.length > 0 && statuses.every((s) => GOOD_STATUS.has(s));
  const anyBad = statuses.some((s) => !GOOD_STATUS.has(s));
  const positive = def.target === 'ally' || (!anyBad && def.power <= 0 && (allGood || heal > 0)) || ((def.kind === 'buff' || def.kind === 'aura') && !anyBad && (allGood || heal > 0));
  const fx = SCHOOL_FX[def.school] ?? SCHOOL_FX.arcano;
  const rt: AbilityRT = {
    idx: rts.length, id, def, name: def.name, school: def.school,
    color: def.color ?? schoolColor(def.school), preset: def.vfx ?? fx.preset, sfx: (def.sfx as SfxName | undefined) ?? fx.sfx,
    copyable: (def.comprehension ?? 0) > 0, positive, heal, knock, statuses,
    control: statuses.some((s) => CONTROL.has(s)),
    range: def.range ?? (def.kind === 'melee' ? 2.2 : def.kind === 'cone' ? 5 : def.target === 'self' ? 0 : 12),
    radius: def.radius ?? 0,
  };
  rts.push(rt);
  return rt;
}

export function abilityRT(id: string): AbilityRT | null {
  const hit = rtIndex.get(id);
  if (hit !== undefined) return rts[hit];
  const def = getAbilityDef(id);
  if (!def) return null;
  const rt = makeRT(id, def);
  rtIndex.set(id, rt.idx);
  return rt;
}

const scaledIndex = new Map<string, number>();
/** Runtime entry for a (rank-scaled) definition — Elias casts `effectiveAbility(id)`; same id, own index. */
export function abilityRTFor(def: AbilityDef): AbilityRT {
  const base = abilityRT(def.id);
  if (base && base.def === def) return base;
  const key = `${def.id}|${def.power}|${def.cooldown}|${def.duration ?? ''}|${def.radius ?? ''}|${def.count ?? ''}`;
  const hit = scaledIndex.get(key);
  if (hit !== undefined) return rts[hit];
  const rt = makeRT(def.id, def);
  scaledIndex.set(key, rt.idx);
  return rt;
}
export function abilityAt(i: number): AbilityRT { return rts[i]; }

// ───────────────────────────── bodies ─────────────────────────────

interface BodyP { h: number; w: number; head: number; limbs: number; belly: number }
const RACE_BODY: Record<RaceId, BodyP> = {
  humano: { h: 1, w: 1, head: 1, limbs: 1, belly: 0 },
  caballero: { h: 1.02, w: 1.15, head: 0.95, limbs: 1, belly: 0 },
  elfo: { h: 1.08, w: 0.88, head: 0.95, limbs: 1.12, belly: 0 },
  enano: { h: 0.78, w: 1.3, head: 1.12, limbs: 0.78, belly: 0.25 },
  gigante: { h: 1.05, w: 1.3, head: 0.8, limbs: 1.12, belly: 0.1 },
  ogro: { h: 0.95, w: 1.55, head: 0.92, limbs: 0.95, belly: 0.65 },
  duende: { h: 0.9, w: 1.0, head: 1.4, limbs: 0.9, belly: 0.1 },
  mago: { h: 1.02, w: 0.95, head: 1, limbs: 1, belly: 0 },
  bruja: { h: 1, w: 0.9, head: 1, limbs: 1, belly: 0 },
  trol: { h: 1.12, w: 0.88, head: 0.9, limbs: 1.35, belly: 0 },
  clerigo: { h: 1, w: 1, head: 1, limbs: 1, belly: 0.05 },
  picaro: { h: 0.98, w: 0.9, head: 1, limbs: 1.02, belly: 0 },
  sirena: { h: 1.02, w: 0.9, head: 1, limbs: 1.05, belly: 0 },
  draconido: { h: 1.08, w: 1.12, head: 0.95, limbs: 1.05, belly: 0 },
  excepcion: { h: 1.1, w: 0.9, head: 0.96, limbs: 1.08, belly: 0 },
};
const RACE_SCALE: Partial<Record<RaceId, number>> = { gigante: 2.6, ogro: 1.7, trol: 1.35, enano: 0.8, duende: 0.62, draconido: 1.15, caballero: 1.05, elfo: 1.05 };
const SKIN_FALLBACK: Record<RaceId, string[]> = {
  humano: ['#f2d3b8', '#e8bf9c', '#c98f68', '#a46a48', '#7a4b33'], caballero: ['#f2d3b8', '#e0b08a', '#b87d57'], elfo: ['#f8e6d8', '#f1dccb', '#e6d0c8'],
  enano: ['#e8b392', '#d99a7a', '#c07f5f'], gigante: ['#9a938c', '#8a8680', '#a8a095'], ogro: ['#8f9f6a', '#7f9160', '#a0a476'],
  duende: ['#86c250', '#6fae45', '#9bcf5e'], mago: ['#f2d3b8', '#e8bf9c', '#c98f68'], bruja: ['#f1dccb', '#d9e6c8', '#e8bf9c'],
  trol: ['#4fa3a0', '#3f8f9a', '#5ab0a0'], clerigo: ['#f2d3b8', '#e8bf9c', '#c98f68'], picaro: ['#f2d3b8', '#d8a882', '#a46a48'],
  sirena: ['#bfe8e0', '#a8dcd8', '#d0f0e8'], draconido: ['#a9483a', '#8a3a4a', '#3a6a5a'], excepcion: ['#f1e6e0'],
};
const HAIR_FALLBACK = ['#1c1420', '#3a2418', '#6a3a1e', '#b8702a', '#e8c46a', '#f0e6d0', '#c0392b', '#2c3e70', '#d7d7e0'];
const EXTRA_BY_RACE: Partial<Record<RaceId, ExtraKind>> = {
  elfo: 'ears_elf', duende: 'ears_goblin', sirena: 'ears_fin', trol: 'troll', ogro: 'ogre', enano: 'dwarf', gigante: 'giant', draconido: 'dragon',
};
const HAIR_BY_RACE: Partial<Record<RaceId, HairKind[]>> = {
  trol: ['crest'], ogro: [], gigante: ['short'], duende: ['short', 'spiky'], enano: ['short', 'long'], elfo: ['long', 'long', 'bun', 'short'],
  sirena: ['long', 'bun'], draconido: ['spiky'], bruja: ['long', 'bun'],
};
const JOB_FALLBACK: Partial<Record<JobId, { o: string; o2: string; head?: string; weapon?: WeaponKind; shield?: boolean; robe?: boolean }>> = {
  guerrero: { o: '#8a4a3a', o2: '#b9b3a8', head: 'casco', weapon: 'espada', shield: true },
  soldado: { o: '#5a6a8a', o2: '#b9b3a8', head: 'casco', weapon: 'lanza', shield: true },
  arquero: { o: '#3f6a3a', o2: '#8a6a3a', head: 'capucha', weapon: 'arco' },
  hechicero: { o: '#3a2a7a', o2: '#d9b36c', head: 'sombrero_alto', weapon: 'baston', robe: true },
  sacerdote: { o: '#f0ead8', o2: '#d9b36c', head: 'mitra', weapon: 'maza', robe: true },
  campesino: { o: '#8a7a5a', o2: '#5a6a3a', weapon: 'hoz' },
  alquimista: { o: '#4a5a3a', o2: '#b08a3a', weapon: 'libro', robe: true },
  cazador: { o: '#5a4a2a', o2: '#3a5a2a', head: 'capucha', weapon: 'arco' },
  ladron: { o: '#2a2a3a', o2: '#5a4a3a', head: 'capucha', weapon: 'daga' },
  pirata: { o: '#6a2a2a', o2: '#e8d8a8', head: 'tricornio', weapon: 'espada' },
  bardo: { o: '#b04a3a', o2: '#e8c46a', head: 'copa', weapon: 'ninguna' },
};

export interface Dims {
  legLen: number; thigh: number; shin: number; torsoLen: number; headR: number; shoulderW: number; hipW: number;
  upperArm: number; foreArm: number; torsoW: number; torsoD: number; legW: number; armW: number; belly: number; w: number;
}

export interface UnitSpec {
  idx: number;
  id: string;
  def: UnitDef;
  name: string;
  race: RaceId;
  job: JobId;
  role: UnitRole;
  scale: number;
  dims: Dims;
  /** Collision radius and height (meters, already × scale). */
  radius: number;
  height: number;
  weapon: WeaponKind;
  weaponMesh: number;        // index in WEAPON_KINDS or -1
  style: number;             // AS_*
  shield: boolean;
  robe: boolean;
  headgearMesh: number;      // index in HEADGEAR_KINDS or -1
  hairOptions: number[];     // indices in HAIR_KINDS (empty = bald)
  extraMesh: number;         // index in EXTRA_KINDS or -1
  ranged: boolean;
  projectile: number;        // P_* or -1
  healer: boolean;
  abilities: number[];       // AbilityRT indices
  morale: number;
  knock: number;             // basic attack knockback impulse
  cleave: boolean;
  skins: string[];
  hairs: string[];
  outfit: string;
  outfit2: string;
  pants: string;
  boots: string;
}

const specs: UnitSpec[] = [];
const specIndex = new Map<string, number>();

function dimsOf(b: BodyP): Dims {
  const legLen = 0.72 * b.h * b.limbs;
  return {
    legLen, thigh: legLen * 0.5, shin: legLen * 0.5, torsoLen: 0.52 * b.h, headR: 0.25 * b.head,
    shoulderW: 0.2 * b.w + b.belly * 0.04, hipW: 0.1 * b.w, upperArm: 0.28 * b.limbs, foreArm: 0.27 * b.limbs,
    torsoW: 0.4 * b.w + b.belly * 0.22, torsoD: 0.28 * b.w + b.belly * 0.3, legW: 0.15 * b.w, armW: 0.12 * b.w + b.belly * 0.03,
    belly: b.belly, w: b.w,
  };
}

function styleFor(weapon: WeaponKind, ranged: boolean, projectile: number): number {
  switch (weapon) {
    case 'arco': case 'ballesta': return AS_BOW;
    case 'trabuco': case 'pistola': return AS_GUN;
    case 'lanza': case 'daga': return ranged ? AS_THROW : AS_THRUST;
    case 'baston': case 'libro': return ranged ? AS_CAST : AS_SWING;
    case 'ninguna': case 'puños': return ranged ? (projectile === P_ORB ? AS_CAST : AS_THROW) : AS_PUNCH;
    default: return ranged ? (projectile === P_ORB ? AS_CAST : AS_THROW) : AS_SWING;
  }
}

export function specFor(unitId: string): UnitSpec {
  const hit = specIndex.get(unitId);
  if (hit !== undefined) return specs[hit];
  const def = getUnitDef(unitId);
  const race: RaceId = def.race in RACE_BODY ? def.race : 'humano';
  const body = RACE_BODY[race];
  const raceDef = RACES[race];
  const job = JOBS[def.job]?.outfit;
  const jf = JOB_FALLBACK[def.job];
  const scale = def.scale > 0 ? def.scale : RACE_SCALE[race] ?? 1;
  const dims = dimsOf(body);
  const projectile = def.projectile ? PROJ_BY_NAME[def.projectile] ?? -1 : -1;
  const ranged = projectile >= 0 || def.attackRange > 4;
  let weapon: WeaponKind = def.weapon ?? job?.weapon ?? jf?.weapon ?? 'ninguna';
  if ((race === 'gigante' || race === 'ogro') && (weapon === 'espada' || weapon === 'lanza')) weapon = race === 'ogro' ? 'garrote' : 'martillo';
  const wKind = weapon === 'pistola' ? 'trabuco' : weapon;
  const weaponMesh = (WEAPON_KINDS as readonly string[]).indexOf(wKind);
  let headgear = (job?.headgear ?? jf?.head ?? 'ninguno') as string;
  if (race === 'bruja' && headgear === 'ninguno') headgear = 'sombrero_pico';
  if (race === 'mago' && headgear === 'ninguno') headgear = 'sombrero_alto';
  if (race === 'caballero' && headgear === 'ninguno') headgear = 'casco';
  if ((race === 'gigante' || race === 'ogro') && headgear === 'casco') headgear = 'ninguno';
  const headgearMesh = (HEADGEAR_KINDS as readonly string[]).indexOf(headgear as HeadgearKind);
  const hairList = HAIR_BY_RACE[race] ?? ['short', 'spiky', 'long', 'short', 'bun'];
  const extra = EXTRA_BY_RACE[race] ?? 'ears_round';
  const abilities: number[] = [];
  for (const id of def.abilities ?? []) { const rt = abilityRT(id); if (rt && rt.def.kind !== 'passive') abilities.push(rt.idx); }
  const heavy = def.role === 'monstruo' || def.role === 'asedio' || scale >= 1.6;
  const spec: UnitSpec = {
    idx: specs.length, id: def.id, def, name: def.name, race, job: def.job, role: def.role, scale, dims,
    radius: Math.max(0.28, 0.34 * body.w * scale + body.belly * 0.12 * scale),
    height: (dims.legLen + dims.torsoLen + dims.headR * 2) * scale,
    weapon, weaponMesh, style: styleFor(weapon, ranged, projectile),
    shield: !!(def.shield ?? job?.shield ?? jf?.shield), robe: !!(job?.robe ?? jf?.robe),
    headgearMesh, hairOptions: hairList.map((h) => (HAIR_KINDS as readonly string[]).indexOf(h)).filter((i) => i >= 0),
    extraMesh: (EXTRA_KINDS as readonly string[]).indexOf(extra),
    ranged, projectile: ranged && projectile < 0 ? P_ORB : projectile,
    healer: def.role === 'sanador',
    abilities,
    morale: def.role === 'monstruo' ? 95 : def.role === 'tanque' ? 85 : def.tier === 1 ? 62 : def.tier === 2 ? 74 : 86,
    knock: heavy ? 5 + def.damage * 0.45 : def.role === 'tanque' ? 3.5 : 2.2,
    cleave: heavy,
    skins: raceDef?.skin?.length ? raceDef.skin : SKIN_FALLBACK[race],
    hairs: raceDef?.hair?.length ? raceDef.hair : HAIR_FALLBACK,
    outfit: job?.primary ?? jf?.o ?? '#5a4a7a',
    outfit2: job?.secondary ?? jf?.o2 ?? '#d9c9a8',
    pants: '#3a3040', boots: '#2a2024',
  };
  if (race === 'gigante' || race === 'ogro' || race === 'trol') spec.boots = spec.skins[0];
  specs.push(spec);
  specIndex.set(unitId, spec.idx);
  return spec;
}
export function specAt(i: number): UnitSpec { return specs[i]; }

/** A spec clone for a body that does not exist in data (Elias, transformed forms). */
export function customSpec(key: string, base: Partial<UnitDef> & { race: RaceId }): UnitSpec {
  const hit = specIndex.get(key);
  if (hit !== undefined) return specs[hit];
  const def: UnitDef = { ...TEST_UNITS.soldado, id: key, name: key, abilities: [], ...base } as UnitDef;
  const tmpId = '__custom_' + key;
  (TEST_UNITS as Record<string, UnitDef>)[tmpId] = def;
  const s = specFor(tmpId);
  specIndex.set(key, s.idx);
  return s;
}

/** Body scale the character rig applies per race (mirrors RACE_BODY.scale in characters/rig.ts). */
const RIG_RACE_SCALE: Partial<Record<RaceId, number>> = {
  caballero: 1.05, elfo: 1.05, enano: 0.8, gigante: 2.6, ogro: 1.7, duende: 0.62, bruja: 0.97, trol: 1.35, picaro: 0.97, draconido: 1.15, excepcion: 1.05,
};
export function rigRaceScale(r: RaceId): number { return RIG_RACE_SCALE[r] ?? 1; }
