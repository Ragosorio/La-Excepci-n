/**
 * Battle HUD (DOM, .bt- prefix): hotbar, vitals, Retorno charges, army strength, boss bar, nameplates,
 * callouts (Bangers), speech bubbles, comprehension popups (La Excepción), hints, orders, hold-to-retreat.
 */
import './battle.css';
import * as THREE from 'three';
import type { Battle } from './world';
import type { AbilityRT } from './defs';
import { abilityRT } from './defs';
import { h, layer } from '../ui/dom';
import { G } from '../core/state';
import { engine } from '../core/engine';
import { input } from '../core/input';
import { portraitSVG } from '../ui/art/portraits';
import { abilityIcon, ECLIPSE_SVG } from './icons';
import { F_BOSS, F_CAPTAIN, F_HERO, F_HIDDEN, F_PLAYER, S_DEAD, TEAM_PLAYER } from './const';
import { audio } from '../audio';

interface Plate { el: HTMLElement; fill: HTMLElement; unit: number }
interface Bubble { el: HTMLElement; unit: number; t: number }
interface SlotEl { el: HTMLElement; cd: HTMLElement; cdt: HTMLElement; id: string | null; key: string }

const V = new THREE.Vector3();
const KEY_LABEL: Record<string, string> = { LMB: '⬤', RMB: '◐' };

export class Hud {
  readonly root: HTMLElement;
  private world: HTMLElement;
  private slots: SlotEl[] = [];
  private slotRow!: HTMLElement;
  private hpFill!: HTMLElement; private hpGhost!: HTMLElement; private hpText!: HTMLElement;
  private mpFill!: HTMLElement; private mpText!: HTMLElement;
  private retorno!: HTMLElement; private dodge!: HTMLElement; private nameEl!: HTMLElement;
  private armyA!: HTMLElement; private armyB!: HTMLElement; private tugA!: HTMLElement; private nA!: HTMLElement; private nB!: HTMLElement;
  private boss!: HTMLElement; private bossFill!: HTMLElement; private bossGhost!: HTMLElement; private bossName!: HTMLElement;
  private callouts!: HTMLElement;
  private hintEl!: HTMLElement;
  private orderEl!: HTMLElement;
  private comp!: HTMLElement;
  private compT = 0;
  private msg!: HTMLElement;
  private plates: Plate[] = [];
  private bubbles: Bubble[] = [];
  private acc = 0;
  private hintT = 0;
  private msgT = 0;
  private bossIdx = -1;
  private lastHp = -1;
  private retreatT = 0;
  private retreatEl: HTMLElement | null = null;
  onRetreat: (() => void) | null = null;
  private spectator: boolean;
  private initA = 1; private initB = 1;

  constructor(private b: Battle) {
    this.spectator = b.spectator;
    this.root = h('div', { class: `bt-hud ${this.spectator ? 'spectator' : ''}` });
    this.world = h('div', { class: 'bt-world' });
    layer('hud').appendChild(this.root);
    layer('world').appendChild(this.world);
    this.build();
  }

