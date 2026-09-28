/**
 * PUBLIC CONTRACT used by taverns (world agent). Keep signatures.
 * openTresDados(locationId): "Tres Dados", a quick tavern dice game as a self-contained modal (any scene).
 * Bets: Alto (11–17) / Bajo (4–10) 1:1 (triples lose), Número (1:1 / 2:1 / 10:1 per matching die), Trío 30:1.
 */
import './casino.css';
import { h, layer } from '../ui/dom';
import { audio } from '../audio';
import { fmt } from '../core/math';
import { G } from '../core/state';
import { LOCATIONS } from '../data/world';
import { portraitSVG } from '../ui/art/portraits';
import { bet as takeBet, settle, luck, rerollCount, gold, betLadder } from './state';
import { NPCS, TAVERN_KEEPERS } from '../data/npcs';
import { coinBurst, centerOf, shakeEl, floatDelta } from './fx2d';
import { dieEl, setDie } from './games/liars';

type TBet = { kind: 'alto' } | { kind: 'bajo' } | { kind: 'num'; n: number } | { kind: 'trio' };

function returnFor(b: TBet, dice: number[], stake: number): number {
  const sum = dice[0] + dice[1] + dice[2];
  const triple = dice[0] === dice[1] && dice[1] === dice[2];
  switch (b.kind) {
    case 'alto': return !triple && sum >= 11 ? stake * 2 : 0;
    case 'bajo': return !triple && sum <= 10 ? stake * 2 : 0;
    case 'trio': return triple ? stake * 31 : 0;
    case 'num': { const k = dice.filter((d) => d === b.n).length; return k === 0 ? 0 : stake * (1 + (k === 3 ? 10 : k)); }
  }
}

const KEEPER_LINES = ['¿Unos daditos, forastero?', 'Tres dados, una jarra y mala suerte. Lo de siempre.', '¿Apuestas o solo miras?', 'Aquí se juega limpio. Casi siempre.'];
const ISLAS_LINES = ['¿Tres daditos, patojo?', '¡Echale, que la noche es joven!', 'Aquí los dados no mienten… mucho.'];

