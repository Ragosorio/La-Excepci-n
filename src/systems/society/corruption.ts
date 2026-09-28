/**
 * Corruption (GDD §3.3, §4.1): each continent falls through four paths (Conquista / Intriga / Codicia / Terror)
 * weighted by its per-cycle multipliers. At 100% the continent is corrupted: its seat in the Concilio becomes
 * Elias's, its towns slowly raise the eclipse banner, and his name changes.
 */
import { G, TITLES, refreshTitle } from '../../core/state';
import { bus } from '../../core/events';
import { addNews } from '../../core/news';
import { track } from '../../core/tracker';
import { engine } from '../../core/engine';
import { rng } from '../../core/rng';
import { CONTINENTS, CONTINENT_IDS, LOCATION_LIST } from '../../data/world';
import type { ContinentId, CorruptionPath, FactionId, NarratorLine } from '../../data/types';
import { banner, toast } from '../../ui/toasts';
import { h, layer, wait } from '../../ui/dom';
import { crest } from './icons';
import { audio } from '../../audio';
import { PATHS, PATH_NAMES, ensureContinent, ensureLocation, luna, round1, soc } from './state';

const FALL_SUBS: Record<string, string> = {
  valdoria: 'La Corona se inclina. Nadie recuerda haber decidido hacerlo.',
  sylvaria: 'El Bosque que Recuerda ahora recuerda otra cosa.',
  kharaz: 'La Montaña Hueca resuena con un nombre nuevo.',
  morvenna: 'El crepúsculo se quedó. Ya no amanece igual.',
  islas: 'Donde todo tiene precio, alguien pagó por todo.',
};

export const NAME_SUBS = [
  '',
  'El mundo ya no dice su nombre. Dice lo que es: «la cosa que no muere».',
  'Ninguna ley lo sostiene. Ninguna ley lo detiene.',
  'Hay aldeas donde ya no se pronuncia.',
  'Los dioses y los sabios lo nombran con cuidado.',
  'Esto se está acercando demasiado a Él.',
];

/** Name-change narration (the story module plays these; exported for reuse). */
export const NAME_NARRATION: NarratorLine[] = [
  { third: '' },
  { third: 'Aquella luna, el mundo dejó de llamarlo Elias Veyr.', first: 'Aquella luna, el mundo dejó de llamarme Elias Veyr.' },
  { third: 'Las leyes siguieron escritas. Simplemente dejaron de aplicarse a él.', first: 'Las leyes siguieron escritas. Simplemente dejaron de aplicarse a mí.' },
  { third: 'Le quitaron el nombre de pila, como se le quita el filo a una historia que asusta.', first: 'Me quitaron el nombre de pila, como se le quita el filo a una historia que asusta.' },
  { third: 'Ya no era un hombre. Era una medida: todo se contaba a partir de él.', first: 'Ya no era un hombre. Era una medida: todo se contaba a partir de mí.', direct: 'Todo se mide a partir de mí. Tú también.' },
  { third: 'Él.', first: 'Yo.' },
];

/** The path this continent is weakest to (highest multiplier). */
export function bestPath(c: ContinentId): CorruptionPath {
  const pm = ensureContinent(c).pathMult;
  return PATHS.reduce((a, b) => (pm[b] > pm[a] ? b : a), PATHS[0]);
}

/** Temporary global multipliers from Concilio resolutions & rewrites. */
function flagMult(path: CorruptionPath): number {
  const f = G.run.flags;
  const l = luna();
  let m = 1;
  if (path === 'codicia' && Number(f.free_trade_until ?? -1) > l) m *= 1.2;
  if (path === 'intriga' && f.elias_custodio) m *= 1.25;
  if (path === 'terror' && Number(f.reconstruction_until ?? -1) > l) m *= 0.8;
  return m;
}

/**
 * Adds corruption through a path. `amount` is in raw points before the continent multiplier.
 * Returns the effective corruption added (can be negative for sacrifices).
 */
