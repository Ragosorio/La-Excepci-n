/**
 * Story UI primitives: epigraph cards, the "Siempre estuve viéndote." line, prompts, hold-to-skip,
 * the logo, glitch rewrites and credits. Styles live in story.css (.st- prefix).
 */
import './story.css';
import { h, layer, wait } from '../../ui/dom';
import { audio } from '../../audio';
import { engine } from '../../core/engine';
import { G } from '../../core/state';
import { SIEMPRE, CREDITS } from '../../data/story';

// ───────────────────────────── cards on black ─────────────────────────────

/** Epigraph on black (Cinzel). Lines appear one after another; resolves after fading out. Leaves the screen black. */
export async function epigraph(lines: string[], opts: { hold?: number; stagger?: number } = {}): Promise<void> {
  const box = h('div', { class: 'st-epigraph' });
  const els = lines.map((l) => h('div', { class: 'st-epigraph-line' }, l));
  els.forEach((e) => box.appendChild(e));
  layer('fade').appendChild(box);
  await wait(60);
  box.classList.add('in');
  for (const e of els) { e.classList.add('in'); await wait((opts.stagger ?? 1.5) * 1000); }
  await wait((opts.hold ?? 2.6) * 1000);
  box.classList.add('out');
  await wait(1500);
  box.remove();
}

/** Black overlay you can raise/lower under story overlays (independent from the engine fade). */
export function blackout(): { el: HTMLElement; to(o: number, s?: number): Promise<void>; remove(): void } {
  const el = h('div', { class: 'st-black' });
  layer('fade').appendChild(el);
  return {
    el,
    async to(o: number, s = 1) {
      el.style.transition = `opacity ${s}s ease`;
      void el.offsetWidth;
      el.style.opacity = String(o);
      await wait(s * 1000 + 20);
    },
    remove() { el.remove(); },
  };
}

// ───────────────────────────── the line ─────────────────────────────

/**
 * "Siempre estuve viéndote." — same place, same typography, every time (prologue and the end of the cycle).
 * Resolves once it has faded away.
 */
export async function showSiempre(opts: { hold?: number; voice?: boolean } = {}): Promise<void> {
  const el = h('div', { class: 'st-siempre' }, SIEMPRE);
  layer('narrator').appendChild(el);
  audio.stinger('siempre');
  audio.sfx('whisper', { volume: 0.55 });
  if (opts.voice !== false && G.meta?.settings.voice) audio.speak(SIEMPRE, { pitch: 0.55, rate: 0.78 });
  await wait(40);
  el.classList.add('in');
  await wait((opts.hold ?? 4.2) * 1000 + 2400);
  el.classList.remove('in');
  el.classList.add('out');
  await wait(2600);
  el.remove();
}

/** Centered book-style line (EB Garamond italic). */
export async function centerLine(text: string, opts: { hold?: number; cls?: string; fadeIn?: number } = {}): Promise<void> {
  const el = h('div', { class: `st-center ${opts.cls ?? ''}` }, text);
  layer('narrator').appendChild(el);
  await wait(40);
  el.classList.add('in');
  await wait((opts.hold ?? Math.max(2.4, text.length * 0.06)) * 1000 + (opts.fadeIn ?? 1.4) * 1000);
  el.classList.remove('in');
  await wait(1300);
  el.remove();
}

// ───────────────────────────── prompts ─────────────────────────────

export interface PromptHandle { el: HTMLElement; remove(): void }

/** "[E] Hablar" style prompt, bottom center. */
export function keyPrompt(key: string, label: string): PromptHandle {
  const el = h('div', { class: 'st-keyprompt' }, h('span', { class: 'st-key' }, key), h('span', { class: 'st-keylabel' }, label));
  layer('hud').appendChild(el);
  requestAnimationFrame(() => el.classList.add('in'));
  return { el, remove: () => { el.classList.remove('in'); setTimeout(() => el.remove(), 400); } };
}

