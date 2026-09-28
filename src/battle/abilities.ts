/**
 * Generic ability executor following the data conventions documented at the top of src/data/abilities.ts:
 * projectile (fan / splash), aoe (instant · lingering `duration` · `count` random impacts), cone (instant or sustained
 * breath), beam (line, or chain when `count` > 1), dash (straight · repeated `count` · leap-slam with ground+radius),
 * blink (teleport, chained damage on arrival), buff, debuff, summon (SUMMONS), aura, transform, channel (`count` ticks),
 * melee, trap (arms after 0.5 s), special. Id-specific behaviors live in ./specials.
 */
import type { Battle } from './world';
import { abilityAt, type AbilityRT } from './defs';
import {
  B_DISABLED, B_SILENCE, B_TOAD, F_BOSS, F_HERO, F_PLAYER, F_RIG, NA, P_ARROW, P_AXE, P_BOMB, P_HAMMER, P_ORB, P_ROCK, P_SPEAR, S_CAST, S_DASH, S_IDLE,
} from './const';
import { applyEffects, damage, explode, heal, K_MAGIC, K_MELEE } from './combat';
import { applyStatus, dmgOutMul } from './status';
import { Telegraphs, TELE_CIRCLE, TELE_CONE, TELE_LINE } from './telegraph';
import { Specials } from './specials';
import { knows } from '../systems/progression/codex';

const BUF = new Int32Array(96);
/** Passives that NPCs (Aurel, scripts) can actively cast — handled by ./specials. */
const CASTABLE_PASSIVES = new Set(['fuerza_titanica', 'retorno', 'afinidad_reliquias']);

type ZoneMode = 'aura' | 'linger' | 'impacts' | 'breath' | 'channel';
interface Zone {
  x: number; z: number; r: number; t: number; dur: number; tick: number; tickT: number; ab: AbilityRT; src: number; side: number;
  follow: number; power: number; mode: ZoneMode; tu: number; dirX: number; dirZ: number; ticks: number; done: number;
}
interface Trap { x: number; z: number; r: number; t: number; arm: number; ab: AbilityRT; src: number; side: number; power: number; pulse: number }
interface Dash { fx: number; fz: number; t: number; dur: number; speed: number; ab: AbilityRT; power: number; hit: number[]; leap: number }

export class Abilities {
  readonly tele: Telegraphs;
  readonly specials: Specials;
  private zones: Zone[] = [];
  private traps: Trap[] = [];
  private dashes = new Map<number, Dash>();
  /** Extra damage multiplier for Elias (debug power). */
  playerPower = 1;

  constructor(private b: Battle) {
    this.tele = new Telegraphs(b.scene);
    this.specials = new Specials(b, this);
  }

  /** Damage multiplier for a caster using an ability. */
  powerOf(c: number, ab: AbilityRT): number {
    const b = this.b, u = b.u;
    if (u.flags[c] & F_PLAYER) return b.player ? b.player.powerFor(ab) * this.playerPower : 1;
    return u.dmgMul[c] * dmgOutMul(b, c);
  }

  // ───────────── casting ─────────────

  /** Starts (or instantly executes) an ability. Returns false if it cannot be cast now. */
  cast(c: number, abIdx: number, tx: number, tz: number, tu = -1, castMul = 1): boolean {
    const b = this.b, u = b.u;
    if (!b.alive(c)) return false;
    const ab = abilityAt(abIdx);
    if (!ab || (ab.def.kind === 'passive' && !(CASTABLE_PASSIVES.has(ab.id) && !(u.flags[c] & F_PLAYER)))) return false;
    const m = u.stMask[c];
    if ((m & (B_DISABLED | B_TOAD)) || (m & B_SILENCE)) return false;
    if (!this.specials.canCast(c, ab, tx, tz, tu)) return false;
    const ct = (ab.def.castTime ?? 0) * castMul;
    if (ct > 0.05) {
      u.state[c] = S_CAST; u.stT[c] = 0;
      u.castAb[c] = abIdx; u.castT[c] = ct; u.castTx[c] = tx; u.castTz[c] = tz; u.castTu[c] = tu;
      u.atkPh[c] = -1;
      if (u.flags[c] & F_RIG) b.rigs?.play(c, 'cast', ct + 0.2);
      this.telegraph(c, ab, tx, tz, ct);
      b.fx.emit(ab.preset, b.tmpV.set(u.x[c], u.y[c] + b.heightOf(c) * 0.8, u.z[c]), { count: 8, color: ab.color, scale: 0.6 });
      if (ct >= 0.5) b.sfx('whoosh', u.x[c], u.z[c], 0.35, 0.7);
      return true;
    }
    this.execute(c, ab, tx, tz, tu);
    return true;
  }

  castStep(i: number, dt: number): void {
    const b = this.b, u = b.u;
    if (u.castAb[i] < 0) { u.state[i] = S_IDLE; return; }
    const tu = u.castTu[i];
    const ab0 = abilityAt(u.castAb[i]);
    if (tu >= 0 && b.alive(tu)) {
      if (ab0.def.target === 'enemy' || ab0.def.target === 'ally') { u.castTx[i] = u.x[tu]; u.castTz[i] = u.z[tu]; }
      if (!(u.flags[i] & F_PLAYER)) { u.wantFace[i] = 1; u.wantYaw[i] = Math.atan2(u.x[tu] - u.x[i], u.z[tu] - u.z[i]); }
    } else if (!(u.flags[i] & F_PLAYER)) { u.wantFace[i] = 1; u.wantYaw[i] = Math.atan2(u.castTx[i] - u.x[i], u.castTz[i] - u.z[i]); }
    u.castT[i] -= dt;
    if (u.castT[i] <= 0) {
      u.castAb[i] = -1;
      u.state[i] = S_IDLE;
      this.execute(i, ab0, u.castTx[i], u.castTz[i], u.castTu[i]);
    }
  }

