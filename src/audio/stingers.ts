/**
 * Stingers: short scored musical phrases (1–6 s) played over the music bed,
 * which is ducked while they sound. Several are built from the leitmotif.
 */
import { type AC, type Bank, type Vowel, gainNode, makeEcho, makeFormant, noise, biquad, cleanupOnEnd, disposeFx } from './core/dsp';
import { PATCH, type Spec, playSpec } from './core/patches';
import { MOTIF_RHYTHM, type Rhythm, motifChromatic, mtof } from './core/theory';
import type { StingerName } from './types';

export interface StingerHost {
  ac: AC;
  bank: Bank;
  dry: AudioNode;
  wet: AudioNode;
}

const REV_CYM: Spec = {
  osc: [], a: 0.5, d: 1, s: 1, r: 0.015, gain: 0.16,
  noise: { color: 'white', g: 1, type: 'highpass', hz: 4200, q: 0.6, sustain: true },
};
const REV_BELL: Spec = {
  osc: [{ w: 'sine' }, { w: 'sine', r: 4, g: 0.25 }, { w: 'sine', r: 2.76, g: 0.18 }],
  a: 0.4, d: 1, s: 1, r: 0.02, gain: 0.3,
};
const CHOIR: Spec = PATCH.choir;
const BOX: Spec = PATCH.musicbox;

class Score {
  readonly ac: AC;
  readonly bank: Bank;
  readonly t0: number;
  readonly out: GainNode;
  readonly send: GainNode;
  private readonly cleanup: Array<() => void> = [];

  constructor(host: StingerHost, wet: number, trimDb = 0) {
    this.ac = host.ac;
    this.bank = host.bank;
    this.t0 = host.ac.currentTime + 0.02;
    this.out = gainNode(host.ac, Math.pow(10, trimDb / 20));
    this.send = gainNode(host.ac, wet);
    this.out.connect(host.dry);
    this.out.connect(this.send).connect(host.wet);
  }

  n(at: number, spec: Spec, m: number, dur: number, vel: number, o?: { pan?: number; detune?: number; attack?: number; dest?: AudioNode }): number {
    const opts: { pan?: number; detune?: number; attack?: number } = {};
    if (o?.pan !== undefined) opts.pan = o.pan;
    if (o?.detune !== undefined) opts.detune = o.detune;
    if (o?.attack !== undefined) opts.attack = o.attack;
    return playSpec(this.ac, this.bank, o?.dest ?? this.out, spec, this.t0 + at, mtof(m), dur, vel, opts).end;
  }

  chord(at: number, spec: Spec, ms: readonly number[], dur: number, vel: number, strum = 0, dest?: AudioNode): void {
    ms.forEach((m, i) => this.n(at + i * strum, spec, m, dur, vel * (0.92 + i * 0.03), dest ? { dest } : undefined));
  }

  /** a formant-filtered choir bus */
  vowel(v: Vowel): GainNode {
    const f = makeFormant(this.ac, v, 3);
    f.output.connect(this.out);
    const g = gainNode(this.ac, 1);
    g.connect(f.input);
    this.cleanup.push(() => disposeFx(f));
    return g;
  }

  echo(time: number, fb: number): GainNode {
    const e = makeEcho(this.ac, time, fb, 0.45, 2600);
    e.output.connect(this.out);
    const g = gainNode(this.ac, 1);
    g.connect(e.input);
    this.cleanup.push(() => disposeFx(e));
    return g;
  }

  boom(at: number, m: number, vel: number): void {
    this.n(at, PATCH.sub, m, 1.5, vel);
    this.n(at, PATCH.taiko, m + 5, 1, vel * 0.8);
  }

  revCym(at: number, len: number, vel: number): void {
    this.n(at, REV_CYM, 60, len, vel, { attack: len });
  }

  roll(at: number, len: number, m: number, from: number, to: number): void {
    const n = Math.floor(len / 0.055);
    for (let i = 0; i < n; i++) this.n(at + i * 0.055, PATCH.timpani, m, 0.3, from + (to - from) * (i / n));
  }

  gliss(at: number, len: number, notes: readonly number[], spec: Spec = PATCH.harp, vel = 0.4): void {
    notes.forEach((m, i) => this.n(at + (i / notes.length) * len, spec, m, 0.8, vel * (0.6 + 0.4 * (i / notes.length))));
  }

