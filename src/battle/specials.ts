/**
 * Id-specific ability behaviors on top of the generic executor (see src/data/abilities.ts conventions):
 * dominar_mente, velo, golpe_titanico, fuerza_titanica / retorno / afinidad_reliquias (NPC casts), el_alba, eclipse_total,
 * paso_fantasma, mil_cortes & any repeated dash, summons (SUMMONS: clones, spirits, mobs, Lluvia de Elias),
 * metamorfosis / hambre_titanica / generic transforms, lanzar_aliado / catapulta_humana, devorar,
 * autodestruccion_chilera, plaga_sapos, resurreccion_menor, esquivar (NPC).
 */
import type { Battle } from './world';
import type { Abilities } from './abilities';
import { customSpec, hasUnitDef, type AbilityRT } from './defs';
import { buildCharacter, type CharacterRig } from '../characters/rig';
import {
  EX_EATING, F_BOSS, F_CLONE, F_EATEN, F_HERO, F_PLAYER, F_RIG, F_SUMMON, F_THROWN, F_TRANSFORMED, NJ, P_ROCK, S_AIR, S_DEAD, S_HELD, S_IDLE,
} from './const';
import { applyEffects, damage, explode, heal, kill, knockback, K_MAGIC, K_MELEE } from './combat';
import { applyStatus, clearStatuses, removeStatus } from './status';
import { engine } from '../core/engine';
import { track } from '../core/tracker';
import { SUMMONS } from '../data/abilities';
import { controlDurationMult, racialPowers } from '../systems/progression/stats';
import { rank } from '../systems/progression/codex';
import { cutin } from '../ui/toasts';
import { portraitSVG } from '../ui/art/portraits';

const BUF = new Int32Array(96);

interface Pending { t: number; fn: () => void }
interface Hold { j: number; c: number; up: number }
interface Ghost { rig: CharacterRig; t: number; life: number }
interface Cuts { unit: number; targets: number[]; idx: number; t: number; fromX: number; fromZ: number; ab: AbilityRT; power: number }
interface Morph { unit: number; t: number; dur: number; prevScale: number; prevRadius: number; prevMass: number; hpMul: number; dmgMul: number; race: string }

function safe<T>(fn: () => T, fb: T): T { try { return fn(); } catch { return fb; } }
function rndOf<T>(a: T[]): T { return a[Math.floor(Math.random() * a.length)]; }

export class Specials {
  private pending: Pending[] = [];
  private holds: Hold[] = [];
  private ghosts: Ghost[] = [];
  private cuts: Cuts | null = null;
  private morphs: Morph[] = [];
  private eclipseT = 0;

  constructor(private b: Battle, private ex: Abilities) {}

  // ───────────── validation ─────────────

  canCast(c: number, ab: AbilityRT, tx: number, tz: number, tu: number): boolean {
    const b = this.b, u = b.u;
    switch (ab.id) {
      case 'lanzar_aliado': return this.throwable(c, false) >= 0 && Math.hypot(tx - u.x[c], tz - u.z[c]) > 3;
      case 'catapulta_humana': return this.throwable(c, true) >= 0;
      case 'autodestruccion_chilera': return (u.flags[c] & F_PLAYER) !== 0 || this.ex.countHostiles(c, u.x[c], u.z[c], 5) >= 2 || (tu >= 0 && b.isPlayerish(tu) && Math.hypot(u.x[tu] - u.x[c], u.z[tu] - u.z[c]) < 5);
      case 'dominar_mente': return (u.flags[c] & F_PLAYER) ? this.ex.nearestHostile(c, tx, tz, 5) >= 0 : tu >= 0;
      case 'resurreccion_menor': return this.fallenAlly(c, ab.def.range ?? 10, tx, tz) >= 0;
      case 'metamorfosis': case 'hambre_titanica': return !this.morphs.some((m) => m.unit === c);
      default: return true;
    }
  }

  // ───────────── execution hook (true = handled) ─────────────