  private telegraph(c: number, ab: AbilityRT, tx: number, tz: number, dur: number): void {
    const b = this.b, u = b.u, def = ab.def;
    const pi = b.playerIdx;
    const hostileToPlayer = pi >= 0 && u.side[c] !== u.side[pi];
    const near = pi >= 0 && Math.hypot(tx - u.x[pi], tz - u.z[pi]) < 22;
    if (!(u.flags[c] & F_PLAYER) && !(hostileToPlayer && near)) return;
    const copy = hostileToPlayer && ab.copyable && !safeKnows(ab.id);
    const color = !hostileToPlayer ? '#ffd36b' : copy ? '#b36bff' : '#ff4a5a';
    const yaw = Math.atan2(tx - u.x[c], tz - u.z[c]);
    const r = def.radius ?? 3;
    if (def.kind === 'aoe' || def.kind === 'channel' || def.kind === 'trap' || (def.kind === 'dash' && def.target === 'ground' && def.radius)) {
      const self = def.target === 'self' || def.target === 'direction';
      this.tele.show(c, TELE_CIRCLE, self ? u.x[c] : tx, u.y[c], self ? u.z[c] : tz, r, 0, dur, color, { follow: self });
    } else if (def.kind === 'cone' || def.kind === 'melee') {
      const rng = def.range ?? (def.kind === 'melee' ? 2.4 : 5);
      this.tele.show(c, TELE_CONE, u.x[c], u.y[c], u.z[c], rng + 0.5, yaw, dur, color, { angle: coneAngle(ab), follow: true });
    } else if (def.kind === 'beam' && (def.count ?? 1) <= 1) {
      this.tele.show(c, TELE_LINE, u.x[c], u.y[c], u.z[c], Math.max(0.8, def.radius ?? 1), yaw, dur, color, { len: def.range ?? 20 });
    } else if (def.kind === 'projectile' && (def.radius ?? 0) > 0) {
      this.tele.show(c, TELE_CIRCLE, tx, b.heightAt(tx, tz), tz, r, 0, dur + 0.5, color);
    }
  }

  cancelTelegraph(i: number): void { this.tele.cancel(i); }

  // ───────────── execution ─────────────

