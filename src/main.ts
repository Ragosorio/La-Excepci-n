/**
 * LA EXCEPCIÓN — entry point.
 * Boot: fonts + theme → meta save → UI layers → engine → systems/scenes registration → route.
 * Dev routing: ?scene=<id> jumps directly to a scene with { debug: true, ...query } params (creates a run if needed).
 */
import '@fontsource/cinzel/latin-400.css';
import '@fontsource/cinzel/latin-700.css';
import '@fontsource/eb-garamond/latin-400.css';
import '@fontsource/eb-garamond/latin-400-italic.css';
import '@fontsource/alegreya-sans/latin-400.css';
import '@fontsource/alegreya-sans/latin-500.css';
import '@fontsource/alegreya-sans/latin-700.css';
import '@fontsource/alegreya-sans/latin-800.css';
import '@fontsource/bangers/latin-400.css';
import './ui/theme.css';

import { engine, sceneExists } from './core/engine';
import { loadMeta, loadRun, saveMeta, saveRun } from './core/save';
import { G, newRun, res } from './core/state';
import { input } from './core/input';
import { initLayers, h, layer } from './ui/dom';
import { initTooltips } from './ui/widgets';
import { initMenu } from './ui/menu';
import { audio } from './audio';
import { bus } from './core/events';
import { toast, type ToastKind } from './ui/toasts';
import './systems';
import './scenes';

declare global { interface Window { LX: unknown } }

async function boot(): Promise<void> {
  if (new URLSearchParams(location.search).has('vt')) {
    const { installVirtualTime } = await import('./dev/vt');
    installVirtualTime(new URLSearchParams(location.search).has('vtpause'));
  }
  const meta = loadMeta();
  meta.sessions += 1;
  initLayers(document.getElementById('ui-root')!);
  initTooltips();
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  engine.init(canvas, meta.settings.quality);
  engine.pipeline.reducedFlashes = meta.settings.reducedFlashes;
  engine.start();
  initMenu();
  audio.setVoiceEnabled(meta.settings.voice);
  bus.on('toast', ({ text, kind }) => toast(text, { kind: (kind as ToastKind) ?? 'info' }));
  bus.on('settings:change', ({ key, value }) => {
    if (key === 'quality') { G.meta.settings.quality = value as typeof G.meta.settings.quality; saveMeta(); }
  });

  const unlock = () => {
    void audio.unlock();
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);

  setInterval(() => { if (G.hasRun) saveRun(); else saveMeta(); }, 15000);
  window.addEventListener('beforeunload', () => { if (G.hasRun) saveRun(true); else saveMeta(); });

  // debug handle for the console
  window.LX = { engine, G, newRun, loadRun, saveRun, res, bus, input };

  // avoid a flash of fallback fonts on the first title card
  await Promise.race([document.fonts?.ready ?? Promise.resolve(), new Promise((r) => setTimeout(r, 1500))]);

  const q = new URLSearchParams(location.search);
  const target = q.get('scene');
  if (q.has('fps')) {
    const fpsEl = h('div', { class: 'lx-debug' });
    layer('debug').appendChild(fpsEl);
    setInterval(() => { fpsEl.textContent = `${engine.fps.toFixed(0)} fps · ${engine.renderer.info.render.calls} calls · ${engine.renderer.info.render.triangles} tris`; }, 500);
  }
  // touch-only devices: the game is played with keyboard and mouse
  try {
    if (matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches) {
      setTimeout(() => toast('<b>La Excepción</b> se juega con teclado y ratón. En un teléfono puedes mirar, pero no pelear.', { kind: 'info', duration: 7 }), 2500);
    }
  } catch { /* ignore */ }
  if (target && sceneExists(target)) {
    if (!loadRun()) newRun(Number(q.get('seed') ?? 1234));
    const params: Record<string, unknown> = { debug: true };
    q.forEach((v, k) => { if (k !== 'scene') params[k] = v; });
    await engine.goto(target, params, { fade: 0.3 });
  } else {
    await engine.goto('title', undefined, { fade: 0.9 });
  }
}

void boot();
