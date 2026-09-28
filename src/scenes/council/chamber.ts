/**
 * The Concilio chamber: a white-marble rotunda with a round table, five delegate chairs, the Custodia's dais,
 * Elias's podium, continent banners, a golden oculus with light shafts, dust motes and a murmuring gallery.
 * Everything is procedural (canvas textures + primitives); built on enter, disposed on exit.
 */
import * as THREE from 'three';
import { glow, toon, withOutline } from '../../render/toon';
import type { ContinentId } from '../../data/types';
import { crest, crestColors } from '../../systems/society/icons';

export interface Seat { continent: ContinentId; angle: number; pos: THREE.Vector3; facing: number; gem: THREE.Mesh; chair: THREE.Group; light: THREE.Mesh }

export const SEAT_ORDER: ContinentId[] = ['kharaz', 'sylvaria', 'valdoria', 'morvenna', 'islas'];
const SEAT_ANGLES = [-112, -56, 0, 56, 112];
const SEAT_R = 4.5;
export const ELIAS_POS = new THREE.Vector3(0, 0.35, 5.4);
export const IONE_POS = new THREE.Vector3(0, 1.05, -7.4);

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat?: [number, number]): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  draw(g);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}

function veins(g: CanvasRenderingContext2D, w: number, h: number, n: number, alpha: number, seed = 1): void {
  let s = seed;
  const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < n; i++) {
    g.strokeStyle = `rgba(${120 + r() * 40},${110 + r() * 30},${100 + r() * 30},${alpha * (0.4 + r())})`;
    g.lineWidth = 0.6 + r() * 2.2;
    g.beginPath();
    let x = r() * w, y = r() * h;
    g.moveTo(x, y);
    for (let k = 0; k < 6; k++) {
      const nx = x + (r() - 0.5) * w * 0.35, ny = y + (r() - 0.5) * h * 0.35;
      g.quadraticCurveTo(x + (r() - 0.5) * 80, y + (r() - 0.5) * 80, nx, ny);
      x = nx; y = ny;
    }
    g.stroke();
  }
}

function floorTexture(): THREE.CanvasTexture {
  return canvasTex(1024, 1024, (g) => {
    const S = 1024, C = S / 2;
    g.fillStyle = '#efe8da'; g.fillRect(0, 0, S, S);
    veins(g, S, S, 70, 0.22, 7);
    const ring = (r: number, w: number, col: string) => { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.arc(C, C, r, 0, Math.PI * 2); g.stroke(); };
    ring(C * 0.98, 10, '#c9a24f'); ring(C * 0.93, 3, '#d9b36c'); ring(C * 0.56, 7, '#c9a24f'); ring(C * 0.52, 2, '#d9b36c');
    // pentagon joining the five seats
    g.strokeStyle = 'rgba(201,162,79,0.85)'; g.lineWidth = 5; g.beginPath();
    SEAT_ANGLES.forEach((a, i) => {
      const t = (a * Math.PI) / 180;
      const x = C + Math.sin(t) * C * 0.52, y = C - Math.cos(t) * C * 0.52;
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    });
    g.closePath(); g.stroke();
    // radial rays
    g.strokeStyle = 'rgba(201,162,79,0.35)'; g.lineWidth = 2;
    for (let i = 0; i < 40; i++) {
      const t = (i / 40) * Math.PI * 2;
      g.beginPath(); g.moveTo(C + Math.cos(t) * C * 0.6, C + Math.sin(t) * C * 0.6); g.lineTo(C + Math.cos(t) * C * 0.9, C + Math.sin(t) * C * 0.9); g.stroke();
    }
    // Elias's circle at the south (violet), faint — aligned with the podium
    g.strokeStyle = 'rgba(155,92,255,0.45)'; g.lineWidth = 4; g.beginPath(); g.arc(C, C + (ELIAS_POS.z / 15) * C, (1.5 / 15) * C, 0, Math.PI * 2); g.stroke();
  });
}