  execute(c: number, ab: AbilityRT, tx: number, tz: number, tu: number): void {
    const b = this.b, u = b.u, def = ab.def;
    if (!b.alive(c)) return;
    if (this.specials.execute(c, ab, tx, tz, tu)) { this.afterCast(c, ab); return; }
    const cm = (u.flags[c] & F_PLAYER) && b.player ? b.player.rollCrit() : 1;
    const pw = def.power * this.powerOf(c, ab) * cm;
    const cx = u.x[c], cz = u.z[c], cy = u.y[c];
    let dx = tx - cx, dz = tz - cz;
    let dl = Math.hypot(dx, dz);
    if (dl < 1e-3) { dx = Math.sin(u.yaw[c]); dz = Math.cos(u.yaw[c]); dl = 1; }
    const nx = dx / dl, nz = dz / dl;
    u.yaw[c] = Math.atan2(nx, nz);
    const range = (def.range ?? ab.range) * ((u.flags[c] & F_PLAYER) && b.player ? b.player.rangeMul(ab) : 1);
    const count = Math.max(1, def.count ?? 1);
    switch (def.kind) {
      case 'projectile': {
        const kind = projKindFor(ab);
        const handY = cy + b.heightOf(c) * 0.72;
        const spread = count > 1 ? Math.min(0.2, 0.9 / count) : 0;
        for (let k = 0; k < count; k++) {
          const a = (k - (count - 1) / 2) * spread;
          const ca = Math.cos(a), sa = Math.sin(a);
          const rx = nx * ca - nz * sa, rz = nx * sa + nz * ca;
          const dist = Math.min(range || 30, Math.max(dl, 2));
          let ex = cx + rx * dist, ez = cz + rz * dist;
          if (tu >= 0 && b.alive(tu) && count === 1) { ex = u.x[tu]; ez = u.z[tu]; }
          const straight = kind === P_ORB || def.target === 'direction';
          const far = def.target === 'direction' && kind === P_ORB;
          b.proj.spawn({
            kind, x: cx + nx * 0.6, y: handY, z: cz + nz * 0.6,
            tx: far ? cx + rx * (range || 30) : ex, ty: straight ? handY : b.heightAt(ex, ez) + 0.8, tz: far ? cz + rz * (range || 30) : ez,
            speed: def.speed ?? (kind === P_ORB ? 22 : 24), owner: c, side: u.side[c], dmg: pw, knock: ab.knock, radius: def.radius ?? 0,
            ability: ab.idx, homing: kind === P_ORB && tu >= 0 && !(u.flags[c] & F_PLAYER) ? tu : -1,
            arc: kind === P_ROCK || kind === P_BOMB ? 'high' : straight ? 'none' : 'low', color: ab.color,
            scale: kind === P_ORB ? 1 + (def.radius ?? 0) * 0.15 : kind === P_ROCK ? Math.max(1.2, u.scale[c] * 0.55) : 1,
            life: (range || 30) / (def.speed ?? 22) + 1.5, pierce: /perforante|ultima_estrella/.test(ab.id) ? 6 : 0, crit: cm > 1,
          });
        }
        break;
      }
      case 'aoe': {
        const self = def.target === 'self';
        let px = self ? cx : tx, pz = self ? cz : tz;
        if (!self && range && dl > range) { px = cx + nx * range; pz = cz + nz * range; }
        const r = def.radius ?? 4;
        if (count > 1) {
          const dur = def.duration ?? 1.5;
          this.zones.push(this.zone(ab, c, px, pz, r, dur, dur / count, pw, 'impacts', self ? c : -1, -1, nx, nz, count));
          b.fx.ring(b.tmpV.set(px, b.heightAt(px, pz), pz), { color: ab.color, radius: r, duration: 0.5, intensity: 1.4 });
          break;
        }
        if (pw > 0) explode(b, px, b.heightAt(px, pz), pz, r, pw, ab.knock, c, u.side[c], ab);
        else {
          this.statusBurst(c, ab, px, pz, r);
          b.fx.emit(ab.preset, b.tmpV.set(px, b.heightAt(px, pz) + 0.5, pz), { count: 30, color: ab.color, scale: r / 3 });
          b.fx.ring(b.tmpV.set(px, b.heightAt(px, pz), pz), { color: ab.color, radius: r * 1.1 });
        }
        if ((def.duration ?? 0) > 0 && (def.effects ?? []).some((e) => e.status)) {
          this.zones.push(this.zone(ab, c, px, pz, r, def.duration!, 0.5, 0, 'linger', -1, -1, nx, nz, 0));
        }
        break;
      }
      case 'cone': {
        if ((def.duration ?? 0) > 0) { this.zones.push(this.zone(ab, c, cx, cz, range || 5, def.duration!, 0.2, pw, 'breath', c, tu, nx, nz, 0)); break; }
        this.coneHit(c, ab, nx, nz, range || 5, pw, true);
        break;
      }
      case 'beam': {
        if (count > 1) {
          const first = tu >= 0 && b.alive(tu) && b.hostile(c, tu) ? tu : this.firstAlong(c, nx, nz, range || 16);
          if (first >= 0) this.chain(c, ab, first, pw, count);
          else this.lineBeam(c, ab, nx, nz, range || 16, pw);
        } else this.lineBeam(c, ab, nx, nz, range || 20, pw);
        break;
      }
      case 'dash': {
        if (count > 1) { this.specials.chainDash(c, ab, tx, tz, count, pw); break; }
        const dist = Math.min(range || 6, Math.max(2, dl));
        const leap = def.target === 'ground' && !!def.radius;
        const dur = leap ? Math.max(0.45, dist / 16) : Math.max(0.18, dist / 26);
        this.dashes.set(c, { fx: nx, fz: nz, t: 0, dur, speed: dist / dur, ab, power: pw, hit: [], leap: leap ? Math.min(6, 1.5 + dist * 0.3) : 0 });
        u.state[c] = S_DASH; u.stT[c] = 0;
        b.fx.emit(ab.preset, b.tmpV.set(cx, cy + 1, cz), { count: 10, color: ab.color });
        break;
      }
      case 'blink': {
        const dist = Math.min(range || 12, dl);
        this.teleport(c, cx + nx * dist, cz + nz * dist, ab);
        if (pw > 0) {
          if (count > 1) { const f = this.nearestHostile(c, u.x[c], u.z[c], 8); if (f >= 0) this.chain(c, ab, f, pw, count); }
          else explode(b, u.x[c], u.y[c], u.z[c], def.radius ?? 2.5, pw, ab.knock, c, u.side[c], ab);
        }
        break;
      }
      case 'buff': {
        for (const t of this.buffTargets(c, ab, tu)) {
          applyEffects(b, t, ab, c, 0, 0, true);
          if (pw > 0 && ab.positive) heal(b, t, pw, c);
          b.fx.emit(ab.preset, b.tmpV.set(u.x[t], u.y[t] + 1, u.z[t]), { count: 10, color: ab.color });
        }
        break;
      }
      case 'debuff': {
        let t = tu;
        if (t < 0 || !b.alive(t)) t = this.nearestHostile(c, tx, tz, 4);
        if (def.radius) {
          const n = b.grid.query(u, tx, tz, def.radius, BUF, 96);
          for (let k = 0; k < n; k++) { const j = BUF[k]; if (b.alive(j) && b.hostile(c, j)) this.debuffOne(c, j, ab, pw); }
        } else if (t >= 0) this.debuffOne(c, t, ab, pw);
        break;
      }
      case 'summon': this.specials.summon(c, ab, tx, tz, pw); break;
      case 'aura': {
        this.zones.push(this.zone(ab, c, cx, cz, def.radius ?? 7, def.duration ?? 8, 0.5, pw, 'aura', c, -1, nx, nz, 0));
        b.fx.ring(b.tmpV.set(cx, cy, cz), { color: ab.color, radius: def.radius ?? 7, duration: 0.6 });
        break;
      }
      case 'transform': this.specials.transform(c, ab); break;
      case 'channel': {
        const dur = def.duration ?? 2;
        const ticks = Math.max(2, def.count ?? Math.round(dur / 0.25));
        const self = def.target === 'self' || def.target === 'direction';
        this.zones.push(this.zone(ab, c, self ? cx : tx, self ? cz : tz, def.radius ?? (def.target === 'direction' ? range || 2.5 : 4), dur, dur / ticks, pw, 'channel', self ? c : -1, tu, nx, nz, ticks));
        break;
      }
      case 'melee': {
        const rng = range || 2.4;
        const n = b.grid.query(u, cx + nx * rng * 0.5, cz + nz * rng * 0.5, rng + 1.2, BUF, 96);
        let hits = 0;
        for (let k = 0; k < n; k++) {
          const j = BUF[k];
          if (!b.alive(j) || !b.hostile(c, j)) continue;
          const ex = u.x[j] - cx, ez = u.z[j] - cz, d = Math.hypot(ex, ez) || 1e-3;
          if (d > rng + u.radius[j] + u.radius[c] || (ex * nx + ez * nz) / d < 0.2) continue;
          damage(b, j, pw, { src: c, ab, knock: ab.knock, dirX: ex / d, dirZ: ez / d, kind: K_MELEE, crit: (u.flags[c] & F_PLAYER) !== 0 && !!b.player?.consumeVeilCrit() });
          applyEffects(b, j, ab, c, ex / d, ez / d, true);
          hits++;
          if (tu >= 0 && hits > 0 && !def.radius) break;
        }
        if (u.flags[c] & F_RIG) b.rigs?.play(c, 'attack', 0.35);
        b.fx.emit(ab.preset, b.tmpV.set(cx + nx * rng * 0.7, cy + 1, cz + nz * rng * 0.7), { count: 12, color: ab.color });
        break;
      }
      case 'trap': {
        let px = tx, pz = tz;
        if (range && dl > range) { px = cx + nx * range; pz = cz + nz * range; }
        this.traps.push({ x: px, z: pz, r: def.radius ?? 1.8, t: def.duration ?? 25, arm: 0.5, ab, src: c, side: u.side[c], power: pw, pulse: 0 });
        b.fx.ring(b.tmpV.set(px, b.heightAt(px, pz), pz), { color: ab.color, radius: def.radius ?? 1.8, duration: 0.4 });
        break;
      }
      default: {
        explode(b, tx, b.heightAt(tx, tz), tz, def.radius ?? 3, pw, ab.knock, c, u.side[c], ab);
        break;
      }
    }
    this.afterCast(c, ab);
  }

