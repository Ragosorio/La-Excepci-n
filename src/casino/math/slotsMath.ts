/**
 * Tragamonedas de Reliquias — pure math (no imports, so it can be Monte-Carlo'd in Node).
 * 5 reels × 3 rows, 20 lines, weighted reel strips with scatter spacing, X wild, Eclipse scatter.
 * Outcome first, presentation second: spin() picks stops; the UI only animates towards them.
 * Jackpot (¡BOTE!): El Libro de la Realidad visible on all five reels (anywhere). Libros and Eclipses are spaced on
 * the strips (max one per window), so P(reel shows one) = 3·w/L — the last-reel tension is honest.
 * Tuned by Monte Carlo (see final report): RTP ≈ 94% base+free spins (jackpot extra), hit ≈ 33%.
 */
export type Sym = 'moneda' | 'dado' | 'carta' | 'farol' | 'caliz' | 'corona' | 'daga' | 'luna' | 'libro' | 'wild' | 'eclipse';
export const SYMS: Sym[] = ['moneda', 'dado', 'carta', 'farol', 'caliz', 'corona', 'daga', 'luna', 'libro', 'wild', 'eclipse'];

/** Line pays for 3/4/5 of a kind, in line-bet units (20 lines → total bet = 20 × line bet). */
export const PAY: Record<Exclude<Sym, 'eclipse'>, [number, number, number]> = {
  moneda: [15, 45, 150],
  dado: [15, 45, 150],
  carta: [20, 75, 220],
  farol: [20, 75, 220],
  caliz: [35, 110, 400],
  corona: [40, 170, 550],
  daga: [55, 210, 850],
  luna: [55, 210, 850],
  libro: [85, 420, 2000],
  wild: [110, 550, 2800],
};
/** Scatter pays in total-bet units, anywhere. */
export const SCATTER_PAY: Record<number, number> = { 3: 3, 4: 15, 5: 100 };
/** Free spins [count, multiplier] by scatters landed. */
export const FREE_SPINS: Record<number, [number, number]> = { 3: [8, 2], 4: [12, 3], 5: [20, 5] };
export const RETRIGGER = 5;

export const LINES: number[][] = [
  [1, 1, 1, 1, 1], [0, 0, 0, 0, 0], [2, 2, 2, 2, 2], [0, 1, 2, 1, 0], [2, 1, 0, 1, 2],
  [0, 0, 1, 2, 2], [2, 2, 1, 0, 0], [1, 0, 0, 0, 1], [1, 2, 2, 2, 1], [1, 0, 1, 2, 1],
  [1, 2, 1, 0, 1], [0, 1, 0, 1, 0], [2, 1, 2, 1, 2], [0, 1, 1, 1, 0], [2, 1, 1, 1, 2],
  [1, 1, 0, 1, 1], [1, 1, 2, 1, 1], [0, 2, 0, 2, 0], [2, 0, 2, 0, 2], [0, 2, 2, 2, 0],
];

/** Symbol weights per reel (virtual stops). */
export const WEIGHTS: Array<Partial<Record<Sym, number>>> = [
  { moneda: 10, dado: 10, carta: 9, farol: 8, caliz: 6, corona: 5, daga: 4, luna: 4, libro: 4, wild: 0, eclipse: 2 },
  { moneda: 10, dado: 10, carta: 9, farol: 8, caliz: 6, corona: 5, daga: 4, luna: 4, libro: 4, wild: 2, eclipse: 2 },
  { moneda: 10, dado: 10, carta: 9, farol: 8, caliz: 6, corona: 5, daga: 4, luna: 4, libro: 3, wild: 2, eclipse: 2 },
  { moneda: 10, dado: 10, carta: 9, farol: 8, caliz: 6, corona: 5, daga: 4, luna: 4, libro: 3, wild: 2, eclipse: 2 },
  { moneda: 10, dado: 10, carta: 9, farol: 8, caliz: 6, corona: 5, daga: 4, luna: 4, libro: 3, wild: 1, eclipse: 2 },
];
/** Symbols spaced ≥ 3 stops apart on every strip (at most one visible per reel window). */
export const SPACED: Sym[] = ['eclipse', 'libro'];
/** Mixed pays multiplier (tuning knob; 1 = PAY as written). */
export const PAY_SCALE = 1;

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Deterministic strips: weighted multiset, seeded shuffle, scatters spaced ≥ 3 apart (max one per window). */
export function buildStrips(weights = WEIGHTS, seed = 7331): Sym[][] {
  return weights.map((w, ri) => {
    const r = mulberry(seed + ri * 977);
    const bag: Sym[] = [];
    for (const s of SYMS) for (let i = 0; i < (w[s] ?? 0); i++) bag.push(s);
    for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; }
    // enforce spacing (circular) for scatters and libros: at most one of the same kind per 3-stop window
    const L = bag.length;
    const ok = (arr: Sym[], idx: number) => { const s0 = arr[idx]; if (!SPACED.includes(s0)) return true; for (let d = 1; d <= 2; d++) { if (arr[(idx + d) % L] === s0 || arr[(idx - d + L) % L] === s0) return false; } return true; };
    for (let guard = 0; guard < 400; guard++) {
      const bad = bag.findIndex((_, i) => !ok(bag, i));
      if (bad < 0) break;
      let moved = false;
      for (let k = 0; k < L * 2 && !moved; k++) {
        const j = Math.floor(r() * L);
        if (SPACED.includes(bag[j])) continue;
        [bag[bad], bag[j]] = [bag[j], bag[bad]];
        if (ok(bag, j) && ok(bag, bad) && ok(bag, (j + 1) % L) && ok(bag, (j + L - 1) % L)) moved = true;
        else [bag[bad], bag[j]] = [bag[j], bag[bad]];
      }
      if (!moved) break;
    }
    return bag;
  });
}

