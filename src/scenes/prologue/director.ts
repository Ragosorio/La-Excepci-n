/**
 * Cutscene timelines driven by the scene's update loop (game time → respects slow-mo and pause).
 * A Timeline can be killed (skip / scene exit): every pending wait rejects with CANCEL and the async
 * sequence unwinds through `run()`, which swallows CANCEL.
 */
import * as THREE from 'three';

export const CANCEL = Symbol('cancel');

type Ease = (k: number) => number;
export const ease = {
  linear: (k: number) => k,
  inOut: (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2),
  out: (k: number) => 1 - Math.pow(1 - k, 3),
  in: (k: number) => k * k * k,
  sine: (k: number) => 0.5 - Math.cos(k * Math.PI) / 2,
};

interface Waiter { t: number; resolve: () => void; reject: (e: unknown) => void }
interface Tween { t: number; dur: number; fn: (k: number) => void; ease: Ease; resolve: () => void; reject: (e: unknown) => void }

export class Timeline {
  alive = true;
  private waits: Waiter[] = [];
  private tweens: Tween[] = [];

  wait(seconds: number): Promise<void> {
    if (!this.alive) return Promise.reject(CANCEL);
    return new Promise((resolve, reject) => this.waits.push({ t: Math.max(0, seconds), resolve, reject }));
  }

  /** Tween k 0→1 over `dur` seconds calling fn(eased k) every frame. */
  tween(dur: number, fn: (k: number) => void, e: Ease = ease.inOut): Promise<void> {
    if (!this.alive) return Promise.reject(CANCEL);
    return new Promise((resolve, reject) => { fn(0); this.tweens.push({ t: 0, dur: Math.max(1e-4, dur), fn, ease: e, resolve, reject }); });
  }

  /** Fire-and-forget tween (no await), still killed with the timeline. */
  bg(dur: number, fn: (k: number) => void, e: Ease = ease.inOut): void { this.tween(dur, fn, e).catch(() => undefined); }

  /** Throws CANCEL if the timeline was killed (call after awaiting something external, e.g. a dialogue). */
  guard(): void { if (!this.alive) throw CANCEL; }

  /** Resolve an external promise but stop if killed meanwhile. */
  async hold<T>(p: Promise<T>): Promise<T> { const v = await p; this.guard(); return v; }

  /** Wait until cond() is true (checked every frame) or timeout seconds. */
  async until(cond: () => boolean, timeout = Infinity): Promise<boolean> {
    let t = 0;
    while (!cond()) {
      if (t >= timeout) return false;
      await this.wait(0);
      t += this.lastDt;
    }
    return true;
  }

  lastDt = 0;
  update(dt: number): void {
    this.lastDt = dt;
    if (!this.alive) return;
    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const tw = this.tweens[i];
      tw.t += dt;
      const k = Math.min(1, tw.t / tw.dur);
      try { tw.fn(tw.ease(k)); } catch (err) { console.warn('[prologue] tween', err); }
      if (k >= 1) { this.tweens.splice(i, 1); tw.resolve(); }
    }
    for (let i = this.waits.length - 1; i >= 0; i--) {
      const w = this.waits[i];
      w.t -= dt;
      if (w.t <= 0) { this.waits.splice(i, 1); w.resolve(); }
    }
  }

  kill(): void {
    if (!this.alive) return;
    this.alive = false;
    for (const w of this.waits.splice(0)) w.reject(CANCEL);
    for (const tw of this.tweens.splice(0)) tw.reject(CANCEL);
  }
}

export class Director {
  private lines: Timeline[] = [];
  timeline(): Timeline { const t = new Timeline(); this.lines.push(t); return t; }
  update(dt: number): void {
    for (const t of this.lines) t.update(dt);
    this.lines = this.lines.filter((t) => t.alive);
  }
  killAll(): void { for (const t of this.lines) t.kill(); this.lines = []; }
  /** Run an async sequence, swallowing CANCEL. */
  static run(fn: () => Promise<void>, label = 'timeline'): void {
    fn().catch((err) => { if (err !== CANCEL) console.error(`[prologue] ${label} failed`, err); });
  }
}

// ───────────────────────────── camera shots ─────────────────────────────

/** A free cinematic camera (position + look target) with smooth moves and a subtle handheld drift. */
export class ShotCam {
  readonly pos = new THREE.Vector3();
  readonly look = new THREE.Vector3();
  handheld = 0.02;
  fov = 50;
  private t = 0;
  constructor(readonly camera: THREE.PerspectiveCamera) {}
  set(pos: THREE.Vector3, look: THREE.Vector3, fov?: number): void {
    this.pos.copy(pos); this.look.copy(look);
    if (fov) this.fov = fov;
    this.apply(0);
  }
  /** Tween from the current shot to a new one. */
  move(tl: Timeline, pos: THREE.Vector3, look: THREE.Vector3, dur: number, e: Ease = ease.inOut, fov?: number): Promise<void> {
    const p0 = this.pos.clone(), l0 = this.look.clone(), f0 = this.fov;
    return tl.tween(dur, (k) => {
      this.pos.lerpVectors(p0, pos, k);
      this.look.lerpVectors(l0, look, k);
      if (fov) this.fov = f0 + (fov - f0) * k;
    }, e);
  }
  apply(dt: number): void {
    this.t += dt;
    const c = this.camera;
    const hh = this.handheld;
    c.position.set(
      this.pos.x + Math.sin(this.t * 0.7) * hh + Math.sin(this.t * 1.9) * hh * 0.4,
      this.pos.y + Math.sin(this.t * 0.9 + 1) * hh * 0.8,
      this.pos.z + Math.cos(this.t * 0.6) * hh,
    );
    c.lookAt(this.look);
    if (Math.abs(c.fov - this.fov) > 0.01) { c.fov = this.fov; c.updateProjectionMatrix(); }
  }
}
