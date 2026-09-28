/**
 * Battle camera modes on top of the core CameraRig (shake / kick / FOV punch):
 *  tactica — 3/4 view following Elias with 25% cursor look-ahead (default)
 *  hombro  — over-the-shoulder with pointer lock (V toggles)
 *  deploy  — top-down over the deployment zones (WASD pan, wheel zoom)
 *  orbit   — arena spectator (drag to orbit, WASD pan, auto-follows the action)
 *  focus   — scripted focus on a point/unit (BattleContext.cameraFocus)
 */
import * as THREE from 'three';
import { CameraRig } from '../render/camera';
import { input } from '../core/input';
import { clamp } from './mathx';

export type CamMode = 'tactica' | 'hombro' | 'deploy' | 'orbit';

const _v = new THREE.Vector3(), _d = new THREE.Vector3();

export class BattleCamera {
  readonly rig: CameraRig;
  mode: CamMode = 'tactica';
  /** Point the camera follows (Elias or the action). */
  readonly follow = new THREE.Vector3();
  /** Where the cursor points on the ground (set by the player controller). */
  readonly aim = new THREE.Vector3();
  lookAhead = 0.25;
  private focusPt: THREE.Vector3 | null = null;
  private focusGetter: (() => THREE.Vector3 | null) | null = null;
  private focusT = 0;
  private focusDist = 0;
  private savedDist = 20;
  private pan = new THREE.Vector3();
  private orbitManualT = 0;
  tacYaw = Math.PI;
  tacPitch = 0.72;
  tacDist = 16;
  shoulderYaw = Math.PI;
  shoulderPitch = 0.28;
  launchTarget: (() => THREE.Vector3) | null = null;

  constructor(readonly camera: THREE.PerspectiveCamera) {
    this.rig = new CameraRig(camera);
    this.rig.minDistance = 4; this.rig.maxDistance = 90;
    this.rig.yaw = this.tacYaw; this.rig.pitch = this.tacPitch; this.rig.distance = this.tacDist;
  }

  setMode(m: CamMode): void {
    if (m === this.mode) return;
    if (this.mode === 'hombro') input.exitPointerLock();
    this.mode = m;
    const r = this.rig;
    if (m === 'tactica') { r.yaw = this.tacYaw; r.pitch = this.tacPitch; r.distance = this.tacDist; r.lookOffset.set(0, 1.2, 0); r.followK = 9; }
    else if (m === 'hombro') { this.shoulderYaw = this.tacYaw; r.distance = 5.6; r.followK = 14; }
    else if (m === 'deploy') { r.yaw = Math.PI; r.pitch = 1.08; r.distance = 48; r.lookOffset.set(0, 0, 0); r.followK = 6; this.pan.set(0, 0, -10); }
    else if (m === 'orbit') { r.yaw = Math.PI * 0.85; r.pitch = 0.62; r.distance = 46; r.lookOffset.set(0, 1, 0); r.followK = 3; this.pan.set(0, 0, 0); }
  }

  /** Scripted focus: a fixed point, a getter (moving unit) or null to release. */
  focus(target: THREE.Vector3 | (() => THREE.Vector3 | null) | null, distance = 12, duration = 0): void {
    if (!target) { this.focusPt = null; this.focusGetter = null; this.rig.distance = this.savedDist; return; }
    if (!this.focusPt && !this.focusGetter) this.savedDist = this.rig.distance;
    if (typeof target === 'function') { this.focusGetter = target; this.focusPt = null; }
    else { this.focusPt = target.clone(); this.focusGetter = null; }
    this.focusDist = distance; this.focusT = duration;
    this.rig.distance = distance;
  }
  get focusing(): boolean { return !!(this.focusPt || this.focusGetter); }

  /** Forward/right on the ground plane (for WASD relative to the camera). */
  groundBasis(out: { fx: number; fz: number; rx: number; rz: number }): void {
    const yaw = this.mode === 'hombro' ? this.shoulderYaw : this.rig.yaw;
    out.fx = -Math.sin(yaw); out.fz = -Math.cos(yaw);
    // screen-right = forward × up
    out.rx = -out.fz; out.rz = out.fx;
  }

  /** Ray from NDC onto the horizontal plane y = h. Returns false if parallel/behind. */
  ndcToGround(nx: number, ny: number, h: number, out: THREE.Vector3): boolean {
    const cam = this.camera;
    _v.set(nx, ny, 0.5).unproject(cam);
    _d.copy(_v).sub(cam.position).normalize();
    if (Math.abs(_d.y) < 1e-4) return false;
    const t = (h - cam.position.y) / _d.y;
    if (t <= 0) return false;
    out.copy(cam.position).addScaledVector(_d, t);
    return true;
  }

