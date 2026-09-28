/**
 * Overworld HUD: name + resources (bump on change), moon phase + speed, Alerta del Concilio (+ Gran Sello),
 * five corruption rings with path breakdown, Designios tracker, news ticker, action buttons, prompts.
 */
import type { ContinentId, CorruptionPath } from '../../data/types';
import { CONTINENTS, LOCATIONS } from '../../data/world';
import { G, type NewsItem } from '../../core/state';
import { bus } from '../../core/events';
import { activeQuests } from '../../core/quests';
import { fmt } from '../../core/math';
import { h, esc } from '../../ui/dom';
import { audio } from '../../audio';
import { W } from '../../systems/world/state';
import { councilStatus, alertState } from '../../systems/society/api';
import { phaseGlyph, phaseName, lunasText } from '../../systems/world/time';
import { CONT_ORDER } from '../../systems/world/geo';
import { RES_ICON, UI_ICON, crest, type ResIcon } from './icons';

export interface HudHandlers {
  speed(s: number): void;
  pause(): void;
  codex(): void;
  relics(): void;
  army(): void;
  quests(): void;
  political(): void;
  book(): void;
  veil(): void;
  track(id: string): void;
}

const RES: Array<{ key: 'gold' | 'mana' | 'essence' | 'influence' | 'secrets'; icon: ResIcon; name: string; color: string }> = [
  { key: 'gold', icon: 'gold', name: 'Oro', color: 'var(--gold-hi)' },
  { key: 'mana', icon: 'mana', name: 'Maná', color: 'var(--mana)' },
  { key: 'essence', icon: 'essence', name: 'Esencia', color: 'var(--essence)' },
  { key: 'influence', icon: 'influence', name: 'Influencia', color: 'var(--influence)' },
  { key: 'secrets', icon: 'secrets', name: 'Secretos', color: 'var(--secret)' },
];
const RES_TIP: Record<string, string> = {
  gold: '<b>Oro</b><br>Comercio, reclutas, sobornos, apuestas y el mantenimiento del ejército.',
  mana: '<b>Maná</b><br>Hechizos. Se regenera rápido gracias a la Fuerza Titánica copiada.',
  essence: '<b>Esencia ✦</b><br>Cae de enemigos y ruinas. Sube de rango habilidades y paga fusiones.',
  influence: '<b>Influencia ♛</b><br>Capital político. Se gana corrompiendo; se gasta en el Concilio.',
  secrets: '<b>Secretos 🗝</b><br>Chantaje, debilidades de continentes, ubicaciones de reliquias.',
};
const PATH_NAME: Record<CorruptionPath, string> = { conquista: 'Conquista', intriga: 'Intriga', codicia: 'Codicia', terror: 'Terror' };

export class OverworldHUD {
  readonly root = h('div', { class: 'ow-hud' });
  private nameEl = h('div', { class: 'ow-name' });
  private chips = new Map<string, { el: HTMLElement; val: HTMLElement }>();
  private moonGlyph = h('div', { class: 'ow-moon-glyph' });
  private moonName = h('div', { class: 'ow-moon-name' });
  private speedBtns: HTMLElement[] = [];
  private alertFill = h('div', { class: 'ow-alert-fill' });
  private alertVal = h('b', null, '0');
  private alertBox!: HTMLElement;
  private selloEl = h('div', { class: 'ow-sello' });
  private tierEl = h('div', { class: 'ow-alert-tier' });
  private councilEl = h('div', { class: 'ow-council' });
  private rings = new Map<ContinentId, { el: HTMLElement; arc: SVGCircleElement; pct: HTMLElement; sig: string }>();
  private questBox = h('div', { class: 'ow-quests' });
  private questList = h('div', { class: 'ow-q-list' });
  private questSig = '';
  private ticker = h('div', { class: 'ow-ticker-text' });
  private tickerBox!: HTMLElement;
  private news: NewsItem[] = [];
  private newsT = 0;
  private bookBtn!: HTMLElement;
  private veilBtn!: HTMLElement;
  readonly prompt = h('div', { class: 'ow-prompt' });
  readonly hover = h('div', { class: 'ow-hovercard' });
  private scope = bus.scope();
  private pollT = 0;
  private collapsed = false;

