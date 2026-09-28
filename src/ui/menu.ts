/**
 * Global pause/settings menu (Esc). Scenes/panels that handle Escape themselves should call e.preventDefault().
 */
import { h, layer } from './dom';
import { button, modal, confirmModal } from './widgets';
import { engine } from '../core/engine';
import { G } from '../core/state';
import { saveMeta, saveRun, exportSave } from '../core/save';
import { audio } from '../audio';
import { dialogue } from './dialogue';

let openEl: HTMLElement | null = null;
/** Inside an embedding frame (e.g. a shared artifact) downloads are blocked: don't offer file exports there. */
function embedded(): boolean { try { return window.top !== window.self; } catch { return true; } }
let blockers = 0;
/** Scenes can block the menu (e.g. during cutscenes). */
export function blockMenu(on: boolean): void { blockers = Math.max(0, blockers + (on ? 1 : -1)); }

export function initMenu(): void {
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Escape' || e.defaultPrevented) return;
    if (document.querySelector('.lx-modal-back') || dialogue.open) return;
    if (openEl) { closeMenu(); return; }
    if (blockers > 0) return;
    if (!engine.sceneId || engine.sceneId === 'title') return;
    openMenu();
  });
}

export function closeMenu(): void {
  if (!openEl) return;
  openEl.remove(); openEl = null;
  engine.paused = false;
  audio.sfx('ui_close');
}

export function openMenu(): void {
  if (openEl) return;
  engine.paused = true;
  audio.sfx('ui_open');
  const s = G.meta.settings;
  const vol = (bus: 'master' | 'music' | 'sfx' | 'ambience', label: string) => h('div', { class: 'lx-field' },
    h('label', null, label),
    h('input', { type: 'range', class: 'lx-range', min: '0', max: '1', step: '0.05', value: String(audio.getVolume(bus)), oninput: (e: Event) => audio.setVolume(bus, Number((e.target as HTMLInputElement).value)) }));
  const sel = (label: string, value: string, opts: Array<[string, string]>, on: (v: string) => void) => h('div', { class: 'lx-field' },
    h('label', null, label),
    h('select', { class: 'lx-select', onchange: (e: Event) => { on((e.target as HTMLSelectElement).value); saveMeta(); } },
      ...opts.map(([v, l]) => h('option', { value: v, selected: v === value }, l))));
  const chk = (label: string, value: boolean, on: (v: boolean) => void) => h('label', { class: 'lx-row', style: 'cursor:pointer' },
    h('input', { type: 'checkbox', checked: value, onchange: (e: Event) => { on((e.target as HTMLInputElement).checked); saveMeta(); } }), label);

  const settings = h('div', { class: 'lx-col' },
    h('div', { class: 'lx-grid2' }, vol('master', 'Volumen general'), vol('music', 'Música'), vol('sfx', 'Efectos'), vol('ambience', 'Ambiente')),
    h('div', { class: 'lx-grid2' },
      sel('Calidad gráfica', s.quality, [['alta', 'Alta'], ['media', 'Media'], ['baja', 'Baja']], (v) => { s.quality = v as typeof s.quality; engine.setQuality(s.quality); }),
      sel('Velocidad del texto', String(s.textSpeed), [['0.6', 'Lenta'], ['1', 'Normal'], ['1.6', 'Rápida'], ['3', 'Instantánea']], (v) => { s.textSpeed = Number(v); }),
      sel('Sacudida de cámara', String(s.shake), [['0', 'Ninguna'], ['0.5', 'Suave'], ['1', 'Anime'], ['1.5', 'Exagerada']], (v) => { s.shake = Number(v); }),
      sel('Cámara de batalla', s.camera, [['tactica', 'Táctica'], ['hombro', 'Sobre el hombro']], (v) => { s.camera = v as typeof s.camera; }),
    ),
    chk('Números de daño', s.damageNumbers, (v) => { s.damageNumbers = v; }),
    chk('Reducir destellos', s.reducedFlashes, (v) => { s.reducedFlashes = v; engine.pipeline.reducedFlashes = v; }),
    chk('Voz susurrada (síntesis de voz)', s.voice, (v) => { s.voice = v; audio.setVoiceEnabled(v); }),
  );

  const box = h('div', { class: 'lx-panel', style: 'width:min(560px,92vw);max-height:88vh;overflow:auto' },
    h('div', { class: 'lx-panel-title' }, 'Pausa', h('button', { class: 'lx-panel-close', onclick: closeMenu }, '×')),
    h('div', { class: 'lx-btn-row', style: 'margin-bottom:14px' },
      button('Continuar', closeMenu, { kind: 'primary' }),
      button('Guardar', () => { saveRun(true); closeMenu(); }),
      embedded() ? null : button('Exportar partida', () => {
        const blob = new Blob([exportSave()], { type: 'application/json' });
        const a = h('a', { href: URL.createObjectURL(blob), download: 'la-excepcion-partida.json' });
        a.click();
      }, { kind: 'ghost' }),
      button('Salir al título', async () => {
        if (await confirmModal('Salir al título', 'La partida se guarda automáticamente. ¿Salir?')) { saveRun(true); closeMenu(); void engine.goto('title'); }
      }, { kind: 'ghost' }),
    ),
    h('div', { class: 'lx-title', style: 'font-size:15px;margin:6px 0' }, 'Ajustes'),
    settings,
    h('div', { class: 'lx-eclipse-sep' }, '◯'),
    h('div', { class: 'lx-small lx-muted', style: 'text-align:center' }, 'Esc para volver'),
  );
  openEl = h('div', { class: 'lx-modal-back', style: 'z-index:5' }, box);
  openEl.addEventListener('pointerdown', (e) => { if (e.target === openEl) closeMenu(); });
  layer('panel').appendChild(openEl);
}

export { modal };
