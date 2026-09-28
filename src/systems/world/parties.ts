/**
 * The living world: parties that move on the map (caravans, patrols, armies, Concilio hunters, nemeses,
 * rival relic hunters, refugees, bandits, Aurel). Pure simulation — the overworld scene renders them and
 * opens encounters when `updateParties` reports a contact.
 *
 * Public spawners (other modules may call them): spawnCaravan, spawnPatrol, spawnHunters, spawnNemesis,
 * spawnRival, spawnRefugees, spawnArmy, spawnAurel, spawnBandits, spawnParty.
 */
import type { ContinentId, FactionId, GoodId, RaceId } from '../../data/types';
import { CONTINENTS, LOCATION_LIST, LOCATIONS } from '../../data/world';
import { NPCS, HUNTER_NPCS } from '../../data/npcs';
import { UNITS, HUNTER_UNITS } from '../../data/units';
import { GOODS } from '../../data/goods';
import { RELICS } from '../../data/relics';
import { randomName } from '../../data/names';
import { bus } from '../../core/events';
import { G, type RunState } from '../../core/state';
import { Rng, rng as cosmetic } from '../../core/rng';
import { addNews } from '../../core/news';
import { failQuest, getQuest } from '../../core/quests';
import { repValue, shipGoods, bestCaravanRoute } from '../society/api';
import { CONT_ORDER, MAP_MAX, MAP_MIN, isWater } from './geo';
import { W, factionColor, factionName, type PartyKind, type PartyState } from './state';
import { locationRaces, totalPower } from './forces';
import { isNight } from './time';

declare module '../../core/events' {
  interface GameEvents {
    /** world: a party says something (speech bubble on the map). */
    'world:bark': { partyId: string; text: string };
    /** world: party list changed. */
    'world:party': { id: string; action: 'spawn' | 'remove' };
  }
}

export const PARTY_SPEED: Record<PartyKind, number> = {
  caravana: 2.3, patrulla: 3.3, ejercito: 2.5, cazadores: 4.7, nemesis: 4.4, rival: 3.9, refugiados: 1.9, aurel: 4.9, bandidos: 3.4, alianza: 3.0, cobradores: 4.3,
};
export const PARTY_SIGHT: Record<PartyKind, number> = {
  caravana: 12, patrulla: 15, ejercito: 17, cazadores: 24, nemesis: 22, rival: 13, refugiados: 10, aurel: 30, bandidos: 10, alianza: 26, cobradores: 22,
};
const HUNTERS: PartyKind[] = ['cazadores', 'nemesis', 'aurel', 'alianza', 'cobradores'];

const GOOD_NAMES: Record<GoodId, string> = { grano: 'grano', madera: 'madera', hierro: 'hierro', especias: 'especias', seda: 'seda', pociones: 'pociones', gemas: 'gemas', cristal: 'maná cristalizado' };
export function goodName(g: GoodId): string { return GOODS[g]?.name?.toLowerCase() ?? GOOD_NAMES[g]; }

// ───────────────────────── creation ─────────────────────────

export interface PartyInit {
  kind: PartyKind; x: number; z: number; faction: FactionId; name?: string; strength?: number; size?: number;
  race?: RaceId; home?: ContinentId; from?: string; to?: string; tx?: number; tz?: number; hostile?: boolean;
  goods?: Partial<Record<GoodId, number>>; gold?: number; npcId?: string; leader?: string; targetLoc?: string;
  expires?: number; state?: PartyState['state']; relic?: string;
}

export function spawnParty(init: PartyInit): PartyState {
  const w = W();
  const seed = (Math.random() * 1e9) | 0;
  const strength = Math.round(init.strength ?? 12);
  const p: PartyState = {
    id: `p${w.nextId++}`,
    kind: init.kind,
    name: init.name ?? factionName(init.faction),
    faction: init.faction,
    color: factionColor(init.faction),
    race: init.race ?? 'humano',
    x: init.x, z: init.z,
    tx: init.tx ?? init.x, tz: init.tz ?? init.z,
    from: init.from, to: init.to, home: init.home,
    speed: PARTY_SPEED[init.kind] * (0.92 + Math.random() * 0.16),
    strength,
    size: init.size ?? Math.max(1, Math.min(6, Math.round(1 + strength / 14))),
    hostile: init.hostile ?? HUNTERS.includes(init.kind),
    sight: PARTY_SIGHT[init.kind],
    state: init.state ?? 'travel',
    wait: 0,
    goods: init.goods, gold: init.gold, npcId: init.npcId, leader: init.leader, targetLoc: init.targetLoc,
    expires: init.expires, relic: init.relic,
    cooldown: 3,
    seed, lost: 0, retarget: 0,
  };
  w.parties.push(p);
  bus.emit('world:party', { id: p.id, action: 'spawn' });
  return p;
}

