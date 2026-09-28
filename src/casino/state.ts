/**
 * Casino state slice (RunModules.casino) + the shared casino economy:
 * bets, settlement (streaks, hot tables, tracking, events), luck and bans.
 *
 * Every game goes through bet() → settle() so tracking ("Siempre estuve viéndote"), streaks and events stay
 * consistent. Payouts are credited raw (no resource modifiers) so +gold relics can't turn the house edge positive.
 */
import { G, registerModule, res } from '../core/state';
import { bus } from '../core/events';
import { track, trackMax } from '../core/tracker';
import { saveRun } from '../core/save';
import { relicPassive } from '../systems/progression/relics';
import { hasRacialPower } from '../systems/progression/stats';
import { RACES } from '../data/races';
import { remember } from '../systems/society/api';
import type { EnemyGroup } from '../battle/api';

export type GameId = 'slots' | 'ruleta' | 'tarot' | 'dados' | 'arena' | 'pozo' | 'final' | 'tres';
export type Currency = 'gold' | 'essence';

export const GAME_NAMES: Record<GameId, string> = {
  slots: 'Tragamonedas de Reliquias',
  ruleta: 'La Rueda de las Almas',
  tarot: 'Veintiuno del Tarot',
  dados: 'Dados Mentirosos',
  arena: 'Arena del Remolino',
  pozo: 'El Pozo de los Deseos',
  final: 'La Apuesta Final',
  tres: 'Tres Dados',
};

export interface RivalMem { id: string; name: string; played: number; beatYou: number; lostToYou: number; caught: number; lastLuna: number }

export interface ArenaSideSpec { name: string; groups: EnemyGroup[]; color: string; crest: string }
export interface ArenaMatch { id: string; a: ArenaSideSpec; b: ArenaSideSpec; pA: number; oddsA: number; oddsB: number; createdLuna: number }
export interface ArenaBet {
  id: string; match: ArenaMatch; side: 'A' | 'B'; amount: number; odds: number;
  status: 'pending' | 'resolved' | 'settled'; winner?: 'A' | 'B'; cheat?: boolean; mode: '3d' | 'rapida';
}

export interface CasinoState {
  v: 1;
  jackpot: number;
  jackpotWins: number;
  pity: { legend: number; epic: number };
  pozoPulls: number;
  streak: number;
  bestStreak: number;
  suspicion: number;             // 0..100 — Los Ojos de la Casa
  bannedUntil: number;           // luna; -1 = not banned
  bans: number;
  caught: number;
  visits: number;
  lastVisitLuna: number;
  net: number;                   // run net (gold)
  wagered: number;               // run wagered (gold)
  biggestWin: number;
  biggestLoss: number;
  lastBig: { kind: 'win' | 'loss' | 'none'; amount: number; game: string; luna: number };
  tiburcio: { met: boolean; seen: string[]; forgave: number; quipIdx: number };
  rivals: Record<string, RivalMem>;
  hot: { game: GameId; until: number; mult: number; label: string } | null;
  arenaMatch: ArenaMatch | null;
  arenaBets: Record<string, ArenaBet>;
  final: { played: number; won: boolean; lastLuna: number };
  free: { spins: number; mult: number; bet: number; won: number; label?: string } | null;
  session: { gambled: number; start: number; net: number };
  lastNumbers: number[];         // roulette history
  guardFight: 'pending' | 'won' | 'lost' | null;
  lastGreetLuna: number;
}

declare module '../core/state' {
  interface RunModules { casino: CasinoState }
}

declare module '../core/events' {
  interface GameEvents {
    /** casino → anyone: a bet was placed (gold or essence). */
    'casino:bet': { game: string; amount: number; currency: Currency };
    /** casino → story/society: a round ended with a net win (amount = net, incl. bonuses). */
    'casino:win': { game: string; amount: number; currency: Currency };
    /** casino → story/society: a round ended with a net loss (amount = positive loss). */
    'casino:loss': { game: string; amount: number; currency: Currency };
    'casino:jackpot': { amount: number; relicId: string | null };
    'casino:cheat': { game: string; caught: boolean };
    'casino:banned': { lunas: number };
    'casino:final': { won: boolean };
    'casino:relic': { relicId: string; source: string };
  }
}

export const JACKPOT_SEED = 5000;
/** El Casino Clandestino pays better (and gets raided). */
export const CLANDESTINO_BONUS = 0.1;

