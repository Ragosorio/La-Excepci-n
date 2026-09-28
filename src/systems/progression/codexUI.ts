/**
 * El Códice — collection (grouped by school / lineage / rarity, "???" silhouettes with where-to-find hints,
 * comprehension pips, ranks), loadout (1–4/5, Q, E, R), resistances ("Excepciones") and fusion.
 */
import type { AbilityDef, RaceId } from '../../data/types';
import { h, clear } from '../../ui/dom';
import { G } from '../../core/state';
import { bus } from '../../core/events';
import { audio } from '../../audio';
import { ABILITIES, RANK_ROMAN } from '../../data/abilities';
import { isGeneratedFusion } from '../../data/fusions';
import { RACES } from '../../data/races';
import { HUNTER_UNITS, UNITS } from '../../data/units';
import { NPCS } from '../../data/npcs';
import { JOBS } from '../../data/jobs';
import { RELICS } from '../../data/relics';
import { CONTINENTS, LOCATIONS } from '../../data/world';
import { RARITY_INFO, RARITY_ORDER, SCHOOL_INFO, SCHOOL_ORDER, STATUS_INFO, TAG_INFO, tagName } from '../../data/schools';
import * as cx from './codex';
import { relicAbilities } from './relics';
import { activeSlotCount, hasRacialPower, statSummary } from './stats';
import { KIND_NAME, abilityIcon, icon, racialIcon, schoolIcon, tagIcon } from './art';
import { burst, flashEl, getOpen, header, openOverlay, plural, recentlyClosed, resChip, seg, type Overlay } from './pgui';
import { buildFusionPanel } from './workshops';

type Tab = 'coleccion' | 'equipo' | 'excepciones' | 'fusion';
type GroupBy = 'escuela' | 'linaje' | 'rareza';
type Filter = 'todas' | 'conocidas' | 'faltan';

const ui = { tab: 'coleccion' as Tab, group: 'escuela' as GroupBy, filter: 'todas' as Filter, search: '', sel: null as string | null, slot: 0 };
let ov: Overlay | null = null;
let tabsEl: HTMLElement | null = null;
let bodyEl: HTMLElement | null = null;
let ringEl: HTMLElement | null = null;
let essChip: ReturnType<typeof resChip> | null = null;
let offs: Array<() => void> = [];

const TARGET_NAME: Record<AbilityDef['target'], string> = { self: 'Tú', enemy: 'Un enemigo', ally: 'Un aliado', ground: 'Una zona', direction: 'Una dirección' };
const WORLD_NAME: Record<string, string> = { politica: 'Política', economia: 'Economía', sigilo: 'Sigilo', casino: 'Casino', exploracion: 'Exploración', terror: 'Terror' };

// ───────────────────────────── entry ─────────────────────────────

export function openCodexUI(tab?: Tab): void {
  if (!G.run) return;
  if (tab) ui.tab = tab;
  if (getOpen('codex')) { renderTabs(); renderBody(); return; }
  if (recentlyClosed('codex')) return;
  build();
}
export function closeCodexUI(): void { ov?.close(); }
export function isCodexOpen(): boolean { return !!getOpen('codex'); }

function build(): void {
  essChip = resChip('ess', () => G.run.player.essence);
  ringEl = h('div', { class: 'pg-completion' });
  tabsEl = h('div', { class: 'pg-tabs' });
  bodyEl = h('div', { class: 'pg-body' });
  ov = openOverlay({ key: 'codex', hotkeys: ['Tab'], onClose: () => { offs.forEach((f) => f()); offs = []; ov = null; } },
    header('CÓDICE', 'La Excepción — lo que te tocó ya no te toca.', () => ov?.close(), ringEl, essChip.el),
    tabsEl, bodyEl);
  offs.push(bus.on('res:change', ({ key }) => { if (key === 'essence') essChip?.refresh(); }));
  offs.push(bus.on('codex:acquired', () => { renderRing(); renderTabs(); if (ui.tab !== 'fusion') renderBody(); }));
  offs.push(bus.on('loadout:change', () => { if (ui.tab === 'equipo') renderBody(); }));
  renderRing();
  renderTabs();
  renderBody();
}

function renderRing(): void {
  if (!ringEl) return;
  const { known, total } = cx.codexCompletion();
  const p = total ? known / total : 0;
  const c = 2 * Math.PI * 22;
  clear(ringEl);
  ringEl.append(
    h('div', { html: `<svg class="pg-ring" viewBox="0 0 52 52"><circle cx="26" cy="26" r="22" fill="none" stroke="rgba(255,255,255,.1)" stroke-width="5"/><circle cx="26" cy="26" r="22" fill="none" stroke="url(#pgRingG)" stroke-width="5" stroke-linecap="round" stroke-dasharray="${(c * p).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 26 26)"/><defs><linearGradient id="pgRingG"><stop offset="0" stop-color="#9b5cff"/><stop offset="1" stop-color="#f5d99a"/></linearGradient></defs><text x="26" y="30" text-anchor="middle" font-size="12" font-weight="800" fill="#f3ead8" font-family="Alegreya Sans">${Math.round(p * 100)}%</text></svg>` }),
    h('div', { class: 'pg-ring-txt' }, `${known}/${total}`, h('small', null, 'Excepciones')),
  );
}