  private zone(ab: AbilityRT, src: number, x: number, z: number, r: number, dur: number, tick: number, power: number, mode: ZoneMode, follow: number, tu: number, dirX: number, dirZ: number, ticks: number): Zone {
    return { x, z, r, t: 0, dur, tick: Math.max(0.05, tick), tickT: mode === 'impacts' ? tick : 0, ab, src, side: this.b.u.side[src], follow, power, mode, tu, dirX, dirZ, ticks, done: 0 };
  }

  private afterCast(c: number, ab: AbilityRT): void {
    const b = this.b, u = b.u;
    b.sfx(ab.sfx, u.x[c], u.z[c], (u.flags[c] & F_PLAYER) ? 0.9 : 0.55);
    if (u.flags[c] & F_PLAYER) b.player?.onCastExecuted(ab);
  }

  coneHit(c: number, ab: AbilityRT, nx: number, nz: number, rng: number, pw: number, fx: boolean): void {
    const b = this.b, u = b.u;
    const cx = u.x[c], cz = u.z[c], cy = u.y[c];
    const half = coneAngle(ab);
    const n = b.grid.query(u, cx + nx * rng * 0.5, cz + nz * rng * 0.5, rng * 0.75 + 1.5, BUF, 96);
    for (let k = 0; k < n; k++) {
      const j = BUF[k];
      if (!b.alive(j) || !b.hostile(c, j)) continue;
      const ex = u.x[j] - cx, ez = u.z[j] - cz, d = Math.hypot(ex, ez);
      if (d > rng + u.radius[j] || d < 1e-3) continue;
      if (Math.acos(Math.max(-1, Math.min(1, (ex * nx + ez * nz) / d))) > half + 0.12) continue;
      if (pw > 0) damage(b, j, pw, { src: c, ab, knock: fx ? ab.knock : 0, dirX: nx * 0.7 + (ex / d) * 0.3, dirZ: nz * 0.7 + (ez / d) * 0.3, kind: K_MAGIC, silent: !fx && !b.isPlayerish(c) });
      applyEffects(b, j, ab, c, nx, nz, true);
    }
    const steps = fx ? 6 : 3;
    for (let s = 1; s <= steps; s++) {
      const f = (s / steps) * rng;
      b.fx.emit(ab.preset, b.tmpV.set(cx + nx * f, cy + 1, cz + nz * f), { count: fx ? 5 : 2, color: ab.color, dir: b.tmpV2(nx, 0.1, nz), cone: 0.6, speed: 6, scale: 0.5 + f / rng });
    }
    if (fx) b.cam.rig.shake(ab.knock > 15 ? 0.3 : 0.1);
  }

  private statusBurst(c: number, ab: AbilityRT, x: number, z: number, r: number): number {
    const b = this.b, u = b.u;
    const n = b.grid.query(u, x, z, r + 1, BUF, 96);
    let hits = 0;
    const toAllies = ab.positive;
    for (let k = 0; k < n; k++) {
      const j = BUF[k];
      if (!b.alive(j)) continue;
      if (toAllies ? b.hostile(c, j) : !b.hostile(c, j)) continue;
      const dx = u.x[j] - x, dz = u.z[j] - z, d = Math.hypot(dx, dz) || 1;
      if (d > r + u.radius[j]) continue;
      applyEffects(b, j, ab, c, dx / d, dz / d, false);
      hits++;
    }
    return hits;
  }

  private debuffOne(c: number, t: number, ab: AbilityRT, pw: number): void {
    const b = this.b, u = b.u;
    const dx = u.x[t] - u.x[c], dz = u.z[t] - u.z[c], d = Math.hypot(dx, dz) || 1;
    if (pw > 0) damage(b, t, pw, { src: c, ab, kind: K_MAGIC });
    applyEffects(b, t, ab, c, dx / d, dz / d, false);
    b.fx.beam(b.tmpV.set(u.x[c], u.y[c] + b.heightOf(c) * 0.8, u.z[c]), b.tmpV2(u.x[t], u.y[t] + b.heightOf(t) * 0.7, u.z[t]), { color: ab.color, width: 0.08, duration: 0.35 });
    b.fx.emit(ab.preset, b.tmpV.set(u.x[t], u.y[t] + b.heightOf(t) * 0.7, u.z[t]), { count: 14, color: ab.color });
  }

  private buffTargets(c: number, ab: AbilityRT, tu: number): number[] {
    const b = this.b, u = b.u, def = ab.def;
    const out: number[] = [];
    if (def.target === 'ally') {
      let t = tu >= 0 && b.alive(tu) && !b.hostile(c, tu) ? tu : this.mostWounded(c, def.range ?? 12, 1);
      if (t < 0) t = c;
      out.push(t);
    } else out.push(c);
    if (def.radius) {
      const n = b.grid.query(u, u.x[out[0]], u.z[out[0]], def.radius, BUF, 96);
      for (let k = 0; k < n; k++) { const j = BUF[k]; if (j !== out[0] && b.alive(j) && !b.hostile(c, j)) out.push(j); }
    }
    return out;
  }