/** Big pulsing "[Clic]" prompt. Resolves on click / Space / Enter. */
export function clickPrompt(label = 'Clic'): Promise<void> {
  return new Promise((resolve) => {
    const el = h('div', { class: 'st-clickprompt' }, h('span', { class: 'st-clickring' }), h('span', { class: 'st-clicklabel' }, `[${label}]`));
    layer('hud').appendChild(el);
    requestAnimationFrame(() => el.classList.add('in'));
    const done = () => {
      window.removeEventListener('pointerdown', onPtr, true);
      window.removeEventListener('keydown', onKey, true);
      el.classList.add('hit');
      setTimeout(() => el.remove(), 500);
      resolve();
    };
    const onPtr = (e: PointerEvent) => { if (e.button === 0) done(); };
    const onKey = (e: KeyboardEvent) => { if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); done(); } };
    // small delay so the click that ended a previous beat doesn't trigger it
    setTimeout(() => {
      window.addEventListener('pointerdown', onPtr, true);
      window.addEventListener('keydown', onKey, true);
    }, 350);
  });
}

/** Small instruction pill at the bottom (tutorial hints). */
export function hint(text: string, seconds = 4): PromptHandle {
  const el = h('div', { class: 'st-hint' }, text);
  layer('hud').appendChild(el);
  requestAnimationFrame(() => el.classList.add('in'));
  let gone = false;
  const remove = () => { if (gone) return; gone = true; el.classList.remove('in'); setTimeout(() => el.remove(), 500); };
  if (seconds > 0) setTimeout(remove, seconds * 1000);
  return { el, remove };
}

/**
 * Hold Space/Esc to skip (repeat cycles). Shows a ring that fills while held.
 * Returns a disposer. `onSkip` fires once.
 */
export function holdToSkip(onSkip: () => void, label = 'Mantén Espacio para saltar', holdSeconds = 1.1): () => void {
  const ring = h('div', { class: 'st-skipring' });
  const el = h('div', { class: 'st-holdskip' }, ring, h('span', null, label));
  layer('hud').appendChild(el);
  let held = 0; let down = false; let fired = false; let raf = 0; let last = performance.now();
  const onDown = (e: KeyboardEvent) => {
    if (e.code === 'Space' || e.code === 'Escape') { down = true; el.classList.add('active'); if (e.code === 'Escape') e.preventDefault(); }
  };
  const onUp = (e: KeyboardEvent) => { if (e.code === 'Space' || e.code === 'Escape') { down = false; } };
  const tick = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    held = down ? held + dt : Math.max(0, held - dt * 2);
    ring.style.setProperty('--p', String(Math.min(1, held / holdSeconds)));
    if (!down && held <= 0) el.classList.remove('active');
    if (held >= holdSeconds && !fired) { fired = true; dispose(); onSkip(); return; }
    raf = requestAnimationFrame(tick);
  };
  window.addEventListener('keydown', onDown, true);
  window.addEventListener('keyup', onUp, true);
  raf = requestAnimationFrame(tick);
  function dispose() {
    cancelAnimationFrame(raf);
    window.removeEventListener('keydown', onDown, true);
    window.removeEventListener('keyup', onUp, true);
    el.remove();
  }
  return dispose;
}

/** Discreet "Saltar" text button (top-right). */
export function skipButton(onSkip: () => void, label = 'Saltar'): () => void {
  const el = h('button', { class: 'st-skipbtn', onclick: () => { dispose(); onSkip(); } }, label);
  layer('hud').appendChild(el);
  function dispose() { el.remove(); }
  return dispose;
}

// ───────────────────────────── logo ─────────────────────────────