function renderTabs(): void {
  if (!tabsEl) return;
  clear(tabsEl);
  const book = G.run.player.books.aprendizaje;
  const hasNew = cx.acquiredIds().some((id) => cx.isNew(id));
  const tab = (id: Tab, label: string, extra?: HTMLElement | null, locked = false, tip?: string) => h('div', {
    class: `pg-tab ${ui.tab === id ? 'active' : ''} ${locked ? 'locked' : ''}`, 'data-tip': tip,
    onclick: () => { if (ui.tab === id) return; audio.sfx('ui_tab'); ui.tab = id; renderTabs(); renderBody(); },
  }, label, extra ?? null);
  tabsEl.append(
    tab('coleccion', 'Colección', hasNew ? h('span', { class: 'pg-dot' }) : null),
    tab('equipo', 'Equipamiento'),
    tab('excepciones', 'Excepciones'),
    tab('fusion', 'Fusión', null, !book, book ? undefined : 'Requiere <b>El Libro del Aprendizaje</b>\n(o la Academia de Altamira, a un precio alto).'),
    h('div', { style: 'margin-left:auto;align-self:center;font-size:12px', class: 'lx-muted' }, h('span', { class: 'lx-kbd' }, 'Tab'), ' / ', h('span', { class: 'lx-kbd' }, 'Esc'), ' cerrar'),
  );
}

function renderBody(): void {
  if (!bodyEl) return;
  clear(bodyEl);
  if (ui.tab === 'coleccion') bodyEl.appendChild(collectionView());
  else if (ui.tab === 'equipo') bodyEl.appendChild(loadoutView());
  else if (ui.tab === 'excepciones') bodyEl.appendChild(exceptionsView());
  else bodyEl.appendChild(fusionView());
}

// ───────────────────────────── helpers ─────────────────────────────

const iconCache = new Map<string, string>();
function aIcon(d: AbilityDef, size: number, locked: boolean, progress = 0, pips?: [number, number]): string {
  const key = `${d.id}|${size}|${locked ? 1 : 0}|${progress.toFixed(2)}|${pips ? pips.join('/') : ''}`;
  let s = iconCache.get(key);
  if (!s) { s = abilityIcon(d, size, { locked, progress, pips }); if (iconCache.size > 900) iconCache.clear(); iconCache.set(key, s); }
  return s;
}

function known(id: string): boolean { return !!cx.codexEntry(id)?.acquired; }
function progressOf(d: AbilityDef): number { const e = cx.codexEntry(d.id); return e && d.comprehension > 0 ? e.progress / d.comprehension : 0; }

/** Abilities shown in the collection. */
function collection(): AbilityDef[] {
  return Object.values(ABILITIES).filter((d) => {
    if (known(d.id)) return true;
    if (isGeneratedFusion(d.id) || d.fusionOf) return false;
    return d.comprehension > 0 || !!d.source.book || !!d.source.relic;
  });
}

function sourceHints(d: AbilityDef): Array<{ icon: string; text: string }> {
  const out: Array<{ icon: string; text: string }> = [];
  const s = d.source;
  for (const r of s.races ?? []) {
    if (r === 'excepcion') { out.push({ icon: icon('eclipse', { size: 16 }), text: 'Tuya desde siempre' }); continue; }
    const conts = RACES[r]?.homeContinents.map((c) => CONTINENTS[c]?.name).filter(Boolean).join(', ');
    out.push({ icon: racialIcon(RACES[r]?.racialPower.id ?? '', 16, '#c7a2ff'), text: `${RACES[r]?.plural ?? r}${conts ? ` (${conts})` : ''}` });
  }
  const hunters = (s.units ?? []).filter((u) => (HUNTER_UNITS as readonly string[]).includes(u));
  for (const u of (s.units ?? []).filter((x) => !hunters.includes(x)).slice(0, 4)) out.push({ icon: icon('ejercito', { size: 16 }), text: UNITS[u]?.name ?? u });
  if (hunters.length) out.push({ icon: icon('alerta', { size: 16, color: '#ff5d6c' }), text: `Cazadores del Concilio (${hunters.map((u) => UNITS[u]?.name).join(', ')}) — Alerta 50+` });
  for (const n of s.npcs ?? []) {
    const npc = NPCS[n];
    if (npc) out.push({ icon: icon('corona', { size: 16, color: '#f5d99a' }), text: `${npc.name}${LOCATIONS[npc.home] ? ` — ${LOCATIONS[npc.home].name}` : ''}` });
  }
  if (s.jobs?.length) out.push({ icon: icon('libro', { size: 16 }), text: s.jobs.map((j) => plural(JOBS[j]?.name ?? j)).join(', ') });
  if (s.relic && RELICS[s.relic]) out.push({ icon: icon('cofre', { size: 16, color: '#ff8000' }), text: `Reliquia: ${RELICS[s.relic].name}` });
  if (s.book) out.push({ icon: icon('libro', { size: 16, color: '#7fe3ff' }), text: 'El Libro del Aprendizaje' });
  if (d.fusionOf) out.push({ icon: icon('mas', { size: 16 }), text: `Fusión: ${d.fusionOf.map((x) => ABILITIES[x]?.name ?? x).join(' + ')}` });
  return out;
}

