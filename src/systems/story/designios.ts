/**
 * Designios principales (GDD §2.3 "La regla"): added after the resurrection, progressed by listeners.
 * Every objective is open-ended: any order, always visible.
 */
import { G } from '../../core/state';
import { bus } from '../../core/events';
import { addQuest, getQuest, progressQuest, completeQuest } from '../../core/quests';
import { st, corruptedCount, maxCorruption, ownsRelic, hasRunState } from './state';

export const Q = {
  siervo: 'd_siervo',
  ejercito: 'd_ejercito',
  caida: 'd_caida',
  dagas: 'd_dagas',
  libros: 'd_libros',
  mesa: 'd_mesa',
  cinco: 'd_cinco',
  alba: 'd_alba',
  final: 'd_final',
} as const;

/** Adds the main designios once per run (idempotent: addQuest ignores existing ids). */
export function ensureDesignios(): void {
  if (!hasRunState()) return;
  addQuest({ id: Q.siervo, kind: 'main', title: 'Un primer siervo', desc: 'Usa Dominar Mente con alguien en Vado del Trigo… o convence a alguien de seguirte. Nadie empieza con un ejército.',
    goal: 1, target: 'vado_trigo', reward: { gold: 120, essence: 25, text: '+120 oro · +25 Esencia' } });
  addQuest({ id: Q.ejercito, kind: 'main', title: 'Un ejército de verdad', desc: 'Reúne 10 unidades bajo tu mando.', goal: 10,
    reward: { gold: 300, influence: 10, text: '+300 oro · +10 Influencia' } });
  addQuest({ id: Q.caida, kind: 'main', title: 'La primera caída', desc: 'Lleva un continente al 100% de corrupción: conquista, intriga, codicia o terror. El mundo se va a enterar.',
    goal: 100, reward: { essence: 80, influence: 30, text: '+80 Esencia · +30 Influencia · un nombre nuevo' } });
  addQuest({ id: Q.dagas, kind: 'main', title: 'Las dagas', desc: 'Consigue a Aurora, la Daga Solar (Templo del Alba), y a Nocturna, la Daga Lunar (Mina de la Luna Caída). Fúndelas en Eclipse en la Forja Primigenia.',
    goal: 3, target: 'templo_alba', reward: { essence: 150, text: '+150 Esencia' } });
  addQuest({ id: Q.libros, kind: 'main', title: 'Los libros', desc: 'El Libro del Aprendizaje duerme en la Biblioteca Prohibida de Altamira. El Libro de la Realidad, en la Bóveda de Tiburcio.',
    goal: 2, target: 'altamira', reward: { essence: 150, secrets: 2, text: '+150 Esencia · +2 Secretos' } });
  refreshDesignios();
}

/** Recomputes absolute progress from the state (robust to missed events and to loaded saves). */
export function refreshDesignios(): void {
  if (!hasRunState()) return;
  const p = G.run.player;
  const sq = getQuest(Q.siervo);
  if (sq && !sq.done && (p.army.length >= 1 || (G.run.stats.minds_dominated ?? 0) >= 1)) completeQuest(Q.siervo);
  const eq = getQuest(Q.ejercito);
  if (eq && !eq.done) { const n = Math.min(10, p.army.length); if (n !== eq.progress) progressQuest(Q.ejercito, n, true); }
  const cdq = getQuest(Q.caida);
  if (cdq && !cdq.done) {
    if (corruptedCount() >= 1) completeQuest(Q.caida);
    else { const mc = Math.floor(maxCorruption()); const q = getQuest(Q.caida)!; if (mc !== q.progress && mc < 100) progressQuest(Q.caida, mc, true); }
  }
  const dq = getQuest(Q.dagas);
  if (dq && !dq.done) {
    const solar = ownsRelic('daga_solar'), lunar = ownsRelic('daga_lunar'), eclipse = ownsRelic('eclipse');
    const prog = eclipse ? 3 : (solar ? 1 : 0) + (lunar ? 1 : 0);
    dq.target = eclipse ? undefined : !solar ? 'templo_alba' : !lunar ? 'mina_luna' : 'forja_primigenia';
    if (prog !== dq.progress) progressQuest(Q.dagas, prog, true);
  }
  const lq = getQuest(Q.libros);
  if (lq && !lq.done) {
    const apr = ownsRelic('libro_aprendizaje') || p.books.aprendizaje;
    const rea = ownsRelic('libro_realidad') || p.books.realidad;
    lq.target = !apr ? 'altamira' : !rea ? 'boveda_tiburcio' : undefined;
    const prog = (apr ? 1 : 0) + (rea ? 1 : 0);
    if (prog !== lq.progress) progressQuest(Q.libros, prog, true);
  }
  const cq = getQuest(Q.cinco);
  if (cq && !cq.done) { const n = corruptedCount(); if (n !== cq.progress) progressQuest(Q.cinco, n, true); }
  const mq = getQuest(Q.mesa);
  if (mq && !mq.done) { const n = Math.min(3, st().councilSessions); if (n !== mq.progress) progressQuest(Q.mesa, n, true); }
}

export function initDesignios(): void {
  bus.on('continent:corrupted', () => {
    if (!hasRunState()) return;
    addQuest({ id: Q.cinco, kind: 'main', title: 'Los cinco continentes', desc: 'Corrompe los cinco continentes… o tres, si reúnes las tres reliquias mayores: las dagas (o Eclipse) y los dos libros.',
      goal: 5, target: 'concordia', reward: { text: 'Lo que sobrevivió' } });
    refreshDesignios();
  });
  bus.on('relic:gained', () => refreshDesignios());
  bus.on('codex:acquired', () => refreshDesignios());
  bus.on('concilio:session', () => {
    if (!hasRunState()) return;
    st().councilSessions += 1;
    addQuest({ id: Q.mesa, kind: 'main', title: 'La mesa de los cinco', desc: 'Sobrevive —o manipula— tres sesiones del Concilio en Concordia.', goal: 3, target: 'concordia',
      reward: { influence: 40, text: '+40 Influencia' } });
    refreshDesignios();
  });
  bus.on('battle:end', () => refreshDesignios());
  bus.on('location:enter', () => refreshDesignios());
  // the army changes in many places (recruiting, mercenaries, devotos, lieutenants): refresh on any of them
  const soon = () => { if (hasRunState() && G.run.fragment === 'regla') refreshDesignios(); };
  bus.on('scene:enter', soon);
  bus.on('luna:tick', soon);
  bus.on('deed:applied', soon);
  bus.on('npc:loyal', soon);
  bus.on('lieutenant:recruited', soon);
  bus.on('state:loaded', () => { if (G.run?.fragment === 'regla') refreshDesignios(); });
}
