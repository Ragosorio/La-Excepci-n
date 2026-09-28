/**
 * Dramatic moods: tension, stealth, council (political intrigue), victory_loop.
 */
import { fromRhythm, genPhrase } from '../core/melody';
import { type Chord, MODES, MOTIF, MOTIF_RHYTHM, Scale, chordPcs, chordToneLadder, clamp, motifChromatic, pc, prog } from '../core/theory';
import type { MusicMood, Region } from '../types';
import { REV_CYM } from './cinematic';
import { type Inst, type Mono, type MusicHost, Piece, type Step, chordIn } from './piece';

/** Region tonic (pitch around C3..G3) for moods that follow the region's key. */
export const REGION_TONIC: Record<Region, number> = {
  valdoria: 50, sylvaria: 53, kharaz: 52, morvenna: 47, islas: 55, concordia: 51,
};

const ramp = (x: number, thr: number, w = 0.12): number => clamp((x - thr) / w, 0, 1);

// ───────────────────────────── tension & stealth ─────────────────────────────

export class TensionPiece extends Piece {
  private readonly stealth: boolean;
  private readonly tonic: number;
  private readonly scale: Scale;
  private readonly drone: Inst;
  private readonly heart: Mono;
  private readonly trem: Inst;
  private readonly pulse: Mono;
  private readonly tick: Mono;
  private readonly swell: Inst;
  private readonly cym: Inst;
  private readonly taiko: Inst;
  private readonly choir: Inst;
  private readonly pizz: Mono;
  private readonly cel: Inst;
  private readonly clar: Inst;
  private readonly shaker: Mono;
  private readonly bars = new Map<number, readonly Chord[]>();

  constructor(host: MusicHost, mood: MusicMood, region: Region, seed: number) {
    super(host, mood, region, seed);
    this.stealth = mood === 'stealth';
    this.bpm = this.stealth ? 104 : 96;
    this.spb = 4;
    this.bpb = 4;
    this.tonic = REGION_TONIC[region];
    this.scale = new Scale(this.tonic, MODES.harmonicMinor);
    const S = this.stealth;
    this.drone = this.inst({ patch: 'low_strings', vol: S ? 0.35 : 0.5, wet: 0.35, max: 4, fx: ['lp:900'] });
    this.heart = this.mono({ patch: 'thump', vol: 0.85, wet: 0.12, layer: S ? 'l2' : 'base' });
    this.trem = this.inst({ patch: 'tremolo', vol: S ? 0.2 : 0.28, wet: 0.55, max: 6, fx: ['tremFast'], layer: S ? 'l3' : 'base' });
    this.pulse = this.mono({ patch: 'spiccato', vol: 0.4, wet: 0.2, layer: 'l1' });
    this.tick = this.mono({ patch: 'woodblock', vol: 0.25, wet: 0.25, layer: S ? 'l2' : 'l1', pan: 0.3 });
    this.swell = this.inst({ patch: 'horn', vol: 0.4, wet: 0.5, max: 4, layer: 'l2', fx: ['lp:1200'] });
    this.cym = this.inst({ patch: REV_CYM, vol: 0.55, wet: 0.5, max: 2, layer: 'l2' });
    this.taiko = this.inst({ patch: 'taiko', vol: 0.6, wet: 0.35, max: 3, layer: 'l2' });
    this.choir = this.inst({ patch: 'choir', vol: 0.35, wet: 0.6, max: 6, layer: 'l3', fx: ['formantU'] });
    this.pizz = this.mono({ patch: 'pizz', vol: S ? 0.7 : 0.45, wet: 0.2, layer: S ? 'base' : 'l1' });
    this.cel = this.inst({ patch: 'celesta', vol: 0.4, wet: 0.6, max: 4 });
    this.clar = this.inst({ patch: 'clarinet', vol: 0.4, wet: 0.35, max: 2, layer: 'l1' });
    this.shaker = this.mono({ patch: 'brush', vol: 0.35, wet: 0.1, pan: 0.25 });
    this.trim = S ? 1.06 : 0.85;
  }

  protected override levels(x: number): Record<string, number> {
    return { l1: ramp(x, 0.3), l2: ramp(x, 0.6), l3: ramp(x, 0.85) };
  }

