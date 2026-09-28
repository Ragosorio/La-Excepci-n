/**
 * Game state: RunState (one cycle/playthrough) + MetaState (persists across cycles).
 * Access through `G.run` / `G.meta`. Mutate freely, then emit events / call save helpers.
 *
 * Modules that need their own serializable slice augment `RunModules` and register a factory:
 *
 *   declare module '../core/state' { interface RunModules { casino: CasinoState } }
 *   registerModule('casino', (run) => ({ ... }));
 *
 * Factories run on new runs, and on load for slices missing from older saves.
 */
import type {
  ArmyUnit, CodexEntry, ContinentId, CorruptionPath, FactionId, GoodId, NpcState, RelicInstance, StatId,
} from '../data/types';
import { bus } from './events';

export const RUN_VERSION = 1;
export const META_VERSION = 1;

export type Fragment = 'antes' | 'nombre' | 'regla' | 'sobrevivio' | 'el';

export interface PlayerState {
  /** Current display name (changes with titleIndex; becomes 'Él' at the end). */
  name: string;
  titleIndex: number;            // 0..5 — see TITLES
  hp: number; hpMax: number;
  mana: number; manaMax: number;
  stats: Record<StatId, number>; // base stats (fuerza, magia, velocidad, presencia, suerte, vida, mana, armadura)
  gold: number;
  essence: number;
  influence: number;
  secrets: number;
  alert: number;                 // 0..100 Alerta del Concilio
  debt: number;                  // owed to La Banca
  location: string | null;       // location id when inside a location
  pos: { x: number; z: number }; // overworld position
  sanctuaries: string[];         // location ids where he respawns
  army: ArmyUnit[];
  armyCap: number;
  codex: Record<string, CodexEntry>;
  loadout: { slots: (string | null)[]; relics: (string | null)[]; ultimate: string | null };
  relics: RelicInstance[];
  equipped: string[];            // relic instance uids (max equipCap)
  equipCap: number;
  racePowers: string[];          // racial passive ids gained by conquering continents
  retornoMax: number;
  /** resist tag → 0..1 (1 = immune). Built from the codex (La Excepción). */
  exceptions: Record<string, number>;
  books: { aprendizaje: boolean; realidad: boolean };
  nameSacrificed: boolean;
}

export interface ContinentState {
  corruption: number;                          // 0..100
  paths: Record<CorruptionPath, number>;       // contribution by path (sum ≈ corruption)
  pathMult: Record<CorruptionPath, number>;    // randomized per cycle from base multipliers
  weaknessKnown: boolean;
  corrupted: boolean;
  corruptedAt?: number;                        // luna
}

export interface LocationState {
  id: string;
  control: FactionId;            // who holds it ('excepcion' = player)
  fear: number;                  // 0..100
  loyalty: number;               // 0..100 (to its current controller)
  prosperity: number;            // 0..100
  garrison: number;              // defender strength points
  stock: Record<GoodId, number>;
  price: Record<GoodId, number>;
  businesses: string[];          // business ids owned by the player here
  visited: boolean;
  explored: boolean;             // ruin cleared
  razed: boolean;
  relic?: string;                // relic def id placed here this cycle (random placement)
  lastVisit?: number;            // luna
  npcsHere: string[];            // npc ids currently here
  flags: Record<string, number | boolean | string>;
}

export interface QuestState {
  id: string;
  kind: 'main' | 'side' | 'contract';
  title: string;
  desc: string;
  progress: number;
  goal: number;
  done: boolean;
  failed?: boolean;
  target?: string;               // location id to highlight
  reward?: { gold?: number; essence?: number; influence?: number; secrets?: number; relic?: string; text?: string };
  expiresLuna?: number;
  createdLuna: number;
}

export interface NewsItem { luna: number; text: string; kind: 'rumor' | 'politica' | 'economia' | 'guerra' | 'concilio' | 'excepcion' | 'casino'; important?: boolean }

/** Augmented by modules (see header). */
export interface RunModules {}

export interface RunState {
  v: number;
  seed: number;
  cycle: number;
  createdAt: number;
  playTime: number;              // seconds
  luna: number;                  // integer count of lunas passed (never shown as a number to the player)
  lunaPhase: number;             // 0..1 inside the current luna (drives day/night + moon glyph)
  timeScale: number;             // overworld speed multiplier (0 = paused)
  fragment: Fragment;
  player: PlayerState;
  continents: Record<ContinentId, ContinentState>;
  locations: Record<string, LocationState>;
  npcs: Record<string, NpcState>;
  reputation: Record<string, number>;   // FactionId → -100..100
  flags: Record<string, number | boolean | string>;
  quests: QuestState[];
  news: NewsItem[];
  stats: Record<string, number>;
  modules: RunModules;
}

