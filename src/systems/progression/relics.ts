/**
 * Reliquias: inventory, equipping, forge levels, passive aggregation and random drops.
 * Contract (kept): grantRelic, hasRelic, equipRelic, unequipRelic, relicPassive, openRelics, randomRelic.
 * Passive keys are documented at the top of src/data/relics.ts.
 */
import type { RelicDef, RelicInstance, School, StatId } from '../../data/types';
import { DUPLICATE_ESSENCE, RELICS } from '../../data/relics';
import { RARITY_INFO } from '../../data/schools';
import { G, res } from '../../core/state';
import { bus } from '../../core/events';
import { track } from '../../core/tracker';
import { Rng, rng as cosmeticRng, uid } from '../../core/rng';
import { audio } from '../../audio';
import { lootReveal, toast } from '../../ui/toasts';
import { PS, hasRun } from './pstate';
import { relicArt } from './art';

export const MAX_RELIC_LEVEL = 3;
/** Keys that are counts/flags: not scaled by forge level. */
const FLAG_KEYS = new Set(['reveal_relics', 'reveal_weakness', 'reveal_invisible', 'disguise', 'armor_pierce', 'reroll', 'retorno_extra', 'free_rewrite', 'equip_cap']);
const LOOT_SFX = { comun: 'loot_common', pococomun: 'loot_common', rara: 'loot_rare', epica: 'loot_epic', legendaria: 'loot_legendary', mitica: 'loot_mythic' } as const;

export const levelMult = (level: number): number => 1 + 0.25 * Math.max(0, Math.min(MAX_RELIC_LEVEL, level || 0));

/** Loot reveals play one after another (never stacked). */
let revealChain: Promise<void> = Promise.resolve();
/** Resolves once every queued relic reveal has been closed by the player. */
export function waitForReveals(): Promise<void> { return revealChain; }

// ───────────────────────────── queries ─────────────────────────────

export function relicInstances(): RelicInstance[] { return hasRun() ? G.run.player.relics : []; }
export function relicByUid(uidStr: string): RelicInstance | undefined { return relicInstances().find((r) => r.uid === uidStr); }
export function ownedRelic(id: string): RelicInstance | undefined { return relicInstances().find((r) => r.id === id); }
export function hasRelic(id: string): boolean { return !!ownedRelic(id); }
export function isEquipped(uidStr: string): boolean { return hasRun() && G.run.player.equipped.includes(uidStr); }

export function equippedRelics(): RelicInstance[] {
  if (!hasRun()) return [];
  const p = G.run.player;
  return p.equipped.map((u) => p.relics.find((r) => r.uid === u)).filter((r): r is RelicInstance => !!r && !!RELICS[r.id]);
}

/** Relic slots available (base + margins already folded into player.equipCap + relic passives). */
export function equipCapacity(): number {
  if (!hasRun()) return 4;
  let extra = 0;
  for (const r of equippedRelics()) extra += RELICS[r.id].passives?.equip_cap ?? 0;
  return Math.max(1, G.run.player.equipCap + extra);
}

/** Sum of a passive key over equipped relics, × forge level bonus (flags are not scaled). */
export function relicPassive(key: string): number {
  let sum = 0;
  for (const r of equippedRelics()) {
    const v = RELICS[r.id].passives?.[key];
    if (v) sum += FLAG_KEYS.has(key) ? v : v * levelMult(r.level);
  }
  return sum;
}

/** Additive % bonus to a stat from equipped relics. */
export function relicStat(stat: StatId): number {
  let sum = 0;
  for (const r of equippedRelics()) { const v = RELICS[r.id].stats?.[stat]; if (v) sum += v * levelMult(r.level); }
  return sum;
}

/** Additive damage bonus to a school from equipped relics. */
export function relicSchoolBoost(school: School): number {
  let sum = 0;
  for (const r of equippedRelics()) { const v = RELICS[r.id].schoolBoost?.[school]; if (v) sum += v * levelMult(r.level); }
  return sum;
}

/** Abilities granted by equipped relics (usable in Q/E), in equip order. */
export function relicAbilities(): string[] {
  const out: string[] = [];
  for (const r of equippedRelics()) { const g = RELICS[r.id].grants; if (g && !out.includes(g)) out.push(g); }
  return out;
}

// ───────────────────────────── mutations ─────────────────────────────

function clearWorldPlacement(id: string): void {
  const locs = G.run.locations ?? {};
  for (const l of Object.values(locs)) if (l && l.relic === id) l.relic = undefined;
  G.run.flags[`relic_taken_${id}`] = true;
}

