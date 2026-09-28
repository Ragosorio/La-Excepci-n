/**
 * Casino 2D juice: a full-screen canvas particle overlay (spinning coins, gems, confetti, sparkles),
 * count-up numbers with coin ticks, and tiered win banners (GANANCIA / GRAN GANANCIA / ¡EXCEPCIONAL! / ¡BOTE!).
 * The overlay runs its own rAF only while particles are alive.
 */
import { h, layer, wait } from '../ui/dom';
import { audio } from '../audio';
import { engine } from '../core/engine';
import { fmt } from '../core/math';

type Kind = 'coin' | 'gem' | 'confetti' | 'spark' | 'soul';
interface P { k: Kind; x: number; y: number; vx: number; vy: number; life: number; max: number; rot: number; vr: number; s: number; c: string; ph: number; bounce: number; floor: boolean }

const CONFETTI = ['#ff4fa3', '#4fd8ff', '#ffe066', '#9b5cff', '#6fe39a', '#ff8a3a', '#f5d99a'];
const GEMS = ['#ff4fa3', '#4fd8ff', '#6fe39a', '#c7a2ff', '#ffb347'];

class Overlay {
  private cv: HTMLCanvasElement | null = null;
  private g: CanvasRenderingContext2D | null = null;
  private parts: P[] = [];
  private running = false;
  private last = 0;
  private dpr = 1;
  private coinFrames: HTMLCanvasElement[] = [];
  private W = 0; private H = 0;

  private ensure(): void {
    if (this.cv && this.cv.isConnected) return;
    this.cv = h('canvas', { class: 'cs-fx2d' });
    layer('cutin').appendChild(this.cv);
    this.g = this.cv.getContext('2d');
    this.resize();
    if (!this.coinFrames.length) this.coinFrames = makeCoinFrames(44);
  }

  private resize(): void {
    if (!this.cv) return;
    this.dpr = Math.min(1.5, window.devicePixelRatio || 1);
    this.W = window.innerWidth; this.H = window.innerHeight;
    this.cv.width = Math.round(this.W * this.dpr); this.cv.height = Math.round(this.H * this.dpr);
  }

  add(k: Kind, x: number, y: number, o: { speed?: number; up?: number; spread?: number; angle?: number; cone?: number; size?: number; life?: number; floor?: boolean; color?: string } = {}): void {
    this.ensure();
    if (this.parts.length > 700) return;
    const sp = (o.speed ?? 600) * (0.45 + Math.random() * 0.8);
    const ang = o.angle !== undefined ? o.angle + (Math.random() - 0.5) * (o.cone ?? Math.PI * 2) : Math.random() * Math.PI * 2;
    const size = (o.size ?? (k === 'coin' ? 1 : k === 'confetti' ? 1 : 1)) * (0.75 + Math.random() * 0.5);
    this.parts.push({
      k, x: x + (Math.random() - 0.5) * (o.spread ?? 10), y: y + (Math.random() - 0.5) * (o.spread ?? 10),
      vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - (o.up ?? 0) * (0.6 + Math.random() * 0.6),
      life: (o.life ?? (k === 'spark' ? 0.7 : k === 'confetti' ? 3.2 : 2.6)) * (0.7 + Math.random() * 0.5), max: 1,
      rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * (k === 'confetti' ? 14 : 8), s: size,
      c: o.color ?? (k === 'confetti' ? CONFETTI[(Math.random() * CONFETTI.length) | 0] : k === 'gem' ? GEMS[(Math.random() * GEMS.length) | 0] : k === 'soul' ? '#c77dff' : '#ffe8a0'),
      ph: Math.random() * 8, bounce: 0, floor: o.floor ?? (k === 'coin' || k === 'gem'),
    });
    const p = this.parts[this.parts.length - 1];
    p.max = p.life;
    if (!this.running) { this.running = true; this.last = performance.now(); requestAnimationFrame(this.tick); }
  }

