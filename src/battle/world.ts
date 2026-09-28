/**
 * The Battle world: owns the unit store and every subsystem, plus shared helpers (spawn, hostility,
 * positional sfx with rate limiting, hitstop budget, damage-number policy, callouts).
 */
import * as THREE from 'three';
import type { BattleSetup } from './api';
import type { SfxName } from '../audio';
import { audio } from '../audio';
import { engine } from '../core/engine';
import { floatText, type FloatOpts } from '../ui/float';
import { Sky } from '../render/sky';
import { Fx } from '../render/fx';
import { Units } from './units';
import { Grid } from './grid';
import { Arena } from './arena';
import { Crowd } from './crowd';
import { Ragdolls } from './ragdoll';
import { Projectiles } from './projectiles';
import { BattleCamera } from './camera';
import { specFor, abilityRT } from './defs';
import { F_CAPTAIN, F_BOSS, F_HERO, F_ROUT, F_FLED, F_PLAYER, F_CLONE, MAXU, S_DEAD, NA, TEAM_ENEMY, TEAM_PLAYER } from './const';
import type { PlayerCtl } from './player';
import type { Rigs } from './rigs';
import type { Hud } from './hud';
import type { Abilities } from './abilities';
import type { Siege } from './siege';

export interface SpawnOpts {
  name?: string;
  special?: string;
  hpMult?: number;
  dmgMult?: number;
  abilities?: string[];
  npcId?: string;
  captain?: boolean;
  boss?: boolean;
  hero?: boolean;
  stars?: number;
  armyIdx?: number;
  yaw?: number;
  y?: number;
  rig?: boolean;
}

export interface BattleStats {
  kills: number;               // enemies killed (by anyone on the player side)
  playerKills: number;         // by Elias himself
  lost: number;
  copied: string[];
  captainsKilled: string[];
  captainsFled: string[];
  captainKilledPlayer?: string;
  revivals: number;
  deaths: number;
  essence: number;
  gold: number;
  maxStreak: number;
  knockbacks: number;
}

export interface UnitMeta { name?: string; title?: string; npcId?: string; special?: string; unitId: string }

export type Phase = 'loading' | 'deploy' | 'intro' | 'fight' | 'over';

export class Battle {
  readonly u = new Units();
  readonly grid: Grid;
  readonly arena: Arena;
  readonly sky: Sky;
  readonly fx: Fx;
  readonly crowd: Crowd;
  readonly rag: Ragdolls;
  readonly proj: Projectiles;
  readonly cam: BattleCamera;
  readonly heightAt: (x: number, z: number) => number;
  /** Per-slot metadata (names, npc ids) — sparse. */
  readonly meta: (UnitMeta | undefined)[] = new Array(MAXU);
  time = 0;
  realTime = 0;
  phase: Phase = 'loading';
  playerIdx = -1;
  spectator = false;
  // side lists (rebuilt each frame)
  readonly sideList = [new Int16Array(MAXU), new Int16Array(MAXU), new Int16Array(MAXU)];
  readonly sideCount = [0, 0, 0];
  readonly fighting = [0, 0, 0];
  readonly stats: BattleStats = { kills: 0, playerKills: 0, lost: 0, copied: [], captainsKilled: [], captainsFled: [], revivals: 0, deaths: 0, essence: 0, gold: 0, maxStreak: 0, knockbacks: 0 };
  streak = 0;
  streakT = 0;
  /** Callout queue consumed by the HUD. */
  readonly callouts: Array<{ text: string; kind: string; sub?: string }> = [];
  /** Subsystems attached by the scene. */
  player: PlayerCtl | null = null;
  rigs: Rigs | null = null;
  hud: Hud | null = null;
  abilities: Abilities | null = null;
  siege: Siege | null = null;
  /** Speech & script callbacks. */
  onUnitDeath: ((i: number) => void) | null = null;
  onPlayerDamaged: ((amount: number, abilityId: string | undefined, src: number) => void) | null = null;
  /** script.onDamage bridge: gets the final amount (after armor / resistances) before it is applied; returns a replacement. */
  onDamageHook: ((target: number, amount: number, abilityId: string | undefined, src: number) => number | undefined) | null = null;
  orders = [0, 0, 0];
  /** Extra morale drain near Elias (location Miedo / 100). */
  fearBonus = 0;
  /** Relic time slow applied to Elias' enemies (0..0.6). */
  enemySlow = 0;
  /** Elias sees invisible units (relic). */
  revealInvisible = false;
  private sfxLast = new Map<string, number>();
  private stopHist: number[] = [];
  private floatsThisFrame = 0;
  readonly tmpV = new THREE.Vector3();
  private tmpW = new THREE.Vector3();
  /** Second scratch vector (set + return) for two-point fx calls. */
  tmpV2(x: number, y: number, z: number): THREE.Vector3 { return this.tmpW.set(x, y, z); }

