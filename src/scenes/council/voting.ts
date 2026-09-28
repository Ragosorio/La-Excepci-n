/**
 * Council voting UI (DOM over the 3D chamber): resolution card, delegate cards with lean meters and forecast,
 * the manipulation toolbar, and the dramatic one-by-one vote reveal.
 */
import { G } from '../../core/state';
import { fmt } from '../../core/math';
import { h, clear, layer, wait } from '../../ui/dom';
import { button } from '../../ui/widgets';
import { banner, toast } from '../../ui/toasts';
import { narrate } from '../../ui/narrator';
import { portraitSVG, type PortraitMood } from '../../ui/art/portraits';
import { audio } from '../../audio';
import { engine } from '../../core/engine';
import type { ContinentId } from '../../data/types';
import { CONTINENTS } from '../../data/world';
import { RESOLUTIONS } from '../../systems/society/resolutions';
import {
  TOOLS, TOOL_NAMES, allLeans, castVotes, currentRes, delegateId, finishResolution, finishSession, forecast, leanOf, paramsFor, toolInfo, useTool,
  type Ballot, type CouncilRuntime, type Tool,
} from '../../systems/society/politics';
import { npcView, portraitFor } from '../../systems/society/memory';
import { crest, resIcon } from '../../systems/society/icons';
import { popText } from '../../systems/society/uifx';
import { seatsHeld } from '../../systems/society/state';
import { SEAT_ORDER } from './chamber';
import './council.css';

export interface CouncilHooks {
  focus(target: 'wide' | 'elias' | 'ione' | number): void;
  react(id: string, mood: PortraitMood): void;
  vote(id: string, forElias: boolean, vote: 'si' | 'no'): Promise<void>;
  sitAll(): void;
  eliasAct(kind: Tool): void;
  kill(id: string): void;
  cheer(amount: number): void;
  refreshSeats(): void;
  leave(): void;
}

const TOOL_ICON: Record<Tool, string> = {
  dominar: resIcon('mana', 22), sobornar: resIcon('oro', 22), chantajear: resIcon('secreto', 22), intimidar: resIcon('alerta', 22),
  favor: resIcon('influencia', 22), discurso: resIcon('influencia', 22),
  asesinar: `<svg viewBox="0 0 32 32" width="22" height="22"><path d="M16 3 L19 18 H13 Z" fill="#dfe6ee" stroke="#150b1f" stroke-width="1.6" stroke-linejoin="round"/><rect x="10" y="18" width="12" height="3" rx="1" fill="#d9b36c" stroke="#150b1f" stroke-width="1.4"/><rect x="14.5" y="21" width="3" height="7" rx="1" fill="#6a3a2a" stroke="#150b1f" stroke-width="1.4"/></svg>`,
};
const TOOL_TIP: Record<Tool, string> = {
  dominar: 'Voltea fuerte su voto toda la sesión. Riesgo de que lo noten (salvo bajo Velo).',
  sobornar: 'Oro por su voto en esta resolución. Los codiciosos salen baratos; los honorables pueden ofenderse.',
  chantajear: 'Gasta un Secreto. Con un secreto suyo de la Casa de las Sedas, el efecto es enorme.',
  intimidar: 'El miedo convence. Los valientes resisten.',
  favor: 'Influencia a cambio de un pequeño empujón.',
  discurso: 'Habla ante todos (necesitas un asiento). Empuja a toda la sala.',
  asesinar: 'El Gremio de la Ceniza lo resuelve. Su asiento queda vacío. Alerta +25.',
};

function leanColor(lean: number): string { return lean > 25 ? '#b48cff' : lean < -25 ? '#ff6b7d' : '#e8d9a8'; }

export class CouncilUI {
  private root = h('div', { class: 'pol-ui' });
  private cardEl = h('div', { class: 'pol-card' });
  private sideEl = h('div', { class: 'pol-side' });
  private stripEl = h('div', { class: 'pol-strip' });
  private toolsEl = h('div', { class: 'pol-tools' });
  private logEl = h('div', { class: 'pol-log' });
  private headEl = h('div', { class: 'pol-head' });
  private selected: string | null = null;
  private busy = false;
  private revealed = false;
  private stamps: HTMLElement[] = [];
  private onKey = (e: KeyboardEvent) => this.key(e);

  constructor(private rt: CouncilRuntime, private hooks: CouncilHooks) {
    this.root.append(h('div', { class: 'pol-top' }, this.headEl, this.cardEl, this.sideEl), this.logEl, h('div', { class: 'pol-bottom' }, this.toolsEl, this.stripEl));
  }

