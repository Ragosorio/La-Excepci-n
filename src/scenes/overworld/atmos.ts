/**
 * Atmosphere of the diorama: drifting toon clouds (with shadows), regional weather (rain over Sylvaria,
 * ash & embers over Kharaz, violet fog over Morvenna), fireflies at night, flocks of birds by day.
 * Everything is instanced / shader-animated (a few draw calls, no per-frame allocations).
 */
import * as THREE from 'three';
import { CONTINENTS } from '../../data/world';
import { MAP_MAX, MAP_MIN, heightAt } from '../../systems/world/geo';
import { toon } from '../../render/toon';

// ───────────────────────── clouds ─────────────────────────

export class Clouds {
  readonly mesh: THREE.InstancedMesh;
  private base: Array<{ x: number; y: number; z: number; s: number; sp: number }> = [];
  private offs: Array<{ dx: number; dy: number; dz: number; s: number; cloud: number }> = [];
  private m = new THREE.Matrix4();
  private v = new THREE.Vector3();
  private sc = new THREE.Vector3();
  private q = new THREE.Quaternion();
  private mat: THREE.MeshToonMaterial;
  readonly uFade = { value: 1 };
  drift = 0;

  constructor(count = 16) {
    const puffs: typeof this.offs = [];
    for (let c = 0; c < count; c++) {
      this.base.push({
        x: MAP_MIN + Math.random() * (MAP_MAX - MAP_MIN), y: 22 + Math.random() * 8, z: MAP_MIN + Math.random() * (MAP_MAX - MAP_MIN),
        s: 2.6 + Math.random() * 3.2, sp: 0.6 + Math.random() * 0.8,
      });
      const n = 5 + (c % 4);
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1) - 0.5;
        puffs.push({ dx: t * 3.6 + (Math.random() - 0.5) * 0.6, dy: Math.random() * 0.6 + (1 - Math.abs(t) * 2) * 0.7, dz: (Math.random() - 0.5) * 1.4, s: 0.8 + (1 - Math.abs(t) * 1.6) * 0.8 + Math.random() * 0.3, cloud: c });
      }
    }
    this.offs = puffs;
    this.mat = toon('#ffffff', { bands: [0.72, 0.88, 1.0], emissive: '#40405a', emissiveIntensity: 0.3, transparent: true, unique: true, depthWrite: false });
    const uFade = this.uFade;
    this.mat.onBeforeCompile = (sh) => {
      sh.uniforms.uCloudFade = uFade;
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uCloudFade;')
        .replace('#include <opaque_fragment>', `
        diffuseColor.a *= smoothstep(70.0, 125.0, length(vViewPosition)) * 0.8 * uCloudFade;
        #include <opaque_fragment>`);
    };
    this.mat.customProgramCacheKey = () => 'lx-clouds';
    this.mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 2), this.mat, puffs.length);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.castShadow = false;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
    this.update(0, 0, new THREE.Color('#ffffff'), new THREE.Color('#9a90c0'));
  }

  update(dt: number, wind: number, lit: THREE.Color, shade: THREE.Color, fade = 1): void {
    this.uFade.value = fade;
    this.drift += dt * wind;
    const span = MAP_MAX - MAP_MIN + 80;
    for (let i = 0; i < this.offs.length; i++) {
      const o = this.offs[i];
      const b = this.base[o.cloud];
      let x = b.x + this.drift * b.sp;
      x = ((x - MAP_MIN + 40) % span + span) % span + MAP_MIN - 40;
      this.v.set(x + o.dx * b.s, b.y + o.dy * b.s * 0.7, b.z + o.dz * b.s);
      this.sc.set(o.s * b.s, o.s * b.s * 0.72, o.s * b.s);
      this.m.compose(this.v, this.q, this.sc);
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mat.color.copy(lit);
    this.mat.emissive.copy(shade).multiplyScalar(0.35);
  }
}

// ───────────────────────── weather ─────────────────────────

const REGION = (id: 'sylvaria' | 'kharaz' | 'morvenna') => {
  const c = CONTINENTS[id];
  return new THREE.Vector4(c.center.x, c.center.z, c.radius * 1.05, 0);
};

