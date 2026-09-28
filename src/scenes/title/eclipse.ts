/**
 * The eclipse: black disc + animated corona (HDR → bloom), a starfield, drifting ash and light motes.
 * From cycle 3 an eye opens inside the disc and follows the mouse. Reused by the ending (sky eclipse).
 */
import * as THREE from 'three';

const coronaVert = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const coronaFrag = /* glsl */ `
  uniform float uTime, uR, uIntensity, uFlare;
  varying vec2 vUv;
  float h1(float n) { return fract(sin(n) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    float a = h1(i.x + i.y * 57.0), b = h1(i.x + 1.0 + i.y * 57.0), c = h1(i.x + (i.y + 1.0) * 57.0), d = h1(i.x + 1.0 + (i.y + 1.0) * 57.0);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }
  void main() {
    vec2 p = (vUv - 0.5) * 16.0;
    float r = length(p);
    float d = r - uR;
    if (d < -0.03) discard;
    // sample noise on circles (seamless around the disc)
    vec2 dir = p / max(r, 1e-4);
    float n = vnoise(dir * 1.6 + vec2(uTime * 0.07, -uTime * 0.05)) * 0.55
            + vnoise(dir * 3.9 + vec2(3.1 - uTime * 0.11, uTime * 0.09)) * 0.3
            + vnoise(dir * 9.5 + vec2(7.7 + uTime * 0.19, r * 0.35)) * 0.15;
    float reach = 0.16 + n * n * 1.5 * (1.0 + uFlare * 0.7);
    float dd = max(d, 0.0);
    float streamer = exp(-dd / reach) * (0.18 + n * 0.42);
    float halo = exp(-dd * 1.2) * 0.09;
    float inner = exp(-dd * 26.0) * 0.85;
    float rim = exp(-abs(d) * 120.0) * 1.6;
    vec3 white = vec3(1.0, 0.95, 0.84);
    vec3 gold = vec3(0.92, 0.70, 0.38);
    vec3 violet = vec3(0.5, 0.28, 0.95);
    float k = clamp(dd / 2.2, 0.0, 1.0);
    vec3 col = mix(mix(white, gold, smoothstep(0.0, 0.16, k)), violet, smoothstep(0.16, 0.9, k));
    vec3 c = col * (streamer + halo) * uIntensity + white * (inner + rim) * uIntensity;
    float edge = 1.0 - smoothstep(4.6, 7.8, r);
    gl_FragColor = vec4(c * edge, 1.0);
  }
`;

const discFrag = /* glsl */ `
  uniform float uEye, uOpen, uTime;
  uniform vec2 uLook;
  varying vec2 vUv;
  void main() {
    vec2 p = (vUv - 0.5) * 2.0;
    float r = length(p);
    if (r > 1.0) discard;
    vec3 col = vec3(0.0) + vec3(0.02, 0.012, 0.035) * smoothstep(0.7, 1.0, r);
    if (uEye > 0.001) {
      float x = p.x / 0.8;
      float hgt = 0.36 * max(0.0, 1.0 - x * x);
      float lid = uOpen * hgt;
      float inside = step(abs(x), 1.0) * smoothstep(lid + 0.012, lid - 0.012, abs(p.y));
      vec2 ip = p - uLook * vec2(0.3, 0.13);
      float ir = length(ip);
      float ang = atan(ip.y, ip.x);
      vec3 sclera = vec3(0.07, 0.05, 0.1) + vec3(0.05, 0.03, 0.08) * (1.0 - smoothstep(0.0, 0.8, abs(x)));
      vec3 irisC = mix(vec3(0.75, 0.5, 1.0) * 2.4, vec3(0.28, 0.1, 0.55), smoothstep(0.1, 0.29, ir));
      irisC *= 0.72 + 0.28 * sin(ang * 26.0 + ir * 14.0 + uTime * 0.3);
      vec3 eye = mix(sclera, irisC, smoothstep(0.30, 0.285, ir));
      eye = mix(eye, vec3(0.0), smoothstep(0.125, 0.11, ir));
      eye += vec3(1.3) * smoothstep(0.045, 0.0, length(ip - vec2(-0.09, 0.08)));
      col = mix(col, eye, inside * uEye);
      float lidLine = exp(-abs(abs(p.y) - lid) * 110.0) * step(abs(x), 1.0) * uEye * smoothstep(0.02, 0.2, uOpen);
      col += vec3(0.7, 0.45, 1.0) * lidLine * 0.8;
    }
    gl_FragColor = vec4(col, 1.0);
  }
`;

