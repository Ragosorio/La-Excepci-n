/**
 * Painted 2D vignettes for the prologue: the pre-dawn breakfast in Las Colmenas, and the rainy kitchen where the
 * parents listen. Pure SVG + CSS animation (steam, lamp flicker, rain, Bruma's tail).
 */
import { h, layer, wait } from '../../ui/dom';

function stars(): string {
  let s = '';
  const pts = [[640, 190], [700, 150], [760, 215], [835, 140], [900, 190], [955, 235], [668, 260], [880, 265], [730, 280], [805, 190]];
  for (const [x, y] of pts) s += `<circle cx="${x}" cy="${y}" r="${1.2 + ((x * 7 + y) % 3) * 0.5}" fill="#fff" class="st-twinkle" style="animation-delay:${((x + y) % 9) * 0.37}s"/>`;
  return s;
}

function towers(rain: boolean): string {
  const t = [[630, 470, 60, 160], [700, 440, 48, 190], [770, 480, 66, 140], [860, 430, 52, 200], [930, 470, 58, 150]];
  let s = '';
  for (const [x, y, w, hgt] of t) {
    const top = y - hgt * 0.35;
    s += `<path d="M${x - w / 2} 560 L${x - w / 2} ${top} L${x} ${top - 28} L${x + w / 2} ${top} L${x + w / 2} 560 Z" fill="${rain ? '#262b38' : '#15132a'}"/>`;
    for (let r = 0; r < 5; r++) for (let c = 0; c < 2; c++) {
      if ((x + r * 3 + c * 5) % 3 === 0) continue;
      const lit = rain ? (x + r) % 4 === 0 : (x + r + c) % 2 === 0;
      s += `<rect x="${x - w / 2 + 10 + c * (w - 26)}" y="${top + 16 + r * 26}" width="7" height="11" rx="1" fill="${lit ? '#ffcf7a' : '#221f33'}" ${lit ? 'filter="url(#stGlow)"' : ''}/>`;
    }
  }
  return s;
}

function rainLines(): string {
  let s = '';
  for (let i = 0; i < 46; i++) {
    const x = 600 + ((i * 53) % 400), y = 200 + ((i * 97) % 340), l = 20 + (i % 5) * 6;
    s += `<line x1="${x}" y1="${y}" x2="${x - 5}" y2="${y + l}" stroke="#c9d3e6" stroke-opacity=".45" stroke-width="1.4" class="st-rainline" style="animation-delay:${(i % 11) * 0.09}s"/>`;
  }
  return s;
}

