/**
 * Los Márgenes ('margins') — between cycles. An open book: on the left, the ink tally of the cycle that ended and
 * the Ecos you carry into the next; on the right, "Anotaciones al margen" — permanent notes bought with Tinta.
 * "Comenzar el Ciclo N" → newRun → the prologue (skippable from cycle 2).
 */
import './margins.css';
import * as THREE from 'three';
import { engine, registerScene, type GameScene } from '../../core/engine';
import { G } from '../../core/state';
import { saveMeta } from '../../core/save';
import { h, layer, wait } from '../../ui/dom';
import { narrate, clearNarrator } from '../../ui/narrator';
import { audio } from '../../audio';
import { MARGINS, RELIC_RARITY_LABEL, RELIC_RARITY_BY_RANK } from '../../data/margins';
import { Eclipse } from '../title/eclipse';
import { glyph } from '../../systems/story/glyphs';
import { pendingTally, startNextCycle, type Tally } from '../../systems/story/cycle';
import { marginRank, marginNextCost, buyMargin, echoSlots, echoCandidates } from '../../systems/story/margins';
import { openBook, pageCompletion } from '../../systems/story/pages';
import { openAchievements, achievementCompletion } from '../../systems/story/achievements';
import { lineFor } from '../../systems/story/narration';
import { abilityName } from '../../systems/story/state';

const fmtInk = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

class MarginsScene implements GameScene {
  readonly id = 'margins';
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(40, 1, 0.1, 1200);
  private eclipse: Eclipse | null = null;
  private root: HTMLElement | null = null;
  private inkEl: HTMLElement | null = null;
  private list: HTMLElement | null = null;
  private chips: HTMLElement | null = null;
  private alive = true;
  private t = 0;

  enter(params?: unknown): void {
    clearNarrator(); // queued gameplay lines must not spill into the cinematic
    const p = (params ?? {}) as Record<string, unknown>;
    this.alive = true;
    this.scene.background = new THREE.Color('#050309');
    this.eclipse = new Eclipse({ radius: 2.6, stars: true, ash: true, motes: true, intensity: 0.7, eye: (G.meta?.cyclesCompleted ?? 0) >= 2 });
    this.eclipse.group.position.set(0, 5.2, -8);
    this.scene.add(this.eclipse.group);
    if ((G.meta?.cyclesCompleted ?? 0) >= 2) this.eclipse.openEye(0.6);
    this.camera.position.set(0, 0, 16);
    this.camera.lookAt(0, 1, 0);
    engine.pipeline.setBloom(0.7, 0.35, 0.7);
    engine.pipeline.setGrade({ vignette: 0.9, grain: 0.05 });
    audio.setIntensity(0);
    audio.music('title');
    this.build(p);
  }

