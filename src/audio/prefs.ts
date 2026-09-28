/** Persisted audio preferences (localStorage key 'lx.audio'). */
import type { Bus } from './types';

export interface Prefs {
  master: number;
  music: number;
  sfx: number;
  ambience: number;
  muted: boolean;
  voice: boolean;
}

export const PREFS_KEY = 'lx.audio';

export const DEFAULT_PREFS: Prefs = { master: 0.9, music: 0.7, sfx: 0.9, ambience: 0.7, muted: false, voice: true };

const clamp01 = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : d);

export function loadPrefs(): Prefs {
  const p: Prefs = { ...DEFAULT_PREFS };
  try {
    const raw = globalThis.localStorage?.getItem(PREFS_KEY);
    if (!raw) return p;
    const o = JSON.parse(raw) as Partial<Record<keyof Prefs, unknown>>;
    p.master = clamp01(o.master, p.master);
    p.music = clamp01(o.music, p.music);
    p.sfx = clamp01(o.sfx, p.sfx);
    p.ambience = clamp01(o.ambience, p.ambience);
    if (typeof o.muted === 'boolean') p.muted = o.muted;
    if (typeof o.voice === 'boolean') p.voice = o.voice;
  } catch {
    /* storage unavailable or corrupt: defaults */
  }
  return p;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

export function savePrefs(p: Prefs): void {
  if (saveTimer !== null) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      globalThis.localStorage?.setItem(PREFS_KEY, JSON.stringify(p));
    } catch {
      /* quota / privacy mode */
    }
  }, 150);
}

/** Slider value (0..1) -> linear gain with a perceptual (squared) taper. */
export function sliderToGain(v: number): number {
  if (v <= 0.001) return 0;
  return v * v;
}

export function busValue(p: Prefs, bus: Bus): number {
  return p[bus];
}
