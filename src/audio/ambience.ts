/**
 * Ambience beds: looping filtered-noise textures with slow modulation, plus
 * randomized events (droplets, birds, crickets, frogs, anvils, chip clacks,
 * waves...). Beds fade in/out and free all their nodes when off.
 */
import { type AC, type Bank, type NoiseColor, biquad, gainNode, noise, panner, safeStop } from './core/dsp';
import { PATCH } from './core/patches';
import { Rng } from './core/rng';
import { type KitCtx, COIN_SPEC, kitInst, kitNoise, kitTone } from './sfx';
import type { Ambience } from './types';

export interface AmbHost {
  ac: AC;
  bank: Bank;
  dry: AudioNode;
  wet: AudioNode;
}

interface Bed {
  name: Ambience;
  level: GainNode;
  input: GainNode;
  send: GainNode;
  srcs: AudioScheduledSourceNode[];
  nodes: AudioNode[];
  next: number;
  rate: number;
  event: ((c: KitCtx, b: Bed) => void) | null;
  onTick: ((now: number, b: Bed) => void) | null;
  stopAt: number;
  vol: number;
  lastMod: number;
}

const FADE = 1.6;

/** Internal bed levels (dB), balanced with the lab's offline diagnostics. */
const BED_DB: Partial<Record<Ambience, number>> = {
  forest_dawn: 8, night: 8, crowd: 7, casino: 6, swamp: 4, wind: 4, fire: 1, void: -4,
};

export class AmbienceMgr {
  private readonly host: AmbHost;
  private readonly beds = new Map<Ambience, Bed>();
  private readonly rng = new Rng((Math.random() * 1e9) >>> 0);

  constructor(host: AmbHost) {
    this.host = host;
  }

  get active(): Ambience[] {
    return [...this.beds.values()].filter((b) => b.stopAt === Infinity).map((b) => b.name);
  }

  set(name: Ambience, on: boolean, volume = 1): void {
    const ac = this.host.ac;
    const now = ac.currentTime;
    const vol = Math.max(0, Math.min(1.5, Number.isFinite(volume) ? volume : 1));
    const bed = this.beds.get(name);
    if (on) {
      if (bed && bed.stopAt === Infinity) {
        if (Math.abs(bed.vol - vol) < 0.001) return; // already there (safe to call every frame)
        bed.vol = vol;
        bed.level.gain.cancelScheduledValues(now);
        bed.level.gain.setTargetAtTime(vol, now, 0.4);
        return;
      }
      if (bed) this.dispose(bed); // was fading out: restart fresh
      const nb = this.build(name, vol);
      if (nb) this.beds.set(name, nb);
    } else if (bed && bed.stopAt === Infinity) {
      bed.level.gain.cancelScheduledValues(now);
      bed.level.gain.setValueAtTime(bed.level.gain.value, now);
      bed.level.gain.linearRampToValueAtTime(0, now + FADE);
      bed.stopAt = now + FADE + 0.2;
    }
  }

  tick(now: number, horizon: number): void {
    for (const b of this.beds.values()) {
      if (now > b.stopAt) {
        this.dispose(b);
        this.beds.delete(b.name);
        continue;
      }
      if (b.onTick && now - b.lastMod > 0.25) {
        b.lastMod = now;
        b.onTick(now, b);
      }
      if (!b.event || b.stopAt !== Infinity) continue;
      if (b.next < now - 0.5) b.next = now + this.rng.range(0, 1 / b.rate);
      let guard = 0;
      while (b.next < horizon && guard++ < 16) {
        const c: KitCtx = { ac: this.host.ac, bank: this.host.bank, t: b.next, out: b.input, send: b.send, p: 1, r: this.rng };
        try {
          b.event(c, b);
        } catch (err) {
          console.warn('[audio] ambience event', b.name, err);
        }
        b.next += Math.max(0.02, -Math.log(1 - this.rng.next()) / b.rate);
      }
    }
  }

  private dispose(b: Bed): void {
    for (const s of b.srcs) safeStop(s, 0);
    for (const n of [...b.nodes, b.level, b.input, b.send]) {
      try {
        n.disconnect();
      } catch {
        /* ignore */
      }
    }
  }

