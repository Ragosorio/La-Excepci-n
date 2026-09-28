/**
 * 3D backdrop of a location: the real surroundings from the world heightfield (zoomed ×S), the location's model
 * (and neighbours inside the window), vegetation, water, sky, and a handful of townsfolk rigs living their lives.
 */
import * as THREE from 'three';
import type { JobId, LocationDef, RaceId } from '../../data/types';
import { LOCATION_LIST } from '../../data/world';
import { G } from '../../core/state';
import { Rng, rng } from '../../core/rng';
import { Sky } from '../../render/sky';
import { Fx } from '../../render/fx';
import { buildCharacter, type CharacterRig } from '../../characters/rig';
import { heightAt, locationHeight, CONT_ORDER } from '../../systems/world/geo';
import { skyTime, nightFactor } from '../../systems/world/time';
import { buildTerrainMesh, waterMaterial } from '../overworld/terrain';
import { LocationMeshes, whirlpool } from '../overworld/locations3d';
import { PropField } from '../overworld/props';
import { FlagField } from '../overworld/flags';
import { WORLD_U, updateHubs } from '../overworld/shaders';
import { MAP_MIN, MAP_SIZE } from '../../systems/world/geo';

export const S = 2.6;      // local units per map unit
const HALF = 17;           // map units shown around the location

interface Walker { rig: CharacterRig; target: THREE.Vector3; wait: number; speed: number; scared: number; home: THREE.Vector3 }

const JOB_BY_SERVICE: Partial<Record<string, JobId[]>> = {
  sedas: ['cortesana', 'cortesana', 'espia'], casino: ['crupier', 'crupier', 'noble', 'banquero'], banca: ['banquero'], templo: ['sacerdote', 'monje', 'curandero'],
  academia: ['estudiante', 'hechicero', 'erudito'], forja: ['herrero', 'minero'], puerto: ['pirata', 'capitan', 'mercader'], reclutar: ['soldado', 'guerrero', 'arquero'],
  mercado: ['mercader', 'campesino'], taberna: ['tabernero', 'bardo'], arena: ['guerrero', 'crupier'], concilio: ['delegado', 'guardian', 'noble'],
};

export class LocationDiorama {
  readonly scene = new THREE.Scene();
  readonly sky: Sky;
  readonly fx: Fx;
  readonly focus = new THREE.Vector3();
  readonly walkers: Walker[] = [];
  private flags: FlagField;
  private models: LocationMeshes;
  private water: THREE.Mesh;
  private waterMat: THREE.ShaderMaterial;
  private terrain: THREE.Mesh;
  private props: PropField;
  private whirl: THREE.Mesh | null = null;
  private t = 0;
  readonly baseY: number;

  constructor(readonly def: LocationDef) {
    const cx = def.pos.x, cz = def.pos.z;
    this.baseY = locationHeight(def.id) * S;
    this.focus.set(0, this.baseY + 3.2, 0);
    // corruption uniforms right now (no easing in here)
    for (let i = 0; i < CONT_ORDER.length; i++) WORLD_U.uCorr.value[i] = (G.run.continents[CONT_ORDER[i]]?.corruption ?? 0) / 100;
    WORLD_U.uPolitical.value = 0;
    WORLD_U.uMapXf.value.set(1 / S, cx, cz);
    updateHubs(G.run, LOCATION_LIST);

    this.sky = new Sky(this.scene, { radius: 900, fogNear: 70, fogFar: 300, clouds: 5, cloudHeight: 70, cloudSpread: 200, shadowSize: 46 });
    this.sky.setTime(skyTime());
    this.fx = new Fx(this.scene, 2500);
    this.terrain = buildTerrainMesh({ cx, cz, half: HALF, step: 0.25, scale: S });
    this.scene.add(this.terrain);
    this.waterMat = waterMaterial(new THREE.Vector4((MAP_MIN - cx) * S, (MAP_MIN - cz) * S, MAP_SIZE * S, 0));
    this.water = new THREE.Mesh(new THREE.PlaneGeometry(900, 900).rotateX(-Math.PI / 2), this.waterMat);
    this.water.renderOrder = 2;
    this.scene.add(this.water);
    this.flags = new FlagField(80, 0.95, 0.58);
    this.scene.add(this.flags.mesh);
    const places = LOCATION_LIST.filter((l) => Math.hypot(l.pos.x - cx, l.pos.z - cz) < HALF + 2).map((l) => ({
      def: l, x: (l.pos.x - cx) * S, y: locationHeight(l.id) * S, z: (l.pos.z - cz) * S, yaw: 0, scale: S,
    }));
    this.models = new LocationMeshes(places, this.flags, { outline: 0.02 });
    this.scene.add(this.models.group);
    this.props = new PropField({ cx, cz, half: HALF, scale: S, clearRadius: 7.2 });
    this.scene.add(this.props.group);
    if (def.id === 'arena_remolino') {
      this.whirl = whirlpool(4.8 * S, 10 * S);
      this.whirl.position.set(0, 0.1, 0);
      this.scene.add(this.whirl);
    }
    this.spawnTownsfolk();
  }

