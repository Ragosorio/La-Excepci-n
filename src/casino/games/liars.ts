/**
 * Reusable Dados Mentirosos table (used by the Dados game and by La Apuesta Final).
 * Rivals with personas + lines; dice under cups; bids, "¡Mentiroso!", "¡Exacto!"; dramatic reveal with counting;
 * cheats (Dominar Mente reveals a rival's dice, Velo swaps one of your dice), luck and El Dado de Hueso de Dios.
 */
import { h } from '../../ui/dom';
import { audio } from '../../audio';
import { engine } from '../../core/engine';
import { res } from '../../core/state';
import { luck, rerollCount } from '../state';
import { cheatRoll } from '../security';
import { bubble, cheatButton } from '../ui';
import { sparkleAt, centerOf, shakeEl } from '../fx2d';
import { decide, roll, countFace, isRaise, minQtyFor, type Bid, type Persona } from './liarsAI';

export interface Lines { think: string[]; bid: string[]; liar: string[]; exact: string[]; lose: string[]; win: string[]; out: string[]; caught: string[] }
export interface Seat { id: string; name: string; title: string; portrait: (mood: 'neutral' | 'smile' | 'smug' | 'angry' | 'scared' | 'surprised' | 'mind' | 'sad') => string; persona: Persona; lines: Lines; grudge: number; drunk?: boolean }
export interface LiarsOpts {
  root: HTMLElement; seats: Seat[]; dice: number; alive: () => boolean; cheats: boolean; dramatic?: boolean;
  onCaught: (by: Seat, why: string) => void;
  onEvent?: (e: 'round' | 'lose_die' | 'win_die' | 'reveal', who: string) => void;
}
export type LiarsResult = { winner: 'player' | string; caught?: boolean; quit?: boolean };

interface P { id: string; seat?: Seat; dice: number; hand: number[]; el: HTMLElement; diceEl: HTMLElement; countEl: HTMLElement; face?: HTMLElement; read: boolean }

const pick = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)];
const wait = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

export function dieEl(v: number, cls = ''): HTMLElement {
  const d = h('div', { class: `cs-die f${v} ${cls}` });
  setDie(d, v);
  return d;
}
export function setDie(d: HTMLElement, v: number): void {
  d.className = d.className.replace(/\bf[1-6]\b/, `f${v}`);
  if (!/\bf[1-6]\b/.test(d.className)) d.classList.add(`f${v}`);
  // in liar's dice the 1 is the Eclipse (wild); plain dice ('pip1') show a single pip
  if (v === 1 && !d.classList.contains('pip1')) { d.innerHTML = '<i class="cs-die-eclipse"></i>'; return; }
  const on: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  d.innerHTML = Array.from({ length: 9 }, (_, i) => `<i class="${on[v]?.includes(i) ? 'p' : ''}"></i>`).join('');
}

export class LiarsTable {
  readonly el: HTMLElement;
  private ps: P[] = [];
  private bid: Bid | null = null;
  private bidder = -1;
  private turn = 0;
  private qty = 1;
  private face = 2;
  private repeats = 0;
  private lastPlayerFace = 0;
  private resolveAction: ((d: { kind: 'bid'; bid: Bid } | { kind: 'liar' } | { kind: 'exact' }) => void) | null = null;
  private bidEl: HTMLElement;
  private logEl: HTMLElement;
  private revealEl: HTMLElement;
  private ctrl: HTMLElement;
  private qtyEl: HTMLElement;
  private faceBtns: HTMLElement[] = [];
  private bidBtn: HTMLButtonElement;
  private liarBtn: HTMLButtonElement;
  private exactBtn: HTMLButtonElement;
  private cheatRow: HTMLElement;
  private mode: 'idle' | 'mind' | 'velo' = 'idle';
  private mindUsed = false;
  private veloUsed = false;
  private rerollLeft = rerollCount();
  private disposed = false;
  private caught = false;