  // ───────────────────────────── builders ─────────────────────────────

  private build(name: Ambience, vol: number): Bed | null {
    const ac = this.host.ac;
    const now = ac.currentTime;
    const level = gainNode(ac, 0);
    level.gain.setValueAtTime(0, now);
    level.gain.linearRampToValueAtTime(vol, now + FADE);
    const input = gainNode(ac, Math.pow(10, (BED_DB[name] ?? 0) / 20));
    const send = gainNode(ac, 0.3);
    input.connect(level).connect(this.host.dry);
    input.connect(send).connect(this.host.wet);
    const b: Bed = {
      name, level, input, send, srcs: [], nodes: [], next: now + 0.3, rate: 1, event: null, onTick: null, stopAt: Infinity, vol,
      lastMod: 0,
    };
    const r = this.rng;
    switch (name) {
      case 'rain':
        this.layer(b, 'white', 'highpass', 500, 0.5, 0.2, -0.5, 'lp', 7000);
        this.layer(b, 'white', 'highpass', 600, 0.5, 0.2, 0.5, 'lp', 6500);
        this.layer(b, 'pink', 'bandpass', 2500, 0.5, 0.12, 0);
        b.rate = 22;
        send.gain.value = 0.2;
        b.event = (c) => kitTone(c, { f: r.range(2400, 5200), d: r.range(0.003, 0.008), g: r.range(0.015, 0.05), pan: r.range(-0.9, 0.9) });
        break;
      case 'rain_heavy':
        this.layer(b, 'white', 'lowpass', 4200, 0.6, 0.3, -0.4);
        this.layer(b, 'white', 'lowpass', 3800, 0.6, 0.3, 0.4);
        this.layer(b, 'brown', 'lowpass', 420, 0.7, 0.45, 0);
        this.layer(b, 'pink', 'bandpass', 1200, 0.6, 0.14, 0);
        b.rate = 38;
        send.gain.value = 0.2;
        b.event = (c) => {
          if (r.chance(0.0012)) {
            // distant thunder
            kitNoise(c, { c: 'brown', f: 160, type: 'lowpass', a: 0.8, hold: 0.8, d: 1.2, g: 0.6, rattle: [10, 0.4] });
            return;
          }
          kitTone(c, { f: r.range(1800, 4500), d: r.range(0.004, 0.01), g: r.range(0.02, 0.06), pan: r.range(-0.9, 0.9) });
        };
        break;
      case 'wind': {
        const l1 = this.layer(b, 'pink', 'bandpass', 600, 1.2, 0.5, -0.4);
        const l2 = this.layer(b, 'pink', 'bandpass', 900, 1.0, 0.4, 0.4);
        const whistle = this.layer(b, 'white', 'bandpass', 2400, 9, 0.05, 0.1);
        this.lfo(b, 0.07, 350, l1.f.frequency);
        this.lfo(b, 0.05, 450, l2.f.frequency);
        this.lfo(b, 0.09, 900, whistle.f.frequency);
        // gusts
        this.lfo(b, 0.11, 0.25, l1.g);
        this.lfo(b, 0.083, 0.2, l2.g);
        break;
      }
      case 'forest_dawn':
        this.layer(b, 'pink', 'lowpass', 1200, 0.5, 0.05, 0);
        b.rate = 0.8;
        send.gain.value = 0.5;
        b.event = (c) => this.bird(c);
        break;
      case 'night': {
        this.layer(b, 'pink', 'lowpass', 700, 0.5, 0.06, 0);
        const bed = this.layer(b, 'white', 'bandpass', 5200, 4, 0.02, 0);
        this.lfo(b, 0.3, 1500, bed.f.frequency);
        b.rate = 3.2;
        send.gain.value = 0.35;
        b.event = (c) => {
          if (r.chance(0.012)) {
            // owl
            kitTone(c, { f: 410, to: [[380, 0.25]], a: 0.04, hold: 0.15, d: 0.08, g: 0.07, pan: r.range(-0.7, 0.7) });
            kitTone(c, { f: 400, to: [[360, 0.4]], at: 0.45, a: 0.05, hold: 0.3, d: 0.1, g: 0.08 });
            return;
          }
          const f = r.range(4200, 4900);
          const pan = r.range(-0.9, 0.9);
          const n = r.int(2, 4);
          for (let i = 0; i < n; i++) kitTone(c, { f, at: i * 0.045, a: 0.003, hold: 0.018, d: 0.006, g: r.range(0.015, 0.035), pan, am: { hz: 45, depth: 0.9 } });
        };
        break;
      }
      case 'fire': {
        const roar = this.layer(b, 'brown', 'lowpass', 700, 0.6, 0.32, 0);
        this.lfo(b, 0.2, 200, roar.f.frequency);
        b.rate = 11;
        send.gain.value = 0.12;
        b.event = (c) => {
          if (r.chance(0.05)) {
            kitTone(c, { f: 180, to: [[90, 0.03]], d: 0.03, g: 0.12 });
            kitNoise(c, { f: r.range(3000, 6000), q: 2, d: 0.006, g: 0.2, pan: r.range(-0.5, 0.5) });
            return;
          }
          kitNoise(c, { f: r.range(1500, 6500), q: r.range(1, 4), d: r.range(0.002, 0.008), g: r.range(0.04, 0.14), pan: r.range(-0.6, 0.6) });
        };
        break;
      }
      case 'crowd':
      case 'casino': {
        const casino = name === 'casino';
        const gs = [500, 1100, 2400].map((f, i) => {
          const g = gainNode(ac, 0.3);
          const src = noise(ac, this.host.bank, 'pink', now, Infinity);
          const fl = biquad(ac, 'bandpass', f, 1.6);
          const pn = panner(ac, (i - 1) * 0.5);
          src.connect(fl).connect(g).connect(pn).connect(input);
          b.srcs.push(src);
          b.nodes.push(fl, g, pn);
          return g;
        });
        const base = casino ? 0.13 : 0.24;
        b.onTick = (t) => gs.forEach((g, i) => g.gain.setTargetAtTime(base * (i === 0 ? 1.3 : i === 1 ? 1 : 0.5) * r.range(0.6, 1.3), t, 0.3));
        b.rate = casino ? 1.4 : 0.35;
        send.gain.value = 0.3;
        b.event = (c) => {
          const k = r.next();
          if (casino) {
            if (k < 0.55) {
              // chip clacks
              kitNoise(c, { f: r.range(3200, 4600), q: 5, d: 0.01, g: 0.12, pan: r.range(-0.8, 0.8) });
              kitNoise(c, { f: r.range(2800, 3600), q: 5, at: 0.015, d: 0.01, g: 0.08 });
            } else if (k < 0.7) {
              // a far slot machine paying out
              const p = r.range(-0.8, 0.8);
              [84, 88, 91, 96].forEach((m, i) => kitInst(c, PATCH.glock, m, i * 0.07, 0.2, 0.12, false, p));
            } else if (k < 0.85) {
              // card shuffle
              kitNoise(c, { c: 'pink', f: 2500, q: 1, a: 0.02, hold: 0.3, d: 0.05, g: 0.06, rattle: [90, 0.1], pan: r.range(-0.6, 0.6) });
            } else if (k < 0.95) {
              kitInst(c, COIN_SPEC, r.pick([88, 90, 92, 95]), 0, 0.05, 0.12, false, r.range(-0.8, 0.8));
            } else {
              // someone won something
              kitNoise(c, { c: 'pink', f: 1100, q: 0.8, a: 0.2, hold: 0.4, d: 0.4, g: 0.1, rattle: [8, 0.5] });
            }
          } else if (k < 0.5) {
            // a laugh
            const f = r.range(180, 320);
            for (let i = 0; i < r.int(3, 5); i++) kitTone(c, { w: 'sawtooth', f: f * (1 - i * 0.03), at: i * 0.11, a: 0.01, hold: 0.04, d: 0.04, g: 0.018, bp: 900, q: 2 });
          } else kitNoise(c, { c: 'pink', f: 900, q: 1.2, a: 0.1, hold: 0.2, d: 0.2, g: 0.06, pan: r.range(-0.8, 0.8) });
        };
        break;
      }
      case 'sea': {
        const surf = this.layer(b, 'brown', 'lowpass', 500, 0.6, 0.25, 0);
        const foam = this.layer(b, 'white', 'highpass', 2500, 0.5, 0.02, 0);
        b.rate = 0.14;
        send.gain.value = 0.2;
        b.event = (c) => {
          const t = c.t;
          const len = r.range(4.5, 8);
          const pk = r.range(0.55, 1);
          surf.g.setTargetAtTime(0.25 + 0.5 * pk, t, len * 0.18);
          surf.g.setTargetAtTime(0.22, t + len * 0.45, len * 0.25);
          foam.g.setTargetAtTime(0.02 + 0.09 * pk, t + len * 0.3, len * 0.1);
          foam.g.setTargetAtTime(0.015, t + len * 0.55, len * 0.2);
        };
        break;
      }
      case 'swamp': {
        this.layer(b, 'brown', 'lowpass', 280, 0.6, 0.2, 0);
        const bz = ac.createOscillator();
        bz.type = 'sawtooth';
        bz.frequency.value = 180;
        const bf = biquad(ac, 'bandpass', 900, 3);
        const bg = gainNode(ac, 0.006);
        bz.connect(bf).connect(bg).connect(input);
        bz.start(now);
        b.srcs.push(bz);
        b.nodes.push(bf, bg);
        this.lfo(b, 7, 0.004, bg.gain);
        this.lfo(b, 0.13, 25, bz.frequency);
        b.rate = 1.1;
        send.gain.value = 0.4;
        b.event = (c) => {
          if (r.chance(0.2)) {
            const f = r.range(300, 600);
            kitTone(c, { f, to: [[f * 2.3, 0.04]], d: 0.025, g: 0.06, pan: r.range(-0.6, 0.6) });
            return;
          }
          const f = r.range(95, 170);
          const pan = r.range(-0.9, 0.9);
          const croaks = r.chance(0.4) ? 2 : 1;
          for (let i = 0; i < croaks; i++) {
            kitTone(c, { w: 'square', f: f * (1 + i * 0.08), to: [[f * 0.9, 0.2]], at: i * 0.2, am: { hz: r.range(26, 38), depth: 1 }, a: 0.005, hold: r.range(0.08, 0.2), d: 0.03, g: 0.05, bp: r.range(500, 800), q: 3, pan });
          }
        };
        break;
      }
      case 'forge': {
        const roar = this.layer(b, 'brown', 'lowpass', 500, 0.6, 0.22, 0);
        this.lfo(b, 0.15, 150, roar.f.frequency);
        b.rate = 0.35;
        send.gain.value = 0.45;
        b.event = (c) => {
          const k = r.next();
          if (k < 0.7) {
            // hammer on anvil: a short rhythmic figure
            const m = r.pick([84, 86, 88]);
            const hits = r.int(2, 4);
            const pan = r.range(-0.6, 0.6);
            for (let i = 0; i < hits; i++) kitInst(c, PATCH.anvil, m + (i === hits - 1 ? -2 : 0), i * r.range(0.28, 0.4), 0.5, 0.42, false, pan);
          } else if (k < 0.9) {
            // bellows
            kitNoise(c, { c: 'pink', f: 400, to: [[900, 0.6]], q: 1, a: 0.6, hold: 0.2, d: 0.3, g: 0.14 });
          } else {
            // quench hiss
            kitNoise(c, { f: 3500, type: 'highpass', a: 0.02, hold: 0.8, d: 0.8, g: 0.08, rattle: [40, 0.5] });
          }
        };
        break;
      }
      case 'void': {
        const d1 = ac.createOscillator();
        const d2 = ac.createOscillator();
        d1.frequency.value = 41;
        d2.frequency.value = 42.3;
        const dg = gainNode(ac, 0.12);
        d1.connect(dg);
        d2.connect(dg);
        dg.connect(input);
        d1.start(now);
        d2.start(now);
        b.srcs.push(d1, d2);
        b.nodes.push(dg);
        const swirl = this.layer(b, 'pink', 'bandpass', 700, 5, 0.12, 0);
        this.lfo(b, 0.045, 550, swirl.f.frequency);
        b.rate = 0.12;
        send.gain.value = 0.7;
        b.event = (c) => {
          if (r.chance(0.3)) {
            kitNoise(c, { f: 2600, q: 4, a: 0.03, hold: 0.25, d: 0.08, g: 0.04, rattle: [30, 0.2], pan: r.range(-0.9, 0.9) });
            return;
          }
          kitNoise(c, { c: 'pink', f: 300, type: 'lowpass', to: [[2500, 2]], a: 2, d: 0.02, g: 0.2, cut: true });
        };
        break;
      }
      default:
        return null;
    }
    return b;
  }

