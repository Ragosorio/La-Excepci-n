/**
 * Declarative voice specs + a builder that renders one note as a short-lived
 * native WebAudio graph (oscillators/noise -> filter -> VCA). Nothing runs when
 * idle, every note cleans itself up, so hundreds of notes/sec stay cheap.
 */
import {
  type AC, type Bank, type NoiseColor, type WaveName, biquad, cleanupOnEnd, gainNode, noise, osc, panner, safeStop,
} from './dsp';

export interface PartialSpec {
  w?: OscillatorType | WaveName;
  /** frequency ratio to the note */
  r?: number;
  /** fixed frequency in Hz (ignores the note) */
  fixed?: number;
  /** detune in cents */
  dt?: number;
  g?: number;
  /** own decay time constant (percussive partial) */
  tau?: number;
  /** own attack */
  a?: number;
  /** FM modulator on this partial: ratio, index (x note freq), decay */
  mod?: { r: number; i: number; tau?: number };
}

export interface FilterSpec {
  type?: BiquadFilterType;
  /** cutoff as multiple of note frequency */
  mul?: number;
  /** absolute cutoff */
  hz?: number;
  q?: number;
  /** envelope start multiplier (>1 = starts brighter and decays; <1 = starts darker and opens) */
  env?: number;
  envTau?: number;
  min?: number;
  max?: number;
  /** velocity sensitivity of cutoff */
  vel?: number;
}

export interface NoiseSpec {
  color?: NoiseColor;
  g: number;
  type?: BiquadFilterType;
  mul?: number;
  hz?: number;
  q?: number;
  a?: number;
  tau?: number;
  /** follow the main amp envelope instead of being a transient */
  sustain?: boolean;
}

export interface Spec {
  osc: readonly PartialSpec[];
  a: number;
  d?: number;
  s?: number;
  r: number;
  tau?: number;
  gain?: number;
  f?: FilterSpec;
  pitch?: { cents: number; tau: number };
  vib?: { hz: number; cents: number; delay: number };
  noise?: NoiseSpec;
  /** exponent for frequency-dependent decay (higher notes die faster) */
  keyScale?: number;
  /** percussive notes stop at note end (release r) instead of ringing out */
  cut?: boolean;
}

export interface Voice {
  out: GainNode;
  srcs: AudioScheduledSourceNode[];
  t: number;
  end: number;
}

export interface NoteOpts {
  detune?: number;
  pan?: number;
  /** pitch bend: cents reached at time `at` (absolute) with time-constant tau */
  bend?: { cents: number; at: number; tau: number };
  /** multiply all decays */
  decay?: number;
  /** override attack */
  attack?: number;
  /** filter brightness multiplier */
  bright?: number;
}

const clampf = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);

/** Work counters (voices started, node-seconds) — used by the lab's offline diagnostics. */
export const VOICE_STATS = { voices: 0, nodeSec: 0 };

/** Envelope tail length in time-constants (e^-5.5 ≈ -48 dB: inaudible in a mix, saves voice time). */
const TAILS = 5.5;

