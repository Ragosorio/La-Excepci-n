/**
 * Ending ('ending') — Fragmento "Él" (GDD §2.3), and the Sello bad ending (params.sello).
 * Ruined Concordia; old Aurel kneeling, Bruma calm beside him. The Book: "No existe el tiempo." — cost: your name.
 * The UI fails; the narrator becomes "I". Everything at once. "¿Sabes cómo supe que lo había logrado, pequeño?"
 * The camera turns until Elias looks at you. "Te vi…" (from what the game watched). "Vuelve al principio."
 */
import './ending.css';
import * as THREE from 'three';
import { engine, registerScene, type GameScene } from '../../core/engine';
import { G, refreshTitle } from '../../core/state';
import { saveRun } from '../../core/save';
import { track } from '../../core/tracker';
import { input } from '../../core/input';
import { Sky } from '../../render/sky';
import { Fx } from '../../render/fx';
import { h, layer, wait } from '../../ui/dom';
import { dialogue } from '../../ui/dialogue';
import { narrate, clearNarrator } from '../../ui/narrator';
import { blockMenu } from '../../ui/menu';
import { audio } from '../../audio';
import { ENDING } from '../../data/story';
import { openRealityBook } from '../../systems/progression/reality';
import { blackout, centerLine, rewriteGlitch, fadeOutEl, holdToSkip } from '../../systems/story/ui';
import { unlockAchievement } from '../../systems/story/achievements';
import { storyBeat } from '../../systems/story/aurel';
import { endCycle } from '../../systems/story/cycle';
import { lineFor } from '../../systems/story/narration';
import { st } from '../../systems/story/state';
import { Director, ShotCam, ease, type Timeline } from '../prologue/director';
import { EndingSet } from './set';
import { buildWatched, buildMontage } from './watched';

class EndingScene implements GameScene {
  readonly id = 'ending';
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(46, 1, 0.1, 1600);
  private director = new Director();
  private tl!: Timeline;
  private shot = new ShotCam(this.camera);
  private sky: Sky | null = null;
  private fx: Fx | null = null;
  private set: EndingSet | null = null;
  private dom: HTMLElement[] = [];
  private hooks = new Set<(dt: number) => void>();
  private menuBlocked = false;
  private alive = true;
  private skyFlicker = 0;
  private params: Record<string, unknown> = {};
  private disposers: Array<() => void> = [];

  private block(on: boolean): void { if (on !== this.menuBlocked) { blockMenu(on); this.menuBlocked = on; } }

  enter(params?: unknown): void {
    clearNarrator(); // queued gameplay lines must not spill into the cinematic
    const p = (params ?? {}) as Record<string, unknown>;
    this.params = p;
    this.alive = true;
    this.tl = this.director.timeline();
    this.block(true);
    input.enabled = false;
    audio.setIntensity(0);
    engine.pipeline.setGrade({ saturation: 1.02, vignette: 0.85, grain: 0.05, contrast: 1.08 });
    if (p.sello) { Director.run(() => this.runSello(), 'sello'); return; }
    this.sky = new Sky(this.scene, { fogNear: 30, fogFar: 170, clouds: 6, cloudHeight: 70, shadowSize: 30 });
    this.sky.override = { top: '#05030a', mid: '#130a22', horizon: '#34184c', sun: '#b9a2ff', sunI: 0.75, amb: '#4a3a6a', ambI: 0.7, fog: '#120a1c', stars: 0.55, weight: 1 };
    this.sky.setTime(0.02);
    this.fx = new Fx(this.scene);
    this.set = new EndingSet(this.scene);
    engine.pipeline.setBloom(0.8, 0.5, 0.72);
    Director.run(() => this.runEl(), 'el');
  }

  // ───────────────────────────── Él ─────────────────────────────

