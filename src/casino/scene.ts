/**
 * The 'casino' scene: 3D diorama backdrop + DOM lobby + game views.
 * Params: { game?: GameId, settle?: string (arena bet id | 'guardias'), from?: locationId, direct?: boolean, debug? }
 */
import * as THREE from 'three';
import { engine, type GameScene } from '../core/engine';
import { bus } from '../core/events';
import { G, res } from '../core/state';
import { addNews } from '../core/news';
import { h, layer, wait } from '../ui/dom';
import { dialogue } from '../ui/dialogue';
import { narrate } from '../ui/narrator';
import { toast } from '../ui/toasts';
import { portraitSVG, type PortraitMood } from '../ui/art/portraits';
import { audio } from '../audio';
import { fmt } from '../core/math';
import { LOCATIONS } from '../data/world';
import { openBank, yearAnswer } from '../systems/society/api';
import { CasinoDiorama, type Focus } from './lobby3d';
import { CasinoHud, ICON } from './hud';
import { Lobby } from './lobby';
import { cs, casinoClosed, isBanned, banLunasLeft, luna, settle, GAME_NAMES, type GameId } from './state';
import { caughtFlow, settleGuardFight, decaySuspicion, stealthFor, CHEPE } from './security';
import { greeting, CHATO_GREETING, quip, TIB, CHATO, BREAK_LINE } from './tiburcio';
import { canUse } from './ui';
import type { CasinoHost, GameCtx, GameOpener, GameView } from './types';
import { openSlots } from './games/slots';
import { openRuleta } from './games/ruleta';
import { openTarot } from './games/tarot';
import { openDados } from './games/dados';
import { openArena, currentMatch, odds } from './games/arena';
import { openPozo } from './games/pozo';
import { openFinal } from './games/final';

const OPENERS: Record<Exclude<GameId, 'tres'>, GameOpener> = {
  slots: openSlots, ruleta: openRuleta, tarot: openTarot, dados: openDados, arena: openArena, pozo: openPozo, final: openFinal,
};

const HOT_POOL: Array<{ game: GameId; mult: number; label: string }> = [
  { game: 'slots', mult: 1.15, label: '+15%' }, { game: 'ruleta', mult: 1.2, label: '+20%' }, { game: 'tarot', mult: 1.2, label: '+20%' },
  { game: 'dados', mult: 1.25, label: '+25%' }, { game: 'arena', mult: 1.15, label: '+15%' },
];

export class CasinoScene implements GameScene, CasinoHost {
  readonly id = 'casino';
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(46, 1, 0.1, 200);
  hud!: CasinoHud;
  clandestino = false;
  private dio: CasinoDiorama | null = null;
  private root: HTMLElement | null = null;
  private lobby: Lobby | null = null;
  private gameWrap: HTMLElement | null = null;
  private hostToast: HTMLElement | null = null;
  private view: GameView | null = null;
  private viewId: GameId | null = null;
  private token = { alive: false };
  private from = 'puerto_fortuna';
  private direct = false;
  private scope = bus.scope();
  private sec = 0;
  private hotT = 90;
  private enteredAt = 0;
  private breakShown = false;
  private disposed = false;
  private leavingFlag = false;
  private freshLuna = false;
  get leaving(): boolean { return this.leavingFlag; }

