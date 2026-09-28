/**
 * Aurel's arc across "La regla": he learns Elias lives (1st corrupted continent), then hunts him (2nd).
 * From cycle 3 he starts to remember. Exposes lines for encounters (world/battle may call aurelLine()).
 */
import { G } from '../../core/state';
import { bus } from '../../core/events';
import { engine } from '../../core/engine';
import { addNews } from '../../core/news';
import { addQuest, completeQuest } from '../../core/quests';
import { cutin } from '../../ui/toasts';
import { portraitSVG } from '../../ui/art/portraits';
import { audio } from '../../audio';
import { st, corruptedCount, hasRunState, ownsRelic, GAMEPLAY_SCENES } from './state';
import { dialogue } from '../../ui/dialogue';
import { grantRelic } from '../progression/relics';
import { sayEvent } from './narration';
import { unlockAchievement } from './achievements';
import { Q } from './designios';

/** Named story beat: emits 'story:beat' so other modules (world, society) can react. */
export function storyBeat(id: string): void { bus.emit('story:beat', { id }); }

const TAUNTS: Record<string, string[]> = {
  first: ['Te di por muerto. Error mío.', 'No sé cómo sigues vivo. Tampoco sé si quiero saberlo.', 'Vuelve a Concordia conmigo. Por las buenas.'],
  hunting: ['Esta vez no hay fiesta. Ni público.', 'Cada pueblo que tocas me pesa a mí.', 'Deja de correr. Estoy cansado.'],
  late: ['Tengo la sensación de que ya peleamos aquí.', 'Te conozco. No sé de dónde, pero te conozco.', 'Siempre llegas tarde… o yo siempre llego temprano.'],
};

/** A line for Aurel when he meets Elias (world/battle can use it in cut-ins). */
export function aurelLine(): string {
  const cycle = G.run?.cycle ?? 1;
  const pool = cycle >= 3 ? [...TAUNTS.late, ...TAUNTS.hunting] : st().aurelHunting ? TAUNTS.hunting : TAUNTS.first;
  return pool[Math.floor(Math.random() * pool.length)];
}

async function aurelReturnsCutin(): Promise<void> {
  const show = async () => {
    audio.stinger('nemesis');
    await cutin({
      portrait: portraitSVG({ seed: 'aurel', race: 'humano', special: 'aurel', mood: 'determined' }, 520),
      title: 'AUREL TE CAZA', subtitle: 'Huir es de sabios… por ahora', colors: ['#3a2a10', '#ffd36b'], side: 'left', duration: 2.2, slowmo: false,
    });
  };
  // wait for a moment when the world owns the screen
  if (engine.sceneId && GAMEPLAY_SCENES.has(engine.sceneId) && engine.sceneId !== 'battle') { await show(); return; }
  const off = bus.on('scene:enter', ({ id }) => {
    if (id === 'overworld' || id === 'location') { off(); setTimeout(() => void show(), 1500); }
  });
}

/** Aurel learns Elias lives. */
function aurelKnows(): void {
  const s = st();
  if (s.aurelKnows) return;
  s.aurelKnows = true;
  G.run.flags.aurel_knows = true;
  addNews('En Concordia dicen que Aurel se enteró: el mago de la plaza sigue vivo.', 'excepcion', true);
  setTimeout(() => sayEvent('aurel_knows', {}, { priority: true, defer: true }), 9000);
  storyBeat('aurel_knows');
}

/** Aurel hunts Elias on the map. `fromSociety`: the Concilio called its Champion back (society already announced it). */
function aurelHunts(fromSociety = false): void {
  const s = st();
  if (s.aurelHunting) return;
  aurelKnows();
  s.aurelHunting = true;
  G.run.flags.aurel_hunting = true;
  addQuest({ id: Q.alba, kind: 'side', title: 'El Portador del Alba', desc: 'Aurel te caza en el mapa. Evítalo mientras puedas: todavía tiene todo lo que tú tienes… y algo más.', goal: 1 });
  if (!fromSociety) {
    addNews('El Portador del Alba vuelve a los caminos. Busca a alguien.', 'excepcion', true);
    storyBeat('aurel_returns');
    bus.emit('nemesis:hunt', { npcId: 'aurel' });
  }
  void aurelReturnsCutin();
  setTimeout(() => sayEvent('aurel_returns', {}, { priority: true, defer: true }), 4000);
}

function onCorrupted(): void {
  if (!hasRunState()) return;
  const n = corruptedCount();
  if (n >= 1) aurelKnows();
  if (n >= 2) aurelHunts();
}

/** Society's third path to the Libro de la Realidad: buying the Banca de las Mil Suertes. */
async function bancaComprada(): Promise<void> {
  if (!hasRunState() || ownsRelic('libro_realidad') || G.run.player.books.realidad) return;
  const tiburcio = { seed: 'tiburcio', race: 'duende' as const, special: 'tiburcio' as const, mood: 'smile' as const };
  const show = async () => {
    await dialogue.say([
      { speaker: 'Don Tiburcio Faroles', title: 'ex Gran Banquero', portrait: tiburcio, text: '¡A la gran, patojo! Compraste la Banca entera. Nunca nadie me había ganado sin apostar.' },
      { speaker: 'Don Tiburcio Faroles', title: 'ex Gran Banquero', portrait: { ...tiburcio, mood: 'smug' }, text: 'La Bóveda es tuya, y lo que hay adentro también. Ese librito tratalo con cariño… que cobra caro. Más caro que yo, fijate.' },
    ]);
    grantRelic('libro_realidad', { reveal: true, where: 'boveda_tiburcio' });
    G.run.player.books.realidad = true;
  };
  const sid = engine.sceneId;
  if (sid === 'overworld' || sid === 'location') { await show(); return; }
  const off = bus.on('scene:enter', ({ id }) => { if (id === 'overworld' || id === 'location') { off(); setTimeout(() => void show(), 1200); } });
}

export function initAurel(): void {
  bus.on('continent:corrupted', onCorrupted);
  bus.on('state:loaded', () => { if (hasRunState() && G.run.fragment === 'regla') onCorrupted(); });
  bus.on('battle:end', ({ setup, result }) => {
    const vsAurel = setup.enemy?.boss?.special === 'aurel' || setup.enemy?.boss?.unitId === 'aurel' || setup.enemy?.boss?.npcId === 'aurel';
    if (!vsAurel || setup.kind === 'tutorial' || setup.kind === 'final') return;
    if (result.fled) { sayEvent('aurel_fled', {}, { priority: true, defer: true }); unlockAchievement('aritmetica'); }
    else sayEvent('aurel_encounter', {}, { priority: true, defer: true });
  });
  bus.on('story:beat', ({ id }) => {
    if (id === 'final_won') completeQuest(Q.alba);
    else if (id === 'aurel_hunting' && hasRunState()) aurelHunts(true);
    else if (id === 'banca_comprada') void bancaComprada();
    else if (id === 'elias_custodio' && hasRunState()) setTimeout(() => sayEvent('custodio', {}, { priority: true, defer: true }), 4500);
  });
}
