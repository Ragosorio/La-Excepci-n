/**
 * BattleScene: builds the Battle world from a BattleSetup, runs deployment → intro (captain taunts) → fight →
 * end (banner, slow-mo) → results → return. Also debug entries (?scene=battle&test=…&units=…&biome=…).
 */
import * as THREE from 'three';
import { engine, type GameScene } from '../core/engine';
import type { ArmyUnit } from '../data/types';
import type { BattleContext, BattleResult, BattleSetup, CaptainSpec, EnemyGroup } from './api';
import { Battle } from './world';
import { Rigs } from './rigs';
import { Abilities } from './abilities';
import { PlayerCtl } from './player';
import { Hud } from './hud';
import { Siege } from './siege';
import { Deploy } from './deploy';
import { Weather } from './weather';
import { showResults } from './results';
import { createContext, type ScriptContext } from './context';
import { simStep } from './sim';
import { debugSetup } from './setups';
import { formation, zonesFor, type Zone } from './formation';
import { projectileHit } from './combat';
import { setOutlineResolution } from './crowdmat';
import { customSpec, specFor } from './defs';
import { poseGlobals } from './pose';
import { F_BOSS, F_CAPTAIN, F_DEVOTO, F_HERO, F_PRISONER, P_BOMB, P_ORB, S_DEAD, TEAM_B, TEAM_ENEMY, TEAM_PLAYER } from './const';
import { bus } from '../core/events';
import { G, res } from '../core/state';
import { track } from '../core/tracker';
import { saveRun } from '../core/save';
import { audio, type Ambience, type Region } from '../audio';
import { banner, cutin } from '../ui/toasts';
import { portraitSVG } from '../ui/art/portraits';
import { h, layer, wait } from '../ui/dom';
import { blockMenu } from '../ui/menu';
import { grantRelic, randomRelic } from '../systems/progression/relics';
import { narrate } from '../ui/narrator';
import { input } from '../core/input';

/** Arena bouts are decided by the judges (tie-break) after this many seconds of fighting. */
/** 'duelo' / 'tutorial': distance between Elias and the boss at spawn. */
const DUEL_GAP = 13;
const ARENA_TIME_LIMIT = 150;
const CONT_REGION: Record<string, Region> = { valdoria: 'valdoria', sylvaria: 'sylvaria', kharaz: 'kharaz', morvenna: 'morvenna', islas: 'islas', concordia: 'concordia' };

