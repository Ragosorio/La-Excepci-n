/**
 * Exploration music (overworld, overworld_night, location) for every region.
 * A data-driven ensemble: region styles define mode, tempo, progressions and the
 * instrument palette; ExplorePiece turns them into an evolving form
 * (intro -> A a B b M a C C, repeating), with a per-session theme that returns
 * with variations, and the leitmotif hidden in the M phrase (mapped into the
 * region's mode).
 */
import { type MelNote, type Meter, fromRhythm, genPhrase, varyPhrase } from '../core/melody';
import {
  type Chord, MODES, MOTIF, MOTIF_RHYTHM, type Rhythm, Scale, chordToneLadder, clamp, motifInScale, prog,
} from '../core/theory';
import type { MusicMood, Region } from '../types';
import { type Inst, type InstCfg, type Mono, type MusicHost, Piece, type Step, chordIn } from './piece';

export interface PercTrack {
  cfg: InstCfg;
  pitch: number;
  /** X=accent x=normal o=ghost r=flam .=rest ; indexed over consecutive steps (may span bars) */
  pat: string;
  /** sections where it plays (default: all but intro/breakdown) */
  sections?: string;
  /** random pitch spread in semitones (with `tune`: random chord tone instead) */
  spread?: number;
  /** follow the harmony: pitch becomes the chord root / fifth / key tonic nearest to `pitch` */
  tune?: 'root' | 'fifth' | 'tonic';
}

export interface ExploreStyle {
  name: string;
  tonic: number;
  mode: readonly number[];
  bpm: number;
  bpb: number;
  spb: number;
  meter: Meter;
  swing?: number;
  phraseBars: number;
  progA: readonly string[];
  progB: readonly string[];
  progC: readonly string[];
  motifProg: string;
  motifRhythm: Rhythm;
  pad?: { cfg: InstCfg; n: number; lo: number; hi: number; vel?: number; rhythm?: 'hold' | 'beats' };
  arp?: { cfg: InstCfg; pat: readonly number[]; rate: number; lo: number; hi: number; vel?: number; mode?: 'chord' | 'scale'; gliss?: boolean };
  bass?: { cfg: InstCfg; lo: number; hi: number; pat: 'hold' | 'half' | 'beats' | 'oompah' | 'calypso' | 'pulse8'; vel?: number };
  comp?: { cfg: InstCfg; n: number; lo: number; hi: number; pat: string; vel?: number };
  lead: { cfg: InstCfg; lo: number; hi: number; density: number; leap?: number; roll?: boolean; vel?: number };
  lead2?: { cfg: InstCfg; lo: number; hi: number; density: number; roll?: boolean; vel?: number };
  motif?: { cfg: InstCfg; lo: number; hi: number; vel?: number };
  sparkle?: { cfg: InstCfg; prob: number; lo: number; hi: number; vel?: number };
  choir?: { cfg: InstCfg; n: number; lo: number; hi: number; vel?: number };
  perc?: readonly PercTrack[];
  trim?: number;
}

const rest = (n: number): string => '.'.repeat(n);

/** The note with the pitch class of `p` nearest to `around`. */
function nearestPc(p: number, around: number): number {
  const d = ((((p - around) % 12) + 18) % 12) - 6;
  return around + d;
}

// ───────────────────────────── region styles ─────────────────────────────

const VALDORIA: ExploreStyle = {
  name: 'valdoria', tonic: 62, mode: MODES.dorian, bpm: 88, bpb: 4, spb: 4, meter: '44', phraseBars: 4,
  trim: 0.93,
  progA: ['i | bIII | IV | i', 'i | IV | bVII | IV', 'i | bVII | IV | i'],
  progB: ['bIII | IV | v | i', 'bVII | IV | bIII | IV', 'ii | IV | v | bVII', 'bIII | bVII | IV | IV'],
  progC: ['i | i | bVII | bVII', 'i | IV/I | i | IV/I'],
  motifProg: 'i bIII | bVII | IV | i',
  motifRhythm: MOTIF_RHYTHM.r44,
  pad: { cfg: { patch: 'strings_warm', vol: 0.55, wet: 0.35, fx: ['chorus'], max: 10 }, n: 4, lo: 50, hi: 72, vel: 0.55 },
  arp: { cfg: { patch: 'harp', vol: 0.4, wet: 0.35, max: 10, pan: -0.25 }, pat: [0, 1, 2, 3, 4, 3, 2, 1], rate: 2, lo: 50, hi: 81, vel: 0.5, gliss: true },
  bass: { cfg: { patch: 'low_strings', vol: 0.6, wet: 0.2 }, lo: 38, hi: 50, pat: 'half', vel: 0.6 },
  lead: { cfg: { patch: 'horn', vol: 0.62, wet: 0.4, max: 3, pan: 0.1 }, lo: 57, hi: 74, density: 0.35, leap: 0.45 },
  lead2: { cfg: { patch: 'flute', vol: 0.48, wet: 0.45, max: 3, pan: 0.15 }, lo: 69, hi: 86, density: 0.5 },
  motif: { cfg: { patch: 'horn', vol: 0.62, wet: 0.5, max: 3 }, lo: 57, hi: 74 },
  choir: { cfg: { patch: 'choir', vol: 0.36, wet: 0.5, fx: ['formantA', 'chorus'], layer: 'high', max: 8 }, n: 4, lo: 57, hi: 76 },
  perc: [
    { cfg: { patch: 'timpani', vol: 0.45, wet: 0.3 }, pitch: 38, pat: 'X' + rest(63), sections: 'AMBa', tune: 'root' },
    { cfg: { patch: 'snare', vol: 0.28, wet: 0.2, layer: 'perc' }, pitch: 50, pat: 'x..o.o..x..o.oo.', sections: 'BbM' },
  ],
};

