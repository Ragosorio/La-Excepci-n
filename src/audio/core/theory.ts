/**
 * Music theory toolkit: modes, scales, roman-numeral chords, voice leading and
 * the leitmotif "Siempre estuve viéndote".
 */

export const MODES = {
  ionian: [0, 2, 4, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
  melodicMinor: [0, 2, 3, 5, 7, 9, 11],
  phrygianDominant: [0, 1, 4, 5, 7, 8, 10],
  wholeTone: [0, 2, 4, 6, 8, 10],
  pentaMajor: [0, 2, 4, 7, 9],
  pentaMinor: [0, 3, 5, 7, 10],
} as const satisfies Record<string, readonly number[]>;
export type ModeName = keyof typeof MODES;

export function mtof(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

export const pc = (m: number): number => ((Math.round(m) % 12) + 12) % 12;

export class Scale {
  readonly root: number;
  readonly steps: readonly number[];
  constructor(root: number, steps: readonly number[]) {
    this.root = root;
    this.steps = steps;
  }
  get size(): number {
    return this.steps.length;
  }
  /** Scale degree (0-based, any integer; negative = below root) -> midi */
  deg(d: number): number {
    const n = this.steps.length;
    const o = Math.floor(d / n);
    const i = d - o * n;
    return this.root + o * 12 + (this.steps[i] ?? 0);
  }
  has(midi: number): boolean {
    const p = pc(midi - this.root);
    return this.steps.includes(p);
  }
  /** Degree whose note is nearest to midi (ties -> lower). */
  nearestDeg(midi: number): number {
    const n = this.steps.length;
    const base = Math.floor((midi - this.root) / 12) * n;
    let best = base;
    let bestD = Infinity;
    for (let d = base - n; d <= base + 2 * n; d++) {
      const dist = Math.abs(this.deg(d) - midi);
      if (dist < bestD) {
        bestD = dist;
        best = d;
      }
    }
    return best;
  }
  snap(midi: number): number {
    return this.deg(this.nearestDeg(midi));
  }
  /** Move n scale steps from (snapped) midi. */
  step(midi: number, n: number): number {
    return this.deg(this.nearestDeg(midi) + n);
  }
  notesIn(lo: number, hi: number): number[] {
    const out: number[] = [];
    for (let m = Math.ceil(lo); m <= hi; m++) if (this.has(m)) out.push(m);
    return out;
  }
}

// ───────────────────────────── chords ─────────────────────────────

export type ChordType =
  | 'maj' | 'min' | 'dim' | 'aug' | 'sus2' | 'sus4' | 'maj7' | 'min7' | 'dom7' | 'm7b5' | 'dim7'
  | 'add9' | 'madd9' | 'min9' | 'maj9' | 'dom9' | '7b9' | 'min6' | 'maj6' | 'mmaj7' | 'pow' | '7sus4'
  // rootless jazz voicings (the bass plays the root)
  | 'rmaj9' | 'rmin9' | 'rmin69' | 'rdom13' | 'r7b9' | 'rm7b5';

export const CHORD_IV: Record<ChordType, readonly number[]> = {
  maj: [0, 4, 7], min: [0, 3, 7], dim: [0, 3, 6], aug: [0, 4, 8], sus2: [0, 2, 7], sus4: [0, 5, 7],
  maj7: [0, 4, 7, 11], min7: [0, 3, 7, 10], dom7: [0, 4, 7, 10], m7b5: [0, 3, 6, 10], dim7: [0, 3, 6, 9],
  add9: [0, 4, 7, 14], madd9: [0, 3, 7, 14], min9: [0, 3, 7, 10, 14], maj9: [0, 4, 7, 11, 14],
  dom9: [0, 4, 7, 10, 14], '7b9': [0, 4, 7, 10, 13], min6: [0, 3, 7, 9], maj6: [0, 4, 7, 9],
  mmaj7: [0, 3, 7, 11], pow: [0, 7], '7sus4': [0, 5, 7, 10],
  rmaj9: [4, 7, 11, 14], rmin9: [3, 7, 10, 14], rmin69: [3, 7, 9, 14], rdom13: [4, 10, 14, 21], r7b9: [4, 10, 13, 20],
  rm7b5: [3, 6, 10, 17],
};

/** Rootless jazz voicing type for a chord (keeps its root for the bass). */
export function rootless(ch: Chord): Chord {
  const m: Partial<Record<ChordType, ChordType>> = {
    maj: 'rmaj9', maj7: 'rmaj9', maj9: 'rmaj9', maj6: 'rmaj9', add9: 'rmaj9',
    min: 'rmin9', min7: 'rmin9', min9: 'rmin9', madd9: 'rmin9', min6: 'rmin69',
    dom7: 'rdom13', dom9: 'rdom13', '7sus4': 'rdom13', '7b9': 'r7b9', m7b5: 'rm7b5',
  };
  const type = m[ch.type];
  return type ? { ...ch, type, sym: ch.sym + '(r)' } : ch;
}

/** A chord relative to the key tonic. root/bass are semitone offsets 0..11. */
export interface Chord {
  root: number;
  type: ChordType;
  bass: number;
  sym: string;
}

const NUMERALS: ReadonlyArray<readonly [string, number]> = [
  ['VII', 11], ['VI', 9], ['V', 7], ['IV', 5], ['III', 4], ['II', 2], ['I', 0],
];

function parseNumeral(s: string): { off: number; upper: boolean; rest: string } | null {
  let i = 0;
  let acc = 0;
  while (s[i] === 'b' || s[i] === '#') {
    acc += s[i] === 'b' ? -1 : 1;
    i++;
  }
  const body = s.slice(i);
  for (const [n, off] of NUMERALS) {
    if (body.startsWith(n)) return { off: off + acc, upper: true, rest: body.slice(n.length) };
    const low = n.toLowerCase();
    if (body.startsWith(low)) return { off: off + acc, upper: false, rest: body.slice(low.length) };
  }
  return null;
}

const chordCache = new Map<string, Chord>();

/**
 * Parse a roman numeral chord symbol relative to the key tonic.
 * Examples: "i", "bVII", "V7", "ii°", "iiø7", "Imaj7", "IVadd9", "Vsus4", "II/I" (pedal), "I/1" (1st inversion).
 */
export function roman(sym: string): Chord {
  const cached = chordCache.get(sym);
  if (cached) return cached;
  const [main = 'I', slash] = sym.trim().split('/');
  const p = parseNumeral(main) ?? { off: 0, upper: true, rest: '' };
  let rest = p.rest;
  let type: ChordType = p.upper ? 'maj' : 'min';
  let dim = false;
  let half = false;
  if (rest.startsWith('°') || rest.startsWith('o')) { dim = true; rest = rest.slice(1); }
  else if (rest.startsWith('ø')) { half = true; rest = rest.slice(1); }
  else if (rest.startsWith('+')) { type = 'aug'; rest = rest.slice(1); }
  if (dim) type = rest.startsWith('7') ? 'dim7' : 'dim';
  else if (half) type = 'm7b5';
  else {
    switch (rest) {
      case '7': type = p.upper ? 'dom7' : 'min7'; break;
      case 'maj7': type = p.upper ? 'maj7' : 'mmaj7'; break;
      case '9': type = p.upper ? 'dom9' : 'min9'; break;
      case 'maj9': type = 'maj9'; break;
      case '6': type = p.upper ? 'maj6' : 'min6'; break;
      case 'sus4': type = 'sus4'; break;
      case 'sus2': type = 'sus2'; break;
      case '7sus4': type = '7sus4'; break;
      case 'add9': type = p.upper ? 'add9' : 'madd9'; break;
      case 'b9': type = '7b9'; break;
      case '5': type = 'pow'; break;
      default: break;
    }
  }
  const root = ((p.off % 12) + 12) % 12;
  let bass = root;
  if (slash) {
    const inv = Number(slash);
    if (Number.isFinite(inv) && inv > 0) {
      const iv = CHORD_IV[type];
      bass = (root + (iv[Math.min(inv, iv.length - 1)] ?? 0)) % 12;
    } else {
      const b = parseNumeral(slash);
      if (b) bass = ((b.off % 12) + 12) % 12;
    }
  }
  const ch: Chord = { root, type, bass, sym };
  chordCache.set(sym, ch);
  return ch;
}

/** "i iv | bVI bVII" -> bars of chords (each bar: 1+ chords evenly splitting the bar). */
export function prog(s: string): Chord[][] {
  return s.split('|').map((bar) => bar.trim().split(/\s+/).filter(Boolean).map(roman));
}

/** Absolute pitch classes of a chord in a key with the given tonic (midi or pc). */
export function chordPcs(tonic: number, ch: Chord): number[] {
  return CHORD_IV[ch.type].map((iv) => pc(tonic + ch.root + iv));
}

export function isChordTone(tonic: number, ch: Chord, midi: number): boolean {
  const p = pc(midi);
  return chordPcs(tonic, ch).includes(p);
}

/** Make a chord darker (for prologue_dark & corruption): maj->min, min->dim, etc. */
export function darken(ch: Chord): Chord {
  const map: Partial<Record<ChordType, ChordType>> = {
    maj: 'min', add9: 'madd9', maj7: 'mmaj7', maj9: 'min9', dom7: 'dim7', maj6: 'min6', sus2: 'sus4',
    min: 'dim', min7: 'm7b5', madd9: 'dim', min9: 'm7b5', sus4: 'dim',
  };
  const type = map[ch.type] ?? ch.type;
  return { root: ch.root, bass: ch.bass, type, sym: ch.sym + '~' };
}

// ───────────────────────────── voice leading ─────────────────────────────

function combos(n: number, k: number, cb: (idx: number[]) => void): void {
  const idx: number[] = [];
  const rec = (start: number): void => {
    if (idx.length === k) {
      cb(idx);
      return;
    }
    for (let i = start; i <= n - (k - idx.length); i++) {
      idx.push(i);
      rec(i + 1);
      idx.pop();
    }
  };
  rec(0);
}

/**
 * Choose an n-note voicing of `ch` inside [lo, hi] that moves as little as
 * possible from `prev` (classic nearest-voicing voice leading).
 */
export function voiceLead(
  tonic: number, ch: Chord, prev: readonly number[] | null, n: number, lo: number, hi: number,
): number[] {
  const iv = CHORD_IV[ch.type];
  const tones = iv.map((x) => pc(tonic + ch.root + x));
  // priority for dropping when there are more tones than voices: drop 5th, then root
  let need = [...new Set(tones)];
  if (need.length > n) {
    const fifth = pc(tonic + ch.root + 7);
    if (need.includes(fifth) && iv.length > 3) need = need.filter((p) => p !== fifth);
  }
  if (need.length > n) need = need.slice(need.length - n);
  const allowed = new Set(tones);
  const pool: number[] = [];
  for (let m = Math.ceil(lo); m <= hi; m++) if (allowed.has(pc(m))) pool.push(m);
  if (pool.length < n) {
    // range too small — stack upwards from lo
    const out: number[] = [];
    let m = Math.ceil(lo);
    while (out.length < n && m < 128) {
      if (allowed.has(pc(m))) out.push(m);
      m++;
    }
    return out;
  }
  const center = (lo + hi) / 2;
  const third = pc(tonic + ch.root + (iv[1] ?? 4));
  let best: number[] = [];
  let bestScore = Infinity;
  combos(pool.length, n, (idx) => {
    const cand = idx.map((i) => pool[i] as number);
    const pcs = cand.map(pc);
    let s = 0;
    for (const p of need) if (!pcs.includes(p)) s += 60;
    // avoid doubled thirds
    let thirds = 0;
    for (const p of pcs) if (p === third) thirds++;
    if (thirds > 1) s += 6;
    for (let i = 0; i < cand.length - 1; i++) {
      const a = cand[i] as number;
      const gap = (cand[i + 1] as number) - a;
      if (gap < 3 && a < 55) s += 5; // mud in the low register
      if (gap > 12) s += (gap - 12) * 0.6;
      if (gap === 1 && ch.type !== 'maj7' && ch.type !== 'mmaj7') s += 1.5;
    }
    if (prev && prev.length) {
      if (prev.length === cand.length) {
        for (let i = 0; i < cand.length; i++) s += Math.abs((cand[i] as number) - (prev[i] as number));
      } else {
        for (const c of cand) {
          let md = 99;
          for (const q of prev) md = Math.min(md, Math.abs(c - q));
          s += md;
        }
      }
      s += Math.abs(cand.reduce((a, b) => a + b, 0) / cand.length - center) * 0.08;
    } else {
      s += Math.abs(cand.reduce((a, b) => a + b, 0) / cand.length - center) * 0.4;
      s += ((cand[cand.length - 1] as number) - (cand[0] as number)) * 0.05;
    }
    if (s < bestScore) {
      bestScore = s;
      best = cand;
    }
  });
  return best;
}

/** Bass note for chord (uses slash bass) inside [lo, hi], nearest to prev. */
export function bassNote(tonic: number, ch: Chord, lo: number, hi: number, prev?: number): number {
  const p = pc(tonic + ch.bass);
  const target = prev ?? (lo + hi) / 2;
  let best = lo;
  let bd = Infinity;
  for (let m = Math.ceil(lo); m <= hi; m++) {
    if (pc(m) !== p) continue;
    const d = Math.abs(m - target) + (m < lo + 2 ? 0.5 : 0);
    if (d < bd) {
      bd = d;
      best = m;
    }
  }
  return best;
}

/** Chord tones spread over octaves, ascending, within [lo, hi]. */
export function chordToneLadder(tonic: number, ch: Chord, lo: number, hi: number): number[] {
  const pcs = new Set(chordPcs(tonic, ch));
  const out: number[] = [];
  for (let m = Math.ceil(lo); m <= hi; m++) if (pcs.has(pc(m))) out.push(m);
  return out;
}

// ───────────────────────────── the leitmotif ─────────────────────────────
/**
 * "Siem-pre es-tu-ve vién-do-te" — 8 notes, minor, ends on the 2nd degree over
 * the dominant (a half cadence = a question). Core = first five notes:
 * 5 - b6 - 5 - b3 - 2  (E F E C B in A minor), the b6->5 "sigh" is the watcher's blink.
 */
export const MOTIF = {
  /** semitones from the minor tonic */
  semis: [7, 8, 7, 3, 2, 0, -1, 2] as readonly number[],
  /** heptatonic degrees (0 = tonic) — use with a Scale to map into any mode */
  degrees: [4, 5, 4, 2, 1, 0, -1, 1] as readonly number[],
  syllables: ['Siem', 'pre', 'es', 'tu', 've', 'vién', 'do', 'te'] as readonly string[],
  stress: [1, 0, 0, 1, 0, 1, 0, 0] as readonly number[],
  /** implied harmony per note (roman, minor key) */
  harmony: ['i', 'i', 'i', 'bVI', 'bVI', 'Vsus4', 'V', 'V'] as readonly string[],
};

/** [onset, duration] pairs, in grid steps. */
export type Rhythm = ReadonlyArray<readonly [number, number]>;

export const MOTIF_RHYTHM = {
  /** 6/8, 16th grid: 2 bars (24 steps) — title / music box */
  r68: [[0, 4], [4, 1], [5, 1], [6, 4], [10, 2], [12, 4], [16, 2], [18, 6]] as Rhythm,
  /** 4/4, 16th grid: 2 bars (32 steps) — brass / march */
  r44: [[0, 4], [4, 2], [6, 2], [8, 4], [12, 4], [16, 4], [20, 4], [24, 8]] as Rhythm,
  /** 3/4, 16th grid: 4 bars (48 steps) — waltz */
  r34: [[0, 6], [6, 2], [8, 4], [12, 8], [20, 4], [24, 6], [30, 2], [32, 16]] as Rhythm,
  /** 4/4 swing, triplet grid (3 per beat): 2 bars (24 steps) — casino */
  swing: [[0, 2], [2, 1], [3, 2], [5, 4], [9, 3], [12, 2], [14, 1], [15, 6]] as Rhythm,
};

export function motifLength(r: Rhythm): number {
  const last = r[r.length - 1];
  return last ? last[0] + last[1] : 0;
}

/** Motif pitches: chromatic (exact intervals) from a minor tonic midi. */
export function motifChromatic(tonicMidi: number): number[] {
  return MOTIF.semis.map((s) => tonicMidi + s);
}

/** Motif pitches mapped by degree into any scale (keeps contour, adopts the mode's color). */
export function motifInScale(scale: Scale, octaveShift = 0): number[] {
  return MOTIF.degrees.map((d) => scale.deg(d) + octaveShift * 12);
}

// ───────────────────────────── helpers ─────────────────────────────

export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
