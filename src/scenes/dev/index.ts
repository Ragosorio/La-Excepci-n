/**
 * "Laboratorio" — developer scene: showcases the anime look (sky, toon, outlines, rigs, fx) and links to every scene.
 * Open with ?scene=dev
 */
import * as THREE from 'three';
import { engine, registerScene, type GameScene } from '../../core/engine';
import { Sky } from '../../render/sky';
import { Fx } from '../../render/fx';
import { CameraRig } from '../../render/camera';
import { toon, withOutline } from '../../render/toon';
import { buildCharacter, type CharacterRig, type CharacterSpec } from '../../characters/rig';
import { h, layer } from '../../ui/dom';
import { input } from '../../core/input';
import { G, newRun } from '../../core/state';
import { narrate } from '../../ui/narrator';
import { banner, excepcionAcquired, toast } from '../../ui/toasts';
import { floatText } from '../../ui/float';
import { dialogue } from '../../ui/dialogue';

class DevScene implements GameScene {
  readonly id = 'dev';
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(50, 1, 0.1, 2000);
  private sky!: Sky;
  private fx!: Fx;
  private rig!: CameraRig;
  private chars: CharacterRig[] = [];
  private ui: HTMLElement | null = null;
  private t = 0;
  private dayCycle = false;
  private built = false;

