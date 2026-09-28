/**
 * Instanced TABS crowd renderer. One InstancedMesh per part type (+ an outline twin sharing instanceMatrix),
 * matrices written straight from the skeleton joints every frame. Heroes/bosses use full CharacterRigs instead.
 */
import * as THREE from 'three';
import { createFaceAtlas } from '../ui/art/faceAtlas';
import type { Units } from './units';
import { COL_STRIDE, C_BOOTS, C_HAIR, C_OUT, C_OUT2, C_PANTS, C_SKIN, C_TEAM } from './units';
import { specAt, type UnitSpec } from './defs';
import {
  B_BURN, B_CHARM, B_FEAR, B_FROZEN, B_MARK, B_MIND, B_POISON, B_SHIELD, B_STUN, B_TOAD, B_TRAITOR, EX_DEAD, EX_HAPPY, EX_HURT, EX_MIND,
  EX_SCARED, EX_SLEEP, F_CAPTAIN, F_HIDDEN, F_PLAYER, F_RIG, F_ROUT, NJ, S_AIR, S_DEAD, S_HELD,
} from './const';
import { FR, HEAD, TF, WEP, poseUnit } from './pose';
import { writeBasis, writeFlat, writeSeg, writeYaw } from './mathx';
import {
  EXTRA_KINDS, HAIR_KINDS, HEADGEAR_KINDS, WEAPON_KINDS, bannerGeo, extraGeo, faceGeo, foreArmGeo, hairGeo, headGeo, headgearGeo,
  hullOf, iceGeo, markerGeo, robeGeo, shieldGeo, shinGeo, toadGeo, torsoGeo, upperLimbGeo, weaponGeo,
} from './geo';
import { blobTexture, crowdMaterial, faceMaterial, outlineMaterial } from './crowdmat';
import { MAXU } from './const';

interface PartOpts { outline?: boolean; face?: boolean; renderOrder?: number; castShadow?: boolean }

export class PartMesh {
  readonly mesh: THREE.InstancedMesh;
  readonly hull: THREE.InstancedMesh | null = null;
  readonly m: Float32Array;
  readonly col: Float32Array;
  readonly col2: Float32Array;
  readonly fx: Float32Array;
  readonly face: Float32Array | null = null;
  readonly cap: number;
  n = 0;
  private col2Attr: THREE.InstancedBufferAttribute;
  private fxAttr: THREE.InstancedBufferAttribute;
  private faceAttr: THREE.InstancedBufferAttribute | null = null;

  constructor(private root: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, cap: number, o: PartOpts = {}) {
    this.cap = cap;
    this.col2Attr = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.fxAttr = new THREE.InstancedBufferAttribute(new Float32Array(cap * 2), 2).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aCol2', this.col2Attr);
    geo.setAttribute('aFx', this.fxAttr);
    if (o.face) {
      this.faceAttr = new THREE.InstancedBufferAttribute(new Float32Array(cap * 2), 2).setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('aFace', this.faceAttr);
      this.face = this.faceAttr.array as Float32Array;
    }
    const mesh = new THREE.InstancedMesh(geo, mat, cap);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3).setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.count = 0;
    mesh.castShadow = !!o.castShadow;
    mesh.receiveShadow = false;
    if (o.renderOrder !== undefined) mesh.renderOrder = o.renderOrder;
    this.mesh = mesh;
    this.m = mesh.instanceMatrix.array as Float32Array;
    this.col = mesh.instanceColor.array as Float32Array;
    this.col2 = this.col2Attr.array as Float32Array;
    this.fx = this.fxAttr.array as Float32Array;
    root.add(mesh);
    if (o.outline) {
      const hg = hullOf(geo);
      hg.setAttribute('aFx', this.fxAttr);
      const hull = new THREE.InstancedMesh(hg, outlineMaterial(), cap);
      hull.instanceMatrix = mesh.instanceMatrix;
      hull.frustumCulled = false;
      hull.count = 0;
      this.hull = hull;
      root.add(hull);
    }
  }

  begin(): void { this.n = 0; }
  next(): number { return this.n < this.cap ? this.n++ : -1; }

  setCol(k: number, src: Float32Array, o: number): void { this.col[k * 3] = src[o]; this.col[k * 3 + 1] = src[o + 1]; this.col[k * 3 + 2] = src[o + 2]; }
  setCol2(k: number, src: Float32Array, o: number): void { this.col2[k * 3] = src[o]; this.col2[k * 3 + 1] = src[o + 1]; this.col2[k * 3 + 2] = src[o + 2]; }
  setRGB(k: number, r: number, g: number, b: number): void { this.col[k * 3] = r; this.col[k * 3 + 1] = g; this.col[k * 3 + 2] = b; }
  setFx(k: number, flash: number, ghost: number): void { this.fx[k * 2] = flash; this.fx[k * 2 + 1] = ghost; }

  end(): void {
    const n = this.n, mesh = this.mesh;
    mesh.count = n;
    mesh.visible = n > 0;
    if (this.hull) { this.hull.count = n; this.hull.visible = n > 0; }
    if (n === 0) return;
    const im = mesh.instanceMatrix;
    im.clearUpdateRanges(); im.addUpdateRange(0, n * 16); im.needsUpdate = true;
    const ic = mesh.instanceColor!;
    ic.clearUpdateRanges(); ic.addUpdateRange(0, n * 3); ic.needsUpdate = true;
    this.col2Attr.clearUpdateRanges(); this.col2Attr.addUpdateRange(0, n * 3); this.col2Attr.needsUpdate = true;
    this.fxAttr.clearUpdateRanges(); this.fxAttr.addUpdateRange(0, n * 2); this.fxAttr.needsUpdate = true;
    if (this.faceAttr) { this.faceAttr.clearUpdateRanges(); this.faceAttr.addUpdateRange(0, n * 2); this.faceAttr.needsUpdate = true; }
  }

  dispose(): void {
    this.root.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.dispose();
    if (this.hull) { this.root.remove(this.hull); this.hull.geometry.dispose(); this.hull.dispose(); }
  }
}

