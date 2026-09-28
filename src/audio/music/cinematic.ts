/**
 * Cinematic moods: title, ending, void, prologue / prologue_dark.
 */
import { type MelNote, fromRhythm, genPhrase, varyPhrase } from '../core/melody';
import type { Spec } from '../core/patches';
import {
  type Chord, MODES, MOTIF, MOTIF_RHYTHM, Scale, chordToneLadder, clamp, darken, motifChromatic, prog,
} from '../core/theory';
import type { MusicMood, Region } from '../types';
import { type Inst, type MusicHost, Piece, type Step, chordIn } from './piece';

/** Swells that stop abruptly at their peak: the "reversed" sound. */
export const REV_PAD: Spec = {
  osc: [{ w: 'glass', dt: -8 }, { w: 'glass', dt: 8 }, { w: 'sine', r: 2, g: 0.2 }],
  a: 2.4, d: 1, s: 1, r: 0.018, gain: 0.3,
  f: { type: 'lowpass', hz: 3500, env: 0.12, envTau: 1.0 },
};
export const REV_CYM: Spec = {
  osc: [], a: 1.6, d: 1, s: 1, r: 0.02, gain: 0.13,
  noise: { color: 'white', g: 1, type: 'highpass', hz: 4500, q: 0.6, sustain: true },
};
export const REV_BELL: Spec = {
  osc: [{ w: 'sine' }, { w: 'sine', r: 4, g: 0.25 }, { w: 'sine', r: 2.76, g: 0.18 }],
  a: 1.4, d: 1, s: 1, r: 0.02, gain: 0.32,
};

// ───────────────────────────── title ─────────────────────────────

/** 6/8, A minor. Music box states the motif; celesta and felt piano answer; strings/choir breathe. */
export class TitlePiece extends Piece {
  protected readonly tonic = 57; // A3
  protected readonly scale = new Scale(57, MODES.harmonicMinor);
  protected readonly box: Inst;
  protected readonly cel: Inst;
  protected readonly felt: Inst;
  protected readonly pad: Inst;
  protected readonly choir: Inst;
  protected readonly bars = new Map<number, readonly Chord[]>();

  constructor(host: MusicHost, mood: MusicMood, region: Region, seed: number) {
    super(host, mood, region, seed);
    this.bpm = 46;
    this.bpb = 2;
    this.spb = 6;
    this.box = this.inst({ patch: 'musicbox', vol: 0.7, wet: 0.55, max: 6, pan: 0.1 });
    this.cel = this.inst({ patch: 'celesta', vol: 0.55, wet: 0.55, max: 6, pan: -0.15 });
    this.felt = this.inst({ patch: 'felt', vol: 0.55, wet: 0.5, max: 6 });
    this.pad = this.inst({ patch: 'strings_warm', vol: 0.32, wet: 0.6, max: 8, fx: ['chorus'] });
    this.choir = this.inst({ patch: 'choir', vol: 0.3, wet: 0.7, max: 8, fx: ['formantU', 'chorusWide'] });
    this.trim = mood === 'ending' ? 1.07 : 0.9;
  }

  protected section(bar: number): number {
    return Math.floor((bar % 16) / 4);
  }