export function addCorruption(c: ContinentId, path: CorruptionPath, amount: number, reason?: string): number {
  if (!G.run || !amount || c === 'concordia' || !CONTINENTS[c]) return 0;
  const st = ensureContinent(c);
  if (amount < 0) {
    // Sacrifices / reconstruction: remove proportionally from the chosen path first, then the rest.
    let left = -amount;
    const order: CorruptionPath[] = [path, ...PATHS.filter((p) => p !== path)];
    for (const p of order) {
      const take = Math.min(st.paths[p], left);
      st.paths[p] = round1(st.paths[p] - take);
      left -= take;
      if (left <= 0) break;
    }
    const before = st.corruption;
    st.corruption = st.corrupted ? 100 : Math.min(100, round1(PATHS.reduce((s, p) => s + st.paths[p], 0)));
    const d = round1(st.corruption - before);
    if (d) bus.emit('corruption:change', { continent: c, path, delta: d, value: st.corruption });
    return d;
  }
  if (st.corrupted) return 0;
  const weak = st.weaknessKnown && bestPath(c) === path ? 1.15 : 1;
  let eff = amount * (st.pathMult[path] ?? 1) * weak * flagMult(path);
  eff = Math.min(eff, 100 - st.corruption);
  if (eff <= 0) return 0;
  eff = round1(eff);
  st.paths[path] = round1(st.paths[path] + eff);
  st.corruption = Math.min(100, round1(st.corruption + eff));
  bus.emit('corruption:change', { continent: c, path, delta: eff, value: st.corruption });
  track('corruption_points', eff);
  thresholdToasts(c, st.corruption);
  if (st.corruption >= 99.95) onCorrupted(c, reason);
  return eff;
}

function thresholdToasts(c: ContinentId, v: number): void {
  const s = soc();
  if (v >= 99.95) { s.corruptionMarks[c] = 100; return; }   // the fall itself is the moment
  const mark = s.corruptionMarks[c] ?? 0;
  const hit = [75, 50, 25].find((t) => v >= t && mark < t);
  if (!hit) return;
  s.corruptionMarks[c] = hit;
  const name = CONTINENTS[c].name;
  const lines: Record<number, string> = {
    25: `${name}: <b>25%</b> corrupta. Algo cambió en cómo te miran.`,
    50: `${name}: <b>50%</b> corrupta. Las campanas suenan distinto.`,
    75: `${name}: <b>75%</b> corrupta. Ya nadie se atreve a decir tu nombre en voz alta.`,
  };
  toast(lines[hit], { kind: 'epica' });
  audio.sfx('eclipse', { volume: 0.5 });
  if (hit >= 50) addNews(`${name} se tambalea. Los viejos dicen que el aire huele a tinta.`, 'excepcion');
}

function onCorrupted(c: ContinentId, reason?: string): void {
  const st = ensureContinent(c);
  st.corruption = 100;
  st.corrupted = true;
  st.corruptedAt = luna();
  const before = G.run.player.titleIndex;
  bus.emit('continent:corrupted', { continent: c });
  refreshTitle();
  const after = G.run.player.titleIndex;
  track('continents_corrupted');
  const def = CONTINENTS[c];
  const dominant = PATHS.reduce((a, b) => (st.paths[b] > st.paths[a] ? b : a), PATHS[0]);
  const how: Record<CorruptionPath, string> = {
    conquista: 'a fuerza de asedios', intriga: 'sin que nadie viera cómo', codicia: 'comprada moneda a moneda', terror: 'a punta de miedo',
  };
  addNews(`${def.name} ha caído ante ${G.run.player.name}, ${how[dominant]}.${reason ? ' ' + reason : ''}`, 'excepcion', true);
  // The capital raises the eclipse at once; the rest follows luna by luna.
  const capital = LOCATION_LIST.find((l) => l.continent === c && l.kind === 'capital');
  if (capital) setControl(capital.id, 'excepcion');
  void corruptionMoment(c, after !== before ? after : -1);
}

