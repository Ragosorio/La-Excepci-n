/**
 * La Excepción — the Códice. Comprehension, acquisition, resistances, ranks and the ability loadout.
 * Contract (kept): comprehend, acquire, knows, resistance, rank, rankUp, equipSlot, equippedAbilities, openCodex, codexCompletion.
 *
 * Resistances: every acquired ability that was COPIED (comprehension > 0) gives +20% to each of its tags (cap 80%);
 * copied míticas give immunity ("Excepción total"). Fusions, book and relic powers were created, not endured: no resistance.
 * Loadout slots: 0..3 (+4 with Adaptable) = keys 1–4(5); SLOT.Q / SLOT.E = relic abilities; SLOT.R = ultimate.
 */
import type { AbilityDef, CodexEntry } from '../../data/types';
import { ABILITIES, scaleAbility } from '../../data/abilities';
import { resolveAbility } from '../../data/fusions';
import { RARITY_INFO, SCHOOL_INFO, tagName } from '../../data/schools';
import { G, res } from '../../core/state';
import { bus } from '../../core/events';
import { track } from '../../core/tracker';
import { engine } from '../../core/engine';
import { audio } from '../../audio';
import { cutin, excepcionAcquired, toast } from '../../ui/toasts';
import { portraitSVG } from '../../ui/art/portraits';
import { wait } from '../../ui/dom';
import { PS, hasRun } from './pstate';
import { relicAbilities, relicPassive } from './relics';
import { activeSlotCount, hasRacialPower } from './stats';
import { abilityIcon } from './art';

export interface ComprehendResult { acquired: boolean; progress: number; required: number; justAcquired: boolean }

export const SLOT = { Q: 10, E: 11, R: 12 } as const;
/** Essence to reach each rank (index = target rank). */
export const RANK_COST = [0, 0, 30, 80, 180, 400];
export const MAX_RANK = 5;
/** Basics bound to fixed inputs (LMB / Space) — never in slots. */
const FIXED = new Set(['chispa_arcana', 'esquivar']);
/** Acquiring the key also teaches these (Fuerza Titánica's active). */
const LINKED: Record<string, string[]> = { fuerza_titanica: ['golpe_titanico'] };

// ───────────────────────────── queries ─────────────────────────────

function codex(): Record<string, CodexEntry> { return G.run.player.codex; }
export function codexEntry(id: string): CodexEntry | undefined { return hasRun() ? codex()[id] : undefined; }
function def(id: string): AbilityDef | undefined { return ABILITIES[id] ?? resolveAbility(id); }

/** Known = acquired in the Códice, or granted right now by an equipped relic. */
export function knows(abilityId: string): boolean {
  if (!hasRun()) return false;
  if (codex()[abilityId]?.acquired) return true;
  return relicAbilities().includes(abilityId);
}

export function rank(abilityId: string): number { return hasRun() ? Math.max(1, codex()[abilityId]?.rank ?? 1) : 1; }

/** The ability as Elias casts it: scaled by his rank. */
export function effectiveAbility(abilityId: string): AbilityDef | undefined {
  const d = def(abilityId);
  return d ? scaleAbility(d, rank(abilityId)) : undefined;
}

export function isForgotten(id: string): boolean { return hasRun() && PS().forgotten.includes(id); }

/** Ids of every acquired ability (Códice order not guaranteed). */
export function acquiredIds(): string[] { return hasRun() ? Object.values(codex()).filter((e) => e.acquired).map((e) => e.id) : []; }

export function codexCompletion(): { known: number; total: number } {
  const copyable = Object.values(ABILITIES).filter((a) => a.comprehension > 0);
  if (!hasRun()) return { known: 0, total: copyable.length };
  const c = codex();
  return { known: copyable.filter((a) => c[a.id]?.acquired).length, total: copyable.length };
}

// ───────────────────────────── resistances ─────────────────────────────

/** Rebuilds player.exceptions from the Códice. Returns the new map. */
export function recomputeExceptions(): Record<string, number> {
  if (!hasRun()) return {};
  const count: Record<string, number> = {};
  const immune = new Set<string>();
  for (const e of Object.values(codex())) {
    if (!e.acquired) continue;
    const d = def(e.id);
    if (!d || d.comprehension <= 0 || FIXED.has(e.id)) continue;
    for (const t of d.tags) {
      count[t] = (count[t] ?? 0) + 1;
      if (d.rarity === 'mitica') immune.add(t);
    }
  }
  const out: Record<string, number> = {};
  for (const t of Object.keys(count)) out[t] = immune.has(t) ? 1 : Math.min(0.8, 0.2 * count[t]);
  G.run.player.exceptions = out;
  return out;
}

