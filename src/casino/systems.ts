/**
 * Module-level casino listeners (active outside the casino scene too):
 * - luna:tick → the progressive jackpot grows, suspicion cools down, expired hot tables clear.
 * - continent:corrupted → chaos in the world swells the jackpot (+ news).
 * - battle:end (arena) → records the winner of a pending arena bet (backup for onResult).
 */
import { bus } from '../core/events';
import { G } from '../core/state';
import { addNews } from '../core/news';
import { fmt } from '../core/math';
import { CONTINENTS } from '../data/world';
import { cs } from './state';

bus.on('luna:tick', () => {
  if (!G.run) return;
  const s = cs();
  s.jackpot = Math.round(s.jackpot + 150 + s.jackpot * 0.008);
  s.suspicion = Math.max(0, s.suspicion - 20);
  if (s.hot && Date.now() > s.hot.until) s.hot = null;
  if (s.bannedUntil >= 0 && G.run.luna >= s.bannedUntil) s.bannedUntil = -1;
});

bus.on('continent:corrupted', (e) => {
  if (!G.run) return;
  const s = cs();
  s.jackpot += 4000;
  addNews(`La caída de ${CONTINENTS[e.continent]?.name ?? 'un continente'} desató las apuestas: el bote del Gran Casino sube a ${fmt(s.jackpot)} de oro.`, 'casino');
});

bus.on('battle:end', (e) => {
  if (!G.run || e.setup.kind !== 'arena') return;
  const params = e.setup.returnTo?.params as { settle?: string } | undefined;
  const id = params?.settle;
  if (!id) return;
  const bet = cs().arenaBets[id];
  if (!bet || bet.status !== 'pending') return;
  bet.winner = e.result.winnerSide ?? (e.result.victory ? 'A' : 'B');
  bet.status = 'resolved';
});