export const STRIPS: Sym[][] = buildStrips();

export interface LineWin { line: number; sym: Sym; count: number; pay: number; cells: Array<[number, number]> }
export interface Near { line: number; sym: Sym; reel: number; row: number }
export interface SpinEval {
  grid: Sym[][];              // [reel][row]
  stops: number[];
  lines: LineWin[];
  linePay: number;            // line-bet units
  scatters: number;
  scatterCells: Array<[number, number]>;
  scatterPay: number;         // total-bet units
  jackpot: boolean;           // El Libro on all 5 reels
  jackpotLine: number;        // unused (-1): kept for UI compatibility
  near: Near[];               // honest near-misses: 4 of a kind whose 5th symbol is visible just off the line
}

export function gridAt(stops: number[], strips = STRIPS): Sym[][] {
  return stops.map((st, r) => { const s = strips[r]; const L = s.length; return [s[(st) % L], s[(st + 1) % L], s[(st + 2) % L]]; });
}

export function evaluate(grid: Sym[][], stops: number[] = []): SpinEval {
  const lines: LineWin[] = [];
  const near: Near[] = [];
  let linePay = 0;
  let jackpot = false, jackpotLine = -1;
  for (let li = 0; li < LINES.length; li++) {
    const L = LINES[li];
    const seq = L.map((row, r) => grid[r][row]);
    if (seq[0] === 'eclipse') continue;
    let wilds = 0;
    while (wilds < 5 && seq[wilds] === 'wild') wilds++;
    const base = seq.find((s) => s !== 'wild');
    let cnt = 0;
    if (base && base !== 'eclipse') { while (cnt < 5 && (seq[cnt] === base || seq[cnt] === 'wild')) cnt++; }
    const payBase = base && base !== 'eclipse' && cnt >= 3 ? PAY[base as Exclude<Sym, 'eclipse'>][cnt - 3] * PAY_SCALE : 0;
    const payWild = wilds >= 3 ? PAY.wild[wilds - 3] * PAY_SCALE : 0;
    if (payBase > 0 || payWild > 0) {
      const useWild = payWild > payBase;
      const count = useWild ? wilds : cnt;
      const pay = Math.max(payBase, payWild);
      linePay += pay;
      lines.push({ line: li, sym: useWild ? 'wild' : (base as Sym), count, pay, cells: L.slice(0, count).map((row, r) => [r, row] as [number, number]) });
      if (count === 4) {
        const want = useWild ? 'wild' : (base as Sym);
        for (let row = 0; row < 3; row++) if (row !== L[4] && grid[4][row] === want) near.push({ line: li, sym: want, reel: 4, row });
      }
    }
  }
  const libroReels = grid.filter((col) => col.includes('libro')).length;
  if (libroReels === 5) { jackpot = true; jackpotLine = -1; }
  const scatterCells: Array<[number, number]> = [];
  for (let r = 0; r < 5; r++) for (let row = 0; row < 3; row++) if (grid[r][row] === 'eclipse') scatterCells.push([r, row]);
  const scatters = scatterCells.length;
  return { grid, stops, lines, linePay, scatters, scatterCells, scatterPay: SCATTER_PAY[Math.min(5, scatters)] ?? 0, jackpot, jackpotLine, near };
}

export function spin(rand: () => number, strips = STRIPS): SpinEval {
  const stops = strips.map((s) => Math.floor(rand() * s.length));
  return evaluate(gridAt(stops, strips), stops);
}

/** Whether reel `r` should anticipate (slow, tense spin) given the reels already stopped (honest: only landed info). */
export function anticipate(ev: SpinEval, r: number): 'scatter' | 'jackpot' | null {
  if (r < 3) return null;
  let books = 0, sc = 0;
  for (let i = 0; i < r; i++) { if (ev.grid[i].includes('libro')) books++; if (ev.grid[i].includes('eclipse')) sc++; }
  if (books === r) return 'jackpot';        // every landed reel shows El Libro → the rest decide the jackpot
  if (sc >= 2) return 'scatter';
  return null;
}
