/**
 * Draws the living world's parties every frame: instanced little figures (or boats at sea), their banners,
 * Aurel as a real rig with Bruma trotting behind, decorative fishing boats, and Elias's escort.
 */
import * as THREE from 'three';
import { LOCATION_LIST } from '../../data/world';
import { UNITS } from '../../data/units';
import { G } from '../../core/state';
import { buildCharacter, type CharacterRig } from '../../characters/rig';
import { toon, outlineMaterial } from '../../render/toon';
import { heightAt, surfaceAt } from '../../systems/world/geo';
import { W } from '../../systems/world/state';
import { FigureField, RACE_SKIN, RACE_SCALE } from './figures';
import { FlagField } from './flags';
import { ModelBuilder, mergeColored, hullGeometry } from './modelKit';
import { TOKEN_SCALE, type PlayerToken } from './player';

interface PartyVis { x: number; z: number; yaw: number; phase: number; flag: number; walk: number; boat: boolean }
interface FishingBoat { cx: number; cz: number; r: number; a: number; sp: number; sail: string }

export class PartyView {
  private vis = new Map<string, PartyVis>();
  private aurelRig: CharacterRig | null = null;
  private bruma: THREE.Object3D;
  private fishing: FishingBoat[];
  private escortPhase = 0;

  constructor(private scene: THREE.Scene, private figures: FigureField, private flags: FlagField) {
    this.bruma = buildBruma();
    this.bruma.visible = false;
    scene.add(this.bruma);
    this.fishing = fishingSpots();
  }

  /** Forget every drawn party (new run / re-enter): frees their banner slots. */
  reset(): void {
    for (const v of this.vis.values()) this.flags.remove(v.flag);
    this.vis.clear();
  }

  forget(id: string): void {
    const v = this.vis.get(id);
    if (v) this.flags.remove(v.flag);
    this.vis.delete(id);
  }

  has(id: string): boolean { return this.vis.has(id); }

  /** Smoothed on-screen position of a party (labels, barks, picking). */
  pos(id: string, out = new THREE.Vector3()): THREE.Vector3 | null {
    const v = this.vis.get(id);
    if (!v) return null;
    return out.set(v.x, surfaceAt(v.x, v.z), v.z);
  }

