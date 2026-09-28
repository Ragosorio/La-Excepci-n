/**
 * "Lo que sobrevivió" — the final battle at Concordia: Elias's army vs La Gran Alianza, then Aurel with his whole kit
 * plus El Alba. Aurel returns once (Retorno); the second fall gives Elias El Alba → 'ending'.
 */
import * as THREE from 'three';
import type { BattleContext, BattleScript, BattleSetup, EnemyGroup, UnitHandle } from '../../battle/api';
import { engine } from '../../core/engine';
import { G } from '../../core/state';
import { dialogue } from '../../ui/dialogue';
import { floatText } from '../../ui/float';
import { excepcionAcquired, cutin } from '../../ui/toasts';
import { portraitSVG } from '../../ui/art/portraits';
import { blockMenu } from '../../ui/menu';
import { glow } from '../../render/toon';
import { audio } from '../../audio';
import { UNITS } from '../../data/units';
import { CONTINENT_IDS } from '../../data/world';
import { EL_ALBA } from '../../data/story';
import { acquire } from '../progression/codex';
import { captainsFor } from '../society/api';
import { st } from './state';
import { sayEvent } from './narration';
import { unlockAchievement } from './achievements';
import { storyBeat } from './aurel';

// El Alba and Retorno are scripted below (the copy of El Alba must happen at his defeat, not on a stray hit).
/** Aurel's HP multiplier over his 3000 base: ~8.4k in the first cycle (he also has one Retorno), a bit more each cycle. */
function aurelHpMult(cycle: number): number { return 2.2 + Math.max(1, cycle) * 0.6; }

const AUREL_KIT = ['dominar_mente', 'velo', 'fuerza_titanica', 'golpe_titanico', 'afinidad_reliquias'];

function allianceGroups(): EnemyGroup[] {
  const cycle = G.run?.cycle ?? 1;
  const stars = Math.min(3, cycle);
  const all = Object.values(UNITS);
  const groups: EnemyGroup[] = [];
  if (all.length) {
    for (const c of CONTINENT_IDS) {
      const pool = all.filter((u) => u.recruitAt?.includes(c) && u.role !== 'asedio').sort((a, b) => b.tier - a.tier);
      pool.slice(0, 2).forEach((u, i) => groups.push({ unitId: u.id, count: i === 0 ? 8 : 5, stars }));
    }
    if (!groups.length) all.slice(0, 6).forEach((u) => groups.push({ unitId: u.id, count: 7, stars }));
  } else {
    for (const id of ['soldado', 'caballero', 'arquero', 'clerigo', 'mago', 'enano_guerrero']) groups.push({ unitId: id, count: 8, stars });
  }
  // the Alliance is always bigger than you are
  const mine = G.run?.player.army.length ?? 0;
  const theirs = groups.reduce((a, g) => a + g.count, 0);
  if (theirs < mine * 1.3) { const k = (mine * 1.3) / Math.max(1, theirs); for (const g of groups) g.count = Math.ceil(g.count * k); }
  return groups;
}

export function finalSetup(): BattleSetup {
  const cycle = G.run?.cycle ?? 1;
  let captains: ReturnType<typeof captainsFor> = [];
  try { captains = captainsFor({ faction: 'concilio', location: 'concordia', count: 3, strength: 3 + cycle }); } catch { captains = []; }
  return {
    kind: 'final', biome: 'concordia', continent: 'concordia', locationId: 'concordia', timeOfDay: 0.77, weather: 'ash',
    title: 'Lo que sobrevivió',
    player: { present: true, army: G.run?.player.army ?? [] },
    enemy: {
      faction: 'concilio', groups: allianceGroups(), captains,
      boss: { unitId: 'aurel', npcId: 'aurel', name: 'Aurel', title: 'Portador del Alba', special: 'aurel', abilities: AUREL_KIT, hpMult: aurelHpMult(cycle), dmgMult: 1.1 + cycle * 0.1, taunt: 'Esta vez no voy a contenerme.' },
    },
    script: finalAllianceScript(),
    deploy: (G.run?.player.army.length ?? 0) > 0,
    allowRetreat: false,
    rewards: { gold: 0, essence: 500 },
    returnTo: { scene: 'overworld' },
  };
}

