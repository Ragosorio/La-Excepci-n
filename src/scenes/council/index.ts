/**
 * Scene 'council': El Concilio de los Cinco in session. White-marble rotunda, five delegates + the Custodia Ione,
 * Elias on the petitioner's podium, cinematic camera and the DOM voting UI (voting.ts).
 * Params: { sessionId?, returnTo?, debug? } — ?scene=council opens a sample session.
 */
import * as THREE from 'three';
import { engine, registerScene, type GameScene } from '../../core/engine';
import { G } from '../../core/state';
import { damp } from '../../core/math';
import { buildCharacter, type CharacterRig } from '../../characters/rig';
import { Fx } from '../../render/fx';
import { audio } from '../../audio';
import { toast } from '../../ui/toasts';
import { blockMenu } from '../../ui/menu';
import type { FaceExpr } from '../../ui/art/faceAtlas';
import type { PortraitMood } from '../../ui/art/portraits';
import type { RaceId } from '../../data/types';
import { soc, luna, seatsHeld } from '../../systems/society/state';
import { createSession, delegateId, requestPresent, startRuntime, type CouncilRuntime, type Tool } from '../../systems/society/politics';
import { npcView } from '../../systems/society/memory';
import { crestColors } from '../../systems/society/icons';
import { Chamber, ELIAS_POS, IONE_POS, SEAT_ORDER } from './chamber';
import { CouncilUI } from './voting';

const WIDE_POS = new THREE.Vector3(0, 6.8, 12.2);
const WIDE_LOOK = new THREE.Vector3(0, 0.5, -0.8);

const MOOD_TO_FACE: Partial<Record<PortraitMood, FaceExpr>> = {
  mind: 'mind', smile: 'happy', angry: 'angry', scared: 'scared', dead: 'dead', sad: 'hurt', surprised: 'scared', determined: 'determined', neutral: 'neutral',
};

class CouncilScene implements GameScene {
  readonly id = 'council';
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(42, 1, 0.1, 220);
  private chamber: Chamber | null = null;
  private fx: Fx | null = null;
  private seatRigs: CharacterRig[] = [];
  private rigById = new Map<string, CharacterRig>();
  private ione: CharacterRig | null = null;
  private elias: CharacterRig | null = null;
  private ui: CouncilUI | null = null;
  private rt: CouncilRuntime | null = null;
  private returnTo = 'overworld';
  private t = 0;
  private intro = 0;
  private camPos = new THREE.Vector3(0, 14, 16);
  private camLook = new THREE.Vector3(0, 1.4, -1);
  private tgtPos = new THREE.Vector3(0, 6.8, 12.2);
  private tgtLook = new THREE.Vector3(0, 0.5, -0.8);
  private standing = new Set<string>();
  private leaving = false;