  constructor(private o: LiarsOpts) {
    this.bidEl = h('div', { class: 'cs-ld-bid' });
    this.logEl = h('div', { class: 'cs-ld-log' });
    this.revealEl = h('div', { class: 'cs-ld-reveal' });
    this.qtyEl = h('div', { class: 'cs-ld-qty' }, '1');
    const faces = h('div', { class: 'cs-ld-faces' });
    for (let f = 2; f <= 6; f++) {
      const b = h('button', { class: 'cs-ld-facebtn', onclick: () => { this.face = f; this.fixQty(); this.renderCtrl(); audio.sfx('dice_land', { volume: 0.3, pitch: 1.4 }); } }, dieEl(f, 'sm'));
      this.faceBtns.push(b); faces.appendChild(b);
    }
    this.bidBtn = h('button', { class: 'cs-btn gold cs-ld-go', onclick: () => this.submitBid() }, 'Apostar', h('span', { class: 'lx-kbd' }, 'Enter')) as HTMLButtonElement;
    this.liarBtn = h('button', { class: 'cs-btn red cs-ld-go', onclick: () => this.act({ kind: 'liar' }) }, '¡Mentiroso!', h('span', { class: 'lx-kbd' }, 'L')) as HTMLButtonElement;
    this.exactBtn = h('button', { class: 'cs-btn cs-ld-go', onclick: () => this.act({ kind: 'exact' }), 'data-tip': '<b>¡Exacto!</b>\nSi hay exactamente esa cantidad, recuperas un dado. Si no, pierdes uno.' }, '¡Exacto!', h('span', { class: 'lx-kbd' }, 'X')) as HTMLButtonElement;
    this.cheatRow = h('div', { class: 'cs-ld-cheats' });
    this.ctrl = h('div', { class: 'cs-ld-ctrl' },
      h('div', { class: 'cs-ld-qtybox' }, h('button', { class: 'cs-bp-btn', onclick: () => this.stepQty(-1) }, '−'), this.qtyEl, h('button', { class: 'cs-bp-btn', onclick: () => this.stepQty(1) }, '+'), h('span', { class: 'cs-ld-times' }, '×')),
      faces, this.bidBtn, this.liarBtn, this.exactBtn);
    const rivals = h('div', { class: `cs-ld-rivals n${o.seats.length}` });
    for (const seat of o.seats) {
      const diceEl = h('div', { class: 'cs-ld-dice hidden' });
      const countEl = h('div', { class: 'cs-ld-count' });
      const face = h('div', { class: 'cs-ld-portrait', html: seat.portrait('smug') });
      const el = h('div', { class: 'cs-ld-seat' }, face, h('div', { class: 'cs-ld-name' }, seat.name, h('span', null, seat.title)),
        h('div', { class: 'cs-ld-cupwrap' }, diceEl, h('div', { class: 'cs-ld-cup' })), countEl);
      el.addEventListener('click', () => this.onSeatClick(seat.id));
      rivals.appendChild(el);
      this.ps.push({ id: seat.id, seat, dice: o.dice, hand: [], el, diceEl, countEl, face, read: false });
    }
    const myDice = h('div', { class: 'cs-ld-mydice' });
    const myCount = h('div', { class: 'cs-ld-count mine' });
    const me = h('div', { class: 'cs-ld-me' }, myDice, h('div', { class: 'cs-ld-mylabel' }, 'Tus dados · los ', dieEl(1, 'xs'), ' son comodines'), myCount);
    this.ps.unshift({ id: 'player', dice: o.dice, hand: [], el: me, diceEl: myDice, countEl: myCount, read: true });
    this.el = h('div', { class: `cs-ld ${o.dramatic ? 'dramatic' : ''}` }, rivals, h('div', { class: 'cs-ld-center' }, this.bidEl, this.revealEl, this.logEl), me, this.ctrl, this.cheatRow);
    o.root.appendChild(this.el);
    this.renderCounts();
    this.renderCtrl();
  }