export function getParty(id: string | null | undefined): PartyState | undefined {
  if (!id || !G.run) return undefined;
  return W().parties.find((p) => p.id === id);
}

export function removeParty(id: string): void {
  const w = W();
  const i = w.parties.findIndex((p) => p.id === id);
  if (i < 0) return;
  const [p] = w.parties.splice(i, 1);
  if (p.contract) {
    const q = getQuest(p.contract);
    if (q && !q.done && !q.failed) failQuest(p.contract);
  }
  bus.emit('world:party', { id, action: 'remove' });
}

const count = (k: PartyKind) => W().parties.filter((p) => p.kind === k).length;
const locPos = (id: string) => LOCATIONS[id]?.pos ?? { x: 0, z: 0 };
const faction = (c: ContinentId): FactionId => (c === 'concordia' ? 'concilio' : c);
function capitalOf(c: ContinentId): string {
  return LOCATION_LIST.find((l) => l.continent === c && (l.kind === 'capital' || l.kind === 'concilio'))?.id
    ?? LOCATION_LIST.find((l) => l.continent === c)?.id ?? 'concordia';
}
function mainRace(locId: string, fallback: RaceId = 'humano'): RaceId { return locationRaces(locId)[0] ?? fallback; }
function jitter(v: number, r: number): number { return v + (Math.random() - 0.5) * 2 * r; }

export function spawnCaravan(r: Rng = cosmetic, fromId?: string): PartyState | null {
  const run = G.run;
  if (!fromId && r.chance(0.5)) {
    let route: ReturnType<typeof bestCaravanRoute> = null;
    try { route = bestCaravanRoute(); } catch { route = null; }
    const a = route ? LOCATIONS[route.from] : undefined, b = route ? LOCATIONS[route.to] : undefined;
    if (route && a && b && !W().parties.some((p) => p.kind === 'caravana' && p.from === a.id && p.to === b.id)) {
      return spawnParty({
        kind: 'caravana', x: jitter(a.pos.x, 2), z: jitter(a.pos.z, 2), tx: b.pos.x, tz: b.pos.z, from: a.id, to: b.id,
        faction: faction(a.continent), home: a.continent, name: `Caravana de ${goodName(route.good)}`, strength: r.int(7, 15), size: 2,
        race: mainRace(a.id), goods: { [route.good]: Math.max(6, route.qty) }, gold: r.int(80, 220),
      });
    }
  }
  const markets = LOCATION_LIST.filter((l) => l.services.includes('mercado') && run.locations[l.id] && !run.locations[l.id].razed);
  const producers = markets.filter((l) => l.produces?.length);
  if (!producers.length) return null;
  const from = (fromId && LOCATIONS[fromId]) || r.pick(producers);
  const buyers = markets.filter((l) => l.id !== from.id && l.consumes?.some((g) => from.produces?.includes(g)));
  const sameCont = buyers.filter((l) => l.continent === from.continent);
  const to = (sameCont.length && r.chance(0.55) ? r.pick(sameCont) : buyers.length ? r.pick(buyers) : r.pick(markets.filter((l) => l.id !== from.id)));
  if (!to) return null;
  const goods = (from.produces ?? ['grano']).filter((g) => to.consumes?.includes(g));
  const good: GoodId = goods.length ? r.pick(goods) : (from.produces?.[0] ?? 'grano');
  const qty = r.int(12, 30);
  return spawnParty({
    kind: 'caravana', x: jitter(from.pos.x, 2), z: jitter(from.pos.z, 2), tx: to.pos.x, tz: to.pos.z,
    from: from.id, to: to.id, faction: faction(from.continent), home: from.continent,
    name: `Caravana de ${goodName(good)}`, strength: r.int(6, 14), size: 2, race: mainRace(from.id),
    goods: { [good]: qty }, gold: r.int(60, 180),
  });
}

export function spawnPatrol(c: ContinentId, r: Rng = cosmetic): PartyState {
  const cap = capitalOf(c);
  const pos = locPos(cap);
  const locs = LOCATION_LIST.filter((l) => l.continent === c && l.id !== 'crater');
  const next = r.pick(locs);
  const f = faction(c);
  return spawnParty({
    kind: 'patrulla', x: jitter(pos.x, 3), z: jitter(pos.z, 3), tx: next.pos.x, tz: next.pos.z, to: next.id,
    faction: f, home: c, name: c === 'concordia' ? 'Guardia del Concilio' : `Patrulla de ${CONTINENTS[c].name}`,
    strength: c === 'concordia' ? r.int(26, 34) : r.int(12, 24), race: mainRace(cap), hostile: false,
  });
}