  private build(): void {
    const b = this.b, setup = b.setup;
    const nameA = setup.arena ? setup.arena.sideA.name : 'Tu ejército';
    const nameB = setup.arena ? setup.arena.sideB.name : factionName(setup.enemy.faction);
    this.nA = h('span', { class: 'bt-side-n' }, '0');
    this.nB = h('span', { class: 'bt-side-n' }, '0');
    this.tugA = h('div', { class: 'bt-tug-a' });
    this.armyA = h('div', { class: 'bt-side a' }, h('span', { class: 'bt-side-name' }, nameA), this.nA);
    this.armyB = h('div', { class: 'bt-side b' }, this.nB, h('span', { class: 'bt-side-name' }, nameB));
    this.bossFill = h('div', { class: 'fill' });
    this.bossGhost = h('div', { class: 'ghost' });
    this.bossName = h('div', { class: 'bt-boss-name' });
    this.boss = h('div', { class: 'bt-boss hidden' }, this.bossName, h('div', { class: 'bt-boss-bar' }, this.bossGhost, this.bossFill));
    this.root.appendChild(h('div', { class: `bt-top ${['tutorial', 'duelo'].includes(b.setup.kind) ? 'solo' : ''}` },
      h('div', { class: 'bt-armies' }, this.armyA, h('div', { class: 'bt-tug' }, this.tugA, h('div', { class: 'bt-tug-b' }), h('div', { class: 'bt-tug-mark', html: ECLIPSE_SVG(true, 22) })), this.armyB),
      setup.title ? h('div', { class: 'bt-title' }, setup.title) : null,
      this.boss));
    this.callouts = h('div', { class: 'bt-callouts' });
    this.hintEl = h('div', { class: 'bt-hint' });
    this.msg = h('div', { class: 'bt-msg' });
    this.orderEl = h('div', { class: 'bt-order' });
    this.root.append(this.callouts, this.hintEl, this.msg);
    if (!this.spectator && b.player) {
      this.orderEl.append(
        h('span', { class: 'bt-ord on', 'data-o': '0', 'data-tip': 'Tu ejército ataca al enemigo más cercano' }, h('span', { class: 'lx-kbd' }, 'Z'), '¡Carguen!'),
        h('span', { class: 'bt-ord', 'data-o': '1', 'data-tip': 'Tu ejército mantiene su posición' }, h('span', { class: 'lx-kbd' }, 'X'), '¡Mantengan!'),
        h('span', { class: 'bt-ord', 'data-o': '2', 'data-tip': 'Tu ejército te sigue' }, h('span', { class: 'lx-kbd' }, 'C'), '¡Síganme!'));
      if (b.setup.player.army.length) this.root.appendChild(this.orderEl);
      this.buildBottom();
    }
    if (b.setup.allowRetreat ?? !['tutorial', 'final', 'arena'].includes(b.setup.kind)) {
      const ring = h('div', { class: 'bt-retreat-fill' });
      this.retreatEl = h('div', { class: 'bt-retreat', 'data-tip': 'Mantén presionado (o mantén T) para retirarte' }, ring, h('span', null, 'Retirada'));
      this.retreatEl.addEventListener('pointerdown', () => { this.retreatHold = true; });
      window.addEventListener('pointerup', this.releaseRetreat);
      this.root.appendChild(this.retreatEl);
    }
    this.comp = h('div', { class: 'bt-comp' });
    this.world.appendChild(this.comp);
  }
  private retreatHold = false;
  private releaseRetreat = () => { this.retreatHold = false; };

  private buildBottom(): void {
    const b = this.b;
    const name = G.run?.player.name ?? 'Elias Veyr';
    this.hpFill = h('div', { class: 'fill' });
    this.hpGhost = h('div', { class: 'ghost' });
    this.hpText = h('span', { class: 'txt' });
    this.mpFill = h('div', { class: 'fill' });
    this.mpText = h('span', { class: 'txt' });
    this.retorno = h('div', { class: 'bt-retorno', 'data-tip': 'Retorno: cargas de resurrección en esta batalla' });
    this.dodge = h('div', { class: 'bt-dodge', 'data-tip': 'Esquivar (Espacio): intocable 0,25 s' });
    this.nameEl = h('div', { class: 'bt-name' }, name);
    this.slotRow = h('div', { class: 'bt-slots' });
    const portrait = h('div', { class: 'bt-portrait', html: portraitSVG({ seed: 'elias', race: 'excepcion', special: 'elias', mood: 'smug' }, 120) });
    this.root.appendChild(h('div', { class: 'bt-bottom' },
      h('div', { class: 'bt-left' }, portrait,
        h('div', { class: 'bt-vitals' }, h('div', { class: 'bt-namerow' }, this.nameEl, this.retorno),
          h('div', { class: 'bt-hp' }, this.hpGhost, this.hpFill, this.hpText),
          h('div', { class: 'bt-mp' }, this.mpFill, this.mpText),
          this.dodge)),
      this.slotRow));
    this.refreshHotbar();
    void b;
  }

  refreshHotbar(): void {
    const pl = this.b.player;
    if (!pl || !this.slotRow) return;
    this.slotRow.innerHTML = '';
    this.slots = [];
    const lo = pl.loadout;
    const ids: (string | null)[] = [lo.lmb, lo.rmb, ...lo.slots, ...lo.relics, lo.ult];
    const keys = ['LMB', 'RMB', ...lo.slots.map((_, k) => String(k + 1)), 'Q', 'E', 'R'];
    const nSlots = lo.slots.length;
    ids.forEach((id, k) => {
      const key = keys[k];
      const ab = id ? abilityRT(id) : null;
      const cd = h('div', { class: 'bt-slot-cd' });
      const cdt = h('div', { class: 'bt-slot-cdt' });
      const tip = ab ? `<b>${ab.name}</b>\n${ab.def.desc}${ab.def.mana ? `\nManá: ${Math.round(pl.manaCost(ab))}` : ''}${ab.def.cooldown ? ` · Enfriamiento: ${ab.def.cooldown}s` : ''}` : key === 'LMB' ? '' : 'Vacío: copia habilidades dejando que te golpeen';
      const el = h('div', { class: `bt-slot ${ab ? '' : 'empty'} ${key === 'R' ? 'ult' : ''} ${k === 1 || k === 1 + nSlots || k === 3 + nSlots ? 'gap' : ''}`, style: `--c:${ab?.color ?? '#5a4a7a'}`, 'data-tip': tip },
        h('div', { class: 'bt-slot-icon', html: ab ? abilityIcon(ab.id, ab.school, key === 'R' ? 54 : 44) : '' }),
        cd, cdt,
        h('div', { class: 'bt-slot-key' }, KEY_LABEL[key] ?? key),
        ab && ab.def.mana ? h('div', { class: 'bt-slot-mana' }, String(Math.round(pl.manaCost(ab)))) : null);
      if (key === 'LMB' && pl.knowsA('fuerza_titanica')) el.appendChild(h('div', { class: 'bt-slot-sub', 'data-tip': 'Cerca de un enemigo: Puñetazo Titánico' }, '✊'));
      this.slotRow.appendChild(el);
      this.slots.push({ el, cd, cdt, id, key });
    });
  }