  enter(params?: unknown): void {
    const p = (params ?? {}) as Record<string, unknown>;
    this.disposed = false;
    this.leavingFlag = false;
    const fromRaw = String(p.from ?? p.location ?? p.locationId ?? G.run.player.location ?? 'puerto_fortuna');
    this.from = LOCATIONS[fromRaw] ? fromRaw : 'puerto_fortuna';
    this.clandestino = casinoClosed();
    this.direct = !!p.direct || (this.from === 'arena_remolino' && !p.debug);
    this.dio = new CasinoDiorama(this.scene, this.camera, this.clandestino ? 'clandestino' : 'grand');
    const pl = engine.pipeline;
    pl.setBloom(this.clandestino ? 0.65 : 0.72, 0.5, 0.8);
    pl.setGrade({ saturation: 1.2, contrast: 1.06, vignette: 0.66, brightness: this.clandestino ? -0.03 : 0 });
    audio.music('casino', { region: 'islas' });
    audio.ambience('casino', true);

    this.root = h('div', { class: `cs-root ${this.clandestino ? 'clandestino' : ''}` }, h('div', { class: 'cs-vignette' }));
    layer('hud').appendChild(this.root);
    this.hud = new CasinoHud(this.root);
    const exitLabel = `Salir a ${LOCATIONS[this.from]?.name ?? 'Puerto Fortuna'}`;
    this.lobby = new Lobby(this.root, {
      open: (g) => this.openGame(g),
      exit: () => this.exitScene(),
      hover: (g) => { if (!this.view) this.dio?.focus(g ?? 'lobby'); },
      talk: () => void this.talk(),
    }, this.clandestino, exitLabel);
    this.gameWrap = h('div', { class: 'cs-gamewrap' });
    this.hostToast = h('div', { class: 'cs-hosttoast' });
    this.root.append(this.gameWrap, this.hostToast);
    window.addEventListener('keydown', this.onKey, true);
    this.scope.on('casino:win', (e) => { if (e.amount >= 1500) addNews(`Un mago se llevó ${fmt(e.amount)} de ${e.currency === 'gold' ? 'oro' : 'esencia'} en ${GAME_NAMES[e.game as GameId] ?? 'el casino'}.`, 'casino'); });
    this.enteredAt = performance.now();
    this.breakShown = false;
    void this.arrive(p);
  }

  private async arrive(p: Record<string, unknown>): Promise<void> {
    const s = cs();
    const settleId = typeof p.settle === 'string' ? p.settle : '';
    if (settleId === 'guardias') { await this.afterGuardFight(); return; }
    if (settleId) { this.openGame('arena', { settle: settleId }); return; }
    // a new visit
    this.freshLuna = s.visits > 0 && s.lastVisitLuna !== luna();
    if (s.lastVisitLuna !== luna() || Date.now() - s.session.start > 30 * 60e3 || s.visits === 0) {
      s.visits++;
      s.session = { gambled: 0, start: Date.now(), net: 0 };
    }
    s.lastVisitLuna = luna();
    if (!this.clandestino && isBanned() && !p.debug) {
      const ok = await this.bouncer();
      if (!ok) return;
    }
    if (Math.random() < 0.45) this.spawnHot(false);
    try {
      const m = currentMatch();
      if (m) this.setBoard([`${m.a.name}  ${odds(m.oddsA)}`, `${m.b.name}  ${odds(m.oddsB)}`, '¡Apuestas abiertas!']);
      this.lobby?.refresh();
    } catch (err) { console.warn('[casino] arena match', err); }
    const g = p.game as GameId | undefined;
    if (g && g in OPENERS) { this.openGame(g, p); return; }
    await wait(650);
    if (this.disposed) return;
    await this.greet();
  }

