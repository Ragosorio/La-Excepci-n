/**
 * Anime sky: gradient dome with sun/moon/stars + puffy toon clouds + matching lights & fog.
 *   const sky = new Sky(scene); sky.setTime(0.3); sky.update(dt, camera);
 * time: 0 = midnight, 0.25 = dawn, 0.5 = noon, 0.75 = dusk.
 * Scenes can force a mood with sky.setOverride({...}) (e.g. the prologue's sudden night).
 */
import * as THREE from 'three';
import { toon } from './toon';

interface SkyKey { t: number; top: string; mid: string; horizon: string; sun: string; sunI: number; amb: string; ambI: number; fog: string; stars: number }

const KEYS: SkyKey[] = [
  { t: 0.0, top: '#070514', mid: '#130c2c', horizon: '#2b1c4f', sun: '#8fa6ff', sunI: 0.35, amb: '#3a3470', ambI: 0.55, fog: '#1a1636', stars: 1 },
  { t: 0.2, top: '#0f0b2a', mid: '#2d2155', horizon: '#6b4a7a', sun: '#b5a8ff', sunI: 0.4, amb: '#4a3f7a', ambI: 0.6, fog: '#3a2d58', stars: 0.6 },
  { t: 0.27, top: '#3a4f9a', mid: '#e28ba0', horizon: '#ffcf8a', sun: '#ffb070', sunI: 1.4, amb: '#b9a0c8', ambI: 0.75, fog: '#e8b9a8', stars: 0 },
  { t: 0.36, top: '#3f86e0', mid: '#8cc2f2', horizon: '#dff1ff', sun: '#fff1d6', sunI: 2.2, amb: '#c8dcff', ambI: 0.95, fog: '#cfe6ff', stars: 0 },
  { t: 0.5, top: '#2f78dc', mid: '#7fbaf0', horizon: '#e4f4ff', sun: '#ffffff', sunI: 2.6, amb: '#d4e4ff', ambI: 1.0, fog: '#d6eaff', stars: 0 },
  { t: 0.66, top: '#3a74c9', mid: '#9fb8e0', horizon: '#ffe0b0', sun: '#ffe2b0', sunI: 2.1, amb: '#d8d0e8', ambI: 0.9, fog: '#f2d9c0', stars: 0 },
  { t: 0.74, top: '#2c3274', mid: '#c4668a', horizon: '#ff9a5c', sun: '#ff8a4a', sunI: 1.4, amb: '#a07aa0', ambI: 0.7, fog: '#d98a78', stars: 0.1 },
  { t: 0.82, top: '#110d33', mid: '#3a2458', horizon: '#7a3f6a', sun: '#9b8cff', sunI: 0.5, amb: '#4c3c78', ambI: 0.6, fog: '#352650', stars: 0.7 },
  { t: 1.0, top: '#070514', mid: '#130c2c', horizon: '#2b1c4f', sun: '#8fa6ff', sunI: 0.35, amb: '#3a3470', ambI: 0.55, fog: '#1a1636', stars: 1 },
];

export interface SkyOverride { top?: string; mid?: string; horizon?: string; sun?: string; sunI?: number; amb?: string; ambI?: number; fog?: string; stars?: number; weight: number }

const c1 = new THREE.Color(), c2 = new THREE.Color();
function lerpHex(a: string, b: string, t: number, out: THREE.Color): THREE.Color {
  c1.set(a); c2.set(b);
  return out.copy(c1).lerp(c2, t);
}

export class Sky {
  readonly dome: THREE.Mesh;
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  readonly clouds = new THREE.Group();
  readonly fog: THREE.Fog;
  private mat: THREE.ShaderMaterial;
  private cloudMat: THREE.MeshToonMaterial;
  time = 0.35;
  override: SkyOverride | null = null;
  /** Distance of sun shadow camera from target. */
  shadowTarget = new THREE.Vector3();
  cloudSpeed = 1.2;
  private cur = { top: new THREE.Color(), mid: new THREE.Color(), horizon: new THREE.Color(), sun: new THREE.Color(), amb: new THREE.Color(), fog: new THREE.Color(), sunI: 1, ambI: 1, stars: 0 };

