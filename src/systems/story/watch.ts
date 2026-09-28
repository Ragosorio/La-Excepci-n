/**
 * "Siempre estuve viéndote" — the watcher. Turns tracked behavior and world events into narrator lines,
 * hazañas and meta touches: thresholds on stats, idle time ("Te fuiste. Él esperó."), the local hour
 * ("Son las 3 de la mañana. Él tampoco duerme."), tab away, and reloads in the middle of a battle.
 */
import { G } from '../../core/state';
import { bus } from '../../core/events';
import { engine } from '../../core/engine';
import { input } from '../../core/input';
import { track } from '../../core/tracker';
import { HERO_KIT } from '../../data/abilities';
import { NPCS } from '../../data/npcs';
import { CONTINENT_NAMES } from '../../data/story';
import { st, hasRunState, GAMEPLAY_SCENES, abilityName, relicName, money, horaLocal } from './state';
import { sayEvent } from './narration';
import { checkAchievements, unlockAchievement } from './achievements';
import { refreshDesignios, ensureDesignios } from './designios';
import { checkFinalAct } from './acts';
import { grantMarginRelic, applyEchoes } from './margins';
import { acquire } from '../progression/codex';
import { dialogue } from '../../ui/dialogue';

const KIT = new Set<string>([...HERO_KIT, 'chispa_arcana', 'esquivar', 'golpe_titanico', 'el_alba']);
const MAJOR_RELICS = new Set(['daga_solar', 'daga_lunar', 'eclipse', 'libro_realidad', 'libro_aprendizaje']);

/** Fires `fn(threshold)` for the highest threshold crossed since the last check. */
function crossing(key: string, value: number, thresholds: number[], fn: (t: number) => void): void {
  const marks = st().marks;
  const prev = marks[key] ?? 0;
  if (value <= prev) { if (value < prev) marks[key] = value; return; }
  marks[key] = value;
  let hit = -1;
  for (const t of thresholds) if (prev < t && value >= t) hit = t;
  if (hit >= 0) fn(hit);
}

/** Fires when a counter grows (with the new value). */
function grew(key: string, value: number, fn: (v: number, prev: number) => void): void {
  const marks = st().marks;
  const k = `grow:${key}`;
  const prev = marks[k];
  marks[k] = value;
  if (prev !== undefined && value > prev) fn(value, prev);
}

function statTick(): void {
  if (!hasRunState()) return;
  const sid = engine.sceneId;
  if (!sid || !GAMEPLAY_SCENES.has(sid)) return;
  const s = G.run.stats;
  const n = (k: string) => s[k] ?? 0;
  const p = G.run.player;

  crossing('deaths', n('deaths'), [1, 3, 7, 12, 15, 25, 40], (t) => {
    const key = t === 1 ? 'death_first' : t >= 15 ? 'death_absurd' : t >= 7 ? 'death_lots' : 'death_many';
    sayEvent(key, { n: n('deaths') }, { priority: true, defer: true });
  });
  grew('revivals', n('revivals'), () => sayEvent('revival', {}, { defer: true }));
  crossing('minds', n('minds_dominated'), [1, 15, 40], (t) => sayEvent(t === 1 ? 'mind_first' : 'mind_many', { n: n('minds_dominated') }, { defer: true }));
  crossing('units_lost', n('units_lost'), [10, 30, 80], () => sayEvent('units_lost_many', { n: n('units_lost') }, { defer: true }));
  crossing('spared', n('spared'), [1, 5, 15], () => sayEvent('spared', {}, { defer: true }));
  crossing('executed', n('executed'), [1, 5, 15], () => sayEvent('executed', {}, { defer: true }));
  grew('cheats_caught', n('cheats_caught'), () => sayEvent('cheat_caught', {}, { priority: true }));
  crossing('gambled', n('gold_gambled'), [1], () => sayEvent('gamble_first'));
  grew('bigwin', n('gamble_biggest_win'), (v) => { if (v >= 1500) sayEvent('gamble_win_big', { gold: money(v) }, { priority: true }); });
  grew('bigloss', n('gamble_biggest_loss'), (v) => { if (v >= 1000) sayEvent('gamble_loss_big', { gold: money(v) }, { priority: true }); });
  st().biggestBet = Math.max(st().biggestBet, n('gamble_biggest_win'), n('gamble_biggest_loss'), n('gamble_night_max'));
  crossing('invisible', n('invisible_seconds'), [60], () => sayEvent('invisible_long'));
  crossing('terror', n('terror_acts'), [1], () => sayEvent('terror_first'));
  crossing('copied', n('abilities_copied'), [10, 25, 50, 100], (t) => sayEvent('copy_milestone', { n: t }, { defer: true }));
  crossing('army', p.army.length, [1, 10, 25], (t) => sayEvent(t === 1 ? 'first_recruit' : t === 10 ? 'army_10' : 'army_25', {}, { defer: true }));
  crossing('rich', p.gold >= 10000 ? 1 : 0, [1], () => sayEvent('rich'));
  crossing('debt', p.debt > 0 ? 1 : 0, [1], () => sayEvent('debt'));
  crossing('alert75', p.alert >= 75 ? 1 : 0, [1], () => sayEvent('alert_high', {}, { priority: true }));
  refreshDesignios();
  checkAchievements();
}

