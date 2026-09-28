/**
 * El Mercado (GDD §4.8): buy low, sell high. Goods table with stock, price trends, profit hints, cargo,
 * haggling for big deals, and a Negocios tab (invest in businesses, manipulate prices with economic control).
 */
import { G, res } from '../../core/state';
import { rng } from '../../core/rng';
import { fmt } from '../../core/math';
import { h, clear } from '../../ui/dom';
import { button } from '../../ui/widgets';
import { portraitSVG, type PortraitMood, type PortraitSpec } from '../../ui/art/portraits';
import { audio } from '../../audio';
import { LOCATIONS, LOCATION_LIST } from '../../data/world';
import { randomName } from '../../data/names';
import type { GoodId, RaceId, TraitId } from '../../data/types';
import { Rng } from '../../core/rng';
import {
  bestSellHint, buyGoods, cargoCap, cargoUsed, goodInfo, isMarket, marketShock, playerPriceMult, quote, sellGoods, tradeRefusal, trendOf,
} from './economy';
import { BUSINESS_DEFS, businessIncome, businessOptions, buyBusiness, sellBusiness, upgradeBusiness, upgradeCost } from './finance';
import { haggle } from './haggle';
import { bizIcon, goodIcon, resIcon } from './icons';
import { npcView, npcsAt, portraitFor } from './memory';
import { bubble, openWindow, resChip, setBubble } from './panelui';
import { GOOD_IDS, contName, continentOf, ensureLocation, locName, soc } from './state';
import { popText, shakeEl } from './uifx';
import type { BusinessKind } from './types';

export interface Merchant { id?: string; name: string; title: string; spec: (mood: PortraitMood) => PortraitSpec; traits: TraitId[]; duende: boolean }

/** The merchant behind the counter: a named NPC if one trades here, else a stable local. */
export function merchantFor(locationId: string): Merchant {
  const people = npcsAt(locationId).map((id) => ({ id, v: npcView(id) })).filter((x) => x.v && !G.run.npcs[x.id]?.loyal);
  const here = people.find((x) => x.v!.role === 'mercader') ?? people.find((x) => x.v!.job === 'mercader');
  if (here?.v) {
    const v = here.v;
    return { id: here.id, name: v.name, title: v.title ?? 'Mercader', spec: (m) => portraitFor(here.id, m), traits: v.traits, duende: v.race === 'duende' };
  }
  const def = LOCATIONS[locationId];
  const r = new Rng(`${locationId}:merchant`);
  const mix = Object.entries(def?.races ?? { humano: 1 }) as Array<[RaceId, number]>;
  const race: RaceId = mix.length ? r.weighted(mix, (x) => x[1])[0] : 'humano';
  const gender: 'f' | 'm' = r.chance(0.5) ? 'f' : 'm';
  let name = 'Mercader';
  try { name = randomName(race, gender, r) || name; } catch { /* content WIP */ }
  const traits = r.pickN(['codicioso', 'curioso', 'paranoico', 'honorable', 'jugador', 'supersticioso'] as TraitId[], 2);
  return { name, title: gender === 'f' ? 'Mercadera' : 'Mercader', spec: (mood) => ({ seed: `${locationId}:merchant`, race: race as PortraitSpec['race'], job: 'mercader', gender, mood }), traits, duende: race === 'duende' };
}

const GREET = ['Bienvenido. Aquí se paga en oro, no en promesas.', 'Mire sin compromiso. Compre con compromiso.', 'Todo fresco. Casi todo. Lo demás, barato.', '¿Busca algo en particular o solo viene a asustar a mis clientes?'];
const GREET_D = ['¡Qué onda, patojo! Todo fresco, todo baratito... bueno, baratito para mí.', '¡Pase, pase, cuate! Aquí hay de todo, menos fiado.', '¡A la gran, un cliente de verdad! ¿Qué va a llevar?'];
const BUY = ['¡Excelente elección!', 'Un placer hacer negocios.', 'Buen ojo. Muy buen ojo.', 'Se lo envuelvo. Bueno, no, llévelo así.'];
const BUY_D = ['¡Chilero! Vuelva pronto, cuate.', '¡Qué chivo! Así da gusto.', '¡Eso, patojo! Pisto que entra, pisto que alegra.'];
const SELL = ['Hmm, me lo quedo. No me hace gracia, pero me lo quedo.', 'Trato hecho. Aunque me duela.', 'Bien. Lo revenderé a alguien más tonto.'];
const SELL_D = ['Púchica, me está sacando el pisto... va pues.', '¡Está yuca el precio, pero va!'];
const BIG = ['Para un pedido así, podemos hablar de precio...', 'Eso es mucho oro. Mucho. ¿Lo hablamos?'];

