/**
 * Hazañas: unlock + Tinta reward + toast, declarative checks (data/achievements `when`) and code checks.
 * Stored all-time in G.meta.achievements.
 */
import { ACHIEVEMENTS, ACHIEVEMENT_BY_ID, type StoryAchievement } from '../../data/achievements';
import { G } from '../../core/state';
import { saveMeta } from '../../core/save';
import { bus } from '../../core/events';
import { h, layer, wait } from '../../ui/dom';
import { audio } from '../../audio';
import { glyph } from './glyphs';
import { st, corruptedCount, ownsRelic, hasRunState } from './state';
import { RELICS } from '../../data/relics';

declare module '../../core/events' {
  interface GameEvents {
    /** story → anyone: a hazaña was unlocked. */
    'story:achievement': { id: string; ink: number };
  }
}

const toastQueue: StoryAchievement[] = [];
let showing = false;

export function hasAchievement(id: string): boolean { return !!G.meta?.achievements.includes(id); }

/** Unlocks a hazaña (idempotent). Grants its Tinta immediately. */
export function unlockAchievement(id: string): boolean {
  const def = ACHIEVEMENT_BY_ID[id];
  if (!def || !G.meta || hasAchievement(id)) return false;
  G.meta.achievements.push(id);
  G.meta.ink += def.ink;
  G.meta.inkTotal += def.ink;
  if (hasRunState()) st().achThisRun.push(id);
  saveMeta();
  bus.emit('story:achievement', { id, ink: def.ink });
  toastQueue.push(def);
  if (!showing) void drainToasts();
  return true;
}

async function drainToasts(): Promise<void> {
  showing = true;
  while (toastQueue.length) {
    const def = toastQueue.shift()!;
    const el = h('div', { class: 'st-achtoast' },
      h('div', { class: 'gl', html: glyph(def.glyph ?? 'eclipse', 24) }),
      h('div', null, h('div', { class: 'k' }, 'Hazaña'), h('div', { class: 'n' }, def.name), h('div', { class: 'd' }, def.desc)),
      h('div', { class: 'ink', html: `+${def.ink} ${glyph('ink', 14, '#c7a2ff')}` }));
    layer('toast').appendChild(el);
    audio.sfx('level_up', { volume: 0.55, pitch: 1.1 });
    await wait(40);
    el.classList.add('in');
    await wait(3600);
    el.classList.remove('in');
    el.classList.add('out');
    await wait(450);
    el.remove();
    await wait(200);
  }
  showing = false;
}

function condMet(a: StoryAchievement): boolean {
  const w = a.when;
  if (!w || !G.meta) return false;
  if (w.stat) {
    const v = w.scope === 'run' ? G.run?.stats[w.stat] ?? 0 : G.meta.stats[w.stat] ?? 0;
    return v >= w.gte;
  }
  if (w.record) return (G.meta.records[w.record] ?? 0) >= w.gte;
  if (w.meta === 'cyclesCompleted') return G.meta.cyclesCompleted >= w.gte;
  if (w.meta === 'currentCycle') return G.meta.currentCycle >= w.gte;
  if (w.meta === 'pages') return G.meta.pages.length >= w.gte;
  return false;
}

/** Evaluate every condition-based and state-based hazaña. Cheap; called by the story watcher. */
export function checkAchievements(): void {
  if (!G.meta) return;
  for (const a of ACHIEVEMENTS) if (a.when && !hasAchievement(a.id) && condMet(a)) unlockAchievement(a.id);
  if (!hasRunState()) return;
  const p = G.run.player;
  if (p.army.length >= 1) unlockAchievement('primer_siervo');
  if (p.army.length >= 25) unlockAchievement('legion');
  if (p.gold >= 10000) unlockAchievement('tesorero');
  if (p.debt > 5000) unlockAchievement('tinta_roja');
  if (p.relics.length >= 10) unlockAchievement('relicario');
  if (p.relics.some((r) => RELICS[r.id]?.rarity === 'mitica')) unlockAchievement('mitico');
  const cc = corruptedCount();
  if (cc >= 1) unlockAchievement('primera_caida');
  if (cc >= 5) unlockAchievement('cinco_de_cinco');
  if (ownsRelic('eclipse')) unlockAchievement('eclipse');
  if ((ownsRelic('libro_realidad') || p.books.realidad) && (ownsRelic('libro_aprendizaje') || p.books.aprendizaje)) unlockAchievement('lectura_prohibida');
  if (st().councilSessions >= 3) unlockAchievement('mesa_de_cinco');
}

export function achievementCompletion(): { got: number; total: number } {
  return { got: G.meta?.achievements.filter((id) => ACHIEVEMENT_BY_ID[id]).length ?? 0, total: ACHIEVEMENTS.length };
}

/** Hazañas list (title / margins). */
export function openAchievements(): Promise<void> {
  return new Promise((resolve) => {
    const { got, total } = achievementCompletion();
    const close = () => { back.remove(); window.removeEventListener('keydown', onKey, true); resolve(); };
    const onKey = (e: KeyboardEvent) => { if (e.code === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } };
    const grid = h('div', { class: 'st-achgrid' });
    for (const a of ACHIEVEMENTS) {
      const have = hasAchievement(a.id);
      const hidden = a.secret && !have;
      grid.appendChild(h('div', { class: `st-achcard ${have ? '' : 'locked'}` },
        h('div', { class: 'gl', html: glyph(hidden ? 'lock' : a.glyph ?? 'eclipse', 20) }),
        h('div', null, h('div', { class: 'n' }, hidden ? '???' : a.name), h('div', { class: 'd' }, hidden ? 'Una hazaña secreta.' : a.desc)),
        h('div', { class: 'i', html: `${a.ink} ${glyph('ink', 11, '#c7a2ff')}` })));
    }
    const box = h('div', { class: 'lx-panel st-achlist', onclick: (e: Event) => e.stopPropagation() },
      h('div', { class: 'st-book-head' },
        h('div', { class: 't' }, 'Hazañas'),
        h('div', { class: 'p' }, `${got} de ${total}`),
        h('button', { class: 'st-panel-x x', onclick: close }, '×')),
      grid);
    const back = h('div', { class: 'st-overlay', onclick: close }, box);
    window.addEventListener('keydown', onKey, true);
    layer('modal').appendChild(back);
    audio.sfx('ui_open');
  });
}
