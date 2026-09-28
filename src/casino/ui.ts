/** Shared casino UI pieces: game header, bet picker, rule sheets, speech bubbles, cheat buttons. */
import { h, type Child } from '../ui/dom';
import { audio } from '../audio';
import { fmt } from '../core/math';
import { G, res } from '../core/state';
import { knows } from '../systems/progression/codex';
import { chipSVG } from './art';
import { ICON } from './hud';
import { hotFor, luck, rerollCount, casinoClosed, CLANDESTINO_BONUS, type GameId } from './state';

export function gameHeader(game: GameId, title: string, sub: string, onBack: () => void, ...extra: Child[]): HTMLElement {
  const hot = hotFor(game);
  const l = luck();
  return h('div', { class: 'cs-ghead' },
    h('button', { class: 'cs-back', onclick: () => { audio.sfx('ui_close'); onBack(); }, 'data-tip': 'Volver al salón (Esc)' }, '‹ Salón'),
    h('div', { class: 'cs-gtitle' }, h('div', { class: 'cs-gtitle-main' }, title), h('div', { class: 'cs-gtitle-sub' }, sub)),
    h('div', { class: 'cs-ghead-right' },
      hot ? h('span', { class: 'cs-tag hot', html: `${ICON.flame} Mesa caliente ${hot.label}` }) : null,
      casinoClosed() ? h('span', { class: 'cs-tag new', 'data-tip': '<b>El Casino Clandestino</b>\nLas ganancias pagan más… pero el Concilio puede caer en cualquier momento.' }, `Clandestino +${Math.round(CLANDESTINO_BONUS * 100)}% · redadas`) : null,
      l > 0.001 ? h('span', { class: 'cs-tag luck', 'data-tip': `<b>Suerte</b> ${Math.round(l * 100)}%\nProbabilidad de que la suerte te dé una segunda oportunidad.` }, `✦ Suerte ${Math.round(l * 100)}%`) : null,
      rerollCount() > 0 ? h('span', { class: 'cs-tag reroll', 'data-tip': `<b>El Dado de Hueso de Dios</b>\nPuedes volver a tirar ${rerollCount() === 1 ? 'un resultado' : `${rerollCount()} resultados`} por juego.` }, `⚀ Re-tiradas ×${rerollCount()}`) : null,
      ...extra),
  );
}

/** − [chip value] + selector over a ladder of bets. */
export interface BetPicker { el: HTMLElement; value(): number; set(v: number): void; setLadder(l: number[]): void; disable(on: boolean): void }
export function betPicker(ladder: number[], initial: number, onChange: (v: number) => void, opts: { label?: string; essence?: boolean } = {}): BetPicker {
  let lad = ladder.slice();
  let idx = Math.max(0, lad.findIndex((v) => v >= initial));
  if (lad[idx] !== initial) idx = Math.max(0, lad.filter((v) => v <= initial).length - 1);
  const chip = h('div', { class: 'cs-bp-chip' });
  const val = h('div', { class: 'cs-bp-val' });
  const minus = h('button', { class: 'cs-bp-btn', onclick: () => step(-1) }, '−');
  const plus = h('button', { class: 'cs-bp-btn', onclick: () => step(1) }, '+');
  const max = h('button', { class: 'cs-bp-max', onclick: () => { idx = lad.length - 1; render(true); } }, 'MÁX');
  const el = h('div', { class: 'cs-bp' }, h('div', { class: 'cs-bp-label' }, opts.label ?? 'Apuesta'), h('div', { class: 'cs-bp-row' }, minus, chip, val, plus, max));
  const render = (sound = false, notify = true) => {
    idx = Math.max(0, Math.min(lad.length - 1, idx));
    const v = lad[idx];
    chip.innerHTML = chipSVG(v, { size: 40, essence: opts.essence });
    val.textContent = fmt(v);
    if (sound) { audio.sfx('chip_place', { pitch: 0.9 + idx * 0.04 }); chip.classList.remove('cs-pop'); void chip.offsetWidth; chip.classList.add('cs-pop'); }
    if (notify) onChange(v);
  };
  const step = (d: number) => { idx += d; render(true); };
  render(false, false);
  return {
    el,
    value: () => lad[idx],
    set: (v: number) => { idx = Math.max(0, lad.filter((x) => x <= v).length - 1); render(); },
    setLadder: (l: number[]) => { const cur = lad[idx]; lad = l.length ? l.slice() : [1]; idx = Math.max(0, lad.filter((x) => x <= cur).length - 1); render(); },
    disable: (on: boolean) => { for (const b of [minus, plus, max]) (b as HTMLButtonElement).disabled = on; el.classList.toggle('off', on); },
  };
}