/**
 * The fall: a crest stained with violet ink at the top of the screen (so it never collides with other modules'
 * centered banners, e.g. progression's racial "Herencia"), then — if his name changed — the big 'name' banner.
 * (The story module narrates the name change; we don't duplicate the narrator line.)
 */
async function corruptionMoment(c: ContinentId, newTitle: number): Promise<void> {
  try {
    audio.stinger('corruption_complete');
    engine.pipeline?.flash('#9b5cff', 0.45, 0.8);
    engine.pipeline?.chromaticPulse(1, 0.9);
    fallSeal(c);
    if (newTitle > 0) {
      await wait(3900);
      audio.stinger('name_change');
      engine.pipeline?.impact(2, 1);
      await banner(TITLES[newTitle], NAME_SUBS[newTitle] ?? '', { kind: 'name', duration: 3.8 });
    }
  } catch (err) { console.warn('[society] corruption moment', err); }
}

function fallSeal(c: ContinentId): void {
  const el = h('div', { class: 'soc-fall' },
    h('div', { class: 'soc-fall-crest', html: crest(c, 110) }, h('div', { class: 'soc-fall-ink' })),
    h('div', { class: 'soc-fall-title' }, `${CONTINENTS[c].name.toUpperCase()} HA CAÍDO`),
    h('div', { class: 'soc-fall-sub' }, FALL_SUBS[c] ?? ''));
  layer('cutin').appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 700); }, 3600);
}

/** Changes who controls a location (emits location:control). */
export function setControl(id: string, to: FactionId): void {
  const loc = ensureLocation(id);
  if (!loc || loc.control === to) return;
  const from = loc.control;
  loc.control = to;
  if (to === 'excepcion') loc.loyalty = Math.max(loc.loyalty, 30);
  bus.emit('location:control', { id, from, to });
}

/** Per-luna: corrupted continents raise the eclipse town by town; half-corrupted ones lose faith. */
export function corruptionLunaTick(): void {
  for (const c of CONTINENT_IDS) {
    const st = G.run.continents[c];
    if (!st) continue;
    const locs = LOCATION_LIST.filter((l) => l.continent === c && l.kind !== 'ruina' && l.kind !== 'santuario');
    if (st.corrupted) {
      let flipped = 0;
      const candidates = locs.map((l) => ensureLocation(l.id)!).filter((l) => l && l.control !== 'excepcion')
        .sort((a, b) => a.loyalty - b.loyalty);
      for (const loc of candidates) {
        loc.loyalty = Math.max(0, loc.loyalty - 12);
        loc.fear = Math.min(100, loc.fear + 3);
        if (flipped < 1 && (loc.loyalty < 35 || rng.chance(0.35))) {
          setControl(loc.id, 'excepcion');
          flipped++;
          const name = LOCATION_LIST.find((l) => l.id === loc.id)?.name ?? loc.id;
          addNews(rng.pick([
            `${name} iza el estandarte del eclipse. Nadie recuerda quién lo cosió.`,
            `En ${name} cambiaron la bandera de noche. Por la mañana, todos fingieron que siempre había sido así.`,
            `${name} ya no responde a su antiguo señor. Responde a un nombre que no dice.`,
          ]), 'excepcion');
        }
      }
    } else if (st.corruption >= 50) {
      for (const l of locs) {
        const loc = ensureLocation(l.id);
        if (loc && loc.control !== 'excepcion') loc.loyalty = Math.max(0, loc.loyalty - 1);
      }
    }
  }
}

/** Snapshot for UIs (HUD tooltips, Sedas revelation card). */
export function corruptionInfo(c: ContinentId): { value: number; corrupted: boolean; paths: Record<CorruptionPath, number>; mult: Record<CorruptionPath, number>; weaknessKnown: boolean; best: CorruptionPath; bestName: string } {
  const st = ensureContinent(c);
  const best = bestPath(c);
  return { value: st.corruption, corrupted: st.corrupted, paths: { ...st.paths }, mult: { ...st.pathMult }, weaknessKnown: st.weaknessKnown, best, bestName: PATH_NAMES[best] };
}