  mount(): void {
    layer('hud').appendChild(this.root);
    window.addEventListener('keydown', this.onKey);
    this.render();
    void this.root.offsetWidth;   // flush styles so the fade-in transition runs (rAF may be throttled in background tabs)
    this.root.classList.add('in');
  }

  destroy(): void {
    window.removeEventListener('keydown', this.onKey);
    this.root.remove();
    for (const s of this.stamps) s.remove();
    this.stamps = [];
  }

  private key(e: KeyboardEvent): void {
    if (this.busy || document.querySelector('.lx-modal-back')) return;
    const n = Number(e.key);
    if (n >= 1 && n <= 5) { this.select(delegateId(SEAT_ORDER[n - 1]), n - 1); }
  }

  private select(id: string, seat: number): void {
    this.selected = this.selected === id ? null : id;
    audio.sfx('ui_tab');
    this.hooks.focus(this.selected ? seat : 'wide');
    this.render();
  }

  private log(text: string, kind: 'good' | 'bad' | 'info' = 'info'): void {
    this.logEl.textContent = text;
    this.logEl.className = `pol-log show ${kind}`;
    clearTimeout((this.logEl as unknown as { _t?: number })._t);
    (this.logEl as unknown as { _t?: number })._t = window.setTimeout(() => this.logEl.classList.remove('show'), 5200);
  }

  render(): void {
    const resId = currentRes(this.rt);
    this.renderHead();
    clear(this.cardEl); clear(this.sideEl); clear(this.stripEl); clear(this.toolsEl);
    if (!resId) { this.renderEnd(); return; }
    this.renderCard(resId);
    this.renderSide();
    this.renderStrip();
    if (!this.revealed) this.renderTools();
  }

  private renderHead(): void {
    clear(this.headEl);
    const s = this.rt.session;
    const i = Math.min(this.rt.index + 1, s.resolutions.length);
    this.headEl.append(
      h('div', { class: 'pol-head-title' }, 'El Concilio de los Cinco'),
      h('div', { class: 'pol-head-sub' }, s.emergency ? 'Sesión de emergencia · ' : '', `Resolución ${i} de ${s.resolutions.length}`),
      h('div', { class: 'pol-res' },
        h('span', { class: 'lx-chip', 'data-tip': 'Maná' }, h('span', { html: resIcon('mana', 18) }), String(Math.round(G.run.player.mana))),
        h('span', { class: 'lx-chip', 'data-tip': 'Oro' }, h('span', { html: resIcon('oro', 18) }), fmt(G.run.player.gold)),
        h('span', { class: 'lx-chip', 'data-tip': 'Secretos' }, h('span', { html: resIcon('secreto', 18) }), String(G.run.player.secrets)),
        h('span', { class: 'lx-chip', 'data-tip': 'Influencia' }, h('span', { html: resIcon('influencia', 18) }), String(G.run.player.influence)),
        h('span', { class: 'lx-chip pol-alert', 'data-tip': 'Alerta del Concilio' }, h('span', { html: resIcon('alerta', 18) }), String(Math.round(G.run.player.alert)))));
  }

  private renderCard(resId: string): void {
    const r = RESOLUTIONS[resId];
    const p = paramsFor(this.rt.session, resId);
    const want = r.eliasWants(p);
    this.cardEl.append(
      h('div', { class: 'pol-card-icon' }, r.icon),
      h('div', { class: 'pol-card-title' }, r.title(p)),
      h('div', { class: 'pol-card-desc' }, r.desc(p)),
      h('div', { class: 'pol-card-fx' }, h('span', { class: 'pol-card-fx-label' }, 'Si se aprueba:'), ...r.passText(p).map((t) => h('div', null, `• ${t}`))),
      h('div', { class: `pol-want ${want}` }, want === 'si' ? 'Te conviene que PASE' : 'Te conviene que FRACASE'));
  }

