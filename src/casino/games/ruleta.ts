/**
 * La Rueda de las Almas — single-zero roulette (0 = Eclipse; Sol/Luna colors). Bets: número 35:1, docenas/columnas 2:1,
 * Sol/Luna/Par/Impar/Bajo/Alto 1:1 (house edge 2,7%). Gold or Esencia ("almas").
 * Honest ball: the pocket is chosen first; the ball's path relative to the wheel is solved to land on it.
 * Cheat: "Empujar la bola" with Velo (±1 pocket, detection roll). Luck second chance; Dado de Hueso de Dios re-roll.
 */
import { h } from '../../ui/dom';
import { audio } from '../../audio';
import { engine } from '../../core/engine';
import { fmt } from '../../core/math';
import { res } from '../../core/state';
import { portraitSVG } from '../../ui/art/portraits';
import { cs, bet as takeBet, settle, luck, rerollCount, essence, gold, type Currency } from '../state';
import { chipSVG } from '../art';
import { winBanner, tierFor, coinBurst, soulsAt, centerOf, shakeEl, sparkleAt } from '../fx2d';
import { gameHeader, rulesSheet, bigAction, bubble, cheatButton } from '../ui';
import { cheatRoll, cleanRound, improbable } from '../security';
import { reactWin, reactLoss } from '../tiburcio';
import { SOL } from '../lobby';
import type { GameCtx, GameView } from '../types';

export const ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const N = 37, SLOT = (Math.PI * 2) / N;
const GOLD_CHIPS = [10, 50, 100, 500, 1000, 5000];
const ESS_CHIPS = [1, 5, 10, 50, 100];
const MAX_GOLD = 25000, MAX_ESS = 1500;

type BetKey = string;
function covers(k: BetKey, n: number): boolean {
  if (k.startsWith('n:')) return Number(k.slice(2)) === n;
  if (n === 0) return false;
  switch (k) {
    case 'sol': return SOL.has(n);
    case 'luna': return !SOL.has(n);
    case 'par': return n % 2 === 0;
    case 'impar': return n % 2 === 1;
    case 'bajo': return n <= 18;
    case 'alto': return n >= 19;
    case 'dz:1': return n <= 12;
    case 'dz:2': return n >= 13 && n <= 24;
    case 'dz:3': return n >= 25;
    case 'col:1': return n % 3 === 1;
    case 'col:2': return n % 3 === 2;
    case 'col:3': return n % 3 === 0;
  }
  return false;
}
function payMult(k: BetKey): number { return k.startsWith('n:') ? 35 : k.startsWith('dz') || k.startsWith('col') ? 2 : 1; }
function returnFor(bets: Map<BetKey, number>, n: number): number {
  let r = 0;
  for (const [k, v] of bets) if (covers(k, n)) r += v * (payMult(k) + 1);
  return r;
}
const colorOf = (n: number) => (n === 0 ? 'eclipse' : SOL.has(n) ? 'sol' : 'luna');
const colorName = (n: number) => (n === 0 ? 'Eclipse' : SOL.has(n) ? 'Sol' : 'Luna');