  execute(c: number, ab: AbilityRT, tx: number, tz: number, tu: number): boolean {
    const b = this.b, u = b.u;
    const isPl = (u.flags[c] & F_PLAYER) !== 0;
    switch (ab.id) {
      case 'dominar_mente': {
        const t = tu >= 0 && b.alive(tu) && b.hostile(c, tu) ? tu : this.ex.nearestHostile(c, tx, tz, 5);
        if (t < 0) return true;
        if (b.isPlayer(t)) { applyStatus(b, t, 'mente', ab.def.duration ?? 4, 1, c, ab); return true; }
        const dur = (ab.def.duration ?? 12) * (isPl ? safe(() => controlDurationMult(), 1) : 1);
        b.fx.beam(b.tmpV.set(u.x[c], u.y[c] + b.heightOf(c) * 0.85, u.z[c]), b.tmpV2(u.x[t], u.y[t] + b.heightOf(t) * 0.9, u.z[t]), { color: '#ff7bf0', width: 0.12, duration: 0.5 });
        if (applyStatus(b, t, 'mente', dur, 1, c, ab) && isPl) {
          track('minds_dominated');
          b.float(t, '¡DOMINADO!', 'info', true, '#ff7bf0');
          engine.pipeline.setMind(0.55);
          this.later(0.7, () => engine.pipeline.setMind(0));
          b.hitstop(60);
        }
        return true;
      }
      case 'velo': {
        applyStatus(b, c, 'invisible', ab.def.duration ?? 8, 1, c, ab);
        b.fx.emit('shadow', b.tmpV.set(u.x[c], u.y[c] + 1, u.z[c]), { count: 24 });
        if (isPl) {
          b.player?.onVeil(ab.def.duration ?? 8);
          if (safe(() => rank('velo'), 1) >= 3) {
            const n = b.grid.query(u, u.x[c], u.z[c], 8, BUF, 96);
            for (let k = 0; k < n; k++) { const j = BUF[k]; if (j !== c && b.alive(j) && !b.hostile(c, j)) applyStatus(b, j, 'invisible', (ab.def.duration ?? 8) * 0.6, 1, c, ab); }
          }
        } else {
          // Aurel-style: vanish, reappear behind the target and strike
          const t = tu >= 0 ? tu : u.target[c];
          this.later(1.1, () => {
            if (!b.alive(c) || !b.alive(t)) return;
            const f = u.yaw[t];
            this.ex.teleport(c, u.x[t] - Math.sin(f) * 1.6, u.z[t] - Math.cos(f) * 1.6, ab);
            removeStatus(b, c, 'invisible');
            u.yaw[c] = Math.atan2(u.x[t] - u.x[c], u.z[t] - u.z[c]);
            if (u.flags[c] & F_RIG) b.rigs?.play(c, 'attack', 0.4);
            this.later(0.25, () => { if (b.alive(c) && b.alive(t)) damage(b, t, Math.max(20, u.dmg[c] * u.dmgMul[c] * 2), { src: c, ab, crit: true, knock: 12, kind: K_MELEE }); });
          });
        }
        return true;
      }
      case 'golpe_titanico': case 'terremoto_titanico': {
        const p = b.tmpV.set(u.x[c], u.y[c] + 0.2, u.z[c]);
        b.fx.ring(p, { color: '#ffd36b', radius: 7, duration: 0.45, intensity: 3 });
        b.fx.ring(p, { color: '#ffffff', radius: 4, duration: 0.3, intensity: 3 });
        b.fx.emit('dust', p, { count: 26, scale: 1.4, speed: 9 });
        b.fx.emit('earth', p, { count: 14 });
        b.cam.rig.shake(0.55);
        if (isPl) { engine.pipeline.impact(1, 0); b.hitstop(80); b.cam.rig.fovPunch(-5); }
        return false;
      }
      case 'fuerza_titanica': {
        if (isPl) return true;
        const t = tu >= 0 ? tu : u.target[c];
        if (t < 0 || !b.alive(t)) return true;
        const d = Math.hypot(u.x[t] - u.x[c], u.z[t] - u.z[c]);
        const punch = () => {
          if (!b.alive(c) || !b.alive(t)) return;
          const dx = u.x[t] - u.x[c], dz = u.z[t] - u.z[c], l = Math.hypot(dx, dz) || 1;
          if (u.flags[c] & F_RIG) b.rigs?.play(c, 'attack', 0.35);
          b.fx.emit('hit', b.tmpV.set(u.x[t], u.y[t] + 1.2, u.z[t]), { count: 26, color: '#ffd36b' });
          b.fx.ring(b.tmpV.set(u.x[t], u.y[t] + 1, u.z[t]), { color: '#ffd36b', radius: 3, vertical: true, duration: 0.3 });
          damage(b, t, Math.max(30, ab.def.power), { src: c, ab, knock: 34, dirX: dx / l, dirZ: dz / l, kind: K_MELEE, up: 1.3 });
          engine.pipeline.impact(2, 0);
          b.sfx('punch_launch', u.x[c], u.z[c], 1, 1, 0);
        };
        if (d > 3) {
          const dx = u.x[t] - u.x[c], dz = u.z[t] - u.z[c], l = Math.hypot(dx, dz) || 1;
          this.ex.teleport(c, u.x[t] - (dx / l) * 1.4, u.z[t] - (dz / l) * 1.4, ab);
        }
        this.later(0.18, punch);
        return true;
      }
      case 'retorno': {
        if (isPl) return true;
        heal(b, c, u.hpMax[c], c);
        explode(b, u.x[c], u.y[c], u.z[c], ab.def.radius ?? 6, ab.def.power || 40, ab.knock || 20, c, u.side[c], null);
        b.fx.ring(b.tmpV.set(u.x[c], u.y[c], u.z[c]), { color: ab.color, radius: 8, duration: 0.5, intensity: 3 });
        b.fx.emit('light', b.tmpV.set(u.x[c], u.y[c] + 1, u.z[c]), { count: 40 });
        b.float(c, '¡RETORNO!', 'info', true, '#fff7d6');
        return true;
      }
      case 'afinidad_reliquias': {
        applyStatus(b, c, 'furia', 6, 0.4, c, ab);
        b.fx.emit('light', b.tmpV.set(u.x[c], u.y[c] + 1.2, u.z[c]), { count: 24, color: '#e6cc80' });
        b.fx.flash(b.tmpV, { color: '#e6cc80', radius: 1.5 });
        return true;
      }
      case 'el_alba': {
        engine.pipeline.flash('#fff7d6', isPl ? 0.55 : 0.75, 0.7);
        engine.pipeline.chromaticPulse(1, 0.5);
        b.fx.emit('light', b.tmpV.set(u.x[c], u.y[c] + 1.4, u.z[c]), { count: 50, speed: 8 });
        b.cam.rig.shake(0.6);
        b.hitstop(90);
        return false;
      }
      case 'eclipse_total': this.eclipse(c, ab, tx, tz); return true;
      case 'paso_fantasma': if (isPl) { engine.pipeline.chromaticPulse(0.6, 0.25); b.cam.rig.fovPunch(4); } return false;
      case 'mil_cortes': this.chainDash(c, ab, tx, tz, Math.max(3, ab.def.count ?? 6), ab.def.power * this.ex.powerOf(c, ab)); return true;
      case 'lanzar_aliado': case 'catapulta_humana': this.throwUnit(c, ab, tx, tz, tu); return true;
      case 'devorar': return this.devour(c, ab, tu);
      case 'autodestruccion_chilera': {
        b.say(c, rndOf(['¡A la gran!', '¡Qué chilero!', '¡Aguas, patojos!']), 1.2);
        explode(b, u.x[c], u.y[c], u.z[c], ab.def.radius ?? 6, ab.def.power * this.ex.powerOf(c, ab), ab.knock || 26, c, u.side[c], ab);
        b.fx.emit('confetti', b.tmpV.set(u.x[c], u.y[c] + 1, u.z[c]), { count: 40 });
        // "Tú no explotas del todo": −20% HP and you fly with style
        u.hp[c] = Math.max(1, u.hp[c] - u.hpMax[c] * 0.2);
        const a = Math.random() * 6.283;
        knockback(b, c, Math.sin(a), Math.cos(a), 20 * Math.max(0.5, u.mass[c]), 1.8);
        return true;
      }
      case 'plaga_sapos': case 'rey_sapo': {
        b.sfx('toad', tx, tz, 1, 0.8, 0); this.later(0.15, () => b.sfx('toad', tx, tz, 0.8, 1.2, 0)); this.later(0.3, () => b.sfx('toad', tx, tz, 0.8, 1.0, 0));
        return false;
      }
      case 'resurreccion_menor': {
        const d = this.fallenAlly(c, ab.def.range ?? 10, tx, tz);
        if (d >= 0) this.revive(d, (ab.def.power || 50) / 100, ab);
        return true;
      }
      case 'esquivar': {
        if (isPl) return true;
        const a = u.yaw[c] + (Math.random() < 0.5 ? 1.57 : -1.57);
        this.ex.startDash(c, Math.sin(a), Math.cos(a), 4.5, ab, 0);
        return true;
      }
      default: return false;
    }
  }