  // ───────────── helpers ─────────────
  private get totalDice(): number { return this.ps.reduce((a, p) => a + p.dice, 0); }
  private active(): P[] { return this.ps.filter((p) => p.dice > 0); }
  private nextIdx(i: number): number { for (let k = 1; k <= this.ps.length; k++) { const j = (i + k) % this.ps.length; if (this.ps[j].dice > 0) return j; } return i; }
  private say(p: P, text: string, ms = 2200): void { if (p.seat && p.face) bubble(p.el, text, ms); }
  private mood(p: P, m: Parameters<Seat['portrait']>[0]): void { if (p.seat && p.face) p.face.innerHTML = p.seat.portrait(m); }

  private renderCounts(): void {
    for (const p of this.ps) {
      p.countEl.innerHTML = Array.from({ length: this.o.dice }, (_, i) => `<i class="${i < p.dice ? 'on' : ''}"></i>`).join('');
      p.el.classList.toggle('out', p.dice <= 0);
    }
  }

  private fixQty(): void {
    const min = minQtyFor(this.bid, this.face);
    if (this.qty < min) this.qty = min;
    if (this.qty > this.totalDice) this.qty = this.totalDice;
  }
  private stepQty(d: number): void { this.qty = Math.max(minQtyFor(this.bid, this.face), Math.min(this.totalDice, this.qty + d)); audio.sfx('chip_place', { pitch: 1 + this.qty * 0.02 }); this.renderCtrl(); }

  private renderCtrl(): void {
    const mine = this.turn === 0 && !!this.resolveAction;
    this.ctrl.classList.toggle('off', !mine);
    this.qtyEl.textContent = String(this.qty);
    this.faceBtns.forEach((b, i) => b.classList.toggle('on', this.face === i + 2));
    this.bidBtn.disabled = !mine || !isRaise(this.bid, { qty: this.qty, face: this.face });
    this.liarBtn.disabled = !mine || !this.bid;
    this.exactBtn.disabled = !mine || !this.bid;
    this.renderCheats();
  }

  private renderCheats(): void {
    this.cheatRow.innerHTML = '';
    const mine = this.turn === 0 && !!this.resolveAction;
    if (!mine) return;
    if (this.o.cheats && !this.mindUsed) {
      const b = cheatButton('dominar_mente', this.mode === 'mind' ? 'Elige a quién leer…' : 'Dominar Mente: ver sus dados', 12, 'Elige un rival: verás sus dados esta ronda.', () => { this.mode = this.mode === 'mind' ? 'idle' : 'mind'; this.el.classList.toggle('pick-mind', this.mode === 'mind'); this.renderCheats(); });
      if (b) this.cheatRow.appendChild(b);
    }
    if (this.o.cheats && !this.veloUsed) {
      const b = cheatButton('velo', this.mode === 'velo' ? 'Elige uno de tus dados…' : 'Velo: cambiar un dado', 10, 'Bajo el Velo, giras uno de tus dados a la cara que quieras.', () => { this.mode = this.mode === 'velo' ? 'idle' : 'velo'; this.el.classList.toggle('pick-velo', this.mode === 'velo'); this.renderCheats(); });
      if (b) this.cheatRow.appendChild(b);
    }
    if (this.rerollLeft > 0 && !this.bid) {
      this.cheatRow.appendChild(h('button', { class: 'cs-btn gold', onclick: () => void this.rerollMine() }, '⚀ Re-tirar mis dados (Dado de Hueso)'));
    }
  }