const SYLVARIA: ExploreStyle = {
  name: 'sylvaria', tonic: 65, mode: MODES.lydian, bpm: 70, bpb: 4, spb: 4, meter: '44', phraseBars: 4,
  trim: 1.08,
  progA: ['I | II | I | II', 'Imaj7 | II | iii | II', 'I | II | vii | iii'],
  progB: ['vi | II | I | V', 'vi | iii | II | I', 'iii | vi | II | V'],
  progC: ['I | II/I | I | II/I'],
  motifProg: 'I II | Imaj9 | vi | II',
  motifRhythm: MOTIF_RHYTHM.r44,
  pad: { cfg: { patch: 'choir', vol: 0.42, wet: 0.6, fx: ['formantU', 'chorusWide'], max: 10 }, n: 4, lo: 55, hi: 74, vel: 0.42 },
  arp: { cfg: { patch: 'harp', vol: 0.42, wet: 0.45, max: 12 }, pat: [0, 1, 2, 4, 3, 5, 4, 2], rate: 2, lo: 53, hi: 86, vel: 0.45, gliss: true },
  bass: { cfg: { patch: 'harp', vol: 0.55, wet: 0.4 }, lo: 41, hi: 53, pat: 'hold', vel: 0.55 },
  lead: { cfg: { patch: 'flute', vol: 0.5, wet: 0.5, max: 3 }, lo: 72, hi: 89, density: 0.35, leap: 0.4 },
  lead2: { cfg: { patch: 'celesta', vol: 0.4, wet: 0.55, max: 4 }, lo: 77, hi: 94, density: 0.4 },
  motif: { cfg: { patch: 'flute', vol: 0.5, wet: 0.6, max: 3 }, lo: 69, hi: 86 },
  sparkle: { cfg: { patch: 'glock', vol: 0.16, wet: 0.75 }, prob: 0.07, lo: 84, hi: 100 },
  choir: { cfg: { patch: 'strings_warm', vol: 0.38, wet: 0.5, fx: ['chorus'], layer: 'high' }, n: 4, lo: 60, hi: 79 },
  perc: [{ cfg: { patch: 'glock', vol: 0.12, wet: 0.85, layer: 'perc' }, pitch: 101, pat: 'x' + rest(31), tune: 'tonic' }],
};

const KHARAZ: ExploreStyle = {
  name: 'kharaz', tonic: 52, mode: MODES.phrygian, bpm: 80, bpb: 4, spb: 4, meter: '44', phraseBars: 4,
  trim: 1.06,
  progA: ['i | bII | i | bII', 'i | bVII | bVI | bII', 'i | iv | bII | i'],
  progB: ['bVI | bVII | i | i', 'iv | bVI | bII | i', 'bIII | bII | i | bvii'],
  progC: ['i | i | bII | bII'],
  motifProg: 'i bII | bvii | bVI | bII',
  motifRhythm: MOTIF_RHYTHM.r44,
  pad: { cfg: { patch: 'low_strings', vol: 0.45, wet: 0.3, fx: ['chorus'], max: 8 }, n: 3, lo: 40, hi: 62, vel: 0.5 },
  arp: { cfg: { patch: 'pizz', vol: 0.45, wet: 0.25, max: 6 }, pat: [0, 0, 1, 0, 0, 0, -1, 0], rate: 2, lo: 40, hi: 55, vel: 0.55, mode: 'scale' },
  bass: { cfg: { patch: 'low_strings', vol: 0.6, wet: 0.2 }, lo: 28, hi: 40, pat: 'hold', vel: 0.62 },
  lead: { cfg: { patch: 'horn', vol: 0.68, wet: 0.45, max: 3 }, lo: 50, hi: 67, density: 0.3, leap: 0.3 },
  lead2: { cfg: { patch: 'brass', vol: 0.4, wet: 0.4, max: 3 }, lo: 45, hi: 62, density: 0.3 },
  motif: { cfg: { patch: 'horn', vol: 0.7, wet: 0.55, max: 3 }, lo: 48, hi: 65 },
  choir: { cfg: { patch: 'choir', vol: 0.48, wet: 0.45, fx: ['formantO'], layer: 'high', max: 8 }, n: 3, lo: 43, hi: 62 },
  perc: [
    { cfg: { patch: 'taiko', vol: 0.8, wet: 0.25 }, pitch: 40, pat: 'X.......x.......X.......x...x...', sections: 'AaBbM', tune: 'root' },
    { cfg: { patch: 'anvil', vol: 0.28, wet: 0.35, layer: 'perc' }, pitch: 88, pat: '....x.......x...', sections: 'AaBbM', tune: 'tonic' },
    { cfg: { patch: 'taiko', vol: 0.45, wet: 0.2, layer: 'perc' }, pitch: 47, pat: '..........x.x.x.' + rest(16), sections: 'Bb', tune: 'fifth' },
  ],
};

const MORVENNA: ExploreStyle = {
  name: 'morvenna', tonic: 59, mode: MODES.harmonicMinor, bpm: 132, bpb: 3, spb: 4, meter: '34', phraseBars: 8,
  trim: 1.74,
  progA: ['i | iv | V | i | bVI | iv | V | V', 'i | i | iv | iv | V | V | i | i', 'i | bVI | ii° | V | i | iv | V | i'],
  progB: ['bVI | iv | V | i | bVI | ii° | V | V', 'iv | i | V | bVI | iv | i | V7 | i', 'bII | V | i | i | iv | vii°7 | i | V'],
  progC: ['i | i | bVI | bVI | iv | iv | V | V'],
  motifProg: 'i | bVI | V | V | i | iv | V | i',
  motifRhythm: MOTIF_RHYTHM.r34,
  pad: { cfg: { patch: 'glasspad', vol: 0.4, wet: 0.55, fx: ['chorusWide'], max: 8 }, n: 3, lo: 59, hi: 76, vel: 0.35 },
  bass: { cfg: { patch: 'pizz', vol: 0.7, wet: 0.2 }, lo: 35, hi: 50, pat: 'oompah', vel: 0.75 },
  comp: { cfg: { patch: 'pizz', vol: 0.4, wet: 0.25, max: 9 }, n: 3, lo: 54, hi: 67, pat: '....x...x...', vel: 0.5 },
  lead: { cfg: { patch: 'celesta', vol: 0.55, wet: 0.45, max: 4 }, lo: 71, hi: 90, density: 0.4, leap: 0.45 },
  lead2: { cfg: { patch: 'clarinet', vol: 0.5, wet: 0.35, max: 2 }, lo: 55, hi: 74, density: 0.35 },
  motif: { cfg: { patch: 'celesta', vol: 0.6, wet: 0.55, max: 4 }, lo: 71, hi: 88 },
  choir: { cfg: { patch: 'tremolo', vol: 0.28, wet: 0.5, fx: ['trem'], layer: 'high', max: 6 }, n: 3, lo: 66, hi: 83 },
  perc: [{ cfg: { patch: 'woodblock', vol: 0.18, wet: 0.3, layer: 'perc' }, pitch: 84, pat: 'x...o...o...', sections: 'ABM' }],
};

