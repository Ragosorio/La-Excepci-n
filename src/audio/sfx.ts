/**
 * Procedural SFX. Every call builds a tiny native graph that plays once and
 * cleans itself up. Voice manager: identical sfx within ~25 ms are merged,
 * at most 24 concurrent voices (low-priority combat sounds are stolen first,
 * UI never is), per-name caps, and a default ±4% random pitch.
 */
import {
  type AC, type Bank, type NoiseColor, type Vowel, type WaveName, biquad, cleanupOnEnd, gainNode, makeFormant, noise, osc, panner,
  safeStop, shaper,
} from './core/dsp';
import { PATCH, type Spec, playSpec } from './core/patches';
import { Rng, fx } from './core/rng';
import { mtof } from './core/theory';
import type { SfxName, SfxOpts } from './types';

export interface SfxHost {
  ac: AC;
  bank: Bank;
  dry: AudioNode;
  wet: AudioNode;
}

interface C {
  ac: AC;
  bank: Bank;
  t: number;
  out: GainNode;
  send: GainNode;
  /** pitch multiplier */
  p: number;
  r: Rng;
}

type W = OscillatorType | WaveName;

interface ToneOpts {
  w?: W;
  f: number;
  /** glide target(s): [freq, arriveAfter] relative to note start */
  to?: ReadonlyArray<readonly [number, number]>;
  a?: number;
  hold?: number;
  d: number;
  g: number;
  at?: number;
  lp?: number;
  hp?: number;
  bp?: number;
  q?: number;
  /** filter sweep target: [freq, arriveAfter] */
  fto?: readonly [number, number];
  fm?: { r: number; i: number; d?: number };
  vib?: { hz: number; c: number };
  /** tremolo (amplitude LFO) */
  am?: { hz: number; depth: number };
  pan?: number;
  pan2?: number;
  shp?: 'drive' | 'fuzz' | 'crush';
  /** sample&hold random pitch jitter [lo, hi, rate] */
  jit?: readonly [number, number, number];
  /** extra raw detune in cents */
  dt?: number;
  dest?: AudioNode;
}

interface NoiseOpts {
  c?: NoiseColor;
  f: number;
  type?: BiquadFilterType;
  q?: number;
  to?: ReadonlyArray<readonly [number, number]>;
  a?: number;
  hold?: number;
  d: number;
  g: number;
  at?: number;
  pan?: number;
  pan2?: number;
  shp?: 'drive' | 'fuzz' | 'crush';
  /** random amplitude flutter [rate Hz, min 0..1] */
  rattle?: readonly [number, number];
  /** abrupt cut instead of decay (reverse feel) */
  cut?: boolean;
  dest?: AudioNode;
}

const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);

function outChain(c: C, node: AudioNode, t: number, end: number, pan?: number, pan2?: number, dest?: AudioNode): void {
  const target = dest ?? c.out;
  if (pan !== undefined || pan2 !== undefined) {
    const pn = panner(c.ac, pan ?? 0);
    if (pan2 !== undefined) {
      pn.pan.setValueAtTime(clamp(pan ?? 0, -1, 1), t);
      pn.pan.linearRampToValueAtTime(clamp(pan2, -1, 1), end);
    }
    node.connect(pn).connect(target);
  } else node.connect(target);
}

/** Tonal element with pitch glides, FM, vibrato, tremolo, filter and envelope. Returns end time. */
function tn(c: C, o: ToneOpts): number {
  const { ac, bank } = c;
  const t = Math.max(0, c.t + (o.at ?? 0));
  const f0 = Math.min(o.f * c.p, ac.sampleRate * 0.45);
  const node = osc(ac, bank, o.w ?? 'sine', f0, t, o.dt ?? 0);
  for (const [f, dt] of o.to ?? []) node.frequency.exponentialRampToValueAtTime(clamp(f * c.p, 5, ac.sampleRate * 0.45), t + Math.max(0.002, dt));
  const a = o.a ?? 0.002;
  const hold = o.hold ?? 0;
  const end = t + a + hold + o.d * 6;
  const srcs: AudioScheduledSourceNode[] = [node];
  if (o.jit) {
    const [lo, hi, rate] = o.jit;
    const n = Math.floor((a + hold + o.d * 3) * rate);
    for (let i = 1; i < n; i++) node.frequency.setValueAtTime(c.r.range(lo, hi) * c.p, t + i / rate);
  }
  if (o.fm) {
    const m = ac.createOscillator();
    m.frequency.setValueAtTime(f0 * o.fm.r, t);
    const mg = ac.createGain();
    mg.gain.setValueAtTime(f0 * o.fm.i, t);
    if (o.fm.d !== undefined) mg.gain.setTargetAtTime(0, t, o.fm.d);
    m.connect(mg).connect(node.frequency);
    m.start(t);
    srcs.push(m);
  }
  if (o.vib) {
    const l = ac.createOscillator();
    l.frequency.value = o.vib.hz;
    const lg = gainNode(ac, o.vib.c);
    l.connect(lg).connect(node.detune);
    l.start(t);
    srcs.push(l);
  }
  let last: AudioNode = node;
  if (o.lp || o.hp || o.bp) {
    const type: BiquadFilterType = o.bp ? 'bandpass' : o.hp ? 'highpass' : 'lowpass';
    const fl = biquad(ac, type, (o.bp ?? o.hp ?? o.lp ?? 1000) * (o.bp || o.lp ? c.p : 1), o.q ?? 0.8, t);
    if (o.fto) fl.frequency.exponentialRampToValueAtTime(clamp(o.fto[0], 20, ac.sampleRate * 0.45), t + o.fto[1]);
    last.connect(fl);
    last = fl;
  }
  if (o.shp) {
    const s = shaper(ac, bank.curves[o.shp]);
    last.connect(s);
    last = s;
  }
  const g = ac.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(o.g, t + a);
  if (hold > 0) g.gain.setValueAtTime(o.g, t + a + hold);
  g.gain.setTargetAtTime(0, t + a + hold, o.d);
  last.connect(g);
  let tail: AudioNode = g;
  if (o.am) {
    const tg = gainNode(ac, 1 - o.am.depth / 2);
    const l = ac.createOscillator();
    l.frequency.value = o.am.hz;
    const lg = gainNode(ac, o.am.depth / 2);
    l.connect(lg).connect(tg.gain);
    l.start(t);
    srcs.push(l);
    g.connect(tg);
    tail = tg;
  }
  outChain(c, tail, t, end, o.pan, o.pan2, o.dest);
  node.start(t);
  for (const s of srcs) safeStop(s, end);
  cleanupOnEnd(node, tail);
  return end;
}

/** Filtered noise element. Returns end time. */
function nz(c: C, o: NoiseOpts): number {
  const { ac, bank } = c;
  const t = Math.max(0, c.t + (o.at ?? 0));
  const a = o.a ?? 0.002;
  const hold = o.hold ?? 0;
  const end = o.cut ? t + a + hold + 0.02 : t + a + hold + o.d * 6;
  const src = noise(ac, bank, o.c ?? 'white', t, end - t + 0.01);
  const fl = biquad(ac, o.type ?? 'bandpass', Math.min(o.f, ac.sampleRate * 0.45), o.q ?? 1, t);
  for (const [f, dt] of o.to ?? []) fl.frequency.exponentialRampToValueAtTime(clamp(f, 20, ac.sampleRate * 0.45), t + Math.max(0.002, dt));
  src.connect(fl);
  let last: AudioNode = fl;
  if (o.shp) {
    const s = shaper(ac, bank.curves[o.shp]);
    last.connect(s);
    last = s;
  }
  const g = ac.createGain();
  if (o.cut) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.g, t + a);
    g.gain.linearRampToValueAtTime(0, t + a + hold + 0.015);
  } else {
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(o.g, t + a);
    if (hold > 0) g.gain.setValueAtTime(o.g, t + a + hold);
    g.gain.setTargetAtTime(0, t + a + hold, o.d);
  }
  last.connect(g);
  let tail: AudioNode = g;
  if (o.rattle) {
    const [rate, min] = o.rattle;
    const rg = gainNode(ac, 1);
    const n = Math.floor((end - t) * rate);
    for (let i = 0; i < n; i++) rg.gain.setValueAtTime(c.r.range(min, 1), t + i / rate);
    g.connect(rg);
    tail = rg;
  }
  outChain(c, tail, t, end, o.pan, o.pan2, o.dest);
  cleanupOnEnd(src, tail);
  return end;
}

/** Play an instrument spec (bells, brass...) inside an sfx. */
function inst(c: C, spec: Spec, midiOrHz: number, at: number, dur: number, vel: number, isHz = false, pan?: number, detune?: number): number {
  const f = (isHz ? midiOrHz : mtof(midiOrHz)) * c.p;
  const o: { pan?: number; detune?: number } = {};
  if (pan !== undefined) o.pan = pan;
  if (detune !== undefined) o.detune = detune;
  return playSpec(c.ac, c.bank, c.out, spec, c.t + at, f, dur, vel, o).end;
}