  // ───────────── player input ─────────────
  private submitBid(): void {
    if (this.bidBtn.disabled) return;
    this.act({ kind: 'bid', bid: { qty: this.qty, face: this.face } });
  }
  private act(d: { kind: 'bid'; bid: Bid } | { kind: 'liar' } | { kind: 'exact' }): void {
    if (!this.resolveAction || this.turn !== 0) return;
    if (d.kind !== 'bid' && !this.bid) return;
    const r = this.resolveAction; this.resolveAction = null;
    this.mode = 'idle'; this.el.classList.remove('pick-mind', 'pick-velo');
    r(d);
  }

  onKey(e: KeyboardEvent): boolean {
    if (this.turn !== 0 || !this.resolveAction) return false;
    if (e.code === 'Enter') { this.submitBid(); return true; }
    if (e.code === 'KeyL') { this.act({ kind: 'liar' }); return true; }
    if (e.code === 'KeyX') { this.act({ kind: 'exact' }); return true; }
    if (e.code === 'ArrowUp' || e.code === 'Equal') { this.stepQty(1); return true; }
    if (e.code === 'ArrowDown' || e.code === 'Minus') { this.stepQty(-1); return true; }
    const n = Number(e.key);
    if (n >= 2 && n <= 6) { this.face = n; this.fixQty(); this.renderCtrl(); return true; }
    return false;
  }

  private onSeatClick(id: string): void {
    if (this.mode !== 'mind') return;
    const p = this.ps.find((x) => x.id === id);
    if (!p || p.dice <= 0 || !p.seat) return;
    this.mode = 'idle'; this.el.classList.remove('pick-mind');
    this.mindUsed = true;
    res.spend('mana', 12);
    audio.sfx('mind_control');
    engine.pipeline.setMind(0.45);
    window.setTimeout(() => engine.pipeline.setMind(0), 900);
    this.mood(p, 'mind');
    const roll2 = cheatRoll(this.o.dramatic ? 'final' : 'dados', 'dominar_mente', 0.7, p.seat.persona.perception * 0.55);
    if (roll2.caught) { this.catchCheat(p, pick(p.seat.lines.caught)); return; }
    p.read = true;
    p.diceEl.classList.remove('hidden');
    p.el.classList.add('read');
    sparkleAt(centerOf(p.el).x, centerOf(p.el).y, 14, '#ff7bf0');
    window.setTimeout(() => this.mood(p, 'neutral'), 1400);
    this.renderCheats();
  }

  private bindVelo(): void {
    this.ps[0].diceEl.querySelectorAll('.cs-die').forEach((d, i) => {
      d.addEventListener('click', () => {
        if (this.mode !== 'velo') return;
        this.mode = 'idle'; this.el.classList.remove('pick-velo');
        const menu = h('div', { class: 'cs-ld-velomenu' }, ...[1, 2, 3, 4, 5, 6].map((f) => {
          const b = h('button', { class: 'cs-ld-facebtn', onclick: () => { menu.remove(); this.veloSwap(i, f); } }, dieEl(f, 'sm'));
          return b;
        }));
        (d as HTMLElement).appendChild(menu);
      });
    });
  }

  private veloSwap(i: number, f: number): void {
    const me = this.ps[0];
    if (this.veloUsed || !me.hand[i]) return;
    this.veloUsed = true;
    res.spend('mana', 10);
    audio.sfx('invisibility_on'); audio.sfx('cast_shadow', { volume: 0.5 });
    engine.pipeline.setDesat(0.6);
    window.setTimeout(() => engine.pipeline.setDesat(0), 700);
    const watchers = this.active().filter((p) => p.seat);
    const perc = Math.max(0, ...watchers.map((p) => p.seat!.persona.perception));
    const r = cheatRoll(this.o.dramatic ? 'final' : 'dados', 'velo', 0.9, perc * 0.4);
    if (r.caught) {
      const by = watchers.sort((a, b) => b.seat!.persona.perception - a.seat!.persona.perception)[0];
      this.catchCheat(by, pick(by.seat!.lines.caught));
      return;
    }
    me.hand[i] = f;
    const d = me.diceEl.children[i] as HTMLElement;
    d.classList.add('velo');
    setDie(d, f);
    if (r.noticed && watchers[0]) this.say(watchers[0], '…¿vieron eso? Juraría que ese dado se movió.', 2400);
    this.renderCheats();
  }