const ISLAS: ExploreStyle = {
  name: 'islas', tonic: 55, mode: MODES.mixolydian, bpm: 108, bpb: 4, spb: 4, meter: '44', swing: 0.56, phraseBars: 4,
  trim: 1.02,
  progA: ['I | IV | bVII | I', 'I | vi | IV | V', 'I | bVII | IV | I'],
  progB: ['IV | I | V | I', 'ii | V | I | vi', 'IV | IV | I | V'],
  progC: ['I | IV | I | IV'],
  motifProg: 'I vi | bVII | IV | V',
  motifRhythm: MOTIF_RHYTHM.r44,
  pad: { cfg: { patch: 'strings_warm', vol: 0.22, wet: 0.35 }, n: 3, lo: 55, hi: 72, vel: 0.35 },
  bass: { cfg: { patch: 'bass_upright', vol: 0.72, wet: 0.12 }, lo: 36, hi: 52, pat: 'calypso', vel: 0.75 },
  comp: { cfg: { patch: 'marimba', vol: 0.32, wet: 0.2, max: 12 }, n: 3, lo: 60, hi: 76, pat: '..x...x...x...x.', vel: 0.55 },
  lead: { cfg: { patch: 'steelpan', vol: 0.6, wet: 0.3, max: 4 }, lo: 67, hi: 86, density: 0.55, leap: 0.35 },
  lead2: { cfg: { patch: 'marimba', vol: 0.55, wet: 0.25, max: 6 }, lo: 64, hi: 84, density: 0.5, roll: true },
  motif: { cfg: { patch: 'steelpan', vol: 0.6, wet: 0.4, max: 4 }, lo: 67, hi: 84 },
  perc: [
    { cfg: { patch: 'shaker', vol: 0.5, wet: 0.1 }, pitch: 60, pat: 'o.x.o.x.o.x.o.xo', sections: 'IAaBbMC' },
    { cfg: { patch: 'conga', vol: 0.5, wet: 0.15, layer: 'perc' }, pitch: 57, pat: '...x..x....x.xx.', spread: 5, tune: 'root' },
    { cfg: { patch: 'woodblock', vol: 0.3, wet: 0.15, layer: 'perc' }, pitch: 79, pat: 'x..x..x...x.x...', tune: 'tonic' },
    { cfg: { patch: 'kick', vol: 0.4, wet: 0.05, layer: 'perc' }, pitch: 36, pat: 'x.......x.......', tune: 'root' },
  ],
};

const CONCORDIA: ExploreStyle = {
  name: 'concordia', tonic: 63, mode: MODES.ionian, bpm: 64, bpb: 4, spb: 4, meter: '44', phraseBars: 4,
  trim: 2.45,
  progA: ['I | IV | I | V', 'I | vi | IV | V', 'I | iii | IV | I'],
  progB: ['vi | IV | I | V', 'IV | iv | I | V', 'ii | V | iii | vi'],
  progC: ['I | IV/I | I | V/I'],
  motifProg: 'I vi | Vsus4 V | IV | V',
  motifRhythm: MOTIF_RHYTHM.r44,
  pad: { cfg: { patch: 'organ', vol: 0.5, wet: 0.5, fx: ['chorus'], max: 10 }, n: 4, lo: 51, hi: 72, vel: 0.5 },
  bass: { cfg: { patch: 'organ', vol: 0.5, wet: 0.45 }, lo: 31, hi: 43, pat: 'hold', vel: 0.55 },
  lead: { cfg: { patch: 'horn', vol: 0.5, wet: 0.5, max: 3 }, lo: 58, hi: 75, density: 0.25, leap: 0.4 },
  lead2: { cfg: { patch: 'strings', vol: 0.45, wet: 0.45, max: 3, fx: ['chorus'] }, lo: 63, hi: 81, density: 0.3 },
  motif: { cfg: { patch: 'horn', vol: 0.5, wet: 0.6, max: 3 }, lo: 58, hi: 75 },
  sparkle: { cfg: { patch: 'bell', vol: 0.1, wet: 0.85 }, prob: 0.015, lo: 63, hi: 75 },
  choir: { cfg: { patch: 'choir', vol: 0.36, wet: 0.6, fx: ['formantO', 'chorus'], layer: 'high' }, n: 4, lo: 55, hi: 74 },
  perc: [{ cfg: { patch: 'timpani', vol: 0.42, wet: 0.4, layer: 'perc' }, pitch: 39, pat: 'x' + rest(63), sections: 'Bb', tune: 'root' }],
};

export const DAY: Record<Region, ExploreStyle> = {
  valdoria: VALDORIA, sylvaria: SYLVARIA, kharaz: KHARAZ, morvenna: MORVENNA, islas: ISLAS, concordia: CONCORDIA,
};

