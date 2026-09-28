/** Small DOM "juice" helpers shared by the society UIs (floating numbers, count-ups, mind pulse). */
import { engine } from '../../core/engine';
import { h, layer } from '../../ui/dom';

/** Floating "+120 oro" style text rising from an element (or a screen point). */
export function popText(anchor: HTMLElement | { x: number; y: number }, text: string, color = 'var(--gold-hi)', big = false): void {
  let x: number, y: number;
  if (anchor instanceof HTMLElement) {
    const r = anchor.getBoundingClientRect();
    x = r.left + r.width / 2; y = r.top + r.height / 2;
  } else { x = anchor.x; y = anchor.y; }
  const el = h('div', { class: `soc-pop ${big ? 'big' : ''}`, style: `left:${x}px;top:${y}px;color:${color}` }, text);
  layer('toast').appendChild(el);
  setTimeout(() => el.remove(), 1300);
}

/** Animated number (ease-out) inside an element. */
export function countUp(el: HTMLElement, from: number, to: number, ms = 600, fmt: (n: number) => string = (n) => Math.round(n).toLocaleString('es-ES')): void {
  const t0 = performance.now();
  const step = (now: number) => {
    const k = Math.min(1, (now - t0) / ms);
    const e = 1 - Math.pow(1 - k, 3);
    el.textContent = fmt(from + (to - from) * e);
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export function shakeEl(el: HTMLElement): void {
  el.classList.remove('lx-shake');
  void el.offsetWidth;
  el.classList.add('lx-shake');
}

let mindTimer = 0;
/** Screen-wide mind-control swirl for a moment (Dominar Mente outside battle). */
export function mindPulse(ms = 1500): void {
  const p = engine.pipeline;
  if (!p) return;
  p.setMind(1);
  p.chromaticPulse(0.6, 0.5);
  window.clearTimeout(mindTimer);
  mindTimer = window.setTimeout(() => p.setMind(0), ms);
}

export function goldFlash(): void { engine.pipeline?.flash('#ffd98a', 0.18, 0.3); }
