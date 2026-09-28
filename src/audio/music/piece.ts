/**
 * Piece = one running mood. Each piece owns its own step clock (so moods with
 * different tempi can crossfade cleanly, and tempo can slow to a stop), its
 * instruments (created on start, disposed after fade-out), intensity layers and
 * a note queue for pre-generated phrases.
 */
import {
  type AC, type Bank, type Fx, biquad, disposeFx, gainNode, holdAt, makeChorus, makeEcho, makeFilter, makeFormant, makeTremolo, noise,
  osc as mkOsc, panner, safeStop,
} from '../core/dsp';
import type { MelNote } from '../core/melody';
import { type NoteOpts, PATCH, type PatchName, type Spec, type Voice, killVoice, playSpec } from '../core/patches';
import { Rng, fx as hrng, rngFor } from '../core/rng';
import { type Chord, bassNote, clamp, mtof, voiceLead } from '../core/theory';
import type { MusicMood, Region } from '../types';

export interface MusicHost {
  ac: AC;
  bank: Bank;
  /** dry destination (bed, pre-duck) */
  dry: AudioNode;
  /** reverb send destination */
  wet: AudioNode;
}

export interface Step {
  i: number;
  time: number;
  grid: number;
  dur: number;
  bar: number;
  sib: number;
  beat: number;
  sub: number;
  spb: number;
  bpb: number;
  spbar: number;
  first: boolean;
}

export type FxKind =
  | 'chorus' | 'chorusWide' | 'formantA' | 'formantO' | 'formantU' | 'trem' | 'tremFast' | 'vibesTrem'
  | `lp:${number}` | `hp:${number}` | `echo:${number}:${number}`;

export interface InstCfg {
  patch: PatchName | Spec;
  vol?: number;
  pan?: number;
  wet?: number;
  max?: number;
  fx?: readonly FxKind[];
  layer?: string;
}

function buildFx(ac: AC, k: FxKind): Fx {
  if (k === 'chorus') return makeChorus(ac, 0.55, 2.4, 12, 0.5);
  if (k === 'chorusWide') return makeChorus(ac, 0.28, 4, 17, 0.7);
  if (k === 'formantA') return makeFormant(ac, 'a');
  if (k === 'formantO') return makeFormant(ac, 'o');
  if (k === 'formantU') return makeFormant(ac, 'u', 3.8);
  if (k === 'trem') return makeTremolo(ac, 11, 0.85);
  if (k === 'tremFast') return makeTremolo(ac, 14, 0.9);
  if (k === 'vibesTrem') return makeTremolo(ac, 5.4, 0.4);
  const [kind, a = '0', b = '0'] = k.split(':');
  if (kind === 'lp') return makeFilter(ac, 'lowpass', Number(a), 0.6);
  if (kind === 'hp') return makeFilter(ac, 'highpass', Number(a), 0.6);
  return makeEcho(ac, Number(a), Number(b), 0.32);
}

export class Inst {
  readonly spec: Spec;
  readonly input: GainNode;
  readonly out: GainNode;
  readonly send: GainNode;
  readonly layer: string;
  /** last pad voicing, for voice leading */
  voicing: number[] | null = null;
  lastBass: number | undefined = undefined;
  private readonly host: MusicHost;
  private readonly fx: Fx[] = [];
  private readonly extra: AudioNode[] = [];
  private voices: Voice[] = [];
  private readonly max: number;

  constructor(host: MusicHost, dry: AudioNode, wet: AudioNode, cfg: InstCfg) {
    const ac = host.ac;
    this.host = host;
    this.spec = typeof cfg.patch === 'string' ? PATCH[cfg.patch] : cfg.patch;
    this.input = gainNode(ac, cfg.vol ?? 1);
    let node: AudioNode = this.input;
    for (const k of cfg.fx ?? []) {
      const f = buildFx(ac, k);
      node.connect(f.input);
      node = f.output;
      this.fx.push(f);
    }
    if (cfg.pan) {
      const p = panner(ac, cfg.pan);
      node.connect(p);
      node = p;
      this.extra.push(p);
    }
    this.out = gainNode(ac, 1);
    node.connect(this.out);
    this.out.connect(dry);
    this.send = gainNode(ac, cfg.wet ?? 0.25);
    this.out.connect(this.send).connect(wet);
    this.layer = cfg.layer ?? 'base';
    this.max = cfg.max ?? 8;
  }