  /** A looping filtered noise layer; returns its filter and gain for modulation. */
  private layer(
    b: Bed, color: NoiseColor, type: BiquadFilterType, f: number, q: number, g: number, pan: number,
    post?: 'lp' | 'hp', postF?: number,
  ): { f: BiquadFilterNode; g: AudioParam } {
    const ac = this.host.ac;
    const src = noise(ac, this.host.bank, color, ac.currentTime, Infinity);
    const fl = biquad(ac, type, f, q);
    const gn = gainNode(ac, g);
    let last: AudioNode = fl;
    src.connect(fl);
    if (post && postF) {
      const p2 = biquad(ac, post === 'lp' ? 'lowpass' : 'highpass', postF, 0.7);
      fl.connect(p2);
      last = p2;
      b.nodes.push(p2);
    }
    const pn = panner(ac, pan);
    last.connect(gn).connect(pn).connect(b.input);
    b.srcs.push(src);
    b.nodes.push(fl, gn, pn);
    return { f: fl, g: gn.gain };
  }

  /** Sine LFO adding ±depth to a param. */
  private lfo(b: Bed, hz: number, depth: number, target: AudioParam): void {
    const ac = this.host.ac;
    const o = ac.createOscillator();
    o.frequency.value = hz * this.rng.range(0.85, 1.15);
    const g = gainNode(ac, depth);
    o.connect(g).connect(target);
    o.start(ac.currentTime);
    b.srcs.push(o);
    b.nodes.push(g);
  }