  constructor(readonly scene: THREE.Scene, readonly camera: THREE.PerspectiveCamera, readonly setup: BattleSetup, readonly debug: boolean, readonly seed: number) {
    this.arena = new Arena(scene, setup.biome, seed);
    this.heightAt = this.arena.heightAt;
    this.sky = new Sky(scene, { fogNear: this.arena.def.fog[0], fogFar: this.arena.def.fog[1], clouds: setup.biome === 'vacio' ? 0 : 5, shadowSize: 48, radius: 800 });
    this.sky.override = this.arena.def.override ?? null;
    this.sky.setTime(setup.timeOfDay ?? this.arena.def.time);
    this.fx = new Fx(scene, 5000);
    this.crowd = new Crowd(scene, this.heightAt);
    this.rag = new Ragdolls(this.heightAt);
    this.grid = new Grid(-150, -150, 2.5, 300, MAXU);
    this.proj = new Projectiles(scene, this.u, this.grid, this.heightAt);
    this.cam = new BattleCamera(camera);
    for (let i = 0; i < MAXU; i++) this.meta[i] = undefined;
  }

  // ───────────── spawning ─────────────

  spawn(unitId: string, team: number, x: number, z: number, o: SpawnOpts = {}): number {
    const spec = specFor(unitId);
    const u = this.u;
    const i = u.spawn(spec.idx, team);
    if (i < 0) return -1;
    u.x[i] = x; u.z[i] = z; u.y[i] = o.y ?? this.heightAt(x, z);
    u.yaw[i] = o.yaw ?? (team === TEAM_PLAYER ? 0 : Math.PI);
    if (this.setup.arena && team !== TEAM_PLAYER) u.yaw[i] = Math.PI;
    const hpM = o.hpMult ?? 1, dmM = o.dmgMult ?? 1;
    const stars = o.stars ?? 0;
    u.stars[i] = stars;
    const vet = 1 + stars * 0.12;
    u.hp[i] = u.hpMax[i] = spec.def.hp * hpM * vet;
    u.dmgMul[i] = dmM * vet;
    if (o.captain) { u.flags[i] |= F_CAPTAIN; u.morale[i] = u.moraleBase[i] = 100; u.scale[i] *= 1.12; u.radius[i] *= 1.12; if (o.hpMult === undefined) { u.hp[i] = u.hpMax[i] = u.hpMax[i] * 3; } if (o.dmgMult === undefined) u.dmgMul[i] *= 1.5; }
    if (o.boss) { u.flags[i] |= F_BOSS; u.morale[i] = u.moraleBase[i] = 200; }
    if (o.hero) { u.flags[i] |= F_HERO; u.morale[i] = u.moraleBase[i] = 200; }
    if (o.abilities?.length) {
      let k = 0;
      for (; k < NA && u.abil[i * NA + k] >= 0; k++);
      for (const id of o.abilities) {
        const rt = abilityRT(id);
        if (!rt || rt.def.kind === 'passive' || k >= NA) continue;
        let dup = false;
        for (let q = 0; q < NA; q++) if (u.abil[i * NA + q] === rt.idx) dup = true;
        if (dup) continue;
        u.abil[i * NA + k] = rt.idx; u.abilCd[i * NA + k] = 2 + k * 2; k++;
      }
    }
    if (o.armyIdx !== undefined) u.armyIdx[i] = o.armyIdx;
    this.meta[i] = (o.name || o.npcId || o.special) ? { name: o.name, npcId: o.npcId, special: o.special, unitId, title: undefined } : undefined;
    const wantsRig = o.rig || !!o.special || !!o.hero || !!o.boss;
    if (wantsRig && this.rigs) this.rigs.attach(i, o.special);
    return i;
  }

  metaOf(i: number): UnitMeta | undefined { return this.meta[i]; }
  setMeta(i: number, m: Partial<UnitMeta>): void { this.meta[i] = { unitId: specFor(this.u.specOf(i).id).id, ...(this.meta[i] ?? {}), ...m } as UnitMeta; }

  /** Frees a unit slot entirely (fled, eaten, expired summon). */
  remove(i: number): void {
    if (!this.u.active[i]) return;
    this.rigs?.detach(i);
    this.meta[i] = undefined;
    this.u.free(i);
  }

  // ───────────── queries ─────────────

  hostile(a: number, b: number): boolean { return this.u.side[a] !== this.u.side[b]; }
  alive(i: number): boolean { return i >= 0 && this.u.active[i] === 1 && this.u.state[i] !== S_DEAD; }
  isPlayer(i: number): boolean { return i >= 0 && (this.u.flags[i] & F_PLAYER) !== 0; }
  isPlayerish(i: number): boolean { return i >= 0 && (this.u.flags[i] & (F_PLAYER | F_CLONE)) !== 0; }
  isNamed(i: number): boolean { return (this.u.flags[i] & (F_CAPTAIN | F_BOSS | F_HERO)) !== 0; }