  private async runEl(): Promise<void> {
    const tl = this.tl, set = this.set!, fx = this.fx!;
    const BEATS = ['open', 'walk', 'book', 'rewrite', 'montage', 'question', 'turn', 'watched', 'end'] as const;
    const at = (BEATS as readonly string[]).includes(String(this.params.at)) ? String(this.params.at) : 'open';
    const play = (b: typeof BEATS[number]) => BEATS.indexOf(b) >= BEATS.indexOf(at as typeof BEATS[number]);
    const black = blackout();
    black.el.style.opacity = '1';
    this.dom.push(black.el);
    if (G.run) G.run.fragment = 'sobrevivio';
    audio.music('void');
    audio.ambience('void', true, 0.5);
    engine.pipeline.setLetterbox(1);
    const A = set.aurelPos, E0 = set.eliasStart;
    const stopAt = A.clone().add(new THREE.Vector3(0, 0, 2.3));
    let walkSpeed = 0;
    this.hooks.add((dt) => set.elias.update(dt, { speed: walkSpeed }));
    const eyeOf = new THREE.Vector3();
    this.hooks.add(() => { set.elias.head.g.getWorldPosition(eyeOf); set.dog.lookTarget = eyeOf; });
    if (!play('walk')) { set.elias.root.position.copy(stopAt); set.aurel.setExpression('neutral'); }

    // Concordia in ruins; Aurel kneels; Bruma beside him
    if (play('open')) {
      this.shot.set(new THREE.Vector3(9, 5.5, 16), A.clone().add(new THREE.Vector3(0, 1, 2)), 42);
      this.shot.move(tl, new THREE.Vector3(5, 3.2, 12.5), A.clone().add(new THREE.Vector3(0, 0.9, 2.5)), 16, ease.sine).catch(() => undefined);
      await tl.hold(black.to(0, 3));
      for (const l of ENDING.opening) await tl.hold(narrate(l, { position: 'bottom', person: 'third', hold: 3 }));
    } else {
      this.shot.set(new THREE.Vector3(-3.8, 1.9, 5.2), A.clone().add(new THREE.Vector3(0, 1.1, 1.2)), 40);
      await tl.hold(black.to(0, 0.8));
    }

    // Elias walks to the kneeling hero
    if (play('walk')) {
      this.shot.move(tl, new THREE.Vector3(-3.8, 1.9, 5.2), A.clone().add(new THREE.Vector3(0, 1.1, 1.2)), 4.2, ease.inOut, 40).catch(() => undefined);
      walkSpeed = 1.3;
      await tl.tween(3.6, (k) => { set.elias.root.position.lerpVectors(E0, stopAt, k); }, ease.linear);
      walkSpeed = 0;
      set.aurel.setExpression('neutral');
      set.dog.wag = 0.6;
      await tl.wait(1.2);
    }

    // the Book: one rewrite possible. The cost: your name.
    if (play('book')) await this.theBook(tl);
    tl.guard();
    if (G.run) { G.run.player.nameSacrificed = true; refreshTitle(); }
    storyBeat('name_sacrificed');
    saveRun(true);

    // the UI fails; the narrator becomes "I"
    if (play('rewrite')) {
      const root = document.getElementById('ui-root');
      root?.classList.add('st-glitch-ui');
      setTimeout(() => root?.classList.remove('st-glitch-ui'), 900);
      engine.pipeline.chromaticPulse(2.4, 1.2);
      engine.pipeline.impact(2, 0);
      audio.sfx('glitch', { volume: 1 });
      audio.sfx('eclipse', { volume: 0.8 });
      set.eclipse.flare = 1;
      const rw = await tl.hold(rewriteGlitch(ENDING.rewrite, { hold: 2.6 }));
      if (G.run) G.run.fragment = 'el';
      await tl.hold(fadeOutEl(rw, 1400));
    }
    if (G.run) G.run.fragment = 'el';

    // repeat cycles: from here on, holding Space/Esc jumps to the last line
    if ((G.meta?.cyclesCompleted ?? 0) >= 1 || this.params.skip !== undefined) {
      const dispose = holdToSkip(() => { tl.kill(); Director.run(() => this.lastLine(), 'skip ending'); });
      this.disposers.push(dispose);
    }

    // everything at once
    if (play('montage')) await this.montage(tl, fx);

    // "¿Sabes cómo supe que lo había logrado, pequeño?"
    if (play('question')) {
      this.shot.set(new THREE.Vector3(1.6, 1.55, 4.6), A.clone().add(new THREE.Vector3(0, 1.1, 1.0)), 40);
      await tl.hold(dialogue.say([
        { speaker: '{name}', portrait: { seed: 'elias', race: 'excepcion', special: 'elias', mood: 'smug' }, side: 'right', text: ENDING.question, speed: 0.85 },
        { speaker: 'Aurel', portrait: { seed: 'aurel_old', race: 'humano', special: 'aurel_old', mood: 'sad' }, side: 'left', text: ENDING.aurelSilence, auto: 2.4 },
      ]));
      set.elias.setExpression('happy');
      await tl.wait(1.4);
      for (const l of ENDING.turn) await tl.hold(centerLine(l, { hold: 1.6 }));
    }

    // the camera turns until Elias looks straight at you
    audio.music('ending');
    audio.ambience('void', false);
    set.swapElias('elias_god');
    set.elias.setExpression('neutral');
    const eHead = set.elias.root.position.clone().add(new THREE.Vector3(0, set.elias.height * 0.9, 0));
    let lookCam = false;
    this.hooks.add(() => { if (lookCam) set.elias.head.g.lookAt(this.camera.position); });
    const orbitR = 3.2;
    const a1 = Math.PI; // in front of him (he faces -z toward Aurel; the camera ends between them)
    if (play('turn')) {
      engine.pipeline.flash('#e9dcff', 0.35, 0.8);
      if (!play('question')) this.shot.set(new THREE.Vector3(1.6, 1.55, 4.6), A.clone().add(new THREE.Vector3(0, 1.1, 1.0)), 40);
      const a0 = Math.atan2(this.shot.pos.x - eHead.x, this.shot.pos.z - eHead.z);
      await tl.tween(5.5, (k) => {
        const a = a0 + (a1 - a0) * k;
        const r = orbitR * (1 - k * 0.2);
        this.shot.pos.set(eHead.x + Math.sin(a) * r, eHead.y + 0.1 - k * 0.38, eHead.z + Math.cos(a) * r);
        this.shot.look.copy(eHead).add(new THREE.Vector3(0, -0.12 * k, 0));
        this.shot.fov = 40 - k * 8;
        set.dimSpot(1 - k * 0.85);
        if (k > 0.55) lookCam = true;
      }, ease.inOut);
    } else {
      const r = orbitR * 0.8;
      this.shot.set(new THREE.Vector3(eHead.x + Math.sin(a1) * r, eHead.y - 0.28, eHead.z + Math.cos(a1) * r), eHead.clone().add(new THREE.Vector3(0, -0.12, 0)), 32);
      set.dimSpot(0.15);
      lookCam = true;
    }
    set.elias.setEyeGlow('#e9dcff');
    this.shot.handheld = 0.008;
    await tl.wait(1.2);

    // "Te vi…"
    if (play('watched')) {
      const lines = buildWatched();
      for (const l of lines) await tl.hold(this.direct(l, 3.4));
      await tl.wait(1.6);
    }
    await this.lastLine();
  }

