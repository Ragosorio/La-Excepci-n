/**
 * Shared pieces of the forest modes ('boy' and 'shadow'): building the set and cast, seating, walking,
 * camera shots, the boy's light, and eyelids.
 */
import * as THREE from 'three';
import { engine } from '../../core/engine';
import { input } from '../../core/input';
import { h, layer, wait } from '../../ui/dom';
import { audio } from '../../audio';
import { buildCharacter, type CharacterRig } from '../../characters/rig';
import { Forest } from './forest';
import { Dog, DogBrain, angleDelta } from './dog';
import { Rain } from './rain';
import { ease } from './director';
import type { PCtx } from './index';

export function setupForest(c: PCtx): Forest {
  const f = new Forest(11);
  c.scene.add(f.group);
  c.forest = f;
  const boy = buildCharacter({ seed: 'aurel_child', race: 'humano', special: 'aurel_child', age: 'child' });
  c.scene.add(boy.root);
  c.boy = boy;
  const dog = new Dog(0.95);
  c.scene.add(dog.root);
  c.dog = dog;
  c.dogBrain = new DogBrain(dog);
  const sh = buildCharacter({ seed: 'shadow', race: 'excepcion', special: 'shadow' });
  sh.setOpacity(0);
  sh.root.visible = false;
  c.scene.add(sh.root);
  c.shadow = sh;
  const rain = new Rain();
  c.scene.add(rain.lines);
  c.rain = rain;
  c.rig.distance = 6.4; c.rig.pitch = 0.3; c.rig.lookOffset.set(0, 1.0, 0); c.rig.followK = 7;
  c.rig.minDistance = 3; c.rig.maxDistance = 12;
  return f;
}

/** Where the boy sits (root), facing east. */
export function seatPos(f: Forest): THREE.Vector3 {
  return f.logPos.clone().addScaledVector(f.faceDir, 0.02).add(new THREE.Vector3(0, 0.15, 0));
}
export function dogSeatPos(f: Forest): THREE.Vector3 {
  const p = f.logPos.clone().addScaledVector(f.right, -1.7).addScaledVector(f.faceDir, 0.15);
  p.y = f.height(p.x, p.z);
  return p;
}
export const headingOf = (d: THREE.Vector3) => Math.atan2(d.x, d.z);

export function seatBoy(c: PCtx): void {
  const f = c.forest!, b = c.boy!;
  b.root.position.copy(seatPos(f));
  b.root.rotation.y = headingOf(f.faceDir);
  b.pose = 'sit';
}
export function seatDog(c: PCtx): void {
  const f = c.forest!, d = c.dog!;
  d.root.position.copy(dogSeatPos(f));
  d.root.rotation.y = headingOf(f.faceDir) - 0.25;
  d.pose = 'sit';
}

// ───────────────────────────── shots ─────────────────────────────

export function shots(c: PCtx) {
  const f = c.forest!;
  const F = f.faceDir, R = f.right, B = f.logPos;
  const up = (y: number) => new THREE.Vector3(0, y, 0);
  const at = (fw: number, rt: number, y: number) => B.clone().addScaledVector(F, fw).addScaledVector(R, rt).add(up(y));
  const dogHead = () => { const p = new THREE.Vector3(); c.dog!.head.getWorldPosition(p); return p; };
  return {
    silhouette: () => ({ pos: at(-4.6, 1.5, 1.2), look: at(22, -1.5, 2.2) }),
    silhouetteClose: () => ({ pos: at(-2.6, 0.9, 0.95), look: at(20, -1.2, 2.6) }),
    boyFace: () => ({ pos: at(2.0, 0.45, 0.9), look: at(0, 0, 0.72) }),
    overShoulder: () => ({ pos: at(-2.0, 0.85, 1.2), look: f.shadowPos.clone().add(up(1.0)) }),
    wide: () => ({ pos: at(-2.4, 8.5, 2.6), look: at(4.2, 0, 0.8) }),
    dogFace: () => { const h = dogHead(); return { pos: h.clone().addScaledVector(F, 1.55).addScaledVector(R, -0.55).add(up(0.12)), look: h.clone().add(up(-0.05)) }; },
    behindBoy: () => ({ pos: at(-2.3, 0.1, 1.72), look: at(3.5, 0, 0.9) }),
    sideAfter: () => ({ pos: at(0.5, 3.6, 1.3), look: at(-1.2, 0, 1.0) }),
    shadowPOV: () => ({ pos: at(-1.7, -0.15, 1.9), look: at(5, 0.2, 0.95) }),
  };
}

// ───────────────────────────── walking ─────────────────────────────

export class Walker {
  heading = 0;
  speed = 0;
  private vel = new THREE.Vector3();
  constructor(readonly who: CharacterRig | THREE.Object3D, public walkSpeed = 3.1, public runSpeed = 5.6) {}
  get root(): THREE.Object3D { return (this.who as CharacterRig).root ?? (this.who as THREE.Object3D); }