  // ───────────── summons ─────────────

  summon(c: number, ab: AbilityRT, tx: number, tz: number, pw: number): void {
    const b = this.b, u = b.u, def = ab.def;
    const isPl = (u.flags[c] & F_PLAYER) !== 0;
    const count = Math.max(1, Math.min(8, def.count ?? 2));
    let unitId = SUMMONS[ab.id] ?? def.source?.units?.[0] ?? 'clon_sombra';
    if (!hasUnitDef(unitId)) unitId = customSpec('elias_clone', { race: 'excepcion', job: 'hechicero', role: 'mago', name: 'Clon de Sombra', hp: 60, damage: 10, attackRange: 15, attackCooldown: 0.6, speed: 5.4, mass: 1, armor: 0, scale: 1.05, weapon: 'ninguna', projectile: 'orbe', abilities: [] }).id;
    const clones = unitId === 'clon_sombra' || unitId === 'elias_clone' || ab.id === 'clones_sombra';
    const ground = def.target === 'ground';
    const radius = def.radius ?? 2.4;
    for (let k = 0; k < count; k++) {
      const a = (k / count) * Math.PI * 2 + u.yaw[c];
      const r = ground ? Math.sqrt(Math.random()) * radius : 2.4;
      const x = (ground ? tx : u.x[c]) + Math.sin(a) * r, z = (ground ? tz : u.z[c]) + Math.cos(a) * r;
      const i = b.spawn(unitId, u.team[c], x, z, { special: clones && (isPl || u.rig[c] >= 0) ? 'elias' : undefined, rig: clones && (isPl || u.rig[c] >= 0), yaw: u.yaw[c] });
      if (i < 0) continue;
      u.side[i] = u.side[c]; u.setTeamColor(i, u.side[c]);
      u.flags[i] |= F_SUMMON | (clones ? F_CLONE : 0);
      u.lifeT[i] = def.duration ?? 20;
      if (pw > 0) u.dmg[i] = pw * 0.25;
      if (clones && isPl) { u.hp[i] = u.hpMax[i] = Math.max(40, u.hpMax[c] * 0.3); b.setMeta(i, { name: b.nameOf(c) }); }
      if (ab.id === 'legion_invisible') applyStatus(b, i, 'invisible', def.duration ?? 12, 1, c, ab);
      if (ground && ab.id === 'lluvia_clones') {
        // clones rain down and land with a crash
        u.y[i] = b.heightAt(x, z) + 14 + Math.random() * 6; u.state[i] = S_AIR; u.vy[i] = -12; u.vx[i] = u.vz[i] = 0; u.spinP[i] = -6;
        this.later(0.9, () => { if (b.alive(i)) explode(b, u.x[i], u.y[i], u.z[i], radius, pw, ab.knock || 18, c, u.side[c], ab); });
      } else {
        b.fx.emit(clones ? 'shadow' : ab.preset, b.tmpV.set(x, b.heightAt(x, z) + 1, z), { count: 20, color: clones ? undefined : ab.color });
      }
    }
    b.sfx(clones ? 'clone' : ab.sfx, u.x[c], u.z[c], 1);
    if (clones && isPl) for (let j = 0; j < u.n; j++) if (u.active[j] && u.target[j] === c && b.hostile(j, c)) u.retargetT[j] = 0;
  }

