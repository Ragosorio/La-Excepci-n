/**
 * Raw WebAudio building blocks shared by music, sfx, stingers and ambience.
 * Everything here works on any BaseAudioContext (realtime or offline), which
 * lets the lab render and measure sounds offline.
 */
import { Rng } from './rng';

export type AC = BaseAudioContext;

export type WaveName =
  | 'saw' | 'string' | 'brass' | 'organ' | 'flute' | 'clarinet' | 'harp' | 'piano' | 'bass' | 'glass'
  | 'square' | 'nasal' | 'reed' | 'epiano';

export type NoiseColor = 'white' | 'pink' | 'brown';

export interface Bank {
  ac: AC;
  noise: Record<NoiseColor, AudioBuffer>;
  waves: Record<WaveName, PeriodicWave>;
  curves: {
    soft: Float32Array<ArrayBuffer>;
    drive: Float32Array<ArrayBuffer>;
    fuzz: Float32Array<ArrayBuffer>;
    crush: Float32Array<ArrayBuffer>;
  };
  rng: Rng;
}

const banks = new WeakMap<AC, Bank>();

function harmonics(fn: (n: number) => number, count: number): { real: Float32Array<ArrayBuffer>; imag: Float32Array<ArrayBuffer> } {
  const real = new Float32Array(count + 1);
  const imag = new Float32Array(count + 1);
  for (let n = 1; n <= count; n++) imag[n] = fn(n);
  return { real, imag };
}

function mkWave(ac: AC, fn: (n: number) => number, count = 40): PeriodicWave {
  const { real, imag } = harmonics(fn, count);
  return ac.createPeriodicWave(real, imag, { disableNormalization: false });
}

function table(vals: readonly number[]): (n: number) => number {
  return (n) => vals[n - 1] ?? 0;
}

function makeNoise(ac: AC, color: NoiseColor, seconds: number): AudioBuffer {
  const len = Math.floor(ac.sampleRate * seconds);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  const rnd = Math.random;
  if (color === 'white') {
    for (let i = 0; i < len; i++) d[i] = (rnd() * 2 - 1) * 0.9;
  } else if (color === 'pink') {
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < len; i++) {
      const w = rnd() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
  } else {
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = (last + 0.02 * (rnd() * 2 - 1)) / 1.02;
      d[i] = last * 3.5;
    }
  }
  // crossfade the loop seam
  const fade = Math.min(2048, len >> 3);
  for (let i = 0; i < fade; i++) {
    const a = i / fade;
    const tail = d[len - fade + i] as number;
    d[len - fade + i] = tail * (1 - a) + (d[i] as number) * a;
  }
  return buf;
}

function curve(fn: (x: number) => number, n = 2048): Float32Array<ArrayBuffer> {
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = fn(x);
  }
  return c;
}

