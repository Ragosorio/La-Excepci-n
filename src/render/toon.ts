/**
 * Anime/toon materials.
 * - toon(color, opts): cached MeshToonMaterial with a hard 3-band ramp + optional anime rim light.
 * - outlineMaterial(thickness): inverted-hull outline (BackSide, extruded along normals). Works with InstancedMesh.
 * - withOutline(mesh): adds an outline child sharing the geometry.
 * - glow(color, intensity): unlit material > 1.0 for bloom (magic, eyes, runes).
 * Environment (terrain, big props) usually goes without outlines ("painted background" look);
 * characters and small props get outlines.
 */
import * as THREE from 'three';

const gradients = new Map<string, THREE.DataTexture>();

/** Toon ramp. Values are brightness per band (0..1). */
export function gradientTexture(bands: number[] = [0.42, 0.78, 1.0]): THREE.DataTexture {
  const key = bands.join(',');
  const cached = gradients.get(key);
  if (cached) return cached;
  const data = new Uint8Array(bands.length * 4);
  bands.forEach((b, i) => {
    const v = Math.round(b * 255);
    data[i * 4] = v; data[i * 4 + 1] = v; data[i * 4 + 2] = v; data[i * 4 + 3] = 255;
  });
  const tex = new THREE.DataTexture(data, bands.length, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  gradients.set(key, tex);
  return tex;
}

export interface ToonOpts {
  rim?: number;                       // rim light strength (0 = off). Characters ~0.35
  rimColor?: THREE.ColorRepresentation;
  emissive?: THREE.ColorRepresentation;
  emissiveIntensity?: number;
  transparent?: boolean;
  opacity?: number;
  side?: THREE.Side;
  vertexColors?: boolean;
  map?: THREE.Texture | null;
  bands?: number[];
  flatShading?: boolean;
  /** Skip the cache (when you will mutate this material). */
  unique?: boolean;
  depthWrite?: boolean;
  fog?: boolean;
}

const toonCache = new Map<string, THREE.MeshToonMaterial>();

export function toon(color: THREE.ColorRepresentation, opts: ToonOpts = {}): THREE.MeshToonMaterial {
  const c = new THREE.Color(color);
  const key = [
    c.getHexString(), opts.rim ?? 0, opts.rimColor ?? '', opts.emissive ?? '', opts.emissiveIntensity ?? 0,
    opts.transparent ? 1 : 0, opts.opacity ?? 1, opts.side ?? 0, opts.vertexColors ? 1 : 0,
    (opts.bands ?? []).join('|'), opts.flatShading ? 1 : 0, opts.depthWrite ?? 1, opts.fog ?? 1,
  ].join(';');
  if (!opts.unique && !opts.map) {
    const hit = toonCache.get(key);
    if (hit) return hit;
  }
  const mat = new THREE.MeshToonMaterial({
    color: c,
    gradientMap: gradientTexture(opts.bands),
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
    side: opts.side ?? THREE.FrontSide,
    vertexColors: opts.vertexColors ?? false,
    map: opts.map ?? null,
    depthWrite: opts.depthWrite ?? true,
    fog: opts.fog ?? true,
  });
  if (opts.emissive) { mat.emissive = new THREE.Color(opts.emissive); mat.emissiveIntensity = opts.emissiveIntensity ?? 1; }
  if (opts.rim && opts.rim > 0) addRim(mat, opts.rim, opts.rimColor ?? '#ffffff');
  if (!opts.unique && !opts.map) toonCache.set(key, mat);
  return mat;
}

/** Hard-edged anime rim light (fresnel), injected into any lit material. */
export function addRim(mat: THREE.Material, strength = 0.35, color: THREE.ColorRepresentation = '#ffffff'): void {
  const uRimColor = { value: new THREE.Color(color) };
  const uRimStrength = { value: strength };
  mat.userData.rim = { uRimColor, uRimStrength };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uRimColor = uRimColor;
    shader.uniforms.uRimStrength = uRimStrength;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uRimColor;\nuniform float uRimStrength;')
      .replace(
        '#include <opaque_fragment>',
        `{
          vec3 vdir = normalize(vViewPosition);
          float rimF = 1.0 - max(dot(normal, vdir), 0.0);
          float rimBand = smoothstep(0.62, 0.7, rimF);
          outgoingLight += uRimColor * uRimStrength * rimBand;
        }
        #include <opaque_fragment>`,
      );
  };
  mat.customProgramCacheKey = () => 'lx-rim';
  mat.needsUpdate = true;
}