  private renderSide(): void {
    const f = forecast(this.rt);
    const pct = Math.round(f.pWin * 100);
    const { ione } = allLeans(this.rt);
    const ioneV = npcView('ione');
    const dots = allLeans(this.rt).delegates.map((d) => h('span', { class: `pol-dot ${d.empty ? 'empty' : d.lean >= 35 ? 'for' : d.lean <= -35 ? 'against' : 'maybe'}` }));
    this.sideEl.append(
      h('div', { class: 'pol-fc-label' }, 'Pronóstico'),
      h('div', { class: 'pol-fc-pct', style: `color:${pct >= 60 ? 'var(--good)' : pct >= 40 ? 'var(--gold-hi)' : 'var(--blood)'}` }, `${pct}%`),
      h('div', { class: 'pol-fc-sub' }, 'de salirte con la tuya'),
      h('div', { class: 'pol-dots' }, ...dots),
      h('div', { class: 'pol-ione', 'data-tip': 'La Custodia solo vota si hay empate.' },
        h('div', { class: 'pol-ione-face', html: portraitSVG(portraitFor('ione', ione.lean > 20 ? 'smile' : ione.lean < -20 ? 'determined' : 'neutral'), 64) }),
        h('div', null, h('div', { class: 'pol-ione-name' }, ioneV?.name ?? 'Ione Salvaterra'), h('div', { class: 'lx-small lx-muted' }, 'Desempata'),
          h('div', { class: 'lx-small', style: `color:${leanColor(ione.lean)}` }, `${Math.round(ione.p * 100)}% a tu favor`))));
    if (!this.revealed) this.sideEl.appendChild(button(h('span', { class: 'pol-vote-lbl' }, '¡A VOTAR!'), () => void this.reveal(), { kind: 'primary', big: true, className: 'pol-vote-btn' }));
  }

  private renderStrip(): void {
    const seats = seatsHeld();
    SEAT_ORDER.forEach((c, i) => {
      const id = delegateId(c);
      const v = npcView(id);
      const l = leanOf(this.rt, id, c);
      const mine = seats.includes(c);
      const sel = this.selected === id;
      const pct = Math.round(l.p * 100);
      const needle = Math.max(0, Math.min(100, (l.lean + 100) / 2));
      const badges: string[] = [];
      if (mine) badges.push('♛ Tu asiento');
      if (l.bought) badges.push('💰 Voto comprado');
      if ((this.rt.sessionUsed[id] ?? []).includes('dominar')) badges.push('🌀 Dominado');
      if ((this.rt.sessionUsed[id] ?? []).includes('chantajear')) badges.push('🗝 Chantajeado');
      if ((this.rt.used[id] ?? []).includes('sobornar')) badges.push('💰 Sobornado');
      if ((this.rt.used[id] ?? []).includes('intimidar')) badges.push('👁 Intimidado');
      const mood: PortraitMood = l.empty ? 'dead' : (this.rt.sessionUsed[id] ?? []).includes('dominar') ? 'mind' : l.lean >= 35 ? 'smile' : l.lean <= -35 ? 'angry' : 'neutral';
      const card = h('div', { class: `pol-del ${sel ? 'sel' : ''} ${mine ? 'mine' : ''} ${l.empty ? 'empty' : ''}`, 'data-id': id, onclick: () => { if (!this.busy) this.select(id, i); } },
        h('div', { class: 'pol-del-top' },
          h('div', { class: 'pol-del-face', html: portraitSVG(portraitFor(id, mood), 96) }),
          h('div', { class: 'pol-del-crest', html: crest(c, 26), 'data-tip': CONTINENTS[c].name })),
        h('div', { class: 'pol-del-name' }, v?.name ?? id),
        h('div', { class: 'pol-del-cont' }, CONTINENTS[c].name, h('span', { class: 'lx-kbd' }, String(i + 1))),
        l.empty ? h('div', { class: 'pol-del-empty' }, 'Asiento vacío')
          : h('div', { class: 'pol-meter', 'data-tip': `Postura hacia ti: ${Math.round(l.lean)}` },
            h('div', { class: 'pol-meter-track' }, h('div', { class: 'pol-meter-mid' }), h('div', { class: 'pol-meter-needle', style: `left:${needle}%;background:${leanColor(l.lean)}` }))),
        !l.empty ? h('div', { class: 'pol-del-p', style: `color:${leanColor(l.lean)}` }, mine || l.bought ? 'Vota contigo' : `${pct}% a tu favor`) : null,
        badges.length ? h('div', { class: 'pol-badges' }, ...badges.map((b) => h('span', null, b))) : null);
      this.stripEl.appendChild(card);
    });
  }