  private tick = (now: number): void => {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (!this.cv || !this.g) { this.running = false; return; }
    if (this.cv.width !== Math.round(window.innerWidth * this.dpr)) this.resize();
    const g = this.g;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, this.W, this.H);
    const floorY = this.H - 14;
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0 || p.y > this.H + 60) { this.parts[i] = this.parts[this.parts.length - 1]; this.parts.pop(); continue; }
      if (p.k === 'confetti') {
        p.vx *= Math.exp(-2.2 * dt); p.vy += 420 * dt; p.vy *= Math.exp(-1.6 * dt);
        p.x += (p.vx + Math.sin(p.ph + p.life * 5) * 60) * dt;
      } else if (p.k === 'spark' || p.k === 'soul') {
        p.vx *= Math.exp(-3 * dt); p.vy *= Math.exp(-3 * dt); p.vy += (p.k === 'soul' ? -60 : 160) * dt;
        p.x += p.vx * dt;
      } else {
        p.vy += 1500 * dt;
        p.x += p.vx * dt;
      }
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      if (p.floor && p.y > floorY && p.vy > 0) {
        p.y = floorY; p.vy *= -0.38; p.vx *= 0.72; p.bounce++;
        if (p.bounce === 1 && Math.random() < 0.05) audio.sfx('coin', { volume: 0.12, pitch: 0.9 + Math.random() * 0.4 });
      }
      const a = Math.min(1, p.life / Math.min(0.6, p.max * 0.4));
      g.globalAlpha = a;
      if (p.k === 'coin') {
        const f = this.coinFrames[Math.floor((p.rot * 2 + p.ph) % this.coinFrames.length + this.coinFrames.length) % this.coinFrames.length];
        const s = 30 * p.s;
        g.drawImage(f, p.x - s / 2, p.y - s / 2, s, s);
      } else if (p.k === 'gem') {
        g.save(); g.translate(p.x, p.y); g.rotate(p.rot);
        const s = 11 * p.s;
        g.fillStyle = p.c; g.strokeStyle = '#150b1f'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(0, -s); g.lineTo(s * 0.8, 0); g.lineTo(0, s); g.lineTo(-s * 0.8, 0); g.closePath(); g.fill(); g.stroke();
        g.fillStyle = 'rgba(255,255,255,.7)'; g.beginPath(); g.moveTo(0, -s * 0.7); g.lineTo(s * 0.35, -s * 0.1); g.lineTo(0, 0); g.closePath(); g.fill();
        g.restore();
      } else if (p.k === 'confetti') {
        g.save(); g.translate(p.x, p.y); g.rotate(p.rot);
        g.scale(1, Math.abs(Math.cos(p.rot * 1.3 + p.ph)) + 0.15);
        g.fillStyle = p.c; g.fillRect(-5 * p.s, -3 * p.s, 10 * p.s, 6 * p.s);
        g.restore();
      } else {
        g.save(); g.globalCompositeOperation = 'lighter'; g.translate(p.x, p.y); g.rotate(p.rot);
        const s = (p.k === 'soul' ? 9 : 12) * p.s * (0.6 + a * 0.4);
        g.fillStyle = p.c;
        g.beginPath();
        for (let j = 0; j < 8; j++) { const r = j % 2 === 0 ? s : s * 0.22; const an = (j / 8) * Math.PI * 2; g.lineTo(Math.cos(an) * r, Math.sin(an) * r); }
        g.closePath(); g.fill();
        g.restore();
      }
    }
    g.globalAlpha = 1;
    if (this.parts.length) requestAnimationFrame(this.tick);
    else { this.running = false; g.clearRect(0, 0, this.W, this.H); }
  };

  clear(): void { this.parts.length = 0; }
}

function makeCoinFrames(size: number): HTMLCanvasElement[] {
  const frames: HTMLCanvasElement[] = [];
  const n = 10;
  for (let i = 0; i < n; i++) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d')!;
    const sx = Math.max(0.12, Math.abs(Math.cos((i / n) * Math.PI)));
    const r = size * 0.44;
    g.translate(size / 2, size / 2);
    g.scale(sx, 1);
    // rim
    g.fillStyle = '#8a5a12'; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill();
    const grd = g.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.1, 0, 0, r);
    grd.addColorStop(0, '#fff6c8'); grd.addColorStop(0.45, '#ffd34a'); grd.addColorStop(1, '#c98a14');
    g.fillStyle = grd; g.beginPath(); g.arc(0, 0, r * 0.86, 0, Math.PI * 2); g.fill();
    // eclipse emblem
    g.fillStyle = '#7a4a08'; g.beginPath(); g.arc(0, 0, r * 0.42, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ffe9a0'; g.beginPath(); g.arc(0, 0, r * 0.34, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#7a4a08'; g.beginPath(); g.arc(r * 0.06, -r * 0.03, r * 0.3, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(40,20,0,.8)'; g.lineWidth = 2; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke();
    if (sx > 0.5) { g.fillStyle = 'rgba(255,255,255,.75)'; g.beginPath(); g.ellipse(-r * 0.35, -r * 0.4, r * 0.18, r * 0.09, -0.6, 0, Math.PI * 2); g.fill(); }
    frames.push(c);
  }
  return frames;
}

export const fx2d = new Overlay();

// ───────────────────────────── presets ─────────────────────────────

/** Coins exploding upward from a point (screen px). */
export function coinBurst(x: number, y: number, n = 30, opts: { speed?: number; gems?: boolean } = {}): void {
  for (let i = 0; i < n; i++) {
    fx2d.add(opts.gems && i % 4 === 0 ? 'gem' : 'coin', x, y, { speed: opts.speed ?? 520, angle: -Math.PI / 2, cone: 2.2, up: 380, spread: 30 });
  }
  for (let i = 0; i < Math.min(24, n / 2); i++) fx2d.add('spark', x, y, { speed: 420, life: 0.6, spread: 20 });
}

