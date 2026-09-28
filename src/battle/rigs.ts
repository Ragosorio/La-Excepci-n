/**
 * Full CharacterRig units (Elias, clones, heroes, bosses, scripted specials) driven by the simulation.
 * ~24 draw calls each, so only a handful exist at once; everything else is the instanced crowd.
 */
import * as THREE from 'three';
import { buildCharacter, type CharacterRig, type CharacterSpec, type Special } from '../characters/rig';
import type { RigOverride } from './api';
import type { FaceExpr } from '../ui/art/faceAtlas';
import type { Battle } from './world';
import { rigRaceScale } from './defs';
import { frameFrom } from './mathx';
import {
  B_CHARM, B_FEAR, B_FROZEN, B_MIND, B_STUN, B_TRAITOR, EX_DEAD, F_BOSS, F_HERO, F_HIDDEN, F_PLAYER, F_RIG, F_ROUT, S_AIR, S_CAST, S_DASH, S_DEAD, S_DOWN, S_HELD,
} from './const';
import { poseGlobals } from './pose';

const EXPR: FaceExpr[] = ['neutral', 'angry', 'scared', 'hurt', 'dead', 'mind', 'happy', 'sleep', 'determined', 'eating'];
const SPECIALS = new Set<string>(['elias', 'elias_god', 'aurel', 'aurel_child', 'aurel_old', 'shadow', 'tiburcio', 'fortuna', 'ione', 'mother', 'father']);
const FR = new Float32Array(9);
const M = new THREE.Matrix4(), X = new THREE.Vector3(), Y = new THREE.Vector3(), Z = new THREE.Vector3(), D = new THREE.Vector3();

interface RigSlot { rig: CharacterRig; unit: number; expr: number; glow: string | null; deadT: number; lastPose: string; shadow: boolean }

export class Rigs {
  private slots: (RigSlot | null)[] = [];
  private overrides = new Map<number, { gen: number; ov: RigOverride }>();
  constructor(private b: Battle) {}

  /** Script override (null clears). `visible` works for any unit (also hides shadow, ring and nameplate); pose,
   *  expression and opacity apply to rig units. */
  setOverride(i: number, ov: RigOverride | null): void {
    const u = this.b.u;
    const prev = this.overrides.get(i);
    if (!ov) {
      this.overrides.delete(i);
      u.flags[i] &= ~F_HIDDEN;
      const rig = this.get(i);
      if (rig && prev) {
        if (prev.ov.visible !== undefined) rig.root.visible = true;
        const slot = this.slots[u.rig[i]];
        if (slot) slot.expr = -1; // re-apply the simulated expression
      }
      return;
    }
    this.overrides.set(i, { gen: u.gen[i], ov: { ...ov } });
    if (u.rig[i] >= 0) { const slot = this.slots[u.rig[i]]; if (slot) slot.expr = -1; }
    if (ov.visible === false) u.flags[i] |= F_HIDDEN; else u.flags[i] &= ~F_HIDDEN;
    if (ov.visible !== undefined) { const rig = this.get(i); if (rig) rig.root.visible = ov.visible; }
  }

  private overrideOf(i: number): RigOverride | null {
    if (!this.overrides.size) return null;
    const o = this.overrides.get(i);
    if (!o) return null;
    if (o.gen !== this.b.u.gen[i]) { this.overrides.delete(i); return null; }
    return o.ov;
  }

  attach(i: number, special?: string, custom?: Partial<CharacterSpec>): CharacterRig {
    const u = this.b.u, sp = u.specOf(i);
    this.detach(i);
    const sPecial = special && SPECIALS.has(special) ? (special as Special) : undefined;
    const race = custom?.race ?? (sPecial === 'elias' || sPecial === 'elias_god' || sPecial === 'shadow' ? 'excepcion' : sp.race);
    const spec: CharacterSpec = {
      seed: `bt_${i}_${u.gen[i]}_${sp.id}`,
      race,
      job: sPecial ? undefined : sp.job,
      special: sPecial,
      weapon: sPecial ? undefined : sp.weapon,
      shield: sPecial ? undefined : sp.shield,
      scale: u.scale[i] / rigRaceScale(race),
      ...custom,
    };
    const rig = buildCharacter(spec);
    const important = (u.flags[i] & (F_PLAYER | F_BOSS | F_HERO)) !== 0 || sPecial === 'aurel';
    if (!important) rig.root.traverse((o) => { o.castShadow = false; });
    this.b.scene.add(rig.root);
    let slot = this.slots.indexOf(null);
    if (slot < 0) { slot = this.slots.length; this.slots.push(null); }
    this.slots[slot] = { rig, unit: i, expr: -1, glow: null, deadT: 0, lastPose: '', shadow: important };
    u.rig[i] = slot;
    u.flags[i] |= F_RIG;
    return rig;
  }