  constructor(private hd: HudHandlers) {
    // ── identity + resources
    const chipsRow = h('div', { class: 'ow-res' });
    for (const r of RES) {
      const val = h('span', { class: 'ow-chip-val' });
      const el = h('div', { class: 'lx-chip ow-chip', 'data-tip': RES_TIP[r.key], style: `--rc:${r.color}` }, h('span', { class: 'ow-chip-ic', html: RES_ICON[r.icon] }), val);
      chipsRow.appendChild(el);
      this.chips.set(r.key, { el, val });
    }
    const id = h('div', { class: 'ow-idbox' },
      h('div', { class: 'ow-namerow' }, h('span', { class: 'ow-eclipse', html: UI_ICON.eclipse }), this.nameEl),
      chipsRow);
    // ── moon + speed
    const speed = h('div', { class: 'ow-speed' });
    const mk = (label: string, icon: string, tip: string, on: () => void) => {
      const b = h('button', { class: 'ow-sbtn', 'data-tip': tip, html: icon, 'aria-label': label, onclick: () => { audio.sfx('ui_click'); on(); } });
      speed.appendChild(b); this.speedBtns.push(b);
    };
    mk('Pausa', UI_ICON.pause, 'Pausa <span class="lx-kbd">Espacio</span>', () => this.hd.pause());
    mk('×1', UI_ICON.play, 'Velocidad ×1 <span class="lx-kbd">1</span>', () => this.hd.speed(1));
    mk('×2', UI_ICON.fast, 'Velocidad ×2 <span class="lx-kbd">2</span>', () => this.hd.speed(2));
    mk('×4', UI_ICON.faster, 'Velocidad ×4 <span class="lx-kbd">3</span>', () => this.hd.speed(4));
    const moon = h('div', { class: 'ow-moon', 'data-tip': 'El tiempo se mide en lunas. Nadie cuenta los años.' }, this.moonGlyph, h('div', { class: 'ow-moon-col' }, this.moonName, speed));
    // ── alert
    this.alertBox = h('div', { class: 'ow-alert', 'data-tip': '<b>Alerta del Concilio</b><br>Sube con acciones ruidosas; baja con sigilo.<br>50+: cazadores de héroes · 75+: la Alianza se moviliza · 100: el ritual del <b>Gran Sello</b>.' },
      h('div', { class: 'ow-alert-head' }, h('span', { class: 'ow-alert-ic', html: RES_ICON.alert }), h('span', null, 'Alerta del Concilio'), this.alertVal),
      h('div', { class: 'ow-alert-bar' }, this.alertFill, h('i', { style: 'left:50%' }), h('i', { style: 'left:75%' })),
      this.tierEl, this.selloEl, this.councilEl);
    const rightCol = h('div', { class: 'ow-rightcol' }, this.alertBox, this.questBox);
    const top = h('div', { class: 'ow-top' }, id, moon, rightCol);
    // ── rings (under the resources)
    const rings = h('div', { class: 'ow-rings' });
    id.appendChild(rings);
    for (const c of CONT_ORDER) {
      if (c === 'concordia') continue;
      const arc = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      arc.setAttribute('cx', '30'); arc.setAttribute('cy', '30'); arc.setAttribute('r', '26');
      arc.setAttribute('class', 'ow-ring-arc');
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 60 60');
      svg.innerHTML = '<circle cx="30" cy="30" r="26" class="ow-ring-bg"/>';
      svg.appendChild(arc);
      const pct = h('div', { class: 'ow-ring-pct' }, '0%');
      const el = h('div', { class: 'ow-ring', 'data-c': c },
        h('div', { class: 'ow-ring-svg' }, svg as unknown as HTMLElement, h('div', { class: 'ow-ring-crest', html: crest(c) })),
        pct, h('div', { class: 'ow-ring-name' }, CONTINENTS[c].name));
      rings.appendChild(el);
      this.rings.set(c, { el, arc, pct, sig: '' });
    }
    // ── quests
    const qHead = h('div', { class: 'ow-q-head', onclick: () => { this.collapsed = !this.collapsed; this.questBox.classList.toggle('collapsed', this.collapsed); audio.sfx('ui_tab'); } },
      h('span', { class: 'ow-q-ic', html: UI_ICON.quests }), h('span', null, 'Designios'), h('span', { class: 'lx-kbd' }, 'J'), h('span', { class: 'ow-q-caret', html: UI_ICON.collapse }));
    this.questBox.append(qHead, this.questList);
    // ── ticker
    this.tickerBox = h('div', { class: 'ow-ticker' }, h('span', { class: 'ow-ticker-tag' }, 'Rumores'), this.ticker);
    // ── actions
    const act = (label: string, icon: string, key: string, on: () => void, cls = '') => {
      const b = h('button', { class: `ow-act ${cls}`, 'data-tip': `${label} <span class="lx-kbd">${key}</span>`, onclick: () => { audio.sfx('ui_click'); on(); } },
        h('span', { class: 'ow-act-ic', html: icon }), h('span', { class: 'ow-act-l' }, label), h('span', { class: 'ow-act-k' }, key));
      return b;
    };
    this.bookBtn = act('Libro de la Realidad', UI_ICON.book, 'L', () => this.hd.book(), 'book');
    this.veilBtn = act('Velo', UI_ICON.veil, 'V', () => this.hd.veil(), 'veil');
    const actions = h('div', { class: 'ow-actions' },
      act('Códice', UI_ICON.codex, 'Tab', () => this.hd.codex()),
      act('Reliquias', UI_ICON.relics, 'I', () => this.hd.relics()),
      act('Ejército', UI_ICON.army, 'U', () => this.hd.army()),
      act('Designios', UI_ICON.quests, 'J', () => this.hd.quests()),
      act('Mapa político', UI_ICON.map, 'M', () => this.hd.political()),
      this.veilBtn, this.bookBtn);
    this.root.append(top, this.tickerBox, actions, this.prompt, this.hover);
  }