// ── custom sfx voices ──
const COIN: Spec = {
  osc: [{ w: 'sine' }, { w: 'sine', r: 2.76, g: 0.42, tau: 0.07 }, { w: 'sine', r: 5.4, g: 0.26, tau: 0.03 }, { w: 'sine', r: 8.1, g: 0.1, tau: 0.015 }],
  a: 0.0008, tau: 0.22, r: 0.05, gain: 0.34,
  noise: { color: 'white', g: 0.12, type: 'highpass', hz: 7000, tau: 0.003 },
};
const GLASS: Spec = {
  osc: [{ w: 'sine', mod: { r: 3.7, i: 1.2, tau: 0.08 } }, { w: 'sine', r: 2.02, g: 0.2, tau: 0.2 }],
  a: 0.001, tau: 0.35, r: 0.05, gain: 0.3,
};
const REV_BELL: Spec = {
  osc: [{ w: 'sine' }, { w: 'sine', r: 4, g: 0.25 }, { w: 'sine', r: 2.76, g: 0.18 }],
  a: 0.5, d: 1, s: 1, r: 0.02, gain: 0.3,
};
const PENTA = [88, 90, 92, 95, 97, 100];

function coin(c: C, at: number, midi: number, vel: number, pan?: number, ring = 1): void {
  inst(c, COIN, midi, at, 0.05, vel, false, pan);
  inst(c, COIN, midi + (c.r.chance(0.5) ? 5 : 7), at + 0.05 + c.r.range(0, 0.012), 0.05, vel * 0.85 * ring, false, pan);
}

function formantBus(c: C, v: Vowel): GainNode {
  const f = makeFormant(c.ac, v, 2.6);
  f.output.connect(c.out);
  const g = gainNode(c.ac, 1);
  g.connect(f.input);
  // disconnect later together with the sfx voice
  setTimeout(() => {
    try {
      f.output.disconnect();
    } catch {
      /* ignore */
    }
  }, 6000);
  return g;
}

// ───────────────────────────── recipes ─────────────────────────────

type Recipe = (c: C) => number;

