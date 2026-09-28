/**
 * Visual-novel dialogue box with anime portraits, typewriter text, and choices.
 *   await dialogue.say([{ speaker: 'Aurel', portrait: { seed:'aurel', race:'humano', special:'aurel' }, text: 'Nadie tiene que salir herido.' }]);
 *   const pick = await dialogue.ask({ speaker: 'Tiburcio', portrait: ..., text: '¿Qué onda, patojo?' }, [{ id:'a', text:'Apostar' }, ...]);
 * Text supports *emphasis* (violet italic) and {name}/{title} tokens (player's current name).
 */
import { h, layer, clear, wait } from './dom';
import { portraitSVG, type PortraitSpec } from './art/portraits';
import { audio } from '../audio';
import { G } from '../core/state';
import { input } from '../core/input';

export interface DialogueLine {
  speaker?: string;
  title?: string;                         // small subtitle next to the name
  portrait?: PortraitSpec | string | null; // spec or raw SVG
  side?: 'left' | 'right';
  text: string;
  speed?: number;                         // chars/sec multiplier
  voice?: 'blip' | 'deep' | 'none';
  auto?: number;                          // auto-advance after N seconds
}
export interface DialogueChoice { id: string; text: string; hint?: string; disabled?: boolean; tip?: string }

let root: HTMLElement | null = null;
let isOpen = false;

function fill(text: string): string {
  const name = G.run?.player?.name ?? 'Elias Veyr';
  return text.replace(/\{name\}/g, name).replace(/\{title\}/g, name);
}

function renderRich(text: string): string {
  const safe = text.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));
  return safe.replace(/\*(.+?)\*/g, '<em>$1</em>');
}

function ensureRoot(): HTMLElement {
  if (!root) { root = h('div', { class: 'lx-dlg' }); }
  if (!root.isConnected) layer('dialogue').appendChild(root);
  return root;
}

async function typeLine(line: DialogueLine, withChoices?: DialogueChoice[]): Promise<string | null> {
  const r = ensureRoot();
  clear(r);
  r.classList.remove('has-choices');
  const side = line.side ?? (line.portrait && typeof line.portrait !== 'string' && line.portrait.special?.startsWith('elias') ? 'right' : 'left');
  if (line.portrait) {
    const svg = typeof line.portrait === 'string' ? line.portrait : portraitSVG(line.portrait, 400);
    const p = h('div', { class: `lx-dlg-portrait ${side} enter-${side}`, html: svg });
    r.appendChild(p);
    requestAnimationFrame(() => p.classList.remove(`enter-${side}`));
  }
  const textEl = h('div', { class: 'lx-dlg-text' });
  const nextEl = h('div', { class: 'lx-dlg-next' }, '▼');
  nextEl.style.visibility = 'hidden';
  const box = h('div', { class: 'lx-dlg-box' },
    line.speaker ? h('div', { class: `lx-dlg-name ${side === 'right' ? 'right' : ''}` }, fill(line.speaker), line.title ? h('span', { class: 'lx-dlg-title' }, line.title) : null) : null,
    textEl, nextEl);
  r.appendChild(box);

  const full = fill(line.text);
  const cps = 42 * (line.speed ?? 1) * (G.meta?.settings.textSpeed ?? 1);
  let shown = 0;
  let skip = false;
  let advance = false;
  const onClick = () => { if (shown < full.length) skip = true; else advance = true; };
  box.addEventListener('click', onClick);
  const onKey = (e: KeyboardEvent) => {
    if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); onClick(); }
  };
  window.addEventListener('keydown', onKey);
  const prevInput = input.enabled;
  input.enabled = false;
  try {
    let acc = 0;
    let last = performance.now();
    while (shown < full.length) {
      await new Promise((res) => requestAnimationFrame(res));
      const now = performance.now();
      acc += ((now - last) / 1000) * cps;
      last = now;
      if (skip) { shown = full.length; }
      else {
        const add = Math.floor(acc);
        if (add > 0) {
          acc -= add;
          const prev = shown;
          shown = Math.min(full.length, shown + add);
          const ch = full.charAt(prev);
          if (line.voice !== 'none' && ch.trim() && prev % 2 === 0) audio.sfx('typewriter', { volume: 0.25, pitch: line.voice === 'deep' ? 0.7 : 1 });
          if ('.!?'.includes(ch)) { await wait(90); last = performance.now(); }
        }
      }
      textEl.innerHTML = renderRich(full.slice(0, shown));
    }
    textEl.innerHTML = renderRich(full);
    if (withChoices?.length) {
      return await new Promise<string>((resolve) => {
        const list = h('div', { class: `lx-dlg-choices ${withChoices.length > 3 ? 'many' : ''}` });
        r.classList.add('has-choices');
        const pick = (c: DialogueChoice) => { if (c.disabled) return; audio.sfx('ui_confirm'); window.removeEventListener('keydown', onChoiceKey); resolve(c.id); };
        const onChoiceKey = (e: KeyboardEvent) => {
          const n = Number(e.key);
          if (n >= 1 && n <= withChoices.length) pick(withChoices[n - 1]);
        };
        window.addEventListener('keydown', onChoiceKey);
        withChoices.forEach((c, i) => {
          list.appendChild(h('div', { class: `lx-dlg-choice ${c.disabled ? 'disabled' : ''}`, 'data-tip': c.tip, onclick: () => pick(c), onmouseenter: () => audio.sfx('ui_hover', { volume: 0.3 }) },
            h('span', { class: 'lx-kbd' }, String(i + 1)), h('span', { html: renderRich(fill(c.text)) }), c.hint ? h('span', { class: 'lx-dlg-hint' }, c.hint) : null));
        });
        box.appendChild(list);
      });
    }
    nextEl.style.visibility = 'visible';
    const autoAt = line.auto ? performance.now() + line.auto * 1000 : Infinity;
    while (!advance && performance.now() < autoAt) await new Promise((res) => requestAnimationFrame(res));
    return null;
  } finally {
    box.removeEventListener('click', onClick);
    window.removeEventListener('keydown', onKey);
    input.enabled = prevInput;
  }
}

export const dialogue = {
  get open(): boolean { return isOpen; },
  /** Show one or more lines; resolves when the player has read them all. */
  async say(lines: DialogueLine | DialogueLine[]): Promise<void> {
    const arr = Array.isArray(lines) ? lines : [lines];
    isOpen = true;
    audio.duck(0.45, 600);
    try {
      for (const l of arr) await typeLine(l);
    } finally {
      this.close();
    }
  },
  /** Show a line with choices; resolves with the chosen id. Keeps the box open if `keepOpen`. */
  async ask(line: DialogueLine, choices: DialogueChoice[], keepOpen = false): Promise<string> {
    isOpen = true;
    audio.duck(0.45, 600);
    try {
      const id = await typeLine(line, choices);
      return id ?? choices[0].id;
    } finally {
      if (!keepOpen) this.close();
    }
  },
  close(): void {
    isOpen = false;
    audio.duck(0, 0);
    if (root) clear(root);
  },
};
