/** Rain around the camera: streaks as line segments recycled in a box that follows the camera. */
import * as THREE from 'three';

export class Rain {
  readonly lines: THREE.LineSegments;
  private pos: Float32Array;
  private vel: Float32Array;
  private mat: THREE.LineBasicMaterial;
  private n: number;
  intensity = 0;
  wind = new THREE.Vector2(0.9, 0.3);
  private box = new THREE.Vector3(26, 16, 26);

  constructor(n = 2600) {
    this.n = n;
    this.pos = new Float32Array(n * 6);
    this.vel = new Float32Array(n);
    for (let i = 0; i < n; i++) this.reset(i, new THREE.Vector3(), true);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.mat = new THREE.LineBasicMaterial({ color: '#b8c2d8', transparent: true, opacity: 0.45, depthWrite: false, fog: true });
    this.lines = new THREE.LineSegments(g, this.mat);
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 40;
  }

  private reset(i: number, c: THREE.Vector3, anyY = false): void {
    const b = this.box;
    const x = c.x + (Math.random() - 0.5) * b.x, z = c.z + (Math.random() - 0.5) * b.z;
    const y = anyY ? c.y + (Math.random() - 0.5) * b.y : c.y + b.y * 0.5 + Math.random() * 2;
    const len = 0.55 + Math.random() * 0.5;
    const p = this.pos, o = i * 6;
    p[o] = x; p[o + 1] = y; p[o + 2] = z;
    p[o + 3] = x - this.wind.x * 0.05 * len; p[o + 4] = y - len; p[o + 5] = z - this.wind.y * 0.05 * len;
    this.vel[i] = 17 + Math.random() * 7;
  }

  update(dt: number, center: THREE.Vector3): void {
    const active = Math.floor(this.n * Math.max(0, Math.min(1, this.intensity)));
    const geo = this.lines.geometry;
    geo.setDrawRange(0, active * 2);
    this.lines.visible = active > 0;
    if (!active) return;
    this.mat.opacity = 0.25 + this.intensity * 0.3;
    const p = this.pos;
    const floor = center.y - this.box.y * 0.5;
    for (let i = 0; i < active; i++) {
      const o = i * 6;
      const v = this.vel[i] * dt;
      const wx = this.wind.x * dt * 3, wz = this.wind.y * dt * 3;
      p[o + 1] -= v; p[o + 4] -= v;
      p[o] += wx; p[o + 3] += wx; p[o + 2] += wz; p[o + 5] += wz;
      if (p[o + 4] < floor || Math.abs(p[o] - center.x) > this.box.x * 0.6 || Math.abs(p[o + 2] - center.z) > this.box.z * 0.6) this.reset(i, center);
    }
    const attr = geo.getAttribute('position') as THREE.BufferAttribute;
    attr.needsUpdate = true;
    attr.addUpdateRange(0, active * 6);
  }

  dispose(): void {
    this.lines.removeFromParent();
    this.lines.geometry.dispose();
    this.mat.dispose();
  }
}