  private catchCheat(by: P, text: string): void {
    this.caught = true;
    this.mood(by, 'angry');
    this.say(by, text, 2600);
    audio.sfx('crowd_gasp');
    shakeEl(this.el, true);
    const r = this.resolveAction; this.resolveAction = null;
    r?.({ kind: 'liar' });
    window.setTimeout(() => this.o.onCaught(by.seat!, text), 1400);
  }

  private async rerollMine(): Promise<void> {
    if (this.rerollLeft <= 0 || this.bid) return;
    this.rerollLeft--;
    audio.sfx('dice_roll');
    await this.rollAnim(this.ps[0], roll(this.ps[0].dice, Math.random));
    this.renderCheats();
  }

  // ───────────── dice rendering ─────────────
  private async rollAnim(p: P, hand: number[]): Promise<void> {
    p.hand = hand;
    p.diceEl.innerHTML = '';
    const els = hand.map(() => dieEl(1 + Math.floor(Math.random() * 6), 'rolling'));
    els.forEach((e) => p.diceEl.appendChild(e));
    for (let k = 0; k < 7; k++) { await wait(70); els.forEach((e) => setDie(e, 1 + Math.floor(Math.random() * 6))); }
    els.forEach((e, i) => { setDie(e, hand[i]); e.classList.remove('rolling'); });
    if (p.id === 'player') this.bindVelo();
  }

  // ───────────── the game ─────────────
  async play(): Promise<LiarsResult> {
    let starter = 0;
    while (this.active().length > 1 && !this.disposed) {
      const r = await this.round(starter);
      if (this.disposed) return { winner: 'house', quit: true };
      if (this.caught) return { winner: 'house', caught: true };
      if (this.ps[0].dice <= 0) {
        const best = this.active().filter((p) => p.seat).sort((a, b) => b.dice - a.dice)[0];
        return { winner: best?.id ?? 'house' };
      }
      starter = r;
    }
    const w = this.active()[0];
    return { winner: w?.id ?? 'house' };
  }

