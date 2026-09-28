/**
 * "Cuando aún tenía nombre" — the impossible tutorial duel against Aurel in Concordia (BattleScript).
 *
 * Choreography: crowd celebration → Elias appears in violet distortion → "Me llamo Elias Veyr. Este mundo me pertenece."
 * → the crowd laughs → Aurel: "Nadie tiene que salir herido." → tutorial hints (move, aim, dodge) → Aurel's powers one
 * by one, each filling a "Comprendiendo…" icon (Fuerza, Velo, Mente, Afinidad) → a lucky hit "kills" him → Retorno
 * → the titanic punch that launches Elias into the night → prologue 'fall'.
 * Comprehension is NOT granted here: the five Excepciones are acquired at the resurrection.
 */
import * as THREE from 'three';
import type { BattleContext, BattleScript, UnitHandle } from '../../battle/api';
import { buildCharacter, type CharacterRig } from '../../characters/rig';
import { glow } from '../../render/toon';
import { input } from '../../core/input';
import { engine } from '../../core/engine';
import { G } from '../../core/state';
import { h, layer } from '../../ui/dom';
import { dialogue } from '../../ui/dialogue';
import { floatText } from '../../ui/float';
import { blockMenu } from '../../ui/menu';
import { audio } from '../../audio';
import { DUEL, HERO_POWERS } from '../../data/story';
import { glyph } from './glyphs';
import { hint as storyHint, centerLine } from './ui';
import { resolveLine } from '../../ui/narrator';

const CANCEL = Symbol('cancel');

const PORTRAITS = {
  elias: { seed: 'elias', race: 'excepcion' as const, special: 'elias' as const, mood: 'smug' as const },
  aurel: { seed: 'aurel', race: 'humano' as const, special: 'aurel' as const, mood: 'smile' as const },
};

// ───────────────────────────── Comprendiendo… HUD ─────────────────────────────

export class ComprehendHud {
  readonly el: HTMLElement;
  private slots = new Map<string, HTMLElement>();
  constructor(powers = HERO_POWERS) {
    const row = h('div', { class: 'st-comp-row' });
    for (const p of powers) {
      const slot = h('div', { class: 'st-comp-slot', style: `--c:${p.color}` },
        h('div', { class: 'st-comp-icon' }, h('div', { class: 'st-comp-fill' }), h('span', { html: glyph(p.glyph, 24) })),
        h('div', { class: 'st-comp-name' }, p.name),
        h('div', { class: 'st-comp-count' }, '0/1'));
      this.slots.set(p.id, slot);
      row.appendChild(slot);
    }
    this.el = h('div', { class: 'st-comp' }, h('div', { class: 'st-comp-title' }, DUEL.comprehending), row);
    layer('hud').appendChild(this.el);
    requestAnimationFrame(() => this.el.classList.add('in'));
  }
  fill(id: string): void {
    const s = this.slots.get(id);
    if (!s || s.classList.contains('full')) return;
    s.classList.add('full');
    const c = s.querySelector('.st-comp-count');
    if (c) c.textContent = '1/1';
    audio.sfx('copy_progress', { volume: 0.9 });
    if ([...this.slots.values()].every((x) => x.classList.contains('full'))) this.el.classList.add('done');
  }
  remove(): void { this.el.classList.remove('in'); setTimeout(() => this.el.remove(), 700); }
}

// ───────────────────────────── the celebration crowd ─────────────────────────────