export function defaultCasino(): CasinoState {
  return {
    v: 1, jackpot: JACKPOT_SEED, jackpotWins: 0, pity: { legend: 0, epic: 0 }, pozoPulls: 0,
    streak: 0, bestStreak: 0, suspicion: 0, bannedUntil: -1, bans: 0, caught: 0, visits: 0, lastVisitLuna: -1,
    net: 0, wagered: 0, biggestWin: 0, biggestLoss: 0, lastBig: { kind: 'none', amount: 0, game: '', luna: 0 },
    tiburcio: { met: false, seen: [], forgave: 0, quipIdx: 0 }, rivals: {}, hot: null, arenaMatch: null, arenaBets: {},
    final: { played: 0, won: false, lastLuna: -99 }, free: null, session: { gambled: 0, start: Date.now(), net: 0 },
    lastNumbers: [], guardFight: null, lastGreetLuna: -99,
  };
}

registerModule('casino', () => defaultCasino());

let migratedFor: object | null = null;
/** The casino slice (created/migrated lazily so older saves and HMR never crash). */
export function cs(): CasinoState {
  const run = G.run;
  const mods = run.modules as { casino?: CasinoState };
  if (!mods.casino) mods.casino = defaultCasino();
  if (migratedFor !== mods.casino) {
    const d = defaultCasino() as unknown as Record<string, unknown>;
    const cur = mods.casino as unknown as Record<string, unknown>;
    for (const k of Object.keys(d)) if (cur[k] === undefined) cur[k] = d[k];
    migratedFor = mods.casino;
  }
  return mods.casino;
}

export const luna = (): number => G.run?.luna ?? 0;
export const gold = (): number => G.run?.player.gold ?? 0;
export const essence = (): number => G.run?.player.essence ?? 0;
export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);

// ───────────────────────────── luck & passives ─────────────────────────────

const DUENDE_POWER = (): string => RACES.duende?.racialPower?.id ?? 'suerte_duende';

/** 0..0.4 — second chances granted by luck (relics, duende racial power, margins, Suerte stat). */
export function luck(): number {
  let l = 0;
  try { l += relicPassive('casino_luck'); } catch { /* stub */ }
  try { if (hasRacialPower(DUENDE_POWER())) l += 0.08; } catch { /* stub */ }
  for (const [k, v] of Object.entries(G.meta?.margins ?? {})) if (/casino|suerte|azar/i.test(k)) l += 0.03 * (Number(v) || 0);
  const suerte = G.run?.player.stats.suerte ?? 5;
  l += Math.max(0, suerte - 5) * 0.004;
  return clamp(l, 0, 0.4);
}

/** El Dado de Hueso de Dios (and friends): N re-rolls per game (relic passive 'reroll'). */
export function rerollCount(): number {
  try { return Math.max(0, Math.floor(relicPassive('reroll'))); } catch { return 0; }
}
export function hasReroll(): boolean { return rerollCount() > 0; }

// ───────────────────────────── streaks & hot tables ─────────────────────────

export function streakPct(streak: number): number { return streak >= 2 ? Math.min(0.5, 0.05 * (streak - 1)) : 0; }

export function hotFor(game: GameId): { mult: number; label: string } | null {
  const h = cs().hot;
  if (!h || h.game !== game) return null;
  if (Date.now() > h.until) { cs().hot = null; return null; }
  return { mult: h.mult, label: h.label };
}

// ───────────────────────────── bans ─────────────────────────────

export function isBanned(): boolean { const b = cs().bannedUntil; return b >= 0 && luna() < b; }
export function banLunasLeft(): number { return Math.max(0, cs().bannedUntil - luna()); }
/** The Concilio's "Prohibir las Apuestas" sets flags.casino_closed = luna until which the Banca stays shut (or true). */
export function casinoClosed(): boolean {
  const f = G.run?.flags.casino_closed;
  if (typeof f === 'number') return luna() < f;
  return !!f;
}
export function closedLunasLeft(): number {
  const f = G.run?.flags.casino_closed;
  return typeof f === 'number' ? Math.max(0, f - luna()) : 0;
}

// ───────────────────────────── wallet ─────────────────────────────

export function canBet(amount: number, cur: Currency = 'gold'): boolean {
  return amount > 0 && res.can(cur, amount);
}