const ECLIPSE_O = `<svg class="st-logo-o" viewBox="0 0 100 100" aria-hidden="true">
  <defs><radialGradient id="stCorona" cx="50%" cy="50%" r="50%"><stop offset="62%" stop-color="#f5d99a" stop-opacity="0"/><stop offset="70%" stop-color="#fff4d6" stop-opacity=".95"/><stop offset="78%" stop-color="#d9b36c" stop-opacity=".55"/><stop offset="100%" stop-color="#9b5cff" stop-opacity="0"/></radialGradient></defs>
  <circle cx="50" cy="54" r="46" fill="url(#stCorona)"/>
  <circle cx="50" cy="54" r="33" fill="#07040b"/>
  <path d="M56 4 L68 0" stroke="#f5d99a" stroke-width="5" stroke-linecap="round"/>
</svg>`;

/** Story's own logo (HTML). Uses the art agent's logoSVG() when available (see resolveLogo). */
export function fallbackLogo(): string {
  return `<div class="st-logo"><div class="st-logo-la">LA</div><div class="st-logo-word">EXCEPCI${ECLIPSE_O}N</div></div>`;
}

// Optional art-module logo: lazily probe a whitelist of files (never the dev lab, which has side effects).
const artLoaders = import.meta.glob('../../ui/art/{index,logo,logos,icons,icon,brand,symbols,emblems,ui}.ts');
let artLogo: (() => string) | null | undefined;

export async function resolveLogo(): Promise<string> {
  if (artLogo === undefined) {
    artLogo = null;
    for (const load of Object.values(artLoaders)) {
      try {
        const m = (await load()) as Record<string, unknown>;
        if (typeof m.logoSVG === 'function') { artLogo = m.logoSVG as () => string; break; }
      } catch { /* ignore */ }
    }
  }
  if (artLogo) {
    try { const s = artLogo(); if (s && s.length > 20) return `<div class="st-logo st-logo-art">${s}</div>`; } catch { /* fall through */ }
  }
  return fallbackLogo();
}

/** The title reveal after the prologue: LA EXCEPCIÓN on black. */
export async function logoCard(hold = 3.4): Promise<void> {
  const html = await resolveLogo();
  const el = h('div', { class: 'st-logocard', html });
  layer('fade').appendChild(el);
  audio.sfx('bell', { volume: 0.7 });
  audio.stinger('cycle');
  await wait(60);
  el.classList.add('in');
  await wait(hold * 1000 + 1600);
  el.classList.add('out');
  await wait(1400);
  el.remove();
}

// ───────────────────────────── glitch rewrite (ending) ─────────────────────────────

const GLITCH_CHARS = 'ÆØ§¶∆◊ΞΨЖ#%&*¿?—/\\|<>░▒▓';

/**
 * Shows `lines[0]`, then rewrites it in place into each following line with a glitch
 * (chromatic pulse + impact frames + scrambled characters). Resolves after the last one holds.
 */
export async function rewriteGlitch(lines: string[], opts: { hold?: number } = {}): Promise<HTMLElement> {
  const el = h('div', { class: 'st-rewrite' });
  layer('narrator').appendChild(el);
  el.textContent = lines[0];
  await wait(40);
  el.classList.add('in');
  await wait((opts.hold ?? 3) * 1000 + 800);
  for (let i = 1; i < lines.length; i++) {
    const from = lines[i - 1]; const to = lines[i];
    el.classList.add('glitch');
    audio.sfx('glitch', { volume: 0.9 });
    engine.pipeline.chromaticPulse(2.2, 0.9);
    engine.pipeline.impact(2, i % 2 === 0 ? 0 : 1);
    const steps = 14;
    for (let s = 0; s < steps; s++) {
      const k = s / (steps - 1);
      const len = Math.round(from.length + (to.length - from.length) * k);
      let out = '';
      for (let c = 0; c < len; c++) {
        const src = k < 0.5 ? from : to;
        const ch = src.charAt(c) || ' ';
        out += Math.random() < 0.45 * Math.sin(k * Math.PI) + 0.08 && ch !== ' ' ? GLITCH_CHARS.charAt((Math.random() * GLITCH_CHARS.length) | 0) : ch;
      }
      el.textContent = out;
      await wait(55);
    }
    el.textContent = to;
    el.classList.remove('glitch');
    if (i === lines.length - 1) el.classList.add('first');
    await wait((opts.hold ?? 3) * 1000);
  }
  return el;
}