  private async greet(): Promise<void> {
    const s = cs();
    const gr = this.clandestino ? CHATO_GREETING() : greeting();
    s.tiburcio.met = true;
    s.lastGreetLuna = luna();
    this.lobby?.setHostMood(portraitSVG(this.clandestino ? CHATO(gr.mood) : TIB(gr.mood), 170));
    await dialogue.say({ speaker: this.clandestino ? 'El Chato Quiñónez' : 'Don Tiburcio', title: this.clandestino ? 'Dueño del Clandestino' : 'Gran Banquero de las Islas', portrait: this.clandestino ? CHATO(gr.mood) : TIB(gr.mood), text: gr.text });
    if (this.disposed) return;
    this.lobby?.setHostMood(portraitSVG(this.clandestino ? CHATO('smug') : TIB('smile'), 170));
    // the house comps a returning client now and then (only on a new luna; never after a loss streak)
    if (!this.clandestino && this.freshLuna && !s.free && Math.random() < 0.4) {
      s.free = { spins: 3, mult: 1, bet: 100, won: 0, label: 'GIROS DE CORTESÍA' };
      audio.sfx('coins_many', { volume: 0.5 });
      toast('Don Tiburcio te regala <b>3 giros de cortesía</b> en el Tragamonedas.', { kind: 'gold', duration: 5 });
      this.say('Tomá, patojo: tres giros de cortesía en el tragamonedas. La casa invita… esta vez.', { ms: 6000 });
      this.lobby?.refresh();
      return;
    }
    const h0 = s.hot;
    if (h0 && Date.now() < h0.until) this.say(`¡Ojo! ${GAME_NAMES[h0.game]} está caliente: ${h0.label} en ganancias.`);
  }

  private async talk(): Promise<void> {
    if (dialogue.open || this.view) return;
    const s = cs();
    const who = this.clandestino ? 'El Chato Quiñónez' : 'Don Tiburcio';
    const por = this.clandestino ? CHATO('smile') : TIB('smile');
    const id = await dialogue.ask({ speaker: who, portrait: por, text: this.clandestino ? '¿Qué ondas? Hablá bajito.' : '¿Qué se te ofrece, patojo? El tiempo es oro… y el oro es mío.' }, [
      { id: 'tip', text: '¿Qué me recomendás?' },
      { id: 'year', text: '¿Qué año es?' },
      ...(!this.clandestino ? [{ id: 'loan', text: 'Necesito un préstamo de la Banca' }] : []),
      ...(!this.clandestino && !s.final.won ? [{ id: 'final', text: 'Hablemos de *La Apuesta Final*' }] : []),
      { id: 'bye', text: 'Nada, gracias.' },
    ]);
    if (this.disposed) return;
    if (id === 'tip') {
      const h0 = s.hot && Date.now() < s.hot.until ? s.hot : null;
      const tip = h0 ? `${GAME_NAMES[h0.game]} anda caliente: ${h0.label} en ganancias. Yo que vos, no la dejaba enfriar.`
        : s.jackpot > 15000 ? `El bote del tragamonedas va en ${fmt(s.jackpot)}. Alguien se lo va a llevar… ¿por qué no vos?`
          : s.pity.legend > 40 ? 'El Pozo te tiene ganas, patojo. Ya casi te toca algo bueno, lo siento en las orejas.'
            : 'Mi consejo gratis: la casa siempre gana. Mi consejo caro: apostá más, que la suerte es tímida con los tacaños.';
      await dialogue.say({ speaker: who, portrait: por, text: tip });
    } else if (id === 'year') {
      let t = '¿Año? ¡Ja! Aquí adentro no hay años, vos. Un día dejamos de contar… y nadie ha querido volver a empezar. Es malo para el negocio.';
      try { const y = yearAnswer('tiburcio'); if (y && y.length > 12 && Math.random() < 0.4) t = y; } catch { /* stub */ }
      await dialogue.say({ speaker: who, portrait: por, text: t });
    } else if (id === 'loan') {
      try { await openBank(); } catch { /* stub */ }
    } else if (id === 'final') {
      this.openGame('final');
    }
  }