  private build(): void {
    this.sky = new Sky(this.scene, { fogNear: 40, fogFar: 260, shadowSize: 30 });
    this.fx = new Fx(this.scene);
    this.rig = new CameraRig(this.camera);
    this.rig.distance = 14; this.rig.pitch = 0.45; this.rig.yaw = Math.PI * 0.08 + Math.PI;
    const ground = new THREE.Mesh(new THREE.CircleGeometry(80, 64).rotateX(-Math.PI / 2), toon('#7fb04a', { bands: [0.6, 0.85, 1] }));
    ground.receiveShadow = true;
    this.scene.add(ground);
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2, r = 18 + Math.random() * 40;
      const tree = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 2, 8), toon('#6a4a30'));
      trunk.position.y = 1;
      const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(1.6, 1), toon(i % 3 ? '#3f8a3a' : '#5aa04a', { bands: [0.55, 0.8, 1] }));
      crown.position.y = 3.2; crown.scale.y = 1.2;
      withOutline(crown, 0.06); withOutline(trunk, 0.05);
      tree.add(trunk, crown);
      tree.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      tree.scale.setScalar(0.8 + Math.random() * 0.8);
      tree.traverse((o) => { if ((o as THREE.Mesh).isMesh && !o.userData.isOutline) o.castShadow = true; });
      this.scene.add(tree);
    }
    const specs: CharacterSpec[] = [
      { seed: 'elias', race: 'excepcion', special: 'elias' },
      { seed: 'aurel', race: 'humano', special: 'aurel' },
      { seed: 'k1', race: 'caballero', job: 'guerrero' },
      { seed: 'e1', race: 'elfo', job: 'arquero', gender: 'f' },
      { seed: 'd1', race: 'enano', job: 'herrero' },
      { seed: 'o1', race: 'ogro', job: 'guerrero' },
      { seed: 'g1', race: 'duende', job: 'banquero', special: 'tiburcio' },
      { seed: 't1', race: 'trol', job: 'cazador' },
      { seed: 'w1', race: 'bruja', job: 'hechicero', gender: 'f' },
      { seed: 'gi1', race: 'gigante', job: 'guerrero' },
      { seed: 'c1', race: 'humano', job: 'cortesana', gender: 'f' },
      { seed: 'kid', race: 'humano', special: 'aurel_child', age: 'child' },
      { seed: 'sh', race: 'excepcion', special: 'shadow' },
    ];
    specs.forEach((s, i) => {
      const c = buildCharacter(s);
      const a = (i / specs.length) * Math.PI * 1.2 - Math.PI * 0.6;
      c.root.position.set(Math.sin(a) * 7, 0, Math.cos(a) * 7 - 2);
      c.root.rotation.y = Math.PI + a * 0.5;
      this.scene.add(c.root);
      this.chars.push(c);
    });
    this.built = true;
  }

  enter(): void {
    if (!this.built) this.build();
    if (!G.hasRun) newRun(1234);
    this.ui = h('div', { class: 'lx-panel', style: 'position:absolute;left:14px;top:14px;width:290px;max-height:92vh;overflow:auto' },
      h('div', { class: 'lx-panel-title' }, 'Laboratorio'),
      h('div', { class: 'lx-col' },
        h('div', { class: 'lx-small lx-muted' }, 'Escenas'),
        h('div', { class: 'lx-btn-row' }, ...['title', 'prologue', 'overworld', 'location', 'battle', 'casino', 'council', 'ending', 'margins'].map((id) =>
          h('button', { class: 'lx-btn small', onclick: () => void engine.goto(id, { debug: true }) }, id))),
        h('hr', { class: 'lx-sep' }),
        h('div', { class: 'lx-small lx-muted' }, 'Efectos (teclas F1–F8)'),
        h('div', { class: 'lx-btn-row' },
          h('button', { class: 'lx-btn small', onclick: () => this.demo(1) }, 'Explosión'),
          h('button', { class: 'lx-btn small', onclick: () => this.demo(2) }, 'Impact'),
          h('button', { class: 'lx-btn small', onclick: () => this.demo(3) }, '¡Excepción!'),
          h('button', { class: 'lx-btn small', onclick: () => this.demo(4) }, 'Narrador'),
          h('button', { class: 'lx-btn small', onclick: () => this.demo(5) }, 'Diálogo'),
          h('button', { class: 'lx-btn small', onclick: () => this.demo(6) }, 'Mente'),
          h('button', { class: 'lx-btn small', onclick: () => { this.dayCycle = !this.dayCycle; } }, 'Ciclo día'),
        ),
      ));
    layer('panel').appendChild(this.ui);
  }

  private demo(n: number): void {
    const p = new THREE.Vector3((Math.random() - 0.5) * 6, 1, (Math.random() - 0.5) * 4);
    if (n === 1) {
      this.fx.emit('explosion', p); this.fx.emit('smoke', p); this.fx.ring(p, { color: '#ffb347', radius: 6 }); this.fx.flash(p, { color: '#ffcf5a', radius: 3 });
      this.rig.shake(0.6); engine.hitstop(70); floatText(p, '128', { kind: 'crit' });
      for (const c of this.chars) { if (c.root.position.distanceTo(p) < 6) { c.hit(c.root.position.clone().sub(p).normalize()); c.setExpression('scared'); } }
    } else if (n === 2) {
      engine.pipeline.impact(3, 1); engine.hitstop(120); this.rig.shake(0.8); this.fx.emit('hit', p, { count: 20 });
    } else if (n === 3) {
      void excepcionAcquired('Fuerza Titánica', { color: '#ff7a3a' });
    } else if (n === 4) {
      void narrate({ third: '{name} murió aquella noche.', first: 'Morí aquella noche.' });
    } else if (n === 5) {
      void dialogue.say([
        { speaker: 'Aurel', title: 'Portador del Alba', portrait: { seed: 'aurel', race: 'humano', special: 'aurel', mood: 'smile' }, text: 'Nadie tiene que salir herido. *Todavía* estamos a tiempo.' },
        { speaker: '{name}', portrait: { seed: 'elias', race: 'excepcion', special: 'elias', mood: 'smug' }, side: 'right', text: 'Qué curioso. Eso mismo pensaba yo.' },
      ]);
    } else if (n === 6) {
      engine.pipeline.setMind(engine.pipeline.base.mind > 0 ? 0 : 1);
      for (const c of this.chars) c.setExpression(engine.pipeline.base.mind > 0 ? 'mind' : 'neutral');
      toast('Dominar Mente', { kind: 'epica' });
      void banner('EXCEPCIÓN', 'Dominar Mente', { kind: 'excepcion', duration: 1.6 });
    }
  }

  exit(): void { this.ui?.remove(); this.ui = null; }

  update(dt: number, time: number): void {
    this.t += dt;
    if (this.dayCycle) this.sky.setTime((this.sky.time + dt * 0.03) % 1);
    const keys = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6'];
    keys.forEach((k, i) => { if (input.wasPressed(k)) this.demo(i + 1); });
    this.chars.forEach((c, i) => {
      const walking = i % 3 === 0;
      if (walking) { c.root.position.x += Math.sin(this.t * 0.5 + i) * dt * 1.2; }
      c.update(dt, { speed: walking ? Math.abs(Math.cos(this.t * 0.5 + i)) * 2.5 : 0 });
      if (Math.random() < 0.003) c.play(i % 2 ? 'attack' : 'cast', 0.45);
    });
    if (input.mouse.buttons[2]) { this.rig.yaw -= input.mouse.dx * 0.005; this.rig.pitch = THREE.MathUtils.clamp(this.rig.pitch + input.mouse.dy * 0.004, 0.1, 1.4); }
    if (input.mouse.wheel) this.rig.zoom(input.mouse.wheel);
    this.rig.follow(new THREE.Vector3(0, 0, -1));
    this.rig.update(dt);
    this.sky.update(dt, this.camera, time);
    this.fx.update(dt);
  }
}

registerScene('dev', () => new DevScene());
