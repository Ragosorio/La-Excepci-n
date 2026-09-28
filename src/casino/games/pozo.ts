/**
 * El Pozo de los Deseos — gacha with visible pity ("Legendaria garantizada en N deseos"; soft pity from 45, hard at 60;
 * Épica+ every 10). Coin toss → the water glows in the rarity color (announces it) → beam → card flip.
 * Relics come from RELICS by rarity (non-major, non-unique, no fixed location); duplicates become Esencia.
 */
import { h } from '../../ui/dom';
import { audio } from '../../audio';
import { engine } from '../../core/engine';
import { fmt } from '../../core/math';
import { G, res } from '../../core/state';
import { bus } from '../../core/events';
import { RELICS, DUPLICATE_ESSENCE } from '../../data/relics';
import { grantRelic, hasRelic, randomRelic } from '../../systems/progression/relics';
import type { RelicDef } from '../../data/types';
import { cs, bet as takeBet, settle, luck, gold } from '../state';
import { relicArt, rarityColor } from '../art';
import { coinBurst, centerOf, sparkleAt, soulsAt, confettiBurst } from '../fx2d';
import { gameHeader, rulesSheet } from '../ui';
import { rollWish, TABLE, WISH_COST, TEN_COST, PITY_HARD, PITY_SOFT, EPIC_PITY, DUP_ESSENCE as DUP_FALLBACK, expectedToLegend, type Rar, type WishKind } from './pozoMath';

const DUP_ESSENCE: Record<Rar, number> = { ...DUP_FALLBACK, ...(DUPLICATE_ESSENCE ?? {}) };
import type { GameCtx, GameView } from '../types';

const RAR_NAME: Record<Rar, string> = { comun: 'Común', pococomun: 'Poco común', rara: 'Rara', epica: 'Épica', legendaria: 'Legendaria' };
interface Prize { rarity: Rar; kind: 'relic' | 'essence' | 'gold'; id?: string; name: string; desc: string; svg: string; amount?: number; dup?: boolean }

function relicPool(r: Rar): RelicDef[] {
  const cyc = G.run?.cycle ?? 1;
  return Object.values(RELICS).filter((d) => d.rarity === r && !d.major && !d.unique && !d.location && (d.minCycle ?? 0) <= cyc && (!d.secret || cyc >= 2));
}

function rollPrize(r: Rar, kind: WishKind): Prize {
  if (r === 'comun') {
    const x = Math.random();
    if (x < 0.45) { const n = kind === 'mayor' ? 40 : 12; return { rarity: r, kind: 'essence', amount: n, name: 'Fragmento de Esencia', desc: `+${n} de esencia`, svg: relicArt('gema', 'comun', 110) }; }
    if (x < 0.62) { const n = kind === 'mayor' ? 450 : 60; return { rarity: r, kind: 'gold', amount: n, name: 'Bolsita de oro', desc: `+${n} de oro (el Pozo devuelve un poquito)`, svg: relicArt('moneda', 'comun', 110) }; }
  }
  const pool = relicPool(r);
  let def: RelicDef | undefined = pool[Math.floor(Math.random() * pool.length)];
  if (!def) {
    let id: string | null = null;
    try { id = randomRelic(['comun', 'pococomun', 'rara', 'epica', 'legendaria'].indexOf(r)); } catch { id = null; }
    def = id ? RELICS[id] : undefined;
  }
  if (!def) {
    const n = DUP_ESSENCE[r] * 2;
    return { rarity: r, kind: 'essence', amount: n, name: `Esencia ${RAR_NAME[r].toLowerCase()}`, desc: `+${n} de esencia`, svg: relicArt('gema', r, 110) };
  }
  const svg = relicArt(def.shape, def.rarity, 110);
  if (hasRelic(def.id)) {
    const n = DUP_ESSENCE[r];
    return { rarity: r, kind: 'essence', amount: n, id: def.id, name: def.name, desc: `Duplicada → +${n} de esencia`, svg, dup: true };
  }
  return { rarity: r, kind: 'relic', id: def.id, name: def.name, desc: def.effectText, svg };
}

