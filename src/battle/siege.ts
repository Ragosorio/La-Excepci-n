/**
 * Siege defenses (asedio): a wall line with a gate and two archer towers. Segments are destructible by
 * explosions and by attackers pressing against them; towers collapse and their archers fall (ragdoll comedy).
 */
import * as THREE from 'three';
import type { Battle } from './world';
import { PartMesh } from './crowd';
import { crowdMaterial } from './crowdmat';
import { GB } from './geo';
import { propGeo } from './props';
import { hexLinear, writeYaw } from './mathx';
import { F_TOWER, S_AIR, S_DEAD, S_ATTACK, TEAM_ENEMY, FIELD } from './const';
import { specAt } from './defs';

const SEG_W = 4.4;
const THICK = 1.8;

interface Seg { x0: number; x1: number; hp: number; max: number; alive: boolean; gate: boolean; hitT: number }
interface Tower { x: number; z: number; hp: number; max: number; alive: boolean; archers: number[] }

export class Siege {
  readonly z: number;
  private segs: Seg[] = [];
  private towers: Tower[] = [];
  private wallMesh: PartMesh;
  private gateMesh: PartMesh;
  private towerMesh: PartMesh;
  private rubble: PartMesh;
  private mats: THREE.Material[] = [];
  private col = [0, 0, 0];
  private dirty = true;
  private rubbleN = 0;

  constructor(private b: Battle, z = 16) {
    this.z = z;
    const x0 = -FIELD - 4;
    const n = Math.ceil((FIELD * 2 + 8) / SEG_W);
    for (let k = 0; k < n; k++) {
      const a = x0 + k * SEG_W, c = a + SEG_W;
      const gate = a < 2 && c > -2;
      this.segs.push({ x0: a, x1: c, hp: gate ? 900 : 600, max: gate ? 900 : 600, alive: true, gate, hitT: 0 });
    }
    const mat = crowdMaterial({ rim: 0.08, bands: [0.5, 0.8, 1] });
    this.mats.push(mat);
    const wg = new GB().add(new THREE.BoxGeometry(1, 1, 1), '#ffffff', [0, 2.6, 0], [SEG_W + 0.05, 5.2, THICK], [0, 0, 0], 1);
    for (let i = -1; i <= 1; i++) wg.add(new THREE.BoxGeometry(1, 1, 1), '#ffffff', [i * 1.5, 5.6, 0], [0.9, 0.8, THICK + 0.1], [0, 0, 0], 1);
    this.wallMesh = new PartMesh(b.scene, wg.build(), mat, this.segs.length, { outline: true, castShadow: true });
    const gg = new GB().add(new THREE.BoxGeometry(1, 1, 1), '#6a4a30', [0, 2.2, 0], [SEG_W - 0.3, 4.4, 0.5]);
    for (let i = -1; i <= 1; i++) gg.add(new THREE.BoxGeometry(1, 1, 1), '#3a3034', [0, 1 + (i + 1) * 1.4, 0.3], [SEG_W - 0.2, 0.18, 0.1]);
    gg.add(new THREE.BoxGeometry(1, 1, 1), '#a8a090', [-SEG_W / 2 - 0.3, 3, 0], [0.9, 6, THICK + 0.3]).add(new THREE.BoxGeometry(1, 1, 1), '#a8a090', [SEG_W / 2 + 0.3, 3, 0], [0.9, 6, THICK + 0.3]);
    this.gateMesh = new PartMesh(b.scene, gg.build(), mat, 2, { outline: true, castShadow: true });
    this.towerMesh = new PartMesh(b.scene, propGeo('tower'), mat, 2, { outline: true, castShadow: true });
    this.rubble = new PartMesh(b.scene, propGeo('boulders'), mat, 64, { outline: true });
    for (const tx of [-17, 17]) {
      const t: Tower = { x: tx, z: z + 4, hp: 1400, max: 1400, alive: true, archers: [] };
      this.towers.push(t);
      b.arena.obstacles.push({ x: tx, z: z + 4, r: 2.6 });
    }
  }

