/** Reusable UI widgets: buttons, panels, bars, modals, tabs, global tooltip. */
import { h, layer, type Child, removeAnimated } from './dom';
import { audio } from '../audio';

export interface ButtonOpts { kind?: 'primary' | 'danger' | 'ghost'; small?: boolean; big?: boolean; disabled?: boolean; tip?: string; hotkey?: string; icon?: string; className?: string; silent?: boolean }

export function button(label: Child, onClick: (ev: MouseEvent) => void, opts: ButtonOpts = {}): HTMLButtonElement {
  const cls = ['lx-btn', opts.kind ?? '', opts.small ? 'small' : '', opts.big ? 'big' : '', opts.className ?? ''].filter(Boolean).join(' ');
  const b = h('button', { class: cls, 'data-tip': opts.tip, disabled: opts.disabled },
    opts.icon ? h('span', { html: opts.icon, style: 'display:inline-flex' }) : null,
    h('span', null, label),
    opts.hotkey ? h('span', { class: 'lx-kbd' }, opts.hotkey) : null,
  );
  b.addEventListener('click', (e) => {
    if (b.disabled) return;
    if (!opts.silent) audio.sfx('ui_click');
    onClick(e);
  });
  b.addEventListener('mouseenter', () => { if (!b.disabled) audio.sfx('ui_hover', { volume: 0.35 }); });
  return b;
}

export interface PanelOpts { title?: Child; className?: string; onClose?: () => void; style?: string; icon?: string }
export function panel(opts: PanelOpts, ...children: Child[]): HTMLElement {
  return h('div', { class: `lx-panel ${opts.className ?? ''}`, style: opts.style },
    opts.title !== undefined ? h('div', { class: 'lx-panel-title' },
      opts.icon ? h('span', { html: opts.icon, style: 'display:inline-flex;width:22px;height:22px' }) : null,
      h('span', null, opts.title),
      opts.onClose ? h('button', { class: 'lx-panel-close', onclick: () => { audio.sfx('ui_close'); opts.onClose!(); }, 'aria-label': 'Cerrar' }, '×') : null,
    ) : null,
    ...children,
  );
}

export interface BarHandle { el: HTMLElement; set(value: number, max?: number, label?: string): void }
export function bar(value: number, max: number, opts: { color?: string; label?: string; height?: number; ghost?: boolean } = {}): BarHandle {
  const fill = h('div', { class: 'lx-bar-fill' });
  const ghost = opts.ghost ? h('div', { class: 'lx-bar-ghost' }) : null;
  const label = h('div', { class: 'lx-bar-label' }, opts.label ?? '');
  const el = h('div', { class: 'lx-bar', style: `--bar:${opts.color ?? 'var(--violet)'};${opts.height ? `height:${opts.height}px` : ''}` }, ghost, fill, label);
  let m = max;
  const handle: BarHandle = {
    el,
    set(v: number, mx?: number, lbl?: string) {
      if (mx !== undefined) m = mx;
      const t = Math.max(0, Math.min(1, m > 0 ? v / m : 0));
      fill.style.transform = `scaleX(${t})`;
      if (ghost) ghost.style.transform = `scaleX(${t})`;
      if (lbl !== undefined) label.textContent = lbl;
    },
  };
  handle.set(value, max);
  return handle;
}

export interface ModalAction { label: Child; value: string; kind?: 'primary' | 'danger' | 'ghost'; disabled?: boolean; hotkey?: string }
export interface ModalOpts { title?: Child; body: Child; actions?: ModalAction[]; dismissable?: boolean; wide?: boolean; className?: string; onOpen?: (root: HTMLElement, close: (v: string | null) => void) => void }

/** Close functions of every modal currently open (so a scene change can dismiss them). */
const openModals = new Set<(v: string | null) => void>();

/** Dismisses every open modal (resolving them with null). Called by the engine on scene changes. */
export function closeAllModals(): void {
  for (const close of [...openModals]) close(null);
}