function lineageKey(d: AbilityDef): string {
  if (d.fusionOf) return 'fusion';
  if (d.source.book) return 'libro';
  if (d.comprehension <= 0 && d.source.relic) return 'reliquia';
  const r = d.source.races?.[0];
  if (r) return r;
  if ((d.source.units ?? []).some((u) => (HUNTER_UNITS as readonly string[]).includes(u))) return 'cazadores';
  if (d.source.npcs?.length) return 'heroes';
  if (d.source.jobs?.length) return 'oficios';
  return 'otros';
}
const LINEAGE_ORDER: string[] = ['excepcion', 'humano', 'caballero', 'picaro', 'clerigo', 'elfo', 'duende', 'enano', 'gigante', 'ogro', 'mago', 'bruja', 'trol', 'sirena', 'draconido', 'oficios', 'heroes', 'cazadores', 'reliquia', 'libro', 'fusion', 'otros'];
function lineageLabel(k: string): { name: string; icon: string } {
  if (k === 'excepcion') return { name: 'Elias Veyr', icon: icon('eclipse', { size: 18 }) };
  if (RACES[k as RaceId]) return { name: RACES[k as RaceId].plural, icon: racialIcon(RACES[k as RaceId].racialPower.id, 18, '#c7a2ff') };
  const m: Record<string, [string, Parameters<typeof icon>[0]]> = {
    oficios: ['Oficios', 'libro'], heroes: ['Héroes, reyes y leyendas', 'corona'], cazadores: ['Cazadores del Concilio', 'alerta'],
    reliquia: ['Poderes de reliquia', 'cofre'], libro: ['El Libro del Aprendizaje', 'libro'], fusion: ['Fusiones', 'mas'], otros: ['Otros', 'estrella'],
  };
  const [name, ic] = m[k] ?? ['Otros', 'estrella'];
  return { name, icon: icon(ic, { size: 18 }) };
}

// ───────────────────────────── collection ─────────────────────────────

function collectionView(): HTMLElement {
  const left = h('div', { class: 'pg-left' });
  const detail = h('div', { class: 'pg-detail' });
  const scroll = h('div', { class: 'pg-scroll' });
  const search = h('input', { class: 'pg-search', placeholder: 'Buscar…', value: ui.search }) as HTMLInputElement;
  let t = 0;
  search.addEventListener('input', () => { ui.search = search.value; clearTimeout(t); t = window.setTimeout(() => fillGrid(), 120); });
  const toolbar = h('div', { class: 'pg-toolbar' },
    seg<GroupBy>([['escuela', 'Escuela'], ['linaje', 'Linaje'], ['rareza', 'Rareza']], ui.group, (v) => { ui.group = v; renderBody(); }),
    seg<Filter>([['todas', 'Todas'], ['conocidas', 'Conocidas'], ['faltan', 'Por descubrir']], ui.filter, (v) => { ui.filter = v; renderBody(); }),
    search);
  left.append(toolbar, scroll);

  const cards = new Map<string, HTMLElement>();
  const select = (id: string) => {
    ui.sel = id;
    for (const [cid, el] of cards) el.classList.toggle('sel', cid === id);
    renderDetail(detail, id, () => { const el = cards.get(id); const d = ABILITIES[id]; if (el && d) refreshCard(el, d); renderRing(); });
    if (cx.isNew(id)) { cx.markSeen([id]); cards.get(id)?.querySelector('.pg-card-new')?.remove(); renderTabs(); }
  };

  const fillGrid = () => {
    clear(scroll);
    cards.clear();
    const q = ui.search.trim().toLowerCase();
    let list = collection().filter((d) => {
      const k = known(d.id);
      if (ui.filter === 'conocidas' && !k) return false;
      if (ui.filter === 'faltan' && k) return false;
      if (!q) return true;
      const partial = !k && (cx.codexEntry(d.id)?.progress ?? 0) > 0;
      const hay = (k || partial ? `${d.name} ${SCHOOL_INFO[d.school].name}` : '') + ' ' + sourceHints(d).map((x) => x.text).join(' ');
      return hay.toLowerCase().includes(q);
    });
    const rIdx = (d: AbilityDef) => RARITY_ORDER.indexOf(d.rarity);
    list = list.sort((a, b) => rIdx(a) - rIdx(b) || a.name.localeCompare(b.name, 'es'));
    const groups = new Map<string, AbilityDef[]>();
    const keyOf = (d: AbilityDef) => (ui.group === 'escuela' ? d.school : ui.group === 'rareza' ? d.rarity : lineageKey(d));
    for (const d of list) { const k = keyOf(d); if (!groups.has(k)) groups.set(k, []); groups.get(k)!.push(d); }
    const order = ui.group === 'escuela' ? SCHOOL_ORDER as string[] : ui.group === 'rareza' ? [...RARITY_ORDER].reverse() as string[] : LINEAGE_ORDER;
    let i = 0;
    for (const k of order) {
      const g = groups.get(k);
      if (!g?.length) continue;
      const kn = g.filter((d) => known(d.id)).length;
      const label = ui.group === 'escuela'
        ? { name: SCHOOL_INFO[k as AbilityDef['school']].name, icon: schoolIcon(k as AbilityDef['school'], 18) }
        : ui.group === 'rareza' ? { name: RARITY_INFO[k as AbilityDef['rarity']].name, icon: icon('estrella', { size: 18, color: RARITY_INFO[k as AbilityDef['rarity']].color }) }
          : lineageLabel(k);
      const grid = h('div', { class: 'pg-grid' });
      for (const d of g) {
        const card = makeCard(d, i++);
        card.addEventListener('click', () => { audio.sfx('ui_click', { volume: 0.6 }); select(d.id); });
        cards.set(d.id, card);
        grid.appendChild(card);
      }
      scroll.appendChild(h('div', { class: `pg-group ${kn === g.length ? 'done' : ''}` },
        h('div', { class: 'pg-group-head' }, h('span', { html: label.icon, style: 'display:inline-flex' }), label.name,
          h('span', { class: 'pg-group-count' }, `${kn}/${g.length}`), h('div', { class: 'pg-group-bar' }, h('i', { style: `width:${(kn / g.length) * 100}%` }))),
        grid));
    }
    if (!i) scroll.appendChild(h('div', { class: 'pg-empty-note' }, 'Nada por aquí. Todavía.'));
    if (ui.sel && cards.has(ui.sel)) select(ui.sel);
    else renderDetail(detail, null, () => undefined);
  };
  fillGrid();
  return h('div', { class: 'pg-col' }, left, detail);
}