function setBooks(id: string, on: boolean): void {
  const b = G.run.player.books;
  if (id === 'libro_aprendizaje') b.aprendizaje = on;
  if (id === 'libro_realidad') b.realidad = on;
}

export interface GrantOpts { reveal?: boolean; where?: string; silent?: boolean; allowDuplicate?: boolean }

/**
 * Adds a relic to the inventory (auto-equips if there is room). Unique relics are never duplicated; a duplicate of
 * a non-unique relic is salvaged into Esencia unless `allowDuplicate`. Emits relic:gained, track('relics_found').
 */
export function grantRelic(id: string, opts: GrantOpts = {}): RelicInstance | null {
  if (!hasRun()) return null;
  const def = RELICS[id];
  if (!def) { console.warn('[relics] unknown relic', id); return null; }
  const p = G.run.player;
  const existing = ownedRelic(id);
  if (existing && (def.unique || def.major)) return existing;
  if (existing && !opts.allowDuplicate) {
    const ess = DUPLICATE_ESSENCE[def.rarity] ?? 10;
    res.add('essence', ess, { raw: true });
    if (!opts.silent) {
      toast(`<b>${def.name}</b> repetida → <span class="lx-violet">+${ess} ✦ Esencia</span>`, { kind: def.rarity, icon: relicArt(def, 26, false), sound: true });
    }
    return existing;
  }
  const inst: RelicInstance = { uid: uid('rel'), id, level: 0, foundAt: opts.where ?? p.location ?? undefined, foundLuna: G.run.luna };
  p.relics.push(inst);
  setBooks(id, true);
  clearWorldPlacement(id);
  const s = PS();
  if (!s.newRelics.includes(inst.uid)) s.newRelics.push(inst.uid);
  // auto-equip when there is room (and no twin equipped)
  if (equippedRelics().length < equipCapacity() && !equippedRelics().some((r) => r.id === id)) {
    p.equipped.push(inst.uid);
    bus.emit('relics:equip', { uid: inst.uid, relicId: id, equipped: true });
  }
  track('relics_found');
  bus.emit('relic:gained', { relicId: id, uid: inst.uid });
  if (opts.reveal) {
    if (def.rarity === 'legendaria' || def.rarity === 'mitica') audio.stinger('relic_found');
    const item = { name: def.name, rarity: def.rarity, svg: relicArt(def, 120), desc: def.effectText };
    revealChain = revealChain.then(() => lootReveal([item], def.major ? 'Reliquia Mayor' : 'Reliquia')).catch(() => undefined);
  } else if (!opts.silent) {
    audio.sfx(LOOT_SFX[def.rarity]);
    toast(`<b>${def.name}</b> <span class="lx-muted">· ${RARITY_INFO[def.rarity].name}</span>`, { kind: def.rarity, icon: relicArt(def, 28, false), duration: 4 });
  }
  return inst;
}

/** Equip an instance. False if already full, unknown, or a twin of the same relic is equipped. */
export function equipRelic(uidStr: string): boolean {
  if (!hasRun()) return false;
  const p = G.run.player;
  const inst = relicByUid(uidStr);
  if (!inst) return false;
  if (p.equipped.includes(uidStr)) return true;
  if (equippedRelics().some((r) => r.id === inst.id)) return false;
  if (equippedRelics().length >= equipCapacity()) return false;
  p.equipped.push(uidStr);
  bus.emit('relics:equip', { uid: uidStr, relicId: inst.id, equipped: true });
  return true;
}

export function unequipRelic(uidStr: string): void {
  if (!hasRun()) return;
  const p = G.run.player;
  const i = p.equipped.indexOf(uidStr);
  if (i < 0) return;
  p.equipped.splice(i, 1);
  const inst = relicByUid(uidStr);
  bus.emit('relics:equip', { uid: uidStr, relicId: inst?.id ?? '', equipped: false });
}

/** Removes an instance from the inventory (sacrifice / fusion). */
export function removeRelic(uidStr: string, reason: 'sacrificio' | 'fusion' | 'otro' = 'otro'): boolean {
  if (!hasRun()) return false;
  const p = G.run.player;
  const idx = p.relics.findIndex((r) => r.uid === uidStr);
  if (idx < 0) return false;
  const [inst] = p.relics.splice(idx, 1);
  const e = p.equipped.indexOf(uidStr);
  if (e >= 0) { p.equipped.splice(e, 1); bus.emit('relics:equip', { uid: uidStr, relicId: inst.id, equipped: false }); }
  if (!hasRelic(inst.id)) setBooks(inst.id, false);
  const s = PS();
  s.newRelics = s.newRelics.filter((u) => u !== uidStr);
  bus.emit('relic:lost', { uid: uidStr, relicId: inst.id, reason });
  return true;
}