/** Concilio hunters (alert ≥ 50 or `alert:hunters`). */
export function spawnHunters(n = 1, strength = 30): PartyState[] {
  const out: PartyState[] = [];
  const e = G.run.player.pos;
  for (let i = 0; i < n; i++) {
    const r = new Rng(`${G.run.seed}:hunt:${G.run.luna}:${i}:${W().nextId}`);
    // a named hero of the Concilio leads when available (memory, nemesis, copyable powers)
    const free = HUNTER_NPCS.filter((id) => NPCS[id] && G.run.npcs[id]?.alive !== false && !W().parties.some((p) => p.npcId === id));
    const heroId = free.length ? r.pick(free) : null;
    const hero = heroId ? NPCS[heroId] : null;
    const race: RaceId = hero?.race ?? r.pick<RaceId>(['humano', 'elfo', 'caballero', 'enano', 'clerigo', 'mago']);
    const leader = hero?.name ?? randomName(race, r.chance(0.5) ? 'f' : 'm', r);
    const start = locPos('concordia');
    const units = HUNTER_UNITS.filter((u) => UNITS[u]);
    const p = spawnParty({
      kind: 'cazadores', x: jitter(start.x, 3), z: jitter(start.z, 3), tx: jitter(e.x, 10), tz: jitter(e.z, 10),
      faction: 'concilio', name: hero ? `${hero.name}${hero.title ? `, ${hero.title}` : ''}` : `Cazadores de ${leader}`, leader, npcId: heroId ?? undefined,
      strength: strength * r.range(0.85, 1.15), race, state: 'roam', size: 3,
    });
    if (units.length) {
      const stars = strength > 60 ? 2 : 1;
      p.units = [{ unitId: r.pick(units), count: 2 + Math.floor(strength / 30), stars }, { unitId: r.pick(units), count: 1 + Math.floor(strength / 45), stars }];
    }
    out.push(p);
  }
  if (n > 0) addNews(`El Concilio envió cazadores de héroes tras ${G.run.player.name}.`, 'concilio', true);
  return out;
}

export function spawnAlliance(strength = 120, announced = false): PartyState {
  const start = locPos('concordia');
  const e = G.run.player.pos;
  if (!announced) addNews('La Gran Alianza se moviliza. Los cinco estandartes marchan juntos.', 'guerra', true);
  return spawnParty({
    kind: 'alianza', x: start.x, z: start.z, tx: e.x, tz: e.z, faction: 'concilio', name: 'La Gran Alianza',
    strength, size: 6, race: 'caballero', state: 'roam',
  });
}

/** A nemesis hunts Elias (society emits `nemesis:hunt`). */
export function spawnNemesis(npcId: string): PartyState | null {
  if (npcId === 'aurel') return spawnAurel();          // the story announces Aurel's hunt through nemesis:hunt
  if (W().parties.some((p) => p.npcId === npcId)) return null;
  const st = G.run.npcs[npcId];
  const def = NPCS[npcId];
  const gen = st?.generated;
  const name = gen?.name ?? def?.name ?? 'Un némesis';
  const title = gen?.titleText ?? def?.title;
  const race = gen?.race ?? def?.race ?? 'humano';
  const e = G.run.player.pos;
  const ang = Math.random() * Math.PI * 2;
  let x = e.x + Math.cos(ang) * 38, z = e.z + Math.sin(ang) * 38;
  x = Math.max(MAP_MIN + 10, Math.min(MAP_MAX - 10, x)); z = Math.max(MAP_MIN + 10, Math.min(MAP_MAX - 10, z));
  const lvl = gen?.level ?? 2;
  const p = spawnParty({
    kind: 'nemesis', x, z, tx: e.x, tz: e.z, faction: (def?.faction ?? 'ceniza') as FactionId,
    name: title ? `${name}, ${title}` : name, leader: name, npcId, race, strength: nemesisStrength(lvl), size: 3, state: 'roam',
  });
  addNews(`${name} jura que encontrará a ${G.run.player.name}. Dicen que ya viene en camino.`, 'rumor', true);
  bus.emit('world:bark', { partyId: p.id, text: '¿Me recuerdas?' });
  return p;
}

/**
 * A nemesis should feel like a personal rival: scaled to Elias's current power (so it stays a threat late)
 * plus a bonus per level, instead of an absolute number that outgrows or undershoots him.
 */
function nemesisStrength(level: number): number {
  return Math.round(12 + level * 4 + totalPower() * 0.35);
}

/** La Banca's goblin debt collectors (society emits `bank:collectors`). */
export function spawnCollectors(n: number, mult: number, debt: number): PartyState[] {
  const out: PartyState[] = [];
  const e = G.run.player.pos;
  const start = locPos('puerto_fortuna');
  for (let i = 0; i < Math.max(1, Math.min(3, n)); i++) {
    const r = new Rng(`${G.run.seed}:cobro:${G.run.luna}:${i}:${W().nextId}`);
    const leader = randomName('duende', r.chance(0.4) ? 'f' : 'm', r);
    out.push(spawnParty({
      kind: 'cobradores', x: jitter(start.x, 3), z: jitter(start.z, 3), tx: jitter(e.x, 10), tz: jitter(e.z, 10),
      faction: 'banca', name: `Cobradores de ${leader}`, leader, race: 'duende', state: 'roam', size: 3,
      strength: Math.round(10 * mult + debt / 180), gold: Math.round(debt * 0.1), expires: G.run.luna + 8,
    }));
  }
  return out;
}