  private chords(bar: number): readonly Chord[] {
    let b = this.bars.get(bar);
    if (!b) {
      const p = Math.floor(bar / 4);
      const opts = this.stealth ? ['i | i | iv | V', 'i | bVI | iv | V', 'i | i | bII | V'] : ['i | i | bII | i', 'i | i | bvi | bvi', 'i | iv | bII | V'];
      const bars = prog(opts[(p + this.seed) % opts.length] ?? 'i');
      for (let k = 0; k < 4; k++) this.bars.set(p * 4 + k, bars[k] ?? []);
      for (const key of this.bars.keys()) if (key < p * 4 - 8) this.bars.delete(key);
      if (this.stealth && p % 2 === 1) {
        const ph = genPhrase({
          rng: this.rng('cl', p), scale: this.scale, tonic: this.tonic, meter: '44', stepsPerBar: 16, stepsPerBeat: 4, bars: 4,
          chordAt: (st) => chordIn(bars[Math.floor(st / 16) % 4] ?? [], st % 16, 16),
          lo: this.tonic + 5, hi: this.tonic + 22, density: 0.55, end: 'open', leap: 0.3,
        });
        for (const n of ph.notes) if (p * 64 + n.at >= this.stepIndex) this.at(p * 64 + n.at, this.clar, n.midi, Math.min(n.dur, 2), n.vel * 0.8);
      }
      b = this.bars.get(bar) ?? [];
    }
    return b;
  }

  onStep(s: Step): void {
    const bar = this.chords(s.bar);
    if (!bar.length) return;
    const ch = chordIn(bar, s.sib, 16);
    const t = s.time;
    const x = this.intensity;
    const S = this.stealth;
    const root = this.tonic + ch.root - (ch.root > 6 ? 12 : 0);

    if (s.sib === 0 && s.bar % 2 === 0) this.drone.play(t, root - 12, s.dur * 34, this.v(0.6, 0.03));
    // heartbeat: lub-dub, faster with intensity
    const every = x > 0.85 ? 4 : x > 0.45 ? 8 : 16;
    if (s.sib % every === 0) {
      const hb = 40 + ((((this.tonic - 40) % 12) + 18) % 12) - 6; // tonic nearest E2
      this.heart.play(t, hb, 0.3, this.v(0.85, 0.05));
      this.heart.play(t + 0.19, hb - 5, 0.3, this.v(0.55, 0.05));
    }
    // high tremolo cluster (minor 2nd), re-voiced every 4 bars
    if (s.sib === 0 && s.bar % 4 === 0) {
      const top = this.tonic + 24 + ch.root;
      this.trem.play(t, top, s.dur * 64, this.v(0.55, 0.05), { attack: 3 });
      this.trem.play(t + 0.1, top + 1, s.dur * 64, this.v(0.4, 0.05), { attack: 4 });
    }
    // pulses 3+3+2
    if (this.on('l1') && !S) {
      const acc = [0, 3, 6, 8, 11, 14].includes(s.sib);
      if (acc || (x > 0.85 && s.sub % 2 === 0)) this.pulse.play(this.h(t, 0.003), root, s.dur * 0.8, this.v(acc ? 0.8 : 0.5));
    }
    if (s.sub === 0 && this.on(S ? 'l2' : 'l1')) this.tick.play(this.h(t, 0.002), s.beat % 2 ? 88 : 84, 0.1, this.v(0.5));
    if (this.on('l2')) {
      if (s.sib === 0 && s.bar % 2 === 0) this.swell.play(t, root + 12 + (s.bar % 4 === 2 ? 1 : 0), s.dur * 30, 0.6, { attack: s.dur * 28 });
      if (s.sib === 0 && s.bar % 4 === 0) this.taiko.play(t, root - 12, 1, this.v(0.7));
      if (s.bar % 4 === 3 && s.sib === 16 - 7) this.cym.play(t, 60, s.dur * 7, 0.7, { attack: s.dur * 7 });
    }
    if (this.on('l3') && s.sib === 0 && s.bar % 2 === 0) {
      const pcs = chordPcs(this.tonic, ch);
      const base = this.tonic + 12;
      [0, 1, 6].forEach((d, i) => this.choir.play(t + i * 0.05, base + ((pcs[0] ?? 0) - pc(base) + 12) % 12 + d, s.dur * 32, 0.5, { attack: 2 }));
    }

    if (S) {
      // tiptoe pizzicato: sneaky chromatic 8ths with rests
      const line = [0, null, 7, null, 3, 2, null, -1, 0, null, 6, null, 5, 3, null, -1];
      if (s.sub % 2 === 0) {
        const k = ((s.bar % 2) * 8 + (s.sib >> 1)) % line.length;
        const off = line[k];
        if (off !== null && off !== undefined) this.pizz.play(this.h(t, 0.005), root + off, s.dur * 1.2, this.v(k % 4 === 0 ? 0.8 : 0.58));
      }
      if (s.sub === 2) this.shaker.play(this.h(t, 0.004), 60, 0.1, this.v(0.4));
      // the watcher's blink: 5 - b6 - 5, high on celesta
      if (s.bar % 4 === 2 && s.sib === 8) {
        const [a = 0, b = 0, c = 0] = motifChromatic(this.tonic + 24);
        this.cel.play(t, a, s.dur * 2, 0.45);
        this.cel.play(t + s.dur, b, s.dur * 2, 0.35);
        this.cel.play(t + s.dur * 2, c, s.dur * 4, 0.4);
      }
    } else if (this.on('l1') && s.sib === 0 && s.bar % 8 === 4) {
      // tension: the blink, low and slow
      const [a = 0, b = 0, c = 0] = motifChromatic(this.tonic + 12);
      this.pizz.play(t, a, s.dur * 4, 0.6);
      this.pizz.play(t + s.dur * 4, b, s.dur * 4, 0.5);
      this.pizz.play(t + s.dur * 8, c, s.dur * 8, 0.55);
    }
  }
}

