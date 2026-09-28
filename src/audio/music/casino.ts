/**
 * Casino: a mischievous lounge swing in F. Triplet grid (true swing), AABA form,
 * walking bass with chromatic approaches, brushes + ride, Rhodes comping with
 * rootless voicings, vibes melody, and in the B section (minor ii-V to Dm) the
 * leitmotif in a swung, syncopated jazz variant. Intensity adds a horn section
 * ("shouts" and wah-wah fills) and a hotter rhythm section with steel pan.
 */
import { genPhrase, fromRhythm } from '../core/melody';
import { type Chord, MODES, MOTIF, MOTIF_RHYTHM, Scale, chordPcs, clamp, motifChromatic, pc, prog, rootless } from '../core/theory';
import type { MusicMood, Region } from '../types';
import { type Inst, type Mono, type MusicHost, Piece, type Player, type Step, chordIn } from './piece';

const A = 'Imaj7 | VI7 | ii7 | V7 | iii7 VI7 | ii7 V7 | Imaj7 bIII7 | ii7 V7';
const A_END = 'Imaj7 | VI7 | ii7 | V7 | iii7 VI7 | ii7 V7 | Imaj7 VI7 | ii7 bII7';
const B = 'viiø7 IIIb9 | vi6 | viiø7 IIIb9 | vi6 | ii7 | V7 | ii7 | bII7';
const FORM = ['A', 'A', 'B', 'E'] as const;

const COMP_RHYTHMS: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
  [[0, 2], [5, 3]], // charleston
  [[2, 2], [8, 2]], // off-beat stabs
  [[0, 5], [11, 1]], // push into next bar
  [[0, 2], [6, 2], [11, 1]],
  [[3, 2], [8, 3]],
];

export class CasinoPiece extends Piece {
  private readonly tonic = 53; // F3
  private readonly scale = new Scale(53, MODES.ionian);
  private readonly bassI: Mono;
  private readonly ride: Mono;
  private readonly chick: Mono;
  private readonly brush: Mono;
  private readonly sweep: Mono;
  private readonly kick: Mono;
  private readonly snareG: Mono;
  private readonly comp: Inst;
  private readonly vibes: Inst;
  private readonly pan: Inst;
  private readonly horns: Inst;
  private readonly bells: Inst;
  private readonly bars = new Map<number, readonly Chord[]>();
  private readonly secs = new Map<number, string>();
  private lastBass = 41;
  private compRhythm: ReadonlyArray<readonly [number, number]> = COMP_RHYTHMS[0] ?? [];

  constructor(host: MusicHost, mood: MusicMood, region: Region, seed: number) {
    super(host, mood, region, seed);
    this.bpm = 126;
    this.spb = 3;
    this.bpb = 4;
    this.bassI = this.mono({ patch: 'bass_upright', vol: 0.85, wet: 0.1 });
    this.ride = this.mono({ patch: 'ride', vol: 0.9, wet: 0.2, pan: 0.35 });
    this.chick = this.mono({ patch: 'hat', vol: 0.35, wet: 0.08, pan: 0.3 });
    this.brush = this.mono({ patch: 'brush', vol: 0.55, wet: 0.15, pan: -0.1 });
    this.sweep = this.mono({ patch: 'sweep', vol: 0.6, wet: 0.15, pan: -0.1 });
    this.kick = this.mono({ patch: 'kick', vol: 0.3, wet: 0.05 });
    this.snareG = this.mono({ patch: 'snare', vol: 0.22, wet: 0.15, layer: 'hot', pan: -0.1 });
    this.comp = this.inst({ patch: 'epiano', vol: 0.5, wet: 0.22, max: 10, fx: ['chorus'], pan: -0.2 });
    this.vibes = this.inst({ patch: 'vibes', vol: 0.62, wet: 0.3, max: 5, fx: ['vibesTrem'], pan: 0.15 });
    this.pan = this.inst({ patch: 'steelpan', vol: 0.5, wet: 0.28, max: 4, layer: 'hot', pan: 0.3 });
    this.horns = this.inst({ patch: 'stab', vol: 0.5, wet: 0.25, max: 9, layer: 'horns' });
    this.bells = this.inst({ patch: 'glock', vol: 0.16, wet: 0.5, max: 3 });
    this.trim = 0.65;
  }

  protected override levels(x: number): Record<string, number> {
    return { horns: clamp((x - 0.45) / 0.12, 0, 1), hot: clamp((x - 0.75) / 0.12, 0, 1) };
  }