export function finalAllianceScript(): BattleScript {
  let ctx: BattleContext;
  let aurel: UnitHandle | null = null;
  let t = 0;
  let enemyStart = 0;
  let active = false;
  let revived = false;
  let finished = false;
  let busy = false;
  let nextPower = 6;
  let powerIdx = 0;
  let alive = true;
  let swordGlow: THREE.Object3D | null = null;
  let menuBlocked = false;
  const block = (on: boolean) => { if (on !== menuBlocked) { blockMenu(on); menuBlocked = on; } };
  const safe = <T>(fn: () => T): T | undefined => { try { return fn(); } catch (err) { console.warn('[story final]', err); return undefined; } };
  const wait = async (s: number) => { const w = safe(() => ctx.wait(s)); if (w) await w; else await new Promise((r) => setTimeout(r, s * 1000)); };
  const pv = (u: UnitHandle) => new THREE.Vector3(u.position.x, 0, u.position.z);
  const rigA = () => (aurel ? safe(() => ctx.rigOf(aurel!)) ?? null : null);

  function findAurel(): UnitHandle | null {
    const list = safe(() => ctx.units(1)) ?? [];
    return list.find((u) => u.alive && (u.unitId === 'aurel' || u.npcId === 'aurel' || u.name === 'Aurel')) ?? null;
  }
  const enemies = () => (safe(() => ctx.units(1)) ?? []).filter((u) => u.alive).length;

  async function intro(): Promise<void> {
    block(true);
    enemyStart = Math.max(1, enemies());
    aurel = findAurel();
    if (aurel) { safe(() => ctx.setAI(aurel!, 'idle')); safe(() => ctx.cameraFocus(aurel!, { distance: 12, duration: 1.2 })); }
    ctx.pipeline.setLetterbox(1);
    const cycle = G.run?.cycle ?? 1;
    await dialogue.say([
      { speaker: 'Ione Salvaterra', title: 'Custodia del Concilio', portrait: { seed: 'ione', race: 'humano', special: 'ione', mood: 'determined' }, text: 'En nombre de los Cinco Continentes: hasta aquí llegas.' },
      { speaker: 'Aurel', title: 'Portador del Alba', portrait: { seed: 'aurel', race: 'humano', special: 'aurel', mood: 'determined' },
        text: cycle >= 3 ? 'Ya peleamos esta pelea. No recuerdo quién ganó.' : 'Esta vez no voy a contenerme.' },
      { speaker: '{name}', portrait: { seed: 'elias', race: 'excepcion', special: 'elias', mood: 'smug' }, side: 'right', text: 'Yo tampoco.' },
    ]);
    ctx.pipeline.setLetterbox(0);
    safe(() => ctx.cameraFocus(null));
    safe(() => ctx.hint('La Gran Alianza · derrota a su ejército… y al Portador del Alba', 5));
    audio.setIntensity(0.8);
    block(false);
  }

  async function activate(): Promise<void> {
    if (active || !aurel) return;
    active = true;
    busy = true;
    audio.stinger('nemesis');
    audio.music('boss');
    await cutin({
      portrait: portraitSVG({ seed: 'aurel', race: 'humano', special: 'aurel', mood: 'angry' }, 520),
      title: 'EL PORTADOR DEL ALBA', subtitle: 'Aurel entra en batalla', colors: ['#3a2a10', '#ffd36b'], side: 'left', duration: 1.8,
    });
    safe(() => ctx.setAI(aurel!, 'auto'));
    busy = false;
  }

  function strike(amount: number, knock: number, color: string): void {
    if (!aurel) return;
    rigA()?.play('attack', 0.45);
    safe(() => ctx.damage(ctx.player, amount, { knockback: knock, from: { x: aurel!.position.x, z: aurel!.position.z } }));
    ctx.fx.emit('hit', pv(ctx.player).setY(1.1), { count: 18, color });
    ctx.fx.ring(pv(ctx.player), { color, radius: 3 + knock * 0.2 });
    audio.sfx(knock > 12 ? 'punch_launch' : 'hit_heavy');
    engine.hitstop(80);
  }

  async function power(): Promise<void> {
    if (!aurel || busy || finished) return;
    busy = true;
    const hp = ctx.player.hpMax;
    const kind = ['velo', 'fuerza', 'mente', 'afinidad', 'alba'][powerIdx++ % 5];
    try {
      if (kind === 'velo') {
        const ra = rigA();
        audio.sfx('invisibility_on');
        ctx.fx.emit('shadow', pv(aurel).setY(1), { count: 24 });
        if (ra) ra.root.visible = false;
        await wait(1.1);
        const pp = pv(ctx.player);
        const back = pp.clone().add(new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize().multiplyScalar(1.4));
        safe(() => { aurel!.position.set(back.x, aurel!.position.y, back.z); });
        safe(() => ctx.moveTo(aurel!, { x: back.x, z: back.z }));
        await wait(0.6);
        if (ra) ra.root.visible = true;
        audio.sfx('invisibility_off');
        strike(hp * 0.07, 9, '#b9a8ff');
      } else if (kind === 'fuerza') {
        safe(() => ctx.moveTo(aurel!, { x: ctx.player.position.x, z: ctx.player.position.z }));
        await wait(0.9);
        if (pv(aurel).distanceTo(pv(ctx.player)) < 3) { strike(hp * 0.09, 20, '#ff9a5a'); ctx.pipeline.impact(2, 1); }
      } else if (kind === 'mente') {
        // It no longer works: Dominar Mente is his too.
        rigA()?.play('cast', 1);
        audio.sfx('mind_control');
        ctx.fx.emit('mind', pv(ctx.player).setY(1.6), { count: 36 });
        ctx.pipeline.setMind(0.35);
        await wait(0.45);
        ctx.pipeline.setMind(0);
        floatText(pv(ctx.player).setY(2.4), 'INMUNE', { kind: 'magic', size: 26 });
        safe(() => ctx.say(ctx.player, 'Eso ya es mío.', 2.2));
        safe(() => ctx.say(aurel!, '…', 1.5));
      } else if (kind === 'afinidad') {
        const rw = rigA();
        if (rw?.weaponMesh && !swordGlow) {
          const blade = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.05, 0.9), glow('#ffd36b', 3.2, { additive: true, transparent: true, opacity: 0.8, unique: true }));
          blade.position.set(0, -0.02, 0.45);
          rw.weaponMesh.add(blade);
          swordGlow = blade;
        }
        audio.sfx('buff');
        ctx.fx.emit('light', pv(aurel).setY(1.4), { count: 36 });
        safe(() => ctx.say(aurel!, 'Todas las reliquias me obedecen. Todas.', 2.4));
      } else {
        // El Alba: telegraphed beam of dawn at where Elias stands now
        const target = pv(ctx.player);
        rigA()?.play('cast', 1.3);
        ctx.fx.ring(target, { color: '#fff4c8', radius: 3.2, duration: 1.2, from: 3.1 });
        audio.sfx('cast_light', { pitch: 0.8 });
        for (let i = 0; i < 6; i++) setTimeout(() => { if (alive && aurel) ctx.fx.emit('light', pv(aurel).setY(1.3), { count: 10, speed: -2, spread: 1.2, life: 0.4 }); }, i * 150);
        await wait(1.15);
        ctx.fx.beam(pv(aurel).setY(1.3), target.clone().setY(0.5), { color: EL_ALBA.color, width: 0.9, duration: 0.5, intensity: 4 });
        ctx.fx.flash(target.clone().setY(1), { color: '#fff4c8', radius: 4, duration: 0.5 });
        ctx.pipeline.flash('#fff7d6', 0.45, 0.4);
        audio.sfx('explosion', { volume: 0.7 });
        if (pv(ctx.player).distanceTo(target) < 3.2) { safe(() => ctx.damage(ctx.player, hp * 0.16, { knockback: 10, from: { x: aurel!.position.x, z: aurel!.position.z } })); }
      }
    } finally {
      busy = false;
    }
  }

  async function retorno(): Promise<void> {
    if (!aurel || revived) return;
    busy = true;
    revived = true;
    const at = pv(aurel);
    if (!aurel.alive) {
      // the sim already buried him: bring him back right now (a live boss keeps the battle from ending)
      const again = safe(() => ctx.spawn('aurel', { x: at.x, z: at.z }, 1, { name: 'Aurel', special: 'aurel', npcId: 'aurel', captain: true, hpMult: aurelHpMult(G.run?.cycle ?? 1), abilities: AUREL_KIT }));
      if (again) aurel = again;
    } else {
      safe(() => ctx.damage(aurel!, 1, { knockback: 12, from: { x: ctx.player.position.x, z: ctx.player.position.z } }));
    }
    safe(() => ctx.setAI(aurel!, 'idle'));
    safe(() => ctx.slowmo(0.35, 1.6));
    audio.sfx('crowd_gasp');
    await wait(1.8);
    ctx.fx.emit('light', at.clone().setY(0.5), { count: 90, speed: 3, up: 6 });
    ctx.fx.emit('heal', at.clone().setY(1), { count: 40 });
    ctx.fx.ring(at, { color: '#9dffb8', radius: 10, duration: 0.8 });
    ctx.pipeline.flash('#fff7d6', 0.5, 0.6);
    audio.sfx('revive');
    if (aurel) aurel.hp = aurel.hpMax;
    safe(() => ctx.say(aurel!, 'Retorno. Tú también lo tienes. Ya lo sé.', 2.6));
    safe(() => ctx.setAI(aurel!, 'auto'));
    busy = false;
  }

  /** The copy of El Alba (also used if the battle ends on its own before the scripted finale). */
  async function stealDawn(from: THREE.Vector3 | null): Promise<void> {
    if (from) {
      const b = pv(ctx.player).setY(1.2);
      ctx.fx.beam(from.clone().setY(1.2), b, { color: EL_ALBA.color, width: 0.25, duration: 1.4, intensity: 3 });
      ctx.fx.emit('light', b, { count: 60 });
    }
    try { acquire('el_alba', { noCutin: true }); } catch (err) { console.warn('[story] acquire el_alba', err); }
    await excepcionAcquired(EL_ALBA.name, { color: EL_ALBA.color });
    sayEvent('el_alba', {}, { force: true, position: 'center', hold: 3.4 });
    unlockAchievement('alba_robada');
    if (G.run) { st().finalWon = true; G.run.flags.final_won = true; }
    storyBeat('final_won');
    (ctx.setup as BattleSetup).returnTo = { scene: 'ending' };
  }

  async function finale(): Promise<void> {
    if (finished) return;
    finished = true;
    alive = true;
    // decided now, in case the sim ends the battle while the finale is still playing
    (ctx.setup as BattleSetup).returnTo = { scene: 'ending' };
    block(true);
    safe(() => ctx.lockInput(true));
    if (aurel) { safe(() => ctx.setAI(aurel!, 'idle')); safe(() => ctx.cameraFocus(aurel!, { distance: 7, duration: 1 })); }
    safe(() => ctx.slowmo(0.2, 2.6));
    ctx.pipeline.setLetterbox(1);
    if (aurel) safe(() => ctx.damage(aurel!, 1, { knockback: 8, from: { x: ctx.player.position.x, z: ctx.player.position.z } }));
    audio.duck(0.9, 3);
    await wait(1.4);
    await stealDawn(aurel ? pv(aurel) : null);
    await wait(2.4);
    block(false);
    safe(() => ctx.end(true, { skipResults: true }));
  }

  return {
    id: 'final_alliance',
    onStart(c) { ctx = c; void intro().catch((e) => console.error(e)); },
    onUpdate(c, dt) {
      if (finished) return;
      t += dt;
      if (!aurel || !aurel.alive) { const f = findAurel(); if (f) aurel = f; }
      if (!active && aurel && (t > 50 || enemies() < enemyStart * 0.5 || aurel.hp < aurel.hpMax)) void activate();
      if (!active || !aurel || busy) return;
      nextPower -= dt;
      if (nextPower <= 0) { nextPower = 8 + Math.random() * 4; void power(); }
      if (!revived && aurel.hp <= aurel.hpMax * 0.12) void retorno();
      else if (revived && aurel.hp <= aurel.hpMax * 0.08) void finale();
      void c;
    },
    onUnitDeath(c, u) {
      void c;
      if (!aurel || finished) return;
      if (u.id !== aurel.id) return;
      if (!revived) void retorno(); else void finale();
    },
    async onEnd(c, r) {
      void c;
      if (r.victory && !finished && !(G.run && st().finalWon)) {
        // the sim ended the battle before the scripted finale (the Alliance fell all at once): the dawn is still his
        finished = true;
        await stealDawn(aurel ? pv(aurel) : null);
      }
      alive = false;
      block(false);
      if (swordGlow) { swordGlow.removeFromParent(); swordGlow = null; }
      if (!r.victory && !finished) {
        // The Alliance holds, this time. The final act stays open: Concordia still waits.
        setTimeout(() => sayEvent('battle_lost', {}, { priority: true, defer: true }), 500);
      }
    },
  };
}
