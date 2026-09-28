/**
 * Veintiuno del Tarot — blackjack with a Spanish 48-card deck (1–9, Sota, Caballo, Rey = 10) ×2 + seven Arcanos Mayores:
 * El Loco (swap your last card with the dealer's), La Torre (discard & redeal your hand), El Mundo (instant 21),
 * El Sol (reveals the hole card), La Luna (your next card comes face down), La Muerte (the round restarts),
 * La Rueda de la Fortuna (the hand pays — or costs — double). Natural pays 3:2, dealer stands on 17.
 * Cheat: Dominar Mente on the goblin dealer (see hole + next card, burn one card). Luck: slippery bust cards.
 */
import { h } from '../../ui/dom';
import { audio } from '../../audio';
import { engine } from '../../core/engine';
import { fmt } from '../../core/math';
import { res } from '../../core/state';
import { portraitSVG, type PortraitMood } from '../../ui/art/portraits';
import { cs, bet as takeBet, settle, luck, rerollCount, betLadder, canBet } from '../state';
import { cardSVG, cardBackSVG, ARCANA_INFO, type TCard, type Suit, type Arcana } from '../art';
import { winBanner, tierFor, coinBurst, centerOf, shakeEl, sparkleAt } from '../fx2d';
import { gameHeader, betPicker, rulesSheet, bigAction, bubble, cheatButton } from '../ui';
import { cheatRoll, cleanRound, improbable } from '../security';
import { reactWin } from '../tiburcio';
import type { GameCtx, GameView } from '../types';

const BETS = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000];
const SUITS: Suit[] = ['espadas', 'copas', 'oros', 'bastos'];
const ARCANA: Arcana[] = ['loco', 'torre', 'mundo', 'sol', 'luna', 'muerte', 'rueda'];

interface Card extends TCard { hidden?: boolean; el?: HTMLElement }
interface Hand { cards: Card[]; stake: number; done: boolean; doubled: boolean; bust: boolean; natural: boolean; rueda: boolean; world: boolean; surrendered: boolean; el: HTMLElement; totalEl: HTMLElement }

const cardValue = (c: TCard) => (c.rank ?? 0) >= 10 ? 10 : c.rank ?? 0;
function total(cards: Card[], includeHidden = true): { t: number; soft: boolean; unknown: boolean } {
  let t = 0, aces = 0, unknown = false;
  for (const c of cards) {
    if (c.arcana) continue;
    if (c.hidden && !includeHidden) { unknown = true; continue; }
    const v = cardValue(c);
    if (v === 1) aces++;
    t += v;
  }
  let soft = false;
  if (aces > 0 && t + 10 <= 21) { t += 10; soft = true; }
  return { t, soft, unknown };
}

let shoe: Card[] = [];
function freshShoe(): Card[] {
  const d: Card[] = [];
  let k = 0;
  for (let deck = 0; deck < 2; deck++) for (const s of SUITS) for (let r = 1; r <= 12; r++) d.push({ id: `c${k++}`, suit: s, rank: r });
  for (const a of ARCANA) d.push({ id: `a_${a}`, arcana: a });
  for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
  return d;
}

