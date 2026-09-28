/**
 * Battle setups launched by the world (map encounters, sieges, ruins) and their consequences.
 * Every launch wraps `onResult` to merge the army, respawn Elias at a sanctuary if he ran out of Retorno,
 * and then run the caller's specific handler.
 */
import type { BattleBiome, BattleKind, BattleResult, BattleSetup, CaptainSpec, EnemyGroup } from '../../battle/api';
import type { ContinentId, FactionId, LocationDef } from '../../data/types';
import { LOCATIONS, CONTINENTS } from '../../data/world';
import { NPCS } from '../../data/npcs';
import { engine } from '../../core/engine';
import { G, res } from '../../core/state';
import { saveRun } from '../../core/save';
import { addNews } from '../../core/news';
import { captainsFor } from '../society/api';
import { applyArmyResult, composeForce, locationRaces, strongestUnit } from './forces';
import { continentAt } from './geo';
import { W, type PartyState } from './state';
import { skyTime } from './time';

export const BIOME: Record<ContinentId, BattleBiome> = {
  valdoria: 'llanura', sylvaria: 'bosque', kharaz: 'montana', morvenna: 'pantano', islas: 'tropical', concordia: 'concordia',
};

export function battleWeather(c: ContinentId): BattleSetup['weather'] {
  const wx = W().weather;
  if (wx.storm > 0.6 && (c === 'islas' || c === 'sylvaria')) return 'storm';
  if (c === 'sylvaria' && wx.rain > 0.45) return 'rain';
  if (c === 'kharaz' && wx.ash > 0.4) return 'ash';
  if (c === 'morvenna' && wx.fog > 0.35) return 'fog';
  return 'clear';
}

function safeCaptains(opts: { location?: string; faction?: FactionId; count: number; strength?: number }): CaptainSpec[] {
  try { return captainsFor(opts) ?? []; } catch (err) { console.warn('[world] captainsFor failed', err); return []; }
}

/** Nearest sanctuary to a point (respawn). */
export function nearestSanctuary(x: number, z: number): string {
  const list = G.run.player.sanctuaries.filter((s) => LOCATIONS[s]);
  if (!list.length) return 'crater';
  return list.slice().sort((a, b) => {
    const pa = LOCATIONS[a].pos, pb = LOCATIONS[b].pos;
    return Math.hypot(pa.x - x, pa.z - z) - Math.hypot(pb.x - x, pb.z - z);
  })[0];
}

export function respawnAtSanctuary(): string {
  const p = G.run.player;
  const s = nearestSanctuary(p.pos.x, p.pos.z);
  const pos = LOCATIONS[s]?.pos ?? { x: 0, z: 0 };
  p.pos = { x: pos.x + 2, z: pos.z + 1.5 };
  p.location = null;
  res.add('hp', p.hpMax);
  res.add('alert', 4);
  W().respawn = true;
  return s;
}

export interface LaunchOpts {
  onResult?: (r: BattleResult, setup: BattleSetup) => void;
  /** Scene to return to after a victory (defeats that kill Elias always return to the map). */
  returnTo?: { scene: string; params?: unknown };
}

export function launchBattle(setup: BattleSetup, opts: LaunchOpts = {}): void {
  const wrapped: BattleSetup = {
    timeOfDay: skyTime(),
    ...setup,
    returnTo: opts.returnTo ?? setup.returnTo ?? { scene: 'overworld', params: { afterBattle: true } },
  };
  wrapped.onResult = (r: BattleResult) => {
    try {
      applyArmyResult(r);
      if (r.playerDied) {
        const s = respawnAtSanctuary();
        wrapped.returnTo = { scene: 'overworld', params: { respawn: s } };
      }
      opts.onResult?.(r, wrapped);
    } catch (err) { console.error('[world] battle result handler failed', err); }
    try { saveRun(true); } catch { /* ignore */ }
  };
  W().lastEncounter = G.run.luna;
  saveRun(true);
  void engine.goto('battle', wrapped, { fade: 0.6 });
}

// ───────────────────────── map parties ─────────────────────────

function npcCaptain(p: PartyState): CaptainSpec | null {
  if (!p.npcId) return null;
  const def = NPCS[p.npcId];
  const gen = G.run.npcs[p.npcId]?.generated;
  const unit = def?.combat?.unitId ?? strongestUnit(p.home, [p.race])?.id;
  if (!unit) return null;
  return {
    npcId: p.npcId, unitId: unit, name: p.leader ?? def?.name ?? gen?.name ?? p.name,
    title: gen?.titleText ?? def?.title, abilities: def?.combat?.abilities, hpMult: (def?.combat?.hpMult ?? 1.6) + (gen?.level ?? 0) * 0.2,
    dmgMult: 1.2 + (gen?.level ?? 0) * 0.1,
  };
}

export function aurelBoss(): CaptainSpec {
  const def = NPCS.aurel;
  return {
    npcId: 'aurel', unitId: def?.combat?.unitId ?? strongestUnit('concordia', ['humano', 'caballero'])?.id ?? 'aurel',
    name: 'Aurel', title: 'Portador del Alba', special: 'aurel',
    abilities: def?.combat?.abilities ?? ['dominar_mente', 'velo', 'fuerza_titanica', 'retorno', 'el_alba'],
    hpMult: (def?.combat?.hpMult ?? 6) * (1 + G.run.player.titleIndex * 0.25), dmgMult: 1.5,
    taunt: G.run.cycle >= 3 ? 'Tengo la sensación de que ya hemos hecho esto.' : 'Nadie tiene que salir herido.',
  };
}

