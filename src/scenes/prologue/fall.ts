/**
 * 'fall' — Aurel's titanic punch launches Elias over the sea and the map at night; he crashes into a wheat field
 * of Valdoria. Crater. Silence.
 * 'revive' — "Elias Veyr murió aquella noche." … "Excepto que no." Violet light, five EXCEPCIÓN cut-ins,
 * he stands in the crater and smiles → "La regla" → overworld.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { G } from '../../core/state';
import { saveRun } from '../../core/save';
import { input } from '../../core/input';
import { engine } from '../../core/engine';
import { addNews } from '../../core/news';
import { toon } from '../../render/toon';
import { buildCharacter, type CharacterRig } from '../../characters/rig';
import { excepcionAcquired } from '../../ui/toasts';
import { audio } from '../../audio';
import { CONTINENTS, LOCATION_LIST } from '../../data/world';
import { FRAGMENTS, REVIVE_ORDER, powerInfo } from '../../data/story';
import { acquire } from '../../systems/progression/codex';
import { blackout, centerLine, fragmentGoto, holdToSkip } from '../../systems/story/ui';
import { unlockAchievement } from '../../systems/story/achievements';
import { storyBeat } from '../../systems/story/aurel';
import { ensureDesignios } from '../../systems/story/designios';
import { applyEchoes } from '../../systems/story/margins';
import { st } from '../../systems/story/state';
import { Director, ease } from './director';
import type { PCtx } from './index';

const S = 5; // world map scale for the flight
const CRATER = new THREE.Vector3(-43 * S, 0, 27 * S);

// ───────────────────────────── the night map ─────────────────────────────

function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.25, 'rgba(255,220,160,0.6)'); grd.addColorStop(1, 'rgba(255,200,120,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

function buildMap(c: PCtx): THREE.Group {
  const g = new THREE.Group();
  // the sea: dark, with moonlit glitter
  const seaMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `uniform float uTime; varying vec3 vW;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      void main(){
        vec2 p = vW.xz * 0.35;
        float sp = h(floor(p + vec2(uTime * 0.6, uTime * 0.2)));
        float glit = step(0.985, sp) * (0.5 + 0.5 * sin(uTime * 6.0 + sp * 40.0));
        float dist = length(vW.xz);
        vec3 col = mix(vec3(0.02, 0.05, 0.11), vec3(0.05, 0.08, 0.16), smoothstep(900.0, 200.0, dist));
        col += vec3(0.7, 0.8, 1.0) * glit * 1.6 * smoothstep(1200.0, 100.0, dist);
        col = mix(col, vec3(0.06, 0.05, 0.13), smoothstep(500.0, 1400.0, dist));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(3200, 3200).rotateX(-Math.PI / 2), seaMat);
  sea.position.y = -0.5;
  g.add(sea);
  c.hooks.add((_dt, t) => { seaMat.uniforms.uTime.value = t; });
  c.extra.push(sea.geometry, seaMat);
  // islands
  const parts: THREE.BufferGeometry[] = [];
  const blob = new THREE.SphereGeometry(1, 28, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  const col = (geo: THREE.BufferGeometry, color: THREE.Color, m: THREE.Matrix4) => {
    const cg = (geo.index ? geo.toNonIndexed() : geo.clone()).applyMatrix4(m);
    const n = cg.getAttribute('position').count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = color.r; arr[i * 3 + 1] = color.g; arr[i * 3 + 2] = color.b; }
    cg.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    cg.deleteAttribute('uv');
    parts.push(cg);
  };
  const M = (x: number, y: number, z: number, sx: number, sy: number, sz: number) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(sx, sy, sz));
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (const cd of Object.values(CONTINENTS)) {
    const base = new THREE.Color(cd.palette.ground).multiplyScalar(0.8);
    const hill = new THREE.Color(cd.palette.ground2).multiplyScalar(0.8);
    const cx = cd.center.x * S, cz = cd.center.z * S, r = cd.radius * S;
    col(blob, base, M(cx, 0, cz, r, 6, r * 0.9));
    const lumps = cd.id === 'concordia' ? 2 : 9;
    for (let i = 0; i < lumps; i++) {
      const a = rnd() * Math.PI * 2, d = rnd() * r * 0.6, s = r * (0.18 + rnd() * 0.25);
      col(blob, hill, M(cx + Math.cos(a) * d, 2, cz + Math.sin(a) * d, s, cd.id === 'kharaz' ? 26 + rnd() * 30 : 6 + rnd() * 8, s));
    }
    if (cd.id === 'concordia') for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      col(new THREE.CylinderGeometry(3, 4, 36, 8), new THREE.Color('#9a98a8'), M(cx + Math.cos(a) * 16, 18, cz + Math.sin(a) * 16, 1, 1, 1));
    }
  }
  const geo = mergeGeometries(parts, false)!;
  const landMat = toon('#ffffff', { vertexColors: true, bands: [0.45, 0.75, 1], rim: 0.25, rimColor: '#9fb4ff', unique: true });
  landMat.emissive = new THREE.Color('#10142a');
  const land = new THREE.Mesh(geo, landMat);
  g.add(land);
  c.extra.push(geo, land.material as THREE.Material);
  // town lights
  const tex = glowTexture();
  const mat = new THREE.SpriteMaterial({ map: tex, color: '#ffcf8a', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  for (const l of LOCATION_LIST) {
    if (l.id === 'crater') continue;
    const sp = new THREE.Sprite(mat);
    sp.position.set(l.pos.x * S, 9, l.pos.z * S);
    const s = l.kind === 'capital' || l.kind === 'concilio' ? 34 : 18;
    sp.scale.set(s, s, 1);
    g.add(sp);
  }
  c.extra.push(tex, mat);
  return g;
}

// ───────────────────────────── the wheat field ─────────────────────────────

interface Field { group: THREE.Group; crater: THREE.Group; push: { value: number }; dispose(): void }

function buildField(c: PCtx): Field {
  const group = new THREE.Group();
  group.position.copy(CRATER);
  const disposables: Array<{ dispose(): void }> = [];
  const groundMat = toon('#6d5a30', { bands: [0.5, 0.8, 1], unique: true });
  groundMat.emissive = new THREE.Color('#141626');
  const ground = new THREE.Mesh(new THREE.CircleGeometry(160, 48).rotateX(-Math.PI / 2), groundMat);
  ground.receiveShadow = true;
  group.add(ground);
  disposables.push(ground.geometry, ground.material as THREE.Material);
  const stalk = mergeGeometries([
    new THREE.CylinderGeometry(0.012, 0.016, 1.05, 4).translate(0, 0.52, 0),
    new THREE.ConeGeometry(0.035, 0.22, 5).translate(0, 1.12, 0),
  ], false)!;
  const push = { value: 0 };
  const tU = { value: 0 };
  const mat = toon('#d9b36c', { bands: [0.5, 0.82, 1], unique: true });
  mat.emissive = new THREE.Color('#2c2c44'); // moonlit: silver-blue even at night
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uPush = push; sh.uniforms.uT = tU;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uPush; uniform float uT;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 wp = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        #else
          vec3 wp = vec3(0.0);
        #endif
        float hgt = position.y;
        float sway = sin(uT * 1.3 + wp.x * 0.3 + wp.z * 0.2) * 0.08 + sin(uT * 2.7 + wp.x) * 0.03;
        transformed.x += sway * hgt;
        float r = length(wp.xz);
        vec2 outDir = r > 0.001 ? wp.xz / r : vec2(0.0);
        float blast = uPush * exp(-r * 0.12);
        transformed.xz += outDir * blast * hgt * 1.4;
        transformed.y -= blast * hgt * 0.3;`);
  };
  mat.customProgramCacheKey = () => 'lx-wheat';
  const n = 5200;
  const im = new THREE.InstancedMesh(stalk, mat, n);
  const m = new THREE.Matrix4();
  let placed = 0;
  let seed = 3;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  while (placed < n) {
    const a = rnd() * Math.PI * 2, r = 3.2 + Math.sqrt(rnd()) * 62;
    const s = 0.8 + rnd() * 0.5;
    m.compose(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r), new THREE.Quaternion().setFromEuler(new THREE.Euler((rnd() - 0.5) * 0.2, rnd() * 6.28, (rnd() - 0.5) * 0.2)), new THREE.Vector3(s, s * (0.85 + rnd() * 0.3), s));
    im.setMatrixAt(placed++, m);
  }
  group.add(im);
  disposables.push(stalk, mat);
  c.hooks.add((_dt, t) => { tU.value = t; });
  // the crater (appears on impact)
  const crater = new THREE.Group();
  const rim = new THREE.Mesh(new THREE.TorusGeometry(3.1, 0.55, 8, 32).rotateX(Math.PI / 2), toon('#4a3a26', { unique: true }));
  rim.scale.y = 0.6; rim.position.y = 0.05;
  const pit = new THREE.Mesh(new THREE.CircleGeometry(3.1, 32).rotateX(-Math.PI / 2), toon('#21190f', { unique: true }));
  pit.position.y = 0.03;
  crater.add(rim, pit);
  crater.visible = false;
  group.add(crater);
  disposables.push(rim.geometry, rim.material as THREE.Material, pit.geometry, pit.material as THREE.Material);
  c.scene.add(group);
  let disposed = false;
  const dispose = () => { if (disposed) return; disposed = true; group.removeFromParent(); disposables.forEach((d) => d.dispose()); };
  c.extra.push({ dispose });
  return { group, crater, push, dispose };
}

function makeElias(c: PCtx): CharacterRig {
  const e = buildCharacter({ seed: 'elias', race: 'excepcion', special: 'elias' });
  c.scene.add(e.root);
  c.extra.push({ dispose: () => e.dispose() });
  return e;
}

// ───────────────────────────── fall ─────────────────────────────

export async function runFall(c: PCtx): Promise<void> {
  const tl = c.tl;
  c.block(true);
  input.enabled = false;
  const black = blackout();
  black.el.style.opacity = '1';
  c.dom.push(black.el);
  offerSkip(c, black);
  c.atmos.time = 0.02; c.atmos.near = 300; c.atmos.far = 1500;
  c.sky.cloudSpeed = 6;
  const map = buildMap(c);
  c.scene.add(map);
  const field = buildField(c);
  field.group.visible = false;
  const elias = makeElias(c);
  elias.pose = 'fly';
  elias.setExpression('hurt');
  const start = new THREE.Vector3(2 * S, 20, 2 * S);
  const path = new THREE.CatmullRomCurve3([start, new THREE.Vector3(-40, 140, 60), new THREE.Vector3(-150, 150, 110), CRATER.clone().add(new THREE.Vector3(30, 60, 20)), CRATER.clone().add(new THREE.Vector3(0, 4, 0))]);
  elias.root.position.copy(start);
  let spin = 0;
  let flying = true;
  const tangent = new THREE.Vector3();
  c.hooks.add((dt) => {
    elias.update(dt, { airborne: flying });
    if (!flying) return;
    spin += dt * 5;
    elias.root.rotation.set(spin * 0.7, spin, spin * 0.3);
    if (Math.random() < 0.8) c.fx.emit('arcane', elias.root.position.clone().add(new THREE.Vector3(0, 0.8, 0)), { count: 3, speed: 1, life: 0.6 });
  });
  engine.pipeline.setLetterbox(1);
  engine.pipeline.setSpeedLines(0.75);
  audio.music('silence');
  audio.ambience('wind', true, 0.9);
  audio.sfx('whoosh', { volume: 1 });
  c.camMode = 'shot';
  c.shot.handheld = 0.15;
  const camPos = start.clone().add(new THREE.Vector3(14, 10, -12));
  c.shot.set(camPos, start.clone().add(new THREE.Vector3(-10, -6, 6)), 62);
  void black.to(0, 0.6);
  let u = 0;
  await tl.tween(7.2, (k) => {
    u = k;
    path.getPointAt(k, elias.root.position);
    path.getTangentAt(k, tangent);
    // chase from above and behind, looking ahead and down: the sea and the continents slide under him
    const side = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
    const want = elias.root.position.clone().addScaledVector(tangent, -13).addScaledVector(side, 6).add(new THREE.Vector3(0, 9 + Math.sin(k * 3) * 2, 0));
    c.shot.pos.lerp(want, 0.1);
    c.shot.look.copy(elias.root.position).addScaledVector(tangent, 9).add(new THREE.Vector3(0, -7, 0));
    if (Math.random() < 0.03) audio.sfx('whoosh', { volume: 0.6, pitch: 0.8 + Math.random() * 0.4 });
  }, (k) => k * (0.7 + 0.3 * k));
  void u;

  // cut: the wheat field, looking up
  map.visible = false;
  field.group.visible = true;
  c.atmos.near = 25; c.atmos.far = 220;
  c.sky.cloudSpeed = 1.2;
  engine.pipeline.setSpeedLines(0.3);
  const ground = CRATER.clone().add(new THREE.Vector3(13, 1.4, 9));
  c.shot.handheld = 0.03;
  c.shot.set(ground, CRATER.clone().add(new THREE.Vector3(-6, 30, -4)), 58);
  const fallFrom = CRATER.clone().add(new THREE.Vector3(-10, 70, -8));
  elias.root.position.copy(fallFrom);
  audio.sfx('whoosh', { volume: 1, pitch: 0.6 });
  await tl.tween(1.1, (k) => {
    elias.root.position.lerpVectors(fallFrom, CRATER, k);
    c.shot.look.lerpVectors(CRATER.clone().add(new THREE.Vector3(-6, 30, -4)), CRATER, k);
    c.fx.emit('arcane', elias.root.position.clone(), { count: 6, speed: 2 });
  }, ease.in);

  // impact
  flying = false;
  elias.root.rotation.set(0, 0.6, 0);
  elias.root.position.copy(CRATER).add(new THREE.Vector3(0, -0.2, 0));
  elias.pose = 'lie';
  elias.setExpression('dead');
  field.crater.visible = true;
  engine.pipeline.impact(3, 1);
  engine.pipeline.flash('#e8dcff', 0.7, 0.6);
  engine.pipeline.setSpeedLines(0);
  engine.hitstop(160);
  audio.sfx('explosion', { volume: 1, pitch: 0.7 });
  audio.sfx('ragdoll_thud', { volume: 1 });
  c.fx.emit('explosion', CRATER.clone().add(new THREE.Vector3(0, 1, 0)), { count: 60, color: '#e0c8ff', color2: '#9b5cff' });
  c.fx.emit('earth', CRATER.clone().add(new THREE.Vector3(0, 0.5, 0)), { count: 60, speed: 12 });
  for (let i = 0; i < 4; i++) c.fx.emit('dust', CRATER.clone().add(new THREE.Vector3((Math.random() - 0.5) * 6, 1, (Math.random() - 0.5) * 6)), { count: 30, size: 2.5, life: 3.5, speed: 5 });
  c.fx.ring(CRATER, { color: '#c7a2ff', radius: 30, duration: 1.2 });
  tl.bg(0.35, (k) => { field.push.value = k * 2.2; });
  tl.bg(6, (k) => { field.push.value = 2.2 * (1 - k) + 0.5 * k; }, ease.out);
  c.shot.handheld = 0.35;
  tl.bg(1.2, (k) => { c.shot.handheld = 0.35 * (1 - k) + 0.02; });
  const after = CRATER.clone().add(new THREE.Vector3(9, 3.2, 7));
  c.shot.move(tl, after, CRATER.clone().add(new THREE.Vector3(0, 0.4, 0)), 5, ease.out, 44).catch(() => undefined);
  // then: silence
  audio.ambience('wind', true, 0.18);
  await tl.wait(4.6);
  await runRevive(c, { continued: true, field, elias, black });
}

// ───────────────────────────── revive ─────────────────────────────

export async function runRevive(c: PCtx, prev?: { continued: true; field: Field; elias: CharacterRig; black: ReturnType<typeof blackout> }): Promise<void> {
  const tl = c.tl;
  c.block(true);
  input.enabled = false;
  let field = prev?.field;
  let elias = prev?.elias;
  const black = prev?.black ?? blackout();
  if (!prev) {
    black.el.style.opacity = '1';
    c.dom.push(black.el);
    offerSkip(c, black);
    c.atmos.time = 0.03; c.atmos.near = 25; c.atmos.far = 220;
    field = buildField(c);
    field.crater.visible = true;
    field.push.value = 0.5;
    elias = makeElias(c);
    elias.root.position.copy(CRATER).add(new THREE.Vector3(0, -0.2, 0));
    elias.root.rotation.set(0, 0.6, 0);
    elias.pose = 'lie';
    elias.setExpression('dead');
    c.hooks.add((dt) => elias!.update(dt, {}));
    c.camMode = 'shot';
    c.shot.set(CRATER.clone().add(new THREE.Vector3(9, 3.2, 7)), CRATER.clone().add(new THREE.Vector3(0, 0.4, 0)), 44);
    engine.pipeline.setLetterbox(1);
    audio.ambience('wind', true, 0.18);
  }
  const E = elias!;
  audio.music('silence');
  // the camera drifts up and away, like someone leaving a grave
  c.shot.move(tl, CRATER.clone().add(new THREE.Vector3(5, 11, 4)), CRATER.clone(), 16, ease.sine, 40).catch(() => undefined);
  if (!prev) await tl.hold(black.to(0, 3));
  await tl.wait(1.2);
  await tl.hold(centerLine('Elias Veyr murió aquella noche.', { hold: 3.2 }));
  await tl.wait(4.2);   // the long pause
  await tl.hold(centerLine('Excepto que no.', { hold: 2.2, cls: 'big' }));

  // violet light
  const light = new THREE.PointLight('#9b5cff', 0, 26, 1.3);
  light.position.copy(CRATER).add(new THREE.Vector3(0, 1.2, 0));
  c.scene.add(light);
  c.extra.push({ dispose: () => light.removeFromParent() });
  audio.sfx('heartbeat', { volume: 0.9 });
  E.setEyeGlow('#c9a4ff');
  let converge = true;
  c.hooks.add(() => {
    if (!converge) return;
    const a = Math.random() * Math.PI * 2, r = 6 + Math.random() * 10;
    const p = CRATER.clone().add(new THREE.Vector3(Math.cos(a) * r, 0.3 + Math.random() * 3, Math.sin(a) * r));
    const dir = CRATER.clone().add(new THREE.Vector3(0, 0.6, 0)).sub(p).normalize();
    c.fx.emit('essence', p, { count: 1, dir, cone: 0.95, speed: 9, life: 0.9, gravity: 0 });
  });
  c.shot.move(tl, CRATER.clone().add(new THREE.Vector3(3.2, 2.2, 2.6)), CRATER.clone().add(new THREE.Vector3(0, 0.3, 0)), 3.5, ease.inOut, 42).catch(() => undefined);
  await tl.tween(2.4, (k) => { light.intensity = k * 18; }, ease.in);
  audio.sfx('heartbeat', { volume: 1 });

  // five EXCEPCIÓN cut-ins — acquired now, at the resurrection
  for (const id of REVIVE_ORDER) {
    const info = powerInfo(id)!;
    try { acquire(id, { noCutin: true }); } catch (err) { console.warn('[story] acquire', id, err); }
    c.fx.ring(CRATER, { color: info.color, radius: 12, duration: 0.9 });
    c.fx.flash(CRATER.clone().add(new THREE.Vector3(0, 0.8, 0)), { color: info.color, radius: 3, duration: 0.5 });
    c.fx.emit('magic', CRATER.clone().add(new THREE.Vector3(0, 0.8, 0)), { count: 50, color: info.color, speed: 6 });
    light.color.set(info.color);
    audio.sfx('copy_acquired', { volume: 0.8 });
    await tl.hold(excepcionAcquired(info.name, { color: info.color }));
    await tl.wait(0.15);
  }
  converge = false;
  light.color.set('#9b5cff');
  if (G.run) st().kitAcquired = true;

  // he stands in the crater, and smiles
  E.setExpression('neutral');
  E.pose = 'kneel';
  E.root.rotation.set(0, 0.6, 0);
  const faceCam = CRATER.clone().add(new THREE.Vector3(Math.sin(0.6) * 2.2, 1.55, Math.cos(0.6) * 2.2));
  c.shot.set(faceCam.clone().add(new THREE.Vector3(0, -0.6, 0)), CRATER.clone().add(new THREE.Vector3(0, 0.9, 0)), 40);
  audio.sfx('revive', { volume: 0.8 });
  await tl.wait(1.4);
  E.pose = 'idle';
  await tl.tween(1.2, (k) => { E.root.position.y = CRATER.y - 0.2 + k * 0.2; }, ease.out);
  c.shot.move(tl, faceCam, CRATER.clone().add(new THREE.Vector3(0, 1.75, 0)), 2.4, ease.inOut, 32).catch(() => undefined);
  await tl.wait(1.8);
  E.setExpression('happy');
  E.setEyeGlow('#e9dcff');
  c.fx.emit('arcane', CRATER.clone().add(new THREE.Vector3(0, 1.8, 0)), { count: 30, speed: 2 });
  tl.bg(3, (k) => { light.intensity = 18 * (1 - k) + 4 * k; });
  await tl.wait(2.6);
  E.setEyeGlow(null);

  await toLaRegla(c, black);
}

/** Leaves the crater for the world: Fragment "La regla" → overworld. Also the landing point of a skip. */
async function toLaRegla(c: PCtx, black: ReturnType<typeof blackout>): Promise<void> {
  if (G.run) {
    G.run.fragment = 'regla';
    G.run.player.location = null;
    G.run.flags.revived = true;
    st().kitAcquired = true;
    addNews('En Concordia celebran: el mago que desafió al Portador del Alba cayó al mar. Nadie lo busca.', 'rumor');
  }
  for (const id of REVIVE_ORDER) { try { acquire(id, { silent: true, noCutin: true }); } catch { /* already known */ } }
  ensureDesignios();
  applyEchoes();
  unlockAchievement('excepto_que_no');
  storyBeat('revived');
  saveRun(true);
  await black.to(1, 1.4);
  if (!c.alive) return;
  await fragmentGoto('overworld', { intro: true }, FRAGMENTS.regla, 3.4);
}

/** Repeat cycles: hold Space/Esc to skip the fall and the resurrection. */
function offerSkip(c: PCtx, black: ReturnType<typeof blackout>): void {
  if ((G.meta?.cyclesCompleted ?? 0) < 1 && c.params.skip === undefined) return;
  let used = false;
  const dispose = holdToSkip(() => {
    if (used || !c.alive) return;
    used = true;
    c.tl.kill();
    c.tl = c.director.timeline();
    Director.run(() => toLaRegla(c, black), 'skip revive');
  });
  c.extra.push({ dispose });
}
