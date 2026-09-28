/**
 * Engine: WebGL renderer, main loop, scene manager, time control (hitstop / slow-mo), post pipeline.
 *
 * Scenes implement GameScene and register with registerScene(id, factory). Navigate with engine.goto(id, params).
 * Each scene owns its THREE.Scene + camera; the engine renders it through the shared Pipeline unless the scene
 * overrides render() or is domOnly.
 */
import * as THREE from 'three';
import { Pipeline, type Quality } from '../render/pipeline';
import { input } from './input';
import { bus } from './events';
import { fadeTo, titleCard } from '../ui/transitions';
import { closeAllModals } from '../ui/widgets';

export interface GameScene {
  readonly id: string;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** Keep the instance alive between visits (enter() is called again on each visit). */
  persistent?: boolean;
  /** Pure DOM scene: skip WebGL rendering. */
  domOnly?: boolean;
  enter(params?: unknown): void | Promise<void>;
  exit(): void;
  /** Game-time update (scaled by timeScale; 0 while hitstop). */
  update(dt: number, time: number): void;
  /** Real-time update (UI, camera smoothing that should not freeze). */
  lateUpdate?(realDt: number): void;
  render?(dt: number): void;
  resize?(w: number, h: number): void;
  /** Called when leaving a persistent scene that will be reused. */
  suspend?(): void;
}

export type SceneFactory = () => GameScene;
const registry = new Map<string, SceneFactory>();

export function registerScene(id: string, factory: SceneFactory): void {
  registry.set(id, factory);
}
export function sceneExists(id: string): boolean { return registry.has(id); }

export interface GotoOpts {
  fade?: number;                              // seconds of fade-out/in (default 0.45)
  card?: { title: string; subtitle?: string; hold?: number }; // fragment title card on black
  instant?: boolean;
}

class Engine {
  renderer!: THREE.WebGLRenderer;
  pipeline!: Pipeline;
  canvas!: HTMLCanvasElement;
  current: GameScene | null = null;
  private instances = new Map<string, GameScene>();
  private last = 0;
  /** Game time (seconds, scaled). */
  time = 0;
  realTime = 0;
  /** Global slow-mo factor (1 = normal). */
  timeScale = 1;
  private slowmoT = 0; private slowmoDur = 0; private slowmoFrom = 1;
  private hitstopT = 0;
  paused = false;
  private switching = false;
  width = 1; height = 1;
  quality: Quality = 'alta';
  fps = 60;
  private fpsAcc = 0; private fpsFrames = 0;
  private emptyScene = new THREE.Scene();
  private emptyCam = new THREE.PerspectiveCamera();

  init(canvas: HTMLCanvasElement, quality: Quality = 'alta'): void {
    this.canvas = canvas;
    this.quality = quality;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = quality !== 'baja';
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor('#0d0714');
    this.renderer.info.autoReset = false;
    this.width = window.innerWidth; this.height = window.innerHeight;
    this.renderer.setPixelRatio(this.dpr());
    this.renderer.setSize(this.width, this.height, false);
    this.pipeline = new Pipeline(this.renderer, this.width, this.height);
    this.pipeline.setQuality(quality);
    window.addEventListener('resize', () => this.onResize());
    input.attach(canvas);
  }

  dpr(): number {
    const d = window.devicePixelRatio || 1;
    return this.quality === 'alta' ? Math.min(d, 2) : this.quality === 'media' ? Math.min(d, 1.5) : 1;
  }

  setQuality(q: Quality): void {
    this.quality = q;
    this.renderer.shadowMap.enabled = q !== 'baja';
    this.pipeline.setQuality(q);
    this.onResize();
  }

  private onResize(): void {
    this.width = window.innerWidth; this.height = window.innerHeight;
    this.renderer.setPixelRatio(this.dpr());
    this.renderer.setSize(this.width, this.height, false);
    this.pipeline.resize(this.width, this.height, this.dpr());
    if (this.current) {
      this.current.camera.aspect = this.width / this.height;
      this.current.camera.updateProjectionMatrix();
      this.current.resize?.(this.width, this.height);
    }
  }

  start(): void {
    this.last = performance.now();
    const loop = (now: number) => {
      requestAnimationFrame(loop);
      const realDt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      this.frame(realDt);
    };
    requestAnimationFrame(loop);
  }

