/**
 * Particle & VFX system (GPU-instanced billboards, CPU simulated).
 *   const fx = new Fx(scene);
 *   fx.emit('fire', pos, { count: 30 });
 *   fx.ring(pos, { color: '#9b5cff', radius: 6 });
 *   fx.beam(a, b, { color: '#7fe3ff' });
 *   fx.update(dt, camera)   // every frame
 * Two layers: additive (magic, sparks, light) and alpha (smoke, dust, ink).
 */
import * as THREE from 'three';

type Tex = 0 | 1 | 2 | 3; // 0 soft dot, 1 star, 2 streak, 3 smoke puff

export interface EmitOpts {
  count?: number;
  color?: THREE.ColorRepresentation;
  color2?: THREE.ColorRepresentation;  // random blend target
  spread?: number;                     // position jitter radius
  speed?: number;                      // base speed
  dir?: THREE.Vector3;                 // bias direction (normalized)
  cone?: number;                       // 0..1 how much to follow dir (1 = strictly)
  size?: number;
  sizeEnd?: number;
  life?: number;
  gravity?: number;
  drag?: number;
  scale?: number;                      // global multiplier for size/spread/speed
  up?: number;                         // extra upward velocity
}

interface Preset extends Required<Pick<EmitOpts, 'count' | 'speed' | 'size' | 'life' | 'gravity' | 'drag'>> {
  color: string; color2?: string; tex: Tex; additive: boolean; spread: number; sizeEnd: number; up: number; cone?: number; spin?: number;
}

