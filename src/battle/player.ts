/**
 * Elias controller: camera-relative movement, mouse aim + reticle + soft aim assist, buffered inputs,
 * dodge with i-frames and afterimages, Chispa Arcana / titan punches, hotbar casting (mana, cooldowns),
 * Retorno, mind-inversion, Velo crits, transforms, army orders, scripted launches.
 */
import * as THREE from 'three';
import type { Battle } from './world';
import type { AbilityRT } from './defs';
import { abilityRT, abilityRTFor } from './defs';
import { input } from '../core/input';
import { engine } from '../core/engine';
import { G } from '../core/state';
import { track } from '../core/tracker';
import { audio } from '../audio';
import { effectiveAbility, equippedAbilities, equipSlot, knows } from '../systems/progression/codex';
import {
  armor as statArmor, cooldownMult, critChance, critMult, damageMult, effective, hasOathSave, hpRegen, killHealFraction, lifesteal, manaCostMult,
  manaRegen, maxHp, maxMana, moveSpeedMult, playerOnHitEffects, rangeMult, rangedDamageMult, reflectFraction, retornoCharges, backstabCritBonus,
  enemyTimeSlow, immuneStatuses, seesInvisible,
} from '../systems/progression/stats';
import { cutin } from '../ui/toasts';
import { portraitSVG } from '../ui/art/portraits';
import {
  B_DISABLED, B_INVIS, B_TOAD, F_BOSS, F_CAPTAIN, F_HERO, F_PLAYER, S_AIR, S_CAST, S_DASH, S_DEAD, S_DOWN, S_HELD, S_IDLE,
} from './const';
import { applyEffects, comprehendHit, damage, explode, heal, K_MELEE } from './combat';
import { applyStatus, clearStatuses, removeStatus, speedMul } from './status';
import { angDiff } from './mathx';

export interface Loadout { lmb: string; rmb: string | null; slots: (string | null)[]; relics: (string | null)[]; ult: string | null }

const DEBUG_KIT: Loadout = {
  lmb: 'chispa_arcana', rmb: 'golpe_titanico',
  slots: ['dominar_mente', 'velo', 'mil_cortes', 'clones_sombra'], relics: ['metamorfosis', 'paso_fantasma'], ult: 'eclipse_total',
};
const DEBUG_KNOWN = new Set(['fuerza_titanica', 'golpe_titanico', 'dominar_mente', 'velo', 'retorno', 'mil_cortes', 'clones_sombra', 'metamorfosis', 'paso_fantasma', 'eclipse_total', 'traicion']);

const BUF = new Int32Array(64);
const ACTIONS = ['lmb', 'rmb', 'slot1', 'slot2', 'slot3', 'slot4', 'slot5', 'relic1', 'relic2', 'ultimate', 'dodge'] as const;
type Act = (typeof ACTIONS)[number];

function safe<T>(fn: () => T, fb: T): T { try { return fn(); } catch { return fb; } }

export class PlayerCtl {
  mana = 60;
  manaMax = 60;
  regen = 6;
  invulnerable = false;
  minHp = 0;
  controlsInverted = false;
  locked = false;
  traitorChance = 0;
  retornoUsed = 0;
  retornoMax = 1;
  dead = false;
  loadout: Loadout;
  readonly cds = new Map<string, number>();
  readonly cdMax = new Map<string, number>();
  readonly aim = new THREE.Vector3();
  hover = -1;
  dodgeCharges = 2;
  dodgeMax = 2;
  private dodgeRe = 0;
  private iframeT = 0;
  private dashT = 0;
  private dashX = 0; private dashZ = 0;
  private lmbT = 0;
  private buf = new Map<Act, number>();
  private mindT = 0;
  private veilCrit = false;
  private juramento = false;
  private reviving = 0;
  private transformed = false;
  private reticle: THREE.Group;
  private reticleMat: THREE.MeshBasicMaterial;
  private launchT = 0;
  private moteT = 0;
  private hitSlow = 0;
  debugKit = false;
  onFinalDeath: (() => void) | null = null;
  onDeathHook: (() => boolean) | null = null;
  /** Progression battle helpers (cached at battle start). */
  onHit: Array<{ status?: import('../data/types').StatusId; duration?: number; magnitude?: number; chance?: number }> = [];
  lifesteal = 0; reflect = 0; killHeal = 0; hpRegen = 0; cdMul = 1; costMul = 1; critC = 0.05; critM = 1.5; backstab = 0; moveMul = 1;
  immune: string[] = [];