  private renderTools(): void {
    const sel = this.selected;
    const c = sel ? (SEAT_ORDER.find((x) => delegateId(x) === sel) ?? null) : null;
    const target = sel ? npcView(sel)?.name : null;
    this.toolsEl.appendChild(h('div', { class: 'pol-tools-label' }, target ? `Sobre ${target}:` : 'Elige un delegado (1–5)'));
    for (const t of TOOLS) {
      const forAll = t === 'discurso';
      const info = toolInfo(this.rt, t, forAll ? (sel ?? delegateId(SEAT_ORDER[0])) : sel ?? '', forAll ? null : c);
      const disabled = this.busy || (!forAll && !sel) || !info.available;
      const risk = info.risk && info.risk < 1 ? ` · riesgo ${Math.round(info.risk * 100)}%` : '';
      const tip = `<b>${TOOL_NAMES[t]}</b>\n${TOOL_TIP[t]}\n${info.cost ? `Costo: ${info.cost}${risk}` : ''}${info.reason && (sel || forAll) ? `\n<i>${info.reason}</i>` : ''}`;
      const btn = h('button', { class: `pol-tool ${t === 'asesinar' ? 'danger' : ''}`, disabled, 'data-tip': tip, onclick: (e: MouseEvent) => this.use(t, e.currentTarget as HTMLElement) },
        h('span', { class: 'pol-tool-icon', html: TOOL_ICON[t] }), h('span', { class: 'pol-tool-name' }, TOOL_NAMES[t]), h('span', { class: 'pol-tool-cost' }, info.cost || ''));
      this.toolsEl.appendChild(btn);
    }
  }

  private use(t: Tool, anchor: HTMLElement): void {
    if (this.busy) return;
    const forAll = t === 'discurso';
    const id = forAll ? delegateId(SEAT_ORDER[0]) : this.selected;
    if (!id) return;
    const c = forAll ? null : SEAT_ORDER.find((x) => delegateId(x) === id) ?? null;
    const before = forecast(this.rt).pWin;
    const r = useTool(this.rt, t, id, c);
    if (!r.ok) { audio.sfx('ui_error'); this.log(r.text, 'bad'); return; }
    this.hooks.eliasAct(t);
    if (r.mood === 'dead') { this.hooks.kill(id); this.selected = null; }
    else if (r.mood && !forAll) this.hooks.react(id, r.mood);
    if (forAll) this.hooks.cheer(0.8);
    const after = forecast(this.rt).pWin;
    const d = Math.round((after - before) * 100);
    this.log(r.text, r.detected || r.refused ? 'bad' : 'good');
    popText(anchor, d ? `${d > 0 ? '+' : ''}${d}% pronóstico` : r.refused ? '¡Rechazado!' : '✓', d >= 0 && !r.refused ? 'var(--violet-hi)' : 'var(--blood)', Math.abs(d) >= 15);
    if (r.detected) { engine.pipeline?.flash('#e2455b', 0.25, 0.4); audio.sfx('crowd_gasp'); this.hooks.cheer(1); }
    this.hooks.refreshSeats();
    this.render();
  }

  // ───────────────────────────── the vote ─────────────────────────────

  private async reveal(): Promise<void> {
    if (this.busy || !currentRes(this.rt)) return;
    this.busy = true;
    this.revealed = true;
    this.render();
    this.root.classList.add('revealing');
    engine.pipeline?.setLetterbox(1);
    audio.duck(0.6, 1);
    audio.sfx('gavel');
    const resId = currentRes(this.rt)!;
    const { result, ballots, tie } = castVotes(this.rt);
    const tally = h('div', { class: 'pol-tally' }, h('span', { class: 'si' }, 'SÍ 0'), h('span', { class: 'sep' }, '·'), h('span', { class: 'no' }, 'NO 0'));
    this.cardEl.appendChild(tally);
    let yes = 0, no = 0;
    await wait(700);
    for (const b of ballots) {
      await this.showBallot(b);
      if (b.vote === 'si') yes++; else if (b.vote === 'no') no++;
      tally.innerHTML = `<span class="si">SÍ ${yes}</span><span class="sep">·</span><span class="no">NO ${no}</span>`;
      tally.classList.remove('bump'); void tally.offsetWidth; tally.classList.add('bump');
    }
    if (tie) {
      this.log('Empate. La Custodia desempata.', 'info');
      audio.sfx('heartbeat');
      this.hooks.focus('ione');
      await wait(1300);
      await this.showBallot(tie);
      if (tie.vote === 'si') yes++; else no++;
      tally.innerHTML = `<span class="si">SÍ ${yes}</span><span class="sep">·</span><span class="no">NO ${no}</span>`;
    }
    this.hooks.focus('wide');
    await wait(700);
    audio.sfx('gavel'); await wait(240); audio.sfx('gavel'); await wait(240); audio.sfx('gavel');
    const lines = finishResolution(this.rt, result);
    engine.pipeline?.setLetterbox(0);
    engine.pipeline?.flash(result.eliasWon ? '#c7a2ff' : '#e2455b', 0.3, 0.6);
    this.hooks.cheer(1.2);
    audio.sfx(result.eliasWon ? 'crowd_cheer' : 'crowd_boo');
    if (result.eliasWon) audio.stinger('victory');
    const title = RESOLUTIONS[resId].title(paramsFor(this.rt.session, resId));
    await banner(result.passed ? 'APROBADA' : 'RECHAZADA', `${title} · ${result.yes}–${result.no}`, { kind: result.eliasWon ? 'excepcion' : 'defeat', duration: 2.2 });
    toast(`<b>${result.passed ? 'Aprobada' : 'Rechazada'}:</b> ${lines.join(' · ')}`, { kind: result.eliasWon ? 'epica' : 'bad', duration: 6 });
    this.hooks.sitAll();
    for (const s of this.stamps) s.remove();
    this.stamps = [];
    this.root.classList.remove('revealing');
    this.revealed = false;
    this.busy = false;
    this.selected = null;
    this.hooks.refreshSeats();
    this.render();
  }