  private spawnTownsfolk(): void {
    const def = this.def;
    const races = Object.entries(def.races) as Array<[RaceId, number]>;
    if (!races.length || def.id === 'crater') return;
    const r = new Rng(`folk:${def.id}:${G.run.luna}`);
    const jobs: JobId[] = ['campesino', 'mercader', 'soldado', 'noble', 'bardo', 'herrero'];
    for (const s of def.services) for (const j of JOB_BY_SERVICE[s] ?? []) jobs.push(j, j);
    const n = def.kind === 'ruina' ? 0 : def.kind === 'aldea' ? 5 : 6;
    for (let i = 0; i < n; i++) {
      const race = r.weighted(races, ([, w]) => w)[0];
      let job = r.pick(jobs);
      if (race === 'bruja' && r.chance(0.5)) job = 'hechicero';
      const gender = r.chance(job === 'cortesana' ? 0.9 : 0.45) ? 'f' : 'm';
      const rig = buildCharacter({ seed: `${def.id}:${i}:${G.run.luna}`, race, job, gender, age: r.chance(0.12) ? 'old' : 'adult' });
      const home = this.randomSpot(r);
      rig.root.position.copy(home);
      rig.root.rotation.y = r.range(0, Math.PI * 2);
      this.scene.add(rig.root);
      rig.root.traverse((o) => { if ((o as THREE.Mesh).isMesh && !o.userData.isOutline) o.castShadow = true; });
      this.walkers.push({ rig, target: this.randomSpot(r), wait: r.range(0, 4), speed: r.range(1.1, 1.8), scared: 0, home });
    }
  }

  /** A point on the plaza ring around the model, on dry ground. */
  randomSpot(r: Rng = rng): THREE.Vector3 {
    for (let k = 0; k < 20; k++) {
      const a = r.range(-Math.PI * 0.85, Math.PI * 0.85);        // mostly in front of the camera side (+z)
      const d = r.range(5.4, 8.8) * S;
      const x = Math.sin(a) * d, z = Math.cos(a) * d;
      const h = heightAt(this.def.pos.x + x / S, this.def.pos.z + z / S);
      if (h > 0.25) return new THREE.Vector3(x, h * S, z);
    }
    return new THREE.Vector3(0, this.baseY, 6 * S);
  }

  groundY(x: number, z: number): number { return Math.max(0, heightAt(this.def.pos.x + x / S, this.def.pos.z + z / S)) * S; }

  /** Everyone flinches / flees (terror), or reacts with an expression. */
  react(kind: 'terror' | 'mind' | 'cheer' | 'coins' | 'calm'): void {
    for (const w of this.walkers) {
      if (kind === 'terror') { w.scared = 6; w.rig.setExpression('scared'); const away = w.rig.root.position.clone().setY(0).normalize().multiplyScalar(13 * S); w.target.set(away.x, this.groundY(away.x, away.z), away.z); w.wait = 0; }
      else if (kind === 'mind') { w.rig.setExpression('mind'); w.rig.setEyeGlow('#ff7bf0'); w.rig.pose = 'idle'; w.wait = 5; }
      else if (kind === 'cheer') { w.rig.play('cheer', 1.2); w.rig.setExpression('happy'); }
      else if (kind === 'coins') { w.rig.play('point', 0.8); w.rig.setExpression('happy'); }
      else { w.rig.setExpression('neutral'); w.rig.setEyeGlow(null); }
    }
  }

  update(dt: number, camera: THREE.Camera): void {
    this.t += dt;
    const night = nightFactor();
    this.sky.setTime(skyTime());
    this.sky.shadowTarget.copy(this.focus);
    this.sky.update(dt, camera, this.t);
    WORLD_U.uTime.value = this.t; WORLD_U.uNight.value = night;
    const wm = this.waterMat.uniforms;
    wm.uTimeW.value = this.t; wm.uNightW.value = night;
    (wm.uSunDir.value as THREE.Vector3).copy(this.sky.sun.position).sub(this.sky.sun.target.position).normalize();
    (wm.uSunCol.value as THREE.Color).copy(this.sky.sun.color);
    (wm.uSky.value as THREE.Color).copy(this.sky.fog.color);
    if (this.whirl) (this.whirl.material as THREE.ShaderMaterial).uniforms.uTime.value = this.t;
    this.models.update(dt, this.t, night, window.innerHeight * (window.devicePixelRatio || 1));
    this.flags.update(this.t, night);
    this.fx.update(dt);
    for (const w of this.walkers) {
      const p = w.rig.root.position;
      if (w.scared > 0) w.scared -= dt;
      if (w.wait > 0) { w.wait -= dt; w.rig.update(dt, { speed: 0 }); continue; }
      const dx = w.target.x - p.x, dz = w.target.z - p.z;
      const d = Math.hypot(dx, dz);
      const sp = w.speed * (w.scared > 0 ? 3.2 : 1);
      if (d < 0.3) {
        w.wait = w.scared > 0 ? 0.5 : 1.5 + Math.random() * 5;
        w.target.copy(this.randomSpot());
        if (w.scared <= 0 && Math.random() < 0.3) w.rig.play(Math.random() < 0.5 ? 'point' : 'cheer', 0.9);
        if (w.scared <= 0) w.rig.setExpression('neutral');
        w.rig.update(dt, { speed: 0 });
        continue;
      }
      p.x += (dx / d) * sp * dt; p.z += (dz / d) * sp * dt;
      p.y = this.groundY(p.x, p.z);
      const yaw = Math.atan2(dx, dz);
      let dy = yaw - w.rig.root.rotation.y;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      w.rig.root.rotation.y += dy * Math.min(1, dt * 6);
      w.rig.update(dt, { speed: sp });
    }
  }

  dispose(): void {
    for (const w of this.walkers) w.rig.dispose();
    this.walkers.length = 0;
    this.models.dispose();
    this.flags.dispose();
    this.fx.dispose();
    this.sky.dispose();
    this.terrain.geometry.dispose();
    (this.terrain.material as THREE.Material).dispose();
    this.water.geometry.dispose();
    this.waterMat.dispose();
    this.props.group.traverse((o) => { const m = o as THREE.InstancedMesh; if (m.isInstancedMesh) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); m.dispose(); } });
    this.whirl?.geometry.dispose();
    this.scene.clear();
  }
}
