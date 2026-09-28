/**
 * The forest of the mist ("el bosque de la bruma") before dawn: Las Colmenas (communal tower-homes with warm windows)
 * at the western edge, a dirt path, the log at the forest edge facing east over a misty valley where the sun rises.
 * Painted terrain (no outlines), outlined trees/props, layered fog (planes + sprites), god rays, birds, fireflies.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toon, outlineMaterial, glow } from '../../render/toon';

// ───────────────────────────── noise ─────────────────────────────

function hash2(x: number, y: number): number { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x: number, y: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy), b = hash2(ix + 1, iy), c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}
const sstep = (a: number, b: number, v: number) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Vertex-colored primitive merger (props). */
function colored(g: THREE.BufferGeometry, color: string, m: THREE.Matrix4): THREE.BufferGeometry {
  const c = (g.index ? g.toNonIndexed() : g.clone());
  c.applyMatrix4(m);
  const col = new THREE.Color(color);
  const n = c.getAttribute('position').count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = col.r; arr[i * 3 + 1] = col.g; arr[i * 3 + 2] = col.b; }
  c.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  if (c.getAttribute('uv')) c.deleteAttribute('uv');
  return c;
}
const M = (x: number, y: number, z: number, sx: number, sy: number, sz: number, rx = 0, ry = 0, rz = 0) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));

