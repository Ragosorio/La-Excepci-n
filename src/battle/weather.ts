/**
 * Weather: GPU-animated particles in a box around the camera (one draw call) + fog tweaks + ambience,
 * and storm lightning that strikes the battlefield (it can hit units — it's a storm, not a promise).
 */
import * as THREE from 'three';
import type { BattleSetup } from './api';
import type { Battle } from './world';
import { audio } from '../audio';
import { engine } from '../core/engine';
import { damage, knockback, K_MAGIC } from './combat';

type Kind = NonNullable<BattleSetup['weather']>;

export class Weather {
  private points: THREE.Points | null = null;
  private mat: THREE.ShaderMaterial | null = null;
  private boltT = 4;
  private kind: Kind;

  constructor(private b: Battle, kind: Kind | undefined) {
    this.kind = kind ?? 'clear';
    if (this.kind === 'clear') return;
    const n = this.kind === 'storm' ? 5000 : this.kind === 'rain' ? 3500 : this.kind === 'fog' ? 260 : 2400;
    const pos = new Float32Array(n * 3), seed = new Float32Array(n);
    for (let i = 0; i < n; i++) { pos[i * 3] = Math.random() * 80 - 40; pos[i * 3 + 1] = Math.random() * 40; pos[i * 3 + 2] = Math.random() * 80 - 40; seed[i] = Math.random(); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    const cfg: Record<Kind, { col: string; speed: number; size: number; drift: number; streak: number; alpha: number }> = {
      clear: { col: '#fff', speed: 0, size: 0, drift: 0, streak: 0, alpha: 0 },
      rain: { col: '#aac8ff', speed: 26, size: 2.2, drift: 0.2, streak: 1, alpha: 0.5 },
      storm: { col: '#b8d0ff', speed: 34, size: 2.4, drift: 0.8, streak: 1, alpha: 0.6 },
      snow: { col: '#ffffff', speed: 2.2, size: 5.5, drift: 1.2, streak: 0, alpha: 0.85 },
      ash: { col: '#ffb070', speed: -0.8, size: 4, drift: 1.4, streak: 0, alpha: 0.75 },
      fog: { col: '#e8e0f0', speed: 0.1, size: 140, drift: 0.6, streak: 0, alpha: 0.07 },
    };
    const c = cfg[this.kind];
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uCenter: { value: new THREE.Vector3() }, uColor: { value: new THREE.Color(c.col) }, uSpeed: { value: c.speed }, uSize: { value: c.size }, uDrift: { value: c.drift }, uStreak: { value: c.streak }, uAlpha: { value: c.alpha }, uPx: { value: engine.renderer.getPixelRatio() } },
      vertexShader: /* glsl */ `
        attribute float aSeed; uniform float uTime, uSpeed, uSize, uDrift, uPx; uniform vec3 uCenter; varying float vA;
        void main() {
          vec3 p = position;
          p.y = mod(p.y - uTime * uSpeed * (0.8 + aSeed * 0.4), 40.0);
          p.x += sin(uTime * 0.7 + aSeed * 40.0) * uDrift * 2.0;
          p.z += cos(uTime * 0.5 + aSeed * 30.0) * uDrift * 2.0;
          vec3 w = vec3(uCenter.x + mod(p.x - uCenter.x + 40.0, 80.0) - 40.0, uCenter.y - 6.0 + p.y, uCenter.z + mod(p.z - uCenter.z + 40.0, 80.0) - 40.0);
          vec4 mv = viewMatrix * vec4(w, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = uSize * uPx * (60.0 / max(1.0, -mv.z));
          vA = smoothstep(0.0, 4.0, p.y) * smoothstep(40.0, 30.0, p.y);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; uniform float uStreak, uAlpha; varying float vA;
        void main() {
          vec2 q = gl_PointCoord - 0.5;
          float d = uStreak > 0.5 ? (abs(q.x) * 9.0 + abs(q.y) * 0.9) : length(q) * 2.0;
          float a = (1.0 - smoothstep(0.6, 1.0, d)) * uAlpha * vA;
          if (a < 0.01) discard;
          gl_FragColor = vec4(uColor, a);
        }`,
      transparent: true, depthWrite: false, fog: false,
      blending: this.kind === 'ash' ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 40;
    b.scene.add(this.points);
    const fog = b.sky.fog;
    if (this.kind === 'fog') { fog.near *= 0.35; fog.far *= 0.45; }
    if (this.kind === 'rain' || this.kind === 'storm') { fog.far *= 0.7; b.sky.override = { ...(b.sky.override ?? {}), sunI: 1.1, ambI: 0.7, top: '#4a5a7a', horizon: '#8a96a8', fog: '#7a8698', stars: 0, weight: 0.75 }; b.sky.setTime(b.sky.time); }
    if (this.kind === 'snow') { b.sky.override = { ...(b.sky.override ?? {}), fog: '#dde6f0', horizon: '#e8eef6', weight: 0.5 }; b.sky.setTime(b.sky.time); }
    if (this.kind === 'ash') { b.sky.override = { ...(b.sky.override ?? {}), fog: '#8a6a5a', horizon: '#c07050', top: '#3a2a3a', weight: 0.6 }; b.sky.setTime(b.sky.time); }
    audio.ambience(this.kind === 'storm' ? 'rain_heavy' : this.kind === 'rain' ? 'rain' : 'wind', true, 0.6);
  }

  update(dt: number, realTime: number): void {
    if (!this.mat) return;
    this.mat.uniforms.uTime.value = realTime;
    this.mat.uniforms.uCenter.value.copy(this.b.cam.rig.focus);
    if (this.kind === 'storm' && dt > 0 && this.b.phase === 'fight') {
      this.boltT -= dt;
      if (this.boltT <= 0) { this.boltT = 5 + Math.random() * 8; this.strike(); }
    }
  }

  private strike(): void {
    const b = this.b, u = b.u;
    const f = b.cam.rig.focus;
    let x = f.x + (Math.random() - 0.5) * 50, z = f.z + (Math.random() - 0.5) * 40;
    // lightning loves tall things
    let best = -1, bh = 0;
    for (let i = 0; i < u.n; i++) if (b.alive(i) && Math.hypot(u.x[i] - x, u.z[i] - z) < 12 && u.scale[i] > bh) { bh = u.scale[i]; best = i; }
    if (best >= 0) { x = u.x[best]; z = u.z[best]; }
    const y = b.heightAt(x, z);
    b.fx.bolt(b.tmpV.set(x + 4, y + 40, z - 3), b.tmpV2(x, y, z), { color: '#dfe8ff', segments: 10, width: 0.25, duration: 0.3 });
    b.fx.emit('lightning', b.tmpV.set(x, y + 0.5, z), { count: 30 });
    b.fx.flash(b.tmpV, { color: '#dfe8ff', radius: 5 });
    engine.pipeline.flash('#dfe8ff', 0.35, 0.25);
    b.sfx('thunder', NaN, NaN, 1, 1, 0);
    if (best >= 0 && !b.isPlayer(best)) { damage(b, best, 40, { src: -1, kind: K_MAGIC }); knockback(b, best, 0, 0.01, 12, 1.5); }
  }

  dispose(): void {
    if (this.points) { this.points.removeFromParent(); this.points.geometry.dispose(); }
    this.mat?.dispose();
    audio.ambience('rain', false); audio.ambience('rain_heavy', false); audio.ambience('wind', false);
  }
}
