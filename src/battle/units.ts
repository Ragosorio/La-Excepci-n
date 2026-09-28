/**
 * Structure-of-arrays unit store. Every battle unit (crowd, heroes, Elias, clones, corpses) lives in a slot.
 * Hot loops read these typed arrays directly; no per-unit objects are allocated during the fight.
 */
import { MAXU, NA, NJ, NS, S_FREE, S_IDLE, EX_NEUTRAL } from './const';
import { specAt, type UnitSpec } from './defs';
import { hexLinear, hash1 } from './mathx';

export const COL_STRIDE = 21; // skin, hair, outfit, outfit2, pants, boots, team (3 floats each)
export const C_SKIN = 0, C_HAIR = 3, C_OUT = 6, C_OUT2 = 9, C_PANTS = 12, C_BOOTS = 15, C_TEAM = 18;

export const TEAM_COLORS = ['#5a8cff', '#ff4a5a', '#ffb347'];
export const MIND_COLOR = '#c77dff';

export class Units {
  /** High-water mark: slots [0, n) may be in use. */
  n = 0;
  private freeList: number[] = [];

  readonly gen = new Uint16Array(MAXU);
  readonly active = new Uint8Array(MAXU);
  readonly team = new Uint8Array(MAXU);
  readonly side = new Uint8Array(MAXU);
  readonly state = new Uint8Array(MAXU);
  readonly stT = new Float32Array(MAXU);      // time spent in state
  readonly stDur = new Float32Array(MAXU);    // expected state duration
  readonly flags = new Uint32Array(MAXU);
  readonly spec = new Int16Array(MAXU);
  readonly armyIdx = new Int16Array(MAXU);
  readonly rig = new Int16Array(MAXU);
  readonly seed = new Float32Array(MAXU);
  readonly variant = new Uint8Array(MAXU);
  readonly hair = new Int8Array(MAXU);
  readonly stars = new Uint8Array(MAXU);

  // physics
  readonly x = new Float32Array(MAXU);
  readonly y = new Float32Array(MAXU);
  readonly z = new Float32Array(MAXU);
  readonly vx = new Float32Array(MAXU);
  readonly vy = new Float32Array(MAXU);
  readonly vz = new Float32Array(MAXU);
  readonly yaw = new Float32Array(MAXU);
  readonly pitch = new Float32Array(MAXU);
  readonly roll = new Float32Array(MAXU);
  readonly pitchV = new Float32Array(MAXU);
  readonly rollV = new Float32Array(MAXU);
  readonly spinP = new Float32Array(MAXU);
  readonly spinR = new Float32Array(MAXU);
  readonly tumble = new Float32Array(MAXU);   // accumulated tumble pitch (airborne)
  readonly tumbleR = new Float32Array(MAXU);
  readonly scale = new Float32Array(MAXU);
  readonly radius = new Float32Array(MAXU);
  readonly mass = new Float32Array(MAXU);

  // stats
  readonly hp = new Float32Array(MAXU);
  readonly hpMax = new Float32Array(MAXU);
  readonly dmg = new Float32Array(MAXU);
  readonly dmgMul = new Float32Array(MAXU);
  readonly armor = new Float32Array(MAXU);
  readonly speed = new Float32Array(MAXU);
  readonly range = new Float32Array(MAXU);
  readonly atkCd = new Float32Array(MAXU);
  readonly atkT = new Float32Array(MAXU);
  readonly morale = new Float32Array(MAXU);
  readonly moraleBase = new Float32Array(MAXU);
  readonly knock = new Float32Array(MAXU);

  // AI
  readonly target = new Int16Array(MAXU);
  readonly retargetT = new Float32Array(MAXU);
  readonly attackers = new Uint8Array(MAXU);
  readonly order = new Uint8Array(MAXU);
  readonly homeX = new Float32Array(MAXU);
  readonly homeZ = new Float32Array(MAXU);
  readonly moveX = new Float32Array(MAXU);
  readonly moveZ = new Float32Array(MAXU);
  readonly moveOn = new Uint8Array(MAXU);
  readonly castAb = new Int16Array(MAXU);
  readonly castT = new Float32Array(MAXU);
  readonly castTx = new Float32Array(MAXU);
  readonly castTz = new Float32Array(MAXU);
  readonly castTu = new Int16Array(MAXU);
  readonly abil = new Int16Array(MAXU * NA);
  readonly abilCd = new Float32Array(MAXU * NA);
  readonly abilCheckT = new Float32Array(MAXU);
  readonly lastHitBy = new Int16Array(MAXU);
  readonly sinceHit = new Float32Array(MAXU);
  readonly kills = new Uint16Array(MAXU);
  readonly lifeT = new Float32Array(MAXU);     // summons/clones expire (0 = forever)
  readonly heldBy = new Int16Array(MAXU);      // grabbed by an ogre

