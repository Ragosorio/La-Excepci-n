/**
 * Verlet ragdolls (Jakobsen) running directly on the unit skeleton joints (u.J current, u.JP previous).
 * Bodies inherit knockback velocity, tumble, settle and freeze; frozen corpses stay (permanence) until they sink.
 */
import type { Units } from './units';
import {
  J_ELL, J_ELR, J_FOOTL, J_FOOTR, J_HANDL, J_HANDR, J_HEAD, J_HIPL, J_HIPR, J_KNEEL, J_KNEER, J_NECK, J_PELVIS, J_SHL, J_SHR, MAXU, NJ, S_DEAD,
} from './const';

const STICKS = new Uint8Array([
  J_HEAD, J_NECK, J_NECK, J_PELVIS, J_NECK, J_SHL, J_NECK, J_SHR, J_SHL, J_ELL, J_ELL, J_HANDL, J_SHR, J_ELR, J_ELR, J_HANDR,
  J_PELVIS, J_HIPL, J_PELVIS, J_HIPR, J_HIPL, J_KNEEL, J_KNEEL, J_FOOTL, J_HIPR, J_KNEER, J_KNEER, J_FOOTR,
  // braces (torso box + head)
  J_SHL, J_SHR, J_HIPL, J_HIPR, J_SHL, J_PELVIS, J_SHR, J_PELVIS, J_SHL, J_HIPL, J_SHR, J_HIPR, J_HEAD, J_SHL, J_HEAD, J_SHR,
  // weak limb braces keep limbs from folding flat
  J_HIPL, J_FOOTL, J_HIPR, J_FOOTR,
]);
const NST = STICKS.length / 2;
const WEAK_FROM = NST - 2;
const MAX_ACTIVE = 42;

export class Ragdolls {
  private rest = new Float32Array(MAXU * NST);
  private active: number[] = [];
  gravity = -20;

  constructor(private groundAt: (x: number, z: number) => number) {}

  /** Start simulating unit i (joints and previous joints must be seeded). */
  start(u: Units, i: number): void {
    const J = u.J, o = i * NJ * 3, ro = i * NST;
    for (let s = 0; s < NST; s++) {
      const a = o + STICKS[s * 2] * 3, b = o + STICKS[s * 2 + 1] * 3;
      this.rest[ro + s] = Math.hypot(J[b] - J[a], J[b + 1] - J[a + 1], J[b + 2] - J[a + 2]);
    }
    u.ragOn[i] = 1; u.ragStill[i] = 0;
    if (!this.active.includes(i)) this.active.push(i);
    while (this.active.length > MAX_ACTIVE) {
      const old = this.active.shift()!;
      u.ragOn[old] = 2;
    }
  }

  /** Add an impulse (m/s) to every joint of a ragdolled unit (explosions hitting corpses). */
  kick(u: Units, i: number, vx: number, vy: number, vz: number, dt = 1 / 60): void {
    if (u.state[i] !== S_DEAD) return;
    const o = i * NJ * 3;
    for (let j = 0; j < NJ; j++) { const q = o + j * 3; u.JP[q] -= vx * dt; u.JP[q + 1] -= vy * dt; u.JP[q + 2] -= vz * dt; }
    if (u.ragOn[i] !== 1) this.start(u, i);
  }

  update(u: Units, dt: number): void {
    if (dt <= 0) return;
    const h = Math.min(dt, 1 / 30);
    const g = this.gravity * h * h;
    const J = u.J, JP = u.JP;
    for (let a = this.active.length - 1; a >= 0; a--) {
      const i = this.active[a];
      if (!u.active[i] || u.state[i] !== S_DEAD || u.ragOn[i] !== 1) { this.active.splice(a, 1); continue; }
      const o = i * NJ * 3, ro = i * NST;
      const rad = 0.07 * u.scale[i];
      // integrate
      for (let j = 0; j < NJ; j++) {
        const q = o + j * 3;
        const x = J[q], y = J[q + 1], z = J[q + 2];
        const damp = 0.992;
        J[q] = x + (x - JP[q]) * damp; J[q + 1] = y + (y - JP[q + 1]) * damp + g; J[q + 2] = z + (z - JP[q + 2]) * damp;
        JP[q] = x; JP[q + 1] = y; JP[q + 2] = z;
      }
      // constraints
      for (let it = 0; it < 5; it++) {
        for (let s = 0; s < NST; s++) {
          const pa = o + STICKS[s * 2] * 3, pb = o + STICKS[s * 2 + 1] * 3;
          const dx = J[pb] - J[pa], dy = J[pb + 1] - J[pa + 1], dz = J[pb + 2] - J[pa + 2];
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
          let r = this.rest[ro + s];
          if (s >= WEAK_FROM) { r *= 0.6; if (d > r) continue; } // weak braces only push apart
          const k = ((d - r) / d) * 0.5;
          J[pa] += dx * k; J[pa + 1] += dy * k; J[pa + 2] += dz * k;
          J[pb] -= dx * k; J[pb + 1] -= dy * k; J[pb + 2] -= dz * k;
        }
        for (let j = 0; j < NJ; j++) {
          const q = o + j * 3;
          const gy = this.groundAt(J[q], J[q + 2]) + rad;
          if (J[q + 1] < gy) J[q + 1] = gy;
        }
      }
      // ground friction + stillness
      let move = 0;
      for (let j = 0; j < NJ; j++) {
        const q = o + j * 3;
        const gy = this.groundAt(J[q], J[q + 2]) + rad + 0.01;
        if (J[q + 1] <= gy) { JP[q] += (J[q] - JP[q]) * 0.35; JP[q + 2] += (J[q + 2] - JP[q + 2]) * 0.35; }
        move += Math.abs(J[q] - JP[q]) + Math.abs(J[q + 1] - JP[q + 1]) + Math.abs(J[q + 2] - JP[q + 2]);
      }
      if (move < 0.004 * u.scale[i]) { if (++u.ragStill[i] > 30) { u.ragOn[i] = 2; this.active.splice(a, 1); } }
      else u.ragStill[i] = 0;
      // keep the unit root near the pelvis (for sinking / queries)
      u.x[i] = J[o + J_PELVIS * 3]; u.y[i] = J[o + J_PELVIS * 3 + 1]; u.z[i] = J[o + J_PELVIS * 3 + 2];
    }
  }

  clear(): void { this.active.length = 0; }
  get activeCount(): number { return this.active.length; }
}