  private lineBeam(c: number, ab: AbilityRT, nx: number, nz: number, len: number, pw: number): void {
    const b = this.b, u = b.u, def = ab.def;
    const w = Math.max(0.8, def.radius ?? 1);
    const cx = u.x[c], cz = u.z[c], cy = u.y[c] + b.heightOf(c) * 0.7;
    const hit: number[] = [];
    for (let s = 0; s <= len; s += 3) {
      const n = b.grid.query(u, cx + nx * s, cz + nz * s, 3 + w, BUF, 96);
      for (let k = 0; k < n; k++) {
        const j = BUF[k];
        if (!b.alive(j) || !b.hostile(c, j) || hit.includes(j)) continue;
        const ex = u.x[j] - cx, ez = u.z[j] - cz;
        const along = ex * nx + ez * nz;
        if (along < 0 || along > len) continue;
        if (Math.abs(ex * nz - ez * nx) > w + u.radius[j]) continue;
        hit.push(j);
        damage(b, j, pw, { src: c, ab, knock: ab.knock, dirX: nx, dirZ: nz, kind: K_MAGIC });
        applyEffects(b, j, ab, c, nx, nz, true);
      }
    }
    const a = b.tmpV.set(cx + nx * 0.6, cy, cz + nz * 0.6);
    const e = b.tmpV2(cx + nx * len, cy, cz + nz * len);
    b.fx.beam(a, e, { color: ab.color, width: w * 0.9, duration: 0.45, intensity: 3 });
    b.fx.beam(a, e, { color: '#ffffff', width: w * 0.35, duration: 0.3, intensity: 3 });
    for (let s = 0; s <= len; s += 2.5) b.fx.emit(ab.preset, b.tmpV.set(cx + nx * s, cy, cz + nz * s), { count: 3, color: ab.color, scale: 0.7 });
    b.cam.rig.shake(0.2);
  }

  private firstAlong(c: number, nx: number, nz: number, len: number): number {
    const b = this.b, u = b.u;
    let best = -1, bd = 1e9;
    for (let s = 2; s <= len; s += 3) {
      const n = b.grid.query(u, u.x[c] + nx * s, u.z[c] + nz * s, 3, BUF, 96);
      for (let k = 0; k < n; k++) {
        const j = BUF[k];
        if (!b.alive(j) || !b.hostile(c, j)) continue;
        const d = Math.hypot(u.x[j] - u.x[c], u.z[j] - u.z[c]);
        if (d < bd) { bd = d; best = j; }
      }
      if (best >= 0) break;
    }
    return best;
  }

  chain(c: number, ab: AbilityRT, first: number, pw: number, hops: number): void {
    const b = this.b, u = b.u, def = ab.def;
    const hit: number[] = [];
    let cur = first, px = u.x[c], py = u.y[c] + b.heightOf(c) * 0.8, pz = u.z[c];
    for (let h = 0; h < hops && cur >= 0; h++) {
      hit.push(cur);
      const ty = u.y[cur] + b.heightOf(cur) * 0.6;
      b.fx.bolt(b.tmpV.set(px, py, pz), b.tmpV2(u.x[cur], ty, u.z[cur]), { color: ab.color });
      damage(b, cur, pw * Math.pow(0.85, h), { src: c, ab, knock: ab.knock, kind: K_MAGIC });
      applyEffects(b, cur, ab, c, 0, 0, false);
      b.fx.emit(ab.preset, b.tmpV.set(u.x[cur], ty, u.z[cur]), { count: 8, color: ab.color });
      px = u.x[cur]; py = ty; pz = u.z[cur];
      const n = b.grid.query(u, px, pz, Math.max(6, def.radius ?? 6), BUF, 96);
      let best = -1, bd = 1e9;
      for (let k = 0; k < n; k++) {
        const j = BUF[k];
        if (!b.alive(j) || !b.hostile(c, j) || hit.includes(j)) continue;
        const d = Math.hypot(u.x[j] - px, u.z[j] - pz);
        if (d < bd) { bd = d; best = j; }
      }
      cur = best;
    }
  }

  teleport(c: number, x: number, z: number, ab: AbilityRT | null): void {
    const b = this.b, u = b.u;
    const col = ab?.color ?? '#c7a2ff';
    b.fx.emit(ab?.preset ?? 'arcane', b.tmpV.set(u.x[c], u.y[c] + 1, u.z[c]), { count: 18, color: col });
    b.fx.flash(b.tmpV, { color: col, radius: 1.6, duration: 0.2 });
    const cl = { x, z };
    b.arena.clampField(x, z, u.radius[c], cl);
    u.x[c] = cl.x; u.z[c] = cl.z; u.y[c] = b.heightAt(cl.x, cl.z);
    u.vx[c] = u.vz[c] = 0;
    b.fx.emit(ab?.preset ?? 'arcane', b.tmpV.set(u.x[c], u.y[c] + 1, u.z[c]), { count: 22, color: col });
    b.fx.ring(b.tmpV.set(u.x[c], u.y[c], u.z[c]), { color: col, radius: 2.5, duration: 0.35 });
    b.sfx('teleport', u.x[c], u.z[c], 0.7);
  }

  // ───────────── dashes ─────────────

  startDash(c: number, nx: number, nz: number, dist: number, ab: AbilityRT, power: number): void {
    const dur = Math.max(0.16, dist / 28);
    this.dashes.set(c, { fx: nx, fz: nz, t: 0, dur, speed: dist / dur, ab, power, hit: [], leap: 0 });
    this.b.u.state[c] = S_DASH; this.b.u.stT[c] = 0;
  }

