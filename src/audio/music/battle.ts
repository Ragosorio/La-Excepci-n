/**
 * Battle & boss: driving anime-epic music. Taiko + a 16th string ostinato built
 * from the leitmotif core (5-b6-5-3) + brass stating the full motif, with
 * vertical layers unlocked by intensity:
 *   base: ostinato, bass, taiko, horn motif, soft stabs
 *   l1 (>=0.25): snare/backbeat, second taiko, timpani, stronger stabs
 *   l2 (>=0.5):  full brass, high strings, hats, crashes
 *   l3 (>=0.75): choir, fills, sub booms (boss: everything enters ~0.2 earlier + bells)
 */
import { type MelNote, fromRhythm, genPhrase } from '../core/melody';
import { type Chord, MODES, MOTIF, MOTIF_RHYTHM, Scale, chordPcs, clamp, motifChromatic, pc, prog } from '../core/theory';
import type { MusicMood, Region } from '../types';
import { type Inst, type Mono, type MusicHost, Piece, type Player, type Step, chordIn } from './piece';

type Flavor = 'snare' | 'harp' | 'anvil' | 'celesta' | 'marimba' | 'organ';

interface BattleStyle {
  tonic: number;
  mode: readonly number[];
  bossMode: readonly number[];
  bpm: number;
  dev: readonly string[];
  flavor: Flavor;
}

const BATTLE: Record<Region, BattleStyle> = {
  valdoria: {
    tonic: 50, mode: MODES.aeolian, bossMode: MODES.harmonicMinor, bpm: 150, flavor: 'snare',
    dev: ['i | bVI | bIII | bVII', 'i | iv | bVI | V', 'bVI | bVII | i | i', 'i | bVII | bVI | V'],
  },
  sylvaria: {
    tonic: 57, mode: MODES.aeolian, bossMode: MODES.harmonicMinor, bpm: 146, flavor: 'harp',
    dev: ['i | bVI | bVII | i', 'bVI | bIII | bVII | IV', 'i | iv | bVII | bIII', 'bVI | bVII | V | V'],
  },
  kharaz: {
    tonic: 52, mode: MODES.phrygian, bossMode: MODES.phrygianDominant, bpm: 140, flavor: 'anvil',
    dev: ['i | bII | i | bII', 'i | bVII | bVI | bII', 'iv | bII | i | V', 'bVI | bII | bVII | i'],
  },
  morvenna: {
    tonic: 47, mode: MODES.harmonicMinor, bossMode: MODES.harmonicMinor, bpm: 156, flavor: 'celesta',
    dev: ['i | iv | V | i', 'bVI | ii° | V | V', 'i | bVI | iv | V', 'iv | bII | V | i'],
  },
  islas: {
    tonic: 45, mode: MODES.harmonicMinor, bossMode: MODES.harmonicMinor, bpm: 148, flavor: 'marimba',
    dev: ['i | bVI | bVII | i', 'iv | i | V | i', 'i | bVII | bVI | V', 'bVI | iv | V | V'],
  },
  concordia: {
    tonic: 48, mode: MODES.aeolian, bossMode: MODES.harmonicMinor, bpm: 144, flavor: 'organ',
    dev: ['i | bVI | bIII | bVII', 'iv | i | bVII | bIII', 'i | bVI | iv | V', 'bVI | bVII | i | i'],
  },
};

const MOTIF_HARM = ['i bVI | V | iv | V', 'i bVI | V | bVI bVII | i', 'i bVI | V | bVI | V'];
const BREAK_HARM = 'i | i | bVI | V';

const STABS = ['X..X..X...X.X...', 'X.....X...X.....', 'X..X....X..X..X.', 'X.......X.X..X..'];

type Figure = 'motif' | 'drive' | 'roll';

