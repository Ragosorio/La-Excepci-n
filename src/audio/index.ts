/**
 * La Excepción — audio public API.
 *
 *   import { audio } from '../audio';
 *   audio.unlock();                        // from the first click/keydown (also auto-installed, see below)
 *   audio.music('overworld', { region: 'kharaz' });
 *   audio.sfx('coin', { pitch: 1.1 });
 *   audio.stinger('excepcion');
 *
 * Everything is synthesized procedurally (Tone.js context/clock + native WebAudio
 * voices). This file is dependency-free: the engine (and Tone.js) are loaded
 * lazily inside `unlock()`, so importing the module costs nothing and never
 * creates an AudioContext before a user gesture.
 *
 * Before unlock: sfx/stinger/speak/duck are dropped (except the ones fired by the
 * unlocking click itself); the last `music()` request, `ambience()` states,
 * intensity and volumes are remembered and applied on unlock. The module also
 * listens for the first pointer/key gesture and unlocks itself.
 *
 * Semantics worth knowing:
 * - music(): crossfades (default 2 s). The region is sticky: `music('battle')` after
 *   `music('overworld', {region:'kharaz'})` plays Kharaz battle music. Region only
 *   matters for overworld / overworld_night / location / battle / boss / victory_loop /
 *   tension / stealth. overworld <-> overworld_night and prologue <-> prologue_dark are
 *   phase-locked siblings (same bar grid & harmony, only the orchestration changes),
 *   so use a long fade (4–8 s) for "the morning darkens". 'ending' plays once and then
 *   stays silent. 'silence' fades everything out.
 * - setIntensity(0..1): global, applies to the current and future moods. Suggested:
 *   exploring 0–0.3, danger nearby 0.4, fight 0.5–0.7, desperate/boss phase 0.8–1.
 * - duck(amount, seconds): lowers the music bed by `amount` (0..1) for `seconds`, then
 *   restores smoothly; overlapping ducks take the deepest. duck(0, 0) cancels manual ducks.
 * - sfx(): fire-and-forget; identical sounds within ~25 ms merge, max 24 voices
 *   (combat sounds are stolen first, UI never), ±4 % random pitch on top of opts.pitch.
 */
import type { Engine } from './engine';
import { type Prefs, loadPrefs, savePrefs } from './prefs';
import type { AudioAPI, Ambience, Bus, MusicMood, Region, SfxName, SfxOpts, StingerName } from './types';

export type { AudioAPI, Ambience, MusicMood, Region, SfxName, SfxOpts, StingerName } from './types';

type ACtor = typeof AudioContext;