/** Collapsible rules / paytable sheet. */
export function rulesSheet(title: string, body: Child): { el: HTMLElement; toggle: () => void } {
  const el = h('div', { class: 'cs-rules' }, h('div', { class: 'cs-rules-title' }, title), h('div', { class: 'cs-rules-body' }, body));
  el.addEventListener('click', () => el.classList.remove('open'));
  return { el, toggle: () => { el.classList.toggle('open'); audio.sfx(el.classList.contains('open') ? 'page_turn' : 'ui_close'); } };
}

/** Speech bubble anchored inside a container (dealers, rivals). */
export function bubble(parent: HTMLElement, text: string, ms = 2600, cls = ''): HTMLElement {
  parent.querySelectorAll(':scope > .cs-bubble').forEach((b) => b.remove());
  const b = h('div', { class: `cs-bubble ${cls}` }, text);
  parent.appendChild(b);
  setTimeout(() => { b.classList.add('out'); setTimeout(() => b.remove(), 300); }, ms);
  return b;
}

/** Whether Elias can use an out-of-battle power (codex, plus a debug switch for testing). */
export function canUse(ability: 'velo' | 'dominar_mente'): boolean {
  try { if (knows(ability)) return true; } catch { /* stub */ }
  if (G.run?.player.codex[ability]?.acquired) return true;
  return !!G.run?.flags.casino_debug_cheats;
}

/** A cheat button (Velo / Dominar Mente) with mana cost and ability flavor. */
export function cheatButton(ability: 'velo' | 'dominar_mente', label: string, mana: number, tip: string, onUse: () => void): HTMLButtonElement | null {
  if (!canUse(ability)) return null;
  const b = h('button', { class: `cs-cheat ${ability}`, 'data-tip': `<b>${label}</b>\n${tip}\nCoste: ${mana} de maná. Los Ojos de la Casa podrían verte.` },
    h('span', { class: 'cs-cheat-ico' }, ability === 'velo' ? '◐' : '◉'), h('span', null, label), h('span', { class: 'cs-cheat-mana' }, `${mana}✧`)) as HTMLButtonElement;
  b.addEventListener('click', () => {
    if (b.disabled) return;
    if (!res.can('mana', mana)) { audio.sfx('ui_error'); b.classList.remove('cs-shake'); void b.offsetWidth; b.classList.add('cs-shake'); return; }
    onUse();
  });
  const refresh = () => { b.classList.toggle('nomana', !res.can('mana', mana)); };
  refresh();
  return b;
}

export function manaLeft(): number { return Math.round(G.run?.player.mana ?? 0); }

/** Big round action button (GIRAR / REPARTIR…). */
export function bigAction(label: string, onClick: () => void, hotkey = 'Espacio'): HTMLButtonElement {
  const b = h('button', { class: 'cs-big-action' }, h('span', { class: 'cs-big-label' }, label), h('span', { class: 'cs-big-key' }, hotkey)) as HTMLButtonElement;
  b.addEventListener('click', () => { if (!b.disabled) onClick(); });
  return b;
}

export function money(n: number, ess = false): string { return `${fmt(n)} ${ess ? 'esencia' : 'oro'}`; }