  /** Clones repeat Elias' casts toward their own targets. */
  mimic(ab: AbilityRT, tx: number, tz: number): void {
    const b = this.b, u = b.u;
    if (ab.def.kind === 'summon' || ab.def.kind === 'transform' || ab.def.ultimate || ab.id === 'chispa_arcana') return;
    for (let i = 0; i < u.n; i++) {
      if (!u.active[i] || !(u.flags[i] & F_CLONE) || u.state[i] === S_DEAD || u.side[i] !== u.side[b.playerIdx]) continue;
      const t = u.target[i];
      const x = t >= 0 && b.alive(t) ? u.x[t] : tx, z = t >= 0 && b.alive(t) ? u.z[t] : tz;
      this.later(0.08 + Math.random() * 0.2, () => { if (b.alive(i)) this.ex.execute(i, ab, x, z, t); });
    }
  }

  // ───────────── transforms ─────────────

  transform(c: number, ab: AbilityRT): void {
    const b = this.b, u = b.u;
    const isPl = (u.flags[c] & F_PLAYER) !== 0;
    const dur = ab.def.duration ?? 20;
    let race = '', mul = 1.35;
    if (ab.id === 'metamorfosis') {
      const rp = safe(() => racialPowers(), [] as string[]);
      race = 'gigante'; mul = 2.3;
      if (rp.includes('sangre_dragon')) { race = 'draconido'; mul = 1.5; }
      else if (rp.includes('estomago_hierro')) { race = 'ogro'; mul = 1.8; }
    } else if (ab.id === 'hambre_titanica') { race = 'ogro'; mul = 2.4; }
    const m: Morph = { unit: c, t: 0, dur, prevScale: u.scale[c], prevRadius: u.radius[c], prevMass: u.mass[c], hpMul: 2.2, dmgMul: 2, race };
    this.morphs.push(m);
    u.flags[c] |= F_TRANSFORMED;
    const frac = u.hp[c] / u.hpMax[c];
    u.hpMax[c] *= m.hpMul; u.hp[c] = u.hpMax[c] * Math.max(frac, 0.6);
    u.dmgMul[c] *= m.dmgMul;
    u.scale[c] *= mul; u.radius[c] *= mul * 0.9; u.mass[c] *= 6;
    for (const e of ab.def.effects ?? []) if (e.status) applyStatus(b, c, e.status, e.duration ?? dur, e.magnitude, c, ab);
    if (race && (u.flags[c] & F_RIG)) {
      const rs = race === 'gigante' ? 2.6 : race === 'ogro' ? 1.7 : 1.15;
      b.rigs?.attach(c, undefined, { race: race as never, colors: { skin: race === 'draconido' ? '#3a2a5a' : race === 'ogro' ? '#6a7a5a' : '#6a5a8a', outfit: '#121018', outfit2: '#6a3bc0', accent: '#c9c9d9', hair: '#15101c' }, eyeGlow: '#c77dff', cape: true, weapon: race === 'gigante' ? 'martillo' : race === 'ogro' ? 'garrote' : 'ninguna', job: 'guerrero', scale: u.scale[c] / rs });
    }
    const p = b.tmpV.set(u.x[c], u.y[c] + 1.5, u.z[c]);
    b.fx.emit('magic', p, { count: 40, color: ab.color, scale: 1.5 });
    b.fx.emit('smoke', p, { count: 16, scale: 1.5 });
    b.fx.flash(p, { color: ab.color, radius: 4, duration: 0.35 });
    b.cam.rig.shake(0.5);
    b.sfx(ab.sfx, u.x[c], u.z[c], 1, 0.6, 0);
    if (isPl) { b.player?.onTransform(true, race || 'forma'); engine.pipeline.impact(2, 1); b.hitstop(90); }
  }