/** Quick tavern dice game ("Tres Dados") as a modal. Resolves when closed. */
export async function openTresDados(locationId: string): Promise<void> {
  if (!G.run) return;
  if (document.querySelector('.cs-td')) return;
  const loc = LOCATIONS[locationId];
  const islas = loc?.continent === 'islas';
  const rich = (loc?.prosperity ?? 50) >= 70;
  const ladder = betLadder(rich ? [10, 25, 50, 100, 250, 500, 1000] : [5, 10, 25, 50, 100, 250]);
  let stake = ladder[Math.min(2, ladder.length - 1)];
  let chosen: TBet = { kind: 'alto' };
  let rolling = false;
  let rerollLeft = rerollCount();
  let last: number[] = [3, 5, 1];

  return new Promise<void>((resolve) => {
    const dice = last.map((v) => dieEl(v, 'td pip1'));
    const tray = h('div', { class: 'cs-td-tray' }, ...dice);
    const result = h('div', { class: 'cs-td-result' }, 'Elige tu apuesta y tira.');
    const keeperNpc = NPCS[TAVERN_KEEPERS?.[locationId] ?? ''];
    const keeper = h('div', { class: 'cs-td-keeper', 'data-tip': keeperNpc ? `<b>${keeperNpc.name}</b>` : undefined, html: portraitSVG(keeperNpc
      ? { seed: keeperNpc.id, race: keeperNpc.race, job: keeperNpc.job, gender: keeperNpc.gender, age: keeperNpc.age, mood: 'smile', eyepatch: keeperNpc.portrait?.eyepatch, scar: keeperNpc.portrait?.scar }
      : { seed: `tabernero_${locationId}`, race: islas ? 'duende' : 'humano', job: 'tabernero', mood: 'smile' }, 90) });
    const say = h('div', { class: 'cs-td-say' }, (islas ? ISLAS_LINES : KEEPER_LINES)[Math.floor(Math.random() * 4) % (islas ? ISLAS_LINES.length : KEEPER_LINES.length)]);
    const goldEl = h('div', { class: 'cs-td-gold' });
    const stakeEl = h('div', { class: 'cs-td-stake' });
    const betBtns = h('div', { class: 'cs-td-bets' });
    const numRow = h('div', { class: 'cs-td-nums' });
    const rollBtn = h('button', { class: 'cs-btn gold big cs-td-roll', onclick: () => void roll(false) }, '¡Tirar!', h('span', { class: 'lx-kbd' }, 'Espacio')) as HTMLButtonElement;
    const rerollBtn = h('button', { class: 'cs-btn small', style: 'display:none', onclick: () => void roll(true) }, '⚀ Volver a tirar (Dado de Hueso)') as HTMLButtonElement;
    const panel = h('div', { class: 'lx-panel cs-td-panel' },
      h('div', { class: 'lx-panel-title' }, h('span', null, `Tres Dados · ${loc?.name ?? 'Taberna'}`), h('button', { class: 'lx-panel-close', onclick: () => close() }, '×')),
      h('div', { class: 'cs-td-top' }, keeper, say, goldEl),
      tray, result,
      h('div', { class: 'cs-td-label' }, 'Apuesta'), betBtns, numRow,
      h('div', { class: 'cs-td-foot' }, h('div', { class: 'cs-td-stakebox' }, h('button', { class: 'cs-bp-btn', onclick: () => stepStake(-1) }, '−'), stakeEl, h('button', { class: 'cs-bp-btn', onclick: () => stepStake(1) }, '+')), rollBtn, rerollBtn),
      h('div', { class: 'cs-td-note' }, 'Alto 11–17 y Bajo 4–10 pagan 1 a 1 (los tríos pierden) · Número: 1/2/10 a 1 por dado · Trío: 30 a 1 · Oro del juego'));
    const back = h('div', { class: 'lx-modal-back cs-td' }, panel);
    back.addEventListener('pointerdown', (e) => { if (e.target === back && !rolling) close(); });
    layer('modal').appendChild(back);
    audio.sfx('ui_open');

    function render(): void {
      goldEl.innerHTML = `<b>${fmt(gold())}</b> oro`;
      stakeEl.textContent = fmt(stake);
      betBtns.innerHTML = '';
      const opt = (b: TBet, label: string, sub: string) => {
        const on = b.kind === chosen.kind;
        const el = h('button', { class: `cs-td-bet ${on ? 'on' : ''}`, onclick: () => { chosen = b.kind === 'num' ? { kind: 'num', n: chosen.kind === 'num' ? chosen.n : 6 } : b; audio.sfx('chip_place'); render(); } }, h('b', null, label), h('span', null, sub));
        betBtns.appendChild(el);
      };
      opt({ kind: 'alto' }, 'Alto', '11–17 · 1:1');
      opt({ kind: 'bajo' }, 'Bajo', '4–10 · 1:1');
      opt({ kind: 'num', n: 6 }, 'Número', '1:1 · 2:1 · 10:1');
      opt({ kind: 'trio' }, 'Trío', 'cualquiera · 30:1');
      numRow.innerHTML = '';
      if (chosen.kind === 'num') {
        for (let n = 1; n <= 6; n++) {
          const b = h('button', { class: `cs-ld-facebtn ${chosen.n === n ? 'on' : ''}`, onclick: () => { chosen = { kind: 'num', n }; audio.sfx('dice_land', { volume: 0.3, pitch: 1.4 }); render(); } }, dieEl(n, 'sm pip1'));
          numRow.appendChild(b);
        }
      }
      rollBtn.disabled = rolling || gold() < stake;
    }
    function stepStake(d: number): void {
      const i = Math.max(0, Math.min(ladder.length - 1, ladder.indexOf(stake) + d));
      stake = ladder[i];
      audio.sfx('chip_place', { pitch: 0.9 + i * 0.05 });
      render();
    }

    async function tumble(final: number[]): Promise<void> {
      tray.classList.remove('pour'); void tray.offsetWidth; tray.classList.add('pour');
      audio.sfx('dice_roll');
      dice.forEach((d) => d.classList.add('rolling'));
      for (let k = 0; k < 9; k++) { await new Promise((r) => window.setTimeout(r, 65)); dice.forEach((d) => setDie(d, 1 + Math.floor(Math.random() * 6))); }
      dice.forEach((d, i) => { d.classList.remove('rolling'); setDie(d, final[i]); });
      audio.sfx('dice_land');
    }

    async function roll(isReroll: boolean): Promise<void> {
      if (rolling) return;
      if (isReroll && rerollLeft <= 0) return;
      if (!isReroll && !takeBet('tres', stake)) { audio.sfx('ui_error'); shakeEl(panel); return; }
      rolling = true;
      rerollBtn.style.display = 'none';
      render();
      let d = [1, 2, 3].map(() => 1 + Math.floor(Math.random() * 6));
      if (returnFor(chosen, d, stake) === 0 && Math.random() < luck() * 0.5) {
        const d2 = [1, 2, 3].map(() => 1 + Math.floor(Math.random() * 6));
        if (returnFor(chosen, d2, stake) > 0) d = d2;
      }
      if (isReroll) rerollLeft--;
      await tumble(d);
      last = d;
      const ret = returnFor(chosen, d, stake);
      const r = settle('tres', isReroll ? 0 : stake, ret);
      const sum = d[0] + d[1] + d[2];
      const triple = d[0] === d[1] && d[1] === d[2];
      dice.forEach((el, i) => el.classList.toggle('match', chosen.kind === 'num' ? d[i] === chosen.n : ret > 0));
      if (ret > 0) {
        result.innerHTML = `<b class="good">¡Ganas ${fmt(ret)}!</b> · suma ${sum}${triple ? ' · ¡TRÍO!' : ''}`;
        const o = centerOf(tray);
        coinBurst(o.x, o.y, Math.min(40, 8 + Math.floor(ret / Math.max(1, stake)) * 4));
        audio.sfx(ret >= stake * 10 ? 'slot_win_big' : 'slot_win_small');
        floatDelta(goldEl, `+${fmt(r.net > 0 ? r.net : ret)}`, 'gold');
        say.textContent = triple ? '¡A la gran! ¡Un trío!' : ['Bien tirado.', '¡Eso, eso!', 'La suerte te quiere hoy.'][Math.floor(Math.random() * 3)];
      } else {
        result.innerHTML = `<b class="bad">Pierdes</b> · suma ${sum}${triple ? ' · trío (la casa gana)' : ''}`;
        say.textContent = ['La casa agradece.', 'Otra y ya.', 'Los dados son caprichosos.'][Math.floor(Math.random() * 3)];
        shakeEl(tray);
        if (rerollLeft > 0 && !isReroll) rerollBtn.style.display = '';
      }
      rolling = false;
      render();
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') { e.preventDefault(); e.stopPropagation(); if (!rolling) close(); }
      else if (e.code === 'Space' && !e.repeat) { e.preventDefault(); e.stopPropagation(); void roll(false); }
    };
    window.addEventListener('keydown', onKey, true);
    function close(): void {
      window.removeEventListener('keydown', onKey, true);
      audio.sfx('ui_close');
      back.classList.add('lx-out');
      window.setTimeout(() => back.remove(), 220);
      resolve();
    }
    render();
  });
}