  protected plan(block: number): void {
    // 16-bar loop: [motif+answer] [motif(celesta)+answer] [B: pads + counter-melody] [motif low + box answer]
    const r = this.rng('tb', block);
    const b0 = block * 16;
    const harm = [
      'i bVI | V | iv | V', 'i bVI | V | iv V | i',
      'bVI | bIII | bVII | V', 'i bVI | V | bVI | V',
    ];
    harm.forEach((h, i) => {
      const bars = prog(h);
      for (let k = 0; k < 4; k++) this.bars.set(b0 + i * 4 + k, bars[k % bars.length] ?? []);
    });
    const spbar = 12;
    const start = b0 * spbar;
    const chordAt = (bar: number) => (st: number): Chord => {
      const b = this.bars.get(bar + Math.floor(st / spbar)) ?? [];
      return chordIn(b, st % spbar, spbar);
    };
    const mot = (base: number): MelNote[] => fromRhythm(MOTIF_RHYTHM.r68, motifChromatic(base), 0.72, MOTIF.stress);
    const answer = (bar: number, end: 'open' | 'close', lo: number, hi: number, near: number): MelNote[] =>
      genPhrase({
        rng: r, scale: this.scale, tonic: this.tonic, meter: '68', stepsPerBar: spbar, stepsPerBeat: 6, bars: 2,
        chordAt: chordAt(b0 + bar), lo, hi, density: 0.35, end, leap: 0.3, startNear: near,
      }).notes;
    const push = (off: number, inst: Inst, notes: readonly MelNote[], vel = 1): void => {
      for (const n of notes) {
        const abs = start + off + n.at;
        if (abs >= this.stepIndex) this.at(abs, inst, n.midi, n.dur, n.vel * vel);
      }
    };
    push(0, this.box, mot(81));
    push(2 * spbar, this.box, answer(2, 'open', 76, 93, 83));
    push(4 * spbar, this.cel, varyPhrase(mot(69), r, this.scale, 0.25));
    push(6 * spbar, this.cel, answer(6, 'close', 64, 81, 71));
    push(8 * spbar, this.cel, genPhrase({
      rng: r, scale: this.scale, tonic: this.tonic, meter: '68', stepsPerBar: spbar, stepsPerBeat: 6, bars: 4,
      chordAt: chordAt(b0 + 8), lo: 69, hi: 86, density: 0.12, end: 'open', leap: 0.4,
    }).notes, 0.7);
    push(12 * spbar, this.felt, mot(57), 0.9);
    push(14 * spbar, this.box, answer(14, 'open', 76, 93, 81), 0.85);
  }

  onStep(s: Step): void {
    if (!this.bars.has(s.bar)) this.plan(Math.floor(s.bar / 16));
    const bar = this.bars.get(s.bar) ?? [];
    if (!bar.length) return;
    const ch = chordIn(bar, s.sib, s.spbar);
    const seg = s.spbar / bar.length;
    const t = s.time;
    const sec = this.section(s.bar);
    if (s.sib % seg === 0) {
      this.pad.chord(t, this.tonic, ch, seg * s.dur * 1.05, this.v(sec === 2 ? 0.55 : 0.42, 0.03), 4, 52, 72);
      if (sec >= 2) this.choir.chord(t, this.tonic, ch, seg * s.dur * 1.05, this.v(0.4, 0.03), 3, 60, 76);
    }
    if (s.sib === 0) {
      const lad = chordToneLadder(this.tonic, ch, 33, 45);
      this.felt.play(t, lad[0] ?? 45, s.spbar * s.dur, this.v(0.5));
    }
    if (sec === 2 && s.sub === 3) {
      // gentle rocking accompaniment in B
      const lad = chordToneLadder(this.tonic, ch, 57, 76);
      const m = lad[(s.i >> 1) % Math.max(1, lad.length)] ?? 64;
      this.felt.play(t, m, s.dur * 5, this.v(0.28));
    }
  }
}

// ───────────────────────────── ending ─────────────────────────────

/** The music box runs out of spring: motif, answer, motif again slowing to a stop... then silence. */
export class EndingPiece extends TitlePiece {
  private readonly ritStart = 6 * 12;
  private readonly lastStep = 8 * 12 + 2;

  constructor(host: MusicHost, mood: MusicMood, region: Region, seed: number) {
    super(host, mood, region, seed);
    this.bpm = 42;
  }

  protected override plan(_block: number): void {
    const bars = prog('i | bVI | i bVI | V | iv | V | i bVI | V | V');
    bars.forEach((b, i) => this.bars.set(i, b));
    const r = this.rng('end');
    const mot = fromRhythm(MOTIF_RHYTHM.r68, motifChromatic(81), 0.7, MOTIF.stress);
    for (const n of mot) this.at(2 * 12 + n.at, this.box, n.midi, n.dur, n.vel);
    const ans = genPhrase({
      rng: r, scale: this.scale, tonic: this.tonic, meter: '68', stepsPerBar: 12, stepsPerBeat: 6, bars: 2,
      chordAt: (st) => chordIn(this.bars.get(4 + Math.floor(st / 12)) ?? [], st % 12, 12),
      lo: 76, hi: 91, density: 0.3, end: 'close', leap: 0.25, startNear: 83,
    });
    for (const n of ans.notes) this.at(4 * 12 + n.at, this.box, n.midi, n.dur, n.vel * 0.9);
    // last statement: each note a little softer, the final "-te" barely there
    mot.forEach((n, i) => this.at(6 * 12 + n.at, this.box, n.midi, n.dur, n.vel * (1 - i * 0.07) * (i === 7 ? 0.6 : 1)));
  }

