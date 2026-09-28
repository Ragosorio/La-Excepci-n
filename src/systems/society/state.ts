/**
 * Society slice (`G.run.modules.society`) + defensive accessors for world state this module reads/writes.
 * Continents/locations are normally created by the world module (init priority 0); we only fill gaps so
 * every society feature works even if a save/run lacks them.
 */
import { G, emptyGoods, registerModule, type ContinentState, type LocationState, type RunState } from '../../core/state';
import { CONTINENTS, CONTINENT_IDS, LOCATIONS, LOCATION_LIST } from '../../data/world';
import type { ContinentId, CorruptionPath, FactionId, GoodId } from '../../data/types';
import { makeRng } from '../../core/rng';
import { effective } from '../progression/stats';
import { knows } from '../progression/codex';
import type { SocietyState } from './types';

declare module '../../core/state' {
  interface RunModules { society: SocietyState }
}

export const SOC_VERSION = 1;
export const PATHS: CorruptionPath[] = ['conquista', 'intriga', 'codicia', 'terror'];
export const PATH_NAMES: Record<CorruptionPath, string> = { conquista: 'Conquista', intriga: 'Intriga', codicia: 'Codicia', terror: 'Terror' };
export const PATH_COLORS: Record<CorruptionPath, string> = { conquista: '#e2455b', intriga: '#9b5cff', codicia: '#ffd166', terror: '#5a6aff' };
export const GOOD_IDS: GoodId[] = ['grano', 'madera', 'hierro', 'especias', 'seda', 'pociones', 'gemas', 'cristal'];

export function initialSociety(run: RunState): SocietyState {
  return {
    v: SOC_VERSION,
    goods: emptyGoods(0),
    goodsCost: emptyGoods(0),
    hist: {},
    events: [],
    businesses: [],
    loans: [],
    bank: { shares: 0, sharePrice: 100, history: [100], lastCollectors: -99, frozenUntil: -1, overdueSince: -1, owned: false },
    secretsOn: {},
    secretTexts: {},
    revealedRelics: [],
    sedasBought: { luna: -1, count: 0 },
    alert: { last: run.player?.alert ?? 0, selloActive: false, selloRemaining: 0, selloTotal: 3, lastHunters: -99, alliance: false, peak: 0, lastLoud: -99, bountyUntil: -1 },
    council: { next: 4, count: 0, session: null, history: [], boughtVotes: {}, delegates: {}, emptySeat: {}, lastDetected: -99, queued: [], replacements: {}, emergencyDone: false },
    nemesis: {},
    nemesisSeq: 0,
    pendingJudgement: [],
    deedLog: [],
    townsfolkSeq: 0,
    contracts: {},
    lastLuna: { luna: -1, income: 0, upkeep: 0, unpaid: 0, deserters: 0, interest: 0 },
    corruptionMarks: {},
    talked: {},
    asked: {},
    flags: {},
  };
}

export function registerSocietySlice(): void {
  registerModule('society', initialSociety);
}

/** The society slice (created/migrated on demand; never throws while a run exists). */
export function soc(): SocietyState {
  const run = G.run;
  let s = run.modules.society as SocietyState | undefined;
  if (!s) {
    s = initialSociety(run);
    run.modules.society = s;
  } else if (s.v !== SOC_VERSION) {
    const fresh = initialSociety(run) as unknown as Record<string, unknown>;
    const cur = s as unknown as Record<string, unknown>;
    for (const k of Object.keys(fresh)) if (cur[k] === undefined) cur[k] = fresh[k];
    s.v = SOC_VERSION;
  }
  return s;
}

export const luna = (): number => G.run?.luna ?? 0;

// ───────────────────────────── world accessors ─────────────────────────────

export function ensureContinent(c: ContinentId): ContinentState {
  const r = G.run;
  let s = r.continents[c];
  if (!s) {
    const def = CONTINENTS[c];
    const rng = makeRng(`${r.seed}:pathmult:${c}`);
    const pm = { conquista: 1, intriga: 1, codicia: 1, terror: 1 } as Record<CorruptionPath, number>;
    for (const p of PATHS) pm[p] = Math.round((def?.pathMult[p] ?? 1) * rng.range(0.85, 1.15) * 100) / 100;
    s = { corruption: 0, paths: { conquista: 0, intriga: 0, codicia: 0, terror: 0 }, pathMult: pm, weaknessKnown: false, corrupted: false };
    r.continents[c] = s;
  }
  s.paths ??= { conquista: 0, intriga: 0, codicia: 0, terror: 0 };
  s.pathMult ??= { ...(CONTINENTS[c]?.pathMult ?? { conquista: 1, intriga: 1, codicia: 1, terror: 1 }) };
  return s;
}