const R: Record<SfxName, Recipe> = {
  // ── UI ──
  ui_click: (c) => {
    tn(c, { f: 1900, to: [[1100, 0.012]], a: 0.001, d: 0.012, g: 0.32 });
    nz(c, { f: 4500, q: 1.5, a: 0.0005, d: 0.006, g: 0.16 });
    return tn(c, { w: 'triangle', f: 320, to: [[180, 0.02]], d: 0.02, g: 0.18 });
  },
  ui_hover: (c) => {
    nz(c, { f: 6000, type: 'highpass', d: 0.004, g: 0.05 });
    return tn(c, { f: 2600, to: [[2450, 0.02]], d: 0.012, g: 0.11 });
  },
  ui_open: (c) => {
    c.send.gain.value = 0.2;
    tn(c, { f: 420, to: [[980, 0.09]], a: 0.005, hold: 0.04, d: 0.05, g: 0.2, lp: 3000 });
    nz(c, { f: 1500, to: [[5000, 0.12]], a: 0.03, d: 0.05, g: 0.07, q: 1.2 });
    return inst(c, PATCH.glock, 88, 0.07, 0.3, 0.55);
  },
  ui_close: (c) => {
    tn(c, { f: 900, to: [[380, 0.08]], d: 0.045, g: 0.2 });
    nz(c, { f: 5000, to: [[1200, 0.1]], a: 0.01, d: 0.04, g: 0.07 });
    return tn(c, { f: 160, to: [[90, 0.04]], at: 0.07, d: 0.03, g: 0.22 });
  },
  ui_error: (c) => {
    tn(c, { w: 'square', f: 233, a: 0.004, hold: 0.06, d: 0.03, g: 0.1, lp: 1400 });
    return tn(c, { w: 'square', f: 175, at: 0.11, a: 0.004, hold: 0.09, d: 0.05, g: 0.1, lp: 1200 });
  },
  ui_confirm: (c) => {
    c.send.gain.value = 0.25;
    inst(c, PATCH.glock, 84, 0, 0.3, 0.6);
    tn(c, { f: 2093, at: 0.07, d: 0.12, g: 0.06 });
    return inst(c, PATCH.glock, 91, 0.07, 0.4, 0.65);
  },
  ui_tab: (c) => {
    nz(c, { f: 3000, q: 1.2, d: 0.008, g: 0.08 });
    return tn(c, { w: 'triangle', f: 1250, to: [[1000, 0.02]], d: 0.022, g: 0.16 });
  },

  // ── economy ──
  coin: (c) => {
    c.send.gain.value = 0.18;
    coin(c, 0, c.r.pick(PENTA), 0.9);
    return c.t + 1;
  },
  coins_many: (c) => {
    c.send.gain.value = 0.22;
    const n = c.r.int(11, 16);
    for (let i = 0; i < n; i++) {
      const at = 0.6 * Math.pow(i / n, 1.25) + c.r.range(0, 0.02);
      inst(c, COIN, c.r.pick(PENTA) + (c.r.chance(0.3) ? 12 : 0), at, 0.05, c.r.range(0.45, 0.85) * (1 - i / (n * 1.6)), false, c.r.range(-0.6, 0.6));
    }
    return nz(c, { f: 7000, q: 1, a: 0.02, hold: 0.35, d: 0.15, g: 0.06, rattle: [70, 0.2] });
  },
  purchase: (c) => {
    c.send.gain.value = 0.25;
    nz(c, { c: 'pink', f: 1200, to: [[600, 0.15]], a: 0.01, d: 0.07, g: 0.1 });
    inst(c, PATCH.glock, 96, 0.06, 0.2, 0.55);
    inst(c, PATCH.glock, 100, 0.13, 0.4, 0.6);
    for (let i = 0; i < 4; i++) coin(c, 0.14 + i * 0.05, c.r.pick(PENTA), 0.55 - i * 0.08, c.r.range(-0.4, 0.4));
    tn(c, { f: 120, to: [[70, 0.05]], at: 0.14, d: 0.045, g: 0.28 });
    return c.t + 1.2;
  },
  sell: (c) => {
    c.send.gain.value = 0.2;
    [95, 92, 90, 88].forEach((m, i) => inst(c, COIN, m, i * 0.055 + c.r.range(0, 0.01), 0.05, 0.75 - i * 0.12, false, c.r.range(-0.3, 0.3)));
    nz(c, { c: 'brown', f: 600, type: 'lowpass', at: 0.22, d: 0.05, g: 0.25 });
    tn(c, { f: 110, to: [[70, 0.05]], at: 0.22, d: 0.05, g: 0.2 });
    return c.t + 0.9;
  },

  // ── spells ──
  cast_arcane: (c) => {
    c.send.gain.value = 0.45;
    [0, 4, 7, 11, 14, 18].forEach((iv, i) => inst(c, GLASS, 81 + iv, i * 0.045, 0.2, 0.5 - i * 0.03, false, -0.5 + i * 0.2));
    nz(c, { f: 1000, to: [[6000, 0.35]], q: 2, a: 0.1, d: 0.14, g: 0.12 });
    tn(c, { f: 110, to: [[220, 0.3]], a: 0.1, d: 0.14, g: 0.18 });
    return tn(c, { f: 3520, vib: { hz: 7, c: 30 }, at: 0.25, a: 0.05, d: 0.18, g: 0.05 });
  },
  cast_fire: (c) => {
    c.send.gain.value = 0.2;
    nz(c, { c: 'brown', f: 400, type: 'lowpass', to: [[3000, 0.2]], q: 0.7, a: 0.05, hold: 0.1, d: 0.22, g: 0.5, shp: 'drive' });
    nz(c, { f: 900, to: [[4000, 0.2]], q: 0.8, a: 0.04, hold: 0.05, d: 0.15, g: 0.14 });
    for (let i = 0; i < 7; i++) nz(c, { f: c.r.range(2500, 6500), q: 2, at: c.r.range(0.04, 0.5), d: 0.004, g: c.r.range(0.08, 0.18) });
    return tn(c, { f: 70, to: [[48, 0.3]], a: 0.02, d: 0.22, g: 0.25 });
  },
  cast_ice: (c) => {
    c.send.gain.value = 0.5;
    nz(c, { f: 1200, q: 1, d: 0.01, g: 0.2 });
    [2637, 3520, 2960, 4186].forEach((f, i) => inst(c, GLASS, f, i * 0.028, 0.2, 0.45, true, c.r.range(-0.6, 0.6)));
    nz(c, { f: 6000, type: 'highpass', a: 0.02, d: 0.2, g: 0.08 });
    return tn(c, { f: 5200, at: 0.12, d: 0.18, g: 0.07 });
  },
  cast_lightning: (c) => {
    c.send.gain.value = 0.3;
    nz(c, { f: 2500, type: 'highpass', a: 0.001, d: 0.1, g: 0.3 });
    tn(c, { w: 'sawtooth', f: 300, jit: [80, 900, 80], a: 0.003, hold: 0.2, d: 0.06, g: 0.14, hp: 800, shp: 'fuzz' });
    return tn(c, { f: 60, to: [[38, 0.2]], d: 0.14, g: 0.32 });
  },
  cast_light: (c) => {
    c.send.gain.value = 0.6;
    [69, 73, 76, 81].forEach((m, i) => tn(c, { w: i % 2 ? 'triangle' : 'sine', f: mtof(m), a: 0.08, hold: 0.2, d: 0.25, g: 0.07, at: i * 0.015 }));
    inst(c, PATCH.glock, 93, 0.1, 0.4, 0.5);
    tn(c, { f: 3520, vib: { hz: 6, c: 25 }, a: 0.1, d: 0.25, g: 0.04 });
    return nz(c, { f: 5000, type: 'highpass', a: 0.1, d: 0.2, g: 0.04 });
  },
  cast_shadow: (c) => {
    c.send.gain.value = 0.5;
    nz(c, { c: 'brown', f: 300, type: 'lowpass', to: [[1200, 0.4]], a: 0.4, d: 0.02, g: 0.45, cut: true });
    tn(c, { w: 'sawtooth', f: 55, a: 0.3, d: 0.08, g: 0.12, lp: 400 });
    tn(c, { w: 'sawtooth', f: 77.8, a: 0.3, d: 0.08, g: 0.1, lp: 400 });
    nz(c, { f: 2500, q: 3, a: 0.2, d: 0.15, g: 0.05 });
    return tn(c, { f: 80, to: [[40, 0.2]], at: 0.4, d: 0.14, g: 0.35 });
  },
  cast_mind: (c) => {
    c.send.gain.value = 0.55;
    tn(c, { f: 440, vib: { hz: 7, c: 60 }, a: 0.05, hold: 0.3, d: 0.25, g: 0.08, pan: -0.4 });
    tn(c, { f: 447, vib: { hz: 5.5, c: 60 }, a: 0.05, hold: 0.3, d: 0.25, g: 0.08, pan: 0.4 });
    tn(c, { w: 'triangle', f: 300, to: [[1200, 0.25], [300, 0.5]], a: 0.02, hold: 0.45, d: 0.1, g: 0.06, pan: -0.6, pan2: 0.6 });
    return nz(c, { f: 1500, to: [[4000, 0.3], [1500, 0.6]], q: 3, a: 0.1, hold: 0.3, d: 0.15, g: 0.04 });
  },
  cast_nature: (c) => {
    c.send.gain.value = 0.3;
    [72, 74, 76, 79, 81].forEach((m, i) => inst(c, PATCH.marimba, m, i * 0.05, 0.3, 0.55, false, -0.4 + i * 0.2));
    nz(c, { c: 'pink', f: 800, to: [[2000, 0.25]], a: 0.15, d: 0.18, g: 0.08 });
    return nz(c, { f: 4000, type: 'highpass', a: 0.05, hold: 0.2, d: 0.08, g: 0.04, rattle: [40, 0.1] });
  },
  cast_poison: (c) => {
    c.send.gain.value = 0.25;
    for (let i = 0; i < 5; i++) {
      const f = c.r.range(250, 450);
      tn(c, { f, to: [[f * 2.2, 0.04]], at: c.r.range(0, 0.35), d: 0.028, g: 0.14 });
    }
    nz(c, { c: 'brown', f: 500, type: 'lowpass', a: 0.05, hold: 0.15, d: 0.15, g: 0.25, rattle: [12, 0.2] });
    return nz(c, { f: 5000, type: 'highpass', d: 0.15, g: 0.035 });
  },
  cast_blood: (c) => {
    c.send.gain.value = 0.3;
    tn(c, { f: 90, to: [[45, 0.1]], d: 0.13, g: 0.45 });
    tn(c, { w: 'sawtooth', f: 110, to: [[70, 0.2]], a: 0.01, d: 0.18, g: 0.13, lp: 2500, fto: [300, 0.25], q: 8 });
    tn(c, { f: 60, at: 0.18, d: 0.07, g: 0.3 });
    tn(c, { f: 55, at: 0.36, d: 0.06, g: 0.2 });
    tn(c, { w: 'sawtooth', f: 220, a: 0.2, d: 0.1, g: 0.035, lp: 900 });
    return tn(c, { w: 'sawtooth', f: 233, a: 0.2, d: 0.1, g: 0.035, lp: 900 });
  },
  cast_earth: (c) => {
    c.send.gain.value = 0.2;
    nz(c, { c: 'brown', f: 150, type: 'lowpass', a: 0.1, hold: 0.15, d: 0.3, g: 0.6, shp: 'drive' });
    nz(c, { f: 700, q: 1, at: 0.1, d: 0.05, g: 0.3 });
    for (let i = 0; i < 4; i++) nz(c, { f: c.r.range(1500, 3000), q: 2, at: c.r.range(0.2, 0.5), d: 0.01, g: 0.1 });
    return tn(c, { f: 55, to: [[35, 0.3]], d: 0.28, g: 0.45 });
  },
  cast_time: (c) => {
    c.send.gain.value = 0.5;
    [0, 0.12, 0.21, 0.28, 0.33, 0.37].forEach((at, i) => {
      tn(c, { f: 2200 + i * 60, at, d: 0.008, g: 0.14 });
      nz(c, { f: 3000, q: 3, at, d: 0.004, g: 0.08 });
    });
    inst(c, REV_BELL, 88, 0, 0.4, 0.6);
    inst(c, PATCH.glock, 93, 0.4, 0.4, 0.6);
    return nz(c, { f: 4000, to: [[800, 0.5]], at: 0.4, a: 0.01, d: 0.12, g: 0.06 });
  },
  cast_luck: (c) => {
    c.send.gain.value = 0.4;
    [84, 86, 88, 91, 93, 96].forEach((m, i) => inst(c, PATCH.glock, m, i * 0.04, 0.3, 0.45, false, -0.5 + i * 0.2));
    coin(c, 0.26, 100, 0.6);
    return nz(c, { f: 3500, q: 3, at: 0.02, d: 0.005, g: 0.15 });
  },

  // ── movement & combat ──
  whoosh: (c) => {
    const p = c.r.chance(0.5) ? 1 : -1;
    return nz(c, { c: 'pink', f: 400, to: [[2200, 0.12], [700, 0.26]], q: 1.2, a: 0.08, d: 0.07, g: 0.45, pan: -0.4 * p, pan2: 0.4 * p });
  },
  dash: (c) => {
    nz(c, { f: 1200, to: [[5000, 0.08]], q: 1, a: 0.02, d: 0.05, g: 0.32 });
    return tn(c, { f: 300, to: [[900, 0.08]], d: 0.04, g: 0.08 });
  },
  teleport: (c) => {
    c.send.gain.value = 0.4;
    tn(c, { f: 1400, to: [[180, 0.12]], hold: 0.08, d: 0.04, g: 0.22, fm: { r: 1.5, i: 0.6, d: 0.1 } });
    tn(c, { f: 180, to: [[1600, 0.1]], at: 0.14, d: 0.07, g: 0.2 });
    inst(c, PATCH.glock, 96, 0.24, 0.2, 0.4);
    inst(c, PATCH.glock, 103, 0.28, 0.3, 0.35);
    return nz(c, { f: 3000, type: 'highpass', a: 0.08, d: 0.06, g: 0.06 });
  },
  hit_light: (c) => {
    tn(c, { f: 190, to: [[85, 0.04]], a: 0.0005, d: 0.04, g: 0.55 });
    nz(c, { f: 2200, q: 0.9, a: 0.0005, d: 0.018, g: 0.35 });
    return nz(c, { c: 'brown', f: 900, type: 'lowpass', d: 0.03, g: 0.25 });
  },
  hit_heavy: (c) => {
    c.send.gain.value = 0.1;
    tn(c, { f: 130, to: [[45, 0.09]], a: 0.0008, d: 0.1, g: 0.75, shp: 'drive' });
    nz(c, { f: 1400, q: 0.8, a: 0.0005, d: 0.045, g: 0.5 });
    nz(c, { c: 'brown', f: 400, type: 'lowpass', d: 0.12, g: 0.45 });
    return tn(c, { w: 'square', f: 70, to: [[40, 0.08]], d: 0.06, g: 0.12, lp: 300 });
  },
  hit_magic: (c) => {
    c.send.gain.value = 0.3;
    tn(c, { f: 180, to: [[90, 0.04]], a: 0.0005, d: 0.04, g: 0.45 });
    nz(c, { f: 2500, q: 0.9, a: 0.0005, d: 0.015, g: 0.25 });
    tn(c, { f: 1320, fm: { r: 1.41, i: 3, d: 0.06 }, d: 0.09, g: 0.14 });
    return inst(c, PATCH.glock, 100, 0.01, 0.2, 0.3);
  },
  punch_launch: (c) => {
    c.send.gain.value = 0.12;
    tn(c, { f: 95, to: [[38, 0.12]], a: 0.001, d: 0.16, g: 0.9, shp: 'drive' });
    nz(c, { f: 1800, q: 0.7, a: 0.0005, d: 0.03, g: 0.45 });
    const p = c.r.chance(0.5) ? 1 : -1;
    nz(c, { c: 'pink', f: 300, to: [[1800, 0.3], [900, 0.45]], q: 1.1, at: 0.04, a: 0.12, hold: 0.05, d: 0.1, g: 0.38, pan: -0.3 * p, pan2: 0.7 * p });
    return tn(c, { w: 'triangle', f: 620, to: [[300, 0.35]], at: 0.05, a: 0.02, d: 0.1, g: 0.05, pan: -0.3 * p, pan2: 0.7 * p });
  },
  explosion: (c) => {
    c.send.gain.value = 0.3;
    nz(c, { f: 6000, type: 'lowpass', to: [[300, 0.6]], a: 0.002, hold: 0.05, d: 0.35, g: 0.6, shp: 'drive' });
    nz(c, { c: 'brown', f: 200, type: 'lowpass', a: 0.005, d: 0.65, g: 0.75 });
    for (let i = 0; i < 8; i++) nz(c, { f: c.r.range(1800, 4000), q: 2, at: c.r.range(0.1, 0.9), d: 0.006, g: c.r.range(0.05, 0.12), pan: c.r.range(-0.8, 0.8) });
    return tn(c, { f: 60, to: [[28, 0.4]], d: 0.35, g: 0.85 });
  },
  shield_block: (c) => {
    c.send.gain.value = 0.2;
    [[1, 0.2, 0.25], [2.76, 0.12, 0.12], [5.4, 0.08, 0.05]].forEach(([r, g, d]) => tn(c, { f: 520 * (r ?? 1), d: d ?? 0.1, g: g ?? 0.1 }));
    nz(c, { f: 3000, q: 1, d: 0.02, g: 0.35 });
    return tn(c, { f: 150, to: [[90, 0.05]], d: 0.05, g: 0.35 });
  },
  arrow_shot: (c) => {
    tn(c, { w: 'triangle', f: 180, to: [[120, 0.06]], a: 0.001, d: 0.06, g: 0.3 });
    return nz(c, { f: 3000, to: [[1500, 0.15]], q: 1.2, a: 0.01, d: 0.06, g: 0.15 });
  },
  arrow_hit: (c) => {
    nz(c, { f: 1500, type: 'lowpass', a: 0.0005, d: 0.02, g: 0.4 });
    tn(c, { f: 240, to: [[110, 0.03]], d: 0.04, g: 0.42 });
    return nz(c, { f: 900, q: 6, d: 0.03, g: 0.3 });
  },
  sword_swing: (c) => {
    const p = c.r.chance(0.5) ? 1 : -1;
    nz(c, { f: 2000, to: [[6000, 0.07], [2500, 0.16]], q: 2, a: 0.04, d: 0.05, g: 0.3, pan: -0.3 * p, pan2: 0.3 * p });
    return tn(c, { f: 3400, at: 0.05, d: 0.06, g: 0.025 });
  },
  sword_clash: (c) => {
    c.send.gain.value = 0.25;
    [1, 1.47, 2.09, 2.56, 3.14].forEach((r, i) => tn(c, { f: 1350 * r, d: 0.35 - i * 0.06, g: 0.1 - i * 0.012 }));
    nz(c, { f: 2500, type: 'highpass', d: 0.03, g: 0.5 });
    return tn(c, { f: 2800, to: [[2650, 0.4]], vib: { hz: 8, c: 20 }, d: 0.35, g: 0.04 });
  },
  footstep: (c) => {
    nz(c, { c: 'pink', f: 700, type: 'lowpass', to: [[300, 0.04]], a: 0.002, d: 0.035, g: 0.28 });
    return tn(c, { f: 90, to: [[60, 0.03]], d: 0.03, g: 0.18 });
  },
  death_pop: (c) => {
    c.send.gain.value = 0.15;
    tn(c, { f: 520, to: [[1300, 0.03]], a: 0.001, d: 0.035, g: 0.35 });
    nz(c, { f: 1100, q: 1, a: 0.001, hold: 0.02, d: 0.05, g: 0.32 });
    return inst(c, PATCH.glock, 100, 0.03, 0.1, 0.18);
  },
  ragdoll_thud: (c) => {
    tn(c, { f: 75, to: [[42, 0.08]], d: 0.09, g: 0.6 });
    nz(c, { c: 'brown', f: 500, type: 'lowpass', d: 0.08, g: 0.45 });
    return tn(c, { f: 70, to: [[45, 0.05]], at: 0.13, d: 0.05, g: 0.22 });
  },

  // ── status ──
  heal: (c) => {
    c.send.gain.value = 0.55;
    [72, 76, 79, 84, 88].forEach((m, i) => inst(c, PATCH.celesta, m, i * 0.06, 0.4, 0.42, false, -0.4 + i * 0.2));
    tn(c, { f: 1568, vib: { hz: 5, c: 30 }, a: 0.1, hold: 0.2, d: 0.22, g: 0.04 });
    tn(c, { f: 2093, vib: { hz: 5.5, c: 30 }, a: 0.12, hold: 0.2, d: 0.22, g: 0.03 });
    return nz(c, { f: 6000, type: 'highpass', a: 0.1, d: 0.2, g: 0.03 });
  },
  buff: (c) => {
    c.send.gain.value = 0.35;
    tn(c, { w: 'sawtooth', f: 200, to: [[800, 0.25]], a: 0.02, hold: 0.2, d: 0.08, g: 0.1, lp: 1500 });
    inst(c, PATCH.stab, 64, 0.25, 0.3, 0.6);
    inst(c, PATCH.stab, 71, 0.25, 0.3, 0.55);
    return inst(c, PATCH.glock, 95, 0.28, 0.3, 0.35);
  },
  debuff: (c) => {
    c.send.gain.value = 0.3;
    tn(c, { w: 'sawtooth', f: 600, to: [[300, 0.3]], a: 0.01, hold: 0.25, d: 0.08, g: 0.1, lp: 1500 });
    tn(c, { w: 'sawtooth', f: 584, to: [[287, 0.3]], a: 0.01, hold: 0.25, d: 0.08, g: 0.08, lp: 1400 });
    tn(c, { w: 'square', f: 196, at: 0.3, d: 0.1, g: 0.05, lp: 800 });
    return tn(c, { w: 'square', f: 208, at: 0.3, d: 0.1, g: 0.05, lp: 800 });
  },
  invisibility_on: (c) => {
    c.send.gain.value = 0.6;
    nz(c, { f: 3000, type: 'highpass', to: [[9000, 0.35]], a: 0.3, d: 0.1, g: 0.12 });
    tn(c, { f: 1200, to: [[2400, 0.35]], vib: { hz: 9, c: 40 }, a: 0.25, d: 0.1, g: 0.05 });
    [2637, 3136, 3951].forEach((f, i) => tn(c, { f, at: 0.3 + i * 0.05, d: 0.12, g: 0.035 }));
    return c.t + 1;
  },
  invisibility_off: (c) => {
    c.send.gain.value = 0.4;
    tn(c, { f: 2400, to: [[900, 0.1]], d: 0.07, g: 0.14 });
    nz(c, { f: 6000, type: 'highpass', to: [[2000, 0.1]], a: 0.001, d: 0.05, g: 0.12 });
    return inst(c, PATCH.glock, 93, 0.02, 0.2, 0.4);
  },
  mind_control: (c) => {
    c.send.gain.value = 0.6;
    tn(c, { f: 330, vib: { hz: 6, c: 80 }, a: 0.2, hold: 0.35, d: 0.25, g: 0.09, pan: -0.5 });
    tn(c, { f: 336, vib: { hz: 4.7, c: 80 }, a: 0.2, hold: 0.35, d: 0.25, g: 0.09, pan: 0.5 });
    tn(c, { f: 660, fm: { r: 1.5, i: 2, d: 0.4 }, a: 0.05, d: 0.35, g: 0.05 });
    tn(c, { w: 'triangle', f: 900, to: [[300, 0.35], [900, 0.7]], a: 0.05, hold: 0.6, d: 0.1, g: 0.04, pan: 0.6, pan2: -0.6 });
    return nz(c, { f: 3000, q: 4, a: 0.2, d: 0.2, g: 0.05 });
  },
  revive: (c) => {
    c.send.gain.value = 0.6;
    const bus = formantBus(c, 'a');
    [57, 61, 64, 69].forEach((m, i) => tn(c, { w: 'sawtooth', f: mtof(m), dt: (i - 1.5) * 6, a: 0.45, hold: 0.3, d: 0.25, g: 0.05, dest: bus }));
    inst(c, PATCH.glock, 81, 0.5, 0.5, 0.5);
    inst(c, PATCH.glock, 88, 0.56, 0.5, 0.45);
    nz(c, { f: 2000, to: [[8000, 0.5]], type: 'highpass', a: 0.45, d: 0.06, g: 0.06 });
    return c.t + 2;
  },
  level_up: (c) => {
    c.send.gain.value = 0.35;
    [72, 76, 79].forEach((m, i) => inst(c, PATCH.brass, m, i * 0.08, 0.1, 0.62));
    inst(c, PATCH.brass, 84, 0.24, 0.55, 0.72);
    inst(c, PATCH.brass, 79, 0.24, 0.55, 0.5);
    inst(c, PATCH.brass, 76, 0.24, 0.55, 0.45);
    [108, 103, 100, 96].forEach((m, i) => inst(c, PATCH.glock, m, 0.32 + i * 0.05, 0.3, 0.3, false, 0.5 - i * 0.3));
    nz(c, { f: 800, to: [[6000, 0.3]], q: 1, a: 0.2, d: 0.08, g: 0.07 });
    return c.t + 1.8;
  },

  // ── loot (escalating grandeur) ──
  loot_common: (c) => {
    c.send.gain.value = 0.2;
    nz(c, { f: 3000, q: 2, d: 0.005, g: 0.1 });
    return inst(c, PATCH.harp, 81, 0, 0.4, 0.5);
  },
  loot_rare: (c) => {
    c.send.gain.value = 0.35;
    inst(c, PATCH.glock, 88, 0, 0.3, 0.55);
    inst(c, PATCH.glock, 95, 0.07, 0.5, 0.6);
    return tn(c, { f: 2637, vib: { hz: 6, c: 25 }, at: 0.05, a: 0.05, d: 0.2, g: 0.035 });
  },
  loot_epic: (c) => {
    c.send.gain.value = 0.45;
    [86, 90, 93, 97].forEach((m, i) => inst(c, PATCH.glock, m, i * 0.07, 0.4, 0.55, false, -0.3 + i * 0.2));
    [74, 78, 81].forEach((m) => inst(c, PATCH.celesta, m, 0.21, 0.6, 0.35));
    tn(c, { f: 65, to: [[45, 0.25]], d: 0.25, g: 0.35 });
    return nz(c, { f: 7000, type: 'highpass', a: 0.1, d: 0.3, g: 0.035 });
  },
  loot_legendary: (c) => {
    c.send.gain.value = 0.5;
    [60, 64, 67, 72].forEach((m) => inst(c, PATCH.stab, m, 0, 0.3, 0.55));
    [84, 88, 91, 96, 100].forEach((m, i) => inst(c, PATCH.glock, m, 0.05 + i * 0.06, 0.4, 0.55, false, -0.4 + i * 0.2));
    for (let i = 0; i < 8; i++) inst(c, PATCH.glock, c.r.pick([96, 100, 103, 108]), 0.35 + i * 0.075 + c.r.range(0, 0.03), 0.2, 0.25, false, c.r.range(-0.8, 0.8));
    tn(c, { f: 50, to: [[32, 0.4]], d: 0.35, g: 0.6 });
    [60, 64, 67].forEach((m) => tn(c, { f: mtof(m), a: 0.1, hold: 0.3, d: 0.4, g: 0.05 }));
    return c.t + 2.6;
  },
  loot_mythic: (c) => {
    c.send.gain.value = 0.6;
    inst(c, REV_BELL, 81, 0, 0.5, 0.55);
    inst(c, REV_BELL, 88, 0, 0.5, 0.45);
    nz(c, { f: 800, type: 'lowpass', to: [[6000, 0.5]], a: 0.5, d: 0.02, g: 0.2, cut: true });
    tn(c, { f: 55, to: [[30, 0.5]], at: 0.5, d: 0.45, g: 0.75 });
    inst(c, PATCH.bell, 57, 0.5, 2, 0.6);
    // the Excepcion signature: E F E C B
    [88, 89, 88, 84, 83].forEach((m, i) => inst(c, PATCH.glock, m, 0.55 + i * 0.09, 0.3, 0.45, false, -0.4 + i * 0.2));
    [57, 60, 64, 71].forEach((m) => tn(c, { f: mtof(m), at: 0.5, a: 0.2, hold: 0.4, d: 0.5, g: 0.045 }));
    return c.t + 3.2;
  },

  // ── la Excepción ──
  copy_progress: (c) => {
    c.send.gain.value = 0.35;
    nz(c, { f: 3000, type: 'highpass', to: [[7000, 0.1]], a: 0.1, d: 0.01, g: 0.1, cut: true });
    return inst(c, GLASS, 2640, 0.1, 0.2, 0.4, true);
  },
  copy_acquired: (c) => {
    c.send.gain.value = 0.75;
    // reverse swell into the impact
    nz(c, { f: 800, type: 'lowpass', to: [[6000, 0.6]], a: 0.6, d: 0.02, g: 0.28, cut: true });
    [57, 64, 69, 72].forEach((m) => inst(c, REV_BELL, m, 0, 0.62, 0.35));
    // impact
    tn(c, { f: 55, to: [[32, 0.4]], at: 0.62, d: 0.4, g: 0.95 });
    nz(c, { f: 1500, q: 0.8, at: 0.62, d: 0.05, g: 0.4 });
    // the choir: minor... then major (it becomes yours)
    const bus = formantBus(c, 'a');
    [45, 52, 57, 60, 64].forEach((m, i) => tn(c, { w: 'sawtooth', f: mtof(m), dt: (i - 2) * 7, at: 0.62, a: 0.15, hold: 0.45, d: 0.2, g: 0.045, dest: bus }));
    [45, 52, 57, 61, 64, 69].forEach((m, i) => tn(c, { w: 'sawtooth', f: mtof(m), dt: (i - 2) * 7, at: 1.2, a: 0.25, hold: 0.7, d: 0.45, g: 0.045, dest: bus }));
    inst(c, PATCH.bell, 45, 0.62, 3, 0.8);
    [88, 89, 88, 84, 83].forEach((m, i) => inst(c, PATCH.glock, m, 0.68 + i * 0.08, 0.3, 0.3, false, -0.5 + i * 0.25));
    return c.t + 4.5;
  },

  // ── casino ──
  dice_roll: (c) => {
    let at = 0;
    for (let i = 0; i < 11; i++) {
      at += c.r.range(0.025, 0.065) * (1 + i * 0.05);
      nz(c, { f: c.r.range(2000, 4500), q: 3, at, d: 0.006, g: c.r.range(0.22, 0.4), pan: c.r.range(-0.4, 0.4) });
      tn(c, { f: c.r.range(1500, 2500), at, d: 0.008, g: 0.07 });
    }
    return nz(c, { c: 'brown', f: 300, type: 'lowpass', a: 0.05, d: 0.2, g: 0.1 });
  },
  dice_land: (c) => {
    [0, 0.09, 0.15].forEach((at, i) => {
      tn(c, { f: 180 - i * 15, to: [[120, 0.03]], at, d: 0.03, g: 0.32 - i * 0.07 });
      nz(c, { f: 2500, q: 2, at, d: 0.005, g: 0.2 - i * 0.05 });
    });
    return c.t + 0.4;
  },
  card_flip: (c) => {
    nz(c, { f: 2800, q: 1, a: 0.002, d: 0.018, g: 0.3 });
    nz(c, { f: 5000, type: 'highpass', at: 0.02, d: 0.004, g: 0.2 });
    return tn(c, { f: 1200, to: [[700, 0.01]], d: 0.01, g: 0.05 });
  },
  card_deal: (c) => {
    nz(c, { c: 'pink', f: 1800, to: [[3500, 0.08]], q: 1, a: 0.02, d: 0.03, g: 0.16 });
    return nz(c, { f: 4000, type: 'highpass', at: 0.08, d: 0.005, g: 0.25 });
  },
  chip_place: (c) => {
    nz(c, { f: 4200, q: 5, d: 0.012, g: 0.35 });
    tn(c, { f: 3300, d: 0.02, g: 0.12 });
    nz(c, { f: 3100, q: 5, at: 0.014, d: 0.012, g: 0.25 });
    tn(c, { f: 2600, at: 0.014, d: 0.02, g: 0.08 });
    return tn(c, { f: 400, d: 0.01, g: 0.08 });
  },
  slot_spin: (c) => {
    let at = 0;
    for (let i = 0; i < 14; i++) {
      at += 0.055 * Math.pow(0.9, i) + 0.012;
      tn(c, { w: 'square', f: 1800, at, d: 0.004, g: 0.07, lp: 4000 });
      nz(c, { f: 2500, q: 2, at, d: 0.003, g: 0.08 });
    }
    return tn(c, { w: 'sawtooth', f: 70, to: [[140, 0.4]], a: 0.1, hold: 0.2, d: 0.15, g: 0.07, lp: 600 });
  },
  slot_reel_stop: (c) => {
    tn(c, { f: 140, to: [[90, 0.05]], d: 0.05, g: 0.4 });
    nz(c, { f: 1500, q: 1.5, d: 0.015, g: 0.3 });
    nz(c, { f: 5000, type: 'highpass', d: 0.003, g: 0.2 });
    return inst(c, PATCH.glock, c.r.pick(PENTA), 0.03, 0.2, 0.25);
  },
  slot_near_miss: (c) => {
    c.send.gain.value = 0.25;
    tn(c, { w: 'sawtooth', f: 300, to: [[1200, 0.6]], a: 0.05, hold: 0.55, d: 0.05, g: 0.09, lp: 2200, am: { hz: 12, depth: 0.7 } });
    for (let i = 0; i < 8; i++) tn(c, { f: 2000, at: 0.6 * (1 - Math.pow(0.8, i + 1)) / 0.83, d: 0.006, g: 0.08 });
    // ...and deflate: a sad wah-wah
    return tn(c, { w: 'sawtooth', f: 400, to: [[180, 0.5]], at: 0.72, a: 0.03, hold: 0.45, d: 0.12, g: 0.13, lp: 1000, vib: { hz: 5, c: 40 } });
  },
  slot_win_small: (c) => {
    c.send.gain.value = 0.3;
    [84, 88, 91].forEach((m, i) => inst(c, PATCH.glock, m, i * 0.08, 0.3, 0.55));
    for (let i = 0; i < 3; i++) coin(c, 0.2 + i * 0.06, c.r.pick(PENTA), 0.45);
    return c.t + 1.1;
  },
  slot_win_big: (c) => {
    c.send.gain.value = 0.35;
    [60, 64, 67].forEach((m) => inst(c, PATCH.stab, m, 0, 0.3, 0.55));
    [84, 88, 91, 96, 100, 103].forEach((m, i) => inst(c, PATCH.glock, m, i * 0.07, 0.3, 0.5, false, -0.5 + i * 0.2));
    for (let i = 0; i < 12; i++) inst(c, COIN, c.r.pick(PENTA), 0.3 + i * 0.07 + c.r.range(0, 0.03), 0.05, c.r.range(0.4, 0.7), false, c.r.range(-0.6, 0.6));
    return c.t + 2;
  },
  jackpot: (c) => {
    c.send.gain.value = 0.4;
    const chords: ReadonlyArray<readonly number[]> = [[60, 64, 67, 72], [65, 69, 72, 77], [67, 71, 74, 79], [72, 76, 79, 84]];
    chords.forEach((ch, i) => ch.forEach((m) => inst(c, PATCH.brass, m, i * 0.24, i === 3 ? 1 : 0.18, 0.55)));
    nz(c, { f: 4000, type: 'highpass', at: 0.72, a: 0.002, d: 0.6, g: 0.18 });
    [84, 88, 91, 96, 100, 103, 108].forEach((m, i) => inst(c, PATCH.glock, m, 0.72 + i * 0.05, 0.3, 0.45, false, -0.6 + i * 0.2));
    for (let i = 0; i < 28; i++) {
      const at = 0.1 + 2.1 * Math.pow(i / 28, 1.15) + c.r.range(0, 0.03);
      inst(c, COIN, c.r.pick(PENTA) + (c.r.chance(0.25) ? 12 : 0), at, 0.05, c.r.range(0.35, 0.7), false, c.r.range(-0.8, 0.8));
    }
    nz(c, { f: 7000, q: 1, a: 0.1, hold: 1.8, d: 0.3, g: 0.05, rattle: [60, 0.2] });
    return c.t + 3.2;
  },
  wheel_tick: (c) => {
    nz(c, { f: 2600, q: 4, d: 0.005, g: 0.32 });
    return tn(c, { f: 1900, d: 0.006, g: 0.07 });
  },
  wheel_ball: (c) => {
    let at = 0;
    for (let i = 0; i < 9; i++) {
      at += 0.05 + i * 0.02;
      nz(c, { f: c.r.range(3000, 4500), q: 4, at, d: 0.005, g: 0.3 - i * 0.025 });
      tn(c, { f: c.r.range(2800, 3600), at, d: 0.01, g: 0.05 });
    }
    return nz(c, { f: 1200, q: 1, a: 0.05, hold: 0.5, d: 0.2, g: 0.05 });
  },

  // ── crowd ──
  crowd_cheer: (c) => {
    c.send.gain.value = 0.35;
    const bus = formantBus(c, 'a');
    nz(c, { c: 'pink', f: 1200, q: 0.5, a: 0.25, hold: 0.6, d: 0.45, g: 0.5, dest: bus, rattle: [9, 0.6] });
    for (let i = 0; i < 6; i++) {
      const f = c.r.range(280, 520);
      tn(c, { w: 'sawtooth', f, to: [[f * 1.35, 0.3]], at: c.r.range(0, 0.5), a: 0.08, hold: 0.2, d: 0.18, g: 0.022, lp: 1600, vib: { hz: 6, c: 30 }, pan: c.r.range(-0.8, 0.8) });
    }
    for (let i = 0; i < 14; i++) nz(c, { f: 1500, q: 1, at: c.r.range(0.1, 1.3), d: 0.012, g: 0.1, pan: c.r.range(-0.9, 0.9) });
    return c.t + 2.2;
  },
  crowd_gasp: (c) => {
    c.send.gain.value = 0.3;
    nz(c, { f: 1400, to: [[2200, 0.15]], q: 1.5, a: 0.08, hold: 0.05, d: 0.12, g: 0.32 });
    return nz(c, { f: 900, q: 2, a: 0.06, hold: 0.05, d: 0.1, g: 0.14 });
  },
  crowd_boo: (c) => {
    c.send.gain.value = 0.35;
    const bus = formantBus(c, 'o');
    for (let i = 0; i < 6; i++) {
      const f = c.r.range(105, 170);
      tn(c, { w: 'sawtooth', f, to: [[f * 0.82, 1.1]], at: c.r.range(0, 0.2), a: 0.2, hold: 0.6, d: 0.28, g: 0.05, vib: { hz: 5, c: 30 }, dest: bus });
    }
    return nz(c, { c: 'pink', f: 600, type: 'lowpass', a: 0.2, hold: 0.6, d: 0.3, g: 0.12 });
  },

  // ── misc ──
  page_turn: (c) => {
    nz(c, { c: 'pink', f: 3500, q: 0.8, a: 0.03, hold: 0.18, d: 0.06, g: 0.25, rattle: [80, 0.15] });
    return nz(c, { f: 1500, to: [[4000, 0.2]], q: 1, a: 0.1, d: 0.05, g: 0.08 });
  },
  quill: (c) => {
    let end = c.t;
    [0, 0.14, 0.3].forEach((at) => {
      end = nz(c, { f: 6000, q: 1.5, at, a: 0.01, hold: c.r.range(0.07, 0.11), d: 0.02, g: 0.12, rattle: [120, 0.1] });
    });
    return end;
  },
  heartbeat: (c) => {
    tn(c, { f: 62, to: [[45, 0.05]], d: 0.07, g: 0.75 });
    nz(c, { c: 'brown', f: 200, type: 'lowpass', d: 0.04, g: 0.2 });
    return tn(c, { f: 55, to: [[40, 0.05]], at: 0.2, d: 0.06, g: 0.5 });
  },
  whisper: (c) => {
    c.send.gain.value = 0.7;
    const p = c.r.range(-0.5, 0.5);
    nz(c, { f: 6000, type: 'highpass', a: 0.03, hold: 0.08, d: 0.03, g: 0.1, pan: p });
    nz(c, { f: 2400, q: 4, at: 0.13, a: 0.02, hold: 0.08, d: 0.05, g: 0.09, pan: p });
    nz(c, { f: 400, q: 3, at: 0.13, a: 0.02, hold: 0.08, d: 0.05, g: 0.05, pan: p });
    nz(c, { f: 350, type: 'lowpass', at: 0.3, a: 0.02, hold: 0.05, d: 0.03, g: 0.05, pan: p });
    nz(c, { f: 1500, q: 2, at: 0.38, d: 0.008, g: 0.08, pan: p });
    return nz(c, { f: 1600, q: 3, at: 0.42, a: 0.02, hold: 0.08, d: 0.08, g: 0.08, pan: p });
  },
  bell: (c) => {
    c.send.gain.value = 0.6;
    return inst(c, PATCH.bell, 196, 0, 4, 0.75, true);
  },
  horn_war: (c) => {
    c.send.gain.value = 0.55;
    for (let i = 0; i < 3; i++) {
      tn(c, {
        w: 'brass', f: 110, to: [[110, 0.15], [146.8, 0.4]], dt: (i - 1) * 9, a: 0.2, hold: 0.9, d: 0.3, g: 0.13,
        lp: 300, fto: [1400, 0.5], q: 1.2, shp: 'drive',
      });
    }
    return c.t + 3;
  },
  drum_war: (c) => {
    c.send.gain.value = 0.35;
    [0, 0.36, 0.72].forEach((at, i) => inst(c, PATCH.taiko, 45, at, 1, i === 2 ? 1 : 0.75));
    nz(c, { f: 2500, q: 2, at: 0.18, d: 0.01, g: 0.12 });
    return nz(c, { f: 2500, q: 2, at: 0.54, d: 0.01, g: 0.12 });
  },
  glitch: (c) => {
    let at = 0;
    for (let i = 0; i < 10; i++) {
      const len = c.r.range(0.018, 0.035);
      const k = c.r.int(0, 2);
      if (k === 0) tn(c, { w: 'square', f: c.r.range(200, 3000), at, hold: len, d: 0.004, g: 0.12, shp: 'crush' });
      else if (k === 1) nz(c, { f: c.r.range(500, 6000), q: 2, at, hold: len, d: 0.004, g: 0.2, shp: 'crush' });
      at += len + (c.r.chance(0.3) ? 0.02 : 0);
    }
    return tn(c, { w: 'square', f: 800, to: [[50, 0.1]], at, d: 0.04, g: 0.1, shp: 'crush' });
  },
  impact_frame: (c) => {
    c.send.gain.value = 0.35;
    tn(c, { f: 110, to: [[35, 0.15]], a: 0.0005, d: 0.25, g: 1, shp: 'drive' });
    nz(c, { f: 2500, q: 0.5, a: 0.0005, d: 0.06, g: 0.7 });
    nz(c, { c: 'brown', f: 300, type: 'lowpass', d: 0.3, g: 0.55 });
    return tn(c, { f: 3100, to: [[3000, 0.3]], vib: { hz: 7, c: 20 }, at: 0.01, a: 0.001, d: 0.35, g: 0.07 });
  },
  typewriter: (c) => {
    nz(c, { f: 2800, q: 3, d: 0.006, g: 0.3 });
    tn(c, { w: 'square', f: 1800, d: 0.004, g: 0.035, lp: 3000 });
    return tn(c, { f: 220, to: [[160, 0.012]], d: 0.012, g: 0.12 });
  },
  narrator: (c) => {
    c.send.gain.value = 0.6;
    tn(c, { f: 196, fm: { r: 2, i: 0.8, d: 0.3 }, a: 0.02, d: 0.5, g: 0.1 });
    tn(c, { f: 293.7, fm: { r: 2, i: 0.5, d: 0.3 }, at: 0.02, a: 0.02, d: 0.45, g: 0.07 });
    nz(c, { c: 'pink', f: 800, to: [[1600, 0.3]], q: 1, a: 0.15, d: 0.18, g: 0.05 });
    return nz(c, { c: 'pink', f: 3500, q: 0.8, at: 0.05, a: 0.02, hold: 0.08, d: 0.05, g: 0.04, rattle: [80, 0.2] });
  },
  alert_rise: (c) => {
    c.send.gain.value = 0.25;
    tn(c, { w: 'sawtooth', f: 280, to: [[1100, 0.55]], a: 0.02, hold: 0.5, d: 0.07, g: 0.11, lp: 2500, am: { hz: 14, depth: 0.8 } });
    return inst(c, PATCH.glock, 96, 0.55, 0.3, 0.5);
  },
  gavel: (c) => {
    c.send.gain.value = 0.35;
    tn(c, { f: 190, to: [[140, 0.02]], d: 0.06, g: 0.6 });
    nz(c, { f: 1100, q: 5, d: 0.025, g: 0.45 });
    nz(c, { f: 3000, type: 'highpass', d: 0.004, g: 0.25 });
    tn(c, { f: 190, to: [[140, 0.02]], at: 0.09, d: 0.05, g: 0.2 });
    return nz(c, { f: 1100, q: 5, at: 0.09, d: 0.02, g: 0.15 });
  },
  door: (c) => {
    c.send.gain.value = 0.3;
    tn(c, { w: 'sawtooth', f: 95, jit: [80, 130, 40], a: 0.05, hold: 0.4, d: 0.05, g: 0.12, bp: 1100, q: 6 });
    tn(c, { f: 90, to: [[55, 0.1]], at: 0.55, d: 0.1, g: 0.5 });
    nz(c, { c: 'brown', f: 600, type: 'lowpass', at: 0.55, d: 0.06, g: 0.35 });
    return nz(c, { f: 3000, type: 'highpass', at: 0.6, d: 0.004, g: 0.2 });
  },
  fire_burst: (c) => {
    c.send.gain.value = 0.2;
    nz(c, { c: 'brown', f: 300, type: 'lowpass', to: [[2500, 0.12]], a: 0.03, d: 0.2, g: 0.55, shp: 'drive' });
    nz(c, { f: 1000, to: [[3500, 0.12]], a: 0.02, d: 0.12, g: 0.15 });
    for (let i = 0; i < 5; i++) nz(c, { f: c.r.range(2500, 6000), q: 2, at: c.r.range(0.1, 0.5), d: 0.004, g: 0.12 });
    return tn(c, { f: 80, to: [[50, 0.15]], d: 0.14, g: 0.4 });
  },
  freeze: (c) => {
    c.send.gain.value = 0.45;
    for (let i = 0; i < 14; i++) nz(c, { f: c.r.range(5000, 9000), q: 3, at: 0.5 * Math.pow(i / 14, 0.7), d: 0.003, g: 0.1, pan: c.r.range(-0.7, 0.7) });
    [3520, 2637, 1976].forEach((f, i) => inst(c, GLASS, f, i * 0.1, 0.2, 0.45, true));
    nz(c, { f: 7000, type: 'highpass', a: 0.05, d: 0.3, g: 0.05 });
    return nz(c, { f: 2000, q: 1, at: 0.45, d: 0.01, g: 0.3 });
  },
  zap: (c) => {
    tn(c, { w: 'sawtooth', f: 400, jit: [150, 1400, 90], a: 0.002, hold: 0.15, d: 0.03, g: 0.11, hp: 900, shp: 'fuzz' });
    nz(c, { f: 3000, type: 'highpass', d: 0.05, g: 0.2 });
    return tn(c, { f: 3000, to: [[1500, 0.05]], d: 0.03, g: 0.05 });
  },
  poison_bubble: (c) => {
    let end = c.t;
    [0, c.r.range(0.05, 0.09), c.r.range(0.12, 0.18)].forEach((at) => {
      const f = c.r.range(300, 500);
      end = tn(c, { f, to: [[f * 2.5, 0.035]], at, a: 0.002, d: 0.025, g: 0.2 });
      nz(c, { f: 1500, q: 2, at: at + 0.03, d: 0.004, g: 0.05 });
    });
    return end;
  },
  thunder: (c) => {
    c.send.gain.value = 0.4;
    nz(c, { f: 1500, type: 'highpass', a: 0.001, d: 0.08, g: 0.5 });
    nz(c, { c: 'brown', f: 200, type: 'lowpass', to: [[90, 2]], a: 0.05, hold: 0.4, d: 1.1, g: 0.85, rattle: [12, 0.45] });
    return tn(c, { f: 45, to: [[30, 1]], d: 0.8, g: 0.3 });
  },
  bark: (c) => {
    tn(c, { w: 'sawtooth', f: 420, to: [[260, 0.06]], a: 0.005, hold: 0.03, d: 0.05, g: 0.2, bp: 900, q: 2 });
    nz(c, { f: 1500, q: 1, a: 0.004, d: 0.03, g: 0.14 });
    return tn(c, { w: 'square', f: 210, to: [[150, 0.06]], d: 0.05, g: 0.07, lp: 800 });
  },
  step_grass: (c) => {
    nz(c, { f: 4000, q: 0.7, a: 0.005, hold: 0.03, d: 0.04, g: 0.18, rattle: [150, 0.1] });
    return tn(c, { f: 80, d: 0.03, g: 0.1 });
  },
  splash: (c) => {
    c.send.gain.value = 0.25;
    nz(c, { f: 1200, to: [[2500, 0.05]], q: 0.8, a: 0.001, d: 0.2, g: 0.45 });
    nz(c, { f: 3000, type: 'highpass', d: 0.35, g: 0.15 });
    tn(c, { f: 350, to: [[140, 0.06]], d: 0.05, g: 0.3 });
    for (let i = 0; i < 4; i++) {
      const f = c.r.range(400, 800);
      tn(c, { f, to: [[f * 2, 0.03]], at: c.r.range(0.1, 0.4), d: 0.02, g: 0.08 });
    }
    return c.t + 1;
  },
  eat: (c) => {
    let end = c.t;
    [0, 0.12, 0.24].forEach((at) => {
      end = nz(c, { f: 1800, q: 1, at, a: 0.003, hold: 0.04, d: 0.03, g: 0.3, rattle: [200, 0.1] });
      tn(c, { f: 150, at, d: 0.02, g: 0.14 });
    });
    return end;
  },
  burp: (c) => {
    const bus = formantBus(c, 'o');
    return tn(c, { w: 'sawtooth', f: 95, to: [[75, 0.35]], vib: { hz: 22, c: 150 }, a: 0.02, hold: 0.25, d: 0.07, g: 0.35, shp: 'drive', dest: bus });
  },
  toad: (c) => {
    tn(c, { w: 'square', f: 130, to: [[115, 0.08]], am: { hz: 32, depth: 1 }, a: 0.005, hold: 0.07, d: 0.03, g: 0.2, bp: 700, q: 3 });
    return tn(c, { w: 'square', f: 140, to: [[122, 0.08]], am: { hz: 34, depth: 1 }, at: 0.16, a: 0.005, hold: 0.07, d: 0.03, g: 0.18, bp: 750, q: 3 });
  },
  bomb_fuse: (c) => {
    for (let i = 0; i < 5; i++) nz(c, { f: c.r.range(3000, 7000), q: 3, at: c.r.range(0, 0.7), d: 0.004, g: 0.12 });
    return nz(c, { f: 3500, type: 'highpass', a: 0.02, hold: 0.6, d: 0.08, g: 0.12, rattle: [90, 0.3] });
  },
  clone: (c) => {
    c.send.gain.value = 0.4;
    tn(c, { f: 1760, fm: { r: 2, i: 2, d: 0.08 }, d: 0.14, g: 0.16, pan: -0.5 });
    tn(c, { f: 1781, fm: { r: 2, i: 2, d: 0.08 }, at: 0.07, d: 0.14, g: 0.14, pan: 0.5 });
    return nz(c, { f: 1000, to: [[5000, 0.2]], q: 1, a: 0.1, d: 0.06, g: 0.1 });
  },
  eclipse: (c) => {
    c.send.gain.value = 0.7;
    tn(c, { f: 110, to: [[55, 1.5]], a: 0.1, hold: 0.5, d: 0.9, g: 0.35 });
    [1760, 1864.7, 2489].forEach((f) => tn(c, { f, a: 0.8, d: 0.01, g: 0.03 }));
    nz(c, { f: 400, type: 'lowpass', to: [[2500, 0.8]], a: 0.8, d: 0.02, g: 0.3, cut: true });
    tn(c, { f: 60, to: [[30, 0.5]], at: 0.85, d: 0.55, g: 0.85 });
    inst(c, PATCH.bell, 45, 0.85, 3, 0.8);
    [88, 89, 88, 84, 83].forEach((m, i) => inst(c, PATCH.glock, m - 12, 0.95 + i * 0.12, 0.3, 0.35));
    return c.t + 4;
  },
};