export class BattlePiece extends Piece {
  private readonly st: BattleStyle;
  private readonly boss: boolean;
  private readonly scale: Scale;
  private readonly tonic: number;
  private readonly ost: Mono;
  private readonly ostHi: Mono;
  private readonly bass: Mono;
  private readonly taiko: Inst;
  private readonly taiko2: Mono;
  private readonly snare: Mono;
  private readonly hat: Mono;
  private readonly crash: Inst;
  private readonly timp: Inst;
  private readonly toms: Inst;
  private readonly sub: Inst;
  private readonly horn: Inst;
  private readonly brass: Inst;
  private readonly stab: Inst;
  private readonly choir: Inst;
  private readonly flav: Player;
  private readonly flav2: Mono | null;
  private readonly bell: Inst | null;
  private readonly bars = new Map<number, readonly Chord[]>();
  private readonly kinds = new Map<number, string>();
  private readonly figs = new Map<number, Figure>();

  constructor(host: MusicHost, mood: MusicMood, region: Region, seed: number) {
    super(host, mood, region, seed);
    const st = BATTLE[region];
    this.st = st;
    this.boss = mood === 'boss';
    this.bpm = st.bpm + (this.boss ? 18 : 0);
    this.bpb = 4;
    this.spb = 4;
    this.tonic = st.tonic;
    this.scale = new Scale(st.tonic, this.boss ? st.bossMode : st.mode);
    const B = this.boss;
    this.ost = this.mono({ patch: 'spiccato', vol: 0.4, wet: 0.18, pan: -0.15 });
    this.ostHi = this.mono({ patch: 'spiccato', vol: 0.26, wet: 0.22, pan: 0.25, layer: 'l2' });
    this.bass = this.mono({ patch: 'low_spic', vol: 0.6, wet: 0.1 });
    this.taiko = this.inst({ patch: 'taiko', vol: 0.95, wet: 0.14, max: 6 });
    this.taiko2 = this.mono({ patch: 'taiko', vol: 0.6, wet: 0.14, layer: 'l1', pan: 0.2 });
    this.snare = this.mono({ patch: st.flavor === 'snare' ? 'snare' : 'rim', vol: st.flavor === 'snare' ? 0.5 : 0.6, wet: 0.2, layer: 'l1' });
    this.hat = this.mono({ patch: 'shaker', vol: 0.45, wet: 0.08, layer: 'l2', pan: 0.3 });
    this.crash = this.inst({ patch: 'crash', vol: 0.55, wet: 0.25, max: 2, layer: 'l2' });
    this.timp = this.inst({ patch: 'timpani', vol: 0.6, wet: 0.25, max: 3, layer: 'l1' });
    this.toms = this.inst({ patch: 'taiko', vol: 0.55, wet: 0.2, max: 6, layer: 'l3', pan: -0.2 });
    this.sub = this.inst({ patch: 'sub', vol: 0.55, wet: 0.05, max: 2, layer: 'l3' });
    this.horn = this.inst({ patch: 'horn', vol: 0.55, wet: 0.35, max: 4 });
    this.brass = this.inst({ patch: 'brass', vol: 0.55, wet: 0.3, max: 6, layer: 'l2' });
    this.stab = this.inst({ patch: 'stab', vol: 0.5, wet: 0.22, max: 9 });
    this.choir = st.flavor === 'organ'
      ? this.inst({ patch: 'organ', vol: 0.4, wet: 0.45, max: 8, layer: B ? 'l2' : 'l3', fx: ['chorus'] })
      : this.inst({ patch: 'choir', vol: 0.55, wet: 0.45, max: 8, layer: B ? 'l2' : 'l3', fx: ['formantA', 'chorus'] });
    switch (st.flavor) {
      case 'anvil': this.flav = this.inst({ patch: 'anvil', vol: 0.32, wet: 0.3, max: 4 }); break;
      case 'harp': this.flav = this.inst({ patch: 'harp', vol: 0.45, wet: 0.35, max: 12, layer: 'l1' }); break;
      case 'celesta': this.flav = this.inst({ patch: 'celesta', vol: 0.32, wet: 0.35, max: 6, layer: 'l2' }); break;
      case 'marimba': this.flav = this.mono({ patch: 'marimba', vol: 0.34, wet: 0.2 }); break;
      case 'organ': this.flav = this.inst({ patch: 'timpani', vol: 0.4, wet: 0.3, max: 3, layer: 'l1' }); break;
      default: this.flav = this.mono({ patch: 'snare', vol: 0.32, wet: 0.2, layer: 'l1' }); break;
    }
    this.flav2 = st.flavor === 'marimba' ? this.mono({ patch: 'conga', vol: 0.4, wet: 0.15, layer: 'l1' }) : null;
    this.bell = B ? this.inst({ patch: 'bell', vol: 0.28, wet: 0.6, max: 3, layer: 'l1' }) : null;
    this.trim = this.boss ? 0.43 : 0.46;
  }