const PRESETS: Record<string, Preset> = {
  spark:     { count: 14, speed: 9, size: 0.18, sizeEnd: 0.02, life: 0.45, gravity: -14, drag: 1.5, color: '#fff2c0', color2: '#ffb347', tex: 2, additive: true, spread: 0.1, up: 2 },
  hit:       { count: 10, speed: 7, size: 0.3, sizeEnd: 0.02, life: 0.3, gravity: -6, drag: 3, color: '#ffffff', color2: '#ffe066', tex: 1, additive: true, spread: 0.2, up: 1 },
  magic:     { count: 18, speed: 3, size: 0.35, sizeEnd: 0.0, life: 0.8, gravity: 1.5, drag: 2, color: '#c7a2ff', color2: '#7fe3ff', tex: 1, additive: true, spread: 0.4, up: 1 },
  arcane:    { count: 22, speed: 5, size: 0.4, sizeEnd: 0.0, life: 0.6, gravity: 0, drag: 3, color: '#9b5cff', color2: '#e0c8ff', tex: 0, additive: true, spread: 0.3, up: 0.5 },
  fire:      { count: 26, speed: 3.5, size: 0.7, sizeEnd: 0.1, life: 0.7, gravity: 5, drag: 2, color: '#ffcf5a', color2: '#ff4a1a', tex: 0, additive: true, spread: 0.5, up: 2 },
  ice:       { count: 22, speed: 5, size: 0.35, sizeEnd: 0.05, life: 0.8, gravity: -8, drag: 1.5, color: '#dff8ff', color2: '#6fd0ff', tex: 1, additive: true, spread: 0.4, up: 2 },
  lightning: { count: 16, speed: 12, size: 0.25, sizeEnd: 0.02, life: 0.25, gravity: 0, drag: 4, color: '#ffffff', color2: '#9fe3ff', tex: 2, additive: true, spread: 0.2, up: 0 },
  light:     { count: 24, speed: 4, size: 0.5, sizeEnd: 0.0, life: 0.9, gravity: 2, drag: 2, color: '#fff7d6', color2: '#ffd36b', tex: 1, additive: true, spread: 0.5, up: 1.5 },
  shadow:    { count: 22, speed: 2.5, size: 0.9, sizeEnd: 1.6, life: 0.9, gravity: 1, drag: 2, color: '#1a0b2e', color2: '#4b2a86', tex: 3, additive: false, spread: 0.6, up: 1 },
  mind:      { count: 18, speed: 2.5, size: 0.4, sizeEnd: 0.0, life: 1.0, gravity: 1.5, drag: 1.5, color: '#ff7bf0', color2: '#9b5cff', tex: 1, additive: true, spread: 0.5, up: 1.5 },
  poison:    { count: 20, speed: 2, size: 0.6, sizeEnd: 1.0, life: 1.0, gravity: 1, drag: 2, color: '#8dff5a', color2: '#3a9a2a', tex: 3, additive: false, spread: 0.6, up: 0.8 },
  nature:    { count: 18, speed: 3, size: 0.3, sizeEnd: 0.1, life: 1.1, gravity: -2, drag: 1.5, color: '#9dff7a', color2: '#ffe38a', tex: 1, additive: true, spread: 0.5, up: 2 },
  ink:       { count: 12, speed: 6, size: 0.35, sizeEnd: 0.1, life: 0.6, gravity: -16, drag: 1, color: '#2a1244', color2: '#6a2a8a', tex: 0, additive: false, spread: 0.2, up: 3 },
  smoke:     { count: 14, speed: 1.5, size: 1.0, sizeEnd: 2.4, life: 1.4, gravity: 1.2, drag: 1.2, color: '#b8b0c8', color2: '#6a6280', tex: 3, additive: false, spread: 0.6, up: 1 },
  dust:      { count: 14, speed: 3, size: 0.6, sizeEnd: 1.6, life: 0.9, gravity: 0.5, drag: 3, color: '#d9c9a8', color2: '#9e8e70', tex: 3, additive: false, spread: 0.5, up: 0.8 },
  explosion: { count: 40, speed: 11, size: 1.1, sizeEnd: 0.2, life: 0.6, gravity: 2, drag: 3.5, color: '#ffe8a0', color2: '#ff5a1a', tex: 0, additive: true, spread: 0.5, up: 3 },
  coins:     { count: 16, speed: 6, size: 0.28, sizeEnd: 0.22, life: 1.0, gravity: -18, drag: 0.5, color: '#ffe066', color2: '#ffb700', tex: 1, additive: true, spread: 0.2, up: 7 },
  essence:   { count: 14, speed: 2, size: 0.3, sizeEnd: 0.0, life: 1.2, gravity: 3, drag: 1, color: '#e0a8ff', color2: '#9b5cff', tex: 1, additive: true, spread: 0.6, up: 2 },
  heal:      { count: 16, speed: 1.5, size: 0.35, sizeEnd: 0.0, life: 1.0, gravity: 3, drag: 1, color: '#9dffb8', color2: '#eaffc8', tex: 1, additive: true, spread: 0.6, up: 2 },
  stars:     { count: 12, speed: 4, size: 0.4, sizeEnd: 0.0, life: 0.7, gravity: -4, drag: 2, color: '#fff7c2', color2: '#ffffff', tex: 1, additive: true, spread: 0.2, up: 3, spin: 6 },
  leaves:    { count: 10, speed: 2, size: 0.25, sizeEnd: 0.25, life: 2.2, gravity: -1.5, drag: 1, color: '#9ccf5a', color2: '#e0b24a', tex: 0, additive: false, spread: 1.5, up: 0.5, spin: 3 },
  confetti:  { count: 40, speed: 9, size: 0.22, sizeEnd: 0.2, life: 1.8, gravity: -9, drag: 1.2, color: '#ff4fa3', color2: '#4fd8ff', tex: 0, additive: false, spread: 0.4, up: 8, spin: 8 },
  blood:     { count: 10, speed: 5, size: 0.3, sizeEnd: 0.05, life: 0.5, gravity: -16, drag: 1, color: '#5a1a3a', color2: '#9b2a4a', tex: 0, additive: false, spread: 0.2, up: 2 },
  earth:     { count: 18, speed: 7, size: 0.45, sizeEnd: 0.2, life: 0.8, gravity: -20, drag: 1, color: '#9e8163', color2: '#5f4a38', tex: 3, additive: false, spread: 0.4, up: 6 },
  time:      { count: 18, speed: 2, size: 0.4, sizeEnd: 0.0, life: 1.0, gravity: 0, drag: 1, color: '#ffe8b0', color2: '#8ad7ff', tex: 2, additive: true, spread: 0.8, up: 0.5 },
  luck:      { count: 18, speed: 4, size: 0.35, sizeEnd: 0.0, life: 0.9, gravity: -4, drag: 1.5, color: '#7dffb0', color2: '#ffe066', tex: 1, additive: true, spread: 0.4, up: 3 },
};