/** Resistance to a tag (or status name) 0..1 — Códice + relics + Sangre de Dragón. 1 = INMUNE. */
export function resistance(tag: string): number {
  if (!hasRun()) return 0;
  const base = G.run.player.exceptions?.[tag] ?? 0;
  if (base >= 1) return 1;
  let r = base + relicPassive('resist_all') + relicPassive(`resist_${tag}`);
  if (tag === 'fuego' && hasRacialPower('sangre_dragon')) r += 0.25;
  if (tag === 'quemadura' && hasRacialPower('sangre_dragon')) return 1;
  return Math.max(0, Math.min(0.9, r));
}

// ───────────────────────────── comprehension & acquisition ─────────────────────────────

const lastTick = new Map<string, number>();
let cutinChain: Promise<void> = Promise.resolve();

function queueCutin(d: AbilityDef): void {
  const color = SCHOOL_INFO[d.school]?.color ?? RARITY_INFO[d.rarity].color;
  cutinChain = cutinChain.then(async () => {
    try {
      if (d.comprehension > 0) await excepcionAcquired(d.name, { color, school: d.school });
      else {
        // created, not copied: fusions and book/relic powers get their own shout
        audio.stinger('discovery');
        try { engine.pipeline.chromaticPulse(0.9, 0.6); } catch { /* ignore */ }
        await cutin({
          portrait: portraitSVG({ seed: 'elias', race: 'excepcion', special: 'elias', mood: 'smug', glowEyes: true }, 520),
          title: d.fusionOf ? '¡FUSIÓN!' : '¡NUEVO PODER!', subtitle: d.name.toUpperCase(), colors: ['#1a0b33', color], side: 'right', duration: 1.5,
        });
      }
    } catch (err) { console.warn('[codex] cut-in failed', err); }
    await wait(160);
  });
}

/** La Excepción: call whenever Elias is affected by an ability. Crits should pass amount 2. */
export function comprehend(abilityId: string, amount = 1): ComprehendResult {
  const d = def(abilityId);
  if (!hasRun() || !d) return { acquired: false, progress: 0, required: 1, justAcquired: false };
  const required = Math.max(1, d.comprehension);
  if (d.comprehension <= 0 || isForgotten(abilityId)) {
    const k = knows(abilityId);
    return { acquired: k, progress: k ? required : 0, required, justAcquired: false };
  }
  const c = codex();
  const e = (c[abilityId] ??= { id: abilityId, progress: 0, acquired: false, rank: 1, timesUsed: 0 });
  if (e.acquired) return { acquired: true, progress: required, required, justAcquired: false };
  let gain = Math.max(0, amount);
  const bonus = relicPassive('comprehension_bonus');
  if (bonus > 0 && Math.random() < bonus) gain += 1;
  e.progress = Math.min(required, e.progress + gain);
  bus.emit('codex:progress', { abilityId, progress: e.progress, required });
  const now = performance.now();
  if (now - (lastTick.get(abilityId) ?? -1e9) > 120) {
    lastTick.set(abilityId, now);
    audio.sfx('copy_progress', { pitch: 0.9 + 0.5 * (e.progress / required), volume: 0.7 });
    if (e.progress < required && engine.sceneId !== 'battle') {
      toast(`Comprendiendo… <b>${d.name}</b> <span class="lx-violet">${e.progress}/${required}</span>`, { kind: 'epica', icon: abilityIcon(d, 26, { locked: true, progress: e.progress / required }), duration: 2.4 });
    }
  }
  if (e.progress >= required) {
    acquire(abilityId);
    return { acquired: true, progress: required, required, justAcquired: true };
  }
  return { acquired: false, progress: e.progress, required, justAcquired: false };
}