  /** "Vuelve al principio." → black → the prologue, but you are the shadow. */
  private async lastLine(): Promise<void> {
    for (const d of this.disposers.splice(0)) d();
    try { dialogue.close(); } catch { /* ignore */ }
    for (const el of document.querySelectorAll('.st-mem, .st-direct')) el.remove();
    this.skyFlicker = 0;
    await this.direct(ENDING.back, 3.2, true);
    unlockAchievement('el');
    const black2 = blackout();
    this.dom.push(black2.el);
    await black2.to(1, 0.2);
    await wait(1600);
    if (!this.alive) return;
    await engine.goto('prologue', { mode: 'shadow' }, { fade: 0.01 });
  }

  /**
   * The Libro de la Realidad, forced to its last page (progression's UI). Closing it without writing is a hesitation:
   * it is recorded, the voice notices, and the book opens again — there is no other way.
   * Falls back to our own page if progression has no book UI.
   */
  private async theBook(tl: Timeline): Promise<void> {
    for (;;) {
      const t0 = performance.now();
      let res: Awaited<ReturnType<typeof openRealityBook>> = null;
      try { res = await openRealityBook({ forced: 'tiempo' }); } catch (err) { console.warn('[ending] reality book', err); }
      tl.guard();
      if (res) return;
      if (performance.now() - t0 < 200) { await this.fallbackBook(tl); return; }
      if (G.run) st().hesitated = true;
      unlockAchievement('dudaste');
      const l = lineFor('hesitation');
      if (l) await narrate(l, { position: 'bottom', hold: 2.4 });
      await tl.wait(0.8);
    }
  }