  private build(p: Record<string, unknown>): void {
    const meta = G.meta;
    const next = meta.cyclesCompleted + 1;
    const lastEnding = meta.endings[meta.endings.length - 1];
    const tally = pendingTally();
    const fresh = !!tally && !meta.flags.st_tally_shown;
    const sub = meta.cyclesCompleted > 0
      ? `Ciclo ${meta.cyclesCompleted} · ${lastEnding === 'sello' ? 'El Sello' : lastEnding === 'el' ? 'Él' : 'Inconcluso'}`
      : 'Antes del primer ciclo';
    this.inkEl = h('div', { class: 'st-mg-ink', html: `${glyph('ink', 20, '#c7a2ff')}<span>${fmtInk(meta.ink - (fresh && tally ? tally.total : 0))}</span>` });

    // left page: the tally + ecos + links
    const tallyBox = h('div', { class: 'st-mg-tally' });
    const totalEl = h('div', { class: 'st-mg-total' }, h('span', null, 'Tinta'), h('span', { class: 'v', html: `${glyph('ink', 18, '#5a2a8a')}<span>0</span>` }));
    const left = h('div', { class: 'st-mg-page left' },
      h('div', { class: 'st-mg-h' }, 'La cuenta', h('small', null, tally ? `del ciclo ${tally.cycle}` : '')),
      h('div', { class: 'st-mg-rule' }),
      tally ? tallyBox : h('div', { class: 'st-mg-none' }, 'No hay nada que contar. Todavía.'),
      tally ? totalEl : null,
      this.buildEchoes(),
      h('div', { class: 'st-mg-links' },
        h('button', { class: 'st-mg-link', onclick: () => void openBook() }, `El Libro · ${pageCompletion().found}/${pageCompletion().total}`),
        h('button', { class: 'st-mg-link', onclick: () => void openAchievements() }, `Hazañas · ${achievementCompletion().got}/${achievementCompletion().total}`)));

    // right page: margin notes
    this.list = h('div', { class: 'st-mg-list' });
    const right = h('div', { class: 'st-mg-page right' },
      h('div', { class: 'st-mg-h' }, 'Anotaciones al margen', h('small', null, 'se quedan de un ciclo al otro')),
      h('div', { class: 'st-mg-rule' }),
      this.list);
    this.renderNotes();

    const start = h('button', { class: 'lx-btn primary big', onclick: () => void this.begin() }, `Comenzar el Ciclo ${next}`);
    this.root = h('div', { class: 'st-mg' },
      h('div', { class: 'st-mg-head' }, h('div', { class: 'st-mg-title' }, 'Los Márgenes'), h('div', { class: 'st-mg-sub' }, sub)),
      h('div', { class: 'st-mg-book' }, left, right),
      h('div', { class: 'st-mg-foot' }, this.inkEl, start,
        p.fromTitle ? h('button', { class: 'st-mg-back', onclick: () => void engine.goto('title') }, 'Volver') : null));
    layer('panel').appendChild(this.root);
    requestAnimationFrame(() => this.root?.classList.add('in'));

    // the voice comments on the new cycle
    setTimeout(() => {
      if (!this.alive) return;
      const key = lastEnding === 'sello' && Math.random() < 0.6 ? 'new_cycle_sello' : 'new_cycle';
      const l = lineFor(key);
      if (l) void narrate(l, { position: 'top', hold: 3.6, person: meta.cyclesCompleted >= 2 && l.direct ? 'direct' : meta.cyclesCompleted >= 1 && l.first ? 'first' : 'third' });
    }, 1800);

    if (tally) void this.animateTally(tally, tallyBox, totalEl, fresh);
  }

  private async animateTally(tally: Tally, box: HTMLElement, totalEl: HTMLElement, fresh: boolean): Promise<void> {
    const rows = tally.rows.map((r) => {
      const v = h('span', { class: 'v' }, fresh ? '+0' : `+${r.ink}`);
      const el = h('div', { class: `st-mg-row ${fresh ? '' : 'in'}` }, h('span', { class: 'l' }, r.label), r.detail ? h('span', { class: 'd' }, r.detail) : null, h('span', { class: 'dots' }), v);
      box.appendChild(el);
      return { el, v, ink: r.ink };
    });
    const totalV = totalEl.querySelector('.v span') as HTMLElement;
    if (!fresh) { totalEl.classList.add('in'); totalV.textContent = fmtInk(tally.total); return; }
    await wait(1400);
    let running = 0;
    for (const r of rows) {
      if (!this.alive) return;
      r.el.classList.add('in');
      audio.sfx('quill', { volume: 0.45 });
      const steps = Math.min(18, Math.max(4, r.ink));
      for (let i = 1; i <= steps; i++) {
        r.v.textContent = `+${Math.round((r.ink * i) / steps)}`;
        if (i % 3 === 0) audio.sfx('coin', { volume: 0.25, pitch: 1 + i * 0.03 });
        await wait(28);
      }
      running += r.ink;
      await wait(180);
    }
    totalEl.classList.add('in');
    const base = G.meta.ink - tally.total;
    const inkSpan = this.inkEl?.querySelector('span');
    const steps = 30;
    for (let i = 1; i <= steps; i++) {
      if (!this.alive) return;
      const v = Math.round((running * i) / steps);
      totalV.textContent = fmtInk(v);
      if (inkSpan) inkSpan.textContent = fmtInk(base + v);
      if (i % 4 === 0) audio.sfx('coin', { volume: 0.3, pitch: 0.9 + i * 0.02 });
      await wait(30);
    }
    totalEl.querySelector('.v')?.classList.add('pop');
    this.inkEl?.classList.add('pop');
    audio.sfx('level_up', { volume: 0.6 });
    G.meta.flags.st_tally_shown = true;
    saveMeta();
    this.renderNotes();
  }