  override onStep(s: Step): void {
    if (s.i >= this.lastStep) {
      if (s.i === this.lastStep) {
        // the spring gives out: a tiny mechanical click
        this.box.hz(s.time + 0.4, 5200, 0.02, 0.08);
      }
      this.done = true;
      return;
    }
    if (s.i >= this.ritStart) this.tempoScale = Math.max(0.28, this.tempoScale * 0.955);
    if (!this.bars.size) this.plan(0);
    const bar = this.bars.get(s.bar) ?? [];
    if (!bar.length) return;
    const ch = chordIn(bar, s.sib, s.spbar);
    const seg = s.spbar / bar.length;
    if (s.sib % seg === 0 && s.bar < 6) {
      this.pad.chord(s.time, this.tonic, ch, seg * s.dur * (s.bar === 5 ? 3 : 1.05), this.v(0.4, 0.02), 4, 52, 72);
    }
    if (s.sib === 0 && s.bar < 6) this.felt.play(s.time, (chordToneLadder(this.tonic, ch, 33, 45)[0] ?? 45), s.spbar * s.dur, 0.38);
  }
}

// ───────────────────────────── void ─────────────────────────────

/** No pulse: drones, reversed swells, far thumps and the motif core played backwards on glass bells. */
export class VoidPiece extends Piece {
  private readonly drone: Inst;
  private readonly swellI: Inst;
  private readonly bellI: Inst;
  private readonly cymI: Inst;
  private readonly subI: Inst;
  private readonly lowI: Inst;
  private readonly root = 45; // A2

  constructor(host: MusicHost, mood: MusicMood, region: Region, seed: number) {
    super(host, mood, region, seed);
    this.bpm = 60;
    this.spb = 2;
    this.bpb = 4;
    this.drone = this.inst({ patch: 'drone', vol: 0.6, wet: 0.6, max: 6, fx: ['chorusWide'] });
    this.swellI = this.inst({ patch: REV_PAD, vol: 0.5, wet: 0.8, max: 6, fx: ['chorusWide'] });
    this.bellI = this.inst({ patch: 'celesta', vol: 0.3, wet: 0.9, max: 6, fx: ['echo:0.75:0.45'] });
    this.cymI = this.inst({ patch: REV_CYM, vol: 0.5, wet: 0.7, max: 2, layer: 'l1' });
    this.subI = this.inst({ patch: 'sub', vol: 0.5, wet: 0.3, max: 2 });
    this.lowI = this.inst({ patch: 'horn', vol: 0.3, wet: 0.7, max: 4, layer: 'l1', fx: ['lp:700'] });
    this.trim = 1.1;
  }

  protected override levels(x: number): Record<string, number> {
    return { l1: clamp((x - 0.35) / 0.2, 0, 1) };
  }

