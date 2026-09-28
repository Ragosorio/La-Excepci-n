/**
 * Diorama terrain (one mesh, vertex-colored toon, no outlines — "painted background") + stylized water.
 * Colors come from continent biome, height, slope, roads and location plazas; corruption/political tint and
 * lava glow are shader-side (shaders.ts).
 */
import * as THREE from 'three';
import type { ContinentId } from '../../data/types';
import { LOCATION_LIST } from '../../data/world';
import { CONT_ORDER, GRID_N, MAP_MIN, MAP_SIZE, getGeo, heightAt, roadSegments, segDist } from '../../systems/world/geo';
import { fbm, simplex } from '../../systems/world/noise';
import { toon } from '../../render/toon';
import { NOISE_GLSL, WORLD_U, injectWorld } from './shaders';

const C = (hex: string) => new THREE.Color(hex);
const PAL = {
  sand: C('#e9d59c'), sandWet: C('#c9b27a'), seabed: C('#6f8f86'), seabedDeep: C('#2a4f63'),
  dirt: C('#b8966a'), dirtDark: C('#8a6a48'), plaza: C('#cdb58c'),
  rock: C('#857566'), rockDark: C('#5a4d45'), snow: C('#f4f4fb'),
  // Valdoria
  wheat: C('#e3c25a'), wheat2: C('#d6ac44'), meadow: C('#88ab4c'), meadow2: C('#a3bd57'), plowed: C('#9a7447'),
  // Sylvaria
  forest: C('#3f7a36'), forest2: C('#2f6a3a'), moss: C('#6aa64a'), glade: C('#b9b24c'),
  // Kharaz
  scrub: C('#7d8550'), stone: C('#7a6a5a'), basalt: C('#3f3533'), scorch: C('#2a2020'),
  // Morvenna
  swamp: C('#4f5f3c'), swamp2: C('#3b5548'), mire: C('#4a4760'), mud: C('#3f3a33'),
  // Islas
  jungle: C('#4fae62'), jungle2: C('#3a9152'), volcanic: C('#6a5858'),
  // Concordia
  marble: C('#ece6d6'), marble2: C('#f6f0e2'), lawn: C('#b4c89c'),
  crater: C('#2b2233'),
};

const tmp = new THREE.Color();
const tmp2 = new THREE.Color();

function biomeColor(ci: number, x: number, z: number, h: number, slope: number, out: THREE.Color): THREE.Color {
  const n = fbm(x * 0.06, z * 0.06, 3);
  const n2 = simplex(x * 0.21, z * 0.21) * 0.5 + 0.5;
  switch (CONT_ORDER[ci] as ContinentId) {
    case 'valdoria': {
      // patchwork fields: cells from quantized low-frequency noise + furrow stripes
      const cell = Math.floor(fbm(x * 0.045 + 3, z * 0.045 - 8, 2) * 7);
      const stripes = Math.sin((cell % 2 ? x : z) * 2.4 + cell) > 0.2 ? 1 : 0;
      const k = cell % 4;
      if (k === 0) out.copy(PAL.wheat).lerp(PAL.wheat2, stripes * 0.6);
      else if (k === 1) out.copy(PAL.meadow).lerp(PAL.meadow2, n2);
      else if (k === 2) out.copy(PAL.wheat2).lerp(PAL.plowed, stripes * 0.5);
      else out.copy(PAL.meadow2).lerp(PAL.wheat, 0.35 + stripes * 0.2);
      break;
    }
    case 'sylvaria':
      out.copy(PAL.forest).lerp(PAL.forest2, n).lerp(PAL.moss, Math.max(0, n2 - 0.55) * 1.4);
      if (fbm(x * 0.03 - 9, z * 0.03 + 4, 2) > 0.66) out.lerp(PAL.glade, 0.55);
      break;
    case 'kharaz': {
      out.copy(PAL.scrub).lerp(PAL.stone, Math.min(1, Math.max(0, (h - 2.5) / 5)));
      if (h > 9) out.lerp(PAL.rockDark, Math.min(1, (h - 9) / 6));
      if (h > 15.5) out.lerp(PAL.snow, Math.min(1, (h - 15.5) / 2.2 + n2 * 0.3));
      out.lerp(PAL.basalt, Math.max(0, n - 0.62) * 1.5);
      break;
    }
    case 'morvenna':
      out.copy(PAL.swamp).lerp(PAL.swamp2, n).lerp(PAL.mire, Math.max(0, n2 - 0.5) * 1.1);
      if (h < 0.7) out.lerp(PAL.mud, 0.55);
      break;
    case 'islas':
      out.copy(PAL.jungle).lerp(PAL.jungle2, n);
      if (h > 4.5) out.lerp(PAL.volcanic, Math.min(1, (h - 4.5) / 2.5));
      break;
    default: {
      // Concordia: marble plaza grid with lawns
      const gx = Math.abs(((x + 200) % 6) - 3), gz = Math.abs(((z + 200) % 6) - 3);
      out.copy(gx < 0.6 || gz < 0.6 ? PAL.marble2 : PAL.lawn).lerp(PAL.marble, n * 0.4);
      break;
    }
  }
  // slopes turn to rock
  const rocky = Math.min(1, Math.max(0, (slope - 0.55) / 0.6));
  if (rocky > 0) out.lerp(tmp2.copy(PAL.rock).lerp(PAL.rockDark, n), rocky * 0.85);
  // painterly value jitter
  const j = (n2 - 0.5) * 0.08;
  out.r = Math.max(0, out.r + j); out.g = Math.max(0, out.g + j); out.b = Math.max(0, out.b + j * 0.6);
  return out;
}