export function partyBattle(p: PartyState, ambush: boolean): BattleSetup {
  const c = p.home ?? continentAt(p.x, p.z);
  const groups: EnemyGroup[] = p.units ?? composeForce({ continent: c, races: [p.race], strength: p.strength, seed: p.seed });
  let captains: CaptainSpec[] = [];
  let boss: CaptainSpec | undefined;
  let kind: BattleKind = ambush ? 'emboscada' : 'escaramuza';
  if (p.kind === 'aurel') { boss = aurelBoss(); kind = 'duelo'; }
  else {
    const nc = npcCaptain(p);
    if (nc) captains.push(nc);
    const extra = p.kind === 'caravana' || p.kind === 'refugiados' ? 0 : 1 + Math.floor(p.strength / 60);
    if (extra > 0) captains.push(...safeCaptains({ faction: p.faction, count: extra, strength: p.strength }));
    captains = captains.slice(0, 3);
  }
  const title = p.kind === 'aurel' ? 'Aurel, Portador del Alba' : ambush ? `Emboscada: ${p.name}` : p.name;
  return {
    kind, biome: BIOME[continentAt(p.x, p.z)] ?? 'llanura', continent: c, weather: battleWeather(c), title,
    player: { present: true, army: G.run.player.army },
    enemy: { faction: p.faction, groups, captains, boss },
    rewards: { gold: Math.round((p.gold ?? 0) + p.strength * 2.5), essence: Math.round(4 + p.strength / 5), relicChance: p.kind === 'rival' ? 0.3 : 0.06 },
    allowRetreat: true,
  };
}

// ───────────────────────── locations ─────────────────────────

function locBiome(def: LocationDef): BattleBiome {
  if (def.kind === 'ruina') return 'ruina';
  if (def.kind === 'arena') return 'arena';
  if (def.continent === 'concordia') return 'concordia';
  return BIOME[def.continent];
}

export function siegeBattle(locId: string): BattleSetup {
  const def = LOCATIONS[locId];
  const st = G.run.locations[locId];
  const strength = Math.max(6, st?.garrison ?? def.garrison) * warTax();
  const races = locationRaces(locId);
  const faction = (st?.control ?? def.continent) as FactionId;
  const walls = ['capital', 'fortaleza', 'ciudad', 'concilio', 'casino'].includes(def.kind);
  const captains = safeCaptains({ location: locId, faction, count: 1 + Math.floor(strength / 45), strength });
  return {
    kind: 'asedio', biome: locBiome(def), locationId: locId, continent: def.continent, weather: battleWeather(def.continent),
    title: walls ? `Asedio de ${def.name}` : `Ataque a ${def.name}`,
    player: { present: true, army: G.run.player.army },
    enemy: { faction, groups: composeForce({ continent: def.continent, races, strength, seed: `${G.run.seed}:siege:${locId}` }), captains: captains.slice(0, 4), walls },
    rewards: { gold: Math.round(strength * 4 + (st?.prosperity ?? 40) * 3), essence: Math.round(strength / 3) },
    allowRetreat: true,
  };
}

export function ruinBattle(locId: string): BattleSetup {
  const def = LOCATIONS[locId];
  const st = G.run.locations[locId];
  const strength = Math.max(10, st?.garrison ?? def.garrison) * warTax();
  const races = def.kind === 'ruina' ? [] : locationRaces(locId);
  const guardian = strongestUnit(def.continent, races.length ? races : undefined);
  const boss: CaptainSpec | undefined = guardian ? {
    unitId: guardian.id, name: `Guardián de ${def.name}`, title: 'Lo que custodia', hpMult: 4 + strength / 40, dmgMult: 1.4,
    taunt: 'Nadie sale con lo que entra a buscar.',
  } : undefined;
  return {
    kind: 'ruina', biome: 'ruina', locationId: locId, continent: def.continent, weather: def.continent === 'morvenna' ? 'fog' : 'clear',
    timeOfDay: 0.9,
    title: def.name,
    player: { present: true, army: G.run.player.army },
    enemy: { faction: def.continent === 'concordia' ? 'concilio' : def.continent, groups: composeForce({ continent: def.continent, races: races.length ? races : undefined, strength, seed: `${G.run.seed}:ruin:${locId}` }), boss },
    rewards: { gold: Math.round(strength * 3), essence: Math.round(10 + strength / 2) },
    allowRetreat: true,
  };
}

/** Called after a siege victory: control, garrison, deeds happen in the location module; this is the shared part. */
export function conquestNews(locId: string): void {
  const def = LOCATIONS[locId];
  if (!def) return;
  const cont = CONTINENTS[def.continent]?.name ?? '';
  addNews(`${def.name} cayó ante ${G.run.player.name}. En ${cont} ya no se habla de otra cosa.`, 'guerra', true);
  W().conquests[locId] = G.run.luna;
}

/** Concilio resolution "Impuesto de Guerra": garrisons are 20% stronger while it lasts. */
function warTax(): number {
  return Number(G.run.flags.war_tax_until ?? -1) > G.run.luna ? 1.2 : 1;
}
