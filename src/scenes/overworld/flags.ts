/**
 * Instanced waving banners (one draw call for every flag on the map: locations + parties).
 * Per instance: cloth color, emblem color, style (0 = crest disc, 1 = the eclipse of La Excepción), phase.
 */
import * as THREE from 'three';

const VERT = /* glsl */ `
  #include <common>
  #include <fog_pars_vertex>
  attribute vec3 aColor; attribute vec3 aColor2; attribute float aPhase; attribute float aStyle;
  uniform float uTime;
  varying vec2 vUv; varying vec3 vCol; varying vec3 vCol2; varying float vStyle; varying float vShade;
  void main() {
    vUv = uv;
    vCol = aColor; vCol2 = aColor2; vStyle = aStyle;
    vec3 p = position;
    float u = uv.x;
    float wv = sin(uTime * 5.2 + u * 6.5 + aPhase);
    p.z += wv * 0.13 * u;
    p.y += sin(uTime * 3.1 + u * 4.0 + aPhase) * 0.035 * u;
    vShade = 0.84 + 0.2 * cos(uTime * 5.2 + u * 6.5 + aPhase);
    vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;

const FRAG = /* glsl */ `
  #include <common>
  #include <fog_pars_fragment>
  uniform float uNight;
  varying vec2 vUv; varying vec3 vCol; varying vec3 vCol2; varying float vStyle; varying float vShade;
  void main() {
    vec3 c = vCol;
    vec2 q = (vUv - vec2(0.42, 0.5)) * vec2(1.55, 1.0);
    float d = length(q);
    if (vStyle > 0.5) {
      c = mix(c, vec3(0.015, 0.01, 0.03), 1.0 - smoothstep(0.19, 0.2, d));
      float ringA = 1.0 - smoothstep(0.012, 0.034, abs(d - 0.215));
      c += vCol2 * ringA * 2.6;
    } else {
      c = mix(c, vCol2, 1.0 - smoothstep(0.13, 0.15, d));
      float border = max(step(0.88, vUv.y), step(vUv.y, 0.12));
      c = mix(c, vCol2 * 0.85, border * 0.9);
    }
    // swallow-tail cut
    float tail = step(0.8, vUv.x) * step(abs(vUv.y - 0.5), (vUv.x - 0.8) * 1.9);
    if (tail > 0.5) discard;
    c *= vShade * mix(1.0, 0.5, uNight);
    gl_FragColor = vec4(c, 1.0);
    #include <fog_fragment>
  }`;

export class FlagField {
  readonly mesh: THREE.InstancedMesh;
  private aColor: THREE.InstancedBufferAttribute;
  private aColor2: THREE.InstancedBufferAttribute;
  private aPhase: THREE.InstancedBufferAttribute;
  private aStyle: THREE.InstancedBufferAttribute;
  readonly mat: THREE.ShaderMaterial;
  private used = 0;
  private free: number[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();
  private c = new THREE.Color();

  constructor(readonly capacity = 200, width = 0.95, height = 0.58) {
    const g = new THREE.PlaneGeometry(width, height, 8, 3).translate(width / 2, -height / 2, 0);
    this.aColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    this.aColor2 = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    this.aPhase = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
    this.aStyle = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
    for (const a of [this.aColor, this.aColor2, this.aPhase, this.aStyle]) a.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aColor', this.aColor); g.setAttribute('aColor2', this.aColor2);
    g.setAttribute('aPhase', this.aPhase); g.setAttribute('aStyle', this.aStyle);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide, fog: true,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uNight: { value: 0 } }]),
    });
    this.mesh = new THREE.InstancedMesh(g, this.mat, capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.name = 'flags';
  }

  /** Allocate a flag slot; returns its index. */
  add(x: number, y: number, z: number, yaw: number, scale: number, color: string, emblem = '#d9b36c', style = 0): number {
    const i = this.free.length ? this.free.pop()! : this.used++;
    if (i >= this.capacity) return -1;
    this.mesh.count = Math.max(this.mesh.count, i + 1);
    this.aPhase.setX(i, Math.random() * 10);
    this.set(i, x, y, z, yaw, scale);
    this.color(i, color, emblem, style);
    return i;
  }

  set(i: number, x: number, y: number, z: number, yaw: number, scale: number): void {
    if (i < 0) return;
    this.e.set(0, yaw, 0);
    this.q.setFromEuler(this.e);
    this.m.compose(this.v.set(x, y, z), this.q, this.s.setScalar(scale));
    this.mesh.setMatrixAt(i, this.m);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  color(i: number, color: string, emblem: string, style: number): void {
    if (i < 0) return;
    this.c.set(color); this.aColor.setXYZ(i, this.c.r, this.c.g, this.c.b);
    this.c.set(emblem); this.aColor2.setXYZ(i, this.c.r, this.c.g, this.c.b);
    this.aStyle.setX(i, style);
    this.aColor.needsUpdate = true; this.aColor2.needsUpdate = true; this.aStyle.needsUpdate = true; this.aPhase.needsUpdate = true;
  }

  hide(i: number): void { if (i >= 0) this.set(i, 0, -999, 0, 0, 0.0001); }
  remove(i: number): void { if (i < 0) return; this.hide(i); this.free.push(i); }

  update(time: number, night: number): void {
    this.mat.uniforms.uTime.value = time;
    this.mat.uniforms.uNight.value = night;
  }

  dispose(): void { this.mesh.geometry.dispose(); this.mat.dispose(); }
}

/** Additive glowing points (lanterns, windows' halos, neon, fireflies). Brightness follows night unless `always`. */
export class GlowPoints {
  readonly points: THREE.Points;
  readonly mat: THREE.ShaderMaterial;
  constructor(data: Array<{ x: number; y: number; z: number; color: string; size: number; always: number; phase: number }>) {
    const n = data.length;
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n), always = new Float32Array(n), phase = new Float32Array(n);
    const c = new THREE.Color();
    data.forEach((d, i) => {
      pos[i * 3] = d.x; pos[i * 3 + 1] = d.y; pos[i * 3 + 2] = d.z;
      c.set(d.color); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      size[i] = d.size; always[i] = d.always; phase[i] = d.phase;
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    g.setAttribute('aAlways', new THREE.BufferAttribute(always, 1));
    g.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uNight: { value: 0 }, uTime: { value: 0 }, uScale: { value: 400 }, uGain: { value: 1 } },
      vertexShader: /* glsl */ `
        attribute vec3 aColor; attribute float aSize; attribute float aAlways; attribute float aPhase;
        uniform float uNight, uTime, uScale;
        varying vec3 vC; varying float vA;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          float on = max(aAlways, uNight);
          float fl = 0.82 + 0.18 * sin(uTime * 7.3 + aPhase) * sin(uTime * 2.9 + aPhase * 1.7);
          vA = on * fl;
          vC = aColor;
          gl_PointSize = clamp(aSize * uScale / -mv.z * (0.55 + 0.45 * on), 0.0, 90.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uGain;
        varying vec3 vC; varying float vA;
        void main() {
          float r = length(gl_PointCoord - 0.5);
          float core = 1.0 - smoothstep(0.0, 0.5, r);
          float a = (pow(core, 3.0) * 1.6 + pow(core, 1.2) * 0.35) * vA * uGain;
          gl_FragColor = vec4(vC * a * 2.2, a);
        }`,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
  }
  update(time: number, night: number, viewportH: number): void {
    this.mat.uniforms.uTime.value = time;
    this.mat.uniforms.uNight.value = night;
    this.mat.uniforms.uScale.value = viewportH * 0.9;
  }
  dispose(): void { this.points.geometry.dispose(); this.mat.dispose(); }
}