class Crowd {
  readonly rigs: CharacterRig[] = [];
  private t = 0;
  private laughT = 0;
  constructor(private scene: THREE.Scene, center: THREE.Vector3, axis: THREE.Vector3) {
    const races = ['humano', 'humano', 'humano', 'elfo', 'enano', 'duende', 'clerigo', 'humano'] as const;
    const jobs = ['campesino', 'mercader', 'noble', 'bardo', 'tabernero', 'soldado', 'sacerdote', 'erudito'] as const;
    const n = 16;
    const back = axis.clone().normalize();
    const side = new THREE.Vector3(-back.z, 0, back.x);
    for (let i = 0; i < n; i++) {
      const k = i / (n - 1);
      const ang = (k - 0.5) * Math.PI * 1.25;
      const r = 13.5 + (i % 3) * 1.4;
      const pos = center.clone().addScaledVector(back, Math.cos(ang) * r).addScaledVector(side, Math.sin(ang) * r);
      const rig = buildCharacter({
        seed: `crowd-${i}`, race: races[i % races.length], job: jobs[(i * 3) % jobs.length],
        gender: i % 2 ? 'f' : 'm', age: i % 7 === 3 ? 'child' : i % 9 === 5 ? 'old' : 'adult',
      });
      rig.root.position.copy(pos);
      rig.root.lookAt(center.x, pos.y, center.z);
      rig.pose = i % 4 === 0 ? 'cheer' : 'idle';
      rig.setExpression('happy');
      scene.add(rig.root);
      this.rigs.push(rig);
    }
  }
  laugh(): void {
    this.laughT = 2.4;
    for (const r of this.rigs) { r.setExpression('happy'); if (Math.random() < 0.7) r.play('cheer', 0.8 + Math.random() * 0.6); }
  }
  gasp(): void { for (const r of this.rigs) { r.setExpression('scared'); r.pose = 'idle'; } }
  calm(): void { for (const r of this.rigs) r.setExpression('neutral'); }
  update(dt: number): void {
    this.t += dt;
    this.laughT = Math.max(0, this.laughT - dt);
    for (let i = 0; i < this.rigs.length; i++) {
      const r = this.rigs[i];
      if (this.laughT > 0 && Math.random() < dt * 1.5) r.play('cheer', 0.5);
      r.update(dt, { speed: 0 });
    }
  }
  randomHead(): THREE.Vector3 {
    const r = this.rigs[Math.floor(Math.random() * this.rigs.length)];
    return r.root.position.clone().add(new THREE.Vector3(0, r.height + 0.3, 0));
  }
  dispose(): void { for (const r of this.rigs) r.dispose(); this.rigs.length = 0; void this.scene; }
}

// ───────────────────────────── the script ─────────────────────────────

