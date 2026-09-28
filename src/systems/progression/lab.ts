/**
 * Dev-only lab for the progression UIs (served at /src/systems/progression/lab.html).
 * Imports only core/ui/data/progression so edits in other modules don't reload it.
 */
import '@fontsource/cinzel/latin-400.css';
import '@fontsource/cinzel/latin-700.css';
import '@fontsource/eb-garamond/latin-400.css';
import '@fontsource/eb-garamond/latin-400-italic.css';
import '@fontsource/alegreya-sans/latin-400.css';
import '@fontsource/alegreya-sans/latin-700.css';
import '@fontsource/alegreya-sans/latin-800.css';
import '@fontsource/bangers/latin-400.css';
import '../../ui/theme.css';
import { engine } from '../../core/engine';
import { loadMeta } from '../../core/save';
import { G, newRun } from '../../core/state';
import { initLayers, h, layer } from '../../ui/dom';
import { initTooltips } from '../../ui/widgets';
import { audio } from '../../audio';
import './index';
import { acquire, comprehend, openCodex } from './codex';
import { grantRelic, openRelics, randomRelic } from './relics';
import { grantContinentPowers } from './stats';
import { openRealityBook } from './reality';
import { openAcademy, openForge, openFusion } from './workshops';
import { HERO_KIT } from '../../data/abilities';

loadMeta();
initLayers(document.getElementById('ui-root')!);
initTooltips();
engine.init(document.getElementById('game-canvas') as HTMLCanvasElement, 'baja');
engine.start();
newRun(777);
const unlock = () => { void audio.unlock(); };
window.addEventListener('pointerdown', unlock, { once: true });

const B = (label: string, fn: () => void) => h('button', { class: 'lx-btn small', onclick: fn }, label);
const bar = h('div', { class: 'lx-panel', style: 'position:absolute;left:10px;bottom:10px;display:flex;flex-wrap:wrap;gap:6px;max-width:96vw;z-index:1' },
  B('Kit', () => HERO_KIT.forEach((k) => acquire(k, { silent: true }))),
  B('+Muchas', () => ['bola_fuego', 'lluvia_flechas', 'pisoton_sismico', 'canto_hipnotico', 'maldicion', 'nova_escarcha', 'rayo_cadena', 'devorar', 'frenesi', 'ola', 'parpadeo', 'escudo_arcano'].forEach((k) => acquire(k, { silent: true }))),
  B('Golpe (Plaga)', () => comprehend('plaga_sapos', 1)),
  B('Copiar (cut-in)', () => acquire('aliento_fuego')),
  B('Reliquia azar', () => { const id = randomRelic(1.5); if (id) grantRelic(id, { reveal: true }); }),
  B('Dagas', () => { grantRelic('daga_solar', { silent: true }); grantRelic('daga_lunar', { silent: true }); }),
  B('Libro Aprendizaje', () => grantRelic('libro_aprendizaje', { reveal: true })),
  B('Libro Realidad', () => grantRelic('libro_realidad', { silent: true })),
  B('+1000 oro/✦', () => { G.run.player.gold += 5000; G.run.player.essence += 1000; }),
  B('Corromper Kharaz', () => grantContinentPowers('kharaz')),
  B('Códice', () => openCodex()),
  B('Reliquias', () => openRelics()),
  B('Forja Primigenia', () => void openForge('forja_primigenia')),
  B('Academia', () => void openAcademy('altamira')),
  B('Fusión', () => void openFusion()),
  B('Libro', () => void openRealityBook()),
  B('Libro (final)', () => void openRealityBook({ forced: 'tiempo' })),
);
layer('hud').appendChild(bar);
(window as unknown as { LXG: unknown }).LXG = G;

// ?setup=1 → a mid-game Elias; ?open=codex|relics|forge|academy|fusion|book|final (&tab=...)
const q = new URLSearchParams(location.search);
if (q.get('setup')) {
  HERO_KIT.forEach((k) => acquire(k, { silent: true }));
  ['bola_fuego', 'lluvia_flechas', 'pisoton_sismico', 'canto_hipnotico', 'maldicion', 'nova_escarcha', 'rayo_cadena', 'devorar', 'frenesi', 'ola', 'parpadeo', 'escudo_arcano', 'plaga_sapos', 'aliento_fuego'].forEach((k) => acquire(k, { silent: true }));
  comprehend('luz_sagrada', 1);
  for (const id of ['daga_solar', 'daga_lunar', 'moneda_dos_caras', 'reloj_sin_agujas', 'corazon_gigante', 'anillo_cobre', 'capa_ceniza', 'lente_copista', 'dado_hueso_dios', 'escama_madre_dragon', 'libro_realidad', 'libro_aprendizaje']) grantRelic(id, { silent: true });
  G.run.player.gold = 8000; G.run.player.essence = 1200; G.run.player.alert = 40;
  if (G.meta) G.meta.pages = ['p1', 'p2'];
  grantContinentPowers('kharaz');
}
const open = q.get('open');
setTimeout(() => {
  if (open === 'codex') openCodex((q.get('tab') as 'coleccion' | 'equipo' | 'excepciones' | 'fusion' | null) ?? undefined);
  else if (open === 'relics') openRelics();
  else if (open === 'forge') void openForge('forja_primigenia');
  else if (open === 'academy') void openAcademy('altamira');
  else if (open === 'fusion') void openFusion();
  else if (open === 'book') void openRealityBook();
  else if (open === 'final') void openRealityBook({ forced: 'tiempo' });
}, 400);