/** Night = same grid/harmony (phase-locked with day), sparser & darker orchestration. */
const NIGHT_OVERRIDES: Record<Region, Partial<ExploreStyle>> = {
  valdoria: {
    trim: 0.91,
    arp: { cfg: { patch: 'harp', vol: 0.36, wet: 0.5, max: 8, pan: -0.2 }, pat: [0, 2, 1, 3], rate: 4, lo: 50, hi: 76, vel: 0.42 },
    pad: { cfg: { patch: 'strings_warm', vol: 0.45, wet: 0.45, fx: ['chorus', 'lp:1500'], max: 10 }, n: 4, lo: 48, hi: 69, vel: 0.5 },
    lead: { cfg: { patch: 'flute', vol: 0.42, wet: 0.55, max: 3 }, lo: 62, hi: 79, density: 0.22, leap: 0.3 },
    lead2: { cfg: { patch: 'celesta', vol: 0.32, wet: 0.6, max: 4 }, lo: 74, hi: 91, density: 0.25 },
    motif: { cfg: { patch: 'celesta', vol: 0.42, wet: 0.65, max: 4 }, lo: 74, hi: 91 },
    sparkle: { cfg: { patch: 'glock', vol: 0.1, wet: 0.85 }, prob: 0.04, lo: 86, hi: 100 },
    perc: [],
  },
  sylvaria: {
    trim: 0.95,
    arp: { cfg: { patch: 'harp', vol: 0.38, wet: 0.55, max: 10 }, pat: [0, 2, 4, 2], rate: 4, lo: 53, hi: 84, vel: 0.4 },
    lead: { cfg: { patch: 'flute', vol: 0.42, wet: 0.6, max: 3 }, lo: 67, hi: 84, density: 0.2, leap: 0.3 },
    sparkle: { cfg: { patch: 'celesta', vol: 0.14, wet: 0.8 }, prob: 0.06, lo: 84, hi: 98 },
    perc: [],
  },
  kharaz: {
    trim: 0.87,
    arp: { cfg: { patch: 'pizz', vol: 0.32, wet: 0.3, max: 6 }, pat: [0, 1, 0, -1], rate: 4, lo: 40, hi: 55, vel: 0.45, mode: 'scale' },
    lead: { cfg: { patch: 'horn', vol: 0.5, wet: 0.55, max: 3 }, lo: 48, hi: 64, density: 0.2, leap: 0.25 },
    perc: [{ cfg: { patch: 'taiko', vol: 0.4, wet: 0.3 }, pitch: 38, pat: 'x' + rest(15), sections: 'AaBbM', tune: 'root' }],
  },
  morvenna: {
    trim: 1.41,
    lead: { cfg: { patch: 'celesta', vol: 0.45, wet: 0.6, max: 4 }, lo: 71, hi: 88, density: 0.25, leap: 0.4 },
    comp: { cfg: { patch: 'pizz', vol: 0.28, wet: 0.35, max: 9 }, n: 3, lo: 54, hi: 67, pat: '....x...x...', vel: 0.45 },
    perc: [{ cfg: { patch: 'woodblock', vol: 0.12, wet: 0.45 }, pitch: 84, pat: 'x...o...o...', sections: 'AaBbM' }],
  },
  islas: {
    trim: 0.86,
    lead: { cfg: { patch: 'marimba', vol: 0.5, wet: 0.35, max: 6 }, lo: 64, hi: 84, density: 0.3, roll: true },
    lead2: { cfg: { patch: 'vibes', vol: 0.4, wet: 0.45, fx: ['vibesTrem'], max: 4 }, lo: 67, hi: 84, density: 0.3 },
    comp: { cfg: { patch: 'epiano', vol: 0.3, wet: 0.3, max: 9 }, n: 3, lo: 57, hi: 72, pat: '..x.....x.....x.', vel: 0.45 },
    perc: [{ cfg: { patch: 'shaker', vol: 0.3, wet: 0.2 }, pitch: 60, pat: 'o...x...o...x...', sections: 'IAaBbMC' }],
  },
  concordia: {
    trim: 2.29,
    pad: { cfg: { patch: 'organ', vol: 0.38, wet: 0.6, fx: ['chorus', 'lp:1800'], max: 10 }, n: 4, lo: 51, hi: 70, vel: 0.45 },
    lead: { cfg: { patch: 'strings', vol: 0.38, wet: 0.55, max: 3, fx: ['chorus'] }, lo: 60, hi: 77, density: 0.2, leap: 0.3 },
    perc: [],
  },
};