// ───────────────────────────── council ─────────────────────────────

const COUNCIL_PROGS = ['i | iv | bVI | V', 'i | bVII | bVI | V', 'i | v | iv | i', 'iv | i | bII | V'];

export class CouncilPiece extends Piece {
  private readonly tonic = 48; // C3, C minor
  private readonly scale = new Scale(48, MODES.harmonicMinor);
  private readonly organ: Inst;
  private readonly pizz: Mono;
  private readonly pedal: Inst;
  private readonly timp: Mono;
  private readonly clock: Mono;
  private readonly trem: Inst;
  private readonly horn: Inst;
  private readonly choir: Inst;
  private readonly bars = new Map<number, readonly Chord[]>();

  constructor(host: MusicHost, mood: MusicMood, region: Region, seed: number) {
    super(host, mood, region, seed);
    this.bpm = 88;
    this.spb = 4;
    this.bpb = 4;
    this.organ = this.inst({ patch: 'organ', vol: 0.42, wet: 0.5, max: 8, fx: ['chorus'] });
    this.pizz = this.mono({ patch: 'pizz', vol: 0.55, wet: 0.25, pan: -0.2 });
    this.pedal = this.inst({ patch: 'low_strings', vol: 0.5, wet: 0.3, max: 3 });
    this.timp = this.mono({ patch: 'timpani', vol: 0.5, wet: 0.35 });
    this.clock = this.mono({ patch: 'woodblock', vol: 0.22, wet: 0.3, layer: 'l1', pan: 0.35 });
    this.trem = this.inst({ patch: 'tremolo', vol: 0.25, wet: 0.5, max: 6, fx: ['trem'], layer: 'l2' });
    this.horn = this.inst({ patch: 'horn', vol: 0.5, wet: 0.5, max: 4 });
    this.choir = this.inst({ patch: 'choir', vol: 0.35, wet: 0.6, max: 6, layer: 'l3', fx: ['formantO', 'chorus'] });
    this.trim = 1.08;
  }

  protected override levels(x: number): Record<string, number> {
    return { l1: ramp(x, 0.3), l2: ramp(x, 0.6), l3: ramp(x, 0.85) };
  }

