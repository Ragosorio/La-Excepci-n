/**
 * 3D interior diorama of El Gran Casino "La Banca de las Mil Suertes" (or El Casino Clandestino):
 * gold columns, chandeliers (real point lights), a marquee sign with chasing bulbs, roulette / tarot / dice tables
 * with goblin croupier rigs, slot machine rows, the wishing well centerpiece and Don Tiburcio on his balcony.
 * No real-time shadows (blob shadows + painted floors) → cheap. Camera glides between per-game focus presets.
 */
import * as THREE from 'three';
import { toon, glow, withOutline } from '../render/toon';
import { Fx } from '../render/fx';
import { buildCharacter, type CharacterRig, type CharacterSpec } from '../characters/rig';
import { damp, dampVec3 } from '../core/math';
import { rasterize, symbolSVG, type SymId } from './art';

export type Variant = 'grand' | 'clandestino';
export type Focus = 'lobby' | 'slots' | 'ruleta' | 'tarot' | 'dados' | 'arena' | 'pozo' | 'final' | 'tres';

const FOCUS: Record<Focus, { pos: [number, number, number]; look: [number, number, number] }> = {
  lobby: { pos: [0, 6.0, 11], look: [0, 2.5, -7] },
  slots: { pos: [-5.5, 3.1, 1.5], look: [-13, 2.2, -6] },
  ruleta: { pos: [-7, 3.9, -2.2], look: [-7, 0.9, -7.2] },
  tarot: { pos: [7, 3.9, -2.2], look: [7, 0.9, -7.2] },
  dados: { pos: [-4.6, 3.4, 3.6], look: [-4.6, 0.9, -1] },
  tres: { pos: [-4.6, 3.4, 3.6], look: [-4.6, 0.9, -1] },
  arena: { pos: [5.2, 3.5, 2.4], look: [10.2, 3, -3.6] },
  pozo: { pos: [0, 3.2, -0.8], look: [0, 1.7, -6] },
  final: { pos: [0, 6.6, -6.2], look: [0, 5.7, -12.6] },
};

function canvasTex(w: number, hgt: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, repeat?: [number, number]): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w; c.height = hgt;
  const g = c.getContext('2d')!;
  draw(g, w, hgt);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}

function carpet(variant: Variant): THREE.CanvasTexture {
  return canvasTex(512, 512, (g, w) => {
    if (variant === 'clandestino') {
      g.fillStyle = '#2a2230'; g.fillRect(0, 0, w, w);
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
        g.fillStyle = (x + y) % 2 ? '#241c2a' : '#30283a';
        g.fillRect(x * 64 + 2, y * 64 + 2, 60, 60);
      }
      return;
    }
    g.fillStyle = '#4a0f1e'; g.fillRect(0, 0, w, w);
    g.strokeStyle = 'rgba(217,179,108,0.55)'; g.lineWidth = 3;
    for (let i = -w; i < w * 2; i += 128) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i + w, w); g.stroke();
      g.beginPath(); g.moveTo(i + w, 0); g.lineTo(i, w); g.stroke();
    }
    for (let y = 0; y <= w; y += 128) for (let x = 0; x <= w; x += 128) {
      const cx = x, cy = y + 64;
      g.fillStyle = 'rgba(245,217,154,0.5)';
      g.beginPath();
      for (let k = 0; k <= 6; k++) { const a = Math.PI + (k / 6) * Math.PI; g.lineTo(cx + Math.cos(a) * 26, cy + Math.sin(a) * 26); }
      g.lineTo(cx, cy); g.fill();
      g.fillStyle = '#6a1a2a'; g.beginPath(); g.arc(cx, cy, 7, 0, Math.PI * 2); g.fill();
    }
  }, [5, 4]);
}

function wallTex(variant: Variant): THREE.CanvasTexture {
  return canvasTex(1024, 512, (g, w, hgt) => {
    if (variant === 'clandestino') {
      g.fillStyle = '#2a2026'; g.fillRect(0, 0, w, hgt);
      for (let y = 0; y < hgt; y += 40) for (let x = (y / 40) % 2 ? -40 : 0; x < w; x += 80) {
        g.fillStyle = `hsl(${280 + Math.random() * 20},10%,${14 + Math.random() * 6}%)`;
        g.fillRect(x + 2, y + 2, 76, 36);
      }
      return;
    }
    // upper damask
    g.fillStyle = '#3a0c1a'; g.fillRect(0, 0, w, hgt * 0.62);
    g.fillStyle = 'rgba(160,50,80,0.35)';
    for (let y = 30; y < hgt * 0.6; y += 70) for (let x = 20; x < w; x += 70) {
      g.beginPath(); g.ellipse(x + ((y / 70) % 2) * 35, y, 12, 20, 0, 0, Math.PI * 2); g.fill();
    }
    // arches
    g.strokeStyle = '#d9b36c'; g.lineWidth = 6;
    for (let x = 64; x < w; x += 256) { g.beginPath(); g.moveTo(x, hgt * 0.62); g.lineTo(x, hgt * 0.25); g.arc(x + 64, hgt * 0.25, 64, Math.PI, 0); g.lineTo(x + 128, hgt * 0.62); g.stroke(); }
    // wood wainscot
    g.fillStyle = '#2a1208'; g.fillRect(0, hgt * 0.62, w, hgt * 0.38);
    for (let x = 0; x < w; x += 64) { g.fillStyle = '#34180c'; g.fillRect(x + 6, hgt * 0.66, 52, hgt * 0.3); }
    g.fillStyle = '#d9b36c'; g.fillRect(0, hgt * 0.61, w, 6); g.fillRect(0, hgt - 8, w, 8);
  }, [2, 1]);
}