  private buildEchoes(): HTMLElement {
    const slots = echoSlots();
    const cands = echoCandidates();
    const meta = G.meta;
    meta.echoesChosen = meta.echoesChosen.filter((id) => cands.includes(id)).slice(0, slots);
    this.chips = h('div', { class: 'st-mg-chips' });
    const title = h('div', { class: 'st-mg-h' }, 'Ecos', h('small', null, slots > 0 ? `elige ${slots} para empezar el ciclo` : 'se abren tras el primer ciclo'));
    const paint = () => {
      if (!this.chips) return;
      this.chips.innerHTML = '';
      if (!cands.length) { this.chips.appendChild(h('div', { class: 'st-mg-none' }, 'Tu Códice histórico está vacío. Déjate golpear más.')); return; }
      const full = meta.echoesChosen.length >= slots;
      for (const id of cands) {
        const on = meta.echoesChosen.includes(id);
        const chip = h('button', { class: `st-mg-chip ${on ? 'on' : full ? 'off' : ''}` }, abilityName(id));
        chip.addEventListener('click', () => {
          if (on) meta.echoesChosen = meta.echoesChosen.filter((x) => x !== id);
          else if (!full) meta.echoesChosen.push(id);
          else return;
          audio.sfx(on ? 'ui_close' : 'copy_progress', { volume: 0.5 });
          saveMeta();
          paint();
        });
        this.chips.appendChild(chip);
      }
    };
    paint();
    return h('div', { class: 'st-mg-echoes' }, title, this.chips);
  }

  private renderNotes(): void {
    const list = this.list;
    if (!list) return;
    list.innerHTML = '';
    for (const m of MARGINS) {
      const rank = marginRank(m.id);
      const cost = marginNextCost(m.id);
      const val = rank < m.maxRank ? m.value[rank] : m.value[m.maxRank - 1];
      const shown = m.id === 'reliquia' ? RELIC_RARITY_LABEL[RELIC_RARITY_BY_RANK[Math.min(m.maxRank, rank + 1) - 1]] : String(val);
      const pips = h('div', { class: 'pips' }, ...Array.from({ length: m.maxRank }, (_, i) => h('span', { class: `pip ${i < rank ? 'on' : ''}` })));
      const note = h('div', { class: 'st-mg-note' },
        h('div', { class: 'g', html: glyph(m.glyph, 20) }),
        h('div', { class: 'n' }, m.name),
        pips,
        h('div', { class: 'ds' }, m.desc.replace('{v}', shown)),
        cost !== null
          ? h('button', { class: 'st-mg-buy', disabled: G.meta.ink < cost, html: `Anotar · ${cost} ${glyph('ink', 12, '#e9dcff')}`, onclick: () => this.buy(m.id, note) })
          : h('div', { class: 'st-mg-max' }, 'completo'),
        h('div', { class: 'nt' }, m.note));
      list.appendChild(note);
    }
  }

  private buy(id: string, note: HTMLElement): void {
    if (!buyMargin(id)) { audio.sfx('ui_error'); return; }
    audio.sfx('quill', { volume: 0.8 });
    audio.sfx('copy_acquired', { volume: 0.4 });
    note.classList.add('bought');
    const span = this.inkEl?.querySelector('span');
    if (span) span.textContent = fmtInk(G.meta.ink);
    this.inkEl?.classList.remove('pop'); void this.inkEl?.offsetWidth; this.inkEl?.classList.add('pop');
    setTimeout(() => { this.renderNotes(); this.refreshEchoes(); }, 250);
  }

  private refreshEchoes(): void {
    const box = this.chips?.parentElement;
    if (!box) return;
    const fresh = this.buildEchoes();
    box.replaceWith(fresh);
  }

  private async begin(): Promise<void> {
    audio.sfx('ui_confirm');
    this.eclipse && (this.eclipse.flare = 1);
    await startNextCycle();
  }

  update(): void { /* animated in lateUpdate (keeps breathing under modals) */ }

  lateUpdate(dt: number): void {
    this.t += dt;
    this.eclipse?.update(dt, this.t);
  }

  exit(): void {
    this.alive = false;
    this.root?.remove(); this.root = null;
    this.eclipse?.dispose(); this.eclipse = null;
    clearNarrator();
  }
}

registerScene('margins', () => new MarginsScene());
