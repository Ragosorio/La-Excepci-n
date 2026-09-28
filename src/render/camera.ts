/**
 * Camera rig: smooth follow with yaw/pitch/distance, trauma-based shake, directional kick, FOV punch.
 *   const rig = new CameraRig(camera); rig.follow(target); rig.update(dt);
 * Shake intensity is scaled by settings.shake.
 */
import * as THREE from 'three';
import { G } from '../core/state';

export class CameraRig {
  readonly target = new THREE.Vector3();
  /** Smoothed focus point. */
  readonly focus = new THREE.Vector3();
  yaw = Math.PI;          // radians around Y (camera behind target looking +z when yaw = PI)
  pitch = 0.9;            // radians from horizontal (0 = level, PI/2 = top-down)
  distance = 18;
  minDistance = 5;
  maxDistance = 60;
  lookOffset = new THREE.Vector3(0, 1.2, 0);
  followK = 8;            // follow sharpness
  baseFov = 50;
  private trauma = 0;
  private kickV = new THREE.Vector3();
  private kickP = new THREE.Vector3();
  private fovExtra = 0;
  private t = 0;
  private curDist = 18;

  constructor(readonly camera: THREE.PerspectiveCamera) {
    this.baseFov = camera.fov;
  }

  follow(p: THREE.Vector3, snap = false): void {
    this.target.copy(p);
    if (snap) { this.focus.copy(p); this.curDist = this.distance; }
  }

  /** Add trauma 0..1 (shake = trauma²). */
  shake(amount: number): void { this.trauma = Math.min(1, this.trauma + amount * (G.meta?.settings.shake ?? 1)); }
  /** Directional push (e.g. away from an explosion). */
  kick(dir: THREE.Vector3, amount: number): void { this.kickV.addScaledVector(dir, amount * (G.meta?.settings.shake ?? 1)); }
  fovPunch(amount: number): void { this.fovExtra += amount; }

  zoom(delta: number): void { this.distance = THREE.MathUtils.clamp(this.distance * (1 + delta * 0.1), this.minDistance, this.maxDistance); }

  update(dt: number): void {
    this.t += dt;
    const k = 1 - Math.exp(-this.followK * dt);
    this.focus.lerp(this.target, k);
    this.curDist += (this.distance - this.curDist) * (1 - Math.exp(-6 * dt));
    // spring for kick
    this.kickV.addScaledVector(this.kickP, -120 * dt);
    this.kickV.multiplyScalar(Math.exp(-14 * dt));
    this.kickP.addScaledVector(this.kickV, dt);

    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const off = new THREE.Vector3(Math.sin(this.yaw) * cp, sp, Math.cos(this.yaw) * cp).multiplyScalar(this.curDist);
    const look = this.focus.clone().add(this.lookOffset);
    this.camera.position.copy(look).add(off).add(this.kickP);

    const s = this.trauma * this.trauma;
    if (s > 0.0001) {
      const n = (f: number, o: number) => Math.sin(this.t * f + o) * 0.6 + Math.sin(this.t * f * 2.13 + o * 1.7) * 0.4;
      this.camera.position.x += n(37, 1) * s * 0.9;
      this.camera.position.y += n(41, 2) * s * 0.9;
      this.camera.position.z += n(43, 3) * s * 0.9;
    }
    this.camera.lookAt(look.add(this.kickP.clone().multiplyScalar(0.5)));
    if (s > 0.0001) this.camera.rotateZ(Math.sin(this.t * 29) * s * 0.05);
    this.trauma = Math.max(0, this.trauma - dt * 1.6);

    this.fovExtra *= Math.exp(-8 * dt);
    const fov = this.baseFov + this.fovExtra;
    if (Math.abs(this.camera.fov - fov) > 0.01) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }
  }

  /** Ground-plane (y = h) point under the mouse (NDC coords). */
  groundPoint(nx: number, ny: number, h = 0, out = new THREE.Vector3()): THREE.Vector3 | null {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(nx, ny), this.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -h);
    return ray.ray.intersectPlane(plane, out);
  }
}
