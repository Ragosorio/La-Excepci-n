/**
 * Prologue scene ('prologue') — Fragmento "Antes" and the cycle bookends.
 *   params.mode: 'boy' (the forest, the shadow, the light) · 'shadow' (end of cycle: you are the shadow)
 *                'fall' (Aurel's punch → crash in Valdoria) · 'revive' ("Excepto que no.") · 'duel' (debug → Concordia duel)
 * Each visit builds its own set and disposes it on exit.
 */
import './prologue.css';
import * as THREE from 'three';
import { engine, registerScene, type GameScene } from '../../core/engine';
import { G } from '../../core/state';
import { input } from '../../core/input';
import { Sky, type SkyOverride } from '../../render/sky';
import { Fx } from '../../render/fx';
import { CameraRig } from '../../render/camera';
import { blockMenu } from '../../ui/menu';
import { clearNarrator } from '../../ui/narrator';
import { dialogue } from '../../ui/dialogue';
import { audio } from '../../audio';
import { Director, ShotCam, Timeline } from './director';
import type { Forest } from './forest';
import type { Dog, DogBrain } from './dog';
import type { Rain } from './rain';
import type { CharacterRig } from '../../characters/rig';
import { runBoy } from './boy';
import { runShadow } from './shadowEnd';
import { runFall, runRevive } from './fall';
import { startAurelDuel } from '../../systems/story/acts';

// ───────────────────────────── atmosphere ─────────────────────────────

interface MoodDef { top: string; mid: string; horizon: string; sun: string; sunI: number; amb: string; ambI: number; fog: string; stars: number; near: number; far: number; mist: string; mistD: number }
const MOODS: Record<'overcast' | 'night' | 'rain', MoodDef> = {
  overcast: { top: '#5b5f72', mid: '#7f8394', horizon: '#a49ea2', sun: '#b8b0b8', sunI: 0.65, amb: '#8a8ea0', ambI: 0.62, fog: '#858794', stars: 0, near: 9, far: 95, mist: '#9a9ca8', mistD: 1.15 },
  night: { top: '#030208', mid: '#090615', horizon: '#17112a', sun: '#5a64b0', sunI: 0.22, amb: '#2a2750', ambI: 0.42, fog: '#0c0a18', stars: 0.85, near: 4, far: 52, mist: '#2c2848', mistD: 1.35 },
  rain: { top: '#4b5264', mid: '#697080', horizon: '#8a909c', sun: '#aab2c0', sunI: 0.55, amb: '#7c8294', ambI: 0.7, fog: '#6c727e', stars: 0, near: 7, far: 70, mist: '#858b98', mistD: 1.0 },
};

export interface Atmos { time: number; overcast: number; night: number; rain: number; near: number; far: number; mist: string; mistD: number }

const cA = new THREE.Color(), cB = new THREE.Color(), cX = new THREE.Color();

// ───────────────────────────── shared context ─────────────────────────────

export interface PCtx {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  director: Director;
  tl: Timeline;
  shot: ShotCam;
  rig: CameraRig;
  camMode: 'rig' | 'shot';
  sky: Sky;
  fx: Fx;
  atmos: Atmos;
  params: Record<string, unknown>;
  hooks: Set<(dt: number, t: number) => void>;
  dom: HTMLElement[];
  block(on: boolean): void;
  forest?: Forest;
  boy?: CharacterRig;
  dog?: Dog;
  dogBrain?: DogBrain;
  shadow?: CharacterRig;
  rain?: Rain;
  extra: Array<{ dispose(): void }>;
  alive: boolean;
  /** Seconds left before the follow camera re-aligns behind the walker after a manual drag. */
  camManualT: number;
}