  motif(at: number, pitches: readonly number[], r: Rhythm, step: number, spec: Spec, vel: number, dest?: AudioNode, detune = 0): number {
    let end = at;
    r.forEach(([on, d], i) => {
      const m = pitches[i];
      if (m === undefined) return;
      const o: { dest?: AudioNode; detune?: number } = {};
      if (dest) o.dest = dest;
      if (detune) o.detune = detune;
      this.n(at + on * step, spec, m, d * step, vel * (i === 0 || i === 3 || i === 5 ? 1.08 : 0.92), o);
      end = at + (on + d) * step;
    });
    return end;
  }

  noiseSwell(at: number, len: number, from: number, to: number, vel: number): void {
    const t = this.t0 + at;
    const src = noise(this.ac, this.bank, 'pink', t, len + 0.05);
    const f = biquad(this.ac, 'bandpass', from, 1.2, t);
    f.frequency.exponentialRampToValueAtTime(to, t + len);
    const g = this.ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vel, t + len);
    g.gain.linearRampToValueAtTime(0, t + len + 0.02);
    src.connect(f).connect(g).connect(this.out);
    cleanupOnEnd(src, g);
  }

  finish(total: number): number {
    const fns = this.cleanup;
    const out = this.out;
    const send = this.send;
    setTimeout(() => {
      for (const fn of fns) fn();
      try {
        out.disconnect();
        send.disconnect();
      } catch {
        /* ignore */
      }
    }, (total + 6) * 1000);
    return total;
  }
}

type StingerFn = (s: Score) => number;

const A = 57; // A3