/** Run `fn` once no dialogue, modal or cut-in is on screen (gives up after ~60 s). */
export function whenQuiet(fn: () => void, tries = 120): void {
  const busy = dialogue.open || !!document.querySelector('.lx-modal-back, .lx-cutin, .st-pageback, .lx-banner');
  if (!busy) { fn(); return; }
  if (tries > 0) setTimeout(() => whenQuiet(fn, tries - 1), 500);
}

// ───────────────────────────── idle / hour / tab ─────────────────────────────

let away = false;
let lateSaid = false;
let sessionStart = performance.now();

function idleTick(): void {
  const idle = input.idleSeconds();
  const sid = engine.sceneId;
  const live = !!sid && GAMEPLAY_SCENES.has(sid) && hasRunState();
  if (idle > 90 && live) away = true;
  if (live && idle < 60) st().playSeconds += 1;
  if (away && idle < 1.5) {
    away = false;
    if (live) {
      track('idle_long');
      unlockAchievement('te_fuiste');
      setTimeout(() => sayEvent('idle_return', {}, { priority: true }), 900);
    }
  }
  if (!lateSaid && live) {
    const h = new Date().getHours();
    if (h >= 1 && h < 5 && (performance.now() - sessionStart) / 1000 > 180) {
      lateSaid = true;
      unlockAchievement('insomnio');
      sayEvent('late_night', { hora: horaLocal(false) }, { priority: true });
    }
  }
}

let hiddenAt = 0;
function onVisibility(): void {
  if (document.hidden) {
    hiddenAt = performance.now();
    if (hasRunState() && engine.sceneId && GAMEPLAY_SCENES.has(engine.sceneId)) document.title = 'La Excepción (…)';
    return;
  }
  document.title = 'La Excepción';
  const secs = (performance.now() - hiddenAt) / 1000;
  if (hiddenAt && secs > 45 && secs < 90) setTimeout(() => sayEvent('tab_return'), 1200);
  hiddenAt = 0;
}

// ───────────────────────────── reload in the middle of a battle ─────────────────────────────

const IN_BATTLE = 'lx.st.inBattle';
let reloadPending = false;

function detectReload(): void {
  try {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    if (nav?.type === 'reload' && sessionStorage.getItem(IN_BATTLE) === '1') reloadPending = true;
    sessionStorage.removeItem(IN_BATTLE);
  } catch { /* storage blocked */ }
}

// ───────────────────────────── event narration ─────────────────────────────

function onSceneEnter(id: string, params: unknown): void {
  if (!hasRunState()) return;
  const s = st();
  if (id === 'overworld' || id === 'location') {
    s.scene = id;
    // arriving in the world means the main game has begun (also covers debug jumps)
    if (G.run.fragment === 'antes' || G.run.fragment === 'nombre') G.run.fragment = 'regla';
    if (!s.kitAcquired) {
      s.kitAcquired = true;
      for (const k of HERO_KIT) { try { acquire(k, { silent: true, noCutin: true }); } catch { /* stub */ } }
    }
    ensureDesignios();
    applyEchoes();
    grantMarginRelic();
    if (reloadPending) {
      reloadPending = false;
      track('reloads_mid_battle');
      unlockAchievement('recargar');
      setTimeout(() => sayEvent('reload_mid_battle', {}, { force: true, person: 'direct' }), 1800);
    }
    const intro = !!(params && typeof params === 'object' && (params as { intro?: boolean }).intro);
    if (id === 'overworld' && intro) {
      const key = (G.run.cycle ?? 1) >= 2 && Math.random() < 0.6 ? 'dejavu' : 'overworld_intro';
      setTimeout(() => sayEvent(key, {}, { priority: true }), 4200);
    }
    checkFinalAct();
  } else if (id === 'battle' || id === 'casino' || id === 'council') {
    s.scene = 'overworld';
  }
}

