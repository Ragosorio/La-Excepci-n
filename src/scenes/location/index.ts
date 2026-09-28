/**
 * Location scene ('location', params { id }): a living 3D diorama of the place + its card and action menu.
 * Emits `location:enter` { id, special } on every visit (first visit marks it visited).
 */
import * as THREE from 'three';
import { engine, registerScene, type GameScene } from '../../core/engine';
import { G, newRun } from '../../core/state';
import { bus } from '../../core/events';
import { track } from '../../core/tracker';
import { saveRun } from '../../core/save';
import { LOCATIONS } from '../../data/world';
import { h, layer } from '../../ui/dom';
import { narrate } from '../../ui/narrator';
import { banner } from '../../ui/toasts';
import { dialogue } from '../../ui/dialogue';
import { audio, type Region } from '../../audio';
import { W } from '../../systems/world/state';
import { LocationDiorama } from './diorama';
import { actionsFor, craterMemory, type LocAction, type LocCtx } from './actions';
import { ActionMenu, LocationCard, ResBar, zoneTitle } from './ui';
import { ACTION_ICON } from '../overworld/icons';
import '../overworld/overworld.css';
import './location.css';

class LocationScene implements GameScene {
  readonly id = 'location';
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(42, 1, 0.3, 2000);
  private dio: LocationDiorama | null = null;
  private dom: HTMLElement | null = null;
  private card: LocationCard | null = null;
  private menu: ActionMenu | null = null;
  private res: ResBar | null = null;
  private ctx: LocCtx | null = null;
  private orbit = 0;
  private busy = false;
  private shakeT = 0;
  private offKey: (() => void) | null = null;
  private leaving = false;
  private t = 0;

  enter(params?: unknown): void {
    if (!G.hasRun) newRun((Math.random() * 2 ** 31) >>> 0);
    const p = (params ?? {}) as { id?: string; conquered?: boolean };
    const id = p.id && LOCATIONS[p.id] ? p.id : G.run.player.location && LOCATIONS[G.run.player.location] ? G.run.player.location : 'puerto_fortuna';
    const def = LOCATIONS[id];
    const st = G.run.locations[id];
    this.leaving = false; this.busy = false;
    this.dio = new LocationDiorama(def);
    this.scene = this.dio.scene;
    this.orbit = -0.35;
    this.t = 0;
    G.run.player.location = id;
    W().lastLocation = id;
    const first = !st.visited;
    st.visited = true;
    st.lastVisit = G.run.luna;
    if (first) track('locations_visited');

    this.ctx = {
      id, def, st, dio: this.dio,
      refresh: () => this.refresh(),
      leave: (scene = 'overworld', prm?: unknown) => this.leave(scene, prm),
      shake: (n) => { this.shakeT = Math.max(this.shakeT, n); },
      busy: (on) => { this.busy = on; },
    };
    // DOM
    this.dom = h('div', { class: 'loc-root' });
    layer('hud').appendChild(this.dom);
    this.res = new ResBar();
    this.card = new LocationCard(this.ctx);
    this.menu = new ActionMenu(this.ctx, () => actionsFor(this.ctx!), (a) => void this.run(a));
    const back = h('button', { class: 'loc-back', onclick: () => { audio.sfx('ui_close'); this.leave('overworld'); } },
      h('span', { class: 'loc-back-ic', html: ACTION_ICON.leave }), h('span', null, 'Volver al mapa'), h('span', { class: 'lx-kbd' }, 'Esc'));
    this.dom.append(this.res.el, this.card.el, this.menu.el, back, zoneTitle(this.ctx));
    // capture phase so Esc leaves the place instead of opening the pause menu
    const onKey = (e: KeyboardEvent) => {
      if (engine.sceneId !== 'location' || this.busy || engine.paused || dialogue.open || document.querySelector('.lx-modal-back, .lx-loot, .st-pageback')) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if (e.code === 'Escape' || e.code === 'Backspace') { e.preventDefault(); this.leave('overworld'); }
    };
    window.addEventListener('keydown', onKey, true);
    this.offKey = () => window.removeEventListener('keydown', onKey, true);
    // look & sound
    engine.pipeline.setBloom(0.7, 0.5, 0.82);
    engine.pipeline.setGrade({ saturation: 1.16, contrast: 1.05, vignette: 0.62, grain: 0.03 });
    audio.music('location', { region: def.continent as Region });
    if (def.services.includes('casino')) audio.ambience('casino', true, 0.4);
    else if (def.services.includes('taberna') && def.kind !== 'ruina') audio.ambience('crowd', true, 0.25);
    if (def.continent === 'islas' || def.services.includes('puerto')) audio.ambience('sea', true, 0.35);
    if (def.id === 'forja_primigenia' || def.id === 'kharaz_dum') audio.ambience('forge', true, 0.4);
    bus.emit('location:enter', { id, special: def.special });
    // special beats
    if (W().respawn) {
      setTimeout(() => { if (engine.sceneId === 'location') this.leave('overworld'); }, 1400);
    } else if (p.conquered && st.control === 'excepcion') {
      setTimeout(() => {
        audio.stinger('corruption_complete');
        engine.pipeline.flash('#9b5cff', 0.5, 1);
        this.dio?.fx.emit('arcane', this.dio.focus, { count: 90, scale: 3.5 });
        void banner('¡CONQUISTADO!', `${def.name} ahora lleva el eclipse`, { kind: 'excepcion', duration: 2.4 });
      }, 700);
    } else if (def.special === 'crater') {
      if (first || G.run.luna < 1) setTimeout(() => { if (this.ctx && engine.sceneId === 'location') void craterMemory(this.ctx, true); }, 4200);
      setTimeout(() => void narrate(first || G.run.luna < 1
        ? { third: 'El hoyo todavía estaba tibio. Aquí murió {name}. Aquí dejó de importarle.', first: 'El hoyo todavía estaba tibio. Aquí morí. Aquí dejó de importarme.' }
        : { third: 'El cráter. Siempre vuelve aquí, aunque diga que no.', first: 'El cráter. Siempre vuelvo aquí, aunque diga que no.' }, { position: 'bottom' }), 900);
    } else if (first && def.kind === 'ruina') {
      audio.stinger('discovery');
    }
    saveRun();
  }