export type FxPreset = keyof typeof PRESETS;
export const FX_PRESETS = Object.keys(PRESETS);

function makeAtlas(): THREE.CanvasTexture {
  const S = 64;
  const c = document.createElement('canvas');
  c.width = S * 4; c.height = S;
  const g = c.getContext('2d')!;
  // 0: soft dot
  let grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.35, 'rgba(255,255,255,0.8)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, S, S);
  // 1: 4-point anime sparkle
  g.save(); g.translate(S * 1.5, S / 2);
  grd = g.createRadialGradient(0, 0, 0, 0, 0, S / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.2, 'rgba(255,255,255,0.9)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const r = i % 2 === 0 ? S * 0.5 : S * 0.1;
    g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  g.closePath(); g.fill(); g.restore();
  // 2: streak
  grd = g.createLinearGradient(S * 2, 0, S * 3, 0);
  grd.addColorStop(0, 'rgba(255,255,255,0)'); grd.addColorStop(0.5, 'rgba(255,255,255,1)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(S * 2, S * 0.42, S, S * 0.16);
  // 3: smoke puff (lumpy)
  for (let i = 0; i < 7; i++) {
    const x = S * 3.5 + (Math.random() - 0.5) * S * 0.35, y = S / 2 + (Math.random() - 0.5) * S * 0.35, r = S * (0.2 + Math.random() * 0.14);
    grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, 'rgba(255,255,255,0.75)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

class ParticleLayer {
  readonly mesh: THREE.Mesh;
  readonly max: number;
  count = 0;
  // simulation arrays
  private p: Float32Array; private v: Float32Array; private life: Float32Array; private maxLife: Float32Array;
  private s0: Float32Array; private s1: Float32Array; private col: Float32Array; private rot: Float32Array; private rotV: Float32Array;
  private grav: Float32Array; private drag: Float32Array; private tex: Float32Array;
  // gpu attrs
  private aPos: THREE.InstancedBufferAttribute; private aCol: THREE.InstancedBufferAttribute; private aSize: THREE.InstancedBufferAttribute;
  private aRot: THREE.InstancedBufferAttribute; private aTex: THREE.InstancedBufferAttribute;
  private geo: THREE.InstancedBufferGeometry;

  constructor(max: number, atlas: THREE.Texture, additive: boolean) {
    this.max = max;
    this.p = new Float32Array(max * 3); this.v = new Float32Array(max * 3); this.life = new Float32Array(max); this.maxLife = new Float32Array(max);
    this.s0 = new Float32Array(max); this.s1 = new Float32Array(max); this.col = new Float32Array(max * 4); this.rot = new Float32Array(max); this.rotV = new Float32Array(max);
    this.grav = new Float32Array(max); this.drag = new Float32Array(max); this.tex = new Float32Array(max);
    const base = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute('position', base.getAttribute('position'));
    geo.setAttribute('uv', base.getAttribute('uv'));
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.InstancedBufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage);
    this.aRot = new THREE.InstancedBufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage);
    this.aTex = new THREE.InstancedBufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iPos', this.aPos); geo.setAttribute('iCol', this.aCol); geo.setAttribute('iSize', this.aSize);
    geo.setAttribute('iRot', this.aRot); geo.setAttribute('iTex', this.aTex);
    geo.instanceCount = 0;
    this.geo = geo;
    const mat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: atlas }, uBoost: { value: additive ? 2.2 : 1.0 } },
      vertexShader: /* glsl */ `
        attribute vec3 iPos; attribute vec4 iCol; attribute float iSize; attribute float iRot; attribute float iTex;
        varying vec2 vUv; varying vec4 vCol;
        void main() {
          vec4 mv = viewMatrix * vec4(iPos, 1.0);
          float c = cos(iRot), s = sin(iRot);
          vec2 q = mat2(c, -s, s, c) * position.xy * iSize;
          mv.xy += q;
          gl_Position = projectionMatrix * mv;
          vUv = vec2((uv.x + iTex) / 4.0, uv.y);
          vCol = iCol;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap; uniform float uBoost;
        varying vec2 vUv; varying vec4 vCol;
        void main() {
          vec4 t = texture2D(uMap, vUv);
          float a = t.a * vCol.a;
          if (a < 0.01) discard;
          gl_FragColor = vec4(vCol.rgb * uBoost, a);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = additive ? 20 : 10;
  }

  spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, s0: number, s1: number, r: number, g: number, b: number, a: number, grav: number, drag: number, tex: number, rotV: number): void {
    if (this.count >= this.max) return;
    const i = this.count++;
    this.p[i * 3] = x; this.p[i * 3 + 1] = y; this.p[i * 3 + 2] = z;
    this.v[i * 3] = vx; this.v[i * 3 + 1] = vy; this.v[i * 3 + 2] = vz;
    this.life[i] = life; this.maxLife[i] = life; this.s0[i] = s0; this.s1[i] = s1;
    this.col[i * 4] = r; this.col[i * 4 + 1] = g; this.col[i * 4 + 2] = b; this.col[i * 4 + 3] = a;
    this.rot[i] = Math.random() * Math.PI * 2; this.rotV[i] = rotV; this.grav[i] = grav; this.drag[i] = drag; this.tex[i] = tex;
  }

  update(dt: number): void {
    let i = 0;
    const P = this.aPos.array as Float32Array, C = this.aCol.array as Float32Array, S = this.aSize.array as Float32Array, R = this.aRot.array as Float32Array, T = this.aTex.array as Float32Array;
    while (i < this.count) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        // swap-remove
        const last = --this.count;
        if (i !== last) this.copy(last, i);
        continue;
      }
      const k = 1 - this.life[i] / this.maxLife[i];
      const d = Math.exp(-this.drag[i] * dt);
      this.v[i * 3] *= d; this.v[i * 3 + 1] = this.v[i * 3 + 1] * d + this.grav[i] * dt; this.v[i * 3 + 2] *= d;
      this.p[i * 3] += this.v[i * 3] * dt; this.p[i * 3 + 1] += this.v[i * 3 + 1] * dt; this.p[i * 3 + 2] += this.v[i * 3 + 2] * dt;
      this.rot[i] += this.rotV[i] * dt;
      P[i * 3] = this.p[i * 3]; P[i * 3 + 1] = this.p[i * 3 + 1]; P[i * 3 + 2] = this.p[i * 3 + 2];
      C[i * 4] = this.col[i * 4]; C[i * 4 + 1] = this.col[i * 4 + 1]; C[i * 4 + 2] = this.col[i * 4 + 2];
      C[i * 4 + 3] = this.col[i * 4 + 3] * (k < 0.1 ? k / 0.1 : 1 - Math.max(0, (k - 0.55) / 0.45));
      S[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * k;
      R[i] = this.rot[i]; T[i] = this.tex[i];
      i++;
    }
    this.geo.instanceCount = this.count;
    this.aPos.needsUpdate = true; this.aCol.needsUpdate = true; this.aSize.needsUpdate = true; this.aRot.needsUpdate = true; this.aTex.needsUpdate = true;
    this.aPos.addUpdateRange(0, this.count * 3); this.aCol.addUpdateRange(0, this.count * 4);
    this.aSize.addUpdateRange(0, this.count); this.aRot.addUpdateRange(0, this.count); this.aTex.addUpdateRange(0, this.count);
  }

  private copy(from: number, to: number): void {
    for (let k = 0; k < 3; k++) { this.p[to * 3 + k] = this.p[from * 3 + k]; this.v[to * 3 + k] = this.v[from * 3 + k]; }
    for (let k = 0; k < 4; k++) this.col[to * 4 + k] = this.col[from * 4 + k];
    this.life[to] = this.life[from]; this.maxLife[to] = this.maxLife[from]; this.s0[to] = this.s0[from]; this.s1[to] = this.s1[from];
    this.rot[to] = this.rot[from]; this.rotV[to] = this.rotV[from]; this.grav[to] = this.grav[from]; this.drag[to] = this.drag[from]; this.tex[to] = this.tex[from];
  }

  clear(): void { this.count = 0; this.geo.instanceCount = 0; }
}

interface Timed { obj: THREE.Mesh; t: number; dur: number; kind: 'ring' | 'beam' | 'flash'; r0: number; r1: number; mat: THREE.MeshBasicMaterial; op: number }

const tmpC = new THREE.Color(), tmpC2 = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

export class Fx {
  readonly root = new THREE.Group();
  private add: ParticleLayer;
  private alpha: ParticleLayer;
  private timed: Timed[] = [];
  private ringGeo = new THREE.RingGeometry(0.82, 1, 48, 1);
  private beamGeo = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.5);
  private flashGeo = new THREE.SphereGeometry(1, 16, 12);
  /** Global multiplier (settings / low quality). */
  density = 1;

  constructor(private scene: THREE.Scene, max = 6000) {
    const atlas = makeAtlas();
    this.add = new ParticleLayer(max, atlas, true);
    this.alpha = new ParticleLayer(Math.floor(max / 2), atlas, false);
    this.root.add(this.alpha.mesh, this.add.mesh);
    scene.add(this.root);
  }

  emit(preset: FxPreset | string, pos: THREE.Vector3, o: EmitOpts = {}): void {
    const p = PRESETS[preset] ?? PRESETS.magic;
    const scale = o.scale ?? 1;
    const count = Math.max(1, Math.round((o.count ?? p.count) * this.density));
    const layer = p.additive ? this.add : this.alpha;
    tmpC.set(o.color ?? p.color);
    tmpC2.set(o.color2 ?? p.color2 ?? p.color);
    const speed = (o.speed ?? p.speed) * scale;
    const spread = (o.spread ?? p.spread) * scale;
    const size = (o.size ?? p.size) * scale;
    const sizeEnd = (o.sizeEnd ?? p.sizeEnd) * scale;
    const life = o.life ?? p.life;
    const up = (o.up ?? p.up) * scale;
    const cone = o.cone ?? p.cone ?? 0;
    for (let i = 0; i < count; i++) {
      // random direction on sphere
      let dx = Math.random() * 2 - 1, dy = Math.random() * 2 - 1, dz = Math.random() * 2 - 1;
      const l = Math.hypot(dx, dy, dz) || 1;
      dx /= l; dy /= l; dz /= l;
      if (o.dir) { dx = dx * (1 - cone) + o.dir.x * (cone || 0.6); dy = dy * (1 - cone) + o.dir.y * (cone || 0.6); dz = dz * (1 - cone) + o.dir.z * (cone || 0.6); }
      const sp = speed * (0.4 + Math.random() * 0.8);
      const t = Math.random();
      const r = tmpC.r + (tmpC2.r - tmpC.r) * t, g = tmpC.g + (tmpC2.g - tmpC.g) * t, b = tmpC.b + (tmpC2.b - tmpC.b) * t;
      layer.spawn(
        pos.x + (Math.random() - 0.5) * 2 * spread, pos.y + (Math.random() - 0.5) * 2 * spread, pos.z + (Math.random() - 0.5) * 2 * spread,
        dx * sp, dy * sp + up * (0.5 + Math.random()), dz * sp,
        life * (0.6 + Math.random() * 0.7), size * (0.7 + Math.random() * 0.6), sizeEnd,
        r, g, b, 1, o.gravity ?? p.gravity, o.drag ?? p.drag, p.tex, (p.spin ?? 1.5) * (Math.random() - 0.5) * 2,
      );
    }
  }

  /** Expanding ground ring (shockwave). */
  ring(pos: THREE.Vector3, o: { color?: THREE.ColorRepresentation; radius?: number; duration?: number; from?: number; intensity?: number; vertical?: boolean } = {}): void {
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(o.color ?? '#c7a2ff').multiplyScalar(o.intensity ?? 2.2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    const m = new THREE.Mesh(this.ringGeo, mat);
    m.position.copy(pos); m.position.y += 0.08;
    if (!o.vertical) m.rotation.x = -Math.PI / 2;
    this.root.add(m);
    this.timed.push({ obj: m, t: 0, dur: o.duration ?? 0.45, kind: 'ring', r0: o.from ?? 0.3, r1: o.radius ?? 5, mat, op: 1 });
  }

  /** Energy beam between two points. */
  beam(a: THREE.Vector3, b: THREE.Vector3, o: { color?: THREE.ColorRepresentation; width?: number; duration?: number; intensity?: number } = {}): void {
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(o.color ?? '#7fe3ff').multiplyScalar(o.intensity ?? 2.5), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    const m = new THREE.Mesh(this.beamGeo, mat);
    m.position.copy(a);
    m.lookAt(b);
    const w = o.width ?? 0.18;
    m.scale.set(w, w, a.distanceTo(b));
    this.root.add(m);
    this.timed.push({ obj: m, t: 0, dur: o.duration ?? 0.25, kind: 'beam', r0: w, r1: 0, mat, op: 1 });
  }

  /** Bright expanding sphere flash (explosions, blinks). */
  flash(pos: THREE.Vector3, o: { color?: THREE.ColorRepresentation; radius?: number; duration?: number; intensity?: number } = {}): void {
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(o.color ?? '#ffffff').multiplyScalar(o.intensity ?? 3), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    const m = new THREE.Mesh(this.flashGeo, mat);
    m.position.copy(pos);
    this.root.add(m);
    this.timed.push({ obj: m, t: 0, dur: o.duration ?? 0.3, kind: 'flash', r0: 0.2, r1: o.radius ?? 2, mat, op: 1 });
  }

  /** Lightning bolt: jagged beam made of segments. */
  bolt(a: THREE.Vector3, b: THREE.Vector3, o: { color?: THREE.ColorRepresentation; segments?: number; jitter?: number; width?: number; duration?: number } = {}): void {
    const n = o.segments ?? 7;
    const jit = o.jitter ?? a.distanceTo(b) * 0.08;
    let prev = a.clone();
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const p = a.clone().lerp(b, t);
      if (i < n) p.add(new THREE.Vector3((Math.random() - 0.5) * jit, (Math.random() - 0.5) * jit, (Math.random() - 0.5) * jit));
      this.beam(prev, p, { color: o.color ?? '#bfe8ff', width: o.width ?? 0.08, duration: o.duration ?? 0.18, intensity: 3 });
      prev = p;
    }
  }

  update(dt: number): void {
    this.add.update(dt);
    this.alpha.update(dt);
    for (let i = this.timed.length - 1; i >= 0; i--) {
      const e = this.timed[i];
      e.t += dt;
      const k = Math.min(1, e.t / e.dur);
      if (e.kind === 'ring') {
        const ease = 1 - Math.pow(1 - k, 3);
        e.obj.scale.setScalar(e.r0 + (e.r1 - e.r0) * ease);
        e.mat.opacity = 1 - k;
      } else if (e.kind === 'beam') {
        const w = e.r0 * (1 - k * 0.8);
        e.obj.scale.x = w; e.obj.scale.y = w;
        e.mat.opacity = 1 - k;
      } else {
        e.obj.scale.setScalar(e.r0 + (e.r1 - e.r0) * (1 - Math.pow(1 - k, 2)));
        e.mat.opacity = 1 - k;
      }
      if (k >= 1) {
        this.root.remove(e.obj);
        e.mat.dispose();
        this.timed.splice(i, 1);
      }
    }
  }

  clear(): void {
    this.add.clear(); this.alpha.clear();
    for (const e of this.timed) { this.root.remove(e.obj); e.mat.dispose(); }
    this.timed.length = 0;
  }

  dispose(): void {
    this.clear();
    this.scene.remove(this.root);
  }
}

export { UP };