const pointsVert = /* glsl */ `
  uniform float uTime, uPix, uH;
  attribute vec3 aSeed;
  attribute float aSize;
  varying float vA;
  varying float vTw;
  void main() {
    vec3 p = position;
    float sp = 0.15 + aSeed.x * 0.5;
    p.y = mod(p.y + uTime * sp + uH * 0.5, uH) - uH * 0.5;
    p.x += sin(uTime * (0.2 + aSeed.y * 0.4) + aSeed.z * 6.28) * (0.4 + aSeed.y);
    p.z += cos(uTime * (0.15 + aSeed.z * 0.3) + aSeed.x * 6.28) * 0.5;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * uPix / max(0.5, -mv.z);
    float edge = smoothstep(uH * 0.5, uH * 0.36, abs(p.y));
    vA = edge;
    vTw = 0.6 + 0.4 * sin(uTime * (1.0 + aSeed.y * 3.0) + aSeed.x * 40.0);
  }
`;
const moteFrag = /* glsl */ `
  uniform vec3 uColA, uColB;
  varying float vA; varying float vTw;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    float a = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(mix(uColA, uColB, vTw) * a * vA * vTw * 2.2, 1.0);
  }
`;
const ashFrag = /* glsl */ `
  varying float vA; varying float vTw;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c * vec2(1.0, 1.6));
    float a = smoothstep(0.5, 0.2, d);
    gl_FragColor = vec4(vec3(0.05, 0.035, 0.05) * (0.7 + vTw * 0.3), a * vA * 0.7);
  }
`;
const starVert = /* glsl */ `
  uniform float uTime, uPix;
  attribute float aSize; attribute float aPhase;
  varying float vTw;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * uPix;
    vTw = 0.55 + 0.45 * sin(uTime * (0.6 + aPhase) + aPhase * 30.0);
  }
`;
const starFrag = /* glsl */ `
  varying float vTw;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(vec3(0.85, 0.82, 1.0) * a * vTw * 0.9, 1.0);
  }
`;

export interface EclipseOpts { radius?: number; stars?: boolean; ash?: boolean; motes?: boolean; eye?: boolean; intensity?: number }

export class Eclipse {
  readonly group = new THREE.Group();
  readonly disc: THREE.Mesh;
  readonly corona: THREE.Mesh;
  private coronaMat: THREE.ShaderMaterial;
  private discMat: THREE.ShaderMaterial;
  private extras: Array<{ obj: THREE.Points; mat: THREE.ShaderMaterial }> = [];
  private look = new THREE.Vector2();
  private lookTarget = new THREE.Vector2();
  private eyeOpen = 0;
  private eyeTarget = 0;
  private blinkT = 5;
  private blinkPhase = 0;
  flare = 0;
  radius: number;

