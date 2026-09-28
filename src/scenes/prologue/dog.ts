/**
 * Bruma — a small fluffy white-grey dog (procedural toon rig with outlines).
 * Root at the feet, facing +Z. Poses: stand (idle/trot), sit, lie. Tail wags, head looks at things.
 * She is always calm: for her, it is always dawn.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toon, outlineMaterial } from '../../render/toon';

const FUR = '#efece7';
const FUR2 = '#dcd7d0';
const GREY = '#aaa49c';
const DARK = '#7d766f';
const NOSE = '#1a1418';
const PINK = '#e88a9a';

const SPH = new THREE.SphereGeometry(1, 16, 12);
const CAP = new THREE.CapsuleGeometry(1, 1, 4, 10);
const CONE = new THREE.ConeGeometry(1, 1, 10, 1);

/** Merges colored primitives into one vertex-colored geometry. */
class Parts {
  private list: THREE.BufferGeometry[] = [];
  add(g: THREE.BufferGeometry, color: string, pos: [number, number, number], scale: [number, number, number] | number, rot: [number, number, number] = [0, 0, 0]): this {
    const c = g.clone();
    const s = typeof scale === 'number' ? [scale, scale, scale] : scale;
    c.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(s[0], s[1], s[2])));
    const col = new THREE.Color(color);
    const n = c.getAttribute('position').count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = col.r; arr[i * 3 + 1] = col.g; arr[i * 3 + 2] = col.b; }
    c.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    this.list.push(c.index ? c.toNonIndexed() : c);
    return this;
  }
  build(mat: THREE.Material, outline = 0.011): THREE.Mesh {
    const merged = mergeGeometries(this.list, false)!;
    this.list.forEach((g) => g.dispose());
    merged.computeBoundingSphere();
    const m = new THREE.Mesh(merged, mat);
    m.castShadow = true;
    if (outline > 0) {
      const o = new THREE.Mesh(merged, outlineMaterial(outline, '#1d1520'));
      o.userData.isOutline = true;
      m.add(o);
    }
    return m;
  }
}

interface Leg { hip: THREE.Group; knee: THREE.Group; front: boolean; side: 1 | -1 }

export type DogPose = 'stand' | 'sit' | 'lie';

export class Dog {
  readonly root = new THREE.Group();
  readonly body = new THREE.Group();
  readonly head = new THREE.Group();
  readonly tail = new THREE.Group();
  private tongue: THREE.Mesh;
  private legs: Leg[] = [];
  private mat: THREE.MeshToonMaterial;
  private meshes: THREE.Mesh[] = [];
  private phase = 0;
  private speedS = 0;
  private t = Math.random() * 10;
  private sitK = 0;
  private lieK = 0;
  private blinkT = 2;
  private eyes: THREE.Mesh[] = [];
  pose: DogPose = 'stand';
  /** 0..1 tail wag amount. */
  wag = 0.6;
  /** World point to look at (null = look ahead / around). */
  lookTarget: THREE.Vector3 | null = null;
  private yaw = 0; private pitch = 0;
  /** Snout down (sniffing) amount 0..1. */
  sniff = 0;

