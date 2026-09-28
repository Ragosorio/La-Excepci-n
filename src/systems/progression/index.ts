/**
 * Progression wiring: state slice, run init, resource modifiers and event listeners.
 * HMR-safe: bus listeners are disposed on hot update; res modifiers are registered once and delegate to the
 * latest implementation through a global hook table.
 */
import './pstate';
import { G, addResModifier, onRunInit } from '../../core/state';
import { bus, type GameEvents } from '../../core/events';
import { cutin, toast } from '../../ui/toasts';
import { closeAllOverlays, queueBanner } from './pgui';
import { RELICS } from '../../data/relics';
import { BOOK_ABILITIES } from '../../data/abilities';
import { isGeneratedFusion, resolveAbility } from '../../data/fusions';
import { audio } from '../../audio';
import { fmt } from '../../core/math';
import { PS, hasRun } from './pstate';
import { acquire, comprehend, ensureLoadout, knows, openCodex, recomputeExceptions, refreshRelicSlots } from './codex';
import { grantRelic, openRelics, randomRelic, relicPassive, waitForReveals } from './relics';
import { alertMult, essenceMult, goldDoubled, goldMult, grantContinentPowers, influenceMult, secretMult, syncVitals } from './stats';
import { relicArt } from './art';
import { openRealityBook } from './reality';
import { openAcademy, openForge, openFusion } from './workshops';

// ───────────────────────────── HMR-safe listeners ─────────────────────────────

const offs: Array<() => void> = [];
function on<K extends keyof GameEvents>(type: K, fn: (p: GameEvents[K]) => void): void { offs.push(bus.on(type, fn)); }
if (import.meta.hot) import.meta.hot.dispose(() => { offs.splice(0).forEach((f) => f()); });

// ───────────────────────────── resource modifiers ─────────────────────────────

type ResKey = 'gold' | 'essence' | 'influence' | 'secrets' | 'alert';
const HOOKS = '__lx_progression_res';
const gw = globalThis as unknown as Record<string, Record<ResKey, (d: number) => number> | undefined>;
const firstLoad = !gw[HOOKS];
const probRound = (v: number) => { const f = Math.floor(v); return f + (Math.random() < v - f ? 1 : 0); };
gw[HOOKS] = {
  gold: (d) => (hasRun() ? d * goldMult() : d),
  essence: (d) => (hasRun() ? d * essenceMult() : d),
  influence: (d) => (hasRun() ? d * influenceMult() : d),
  secrets: (d) => (hasRun() ? probRound(d * secretMult()) : d),
  alert: (d) => (hasRun() ? d * alertMult() : d),
};
if (firstLoad) {
  for (const k of ['gold', 'essence', 'influence', 'secrets', 'alert'] as ResKey[]) addResModifier(k, (d) => gw[HOOKS]?.[k]?.(d) ?? d);
}

// ───────────────────────────── run init ─────────────────────────────

onRunInit('progression', 45, () => {
  PS();
  // Elias' own basics (the hero kit is granted by the story at the resurrection; echoes by story.applyEchoes)
  acquire('chispa_arcana', { silent: true });
  acquire('esquivar', { silent: true });
  ensureLoadout();
  recomputeExceptions();
  syncVitals();
});

/** Generated fusions live only in memory: re-register them from the save (codex + echoes). */
function reRegisterFusions(): void {
  const ids = new Set<string>([...Object.keys(G.run?.player.codex ?? {}), ...(G.meta?.echoesKnown ?? [])]);
  for (const id of ids) if (isGeneratedFusion(id)) resolveAbility(id);
}

on('state:loaded', () => {
  if (!hasRun()) return;
  PS();
  reRegisterFusions();
  if (!G.run.player.codex.chispa_arcana?.acquired) acquire('chispa_arcana', { silent: true });
  if (!G.run.player.codex.esquivar?.acquired) acquire('esquivar', { silent: true });
  recomputeExceptions();
  ensureLoadout();
  syncVitals();
});

