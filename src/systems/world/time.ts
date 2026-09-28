/**
 * Time in lunas. The overworld advances time in real time (pausable, ×1/×2/×4); nothing else does, except
 * explicit waits (Descansar). 1 luna ≈ 75 s at ×1. Each luna holds one visual day/night cycle and one full
 * set of moon phases. Never show a day or year number: only the moon glyph + phase name.
 *
 * Emits `luna:tick` { luna } once per luna crossed (+ track('lunas')).
 */
import { bus } from '../../core/events';
import { G } from '../../core/state';
import { track } from '../../core/tracker';
import { moonGlyph } from '../../core/math';
import { W } from './state';

export const LUNA_SECONDS = 75;
export const SPEEDS = [1, 2, 4] as const;

export const PHASE_NAMES = [
  'Luna nueva', 'Luna creciente', 'Cuarto creciente', 'Gibosa creciente',
  'Luna llena', 'Gibosa menguante', 'Cuarto menguante', 'Luna menguante',
] as const;

declare module '../../core/events' {
  interface GameEvents {
    /** world: speed/pause changed (HUD sync). */
    'world:time': { speed: number; paused: boolean };
  }
}

const frac = (p: number) => ((p % 1) + 1) % 1;

export function phaseIndex(phase = G.run?.lunaPhase ?? 0): number { return Math.floor(frac(phase) * 8) % 8; }
export function phaseName(phase = G.run?.lunaPhase ?? 0): string { return PHASE_NAMES[phaseIndex(phase)]; }
export function phaseGlyph(phase = G.run?.lunaPhase ?? 0): string { return moonGlyph(phase); }

const DAY_SHARE = 0.68;
/** Maps the luna phase to Sky time (0 midnight … 0.25 dawn … 0.5 noon … 0.75 dusk). Days are longer than nights. */
export function skyTime(phase = G.run?.lunaPhase ?? 0): number {
  const p = frac(phase);
  if (p < DAY_SHARE) return 0.21 + (p / DAY_SHARE) * (0.8 - 0.21);
  return frac(0.8 + ((p - DAY_SHARE) / (1 - DAY_SHARE)) * 0.41);
}
/** 0 in daylight → 1 at deep night (smooth). */
export function nightFactor(phase = G.run?.lunaPhase ?? 0): number {
  const t = skyTime(phase);
  const d = t < 0.5 ? t : 1 - t;            // distance from midnight (0 … 0.5)
  return Math.max(0, Math.min(1, (0.3 - d) / 0.1));
}
export function isNight(phase = G.run?.lunaPhase ?? 0): boolean { return nightFactor(phase) > 0.5; }

/** Effective overworld time multiplier (0 = paused). */
export function timeScale(): number {
  if (!G.run) return 0;
  const w = W();
  return w.paused ? 0 : w.speed;
}

function syncScale(): void {
  const w = W();
  G.run.timeScale = w.paused ? 0 : w.speed;
  bus.emit('world:time', { speed: w.speed, paused: w.paused });
}

export function setSpeed(s: number): void {
  const w = W();
  w.speed = SPEEDS.includes(s as 1 | 2 | 4) ? s : 1;
  w.paused = false;
  syncScale();
}
export function setPaused(p: boolean): void { W().paused = p; syncScale(); }
export function togglePause(): boolean { const w = W(); w.paused = !w.paused; syncScale(); return w.paused; }
export function isPaused(): boolean { return W().paused; }

/**
 * Advance the clock by `seconds` of *scaled* world time (the caller multiplies real dt by the speed).
 * Returns the number of whole lunas crossed.
 */
export function advanceTime(seconds: number): number {
  const r = G.run;
  if (!r || seconds <= 0) return 0;
  r.lunaPhase += seconds / LUNA_SECONDS;
  r.playTime += seconds;
  let crossed = 0;
  while (r.lunaPhase >= 1) {
    r.lunaPhase -= 1;
    r.luna += 1;
    crossed++;
    track('lunas');
    bus.emit('luna:tick', { luna: r.luna });
  }
  return crossed;
}

/** Instantly pass `n` lunas (fractional allowed), e.g. resting. Emits a tick per luna crossed. */
export function passLunas(n: number): number {
  return advanceTime(n * LUNA_SECONDS);
}

/** Human text for a span of lunas ("media luna", "1 luna", "3 lunas"). */
export function lunasText(n: number): string {
  if (n <= 0) return 'ya';
  if (n < 0.75) return 'media luna';
  const r = Math.round(n);
  return r === 1 ? '1 luna' : `${r} lunas`;
}