  dashStep(i: number, dt: number): void {
    const b = this.b, u = b.u;
    const d = this.dashes.get(i);
    if (!d) { u.state[i] = S_IDLE; return; }
    d.t += dt;
    u.vx[i] = d.fx * d.speed; u.vz[i] = d.fz * d.speed;
    u.x[i] += u.vx[i] * dt; u.z[i] += u.vz[i] * dt;
    const cl = { x: 0, z: 0 };
    if (b.arena.clampField(u.x[i], u.z[i], u.radius[i], cl)) { u.x[i] = cl.x; u.z[i] = cl.z; d.t = Math.max(d.t, d.dur); }
    const k = Math.min(1, d.t / d.dur);
    u.y[i] = b.heightAt(u.x[i], u.z[i]) + (d.leap ? Math.sin(k * Math.PI) * d.leap : 0);
    u.yaw[i] = Math.atan2(d.fx, d.fz);
    if (!d.leap) {
      const n = b.grid.query(u, u.x[i], u.z[i], u.radius[i] + 1.4, BUF, 96);
      for (let q = 0; q < n; q++) {
        const j = BUF[q];
        if (!b.alive(j) || !b.hostile(i, j) || d.hit.includes(j)) continue;
        d.hit.push(j);
        const side = Math.random() < 0.5 ? 1 : -1, sx = -d.fz * side, sz = d.fx * side;
        if (d.power > 0) damage(b, j, d.power, { src: i, ab: d.ab, knock: Math.max(4, d.ab.knock), dirX: d.fx * 0.5 + sx * 0.5, dirZ: d.fz * 0.5 + sz * 0.5, kind: K_MELEE });
        applyEffects(b, j, d.ab, i, d.fx, d.fz, true);
      }
    }
    if (Math.random() < 0.6) b.fx.emit(d.ab.preset, b.tmpV.set(u.x[i], u.y[i] + 1, u.z[i]), { count: 3, color: d.ab.color, scale: 0.6 });
    if (d.t >= d.dur) {
      this.dashes.delete(i);
      u.state[i] = S_IDLE;
      u.vx[i] *= 0.2; u.vz[i] *= 0.2;
      u.y[i] = b.heightAt(u.x[i], u.z[i]);
      if (d.leap) explode(b, u.x[i], u.y[i], u.z[i], d.ab.def.radius ?? 3, d.power, Math.max(10, d.ab.knock), i, u.side[i], d.ab);
    }
  }

  isDashing(i: number): boolean { return this.dashes.has(i); }

  // ───────────── persistent effects ─────────────

  update(dt: number): void {
    const b = this.b, u = b.u;
    this.tele.update(dt, b.time, (i) => (u.active[i] ? { x: u.x[i], y: u.y[i], z: u.z[i] } : null));
    for (let k = this.zones.length - 1; k >= 0; k--) {
      const zn = this.zones[k];
      zn.t += dt;
      if (zn.follow >= 0) {
        if (!b.alive(zn.follow)) { this.zones.splice(k, 1); continue; }
        zn.x = u.x[zn.follow]; zn.z = u.z[zn.follow];
        if (zn.mode === 'breath' || zn.mode === 'channel') { zn.dirX = Math.sin(u.yaw[zn.follow]); zn.dirZ = Math.cos(u.yaw[zn.follow]); }
      }
      if ((zn.mode === 'channel' || zn.mode === 'breath') && zn.src >= 0 && b.alive(zn.src) && !(u.flags[zn.src] & F_PLAYER)) {
        const s = zn.src;
        u.vx[s] *= 0.5; u.vz[s] *= 0.5; u.wantX[s] = u.wantZ[s] = 0;
        if (zn.tu >= 0 && b.alive(zn.tu)) { u.wantFace[s] = 1; u.wantYaw[s] = Math.atan2(u.x[zn.tu] - u.x[s], u.z[zn.tu] - u.z[s]); }
        if (u.flags[s] & F_RIG) { const r = b.rigs?.get(s); if (r) r.pose = 'channel'; }
      }
      zn.tickT += dt;
      const limited = zn.mode === 'impacts' || zn.mode === 'channel';
      while (zn.tickT >= zn.tick && (!limited || zn.done < zn.ticks)) {
        zn.tickT -= zn.tick;
        this.zoneTick(zn);
        zn.done++;
      }
      if (zn.t >= zn.dur + 0.05) {
        if (zn.src >= 0 && (u.flags[zn.src] & F_RIG)) { const r = b.rigs?.get(zn.src); if (r && r.pose === 'channel') r.pose = 'idle'; }
        this.zones.splice(k, 1);
      }
    }
    for (let k = this.traps.length - 1; k >= 0; k--) {
      const tr = this.traps[k];
      tr.t -= dt; tr.pulse -= dt; tr.arm -= dt;
      if (tr.pulse <= 0) { tr.pulse = 0.9; b.fx.ring(b.tmpV.set(tr.x, b.heightAt(tr.x, tr.z), tr.z), { color: tr.ab.color, radius: tr.r, duration: 0.5, intensity: tr.arm > 0 ? 0.6 : 1.3 }); }
      if (tr.arm <= 0) {
        let fired = false;
        const n = b.grid.query(u, tr.x, tr.z, tr.r, BUF, 16);
        for (let q = 0; q < n; q++) { const j = BUF[q]; if (b.alive(j) && u.side[j] !== tr.side) { fired = true; break; } }
        if (fired) {
          explode(b, tr.x, b.heightAt(tr.x, tr.z), tr.z, tr.r * 1.4, Math.max(tr.power, 1), tr.ab.knock || 18, tr.src, tr.side, tr.ab);
          this.traps.splice(k, 1);
          continue;
        }
      }
      if (tr.t <= 0) this.traps.splice(k, 1);
    }
  }