  mount(parent: HTMLElement): void {
    parent.appendChild(this.root);
    this.scope = bus.scope();
    const on = this.scope.on;
    on('res:change', ({ key, delta }) => this.onRes(key, delta));
    on('title:change', () => this.refreshName(true));
    on('news:add', ({ item }) => { this.news.unshift(item); this.showNews(item, true); });
    on('quest:added', () => this.refreshQuests(true));
    on('quest:progress', () => this.refreshQuests());
    on('quest:done', ({ quest }) => { this.refreshQuests(true); this.flashQuest(quest.title, true); });
    on('quest:failed', ({ quest }) => { this.refreshQuests(true); this.flashQuest(quest.title, false); });
    on('luna:tick', () => this.refreshMoon());
    on('world:time', () => this.refreshSpeed());
    this.news = [...(G.run?.news ?? [])];
    this.refreshAll();
    if (this.news[0]) this.showNews(this.news[0], false);
  }

  unmount(): void { this.scope.dispose(); this.root.remove(); }

  refreshAll(): void {
    if (!G.hasRun) return;
    for (const r of RES) this.setChip(r.key);
    this.refreshName(false);
    this.refreshMoon();
    this.refreshSpeed();
    this.refreshAlert();
    this.refreshRings();
    this.refreshQuests(true);
    this.refreshButtons();
  }

  private setChip(key: string): void {
    const c = this.chips.get(key);
    if (!c) return;
    const p = G.run.player;
    const v = (p as unknown as Record<string, number>)[key] ?? 0;
    c.val.textContent = key === 'mana' ? `${Math.floor(v)}/${Math.round(p.manaMax)}` : fmt(Math.floor(v));
  }

  private onRes(key: string, delta: number): void {
    if (key === 'alert') { this.refreshAlert(); if (delta > 0) { this.alertBox.classList.remove('bump'); void this.alertBox.offsetWidth; this.alertBox.classList.add('bump'); } return; }
    const c = this.chips.get(key);
    if (!c) return;
    this.setChip(key);
    if (key === 'mana' && delta > 0 && delta < 8) return;   // quiet regen ticks
    c.el.classList.remove('bump'); void c.el.offsetWidth; c.el.classList.add('bump');
    const f = h('div', { class: `ow-delta ${delta > 0 ? 'up' : 'down'}` }, `${delta > 0 ? '+' : '−'}${fmt(Math.abs(Math.round(delta)))}`);
    c.el.appendChild(f);
    setTimeout(() => f.remove(), 1200);
  }

  refreshName(animate: boolean): void {
    const n = G.run.player.name;
    this.nameEl.textContent = n.toUpperCase();
    if (animate) {
      this.nameEl.classList.remove('changed'); void this.nameEl.offsetWidth; this.nameEl.classList.add('changed');
    }
  }