  private async bouncer(): Promise<boolean> {
    const left = banLunasLeft();
    const bribe = 1500 * Math.max(1, left);
    const id = await dialogue.ask({ speaker: 'Chepe el Tuerto', title: 'Jefe de Los Ojos de la Casa', portrait: CHEPE(), text: `Aquí no entrás, shute. Te quedan ${left === 1 ? 'una luna' : `${left} lunas`} de veto. Don Tiburcio tiene buena memoria… y yo mejor.` }, [
      { id: 'bribe', text: `Sobornar a Chepe (${fmt(bribe)} de oro)`, disabled: !res.can('gold', bribe) },
      ...(canUse('velo') ? [{ id: 'velo', text: 'Colarte con el *Velo*', hint: `${Math.round((0.45 + stealthFor('velo') * 0.5) * 100)}%` }] : []),
      { id: 'leave', text: 'Irse' },
    ]);
    if (this.disposed) return false;
    if (id === 'bribe' && res.spend('gold', bribe)) {
      audio.sfx('coins_many');
      cs().bannedUntil = -1;
      await dialogue.say({ speaker: 'Chepe el Tuerto', portrait: CHEPE(), text: 'Mirá qué casualidad… se me olvidó tu cara. Pasá, pues. Y portate bien.' });
      return true;
    }
    if (id === 'velo') {
      audio.sfx('invisibility_on');
      engine.pipeline.setDesat(0.6);
      await wait(700);
      engine.pipeline.setDesat(0);
      if (Math.random() < 0.45 + stealthFor('velo') * 0.5) {
        cs().suspicion = Math.max(cs().suspicion, 55);
        toast('Te colaste en el Gran Casino. Los Ojos de la Casa están inquietos.', { kind: 'epica' });
        return true;
      }
      await dialogue.say({ speaker: 'Chepe el Tuerto', portrait: CHEPE(), text: 'Te vi la sombra, mago. Aquí hasta las sombras pagan entrada. ¡Fuera!' });
    }
    this.exitScene();
    return false;
  }

  private async afterGuardFight(): Promise<void> {
    const r = await settleGuardFight();
    if (this.disposed) return;
    if (r === 'won') {
      await dialogue.say({ speaker: 'Don Tiburcio', portrait: TIB('angry'), text: '¡Mis guardias! ¡Volando por la ventana como gallinas! …Está bien, está bien. Seguí jugando, pero te estoy viendo, ¿oíste? *Te estoy viendo.*' });
    } else if (r === 'lost') {
      await dialogue.say({ speaker: 'Chepe el Tuerto', portrait: CHEPE(), text: 'Ahí te va la cuenta del médico y la de la ventana. Tres lunas afuera, mago.' });
      this.exitScene();
    }
  }

  // ───────────── games ─────────────

  openGame(g: GameId, params: Record<string, unknown> = {}): void {
    if (this.disposed || !this.gameWrap || g === 'tres') return;
    if (g === 'final' && this.clandestino) return;
    if (this.view) this.closeGame(false);
    const opener = OPENERS[g as Exclude<GameId, 'tres'>];
    if (!opener) return;
    this.lobby?.show(false);
    this.gameWrap.classList.add('show');
    const token = { alive: true };
    this.token = token;
    const ctx: GameCtx = { host: this, root: this.gameWrap, params, alive: () => token.alive && !this.disposed };
    try {
      this.view = opener(ctx);
      this.viewId = g;
    } catch (err) {
      console.error('[casino] open', g, err);
      this.view = null; this.viewId = null;
      this.gameWrap.classList.remove('show');
      this.lobby?.show(true);
      return;
    }
    this.dio?.focus(g);
    this.dio?.setTension(0);
    this.hud.refresh(g);
    audio.sfx('ui_open');
  }

  private closeGame(toLobby = true): void {
    this.token.alive = false;
    try { this.view?.close(); } catch (err) { console.error('[casino] close', err); }
    this.view = null; this.viewId = null;
    if (this.gameWrap) { this.gameWrap.innerHTML = ''; this.gameWrap.classList.remove('show'); }
    engine.pipeline.setLetterbox(0);
    engine.pipeline.setDesat(0);
    engine.pipeline.setMind(0);
    this.dio?.setTension(0);
    if (!toLobby) return;
    if (this.direct) { this.exitScene(); return; }
    this.lobby?.show(true);
    this.dio?.focus('lobby');
    this.hud.refresh();
    this.lobby?.refresh();
  }