  private chords(bar: number): readonly Chord[] {
    let b = this.bars.get(bar);
    if (!b) {
      const p = Math.floor(bar / 4);
      const motif = p % 4 === 2;
      const str = motif ? 'i | bVI | V | V' : COUNCIL_PROGS[(p + this.seed) % COUNCIL_PROGS.length] ?? 'i';
      const bars = prog(str);
      for (let k = 0; k < 4; k++) this.bars.set(p * 4 + k, bars[k] ?? []);
      for (const key of this.bars.keys()) if (key < p * 4 - 8) this.bars.delete(key);
      if (motif) {
        // the motif, augmented, in the low horn: the watcher sits at the table
        const mot = fromRhythm(MOTIF_RHYTHM.r44, motifChromatic(this.tonic + 12), 0.7, MOTIF.stress).map((n) => ({ ...n, at: n.at * 2, dur: n.dur * 2 }));
        for (const n of mot) if (p * 64 + n.at >= this.stepIndex) this.at(p * 64 + n.at, this.horn, n.midi, n.dur, n.vel);
      }
      b = this.bars.get(bar) ?? [];
    }
    return b;
  }

  onStep(s: Step): void {
    const bar = this.chords(s.bar);
    if (!bar.length) return;
    const ch = chordIn(bar, s.sib, 16);
    const t = s.time;
    const seg = 16 / bar.length;
    if (s.sib % seg === 0) {
      this.organ.chord(t, this.tonic, ch, seg * s.dur * 1.02, this.v(0.5, 0.02), 4, 55, 72);
      this.pedal.play(t, this.tonic - 12 + ch.bass, seg * s.dur, this.v(0.55, 0.03));
      if (this.on('l2')) this.trem.chord(t, this.tonic, ch, seg * s.dur, this.v(0.4, 0.03), 3, 67, 84);
      if (this.on('l3')) this.choir.chord(t, this.tonic, ch, seg * s.dur, this.v(0.45, 0.03), 3, 55, 72);
    }
    // intrigue pizzicato
    if (s.sub % 2 === 0) {
      const lad = chordToneLadder(this.tonic, ch, 55, 79);
      const r0 = lad[0] ?? 55;
      const f5 = lad[2] ?? r0 + 7;
      const t3 = lad[1] ?? r0 + 3;
      const nb = this.scale.step(f5, 1);
      const line = [r0, f5, r0 + 12, f5, nb, f5, t3, f5];
      const m = line[(s.sib >> 1) % line.length] ?? r0;
      this.pizz.play(this.h(t, 0.004), m, s.dur * 1.5, this.v(s.sib % 8 === 0 ? 0.75 : 0.52));
    }
    if (s.sub === 0 && this.on('l1')) this.clock.play(this.h(t, 0.002), s.beat % 2 ? 86 : 83, 0.1, this.v(0.5));
    // timpani roll into every 8-bar period
    if (s.bar % 8 === 7 && s.sib >= 8) this.timp.play(this.h(t, 0.003), this.tonic - 12 + 7, 0.3, 0.2 + ((s.sib - 8) / 8) * 0.6);
    if (s.bar % 8 === 0 && s.sib === 0) this.timp.play(t, this.tonic - 12, 1, 0.85);
  }
}

// ───────────────────────────── victory loop ─────────────────────────────

const VICTORY_PROGS = ['I | bVI | bVII | I', 'I | IV | I | V', 'vi | IV | bVI bVII | I', 'I | iii | IV | IV bVII'];

export class VictoryPiece extends Piece {
  private readonly tonic: number;
  private readonly scale: Scale;
  private readonly brass: Inst;
  private readonly horn: Inst;
  private readonly pad: Inst;
  private readonly harp: Inst;
  private readonly timp: Inst;
  private readonly snare: Inst;
  private readonly bass: Inst;
  private readonly choir: Inst;
  private readonly bars = new Map<number, readonly Chord[]>();

  constructor(host: MusicHost, mood: MusicMood, region: Region, seed: number) {
    super(host, mood, region, seed);
    this.bpm = 100;
    this.spb = 4;
    this.bpb = 4;
    this.tonic = REGION_TONIC[region] + 12 > 64 ? REGION_TONIC[region] : REGION_TONIC[region] + 12;
    this.scale = new Scale(this.tonic, MODES.ionian);
    this.brass = this.inst({ patch: 'brass', vol: 0.5, wet: 0.35, max: 4 });
    this.horn = this.inst({ patch: 'horn', vol: 0.45, wet: 0.35, max: 6 });
    this.pad = this.inst({ patch: 'strings_warm', vol: 0.45, wet: 0.4, max: 8, fx: ['chorus'] });
    this.harp = this.inst({ patch: 'harp', vol: 0.38, wet: 0.35, max: 10 });
    this.timp = this.inst({ patch: 'timpani', vol: 0.55, wet: 0.3, max: 4 });
    this.snare = this.inst({ patch: 'snare', vol: 0.3, wet: 0.2, max: 6 });
    this.bass = this.inst({ patch: 'low_strings', vol: 0.5, wet: 0.2, max: 3 });
    this.choir = this.inst({ patch: 'choir', vol: 0.35, wet: 0.5, max: 6, fx: ['formantA', 'chorus'] });
    this.trim = 0.84;
  }

