/**
 * Lobby DOM: marquee logo, game cards (live jackpot, pity, odds, last numbers, hot badges),
 * the host (Tiburcio / El Chato) with quips, exit button and a casino ticker.
 * Hovering a card makes the 3D camera glide to that table.
 */
import { h } from '../ui/dom';
import { fmt } from '../core/math';
import { audio } from '../audio';
import { portraitSVG } from '../ui/art/portraits';
import { reelsSVG, wheelSVG, tarotFanSVG, diceCupSVG, arenaSVG, wellSVG } from './art';
import { cs, hotFor, GAME_NAMES, isBanned, closedLunasLeft, type GameId } from './state';
import { TIB, CHATO } from './tiburcio';
import { ICON } from './hud';
import { PITY_HARD } from './games/pozoMath';

interface CardDef { id: GameId; art: () => string; tag: string; key: string }

const CARDS: CardDef[] = [
  { id: 'slots', art: () => reelsSVG(110), tag: 'Cinco rodillos, veinte líneas y un bote que no deja de crecer.', key: '1' },
  { id: 'ruleta', art: () => wheelSVG(110, true), tag: 'Sol o Luna. Oro… o almas.', key: '2' },
  { id: 'tarot', art: () => tarotFanSVG(110), tag: 'Veintiuno con Arcanos Mayores. Paga 3:2.', key: '3' },
  { id: 'dados', art: () => diceCupSVG(110), tag: 'Farolea contra tahúres con memoria.', key: '4' },
  { id: 'arena', art: () => arenaSVG(110), tag: 'Apuesta a qué ejército sale volando.', key: '5' },
  { id: 'pozo', art: () => wellSVG(110), tag: 'Lanza oro, pide un deseo, recibe una reliquia.', key: '6' },
  { id: 'final', art: () => portraitSVG({ seed: 'tiburcio', race: 'duende', special: 'tiburcio', mood: 'smug' }, 110), tag: 'Don Tiburcio en persona. Al mejor de tres.', key: '7' },
];

export interface LobbyHandlers { open(g: GameId): void; exit(): void; hover(g: GameId | null): void; talk(): void }

export class Lobby {
  readonly el: HTMLElement;
  private live = new Map<GameId, HTMLElement>();
  private cards = new Map<GameId, HTMLElement>();
  private hostEl: HTMLElement;
  private hostBubble: HTMLElement;
  private ticker: HTMLElement;
  private shownJackpot = 0;
  private quipT = 16;

  constructor(parent: HTMLElement, private hnd: LobbyHandlers, private clandestino: boolean, exitLabel: string) {
    const logo = h('div', { class: `cs-logo ${clandestino ? 'clandestino' : ''}` },
      h('div', { class: 'cs-logo-main' }, clandestino ? 'EL CASINO CLANDESTINO' : 'EL GRAN CASINO'),
      h('div', { class: 'cs-logo-sub' }, clandestino ? `El Concilio cerró la Banca${closedLunasLeft() ? ` (${closedLunasLeft()} lunas)` : ''} · aquí se paga mejor… y hay redadas` : 'La Banca de las Mil Suertes · Puerto Fortuna'));
    const row = h('div', { class: 'cs-cards' });
    for (const c of CARDS) {
      if (clandestino && c.id === 'final') continue;
      const live = h('div', { class: 'cs-card-live' });
      const card = h('div', { class: `cs-card g-${c.id}`, tabindex: '0' },
        h('div', { class: 'cs-card-glow' }),
        h('div', { class: 'cs-card-key' }, c.key),
        h('div', { class: 'cs-card-art', html: c.art() }),
        h('div', { class: 'cs-card-name' }, GAME_NAMES[c.id]),
        h('div', { class: 'cs-card-tag' }, c.tag),
        live,
        h('div', { class: 'cs-card-badges' }));
      card.addEventListener('click', () => { audio.sfx('chip_place'); this.hnd.open(c.id); });
      card.addEventListener('mouseenter', () => { audio.sfx('ui_hover', { volume: 0.4 }); this.hnd.hover(c.id); });
      card.addEventListener('mouseleave', () => this.hnd.hover(null));
      row.appendChild(card);
      this.cards.set(c.id, card);
      this.live.set(c.id, live);
    }
    this.hostBubble = h('div', { class: 'cs-host-bubble' });
    this.hostEl = h('div', { class: 'cs-host', 'data-tip': clandestino ? 'El Chato Quiñónez' : 'Don Tiburcio Faroles — clic para hablar' },
      h('div', { class: 'cs-host-portrait', html: portraitSVG(clandestino ? CHATO('smug') : TIB('smile'), 170) }),
      h('div', { class: 'cs-host-name' }, clandestino ? 'El Chato' : 'Don Tiburcio'),
      this.hostBubble);
    this.hostEl.addEventListener('click', () => { audio.sfx('ui_click'); this.hnd.talk(); });
    this.ticker = h('div', { class: 'cs-ticker' }, h('div', { class: 'cs-ticker-inner' }));
    const exit = h('button', { class: 'cs-exit', onclick: () => { audio.sfx('door'); this.hnd.exit(); } }, `‹ ${exitLabel}`);
    this.el = h('div', { class: 'cs-lobby' }, logo, this.hostEl, row, h('div', { class: 'cs-lobby-foot' }, exit, this.ticker));
    parent.appendChild(this.el);
    this.shownJackpot = cs().jackpot;
    this.refresh();
    this.setTicker();
  }