  onStep(s: Step): void {
    const t = s.time;
    const r = this.rng('v', s.i);
    if (s.i % 32 === 0) {
      // overlapping drones: root + fifth-less cluster
      this.drone.play(t, this.root - 12, 18, 0.7, { detune: -6 });
      this.drone.play(t + 0.5, this.root, 18, 0.55, { detune: 7 });
      this.drone.play(t + 1.2, this.root + (this.rng('dr', s.i).chance(0.5) ? 6 : 1), 16, 0.35);
    }
    if (s.sub === 0 && r.chance(0.09 + this.intensity * 0.12)) {
      const set = [0, 1, 6, 7, 8, 11, 13];
      const m = this.root + 12 + (r.pick(set)) + (r.chance(0.4) ? 12 : 0);
      const dur = r.range(1.6, 3.4);
      this.swellI.play(t, m, dur, r.range(0.4, 0.75), { attack: dur });
    }
    if (s.i % 16 === 8) this.subI.play(t, this.root - 12, 2, 0.35 + this.intensity * 0.3);
    if (s.i % 64 === 40) {
      // the motif core, backwards and slow: B C E F E
      const core = motifChromatic(this.root + 24).slice(0, 5).reverse();
      core.forEach((m, i) => this.bellI.play(t + i * 1.1, m, 1.5, 0.5 - i * 0.05, { detune: -12 * i }));
    }
    if (this.on('l1')) {
      if (s.i % 16 === 14) this.cymI.play(t, 60, 1.6, 0.6, { attack: 1.6 });
      if (s.i % 16 === 0 && r.chance(0.5)) this.lowI.play(t, this.root + r.pick([0, 1, 6]), 6, 0.5, { attack: 2.5 });
    }
  }
}

// ───────────────────────────── prologue (light / dark) ─────────────────────────────

const PRO_PROGS = ['I | V | vi | IV', 'I | iii | IV | V', 'vi | IV | I | V', 'IV | I | ii | Vsus4'];

/**
 * Dawn in the forest (D major): felt piano arpeggios, warm strings, harp, flute.
 * prologue_dark shares the exact bar grid & harmony (phase-locked): every chord
 * is darkened, the piano sags out of tune, a tritone drone and reversed swells
 * creep in, and the music box whispers the motif.
 */
export class ProloguePiece extends Piece {
  private readonly dark: boolean;
  private readonly tonic = 62;
  private readonly scale = new Scale(62, MODES.ionian);
  private readonly piano: Inst;
  private readonly pad: Inst;
  private readonly lead: Inst;
  private readonly harp: Inst;
  private readonly spark: Inst;
  private readonly drone: Inst | null;
  private readonly swellI: Inst | null;
  private readonly heart: Inst | null;
  private readonly bars = new Map<number, readonly Chord[]>();

  constructor(host: MusicHost, mood: MusicMood, region: Region, seed: number) {
    super(host, mood, region, seed);
    this.dark = mood === 'prologue_dark';
    this.family = 'prologue';
    this.bpm = 72;
    this.spb = 4;
    this.bpb = 4;
    const D = this.dark;
    this.piano = this.inst({ patch: 'felt', vol: 0.62, wet: D ? 0.6 : 0.4, max: 10, fx: D ? ['lp:1400'] : [] });
    this.pad = D
      ? this.inst({ patch: 'tremolo', vol: 0.4, wet: 0.6, max: 8, fx: ['trem', 'chorusWide'] })
      : this.inst({ patch: 'strings_warm', vol: 0.45, wet: 0.45, max: 8, fx: ['chorus'] });
    this.lead = D
      ? this.inst({ patch: 'musicbox', vol: 0.5, wet: 0.8, max: 4, fx: ['echo:0.625:0.4'] })
      : this.inst({ patch: 'flute', vol: 0.45, wet: 0.5, max: 3 });
    this.harp = this.inst({ patch: 'harp', vol: 0.35, wet: 0.45, max: 12 });
    this.spark = this.inst({ patch: D ? 'glock' : 'celesta', vol: 0.14, wet: 0.8, max: 4 });
    this.drone = D ? this.inst({ patch: 'drone', vol: 0.55, wet: 0.5, max: 4 }) : null;
    this.swellI = D ? this.inst({ patch: REV_PAD, vol: 0.45, wet: 0.7, max: 4 }) : null;
    this.heart = D ? this.inst({ patch: 'thump', vol: 0.7, wet: 0.2, max: 3 }) : null;
    this.trim = D ? 0.87 : 0.9;
  }

  private chords(bar: number): readonly Chord[] {
    let b = this.bars.get(bar);
    if (!b) {
      const p = Math.floor(bar / 4);
      const bars = prog(PRO_PROGS[(p + (this.seed % 4)) % PRO_PROGS.length] ?? 'I');
      for (let k = 0; k < 4; k++) this.bars.set(p * 4 + k, bars[k] ?? []);
      for (const key of this.bars.keys()) if (key < p * 4 - 8) this.bars.delete(key);
      this.planMelody(p, bars);
      b = this.bars.get(bar) ?? [];
    }
    return this.dark ? b.map(darken) : b;
  }