  // ───────────── CasinoHost ─────────────

  back(): void { this.closeGame(true); }
  celebrate(level: 1 | 2 | 3): void { this.dio?.celebrate(level); }
  gloat(): void { this.dio?.gloat(); }
  tension(v: number): void { this.dio?.setTension(v); }
  shake(a: number): void { this.dio?.shake(a); }
  focus(f: Focus): void { this.dio?.focus(f); }
  setBoard(lines: string[]): void { this.dio?.setBoard(lines); }

  say(text: string, opts: { mood?: PortraitMood; ms?: number } = {}): void {
    if (!this.view && this.lobby) { this.lobby.say(text, opts.ms); return; }
    const t = this.hostToast;
    if (!t) return;
    t.innerHTML = '';
    t.append(h('div', { class: 'cs-hosttoast-p', html: portraitSVG(this.clandestino ? CHATO(opts.mood ?? 'smug') : TIB(opts.mood ?? 'smile'), 64) }), h('div', { class: 'cs-hosttoast-t' }, text));
    t.classList.remove('show'); void t.offsetWidth; t.classList.add('show');
    window.clearTimeout((t as unknown as { _t?: number })._t);
    (t as unknown as { _t?: number })._t = window.setTimeout(() => t.classList.remove('show'), opts.ms ?? 3600);
  }

  async caught(game: GameId, why: string): Promise<void> {
    this.closeGame(false);
    this.lobby?.show(true);
    this.dio?.focus('lobby');
    const out = await caughtFlow(game, why, this.from, this.clandestino);
    if (this.disposed) return;
    if (out === 'fight') { this.leavingFlag = true; return; }
    if (out === 'banned' || out === 'fled') { this.exitScene(); return; }
    this.hud.refresh();
    this.lobby?.refresh();
  }

  async raidCheck(game: GameId, stake: number): Promise<boolean> {
    if (!this.clandestino) return false;
    const p = 0.022 + cs().suspicion * 0.0003;
    if (Math.random() >= p) return false;
    settle(game, stake, 0);
    this.closeGame(false);
    this.lobby?.show(true);
    const el = h('div', { class: 'cs-alarm raid' }, h('div', { class: 'cs-alarm-title' }, '¡REDADA DEL CONCILIO!'), h('div', { class: 'cs-alarm-sub' }, 'Silbatos, botas y antorchas en la escalera.'));
    layer('cutin').appendChild(el);
    audio.sfx('alert_rise'); audio.sfx('horn_war', { volume: 0.5 }); audio.sfx('crowd_gasp');
    engine.pipeline.flash('#4f8aff', 0.4, 0.6);
    res.add('alert', 6);
    await wait(1700);
    el.remove();
    if (this.disposed) return true;
    const bribe = 800;
    const id = await dialogue.ask({ speaker: 'El Chato Quiñónez', portrait: CHATO('scared'), text: '¡Los guardias del Concilio! ¡Agarrá tus fichas y corré, patojo! …Bueno, tus fichas ya no. Esas se quedaron en la mesa.' }, [
      ...(canUse('velo') ? [{ id: 'velo', text: 'Esconderte bajo el *Velo* hasta que pase' }] : []),
      { id: 'bribe', text: `Sobornar al sargento (${fmt(bribe)} de oro)`, disabled: !res.can('gold', bribe) },
      { id: 'run', text: 'Salir corriendo por la bodega' },
    ]);
    if (this.disposed) return true;
    if (id === 'velo') { audio.sfx('invisibility_on'); toast('La redada pasó a tu lado sin verte.', { kind: 'epica' }); return true; }
    if (id === 'bribe' && res.spend('gold', bribe)) { audio.sfx('coins_many'); toast('El sargento no vio nada. Qué raro.', { kind: 'gold' }); return true; }
    this.exitScene();
    return true;
  }