export function initWatch(): void {
  detectReload();
  sessionStart = performance.now();
  setInterval(() => { try { statTick(); } catch (err) { console.warn('[story] watch', err); } }, 1500);
  setInterval(() => { try { idleTick(); } catch (err) { console.warn('[story] idle', err); } }, 1000);
  document.addEventListener('visibilitychange', onVisibility);

  bus.on('scene:enter', ({ id, params }) => onSceneEnter(id, params));

  bus.on('battle:start', ({ setup }) => {
    try { sessionStorage.setItem(IN_BATTLE, '1'); } catch { /* ignore */ }
    if (!hasRunState() || setup.kind === 'tutorial' || setup.kind === 'final' || setup.kind === 'arena') return;
    if (!st().marks.realBattles) setTimeout(() => sayEvent('first_battle', {}, { priority: true, position: 'top' }), 2500);
  });
  bus.on('battle:end', ({ setup, result }) => {
    try { sessionStorage.removeItem(IN_BATTLE); } catch { /* ignore */ }
    if (!hasRunState() || setup.kind === 'tutorial' || setup.kind === 'final' || setup.kind === 'arena') return;
    const s = st();
    s.marks.realBattles = (s.marks.realBattles ?? 0) + 1;
    // results carry npc ids (or names): show people their names, never ids
    const caps = [...(setup.enemy?.captains ?? []), ...(setup.enemy?.boss ? [setup.enemy.boss] : [])];
    const capName = (idOrName: string): string =>
      caps.find((c) => c.npcId === idOrName || c.name === idOrName)?.name
      ?? G.run.npcs[idOrName]?.generated?.name ?? NPCS[idOrName]?.name ?? idOrName;
    for (const c of result.captainsKilled ?? []) {
      const name = capName(c);
      if (s.nemesesKilled.length < 40) s.nemesesKilled.push(name);
      track('nemesis_killed');
      sayEvent('nemesis_killed', { capitan: name }, { defer: true });
    }
    if (result.captainKilledPlayer) {
      const name = capName(result.captainKilledPlayer);
      s.killedBy.push(name);
      sayEvent('nemesis_rises', { capitan: name }, { priority: true, defer: true });
    }
    if (result.fled) sayEvent('battle_fled', {}, { defer: true });
    else if (result.victory) sayEvent('battle_won', {}, { defer: true });
    else sayEvent('battle_lost', {}, { defer: true });
  });
  bus.on('codex:acquired', ({ abilityId }) => {
    if (!hasRunState() || KIT.has(abilityId)) return;
    const s = st();
    if (!s.firstCopy) { s.firstCopy = abilityId; sayEvent('first_copy', {}, { priority: true, defer: true }); }
    else sayEvent('copy', { habilidad: abilityName(abilityId) }, { defer: true });
  });
  bus.on('title:change', ({ index }) => {
    // society's "X HA CAÍDO" crest + name banner run first (~4 s); the voice speaks after them
    if (index >= 1 && index <= 4) setTimeout(() => whenQuiet(() => sayEvent(`name_${index}`, {}, { priority: true, defer: true })), 6500);
  });
  bus.on('relic:gained', ({ relicId }) => {
    if (!hasRunState()) return;
    const key = relicId === 'eclipse' ? 'eclipse' : relicId === 'libro_realidad' ? 'book_realidad' : relicId === 'libro_aprendizaje' ? 'book_aprendizaje' : MAJOR_RELICS.has(relicId) ? 'relic_major' : 'relic_first';
    sayEvent(key, { reliquia: relicName(relicId) }, { priority: key !== 'relic_first', defer: true });
  });
  bus.on('continent:corrupted', ({ continent }) => {
    setTimeout(() => sayEvent('continent_corrupted', { continente: CONTINENT_NAMES[continent] ?? continent }, { priority: true, defer: true }), 1500);
  });
  bus.on('location:enter', ({ id, special }) => {
    if (!hasRunState()) return;
    // places may open their own scenes (the parents and Bruma at Las Colmenas live in society/family):
    // the voice waits until nobody is talking
    if (id === 'aldea_colmenas' || special === 'colmenas') {
      unlockAchievement('visita');
      setTimeout(() => whenQuiet(() => { if (!sayEvent('colmenas', {}, { priority: true })) sayEvent('bruma', {}, { priority: true }); }), 2200);
      setTimeout(() => whenQuiet(() => sayEvent('bruma', {}, {})), 30000);
    } else if (id === 'crater' || special === 'crater') setTimeout(() => whenQuiet(() => sayEvent('crater', {}, { priority: true })), 1500);
    else if (id === 'concordia') setTimeout(() => whenQuiet(() => sayEvent('concordia', {}, {})), 1500);
    else if ((G.run.cycle ?? 1) >= 2 && Math.random() < 0.12) setTimeout(() => whenQuiet(() => sayEvent('dejavu')), 2500);
  });
  bus.on('luna:tick', () => {
    if (Math.random() < 0.18) sayEvent('luna');
    else if (Math.random() < 0.12) sayEvent('ambient');
  });
  bus.on('concilio:session', () => setTimeout(() => sayEvent('council_session', {}, {}), 4000));
  bus.on('reality:rewrite', () => { sayEvent('sacrifice', {}, { priority: true, defer: true }); });
}