  draw(realDt: number, t: number, timeK: number, player: PlayerToken): void {
    const f = this.figures;
    f.begin();
    const parties = W().parties;
    const aurel = parties.find((p) => p.kind === 'aurel');
    if (aurel && !this.aurelRig) {
      this.aurelRig = buildCharacter({ seed: 'aurel', race: 'humano', special: 'aurel' });
      this.aurelRig.root.scale.setScalar(TOKEN_SCALE * 1.05);
      this.aurelRig.root.traverse((o) => { if ((o as THREE.Mesh).isMesh && !o.userData.isOutline) o.castShadow = true; });
      this.aurelRig.setEyeGlow('#ffd36b');
      this.scene.add(this.aurelRig.root);
    } else if (!aurel && this.aurelRig) {
      this.aurelRig.dispose();
      this.aurelRig = null;
    }
    this.bruma.visible = false;
    for (const p of parties) {
      let v = this.vis.get(p.id);
      if (!v) {
        v = { x: p.x, z: p.z, yaw: 0, phase: Math.random() * 10, flag: this.flags.add(0, -999, 0, 0, 0.001, p.color, '#f0d890'), walk: 0, boat: false };
        this.vis.set(p.id, v);
      }
      const dx = p.x - v.x, dz = p.z - v.z;
      const moved = Math.hypot(dx, dz);
      v.x += dx * Math.min(1, realDt * 12); v.z += dz * Math.min(1, realDt * 12);
      if (moved > 0.002) v.yaw = dampAngle(v.yaw, Math.atan2(dx, dz), realDt * 8);
      const walking = moved > 0.002 && timeK > 0 ? 1 : 0;
      v.walk += (walking - v.walk) * Math.min(1, realDt * 6);
      v.phase += realDt * (6 + timeK * 2) * v.walk;
      const water = heightAt(v.x, v.z) < 0.08;
      v.boat = water;
      const skin = RACE_SKIN[p.race] ?? '#e8bf9c';
      const rs = RACE_SCALE[p.race] ?? 1;
      if (water) {
        f.addBoat(v.x, 0, v.z, v.yaw, 0.9 + p.size * 0.08, p.color, t + v.phase);
        this.flags.set(v.flag, v.x, 2.2, v.z, v.yaw + Math.PI / 2, 0.8);
      } else {
        const y = heightAt(v.x, v.z);
        const n = p.size;
        const c = Math.cos(v.yaw), s = Math.sin(v.yaw);
        const aurelHere = p.kind === 'aurel' && !!this.aurelRig;
        if (aurelHere && this.aurelRig) {
          const r = this.aurelRig;
          r.root.position.set(v.x, y, v.z);
          r.root.rotation.y = v.yaw;
          r.update(realDt, { speed: v.walk * 4.2 * Math.max(1, timeK) });
          const bx = v.x + c * 0.9 - s * 0.6, bz = v.z - s * 0.9 - c * 0.6;
          this.bruma.visible = true;
          this.bruma.position.set(bx, heightAt(bx, bz) + Math.abs(Math.sin(v.phase * 1.3)) * 0.12 * v.walk, bz);
          this.bruma.rotation.y = v.yaw;
        }
        for (let i = aurelHere ? 1 : 0; i < n; i++) {
          const row = Math.floor((i + 1) / 2), side = i === 0 ? 0 : i % 2 ? 1 : -1;
          const lx = side * 0.55, lz = -row * 0.75;
          const fx2 = v.x + lx * c + lz * s, fz2 = v.z - lx * s + lz * c;
          const leader = i === 0;
          const scale = (leader ? 0.95 : 0.8) * rs;
          const tunic = p.kind === 'aurel' ? '#f4f0e6' : p.kind === 'refugiados' ? '#8a7a5a' : i % 3 === 2 ? shadeHex(p.color, -0.15) : p.color;
          f.add(fx2, heightAt(fx2, fz2), fz2, v.yaw, scale, tunic, skin, v.walk, v.phase + i * 1.7, p.kind !== 'refugiados' && p.kind !== 'caravana');
        }
        if (p.kind === 'caravana') {
          // a porter hauling the cargo
          const bx = v.x - s * 1.1, bz = v.z - c * 1.1;
          f.add(bx, heightAt(bx, bz), bz, v.yaw, 0.9, '#8a6a42', '#b89a6a', v.walk, v.phase + 3, false);
        }
        this.flags.set(v.flag, v.x + s * -0.35 + c * 0.3, y + 1.9 * rs, v.z + c * -0.35 - s * 0.3, v.yaw + Math.PI / 2, 0.55);
      }
      this.flags.color(v.flag, p.kind === 'aurel' ? '#f4f0e6' : p.color, p.kind === 'aurel' ? '#ffd36b' : '#f0d890', 0);
    }
    if (aurel && this.aurelRig) this.aurelRig.root.visible = !(this.vis.get(aurel.id)?.boat);
    // decorative fishing boats around the ports
    for (const b of this.fishing) {
      b.a += realDt * b.sp * (timeK > 0 ? Math.min(2, timeK) : 0.3);
      const x = b.cx + Math.cos(b.a) * b.r, z = b.cz + Math.sin(b.a) * b.r;
      f.addBoat(x, 0, z, -b.a + (b.sp > 0 ? 0 : Math.PI), 0.7, b.sail, t + b.cx);
    }
    // Elias's escort: the first units of his army
    const army = G.run.player.army;
    const n = Math.min(4, army.length);
    if (n > 0 && !player.onWater) {
      const py = player.yaw, c = Math.cos(py), s = Math.sin(py);
      const walk = player.speed > 0 && timeK > 0 ? 1 : 0;
      this.escortPhase += realDt * 7 * walk;
      for (let i = 0; i < n; i++) {
        const u = UNITS[army[i].unitId];
        const lx = (i % 2 ? 1 : -1) * 0.9, lz = -1.2 - Math.floor(i / 2) * 0.9;
        const x = player.pos.x + lx * c + lz * s, z = player.pos.z - lx * s + lz * c;
        const race = u?.race ?? 'humano';
        f.add(x, heightAt(x, z), z, py, 0.85 * (RACE_SCALE[race] ?? 1), army[i].devoto ? '#6a3bc0' : '#2a2238', RACE_SKIN[race], walk, this.escortPhase + i * 1.9, true);
      }
    }
    f.end();
  }
}