const STINGERS: Record<StingerName, { wet: number; trim: number; fn: StingerFn }> = {
  excepcion: {
    trim: -7,
    wet: 0.55,
    fn: (s) => {
      s.revCym(0, 0.5, 0.9);
      s.noiseSwell(0, 0.5, 400, 5000, 0.2);
      s.boom(0.5, A - 24, 1);
      s.chord(0.5, PATCH.stab, [A, A + 3, A + 7, A + 12], 0.35, 0.85);
      const ch = s.vowel('a');
      s.chord(0.5, CHOIR, [A - 12, A + 7, A + 12, A + 15], 0.75, 0.75, 0, ch);
      s.chord(1.25, CHOIR, [A - 16, A + 8, A + 12, A + 15], 0.75, 0.75, 0, ch);
      s.chord(2.0, CHOIR, [A - 17, A + 7, A + 11, A + 14], 1.4, 0.8, 0, ch);
      // the core, as a flash of bells
      [A + 31, A + 32, A + 31, A + 27, A + 26].forEach((m, i) => s.n(0.52 + i * 0.07, PATCH.glock, m, 0.3, 0.55, { pan: -0.4 + i * 0.2 }));
      s.chord(1.25, PATCH.brass, [A - 4, A + 3, A + 8], 0.7, 0.55);
      s.n(2.0, PATCH.brass, A + 14, 1.4, 0.75);
      s.chord(2.0, PATCH.brass, [A - 5, A - 1, A + 2], 1.4, 0.5);
      s.roll(2.0, 1.2, A - 17, 0.2, 0.7);
      s.boom(2.0, A - 29, 0.8);
      return s.finish(3.6);
    },
  },
  victory: {
    trim: -8.5,
    wet: 0.4,
    fn: (s) => {
      const C = 60;
      [0, 0.12, 0.24].forEach((at) => s.n(at, PATCH.brass, C + 7, 0.1, 0.7));
      s.n(0.36, PATCH.brass, C + 12, 0.42, 0.9);
      s.chord(0.36, PATCH.strings, [C - 12, C + 4, C + 7], 0.5, 0.6);
      s.n(0.36, PATCH.timpani, C - 24, 0.5, 0.9);
      s.n(0.82, PATCH.brass, C + 10, 0.16, 0.7);
      s.chord(1.0, PATCH.brass, [C - 4, C, C + 3, C + 8], 0.38, 0.72); // bVI
      s.n(1.0, PATCH.timpani, C - 28, 0.3, 0.7);
      s.chord(1.4, PATCH.brass, [C - 2, C + 2, C + 5, C + 10], 0.38, 0.75); // bVII
      s.n(1.4, PATCH.timpani, C - 26, 0.3, 0.75);
      s.chord(1.8, PATCH.brass, [C - 12, C, C + 4, C + 7, C + 12], 1.3, 0.85); // I
      s.chord(1.8, PATCH.strings, [C - 5, C + 4, C + 7, C + 16], 1.4, 0.6);
      s.roll(1.8, 1.0, C - 24, 0.3, 0.8);
      s.n(1.8, PATCH.crash, 60, 1.5, 0.7);
      s.gliss(1.75, 0.35, [C + 12, C + 14, C + 16, C + 19, C + 21, C + 24, C + 26, C + 28, C + 31, C + 36]);
      return s.finish(3.3);
    },
  },
  defeat: {
    trim: -4,
    wet: 0.6,
    fn: (s) => {
      const ch = s.vowel('u');
      const line = [A + 19, A + 17, A + 15, A + 14];
      const chords = [[A - 12, A + 3, A + 7], [A - 10, A + 5, A + 10], [A - 16, A + 3, A + 8], [A - 17, A + 2, A + 7]];
      line.forEach((m, i) => {
        s.n(i * 0.7, PATCH.strings, m, 0.75, 0.6);
        s.chord(i * 0.7, PATCH.strings_warm, chords[i] ?? [], 0.8, 0.45);
      });
      s.n(0.0, PATCH.horn, A + 7, 2.6, 0.5);
      s.chord(2.8, CHOIR, [A - 12, A, A + 3, A + 7], 1.6, 0.6, 0, ch);
      s.n(2.8, PATCH.bell, A - 12, 3, 0.55);
      s.n(2.8, PATCH.timpani, A - 24, 1, 0.5);
      return s.finish(4.6);
    },
  },
  discovery: {
    trim: -3.5,
    wet: 0.5,
    fn: (s) => {
      const D = 74;
      [D, D + 4, D + 7, D + 11, D + 14].forEach((m, i) => s.n(i * 0.085, PATCH.harp, m, 0.8, 0.6, { pan: -0.4 + i * 0.2 }));
      [D + 12, D + 16, D + 19, D + 23].forEach((m, i) => s.n(0.1 + i * 0.085, PATCH.celesta, m, 0.8, 0.45));
      s.chord(0.35, PATCH.strings_warm, [D - 12, D - 5, D + 4, D + 11], 1.4, 0.45);
      s.n(0.45, PATCH.glock, D + 26, 0.8, 0.45);
      return s.finish(2.2);
    },
  },
  relic_found: {
    trim: -7.5,
    wet: 0.65,
    fn: (s) => {
      const F = 65;
      const ch = s.vowel('a');
      s.revCym(0, 0.8, 0.8);
      s.chord(0, CHOIR, [F - 12, F, F + 4, F + 7, F + 11], 0.8, 0.5, 0, ch);
      s.chord(0.8, CHOIR, [F - 12, F + 4, F + 6, F + 11, F + 14], 1.6, 0.6, 0, ch);
      s.boom(0.8, F - 24, 0.8);
      [F + 24, F + 28, F + 30, F + 35, F + 36].forEach((m, i) => s.n(0.85 + i * 0.1, PATCH.glock, m, 0.6, 0.5, { pan: -0.5 + i * 0.25 }));
      s.gliss(0.8, 0.5, [F, F + 2, F + 4, F + 6, F + 7, F + 9, F + 11, F + 12, F + 14, F + 16, F + 18, F + 19, F + 21, F + 23, F + 24]);
      s.chord(0.8, PATCH.strings_warm, [F - 12, F - 5, F + 4, F + 6], 2, 0.5);
      return s.finish(3.4);
    },
  },
  corruption_complete: {
    trim: -8,
    wet: 0.6,
    fn: (s) => {
      const D = 62;
      [D, D + 1, D + 2, D + 3, D + 6].forEach((m, i) => s.n(0, PATCH.tremolo, m, 1.2, 0.5 - i * 0.04, { attack: 1.2 }));
      s.noiseSwell(0, 1.2, 300, 3000, 0.25);
      s.boom(1.2, D - 24, 1);
      s.chord(1.2, PATCH.stab, [D - 12, D - 9, D - 5, D], 0.5, 0.9);
      const ch = s.vowel('o');
      s.chord(1.2, CHOIR, [D - 24, D - 12, D - 9, D - 5, D + 1], 1.8, 0.7, 0, ch);
      s.n(1.9, PATCH.horn, D - 5, 0.4, 0.7);
      s.n(2.3, PATCH.horn, D - 6, 0.4, 0.7);
      s.n(2.7, PATCH.horn, D - 3, 1.2, 0.75);
      s.n(1.2, PATCH.bell, D - 24, 3, 0.5);
      return s.finish(4.2);
    },
  },
  name_change: {
    trim: -4,
    wet: 0.7,
    fn: (s) => {
      s.n(0, PATCH.bell, A - 12, 5, 1);
      s.n(0, PATCH.sub, A - 24, 2, 0.6);
      const e = s.echo(0.42, 0.4);
      s.motif(0.5, motifChromatic(A + 12).slice(0, 5), MOTIF_RHYTHM.r68.slice(0, 5), 0.13, PATCH.celesta, 0.55, e);
      s.n(2.2, PATCH.bell, A - 17, 5, 0.75);
      s.n(0.5, PATCH.drone, A - 24, 3.2, 0.5);
      return s.finish(5.5);
    },
  },
  siempre: {
    trim: -1,
    wet: 0.8,
    fn: (s) => {
      const e = s.echo(0.6, 0.35);
      const end = s.motif(0.1, motifChromatic(A + 24), MOTIF_RHYTHM.r68, 0.2, BOX, 0.62, e, -8);
      s.n(0.1, PATCH.glasspad, A + 36, end, 0.18);
      s.n(0.1, PATCH.drone, A - 24, end + 1, 0.35);
      s.n(end - 0.4, PATCH.sub, A - 36, 2, 0.35);
      return s.finish(end + 2);
    },
  },
  death: {
    trim: -6,
    wet: 0.6,
    fn: (s) => {
      s.boom(0, A - 24, 1);
      s.n(0, PATCH.stab, A - 12, 0.4, 0.8);
      [A, A - 1, A - 2, A - 3, A - 4, A - 5].forEach((m, i) => s.n(0.3 + i * 0.28, PATCH.low_strings, m, 0.32, 0.6 - i * 0.04));
      const ch = s.vowel('u');
      s.chord(0.3, CHOIR, [A, A + 3, A + 7], 1.6, 0.5, 0, ch);
      s.chord(1.9, CHOIR, [A - 5, A - 2, A + 3], 1.4, 0.45, 0, ch);
      s.n(2.2, PATCH.bell, A - 24, 3, 0.5);
      return s.finish(4);
    },
  },
  sealed: {
    trim: -4.5,
    wet: 0.55,
    fn: (s) => {
      [A + 24, A + 29, A + 31, A + 36].forEach((m, i) => s.n(i * 0.05, PATCH.glock, m, 0.5, 0.5));
      s.n(0.05, REV_BELL, A + 12, 0.85, 0.5, { attack: 0.85 });
      s.revCym(0.1, 0.8, 0.7);
      s.n(0.9, PATCH.woodblock, 76, 0.2, 0.9);
      s.n(0.9, PATCH.anvil, 88, 0.6, 0.45);
      s.n(0.9, PATCH.thump, 38, 0.4, 0.9);
      s.chord(0.95, PATCH.glasspad, [A, A + 7, A + 12], 1.4, 0.35);
      return s.finish(2.6);
    },
  },
  jackpot_fanfare: {
    trim: -7,
    wet: 0.4,
    fn: (s) => {
      const F = 65;
      s.n(0, PATCH.brass, F + 7, 0.12, 0.7);
      s.n(0.15, PATCH.brass, F + 4, 0.12, 0.65);
      s.n(0.3, PATCH.brass, F + 7, 0.12, 0.7);
      s.n(0.45, PATCH.brass, F + 12, 0.7, 0.9);
      s.chord(0.45, PATCH.stab, [F - 12, F, F + 4, F + 7], 0.3, 0.7);
      s.chord(0.9, PATCH.stab, [F - 7, F + 2, F + 5, F + 10], 0.25, 0.65);
      s.chord(1.2, PATCH.stab, [F - 12, F, F + 4, F + 9], 0.25, 0.65);
      s.chord(1.5, PATCH.brass, [F - 5, F + 4, F + 7, F + 10], 0.3, 0.7);
      s.chord(1.85, PATCH.brass, [F - 12, F, F + 4, F + 7, F + 12], 1.2, 0.9);
      s.roll(1.2, 0.65, F - 24, 0.2, 0.6);
      s.n(1.85, PATCH.crash, 60, 1.4, 0.75);
      [F + 12, F + 16, F + 19, F + 24, F + 28, F + 31, F + 36].forEach((m, i) => s.n(1.85 + i * 0.05, PATCH.vibes, m, 0.8, 0.45));
      return s.finish(3.3);
    },
  },
  level_up: {
    trim: -7,
    wet: 0.4,
    fn: (s) => {
      const C = 72;
      [C, C + 4, C + 7].forEach((m, i) => s.n(i * 0.09, PATCH.brass, m, 0.12, 0.7));
      s.chord(0.27, PATCH.brass, [C - 12, C, C + 4, C + 7, C + 12], 0.9, 0.8);
      s.n(0.27, PATCH.timpani, C - 36, 0.8, 0.8);
      [C + 24, C + 19, C + 16, C + 28].forEach((m, i) => s.n(0.3 + i * 0.06, PATCH.glock, m, 0.5, 0.4, { pan: -0.5 + i * 0.33 }));
      return s.finish(1.9);
    },
  },
  council_open: {
    trim: -2.5,
    wet: 0.65,
    fn: (s) => {
      const E = 63;
      s.chord(0, PATCH.organ, [E - 12, E - 5, E, E + 4, E + 7], 1.1, 0.6);
      s.chord(1.1, PATCH.organ, [E - 12, E - 3, E + 2, E + 5, E + 9], 1.0, 0.6);
      s.chord(2.1, PATCH.organ, [E - 12, E - 5, E, E + 4, E + 7], 1.6, 0.65);
      s.n(0, PATCH.low_strings, E - 24, 3.6, 0.55);
      s.n(2.1, PATCH.bell, E - 12, 3, 0.4);
      return s.finish(4.2);
    },
  },
  nemesis: {
    trim: -8,
    wet: 0.5,
    fn: (s) => {
      const Fm = 53;
      s.chord(0, PATCH.stab, [Fm - 12, Fm, Fm + 3, Fm + 7, Fm + 13], 0.4, 0.9);
      s.boom(0, Fm - 24, 1);
      [0.4, 0.62, 0.84].forEach((at, i) => s.n(at, PATCH.taiko, Fm - 12 + i * 2, 1, 0.85));
      const core = motifChromatic(Fm).slice(0, 5);
      s.motif(1.0, core, MOTIF_RHYTHM.r44.slice(0, 5), 0.11, PATCH.horn, 0.8);
      s.motif(1.0, core.map((m) => m - 12), MOTIF_RHYTHM.r44.slice(0, 5), 0.11, PATCH.low_strings, 0.7);
      const ch = s.vowel('o');
      s.chord(1.0, CHOIR, [Fm - 12, Fm, Fm + 1, Fm + 6], 2, 0.55, 0, ch);
      return s.finish(3.6);
    },
  },
  cycle: {
    trim: -0.5,
    wet: 0.75,
    fn: (s) => {
      const pitches = motifChromatic(A + 24);
      const rev = [...pitches].reverse();
      const e = s.echo(0.5, 0.3);
      rev.forEach((m, i) => s.n(i * 0.22, REV_BELL, m, 0.2, 0.45, { attack: 0.2, dest: e }));
      const end = s.motif(2.1, pitches, MOTIF_RHYTHM.r68, 0.17, BOX, 0.6, e);
      s.chord(0, PATCH.glasspad, [A, A + 7, A + 12, A + 15], end, 0.25);
      return s.finish(end + 1.5);
    },
  },
};

export class Stingers {
  private readonly host: StingerHost;
  private lastAt = new Map<StingerName, number>();

  constructor(host: StingerHost) {
    this.host = host;
  }

  /** Plays a stinger, returns its duration in seconds (0 if skipped). */
  play(name: StingerName): number {
    const def = STINGERS[name];
    if (!def) return 0;
    const now = this.host.ac.currentTime;
    const last = this.lastAt.get(name);
    if (last !== undefined && now - last < 0.25) return 0;
    this.lastAt.set(name, now);
    const s = new Score(this.host, def.wet, def.trim);
    return def.fn(s);
  }
}

export const STINGER_DEFS = STINGERS;