export class Weather {
  readonly group = new THREE.Group();
  private rainMat: THREE.ShaderMaterial;
  private ashMat: THREE.ShaderMaterial;
  private fogMat: THREE.ShaderMaterial;
  private flyMat: THREE.ShaderMaterial;

  constructor() {
    // Rain: world-anchored streaks around the focus, masked to Sylvaria (or everywhere in storms)
    const N = 1800;
    const seed = new Float32Array(N * 2 * 3), end = new Float32Array(N * 2);
    for (let i = 0; i < N; i++) {
      const a = Math.random(), b = Math.random(), c = Math.random();
      for (let k = 0; k < 2; k++) { seed.set([a, b, c], (i * 2 + k) * 3); end[i * 2 + k] = k; }
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 2 * 3), 3));
    rg.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3));
    rg.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
    this.rainMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uTime: { value: 0 }, uFocus: { value: new THREE.Vector3() }, uRegion: { value: REGION('sylvaria') }, uRain: { value: 0 }, uStorm: { value: 0 } },
      vertexShader: /* glsl */ `
        attribute vec3 aSeed; attribute float aEnd;
        uniform float uTime, uRain, uStorm; uniform vec3 uFocus; uniform vec4 uRegion;
        varying float vA;
        void main() {
          float W = 70.0, H = 26.0;
          float x = uFocus.x + (fract(aSeed.x - uFocus.x / W) - 0.5) * W;
          float z = uFocus.z + (fract(aSeed.z - uFocus.z / W) - 0.5) * W;
          float y = mod(aSeed.y * H - uTime * (22.0 + aSeed.x * 6.0), H) - 2.0;
          y -= aEnd * 1.1;
          x -= aEnd * 0.35;
          float d = length(vec2(x, z) - uRegion.xy) / uRegion.z;
          vA = max(uRain * (1.0 - smoothstep(0.75, 1.05, d)), uStorm * 0.8) * (0.35 + 0.35 * aSeed.y);
          gl_Position = projectionMatrix * viewMatrix * vec4(x, y, z, 1.0);
        }`,
      fragmentShader: /* glsl */ `varying float vA; void main() { gl_FragColor = vec4(0.72, 0.82, 1.0, vA); }`,
    });
    const rain = new THREE.LineSegments(rg, this.rainMat);
    rain.frustumCulled = false; rain.renderOrder = 8;
    this.group.add(rain);

    // Ash & embers over Kharaz
    const A = 900;
    const as = new Float32Array(A * 3);
    for (let i = 0; i < A * 3; i++) as[i] = Math.random();
    const ag = new THREE.BufferGeometry();
    ag.setAttribute('position', new THREE.BufferAttribute(new Float32Array(A * 3), 3));
    ag.setAttribute('aSeed', new THREE.BufferAttribute(as, 3));
    this.ashMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uFocus: { value: new THREE.Vector3() }, uRegion: { value: REGION('kharaz') }, uAsh: { value: 0 }, uScale: { value: 400 } },
      vertexShader: /* glsl */ `
        attribute vec3 aSeed; uniform float uTime, uAsh, uScale; uniform vec3 uFocus; uniform vec4 uRegion;
        varying float vA; varying float vEmber;
        void main() {
          float W = 70.0, H = 22.0;
          float x = uFocus.x + (fract(aSeed.x - uFocus.x / W + sin(uTime * 0.2 + aSeed.y * 9.0) * 0.01) - 0.5) * W;
          float z = uFocus.z + (fract(aSeed.z - uFocus.z / W) - 0.5) * W;
          vEmber = step(0.78, aSeed.y);
          float y = vEmber > 0.5 ? mod(aSeed.y * H + uTime * 1.6, H) : mod(aSeed.y * H - uTime * 1.2, H);
          float d = length(vec2(x, z) - uRegion.xy) / uRegion.z;
          vA = uAsh * (1.0 - smoothstep(0.7, 1.0, d)) * (0.5 + 0.5 * sin(uTime * 3.0 + aSeed.x * 40.0));
          vec4 mv = viewMatrix * vec4(x, y, z, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = (vEmber > 0.5 ? 0.35 : 0.5) * uScale / -mv.z;
        }`,
      fragmentShader: /* glsl */ `
        varying float vA; varying float vEmber;
        void main() {
          float r = length(gl_PointCoord - 0.5); float a = (1.0 - smoothstep(0.1, 0.5, r)) * vA;
          vec3 c = vEmber > 0.5 ? vec3(2.2, 0.8, 0.2) : vec3(0.38, 0.34, 0.33);
          gl_FragColor = vec4(c * a, a);
        }`,
    });
    const ash = new THREE.Points(ag, this.ashMat);
    ash.frustumCulled = false; ash.renderOrder = 8;
    this.group.add(ash);

    // Fog banks over Morvenna (fixed in the world, slow drift)
    const F = 90;
    const fp = new Float32Array(F * 3), fs = new Float32Array(F);
    const mc = CONTINENTS.morvenna;
    for (let i = 0; i < F; i++) {
      const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * mc.radius * 1.05;
      const x = mc.center.x + Math.cos(a) * d, z = mc.center.z + Math.sin(a) * d;
      fp[i * 3] = x; fp[i * 3 + 1] = Math.max(0, heightAt(x, z)) + 0.8 + Math.random() * 1.4; fp[i * 3 + 2] = z;
      fs[i] = Math.random();
    }
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.BufferAttribute(fp, 3));
    fg.setAttribute('aSeed', new THREE.BufferAttribute(fs, 1));
    this.fogMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uTime: { value: 0 }, uFog: { value: 0 }, uScale: { value: 400 }, uCol: { value: new THREE.Color('#8a7aa8') } },
      vertexShader: /* glsl */ `
        attribute float aSeed; uniform float uTime, uFog, uScale;
        varying float vA;
        void main() {
          vec3 p = position;
          p.x += sin(uTime * 0.07 + aSeed * 20.0) * 2.5;
          p.z += cos(uTime * 0.05 + aSeed * 13.0) * 2.0;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          vA = uFog * (0.26 + 0.12 * sin(uTime * 0.3 + aSeed * 30.0)) * smoothstep(10.0, 26.0, -mv.z);
          gl_PointSize = min(280.0, (10.0 + aSeed * 7.0) * uScale / -mv.z);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uCol; varying float vA;
        void main() { float r = length(gl_PointCoord - 0.5); float a = (1.0 - smoothstep(0.0, 0.5, r)); gl_FragColor = vec4(uCol, a * a * vA); }`,
    });
    const fog = new THREE.Points(fg, this.fogMat);
    fog.frustumCulled = false; fog.renderOrder = 9;
    this.group.add(fog);

    // Fireflies (Sylvaria + Morvenna swamps), fixed in the world
    const L = 420;
    const lp = new Float32Array(L * 3), ls = new Float32Array(L);
    const sy = CONTINENTS.sylvaria;
    for (let i = 0; i < L; i++) {
      const c = i < L * 0.65 ? sy : mc;
      const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * c.radius;
      const x = c.center.x + Math.cos(a) * d, z = c.center.z + Math.sin(a) * d;
      lp[i * 3] = x; lp[i * 3 + 1] = Math.max(0, heightAt(x, z)) + 0.4 + Math.random() * 1.8; lp[i * 3 + 2] = z;
      ls[i] = Math.random();
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(lp, 3));
    lg.setAttribute('aSeed', new THREE.BufferAttribute(ls, 1));
    this.flyMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uNight: { value: 0 }, uScale: { value: 400 } },
      vertexShader: /* glsl */ `
        attribute float aSeed; uniform float uTime, uNight, uScale; varying float vA;
        void main() {
          vec3 p = position;
          p.x += sin(uTime * 0.6 + aSeed * 30.0) * 0.8; p.z += cos(uTime * 0.5 + aSeed * 17.0) * 0.8; p.y += sin(uTime * 1.3 + aSeed * 9.0) * 0.3;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          vA = uNight * smoothstep(0.2, 1.0, sin(uTime * 2.2 + aSeed * 50.0) * 0.5 + 0.5);
          gl_PointSize = 0.45 * uScale / -mv.z;
        }`,
      fragmentShader: /* glsl */ `varying float vA; void main() { float r = length(gl_PointCoord - 0.5); float a = (1.0 - smoothstep(0.0, 0.5, r)); a = a * a * vA; gl_FragColor = vec4(vec3(1.6, 2.2, 0.6) * a, a); }`,
    });
    const flies = new THREE.Points(lg, this.flyMat);
    flies.frustumCulled = false; flies.renderOrder = 9;
    this.group.add(flies);
  }

  update(time: number, focus: THREE.Vector3, w: { rain: number; ash: number; fog: number; storm: number }, night: number, viewportH: number): void {
    const u = this.rainMat.uniforms;
    u.uTime.value = time; u.uFocus.value.copy(focus); u.uRain.value = w.rain; u.uStorm.value = w.storm > 0.6 ? (w.storm - 0.6) * 1.5 : 0;
    const a = this.ashMat.uniforms;
    a.uTime.value = time; a.uFocus.value.copy(focus); a.uAsh.value = 0.35 + w.ash * 0.65; a.uScale.value = viewportH;
    const f = this.fogMat.uniforms;
    f.uTime.value = time; f.uFog.value = 0.45 + w.fog * 0.55; f.uScale.value = viewportH;
    (f.uCol.value as THREE.Color).setRGB(0.54 - night * 0.3, 0.48 - night * 0.28, 0.66 - night * 0.3);
    const l = this.flyMat.uniforms;
    l.uTime.value = time; l.uNight.value = night; l.uScale.value = viewportH;
  }
}