const pick = <T,>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)];

export async function openMarket(locationId: string): Promise<void> {
  if (!G.run) return;
  const loc = ensureLocation(locationId);
  if (!loc) return;
  const m = merchantFor(locationId);
  const refusal = tradeRefusal(locationId);
  loc.visited = true;
  const gold = resChip(resIcon('oro'), fmt(G.run.player.gold), 'Oro');
  const cargo = resChip(resIcon('carga'), `${cargoUsed()}/${cargoCap()}`, 'Carga (más con ejército y naviera)');
  const w = openWindow({ title: `Mercado de ${locName(locationId)}`, icon: resIcon('oro', 26), subtitle: contName(continentOf(locationId)), className: 'soc-market', headerRight: [gold, cargo] });

  const portraitEl = h('div', { class: 'soc-portrait', html: portraitSVG(m.spec(refusal ? 'angry' : 'smile'), 300) });
  const bub = bubble(refusal ?? pick(m.duende ? GREET_D : GREET));
  const mods = h('div', { class: 'soc-mods' });
  const side = h('div', { class: 'soc-side' }, portraitEl, h('div', { class: 'soc-npc-name' }, m.name, h('span', null, m.title)), bub, mods);
  const tabHead = h('div', { class: 'lx-tabs-head' });
  const content = h('div', { class: 'soc-content' });
  const main = h('div', { class: 'soc-main' }, tabHead, content);
  w.body.appendChild(h('div', { class: 'soc-split' }, side, main));

  const say = (text: string, mood: PortraitMood) => {
    setBubble(bub, text);
    portraitEl.innerHTML = portraitSVG(m.spec(mood), 300);
    portraitEl.classList.remove('talk'); void portraitEl.offsetWidth; portraitEl.classList.add('talk');
  };
  const refreshHeader = () => { gold.set?.(fmt(G.run.player.gold)); cargo.set?.(`${cargoUsed()}/${cargoCap()}`); };

  const renderMods = () => {
    clear(mods);
    const b = playerPriceMult(locationId, 'buy');
    const pct = Math.round((b.mult - 1) * 100);
    if (b.notes.length) mods.appendChild(h('div', { class: 'soc-mods-title' }, `Tus precios aquí: ${pct > 0 ? '+' : ''}${pct}%`));
    for (const n of b.notes) mods.appendChild(h('span', { class: 'soc-tag' }, n));
  };

  let tab: 'comercio' | 'negocios' = 'comercio';
  const qty: Record<string, number> = {};
  const renderTabs = () => {
    clear(tabHead);
    for (const [id, label] of [['comercio', 'Comercio'], ['negocios', 'Negocios']] as const) {
      tabHead.appendChild(h('div', { class: `lx-tab ${tab === id ? 'active' : ''}`, onclick: () => { audio.sfx('ui_tab'); tab = id; render(); } }, label));
    }
  };

  const render = () => {
    renderTabs();
    renderMods();
    refreshHeader();
    clear(content);
    if (tab === 'comercio') content.appendChild(renderTrade());
    else content.appendChild(renderBusiness());
  };

  const doTrade = async (g: GoodId, side: 'buy' | 'sell', n: number, haggled: boolean, anchor: HTMLElement) => {
    const q = quote(locationId, g, side, n);
    let total: number | undefined;
    if (haggled) {
      const r = await haggle({ side, good: g, qty: n, asking: q.total, merchant: m, locationId });
      if (r === null) { say(pick(['Otro día será.', 'Como quiera. El precio era justo.']), 'neutral'); render(); return; }
      total = r;
    }
    const ok = side === 'buy' ? buyGoods(locationId, g, n, total) : sellGoods(locationId, g, n, total);
    if (!ok) {
      audio.sfx('ui_error');
      shakeEl(anchor);
      if (side === 'buy' && cargoUsed() + n > cargoCap()) say('No le cabe más en las alforjas, jefe.', 'neutral');
      else if (side === 'buy') say('Sin oro no hay trato.', 'smug');
      return;
    }
    const paid = total ?? q.total;
    audio.sfx(side === 'buy' ? 'purchase' : 'sell');
    if (paid >= 200) audio.sfx('coins_many', { volume: 0.6 });
    popText(anchor, side === 'buy' ? `−${fmt(paid)}` : `+${fmt(paid)}`, side === 'buy' ? 'var(--blood)' : 'var(--gold-hi)', paid >= 300);
    say(side === 'buy' ? pick(m.duende ? BUY_D : BUY) : pick(m.duende ? SELL_D : SELL), side === 'buy' ? 'smile' : 'smug');
    render();
  };

  const renderTrade = (): HTMLElement => {
    const s = soc();
    const table = h('div', { class: 'soc-goods' });
    table.appendChild(h('div', { class: 'soc-goods-head' },
      h('span', null, 'Bien'), h('span', null, 'Existencias'), h('span', null, 'Precio'), h('span', null, 'Tienes'), h('span', null, 'Cantidad'), h('span', null, '')));
    for (const g of GOOD_IDS) {
      const info = goodInfo(g);
      const n = qty[g] ??= 5;
      const have = s.goods[g] ?? 0;
      const buyQ = quote(locationId, g, 'buy', n);
      const sellQ = quote(locationId, g, 'sell', Math.min(n, have));
      const unit = quote(locationId, g, 'buy', 1).total;
      const unitSell = quote(locationId, g, 'sell', 1).total;
      const trend = trendOf(locationId, g);
      const hint = bestSellHint(g, locationId);
      const avg = s.goodsCost[g] ?? 0;
      const stockPct = Math.min(1, loc.stock[g] / 200);
      const profitUnit = have > 0 && avg > 0 ? unitSell - avg : null;
      const qtyEl = h('span', { class: 'soc-qty-val' }, String(n));
      const setQty = (v: number) => { qty[g] = Math.max(1, Math.min(99, v)); render(); };
      const bigBuy = buyQ.total >= 300 && !refusal;
      const bigSell = sellQ.total >= 300 && !refusal;
      const buyBtn = button(h('span', null, 'Comprar ', h('b', null, fmt(buyQ.total))), (e) => void doTrade(g, 'buy', n, false, e.currentTarget as HTMLElement), { small: true, disabled: !!refusal || buyQ.qty < n || G.run.player.gold < buyQ.total || cargoUsed() + n > cargoCap(), tip: `${n} × ~${fmt(buyQ.unit, 1)} (el precio sube con cada unidad)` });
      const sellBtn = button(h('span', null, 'Vender ', h('b', null, fmt(sellQ.total))), (e) => void doTrade(g, 'sell', Math.min(n, have), false, e.currentTarget as HTMLElement), { small: true, disabled: !!refusal || have <= 0, tip: have <= 0 ? 'No tienes' : `${Math.min(n, have)} × ~${fmt(sellQ.unit, 1)}` });
      const haggleBtns = h('div', { class: 'soc-haggle-btns' },
        bigBuy ? h('button', { class: 'soc-haggle-btn', 'data-tip': 'Regatear la compra', onclick: (e: MouseEvent) => void doTrade(g, 'buy', n, true, e.currentTarget as HTMLElement) }, '⚖ compra') : null,
        bigSell ? h('button', { class: 'soc-haggle-btn', 'data-tip': 'Regatear la venta', onclick: (e: MouseEvent) => void doTrade(g, 'sell', Math.min(n, have), true, e.currentTarget as HTMLElement) }, '⚖ venta') : null);
      table.appendChild(h('div', { class: 'soc-good-row' },
        h('div', { class: 'soc-good-name', 'data-tip': info.desc },
          h('span', { class: 'soc-good-icon', html: goodIcon(g, 34) }),
          h('div', null, h('div', { class: 'soc-good-title' }, info.name),
            hint ? h('div', { class: 'soc-good-hint' }, `Mejor venta conocida: ${locName(hint.location)} ~${fmt(hint.price)}`, hint.price > unit ? h('span', { class: 'lx-good' }, ` (+${fmt(hint.price - unit)} c/u)`) : null) : null)),
        h('div', { class: 'soc-stock' }, h('div', { class: 'soc-stock-bar' }, h('div', { class: 'soc-stock-fill', style: `width:${Math.round(stockPct * 100)}%` })), h('span', { class: 'lx-small lx-muted' }, String(loc.stock[g]))),
        h('div', { class: 'soc-price' },
          h('span', { class: `soc-trend ${trend > 0 ? 'up' : trend < 0 ? 'down' : ''}` }, trend > 0 ? '▲' : trend < 0 ? '▼' : '•'),
          h('span', { class: 'soc-price-buy', 'data-tip': 'Compra por unidad' }, fmt(unit)),
          h('span', { class: 'soc-price-sell', 'data-tip': 'Venta por unidad' }, fmt(unitSell))),
        h('div', { class: 'soc-have' }, have ? h('b', null, String(have)) : h('span', { class: 'lx-muted' }, '—'),
          profitUnit !== null ? h('span', { class: profitUnit >= 0 ? 'lx-good lx-small' : 'lx-bad lx-small', 'data-tip': `Costo medio: ${fmt(avg, 1)}` }, `${profitUnit >= 0 ? '+' : ''}${fmt(profitUnit)} c/u`) : null),
        h('div', { class: 'soc-qty' },
          h('button', { class: 'soc-qty-btn', onclick: () => setQty(n - (n > 10 ? 5 : 1)) }, '−'), qtyEl,
          h('button', { class: 'soc-qty-btn', onclick: () => setQty(n + (n >= 10 ? 5 : 1)) }, '+'),
          h('button', { class: 'soc-qty-btn wide', 'data-tip': 'Todo lo que tienes', onclick: () => setQty(Math.max(1, have)) }, 'máx')),
        h('div', { class: 'soc-trade-btns' }, buyBtn, sellBtn, haggleBtns)));
    }
    const any = GOOD_IDS.some((g) => quote(locationId, g, 'buy', qty[g] ?? 5).total >= 300);
    const foot = h('div', { class: 'soc-foot lx-small lx-muted' }, 'Comprar sube el precio; vender lo baja. En tratos de 300+ de oro puedes ', h('b', { class: 'lx-gold' }, 'regatear ⚖'), '.');
    if (any && rng.chance(0.3)) setTimeout(() => say(pick(BIG), 'smug'), 400);
    return h('div', null, table, foot);
  };

  const renderBusiness = (): HTMLElement => {
    const wrap = h('div', { class: 'soc-biz' });
    const opts = businessOptions(locationId);
    if (!opts.length) wrap.appendChild(h('div', { class: 'lx-muted' }, 'Aquí no hay negocios en los que invertir.'));
    for (const o of opts) {
      const b = o.owned;
      const def = o.def;
      const card = h('div', { class: `soc-biz-card ${b ? 'owned' : ''}` },
        h('div', { class: 'soc-biz-icon', html: bizIcon(o.kind as BusinessKind, 44) }),
        h('div', { class: 'soc-biz-txt' },
          h('div', { class: 'soc-biz-name' }, def.name, b ? h('span', { class: 'soc-stars' }, '★'.repeat(b.level) + '☆'.repeat(3 - b.level)) : null),
          h('div', { class: 'lx-small lx-muted' }, def.desc),
          h('div', { class: 'lx-small' }, b ? `Ingreso: ${fmt(businessIncome(b))} oro/luna · Ganado: ${fmt(b.earned)} · +Codicia` : `Costo ${fmt(def.cost)} · Ingreso ~${fmt(def.income)}/luna · +Codicia`)),
        h('div', { class: 'soc-biz-actions' },
          b
            ? [
              b.level < 3 ? button(`Mejorar (${fmt(upgradeCost(b))})`, (e) => { if (upgradeBusiness(b.id)) { audio.sfx('level_up'); popText(e.currentTarget as HTMLElement, '★', 'var(--gold-hi)', true); render(); } else { audio.sfx('ui_error'); } }, { small: true, disabled: G.run.player.gold < upgradeCost(b) }) : h('span', { class: 'lx-small lx-gold' }, 'Nivel máximo'),
              button('Vender', (e) => { const v = sellBusiness(b.id); popText(e.currentTarget as HTMLElement, `+${fmt(v)}`, 'var(--gold-hi)'); audio.sfx('sell'); render(); }, { small: true, kind: 'ghost', tip: 'Recuperas un 45% de lo invertido' }),
            ]
            : button(`Comprar (${fmt(def.cost)})`, (e) => {
              const nb = buyBusiness(locationId, o.kind as BusinessKind);
              if (nb) { audio.sfx('purchase'); audio.sfx('coins_many', { volume: 0.5 }); popText(e.currentTarget as HTMLElement, `¡${def.name}!`, 'var(--gold-hi)', true); say(m.duende ? '¡A la gran! ¡Ya es dueño, patojo! Ahora pague impuestos. Es broma. O no.' : 'Felicidades. Ahora es parte del paisaje.', 'smile'); render(); }
              else audio.sfx('ui_error');
            }, { kind: 'primary', small: true, disabled: G.run.player.gold < def.cost })));
      wrap.appendChild(card);
    }
    wrap.appendChild(renderManipulation());
    return wrap;
  };

  const renderManipulation = (): HTMLElement => {
    const cont = continentOf(locationId);
    if (!cont) return h('div');
    const markets = LOCATION_LIST.filter((l) => l.continent === cont && isMarket(l.id));
    const withBiz = new Set(soc().businesses.filter((b) => continentOf(b.location) === cont).map((b) => b.location));
    const control = markets.length ? withBiz.size / markets.length : 0;
    const box = h('div', { class: 'soc-manip' },
      h('div', { class: 'soc-manip-title' }, `Control económico de ${contName(cont)}: `, h('b', { class: control >= 0.5 ? 'lx-gold' : '' }, `${Math.round(control * 100)}%`)),
      h('div', { class: 'lx-small lx-muted' }, control >= 0.5 ? 'Tienes la mitad de los mercados en el bolsillo. Puedes hundir o disparar un precio aquí (20 influencia, 4 lunas).' : 'Con negocios en la mitad de sus mercados podrás manipular los precios.'));
    if (control >= 0.5) {
      const row = h('div', { class: 'soc-manip-row' });
      for (const g of GOOD_IDS) {
        row.appendChild(h('div', { class: 'soc-manip-good' },
          h('span', { html: goodIcon(g, 24) }),
          button('▼', () => manipulate(g, 0.55), { small: true, kind: 'ghost', tip: `Hundir ${goodInfo(g).name}`, disabled: G.run.player.influence < 20 }),
          button('▲', () => manipulate(g, 1.8), { small: true, kind: 'ghost', tip: `Disparar ${goodInfo(g).name}`, disabled: G.run.player.influence < 20 })));
      }
      box.appendChild(row);
    }
    return box;
  };

  const manipulate = (g: GoodId, mult: number) => {
    if (!res.spend('influence', 20)) return;
    marketShock(locationId, g, mult, 4, `Alguien movió el mercado de ${goodInfo(g).name.toLowerCase()} en ${locName(locationId)}.`);
    const l = G.run.locations[locationId];
    if (l) l.price[g] = Math.round(l.price[g] * (mult > 1 ? 1.4 : 0.7) * 10) / 10;
    audio.sfx('cast_luck');
    say(mult > 1 ? (m.duende ? '¡A la gran! ¡Todo el mundo quiere comprar de repente!' : '¿Qué pasó? ¡Todo el mundo quiere comprar de repente!') : (m.duende ? '¡Púchica! ¡Nadie quiere comprar nada!' : '¡Nadie quiere comprar nada! ¿Qué está pasando?'), 'surprised');
    render();
  };

  render();
  await w.closed;
}
