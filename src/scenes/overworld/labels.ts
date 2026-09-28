/**
 * DOM labels projected over the diorama: location names (Cinzel + kind icon + state badges), party tags,
 * speech-bubble barks, the tracked-designio marker and the off-screen arrow toward it.
 */
import * as THREE from 'three';
import type { LocationDef } from '../../data/types';
import { LOCATION_LIST, LOCATIONS } from '../../data/world';
import { RELICS } from '../../data/relics';
import { G } from '../../core/state';
import { h, esc } from '../../ui/dom';
import { locationHeight } from '../../systems/world/geo';
import { W, factionColor, factionName, type PartyState } from '../../systems/world/state';
import { KIND_ICON, PARTY_ICON } from './icons';

const tmp = new THREE.Vector3();

interface LocLabel { def: LocationDef; el: HTMLElement; badges: HTMLElement; y: number; major: boolean; sig: string }
interface Bubble { el: HTMLElement; t: number; life: number; follow: () => THREE.Vector3 | null }
interface PartyTag { el: HTMLElement; sig: string; seen: number }

export type PoliticalMode = 'corrupcion' | 'control' | 'miedo' | null;

export class MapLabels {
  readonly root = h('div', { class: 'ow-labels' });
  private locs: LocLabel[] = [];
  private tags = new Map<string, PartyTag>();
  private bubbles: Bubble[] = [];
  private arrow = h('div', { class: 'ow-arrow', html: '<svg viewBox="0 0 24 24"><path d="M12 2l7 18-7-4-7 4z" fill="currentColor"/></svg>' });
  private marker = h('div', { class: 'ow-qmark', html: '<span>◆</span>' });
  hoverLoc: string | null = null;
  hoverParty: string | null = null;
  political: PoliticalMode = null;

  constructor(private onLocClick: (id: string) => void) {
    for (const def of LOCATION_LIST) {
      const major = ['capital', 'concilio', 'casino', 'santuario'].includes(def.kind) || def.id === 'aldea_colmenas';
      const badges = h('span', { class: 'ow-lb-badges' });
      const el = h('div', { class: `ow-label ${major ? 'major' : ''} k-${def.kind}`, 'data-id': def.id },
        h('span', { class: 'ow-lb-icon', html: KIND_ICON[def.kind] }),
        h('span', { class: 'ow-lb-name' }, def.name),
        badges);
      el.addEventListener('pointerenter', () => { this.hoverLoc = def.id; });
      el.addEventListener('pointerleave', () => { if (this.hoverLoc === def.id) this.hoverLoc = null; });
      el.addEventListener('click', (e) => { e.stopPropagation(); this.onLocClick(def.id); });
      this.root.appendChild(el);
      this.locs.push({ def, el, badges, y: locationHeight(def.id) + (major ? 7.2 : 5.2), major, sig: '' });
    }
    this.root.append(this.marker, this.arrow);
  }