  // ───────────── misc ─────────────

  private spawnHot(announce = true): void {
    const s = cs();
    if (s.hot && Date.now() < s.hot.until) return;
    const pick = HOT_POOL[Math.floor(Math.random() * HOT_POOL.length)];
    s.hot = { ...pick, until: Date.now() + 4 * 60e3 };
    if (announce) {
      audio.sfx('bell');
      toast(`${ICON.flame} ¡Mesa caliente! <b>${GAME_NAMES[pick.game]}</b> paga ${pick.label} por 4 minutos.`, { kind: 'gold', duration: 5 });
      this.say(`¡${GAME_NAMES[pick.game]} se puso caliente! ${pick.label} en ganancias, patojo. Corré.`);
      this.celebrate(1);
    }
    this.lobby?.refresh();
    this.hud.refresh(this.viewId ?? undefined);
  }

  private onKey = (e: KeyboardEvent): void => {
    if (this.disposed || dialogue.open || document.querySelector('.lx-modal-back') || engine.paused) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    if (this.view) {
      if (this.view.onKey?.(e)) { e.preventDefault(); e.stopPropagation(); return; }
      if (e.code === 'Escape') { e.preventDefault(); this.back(); }
      return;
    }
    const g = this.lobby?.keyToGame(e.key);
    if (g) { e.preventDefault(); this.openGame(g); }
  };

  private exitScene(): void {
    if (this.leavingFlag && this.disposed) return;
    this.leavingFlag = true;
    void engine.goto('location', { id: this.from }, { fade: 0.5 });
  }

  private dioAcc = 0;
  private frameN = 0;
  private renderAcc = 0;

  update(dt: number): void {
    // while a game covers the hall, the backdrop animates at half rate (it is dimmed and mostly hidden)
    this.dioAcc += dt;
    if (this.view && (this.frameN & 1)) return;
    this.dio?.update(this.dioAcc, this.dioAcc);
    this.dioAcc = 0;
  }

  render(dt: number): void {
    this.frameN++;
    this.renderAcc += dt;
    if (this.view && (this.frameN & 1)) return; // the canvas keeps the last frame
    engine.pipeline.render(this.scene, this.camera, this.renderAcc, engine.realTime);
    this.renderAcc = 0;
  }

  lateUpdate(realDt: number): void {
    if (this.disposed) return;
    try { this.view?.update?.(realDt); } catch (err) { console.error('[casino] view.update', err); }
    this.lobby?.update(realDt, quip);
    this.sec += realDt;
    if (this.sec >= 1) {
      this.sec -= 1;
      decaySuspicion(1);
      if (!this.clandestino && !this.view) cs().jackpot += 1 + Math.floor(Math.random() * 3);
      this.hud.refresh(this.viewId ?? undefined);
      if (!this.view) this.lobby?.refresh();
      this.hotT -= 1;
      if (this.hotT <= 0) { this.hotT = 150 + Math.random() * 90; if (Math.random() < 0.55) this.spawnHot(true); }
      if (!this.breakShown && performance.now() - this.enteredAt > 90 * 60e3) { this.breakShown = true; void narrate(BREAK_LINE); }
    }
  }

  exit(): void {
    this.disposed = true;
    this.token.alive = false;
    try { this.view?.close(); } catch { /* ignore */ }
    this.view = null;
    window.removeEventListener('keydown', this.onKey, true);
    this.scope.dispose();
    this.scope = bus.scope();
    if (dialogue.open) dialogue.close();
    this.hud?.dispose();
    this.root?.remove();
    this.root = null; this.lobby = null; this.gameWrap = null;
    this.dio?.dispose();
    this.dio = null;
    audio.ambience('casino', false);
    layer('cutin').querySelectorAll('.cs-wb, .cs-alarm, .cs-ldw, .cs-fd').forEach((e) => e.remove());
  }
}