  async enter(params?: unknown): Promise<void> {
    const p = (params ?? {}) as { sessionId?: string; returnTo?: string; debug?: boolean | string };
    const debug = !!p.debug;
    this.returnTo = p.returnTo && p.returnTo !== 'council' ? p.returnTo : 'overworld';
    this.leaving = false;
    const c = soc().council;
    let sess = c.session;
    const usable = !!sess && sess.status !== 'resolved' && (sess.status !== 'announced' || debug);
    if (!sess || !usable) {
      if (!debug) {
        toast('El Concilio no está sesionando ahora.', { kind: 'bad' });
        setTimeout(() => void engine.goto(this.returnTo), 700);
        return;
      }
      sess = createSession(luna(), { forced: ['sanciones', 'libre_comercio', 'prohibir_apuestas'] });
      c.session = sess;
      const pl = G.run.player;
      pl.gold = Math.max(pl.gold, 1500); pl.secrets = Math.max(pl.secrets, 3); pl.influence = Math.max(pl.influence, 40); pl.mana = pl.manaMax;
      G.run.flags.debug_all_powers = true;
    }
    sess.status = 'inprogress';
    this.rt = startRuntime(sess, debug);

    this.chamber = new Chamber(this.scene);
    this.fx = new Fx(this.scene);
    this.buildRigs();
    this.refreshSeats();
    this.t = 0;
    this.intro = 0;
    this.camPos.set(-9, 13.5, 13);
    this.camLook.set(0, 1.4, -1);
    this.focus('wide');

    const pl = engine.pipeline;
    pl.setBloom(0.5, 0.45, 0.93);
    pl.setGrade({ saturation: 1.08, contrast: 1.06, brightness: -0.01, vignette: 0.5, grain: 0.025 });
    pl.setLetterbox(1);
    audio.music('council', { region: 'concordia' });
    audio.ambience('crowd', true, 0.25);
    audio.stinger('council_open');
    blockMenu(false);

    this.ui = new CouncilUI(this.rt, {
      focus: (t) => this.focus(t),
      react: (id, mood) => this.react(id, mood),
      vote: (id, forElias, vote) => this.vote(id, forElias, vote),
      sitAll: () => this.sitAll(),
      eliasAct: (tool) => this.eliasAct(tool),
      kill: (id) => this.kill(id),
      cheer: (a) => this.chamber?.cheer(a),
      refreshSeats: () => this.refreshSeats(),
      leave: () => this.leave(),
    });
    setTimeout(() => { if (this.ui) { this.ui.mount(); engine.pipeline.setLetterbox(0); } }, 2600);
  }

  private makeRig(id: string, c: string | null): CharacterRig {
    const v = npcView(id);
    const race = (v?.race ?? 'humano') as RaceId;
    const special = id === 'fortuna' ? 'fortuna' : id === 'ione' ? 'ione' : undefined;
    const [ca] = c ? crestColors(c as never) : ['#d9b36c'];
    const scale = race === 'gigante' ? 0.52 : race === 'ogro' ? 0.68 : race === 'trol' ? 0.85 : 1;
    return buildCharacter({ seed: id, race, job: 'delegado', gender: v?.gender === 'f' ? 'f' : 'm', age: v?.age === 'child' ? 'adult' : v?.age, special, scale, colors: special ? undefined : { outfit2: ca } });
  }

  private buildRigs(): void {
    const ch = this.chamber!;
    SEAT_ORDER.forEach((c, i) => {
      const id = delegateId(c);
      const rig = this.makeRig(id, c);
      const seat = ch.seats[i];
      rig.root.position.copy(seat.pos);
      rig.root.rotation.y = seat.facing;
      rig.pose = 'sit';
      if (!G.run.npcs[id]?.alive) { rig.pose = 'dead'; rig.setExpression('dead'); }
      if (G.run.npcs[id]?.loyal || seatsHeld().includes(c)) rig.setEyeGlow('#c07bff');
      seat.chair.scale.setScalar(Math.max(1, rig.scale * 0.95));
      this.scene.add(rig.root);
      this.seatRigs[i] = rig;
      this.rigById.set(id, rig);
    });
    this.ione = this.makeRig('ione', null);
    this.ione.root.position.copy(IONE_POS);
    this.ione.root.rotation.y = 0;
    this.scene.add(this.ione.root);
    this.rigById.set('ione', this.ione);
    this.elias = buildCharacter({ seed: 'elias', race: 'excepcion', special: G.run.player.titleIndex >= 5 ? 'elias_god' : 'elias' });
    this.elias.root.position.copy(ELIAS_POS);
    this.elias.root.rotation.y = Math.PI;
    this.scene.add(this.elias.root);
    this.elias.setExpression('determined');
  }

  refreshSeats(): void {
    const ch = this.chamber;
    if (!ch) return;
    const seats = seatsHeld();
    SEAT_ORDER.forEach((c, i) => {
      const id = delegateId(c);
      const [, b] = crestColors(c);
      const dominated = !!this.rt && (this.rt.sessionUsed[id] ?? []).includes('dominar');
      ch.setGem(i, seats.includes(c) || dominated ? '#b07bff' : b, seats.includes(c) ? 3.2 : 2.2);
    });
  }