export function playSpec(
  ac: AC, bank: Bank, dest: AudioNode, spec: Spec, t: number, freq: number, dur: number, vel: number, o?: NoteOpts,
): Voice {
  if (!(t > 0)) t = 0;
  const ks = (spec.keyScale ? clampf(Math.pow(262 / freq, spec.keyScale), 0.3, 2.5) : 1) * (o?.decay ?? 1);
  const a = o?.attack ?? spec.a;
  const kill = ac.createGain();
  if (o?.pan !== undefined && o.pan !== 0) kill.connect(panner(ac, o.pan)).connect(dest);
  else kill.connect(dest);
  const vca = ac.createGain();
  vca.connect(kill);
  let sum: AudioNode = vca;
  const nyq = ac.sampleRate * 0.45;
  if (spec.f) {
    const f = spec.f;
    let cut = (f.hz ?? freq * (f.mul ?? 4)) * (1 + (vel - 0.7) * (f.vel ?? 0.6)) * (o?.bright ?? 1);
    cut = clampf(cut, f.min ?? 40, Math.min(f.max ?? 16000, nyq));
    const flt = biquad(ac, f.type ?? 'lowpass', cut, f.q ?? 0.707, t);
    if (f.env !== undefined && f.env !== 1) {
      flt.frequency.setValueAtTime(clampf(cut * f.env, 30, nyq), t);
      flt.frequency.setTargetAtTime(cut, t + (f.env > 1 ? a * 0.5 : 0), Math.max(0.002, (f.envTau ?? 0.1) * (f.env > 1 ? ks : 1)));
    }
    flt.connect(vca);
    sum = flt;
  }
  const srcs: AudioScheduledSourceNode[] = [];
  let vibGain: GainNode | null = null;
  if (spec.vib) {
    const lfo = ac.createOscillator();
    lfo.frequency.value = spec.vib.hz * (0.92 + bank.rng.next() * 0.16);
    vibGain = ac.createGain();
    vibGain.gain.setValueAtTime(0, t);
    vibGain.gain.linearRampToValueAtTime(0, t + spec.vib.delay);
    vibGain.gain.linearRampToValueAtTime(spec.vib.cents, t + spec.vib.delay + 0.4);
    lfo.connect(vibGain);
    lfo.start(t);
    srcs.push(lfo);
  }
  const baseDet = o?.detune ?? 0;
  for (const p of spec.osc) {
    const f0 = p.fixed ?? freq * (p.r ?? 1);
    if (f0 >= nyq) continue;
    const det = (p.dt ?? 0) + baseDet;
    const node = osc(ac, bank, p.w ?? 'sine', f0, t, det);
    if (spec.pitch) {
      node.detune.setValueAtTime(det + spec.pitch.cents, t);
      node.detune.setTargetAtTime(det, t, spec.pitch.tau);
    }
    if (o?.bend) node.detune.setTargetAtTime(det + o.bend.cents, o.bend.at, o.bend.tau);
    if (vibGain) vibGain.connect(node.detune);
    if (p.mod) {
      const m = ac.createOscillator();
      m.frequency.setValueAtTime(f0 * p.mod.r, t);
      const mg = ac.createGain();
      const dev = f0 * p.mod.i;
      if (p.mod.tau !== undefined) {
        mg.gain.setValueAtTime(dev, t);
        mg.gain.setTargetAtTime(dev * 0.08, t, p.mod.tau * ks);
      } else mg.gain.value = dev;
      m.connect(mg).connect(node.frequency);
      m.start(t);
      srcs.push(m);
    }
    let out: AudioNode = node;
    const g = p.g ?? 1;
    if (p.tau !== undefined || p.a !== undefined || g !== 1) {
      const pg = ac.createGain();
      if (p.tau !== undefined) {
        pg.gain.setValueAtTime(0, t);
        pg.gain.linearRampToValueAtTime(g, t + (p.a ?? 0.002));
        pg.gain.setTargetAtTime(0, t + (p.a ?? 0.002), p.tau * ks);
      } else if (p.a !== undefined) {
        pg.gain.setValueAtTime(0, t);
        pg.gain.linearRampToValueAtTime(g, t + p.a);
      } else pg.gain.value = g;
      node.connect(pg);
      out = pg;
    }
    out.connect(sum);
    node.start(t);
    srcs.push(node);
  }
  if (spec.noise) {
    const n = spec.noise;
    const src = noise(ac, bank, n.color ?? 'white', t, Infinity);
    const nf = biquad(ac, n.type ?? 'bandpass', clampf(n.hz ?? freq * (n.mul ?? 2), 40, nyq), n.q ?? 1, t);
    const ng = ac.createGain();
    src.connect(nf).connect(ng);
    if (n.sustain) {
      ng.gain.value = n.g;
      ng.connect(sum);
    } else {
      ng.gain.setValueAtTime(0, t);
      ng.gain.linearRampToValueAtTime(n.g * vel, t + (n.a ?? 0.001));
      ng.gain.setTargetAtTime(0, t + (n.a ?? 0.001), n.tau ?? 0.02);
      ng.connect(kill);
    }
    srcs.push(src);
  }
  const peak = vel * (spec.gain ?? 0.5);
  let end: number;
  if (spec.s === undefined) {
    const tau = (spec.tau ?? 0.3) * ks;
    vca.gain.setValueAtTime(0, t);
    vca.gain.linearRampToValueAtTime(peak, t + a);
    vca.gain.setTargetAtTime(0, t + a, tau);
    end = t + a + tau * TAILS;
    if (spec.cut && t + dur < end) {
      const rs = Math.max(t + dur, t + a + 0.002);
      vca.gain.setTargetAtTime(0, rs, spec.r);
      end = Math.min(end, rs + spec.r * TAILS);
    }
  } else {
    const rs = Math.max(t + dur, t + a + 0.002);
    vca.gain.setValueAtTime(0, t);
    vca.gain.linearRampToValueAtTime(peak, t + a);
    if (spec.s < 1) vca.gain.setTargetAtTime(peak * spec.s, t + a, Math.max(0.002, (spec.d ?? 0.2) * ks));
    vca.gain.setTargetAtTime(0, rs, Math.max(0.002, spec.r));
    end = rs + spec.r * TAILS;
  }
  for (const s of srcs) safeStop(s, end);
  VOICE_STATS.voices++;
  VOICE_STATS.nodeSec += (end - t) * (srcs.length * 2 + (spec.f ? 1 : 0) + 3);
  const lastSrc = srcs[srcs.length - 1];
  if (lastSrc) cleanupOnEnd(lastSrc, kill);
  return { out: kill, srcs, t, end };
}