  play(t: number, midi: number, dur: number, vel: number, o?: NoteOpts): void {
    this.hz(t, mtof(midi), dur, vel, o);
  }

  hz(t: number, freq: number, dur: number, vel: number, o?: NoteOpts): void {
    if (!(freq > 10) || !(vel > 0)) return;
    this.voices = this.voices.filter((v) => v.end > t);
    if (this.voices.length >= this.max) {
      const old = this.voices.shift();
      if (old) killVoice(old, Math.max(t - 0.01, old.t));
    }
    this.voices.push(playSpec(this.host.ac, this.host.bank, this.input, this.spec, t, freq, Math.max(0.02, dur), clamp(vel, 0, 1.2), o));
  }

  /** Voice-led chord (pads). Returns the voicing played. */
  chord(t: number, tonic: number, ch: Chord, dur: number, vel: number, n: number, lo: number, hi: number, strum = 0, o?: NoteOpts): number[] {
    const v = voiceLead(tonic, ch, this.voicing, n, lo, hi);
    this.voicing = v;
    v.forEach((m, i) => this.play(t + i * strum + hrng.jit(0.004), m, dur, vel * (0.9 + hrng.next() * 0.15), o));
    return v;
  }

  bass(t: number, tonic: number, ch: Chord, dur: number, vel: number, lo: number, hi: number, o?: NoteOpts): number {
    const m = bassNote(tonic, ch, lo, hi, this.lastBass);
    this.lastBass = m;
    this.play(t, m, dur, vel, o);
    return m;
  }

  dispose(): void {
    for (const f of this.fx) disposeFx(f);
    for (const n of [this.input, this.out, this.send, ...this.extra]) {
      try {
        n.disconnect();
      } catch {
        /* ignore */
      }
    }
  }
}

/** Anything the note queue can play. */
export interface Player {
  readonly layer: string;
  play(t: number, midi: number, dur: number, vel: number, o?: NoteOpts): void;
}

/**
 * Monophonic voice with persistent oscillators/noise whose pitch & envelopes are
 * automated per note: zero node creation per note (ideal for 16th ostinatos,
 * basslines, hats, snares). Notes must not overlap (next note after release).
 */
export class Mono implements Player {
  readonly spec: Spec;
  readonly layer: string;
  readonly out: GainNode;
  private readonly host: MusicHost;
  private readonly oscs: OscillatorNode[] = [];
  private readonly pgs: GainNode[] = [];
  private readonly ratios: number[] = [];
  private readonly dets: number[] = [];
  private readonly vca: GainNode;
  private readonly flt: BiquadFilterNode | null = null;
  private readonly ng: GainNode | null = null;
  private readonly nf: BiquadFilterNode | null = null;
  private readonly srcs: AudioScheduledSourceNode[] = [];
  private readonly nodes: AudioNode[] = [];
  private lastT = 0;

  constructor(host: MusicHost, dry: AudioNode, wet: AudioNode, cfg: InstCfg) {
    const ac = host.ac;
    this.host = host;
    this.spec = typeof cfg.patch === 'string' ? PATCH[cfg.patch] : cfg.patch;
    this.layer = cfg.layer ?? 'base';
    const sp = this.spec;
    const input = gainNode(ac, cfg.vol ?? 1);
    this.vca = gainNode(ac, 0);
    let head: AudioNode = this.vca;
    if (sp.f) {
      const f = biquad(ac, sp.f.type ?? 'lowpass', sp.f.hz ?? 1000, sp.f.q ?? 0.707);
      f.connect(this.vca);
      this.flt = f;
      head = f;
      this.nodes.push(f);
    }
    const t0 = ac.currentTime;
    for (const p of sp.osc) {
      const o = mkOsc(ac, host.bank, p.w ?? 'sine', 440, t0, p.dt ?? 0);
      const g = gainNode(ac, p.tau !== undefined || p.a !== undefined ? 0 : p.g ?? 1);
      o.connect(g).connect(head);
      o.start(t0);
      this.oscs.push(o);
      this.pgs.push(g);
      this.ratios.push(p.fixed ? -p.fixed : p.r ?? 1);
      this.dets.push(p.dt ?? 0);
      this.srcs.push(o);
      this.nodes.push(g);
    }
    if (sp.noise) {
      const n = sp.noise;
      const src = noise(ac, host.bank, n.color ?? 'white', t0, Infinity);
      const nf = biquad(ac, n.type ?? 'bandpass', n.hz ?? 2000, n.q ?? 1);
      const ng = gainNode(ac, n.sustain ? n.g : 0);
      src.connect(nf).connect(ng).connect(n.sustain ? head : input);
      this.srcs.push(src);
      this.nodes.push(nf, ng);
      this.nf = nf;
      this.ng = n.sustain ? null : ng;
    }
    let node: AudioNode = this.vca;
    node.connect(input);
    node = input;
    if (cfg.pan) {
      const p = panner(ac, cfg.pan);
      node.connect(p);
      node = p;
      this.nodes.push(p);
    }
    this.out = gainNode(ac, 1);
    node.connect(this.out);
    this.out.connect(dry);
    const send = gainNode(ac, cfg.wet ?? 0.2);
    this.out.connect(send).connect(wet);
    this.nodes.push(this.vca, input, this.out, send);
  }

