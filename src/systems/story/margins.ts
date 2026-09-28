/**
 * Los Márgenes — meta upgrades applied at run init (priority 90), Ecos, and resource modifiers.
 */
import { G, onRunInit, addResModifier, type RunState } from '../../core/state';
import { saveMeta } from '../../core/save';
import { MARGINS, MARGIN_BY_ID, RELIC_RARITY_BY_RANK } from '../../data/margins';
import { HERO_KIT } from '../../data/abilities';
import { UNITS } from '../../data/units';
import { RELICS } from '../../data/relics';
import { CONTINENT_IDS } from '../../data/world';
import { acquire } from '../progression/codex';
import { grantRelic, randomRelic } from '../progression/relics';
import { uid } from '../../core/rng';
import { st } from './state';
import type { ArmyUnit } from '../../data/types';

export function marginRank(id: string): number { return Math.max(0, Math.min(MARGIN_BY_ID[id]?.maxRank ?? 0, G.meta?.margins[id] ?? 0)); }

/** Effect value at the current rank (0 when not bought). */
export function marginValue(id: string): number {
  const r = marginRank(id);
  const m = MARGIN_BY_ID[id];
  return r > 0 && m ? m.value[r - 1] ?? 0 : 0;
}

export function marginNextCost(id: string): number | null {
  const m = MARGIN_BY_ID[id];
  const r = marginRank(id);
  if (!m || r >= m.maxRank) return null;
  return m.cost[r] ?? null;
}

export function buyMargin(id: string): boolean {
  const cost = marginNextCost(id);
  if (cost === null || !G.meta || G.meta.ink < cost) return false;
  G.meta.ink -= cost;
  G.meta.margins[id] = marginRank(id) + 1;
  G.meta.echoSlots = echoSlots();
  saveMeta();
  return true;
}

/** Echo slots for the next cycle: one from the second cycle on, plus the margin. */
export function echoSlots(): number {
  if (!G.meta) return 0;
  return (G.meta.cyclesCompleted > 0 ? 1 : 0) + marginValue('eco');
}

/** Abilities that can be chosen as Ecos (the hero kit is always re-learned at the resurrection). */
export function echoCandidates(): string[] {
  const kit = new Set<string>([...HERO_KIT, 'chispa_arcana', 'esquivar', 'golpe_titanico', 'el_alba']);
  return [...new Set(G.meta?.echoesKnown ?? [])].filter((id) => !kit.has(id));
}

/** Acquire the chosen Ecos (called at the resurrection; safe to call twice). */
export function applyEchoes(): string[] {
  if (!G.run || !G.meta) return [];
  const s = st();
  if (s.echoesApplied) return [];
  s.echoesApplied = true;
  const allowed = new Set(echoCandidates());
  const chosen = G.meta.echoesChosen.filter((id) => allowed.has(id)).slice(0, echoSlots());
  for (const id of chosen) {
    try { acquire(id, { silent: true, noCutin: true }); } catch (err) { console.warn('[story] echo acquire failed', id, err); }
  }
  return chosen;
}

function pickDevotoUnit(run: RunState): string | null {
  const all = Object.values(UNITS);
  if (!all.length) return null;
  const t1 = all.filter((u) => u.tier === 1 && u.recruitAt?.includes('valdoria'));
  const pool = t1.length ? t1 : all.filter((u) => u.tier === 1);
  const list = pool.length ? pool : all;
  return list[(run.seed >>> 3) % list.length].id;
}

// Gold and alert modifiers read the ranks at call time, so buying a margin applies immediately.
addResModifier('gold', (d) => d * (1 + marginValue('oro') / 100));
addResModifier('alert', (d) => d * (1 - marginValue('alerta') / 100));

onRunInit('margins', 90, (run) => {
  if (!G.meta) return;
  const p = run.player;
  const v = (id: string) => marginValue(id);
  if (v('retorno')) p.retornoMax += v('retorno');
  if (v('ranura')) p.equipCap += v('ranura');
  if (v('mana')) { p.manaMax += v('mana'); p.mana = p.manaMax; p.stats.mana += v('mana'); }
  if (v('vida')) { p.hpMax = Math.round(p.hpMax * (1 + v('vida') / 100)); p.hp = p.hpMax; p.stats.vida = p.hpMax; }
  if (v('esencia')) p.essence += v('esencia');
  if (v('bolsa')) p.gold += v('bolsa');
  if (v('influencia')) p.influence += v('influencia');
  if (v('secretos')) p.secrets += v('secretos');
  if (v('suerte')) { p.stats.suerte += v('suerte'); run.flags.margin_casino_luck = v('suerte'); }
  if (v('reclutas')) run.flags.margin_recruit_discount = v('reclutas') / 100;
  if (v('alerta')) run.flags.margin_alert_mult = 1 - v('alerta') / 100;
  if (v('debilidad')) {
    const ids = [...CONTINENT_IDS].sort(() => Math.random() - 0.5).slice(0, v('debilidad'));
    let n = 0;
    for (const c of ids) { const cs = run.continents[c]; if (cs) { cs.weaknessKnown = true; n++; } }
    run.flags.margin_weakness_revealed = n;
  }
  if (v('devotos')) {
    const unitId = pickDevotoUnit(run);
    if (unitId) {
      for (let i = 0; i < v('devotos'); i++) {
        const u: ArmyUnit = { uid: uid('dev'), unitId, stars: 0, xp: 0, devoto: true };
        p.army.push(u);
      }
    } else {
      run.flags.margin_devotos_pending = v('devotos');
    }
  }
  const relicRank = marginRank('reliquia');
  if (relicRank > 0) {
    // Relics are granted after the other systems are ready (progression owns the inventory).
    run.flags.margin_relic_rarity = RELIC_RARITY_BY_RANK[relicRank - 1];
  }
  G.meta.echoSlots = echoSlots();
});

/** Grants the starting relic from "Un recuerdo en el bolsillo" (called once the run reaches the world). */
export function grantMarginRelic(): void {
  if (!G.run) return;
  const rarity = G.run.flags.margin_relic_rarity;
  if (typeof rarity !== 'string' || G.run.flags.margin_relic_granted) return;
  G.run.flags.margin_relic_granted = true;
  const boost = rarity === 'epica' ? 3 : rarity === 'rara' ? 2 : 1;
  let id = randomRelic(boost, `margin-${G.run.seed}`);
  if (!id) {
    const pool = Object.values(RELICS).filter((r) => r.rarity === rarity && !r.major && !r.secret);
    id = pool.length ? pool[G.run.seed % pool.length].id : null;
  }
  if (id) grantRelic(id, { reveal: true, where: 'margenes' });
}

export { MARGINS };