  /** Plays one round; returns the index of the next starter. */
  private async round(starter: number): Promise<number> {
    this.o.onEvent?.('round', '');
    this.bid = null; this.bidder = -1; this.repeats = 0; this.lastPlayerFace = 0;
    this.logEl.innerHTML = '';
    this.revealEl.innerHTML = ''; this.revealEl.className = 'cs-ld-reveal';
    this.bidEl.innerHTML = '<span class="cs-ld-bid-who">Agitando los cubiletes…</span>';
    for (const p of this.ps) { p.read = p.id === 'player'; p.el.classList.remove('read', 'loser', 'winner'); p.diceEl.classList.toggle('hidden', !!p.seat); }
    this.el.querySelectorAll('.cs-ld-cup').forEach((c) => c.classList.remove('lift'));
    audio.sfx('dice_roll');
    await Promise.all(this.ps.map((p) => {
      if (p.dice <= 0) { p.hand = []; p.diceEl.innerHTML = ''; return Promise.resolve(); }
      let hand = roll(p.dice, Math.random);
      if (p.id === 'player' && Math.random() < luck() && hand.some((d) => d !== 1)) {
        const idx = hand.findIndex((d) => d !== 1); hand = hand.slice(); hand[idx] = 1;
        window.setTimeout(() => { sparkleAt(centerOf(this.ps[0].diceEl).x, centerOf(this.ps[0].diceEl).y, 12, '#7dffb0'); audio.sfx('cast_luck', { volume: 0.5 }); }, 700);
      }
      return this.rollAnim(p, hand);
    }));
    audio.sfx('dice_land');
    this.turn = starter;
    this.qty = 1; this.face = 2;
    this.fixQty();
    for (let guard = 0; guard < 80; guard++) {
      if (!this.o.alive() || this.disposed) return starter;
      const p = this.ps[this.turn];
      this.ps.forEach((x, i) => x.el.classList.toggle('turn', i === this.turn));
      if (!this.bid) this.bidEl.innerHTML = `<span class="cs-ld-bid-who">${p.seat ? `${p.seat.name} abre la apuesta…` : 'Tu turno: abre la apuesta'}</span>`;
      let d: { kind: 'bid'; bid: Bid } | { kind: 'liar' } | { kind: 'exact' };
      if (p.id === 'player') {
        this.fixQty();
        d = await new Promise((r) => { this.resolveAction = r; this.renderCtrl(); });
        this.renderCtrl();
      } else {
        this.renderCtrl();
        this.mood(p, 'neutral');
        if (Math.random() < 0.35) this.say(p, pick(p.seat!.lines.think), 1200);
        await wait((this.o.dramatic ? 1100 : 650) + Math.random() * 700);
        if (!this.o.alive() || this.disposed) return starter;
        const lastWasPlayer = this.bidder === 0;
        const dec = decide(p.hand, this.bid, p.seat!.persona, { totalDice: this.totalDice, grudge: p.seat!.grudge, repeats: lastWasPlayer ? this.repeats : 0, drunk: p.seat!.drunk }, Math.random);
        d = dec.kind === 'bid' ? { kind: 'bid', bid: dec.bid } : dec;
        if (dec.kind === 'bid') { this.say(p, pick(p.seat!.lines.bid), 1500); if (dec.bluff) this.mood(p, 'smug'); }
      }
      if (this.caught) return starter;
      if (d.kind === 'bid' || !this.bid) {
        const b = d.kind === 'bid' ? d.bid : { qty: 1, face: 2 };
        if (this.turn === 0) { this.repeats = b.face === this.lastPlayerFace ? this.repeats + 1 : 0; this.lastPlayerFace = b.face; }
        this.bid = b; this.bidder = this.turn;
        this.showBid(p, b);
        audio.sfx('chip_place', { pitch: 0.8 + b.qty * 0.03 });
        this.turn = this.nextIdx(this.turn);
        this.qty = b.qty; this.face = b.face; this.fixQty();
        continue;
      }
      // challenge
      const caller = this.turn, bidder = this.bidder;
      if (p.seat) { this.say(p, pick(d.kind === 'liar' ? p.seat.lines.liar : p.seat.lines.exact), 2000); this.mood(p, 'angry'); }
      else this.bidEl.innerHTML = `<span class="cs-ld-call">${d.kind === 'liar' ? '¡MENTIROSO!' : '¡EXACTO!'}</span>`;
      audio.sfx(d.kind === 'liar' ? 'gavel' : 'bell');
      engine.pipeline.chromaticPulse(0.5, 0.4);
      await wait(700);
      const count = await this.reveal(this.bid);
      let loser = -1, gainer = -1;
      if (d.kind === 'liar') loser = count >= this.bid.qty ? caller : bidder;
      else if (count === this.bid.qty) gainer = caller; else loser = caller;
      await wait(500);
      if (loser >= 0) await this.loseDie(loser);
      if (gainer >= 0) await this.gainDie(gainer);
      this.renderCounts();
      await wait(this.o.dramatic ? 1600 : 1100);
      const next = loser >= 0 ? (this.ps[loser].dice > 0 ? loser : this.nextIdx(loser)) : gainer;
      return next;
    }
    return starter;
  }