type Prio = 1 | 2 | 3;
const PRIO: Partial<Record<SfxName, Prio>> = {
  ui_click: 3, ui_hover: 3, ui_open: 3, ui_close: 3, ui_error: 3, ui_confirm: 3, ui_tab: 3,
  level_up: 3, loot_common: 3, loot_rare: 3, loot_epic: 3, loot_legendary: 3, loot_mythic: 3,
  copy_progress: 3, copy_acquired: 3, jackpot: 3, slot_win_big: 3, purchase: 3, revive: 3, eclipse: 3, gavel: 3,
  narrator: 3, typewriter: 3,
  hit_light: 1, hit_heavy: 1, hit_magic: 1, footstep: 1, step_grass: 1, arrow_shot: 1, arrow_hit: 1,
  sword_swing: 1, sword_clash: 1, death_pop: 1, ragdoll_thud: 1, shield_block: 1, whoosh: 1, punch_launch: 1,
  eat: 1, burp: 1, bark: 1, toad: 1, splash: 1, poison_bubble: 1, zap: 1, fire_burst: 1, freeze: 1, bomb_fuse: 1,
};
const THROTTLE: Partial<Record<SfxName, number>> = {
  footstep: 0.06, step_grass: 0.06, typewriter: 0.018, ui_hover: 0.04, wheel_tick: 0.012, coin: 0.018,
  copy_acquired: 0.3, jackpot: 0.5, thunder: 0.2, bell: 0.15, horn_war: 0.4, drum_war: 0.3,
};
const PER_NAME: Partial<Record<SfxName, number>> = {
  footstep: 4, step_grass: 4, typewriter: 3, ui_hover: 2, coin: 10, hit_light: 6, hit_heavy: 5, death_pop: 6,
  ragdoll_thud: 5, sword_clash: 5, sword_swing: 5, arrow_hit: 5, arrow_shot: 5, explosion: 4, punch_launch: 5,
};