/** Bruma: Aurel's calm white-gray dog. She always seems to be watching a normal sunrise. */
function buildBruma(): THREE.Object3D {
  const b = new ModelBuilder();
  b.box('#e8e6ea', [0, 0.32, 0], [0.26, 0.24, 0.52]);
  b.sphere('#f2f0f4', [0, 0.52, 0.3], 0.16);
  b.box('#d8d4dc', [0, 0.48, 0.44], [0.1, 0.08, 0.14]);
  b.sphere('#2a2230', [0, 0.49, 0.52], 0.035);
  b.box('#b8b2c0', [-0.09, 0.66, 0.26], [0.06, 0.12, 0.05], [0, 0, 0.3]);
  b.box('#b8b2c0', [0.09, 0.66, 0.26], [0.06, 0.12, 0.05], [0, 0, -0.3]);
  for (const [x, z] of [[-0.09, 0.17], [0.09, 0.17], [-0.09, -0.17], [0.09, -0.17]]) b.cyl('#dcd8e0', [x, 0, z], 0.035, 0.04, 0.24, 5);
  b.cyl('#dcd8e0', [0, 0.38, -0.3], 0.025, 0.04, 0.26, 5, [-0.9, 0, 0]);
  const geo = mergeColored(b.solid)!;
  const m = new THREE.Mesh(geo, toon('#ffffff', { vertexColors: true, bands: [0.55, 0.8, 1.0] }));
  m.castShadow = true;
  const o = new THREE.Mesh(hullGeometry(geo), outlineMaterial(0.03));
  o.userData.isOutline = true;
  m.add(o);
  m.scale.setScalar(1.25);
  return m;
}

/** Fishing boats circling a patch of open sea next to each port. */
function fishingSpots(): FishingBoat[] {
  const out: FishingBoat[] = [];
  const ports = LOCATION_LIST.filter((l) => l.services.includes('puerto') || l.kind === 'puerto' || ['concordia', 'faro_sirenas', 'corona_varn', 'arena_remolino'].includes(l.id));
  const sails = ['#f6efe0', '#ff6f61', '#ffd166', '#4fc3f7', '#f78fb3'];
  ports.forEach((l, i) => {
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2 + i;
      const x = l.pos.x + Math.cos(a) * 13, z = l.pos.z + Math.sin(a) * 13;
      let ok = true;
      for (let j = 0; j < 8 && ok; j++) { const b = (j / 8) * Math.PI * 2; if (heightAt(x + Math.cos(b) * 4.5, z + Math.sin(b) * 4.5) > -0.4) ok = false; }
      if (ok) { out.push({ cx: x, cz: z, r: 3.5, a: Math.random() * 6, sp: (Math.random() < 0.5 ? -1 : 1) * (0.12 + Math.random() * 0.08), sail: sails[i % sails.length] }); break; }
    }
  });
  return out;
}

function dampAngle(a: number, b: number, k: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * Math.min(1, k);
}

const shadeCache = new Map<string, string>();
function shadeHex(hex: string, amt: number): string {
  const k = `${hex}|${amt}`;
  let v = shadeCache.get(k);
  if (!v) { const c = new THREE.Color(hex); const hsl = { h: 0, s: 0, l: 0 }; c.getHSL(hsl); c.setHSL(hsl.h, hsl.s, Math.max(0, Math.min(1, hsl.l + amt))); v = `#${c.getHexString()}`; shadeCache.set(k, v); }
  return v;
}
