/**
 * Relic inventory: the three great relics tracker, equipped slots, collection grid and a detail page
 * (floating art, lore, effects, forge level, equip toggle, and "open" for the two books).
 */
import type { RelicDef, RelicInstance } from '../../data/types';
import { h, clear } from '../../ui/dom';
import { G } from '../../core/state';
import { bus } from '../../core/events';
import { audio } from '../../audio';
import { toast } from '../../ui/toasts';
import { RELICS, PASSIVE_INFO } from '../../data/relics';
import { RACES } from '../../data/races';
import { LOCATIONS } from '../../data/world';
import { ABILITIES } from '../../data/abilities';
import { RARITY_INFO, RARITY_ORDER, SCHOOL_INFO, STAT_INFO } from '../../data/schools';
import { PS } from './pstate';
import { equipCapacity, equipRelic, equippedRelics, isEquipped, levelMult, relicInstances, unequipRelic, MAX_RELIC_LEVEL } from './relics';
import { abilityIcon, icon, relicArt } from './art';
import { burst, getOpen, header, openOverlay, recentlyClosed, seg, type Overlay } from './pgui';

type Filter = 'todas' | 'equipadas' | 'guardadas';
const ui = { sel: null as string | null, filter: 'todas' as Filter };
let ov: Overlay | null = null;
let offs: Array<() => void> = [];
let rerender: () => void = () => undefined;

const MAJORS: Array<{ id: string; hint: string }> = [
  { id: 'daga_solar', hint: 'Templo del Alba' },
  { id: 'daga_lunar', hint: 'Mina de la Luna Caída' },
  { id: 'eclipse', hint: 'Funde las dagas en la Forja Primigenia' },
  { id: 'libro_realidad', hint: 'La Bóveda de Tiburcio' },
  { id: 'libro_aprendizaje', hint: 'Biblioteca Prohibida de Altamira' },
];

export function openRelicsUI(): void {
  if (!G.run) return;
  if (getOpen('relics')) { rerender(); return; }
  if (recentlyClosed('relics')) return;
  const countEl = h('span', { class: 'pg-chip gold' });
  const grid = h('div', { class: 'pg-scroll' });
  const detail = h('div', { class: 'pg-detail' });
  const top = h('div', { class: 'pg-relic-top' });
  ov = openOverlay({ key: 'relics', hotkeys: ['KeyI'], onClose: () => { offs.forEach((f) => f()); offs = []; ov = null; } },
    header('RELIQUIAS', 'Objetos que el mundo olvidó que tenía.', () => ov?.close(), countEl),
    h('div', { class: 'pg-body' }, h('div', { class: 'pg-col' }, h('div', { class: 'pg-left' }, top, grid), detail)));
  rerender = () => {
    const eq = equippedRelics().length, cap = equipCapacity();
    countEl.textContent = `Equipadas ${eq}/${cap}`;
    renderTop(top);
    renderGrid(grid, detail);
  };
  offs.push(bus.on('relic:gained', () => rerender()), bus.on('relics:equip', () => rerender()), bus.on('relic:lost', () => rerender()), bus.on('relic:upgraded', () => rerender()));
  rerender();
}

function renderTop(top: HTMLElement): void {
  clear(top);
  const eq = equippedRelics();
  const cap = equipCapacity();
  const slots = h('div', { class: 'pg-equipped' });
  for (let i = 0; i < cap; i++) {
    const r = eq[i];
    const d = r ? RELICS[r.id] : null;
    const s = h('div', { class: `pg-eslot ${d ? 'filled' : ''}`, 'data-tip': d ? `<b>${d.name}</b>\n${d.effectText}\n<i>Clic para quitar</i>` : 'Ranura libre' },
      d ? h('span', { html: relicArt(d, 68, false) }) : h('span', { class: 'pg-eslot-plus', html: icon('mas', { size: 22, color: '#6d5f80' }) }),
      r && r.level ? h('span', { class: 'pg-lvl' }, `+${r.level}`) : null);
    if (r) s.addEventListener('click', () => { unequipRelic(r.uid); audio.sfx('ui_close'); });
    slots.appendChild(s);
  }
  top.append(slots,
    h('div', { style: 'margin-left:auto;display:flex;gap:8px;align-items:center' },
      seg<Filter>([['todas', 'Todas'], ['equipadas', 'Equipadas'], ['guardadas', 'Guardadas']], ui.filter, (v) => { ui.filter = v; rerender(); })));
}