export interface TerrainBundle {
  terrain: THREE.Mesh;
  water: THREE.Mesh;
  waterMat: THREE.ShaderMaterial;
  depthTex: THREE.DataTexture;
}

let roadsCache: Array<[number, number, number, number]> | null = null;
const LOCS_NO_CRATER = LOCATION_LIST.filter((l) => l.id !== 'crater');
const CRATER = LOCATION_LIST.find((l) => l.id === 'crater')!;

/** Ground color of a map point (biome, beaches, roads, plazas, scorch, AO). */
function groundColor(x: number, z: number, out: THREE.Color): THREE.Color {
  const g = getGeo();
  const h = heightAt(x, z);
  const i = Math.max(0, Math.min(GRID_N - 1, Math.round(x - MAP_MIN)));
  const j = Math.max(0, Math.min(GRID_N - 1, Math.round(z - MAP_MIN)));
  const ci = g.conts[j * GRID_N + i];
  if (h < -0.05) {
    const d = Math.min(1, -h / 5);
    return out.copy(PAL.sandWet).lerp(PAL.seabed, Math.min(1, d * 1.6)).lerp(PAL.seabedDeep, Math.max(0, d - 0.4) * 1.5);
  }
  const slope = Math.hypot(heightAt(x + 1, z) - heightAt(x - 1, z), heightAt(x, z + 1) - heightAt(x, z - 1)) * 0.5;
  biomeColor(ci, x, z, h, slope, out);
  const beach = 1 - Math.min(1, Math.max(0, (h - 0.25) / (ci === 4 ? 1.3 : 0.75)));
  if (beach > 0 && CONT_ORDER[ci] !== 'concordia') out.lerp(ci === 3 ? PAL.mud : PAL.sand, beach * (ci === 3 ? 0.6 : 0.9));
  const roads = roadsCache ??= roadSegments();
  let rd = 99;
  for (const s of roads) {
    if (x < Math.min(s[0], s[2]) - 2 || x > Math.max(s[0], s[2]) + 2 || z < Math.min(s[1], s[3]) - 2 || z > Math.max(s[1], s[3]) + 2) continue;
    rd = Math.min(rd, segDist(x, z, s[0], s[1], s[2], s[3]) + simplex(x * 0.3, z * 0.3) * 0.25);
  }
  if (rd < 1.25) out.lerp(rd < 0.7 ? PAL.dirt : PAL.dirtDark, rd < 0.7 ? 0.85 : 0.4);
  for (const l of LOCS_NO_CRATER) {
    const dx = x - l.pos.x, dz = z - l.pos.z;
    if (dx * dx + dz * dz > 42.25) continue;
    const d = Math.sqrt(dx * dx + dz * dz);
    out.lerp(l.continent === 'concordia' ? PAL.marble2 : PAL.plaza, (1 - d / 6.5) * 0.55);
  }
  const dc = Math.hypot(x - CRATER.pos.x, z - CRATER.pos.z);
  if (dc < 7) out.lerp(PAL.crater, Math.min(1, (7 - dc) / 4.5) * 0.9);
  const lv = g.glow[j * GRID_N + i];
  if (lv > 0.02) out.lerp(PAL.scorch, Math.min(1, lv * 2.5));
  const ao = Math.max(0, (heightAt(x - 3, z) + heightAt(x + 3, z) + heightAt(x, z - 3) + heightAt(x, z + 3)) * 0.25 - h);
  out.multiplyScalar(1 - Math.min(0.25, ao * 0.05));
  return out;
}