function makeCard(d: AbilityDef, i: number): HTMLElement {
  const card = h('div', { class: 'pg-card', style: `animation-delay:${Math.min(i * 5, 260)}ms` });
  refreshCard(card, d);
  return card;
}

function refreshCard(card: HTMLElement, d: AbilityDef): void {
  const k = known(d.id);
  const e = cx.codexEntry(d.id);
  const partial = !k && (e?.progress ?? 0) > 0;
  card.className = `pg-card r-${d.rarity} ${k ? '' : 'locked'} ${partial ? 'partial' : ''} ${ui.sel === d.id ? 'sel' : ''}`;
  card.style.setProperty('--rc', RARITY_INFO[d.rarity].color);
  clear(card);
  const pips: [number, number] | undefined = partial && d.comprehension <= 8 ? [e!.progress, d.comprehension] : undefined;
  card.append(
    h('div', { class: 'pg-card-icon', html: aIcon(d, 64, !k, k ? 0 : progressOf(d), pips) }),
    h('div', { class: 'pg-card-name' }, k || partial ? d.name : '???'),
  );
  if (k && e && e.rank > 1) card.appendChild(h('div', { class: 'pg-card-rank' }, RANK_ROMAN[e.rank]));
  if (k && cx.isNew(d.id)) card.appendChild(h('div', { class: 'pg-card-new' }, 'NUEVA'));
  const lo = cx.equippedAbilities();
  const slotIdx = lo.slots.indexOf(d.id);
  const slotKey = slotIdx >= 0 ? String(slotIdx + 1) : lo.ultimate === d.id ? 'R' : lo.relics[0] === d.id ? 'Q' : lo.relics[1] === d.id ? 'E' : null;
  if (slotKey && !cx.isNew(d.id)) card.appendChild(h('div', { class: 'pg-card-slot' }, h('span', { class: 'lx-kbd' }, slotKey)));
  card.setAttribute('data-tip', k || partial ? `<b>${d.name}</b>\n${RARITY_INFO[d.rarity].name} · ${SCHOOL_INFO[d.school].name}` : `<b>???</b>\n${SCHOOL_INFO[d.school].name}`);
}

function effectChips(d: AbilityDef): HTMLElement {
  const box = h('div', { class: 'pg-effects' });
  for (const e of d.effects ?? []) {
    const chance = e.chance !== undefined && e.chance < 1 ? ` (${Math.round(e.chance * 100)}%)` : '';
    if (e.status) {
      const si = STATUS_INFO[e.status];
      box.appendChild(h('span', { class: 'pg-tag', style: `color:${si?.color ?? '#fff'};border-color:${si?.color ?? '#fff'}55`, 'data-tip': si ? `<b>${si.name}</b>\n${si.desc}` : undefined },
        `${si?.name ?? e.status}${e.duration ? ` ${+e.duration.toFixed(1)} s` : ''}${chance}`));
    }
    if (e.knockback) box.appendChild(h('span', { class: 'pg-tag' }, `Empuje ${e.knockback}${chance}`));
    if (e.pull) box.appendChild(h('span', { class: 'pg-tag' }, `Atracción ${e.pull}`));
    if (e.heal) box.appendChild(h('span', { class: 'pg-tag', style: 'color:var(--good)' }, `Cura ${e.heal}${chance}`));
    if (e.damage) box.appendChild(h('span', { class: 'pg-tag', style: 'color:var(--blood)' }, `+${e.damage} daño${chance}`));
  }
  return box;
}