  private async fallbackBook(tl: Timeline): Promise<void> {
    for (;;) {
      audio.sfx('page_turn');
      const choice = await new Promise<'ok' | 'close'>((resolve) => {
        const done = (v: 'ok' | 'close') => { back.remove(); resolve(v); };
        const card = h('div', { class: 'st-reality' },
          h('div', { class: 'k' }, 'Libro de la Realidad'),
          h('div', { class: 'rule' }, ENDING.rule),
          h('div', { class: 'cost' }, 'Sacrificio: ', h('b', null, ENDING.cost)),
          h('div', { class: 'row' },
            h('button', { class: 'lx-btn ghost', onclick: () => done('close') }, 'Cerrar el libro'),
            h('button', { class: 'lx-btn primary', onclick: () => done('ok') }, 'Confirmar')));
        const back = h('div', { class: 'st-pageback', style: 'cursor:default' }, card);
        layer('modal').appendChild(back);
        this.dom.push(back);
      });
      tl.guard();
      if (choice === 'ok') { audio.sfx('quill'); track('sacrifices'); return; }
      // hesitation: logged. There is no other way.
      track('hesitations');
      if (G.run) st().hesitated = true;
      unlockAchievement('dudaste');
      const l = lineFor('hesitation');
      if (l) await narrate(l, { position: 'bottom', hold: 2.4 });
      await tl.wait(0.8);
    }
  }

  private async montage(tl: Timeline, fx: Fx): Promise<void> {
    const cards = buildMontage();
    void centerLine(ENDING.allAtOnce, { hold: 2 });
    this.skyFlicker = 1;
    audio.sfx('cast_time', { volume: 0.7 });
    const center = this.set!.aurelPos.clone().add(new THREE.Vector3(0, 1.5, 1));
    const timeFx = window.setInterval(() => { if (this.alive) fx.emit('time', center.clone().add(new THREE.Vector3((Math.random() - 0.5) * 10, Math.random() * 4, (Math.random() - 0.5) * 10)), { count: 8 }); }, 120);
    this.disposers.push(() => clearInterval(timeFx));
    this.shot.move(tl, new THREE.Vector3(-6, 4.5, 7), center, 9, ease.sine, 46).catch(() => undefined);
    await tl.wait(2.2);
    const els: HTMLElement[] = [];
    for (let i = 0; i < cards.length; i++) {
      const el = h('div', { class: 'st-mem' }, cards[i]);
      const x = 8 + Math.random() * 56, y = 14 + ((i * 37) % 62);
      el.style.left = `${x}vw`; el.style.top = `${y}vh`;
      el.style.fontSize = `${18 + Math.random() * 14}px`;
      el.style.transform = `rotate(${(Math.random() - 0.5) * 7}deg)`;
      layer('narrator').appendChild(el);
      this.dom.push(el);
      els.push(el);
      requestAnimationFrame(() => el.classList.add('in'));
      audio.sfx('page_turn', { volume: 0.35, pitch: 0.8 + Math.random() * 0.5 });
      if (i === cards.length - 1) audio.sfx('glitch', { volume: 0.5 });
      await tl.wait(Math.max(0.35, 1.05 - i * 0.07));
      if (els.length > 4) els.shift()!.classList.add('out');
    }
    await tl.wait(1.2);
    els.forEach((e) => e.classList.add('out'));
    clearInterval(timeFx);
    this.skyFlicker = 0;
    this.sky!.setTime(0.02);
    await tl.wait(1.2);
    els.forEach((e) => e.remove());
  }

