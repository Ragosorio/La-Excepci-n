/**
 * TABS-style deployment: roster grouped by unit type (counts, stars), click/drag to paint units in the blue zone,
 * right-drag to remove, enemy preview in the red zone (captains highlighted), Auto / Limpiar / ¡Comenzar!.
 */
import * as THREE from 'three';
import type { ArmyUnit } from '../data/types';
import type { Battle } from './world';
import type { Zone } from './formation';
import { formation } from './formation';
import { specFor } from './defs';
import { h, layer } from '../ui/dom';
import { button, panel } from '../ui/widgets';
import { input } from '../core/input';
import { portraitSVG } from '../ui/art/portraits';
import { audio } from '../audio';
import { F_CAPTAIN, F_BOSS, F_HERO, TEAM_PLAYER, S_DEAD } from './const';

interface Group { unitId: string; items: number[]; placed: Map<number, number>; el?: HTMLElement; cnt?: HTMLElement }

const V = new THREE.Vector3();

export class Deploy {
  private root: HTMLElement;
  private groups: Group[] = [];
  private sel = 0;
  private zoneMeshes: THREE.Mesh[] = [];
  private ghost: THREE.Mesh;
  private mats: THREE.Material[] = [];
  private paintLast = { x: 1e9, z: 1e9 };
  private done = false;