export function getBank(ac: AC): Bank {
  const hit = banks.get(ac);
  if (hit) return hit;
  const rng = new Rng(0xa11ce);
  const bank: Bank = {
    ac,
    rng,
    noise: {
      white: makeNoise(ac, 'white', 3),
      pink: makeNoise(ac, 'pink', 2.5),
      brown: makeNoise(ac, 'brown', 2.5),
    },
    waves: {
      saw: mkWave(ac, (n) => 1 / n, 48),
      string: mkWave(ac, (n) => (1 / n) * Math.exp(-n / 26) * (n <= 6 ? 1.15 : 1), 48),
      brass: mkWave(ac, (n) => Math.pow(n, -0.75) * Math.exp(-n / 30), 40),
      organ: mkWave(ac, table([1, 0.72, 0.42, 0.5, 0.06, 0.24, 0.02, 0.28, 0, 0.07, 0, 0.1, 0, 0, 0, 0.05]), 16),
      flute: mkWave(ac, table([1, 0.19, 0.075, 0.035, 0.014, 0.006]), 6),
      clarinet: mkWave(ac, table([1, 0.02, 0.5, 0.02, 0.28, 0.01, 0.16, 0.01, 0.09, 0, 0.05, 0, 0.03]), 13),
      harp: mkWave(ac, table([1, 0.42, 0.2, 0.11, 0.06, 0.035, 0.018, 0.009]), 8),
      piano: mkWave(ac, (n) => Math.pow(n, -1.1) * (n === 1 ? 1 : 0.85) * Math.exp(-n / 18), 24),
      bass: mkWave(ac, table([1, 0.62, 0.3, 0.16, 0.08, 0.04, 0.02]), 7),
      glass: mkWave(ac, table([1, 0, 0.16, 0, 0.07, 0, 0.03]), 7),
      square: mkWave(ac, (n) => (n % 2 ? 1 / n : 0) * Math.exp(-n / 30), 40),
      nasal: mkWave(ac, table([0.5, 0.7, 1, 0.8, 0.5, 0.45, 0.3, 0.12, 0.08, 0.05]), 10),
      reed: mkWave(ac, table([1, 0.8, 0.65, 0.35, 0.3, 0.22, 0.12, 0.08, 0.05, 0.04]), 10),
      epiano: mkWave(ac, table([1, 0.18, 0.05, 0.02]), 4),
    },
    curves: {
      soft: curve((x) => {
        const a = Math.abs(x);
        const k = 0.72;
        const y = a < k ? a : k + (1 - k) * Math.tanh((a - k) / (1 - k));
        return Math.sign(x) * y;
      }),
      drive: curve((x) => Math.tanh(x * 2.2) / Math.tanh(2.2)),
      fuzz: curve((x) => Math.sign(x) * (1 - Math.exp(-Math.abs(x) * 6))),
      crush: curve((x) => Math.round(x * 6) / 6),
    },
  };
  banks.set(ac, bank);
  return bank;
}

// ───────────────────────────── reverb impulse ─────────────────────────────

export interface IrOpts {
  seconds: number;
  rt60: number;
  predelay?: number;
  /** 0..1: how quickly highs die (darker tail) */
  damp?: number;
  early?: number;
  seed?: number;
}

export function makeImpulse(ac: AC, o: IrOpts): AudioBuffer {
  const sr = ac.sampleRate;
  const pre = Math.floor((o.predelay ?? 0.015) * sr);
  const n = Math.floor(o.seconds * sr);
  const len = n + pre;
  const buf = ac.createBuffer(2, len, sr);
  const rng = new Rng(o.seed ?? 77);
  const damp = o.damp ?? 0.5;
  const k = Math.exp(-6.907 / (o.rt60 * sr)); // per-sample decay (-60 dB at rt60)
  const a0 = 0.92;
  const da = (0.6 + damp * 0.28) / n; // lowpass coefficient slides down: darker tail
  const fadeN = Math.max(1, Math.floor(sr * 0.004));
  const rnd = Math.random;
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    let env = 1;
    let a = a0;
    for (let i = 0; i < n; i++) {
      lp += (a > 0.04 ? a : 0.04) * ((rnd() * 2 - 1) - lp);
      d[pre + i] = lp * env * (i < fadeN ? i / fadeN : 1);
      env *= k;
      a -= da;
    }
    // sparse early reflections (deterministic)
    for (let t = 0; t < 10; t++) {
      const at = pre + Math.floor(rng.range(0.004, 0.07) * sr);
      if (at < len) d[at] = (d[at] as number) + (rng.next() < 0.5 ? -1 : 1) * rng.range(0.2, 0.6) * (o.early ?? 0.6);
    }
  }
  return buf;
}

// ───────────────────────────── envelopes ─────────────────────────────

type HoldableParam = AudioParam & { cancelAndHoldAtTime?: (t: number) => AudioParam };

/** Freeze a param at its current automated value at time t (cancels later events). */
export function holdAt(p: AudioParam, t: number): void {
  const hp = p as HoldableParam;
  try {
    if (typeof hp.cancelAndHoldAtTime === 'function') {
      hp.cancelAndHoldAtTime(t);
      return;
    }
  } catch {
    /* fall through */
  }
  const v = p.value;
  p.cancelScheduledValues(t);
  p.setValueAtTime(v, t);
}

/** Smoothly move a param to v starting at t (exponential approach, time-constant tau). */
export function glide(p: AudioParam, v: number, t: number, tau: number): void {
  holdAt(p, t);
  p.setTargetAtTime(v, t, Math.max(0.001, tau));
}

/** Linear move to v arriving at t+dur. */
export function lin(p: AudioParam, v: number, t: number, dur: number): void {
  holdAt(p, t);
  p.linearRampToValueAtTime(v, t + Math.max(0.005, dur));
}