  /** Direct address: white, upright, bottom center (or centered for the last line). */
  private async direct(text: string, hold: number, final = false): Promise<void> {
    const el = h('div', { class: `st-direct ${final ? 'final' : ''}` }, text);
    layer('narrator').appendChild(el);
    this.dom.push(el);
    if (G.meta?.settings.voice) audio.speak(text, { pitch: 0.6, rate: 0.85 });
    await wait(40);
    el.classList.add('in');
    let skip = false;
    const onKey = (e: KeyboardEvent) => { if (e.code === 'Space' || e.code === 'Enter') skip = true; };
    const onPtr = () => { skip = true; };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPtr);
    const until = performance.now() + (hold + Math.min(2.5, text.length * 0.03)) * 1000;
    while (performance.now() < until && !skip && this.alive) await wait(50);
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('pointerdown', onPtr);
    el.classList.remove('in');
    await wait(1000);
    el.remove();
  }

  // ───────────────────────────── El Sello ─────────────────────────────

  private async runSello(): Promise<void> {
    const tl = this.tl;
    audio.music('silence');
    audio.stinger('sealed');
    const page = h('div', { class: 'st-sello' });
    layer('panel').appendChild(page);
    this.dom.push(page);
    await wait(60);
    page.classList.add('in');
    await tl.wait(3.2);
    for (let i = 0; i < ENDING.sello.length; i++) {
      const el = h('div', { class: 'st-sello-line' }, ENDING.sello[i]);
      page.appendChild(el);
      await wait(40);
      el.classList.add('in');
      audio.sfx('quill', { volume: 0.5 });
      await tl.wait(i === ENDING.sello.length - 1 ? 4.2 : 3.6);
      if (i < ENDING.sello.length - 1) { el.classList.add('out'); await tl.wait(2.2); }
    }
    unlockAchievement('pagina_en_blanco');
    endCycle('sello');
    await tl.wait(1.5);
    if (!this.alive) return;
    await engine.goto('margins', { ending: 'sello' }, { fade: 2 });
  }

  update(dt: number, time: number): void {
    this.director.update(dt);
    for (const hk of this.hooks) { try { hk(dt); } catch (err) { console.warn('[ending] hook', err); } }
    if (this.set) this.set.update(dt, time);
    if (this.sky) {
      if (this.skyFlicker > 0 && Math.random() < dt * 6) {
        // every hour at once: the sky can't decide
        this.sky.override = Math.random() < 0.5 ? null : { top: '#05030a', mid: '#130a22', horizon: '#34184c', fog: '#120a1c', stars: 0.55, weight: 0.6 };
        this.sky.setTime(Math.random());
      } else if (this.skyFlicker <= 0 && !this.sky.override) {
        this.sky.override = { top: '#05030a', mid: '#130a22', horizon: '#34184c', sun: '#b9a2ff', sunI: 0.75, amb: '#4a3a6a', ambI: 0.7, fog: '#120a1c', stars: 0.55, weight: 1 };
        this.sky.setTime(0.02);
      }
      this.sky.update(dt, this.camera, time);
    }
    this.fx?.update(dt);
    this.shot.apply(dt);
  }

  exit(): void {
    this.alive = false;
    this.director.killAll();
    for (const d of this.disposers.splice(0)) d();
    this.block(false);
    for (const el of this.dom) el.remove();
    this.dom = [];
    this.hooks.clear();
    try { dialogue.close(); } catch { /* ignore */ }
    clearNarrator();
    audio.ambience('void', false);
    this.set?.dispose(); this.set = null;
    this.fx?.dispose(); this.fx = null;
    this.sky?.dispose(); this.sky = null;
    this.scene.clear();
    input.enabled = true;
    this.director = new Director();
  }
}

registerScene('ending', () => new EndingScene());