interface SfxVoice {
  name: SfxName;
  out: GainNode;
  send: GainNode;
  pan: StereoPannerNode | null;
  t: number;
  end: number;
  prio: Prio;
}

/** Per-sound level trims in dB (balanced with the offline diagnostics in the audio lab). */
const TRIM: Partial<Record<SfxName, number>> = {
  ui_click: -5, ui_open: -3, ui_error: 3, ui_confirm: -4, coin: -3, purchase: -3, cast_nature: -3.5, cast_earth: -1.5,
  cast_mind: 5, cast_poison: 4, whoosh: 13, dash: 5, sword_swing: 9, hit_heavy: -2.5, punch_launch: -3.5, explosion: -7.5,
  shield_block: -1, sword_clash: -2, heal: -2.5, debuff: 4, invisibility_on: 6, mind_control: 4, loot_common: 1,
  loot_rare: -1, loot_epic: -5, loot_legendary: -8, loot_mythic: -5.5, copy_progress: 3, copy_acquired: -6.5,
  dice_roll: 5, card_flip: 3, card_deal: 3, slot_spin: 4, slot_near_miss: 5, slot_win_small: -3, slot_win_big: -5,
  jackpot: -4.5, wheel_tick: 6, wheel_ball: 5, crowd_cheer: 4, crowd_gasp: 3, crowd_boo: 4, page_turn: 10, quill: 8,
  heartbeat: -3, whisper: 6, horn_war: 2, drum_war: -6.5, glitch: 3, impact_frame: -5.5, typewriter: 3, narrator: 2,
  gavel: -2, thunder: -3, poison_bubble: 3, bark: 4, toad: 7, bomb_fuse: 4, clone: 4, eclipse: -7.5, cast_lightning: -1,
  cast_fire: -1, hit_light: -1,
};