  private zoneTick(zn: Zone): void {
    const b = this.b, u = b.u, ab = zn.ab;
    const gy = b.heightAt(zn.x, zn.z);
    switch (zn.mode) {
      case 'impacts': {
        const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * zn.r;
        const x = zn.x + Math.cos(a) * r, z = zn.z + Math.sin(a) * r;
        const kind = ab.school === 'fisico' ? P_ARROW : ab.school === 'tierra' ? P_ROCK : P_ORB;
        const hy = b.heightAt(x, z);
        b.proj.spawn({ kind, x: x - 2 * zn.dirX, y: hy + 18, z: z - 2 * zn.dirZ, tx: x, ty: hy, tz: z, speed: 30, arc: 'none', owner: zn.src, side: zn.side, dmg: zn.power, knock: ab.knock * 0.6, ability: ab.idx, radius: kind === P_ARROW ? 1.2 : 1.6, color: ab.color, scale: kind === P_ORB ? 1.3 : 1 });
        return;
      }
      case 'breath': {
        if (!b.alive(zn.src)) { zn.t = zn.dur; return; }
        this.coneHit(zn.src, ab, zn.dirX, zn.dirZ, zn.r, zn.power * zn.tick / Math.max(0.3, zn.dur), false);
        return;
      }
      case 'channel': {
        if (!b.alive(zn.src)) { zn.t = zn.dur; return; }
        const per = zn.power / Math.max(1, zn.ticks);
        const last = zn.done >= zn.ticks - 1;
        const s = zn.src;
        if (zn.tu >= 0 && ab.def.target === 'enemy') {
          if (!b.alive(zn.tu)) { zn.t = zn.dur; return; }
          const t = zn.tu;
          b.fx.beam(b.tmpV.set(u.x[s], u.y[s] + b.heightOf(s) * 0.8, u.z[s]), b.tmpV2(u.x[t], u.y[t] + b.heightOf(t) * 0.6, u.z[t]), { color: ab.color, width: 0.14, duration: zn.tick * 1.2 });
          damage(b, t, per, { src: s, ab, kind: K_MAGIC, knock: last ? ab.knock : 0 });
          applyEffects(b, t, ab, s, 0, 0, true);
          return;
        }
        if (ab.def.target === 'direction') {
          const n = b.grid.query(u, u.x[s] + zn.dirX * zn.r * 0.6, u.z[s] + zn.dirZ * zn.r * 0.6, zn.r + 1, BUF, 32);
          for (let k = 0; k < n; k++) {
            const j = BUF[k];
            if (!b.alive(j) || !b.hostile(s, j)) continue;
            const ex = u.x[j] - u.x[s], ez = u.z[j] - u.z[s], d = Math.hypot(ex, ez) || 1;
            if (d > zn.r + u.radius[j] + u.radius[s] || (ex * zn.dirX + ez * zn.dirZ) / d < 0.3) continue;
            damage(b, j, per, { src: s, ab, kind: K_MELEE, knock: last ? ab.knock : 0, dirX: ex / d, dirZ: ez / d, silent: !last && !b.isPlayerish(s) });
          }
          if (u.flags[s] & F_RIG) b.rigs?.play(s, 'attack', zn.tick * 0.9);
          b.fx.emit(ab.preset, b.tmpV.set(u.x[s] + zn.dirX * 1.2, u.y[s] + 1.1, u.z[s] + zn.dirZ * 1.2), { count: 3, color: ab.color, scale: 0.6 });
          b.sfx('hit_light', u.x[s], u.z[s], 0.4, 1 + Math.random() * 0.3, 40);
          return;
        }
        const n = b.grid.query(u, zn.x, zn.z, zn.r + 1, BUF, 96);
        for (let k = 0; k < n; k++) {
          const j = BUF[k];
          if (!b.alive(j) || !b.hostile(s, j)) continue;
          if ((u.x[j] - zn.x) ** 2 + (u.z[j] - zn.z) ** 2 > (zn.r + u.radius[j]) ** 2) continue;
          damage(b, j, per, { src: s, ab, kind: K_MAGIC, knock: last ? ab.knock : 0, silent: true });
          applyEffects(b, j, ab, s, 0, 0, true);
        }
        const a = Math.random() * 6.283, r = Math.random() * zn.r;
        b.fx.emit(ab.preset, b.tmpV.set(zn.x + Math.cos(a) * r, gy + 0.5, zn.z + Math.sin(a) * r), { count: 5, color: ab.color });
        return;
      }
      default: {
        // aura / linger: positive → allies, negative → enemies
        const n = b.grid.query(u, zn.x, zn.z, zn.r + 1, BUF, 96);
        const good = ab.positive;
        for (let k = 0; k < n; k++) {
          const j = BUF[k];
          if (!b.alive(j)) continue;
          const hostile = u.side[j] !== zn.side;
          if (good === hostile) continue;
          if ((u.x[j] - zn.x) ** 2 + (u.z[j] - zn.z) ** 2 > (zn.r + u.radius[j]) ** 2) continue;
          if (zn.mode === 'aura' && hostile && zn.power > 0) damage(b, j, zn.power * zn.tick / Math.max(1, zn.dur), { src: zn.src, ab, kind: K_MAGIC, silent: true });
          if (zn.mode === 'aura' && !hostile && zn.power > 0 && good) heal(b, j, zn.power * zn.tick / Math.max(1, zn.dur), zn.src, true);
          for (const e of ab.def.effects ?? []) if (e.status) applyStatus(b, j, e.status, Math.max(zn.tick * 2.2, Math.min(e.duration ?? 2, 2)), e.magnitude, zn.src, ab);
        }
        if (Math.random() < 0.8) {
          const a = Math.random() * 6.283, r = Math.random() * zn.r;
          b.fx.emit(ab.preset, b.tmpV.set(zn.x + Math.cos(a) * r, gy + 0.4, zn.z + Math.sin(a) * r), { count: 3, color: ab.color, scale: 0.8 });
        }
      }
    }
  }

  /** An ogre-thrown unit lands (called from the projectile carrying it). */
  landThrown(unit: number, x: number, z: number, src: number): void { this.specials.landThrown(unit, x, z, src); }