  private endMorph(m: Morph): void {
    const b = this.b, u = b.u, c = m.unit;
    if (!u.active[c]) return;
    u.flags[c] &= ~F_TRANSFORMED;
    const frac = u.hp[c] / u.hpMax[c];
    u.hpMax[c] /= m.hpMul; u.hp[c] = Math.max(1, u.hpMax[c] * frac);
    u.dmgMul[c] /= m.dmgMul;
    u.scale[c] = m.prevScale; u.radius[c] = m.prevRadius; u.mass[c] = m.prevMass;
    if (m.race && (u.flags[c] & F_RIG)) b.rigs?.attach(c, (u.flags[c] & F_PLAYER) ? 'elias' : b.metaOf(c)?.special);
    b.fx.emit('smoke', b.tmpV.set(u.x[c], u.y[c] + 1, u.z[c]), { count: 18 });
    if (u.flags[c] & F_PLAYER) b.player?.onTransform(false, '');
  }

  isMorphed(i: number): boolean { return this.morphs.some((m) => m.unit === i); }

  // ───────────── chained dashes (Mil Cortes & any dash with count > 1) ─────────────

  chainDash(c: number, ab: AbilityRT, tx: number, tz: number, count: number, total: number): void {
    const b = this.b, u = b.u;
    const n = b.grid.query(u, tx, tz, 11, BUF, 96);
    const cand: Array<[number, number]> = [];
    for (let k = 0; k < n; k++) { const j = BUF[k]; if (b.alive(j) && b.hostile(c, j)) cand.push([j, Math.hypot(u.x[j] - u.x[c], u.z[j] - u.z[c])]); }
    cand.sort((a, bb) => a[1] - bb[1]);
    const targets: number[] = [];
    for (let k = 0; k < count && cand.length; k++) targets.push(cand[k % cand.length][0]);
    if (!targets.length) {
      const dx = tx - u.x[c], dz = tz - u.z[c], l = Math.hypot(dx, dz) || 1;
      this.ex.startDash(c, dx / l, dz / l, Math.min(8, l), ab, total * 0.3);
      return;
    }
    this.cuts = { unit: c, targets, idx: 0, t: 0, fromX: u.x[c], fromZ: u.z[c], ab, power: total / Math.max(1, Math.min(count, targets.length)) * 1.4 };
    if (u.flags[c] & F_PLAYER) { b.player?.setIframes(0.12 * targets.length + 0.3); engine.pipeline.setSpeedLines(0.85); }
  }

  private stepCuts(dt: number): void {
    const cu = this.cuts;
    if (!cu) return;
    const b = this.b, u = b.u, c = cu.unit;
    if (!b.alive(c)) { this.cuts = null; engine.pipeline.setSpeedLines(0); return; }
    cu.t += dt;
    const STEP = 0.09;
    const t = cu.targets[cu.idx];
    const tx = b.alive(t) ? u.x[t] : u.x[c], tz = b.alive(t) ? u.z[t] : u.z[c];
    const k = Math.min(1, cu.t / STEP);
    const dx = tx - cu.fromX, dz = tz - cu.fromZ, l = Math.hypot(dx, dz) || 1;
    const endX = tx - (dx / l) * 0.9, endZ = tz - (dz / l) * 0.9;
    u.x[c] = cu.fromX + (endX - cu.fromX) * k; u.z[c] = cu.fromZ + (endZ - cu.fromZ) * k;
    u.y[c] = b.heightAt(u.x[c], u.z[c]);
    u.yaw[c] = Math.atan2(dx, dz);
    u.vx[c] = u.vz[c] = 0;
    if (k < 1) return;
    if (u.rig[c] >= 0) this.afterimage(cu.fromX, cu.fromZ, u.yaw[c]);
    if (b.alive(t)) {
      const sx = -dz / l, sz = dx / l, side = cu.idx % 2 ? 1 : -1;
      damage(b, t, cu.power, { src: c, ab: cu.ab, knock: Math.max(8, cu.ab.knock), dirX: dx / l * 0.4 + sx * side * 0.6, dirZ: dz / l * 0.4 + sz * side * 0.6, kind: K_MELEE, crit: cu.idx === cu.targets.length - 1 });
      applyEffects(b, t, cu.ab, c, dx / l, dz / l, true);
      const hy = u.y[t] + b.heightOf(t) * 0.6;
      b.fx.beam(b.tmpV.set(u.x[t] - sx * 1.4, hy + 0.5, u.z[t] - sz * 1.4), b.tmpV2(u.x[t] + sx * 1.4, hy - 0.4, u.z[t] + sz * 1.4), { color: '#ffffff', width: 0.07, duration: 0.25, intensity: 4 });
      b.fx.emit('spark', b.tmpV.set(u.x[t], hy, u.z[t]), { count: 10, color: cu.ab.color });
    }
    b.sfx('sword_swing', u.x[c], u.z[c], 0.8, 1.2 + cu.idx * 0.05, 0);
    cu.idx++; cu.t = 0; cu.fromX = u.x[c]; cu.fromZ = u.z[c];
    if (cu.idx >= cu.targets.length) {
      this.cuts = null;
      engine.pipeline.setSpeedLines(0);
      b.fx.ring(b.tmpV.set(u.x[c], u.y[c], u.z[c]), { color: cu.ab.color, radius: 5 });
      if (u.flags[c] & F_PLAYER) { engine.pipeline.impact(2, 1); b.hitstop(90); b.cam.rig.shake(0.4); }
    }
  }