function statRows(d: AbilityDef, r: number): HTMLElement {
  const cur = cx.effectiveAbility(d.id) ?? d;
  const next = r < cx.MAX_RANK ? (() => { const e = cx.codexEntry(d.id); if (!e) return null; const saved = e.rank; e.rank = r + 1; const n = cx.effectiveAbility(d.id); e.rank = saved; return n; })() : null;
  const rows: Array<[string, string, string?]> = [];
  const heal = d.kind === 'buff' && d.target !== 'enemy';
  if (cur.power) rows.push([heal ? 'Curación' : 'Daño', String(cur.power), next && next.power !== cur.power ? `+${next.power - cur.power}` : undefined]);
  rows.push(['Maná', String(cur.mana)]);
  if (cur.cooldown) rows.push(['Enfriamiento', `${cur.cooldown} s`, next && next.cooldown !== cur.cooldown ? `${(next.cooldown - cur.cooldown).toFixed(2)} s` : undefined]);
  if (cur.castTime) rows.push(['Lanzamiento', `${cur.castTime} s`]);
  if (cur.range) rows.push(['Alcance', `${cur.range} m`]);
  if (cur.radius) rows.push(['Radio', `${+cur.radius.toFixed(1)} m`]);
  if (cur.duration) rows.push(['Duración', `${+cur.duration.toFixed(1)} s`]);
  if (cur.count && cur.count > 1) rows.push(['Cantidad', String(cur.count)]);
  if (cur.speed) rows.push(['Velocidad', `${cur.speed} m/s`]);
  return h('div', { class: 'pg-stats' }, ...rows.map(([k, v, up]) => h('div', null, h('span', null, k), h('span', null, h('b', null, v), up ? h('span', { class: 'up' }, up) : null))));
}

