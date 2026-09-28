/**
 * The fate dial: a dramatic outcome reveal for risky location actions.
 * Outcome first (rolled up-front, honest odds shown), presentation second: the needle spins and lands
 * inside the arc of the already-decided result.
 */
import { h, wait } from '../../ui/dom';
import { modal } from '../../ui/widgets';
import { audio } from '../../audio';
import { engine } from '../../core/engine';

export type RollResult = 'crit' | 'success' | 'fail';

export interface RollOpts {
  title: string;
  subtitle?: string;
  chance: number;       // 0..1 success (includes crit)
  crit?: number;        // 0..1 crit share of the success arc (default 0.2)
  flavor?: string;
  color?: string;       // success arc color
}

const arcPath = (a0: number, a1: number, r: number) => {
  const p = (a: number) => `${50 + Math.sin(a) * r} ${50 - Math.cos(a) * r}`;
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M ${p(a0)} A ${r} ${r} 0 ${large} 1 ${p(a1)}`;
};

export async function rollDial(o: RollOpts): Promise<RollResult> {
  const chance = Math.max(0.02, Math.min(0.98, o.chance));
  const critShare = o.crit ?? 0.2;
  const r = Math.random();
  const result: RollResult = r < chance * critShare ? 'crit' : r < chance ? 'success' : 'fail';
  const TAU = Math.PI * 2;
  const sEnd = chance * TAU, cEnd = chance * critShare * TAU;
  const color = o.color ?? '#b27dff';
  const svg = `<svg viewBox="0 0 100 100" class="loc-dial-svg">
    <circle cx="50" cy="50" r="40" class="loc-dial-bg"/>
    <path d="${arcPath(0.0001, TAU - 0.0001, 40)}" class="loc-dial-fail"/>
    <path d="${arcPath(0, Math.max(0.001, sEnd), 40)}" class="loc-dial-ok" style="stroke:${color}"/>
    <path d="${arcPath(0, Math.max(0.001, cEnd), 40)}" class="loc-dial-crit"/>
    <circle cx="50" cy="50" r="30" class="loc-dial-core"/>
    <g class="loc-dial-needle"><path d="M50 50 L48 16 L50 10 L52 16 Z"/><circle cx="50" cy="50" r="4"/></g>
  </svg>`;
  const dial = h('div', { class: 'loc-dial', html: svg });
  const pct = h('div', { class: 'loc-dial-pct' }, `${Math.round(chance * 100)}%`);
  const verdict = h('div', { class: 'loc-dial-verdict' });
  const cont = h('div', { class: 'loc-dial-cont' });
  const body = h('div', { class: 'loc-roll' },
    o.subtitle ? h('div', { class: 'loc-roll-sub' }, o.subtitle) : null,
    h('div', { class: 'loc-dial-wrap' }, dial, pct),
    h('div', { class: 'loc-roll-legend' },
      h('span', { class: 'crit' }, 'Crítico'), h('span', { class: 'ok', style: `--c:${color}` }, 'Éxito'), h('span', { class: 'fail' }, 'Fracaso')),
    o.flavor ? h('div', { class: 'loc-roll-flavor' }, o.flavor) : null,
    verdict, cont);
  let closeFn: ((v: string | null) => void) | null = null;
  const done = modal({ title: o.title, body, dismissable: false, className: 'loc-roll-modal', onOpen: (_r, close) => { closeFn = close; } });
  // choose the landing angle inside the decided arc
  const pad = 0.04;
  let target: number;
  if (result === 'crit') target = cEnd * (pad + Math.random() * (1 - pad * 2));
  else if (result === 'success') target = cEnd + (sEnd - cEnd) * (pad + Math.random() * (1 - pad * 2));
  else target = sEnd + (TAU - sEnd) * (pad + Math.random() * (1 - pad * 2));
  const needle = dial.querySelector('.loc-dial-needle') as SVGGElement | null;
  const spins = 3 + Math.floor(Math.random() * 2);
  const total = spins * TAU + target;
  const dur = 1900;
  const t0 = performance.now();
  let lastTick = 0;
  audio.sfx('dice_roll', { volume: 0.6 });
  await new Promise<void>((resolve) => {
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - k, 4);
      const a = total * e;
      needle?.setAttribute('transform', `rotate(${(a * 180) / Math.PI} 50 50)`);
      const tick = Math.floor(a / (TAU / 24));
      if (tick !== lastTick) { lastTick = tick; audio.sfx('wheel_tick', { volume: 0.25, pitch: 0.8 + e * 0.6 }); }
      if (k < 1) requestAnimationFrame(step); else resolve();
    };
    requestAnimationFrame(step);
  });
  audio.sfx('dice_land');
  await wait(180);
  dial.classList.add(`res-${result}`);
  verdict.className = `loc-dial-verdict show ${result}`;
  verdict.textContent = result === 'crit' ? '¡ÉXITO CRÍTICO!' : result === 'success' ? '¡ÉXITO!' : 'FRACASO';
  if (result === 'fail') { audio.sfx('ui_error'); engine.pipeline.flash('#e2455b', 0.25, 0.4); }
  else { audio.sfx(result === 'crit' ? 'level_up' : 'buff'); engine.pipeline.flash(result === 'crit' ? '#ffe066' : '#c7a2ff', result === 'crit' ? 0.4 : 0.25, 0.4); if (result === 'crit') engine.pipeline.impact(2, 1); }
  await wait(650);
  const btn = h('button', { class: 'lx-btn primary', onclick: () => closeFn?.('ok') }, 'Continuar');
  cont.appendChild(btn);
  const onKey = (e: KeyboardEvent) => { if (e.code === 'Enter' || e.code === 'Space' || e.code === 'Escape') { e.preventDefault(); closeFn?.('ok'); } };
  window.addEventListener('keydown', onKey, true);
  await done;
  window.removeEventListener('keydown', onKey, true);
  return result;
}

/** Summarize consequences as colored chips (after an action). */
export function consequences(items: Array<{ label: string; good?: boolean }>): HTMLElement {
  return h('div', { class: 'loc-cons' }, items.map((i) => h('span', { class: `loc-con ${i.good ? 'good' : 'bad'}` }, i.label)));
}