  private afterimage(x: number, z: number, yaw: number): void {
    const b = this.b;
    let g = this.ghosts.find((q) => q.t <= 0);
    if (!g) {
      if (this.ghosts.length >= 8) g = this.ghosts[0];
      else {
        const rig = buildCharacter({ seed: 'ghost', race: 'excepcion', special: 'elias', outline: false });
        rig.setOpacity(0.4);
        rig.root.traverse((o) => { o.castShadow = false; });
        b.scene.add(rig.root);
        g = { rig, t: 0, life: 0.5 };
        this.ghosts.push(g);
      }
    }
    g.t = g.life = 0.45;
    g.rig.root.visible = true;
    g.rig.root.position.set(x, b.heightAt(x, z), z);
    g.rig.root.rotation.set(0, yaw, 0);
    g.rig.pose = 'idle';
    g.rig.play('attack', 0.3);
    g.rig.update(0.12, { speed: 6 });
  }

  /** Public afterimage for dodges. */
  ghostAt(x: number, z: number, yaw: number): void { this.afterimage(x, z, yaw); }

  // ───────────── Eclipse ─────────────

  private eclipse(c: number, ab: AbilityRT, tx: number, tz: number): void {
    const b = this.b, u = b.u;
    const r = ab.def.radius ?? 18;
    const isPl = (u.flags[c] & F_PLAYER) !== 0;
    const cx = isPl ? tx : u.x[c], cz = isPl ? tz : u.z[c];
    const n = b.grid.query(u, cx, cz, r, BUF, 96);
    const foes: number[] = [];
    for (let k = 0; k < n; k++) { const j = BUF[k]; if (b.alive(j) && b.hostile(c, j)) foes.push(j); }
    for (let k = foes.length - 1; k > 0; k--) { const q = Math.floor(Math.random() * (k + 1)); [foes[k], foes[q]] = [foes[q], foes[k]]; }
    const half = Math.ceil(foes.length / 2);
    const trait = ab.def.effects?.find((e) => e.status === 'traicion')?.duration ?? 20;
    foes.forEach((j, k) => {
      if (k < half && !(u.flags[j] & (F_BOSS | F_HERO))) applyStatus(b, j, 'traicion', trait, 1, c, ab);
      else applyStatus(b, j, 'miedo', 3, 1, c, ab);
      damage(b, j, ab.def.power * this.ex.powerOf(c, ab) * 0.3, { src: c, ab, kind: K_MAGIC, silent: true });
    });
    const p = b.tmpV.set(cx, b.heightAt(cx, cz), cz);
    b.fx.ring(p, { color: '#e6cc80', radius: r, duration: 0.9, intensity: 3 });
    b.fx.ring(p, { color: '#9b5cff', radius: r * 0.7, duration: 0.7, intensity: 3 });
    b.fx.emit('shadow', b.tmpV.set(cx, p.y + 2, cz), { count: 60, scale: 3 });
    b.fx.emit('light', b.tmpV.set(cx, p.y + 2, cz), { count: 40, scale: 2, color: '#e6cc80' });
    engine.pipeline.impact(3, 2);
    engine.pipeline.flash('#e6cc80', 0.5, 0.8);
    b.sfx('eclipse', cx, cz, 1, 1, 0);
    b.cam.rig.shake(0.8);
    this.eclipseT = 5;
    b.sky.override = { top: '#050308', mid: '#1a0d2e', horizon: '#6a3a9a', sunI: 0.2, amb: '#6a4aa0', ambI: 0.6, fog: '#2a1a4a', stars: 1, weight: 1 };
    b.sky.setTime(b.sky.time);
    if (isPl) {
      void cutin({ portrait: portraitSVG({ seed: 'elias', race: 'excepcion', special: 'elias', mood: 'smug', glowEyes: true }, 520), title: 'ECLIPSE TOTAL', subtitle: `${half} traidores`, colors: ['#0d0714', '#e6cc80'], side: 'right' });
      b.callout('¡ECLIPSE!', 'excepcion', `${half} se vuelven contra los suyos`);
    }
  }

  // ───────────── throwing & eating ─────────────

  private throwable(c: number, anyone: boolean): number {
    const b = this.b, u = b.u;
    const n = b.grid.query(u, u.x[c], u.z[c], 4.5, BUF, 96);
    let best = -1, bd = 1e9;
    for (let k = 0; k < n; k++) {
      const j = BUF[k];
      if (j === c || !b.alive(j) || u.state[j] === S_AIR || u.state[j] === S_HELD) continue;
      if (u.flags[j] & (F_PLAYER | F_BOSS | F_HERO)) continue;
      const hostile = b.hostile(c, j);
      if (hostile && !anyone && !(u.stMask[j] & (1 << 3))) continue; // enemies only when stunned
      if (u.scale[j] > Math.max(1.1, u.scale[c] * 0.7)) continue;
      const d = Math.hypot(u.x[j] - u.x[c], u.z[j] - u.z[c]);
      if (d < bd) { bd = d; best = j; }
    }
    return best;
  }