  protected override levels(x: number): Record<string, number> {
    const b = this.boss ? 0.2 : 0;
    const r = (thr: number): number => clamp((x + b - thr) / 0.12, 0, 1);
    return { l1: r(0.25), l2: r(0.5), l3: r(0.75) };
  }

  private kindOf(p: number): string {
    const seq = this.boss ? ['M', 'D', 'M', 'M', 'D', 'K', 'M', 'D'] : ['M', 'D', 'D', 'M', 'D', 'K', 'M', 'D'];
    return seq[p % seq.length] ?? 'D';
  }

  private plan(p: number): void {
    const kind = this.kindOf(p);
    const cyc = Math.floor(p / 8);
    const r = this.rng('bp', p);
    let str: string;
    if (kind === 'M') str = MOTIF_HARM[cyc % MOTIF_HARM.length] ?? 'i bVI | V | iv | V';
    else if (kind === 'K') str = BREAK_HARM;
    else str = this.st.dev[(p + cyc) % this.st.dev.length] ?? 'i | bVI | bVII | i';
    const bars = prog(str);
    const fig: Figure = kind === 'M' ? 'motif' : r.pick(['drive', 'roll', 'motif'] as const);
    for (let k = 0; k < 4; k++) {
      this.bars.set(p * 4 + k, bars[k % bars.length] ?? []);
      this.kinds.set(p * 4 + k, kind);
      this.figs.set(p * 4 + k, fig);
    }
    for (const key of this.bars.keys()) if (key < p * 4 - 8) {
      this.bars.delete(key);
      this.kinds.delete(key);
      this.figs.delete(key);
    }
    const start = p * 4 * 16;
    const chordAt = (step: number): Chord => chordIn(bars[Math.floor(step / 16) % bars.length] ?? [], step % 16, 16);
    if (kind === 'M') {
      // the leitmotif in brass: horns always, trumpets (brass) at l2
      const pitches = motifChromatic(this.tonic + 12);
      const mot = fromRhythm(MOTIF_RHYTHM.r44, pitches, 0.8, MOTIF.stress);
      this.enqueue(start, this.horn, mot, 0.9);
      this.enqueue(start, this.brass, mot, 1);
      // answer: heroic brass phrase over bars 3-4
      const ans = genPhrase({
        rng: r, scale: this.scale, tonic: this.tonic, meter: '44', stepsPerBar: 16, stepsPerBeat: 4, bars: 2,
        chordAt: (st) => chordAt(st + 32), lo: this.tonic + 5, hi: this.tonic + 22, density: 0.55, end: 'open', leap: 0.6,
        startNear: this.tonic + 14,
      });
      this.enqueue(start + 32, this.horn, ans.notes, 0.8);
      this.enqueue(start + 32, this.brass, ans.notes, 0.95);
    } else if (kind === 'D') {
      // long-note counter melody for high strings / horns at l2
      const cm = genPhrase({
        rng: r, scale: this.scale, tonic: this.tonic, meter: '44', stepsPerBar: 16, stepsPerBeat: 4, bars: 4,
        chordAt, lo: this.tonic + 12, hi: this.tonic + 29, density: 0.15, end: 'open', leap: 0.5,
      });
      this.enqueue(start, this.ostHi, cm.notes.map((n) => ({ ...n, dur: Math.max(n.dur, 2) })), 0.6, true);
    }
  }

  private enqueue(start: number, inst: Player, notes: readonly MelNote[], vel: number, legatoAsTremolo = false): void {
    for (const n of notes) {
      const abs = start + n.at;
      if (abs < this.stepIndex) continue;
      if (legatoAsTremolo) {
        for (let k = 0; k < n.dur; k++) this.at(abs + k, inst, n.midi, 0.9, n.vel * vel * (k ? 0.7 : 1));
      } else this.at(abs, inst, n.midi, n.dur, n.vel * vel);
    }
  }