function audioContextCtor(): ACtor | null {
  const w = globalThis as unknown as { AudioContext?: ACtor; webkitAudioContext?: ACtor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

/** Resume + play one silent sample synchronously inside the gesture (iOS/Safari unlock). */
function primeContext(ctx: AudioContext): void {
  try {
    void ctx.resume().catch(() => undefined);
  } catch {
    /* ignore */
  }
  try {
    const b = ctx.createBuffer(1, 1, ctx.sampleRate);
    const s = ctx.createBufferSource();
    s.buffer = b;
    s.connect(ctx.destination);
    s.start(0);
  } catch {
    /* ignore */
  }
}

const clamp01 = (v: number): number => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);

interface PendingMusic { mood: MusicMood; region?: Region; fade?: number }

class AudioFacade implements AudioAPI {
  private eng: Engine | null = null;
  private loading: Promise<void> | null = null;
  private ctx: AudioContext | null = null;
  private readonly prefs: Prefs = loadPrefs();
  private pendingMusic: PendingMusic | null = null;
  private readonly pendingAmb = new Map<Ambience, { on: boolean; volume?: number }>();
  /** sfx/stingers requested while the engine is loading (so the unlocking click itself is heard) */
  private pendingFx: Array<{ at: number; play: (e: Engine) => void }> = [];
  private intensity = 0;

  get unlocked(): boolean {
    return this.eng !== null;
  }

  unlock(): Promise<void> {
    try {
      if (this.eng) {
        this.eng.resume();
        return Promise.resolve();
      }
      if (this.ctx) primeContext(this.ctx); // another gesture while the engine is loading
      if (this.loading) return this.loading;
      const Ctor = audioContextCtor();
      if (!Ctor) return Promise.resolve();
      let ctx: AudioContext;
      try {
        ctx = new Ctor({ latencyHint: 'interactive' });
      } catch {
        ctx = new Ctor();
      }
      this.ctx = ctx;
      primeContext(ctx);
      (globalThis as { TONE_SILENCE_LOGGING?: boolean }).TONE_SILENCE_LOGGING = true;
      this.loading = import('./engine')
        .then((m) => new m.Engine(ctx, this.prefs))
        .then(
          (eng) => {
            this.eng = eng;
            removeAutoUnlock();
            // replay what the game asked for while we were locked/loading (each step isolated)
            const safe = (fn: () => void): void => {
              try {
                fn();
              } catch (err) {
                console.warn('[audio] pending', err);
              }
            };
            safe(() => eng.setIntensity(this.intensity));
            for (const [name, s] of this.pendingAmb) safe(() => eng.ambience(name, s.on, s.volume));
            this.pendingAmb.clear();
            const p = this.pendingMusic;
            this.pendingMusic = null;
            if (p) safe(() => eng.music(p.mood, p.region, p.fade));
            const now = performance.now();
            for (const f of this.pendingFx) if (now - f.at < 400) safe(() => f.play(eng));
            this.pendingFx = [];
          },
          (err: unknown) => {
            console.warn('[audio] engine failed to load', err);
            this.loading = null;
            this.ctx = null;
            this.pendingFx = [];
            try {
              void ctx.close().catch(() => undefined);
            } catch {
              /* ignore */
            }
          },
        );
      return this.loading;
    } catch (err) {
      console.warn('[audio] unlock failed', err);
      return Promise.resolve();
    }
  }

  music(mood: MusicMood, opts?: { region?: Region; fade?: number }): void {
    try {
      if (this.eng) {
        this.eng.music(mood, opts?.region, opts?.fade);
        return;
      }
      const p: PendingMusic = { mood };
      if (opts?.region !== undefined) p.region = opts.region;
      if (opts?.fade !== undefined) p.fade = opts.fade;
      this.pendingMusic = p;
    } catch (err) {
      console.warn('[audio] music', err);
    }
  }

  private queue(play: (e: Engine) => void): void {
    if (!this.loading || this.pendingFx.length >= 6) return;
    this.pendingFx.push({ at: performance.now(), play });
  }

  sfx(name: SfxName, opts?: SfxOpts): void {
    const e = this.eng;
    if (!e) {
      this.queue((en) => en.sfx(name, opts));
      return;
    }
    try {
      e.sfx(name, opts);
    } catch (err) {
      console.warn('[audio] sfx', name, err);
    }
  }

  stinger(name: StingerName): void {
    const e = this.eng;
    if (!e) {
      this.queue((en) => en.stinger(name));
      return;
    }
    try {
      e.stinger(name);
    } catch (err) {
      console.warn('[audio] stinger', name, err);
    }
  }

  ambience(name: Ambience, on: boolean, volume?: number): void {
    try {
      if (this.eng) {
        this.eng.ambience(name, on, volume);
        return;
      }
      if (on) this.pendingAmb.set(name, volume === undefined ? { on } : { on, volume });
      else this.pendingAmb.delete(name);
    } catch (err) {
      console.warn('[audio] ambience', err);
    }
  }

  setIntensity(v: number): void {
    this.intensity = clamp01(v);
    try {
      this.eng?.setIntensity(this.intensity);
    } catch (err) {
      console.warn('[audio] intensity', err);
    }
  }

  setVolume(bus: Bus, v: number): void {
    this.prefs[bus] = clamp01(v);
    savePrefs(this.prefs);
    try {
      this.eng?.applyVolumes();
    } catch (err) {
      console.warn('[audio] volume', err);
    }
  }

  getVolume(bus: Bus): number {
    return this.prefs[bus];
  }

  setMuted(m: boolean): void {
    this.prefs.muted = !!m;
    savePrefs(this.prefs);
    try {
      this.eng?.applyVolumes();
    } catch (err) {
      console.warn('[audio] mute', err);
    }
  }

  duck(amount: number, seconds: number): void {
    try {
      this.eng?.duck(amount, seconds);
    } catch (err) {
      console.warn('[audio] duck', err);
    }
  }

  speak(text: string, opts?: { pitch?: number; rate?: number }): void {
    try {
      this.eng?.speak(text, opts);
    } catch (err) {
      console.warn('[audio] speak', err);
    }
  }

  setVoiceEnabled(on: boolean): void {
    this.prefs.voice = !!on;
    savePrefs(this.prefs);
    try {
      if (!on) this.eng?.stopSpeech();
    } catch {
      /* ignore */
    }
  }
}

// One facade per page, even if the module is instantiated twice (dev HMR): never two AudioContexts.
const G = globalThis as unknown as { __lxAudioFacade?: AudioFacade };
export const audio: AudioAPI = G.__lxAudioFacade ?? (G.__lxAudioFacade = new AudioFacade());

// ── auto-unlock on the first user gesture (unlock() is idempotent, so an explicit call is still fine) ──
const GESTURES = ['pointerdown', 'pointerup', 'keydown', 'touchend', 'click'] as const;
const autoUnlock = (): void => {
  void audio.unlock();
};
function removeAutoUnlock(): void {
  if (typeof window === 'undefined') return;
  for (const ev of GESTURES) window.removeEventListener(ev, autoUnlock, true);
}
if (typeof window !== 'undefined') {
  for (const ev of GESTURES) window.addEventListener(ev, autoUnlock, { capture: true, passive: true });
}
