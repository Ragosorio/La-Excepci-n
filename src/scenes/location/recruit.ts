/**
 * Reclutar: units of the lineages that live here (content: unitsForContinent + location races).
 * Cost bends with Miedo, reputation, control and the relic passive `recruit_discount`. Limited recruits per luna.
 */
import type { UnitDef } from '../../data/types';
import { RACES } from '../../data/races';
import { JOBS } from '../../data/jobs';
import { G, res } from '../../core/state';
import { uid } from '../../core/rng';
import { track } from '../../core/tracker';
import { h } from '../../ui/dom';
import { modal, button } from '../../ui/widgets';
import { toast } from '../../ui/toasts';
import { portraitSVG } from '../../ui/art/portraits';
import { audio } from '../../audio';
import { applyDeed, repValue } from '../../systems/society/api';
import { relicPassive } from '../../systems/progression/relics';
import { unitPool, locationRaces } from '../../systems/world/forces';
import { RES_ICON } from '../overworld/icons';
import type { LocCtx } from './actions';

const ROLE: Record<string, string> = { melee: 'Cuerpo a cuerpo', rango: 'A distancia', mago: 'Mago', sanador: 'Sanador', tanque: 'Tanque', asesino: 'Asesino', asedio: 'Asedio', monstruo: 'Monstruo', apoyo: 'Apoyo' };

export function recruitDiscount(ctx: LocCtx): { mult: number; parts: string[] } {
  const st = ctx.st;
  const parts: string[] = [];
  let m = 1;
  if (st.fear >= 50) { const d = Math.min(0.3, ((st.fear - 50) / 50) * 0.3); m -= d; parts.push(`Miedo −${Math.round(d * 100)}%`); }
  let rep = 0;
  try { rep = repValue(ctx.def.continent === 'concordia' ? 'concilio' : ctx.def.continent); } catch { rep = 0; }
  if (rep > 15) { const d = Math.min(0.2, rep / 500); m -= d; parts.push(`Reputación −${Math.round(d * 100)}%`); }
  else if (rep < -10) { const d = Math.min(0.3, -rep / 333); m += d; parts.push(`Reputación +${Math.round(d * 100)}%`); }
  if (st.control === 'excepcion') { m -= 0.15; parts.push('Bajo tu control −15%'); }
  let relic = 0;
  try { relic = relicPassive('recruit_discount'); } catch { relic = 0; }
  if (relic > 0) { m -= relic; parts.push(`Reliquias −${Math.round(relic * 100)}%`); }
  return { mult: Math.max(0.4, m), parts };
}

function maxTier(ctx: LocCtx): number {
  const k = ctx.def.kind;
  if (k === 'aldea' || k === 'especial') return ctx.st.control === 'excepcion' ? 2 : 1;
  if (k === 'capital' || k === 'fortaleza') return ctx.st.control === 'excepcion' || ctx.st.fear >= 50 ? 3 : 2;
  return 2;
}

function recruitsLeft(ctx: LocCtx): number {
  const st = ctx.st;
  if (st.flags.recruitLuna !== G.run.luna) {
    st.flags.recruitLuna = G.run.luna;
    st.flags.recruitLeft = 4 + Math.floor(st.prosperity / 12) + (st.fear >= 60 ? 3 : 0) + (st.control === 'excepcion' ? 3 : 0);
  }
  return Number(st.flags.recruitLeft ?? 0);
}

