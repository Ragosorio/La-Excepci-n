/**
 * Páginas del Libro: awarding (first visits to special places, ruin victories), the ivory page reveal,
 * and the collection viewer. Stored all-time in G.meta.pages.
 */
import { PAGES, PAGE_BY_ID } from '../../data/pages';
import type { LorePage } from '../../data/types';
import { G } from '../../core/state';
import { saveMeta } from '../../core/save';
import { bus } from '../../core/events';
import { engine } from '../../core/engine';
import { h, layer } from '../../ui/dom';
import { toast } from '../../ui/toasts';
import { audio } from '../../audio';
import { glyph } from './glyphs';
import { st, hasRunState } from './state';

declare module '../../core/events' {
  interface GameEvents {
    /** story → anyone: a lore page was found. */
    'story:page': { id: string };
  }
}

export function pageFound(id: string): boolean { return !!G.meta?.pages.includes(id); }

function cycleNow(): number { return G.run?.cycle ?? G.meta?.currentCycle ?? 1; }

export function pageCompletion(): { found: number; total: number } {
  return { found: G.meta?.pages.filter((id) => PAGE_BY_ID[id]).length ?? 0, total: PAGES.length };
}

/** Not-yet-found pages available this cycle; with `where`, only pages tied to that place. */
export function availablePages(where?: string): LorePage[] {
  const c = cycleNow();
  return PAGES.filter((p) => !pageFound(p.id) && (p.minCycle ?? 1) <= c && (where ? p.where === where : true));
}

const revealQueue: LorePage[] = [];
let revealing = false;

/**
 * Award a page. Priority: explicit id → a page tied to `where` → (unless onlyWhere) a random 'random' page.
 * Shows the reveal (deferred if a battle owns the screen). Returns the page or null.
 */
export function awardPage(opts: { id?: string; where?: string; onlyWhere?: boolean; reveal?: boolean } = {}): LorePage | null {
  if (!G.meta) return null;
  let page: LorePage | undefined;
  if (opts.id && !pageFound(opts.id)) page = PAGE_BY_ID[opts.id];
  if (!page && opts.where) page = availablePages(opts.where)[0];
  if (!page && !opts.onlyWhere) {
    const pool = availablePages().filter((p) => p.where === 'random' || !p.where);
    const any = pool.length ? pool : availablePages();
    page = any[Math.floor(Math.random() * any.length)];
  }
  if (!page) return null;
  G.meta.pages.push(page.id);
  if (hasRunState()) st().pagesFound.push(page.id);
  saveMeta();
  bus.emit('story:page', { id: page.id });
  if (opts.reveal !== false) {
    revealQueue.push(page);
    void drainReveals();
  }
  return page;
}

async function drainReveals(): Promise<void> {
  if (revealing) return;
  revealing = true;
  try {
    while (revealQueue.length) {
      // a battle (or a cutscene) owns the screen: wait for the world
      while (engine.sceneId === 'battle' || engine.sceneId === 'prologue' || engine.sceneId === 'ending') {
        await new Promise<void>((r) => { const off = bus.on('scene:enter', () => { off(); r(); }); });
        await new Promise((r) => setTimeout(r, 1800));
      }
      const page = revealQueue.shift()!;
      const { found, total } = pageCompletion();
      toast(`Página del Libro: <b>${page.title}</b> · ${found}/${total}`, { kind: 'gold', icon: glyph('book', 20, '#f5d99a') });
      await pageReveal(page, { kicker: 'Página del Libro', foot: `${found} de ${total}` });
    }
  } finally {
    revealing = false;
  }
}

/** The ivory page. Click / Esc / Space closes. */
export function pageReveal(page: LorePage, opts: { kicker?: string; foot?: string } = {}): Promise<void> {
  return new Promise((resolve) => {
    audio.sfx('page_turn', { volume: 0.9 });
    const paras = page.text.split(/\n\n+/).map((t) => h('p', null, t));
    const card = h('div', { class: 'st-page', onclick: (e: Event) => e.stopPropagation() },
      h('div', { class: 'st-page-kicker' }, opts.kicker ?? 'Página del Libro'),
      h('div', { class: 'st-page-title' }, page.title),
      h('div', { class: 'st-page-orn' }, '— ◯ —'),
      h('div', { class: 'st-page-text' }, ...paras),
      h('div', { class: 'st-page-foot' }, h('span', null, opts.foot ?? ''), h('span', null, 'Clic para cerrar')));
    const back = h('div', { class: 'st-pageback', onclick: () => close() }, card);
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape' || e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); e.stopPropagation(); close(); }
    };
    let done = false;
    const close = () => {
      if (done) return;
      done = true;
      window.removeEventListener('keydown', onKey, true);
      audio.sfx('page_turn', { volume: 0.5, pitch: 1.2 });
      back.style.transition = 'opacity .35s ease';
      back.style.opacity = '0';
      setTimeout(() => { back.remove(); resolve(); }, 360);
    };
    window.addEventListener('keydown', onKey, true);
    layer('modal').appendChild(back);
  });
}

/** Collection viewer (Libro). Found pages open the reveal; missing ones show as "???". */
export function openBook(): Promise<void> {
  return new Promise((resolve) => {
    const render = () => {
      grid.innerHTML = '';
      const c = cycleNow();
      for (const p of PAGES) {
        const have = pageFound(p.id);
        const later = (p.minCycle ?? 1) > Math.max(c, (G.meta?.cyclesCompleted ?? 0) + 1);
        const card = h('div', { class: `st-book-card ${have ? '' : 'locked'}`, 'data-tip': have ? '' : later ? 'Todavía no. Vuelve más tarde. Mucho más tarde.' : '' },
          h('div', { class: 'nm' }, have ? p.title : '? ? ?'),
          have ? h('div', { class: 'sn' }, p.text.split('\n')[0]) : null);
        if (have) card.addEventListener('click', () => { void pageReveal(p, { kicker: 'Página del Libro' }); });
        grid.appendChild(card);
      }
    };
    const { found, total } = pageCompletion();
    const grid = h('div', { class: 'st-book-grid' });
    const close = () => { back.remove(); window.removeEventListener('keydown', onKey, true); resolve(); };
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape' && !document.querySelector('.st-pageback')) { e.preventDefault(); e.stopPropagation(); close(); }
    };
    const box = h('div', { class: 'lx-panel st-book', onclick: (e: Event) => e.stopPropagation() },
      h('div', { class: 'st-book-head' },
        h('div', { class: 't' }, 'El Libro'),
        h('div', { class: 'p' }, `${found} de ${total} páginas · ${Math.round((found / Math.max(1, total)) * 100)}%`),
        h('button', { class: 'st-panel-x x', onclick: close }, '×')),
      grid);
    const back = h('div', { class: 'st-overlay', onclick: close }, box);
    render();
    window.addEventListener('keydown', onKey, true);
    layer('modal').appendChild(back);
    audio.sfx('page_turn', { volume: 0.6 });
  });
}

export function initPages(): void {
  bus.on('location:enter', ({ id }) => {
    if (!G.run) return;
    // first visit to a place with its own page
    if (availablePages(id).length) setTimeout(() => awardPage({ where: id, onlyWhere: true }), 2200);
  });
  bus.on('battle:end', ({ setup, result }) => {
    if (setup.kind === 'ruina' && result.victory) awardPage({ where: setup.locationId });
  });
}
