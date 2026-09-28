/**
 * Title — a dark cinematic menu: a 3D eclipse with a living corona, drifting ash and light, the logo and the menu.
 * Per-cycle variations: cycle 2+ shows "Siempre estuve viéndote." faintly under the logo; cycle 3+ an eye opens
 * inside the eclipse and follows the mouse. First launch: "Se recomienda jugar con audífonos."
 */
import './title.css';
import * as THREE from 'three';
import { engine, registerScene, type GameScene } from '../../core/engine';
import { G, type RunState } from '../../core/state';
import { hasRun, loadRun, saveMeta } from '../../core/save';
import { input } from '../../core/input';
import { h, layer } from '../../ui/dom';
import { confirmModal } from '../../ui/widgets';
import { openMenu } from '../../ui/menu';
import { audio } from '../../audio';
import { SIEMPRE, FRAGMENTS } from '../../data/story';
import { Eclipse } from './eclipse';
import { resolveLogo, fallbackLogo, creditsOverlay } from '../../systems/story/ui';
import { openBook, pageCompletion } from '../../systems/story/pages';
import { openAchievements, achievementCompletion } from '../../systems/story/achievements';
import { startAurelDuel } from '../../systems/story/acts';
import { startFirstRun } from '../../systems/story/cycle';
import { wipedMemory, remember } from '../../systems/story/memory';
import { glyph } from '../../systems/story/glyphs';

interface MenuItem { id: string; label: string; sub?: string; action: () => void | Promise<void>; disabled?: boolean }

function peekRun(): { name: string; fragment: string } | null {
  try {
    const raw = localStorage.getItem('lx.run');
    if (!raw) return null;
    const r = JSON.parse(raw) as Partial<RunState>;
    return { name: r.player?.name ?? 'Elias Veyr', fragment: (r.fragment as string) ?? 'antes' };
  } catch { return null; }
}

class TitleScene implements GameScene {
  readonly id = 'title';
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(40, 1, 0.1, 1200);
  private eclipse: Eclipse | null = null;
  private root: HTMLElement | null = null;
  private items: HTMLElement[] = [];
  private menu: MenuItem[] = [];
  private focus = 0;
  private busy = false;
  private t = 0;
  private cam = new THREE.Vector2();
  private onKey = (e: KeyboardEvent) => this.key(e);
  private cycle = 1;
  private timers: number[] = [];

  enter(): void {
    this.cycle = (G.meta?.cyclesCompleted ?? 0) + 1;
    this.scene.background = new THREE.Color('#050309');
    this.eclipse = new Eclipse({ radius: 2.6, stars: true, ash: true, motes: true, eye: this.cycle >= 3 });
    this.scene.add(this.eclipse.group);
    this.layout();
    engine.pipeline.setBloom(0.7, 0.3, 0.7);
    engine.pipeline.setGrade({ vignette: 0.85, grain: 0.05, saturation: 1.05, contrast: 1.08 });
    audio.setIntensity(0);
    audio.music('title');
    if (this.cycle >= 3) this.timers.push(window.setTimeout(() => this.eclipse?.openEye(1), 2600));
    this.buildUI();
    window.addEventListener('keydown', this.onKey);
    if (G.meta) { remember({ sessions: G.meta.sessions, cycles: G.meta.cyclesCompleted }); }
  }

  private layout(): void {
    const aspect = engine.width / Math.max(1, engine.height);
    if (!this.eclipse) return;
    if (aspect < 1) { this.eclipse.group.position.set(0, 2.6, 0); this.eclipse.group.scale.setScalar(0.8); }
    else { this.eclipse.group.position.set(Math.min(5.6, 3.1 * aspect), 0.35, 0); this.eclipse.group.scale.setScalar(1); }
  }

  resize(): void { this.layout(); }

  private buildMenu(): MenuItem[] {
    const run = hasRun() ? peekRun() : null;
    const fragTitle = run ? (FRAGMENTS as Record<string, { title: string }>)[run.fragment]?.title ?? '' : '';
    const items: MenuItem[] = [];
    if (run) items.push({ id: 'continue', label: 'Continuar', sub: `${run.name}${fragTitle ? ' · ' + fragTitle : ''}`, action: () => this.continueRun() });
    items.push({ id: 'new', label: 'Nueva partida', action: () => this.newGame() });
    const pc = pageCompletion();
    items.push({ id: 'book', label: 'Libro', sub: pc.found ? `${pc.found}/${pc.total}` : undefined, action: () => openBook() });
    const ac = achievementCompletion();
    items.push({ id: 'ach', label: 'Hazañas', sub: ac.got ? `${ac.got}/${ac.total}` : undefined, action: () => openAchievements() });
    items.push({ id: 'settings', label: 'Ajustes', action: () => openMenu() });
    items.push({ id: 'credits', label: 'Créditos', action: () => creditsOverlay() });
    return items;
  }