/**
 * ADSR on a gain param. d & r are time constants (seconds to ~63%).
 * Returns the time at which the sound is effectively silent.
 */
export function adsr(p: AudioParam, t: number, peak: number, a: number, d: number, s: number, rel: number, holdEnd: number): number {
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(peak, t + a);
  if (s < 1) p.setTargetAtTime(peak * s, t + a, Math.max(0.001, d));
  const tr = Math.max(holdEnd, t + a + 0.002);
  p.setTargetAtTime(0, tr, Math.max(0.001, rel));
  return tr + rel * 7;
}

/** Percussive envelope: attack then exponential decay. Returns end time. */
export function perc(p: AudioParam, t: number, peak: number, a: number, tau: number): number {
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(peak, t + Math.max(0.0005, a));
  p.setTargetAtTime(0, t + a, Math.max(0.001, tau));
  return t + a + tau * 7;
}

/** Reverse-feeling swell: slow exponential rise then an abrupt cut. */
export function swell(p: AudioParam, t: number, peak: number, dur: number, cut = 0.015): number {
  p.setValueAtTime(0.0001, t);
  p.exponentialRampToValueAtTime(peak, t + dur);
  p.linearRampToValueAtTime(0, t + dur + cut);
  return t + dur + cut + 0.01;
}

// ───────────────────────────── sources ─────────────────────────────

export function osc(ac: AC, bank: Bank, w: OscillatorType | WaveName, freq: number, t: number, detune = 0): OscillatorNode {
  const o = ac.createOscillator();
  if (w === 'sine' || w === 'square' || w === 'sawtooth' || w === 'triangle') o.type = w;
  else o.setPeriodicWave(bank.waves[w as WaveName]);
  o.frequency.setValueAtTime(freq, t);
  if (detune) o.detune.setValueAtTime(detune, t);
  return o;
}

/** A noise source starting at a random offset. */
export function noise(ac: AC, bank: Bank, color: NoiseColor, t: number, dur: number, loop = true): AudioBufferSourceNode {
  const s = ac.createBufferSource();
  const buf = bank.noise[color];
  s.buffer = buf;
  s.loop = loop;
  const off = bank.rng.range(0, Math.max(0, buf.duration - 0.05));
  if (!(t > 0)) t = 0;
  s.start(t, off);
  if (Number.isFinite(dur)) s.stop(t + dur);
  return s;
}

export function biquad(ac: AC, type: BiquadFilterType, freq: number, q = 0.707, t = 0): BiquadFilterNode {
  const f = ac.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(Math.min(freq, ac.sampleRate * 0.45), t);
  f.Q.setValueAtTime(q, t);
  return f;
}

export function gainNode(ac: AC, v: number): GainNode {
  const g = ac.createGain();
  g.gain.value = v;
  return g;
}

export function panner(ac: AC, pan: number): StereoPannerNode {
  const p = ac.createStereoPanner();
  p.pan.value = Math.max(-1, Math.min(1, pan));
  return p;
}

export function shaper(ac: AC, c: Float32Array<ArrayBuffer>): WaveShaperNode {
  const w = ac.createWaveShaper();
  w.curve = c;
  w.oversample = 'none';
  return w;
}

export function chain(...nodes: AudioNode[]): void {
  for (let i = 0; i < nodes.length - 1; i++) (nodes[i] as AudioNode).connect(nodes[i + 1] as AudioNode);
}

/** Disconnect a node when a source ends (lets the graph be GC'd). */
export function cleanupOnEnd(src: AudioScheduledSourceNode, ...nodes: AudioNode[]): void {
  src.onended = () => {
    for (const n of nodes) {
      try {
        n.disconnect();
      } catch {
        /* already gone */
      }
    }
  };
}

export function safeStop(src: AudioScheduledSourceNode, t: number): void {
  try {
    src.stop(t);
  } catch {
    /* already stopped */
  }
}

// ───────────────────────────── channel fx ─────────────────────────────

export interface Fx {
  input: AudioNode;
  output: AudioNode;
  srcs: AudioScheduledSourceNode[];
  nodes: AudioNode[];
}