/** Opens a modal and resolves with the chosen action value (or null when dismissed). */
export function modal(opts: ModalOpts): Promise<string | null> {
  return new Promise((resolve) => {
    audio.sfx('ui_open');
    let done = false;
    const close = (v: string | null) => {
      if (done) return;
      done = true;
      openModals.delete(close);
      window.removeEventListener('keydown', onKey, true);
      void removeAnimated(back, 'lx-out', 200);
      resolve(v);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape' && opts.dismissable !== false) { e.stopPropagation(); close(null); }
      const hk = opts.actions?.find((a) => a.hotkey && (e.key.toLowerCase() === a.hotkey.toLowerCase()));
      if (hk && !hk.disabled) { e.stopPropagation(); close(hk.value); }
    };
    window.addEventListener('keydown', onKey, true);
    const box = h('div', { class: `lx-panel lx-modal ${opts.wide ? 'wide' : ''} ${opts.className ?? ''}` },
      opts.title !== undefined ? h('div', { class: 'lx-panel-title' }, h('span', null, opts.title),
        opts.dismissable !== false ? h('button', { class: 'lx-panel-close', onclick: () => close(null) }, '×') : null) : null,
      h('div', { class: 'lx-modal-body' }, opts.body),
      opts.actions?.length ? h('div', { class: 'lx-modal-actions' },
        opts.actions.map((a) => button(a.label, () => close(a.value), { kind: a.kind, disabled: a.disabled, hotkey: a.hotkey }))) : null,
    );
    const back = h('div', { class: 'lx-modal-back' }, box);
    back.addEventListener('pointerdown', (e) => { if (e.target === back && opts.dismissable !== false) close(null); });
    layer('modal').appendChild(back);
    openModals.add(close);
    opts.onOpen?.(box, close);
  });
}

export async function confirmModal(title: string, text: Child, yes = 'Sí', no = 'No', danger = false): Promise<boolean> {
  const v = await modal({ title, body: h('div', null, text), actions: [
    { label: no, value: 'no', kind: 'ghost' },
    { label: yes, value: 'yes', kind: danger ? 'danger' : 'primary' },
  ] });
  return v === 'yes';
}

export interface TabDef { id: string; label: Child; render: () => Child }
export function tabs(defs: TabDef[], initial?: string, onChange?: (id: string) => void): HTMLElement {
  const head = h('div', { class: 'lx-tabs-head' });
  const body = h('div', { class: 'lx-tabs-body' });
  const root = h('div', { class: 'lx-tabs' }, head, body);
  const show = (id: string) => {
    for (const t of head.children) (t as HTMLElement).classList.toggle('active', (t as HTMLElement).dataset.id === id);
    body.innerHTML = '';
    const def = defs.find((d) => d.id === id) ?? defs[0];
    const c = def.render();
    if (c instanceof Node) body.appendChild(c); else if (c !== null && c !== undefined && c !== false) body.append(String(c));
    onChange?.(id);
  };
  for (const d of defs) {
    head.appendChild(h('div', { class: 'lx-tab', 'data-id': d.id, onclick: () => { audio.sfx('ui_tab'); show(d.id); } }, d.label));
  }
  show(initial ?? defs[0].id);
  return root;
}

// ───────────── global tooltip for [data-tip] ─────────────
let tipEl: HTMLElement | null = null;
export function initTooltips(): void {
  tipEl = h('div', { class: 'lx-tooltip' });
  layer('tooltip').appendChild(tipEl);
  let current: HTMLElement | null = null;
  document.addEventListener('pointerover', (e) => {
    const t = (e.target as HTMLElement | null)?.closest?.('[data-tip]') as HTMLElement | null;
    if (t === current) return;
    current = t;
    if (!t || !tipEl) { tipEl?.classList.remove('show'); return; }
    const txt = t.getAttribute('data-tip') ?? '';
    if (!txt) { tipEl.classList.remove('show'); return; }
    tipEl.innerHTML = txt;
    tipEl.classList.add('show');
  });
  document.addEventListener('pointermove', (e) => {
    if (!tipEl || !tipEl.classList.contains('show')) return;
    const pad = 16;
    const r = tipEl.getBoundingClientRect();
    let x = e.clientX + pad, y = e.clientY + pad;
    if (x + r.width > window.innerWidth - 8) x = e.clientX - r.width - pad;
    if (y + r.height > window.innerHeight - 8) y = e.clientY - r.height - pad;
    tipEl.style.transform = `translate(${x}px, ${y}px)`;
  });
  document.addEventListener('pointerdown', () => tipEl?.classList.remove('show'));
}
export function hideTooltip(): void { tipEl?.classList.remove('show'); }
