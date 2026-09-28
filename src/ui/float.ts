/** Floating world-space text (damage numbers, +gold, status words). DOM-based, projected each frame. */
import * as THREE from 'three';
import { h, layer } from './dom';
import { engine } from '../core/engine';
import { G } from '../core/state';

interface FloatItem { el: HTMLElement; pos: THREE.Vector3; t: number; life: number; vx: number; vy: number; scale: number }
const items: FloatItem[] = [];
const tmp = new THREE.Vector3();
let running = false;

export interface FloatOpts { kind?: 'dmg' | 'crit' | 'heal' | 'magic' | 'gold' | 'info' | 'small'; color?: string; life?: number; size?: number }

export function floatText(pos: THREE.Vector3, text: string, opts: FloatOpts = {}): void {
  if (opts.kind !== 'info' && opts.kind !== 'gold' && G.meta && !G.meta.settings.damageNumbers) return;
  if (items.length > 90) { const old = items.shift(); old?.el.remove(); }
  const el = h('div', { class: `lx-float ${opts.kind ?? ''}`, style: opts.color ? `color:${opts.color}` : '' }, text);
  if (opts.size) el.style.fontSize = `${opts.size}px`;
  layer('world').appendChild(el);
  items.push({ el, pos: pos.clone(), t: 0, life: opts.life ?? (opts.kind === 'crit' ? 1.1 : 0.85), vx: (Math.random() - 0.5) * 40, vy: -70 - Math.random() * 30, scale: opts.kind === 'crit' ? 1.6 : 1.2 });
  if (!running) { running = true; requestAnimationFrame(tick); }
}

let last = performance.now();
function tick(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const cam = engine.current?.camera;
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    it.t += dt;
    const k = it.t / it.life;
    if (k >= 1 || !cam) { it.el.remove(); items.splice(i, 1); continue; }
    tmp.copy(it.pos).project(cam);
    const behind = tmp.z > 1;
    const x = (tmp.x * 0.5 + 0.5) * engine.width + it.vx * it.t;
    const y = (-tmp.y * 0.5 + 0.5) * engine.height + it.vy * it.t + 120 * it.t * it.t;
    const pop = k < 0.15 ? 1 + (it.scale - 1) * (1 - k / 0.15) : 1;
    it.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${pop})`;
    it.el.style.opacity = behind ? '0' : String(k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1);
  }
  if (items.length) requestAnimationFrame(tick); else running = false;
}

export function clearFloats(): void { items.splice(0).forEach((i) => i.el.remove()); }