export function openTarot(ctx: GameCtx): GameView {
  const { host } = ctx;
  const s = cs();
  if (shoe.length < 30) shoe = freshShoe();
  let phase: 'bet' | 'busy' | 'player' | 'done' = 'bet';
  let dealer: Card[] = [];
  let hands: Hand[] = [];
  let active = 0;
  let solRevealed = false;
  let lunaNext = false;
  let rerollLeft = rerollCount();
  let luckSaved = false;
  let mindUsed = false;
  let restarts = 0;
  let baseStake = 0;
  let dealerTurn = false;
  let dealerWorld = false;
  let dealing = false;
  let settled = true;

  // ───────────── DOM ─────────────
  const dealerFace = h('div', { class: 'cs-bj-dealer-face' });
  const setDealerMood = (m: PortraitMood) => { dealerFace.innerHTML = portraitSVG({ seed: 'crupier_tarot', race: 'duende', job: 'crupier', gender: 'f', mood: m }, 130); };
  setDealerMood('smile');
  const dealerRow = h('div', { class: 'cs-bj-row dealer' });
  const dealerTotal = h('div', { class: 'cs-bj-total' });
  const handsWrap = h('div', { class: 'cs-bj-hands' });
  const shoeEl = h('div', { class: 'cs-bj-shoe', html: cardBackSVG(78) });
  const arcanaStage = h('div', { class: 'cs-bj-arcana' });
  const status = h('div', { class: 'cs-bj-status' });
  const picker = betPicker(betLadder(BETS), 100, () => undefined, { label: 'Apuesta' });
  const dealBtn = bigAction('REPARTIR', () => void deal());
  const act = (label: string, key: string, fn: () => void) => h('button', { class: 'cs-btn cs-bj-act', onclick: fn }, label, h('span', { class: 'lx-kbd' }, key)) as HTMLButtonElement;
  const hitBtn = act('Pedir', 'P', () => void hit());
  const standBtn = act('Plantarse', 'S', () => void stand());
  const doubleBtn = act('Doblar', 'D', () => void doDouble());
  const splitBtn = act('Dividir', 'V', () => void split());
  const surrBtn = act('Rendirse', 'R', () => void surrender());
  const rerollBtn = h('button', { class: 'cs-btn gold cs-pulse', style: 'display:none' }, '⚀ ¡Volver a tirar tu última carta! (Dado de Hueso de Dios)') as HTMLButtonElement;
  const cheatSlot = h('div', { class: 'cs-bj-cheat' });
  const actions = h('div', { class: 'cs-bj-actions' }, hitBtn, standBtn, doubleBtn, splitBtn, surrBtn);
  const betRow = h('div', { class: 'cs-bj-betrow' }, picker.el, dealBtn);
  const rules = rulesSheet('Veintiuno del Tarot', h('div', null,
    h('p', null, 'Baraja española doble (As, 2–9, Sota, Caballo, Rey) con ', h('b', null, 'siete Arcanos Mayores'), ' barajados. Figuras valen 10, el As 1 u 11.'),
    h('p', null, h('b', null, 'Veintiuno natural'), ' (As + figura) paga 3 a 2. El crupier se planta en 17. Puedes doblar con dos cartas, dividir parejas y rendirte (recuperas la mitad).'),
    h('table', null, ...(Object.keys(ARCANA_INFO) as Arcana[]).map((a) => h('tr', null, h('td', null, h('b', null, `${ARCANA_INFO[a].num} · ${ARCANA_INFO[a].name}`)), h('td', null, ARCANA_INFO[a].effect)))),
    h('p', { class: 'muted' }, 'Los Arcanos que saca el crupier también lo afectan a él (La Torre, El Mundo, La Muerte, La Rueda, El Loco). Oro del juego.')));
  const table = h('div', { class: 'cs-bj-table' },
    h('div', { class: 'cs-bj-felt-text' }, 'VEINTIUNO DEL TAROT · EL NATURAL PAGA 3 A 2 · EL CRUPIER SE PLANTA EN 17'),
    h('div', { class: 'cs-bj-dealer' }, dealerFace, h('div', { class: 'cs-bj-dealer-hand' }, dealerRow, dealerTotal)),
    shoeEl, arcanaStage, status, handsWrap,
    h('div', { class: 'cs-bj-bottom' }, actions, betRow, h('div', { class: 'cs-bj-extra' }, rerollBtn, cheatSlot)));
  const root = h('div', { class: 'cs-game cs-tarot' },
    gameHeader('tarot', 'Veintiuno del Tarot', 'La crupier lee las cartas… y a ti', () => host.back(), h('button', { class: 'cs-btn small', onclick: () => rules.toggle() }, 'Reglas y Arcanos')),
    table, rules.el);
  ctx.root.appendChild(root);

  const wait = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));
  const say = (t: string, ms = 2200) => bubble(dealerFace, t, ms);

  function refreshButtons(): void {
    const hnd = hands[active];
    const inPlay = phase === 'player' && !!hnd && !hnd.done;
    const two = inPlay && hnd.cards.filter((c) => !c.arcana).length === 2 && !hnd.doubled;
    hitBtn.disabled = !inPlay;
    standBtn.disabled = !inPlay;
    doubleBtn.disabled = !(two && canBet(hnd.stake));
    const v = two ? hnd.cards.filter((c) => !c.arcana) : [];
    splitBtn.disabled = !(two && hands.length === 1 && v.length === 2 && cardValue(v[0]) === cardValue(v[1]) && canBet(hnd.stake));
    surrBtn.disabled = !(two && hands.length === 1);
    actions.classList.toggle('off', !inPlay);
    betRow.classList.toggle('off', phase !== 'bet' && phase !== 'done');
    dealBtn.disabled = phase === 'busy' || phase === 'player';
    picker.disable(phase === 'busy' || phase === 'player');
    renderCheat();
  }

  function renderCheat(): void {
    cheatSlot.innerHTML = '';
    if (phase !== 'player' || mindUsed) return;
    const b = cheatButton('dominar_mente', 'Dominar Mente al crupier', 14, 'La crupier te muestra su carta oculta y la siguiente del mazo. Puedes ordenarle quemar esa carta.', () => void dominate());
    if (b) cheatSlot.appendChild(b);
  }

  // ───────────── cards ─────────────
  function cardEl(c: Card, faceDown: boolean): HTMLElement {
    const el = h('div', { class: `cs-c3 ${faceDown ? '' : 'up'} ${c.arcana ? 'arc' : ''}` },
      h('div', { class: 'cs-c3-in' }, h('div', { class: 'cs-c3-face back', html: cardBackSVG(92) }), h('div', { class: 'cs-c3-face front', html: cardSVG(c, 92) })));
    c.el = el;
    return el;
  }
  function flyIn(el: HTMLElement): Promise<void> {
    const from = shoeEl.getBoundingClientRect();
    const to = el.getBoundingClientRect();
    const dx = from.left - to.left, dy = from.top - to.top;
    audio.sfx('card_deal', { pitch: 0.9 + Math.random() * 0.25 });
    const a = el.animate([{ transform: `translate(${dx}px, ${dy}px) rotate(-18deg) scale(0.85)`, opacity: 0.4 }, { transform: 'none', opacity: 1 }], { duration: 360, easing: 'cubic-bezier(.2,.9,.3,1)' });
    // WAAPI pauses in hidden tabs: never let the round hang on an animation
    return Promise.race([a.finished.then(() => undefined).catch(() => undefined), wait(420)]);
  }
  function flip(c: Card, up: boolean): void { if (!c.el) return; c.el.classList.toggle('up', up); if (up) audio.sfx('card_flip'); }
  function draw(): Card {
    if (shoe.length < 12) { shoe = freshShoe(); say('Barajo de nuevo, patojo. Ojo con los Arcanos…'); }
    return shoe.pop()!;
  }

  function renderTotals(): void {
    const dt = total(dealer, false);
    const hiddenD = dealer.some((c) => c.hidden && !solRevealed);
    dealerTotal.textContent = dealer.length ? (dealerWorld ? '21 · EL MUNDO' : hiddenD ? `${total(dealer.filter((c) => !c.hidden)).t} + ?` : String(total(dealer).t)) : '';
    void dt;
    hands.forEach((hd, i) => {
      const t = total(hd.cards, false);
      hd.totalEl.textContent = hd.surrendered ? 'Rendido' : hd.world ? '21 · EL MUNDO' : `${t.t}${t.unknown ? ' + ?' : ''}${t.soft && t.t <= 21 && !t.unknown ? ' (suave)' : ''}${hd.rueda ? ' · RUEDA ×2' : ''}`;
      hd.el.classList.toggle('active', phase === 'player' && i === active && hands.length > 1);
      hd.el.classList.toggle('bust', hd.bust);
    });
  }

  function newHand(stake: number): Hand {
    const totalEl = h('div', { class: 'cs-bj-total' });
    const row = h('div', { class: 'cs-bj-row' });
    const chip = h('div', { class: 'cs-bj-stake' }, fmt(stake));
    const el = h('div', { class: 'cs-bj-hand' }, row, h('div', { class: 'cs-bj-hand-foot' }, chip, totalEl));
    handsWrap.appendChild(el);
    return { cards: [], stake, done: false, doubled: false, bust: false, natural: false, rueda: false, world: false, surrendered: false, el, totalEl };
  }
  const handRow = (hd: Hand) => hd.el.querySelector('.cs-bj-row') as HTMLElement;
  const setStake = (hd: Hand) => { const c = hd.el.querySelector('.cs-bj-stake'); if (c) c.textContent = fmt(hd.stake); };

  /** Deal one card to a hand (player hand index or 'dealer'). Resolves arcana effects. Returns false if the round restarted. */
  async function give(to: Hand | 'dealer', faceDown = false): Promise<boolean> {
    let c = draw();
    const isPlayer = to !== 'dealer';
    // luck: a card that would bust you slips out of the dealer's fingers (once per round)
    if (isPlayer && !c.arcana && !luckSaved && total([...(to as Hand).cards, c]).t > 21 && Math.random() < luck() * 0.45) {
      shoe.unshift(c); c = draw(); luckSaved = true; say('¡Uy! Se me resbaló… ¡qué suerte más shute!');
      audio.sfx('cast_luck'); sparkleAt(centerOf(handsWrap).x, centerOf(handsWrap).y, 16, '#7dffb0');
    }
    const hidden = isPlayer && lunaNext && !c.arcana;
    if (hidden) lunaNext = false;
    c.hidden = hidden || (faceDown && !c.arcana);
    const row = isPlayer ? handRow(to as Hand) : dealerRow;
    const el = cardEl(c, c.hidden || false);
    row.appendChild(el);
    (isPlayer ? (to as Hand).cards : dealer).push(c);
    await flyIn(el);
    if (!c.hidden && !c.arcana) flip(c, true);
    if (c.arcana) { flip(c, true); return arcanaEffect(c, to, faceDown); }
    renderTotals();
    return true;
  }

  async function showArcana(c: Card): Promise<void> {
    const a = c.arcana!;
    const info = ARCANA_INFO[a];
    arcanaStage.innerHTML = '';
    arcanaStage.append(h('div', { class: 'cs-bj-arc-card', html: cardSVG(c, 150) }), h('div', { class: 'cs-bj-arc-text' }, h('div', { class: 'cs-bj-arc-name' }, info.name), h('div', { class: 'cs-bj-arc-eff' }, info.effect)));
    arcanaStage.classList.add('show');
    audio.sfx('card_flip'); audio.sfx(a === 'muerte' ? 'heartbeat' : a === 'torre' ? 'thunder' : a === 'sol' ? 'cast_light' : a === 'luna' ? 'whisper' : a === 'mundo' ? 'level_up' : a === 'rueda' ? 'wheel_tick' : 'glitch');
    engine.pipeline.chromaticPulse(0.8, 0.6);
    engine.pipeline.flash(a === 'muerte' ? '#2a0a3a' : a === 'sol' ? '#fff0b0' : '#c7a2ff', 0.25, 0.5);
    await wait(1500);
    arcanaStage.classList.remove('show');
    await wait(220);
  }

  async function arcanaEffect(c: Card, to: Hand | 'dealer', faceDown = false): Promise<boolean> {
    const a = c.arcana!;
    await showArcana(c);
    // the arcana card leaves the hand
    const list = to === 'dealer' ? dealer : to.cards;
    list.splice(list.indexOf(c), 1);
    c.el?.classList.add('gone');
    window.setTimeout(() => c.el?.remove(), 350);
    const isPlayer = to !== 'dealer';
    if (a === 'muerte') {
      if (restarts < 2) { restarts++; say('La Muerte… volvemos a empezar, patojo.'); return false; }
      say('La Muerte ya pasó dos veces. La dejo ir.');
      return give(to, faceDown);
    }
    if (a === 'mundo') {
      if (isPlayer) { (to as Hand).world = true; say('¡El Mundo! Veintiuno para vos.'); audio.sfx('slot_win_small'); }
      else { dealerWorld = true; say('El Mundo me sonríe a mí. Veintiuno de la casa.'); }
      renderTotals();
      return true;
    }
    if (a === 'torre') {
      const hdCards = isPlayer ? (to as Hand).cards : dealer;
      for (const x of hdCards) { x.el?.classList.add('gone'); const el = x.el; window.setTimeout(() => el?.remove(), 350); }
      hdCards.length = 0;
      shakeEl(table); audio.sfx('explosion', { volume: 0.5 });
      await wait(380);
      // during the opening deal the sequence itself deals the rest: replace just this card
      if (dealing) return give(to, faceDown);
      if (!(await give(to))) return false;
      return give(to, !isPlayer && !dealerTurn && !solRevealed);
    }
    if (a === 'sol') {
      if (isPlayer) { solRevealed = true; for (const x of dealer) if (x.hidden) flip(x, true); say('El Sol no deja secretos. Ahí tenés mi carta.'); renderTotals(); }
      return give(to, faceDown);
    }
    if (a === 'luna') {
      if (isPlayer) { lunaNext = true; say('La Luna… tu próxima carta nadie la ve. Ni vos.'); }
      return give(to, faceDown);
    }
    if (a === 'rueda') {
      const hd = isPlayer ? (to as Hand) : hands[active] ?? hands[0];
      if (hd && !hd.rueda) {
        if (takeBet('tarot', hd.stake)) { hd.stake *= 2; hd.rueda = true; setStake(hd); say('¡La Rueda gira! Esta mano vale el doble.'); audio.sfx('chip_place'); }
        else say('La Rueda quiso girar, pero no te alcanza el oro. Suerte la tuya.');
      }
      renderTotals();
      return give(to, faceDown);
    }
    if (a === 'loco') {
      const up = dealer.find((x) => !x.hidden && !x.arcana);
      const hd = isPlayer ? (to as Hand) : hands[active] ?? hands[0];
      const mine = hd ? [...hd.cards].reverse().find((x) => !x.arcana && !x.hidden) : undefined;
      if (up && mine && hd) {
        const di = dealer.indexOf(up), pi = hd.cards.indexOf(mine);
        dealer[di] = mine; hd.cards[pi] = up;
        const upEl = up.el!, mineEl = mine.el!;
        const ph = h('span'); upEl.replaceWith(ph); mineEl.replaceWith(upEl); ph.replaceWith(mineEl);
        audio.sfx('teleport'); say('¡El Loco! Tu carta por la mía. ¿Quién sale ganando?');
        renderTotals();
        return true;
      }
      return give(to, faceDown);
    }
    return true;
  }

  // ───────────── round ─────────────
  async function deal(): Promise<void> {
    if (phase === 'busy' || phase === 'player' || !ctx.alive()) return;
    const stake = picker.value();
    if (!takeBet('tarot', stake)) { say('No te alcanza, patojo.'); audio.sfx('ui_error'); return; }
    if (await host.raidCheck('tarot', stake)) return;
    restarts = 0;
    baseStake = stake;
    await dealRound(stake);
  }

  async function dealRound(stake: number): Promise<void> {
    phase = 'busy';
    dealerRow.innerHTML = ''; handsWrap.innerHTML = ''; status.textContent = ''; status.className = 'cs-bj-status';
    dealer = []; hands = [newHand(stake)]; active = 0;
    solRevealed = false; lunaNext = false; luckSaved = false; mindUsed = false; dealerTurn = false; dealerWorld = false;
    settled = false;
    rerollBtn.style.display = 'none';
    setDealerMood('smile');
    refreshButtons();
    audio.sfx('card_deal');
    const seq: Array<[Hand | 'dealer', boolean]> = [[hands[0], false], ['dealer', false], [hands[0], false], ['dealer', true]];
    dealing = true;
    for (const [to, fd] of seq) {
      if (!ctx.alive()) return;
      if (!(await give(to, fd))) { dealing = false; await restartRound(); return; }
      await wait(120);
    }
    dealing = false;
    // naturals
    const p = hands[0];
    p.natural = total(p.cards).t === 21 && p.cards.length === 2 && !p.cards.some((c) => c.hidden);
    const dNat = total(dealer).t === 21 && dealer.length === 2;
    if (p.world && p.cards.length <= 2) p.natural = true;
    if (p.natural || dNat || p.world) {
      await revealDealer();
      if (p.natural && !dNat) { status.textContent = '¡VEINTIUNO!'; status.classList.add('good'); }
      return finish();
    }
    phase = 'player';
    refreshButtons();
    renderTotals();
  }

  async function restartRound(): Promise<void> {
    const stake = hands.reduce((a, hd) => a + hd.stake, 0);
    for (const c of [...dealer, ...hands.flatMap((hd) => hd.cards)]) if (!c.arcana) shoe.unshift({ id: c.id, suit: c.suit, rank: c.rank });
    engine.pipeline.flash('#1a0a2a', 0.6, 0.8);
    audio.sfx('page_turn');
    await wait(600);
    const extra = stake - baseStake;
    if (extra > 0) res.add('gold', extra, { raw: true });
    await dealRound(baseStake);
  }

  async function hit(): Promise<void> {
    if (phase !== 'player') return;
    const hd = hands[active];
    phase = 'busy'; refreshButtons();
    if (!(await give(hd))) { await restartRound(); return; }
    await afterCard(hd);
  }

  async function afterCard(hd: Hand): Promise<void> {
    const hidden = hd.cards.some((c) => c.hidden);
    const vis = total(hd.cards, false).t;
    const tru = total(hd.cards, true).t;
    if (hd.world || (!hidden && tru === 21)) { hd.done = true; }
    else if ((hidden && vis > 21) || (!hidden && tru > 21)) {
      status.textContent = '¡TE PASASTE!'; status.className = 'cs-bj-status bad show';
      audio.sfx('crowd_gasp'); shakeEl(hd.el); setDealerMood('smug');
      renderTotals();
      if (rerollLeft > 0 && (await offerReroll())) {
        rerollLeft--;
        const last = [...hd.cards].reverse().find((c) => !c.arcana);
        if (last) { hd.cards.splice(hd.cards.indexOf(last), 1); last.el?.classList.add('gone'); const el = last.el; window.setTimeout(() => el?.remove(), 350); }
        audio.sfx('dice_roll'); audio.sfx('cast_luck');
        status.textContent = ''; status.className = 'cs-bj-status';
        await wait(320);
        if (!(await give(hd))) { await restartRound(); return; }
        return afterCard(hd);
      }
      hd.bust = true; hd.done = true;
    }
    renderTotals();
    await nextHand();
  }

  function offerReroll(): Promise<boolean> {
    return new Promise((resolve) => {
      rerollBtn.style.display = '';
      const t = window.setTimeout(() => done(false), 4500);
      const done = (v: boolean) => { window.clearTimeout(t); rerollBtn.style.display = 'none'; rerollBtn.onclick = null; resolve(v); };
      rerollBtn.onclick = () => done(true);
    });
  }

  async function stand(): Promise<void> {
    if (phase !== 'player') return;
    hands[active].done = true;
    audio.sfx('ui_confirm');
    await nextHand();
  }

  async function doDouble(): Promise<void> {
    if (phase !== 'player') return;
    const hd = hands[active];
    if (!takeBet('tarot', hd.stake)) return;
    hd.stake *= 2; hd.doubled = true; setStake(hd);
    audio.sfx('chip_place');
    phase = 'busy'; refreshButtons();
    if (!(await give(hd))) { await restartRound(); return; }
    hd.done = true;
    if (total(hd.cards).t > 21 && !hd.cards.some((c) => c.hidden)) { hd.bust = true; status.textContent = '¡TE PASASTE!'; status.className = 'cs-bj-status bad show'; }
    renderTotals();
    await nextHand();
  }

  async function split(): Promise<void> {
    if (phase !== 'player' || hands.length > 1) return;
    const hd = hands[0];
    if (!takeBet('tarot', hd.stake)) return;
    phase = 'busy'; refreshButtons();
    const second = newHand(hd.stake);
    const moved = hd.cards.pop()!;
    second.cards.push(moved);
    if (moved.el) handRow(second).appendChild(moved.el);
    hands.push(second);
    audio.sfx('card_deal');
    if (!(await give(hd))) { await restartRound(); return; }
    if (!(await give(second))) { await restartRound(); return; }
    phase = 'player'; active = 0;
    renderTotals(); refreshButtons();
  }

  async function surrender(): Promise<void> {
    if (phase !== 'player') return;
    const hd = hands[0];
    hd.surrendered = true; hd.done = true;
    say('Sabia retirada. Te devuelvo la mitad.');
    await finish();
  }

  async function nextHand(): Promise<void> {
    while (active < hands.length && hands[active].done) active++;
    if (active < hands.length) { phase = 'player'; renderTotals(); refreshButtons(); return; }
    phase = 'busy'; refreshButtons();
    if (hands.every((hd) => hd.bust && !hd.cards.some((c) => c.hidden))) { await revealDealer(); return finish(); }
    await dealerPlay();
  }

  async function revealDealer(): Promise<void> {
    for (const c of dealer) if (c.hidden) { c.hidden = false; flip(c, true); await wait(260); }
    for (const hd of hands) for (const c of hd.cards) if (c.hidden) { c.hidden = false; flip(c, true); await wait(260); }
    renderTotals();
  }

  async function dealerPlay(): Promise<void> {
    await revealDealer();
    dealerTurn = true;
    let guard = 0;
    while (!dealerWorld && total(dealer).t < 17 && guard++ < 12 && ctx.alive()) {
      await wait(420);
      if (!(await give('dealer'))) { await restartRound(); return; }
      renderTotals();
    }
    await finish();
  }

  async function finish(): Promise<void> {
    phase = 'busy';
    await revealDealer();
    const dt = dealerWorld ? 21 : total(dealer).t;
    const dBust = dt > 21;
    let staked = 0, returned = 0;
    const lines: string[] = [];
    for (const hd of hands) {
      staked += hd.stake;
      const pt = hd.world ? 21 : total(hd.cards).t;
      let r = 0;
      if (hd.surrendered) { r = Math.floor(hd.stake / 2); lines.push('Rendido'); }
      else if (pt > 21) { r = 0; lines.push('Te pasaste'); }
      else if (hd.natural && !(dt === 21 && dealer.length === 2)) { r = Math.floor(hd.stake * 2.5); lines.push('¡Veintiuno natural!'); }
      else if (dBust) { r = hd.stake * 2; lines.push('El crupier se pasa'); }
      else if (pt > dt) { r = hd.stake * 2; lines.push(`Ganas ${pt} a ${dt}`); }
      else if (pt === dt) { r = hd.stake; lines.push(`Empate a ${pt}`); }
      else { r = 0; lines.push(`La casa gana ${dt} a ${pt}`); }
      returned += r;
    }
    host.hud.holdGold();
    settled = true;
    const res2 = settle('tarot', staked, returned);
    if (res2.net > 0) improbable(hands.some((hd) => hd.natural) ? 0.05 : 0.5); else cleanRound();
    status.textContent = lines.join(' · ');
    status.className = `cs-bj-status show ${res2.net > 0 ? 'good' : res2.net < 0 ? 'bad' : ''}`;
    const origin = centerOf(handsWrap);
    if (res2.net > 0) {
      setDealerMood('surprised');
      coinBurst(origin.x, origin.y, Math.min(60, 14 + Math.floor(res2.net / Math.max(1, staked) * 10)));
      const tier = tierFor(res2.net, staked);
      if (tier === 'big' || tier === 'mega') { host.celebrate(2); await winBanner(tier, res2.net, { origin }); host.say(reactWin(res2.net)); }
      else { host.celebrate(1); audio.sfx('slot_win_small'); if (hands.some((hd) => hd.natural)) await winBanner('win', res2.net, { origin, sub: 'VEINTIUNO NATURAL' }); }
      say(['¡A la gran! Bien jugado.', 'Hoy las cartas te quieren, patojo.', '¡Qué chilero! …para vos.'][Math.floor(Math.random() * 3)]);
    } else if (res2.net < 0) {
      setDealerMood('smug'); host.gloat();
      say(['La casa agradece, patojo.', 'Otra mano y te recuperás. O no.', 'Así es el Tarot: nunca dice lo que querés oír.'][Math.floor(Math.random() * 3)]);
    } else { say('Empate. Nadie llora, nadie ríe.'); audio.sfx('coin'); }
    host.hud.releaseGold();
    phase = 'done';
    picker.setLadder(betLadder(BETS));
    refreshButtons();
    host.hud.refresh('tarot');
  }

  async function dominate(): Promise<void> {
    if (mindUsed || phase !== 'player') return;
    mindUsed = true;
    res.spend('mana', 14);
    audio.sfx('mind_control');
    engine.pipeline.setMind(0.55);
    setDealerMood('mind');
    const roll = cheatRoll('tarot', 'dominar_mente', 0.8, 0.18);
    await wait(700);
    engine.pipeline.setMind(0);
    if (roll.caught) {
      setDealerMood('angry');
      say('¡¿Qué me estás haciendo en la cabeza?! ¡SEGURIDAD!', 1800);
      await wait(1200);
      const staked = hands.reduce((a, hd) => a + hd.stake, 0);
      phase = 'done';
      settled = true;
      settle('tarot', staked, 0);
      await host.caught('tarot', 'Le metiste las manos en la cabeza a la crupier');
      return;
    }
    for (const c of dealer) if (c.hidden) flip(c, true);
    const next = shoe[shoe.length - 1];
    const name = next.arcana ? ARCANA_INFO[next.arcana].name : `${next.rank === 10 ? 'Sota' : next.rank === 11 ? 'Caballo' : next.rank === 12 ? 'Rey' : next.rank === 1 ? 'As' : next.rank} de ${next.suit}`;
    const peek = h('div', { class: 'cs-bj-peek' }, h('div', { class: 'cs-bj-peek-t' }, 'Siguiente carta del mazo'), h('div', { html: cardSVG(next, 84) }),
      h('button', { class: 'cs-btn red small', onclick: () => { shoe.pop(); audio.sfx('fire_burst'); peek.remove(); say('…quemo esa carta. No sé por qué.'); } }, 'Ordenar: quémala'),
      h('button', { class: 'cs-btn small', onclick: () => peek.remove() }, 'Dejarla'));
    table.appendChild(peek);
    say(`…mi carta oculta es esa… y la siguiente… ${name}…`, 3000);
    if (roll.noticed) host.say('Esa crupier anda rara hoy… ¿vos le hiciste algo?', { mood: 'angry' });
    renderCheat();
  }

  refreshButtons();
  say('¿Una mano, patojo? Los Arcanos andan inquietos hoy.', 2600);

  return {
    onKey(e: KeyboardEvent) {
      if (e.repeat) return false;
      if (e.code === 'Space' || e.code === 'Enter') { if (phase === 'bet' || phase === 'done') void deal(); else if (phase === 'player') void stand(); return true; }
      if (phase !== 'player') return false;
      if (e.code === 'KeyP') { void hit(); return true; }
      if (e.code === 'KeyS') { void stand(); return true; }
      if (e.code === 'KeyD' && !doubleBtn.disabled) { void doDouble(); return true; }
      if (e.code === 'KeyV' && !splitBtn.disabled) { void split(); return true; }
      if (e.code === 'KeyR' && !surrBtn.disabled) { void surrender(); return true; }
      return false;
    },
    close() {
      if (!settled && hands.length) {
        // leaving mid-hand forfeits it (stakes already taken)
        settled = true;
        const staked = hands.reduce((a, hd) => a + hd.stake, 0);
        if (staked > 0) settle('tarot', staked, 0);
      }
      host.hud.releaseGold();
      engine.pipeline.setMind(0);
      root.remove();
      void s;
    },
  };
}
