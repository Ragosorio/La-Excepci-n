/**
 * BattleContext implementation (scripting API for story / casino): unit handles, spawn, cast, damage, heal, moveTo,
 * AI modes, speech bubbles, hints, camera focus, slow-mo, waits (game time), launches, input lock, comprehension, end.
 */
import * as THREE from 'three';
import type { BattleContext, BattleSetup, UnitHandle } from './api';
import type { Battle } from './world';
import { abilityRT, hasUnitDef } from './defs';
import { engine } from '../core/engine';
import { comprehend as codexComprehend } from '../systems/progression/codex';
import { damage as doDamage, heal as doHeal, K_MAGIC, K_MELEE } from './combat';
import { F_NOAI, F_PLAYER, F_SCRIPTED, S_AIR, S_DASH, S_DEAD, S_IDLE } from './const';

/** The context plus battle-internal helpers used by the scene (not part of the public API). */
export interface ScriptContext extends BattleContext {
  /** Handle for a unit index (ctx.player for Elias). */
  handleFor(i: number): UnitHandle;
}

export interface ContextHost {
  finish(victory: boolean, opts: { skipResults?: boolean; fled?: boolean }): void;
  addWait(seconds: number, resolve: () => void): void;
}

class Handle implements UnitHandle {
  private readonly pos = new THREE.Vector3();
  constructor(private readonly b: Battle, readonly id: number, private readonly gen: number) {}
  private get ok(): boolean { return this.b.u.active[this.id] === 1 && this.b.u.gen[this.id] === this.gen; }
  get team(): number { return this.b.u.team[this.id]; }
  get unitId(): string { return this.b.metaOf(this.id)?.unitId ?? this.b.u.specOf(this.id).id; }
  get name(): string | undefined { return this.ok ? this.b.nameOf(this.id) : undefined; }
  set name(v: string | undefined) { if (this.ok) this.b.setMeta(this.id, { name: v }); }
  get hp(): number { return this.ok ? this.b.u.hp[this.id] : 0; }
  set hp(v: number) { if (this.ok) this.b.u.hp[this.id] = Math.min(this.b.u.hpMax[this.id], Math.max(0, v)); }
  get hpMax(): number { return this.ok ? this.b.u.hpMax[this.id] : 0; }
  set hpMax(v: number) { if (this.ok) { this.b.u.hpMax[this.id] = Math.max(1, v); } }
  get position(): THREE.Vector3 { const u = this.b.u; return this.pos.set(u.x[this.id], u.y[this.id], u.z[this.id]); }
  get alive(): boolean { return this.ok && this.b.u.state[this.id] !== S_DEAD; }
  set alive(v: boolean) { if (!v && this.alive) doDamage(this.b, this.id, 1e9, { src: -1, kind: 5, silent: true }); }
  get npcId(): string | undefined { return this.b.metaOf(this.id)?.npcId; }
  get isPlayer(): boolean { return (this.b.u.flags[this.id] & F_PLAYER) !== 0; }
}