function signTex(text: string, color: string, glowCol: string): THREE.CanvasTexture {
  return canvasTex(1024, 160, (g, w, hgt) => {
    g.clearRect(0, 0, w, hgt);
    g.font = '700 74px Cinzel, "Times New Roman", serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = glowCol; g.shadowBlur = 26;
    g.fillStyle = color;
    g.fillText(text, w / 2, hgt / 2 + 4);
    g.shadowBlur = 0; g.lineWidth = 2; g.strokeStyle = 'rgba(40,10,0,0.8)'; g.strokeText(text, w / 2, hgt / 2 + 4);
  });
}

function wheelTex(): THREE.CanvasTexture {
  const order = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
  return canvasTex(512, 512, (g, w) => {
    const c = w / 2;
    g.fillStyle = '#3a1a0a'; g.beginPath(); g.arc(c, c, c, 0, Math.PI * 2); g.fill();
    for (let i = 0; i < 37; i++) {
      const a0 = (i / 37) * Math.PI * 2, a1 = ((i + 1) / 37) * Math.PI * 2;
      g.fillStyle = order[i] === 0 ? '#0d0714' : i % 2 ? '#d99a1a' : '#2c2c7a';
      g.beginPath(); g.moveTo(c, c); g.arc(c, c, c * 0.95, a0, a1); g.closePath(); g.fill();
    }
    g.fillStyle = '#2a1408'; g.beginPath(); g.arc(c, c, c * 0.55, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#f5d99a'; g.lineWidth = 6; g.beginPath(); g.arc(c, c, c * 0.55, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#d9b36c'; g.beginPath(); g.arc(c, c, c * 0.14, 0, Math.PI * 2); g.fill();
  });
}

function boardTex(lines: string[]): THREE.CanvasTexture {
  return canvasTex(512, 320, (g, w, hgt) => {
    g.fillStyle = '#10202e'; g.fillRect(0, 0, w, hgt);
    g.strokeStyle = '#d9b36c'; g.lineWidth = 8; g.strokeRect(6, 6, w - 12, hgt - 12);
    g.textAlign = 'center';
    g.fillStyle = '#7fe3ff'; g.font = '700 38px Cinzel, serif'; g.fillText('ARENA DEL REMOLINO', w / 2, 62);
    g.font = '600 30px "Alegreya Sans", sans-serif';
    lines.forEach((l, i) => { g.fillStyle = i === 0 ? '#ffb0b8' : i === 1 ? '#a8d0ff' : '#f5d99a'; g.fillText(l, w / 2, 130 + i * 58); });
  });
}

interface Chandelier { g: THREE.Group; light: THREE.PointLight; phase: number }

export class CasinoDiorama {
  readonly root = new THREE.Group();
  readonly fx: Fx;
  private rigs: Array<{ rig: CharacterRig; kind: 'croupier' | 'patron' | 'boss'; home: THREE.Vector3; t: number }> = [];
  private tiburcio: CharacterRig | null = null;
  private bulbs: THREE.InstancedMesh | null = null;
  private bulbCount = 0;
  private chandeliers: Chandelier[] = [];
  private wheel: THREE.Mesh | null = null;
  private screens: Array<{ tex: THREE.Texture; speed: number; stopT: number; off: number }> = [];
  private motes: THREE.Points | null = null;
  private boardMat: THREE.MeshBasicMaterial | null = null;
  private disposables: Array<{ dispose(): void }> = [];
  private camPos = new THREE.Vector3(...FOCUS.lobby.pos);
  private camLook = new THREE.Vector3(...FOCUS.lobby.look);
  private tgtPos = new THREE.Vector3(...FOCUS.lobby.pos);
  private tgtLook = new THREE.Vector3(...FOCUS.lobby.look);
  private focusId: Focus = 'lobby';
  private t = 0;
  private party = 0;
  private shakeA = 0;
  private dim = 0;
  private dimTarget = 0;
  private hemi!: THREE.HemisphereLight;
  private spot: THREE.SpotLight | null = null;
  private tmpC = new THREE.Color();

  constructor(private scene: THREE.Scene, private camera: THREE.PerspectiveCamera, readonly variant: Variant) {
    scene.add(this.root);
    this.fx = new Fx(scene, 2500);
    this.build();
  }

  private own<T extends { dispose(): void }>(x: T): T { this.disposables.push(x); return x; }

  private build(): void {
    const v = this.variant;
    const grand = v === 'grand';
    this.scene.background = new THREE.Color(grand ? '#0d0710' : '#07060c');
    this.scene.fog = new THREE.Fog(grand ? '#1a0a14' : '#0a0810', 20, 58);

    // lights
    this.hemi = new THREE.HemisphereLight(grand ? '#ffd9a8' : '#b8a8ff', grand ? '#2a0f1a' : '#140a1a', grand ? 0.75 : 0.5);
    this.root.add(this.hemi);
    const key = new THREE.DirectionalLight(grand ? '#ffe2b8' : '#c8b8ff', grand ? 1.3 : 0.7);
    key.position.set(4, 14, 12);
    this.root.add(key, key.target);

    // floor + walls
    const floorMat = this.own(toon('#ffffff', { map: this.own(carpet(v)), bands: [0.7, 0.9, 1] }));
    const floor = new THREE.Mesh(this.own(new THREE.PlaneGeometry(44, 34)), floorMat);
    floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, -3);
    this.root.add(floor);
    const wtex = this.own(wallTex(v));
    const wallMat = this.own(toon('#ffffff', { map: wtex, bands: [0.75, 0.92, 1] }));
    const back = new THREE.Mesh(this.own(new THREE.PlaneGeometry(44, 16)), wallMat);
    back.position.set(0, 8, -14.5);
    this.root.add(back);
    for (const s of [-1, 1]) {
      const side = new THREE.Mesh(this.own(new THREE.PlaneGeometry(34, 16)), wallMat);
      side.position.set(s * 19, 8, -3); side.rotation.y = -s * Math.PI / 2;
      this.root.add(side);
    }
    const ceil = new THREE.Mesh(this.own(new THREE.PlaneGeometry(44, 34)), toon(grand ? '#1a0a12' : '#0c0a10'));
    ceil.rotation.x = Math.PI / 2; ceil.position.set(0, 13, -3);
    this.root.add(ceil);

    const gold = toon('#d9b36c', { rim: 0.4, rimColor: '#fff4d0', bands: [0.45, 0.8, 1] });
    const wood = toon('#5a2a14', { bands: [0.5, 0.8, 1] });
    const felt = toon(grand ? '#146b43' : '#1f4a5a', { bands: [0.6, 0.85, 1] });

    // columns (instanced)
    const colPos: Array<[number, number]> = grand ? [[-13, -11], [-13, -5], [-13, 1], [13, -11], [13, -5], [13, 1]] : [[-13, -8], [13, -8]];
    const shaft = new THREE.InstancedMesh(this.own(new THREE.CylinderGeometry(0.55, 0.62, 10, 16)), grand ? gold : toon('#4a4050'), colPos.length);
    const cap = new THREE.InstancedMesh(this.own(new THREE.BoxGeometry(1.7, 0.5, 1.7)), grand ? gold : toon('#4a4050'), colPos.length * 2);
    const m = new THREE.Matrix4();
    colPos.forEach(([x, z], i) => {
      shaft.setMatrixAt(i, m.makeTranslation(x, 5, z));
      cap.setMatrixAt(i * 2, m.makeTranslation(x, 0.25, z));
      cap.setMatrixAt(i * 2 + 1, m.makeTranslation(x, 10, z));
    });
    this.root.add(shaft, cap);

    // marquee sign + chasing bulbs
    const signMat = new THREE.MeshBasicMaterial({ map: this.own(signTex(grand ? 'LA BANCA DE LAS MIL SUERTES' : 'EL CASINO CLANDESTINO', grand ? '#ffe9a8' : '#e0b8ff', grand ? '#ffb347' : '#9b5cff')), transparent: true, depthWrite: false, fog: false });
    signMat.color.setScalar(grand ? 1.35 : 1.25);
    this.own(signMat);
    const sign = new THREE.Mesh(this.own(new THREE.PlaneGeometry(16, 2.5)), signMat);
    sign.position.set(0, 9.9, -14.3);
    this.root.add(sign);
    const board = new THREE.Mesh(this.own(new THREE.BoxGeometry(17.2, 3.2, 0.3)), toon(grand ? '#2a0a14' : '#140a1e'));
    board.position.set(0, 9.9, -14.5);
    this.root.add(board);
    const bulbGeo = this.own(new THREE.SphereGeometry(0.11, 8, 6));
    const bulbMat = this.own(new THREE.MeshBasicMaterial({ color: '#ffffff', fog: false }));
    const nb = 64;
    this.bulbs = new THREE.InstancedMesh(bulbGeo, bulbMat, nb);
    this.bulbCount = nb;
    for (let i = 0; i < nb; i++) {
      const per = 2 * (17 + 3.2);
      let d = (i / nb) * per, x = 0, y = 0;
      if (d < 17) { x = -8.5 + d; y = 1.6; } else if ((d -= 17) < 3.2) { x = 8.5; y = 1.6 - d; } else if ((d -= 3.2) < 17) { x = 8.5 - d; y = -1.6; } else { d -= 17; x = -8.5; y = -1.6 + d; }
      this.bulbs.setMatrixAt(i, m.makeTranslation(x, 9.9 + y, -14.25));
      this.bulbs.setColorAt(i, this.tmpC.set('#ffe9a8'));
    }
    this.root.add(this.bulbs);

    // balcony + Tiburcio (grand only)
    if (grand) {
      const balc = new THREE.Mesh(this.own(new THREE.BoxGeometry(12, 0.5, 3.2)), wood);
      balc.position.set(0, 5, -12.9);
      this.root.add(balc);
      const rail = new THREE.Mesh(this.own(new THREE.BoxGeometry(12, 0.18, 0.18)), gold);
      rail.position.set(0, 6.1, -11.35);
      this.root.add(rail);
      const post = new THREE.InstancedMesh(this.own(new THREE.CylinderGeometry(0.07, 0.07, 1.1, 6)), gold, 13);
      for (let i = 0; i < 13; i++) post.setMatrixAt(i, m.makeTranslation(-6 + i, 5.6, -11.35));
      this.root.add(post);
      for (const s of [-1, 1]) {
        const drape = new THREE.Mesh(this.own(new THREE.CylinderGeometry(0.8, 1.1, 7, 12, 1, true, 0, Math.PI)), toon('#8a1a2a', { side: THREE.DoubleSide }));
        drape.position.set(s * 6.8, 8.6, -13.6);
        this.root.add(drape);
      }
      this.spot = new THREE.SpotLight('#fff0c8', 22, 16, 0.42, 0.6, 1.2);
      this.spot.position.set(0, 12.5, -8);
      this.spot.target.position.set(0, 5.2, -12.6);
      this.root.add(this.spot, this.spot.target);
      const tib = this.addRig({ seed: 'tiburcio', race: 'duende', special: 'tiburcio', job: 'banquero', scale: 1.35 }, 'boss', 0, 5.25, -12.4, 0);
      this.tiburcio = tib;
      const tbl = new THREE.Mesh(this.own(new THREE.CylinderGeometry(0.9, 0.9, 0.12, 20)), felt);
      tbl.position.set(1.8, 6.0, -12.6);
      this.root.add(tbl);
    }

    // chandeliers
    const chPos: Array<[number, number, number]> = grand ? [[-7, 9.2, -6], [0, 9.8, -3], [7, 9.2, -6]] : [[0, 9, -5]];
    const crystalGeo = this.own(new THREE.OctahedronGeometry(0.12, 0));
    const crystalMat = glow(grand ? '#dff6ff' : '#e0c8ff', 1.25);
    const candleMat = glow(grand ? '#ffd28a' : '#c7a2ff', 2.1);
    const ringGeo = this.own(new THREE.TorusGeometry(1.5, 0.08, 8, 40));
    const ring2 = this.own(new THREE.TorusGeometry(0.9, 0.07, 8, 32));
    chPos.forEach(([x, y, z], ci) => {
      const g = new THREE.Group();
      g.position.set(x, y, z);
      const r1 = new THREE.Mesh(ringGeo, gold); r1.rotation.x = Math.PI / 2;
      const r2 = new THREE.Mesh(ring2, gold); r2.rotation.x = Math.PI / 2; r2.position.y = -0.6;
      const chain = new THREE.Mesh(this.own(new THREE.CylinderGeometry(0.04, 0.04, 13 - y, 5)), gold);
      chain.position.y = (13 - y) / 2;
      g.add(r1, r2, chain);
      const nC = 14;
      const candles = new THREE.InstancedMesh(bulbGeo, candleMat, nC + 8);
      const crystals = new THREE.InstancedMesh(crystalGeo, crystalMat, 24);
      for (let i = 0; i < nC; i++) { const a = (i / nC) * Math.PI * 2; candles.setMatrixAt(i, m.makeTranslation(Math.cos(a) * 1.5, 0.18, Math.sin(a) * 1.5)); }
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; candles.setMatrixAt(nC + i, m.makeTranslation(Math.cos(a) * 0.9, -0.45, Math.sin(a) * 0.9)); }
      for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; const rr = i % 2 ? 1.5 : 1.15; crystals.setMatrixAt(i, m.compose(new THREE.Vector3(Math.cos(a) * rr, -0.35 - (i % 3) * 0.22, Math.sin(a) * rr), new THREE.Quaternion(), new THREE.Vector3(0.7, 1.6, 0.7))); }
      g.add(candles, crystals);
      const light = new THREE.PointLight(grand ? '#ffcf8a' : '#b48cff', grand ? 30 : 22, 20, 1.6);
      light.position.y = -0.8;
      g.add(light);
      this.root.add(g);
      this.chandeliers.push({ g, light, phase: ci * 1.7 });
    });
    // neon accents are emissive-only (bloom) — no extra point lights, to keep the lobby at 60 fps

    // roulette table
    const rt = new THREE.Group(); rt.position.set(-7, 0, -7.2);
    const rtFelt = new THREE.Mesh(this.own(new THREE.CylinderGeometry(2.2, 2.2, 0.16, 32)), felt); rtFelt.scale.set(1.25, 1, 0.85); rtFelt.position.y = 1.02;
    const rtRim = new THREE.Mesh(this.own(new THREE.TorusGeometry(2.2, 0.14, 8, 40)), wood); rtRim.rotation.x = Math.PI / 2; rtRim.scale.set(1.25, 0.85, 1); rtRim.position.y = 1.1;
    const rtLeg = new THREE.Mesh(this.own(new THREE.CylinderGeometry(0.5, 0.8, 1, 12)), wood); rtLeg.position.y = 0.5;
    this.wheel = new THREE.Mesh(this.own(new THREE.CylinderGeometry(0.85, 0.85, 0.12, 37)), [toon('#3a1a0a'), this.own(toon('#ffffff', { map: this.own(wheelTex()) })), toon('#3a1a0a')]);
    this.wheel.position.set(-1.2, 1.18, 0);
    rt.add(rtFelt, rtRim, rtLeg, this.wheel);
    withOutline(rtRim, 0.03);
    this.chips(rt, [[0.6, -0.3], [1.1, 0.4], [0.3, 0.5], [1.6, -0.2]], 1.12);
    this.root.add(rt);
    this.addRig({ seed: 'crupier_ruleta', race: 'duende', job: 'crupier' }, 'croupier', -7, 0, -9.2, 0);

    // tarot (blackjack) table
    const tt = new THREE.Group(); tt.position.set(7, 0, -7.2);
    const ttFelt = new THREE.Mesh(this.own(new THREE.CylinderGeometry(2.4, 2.4, 0.16, 32, 1, false, Math.PI / 2, Math.PI)), felt); ttFelt.position.y = 1.02; ttFelt.rotation.y = Math.PI;
    const ttBase = new THREE.Mesh(this.own(new THREE.BoxGeometry(4.6, 1, 1.2)), wood); ttBase.position.set(0, 0.5, -0.4);
    tt.add(ttFelt, ttBase);
    const cardMat = toon('#f3ead8'); const backMat = toon('#4a1a7a');
    for (let i = 0; i < 5; i++) {
      const card = new THREE.Mesh(this.own(new THREE.BoxGeometry(0.34, 0.012, 0.5)), i % 2 ? cardMat : backMat);
      card.position.set(-1.2 + i * 0.6, 1.12, 0.9 + Math.sin(i) * 0.1); card.rotation.y = (i - 2) * 0.15;
      tt.add(card);
    }
    this.chips(tt, [[-1.5, 1.4], [0, 1.6], [1.5, 1.4]], 1.12);
    this.root.add(tt);
    this.addRig({ seed: 'crupier_tarot', race: 'duende', job: 'crupier', gender: 'f' }, 'croupier', 7, 0, -8.9, 0);

    // dice table
    const dt = new THREE.Group(); dt.position.set(-4.6, 0, -1);
    const dtFelt = new THREE.Mesh(this.own(new THREE.BoxGeometry(3.6, 0.18, 2)), felt); dtFelt.position.y = 1.0;
    const dtRail = new THREE.Mesh(this.own(new THREE.BoxGeometry(3.9, 0.3, 2.3)), wood); dtRail.position.y = 0.86;
    const dtLeg = new THREE.Mesh(this.own(new THREE.BoxGeometry(3, 0.8, 1.5)), wood); dtLeg.position.y = 0.4;
    dt.add(dtRail, dtFelt, dtLeg);
    const dieMat = toon('#fffaf0', { rim: 0.2 });
    for (let i = 0; i < 5; i++) {
      const d = new THREE.Mesh(this.own(new THREE.BoxGeometry(0.22, 0.22, 0.22)), dieMat);
      d.position.set(-0.8 + i * 0.4, 1.2, 0.2 + (i % 2) * 0.3); d.rotation.set(i, i * 0.7, 0);
      withOutline(d, 0.015);
      dt.add(d);
    }
    this.root.add(dt);
    if (grand) this.addRig({ seed: 'crupier_dados', race: 'duende', job: 'crupier' }, 'croupier', -4.6, 0, -2.6, 0);

    // wishing well
    const well = new THREE.Group(); well.position.set(0, 0, -6);
    const stone = toon(grand ? '#8a8aa0' : '#5a5a6a', { bands: [0.55, 0.8, 1] });
    const wRing = new THREE.Mesh(this.own(new THREE.CylinderGeometry(1.6, 1.75, 1.0, 24, 1, true)), stone); wRing.position.y = 0.5;
    const wLip = new THREE.Mesh(this.own(new THREE.TorusGeometry(1.65, 0.16, 8, 28)), stone); wLip.rotation.x = Math.PI / 2; wLip.position.y = 1.0;
    const water = new THREE.Mesh(this.own(new THREE.CircleGeometry(1.55, 28)), glow('#4fd8ff', 1.05)); water.rotation.x = -Math.PI / 2; water.position.y = 0.72;
    const beamMat = this.own(new THREE.MeshBasicMaterial({ color: new THREE.Color(grand ? '#ffe9a8' : '#b48cff').multiplyScalar(grand ? 0.75 : 0.6), transparent: true, opacity: grand ? 0.055 : 0.045, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    const beam = new THREE.Mesh(this.own(new THREE.CylinderGeometry(0.7, 1.3, 12, 20, 1, true)), beamMat); beam.position.y = 6.5;
    well.add(wRing, wLip, water, beam);
    withOutline(wLip, 0.03);
    this.root.add(well);

    // slot machine rows (instanced bodies + individual animated screens)
    const slotXs = grand ? [-12.2, 12.2] : [-12.2];
    const nPer = grand ? 5 : 3;
    const bodyGeo = this.own(new THREE.BoxGeometry(1.3, 2.3, 1));
    const bodies = new THREE.InstancedMesh(bodyGeo, toon(grand ? '#9a1a2a' : '#3a2a4a', { rim: 0.25 }), slotXs.length * nPer);
    const tops = new THREE.InstancedMesh(this.own(new THREE.SphereGeometry(0.28, 12, 8)), glow('#ff4fa3', 2.4), slotXs.length * nPer);
    const screenGeo = this.own(new THREE.PlaneGeometry(0.95, 0.7));
    let bi = 0;
    for (const sx of slotXs) {
      const face = sx < 0 ? 1 : -1;
      for (let i = 0; i < nPer; i++) {
        const z = -11 + i * 2.4;
        const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), face * Math.PI / 2);
        bodies.setMatrixAt(bi, m.compose(new THREE.Vector3(sx, 1.15, z), q, new THREE.Vector3(1, 1, 1)));
        tops.setMatrixAt(bi, m.makeTranslation(sx, 2.5, z));
        bi++;
        const tex = new THREE.CanvasTexture(document.createElement('canvas'));
        const smat = this.own(new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(1.3, 1.3, 1.3), fog: false }));
        const scr = new THREE.Mesh(screenGeo, smat);
        scr.position.set(sx + face * 0.51, 1.55, z);
        scr.rotation.y = face * Math.PI / 2;
        this.root.add(scr);
        this.screens.push({ tex, speed: 0, stopT: 0, off: Math.random() });
      }
    }
    this.root.add(bodies, tops);
    void this.buildScreenAtlas();

    // arena odds board
    if (grand) {
      this.boardMat = this.own(new THREE.MeshBasicMaterial({ map: this.own(boardTex(['Los Tragapiedras  ×1,8', 'La Guardia del Alba  ×2,1', '¡Apuestas abiertas!'])), fog: false }));
      this.boardMat.color.setScalar(1.25);
      const bg = new THREE.Group();
      bg.position.set(10.2, 3.4, -3.6); bg.rotation.y = -Math.PI / 4;
      const ab = new THREE.Mesh(this.own(new THREE.PlaneGeometry(5, 3.1)), this.boardMat);
      ab.position.z = 0.02;
      const frame = new THREE.Mesh(this.own(new THREE.BoxGeometry(5.3, 3.4, 0.2)), gold);
      frame.position.z = -0.12;
      const leg = new THREE.Mesh(this.own(new THREE.CylinderGeometry(0.12, 0.12, 2, 8)), gold);
      leg.position.set(0, -2.6, -0.12);
      bg.add(frame, ab, leg);
      this.root.add(bg);
    } else {
      // barrels & crates for the speakeasy
      const barrel = this.own(new THREE.CylinderGeometry(0.55, 0.6, 1.2, 14));
      for (const [x, z] of [[9, -3], [10.2, -2.2], [9.6, -1], [-9.5, 2]] as Array<[number, number]>) {
        const b = new THREE.Mesh(barrel, wood); b.position.set(x, 0.6, z); withOutline(b, 0.03); this.root.add(b);
      }
    }

    // patrons
    const patrons: Array<[CharacterSpec, number, number, number]> = grand ? [
      [{ seed: 'pat_enano', race: 'enano', job: 'mercader' }, -8.2, -5.4, Math.PI * 0.95],
      [{ seed: 'pat_elfa', race: 'elfo', job: 'noble', gender: 'f' }, -5.8, -5.3, Math.PI * 1.05],
      [{ seed: 'pat_sirena', race: 'sirena', job: 'cortesana', gender: 'f' }, 6.2, -5.4, Math.PI],
      [{ seed: 'pat_ogro', race: 'ogro', job: 'guerrero' }, -10.4, -3.6, -Math.PI / 2],
      [{ seed: 'pat_pirata', race: 'humano', job: 'pirata' }, -10.6, -8.6, -Math.PI / 2],
    ] : [
      [{ seed: 'cl_chato', race: 'duende', job: 'tabernero' }, 2.5, -8.5, 0],
      [{ seed: 'cl_picaro', race: 'picaro', job: 'ladron' }, -5.8, -5.3, Math.PI],
      [{ seed: 'cl_pirata', race: 'humano', job: 'pirata', gender: 'f' }, 6.2, -5.4, Math.PI],
    ];
    for (const [spec, x, z, ry] of patrons) this.addRig(spec, 'patron', x, 0, z, ry);

    // floating gold dust
    const n = 260;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - 0.5) * 30; pos[i * 3 + 1] = Math.random() * 11; pos[i * 3 + 2] = -14 + Math.random() * 20; }
    const pg = this.own(new THREE.BufferGeometry()); pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pm = this.own(new THREE.PointsMaterial({ color: grand ? '#ffe2a0' : '#c7a2ff', size: 0.07, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.motes = new THREE.Points(pg, pm);
    this.root.add(this.motes);
  }

  private chips(parent: THREE.Group, spots: Array<[number, number]>, y: number): void {
    const cols = ['#c0303a', '#1e9a4a', '#1a1420', '#7a3ad0', '#e8e2d0'];
    const geo = this.own(new THREE.CylinderGeometry(0.11, 0.11, 0.035, 14));
    let count = 0;
    const stacks = spots.map(() => 3 + Math.floor(Math.random() * 6));
    stacks.forEach((s) => { count += s; });
    const im = new THREE.InstancedMesh(geo, toon('#ffffff', { rim: 0.2 }), count);
    const m = new THREE.Matrix4();
    let k = 0;
    spots.forEach(([x, z], si) => {
      const c = cols[si % cols.length];
      for (let j = 0; j < stacks[si]; j++) { im.setMatrixAt(k, m.makeTranslation(x, y + j * 0.036, z)); im.setColorAt(k, this.tmpC.set(c)); k++; }
    });
    parent.add(im);
  }

  private addRig(spec: CharacterSpec, kind: 'croupier' | 'patron' | 'boss', x: number, y: number, z: number, ry: number): CharacterRig {
    const rig = buildCharacter(spec);
    rig.root.position.set(x, y, z);
    rig.root.rotation.y = ry;
    rig.root.traverse((o) => { o.castShadow = false; });
    this.root.add(rig.root);
    this.rigs.push({ rig, kind, home: rig.root.position.clone(), t: Math.random() * 10 });
    return rig;
  }

  private async buildScreenAtlas(): Promise<void> {
    const syms: SymId[] = ['libro', 'moneda', 'corona', 'wild', 'caliz', 'daga', 'eclipse', 'dado', 'luna', 'farol'];
    const S = 96;
    const c = document.createElement('canvas');
    c.width = S; c.height = S * syms.length;
    const g = c.getContext('2d')!;
    g.fillStyle = '#fff8ec'; g.fillRect(0, 0, c.width, c.height);
    const imgs = await Promise.all(syms.map((s) => rasterize(symbolSVG(s, S, false), S)));
    imgs.forEach((im, i) => g.drawImage(im, 0, i * S, S, S));
    for (const s of this.screens) {
      s.tex.image = c;
      s.tex.colorSpace = THREE.SRGBColorSpace;
      s.tex.wrapT = THREE.RepeatWrapping;
      s.tex.repeat.set(1, 1.5 / syms.length);
      s.tex.needsUpdate = true;
    }
  }

  /** Camera glides to a per-game preset. */
  focus(f: Focus): void { this.focusId = f; this.tgtPos.set(...FOCUS[f].pos); this.tgtLook.set(...FOCUS[f].look); }
  get focused(): Focus { return this.focusId; }

  /** 1 small win · 2 big win · 3 jackpot. The whole room reacts. */
  celebrate(level: 1 | 2 | 3): void {
    this.party = Math.max(this.party, level === 3 ? 6 : level === 2 ? 3 : 1.2);
    for (const r of this.rigs) {
      if (level === 1 && r.kind !== 'croupier') continue;
      r.rig.play('cheer', 0.9 + Math.random() * 0.4);
      r.rig.setExpression('happy');
    }
    if (level >= 2) {
      for (const ch of this.chandeliers) this.fx.emit('confetti', ch.g.position.clone().add(new THREE.Vector3(0, -0.6, 0)), { count: level === 3 ? 90 : 45 });
      this.fx.emit('coins', new THREE.Vector3(0, 1.4, -6), { count: level === 3 ? 60 : 30, scale: 1.2 });
    }
    if (level === 3) {
      this.shakeA = 0.6;
      this.tiburcio?.play('point', 1.4);
      for (let i = 0; i < 6; i++) this.fx.emit('luck', new THREE.Vector3((Math.random() - 0.5) * 20, 3 + Math.random() * 5, -8 + Math.random() * 8), { count: 20 });
    }
  }

  /** Losses: croupiers look smug, Tiburcio nods. */
  gloat(): void {
    for (const r of this.rigs) if (r.kind !== 'patron') { r.rig.setExpression('happy'); r.rig.play('point', 0.6); }
  }

  /** Tension (anticipation, final bet): lights dim. */
  setTension(v: number): void { this.dimTarget = v; }
  shake(a: number): void { this.shakeA = Math.max(this.shakeA, a); }

  /** Updates the arena odds board text. */
  setBoard(lines: string[]): void {
    if (!this.boardMat) return;
    const old = this.boardMat.map;
    this.boardMat.map = boardTex(lines);
    this.boardMat.needsUpdate = true;
    old?.dispose();
  }

  /** Spin a random decorative slot machine screen (ambient life). */
  private ambientScreens(dt: number): void {
    for (const s of this.screens) {
      if (s.speed > 0) {
        s.off += s.speed * dt;
        s.stopT -= dt;
        if (s.stopT <= 0) { s.speed = 0; s.off = Math.round(s.off * 10) / 10; }
        s.tex.offset.y = s.off % 1;
      } else if (Math.random() < dt * 0.12) { s.speed = 2.2 + Math.random() * 2; s.stopT = 1 + Math.random() * 1.5; }
    }
  }

  update(dt: number, realDt: number): void {
    this.t += dt;
    const t = this.t;
    // camera: damped glide + slow idle drift in the lobby
    const drift = this.focusId === 'lobby' ? 1 : 0.25;
    const idle = new THREE.Vector3(Math.sin(t * 0.11) * 1.6 * drift, Math.sin(t * 0.17) * 0.25 * drift, Math.cos(t * 0.09) * 0.8 * drift);
    dampVec3(this.camPos, this.tgtPos, 2.2, realDt);
    dampVec3(this.camLook, this.tgtLook, 2.6, realDt);
    this.camera.position.copy(this.camPos).add(idle);
    if (this.shakeA > 0.001) {
      this.camera.position.x += (Math.random() - 0.5) * this.shakeA * 0.35;
      this.camera.position.y += (Math.random() - 0.5) * this.shakeA * 0.35;
      this.shakeA = Math.max(0, this.shakeA - realDt * 1.4);
    }
    this.camera.lookAt(this.camLook);

    // lights: chandelier sway & flicker, party strobe, tension dim
    this.dim = damp(this.dim, this.dimTarget, 3, realDt);
    this.party = Math.max(0, this.party - realDt);
    const baseI = this.variant === 'grand' ? 30 : 22;
    for (const ch of this.chandeliers) {
      ch.g.rotation.z = Math.sin(t * 0.6 + ch.phase) * 0.015;
      ch.g.rotation.y += dt * 0.05;
      const flick = 1 + Math.sin(t * 13 + ch.phase) * 0.03 + (Math.random() - 0.5) * 0.04;
      ch.light.intensity = baseI * flick * (1 - this.dim * 0.7) * (this.party > 0 ? 1.25 + Math.sin(t * 20) * 0.25 : 1);
    }
    this.hemi.intensity = (this.variant === 'grand' ? 0.75 : 0.5) * (1 - this.dim * 0.6);
    if (this.spot) this.spot.intensity = 22 * (1 + this.dim * 1.2);

    // marquee chase
    if (this.bulbs) {
      const speed = this.party > 0 ? 26 : 9;
      const head = (t * speed) % this.bulbCount;
      for (let i = 0; i < this.bulbCount; i++) {
        const d = ((i - head) % this.bulbCount + this.bulbCount) % this.bulbCount;
        const on = d < 3 || (this.party > 0 && (i + Math.floor(t * 12)) % 2 === 0);
        const k = on ? 2.2 : 0.4 + (i % 4 === 0 ? 0.2 : 0);
        this.tmpC.set(this.party > 0 && i % 3 === 0 ? '#ff4fa3' : this.variant === 'grand' ? '#ffe2a0' : '#d0a8ff').multiplyScalar(k * (1 - this.dim * 0.5));
        this.bulbs.setColorAt(i, this.tmpC);
      }
      if (this.bulbs.instanceColor) this.bulbs.instanceColor.needsUpdate = true;
    }
    if (this.wheel) this.wheel.rotation.y += dt * 0.9;
    this.ambientScreens(dt);
    if (this.motes) { this.motes.rotation.y = Math.sin(t * 0.05) * 0.05; this.motes.position.y = Math.sin(t * 0.3) * 0.15; }
    if (Math.random() < dt * 1.5) this.fx.emit('luck', new THREE.Vector3(0 + (Math.random() - 0.5) * 2, 1.2, -6 + (Math.random() - 0.5) * 2), { count: 3, speed: 1.2, up: 2.5, life: 1.6 });

    // rigs: idle life
    for (const r of this.rigs) {
      r.t += dt;
      r.rig.update(dt, { speed: 0 });
      if (r.kind === 'croupier' && Math.random() < dt * 0.15) r.rig.play(Math.random() < 0.5 ? 'point' : 'cast', 0.5);
      if (r.kind === 'patron' && Math.random() < dt * 0.05) { r.rig.play('cheer', 0.8); r.rig.setExpression('happy'); }
      if (Math.random() < dt * 0.08) r.rig.setExpression('neutral');
    }
    this.fx.update(dt);
  }

  dispose(): void {
    for (const r of this.rigs) r.rig.dispose();
    this.rigs.length = 0;
    // Fx.dispose() only detaches; free its per-instance GPU buffers too (a new Fx is built every visit)
    this.fx.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material & { uniforms?: { uMap?: { value?: THREE.Texture } } };
      mat.uniforms?.uMap?.value?.dispose();
      mat.dispose?.();
    });
    this.fx.dispose();
    this.boardMat?.map?.dispose();
    for (const s of this.screens) s.tex.dispose();
    for (const d of this.disposables) { try { d.dispose(); } catch { /* ignore */ } }
    this.root.traverse((o) => { const im = o as THREE.InstancedMesh; if (im.isInstancedMesh) im.dispose(); });
    this.scene.remove(this.root);
    this.scene.fog = null;
  }
}
