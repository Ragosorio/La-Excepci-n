/**
 * El Pozo de los Deseos — rarity tables and pity (pure, no imports).
 * Legendary: base chance per wish, soft pity from wish 45 (+6%/wish), hard pity at 60. Épica+ guaranteed every 10.
 */
export type Rar = 'comun' | 'pococomun' | 'rara' | 'epica' | 'legendaria';
export const RARS: Rar[] = ['comun', 'pococomun', 'rara', 'epica', 'legendaria'];
export const PITY_SOFT = 45;
export const PITY_HARD = 60;
export const EPIC_PITY = 10;
export const SOFT_STEP = 0.06;

export type WishKind = 'menor' | 'mayor';
export const WISH_COST: Record<WishKind, number> = { menor: 100, mayor: 1000 };
export const TEN_COST = 9000;

/** Non-legendary odds (they share what legendary leaves). */
export const TABLE: Record<WishKind, { legend: number; w: Record<Exclude<Rar, 'legendaria'>, number> }> = {
  menor: { legend: 0.008, w: { comun: 0.555, pococomun: 0.28, rara: 0.12, epica: 0.045 } },
  mayor: { legend: 0.03, w: { comun: 0.1, pococomun: 0.36, rara: 0.36, epica: 0.18 } },
};

/** n = wishes since the last legendary, counting this one (1-based). */
export function pLegend(n: number, base: number): number {
  if (n >= PITY_HARD) return 1;
  return Math.min(1, base + Math.max(0, n - PITY_SOFT + 1) * SOFT_STEP);
}

export interface Pity { legend: number; epic: number }

/** Roll one wish. Mutates and returns the pity counters. luckBoost adds to the legendary base (0..0.4 → +0..1.2%). */
export function rollWish(kind: WishKind, pity: Pity, rand: () => number, luckBoost = 0, forceEpic = false): Rar {
  const t = TABLE[kind];
  const n = pity.legend + 1;
  if (rand() < pLegend(n, t.legend + luckBoost * 0.03)) { pity.legend = 0; pity.epic = 0; return 'legendaria'; }
  pity.legend = n;
  if (forceEpic || pity.epic + 1 >= EPIC_PITY) { pity.epic = 0; return 'epica'; }
  const w = t.w;
  const total = w.comun + w.pococomun + w.rara + w.epica;
  let r = rand() * total;
  let out: Rar = 'comun';
  for (const k of ['comun', 'pococomun', 'rara', 'epica'] as const) { r -= w[k]; if (r <= 0) { out = k; break; } }
  pity.epic = out === 'epica' ? 0 : pity.epic + 1;
  return out;
}

/** Expected wishes to a legendary under the soft/hard pity model. */
export function expectedToLegend(base: number): number {
  let surv = 1, e = 0;
  for (let n = 1; n <= PITY_HARD; n++) { const p = pLegend(n, base); e += n * surv * p; surv *= 1 - p; }
  return e;
}

export const DUP_ESSENCE: Record<Rar, number> = { comun: 8, pococomun: 20, rara: 45, epica: 120, legendaria: 400 };