export interface Settings {
  quality: 'alta' | 'media' | 'baja';
  shake: number;                 // 0..1
  textSpeed: number;             // chars per second multiplier (1 = normal)
  damageNumbers: boolean;
  voice: boolean;                // Web Speech whisper for key lines
  camera: 'tactica' | 'hombro';
  reducedFlashes: boolean;
}

export interface MetaState {
  v: number;
  cyclesCompleted: number;
  currentCycle: number;
  ink: number;
  inkTotal: number;
  margins: Record<string, number>;       // margin id → rank
  echoesKnown: string[];                 // every ability ever acquired
  echoSlots: number;
  echoesChosen: string[];                // chosen for the current/next cycle
  pages: string[];                       // lore page ids found (all-time)
  achievements: string[];
  endings: string[];                     // 'el', 'sello', ...
  nemesisEchoes: Array<{ name: string; race: string; title?: string; grudge: string; cycle: number }>;
  npcEchoes: Record<string, { cycle: number; feeling: string; memory: string }>;
  stats: Record<string, number>;         // lifetime tracker totals
  records: Record<string, number>;       // max values (biggest win...)
  settings: Settings;
  firstPlayAt: number;
  lastPlayAt: number;
  sessions: number;
  seenPrologue: boolean;
  flags: Record<string, number | boolean | string>;
}

export const TITLES = ['Elias Veyr', 'La Excepción', 'El Hombre sin Ley', 'Veyr', 'El Referente', 'Él'] as const;

// ───────────────────────────── Global container ─────────────────────────────

export const G = {
  run: null as unknown as RunState,
  meta: null as unknown as MetaState,
  get hasRun(): boolean { return !!(this.run as RunState | null); },
};

// ───────────────────────────── Module slices ────────────────────────────────

type Factory = (run: RunState) => unknown;
const factories = new Map<string, Factory>();

export function registerModule<K extends keyof RunModules>(key: K, factory: (run: RunState) => RunModules[K]): void {
  factories.set(key as string, factory as Factory);
}

export function ensureModules(run: RunState): void {
  const mods = run.modules as unknown as Record<string, unknown>;
  for (const [key, f] of factories) {
    if (mods[key] === undefined) {
      try { mods[key] = f(run); } catch (err) { console.error(`[state] module factory "${key}" failed`, err); }
    }
  }
}

// ───────────────────────────── Defaults ─────────────────────────────────────

export function defaultSettings(): Settings {
  return { quality: 'alta', shake: 1, textSpeed: 1, damageNumbers: true, voice: false, camera: 'tactica', reducedFlashes: false };
}

export function defaultMeta(): MetaState {
  const now = Date.now();
  return {
    v: META_VERSION, cyclesCompleted: 0, currentCycle: 1, ink: 0, inkTotal: 0, margins: {}, echoesKnown: [],
    echoSlots: 0, echoesChosen: [], pages: [], achievements: [], endings: [], nemesisEchoes: [], npcEchoes: {},
    stats: {}, records: {}, settings: defaultSettings(), firstPlayAt: now, lastPlayAt: now, sessions: 0,
    seenPrologue: false, flags: {},
  };
}

export function emptyGoods(v = 0): Record<GoodId, number> {
  return { grano: v, madera: v, hierro: v, especias: v, seda: v, pociones: v, gemas: v, cristal: v };
}

export function defaultPlayer(): PlayerState {
  return {
    name: TITLES[0], titleIndex: 0,
    hp: 100, hpMax: 100, mana: 60, manaMax: 60,
    stats: { fuerza: 5, magia: 8, velocidad: 6, presencia: 4, suerte: 5, vida: 100, mana: 60, armadura: 0 },
    gold: 150, essence: 0, influence: 0, secrets: 0, alert: 0, debt: 0,
    location: null, pos: { x: 0, z: 0 }, sanctuaries: ['crater'],
    army: [], armyCap: 24,
    codex: {},
    loadout: { slots: [null, null, null, null], relics: [null, null], ultimate: null },
    relics: [], equipped: [], equipCap: 4,
    racePowers: [], retornoMax: 1, exceptions: {},
    books: { aprendizaje: false, realidad: false },
    nameSacrificed: false,
  };
}