  play(t: number, midi: number, dur: number, vel: number, o?: NoteOpts): void {
    this.hz(t, mtof(midi), dur, vel, o);
  }

  hz(t: number, freq: number, dur: number, vel: number, o?: NoteOpts): void {
    if (!(vel > 0)) return;
    if (!(t > this.lastT)) t = this.lastT + 0.0005;
    this.lastT = t;
    const sp = this.spec;
    const nyq = this.host.ac.sampleRate * 0.45;
    const a = Math.max(0.0015, o?.attack ?? sp.a);
    const peak = clamp(vel, 0, 1.2) * (sp.gain ?? 0.5);
    this.oscs.forEach((osc, i) => {
      const r = this.ratios[i] ?? 1;
      osc.frequency.setValueAtTime(Math.min(r < 0 ? -r : freq * r, nyq), t);
      const p = sp.osc[i];
      const pg = this.pgs[i];
      if (p && pg && (p.tau !== undefined || p.a !== undefined)) {
        const pa = p.a ?? 0.002;
        pg.gain.setTargetAtTime(p.g ?? 1, t, pa / 3);
        if (p.tau !== undefined) pg.gain.setTargetAtTime(0, t + pa, Math.max(0.002, p.tau));
      }
      if (sp.pitch) {
        const d = this.dets[i] ?? 0;
        osc.detune.setValueAtTime(d + sp.pitch.cents, t);
        osc.detune.setTargetAtTime(d, t, sp.pitch.tau);
      }
    });
    if (this.flt && sp.f) {
      const f = sp.f;
      const cut = clamp((f.hz ?? freq * (f.mul ?? 4)) * (1 + (vel - 0.7) * (f.vel ?? 0.6)), f.min ?? 40, Math.min(f.max ?? 16000, nyq));
      if (f.env !== undefined && f.env !== 1) {
        this.flt.frequency.setValueAtTime(clamp(cut * f.env, 30, nyq), t);
        this.flt.frequency.setTargetAtTime(cut, t, Math.max(0.002, f.envTau ?? 0.1));
      } else this.flt.frequency.setValueAtTime(cut, t);
    }
    if (this.nf && sp.noise && sp.noise.mul) this.nf.frequency.setValueAtTime(Math.min(freq * sp.noise.mul, nyq), t);
    const g = this.vca.gain;
    g.setTargetAtTime(peak, t, a / 3);
    if (sp.s === undefined) g.setTargetAtTime(0, t + a, Math.max(0.002, (sp.tau ?? 0.2) * (o?.decay ?? 1)));
    else {
      if (sp.s < 1) g.setTargetAtTime(peak * sp.s, t + a, Math.max(0.002, sp.d ?? 0.2));
      g.setTargetAtTime(0, t + Math.max(dur, a + 0.002), Math.max(0.002, sp.r));
    }
    if (this.ng && sp.noise) {
      const n = sp.noise;
      this.ng.gain.setTargetAtTime(n.g * vel, t, Math.max(0.0003, (n.a ?? 0.001) / 3));
      this.ng.gain.setTargetAtTime(0, t + (n.a ?? 0.001), Math.max(0.001, n.tau ?? 0.02));
    }
  }

  dispose(): void {
    for (const s of this.srcs) safeStop(s, 0);
    for (const n of this.nodes) {
      try {
        n.disconnect();
      } catch {
        /* ignore */
      }
    }
  }
}