/** Coins raining from the top for `ms`. */
export async function coinRain(n = 160, ms = 2500, opts: { confetti?: boolean; gems?: boolean } = {}): Promise<void> {
  const W = window.innerWidth;
  const steps = Math.max(1, Math.round(ms / 50));
  const per = n / steps;
  let acc = 0;
  for (let s = 0; s < steps; s++) {
    acc += per;
    while (acc >= 1) {
      acc -= 1;
      const kind: Kind = opts.confetti && Math.random() < 0.35 ? 'confetti' : opts.gems && Math.random() < 0.15 ? 'gem' : 'coin';
      fx2d.add(kind, Math.random() * W, -30, { speed: 120, angle: Math.PI / 2, cone: 0.8, spread: 10 });
    }
    await wait(50);
  }
}

export function confettiBurst(x: number, y: number, n = 80): void {
  for (let i = 0; i < n; i++) fx2d.add('confetti', x, y, { speed: 700, angle: -Math.PI / 2, cone: 2.6, up: 250, spread: 20 });
}

export function sparkleAt(x: number, y: number, n = 12, color?: string): void {
  for (let i = 0; i < n; i++) fx2d.add('spark', x, y, { speed: 260, life: 0.55, spread: 8, color });
}

export function soulsAt(x: number, y: number, n = 16): void {
  for (let i = 0; i < n; i++) fx2d.add('soul', x, y, { speed: 180, life: 1.3, spread: 30 });
}