export function ensureLocation(id: string): LocationState | null {
  const r = G.run;
  const cur = r.locations[id];
  if (cur) {
    cur.stock ??= emptyGoods(0);
    cur.price ??= emptyGoods(0);
    cur.businesses ??= [];
    cur.npcsHere ??= [];
    cur.flags ??= {};
    return cur;
  }
  const def = LOCATIONS[id];
  if (!def) return null;
  const loc: LocationState = {
    id,
    control: (def.continent === 'concordia' ? 'concilio' : def.continent) as FactionId,
    fear: 8, loyalty: 60, prosperity: def.prosperity, garrison: def.garrison,
    stock: emptyGoods(0), price: emptyGoods(0), businesses: [],
    visited: false, explored: false, razed: false, relic: def.relic,
    npcsHere: [...(def.npcs ?? [])], flags: {},
  };
  r.locations[id] = loc;
  return loc;
}

/** Fill in any continents/locations the world module did not create (idempotent). */
export function ensureWorld(): void {
  for (const c of Object.keys(CONTINENTS) as ContinentId[]) ensureContinent(c);
  for (const l of LOCATION_LIST) ensureLocation(l.id);
}

export function locDef(id: string | null | undefined) { return id ? LOCATIONS[id] : undefined; }
export function continentOf(locationId: string | null | undefined): ContinentId | null {
  const d = locDef(locationId);
  return d ? d.continent : null;
}
export function locName(id: string | null | undefined): string { return locDef(id)?.name ?? 'algún lugar'; }
export function contName(c: ContinentId | null | undefined): string { return c ? CONTINENTS[c]?.name ?? c : 'el mundo'; }

const SHORT: Record<string, string> = {
  vado_trigo: 'el Vado', corona_varn: 'la Corona', callejones_ceniza: 'los Callejones', fortaleza_juramento: 'la Fortaleza',
  mausoleo_alba: 'el Mausoleo', crater: 'el Cráter', lumen: 'Lúmen', templo_alba: 'el Templo del Alba',
  claro_luciernagas: 'el Claro', aldea_colmenas: 'las Colmenas', raiz_profunda: 'Raíz Profunda', kharaz_dum: 'Kharaz-Dûm',
  forja_primigenia: 'la Forja', mina_luna: 'la Mina de la Luna', tragapiedras: 'Tragapiedras', escalon_gigantes: 'el Escalón',
  altamira: 'Altamira', pozo_luna: 'el Pozo', aquelarre: 'el Aquelarre', cienaga_trol: 'la Ciénaga', torre_invertida: 'la Torre Invertida',
  puerto_fortuna: 'Puerto Fortuna', arena_remolino: 'la Arena', cala_contrabandistas: 'la Cala', faro_sirenas: 'el Faro',
  boveda_tiburcio: 'la Bóveda', concordia: 'Concordia',
};
/** Colloquial short place name for dialogue ("el Vado"). */
export function shortPlace(id: string | null | undefined): string { return id ? SHORT[id] ?? locName(id) : 'aquel lugar'; }

export function corruptedContinents(): ContinentId[] {
  return CONTINENT_IDS.filter((c) => G.run.continents[c]?.corrupted);
}

/** Continents whose Concilio seat Elias controls (corrupted ones). */
export function seatsHeld(): ContinentId[] { return corruptedContinents(); }

// ───────────────────────────── player helpers ─────────────────────────────

export function presence(): number {
  try { return effective('presencia'); } catch { return G.run.player.stats.presencia ?? 4; }
}
/** Deeds scale with Elias's Presencia (4 = ×1). */
export function presenceFactor(): number {
  return Math.max(0.8, Math.min(2.5, 1 + (presence() - 4) * 0.06));
}

/** Velo active on the map (world module's veil timer) or flagged by any scene (velo_active / invisible). */
export function veloActive(): boolean {
  const f = G.run.flags;
  const world = (G.run.modules as unknown as Record<string, { veilT?: number } | undefined>).world;
  return !!(f.velo_active || f.velo || f.invisible) || (world?.veilT ?? 0) > 0;
}

export function knowsAbility(id: string): boolean {
  try { if (knows(id)) return true; } catch { /* stub */ }
  return !!G.run.player.codex?.[id]?.acquired || !!G.run.flags.debug_all_powers;
}

export function playerName(): string { return G.run?.player?.name ?? 'Elias Veyr'; }

/** How the world refers to Elias right now (GDD §2.2). */
export function worldEpithet(): string {
  const i = G.run?.player?.titleIndex ?? 0;
  const opts = [
    ['el mago ese', 'el muerto que camina', 'el mago que cayó en el trigal'],
    ['la cosa que no muere', 'la Excepción', 'eso que volvió'],
    ['el Hombre sin Ley', 'el que no obedece nada', 'el sin ley'],
    ['Veyr', 'el de los ojos violeta', 'Aquel'],
    ['el Referente', 'el que todo lo mide', 'Aquel'],
    ['Él', 'Él', 'Él'],
  ][Math.max(0, Math.min(5, i))];
  return opts[Math.floor(Math.random() * opts.length)];
}

export function clamp100(v: number): number { return Math.max(0, Math.min(100, v)); }
export function round1(v: number): number { return Math.round(v * 10) / 10; }