  show(on: boolean): void { this.el.classList.toggle('hidden', !on); }

  say(text: string, ms = 5200): void {
    this.hostBubble.textContent = text;
    this.hostBubble.classList.remove('show'); void this.hostBubble.offsetWidth; this.hostBubble.classList.add('show');
    this.hostEl.classList.remove('talk'); void this.hostEl.offsetWidth; this.hostEl.classList.add('talk');
    window.setTimeout(() => this.hostBubble.classList.remove('show'), ms);
  }

  setHostMood(svg: string): void { const p = this.hostEl.querySelector('.cs-host-portrait'); if (p) p.innerHTML = svg; }

  private setTicker(): void {
    const s = cs();
    const items = [
      `BOTE DEL TRAGAMONEDAS: ${fmt(s.jackpot)} de oro`,
      s.lastNumbers.length ? `Rueda de las Almas — últimos: ${s.lastNumbers.slice(0, 6).join(' · ')}` : 'La Rueda de las Almas acepta esencia',
      'Pepe Chucho perdió hasta el sombrero en los Dados Mentirosos',
      s.jackpotWins ? `El bote se ha ganado ${s.jackpotWins} ${s.jackpotWins === 1 ? 'vez' : 'veces'} en este ciclo` : 'Nadie se ha llevado el bote… todavía',
      'Todo es oro del juego · Probabilidades publicadas en cada mesa',
      s.bestStreak >= 3 ? `Tu mejor racha: ×${s.bestStreak}` : 'Las rachas pagan +5% por victoria seguida',
    ];
    const inner = this.ticker.firstElementChild as HTMLElement;
    inner.innerHTML = items.map((t) => `<span>${t}</span>`).join('<span class="cs-dot">◆</span>');
  }

  /** Live stats + badges (call ~1/s). */
  refresh(): void {
    const s = cs();
    const set = (g: GameId, html: string) => { const el = this.live.get(g); if (el && el.innerHTML !== html) el.innerHTML = html; };
    set('slots', `<span class="cs-live-label">BOTE</span><span class="cs-live-num jackpot">${fmt(Math.round(this.shownJackpot))}</span>`);
    const nums = s.lastNumbers.slice(0, 6).map((n) => `<span class="cs-num-dot ${n === 0 ? 'eclipse' : SOL.has(n) ? 'sol' : 'luna'}">${n}</span>`).join('');
    set('ruleta', nums ? `<span class="cs-live-label">ÚLTIMOS</span>${nums}` : '<span class="cs-live-label">Pleno paga 35:1</span>');
    set('tarot', '<span class="cs-live-label">Veintiuno natural</span><span class="cs-live-num">3:2</span>');
    const rivals = Object.values(s.rivals).sort((a, b) => b.played - a.played).slice(0, 2).map((r) => r.name).join(', ');
    set('dados', `<span class="cs-live-label">${rivals ? 'Te recuerdan' : 'Rivales'}</span><span class="cs-live-small">${rivals || 'Pepe Chucho · Lady Ámbar · El Mudo'}</span>`);
    const m = s.arenaMatch;
    set('arena', m ? `<span class="cs-live-label">Próximo</span><span class="cs-live-small">×${m.oddsA.toFixed(2).replace('.', ',')} · ×${m.oddsB.toFixed(2).replace('.', ',')}</span>` : '<span class="cs-live-label">Apuestas abiertas</span>');
    const left = Math.max(1, PITY_HARD - s.pity.legend);
    set('pozo', `<span class="cs-live-label">Legendaria garantizada en</span><span class="cs-live-num">${left}</span>`);
    set('final', s.final.won ? '<span class="cs-live-label">Ganada</span><span class="cs-live-small">El Libro ya es tuyo</span>' : '<span class="cs-live-label">Premio</span><span class="cs-live-small">El Libro de la Realidad</span>');
    for (const [g, card] of this.cards) {
      const badges = card.querySelector('.cs-card-badges') as HTMLElement;
      const hot = hotFor(g);
      const html = [hot ? `<span class="cs-tag hot">${ICON.flame} ${hot.label}</span>` : '', g === 'slots' && s.free ? `<span class="cs-tag new">${s.free.spins} GIROS GRATIS</span>` : '', g === 'final' && s.final.won ? '<span class="cs-tag done">GANADA</span>' : '', g === 'final' && !s.final.won && s.final.played === 0 ? '<span class="cs-tag new">NUEVO</span>' : ''].join('');
      if (badges.innerHTML !== html) badges.innerHTML = html;
      card.classList.toggle('hot', !!hot);
    }
    void isBanned;
  }

  /** Per-frame: jackpot counter chases the real value; host quips. */
  update(dt: number, quip: () => string): void {
    const target = cs().jackpot;
    if (Math.abs(target - this.shownJackpot) > 0.5) this.shownJackpot += (target - this.shownJackpot) * Math.min(1, dt * 3);
    else this.shownJackpot = target;
    const el = this.live.get('slots')?.querySelector('.jackpot');
    if (el) el.textContent = fmt(Math.round(this.shownJackpot));
    if (!this.el.classList.contains('hidden')) {
      this.quipT -= dt;
      if (this.quipT <= 0) { this.quipT = 16 + Math.random() * 12; this.say(quip()); }
    }
  }

  keyToGame(key: string): GameId | null { return CARDS.find((c) => c.key === key && this.cards.has(c.id))?.id ?? null; }
  anchor(g: GameId): HTMLElement | undefined { return this.cards.get(g); }
}

export const SOL = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
