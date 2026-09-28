/**
 * World module slice (`G.run.modules.world`): map parties, time speed, weather, taverns, tracked designio…
 * Everything here is JSON-serializable (saved with the run).
 */
import type { EnemyGroup } from '../../battle/api';
import type { ContinentId, FactionId, GoodId, RaceId } from '../../data/types';
import { GUILDS } from '../../data/world';
import { G, registerModule } from '../../core/state';

export type PartyKind = 'caravana' | 'patrulla' | 'ejercito' | 'cazadores' | 'nemesis' | 'rival' | 'refugiados' | 'aurel' | 'bandidos' | 'alianza' | 'cobradores';

export interface PartyState {
  id: string;
  kind: PartyKind;
  name: string;
  faction: FactionId;
  color: string;
  race: RaceId;
  x: number; z: number;
  tx: number; tz: number;
  from?: string; to?: string;
  home?: ContinentId;
  speed: number;
  strength: number;
  size: number;              // figures drawn on the map (1..6)
  hostile: boolean;
  sight: number;
  state: 'travel' | 'wait' | 'chase' | 'flee' | 'roam';
  wait: number;
  goods?: Partial<Record<GoodId, number>>;
  gold?: number;
  npcId?: string;
  leader?: string;
  relic?: string;            // relic carried (rival hunters)
  targetLoc?: string;
  expires?: number;          // luna
  cooldown: number;          // seconds before it can engage again
  contract?: string;         // quest id targeting this party
  units?: EnemyGroup[];
  seed: number;
  lost: number;              // seconds without seeing Elias while chasing
  retarget: number;          // seconds until roaming hunters re-evaluate their goal
  spotted?: boolean;         // already barked at Elias this chase
}

export interface ContractDraft {
  id: string; kind: 'main' | 'side' | 'contract'; title: string; desc: string; goal: number; target?: string;
  reward?: { gold?: number; essence?: number; influence?: number; secrets?: number; relic?: string; text?: string }; expiresLuna?: number;
}

export interface ContractOffer {
  id: string;                // becomes the quest id when taken
  kind: 'caravana' | 'arena' | 'entrega' | 'capitan' | 'encargo';
  /** Society-generated contract (self-tracked by deeds); passed to addQuest as-is when taken. */
  draft?: ContractDraft;
  title: string;
  desc: string;
  target?: string;           // location id
  partyId?: string;
  reward: { gold?: number; essence?: number; influence?: number; secrets?: number };
  taken: boolean;
  lunas: number;             // duration
}

export interface MercOffer {
  id: string;
  unitId: string;
  name: string;
  race: RaceId;
  gender: 'f' | 'm';
  cost: number;
  upkeep: number;
  stars: number;
  hired: boolean;
  bio: string;
}

export interface TavernState { luna: number; contracts: ContractOffer[]; mercs: MercOffer[]; dice?: number }

export interface WorldModule {
  parties: PartyState[];
  nextId: number;
  speed: number;             // selected speed (1, 2, 4)
  paused: boolean;
  weather: { rain: number; ash: number; fog: number; storm: number };
  spawnT: Record<string, number>;
  council: { lunaDue: number; resolutions: string[] } | null;
  sello: number | null;
  bribes: Record<string, number>;   // faction → luna until they ignore you
  tracked: string | null;
  veilT: number;
  taverns: Record<string, TavernState>;
  respawn: boolean;
  lastLocation: string | null;
  acc: { hp: number; mana: number };
  aurelCooldown: number;
  deliveries: Record<string, string>;   // quest id → target location
  conquests: Record<string, number>;    // location id → luna of conquest (for counter-attacks)
  lastEncounter: number;
  intro: boolean;                       // first overworld arrival shown
}

declare module '../../core/state' {
  interface RunModules { world: WorldModule }
}

export function defaultWorld(): WorldModule {
  return {
    parties: [], nextId: 1, speed: 1, paused: false,
    weather: { rain: 0.6, ash: 0.7, fog: 0.8, storm: 0 },
    spawnT: {}, council: null, sello: null, bribes: {}, tracked: null, veilT: 0,
    taverns: {}, respawn: false, lastLocation: null, acc: { hp: 0, mana: 0 }, aurelCooldown: 0,
    deliveries: {}, conquests: {}, lastEncounter: 0, intro: false,
  };
}

registerModule('world', () => defaultWorld());

/** The world slice of the current run (created on demand for old saves). */
export function W(): WorldModule {
  const mods = G.run.modules as { world?: WorldModule };
  if (!mods.world) mods.world = defaultWorld();
  const w = mods.world;
  // forward-compat for saves created by older builds
  w.spawnT ??= {}; w.bribes ??= {}; w.taverns ??= {}; w.deliveries ??= {}; w.conquests ??= {};
  w.acc ??= { hp: 0, mana: 0 };
  w.weather ??= { rain: 0.6, ash: 0.7, fog: 0.8, storm: 0 };
  return w;
}

// ───────────────────────── faction look ─────────────────────────

export const FACTION_COLOR: Record<string, string> = {
  valdoria: '#c0392b', sylvaria: '#3fa05a', kharaz: '#e8742a', morvenna: '#8a5ad0', islas: '#1fb5a8',
  concordia: '#f3ead8', concilio: '#f3ead8', excepcion: '#9b5cff',
  ...Object.fromEntries(Object.values(GUILDS).map((g) => [g.id, g.color])),
};

export const FACTION_NAME: Record<string, string> = {
  valdoria: 'Valdoria', sylvaria: 'Sylvaria', kharaz: 'Kharaz', morvenna: 'Morvenna', islas: 'Islas de Azar',
  concordia: 'Concordia', concilio: 'El Concilio', excepcion: 'La Excepción',
  ...Object.fromEntries(Object.values(GUILDS).map((g) => [g.id, g.name])),
};

export function factionColor(f: string): string { return FACTION_COLOR[f] ?? '#c8c8c8'; }
export function factionName(f: string): string { return FACTION_NAME[f] ?? f; }

export const PARTY_LABEL: Record<PartyKind, string> = {
  caravana: 'Caravana', patrulla: 'Patrulla', ejercito: 'Ejército', cazadores: 'Cazadores del Concilio', nemesis: 'Némesis',
  rival: 'Cazarreliquias', refugiados: 'Refugiados', aurel: 'El Gran Héroe', bandidos: 'Bandidos', alianza: 'La Gran Alianza',
  cobradores: 'Cobradores de la Banca',
};