/** Rival relic hunter heading to a location that still holds a relic. */
export function spawnRival(r: Rng = cosmetic): PartyState | null {
  const run = G.run;
  const targets = LOCATION_LIST.filter((l) => {
    const st = run.locations[l.id];
    const rd = st?.relic ? RELICS[st.relic] : undefined;
    return st && st.relic && !st.explored && !(rd?.major) && l.id !== 'boveda_tiburcio' && !W().parties.some((p) => p.targetLoc === l.id);
  });
  if (!targets.length) return null;
  const target = r.pick(targets);
  const ports = LOCATION_LIST.filter((l) => l.services.includes('puerto') || l.kind === 'puerto');
  const from = ports.length ? r.pick(ports) : LOCATIONS.puerto_fortuna;
  const race = r.pick<RaceId>(['picaro', 'humano', 'duende', 'elfo', 'enano']);
  const leader = randomName(race, r.chance(0.5) ? 'f' : 'm', r);
  addNews(`Se dice que ${leader}, cazador de reliquias, anda tras algo en ${target.name}.`, 'rumor');
  return spawnParty({
    kind: 'rival', x: jitter(from.pos.x, 2), z: jitter(from.pos.z, 2), tx: target.pos.x, tz: target.pos.z, targetLoc: target.id,
    faction: 'ceniza', name: `${leader}, cazarreliquias`, leader, race, strength: r.int(14, 26), size: 2, hostile: false,
    expires: run.luna + 8,
  });
}

export function spawnRefugees(fromId: string, r: Rng = cosmetic): PartyState | null {
  const from = LOCATIONS[fromId];
  if (!from) return null;
  const run = G.run;
  const safe = CONT_ORDER.filter((c) => c !== from.continent)
    .sort((a, b) => (run.continents[a]?.corruption ?? 0) - (run.continents[b]?.corruption ?? 0))[0] ?? 'concordia';
  const dests = LOCATION_LIST.filter((l) => l.continent === safe && l.kind !== 'ruina' && l.id !== 'crater');
  const to = dests.length ? r.pick(dests) : LOCATIONS.concordia;
  return spawnParty({
    kind: 'refugiados', x: jitter(from.pos.x, 2), z: jitter(from.pos.z, 2), tx: to.pos.x, tz: to.pos.z, from: from.id, to: to.id,
    faction: faction(from.continent), name: `Refugiados de ${from.name}`, strength: r.int(2, 6), size: r.int(2, 4),
    race: mainRace(from.id), hostile: false, expires: run.luna + 6, gold: r.int(5, 30),
  });
}

/** Counter-attack to retake a conquered location. */
export function spawnArmy(targetLoc: string, strength?: number): PartyState | null {
  const def = LOCATIONS[targetLoc];
  if (!def || def.continent === 'concordia') return null;
  if (W().parties.some((p) => p.kind === 'ejercito' && p.targetLoc === targetLoc)) return null;
  const cap = capitalOf(def.continent);
  const start = cap === targetLoc ? LOCATION_LIST.find((l) => l.continent === def.continent && l.id !== cap && G.run.locations[l.id]?.control !== 'excepcion')?.id ?? cap : cap;
  const pos = locPos(start);
  const s = strength ?? Math.max(30, (LOCATIONS[cap]?.garrison ?? 80) * 0.8);
  addNews(`${CONTINENTS[def.continent].name} marcha para recuperar ${def.name}.`, 'guerra', true);
  return spawnParty({
    kind: 'ejercito', x: jitter(pos.x, 2), z: jitter(pos.z, 2), tx: def.pos.x, tz: def.pos.z, targetLoc,
    faction: faction(def.continent), home: def.continent, name: `Ejército de ${CONTINENTS[def.continent].name}`,
    strength: s, size: 5, race: mainRace(cap), hostile: true,
  });
}

export function spawnAurel(): PartyState | null {
  if (W().parties.some((p) => p.kind === 'aurel')) return null;
  const start = locPos('concordia');
  const e = G.run.player.pos;
  addNews('Aurel salió de Concordia. Nadie dice hacia dónde, pero todos miran en tu dirección.', 'excepcion', true);
  return spawnParty({
    kind: 'aurel', x: start.x, z: start.z, tx: e.x, tz: e.z, faction: 'concilio', name: 'Aurel, Portador del Alba',
    leader: 'Aurel', npcId: 'aurel', race: 'humano', strength: 90 + G.run.player.titleIndex * 25, size: 2, state: 'roam',
  });
}