  focus(t: 'wide' | 'elias' | 'ione' | number): void {
    if (t === 'wide') { this.tgtPos.copy(WIDE_POS); this.tgtLook.copy(WIDE_LOOK); return; }
    if (t === 'elias') { this.tgtPos.set(1.8, 2.6, 9.6); this.tgtLook.copy(ELIAS_POS).add(new THREE.Vector3(0, 1.6, 0)); return; }
    let rig: CharacterRig | null = null;
    if (t === 'ione') rig = this.ione;
    else rig = this.seatRigs[t] ?? null;
    if (!rig) return;
    const head = rig.root.position.clone().add(new THREE.Vector3(0, (this.standing.has(this.idOf(rig)) || t === 'ione' ? rig.height * 0.85 : rig.height * 0.62), 0));
    // Pull in from the wide shot's direction: close enough to read the face, above the table and the seat gems.
    const dir = WIDE_POS.clone().sub(head).normalize();
    this.tgtPos.copy(head).addScaledVector(dir, 5 + rig.height * 0.8);
    this.tgtLook.copy(head).add(new THREE.Vector3(0, -0.15, 0));
  }

  private idOf(rig: CharacterRig): string {
    for (const [id, r] of this.rigById) if (r === rig) return id;
    return '';
  }

  react(id: string, mood: PortraitMood): void {
    const rig = this.rigById.get(id);
    if (!rig) return;
    const face = MOOD_TO_FACE[mood] ?? 'neutral';
    rig.setExpression(face);
    if (mood === 'mind') { rig.setEyeGlow('#c07bff'); this.fx?.emit('mind', rig.root.position.clone().add(new THREE.Vector3(0, rig.height * 0.8, 0)), { count: 24 }); }
    if (mood === 'smile') this.fx?.emit('coins', rig.root.position.clone().add(new THREE.Vector3(0, 1.2, 0)), { count: 14 });
    if (mood === 'scared') rig.hit(new THREE.Vector3(0, 0, -1));
    if (mood === 'angry') rig.play('point', 0.7);
  }

  eliasAct(tool: Tool): void {
    const e = this.elias;
    if (!e) return;
    const hand = e.root.position.clone().add(new THREE.Vector3(0, 1.5, -0.3));
    if (tool === 'dominar') { e.play('cast', 0.7); e.setEyeGlow('#c07bff'); this.fx?.emit('mind', hand, { count: 28 }); engine.pipeline.setMind(0.55); setTimeout(() => { engine.pipeline.setMind(0); e.setEyeGlow(null); }, 1300); }
    else if (tool === 'sobornar') { e.play('point', 0.5); this.fx?.emit('coins', hand, { count: 18 }); }
    else if (tool === 'chantajear') { e.play('point', 0.6); this.fx?.emit('shadow', hand, { count: 16 }); }
    else if (tool === 'intimidar') { e.setExpression('angry'); e.setEyeGlow('#e2455b'); this.fx?.emit('shadow', e.root.position.clone().add(new THREE.Vector3(0, 1, 0)), { count: 30 }); setTimeout(() => { e.setExpression('determined'); e.setEyeGlow(null); }, 1200); }
    else if (tool === 'favor') { e.play('point', 0.5); this.fx?.emit('luck', hand, { count: 16 }); }
    else if (tool === 'discurso') { e.play('cheer', 1.2); this.fx?.emit('light', hand, { count: 30 }); this.fx?.ring(e.root.position.clone().add(new THREE.Vector3(0, 0.4, 0)), { color: '#d9b36c', radius: 8 }); }
    else if (tool === 'asesinar') { e.setExpression('neutral'); }
  }

  kill(id: string): void {
    const rig = this.rigById.get(id);
    if (!rig) return;
    const p = rig.root.position.clone().add(new THREE.Vector3(0, rig.height * 0.6, 0));
    this.fx?.emit('ink', p, { count: 26 });
    this.fx?.emit('shadow', p, { count: 20 });
    engine.pipeline.impact(2, 2);
    engine.hitstop(90);
    rig.pose = 'dead';
    rig.setExpression('dead');
    this.chamber?.cheer(1.5);
    audio.sfx('crowd_gasp');
  }

