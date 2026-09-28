/**
 * Society systems registration: state slice, run-init hooks, and bus listeners.
 * (imported once by src/systems/index.ts)
 */
import { G, onRunInit } from '../../core/state';
import { bus } from '../../core/events';
import { dialogue } from '../../ui/dialogue';
import { engine } from '../../core/engine';
import { registerSocietySlice, ensureWorld, soc } from './state';
import { initReputation } from './factions';
import { initNpcs } from './memory';
import { flushNemesisPresentations, initNemesisEchoes, nemesisLunaTick, onBattleEnd, pendingCaptives, writeEchoes } from './nemesis';
import { contractsLunaTick, contractsOnDeath, economyLunaTick, initPrices } from './economy';
import { financeLunaTick } from './finance';
import { alertLunaTick, onAlertChange } from './alert';
import { corruptionLunaTick } from './corruption';
import { onContinentCorrupted, politicsLunaTick, requestPresent, tryPresent } from './politics';
import { isTalking, judgeCaptives } from './dialogue';
import { onRewrite } from './rewrites';
import './society.css';

registerSocietySlice();

onRunInit('npcs', 10, (run) => { ensureWorld(); initNpcs(run); });
onRunInit('society:nemesis-echoes', 11, (run) => initNemesisEchoes(run));
onRunInit('society:reputation', 12, (run) => initReputation(run));
onRunInit('society:prices', 20, () => { initPrices(); soc().flags.pricesInit = true; });
onRunInit('society:politics', 30, () => { const c = soc().council; c.next = 4; soc().alert.last = G.run.player.alert; });

const safe = (label: string, fn: () => void) => { try { fn(); } catch (err) { console.error(`[society] ${label}`, err); } };

bus.on('luna:tick', () => {
  if (!G.hasRun) return;
  safe('economy', economyLunaTick);
  safe('finance', financeLunaTick);
  safe('corruption', corruptionLunaTick);
  safe('alert', alertLunaTick);
  safe('nemesis', nemesisLunaTick);
  safe('contracts', contractsLunaTick);
  safe('politics', politicsLunaTick);
});

bus.on('res:change', ({ key, value }) => { if (key === 'alert' && G.hasRun) safe('alert-change', () => onAlertChange(value)); });
bus.on('battle:end', ({ setup, result }) => safe('battle-end', () => onBattleEnd(setup, result)));
bus.on('cycle:end', ({ cycle }) => safe('cycle-end', () => writeEchoes(cycle)));
bus.on('continent:corrupted', () => safe('council-emergency', onContinentCorrupted));
bus.on('npc:died', ({ npcId }) => safe('contracts-death', () => contractsOnDeath(npcId)));
bus.on('reality:rewrite', (p) => safe('rewrite', () => onRewrite(p)));
/** Saves from before this module existed: fill NPCs, reputation and the market model once. */
bus.on('state:loaded', () => safe('loaded', () => {
  ensureWorld();
  const s = soc();
  if (!Object.keys(G.run.npcs).length) initNpcs(G.run);
  if (!Object.keys(G.run.reputation).length) initReputation(G.run);
  if (!s.flags.pricesInit) { initPrices(); s.flags.pricesInit = true; }
  if (s.council.session?.status === 'inprogress') s.council.session.status = 'pending';
  if (s.council.session?.status === 'pending') requestPresent();
}));

/** Back on the map/location after a battle: nemesis cut-ins, judgement of fallen captains, council invitation. */
let afterBusy = false;
const uiBusy = () => dialogue.open || isTalking() || !!document.querySelector('.lx-modal-back, .soc-overlay, .lx-loot');
async function afterSceneEnter(id: string): Promise<void> {
  if (afterBusy || !G.hasRun) return;
  afterBusy = true;
  try {
    // let the world module's own arrival UI (loot, encounters) finish first
    for (let i = 0; i < 10 && uiBusy(); i++) await new Promise((r) => setTimeout(r, 1200));
    if (engine.sceneId !== id) return;
    await flushNemesisPresentations();
    if (pendingCaptives().length && G.run.flags.society_auto_judge !== false && !uiBusy()) await judgeCaptives();
    if (id === 'overworld') tryPresent();
  } catch (err) {
    console.error('[society] after scene', err);
  } finally {
    afterBusy = false;
  }
}
bus.on('scene:enter', ({ id }) => {
  if (id === 'overworld' || id === 'location') setTimeout(() => void afterSceneEnter(id), 1100);
});
