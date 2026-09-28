/**
 * Casino top bar: gold (bump + floating deltas; can be "held" so wins roll up in sync with reveals),
 * essence, streak ("Racha ×3"), Los Ojos de la Casa suspicion eye, hot-table chip.
 */
import { h } from '../ui/dom';
import { bus } from '../core/events';
import { G } from '../core/state';
import { fmt } from '../core/math';
import { audio } from '../audio';
import { cs, hotFor, streakPct, GAME_NAMES, type GameId } from './state';
import { countUp, floatDelta } from './fx2d';

export const ICON = {
  coin: `<svg viewBox="0 0 32 32" width="22" height="22"><circle cx="16" cy="17" r="12" fill="#8a5a12"/><circle cx="16" cy="15" r="12" fill="#ffd34a" stroke="#150b1f" stroke-width="2"/><circle cx="16" cy="15" r="6" fill="#fff0b0"/><circle cx="17.3" cy="14.3" r="5" fill="#6a3c06"/><ellipse cx="11" cy="9" rx="3.4" ry="1.6" fill="#fff" opacity=".7" transform="rotate(-35 11 9)"/></svg>`,
  essence: `<svg viewBox="0 0 32 32" width="22" height="22"><path d="M16 3 q10 11 5 20 q-2 5 -5 6 q-3 -1 -5 -6 q-5 -9 5 -20z" fill="#c77dff" stroke="#150b1f" stroke-width="2"/><path d="M16 11 q5 6 1 13 q-4 -5 -1 -13z" fill="#f1dcff"/></svg>`,
  flame: `<svg viewBox="0 0 32 32" width="20" height="20"><path d="M16 2 q3 8 8 11 q4 5 1 11 q-3 6 -9 6 q-6 0 -9 -6 q-3 -7 3 -12 q0 5 3 6 q-2 -8 3 -16z" fill="#ff7a1a" stroke="#150b1f" stroke-width="2"/><path d="M16 14 q5 5 3 10 q-2 3 -3 3 q-4 -2 -3 -6 q1 -4 3 -7z" fill="#ffe066"/></svg>`,
  eye: `<svg viewBox="0 0 32 32" width="22" height="22"><path d="M2 16 q14 -14 28 0 q-14 14 -28 0z" fill="#f3ead8" stroke="#150b1f" stroke-width="2"/><circle cx="16" cy="16" r="6" fill="#e2455b" stroke="#150b1f" stroke-width="1.6"/><circle cx="16" cy="16" r="2.6" fill="#150b1f"/><circle cx="14" cy="14" r="1.2" fill="#fff"/></svg>`,
};

export class CasinoHud {
  readonly el: HTMLElement;
  private goldEl: HTMLElement;
  private goldChip: HTMLElement;
  private essEl: HTMLElement;
  private essChip: HTMLElement;
  private streakChip: HTMLElement;
  private eyeChip: HTMLElement;
  private eyeFill: HTMLElement;
  private hotChip: HTMLElement;
  private shownGold = 0;
  private held = 0;
  private off: Array<() => void> = [];
  private lastEye = -1;
  private rolling: { skip: () => void } | null = null;

  constructor(parent: HTMLElement) {
    this.goldEl = h('span', { class: 'cs-hud-num' }, '0');
    this.essEl = h('span', { class: 'cs-hud-num' }, '0');
    this.goldChip = h('div', { class: 'cs-hud-chip gold', 'data-tip': '<b>Oro</b>\nSolo moneda del juego.' }, h('span', { html: ICON.coin }), this.goldEl);
    this.essChip = h('div', { class: 'cs-hud-chip ess', 'data-tip': '<b>Esencia</b> ("almas")\nSe puede apostar en La Rueda de las Almas.' }, h('span', { html: ICON.essence }), this.essEl);
    this.streakChip = h('div', { class: 'cs-hud-chip streak', style: 'display:none' });
    this.eyeFill = h('div', { class: 'cs-eye-fill' });
    this.eyeChip = h('div', { class: 'cs-hud-chip eye', style: 'display:none', 'data-tip': '<b>Los Ojos de la Casa</b>\nSospecha de trampa. Sube al hacer trampa… y al ganar demasiado.' },
      h('span', { html: ICON.eye }), h('div', { class: 'cs-eye-bar' }, this.eyeFill));
    this.hotChip = h('div', { class: 'cs-hud-chip hot', style: 'display:none' });
    this.el = h('div', { class: 'cs-hud' }, this.hotChip, this.eyeChip, this.streakChip, this.essChip, this.goldChip);
    parent.appendChild(this.el);
    this.shownGold = G.run.player.gold;
    this.goldEl.textContent = fmt(this.shownGold);
    this.essEl.textContent = fmt(G.run.player.essence);
    this.off.push(bus.on('res:change', (e) => {
      if (e.key === 'gold') {
        if (this.held > 0) return;
        this.setGold(e.value, e.delta);
      } else if (e.key === 'essence') {
        this.essEl.textContent = fmt(e.value);
        this.bump(this.essChip);
        floatDelta(this.essChip, `${e.delta > 0 ? '+' : '−'}${fmt(Math.abs(e.delta))}`, e.delta > 0 ? 'ess' : 'bad');
      }
    }));
    this.refresh();
  }

