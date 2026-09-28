/**
 * Shared shader injections for the diorama: violet corruption creeping over the land (per continent),
 * political-map tint, lava / arcane glow, foliage wind. All materials share ONE uniform set (`WORLD_U`) so a
 * single update per frame drives terrain, props and buildings.
 */
import * as THREE from 'three';

export const HUB_COUNT = 16;
export const WORLD_U = {
  uCorr: { value: [0, 0, 0, 0, 0, 0] as number[] },
  /** Corruption hubs (map x, map z, strength): conquered places, sanctuaries, the Cráter. */
  uHubs: { value: Array.from({ length: HUB_COUNT }, () => new THREE.Vector3(0, 0, 0)) },
  /** local → map transform for corruption patterns: map = local.xz * x + (y, z). */
  uMapXf: { value: new THREE.Vector3(1, 0, 0) },
  uPolCol: { value: Array.from({ length: 6 }, () => new THREE.Color(1, 1, 1)) },
  uPolitical: { value: 0 },
  uTime: { value: 0 },
  uNight: { value: 0 },
  uWind: { value: 1 },
};

export const NOISE_GLSL = /* glsl */ `
  float lxH(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float lxN(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(lxH(i), lxH(i + vec2(1.0, 0.0)), f.x), mix(lxH(i + vec2(0.0, 1.0)), lxH(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float lxF(vec2 p) { return lxN(p) * 0.55 + lxN(p * 2.1 + 7.3) * 0.3 + lxN(p * 4.3 - 3.1) * 0.15; }
`;

const CORR_PARS_FRAG = /* glsl */ `
  uniform float uCorr[6];
  uniform vec3 uHubs[${16}];
  uniform vec3 uMapXf;
  uniform vec3 uPolCol[6];
  uniform float uPolitical;
  uniform float uTime;
  uniform float uNight;
  flat varying float vCont;
  varying vec3 vWPos;
  varying vec2 vGlow;
  ${NOISE_GLSL}
`;

/** Returns infection 0..1 and edge 0..1 for a world point of continent ci. */
const CORR_FN = /* glsl */ `
  vec2 lxCorruption(int ci, vec2 lp) {
    vec2 wp = lp * uMapXf.x + uMapXf.yz;
    float corr = uCorr[ci];
    float hub = 0.0;
    for (int i = 0; i < ${16}; i++) {
      vec3 hb = uHubs[i];
      if (hb.z > 0.0) { vec2 d = wp - hb.xy; hub = max(hub, hb.z * exp(-dot(d, d) / 150.0)); }
    }
    if (corr <= 0.001 && hub <= 0.02) return vec2(0.0);
    // stretch the noise to ~uniform 0..1 so that N% corruption covers ≈N% of the land
    float pat = smoothstep(0.28, 0.72, lxF(wp * 0.055 + float(ci) * 13.1) * 0.8 + lxN(wp * 0.4) * 0.2);
    float thr = corr * 1.08 - 0.04 + hub * 0.6;
    float inf = 1.0 - smoothstep(thr - 0.03, thr, pat);
    float edge = inf * smoothstep(thr - 0.055, thr - 0.012, pat);
    return vec2(inf, edge);
  }
`;

/** color_vertex replacement (three r186: vColor is vec4) — instance color tints only bright vertex colors. */
const BRIGHT_TINT_VERTEX = /* glsl */ `
  #if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
    vColor = vec4( 1.0 );
  #endif
  #ifdef USE_COLOR_ALPHA
    vColor *= color;
  #elif defined( USE_COLOR )
    vColor.rgb *= color;
  #endif
  #ifdef USE_INSTANCING_COLOR
    #if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
      vColor.rgb *= mix(vec3(1.0), instanceColor.rgb, smoothstep(0.5, 0.85, dot(color.rgb, vec3(0.3333))));
    #else
      vColor.rgb *= instanceColor.rgb;
    #endif
  #endif`;

export interface InjectOpts {
  /** Mesh uses a per-vertex/instance `aCont` attribute (continent index). */
  cont?: boolean;
  /** Mesh has `aGlow` (vec2: lava, arcane). */
  glow?: boolean;
  /** Foliage wind: bends vertices by height (object space y). */
  wind?: number;
  /** Strength of the corruption recolor (buildings less than ground). */
  corrStrength?: number;
  /** Political tint strength. */
  political?: number;
  /** Instance color tints only bright vertex colors (canopies), not dark ones (trunks). */
  canopyTint?: boolean;
}