const MAX_VOICES = 24;

export class Sfx {
  private readonly host: SfxHost;
  private readonly rng = new Rng((Math.random() * 1e9) >>> 0);
  private readonly last = new Map<SfxName, number>();
  private voices: SfxVoice[] = [];

  constructor(host: SfxHost) {
    this.host = host;
  }

  get active(): number {
    return this.voices.length;
  }

  play(name: SfxName, opts?: SfxOpts): void {
    const recipe = R[name];
    if (!recipe) return;
    const ac = this.host.ac;
    const now = ac.currentTime;
    const last = this.last.get(name);
    if (last !== undefined && now - last < (THROTTLE[name] ?? 0.025)) return;
    this.gc(now);
    const prio: Prio = PRIO[name] ?? 2;
    const same = this.voices.filter((v) => v.name === name && v.end > now);
    const cap = PER_NAME[name] ?? 8;
    if (same.length >= cap) {
      const oldest = same[0];
      if (oldest) this.kill(oldest, now);
    }
    const live = this.voices.filter((v) => v.end > now);
    if (live.length >= MAX_VOICES) {
      let victim: SfxVoice | null = null;
      for (const v of live) if (!victim || v.prio < victim.prio || (v.prio === victim.prio && v.t < victim.t)) victim = v;
      if (!victim || victim.prio > prio) return;
      this.kill(victim, now);
    }
    this.last.set(name, now);
    const vol = clamp(opts?.volume ?? 1, 0, 2);
    if (vol <= 0.001) return;
    const pitch = clamp(opts?.pitch ?? 1, 0.25, 4) * (1 + fx.jit(0.04));
    const out = gainNode(ac, vol * Math.pow(10, (TRIM[name] ?? 0) / 20));
    const send = gainNode(ac, 0.15);
    let pn: StereoPannerNode | null = null;
    const pan = opts?.pan;
    if (pan !== undefined && pan !== 0 && Number.isFinite(pan)) {
      pn = panner(ac, pan);
      out.connect(pn).connect(this.host.dry);
    } else out.connect(this.host.dry);
    out.connect(send).connect(this.host.wet);
    const t = now + 0.006;
    const c: C = { ac, bank: this.host.bank, t, out, send, p: pitch, r: this.rng };
    let end = t + 1;
    try {
      end = recipe(c);
    } catch (err) {
      console.warn('[audio] sfx recipe', name, err);
    }
    this.voices.push({ name, out, send, pan: pn, t, end: Math.max(end, t + 0.05), prio });
  }

  private kill(v: SfxVoice, now: number): void {
    try {
      v.out.gain.cancelScheduledValues(now);
      v.out.gain.setValueAtTime(v.out.gain.value, now);
      v.out.gain.linearRampToValueAtTime(0, now + 0.03);
    } catch {
      /* ignore */
    }
    v.end = Math.min(v.end, now + 0.04);
  }

  /** Disconnect finished voices. */
  gc(now: number): void {
    if (!this.voices.length) return;
    const keep: SfxVoice[] = [];
    for (const v of this.voices) {
      if (now > v.end + 1.5) {
        for (const n of [v.out, v.send, v.pan]) {
          if (!n) continue;
          try {
            n.disconnect();
          } catch {
            /* ignore */
          }
        }
      } else keep.push(v);
    }
    this.voices = keep;
  }
}

export const SFX_RECIPES = R;

/** Synthesis kit shared with ambience events. */
export { tn as kitTone, nz as kitNoise, inst as kitInst, COIN as COIN_SPEC };
export type { C as KitCtx, ToneOpts, NoiseOpts };