  constructor(private b: Battle, private army: ArmyUnit[], private zone: Zone, private enemyZone: Zone, private onStart: () => void) {
    // group army by unit id (sorted by role for a readable roster)
    const map = new Map<string, Group>();
    army.forEach((a, k) => {
      let g = map.get(a.unitId);
      if (!g) { g = { unitId: a.unitId, items: [], placed: new Map() }; map.set(a.unitId, g); }
      g.items.push(k);
    });
    this.groups = [...map.values()];
    this.zoneMeshes.push(this.zoneDecal(zone, '#5a8cff'), this.zoneDecal(enemyZone, '#ff4a5a'));
    const gm = new THREE.MeshBasicMaterial({ color: new THREE.Color('#9cc0ff').multiplyScalar(1.5), transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending });
    this.mats.push(gm);
    this.ghost = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.55, 24).rotateX(-Math.PI / 2), gm);
    this.ghost.renderOrder = 30;
    b.scene.add(this.ghost);
    this.root = h('div', { class: 'bt-deploy' });
    layer('panel').appendChild(this.root);
    this.buildUI();
    this.autoPlace();
    window.addEventListener('keydown', this.onKey);
  }

  private onKey = (e: KeyboardEvent) => {
    if (this.done) return;
    if (e.code === 'Enter') { e.preventDefault(); this.start(); }
    const n = Number(e.key);
    if (n >= 1 && n <= 9 && this.groups[n - 1]) this.select(n - 1);
  };

  private zoneDecal(z: Zone, color: string): THREE.Mesh {
    const w = z.x1 - z.x0, d = z.z1 - z.z0;
    const g = new THREE.PlaneGeometry(w, d, 24, 12).rotateX(-Math.PI / 2);
    const pos = g.getAttribute('position');
    for (let i = 0; i < pos.count; i++) pos.setY(i, this.b.heightAt(pos.getX(i) + (z.x0 + z.x1) / 2, pos.getZ(i) + (z.z0 + z.z1) / 2) + 0.12);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(color) }, uTime: { value: 0 }, uSize: { value: new THREE.Vector2(w, d) } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 uColor; uniform float uTime; uniform vec2 uSize; varying vec2 vUv;
        void main(){ vec2 p = vUv * uSize; float e = min(min(p.x, uSize.x - p.x), min(p.y, uSize.y - p.y));
          float edge = 1.0 - smoothstep(0.0, 0.35, e); float stripe = step(0.5, fract((p.x + p.y) * 0.25 - uTime * 0.4)) * 0.06;
          float a = edge * 0.9 + 0.1 + stripe; gl_FragColor = vec4(uColor * (1.2 + edge), a * 0.55); }`,
      transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
    });
    this.mats.push(mat);
    const m = new THREE.Mesh(g, mat);
    m.position.set((z.x0 + z.x1) / 2, 0, (z.z0 + z.z1) / 2);
    m.renderOrder = 2;
    this.b.scene.add(m);
    return m;
  }

  private buildUI(): void {
    const b = this.b;
    const list = h('div', { class: 'bt-roster-list' });
    this.groups.forEach((g, k) => {
      const s = specFor(g.unitId);
      const stars = Math.max(0, ...g.items.map((i) => this.army[i].stars ?? 0));
      const cnt = h('div', { class: 'cnt' });
      const el = h('div', { class: 'bt-rgroup', onclick: () => this.select(k), 'data-tip': `<b>${s.name}</b>\n${s.def.desc}\nVida ${s.def.hp} · Daño ${s.def.damage} · ${roleName(s.role)}` },
        h('div', { class: 'pt', html: portraitSVG({ seed: g.unitId, race: s.race, job: s.job, mood: 'determined' }, 64) }),
        h('div', { class: 'info' }, h('div', { class: 'nm' }, s.name), h('div', { class: 'meta' }, roleName(s.role), stars ? h('span', { class: 'stars' }, ' ' + '★'.repeat(stars)) : null)),
        cnt);
      g.el = el; g.cnt = cnt;
      list.appendChild(el);
    });
    const roster = panel({ title: 'Tu ejército', className: 'bt-roster' }, h('div', { class: 'lx-small lx-muted' }, 'Clic o arrastra en la zona azul para colocar. Clic derecho para quitar.'), list);
    // enemy info
    const counts = new Map<string, number>();
    const caps: string[] = [];
    const u = b.u;
    for (let i = 0; i < u.n; i++) {
      if (!u.active[i] || u.team[i] === TEAM_PLAYER || u.state[i] === S_DEAD) continue;
      if (u.flags[i] & (F_CAPTAIN | F_BOSS | F_HERO)) caps.push(`${b.nameOf(i)}${b.metaOf(i)?.title ? ', ' + b.metaOf(i)!.title : ''}`);
      else counts.set(u.specOf(i).name, (counts.get(u.specOf(i).name) ?? 0) + 1);
    }
    const enemy = panel({ title: 'Enemigo', className: 'bt-enemy-info' },
      ...[...counts].map(([n, c]) => h('div', { class: 'row' }, h('span', null, n), h('b', null, String(c)))),
      ...caps.map((c) => h('div', { class: 'row cap' }, '☠ ' + c)));
    const bottom = h('div', { class: 'bt-deploy-bottom' },
      button('Auto', () => this.autoPlace(), { kind: 'ghost', tip: 'Coloca automáticamente las tropas que faltan' }),
      button('Limpiar', () => this.clear(), { kind: 'ghost', tip: 'Quita todas las tropas colocadas' }),
      button('¡Comenzar!', () => this.start(), { kind: 'primary', big: true, className: 'go', hotkey: 'Enter' }));
    this.root.append(h('div', { class: 'bt-deploy-top' }, h('div', { class: 't' }, 'Despliegue'), h('div', { class: 's' }, b.setup.title ?? '')), roster, enemy, bottom);
    this.select(0);
    this.refresh();
  }

  private select(k: number): void {
    this.sel = k;
    this.groups.forEach((g, i) => g.el?.classList.toggle('sel', i === k));
    audio.sfx('ui_tab', { volume: 0.4 });
  }

  private refresh(): void {
    for (const g of this.groups) {
      const left = g.items.length - g.placed.size;
      if (g.cnt) g.cnt.textContent = `×${left}`;
      g.el?.classList.toggle('done', left === 0);
    }
  }

  private nextFree(g: Group): number { for (const k of g.items) if (!g.placed.has(k)) return k; return -1; }

  private place(g: Group, armyIdx: number, x: number, z: number): number {
    const a = this.army[armyIdx];
    const i = this.b.spawn(a.unitId, TEAM_PLAYER, x, z, { armyIdx, stars: a.stars, name: a.name, yaw: 0 });
    if (i < 0) return -1;
    if (a.hpPct !== undefined && a.hpPct < 1) this.b.u.hp[i] = Math.max(1, this.b.u.hpMax[i] * a.hpPct);
    if (a.devoto) this.b.u.flags[i] |= 1 << 6;
    g.placed.set(armyIdx, i);
    this.b.u.homeX[i] = x; this.b.u.homeZ[i] = z;
    return i;
  }

  private free(x: number, z: number, r: number): boolean {
    const u = this.b.u;
    for (let i = 0; i < u.n; i++) {
      if (!u.active[i] || u.team[i] !== TEAM_PLAYER) continue;
      if (Math.hypot(u.x[i] - x, u.z[i] - z) < r + u.radius[i] + 0.25) return false;
    }
    return true;
  }

  private inZone(x: number, z: number): boolean { const zn = this.zone; return x >= zn.x0 && x <= zn.x1 && z >= zn.z0 && z <= zn.z1; }

  autoPlace(): void {
    const ids: string[] = [], refs: Array<[Group, number]> = [];
    for (const g of this.groups) for (const k of g.items) if (!g.placed.has(k)) { ids.push(g.unitId); refs.push([g, k]); }
    if (!ids.length) return;
    const pos = formation(ids, this.zone);
    refs.forEach(([g, k], n) => {
      let { x, z } = pos[n];
      const r = specFor(g.unitId).radius;
      for (let t = 0; t < 30 && !this.free(x, z, r); t++) { x = pos[n].x + (Math.random() - 0.5) * (2 + t); z = pos[n].z + (Math.random() - 0.5) * (2 + t * 0.5); x = Math.max(this.zone.x0, Math.min(this.zone.x1, x)); z = Math.max(this.zone.z0, Math.min(this.zone.z1, z)); }
      this.place(g, k, x, z);
    });
    audio.sfx('ui_confirm', { volume: 0.5 });
    this.refresh();
  }

  clear(): void {
    for (const g of this.groups) { for (const i of g.placed.values()) this.b.remove(i); g.placed.clear(); }
    audio.sfx('ui_close', { volume: 0.5 });
    this.refresh();
  }

  private removeNear(x: number, z: number): void {
    for (const g of this.groups) for (const [k, i] of g.placed) {
      const u = this.b.u;
      if (Math.hypot(u.x[i] - x, u.z[i] - z) < u.radius[i] + 0.7) { this.b.remove(i); g.placed.delete(k); this.b.fx.emit('smoke', V.set(x, this.b.heightAt(x, z) + 0.5, z), { count: 3, scale: 0.4 }); this.refresh(); return; }
    }
  }

  update(realDt: number): void {
    if (this.done) return;
    const b = this.b;
    for (const m of this.zoneMeshes) (m.material as THREE.ShaderMaterial).uniforms.uTime.value += realDt;
    const ok = b.cam.ndcToGround(input.mouse.nx, input.mouse.ny, 0.5, V);
    if (!ok || input.mouse.overUI) { this.ghost.visible = false; return; }
    V.y = b.heightAt(V.x, V.z);
    this.ghost.position.set(V.x, V.y + 0.08, V.z);
    const g = this.groups[this.sel];
    const inside = this.inZone(V.x, V.z);
    this.ghost.visible = true;
    const r = g ? specFor(g.unitId).radius : 0.4;
    this.ghost.scale.setScalar(r * 2.2);
    (this.ghost.material as THREE.MeshBasicMaterial).color.set(inside && g && this.nextFree(g) >= 0 ? '#9cc0ff' : '#ff6a7a').multiplyScalar(1.5);
    if (input.mouse.buttons[2]) { this.removeNear(V.x, V.z); return; }
    if (!input.mouse.buttons[0] || !inside || !g) { this.paintLast.x = 1e9; return; }
    const spacing = Math.max(1.2, r * 2.3);
    if (Math.hypot(V.x - this.paintLast.x, V.z - this.paintLast.z) < spacing * 0.9) return;
    const k = this.nextFree(g);
    if (k < 0) {
      // group exhausted: jump to the next group with units left
      const nxt = this.groups.findIndex((q) => this.nextFree(q) >= 0);
      if (nxt >= 0) this.select(nxt);
      return;
    }
    if (!this.free(V.x, V.z, r)) return;
    if (this.place(g, k, V.x, V.z) >= 0) {
      this.paintLast.x = V.x; this.paintLast.z = V.z;
      audio.sfx('chip_place', { volume: 0.35, pitch: 0.9 + Math.random() * 0.3 });
      b.fx.emit('dust', V.set(V.x, V.y + 0.2, V.z), { count: 3, scale: 0.4 });
      this.refresh();
    }
  }

  start(): void {
    if (this.done) return;
    this.autoPlace();
    this.done = true;
    audio.sfx('horn_war', { volume: 0.9 });
    this.dispose();
    this.onStart();
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKey);
    this.root.remove();
    for (const m of this.zoneMeshes) { m.removeFromParent(); m.geometry.dispose(); }
    this.ghost.removeFromParent(); this.ghost.geometry.dispose();
    for (const m of this.mats) m.dispose();
  }
}

export function roleName(r: string): string {
  return ({ melee: 'Cuerpo a cuerpo', rango: 'A distancia', mago: 'Mago', sanador: 'Sanador', tanque: 'Tanque', asesino: 'Asesino', asedio: 'Asedio', monstruo: 'Monstruo', apoyo: 'Apoyo' } as Record<string, string>)[r] ?? r;
}

