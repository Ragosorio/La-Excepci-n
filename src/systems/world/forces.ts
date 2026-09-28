/**
 * Military helpers shared by the map (parties) and locations (sieges, ruins): force composition from the
 * content data, power estimates, and army bookkeeping after battles.
 * Guards for empty data (the content agent fills UNITS/NPCS while we run).
 */
import type { EnemyGroup, BattleResult } from '../../battle/api';
import type { ArmyUnit, ContinentId, RaceId, UnitDef } from '../../data/types';
import { UNITS, unitsForContinent } from '../../data/units';
import { LOCATIONS } from '../../data/world';
import { G } from '../../core/state';
import { Rng } from '../../core/rng';

export function unitDef(id: string): UnitDef | undefined { return UNITS[id]; }

/** Strength points per unit (≈ 1 point per basic soldier-equivalent). */
export function unitPower(u: UnitDef | undefined, stars = 0, hpPct = 1): number {
  const tier = u?.tier ?? 1;
  const base = tier === 1 ? 3 : tier === 2 ? 5.5 : 9;
  const big = u ? Math.max(1, u.scale * 0.8) : 1;
  return base * big * (1 + 0.22 * stars) * Math.max(0.25, hpPct);
}

/** Elias alone: grows with titles and copied powers. */
export function eliasPower(): number {
  const p = G.run.player;
  const copied = Object.values(p.codex ?? {}).filter((c) => c.acquired).length;
  // conservative: a new player's Elias is worth a handful of soldiers, not an army
  return 6 + p.titleIndex * 14 + copied * 1.2 + p.relics.length * 1.2;
}

export function armyPower(army: ArmyUnit[] = G.run.player.army): number {
  let s = 0;
  for (const a of army) s += unitPower(UNITS[a.unitId], a.stars, a.hpPct ?? 1);
  return s;
}

export function totalPower(): number { return armyPower() + eliasPower(); }

/** Places the battle module fortifies (walls + two archer towers). Keep in sync with siegeBattle(). */
export const WALLED_KINDS = ['capital', 'fortaleza', 'ciudad', 'concilio', 'casino'];

/**
 * Effective defender strength of a location for the odds label: the garrison itself, plus the 6 tower archers
 * and the defender's advantage when the place has walls.
 */
export function defenderPower(locKind: string, garrison: number): number {
  const g = Math.max(1, garrison);
  return WALLED_KINDS.includes(locKind) ? g * 1.25 + 6 * 3 : g;
}

/** Rough win-odds label for the UI. */
export function odds(mine: number, theirs: number): { text: string; color: string; ratio: number } {
  const r = mine / Math.max(1, theirs);
  if (r > 2.2) return { text: 'Aplastante', color: '#6fe39a', ratio: r };
  if (r > 1.35) return { text: 'Favorable', color: '#b6e36f', ratio: r };
  if (r > 0.85) return { text: 'Pareja', color: '#ffd166', ratio: r };
  if (r > 0.5) return { text: 'Arriesgada', color: '#ffb347', ratio: r };
  return { text: 'Suicida', color: '#e2455b', ratio: r };
}

/** Units that can appear for a continent / race mix. Empty when the content data is not loaded yet. */
export function unitPool(continent?: ContinentId, races?: RaceId[]): UnitDef[] {
  let pool = continent ? unitsForContinent(continent) : [];
  if (!pool.length) pool = Object.values(UNITS).filter((u) => !continent || !u.recruitAt || u.recruitAt.includes(continent));
  if (!pool.length) pool = Object.values(UNITS);
  if (races?.length) {
    const byRace = pool.filter((u) => races.includes(u.race));
    if (byRace.length) pool = byRace;
  }
  return pool.filter((u) => u.cost > 0 || u.tier > 0);
}

/**
 * Builds enemy groups worth ≈ `strength` points. Higher strength → higher tiers & veterans.
 * Returns [] when no unit data exists (battle module falls back to its own defaults).
 */
export function composeForce(opts: { continent?: ContinentId; races?: RaceId[]; strength: number; seed: string | number; maxUnits?: number }): EnemyGroup[] {
  const pool = unitPool(opts.continent, opts.races);
  if (!pool.length) return [];
  const rng = new Rng(`${opts.seed}:force`);
  const s = Math.max(4, opts.strength);
  const maxUnits = opts.maxUnits ?? 34;
  const tierW = (t: number) => (t === 1 ? 1 : t === 2 ? Math.min(1.2, s / 45) : Math.min(1, Math.max(0, (s - 50) / 80)));
  const types = Math.min(pool.length, s < 20 ? 2 : s < 60 ? 3 : 4);
  const chosen: UnitDef[] = [];
  const cand = [...pool];
  for (let i = 0; i < types && cand.length; i++) {
    const u = rng.weighted(cand, (c) => tierW(c.tier) + 0.05);
    chosen.push(u);
    cand.splice(cand.indexOf(u), 1);
  }
  const stars = s > 110 ? 2 : s > 60 ? 1 : 0;
  const groups: EnemyGroup[] = [];
  let remaining = s, count = 0;
  let guard = 0;
  while (remaining > 1.5 && count < maxUnits && guard++ < 400) {
    const u = chosen[guard % chosen.length];
    const p = unitPower(u, stars);
    if (p > remaining * 1.4 && chosen.some((c) => unitPower(c, stars) <= remaining)) continue;
    let g = groups.find((x) => x.unitId === u.id);
    if (!g) { g = { unitId: u.id, count: 0, stars }; groups.push(g); }
    g.count++;
    count++;
    remaining -= p;
  }
  return groups.filter((g) => g.count > 0);
}

export function groupsPower(groups: EnemyGroup[] | undefined): number {
  if (!groups) return 0;
  return groups.reduce((s, g) => s + unitPower(UNITS[g.unitId], g.stars ?? 0) * g.count, 0);
}

/** Strongest unit of a pool (used for ruin guardians / named captains fallbacks). */
export function strongestUnit(continent?: ContinentId, races?: RaceId[]): UnitDef | undefined {
  const pool = unitPool(continent, races);
  return pool.slice().sort((a, b) => unitPower(b) - unitPower(a))[0];
}

/** Races that live at a location (weighted list → ids sorted by weight). */
export function locationRaces(locId: string): RaceId[] {
  const def = LOCATIONS[locId];
  if (!def) return [];
  return (Object.entries(def.races) as Array<[RaceId, number]>).sort((a, b) => b[1] - a[1]).map(([r]) => r);
}

/**
 * Merge a battle result into the army idempotently: removes lost units and copies veterancy/wounds from survivors.
 * Safe even if the battle module already updated `player.army`.
 */
export function applyArmyResult(r: BattleResult): void {
  const p = G.run.player;
  const lost = new Set(r.unitsLost.map((u) => u.uid));
  const surv = new Map(r.survivors.map((u) => [u.uid, u] as const));
  p.army = p.army.filter((u) => !lost.has(u.uid)).map((u) => {
    const s = surv.get(u.uid);
    return s ? { ...u, stars: s.stars, xp: s.xp, hpPct: s.hpPct, name: s.name ?? u.name } : u;
  });
  // devotos / new units that the battle added to survivors but we don't have yet
  for (const s of r.survivors) if (!p.army.some((u) => u.uid === s.uid) && !lost.has(s.uid)) p.army.push(s);
}

/** Total army upkeep per luna. */
export function armyUpkeep(army: ArmyUnit[] = G.run.player.army): number {
  return army.reduce((s, a) => s + (UNITS[a.unitId]?.upkeep ?? 2), 0);
}