  /** Rebuild per-side alive lists and fighting counts. */
  refreshSides(): void {
    const u = this.u;
    this.sideCount[0] = this.sideCount[1] = this.sideCount[2] = 0;
    this.fighting[0] = this.fighting[1] = this.fighting[2] = 0;
    for (let i = 0; i < u.n; i++) {
      if (!u.active[i] || u.state[i] === S_DEAD) continue;
      const s = u.side[i];
      this.sideList[s][this.sideCount[s]++] = i;
      if (!(u.flags[i] & (F_ROUT | F_FLED))) this.fighting[s]++;
    }
  }

  /** Enemy side from the point of view of `side` (arena: A ↔ B). */
  foeSide(side: number): number { return this.setup.arena ? (side === 0 ? 2 : 0) : side === TEAM_PLAYER ? TEAM_ENEMY : TEAM_PLAYER; }

  // ───────────── feedback helpers ─────────────

  /** Positional, rate-limited sfx (attenuated by distance to the camera focus). */
  sfx(name: SfxName, x = NaN, z = NaN, vol = 1, pitch = 1, minGapMs = 45): void {
    const now = this.realTime * 1000;
    const last = this.sfxLast.get(name) ?? -1e9;
    if (now - last < minGapMs) return;
    let v = vol;
    if (!Number.isNaN(x)) {
      const f = this.cam.rig.focus;
      const d = Math.hypot(x - f.x, z - f.z);
      v *= Math.max(0, 1 - d / 70);
      if (v < 0.05) return;
    }
    this.sfxLast.set(name, now);
    audio.sfx(name, { volume: Math.min(1, v), pitch: pitch * (0.95 + Math.random() * 0.1) });
  }

  /** Hitstop with a 250 ms / rolling second budget (research §1.13). */
  hitstop(ms: number): void {
    const now = this.realTime * 1000;
    while (this.stopHist.length && now - this.stopHist[0] > 1000) { this.stopHist.shift(); this.stopHist.shift(); }
    let used = 0;
    for (let k = 1; k < this.stopHist.length; k += 2) used += this.stopHist[k];
    const add = Math.max(0, Math.min(ms, 250 - used));
    if (add < 10) return;
    this.stopHist.push(now, add);
    engine.hitstop(add);
  }

  /** Damage numbers: only for hits that involve Elias, captains, crits or big numbers (DOM budget). */
  float(i: number, text: string, kind: FloatOpts['kind'], force = false, color?: string): void {
    if (this.floatsThisFrame > 6 && !force) return;
    this.floatsThisFrame++;
    const u = this.u;
    this.tmpV.set(u.x[i], u.y[i] + this.heightOf(i) + 0.3, u.z[i]);
    floatText(this.tmpV, text, { kind, color });
  }
  floatAt(x: number, y: number, z: number, text: string, kind: FloatOpts['kind'], color?: string): void {
    this.tmpV.set(x, y, z);
    floatText(this.tmpV, text, { kind, color });
  }
  beginFrame(): void { this.floatsThisFrame = 0; }

  heightOf(i: number): number {
    const s = this.u.specOf(i);
    return s.height * (this.u.scale[i] / s.scale);
  }

  /** Anime speech bubble over a unit (HUD). */
  say(i: number, text: string, seconds = 2.5): void { this.hud?.say(i, text, seconds); }

  callout(text: string, kind = 'streak', sub?: string): void { this.callouts.push({ text, kind, sub }); if (this.callouts.length > 6) this.callouts.shift(); }

  /** Name to display for a unit. */
  nameOf(i: number): string { return this.meta[i]?.name ?? this.u.specOf(i).name; }

  isBossish(i: number): boolean { return (this.u.flags[i] & (F_BOSS | F_HERO)) !== 0; }

  /** Routed units only rally while a leader of their team lives (or if they never had one). */
  captainAlive(team: number): boolean {
    const u = this.u;
    let had = false;
    for (let i = 0; i < u.n; i++) {
      if (!u.active[i] || u.team[i] !== team || !(u.flags[i] & (F_CAPTAIN | F_BOSS | F_HERO))) continue;
      had = true;
      if (u.state[i] !== S_DEAD) return true;
    }
    return !had;
  }

  dispose(): void {
    this.proj.dispose();
    this.crowd.dispose();
    this.fx.dispose();
    this.sky.dispose();
    this.arena.dispose();
    this.rag.clear();
    this.u.reset();
  }
}