/** Adds an ability to the Códice (idempotent). `silent`: no feedback/tracking (echoes, loads); `noCutin`: toast only. */
export function acquire(abilityId: string, opts: { silent?: boolean; noCutin?: boolean } = {}): void {
  if (!hasRun()) return;
  const d = def(abilityId);
  if (!d) { console.warn('[codex] unknown ability', abilityId); return; }
  const c = codex();
  const e = (c[abilityId] ??= { id: abilityId, progress: 0, acquired: false, rank: 1, timesUsed: 0 });
  if (e.acquired) return;
  const s = PS();
  if (s.forgotten.includes(abilityId)) s.forgotten = s.forgotten.filter((x) => x !== abilityId);
  const before = { ...(G.run.player.exceptions ?? {}) };
  e.acquired = true;
  e.progress = Math.max(e.progress, d.comprehension);
  e.rank = Math.max(1, e.rank || 1);
  e.acquiredAt = G.run.luna;
  if (G.meta && !G.meta.echoesKnown.includes(abilityId)) G.meta.echoesKnown.push(abilityId);
  const after = recomputeExceptions();
  autoEquip(abilityId);
  if (!opts.silent) {
    track('abilities_copied');
    if (!s.newAbilities.includes(abilityId)) s.newAbilities.push(abilityId);
  }
  bus.emit('codex:acquired', { abilityId });
  for (const linked of LINKED[abilityId] ?? []) acquire(linked, { silent: opts.silent, noCutin: true });
  if (opts.silent) return;

  audio.sfx('copy_acquired');
  if (!opts.noCutin) {
    try { engine.hitstop(90); } catch { /* engine not ready */ }
    queueCutin(d);
  }
  const rc = RARITY_INFO[d.rarity];
  const head = d.comprehension > 0 ? '¡EXCEPCIÓN ADQUIRIDA!' : d.fusionOf ? '¡FUSIÓN CREADA!' : '¡NUEVO PODER!';
  toast(`${head} <b style="color:${rc.color}">${d.name}</b>`, { kind: d.rarity, icon: abilityIcon(d, 30), duration: 4.5 });
  // resistance feedback ("Resistencia Fuego 40%" / "INMUNE a la Luz")
  for (const t of Object.keys(after)) {
    const prev = before[t] ?? 0, now = after[t];
    if (now > prev) {
      const txt = now >= 1 ? `<b>INMUNE</b> a ${tagName(t)} — Excepción total` : `Resistencia a ${tagName(t)}: <b>${Math.round(now * 100)}%</b>`;
      setTimeout(() => toast(txt, { kind: now >= 1 ? 'mitica' : 'good', duration: 3.2 }), 900);
    }
  }
}

/** Removes an ability from the Códice for this cycle (Libro de la Realidad sacrifice). */
export function forgetAbility(abilityId: string): boolean {
  if (!hasRun()) return false;
  const c = codex();
  if (!c[abilityId]?.acquired) return false;
  delete c[abilityId];
  const s = PS();
  if (!s.forgotten.includes(abilityId)) s.forgotten.push(abilityId);
  s.newAbilities = s.newAbilities.filter((x) => x !== abilityId);
  const lo = loadout();
  lo.slots = lo.slots.map((x) => (x === abilityId ? null : x));
  if (lo.ultimate === abilityId) lo.ultimate = null;
  recomputeExceptions();
  bus.emit('codex:forgotten', { abilityId });
  emitLoadout();
  return true;
}

export function markSeen(ids?: string[]): void {
  if (!hasRun()) return;
  const s = PS();
  s.newAbilities = ids ? s.newAbilities.filter((x) => !ids.includes(x)) : [];
}
export function isNew(id: string): boolean { return hasRun() && PS().newAbilities.includes(id); }

// ───────────────────────────── ranks ─────────────────────────────

export function rankUpCost(abilityId: string, discount = 0): number | null {
  const e = codexEntry(abilityId);
  if (!e?.acquired || e.rank >= MAX_RANK) return null;
  return Math.round(RANK_COST[e.rank + 1] * (1 - Math.max(0, Math.min(0.9, discount))));
}

/** Spends Esencia to raise a rank (I→V). `discount` for the Academia. */
export function rankUp(abilityId: string, discount = 0): boolean {
  const cost = rankUpCost(abilityId, discount);
  const e = codexEntry(abilityId);
  if (cost === null || !e) return false;
  if (!res.spend('essence', cost)) { audio.sfx('ui_error'); return false; }
  e.rank += 1;
  track('rank_ups');
  audio.sfx('level_up');
  bus.emit('codex:rankup', { abilityId, rank: e.rank });
  return true;
}

// ───────────────────────────── loadout ─────────────────────────────

type Loadout = { slots: (string | null)[]; relics: (string | null)[]; ultimate: string | null };

function loadout(): Loadout {
  const p = G.run.player;
  p.loadout ??= { slots: [null, null, null, null], relics: [null, null], ultimate: null };
  const lo = p.loadout;
  const n = activeSlotCount();
  while (lo.slots.length < n) lo.slots.push(null);
  if (!Array.isArray(lo.relics)) lo.relics = [null, null];
  while (lo.relics.length < 2) lo.relics.push(null);
  return lo;
}