  refreshMoon(): void {
    this.moonGlyph.textContent = phaseGlyph();
    this.moonName.textContent = phaseName();
  }

  refreshSpeed(): void {
    const w = W();
    this.speedBtns.forEach((b, i) => b.classList.toggle('on', i === 0 ? w.paused : !w.paused && w.speed === [0, 1, 2, 4][i]));
    this.root.classList.toggle('paused', w.paused);
  }

  refreshAlert(): void {
    const a = Math.round(G.run.player.alert);
    this.alertVal.textContent = String(a);
    this.alertFill.style.transform = `scaleX(${Math.min(1, a / 100)})`;
    this.alertBox.classList.toggle('hot', a >= 50);
    this.alertBox.classList.toggle('critical', a >= 75);
    let s: number | null = W().sello;
    try {
      const as = alertState();
      s = as.sello?.active ? as.sello.remaining : null;
      const bits = [`<b style="color:${as.color}">${esc(as.label)}</b>`];
      if (as.nextHuntersIn !== null && as.nextHuntersIn !== undefined) bits.push(as.nextHuntersIn <= 0 ? 'cazadores en camino' : `cazadores en ${esc(lunasText(as.nextHuntersIn))}`);
      if (as.bounty) bits.push('<span class="lx-bad">recompensa por tu cabeza</span>');
      if (as.drift < 0 && a > 0) bits.push(`<span class="lx-muted">baja ${Math.abs(Math.round(as.drift))}/luna</span>`);
      this.tierEl.innerHTML = bits.join(' · ');
      this.tierEl.style.display = '';
    } catch { this.tierEl.style.display = 'none'; }
    this.selloEl.style.display = s !== null && s !== undefined ? '' : 'none';
    if (s !== null && s !== undefined) this.selloEl.innerHTML = `El Gran Sello: <b>${esc(lunasText(s))}</b> para impedirlo`;
    let left: number | null = null, open = false;
    try {
      const cs = councilStatus();
      left = cs.lunasLeft;
      open = !!cs.session && (cs.session.status === 'pending' || cs.session.status === 'inprogress');
    } catch {
      const c = W().council;
      if (c) { left = c.lunaDue - G.run.luna; open = left <= 0; }
    }
    if (left !== null && !s) {
      this.councilEl.style.display = '';
      this.councilEl.innerHTML = open ? '<b>El Concilio sesiona</b> en Concordia' : `Sesión del Concilio en <b>${esc(lunasText(left))}</b>`;
    } else this.councilEl.style.display = 'none';
  }

  refreshRings(): void {
    for (const [c, r] of this.rings) {
      const st = G.run.continents[c];
      const v = Math.round(st?.corruption ?? 0);
      const sig = `${v}|${st?.corrupted}|${st?.weaknessKnown}|${JSON.stringify(st?.paths ?? {})}`;
      if (sig === r.sig) continue;
      r.sig = sig;
      const len = 2 * Math.PI * 26;
      r.arc.style.strokeDasharray = `${(len * v) / 100} ${len}`;
      r.pct.textContent = `${v}%`;
      r.el.classList.toggle('corrupted', !!st?.corrupted);
      const paths = (Object.keys(PATH_NAME) as CorruptionPath[]).map((p) => {
        const val = Math.round(st?.paths?.[p] ?? 0);
        const mult = st?.weaknessKnown ? ` <span class="lx-muted">×${(st.pathMult?.[p] ?? 1).toFixed(2)}</span>` : '';
        return `${PATH_NAME[p]}: <b>${val}</b>${mult}`;
      }).join('<br>');
      const weak = st?.weaknessKnown ? '' : '<br><span class="lx-muted">Debilidad desconocida (Secretos, Casa de las Sedas)</span>';
      r.el.setAttribute('data-tip', `<b>${CONTINENTS[c].name}</b> — ${CONTINENTS[c].epithet}<br>Corrupción <b>${v}%</b>${st?.corrupted ? ' · <span class="lx-violet">Corrompido</span>' : ''}<br>${paths}${weak}`);
    }
  }

  refreshButtons(): void {
    const p = G.run.player;
    this.bookBtn.style.display = p.books?.realidad || p.relics.some((r) => r.id === 'libro_realidad') ? '' : 'none';
    let velo = false;
    try { velo = !!p.codex?.velo?.acquired; } catch { velo = false; }
    this.veilBtn.style.display = velo ? '' : 'none';
    this.veilBtn.classList.toggle('active', W().veilT > 0);
  }