  detach(i: number): void {
    const u = this.b.u;
    const s = u.rig[i];
    if (s < 0) return;
    const slot = this.slots[s];
    if (slot) { slot.rig.dispose(); this.slots[s] = null; }
    u.rig[i] = -1;
    u.flags[i] &= ~F_RIG;
  }

  get(i: number): CharacterRig | null { const s = this.b.u.rig[i]; return s >= 0 ? this.slots[s]?.rig ?? null : null; }

  play(i: number, action: 'attack' | 'cast' | 'point' | 'cheer', dur: number): void { this.get(i)?.play(action, dur); }
  hit(i: number, dx: number, dz: number): void { this.get(i)?.hit(D.set(dx, 0, dz)); }
  dead(i: number): void { const r = this.get(i); if (r) { r.pose = 'dead'; r.setExpression('dead'); } }
  airborne(i: number, on: boolean): void { const r = this.get(i); if (r) r.pose = on ? 'fly' : 'idle'; }

  /** Per-frame sync from the simulation (dt = game time). */
  sync(dt: number): void {
    const b = this.b, u = b.u;
    for (const slot of this.slots) {
      if (!slot) continue;
      const i = slot.unit, rig = slot.rig;
      if (!u.active[i]) continue;
      const st = u.state[i];
      const root = rig.root;
      root.position.set(u.x[i], u.y[i], u.z[i]);
      const ov = this.overrideOf(i);
      if (ov?.visible !== undefined) root.visible = ov.visible;
      const dead = st === S_DEAD;
      if (dead) {
        slot.deadT += dt;
        root.rotation.set(0, u.yaw[i], 0);
        if (u.sink[i] > 0) root.position.y -= u.sink[i];
        if (rig.pose !== 'dead') { rig.pose = 'dead'; rig.setExpression('dead'); }
        rig.update(dt, { speed: 0 });
        continue;
      }
      const pitch = u.pitch[i] * 0.6 + u.tumble[i], roll = u.roll[i] * 0.6 + u.tumbleR[i];
      if (pitch !== 0 || roll !== 0) {
        frameFrom(FR, u.yaw[i], pitch, roll);
        Z.set(FR[0], FR[1], FR[2]); Y.set(FR[3], FR[4], FR[5]); X.set(-FR[6], -FR[7], -FR[8]);
        M.makeBasis(X, Y, Z);
        root.quaternion.setFromRotationMatrix(M);
      } else root.rotation.set(0, u.yaw[i], 0);
      const mask = u.stMask[i];
      let pose: CharacterRig['pose'] = 'idle';
      if (st === S_AIR || st === S_HELD) pose = 'fly';
      else if (st === S_DOWN) pose = 'lie';
      else if (st === S_CAST) pose = 'cast';
      else if (st === S_DASH) pose = 'idle';
      else if (poseGlobals.cheerTeam >= 0 && u.side[i] === poseGlobals.cheerTeam) pose = 'cheer';
      if (ov?.pose) { if (rig.pose !== ov.pose) rig.pose = ov.pose; }
      else if (pose !== rig.pose && !(rig.pose === 'dead')) rig.pose = pose;
      const speed = (mask & B_FROZEN) ? 0 : Math.hypot(u.vx[i], u.vz[i]);
      rig.update((mask & B_FROZEN) ? 0 : dt, { speed, airborne: st === S_AIR || st === S_HELD });
      // expressions
      let e = u.exprT[i] > 0 ? u.exprTmp[i] : u.expr[i];
      if (mask & (B_MIND | B_TRAITOR)) e = 5;
      else if ((mask & B_FEAR) || (u.flags[i] & F_ROUT) || st === S_AIR) e = 2;
      else if (mask & B_STUN) e = 3;
      else if (mask & B_CHARM) e = 6;
      if (e === EX_DEAD) e = 3;
      if (ov?.expression) { if (slot.expr !== -2) { slot.expr = -2; rig.setExpression(ov.expression); } }
      else if (e !== slot.expr) { slot.expr = e; rig.setExpression(EXPR[e] ?? 'neutral'); }
      const glow = (mask & (B_MIND | B_TRAITOR)) ? '#ff7bf0' : null;
      if (glow !== slot.glow && !(u.flags[i] & F_PLAYER)) { slot.glow = glow; rig.setEyeGlow(glow); }
      rig.setOpacity(ov?.opacity ?? 1 - Math.min(0.88, u.ghost[i] * (u.flags[i] & F_PLAYER ? 0.75 : 1)));
    }
  }

  /** All rig units (for nameplates etc.). */
  units(): number[] { return this.slots.filter((s): s is RigSlot => !!s).map((s) => s.unit); }

  disposeAll(): void {
    for (const s of this.slots) if (s) { s.rig.dispose(); this.b.u.rig[s.unit] = -1; }
    this.slots.length = 0;
    this.overrides.clear();
  }
}

