/**
 * Location UI: zone title, left card (crest, control, fear/loyalty/prosperity, garrison, lore, relic rumor,
 * notables), right action menu grouped by intent, top resource bar, back button.
 */
import { CONTINENTS } from '../../data/world';
import { NPCS } from '../../data/npcs';
import { RELICS } from '../../data/relics';
import { G } from '../../core/state';
import { bus } from '../../core/events';
import { fmt } from '../../core/math';
import { h, esc, append } from '../../ui/dom';
import { bar, type BarHandle } from '../../ui/widgets';
import { audio } from '../../audio';
import { npcsAt, repTier } from '../../systems/society/api';
import { factionColor, factionName } from '../../systems/world/state';
import { totalPower, odds, defenderPower } from '../../systems/world/forces';
import { phaseGlyph, phaseName } from '../../systems/world/time';
import { RES_ICON, KIND_ICON, ACTION_ICON, crest } from '../overworld/icons';
import { GROUP_NAME, type ActionGroup, type LocAction, type LocCtx } from './actions';

const KIND_NAME: Record<string, string> = {
  capital: 'Capital', ciudad: 'Ciudad', aldea: 'Aldea', fortaleza: 'Fortaleza', ruina: 'Ruina', templo: 'Templo', especial: 'Lugar singular',
  casino: 'Puerto y casino', arena: 'Arena', puerto: 'Puerto', santuario: 'Santuario', concilio: 'Sede del Concilio',
};

export class ResBar {
  readonly el = h('div', { class: 'loc-res' });
  private vals = new Map<string, HTMLElement>();
  private off: (() => void) | null = null;
  constructor() {
    const keys: Array<['gold' | 'mana' | 'essence' | 'influence' | 'secrets' | 'alert', keyof typeof RES_ICON, string]> = [
      ['gold', 'gold', 'Oro'], ['mana', 'mana', 'Maná'], ['essence', 'essence', 'Esencia'], ['influence', 'influence', 'Influencia'], ['secrets', 'secrets', 'Secretos'], ['alert', 'alert', 'Alerta del Concilio'],
    ];
    for (const [k, ic, name] of keys) {
      const v = h('span', { class: 'loc-res-v' });
      const chip = h('div', { class: `lx-chip loc-chip k-${k}`, 'data-tip': name }, h('span', { class: 'loc-res-ic', html: RES_ICON[ic] }), v);
      this.el.appendChild(chip);
      this.vals.set(k, v);
    }
    this.el.appendChild(h('div', { class: 'loc-moon', 'data-tip': 'Fase de la luna' }, h('span', null, phaseGlyph()), h('small', null, phaseName())));
    this.refresh();
    this.off = bus.on('res:change', ({ key }) => {
      this.refresh();
      const v = this.vals.get(key);
      const chip = v?.parentElement;
      if (chip) { chip.classList.remove('bump'); void chip.offsetWidth; chip.classList.add('bump'); }
    });
  }
  refresh(): void {
    const p = G.run.player;
    for (const [k, v] of this.vals) v.textContent = k === 'mana' ? `${Math.floor(p.mana)}/${p.manaMax}` : fmt(Math.floor((p as unknown as Record<string, number>)[k] ?? 0));
  }
  dispose(): void { this.off?.(); this.el.remove(); }
}

export function zoneTitle(ctx: LocCtx): HTMLElement {
  const c = CONTINENTS[ctx.def.continent];
  const el = h('div', { class: 'loc-zone' },
    h('div', { class: 'loc-zone-name' }, ctx.def.name),
    h('div', { class: 'loc-zone-sub' }, `${KIND_NAME[ctx.def.kind] ?? ''} · ${c.name}, ${c.epithet.toLowerCase()}`));
  setTimeout(() => el.classList.add('out'), 2600);
  setTimeout(() => el.remove(), 3600);
  return el;
}

export class LocationCard {
  readonly el = h('div', { class: 'lx-panel loc-card' });
  private bars: { fear: BarHandle; loyalty: BarHandle; prosperity: BarHandle } | null = null;
  constructor(private ctx: LocCtx) { this.render(); }