function renderDetail(box: HTMLElement, id: string | null, onChange: () => void): void {
  clear(box);
  const d = id ? ABILITIES[id] : null;
  if (!d) {
    box.appendChild(h('div', { class: 'pg-detail-empty' }, 'Elige una habilidad. Las que aún no comprendes esperan en la oscuridad, con un nombre que todavía no te pertenece.'));
    return;
  }
  const k = known(d.id);
  const e = cx.codexEntry(d.id);
  const partial = !k && (e?.progress ?? 0) > 0;
  const rc = RARITY_INFO[d.rarity].color;
  const top = h('div', { class: 'pg-detail-top' },
    h('div', { html: aIcon(d, 112, !k, k ? 0 : progressOf(d)) }),
    h('div', null,
      h('div', { class: 'pg-detail-name', style: `color:${k || partial ? rc : '#8a7aa0'}` }, k || partial ? d.name : '???'),
      h('div', { class: 'pg-detail-meta' },
        h('span', { class: 'pg-tag', style: `color:${rc};border-color:${rc}66` }, RARITY_INFO[d.rarity].name),
        h('span', { class: 'pg-tag', style: `color:${SCHOOL_INFO[d.school].color}` }, h('span', { html: schoolIcon(d.school, 13) }), SCHOOL_INFO[d.school].name),
        k || partial ? h('span', { class: 'pg-tag' }, KIND_NAME[d.kind]) : null,
        k && d.ultimate ? h('span', { class: 'pg-tag', style: 'color:var(--blood)' }, 'Definitiva') : null)));
  box.appendChild(top);

  if (!k) {
    box.appendChild(h('div', { class: 'pg-desc' }, partial
      ? 'La estás empezando a entender. Deja que vuelva a tocarte.'
      : d.comprehension > 0 ? 'Todavía no sabes qué es. Solo sabes que existe, y que alguien la usa.' : 'No se puede copiar: se obtiene de otra forma.'));
    if (d.comprehension > 0) {
      const need = d.comprehension, have = e?.progress ?? 0;
      box.appendChild(h('div', { class: 'pg-section' }, h('div', { class: 'pg-section-title' }, `Comprensión ${have}/${need}`),
        h('div', { class: 'pg-pips' }, ...Array.from({ length: need }, (_, i) => h('span', { class: `pg-pip ${i < have ? 'on' : ''}` }))),
        h('div', { class: 'lx-small lx-muted', style: 'margin-top:6px' }, 'Déjate golpear por ella para comprenderla. Los críticos cuentan doble.')));
    }
    const hints = sourceHints(d);
    if (hints.length) box.appendChild(h('div', { class: 'pg-section' }, h('div', { class: 'pg-section-title' }, 'Dónde encontrarla'),
      h('div', { class: 'pg-hints' }, ...hints.map((x) => h('div', { class: 'pg-hint' }, h('span', { html: x.icon, style: 'display:inline-flex' }), x.text)))));
    return;
  }

  box.appendChild(h('div', { class: 'pg-desc' }, d.desc));
  if (d.flavor) box.appendChild(h('div', { class: 'pg-flavor' }, d.flavor));
  const r = e?.rank ?? 1;
  if (d.kind !== 'passive') box.appendChild(statRows(d, r));
  if (d.effects?.length) box.appendChild(h('div', { class: 'pg-section' }, h('div', { class: 'pg-section-title' }, 'Efectos'), effectChips(d)));
  if (d.comprehension > 0 && d.tags.length && d.id !== 'chispa_arcana' && d.id !== 'esquivar') {
    box.appendChild(h('div', { class: 'pg-section' }, h('div', { class: 'pg-section-title' }, 'Te hace resistente a'),
      h('div', { class: 'pg-effects' }, ...d.tags.map((t) => { const v = cx.resistance(t); return h('span', { class: 'pg-tag', style: `color:${TAG_INFO[t]?.color ?? '#fff'}` }, h('span', { html: tagIcon(t, 13, TAG_INFO[t]?.color) }), `${tagName(t)} ${v >= 1 ? 'INMUNE' : Math.round(v * 100) + '%'}`); }))));
  }
  if (d.world?.length) box.appendChild(h('div', { class: 'pg-section' }, h('div', { class: 'pg-section-title' }, 'Fuera de batalla'),
    h('div', { class: 'pg-effects' }, ...d.world.map((w) => h('span', { class: 'pg-tag', style: 'color:var(--secret)' }, WORLD_NAME[w] ?? w)))));

  // ranks
  if (d.id !== 'esquivar') {
    const stars = h('div', { class: 'pg-stars' }, ...Array.from({ length: cx.MAX_RANK }, (_, i) => h('span', { class: `pg-star ${i < r ? 'on' : ''}` }, '★')));
    const cost = cx.rankUpCost(d.id);
    const canPay = cost !== null && G.run.player.essence >= cost;
    const btn = h('button', { class: `lx-btn ${canPay ? 'primary' : ''} small`, disabled: cost === null || !canPay }, cost === null ? 'Rango máximo' : `Subir a rango ${RANK_ROMAN[r + 1]} · ${cost} ✦`);
    btn.addEventListener('click', () => {
      if (!cx.rankUp(d.id)) return;
      burst(btn, '#c77dff', 22);
      const star = stars.children[r] as HTMLElement | undefined;
      if (star) { star.classList.add('on', 'pop'); }
      flashEl(box);
      setTimeout(() => { renderDetail(box, d.id, onChange); onChange(); }, 420);
    });
    const perks = r < 3 ? 'Rango III: +25% duración.' : r < 5 ? 'Rango V: +20% radio y +1 proyectil/objetivo.' : '';
    box.appendChild(h('div', { class: 'pg-section' }, h('div', { class: 'pg-section-title' }, `Rango ${RANK_ROMAN[r]}`),
      h('div', { class: 'pg-row' }, stars, btn),
      h('div', { class: 'lx-small lx-muted', style: 'margin-top:6px' }, `Cada rango: +25% de poder y −5% de enfriamiento. ${perks}`)));
  }

  // equip
  if (d.kind === 'passive') {
    box.appendChild(h('div', { class: 'pg-section' }, h('span', { class: 'pg-tag', style: 'color:var(--good)' }, 'Pasiva: siempre activa')));
  } else if (d.id === 'chispa_arcana' || d.id === 'esquivar') {
    box.appendChild(h('div', { class: 'pg-section' }, h('span', { class: 'pg-tag' }, d.id === 'chispa_arcana' ? 'Clic izquierdo' : 'Espacio')));
  } else {
    const lo = cx.equippedAbilities();
    const keys = h('div', { class: 'pg-keys' });
    const n = activeSlotCount();
    for (let i = 0; i < n; i++) {
      const on = lo.slots[i] === d.id;
      keys.appendChild(h('button', { class: `pg-key ${on ? 'on' : ''}`, disabled: !cx.canEquip(i, d.id), 'data-tip': lo.slots[i] && !on ? `Reemplaza: <b>${ABILITIES[lo.slots[i]!]?.name ?? ''}</b>` : undefined,
        onclick: () => { cx.equipSlot(i, on ? null : d.id); audio.sfx(on ? 'ui_close' : 'ui_confirm'); renderDetail(box, d.id, onChange); onChange(); } }, String(i + 1)));
    }
    const onR = lo.ultimate === d.id;
    keys.appendChild(h('button', { class: `pg-key ${onR ? 'on' : ''}`, disabled: !cx.canEquip(cx.SLOT.R, d.id), 'data-tip': 'Definitiva (R): definitivas, legendarias y míticas',
      onclick: () => { cx.equipSlot(cx.SLOT.R, onR ? null : d.id); audio.sfx('ui_confirm'); renderDetail(box, d.id, onChange); onChange(); } }, 'R'));
    box.appendChild(h('div', { class: 'pg-section' }, h('div', { class: 'pg-section-title' }, 'Asignar'), keys));
  }
  if (e?.acquiredAt !== undefined && d.comprehension > 0 && d.id !== 'chispa_arcana' && d.id !== 'esquivar') box.appendChild(h('div', { class: 'lx-small lx-muted', style: 'margin-top:14px;font-style:italic' }, 'Comprendida. Ya no tiene poder sobre ti.'));
}