/** Patch a MeshToonMaterial (or any lit three material) with the world injections. */
export function injectWorld(mat: THREE.Material, o: InjectOpts = {}): THREE.Material {
  const key = `lxw-${o.cont ? 1 : 0}${o.glow ? 1 : 0}-${o.wind ?? 0}-${o.corrStrength ?? 1}-${o.political ?? 1}-${o.canopyTint ? 1 : 0}`;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, WORLD_U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uTime; uniform float uWind;
        ${o.cont ? 'attribute float aCont;' : ''}
        ${o.glow ? 'attribute vec2 aGlow;' : ''}
        flat varying float vCont; varying vec3 vWPos; varying vec2 vGlow;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        ${o.wind ? `{
          vec4 lxI = vec4(0.0, 0.0, 0.0, 1.0);
          #ifdef USE_INSTANCING
            lxI = instanceMatrix * lxI;
          #endif
          float sway = sin(uTime * 1.7 + lxI.x * 0.31 + lxI.z * 0.23) * 0.5 + sin(uTime * 3.1 + lxI.z * 0.7) * 0.2;
          transformed.x += sway * ${o.wind.toFixed(3)} * uWind * max(0.0, position.y) * max(0.0, position.y) * 0.06;
          transformed.z += sway * ${(o.wind * 0.6).toFixed(3)} * uWind * max(0.0, position.y) * max(0.0, position.y) * 0.04;
        }` : ''}
        {
          vec4 lxW = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            lxW = instanceMatrix * lxW;
          #endif
          lxW = modelMatrix * lxW;
          vWPos = lxW.xyz;
        }
        vCont = ${o.cont ? 'aCont' : '5.0'};
        vGlow = ${o.glow ? 'aGlow' : 'vec2(0.0)'};`);
    if (o.canopyTint) {
      sh.vertexShader = sh.vertexShader.replace('#include <color_vertex>', BRIGHT_TINT_VERTEX);
    }
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        ${CORR_PARS_FRAG}
        ${CORR_FN}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        int lxCi = int(vCont + 0.5);
        vec2 lxC = lxCorruption(lxCi, vWPos.xz);
        {
          float lum = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
          vec3 cc = vec3(lum) * vec3(0.16, 0.09, 0.27) + vec3(0.025, 0.006, 0.05);
          diffuseColor.rgb = mix(diffuseColor.rgb, cc, lxC.x * ${(0.9 * (o.corrStrength ?? 1)).toFixed(3)});
          diffuseColor.rgb = mix(diffuseColor.rgb, uPolCol[lxCi], uPolitical * ${(0.62 * (o.political ?? 1)).toFixed(3)});
        }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          float pulse = 0.75 + 0.25 * sin(uTime * 2.2 + vWPos.x * 0.3 + vWPos.z * 0.2);
          totalEmissiveRadiance += vec3(0.85, 0.32, 1.45) * lxC.y * pulse * 1.1;
          totalEmissiveRadiance += vec3(0.42, 0.12, 0.7) * lxC.x * pow(lxN(vWPos.xz * 0.8 + uTime * 0.07), 6.0) * 1.6;
          float lava = vGlow.x * (0.8 + 0.35 * sin(uTime * 1.6 + vWPos.x * 0.5 + vWPos.z * 0.4));
          totalEmissiveRadiance += vec3(1.9, 0.55, 0.12) * lava;
          totalEmissiveRadiance += vec3(0.7, 0.3, 1.3) * vGlow.y * (0.6 + 0.4 * sin(uTime * 1.3)) * (0.6 + uNight * 0.8);
        }`);
  };
  mat.customProgramCacheKey = () => key;
  mat.needsUpdate = true;
  return mat;
}

/** Instance color tints only bright vertex colors (sails, tunics), leaving dark parts (hulls, trunks) alone. */
export function tintBrightOnly(mat: THREE.Material): THREE.Material {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <color_vertex>', BRIGHT_TINT_VERTEX);
  };
  mat.customProgramCacheKey = () => 'lx-tintbright';
  mat.needsUpdate = true;
  return mat;
}

/** Map a corruption value (0..100) to the political heat color. */
export function heatColor(v: number, out = new THREE.Color()): THREE.Color {
  const t = Math.max(0, Math.min(1, v / 100));
  const a = new THREE.Color('#3a6ad0'), b = new THREE.Color('#d9b36c'), c = new THREE.Color('#9b5cff');
  return t < 0.5 ? out.copy(a).lerp(b, t * 2) : out.copy(b).lerp(c, (t - 0.5) * 2);
}

/** Refresh the corruption hubs from the run state (conquests, sanctuaries, the Cráter, terrorized places). */
export function updateHubs(run: { locations: Record<string, { control: string; fear: number }>; player: { sanctuaries: string[] } }, places: Array<{ id: string; pos: { x: number; z: number } }>): void {
  const list: Array<[number, number, number]> = [];
  for (const l of places) {
    const st = run.locations[l.id];
    if (!st) continue;
    let s = 0;
    if (l.id === 'crater') s = 0.55;
    else if (st.control === 'excepcion') s = 1;
    else if (run.player.sanctuaries.includes(l.id)) s = 0.7;
    else if (st.fear >= 70) s = 0.35;
    if (s > 0) list.push([l.pos.x, l.pos.z, s]);
  }
  list.sort((a, b) => b[2] - a[2]);
  const hubs = WORLD_U.uHubs.value;
  for (let i = 0; i < HUB_COUNT; i++) {
    const h = list[i];
    if (h) hubs[i].set(h[0], h[1], h[2]); else hubs[i].set(0, 0, 0);
  }
}