  private chords(bar: number): readonly Chord[] {
    let b = this.bars.get(bar);
    if (!b) {
      const p = Math.floor(bar / 4);
      const bars = prog(VICTORY_PROGS[(p + (this.seed % 4)) % VICTORY_PROGS.length] ?? 'I');
      for (let k = 0; k < 4; k++) this.bars.set(p * 4 + k, bars[k] ?? []);
      for (const key of this.bars.keys()) if (key < p * 4 - 8) this.bars.delete(key);
      const start = p * 64;
      if (p % 4 === 3) {
        // the villain's triumph: the motif, in major, b6 neighbour intact
        const mot = fromRhythm(MOTIF_RHYTHM.r44, motifChromatic(this.tonic).map((m, i) => (i === 3 ? m + 1 : m)), 0.8, MOTIF.stress);
        for (const n of mot) if (start + n.at >= this.stepIndex) this.at(start + n.at, this.brass, n.midi, n.dur, n.vel);
      } else if (p % 2 === 1 || p === 0) {
        const ph = genPhrase({
          rng: this.rng('vm', p), scale: this.scale, tonic: this.tonic, meter: '44', stepsPerBar: 16, stepsPerBeat: 4, bars: 4,
          chordAt: (st) => chordIn(bars[Math.floor(st / 16) % 4] ?? [], st % 16, 16), lo: this.tonic - 2, hi: this.tonic + 16,
          density: 0.4, end: p % 4 === 1 ? 'open' : 'close', leap: 0.65,
        });
        for (const n of ph.notes) if (start + n.at >= this.stepIndex) this.at(start + n.at, p % 2 ? this.brass : this.horn, n.midi, n.dur, n.vel);
      }
      b = this.bars.get(bar) ?? [];
    }
    return b;
  }

  onStep(s: Step): void {
    const bar = this.chords(s.bar);
    if (!bar.length) return;
    const ch = chordIn(bar, s.sib, 16);
    const t = s.time;
    const seg = 16 / bar.length;
    if (s.sib % seg === 0) {
      this.pad.chord(t, this.tonic, ch, seg * s.dur * 1.02, this.v(0.5, 0.03), 4, this.tonic - 10, this.tonic + 10);
      this.bass.play(t, this.tonic - 24 + ch.bass, seg * s.dur, this.v(0.6, 0.03));
      if (ch.root === 8 || ch.root === 10) this.choir.chord(t, this.tonic, ch, seg * s.dur, this.v(0.5, 0.03), 4, this.tonic - 5, this.tonic + 14);
      this.horn.chord(t, this.tonic, ch, s.dur * 3, this.v(0.4), 3, this.tonic - 7, this.tonic + 7);
    }
    if (s.sub % 2 === 0) {
      const lad = chordToneLadder(this.tonic, ch, this.tonic - 10, this.tonic + 22);
      const pat = [0, 1, 2, 3, 4, 3, 2, 1];
      const m = lad[clamp(pat[(s.sib >> 1) % 8] ?? 0, 0, lad.length - 1)] ?? this.tonic;
      this.harp.play(this.h(t), m, s.dur * 4, this.v(0.45));
    }
    if (s.sib === 0) this.timp.play(t, this.tonic - 24 + ch.root, 1, this.v(s.bar % 4 === 0 ? 0.85 : 0.55));
    if (s.bar % 4 === 3 && s.sib >= 12) this.snare.play(this.h(t, 0.002), 55, 0.1, 0.25 + (s.sib - 12) * 0.12);
    if (s.sib === 8 && s.bar % 2 === 0) this.snare.play(t, 55, 0.1, 0.35);
  }
}
