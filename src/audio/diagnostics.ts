/**
 * Offline diagnostics (dev only): renders sounds in an OfflineAudioContext and
 * measures them (peak, RMS, silence, render speed). Used by audio-lab.html.
 */
import { AmbienceMgr } from './ambience';
import { getBank, makeImpulse } from './core/dsp';
import { VOICE_STATS } from './core/patches';
import { createPiece } from './music';
import { Sfx } from './sfx';
import { Stingers } from './stingers';
import type { Ambience, MusicMood, Region, SfxName, StingerName } from './types';

export interface Stats {
  name: string;
  seconds: number;
  peakDb: number;
  rmsDb: number;
  /** RMS of the loudest second */
  loudDb: number;
  /** seconds (from start) until the sound decays below -60 dBFS for good */
  tail: number;
  clipped: number;
  renderMs: number;
  /** render time / audio time (lower = cheaper) */
  cpu: number;
  /** per-second RMS in dBFS */
  perSec: number[];
  /** true if a NaN/Infinity was produced */
  bad: boolean;
  /** voices started per second of audio */
  vps: number;
  /** average number of live nodes (node-seconds / seconds): a contention-free CPU proxy */
  nodes: number;
}

const SR = 44100;
const db = (x: number): number => (x > 1e-9 ? 20 * Math.log10(x) : -180);

function makeHost(off: OfflineAudioContext): { dry: AudioNode; wet: AudioNode } {
  const verb = off.createConvolver();
  verb.buffer = makeImpulse(off, { seconds: 3.4, rt60: 2.9, predelay: 0.025, damp: 0.55, seed: 11 });
  const ret = off.createGain();
  ret.gain.value = 0.85;
  verb.connect(ret).connect(off.destination);
  const dry = off.createGain();
  dry.connect(off.destination);
  return { dry, wet: verb };
}

function analyse(name: string, buf: AudioBuffer, renderMs: number): Stats {
  const n = buf.length;
  const chans = Array.from({ length: buf.numberOfChannels }, (_, i) => buf.getChannelData(i));
  let peak = 0;
  let sum = 0;
  let clipped = 0;
  let bad = false;
  let lastLoud = 0;
  const perSec: number[] = [];
  let secSum = 0;
  let secN = 0;
  for (let i = 0; i < n; i++) {
    let m = 0;
    for (const c of chans) {
      const v = c[i] as number;
      if (!Number.isFinite(v)) bad = true;
      const a = Math.abs(v);
      if (a > m) m = a;
      sum += v * v;
      secSum += v * v;
    }
    if (m > peak) peak = m;
    if (m > 0.99) clipped++;
    if (m > 0.001) lastLoud = i;
    secN += chans.length;
    if ((i + 1) % buf.sampleRate === 0 || i === n - 1) {
      perSec.push(Math.round(db(Math.sqrt(secSum / Math.max(1, secN))) * 10) / 10);
      secSum = 0;
      secN = 0;
    }
  }
  const rms = Math.sqrt(sum / (n * chans.length));
  return {
    name,
    seconds: n / buf.sampleRate,
    peakDb: Math.round(db(peak) * 10) / 10,
    rmsDb: Math.round(db(rms) * 10) / 10,
    loudDb: Math.max(...perSec),
    tail: Math.round((lastLoud / buf.sampleRate) * 100) / 100,
    clipped,
    renderMs: Math.round(renderMs),
    cpu: Math.round((renderMs / 1000 / (n / buf.sampleRate)) * 1000) / 1000,
    perSec,
    bad,
    vps: 0,
    nodes: 0,
  };
}

async function render(name: string, seconds: number, build: (off: OfflineAudioContext) => void): Promise<Stats> {
  const off = new OfflineAudioContext(2, Math.ceil(SR * seconds), SR);
  const v0 = VOICE_STATS.voices;
  const n0 = VOICE_STATS.nodeSec;
  build(off);
  const voices = VOICE_STATS.voices - v0;
  const nodeSec = VOICE_STATS.nodeSec - n0;
  const t0 = performance.now();
  const buf = await off.startRendering();
  const st = analyse(name, buf, performance.now() - t0);
  st.vps = Math.round((voices / seconds) * 10) / 10;
  st.nodes = Math.round(nodeSec / seconds);
  return st;
}

export function renderSfx(name: SfxName, seconds = 4): Promise<Stats> {
  return render(name, seconds, (off) => {
    const h = makeHost(off);
    const sfx = new Sfx({ ac: off, bank: getBank(off), dry: h.dry, wet: h.wet });
    sfx.play(name);
  });
}

export function renderStinger(name: StingerName, seconds = 8): Promise<Stats> {
  return render(name, seconds, (off) => {
    const h = makeHost(off);
    new Stingers({ ac: off, bank: getBank(off), dry: h.dry, wet: h.wet }).play(name);
  });
}

export function renderMood(mood: MusicMood, region: Region, seconds = 20, intensity = 0, seed = 12345): Promise<Stats> {
  return render(`${mood}:${region}@${intensity}`, seconds, (off) => {
    const h = makeHost(off);
    const p = createPiece({ ac: off, bank: getBank(off), dry: h.dry, wet: h.wet }, mood, region, seed);
    if (!p) return;
    p.start(0, 0, intensity);
    // schedule the whole render up-front (offline: time does not advance while we queue)
    let t = 0;
    while (t < seconds) {
      t += 0.5;
      p.schedule(Math.min(t, seconds), 0);
    }
  });
}

export function renderAmbience(name: Ambience, seconds = 12): Promise<Stats> {
  return render(name, seconds, (off) => {
    const h = makeHost(off);
    const m = new AmbienceMgr({ ac: off, bank: getBank(off), dry: h.dry, wet: h.wet });
    m.set(name, true, 1);
    let t = 0;
    while (t < seconds) {
      m.tick(t, t + 0.5);
      t += 0.5;
    }
  });
}
