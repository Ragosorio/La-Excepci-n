/**
 * Overworld side panels: Ejército (grouped units, stars, wounds, upkeep, dismiss, rename), Designios log,
 * and the Mapa político legend.
 */
import type { ArmyUnit } from '../../data/types';
import { UNITS } from '../../data/units';
import { RACES } from '../../data/races';
import { LOCATIONS } from '../../data/world';
import { G } from '../../core/state';
import { h, layer, esc } from '../../ui/dom';
import { button, confirmModal, modal } from '../../ui/widgets';
import { toast } from '../../ui/toasts';
import { audio } from '../../audio';
import { track } from '../../core/tracker';
import { W } from '../../systems/world/state';
import { armyPower, armyUpkeep, eliasPower } from '../../systems/world/forces';
import { armyUpkeep as societyUpkeep } from '../../systems/society/api';
import { lunasText } from '../../systems/world/time';
import type { PoliticalMode } from './labels';

let openPanel: { el: HTMLElement; close: () => void; id: string } | null = null;

export function closePanel(): boolean {
  if (!openPanel) return false;
  openPanel.close();
  return true;
}
export function panelOpen(id?: string): boolean { return !!openPanel && (!id || openPanel.id === id); }

function mountPanel(id: string, el: HTMLElement): void {
  closePanel();
  const onKey = (e: KeyboardEvent) => {
    if (e.code === 'Escape' && !document.querySelector('.lx-modal-back')) { e.preventDefault(); e.stopPropagation(); close(); }
  };
  const close = () => {
    window.removeEventListener('keydown', onKey, true);
    el.classList.add('closing');
    setTimeout(() => el.remove(), 180);
    if (openPanel?.el === el) openPanel = null;
    audio.sfx('ui_close');
  };
  window.addEventListener('keydown', onKey, true);
  layer('panel').appendChild(el);
  audio.sfx('ui_open');
  openPanel = { el, close, id };
}

const stars = (n: number) => '★'.repeat(n) + '☆'.repeat(Math.max(0, 3 - n));

export function openArmyPanel(): void {
  if (panelOpen('army')) { closePanel(); return; }
  const body = h('div', { class: 'ow-army-body' });
  const render = () => {
    body.innerHTML = '';
    const p = G.run.player;
    const army = p.army;
    let up = 0;
    try { up = Math.round(societyUpkeep()); } catch { up = armyUpkeep(); }
    body.appendChild(h('div', { class: 'ow-army-stats' },
      h('div', null, h('small', null, 'Unidades'), h('b', null, `${army.length}/${p.armyCap}`)),
      h('div', null, h('small', null, 'Fuerza'), h('b', null, String(Math.round(armyPower() + eliasPower())))),
      h('div', null, h('small', null, 'Mantenimiento'), h('b', { class: 'lx-gold' }, `${up} oro/luna`))));
    if (!army.length) {
      body.appendChild(h('div', { class: 'ow-empty' },
        h('div', { class: 'lx-book' }, 'Tu ejército eres tú. Por ahora.'),
        h('div', { class: 'lx-small lx-muted' }, 'Recluta en aldeas y ciudades, contrata mercenarios en las tabernas o domina mentes en batalla para ganar Devotos.')));
      return;
    }
    const groups = new Map<string, ArmyUnit[]>();
    for (const u of army) { const g = groups.get(u.unitId) ?? []; g.push(u); groups.set(u.unitId, g); }
    for (const [unitId, units] of groups) {
      const def = UNITS[unitId];
      const race = def ? RACES[def.race]?.name ?? def.race : '';
      const head = h('div', { class: 'ow-ag-head' },
        h('span', { class: 'ow-ag-name' }, def?.name ?? unitId),
        h('span', { class: 'lx-small lx-muted' }, [race, def ? `Nivel ${def.tier}` : '', def?.role ?? ''].filter(Boolean).join(' · ')),
        h('span', { class: 'ow-ag-count' }, `×${units.length}`),
        h('span', { class: 'lx-small lx-gold', 'data-tip': 'Los Devotos cuestan la mitad; los tenientes, el 150%.' }, `${Math.round(units.reduce((s2, u) => s2 + (def?.upkeep ?? 2) * (u.devoto ? 0.5 : u.npcId || u.name ? 1.5 : 1), 0))} oro/luna`));
      const list = h('div', { class: 'ow-ag-list' });
      for (const u of units.sort((a, b) => b.stars - a.stars)) {
        const hp = Math.round((u.hpPct ?? 1) * 100);
        const special = u.devoto ? 'Devoto' : u.npcId || u.name ? 'Teniente' : '';
        list.appendChild(h('div', { class: `ow-unit ${special ? 'named' : ''}` },
          h('span', { class: 'ow-unit-stars' }, stars(u.stars)),
          h('span', { class: 'ow-unit-name' }, u.name ?? def?.name ?? unitId, special ? h('i', { class: 'ow-unit-tag' }, special) : null),
          h('span', { class: 'ow-unit-hp', 'data-tip': hp < 100 ? `Herido: ${hp}% (sana en el Templo o descansando)` : 'Sin heridas' }, h('i', { style: `transform:scaleX(${hp / 100});background:${hp < 40 ? 'var(--blood)' : hp < 80 ? 'var(--warn)' : 'var(--good)'}` })),
          special ? button('Renombrar', () => void rename(u), { small: true, kind: 'ghost' }) : null,
          button('Licenciar', () => void dismiss(u), { small: true, kind: 'ghost' })));
      }
      body.appendChild(h('div', { class: 'ow-ag' }, head, list));
    }
  };
  const rename = async (u: ArmyUnit) => {
    const input = h('input', { class: 'lx-input', value: u.name ?? '', maxlength: '28', style: 'width:100%' }) as HTMLInputElement;
    const v = await modal({ title: 'Nuevo nombre', body: h('div', { class: 'lx-col' }, h('div', { class: 'lx-small lx-muted' }, 'Los nombres importan. El mundo los repite.'), input), actions: [{ label: 'Cancelar', value: 'no', kind: 'ghost' }, { label: 'Nombrar', value: 'ok', kind: 'primary' }], onOpen: () => setTimeout(() => input.focus(), 50) });
    if (v === 'ok' && input.value.trim()) { u.name = input.value.trim().slice(0, 28); audio.sfx('quill'); render(); }
  };
  const dismiss = async (u: ArmyUnit) => {
    const def = UNITS[u.unitId];
    if (!(await confirmModal('Licenciar', `¿Dejar ir a ${u.name ?? def?.name ?? 'esta unidad'}? No volverá.`, 'Licenciar', 'Cancelar', true))) return;
    G.run.player.army = G.run.player.army.filter((x) => x.uid !== u.uid);
    track('units_dismissed');
    toast(`${esc(u.name ?? def?.name ?? 'La unidad')} se marcha sin mirar atrás.`, { kind: 'info' });
    render();
  };
  render();
  const el = h('div', { class: 'lx-panel ow-panel ow-army' },
    h('div', { class: 'lx-panel-title' }, h('span', null, 'Ejército'), h('button', { class: 'lx-panel-close', onclick: () => closePanel() }, '×')),
    body);
  mountPanel('army', el);
}