  // intent (written by AI / controllers, consumed by the integrator)
  readonly wantX = new Float32Array(MAXU);
  readonly wantZ = new Float32Array(MAXU);
  readonly wantYaw = new Float32Array(MAXU);
  readonly wantFace = new Uint8Array(MAXU);

  // animation
  readonly walkPh = new Float32Array(MAXU);
  readonly stride = new Float32Array(MAXU);
  readonly atkPh = new Float32Array(MAXU);     // -1 idle, else 0..1
  readonly atkDur = new Float32Array(MAXU);
  readonly atkHit = new Uint8Array(MAXU);      // strike already applied this swing
  readonly flash = new Float32Array(MAXU);
  readonly expr = new Uint8Array(MAXU);
  readonly exprTmp = new Uint8Array(MAXU);
  readonly exprT = new Float32Array(MAXU);
  readonly blinkT = new Float32Array(MAXU);
  readonly lastVx = new Float32Array(MAXU);
  readonly lastVz = new Float32Array(MAXU);
  readonly deadT = new Float32Array(MAXU);
  readonly sink = new Float32Array(MAXU);
  readonly ragOn = new Uint8Array(MAXU);
  readonly ragStill = new Uint16Array(MAXU);
  readonly ghost = new Float32Array(MAXU);     // 0..1 dither (invisibility)
  readonly fxT = new Float32Array(MAXU);       // status particle timer

  // statuses
  readonly stMask = new Uint32Array(MAXU);
  readonly stTime = new Float32Array(MAXU * NS);
  readonly stMag = new Float32Array(MAXU * NS);
  readonly stSrc = new Int16Array(MAXU * NS);
  readonly dotT = new Float32Array(MAXU);

  // skeleton / ragdoll
  readonly J = new Float32Array(MAXU * NJ * 3);
  readonly JP = new Float32Array(MAXU * NJ * 3);

  // colors (linear)
  readonly col = new Float32Array(MAXU * COL_STRIDE);

  alloc(): number {
    const i = this.freeList.length ? this.freeList.pop()! : this.n < MAXU ? this.n++ : -1;
    return i;
  }