  /** Camera-relative WASD movement with optional run (Shift), ground following and soft bounds. */
  update(dt: number, c: PCtx, opts: { canRun?: boolean; forceRun?: boolean; bounds?: (p: THREE.Vector3) => THREE.Vector3 | null } = {}): void {
    const f = c.forest!;
    const mv = input.moveVector();
    const yaw = c.rig.yaw;
    const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const dir = fwd.multiplyScalar(mv.y).addScaledVector(right, mv.x);
    const running = !!opts.forceRun || (!!opts.canRun && input.action('sprint'));
    const max = running ? this.runSpeed : this.walkSpeed;
    const want = dir.lengthSq() > 0.01 ? dir.normalize().multiplyScalar(max) : new THREE.Vector3();
    this.vel.lerp(want, 1 - Math.exp(-9 * dt));
    const p = this.root.position;
    p.addScaledVector(this.vel, dt);
    const push = opts.bounds?.(p);
    if (push) p.add(push);
    p.y = f.height(p.x, p.z);
    this.speed = this.vel.length();
    if (this.speed > 0.15) this.heading = Math.atan2(this.vel.x, this.vel.z);
    this.root.rotation.y += angleDelta(this.root.rotation.y, this.heading) * (1 - Math.exp(-10 * dt));
    // the follow camera drifts behind the walker unless the player dragged it recently
    c.camManualT = Math.max(0, c.camManualT - dt);
    if (this.speed > 0.6 && c.camManualT <= 0) c.rig.yaw += angleDelta(c.rig.yaw, this.heading + Math.PI) * (1 - Math.exp(-1.4 * dt));
    c.rig.follow(p);
  }
}

/** Soft corridor around the forest path (and the log clearing). */
export function forestBounds(c: PCtx) {
  const f = c.forest!;
  return (p: THREE.Vector3): THREE.Vector3 | null => {
    const d = f.distToPath(p.x, p.z);
    const nearLog = Math.hypot(p.x - f.logPos.x, p.z - f.logPos.z) < 9;
    const out = new THREE.Vector3();
    if (!nearLog && d > 7) {
      let best = Infinity; let bx = 0, bz = 0;
      for (const q of f.path.getSpacedPoints(80)) { const dd = (q.x - p.x) ** 2 + (q.z - p.z) ** 2; if (dd < best) { best = dd; bx = q.x; bz = q.z; } }
      out.set(bx - p.x, 0, bz - p.z).normalize().multiplyScalar((d - 7) * 0.2);
    }
    if (p.x > 5) out.x -= (p.x - 5) * 0.3;
    if (p.x < -66) out.x += (-66 - p.x) * 0.3;
    return out.lengthSq() > 0 ? out : null;
  };
}

// ───────────────────────────── the light ─────────────────────────────

export function handPos(rig: CharacterRig): THREE.Vector3 {
  rig.root.updateMatrixWorld(true);
  return rig.foreR.g.localToWorld(new THREE.Vector3(0, -0.3, 0.03));
}

/** The first light: gathers in the boy's hand and bursts toward `target`. Leaves a white flash decaying. */
export async function lightBurst(c: PCtx, hand: () => THREE.Vector3, target: THREE.Vector3): Promise<void> {
  const tl = c.tl;
  const pl = new THREE.PointLight('#fff1c4', 0, 14, 1.4);
  pl.position.copy(hand());
  c.scene.add(pl);
  c.extra.push({ dispose: () => pl.removeFromParent() });
  audio.sfx('cast_light', { pitch: 0.75, volume: 0.9 });
  await tl.tween(1.1, (k) => {
    pl.position.copy(hand());
    pl.intensity = k * k * 40;
    if (Math.random() < 0.7) c.fx.emit('light', hand(), { count: 5, speed: -2.6, spread: 0.9 + k, life: 0.45, size: 0.22 });
  }, ease.in);
  const h0 = hand();
  c.fx.emit('light', h0, { count: 280, speed: 17, size: 0.75, life: 1.3 });
  c.fx.emit('stars', h0, { count: 40, speed: 12 });
  c.fx.flash(h0, { color: '#fff7d6', radius: 22, duration: 1.1, intensity: 4.5 });
  c.fx.beam(h0, target, { color: '#fff4c8', width: 1.6, duration: 0.9, intensity: 5 });
  c.fx.ring(new THREE.Vector3(h0.x, c.forest!.height(h0.x, h0.z) + 0.05, h0.z), { color: '#fff2c0', radius: 30, duration: 1.1 });
  engine.pipeline.impact(3, 0);
  engine.pipeline.flash('#fff7d6', 1, 2.6);
  engine.pipeline.chromaticPulse(2.2, 1.4);
  engine.hitstop(110);
  c.rig.shake(0.9);
  audio.sfx('explosion', { volume: 0.7, pitch: 1.3 });
  audio.sfx('cast_light', { volume: 1 });
  pl.intensity = 160;
  tl.bg(1.6, (k) => { pl.intensity = 160 * (1 - k); });
}

// ───────────────────────────── eyelids ─────────────────────────────

export function eyelids(c: PCtx): { close(s?: number): Promise<void>; open(s?: number): Promise<void>; remove(): void } {
  const el = h('div', { class: 'st-lids open' }, h('div', { class: 'st-lid top' }), h('div', { class: 'st-lid bot' }));
  layer('fade').appendChild(el);
  c.dom.push(el);
  const set = async (open: boolean, s: number) => {
    el.querySelectorAll<HTMLElement>('.st-lid').forEach((l) => { l.style.transitionDuration = `${s}s`; });
    void el.offsetWidth;
    el.classList.toggle('open', open);
    await wait(s * 1000 + 30);
  };
  return { close: (s = 0.6) => set(false, s), open: (s = 1.8) => set(true, s), remove: () => el.remove() };
}