/** Fade out and stop a voice early (voice stealing). */
export function killVoice(v: Voice, t: number, fade = 0.04): void {
  try {
    v.out.gain.cancelScheduledValues(t);
    v.out.gain.setValueAtTime(v.out.gain.value, t);
    v.out.gain.linearRampToValueAtTime(0, t + fade);
  } catch {
    /* ignore */
  }
  for (const s of v.srcs) safeStop(s, t + fade + 0.01);
  v.end = t + fade + 0.01;
}

// ───────────────────────────── patch library ─────────────────────────────

export const PATCH = {
  // keyboards & mallets
  celesta: {
    osc: [{ w: 'sine' }, { w: 'sine', r: 4, g: 0.22, tau: 0.09 }, { w: 'sine', r: 2, g: 0.08, tau: 0.45 }, { w: 'sine', r: 7.2, g: 0.05, tau: 0.03 }],
    a: 0.002, tau: 0.85, r: 0.2, keyScale: 0.4, gain: 0.55,
  },
  musicbox: {
    osc: [{ w: 'sine' }, { w: 'sine', r: 2, g: 0.16, tau: 0.35 }, { w: 'sine', r: 5.43, g: 0.2, tau: 0.045 }, { w: 'sine', r: 8.9, g: 0.07, tau: 0.018 }],
    a: 0.001, tau: 1.25, r: 0.2, keyScale: 0.45, gain: 0.5,
    noise: { color: 'white', g: 0.035, type: 'highpass', hz: 5500, tau: 0.005 },
  },
  glock: {
    osc: [{ w: 'sine' }, { w: 'sine', r: 2.76, g: 0.32, tau: 0.25 }, { w: 'sine', r: 5.4, g: 0.18, tau: 0.08 }, { w: 'sine', r: 8.93, g: 0.07, tau: 0.03 }],
    a: 0.001, tau: 0.9, r: 0.2, keyScale: 0.3, gain: 0.35,
  },
  harp: {
    osc: [{ w: 'harp' }],
    a: 0.003, tau: 1.1, r: 0.3, keyScale: 0.35, gain: 0.55,
    f: { type: 'lowpass', mul: 6, env: 2.6, envTau: 0.12, q: 0.9, max: 9000 },
  },
  piano: {
    osc: [{ w: 'piano', dt: -2 }, { w: 'piano', dt: 2.5, g: 0.75 }],
    a: 0.002, d: 0.45, s: 0.3, r: 0.22, keyScale: 0.3, gain: 0.42,
    f: { type: 'lowpass', mul: 7, env: 2.2, envTau: 0.3, vel: 1.2, max: 9000 },
  },
  felt: {
    osc: [{ w: 'piano', dt: -3 }, { w: 'triangle', dt: 3, g: 0.6 }],
    a: 0.006, d: 0.7, s: 0.25, r: 0.4, keyScale: 0.25, gain: 0.4,
    f: { type: 'lowpass', mul: 3.2, env: 1.6, envTau: 0.2, max: 3200 },
  },
  epiano: {
    osc: [{ w: 'sine', mod: { r: 1, i: 1.4, tau: 0.4 } }, { w: 'sine', r: 2, g: 0.08, tau: 0.3 }, { w: 'sine', r: 13.8, g: 0.045, tau: 0.02 }],
    a: 0.002, d: 0.9, s: 0.35, r: 0.18, keyScale: 0.3, gain: 0.42,
  },
  marimba: {
    osc: [{ w: 'sine' }, { w: 'sine', r: 3.93, g: 0.34, tau: 0.045 }, { w: 'sine', r: 9.2, g: 0.07, tau: 0.014 }],
    a: 0.0015, tau: 0.34, r: 0.08, keyScale: 0.5, gain: 0.65,
    noise: { color: 'white', g: 0.05, type: 'bandpass', mul: 4, q: 2, tau: 0.004 },
  },
  vibes: {
    osc: [{ w: 'sine' }, { w: 'sine', r: 4, g: 0.14, tau: 0.25 }, { w: 'sine', r: 10, g: 0.03, tau: 0.03 }],
    a: 0.002, tau: 1.5, r: 0.3, keyScale: 0.3, gain: 0.42,
  },
  steelpan: {
    osc: [{ w: 'sine' }, { w: 'sine', r: 2, g: 0.55, a: 0.018, tau: 0.34 }, { w: 'sine', r: 3, g: 0.2, tau: 0.14 }, { w: 'sine', r: 4.16, g: 0.08, tau: 0.06 }],
    a: 0.002, tau: 0.5, r: 0.1, keyScale: 0.3, gain: 0.45,
  },
  bell: {
    osc: [
      { w: 'sine', r: 0.5, g: 0.45, tau: 3.2 }, { w: 'sine' }, { w: 'sine', r: 1.19, g: 0.5, tau: 1.5 },
      { w: 'sine', r: 1.5, g: 0.3, tau: 1.1 }, { w: 'sine', r: 2, g: 0.4, tau: 0.9 }, { w: 'sine', r: 2.52, g: 0.22, tau: 0.5 },
      { w: 'sine', r: 3.02, g: 0.15, tau: 0.35 }, { w: 'sine', r: 4.18, g: 0.1, tau: 0.18 },
    ],
    a: 0.002, tau: 2.4, r: 0.5, gain: 0.3,
    noise: { color: 'white', g: 0.08, type: 'bandpass', mul: 3, q: 2, tau: 0.01 },
  },
  // strings
  pizz: {
    osc: [{ w: 'string' }],
    a: 0.002, tau: 0.2, r: 0.1, keyScale: 0.5, gain: 0.62,
    f: { type: 'lowpass', mul: 5, env: 2, envTau: 0.05, max: 6000 },
    noise: { color: 'white', g: 0.06, type: 'bandpass', hz: 1800, q: 1, tau: 0.008 },
  },
  strings: {
    osc: [{ w: 'string', dt: -7 }, { w: 'string', dt: 7 }],
    a: 0.35, d: 0.4, s: 0.85, r: 0.4, gain: 0.26,
    f: { type: 'lowpass', mul: 5, max: 5200, q: 0.5 },
  },
  strings_warm: {
    osc: [{ w: 'string', dt: -6 }, { w: 'string', dt: 6 }, { w: 'triangle', r: 0.5, g: 0.25 }],
    a: 0.7, d: 0.6, s: 0.9, r: 0.8, gain: 0.24,
    f: { type: 'lowpass', mul: 3.2, max: 3000, q: 0.5 },
  },
  spiccato: {
    osc: [{ w: 'string', dt: -6 }, { w: 'string', dt: 6 }],
    a: 0.005, tau: 0.085, r: 0.05, gain: 0.5,
    f: { type: 'lowpass', mul: 6, env: 1.8, envTau: 0.04, max: 6500 },
  },
  tremolo: {
    osc: [{ w: 'string', dt: -8 }, { w: 'string', dt: 8 }],
    a: 0.5, d: 0.5, s: 0.9, r: 0.5, gain: 0.2,
    f: { type: 'lowpass', mul: 6, max: 7000, q: 0.6 },
  },
  // winds & brass
  brass: {
    osc: [{ w: 'brass', dt: -5 }, { w: 'brass', dt: 5 }],
    a: 0.045, d: 0.35, s: 0.75, r: 0.12, gain: 0.34,
    f: { type: 'lowpass', mul: 4.2, env: 0.25, envTau: 0.05, q: 1.2, vel: 1.4, max: 7000 },
    pitch: { cents: -30, tau: 0.03 },
  },
  horn: {
    osc: [{ w: 'brass', dt: -4 }, { w: 'brass', dt: 4 }],
    a: 0.09, d: 0.5, s: 0.8, r: 0.18, gain: 0.34,
    f: { type: 'lowpass', mul: 2.4, env: 0.35, envTau: 0.08, q: 0.8, vel: 1, max: 2600 },
    pitch: { cents: -18, tau: 0.05 },
  },
  stab: {
    osc: [{ w: 'brass', dt: -6 }, { w: 'brass', dt: 6 }],
    a: 0.012, tau: 0.2, r: 0.08, gain: 0.38,
    f: { type: 'lowpass', mul: 5, env: 1.8, envTau: 0.08, q: 1.5, vel: 1.2, max: 8000 },
  },
  flute: {
    osc: [{ w: 'flute' }],
    a: 0.07, d: 0.2, s: 0.9, r: 0.09, gain: 0.42,
    vib: { hz: 5.2, cents: 14, delay: 0.25 },
    pitch: { cents: -14, tau: 0.04 },
    noise: { color: 'pink', g: 0.05, type: 'bandpass', mul: 2, q: 1.4, sustain: true },
  },
  clarinet: {
    osc: [{ w: 'clarinet' }],
    a: 0.04, d: 0.2, s: 0.9, r: 0.08, gain: 0.36,
    f: { type: 'lowpass', mul: 4, q: 0.7, max: 5000 },
    vib: { hz: 4.8, cents: 6, delay: 0.4 },
  },
  choir: {
    osc: [{ w: 'saw', dt: -9 }, { w: 'saw', dt: 9 }],
    a: 0.6, d: 0.5, s: 0.9, r: 0.6, gain: 0.25,
    vib: { hz: 5, cents: 9, delay: 0.3 },
  },
  organ: {
    osc: [{ w: 'organ' }, { w: 'sine', r: 0.5, g: 0.42 }],
    a: 0.06, d: 0.2, s: 1, r: 0.09, gain: 0.2,
    noise: { color: 'white', g: 0.035, type: 'bandpass', mul: 3, q: 3, tau: 0.04 },
  },
  // bass
  bass_upright: {
    osc: [{ w: 'bass' }],
    a: 0.004, d: 0.3, s: 0.35, r: 0.07, gain: 0.72,
    f: { type: 'lowpass', mul: 3.5, env: 2.2, envTau: 0.06, max: 1600 },
    noise: { color: 'brown', g: 0.08, type: 'lowpass', hz: 900, tau: 0.012 },
  },
  bass_synth: {
    osc: [{ w: 'sawtooth' }, { w: 'square', r: 0.5, g: 0.35 }],
    a: 0.004, d: 0.2, s: 0.7, r: 0.06, gain: 0.33,
    f: { type: 'lowpass', hz: 420, env: 3, envTau: 0.08, q: 1.4, vel: 0.8 },
  },
  low_spic: {
    osc: [{ w: 'string', dt: -5 }, { w: 'string', dt: 5 }],
    a: 0.008, d: 0.12, s: 0.55, r: 0.08, gain: 0.36,
    f: { type: 'lowpass', mul: 4, env: 1.6, envTau: 0.05, max: 2400, q: 0.6 },
  },
  low_strings: {
    osc: [{ w: 'string', dt: -5 }, { w: 'string', dt: 5 }],
    a: 0.12, d: 0.4, s: 0.85, r: 0.25, gain: 0.34,
    f: { type: 'lowpass', mul: 4, max: 2400, q: 0.6 },
  },
  // pads / drones
  drone: {
    osc: [{ w: 'saw', dt: -4 }, { w: 'saw', dt: 4 }, { w: 'sine', r: 0.5, g: 0.6 }],
    a: 2.2, d: 1, s: 1, r: 2.2, gain: 0.16,
    f: { type: 'lowpass', hz: 600, q: 1 },
  },
  glasspad: {
    osc: [{ w: 'glass', dt: -6 }, { w: 'glass', dt: 6 }],
    a: 1.2, d: 1, s: 1, r: 1.5, gain: 0.2,
    vib: { hz: 0.35, cents: 12, delay: 0 },
  },
  sub: { osc: [{ w: 'sine' }], a: 0.01, tau: 0.6, r: 0.1, gain: 0.7 },
  // drums & percussion (pitch = the drum's tuning)
  taiko: {
    osc: [{ w: 'sine' }, { w: 'sine', r: 1.6, g: 0.3, tau: 0.08 }],
    a: 0.001, tau: 0.3, r: 0.05, gain: 0.95,
    pitch: { cents: 1300, tau: 0.025 },
    noise: { color: 'brown', g: 0.45, type: 'lowpass', hz: 900, tau: 0.03 },
  },
  kick: {
    osc: [{ w: 'sine' }],
    a: 0.001, tau: 0.16, r: 0.05, gain: 0.9,
    pitch: { cents: 2400, tau: 0.02 },
    noise: { color: 'white', g: 0.12, type: 'highpass', hz: 3000, tau: 0.004 },
  },
  snare: {
    osc: [{ w: 'triangle' }],
    a: 0.001, tau: 0.06, r: 0.05, gain: 0.45,
    pitch: { cents: 400, tau: 0.01 },
    noise: { color: 'white', g: 0.8, type: 'highpass', hz: 1500, tau: 0.1 },
  },
  rim: {
    osc: [{ w: 'triangle' }, { w: 'sine', r: 2.3, g: 0.4, tau: 0.01 }],
    a: 0.0008, tau: 0.03, r: 0.02, gain: 0.35,
    noise: { color: 'white', g: 0.35, type: 'bandpass', hz: 2500, q: 2, tau: 0.01 },
  },
  hat: {
    osc: [], a: 0.001, tau: 0.035, r: 0.02, gain: 0.22,
    noise: { color: 'white', g: 1, type: 'highpass', hz: 7200, q: 0.7, sustain: true },
  },
  hat_open: {
    osc: [], a: 0.002, tau: 0.16, r: 0.05, gain: 0.16,
    noise: { color: 'white', g: 1, type: 'highpass', hz: 6800, q: 0.7, sustain: true },
  },
  shaker: {
    osc: [], a: 0.012, tau: 0.03, r: 0.02, gain: 0.2,
    noise: { color: 'white', g: 1, type: 'bandpass', hz: 6500, q: 1.2, sustain: true },
  },
  brush: {
    osc: [], a: 0.003, tau: 0.08, r: 0.04, gain: 0.3,
    noise: { color: 'pink', g: 1, type: 'bandpass', hz: 3200, q: 0.8, sustain: true },
  },
  sweep: {
    osc: [], a: 0.16, tau: 0.12, r: 0.06, gain: 0.14,
    noise: { color: 'pink', g: 1, type: 'bandpass', hz: 2600, q: 0.7, sustain: true },
  },
  ride: {
    osc: [
      { w: 'square', fixed: 1587 }, { w: 'square', fixed: 2245, g: 0.8 }, { w: 'square', fixed: 3033, g: 0.6 },
      { w: 'square', fixed: 4421, g: 0.5 },
    ],
    a: 0.001, tau: 0.45, r: 0.1, gain: 0.05,
    f: { type: 'highpass', hz: 5200, q: 0.7 },
    noise: { color: 'white', g: 0.25, type: 'highpass', hz: 8000, tau: 0.05 },
  },
  crash: {
    osc: [{ w: 'square', fixed: 1733, g: 0.5 }, { w: 'square', fixed: 2531, g: 0.4 }],
    a: 0.002, tau: 1.1, r: 0.2, gain: 0.12,
    f: { type: 'highpass', hz: 4500, q: 0.6 },
    noise: { color: 'white', g: 0.9, type: 'highpass', hz: 3800, q: 0.5, sustain: true },
  },
  timpani: {
    osc: [{ w: 'sine' }, { w: 'sine', r: 1.51, g: 0.35, tau: 0.4 }, { w: 'sine', r: 1.99, g: 0.2, tau: 0.3 }],
    a: 0.002, tau: 0.75, r: 0.2, gain: 0.7,
    pitch: { cents: 60, tau: 0.08 },
    noise: { color: 'brown', g: 0.3, type: 'lowpass', hz: 700, tau: 0.05 },
  },
  anvil: {
    osc: [{ w: 'sine' }, { w: 'sine', r: 2.76, g: 0.5, tau: 0.3 }, { w: 'sine', r: 5.4, g: 0.32, tau: 0.12 }, { w: 'sine', r: 8.93, g: 0.2, tau: 0.05 }],
    a: 0.0008, tau: 0.65, r: 0.1, gain: 0.26,
    noise: { color: 'white', g: 0.35, type: 'highpass', hz: 4000, tau: 0.008 },
  },
  woodblock: {
    osc: [{ w: 'sine' }, { w: 'sine', r: 2.4, g: 0.25, tau: 0.01 }],
    a: 0.0008, tau: 0.035, r: 0.02, gain: 0.5,
    pitch: { cents: 200, tau: 0.005 },
    noise: { color: 'white', g: 0.2, type: 'bandpass', mul: 1.5, q: 4, tau: 0.006 },
  },
  conga: {
    osc: [{ w: 'sine' }, { w: 'sine', r: 1.5, g: 0.2, tau: 0.03 }],
    a: 0.001, tau: 0.14, r: 0.05, gain: 0.6,
    pitch: { cents: 500, tau: 0.015 },
    noise: { color: 'white', g: 0.22, type: 'bandpass', hz: 2200, q: 1, tau: 0.008 },
  },
  tambourine: {
    osc: [{ w: 'square', fixed: 5210, g: 0.3 }, { w: 'square', fixed: 7340, g: 0.25 }],
    a: 0.002, tau: 0.09, r: 0.04, gain: 0.08,
    f: { type: 'highpass', hz: 5000 },
    noise: { color: 'white', g: 1.5, type: 'bandpass', hz: 9000, q: 1.2, sustain: true },
  },
  thump: {
    osc: [{ w: 'sine' }],
    a: 0.002, tau: 0.1, r: 0.05, gain: 0.9,
    pitch: { cents: 700, tau: 0.03 },
  },
} as const satisfies Record<string, Spec>;

export type PatchName = keyof typeof PATCH;
