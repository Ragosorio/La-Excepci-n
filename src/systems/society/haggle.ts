/**
 * Regateo (GDD §4.8): offer / counter-offer against a merchant's hidden reservation price and visible patience.
 * Fear, Presencia and reputation help; insulting offers burn patience fast; Dominar Mente is the shortcut.
 */
import { G, res } from '../../core/state';
import { rng } from '../../core/rng';
import { track } from '../../core/tracker';
import { fmt } from '../../core/math';
import { h, layer, removeAnimated } from '../../ui/dom';
import { button } from '../../ui/widgets';
import { portraitSVG, type PortraitMood } from '../../ui/art/portraits';
import { audio } from '../../audio';
import type { GoodId } from '../../data/types';
import { goodInfo } from './economy';
import { repValue, tierOf } from './factions';
import { goodIcon } from './icons';
import type { Merchant } from './market';
import { continentOf, knowsAbility, luna, presence, soc, veloActive } from './state';
import { mindPulse, popText, shakeEl } from './uifx';

export interface HaggleOpts { side: 'buy' | 'sell'; good: GoodId; qty: number; asking: number; merchant: Merchant; locationId: string }

const OPEN_BUY = ['{p}. Ni una moneda menos.', 'Por {p} se lo lleva. Es un regalo, créame.', '{p}, y porque me cae bien.'];
const OPEN_SELL = ['Le doy {p}. Y es mucho.', '{p}. Tómelo o déjelo. Mejor tómelo.', 'Por eso, {p}. Estoy siendo generoso.'];
const INSULT = ['¿Me está tomando el pelo?', '¡Eso es un insulto a mis abuelos!', '¿Y por qué no me pide también el puesto?', 'Jaja. No.'];
const CLOSE = ['Hmm... se está acercando.', 'Casi, casi.', 'Me está haciendo sudar, eh.'];
const COUNTER_BUY = ['Mire, por ser usted: {p}.', 'Le dejo en {p}. Y me arruino.', '{p}. Última oferta. Bueno, penúltima.'];
const COUNTER_SELL = ['Subo a {p}. No más.', '{p}, y me duele.', 'Le doy {p}. Estoy loco.'];
const DEAL = ['¡Trato hecho!', 'Hecho. Me robó, pero hecho.', '¡Vendido! Y conste que usted ganó.'];
const WALK = ['¡Fuera de mi puesto!', 'Se acabó. No le vendo ni el aire.', 'Váyase a regatear a otra luna.'];
const D_INSULT = ['¡A la gran! ¿Me querés ver la cara de baboso?', '¡Púchica, vos! ¡Eso ni para chicles!'];
const D_DEAL = ['¡Chilero! ¡Trato hecho, patojo!', '¡Va pues! Me sacaste el pisto, pero va.'];

const pick = <T,>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)];

