/**
 * Story systems (story agent): the narrator engine, designios, Aurel's arc, the final act, lore pages, hazañas,
 * Los Márgenes and cycles. Importing this module registers the state slice, init hooks and listeners.
 *
 * PUBLIC API (other modules may call these):
 *   narrateEvent(key, vars?, opts?)   — ask La Voz to comment (keys in data/story NARRATION); cooldowns built in.
 *   storyBeat(id)                     — emit 'story:beat'.
 *   aurelLine()                       — a taunt for Aurel encounters (cycle-aware).
 *   awardPage({ id?, where? })        — give a Página del Libro (reveal UI queued).   openBook()
 *   unlockAchievement(id)             — hazaña + Tinta.                                openAchievements()
 *   startAurelDuel() · startFinalBattle() · finalActReady() · checkFinalAct()
 *   marginRank(id) · marginValue(id)  — Los Márgenes effects.
 *   endCycle(ending) · startNextCycle()
 */
import './state';
import { initNarration } from './narration';
import { initDesignios } from './designios';
import { initAurel } from './aurel';
import { initActs } from './acts';
import { initPages } from './pages';
import { initWatch } from './watch';
import './margins';
import { G } from '../../core/state';
import { bus } from '../../core/events';
import { remember } from './memory';

let started = false;
function init(): void {
  if (started) return;
  started = true;
  initNarration();
  initDesignios();
  initAurel();
  initActs();
  initPages();
  initWatch();
  bus.on('state:new-run', () => { if (G.meta) remember({ sessions: G.meta.sessions, cycles: G.meta.cyclesCompleted }); });
}
init();

export { sayEvent as narrateEvent, sayLine, quietFor } from './narration';
export { storyBeat, aurelLine } from './aurel';
export { awardPage, openBook, pageFound, pageCompletion, pageReveal } from './pages';
export { unlockAchievement, openAchievements, hasAchievement, achievementCompletion, checkAchievements } from './achievements';
export { startAurelDuel, startFinalBattle, finalActReady, checkFinalAct, duelSetup } from './acts';
export { marginRank, marginValue, buyMargin, echoSlots, echoCandidates, applyEchoes } from './margins';
export { endCycle, startNextCycle, startFirstRun, pendingTally } from './cycle';
export { ensureDesignios } from './designios';
export { st as storyState } from './state';