  private planMelody(p: number, bars: readonly (readonly Chord[])[]): void {
    const start = p * 64;
    if (this.dark) {
      if (p % 2 === 1) {
        // the watcher: the motif on a detuned music box, over the darkened harmony
        const mot = fromRhythm(MOTIF_RHYTHM.r44, motifChromatic(74), 0.62, MOTIF.stress);
        for (const n of mot) if (start + n.at >= this.stepIndex) this.at(start + n.at, this.lead, n.midi, n.dur, n.vel, { detune: -35 });
      }
      return;
    }
    if (p < 1) return;
    const r = this.rng('pm', p);
    const ph = genPhrase({
      rng: r, scale: this.scale, tonic: this.tonic, meter: '44', stepsPerBar: 16, stepsPerBeat: 4, bars: 4,
      chordAt: (st) => chordIn(bars[Math.floor(st / 16) % 4] ?? [], st % 16, 16), lo: 69, hi: 86, density: 0.3,
      end: p % 2 ? 'close' : 'open', leap: 0.35,
    });
    for (const n of ph.notes) if (start + n.at >= this.stepIndex) this.at(start + n.at, this.lead, n.midi, n.dur, n.vel);
  }

  onStep(s: Step): void {
    const bar = this.chords(s.bar);
    if (!bar.length) return;
    const ch = chordIn(bar, s.sib, 16);
    const t = s.time;
    const D = this.dark;
    const r = this.rng('pr', s.i);
    // piano: broken-chord 8ths over two octaves
    if (s.sub % 2 === 0) {
      const lad = chordToneLadder(this.tonic, ch, 50, 76);
      const pat = [0, 2, 4, 3, 5, 4, 2, 3];
      const m = lad[clamp(pat[(s.sib >> 1) % pat.length] ?? 0, 0, lad.length - 1)] ?? 62;
      const det = D ? -18 - 22 * Math.sin(s.i * 0.07) : 0;
      this.piano.play(this.h(t, 0.008), m, s.dur * 5, this.v(s.sib === 0 ? 0.62 : 0.44), { detune: det });
    }
    if (s.sib === 0) {
      const lad = chordToneLadder(this.tonic, ch, 38, 50);
      this.piano.play(t, lad[0] ?? 38, s.dur * 16, this.v(0.55), D ? { detune: -25 } : undefined);
      this.pad.chord(t, this.tonic, ch, s.dur * 16.5, this.v(D ? 0.5 : 0.42, 0.03), 4, 57, 76);
      if (this.drone && s.bar % 2 === 0) {
        this.drone.play(t, this.tonic - 24, s.dur * 34, 0.6);
        this.drone.play(t, this.tonic - 24 + 6, s.dur * 34, 0.35); // the tritone creeps in
      }
      if (this.heart) {
        this.heart.play(t, 38, 0.3, 0.7);
        this.heart.play(t + 0.22, 33, 0.3, 0.45);
      }
    }
    if (this.swellI && s.sib === 8 && r.chance(0.6)) {
      const lad = chordToneLadder(this.tonic, ch, 64, 80);
      this.swellI.play(t, (lad[r.int(0, lad.length - 1)] ?? 70) + (r.chance(0.5) ? 1 : 0), s.dur * 8, 0.55, { attack: s.dur * 8 });
    }
    // harp glissando every other phrase
    if (!D && s.bar % 8 === 7 && s.sib === 12) {
      const run = this.scale.notesIn(62, 91);
      run.forEach((m, i) => this.harp.play(t + (i / run.length) * s.dur * 4, m, 0.9, 0.2 + 0.35 * (i / run.length)));
    }
    if (s.sub === 2 && r.chance(D ? 0.05 : 0.07)) {
      const lad = chordToneLadder(this.tonic, ch, 81, 98);
      if (lad.length) this.spark.play(t, r.pick(lad), 1.2, this.v(0.45, 0.15), { pan: r.range(-0.8, 0.8), detune: D ? -40 : 0 });
    }
  }
}
