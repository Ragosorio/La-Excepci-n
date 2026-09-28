/**
 * Act transitions: the Concordia duel (Fragment "Cuando aún tenía nombre"), the final act trigger
 * ("Lo que sobrevivió"), the final battle, and the Sello bad ending.
 */
import { G } from '../../core/state';
import { bus } from '../../core/events';
import { engine } from '../../core/engine';
import { addNews } from '../../core/news';
import { addQuest, completeQuest } from '../../core/quests';
import { saveRun } from '../../core/save';
import { modal } from '../../ui/widgets';
import { h } from '../../ui/dom';
import { toast } from '../../ui/toasts';
import { audio } from '../../audio';
import type { BattleSetup } from '../../battle/api';
import { FRAGMENTS } from '../../data/story';
import { st, corruptedCount, ownsRelic, hasRunState } from './state';
import { sayEvent } from './narration';
import { unlockAchievement } from './achievements';
import { storyBeat } from './aurel';
import { aurelDuelScript } from './aurelTutorial';
import { finalSetup } from './finalBattle';
import { Q } from './designios';
import { fragmentGoto } from './ui';

// ───────────────────────────── the duel ─────────────────────────────

export function duelSetup(): BattleSetup {
  return {
    kind: 'tutorial', biome: 'concordia', continent: 'concordia', locationId: 'concordia', timeOfDay: 0.74, weather: 'clear',
    title: 'Concordia',
    player: { present: true, army: [] },
    enemy: { faction: 'concilio', groups: [], boss: { unitId: 'aurel', npcId: 'aurel', name: 'Aurel', title: 'Portador del Alba', special: 'aurel', hpMult: 20 } },
    script: aurelDuelScript(),
    deploy: false,
    allowRetreat: false,
    returnTo: { scene: 'prologue', params: { mode: 'fall' } },
  };
}

/** Fragment card "Cuando aún tenía nombre" → the Concordia duel. */
export async function startAurelDuel(opts: { card?: boolean } = {}): Promise<void> {
  if (hasRunState()) { G.run.fragment = 'nombre'; saveRun(true); }
  const f = FRAGMENTS.nombre;
  if (opts.card === false) await engine.goto('battle', duelSetup(), { fade: 0.6 });
  else await fragmentGoto('battle', duelSetup(), f, 3.4);
}

// ───────────────────────────── the final act ─────────────────────────────

export function finalActReady(): boolean {
  if (!hasRunState()) return false;
  const n = corruptedCount();
  if (n >= 5) return true;
  const b = G.run.player.books;
  const daggers = (ownsRelic('daga_solar') && ownsRelic('daga_lunar')) || ownsRelic('eclipse');
  const books = (ownsRelic('libro_realidad') || b.realidad) && (ownsRelic('libro_aprendizaje') || b.aprendizaje);
  return n >= 3 && daggers && books;
}

let announcing = false;

async function announceFinalAct(): Promise<void> {
  if (announcing) return;
  const sid = engine.sceneId;
  if (sid !== 'overworld' && sid !== 'location') {
    const off = bus.on('scene:enter', ({ id }) => { if (id === 'overworld' || id === 'location') { off(); setTimeout(() => void announceFinalAct(), 1500); } });
    return;
  }
  announcing = true;
  try {
    audio.stinger('council_open');
    const v = await modal({
      title: FRAGMENTS.sobrevivio.title,
      body: h('div', { class: 'lx-book', style: 'font-size:19px;line-height:1.5' },
        h('p', { style: 'margin:0 0 10px' }, 'El Concilio dejó de discutir. Los cinco continentes firmaron lo mismo, por primera vez: La Gran Alianza.'),
        h('p', { style: 'margin:0 0 10px' }, 'Te esperan en Concordia. Aurel también.'),
        h('p', { class: 'lx-muted', style: 'margin:0;font-size:15px' }, 'Si no vas, vendrán ellos. En tres lunas.')),
      actions: [{ label: 'Todavía no', value: 'later', kind: 'ghost' }, { label: 'Ir a Concordia', value: 'go', kind: 'primary' }],
      dismissable: false,
    });
    if (v === 'go') await startFinalBattle();
  } finally {
    announcing = false;
  }
}

function triggerFinalAct(): void {
  const s = st();
  if (s.finalAct || s.finalWon) return;
  s.finalAct = true;
  s.finalActLuna = G.run.luna;
  G.run.fragment = 'sobrevivio';
  G.run.flags.final_act = true;
  storyBeat('final_act');
  addNews('El Concilio forma La Gran Alianza. Cinco ejércitos marchan a Concordia.', 'concilio', true);
  addQuest({ id: Q.final, kind: 'main', title: 'Lo que sobrevivió', desc: 'La Gran Alianza te espera en Concordia. Aurel también. Si no vas, vendrán ellos.', goal: 1, target: 'concordia' });
  completeQuest(Q.cinco);
  sayEvent('final_act', {}, { priority: true });
  saveRun(true);
  void announceFinalAct();
}

export function checkFinalAct(): void {
  if (!hasRunState() || G.run.fragment === 'antes' || G.run.fragment === 'nombre') return;
  if (!st().finalAct && finalActReady()) triggerFinalAct();
}

/** Fragment card "Lo que sobrevivió" → the final battle. */
export async function startFinalBattle(): Promise<void> {
  if (engine.sceneId === 'battle') return;
  const f = FRAGMENTS.sobrevivio;
  if (hasRunState()) saveRun(true);
  await fragmentGoto('battle', finalSetup(), f, 3.2);
}

// ───────────────────────────── the Sello ─────────────────────────────

async function goSello(): Promise<void> {
  await engine.goto('ending', { sello: true }, { fade: 1.6 });
}

export function initActs(): void {
  bus.on('continent:corrupted', () => setTimeout(checkFinalAct, 2500));
  bus.on('relic:gained', () => setTimeout(checkFinalAct, 2500));
  bus.on('state:loaded', () => {
    if (!hasRunState()) return;
    const s = st();
    if (s.finalAct && !s.finalWon) setTimeout(() => void announceFinalAct(), 3000);
  });
  bus.on('location:enter', ({ id }) => {
    if (!hasRunState()) return;
    const s = st();
    if (id === 'concordia' && s.finalAct && !s.finalWon) void announceFinalAct();
  });
  bus.on('luna:tick', () => {
    if (!hasRunState()) return;
    const s = st();
    checkFinalAct();
    if (!s.finalAct || s.finalWon || s.finalActLuna === undefined) return;
    const since = G.run.luna - s.finalActLuna;
    if (since === 2) { addNews('La Gran Alianza ya no espera. Marcha hacia ti.', 'guerra', true); toast('La Gran Alianza marcha hacia ti.', { kind: 'bad' }); }
    if (since >= 3 && engine.sceneId === 'overworld') void startFinalBattle();
  });
  bus.on('alert:alliance', () => sayEvent('alliance', {}, { priority: true, defer: true }));
  bus.on('sello:start', () => sayEvent('sello_start', {}, { priority: true, defer: true }));
  bus.on('sello:broken', () => { sayEvent('sello_broken', {}, { priority: true, defer: true }); unlockAchievement('pagina_rota'); });
  bus.on('sello:complete', () => void goSello());
}