  constructor(scale = 1) {
    this.mat = toon('#ffffff', { vertexColors: true, rim: 0.3, rimColor: '#fff4e0', unique: true });
    this.mat.emissive = new THREE.Color('#1c1a18');
    this.root.add(this.body);
    this.body.position.set(0, 0.3, -0.17); // pivot at the rear hips (sitting rotates around it)

    // ── torso (relative to the rear pivot)
    const torso = new Parts()
      .add(SPH, FUR, [0, 0.04, 0.17], [0.165, 0.15, 0.27])
      .add(SPH, FUR, [0, 0.03, 0.36], [0.16, 0.155, 0.14])          // chest ruff
      .add(SPH, FUR2, [0, -0.02, 0.4], [0.12, 0.12, 0.1])
      .add(SPH, FUR, [0, 0.05, 0.0], [0.15, 0.14, 0.14])            // rump
      .add(SPH, GREY, [0, 0.13, 0.14], [0.12, 0.05, 0.19])          // grey saddle
      .add(SPH, FUR, [0.1, 0.1, 0.33], [0.07, 0.07, 0.07])
      .add(SPH, FUR, [-0.1, 0.1, 0.33], [0.07, 0.07, 0.07])
      .add(SPH, FUR, [0, 0.14, 0.31], [0.08, 0.07, 0.08]);
    const tm = torso.build(this.mat);
    this.body.add(tm); this.meshes.push(tm);

    // ── head
    this.head.position.set(0, 0.19, 0.44);
    this.head.scale.setScalar(1.15);
    this.body.add(this.head);
    const hp = new Parts()
      .add(SPH, FUR, [0, 0.03, 0], [0.125, 0.115, 0.12])
      .add(SPH, FUR, [0.075, -0.03, 0.02], [0.065, 0.06, 0.06])    // cheeks
      .add(SPH, FUR, [-0.075, -0.03, 0.02], [0.065, 0.06, 0.06])
      .add(SPH, FUR2, [0, -0.035, 0.11], [0.068, 0.058, 0.09])     // snout
      .add(SPH, NOSE, [0, -0.012, 0.198], [0.026, 0.02, 0.018])    // nose
      .add(SPH, GREY, [0, 0.1, -0.02], [0.08, 0.04, 0.08])          // grey crown
      .add(CONE, GREY, [0.075, 0.13, -0.01], [0.052, 0.12, 0.035], [0.12, 0, -0.42])   // ears
      .add(CONE, GREY, [-0.075, 0.13, -0.01], [0.052, 0.12, 0.035], [0.12, 0, 0.42])
      .add(CONE, DARK, [0.098, 0.182, 0.008], [0.022, 0.045, 0.02], [0.9, 0, -0.5])   // folded tips
      .add(CONE, DARK, [-0.098, 0.182, 0.008], [0.022, 0.045, 0.02], [0.9, 0, 0.5]);
    const hm = hp.build(this.mat, 0.009);
    this.head.add(hm); this.meshes.push(hm);
    // eyes (separate so they can blink)
    const eyeMat = new THREE.MeshBasicMaterial({ color: '#120c12' });
    const glintMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
    for (const s of [1, -1]) {
      const e = new THREE.Mesh(SPH, eyeMat);
      e.scale.set(0.02, 0.02, 0.012);
      e.position.set(0.052 * s, 0.035, 0.1);
      const g = new THREE.Mesh(SPH, glintMat);
      g.scale.setScalar(0.3);
      g.position.set(-0.3 * s, 0.35, 0.6);
      e.add(g);
      this.head.add(e);
      this.eyes.push(e);
    }
    this.tongue = new THREE.Mesh(SPH, toon(PINK, { unique: true }));
    this.tongue.scale.set(0.025, 0.008, 0.035);
    this.tongue.position.set(0, -0.075, 0.14);
    this.tongue.visible = false;
    this.head.add(this.tongue);

    // ── tail
    this.tail.position.set(0, 0.1, -0.08);
    this.body.add(this.tail);
    const tp = new Parts()
      .add(SPH, FUR, [0, 0.05, -0.03], [0.055, 0.07, 0.055])
      .add(SPH, FUR, [0, 0.12, -0.05], [0.058, 0.065, 0.058])
      .add(SPH, FUR2, [0, 0.18, -0.03], [0.05, 0.055, 0.05])
      .add(SPH, GREY, [0, 0.22, 0.01], [0.035, 0.035, 0.035]);
    const tl = tp.build(this.mat, 0.009);
    this.tail.add(tl); this.meshes.push(tl);
    this.tail.rotation.x = -0.35;

    // ── legs: front ones hang from the chest, rear ones from the pivot
    const mkLeg = (front: boolean, side: 1 | -1) => {
      const hip = new THREE.Group();
      hip.position.set(0.075 * side, 0.0, front ? 0.36 : 0.02);
      this.body.add(hip);
      const up = new Parts().add(CAP, front ? FUR : FUR, [0, -0.07, 0], [0.042, 0.07, 0.045]);
      if (!front) up.add(SPH, FUR, [0, -0.02, -0.01], [0.07, 0.08, 0.08]);
      const um = up.build(this.mat, 0.009);
      hip.add(um); this.meshes.push(um);
      const knee = new THREE.Group();
      knee.position.set(0, -0.15, 0);
      hip.add(knee);
      const lo = new Parts().add(CAP, FUR2, [0, -0.06, 0], [0.034, 0.055, 0.034]).add(SPH, FUR, [0, -0.13, 0.02], [0.042, 0.03, 0.05]);
      const lm = lo.build(this.mat, 0.009);
      knee.add(lm); this.meshes.push(lm);
      this.legs.push({ hip, knee, front, side });
    };
    mkLeg(true, 1); mkLeg(true, -1); mkLeg(false, 1); mkLeg(false, -1);

    // soft contact shadow
    const blob = new THREE.Mesh(new THREE.CircleGeometry(0.3, 18).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.22, depthWrite: false }));
    blob.position.set(0, 0.015, 0.02);
    blob.scale.set(0.8, 1, 1.3);
    this.root.add(blob);
    this.root.scale.setScalar(scale);
  }

  /** Warm, dawn-like light that only she seems to receive (0..1). */
  setWarmth(v: number): void {
    this.mat.emissive.setRGB(0.11 + 0.5 * v, 0.1 + 0.3 * v, 0.095 + 0.12 * v);
  }

  setOpacity(a: number): void {
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const mat = m.material as THREE.Material;
      mat.transparent = a < 1;
      (mat as THREE.Material & { opacity: number }).opacity = a;
    });
  }

  update(dt: number, opts: { speed?: number } = {}): void {
    this.t += dt;
    const speed = opts.speed ?? 0;
    this.speedS += (speed - this.speedS) * (1 - Math.exp(-8 * dt));
    const moving = this.speedS > 0.25 && this.pose === 'stand';
    const stride = Math.min(1, this.speedS / 3.5);
    this.phase += dt * (5 + this.speedS * 3.4);
    const s = Math.sin(this.phase);
    const tSit = this.pose === 'sit' ? 1 : 0;
    const tLie = this.pose === 'lie' ? 1 : 0;
    this.sitK += (tSit - this.sitK) * (1 - Math.exp(-6 * dt));
    this.lieK += (tLie - this.lieK) * (1 - Math.exp(-5 * dt));
    const sit = this.sitK, lie = this.lieK;

    // body: trot bob, sit pitch (nose up), lie lowered
    const breathe = Math.sin(this.t * 2.2) * 0.006;
    this.body.position.y = 0.3 + (moving ? Math.abs(s) * 0.025 * stride : 0) - sit * 0.04 - lie * 0.17 + breathe;
    this.body.rotation.x = -0.62 * sit + (moving ? Math.sin(this.phase * 2) * 0.03 * stride : 0);
    this.body.rotation.z = moving ? s * 0.04 * stride : 0;

    for (const leg of this.legs) {
      const diag = (leg.front ? 1 : -1) * leg.side; // FL & BR share phase
      const swing = moving ? Math.sin(this.phase + (diag > 0 ? 0 : Math.PI)) * 0.65 * stride : 0;
      const lift = moving ? Math.max(0, Math.cos(this.phase + (diag > 0 ? 0 : Math.PI))) * 0.7 * stride : 0;
      let hx = -swing, kx = leg.front ? -lift * 0.4 : lift;
      if (leg.front) {
        hx = hx * (1 - sit) + 0.62 * sit;           // keep front legs vertical while the body pitches up
        hx = hx * (1 - lie) + -1.25 * lie;          // stretched forward when lying
        kx = kx * (1 - lie) + 0.1 * lie;
      } else {
        hx = hx * (1 - sit) + -0.95 * sit;          // thighs forward along the ground
        kx = kx * (1 - sit) + 1.95 * sit;           // paws tucked back
        hx = hx * (1 - lie) + -1.35 * lie;
        kx = kx * (1 - lie) + 2.2 * lie;
      }
      leg.hip.rotation.x = hx;
      leg.knee.rotation.x = kx;
      leg.hip.rotation.z = leg.side * 0.04;
    }

    // head: look target (world) or idle glances; sniffing lowers the snout
    let yawT = Math.sin(this.t * 0.31) * 0.25 + Math.sin(this.t * 0.83) * 0.08;
    let pitchT = 0.05 + Math.sin(this.t * 0.5) * 0.04;
    if (this.lookTarget) {
      const local = this.body.worldToLocal(this.lookTarget.clone());
      const hp = this.head.position;
      const dx = local.x - hp.x, dy = local.y - hp.y, dz = local.z - hp.z;
      yawT = Math.max(-1.1, Math.min(1.1, Math.atan2(dx, dz)));
      pitchT = Math.max(-0.5, Math.min(0.6, -Math.atan2(dy, Math.hypot(dx, dz))));
    }
    pitchT += this.sniff * 0.7 + sit * -0.25 + (moving ? 0.1 : 0);
    this.yaw += (yawT - this.yaw) * (1 - Math.exp(-4 * dt));
    this.pitch += (pitchT - this.pitch) * (1 - Math.exp(-4 * dt));
    this.head.rotation.set(this.pitch + (moving ? Math.sin(this.phase * 2) * 0.05 : 0), this.yaw, Math.sin(this.t * 0.45) * 0.06);

    // tail: wag (faster when happy/moving), swept low when sitting
    const wagAmp = (0.25 + this.wag * 0.5) * (moving ? 0.8 : 1);
    const wagF = 6 + this.wag * 7 + (moving ? 3 : 0);
    this.tail.rotation.y = Math.sin(this.t * wagF) * wagAmp;
    this.tail.rotation.x = -0.35 - (moving ? 0.25 : 0) + sit * 1.25 + lie * 0.9;

    // blink
    this.blinkT -= dt;
    let eyeY = 1;
    if (this.blinkT < 0) { eyeY = 0.15; if (this.blinkT < -0.12) this.blinkT = 2.5 + Math.random() * 4; }
    for (const e of this.eyes) e.scale.y = 0.02 * eyeY;
    this.tongue.visible = moving && this.speedS > 2.2;
  }

  dispose(): void {
    this.root.removeFromParent();
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && !m.userData.isOutline && m.geometry !== SPH && m.geometry !== CAP && m.geometry !== CONE) m.geometry.dispose();
    });
    this.mat.dispose();
  }
}