  /** Recompute badges (cheap; called a few times per second). */
  refreshBadges(): void {
    if (!G.hasRun) return;
    const tracked = W().tracked;
    const q = tracked ? G.run.quests.find((x) => x.id === tracked && !x.done && !x.failed) : undefined;
    const targets = new Set(G.run.quests.filter((x) => !x.done && !x.failed && x.target).map((x) => x.target!));
    for (const l of this.locs) {
      const st = G.run.locations[l.def.id];
      if (!st) continue;
      const relicKnown = !!st.relic && !st.explored && (st.visited || !!st.flags.relicKnown || !!G.run.flags.brujula);
      const ctrl = st.control;
      const parts: string[] = [];
      if (ctrl === 'excepcion' && l.def.id !== 'crater') parts.push('<i class="ow-b-ecl" data-tip="Bajo tu control">◉</i>');
      if (G.run.player.sanctuaries.includes(l.def.id)) parts.push('<i class="ow-b-san" data-tip="Santuario">✧</i>');
      if (relicKnown) parts.push(`<i class="ow-b-relic" data-tip="Rumor: ${esc(RELICS[st.relic!]?.name ?? 'una reliquia')}">✦</i>`);
      if (targets.has(l.def.id)) parts.push(`<i class="ow-b-quest ${q?.target === l.def.id ? 'tracked' : ''}" data-tip="Designio">◆</i>`);
      if (this.political === 'control') parts.push(`<i class="ow-b-pol" style="--c:${factionColor(ctrl)}">${esc(factionName(ctrl))}</i>`);
      else if (this.political === 'miedo') parts.push(`<i class="ow-b-pol fear" style="--c:hsl(${Math.round(270 - st.fear * 2.7)},70%,60%)">Miedo ${Math.round(st.fear)}</i>`);
      else if (this.political === 'corrupcion') parts.push(`<i class="ow-b-pol" style="--c:#b27dff">${Math.round(G.run.continents[l.def.continent]?.corruption ?? 0)}%</i>`);
      const sig = parts.join('') + (st.visited ? 'v' : '') + ctrl;
      if (sig !== l.sig) {
        l.sig = sig;
        l.badges.innerHTML = parts.join('');
        l.el.classList.toggle('unvisited', !st.visited);
        l.el.classList.toggle('mine', ctrl === 'excepcion');
        l.el.style.setProperty('--fc', factionColor(ctrl));
      }
    }
  }