function fogTexture(): THREE.CanvasTexture {
  const S = 256;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d')!;
  const rnd = mulberry(77);
  for (let i = 0; i < 60; i++) {
    const x = rnd() * S, y = rnd() * S, r = S * (0.08 + rnd() * 0.22), a = 0.05 + rnd() * 0.11;
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
      const grd = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
      grd.addColorStop(0, `rgba(255,255,255,${a})`); grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd; g.beginPath(); g.arc(x + ox, y + oy, r, 0, Math.PI * 2); g.fill();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function puffTexture(): THREE.CanvasTexture {
  const S = 128;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d')!;
  const rnd = mulberry(5);
  for (let i = 0; i < 14; i++) {
    const x = S / 2 + (rnd() - 0.5) * S * 0.45, y = S / 2 + (rnd() - 0.5) * S * 0.3, r = S * (0.16 + rnd() * 0.18);
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, 'rgba(255,255,255,0.28)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  return new THREE.CanvasTexture(c);
}

function rayTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = 64; c.height = 256;
  const g = c.getContext('2d')!;
  const along = g.createLinearGradient(0, 0, 0, 256);
  along.addColorStop(0, 'rgba(255,255,255,0.0)'); along.addColorStop(0.08, 'rgba(255,255,255,0.9)'); along.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = along; g.fillRect(0, 0, 64, 256);
  g.globalCompositeOperation = 'destination-in';
  const across = g.createLinearGradient(0, 0, 64, 0);
  across.addColorStop(0, 'rgba(0,0,0,0)'); across.addColorStop(0.5, 'rgba(0,0,0,1)'); across.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = across; g.fillRect(0, 0, 64, 256);
  return new THREE.CanvasTexture(c);
}

// ───────────────────────────── the set ─────────────────────────────

interface Ray { mesh: THREE.Mesh; target: THREE.Vector3; width: number }
interface Bird { g: THREE.Group; wl: THREE.Mesh; wr: THREE.Mesh; off: THREE.Vector3; ph: number }

export class Forest {
  readonly group = new THREE.Group();
  readonly logPos = new THREE.Vector3(0, 0, 0);
  /** Where the boy looks (east, toward the sunrise). */
  readonly faceDir = new THREE.Vector3(1, 0, 0.35).normalize();
  readonly right = new THREE.Vector3();
  readonly startPos = new THREE.Vector3(-50, 0, 7);
  readonly homePos = new THREE.Vector3(-58, 0, 7);
  readonly shadowPos = new THREE.Vector3();
  readonly path: THREE.CatmullRomCurve3;
  private pathPts: THREE.Vector2[] = [];
  private windowMat: THREE.MeshBasicMaterial;
  private lampMat: THREE.MeshBasicMaterial;
  private lights: THREE.PointLight[] = [];
  private fogPlanes: THREE.Mesh[] = [];
  private fogPlaneMat: THREE.MeshBasicMaterial[] = [];
  private fogSprites: THREE.Sprite[] = [];
  private fogSpriteMat: THREE.SpriteMaterial;
  private rays: Ray[] = [];
  private rayMat: THREE.MeshBasicMaterial;
  private rayOrigin = new THREE.Vector3();
  private birds: Bird[] = [];
  private birdT = -1;
  private flies: THREE.Points;
  private fliesMat: THREE.ShaderMaterial;
  private grassMat: THREE.MeshToonMaterial;
  private windU = { value: 0 };
  private disposables: Array<{ dispose(): void }> = [];
  private t = 0;
  rays01 = 0;
  lamps01 = 0;
  fireflies01 = 0;

  constructor(seed = 11) {
    const rnd = mulberry(seed);
    this.right.set(-this.faceDir.z, 0, this.faceDir.x);
    this.shadowPos.copy(this.logPos).addScaledVector(this.faceDir, 9.5).addScaledVector(this.right, 0.6);
    this.path = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-56, 0, 7), new THREE.Vector3(-46, 0, 3), new THREE.Vector3(-35, 0, 6), new THREE.Vector3(-24, 0, 1.5),
      new THREE.Vector3(-14, 0, -1.5), new THREE.Vector3(-6, 0, 0.8), new THREE.Vector3(-1.4, 0, 0.2),
    ]);
    for (const p of this.path.getSpacedPoints(160)) this.pathPts.push(new THREE.Vector2(p.x, p.z));
    this.startPos.y = this.height(this.startPos.x, this.startPos.z);
    this.homePos.y = this.height(this.homePos.x, this.homePos.z);
    this.shadowPos.y = this.height(this.shadowPos.x, this.shadowPos.z);

    this.buildGround();
    this.buildTrees(rnd);
    this.windowMat = new THREE.MeshBasicMaterial({ color: '#ffffff', fog: true });
    this.lampMat = glow('#ffcf7a', 2.6, { unique: true });
    this.buildColmenas(rnd);
    this.buildLogAndProps(rnd);
    this.grassMat = this.buildGrass(rnd);
    this.fogSpriteMat = new THREE.SpriteMaterial({ map: puffTexture(), color: '#a6adc8', transparent: true, opacity: 0.3, depthWrite: false, fog: true });
    this.buildFog(rnd);
    this.rayMat = new THREE.MeshBasicMaterial({ map: rayTexture(), color: new THREE.Color('#ffd89a').multiplyScalar(1.6), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    this.buildRays(rnd);
    this.buildBirds();
    const f = this.buildFireflies(rnd);
    this.flies = f.pts; this.fliesMat = f.mat;
    this.setLamps(0.6);
  }

  // ───────────── terrain ─────────────
  distToPath(x: number, z: number): number {
    let best = Infinity;
    for (const p of this.pathPts) { const dx = p.x - x, dz = p.y - z; const d = dx * dx + dz * dz; if (d < best) best = d; }
    return Math.sqrt(best);
  }

  height(x: number, z: number): number {
    let y = vnoise(x * 0.045, z * 0.045) * 0.9 + vnoise(x * 0.13 + 3, z * 0.13 - 7) * 0.3 - 0.6;
    const dl = Math.hypot(x - this.logPos.x, z - this.logPos.z);
    y *= sstep(2.5, 10, dl);
    y -= sstep(5, 70, x) * 10;                                               // the valley
    y += sstep(130, 260, x) * 18 * (0.65 + 0.5 * vnoise(z * 0.018, 3.3));     // far hills (low: let the dawn show)
    y += sstep(45, 120, Math.abs(z - x * 0.35)) * 7 * sstep(10, 60, x);        // valley walls
    y += sstep(-70, -110, x) * 5;                                            // behind the Colmenas
    return y;
  }

  private buildGround(): void {
    const geo = new THREE.PlaneGeometry(480, 480, 170, 170);
    geo.rotateX(-Math.PI / 2);
    geo.translate(60, 0, 0);
    const pos = geo.getAttribute('position');
    const cols = new Float32Array(pos.count * 3);
    const cForest = new THREE.Color('#223527'), cForest2 = new THREE.Color('#2d4630'), cPath = new THREE.Color('#5e4c3a');
    const cClear = new THREE.Color('#3a5533'), cMeadow = new THREE.Color('#4d6d3c'), cMeadow2 = new THREE.Color('#3e5d37'), cHill = new THREE.Color('#283d31');
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const y = this.height(x, z);
      pos.setY(i, y);
      const n = vnoise(x * 0.2, z * 0.2);
      c.copy(cForest).lerp(cForest2, n);
      const meadow = sstep(-2, 10, x);
      if (meadow > 0) c.lerp(new THREE.Color().copy(cMeadow).lerp(cMeadow2, vnoise(x * 0.09, z * 0.09)), meadow);
      c.lerp(cHill, sstep(80, 170, x));
      const dl = Math.hypot(x - this.logPos.x, z - this.logPos.z);
      c.lerp(cClear, (1 - sstep(3, 9, dl)) * 0.7);
      if (x > -80 && x < 4 && Math.abs(z) < 30) {
        const dp = this.distToPath(x, z);
        c.lerp(cPath, (1 - sstep(0.9, 2.1, dp)) * (0.75 + n * 0.2));
      }
      cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    geo.computeVertexNormals();
    const ground = new THREE.Mesh(geo, toon('#ffffff', { vertexColors: true, bands: [0.62, 0.84, 1.0], unique: true }));
    ground.receiveShadow = true;
    ground.userData.noOutline = true;
    this.group.add(ground);
    this.disposables.push(geo, ground.material as THREE.Material);
    this.buildPathRibbon();
  }

  /** Dirt path ribbon (the ground grid is too coarse for a crisp path). */
  private buildPathRibbon(): void {
    const n = 220;
    const pts = this.path.getSpacedPoints(n);
    const pos: number[] = [], col: number[] = [], idx: number[] = [];
    const dirt = new THREE.Color('#6a5440'), edge = new THREE.Color('#4f5a39');
    for (let i = 0; i <= n; i++) {
      const p = pts[i];
      const q = pts[Math.min(n, i + 1)], o = pts[Math.max(0, i - 1)];
      const tx = q.x - o.x, tz = q.z - o.z;
      const tl = Math.hypot(tx, tz) || 1;
      const nx = -tz / tl, nz = tx / tl;
      const w = 0.85 + Math.sin(i * 0.37) * 0.12;
      for (const k of [-1.35, -1, 0, 1, 1.35]) {
        const x = p.x + nx * w * k, z = p.z + nz * w * k;
        pos.push(x, this.height(x, z) + 0.035, z);
        const c = Math.abs(k) > 1.2 ? edge : dirt;
        col.push(c.r, c.g, c.b);
      }
    }
    for (let i = 0; i < n; i++) for (let j = 0; j < 4; j++) {
      const a = i * 5 + j, b = a + 1, c = a + 5, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, toon('#ffffff', { vertexColors: true, bands: [0.62, 0.84, 1.0], unique: true, side: THREE.DoubleSide }));
    m.receiveShadow = true;
    m.userData.noOutline = true;
    this.group.add(m);
    this.disposables.push(g, m.material as THREE.Material);
  }

  // ───────────── trees ─────────────
  private buildTrees(rnd: () => number): void {
    const conifer = mergeGeometries([
      colored(new THREE.CylinderGeometry(0.16, 0.26, 2.2, 7), '#4a3526', M(0, 1.1, 0, 1, 1, 1)),
      colored(new THREE.ConeGeometry(1.7, 3.2, 9), '#1f3b2e', M(0, 3.0, 0, 1, 1, 1)),
      colored(new THREE.ConeGeometry(1.35, 2.8, 9), '#244435', M(0, 4.6, 0, 1, 1, 1, 0, 0.4, 0)),
      colored(new THREE.ConeGeometry(0.95, 2.4, 9), '#2a4d3a', M(0, 6.0, 0, 1, 1, 1, 0, 0.9, 0)),
    ], false)!;
    const broad = mergeGeometries([
      colored(new THREE.CylinderGeometry(0.18, 0.3, 2.6, 7), '#4f3a2a', M(0, 1.3, 0, 1, 1, 1)),
      colored(new THREE.IcosahedronGeometry(1.6, 1), '#2e5236', M(0, 3.6, 0, 1.1, 0.95, 1.1)),
      colored(new THREE.IcosahedronGeometry(1.15, 1), '#35603c', M(0.8, 4.4, 0.3, 1, 0.9, 1)),
      colored(new THREE.IcosahedronGeometry(1.05, 1), '#2a4a33', M(-0.7, 4.1, -0.4, 1, 0.9, 1)),
    ], false)!;
    const matC = toon('#ffffff', { vertexColors: true, bands: [0.5, 0.78, 1.0], rim: 0.12, rimColor: '#ffe7c0', unique: true });
    const conPos: THREE.Matrix4[] = [], broadPos: THREE.Matrix4[] = [];
    const tintsC: THREE.Color[] = [], tintsB: THREE.Color[] = [];
    const L = this.logPos, F = this.faceDir;
    const ok = (x: number, z: number) => {
      if (Math.hypot(x - L.x, z - L.z) < 6.5) return false;
      if (x > -76 && x < 4 && this.distToPath(x, z) < 4.4) return false;
      if (x < -52 && x > -84 && Math.abs(z) < 22) return false;             // the Colmenas clearing
      if (x > -3) { const along = (x - L.x) * F.x + (z - L.z) * F.z; const across = Math.abs(-(x - L.x) * F.z + (z - L.z) * F.x); if (along > 0 && across < 9 + along * 0.55) return false; }
      return true;
    };
    let tries = 0;
    while (conPos.length + broadPos.length < 520 && tries++ < 6000) {
      const x = -86 + rnd() * 96, z = -64 + rnd() * 128;
      if (!ok(x, z)) continue;
      const s = 0.75 + rnd() * 0.85;
      const m = M(x, this.height(x, z) - 0.1, z, s, s * (0.9 + rnd() * 0.35), s, 0, rnd() * 6.28, (rnd() - 0.5) * 0.06);
      const tint = new THREE.Color().setHSL(0.3 + rnd() * 0.05, 0.25, 0.4 + rnd() * 0.25);
      if (rnd() < 0.72) { conPos.push(m); tintsC.push(tint.multiplyScalar(2.1)); } else { broadPos.push(m); tintsB.push(tint.multiplyScalar(2.1)); }
    }
    // distant silhouettes on the hills and valley walls (cheap: they're mostly fog)
    tries = 0;
    let far = 0;
    while (far < 520 && tries++ < 8000) {
      const x = 20 + rnd() * 200, z = -170 + rnd() * 340;
      const across = Math.abs(z - x * 0.35);
      if (across < 26 && x < 120) continue;
      const s = 1.1 + rnd() * 1.4;
      conPos.push(M(x, this.height(x, z) - 0.2, z, s, s, s, 0, rnd() * 6.28, 0));
      tintsC.push(new THREE.Color().setHSL(0.33, 0.2, 0.3 + rnd() * 0.12).multiplyScalar(2));
      far++;
    }
    const mk = (geo: THREE.BufferGeometry, list: THREE.Matrix4[], tints: THREE.Color[]) => {
      const im = new THREE.InstancedMesh(geo, matC, list.length);
      const om = new THREE.InstancedMesh(geo, outlineMaterial(0.05, '#131a17'), list.length);
      list.forEach((m, i) => { im.setMatrixAt(i, m); om.setMatrixAt(i, m); im.setColorAt(i, tints[i]); });
      im.castShadow = true; im.receiveShadow = false; om.userData.isOutline = true;
      im.computeBoundingSphere(); om.computeBoundingSphere();
      this.group.add(im, om);
      this.disposables.push(geo);
    };
    mk(conifer, conPos, tintsC);
    mk(broad, broadPos, tintsB);
    this.disposables.push(matC);
  }

  // ───────────── Las Colmenas ─────────────
  private buildColmenas(rnd: () => number): void {
    const towers = [
      { x: -66, z: -12, r: 3.1, n: 6 }, { x: -72, z: 3, r: 3.6, n: 7 }, { x: -64, z: 14, r: 2.8, n: 5 },
      { x: -78, z: -6, r: 2.9, n: 5 }, { x: -80, z: 13, r: 3.2, n: 6 }, { x: -58, z: -24, r: 2.4, n: 4 },
    ];
    const winPos: THREE.Matrix4[] = [];
    const winCol: THREE.Color[] = [];
    const warm = new THREE.Color(1, 0.72, 0.38), dark = new THREE.Color(0.05, 0.04, 0.05);
    const mat = toon('#ffffff', { vertexColors: true, bands: [0.5, 0.8, 1.0], rim: 0.15, unique: true });
    const parts: THREE.BufferGeometry[] = [];
    const hex = new THREE.CylinderGeometry(1, 1, 1, 6, 1);
    const cone6 = new THREE.ConeGeometry(1, 1, 6, 1);
    for (const tw of towers) {
      const base = this.height(tw.x, tw.z) - 0.3;
      let y = base;
      const lvlH = 3.1;
      for (let i = 0; i < tw.n; i++) {
        const r = tw.r * (1 - i * 0.035);
        const rot = (i % 2) * 0.12;
        parts.push(colored(hex, i % 2 ? '#c9b597' : '#bda88a', M(tw.x, y + lvlH / 2, tw.z, r, lvlH, r, 0, rot, 0)));
        parts.push(colored(hex, '#5b4130', M(tw.x, y + lvlH - 0.08, tw.z, r * 1.06, 0.22, r * 1.06, 0, rot, 0)));
        // windows on each hex face
        for (let f = 0; f < 6; f++) {
          if (rnd() < 0.18) continue;
          const a = rot + (f + 0.5) * (Math.PI / 3);
          const apo = r * Math.cos(Math.PI / 6) + 0.03;
          const wx = tw.x + Math.sin(a) * apo, wz = tw.z + Math.cos(a) * apo;
          winPos.push(M(wx, y + lvlH * 0.52, wz, 1, 1, 1, 0, a, 0));
          winCol.push(rnd() < 0.62 ? warm.clone().multiplyScalar(0.8 + rnd() * 0.4) : dark);
        }
        y += lvlH;
      }
      parts.push(colored(cone6, '#5a2f2c', M(tw.x, y + 1.5, tw.z, tw.r * 1.3, 3.0, tw.r * 1.3, 0, 0.1, 0)));
      parts.push(colored(new THREE.CylinderGeometry(0.18, 0.18, 1.4, 6), '#3a2a22', M(tw.x + tw.r * 0.4, y + 2.3, tw.z, 1, 1, 1)));
    }
    // bridges between neighbours
    const pairs: Array<[number, number, number]> = [[0, 1, 3], [1, 2, 2], [1, 3, 4], [1, 4, 3], [0, 5, 2]];
    for (const [a, b, lvl] of pairs) {
      const A = towers[a], B = towers[b];
      const ya = this.height(A.x, A.z) - 0.3 + lvl * 3.1 + 0.2;
      const mid = new THREE.Vector3((A.x + B.x) / 2, ya, (A.z + B.z) / 2);
      const len = Math.hypot(A.x - B.x, A.z - B.z);
      const ang = Math.atan2(B.x - A.x, B.z - A.z);
      parts.push(colored(new THREE.BoxGeometry(1.4, 0.35, len), '#5b4130', M(mid.x, mid.y, mid.z, 1, 1, 1, 0, ang, 0)));
      parts.push(colored(new THREE.BoxGeometry(1.5, 0.9, len * 0.9), '#bda88a', M(mid.x, mid.y + 0.6, mid.z, 1, 1, 1, 0, ang, 0)));
    }
    const geo = mergeGeometries(parts, false)!;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true; mesh.receiveShadow = true;
    const out = new THREE.Mesh(geo, outlineMaterial(0.06, '#1a1216'));
    out.userData.isOutline = true;
    mesh.add(out);
    this.group.add(mesh);
    this.disposables.push(geo, mat);
    // windows (instanced, per-instance warm/dark)
    const wg = new THREE.PlaneGeometry(0.55, 0.85);
    const wins = new THREE.InstancedMesh(wg, this.windowMat, winPos.length);
    winPos.forEach((m, i) => { wins.setMatrixAt(i, m); wins.setColorAt(i, winCol[i]); });
    this.group.add(wins);
    this.disposables.push(wg, this.windowMat);
    // lamp posts along the path near the towers
    const lampParts: THREE.BufferGeometry[] = [];
    const lampGlobes: THREE.Matrix4[] = [];
    for (let i = 0; i < 6; i++) {
      const p = this.path.getPointAt(0.02 + i * 0.045);
      const side = i % 2 ? 1 : -1;
      const x = p.x + side * 0.6, z = p.z + side * 2.9;
      const y = this.height(x, z);
      lampParts.push(colored(new THREE.CylinderGeometry(0.06, 0.08, 2.6, 6), '#2a2024', M(x, y + 1.3, z, 1, 1, 1)));
      lampParts.push(colored(new THREE.BoxGeometry(0.34, 0.08, 0.34), '#2a2024', M(x, y + 2.95, z, 1, 1, 1)));
      lampGlobes.push(M(x, y + 2.7, z, 0.18, 0.24, 0.18));
    }
    const lg = mergeGeometries(lampParts, false)!;
    const lamps = new THREE.Mesh(lg, toon('#ffffff', { vertexColors: true, unique: true }));
    withOutlineMesh(lamps, 0.03);
    this.group.add(lamps);
    const globe = new THREE.SphereGeometry(1, 10, 8);
    const globes = new THREE.InstancedMesh(globe, this.lampMat, lampGlobes.length);
    lampGlobes.forEach((m, i) => globes.setMatrixAt(i, m));
    this.group.add(globes);
    this.disposables.push(lg, globe, lamps.material as THREE.Material, this.lampMat);
    for (const p of [new THREE.Vector3(-60, 3, -2), new THREE.Vector3(-62, 3, 12)]) {
      const l = new THREE.PointLight('#ffb866', 0, 38, 1.4);
      l.position.copy(p);
      this.group.add(l);
      this.lights.push(l);
    }
  }

  // ───────────── the log, rocks, ferns ─────────────
  private buildLogAndProps(rnd: () => number): void {
    const L = this.logPos, R = this.right, F = this.faceDir;
    // cylinders are Y-up: roll them onto X (rz = π/2), then yaw X onto the log axis (R)
    const yaw = Math.atan2(-R.z, R.x);
    const cx = L.x - F.x * 0.12, cz = L.z - F.z * 0.12;
    const parts: THREE.BufferGeometry[] = [
      colored(new THREE.CylinderGeometry(0.24, 0.27, 2.5, 12), '#5c4230', M(cx, 0.13, cz, 1, 1, 1, 0, yaw, Math.PI / 2)),
      colored(new THREE.CylinderGeometry(0.2, 0.2, 0.02, 12), '#b9905c', M(cx + R.x * 1.25, 0.13, cz + R.z * 1.25, 1, 1, 1, 0, yaw, Math.PI / 2)),
      colored(new THREE.CylinderGeometry(0.22, 0.22, 0.02, 12), '#b9905c', M(cx - R.x * 1.25, 0.13, cz - R.z * 1.25, 1, 1, 1, 0, yaw, Math.PI / 2)),
      colored(new THREE.CylinderGeometry(0.06, 0.09, 0.6, 6), '#5c4230', M(L.x - R.x * 0.7, 0.4, L.z - R.z * 0.7, 1, 1, 1, 0.3, yaw, 0.7)),
      colored(new THREE.SphereGeometry(0.22, 8, 6), '#4d6b32', M(L.x - R.x * 1.0, 0.3, L.z - R.z * 1.0, 1.4, 0.4, 1, 0, 0, 0)),
      colored(new THREE.SphereGeometry(0.18, 8, 6), '#56773a', M(L.x + R.x * 0.6, 0.33, L.z + R.z * 0.6, 1.3, 0.35, 1, 0, 0, 0)),
    ];
    const geo = mergeGeometries(parts, false)!;
    const log = new THREE.Mesh(geo, toon('#ffffff', { vertexColors: true, rim: 0.2, unique: true }));
    log.castShadow = true; log.receiveShadow = true;
    withOutlineMesh(log, 0.025);
    this.group.add(log);
    this.disposables.push(geo, log.material as THREE.Material);
    // rocks + ferns scattered around the clearing
    const rockParts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 16; i++) {
      const a = rnd() * Math.PI * 2, r = 3 + rnd() * 9;
      const x = L.x + Math.cos(a) * r, z = L.z + Math.sin(a) * r;
      if (this.distToPath(x, z) < 1.4) continue;
      const s = 0.2 + rnd() * 0.5;
      rockParts.push(colored(new THREE.DodecahedronGeometry(1, 0), rnd() < 0.5 ? '#6f6a72' : '#5e5a63', M(x, this.height(x, z) + s * 0.3, z, s * 1.3, s, s, rnd(), rnd() * 3, rnd())));
    }
    for (let i = 0; i < 40; i++) {
      const a = rnd() * Math.PI * 2, r = 2.5 + rnd() * 14;
      const x = L.x + Math.cos(a) * r - 4, z = L.z + Math.sin(a) * r;
      if (this.distToPath(x, z) < 1.6 || x > 3 || Math.hypot(x - L.x, z - L.z) < 3.8) continue;
      const y = this.height(x, z);
      for (let k = 0; k < 5; k++) {
        const ka = (k / 5) * Math.PI * 2 + rnd();
        rockParts.push(colored(new THREE.ConeGeometry(0.12, 0.8, 4), '#2f5a33', M(x, y + 0.3, z, 1, 1, 0.35, Math.cos(ka) * 0.9, ka, Math.sin(ka) * 0.9)));
      }
    }
    const rg = mergeGeometries(rockParts, false)!;
    const rocks = new THREE.Mesh(rg, toon('#ffffff', { vertexColors: true, unique: true }));
    rocks.castShadow = true;
    withOutlineMesh(rocks, 0.02);
    this.group.add(rocks);
    this.disposables.push(rg, rocks.material as THREE.Material);
  }

  // ───────────── grass & flowers (wind in the vertex shader) ─────────────
  private buildGrass(rnd: () => number): THREE.MeshToonMaterial {
    const tuft = mergeGeometries([
      colored(new THREE.ConeGeometry(0.035, 0.5, 3), '#4a7a3c', M(0, 0.25, 0, 1, 1, 1, 0.15, 0, 0.1)),
      colored(new THREE.ConeGeometry(0.03, 0.42, 3), '#56883f', M(0.06, 0.21, 0.02, 1, 1, 1, -0.1, 0, -0.25)),
      colored(new THREE.ConeGeometry(0.03, 0.38, 3), '#3f6a35', M(-0.05, 0.19, -0.03, 1, 1, 1, 0.05, 0, 0.3)),
    ], false)!;
    const mat = toon('#ffffff', { vertexColors: true, bands: [0.62, 0.85, 1.0], unique: true });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uWind = this.windU;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uWind;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          #ifdef USE_INSTANCING
            vec3 wp = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          #else
            vec3 wp = vec3(0.0);
          #endif
          float sway = sin(uWind * 1.7 + wp.x * 0.35 + wp.z * 0.21) * 0.6 + sin(uWind * 3.1 + wp.x * 0.9) * 0.25;
          transformed.x += sway * 0.12 * position.y * 2.0;
          transformed.z += sway * 0.05 * position.y * 2.0;`);
    };
    mat.customProgramCacheKey = () => 'lx-grass';
    const list: THREE.Matrix4[] = [];
    const cols: THREE.Color[] = [];
    let tries = 0;
    while (list.length < 2600 && tries++ < 12000) {
      const x = -60 + rnd() * 110, z = -34 + rnd() * 68;
      const dl = Math.hypot(x, z);
      if (dl > 48 && rnd() < 0.7) continue;
      if (x > -76 && x < 4 && this.distToPath(x, z) < 1.0) continue;
      const s = 0.7 + rnd() * 0.9;
      list.push(M(x, this.height(x, z) - 0.02, z, s, s * (0.8 + rnd() * 0.6), s, 0, rnd() * 6.28, 0));
      cols.push(new THREE.Color().setHSL(0.26 + rnd() * 0.06, 0.35, 0.5 + rnd() * 0.25).multiplyScalar(1.6));
    }
    const im = new THREE.InstancedMesh(tuft, mat, list.length);
    list.forEach((m, i) => { im.setMatrixAt(i, m); im.setColorAt(i, cols[i]); });
    im.receiveShadow = true;
    this.group.add(im);
    // wildflowers in the meadow near the log
    const fl = new THREE.SphereGeometry(0.06, 6, 4);
    const flMat = toon('#ffffff', { unique: true });
    const fls: THREE.Matrix4[] = [];
    const fcol: THREE.Color[] = [];
    for (let i = 0; i < 420; i++) {
      const x = -2 + rnd() * 40, z = -20 + rnd() * 40;
      if (Math.hypot(x, z) < 1.5) continue;
      fls.push(M(x, this.height(x, z) + 0.22, z, 1, 0.6, 1));
      fcol.push(new THREE.Color(rnd() < 0.6 ? '#f3efe6' : rnd() < 0.5 ? '#f5d56a' : '#c7a2ff'));
    }
    const fm = new THREE.InstancedMesh(fl, flMat, fls.length);
    fls.forEach((m, i) => { fm.setMatrixAt(i, m); fm.setColorAt(i, fcol[i]); });
    this.group.add(fm);
    this.disposables.push(tuft, mat, fl, flMat);
    return mat;
  }

  // ───────────── fog ─────────────
  private buildFog(rnd: () => number): void {
    const tex = fogTexture();
    this.disposables.push(tex);
    const heights = [0.1, 0.3, 0.62];
    heights.forEach((hgt, i) => {
      const t = tex.clone();
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(3, 3);
      t.needsUpdate = true;
      const mat = new THREE.MeshBasicMaterial({ map: t, color: '#a6adc8', transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide, fog: true });
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(150, 150), mat);
      pl.rotation.x = -Math.PI / 2;
      pl.position.set(-12 + (rnd() - 0.5) * 20, hgt, (rnd() - 0.5) * 16);
      pl.renderOrder = 8 + i;
      pl.userData.speed = new THREE.Vector2((rnd() - 0.5) * 0.004, 0.002 + rnd() * 0.004);
      this.group.add(pl);
      this.fogPlanes.push(pl);
      this.fogPlaneMat.push(mat);
      this.disposables.push(pl.geometry, mat, t);
    });
    let placed = 0, tries = 0;
    while (placed < 34 && tries++ < 400) {
      const x = -70 + rnd() * 150, z = (rnd() - 0.5) * 80 + Math.max(0, x) * 0.3;
      // keep the walking corridor readable: banks of mist stay away from the path and the log
      if (x < 4 && this.distToPath(x, z) < 9) continue;
      if (Math.hypot(x - this.logPos.x, z - this.logPos.z) < 7) continue;
      placed++;
      const sp = new THREE.Sprite(this.fogSpriteMat);
      const s = 12 + rnd() * 22;
      sp.position.set(x, this.height(x, z) + s * 0.18, z);
      sp.scale.set(s * 1.6, s * 0.7, 1);
      sp.userData.drift = 0.2 + rnd() * 0.5;
      sp.userData.base = sp.position.clone();
      sp.renderOrder = 7;
      this.group.add(sp);
      this.fogSprites.push(sp);
    }
    this.disposables.push(this.fogSpriteMat);
  }

  /** Mist color & density (0..1). */
  setMist(color: THREE.ColorRepresentation, density: number): void {
    for (const m of this.fogPlaneMat) { m.color.set(color); m.opacity = 0.17 * density; }
    this.fogSpriteMat.color.set(color);
    this.fogSpriteMat.opacity = 0.32 * density;
  }

  // ───────────── god rays ─────────────
  private buildRays(rnd: () => number): void {
    const g = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
    this.disposables.push(g, this.rayMat);
    this.rayOrigin.copy(this.logPos).addScaledVector(this.faceDir, 150).add(new THREE.Vector3(0, 16, 0));
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Mesh(g, this.rayMat);
      m.renderOrder = 30;
      m.frustumCulled = false;
      const target = this.logPos.clone().addScaledVector(this.right, (rnd() - 0.5) * 60).add(new THREE.Vector3((rnd() - 0.5) * 10, -2 + rnd() * 6, 0)).addScaledVector(this.faceDir, -10 - rnd() * 20);
      this.rays.push({ mesh: m, target, width: 3 + rnd() * 7 });
      this.group.add(m);
    }
  }

  private updateRays(camera: THREE.Camera): void {
    this.rayMat.opacity = 0.16 * this.rays01;
    const vis = this.rays01 > 0.01;
    const a = new THREE.Vector3(), n = new THREE.Vector3(), x = new THREE.Vector3(), mat = new THREE.Matrix4();
    for (const r of this.rays) {
      r.mesh.visible = vis;
      if (!vis) continue;
      a.subVectors(r.target, this.rayOrigin);
      const len = a.length();
      a.divideScalar(len);
      n.subVectors(camera.position, this.rayOrigin);
      n.addScaledVector(a, -n.dot(a)).normalize();
      x.crossVectors(a, n).normalize();
      mat.makeBasis(x.multiplyScalar(r.width), a.clone().multiplyScalar(len * 1.15), n);
      mat.setPosition(this.rayOrigin);
      r.mesh.matrixAutoUpdate = false;
      r.mesh.matrix.copy(mat);
      r.mesh.matrixWorldNeedsUpdate = true;
    }
  }

  // ───────────── birds ─────────────
  private buildBirds(): void {
    const wing = new THREE.BufferGeometry();
    wing.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0.12, 0, 0, -0.12, 0.9, 0.05, -0.25]), 3));
    wing.computeVertexNormals();
    const mat = new THREE.MeshBasicMaterial({ color: '#1b1420', side: THREE.DoubleSide, fog: false });
    this.disposables.push(wing, mat);
    for (let i = 0; i < 9; i++) {
      const g = new THREE.Group();
      const wl = new THREE.Mesh(wing, mat), wr = new THREE.Mesh(wing, mat);
      wr.scale.x = -1;
      g.add(wl, wr);
      g.visible = false;
      g.scale.setScalar(1.6);
      this.group.add(g);
      const k = i - 4;
      this.birds.push({ g, wl, wr, off: new THREE.Vector3(-Math.abs(k) * 2.2, (i % 3) * 0.8, k * 2.6), ph: i * 0.7 });
    }
  }

  /** A flock crosses the dawn sky. */
  startBirds(): void { this.birdT = 0; for (const b of this.birds) b.g.visible = true; }

  private updateBirds(dt: number): void {
    if (this.birdT < 0) return;
    this.birdT += dt;
    const T = this.birdT;
    const dir = new THREE.Vector3(0.25, 0.04, -1).normalize();
    const start = this.logPos.clone().addScaledVector(this.faceDir, 55).add(new THREE.Vector3(0, 14, 38));
    const lead = start.addScaledVector(dir, T * 7.5);
    for (const b of this.birds) {
      b.g.position.copy(lead).add(b.off);
      b.g.lookAt(b.g.position.clone().add(dir));
      const f = Math.sin(T * 9 + b.ph) * 0.7;
      b.wl.rotation.z = f; b.wr.rotation.z = -f;
    }
    if (T > 16) { this.birdT = -1; for (const b of this.birds) b.g.visible = false; }
  }

  // ───────────── fireflies ─────────────
  private buildFireflies(rnd: () => number): { pts: THREE.Points; mat: THREE.ShaderMaterial } {
    const n = 70;
    const pos = new Float32Array(n * 3), seed = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2, r = 1.5 + rnd() * 14;
      const x = this.logPos.x + Math.cos(a) * r - 5, z = this.logPos.z + Math.sin(a) * r;
      pos[i * 3] = x; pos[i * 3 + 1] = this.height(x, z) + 0.4 + rnd() * 1.6; pos[i * 3 + 2] = z;
      seed[i] = rnd();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uAlpha: { value: 1 }, uPix: { value: 60 * Math.min(2, window.devicePixelRatio || 1) } },
      vertexShader: `uniform float uTime, uPix; attribute float aSeed; varying float vA;
        void main() { vec3 p = position; p.x += sin(uTime * 0.6 + aSeed * 30.0) * 0.6; p.y += sin(uTime * 0.9 + aSeed * 12.0) * 0.3; p.z += cos(uTime * 0.5 + aSeed * 20.0) * 0.6;
          vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = uPix * 0.12 / max(0.3, -mv.z) * 10.0;
          vA = pow(0.5 + 0.5 * sin(uTime * (1.5 + aSeed * 2.0) + aSeed * 50.0), 3.0); }`,
      fragmentShader: `uniform float uAlpha; varying float vA; void main() { float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d);
          gl_FragColor = vec4(vec3(0.85, 1.0, 0.45) * a * vA * uAlpha * 2.5, 1.0); }`,
    });
    const pts = new THREE.Points(g, mat);
    pts.frustumCulled = false;
    this.group.add(pts);
    this.disposables.push(g, mat);
    return { pts, mat };
  }

  // ───────────── controls ─────────────
  /** Colmenas windows + lamp posts + their warm point lights (0..1). */
  setLamps(v: number): void {
    this.lamps01 = v;
    this.windowMat.color.setScalar(0.15 + v * 2.3);
    this.lampMat.color.set('#ffcf7a').multiplyScalar(0.2 + v * 2.6);
    for (const l of this.lights) l.intensity = v * 26;
  }

  update(dt: number, time: number, camera: THREE.Camera): void {
    this.t += dt;
    this.windU.value = time;
    for (const p of this.fogPlanes) {
      const m = p.material as THREE.MeshBasicMaterial;
      if (m.map) { const s = p.userData.speed as THREE.Vector2; m.map.offset.x += s.x * dt * 10; m.map.offset.y += s.y * dt * 10; }
    }
    for (const s of this.fogSprites) {
      const b = s.userData.base as THREE.Vector3;
      s.position.z = b.z + Math.sin(this.t * 0.03 * s.userData.drift + b.x) * 6;
      s.position.x = b.x + Math.cos(this.t * 0.02 * s.userData.drift + b.z) * 3;
    }
    this.fliesMat.uniforms.uTime.value = this.t;
    this.fliesMat.uniforms.uAlpha.value = this.fireflies01;
    this.flies.visible = this.fireflies01 > 0.01;
    this.updateRays(camera);
    this.updateBirds(dt);
  }

  dispose(): void {
    this.group.removeFromParent();
    for (const d of this.disposables) { try { d.dispose(); } catch { /* ignore */ } }
    this.disposables = [];
    void this.grassMat;
  }
}

function withOutlineMesh(mesh: THREE.Mesh, thickness: number): void {
  const o = new THREE.Mesh(mesh.geometry, outlineMaterial(thickness, '#16110f'));
  o.userData.isOutline = true;
  mesh.add(o);
}
