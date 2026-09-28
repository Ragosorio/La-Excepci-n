/**
 * Feedback UI: toasts, big banners, anime cut-ins, "EXCEPCIÓN ADQUIRIDA", loot reveal cards.
 */
import { h, layer, wait } from './dom';
import { audio } from '../audio';
import type { Rarity } from '../data/types';
import { portraitSVG } from './art/portraits';
import { engine } from '../core/engine';

let toastBox: HTMLElement | null = null;

export type ToastKind = 'info' | 'good' | 'bad' | 'gold' | Rarity;

export function toast(text: string, opts: { icon?: string; kind?: ToastKind; duration?: number; sound?: boolean } = {}): void {
  if (!toastBox || !toastBox.isConnected) { toastBox = h('div', { class: 'lx-toasts' }); layer('toast').appendChild(toastBox); }
  const el = h('div', { class: `lx-toast ${opts.kind ?? 'info'}` }, opts.icon ? h('span', { html: opts.icon, style: 'display:inline-flex' }) : null, h('span', { html: text }));
  toastBox.appendChild(el);
  while (toastBox.children.length > 6) toastBox.firstElementChild?.remove();
  if (opts.sound) audio.sfx(opts.kind === 'bad' ? 'ui_error' : 'ui_confirm', { volume: 0.5 });
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 320); }, (opts.duration ?? 3.2) * 1000);
}

export type BannerKind = 'victory' | 'defeat' | 'excepcion' | 'name' | 'gold' | 'jackpot' | 'info';

export async function banner(title: string, subtitle?: string, opts: { kind?: BannerKind; duration?: number } = {}): Promise<void> {
  const el = h('div', { class: `lx-banner ${opts.kind ?? 'info'}` },
    h('div', { class: 'lx-banner-band' }),
    h('div', { class: 'lx-banner-title' }, title),
    subtitle ? h('div', { class: 'lx-banner-sub' }, subtitle) : null);
  layer('toast').appendChild(el);
  await wait((opts.duration ?? 2.2) * 1000);
  el.classList.add('out');
  await wait(460);
  el.remove();
}

export interface CutinOpts { portrait: string; title: string; subtitle?: string; colors?: [string, string]; side?: 'left' | 'right'; duration?: number; slowmo?: boolean }

/** Anime cut-in: diagonal band + portrait sweep + big text. ~1.5s. */
export async function cutin(o: CutinOpts): Promise<void> {
  const [c1, c2] = o.colors ?? ['#2a1150', '#9b5cff'];
  const el = h('div', { class: `lx-cutin ${o.side ?? 'left'}`, style: `--c1:${c1};--c2:${c2}` },
    h('div', { class: 'lx-cutin-band' }, h('div', { class: 'lx-cutin-lines' })),
    h('div', { class: 'lx-cutin-portrait', html: o.portrait }),
    h('div', { class: 'lx-cutin-text' }, h('div', { class: 'lx-cutin-title' }, o.title), o.subtitle ? h('div', { class: 'lx-cutin-sub' }, o.subtitle) : null));
  layer('cutin').appendChild(el);
  if (o.slowmo !== false) engine.slowmo(0.2, 1.4);
  engine.pipeline.setSpeedLines(0.6);
  audio.sfx('whoosh');
  await wait((o.duration ?? 1.5) * 1000);
  engine.pipeline.setSpeedLines(0);
  el.remove();
}

/** The signature moment: an ability copied by La Excepción. */
export async function excepcionAcquired(abilityName: string, opts: { color?: string; school?: string } = {}): Promise<void> {
  audio.stinger('excepcion');
  engine.pipeline.impact(2, 1);
  engine.pipeline.chromaticPulse(1.2, 0.8);
  await cutin({
    portrait: portraitSVG({ seed: 'elias', race: 'excepcion', special: 'elias', mood: 'smug', glowEyes: true }, 520),
    title: '¡EXCEPCIÓN!',
    subtitle: abilityName.toUpperCase(),
    colors: ['#1a0b33', opts.color ?? '#9b5cff'],
    side: 'right',
    duration: 1.6,
  });
}

export interface LootItem { name: string; rarity: Rarity; svg: string; desc?: string }
const RAR_COL: Record<Rarity, string> = { comun: '#c8c8c8', pococomun: '#1eff00', rara: '#2f8cff', epica: '#a335ee', legendaria: '#ff8000', mitica: '#e6cc80' };
const RAR_NAME: Record<Rarity, string> = { comun: 'Común', pococomun: 'Poco común', rara: 'Rara', epica: 'Épica', legendaria: 'Legendaria', mitica: 'Mítica' };
const RAR_SFX: Record<Rarity, Parameters<typeof audio.sfx>[0]> = { comun: 'loot_common', pococomun: 'loot_common', rara: 'loot_rare', epica: 'loot_epic', legendaria: 'loot_legendary', mitica: 'loot_mythic' };

/** Card-flip loot reveal. Click each card (or anywhere) to flip; resolves when closed. */
export function lootReveal(items: LootItem[], title = 'Botín'): Promise<void> {
  return new Promise((resolve) => {
    if (!items.length) { resolve(); return; }
    const row = h('div', { class: 'lx-loot-row' });
    const cont = h('div', { class: 'lx-btn-row' });
    const root = h('div', { class: 'lx-loot' }, h('div', { class: 'lx-title', style: 'font-size:28px' }, title), row, cont);
    let flipped = 0;
    const cards = items.map((it) => {
      const card = h('div', { class: 'lx-loot-card', style: `--rc:${RAR_COL[it.rarity]}` },
        h('div', { class: 'lx-loot-inner' },
          h('div', { class: 'lx-loot-face lx-loot-back' }, h('div', { class: 'lx-title', style: 'font-size:40px;opacity:.8' }, '?')),
          h('div', { class: 'lx-loot-face lx-loot-front' },
            h('div', { html: it.svg }),
            h('div', { class: 'lx-loot-name' }, it.name),
            h('div', { class: 'lx-loot-rar', style: `color:${RAR_COL[it.rarity]}` }, RAR_NAME[it.rarity]),
            it.desc ? h('div', { class: 'lx-loot-desc' }, it.desc) : null)));
      const flip = () => {
        if (card.classList.contains('flipped')) return;
        card.classList.add('flipped');
        audio.sfx(RAR_SFX[it.rarity]);
        if (it.rarity === 'legendaria' || it.rarity === 'mitica') { engine.pipeline.flash(RAR_COL[it.rarity], 0.35, 0.5); }
        flipped++;
        if (flipped === items.length) showClose();
      };
      card.addEventListener('click', (e) => { e.stopPropagation(); flip(); });
      row.appendChild(card);
      return { card, flip };
    });
    const showClose = () => {
      cont.innerHTML = '';
      const b = h('button', { class: 'lx-btn primary big', onclick: () => { root.remove(); resolve(); } }, 'Continuar');
      cont.appendChild(b);
    };
    const flipAll = h('button', { class: 'lx-btn ghost', onclick: async () => { for (const c of cards) { c.flip(); await wait(180); } } }, 'Revelar todo');
    cont.appendChild(flipAll);
    layer('modal').appendChild(root);
  });
}
