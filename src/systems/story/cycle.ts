/**
 * Cycles: the end of a cycle (bookkeeping + Tinta tally) and the start of the next one.
 * Flow: ending → 'cycle:end' → credits → 'margins' → "Comenzar el Ciclo N" → newRun → prologue.
 */
import { G, newRun } from '../../core/state';
import { saveMeta, saveRun, clearRun } from '../../core/save';
import { bus } from '../../core/events';
import { engine } from '../../core/engine';
import { st, corruptedCount, ownsRelic, hasRunState } from './state';
import { remember } from './memory';

export interface TallyRow { label: string; detail?: string; ink: number }
export interface Tally { cycle: number; ending: 'el' | 'sello' | 'abandon'; rows: TallyRow[]; total: number }

const MAJOR = ['daga_solar', 'daga_lunar', 'eclipse', 'libro_realidad', 'libro_aprendizaje'];

function computeTally(ending: 'el' | 'sello'): Tally {
  const rows: TallyRow[] = [];
  const cycle = G.run?.cycle ?? G.meta.currentCycle;
  if (hasRunState()) {
    const p = G.run.player;
    const cc = corruptedCount();
    if (cc) rows.push({ label: 'Continentes corrompidos', detail: `× ${cc}`, ink: cc * 12 });
    const majors = MAJOR.filter((id) => ownsRelic(id)).length;
    if (majors) rows.push({ label: 'Reliquias mayores', detail: `× ${majors}`, ink: majors * 8 });
    const minors = p.relics.filter((r) => !MAJOR.includes(r.id)).length;
    if (minors) rows.push({ label: 'Otras reliquias', detail: `× ${minors}`, ink: Math.min(20, minors * 2) });
    const copied = Object.values(p.codex ?? {}).filter((c) => c.acquired).length;
    if (copied) rows.push({ label: 'Excepciones', detail: `× ${copied}`, ink: Math.min(40, copied) });
    const s = st();
    if (s.achThisRun.length) rows.push({ label: 'Hazañas de este ciclo', detail: `× ${s.achThisRun.length}`, ink: s.achThisRun.length * 3 });
    if (s.pagesFound.length) rows.push({ label: 'Páginas encontradas', detail: `× ${s.pagesFound.length}`, ink: s.pagesFound.length * 2 });
  }
  rows.push(ending === 'el'
    ? { label: 'Final', detail: 'Él', ink: 40 }
    : { label: 'Final', detail: 'El Sello', ink: 15 });
  rows.push({ label: 'Ciclo', detail: `${cycle}`, ink: 5 * cycle });
  let total = rows.reduce((a, r) => a + r.ink, 0);
  if (total < 10) { rows.push({ label: 'Tinta mínima', ink: 10 - total }); total = 10; }
  return { cycle, ending, rows, total };
}

/**
 * Ends the current cycle: emits 'cycle:end', records the ending, merges the codex into the Ecos pool,
 * grants the Tinta (stored so the margins screen can animate it) and clears the run save.
 */
export function endCycle(ending: 'el' | 'sello'): Tally {
  const tally = computeTally(ending);
  const cycle = tally.cycle;
  if (G.meta.flags.st_last_ended_cycle === cycle && G.meta.flags.st_last_ended_seed === (G.run?.seed ?? 0)) {
    // already ended (e.g. double call) — just return the stored tally
    return pendingTally() ?? tally;
  }
  bus.emit('cycle:end', { ending, cycle });
  G.meta.cyclesCompleted += 1;
  G.meta.endings.push(ending);
  if (hasRunState()) {
    const known = new Set(G.meta.echoesKnown);
    for (const c of Object.values(G.run.player.codex ?? {})) if (c.acquired) known.add(c.id);
    G.meta.echoesKnown = [...known];
  }
  G.meta.ink += tally.total;
  G.meta.inkTotal += tally.total;
  G.meta.flags.st_tally = JSON.stringify(tally);
  G.meta.flags.st_tally_shown = false;
  G.meta.flags.st_last_ended_cycle = cycle;
  G.meta.flags.st_last_ended_seed = G.run?.seed ?? 0;
  remember({ cycles: G.meta.cyclesCompleted });
  clearRun();
  saveMeta();
  return tally;
}

export function pendingTally(): Tally | null {
  const raw = G.meta?.flags.st_tally;
  if (typeof raw !== 'string') return null;
  try { return JSON.parse(raw) as Tally; } catch { return null; }
}

/** "Comenzar el Ciclo N": new run for the next cycle, then the prologue (skippable from cycle 2). */
export async function startNextCycle(): Promise<void> {
  G.meta.currentCycle = G.meta.cyclesCompleted + 1;
  G.meta.flags.st_tally_shown = true;
  clearRun();
  newRun();
  saveRun(true);
  saveMeta();
  await engine.goto('prologue', { mode: 'boy' }, { fade: 1.2 });
}

/** First "Nueva partida" (no completed cycles): fresh run straight into the prologue. */
export async function startFirstRun(): Promise<void> {
  G.meta.currentCycle = Math.max(1, G.meta.cyclesCompleted + 1);
  clearRun();
  newRun();
  saveRun(true);
  await engine.goto('prologue', { mode: 'boy' }, { fade: 1.2 });
}