  /** Initialize a slot for a unit spec. Caller sets position/team afterwards. */
  spawn(specIdx: number, team: number): number {
    const i = this.alloc();
    if (i < 0) return -1;
    const s = specAt(specIdx);
    this.gen[i] = (this.gen[i] + 1) & 0xffff;
    this.active[i] = 1;
    this.team[i] = team; this.side[i] = team;
    this.state[i] = S_IDLE; this.stT[i] = 0; this.stDur[i] = 0;
    this.flags[i] = 0;
    this.spec[i] = specIdx;
    this.armyIdx[i] = -1; this.rig[i] = -1;
    const sd = hash1(i * 7919 + this.gen[i] * 131 + 17);
    this.seed[i] = sd;
    this.variant[i] = Math.floor(hash1(i * 31 + this.gen[i]) * 4) & 3;
    this.hair[i] = s.hairOptions.length ? s.hairOptions[Math.floor(hash1(i * 13 + this.gen[i] * 7) * s.hairOptions.length)] : -1;
    this.stars[i] = 0;
    this.x[i] = this.y[i] = this.z[i] = 0; this.vx[i] = this.vy[i] = this.vz[i] = 0;
    this.yaw[i] = 0; this.pitch[i] = this.roll[i] = this.pitchV[i] = this.rollV[i] = 0;
    this.spinP[i] = this.spinR[i] = this.tumble[i] = this.tumbleR[i] = 0;
    this.scale[i] = s.scale; this.radius[i] = s.radius; this.mass[i] = Math.max(0.3, s.def.mass || 1);
    this.hp[i] = this.hpMax[i] = s.def.hp;
    this.dmg[i] = s.def.damage; this.dmgMul[i] = 1;
    this.armor[i] = s.def.armor; this.speed[i] = s.def.speed; this.range[i] = s.def.attackRange;
    this.atkCd[i] = Math.max(0.35, s.def.attackCooldown); this.atkT[i] = 0.3 + sd * 0.8;
    this.morale[i] = this.moraleBase[i] = s.morale;
    this.knock[i] = s.knock;
    this.target[i] = -1; this.retargetT[i] = sd * 0.4; this.attackers[i] = 0; this.order[i] = 0;
    this.homeX[i] = this.homeZ[i] = 0; this.moveOn[i] = 0;
    this.castAb[i] = -1; this.castT[i] = 0; this.castTu[i] = -1;
    for (let k = 0; k < 4; k++) { this.abil[i * 4 + k] = k < s.abilities.length ? s.abilities[k] : -1; this.abilCd[i * 4 + k] = 2 + sd * 4 + k * 1.5; }
    this.abilCheckT[i] = sd;
    this.lastHitBy[i] = -1; this.sinceHit[i] = 99; this.kills[i] = 0; this.lifeT[i] = 0; this.heldBy[i] = -1;
    this.wantX[i] = this.wantZ[i] = 0; this.wantYaw[i] = 0; this.wantFace[i] = 0;
    this.walkPh[i] = sd * 6.28; this.stride[i] = 0; this.atkPh[i] = -1; this.atkDur[i] = 0.5; this.atkHit[i] = 0;
    this.flash[i] = 0; this.expr[i] = EX_NEUTRAL; this.exprTmp[i] = 0; this.exprT[i] = 0; this.blinkT[i] = 1 + sd * 4;
    this.lastVx[i] = this.lastVz[i] = 0; this.deadT[i] = 0; this.sink[i] = 0; this.ragOn[i] = 0; this.ragStill[i] = 0;
    this.ghost[i] = 0; this.fxT[i] = sd;
    this.stMask[i] = 0; this.dotT[i] = 0;
    this.stTime.fill(0, i * NS, i * NS + NS); this.stMag.fill(0, i * NS, i * NS + NS); this.stSrc.fill(-1, i * NS, i * NS + NS);
    this.colorize(i, s, team);
    return i;
  }

  colorize(i: number, s: UnitSpec, team: number): void {
    const c = this.col, o = i * COL_STRIDE, sd = this.seed[i];
    hexLinear(s.skins[Math.floor(sd * 997) % s.skins.length], c, o + C_SKIN);
    hexLinear(s.hairs[Math.floor(sd * 7919) % s.hairs.length], c, o + C_HAIR);
    hexLinear(s.outfit, c, o + C_OUT);
    hexLinear(s.outfit2, c, o + C_OUT2);
    hexLinear(s.pants, c, o + C_PANTS);
    hexLinear(s.boots, c, o + C_BOOTS);
    this.setTeamColor(i, team);
    // slight per-unit outfit variation so a regiment is not a copy-paste
    const v = 0.9 + sd * 0.2;
    c[o + C_OUT] *= v; c[o + C_OUT + 1] *= v; c[o + C_OUT + 2] *= v;
  }

  setTeamColor(i: number, side: number, mind = false, color?: string): void {
    hexLinear(color ?? (mind ? MIND_COLOR : TEAM_COLORS[side] ?? TEAM_COLORS[1]), this.col, i * COL_STRIDE + C_TEAM);
  }

  free(i: number): void {
    if (!this.active[i]) return;
    this.active[i] = 0;
    this.state[i] = S_FREE;
    this.freeList.push(i);
  }

  /** Clears the whole store (battle exit). */
  reset(): void {
    this.active.fill(0); this.state.fill(S_FREE); this.n = 0; this.freeList.length = 0;
  }

  isAlive(i: number): boolean { return i >= 0 && this.active[i] === 1 && this.state[i] !== 7 /* S_DEAD */; }
  status(i: number, s: number): number { return this.stTime[i * NS + s]; }
  specOf(i: number): UnitSpec { return specAt(this.spec[i]); }
}

export const NJ3 = NJ * 3;