  /** Real-time update: handles zoom/orbit input and follows. */
  update(realDt: number, allowInput: boolean): void {
    const r = this.rig;
    if (this.launchTarget) {
      const p = this.launchTarget();
      r.follow(p);
      r.distance += (16 - r.distance) * (1 - Math.exp(-2 * realDt));
      r.pitch += (0.12 - r.pitch) * (1 - Math.exp(-2 * realDt));
      r.update(realDt);
      return;
    }
    if (this.focusGetter || this.focusPt) {
      const p = this.focusGetter ? this.focusGetter() : this.focusPt;
      if (p) r.follow(p);
      if (this.focusT > 0) { this.focusT -= realDt; if (this.focusT <= 0) this.focus(null); }
      r.update(realDt);
      return;
    }
    const wheel = allowInput ? input.mouse.wheel : 0;
    switch (this.mode) {
      case 'tactica': {
        if (wheel) { this.tacDist = clamp(this.tacDist * (1 + wheel * 0.1), 9, 42); }
        if (allowInput && input.mouse.buttons[1]) { this.tacYaw -= input.mouse.dx * 0.005; this.tacPitch = clamp(this.tacPitch + input.mouse.dy * 0.003, 0.45, 1.35); }
        r.distance = this.tacDist; r.yaw += (this.tacYaw - r.yaw) * (1 - Math.exp(-12 * realDt)); r.pitch = this.tacPitch;
        _v.copy(this.aim).sub(this.follow); _v.y = 0;
        const l = _v.length();
        if (l > 14) _v.multiplyScalar(14 / l);
        r.follow(_v.multiplyScalar(this.lookAhead).add(this.follow));
        r.lookOffset.set(0, 1.2, 0);
        break;
      }
      case 'hombro': {
        if (allowInput && input.pointerLocked) {
          this.shoulderYaw -= input.mouse.dx * 0.0026;
          this.shoulderPitch = clamp(this.shoulderPitch + input.mouse.dy * 0.002, -0.35, 1.05);
        }
        if (wheel) r.distance = clamp(r.distance * (1 + wheel * 0.1), 3, 12);
        r.yaw = this.shoulderYaw; r.pitch = this.shoulderPitch;
        // shoulder offset to the right of the view
        const rx = -Math.cos(r.yaw), rz = Math.sin(r.yaw);
        r.lookOffset.set(rx * 0.9, 1.75, rz * 0.9);
        r.follow(this.follow);
        break;
      }
      case 'deploy': {
        if (wheel) r.distance = clamp(r.distance * (1 + wheel * 0.1), 18, 90);
        if (allowInput) {
          const sp = r.distance * 0.9 * realDt;
          const b = { fx: 0, fz: 0, rx: 0, rz: 0 }; this.groundBasis(b);
          const mv = input.moveVector();
          this.pan.x += (b.fx * mv.y + b.rx * mv.x) * sp; this.pan.z += (b.fz * mv.y + b.rz * mv.x) * sp;
          if (input.mouse.buttons[1] || input.mouse.buttons[2]) { r.yaw -= input.mouse.dx * 0.004; r.pitch = clamp(r.pitch + input.mouse.dy * 0.003, 0.5, 1.45); }
          this.pan.x = clamp(this.pan.x, -60, 60); this.pan.z = clamp(this.pan.z, -60, 60);
        }
        r.follow(this.pan);
        break;
      }
      case 'orbit': {
        if (wheel) { r.distance = clamp(r.distance * (1 + wheel * 0.1), 10, 90); this.orbitManualT = 4; }
        if (allowInput && (input.mouse.buttons[0] || input.mouse.buttons[2]) && !input.mouse.overUI) {
          r.yaw -= input.mouse.dx * 0.005; r.pitch = clamp(r.pitch + input.mouse.dy * 0.003, 0.15, 1.4);
          if (input.mouse.dx || input.mouse.dy) this.orbitManualT = 4;
        }
        const mv = allowInput ? input.moveVector() : { x: 0, y: 0 };
        if (mv.x || mv.y) {
          const b = { fx: 0, fz: 0, rx: 0, rz: 0 }; this.groundBasis(b);
          const sp = r.distance * 0.8 * realDt;
          this.pan.x += (b.fx * mv.y + b.rx * mv.x) * sp; this.pan.z += (b.fz * mv.y + b.rz * mv.x) * sp;
          this.orbitManualT = 6;
        } else if (this.orbitManualT <= 0) {
          this.pan.lerp(this.follow, 1 - Math.exp(-0.8 * realDt));
          r.yaw += realDt * 0.03;
        }
        this.orbitManualT -= realDt;
        r.follow(this.pan);
        break;
      }
    }
    r.update(realDt);
  }

  snap(p: THREE.Vector3): void { this.follow.copy(p); this.pan.copy(p); this.rig.follow(p, true); }
}
