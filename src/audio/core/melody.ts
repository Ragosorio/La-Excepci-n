/**
 * Melody generation: rhythm vocabularies per meter + a weighted, voice-leading
 * aware pitch chooser (stepwise motion, chord tones on strong beats, leap
 * recovery, arch contour, open/closed cadences).
 */
import type { Rng } from './rng';
import { type Chord, type Rhythm, Scale, clamp, isChordTone, pc } from './theory';

export interface MelNote {
  /** onset in grid steps, relative to phrase start */
  at: number;
  dur: number;
  midi: number;
  vel: number;
}

export type Meter = '44' | '34' | '68' | 'swing';

/** One bar rhythms ([onset, dur] in steps). 4/4 & 3/4 & 6/8 use a 16th grid; swing uses triplets. */
const BARS: Record<Meter, { calm: Rhythm[]; busy: Rhythm[]; cad: Rhythm[] }> = {
  '44': {
    calm: [
      [[0, 8], [8, 8]],
      [[0, 4], [4, 4], [8, 8]],
      [[0, 6], [6, 2], [8, 8]],
      [[0, 4], [4, 4], [8, 4], [12, 4]],
      [[0, 6], [6, 2], [8, 4], [12, 4]],
      [[0, 12], [12, 4]],
      [[4, 4], [8, 4], [12, 4]],
      [[0, 8], [8, 4], [12, 4]],
      [[0, 4], [4, 8], [12, 4]],
    ],
    busy: [
      [[0, 2], [2, 2], [4, 4], [8, 4], [12, 4]],
      [[0, 4], [4, 2], [6, 2], [8, 4], [12, 4]],
      [[0, 3], [3, 3], [6, 2], [8, 8]],
      [[0, 2], [2, 2], [4, 2], [6, 2], [8, 8]],
      [[0, 6], [6, 2], [8, 2], [10, 2], [12, 4]],
      [[0, 4], [4, 4], [8, 2], [10, 2], [12, 4]],
      [[2, 2], [4, 2], [6, 2], [8, 4], [12, 4]],
    ],
    cad: [[[0, 16]], [[0, 8], [8, 8]], [[0, 12]], [[0, 4], [4, 12]], [[0, 6], [6, 2], [8, 8]]],
  },
  '34': {
    calm: [
      [[0, 8], [8, 4]],
      [[0, 4], [4, 4], [8, 4]],
      [[0, 6], [6, 2], [8, 4]],
      [[0, 4], [4, 8]],
      [[0, 12]],
    ],
    busy: [
      [[0, 2], [2, 2], [4, 4], [8, 4]],
      [[0, 4], [4, 2], [6, 2], [8, 4]],
      [[0, 6], [6, 2], [8, 2], [10, 2]],
      [[0, 2], [2, 2], [4, 2], [6, 2], [8, 4]],
    ],
    cad: [[[0, 12]], [[0, 8], [8, 4]], [[0, 4], [4, 8]]],
  },
  '68': {
    calm: [
      [[0, 6], [6, 6]],
      [[0, 4], [4, 2], [6, 4], [10, 2]],
      [[0, 6], [6, 4], [10, 2]],
      [[0, 4], [4, 2], [6, 6]],
    ],
    busy: [
      [[0, 2], [2, 2], [4, 2], [6, 4], [10, 2]],
      [[0, 4], [4, 2], [6, 2], [8, 2], [10, 2]],
      [[0, 2], [2, 2], [4, 2], [6, 6]],
    ],
    cad: [[[0, 12]], [[0, 6], [6, 6]], [[0, 4], [4, 8]]],
  },
  swing: {
    calm: [
      [[0, 3], [3, 3], [6, 6]],
      [[0, 2], [2, 4], [6, 3], [9, 3]],
      [[0, 6], [6, 2], [8, 4]],
      [[2, 1], [3, 3], [6, 6]],
    ],
    busy: [
      [[0, 2], [2, 1], [3, 2], [5, 1], [6, 3], [9, 3]],
      [[0, 2], [2, 1], [3, 2], [5, 4], [9, 3]],
      [[0, 3], [3, 2], [5, 1], [6, 2], [8, 1], [9, 3]],
      [[2, 1], [3, 2], [5, 1], [6, 2], [8, 4]],
    ],
    cad: [[[0, 12]], [[0, 3], [3, 9]], [[0, 2], [2, 10]]],
  },
};

export interface PhraseOpts {
  rng: Rng;
  scale: Scale;
  tonic: number;
  meter: Meter;
  stepsPerBar: number;
  stepsPerBeat: number;
  bars: number;
  /** chord at phrase step */
  chordAt: (step: number) => Chord;
  lo: number;
  hi: number;
  /** 0..1 rhythmic density */
  density: number;
  /** 'close' ends on the tonic, 'open' on another chord tone (question). */
  end: 'open' | 'close';
  startNear?: number;
  /** jazz: chromatic approach tones */
  chromatic?: number;
  /** 0..1, larger = more leaps */
  leap?: number;
  /** reuse this rhythm (from a previous phrase) instead of generating one */
  rhythm?: Rhythm[];
}

export interface Phrase {
  notes: MelNote[];
  rhythm: Rhythm[];
}

export function genRhythm(rng: Rng, meter: Meter, bars: number, density: number): Rhythm[] {
  const v = BARS[meter];
  const out: Rhythm[] = [];
  const a = rng.chance(density) ? rng.pick(v.busy) : rng.pick(v.calm);
  const b = rng.chance(density * 0.9) ? rng.pick(v.busy) : rng.pick(v.calm);
  for (let i = 0; i < bars; i++) {
    if (i === bars - 1) out.push(rng.pick(v.cad));
    else if (bars >= 4 && i === 2) out.push(a); // antecedent/consequent rhyme
    else out.push(i % 2 === 0 ? a : b);
  }
  return out;
}

