/**
 * El mapa del mundo — a diorama of the five continents + Concordia.
 * Real-time world (pausable ×1/×2/×4), Elias's party (WASD / click-to-move, boats at sea), living parties,
 * encounters, locations (walk near + E or click), HUD. Persistent scene: built once, re-entered after
 * locations/battles.
 */
import * as THREE from 'three';
import { engine, registerScene, type GameScene } from '../../core/engine';
import { G, newRun, res } from '../../core/state';
import { input } from '../../core/input';
import { bus } from '../../core/events';
import { track } from '../../core/tracker';
import { saveRun } from '../../core/save';
import { LOCATION_LIST, LOCATIONS } from '../../data/world';
import { Sky } from '../../render/sky';
import { Fx } from '../../render/fx';
import { CameraRig } from '../../render/camera';
import { h, layer } from '../../ui/dom';
import { toast } from '../../ui/toasts';
import { narrate } from '../../ui/narrator';
import { dialogue } from '../../ui/dialogue';
import { audio, type Region } from '../../audio';
import { openCodex } from '../../systems/progression/codex';
import { openRelics } from '../../systems/progression/relics';
import { openRealityBook } from '../../systems/progression/reality';
import { maxMana } from '../../systems/progression/stats';
import { W, type PartyState } from '../../systems/world/state';
import { advanceTime, isPaused, nightFactor, setPaused, setSpeed, skyTime, togglePause, LUNA_SECONDS } from '../../systems/world/time';
import { CONT_ORDER, continentAt, heightAt, surfaceAt, locationHeight } from '../../systems/world/geo';
import { getParty, idleBark, updateParties } from '../../systems/world/parties';
import { openEncounter, partyTooltip } from '../../systems/world/encounters';
import { totalPower } from '../../systems/world/forces';
import { buildTerrain, type TerrainBundle } from './terrain';
import { LocationMeshes, whirlpool } from './locations3d';
import { PropField } from './props';
import { Clouds, Weather, Birds } from './atmos';
import { FigureField } from './figures';
import { PartyView } from './partiesView';
import { FlagField } from './flags';
import { PlayerToken, auraGeometry, conformRing } from './player';
import { MapLabels, type PoliticalMode } from './labels';
import { OverworldHUD } from './hud';
import { closePanel, openArmyPanel, openQuestPanel, panelOpen, politicalLegend } from './panels';
import { WORLD_U, heatColor, updateHubs } from './shaders';
import { loadArt } from './icons';
import './overworld.css';

const ENTER_RADIUS = 4.4;
const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const WHITE = new THREE.Color('#ffffff');

class OverworldScene implements GameScene {
  readonly id = 'overworld';
  readonly persistent = true;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(40, 1, 0.5, 2600);
  private built = false;
  private sky!: Sky;
  private fx!: Fx;
  private rig!: CameraRig;
  private terrain!: TerrainBundle;
  private locs!: LocationMeshes;
  private props!: PropField;
  private clouds!: Clouds;
  private weather!: Weather;
  private birds!: Birds;
  private flags!: FlagField;
  private figures!: FigureField;
  private player!: PlayerToken;
  private labels!: MapLabels;
  private hud!: OverworldHUD;
  private whirl!: THREE.Mesh;
  private marker!: THREE.Mesh;
  private aura!: THREE.Mesh;
  private dom: HTMLElement | null = null;
  private polEl: HTMLElement | null = null;
  private political: PoliticalMode = null;
  private scope = bus.scope();
  private pview!: PartyView;
  private busy = false;
  private t = 0;
  private trailT = 0;
  private barkT = 0;
  private badgeT = 0;
  private musicT = 0;
  private relicFxT = 0;
  private stepT = 0;
  private lastRegion: string | null = null;
  private night = 0;
  private dragging = false;
  private wasMoving = false;
  private cloudLit = new THREE.Color();
  private stormT = 4;