export function centerOf(el: Element): { x: number; y: number } {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

// ───────────────────────────── count-up ─────────────────────────────

/** Animated number with coin ticks. Resolves at the end; `skip()` jumps to the final value. */
export function countUp(el: HTMLElement, from: number, to: number, ms: number, opts: { prefix?: string; suffix?: string; ticks?: boolean; format?: (n: number) => string } = {}): { done: Promise<void>; skip: () => void } {
  const f = opts.format ?? ((n: number) => fmt(Math.round(n)));
  let skipped = false;
  const done = new Promise<void>((resolve) => {
    const t0 = performance.now();
    let lastTick = 0;
    const step = (now: number) => {
      const k = skipped ? 1 : Math.min(1, (now - t0) / Math.max(1, ms));
      const e = 1 - Math.pow(1 - k, 3);
      el.textContent = `${opts.prefix ?? ''}${f(from + (to - from) * e)}${opts.suffix ?? ''}`;
      if (opts.ticks !== false && now - lastTick > 55 + k * 90 && k < 1) { lastTick = now; audio.sfx('coin', { volume: 0.18, pitch: 0.9 + k * 0.6 }); }
      if (k < 1) requestAnimationFrame(step); else resolve();
    };
    requestAnimationFrame(step);
  });
  return { done, skip: () => { skipped = true; } };
}

// ───────────────────────────── win banners ─────────────────────────────

export type WinTier = 'ldw' | 'win' | 'big' | 'mega' | 'jackpot';

/** Tier from net win measured in stake multiples. */
export function tierFor(net: number, stake: number, jackpot = false): Exclude<WinTier, 'ldw'> | null {
  if (jackpot) return 'jackpot';
  if (net <= 0) return null;
  const x = net / Math.max(1, stake);
  if (x >= 50) return 'mega';
  if (x >= 10) return 'big';
  return 'win';
}

const TIER: Record<Exclude<WinTier, 'ldw'>, { title: string; ms: number; cls: string }> = {
  win: { title: 'GANANCIA', ms: 1300, cls: 'win' },
  big: { title: 'GRAN GANANCIA', ms: 3200, cls: 'big' },
  mega: { title: '¡EXCEPCIONAL!', ms: 5200, cls: 'mega' },
  jackpot: { title: '¡BOTE!', ms: 8000, cls: 'jackpot' },
};

let bannerBusy: HTMLElement | null = null;

/**
 * Big celebratory banner with count-up, coins and sound scaled by tier. Click/tap/Space skips.
 * `origin` = screen point for the coin fountain (defaults to screen center).
 */
export async function winBanner(tier: Exclude<WinTier, 'ldw'>, amount: number, opts: { origin?: { x: number; y: number }; sub?: string; currency?: 'gold' | 'essence' } = {}): Promise<void> {
  bannerBusy?.remove();
  const t = TIER[tier];
  const num = h('div', { class: 'cs-wb-num' }, '0');
  const el = h('div', { class: `cs-wb ${t.cls}` },
    h('div', { class: 'cs-wb-rays' }),
    h('div', { class: 'cs-wb-title' }, t.title),
    h('div', { class: 'cs-wb-amount' }, h('span', { class: `cs-wb-cur ${opts.currency === 'essence' ? 'ess' : ''}` }), num),
    opts.sub ? h('div', { class: 'cs-wb-sub' }, opts.sub) : null,
  );
  layer('cutin').appendChild(el);
  bannerBusy = el;
  const o = opts.origin ?? { x: window.innerWidth / 2, y: window.innerHeight * 0.55 };
  const cu = countUp(num, 0, amount, t.ms * 0.62, { ticks: true });
  const p = engine.pipeline;
  if (tier === 'win') {
    audio.sfx('slot_win_small');
    coinBurst(o.x, o.y, 24);
  } else if (tier === 'big') {
    audio.sfx('slot_win_big'); audio.sfx('crowd_cheer', { volume: 0.6 });
    p.setSpeedLines(0.35); p.chromaticPulse(0.5, 0.5);
    coinBurst(o.x, o.y, 70, { gems: true });
    void coinRain(90, 1800);
  } else if (tier === 'mega') {
    audio.sfx('slot_win_big'); audio.sfx('crowd_cheer'); audio.sfx('coins_many');
    p.impact(2, 0); p.flash('#c7a2ff', 0.35, 0.5); p.chromaticPulse(1, 0.8); p.setSpeedLines(0.6);
    coinBurst(o.x, o.y, 110, { gems: true });
    confettiBurst(o.x, o.y, 90);
    void coinRain(220, 3200, { confetti: true, gems: true });
  } else {
    audio.stinger('jackpot_fanfare'); audio.sfx('jackpot'); audio.sfx('crowd_cheer');
    p.impact(3, 0); p.flash('#ffe066', 0.6, 0.8); p.chromaticPulse(1.3, 1.2); p.setSpeedLines(0.8);
    coinBurst(o.x, o.y, 140, { gems: true });
    confettiBurst(window.innerWidth * 0.2, window.innerHeight * 0.4, 70);
    confettiBurst(window.innerWidth * 0.8, window.innerHeight * 0.4, 70);
    void coinRain(420, 5200, { confetti: true, gems: true });
  }
  let coinsTimer = 0;
  if (tier !== 'win') coinsTimer = window.setInterval(() => audio.sfx('coins_many', { volume: 0.35 }), 900);
  let skip = false;
  const onSkip = (e: Event) => {
    if (e instanceof KeyboardEvent && e.code !== 'Space' && e.code !== 'Enter') return;
    skip = true; cu.skip();
  };
  window.addEventListener('pointerdown', onSkip, true);
  window.addEventListener('keydown', onSkip, true);
  const t0 = performance.now();
  while (!skip && performance.now() - t0 < t.ms) await wait(50);
  cu.skip();
  await cu.done;
  window.removeEventListener('pointerdown', onSkip, true);
  window.removeEventListener('keydown', onSkip, true);
  if (coinsTimer) clearInterval(coinsTimer);
  p.setSpeedLines(0);
  await wait(skip ? 250 : 500);
  el.classList.add('out');
  await wait(420);
  el.remove();
  if (bannerBusy === el) bannerBusy = null;
}

/** "Loss disguised as win": payout below the stake. Deflating, honest feedback. */
export function ldwNote(anchor: HTMLElement, won: number, staked: number): void {
  const r = anchor.getBoundingClientRect();
  const el = h('div', { class: 'cs-ldw', style: `left:${r.left + r.width / 2}px;top:${r.top + r.height * 0.3}px` },
    h('div', null, `+${fmt(won)}`), h('div', { class: 'cs-ldw-sub' }, `apostaste ${fmt(staked)} · neto −${fmt(staked - won)}`));
  layer('cutin').appendChild(el);
  audio.sfx('slot_win_small', { volume: 0.35, pitch: 0.7 });
  setTimeout(() => el.remove(), 1900);
}

/** Small floating "+123" / "−50" near an element. */
export function floatDelta(anchor: Element, text: string, kind: 'good' | 'bad' | 'gold' | 'ess' = 'gold'): void {
  const r = anchor.getBoundingClientRect();
  const el = h('div', { class: `cs-fd ${kind}`, style: `left:${r.left + r.width / 2}px;top:${r.top}px` }, text);
  layer('cutin').appendChild(el);
  setTimeout(() => el.remove(), 1300);
}

/** Shake a DOM element (anime screen-shake for the UI). */
export function shakeEl(el: HTMLElement, strong = false): void {
  el.classList.remove('cs-shake', 'cs-shake-strong');
  void el.offsetWidth;
  el.classList.add(strong ? 'cs-shake-strong' : 'cs-shake');
  setTimeout(() => el.classList.remove('cs-shake', 'cs-shake-strong'), 520);
}