/** Resolves with the agreed total price, or null if the deal fell through. */
export function haggle(o: HaggleOpts): Promise<number | null> {
  return new Promise((resolve) => {
    const s = soc();
    const blockKey = `haggle_block_${o.locationId}`;
    const buy = o.side === 'buy';
    const m = o.merchant;
    const t = m.traits;
    const loc = G.run.locations[o.locationId];
    const cont = continentOf(o.locationId);
    let r = buy ? 0.86 : 1.14;
    const dir = buy ? 1 : -1;
    if (t.includes('codicioso')) r += 0.05 * dir;
    if (t.includes('cobarde')) r -= 0.04 * dir;
    r -= presence() * 0.004 * dir;
    if ((loc?.fear ?? 0) >= 60) r -= 0.05 * dir;
    if (cont) r -= (tierOf(repValue(cont)).index - 3) * 0.01 * dir;
    r += rng.range(-0.03, 0.03);
    r = buy ? Math.max(0.68, Math.min(0.97, r)) : Math.max(1.03, Math.min(1.35, r));
    let reserve = Math.round(o.asking * r);
    let counter = o.asking;
    let patience = 100 * (t.includes('sabio') ? 1.2 : 1) * (t.includes('codicioso') ? 0.85 : 1);
    const maxPatience = patience;
    const lo = buy ? Math.round(o.asking * 0.5) : o.asking;
    const hi = buy ? o.asking : Math.round(o.asking * 1.6);
    let offer = buy ? Math.round(o.asking * 0.85) : Math.round(o.asking * 1.15);
    let intimidated = false;
    let done = false;
    track('haggles');

    const portraitEl = h('div', { class: 'soc-haggle-portrait', html: portraitSVG(m.spec('smug'), 320) });
    const bub = h('div', { class: 'soc-bubble big' });
    const patFill = h('div', { class: 'soc-pat-fill' });
    const patBar = h('div', { class: 'soc-pat' }, h('div', { class: 'soc-pat-label' }, 'Paciencia'), h('div', { class: 'soc-pat-bar' }, patFill));
    const askEl = h('b', null, fmt(counter));
    const offerEl = h('b', { class: 'soc-offer-val' }, fmt(offer));
    const deltaEl = h('span', { class: 'soc-offer-delta' });
    const slider = h('input', { type: 'range', class: 'lx-range soc-slider', min: String(lo), max: String(hi), step: String(Math.max(1, Math.round(o.asking / 200))), value: String(offer) }) as HTMLInputElement;
    const hist = h('div', { class: 'soc-haggle-hist' });
    const actions = h('div', { class: 'lx-btn-row soc-haggle-actions' });
    const box = h('div', { class: 'lx-panel soc-haggle' },
      h('div', { class: 'lx-panel-title' }, h('span', { html: goodIcon(o.good, 26) }), `Regateo · ${o.qty} de ${goodInfo(o.good).name}`),
      h('div', { class: 'soc-haggle-grid' },
        portraitEl,
        h('div', { class: 'soc-haggle-right' },
          h('div', { class: 'soc-npc-name' }, m.name, h('span', null, m.title)), bub, patBar,
          h('div', { class: 'soc-haggle-nums' },
            h('div', null, buy ? 'Pide: ' : 'Ofrece: ', askEl),
            h('div', { class: 'lx-muted lx-small' }, `Precio de lista: ${fmt(o.asking)}`)),
          h('div', { class: 'soc-offer' }, h('div', null, buy ? 'Tu oferta: ' : 'Tu precio: ', offerEl, deltaEl), slider),
          actions, hist)));
    const back = h('div', { class: 'lx-modal-back soc-haggle-back' }, box);
    layer('modal').appendChild(back);

    const setMood = (mood: PortraitMood) => { portraitEl.innerHTML = portraitSVG(m.spec(mood), 320); portraitEl.classList.remove('talk'); void portraitEl.offsetWidth; portraitEl.classList.add('talk'); };
    const say = (text: string, mood: PortraitMood) => { bub.textContent = text.replace('{p}', fmt(counter)); bub.classList.remove('pop'); void bub.offsetWidth; bub.classList.add('pop'); setMood(mood); };
    const updatePat = () => {
      const k = Math.max(0, patience / maxPatience);
      patFill.style.transform = `scaleX(${k})`;
      patFill.style.background = k > 0.6 ? 'var(--good)' : k > 0.3 ? 'var(--warn)' : 'var(--blood)';
    };
    const updateOffer = () => {
      offerEl.textContent = fmt(offer);
      const pct = Math.round((offer / o.asking - 1) * 100);
      deltaEl.textContent = ` (${pct > 0 ? '+' : ''}${pct}%)`;
      deltaEl.className = `soc-offer-delta ${buy ? (pct < 0 ? 'lx-good' : '') : pct > 0 ? 'lx-good' : ''}`;
      askEl.textContent = fmt(counter);
    };
    slider.addEventListener('input', () => { offer = Number(slider.value); updateOffer(); });

    const finish = (v: number | null) => {
      if (done) return;
      done = true;
      window.removeEventListener('keydown', onKey, true);
      setTimeout(() => { void removeAnimated(back, 'lx-out', 200); resolve(v); }, v === null ? 900 : 1000);
    };
    const deal = (price: number) => {
      const saved = buy ? o.asking - price : price - o.asking;
      say(pick(m.duende ? D_DEAL : DEAL), 'smile');
      audio.sfx('coins_many');
      audio.sfx('ui_confirm');
      popText(box, saved > 0 ? `¡TRATO! ${buy ? '−' : '+'}${fmt(saved)}` : '¡TRATO!', 'var(--gold-hi)', true);
      if (saved > 0) track('haggle_saved', saved);
      actions.innerHTML = '';
      finish(price);
    };
    const walk = () => {
      say(pick(WALK), 'angry');
      audio.sfx('ui_error');
      s.flags[blockKey] = luna();
      shakeEl(box);
      actions.innerHTML = '';
      finish(null);
    };
    const log = (a: number, b: number | string) => hist.prepend(h('div', null, `Tú: ${fmt(a)} → ${typeof b === 'number' ? `${m.name}: ${fmt(b)}` : b}`));

    const doOffer = () => {
      const accept = buy ? offer >= reserve : offer <= reserve;
      if (accept) { log(offer, '¡Aceptado!'); deal(offer); return; }
      const gap = Math.abs(reserve - offer) / o.asking;
      patience -= 10 + gap * 170;
      updatePat();
      if (patience <= 0) { log(offer, 'se enfada'); walk(); return; }
      const k = rng.range(0.35, 0.6);
      counter = buy ? Math.max(reserve, Math.round(counter - (counter - reserve) * k)) : Math.min(reserve, Math.round(counter + (reserve - counter) * k));
      if (Math.abs(counter - reserve) < o.asking * 0.015) counter = reserve;
      log(offer, counter);
      updateOffer();
      if (gap > 0.18) { say(pick(m.duende ? D_INSULT : INSULT), 'angry'); audio.sfx('ui_error'); shakeEl(patBar); }
      else if (gap > 0.07) say(pick(buy ? COUNTER_BUY : COUNTER_SELL), 'neutral');
      else say(`${pick(CLOSE)} ${pick(buy ? COUNTER_BUY : COUNTER_SELL)}`, 'smile');
      renderActions();
    };
    const doIntimidate = () => {
      intimidated = true;
      const fear = loc?.fear ?? 0;
      const ok = rng.chance(0.45 + fear / 200 + presence() * 0.02 + G.run.player.titleIndex * 0.05);
      if (ok) {
        reserve = Math.round(reserve - o.asking * 0.06 * (buy ? 1 : -1));
        patience = Math.min(maxPatience, patience + 20);
        say('(Traga saliva.) E-está bien. Podemos... ajustar un poquito.', 'scared');
        audio.sfx('heartbeat');
      } else {
        patience -= 30;
        res.add('alert', 1);
        say('¿Me amenaza en mi propio puesto? ¡Qué poca vergüenza!', 'angry');
        shakeEl(patBar);
      }
      updatePat();
      if (patience <= 0) { walk(); return; }
      renderActions();
    };
    const doDominate = () => {
      if (!res.spend('mana', 20)) return;
      mindPulse(1400);
      audio.sfx('mind_control');
      track('haggle_dominated');
      if (!veloActive() && rng.chance(0.15)) res.add('alert', 3);
      const floor = buy ? Math.round(o.asking * 0.6) : Math.round(o.asking * 1.5);
      const price = buy ? Math.max(offer, floor) : Math.min(offer, floor);
      setMood('mind');
      log(price, 'ojos en espiral');
      bub.textContent = `S-sí... ${fmt(price)} me parece... justo. Muy justo.`;
      setTimeout(() => deal(price), 700);
      actions.innerHTML = '';
    };
    const renderActions = () => {
      actions.innerHTML = '';
      const btns: HTMLElement[] = [
        button('Ofrecer', doOffer, { kind: 'primary', hotkey: 'Enter' }),
        button(`Aceptar ${fmt(counter)}`, () => { log(counter, '¡Aceptado!'); deal(counter); }),
        button('Intimidar', doIntimidate, { kind: 'ghost', disabled: intimidated, tip: 'Una vez por trato. El miedo y la Presencia ayudan.' }),
      ];
      if (knowsAbility('dominar_mente')) btns.push(button('Dominar Mente', doDominate, { kind: 'ghost', disabled: G.run.player.mana < 20, tip: `−20 maná. Acepta tu oferta${veloActive() ? '' : ' (riesgo de que alguien lo note)'}.` }));
      btns.push(button('Retirarse', () => { say('Como quiera. Otro día será.', 'neutral'); actions.innerHTML = ''; finish(null); }, { kind: 'ghost' }));
      actions.append(...btns);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') { e.preventDefault(); e.stopPropagation(); if (!done) { actions.innerHTML = ''; finish(null); } }
      else if (e.code === 'Enter' && !done) { e.preventDefault(); doOffer(); }
    };
    window.addEventListener('keydown', onKey, true);

    if (s.flags[blockKey] === luna()) {
      say('No, no, no. Con usted ya no regateo. Vuelva la próxima luna.', 'angry');
      finish(null);
      return;
    }
    say(pick(buy ? OPEN_BUY : OPEN_SELL), 'smug');
    updatePat();
    updateOffer();
    renderActions();
    audio.sfx('ui_open');
  });
}