class PrologueScene implements GameScene {
  readonly id = 'prologue';
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1600);
  private c!: PCtx;
  private menuBlocked = false;
  private t = 0;

  enter(params?: unknown): void {
    clearNarrator(); // queued gameplay lines must not spill into the cinematic
    const p = (params ?? {}) as Record<string, unknown>;
    const mode = String(p.mode ?? 'boy');
    const director = new Director();
    const sky = new Sky(this.scene, { fogNear: 10, fogFar: 120, clouds: 12, cloudHeight: 95, cloudSpread: 340, shadowSize: 40 });
    const fx = new Fx(this.scene);
    const rig = new CameraRig(this.camera);
    this.c = {
      scene: this.scene, camera: this.camera, director, tl: director.timeline(), shot: new ShotCam(this.camera), rig, camMode: 'shot',
      sky, fx, params: p, hooks: new Set(), dom: [], extra: [], alive: true, camManualT: 0,
      atmos: { time: 0.2, overcast: 0, night: 0, rain: 0, near: 10, far: 120, mist: '#9aa3c8', mistD: 1 },
      block: (on: boolean) => { if (on !== this.menuBlocked) { blockMenu(on); this.menuBlocked = on; } },
    };
    engine.pipeline.setGrade({ saturation: 1.08, vignette: 0.7, grain: 0.045, contrast: 1.05 });
    audio.setIntensity(0);
    engine.pipeline.setBloom(0.6, 0.5, 0.8);
    const run = mode === 'shadow' ? runShadow : mode === 'fall' ? runFall : mode === 'revive' ? runRevive : mode === 'duel' ? null : runBoy;
    if (!run) { setTimeout(() => void startAurelDuel(), 50); return; }
    Director.run(() => run(this.c), `mode ${mode}`);
  }

  /** Blends the three moods over the time-of-day sky (single Sky override). */
  private applyAtmos(): void {
    const c = this.c, a = c.atmos;
    c.sky.setTime(a.time);
    const wo = a.overcast * (1 - a.night) * (1 - a.rain), wn = a.night * (1 - a.rain), wr = a.rain;
    const w = 1 - (1 - a.overcast) * (1 - a.night) * (1 - a.rain);
    if (w < 0.001) { c.sky.override = null; }
    else {
      const mix = (key: 'top' | 'mid' | 'horizon' | 'sun' | 'amb' | 'fog'): string => {
        cX.setRGB(0, 0, 0);
        cX.add(cA.set(MOODS.overcast[key]).multiplyScalar(wo));
        cX.add(cB.set(MOODS.night[key]).multiplyScalar(wn));
        cX.add(cA.set(MOODS.rain[key]).multiplyScalar(wr));
        cX.multiplyScalar(1 / w);
        return '#' + cX.getHexString();
      };
      const num = (key: 'sunI' | 'ambI' | 'stars') => (MOODS.overcast[key] * wo + MOODS.night[key] * wn + MOODS.rain[key] * wr) / w;
      const o: SkyOverride = { top: mix('top'), mid: mix('mid'), horizon: mix('horizon'), sun: mix('sun'), amb: mix('amb'), fog: mix('fog'), sunI: num('sunI'), ambI: num('ambI'), stars: num('stars'), weight: w };
      c.sky.override = o;
      c.sky.setTime(a.time);
    }
    // fog distances and mist layers
    const lerpN = (base: number, key: 'near' | 'far') => base * (1 - w) + (MOODS.overcast[key] * wo + MOODS.night[key] * wn + MOODS.rain[key] * wr);
    c.sky.fog.near = lerpN(a.near, 'near');
    c.sky.fog.far = lerpN(a.far, 'far');
    if (c.forest) {
      cX.set(a.mist).multiplyScalar(1 - w);
      cX.add(cA.set(MOODS.overcast.mist).multiplyScalar(wo)).add(cA.set(MOODS.night.mist).multiplyScalar(wn)).add(cA.set(MOODS.rain.mist).multiplyScalar(wr));
      const d = a.mistD * (1 - w) + MOODS.overcast.mistD * wo + MOODS.night.mistD * wn + MOODS.rain.mistD * wr;
      c.forest.setMist(cX, d);
    }
  }

  update(dt: number, time: number): void {
    const c = this.c;
    if (!c) return;
    this.t += dt;
    c.director.update(dt);
    for (const h of c.hooks) { try { h(dt, this.t); } catch (err) { console.warn('[prologue] hook', err); } }
    this.applyAtmos();
    if (c.camMode === 'rig') c.rig.update(dt); else c.shot.apply(dt);
    if (c.forest) c.forest.update(dt, time, this.camera);
    if (c.rain) c.rain.update(dt, this.camera.position);
    c.sky.shadowTarget.copy(c.boy?.root.position ?? c.forest?.logPos ?? new THREE.Vector3());
    c.sky.update(dt, this.camera, time);
    c.fx.update(dt);
  }

  lateUpdate(): void {
    // the right mouse button drags the follow camera (walking sections)
    const c = this.c;
    if (!c || c.camMode !== 'rig') return;
    if (input.mouse.buttons[2]) { c.rig.yaw -= input.mouse.dx * 0.005; c.camManualT = 2.5; }
  }

  exit(): void {
    const c = this.c;
    if (!c) return;
    c.alive = false;
    c.director.killAll();
    c.block(false);
    for (const el of c.dom) el.remove();
    c.dom = [];
    try { dialogue.close(); } catch { /* ignore */ }
    clearNarrator();
    audio.ambience('rain', false); audio.ambience('rain_heavy', false); audio.ambience('forest_dawn', false);
    audio.ambience('night', false); audio.ambience('wind', false); audio.ambience('void', false);
    for (const d of c.extra) { try { d.dispose(); } catch { /* ignore */ } }
    c.boy?.dispose(); c.shadow?.dispose(); c.dog?.dispose(); c.rain?.dispose(); c.forest?.dispose();
    c.fx.dispose(); c.sky.dispose();
    this.scene.clear();
    input.enabled = true;
    if (G.meta) G.meta.lastPlayAt = Date.now();
  }
}

registerScene('prologue', () => new PrologueScene());