const LOCATION: Record<Region, ExploreStyle> = {
  // market town / court jig in 6/8
  valdoria: {
    ...VALDORIA, trim: 1.11, name: 'valdoria-loc', bpm: 76, bpb: 2, spb: 6, meter: '68', phraseBars: 4,
    progA: ['i | bVII | i | IV', 'i | IV | bVII | i'], progB: ['bIII | bVII | IV | i', 'IV | i | bVII | i'], progC: ['i | IV/I | i | bVII'],
    motifProg: 'i bIII | bVII | IV | i', motifRhythm: MOTIF_RHYTHM.r68,
    pad: { cfg: { patch: 'strings_warm', vol: 0.3, wet: 0.35, fx: ['chorus'] }, n: 3, lo: 50, hi: 69, vel: 0.4 },
    arp: { cfg: { patch: 'harp', vol: 0.45, wet: 0.3, max: 10 }, pat: [0, 2, 1, 3, 2, 1], rate: 2, lo: 50, hi: 79, vel: 0.5 },
    bass: { cfg: { patch: 'pizz', vol: 0.6, wet: 0.2 }, lo: 38, hi: 50, pat: 'beats', vel: 0.65 },
    lead: { cfg: { patch: 'flute', vol: 0.5, wet: 0.35, max: 3 }, lo: 69, hi: 86, density: 0.6, leap: 0.35 },
    lead2: { cfg: { patch: 'harp', vol: 0.45, wet: 0.35, max: 4 }, lo: 62, hi: 81, density: 0.55 },
    motif: { cfg: { patch: 'flute', vol: 0.5, wet: 0.45, max: 3 }, lo: 69, hi: 86 },
    choir: undefined,
    perc: [
      { cfg: { patch: 'tambourine', vol: 0.5, wet: 0.2 }, pitch: 60, pat: 'x.....o.....', sections: 'AaBbM' },
      { cfg: { patch: 'conga', vol: 0.35, wet: 0.2, layer: 'perc' }, pitch: 50, pat: 'x..o..x..oo.', sections: 'AaBbM', tune: 'root', spread: 5 },
    ],
  },
  // temple of dawn
  sylvaria: {
    ...SYLVARIA, trim: 1.74, name: 'sylvaria-loc', bpm: 58,
    pad: { cfg: { patch: 'choir', vol: 0.5, wet: 0.7, fx: ['formantA', 'chorusWide'], max: 10 }, n: 4, lo: 55, hi: 76, vel: 0.45 },
    arp: { cfg: { patch: 'harp', vol: 0.38, wet: 0.6, max: 10 }, pat: [0, 2, 4, 6, 4, 2], rate: 4, lo: 53, hi: 88, vel: 0.42 },
    lead: { cfg: { patch: 'flute', vol: 0.42, wet: 0.65, max: 3 }, lo: 72, hi: 89, density: 0.2, leap: 0.4 },
    sparkle: { cfg: { patch: 'glock', vol: 0.14, wet: 0.85 }, prob: 0.06, lo: 84, hi: 100 },
    perc: [{ cfg: { patch: 'bell', vol: 0.14, wet: 0.9 }, pitch: 53, pat: 'x' + rest(63), sections: 'AaBbMC', tune: 'tonic' }],
  },
  // forge hall
  kharaz: {
    ...KHARAZ, trim: 1.13, name: 'kharaz-loc', bpm: 92,
    pad: { cfg: { patch: 'choir', vol: 0.45, wet: 0.4, fx: ['formantO'], max: 8 }, n: 3, lo: 43, hi: 62, vel: 0.5 },
    bass: { cfg: { patch: 'low_strings', vol: 0.55, wet: 0.15 }, lo: 28, hi: 40, pat: 'pulse8', vel: 0.55 },
    perc: [
      { cfg: { patch: 'taiko', vol: 0.8, wet: 0.2 }, pitch: 40, pat: 'X.....x.X.......', sections: 'AaBbMC', tune: 'root' },
      { cfg: { patch: 'anvil', vol: 0.34, wet: 0.3 }, pitch: 88, pat: 'x...x...x.x.x...', sections: 'AaBbM', tune: 'tonic' },
      { cfg: { patch: 'anvil', vol: 0.22, wet: 0.3, layer: 'perc' }, pitch: 83, pat: '..o...o...o...oo', sections: 'AaBbM', tune: 'fifth' },
    ],
  },
  // the academy of Altamira: brighter, faster waltz
  morvenna: {
    ...MORVENNA, trim: 1.33, name: 'morvenna-loc', bpm: 150,
    progA: ['i | bIII | iv | V | i | bVI | V | V', 'i | V | i | bIII | bVI | iv | V | i'],
    pad: { cfg: { patch: 'strings', vol: 0.3, wet: 0.45, fx: ['chorus'], max: 8 }, n: 3, lo: 59, hi: 76, vel: 0.4 },
    arp: { cfg: { patch: 'harp', vol: 0.35, wet: 0.4, max: 10 }, pat: [0, 1, 2, 3, 2, 1], rate: 2, lo: 59, hi: 86, vel: 0.42 },
    lead: { cfg: { patch: 'celesta', vol: 0.58, wet: 0.45, max: 4 }, lo: 71, hi: 91, density: 0.55, leap: 0.5 },
    sparkle: { cfg: { patch: 'glock', vol: 0.14, wet: 0.7 }, prob: 0.05, lo: 86, hi: 100 },
  },
  // port town
  islas: {
    ...ISLAS, trim: 0.94, name: 'islas-loc', bpm: 118, swing: 0.58,
    perc: [
      { cfg: { patch: 'shaker', vol: 0.5, wet: 0.1 }, pitch: 60, pat: 'o.x.o.x.o.x.o.xo', sections: 'IAaBbMC' },
      { cfg: { patch: 'conga', vol: 0.5, wet: 0.15 }, pitch: 57, pat: '...x..x....x.xx.', spread: 5, tune: 'root' },
      { cfg: { patch: 'woodblock', vol: 0.3, wet: 0.15 }, pitch: 79, pat: 'x..x..x...x.x...', tune: 'tonic' },
      { cfg: { patch: 'kick', vol: 0.42, wet: 0.05 }, pitch: 36, pat: 'x.......x.......', tune: 'root' },
    ],
  },
  // white city / council antechamber
  concordia: {
    ...CONCORDIA, trim: 1.36, name: 'concordia-loc', bpm: 72,
    pad: { cfg: { patch: 'strings_warm', vol: 0.45, wet: 0.45, fx: ['chorus'], max: 10 }, n: 4, lo: 51, hi: 72, vel: 0.5 },
    arp: { cfg: { patch: 'harp', vol: 0.4, wet: 0.4, max: 10 }, pat: [0, 1, 2, 3, 4, 3, 2, 1], rate: 2, lo: 51, hi: 82, vel: 0.45, gliss: true },
  },
};

export function exploreStyle(mood: MusicMood, region: Region): ExploreStyle {
  const day = DAY[region];
  if (mood === 'overworld_night') return { ...day, ...NIGHT_OVERRIDES[region], name: day.name + '-night' };
  if (mood === 'location') return LOCATION[region];
  return day;
}

// ───────────────────────────── the piece ─────────────────────────────

const SEQ4 = ['A', 'a', 'B', 'b', 'M', 'a', 'C', 'C'] as const;
const SEQ8 = ['A', 'B', 'M', 'C'] as const;

export class ExplorePiece extends Piece {
  private readonly st: ExploreStyle;
  private readonly scale: Scale;
  private readonly tonic: number;
  private readonly spbarS: number;
  private readonly padI?: Inst;
  private readonly arpI?: Inst;
  private readonly bassI?: Inst;
  private readonly compI?: Inst;
  private readonly leadI: Inst;
  private readonly lead2I?: Inst;
  private readonly motifI?: Inst;
  private readonly sparkI?: Inst;
  private readonly choirI?: Inst;
  private readonly percI: Array<{ t: PercTrack; inst: Mono }> = [];
  private readonly barMap = new Map<number, readonly Chord[]>();
  private readonly secMap = new Map<number, string>();
  private theme: { a: MelNote[]; a2: MelNote[] } | null = null;
  private readonly intro = 1;