/**
 * Simple follower brain: trots after a target keeping an offset, sniffs around when idle, sits when told.
 */
export class DogBrain {
  private wanderT = 3;
  private wanderTo: THREE.Vector3 | null = null;
  private vel = new THREE.Vector3();
  heading = 0;
  constructor(readonly dog: Dog) {}

  /** Follow `leader` (world pos) that faces `leaderHeading`; returns the dog's speed this frame. */
  follow(dt: number, leader: THREE.Vector3, leaderHeading: number, leaderSpeed: number, groundY: (x: number, z: number) => number): number {
    const d = this.dog;
    const side = new THREE.Vector3(Math.cos(leaderHeading), 0, -Math.sin(leaderHeading));
    const back = new THREE.Vector3(-Math.sin(leaderHeading), 0, -Math.cos(leaderHeading));
    let target = leader.clone().addScaledVector(side, -0.9).addScaledVector(back, leaderSpeed > 0.5 ? 0.6 : -0.2);
    if (leaderSpeed < 0.3) {
      this.wanderT -= dt;
      if (this.wanderT <= 0) {
        this.wanderT = 3 + Math.random() * 4;
        this.wanderTo = Math.random() < 0.55 ? leader.clone().add(new THREE.Vector3((Math.random() - 0.5) * 4, 0, (Math.random() - 0.5) * 4)) : null;
      }
      if (this.wanderTo) target = this.wanderTo;
    } else this.wanderTo = null;
    const pos = d.root.position;
    const to = target.clone().sub(pos).setY(0);
    const dist = to.length();
    const want = dist > 0.35 ? Math.min(6.2, Math.max(leaderSpeed * 1.05, dist * 1.6)) : 0;
    const dir = dist > 1e-3 ? to.divideScalar(dist) : new THREE.Vector3();
    this.vel.lerp(dir.multiplyScalar(want), 1 - Math.exp(-6 * dt));
    pos.addScaledVector(this.vel, dt);
    pos.y = groundY(pos.x, pos.z);
    const sp = this.vel.length();
    if (sp > 0.2) this.heading = Math.atan2(this.vel.x, this.vel.z);
    d.root.rotation.y += angleDelta(d.root.rotation.y, this.heading) * (1 - Math.exp(-8 * dt));
    d.sniff += ((this.wanderTo && dist < 0.8 ? 1 : 0) - d.sniff) * (1 - Math.exp(-3 * dt));
    d.pose = 'stand';
    return sp;
  }
}

export function angleDelta(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