function award(p: Prize): void {
  if (p.kind === 'relic' && p.id) {
    let ok = false;
    // the Pozo does its own reveal: grant silently (no extra toast per wish)
    try { ok = !!grantRelic(p.id, { reveal: false, where: 'puerto_fortuna', silent: true }); } catch { ok = false; }
    if (!ok) { res.add('essence', DUP_ESSENCE[p.rarity], { raw: true }); p.desc += ` (convertida en ${DUP_ESSENCE[p.rarity]} de esencia)`; }
    else bus.emit('casino:relic', { relicId: p.id, source: 'pozo' });
  } else if (p.kind === 'essence' && p.amount) res.add('essence', p.amount, { raw: true });
}

export function openPozo(ctx: GameCtx): GameView {
  const { host } = ctx;
  const s = cs();
  let busy = false;

  const water = h('div', { class: 'cs-pz-water' });
  const beam = h('div', { class: 'cs-pz-beam' });
  const well = h('div', { class: 'cs-pz-well' }, beam, h('div', { class: 'cs-pz-rim back' }), water, h('div', { class: 'cs-pz-rim front' }), h('div', { class: 'cs-pz-stone' }));
  const pityBar = h('div', { class: 'cs-pz-pity' });
  const stage = h('div', { class: 'cs-pz-stage' });
  const btn = (kind: 'menor' | 'mayor' | 'diez', label: string, cost: number, sub: string) => h('button', { class: `cs-pz-btn ${kind}`, onclick: () => void wish(kind) },
    h('div', { class: 'cs-pz-btn-l' }, label), h('div', { class: 'cs-pz-btn-c' }, `${fmt(cost)} oro`), h('div', { class: 'cs-pz-btn-s' }, sub)) as HTMLButtonElement;
  const bMenor = btn('menor', 'Deseo Menor', WISH_COST.menor, 'Un susurro al agua');
  const bMayor = btn('mayor', 'Deseo Mayor', WISH_COST.mayor, 'Mejores rarezas');
  const bDiez = btn('diez', '10 Deseos Mayores', TEN_COST, 'Épica garantizada · −10%');
  const oddsRow = (k: WishKind) => {
    const t = TABLE[k];
    const rest = 1 - t.legend;
    return h('tr', null, h('td', null, h('b', null, k === 'menor' ? 'Menor' : 'Mayor')), ...(['comun', 'pococomun', 'rara', 'epica'] as const).map((r) => h('td', { style: `color:${rarityColor(r)}` }, `${(t.w[r] * rest * 100).toFixed(1)}%`)), h('td', { style: `color:${rarityColor('legendaria')}` }, `${(t.legend * 100).toFixed(1)}%`));
  };
  const rules = rulesSheet('El Pozo de los Deseos', h('div', null,
    h('p', null, 'Lanza oro y pide un deseo. El agua se enciende del color de lo que viene antes de que lo veas.'),
    h('table', null, h('tr', null, h('td', null, ''), ...(['comun', 'pococomun', 'rara', 'epica', 'legendaria'] as const).map((r) => h('td', { style: `color:${rarityColor(r)}` }, RAR_NAME[r]))), oddsRow('menor'), oddsRow('mayor')),
    h('p', null, h('b', null, 'Piedad: '), `desde el deseo ${PITY_SOFT} sin Legendaria, cada deseo suma +6%; en el ${PITY_HARD} es segura. Cada ${EPIC_PITY} deseos llega al menos una Épica. Los contadores se guardan.`),
    h('p', null, `Deseos esperados hasta una Legendaria: ≈ ${expectedToLegend(TABLE.menor.legend).toFixed(0)} (menores) · ≈ ${expectedToLegend(TABLE.mayor.legend).toFixed(0)} (mayores).`),
    h('p', { class: 'muted' }, 'Las reliquias repetidas se convierten en esencia. Oro del juego: nunca dinero real.')));
  const root = h('div', { class: 'cs-game cs-pozo' },
    gameHeader('pozo', 'El Pozo de los Deseos', 'Lo que pidas, el agua lo recuerda', () => host.back(), h('button', { class: 'cs-btn small', onclick: () => rules.toggle() }, 'Probabilidades')),
    h('div', { class: 'cs-pz' }, pityBar, well, stage, h('div', { class: 'cs-pz-btns' }, bMenor, bMayor, bDiez)), rules.el);
  ctx.root.appendChild(root);

  function renderPity(): void {
    const n = s.pity.legend;
    const left = Math.max(1, PITY_HARD - n);
    const epicLeft = Math.max(1, EPIC_PITY - s.pity.epic);
    const soft = n >= PITY_SOFT - 1;
    pityBar.innerHTML = '';
    pityBar.append(
      h('div', { class: 'cs-pz-pity-main' }, 'Legendaria garantizada en ', h('b', { class: soft ? 'soft' : '' }, String(left)), left === 1 ? ' deseo' : ' deseos'),
      h('div', { class: 'cs-pz-track' }, h('div', { class: 'cs-pz-softzone', style: `left:${(PITY_SOFT - 1) / PITY_HARD * 100}%` }), h('div', { class: 'cs-pz-fill', style: `width:${Math.min(100, n / PITY_HARD * 100)}%` })),
      h('div', { class: 'cs-pz-pity-sub' }, `Épica garantizada en ${epicLeft} · `, soft ? h('span', { class: 'cs-pz-hot' }, '¡Zona de suerte! Cada deseo es más probable') : `Zona de suerte desde el deseo ${PITY_SOFT}`, ` · Deseos totales: ${s.pozoPulls}`));
    const g = gold();
    bMenor.disabled = busy || g < WISH_COST.menor;
    bMayor.disabled = busy || g < WISH_COST.mayor;
    bDiez.disabled = busy || g < TEN_COST;
  }

  const wait = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

  async function tossCoin(from: HTMLElement): Promise<void> {
    const a = centerOf(from), b = centerOf(water);
    const coin = h('div', { class: 'cs-pz-coin' });
    root.appendChild(coin);
    audio.sfx('coin', { pitch: 1.2 });
    const dur = 620;
    const t0 = performance.now();
    await new Promise<void>((resolve) => {
      const step = (now: number) => {
        const k = Math.min(1, (now - t0) / dur);
        const x = a.x + (b.x - a.x) * k, y = a.y + (b.y - a.y) * k - Math.sin(k * Math.PI) * 180;
        coin.style.transform = `translate(${x - 14}px, ${y - 14}px) rotate(${k * 900}deg) scale(${1 - k * 0.45})`;
        if (k < 1 && ctx.alive()) requestAnimationFrame(step); else resolve();
      };
      requestAnimationFrame(step);
      window.setTimeout(resolve, dur + 400);
    });
    coin.remove();
    audio.sfx('splash');
    water.classList.remove('ripple'); void water.offsetWidth; water.classList.add('ripple');
  }

  async function glowAndBeam(r: Rar, quick = false): Promise<void> {
    const c = rarityColor(r);
    const tier = ['comun', 'pococomun', 'rara', 'epica', 'legendaria'].indexOf(r);
    water.style.setProperty('--wc', c);
    water.classList.add('lit');
    if (tier >= 3 && !quick) { audio.sfx('heartbeat'); host.tension(0.5); await wait(tier === 4 ? 1300 : 800); }
    else await wait(quick ? 120 : 380);
    beam.style.setProperty('--bc', c);
    beam.className = `cs-pz-beam on t${tier}`;
    audio.sfx(tier >= 4 ? 'loot_legendary' : tier === 3 ? 'loot_epic' : tier === 2 ? 'loot_rare' : 'loot_common');
    const o = centerOf(water);
    if (tier >= 3) {
      engine.pipeline.flash(c, tier === 4 ? 0.55 : 0.3, 0.6);
      engine.hitstop(tier === 4 ? 120 : 60);
      if (tier === 4) { engine.pipeline.impact(2, 0); audio.sfx('crowd_gasp'); host.celebrate(3); confettiBurst(o.x, o.y - 120, 80); }
      else host.celebrate(2);
    }
    sparkleAt(o.x, o.y - 40, 10 + tier * 8, c);
    host.tension(0);
    await wait(quick ? 250 : 500 + tier * 150);
  }

  function prizeCard(p: Prize, faceUp: boolean): HTMLElement {
    const c = rarityColor(p.rarity);
    const card = h('div', { class: `cs-pz-card r-${p.rarity} ${faceUp ? 'up' : ''}`, style: `--rc:${c}` },
      h('div', { class: 'cs-pz-card-in' },
        h('div', { class: 'cs-pz-face back' }, h('div', { class: 'cs-pz-q' }, '?')),
        h('div', { class: 'cs-pz-face front' }, h('div', { html: p.svg }), h('div', { class: 'cs-pz-name' }, p.name), h('div', { class: 'cs-pz-rar' }, RAR_NAME[p.rarity]), h('div', { class: 'cs-pz-desc' }, p.desc))));
    card.addEventListener('click', () => flipCard(card, p));
    return card;
  }
  function flipCard(card: HTMLElement, p: Prize): void {
    if (card.classList.contains('up')) return;
    card.classList.add('up');
    audio.sfx('card_flip');
    const o = centerOf(card);
    if (p.kind === 'essence') soulsAt(o.x, o.y, 14);
    if (p.kind === 'gold') coinBurst(o.x, o.y, 14);
    if (p.rarity === 'legendaria') { engine.pipeline.flash(rarityColor(p.rarity), 0.35, 0.5); audio.stinger('relic_found'); }
    else if (p.rarity === 'epica') audio.sfx('loot_epic', { volume: 0.6 });
  }

  async function wish(kind: 'menor' | 'mayor' | 'diez'): Promise<void> {
    if (busy || !ctx.alive()) return;
    const cost = kind === 'menor' ? WISH_COST.menor : kind === 'mayor' ? WISH_COST.mayor : TEN_COST;
    if (!takeBet('pozo', cost)) { audio.sfx('ui_error'); return; }
    busy = true;
    renderPity();
    stage.innerHTML = '';
    const n = kind === 'diez' ? 10 : 1;
    const wk: WishKind = kind === 'menor' ? 'menor' : 'mayor';
    const prizes: Prize[] = [];
    let gotEpic = false;
    for (let i = 0; i < n; i++) {
      const force = kind === 'diez' && i === n - 1 && !gotEpic;
      const r = rollWish(wk, s.pity, Math.random, luck(), force);
      if (r === 'epica' || r === 'legendaria') gotEpic = true;
      s.pozoPulls++;
      prizes.push(rollPrize(r, wk));
    }
    // outcome first: award everything now
    let goldBack = 0;
    for (const p of prizes) { if (p.kind === 'gold' && p.amount) goldBack += p.amount; else award(p); }
    host.hud.holdGold();
    settle('pozo', cost, goldBack, { noStreak: true, noBonus: true });
    const btnEl = kind === 'menor' ? bMenor : kind === 'mayor' ? bMayor : bDiez;
    if (n === 1) {
      await tossCoin(btnEl);
      await glowAndBeam(prizes[0].rarity);
      if (!ctx.alive()) return;
      const card = prizeCard(prizes[0], false);
      stage.appendChild(card);
      await wait(350);
      flipCard(card, prizes[0]);
    } else {
      for (let i = 0; i < 3; i++) void tossCoin(btnEl);
      await wait(700);
      const best = prizes.reduce((a, p) => (['comun', 'pococomun', 'rara', 'epica', 'legendaria'].indexOf(p.rarity) > ['comun', 'pococomun', 'rara', 'epica', 'legendaria'].indexOf(a) ? p.rarity : a), 'comun' as Rar);
      await glowAndBeam(best);
      if (!ctx.alive()) return;
      const grid = h('div', { class: 'cs-pz-grid' });
      const cards = prizes.map((p) => { const c = prizeCard(p, false); grid.appendChild(c); return c; });
      stage.append(grid, h('button', { class: 'cs-btn gold', onclick: async () => { for (let i = 0; i < cards.length; i++) { flipCard(cards[i], prizes[i]); await wait(160); } } }, 'Revelar todo'));
    }
    host.hud.releaseGold();
    water.classList.remove('lit');
    beam.className = 'cs-pz-beam';
    busy = false;
    renderPity();
    const top = prizes.find((p) => p.rarity === 'legendaria');
    if (top) host.say(`¡¿Una Legendaria?! El Pozo te quiere, patojo. A mí nunca me dio nada.`, { mood: 'surprised' });
    else if (s.pity.legend >= PITY_SOFT - 1) host.say('Ya estás en la zona de suerte… yo no pararía ahora, ¿eh?', { mood: 'smug' });
  }

  renderPity();
  host.say(s.pity.legend > 0 ? `Llevás ${s.pity.legend} deseos sin Legendaria. El Pozo lleva la cuenta… y yo también.` : 'Tirá una moneda, patojo. El Pozo escucha.', { mood: 'smile' });

  return {
    update() { /* animations are CSS/rAF driven */ },
    onKey(e: KeyboardEvent) { if ((e.code === 'Space' || e.code === 'Enter') && !e.repeat) { void wish('menor'); return true; } return false; },
    close() { host.hud.releaseGold(); host.tension(0); root.remove(); },
  };
}