  private plan(section: number): void {
    const kind = FORM[section % FORM.length] ?? 'A';
    const bars = prog(kind === 'B' ? B : kind === 'E' ? A_END : A);
    const b0 = section * 8;
    for (let k = 0; k < 8; k++) {
      this.bars.set(b0 + k, bars[k] ?? []);
      this.secs.set(b0 + k, kind);
    }
    for (const key of this.bars.keys()) if (key < b0 - 16) {
      this.bars.delete(key);
      this.secs.delete(key);
    }
    const r = this.rng('cs', section);
    const start = b0 * 12;
    const chordAt = (st: number): Chord => chordIn(bars[Math.floor(st / 12) % 8] ?? [], st % 12, 12);
    const phrase = (off: number, bars4: number, end: 'open' | 'close', lo: number, hi: number, density: number): ReturnType<typeof genPhrase> =>
      genPhrase({
        rng: r, scale: this.scale, tonic: this.tonic, meter: 'swing', stepsPerBar: 12, stepsPerBeat: 3, bars: bars4,
        chordAt: (st) => chordAt(st + off * 12), lo, hi, density, end, chromatic: 0.3, leap: 0.45,
      });
    if (kind === 'B') {
      // the leitmotif, swung, over Em7b5 A7b9 | Dm6 — it lands on the 9th: a question in a smoky bar
      const mot = fromRhythm(MOTIF_RHYTHM.swing, motifChromatic(62), 0.8, MOTIF.stress);
      this.enq(start, this.vibes, mot);
      const ans = phrase(2, 2, 'open', 65, 84, 0.5);
      this.enq(start + 24, this.vibes, ans.notes);
      const call2 = phrase(4, 2, 'open', 67, 86, 0.6);
      this.enq(start + 48, this.pan, call2.notes);
      this.enq(start + 48, this.vibes, call2.notes.map((n) => ({ ...n, midi: n.midi - 12, vel: n.vel * 0.55 })));
      const end = phrase(6, 2, 'close', 65, 84, 0.45);
      this.enq(start + 72, this.vibes, end.notes);
    } else {
      const call = phrase(0, 2, 'open', 65, 84, 0.55);
      const resp = phrase(2, 2, 'open', 65, 84, 0.45);
      const call2 = phrase(4, 2, 'open', 65, 86, 0.6);
      const close = phrase(6, 2, kind === 'E' ? 'close' : 'open', 62, 82, 0.4);
      this.enq(start, this.vibes, call.notes);
      this.enq(start + 24, this.pan, resp.notes);
      this.enq(start + 24, this.vibes, resp.notes.map((n) => ({ ...n, vel: n.vel * 0.5 })));
      this.enq(start + 48, this.vibes, call2.notes);
      this.enq(start + 72, this.vibes, close.notes);
    }
  }

  private enq(start: number, inst: Player, notes: ReadonlyArray<{ at: number; dur: number; midi: number; vel: number }>): void {
    for (const n of notes) {
      const abs = start + n.at;
      if (abs >= this.stepIndex) this.at(abs, inst, n.midi, n.dur, n.vel);
    }
  }

  private chordAtBar(bar: number, sib: number): Chord | null {
    if (!this.bars.has(bar)) this.plan(Math.floor(bar / 8));
    const b = this.bars.get(bar);
    return b && b.length ? chordIn(b, sib, 12) : null;
  }

  private nearest(p: number, around: number, lo: number, hi: number): number {
    let best = lo;
    let bd = 99;
    for (let m = lo; m <= hi; m++) {
      if (pc(m) !== p) continue;
      const d = Math.abs(m - around);
      if (d < bd) {
        bd = d;
        best = m;
      }
    }
    return best;
  }