  private async run(a: LocAction): Promise<void> {
    if (this.busy || !this.ctx) return;
    this.busy = true;
    this.menu?.el.classList.add('busy');
    try { await a.run(this.ctx); } catch (err) { console.error('[location] action failed', a.id, err); }
    finally {
      if (engine.sceneId === 'location' && !this.leaving) {
        this.busy = false;
        this.menu?.el.classList.remove('busy');
        this.refresh();
      }
    }
  }

  private refresh(): void {
    this.card?.render();
    this.menu?.render();
    this.res?.refresh();
  }

  private leave(scene: string, params?: unknown): void {
    if (this.leaving) return;
    this.leaving = true;
    this.busy = true;
    if (scene === 'overworld') G.run.player.location = null;
    void engine.goto(scene, params ?? (scene === 'overworld' ? { focus: this.ctx?.id } : undefined), { fade: 0.5 });
  }

  exit(): void {
    this.offKey?.(); this.offKey = null;
    this.res?.dispose(); this.res = null;
    this.dom?.remove(); this.dom = null;
    this.card = null; this.menu = null;
    for (const a of ['casino', 'crowd', 'sea', 'forge'] as const) audio.ambience(a, false);
    this.dio?.dispose(); this.dio = null;
    this.scene = new THREE.Scene();
    this.ctx = null;
  }

  update(dt: number): void {
    if (!this.dio) return;
    this.dio.update(dt, this.camera);
  }

  lateUpdate(realDt: number): void {
    if (!this.dio) return;
    this.t += realDt;
    this.orbit += realDt * 0.045;
    const f = this.dio.focus;
    const R = 46, H = 18;
    const x = f.x + Math.sin(this.orbit) * R, z = f.z + Math.cos(this.orbit) * R;
    const y = Math.max(f.y + H, this.dio.groundY(x, z) + 4);
    this.camera.position.set(x, y + Math.sin(this.t * 0.4) * 0.4, z);
    if (this.shakeT > 0) {
      this.shakeT = Math.max(0, this.shakeT - realDt * 1.4);
      const s = this.shakeT * this.shakeT * 0.8 * (G.meta?.settings.shake ?? 1);
      this.camera.position.x += Math.sin(this.t * 41) * s; this.camera.position.y += Math.sin(this.t * 37 + 1) * s;
    }
    this.camera.lookAt(f.x, f.y - 0.5, f.z);
  }
}

registerScene('location', () => new LocationScene());