  private buildUI(): void {
    const logo = h('div', { html: fallbackLogo() });
    void resolveLogo().then((html) => { logo.innerHTML = html; });
    const tag = this.cycle >= 2
      ? h('div', { class: 'st-ttl-tag siempre' }, SIEMPRE)
      : h('div', { class: 'st-ttl-tag' }, 'Eres el villano. Todo lo que sobrevives, lo dominas.');
    this.menu = this.buildMenu();
    const menuEl = h('div', { class: 'st-ttl-menu' });
    this.items = this.menu.map((m, i) => {
      const el = h('button', { class: `st-ttl-item ${m.disabled ? 'disabled' : ''}` }, h('span', null, m.label), m.sub ? h('span', { class: 'sub' }, m.sub) : null);
      el.addEventListener('mouseenter', () => { if (this.focus !== i) { this.focus = i; this.paintFocus(); audio.sfx('ui_hover', { volume: 0.3 }); } });
      el.addEventListener('click', () => this.activate(i));
      menuEl.appendChild(el);
      return el;
    });
    const col = h('div', { class: 'st-ttl-col' }, logo, tag, menuEl);
    const wiped = G.meta ? wipedMemory(G.meta.cyclesCompleted) : 0;
    if (wiped) {
      const v = h('div', { class: 'st-ttl-voice' }, 'Borraste todo. Yo no.');
      col.appendChild(v);
      this.timers.push(window.setTimeout(() => v.classList.add('in'), 5200));
    }
    col.appendChild(h('div', { class: 'st-ttl-hintkeys' }, '↑ ↓ · Enter'));
    this.root = h('div', { class: 'st-ttl' }, col,
      this.cycle >= 2 ? h('div', { class: 'st-ttl-foot' }, `Ciclo ${G.meta?.currentCycle ?? this.cycle}`) : null,
      h('div', { class: 'st-ttl-ver' }, 'v0.1'));
    if (G.meta && !G.meta.flags.st_headphones) {
      const ph = h('div', { class: 'st-ttl-phones', html: `${glyph('phones', 16)}<span>Se recomienda jugar con audífonos.</span>` });
      this.root.appendChild(ph);
      this.timers.push(window.setTimeout(() => ph.classList.add('in'), 1400));
      this.timers.push(window.setTimeout(() => ph.classList.remove('in'), 7600));
      G.meta.flags.st_headphones = true;
      saveMeta();
    }
    layer('panel').appendChild(this.root);
    requestAnimationFrame(() => this.root?.classList.add('in'));
    this.focus = 0;
    this.paintFocus();
  }

  private paintFocus(): void { this.items.forEach((el, i) => el.classList.toggle('focus', i === this.focus)); }

  private key(e: KeyboardEvent): void {
    if (this.busy || document.querySelector('.lx-modal-back, .st-overlay, .st-pageback')) return;
    if (e.code === 'ArrowDown' || e.code === 'KeyS') { this.focus = (this.focus + 1) % this.items.length; this.paintFocus(); audio.sfx('ui_hover', { volume: 0.3 }); e.preventDefault(); }
    else if (e.code === 'ArrowUp' || e.code === 'KeyW') { this.focus = (this.focus - 1 + this.items.length) % this.items.length; this.paintFocus(); audio.sfx('ui_hover', { volume: 0.3 }); e.preventDefault(); }
    else if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); this.activate(this.focus); }
  }

  private activate(i: number): void {
    const m = this.menu[i];
    if (!m || m.disabled || this.busy) return;
    audio.sfx('ui_confirm');
    if (m.id === 'new' || m.id === 'continue') this.eclipse && (this.eclipse.flare = 1);
    void Promise.resolve(m.action()).catch((err) => console.error('[title]', err));
  }

  private async continueRun(): Promise<void> {
    this.busy = true;
    try {
      const run = loadRun();
      if (!run) { this.busy = false; return; }
      const f = run.fragment;
      if (f === 'antes') await engine.goto('prologue', { mode: 'boy' }, { fade: 1 });
      else if (f === 'nombre') await startAurelDuel({ card: false });
      else if (f === 'el') await engine.goto('ending', {}, { fade: 1 });
      else await engine.goto('overworld', { resume: true }, { fade: 1 });
    } finally { this.busy = false; }
  }

  private async newGame(): Promise<void> {
    if (hasRun()) {
      const ok = await confirmModal('Nueva partida', 'El ciclo en curso se perderá. Lo que ya está en los márgenes, no.', 'Empezar de nuevo', 'Volver', true);
      if (!ok) return;
    }
    this.busy = true;
    try {
      if ((G.meta?.cyclesCompleted ?? 0) > 0) await engine.goto('margins', { fromTitle: true }, { fade: 1 });
      else await startFirstRun();
    } finally { this.busy = false; }
  }

  update(): void { /* animation runs in lateUpdate so it keeps breathing under the settings menu */ }

  lateUpdate(dt: number): void {
    this.t += dt;
    const e = this.eclipse;
    if (!e) return;
    e.update(dt, this.t);
    // gentle parallax with the mouse
    const k = 1 - Math.exp(-2 * dt);
    this.cam.x += (input.mouse.nx * 0.55 - this.cam.x) * k;
    this.cam.y += (input.mouse.ny * 0.35 - this.cam.y) * k;
    this.camera.position.set(this.cam.x, 0.4 + this.cam.y, 16);
    this.camera.lookAt(0, 0.35, 0);
    // the eye follows the cursor (in the eclipse's screen space)
    const sp = engine.toScreen(e.group.position.clone(), this.camera);
    const dx = (input.mouse.x - sp.x) / (engine.height * 0.35);
    const dy = -(input.mouse.y - sp.y) / (engine.height * 0.35);
    e.lookAt(dx, dy);
    e.setIntensity(1 + Math.sin(this.t * 0.7) * 0.06 + e.flare * 0.5);
  }

  exit(): void {
    window.removeEventListener('keydown', this.onKey);
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
    this.root?.remove(); this.root = null;
    this.eclipse?.dispose(); this.eclipse = null;
    this.items = [];
  }
}

registerScene('title', () => new TitleScene());