// ───────────────────────────── loadout ─────────────────────────────

function slotName(slot: number): string { return slot === cx.SLOT.Q ? 'Q' : slot === cx.SLOT.E ? 'E' : slot === cx.SLOT.R ? 'R' : String(slot + 1); }

function loadoutView(): HTMLElement {
  const lo = cx.equippedAbilities();
  const n = activeSlotCount();
  if (ui.slot >= n && ui.slot < cx.SLOT.Q) ui.slot = 0;
  const slotEl = (slot: number, id: string | null, cls = '') => {
    const d = id ? ABILITIES[id] : null;
    return h('div', { class: `pg-slot ${cls} ${d ? 'filled' : ''} ${ui.slot === slot ? 'sel' : ''}`, onclick: () => { audio.sfx('ui_click'); ui.slot = slot; renderBody(); },
      'data-tip': d ? `<b>${d.name}</b>\n${d.desc}` : undefined },
    h('div', { class: 'pg-slot-key' }, h('span', { class: 'lx-kbd' }, slotName(slot))),
    d ? h('div', { html: aIcon(d, 64, false) }) : h('div', { class: 'pg-slot-empty' }, 'vacío'),
    d ? h('div', { class: 'pg-slot-name' }, d.name) : null);
  };
  const slots = h('div', { class: 'pg-slots' },
    ...lo.slots.map((id, i) => slotEl(i, id)),
    h('div', { class: 'pg-slot-sep' }),
    slotEl(cx.SLOT.Q, lo.relics[0], 'relic'), slotEl(cx.SLOT.E, lo.relics[1], 'relic'),
    h('div', { class: 'pg-slot-sep' }),
    slotEl(cx.SLOT.R, lo.ultimate, 'ult'));

  const current = ui.slot === cx.SLOT.Q ? lo.relics[0] : ui.slot === cx.SLOT.E ? lo.relics[1] : ui.slot === cx.SLOT.R ? lo.ultimate : lo.slots[ui.slot] ?? null;
  const pool = ui.slot === cx.SLOT.Q || ui.slot === cx.SLOT.E ? relicAbilities() : cx.acquiredIds();
  const cands = pool.map((id) => ABILITIES[id]).filter((d): d is AbilityDef => !!d && cx.canEquip(ui.slot, d.id))
    .sort((a, b) => RARITY_ORDER.indexOf(b.rarity) - RARITY_ORDER.indexOf(a.rarity) || a.name.localeCompare(b.name, 'es'));
  const grid = h('div', { class: 'pg-grid' });
  cands.forEach((d, i) => {
    const card = makeCard(d, i);
    if (current === d.id) card.classList.add('sel');
    card.addEventListener('click', () => { cx.equipSlot(ui.slot, d.id); audio.sfx('ui_confirm'); burst(card, SCHOOL_INFO[d.school].color, 12, 60); });
    grid.appendChild(card);
  });
  const help = ui.slot === cx.SLOT.Q || ui.slot === cx.SLOT.E ? 'Las ranuras Q y E usan los poderes de tus reliquias equipadas.'
    : ui.slot === cx.SLOT.R ? 'La ranura R acepta definitivas, legendarias y míticas.' : `Ranura ${slotName(ui.slot)}: cualquier habilidad activa que hayas comprendido.`;
  const left = h('div', { class: 'pg-left' },
    slots,
    h('div', { class: 'pg-toolbar' }, h('span', { class: 'lx-small lx-muted' }, help),
      current ? h('button', { class: 'lx-btn ghost small', style: 'margin-left:auto', onclick: () => { cx.equipSlot(ui.slot, null); audio.sfx('ui_close'); } }, 'Vaciar ranura') : null),
    h('div', { class: 'pg-scroll' }, cands.length ? grid : h('div', { class: 'pg-empty-note' }, ui.slot === cx.SLOT.Q || ui.slot === cx.SLOT.E ? 'Ninguna reliquia equipada concede un poder.' : 'Nada que poner aquí. Todavía.')));

  // passives + stats
  const passives = h('div', { class: 'pg-passives' });
  for (const id of ['fuerza_titanica', 'afinidad_reliquias', 'retorno', 'traicion']) {
    const d = ABILITIES[id];
    if (!d || !cx.knows(id)) continue;
    passives.appendChild(h('div', { class: 'pg-passive' }, h('span', { html: aIcon(d, 34, false) }), h('div', null, h('b', null, d.name), h('div', { class: 'lx-muted' }, d.desc))));
  }
  for (const r of Object.values(RACES)) {
    if (r.id === 'excepcion' || !hasRacialPower(r.racialPower.id)) continue;
    passives.appendChild(h('div', { class: 'pg-passive' }, h('span', { html: racialIcon(r.racialPower.id, 30) }), h('div', null, h('b', null, r.racialPower.name), h('div', { class: 'lx-muted' }, r.racialPower.desc))));
  }
  if (!passives.children.length) passives.appendChild(h('div', { class: 'lx-muted lx-small' }, 'Sin pasivas todavía.'));
  const stats = h('div', { class: 'pg-stats', style: 'grid-template-columns:1fr' }, ...statSummary().map((s) => h('div', null, h('span', null, s.label), h('b', null, s.value))));
  const right = h('div', { class: 'pg-detail' },
    h('div', { class: 'pg-section-title' }, 'Pasivas'), passives,
    h('div', { class: 'pg-section' }, h('div', { class: 'pg-section-title' }, 'Estadísticas'), stats));
  return h('div', { class: 'pg-loadout-wrap' }, left, right);
}