function wallTexture(): THREE.CanvasTexture {
  return canvasTex(1024, 256, (g) => {
    const grd = g.createLinearGradient(0, 0, 0, 256);
    grd.addColorStop(0, '#f6f0e4'); grd.addColorStop(1, '#ddd2bd');
    g.fillStyle = grd; g.fillRect(0, 0, 1024, 256);
    veins(g, 1024, 256, 40, 0.15, 3);
    g.fillStyle = 'rgba(201,162,79,0.55)'; g.fillRect(0, 214, 1024, 6); g.fillRect(0, 36, 1024, 3);
  }, [3, 1]);
}

function domeTexture(): THREE.CanvasTexture {
  return canvasTex(512, 512, (g) => {
    const grd = g.createLinearGradient(0, 0, 0, 512);
    grd.addColorStop(0, '#fff6dc'); grd.addColorStop(0.5, '#f1e6cc'); grd.addColorStop(1, '#d8c7a4');
    g.fillStyle = grd; g.fillRect(0, 0, 512, 512);
    g.strokeStyle = 'rgba(201,162,79,0.5)'; g.lineWidth = 3;
    for (let i = 0; i < 16; i++) { const x = (i / 16) * 512; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 512); g.stroke(); }
    for (let j = 1; j < 5; j++) { g.beginPath(); g.moveTo(0, j * 100); g.lineTo(512, j * 100); g.stroke(); }
  }, [2, 1]);
}

function bannerTexture(c: ContinentId): THREE.CanvasTexture {
  const [a, b] = crestColors(c);
  const tex = canvasTex(256, 576, (g) => {
    g.fillStyle = a; g.fillRect(0, 0, 256, 576);
    const shade = g.createLinearGradient(0, 0, 256, 0);
    shade.addColorStop(0, 'rgba(0,0,0,0.25)'); shade.addColorStop(0.5, 'rgba(255,255,255,0.08)'); shade.addColorStop(1, 'rgba(0,0,0,0.3)');
    g.fillStyle = shade; g.fillRect(0, 0, 256, 576);
    g.strokeStyle = b; g.lineWidth = 8; g.strokeRect(14, 14, 228, 520);
    g.fillStyle = b;
    g.beginPath(); g.moveTo(0, 520); g.lineTo(128, 576); g.lineTo(256, 520); g.lineTo(256, 576); g.lineTo(0, 576); g.fill();
  });
  const img = new Image();
  img.onload = () => {
    const g = (tex.image as HTMLCanvasElement).getContext('2d')!;
    g.drawImage(img, 38, 150, 180, 180);
    tex.needsUpdate = true;
  };
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(crest(c, 180));
  return tex;
}