  refreshQuests(force = false): void {
    const qs = activeQuests();
    const w = W();
    if (!w.tracked || !qs.some((q) => q.id === w.tracked)) w.tracked = (qs.find((q) => q.kind === 'main' && q.target) ?? qs.find((q) => q.target) ?? qs[0])?.id ?? null;
    const sig = qs.map((q) => `${q.id}:${q.progress}/${q.goal}`).join('|') + w.tracked;
    if (!force && sig === this.questSig) return;
    this.questSig = sig;
    this.questList.innerHTML = '';
    if (!qs.length) { this.questList.appendChild(h('div', { class: 'ow-q-empty' }, 'Sin designios. Por ahora.')); return; }
    const order = { main: 0, side: 1, contract: 2 } as const;
    for (const q of qs.slice().sort((a, b) => order[a.kind] - order[b.kind]).slice(0, 6)) {
      const tracked = q.id === w.tracked;
      const tgt = q.target ? LOCATIONS[q.target]?.name : null;
      const exp = q.expiresLuna !== undefined ? ` · vence en ${lunasText(q.expiresLuna - G.run.luna)}` : '';
      const el = h('div', { class: `ow-q k-${q.kind} ${tracked ? 'tracked' : ''}`, onclick: () => { this.hd.track(q.id); this.refreshQuests(true); audio.sfx('ui_tab'); }, 'data-tip': `${esc(q.desc)}${q.reward?.gold ? `<br>Recompensa: <b>${q.reward.gold} oro</b>` : ''}` },
        h('div', { class: 'ow-q-title' }, h('span', { class: 'ow-q-dot' }), q.title),
        q.goal > 1 ? h('div', { class: 'ow-q-bar' }, h('div', { style: `transform:scaleX(${Math.min(1, q.progress / q.goal)})` })) : null,
        h('div', { class: 'ow-q-sub' }, `${q.goal > 1 ? `${q.progress}/${q.goal}` : ''}${tgt ? `${q.goal > 1 ? ' · ' : ''}${tgt}` : ''}${exp}`));
      this.questList.appendChild(el);
    }
  }

  private flashQuest(title: string, ok: boolean): void {
    const el = h('div', { class: `ow-q-flash ${ok ? 'ok' : 'bad'}` }, h('small', null, ok ? 'Designio cumplido' : 'Designio fallido'), title);
    this.root.appendChild(el);
    audio.sfx(ok ? 'level_up' : 'ui_error');
    setTimeout(() => el.remove(), 3200);
  }

  private showNews(item: NewsItem, fresh: boolean): void {
    this.newsT = 0;
    this.ticker.classList.remove('in'); void this.ticker.offsetWidth;
    this.ticker.innerHTML = `<span class="ow-news-k k-${item.kind}">${esc(item.kind === 'rumor' ? 'Rumor' : item.kind.charAt(0).toUpperCase() + item.kind.slice(1))}</span> ${esc(item.text)}`;
    this.ticker.classList.add('in');
    this.tickerBox.classList.toggle('important', !!item.important && fresh);
    if (fresh && item.important) audio.sfx('page_turn', { volume: 0.6 });
  }

  update(realDt: number): void {
    if (!G.hasRun) return;
    this.pollT += realDt;
    if (this.pollT > 0.5) {
      this.pollT = 0;
      this.refreshRings(); this.refreshAlert(); this.refreshButtons(); this.refreshMoon();
      this.setChip('mana');
    }
    this.newsT += realDt;
    if (this.newsT > 8 && this.news.length > 1) {
      const i = Math.floor(Math.random() * Math.min(8, this.news.length));
      this.showNews(this.news[i], false);
    }
  }

  setPrompt(html: string | null): void {
    if (!html) { this.prompt.classList.remove('show'); return; }
    if (this.prompt.innerHTML !== html) this.prompt.innerHTML = html;
    this.prompt.classList.add('show');
  }

  setHover(html: string | null, x = 0, y = 0): void {
    if (!html) { this.hover.classList.remove('show'); return; }
    if (this.hover.innerHTML !== html) this.hover.innerHTML = html;
    this.hover.style.transform = `translate(${Math.round(x + 18)}px, ${Math.round(y + 14)}px)`;
    this.hover.classList.add('show');
  }
}