export interface PatchOpts { cx: number; cz: number; half: number; step: number; scale: number }

/** Terrain grid mesh over a window of the map, transformed to local space ((x-cx)·s, h·s, (z-cz)·s). */
export function buildTerrainMesh(o: PatchOpts): THREE.Mesh {
  const g = getGeo();
  const n = Math.round((o.half * 2) / o.step) + 1;
  const pos = new Float32Array(n * n * 3);
  const col = new Float32Array(n * n * 3);
  const cont = new Float32Array(n * n);
  const glow = new Float32Array(n * n * 2);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const idx = j * n + i;
      const x = o.cx - o.half + i * o.step, z = o.cz - o.half + j * o.step;
      const h = heightAt(x, z);
      pos[idx * 3] = (x - o.cx) * o.scale; pos[idx * 3 + 1] = h * o.scale; pos[idx * 3 + 2] = (z - o.cz) * o.scale;
      const gi = Math.max(0, Math.min(GRID_N - 1, Math.round(x - MAP_MIN)));
      const gj = Math.max(0, Math.min(GRID_N - 1, Math.round(z - MAP_MIN)));
      cont[idx] = g.conts[gj * GRID_N + gi];
      groundColor(x, z, tmp);
      col[idx * 3] = tmp.r; col[idx * 3 + 1] = tmp.g; col[idx * 3 + 2] = tmp.b;
      glow[idx * 2] = g.glow[gj * GRID_N + gi];
      const dc = Math.hypot(x - CRATER.pos.x, z - CRATER.pos.z);
      glow[idx * 2 + 1] = dc < 3.2 ? (1 - dc / 3.2) * 0.9 : 0;
    }
  }
  const idxArr = new Uint32Array((n - 1) * (n - 1) * 6);
  let k = 0;
  for (let j = 0; j < n - 1; j++) {
    for (let i = 0; i < n - 1; i++) {
      const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
      if ((i + j) % 2 === 0) { idxArr[k++] = a; idxArr[k++] = c; idxArr[k++] = b; idxArr[k++] = b; idxArr[k++] = c; idxArr[k++] = d; }
      else { idxArr[k++] = a; idxArr[k++] = c; idxArr[k++] = d; idxArr[k++] = a; idxArr[k++] = d; idxArr[k++] = b; }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aCont', new THREE.BufferAttribute(cont, 1));
  geo.setAttribute('aGlow', new THREE.BufferAttribute(glow, 2));
  geo.setIndex(new THREE.BufferAttribute(idxArr, 1));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  const mat = toon('#ffffff', { vertexColors: true, bands: [0.5, 0.74, 0.9, 1.0], unique: true });
  injectWorld(mat, { cont: true, glow: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  return mesh;
}

let depthTexCache: THREE.DataTexture | null = null;
/** Water depth texture over the whole map (R depth, G continent). */
export function depthTexture(): THREE.DataTexture {
  if (depthTexCache) return depthTexCache;
  const g = getGeo();
  const N = GRID_N;
  const tex = new Uint8Array(N * N * 4);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const idx = j * N + i;
    tex[idx * 4] = Math.round(Math.max(0, Math.min(1, -g.heights[idx] / 6.2)) * 255);
    tex[idx * 4 + 1] = Math.round((g.conts[idx] / 5) * 255);
    tex[idx * 4 + 2] = 0; tex[idx * 4 + 3] = 255;
  }
  const t = new THREE.DataTexture(tex, N, N, THREE.RGBAFormat);
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  depthTexCache = t;
  return t;
}

export function buildTerrain(): TerrainBundle {
  const terrain = buildTerrainMesh({ cx: 0, cz: 0, half: MAP_SIZE / 2, step: 1, scale: 1 });
  const depthTex = depthTexture();
  const waterMat = waterMaterial(new THREE.Vector4(MAP_MIN, MAP_MIN, MAP_SIZE, 0));
  const water = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400, 1, 1).rotateX(-Math.PI / 2), waterMat);
  water.renderOrder = 2;
  water.name = 'water';
  return { terrain, water, waterMat, depthTex };
}