  render(): void {
    const { def, st } = this.ctx;
    const c = CONTINENTS[def.continent];
    const ctrl = st.control;
    let tier = { name: 'Neutral', color: '#c8c8c8' };
    try { tier = repTier(def.continent === 'concordia' ? 'concilio' : def.continent); } catch { /* stub */ }
    const known = !!st.relic && !st.explored && (st.visited || !!st.flags.relicKnown || !!G.run.flags.brujula);
    const notables = (() => { try { return npcsAt(this.ctx.id); } catch { return def.npcs ?? []; } })().filter((n) => NPCS[n] && G.run.npcs[n]?.alive !== false);
    const o = odds(totalPower(), defenderPower(def.kind, st.garrison));
    this.el.innerHTML = '';
    this.bars = {
      fear: bar(st.fear, 100, { color: 'linear-gradient(90deg,#6a3bc0,#e2455b)', label: `Miedo ${Math.round(st.fear)}`, height: 12, ghost: true }),
      loyalty: bar(st.loyalty, 100, { color: 'linear-gradient(90deg,#8a6a33,#f5d99a)', label: `Lealtad ${Math.round(st.loyalty)}`, height: 12, ghost: true }),
      prosperity: bar(st.prosperity, 100, { color: 'linear-gradient(90deg,#2f7a4a,#6fe39a)', label: `Prosperidad ${Math.round(st.prosperity)}`, height: 12, ghost: true }),
    };
    append(this.el, [
      h('div', { class: 'loc-card-head' },
        h('div', { class: 'loc-card-crest', html: crest(def.continent) }),
        h('div', null,
          h('div', { class: 'loc-card-name' }, def.name),
          h('div', { class: 'loc-card-kind' }, h('span', { class: 'loc-kind-ic', html: KIND_ICON[def.kind] }), `${KIND_NAME[def.kind] ?? def.kind} · ${c.name}`))),
      h('div', { class: 'loc-card-row' },
        h('span', { class: 'lx-small lx-muted' }, 'Control'),
        ctrl === 'excepcion'
          ? h('span', { class: 'loc-ctrl mine', html: `${ACTION_ICON.sanctuary}<b>Bajo tu control</b>` })
          : h('span', { class: 'loc-ctrl', style: `--c:${factionColor(ctrl)}` }, h('i'), factionName(ctrl))),
      h('div', { class: 'loc-card-row' }, h('span', { class: 'lx-small lx-muted' }, 'Reputación'), h('span', { style: `color:${tier.color};font-weight:800` }, tier.name)),
      h('div', { class: 'loc-bars' }, this.bars.fear.el, this.bars.loyalty.el, this.bars.prosperity.el),
      h('div', { class: 'loc-card-row' },
        h('span', { class: 'lx-small lx-muted' }, 'Guarnición'),
        h('span', null, h('b', null, String(Math.round(st.garrison))), st.garrison > 0 && ctrl !== 'excepcion' ? h('span', { class: 'lx-small', style: `color:${o.color};margin-left:8px` }, o.text) : null)),
      h('div', { class: 'loc-card-desc' }, def.desc),
      known ? h('div', { class: 'loc-card-relic' }, h('span', null, '✦'), ` Rumor: aquí descansa `, h('b', null, RELICS[st.relic!]?.name ?? 'una reliquia')) : st.relic && !st.explored ? h('div', { class: 'loc-card-relic dim' }, '✦ Algo brilla aquí. Nadie sabe qué.') : null,
      st.businesses.length ? h('div', { class: 'lx-small lx-gold' }, `Tus negocios aquí: ${st.businesses.length}`) : null,
      notables.length ? h('div', { class: 'loc-notables' }, h('div', { class: 'lx-small lx-muted' }, 'Notables'),
        h('div', { class: 'loc-notable-row' }, notables.slice(0, 6).map((n) => h('span', { class: 'loc-notable', 'data-tip': esc(NPCS[n].title ?? '') }, NPCS[n].name)))) : null,
      st.razed ? h('div', { class: 'lx-bad lx-small' }, 'Arrasado.') : null,
    ]);
  }
}

export class ActionMenu {
  readonly el = h('div', { class: 'lx-panel loc-actions' });
  constructor(private ctx: LocCtx, private list: () => LocAction[], private onRun: (a: LocAction) => void) { this.render(); }
  render(): void {
    this.el.innerHTML = '';
    const acts = this.list();
    const groups: ActionGroup[] = ['gente', 'servicios', 'poder', 'guerra', 'tu'];
    this.el.appendChild(h('div', { class: 'lx-panel-title' }, 'Acciones'));
    const scroll = h('div', { class: 'loc-actions-scroll' });
    for (const g of groups) {
      const items = acts.filter((a) => a.group === g);
      if (!items.length) continue;
      scroll.appendChild(h('div', { class: 'loc-act-group' }, GROUP_NAME[g]));
      for (const a of items) {
        const btn = h('button', {
          class: `loc-act ${a.hot ? 'hot' : ''} ${a.danger ? 'danger' : ''} ${a.disabled ? 'disabled' : ''}`,
          'data-tip': `<b>${esc(a.label)}</b><br>${a.tip}${a.disabled ? `<br><span class="lx-bad">${esc(a.disabled)}</span>` : ''}`,
          onclick: () => { if (a.disabled) { audio.sfx('ui_error'); return; } audio.sfx('ui_click'); this.onRun(a); },
          onmouseenter: () => audio.sfx('ui_hover', { volume: 0.3 }),
        },
        h('span', { class: 'loc-act-ic', html: a.icon }),
        h('span', { class: 'loc-act-txt' }, h('span', { class: 'loc-act-l' }, a.label), h('span', { class: 'loc-act-c' }, a.disabled ?? a.cost ?? '')));
        scroll.appendChild(btn);
      }
    }
    this.el.appendChild(scroll);
    void this.ctx;
  }
}