function majorsRow(): HTMLElement {
  const row = h('div', { class: 'pg-grid', style: 'grid-template-columns:repeat(5,minmax(0,1fr))' });
  for (const m of MAJORS) {
    const d = RELICS[m.id];
    const owned = relicInstances().some((r) => r.id === m.id);
    const consumed = !owned && (m.id === 'daga_solar' || m.id === 'daga_lunar') && relicInstances().some((r) => r.id === 'eclipse');
    row.appendChild(h('div', { class: `pg-card ${owned || consumed ? '' : 'locked'}`, style: `--rc:${RARITY_INFO.mitica.color}`, 'data-tip': `<b>${owned || consumed ? d.name : '???'}</b>\n${owned ? d.effectText : consumed ? 'Ahora es parte de Eclipse.' : m.hint}` },
      owned || consumed
        ? h('div', { html: relicArt(d, 64, owned), style: consumed ? 'opacity:.45;filter:grayscale(.6)' : '' })
        : h('div', { class: 'pg-major-lock' }, h('span', { html: icon('candado', { size: 22, color: '#8a7aa0' }) })),
      h('div', { class: 'pg-card-name', style: owned ? `color:${RARITY_INFO.mitica.color}` : '' }, owned || consumed ? d.name.replace(/, la Daga (Solar|Lunar)/, '') : m.hint)));
  }
  return h('div', { class: 'pg-group' }, h('div', { class: 'pg-group-head' }, h('span', { html: icon('eclipse', { size: 18 }) }), 'Las Tres Reliquias Mayores',
    h('span', { class: 'pg-group-count' }, `${MAJORS.filter((m) => relicInstances().some((r) => r.id === m.id)).length}/${MAJORS.length}`)), row);
}

function renderGrid(grid: HTMLElement, detail: HTMLElement): void {
  clear(grid);
  grid.appendChild(majorsRow());
  let list = relicInstances().filter((r) => RELICS[r.id]);
  if (ui.filter === 'equipadas') list = list.filter((r) => isEquipped(r.uid));
  if (ui.filter === 'guardadas') list = list.filter((r) => !isEquipped(r.uid));
  list.sort((a, b) => Number(isEquipped(b.uid)) - Number(isEquipped(a.uid)) || RARITY_ORDER.indexOf(RELICS[b.id].rarity) - RARITY_ORDER.indexOf(RELICS[a.id].rarity) || RELICS[a.id].name.localeCompare(RELICS[b.id].name, 'es'));
  const box = h('div', { class: 'pg-relic-grid' });
  const s = PS();
  list.forEach((r, i) => {
    const d = RELICS[r.id];
    const card = h('div', { class: `pg-relic ${isEquipped(r.uid) ? 'eq' : ''} ${ui.sel === r.uid ? 'sel' : ''}`, style: `--rc:${RARITY_INFO[d.rarity].color};animation-delay:${Math.min(i * 18, 300)}ms`, 'data-tip': `<b>${d.name}</b>\n${d.effectText}` },
      h('span', { html: relicArt(d, 104) }),
      h('div', { class: 'pg-relic-name' }, d.name),
      r.level ? h('span', { class: 'pg-lvl' }, `+${r.level}`) : null,
      s.newRelics.includes(r.uid) ? h('div', { class: 'pg-card-new', style: 'top:28px' }, 'NUEVA') : null);
    card.addEventListener('click', () => { audio.sfx('ui_click', { volume: 0.6 }); ui.sel = r.uid; s.newRelics = s.newRelics.filter((u) => u !== r.uid); rerender(); });
    card.addEventListener('dblclick', () => toggleEquip(r, card));
    box.appendChild(card);
  });
  grid.appendChild(h('div', { class: 'pg-group' }, h('div', { class: 'pg-group-head' }, h('span', { html: icon('cofre', { size: 18 }) }), 'Tu colección', h('span', { class: 'pg-group-count' }, `${list.length}`)),
    list.length ? box : h('div', { class: 'pg-empty-note' }, 'Nada. Las reliquias esperan en ruinas, casinos y bolsillos ajenos.')));
  const sel = list.find((r) => r.uid === ui.sel) ?? relicInstances().find((r) => r.uid === ui.sel);
  renderDetail(detail, sel ?? null);
}

function toggleEquip(r: RelicInstance, fx?: HTMLElement): void {
  const d = RELICS[r.id];
  if (isEquipped(r.uid)) { unequipRelic(r.uid); audio.sfx('ui_close'); return; }
  if (equippedRelics().some((x) => x.id === r.id)) { toast('Ya llevas una igual.', { kind: 'bad', sound: true }); return; }
  if (!equipRelic(r.uid)) { toast(`No te caben más reliquias (${equipCapacity()}). Quita una primero.`, { kind: 'bad', sound: true }); return; }
  audio.sfx(d.rarity === 'mitica' || d.rarity === 'legendaria' ? 'loot_epic' : 'buff');
  if (fx) burst(fx, RARITY_INFO[d.rarity].color, 18, 70);
}

