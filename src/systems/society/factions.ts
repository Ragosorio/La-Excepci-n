/**
 * Factions & reputation (GDD §3.4). G.run.reputation holds −100..100 per faction, mapped to 8 WoW-style tiers.
 * Positive gains shrink in the upper tiers so Reverenciado/Exaltado feel earned (research §7.2).
 */
import { G, type RunState } from '../../core/state';
import { bus } from '../../core/events';
import { makeRng } from '../../core/rng';
import { CONTINENTS, GUILDS } from '../../data/world';
import type { ContinentId, FactionId, GuildId } from '../../data/types';
import { toast } from '../../ui/toasts';
import { audio } from '../../audio';

export interface RepTier { id: string; name: string; color: string; min: number; index: number }

export const REP_TIERS: RepTier[] = [
  { id: 'odiado', name: 'Odiado', color: '#b3122e', min: -100, index: 0 },
  { id: 'hostil', name: 'Hostil', color: '#ff4a4a', min: -75, index: 1 },
  { id: 'antipatico', name: 'Antipático', color: '#ff8c3a', min: -40, index: 2 },
  { id: 'neutral', name: 'Neutral', color: '#ffd84a', min: -10, index: 3 },
  { id: 'amistoso', name: 'Amistoso', color: '#7ad14a', min: 15, index: 4 },
  { id: 'honorable', name: 'Honorable', color: '#3fd49a', min: 40, index: 5 },
  { id: 'reverenciado', name: 'Reverenciado', color: '#4fc8ff', min: 65, index: 6 },
  { id: 'exaltado', name: 'Exaltado', color: '#f5d99a', min: 90, index: 7 },
];

export const GUILD_IDS: GuildId[] = ['juramentados', 'orden_alba', 'banca', 'aquelarre', 'academia', 'sedas', 'ceniza', 'yunque'];
export const REP_FACTIONS: FactionId[] = ['valdoria', 'sylvaria', 'kharaz', 'morvenna', 'islas', 'concordia', 'concilio', ...GUILD_IDS];

export function tierOf(v: number): RepTier {
  for (let i = REP_TIERS.length - 1; i >= 0; i--) if (v >= REP_TIERS[i].min) return REP_TIERS[i];
  return REP_TIERS[0];
}

export function factionName(f: FactionId): string {
  if (f === 'concilio') return 'El Concilio de los Cinco';
  if (f === 'excepcion') return 'La Excepción';
  const c = CONTINENTS[f as ContinentId];
  if (c) return c.name;
  const g = GUILDS[f as GuildId];
  return g ? g.name : String(f);
}

export function factionColor(f: FactionId): string {
  if (f === 'concilio') return '#f3ead8';
  if (f === 'excepcion') return '#9b5cff';
  const c = CONTINENTS[f as ContinentId];
  if (c) return c.palette.accent;
  return GUILDS[f as GuildId]?.color ?? '#c8c8c8';
}

export function isGuild(f: FactionId): f is GuildId { return (GUILD_IDS as string[]).includes(f); }

export function repValue(f: FactionId): number {
  return G.run?.reputation?.[f] ?? 0;
}

export function repTier(f: FactionId): { id: string; name: string; color: string } {
  const t = tierOf(repValue(f));
  return { id: t.id, name: t.name, color: t.color };
}

/** Buy-price multiplier from reputation (Amistoso −5% … Exaltado −20%; Hostil +15%, Odiado +30%). */
export function repPriceMult(f: FactionId): number {
  const i = tierOf(repValue(f)).index;
  return [1.3, 1.15, 1.06, 1, 0.95, 0.9, 0.85, 0.8][i];
}

/** Changes reputation; positive gains shrink per tier above Neutral. Toasts on tier change. */
export function changeRep(f: FactionId, delta: number, opts: { silent?: boolean } = {}): void {
  if (!G.run || !delta || f === 'excepcion') return;
  const rep = G.run.reputation;
  const cur = rep[f] ?? 0;
  const before = tierOf(cur);
  let d = delta;
  if (d > 0) d *= Math.max(0.35, 1 - 0.12 * Math.max(0, before.index - 3));
  const next = Math.max(-100, Math.min(100, Math.round((cur + d) * 10) / 10));
  if (next === cur) return;
  rep[f] = next;
  const after = tierOf(next);
  bus.emit('rep:change', { faction: f, value: next, delta: next - cur, tier: after.name, prevTier: before.name });
  if (after.id !== before.id && !opts.silent) {
    const up = after.index > before.index;
    toast(`${factionName(f)}: ahora eres <b style="color:${after.color}">${after.name}</b>`, { kind: up ? 'good' : 'bad' });
    audio.sfx(up ? 'buff' : 'debuff', { volume: 0.6 });
  }
}

/** Apply the same change to a continent and (scaled) to its guilds. */
export function changeRepContinent(c: ContinentId, delta: number, guildShare = 0.5): void {
  changeRep(c, delta);
  if (!guildShare) return;
  for (const g of CONTINENTS[c]?.guilds ?? []) changeRep(g, delta * guildShare, { silent: true });
}

/** Initial standings: the world barely knows Elias; the Orden del Alba hates him by nature. */
export function initReputation(run: RunState): void {
  const rng = makeRng(`${run.seed}:rep`);
  const base: Partial<Record<FactionId, number>> = {
    valdoria: -6, sylvaria: -2, kharaz: 0, morvenna: 6, islas: 10, concordia: -8, concilio: -15,
    juramentados: -12, orden_alba: -28, banca: 12, aquelarre: 6, academia: 2, sedas: 3, ceniza: 8, yunque: 0,
  };
  for (const f of REP_FACTIONS) {
    if (run.reputation[f] !== undefined) continue;
    run.reputation[f] = Math.round((base[f] ?? 0) + rng.range(-4, 4));
  }
}
