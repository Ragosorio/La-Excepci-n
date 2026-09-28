/**
 * Dados Mentirosos — pure rules + AI (no imports).
 * Bids on faces 2–6; the 1s (Ases) are wild. A bid "q × f" claims at least q dice showing f or 1 among ALL dice.
 * AI: binomial belief P(X ≥ need) with p = 1/3 for unknown dice, personality thresholds, bluffing, softmax raises.
 */
export interface Bid { qty: number; face: number }
export interface Persona {
  threshold: number;   // call "¡Mentiroso!" when P(bid true) is below this (0.3 bold … 0.5 cautious)
  bluff: number;       // chance to add a bluff bonus to risky raises
  temperature: number; // softmax temperature for raises (low = sharp)
  exact: number;       // appetite for "¡Exacto!"
  perception: number;  // 0..1 — how well they notice cheating
  read: number;        // belief bonus when a bidder repeats a face
}

export const P_WILD = 1 / 3;

export function countFace(dice: number[], face: number): number {
  let c = 0;
  for (const d of dice) if (d === face || d === 1) c++;
  return c;
}

/** P(X ≥ k), X ~ Bin(n, p). */
export function pAtLeast(k: number, n: number, p = P_WILD): number {
  if (k <= 0) return 1;
  if (k > n) return 0;
  let term = Math.pow(1 - p, n), cdf = 0;
  for (let i = 0; i < k; i++) { cdf += term; term *= ((n - i) / (i + 1)) * (p / (1 - p)); }
  return Math.max(0, Math.min(1, 1 - cdf));
}

/** P(X = k). */
export function pExactly(k: number, n: number, p = P_WILD): number {
  if (k < 0 || k > n) return 0;
  let c = 1;
  for (let i = 0; i < k; i++) c = (c * (n - i)) / (i + 1);
  return c * Math.pow(p, k) * Math.pow(1 - p, n - k);
}

export function isRaise(prev: Bid | null, b: Bid): boolean {
  if (b.face < 2 || b.face > 6 || b.qty < 1) return false;
  if (!prev) return true;
  return b.qty > prev.qty || (b.qty === prev.qty && b.face > prev.face);
}

export function minQtyFor(prev: Bid | null, face: number): number {
  if (!prev) return 1;
  return face > prev.face ? prev.qty : prev.qty + 1;
}

export type Decision = { kind: 'bid'; bid: Bid; bluff: boolean } | { kind: 'liar' } | { kind: 'exact' };

export interface DecideCtx { totalDice: number; grudge: number; repeats: number; drunk?: boolean }

export function decide(me: number[], bid: Bid | null, persona: Persona, c: DecideCtx, rnd: () => number): Decision {
  const unknown = Math.max(0, c.totalDice - me.length);
  const threshold = Math.min(0.75, persona.threshold + c.grudge * 0.12 - (c.drunk ? 0.08 : 0));
  if (bid) {
    const need = bid.qty - countFace(me, bid.face);
    const pTrue = Math.min(1, pAtLeast(need, unknown) + persona.read * c.repeats);
    if (pTrue < threshold) return { kind: 'liar' };
    if (need >= 0 && pExactly(need, unknown) > 0.3 && rnd() < persona.exact * 0.5) return { kind: 'exact' };
  }
  // candidate raises
  const cands: Array<{ b: Bid; s: number; bluff: boolean }> = [];
  for (let f = 2; f <= 6; f++) {
    const q0 = minQtyFor(bid, f);
    for (let q = Math.max(1, q0); q <= q0 + 1; q++) {
      if (q > c.totalDice) continue;
      const mine = countFace(me, f);
      let s = pAtLeast(q - mine, unknown);
      let bluff = false;
      if (s < 0.5 && rnd() < persona.bluff) { s += 0.28 * rnd(); bluff = true; }
      s += mine * 0.02; // mild preference for faces we actually hold
      cands.push({ b: { qty: q, face: f }, s, bluff });
    }
  }
  if (!cands.length) return { kind: 'liar' };
  if (!bid) {
    // opening: a comfortable, believable claim
    const best = cands.filter((x) => x.b.qty <= Math.max(1, Math.round(countFace(me, x.b.face) + unknown * P_WILD * 0.8))).sort((a, b) => b.s - a.s)[0];
    if (best) return { kind: 'bid', bid: best.b, bluff: best.bluff };
  }
  const T = Math.max(0.03, persona.temperature);
  const maxS = Math.max(...cands.map((x) => x.s));
  const ws = cands.map((x) => Math.exp((x.s - maxS) / T));
  const sum = ws.reduce((a, b) => a + b, 0);
  let r = rnd() * sum;
  for (let i = 0; i < cands.length; i++) { r -= ws[i]; if (r <= 0) return { kind: 'bid', bid: cands[i].b, bluff: cands[i].bluff }; }
  const last = cands[cands.length - 1];
  return { kind: 'bid', bid: last.b, bluff: last.bluff };
}

export function roll(n: number, rnd: () => number): number[] {
  return Array.from({ length: n }, () => 1 + Math.floor(rnd() * 6));
}
