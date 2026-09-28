/**
 * The narrator engine ("La Voz"): event key → a line from data/story NARRATION, with per-key and global cooldowns,
 * once-per-run lines, cycle gating and deferral while a battle/cutscene owns the screen.
 * Person (third → first → direct) is chosen by ui/narrator.pickPerson unless forced.
 */
import { NARRATION, type StoryLine } from '../../data/story';
import type { NarratorLine } from '../../data/types';
import { narrate, type Person } from '../../ui/narrator';
import { G } from '../../core/state';
import { engine } from '../../core/engine';
import { bus } from '../../core/events';
import { st, GAMEPLAY_SCENES } from './state';

const now = () => performance.now() / 1000;
const lastKey = new Map<string, number>();
let lastAny = -1e9;

/** Seconds before the same key can speak again. */
const KEY_COOLDOWN: Record<string, number> = {
  ambient: 330, luna: 480, battle_won: 150, battle_lost: 120, battle_fled: 150, copy: 110, revival: 240,
  death_many: 200, death_lots: 200, spared: 200, executed: 200, idle_return: 420, tab_return: 600,
  gamble_win_big: 180, gamble_loss_big: 180, aurel_encounter: 300, dejavu: 420, colmenas: 900, crater: 900,
  concordia: 900, bruma: 1200, relic_major: 20, continent_corrupted: 20, council_session: 600, cheat_caught: 200,
  units_lost_many: 300, mind_many: 600, copy_milestone: 60,
};
/** Minimum gap between two non-priority lines, whatever their key. */
const GLOBAL_GAP = 26;

export interface SayOpts {
  /** Ignore the global gap (story beats). */
  priority?: boolean;
  /** Ignore every cooldown and the scene filter. */
  force?: boolean;
  /** If a battle owns the screen, wait for the next overworld/location scene. */
  defer?: boolean;
  position?: 'bottom' | 'center' | 'top';
  person?: Person;
  hold?: number;
}

type Vars = Record<string, string | number>;
const pending: Array<{ key: string; vars: Vars; opts: SayOpts; at: number }> = [];

function fillVars(t: string | undefined, vars: Vars): string | undefined {
  if (t === undefined) return undefined;
  return t.replace(/\{(\w+)\}/g, (m, k: string) => (k === 'name' || k === 'Name' || k === 'fullname' ? m : vars[k] !== undefined ? String(vars[k]) : m));
}

function pick(pool: StoryLine[]): StoryLine {
  let total = 0;
  for (const l of pool) total += l.weight ?? 1;
  let r = Math.random() * total;
  for (const l of pool) { r -= l.weight ?? 1; if (r <= 0) return l; }
  return pool[pool.length - 1];
}

function eligible(key: string): StoryLine[] {
  const lines = NARRATION[key];
  if (!lines?.length || !G.run) return [];
  const cycle = G.run.cycle ?? 1;
  const seen = st().narrSeen;
  return lines.filter((l) => (l.minCycle ?? 1) <= cycle && cycle <= (l.maxCycle ?? 999) && !(l.once && seen.includes(l.id)));
}

/**
 * Ask the narrator to comment on an event. Returns true if a line was queued.
 * Other modules may call this (via systems/story) with their own keys from NARRATION.
 */
export function sayEvent(key: string, vars: Vars = {}, opts: SayOpts = {}): boolean {
  if (!G.run) return false;
  const pool = eligible(key);
  if (!pool.length) return false;
  const t = now();
  const sid = engine.sceneId;
  if (!opts.force) {
    if (t - (lastKey.get(key) ?? -1e9) < (KEY_COOLDOWN[key] ?? 45)) return false;
    if (!opts.priority && t - lastAny < GLOBAL_GAP) return false;
    if (!sid || !GAMEPLAY_SCENES.has(sid)) return false;
    if (opts.defer && sid === 'battle') {
      if (!pending.some((p) => p.key === key)) pending.push({ key, vars, opts: { ...opts, defer: false }, at: t });
      return false;
    }
  }
  const line = pick(pool);
  if (line.once) st().narrSeen.push(line.id);
  lastKey.set(key, t);
  lastAny = t;
  const filled: NarratorLine = { third: fillVars(line.third, vars)!, first: fillVars(line.first, vars), direct: fillVars(line.direct, vars) };
  const position = opts.position ?? (sid === 'battle' || sid === 'casino' || sid === 'council' ? 'top' : 'bottom');
  void narrate(filled, { position, person: opts.person, hold: opts.hold });
  return true;
}

/** Plain line through the narrator (for scripted scenes), with vars filled. */
export function sayLine(line: NarratorLine | string, vars: Vars = {}, opts: { position?: 'bottom' | 'center' | 'top'; person?: Person; hold?: number } = {}): Promise<void> {
  const l = typeof line === 'string' ? { third: line } : line;
  lastAny = now();
  return narrate({ third: fillVars(l.third, vars)!, first: fillVars(l.first, vars), direct: fillVars(l.direct, vars) }, opts);
}

/** Resets the global gap so the next line can speak right away (after a cutscene). */
export function quietFor(seconds: number): void { lastAny = now() - GLOBAL_GAP + seconds; }

export function initNarration(): void {
  bus.on('scene:enter', ({ id }) => {
    if (id !== 'overworld' && id !== 'location') return;
    if (!pending.length) return;
    const items = pending.splice(0);
    let delay = 1600;
    for (const p of items) {
      if (now() - p.at > 240) continue; // stale
      setTimeout(() => sayEvent(p.key, p.vars, { ...p.opts, priority: true }), delay);
      delay += 5200;
    }
  });
}

/** A random eligible line for `key` (no cooldowns, no scene filter) — for scripted scenes like Los Márgenes. */
export function lineFor(key: string): NarratorLine | null {
  const pool = G.run ? eligible(key) : (NARRATION[key] ?? []).filter((l) => (l.minCycle ?? 1) <= (G.meta?.currentCycle ?? 1));
  if (!pool.length) return null;
  const l = pick(pool);
  return { third: l.third, first: l.first, direct: l.direct };
}
