/**
 * Story slice of the run (G.run.modules.story) + small shared helpers for the story systems.
 * Everything here is JSON-serializable (saved with the run).
 */
import { G, registerModule } from '../../core/state';
import type { ContinentId } from '../../data/types';
import { CONTINENT_IDS } from '../../data/world';
import { FALLBACK_NAMES } from '../../data/story';
import { ABILITIES } from '../../data/abilities';
import { RELICS } from '../../data/relics';

export interface StoryState {
  /** Narrator line ids already used this run (for `once` lines). */
  narrSeen: string[];
  /** Threshold bookkeeping for the stat watcher: key → last value handled. */
  marks: Record<string, number>;
  firstCopy?: string;
  nemesesKilled: string[];
  killedBy: string[];
  councilSessions: number;
  aurelKnows: boolean;
  aurelHunting: boolean;
  finalAct: boolean;
  finalActLuna?: number;
  finalWon: boolean;
  hesitated: boolean;
  echoesApplied: boolean;
  kitAcquired: boolean;
  /** Pages and hazañas obtained during this run (for the ink tally). */
  pagesFound: string[];
  achThisRun: string[];
  /** Last resumable scene (for "Continuar"). */
  scene?: string;
  /** Biggest single gamble seen (for the ending montage). */
  biggestBet: number;
  /** Seconds actually played this run (in the world, not idle) — for "Te vi quedarte…". */
  playSeconds: number;
}

declare module '../../core/state' {
  interface RunModules { story: StoryState }
}

function fresh(): StoryState {
  return {
    narrSeen: [], marks: {}, nemesesKilled: [], killedBy: [], councilSessions: 0,
    aurelKnows: false, aurelHunting: false, finalAct: false, finalWon: false, hesitated: false,
    echoesApplied: false, kitAcquired: false, pagesFound: [], achThisRun: [], biggestBet: 0, playSeconds: 0,
  };
}

registerModule('story', () => fresh());

/** The story slice of the current run (created on demand for old saves). */
export function st(): StoryState {
  const mods = G.run.modules as unknown as Record<string, unknown>;
  let s = mods.story as StoryState | undefined;
  if (!s) { s = fresh(); mods.story = s; }
  // forward-compat for saves made by earlier versions of this slice
  const f = fresh() as unknown as Record<string, unknown>;
  const cur = s as unknown as Record<string, unknown>;
  for (const k of Object.keys(f)) if (cur[k] === undefined) cur[k] = f[k];
  return s;
}

export function hasRunState(): boolean { return !!(G.run && G.run.player); }

export function corruptedCount(): number {
  if (!G.run?.continents) return 0;
  return CONTINENT_IDS.filter((c: ContinentId) => G.run.continents[c]?.corrupted).length;
}

export function maxCorruption(): number {
  if (!G.run?.continents) return 0;
  return Math.max(0, ...CONTINENT_IDS.map((c) => G.run.continents[c]?.corruption ?? 0));
}

/** Relic ownership that works even before the progression module exists. */
export function ownsRelic(id: string): boolean {
  return !!G.run?.player?.relics?.some((r) => r.id === id);
}

export function abilityName(id: string): string {
  return ABILITIES[id]?.name ?? FALLBACK_NAMES[id] ?? prettify(id);
}

export function relicName(id: string): string {
  return RELICS[id]?.name ?? FALLBACK_NAMES[id] ?? prettify(id);
}

export function prettify(id: string): string {
  const s = id.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Spanish thousands separator without depending on locale data ("12.400"). */
export function money(n: number): string {
  const v = Math.round(Math.abs(n));
  return (n < 0 ? '−' : '') + String(v).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** "Son las 2:14 de la madrugada" (or "Es la 1:05 de la madrugada"). Never a date. */
export function horaLocal(withMinutes = true, d = new Date()): string {
  const h = d.getHours();
  const m = d.getMinutes();
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const part = h < 6 ? 'de la madrugada' : h < 12 ? 'de la mañana' : h < 19 ? 'de la tarde' : 'de la noche';
  const clock = withMinutes ? `${h12}:${String(m).padStart(2, '0')}` : String(h12);
  return `${h12 === 1 ? 'Es la' : 'Son las'} ${clock} ${part}`;
}

/** Scenes where the world is "live" (the narrator may comment, idle counts, pages may pop). */
export const GAMEPLAY_SCENES = new Set(['overworld', 'location', 'battle', 'casino', 'council']);