  constructor(host: MusicHost, mood: MusicMood, region: Region, seed: number, style: ExploreStyle) {
    super(host, mood, region, seed);
    this.st = style;
    this.family = mood === 'location' ? '' : 'explore:' + region;
    this.bpm = style.bpm;
    this.bpb = style.bpb;
    this.spb = style.spb;
    this.swing = style.swing ?? 0.5;
    this.spbarS = style.bpb * style.spb;
    this.tonic = style.tonic;
    this.scale = new Scale(style.tonic, style.mode);
    if (style.pad) this.padI = this.inst(style.pad.cfg);
    if (style.arp) this.arpI = this.inst(style.arp.cfg);
    if (style.bass) this.bassI = this.inst(style.bass.cfg);
    if (style.comp) this.compI = this.inst(style.comp.cfg);
    this.leadI = this.inst(style.lead.cfg);
    if (style.lead2) this.lead2I = this.inst(style.lead2.cfg);
    if (style.motif) this.motifI = this.inst(style.motif.cfg);
    if (style.sparkle) this.sparkI = this.inst(style.sparkle.cfg);
    if (style.choir) this.choirI = this.inst(style.choir.cfg);
    for (const t of style.perc ?? []) this.percI.push({ t, inst: this.mono(t.cfg) });
    this.trim = style.trim ?? 1;
  }

  protected override levels(x: number): Record<string, number> {
    const night = this.mood === 'overworld_night';
    return {
      perc: clamp((x - (night ? 0.55 : 0.3)) / 0.15, 0, 1),
      high: clamp((x - (night ? 0.75 : 0.6)) / 0.15, 0, 1),
    };
  }

  /** The A-section progression: derived lazily from the (possibly synced) seed. */
  private get progA(): string {
    const a = this.st.progA;
    return a[this.seed % a.length] ?? a[0] ?? 'i';
  }

  private sectionOf(p: number): string {
    if (p < this.intro) return 'I';
    const seq: readonly string[] = this.st.phraseBars >= 8 ? SEQ8 : SEQ4;
    return seq[(p - this.intro) % seq.length] ?? 'A';
  }

  private cycleOf(p: number): number {
    const len = this.st.phraseBars >= 8 ? SEQ8.length : SEQ4.length;
    return Math.max(0, Math.floor((p - this.intro) / len));
  }

  private barsOf(progStr: string): Chord[][] {
    const bars = prog(progStr);
    const pb = this.st.phraseBars;
    const out: Chord[][] = [];
    for (let i = 0; i < pb; i++) out.push(bars[i % bars.length] ?? []);
    return out;
  }

  private chordAtFn(bars: readonly (readonly Chord[])[]): (step: number) => Chord {
    const spbar = this.spbarS;
    return (step) => chordIn(bars[Math.floor(step / spbar) % bars.length] ?? [], step % spbar, spbar);
  }

  private getTheme(): { a: MelNote[]; a2: MelNote[] } {
    if (this.theme) return this.theme;
    const st = this.st;
    const rng = this.rng('theme');
    const bars = this.barsOf(this.progA);
    const base = {
      rng, scale: this.scale, tonic: this.tonic, meter: st.meter, stepsPerBar: this.spbarS, stepsPerBeat: st.spb,
      lo: st.lead.lo, hi: st.lead.hi, density: st.lead.density, leap: st.lead.leap ?? 0.35,
    };
    const pb = st.phraseBars;
    const a = genPhrase({ ...base, bars: pb, chordAt: this.chordAtFn(bars), end: 'open' });
    const half = Math.floor(pb / 2);
    const cut = half * this.spbarS;
    const firstHalf = a.notes.filter((n) => n.at < cut);
    const lastMidi = firstHalf[firstHalf.length - 1]?.midi ?? Math.round((st.lead.lo + st.lead.hi) / 2);
    const tailBars = bars.slice(half);
    const tail = genPhrase({
      ...base, bars: pb - half, chordAt: this.chordAtFn(tailBars), end: 'close', rhythm: a.rhythm.slice(half), startNear: lastMidi,
    });
    const a2 = [...firstHalf, ...tail.notes.map((n) => ({ ...n, at: n.at + cut }))];
    this.theme = { a: a.notes, a2 };
    return this.theme;
  }

  private enq(start: number, inst: Inst, notes: readonly MelNote[], roll = false, velMul = 1): void {
    for (const n of notes) {
      const abs = start + n.at;
      if (abs < this.stepIndex) continue;
      if (roll && n.dur >= 3) {
        for (let k = 0; k < n.dur; k++) {
          const vv = n.vel * velMul * (k === 0 ? 1 : 0.6 + 0.08 * Math.sin(k * 1.7));
          this.at(abs + k, inst, n.midi, 0.55, vv);
          this.at(abs + k, inst, n.midi, 0.55, vv * 0.8, undefined, 0.5);
        }
      } else this.at(abs, inst, n.midi, n.dur, n.vel * velMul);
    }
  }

  /** Fit the motif into [lo, hi] by octave. */
  private motifNotes(lo: number, hi: number): MelNote[] {
    const pitches = motifInScale(this.scale);
    const mean = pitches.reduce((a, b) => a + b, 0) / pitches.length;
    const target = (lo + hi) / 2;
    const shift = Math.round((target - mean) / 12) * 12;
    return fromRhythm(this.st.motifRhythm, pitches.map((p) => p + shift), 0.72, MOTIF.stress);
  }