  constructor(private scene: THREE.Scene, opts: { radius?: number; fogNear?: number; fogFar?: number; clouds?: number; cloudHeight?: number; cloudSpread?: number; shadowSize?: number } = {}) {
    const radius = opts.radius ?? 900;
    this.mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uTop: { value: new THREE.Color() }, uMid: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunColor: { value: new THREE.Color() }, uStars: { value: 0 }, uTime: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position.z = gl_Position.w; }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uTop, uMid, uHorizon, uSunColor, uSunDir; uniform float uStars, uTime;
        varying vec3 vDir;
        float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        void main() {
          vec3 d = normalize(vDir);
          float h = d.y;
          vec3 col = h > 0.0 ? mix(mix(uHorizon, uMid, smoothstep(0.0, 0.25, h)), uTop, smoothstep(0.25, 0.85, h)) : mix(uHorizon, uHorizon * 0.55, smoothstep(0.0, -0.3, h));
          float sd = max(dot(d, normalize(uSunDir)), 0.0);
          col += uSunColor * (pow(sd, 900.0) * 3.0 + pow(sd, 18.0) * 0.28 + pow(sd, 3.0) * 0.08);
          // moon (opposite the sun)
          float md = max(dot(d, -normalize(uSunDir)), 0.0);
          col += vec3(0.85, 0.9, 1.0) * uStars * (smoothstep(0.9993, 0.9996, md) * 1.6 + pow(md, 60.0) * 0.12);
          // stars
          if (uStars > 0.01 && h > 0.0) {
            vec3 g = floor(d * 260.0);
            float s = hash(g);
            float tw = 0.6 + 0.4 * sin(uTime * 2.0 + s * 40.0);
            col += vec3(1.0) * step(0.9975, s) * uStars * tw * smoothstep(0.0, 0.2, h);
          }
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 16), this.mat);
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -1000;
    scene.add(this.dome);

    this.sun = new THREE.DirectionalLight('#ffffff', 2);
    this.sun.castShadow = true;
    const ss = opts.shadowSize ?? 60;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 400;
    this.sun.shadow.camera.left = -ss; this.sun.shadow.camera.right = ss;
    this.sun.shadow.camera.top = ss; this.sun.shadow.camera.bottom = -ss;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.03;
    scene.add(this.sun, this.sun.target);

    this.hemi = new THREE.HemisphereLight('#c8dcff', '#4a3a2a', 0.9);
    scene.add(this.hemi);

    this.fog = new THREE.Fog('#cfe6ff', opts.fogNear ?? 60, opts.fogFar ?? 420);
    scene.fog = this.fog;

    this.cloudMat = toon('#ffffff', { bands: [0.72, 0.88, 1.0], emissive: '#3a3a60', emissiveIntensity: 0.25, fog: false, unique: true });
    const n = opts.clouds ?? 14;
    const spread = opts.cloudSpread ?? 380;
    const hgt = opts.cloudHeight ?? 110;
    for (let i = 0; i < n; i++) {
      const cloud = this.makeCloud(i);
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.4;
      const r = spread * (0.45 + Math.random() * 0.55);
      cloud.position.set(Math.cos(a) * r, hgt + Math.random() * 40, Math.sin(a) * r);
      cloud.scale.setScalar(6 + Math.random() * 9);
      cloud.userData.speed = 0.4 + Math.random() * 0.8;
      this.clouds.add(cloud);
    }
    scene.add(this.clouds);
    this.setTime(this.time);
  }

  private makeCloud(seed: number): THREE.Group {
    const g = new THREE.Group();
    const geo = new THREE.IcosahedronGeometry(1, 2);
    const puffs = 5 + (seed % 4);
    for (let i = 0; i < puffs; i++) {
      const m = new THREE.Mesh(geo, this.cloudMat);
      const t = i / (puffs - 1) - 0.5;
      m.position.set(t * 3.4 + (Math.random() - 0.5) * 0.6, Math.random() * 0.7 + (1 - Math.abs(t) * 2) * 0.6, (Math.random() - 0.5) * 1.2);
      m.scale.setScalar(0.8 + (1 - Math.abs(t) * 1.6) * 0.8 + Math.random() * 0.3);
      m.scale.y *= 0.8;
      g.add(m);
    }
    return g;
  }

  setTime(t: number): void {
    this.time = ((t % 1) + 1) % 1;
    let a = KEYS[0], b = KEYS[1];
    for (let i = 0; i < KEYS.length - 1; i++) { if (this.time >= KEYS[i].t && this.time <= KEYS[i + 1].t) { a = KEYS[i]; b = KEYS[i + 1]; break; } }
    const k = (this.time - a.t) / Math.max(1e-5, b.t - a.t);
    const s = k * k * (3 - 2 * k);
    const c = this.cur;
    lerpHex(a.top, b.top, s, c.top); lerpHex(a.mid, b.mid, s, c.mid); lerpHex(a.horizon, b.horizon, s, c.horizon);
    lerpHex(a.sun, b.sun, s, c.sun); lerpHex(a.amb, b.amb, s, c.amb); lerpHex(a.fog, b.fog, s, c.fog);
    c.sunI = a.sunI + (b.sunI - a.sunI) * s; c.ambI = a.ambI + (b.ambI - a.ambI) * s; c.stars = a.stars + (b.stars - a.stars) * s;
    const o = this.override;
    if (o && o.weight > 0) {
      const w = o.weight;
      if (o.top) c.top.lerp(c1.set(o.top), w);
      if (o.mid) c.mid.lerp(c1.set(o.mid), w);
      if (o.horizon) c.horizon.lerp(c1.set(o.horizon), w);
      if (o.sun) c.sun.lerp(c1.set(o.sun), w);
      if (o.amb) c.amb.lerp(c1.set(o.amb), w);
      if (o.fog) c.fog.lerp(c1.set(o.fog), w);
      if (o.sunI !== undefined) c.sunI += (o.sunI - c.sunI) * w;
      if (o.ambI !== undefined) c.ambI += (o.ambI - c.ambI) * w;
      if (o.stars !== undefined) c.stars += (o.stars - c.stars) * w;
    }
    const u = this.mat.uniforms;
    u.uTop.value.copy(c.top); u.uMid.value.copy(c.mid); u.uHorizon.value.copy(c.horizon); u.uSunColor.value.copy(c.sun); u.uStars.value = c.stars;
    // sun path: rises east (x+), sets west
    const ang = (this.time - 0.25) * Math.PI * 2;
    const sunDir = new THREE.Vector3(Math.cos(ang), Math.sin(ang), 0.35).normalize();
    // at night the "sun" light becomes moonlight from the opposite side
    const lightDir = sunDir.y > -0.05 ? sunDir.clone() : sunDir.clone().negate();
    lightDir.y = Math.max(lightDir.y, 0.25);
    u.uSunDir.value.copy(sunDir);
    this.sun.color.copy(c.sun);
    this.sun.intensity = c.sunI;
    this.sun.position.copy(this.shadowTarget).addScaledVector(lightDir.normalize(), 150);
    this.sun.target.position.copy(this.shadowTarget);
    this.hemi.color.copy(c.amb);
    this.hemi.groundColor.copy(c.amb).multiplyScalar(0.45);
    this.hemi.intensity = c.ambI;
    this.fog.color.copy(c.fog);
    this.cloudMat.color.copy(c.horizon).lerp(c1.set('#ffffff'), 0.6);
    this.cloudMat.emissive.copy(c.top).multiplyScalar(0.35);
  }

  get isNight(): boolean { return this.time < 0.23 || this.time > 0.8; }

  update(dt: number, camera: THREE.Camera, time = 0): void {
    this.dome.position.copy(camera.position);
    this.mat.uniforms.uTime.value = time;
    for (const c of this.clouds.children) {
      c.position.x += dt * this.cloudSpeed * (c.userData.speed as number);
      if (c.position.x > 420) c.position.x = -420;
    }
    this.clouds.position.set(camera.position.x * 0.8, 0, camera.position.z * 0.8);
  }

  dispose(): void {
    this.scene.remove(this.dome, this.sun, this.sun.target, this.hemi, this.clouds);
    this.dome.geometry.dispose();
    this.mat.dispose();
  }
}