  private async showBallot(b: Ballot): Promise<void> {
    const seat = b.continent ? SEAT_ORDER.indexOf(b.continent) : -1;
    const sure = b.certainty >= 100;
    this.hooks.focus(seat >= 0 ? seat : 'ione');
    await wait(sure ? 380 : 700);
    await this.hooks.vote(b.id, b.forElias, b.vote === 'si' ? 'si' : 'no');
    if (b.vote === 'abst') return;
    const v = npcView(b.id);
    const stamp = h('div', { class: `pol-stamp ${b.vote} ${b.forElias ? 'good' : 'bad'}` }, b.vote === 'si' ? 'SÍ' : 'NO', h('small', null, v?.name ?? ''));
    layer('cutin').appendChild(stamp);
    this.stamps.push(stamp);
    audio.sfx(b.forElias ? 'ui_confirm' : 'hit_heavy', { volume: 0.7 });
    const card = this.stripEl.querySelector(`[data-id="${b.id}"]`);
    card?.classList.add(b.forElias ? 'voted-for' : 'voted-against');
    if (!sure && Math.abs(b.lean) < 35) { audio.sfx('heartbeat', { volume: 0.6 }); this.hooks.cheer(0.4); }
    await wait(sure ? 560 : 950);
    stamp.classList.add('out');
  }

  private renderEnd(): void {
    const s = this.rt.session;
    const won = s.results.filter((r) => r.eliasWon).length;
    this.cardEl.append(
      h('div', { class: 'pol-card-icon' }, '⚖'),
      h('div', { class: 'pol-card-title' }, 'La sesión ha terminado'),
      ...s.results.map((r) => {
        const def = RESOLUTIONS[r.id];
        return h('div', { class: `pol-end-row ${r.eliasWon ? 'won' : 'lost'}` },
          h('span', null, def ? def.title(paramsFor(s, r.id)) : r.id),
          h('b', null, `${r.passed ? 'Aprobada' : 'Rechazada'} ${r.yes}–${r.no}`));
      }),
      h('div', { class: 'pol-card-desc' }, won === s.results.length ? 'El Concilio votó exactamente lo que querías. Nadie sabe cómo.' : won ? 'Ganaste algunas. Perdiste otras. La mesa te recuerda.' : 'La mesa votó en tu contra. Por ahora.'),
      button('Salir del Concilio', () => this.hooks.leave(), { kind: 'primary', big: true }));
    if (s.status !== 'resolved') {
      finishSession(this.rt);
      void narrate(won >= Math.ceil(s.results.length / 2)
        ? { third: 'Al salir, {name} saludó a la Custodia con una reverencia perfecta. Ella no se la devolvió.', first: 'Al salir, saludé a la Custodia con una reverencia perfecta. Ella no me la devolvió.' }
        : { third: 'Las puertas de mármol se cerraron detrás de {name}. Sonaron como una sentencia.', first: 'Las puertas de mármol se cerraron detrás de mí. Sonaron como una sentencia.' });
    }
  }
}

/** Continent of a seat index (for the scene). */
export function seatContinent(i: number): ContinentId { return SEAT_ORDER[i]; }