  private planPhrase(p: number): void {
    const st = this.st;
    const pb = st.phraseBars;
    const sec = this.sectionOf(p);
    const cyc = this.cycleOf(p);
    const rng = this.rng('ph', p);
    let progStr = this.progA;
    if (sec === 'B') progStr = st.progB[cyc % st.progB.length] ?? progStr;
    else if (sec === 'b') progStr = st.progB[(cyc + 1) % st.progB.length] ?? progStr;
    else if (sec === 'M') progStr = st.motifProg;
    else if (sec === 'C') progStr = st.progC[cyc % st.progC.length] ?? progStr;
    const bars = this.barsOf(progStr);
    const b0 = p * pb;
    for (let k = 0; k < pb; k++) {
      this.barMap.set(b0 + k, bars[k] ?? []);
      this.secMap.set(b0 + k, sec);
    }
    // forget old bars
    for (const key of this.barMap.keys()) if (key < b0 - pb * 2) {
      this.barMap.delete(key);
      this.secMap.delete(key);
    }
    const start = b0 * this.spbarS;
    const night = this.mood === 'overworld_night';
    const lead = st.lead;
    if (sec === 'A') this.enq(start, this.leadI, this.getTheme().a, lead.roll, lead.vel ?? 1);
    else if (sec === 'a') this.enq(start, this.leadI, varyPhrase(this.getTheme().a2, rng, this.scale, 0.35), lead.roll, lead.vel ?? 1);
    else if (sec === 'B' || sec === 'b') {
      const l2 = st.lead2 ?? lead;
      const inst = this.lead2I ?? this.leadI;
      if (!(night && sec === 'b')) {
        const ph = genPhrase({
          rng, scale: this.scale, tonic: this.tonic, meter: st.meter, stepsPerBar: this.spbarS, stepsPerBeat: st.spb, bars: pb,
          chordAt: this.chordAtFn(bars), lo: l2.lo, hi: l2.hi, density: l2.density, end: sec === 'B' ? 'open' : 'close', leap: 0.35,
        });
        this.enq(start, inst, ph.notes, l2.roll, l2.vel ?? 1);
      }
    } else if (sec === 'M') {
      const m = st.motif ?? { cfg: lead.cfg, lo: lead.lo, hi: lead.hi };
      const inst = this.motifI ?? this.leadI;
      const mot = this.motifNotes(m.lo, m.hi);
      this.enq(start, inst, mot, false, m.vel ?? 1);
      const motSteps = mot.length ? (mot[mot.length - 1] as MelNote).at + (mot[mot.length - 1] as MelNote).dur : 0;
      const motBars = Math.ceil(motSteps / this.spbarS);
      if (pb - motBars >= 1) {
        const ans = genPhrase({
          rng, scale: this.scale, tonic: this.tonic, meter: st.meter, stepsPerBar: this.spbarS, stepsPerBeat: st.spb,
          bars: pb - motBars, chordAt: this.chordAtFn(bars.slice(motBars)), lo: lead.lo, hi: lead.hi,
          density: lead.density * 0.8, end: 'open', startNear: (mot[mot.length - 1] as MelNote | undefined)?.midi ?? lead.lo,
        });
        this.enq(start + motBars * this.spbarS, this.leadI, ans.notes, lead.roll, (lead.vel ?? 1) * 0.9);
      }
    }
  }

  /**
   * Legato for held chords: returns 0 if this chord segment continues the previous
   * one (tied), otherwise how many consecutive segments share this chord (within the phrase).
   */
  private tieRun(bar: number, seg: number, sym: string): number {
    const pb = this.st.phraseBars;
    const cur = this.barMap.get(bar) ?? [];
    const prev = seg > 0 ? cur[seg - 1] : bar % pb === 0 ? undefined : (this.barMap.get(bar - 1) ?? []).slice(-1)[0];
    if (prev && prev.sym === sym) return 0;
    let run = 0;
    let b = bar;
    let k = seg;
    while (b < Math.floor(bar / pb) * pb + pb) {
      const chs = this.barMap.get(b) ?? [];
      if (k >= chs.length) {
        b++;
        k = 0;
        continue;
      }
      if (chs[k]?.sym !== sym) break;
      run++;
      k++;
    }
    return Math.max(1, run);
  }

  private ensure(bar: number): void {
    if (this.barMap.has(bar)) return;
    this.planPhrase(Math.floor(bar / this.st.phraseBars));
  }