  private bird(c: KitCtx): void {
    const r = c.r;
    const pan = r.range(-0.9, 0.9);
    const kind = r.next();
    if (kind < 0.45) {
      // chirps
      const f = r.range(2800, 5200);
      const n = r.int(2, 5);
      for (let i = 0; i < n; i++) {
        kitTone(c, { f: f * r.range(0.95, 1.05), to: [[f * r.range(1.15, 1.4), 0.035]], at: i * r.range(0.07, 0.1), a: 0.004, d: 0.018, g: r.range(0.02, 0.045), pan });
      }
    } else if (kind < 0.7) {
      // trill
      kitTone(c, { f: r.range(3500, 4800), vib: { hz: r.range(18, 28), c: 280 }, a: 0.02, hold: r.range(0.2, 0.5), d: 0.04, g: 0.025, pan });
    } else if (kind < 0.92) {
      // thrush-like whistle
      const f1 = r.range(1800, 2800);
      kitTone(c, { f: f1, to: [[f1 * r.range(1.2, 1.5), 0.12]], a: 0.02, hold: 0.08, d: 0.04, g: 0.035, pan });
      kitTone(c, { f: f1 * 1.3, to: [[f1 * 0.9, 0.15]], at: 0.24, a: 0.02, hold: 0.1, d: 0.05, g: 0.03, pan });
    } else {
      // dove
      const f = r.range(480, 560);
      [0, 0.35, 0.55].forEach((at, i) => kitTone(c, { f: f * (i === 1 ? 1.12 : 1), at, a: 0.05, hold: 0.12, d: 0.06, g: 0.025, pan }));
    }
  }
}