  /** Put archers on the towers (called after the enemy army spawns). */
  manTowers(archerId: string): void {
    const b = this.b, u = b.u;
    for (const t of this.towers) {
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2;
        const i = b.spawn(archerId, TEAM_ENEMY, t.x + Math.cos(a) * 1.1, t.z + Math.sin(a) * 1.1, { y: b.heightAt(t.x, t.z) + 8.7, yaw: Math.PI });
        if (i < 0) continue;
        u.flags[i] |= F_TOWER;
        u.range[i] = Math.max(u.range[i], 30);
        t.archers.push(i);
      }
    }
  }

  /** Blocks units from crossing intact segments. */
  collide(i: number): void {
    const u = this.b.u;
    if (u.state[i] === S_AIR || (u.flags[i] & F_TOWER)) return;
    const dz = u.z[i] - this.z, r = u.radius[i] + THICK / 2;
    if (Math.abs(dz) >= r) return;
    const s = this.segAt(u.x[i]);
    if (!s || !s.alive) return;
    u.z[i] = this.z + (dz >= 0 ? r : -r);
    if (u.state[i] !== S_ATTACK && u.side[i] !== TEAM_ENEMY) this.press(i, s);
  }

  private segAt(x: number): Seg | null {
    const k = Math.floor((x - this.segs[0].x0) / SEG_W);
    return this.segs[k] ?? null;
  }

  /** Attackers pushing on a wall start swinging at it. */
  private press(i: number, s: Seg): void {
    const b = this.b, u = b.u;
    if (u.atkT[i] > 0 || specAt(u.spec[i]).ranged) return;
    u.state[i] = S_ATTACK; u.atkPh[i] = 0; u.atkHit[i] = 1; u.atkDur[i] = 0.6 * (1 + (u.scale[i] - 1) * 0.2);
    u.atkT[i] = u.atkCd[i];
    u.yaw[i] = 0;
    const siege = specAt(u.spec[i]).role === 'monstruo' || specAt(u.spec[i]).role === 'asedio' ? 3 : 1;
    this.hitSeg(s, u.dmg[i] * u.dmgMul[i] * siege, u.x[i]);
  }

  private hitSeg(s: Seg, dmg: number, x: number): void {
    const b = this.b;
    s.hp -= dmg; s.hitT = 0.15;
    b.fx.emit('dust', b.tmpV.set(x, 1.5, this.z), { count: 3, scale: 0.6 });
    if (s.hp <= 0 && s.alive) {
      s.alive = false;
      this.dirty = true;
      const cx = (s.x0 + s.x1) / 2;
      b.fx.emit('earth', b.tmpV.set(cx, 2.5, this.z), { count: 40, scale: 1.8, speed: 10 });
      b.fx.emit('smoke', b.tmpV, { count: 20, scale: 2 });
      b.sfx('explosion', cx, this.z, 1, 0.6, 0);
      b.cam.rig.shake(0.5);
      b.callout(s.gate ? '¡LA PUERTA CEDE!' : '¡BRECHA EN LA MURALLA!', 'captain');
      this.addRubble(cx, this.z);
    }
  }

  /** Explosions damage walls and towers. */
  blast(x: number, z: number, r: number, dmg: number): void {
    if (Math.abs(z - this.z) < r + THICK) {
      for (const s of this.segs) if (s.alive && x + r > s.x0 && x - r < s.x1) this.hitSeg(s, dmg * 1.5, x);
    }
    for (const t of this.towers) {
      if (!t.alive) continue;
      if (Math.hypot(t.x - x, t.z - z) < r + 2.6) { t.hp -= dmg * 1.2; if (t.hp <= 0) this.collapse(t); }
    }
  }

  private collapse(t: Tower): void {
    const b = this.b, u = b.u;
    t.alive = false;
    this.dirty = true;
    b.arena.obstacles.splice(b.arena.obstacles.findIndex((o) => o.x === t.x && o.z === t.z), 1);
    b.fx.emit('earth', b.tmpV.set(t.x, 5, t.z), { count: 60, scale: 2.5, speed: 12 });
    b.fx.emit('smoke', b.tmpV, { count: 30, scale: 3 });
    b.sfx('explosion', t.x, t.z, 1, 0.5, 0);
    b.cam.rig.shake(0.8);
    b.callout('¡LA TORRE SE DERRUMBA!', 'captain');
    for (const a of t.archers) {
      if (!b.alive(a)) continue;
      u.flags[a] &= ~F_TOWER;
      u.state[a] = S_AIR; u.stT[a] = 0;
      u.vx[a] = (Math.random() - 0.5) * 8; u.vz[a] = (Math.random() - 0.5) * 8; u.vy[a] = 4 + Math.random() * 4;
      u.spinP[a] = -8 + Math.random() * 16;
    }
    this.addRubble(t.x, t.z);
    this.addRubble(t.x + 2, t.z - 1);
  }

  private addRubble(x: number, z: number): void {
    if (this.rubbleN > 60) return;
    this.rubbleN++;
    this.b.arena.obstacles.push({ x, z, r: 0.8 });
    this.dirty = true;
    this.rubbleList.push([x, z, Math.random() * 6, 0.7 + Math.random() * 0.6]);
  }
  private rubbleList: Array<[number, number, number, number]> = [];

  update(dt: number): void {
    const b = this.b, u = b.u;
    let pressing = false;
    for (const s of this.segs) if (s.hitT > 0) { s.hitT -= dt; pressing = true; }
    // tower archers stay put
    for (const t of this.towers) for (const a of t.archers) {
      if (!u.active[a] || u.state[a] === S_DEAD || !(u.flags[a] & F_TOWER)) continue;
      u.vx[a] = u.vz[a] = 0;
      u.y[a] = b.heightAt(t.x, t.z) + 8.7;
    }
    if (!this.dirty && !pressing) return;
    this.dirty = false;
    const cw = this.col, gy = (x: number) => b.heightAt(x, this.z);
    this.wallMesh.begin(); this.gateMesh.begin(); this.towerMesh.begin(); this.rubble.begin();
    hexLinear('#b0a898', cw);
    for (const s of this.segs) {
      if (!s.alive) continue;
      const cx = (s.x0 + s.x1) / 2;
      const m = s.gate ? this.gateMesh : this.wallMesh;
      const k = m.next();
      if (k < 0) continue;
      const shake = s.hitT > 0 ? (Math.random() - 0.5) * 0.12 : 0;
      writeYaw(m.m, k * 16, cx + shake, gy(cx), this.z, 0, 1, 1, 1);
      const dmg = s.hp / s.max;
      m.setRGB(k, cw[0] * (0.7 + dmg * 0.3), cw[1] * (0.7 + dmg * 0.3), cw[2] * (0.7 + dmg * 0.3));
      m.setFx(k, s.hitT > 0 ? 0.3 : 0, 0);
    }
    for (const t of this.towers) {
      if (!t.alive) continue;
      const k = this.towerMesh.next();
      writeYaw(this.towerMesh.m, k * 16, t.x, b.heightAt(t.x, t.z), t.z, Math.PI, 1, 1, 1);
      this.towerMesh.setRGB(k, cw[0], cw[1], cw[2]); this.towerMesh.setFx(k, 0, 0);
    }
    for (const [x, z, a, s] of this.rubbleList) {
      const k = this.rubble.next();
      if (k < 0) break;
      writeYaw(this.rubble.m, k * 16, x, b.heightAt(x, z) - 0.2, z, a, s, s * 0.7, s);
      this.rubble.setRGB(k, cw[0] * 0.8, cw[1] * 0.8, cw[2] * 0.8); this.rubble.setFx(k, 0, 0);
    }
    this.wallMesh.end(); this.gateMesh.end(); this.towerMesh.end(); this.rubble.end();
  }

  dispose(): void {
    this.wallMesh.dispose(); this.gateMesh.dispose(); this.towerMesh.dispose(); this.rubble.dispose();
    for (const m of this.mats) m.dispose();
  }
}