  private slotByKey(key: string): SlotEl | undefined { return this.slots.find((s) => s.key === key); }
  flashSlot(key: string): void {
    if (key === 'dodge') { this.dodge.classList.remove('shake'); void this.dodge.offsetWidth; this.dodge.classList.add('shake'); return; }
    const s = this.slotByKey(key);
    if (!s) return;
    s.el.classList.remove('shake'); void s.el.offsetWidth; s.el.classList.add('shake');
  }
  pulseSlot(key: string): void { const s = this.slotByKey(key); if (s) { s.el.classList.remove('pulse'); void s.el.offsetWidth; s.el.classList.add('pulse'); } }
  noMana(key: string): void { this.flashSlot(key); this.toast('Sin maná'); const m = this.mpFill?.parentElement; if (m) { m.classList.remove('shake'); void m.offsetWidth; m.classList.add('shake'); } }

  setOrder(o: number): void {
    for (const el of Array.from(this.orderEl.children) as HTMLElement[]) el.classList.toggle('on', el.dataset.o === String(o));
  }

  toast(text: string): void { this.msg.textContent = text; this.msg.classList.add('on'); this.msgT = 1.6; }

  hint(text: string, seconds = 5): void {
    if (!text) { this.hintEl.classList.remove('on'); return; }
    this.hintEl.innerHTML = text.replace(/\[([^\]]+)\]/g, '<span class="lx-kbd">$1</span>');
    this.hintEl.classList.add('on');
    this.hintT = seconds;
  }

  say(i: number, text: string, seconds = 2.5): void {
    const old = this.bubbles.find((q) => q.unit === i);
    if (old) { old.el.remove(); this.bubbles.splice(this.bubbles.indexOf(old), 1); }
    const el = h('div', { class: `bt-say ${this.b.isPlayer(i) ? 'me' : ''}` }, text);
    this.world.appendChild(el);
    this.bubbles.push({ el, unit: i, t: seconds });
    if (this.bubbles.length > 8) { const q = this.bubbles.shift()!; q.el.remove(); }
  }

  comprehension(ab: AbilityRT, progress: number, required: number, acquired: boolean, just: boolean): void {
    const pips = Array.from({ length: Math.max(1, required) }, (_, k) => `<i class="${k < progress ? 'on' : ''}"></i>`).join('');
    this.comp.className = `bt-comp on ${just ? 'got' : ''}`;
    this.comp.innerHTML = just
      ? `<div class="t">¡EXCEPCIÓN!</div><div class="n">${ab.name}</div>`
      : acquired ? `<div class="t">Ya es tuya</div><div class="n">${ab.name}</div>` : `<div class="t">Comprendiendo</div><div class="n">${ab.name} <b>${progress}/${required}</b></div><div class="p">${pips}</div>`;
    this.compT = just ? 3 : 2.2;
    if (!acquired) audio.sfx('copy_progress', { volume: 0.7, pitch: 0.9 + progress * 0.08 });
  }

  // ───────────── per-frame ─────────────

  update(realDt: number): void {
    const b = this.b, u = b.u;
    // callouts
    while (b.callouts.length) {
      const c = b.callouts.shift()!;
      const el = h('div', { class: `bt-callout ${c.kind}` }, h('div', { class: 'big' }, c.text), c.sub ? h('div', { class: 'sub' }, c.sub) : null);
      this.callouts.appendChild(el);
      while (this.callouts.children.length > 3) this.callouts.firstElementChild?.remove();
      setTimeout(() => el.remove(), 1900);
    }
    if (this.hintT > 0) { this.hintT -= realDt; if (this.hintT <= 0) this.hintEl.classList.remove('on'); }
    if (this.msgT > 0) { this.msgT -= realDt; if (this.msgT <= 0) this.msg.classList.remove('on'); }
    if (this.compT > 0) { this.compT -= realDt; if (this.compT <= 0) this.comp.classList.remove('on'); }
    // retreat (hold)
    if (this.retreatEl) {
      const holding = (this.retreatHold || input.down('KeyT')) && b.phase === 'fight';
      this.retreatT = holding ? this.retreatT + realDt : Math.max(0, this.retreatT - realDt * 2);
      (this.retreatEl.firstElementChild as HTMLElement).style.transform = `scaleX(${Math.min(1, this.retreatT / 1.2)})`;
      if (this.retreatT >= 1.2) { this.retreatT = 0; this.retreatHold = false; this.onRetreat?.(); }
    }
    this.projectWorld(realDt);
    this.acc += realDt;
    if (this.acc < 0.05) return;
    this.acc = 0;
    // armies
    const aSide = TEAM_PLAYER, bSide = b.setup.arena ? 2 : 1;
    const na = b.fighting[aSide], nb = b.fighting[bSide];
    this.initA = Math.max(this.initA, na); this.initB = Math.max(this.initB, nb);
    this.nA.textContent = String(na); this.nB.textContent = String(nb);
    const sa = na / this.initA, sb = nb / this.initB;
    this.tugA.style.width = `${(sa / Math.max(0.001, sa + sb)) * 100}%`;
    // boss bar
    if (this.bossIdx < 0 || !u.active[this.bossIdx]) this.bossIdx = this.findBoss();
    if (this.bossIdx >= 0 && u.active[this.bossIdx]) {
      const i = this.bossIdx;
      this.boss.classList.remove('hidden');
      const m = b.metaOf(i);
      const title = m?.title ? ` <small>${m.title}</small>` : '';
      const nm = `${b.nameOf(i)}${title}`;
      if (this.bossName.innerHTML !== nm) this.bossName.innerHTML = nm;
      const p = u.state[i] === S_DEAD ? 0 : Math.max(0, u.hp[i] / u.hpMax[i]);
      this.bossFill.style.transform = `scaleX(${p})`; this.bossGhost.style.transform = `scaleX(${p})`;
    } else this.boss.classList.add('hidden');
    // player vitals & slots
    const pl = b.player;
    if (pl && this.hpFill) {
      const i = pl.idx;
      const hp = Math.max(0, u.hp[i]), max = u.hpMax[i];
      this.hpFill.style.transform = `scaleX(${hp / max})`; this.hpGhost.style.transform = `scaleX(${hp / max})`;
      this.hpText.textContent = `${Math.ceil(hp)} / ${Math.round(max)}`;
      if (this.lastHp >= 0 && hp < this.lastHp - 0.5) { const e = this.hpFill.parentElement!; e.classList.remove('hurt'); void e.offsetWidth; e.classList.add('hurt'); }
      this.lastHp = hp;
      this.hpFill.parentElement!.classList.toggle('low', hp / max < 0.3);
      this.mpFill.style.transform = `scaleX(${pl.mana / pl.manaMax})`;
      this.mpText.textContent = `${Math.floor(pl.mana)}`;
      const left = pl.retornoMax - pl.retornoUsed;
      const rh = Array.from({ length: Math.max(pl.retornoMax, 1) }, (_, k) => ECLIPSE_SVG(k < left, 18)).join('');
      if (this.retorno.innerHTML !== rh) this.retorno.innerHTML = rh;
      const dh = Array.from({ length: pl.dodgeMax }, (_, k) => `<i class="${k < pl.dodgeCharges ? 'on' : ''}"></i>`).join('');
      if (this.dodge.innerHTML !== dh) this.dodge.innerHTML = dh;
      const nm = G.run?.player.name ?? 'Elias Veyr';
      if (this.nameEl.textContent !== nm) this.nameEl.textContent = nm;
      for (const s of this.slots) {
        if (!s.id) continue;
        const cd = s.key === 'LMB' ? 0 : pl.cooldown(s.id);
        const max2 = pl.cooldownMax(s.id);
        const p = cd > 0 ? cd / max2 : 0;
        s.cd.style.setProperty('--p', p.toFixed(3));
        const txt = cd > 1.5 ? String(Math.ceil(cd)) : cd > 0 ? cd.toFixed(1) : '';
        if (s.cdt.textContent !== txt) s.cdt.textContent = txt;
        const ab = abilityRT(s.id);
        const poor = !!ab && pl.mana < pl.manaCost(ab);
        s.el.classList.toggle('poor', poor);
        const ready = cd <= 0 && !poor;
        if (ready && s.el.classList.contains('cooling')) { s.el.classList.remove('cooling'); s.el.classList.add('ready'); setTimeout(() => s.el.classList.remove('ready'), 260); }
        else if (!ready && cd > 0) s.el.classList.add('cooling');
      }
    }
  }

  private findBoss(): number {
    const u = this.b.u;
    for (let i = 0; i < u.n; i++) if (u.active[i] && u.side[i] !== TEAM_PLAYER && (u.flags[i] & (F_BOSS | F_HERO)) && !(u.flags[i] & F_PLAYER)) return i;
    return -1;
  }

  private projectWorld(realDt: number): void {
    const b = this.b, u = b.u, cam = b.camera;
    const W = engine.width, H = engine.height;
    const proj = (x: number, y: number, z: number): { x: number; y: number; on: boolean } => {
      V.set(x, y, z).project(cam);
      return { x: (V.x * 0.5 + 0.5) * W, y: (-V.y * 0.5 + 0.5) * H, on: V.z < 1 && V.z > -1 };
    };
    // nameplates: captains, bosses, heroes (not Elias)
    const want: number[] = [];
    for (let i = 0; i < u.n; i++) if (u.active[i] && u.state[i] !== S_DEAD && (u.flags[i] & (F_CAPTAIN | F_BOSS | F_HERO)) && !(u.flags[i] & (F_PLAYER | F_HIDDEN))) want.push(i);
    for (let k = this.plates.length - 1; k >= 0; k--) if (!want.includes(this.plates[k].unit)) { this.plates[k].el.remove(); this.plates.splice(k, 1); }
    for (const i of want) {
      let p = this.plates.find((q) => q.unit === i);
      if (!p) {
        const m = b.metaOf(i);
        const fill = h('div', { class: 'fill' });
        const el = h('div', { class: `bt-plate ${u.side[i] === TEAM_PLAYER ? 'ally' : 'foe'} ${u.flags[i] & (F_BOSS | F_HERO) ? 'boss' : ''}` },
          h('div', { class: 'nm' }, b.nameOf(i)), m?.title ? h('div', { class: 'tt' }, m.title) : null, h('div', { class: 'bar' }, fill));
        this.world.appendChild(el);
        p = { el, fill, unit: i };
        this.plates.push(p);
      }
      const s = proj(u.x[i], u.y[i] + b.heightOf(i) + 0.9, u.z[i]);
      p.el.style.display = s.on ? '' : 'none';
      p.el.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -100%)`;
      p.fill.style.transform = `scaleX(${Math.max(0, u.hp[i] / u.hpMax[i])})`;
      p.el.classList.toggle('mind', u.side[i] !== u.team[i]);
    }
    // speech bubbles
    for (let k = this.bubbles.length - 1; k >= 0; k--) {
      const q = this.bubbles[k];
      q.t -= realDt;
      if (q.t <= 0 || !u.active[q.unit]) { q.el.remove(); this.bubbles.splice(k, 1); continue; }
      const i = q.unit;
      const s = proj(u.x[i], u.y[i] + b.heightOf(i) + 1.5, u.z[i]);
      q.el.style.display = s.on ? '' : 'none';
      q.el.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -100%)`;
      q.el.style.opacity = String(Math.min(1, q.t * 3));
    }
    // comprehension popup over Elias
    if (this.compT > 0 && b.playerIdx >= 0) {
      const i = b.playerIdx;
      const s = proj(u.x[i], u.y[i] + b.heightOf(i) + 2.1, u.z[i]);
      this.comp.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -100%)`;
    }
  }

  setVisible(on: boolean): void { this.root.style.display = on ? '' : 'none'; this.world.style.display = on ? '' : 'none'; }

  dispose(): void {
    window.removeEventListener('pointerup', this.releaseRetreat);
    this.root.remove();
    this.world.remove();
  }
}

function factionName(f: string): string {
  const n: Record<string, string> = {
    valdoria: 'Valdoria', sylvaria: 'Sylvaria', kharaz: 'Kharaz', morvenna: 'Morvenna', islas: 'Islas de Azar', concordia: 'Concordia', concilio: 'El Concilio',
    juramentados: 'Los Juramentados', orden_alba: 'Orden del Alba', banca: 'La Banca', aquelarre: 'El Aquelarre', academia: 'La Academia', sedas: 'Casa de las Sedas', ceniza: 'Gremio de la Ceniza', yunque: 'El Yunque', excepcion: 'La Excepción',
  };
  return n[f] ?? 'Enemigo';
}