  onStep(s: Step): void {
    const st = this.st;
    this.ensure(s.bar);
    const chords = this.barMap.get(s.bar) ?? [];
    if (!chords.length) return;
    const ch = chordIn(chords, s.sib, s.spbar);
    const sec = this.secMap.get(s.bar) ?? 'A';
    const segLen = Math.max(1, Math.round(s.spbar / chords.length));
    const segStart = s.sib % segLen === 0;
    const segDur = segLen * s.dur;
    const t = s.time;
    const sparse = sec === 'I' || sec === 'C';
    const barInPhrase = s.bar % st.phraseBars;

    // pad
    if (this.padI && st.pad) {
      const pv = (st.pad.vel ?? 0.5) * (sparse ? 0.85 : 1);
      if (st.pad.rhythm === 'beats') {
        if (s.sub === 0) this.padI.chord(t, this.tonic, ch, s.spb * s.dur * 0.9, this.v(pv), st.pad.n, st.pad.lo, st.pad.hi);
      } else if (segStart) {
        const run = this.tieRun(s.bar, Math.floor(s.sib / segLen), ch.sym);
        if (run > 0) this.padI.chord(t, this.tonic, ch, segDur * run * 1.02, this.v(pv, 0.04), st.pad.n, st.pad.lo, st.pad.hi, 0.012);
      }
    }

    // bass
    if (this.bassI && st.bass) {
      const b = st.bass;
      const bv = b.vel ?? 0.6;
      const half = Math.floor(s.spbar / 2);
      switch (b.pat) {
        case 'hold':
          if (segStart) this.bassI.bass(t, this.tonic, ch, segDur, this.v(bv), b.lo, b.hi);
          break;
        case 'half':
          if (s.sib === 0 || s.sib === half) {
            const r = this.bassI.lastBass;
            if (s.sib === half && segLen > half && r !== undefined && this.rng('bh', s.bar).chance(0.5)) {
              this.bassI.play(t, r + 7 <= b.hi ? r + 7 : r - 5, half * s.dur, this.v(bv * 0.85));
            } else this.bassI.bass(t, this.tonic, ch, half * s.dur, this.v(bv), b.lo, b.hi);
          }
          break;
        case 'beats':
          if (s.sub === 0) {
            const r = this.bassI.lastBass;
            if (s.beat % 2 === 0 || r === undefined) this.bassI.bass(t, this.tonic, ch, s.spb * s.dur * 0.8, this.v(bv), b.lo, b.hi);
            else this.bassI.play(t, r + 7 <= b.hi ? r + 7 : r - 5, s.spb * s.dur * 0.8, this.v(bv * 0.85));
          }
          break;
        case 'oompah':
          if (s.sib === 0) this.bassI.bass(t, this.tonic, ch, s.spb * s.dur * 0.9, this.v(bv), b.lo, b.hi);
          break;
        case 'calypso': {
          const r = this.bassI;
          if (s.sib === 0) r.bass(t, this.tonic, ch, s.dur * 5, this.v(bv), b.lo, b.hi);
          else if (s.sib === 6 && r.lastBass !== undefined) r.play(t, r.lastBass + 7, s.dur * 2, this.v(bv * 0.8));
          else if (s.sib === 8 && r.lastBass !== undefined) r.play(t, r.lastBass, s.dur * 5, this.v(bv * 0.9));
          else if (s.sib === 14 && r.lastBass !== undefined) r.play(t, r.lastBass + 12, s.dur * 1.5, this.v(bv * 0.7));
          break;
        }
        case 'pulse8':
          if (s.sub % 2 === 0) this.bassI.bass(t, this.tonic, ch, s.dur * 1.6, this.v(bv * (s.sub === 0 ? 1 : 0.75)), b.lo, b.hi);
          break;
      }
    }

    // arpeggio / ostinato
    if (this.arpI && st.arp) {
      const a = st.arp;
      const rate = sparse ? a.rate * 2 : a.rate;
      if (s.sib % rate === 0) {
        const k = Math.floor(s.sib / rate) + s.bar * Math.ceil(s.spbar / rate);
        const idx = a.pat[k % a.pat.length] ?? 0;
        let m: number;
        if (a.mode === 'scale') {
          const root = this.scale.snap(this.tonic + ch.root + 12 * Math.round((a.lo - this.tonic) / 12));
          m = this.scale.step(root, idx);
        } else {
          const lad = chordToneLadder(this.tonic, ch, a.lo, a.hi);
          m = lad[clamp(idx, 0, lad.length - 1)] ?? a.lo;
        }
        const acc = s.sib === 0 ? 1.1 : 1;
        this.arpI.play(this.h(t), m, rate * s.dur * 2.5, this.v((a.vel ?? 0.5) * acc * (sparse ? 0.8 : 1)));
      }
      // harp glissando into A sections
      if (a.gliss && barInPhrase === st.phraseBars - 1 && s.sib === s.spbar - s.spb) {
        const nextSec = this.sectionOf(Math.floor(s.bar / st.phraseBars) + 1);
        if (nextSec === 'A' || nextSec === 'M') {
          const notes = this.scale.notesIn(a.lo + 7, a.hi);
          const n = notes.length;
          const span = s.spb * s.dur;
          notes.forEach((m, i) => this.arpI?.play(t + (i / n) * span, m, 0.8, 0.28 + 0.3 * (i / n)));
        }
      }
    }

    // comping stabs
    if (this.compI && st.comp && !sparse) {
      const c = st.comp;
      const ch2 = c.pat[s.sib % c.pat.length];
      if (ch2 === 'x' || ch2 === 'X') this.compI.chord(this.h(t), this.tonic, ch, s.dur * 1.6, this.v((c.vel ?? 0.5) * (ch2 === 'X' ? 1.15 : 1)), c.n, c.lo, c.hi);
    }

    // choir / high layer
    if (this.choirI && st.choir && segStart && this.on('high') && (sec === 'B' || sec === 'b' || sec === 'M' || this.intensity > 0.8)) {
      const run = this.tieRun(s.bar, Math.floor(s.sib / segLen), ch.sym);
      if (run > 0) this.choirI.chord(t, this.tonic, ch, segDur * run * 1.05, this.v(st.choir.vel ?? 0.5, 0.03), st.choir.n, st.choir.lo, st.choir.hi);
    }

    // sparkles
    if (this.sparkI && st.sparkle && s.sub % 2 === 0) {
      const r = this.rng('sp', s.i);
      if (r.chance(st.sparkle.prob * (sparse ? 1.6 : 1))) {
        const lad = chordToneLadder(this.tonic, ch, st.sparkle.lo, st.sparkle.hi);
        if (lad.length) this.sparkI.play(this.h(t, 0.02), r.pick(lad), 1.5, this.v(st.sparkle.vel ?? 0.5, 0.15), { pan: r.range(-0.7, 0.7) });
      }
    }

    // percussion
    for (const { t: tr, inst } of this.percI) {
      const secs = tr.sections ?? 'AaBbM';
      if (!secs.includes(sec)) continue;
      if (!this.on(tr.cfg.layer ?? 'base')) continue;
      const c = tr.pat[(s.bar * s.spbar + s.sib) % tr.pat.length];
      if (!c || c === '.') continue;
      const vel = c === 'X' ? 1 : c === 'x' ? 0.75 : c === 'o' ? 0.42 : 0.7;
      let pitch = tr.pitch;
      if (tr.tune) {
        const base = tr.tune === 'tonic' ? this.tonic : this.tonic + ch.root + (tr.tune === 'fifth' ? 7 : 0);
        const choices = tr.spread ? [0, 7, 12, tr.tune === 'tonic' ? 0 : 3] : [0];
        const off = choices[this.rng('pp', s.i).int(0, choices.length - 1)] ?? 0;
        pitch = nearestPc(base + off, tr.pitch);
      } else if (tr.spread) pitch = tr.pitch + this.rng('pp', s.i).int(-tr.spread, tr.spread);
      inst.play(this.h(t, 0.004), pitch, s.dur * 2, this.v(vel, 0.05));
      if (c === 'r') inst.play(t + s.dur * 0.5, pitch, s.dur, this.v(vel * 0.6));
    }
  }
}