const outlineCache = new Map<string, THREE.MeshBasicMaterial>();

/** Inverted-hull outline material. thickness in world units (≈0.02–0.05 for human-sized characters). */
export function outlineMaterial(thickness = 0.035, color: THREE.ColorRepresentation = '#150b1f'): THREE.MeshBasicMaterial {
  const key = `${thickness}|${new THREE.Color(color).getHexString()}`;
  const hit = outlineCache.get(key);
  if (hit) return hit;
  const mat = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
  const uThickness = { value: thickness };
  mat.userData.uThickness = uThickness;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uThickness = uThickness;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uThickness;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += normalize(normal) * uThickness;');
  };
  mat.customProgramCacheKey = () => 'lx-outline';
  outlineCache.set(key, mat);
  return mat;
}

/** Adds an outline hull as a child of the mesh (shares geometry). Returns the outline mesh. */
export function withOutline(mesh: THREE.Mesh, thickness = 0.035, color: THREE.ColorRepresentation = '#150b1f'): THREE.Mesh {
  const o = new THREE.Mesh(mesh.geometry, outlineMaterial(thickness, color));
  o.name = 'outline';
  o.castShadow = false;
  o.receiveShadow = false;
  o.userData.isOutline = true;
  mesh.add(o);
  return o;
}

/** Recursively adds outlines to every non-outline mesh in a group. */
export function outlineAll(root: THREE.Object3D, thickness = 0.035, color: THREE.ColorRepresentation = '#150b1f'): void {
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => { if ((o as THREE.Mesh).isMesh && !o.userData.isOutline && !o.userData.noOutline) meshes.push(o as THREE.Mesh); });
  for (const m of meshes) withOutline(m, thickness, color);
}

const glowCache = new Map<string, THREE.MeshBasicMaterial>();

/** Unlit HDR color for bloom (intensity > 1 blooms). */
export function glow(color: THREE.ColorRepresentation, intensity = 2.2, opts: { transparent?: boolean; opacity?: number; additive?: boolean; side?: THREE.Side; unique?: boolean } = {}): THREE.MeshBasicMaterial {
  const c = new THREE.Color(color).multiplyScalar(intensity);
  const key = `${c.r.toFixed(3)},${c.g.toFixed(3)},${c.b.toFixed(3)}|${opts.transparent ? 1 : 0}|${opts.opacity ?? 1}|${opts.additive ? 1 : 0}|${opts.side ?? 0}`;
  if (!opts.unique) { const hit = glowCache.get(key); if (hit) return hit; }
  const mat = new THREE.MeshBasicMaterial({
    color: c,
    transparent: opts.transparent ?? !!opts.additive,
    opacity: opts.opacity ?? 1,
    blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    depthWrite: !opts.additive,
    side: opts.side ?? THREE.FrontSide,
    fog: false,
  });
  if (!opts.unique) glowCache.set(key, mat);
  return mat;
}

/** Utility: set castShadow/receiveShadow on a hierarchy (skips outlines). */
export function shadows(root: THREE.Object3D, cast = true, receive = false): void {
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && !o.userData.isOutline) { o.castShadow = cast; o.receiveShadow = receive; }
  });
}

/** Palette helpers */
export const PALETTE = {
  night: '#1a1024', deep: '#0d0714', gold: '#d9b36c', ivory: '#f3ead8', violet: '#9b5cff',
  dawn: '#7fe3ff', blood: '#e2455b', ink: '#150b1f',
} as const;

export function shade(color: THREE.ColorRepresentation, amount: number): THREE.Color {
  const c = new THREE.Color(color);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, Math.max(0, Math.min(1, hsl.l + amount)));
  return c;
}
