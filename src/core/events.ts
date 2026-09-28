/**
 * Typed global event bus.
 * Modules extend the event map via declaration merging:
 *
 *   declare module '../core/events' {
 *     interface GameEvents { 'casino:win': { game: string; amount: number } }
 *   }
 */
export interface GameEvents {
  'scene:enter': { id: string; params?: unknown };
  'scene:exit': { id: string };
  'state:new-run': { cycle: number };
  'state:loaded': { cycle: number };
  'state:saved': { at: number };
  'res:change': { key: 'gold' | 'mana' | 'essence' | 'influence' | 'secrets' | 'alert' | 'hp'; value: number; delta: number };
  'codex:progress': { abilityId: string; progress: number; required: number };
  'codex:acquired': { abilityId: string };
  'relic:gained': { relicId: string; uid: string };
  'title:change': { index: number; name: string };
  'narrator:line': { text: string };
  'luna:tick': { luna: number };
  'input:pause': Record<string, never>;
  'settings:change': { key: string; value: unknown };
  'toast': { text: string; kind?: string };

  // ── Cross-module contract events (emitter → listeners). Payloads are fixed; add new events freely.
  /** society → progression/story/world: a continent reached 100% corruption. */
  'continent:corrupted': { continent: import('../data/types').ContinentId };
  /** society → world: spawn Concilio hunter parties. */
  'alert:hunters': { count: number; strength: number };
  /** society → world/story: the Gran Alianza mobilizes (alert ≥ 75). */
  'alert:alliance': { strength: number };
  /** society → story/world: the Gran Sello ritual (alert 100). */
  'sello:start': { lunas: number };
  'sello:progress': { remaining: number };
  'sello:complete': Record<string, never>;
  'sello:broken': Record<string, never>;
  /** society → world: a nemesis starts hunting Elias on the map. */
  'nemesis:hunt': { npcId: string };
  /** society: a Concilio session is due / resolved. */
  'concilio:session': { lunaDue: number; resolutions: string[] };
  'concilio:resolved': { resolution: string; passed: boolean };
  /** progression: Libro de la Realidad used. */
  'reality:rewrite': { rewrite: string; sacrifice: string };
  /** world → story/society: player entered a location (special = LocationDef.special). */
  'location:enter': { id: string; special?: string };
  /** story → everyone: a named story beat happened (e.g. 'revived', 'aurel_returns', 'final_act'). */
  'story:beat': { id: string };
  /** story → society/meta: a cycle ended ('el' ending, 'sello' bad ending). */
  'cycle:end': { ending: 'el' | 'sello'; cycle: number };
}

type Handler<T> = (payload: T) => void;

class EventBus {
  private handlers = new Map<string, Set<Handler<unknown>>>();

  on<K extends keyof GameEvents>(type: K, fn: Handler<GameEvents[K]>): () => void {
    let set = this.handlers.get(type as string);
    if (!set) { set = new Set(); this.handlers.set(type as string, set); }
    set.add(fn as Handler<unknown>);
    return () => this.off(type, fn);
  }

  once<K extends keyof GameEvents>(type: K, fn: Handler<GameEvents[K]>): () => void {
    const off = this.on(type, (p) => { off(); fn(p); });
    return off;
  }

  off<K extends keyof GameEvents>(type: K, fn: Handler<GameEvents[K]>): void {
    this.handlers.get(type as string)?.delete(fn as Handler<unknown>);
  }

  emit<K extends keyof GameEvents>(type: K, payload: GameEvents[K]): void {
    const set = this.handlers.get(type as string);
    if (!set) return;
    for (const fn of [...set]) {
      try { fn(payload); } catch (err) { console.error(`[bus] handler for "${String(type)}" failed`, err); }
    }
  }

  /** Remove every handler registered through the returned scope (use in scene exit). */
  scope(): { on: EventBus['on']; dispose: () => void } {
    const offs: Array<() => void> = [];
    return {
      on: ((type: keyof GameEvents, fn: Handler<never>) => { const off = this.on(type, fn as never); offs.push(off); return off; }) as EventBus['on'],
      dispose: () => { offs.splice(0).forEach((f) => f()); },
    };
  }
}

export const bus = new EventBus();
