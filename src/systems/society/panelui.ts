/**
 * Full-screen windows for the society UIs (market, bank, sedas): backdrop, gold-framed panel, Escape to close,
 * pauses the game and world input while open, restores everything on close.
 */
import { engine } from '../../core/engine';
import { input } from '../../core/input';
import { h, layer, removeAnimated, type Child } from '../../ui/dom';
import { blockMenu } from '../../ui/menu';
import { hideTooltip } from '../../ui/widgets';
import { audio } from '../../audio';
import './society.css';

export interface SocWindow {
  root: HTMLElement;
  box: HTMLElement;
  body: HTMLElement;
  close: () => void;
  closed: Promise<void>;
  isOpen: () => boolean;
}

export function openWindow(opts: { title: Child; icon?: string; className?: string; subtitle?: Child; headerRight?: Child }): SocWindow {
  let open = true;
  let resolveClosed: () => void = () => undefined;
  const closed = new Promise<void>((r) => { resolveClosed = r; });
  const prevPaused = engine.paused;
  const prevInput = input.enabled;
  engine.paused = true;
  input.enabled = false;
  blockMenu(true);
  audio.sfx('ui_open');
  const body = h('div', { class: 'soc-body' });
  const closeBtn = h('button', { class: 'lx-panel-close', 'aria-label': 'Cerrar' }, '×');
  const box = h('div', { class: `lx-panel soc-window ${opts.className ?? ''}` },
    h('div', { class: 'lx-panel-title soc-title' },
      opts.icon ? h('span', { class: 'soc-title-icon', html: opts.icon }) : null,
      h('div', { class: 'soc-title-txt' }, h('span', null, opts.title), opts.subtitle ? h('span', { class: 'soc-subtitle' }, opts.subtitle) : null),
      h('div', { class: 'soc-title-right' }, opts.headerRight ?? null),
      closeBtn),
    body);
  const root = h('div', { class: 'soc-overlay' }, box);
  const close = () => {
    if (!open) return;
    open = false;
    window.removeEventListener('keydown', onKey, true);
    hideTooltip();
    audio.sfx('ui_close');
    engine.paused = prevPaused;
    input.enabled = prevInput;
    blockMenu(false);
    void removeAnimated(root, 'lx-out', 220).then(() => resolveClosed());
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.code !== 'Escape') return;
    if (document.querySelector('.lx-modal-back') || root.querySelector('.soc-sub')) return;
    e.preventDefault();
    e.stopPropagation();
    close();
  };
  window.addEventListener('keydown', onKey, true);
  closeBtn.addEventListener('click', close);
  root.addEventListener('pointerdown', (e) => { if (e.target === root) close(); });
  layer('panel').appendChild(root);
  return { root, box, body, close, closed, isOpen: () => open };
}

/** Resource chip with an icon (updates in place with .set()). */
export function resChip(icon: string, value: string | number, tip?: string, cls = ''): HTMLElement & { set?: (v: string | number) => void } {
  const val = h('span', { class: 'soc-chip-val' }, String(value));
  const el = h('span', { class: `lx-chip soc-chip ${cls}`, 'data-tip': tip }, h('span', { class: 'soc-chip-icon', html: icon }), val) as HTMLElement & { set?: (v: string | number) => void };
  el.set = (v) => {
    if (val.textContent !== String(v)) {
      val.textContent = String(v);
      el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
    }
  };
  return el;
}

/** A speech bubble next to a portrait. */
export function bubble(text: string): HTMLElement {
  return h('div', { class: 'soc-bubble' }, text);
}
export function setBubble(el: HTMLElement, text: string): void {
  el.textContent = text;
  el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
}