// ───────────────────────── birds ─────────────────────────

export class Birds {
  readonly mesh: THREE.InstancedMesh;
  private flocks: Array<{ cx: number; cz: number; r: number; a: number; sp: number; y: number }> = [];
  private per = 7;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3(1, 1, 1);

  constructor() {
    const g = new THREE.BufferGeometry();
    // a little "V" (two wings)
    const verts = new Float32Array([0, 0, 0.12, -0.45, 0.12, -0.1, 0, 0, -0.1, 0, 0, 0.12, 0.45, 0.12, -0.1, 0, 0, -0.1]);
    g.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    g.computeVertexNormals();
    const spots: Array<[number, number]> = [[-60, 12], [-40, 0], [8, 62], [-10, 72], [2, 4], [-30, -50]];
    for (const [x, z] of spots) this.flocks.push({ cx: x, cz: z, r: 10 + Math.random() * 10, a: Math.random() * 6, sp: 0.18 + Math.random() * 0.12, y: 9 + Math.random() * 5 });
    this.mesh = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ color: '#2a2230', side: THREE.DoubleSide }), this.flocks.length * this.per);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
  }

  update(dt: number, time: number, visible: boolean): void {
    this.mesh.visible = visible;
    if (!visible) return;
    let k = 0;
    for (const f of this.flocks) {
      f.a += dt * f.sp;
      const hx = f.cx + Math.cos(f.a) * f.r, hz = f.cz + Math.sin(f.a) * f.r;
      const yaw = -f.a;
      for (let i = 0; i < this.per; i++) {
        const row = Math.ceil(i / 2), side = i % 2 ? 1 : -1;
        const flap = Math.sin(time * 9 + i * 1.3) * 0.5;
        const lx = side * row * 0.7, lz = -row * 0.7;
        const c = Math.cos(yaw), s = Math.sin(yaw);
        this.v.set(hx + lx * c + lz * s, f.y + Math.sin(time * 1.3 + i) * 0.3, hz - lx * s + lz * c);
        this.e.set(0, yaw + Math.PI / 2, flap * 0.4);
        this.q.setFromEuler(this.e);
        this.s.set(1, 1 + flap, 1);
        this.m.compose(this.v, this.q, this.s);
        this.mesh.setMatrixAt(k++, this.m);
      }
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