export function openQuestPanel(onGo: (locId: string) => void): void {
  if (panelOpen('quests')) { closePanel(); return; }
  const qs = G.run.quests;
  const section = (title: string, list: typeof qs, cls: string) => list.length ? h('div', { class: 'ow-ql-sec' }, h('div', { class: 'ow-ql-h' }, title),
    ...list.map((q) => {
      const tgt = q.target ? LOCATIONS[q.target] : undefined;
      const r = q.reward;
      const reward = [r?.gold ? `${r.gold} oro` : '', r?.essence ? `${r.essence} esencia` : '', r?.influence ? `${r.influence} influencia` : '', r?.secrets ? `${r.secrets} secretos` : '', r?.text ?? ''].filter(Boolean).join(' · ');
      return h('div', { class: `ow-ql ${cls} k-${q.kind} ${W().tracked === q.id ? 'tracked' : ''}` },
        h('div', { class: 'ow-ql-title' }, q.title, h('span', { class: 'ow-ql-kind' }, q.kind === 'main' ? 'Principal' : q.kind === 'contract' ? 'Contrato' : 'Secundario')),
        h('div', { class: 'ow-ql-desc' }, q.desc),
        q.goal > 1 ? h('div', { class: 'ow-q-bar' }, h('div', { style: `transform:scaleX(${Math.min(1, q.progress / q.goal)})` })) : null,
        h('div', { class: 'ow-ql-foot' },
          reward ? h('span', { class: 'lx-small lx-gold' }, `Recompensa: ${reward}`) : null,
          q.expiresLuna !== undefined && !q.done && !q.failed ? h('span', { class: 'lx-small lx-muted' }, `Vence en ${lunasText(q.expiresLuna - G.run.luna)}`) : null,
          !q.done && !q.failed ? button(W().tracked === q.id ? 'Siguiendo' : 'Seguir', () => { W().tracked = q.id; closePanel(); }, { small: true, kind: W().tracked === q.id ? 'primary' : 'ghost' }) : null,
          !q.done && !q.failed && tgt ? button(`Ir a ${tgt.name}`, () => { W().tracked = q.id; closePanel(); onGo(tgt.id); }, { small: true }) : null));
    })) : null;
  const active = qs.filter((q) => !q.done && !q.failed);
  const done = qs.filter((q) => q.done).slice(-8).reverse();
  const failed = qs.filter((q) => q.failed).slice(-5).reverse();
  const el = h('div', { class: 'lx-panel ow-panel ow-questlog' },
    h('div', { class: 'lx-panel-title' }, h('span', null, 'Designios'), h('button', { class: 'lx-panel-close', onclick: () => closePanel() }, '×')),
    h('div', { class: 'ow-ql-scroll' },
      active.length ? null : h('div', { class: 'ow-empty lx-book' }, 'Nada escrito todavía. El libro espera.'),
      section('En curso', active, ''), section('Cumplidos', done, 'done'), section('Fallidos', failed, 'failed')));
  mountPanel('quests', el);
}

export function politicalLegend(mode: PoliticalMode, onMode: (m: PoliticalMode) => void): HTMLElement {
  const tab = (m: Exclude<PoliticalMode, null>, label: string) => h('button', { class: `ow-pol-tab ${mode === m ? 'on' : ''}`, onclick: () => { audio.sfx('ui_tab'); onMode(m); } }, label);
  const legend = mode === 'corrupcion'
    ? h('div', { class: 'ow-pol-grad corr' }, h('span', null, '0%'), h('span', null, 'Corrupción'), h('span', null, '100%'))
    : mode === 'miedo'
      ? h('div', { class: 'ow-pol-grad fear' }, h('span', null, 'Calma'), h('span', null, 'Miedo'), h('span', null, 'Terror'))
      : h('div', { class: 'lx-small lx-muted' }, 'Cada estandarte muestra quién controla el lugar. El eclipse es tuyo.');
  return h('div', { class: 'ow-pol' },
    h('div', { class: 'ow-pol-head' }, h('b', null, 'Mapa político'), h('span', { class: 'lx-kbd' }, 'M')),
    h('div', { class: 'ow-pol-tabs' }, tab('corrupcion', 'Corrupción'), tab('control', 'Control'), tab('miedo', 'Miedo')),
    legend);
}