/** Contract target: a named captain camped near a location. */
export function spawnBandits(nearLoc: string, captain: string, race: RaceId, strength: number): PartyState | null {
  const def = LOCATIONS[nearLoc];
  if (!def) return null;
  const a = Math.random() * Math.PI * 2;
  let x = def.pos.x + Math.cos(a) * 11, z = def.pos.z + Math.sin(a) * 11;
  for (let i = 0; i < 8 && isWater(x, z); i++) { const b = Math.random() * Math.PI * 2; x = def.pos.x + Math.cos(b) * 8; z = def.pos.z + Math.sin(b) * 8; }
  return spawnParty({
    kind: 'bandidos', x, z, tx: x, tz: z, faction: 'ceniza', name: `Banda de ${captain}`, leader: captain, race,
    strength, size: 3, hostile: true, state: 'wait', targetLoc: nearLoc, expires: G.run.luna + 10,
  });
}

export function seedInitialParties(run: RunState, r: Rng): void {
  for (let i = 0; i < 7; i++) spawnCaravan(r);
  for (const c of CONT_ORDER) spawnPatrol(c, r);
  // spread them along their routes so the world looks already in motion
  for (const p of W().parties) {
    const t = r.range(0.1, 0.8);
    p.x += (p.tx - p.x) * t; p.z += (p.tz - p.z) * t;
  }
  W().spawnT.rival = run.luna + 2;
}

// ───────────────────────── barks ─────────────────────────

const SPOT: Partial<Record<PartyKind, string[]>> = {
  patrulla: ['¡Alto en nombre de {f}!', '¡Es él! ¡El mago que no muere!', '¡Formen filas!'],
  cazadores: ['Por orden del Concilio: ríndete.', 'Hay precio por tu cabeza, {name}.', 'Te encontramos.'],
  nemesis: ['¿Me recuerdas?', 'Esta vez no te escapas.', '¡{name}! Te estaba buscando.'],
  aurel: ['Nadie tiene que salir herido.', 'Otra vez tú.', 'Detente, por favor.'],
  alianza: ['¡Por los Cinco Continentes!', '¡Ahí está! ¡Rodéenlo!'],
  bandidos: ['¡La bolsa o la vida!', 'Qué suerte la nuestra: un mago solito.'],
  ejercito: ['¡Por la patria!', '¡Adelante, carajo!'],
  caravana: ['¡Corran! ¡Es él!', '¡Protejan la carga!'],
  refugiados: ['Por favor... déjanos pasar.', 'Ya no queda nada allá.'],
  rival: ['Llegaste tarde, mago.', 'La reliquia es mía.'],
  cobradores: ['¡Patojo! La Banca quiere su pisto.', '¿Qué onda? Venimos a cobrar, mano.', 'Está yuca esa deuda, ¿verdad?'],
};
const IDLE: Partial<Record<PartyKind, string[]>> = {
  caravana: ['Buen camino, viajero.', 'El precio del {g} no para de subir.', '¡Arre, arre!', 'Dicen que en las Islas pagan el doble.'],
  patrulla: ['Todo en orden.', 'Ojo con los caminos de noche.', '¿Otra ronda? Ay, mis pies.'],
  refugiados: ['Seguir caminando...', 'Dicen que en Concordia hay pan.', '¿Quién nos quemó la casa?'],
  rival: ['No me mires así.', 'Mapas, mapas, más mapas.'],
  bandidos: ['Aquí se cobra peaje.', 'Shhh. Ahí viene alguien.'],
  ejercito: ['Un, dos. Un, dos.', '¿Cuánto falta?'],
};

function fill(t: string, p: PartyState): string {
  const g = (Object.keys(p.goods ?? {})[0] as GoodId | undefined) ?? 'grano';
  return t.replace('{f}', factionName(p.faction)).replace('{name}', G.run.player.name).replace('{g}', goodName(g));
}
export function spotBark(p: PartyState): string | null { const l = SPOT[p.kind]; return l ? fill(cosmetic.pick(l), p) : null; }
export function idleBark(p: PartyState): string | null { const l = IDLE[p.kind]; return l ? fill(cosmetic.pick(l), p) : null; }

// ───────────────────────── simulation ─────────────────────────

export interface EliasView { x: number; z: number; vx: number; vz: number; hidden: boolean; power: number; targetParty: string | null }

function isScary(e: EliasView): boolean {
  return e.power > 25 || G.run.player.alert >= 25 || G.run.player.titleIndex > 0;
}

export function effectiveHostile(p: PartyState): boolean {
  if (!p.hostile) return false;
  const until = W().bribes[p.faction] ?? -1;
  if (until >= G.run.luna && !HUNTERS.includes(p.kind)) return false;
  // Concilio resolution "Tregua de los Cinco": regular forces stand down (hunters don't).
  if (Number(G.run.flags.peace_until ?? -1) > G.run.luna && !HUNTERS.includes(p.kind)) return false;
  return true;
}