// ───────────────────────────── forge ─────────────────────────────

const UP_GOLD: Record<RelicDef['rarity'], number> = { comun: 60, pococomun: 120, rara: 250, epica: 500, legendaria: 900, mitica: 1500 };
const UP_ESS: Record<RelicDef['rarity'], number> = { comun: 10, pococomun: 20, rara: 40, epica: 70, legendaria: 110, mitica: 160 };

/** Cost of the next forge level (null at max). `discount` 0..1 (e.g. Hilda present). */
export function upgradeCost(inst: RelicInstance, discount = 0): { gold: number; essence: number } | null {
  const def = RELICS[inst.id];
  if (!def || inst.level >= MAX_RELIC_LEVEL) return null;
  const k = inst.level + 1;
  const d = 1 - Math.max(0, Math.min(0.5, discount));
  return { gold: Math.round(UP_GOLD[def.rarity] * k * d), essence: Math.round(UP_ESS[def.rarity] * k * d) };
}

export function upgradeRelic(uidStr: string, discount = 0): boolean {
  const inst = relicByUid(uidStr);
  if (!inst) return false;
  const cost = upgradeCost(inst, discount);
  if (!cost || !res.can('gold', cost.gold) || !res.can('essence', cost.essence)) return false;
  res.spend('gold', cost.gold);
  res.spend('essence', cost.essence);
  inst.level += 1;
  track('relics_upgraded');
  bus.emit('relic:upgraded', { uid: inst.uid, relicId: inst.id, level: inst.level });
  return true;
}

// ───────────────────────────── random drops ─────────────────────────────

/** Base rarity weights (comun 40, pococomun 28, rara 18, epica 9, legendaria 4, mitica 1). */
const BASE_W = [40, 28, 18, 9, 4, 1];
/** Weight for rarity index i when the table is shifted up by `boost` tiers (fractional ok). */
function shiftedWeight(i: number, boost: number): number {
  const x = i - boost;
  if (x <= 0) return BASE_W[0] * Math.pow(0.5, -x);
  if (x >= 5) return BASE_W[5] * Math.pow(0.5, x - 5);
  const lo = Math.floor(x), f = x - lo;
  return BASE_W[lo] + (BASE_W[lo + 1] - BASE_W[lo]) * f;
}

/** Relic ids that can drop at random right now (no majors, no fixed-location, no owned uniques, secrets by cycle). */
export function droppableRelics(): RelicDef[] {
  const cycle = hasRun() ? G.run.cycle : (G.meta?.currentCycle ?? 1);
  return Object.values(RELICS).filter((r) => {
    if (r.major || r.location) return false;
    if (r.minCycle && cycle < r.minCycle) return false;
    if ((r.unique || r.secret) && hasRun() && hasRelic(r.id)) return false;
    return true;
  });
}

/**
 * Weighted random relic id. `rarityBoost` shifts the rarity table up by that many tiers
 * (0 ≈ mostly común, 1 ≈ poco común/rara, 2 ≈ rara/épica, 3 ≈ épica+). Equipped `loot_luck` adds to it.
 * Deterministic when `seed` is given.
 */
export function randomRelic(rarityBoost = 0, seed?: string): string | null {
  const pool = droppableRelics();
  if (!pool.length) return null;
  const r = seed !== undefined ? new Rng(seed) : cosmeticRng;
  const boost = Math.max(0, rarityBoost + (hasRun() ? relicPassive('loot_luck') : 0));
  const order: RelicDef['rarity'][] = ['comun', 'pococomun', 'rara', 'epica', 'legendaria', 'mitica'];
  const tiers = order.map((rar, i) => ({ rar, w: shiftedWeight(i, boost), list: pool.filter((d) => d.rarity === rar) })).filter((t) => t.list.length);
  if (!tiers.length) return null;
  const tier = r.weighted(tiers, (t) => t.w);
  return r.pick(tier.list).id;
}

// ───────────────────────────── UI entry ─────────────────────────────

/** Opens the relic inventory (lazy-loaded UI). */
export function openRelics(): void {
  void import('./relicsUI').then((m) => m.openRelicsUI()).catch((err) => console.error('[relics] UI failed', err));
}
