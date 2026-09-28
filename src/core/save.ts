/** localStorage persistence for the run (cycle) and the meta progression. */
import { bus } from './events';
import { G, META_VERSION, RUN_VERSION, defaultMeta, defaultSettings, ensureModules, type MetaState, type RunState } from './state';

const RUN_KEY = 'lx.run';
const META_KEY = 'lx.meta';

export function loadMeta(): MetaState {
  let meta: MetaState;
  try {
    const raw = localStorage.getItem(META_KEY);
    meta = raw ? { ...defaultMeta(), ...(JSON.parse(raw) as Partial<MetaState>) } : defaultMeta();
  } catch { meta = defaultMeta(); }
  meta.settings = { ...defaultSettings(), ...(meta.settings ?? {}) };
  meta.v = META_VERSION;
  G.meta = meta;
  return meta;
}

export function saveMeta(): void {
  if (!G.meta) return;
  G.meta.lastPlayAt = Date.now();
  try { localStorage.setItem(META_KEY, JSON.stringify(G.meta)); } catch (err) { console.warn('[save] meta failed', err); }
}

export function hasRun(): boolean {
  try { return !!localStorage.getItem(RUN_KEY); } catch { return false; }
}

export function loadRun(): RunState | null {
  try {
    const raw = localStorage.getItem(RUN_KEY);
    if (!raw) return null;
    const run = JSON.parse(raw) as RunState;
    if (!run || run.v !== RUN_VERSION) return null;
    run.modules ??= {} as RunState['modules'];
    G.run = run;
    ensureModules(run);
    bus.emit('state:loaded', { cycle: run.cycle });
    return run;
  } catch (err) {
    console.warn('[save] run load failed', err);
    return null;
  }
}

let lastSave = 0;
export function saveRun(force = false): void {
  if (!G.run) return;
  const now = performance.now();
  if (!force && now - lastSave < 1500) return;
  lastSave = now;
  try {
    localStorage.setItem(RUN_KEY, JSON.stringify(G.run));
    saveMeta();
    bus.emit('state:saved', { at: Date.now() });
  } catch (err) { console.warn('[save] run failed', err); }
}

export function clearRun(): void {
  try { localStorage.removeItem(RUN_KEY); } catch { /* ignore */ }
}

/** Full export for backups (settings screen). */
export function exportSave(): string {
  return JSON.stringify({ run: G.run ?? null, meta: G.meta });
}
export function importSave(json: string): boolean {
  try {
    const data = JSON.parse(json) as { run: RunState | null; meta: MetaState };
    if (data.meta) localStorage.setItem(META_KEY, JSON.stringify(data.meta));
    if (data.run) localStorage.setItem(RUN_KEY, JSON.stringify(data.run)); else clearRun();
    return true;
  } catch { return false; }
}

/** Wipe everything (settings → "Borrar todo"). */
export function wipeAll(): void {
  try { localStorage.removeItem(RUN_KEY); localStorage.removeItem(META_KEY); } catch { /* ignore */ }
}
