import { h, layer, wait } from './dom';

let fadeEl: HTMLElement | null = null;
function ensureFade(): HTMLElement {
  if (!fadeEl) {
    fadeEl = h('div', { class: 'lx-fade' });
    layer('fade').appendChild(fadeEl);
  }
  return fadeEl;
}

/** Fade the black overlay to `opacity` over `seconds`. */
export async function fadeTo(opacity: number, seconds: number): Promise<void> {
  const el = ensureFade();
  el.style.transition = seconds > 0 ? `opacity ${seconds}s ease` : 'none';
  el.style.pointerEvents = opacity > 0.5 ? 'auto' : 'none';
  // force style flush so transition applies
  void el.offsetWidth;
  el.style.opacity = String(opacity);
  if (seconds > 0) await wait(seconds * 1000 + 30);
}

/** Title card on black (e.g. Fragment names). Leaves the screen black. */
export async function titleCard(title: string, subtitle?: string, hold = 2.4): Promise<void> {
  await fadeTo(1, 0.3);
  const card = h('div', { class: 'lx-titlecard' },
    h('div', { class: 'lx-titlecard-title' }, title),
    subtitle ? h('div', { class: 'lx-titlecard-sub' }, subtitle) : null,
  );
  layer('fade').appendChild(card);
  await wait(50);
  card.classList.add('in');
  await wait(hold * 1000);
  card.classList.remove('in');
  card.classList.add('out');
  await wait(900);
  card.remove();
}