  private throwUnit(c: number, ab: AbilityRT, tx: number, tz: number, tu: number): void {
    const b = this.b, u = b.u;
    const j = this.throwable(c, ab.id === 'catapulta_humana');
    if (j < 0) return;
    u.state[j] = S_HELD; u.heldBy[j] = c;
    u.flags[j] |= F_THROWN;
    this.holds.push({ j, c, up: 1.05 });
    b.say(j, rndOf(['¡Nooo!', '¡Bájame!', '¡A la gran!', '¡Weeee!', '¡Mi mamá!']), 1.3);
    b.sfx('crowd_gasp', u.x[c], u.z[c], 0.4, 1.3, 400);
    if (u.flags[c] & F_RIG) b.rigs?.play(c, 'attack', 0.6);
    else { u.atkPh[c] = 0; u.atkDur[c] = 0.7; }
    this.later(0.45, () => {
      this.release(j);
      if (!u.active[j] || u.state[j] !== S_HELD) return;
      if (!b.alive(c)) { u.state[j] = S_AIR; u.vy[j] = 2; return; }
      let x = tx, z = tz;
      if (tu >= 0 && b.alive(tu)) { x = u.x[tu]; z = u.z[tu]; }
      const range = ab.def.range ?? 20;
      const dx = x - u.x[c], dz = z - u.z[c], d = Math.hypot(dx, dz);
      if (d > range) { x = u.x[c] + dx / d * range; z = u.z[c] + dz / d * range; }
      b.proj.spawn({ kind: P_ROCK, x: u.x[j], y: u.y[j], z: u.z[j], tx: x, ty: b.heightAt(x, z), tz: z, speed: ab.def.speed ?? 18, owner: c, side: u.side[c], dmg: ab.def.power * this.ex.powerOf(c, ab), knock: ab.knock || 16, radius: ab.def.radius ?? 3, ability: ab.idx, arc: 'high', scale: 0.01, thrown: j });
      b.sfx('whoosh', u.x[c], u.z[c], 0.8, 0.7, 0);
      if (u.flags[c] & F_PLAYER) { b.cam.rig.shake(0.3); engine.pipeline.chromaticPulse(0.5, 0.25); }
    });
  }

  landThrown(j: number, x: number, z: number, src: number): void {
    const b = this.b, u = b.u;
    if (!u.active[j]) return;
    u.state[j] = S_AIR; u.stT[j] = 0;
    u.x[j] = x; u.z[j] = z; u.y[j] = b.heightAt(x, z) + 0.2;
    u.vx[j] *= 0.35; u.vz[j] *= 0.35; u.vy[j] = 5;
    u.spinP[j] = -9; u.heldBy[j] = -1;
    if (b.alive(j) && !b.hostile(src >= 0 ? src : j, j)) applyStatus(b, j, 'furia', 5, 0.5, src, null);
    else if (b.alive(j)) damage(b, j, 25, { src, kind: K_MELEE });
    b.arena.cheer = 1;
  }

  /** Bite (generic melee) unless the target is weak enough to be eaten whole. */
  private devour(c: number, ab: AbilityRT, tu: number): boolean {
    const b = this.b, u = b.u;
    const j = tu >= 0 ? tu : this.ex.nearestHostile(c, u.x[c], u.z[c], 3.5);
    if (j < 0 || !b.alive(j) || !b.hostile(c, j) || (u.flags[j] & (F_PLAYER | F_BOSS | F_HERO | F_CLONE))) return false;
    if (Math.hypot(u.x[j] - u.x[c], u.z[j] - u.z[c]) > u.radius[c] + u.radius[j] + 2.4) return false;
    if (u.hp[j] > u.hpMax[j] * 0.25 && u.scale[j] > 0.7) return false;
    u.state[j] = S_HELD; u.heldBy[j] = c;
    this.holds.push({ j, c, up: 0.95 });
    b.say(j, rndOf(['¡No, no, no!', '¡Suéltame!', '¡Soy muy huesudo!']), 1);
    this.later(0.6, () => {
      this.release(j);
      if (!u.active[j]) return;
      if (!b.alive(c)) { u.state[j] = S_AIR; return; }
      u.flags[j] |= F_EATEN;
      u.state[j] = S_IDLE;
      kill(b, j, c);
      heal(b, c, (ab.def.effects?.find((e) => e.heal)?.heal ?? 60) * 1.5, c);
      u.exprTmp[c] = EX_EATING; u.exprT[c] = 1.6;
      b.sfx('eat', u.x[c], u.z[c], 1, 1, 0);
      b.float(c, '¡ÑAM!', 'info', false, '#c8e08a');
      this.later(1.3, () => { if (u.active[c]) { b.sfx('burp', u.x[c], u.z[c], 1, 1, 0); b.fx.emit('poison', b.tmpV.set(u.x[c], u.y[c] + b.heightOf(c), u.z[c]), { count: 6, color: '#c8e08a' }); } });
    });
    return true;
  }

