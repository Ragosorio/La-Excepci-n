/**
 * Tiny DOM helpers. h('div', { class: 'x', onclick: fn, html: svgString, 'data-tip': 'hola' }, child1, 'text')
 * Layers live in #ui-root, ordered by z-index (see theme.css).
 */
export type Child = Node | string | number | null | undefined | false | Child[];
export type Props = Record<string, unknown> & {
  class?: string;
  style?: string | Partial<CSSStyleDeclaration>;
  html?: string;
};

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props?: Props | null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = String(v);
      else if (k === 'style') {
        if (typeof v === 'string') el.setAttribute('style', v);
        else Object.assign(el.style, v);
      } else if (k === 'html') el.innerHTML = String(v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
      else if (k === 'value' && 'value' in el) (el as HTMLInputElement).value = String(v);
      else if (k === 'checked' && 'checked' in el) (el as HTMLInputElement).checked = !!v;
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    }
  }
  append(el, children);
  return el;
}

export function append(parent: Node, children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(parent, c);
    else if (c instanceof Node) parent.appendChild(c);
    else parent.appendChild(document.createTextNode(String(c)));
  }
}

/** Parse an SVG/HTML string into a single element. */
export function frag(html: string): HTMLElement {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild as HTMLElement;
}

export function clear(el: Element): void { while (el.firstChild) el.removeChild(el.firstChild); }
export const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel);
export const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll<T>(sel)];

export type LayerName = 'world' | 'hud' | 'panel' | 'dialogue' | 'modal' | 'cutin' | 'narrator' | 'toast' | 'fade' | 'tooltip' | 'debug';
const LAYERS: LayerName[] = ['world', 'hud', 'panel', 'dialogue', 'modal', 'cutin', 'narrator', 'toast', 'fade', 'tooltip', 'debug'];
const layerEls = new Map<LayerName, HTMLElement>();

export function initLayers(root: HTMLElement): void {
  for (const name of LAYERS) {
    const el = h('div', { class: `lx-layer lx-layer-${name}`, 'data-layer': name });
    root.appendChild(el);
    layerEls.set(name, el);
  }
}

export function layer(name: LayerName): HTMLElement {
  const el = layerEls.get(name);
  if (!el) throw new Error(`UI layer ${name} not initialized`);
  return el;
}

/** Remove an element after an exit animation class is applied. */
export function removeAnimated(el: HTMLElement, cls = 'lx-out', ms = 260): Promise<void> {
  return new Promise((resolve) => {
    el.classList.add(cls);
    setTimeout(() => { el.remove(); resolve(); }, ms);
  });
}

export const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
export const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

/** Escape text for innerHTML templates. */
export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