interface Queued {
  inst: Player;
  midi: number;
  steps: number;
  vel: number;
  o?: NoteOpts;
  off?: number;
}

const FADE_N = 48;
const FADE_IN = new Float32Array(FADE_N);
for (let i = 0; i < FADE_N; i++) FADE_IN[i] = Math.sin(((i / (FADE_N - 1)) * Math.PI) / 2);

export abstract class Piece {
  readonly mood: MusicMood;
  readonly region: Region;
  readonly host: MusicHost;
  /** phase-lock family: siblings with the same family continue each other's bar grid */
  family = '';
  bpm = 100;
  spb = 4;
  bpb = 4;
  /** 0.5 = straight; 0.66 = triplet swing (applies to odd steps when spb is 2 or 4) */
  swing = 0.5;
  seed: number;
  stepIndex = 0;
  nextTime = 0;
  tempoScale = 1;
  done = false;
  dead = false;
  stopAt = Infinity;
  killAt = Infinity;
  protected intensity = 0;
  protected levelsNow: Record<string, number> = { base: 1 };
  protected readonly dry: GainNode;
  protected readonly wet: GainNode;
  protected readonly insts: Inst[] = [];
  protected readonly monos: Mono[] = [];
  private readonly faderDry: GainNode;
  private readonly faderWet: GainNode;
  private readonly queue = new Map<number, Queued[]>();

  constructor(host: MusicHost, mood: MusicMood, region: Region, seed: number) {
    this.host = host;
    this.mood = mood;
    this.region = region;
    this.seed = seed;
    const ac = host.ac;
    this.dry = gainNode(ac, 1);
    this.wet = gainNode(ac, 1);
    this.faderDry = gainNode(ac, 0);
    this.faderWet = gainNode(ac, 0);
    this.dry.connect(this.faderDry).connect(host.dry);
    this.wet.connect(this.faderWet).connect(host.wet);
  }

  get ac(): AC {
    return this.host.ac;
  }

  /** Output trim (linear) */
  set trim(v: number) {
    this.dry.gain.value = v;
    this.wet.gain.value = v;
  }

  protected inst(cfg: InstCfg): Inst {
    const i = new Inst(this.host, this.dry, this.wet, cfg);
    this.insts.push(i);
    return i;
  }

  /** Monophonic, allocation-free voice for fast non-overlapping lines. */
  protected mono(cfg: InstCfg): Mono {
    const m = new Mono(this.host, this.dry, this.wet, cfg);
    this.monos.push(m);
    return m;
  }

  protected rng(...keys: readonly (number | string)[]): Rng {
    return rngFor(this.seed, ...keys);
  }

  /** Map intensity (0..1) to layer levels. Override per piece. */
  protected levels(_x: number): Record<string, number> {
    return { base: 1 };
  }

  protected on(layer: string): boolean {
    return (this.levelsNow[layer] ?? 1) > 0.02;
  }

  setIntensity(v: number, t: number): void {
    this.intensity = clamp(v, 0, 1);
    this.levelsNow = { base: 1, ...this.levels(this.intensity) };
    for (const i of [...this.insts, ...this.monos]) {
      const target = this.levelsNow[i.layer] ?? 1;
      holdAt(i.out.gain, t);
      i.out.gain.setTargetAtTime(target, t, 0.45);
    }
  }

  /** Apply the current layer levels immediately (at start). */
  protected applyLevelsNow(): void {
    this.levelsNow = { base: 1, ...this.levels(this.intensity) };
    for (const i of [...this.insts, ...this.monos]) i.out.gain.value = this.levelsNow[i.layer] ?? 1;
  }

  start(t: number, fade: number, intensity: number): void {
    this.intensity = clamp(intensity, 0, 1);
    this.applyLevelsNow();
    if (this.nextTime < t) this.nextTime = t;
    for (const g of [this.faderDry.gain, this.faderWet.gain]) {
      if (fade > 0.02) g.setValueCurveAtTime(FADE_IN, t, fade);
      else g.setValueAtTime(1, t);
    }
  }

  /** Continue a sibling's bar grid (same seed, same position) for seamless variations. */
  syncFrom(o: Piece): void {
    this.seed = o.seed;
    this.stepIndex = o.stepIndex;
    this.nextTime = o.nextTime;
  }