  private frame(realDt: number): void {
    input.beginFrame();
    this.renderer.info.reset();
    this.realTime += realDt;
    this.fpsAcc += realDt; this.fpsFrames++;
    if (this.fpsAcc >= 0.5) {
      this.fps = this.fpsFrames / this.fpsAcc; this.fpsAcc = 0; this.fpsFrames = 0;
      this.autoQuality();
    }

    // slow-mo easing back to 1
    if (this.slowmoT > 0) {
      this.slowmoT = Math.max(0, this.slowmoT - realDt);
      const t = 1 - this.slowmoT / this.slowmoDur;
      this.timeScale = this.slowmoFrom + (1 - this.slowmoFrom) * (t * t);
    }
    let dt = realDt * this.timeScale;
    if (this.hitstopT > 0) { this.hitstopT -= realDt; dt = 0; }
    if (this.paused || this.switching) dt = 0;

    const sc = this.current;
    if (sc) {
      if (dt > 0 || !this.paused) {
        try { sc.update(dt, this.time); } catch (err) { console.error(`[engine] ${sc.id}.update`, err); }
      }
      this.time += dt;
      try { sc.lateUpdate?.(realDt); } catch (err) { console.error(`[engine] ${sc.id}.lateUpdate`, err); }
      if (!sc.domOnly) {
        if (sc.render) sc.render(realDt);
        else this.pipeline.render(sc.scene, sc.camera, realDt, this.realTime);
      } else {
        this.pipeline.render(this.emptyScene, this.emptyCam, realDt, this.realTime);
      }
    } else {
      this.pipeline.render(this.emptyScene, this.emptyCam, realDt, this.realTime);
    }
    input.endFrame();
  }

  private lowFpsTime = 0;
  /** Drops quality one step if the game runs below ~38 fps for a sustained period (never raises it automatically). */
  private autoQuality(): void {
    if (document.hidden || this.switching || !this.current || this.current.domOnly) { this.lowFpsTime = 0; return; }
    if (this.fps < 38) this.lowFpsTime += 0.5; else this.lowFpsTime = Math.max(0, this.lowFpsTime - 0.5);
    if (this.lowFpsTime >= 6 && this.quality !== 'baja') {
      this.lowFpsTime = 0;
      const next: Quality = this.quality === 'alta' ? 'media' : 'baja';
      this.setQuality(next);
      bus.emit('settings:change', { key: 'quality', value: next });
      bus.emit('toast', { text: `Calidad gráfica ajustada a <b>${next}</b> para mantener la fluidez.`, kind: 'info' });
    }
  }

  /** Freeze game time for `ms` (hit-pause). Stacks by max. */
  hitstop(ms: number): void { this.hitstopT = Math.max(this.hitstopT, ms / 1000); }

  /** Slow motion to `scale`, easing back to 1 over `seconds` (real time). */
  slowmo(scale = 0.25, seconds = 0.8): void {
    this.timeScale = scale; this.slowmoFrom = scale; this.slowmoDur = seconds; this.slowmoT = seconds;
  }

  get sceneId(): string | null { return this.current?.id ?? null; }

  async goto(id: string, params?: unknown, opts: GotoOpts = {}): Promise<void> {
    const factory = registry.get(id);
    if (!factory) { console.error(`[engine] unknown scene "${id}"`); return; }
    if (this.switching) { console.warn('[engine] goto while switching; queued', id); }
    this.switching = true;
    const fade = opts.instant ? 0 : opts.fade ?? 0.45;
    try {
      if (fade > 0 && this.current) await fadeTo(1, fade);
      // modals belong to the scene that opened them (e.g. an overworld encounter): dismiss them
      closeAllModals();
      if (this.current) {
        const prev = this.current;
        try {
          if (prev.persistent) prev.suspend?.();
          prev.exit();
        } catch (err) { console.error(`[engine] ${prev.id}.exit`, err); }
        bus.emit('scene:exit', { id: prev.id });
        if (!prev.persistent) this.instances.delete(prev.id);
      }
      this.pipeline.resetEffects();
      this.timeScale = 1; this.slowmoT = 0; this.hitstopT = 0; this.paused = false;
      input.enabled = true;
      if (opts.card) await titleCard(opts.card.title, opts.card.subtitle, opts.card.hold);
      let sc = this.instances.get(id);
      if (!sc) { sc = factory(); this.instances.set(id, sc); }
      sc.camera.aspect = this.width / this.height;
      sc.camera.updateProjectionMatrix();
      this.current = sc;
      await sc.enter(params);
      bus.emit('scene:enter', { id, params });
      if (fade > 0) await fadeTo(0, fade);
      else await fadeTo(0, 0);
    } catch (err) {
      console.error(`[engine] goto(${id}) failed`, err);
      await fadeTo(0, 0.2);
    } finally {
      this.switching = false;
    }
  }

  /** Project a world position to screen pixels using the current scene camera. */
  toScreen(pos: THREE.Vector3, camera?: THREE.Camera): { x: number; y: number; visible: boolean } {
    const cam = camera ?? this.current?.camera;
    if (!cam) return { x: 0, y: 0, visible: false };
    const v = pos.clone().project(cam);
    return { x: (v.x * 0.5 + 0.5) * this.width, y: (-v.y * 0.5 + 0.5) * this.height, visible: v.z < 1 && v.z > -1 };
  }
}

export const engine = new Engine();
