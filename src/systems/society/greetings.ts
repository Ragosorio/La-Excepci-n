/**
 * Line selection (Hades-style priority tiers, research §1.1): loyalty → strong memory → cycle echo →
 * strong feeling → hand-written NPC lines → content greetings → traits/title. Plus "¿Qué año es?" and rumors.
 */
import { G } from '../../core/state';
import { recentNews } from '../../core/news';
import { track } from '../../core/tracker';
import { rng } from '../../core/rng';
import type { NpcMemory, RaceId } from '../../data/types';
import { NPC_LINES } from './lines_npc';
import {
  ECO_GREETINGS, FEELING_GREETINGS, LOYAL_GREETINGS, MEMORY_GREETINGS, NO_RUMORS, RUMOR_WRAP, RUMOR_WRAP_DUENDE,
  TITLE_GREETINGS, TRAIT_GREETINGS, YEAR_AGAIN, YEAR_ANSWERS, YEAR_BY_RACE, YEAR_CHILD, YEAR_CYCLE,
} from './lines_common';
import { npcDef, npcState, npcView, topMemory } from './memory';
import { nemesisTaunt } from './nemesis';
import { luna, playerName, shortPlace, soc, worldEpithet } from './state';

const pick = <T,>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)];

export function fillTokens(t: string, m?: NpcMemory): string {
  let detail = 'alguien';
  if (m) {
    const match = m.text.match(/a ([^,]+?) en /) ?? m.text.match(/a ([^,]+)$/);
    if (match) detail = match[1];
  }
  return t
    .replace(/\{where\}/g, shortPlace(m?.where))
    .replace(/\{detail\}/g, detail)
    .replace(/\{memory\}/g, m?.text ?? 'algo que no pasó')
    .replace(/\{epithet\}/g, worldEpithet())
    .replace(/\{name\}/g, playerName());
}

/** Memory-, trait- and voice-aware opener for any NPC (canonical, generated or 'townsfolk:<loc>'). */
export function npcGreeting(npcId: string): string {
  if (!G.run) return '…';
  const st = npcState(npcId);
  const v = npcView(npcId);
  if (!st || !v) return '…';
  if (!st.alive) return '(No hay respuesta. Solo silencio.)';
  const lines = NPC_LINES[npcId];
  const talked = soc().talked[npcId] ?? 0;
  if (st.loyal) return pick(lines?.loyal ?? LOYAL_GREETINGS);
  if (st.generated && !v.canonical && soc().nemesis[npcId]) return nemesisTaunt(npcId);
  const m = topMemory(npcId, Object.keys(MEMORY_GREETINGS));
  if (m && m.intensity >= 6 && luna() - m.luna <= 24 && rng.chance(0.75)) return fillTokens(pick(MEMORY_GREETINGS[m.kind]), m);
  const eco = st.memories.find((x) => x.kind === 'eco');
  if (eco && G.run.cycle >= 2 && talked === 0) return fillTokens(pick(lines?.cycle ?? ECO_GREETINGS), eco);
  const f = st.feelings;
  if (f.miedo >= 60 && f.miedo >= f.odio) return pick(FEELING_GREETINGS.miedo);
  if (f.odio >= 60) return pick(FEELING_GREETINGS.odio);
  if (f.respeto >= 60) return pick(FEELING_GREETINGS.respeto);
  if (f.deuda >= 50) return pick(FEELING_GREETINGS.deuda);
  if (lines) {
    const content = npcDef(npcId)?.greeting ?? [];
    const base = talked === 0 && !st.met ? pick(lines.first) : pick([...lines.again, ...content]);
    if (talked > 0 && G.run.player.titleIndex >= 2 && rng.chance(0.25)) return `${pick(TITLE_GREETINGS[G.run.player.titleIndex])} ${base}`;
    return base;
  }
  const d = npcDef(npcId);
  if (d?.greeting?.length && (talked === 0 || rng.chance(0.5))) return fillTokens(pick(d.greeting));
  const tr = v.traits.flatMap((t) => TRAIT_GREETINGS[t] ?? []);
  if (tr.length && rng.chance(0.6)) return pick(tr);
  return pick(TITLE_GREETINGS[Math.max(0, Math.min(5, G.run.player.titleIndex))]);
}

/** "¿Qué año es?" — ≥15 variants, voices by race, cycle 2+ déjà vu, repeated-question annoyance. */
export function yearAnswer(npcId?: string): string {
  track('year_asked');
  if (!npcId || !G.run) return pick(YEAR_ANSWERS);
  const s = soc();
  const asked = s.asked[npcId] ?? 0;
  s.asked[npcId] = asked + 1;
  if (asked >= 1 && rng.chance(0.55)) return pick(YEAR_AGAIN);
  const lines = NPC_LINES[npcId];
  const st = G.run.npcs[npcId];
  const hasEco = !!st?.memories.some((m) => m.kind === 'eco');
  if (G.run.cycle >= 2 && (hasEco || rng.chance(0.2))) return pick(lines?.cycle && rng.chance(0.5) ? lines.cycle : YEAR_CYCLE);
  if (lines?.year && rng.chance(0.75)) return pick(lines.year);
  const v = npcView(npcId);
  return yearFor(v?.race ?? 'humano', v?.age === 'child');
}

export function yearFor(race: RaceId, child = false): string {
  if (child) return pick(YEAR_CHILD);
  const byRace = YEAR_BY_RACE[race];
  if (byRace && rng.chance(0.55)) return pick(byRace);
  if (G.run && G.run.cycle >= 2 && rng.chance(0.12)) return pick(YEAR_CYCLE);
  return pick(YEAR_ANSWERS);
}

/** A recent piece of news retold by an NPC ("Dicen que..."). `seen` avoids repeats within a conversation. */
export function rumorLine(opts: { duende?: boolean; intro?: string[]; seen?: Set<string> } = {}): string {
  const news = recentNews(14).filter((n) => !opts.seen?.has(n.text));
  if (!news.length) return pick(NO_RUMORS);
  const weighted = news.map((n, i) => ({ n, w: (n.important ? 3 : 1) * (1 / (1 + i * 0.3)) }));
  let r = Math.random() * weighted.reduce((a, b) => a + b.w, 0);
  let item = weighted[0].n;
  for (const x of weighted) { r -= x.w; if (r <= 0) { item = x.n; break; } }
  opts.seen?.add(item.text);
  const rumor = item.text.charAt(0).toLowerCase() + item.text.slice(1);
  if (opts.intro?.length && rng.chance(0.6)) return `${pick(opts.intro)} ${item.text}`;
  return pick(opts.duende ? RUMOR_WRAP_DUENDE : RUMOR_WRAP).replace('{rumor}', rumor);
}
