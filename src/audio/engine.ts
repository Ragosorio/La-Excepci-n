/**
 * The audio engine (loaded lazily by index.ts on unlock).
 *
 * Graph:
 *   pieces ─dry─> bedDuckDry ─┐
 *          └wet─> bedDuckWet ─> musicVerb ─┤
 *   stingers ─dry/wet────────────────────> musicVol ─┐
 *   sfx ─dry─> sfxVol ─────────────────────────────────┤
 *       └wet─> sfxWetVol ─> fxVerb ──────────────────────┤
 *   ambience ─dry─> ambVol ────────────────────────────────┤
 *            └wet─> ambWetVol ─> fxVerb                      │
 *   master (volume × mute) -> glue comp -> limiter -> soft clip -> speakers
 *
 * Timing: Tone.js provides the context wrapper and its worker-driven ticker
 * (not throttled like setInterval); each music piece runs its own lookahead step
 * clock on it, so moods with different tempi crossfade cleanly.
 */
import * as Tone from 'tone';
import { AmbienceMgr } from './ambience';
import { type Bank, gainNode, getBank, glide, makeImpulse, shaper } from './core/dsp';
import { mix } from './core/rng';
import { type MusicHost, type Piece, createPiece, regionMatters } from './music';
import { type Prefs, sliderToGain } from './prefs';
import { Sfx } from './sfx';
import { Speech } from './speech';
import { Stingers } from './stingers';
import type { Ambience, MusicMood, Region, SfxName, SfxOpts, StingerName } from './types';

const LOOKAHEAD = 0.2;

interface Duck { amount: number; until: number; kind: 'manual' | 'stinger' | 'speech' }

export interface EngineDebug {
  state: string;
  time: number;
  mood: MusicMood;
  region: Region;
  pieces: number;
  sfxVoices: number;
  ambience: Ambience[];
  intensity: number;
  duck: number;
  sampleRate: number;
  baseLatency: number;
}

export class Engine {
  readonly ctx: AudioContext;
  readonly bank: Bank;
  private readonly prefs: Prefs;
  private readonly master: GainNode;
  private readonly musicVol: GainNode;
  private readonly bedDry: GainNode;
  private readonly bedWet: GainNode;
  private readonly sfxVol: GainNode;
  private readonly sfxWetVol: GainNode;
  private readonly ambVol: GainNode;
  private readonly ambWetVol: GainNode;
  private readonly musicHost: MusicHost;
  private readonly sfxM: Sfx;
  private readonly stingM: Stingers;
  private readonly ambM: AmbienceMgr;
  private readonly speech: Speech;
  private pieces: Piece[] = [];
  private current: Piece | null = null;
  private musicKey = '';
  private mood: MusicMood = 'silence';
  private region: Region = 'valdoria';
  private intensity = 0;
  private ducks: Duck[] = [];
  private duckLevel = 1;
  private readonly sessionSeed = (Math.random() * 2147483647) >>> 0;
  private lastLoop = 0;
  private readonly watchdog: ReturnType<typeof setInterval>;
  /** final output (after limiter/clip), for meters */
  private readonly outNode: AudioNode;
  private meterNode: AnalyserNode | null = null;
  private meterBuf: Float32Array<ArrayBuffer> | null = null;