/** Stereo chorus/ensemble: two modulated delays panned L/R. */
export function makeChorus(ac: AC, rate = 0.6, depthMs = 2.2, baseMs = 11, wet = 0.55): Fx {
  const input = gainNode(ac, 1);
  const output = gainNode(ac, 1);
  const dry = gainNode(ac, 1 - wet * 0.4);
  input.connect(dry).connect(output);
  const nodes: AudioNode[] = [input, output, dry];
  const srcs: AudioScheduledSourceNode[] = [];
  [-0.7, 0.7].forEach((pan, i) => {
    const dl = ac.createDelay(0.1);
    dl.delayTime.value = (baseMs * (1 + i * 0.35)) / 1000;
    const lfo = ac.createOscillator();
    lfo.frequency.value = rate * (1 + i * 0.27);
    const dg = gainNode(ac, (depthMs * (1 - i * 0.2)) / 1000);
    lfo.connect(dg).connect(dl.delayTime);
    const p = panner(ac, pan);
    const wg = gainNode(ac, wet);
    input.connect(dl);
    dl.connect(p).connect(wg).connect(output);
    lfo.start();
    srcs.push(lfo);
    nodes.push(dl, dg, p, wg);
  });
  return { input, output, srcs, nodes };
}

export type Vowel = 'a' | 'o' | 'u' | 'e' | 'i';
const FORMANTS: Record<Vowel, readonly [number, number, number]> = {
  a: [800, 1150, 2900],
  o: [450, 800, 2830],
  u: [325, 700, 2530],
  e: [400, 1700, 2600],
  i: [300, 2100, 3000],
};

/** Parallel formant bank (fixed vowel formants — like a real choir). */
export function makeFormant(ac: AC, vowel: Vowel, makeup = 3.2): Fx {
  const input = gainNode(ac, 1);
  const output = gainNode(ac, makeup);
  const nodes: AudioNode[] = [input, output];
  const f = FORMANTS[vowel];
  const lv = [1, 0.55, 0.22];
  f.forEach((hz, i) => {
    const bp = biquad(ac, 'bandpass', hz, i === 0 ? 5 : 7);
    const g = gainNode(ac, lv[i] ?? 0.2);
    input.connect(bp).connect(g).connect(output);
    nodes.push(bp, g);
  });
  // a little body so low voices don't get thin
  const lp = biquad(ac, 'lowpass', 500, 0.5);
  const lg = gainNode(ac, 0.12);
  input.connect(lp).connect(lg).connect(output);
  nodes.push(lp, lg);
  return { input, output, srcs: [], nodes };
}

/** Amplitude tremolo (measured string tremolo, vibraphone motor, etc.). */
export function makeTremolo(ac: AC, rate: number, depth: number): Fx {
  const input = gainNode(ac, 1);
  const vca = gainNode(ac, 1 - depth / 2);
  const lfo = ac.createOscillator();
  lfo.frequency.value = rate;
  const lg = gainNode(ac, depth / 2);
  lfo.connect(lg).connect(vca.gain);
  input.connect(vca);
  lfo.start();
  return { input, output: vca, srcs: [lfo], nodes: [input, vca, lg] };
}

export function makeFilter(ac: AC, type: BiquadFilterType, hz: number, q = 0.707): Fx {
  const f = biquad(ac, type, hz, q);
  return { input: f, output: f, srcs: [], nodes: [f] };
}

/** Feedback echo with damping. */
export function makeEcho(ac: AC, time: number, fb: number, wet: number, damp = 3000): Fx {
  const input = gainNode(ac, 1);
  const output = gainNode(ac, 1);
  const dl = ac.createDelay(2);
  dl.delayTime.value = time;
  const fbg = gainNode(ac, fb);
  const lp = biquad(ac, 'lowpass', damp, 0.5);
  const wg = gainNode(ac, wet);
  input.connect(output);
  input.connect(dl);
  dl.connect(lp).connect(fbg).connect(dl);
  lp.connect(wg).connect(output);
  return { input, output, srcs: [], nodes: [input, output, dl, fbg, lp, wg] };
}

export function disposeFx(fx: Fx): void {
  for (const s of fx.srcs) safeStop(s, 0);
  for (const n of fx.nodes) {
    try {
      n.disconnect();
    } catch {
      /* ignore */
    }
  }
}
