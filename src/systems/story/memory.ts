/**
 * Narrator memory — a tiny record kept apart from the saves ('lx.narrator'), so the voice remembers
 * even when the player wipes everything (RESEARCH §9.2). Never stores dates for display; timestamps are internal.
 */
export interface NarratorMem { v: 1; first: number; last: number; sessions: number; cycles: number; wipesSeen: number; scars: string[] }

const KEY = 'lx.narrator';

function blank(): NarratorMem { return { v: 1, first: Date.now(), last: Date.now(), sessions: 0, cycles: 0, wipesSeen: 0, scars: [] }; }

export function loadMem(): NarratorMem {
  try {
    const m = JSON.parse(localStorage.getItem(KEY) ?? 'null') as NarratorMem | null;
    if (m && m.v === 1) return { ...blank(), ...m };
  } catch { /* private mode */ }
  return blank();
}

export function saveMem(m: NarratorMem): void {
  try { localStorage.setItem(KEY, JSON.stringify(m)); } catch { /* quota */ }
}

/** Merge values into the memory (max for counters). */
export function remember(patch: Partial<Pick<NarratorMem, 'cycles' | 'sessions'>> & { scar?: string }): void {
  const m = loadMem();
  if (patch.cycles !== undefined) m.cycles = Math.max(m.cycles, patch.cycles);
  if (patch.sessions !== undefined) m.sessions = Math.max(m.sessions, patch.sessions);
  if (patch.scar && !m.scars.includes(patch.scar)) m.scars.push(patch.scar);
  m.last = Date.now();
  saveMem(m);
}

/**
 * True when the voice remembers finished cycles but the save says there were none — the player erased
 * everything. Returns the number of cycles the narrator remembers (0 = nothing to say).
 */
export function wipedMemory(metaCycles: number): number {
  const m = loadMem();
  return m.cycles > 0 && metaCycles === 0 ? m.cycles : 0;
}
