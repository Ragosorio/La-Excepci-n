/**
 * La Voz — the narrator. Third person early; slips into first person as Elias takes over the story;
 * after the ending (name sacrificed) it is always first person, and sometimes it addresses the player directly.
 *
 *   await narrate({ third: '{name} caminó hacia el norte.', first: 'Caminé hacia el norte.' });
 *   narrate('Siempre estuve viéndote.', { position: 'center', hold: 4 });
 */
import { h, layer, wait } from './dom';
import type { NarratorLine } from '../data/types';
import { G } from '../core/state';
import { bus } from '../core/events';
import { audio } from '../audio';

export type Person = 'third' | 'first' | 'direct';

/** Probability that the narrator uses first person right now. */
export function firstPersonChance(): number {
  const r = G.run;
  if (!r) return 0;
  if (r.player.nameSacrificed || r.fragment === 'el') return 1;
  const cycle = r.cycle;
  const base = cycle <= 1 ? 0 : cycle === 2 ? 0.12 : cycle === 3 ? 0.25 : 0.4;
  return Math.min(0.6, base + r.player.titleIndex * 0.04 * (cycle > 1 ? 1 : 0.5));
}

export function pickPerson(line: NarratorLine): Person {
  if (line.direct && G.run && G.run.cycle >= 3 && Math.random() < 0.15) return 'direct';
  if (line.first && Math.random() < firstPersonChance()) return 'first';
  return 'third';
}

export function resolveLine(line: string | NarratorLine, person?: Person): { text: string; person: Person } {
  if (typeof line === 'string') return { text: fillName(line), person: 'third' };
  const p = person ?? pickPerson(line);
  const raw = p === 'direct' ? line.direct! : p === 'first' ? line.first! : line.third;
  return { text: fillName(raw), person: p };
}

function fillName(t: string): string {
  const name = G.run?.player?.name ?? 'Elias Veyr';
  const short = name === 'Elias Veyr' ? 'Elias' : name;
  return t.replace(/\{name\}/g, short).replace(/\{Name\}/g, short).replace(/\{fullname\}/g, name);
}

let queue: Promise<void> = Promise.resolve();

export interface NarrateOpts { position?: 'bottom' | 'center' | 'top'; hold?: number; person?: Person; sound?: boolean; immediate?: boolean }

/** Queue a narrator line. Resolves when it has faded out. */
export function narrate(line: string | NarratorLine, opts: NarrateOpts = {}): Promise<void> {
  const run = async () => {
    const { text, person } = resolveLine(line, opts.person);
    bus.emit('narrator:line', { text });
    const el = h('div', { class: `lx-narr ${opts.position ?? 'bottom'} ${person}` }, text);
    layer('narrator').appendChild(el);
    if (opts.sound !== false) audio.sfx('narrator', { volume: 0.5 });
    await wait(30);
    el.classList.add('in');
    const hold = opts.hold ?? Math.max(2.6, text.length * 0.055);
    await wait(hold * 1000 + 1200);
    el.classList.remove('in');
    await wait(1200);
    el.remove();
  };
  if (opts.immediate) return run();
  queue = queue.then(run, run);
  return queue;
}

export function clearNarrator(): void {
  layer('narrator').innerHTML = '';
  queue = Promise.resolve();
}