  constructor(ctx: AudioContext, prefs: Prefs) {
    this.ctx = ctx;
    this.prefs = prefs;
    try {
      Tone.setContext(ctx, true);
      const tctx = Tone.getContext();
      tctx.lookAhead = 0.05;
      tctx.on('tick', this.loop);
    } catch (err) {
      console.warn('[audio] Tone context setup failed; using fallback timer', err);
    }
    const ac = ctx;
    const bank = getBank(ac);
    this.bank = bank;

    // ── master chain ──
    this.master = gainNode(ac, 0);
    const glue = ac.createDynamicsCompressor();
    // gentle glue (note: WebAudio compressors add automatic makeup gain ≈ 0.6 × max reduction)
    glue.threshold.value = -12;
    glue.knee.value = 12;
    glue.ratio.value = 2;
    glue.attack.value = 0.012;
    glue.release.value = 0.25;
    const limiter = ac.createDynamicsCompressor();
    limiter.threshold.value = -3;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.12;
    const clip = shaper(ac, bank.curves.soft);
    this.master.connect(glue).connect(limiter).connect(clip).connect(ac.destination);
    this.outNode = clip;

    // ── reverbs ──
    const musicVerb = ac.createConvolver();
    const fxVerb = ac.createConvolver();
    // impulses are generated right after the unlocking gesture returns (keeps the first click hitch-free)
    setTimeout(() => {
      try {
        musicVerb.buffer = makeImpulse(ac, { seconds: 3.4, rt60: 2.9, predelay: 0.025, damp: 0.55, seed: 11 });
        fxVerb.buffer = makeImpulse(ac, { seconds: 2, rt60: 1.5, predelay: 0.01, damp: 0.45, seed: 23 });
      } catch (err) {
        console.warn('[audio] reverb', err);
      }
    }, 0);

    // ── music ──
    this.musicVol = gainNode(ac, 0);
    this.musicVol.connect(this.master);
    this.bedDry = gainNode(ac, 1);
    this.bedWet = gainNode(ac, 1);
    this.bedDry.connect(this.musicVol);
    this.bedWet.connect(musicVerb);
    const verbRet = gainNode(ac, 0.85);
    musicVerb.connect(verbRet).connect(this.musicVol);
    const stDry = gainNode(ac, 1);
    const stWet = gainNode(ac, 1);
    stDry.connect(this.musicVol);
    stWet.connect(musicVerb);
    this.musicHost = { ac, bank, dry: this.bedDry, wet: this.bedWet };

    // ── sfx ──
    this.sfxVol = gainNode(ac, 0);
    this.sfxVol.connect(this.master);
    const sfxDry = gainNode(ac, 1);
    sfxDry.connect(this.sfxVol);
    this.sfxWetVol = gainNode(ac, 0);
    const sfxWet = gainNode(ac, 1);
    sfxWet.connect(this.sfxWetVol).connect(fxVerb);
    const fxRet = gainNode(ac, 0.8);
    fxVerb.connect(fxRet).connect(this.master);

    // ── ambience ──
    this.ambVol = gainNode(ac, 0);
    this.ambVol.connect(this.master);
    const ambDry = gainNode(ac, 1);
    ambDry.connect(this.ambVol);
    this.ambWetVol = gainNode(ac, 0);
    const ambWet = gainNode(ac, 1);
    ambWet.connect(this.ambWetVol).connect(fxVerb);

    this.sfxM = new Sfx({ ac, bank, dry: sfxDry, wet: sfxWet });
    this.stingM = new Stingers({ ac, bank, dry: stDry, wet: stWet });
    this.ambM = new AmbienceMgr({ ac, bank, dry: ambDry, wet: ambWet });
    this.speech = new Speech();

    this.applyVolumes();

    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this.onVisibility);
    if (typeof window !== 'undefined') {
      for (const ev of ['pointerdown', 'keydown', 'touchend'] as const) window.addEventListener(ev, this.onGesture, { capture: true, passive: true });
    }
    // safety net if the Tone ticker ever stalls (main-thread timer, only acts when needed)
    this.watchdog = setInterval(() => {
      if (performance.now() - this.lastLoop > 300) this.loop();
    }, 120);
    if (import.meta.env?.DEV) (globalThis as unknown as { __lxAudioEngine?: Engine }).__lxAudioEngine = this;
  }

  // ───────────────────────────── scheduler ─────────────────────────────

  private readonly loop = (): void => {
    this.lastLoop = performance.now();
    const ac = this.ctx;
    if (ac.state !== 'running') return;
    const now = ac.currentTime;
    const horizon = now + LOOKAHEAD;
    try {
      for (const p of this.pieces) p.schedule(horizon, now);
      if (this.pieces.some((p) => now > p.killAt)) {
        this.pieces = this.pieces.filter((p) => {
          if (now > p.killAt) {
            p.dispose();
            return false;
          }
          return true;
        });
      }
      this.ambM.tick(now, horizon);
      this.updateDuck(now);
      this.sfxM.gc(now);
    } catch (err) {
      console.warn('[audio] loop', err);
    }
  };

  private readonly onVisibility = (): void => {
    try {
      if (document.hidden) {
        if (this.ctx.state === 'running') void this.ctx.suspend().catch(() => undefined);
      } else void this.ctx.resume().catch(() => undefined);
    } catch {
      /* ignore */
    }
  };

  private readonly onGesture = (): void => {
    if (this.ctx.state !== 'running' && !(typeof document !== 'undefined' && document.hidden)) void this.ctx.resume().catch(() => undefined);
  };

  resume(): void {
    this.onGesture();
  }

  // ───────────────────────────── music ─────────────────────────────

  music(mood: MusicMood, region?: Region, fade?: number): void {
    if (region) this.region = region;
    const reg = this.region;
    const key = mood + (regionMatters(mood) ? ':' + reg : '');
    if (key === this.musicKey) return;
    this.musicKey = key;
    this.mood = mood;
    const now = this.ctx.currentTime;
    const f = Math.max(0, Math.min(20, Number.isFinite(fade) ? (fade as number) : 2));
    const old = this.current;
    this.current = null;
    if (old) old.stop(now + 0.02, f);
    if (mood === 'silence') return;
    // siblings share a seed so their harmony/theme line up (day/night, prologue/dark)
    const seedKey = mood === 'overworld_night' ? 'overworld' : mood === 'prologue_dark' ? 'prologue' : mood;
    const seed = mix(this.sessionSeed, seedKey, regionMatters(mood) ? reg : '');
    let p: Piece | null = null;
    try {
      p = createPiece(this.musicHost, mood, reg, seed);
    } catch (err) {
      console.warn('[audio] piece', mood, err);
    }
    if (!p) return;
    if (old && old.family && old.family === p.family && !old.done) p.syncFrom(old);
    p.start(now + 0.03, f, this.intensity);
    p.schedule(now + LOOKAHEAD, now);
    this.current = p;
    this.pieces.push(p);
  }

  setIntensity(v: number): void {
    this.intensity = Math.max(0, Math.min(1, v));
    this.current?.setIntensity(this.intensity, this.ctx.currentTime);
  }

  // ───────────────────────────── sfx / stingers / ambience ─────────────────────────────

  private audible(bus: 'sfx' | 'music' | 'ambience'): boolean {
    return this.ctx.state === 'running' && !this.prefs.muted && this.prefs.master > 0.001 && this.prefs[bus] > 0.001;
  }

  sfx(name: SfxName, opts?: SfxOpts): void {
    if (!this.audible('sfx')) return;
    this.sfxM.play(name, opts);
  }

  stinger(name: StingerName): void {
    if (!this.audible('music')) return;
    const d = this.stingM.play(name);
    if (d > 0) {
      const now = this.ctx.currentTime;
      this.ducks.push({ amount: 0.62, until: now + d * 0.85, kind: 'stinger' });
      this.updateDuck(now);
    }
  }

  ambience(name: Ambience, on: boolean, volume?: number): void {
    this.ambM.set(name, on, volume ?? 1);
  }

  // ───────────────────────────── mixing ─────────────────────────────

  applyVolumes(): void {
    const p = this.prefs;
    const now = this.ctx.currentTime;
    const m = p.muted ? 0 : sliderToGain(p.master);
    glide(this.master.gain, m, now, 0.04);
    glide(this.musicVol.gain, sliderToGain(p.music), now, 0.06);
    const s = sliderToGain(p.sfx);
    glide(this.sfxVol.gain, s, now, 0.04);
    glide(this.sfxWetVol.gain, s, now, 0.04);
    const a = sliderToGain(p.ambience);
    glide(this.ambVol.gain, a, now, 0.06);
    glide(this.ambWetVol.gain, a, now, 0.06);
    if (p.muted) this.speech.stop();
  }

  duck(amount: number, seconds: number): void {
    const now = this.ctx.currentTime;
    if (!(seconds > 0)) {
      this.ducks = this.ducks.filter((d) => d.kind !== 'manual');
    } else {
      this.ducks.push({ amount: Math.max(0, Math.min(1, Number.isFinite(amount) ? amount : 0)), until: now + seconds, kind: 'manual' });
    }
    this.updateDuck(now);
  }

  private updateDuck(now: number): void {
    if (this.ducks.length) this.ducks = this.ducks.filter((d) => d.until > now);
    let a = 0;
    for (const d of this.ducks) a = Math.max(a, d.amount);
    const target = 1 - a;
    if (Math.abs(target - this.duckLevel) < 0.002) return;
    const down = target < this.duckLevel;
    glide(this.bedDry.gain, target, now, down ? 0.05 : 0.3);
    glide(this.bedWet.gain, target, now, down ? 0.05 : 0.3);
    this.duckLevel = target;
  }

  speak(text: string, opts?: { pitch?: number; rate?: number }): void {
    if (!this.prefs.voice || this.prefs.muted) return;
    const vol = Math.min(1, sliderToGain(this.prefs.master) * 1.2 + 0.05);
    const d = this.speech.speak(text, opts, vol);
    if (d > 0) {
      const now = this.ctx.currentTime;
      this.ducks.push({ amount: 0.5, until: now + d, kind: 'speech' });
      this.updateDuck(now);
    }
  }

  stopSpeech(): void {
    this.speech.stop();
  }

  /** Output level (dBFS rms / peak over the last ~43 ms) — for dev meters. */
  meter(): { rms: number; peak: number } {
    if (!this.meterNode) {
      this.meterNode = this.ctx.createAnalyser();
      this.meterNode.fftSize = 2048;
      this.meterBuf = new Float32Array(2048);
      this.outNode.connect(this.meterNode);
    }
    const buf = this.meterBuf as Float32Array<ArrayBuffer>;
    this.meterNode.getFloatTimeDomainData(buf);
    let s = 0;
    let p = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = buf[i] as number;
      s += v * v;
      if (Math.abs(v) > p) p = Math.abs(v);
    }
    const db = (x: number): number => (x > 1e-9 ? 20 * Math.log10(x) : -120);
    return { rms: db(Math.sqrt(s / buf.length)), peak: db(p) };
  }

  debug(): EngineDebug {
    return {
      state: this.ctx.state,
      time: this.ctx.currentTime,
      mood: this.mood,
      region: this.region,
      pieces: this.pieces.length,
      sfxVoices: this.sfxM.active,
      ambience: this.ambM.active,
      intensity: this.intensity,
      duck: this.duckLevel,
      sampleRate: this.ctx.sampleRate,
      baseLatency: this.ctx.baseLatency ?? 0,
    };
  }

  /** Not used by the game; handy for tests/HMR. */
  dispose(): void {
    clearInterval(this.watchdog);
    try {
      Tone.getContext().off('tick', this.loop);
    } catch {
      /* ignore */
    }
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.onVisibility);
    for (const p of this.pieces) p.dispose();
    this.pieces = [];
    void this.ctx.close().catch(() => undefined);
  }
}
