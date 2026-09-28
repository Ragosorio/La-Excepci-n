/**
 * "Siempre estuve viéndote" — local-only player statistics.
 * Every module should call track() on notable player behavior. The narrator and the ending read these.
 *
 * Known keys (add freely, keep snake_case):
 *   deaths, revivals, battles_won, battles_lost, units_lost, units_recruited, enemies_killed, knockbacks,
 *   minds_dominated, invisible_seconds, abilities_copied, relics_found, gold_earned, gold_spent,
 *   gold_gambled, casino_wins, casino_losses, cheats, cheats_caught, spared, executed, bribes, blackmails,
 *   assassinations, terror_acts, caravans_robbed, sacrifices, hesitations, idle_long, council_votes_won,
 *   lunas, gamble_biggest_win (record), gamble_biggest_loss (record), gamble_night_max (record)
 */
import { G } from './state';

export function track(key: string, amount = 1): void {
  if (G.run) G.run.stats[key] = (G.run.stats[key] ?? 0) + amount;
  if (G.meta) G.meta.stats[key] = (G.meta.stats[key] ?? 0) + amount;
}

/** Keeps the maximum value seen (run + lifetime records). */
export function trackMax(key: string, value: number): void {
  if (G.run) G.run.stats[key] = Math.max(G.run.stats[key] ?? -Infinity, value);
  if (G.meta) G.meta.records[key] = Math.max(G.meta.records[key] ?? -Infinity, value);
}

export function stat(key: string, scope: 'run' | 'meta' = 'run'): number {
  return scope === 'run' ? G.run?.stats[key] ?? 0 : G.meta?.stats[key] ?? 0;
}