function nextLeg(p: PartyState): void {
  const run = G.run;
  switch (p.kind) {
    case 'caravana': {
      if (p.to) {
        const st = run.locations[p.to];
        if (p.goods) for (const [g, q] of Object.entries(p.goods) as Array<[GoodId, number]>) {
          let moved = 0;
          try { if (p.from) moved = shipGoods(p.from, p.to, g, q); } catch { moved = 0; }
          if (!moved && st) st.stock[g] = (st.stock[g] ?? 0) + Math.round(q * 0.5);
        }
        if (st) st.prosperity = Math.min(100, st.prosperity + 0.5);
      }
      if (p.contract) { removeParty(p.id); return; }         // contract caravan arrived safe → contract fails
      if (Math.random() < 0.35) { removeParty(p.id); return; }
      const from = p.to ?? p.from;
      removeParty(p.id);
      spawnCaravan(cosmetic, from);
      return;
    }
    case 'patrulla': {
      const locs = LOCATION_LIST.filter((l) => l.continent === p.home && l.id !== 'crater');
      const n = locs.length ? cosmetic.pick(locs) : null;
      if (n) { p.tx = jitter(n.pos.x, 2); p.tz = jitter(n.pos.z, 2); p.to = n.id; }
      p.state = 'wait'; p.wait = 2 + Math.random() * 4;
      return;
    }
    case 'refugiados': {
      if (p.to) { const st = run.locations[p.to]; if (st) st.flags.refugiados = Number(st.flags.refugiados ?? 0) + p.size; }
      removeParty(p.id);
      return;
    }
    case 'rival': {
      const st = p.targetLoc ? run.locations[p.targetLoc] : undefined;
      if (st && st.relic && !st.explored && !p.relic) {
        p.relic = st.relic;
        st.relic = undefined;
        const rn = RELICS[p.relic]?.name ?? 'una reliquia';
        addNews(`${p.leader ?? 'Un cazarreliquias'} saqueó ${LOCATIONS[st.id]?.name ?? st.id} y se llevó ${rn}.`, 'rumor', true);
        bus.emit('world:bark', { partyId: p.id, text: '¡Ja! ¡Es mía!' });
        const exits = LOCATION_LIST.filter((l) => l.kind === 'puerto' || l.services.includes('puerto'));
        const ex = exits.length ? cosmetic.pick(exits) : LOCATIONS.puerto_fortuna;
        p.tx = ex.pos.x; p.tz = ex.pos.z; p.targetLoc = undefined; p.expires = run.luna + 3;
      } else if (p.relic) {
        removeParty(p.id);                                   // escaped with the loot
      } else {
        p.expires = Math.min(p.expires ?? run.luna + 1, run.luna + 1);
        p.state = 'wait'; p.wait = 5;
      }
      return;
    }
    case 'ejercito': {
      const st = p.targetLoc ? run.locations[p.targetLoc] : undefined;
      if (st && st.control === 'excepcion') {
        const def = LOCATIONS[st.id];
        if (p.strength > st.garrison * 1.1) {
          st.control = p.faction;
          st.loyalty = 40; st.fear = Math.max(10, st.fear - 20);
          st.garrison = Math.round(p.strength * 0.6);
          addNews(`${p.name} recuperó ${def?.name ?? st.id}. Las campanas suenan otra vez.`, 'guerra', true);
          removeParty(p.id);
        } else {
          st.garrison = Math.max(5, st.garrison - p.strength * 0.4);
          addNews(`El asalto de ${p.name} contra ${def?.name ?? st.id} fracasó.`, 'guerra');
          removeParty(p.id);
        }
      } else removeParty(p.id);
      return;
    }
    case 'bandidos': {
      const def = p.targetLoc ? LOCATIONS[p.targetLoc] : undefined;
      if (def) { const a = Math.random() * Math.PI * 2; p.tx = def.pos.x + Math.cos(a) * 10; p.tz = def.pos.z + Math.sin(a) * 10; }
      p.state = 'wait'; p.wait = 3 + Math.random() * 5;
      return;
    }
    default:
      p.state = 'roam'; p.retarget = 0;
  }
}

function clampMap(p: PartyState): void {
  p.x = Math.max(MAP_MIN + 4, Math.min(MAP_MAX - 4, p.x));
  p.z = Math.max(MAP_MIN + 4, Math.min(MAP_MAX - 4, p.z));
}

/**
 * Steps every party by `dt` scaled world seconds. Returns the party that touched Elias (encounter) or null.
 * Contact happens with hostile parties, or with the party Elias is deliberately intercepting.
 */
