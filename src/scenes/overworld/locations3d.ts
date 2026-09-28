/**
 * Location models as a handful of merged meshes: toon solids (+ outline hull), windows (lit at night),
 * always-on glow, lantern points, spinning parts (windmills) and banners (FlagField).
 * Used for the whole overworld (all locations) and, scaled up, for a single location's backdrop.
 */
import * as THREE from 'three';
import type { LocationDef } from '../../data/types';
import { CONTINENTS, LOCATIONS } from '../../data/world';
import { G } from '../../core/state';
import { toon, outlineMaterial } from '../../render/toon';
import { CONT_INDEX } from '../../systems/world/geo';
import { factionColor } from '../../systems/world/state';
import { ModelBuilder, hullGeometry, mergeColored, tagContinent } from './modelKit';
import { buildLocationModel, decorTrees } from './models';
import { FlagField, GlowPoints } from './flags';
import { injectWorld } from './shaders';

interface Placement { def: LocationDef; x: number; y: number; z: number; yaw: number; scale: number; decor?: number }

export class LocationMeshes {
  readonly group = new THREE.Group();
  readonly lights: GlowPoints | null = null;
  private glassMat: THREE.MeshBasicMaterial;
  private glowMat: THREE.MeshBasicMaterial;
  private spinners: Array<{ mesh: THREE.Object3D; axis: 'x' | 'y' | 'z'; speed: number }> = [];
  private flagSlots: Array<{ idx: number; key: string }> = [];
  private disposables: Array<{ dispose(): void }> = [];

  constructor(places: Placement[], readonly flags: FlagField, opts: { outline?: number; shadows?: boolean } = {}) {
    const b = new ModelBuilder();
    for (const p of places) {
      const s0 = b.solid.length, g0 = b.glass.length, w0 = b.glow.length;
      const sub = b.sub(p.x, p.y, p.z, p.yaw, p.scale);
      buildLocationModel(sub, p.def);
      if (p.decor) decorTrees(sub, p.def, p.decor, 6.5, 13);
      const ci = CONT_INDEX[p.def.continent];
      tagContinent(b.solid, s0, ci); tagContinent(b.glass, g0, ci); tagContinent(b.glow, w0, ci);
    }
    const solidGeo = mergeColored(b.solid);
    if (solidGeo) {
      const mat = toon('#ffffff', { vertexColors: true, bands: [0.55, 0.8, 1.0], unique: true, rim: 0 });
      injectWorld(mat, { cont: true, corrStrength: 0.55, political: 0.3 });
      const mesh = new THREE.Mesh(solidGeo, mat);
      mesh.castShadow = opts.shadows !== false; mesh.receiveShadow = true;
      const hull = hullGeometry(solidGeo);
      const outline = new THREE.Mesh(hull, outlineMaterial(opts.outline ?? 0.045));
      outline.userData.isOutline = true;
      mesh.add(outline);
      this.group.add(mesh);
      this.disposables.push(solidGeo, hull, mat);
    }
    this.glassMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(0.25, 0.25, 0.25) });
    this.glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(1.8, 1.8, 1.8) });
    const glassGeo = mergeColored(b.glass);
    if (glassGeo) { this.group.add(new THREE.Mesh(glassGeo, this.glassMat)); this.disposables.push(glassGeo); }
    const glowGeo = mergeColored(b.glow);
    if (glowGeo) { this.group.add(new THREE.Mesh(glowGeo, this.glowMat)); this.disposables.push(glowGeo); }
    this.disposables.push(this.glassMat, this.glowMat);

    const spinMat = toon('#ffffff', { vertexColors: true, bands: [0.55, 0.8, 1.0] });
    for (const sp of b.spinners) {
      const pivot = new THREE.Group();
      pivot.position.set(sp.x, sp.y, sp.z);
      pivot.rotation.y = sp.rotY;
      const m = new THREE.Mesh(sp.geo, spinMat);
      m.castShadow = true;
      const o = new THREE.Mesh(sp.geo, outlineMaterial(opts.outline ?? 0.045));
      o.userData.isOutline = true;
      m.add(o);
      pivot.add(m);
      this.group.add(pivot);
      this.spinners.push({ mesh: m, axis: sp.axis, speed: sp.speed });
      this.disposables.push(sp.geo);
    }
    for (const f of b.flags) {
      const idx = flags.add(f.x, f.y, f.z, f.rot + Math.PI / 2, f.scale, '#c8c8c8');
      this.flagSlots.push({ idx, key: f.key });
    }
    if (b.lights.length) {
      (this as { lights: GlowPoints | null }).lights = new GlowPoints(b.lights);
      this.group.add(this.lights!.points);
      this.disposables.push(this.lights!);
    }
    this.syncControl();
  }

  /** Banner colors from who controls each place (eclipse banners for La Excepción). */
  syncControl(): void {
    if (!G.hasRun) return;
    for (const s of this.flagSlots) {
      if (s.key.startsWith('loc:')) {
        const id = s.key.slice(4);
        const st = G.run.locations[id];
        const ctrl = st?.control ?? 'concilio';
        const cont = LOCATIONS[id]?.continent;
        // a fallen continent flies the eclipse everywhere, whoever still holds the keys
        const fallen = !!cont && !!G.run.continents[cont]?.corrupted;
        if (ctrl === 'excepcion' || fallen) this.flags.color(s.idx, '#1a1024', '#b27dff', 1);
        else this.flags.color(s.idx, factionColor(ctrl), '#f0d890', 0);
      } else if (s.key.startsWith('cont:')) {
        const c = s.key.slice(5) as keyof typeof CONTINENTS;
        if (G.run.continents[c]?.corrupted) this.flags.color(s.idx, '#1a1024', '#b27dff', 1);
        else this.flags.color(s.idx, factionColor(c), '#f0d890', 0);
      }
    }
  }

  update(dt: number, time: number, night: number, viewportH: number): void {
    for (const s of this.spinners) s.mesh.rotation[s.axis] += s.speed * dt;
    const w = 0.18 + night * 2.6;
    this.glassMat.color.setScalar(w);
    this.glowMat.color.setScalar(1.6 + Math.sin(time * 2.1) * 0.15 + night * 0.5);
    this.lights?.update(time, night, viewportH);
  }

  dispose(): void {
    for (const s of this.flagSlots) this.flags.remove(s.idx);
    this.group.removeFromParent();
    for (const d of this.disposables) d.dispose();
  }
}

/** Whirlpool disc (Arena del Remolino). */
export function whirlpool(radiusIn: number, radiusOut: number): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */ `varying vec2 vP; void main() { vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; varying vec2 vP;
      void main() {
        float r = length(vP); float a = atan(vP.y, vP.x);
        float s = sin(a * 3.0 + log(r + 0.5) * 9.0 - uTime * 2.4);
        float band = smoothstep(0.55, 0.9, s);
        float fade = smoothstep(${radiusOut.toFixed(2)}, ${(radiusOut * 0.6).toFixed(2)}, r) * smoothstep(${(radiusIn * 0.9).toFixed(2)}, ${(radiusIn * 1.3).toFixed(2)}, r);
        vec3 c = mix(vec3(0.3, 0.8, 0.9), vec3(0.95, 1.0, 1.0), band);
        gl_FragColor = vec4(c, (0.18 + band * 0.55) * fade);
      }`,
  });
  const m = new THREE.Mesh(new THREE.RingGeometry(radiusIn, radiusOut, 48, 1).rotateX(-Math.PI / 2), mat);
  m.renderOrder = 3;
  return m;
}

export type { Placement };