function shaftTexture(): THREE.CanvasTexture {
  return canvasTex(64, 256, (g) => {
    const grd = g.createLinearGradient(0, 0, 0, 256);
    grd.addColorStop(0, 'rgba(255,240,200,0.9)'); grd.addColorStop(1, 'rgba(255,240,200,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 256);
  });
}

function dotTexture(): THREE.CanvasTexture {
  return canvasTex(64, 64, (g) => {
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.4, 'rgba(255,245,220,0.5)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  });
}

export class Chamber {
  readonly group = new THREE.Group();
  readonly seats: Seat[] = [];
  readonly tableGems: THREE.Mesh[] = [];
  private disposables: Array<{ dispose(): void }> = [];
  private shafts: THREE.Mesh[] = [];
  private dust!: THREE.Points;
  private dustVel: Float32Array = new Float32Array(0);
  private crowd!: THREE.InstancedMesh;
  private crowdBase: Array<{ y: number; phase: number }> = [];
  private banners: THREE.Mesh[] = [];
  private eliasRing!: THREE.Mesh;
  private crowdExcite = 0;
  readonly sun: THREE.DirectionalLight;

  constructor(scene: THREE.Scene) {
    scene.add(this.group);
    scene.background = new THREE.Color('#a8926c');
    scene.fog = new THREE.Fog('#b9a37c', 24, 64);
    const track = <T extends { dispose(): void }>(x: T): T => { this.disposables.push(x); return x; };

    // ── lights
    const hemi = new THREE.HemisphereLight('#fff0d8', '#7a6040', 0.62);
    this.sun = new THREE.DirectionalLight('#ffe9c4', 1.75);
    this.sun.position.set(2, 22, 4);
    this.sun.target.position.set(0, 0, 0);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -12; sc.right = 12; sc.top = 12; sc.bottom = -12; sc.near = 4; sc.far = 40;
    this.sun.shadow.bias = -0.0005; this.sun.shadow.normalBias = 0.03;
    const tableLight = new THREE.PointLight('#ffcf7a', 3.2, 9, 2);
    tableLight.position.set(0, 2.2, 0);
    this.group.add(hemi, this.sun, this.sun.target, tableLight);

    // ── floor, walls, dome
    const floorTex = track(floorTexture());
    const floor = new THREE.Mesh(track(new THREE.CircleGeometry(15, 96).rotateX(-Math.PI / 2)), track(toon('#d9cfbd', { map: floorTex, bands: [0.5, 0.78, 1] })));
    floor.receiveShadow = true;
    this.group.add(floor);
    const wallTex = track(wallTexture());
    const wall = new THREE.Mesh(track(new THREE.CylinderGeometry(15, 15, 10, 64, 1, true)), track(toon('#c9bca4', { map: wallTex, side: THREE.BackSide, bands: [0.5, 0.78, 1] })));
    wall.position.y = 5;
    this.group.add(wall);
    const domeTex = track(domeTexture());
    const dome = new THREE.Mesh(track(new THREE.SphereGeometry(15, 48, 20, 0, Math.PI * 2, 0, Math.PI / 2)), track(new THREE.MeshBasicMaterial({ map: domeTex, color: '#9c8a6c', side: THREE.BackSide, fog: false })));
    dome.position.y = 10;
    this.group.add(dome);
    const oculus = new THREE.Mesh(track(new THREE.CircleGeometry(2.6, 40).rotateX(Math.PI / 2)), glow('#fff4d6', 3.2));
    oculus.position.y = 24.9;
    this.group.add(oculus);
    const oculusRing = new THREE.Mesh(track(new THREE.TorusGeometry(2.7, 0.18, 8, 48).rotateX(Math.PI / 2)), toon('#d9b36c', { emissive: '#8a6a33', emissiveIntensity: 0.4 }));
    oculusRing.position.y = 24.8;
    this.group.add(oculusRing);

    // ── light shafts from the oculus
    const shaftTex = track(shaftTexture());
    for (let i = 0; i < 4; i++) {
      const m = new THREE.MeshBasicMaterial({ map: shaftTex, transparent: true, opacity: 0.085 + i * 0.012, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
      track(m);
      const shaft = new THREE.Mesh(track(new THREE.CylinderGeometry(2.2 + i * 0.4, 3.6 + i * 1.1, 25, 32, 1, true)), m);
      shaft.position.set(0.6 * Math.sin(i * 1.7), 12.4, 0.8 * Math.cos(i * 1.3));
      shaft.rotation.z = 0.05 * (i - 1.5);
      this.shafts.push(shaft);
      this.group.add(shaft);
    }

    // ── columns & gallery
    const colGeo = track(new THREE.CylinderGeometry(0.42, 0.5, 9, 16));
    const capGeo = track(new THREE.BoxGeometry(1.3, 0.35, 1.3));
    const colMat = toon('#e2d9c8', { bands: [0.5, 0.78, 1], rim: 0.12 });
    const goldMat = toon('#d9b36c', { emissive: '#6a4a1a', emissiveIntensity: 0.35, rim: 0.3, rimColor: '#fff2c0' });
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + Math.PI / 16;
      const x = Math.sin(a) * 13.2, z = -Math.cos(a) * 13.2;
      const col = new THREE.Mesh(colGeo, colMat);
      col.position.set(x, 4.5, z);
      col.castShadow = true;
      const cap = new THREE.Mesh(capGeo, goldMat); cap.position.set(x, 9.1, z);
      const base = new THREE.Mesh(capGeo, goldMat); base.position.set(x, 0.15, z);
      this.group.add(col, cap, base);
    }
    const gallery = new THREE.Mesh(track(new THREE.TorusGeometry(13.6, 0.3, 8, 80).rotateX(Math.PI / 2)), goldMat);
    gallery.position.y = 9.45;
    this.group.add(gallery);

    // crowd in the gallery (instanced silhouettes)
    const crowdGeo = track(new THREE.CapsuleGeometry(0.28, 0.55, 3, 8));
    const crowdMat = track(toon('#7a6a8a', { bands: [0.55, 0.8, 1], unique: true }));
    const N = 72;
    this.crowd = new THREE.InstancedMesh(crowdGeo, crowdMat, N);
    const m4 = new THREE.Matrix4();
    const col = new THREE.Color();
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2 + (Math.random() - 0.5) * 0.05;
      const r = 14.1 + Math.random() * 0.6;
      const y = 10.05 + Math.random() * 0.2;
      m4.makeTranslation(Math.sin(a) * r, y, -Math.cos(a) * r);
      this.crowd.setMatrixAt(i, m4);
      this.crowd.setColorAt(i, col.setHSL(0.72 + Math.random() * 0.2, 0.18, 0.35 + Math.random() * 0.2));
      this.crowdBase.push({ y, phase: Math.random() * 10 });
    }
    this.crowd.instanceMatrix.needsUpdate = true;
    this.group.add(this.crowd);

    // ── the table
    const top = new THREE.Mesh(track(new THREE.CylinderGeometry(3.4, 3.4, 0.24, 64)), toon('#ece4d4', { bands: [0.55, 0.82, 1], rim: 0.15 }));
    top.position.y = 0.95; top.castShadow = true; top.receiveShadow = true;
    withOutline(top, 0.03);
    const rim = new THREE.Mesh(track(new THREE.TorusGeometry(3.42, 0.07, 8, 72).rotateX(Math.PI / 2)), goldMat);
    rim.position.y = 1.07;
    const ped = new THREE.Mesh(track(new THREE.CylinderGeometry(1.1, 1.6, 0.85, 32)), colMat);
    ped.position.y = 0.42; ped.castShadow = true;
    const emblem = new THREE.Mesh(track(new THREE.TorusGeometry(0.9, 0.05, 8, 48).rotateX(Math.PI / 2)), glow('#ffd98a', 2.4));
    emblem.position.y = 1.09;
    const emblem2 = new THREE.Mesh(track(new THREE.TorusGeometry(0.55, 0.03, 8, 40).rotateX(Math.PI / 2)), glow('#ffe7b0', 2));
    emblem2.position.y = 1.09;
    this.group.add(top, rim, ped, emblem, emblem2);

    // ── seats (chairs + gems on the table)
    const chairBack = track(new THREE.BoxGeometry(0.9, 1.7, 0.16));
    const chairSeat = track(new THREE.BoxGeometry(0.9, 0.14, 0.8));
    const chairLeg = track(new THREE.BoxGeometry(0.8, 0.5, 0.7));
    const gemGeo = track(new THREE.OctahedronGeometry(0.16, 0));
    const lightGeo = track(new THREE.CylinderGeometry(0.75, 0.75, 6, 24, 1, true));
    SEAT_ORDER.forEach((c, i) => {
      const deg = SEAT_ANGLES[i];
      const t = (deg * Math.PI) / 180;
      const pos = new THREE.Vector3(Math.sin(t) * SEAT_R, 0, -Math.cos(t) * SEAT_R);
      const look = new THREE.Vector3(0, 0, 3).sub(pos);
      const facing = Math.atan2(look.x, look.z);
      const [ca, cb] = crestColors(c);
      const chair = new THREE.Group();
      const cushion = toon(ca, { bands: [0.6, 0.85, 1] });
      const back = new THREE.Mesh(chairBack, colMat); back.position.set(0, 1.25, -0.42); back.castShadow = true;
      const backTop = new THREE.Mesh(track(new THREE.SphereGeometry(0.2, 12, 8)), toon(cb, { emissive: cb, emissiveIntensity: 0.25 })); backTop.position.set(0, 2.15, -0.42);
      const seatM = new THREE.Mesh(chairSeat, cushion); seatM.position.set(0, 0.55, -0.02);
      const leg = new THREE.Mesh(chairLeg, colMat); leg.position.set(0, 0.25, -0.02); leg.castShadow = true;
      withOutline(back, 0.025); withOutline(seatM, 0.02);
      chair.add(back, backTop, seatM, leg);
      chair.position.copy(pos);
      chair.rotation.y = facing;
      this.group.add(chair);
      const gem = new THREE.Mesh(gemGeo, track(glow(cb, 2.2, { unique: true })));
      const gpos = pos.clone().multiplyScalar(0.62);
      gem.position.set(gpos.x, 1.28, gpos.z);
      this.group.add(gem);
      this.tableGems.push(gem);
      const lm = new THREE.MeshBasicMaterial({ color: '#ffd98a', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
      track(lm);
      const light = new THREE.Mesh(lightGeo, lm);
      light.position.set(pos.x, 3, pos.z);
      this.group.add(light);
      this.seats.push({ continent: c, angle: deg, pos, facing, gem, chair, light });
      // banner on the wall behind the seat
      const bt = track(bannerTexture(c));
      const banner = new THREE.Mesh(track(new THREE.PlaneGeometry(1.7, 3.8, 1, 8)), track(toon('#e8e0d0', { map: bt, side: THREE.DoubleSide, bands: [0.55, 0.82, 1] })));
      const br = 14.2;
      banner.position.set(Math.sin(t) * br, 6.2, -Math.cos(t) * br);
      banner.lookAt(0, 6.2, 0);
      banner.userData.phase = i * 1.3;
      this.banners.push(banner);
      this.group.add(banner);
    });

    // Concordia banners flanking the Custodia + her dais
    for (const side of [-1, 1]) {
      const bt = track(bannerTexture('concordia'));
      const banner = new THREE.Mesh(track(new THREE.PlaneGeometry(1.5, 3.4, 1, 8)), track(toon('#e8e0d0', { map: bt, side: THREE.DoubleSide, bands: [0.55, 0.82, 1] })));
      const t = side * 0.28;
      banner.position.set(Math.sin(t) * 14.2, 6.4, -Math.cos(t) * 14.2);
      banner.lookAt(0, 6.4, 0);
      banner.userData.phase = side * 2;
      this.banners.push(banner);
      this.group.add(banner);
    }
    const dais = new THREE.Mesh(track(new THREE.CylinderGeometry(1.8, 2.1, 1.05, 40)), colMat);
    dais.position.set(IONE_POS.x, 0.52, IONE_POS.z);
    dais.castShadow = true; dais.receiveShadow = true;
    const daisRim = new THREE.Mesh(track(new THREE.TorusGeometry(1.82, 0.06, 8, 48).rotateX(Math.PI / 2)), goldMat);
    daisRim.position.set(IONE_POS.x, 1.06, IONE_POS.z);
    const lectern = new THREE.Mesh(track(new THREE.BoxGeometry(0.9, 1.1, 0.5)), colMat);
    lectern.position.set(IONE_POS.x, 1.6, IONE_POS.z + 0.9);
    lectern.castShadow = true;
    withOutline(lectern, 0.025);
    this.group.add(dais, daisRim, lectern);

    // Elias's podium (violet ring on the floor)
    const pod = new THREE.Mesh(track(new THREE.CylinderGeometry(1, 1.15, 0.35, 32)), toon('#2a2036', { rim: 0.3, rimColor: '#9b5cff' }));
    pod.position.set(ELIAS_POS.x, 0.17, ELIAS_POS.z);
    pod.receiveShadow = true;
    this.eliasRing = new THREE.Mesh(track(new THREE.TorusGeometry(1.1, 0.05, 8, 48).rotateX(Math.PI / 2)), track(glow('#9b5cff', 2.6, { unique: true })));
    this.eliasRing.position.set(ELIAS_POS.x, 0.37, ELIAS_POS.z);
    this.group.add(pod, this.eliasRing);

    // dust motes in the light
    const DN = 260;
    const pos = new Float32Array(DN * 3);
    this.dustVel = new Float32Array(DN);
    for (let i = 0; i < DN; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * 5;
      pos[i * 3] = Math.cos(a) * r; pos[i * 3 + 1] = Math.random() * 14; pos[i * 3 + 2] = Math.sin(a) * r;
      this.dustVel[i] = 0.05 + Math.random() * 0.15;
    }
    const dg = track(new THREE.BufferGeometry());
    dg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const dm = track(new THREE.PointsMaterial({ map: track(dotTexture()), size: 0.09, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, color: '#fff2cc', fog: false }));
    this.dust = new THREE.Points(dg, dm);
    this.group.add(this.dust);
  }

  /** Seats Elias controls glow violet on the table; bought/dominated seats can be highlighted too. */
  setGem(i: number, color: string, intensity = 2.4): void {
    const gem = this.tableGems[i];
    if (!gem) return;
    (gem.material as THREE.MeshBasicMaterial).color.set(color).multiplyScalar(intensity);
  }

  /** Column of light over a seat (vote reveal). */
  flashSeat(i: number, color: string, strength = 0.5): void {
    const s = this.seats[i];
    if (!s) return;
    const m = s.light.material as THREE.MeshBasicMaterial;
    m.color.set(color);
    m.opacity = strength;
  }

  cheer(amount: number): void { this.crowdExcite = Math.min(1.5, this.crowdExcite + amount); }

  update(dt: number, t: number): void {
    for (let i = 0; i < this.shafts.length; i++) {
      const s = this.shafts[i];
      s.rotation.y = t * 0.02 * (i % 2 ? 1 : -1);
      (s.material as THREE.MeshBasicMaterial).opacity = 0.08 + i * 0.012 + Math.sin(t * 0.4 + i) * 0.015;
    }
    for (const b of this.banners) {
      const ph = b.userData.phase as number;
      b.rotation.z = Math.sin(t * 0.6 + ph) * 0.015;
    }
    for (const s of this.seats) {
      const m = s.light.material as THREE.MeshBasicMaterial;
      if (m.opacity > 0) m.opacity = Math.max(0, m.opacity - dt * 0.35);
      s.gem.rotation.y += dt * 1.2;
      s.gem.position.y = 1.28 + Math.sin(t * 2 + s.angle) * 0.03;
    }
    const pa = this.dust.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = pa.array as Float32Array;
    for (let i = 0; i < this.dustVel.length; i++) {
      arr[i * 3 + 1] -= this.dustVel[i] * dt;
      arr[i * 3] += Math.sin(t * 0.3 + i) * 0.002;
      if (arr[i * 3 + 1] < 0) arr[i * 3 + 1] = 14;
    }
    pa.needsUpdate = true;
    this.crowdExcite = Math.max(0, this.crowdExcite - dt * 0.5);
    const m4 = new THREE.Matrix4();
    const p = new THREE.Vector3();
    for (let i = 0; i < this.crowdBase.length; i++) {
      this.crowd.getMatrixAt(i, m4);
      p.setFromMatrixPosition(m4);
      const b = this.crowdBase[i];
      p.y = b.y + Math.abs(Math.sin(t * (2 + this.crowdExcite * 6) + b.phase)) * (0.03 + this.crowdExcite * 0.25);
      m4.setPosition(p);
      this.crowd.setMatrixAt(i, m4);
    }
    this.crowd.instanceMatrix.needsUpdate = true;
    const rm = this.eliasRing.material as THREE.MeshBasicMaterial;
    rm.color.setRGB(0.6 * 2.6, 0.36 * 2.6, 1 * 2.6).multiplyScalar(0.75 + Math.sin(t * 2.5) * 0.25);
  }

  dispose(): void {
    this.group.removeFromParent();
    this.crowd.dispose();
    for (const d of this.disposables) { try { d.dispose(); } catch { /* ignore */ } }
    this.disposables = [];
  }
}