  stop(t: number, fade: number): void {
    const f = Math.max(0.05, fade);
    for (const g of [this.faderDry.gain, this.faderWet.gain]) {
      holdAt(g, t);
      g.linearRampToValueAtTime(0, t + f);
    }
    this.stopAt = Math.min(this.stopAt, t + f);
    this.killAt = t + f + 4;
  }

  schedule(horizon: number, now: number): void {
    if (this.dead || this.done) return;
    let guard = 0;
    while (this.nextTime < horizon && guard++ < 512) {
      if (this.nextTime >= this.stopAt) {
        this.done = true;
        this.queue.clear();
        return;
      }
      if (now - this.nextTime > 0.2) {
        // fell behind (main thread stall): jump forward on the grid, skip the missed notes
        const sd = this.stepDur();
        const missed = Math.ceil((now - this.nextTime) / sd);
        for (let k = 0; k < missed; k++) this.queue.delete(this.stepIndex + k);
        this.stepIndex += missed;
        this.nextTime += missed * sd;
        continue;
      }
      const st = this.makeStep();
      try {
        if (st.first) this.onBar(st);
        this.onStep(st);
        this.flush(st);
      } catch (err) {
        console.warn('[audio] piece step', this.mood, err);
      }
      this.stepIndex++;
      this.nextTime += st.dur;
    }
  }

  protected stepDur(): number {
    return 60 / (this.bpm * this.tempoScale) / this.spb;
  }

  protected makeStep(): Step {
    const spbar = this.spb * this.bpb;
    const i = this.stepIndex;
    const sib = i % spbar;
    const bar = Math.floor(i / spbar);
    const beat = Math.floor(sib / this.spb);
    const sub = sib % this.spb;
    const dur = this.stepDur();
    let time = this.nextTime;
    if (this.swing > 0.5 && (this.spb === 2 || this.spb === 4) && sub % 2 === 1) time += (this.swing - 0.5) * 2 * dur;
    return { i, time, grid: this.nextTime, dur, bar, sib, beat, sub, spb: this.spb, bpb: this.bpb, spbar, first: sib === 0 };
  }

  /** Queue a note at an absolute step index. */
  protected at(step: number, inst: Player, midi: number, steps: number, vel: number, o?: NoteOpts, off?: number): void {
    let arr = this.queue.get(step);
    if (!arr) {
      arr = [];
      this.queue.set(step, arr);
    }
    const q: Queued = { inst, midi, steps, vel };
    if (o) q.o = o;
    if (off !== undefined) q.off = off;
    arr.push(q);
  }

  /** Queue a whole phrase starting at absolute step `start`. */
  protected phrase(start: number, inst: Player, notes: readonly MelNote[], velMul = 1, transpose = 0, o?: NoteOpts): void {
    for (const n of notes) this.at(start + n.at, inst, n.midi + transpose, n.dur, n.vel * velMul, o);
  }

  private flush(s: Step): void {
    const arr = this.queue.get(s.i);
    if (!arr) return;
    this.queue.delete(s.i);
    for (const q of arr) {
      if (!this.on(q.inst.layer)) continue; // layer muted by intensity: don't synthesize it
      q.inst.play(s.time + (q.off ?? 0) * s.dur + hrng.jit(0.005), q.midi, q.steps * s.dur * 0.98, q.vel, q.o);
    }
  }

  abstract onStep(s: Step): void;
  onBar(_s: Step): void {}

  /** Humanized time */
  protected h(t: number, amt = 0.006): number {
    return t + hrng.jit(amt);
  }

  /** Humanized velocity */
  protected v(x: number, amt = 0.06): number {
    return clamp(x + hrng.jit(amt), 0.05, 1.1);
  }

  dispose(): void {
    this.dead = true;
    this.queue.clear();
    for (const i of this.insts) i.dispose();
    for (const m of this.monos) m.dispose();
    for (const n of [this.dry, this.wet, this.faderDry, this.faderWet]) {
      try {
        n.disconnect();
      } catch {
        /* ignore */
      }
    }
  }
}

/** Chord inside a bar that may hold several chords (evenly split). */
export function chordIn(bar: readonly Chord[], sib: number, spbar: number): Chord {
  const n = Math.max(1, bar.length);
  const idx = Math.min(n - 1, Math.floor((sib / spbar) * n));
  return bar[idx] as Chord;
}

export const newRng = (seed: number): Rng => new Rng(seed);