  private showBid(p: P, b: Bid): void {
    const who = p.seat ? p.seat.name : 'Tú';
    this.bidEl.innerHTML = '';
    this.bidEl.append(h('span', { class: 'cs-ld-bid-who' }, `${who} apuesta`), h('span', { class: 'cs-ld-bid-q' }, `${b.qty} ×`), dieEl(b.face, 'md'));
    this.bidEl.classList.remove('cs-pop'); void this.bidEl.offsetWidth; this.bidEl.classList.add('cs-pop');
    const line = h('div', { class: `cs-ld-logline ${p.seat ? '' : 'me'}` }, `${who}: ${b.qty} × `, dieEl(b.face, 'xs'));
    this.logEl.prepend(line);
    while (this.logEl.children.length > 5) this.logEl.lastElementChild?.remove();
  }

  private async reveal(b: Bid): Promise<number> {
    this.o.onEvent?.('reveal', '');
    this.el.querySelectorAll('.cs-ld-cup').forEach((c) => c.classList.add('lift'));
    for (const p of this.ps) p.diceEl.classList.remove('hidden');
    audio.sfx('card_flip', { pitch: 0.7 });
    await wait(500);
    let count = 0;
    this.revealEl.className = 'cs-ld-reveal show';
    this.revealEl.innerHTML = '';
    const counter = h('span', { class: 'cs-ld-rev-n' }, '0');
    this.revealEl.append(h('span', null, 'Hay'), counter, dieEl(b.face, 'md'), h('span', { class: 'cs-ld-rev-of' }, `de ${b.qty}`));
    for (const p of this.ps) {
      const ds = [...p.diceEl.children] as HTMLElement[];
      for (let i = 0; i < p.hand.length; i++) {
        const v = p.hand[i];
        if (v === b.face || v === 1) {
          count++;
          ds[i]?.classList.add('match');
          counter.textContent = String(count);
          counter.classList.remove('cs-pop'); void counter.offsetWidth; counter.classList.add('cs-pop');
          audio.sfx('dice_land', { volume: 0.5, pitch: 0.9 + count * 0.07 });
          await wait(this.o.dramatic ? 260 : 170);
        } else ds[i]?.classList.add('dim');
      }
    }
    const truth = count >= b.qty;
    this.revealEl.classList.add(truth ? 'truth' : 'lie');
    this.revealEl.append(h('div', { class: 'cs-ld-rev-verdict' }, truth ? (count === b.qty ? '¡Exacto!' : '¡Era verdad!') : '¡Era mentira!'));
    audio.sfx(truth ? 'crowd_cheer' : 'crowd_gasp', { volume: 0.5 });
    return count;
  }

  private async loseDie(i: number): Promise<void> {
    const p = this.ps[i];
    p.dice = Math.max(0, p.dice - 1);
    p.el.classList.add('loser');
    audio.sfx('hit_heavy', { volume: 0.6 }); audio.sfx('death_pop');
    shakeEl(p.el);
    const last = p.countEl.querySelectorAll('i.on');
    last[last.length - 1]?.classList.add('break');
    if (p.seat) { this.mood(p, p.dice <= 0 ? 'sad' : 'scared'); this.say(p, pick(p.dice <= 0 ? p.seat.lines.out : p.seat.lines.lose), 2200); }
    else engine.pipeline.flash('#e2455b', 0.2, 0.35);
    this.o.onEvent?.('lose_die', p.id);
    await wait(700);
  }

  private async gainDie(i: number): Promise<void> {
    const p = this.ps[i];
    p.dice = Math.min(this.o.dice, p.dice + 1);
    p.el.classList.add('winner');
    audio.sfx('level_up', { volume: 0.5 });
    if (p.seat) { this.mood(p, 'smile'); this.say(p, pick(p.seat.lines.win), 2000); }
    this.o.onEvent?.('win_die', p.id);
    await wait(600);
  }

  /** Force a quit (view closed). */
  dispose(): void {
    this.disposed = true;
    const r = this.resolveAction; this.resolveAction = null;
    r?.({ kind: 'liar' });
    engine.pipeline.setMind(0); engine.pipeline.setDesat(0);
    this.el.remove();
  }
}