  private walk(s: Step, ch: Chord): void {
    const lo = 34;
    const hi = 53;
    const r = this.rng('wb', s.i);
    const bar = this.bars.get(s.bar) ?? [];
    const per = 4 / Math.max(1, bar.length);
    const pos = s.beat % per;
    const prev = this.lastBass;
    let m: number;
    if (pos === 0) {
      m = this.nearest(pc(this.tonic + ch.bass), prev, lo, hi);
      if (Math.abs(m - prev) > 7 && r.chance(0.5)) m += m > prev ? -12 : 12;
    } else if (pos === per - 1) {
      const nx = s.beat === 3 ? this.chordAtBar(s.bar + 1, 0) : this.chordAtBar(s.bar, (s.beat + 1) * 3);
      const tgt = this.nearest(pc(this.tonic + (nx ?? ch).root), prev, lo + 1, hi - 1);
      m = r.chance(0.7) ? tgt + (tgt >= prev ? -1 : 1) : tgt + 7 <= hi ? tgt + 7 : tgt - 5;
    } else {
      const tones = chordPcs(this.tonic, ch);
      let best = prev;
      let bs = -99;
      for (let c = lo; c <= hi; c++) {
        if (!tones.includes(pc(c)) && !(this.scale.has(c) && r.chance(0.3))) continue;
        const d = Math.abs(c - prev);
        if (d === 0 || d > 5) continue;
        const sc = -d + r.next() * 2.5;
        if (sc > bs) {
          bs = sc;
          best = c;
        }
      }
      m = best;
    }
    m = clamp(m, lo, hi);
    this.lastBass = m;
    this.bassI.play(this.h(s.time, 0.004), m, s.dur * 2.8, this.v(pos === 0 ? 0.82 : 0.7, 0.05));
  }

  onStep(s: Step): void {
    const ch = this.chordAtBar(s.bar, s.sib);
    if (!ch) return;
    const t = s.time;
    const sec = this.secs.get(s.bar) ?? 'A';
    const bar8 = s.bar % 8;
    const x = this.intensity;

    // walking bass on the beats, with the odd swung ghost note
    if (s.sub === 0) this.walk(s, ch);
    else if (s.sub === 2 && s.beat === 2 && this.rng('gh', s.i).chance(0.22)) this.bassI.play(t, this.lastBass, s.dur, 0.28);

    // ride "spang-a-lang" + hat on 2 & 4
    if ([0, 3, 5, 6, 9, 11].includes(s.sib)) {
      const vel = s.sub === 2 ? 0.42 : s.beat % 2 === 1 ? 0.7 : 0.56;
      this.ride.play(this.h(t, 0.004), 60, 1, this.v(vel * (0.85 + x * 0.3), 0.05));
    }
    if (s.sub === 0 && s.beat % 2 === 1) {
      this.chick.play(this.h(t, 0.003), 60, 0.1, this.v(0.55));
      this.brush.play(this.h(t, 0.003), 60, 0.2, this.v(0.62));
    }
    if (s.sub === 0 && s.beat % 2 === 0) this.sweep.play(this.h(t, 0.01), 60, 0.35, this.v(0.5));
    if (s.sub === 0) this.kick.play(t, 36, 0.2, this.v(0.22 + (x > 0.8 && s.beat === 0 ? 0.3 : 0)));
    if (this.on('hot') && s.sub === 2 && this.rng('sg', s.i).chance(0.3)) this.snareG.play(this.h(t), 50, 0.1, this.v(0.3));
    if (this.on('hot') && s.sub === 2 && s.beat === 3 && this.rng('bomb', s.i).chance(0.25)) this.kick.play(t, 36, 0.3, 0.75);

    // comping (Rhodes, rootless)
    if (s.sib === 0) this.compRhythm = this.rng('cr', s.bar).pick(COMP_RHYTHMS);
    for (const [on, d] of this.compRhythm) {
      if (on !== s.sib) continue;
      const target = on === 11 ? this.chordAtBar(s.bar + 1, 0) ?? ch : ch;
      this.comp.chord(this.h(t, 0.006), this.tonic, rootless(target), d * s.dur * 0.95, this.v(0.5), 4, 53, 70, 0.008);
    }

    // horn section shouts (intensity >= ~0.5)
    if (this.on('horns')) {
      const hit = (bar8 === 3 || bar8 === 7) && s.sib === 11 ? this.chordAtBar(s.bar + 1, 0) : bar8 === 4 && (s.sib === 0 || s.sib === 5) ? ch : null;
      if (hit) this.horns.chord(this.h(t, 0.004), this.tonic, rootless(hit), s.dur * (s.sib === 11 ? 1.5 : 2.2), this.v(0.72), 4, 60, 79);
      if (sec === 'B' && bar8 === 7 && s.sib === 6) {
        // wah-wah: a muted trumpet sighing downward
        const n = this.tonic + 22;
        this.horns.play(t, n, s.dur * 5, 0.7, { bend: { cents: -250, at: t + s.dur * 2, tau: 0.12 } });
      }
    }

    // a tiny "ka-ching" at the top of each chorus
    if (s.bar % 32 === 0 && s.sib === 0 && s.bar > 0) {
      this.bells.play(t, 96, 0.5, 0.55);
      this.bells.play(t + s.dur, 100, 0.8, 0.5);
    }
  }
}