export function createContext(b: Battle, host: ContextHost, setup: BattleSetup): ScriptContext {
  const handles = new Map<number, Handle>();
  const handle = (i: number): Handle => {
    const g = b.u.gen[i];
    const key = i * 65536 + g;
    let hnd = handles.get(key);
    if (!hnd) { hnd = new Handle(b, i, g); handles.set(key, hnd); }
    return hnd;
  };
  const idx = (hd: UnitHandle): number => hd.id;
  const pl = () => b.player;
  const playerHandle = (): UnitHandle & { mana: number; manaMax: number; invulnerable: boolean; controlsInverted: boolean; minHp: number } => {
    const i = b.playerIdx;
    const base = i >= 0 ? handle(i) : null;
    return {
      get id() { return i; },
      get team() { return 0; },
      get unitId() { return base?.unitId ?? 'elias'; },
      get name() { return base?.name ?? 'Elias Veyr'; },
      set name(v: string | undefined) { if (base) base.name = v; },
      get hp() { return base?.hp ?? 0; },
      set hp(v: number) { if (base) base.hp = v; },
      get hpMax() { return base?.hpMax ?? 0; },
      set hpMax(v: number) { if (base) base.hpMax = v; },
      get position() { return base ? base.position : new THREE.Vector3(); },
      get alive() { return !!base?.alive && !pl()?.dead; },
      set alive(v: boolean) { if (base) base.alive = v; },
      get isPlayer() { return true; },
      get mana() { return pl()?.mana ?? 0; },
      set mana(v: number) { const p = pl(); if (p) p.mana = Math.max(0, Math.min(p.manaMax, v)); },
      get manaMax() { return pl()?.manaMax ?? 0; },
      get invulnerable() { return pl()?.invulnerable ?? false; },
      set invulnerable(v: boolean) { const p = pl(); if (p) p.invulnerable = v; },
      get controlsInverted() { return pl()?.controlsInverted ?? false; },
      set controlsInverted(v: boolean) { const p = pl(); if (p) p.controlsInverted = v; },
      get minHp() { return pl()?.minHp ?? 0; },
      set minHp(v: number) { const p = pl(); if (p) p.minHp = Math.max(0, v); },
    } as UnitHandle & { mana: number; manaMax: number; invulnerable: boolean; controlsInverted: boolean; minHp: number };
  };
  const player = playerHandle();

  const ctx: ScriptContext = {
    handleFor(i: number): UnitHandle { return b.u.flags[i] & F_PLAYER ? player : handle(i); },
    get time() { return b.time; },
    setup,
    player,
    units(team?: number): UnitHandle[] {
      const out: UnitHandle[] = [];
      const u = b.u;
      for (let i = 0; i < u.n; i++) {
        if (!u.active[i] || u.state[i] === S_DEAD) continue;
        if (team !== undefined && u.team[i] !== team) continue;
        out.push(u.flags[i] & F_PLAYER ? player : handle(i));
      }
      return out;
    },
    spawn(unitId, pos, team, opts = {}): UnitHandle {
      const id = hasUnitDef(unitId) ? unitId : unitId;
      const i = b.spawn(id, team, pos.x, pos.z, { name: opts.name, special: opts.special, hpMult: opts.hpMult, dmgMult: opts.dmgMult, abilities: opts.abilities, npcId: opts.npcId, captain: opts.captain, hero: !!opts.special, rig: !!opts.special, yaw: Math.atan2(-pos.x, -pos.z) });
      if (i < 0) throw new Error('[battle] spawn failed: no free unit slots');
      if (opts.name) b.setMeta(i, { name: opts.name });
      b.fx.emit('smoke', b.tmpV.set(pos.x, b.heightAt(pos.x, pos.z) + 0.6, pos.z), { count: 8 });
      return handle(i);
    },
    cast(caster, abilityId, target) {
      const c = idx(caster);
      if (!b.alive(c) || !b.abilities) return;
      const rt = abilityRT(abilityId);
      if (!rt) { console.warn('[battle] unknown ability', abilityId); return; }
      let tx = b.u.x[c] + Math.sin(b.u.yaw[c]) * 4, tz = b.u.z[c] + Math.cos(b.u.yaw[c]) * 4, tu = -1;
      if (target && 'id' in target) { tu = (target as UnitHandle).id; if (tu >= 0) { tx = b.u.x[tu]; tz = b.u.z[tu]; } }
      else if (target) { tx = (target as { x: number; z: number }).x; tz = (target as { x: number; z: number }).z; }
      b.abilities.cast(c, rt.idx, tx, tz, tu);
    },
    damage(target, amount, opts = {}) {
      const t = idx(target);
      const ab = opts.abilityId ? abilityRT(opts.abilityId) : null;
      let dx = 0, dz = 0;
      if (opts.from) { dx = b.u.x[t] - opts.from.x; dz = b.u.z[t] - opts.from.z; }
      doDamage(b, t, amount, { src: -1, ab, crit: opts.crit, knock: opts.knockback, dirX: dx, dirZ: dz, kind: ab ? K_MAGIC : K_MELEE });
    },
    heal(target, amount) { doHeal(b, idx(target), amount); },
    moveTo(hd, pos) {
      const i = idx(hd);
      if (!b.u.active[i]) return;
      if (b.u.flags[i] & F_PLAYER) { b.player?.scriptMove(pos.x, pos.z); return; }
      b.u.moveX[i] = pos.x; b.u.moveZ[i] = pos.z; b.u.moveOn[i] = 1;
    },
    setAI(hd, mode) {
      const i = idx(hd);
      if (!b.u.active[i]) return;
      b.u.flags[i] &= ~(F_NOAI | F_SCRIPTED);
      if (mode === 'idle') b.u.flags[i] |= F_NOAI;
      else if (mode === 'scripted') b.u.flags[i] |= F_SCRIPTED;
    },
    say(hd, text, seconds) { b.say(idx(hd), text, seconds ?? Math.max(2, text.length * 0.07)); },
    hint(text, seconds) { b.hud?.hint(text, seconds ?? 6); },
    cameraFocus(target, opts = {}) {
      if (!target) { b.cam.focus(null); return; }
      if ('id' in target) {
        const hd = target as UnitHandle;
        const v = new THREE.Vector3();
        b.cam.focus(() => { const i = hd.id; return b.u.active[i] ? v.set(b.u.x[i], b.u.y[i], b.u.z[i]) : null; }, opts.distance ?? 11, opts.duration ?? 0);
      } else {
        const p = target as { x: number; z: number };
        b.cam.focus(new THREE.Vector3(p.x, b.heightAt(p.x, p.z), p.z), opts.distance ?? 14, opts.duration ?? 0);
      }
    },
    slowmo(scale, seconds) { engine.slowmo(scale, seconds); },
    wait(seconds) { return new Promise<void>((resolve) => host.addWait(Math.max(0, seconds), resolve)); },
    launch(hd, v) {
      const i = idx(hd);
      if (!b.u.active[i]) return;
      if (b.u.flags[i] & F_PLAYER) { b.player?.launch(v.x, v.y, v.z); return; }
      const u = b.u;
      u.state[i] = S_AIR; u.stT[i] = 0; u.vx[i] = v.x; u.vy[i] = v.y; u.vz[i] = v.z; u.spinP[i] = -8; u.spinR[i] = 2; u.y[i] += 0.1;
      b.rigs?.airborne(i, true);
    },
    lockInput(locked) { const p = b.player; if (p) p.locked = locked; },
    comprehend(abilityId, amount = 1) {
      try {
        const r = codexComprehend(abilityId, amount);
        const rt = abilityRT(abilityId);
        if (rt) b.hud?.comprehension(rt, r.progress, r.required, r.acquired, r.justAcquired);
        if (r.justAcquired && !b.stats.copied.includes(abilityId)) { b.stats.copied.push(abilityId); b.player?.onAcquired(abilityId); }
      } catch (err) { console.warn('[battle] comprehend', err); }
    },
    end(victory, opts = {}) { host.finish(victory, opts); },
    rigOf(hd) { return b.rigs?.get(idx(hd)) ?? null; },
    teleport(hd, pos, opts = {}) {
      const i = idx(hd), u = b.u;
      if (i < 0 || !u.active[i] || u.state[i] === S_DEAD) return;
      const fx = opts.fx !== false;
      if (fx) b.fx.emit('shadow', b.tmpV.set(u.x[i], u.y[i] + 1, u.z[i]), { count: 16 });
      const c = { x: pos.x, z: pos.z };
      b.arena.clampField(pos.x, pos.z, u.radius[i], c);
      u.x[i] = c.x; u.z[i] = c.z; u.y[i] = b.heightAt(c.x, c.z);
      u.vx[i] = u.vy[i] = u.vz[i] = 0;
      u.moveOn[i] = 0;
      if (u.state[i] === S_AIR || u.state[i] === S_DASH) {
        u.state[i] = S_IDLE; u.stT[i] = 0; u.tumble[i] = u.tumbleR[i] = 0; u.spinP[i] = u.spinR[i] = 0;
        b.rigs?.airborne(i, false);
      }
      if (opts.yaw !== undefined) { u.yaw[i] = opts.yaw; u.wantYaw[i] = opts.yaw; }
      if (u.flags[i] & F_PLAYER) b.player?.clearScriptMove();
      if (fx) {
        b.fx.emit('shadow', b.tmpV.set(c.x, u.y[i] + 1, c.z), { count: 16 });
        b.fx.emit('arcane', b.tmpV.set(c.x, u.y[i] + 1, c.z), { count: 10, speed: 3 });
        b.sfx('teleport', c.x, c.z, 0.8, 1, 0);
      }
    },
    setRigOverride(hd, ov) { const i = idx(hd); if (i >= 0 && b.u.active[i]) b.rigs?.setOverride(i, ov); },
    get fx() { return b.fx; },
    get pipeline() { return engine.pipeline; },
    get scene() { return b.scene; },
    get camera() { return b.camera; },
  };
  return ctx;
}