/** Stylized toon water. `bounds` maps local xz to depth-texture uv: uv = (xz - bounds.xy) / bounds.z. */
export function waterMaterial(bounds: THREE.Vector4): THREE.ShaderMaterial {
  const waterMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uDepth: { value: null }, uBounds: { value: bounds },
      uShallow: { value: new THREE.Color('#5fd2d6') }, uDeep: { value: new THREE.Color('#1f5f9a') },
      uFoam: { value: new THREE.Color('#f4fbff') }, uSky: { value: new THREE.Color('#bfe6ff') },
      uSunDir: { value: new THREE.Vector3(0.3, 1, 0.2) }, uSunCol: { value: new THREE.Color('#fff4d8') },
      uNightW: { value: 0 }, uTimeW: { value: 0 },
    }]),
    vertexShader: /* glsl */ `
      #include <common>
      #include <fog_pars_vertex>
      uniform vec4 uBounds;
      varying vec3 vW; varying vec2 vMap;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        vMap = (w.xz - uBounds.xy) / uBounds.z;
        vec4 mvPosition = viewMatrix * w;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      uniform sampler2D uDepth; uniform vec3 uShallow, uDeep, uFoam, uSky, uSunDir, uSunCol;
      uniform float uNightW, uTimeW; uniform float uCorr[6];
      varying vec3 vW; varying vec2 vMap;
      ${NOISE_GLSL}
      void main() {
        bool inside = vMap.x > 0.0 && vMap.y > 0.0 && vMap.x < 1.0 && vMap.y < 1.0;
        vec4 dt = inside ? texture2D(uDepth, vMap) : vec4(1.0, 0.0, 0.0, 1.0);
        float d = dt.r;
        int ci = int(dt.g * 5.0 + 0.5);
        vec2 p = vW.xz;
        float t = uTimeW;
        float n1 = lxN(p * 0.33 + vec2(t * 0.11, t * 0.07));
        float n2 = lxN(p * 0.85 - vec2(t * 0.09, -t * 0.12));
        vec3 N = normalize(vec3((n1 - 0.5) * 0.4 + (n2 - 0.5) * 0.22, 1.0, (n2 - 0.5) * 0.4 - (n1 - 0.5) * 0.1));
        float dq = floor(smoothstep(0.0, 0.8, d) * 4.0 + 0.5) / 4.0;
        vec3 col = mix(uShallow, uDeep, dq);
        vec3 V = normalize(cameraPosition - vW);
        float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
        col = mix(col, uSky, fres * 0.4);
        vec3 Hh = normalize(normalize(uSunDir) + V);
        float spec = pow(max(dot(N, Hh), 0.0), 220.0);
        col += uSunCol * step(0.45, spec) * 1.4;
        float rings = step(0.74, fract(d * 10.0 + t * 0.32)) * (1.0 - smoothstep(0.015, 0.14, d));
        float foamN = step(0.64, lxN(p * 1.25 + t * 0.22)) * (1.0 - smoothstep(0.0, 0.1, d));
        float edge = 1.0 - smoothstep(0.0, 0.03, d);
        float foam = max(max(rings * 0.9, foamN * 0.85), edge);
        col = mix(col, uFoam, foam);
        float corr = uCorr[ci];
        col = mix(col, col * vec3(0.55, 0.38, 0.9) + vec3(0.05, 0.0, 0.12), corr * 0.65 * (1.0 - smoothstep(0.15, 0.9, d)));
        col *= mix(1.0, 0.5, uNightW);
        col += vec3(0.6, 0.7, 1.0) * uNightW * step(0.55, spec) * 0.5;
        float a = mix(0.5, 0.94, smoothstep(0.0, 0.3, d));
        a = max(a, foam * 0.95);
        gl_FragColor = vec4(col, a);
        #include <fog_fragment>
      }`,
  });
  waterMat.uniforms.uDepth.value = depthTexture();
  waterMat.uniforms.uCorr = WORLD_U.uCorr;
  return waterMat;
}