function emitLoadout(): void {
  const lo = loadout();
  bus.emit('loadout:change', { slots: [...lo.slots], relics: [...lo.relics], ultimate: lo.ultimate });
}

/** Can this ability go in that slot? */
export function canEquip(slot: number, abilityId: string): boolean {
  const d = def(abilityId);
  if (!d || d.kind === 'passive' || FIXED.has(abilityId)) return false;
  if (slot === SLOT.Q || slot === SLOT.E) return relicAbilities().includes(abilityId);
  if (!codexEntry(abilityId)?.acquired) return false;
  if (slot === SLOT.R) return !!d.ultimate || d.rarity === 'legendaria' || d.rarity === 'mitica';
  return slot >= 0 && slot < activeSlotCount() && !d.ultimate;
}

/** Assigns (or clears with null) a slot: 0..4 actives, SLOT.Q/E relic slots, SLOT.R ultimate. Moves if already slotted. */
export function equipSlot(slot: number, abilityId: string | null): void {
  if (!hasRun()) return;
  const lo = loadout();
  if (abilityId !== null && !canEquip(slot, abilityId)) return;
  if (abilityId !== null) {
    lo.slots = lo.slots.map((x) => (x === abilityId ? null : x));
    lo.relics = lo.relics.map((x) => (x === abilityId ? null : x));
    if (lo.ultimate === abilityId) lo.ultimate = null;
  }
  if (slot === SLOT.Q) lo.relics[0] = abilityId;
  else if (slot === SLOT.E) lo.relics[1] = abilityId;
  else if (slot === SLOT.R) lo.ultimate = abilityId;
  else if (slot >= 0 && slot < lo.slots.length) lo.slots[slot] = abilityId;
  emitLoadout();
}

/** Current loadout (validated copy). */
export function equippedAbilities(): Loadout {
  if (!hasRun()) return { slots: [null, null, null, null], relics: [null, null], ultimate: null };
  const lo = loadout();
  const ok = (id: string | null) => (id && (codexEntry(id)?.acquired || relicAbilities().includes(id)) ? id : null);
  return { slots: lo.slots.slice(0, activeSlotCount()).map(ok), relics: lo.relics.slice(0, 2).map(ok), ultimate: ok(lo.ultimate) };
}

function autoEquip(abilityId: string): void {
  const d = def(abilityId);
  if (!d || d.kind === 'passive' || FIXED.has(abilityId)) return;
  const lo = loadout();
  if (lo.slots.includes(abilityId) || lo.ultimate === abilityId) return;
  if (d.ultimate) { if (!lo.ultimate) { lo.ultimate = abilityId; emitLoadout(); } return; }
  const n = activeSlotCount();
  const i = lo.slots.findIndex((x, idx) => idx < n && !x);
  if (i >= 0) { lo.slots[i] = abilityId; emitLoadout(); }
}

/** Keeps Q/E in sync with equipped relics (manual choices are preserved while still valid). */
export function refreshRelicSlots(): void {
  if (!hasRun()) return;
  const lo = loadout();
  const granted = relicAbilities();
  const before = lo.relics.join('|');
  lo.relics = lo.relics.map((x) => (x && granted.includes(x) ? x : null));
  for (const g of granted) {
    if (lo.relics.includes(g)) continue;
    const i = lo.relics.indexOf(null);
    if (i < 0) break;
    lo.relics[i] = g;
  }
  if (lo.relics.join('|') !== before) emitLoadout();
}

/** Makes sure arrays exist, drops unknown ids, and fills the extra Adaptable slot. */
export function ensureLoadout(): void {
  if (!hasRun()) return;
  const lo = loadout();
  lo.slots = lo.slots.map((x) => (x && codexEntry(x)?.acquired ? x : null));
  if (lo.ultimate && !codexEntry(lo.ultimate)?.acquired) lo.ultimate = null;
  refreshRelicSlots();
}

// ───────────────────────────── UI entry ─────────────────────────────

/** Opens the Códice (lazy-loaded UI). Idempotent: calling it while open just focuses the tab. */
export function openCodex(tab?: 'coleccion' | 'equipo' | 'excepciones' | 'fusion'): void {
  void import('./codexUI').then((m) => m.openCodexUI(tab)).catch((err) => console.error('[codex] UI failed', err));
}