/** Generate one melodic phrase. */
export function genPhrase(o: PhraseOpts): Phrase {
  const { rng, scale, tonic, stepsPerBar, stepsPerBeat } = o;
  const rhythm = o.rhythm ?? genRhythm(rng, o.meter, o.bars, o.density);
  const slots: Array<readonly [number, number]> = [];
  rhythm.forEach((bar, bi) => {
    for (const [on, d] of bar) slots.push([bi * stepsPerBar + on, d]);
  });
  const total = o.bars * stepsPerBar;
  const cands = scale.notesIn(o.lo, o.hi);
  const notes: MelNote[] = [];
  let prev = o.startNear ?? Math.round((o.lo + o.hi) / 2);
  let lastIv = 0;
  let repeats = 0;
  const leap = o.leap ?? 0.3;
  const peakAt = rng.range(0.45, 0.7);
  for (let k = 0; k < slots.length; k++) {
    const [at, dur] = slots[k] as readonly [number, number];
    const ch = o.chordAt(at);
    const beatStart = at % stepsPerBeat === 0;
    const downbeat = at % stepsPerBar === 0;
    const last = k === slots.length - 1;
    const long = dur >= stepsPerBeat * 2;
    const prog = at / total;
    const target = o.lo + (o.hi - o.lo) * (0.3 + 0.45 * Math.sin(Math.PI * clamp(prog / (peakAt * 2), 0, 1)));
    let pool = cands;
    if (o.chromatic && !beatStart && rng.chance(o.chromatic)) {
      // chromatic neighbour of the previous note (jazz approach)
      pool = [...cands, prev + 1, prev - 1];
    }
    const weights: number[] = [];
    for (const c of pool) {
      const iv = c - prev;
      const a = Math.abs(iv);
      let s = 0;
      if (a === 0) s += repeats >= 1 ? -3 : -0.4;
      else if (a <= 2) s += 2.2;
      else if (a <= 4) s += 1.2 + leap * 0.5;
      else if (a === 6) s -= 2.5;
      else if (a <= 7) s += -0.2 + leap * 1.2;
      else if (a <= 12) s += -1.8 + leap * 1.4;
      else s -= 4;
      if (Math.abs(lastIv) > 4) {
        if (Math.sign(iv) === Math.sign(lastIv)) s -= 1.6;
        else if (a <= 2) s += 1.2;
      }
      const ct = isChordTone(tonic, ch, c);
      if (downbeat) s += ct ? 2.6 : -2.2;
      else if (beatStart) s += ct ? 1.6 : -0.8;
      else s += ct ? 0.3 : 0;
      if (long) s += ct ? 1.4 : -1.6;
      if (!scale.has(c)) s -= 0.4; // chromatic tones only as passing
      s -= Math.abs(c - target) * 0.09;
      if (last) {
        const isTonic = pc(c) === pc(tonic);
        if (o.end === 'close') s += isTonic ? 4.5 : ct ? -0.5 : -4;
        else s += isTonic ? -1.5 : ct ? 2.2 : -2;
      }
      weights.push(Math.exp(s / 0.75));
    }
    const m = rng.weighted(pool, weights);
    const accent = downbeat ? 0.12 : beatStart ? 0.05 : -0.04;
    const arch = 0.1 * Math.sin(Math.PI * prog);
    notes.push({ at, dur, midi: m, vel: clamp(0.62 + accent + arch + rng.jit(0.05), 0.2, 1) });
    lastIv = m - prev;
    repeats = m === prev ? repeats + 1 : 0;
    prev = m;
  }
  return { notes, rhythm };
}

/** Light variation of an existing phrase: passing tones, neighbour ornaments, octave or rhythm tweaks. */
export function varyPhrase(src: readonly MelNote[], rng: Rng, scale: Scale, amount: number): MelNote[] {
  const out: MelNote[] = [];
  for (let i = 0; i < src.length; i++) {
    const n = src[i] as MelNote;
    const next = src[i + 1];
    if (next && n.dur >= 4 && Math.abs(next.midi - n.midi) >= 3 && Math.abs(next.midi - n.midi) <= 4 && rng.chance(amount)) {
      // split: passing tone toward the next note
      const half = Math.floor(n.dur / 2);
      out.push({ ...n, dur: half });
      const pass = scale.step(n.midi, next.midi > n.midi ? 1 : -1);
      out.push({ at: n.at + half, dur: n.dur - half, midi: pass, vel: n.vel * 0.85 });
    } else if (n.dur >= 6 && rng.chance(amount * 0.5)) {
      // upper neighbour turn
      const q = Math.max(1, Math.floor(n.dur / 3));
      out.push({ ...n, dur: q });
      out.push({ at: n.at + q, dur: q, midi: scale.step(n.midi, 1), vel: n.vel * 0.8 });
      out.push({ at: n.at + 2 * q, dur: n.dur - 2 * q, midi: n.midi, vel: n.vel * 0.9 });
    } else {
      out.push({ ...n, vel: clamp(n.vel + rng.jit(0.06), 0.2, 1) });
    }
  }
  return out;
}

/** Build notes from a rhythm and pitch list. */
export function fromRhythm(r: Rhythm, pitches: readonly number[], vel = 0.75, stress?: readonly number[]): MelNote[] {
  return r.map(([at, dur], i) => ({
    at,
    dur,
    midi: pitches[i % pitches.length] as number,
    vel: clamp(vel + ((stress?.[i] ?? 0) ? 0.1 : 0), 0, 1),
  }));
}
