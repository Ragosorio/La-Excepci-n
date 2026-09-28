/**
 * "Te vi…" — the ending's monologue and montage, built from what the game actually watched (G.run.stats,
 * lifetime records, the story slice). Picks the 3–5 most notable things; always includes the hesitation line.
 */
import { G } from '../../core/state';
import { WATCHED, MONTAGE, ENDING } from '../../data/story';
import { st, abilityName, relicName, money, horaLocal } from '../../systems/story/state';

const MAJOR = ['eclipse', 'daga_solar', 'daga_lunar', 'libro_realidad', 'libro_aprendizaje'];

function playtimeText(sec: number): string | null {
  const m = Math.floor(sec / 60);
  if (m < 20) return null;
  if (m < 50) return 'casi una hora';
  if (m < 80) return 'más de una hora';
  if (m < 150) return 'casi dos horas';
  const h = Math.round(m / 60);
  return `más de ${h} horas`;
}

export function buildWatched(): string[] {
  const s = G.run?.stats ?? {};
  const rec = G.meta?.records ?? {};
  const n = (k: string) => s[k] ?? 0;
  const story = G.run ? st() : null;
  const out: Array<{ text: string; score: number; order: number }> = [];
  const add = (text: string, score: number, order: number) => out.push({ text, score, order });

  const deaths = n('deaths');
  add(deaths > 0 ? WATCHED.deaths(deaths) : WATCHED.noDeaths, deaths > 0 ? 40 + deaths * 5 : 28, 1);
  const night = Math.max(n('gamble_night_max'), 0);
  const gambled = n('gold_gambled');
  if (night >= 500) add(WATCHED.gambledNight(money(night)), 32 + Math.log10(night) * 6, 2);
  else if (gambled >= 500) add(WATCHED.gambled(money(gambled)), 26 + Math.log10(gambled) * 5, 2);
  const win = n('gamble_biggest_win') || rec.gamble_biggest_win || 0;
  if (win >= 1500) add(WATCHED.bigWin(money(win)), 24 + Math.log10(win) * 4, 3);
  const loss = n('gamble_biggest_loss');
  if (loss >= 1000) add(WATCHED.bigLoss(money(loss)), 27 + Math.log10(loss) * 4, 3);
  const minds = n('minds_dominated');
  if (minds > 0) add(WATCHED.minds(minds), 20 + Math.min(30, minds * 2), 4);
  const lost = n('units_lost');
  if (lost >= 5) add(WATCHED.unitsLost(lost), 22 + Math.min(30, lost), 5);
  const spared = n('spared'), executed = n('executed');
  if (spared > 0) add(WATCHED.spared(spared), 22 + Math.min(24, spared * 3), 6);
  if (executed > 0) add(WATCHED.executed(executed), 22 + Math.min(24, executed * 3), 6);
  const cheats = n('cheats');
  if (cheats > 0) add(WATCHED.cheats(cheats, n('cheats_caught')), 18 + Math.min(24, cheats * 2), 7);
  if (n('idle_long') > 0) add(WATCHED.idle(n('idle_long')), 34, 8);
  if (n('reloads_mid_battle') > 0) add(WATCHED.reloads, 46, 8);
  const sac = n('sacrifices');
  if (sac > 1) add(WATCHED.sacrifices(sac - 1), 26, 9);
  const cycles = G.meta?.cyclesCompleted ?? 0;
  if (cycles >= 1) add(WATCHED.cycles(cycles), 52 + cycles * 4, 0);
  if (story?.nemesesKilled.length) add(WATCHED.nemesis(story.nemesesKilled[story.nemesesKilled.length - 1]), 26, 5);
  if (story?.killedBy.length) add(WATCHED.killedBy(story.killedBy[0]), 29, 5);
  const pt = playtimeText(story?.playSeconds ?? G.run?.playTime ?? 0);
  if (pt) add(WATCHED.playtime(pt), 24, 10);

  const hesitated = !!story?.hesitated || n('hesitations') > 0;
  const hes = { text: hesitated ? WATCHED.hesitated : WATCHED.noHesitation, score: 999, order: 11 };
  const top = out.sort((a, b) => b.score - a.score).slice(0, 3);
  top.push(hes);
  top.sort((a, b) => a.order - b.order);
  const lines = top.map((x) => x.text);
  lines.push(`${horaLocal(true)}, por cierto.`);
  lines.push(ENDING.afterthought);
  return lines;
}

export function buildMontage(): string[] {
  const cards: string[] = [MONTAGE.forest, MONTAGE.death, MONTAGE.crater];
  if (!G.run) return [...cards, MONTAGE.name];
  const story = st();
  if (story.firstCopy) cards.push(MONTAGE.firstCopy(abilityName(story.firstCopy)));
  for (const nm of story.nemesesKilled.slice(-2)) cards.push(MONTAGE.nemesis(nm));
  const relics = [...G.run.player.relics].sort((a, b) => Number(MAJOR.includes(b.id)) - Number(MAJOR.includes(a.id)));
  for (const r of relics.slice(0, 2)) cards.push(MONTAGE.relic(relicName(r.id)));
  if (story.biggestBet >= 500) cards.push(MONTAGE.bet(money(story.biggestBet)));
  const rv = G.run.stats.revivals ?? 0;
  if (rv > 0) cards.push(MONTAGE.revivals(rv));
  cards.push(MONTAGE.name);
  return cards;
}
