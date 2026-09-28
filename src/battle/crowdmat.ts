/**
 * Materials for the instanced crowd:
 *  - crowdMaterial(): MeshToonMaterial + anime rim + per-vertex tint channel selection (vertex / instanceColor / aCol2)
 *    + per-instance aFx (x = white hit flash, y = invisibility dither).
 *  - outlineMaterial(): inverted hull extruded in clip space (constant pixel width), instancing-aware, fogged.
 *  - faceMaterial(): face-atlas decal with a per-instance UV offset (aFace).
 */
import * as THREE from 'three';
import { gradientTexture } from '../render/toon';

const DITHER = /* glsl */ `
  float btDither(vec2 fc) { return fract(sin(dot(floor(fc), vec2(12.9898, 78.233))) * 43758.5453); }
`;

export function crowdMaterial(opts: { rim?: number; bands?: number[]; transparent?: boolean; opacity?: number } = {}): THREE.MeshToonMaterial {
  const mat = new THREE.MeshToonMaterial({
    color: 0xffffff, vertexColors: true, gradientMap: gradientTexture(opts.bands ?? [0.42, 0.78, 1.0]),
    transparent: !!opts.transparent, opacity: opts.opacity ?? 1,
  });
  const rim = opts.rim ?? 0.28;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uRimColor = { value: new THREE.Color('#fff4e8') };
    sh.uniforms.uRimStrength = { value: rim };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aTint;\nattribute vec3 aCol2;\nattribute vec2 aFx;\nvarying vec2 vFx;')
      .replace('#include <color_vertex>', /* glsl */ `
        #if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA ) || defined( USE_INSTANCING_COLOR )
          vColor = vec4( 1.0 );
        #endif
        #ifdef USE_COLOR_ALPHA
          vColor *= color;
        #elif defined( USE_COLOR )
          vColor.rgb *= color.rgb;
        #endif
        #ifdef USE_INSTANCING_COLOR
          vec3 btTint = mix( vec3( 1.0 ), instanceColor.rgb, clamp( aTint, 0.0, 1.0 ) );
          btTint = mix( btTint, aCol2, clamp( aTint - 1.0, 0.0, 1.0 ) );
          vColor.rgb *= btTint;
        #endif
        vFx = aFx;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform vec3 uRimColor;\nuniform float uRimStrength;\nvarying vec2 vFx;\n${DITHER}`)
      .replace('#include <clipping_planes_fragment>', /* glsl */ `#include <clipping_planes_fragment>
        if ( vFx.y > 0.001 && btDither( gl_FragCoord.xy ) < vFx.y ) discard;`)
      .replace('#include <opaque_fragment>', /* glsl */ `{
          vec3 vdir = normalize( vViewPosition );
          float rimF = 1.0 - max( dot( normal, vdir ), 0.0 );
          outgoingLight += uRimColor * uRimStrength * smoothstep( 0.62, 0.7, rimF );
          outgoingLight = mix( outgoingLight, vec3( 1.35, 1.3, 1.25 ), clamp( vFx.x, 0.0, 1.0 ) );
        }
        #include <opaque_fragment>`);
  };
  mat.customProgramCacheKey = () => 'bt-crowd-' + rim;
  return mat;
}

let outlineMat: THREE.ShaderMaterial | null = null;

/** Shared instanced outline (hull) material. Call setOutlineResolution on resize. */
export function outlineMaterial(): THREE.ShaderMaterial {
  if (outlineMat) return outlineMat;
  outlineMat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uInk: { value: new THREE.Color('#150b1f') }, uPx: { value: 2.1 }, uRes: { value: new THREE.Vector2(1920, 1080) },
    }]),
    vertexShader: /* glsl */ `
      #include <common>
      #include <fog_pars_vertex>
      attribute vec2 aFx;
      varying float vGhost;
      uniform float uPx;
      uniform vec2 uRes;
      void main() {
        mat4 m = modelMatrix;
        #ifdef USE_INSTANCING
          m = m * instanceMatrix;
        #endif
        vec4 wp = m * vec4( position, 1.0 );
        mat3 im = mat3( m );
        vec3 n = normal / vec3( dot( im[0], im[0] ), dot( im[1], im[1] ), dot( im[2], im[2] ) );
        n = normalize( im * n );
        vec4 mvPosition = viewMatrix * wp;
        vec4 clip = projectionMatrix * mvPosition;
        vec3 vn = normalize( mat3( viewMatrix ) * n );
        vec2 d = ( projectionMatrix * vec4( vn, 0.0 ) ).xy;
        float l = length( d );
        d = l > 1e-5 ? d / l : vec2( 0.0 );
        float px = uPx * clamp( 18.0 / max( clip.w, 0.001 ), 0.55, 1.0 );
        clip.xy += d * px * 2.0 / uRes * clip.w;
        gl_Position = clip;
        vGhost = aFx.y;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      uniform vec3 uInk;
      varying float vGhost;
      ${DITHER}
      void main() {
        if ( vGhost > 0.001 && btDither( gl_FragCoord.xy ) < vGhost ) discard;
        gl_FragColor = vec4( uInk, 1.0 );
        #include <fog_fragment>
      }`,
    side: THREE.BackSide,
    fog: true,
  });
  return outlineMat;
}

export function setOutlineResolution(w: number, h: number): void {
  outlineMaterial().uniforms.uRes.value.set(Math.max(1, w), Math.max(1, h));
}

export function faceMaterial(tex: THREE.Texture, cols: number, rows: number): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({
    map: tex, transparent: true, alphaTest: 0.05, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, fog: true,
  });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uCell = { value: new THREE.Vector2(1 / cols, 1 / rows) };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aFace;\nattribute vec2 aFx;\nvarying float vGhost;\nuniform vec2 uCell;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv = uv * uCell + aFace;\n#endif\nvGhost = aFx.y;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying float vGhost;\n${DITHER}`)
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif ( vGhost > 0.001 && btDither( gl_FragCoord.xy ) < vGhost ) discard;');
  };
  m.customProgramCacheKey = () => 'bt-face';
  return m;
}

let blobTex: THREE.CanvasTexture | null = null;
export function blobTexture(): THREE.CanvasTexture {
  if (blobTex) return blobTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(0,0,0,0.5)'); grd.addColorStop(0.55, 'rgba(0,0,0,0.3)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  blobTex = new THREE.CanvasTexture(c);
  return blobTex;
}