function passiveLines(d: RelicDef, level: number): HTMLElement[] {
  const out: HTMLElement[] = [];
  const k = levelMult(level);
  const pct = (v: number) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}%`;
  for (const [s, v] of Object.entries(d.stats ?? {})) out.push(h('div', null, h('span', null, STAT_INFO[s as keyof typeof STAT_INFO]?.name ?? s), h('b', null, pct((v ?? 0) * k))));
  for (const [s, v] of Object.entries(d.schoolBoost ?? {})) out.push(h('div', null, h('span', null, `Daño de ${SCHOOL_INFO[s as keyof typeof SCHOOL_INFO]?.name ?? s}`), h('b', null, pct((v ?? 0) * k))));
  for (const [key, v] of Object.entries(d.passives ?? {})) {
    const info = PASSIVE_INFO[key] ?? (key.startsWith('resist_') ? { name: `Resistencia a ${key.slice(7)}`, pct: true } : { name: key, pct: false });
    const flag = ['reveal_relics', 'reveal_weakness', 'reveal_invisible', 'disguise', 'armor_pierce'].includes(key);
    const scaled = ['reroll', 'retorno_extra', 'free_rewrite', 'equip_cap'].includes(key) || flag ? v : v * k;
    out.push(h('div', null, h('span', null, info.name), h('b', { style: info.good === 'low' ? 'color:var(--good)' : '' }, flag ? 'Sí' : info.pct ? pct(scaled) : `+${+scaled.toFixed(2)}`)));
  }
  return out;
}

function renderDetail(box: HTMLElement, r: RelicInstance | null): void {
  clear(box);
  if (!r) {
    box.appendChild(h('div', { class: 'pg-detail-empty' }, 'Elige una reliquia. Doble clic para equiparla o quitarla.'));
    return;
  }
  const d = RELICS[r.id];
  const rc = RARITY_INFO[d.rarity].color;
  const equipped = isEquipped(r.uid);
  const art = h('div', { class: 'pg-relic-art', html: relicArt(d, 190) });
  box.append(art,
    h('div', { class: 'pg-detail-name', style: `color:${rc};text-align:center;margin-top:6px` }, d.name, r.level ? h('span', { class: 'pg-lvl', style: 'margin-left:8px;vertical-align:middle' }, `+${r.level}`) : null),
    h('div', { class: 'pg-detail-meta', style: 'justify-content:center' },
      h('span', { class: 'pg-tag', style: `color:${rc};border-color:${rc}66` }, RARITY_INFO[d.rarity].name),
      d.major ? h('span', { class: 'pg-tag', style: 'color:var(--r-mitica)' }, 'Reliquia Mayor') : d.unique ? h('span', { class: 'pg-tag' }, 'Única') : null,
      h('span', { class: 'pg-tag' }, `Forja ${r.level}/${MAX_RELIC_LEVEL}`)),
    h('div', { class: 'pg-lore' }, d.lore),
    h('div', { class: 'pg-desc', style: 'text-align:center' }, d.effectText));
  const lines = passiveLines(d, r.level);
  if (lines.length) box.appendChild(h('div', { class: 'pg-section' }, h('div', { class: 'pg-section-title' }, r.level ? `Efectos (+${Math.round((levelMult(r.level) - 1) * 100)}% por la forja)` : 'Efectos'), h('div', { class: 'pg-stats', style: 'grid-template-columns:1fr' }, ...lines)));
  if (d.grants && ABILITIES[d.grants]) {
    const a = ABILITIES[d.grants];
    box.appendChild(h('div', { class: 'pg-section' }, h('div', { class: 'pg-section-title' }, 'Concede (ranuras Q / E)'),
      h('div', { class: 'pg-passive' }, h('span', { html: abilityIcon(a, 40) }), h('div', null, h('b', null, a.name), h('div', { class: 'lx-muted' }, a.desc)))));
  }
  const aff = d.affinity === 'any' ? 'Cualquiera' : d.affinity.map((x) => RACES[x]?.plural ?? x).join(', ');
  box.appendChild(h('div', { class: 'lx-small lx-muted', style: 'margin-top:12px' },
    `Afinidad: ${aff}. Tú recibes siempre el 100% (Afinidad de Reliquias).`,
    r.foundAt && LOCATIONS[r.foundAt] ? h('div', null, `Encontrada en ${LOCATIONS[r.foundAt].name}.`) : null));
  const actions = h('div', { class: 'lx-btn-row', style: 'margin-top:16px;justify-content:center' });
  const eqBtn = h('button', { class: `lx-btn ${equipped ? 'ghost' : 'primary'}` }, equipped ? 'Quitar' : 'Equipar');
  eqBtn.addEventListener('click', () => toggleEquip(r, art));
  actions.appendChild(eqBtn);
  if (d.id === 'libro_realidad') actions.appendChild(h('button', { class: 'lx-btn', onclick: () => { ov?.close(); void import('./reality').then((m) => m.openRealityBook()); } }, 'Abrir el Libro'));
  if (d.id === 'libro_aprendizaje') actions.appendChild(h('button', { class: 'lx-btn', onclick: () => { ov?.close(); void import('./workshops').then((m) => m.openFusion()); } }, 'Fusionar habilidades'));
  box.appendChild(actions);
}