// ───────────────────────────── relics & books ─────────────────────────────

async function learnBookOfLearning(): Promise<void> {
  const fresh = BOOK_ABILITIES.filter((id) => !knows(id));
  if (!fresh.length) return;
  await waitForReveals(); // don't spoil the card flip
  await new Promise((r) => setTimeout(r, 500));
  audio.stinger('discovery');
  const def = RELICS.libro_aprendizaje;
  void cutin({ portrait: relicArt(def, 420), title: 'EL LIBRO DEL APRENDIZAJE', subtitle: 'LO QUE NO SE DEBERÍA SABER', colors: ['#10233a', '#7fe3ff'], side: 'left', duration: 1.8 });
  for (const [i, id] of fresh.entries()) setTimeout(() => acquire(id, { noCutin: true }), 600 + i * 450);
  setTimeout(() => toast('Ahora puedes <b>fusionar</b> habilidades desde el Códice.', { kind: 'epica', duration: 5 }), 2800);
}

on('relic:gained', ({ relicId }) => {
  if (!hasRun()) return;
  if (relicId === 'libro_aprendizaje') { G.run.player.books.aprendizaje = true; void learnBookOfLearning(); }
  if (relicId === 'libro_realidad') {
    G.run.player.books.realidad = true;
    setTimeout(() => queueBanner('El Libro de la Realidad', 'Lo que escribas, pasará. Lo que pagues, no vuelve.', 'excepcion', 3.4), 1600);
  }
});
on('relics:equip', () => { refreshRelicSlots(); syncVitals(); });
on('relic:upgraded', () => syncVitals());
on('relic:lost', () => { refreshRelicSlots(); syncVitals(); });
on('progression:racial', ({ power }) => { if (power === 'adaptable') ensureLoadout(); });

// Quest rewards may carry a relic (core/quests pays gold/essence/influence/secrets only).
on('quest:done', ({ quest }) => { const rel = quest.reward?.relic; if (rel && RELICS[rel]) setTimeout(() => grantRelic(rel, { reveal: true }), 700); });

// ───────────────────────────── racial powers ─────────────────────────────

on('continent:corrupted', ({ continent }) => { if (hasRun()) grantContinentPowers(continent); });

// Panels never survive a scene change (battle ambush, cutscene...).
on('scene:exit', () => closeAllOverlays());
// Echo pickers (Márgenes) may list generated fusions from meta without a loaded run.
on('scene:enter', () => { try { reRegisterFusions(); } catch { /* ignore */ } });

// ───────────────────────────── per luna ─────────────────────────────

let wasDouble = false;
on('luna:tick', ({ luna }) => {
  if (!hasRun()) return;
  const s = PS();
  // El Libro de Cuentas Infinitas: compound interest on your gold (capped per luna)
  const rate = relicPassive('interest');
  if (rate > 0 && s.interestLuna !== luna && G.run.player.gold > 0) {
    s.interestLuna = luna;
    const gain = Math.min(1500, Math.floor(G.run.player.gold * rate));
    if (gain > 0) {
      G.run.player.gold += gain;
      bus.emit('res:change', { key: 'gold', value: G.run.player.gold, delta: gain });
      toast(`Interés compuesto: <b class="lx-gold">+${fmt(gain)}</b> oro`, { kind: 'gold', duration: 3 });
    }
  }
  const dbl = goldDoubled();
  if (wasDouble && !dbl) toast('El oro vuelve a valer lo de siempre.', { kind: 'info' });
  wasDouble = dbl;
});

// ───────────────────────────── dev console handle ─────────────────────────────

if (import.meta.env.DEV) {
  (window as unknown as { LXP: unknown }).LXP = {
    acquire, comprehend, knows, grantRelic, randomRelic, openCodex, openRelics, openRealityBook, openForge, openAcademy, openFusion,
    grantContinentPowers, syncVitals,
  };
}

export { openCodex, openRelics, openRealityBook, openForge, openAcademy, openFusion };