  constructor(private b: Battle, readonly idx: number, debug: boolean) {
    const u = b.u;
    const hp = Math.max(1, safe(() => maxHp(), 100));
    u.hp[idx] = u.hpMax[idx] = hp;
    u.flags[idx] |= F_PLAYER;
    u.mass[idx] = 1.6;
    u.setTeamColor(idx, u.team[idx], false, '#b36bff');
    this.manaMax = Math.max(10, safe(() => maxMana(), 60));
    this.mana = this.manaMax;
    this.regen = safe(() => manaRegen(), 6);
    this.retornoMax = Math.max(0, Math.round(safe(() => retornoCharges(), G.run?.player.retornoMax ?? 1)));
    this.juramento = safe(() => hasOathSave(), false);
    this.onHit = safe(() => playerOnHitEffects(), []);
    this.lifesteal = safe(() => lifesteal(), 0);
    this.reflect = safe(() => reflectFraction(), 0);
    this.killHeal = safe(() => killHealFraction(), 0);
    this.hpRegen = safe(() => hpRegen(), 0);
    this.cdMul = safe(() => cooldownMult(), 1);
    this.costMul = safe(() => manaCostMult(), 1);
    this.critC = safe(() => critChance(), 0.05);
    this.critM = safe(() => critMult(), 1.5);
    this.backstab = safe(() => backstabCritBonus(), 0);
    this.moveMul = safe(() => moveSpeedMult(), 1);
    this.immune = safe(() => immuneStatuses(), []);
    b.enemySlow = safe(() => enemyTimeSlow(), 0);
    b.revealInvisible = safe(() => seesInvisible(), false);
    this.loadout = this.resolveLoadout(debug);
    const g = new THREE.Group();
    this.reticleMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#c77dff').multiplyScalar(1.8), transparent: true, opacity: 0.85, depthWrite: false, fog: false, blending: THREE.AdditiveBlending });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.52, 32).rotateX(-Math.PI / 2), this.reticleMat);
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.08, 12).rotateX(-Math.PI / 2), this.reticleMat);
    const ticks = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.72, 4, 1, 0, Math.PI * 2).rotateX(-Math.PI / 2), this.reticleMat);
    g.add(ring, dot, ticks);
    g.renderOrder = 30;
    b.scene.add(g);
    this.reticle = g;
  }

  // ───────────── loadout ─────────────

  resolveLoadout(debug: boolean): Loadout {
    const eq = safe(() => equippedAbilities(), { slots: [null, null, null, null], relics: [null, null], ultimate: null });
    const any = eq.slots.some(Boolean) || eq.relics.some(Boolean) || !!eq.ultimate;
    if (debug && !any && !safeKnows('dominar_mente')) { this.debugKit = true; this.traitorChance = 0.12; return { ...DEBUG_KIT, slots: [...DEBUG_KIT.slots], relics: [...DEBUG_KIT.relics] }; }
    return {
      lmb: 'chispa_arcana',
      rmb: this.knowsA('golpe_titanico') || this.knowsA('fuerza_titanica') ? 'golpe_titanico' : null,
      slots: eq.slots.length >= 4 ? [...eq.slots] : [...eq.slots, null, null, null, null].slice(0, 4), relics: [...eq.relics, null, null].slice(0, 2), ult: eq.ultimate,
    };
  }
  knowsA(id: string): boolean { return this.debugKit ? DEBUG_KNOWN.has(id) : safeKnows(id); }

  /** La Excepción mid-battle: a new ability is usable right away if a slot is free. */
  onAcquired(id: string): void {
    if (!this.debugKit) {
      const eq = safe(() => equippedAbilities(), null);
      if (eq) { this.loadout.slots = eq.slots.length >= 4 ? [...eq.slots] : this.loadout.slots; this.loadout.relics = [...eq.relics]; this.loadout.ult = eq.ultimate; }
      if (!this.loadout.rmb && (this.knowsA('golpe_titanico') || this.knowsA('fuerza_titanica'))) this.loadout.rmb = 'golpe_titanico';
    }
    const ab = abilityRT(id);
    if (!ab || ab.def.kind === 'passive') { if (id === 'fuerza_titanica' && !this.loadout.rmb) this.loadout.rmb = 'golpe_titanico'; this.b.hud?.refreshHotbar(); return; }
    if (ab.def.ultimate && !this.loadout.ult) this.loadout.ult = id;
    else if (!this.loadout.slots.includes(id)) {
      const k = this.loadout.slots.indexOf(null);
      if (k >= 0) { this.loadout.slots[k] = id; safe(() => equipSlot(k, id), undefined); }
    }
    this.b.hud?.refreshHotbar();
  }

  // ───────────── stats ─────────────

  powerFor(ab: AbilityRT): number {
    let m = safe(() => damageMult(ab.school), 1);
    if (ab.def.kind === 'projectile') m *= safe(() => rangedDamageMult(), 1);
    if (this.transformed) m *= 1.5;
    return m;
  }
  rangeMul(ab: AbilityRT): number { return ab.def.kind === 'projectile' || ab.def.kind === 'beam' ? safe(() => rangeMult(), 1) : 1; }
  /** The ability as Elias casts it (rank-scaled by the Códice). */
  abFor(id: string): AbilityRT | null {
    if (this.debugKit) return abilityRT(id);
    const d = safe(() => effectiveAbility(id), undefined);
    return d ? abilityRTFor(d) : abilityRT(id);
  }
  /** Crit roll for Elias' hits: returns the damage multiplier (1 = no crit). */
  rollCrit(backstab = false): number { return Math.random() < this.critC ? this.critM + (backstab ? this.backstab : 0) : 1; }
  damageTakenMul(): number {
    const a = safe(() => statArmor(), 0);
    const red = a <= 1 ? a : a / (a + 100);
    return Math.max(0.2, 1 - Math.min(0.8, red));
  }
  iframes(): boolean { return this.iframeT > 0 || this.reviving > 0; }
  stable(): boolean { return this.transformed; }
  setIframes(t: number): void { this.iframeT = Math.max(this.iframeT, t); }
  cooldown(id: string | null): number { return id ? this.cds.get(id) ?? 0 : 0; }
  cooldownMax(id: string | null): number { return id ? this.cdMax.get(id) ?? 1 : 1; }
  manaCost(ab: AbilityRT): number { return ab.def.mana * this.costMul; }

  // ───────────── input capture (real time) ─────────────

  capture(realNow: number): void {
    if (!input.enabled || this.locked) return;
    const m = input.mouse;
    if (m.pressedWorld[0]) this.buf.set('lmb', realNow);
    if (m.pressedWorld[2]) this.buf.set('rmb', realNow);
    const pairs: Array<[Act, Parameters<typeof input.actionPressed>[0]]> = [['slot1', 'slot1'], ['slot2', 'slot2'], ['slot3', 'slot3'], ['slot4', 'slot4'], ['relic1', 'relic1'], ['relic2', 'relic2'], ['ultimate', 'ultimate'], ['dodge', 'dodge']];
    for (const [a, act] of pairs) if (input.actionPressed(act)) this.buf.set(a, realNow);
    if (input.wasPressed('Digit5')) this.buf.set('slot5', realNow);
    if (input.actionPressed('camera')) this.toggleCamera();
    if (input.actionPressed('cmdCharge')) this.order(0);
    if (input.actionPressed('cmdHold')) this.order(1);
    if (input.actionPressed('cmdFollow')) this.order(2);
  }
  private consume(a: Act, windowMs: number): boolean {
    const t = this.buf.get(a);
    if (t === undefined) return false;
    if (this.b.realTime * 1000 - t > windowMs) { this.buf.delete(a); return false; }
    this.buf.delete(a);
    return true;
  }
  private peek(a: Act, windowMs: number): boolean { const t = this.buf.get(a); return t !== undefined && this.b.realTime * 1000 - t <= windowMs; }

  toggleCamera(): void {
    const cam = this.b.cam;
    if (cam.mode === 'tactica') { cam.setMode('hombro'); input.requestPointerLock(); }
    else { cam.setMode('tactica'); input.exitPointerLock(); }
    if (G.meta) G.meta.settings.camera = cam.mode === 'hombro' ? 'hombro' : 'tactica';
    this.b.hud?.toast(cam.mode === 'hombro' ? 'Cámara: sobre el hombro' : 'Cámara: táctica');
  }

  order(o: number): void {
    const b = this.b, u = b.u;
    b.orders[0] = o;
    const names = ['¡Carguen!', '¡Mantengan!', '¡Síganme!'];
    b.say(this.idx, names[o], 1.4);
    b.sfx(o === 0 ? 'horn_war' : 'drum_war', NaN, NaN, 0.8, 1, 300);
    if (o === 1) for (let i = 0; i < u.n; i++) if (u.active[i] && u.side[i] === u.side[this.idx]) { u.homeX[i] = u.x[i]; u.homeZ[i] = u.z[i]; }
    for (let i = 0; i < u.n; i++) if (u.active[i] && u.side[i] === u.side[this.idx]) u.retargetT[i] = 0;
    b.hud?.setOrder(o);
  }

  // ───────────── per-frame (game time) ─────────────

  update(dt: number): void {
    const b = this.b, u = b.u, i = this.idx;
    if (dt <= 0 || !u.active[i]) return;
    for (const [k, v] of this.cds) if (v > 0) this.cds.set(k, Math.max(0, v - dt));
    this.lmbT -= dt;
    if (this.iframeT > 0) this.iframeT -= dt;
    if (this.dodgeCharges < this.dodgeMax) { this.dodgeRe += dt; if (this.dodgeRe >= 0.9) { this.dodgeRe = 0; this.dodgeCharges++; } }
    if (this.mindT > 0) { this.mindT -= dt; if (this.mindT <= 0) { engine.pipeline.setMind(0); this.b.rigs?.get(i)?.setEyeGlow(null); } }
    if (this.hitSlow > 0) this.hitSlow -= dt;
    if (this.dead) return;
    if (this.reviving > 0) { this.reviving -= dt; if (this.reviving <= 0) this.finishRevive(); return; }
    if (u.state[i] === S_DEAD) return;
    // mana & race regen
    this.mana = Math.min(this.manaMax, this.mana + this.regen * dt * (this.transformed ? 1.5 : 1));
    if (this.hpRegen > 0) u.hp[i] = Math.min(u.hpMax[i], u.hp[i] + this.hpRegen * dt);

    const st = u.state[i];
    if (st === S_CAST) b.abilities?.castStep(i, dt);
    if (st === S_DASH) { b.abilities?.dashStep(i, dt); return; }
    const canAct = !this.locked && input.enabled && b.phase === 'fight' && st !== S_AIR && st !== S_DOWN && st !== S_HELD && !(u.stMask[i] & B_DISABLED);

    // ── movement
    let mx = 0, mz = 0;
    if (this.scriptX !== null && this.scriptZ !== null && st !== S_AIR && st !== S_DOWN) {
      const dx = this.scriptX - u.x[i], dz = this.scriptZ - u.z[i], l = Math.hypot(dx, dz);
      if (l < 0.4) { this.scriptX = this.scriptZ = null; } else { mx = dx / l; mz = dz / l; this.aim.set(u.x[i] + mx * 5, u.y[i], u.z[i] + mz * 5); }
    } else if (canAct) {
      const mv = input.moveVector();
      let ix = mv.x, iy = mv.y;
      if (this.controlsInverted || this.mindT > 0) { ix = -ix; iy = -iy; }
      const basis = BASIS; b.cam.groundBasis(basis);
      mx = basis.rx * ix + basis.fx * iy; mz = basis.rz * ix + basis.fz * iy;
    }
    const baseSpeed = 5.2 * this.moveMul;
    const sprint = input.action('sprint') && canAct ? 1.55 : 1;
    const casting = st === S_CAST ? 0.45 : 1;
    let spd = baseSpeed * sprint * casting * speedMul(b, i) * (this.transformed ? 0.9 : 1) * (this.hitSlow > 0 ? 0.6 : 1);
    if (this.dashT > 0) {
      this.dashT -= dt;
      u.vx[i] = this.dashX * 18; u.vz[i] = this.dashZ * 18;
      if (Math.random() < 0.5) b.abilities?.specials.ghostAt(u.x[i], u.z[i], u.yaw[i]);
      if (this.dashT <= 0) { u.vx[i] *= 0.35; u.vz[i] *= 0.35; engine.pipeline.setSpeedLines(0); }
    } else if (st !== S_AIR && st !== S_DOWN && st !== S_HELD) {
      const k = 1 - Math.exp(-18 * dt);
      u.vx[i] += (mx * spd - u.vx[i]) * k; u.vz[i] += (mz * spd - u.vz[i]) * k;
    } else { spd = 0; }
    // facing: aim in tactical, camera forward in shoulder view
    if (st !== S_AIR && st !== S_DOWN) {
      let goal = Math.atan2(this.aim.x - u.x[i], this.aim.z - u.z[i]);
      if (b.cam.mode === 'hombro') goal = b.cam.shoulderYaw + Math.PI;
      if (this.dashT > 0) goal = Math.atan2(this.dashX, this.dashZ);
      const d = angDiff(u.yaw[i], goal);
      u.yaw[i] += d * Math.min(1, dt * 22);
    }
    if (!canAct) return;

    // ── actions
    if (this.consume('dodge', 150)) this.dodge(mx, mz);
    if (u.stMask[i] & B_TOAD) { this.buf.clear(); return; }
    const castingNow = st === S_CAST;
    if (!castingNow) {
      if (this.consume('ultimate', 150)) this.cast(this.loadout.ult, 'R');
      else if (this.consume('slot1', 120)) this.cast(this.loadout.slots[0], '1');
      else if (this.consume('slot2', 120)) this.cast(this.loadout.slots[1], '2');
      else if (this.consume('slot3', 120)) this.cast(this.loadout.slots[2], '3');
      else if (this.consume('slot4', 120)) this.cast(this.loadout.slots[3], '4');
      else if (this.consume('slot5', 120)) this.cast(this.loadout.slots[4] ?? null, '5');
      else if (this.consume('relic1', 120)) this.cast(this.loadout.relics[0], 'Q');
      else if (this.consume('relic2', 120)) this.cast(this.loadout.relics[1], 'E');
      else if (this.consume('rmb', 120)) this.cast(this.loadout.rmb, 'RMB');
    }
    const lmbHeld = input.mouseDown(0) && !input.mouse.overUI;
    if ((this.peek('lmb', 130) || lmbHeld) && this.lmbT <= 0 && !castingNow) { this.buf.delete('lmb'); this.basicAttack(); }
  }

  // ───────────── basics ─────────────

  private dodge(mx: number, mz: number): void {
    const b = this.b, u = b.u, i = this.idx;
    if (this.dodgeCharges <= 0) { b.hud?.flashSlot('dodge'); return; }
    this.dodgeCharges--;
    let dx = mx, dz = mz;
    if (Math.hypot(dx, dz) < 0.1) { dx = Math.sin(u.yaw[i]); dz = Math.cos(u.yaw[i]); }
    const l = Math.hypot(dx, dz) || 1;
    this.dashX = dx / l; this.dashZ = dz / l;
    this.dashT = 0.25;
    this.iframeT = 0.27;
    if (u.state[i] === S_CAST) { u.state[i] = S_IDLE; u.castAb[i] = -1; b.abilities?.cancelTelegraph(i); }
    b.abilities?.specials.ghostAt(u.x[i], u.z[i], u.yaw[i]);
    b.fx.emit('arcane', b.tmpV.set(u.x[i], u.y[i] + 1, u.z[i]), { count: 10 });
    b.sfx('dash', u.x[i], u.z[i], 0.8, 1, 0);
    engine.pipeline.setSpeedLines(0.45);
    b.cam.rig.fovPunch(2.5);
  }

  private basicAttack(): void {
    const b = this.b, u = b.u, i = this.idx;
    if (this.transformed) { this.slam(); return; }
    // titan punch when an enemy is right in front
    if (this.knowsA('fuerza_titanica')) {
      const fx = Math.sin(u.yaw[i]), fz = Math.cos(u.yaw[i]);
      const n = b.grid.query(u, u.x[i] + fx * 1.2, u.z[i] + fz * 1.2, 2.2, BUF, 64);
      let best = -1, bd = 1e9;
      for (let k = 0; k < n; k++) {
        const j = BUF[k];
        if (!b.alive(j) || !b.hostile(i, j)) continue;
        const dx = u.x[j] - u.x[i], dz = u.z[j] - u.z[i], d = Math.hypot(dx, dz);
        if (d > 2.3 + u.radius[j] || (dx * fx + dz * fz) / (d || 1) < 0.3) continue;
        if (d < bd) { bd = d; best = j; }
      }
      if (best >= 0) { this.titanPunch(best); return; }
    }
    const ab = this.abFor(this.loadout.lmb);
    if (!ab) return;
    const p = this.assistAim((ab.def.range ?? 18) * this.rangeMul(ab));
    b.abilities?.execute(i, ab, p.x, p.z, -1);
    this.lmbT = Math.max(0.16, ab.def.cooldown || 0.35);
    b.rigs?.play(i, 'cast', 0.22);
    this.kick(0.12);
    if (u.stMask[i] & B_INVIS) this.breakVeilSoon();
  }

  private titanPunch(t: number): void {
    const b = this.b, u = b.u, i = this.idx;
    const fuerza = abilityRT('fuerza_titanica');
    const veil = this.consumeVeilCrit();
    const cm = veil ? this.critM + this.backstab : this.rollCrit();
    const crit = veil || cm > 1;
    const dx = u.x[t] - u.x[i], dz = u.z[t] - u.z[i], l = Math.hypot(dx, dz) || 1;
    const pw = 26 * (fuerza ? this.powerFor(fuerza) : 1) * (b.abilities?.playerPower ?? 1) * cm;
    const kn = Math.max(22, fuerza?.knock ?? 12);
    b.rigs?.play(i, 'attack', 0.3);
    const hy = u.y[t] + b.heightOf(t) * 0.6;
    b.fx.emit('hit', b.tmpV.set(u.x[t], hy, u.z[t]), { count: 20, color: '#ffd36b' });
    b.fx.ring(b.tmpV.set(u.x[i] + dx / l * 0.9, u.y[i] + 1.1, u.z[i] + dz / l * 0.9), { color: '#ffd36b', radius: 1.8, vertical: true, duration: 0.25 });
    damage(b, t, pw, { src: i, ab: null, crit, knock: kn * (crit ? 1.4 : 1), dirX: dx / l, dirZ: dz / l, kind: K_MELEE, up: 1.25 });
    if (this.killHeal > 0 && !b.alive(t)) heal(b, i, u.hpMax[i] * this.killHeal, i);
    b.sfx('punch_launch', u.x[i], u.z[i], 1, crit ? 0.8 : 1, 0);
    if (crit) { engine.pipeline.impact(2, 0); b.cam.rig.fovPunch(-4); }
    b.hitstop(crit ? 90 : 70);
    b.cam.rig.shake(crit ? 0.4 : 0.22);
    this.lmbT = 0.42;
    track('knockbacks');
  }

  private slam(): void {
    const b = this.b, u = b.u, i = this.idx;
    const fx = Math.sin(u.yaw[i]), fz = Math.cos(u.yaw[i]);
    const x = u.x[i] + fx * 2.2 * (u.scale[i] / 1.2), z = u.z[i] + fz * 2.2 * (u.scale[i] / 1.2);
    b.rigs?.play(i, 'attack', 0.45);
    explode(b, x, b.heightAt(x, z), z, 3.2 + u.scale[i] * 0.4, 45 * (b.abilities?.playerPower ?? 1) * (this.powerFor(abilityRT('metamorfosis') ?? abilityRT('chispa_arcana')!)), 24, i, u.side[i], null);
    b.fx.emit('earth', b.tmpV.set(x, u.y[i] + 0.3, z), { count: 20, scale: 1.3 });
    b.cam.rig.shake(0.45);
    b.hitstop(70);
    this.lmbT = 0.75;
  }

  /** Soft aim assist: bend the shot toward the closest hostile inside a narrow cone. */
  private assistAim(range: number): THREE.Vector3 {
    const b = this.b, u = b.u, i = this.idx;
    const ax = this.aim.x - u.x[i], az = this.aim.z - u.z[i];
    const al = Math.hypot(ax, az) || 1;
    if (this.hover >= 0 && b.alive(this.hover)) return AIMP.set(u.x[this.hover], 0, u.z[this.hover]);
    const n = b.grid.query(u, u.x[i] + ax / al * Math.min(al, range) * 0.5, u.z[i] + az / al * Math.min(al, range) * 0.5, Math.min(al, range) * 0.6 + 2, BUF, 64);
    let best = -1, bs = 0.14;
    for (let k = 0; k < n; k++) {
      const j = BUF[k];
      if (!b.alive(j) || !b.hostile(i, j) || (u.stMask[j] & B_INVIS)) continue;
      const dx = u.x[j] - u.x[i], dz = u.z[j] - u.z[i], d = Math.hypot(dx, dz);
      if (d > range) continue;
      const ang = Math.acos(Math.max(-1, Math.min(1, (dx * ax + dz * az) / (d * al))));
      const s = ang + d * 0.002;
      if (s < bs) { bs = s; best = j; }
    }
    if (best >= 0) return AIMP.set(u.x[best], 0, u.z[best]);
    return AIMP.copy(this.aim);
  }

  private kick(amount: number): void {
    const u = this.b.u, i = this.idx;
    const dx = this.aim.x - u.x[i], dz = this.aim.z - u.z[i], l = Math.hypot(dx, dz) || 1;
    this.b.cam.rig.kick(KICK.set(-dx / l, 0, -dz / l), amount * 3);
  }

  // ───────────── casting ─────────────

  cast(id: string | null, key: string): void {
    const b = this.b, u = b.u, i = this.idx;
    if (!id) { b.hud?.flashSlot(key); return; }
    const ab = this.abFor(id);
    if (!ab || ab.def.kind === 'passive') { b.hud?.flashSlot(key); return; }
    if ((this.cds.get(id) ?? 0) > 0) { b.hud?.flashSlot(key); audio.sfx('ui_error', { volume: 0.3 }); return; }
    const cost = this.manaCost(ab);
    if (this.mana < cost) { b.hud?.noMana(key); audio.sfx('ui_error', { volume: 0.35 }); return; }
    const def = ab.def;
    let tx = this.aim.x, tz = this.aim.z, tu = -1;
    if (def.target === 'enemy') {
      tu = this.hover >= 0 && b.alive(this.hover) && b.hostile(i, this.hover) ? this.hover : (b.abilities?.nearestHostile(i, tx, tz, 5) ?? -1);
      if (tu < 0 && def.kind !== 'projectile' && def.kind !== 'melee' && def.kind !== 'beam') { b.hud?.flashSlot(key); b.hud?.toast('Sin objetivo'); return; }
      if (tu >= 0) { tx = u.x[tu]; tz = u.z[tu]; }
    } else if (def.target === 'ally') {
      tu = b.abilities?.mostWounded(i, def.range ?? 12, 1.01) ?? i;
      if (tu < 0) tu = i;
    } else if (def.target === 'self') { tx = u.x[i] + Math.sin(u.yaw[i]); tz = u.z[i] + Math.cos(u.yaw[i]); }
    const range = def.range ?? 0;
    if (def.kind === 'blink' && range) {
      const dx = tx - u.x[i], dz = tz - u.z[i], l = Math.hypot(dx, dz);
      if (l > range) { tx = u.x[i] + dx / l * range; tz = u.z[i] + dz / l * range; }
    }
    if (def.ultimate) this.ultimateCutin(ab);
    const ok = b.abilities?.cast(i, ab.idx, tx, tz, tu, def.ultimate ? 0.6 : 1) ?? false;
    if (!ok) { b.hud?.flashSlot(key); return; }
    this.mana -= cost;
    const cd = Math.max(0.2, def.cooldown * this.cdMul);
    this.cds.set(id, cd); this.cdMax.set(id, cd);
    this.iframeT = 0; // acting ends dodge immunity (Hades rule)
    b.hud?.pulseSlot(key);
    track('abilities_cast');
  }

  onCastExecuted(ab: AbilityRT): void {
    const b = this.b, u = b.u, i = this.idx;
    b.rigs?.play(i, 'cast', 0.35);
    b.abilities?.specials.mimic(ab, this.aim.x, this.aim.z);
    if (ab.id !== 'chispa_arcana') { this.kick(0.18); b.cam.rig.shake(0.06); }
    if ((u.stMask[i] & B_INVIS) && ab.id !== 'velo' && !ab.positive) this.breakVeilSoon();
  }

  private ultimateCutin(ab: AbilityRT): void {
    void cutin({ portrait: portraitSVG({ seed: 'elias', race: 'excepcion', special: 'elias', mood: 'smug', glowEyes: true }, 520), title: ab.name.toUpperCase(), subtitle: G.run?.player.name ?? 'Elias Veyr', colors: ['#1a0b33', ab.color], side: 'right', duration: 1.2 });
  }

  // ───────────── veil ─────────────

  onVeil(_dur: number): void {
    this.veilCrit = true;
    engine.pipeline.setDesat(0.65);
    track('invisible_seconds', _dur);
  }
  onVeilEnd(): void {
    this.veilCrit = false;
    engine.pipeline.setDesat(0);
    this.b.sfx('invisibility_off', NaN, NaN, 0.6);
  }
  consumeVeilCrit(): boolean {
    const u = this.b.u, i = this.idx;
    if (this.veilCrit && (u.stMask[i] & B_INVIS)) { this.veilCrit = false; this.breakVeilSoon(); this.b.float(i, '¡DESDE EL VELO!', 'info', true, '#c7a2ff'); return true; }
    return false;
  }
  private breakVeilSoon(): void {
    const b = this.b;
    b.abilities?.specials.later(0.15, () => { if (b.alive(this.idx)) removeStatus(b, this.idx, 'invisible'); });
  }

  // ───────────── being hit ─────────────

  onDodged(ab: AbilityRT | null): void {
    // perfect dodge on a copyable attack: grazed → comprehension without damage (skill path for the Blue Mage)
    const b = this.b;
    if (ab && ab.copyable) { comprehendHit(b, ab, false); b.float(this.idx, '¡ROZADO!', 'info', true, '#b36bff'); }
    engine.slowmo(0.35, 0.5);
    b.fx.emit('arcane', b.tmpV.set(b.u.x[this.idx], b.u.y[this.idx] + 1, b.u.z[this.idx]), { count: 8 });
  }
  comprehendFrom(_ab: AbilityRT): void { /* comprehension is handled by the damage/status pipeline */ }

  mindHit(dur: number, _id?: string): void {
    this.mindT = Math.max(this.mindT, Math.min(6, dur));
    engine.pipeline.setMind(1);
    this.b.rigs?.get(this.idx)?.setEyeGlow('#ff7bf0');
    this.b.float(this.idx, '¡CONTROLES INVERTIDOS!', 'info', true, '#ff7bf0');
    this.b.sfx('mind_control', NaN, NaN, 0.9, 0.8, 0);
  }

  onLaunched(dv: number): void {
    const b = this.b;
    this.hitSlow = 0.3;
    if (dv > 10) { b.cam.rig.shake(0.5); engine.pipeline.chromaticPulse(0.8, 0.3); }
  }

  onTransform(on: boolean, label: string): void {
    this.transformed = on;
    const b = this.b;
    b.cam.tacDist = on ? 27 : 17;
    b.hud?.toast(on ? `Metamorfosis: ${label}` : 'Vuelves a tu forma');
    b.hud?.refreshHotbar();
  }

  onDeath(src: number): void {
    const b = this.b, u = b.u, i = this.idx;
    if (this.reviving > 0 || this.dead) return;
    if (this.onDeathHook?.()) { u.hp[i] = Math.max(1, u.hp[i]); return; }
    if (this.juramento) {
      this.juramento = false;
      u.hp[i] = 1;
      b.callout('¡JURAMENTO!', 'excepcion', 'Sobrevives con 1 PV');
      this.setIframes(1);
      return;
    }
    track('deaths');
    b.stats.deaths++;
    if (src >= 0 && (u.flags[src] & (F_CAPTAIN | F_BOSS | F_HERO)) && !b.stats.captainKilledPlayer) {
      const m = b.metaOf(src);
      b.stats.captainKilledPlayer = m?.npcId ?? m?.name ?? b.nameOf(src);
    }
    if (this.retornoUsed < this.retornoMax) {
      this.retornoUsed++;
      track('revivals');
      b.stats.revivals++;
      // dramatic beat: fall, silence, then light
      u.hp[i] = 0.01;
      this.reviving = 1.25;
      u.vx[i] = u.vz[i] = 0;
      if (u.state[i] === S_CAST || u.state[i] === S_DASH) u.state[i] = S_IDLE;
      const r = b.rigs?.get(i);
      if (r) { r.pose = 'dead'; r.setExpression('dead'); }
      engine.slowmo(0.25, 1.4);
      engine.pipeline.setDesat(0.8);
      audio.duck(0.7, 1.2);
      b.sfx('heartbeat', NaN, NaN, 1, 1, 0);
      return;
    }
    // no charges: final death → defeat
    this.dead = true;
    u.state[i] = S_DEAD; u.deadT[i] = 0;
    clearStatuses(b, i);
    b.rigs?.dead(i);
    engine.slowmo(0.2, 2.2);
    engine.pipeline.impact(3, 2);
    engine.pipeline.setDesat(0.9);
    this.onFinalDeath?.();
  }

  private finishRevive(): void {
    const b = this.b, u = b.u, i = this.idx;
    u.hp[i] = u.hpMax[i];
    this.mana = Math.max(this.mana, this.manaMax * 0.5);
    clearStatuses(b, i);
    const r = b.rigs?.get(i);
    if (r) { r.pose = 'idle'; r.setExpression('determined'); }
    const ab = abilityRT('retorno');
    const pw = (ab?.def.power ?? 60) * this.powerFor(ab ?? abilityRT('chispa_arcana')!);
    explode(b, u.x[i], u.y[i], u.z[i], ab?.def.radius ?? 6, pw, Math.max(20, ab?.knock ?? 20), i, u.side[i], ab, false);
    b.fx.emit('light', b.tmpV.set(u.x[i], u.y[i] + 1, u.z[i]), { count: 60, speed: 9 });
    b.fx.emit('arcane', b.tmpV, { count: 40, speed: 7 });
    b.fx.ring(b.tmpV.set(u.x[i], u.y[i], u.z[i]), { color: '#fff7d6', radius: 9, duration: 0.6, intensity: 3 });
    b.fx.ring(b.tmpV, { color: '#9b5cff', radius: 6, duration: 0.5, intensity: 3 });
    engine.pipeline.setDesat(0);
    engine.pipeline.impact(2, 0);
    engine.pipeline.flash('#fff7d6', 0.6, 0.5);
    b.cam.rig.shake(0.7);
    b.sfx('revive', NaN, NaN, 1, 1, 0);
    b.callout('¡RETORNO!', 'excepcion', `${this.retornoMax - this.retornoUsed} carga${this.retornoMax - this.retornoUsed === 1 ? '' : 's'} restante${this.retornoMax - this.retornoUsed === 1 ? '' : 's'}`);
    this.setIframes(1.5);
  }

  // ───────────── scripted launch ─────────────

  launch(vx: number, vy: number, vz: number): void {
    const b = this.b, u = b.u, i = this.idx;
    u.state[i] = S_AIR; u.stT[i] = 0;
    u.vx[i] = vx; u.vy[i] = vy; u.vz[i] = vz;
    u.spinP[i] = -10; u.spinR[i] = 3;
    u.y[i] += 0.1;
    b.rigs?.airborne(i, true);
    this.launchT = 6;
    b.cam.launchTarget = () => LAUNCH.set(u.x[i], u.y[i], u.z[i]);
    engine.pipeline.impact(3, 0);
    engine.pipeline.setSpeedLines(1);
    b.cam.rig.shake(1);
    b.cam.rig.fovPunch(12);
    b.hitstop(120);
    b.sfx('punch_launch', NaN, NaN, 1, 0.7, 0);
    b.sfx('whoosh', NaN, NaN, 1, 0.5, 0);
  }

  /** Real-time: aim raycast, reticle, launch trail. */
  lateUpdate(realDt: number): void {
    const b = this.b, u = b.u, i = this.idx;
    if (!u.active[i]) return;
    const cam = b.cam;
    const nx = cam.mode === 'hombro' ? 0 : input.mouse.nx, ny = cam.mode === 'hombro' ? 0 : input.mouse.ny;
    const h = u.y[i] + 1.0;
    if (cam.ndcToGround(nx, ny, h, AIMRAW)) {
      const gy = b.heightAt(AIMRAW.x, AIMRAW.z);
      cam.ndcToGround(nx, ny, gy + 0.9, this.aim);
    } else {
      this.aim.set(u.x[i] + Math.sin(u.yaw[i]) * 10, u.y[i], u.z[i] + Math.cos(u.yaw[i]) * 10);
    }
    cam.aim.copy(this.aim);
    // hover: hostile under the reticle
    const n = b.grid.query(u, this.aim.x, this.aim.z, 1.8, BUF, 16);
    let best = -1, bd = 1e9;
    for (let k = 0; k < n; k++) { const j = BUF[k]; if (j === i || !b.alive(j)) continue; const d = Math.hypot(u.x[j] - this.aim.x, u.z[j] - this.aim.z) - u.radius[j]; if (d < bd) { bd = d; best = j; } }
    this.hover = best;
    const gy = b.heightAt(this.aim.x, this.aim.z);
    this.reticle.position.set(this.aim.x, gy + 0.06, this.aim.z);
    this.reticle.rotation.y += realDt * 1.5;
    const s = 1 + Math.sin(b.realTime * 6) * 0.06 + (best >= 0 ? 0.25 : 0);
    this.reticle.scale.setScalar(s);
    this.reticle.visible = b.phase === 'fight' && !this.dead && cam.mode === 'tactica' && !b.spectator;
    const col = best >= 0 ? (b.hostile(i, best) ? '#ff5a6a' : '#ffd36b') : '#c77dff';
    this.reticleMat.color.set(col).multiplyScalar(1.8);
    // signature: violet motes drifting up around Elias
    this.moteT -= realDt;
    if (this.moteT <= 0 && !this.dead && b.phase !== 'deploy') {
      this.moteT = 0.16;
      const a = Math.random() * 6.283, r = 0.5 + Math.random() * 0.6;
      b.fx.emit('arcane', MOTE.set(u.x[i] + Math.cos(a) * r, u.y[i] + 0.2 + Math.random() * 1.6, u.z[i] + Math.sin(a) * r), { count: 1, speed: 0.4, up: 1.4, scale: 0.55, gravity: 1.5 });
    }
    // launch trail
    if (this.launchT > 0) {
      this.launchT -= realDt;
      b.fx.emit('arcane', b.tmpV.set(u.x[i], u.y[i] + 1, u.z[i]), { count: 3 });
      if (u.y[i] > 45 && this.launchT > 0.5) {
        b.fx.emit('stars', b.tmpV, { count: 20, scale: 3 });
        b.fx.flash(b.tmpV, { color: '#ffffff', radius: 3 });
        b.sfx('bell', NaN, NaN, 0.8, 1.6, 0);
        this.launchT = 0.4;
      }
      if (this.launchT <= 0) { engine.pipeline.setSpeedLines(0); }
    }
    if (u.state[i] !== S_AIR && this.launchT <= 0 && cam.launchTarget) cam.launchTarget = null;
  }

  private scriptX: number | null = null;
  private scriptZ: number | null = null;
  /** Scripted walk (BattleContext.moveTo on Elias). */
  scriptMove(x: number, z: number): void { this.scriptX = x; this.scriptZ = z; }
  clearScriptMove(): void { this.scriptX = this.scriptZ = null; }

  heal(amount: number): void { heal(this.b, this.idx, amount, this.idx); }
  applyEffectsTo(ab: AbilityRT, t: number): void { applyEffects(this.b, t, ab, this.idx, 0, 0, false); }

  dispose(): void {
    this.reticle.removeFromParent();
    this.reticle.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.geometry.dispose(); });
    this.reticleMat.dispose();
    engine.pipeline.setMind(0); engine.pipeline.setDesat(0); engine.pipeline.setSpeedLines(0);
    input.exitPointerLock();
  }
}

const BASIS = { fx: 0, fz: 0, rx: 0, rz: 0 };
const AIMP = new THREE.Vector3();
const AIMRAW = new THREE.Vector3();
const KICK = new THREE.Vector3();
const LAUNCH = new THREE.Vector3();
const MOTE = new THREE.Vector3();
function safeKnows(id: string): boolean { try { return knows(id); } catch { return false; } }

