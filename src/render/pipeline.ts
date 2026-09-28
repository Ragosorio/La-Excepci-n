/**
 * Post-processing pipeline with the anime look:
 * RenderPass → UnrealBloom → OutputPass (Neutral tone mapping + sRGB) → Final (grading, vignette, grain,
 * chromatic aberration, impact frames, speed lines, flashes, mind-warp, letterbox) → FXAA.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';

const FinalShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uAspect: { value: 1 },
    uVignette: { value: 0.55 },
    uSaturation: { value: 1.12 },
    uContrast: { value: 1.04 },
    uBrightness: { value: 0.0 },
    uTint: { value: new THREE.Color(1, 1, 1) },
    uGrain: { value: 0.035 },
    uChromatic: { value: 0.0 },
    uImpact: { value: 0 },
    uImpactMode: { value: 0 },
    uImpactColor: { value: new THREE.Color('#e2455b') },
    uFlash: { value: 0 },
    uFlashColor: { value: new THREE.Color(1, 1, 1) },
    uDesat: { value: 0 },
    uMind: { value: 0 },
    uSpeed: { value: 0 },
    uLetterbox: { value: 0 },
    uFade: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uAspect, uVignette, uSaturation, uContrast, uBrightness, uGrain, uChromatic;
    uniform float uImpact, uImpactMode, uFlash, uDesat, uMind, uSpeed, uLetterbox, uFade;
    uniform vec3 uTint, uFlashColor, uImpactColor;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 uv = vUv;
      if (uMind > 0.001) {
        vec2 c = uv - 0.5;
        float r = length(c);
        float a = uMind * 1.6 * (1.0 - smoothstep(0.0, 0.75, r)) * sin(uTime * 1.3 + r * 6.0);
        float s = sin(a), co = cos(a);
        c = mat2(co, -s, s, co) * c;
        uv = c + 0.5;
      }
      vec2 dir = uv - 0.5;
      float ca = uChromatic * 0.014 + uMind * 0.006;
      vec3 col;
      col.r = texture2D(tDiffuse, uv + dir * ca).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - dir * ca).b;

      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(l), col, uSaturation * (1.0 - uDesat));
      col = (col - 0.5) * uContrast + 0.5 + uBrightness;
      col *= uTint;
      col = mix(col, col * vec3(1.15, 0.75, 1.35), uMind * 0.55);
      col = mix(col, col * vec3(0.8, 0.85, 1.1), uDesat * 0.6);

      vec2 vc = (vUv - 0.5) * vec2(uAspect, 1.0);
      float vig = smoothstep(1.05, 0.25, length(vc));
      col *= mix(1.0, vig, uVignette);

      if (uSpeed > 0.001) {
        float ang = atan(vc.y, vc.x);
        float r = length(vc);
        float seg = floor(ang * 70.0);
        float rnd = hash(vec2(seg, floor(uTime * 24.0)));
        float line = step(0.86, rnd) * smoothstep(0.28 + rnd * 0.2, 0.9, r);
        col = mix(col, vec3(1.0), line * uSpeed * 0.85);
      }

      col += (hash(vUv * (uTime + 3.17)) - 0.5) * uGrain;

      if (uImpact > 0.5) {
        float lum = dot(col, vec3(0.299, 0.587, 0.114));
        if (uImpactMode < 0.5) col = vec3(1.0) - col;
        else if (uImpactMode < 1.5) col = mix(vec3(0.02), vec3(1.0), step(0.42, lum));
        else col = mix(vec3(0.0), uImpactColor, step(0.35, lum));
      }
      col = mix(col, uFlashColor, clamp(uFlash, 0.0, 1.0));
      float lb = uLetterbox * 0.11;
      if (vUv.y < lb || vUv.y > 1.0 - lb) col = vec3(0.0);
      col = mix(col, vec3(0.0), uFade);
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export type Quality = 'alta' | 'media' | 'baja';

export class Pipeline {
  readonly composer: EffectComposer;
  readonly renderPass: RenderPass;
  readonly bloom: UnrealBloomPass;
  readonly output: OutputPass;
  readonly final: ShaderPass;
  readonly fxaa: ShaderPass;
  private impactFrames = 0;
  private flashT = 0; private flashDur = 0; private flashPeak = 0;
  private chromaT = 0; private chromaPeak = 0; private chromaDur = 0;
  /** Persistent (base) values that effects decay back to. */
  base = { chromatic: 0, speed: 0, mind: 0, desat: 0, letterbox: 0, vignette: 0.55, saturation: 1.12 };
  private cur = { speed: 0, mind: 0, desat: 0, letterbox: 0 };
  quality: Quality = 'alta';
  reducedFlashes = false;

  constructor(private renderer: THREE.WebGLRenderer, w: number, h: number) {
    this.composer = new EffectComposer(renderer);
    this.renderPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.55, 0.45, 0.82);
    this.output = new OutputPass();
    this.final = new ShaderPass(FinalShader);
    this.fxaa = new ShaderPass(FXAAShader);
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloom);
    this.composer.addPass(this.output);
    this.composer.addPass(this.final);
    this.composer.addPass(this.fxaa);
    this.resize(w, h, renderer.getPixelRatio());
  }

  get u() { return this.final.uniforms as unknown as typeof FinalShader.uniforms; }

  setQuality(q: Quality): void {
    this.quality = q;
    this.bloom.enabled = q !== 'baja';
    this.fxaa.enabled = q !== 'baja';
  }

  resize(w: number, h: number, dpr: number): void {
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(w, h);
    const bw = Math.floor(w * dpr * (this.quality === 'alta' ? 0.5 : 0.35));
    const bh = Math.floor(h * dpr * (this.quality === 'alta' ? 0.5 : 0.35));
    this.bloom.resolution.set(bw, bh);
    this.u.uAspect.value = w / h;
    const fx = this.fxaa.uniforms as { resolution: { value: THREE.Vector2 } };
    fx.resolution.value.set(1 / (w * dpr), 1 / (h * dpr));
  }

  // ───────────── effects API ─────────────
  /** Anime impact frame: mode 0 invert, 1 black/white, 2 black/red. */
  impact(frames = 2, mode: 0 | 1 | 2 = 1): void {
    if (this.reducedFlashes) { this.flash('#ffffff', 0.25, 0.12); return; }
    this.impactFrames = Math.max(this.impactFrames, frames);
    this.u.uImpactMode.value = mode;
  }
  flash(color: THREE.ColorRepresentation = '#ffffff', intensity = 0.6, duration = 0.25): void {
    this.u.uFlashColor.value.set(color);
    this.flashPeak = this.reducedFlashes ? intensity * 0.35 : intensity;
    this.flashDur = duration; this.flashT = duration;
  }
  chromaticPulse(amount = 1, duration = 0.35): void { this.chromaPeak = amount; this.chromaDur = duration; this.chromaT = duration; }
  setSpeedLines(v: number): void { this.base.speed = v; }
  setMind(v: number): void { this.base.mind = v; }
  setDesat(v: number): void { this.base.desat = v; }
  setLetterbox(v: number): void { this.base.letterbox = v; }
  setFade(v: number): void { this.u.uFade.value = v; }
  setTint(c: THREE.ColorRepresentation): void { this.u.uTint.value.set(c); }
  setGrade(opts: { saturation?: number; contrast?: number; brightness?: number; vignette?: number; grain?: number }): void {
    if (opts.saturation !== undefined) this.base.saturation = opts.saturation;
    if (opts.contrast !== undefined) this.u.uContrast.value = opts.contrast;
    if (opts.brightness !== undefined) this.u.uBrightness.value = opts.brightness;
    if (opts.vignette !== undefined) this.base.vignette = opts.vignette;
    if (opts.grain !== undefined) this.u.uGrain.value = opts.grain;
  }
  setBloom(strength: number, radius = this.bloom.radius, threshold = this.bloom.threshold): void {
    this.bloom.strength = strength; this.bloom.radius = radius; this.bloom.threshold = threshold;
  }
  resetEffects(): void {
    this.base = { chromatic: 0, speed: 0, mind: 0, desat: 0, letterbox: 0, vignette: 0.55, saturation: 1.12 };
    this.u.uTint.value.set(1, 1, 1);
    this.u.uContrast.value = 1.04; this.u.uBrightness.value = 0; this.u.uGrain.value = 0.035;
    this.u.uFade.value = 0;
    this.impactFrames = 0; this.flashT = 0; this.chromaT = 0;
    this.setBloom(0.55, 0.45, 0.82);
  }

  render(scene: THREE.Scene, camera: THREE.Camera, dt: number, time: number): void {
    this.renderPass.scene = scene;
    this.renderPass.camera = camera;
    const u = this.u;
    u.uTime.value = time;
    // decays
    const k = 1 - Math.exp(-8 * dt);
    this.cur.speed += (this.base.speed - this.cur.speed) * k;
    this.cur.mind += (this.base.mind - this.cur.mind) * k;
    this.cur.desat += (this.base.desat - this.cur.desat) * k;
    this.cur.letterbox += (this.base.letterbox - this.cur.letterbox) * (1 - Math.exp(-4 * dt));
    u.uSpeed.value = this.cur.speed;
    u.uMind.value = this.cur.mind;
    u.uDesat.value = this.cur.desat;
    u.uLetterbox.value = this.cur.letterbox;
    u.uVignette.value = this.base.vignette;
    u.uSaturation.value = this.base.saturation;
    if (this.flashT > 0) { this.flashT = Math.max(0, this.flashT - dt); u.uFlash.value = this.flashPeak * (this.flashT / this.flashDur); } else u.uFlash.value = 0;
    if (this.chromaT > 0) { this.chromaT = Math.max(0, this.chromaT - dt); u.uChromatic.value = this.base.chromatic + this.chromaPeak * (this.chromaT / this.chromaDur); } else u.uChromatic.value = this.base.chromatic;
    if (this.impactFrames > 0) { u.uImpact.value = 1; this.impactFrames--; } else u.uImpact.value = 0;
    this.composer.render(dt);
  }
}