  // ───────────────────────── build ─────────────────────────
  private build(): void {
    this.sky = new Sky(this.scene, { radius: 1400, fogNear: 140, fogFar: 520, clouds: 0, shadowSize: 70 });
    this.sky.sun.shadow.mapSize.set(2048, 2048);
    this.fx = new Fx(this.scene, 3000);
    this.rig = new CameraRig(this.camera);
    this.rig.yaw = 0; this.rig.pitch = 0.95; this.rig.distance = 44; this.rig.minDistance = 16; this.rig.maxDistance = 175;
    this.rig.lookOffset.set(0, 1.0, 0);
    this.rig.followK = 6;
    this.terrain = buildTerrain();
    this.scene.add(this.terrain.terrain, this.terrain.water);
    this.flags = new FlagField(260);
    this.scene.add(this.flags.mesh);
    this.locs = new LocationMeshes(LOCATION_LIST.map((def) => ({ def, x: def.pos.x, y: locationHeight(def.id), z: def.pos.z, yaw: 0, scale: 1 })), this.flags);
    this.scene.add(this.locs.group);
    this.props = new PropField();
    this.scene.add(this.props.group);
    this.clouds = new Clouds(16);
    this.scene.add(this.clouds.mesh);
    this.weather = new Weather();
    this.scene.add(this.weather.group);
    this.birds = new Birds();
    this.scene.add(this.birds.mesh);
    this.figures = new FigureField(240);
    this.scene.add(this.figures.group);
    this.player = new PlayerToken();
    this.scene.add(this.player.root);
    const arena = LOCATIONS.arena_remolino;
    this.whirl = whirlpool(4.8, 10);
    this.whirl.position.set(arena.pos.x, 0.06, arena.pos.z);
    this.scene.add(this.whirl);
    this.aura = new THREE.Mesh(auraGeometry(), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.3, 0.6, 2.4), transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    this.aura.renderOrder = 4;
    this.aura.frustumCulled = false;
    this.scene.add(this.aura);
    this.marker = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.8, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.4, 3.2), transparent: true, depthWrite: false }));
    this.marker.visible = false;
    this.scene.add(this.marker);
    this.pview = new PartyView(this.scene, this.figures, this.flags);
    this.labels = new MapLabels((id) => this.onLocationClick(id));
    this.hud = new OverworldHUD({
      speed: (s) => { setSpeed(s); },
      pause: () => { togglePause(); },
      codex: () => this.safe(() => openCodex()),
      relics: () => this.safe(() => openRelics()),
      army: () => openArmyPanel(),
      quests: () => openQuestPanel((id) => this.travelTo(id)),
      political: () => this.togglePolitical(),
      book: () => this.safe(() => void openRealityBook()),
      veil: () => this.castVeil(),
      track: (id) => { W().tracked = id; },
    });
    loadArt(() => this.hud?.refreshRings());
    this.built = true;
  }

  private safe(fn: () => void): void { try { fn(); } catch (err) { console.warn('[overworld] action failed', err); } }

  // ───────────────────────── lifecycle ─────────────────────────
  enter(params?: unknown): void {
    const p = (params ?? {}) as { respawn?: string; afterBattle?: boolean; focus?: string; fresh?: unknown };
    // ?scene=overworld&fresh → brand-new run at the Cráter (debug)
    if (!G.hasRun || p.fresh !== undefined) newRun((Math.random() * 2 ** 31) >>> 0);
    if (!this.built) this.build();
    const run = G.run;
    run.player.location = null;
    this.player.place(run.player.pos.x, run.player.pos.z);
    this.rig.follow(this.player.pos, true);
    this.rig.update(0.016);
    this.pview.reset();
    this.busy = false;
    // DOM
    this.dom = h('div', { class: 'ow-root' });
    layer('hud').appendChild(this.dom);
    this.dom.appendChild(this.labels.root);
    this.hud.mount(this.dom);
    // look
    const pl = engine.pipeline;
    pl.setBloom(0.62, 0.5, 0.84);
    pl.setGrade({ saturation: 1.14, contrast: 1.05, vignette: 0.42, grain: 0.028 });
    this.locs.syncControl();
    this.labels.refreshBadges();
    WORLD_U.uMapXf.value.set(1, 0, 0);
    updateHubs(G.run, LOCATION_LIST);
    this.night = nightFactor();
    this.sky.setTime(skyTime());
    // events
    this.scope = bus.scope();
    this.scope.on('world:bark', ({ partyId, text }) => {
      const party = getParty(partyId);
      if (party) this.labels.bark(text, () => this.partyWorldPos(partyId), party.hostile);
    });
    this.scope.on('world:party', ({ id, action }) => {
      if (action === 'remove') this.pview.forget(id);
    });
    this.scope.on('luna:tick', () => { this.onLunaTick(); });
    this.scope.on('title:change', () => { this.locs.syncControl(); });
    this.scope.on('continent:corrupted', () => { this.locs.syncControl(); updateHubs(G.run, LOCATION_LIST); engine.pipeline.flash('#9b5cff', 0.35, 0.8); });
    this.scope.on('location:control', ({ id, to }) => {
      this.locs.syncControl();
      updateHubs(G.run, LOCATION_LIST);
      this.labels.refreshBadges();
      const def = LOCATIONS[id];
      if (def && to === 'excepcion') {
        const at = tmpV.set(def.pos.x, locationHeight(id) + 1, def.pos.z);
        this.fx.ring(at, { color: '#9b5cff', radius: 9, duration: 1.1 });
        this.fx.emit('shadow', at, { count: 30, scale: 2 });
      }
    });
    this.scope.on('relic:revealed', ({ locationId }) => {
      const def = LOCATIONS[locationId];
      if (!def) return;
      const st = G.run.locations[locationId];
      if (st) st.flags.relicKnown = true;
      this.labels.refreshBadges();
      const at = tmpV.set(def.pos.x, locationHeight(locationId) + 3, def.pos.z);
      this.fx.ring(at, { color: '#ffe38a', radius: 7, duration: 1.2 });
      this.fx.emit('stars', at, { count: 24, color: '#e0a8ff', color2: '#ffe38a', scale: 2 });
    });
    this.scope.on('res:change', ({ key, delta }) => { if (key === 'gold' && delta > 0) this.fx.emit('coins', tmpV.copy(this.player.pos).setY(this.player.pos.y + 2.4), { count: Math.min(24, 6 + Math.round(delta / 40)) }); });
    // capture phase: runs before the global Esc menu so the political overlay can consume Escape
    const keyHandler = (e: KeyboardEvent) => this.onKey(e);
    window.addEventListener('keydown', keyHandler, true);
    this.offKey = () => window.removeEventListener('keydown', keyHandler, true);
    // music/ambience
    this.lastRegion = null;
    this.updateMusic(true);
    if (W().paused) setPaused(true); else setSpeed(W().speed || 1);
    // arrival beats
    if (p.respawn || W().respawn) {
      W().respawn = false;
      engine.pipeline.flash('#9b5cff', 0.6, 1.2);
      this.fx.emit('arcane', tmpV.copy(this.player.pos).setY(this.player.pos.y + 1), { count: 50, scale: 1.5 });
      this.fx.ring(this.player.pos, { color: '#9b5cff', radius: 8 });
      audio.sfx('revive');
      void narrate({ third: '{name} volvió a abrir los ojos. Otra vez.', first: 'Volví a abrir los ojos. Otra vez.' }, { position: 'bottom' });
    } else if (!W().intro) {
      W().intro = true;
      setTimeout(() => {
        if (engine.sceneId !== 'overworld') return;
        void narrate({ third: 'El mundo no sabía que {name} seguía vivo. Todavía.', first: 'El mundo no sabía que yo seguía vivo. Todavía.' }, { position: 'bottom' });
        toast('Muévete con <b>WASD</b> o haz <b>clic</b> en el mapa. <b>Clic derecho</b> + arrastrar para girar la cámara.', { kind: 'info', duration: 7 });
        toast('Acércate a un lugar y pulsa <b>E</b> para entrar. <b>Espacio</b> pausa el tiempo.', { kind: 'info', duration: 7 });
      }, 900);
    }
    if (p.focus && LOCATIONS[p.focus]) { const f = LOCATIONS[p.focus].pos; this.rig.follow(tmpV.set(f.x, 0, f.z), true); }
    saveRun();
  }

  private offKey: (() => void) | null = null;

  exit(): void {
    document.body.style.cursor = '';
    this.offKey?.(); this.offKey = null;
    this.scope.dispose();
    this.labels.clearBubbles();
    this.hud.unmount();
    this.labels.root.remove();
    this.polEl?.remove(); this.polEl = null;
    closePanel();
    this.dom?.remove(); this.dom = null;
    for (const a of ['rain', 'sea', 'wind', 'swamp', 'forest_dawn', 'night', 'fire'] as const) audio.ambience(a, false);
    if (G.hasRun) G.run.player.pos = { x: this.player.pos.x, z: this.player.pos.z };
  }

  resize(): void { /* labels use engine.width/height each frame */ }

  // ───────────────────────── input ─────────────────────────
  /** Anything modal on screen (dialogue, modals, loot, pause menu, any module's side panel) freezes the map. */
  private blocked(): boolean {
    return this.busy || dialogue.open || engine.paused || layer('panel').childElementCount > 0
      || !!document.querySelector('.lx-modal-back, .lx-loot, .st-pageback');
  }

  private onKey(e: KeyboardEvent): void {
    if (engine.sceneId !== 'overworld') return;
    if ((e.code === 'KeyJ' && panelOpen('quests')) || (e.code === 'KeyU' && panelOpen('army'))) { closePanel(); return; }
    if (this.blocked()) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    switch (e.code) {
      case 'Space': case 'KeyP': e.preventDefault(); { const pz = togglePause(); audio.sfx(pz ? 'ui_close' : 'ui_open', { volume: 0.5 }); } break;
      case 'Digit1': setSpeed(1); break;
      case 'Digit2': setSpeed(2); break;
      case 'Digit3': setSpeed(4); break;
      case 'Tab': e.preventDefault(); this.safe(() => openCodex()); break;
      case 'KeyI': this.safe(() => openRelics()); break;
      case 'KeyJ': openQuestPanel((id) => this.travelTo(id)); break;
      case 'KeyU': openArmyPanel(); break;
      case 'KeyM': this.togglePolitical(); break;
      case 'KeyV': this.castVeil(); break;
      case 'KeyL': if (G.run.player.books?.realidad) this.safe(() => void openRealityBook()); break;
      case 'KeyE': case 'KeyF': { const n = this.nearLocation(); if (n) this.enterLocation(n); break; }
      case 'Escape':
        if (this.political && !panelOpen()) { e.preventDefault(); this.togglePolitical(); }
        break;
      default: break;
    }
  }

  private onLocationClick(id: string): void {
    if (this.blocked()) return;
    const def = LOCATIONS[id];
    const d = Math.hypot(def.pos.x - this.player.pos.x, def.pos.z - this.player.pos.z);
    if (d < ENTER_RADIUS + 1) { this.enterLocation(id); return; }
    this.travelTo(id);
  }

  travelTo(id: string): void {
    const def = LOCATIONS[id];
    if (!def) return;
    this.player.setTarget(def.pos.x, def.pos.z + 1.2);
    this.player.targetLoc = id;
    this.showMarker(def.pos.x, def.pos.z + 1.2);
    if (isPaused()) setPaused(false);
    audio.sfx('ui_confirm', { volume: 0.4 });
  }

  private showMarker(x: number, z: number): void {
    this.marker.position.set(x, surfaceAt(x, z) + 0.12, z);
    this.marker.visible = true;
    this.marker.scale.setScalar(1.6);
    this.fx.ring(this.marker.position, { color: '#b27dff', radius: 2.2, duration: 0.5 });
  }

  /** Ray-march the heightfield under the mouse. */
  private pickGround(nx: number, ny: number, out: THREE.Vector3): boolean {
    ndc.set(nx, ny);
    ray.setFromCamera(ndc, this.camera);
    const o = ray.ray.origin, d = ray.ray.direction;
    let tPrev = 0, t = 0;
    const maxT = 900;
    let step = 2;
    while (t < maxT) {
      t += step;
      const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
      if (y <= surfaceAt(x, z)) {
        let a = tPrev, b = t;
        for (let i = 0; i < 14; i++) { const m = (a + b) / 2; const my = o.y + d.y * m; if (my <= surfaceAt(o.x + d.x * m, o.z + d.z * m)) b = m; else a = m; }
        out.set(o.x + d.x * b, 0, o.z + d.z * b);
        out.y = surfaceAt(out.x, out.z);
        return true;
      }
      tPrev = t;
      step = Math.min(6, 1 + t * 0.02);
    }
    return false;
  }

  private screenOf(p: THREE.Vector3): { x: number; y: number; ok: boolean } {
    tmpV2.copy(p).project(this.camera);
    return { x: (tmpV2.x * 0.5 + 0.5) * engine.width, y: (-tmpV2.y * 0.5 + 0.5) * engine.height, ok: tmpV2.z < 1 };
  }

  private partyUnderMouse(): string | null {
    let best: string | null = null, bd = 30;
    const mx = input.mouse.x, my = input.mouse.y;
    for (const p of W().parties) {
      if (!this.pview.pos(p.id, tmpV)) continue;
      tmpV.y += 0.9;
      const s = this.screenOf(tmpV);
      if (!s.ok) continue;
      const d = Math.hypot(s.x - mx, s.y - my);
      if (d < bd) { bd = d; best = p.id; }
    }
    return best;
  }

  private locationUnderMouse(): string | null {
    if (this.labels.hoverLoc) return this.labels.hoverLoc;
    let best: string | null = null, bd = 44;
    const mx = input.mouse.x, my = input.mouse.y;
    for (const l of LOCATION_LIST) {
      const s = this.screenOf(tmpV.set(l.pos.x, locationHeight(l.id) + 1.5, l.pos.z));
      if (!s.ok) continue;
      const d = Math.hypot(s.x - mx, s.y - my);
      if (d < bd) { bd = d; best = l.id; }
    }
    return best;
  }

  private nearLocation(): string | null {
    let best: string | null = null, bd = ENTER_RADIUS;
    for (const l of LOCATION_LIST) {
      const d = Math.hypot(l.pos.x - this.player.pos.x, l.pos.z - this.player.pos.z);
      if (d < bd) { bd = d; best = l.id; }
    }
    return best;
  }

  private handleInput(): void {
    // camera: RMB drag rotates, wheel zooms
    if (input.mouse.buttons[2] && !input.mouse.overUI) {
      this.rig.yaw -= input.mouse.dx * 0.006;
      this.rig.pitch = THREE.MathUtils.clamp(this.rig.pitch + input.mouse.dy * 0.004, 0.55, 1.35);
      this.dragging = true;
    } else this.dragging = false;
    if (input.mouse.wheel) this.rig.zoom(input.mouse.wheel * 1.4);
    if (this.blocked()) return;
    if (input.mousePressed(0)) {
      const party = this.partyUnderMouse();
      if (party) {
        this.player.stop();
        this.player.targetParty = party;
        if (isPaused()) setPaused(false);
        audio.sfx('ui_confirm', { volume: 0.4 });
        return;
      }
      const loc = this.locationUnderMouse();
      if (loc) { this.onLocationClick(loc); return; }
      if (this.pickGround(input.mouse.nx, input.mouse.ny, tmpV)) {
        this.player.setTarget(tmpV.x, tmpV.z);
        this.showMarker(tmpV.x, tmpV.z);
        if (isPaused()) setPaused(false);
      }
    }
  }

  // ───────────────────────── update (world time) ─────────────────────────
  update(dt: number): void {
    if (!G.hasRun || !this.built) return;
    this.handleInput();
    const scale = this.blocked() ? 0 : isPaused() ? 0 : W().speed;
    const wdt = dt * scale;
    // movement wish (camera relative)
    let wish: { x: number; z: number } | null = null;
    if (!this.blocked()) {
      const mv = input.moveVector();
      if (mv.x || mv.y) {
        const y = this.rig.yaw;
        const fx = -Math.sin(y), fz = -Math.cos(y), rx = Math.cos(y), rz = -Math.sin(y);
        wish = { x: fx * mv.y + rx * mv.x, z: fz * mv.y + rz * mv.x };
        this.marker.visible = false;
        if (isPaused()) setPaused(false);
      }
    }
    // intercept a party
    const tp = getParty(this.player.targetParty);
    if (tp && !wish) { this.player.target = { x: tp.x, z: tp.z }; this.player.targetParty = tp.id; }
    else if (!tp && this.player.targetParty) this.player.targetParty = null;

    if (wdt > 0) {
      const ev = this.player.step(wdt, wish);
      if (ev === 'embark') {
        audio.sfx('splash');
        this.fx.emit('dust', tmpV.copy(this.player.pos).setY(0.3), { color: '#dff8ff', color2: '#9fd8ff', count: 18 });
        toast(this.player.boat === 2 ? 'Zarpas en un barco del puerto. <b>Rápido</b>.' : 'Tomas un bote de remos.', { kind: 'info', duration: 2.2 });
      } else if (ev === 'land') { audio.sfx('step_grass'); }
      advanceTime(wdt);
      this.regen(wdt);
      const w = W();
      if (w.veilT > 0) {
        w.veilT = Math.max(0, w.veilT - wdt);
        G.run.flags.velo_active = w.veilT > 0;
        if (w.veilT === 0) { audio.sfx('invisibility_off'); engine.pipeline.setDesat(0); }
      }
      // parties
      const contact = updateParties(wdt, {
        x: this.player.pos.x, z: this.player.pos.z, vx: this.player.vx, vz: this.player.vz,
        hidden: w.veilT > 0, power: totalPower(), targetParty: this.player.targetParty,
      });
      if (contact) this.startEncounter(contact);
      // arrive at a location target
      if (this.player.targetLoc) {
        const def = LOCATIONS[this.player.targetLoc];
        if (def && Math.hypot(def.pos.x - this.player.pos.x, def.pos.z - this.player.pos.z) < ENTER_RADIUS - 1) {
          const id = this.player.targetLoc;
          this.player.stop();
          this.enterLocation(id);
        }
      }
      G.run.player.pos.x = this.player.pos.x; G.run.player.pos.z = this.player.pos.z;
    }
    const moving = wdt > 0 && this.player.speed > 0;
    if (moving) {
      this.trailT -= dt;
      if (this.trailT <= 0) {
        this.trailT = 0.12;
        this.fx.emit('arcane', tmpV.copy(this.player.pos).setY(this.player.pos.y + 0.4), { count: 2, scale: 0.6, life: 0.7 });
      }
      this.stepT -= dt * scale;
      if (this.stepT <= 0 && !this.player.onWater) { this.stepT = 0.42; audio.sfx('step_grass', { volume: 0.12, pitch: 0.9 + Math.random() * 0.2 }); }
    }
    if (!moving && this.wasMoving && !this.player.target) this.marker.visible = false;
    this.wasMoving = moving;
  }

  private regen(wdt: number): void {
    const w = W();
    const lunas = wdt / LUNA_SECONDS;
    const p = G.run.player;
    let mm = p.manaMax;
    try { mm = maxMana(); } catch { /* stub */ }
    w.acc.mana += mm * 1.6 * lunas;
    w.acc.hp += p.hpMax * 0.8 * lunas;
    if (w.acc.mana >= 1) { const n = Math.floor(w.acc.mana); w.acc.mana -= n; if (p.mana < p.manaMax) res.add('mana', n); }
    if (w.acc.hp >= 1) { const n = Math.floor(w.acc.hp); w.acc.hp -= n; if (p.hp < p.hpMax) res.add('hp', n); }
  }

  private async startEncounter(p: PartyState): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.player.stop();
    this.marker.visible = false;
    closePanel();
    track('encounters');
    try {
      const outcome = await openEncounter(p, {
        night: this.night > 0.5,
        onWater: this.player.onWater,
        pushAway: (fx, fz, dist) => {
          const dx = this.player.pos.x - fx, dz = this.player.pos.z - fz;
          const l = Math.hypot(dx, dz) || 1;
          const nx = this.player.pos.x + (dx / l) * dist, nz = this.player.pos.z + (dz / l) * dist;
          this.player.pos.set(nx, surfaceAt(nx, nz), nz);
          this.fx.emit('smoke', tmpV.copy(this.player.pos).setY(this.player.pos.y + 0.8), { count: 16 });
        },
      });
      if (outcome !== 'battle') { this.player.targetParty = null; }
    } catch (err) {
      console.error('[overworld] encounter failed', err);
    } finally {
      this.busy = false;
    }
  }

  enterLocation(id: string): void {
    if (this.busy) return;
    const def = LOCATIONS[id];
    if (!def) return;
    this.busy = true;
    this.player.stop();
    this.marker.visible = false;
    G.run.player.pos = { x: this.player.pos.x, z: this.player.pos.z };
    G.run.player.location = id;
    W().lastLocation = id;
    audio.sfx('door');
    this.fx.emit('magic', tmpV.set(def.pos.x, locationHeight(id) + 2, def.pos.z), { count: 30, scale: 1.4 });
    void engine.goto('location', { id }, { fade: 0.5 }).finally(() => { this.busy = false; });
  }

  private castVeil(): void {
    const p = G.run.player;
    if (!p.codex?.velo?.acquired) { toast('Todavía no conoces el <b>Velo</b>.', { kind: 'bad' }); return; }
    const w = W();
    if (w.veilT > 0) return;
    if (!res.spend('mana', 25)) { toast('No te alcanza el maná (25).', { kind: 'bad' }); audio.sfx('ui_error'); return; }
    w.veilT = 22;
    G.run.flags.velo_active = true;
    audio.sfx('invisibility_on');
    engine.pipeline.setDesat(0.45);
    engine.pipeline.chromaticPulse(0.7, 0.5);
    this.fx.emit('shadow', tmpV.copy(this.player.pos).setY(this.player.pos.y + 1), { count: 30 });
    track('invisible_seconds', 22);
    toast('Velo: nadie te ve durante un rato.', { kind: 'epica' });
  }

  private togglePolitical(mode?: PoliticalMode): void {
    const next: PoliticalMode = mode !== undefined ? mode : this.political ? null : 'corrupcion';
    this.political = next;
    this.labels.political = next;
    this.labels.refreshBadges();
    this.polEl?.remove(); this.polEl = null;
    if (next && this.dom) {
      this.polEl = politicalLegend(next, (m) => this.togglePolitical(m));
      this.dom.appendChild(this.polEl);
      audio.sfx('page_turn');
    }
    this.applyPoliticalColors();
  }

  private applyPoliticalColors(): void {
    const cols = WORLD_U.uPolCol.value;
    for (let i = 0; i < CONT_ORDER.length; i++) {
      const c = CONT_ORDER[i];
      const st = G.run.continents[c];
      if (this.political === 'corrupcion') heatColor(st?.corruption ?? 0, cols[i]);
      else if (this.political === 'miedo') {
        const locs = LOCATION_LIST.filter((l) => l.continent === c);
        const f = locs.reduce((s, l) => s + (G.run.locations[l.id]?.fear ?? 0), 0) / Math.max(1, locs.length);
        cols[i].setHSL((270 - f * 2.7) / 360, 0.6, 0.55);
      } else {
        const locs = LOCATION_LIST.filter((l) => l.continent === c);
        const mine = locs.filter((l) => G.run.locations[l.id]?.control === 'excepcion').length / Math.max(1, locs.length);
        cols[i].set(c === 'concordia' ? '#f3ead8' : ['#c0392b', '#3fa05a', '#e8742a', '#8a5ad0', '#1fb5a8'][i]).lerp(new THREE.Color('#9b5cff'), mine);
      }
    }
  }

  private onLunaTick(): void {
    this.locs.syncControl();
    updateHubs(G.run, LOCATION_LIST);
    this.labels.refreshBadges();
    if (this.political) this.applyPoliticalColors();
    audio.sfx('bell', { volume: 0.18, pitch: 1.4 });
  }

  // ───────────────────────── visuals (real time) ─────────────────────────
  lateUpdate(realDt: number): void {
    if (!this.built || !G.hasRun) return;
    this.t += realDt;
    const t = this.t;
    // camera
    const zoomT = THREE.MathUtils.clamp((this.rig.distance - 16) / 150, 0, 1);
    if (!this.dragging) this.rig.pitch += ((0.72 + zoomT * 0.42) - this.rig.pitch) * (1 - Math.exp(-2.5 * realDt));
    this.rig.follow(this.player.pos);
    this.rig.update(realDt);
    const camDist = this.camera.position.distanceTo(this.rig.focus);
    this.sky.fog.near = camDist * 1.3 + 30;
    this.sky.fog.far = camDist * 4.2 + 180;
    const sh = THREE.MathUtils.clamp(camDist * 0.72, 34, 100);
    const sc = this.sky.sun.shadow.camera;
    if (Math.abs(sc.right - sh) > 2) { sc.left = -sh; sc.right = sh; sc.top = sh; sc.bottom = -sh; sc.updateProjectionMatrix(); }
    // time of day (the diorama keeps a high sun: short, readable shadows)
    const phaseT = skyTime();
    this.sky.shadowTarget.copy(this.rig.focus);
    this.sky.setTime(phaseT);
    {
      const sp = this.sky.sun.position, tg = this.sky.sun.target.position;
      tmpV.copy(sp).sub(tg).normalize();
      if (tmpV.y < 0.66) { tmpV.y = 0.66; tmpV.normalize(); sp.copy(tg).addScaledVector(tmpV, 150); }
      // strategy-map readability: nights and dusks stay moody but never murky
      this.sky.sun.intensity = Math.max(this.sky.sun.intensity, 0.85);
      this.sky.hemi.intensity = Math.max(this.sky.hemi.intensity, 0.9);
    }
    this.sky.update(realDt, this.camera, t);
    this.night = nightFactor();
    // corruption uniforms
    const corr = WORLD_U.uCorr.value;
    for (let i = 0; i < CONT_ORDER.length; i++) {
      const target = (G.run.continents[CONT_ORDER[i]]?.corruption ?? 0) / 100;
      corr[i] += (target - corr[i]) * (1 - Math.exp(-1.5 * realDt));
    }
    WORLD_U.uTime.value = t;
    WORLD_U.uNight.value = this.night;
    WORLD_U.uPolitical.value += ((this.political ? 1 : 0) - WORLD_U.uPolitical.value) * (1 - Math.exp(-6 * realDt));
    const wm = this.terrain.waterMat.uniforms;
    wm.uTimeW.value = t; wm.uNightW.value = this.night;
    (wm.uSunDir.value as THREE.Vector3).copy(this.sky.sun.position).sub(this.sky.sun.target.position).normalize();
    (wm.uSunCol.value as THREE.Color).copy(this.sky.sun.color);
    (wm.uSky.value as THREE.Color).copy(this.sky.fog.color);
    (this.whirl.material as THREE.ShaderMaterial).uniforms.uTime.value = t;
    // world bits
    const vh = engine.height * engine.dpr();
    this.locs.update(realDt, t, this.night, vh);
    this.flags.update(t, this.night);
    this.cloudLit.copy(this.sky.fog.color).lerp(WHITE, 0.65);
    this.clouds.update(realDt, 1.4, this.cloudLit, this.sky.hemi.color, 0.55 + zoomT * 0.45);
    this.weather.update(t, this.rig.focus, W().weather, this.night, vh);
    this.storm(realDt);
    this.birds.update(realDt, t, this.night < 0.4);
    this.fx.update(realDt);
    // player & parties
    const timeK = this.blocked() || isPaused() ? 0 : W().speed;
    const visSpeed = this.player.speed * timeK;
    this.player.hidden = W().veilT > 0;
    this.player.animate(realDt, visSpeed, t);
    this.pview.draw(realDt, t, timeK, this.player);
    // Elias's aura ring (readability from far away)
    {
      const water = this.player.onWater;
      const zs = (1 + zoomT * 1.6) * (1 + Math.sin(t * 2.4) * 0.06) * (water ? 1.5 : 1);
      conformRing(this.aura.geometry, this.player.pos.x, this.player.pos.z, 0.9 * zs, 1.22 * zs, t * 0.6);
      (this.aura.material as THREE.MeshBasicMaterial).opacity = this.player.hidden ? 0.25 : 0.55 + zoomT * 0.35;
    }
    // marker
    if (this.marker.visible) {
      this.marker.scale.setScalar(1 + Math.sin(t * 6) * 0.12);
      this.marker.rotation.y += realDt * 1.5;
    }
    // hover
    this.updateHover();
    // labels & HUD
    this.badgeT -= realDt;
    if (this.badgeT <= 0) { this.badgeT = 0.6; this.labels.refreshBadges(); }
    this.labels.update(this.camera, engine.width, engine.height, camDist, this.rig.focus, W().parties, (p) => this.partyWorldPos(p.id), this.player.pos);
    this.labels.updateTracker(this.camera, engine.width, engine.height, t);
    this.hud.update(realDt);
    const near = this.busy ? null : this.nearLocation();
    this.hud.setPrompt(near ? `<span class="lx-kbd">E</span> Entrar a <b>${LOCATIONS[near].name}</b>` : isPaused() ? '<b>En pausa</b> · <span class="lx-kbd">Espacio</span> para continuar' : null);
    // ambience: idle barks near Elias, relic sparkles, music
    this.barkT -= realDt;
    if (this.barkT <= 0) { this.barkT = 5 + Math.random() * 6; this.randomBark(); }
    this.relicFxT -= realDt;
    if (this.relicFxT <= 0) { this.relicFxT = 1.1; this.relicSparkles(); }
    this.musicT -= realDt;
    if (this.musicT <= 0) { this.musicT = 1.5; this.updateMusic(false); }
  }

  /** Storms over Sylvaria and the Islas: lightning bolts, a white flash, thunder a moment later. */
  private storm(realDt: number): void {
    const wx = W().weather;
    const c = continentAt(this.rig.focus.x, this.rig.focus.z);
    if (wx.storm < 0.6 || (c !== 'sylvaria' && c !== 'islas')) return;
    this.stormT -= realDt;
    if (this.stormT > 0) return;
    this.stormT = 3 + Math.random() * 6;
    const gx = this.rig.focus.x + (Math.random() - 0.5) * 50, gz = this.rig.focus.z + (Math.random() - 0.5) * 50;
    const ground = tmpV.set(gx, surfaceAt(gx, gz), gz);
    this.fx.bolt(tmpV2.set(gx + (Math.random() - 0.5) * 6, 38, gz + (Math.random() - 0.5) * 6), ground.clone(), { color: '#e8f0ff', width: 0.35, segments: 9, duration: 0.25 });
    this.fx.flash(ground, { color: '#dfe8ff', radius: 5, duration: 0.3 });
    engine.pipeline.flash('#e8eeff', 0.28, 0.22);
    const dist = Math.hypot(gx - this.player.pos.x, gz - this.player.pos.z);
    setTimeout(() => audio.sfx('thunder', { volume: Math.max(0.25, 1 - dist / 80) }), 250 + dist * 12);
  }

  private partyWorldPos(id: string): THREE.Vector3 | null { return this.pview.pos(id); }

  private updateHover(): void {
    if (this.blocked() || input.mouse.overUI) { this.hud.setHover(null); return; }
    const pid = this.partyUnderMouse();
    this.labels.hoverParty = pid;
    if (pid) {
      const p = getParty(pid);
      if (p) { this.hud.setHover(partyTooltip(p) + '<br><span class="lx-muted lx-small">Clic: interceptar</span>', input.mouse.x, input.mouse.y); document.body.style.cursor = 'crosshair'; return; }
    }
    const lid = this.locationUnderMouse();
    if (lid) {
      const def = LOCATIONS[lid];
      const st = G.run.locations[lid];
      const d = Math.round(Math.hypot(def.pos.x - this.player.pos.x, def.pos.z - this.player.pos.z));
      this.hud.setHover(`<b>${def.name}</b><br><span class="lx-muted">${def.desc}</span><br>${st?.visited ? '' : '<i class="lx-violet">Sin visitar</i> · '}a ${d} pasos`, input.mouse.x, input.mouse.y);
      document.body.style.cursor = 'pointer';
      return;
    }
    this.hud.setHover(null);
    document.body.style.cursor = '';
  }

  private randomBark(): void {
    const near = W().parties.filter((p) => Math.hypot(p.x - this.player.pos.x, p.z - this.player.pos.z) < 22 && p.state !== 'chase');
    if (!near.length) return;
    const p = near[Math.floor(Math.random() * near.length)];
    const txt = idleBark(p);
    if (txt) this.labels.bark(txt, () => this.partyWorldPos(p.id), false, 2.8);
  }

  private relicSparkles(): void {
    for (const l of LOCATION_LIST) {
      const st = G.run.locations[l.id];
      if (!st?.relic || st.explored || !(st.visited || st.flags.relicKnown || G.run.flags.brujula)) continue;
      if (Math.hypot(l.pos.x - this.rig.focus.x, l.pos.z - this.rig.focus.z) > 70) continue;
      this.fx.emit('stars', tmpV.set(l.pos.x, locationHeight(l.id) + 3.5, l.pos.z), { count: 3, color: '#e0a8ff', color2: '#ffe38a', scale: 1.4 });
    }
    // violet haze over corrupted places
    for (const l of LOCATION_LIST) {
      const st = G.run.locations[l.id];
      if (st?.control !== 'excepcion' || l.id === 'crater') continue;
      if (Math.hypot(l.pos.x - this.rig.focus.x, l.pos.z - this.rig.focus.z) > 70) continue;
      this.fx.emit('shadow', tmpV.set(l.pos.x + (Math.random() - 0.5) * 4, locationHeight(l.id) + 1.5, l.pos.z + (Math.random() - 0.5) * 4), { count: 2, scale: 1.8 });
    }
  }

  private updateMusic(force: boolean): void {
    const c = continentAt(this.player.pos.x, this.player.pos.z);
    const water = this.player.onWater;
    const night = this.night > 0.5;
    const key = `${c}|${night}|${water}`;
    if (!force && key === this.lastRegion) return;
    this.lastRegion = key;
    audio.music(night ? 'overworld_night' : 'overworld', { region: c as Region });
    const wx = W().weather;
    audio.ambience('sea', water || this.distToCoast() < 6, 0.5);
    audio.ambience('rain', c === 'sylvaria' && wx.rain > 0.45, 0.5);
    audio.ambience('wind', c === 'kharaz' || c === 'concordia', 0.35);
    audio.ambience('swamp', c === 'morvenna', 0.45);
    audio.ambience('forest_dawn', c === 'sylvaria' && !night, 0.35);
    audio.ambience('night', night, 0.35);
  }

  private distToCoast(): number {
    const x = this.player.pos.x, z = this.player.pos.z;
    for (let r = 2; r <= 10; r += 2) for (let a = 0; a < 8; a++) {
      const ang = (a / 8) * Math.PI * 2;
      if (heightAt(x + Math.cos(ang) * r, z + Math.sin(ang) * r) < 0) return r;
    }
    return 99;
  }
}

registerScene('overworld', () => new OverworldScene());