export async function fadeOutEl(el: HTMLElement, ms = 1200): Promise<void> {
  el.classList.remove('in');
  el.classList.add('out');
  await wait(ms);
  el.remove();
}

// ───────────────────────────── credits ─────────────────────────────

/** Short, elegant credits on black. Click / Space speeds through. */
export async function rollCredits(): Promise<void> {
  const box = h('div', { class: 'st-credits' });
  layer('fade').appendChild(box);
  await wait(50);
  box.classList.add('in');
  let fast = false;
  const onKey = (e: KeyboardEvent) => { if (e.code === 'Space' || e.code === 'Enter' || e.code === 'Escape') { e.preventDefault(); fast = true; } };
  const onPtr = () => { fast = true; };
  window.addEventListener('keydown', onKey, true);
  box.addEventListener('pointerdown', onPtr);
  try {
    // group lines into blocks separated by gaps
    const blocks: typeof CREDITS[] = [[]];
    for (const c of CREDITS) { if (c.gap) blocks.push([]); else blocks[blocks.length - 1].push(c); }
    for (const b of blocks.filter((x) => x.length)) {
      const blk = h('div', { class: 'st-credits-block' }, ...b.map((c) => h('div', { class: c.big ? 'big' : c.line ? 'line' : 'small' }, c.big ?? c.line ?? c.small ?? '')));
      box.appendChild(blk);
      await wait(40);
      blk.classList.add('in');
      await wait(fast ? 500 : 3200);
      blk.classList.remove('in');
      await wait(fast ? 300 : 1100);
      blk.remove();
    }
  } finally {
    window.removeEventListener('keydown', onKey, true);
    box.classList.remove('in');
    await wait(800);
    box.remove();
  }
}

/** Credits as a dismissable overlay (title menu). */
export function creditsOverlay(): Promise<void> {
  return new Promise((resolve) => {
    const close = () => { back.remove(); window.removeEventListener('keydown', onKey, true); resolve(); };
    const onKey = (e: KeyboardEvent) => { if (e.code === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } };
    const back = h('div', { class: 'st-overlay', onclick: close },
      h('div', { class: 'st-credits-static' },
        ...CREDITS.map((c) => (c.gap ? h('div', { class: 'gap' }) : h('div', { class: c.big ? 'big' : c.line ? 'line' : 'small' }, c.big ?? c.line ?? c.small ?? ''))),
        h('div', { class: 'st-overlay-hint' }, 'Clic para cerrar')));
    window.addEventListener('keydown', onKey, true);
    layer('modal').appendChild(back);
  });
}

// ───────────────────────────── Fragment cards ─────────────────────────────

/**
 * Fragment title card (Cinzel on black) that covers a scene switch: fades to black, shows the Fragment,
 * switches scene underneath, then reveals the new scene.
 */
export async function fragmentGoto(scene: string, params: unknown, f: { title: string; subtitle?: string }, hold = 3.2): Promise<void> {
  const el = h('div', { class: 'st-fragment' },
    h('div', { class: 'st-fragment-k' }, 'Fragmento'),
    h('div', { class: 'st-fragment-t' }, f.title),
    f.subtitle ? h('div', { class: 'st-fragment-s' }, f.subtitle) : null);
  layer('fade').appendChild(el);
  await wait(30);
  el.classList.add('in');
  await wait(1250);
  el.classList.add('show');
  audio.sfx('page_turn', { volume: 0.5, pitch: 0.7 });
  const going = engine.goto(scene, params, { instant: true });
  await wait(hold * 1000);
  await going;
  el.classList.add('out');
  await wait(1600);
  el.remove();
}