export function updateParties(dt: number, e: EliasView): PartyState | null {
  if (!G.run || dt <= 0) return null;
  const w = W();
  const night = isNight();
  let contact: PartyState | null = null;
  const list = w.parties;
  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i];
    if (!p) continue;
    p.cooldown = Math.max(0, p.cooldown - dt);
    const dx = e.x - p.x, dz = e.z - p.z;
    const d = Math.hypot(dx, dz);
    const hostile = effectiveHostile(p);
    const sees = !e.hidden && d < p.sight * (night ? 0.72 : 1);

    // M&B dynamic: hostile but hopelessly outmatched bands run instead of charging
    const outmatched = hostile && !HUNTERS.includes(p.kind) && e.power > p.strength * 2.6;
    if (outmatched && sees && d < p.sight * 0.85) {
      if (p.state !== 'flee') { bus.emit('world:bark', { partyId: p.id, text: cosmetic.pick(['¡Retirada!', '¡Es demasiado fuerte!', '¡Corran, carajo!']) }); }
      p.state = 'flee';
    } else if (hostile && sees && p.cooldown <= 0) {
      if (p.state !== 'chase' && !p.spotted) {
        p.spotted = true;
        const b = spotBark(p);
        if (b) bus.emit('world:bark', { partyId: p.id, text: b });
      }
      p.state = 'chase'; p.lost = 0;
      // lead the target a little (interception)
      const lead = Math.min(1.6, d / Math.max(1, p.speed));
      p.tx = e.x + e.vx * lead; p.tz = e.z + e.vz * lead;
    } else if (p.state === 'chase') {
      p.lost += dt;
      if (p.lost > 5) { p.state = HUNTERS.includes(p.kind) ? 'roam' : 'travel'; p.spotted = false; p.retarget = 0; if (p.kind !== 'bandidos') nextLegTarget(p); }
    }

    if (!hostile && (p.kind === 'caravana' || p.kind === 'refugiados' || p.kind === 'rival') && sees && d < p.sight * 0.8 && isScary(e) && e.targetParty === p.id) {
      if (p.state !== 'flee') { const b = spotBark(p); if (b) bus.emit('world:bark', { partyId: p.id, text: b }); }
      p.state = 'flee';
    } else if (p.state === 'flee' && (d > p.sight * 1.4 || (!outmatched && e.targetParty !== p.id))) {
      p.state = 'travel';
      nextLegTarget(p);
    }

    if (p.state === 'roam') {
      p.retarget -= dt;
      if (p.retarget <= 0) {
        const spread = p.kind === 'aurel' ? 6 : 12;
        p.tx = e.x + (Math.random() - 0.5) * 2 * spread; p.tz = e.z + (Math.random() - 0.5) * 2 * spread;
        p.retarget = 6 + Math.random() * 4;
      }
    }

    if (p.state === 'wait') {
      p.wait -= dt;
      if (p.wait <= 0) p.state = p.kind === 'bandidos' || p.kind === 'patrulla' ? 'travel' : HUNTERS.includes(p.kind) ? 'roam' : 'travel';
    } else {
      let mx: number, mz: number;
      if (p.state === 'flee') { mx = -dx; mz = -dz; } else { mx = p.tx - p.x; mz = p.tz - p.z; }
      const md = Math.hypot(mx, mz);
      const water = isWater(p.x, p.z);
      const sp = p.speed * (water ? 0.82 : 1) * (p.state === 'chase' ? 1.06 : 1) * (p.state === 'flee' ? 1.12 : 1);
      const step = sp * dt;
      if (p.state !== 'flee' && md <= Math.max(0.5, step)) {
        p.x = p.tx; p.z = p.tz;
        if (p.state === 'travel') { nextLeg(p); if (list[i] !== p) continue; }   // arrived and left the map
        else if (p.state === 'roam') p.retarget = 0;
      } else if (md > 1e-4) {
        p.x += (mx / md) * step; p.z += (mz / md) * step;
      }
      clampMap(p);
    }

    const reach = 2.0 + p.size * 0.18;
    if (!contact && d < reach && p.cooldown <= 0 && (hostile || e.targetParty === p.id)) contact = p;
  }
  return contact;
}

function nextLegTarget(p: PartyState): void {
  const dest = p.to ? LOCATIONS[p.to] : p.targetLoc ? LOCATIONS[p.targetLoc] : undefined;
  if (dest) { p.tx = dest.pos.x; p.tz = dest.pos.z; }
}

/** Where a party is heading (for UI). */
export function partyGoal(p: PartyState): string {
  const to = p.to ? LOCATIONS[p.to]?.name : p.targetLoc ? LOCATIONS[p.targetLoc]?.name : null;
  if (p.state === 'chase') return 'Te persigue';
  if (p.state === 'flee') return 'Huye de ti';
  if (HUNTERS.includes(p.kind)) return 'Te busca';
  return to ? `Rumbo a ${to}` : 'Sin rumbo';
}