/** Take a stake. Returns false (and does nothing) when unaffordable. */
export function bet(game: GameId, amount: number, cur: Currency = 'gold'): boolean {
  amount = Math.round(amount);
  if (amount <= 0 || !res.spend(cur, amount)) return false;
  const s = cs();
  if (cur === 'gold') {
    track('gold_gambled', amount);
    s.wagered += amount;
    s.session.gambled += amount;
    trackMax('gamble_night_max', s.session.gambled);
  } else {
    track('essence_gambled', amount);
  }
  bus.emit('casino:bet', { game, amount, currency: cur });
  persist();
  return true;
}

let saveTimer = 0;
/** Trailing, coalesced save: a reload can't undo a stake or a payout (anti save-scum) without saving every frame. */
export function persist(): void {
  if (saveTimer) return;
  saveTimer = window.setTimeout(() => { saveTimer = 0; try { saveRun(true); } catch { /* storage full */ } }, 400);
}

export interface SettleResult { net: number; bonus: number; credited: number; streak: number; bonusPct: number; hotLabel?: string }

/**
 * Close a round. `returned` is the gross amount handed back (0 on loss, stake on push, stake+win on win).
 * Applies streak + hot-table bonuses to net wins, credits the wallet, tracks, emits events.
 */
export function settle(game: GameId, stake: number, returned: number, opts: { cur?: Currency; noStreak?: boolean; noBonus?: boolean } = {}): SettleResult {
  const cur = opts.cur ?? 'gold';
  const s = cs();
  returned = Math.max(0, Math.round(returned));
  let net = returned - stake;
  let bonus = 0;
  let bonusPct = 0;
  let hotLabel: string | undefined;
  if (net > 0) {
    if (!opts.noStreak) { s.streak += 1; s.bestStreak = Math.max(s.bestStreak, s.streak); }
    if (!opts.noBonus) {
      bonusPct = streakPct(s.streak);
      const hot = hotFor(game);
      if (hot) { bonusPct += hot.mult - 1; hotLabel = hot.label; }
      if (casinoClosed()) bonusPct += CLANDESTINO_BONUS;
      bonus = Math.floor(net * bonusPct);
    }
    net += bonus;
  } else if (net < 0 && !opts.noStreak) {
    s.streak = 0;
  }
  const credited = returned + bonus;
  if (credited > 0) res.add(cur, credited, { raw: true });
  if (cur === 'gold') {
    s.net += net;
    s.session.net += net;
  }
  if (net > 0) {
    track('casino_wins');
    if (cur === 'gold') {
      trackMax('gamble_biggest_win', net);
      if (net > s.biggestWin) s.biggestWin = net;
      if (net >= Math.max(1000, stake * 10)) s.lastBig = { kind: 'win', amount: net, game, luna: luna() };
    }
    bus.emit('casino:win', { game, amount: net, currency: cur });
  } else if (net < 0) {
    track('casino_losses');
    if (cur === 'gold') {
      trackMax('gamble_biggest_loss', -net);
      if (-net > s.biggestLoss) s.biggestLoss = -net;
      if (-net >= 1000) s.lastBig = { kind: 'loss', amount: -net, game, luna: luna() };
    }
    bus.emit('casino:loss', { game, amount: -net, currency: cur });
  }
  // Don Tiburcio never forgets a big night (society memory; greetings read the casino slice)
  if (cur === 'gold' && Math.abs(net) >= 5000) {
    try {
      remember('tiburcio', net > 0
        ? { kind: 'robado', text: `Me sacó ${Math.round(net).toLocaleString('es-ES')} de oro en ${GAME_NAMES[game]}`, where: 'puerto_fortuna', intensity: Math.min(9, 4 + Math.floor(net / 10000)) }
        : { kind: 'pagado', text: `Dejó ${Math.round(-net).toLocaleString('es-ES')} de oro en mi casino`, where: 'puerto_fortuna', intensity: 3 });
    } catch { /* society stub */ }
  }
  persist();
  return { net, bonus, credited, streak: s.streak, bonusPct, hotLabel };
}

/** Bet-size ladder scaled to what the player can afford (always includes the minimum). */
export function betLadder(base: number[], cur: Currency = 'gold'): number[] {
  const have = cur === 'gold' ? gold() : essence();
  const out = base.filter((b) => b <= Math.max(base[0], have));
  return out.length ? out : [base[0]];
}

/** Record a rival encounter in the casino slice (society memory is written by the caller). */
export function rivalMem(id: string, name: string): RivalMem {
  const s = cs();
  return (s.rivals[id] ??= { id, name, played: 0, beatYou: 0, lostToYou: 0, caught: 0, lastLuna: luna() });
}