export function openRuleta(ctx: GameCtx): GameView {
  const { host } = ctx;
  const s = cs();
  let cur: Currency = 'gold';
  let chip = 100;
  const bets = new Map<BetKey, number>();
  let lastBets: Array<[BetKey, number]> = [];
  let lastCur: Currency = 'gold';
  let spinning = false;
  let rerollLeft = rerollCount();
  let time = 0;

  // wheel state
  let wAng = 0, wVel = 0.35;
  let ballPhi = 0, ballR = 1, ballVisible = false;
  let spin: { t0: number; T: number; phiEnd: number; D: number; target: number; pushT: number; pushDelta: number; lastSlot: number; bounces: number[] } | null = null;
  let resolveSpin: (() => void) | null = null;

  // ───────────── DOM ─────────────
  const cv = h('canvas', { class: 'cs-rw-canvas' });
  const g = cv.getContext('2d')!;
  const wheelBox = h('div', { class: 'cs-rw-wheel' }, cv, h('div', { class: 'cs-rw-center' }));
  const resultEl = h('div', { class: 'cs-rw-result' });
  const croupier = h('div', { class: 'cs-rw-croupier', html: portraitSVG({ seed: 'crupier_ruleta', race: 'duende', job: 'crupier', mood: 'smile' }, 120) });
  const hist = h('div', { class: 'cs-rw-hist' });
  const board = h('div', { class: 'cs-rb-board' });
  const cells = new Map<BetKey, HTMLElement>();
  const totalEl = h('div', { class: 'cs-rw-total' });
  const chipTray = h('div', { class: 'cs-rw-chips' });
  const curToggle = h('div', { class: 'cs-rw-cur' });
  const pushWrap = h('div', { class: 'cs-rw-push' });
  const spinBtn = bigAction('GIRAR', () => void doSpin(false));
  const repeatBtn = h('button', { class: 'cs-btn', onclick: () => repeat(false) }, '↺ Repetir') as HTMLButtonElement;
  const doubleBtn = h('button', { class: 'cs-btn', onclick: () => repeat(true) }, '×2 Doblar') as HTMLButtonElement;
  const clearBtn = h('button', { class: 'cs-btn', onclick: () => clearBets(true) }, '✕ Limpiar') as HTMLButtonElement;
  const rerollBtn = h('button', { class: 'cs-btn gold', style: 'display:none', onclick: () => { rerollBtn.style.display = 'none'; rerollLeft--; void doSpin(true); } }, '⚀ Volver a tirar (Dado de Hueso)') as HTMLButtonElement;
  const rules = rulesSheet('La Rueda de las Almas', h('div', null,
    h('p', null, '37 casillas: del 1 al 36, mitad ', h('b', null, 'Sol'), ' y mitad ', h('b', null, 'Luna'), ', y el ', h('b', null, '0 — Eclipse'), ', que no es de nadie… salvo de la casa.'),
    h('table', null,
      h('tr', null, h('td', null, 'Pleno (un número, incluido el Eclipse)'), h('td', { style: 'text-align:right' }, '35 a 1')),
      h('tr', null, h('td', null, 'Docena · Columna'), h('td', { style: 'text-align:right' }, '2 a 1')),
      h('tr', null, h('td', null, 'Sol / Luna · Par / Impar · 1–18 / 19–36'), h('td', { style: 'text-align:right' }, '1 a 1'))),
    h('p', null, 'Puedes apostar ', h('b', null, 'Esencia'), ': las almas pagan en almas.'),
    h('p', { class: 'muted' }, 'Ventaja de la casa: 2,7% en todas las apuestas (1/37). Clic derecho sobre una apuesta la retira. Oro del juego.')));
  const layoutEl = h('div', { class: 'cs-rw' },
    h('div', { class: 'cs-rw-left' }, wheelBox, resultEl, hist),
    h('div', { class: 'cs-rw-right' },
      h('div', { class: 'cs-rw-top' }, croupier, h('div', { class: 'cs-rw-top-r' }, curToggle, chipTray)),
      board,
      h('div', { class: 'cs-rw-ctrl' }, h('div', { class: 'cs-rw-ctrl-l' }, totalEl, h('div', { class: 'lx-btn-row' }, repeatBtn, doubleBtn, clearBtn), rerollBtn, pushWrap), spinBtn)));
  const root = h('div', { class: 'cs-game cs-ruleta' },
    gameHeader('ruleta', 'La Rueda de las Almas', 'Sol, Luna… o el Eclipse', () => host.back(), h('button', { class: 'cs-btn small', onclick: () => rules.toggle() }, 'Reglas')),
    layoutEl, rules.el);
  ctx.root.appendChild(root);

  // board cells
  const cell = (k: BetKey, label: string, cls: string, style: string, tip?: string) => {
    const el = h('div', { class: `cs-rb-cell ${cls}`, style, 'data-tip': tip }, h('span', { class: 'cs-rb-label' }, label));
    el.addEventListener('click', () => place(k, 1));
    el.addEventListener('contextmenu', (e) => { e.preventDefault(); place(k, -1); });
    el.addEventListener('mouseenter', () => highlight(k, true));
    el.addEventListener('mouseleave', () => highlight(k, false));
    board.appendChild(el);
    cells.set(k, el);
  };
  cell('n:0', '0', 'zero eclipse', 'grid-row:1/4;grid-column:1', 'Eclipse · paga 35 a 1');
  for (let n = 1; n <= 36; n++) {
    const row = 3 - ((n - 1) % 3), col = 2 + Math.floor((n - 1) / 3);
    cell(`n:${n}`, String(n), `num ${colorOf(n)}`, `grid-row:${row};grid-column:${col}`);
  }
  for (let c = 1; c <= 3; c++) cell(`col:${c}`, '2:1', 'out col', `grid-row:${4 - c};grid-column:14`, `Columna ${c} · paga 2 a 1`);
  cell('dz:1', '1ª docena', 'out', 'grid-row:4;grid-column:2/6', '1–12 · paga 2 a 1');
  cell('dz:2', '2ª docena', 'out', 'grid-row:4;grid-column:6/10', '13–24 · paga 2 a 1');
  cell('dz:3', '3ª docena', 'out', 'grid-row:4;grid-column:10/14', '25–36 · paga 2 a 1');
  cell('bajo', '1–18', 'out', 'grid-row:5;grid-column:2/4');
  cell('par', 'PAR', 'out', 'grid-row:5;grid-column:4/6');
  cell('sol', '☀ SOL', 'out sol', 'grid-row:5;grid-column:6/8');
  cell('luna', '☾ LUNA', 'out luna', 'grid-row:5;grid-column:8/10');
  cell('impar', 'IMPAR', 'out', 'grid-row:5;grid-column:10/12');
  cell('alto', '19–36', 'out', 'grid-row:5;grid-column:12/14');

  function highlight(k: BetKey, on: boolean): void {
    for (let n = 0; n <= 36; n++) if (covers(k, n)) cells.get(`n:${n}`)?.classList.toggle('hl', on);
  }

  function renderChips(): void {
    const list = cur === 'gold' ? GOLD_CHIPS : ESS_CHIPS;
    chipTray.innerHTML = '';
    for (const v of list) {
      const b = h('button', { class: `cs-rw-chip ${v === chip ? 'on' : ''}`, html: chipSVG(v, { size: 46, essence: cur === 'essence' }), onclick: () => { chip = v; audio.sfx('chip_place', { pitch: 1.2 }); renderChips(); } });
      chipTray.appendChild(b);
    }
    curToggle.innerHTML = '';
    for (const c of ['gold', 'essence'] as Currency[]) {
      curToggle.appendChild(h('button', { class: `cs-btn small ${cur === c ? 'on gold' : ''}`, onclick: () => { if (spinning || cur === c) return; clearBets(false); cur = c; chip = c === 'gold' ? 100 : 5; renderChips(); renderBets(); audio.sfx('ui_tab'); } }, c === 'gold' ? 'Oro' : 'Almas (Esencia)'));
    }
  }

  function total(): number { let t = 0; for (const v of bets.values()) t += v; return t; }
  function renderBets(): void {
    for (const [k, el] of cells) {
      const v = bets.get(k) ?? 0;
      let stack = el.querySelector('.cs-rb-stack') as HTMLElement | null;
      if (v <= 0) { stack?.remove(); continue; }
      if (!stack) { stack = h('div', { class: 'cs-rb-stack' }); el.appendChild(stack); }
      stack.innerHTML = `${chipSVG(v, { size: 30, essence: cur === 'essence' })}<span>${fmt(v)}</span>`;
    }
    const t = total();
    const have = cur === 'gold' ? gold() : essence();
    totalEl.innerHTML = `Apuesta total <b>${fmt(t)}</b> ${cur === 'gold' ? 'oro' : 'almas'} · tienes ${fmt(have)}`;
    spinBtn.disabled = spinning || t <= 0;
    repeatBtn.disabled = spinning || !lastBets.length;
    doubleBtn.disabled = spinning || t <= 0;
    clearBtn.disabled = spinning || t <= 0;
  }

  function place(k: BetKey, dir: 1 | -1): void {
    if (spinning) return;
    const curV = bets.get(k) ?? 0;
    if (dir < 0) {
      if (curV <= 0) return;
      const nv = Math.max(0, curV - chip);
      if (nv <= 0) bets.delete(k); else bets.set(k, nv);
      audio.sfx('chip_place', { pitch: 0.8 });
    } else {
      const max = cur === 'gold' ? MAX_GOLD : MAX_ESS;
      const have = cur === 'gold' ? gold() : essence();
      if (total() + chip > Math.min(max, have)) { audio.sfx('ui_error'); bubble(croupier, total() + chip > max ? 'Límite de la mesa, patojo.' : 'No te alcanza, vos.', 1600); return; }
      bets.set(k, curV + chip);
      audio.sfx('chip_place', { pitch: 0.9 + Math.random() * 0.3 });
      const el = cells.get(k);
      if (el) { el.classList.remove('cs-pop'); void el.offsetWidth; el.classList.add('cs-pop'); }
    }
    renderBets();
  }

  function clearBets(sound: boolean): void { if (spinning) return; bets.clear(); if (sound) audio.sfx('ui_close'); renderBets(); }
  function repeat(double: boolean): void {
    if (spinning) return;
    const src: Array<[BetKey, number]> = double ? [...bets.entries()] : lastBets;
    if (!double && lastCur !== cur) return;
    const need = src.reduce((a, [, v]) => a + v * (double ? 2 : 1), 0);
    const have = cur === 'gold' ? gold() : essence();
    if (need > Math.min(have, cur === 'gold' ? MAX_GOLD : MAX_ESS)) { audio.sfx('ui_error'); bubble(croupier, 'Eso ya no te alcanza.', 1500); return; }
    bets.clear();
    for (const [k, v] of src) bets.set(k, v * (double ? 2 : 1));
    audio.sfx('chip_place');
    renderBets();
  }

  function renderHist(): void {
    hist.innerHTML = s.lastNumbers.slice(0, 12).map((n, i) => `<span class="cs-num-dot ${colorOf(n)} ${i === 0 ? 'last' : ''}">${n}</span>`).join('');
  }

  // ───────────── wheel drawing ─────────────
  let wheelImg: HTMLCanvasElement | null = null;
  let size = 420, dpr = 1;
  function layout(): void {
    size = Math.round(Math.max(260, Math.min(460, window.innerHeight * 0.52, window.innerWidth * 0.34)));
    dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = cv.height = Math.round(size * dpr);
    cv.style.width = cv.style.height = `${size}px`;
    wheelImg = buildWheel(Math.round(size * dpr));
  }
  function buildWheel(px: number): HTMLCanvasElement {
    const c = document.createElement('canvas'); c.width = c.height = px;
    const q = c.getContext('2d')!;
    const R = px / 2;
    q.translate(R, R);
    const ringO = R * 0.78, ringI = R * 0.56;
    for (let i = 0; i < N; i++) {
      const a0 = i * SLOT - SLOT / 2 - Math.PI / 2, a1 = a0 + SLOT;
      const n = ORDER[i];
      q.beginPath(); q.arc(0, 0, ringO, a0, a1); q.arc(0, 0, ringI, a1, a0, true); q.closePath();
      const gr = q.createRadialGradient(0, 0, ringI, 0, 0, ringO);
      if (n === 0) { gr.addColorStop(0, '#07040b'); gr.addColorStop(1, '#2a1a3a'); }
      else if (SOL.has(n)) { gr.addColorStop(0, '#8a5206'); gr.addColorStop(1, '#f0b43a'); }
      else { gr.addColorStop(0, '#12123a'); gr.addColorStop(1, '#3a3a9a'); }
      q.fillStyle = gr; q.fill();
      q.strokeStyle = '#f5d99a'; q.lineWidth = px * 0.004; q.stroke();
      // number
      q.save(); q.rotate(i * SLOT); q.translate(0, -(ringO - R * 0.075));
      q.fillStyle = n === 0 ? '#f5d99a' : '#fff'; q.font = `700 ${Math.round(R * 0.075)}px Cinzel, serif`; q.textAlign = 'center'; q.textBaseline = 'middle';
      q.fillText(String(n), 0, 0);
      if (n === 0) { q.beginPath(); q.arc(0, R * 0.09, R * 0.03, 0, Math.PI * 2); q.fillStyle = '#f5d99a'; q.fill(); q.beginPath(); q.arc(R * 0.004, R * 0.087, R * 0.025, 0, Math.PI * 2); q.fillStyle = '#07040b'; q.fill(); }
      q.restore();
    }
    // pocket floor ring
    q.beginPath(); q.arc(0, 0, ringI, 0, Math.PI * 2); q.arc(0, 0, ringI * 0.86, 0, Math.PI * 2, true);
    q.fillStyle = '#1a0e08'; q.fill('evenodd');
    for (let i = 0; i < N; i++) { q.save(); q.rotate(i * SLOT - SLOT / 2); q.fillStyle = '#d9b36c'; q.fillRect(-px * 0.002, -ringI, px * 0.004, ringI * 0.14); q.restore(); }
    // cone
    const cone = q.createRadialGradient(-R * 0.12, -R * 0.12, R * 0.05, 0, 0, ringI * 0.86);
    cone.addColorStop(0, '#9a5a2a'); cone.addColorStop(0.7, '#5a2a10'); cone.addColorStop(1, '#2a1206');
    q.beginPath(); q.arc(0, 0, ringI * 0.86, 0, Math.PI * 2); q.fillStyle = cone; q.fill();
    q.strokeStyle = '#d9b36c'; q.lineWidth = px * 0.006; q.stroke();
    // turret
    for (let k = 0; k < 4; k++) { q.save(); q.rotate(k * Math.PI / 2 + Math.PI / 4); q.fillStyle = '#e8c46a'; q.beginPath(); q.roundRect(-px * 0.012, -ringI * 0.62, px * 0.024, ringI * 0.62, px * 0.01); q.fill(); q.beginPath(); q.arc(0, -ringI * 0.62, px * 0.02, 0, Math.PI * 2); q.fill(); q.restore(); }
    const tur = q.createRadialGradient(-R * 0.03, -R * 0.03, 0, 0, 0, R * 0.1);
    tur.addColorStop(0, '#fff6c8'); tur.addColorStop(1, '#a8740e');
    q.beginPath(); q.arc(0, 0, R * 0.09, 0, Math.PI * 2); q.fillStyle = tur; q.fill();
    return c;
  }

  function drawWheel(): void {
    const px = cv.width, R = px / 2;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, px, px);
    g.translate(R, R);
    // outer rim (static)
    const rim = g.createRadialGradient(0, 0, R * 0.8, 0, 0, R);
    rim.addColorStop(0, '#3a1a08'); rim.addColorStop(0.5, '#6a3a18'); rim.addColorStop(0.9, '#2a1206'); rim.addColorStop(1, '#120602');
    g.beginPath(); g.arc(0, 0, R * 0.995, 0, Math.PI * 2); g.fillStyle = rim; g.fill();
    g.beginPath(); g.arc(0, 0, R * 0.95, 0, Math.PI * 2); g.strokeStyle = '#d9b36c'; g.lineWidth = px * 0.008; g.stroke();
    // ball track
    g.beginPath(); g.arc(0, 0, R * 0.93, 0, Math.PI * 2); g.arc(0, 0, R * 0.8, 0, Math.PI * 2, true);
    const tr = g.createRadialGradient(0, 0, R * 0.8, 0, 0, R * 0.93); tr.addColorStop(0, '#1a0a04'); tr.addColorStop(1, '#4a2a14');
    g.fillStyle = tr; g.fill('evenodd');
    // rotating wheel
    if (wheelImg) { g.save(); g.rotate(wAng); g.drawImage(wheelImg, -R, -R, px, px); g.restore(); }
    // gloss
    const gl = g.createLinearGradient(-R, -R, R, R); gl.addColorStop(0, 'rgba(255,255,255,0.12)'); gl.addColorStop(0.45, 'rgba(255,255,255,0)'); gl.addColorStop(1, 'rgba(0,0,0,0.18)');
    g.beginPath(); g.arc(0, 0, R * 0.93, 0, Math.PI * 2); g.fillStyle = gl; g.fill();
    // ball
    if (ballVisible) {
      const abs = wAng + ballPhi;
      const br = R * ballR;
      const bx = Math.sin(abs) * br, by = -Math.cos(abs) * br;
      g.beginPath(); g.arc(bx + px * 0.006, by + px * 0.008, px * 0.022, 0, Math.PI * 2); g.fillStyle = 'rgba(0,0,0,0.45)'; g.fill();
      const bg = g.createRadialGradient(bx - px * 0.008, by - px * 0.008, 0, bx, by, px * 0.022);
      bg.addColorStop(0, '#ffffff'); bg.addColorStop(0.6, '#e8e8f0'); bg.addColorStop(1, '#9a9ab0');
      g.beginPath(); g.arc(bx, by, px * 0.021, 0, Math.PI * 2); g.fillStyle = bg; g.fill();
    }
  }

  // ───────────── spin ─────────────
  const SEAT = 0.67, TRACK = 0.865;
  function slotAngle(n: number): number { return ORDER.indexOf(n) * SLOT; }

  function startBall(target: number, T: number): Promise<void> {
    const phiEnd = slotAngle(target);
    const phi0 = ballVisible ? ballPhi : (Math.random() * Math.PI * 2);
    const turns = 6 + Math.floor(Math.random() * 3);
    const D = ((((phi0 - phiEnd) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) + turns * Math.PI * 2;
    spin = { t0: performance.now() / 1000, T, phiEnd, D, target, pushT: -1, pushDelta: 0, lastSlot: -999, bounces: [0.58, 0.64, 0.69, 0.73, 0.76] };
    ballVisible = true;
    ballR = TRACK;
    wVel = 2.4;
    audio.sfx('wheel_ball');
    return new Promise((r) => { resolveSpin = r; });
  }

  function stepSpin(dt: number): void {
    wAng += wVel * dt;
    if (!spin) { wVel += (0.35 - wVel) * Math.min(1, dt * 0.5); return; }
    const t = performance.now() / 1000 - spin.t0;
    const u = Math.min(1, t / spin.T);
    wVel = 0.5 + 1.9 * (1 - u) * (1 - u);
    // relative angle: φ(u) = φend + D(1−u)³ (+ Velo push)
    let phi = spin.phiEnd + spin.D * Math.pow(1 - u, 3);
    if (spin.pushT >= 0) { const k = Math.min(1, (t - spin.pushT) / 0.35); phi += spin.pushDelta * (k * k * (3 - 2 * k)); }
    // wheel turns +, ball runs −: absolute ball angle = wAng + phi
    ballPhi = phi;
    // radius: track → falls with bounces → seated
    if (u < 0.55) ballR = TRACK + Math.sin(t * 9) * 0.004;
    else if (u < 0.8) {
      const k = (u - 0.55) / 0.25;
      const bounce = Math.abs(Math.cos(k * Math.PI * 3.5)) * (1 - k) * 0.12;
      ballR = SEAT + (TRACK - SEAT) * (1 - k) * 0.55 + bounce;
    } else ballR = SEAT + Math.max(0, 0.012 * Math.sin(t * 30) * (1 - u) * 4);
    // audio: bounces and pocket ticks
    while (spin.bounces.length && u >= spin.bounces[0]) { spin.bounces.shift(); audio.sfx('wheel_ball', { volume: 0.6, pitch: 0.9 + Math.random() * 0.3 }); }
    const slotIdx = Math.floor(phi / SLOT);
    if (u > 0.5 && slotIdx !== spin.lastSlot) { spin.lastSlot = slotIdx; if (u < 0.97) audio.sfx('wheel_tick', { volume: 0.35, pitch: 0.8 + u * 0.5 }); }
    // Velo push window
    if (u > 0.68 && u < 0.93 && spin.pushT < 0 && !pushWrap.childElementCount) showPush();
    if (u >= 0.93 && pushWrap.childElementCount) pushWrap.innerHTML = '';
    if (u >= 1) {
      ballR = SEAT;
      finalTarget = spin.target;
      ballPhi = slotAngle(spin.target);
      const done = resolveSpin; resolveSpin = null;
      spin = null;
      pushWrap.innerHTML = '';
      done?.();
    }
  }

  const pushed = { used: false, caught: false };
  let finalTarget = 0;
  /** A spin in flight: if the view closes mid-spin, the ball still lands and we settle it. */
  let inFlight: { stake: number; cur: Currency; reroll: boolean } | null = null;
  function showPush(): void {
    const b = cheatButton('velo', 'Empujar la bola', 8, 'Bajo el Velo, empujas la bola una casilla hacia la apuesta más jugosa.', () => {
      if (!spin || spin.pushT >= 0) return;
      res.spend('mana', 8);
      const i = ORDER.indexOf(spin.target);
      const cands = [ORDER[(i + 1) % N], ORDER[(i + N - 1) % N]];
      const best = cands.reduce((a, c) => (returnFor(bets, c) > returnFor(bets, a) ? c : a), cands[0]);
      if (returnFor(bets, best) <= returnFor(bets, spin.target)) { audio.sfx('ui_error'); bubble(croupier, '…', 900); pushWrap.innerHTML = ''; return; }
      const dir = best === cands[0] ? 1 : -1;
      spin.target = best;
      spin.pushT = performance.now() / 1000 - spin.t0;
      spin.pushDelta = dir * SLOT;
      audio.sfx('invisibility_on'); audio.sfx('cast_shadow', { volume: 0.6 });
      engine.pipeline.setDesat(0.55);
      window.setTimeout(() => engine.pipeline.setDesat(0), 600);
      sparkleAt(centerOf(wheelBox).x, centerOf(wheelBox).y, 16, '#c7a2ff');
      const roll = cheatRoll('ruleta', 'velo', 0.9, 0.25);
      pushed.used = true; pushed.caught = roll.caught;
      if (!roll.caught && roll.noticed) bubble(croupier, '¿Vieron eso? La bola… hizo algo raro.', 2200);
      pushWrap.innerHTML = '';
    });
    if (b) { b.classList.add('cs-pulse'); pushWrap.appendChild(b); }
  }

  async function doSpin(isReroll: boolean): Promise<void> {
    if (spinning || !ctx.alive()) return;
    const stake = total();
    if (stake <= 0) return;
    const betCur = cur;
    if (!isReroll) {
      if (!takeBet('ruleta', stake, betCur)) { audio.sfx('ui_error'); bubble(croupier, 'No te alcanza, patojo.', 1600); return; }
      if (await host.raidCheck('ruleta', stake)) return;
    }
    spinning = true;
    rerollBtn.style.display = 'none';
    pushed.used = false; pushed.caught = false;
    lastBets = [...bets.entries()]; lastCur = betCur;
    renderBets();
    resultEl.className = 'cs-rw-result'; resultEl.textContent = '';
    bubble(croupier, '¡No va más!', 1800);
    audio.sfx('whoosh');
    // outcome first
    let n = Math.floor(Math.random() * N);
    let luckUsed = false;
    if (returnFor(bets, n) < stake && Math.random() < luck() * 0.5) { const n2 = Math.floor(Math.random() * N); if (returnFor(bets, n2) > returnFor(bets, n)) { n = n2; luckUsed = true; } }
    host.tension(0.25);
    inFlight = { stake, cur: betCur, reroll: isReroll };
    await startBall(n, 6.2);
    host.tension(0);
    if (!ctx.alive()) return;
    inFlight = null;
    const landed = finalTarget;
    s.lastNumbers.unshift(landed);
    if (s.lastNumbers.length > 20) s.lastNumbers.length = 20;
    renderHist();
    audio.sfx('dice_land', { pitch: 1.4, volume: 0.6 });
    resultEl.className = `cs-rw-result show ${colorOf(landed)}`;
    resultEl.innerHTML = `<b>${landed}</b><span>${colorName(landed)}${landed ? ` · ${landed % 2 ? 'Impar' : 'Par'}` : ''}</span>`;
    bubble(croupier, `¡${landed}, ${colorName(landed)}${landed ? (landed % 2 ? ', impar' : ', par') : '… la casa sonríe'}!`, 2400);
    for (const [k, el] of cells) el.classList.toggle('won', covers(k, landed) && (bets.get(k) ?? 0) > 0);
    cells.get(`n:${landed}`)?.classList.add('hit');

    if (pushed.used && pushed.caught) {
      settle('ruleta', stake, 0, { cur: betCur });
      spinning = false;
      await host.caught('ruleta', 'La bola saltó sola y alguien vio tu sombra');
      return;
    }
    const ret = returnFor(bets, landed);
    host.hud.holdGold();
    const r = settle('ruleta', isReroll ? 0 : stake, ret, { cur: betCur });
    if (r.net > 0) improbable(Math.min(1, stake / Math.max(1, ret) * 0.973)); else cleanRound();
    const origin = centerOf(board);
    if (ret > 0) {
      if (luckUsed) { bubble(croupier, '¡Qué suerte más shute!', 1600); audio.sfx('cast_luck'); }
      if (betCur === 'essence') soulsAt(origin.x, origin.y, 30); else coinBurst(origin.x, origin.y, Math.min(60, 12 + Math.floor(ret / Math.max(1, stake) * 6)));
      const tier = tierFor(r.net, stake);
      if (tier === 'big' || tier === 'mega') { host.celebrate(2); await winBanner(tier, r.net, { origin, currency: betCur }); host.say(reactWin(r.net)); }
      else if (tier === 'win') { host.celebrate(1); audio.sfx('slot_win_small'); await winBanner('win', r.net, { origin, currency: betCur }); }
      else { audio.sfx('coin'); }
    } else {
      host.gloat(); shakeEl(board);
      if (Math.random() < 0.2) host.say(reactLoss(), { mood: 'smug' });
      if (rerollLeft > 0 && !isReroll) rerollBtn.style.display = '';
    }
    host.hud.releaseGold();
    await new Promise((res2) => window.setTimeout(res2, 900));
    if (!ctx.alive()) return;
    for (const el of cells.values()) el.classList.remove('won', 'hit');
    spinning = false;
    // winning bets stay on the table (classic): losing ones are swept
    for (const k of [...bets.keys()]) if (!covers(k, landed)) bets.delete(k);
    const have = betCur === 'gold' ? gold() : essence();
    if (total() > have) bets.clear();
    renderBets();
    host.hud.refresh('ruleta');
  }

  // ───────────── lifecycle ─────────────
  layout();
  renderChips();
  renderBets();
  renderHist();
  const onResize = () => layout();
  window.addEventListener('resize', onResize);
  bubble(croupier, '¡Hagan sus apuestas, patojos!', 2600);

  return {
    update(dt: number) {
      time += dt;
      stepSpin(dt);
      drawWheel();
    },
    onKey(e: KeyboardEvent) {
      if (e.code === 'Space' || e.code === 'Enter') { if (!e.repeat) void doSpin(false); return true; }
      return false;
    },
    close() {
      window.removeEventListener('resize', onResize);
      if (inFlight) {
        const n = spin?.target ?? finalTarget;
        s.lastNumbers.unshift(n);
        settle('ruleta', inFlight.reroll ? 0 : inFlight.stake, pushed.used && pushed.caught ? 0 : returnFor(bets, n), { cur: inFlight.cur });
        inFlight = null;
      }
      if (resolveSpin) { const f = resolveSpin; resolveSpin = null; f(); }
      host.hud.releaseGold();
      engine.pipeline.setDesat(0);
      root.remove();
      void time;
    },
  };
}