export class BattleScene implements GameScene {
  readonly id = 'battle';
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1600);
  b: Battle | null = null;
  private setup!: BattleSetup;
  private params: Record<string, unknown> = {};
  private debug = false;
  private ctx: ScriptContext | null = null;
  private deploy: Deploy | null = null;
  private weather: Weather | null = null;
  private waits: Array<{ t: number; fn: () => void }> = [];
  private armyList: ArmyUnit[] = [];
  private waves: EnemyGroup[][] = [];
  private waveBoss: CaptainSpec | null = null;
  private waveN = 0;
  private ending = false;
  private fightT = 0;
  private ambientT = 0;
  private intensityT = 0;
  private exited = false;
  private ambiences: Ambience[] = [];
  private musicMood: 'battle' | 'boss' = 'battle';
  private zones!: { player: Zone; enemy: Zone };

  enter(params?: unknown): void {
    const p = (params ?? {}) as Record<string, unknown>;
    this.params = p;
    this.debug = !(p as Partial<BattleSetup>).kind;
    this.setup = this.debug ? debugSetup(p) : (p as unknown as BattleSetup);
    this.exited = false; this.ending = false; this.fightT = 0; this.waits = []; this.waveN = 0;
    const setup = this.setup;
    const seed = Number(p.seed ?? ((Math.random() * 1e6) | 0));
    const b = new Battle(this.scene, this.camera, setup, this.debug, seed);
    this.b = b;
    b.spectator = !setup.player.present;
    b.rigs = new Rigs(b);
    b.abilities = new Abilities(b);
    b.proj.onHit = (pi, unit, x, y, z) => projectileHit(b, pi, unit, x, y, z);
    b.proj.onTrail = (pi) => {
      if (Math.random() > 0.55) return;
      const kind = b.proj.kind[pi];
      b.fx.emit(kind === P_BOMB ? 'spark' : 'magic', b.tmpV.set(b.proj.x[pi], b.proj.y[pi], b.proj.z[pi]), { count: 1, scale: 0.5, speed: 0.5, color: kind === P_ORB ? '#c7a2ff' : undefined });
    };
    if (setup.locationId && G.run?.locations?.[setup.locationId]) b.fearBonus = (G.run.locations[setup.locationId].fear ?? 0) / 60;
    this.zones = zonesFor(b.arena.round, setup.kind);
    if (setup.enemy.walls) b.siege = new Siege(b, 16);  // villages are fought in the open; only walled places get towers
    this.spawnEnemies();
    this.spawnPlayerSide();
    b.hud = new Hud(b);
    b.hud.onRetreat = () => this.finish(false, { fled: true });
    this.weather = new Weather(b, setup.weather);
    if (this.debug) b.abilities.playerPower = Number(p.power ?? 2.2);
    // camera
    const eliasSpawn = new THREE.Vector3(0, 0, (this.zones.player.z0 + this.zones.player.z1) / 2);
    b.cam.snap(b.playerIdx >= 0 ? new THREE.Vector3(b.u.x[b.playerIdx], 0, b.u.z[b.playerIdx]) : eliasSpawn);
    setOutlineResolution(engine.width * engine.renderer.getPixelRatio(), engine.height * engine.renderer.getPixelRatio());
    // script
    if (setup.script || setup.arena?.onTick) this.ctx = createContext(b, { finish: (v, o) => this.finish(v, o), addWait: (s, fn) => this.waits.push({ t: s, fn }) }, setup);
    const sc = setup.script, sctx = this.ctx;
    if (sc?.onDamage && sctx) {
      let inHook = false;
      b.onDamageHook = (t, amount, abilityId, src) => {
        if (inHook) return undefined; // damage dealt from inside the hook doesn't re-enter it
        inHook = true;
        try {
          const r = sc.onDamage!(sctx, { target: sctx.handleFor(t), amount, abilityId, source: src >= 0 && b.u.active[src] ? sctx.handleFor(src) : undefined });
          return typeof r === 'number' ? r : undefined;
        } catch (err) { console.warn('[battle] script onDamage', err); return undefined; } finally { inHook = false; }
      };
    }
    // audio
    const hasBoss = !!setup.enemy.boss || setup.kind === 'duelo' || setup.kind === 'final';
    this.musicMood = hasBoss ? 'boss' : 'battle';
    audio.music(this.musicMood, { region: CONT_REGION[setup.continent ?? ''] });
    const amb = b.arena.def.ambience;
    if (amb) { audio.ambience(amb, true, 0.5); this.ambiences.push(amb); }
    if (setup.biome === 'arena' || setup.arena) { audio.ambience('crowd', true, 0.7); this.ambiences.push('crowd'); }
    audio.setIntensity(0.25);
    // deployment?
    const wantsDeploy = (setup.deploy ?? this.armyList.length > 0) && !setup.arena && this.armyList.length > 0 && setup.kind !== 'emboscada' && setup.kind !== 'tutorial';
    if (wantsDeploy) {
      b.phase = 'deploy';
      b.cam.setMode('deploy');
      b.hud.setVisible(false);
      this.deploy = new Deploy(b, this.armyList, this.zones.player, this.zones.enemy, () => { this.deploy = null; void this.intro(); });
    } else {
      if (this.armyList.length) this.autoDeploy();
      b.phase = 'intro';
      void this.intro();
    }
  }

  // ───────────── spawning ─────────────

  private spawnGroups(groups: EnemyGroup[], team: number, zone: Zone): number[] {
    const b = this.b!;
    const ids: string[] = [], stars: number[] = [];
    for (const g of groups) for (let k = 0; k < g.count; k++) { ids.push(g.unitId); stars.push(g.stars ?? 0); }
    const pos = formation(ids, zone);
    return ids.map((id, k) => b.spawn(id, team, pos[k].x, pos[k].z, { yaw: zone.dir > 0 ? 0 : Math.PI, stars: stars[k] }));
  }

  private spawnCaptain(c: CaptainSpec, team: number, x: number, z: number, boss: boolean): number {
    const b = this.b!;
    const i = b.spawn(c.unitId, team, x, z, {
      name: c.name, npcId: c.npcId, special: c.special, captain: !boss, boss, hero: boss && !!c.special,
      hpMult: c.hpMult ?? (boss ? 8 : undefined), dmgMult: c.dmgMult ?? (boss ? 1.6 : undefined), abilities: c.abilities,
      rig: boss || !!c.special, yaw: team === TEAM_PLAYER ? 0 : Math.PI,
    });
    if (i >= 0) b.setMeta(i, { name: c.name, title: c.title, npcId: c.npcId, special: c.special });
    return i;
  }

  private spawnEnemies(): void {
    const b = this.b!, s = this.setup, z = this.zones;
    if (s.arena) {
      this.spawnGroups(s.arena.sideA.groups, TEAM_PLAYER, z.player);
      this.spawnGroups(s.arena.sideB.groups, TEAM_B, z.enemy);
      return;
    }
    let groups = s.enemy.groups;
    if (s.kind === 'ruina' && groups.length) {
      // waves: 55% now, the rest + the guardian later
      const now: EnemyGroup[] = [], later: EnemyGroup[] = [];
      for (const g of groups) { const a = Math.ceil(g.count * 0.55); now.push({ ...g, count: a }); if (g.count - a > 0) later.push({ ...g, count: g.count - a }); }
      groups = now;
      this.waves = [later];
      this.waveBoss = s.enemy.boss ?? null;
    }
    const ez = s.kind === 'emboscada' ? { x0: -40, x1: 40, z0: -18, z1: 18, dir: -1 } : z.enemy;
    if (s.kind === 'emboscada') {
      // enemies burst from both flanks of the player's position
      const ids: string[] = [];
      for (const g of groups) for (let k = 0; k < g.count; k++) ids.push(g.unitId);
      ids.forEach((id, k) => {
        const side = k % 2 ? 1 : -1;
        const x = side * (24 + Math.random() * 14), zz = -30 + (Math.random() - 0.5) * 26;
        b.spawn(id, TEAM_ENEMY, x, zz, { yaw: side > 0 ? -Math.PI / 2 : Math.PI / 2 });
      });
    } else this.spawnGroups(groups, TEAM_ENEMY, ez);
    const caps = s.enemy.captains ?? [];
    caps.forEach((c, k) => {
      const x = (k - (caps.length - 1) / 2) * 8;
      const zz = s.kind === 'emboscada' ? -30 : (ez.z0 + ez.z1) / 2 - 2;
      this.spawnCaptain(c, TEAM_ENEMY, s.kind === 'emboscada' ? 30 : x, zz, false);
    });
    if (s.enemy.boss && s.kind !== 'ruina') this.spawnCaptain(s.enemy.boss, TEAM_ENEMY, 0, s.kind === 'duelo' || s.kind === 'tutorial' ? DUEL_GAP / 2 : ez.z0 + 6, true);
    if (b.siege) {
      const archer = groups.find((g) => specFor(g.unitId).ranged)?.unitId ?? 'arquero_elfo';
      b.siege.manTowers(archer);
    }
  }

  private spawnPlayerSide(): void {
    const b = this.b!, s = this.setup;
    if (s.arena) return;
    this.armyList = (s.player.army ?? []).map((a) => ({ ...a }));
    if (s.player.allies?.length) this.spawnGroups(s.player.allies, TEAM_PLAYER, this.zones.player);
    if (s.player.present) {
      const zp = this.zones.player;
      let x = 0, z = s.kind === 'duelo' || s.kind === 'tutorial' ? -DUEL_GAP / 2 : s.kind === 'emboscada' ? -30 : zp.z0 + 4;
      if (s.playerStart && Number.isFinite(s.playerStart.x) && Number.isFinite(s.playerStart.z)) { x = s.playerStart.x; z = s.playerStart.z; }
      customSpec('elias', { race: 'excepcion', job: 'hechicero', role: 'mago', name: 'Elias Veyr', hp: 100, damage: 8, attackRange: 18, attackCooldown: 0.4, speed: 5.2, mass: 1.6, armor: 0, scale: 1.05, weapon: 'ninguna', abilities: [] });
      const i = b.spawn('elias', TEAM_PLAYER, x, z, { special: 'elias', rig: true, yaw: 0 });
      if (i >= 0) {
        b.playerIdx = i;
        b.setMeta(i, { name: G.run?.player.name ?? 'Elias Veyr', special: 'elias' });
        const pl = new PlayerCtl(b, i, this.debug);
        b.player = pl;
        pl.onFinalDeath = () => { void this.playerFell(); };
        pl.onDeathHook = () => !!(this.setup.script?.onPlayerDeath && this.ctx && this.setup.script.onPlayerDeath(this.ctx));
        b.cam.setMode(G.meta?.settings.camera === 'hombro' ? 'hombro' : 'tactica');
      }
    }
    b.onPlayerDamaged = (amount, abilityId, src) => {
      if (this.setup.script?.onPlayerDamaged && this.ctx) {
        try { this.setup.script.onPlayerDamaged(this.ctx, { amount, abilityId, source: src >= 0 && b.u.active[src] ? this.ctx.handleFor(src) : undefined }); } catch (err) { console.warn('[battle] script onPlayerDamaged', err); }
      }
    };
    b.onUnitDeath = (i) => {
      if (this.setup.script?.onUnitDeath && this.ctx) {
        const hd = this.ctx.handleFor(i);
        try { this.setup.script.onUnitDeath(this.ctx, hd); } catch (err) { console.warn('[battle] script onUnitDeath', err); }
      }
    };
  }

  private autoDeploy(): void {
    const b = this.b!;
    const ids = this.armyList.map((a) => a.unitId);
    const pos = formation(ids, this.zones.player);
    this.armyList.forEach((a, k) => {
      const i = b.spawn(a.unitId, TEAM_PLAYER, pos[k].x, pos[k].z, { armyIdx: k, stars: a.stars, name: a.name, yaw: 0 });
      if (i < 0) return;
      if (a.hpPct !== undefined && a.hpPct < 1) b.u.hp[i] = Math.max(1, b.u.hpMax[i] * a.hpPct);
      if (a.devoto) b.u.flags[i] |= F_DEVOTO;
      b.u.homeX[i] = pos[k].x; b.u.homeZ[i] = pos[k].z;
    });
  }

  // ───────────── intro ─────────────

  private async intro(): Promise<void> {
    const b = this.b;
    if (!b || this.exited) return;
    b.phase = 'intro';
    b.hud?.setVisible(true);
    if (b.playerIdx >= 0) b.cam.setMode(G.meta?.settings.camera === 'hombro' ? 'hombro' : 'tactica');
    else b.cam.setMode('orbit');
    const s = this.setup;
    blockMenu(true);
    try {
      const skipTaunts = s.kind === 'tutorial' || !!s.script;
      // captain taunts (max 2, boss last)
      const talkers = [...(s.enemy.captains ?? []), ...(s.enemy.boss && s.kind !== 'ruina' ? [s.enemy.boss] : [])].filter((c) => c.taunt).slice(-2);
      if (!skipTaunts && !s.arena) {
        for (const c of talkers) {
          if (this.exited) return;
          const idx = this.findNamed(c.name);
          if (idx >= 0) { b.cam.focus(() => b.tmpV.set(b.u.x[idx], b.u.y[idx], b.u.z[idx]), 9, 0); b.say(idx, c.taunt!, 4.5); }
          const spec = specFor(c.unitId);
          audio.sfx('horn_war', { volume: 0.5 });
          await cutin({
            portrait: portraitSVG({ seed: c.npcId ?? c.name, race: spec.race, job: spec.job, special: (c.special as never) ?? undefined, mood: 'angry' }, 520),
            title: c.name.toUpperCase(), subtitle: c.title ?? (c.taunt!.length < 40 ? `«${c.taunt}»` : ''),
            colors: ['#2a0b12', '#e2455b'], side: 'left', duration: 1.9, slowmo: false,
          });
        }
        b.cam.focus(null);
      }
      if (this.exited) return;
      const el = h('div', { class: 'bt-intro' }, s.title ? h('div', { class: 'k' }, s.title) : null, h('div', { class: 'go' }, s.arena ? '¡PELEA!' : '¡A LA BATALLA!'));
      layer('hud').appendChild(el);
      setTimeout(() => el.remove(), 2600);
      audio.sfx('drum_war', { volume: 0.9 });
      if (s.arena) audio.sfx('crowd_cheer', { volume: 0.9 });
      await wait(650);
    } finally { blockMenu(false); }
    if (this.exited || !this.b) return;
    this.startFight();
  }

  private findNamed(name: string): number {
    const b = this.b!;
    for (let i = 0; i < b.u.n; i++) if (b.u.active[i] && b.metaOf(i)?.name === name) return i;
    return -1;
  }

  private startFight(): void {
    const b = this.b!;
    b.phase = 'fight';
    bus.emit('battle:start', { setup: this.setup });
    // Libro de la Realidad: "Esta batalla ya la gané."
    if (G.run?.flags?.reality_next_battle_won && !this.setup.arena && this.setup.kind !== 'tutorial') {
      delete G.run.flags.reality_next_battle_won;
      this.realityWin();
      return;
    }
    this.offReality?.();
    this.offReality = bus.on('reality:rewrite', (e) => { if (e.rewrite === 'batalla_ganada' && this.b?.phase === 'fight') this.realityWin(); });
    const tips = this.setup.kind === 'tutorial' || this.setup.script ? null
      : b.player ? (b.player.knowsA('fuerza_titanica') ? '[WASD] moverte · [Clic] Chispa / Puñetazo · [Espacio] Esquivar · [1-4] Habilidades · [Z X C] Órdenes' : '[WASD] moverte · [Clic] Chispa Arcana · [Espacio] Esquivar · [Shift] Correr · [V] Cámara')
        : 'Arrastra para girar la cámara · Rueda para acercar · [WASD] para mover';
    if (tips) b.hud?.hint(tips, 6);
    const sc = this.setup.script;
    if (sc?.onStart && this.ctx) {
      try { void Promise.resolve(sc.onStart(this.ctx)).catch((err) => console.error('[battle] script onStart', err)); } catch (err) { console.error('[battle] script onStart', err); }
    }
  }

  private offReality: (() => void) | null = null;

  /** The book rewrote reality: the battle was always won. */
  private realityWin(): void {
    const b = this.b;
    if (!b || this.ending) return;
    engine.pipeline.flash('#f3ead8', 0.8, 1.2);
    audio.sfx('page_turn', { volume: 1 });
    void narrate({ third: 'Esa batalla ya la había ganado. Solo faltaba que el mundo se enterara.', first: 'Esa batalla ya la había ganado. Solo faltaba que el mundo se enterara.' }, { position: 'center', hold: 2.5 });
    const u = b.u;
    for (let i = 0; i < u.n; i++) if (u.active[i] && u.state[i] !== S_DEAD && u.team[i] !== TEAM_PLAYER && !b.setup.arena) { u.flags[i] |= 1 << 13; u.morale[i] = 0; }
    this.finish(true, {});
  }

  // ───────────── loop ─────────────

  update(dt: number): void {
    const b = this.b;
    if (!b) return;
    if (dt <= 0) return;
    b.time += dt;
    if (b.phase === 'fight') this.fightT += dt;
    b.player?.update(dt);
    simStep(b, dt);
    b.abilities?.update(dt);
    b.abilities?.specials.update(dt);
    b.proj.update(dt);
    b.siege?.update(dt);
    b.rigs?.sync(dt);
    b.fx.update(dt);
    // script hooks
    if (this.ctx && b.phase === 'fight') {
      try { this.setup.script?.onUpdate?.(this.ctx, dt); } catch (err) { console.warn('[battle] script onUpdate', err); }
      try { this.setup.arena?.onTick?.(this.ctx); } catch (err) { console.warn('[battle] arena onTick', err); }
    }
    for (let k = this.waits.length - 1; k >= 0; k--) { const w = this.waits[k]; w.t -= dt; if (w.t <= 0) { this.waits.splice(k, 1); w.fn(); } }
    if (b.phase === 'fight' && !this.ending) this.checkEnd();
  }

  lateUpdate(realDt: number): void {
    const b = this.b;
    if (!b) return;
    b.realTime += realDt;
    b.beginFrame();
    const pl = b.player;
    if (pl && b.phase === 'fight') pl.capture(b.realTime * 1000);
    pl?.lateUpdate(realDt);
    // camera follow
    if (b.playerIdx >= 0 && b.u.active[b.playerIdx]) b.cam.follow.set(b.u.x[b.playerIdx], b.u.y[b.playerIdx], b.u.z[b.playerIdx]);
    else this.followAction();
    const allowCam = input.enabled && !document.querySelector('.lx-modal-back');
    b.cam.update(realDt, allowCam);
    this.deploy?.update(realDt);
    // sky & world
    const f = b.cam.rig.focus;
    if (b.sky.shadowTarget.distanceToSquared(f) > 25) { b.sky.shadowTarget.copy(f); b.sky.setTime(b.sky.time); }
    b.sky.update(realDt, this.camera, b.realTime);
    b.arena.update(realDt, b.realTime);
    this.weather?.update(b.phase === 'fight' ? realDt : 0, b.realTime);
    b.crowd.render(b.u, b.time, true);
    b.proj.render();
    b.hud?.update(realDt);
    this.ambient(realDt);
    this.intensity(realDt);
  }

  private followAction(): void {
    const b = this.b!, u = b.u;
    let x = 0, z = 0, n = 0;
    for (let i = 0; i < u.n; i += 2) if (u.active[i] && u.state[i] !== S_DEAD) { x += u.x[i]; z += u.z[i]; n++; }
    if (n) b.cam.follow.set(x / n, 0, z / n);
  }

  private ambient(realDt: number): void {
    const b = this.b!, amb = b.arena.def.ambient;
    if (!amb) return;
    this.ambientT -= realDt;
    if (this.ambientT > 0) return;
    this.ambientT = 1 / Math.max(0.5, amb.rate);
    const f = b.cam.rig.focus;
    const x = f.x + (Math.random() - 0.5) * 50, z = f.z + (Math.random() - 0.5) * 40;
    b.fx.emit(amb.preset, b.tmpV.set(x, b.heightAt(x, z) + 1 + Math.random() * 4, z), { count: 2, color: amb.color, color2: amb.color2, up: amb.up ?? 0.4, speed: 0.6, scale: 0.8 });
  }

  private intensity(realDt: number): void {
    const b = this.b!;
    this.intensityT -= realDt;
    if (this.intensityT > 0) return;
    this.intensityT = 0.5;
    if (b.phase !== 'fight') { audio.setIntensity(0.2); return; }
    const f = b.cam.rig.focus;
    const n = b.grid.query(b.u, f.x, f.z, 18, INT_BUF, 128);
    let foes = 0;
    for (let k = 0; k < n; k++) if (b.u.side[INT_BUF[k]] !== TEAM_PLAYER) foes++;
    let v = 0.3 + Math.min(0.5, foes / 40);
    if (b.player) { const i = b.player.idx; if (b.u.hp[i] / b.u.hpMax[i] < 0.35) v += 0.2; }
    audio.setIntensity(Math.min(1, v));
  }

  // ───────────── end ─────────────

  private checkEnd(): void {
    const b = this.b!, s = this.setup;
    if (s.script && s.kind === 'tutorial') return; // scripted battles end through ctx.end()
    if (s.arena) {
      // side A = TEAM_PLAYER (0), side B = TEAM_B (2); `victory` below means "side A won" → result.winnerSide
      const fa = b.fighting[TEAM_PLAYER], fb = b.fighting[TEAM_B];
      if (fa === 0 || fb === 0) this.finish(fa !== fb ? fb === 0 : this.arenaTieBreak(), {});
      else if (this.fightT > ARENA_TIME_LIMIT) {
        b.callout('¡TIEMPO!', 'captain', 'Los jueces deciden');
        this.finish(this.arenaTieBreak(), {});
      }
      return;
    }
    const enemies = b.fighting[TEAM_ENEMY] + b.fighting[TEAM_B];
    if (enemies === 0) {
      if (this.waves.length) { this.nextWave(); return; }
      this.finish(true, {});
      return;
    }
    if (!s.player.present && b.fighting[TEAM_PLAYER] === 0) this.finish(false, {});
  }

  /** Arena double-KO / time-out: more units standing (incl. routed), then more total HP, then a coin flip. true = side A. */
  private arenaTieBreak(): boolean {
    const u = this.b!.u;
    let na = 0, nb = 0, ha = 0, hb = 0;
    for (let i = 0; i < u.n; i++) {
      if (!u.active[i] || u.state[i] === S_DEAD) continue;
      if (u.side[i] === TEAM_PLAYER) { na++; ha += u.hp[i]; } else if (u.side[i] === TEAM_B) { nb++; hb += u.hp[i]; }
    }
    if (na !== nb) return na > nb;
    if (Math.abs(ha - hb) > 0.5) return ha > hb;
    return Math.random() < 0.5;
  }

  private nextWave(): void {
    const b = this.b!;
    const groups = this.waves.shift()!;
    this.waveN++;
    const ids: string[] = [];
    for (const g of groups) for (let k = 0; k < g.count; k++) ids.push(g.unitId);
    const pos = formation(ids, { x0: -30, x1: 30, z0: 40, z1: 56, dir: -1 });
    ids.forEach((id, k) => { const i = b.spawn(id, TEAM_ENEMY, pos[k].x, pos[k].z, { yaw: Math.PI }); if (i >= 0) b.fx.emit('shadow', b.tmpV.set(pos[k].x, b.heightAt(pos[k].x, pos[k].z) + 1, pos[k].z), { count: 6 }); });
    if (this.waveBoss) {
      const i = this.spawnCaptain(this.waveBoss, TEAM_ENEMY, 0, 44, true);
      if (i >= 0) { b.say(i, this.waveBoss.taunt ?? '…', 3); audio.music('boss'); this.musicMood = 'boss'; }
      this.waveBoss = null;
    }
    b.callout(`OLEADA ${this.waveN + 1}`, 'captain', this.waves.length ? '' : 'El guardián despierta');
    audio.sfx('horn_war', { volume: 1 });
    b.cam.rig.shake(0.3);
  }

  private async playerFell(): Promise<void> {
    await wait(1400);
    if (!this.ending) this.finish(false, {});
  }

  finish(victory: boolean, opts: { skipResults?: boolean; fled?: boolean }): void {
    const b = this.b;
    if (!b || this.ending) return;
    this.ending = true;
    b.phase = 'over';
    void this.endSequence(victory, opts);
  }

  private async endSequence(victory: boolean, opts: { skipResults?: boolean; fled?: boolean }): Promise<void> {
    const b = this.b!, s = this.setup;
    const arenaWinner: 'A' | 'B' | undefined = s.arena ? (victory ? 'A' : 'B') : undefined;
    poseGlobals.cheerTeam = s.arena ? (victory ? TEAM_PLAYER : TEAM_B) : victory ? TEAM_PLAYER : TEAM_ENEMY;
    if (!opts.fled && !opts.skipResults) {
      engine.slowmo(0.3, 1.6);
      audio.stinger(victory || s.arena ? 'victory' : 'defeat');
      if (s.arena) audio.sfx('crowd_cheer', { volume: 1 });
      b.cam.rig.shake(0.2);
      void banner(s.arena ? '¡FIN DEL COMBATE!' : victory ? '¡VICTORIA!' : 'DERROTA', s.arena ? '' : victory ? (b.stats.playerKills > 20 ? 'Una masacre elegante.' : 'El campo es tuyo.') : 'Esto no ha terminado.', { kind: victory || s.arena ? 'victory' : 'defeat', duration: 2 });
      await wait(2300);
    }
    if (this.exited) return;
    const result = this.buildResult(victory, !!opts.fled, arenaWinner);
    if (s.kind !== 'tutorial') track(result.victory ? 'battles_won' : 'battles_lost');
    try { if (s.script?.onEnd && this.ctx) await s.script.onEnd(this.ctx, result); } catch (err) { console.warn('[battle] script onEnd', err); }
    if (this.exited) return;
    // write back (real battles only)
    const devotos: ArmyUnit[] = [];
    const commit = () => {
      if (this.debug || s.arena || !G.run) return;
      // merge by uid: units that were not brought into this battle (casino guards, tutorial, subsets) stay untouched
      const lostIds = new Set(result.unitsLost.map((a) => a.uid));
      const surv = new Map(result.survivors.map((a) => [a.uid, a] as const));
      const next: ArmyUnit[] = [];
      for (const a of G.run.player.army) { if (lostIds.has(a.uid)) continue; const sv = surv.get(a.uid); next.push(sv ? { ...a, ...sv } : a); }
      for (const d of devotos) if (!next.some((a) => a.uid === d.uid)) next.push(d);
      G.run.player.army = next;
      if (result.loot.gold) res.add('gold', result.loot.gold);
      if (result.loot.essence) res.add('essence', result.loot.essence);
      for (const id of result.loot.relics) { try { grantRelic(id, { reveal: false, where: s.locationId }); } catch (err) { console.warn('[battle] grantRelic', err); } }
      saveRun(true);
    };
    commit();
    bus.emit('battle:end', { setup: s, result });
    try { s.onResult?.(result); } catch (err) { console.warn('[battle] onResult', err); }
    if (!opts.skipResults) {
      b.hud?.setVisible(false);
      await showResults(b, result, this.promotions, {
        debug: this.debug,
        retry: this.debug ? () => { this.retrying = true; void engine.goto('battle', this.params, { fade: 0.3 }); } : undefined,
        onPrisoners: result.prisoners > 0 && !s.arena ? (n) => {
          const out: ArmyUnit[] = [];
          for (const pid of this.prisonerIds.slice(0, n)) out.push({ uid: `dev_${Date.now().toString(36)}_${out.length}`, unitId: pid, stars: 0, xp: 0, devoto: true, hpPct: 0.6 });
          devotos.push(...out);
          if (!this.debug && G.run) { G.run.player.army.push(...out); saveRun(true); }
          return out;
        } : undefined,
      });
      if (this.retrying) return;
    }
    if (this.exited) return;
    const ret = s.returnTo ?? { scene: this.debug ? 'dev' : 'overworld' };
    void engine.goto(ret.scene, ret.params);
  }
  private retrying = false;
  private promotions: Array<{ name: string; stars: number }> = [];
  private prisonerIds: string[] = [];

  private buildResult(victory: boolean, fled: boolean, winner?: 'A' | 'B'): BattleResult {
    const b = this.b!, u = b.u, s = this.setup;
    const alive = new Map<number, number>();
    for (let i = 0; i < u.n; i++) if (u.active[i] && u.armyIdx[i] >= 0 && u.team[i] === TEAM_PLAYER) alive.set(u.armyIdx[i], i);
    const survivors: ArmyUnit[] = [], lost: ArmyUnit[] = [];
    this.promotions = [];
    this.armyList.forEach((a, k) => {
      const i = alive.get(k);
      if (i === undefined) { survivors.push({ ...a }); return; } // never deployed
      if (u.state[i] === S_DEAD) { lost.push({ ...a }); return; }
      const xp = (a.xp ?? 0) + 1 + u.kills[i] * 0.5 + (victory ? 1 : 0);
      let stars = a.stars ?? 0;
      const need = [3, 8, 15];
      while (stars < 3 && xp >= need[stars]) stars++;
      if (stars > (a.stars ?? 0)) this.promotions.push({ name: a.name ?? u.specOf(i).name, stars });
      survivors.push({ ...a, xp, stars, hpPct: Math.max(0.05, Math.min(1, u.hp[i] / u.hpMax[i])) });
    });
    this.prisonerIds = [];
    if (victory && !s.arena) for (let i = 0; i < u.n; i++) if (u.active[i] && u.state[i] !== S_DEAD && (u.flags[i] & F_PRISONER) && u.team[i] !== TEAM_PLAYER) this.prisonerIds.push(u.specOf(i).id);
    const rw = s.rewards ?? {};
    const goldMul = (G.run?.player.racePowers ?? []).includes('suerte_duende') ? 1.2 : 1;
    const gold = Math.round(((victory ? rw.gold ?? 0 : 0) + b.stats.gold * (victory ? 1 : 0.3)) * goldMul);
    const essence = Math.round((victory ? rw.essence ?? 0 : 0) + b.stats.essence * (victory ? 1 : 0.4));
    const relics: string[] = [];
    if (victory && !s.arena) {
      if (rw.relicId) relics.push(rw.relicId);
      else if (Math.random() < (rw.relicChance ?? 0.12)) { try { const r = randomRelic(rw.rarityBoost ?? 0); if (r) relics.push(r); } catch { /* stub */ } }
    }
    const capturedCaps = b.stats.captainsFled.slice();
    for (let i = 0; i < u.n; i++) {
      if (!u.active[i] || u.state[i] === S_DEAD || u.team[i] === TEAM_PLAYER || !(u.flags[i] & (F_CAPTAIN | F_BOSS | F_HERO))) continue;
      if (!victory) continue;
      const m = b.metaOf(i);
      capturedCaps.push(m?.npcId ?? m?.name ?? b.nameOf(i));
    }
    return {
      victory: s.arena ? winner === 'A' : victory && !fled, fled, playerDied: !!b.player?.dead, revivals: b.stats.revivals,
      survivors, unitsLost: lost, enemiesKilled: b.stats.kills,
      captainsKilled: b.stats.captainsKilled.slice(), captainsFled: capturedCaps, captainKilledPlayer: b.stats.captainKilledPlayer,
      copied: b.stats.copied.slice(), loot: { gold, essence, relics }, prisoners: this.prisonerIds.length, duration: this.fightT, winnerSide: winner,
    };
  }

  resize(w: number, h2: number): void { setOutlineResolution(w * engine.renderer.getPixelRatio(), h2 * engine.renderer.getPixelRatio()); }

  exit(): void {
    this.exited = true;
    this.offReality?.(); this.offReality = null;
    const b = this.b;
    poseGlobals.cheerTeam = -1;
    this.deploy?.dispose(); this.deploy = null;
    this.weather?.dispose(); this.weather = null;
    for (const a of this.ambiences) audio.ambience(a, false);
    this.ambiences = [];
    audio.setIntensity(0);
    if (b) {
      b.player?.dispose();
      b.hud?.dispose();
      b.abilities?.dispose();
      b.siege?.dispose();
      b.rigs?.disposeAll();
      b.dispose();
    }
    engine.pipeline.setMind(0); engine.pipeline.setDesat(0); engine.pipeline.setSpeedLines(0);
    this.b = null;
    this.ctx = null;
    this.waits = [];
  }
}

const INT_BUF = new Int32Array(128);