  update(camera: THREE.Camera, w: number, hgt: number, camDist: number, focus: THREE.Vector3, parties: PartyState[], partyPos: (p: PartyState) => THREE.Vector3 | null, eliasPos: THREE.Vector3): void {
    const zoomT = Math.max(0, Math.min(1, (camDist - 30) / 120));
    const scale = 1.08 - zoomT * 0.3;
    for (const l of this.locs) {
      tmp.set(l.def.pos.x, l.y, l.def.pos.z).project(camera);
      const onScreen = tmp.z < 1 && tmp.x > -1.15 && tmp.x < 1.15 && tmp.y > -1.15 && tmp.y < 1.2;
      const far = Math.hypot(l.def.pos.x - focus.x, l.def.pos.z - focus.z);
      const show = onScreen && (l.major || camDist < 105 || far < 42 || this.hoverLoc === l.def.id || !!this.political);
      if (!show) { if (l.el.style.display !== 'none') l.el.style.display = 'none'; continue; }
      if (l.el.style.display === 'none') l.el.style.display = '';
      const x = (tmp.x * 0.5 + 0.5) * w, y = (-tmp.y * 0.5 + 0.5) * hgt;
      l.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%) scale(${(l.major ? scale * 1.08 : scale).toFixed(3)})`;
      l.el.classList.toggle('hover', this.hoverLoc === l.def.id);
    }
    // party tags (only near / hovered / hostile & close)
    const seen = performance.now();
    for (const p of parties) {
      const pos = partyPos(p);
      if (!pos) continue;
      const d = Math.hypot(pos.x - eliasPos.x, pos.z - eliasPos.z);
      const visible = camDist < 50 || d < 20 || p.kind === 'aurel' || p.kind === 'nemesis' || p.state === 'chase' || p.id === this.hoverParty || !!p.contract;
      let tag = this.tags.get(p.id);
      if (!visible) { if (tag) tag.el.style.display = 'none'; continue; }
      if (!tag) {
        tag = { el: h('div', { class: 'ow-ptag' }), sig: '', seen };
        this.root.appendChild(tag.el);
        this.tags.set(p.id, tag);
      }
      tag.seen = seen;
      const hostile = p.state === 'chase' || (p.hostile && d < p.sight);
      const sig = `${p.name}|${hostile}|${Math.round(p.strength)}|${p.kind}`;
      if (sig !== tag.sig) {
        tag.sig = sig;
        tag.el.className = `ow-ptag ${hostile ? 'hostile' : ''} k-${p.kind}`;
        tag.el.style.setProperty('--fc', p.color);
        tag.el.innerHTML = `<span class="ow-pt-icon">${PARTY_ICON[p.kind]}</span><span>${esc(p.name)}</span><b>${Math.round(p.strength)}</b>`;
      }
      tmp.copy(pos); tmp.y += 2.6; tmp.project(camera);
      if (tmp.z >= 1) { tag.el.style.display = 'none'; continue; }
      tag.el.style.display = '';
      tag.el.style.transform = `translate(${((tmp.x * 0.5 + 0.5) * w).toFixed(1)}px, ${((-tmp.y * 0.5 + 0.5) * hgt).toFixed(1)}px) translate(-50%, -100%) scale(${scale.toFixed(3)})`;
    }
    for (const [id, tag] of this.tags) if (tag.seen !== seen) { tag.el.remove(); this.tags.delete(id); }

    // bubbles
    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      const b = this.bubbles[i];
      b.t += 1 / 60;
      const p = b.follow();
      if (!p || b.t > b.life) { b.el.remove(); this.bubbles.splice(i, 1); continue; }
      tmp.copy(p); tmp.y += 3.3; tmp.project(camera);
      b.el.style.opacity = tmp.z < 1 ? String(b.t > b.life - 0.4 ? (b.life - b.t) / 0.4 : 1) : '0';
      b.el.style.transform = `translate(${((tmp.x * 0.5 + 0.5) * w).toFixed(1)}px, ${((-tmp.y * 0.5 + 0.5) * hgt).toFixed(1)}px) translate(-50%, -100%)`;
    }
  }

  bark(text: string, follow: () => THREE.Vector3 | null, hostile = false, life = 3.2): void {
    if (this.bubbles.length > 6) { const old = this.bubbles.shift(); old?.el.remove(); }
    const el = h('div', { class: `ow-bubble ${hostile ? 'hostile' : ''}` }, text);
    this.root.appendChild(el);
    this.bubbles.push({ el, t: 0, life, follow });
  }

  /** Tracked designio: diamond over the target + edge arrow when off-screen. */
  updateTracker(camera: THREE.Camera, w: number, hgt: number, time: number): void {
    const tracked = G.hasRun ? W().tracked : null;
    const q = tracked ? G.run.quests.find((x) => x.id === tracked && !x.done && !x.failed) : undefined;
    const def = q?.target ? LOCATIONS[q.target] : undefined;
    if (!def) { this.marker.style.display = 'none'; this.arrow.style.display = 'none'; return; }
    tmp.set(def.pos.x, locationHeight(def.id) + 9.5 + Math.sin(time * 3) * 0.4, def.pos.z).project(camera);
    const behind = tmp.z >= 1;
    let x = (tmp.x * 0.5 + 0.5) * w, y = (-tmp.y * 0.5 + 0.5) * hgt;
    const inside = !behind && x > 30 && x < w - 30 && y > 80 && y < hgt - 60;
    if (inside) {
      this.marker.style.display = '';
      this.arrow.style.display = 'none';
      this.marker.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
    } else {
      this.marker.style.display = 'none';
      this.arrow.style.display = '';
      if (behind) { x = w - x; y = hgt - y; }
      const cx = w / 2, cy = hgt / 2;
      const ang = Math.atan2(y - cy, x - cx);
      const rx = w / 2 - 60, ry = hgt / 2 - 90;
      const k = Math.min(rx / Math.abs(Math.cos(ang) || 1e-3), ry / Math.abs(Math.sin(ang) || 1e-3));
      const ax = cx + Math.cos(ang) * k, ay = cy + Math.sin(ang) * k;
      this.arrow.style.transform = `translate(${ax.toFixed(1)}px, ${ay.toFixed(1)}px) translate(-50%, -50%) rotate(${(ang + Math.PI / 2).toFixed(3)}rad)`;
      this.arrow.setAttribute('data-name', def.name);
    }
  }

  clearBubbles(): void { for (const b of this.bubbles) b.el.remove(); this.bubbles.length = 0; }
}