export async function openRecruit(ctx: LocCtx): Promise<void> {
  const races = locationRaces(ctx.id);
  const tier = maxTier(ctx);
  const pool = unitPool(ctx.def.continent, races).filter((u) => u.tier <= tier).sort((a, b) => a.tier - b.tier || a.cost - b.cost);
  const locked = unitPool(ctx.def.continent, races).filter((u) => u.tier > tier);
  const head = h('div', { class: 'loc-rec-head' });
  const grid = h('div', { class: 'loc-rec-grid' });
  const render = () => {
    const p = G.run.player;
    const left = recruitsLeft(ctx);
    const disc = recruitDiscount(ctx);
    head.innerHTML = '';
    head.append(
      h('div', null, h('small', null, 'Ejército'), h('b', null, `${p.army.length}/${p.armyCap}`)),
      h('div', null, h('small', null, 'Voluntarios esta luna'), h('b', null, String(left))),
      h('div', null, h('small', null, 'Precio'), h('b', { class: disc.mult < 1 ? 'lx-good' : disc.mult > 1 ? 'lx-bad' : '' }, `${Math.round(disc.mult * 100)}%`), disc.parts.length ? h('span', { class: 'lx-small lx-muted' }, disc.parts.join(' · ')) : null),
      h('div', null, h('small', null, 'Oro'), h('b', { class: 'lx-gold' }, String(Math.floor(p.gold)))));
    grid.innerHTML = '';
    if (!pool.length) {
      grid.appendChild(h('div', { class: 'ow-empty lx-book' }, 'Nadie aquí quiere pelear por ti. Todavía.'));
      return;
    }
    for (const u of pool) grid.appendChild(card(u, disc.mult, left));
    for (const u of locked.slice(0, 3)) grid.appendChild(lockedCard(u));
  };
  const card = (u: UnitDef, mult: number, left: number): HTMLElement => {
    const price = Math.max(5, Math.round(u.cost * mult));
    const p = G.run.player;
    const canOne = res.can('gold', price) && p.army.length < p.armyCap && left > 0;
    const n5 = Math.min(5, left, p.armyCap - p.army.length, Math.floor(p.gold / price));
    const el = h('div', { class: `loc-unit t${u.tier}` },
      h('div', { class: 'loc-unit-portrait', html: portraitSVG({ seed: `unit:${u.id}`, race: u.race, job: u.job, mood: 'determined' }, 120) }),
      h('div', { class: 'loc-unit-info' },
        h('div', { class: 'loc-unit-name' }, u.name, h('span', { class: 'loc-unit-tier' }, '★'.repeat(u.tier))),
        h('div', { class: 'lx-small lx-muted' }, [RACES[u.race]?.name ?? u.race, JOBS[u.job]?.name ?? u.job, ROLE[u.role] ?? u.role].join(' · ')),
        h('div', { class: 'loc-unit-stats' },
          h('span', { 'data-tip': 'Vida' }, `♥ ${u.hp}`), h('span', { 'data-tip': 'Daño' }, `⚔ ${u.damage}`),
          h('span', { 'data-tip': 'Velocidad' }, `➶ ${u.speed}`), h('span', { 'data-tip': 'Alcance' }, `◎ ${u.attackRange}`)),
        u.desc ? h('div', { class: 'loc-unit-desc' }, u.desc) : null),
      h('div', { class: 'loc-unit-buy' },
        h('div', { class: 'loc-unit-price' }, h('span', { html: RES_ICON.gold }), String(price), price !== u.cost ? h('s', null, String(u.cost)) : null),
        h('div', { class: 'lx-small lx-muted' }, `${u.upkeep} oro/luna`),
        button('Reclutar', () => buy(u, price, 1, el), { small: true, kind: 'primary', disabled: !canOne }),
        n5 > 1 ? button(`×${n5}`, () => buy(u, price, n5, el), { small: true, disabled: !canOne }) : null));
    return el;
  };
  const lockedCard = (u: UnitDef) => h('div', { class: 'loc-unit locked', 'data-tip': 'Aquí no confían en ti lo suficiente. Controla el lugar o infunde más Miedo.' },
    h('div', { class: 'loc-unit-portrait', html: portraitSVG({ seed: `unit:${u.id}`, race: u.race, job: u.job, mood: 'neutral' }, 120) }),
    h('div', { class: 'loc-unit-info' }, h('div', { class: 'loc-unit-name' }, u.name, h('span', { class: 'loc-unit-tier' }, '★'.repeat(u.tier))), h('div', { class: 'lx-small lx-muted' }, 'Bloqueado')));
  const buy = (u: UnitDef, price: number, n: number, el: HTMLElement) => {
    const p = G.run.player;
    let bought = 0;
    for (let i = 0; i < n; i++) {
      if (recruitsLeft(ctx) <= 0 || p.army.length >= p.armyCap || !res.spend('gold', price)) break;
      p.army.push({ uid: uid('u'), unitId: u.id, stars: 0, xp: 0 });
      ctx.st.flags.recruitLeft = Number(ctx.st.flags.recruitLeft ?? 1) - 1;
      bought++;
    }
    if (!bought) { audio.sfx('ui_error'); return; }
    try { applyDeed({ kind: 'recruit', location: ctx.id, magnitude: Math.min(2.5, 0.3 + bought * 0.25) }); } catch { /* ignore */ }
    track('units_recruited', bought);
    audio.sfx('level_up'); audio.sfx('coins_many', { volume: 0.6 });
    el.classList.remove('bought'); void el.offsetWidth; el.classList.add('bought');
    ctx.dio.fx.emit('confetti', ctx.dio.focus, { count: 30, scale: 1.6 });
    ctx.dio.react('cheer');
    toast(`<b>+${bought}</b> ${u.name}${bought > 1 ? ' (×' + bought + ')' : ''} se une${bought > 1 ? 'n' : ''} a tu ejército.`, { kind: 'good' });
    render();
  };
  render();
  await modal({
    title: `Reclutar — ${ctx.def.name}`, wide: true, className: 'loc-recruit',
    body: h('div', { class: 'loc-rec' }, head, grid),
    actions: [{ label: 'Listo', value: 'ok', kind: 'primary' }],
  });
  ctx.refresh();
}