  private bump(el: HTMLElement): void { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }

  private setGold(value: number, delta: number): void {
    this.rolling?.skip();
    const from = this.shownGold;
    this.shownGold = value;
    this.bump(this.goldChip);
    if (Math.abs(delta) > 0) floatDelta(this.goldChip, `${delta > 0 ? '+' : '−'}${fmt(Math.abs(delta))}`, delta > 0 ? 'gold' : 'bad');
    if (delta > 0 && delta > 50) {
      const r = countUp(this.goldEl, from, value, Math.min(1400, 300 + Math.log10(delta) * 260), { ticks: false });
      this.rolling = r;
      void r.done.then(() => { if (this.rolling === r) this.rolling = null; });
    } else this.goldEl.textContent = fmt(value);
  }

  /** Freeze the displayed gold (a reveal is in progress). */
  holdGold(): void { this.held++; }
  /** Unfreeze and roll the display to the real value. */
  releaseGold(): void {
    this.held = Math.max(0, this.held - 1);
    if (this.held === 0) {
      const v = G.run.player.gold;
      if (v !== this.shownGold) this.setGold(v, v - this.shownGold);
    }
  }

  /** Streak / suspicion / hot-table chips. Cheap: call after each round and once a second. */
  refresh(game?: GameId): void {
    const s = cs();
    if (s.streak >= 2) {
      const pct = Math.round(streakPct(s.streak) * 100);
      this.streakChip.style.display = '';
      const html = `${ICON.flame}<span class="cs-hud-num">RACHA ×${s.streak}</span><span class="cs-hud-sub">+${pct}%</span>`;
      if (this.streakChip.innerHTML !== html) { this.streakChip.innerHTML = html; this.bump(this.streakChip); }
      this.streakChip.setAttribute('data-tip', `<b>Racha ×${s.streak}</b>\nCada ganancia neta seguida suma +5% a la siguiente (máx. +50%). Una pérdida la apaga.`);
    } else this.streakChip.style.display = 'none';
    const sus = Math.round(s.suspicion);
    if (sus >= 5) {
      this.eyeChip.style.display = '';
      this.eyeFill.style.transform = `scaleX(${Math.min(1, sus / 100)})`;
      this.eyeChip.classList.toggle('warn', sus >= 30 && sus < 60);
      this.eyeChip.classList.toggle('danger', sus >= 60);
      if (this.lastEye >= 0 && sus >= 30 && this.lastEye < 30) audio.sfx('alert_rise', { volume: 0.4 });
    } else this.eyeChip.style.display = 'none';
    this.lastEye = sus;
    const hot = s.hot && Date.now() < s.hot.until ? s.hot : null;
    if (hot) {
      const left = Math.max(0, Math.round((hot.until - Date.now()) / 1000));
      this.hotChip.style.display = '';
      this.hotChip.classList.toggle('here', game === hot.game);
      this.hotChip.innerHTML = `${ICON.flame}<span>Mesa caliente: <b>${GAME_NAMES[hot.game]}</b> ${hot.label}</span><span class="cs-hud-sub">${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}</span>`;
    } else this.hotChip.style.display = 'none';
    void hotFor;
  }

  goldAnchor(): HTMLElement { return this.goldChip; }

  dispose(): void { this.off.forEach((f) => f()); this.off = []; this.el.remove(); }
}