  // ───────────── AI ─────────────

  aiTry(i: number): boolean {
    const b = this.b, u = b.u;
    const start = (b.time * 7 + i) | 0;
    for (let q = 0; q < NA; q++) {
      const k = (start + q) % NA;
      const a = u.abil[i * NA + k];
      if (a < 0 || u.abilCd[i * NA + k] > 0) continue;
      const ab = abilityAt(a);
      if (ab.def.kind === 'passive') continue;
      const tgt = this.aiTarget(i, ab);
      if (!tgt) continue;
      if (this.cast(i, a, tgt.x, tgt.z, tgt.u)) {
        u.abilCd[i * NA + k] = Math.max(1.5, ab.def.cooldown) * (1 + Math.random() * 0.35) + (u.flags[i] & (F_BOSS | F_HERO) ? 0 : 1);
        return true;
      }
    }
    return false;
  }

  private aiTarget(i: number, ab: AbilityRT): { x: number; z: number; u: number } | null {
    const b = this.b, u = b.u, def = ab.def;
    const t0 = u.target[i];
    const inCombat = t0 >= 0 && b.alive(t0) && Math.hypot(u.x[t0] - u.x[i], u.z[t0] - u.z[i]) < 11;
    if (ab.id === 'resurreccion_menor') { const d = this.specials.fallenAlly(i, def.range ?? 10); return d >= 0 ? { x: u.x[d], z: u.z[d], u: d } : null; }
    if (ab.positive || def.target === 'ally') {
      if (def.target === 'ally' || ab.heal > 0) {
        const w = this.mostWounded(i, def.range ?? 12, 0.62);
        return w >= 0 ? { x: u.x[w], z: u.z[w], u: w } : null;
      }
      return inCombat ? { x: u.x[i], z: u.z[i], u: i } : null;
    }
    if (def.kind === 'summon' || def.kind === 'transform' || (def.kind === 'aura' && !ab.positive)) return inCombat ? { x: u.x[t0], z: u.z[t0], u: i } : null;
    let t = t0;
    const pi = b.playerIdx;
    const rangeA = def.range ?? ab.range;
    if (pi >= 0 && b.alive(pi) && b.hostile(i, pi) && Math.random() < 0.4) {
      const dp = Math.hypot(u.x[pi] - u.x[i], u.z[pi] - u.z[i]);
      if (dp <= Math.max(rangeA, (def.radius ?? 0) * 0.9) + 1) t = pi;
    }
    if (t < 0 || !b.alive(t)) return null;
    const d = Math.hypot(u.x[t] - u.x[i], u.z[t] - u.z[i]);
    if (def.target === 'self' || rangeA <= 0) {
      const r = def.radius ?? 3;
      if (d > r * 0.85) return null;
      if (this.countHostiles(i, u.x[i], u.z[i], r) < 2 && !b.isPlayerish(t) && !b.isNamed(t)) return null;
      return { x: u.x[i], z: u.z[i], u: t };
    }
    if (d > rangeA + 0.5) return null;
    if ((def.kind === 'aoe' || def.kind === 'channel' || def.kind === 'trap') && def.radius) {
      if (this.countHostiles(i, u.x[t], u.z[t], def.radius) < 2 && !b.isPlayerish(t) && !b.isNamed(t)) return null;
    }
    if (ab.control && (u.flags[t] & (F_BOSS | F_HERO))) return null;
    return { x: u.x[t], z: u.z[t], u: t };
  }

  // ───────────── queries ─────────────

  countHostiles(c: number, x: number, z: number, r: number): number {
    const b = this.b, u = b.u;
    const n = b.grid.query(u, x, z, r, BUF, 96);
    let k = 0;
    for (let q = 0; q < n; q++) { const j = BUF[q]; if (b.alive(j) && b.hostile(c, j)) k++; }
    return k;
  }

  nearestHostile(c: number, x: number, z: number, r: number): number {
    const b = this.b, u = b.u;
    const n = b.grid.query(u, x, z, r, BUF, 96);
    let best = -1, bd = 1e9;
    for (let q = 0; q < n; q++) {
      const j = BUF[q];
      if (!b.alive(j) || !b.hostile(c, j)) continue;
      const d = Math.hypot(u.x[j] - x, u.z[j] - z);
      if (d < bd) { bd = d; best = j; }
    }
    return best;
  }

  mostWounded(c: number, range: number, below: number): number {
    const b = this.b, u = b.u;
    const n = b.grid.query(u, u.x[c], u.z[c], range, BUF, 96);
    let best = -1, bp = below;
    for (let q = 0; q < n; q++) {
      const j = BUF[q];
      if (!b.alive(j) || b.hostile(c, j)) continue;
      const p = u.hp[j] / u.hpMax[j];
      if (p < bp) { bp = p; best = j; }
    }
    return best;
  }

  clear(): void { this.zones.length = 0; this.traps.length = 0; this.dashes.clear(); }
  dispose(): void { this.clear(); this.tele.dispose(); this.specials.dispose(); }
}

function coneAngle(ab: AbilityRT): number {
  const d = ab.def, rng = d.range ?? 5, r = d.radius ?? 3;
  return Math.max(0.35, Math.min(1.1, Math.atan2(r, rng)));
}

export function projKindFor(ab: AbilityRT): number {
  const id = ab.id;
  if (/roca|piedra|pedrada|meteoro/.test(id) || ab.school === 'tierra') return P_ROCK;
  if (/bomba|barril|cuete|granada/.test(id)) return P_BOMB;
  if (/flecha|disparo|saeta|dardo|ballesta|virote/.test(id)) return P_ARROW;
  if (/lanza|jabalina/.test(id)) return P_SPEAR;
  if (/hacha|cuchillo/.test(id)) return P_AXE;
  if (/martillo/.test(id)) return P_HAMMER;
  return P_ORB;
}

function safeKnows(id: string): boolean { try { return knows(id); } catch { return false; } }
