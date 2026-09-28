/**
 * Ground telegraph decals (circle / cone / line) that fill up exactly at impact.
 * Color language: violet = copyable by La Excepción, red = danger, gold = friendly.
 */
import * as THREE from 'three';

const MAXT = 32;

export const TELE_CIRCLE = 0, TELE_CONE = 1, TELE_LINE = 2;

interface Tele { mesh: THREE.Mesh; mat: THREE.ShaderMaterial; owner: number; t: number; dur: number; active: boolean; follow: boolean }

export class Telegraphs {
  private pool: Tele[] = [];
  readonly root = new THREE.Group();
  private geo = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);

  constructor(scene: THREE.Scene) {
    scene.add(this.root);
    for (let k = 0; k < MAXT; k++) {
      const mat = new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color('#ff4a5a') }, uP: { value: 0 }, uShape: { value: 0 }, uAng: { value: 0.7 }, uTime: { value: 0 }, uAlpha: { value: 1 } },
        vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv * 2.0 - 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uColor; uniform float uP, uShape, uAng, uTime, uAlpha; varying vec2 vUv;
          void main() {
            vec2 p = vUv; float a = 0.0;
            if (uShape < 0.5) {
              float r = length(p);
              if (r > 1.0) discard;
              float edge = smoothstep(0.9, 0.97, r) * (1.0 - smoothstep(0.985, 1.0, r));
              float fill = step(r, uP) * 0.32 + smoothstep(uP - 0.05, uP, r) * step(r, uP) * 0.6;
              float stripes = step(0.5, fract((p.x + p.y) * 5.0 - uTime * 1.5)) * 0.08;
              a = edge * 0.95 + fill + stripes * (1.0 - step(uP, r));
            } else if (uShape < 1.5) {
              // cone pointing +y (local forward) with half-angle uAng
              float r = length(p);
              float ang = abs(atan(p.x, p.y));
              if (r > 1.0 || ang > uAng) discard;
              float edge = smoothstep(0.93, 0.99, r) + smoothstep(uAng - 0.06, uAng, ang);
              a = min(1.0, edge) * 0.9 + step(r, uP) * 0.35;
            } else {
              // line: x in [-1,1] width, y in [-1,1] length
              float edge = smoothstep(0.85, 0.98, abs(p.x));
              float fill = step((p.y + 1.0) * 0.5, uP) * 0.35;
              a = edge * 0.9 + fill;
            }
            gl_FragColor = vec4(uColor * 1.6, a * uAlpha);
          }`,
        transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, fog: false,
      });
      const mesh = new THREE.Mesh(this.geo, mat);
      mesh.visible = false;
      mesh.renderOrder = 3;
      this.root.add(mesh);
      this.pool.push({ mesh, mat, owner: -1, t: 0, dur: 1, active: false, follow: false });
    }
  }

  /** Show a telegraph. For cones/lines, yaw points along the attack. len = line length. */
  show(owner: number, shape: number, x: number, y: number, z: number, radius: number, yaw: number, dur: number, color: string, opts: { angle?: number; len?: number; follow?: boolean } = {}): void {
    let t = this.pool.find((q) => !q.active);
    if (!t) t = this.pool[0];
    t.active = true; t.owner = owner; t.t = 0; t.dur = Math.max(0.05, dur); t.follow = !!opts.follow;
    const m = t.mesh;
    m.visible = true;
    m.position.set(x, y + 0.08, z);
    m.rotation.set(0, yaw, 0);
    if (shape === TELE_LINE) {
      const len = opts.len ?? radius * 4;
      m.scale.set(radius, 1, len / 2);
      // anchor at the caster: move center half-length forward
      m.position.x += Math.sin(yaw) * len / 2; m.position.z += Math.cos(yaw) * len / 2;
    } else m.scale.set(radius, 1, radius);
    // cone local forward is +y of the uv → plane's -z after rotateX; rotate to face yaw
    if (shape === TELE_CONE) m.rotation.set(0, yaw + Math.PI, 0);
    t.mat.uniforms.uColor.value.set(color);
    t.mat.uniforms.uShape.value = shape;
    t.mat.uniforms.uAng.value = opts.angle ?? 0.7;
    t.mat.uniforms.uP.value = 0;
    t.mat.uniforms.uAlpha.value = 1;
  }

  cancel(owner: number): void {
    for (const t of this.pool) if (t.active && t.owner === owner) { t.active = false; t.mesh.visible = false; }
  }

  update(dt: number, time: number, posOf: (i: number) => { x: number; y: number; z: number } | null): void {
    for (const t of this.pool) {
      if (!t.active) continue;
      t.t += dt;
      const p = Math.min(1, t.t / t.dur);
      t.mat.uniforms.uP.value = p;
      t.mat.uniforms.uTime.value = time;
      if (t.follow && t.owner >= 0) { const q = posOf(t.owner); if (q) t.mesh.position.set(q.x, q.y + 0.08, q.z); }
      if (t.t > t.dur + 0.12) {
        t.mat.uniforms.uAlpha.value = Math.max(0, 1 - (t.t - t.dur - 0.12) / 0.15);
        if (t.t > t.dur + 0.27) { t.active = false; t.mesh.visible = false; }
      }
    }
  }

  dispose(): void {
    for (const t of this.pool) t.mat.dispose();
    this.geo.dispose();
    this.root.removeFromParent();
  }
}