export function kitchenSVG(mood: 'dawn' | 'rain'): string {
  const rain = mood === 'rain';
  const sky = rain
    ? '<stop offset="0" stop-color="#2f3647"/><stop offset=".6" stop-color="#4c5668"/><stop offset="1" stop-color="#707c8e"/>'
    : '<stop offset="0" stop-color="#0f1430"/><stop offset=".45" stop-color="#2a2a52"/><stop offset=".78" stop-color="#6a4f78"/><stop offset="1" stop-color="#d49a88"/>';
  const planks = Array.from({ length: 18 }, (_, i) => `<line x1="${i * 92 + 20}" y1="0" x2="${i * 92 + 20}" y2="900" stroke="#000" stroke-opacity=".18" stroke-width="3"/>`).join('');
  const steam = (x: number) => [0, 1, 2].map((k) => `<path class="st-steam" style="animation-delay:${k * 1.1}s" d="M${x - 14 + k * 14} 680 c -12 -24, 14 -40, 0 -64 c -12 -22, 12 -38, 2 -58" fill="none" stroke="#fff" stroke-opacity=".3" stroke-width="5" stroke-linecap="round"/>`).join('');
  return `
<svg class="st-vig-svg" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="stWall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${rain ? '#241915' : '#2b1b15'}"/><stop offset="1" stop-color="#150d0a"/></linearGradient>
    <linearGradient id="stSky" x1="0" y1="0" x2="0" y2="1">${sky}</linearGradient>
    <radialGradient id="stLamp" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#ffd48a" stop-opacity=".62"/><stop offset=".35" stop-color="#ffb760" stop-opacity=".22"/><stop offset="1" stop-color="#ff9a40" stop-opacity="0"/></radialGradient>
    <linearGradient id="stTable" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7a4f33"/><stop offset=".12" stop-color="#5e3b25"/><stop offset="1" stop-color="#2b1a10"/></linearGradient>
    <radialGradient id="stVig" cx="50%" cy="45%" r="75%"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".82"/></radialGradient>
    <filter id="stGlow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="2.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <filter id="stSoft"><feGaussianBlur stdDeviation="6"/></filter>
    <clipPath id="stWin"><path d="M600 560 L600 260 A200 200 0 0 1 1000 260 L1000 560 Z"/></clipPath>
  </defs>
  <rect width="1600" height="900" fill="url(#stWall)"/>
  ${planks}
  <g clip-path="url(#stWin)">
    <rect x="590" y="50" width="420" height="520" fill="url(#stSky)"/>
    ${rain ? '' : stars()}
    <path d="M590 520 Q 680 470 760 505 T 930 490 T 1010 500 L1010 570 L590 570 Z" fill="${rain ? '#353c4c' : '#1c1a33'}"/>
    ${towers(rain)}
    <path d="M590 548 l22 -40 l22 40 l18 -32 l18 32 l24 -46 l24 46 l20 -36 l20 36 l26 -50 l26 50 l18 -30 l18 30 l24 -44 l24 44 l20 -34 l20 34 l22 -42 l22 42 l20 -36 l20 36 L1010 570 L590 570 Z" fill="${rain ? '#262d38' : '#0e1421'}"/>
    <rect x="590" y="500" width="420" height="70" fill="${rain ? '#8a93a6' : '#c9a6c4'}" opacity=".22" filter="url(#stSoft)"/>
    ${rain ? rainLines() : ''}
  </g>
  <path d="M600 560 L600 260 A200 200 0 0 1 1000 260 L1000 560 Z" fill="none" stroke="#4a2f20" stroke-width="28"/>
  <path d="M600 560 L600 260 A200 200 0 0 1 1000 260 L1000 560 Z" fill="none" stroke="#6d4a33" stroke-width="6"/>
  <line x1="800" y1="62" x2="800" y2="560" stroke="#4a2f20" stroke-width="14"/>
  <line x1="600" y1="385" x2="1000" y2="385" stroke="#4a2f20" stroke-width="14"/>
  <rect x="570" y="556" width="460" height="26" rx="4" fill="#5d3c27"/>
  <path d="M948 556 l10 -34 h34 l10 34 Z" fill="#8a4a33"/>
  <path d="M975 522 c -12 -26 -30 -30 -40 -44 M975 522 c 6 -30 22 -40 34 -52 M975 522 c 0 -30 -4 -44 -2 -62" stroke="#4f7a3a" stroke-width="6" fill="none" stroke-linecap="round"/>
  <g transform="translate(1210 250)">
    <rect x="0" y="0" width="260" height="14" fill="#3e271b"/><rect x="0" y="130" width="260" height="14" fill="#3e271b"/>
    <rect x="18" y="-58" width="40" height="58" rx="8" fill="#6a5a4a"/><rect x="72" y="-44" width="34" height="44" rx="6" fill="#8a6a3a"/>
    <rect x="124" y="-66" width="30" height="66" rx="10" fill="#4f5d62"/><rect x="170" y="-40" width="58" height="40" rx="6" fill="#705040"/>
    <rect x="26" y="84" width="54" height="46" rx="8" fill="#7d6242"/><rect x="100" y="70" width="30" height="60" rx="8" fill="#5b4a5c"/>
  </g>
  <line x1="800" y1="0" x2="800" y2="70" stroke="#1d130e" stroke-width="4"/>
  <path d="M760 110 L780 70 L820 70 L840 110 Z" fill="#3a2418"/>
  <ellipse cx="800" cy="112" rx="18" ry="8" fill="#ffe2a8" class="st-lampbulb"/>
  <circle cx="800" cy="170" r="700" fill="url(#stLamp)" class="st-lampglow"/>
  <g class="st-bruma" transform="translate(300 772)">
    <ellipse cx="0" cy="40" rx="120" ry="16" fill="#000" opacity=".35"/>
    <g class="st-bruma-tail"><path d="M-78 18 q -40 -8 -46 -40 q 10 16 38 18 Z" fill="#dcd7d0" stroke="#1d1520" stroke-width="3"/></g>
    <ellipse cx="-10" cy="14" rx="82" ry="34" fill="#efece7" stroke="#1d1520" stroke-width="3"/>
    <ellipse cx="-20" cy="2" rx="46" ry="14" fill="#b9b4ad" opacity=".75"/>
    <g class="st-bruma-head"><circle cx="70" cy="0" r="30" fill="#efece7" stroke="#1d1520" stroke-width="3"/>
      <path d="M52 -22 l -8 -26 l 22 16 Z M84 -24 l 10 -24 l 6 26 Z" fill="#aaa49c" stroke="#1d1520" stroke-width="3" stroke-linejoin="round"/>
      <ellipse cx="96" cy="8" rx="16" ry="11" fill="#e4dfd8" stroke="#1d1520" stroke-width="3"/>
      <circle cx="109" cy="5" r="4.5" fill="#1a1418"/>
      <path d="M68 -2 q 6 4 12 0" stroke="#1a1418" stroke-width="3" fill="none" stroke-linecap="round"/></g>
    <path d="M40 42 q 20 -8 40 0" stroke="#1d1520" stroke-width="3" fill="#efece7"/>
  </g>
  <path d="M120 900 L260 640 L1340 640 L1480 900 Z" fill="url(#stTable)"/>
  <path d="M260 640 L1340 640 L1352 656 L248 656 Z" fill="#8a5a3c"/>
  <path d="M340 700 q 300 10 620 -4 M300 780 q 400 14 900 -6 M270 850 q 500 10 1060 -2" stroke="#000" stroke-opacity=".18" stroke-width="3" fill="none"/>
  ${steam(640)}${steam(960)}
  <g><ellipse cx="640" cy="700" rx="92" ry="22" fill="#c9b28a"/><path d="M548 700 q 92 88 184 0" fill="#b59a70"/><ellipse cx="640" cy="698" rx="76" ry="14" fill="#f0e2c0"/></g>
  <g><ellipse cx="960" cy="700" rx="72" ry="18" fill="#c9b28a"/><path d="M888 700 q 72 70 144 0" fill="#b59a70"/><ellipse cx="960" cy="698" rx="58" ry="11" fill="#f0e2c0"/></g>
  <g><rect x="740" y="716" width="130" height="20" rx="6" fill="#5a3a24"/><ellipse cx="800" cy="712" rx="58" ry="26" fill="#c98a4a"/><path d="M770 700 q 10 -10 20 0 M800 696 q 10 -10 20 0" stroke="#8a5a2a" stroke-width="4" fill="none"/></g>
  <g><rect x="1110" y="664" width="46" height="52" rx="8" fill="#9aa0b0"/><path d="M1156 676 q 22 4 0 28" stroke="#9aa0b0" stroke-width="8" fill="none"/></g>
  <rect width="1600" height="900" fill="url(#stVig)"/>
</svg>`;
}

export interface VignetteHandle { el: HTMLElement; close(seconds?: number, onBlack?: () => void): Promise<void>; shakeDog(): void }

/**
 * Shows a painted vignette full-screen (under dialogue). Its backdrop is opaque black from the first frame, so
 * `onCovered` can drop any black overlay above it; the painting then fades in over `fade` seconds.
 * `close(s, onBlack)`: the painting fades to black, `onBlack` raises whatever should cover next, then it is removed.
 */
export async function showVignette(mood: 'dawn' | 'rain', fade = 1.4, onCovered?: () => void): Promise<VignetteHandle> {
  const el = h('div', { class: `st-vig ${mood}`, html: kitchenSVG(mood) });
  layer('panel').appendChild(el);
  onCovered?.();
  await wait(30);
  el.style.setProperty('--vig-fade', `${fade}s`);
  el.classList.add('in');
  await wait(fade * 1000);
  return {
    el,
    async close(seconds = 1.2, onBlack?: () => void) {
      el.style.setProperty('--vig-fade', `${seconds}s`);
      el.classList.remove('in');
      await wait(seconds * 1000 + 40);
      onBlack?.();
      await wait(30);
      el.remove();
    },
    shakeDog() { el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); },
  };
}
