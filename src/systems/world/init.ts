/**
 * Fresh-run world generation (priority 0): continents (per-cycle weakness multipliers), locations (control, fear,
 * loyalty, garrison, placeholder market), relic placement (fixed + random minor relics), player start at the Cráter.
 * Society refines economy (20) and politics (30) afterwards.
 */
import type { ContinentId, CorruptionPath, FactionId, GoodId, LocationDef } from '../../data/types';
import { CONTINENTS, LOCATION_LIST, LOCATIONS } from '../../data/world';
import { GOODS } from '../../data/goods';
import { RELICS, placeableRelics } from '../../data/relics';
import { emptyGoods, onRunInit, type LocationState, type RunState } from '../../core/state';
import { Rng } from '../../core/rng';
import { randomRelic } from '../progression/relics';
import { CONT_ORDER } from './geo';
import { W } from './state';
import { seedInitialParties } from './parties';

export const PATHS: CorruptionPath[] = ['conquista', 'intriga', 'codicia', 'terror'];

const FALLBACK_BASE: Record<GoodId, number> = { grano: 8, madera: 10, hierro: 16, especias: 22, seda: 26, pociones: 20, gemas: 40, cristal: 34 };
export function goodBase(g: GoodId): number { return GOODS[g]?.base ?? FALLBACK_BASE[g]; }
export const GOOD_TARGET = 40;

/** Victoria-3-style price factor (±75% of base). */
export function priceFactor(stock: number, target = GOOD_TARGET): number {
  const r = Math.max(1e-3, stock / target);
  return 1 + 0.75 * Math.max(-1, Math.min(1, (1 - r) / Math.min(1, r)));
}

export function initialControl(def: LocationDef): FactionId {
  if (def.id === 'crater') return 'excepcion';
  if (def.continent === 'concordia') return 'concilio';
  return def.continent;
}

function initLocation(def: LocationDef, rng: Rng): LocationState {
  const stock = emptyGoods(0);
  const price = emptyGoods(0);
  for (const g of Object.keys(stock) as GoodId[]) {
    const s = def.produces?.includes(g) ? rng.int(62, 92) : def.consumes?.includes(g) ? rng.int(8, 20) : rng.int(26, 44);
    stock[g] = def.kind === 'ruina' || def.id === 'crater' ? 0 : s;
    price[g] = Math.round(goodBase(g) * priceFactor(stock[g]) * 10) / 10;
  }
  return {
    id: def.id,
    control: initialControl(def),
    fear: def.id === 'crater' ? 0 : 10,
    loyalty: def.id === 'crater' ? 0 : 60,
    prosperity: def.prosperity,
    garrison: def.garrison,
    stock, price,
    businesses: [],
    visited: def.id === 'crater',
    explored: false,
    razed: false,
    relic: def.relic,
    npcsHere: [...(def.npcs ?? [])],
    flags: {},
  };
}

function placeRelics(run: RunState, rng: Rng): void {
  const fixed = new Set(LOCATION_LIST.map((l) => l.relic).filter(Boolean) as string[]);
  const used = new Set<string>(fixed);
  const ruinsFirst = LOCATION_LIST.filter((l) => !l.relic && (l.kind === 'ruina' || l.services.includes('ruina')));
  const others = rng.shuffle(LOCATION_LIST.filter((l) => !l.relic && !ruinsFirst.includes(l)
    && l.id !== 'crater' && l.continent !== 'concordia' && l.kind !== 'capital'));
  const spots = [...ruinsFirst, ...others].slice(0, 8);
  for (const l of spots) {
    let id: string | null = null;
    for (let attempt = 0; attempt < 6 && !id; attempt++) {
      let cand: string | null = null;
      try { cand = randomRelic(l.kind === 'ruina' ? 1 : 0, `${run.seed}:${l.id}:${attempt}`); } catch { cand = null; }
      if (!cand || used.has(cand)) continue;
      const def = RELICS[cand];
      if (def && (def.major || def.location || (def.minCycle ?? 1) > run.cycle)) continue;
      id = cand;
    }
    if (!id) {
      // fallback: rarity-weighted pick from the placeable pool
      const RW: Record<string, number> = { comun: 5, pococomun: 4, rara: 3, epica: 1.5, legendaria: 0.6, mitica: 0.1 };
      const pool = placeableRelics(run.cycle).filter((r) => !used.has(r.id) && !r.secret);
      if (pool.length) id = rng.weighted(pool, (r) => RW[r.rarity] ?? 1).id;
    }
    if (id) { run.locations[l.id].relic = id; used.add(id); }
  }
  // La Pluma del Narrador (secret, cycle 2+): hidden in a random ruin if the content defines it without a fixed spot.
  const pluma = RELICS.pluma_narrador;
  if (pluma && !pluma.location && run.cycle >= (pluma.minCycle ?? 2) && !used.has('pluma_narrador')) {
    const ruins = LOCATION_LIST.filter((l) => l.kind === 'ruina' && !run.locations[l.id].relic);
    const spot = ruins.length ? rng.pick(ruins) : null;
    if (spot) run.locations[spot.id].relic = 'pluma_narrador';
  }
}

export function initWorld(run: RunState): void {
  const rng = new Rng(`${run.seed}:world`);
  for (const c of CONT_ORDER) {
    const def = CONTINENTS[c];
    const pm = {} as Record<CorruptionPath, number>;
    for (const p of PATHS) pm[p] = Math.round(def.pathMult[p] * rng.range(0.8, 1.25) * 100) / 100;
    run.continents[c as ContinentId] = {
      corruption: 0,
      paths: { conquista: 0, intriga: 0, codicia: 0, terror: 0 },
      pathMult: pm,
      weaknessKnown: false,
      corrupted: false,
    };
  }
  for (const def of LOCATION_LIST) run.locations[def.id] = initLocation(def, rng);
  placeRelics(run, rng);

  const crater = LOCATIONS.crater;
  run.player.pos = { x: crater.pos.x + 2.2, z: crater.pos.z + 1.6 };
  run.player.location = null;
  if (!run.player.sanctuaries.includes('crater')) run.player.sanctuaries.push('crater');

  const w = W();
  w.speed = 1; w.paused = false;
  run.timeScale = 1;
  seedInitialParties(run, rng);
  // the world starts talking before Elias does
  const opening = [
    { text: 'En Concordia todavía celebran a Aurel. Dicen que anoche mandó a volar a un mago loco hasta el otro lado del mar.', kind: 'rumor' as const },
    { text: 'Los campesinos del Vado juran que algo cayó del cielo cerca de sus trigales. La tierra sigue tibia.', kind: 'rumor' as const },
    { text: 'La Banca de las Mil Suertes anuncia que el bote de las tragamonedas supera los diez mil. «Qué chilero», dicen en el puerto.', kind: 'casino' as const },
  ];
  for (const n of opening) run.news.push({ luna: run.luna, text: n.text, kind: n.kind });
}

onRunInit('world', 0, initWorld);