// ───────────────────────────── exceptions ─────────────────────────────

function exceptionsView(): HTMLElement {
  const tags = Object.keys(TAG_INFO);
  const rows = tags.map((t) => ({ t, v: cx.resistance(t) })).sort((a, b) => b.v - a.v || a.t.localeCompare(b.t));
  const grid = h('div', { class: 'pg-exc-grid' });
  for (const { t, v } of rows) {
    const col = TAG_INFO[t]?.color ?? '#9b5cff';
    const contributors = cx.acquiredIds().map((id) => ABILITIES[id]).filter((d) => d && d.comprehension > 0 && d.tags.includes(t) && d.id !== 'chispa_arcana');
    grid.appendChild(h('div', { class: `pg-res ${v >= 1 ? 'immune' : ''} ${v <= 0 ? 'zero' : ''}`, style: `--c:${col}` },
      h('span', { html: tagIcon(t, 30, col) }),
      h('div', { class: 'pg-res-name' }, tagName(t)),
      h('div', { class: 'pg-res-val', style: `color:${col}` }, v >= 1 ? 'INMUNE' : `${Math.round(v * 100)}%`),
      h('div', { class: 'pg-res-bar' }, h('i', { style: `width:${Math.min(100, v * 100)}%` })),
      contributors.length ? h('div', { class: 'pg-res-src' }, ...contributors.slice(0, 8).map((d) => h('span', { html: aIcon(d, 20, false), 'data-tip': `<b>${d.name}</b>` }))) : null));
  }
  const racial = h('div', { class: 'pg-racial-grid' });
  for (const r of Object.values(RACES)) {
    if (r.id === 'excepcion') continue;
    const owned = hasRacialPower(r.racialPower.id);
    const where = r.homeContinents.filter((c) => c !== 'concordia' && CONTINENTS[c]?.races.includes(r.id)).map((c) => CONTINENTS[c].name);
    const hint = owned ? 'Tuyo.' : where.length ? `Corrompe ${where.join(' o ')}.` : 'Un linaje sin tierra propia: nadie lo gobierna.';
    racial.appendChild(h('div', { class: `pg-passive ${owned ? '' : 'locked'}` }, h('span', { html: racialIcon(r.racialPower.id, 30, owned ? '#f5d99a' : '#6d5f80') }),
      h('div', null, h('b', null, `${r.racialPower.name}`), h('span', { class: 'lx-muted' }, ` · ${r.plural}`), h('div', { class: 'lx-muted' }, r.racialPower.desc), h('div', { class: 'lx-small', style: `color:${owned ? 'var(--good)' : 'var(--violet-hi)'}` }, hint))));
  }
  return h('div', { class: 'pg-exc' },
    h('div', { class: 'pg-exc-quote' }, 'Todo poder que te toca y sobrevives deja de tener poder sobre ti.'),
    h('div', { class: 'lx-small lx-muted', style: 'text-align:center;margin:-10px 0 16px' }, '+20% por cada habilidad copiada de esa naturaleza (máx. 80%). Las míticas dan inmunidad total.'),
    grid,
    h('div', { class: 'pg-section', style: 'margin-top:24px' }, h('div', { class: 'pg-section-title' }, 'Herencias de linaje'), racial));
}

// ───────────────────────────── fusion ─────────────────────────────

function fusionView(): HTMLElement {
  if (!G.run.player.books.aprendizaje) {
    return h('div', { class: 'pg-fusion' },
      h('div', { class: 'pg-vortex', style: 'filter:grayscale(1) brightness(.5)' }),
      h('div', { class: 'pg-exc-quote' }, 'Dos poderes pueden volverse uno. Pero alguien tiene que enseñarte cómo.'),
      h('div', { class: 'lx-muted', style: 'text-align:center;max-width:560px' }, 'El Libro del Aprendizaje duerme encadenado en la Biblioteca Prohibida de Altamira. Mientras tanto, la Academia fusiona habilidades por un precio que te va a doler.'));
  }
  return buildFusionPanel({ costMult: 1, goldCost: 0, onDone: () => { renderRing(); renderTabs(); } });
}