  constructor(opts: EclipseOpts = {}) {
    const R = (this.radius = opts.radius ?? 2.6);
    this.coronaMat = new THREE.ShaderMaterial({
      vertexShader: coronaVert, fragmentShader: coronaFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uR: { value: R }, uIntensity: { value: opts.intensity ?? 1 }, uFlare: { value: 0 } },
    });
    this.corona = new THREE.Mesh(new THREE.PlaneGeometry(16, 16), this.coronaMat);
    this.corona.renderOrder = 2;
    this.discMat = new THREE.ShaderMaterial({
      vertexShader: coronaVert, fragmentShader: discFrag,
      uniforms: { uEye: { value: opts.eye ? 1 : 0 }, uOpen: { value: 0 }, uTime: { value: 0 }, uLook: { value: this.look } },
    });
    this.disc = new THREE.Mesh(new THREE.CircleGeometry(R, 96), this.discMat);
    this.disc.renderOrder = 3;
    this.disc.position.z = 0.01;
    this.group.add(this.corona, this.disc);
    if (opts.stars) this.addStars();
    if (opts.ash) this.addAsh();
    if (opts.motes) this.addMotes();
    if (opts.eye) this.setEye(true);
  }

  private addStars(): void {
    const n = 1400;
    const pos = new Float32Array(n * 3), size = new Float32Array(n), ph = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      const r = 260;
      pos[i * 3] = Math.cos(th) * s * r; pos[i * 3 + 1] = u * r * 0.7; pos[i * 3 + 2] = -Math.abs(Math.sin(th) * s * r) - 40;
      size[i] = Math.random() < 0.06 ? 3.2 : 1.2 + Math.random() * 1.4;
      ph[i] = Math.random();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    g.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1));
    const mat = new THREE.ShaderMaterial({ vertexShader: starVert, fragmentShader: starFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uTime: { value: 0 }, uPix: { value: Math.min(2, window.devicePixelRatio || 1) } } });
    const pts = new THREE.Points(g, mat);
    pts.renderOrder = -10;
    pts.frustumCulled = false;
    this.group.add(pts);
    this.extras.push({ obj: pts, mat });
  }

  private makeDrift(n: number, frag: string, spread: THREE.Vector3, sizeMin: number, sizeMax: number, additive: boolean, colors?: [string, string]): void {
    const d = driftPoints(n, frag === ashFrag ? 'ash' : 'motes', spread, sizeMin, sizeMax, colors);
    void additive;
    this.group.add(d.points);
    this.extras.push({ obj: d.points, mat: d.material });
  }

  private addAsh(): void { this.makeDrift(300, ashFrag, new THREE.Vector3(34, 20, 14), 0.5, 1.5, false); }
  private addMotes(): void { this.makeDrift(150, moteFrag, new THREE.Vector3(30, 18, 12), 0.35, 1.1, true); }

  setEye(on: boolean): void { this.discMat.uniforms.uEye.value = on ? 1 : 0; if (!on) this.eyeOpen = 0; }
  openEye(v = 1): void { this.eyeTarget = v; }
  lookAt(nx: number, ny: number): void { this.lookTarget.set(Math.max(-1, Math.min(1, nx)), Math.max(-1, Math.min(1, ny))); }
  setIntensity(v: number): void { this.coronaMat.uniforms.uIntensity.value = v; }

  update(dt: number, time: number): void {
    this.coronaMat.uniforms.uTime.value = time;
    this.flare = Math.max(0, this.flare - dt * 0.8);
    this.coronaMat.uniforms.uFlare.value = this.flare;
    this.discMat.uniforms.uTime.value = time;
    for (const e of this.extras) e.mat.uniforms.uTime.value += dt;
    // eye: smooth look, slow opening, occasional blink
    const k = 1 - Math.exp(-5 * dt);
    this.look.x += (this.lookTarget.x - this.look.x) * k;
    this.look.y += (this.lookTarget.y - this.look.y) * k;
    this.eyeOpen += (this.eyeTarget - this.eyeOpen) * (1 - Math.exp(-0.9 * dt));
    let open = this.eyeOpen;
    if (this.eyeTarget > 0.5) {
      this.blinkT -= dt;
      if (this.blinkT <= 0 && this.blinkPhase <= 0) { this.blinkPhase = 0.28; this.blinkT = 4 + Math.random() * 6; }
      if (this.blinkPhase > 0) {
        this.blinkPhase = Math.max(0, this.blinkPhase - dt);
        const b = this.blinkPhase / 0.28;
        open *= Math.abs(b * 2 - 1);
      }
    }
    this.discMat.uniforms.uOpen.value = open;
  }

  dispose(): void {
    this.group.removeFromParent();
    this.corona.geometry.dispose(); this.coronaMat.dispose();
    this.disc.geometry.dispose(); this.discMat.dispose();
    for (const e of this.extras) { e.obj.geometry.dispose(); e.mat.dispose(); }
    this.extras.length = 0;
  }
}

/** Drifting particles (ash flakes or light motes) in a box of size `spread` around the origin. */
export function driftPoints(n: number, kind: 'ash' | 'motes', spread: THREE.Vector3, sizeMin: number, sizeMax: number, colors?: [string, string]): { points: THREE.Points; material: THREE.ShaderMaterial; update(dt: number): void; dispose(): void } {
  const additive = kind === 'motes';
  const pos = new Float32Array(n * 3), seed = new Float32Array(n * 3), size = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = (Math.random() - 0.5) * spread.x;
    pos[i * 3 + 1] = (Math.random() - 0.5) * spread.y;
    pos[i * 3 + 2] = (Math.random() - 0.5) * spread.z + 2;
    seed[i * 3] = Math.random(); seed[i * 3 + 1] = Math.random(); seed[i * 3 + 2] = Math.random();
    size[i] = sizeMin + Math.random() * (sizeMax - sizeMin);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  const material = new THREE.ShaderMaterial({
    vertexShader: pointsVert, fragmentShader: additive ? moteFrag : ashFrag, transparent: true, depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    uniforms: {
      uTime: { value: Math.random() * 100 }, uPix: { value: 90 * Math.min(2, window.devicePixelRatio || 1) }, uH: { value: spread.y },
      uColA: { value: new THREE.Color(colors?.[0] ?? '#f5d99a') }, uColB: { value: new THREE.Color(colors?.[1] ?? '#c7a2ff') },
    },
  });
  const points = new THREE.Points(g, material);
  points.frustumCulled = false;
  points.renderOrder = additive ? 5 : 4;
  return {
    points, material,
    update(dt: number) { material.uniforms.uTime.value += dt; },
    dispose() { points.removeFromParent(); g.dispose(); material.dispose(); },
  };
}
