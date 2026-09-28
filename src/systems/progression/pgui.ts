/**
 * Shared overlay plumbing for progression panels: key capture (Esc / hotkeys close, other keys don't leak to
 * the scene), engine pause while open, close debounce (so the same Tab press can't reopen), DOM particle bursts.
 */
import './progression.css';
import { h, layer, type Child } from '../../ui/dom';
import { engine } from '../../core/engine';
import { audio } from '../../audio';
import { hideTooltip } from '../../ui/widgets';
import { banner, type BannerKind } from '../../ui/toasts';
import { icon } from './art';

export interface Overlay { root: HTMLElement; shell: HTMLElement; close: () => void; readonly open: boolean }

const lastClosed = new Map<string, number>();
const openOnes = new Map<string, Overlay>();

/** True if `key` was closed less than `ms` ago (debounce reopen from the same key press). */
export function recentlyClosed(key: string, ms = 320): boolean { return performance.now() - (lastClosed.get(key) ?? -1e9) < ms; }
export function getOpen(key: string): Overlay | undefined { return openOnes.get(key); }
/** Closes every progression panel (scene changes). */
export function closeAllOverlays(): void { for (const o of [...openOnes.values()]) o.close(); }

export interface OverlayOpts {
  key: string;                 // identity (codex, relics, forge...)
  className?: string;          // extra class on the backdrop (pg-forge, pg-academy)
  hotkeys?: string[];          // KeyboardEvent.code values that also close it (e.g. 'Tab', 'KeyI')
  pause?: boolean;             // pause the engine while open (default true)
  onClose?: () => void;
  shell?: boolean;             // wrap content in .pg-shell (default true)
}

export function openOverlay(opts: OverlayOpts, ...children: Child[]): Overlay {
  const prev = openOnes.get(opts.key);
  if (prev) return prev;
  const shell = opts.shell === false ? h('div', null, ...children) : h('div', { class: 'pg-shell' }, ...children);
  const root = h('div', { class: `pg-overlay ${opts.className ?? ''}` }, shell);
  const pause = opts.pause !== false;
  const wasPaused = engine.paused;
  if (pause) engine.paused = true;
  let isOpen = true;
  const onKey = (e: KeyboardEvent) => {
    if (!isOpen) return;
    const inside = e.target instanceof Node && root.contains(e.target);
    const typing = inside && (e.target as HTMLElement).tagName === 'INPUT';
    if (e.code === 'Escape' || (!typing && opts.hotkeys?.includes(e.code))) {
      // a modal (lx-modal) on top gets its own Escape first
      if (e.code === 'Escape' && document.querySelector('.lx-modal-back')) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      ov.close();
      return;
    }
    if (!inside) { e.stopImmediatePropagation(); if (e.code === 'Tab' || e.code === 'Space') e.preventDefault(); }
  };
  // bubbling key events from our own inputs must not reach scene handlers either
  root.addEventListener('keydown', (e) => e.stopPropagation());
  window.addEventListener('keydown', onKey, true);
  root.addEventListener('pointerdown', (e) => { if (e.target === root) ov.close(); });
  const ov: Overlay = {
    root, shell,
    get open() { return isOpen; },
    close() {
      if (!isOpen) return;
      isOpen = false;
      window.removeEventListener('keydown', onKey, true);
      openOnes.delete(opts.key);
      lastClosed.set(opts.key, performance.now());
      if (pause) engine.paused = wasPaused;
      hideTooltip();
      audio.sfx('ui_close');
      root.classList.add('out');
      setTimeout(() => root.remove(), 200);
      opts.onClose?.();
    },
  };
  openOnes.set(opts.key, ov);
  layer('panel').appendChild(root);
  audio.sfx('ui_open');
  return ov;
}

/** Standard header: eclipse medallion, title, subtitle, right-side children, close button. */
export function header(title: string, sub: string, close: () => void, ...right: Child[]): HTMLElement {
  return h('div', { class: 'pg-head' },
    h('div', { class: 'pg-eclipse' }),
    h('div', { class: 'pg-titles' }, h('div', { class: 'pg-title' }, title), h('div', { class: 'pg-sub' }, sub)),
    h('div', { class: 'pg-head-right' }, ...right, h('button', { class: 'pg-close', onclick: close, 'aria-label': 'Cerrar', 'data-tip': 'Cerrar (Esc)' }, '×')),
  );
}

/** Resource chip that can be refreshed. */
export function resChip(kind: 'ess' | 'gold', value: () => number): { el: HTMLElement; refresh: () => void } {
  const val = h('span', null, '');
  const el = h('span', { class: `pg-chip ${kind}`, 'data-tip': kind === 'ess' ? '<b>Esencia</b>\nSube de rango habilidades y paga fusiones.' : '<b>Oro</b>' },
    h('span', { html: icon(kind === 'ess' ? 'esencia' : 'oro', { size: 18 }) }), val);
  let last = -1;
  const refresh = () => {
    const v = Math.round(value());
    if (v !== last) { if (last >= 0) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); } last = v; val.textContent = v.toLocaleString('es-ES'); }
  };
  refresh();
  return { el, refresh };
}

/** A burst of glowing DOM particles at a screen point (or element center). */
export function burst(at: HTMLElement | { x: number; y: number }, color = '#f5d99a', n = 18, spread = 90): void {
  let x: number, y: number;
  if (at instanceof HTMLElement) { const r = at.getBoundingClientRect(); x = r.left + r.width / 2; y = r.top + r.height / 2; }
  else ({ x, y } = at);
  const box = h('div', { class: 'pg-burst', style: `left:${x}px;top:${y}px` });
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.4;
    const d = spread * (0.45 + Math.random() * 0.75);
    const s = 4 + Math.random() * 6;
    box.appendChild(h('i', { style: `--c:${color};--dx:${Math.cos(a) * d}px;--dy:${Math.sin(a) * d}px;width:${s}px;height:${s}px;animation-delay:${Math.random() * 60}ms` }));
  }
  layer('toast').appendChild(box);
  setTimeout(() => box.remove(), 1000);
}

export function flashEl(el: HTMLElement): void { el.classList.remove('pg-flash'); void el.offsetWidth; el.classList.add('pg-flash'); }

/** Segmented control. */
export function seg<T extends string>(options: Array<[T, string]>, value: T, onChange: (v: T) => void): HTMLElement {
  const box = h('div', { class: 'pg-seg' });
  for (const [v, label] of options) {
    const b = h('button', { class: v === value ? 'on' : '', onclick: () => { if (v === value) return; audio.sfx('ui_tab'); onChange(v); } }, label);
    box.appendChild(b);
  }
  return box;
}

/** Spanish plural for job names ("Hechicero" → "Hechiceros", "Crupier" → "Crupieres"). */
export function plural(s: string): string {
  if (/[aeiouáéó]$/i.test(s)) return s + 's';
  if (/z$/i.test(s)) return s.slice(0, -1) + 'ces';
  if (/ón$/i.test(s)) return s.slice(0, -2) + 'ones';
  return s + 'es';
}

let bannerChain: Promise<void> = Promise.resolve();
/** Banners from progression never overlap each other: they queue. */
export function queueBanner(title: string, sub: string, kind: BannerKind = 'excepcion', duration = 3): void {
  bannerChain = bannerChain.then(() => banner(title, sub, { kind, duration }).catch(() => undefined));
}