const TMP = new Float32Array(16);
const OUTMIX = new Float32Array(3);
const IRON3 = new Float32Array([0.25, 0.25, 0.3]);
const BARE_ARMS = new Set(['ogro', 'gigante', 'trol', 'duende']);

export class Crowd {
  readonly root = new THREE.Group();
  private parts: PartMesh[] = [];
  private torso: PartMesh; private head: PartMesh; private face: PartMesh;
  private upper: PartMesh; private fore: PartMesh; private shin: PartMesh;
  private hair: PartMesh[]; private headgear: PartMesh[]; private extras: PartMesh[]; private weapons: PartMesh[];
  private shield: PartMesh; private robe: PartMesh; private banner: PartMesh; private toad: PartMesh;
  private ice: PartMesh; private bubble: PartMesh; private marker: PartMesh; private shadow: PartMesh; private ring: PartMesh;
  private uvTab: Float32Array;
  private atlasTex: THREE.CanvasTexture;
  private mats: THREE.Material[] = [];
  /** Team-color mix into outfits (readability). */
  teamTint = 0.22;

  constructor(scene: THREE.Scene, private groundAt: (x: number, z: number) => number) {
    scene.add(this.root);
    const body = crowdMaterial();
    this.mats.push(body);
    const atlas = createFaceAtlas(128);
    this.atlasTex = new THREE.CanvasTexture(atlas.canvas);
    this.atlasTex.colorSpace = THREE.SRGBColorSpace;
    this.atlasTex.anisotropy = 4;
    const fmat = faceMaterial(this.atlasTex, atlas.cols, atlas.rows);
    this.mats.push(fmat);
    this.uvTab = new Float32Array(atlas.cols * atlas.rows * 2);
    for (let v = 0; v < atlas.rows; v++) for (let e = 0; e < atlas.cols; e++) {
      const uv = atlas.uv(atlas.index(['neutral', 'angry', 'scared', 'hurt', 'dead', 'mind', 'happy', 'sleep', 'determined', 'eating'][e] as never, v));
      this.uvTab[(v * atlas.cols + e) * 2] = uv.u; this.uvTab[(v * atlas.cols + e) * 2 + 1] = uv.v;
    }
    const P = (geo: THREE.BufferGeometry, cap: number, o: PartOpts = { outline: true }, mat: THREE.Material = body) => {
      const p = new PartMesh(this.root, geo, mat, cap, o); this.parts.push(p); return p;
    };
    this.torso = P(torsoGeo(), MAXU);
    this.head = P(headGeo(), MAXU);
    this.face = P(faceGeo(), MAXU, { face: true, renderOrder: 2 }, fmat);
    this.upper = P(upperLimbGeo(), MAXU * 4);
    this.fore = P(foreArmGeo(), MAXU * 2);
    this.shin = P(shinGeo(), MAXU * 2);
    this.hair = HAIR_KINDS.map((k) => P(hairGeo(k), MAXU));
    this.headgear = HEADGEAR_KINDS.map((k) => P(headgearGeo(k), MAXU));
    this.extras = EXTRA_KINDS.map((k) => P(extraGeo(k), MAXU));
    this.weapons = WEAPON_KINDS.map((k) => P(weaponGeo(k), MAXU));
    this.shield = P(shieldGeo(), MAXU);
    this.robe = P(robeGeo(), MAXU);
    this.banner = P(bannerGeo(), 64);
    this.toad = P(toadGeo(), MAXU);
    const iceMat = crowdMaterial({ transparent: true, opacity: 0.62, bands: [0.7, 0.9, 1.0], rim: 0.6 });
    (iceMat as THREE.MeshToonMaterial).depthWrite = false;
    this.mats.push(iceMat);
    this.ice = P(iceGeo(), 256, { renderOrder: 5 }, iceMat);
    const bubMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#7fe3ff').multiplyScalar(1.4), transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    this.mats.push(bubMat);
    this.bubble = P(new THREE.SphereGeometry(1, 16, 12), 256, { renderOrder: 6 }, bubMat);
    const markMat = crowdMaterial({ rim: 0 });
    this.mats.push(markMat);
    this.marker = P(markerGeo(), 256, {}, markMat);
    const shMat = new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    this.mats.push(shMat);
    this.shadow = P(new THREE.CircleGeometry(1, 16).rotateX(-Math.PI / 2), MAXU, { renderOrder: 1 }, shMat);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, fog: true });
    this.mats.push(ringMat);
    this.ring = P(new THREE.RingGeometry(0.8, 1, 24).rotateX(-Math.PI / 2), MAXU, { renderOrder: 1 }, ringMat);
  }

  /** Rebuild all instance buffers from the unit store. `rings` toggles team rings. */
  render(u: Units, time: number, rings = true): void {
    for (const p of this.parts) p.begin();
    const J = u.J, C = u.col;
    const tint = this.teamTint;
    const outMix = OUTMIX;
    for (let i = 0; i < u.n; i++) {
      if (!u.active[i]) continue;
      const st = u.state[i];
      const flags = u.flags[i];
      if (flags & F_HIDDEN) continue;
      const sp = specAt(u.spec[i]);
      const s = u.scale[i];
      const mask = u.stMask[i];
      const ghost = u.ghost[i];
      const flash = u.flash[i];
      const co = i * COL_STRIDE;
      const gy = this.groundAt(u.x[i], u.z[i]);
      const dead = st === S_DEAD;
      if (dead && u.sink[i] > 1.4 * s) continue;

      // ground decals (alive only)
      if (!dead) {
        let k = this.shadow.next();
        if (k >= 0) {
          const air = Math.max(0, u.y[i] - gy);
          const sc = u.radius[i] * 1.55 / (1 + air * 0.15);
          writeFlat(this.shadow.m, k * 16, u.x[i], gy + 0.03, u.z[i], 0, sc);
          this.shadow.setFx(k, 0, 0);
        }
        if (rings && ghost < 0.9) {
          k = this.ring.next();
          if (k >= 0) {
            const big = (flags & F_PLAYER) ? 1.9 + Math.sin(time * 3) * 0.12 : 1.3;
            writeFlat(this.ring.m, k * 16, u.x[i], gy + 0.05, u.z[i], time * ((flags & F_PLAYER) ? 0.6 : 0), u.radius[i] * big);
            this.ring.setCol(k, C, co + C_TEAM);
            this.ring.setFx(k, 0, 0);
          }
        }
      }

      if (flags & F_RIG) { this.statusModels(u, i, sp, time, gy); continue; }

      // toad form
      if ((mask & B_TOAD) && !dead) {
        const k = this.toad.next();
        if (k >= 0) {
          const hop = Math.abs(Math.sin(time * 7 + u.seed[i] * 20)) * 0.35 * Math.min(1, u.stride[i] * 2 + 0.2);
          const ts = Math.max(0.6, s * 0.85);
          writeYaw(this.toad.m, k * 16, u.x[i], u.y[i] + hop, u.z[i], u.yaw[i], ts, ts * (1 + hop * 0.5), ts);
          this.toad.setFx(k, flash, ghost);
        }
        this.statusModels(u, i, sp, time, gy);
        continue;
      }

      const o = i * NJ * 3;
      if (!dead) poseUnit(u, i, sp, time);
      else this.framesFromJoints(u, i);
      // ── sink corpses
      if (dead && u.sink[i] > 0) { const sk = u.sink[i]; for (let j = 0; j < NJ; j++) J[o + j * 3 + 1] -= sk; }

      const d = sp.dims;
      // outfit mixed with team color
      const tm = (mask & (B_MIND | B_TRAITOR)) ? 0.45 : tint;
      outMix[0] = C[co + C_OUT] * (1 - tm) + C[co + C_TEAM] * tm;
      outMix[1] = C[co + C_OUT + 1] * (1 - tm) + C[co + C_TEAM + 1] * tm;
      outMix[2] = C[co + C_OUT + 2] * (1 - tm) + C[co + C_TEAM + 2] * tm;

      // torso
      let k = this.torso.next();
      if (k >= 0) {
        writeSeg(this.torso.m, k * 16, J[o + 6], J[o + 7], J[o + 8], J[o + 3], J[o + 4], J[o + 5], TF[0], TF[1], TF[2], d.torsoW * s, d.torsoD * s, 0.14 * s);
        this.torso.setCol(k, outMix, 0); this.torso.setCol2(k, C, co + C_OUT2); this.torso.setFx(k, flash, ghost);
      }
      // head (+ face, hair/headgear, extras share the head matrix)
      const hr = d.headR * s;
      k = this.head.next();
      if (k >= 0) {
        writeBasis(this.head.m, k * 16, J[o], J[o + 1], J[o + 2], HEAD[0], HEAD[1], HEAD[2], HEAD[3], HEAD[4], HEAD[5], hr, hr, hr);
        this.head.setCol(k, C, co + C_SKIN); this.head.setFx(k, flash, ghost);
        for (let q = 0; q < 16; q++) TMP[q] = this.head.m[k * 16 + q];
        // face
        const kf = this.face.next();
        if (kf >= 0 && this.face.face) {
          for (let q = 0; q < 16; q++) this.face.m[kf * 16 + q] = TMP[q];
          const ex = this.exprOf(u, i, dead, mask, flags);
          const ui = ((u.variant[i] & 3) * 10 + ex) * 2;
          this.face.face[kf * 2] = this.uvTab[ui]; this.face.face[kf * 2 + 1] = this.uvTab[ui + 1];
          this.face.setFx(kf, 0, ghost);
        }
        const hg = sp.headgearMesh;
        if (hg >= 0) {
          const p = this.headgear[hg], kh = p.next();
          if (kh >= 0) {
            for (let q = 0; q < 16; q++) p.m[kh * 16 + q] = TMP[q];
            p.setCol(kh, outMix, 0);
            if (hg === 0) p.setCol2(kh, C, co + C_TEAM); else p.setCol2(kh, C, co + C_OUT2);
            p.setFx(kh, flash, ghost);
          }
        } else if (u.hair[i] >= 0) {
          const p = this.hair[u.hair[i]], kh = p.next();
          if (kh >= 0) { for (let q = 0; q < 16; q++) p.m[kh * 16 + q] = TMP[q]; p.setCol(kh, C, co + C_HAIR); p.setFx(kh, flash, ghost); }
        }
        if (sp.extraMesh >= 0) {
          const p = this.extras[sp.extraMesh], kx = p.next();
          if (kx >= 0) { for (let q = 0; q < 16; q++) p.m[kx * 16 + q] = TMP[q]; p.setCol(kx, C, co + C_SKIN); p.setCol2(kx, C, co + C_HAIR); p.setFx(kx, flash, ghost); }
        }
      }

      // limbs
      const bare = BARE_ARMS.has(sp.race);
      const armCo = bare ? co + C_SKIN : -1;
      const aw = d.armW * s, lw = d.legW * s;
      for (let side = 0; side < 2; side++) {
        const js = 3 + side, je = 5 + side, jh = 7 + side, jhip = 9 + side, jk = 11 + side, jf = 13 + side;
        k = this.upper.next();
        if (k >= 0) {
          writeSeg(this.upper.m, k * 16, J[o + js * 3], J[o + js * 3 + 1], J[o + js * 3 + 2], J[o + je * 3], J[o + je * 3 + 1], J[o + je * 3 + 2], TF[0], TF[1], TF[2], aw, aw, aw * 0.6);
          if (armCo >= 0) this.upper.setCol(k, C, armCo); else this.upper.setCol(k, outMix, 0);
          this.upper.setFx(k, flash, ghost);
        }
        k = this.fore.next();
        if (k >= 0) {
          writeSeg(this.fore.m, k * 16, J[o + je * 3], J[o + je * 3 + 1], J[o + je * 3 + 2], J[o + jh * 3], J[o + jh * 3 + 1], J[o + jh * 3 + 2], TF[0], TF[1], TF[2], aw * 0.92, aw * 0.92, aw * 0.3);
          if (armCo >= 0) this.fore.setCol(k, C, armCo); else this.fore.setCol(k, outMix, 0);
          if (sp.headgearMesh === 0 && !bare) this.fore.setCol2(k, IRON3, 0); else this.fore.setCol2(k, C, co + C_SKIN);
          this.fore.setFx(k, flash, ghost);
        }
        k = this.upper.next();
        if (k >= 0) {
          writeSeg(this.upper.m, k * 16, J[o + jhip * 3], J[o + jhip * 3 + 1], J[o + jhip * 3 + 2], J[o + jk * 3], J[o + jk * 3 + 1], J[o + jk * 3 + 2], FR[0], FR[1], FR[2], lw, lw, lw * 0.5);
          this.upper.setCol(k, C, bare ? co + C_SKIN : co + C_PANTS); this.upper.setFx(k, flash, ghost);
        }
        k = this.shin.next();
        if (k >= 0) {
          writeSeg(this.shin.m, k * 16, J[o + jk * 3], J[o + jk * 3 + 1], J[o + jk * 3 + 2], J[o + jf * 3], J[o + jf * 3 + 1], J[o + jf * 3 + 2], FR[0], FR[1], FR[2], lw * 0.9, lw * 0.9, 0);
          this.shin.setCol(k, C, bare ? co + C_SKIN : co + C_PANTS); this.shin.setCol2(k, C, co + C_BOOTS); this.shin.setFx(k, flash, ghost);
        }
      }

      // weapon
      if (sp.weaponMesh >= 0) {
        const p = this.weapons[sp.weaponMesh], kw = p.next();
        if (kw >= 0) {
          const bow = sp.weapon === 'arco';
          const jh = bow ? 7 : 8;
          writeBasis(p.m, kw * 16, J[o + jh * 3], J[o + jh * 3 + 1], J[o + jh * 3 + 2], WEP[0], WEP[1], WEP[2], WEP[3], WEP[4], WEP[5], s, s, s);
          p.setCol(kw, outMix, 0); p.setCol2(kw, C, co + C_TEAM); p.setFx(kw, flash, ghost);
        }
      }
      if (sp.shield) {
        const ks = this.shield.next();
        if (ks >= 0) {
          const mx = (J[o + 15] + J[o + 21]) * 0.5 + TF[0] * 0.04 * s, my = (J[o + 16] + J[o + 22]) * 0.5 + TF[1] * 0.04 * s, mz = (J[o + 17] + J[o + 23]) * 0.5 + TF[2] * 0.04 * s;
          writeBasis(this.shield.m, ks * 16, mx, my, mz, TF[3], TF[4], TF[5], TF[0] - TF[6] * 0.35, TF[1] - TF[7] * 0.35, TF[2] - TF[8] * 0.35, s, s, s);
          this.shield.setCol(ks, C, co + C_TEAM); this.shield.setCol2(ks, C, co + C_OUT2); this.shield.setFx(ks, flash, ghost);
        }
      }
      if (sp.robe) {
        const kr = this.robe.next();
        if (kr >= 0) {
          const rw = s * d.w * (1 + d.belly * 0.6);
          writeBasis(this.robe.m, kr * 16, J[o + 6], J[o + 7], J[o + 8], FR[3], FR[4], FR[5], FR[0], FR[1], FR[2], rw, s * d.legLen, rw);
          this.robe.setCol(kr, outMix, 0); this.robe.setCol2(kr, C, co + C_OUT2); this.robe.setFx(kr, flash, ghost);
        }
      }
      if ((flags & F_CAPTAIN) && !dead) {
        const kb = this.banner.next();
        if (kb >= 0) {
          writeBasis(this.banner.m, kb * 16, J[o + 6], J[o + 7], J[o + 8], TF[3], TF[4], TF[5], TF[0], TF[1], TF[2], s, s, s);
          this.banner.setCol(kb, C, co + C_TEAM); this.banner.setFx(kb, flash, ghost);
        }
      }
      if (!dead) this.statusModels(u, i, sp, time, gy);
    }
    for (const p of this.parts) p.end();
  }

  private statusModels(u: Units, i: number, sp: UnitSpec, time: number, gy: number): void {
    const mask = u.stMask[i];
    if (!(mask & (B_FROZEN | B_SHIELD | B_MARK))) return;
    const s = u.scale[i], h = sp.height * (s / sp.scale);
    if (mask & B_FROZEN) {
      const k = this.ice.next();
      if (k >= 0) { const r = u.radius[i] * 2.5; writeYaw(this.ice.m, k * 16, u.x[i], Math.min(u.y[i], gy + 0.3) - 0.1, u.z[i], u.seed[i] * 6, r, h * 1.08, r); this.ice.setFx(k, 0, 0); }
    }
    if (mask & B_SHIELD) {
      const k = this.bubble.next();
      if (k >= 0) { const r = h * 0.62; writeYaw(this.bubble.m, k * 16, u.x[i], u.y[i] + h * 0.5, u.z[i], time, r, r, r); this.bubble.setFx(k, 0, 0); }
    }
    if (mask & B_MARK) {
      const k = this.marker.next();
      if (k >= 0) { writeYaw(this.marker.m, k * 16, u.x[i], u.y[i] + h + 0.45 + Math.sin(time * 4) * 0.08, u.z[i], time * 3, Math.max(1, s), Math.max(1, s), Math.max(1, s)); this.marker.setFx(k, 0, 0); }
    }
  }

  private exprOf(u: Units, i: number, dead: boolean, mask: number, flags: number): number {
    if (dead) return EX_DEAD;
    if (mask & (B_MIND | B_TRAITOR)) return EX_MIND;
    if (u.exprT[i] > 0) return u.exprTmp[i];
    if (u.state[i] === S_AIR || u.state[i] === S_HELD) return EX_SCARED;
    if ((mask & B_FEAR) || (flags & F_ROUT)) return EX_SCARED;
    if (mask & B_STUN) return EX_HURT;
    if (mask & B_CHARM) return EX_HAPPY;
    if (mask & (B_BURN | B_POISON)) return EX_HURT;
    const e = u.expr[i];
    if (u.blinkT[i] < 0.12 && e !== EX_SCARED && e !== EX_HURT) return EX_SLEEP;
    return e;
  }

  /** Torso/head/weapon frames for a ragdoll (joints already simulated). */
  private framesFromJoints(u: Units, i: number): void {
    const J = u.J, o = i * NJ * 3;
    let ux = J[o + 3] - J[o + 6], uy = J[o + 4] - J[o + 7], uz = J[o + 5] - J[o + 8];
    let l = Math.hypot(ux, uy, uz) || 1; ux /= l; uy /= l; uz /= l;
    let rx = J[o + 12] - J[o + 9], ry = J[o + 13] - J[o + 10], rz = J[o + 14] - J[o + 11];
    l = Math.hypot(rx, ry, rz) || 1; rx /= l; ry /= l; rz /= l;
    // F = U × R
    const fx = uy * rz - uz * ry, fy = uz * rx - ux * rz, fz = ux * ry - uy * rx;
    TF[0] = fx; TF[1] = fy; TF[2] = fz; TF[3] = ux; TF[4] = uy; TF[5] = uz; TF[6] = rx; TF[7] = ry; TF[8] = rz;
    FR.set(TF);
    let hx = J[o] - J[o + 3], hy = J[o + 1] - J[o + 4], hz = J[o + 2] - J[o + 5];
    l = Math.hypot(hx, hy, hz) || 1;
    HEAD[0] = hx / l; HEAD[1] = hy / l; HEAD[2] = hz / l; HEAD[3] = fx; HEAD[4] = fy; HEAD[5] = fz;
    hx = J[o + 24] - J[o + 18]; hy = J[o + 25] - J[o + 19]; hz = J[o + 26] - J[o + 20];
    l = Math.hypot(hx, hy, hz) || 1;
    WEP[0] = hx / l; WEP[1] = hy / l; WEP[2] = hz / l; WEP[3] = rx; WEP[4] = ry; WEP[5] = rz;
  }

  dispose(): void {
    for (const p of this.parts) p.dispose();
    this.parts.length = 0;
    for (const m of this.mats) m.dispose();
    this.atlasTex.dispose();
    this.root.removeFromParent();
  }
}