  async vote(id: string, forElias: boolean, vote: 'si' | 'no'): Promise<void> {
    const rig = this.rigById.get(id);
    if (!rig || rig.pose === 'dead') return;
    this.standing.add(id);
    rig.pose = 'idle';
    await new Promise((r) => setTimeout(r, 380));
    const seat = SEAT_ORDER.findIndex((c) => delegateId(c) === id);
    if (vote === 'si') { rig.play('cheer', 0.9); rig.setExpression(forElias ? 'happy' : 'determined'); }
    else { rig.play('point', 0.9); rig.setExpression(forElias ? 'determined' : 'angry'); }
    const col = forElias ? '#b48cff' : '#ff5d6c';
    if (seat >= 0) this.chamber?.flashSeat(seat, col, 0.45);
    this.fx?.emit(forElias ? 'magic' : 'spark', rig.root.position.clone().add(new THREE.Vector3(0, rig.height, 0)), { count: 22, color: col });
    this.chamber?.cheer(0.35);
    engine.pipeline.chromaticPulse(0.4, 0.3);
  }

  sitAll(): void {
    for (const [id, rig] of this.rigById) {
      if (id === 'ione' || rig.pose === 'dead') continue;
      rig.pose = 'sit';
      rig.setExpression('neutral');
    }
    this.standing.clear();
  }

  private leave(): void {
    if (this.leaving) return;
    this.leaving = true;
    const params = this.returnTo === 'location' && G.run.player.location ? { id: G.run.player.location } : undefined;
    void engine.goto(this.returnTo, params, { fade: 0.8 });
  }

  exit(): void {
    this.ui?.destroy();
    this.ui = null;
    const sess = this.rt?.session;
    if (sess && sess.status === 'inprogress') {
      sess.status = 'pending';
      requestPresent();
      toast('El Concilio sigue sesionando. Te esperan.', { kind: 'info' });
    }
    this.rt = null;
    for (const r of this.rigById.values()) r.dispose();
    this.elias?.dispose();
    this.rigById.clear();
    this.seatRigs = [];
    this.ione = null;
    this.elias = null;
    this.fx?.dispose();
    this.fx = null;
    this.chamber?.dispose();
    this.chamber = null;
    this.scene.clear();
    this.scene.fog = null;
    this.standing.clear();
    audio.ambience('crowd', false);
    engine.pipeline.setMind(0);
    engine.pipeline.setLetterbox(0);
  }

  update(dt: number): void {
    this.t += dt;
    this.chamber?.update(dt, this.t);
    this.fx?.update(dt);
    for (const r of this.rigById.values()) r.update(dt, { speed: 0 });
    this.elias?.update(dt, { speed: 0 });
  }

  lateUpdate(realDt: number): void {
    this.intro = Math.min(1, this.intro + realDt / 3.2);
    const k = this.intro < 1 ? 1.4 : 3.2;
    this.camPos.x = damp(this.camPos.x, this.tgtPos.x, k, realDt);
    this.camPos.y = damp(this.camPos.y, this.tgtPos.y, k, realDt);
    this.camPos.z = damp(this.camPos.z, this.tgtPos.z, k, realDt);
    this.camLook.x = damp(this.camLook.x, this.tgtLook.x, k * 1.2, realDt);
    this.camLook.y = damp(this.camLook.y, this.tgtLook.y, k * 1.2, realDt);
    this.camLook.z = damp(this.camLook.z, this.tgtLook.z, k * 1.2, realDt);
    const sway = Math.sin(this.t * 0.25) * 0.25;
    this.camera.position.set(this.camPos.x + sway, this.camPos.y, this.camPos.z);
    this.camera.lookAt(this.camLook);
  }
}

registerScene('council', () => new CouncilScene());