export function aurelDuelScript(opts: { short?: boolean } = {}): BattleScript {
  let ctx: BattleContext;
  let aurel: UnitHandle | null = null;
  let alive = true;
  let hud: ComprehendHud | null = null;
  let crowd: Crowd | null = null;
  let lastAurelHp = -1;
  let aurelHits = 0;
  let moved = 0;
  let startPos: THREE.Vector3 | null = null;
  let clicked = false;
  let dodged = false;
  let luckyWindow = false;
  let luckyHit = false;
  let menuBlocked = false;
  let swordGlow: THREE.Object3D | null = null;
  const short = opts.short ?? (G.run?.cycle ?? 1) > 1;

  const block = (on: boolean) => { if (on !== menuBlocked) { blockMenu(on); menuBlocked = on; } };
  const safe = <T>(fn: () => T): T | undefined => { try { return fn(); } catch (err) { console.warn('[story duel]', err); return undefined; } };
  const wait = async (s: number) => {
    if (!alive) throw CANCEL;
    const w = safe(() => ctx.wait(s));
    if (w) await w; else await new Promise((r) => setTimeout(r, s * 1000));
    if (!alive) throw CANCEL;
  };
  const until = async (cond: () => boolean, timeout: number) => {
    let t = 0;
    while (!cond() && t < timeout) { await wait(0.1); t += 0.1; }
  };
  const hintMsg = (text: string, s = 4) => { if (safe(() => { ctx.hint(text, s); return true; }) === undefined) storyHint(text, s); };
  const sayAurel = (text: string, s = 2.6) => { if (aurel) safe(() => ctx.say(aurel!, text, s)); };
  const sayElias = (text: string, s = 2.6) => safe(() => ctx.say(ctx.player, text, s));
  const pv = (u: UnitHandle) => new THREE.Vector3(u.position.x, 0, u.position.z);
  const rigA = () => (aurel ? safe(() => ctx.rigOf(aurel!)) ?? null : null);
  const rigE = () => safe(() => ctx.rigOf(ctx.player)) ?? null;
  const talk = async (lines: Parameters<typeof dialogue.say>[0]) => { if (!alive) throw CANCEL; await dialogue.say(lines); if (!alive) throw CANCEL; };

  function findAurel(): UnitHandle | null {
    const list = safe(() => ctx.units(1)) ?? [];
    return list.find((u) => u.unitId === 'aurel' || u.npcId === 'aurel' || u.name === 'Aurel') ?? list[0] ?? null;
  }

  /** Aurel's hit on Elias (no abilityId: comprehension is scripted, not automatic). */
  function strike(amount: number, knock: number, color = '#fff2c0'): void {
    if (!aurel) return;
    const p = ctx.player;
    rigA()?.play('attack', 0.45);
    safe(() => ctx.damage(p, amount, { knockback: knock, from: { x: aurel!.position.x, z: aurel!.position.z } }));
    const at = pv(p).add(new THREE.Vector3(0, 1.1, 0));
    ctx.fx.emit('hit', at, { count: 18, color });
    ctx.fx.ring(pv(p), { color, radius: 3 + knock * 0.15 });
    audio.sfx(knock > 12 ? 'punch_launch' : 'hit_heavy');
    engine.hitstop(70);
  }

  async function approach(dist = 1.6, timeout = 2.2): Promise<void> {
    if (!aurel) return;
    const pp = pv(ctx.player);
    const ap = pv(aurel);
    const dir = ap.clone().sub(pp).setY(0);
    if (dir.lengthSq() < 0.01) dir.set(0, 0, 1);
    dir.normalize();
    const target = pp.clone().addScaledVector(dir, dist);
    safe(() => ctx.moveTo(aurel!, { x: target.x, z: target.z }));
    await until(() => !!aurel && pv(aurel).distanceTo(pv(ctx.player)) < dist + 0.8, timeout);
  }

  /** Best-effort teleport: the handle's position is the unit's position in most sims; moveTo is the fallback. */
  function teleport(u: UnitHandle, x: number, z: number): void {
    safe(() => { u.position.set(x, u.position.y, z); });
    safe(() => ctx.moveTo(u, { x, z }));
  }

  async function intro(): Promise<void> {
    aurel = findAurel();
    if (!aurel) aurel = safe(() => ctx.spawn('aurel', { x: ctx.player.position.x, z: ctx.player.position.z + 9 }, 1, { name: 'Aurel', special: 'aurel', hpMult: 20, npcId: 'aurel', captain: true })) ?? null;
    if (aurel) safe(() => ctx.setAI(aurel!, 'scripted'));
    safe(() => ctx.lockInput(true));
    block(true);
    ctx.player.minHp = Math.max(1, ctx.player.minHp);
    lastAurelHp = aurel?.hp ?? -1;
    startPos = pv(ctx.player);

    // the celebration. The sim may spawn them far apart: both walk to a meeting point while Elias is still unseen.
    const pS = pv(ctx.player);
    const aS = aurel ? pv(aurel) : pS.clone().add(new THREE.Vector3(0, 0, 13));
    const axis = aS.clone().sub(pS).setY(0);
    const gap = axis.length() || 1;
    axis.divideScalar(gap);
    const mid = gap > 16 ? pS.clone().addScaledVector(axis, gap * 0.55) : pS.clone().lerp(aS, 0.5);
    const eliasAt = gap > 16 ? mid.clone().addScaledVector(axis, -6.5) : pS.clone();
    const aurelAt = gap > 16 ? mid.clone().addScaledVector(axis, 6.5) : aS.clone();
    if (gap > 16) {
      safe(() => ctx.moveTo(ctx.player, { x: eliasAt.x, z: eliasAt.z }));
      if (aurel) safe(() => ctx.moveTo(aurel!, { x: aurelAt.x, z: aurelAt.z }));
    }
    crowd = new Crowd(ctx.scene, mid, axis);
    audio.ambience('crowd', true, 0.6);
    audio.sfx('crowd_cheer', { volume: 0.7 });
    for (let i = 0; i < 5; i++) setTimeout(() => { if (alive && crowd) ctx.fx.emit('confetti', crowd.randomHead(), { count: 26 }); }, i * 380);
    ctx.pipeline.setLetterbox(1);
    const er = rigE();
    if (er) er.root.visible = false;
    if (aurel) safe(() => ctx.cameraFocus(aurel!, { distance: 11, duration: 1.4 }));
    await wait(1.0);
    void centerLine(resolveLine(DUEL.opening).text, { hold: 2.6, cls: 'upper' });
    await until(() => pv(ctx.player).distanceTo(eliasAt) < 1.6 && (!aurel || pv(aurel).distanceTo(aurelAt) < 1.8), short ? 6 : 8);
    await wait(short ? 0.4 : 1.2);
    startPos = pv(ctx.player);

    // Elias appears in violet distortion
    const ep = pv(ctx.player).add(new THREE.Vector3(0, 1, 0));
    safe(() => ctx.cameraFocus(ctx.player, { distance: 7, duration: 0.8 }));
    ctx.pipeline.chromaticPulse(1.8, 1.4);
    ctx.pipeline.setMind(0.25);
    audio.sfx('teleport', { volume: 0.9 });
    audio.sfx('crowd_gasp', { volume: 0.6 });
    ctx.fx.emit('arcane', ep, { count: 90, speed: 7 });
    ctx.fx.emit('shadow', ep, { count: 30 });
    ctx.fx.ring(pv(ctx.player), { color: '#9b5cff', radius: 6, duration: 0.8 });
    ctx.fx.flash(ep, { color: '#9b5cff', radius: 3, duration: 0.5 });
    if (er) er.root.visible = true;
    await wait(0.9);
    ctx.pipeline.setMind(0);
    er?.play('point', 1.2);
    await talk([{ speaker: 'Elias Veyr', portrait: PORTRAITS.elias, side: 'right', text: DUEL.intro }]);

    // the crowd laughs
    crowd.laugh();
    audio.sfx('crowd_cheer', { volume: 0.9, pitch: 1.25 });
    for (let i = 0; i < 7; i++) {
      setTimeout(() => {
        if (!alive || !crowd) return;
        floatText(crowd.randomHead(), DUEL.crowd[i % DUEL.crowd.length], { kind: 'info', life: 1.8, size: 16 });
      }, i * 260);
    }
    er?.setExpression('angry');
    await wait(2.0);
    if (aurel) safe(() => ctx.cameraFocus(aurel!, { distance: 8, duration: 0.9 }));
    await approach(7.5, 1.4);
    const aurelLines: Parameters<typeof dialogue.say>[0] = [];
    if ((G.run?.cycle ?? 1) >= 3) aurelLines.push({ speaker: 'Aurel', title: 'Portador del Alba', portrait: { ...PORTRAITS.aurel, mood: 'surprised' }, text: DUEL.aurel.shorter });
    aurelLines.push({ speaker: 'Aurel', title: 'Portador del Alba', portrait: PORTRAITS.aurel, text: DUEL.aurelCalm });
    aurelLines.push({ speaker: 'Elias Veyr', portrait: PORTRAITS.elias, side: 'right', text: DUEL.eliasRetort });
    await talk(aurelLines);
    er?.setExpression('determined');
    crowd.calm();
    ctx.pipeline.setLetterbox(0);
    safe(() => ctx.cameraFocus(null));
    hud = new ComprehendHud();
    safe(() => ctx.lockInput(false));
    block(false);
  }

  async function tutorial(): Promise<void> {
    if (short) { hintMsg(DUEL.hints.aim, 3.5); await wait(2.5); return; }
    hintMsg(DUEL.hints.move, 5);
    await until(() => moved > 3, 7);
    hintMsg(DUEL.hints.aim, 6);
    clicked = false;
    const hitsBefore = aurelHits;
    await until(() => aurelHits > hitsBefore || (clicked && aurelHits > hitsBefore), 10);
    if (aurelHits > hitsBefore) { await wait(0.5); sayAurel('Tienes buena puntería.'); }
    await wait(1.4);
    // dodge lesson: a slow, telegraphed swing
    hintMsg(DUEL.hints.dodge, 5);
    dodged = false;
    await approach(2.2, 2);
    const ap = pv(ctx.player);
    ctx.fx.ring(ap, { color: '#ffd36b', radius: 2.4, duration: 1.1, from: 2.3 });
    rigA()?.play('cast', 1.0);
    audio.sfx('sword_swing', { volume: 0.5, pitch: 0.7 });
    await wait(1.05);
    if (dodged) { floatText(pv(ctx.player).add(new THREE.Vector3(0, 2.2, 0)), '¡Esquivado!', { kind: 'info' }); audio.sfx('whoosh'); }
    else strike(4, 4);
    await wait(1.2);
    hintMsg(DUEL.hints.understand, 4.5);
    await wait(1.2);
  }

  async function powers(): Promise<void> {
    // Fuerza Titánica
    sayAurel(DUEL.aurel.fuerza, 1.8);
    await wait(0.7);
    await approach(1.4, 2.4);
    rigA()?.play('attack', 0.5);
    await wait(0.25);
    strike(10, 18, '#ff9a5a');
    ctx.pipeline.impact(2, 1);
    ctx.fx.emit('earth', pv(ctx.player), { count: 20 });
    hud?.fill('fuerza_titanica');
    await wait(short ? 1.6 : 2.4);

    // Velo: vanish, reappear behind
    const ra = rigA();
    audio.sfx('invisibility_on');
    if (aurel) ctx.fx.emit('shadow', pv(aurel).add(new THREE.Vector3(0, 1, 0)), { count: 26 });
    if (aurel) ctx.fx.flash(pv(aurel).add(new THREE.Vector3(0, 1, 0)), { color: '#8f7cff', radius: 1.6, duration: 0.35 });
    if (ra) ra.root.visible = false;
    ctx.pipeline.setDesat(0.35);
    const pp = pv(ctx.player);
    const toA = aurel ? pv(aurel).sub(pp).setY(0).normalize() : new THREE.Vector3(0, 0, 1);
    const behind = pp.clone().addScaledVector(toA, -1.3);
    if (aurel) teleport(aurel, behind.x, behind.z);
    await wait(0.6);
    await until(() => !!aurel && pv(aurel).distanceTo(behind) < 1.4, 2.4);
    if (ra) ra.root.visible = true;
    ctx.pipeline.setDesat(0);
    audio.sfx('invisibility_off');
    ctx.fx.emit('shadow', behind.clone().setY(1), { count: 20 });
    sayAurel(DUEL.aurel.velo, 1.4);
    await wait(0.3);
    strike(7, 9, '#b9a8ff');
    hud?.fill('velo');
    await wait(short ? 1.5 : 2.2);

    // Dominar Mente: inverted controls + spiral
    rigA()?.play('cast', 1.4);
    audio.sfx('mind_control');
    ctx.fx.emit('mind', pv(ctx.player).add(new THREE.Vector3(0, 1.6, 0)), { count: 40 });
    ctx.player.controlsInverted = true;
    ctx.pipeline.setMind(0.85);
    rigE()?.setExpression('mind');
    sayAurel(DUEL.aurel.mente, 3);
    hintMsg(DUEL.hints.inverted, 3.5);
    hud?.fill('dominar_mente');
    await wait(1.8);
    await approach(1.8, 1.5);
    strike(5, 5, '#ff7bf0');
    await wait(short ? 1.6 : 2.6);
    ctx.player.controlsInverted = false;
    ctx.pipeline.setMind(0);
    rigE()?.setExpression('angry');
    await wait(1.0);

    // Afinidad de Reliquias: the sword drinks a relic's light
    sayAurel(DUEL.aurel.afinidad, 3);
    const rw = rigA();
    if (rw?.weaponMesh) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.05, 0.9), glow('#ffd36b', 3.2, { additive: true, transparent: true, opacity: 0.8, unique: true }));
      blade.position.set(0, -0.02, 0.45);
      rw.weaponMesh.add(blade);
      swordGlow = blade;
    }
    audio.sfx('buff');
    if (aurel) { ctx.fx.emit('light', pv(aurel).add(new THREE.Vector3(0, 1.4, 0)), { count: 40 }); ctx.fx.ring(pv(aurel), { color: '#ffd36b', radius: 4 }); }
    await wait(1.1);
    await approach(1.7, 2);
    strike(9, 12, '#ffd36b');
    if (aurel) ctx.fx.beam(pv(aurel).setY(1.2), pv(ctx.player).setY(1.2), { color: '#ffd36b', width: 0.35, duration: 0.3 });
    hud?.fill('afinidad_reliquias');
    await wait(short ? 1.4 : 2.2);
  }

  async function lucky(): Promise<void> {
    // Aurel turns to the crowd for a second — the only opening he will ever give.
    hintMsg(DUEL.hints.lucky, 4);
    if (aurel) {
      const away = pv(aurel).add(pv(aurel).sub(pv(ctx.player)).setY(0).normalize().multiplyScalar(3));
      safe(() => ctx.moveTo(aurel!, { x: away.x, z: away.z }));
    }
    luckyWindow = true;
    luckyHit = false;
    await until(() => luckyHit, 7);
    luckyWindow = false;
    if (!luckyHit && aurel) {
      // luck finds a way: a stray spark
      const a = pv(ctx.player).setY(1.2), b = pv(aurel).setY(1.2);
      ctx.fx.beam(a, b, { color: '#c7a2ff', width: 0.12, duration: 0.25 });
      audio.sfx('cast_arcane');
    }
    // he falls
    safe(() => ctx.lockInput(true));
    block(true);
    safe(() => ctx.slowmo(0.3, 1.6));
    ctx.pipeline.impact(2, 0);
    audio.sfx('hit_magic');
    audio.sfx('crowd_gasp', { volume: 0.9 });
    crowd?.gasp();
    if (aurel) {
      const from = pv(ctx.player);
      safe(() => ctx.damage(aurel!, 1, { knockback: 13, from: { x: from.x, z: from.z }, crit: true }));
      floatText(pv(aurel).add(new THREE.Vector3(0, 2, 0)), '1', { kind: 'crit' });
    }
    if (aurel) safe(() => ctx.cameraFocus(aurel!, { distance: 7, duration: 0.8 }));
    ctx.pipeline.setLetterbox(1);
    audio.duck(0.8, 2.4);
    await wait(2.4);
    // Retorno: rising in light
    if (aurel) {
      const ap = pv(aurel);
      ctx.fx.emit('light', ap.clone().setY(0.5), { count: 80, speed: 3, up: 6 });
      ctx.fx.emit('heal', ap.clone().setY(1), { count: 40 });
      ctx.fx.flash(ap.clone().setY(1), { color: '#fff4c8', radius: 5, duration: 0.7 });
      ctx.fx.ring(ap, { color: '#9dffb8', radius: 9, duration: 0.8 });
    }
    ctx.pipeline.flash('#fff7d6', 0.6, 0.8);
    audio.sfx('revive');
    if (aurel) { aurel.hp = aurel.hpMax; lastAurelHp = aurel.hp; }
    await wait(0.4);
    strike(4, 11, '#9dffb8');
    hud?.fill('retorno');
    audio.sfx('crowd_cheer', { volume: 0.9 });
    await wait(0.8);
    sayAurel(DUEL.aurel.retorno, 2.4);
    await wait(2.4);
  }

  async function finale(): Promise<void> {
    safe(() => ctx.cameraFocus(null));
    ctx.pipeline.setLetterbox(1);
    sayAurel(DUEL.aurel.final, 2.2);
    await wait(1.2);
    // light gathers in his fist
    const ra = rigA();
    ra?.play('cast', 1.6);
    audio.sfx('cast_light', { volume: 0.9, pitch: 0.7 });
    for (let i = 0; i < 8; i++) {
      setTimeout(() => {
        if (!alive || !aurel) return;
        const hand = pv(aurel).add(new THREE.Vector3(0, 1.2, 0));
        ctx.fx.emit('light', hand, { count: 14, speed: -2.5, spread: 1.4, life: 0.5 });
      }, i * 110);
    }
    safe(() => ctx.slowmo(0.35, 1.4));
    await wait(1.0);
    await approach(1.3, 1.6);
    ra?.play('attack', 0.35);
    await wait(0.18);
    // THE punch
    const p = ctx.player;
    const dir = aurel ? pv(p).sub(pv(aurel)).setY(0).normalize() : new THREE.Vector3(0, 0, 1);
    ctx.pipeline.impact(3, 0);
    ctx.pipeline.flash('#ffffff', 0.9, 0.6);
    ctx.pipeline.chromaticPulse(2, 1);
    ctx.pipeline.setSpeedLines(1);
    engine.hitstop(160);
    audio.sfx('punch_launch', { volume: 1 });
    audio.sfx('explosion', { volume: 0.8 });
    audio.sfx('crowd_gasp');
    ctx.fx.emit('explosion', pv(p).setY(1), { count: 50 });
    ctx.fx.ring(pv(p), { color: '#fff2c0', radius: 14, duration: 0.7 });
    rigE()?.setExpression('hurt');
    safe(() => ctx.launch(p, { x: dir.x * 16, y: 42, z: dir.z * 16 }));
    safe(() => ctx.cameraFocus(p, { distance: 14, duration: 0.6 }));
    safe(() => ctx.slowmo(0.25, 2));
    await wait(1.8);
    ctx.pipeline.setSpeedLines(0);
    if (G.run) G.run.flags.duel_done = true;
    hud?.remove();
    hud = null;
    safe(() => ctx.end(false, { skipResults: true }));
  }

  async function run(): Promise<void> {
    try {
      await intro();
      await tutorial();
      await powers();
      await lucky();
      await finale();
    } catch (err) {
      if (err !== CANCEL) console.error('[story duel] script failed', err);
    }
  }

  function cleanup(): void {
    alive = false;
    block(false);
    hud?.remove(); hud = null;
    crowd?.dispose(); crowd = null;
    if (swordGlow) { swordGlow.removeFromParent(); swordGlow = null; }
    audio.ambience('crowd', false);
    try { dialogue.close(); } catch { /* ignore */ }
  }

  return {
    id: 'aurel_tutorial',
    onStart(c) { ctx = c; void run(); },
    onUpdate(c, _dt) {
      if (!alive) return;
      crowd?.update(_dt);
      if (startPos) moved = pv(c.player).distanceTo(startPos);
      if (input.mousePressed(0)) clicked = true;
      if (input.wasPressed('Space')) dodged = true;
      if (!aurel) aurel = findAurel();
      if (aurel && lastAurelHp >= 0 && aurel.hp < lastAurelHp - 0.001) {
        // Elias does exactly 1 damage in this fight: whatever the sim computed, only 1 sticks.
        aurelHits++;
        aurel.hp = Math.max(1, lastAurelHp - 1);
        if (luckyWindow) luckyHit = true;
      }
      if (aurel) {
        if (aurel.hp < aurel.hpMax * 0.2) aurel.hp = aurel.hpMax; // never let the sim kill him
        lastAurelHp = aurel.hp;
      }
      if (c.player.hp < c.player.hpMax * 0.35) safe(() => c.heal(c.player, c.player.hpMax * 0.3));
    },
    onPlayerDamaged() { /* minHp keeps Elias standing; the heal above keeps the fight readable */ },
    onPlayerDeath() { return true; },
    onEnd() { cleanup(); },
  };
}