  // ───────────── resurrection ─────────────

  /** Most recently fallen ally corpse near (x,z) or the caster. */
  fallenAlly(c: number, range: number, x = NaN, z = NaN): number {
    const b = this.b, u = b.u;
    const px = Number.isNaN(x) ? u.x[c] : x, pz = Number.isNaN(z) ? u.z[c] : z;
    let best = -1, bt = 1e9;
    for (let j = 0; j < u.n; j++) {
      if (!u.active[j] || u.state[j] !== S_DEAD || u.team[j] !== u.team[c] || u.sink[j] > 0 || (u.flags[j] & (F_EATEN | F_SUMMON | F_PLAYER))) continue;
      if (u.deadT[j] > 25 || Math.hypot(u.x[j] - px, u.z[j] - pz) > range + 2) continue;
      if (u.deadT[j] < bt) { bt = u.deadT[j]; best = j; }
    }
    return best;
  }

  private revive(j: number, frac: number, ab: AbilityRT): void {
    const b = this.b, u = b.u;
    const o = j * NJ * 3;
    // stand up where the pelvis lies
    u.x[j] = u.J[o + 6]; u.z[j] = u.J[o + 8]; u.y[j] = b.heightAt(u.x[j], u.z[j]);
    u.state[j] = S_IDLE; u.ragOn[j] = 0; u.deadT[j] = 0; u.sink[j] = 0;
    u.hp[j] = Math.max(1, u.hpMax[j] * Math.max(0.2, Math.min(1, frac)));
    u.tumble[j] = u.tumbleR[j] = 0; u.vx[j] = u.vz[j] = u.vy[j] = 0;
    clearStatuses(b, j);
    u.side[j] = u.team[j]; u.setTeamColor(j, u.team[j]);
    if (u.rig[j] >= 0) { const r = b.rigs?.get(j); if (r) r.pose = 'idle'; }
    const p = b.tmpV.set(u.x[j], u.y[j], u.z[j]);
    b.fx.emit('light', b.tmpV.set(u.x[j], u.y[j] + 1, u.z[j]), { count: 30 });
    b.fx.ring(p, { color: ab.color, radius: 2.5, duration: 0.5 });
    b.fx.beam(b.tmpV.set(u.x[j], u.y[j], u.z[j]), b.tmpV2(u.x[j], u.y[j] + 14, u.z[j]), { color: '#fff7d6', width: 0.6, duration: 0.6 });
    b.sfx('revive', u.x[j], u.z[j], 0.9, 1, 0);
    b.float(j, '¡Revive!', 'info', false, '#fff7d6');
  }

  // ───────────── update ─────────────

  private release(j: number): void { this.holds = this.holds.filter((h) => h.j !== j); }

  update(dt: number): void {
    const b = this.b, u = b.u;
    for (const h of this.holds) {
      if (!b.alive(h.c) || !u.active[h.j]) continue;
      const s = u.scale[h.c];
      u.x[h.j] = u.x[h.c] + Math.sin(u.yaw[h.c]) * 0.35 * s; u.z[h.j] = u.z[h.c] + Math.cos(u.yaw[h.c]) * 0.35 * s;
      u.y[h.j] = u.y[h.c] + b.heightOf(h.c) * h.up; u.vx[h.j] = u.vz[h.j] = 0;
    }
    for (let k = this.pending.length - 1; k >= 0; k--) {
      const p = this.pending[k];
      p.t -= dt;
      if (p.t <= 0) { this.pending.splice(k, 1); try { p.fn(); } catch (err) { console.warn('[battle] special', err); } }
    }
    this.stepCuts(dt);
    for (const g of this.ghosts) {
      if (g.t <= 0) continue;
      g.t -= dt;
      g.rig.setOpacity(Math.max(0, g.t / g.life) * 0.45);
      if (g.t <= 0) g.rig.root.visible = false;
    }
    for (let k = this.morphs.length - 1; k >= 0; k--) {
      const m = this.morphs[k];
      m.t += dt;
      if (m.t >= m.dur || !b.alive(m.unit)) { this.morphs.splice(k, 1); this.endMorph(m); }
    }
    if (this.eclipseT > 0) {
      this.eclipseT -= dt;
      if (this.eclipseT <= 0) { b.sky.override = b.arena.def.override ?? null; b.sky.setTime(b.sky.time); }
    }
  }

  dashEnded(_i: number, _ab: AbilityRT): void { /* hook kept for specials that chain after dashes */ }

  later(t: number, fn: () => void): void { this.pending.push({ t, fn }); }

  dispose(): void {
    for (const g of this.ghosts) g.rig.dispose();
    this.ghosts.length = 0;
    this.pending.length = 0;
    this.holds.length = 0;
    this.cuts = null;
  }
}