// ───────────────────────── per-luna spawners ─────────────────────────

export function worldLunaTick(luna: number): void {
  if (!G.run) return;
  const run = G.run;
  const w = W();
  const r = new Rng(`${run.seed}:luna:${luna}`);

  // expiry
  for (const p of [...w.parties]) if (p.expires !== undefined && p.expires <= luna && p.state !== 'chase') removeParty(p.id);

  // patrol hostility follows the political climate
  for (const p of w.parties) {
    if (p.kind !== 'patrulla') continue;
    const rep = safeRep(p.faction);
    const corr = p.home ? run.continents[p.home]?.corruption ?? 0 : 0;
    p.hostile = run.player.alert >= 50 || rep <= -40 || corr >= 60;
  }

  // caravans
  const need = Math.min(2, 8 - count('caravana'));
  for (let i = 0; i < need; i++) spawnCaravan(r);
  // patrols
  for (const c of CONT_ORDER) if (!w.parties.some((p) => p.kind === 'patrulla' && p.home === c)) spawnPatrol(c, r);

  // counter-attacks on conquered locations (two lunas after conquest)
  for (const [loc, at] of Object.entries(w.conquests)) {
    const st = run.locations[loc];
    if (!st || st.control !== 'excepcion') { delete w.conquests[loc]; continue; }
    if (luna - at >= 2 && r.chance(0.45)) { spawnArmy(loc); w.conquests[loc] = luna + 3; }
  }

  // hunters at high alert
  const societyHunting = luna - (w.spawnT.hunterEvent ?? -99) < 5;
  if (!societyHunting && run.player.alert >= 50 && count('cazadores') < 2 && luna >= (w.spawnT.hunters ?? 0)) {
    spawnHunters(1, 24 + run.player.alert * 0.35);
    w.spawnT.hunters = luna + 3;
  }

  // rival relic hunters
  if (luna >= (w.spawnT.rival ?? 0) && count('rival') < 2) {
    if (r.chance(0.55)) spawnRival(r);
    w.spawnT.rival = luna + r.int(3, 5);
  }

  // refugees fleeing corrupted / terrorized lands
  if (count('refugiados') < 4) {
    const sources = LOCATION_LIST.filter((l) => {
      const st = run.locations[l.id];
      if (!st || l.kind === 'ruina' || l.id === 'crater') return false;
      const corr = run.continents[l.continent]?.corruption ?? 0;
      return st.razed || st.fear >= 65 || corr >= 30;
    });
    if (sources.length && r.chance(0.45)) spawnRefugees(r.pick(sources).id, r);
  }

  // Aurel hunts once the story says so
  if (run.flags.aurel_hunting && luna >= w.aurelCooldown && !w.parties.some((p) => p.kind === 'aurel')) spawnAurel();

  // weather drifts
  const wx = w.weather;
  wx.rain = clamp01(wx.rain + r.range(-0.35, 0.35));
  wx.ash = clamp01(wx.ash + r.range(-0.25, 0.3));
  wx.fog = clamp01(wx.fog + r.range(-0.25, 0.25));
  wx.storm = r.chance(0.18) ? r.range(0.5, 1) : Math.max(0, wx.storm - 0.5);
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
function safeRep(f: FactionId): number { try { return repValue(f); } catch { return 0; } }

/** Hook up cross-module events once. */
export function initPartyEvents(): void {
  // society sends strength as a multiplier (≈1–4); small values are scaled against Elias's current power
  const pts = (v: number, base: number, share: number) => (v <= 10 ? Math.round(base * v + totalPower() * share * v) : v);
  bus.on('alert:hunters', ({ count: n, strength }) => { if (!G.hasRun) return; W().spawnT.hunterEvent = G.run.luna; spawnHunters(Math.max(1, n), pts(strength, 16, 0.3)); });
  bus.on('alert:alliance', ({ strength }) => { if (G.hasRun && !W().parties.some((p) => p.kind === 'alianza')) spawnAlliance(pts(strength, 60, 0.6), true); });
  bus.on('nemesis:hunt', ({ npcId }) => { if (G.hasRun) spawnNemesis(npcId); });
  bus.on('bank:collectors', ({ count: n, strength, debt }) => { if (G.hasRun) spawnCollectors(n, strength, debt); });
  bus.on('relic:revealed', ({ locationId }) => { const st = G.hasRun ? G.run.locations[locationId] : undefined; if (st) st.flags.relicKnown = true; });
  bus.on('continent:corrupted', ({ continent }) => {
    if (!G.hasRun) return;
    const locs = LOCATION_LIST.filter((l) => l.continent === continent && l.kind !== 'ruina');
    for (let i = 0; i < 2 && locs.length; i++) spawnRefugees(cosmetic.pick(locs).id);
  });
  bus.on('luna:tick', ({ luna }) => worldLunaTick(luna));
}