/** Creates a bare run. World/systems modules fill continents/locations/npcs via their factories + initWorld hooks. */
export function createRun(cycle: number, seed: number): RunState {
  const run: RunState = {
    v: RUN_VERSION, seed, cycle, createdAt: Date.now(), playTime: 0,
    luna: 0, lunaPhase: 0.3, timeScale: 1, fragment: 'antes',
    player: defaultPlayer(),
    continents: {} as Record<ContinentId, ContinentState>,
    locations: {}, npcs: {}, reputation: {}, flags: {}, quests: [], news: [], stats: {},
    modules: {} as RunModules,
  };
  return run;
}

// ───────────────────────────── Run init hooks ───────────────────────────────
// Systems register initializers that populate a fresh run (world gen, npcs, prices...). Ordered by priority.

type InitHook = { name: string; priority: number; fn: (run: RunState) => void };
const initHooks: InitHook[] = [];

/** Lower priority runs first. World data = 0, npcs = 10, economy = 20, politics = 30, story = 40, meta bonuses = 90. */
export function onRunInit(name: string, priority: number, fn: (run: RunState) => void): void {
  const i = initHooks.findIndex((h) => h.name === name);
  if (i >= 0) initHooks.splice(i, 1);
  initHooks.push({ name, priority, fn });
  initHooks.sort((a, b) => a.priority - b.priority);
}

export function newRun(seed = (Math.random() * 2 ** 31) >>> 0): RunState {
  const cycle = G.meta?.currentCycle ?? 1;
  const run = createRun(cycle, seed);
  G.run = run;
  ensureModules(run);
  for (const h of initHooks) {
    try { h.fn(run); } catch (err) { console.error(`[state] init hook "${h.name}" failed`, err); }
  }
  bus.emit('state:new-run', { cycle });
  return run;
}

// ───────────────────────────── Resource helpers ─────────────────────────────

type ResKey = 'gold' | 'essence' | 'influence' | 'secrets' | 'alert' | 'mana' | 'hp';

function emitRes(key: ResKey, value: number, delta: number) {
  bus.emit('res:change', { key, value, delta });
}

/** Multipliers other modules can register (relics, margins, racial powers). */
const resMods: Partial<Record<ResKey, Array<(delta: number) => number>>> = {};
export function addResModifier(key: ResKey, fn: (delta: number) => number): void {
  (resMods[key] ??= []).push(fn);
}

export const res = {
  /** Adds (or subtracts with negative) a resource. Positive gains pass through registered modifiers. Returns applied delta. */
  add(key: ResKey, amount: number, opts: { raw?: boolean } = {}): number {
    const p = G.run.player;
    let delta = amount;
    if (!opts.raw && amount > 0) for (const m of resMods[key] ?? []) delta = m(delta);
    const cur = p[key];
    let next = cur + delta;
    if (key === 'alert') next = Math.max(0, Math.min(100, next));
    else if (key === 'mana') next = Math.max(0, Math.min(p.manaMax, next));
    else if (key === 'hp') next = Math.max(0, Math.min(p.hpMax, next));
    else next = Math.max(0, next);
    if (key === 'gold' || key === 'essence' || key === 'influence' || key === 'secrets') next = Math.round(next);
    p[key] = next;
    const applied = next - cur;
    if (applied !== 0) emitRes(key, next, applied);
    return applied;
  },
  can(key: 'gold' | 'essence' | 'influence' | 'secrets' | 'mana', amount: number): boolean {
    return G.run.player[key] >= amount;
  },
  /** Spend if possible; returns false (and does nothing) if not enough. */
  spend(key: 'gold' | 'essence' | 'influence' | 'secrets' | 'mana', amount: number): boolean {
    if (G.run.player[key] < amount) return false;
    res.add(key, -amount, { raw: true });
    return true;
  },
};

/** Recomputes the title from corrupted continents (5 → 'Él' only through the ending). Emits title:change. */
export function refreshTitle(): void {
  const r = G.run;
  const n = (Object.keys(r.continents) as ContinentId[]).filter((c) => c !== 'concordia' && r.continents[c]?.corrupted).length;
  const idx = r.player.nameSacrificed ? 5 : Math.min(4, n);
  if (idx !== r.player.titleIndex) {
    r.player.titleIndex = idx;
    r.player.name = TITLES[idx];
    bus.emit('title:change', { index: idx, name: r.player.name });
  }
}

export function flag(key: string): number | boolean | string | undefined { return G.run.flags[key]; }
export function setFlag(key: string, v: number | boolean | string = true): void { G.run.flags[key] = v; }
