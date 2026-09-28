/**
 * Arena del Remolino — quick battle model (pure). Lanchester-flavoured discrete sim with front-line weighting and noise.
 * Used to (a) calibrate odds by Monte Carlo (house margin on top) and (b) animate the quick-resolve mode.
 */
export interface SimUnit { id: string; hp: number; damage: number; cooldown: number; armor: number; role: string; tier: number }
export interface SimGroup { unit: SimUnit; count: number }
export interface SimResult { winner: 'A' | 'B'; frames: Array<{ a: number[]; b: number[] }>; lastA: number; lastB: number }

const FRONT: Record<string, number> = { tanque: 2.2, melee: 1.6, monstruo: 1.8, asedio: 1.2, asesino: 1.0, apoyo: 0.8, sanador: 0.7, mago: 0.7, rango: 0.6 };

function dps(u: SimUnit): number {
  const ranged = u.role === 'rango' || u.role === 'mago' ? 1.25 : 1;
  return (u.damage / Math.max(0.4, u.cooldown)) * ranged;
}
function ehp(u: SimUnit): number { return u.hp / (1 - Math.min(0.8, u.armor)); }

export function strength(side: SimGroup[]): number {
  let f = 0, hp = 0;
  for (const g of side) { f += dps(g.unit) * g.count; hp += ehp(g.unit) * g.count; }
  return f * hp;
}

/** One noisy battle. `sabotage` removes a fraction of the enemy's first group at t=0 (Velo cheat). */
export function simulate(A: SimGroup[], B: SimGroup[], rnd: () => number, sabotage: { side: 'A' | 'B'; frac: number } | null = null): SimResult {
  const pools = (side: SimGroup[]) => side.map((g) => ({ u: g.unit, pool: ehp(g.unit) * g.count, max: g.count }));
  const a = pools(A), b = pools(B);
  if (sabotage) {
    const tgt = sabotage.side === 'A' ? b : a;
    for (const g of tgt) g.pool *= 1 - sabotage.frac;
  }
  const alive = (p: ReturnType<typeof pools>) => p.map((g) => Math.max(0, Math.ceil(g.pool / ehp(g.u) - 1e-6)));
  const frames: SimResult['frames'] = [{ a: alive(a), b: alive(b) }];
  // fortune of the day: whole-battle swing so underdogs can win (TABS chaos)
  const fa = 0.7 + rnd() * 0.6, fb = 0.7 + rnd() * 0.6;
  for (let step = 0; step < 80; step++) {
    const na = alive(a), nb = alive(b);
    const totA = na.reduce((x, y) => x + y, 0), totB = nb.reduce((x, y) => x + y, 0);
    if (totA === 0 || totB === 0) break;
    const dmgA = a.reduce((s, g, i) => s + dps(g.u) * na[i], 0) * (0.35 + rnd() * 1.3) * 0.9 * fa;
    const dmgB = b.reduce((s, g, i) => s + dps(g.u) * nb[i], 0) * (0.35 + rnd() * 1.3) * 0.9 * fb;
    const hit = (p: ReturnType<typeof pools>, n: number[], dmg: number) => {
      const w = p.map((g, i) => (n[i] > 0 ? FRONT[g.u.role] ?? 1 : 0) * Math.sqrt(n[i]));
      const sw = w.reduce((x, y) => x + y, 0) || 1;
      p.forEach((g, i) => { g.pool = Math.max(0, g.pool - dmg * (w[i] / sw)); });
    };
    hit(b, nb, dmgA);
    hit(a, na, dmgB);
    frames.push({ a: alive(a), b: alive(b) });
  }
  const last = frames[frames.length - 1];
  const sa = last.a.reduce((x, y) => x + y, 0), sb = last.b.reduce((x, y) => x + y, 0);
  const remA = a.reduce((s, g) => s + g.pool, 0), remB = b.reduce((s, g) => s + g.pool, 0);
  const winner: 'A' | 'B' = sa === 0 && sb > 0 ? 'B' : sb === 0 && sa > 0 ? 'A' : remA >= remB ? 'A' : 'B';
  return { winner, frames, lastA: sa, lastB: sb };
}

export function winProbA(A: SimGroup[], B: SimGroup[], rnd: () => number, n = 240): number {
  let w = 0;
  for (let i = 0; i < n; i++) if (simulate(A, B, rnd).winner === 'A') w++;
  return Math.min(0.97, Math.max(0.03, (w + 1) / (n + 2)));
}

/** Decimal odds with a house margin: o = 1 / (p·(1+m)), clamped. */
export function quote(pA: number, margin = 0.07): { a: number; b: number } {
  const c = (p: number) => Math.min(15, Math.max(1.05, 1 / (p * (1 + margin))));
  return { a: Math.round(c(pA) * 100) / 100, b: Math.round(c(1 - pA) * 100) / 100 };
}