  onStep(s: Step): void {
    const p = Math.floor(s.bar / 4);
    if (!this.bars.has(s.bar)) this.plan(p);
    const bar = this.bars.get(s.bar) ?? [];
    if (!bar.length) return;
    const ch = chordIn(bar, s.sib, 16);
    const kind = this.kinds.get(s.bar) ?? 'D';
    const fig = this.figs.get(s.bar) ?? 'drive';
    const t = s.time;
    const bip = s.bar % 4; // bar in phrase
    const x = this.intensity;
    const brk = kind === 'K';
    const segLen = 16 / bar.length;
    const segStart = s.sib % segLen === 0;

    // chord tones in the ostinato register
    const root = this.tonic + 12 + ch.root;
    const r0 = root > this.tonic + 19 ? root - 12 : root;
    const pcs = chordPcs(this.tonic, ch);
    const third = r0 + (((pcs[1] ?? pc(r0 + 3)) - pc(r0) + 12) % 12);
    const fifth = r0 + (((pcs[2] ?? pc(r0 + 7)) - pc(r0) + 12) % 12);
    const nb = this.scale.step(fifth, 1);

    // ── string ostinato (16ths, 3+3+2 accents) ──
    const accent = [0, 3, 6, 8, 11, 14].includes(s.sib);
    const quiet = brk && bip < 2;
    if (!quiet || s.sub % 2 === 0) {
      let m: number;
      const k = s.sib % 8;
      if (fig === 'motif') m = [fifth, nb, fifth, third][s.sib % 4] ?? fifth;
      else if (fig === 'drive') m = [r0, r0, fifth, r0, r0 + 12, r0, fifth, r0][k] ?? r0;
      else m = [r0, third, fifth, r0 + 12, fifth, third, r0, third][k] ?? r0;
      if (quiet) m -= 12;
      const build = brk && bip >= 2 ? 0.6 + 0.4 * ((bip - 2) * 16 + s.sib) / 32 : 1;
      this.ost.play(this.h(t, 0.003), m, s.dur * 0.9, this.v((accent ? 0.86 : 0.56) * build, 0.04));
      if (this.on('l2') && !brk && (s.sub % 2 === 0 || this.on('l3'))) this.ostHi.play(this.h(t, 0.003), m + 12, s.dur * 0.9, this.v((accent ? 0.7 : 0.45), 0.04));
      if (this.st.flavor === 'marimba' && s.sub % 2 === 0) this.flav.play(this.h(t), m + 12, s.dur * 2, this.v(accent ? 0.75 : 0.5));
      if (this.st.flavor === 'celesta' && this.on('l2') && s.sub % 2 === 0) this.flav.play(this.h(t), m + 24, s.dur * 2, this.v(0.45));
    }

    // ── bass: 8ths with octave kicks ──
    if (s.sub % 2 === 0 && !quiet) {
      const bn = r0 - 24 < this.tonic - 14 ? r0 - 12 : r0 - 24;
      const oct = (s.sib === 6 || s.sib === 14) && x > 0.3;
      if (x > 0.15 || s.sub === 0) this.bass.play(this.h(t), oct ? bn + 12 : bn, s.dur * 1.7, this.v(s.sib === 0 ? 0.85 : 0.62));
    } else if (quiet && s.sib === 0) this.bass.play(t, r0 - 24, s.dur * 15, 0.7);

    // ── taiko ──
    const tp = bip === 3 ? 'X.......X...x.x.' : 'X.......X.......';
    const tc = tp[s.sib];
    // drums tuned to the harmony (root low, fifth high) like a film score
    const drumRoot = 41 + ((((this.tonic + ch.root - 41) % 12) + 18) % 12) - 6; // chord root nearest F2
    if (tc && tc !== '.') this.taiko.play(this.h(t, 0.003), drumRoot, 1, this.v(tc === 'X' ? 1 : 0.7));
    if (this.on('l1') && !quiet) {
      const t2 = '...x..x....x..x.'[s.sib];
      if (t2 === 'x') this.taiko2.play(this.h(t, 0.004), drumRoot + 7, 1, this.v(0.6));
      if (s.sib === 4 || s.sib === 12) this.snare.play(this.h(t, 0.003), 57, 0.2, this.v(0.8));
      if (s.sib === 0) this.timp.play(t, this.tonic - 12 + ch.root, 1, this.v(0.7));
    }
    if (this.on('l2') && !quiet && (s.sub % 2 === 0 || this.on('l3'))) {
      this.hat.play(this.h(t, 0.003), 60, 0.1, this.v(s.sub === 0 ? 0.55 : s.sub === 2 ? 0.42 : 0.28));
      if (bip === 0 && s.sib === 0) this.crash.play(t, 60, 2, this.v(0.8));
    }
    if (this.on('l3')) {
      if (bip === 3 && s.sib >= 8) this.toms.play(this.h(t, 0.003), drumRoot + 12 + ([0, 0, 3, 3, 7, 7, 10, 12][s.sib - 8] ?? 0), 0.5, this.v(0.45 + (s.sib - 8) * 0.06));
      if (bip === 0 && s.sib === 0) this.sub.play(t, this.tonic - 24 + ch.root, 1.5, 0.9);
    }
    if (brk && bip >= 2 && this.on('l1')) {
      // snare roll build-up
      const k2 = (bip - 2) * 16 + s.sib;
      if (k2 >= 16 || s.sub % 2 === 0) this.snare.play(this.h(t, 0.002), 57, 0.1, this.v(0.25 + (k2 / 32) * 0.6));
    }

    // ── brass stabs (development) ──
    if (kind === 'D' && !brk) {
      const pat = STABS[(Math.floor(s.bar / 2) + (this.seed % 4)) % STABS.length] ?? STABS[0] ?? '';
      const c = pat[s.sib];
      if (c === 'X') this.stab.chord(this.h(t, 0.003), this.tonic, ch, s.dur * 1.4, this.v((0.45 + 0.5 * x) * (s.sib === 0 ? 1 : 0.85)), 3, this.tonic + 3, this.tonic + 19);
    }

    // ── choir / organ ──
    if (segStart && this.on(this.boss ? 'l2' : 'l3')) this.choir.chord(t, this.tonic, ch, segLen * s.dur * 1.02, this.v(0.62, 0.03), 4, this.tonic + 5, this.tonic + 24);

    // ── flavors ──
    switch (this.st.flavor) {
      case 'anvil':
        if (s.sib === 4 || s.sib === 12 || (this.on('l2') && s.sib === 10)) this.flav.play(this.h(t, 0.003), this.tonic + (s.sib === 10 ? 31 : 36), 1, this.v(0.7));
        break;
      case 'harp':
        if (bip === 3 && s.sib === 12 && this.on('l1')) {
          // glissando into the next phrase
          const run = this.scale.notesIn(this.tonic + 5, this.tonic + 34);
          run.forEach((m, i) => this.flav.play(t + (i / run.length) * s.dur * 4, m, 0.6, 0.25 + 0.4 * (i / run.length)));
        }
        break;
      case 'snare':
        if (this.on('l1') && !brk) {
          const c = 'x..xx.x...x.x..x'[s.sib];
          if (c === 'x') this.flav.play(this.h(t, 0.002), 57, 0.1, this.v(0.3));
        }
        break;
      case 'organ':
        if (s.sib === 0 && bip % 2 === 0) this.flav.play(t, this.tonic - 12 + ((ch.root + 12) % 12), 1, this.v(0.6));
        break;
      case 'marimba':
        if (this.flav2 && this.on('l1')) {
          const c = '..x..x.x..x.x.x.'[s.sib];
          if (c === 'x') this.flav2.play(this.h(t), 52 + this.rng('cg', s.i).int(0, 7), 0.3, this.v(0.55));
        }
        break;
      default:
        break;
    }

    // ── boss bells ──
    if (this.bell && bip === 0 && s.sib === 0 && this.on('l1')) this.bell.play(t, this.tonic, 4, 0.8);
    if (this.boss && kind === 'M' && bip === 0 && s.sib === 0) {
      // sub boom that anchors each statement of the motif
      this.sub.play(t, this.tonic - 24, 2, 0.8);
    }
  }
}
