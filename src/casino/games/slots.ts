/**
 * Tragamonedas de Reliquias — 5×3, 20 lines, X wild, Eclipse scatter (Giros de la Excepción), progressive jackpot
 * (El Libro on all five reels). Canvas reels with motion blur + stop bounce; honest anticipation (only landed reels);
 * outcome first (credited at spin start, HUD held until the reveal); autospin, turbo, Doble o nada, luck, re-roll.
 */
import { h } from '../../ui/dom';
import { audio } from '../../audio';
import { engine } from '../../core/engine';
import { fmt } from '../../core/math';
import { addNews } from '../../core/news';
import { track } from '../../core/tracker';
import { narrate } from '../../ui/narrator';
import { grantRelic, randomRelic } from '../../systems/progression/relics';
import { bus } from '../../core/events';
import { G } from '../../core/state';
import { cs, bet as takeBet, settle, luck, rerollCount, betLadder, JACKPOT_SEED, clamp } from '../state';
import { STRIPS, LINES, PAY, SCATTER_PAY, FREE_SPINS, RETRIGGER, spin, anticipate, type Sym, type SpinEval } from '../math/slotsMath';
import { rasterize, symbolSVG, SYM_LABEL } from '../art';
import { winBanner, tierFor, ldwNote, coinBurst, shakeEl, sparkleAt, centerOf, countUp } from '../fx2d';
import { gameHeader, betPicker, rulesSheet, bigAction } from '../ui';
import { improbable, cleanRound } from '../security';
import { reactWin, reactLoss } from '../tiburcio';
import type { GameCtx, GameView } from '../types';

const BETS = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000];
const JP_FULL_BET = 500;
const LINE_COLORS = ['#ffe066', '#ff4fa3', '#4fd8ff', '#6fe39a', '#ff8a3a', '#c7a2ff', '#ff5d6c', '#7fe3ff', '#ffd1f0', '#b8ff6a',
  '#ffb347', '#9b5cff', '#5aa9ff', '#ff7bf0', '#e6cc80', '#2fe0b0', '#ff9aa8', '#d0ff8a', '#8ab4ff', '#ffcf5a'];

interface Reel { pos: number; from: number; dist: number; t0: number; dur: number; a: number; b: number; moving: boolean; bounce: number; antic: boolean; v: number; stopFired: boolean }

function prof(u: number, a: number, b: number): number {
  const A = a / 2 + (1 - a - b) + b / 3;
  let x: number;
  if (u < a) x = (u * u) / (2 * a);
  else if (u < 1 - b) x = a / 2 + (u - a);
  else { const s = (u - (1 - b)) / b; x = a / 2 + (1 - a - b) + (b * (1 - Math.pow(1 - s, 3))) / 3; }
  return x / A;
}

export function openSlots(ctx: GameCtx): GameView {
  const { host } = ctx;
  const s = cs();
  const L = STRIPS.map((st) => st.length);
  const reels: Reel[] = STRIPS.map((st) => { const p = Math.floor(Math.random() * st.length); return { pos: p, from: p, dist: 0, t0: 0, dur: 1, a: 0.12, b: 0.35, moving: false, bounce: 0, antic: false, v: 0, stopFired: true }; });
  const imgs = new Map<Sym, HTMLCanvasElement>();
  let cell = 128, gap = 10, dpr = Math.min(2, window.devicePixelRatio || 1);
  let spinning = false, turbo = false, auto = 0, time = 0;
  let current: SpinEval | null = null;
  let winCells = new Set<string>();
  let showLines: number[] = [];
  let lineCycle = 0, lineCycleT = 0;
  let nearCells: Array<[number, number]> = [];
  let scatterGlow = false;
  let rerollLeft = rerollCount();
  let pendingGamble = 0;
  let quick = false;

  // ───────────── DOM ─────────────
  const jpNum = h('div', { class: 'cs-sm-jp-num' }, fmt(s.jackpot));
  const cv = h('canvas', { class: 'cs-sm-canvas' });
  const g = cv.getContext('2d')!;
  const winLabel = h('div', { class: 'cs-sm-winval' }, '0');
  const msg = h('div', { class: 'cs-sm-msg' }, '¡Buena suerte, patojo!');
  const fsBar = h('div', { class: 'cs-sm-fs' });
  const badge = (i: number) => h('div', { class: 'cs-sm-badge', style: `--lc:${LINE_COLORS[i]}`, 'data-line': String(i), onmouseenter: () => { if (!spinning) { showLines = [i]; } }, onmouseleave: () => { if (!spinning && !winCells.size) showLines = []; } }, String(i + 1));
  const badgesL = h('div', { class: 'cs-sm-badges' }, ...Array.from({ length: 10 }, (_, i) => badge(i)));
  const badgesR = h('div', { class: 'cs-sm-badges' }, ...Array.from({ length: 10 }, (_, i) => badge(i + 10)));
  const picker = betPicker(betLadder(BETS), Math.min(100, Math.max(10, Math.floor(s.jackpot > 0 ? 100 : 10))), () => refreshInfo(), { label: 'Apuesta por tirada' });
  const info = h('div', { class: 'cs-sm-info' });
  const spinBtn = bigAction('GIRAR', () => { if (spinning) quick = true; else void doSpin({}); });
  const autoBtns = [10, 25, 50].map((n) => h('button', { class: 'cs-btn small', onclick: () => startAuto(n) }, `×${n}`) as HTMLButtonElement);
  const autoLabel = h('div', { class: 'cs-sm-auto-label' }, 'Auto');
  const turboBtn = h('button', { class: 'cs-btn', onclick: () => { turbo = !turbo; turboBtn.classList.toggle('on', turbo); audio.sfx('ui_tab'); } }, '⚡ Turbo') as HTMLButtonElement;
  const rerollBtn = h('button', { class: 'cs-btn gold cs-sm-reroll', style: 'display:none', onclick: () => { rerollBtn.style.display = 'none'; rerollLeft--; void doSpin({ reroll: true }); } }, '⚀ Re-tirar gratis (Dado de Hueso de Dios)') as HTMLButtonElement;
  const gambleBtn = h('button', { class: 'cs-btn red cs-sm-gamble', style: 'display:none', onclick: () => void gamble() }, '¡Doble o nada!') as HTMLButtonElement;
  const paySheet = rulesSheet('Tabla de pagos', paytable());
  const payBtn = h('button', { class: 'cs-btn small', onclick: () => { paySheet.el.replaceChildren(h('div', { class: 'cs-rules-title' }, 'Tabla de pagos'), h('div', { class: 'cs-rules-body' }, paytable())); paySheet.toggle(); } }, 'Tabla de pagos');
  const windowEl = h('div', { class: 'cs-sm-window' }, cv);
  const machine = h('div', { class: 'cs-sm' },
    h('div', { class: 'cs-sm-crown' }, h('div', { class: 'cs-sm-jp' }, h('div', { class: 'cs-sm-jp-label' }, 'BOTE PROGRESIVO'), jpNum, h('div', { class: 'cs-sm-jp-note' }, `El Libro en los 5 rodillos · bote completo desde ${JP_FULL_BET} por tirada`))),
    h('div', { class: 'cs-sm-body' }, badgesL, windowEl, badgesR),
    h('div', { class: 'cs-sm-strip' }, msg, h('div', { class: 'cs-sm-win' }, h('span', null, 'GANANCIA'), winLabel)),
    fsBar,
    h('div', { class: 'cs-sm-ctrl' },
      h('div', { class: 'cs-sm-ctrl-l' }, picker.el, info),
      spinBtn,
      h('div', { class: 'cs-sm-ctrl-r' }, h('div', { class: 'cs-sm-auto' }, autoLabel, ...autoBtns), turboBtn)),
    h('div', { class: 'cs-sm-extra' }, rerollBtn, gambleBtn),
  );
  const root = h('div', { class: 'cs-game cs-slots' }, gameHeader('slots', 'Tragamonedas de Reliquias', 'Cinco rodillos · veinte líneas · el Libro lo es todo', () => host.back(), payBtn), machine, paySheet.el);
  ctx.root.appendChild(root);

  function refreshInfo(): void {
    const b = picker.value();
    info.innerHTML = `${fmt(b / 20)} por línea · Bote al <b>${Math.round(clamp(b / JP_FULL_BET, 0.1, 1) * 100)}%</b>`;
  }

  function paytable(): HTMLElement {
    const b = picker ? picker.value() : 100;
    const lu = b / 20;
    const rows = (Object.keys(PAY) as Array<keyof typeof PAY>).slice().reverse().map((k) => h('tr', null,
      h('td', { style: 'width:52px' }, h('div', { html: symbolSVG(k as Sym, 44, false) })),
      h('td', null, SYM_LABEL[k as Sym]),
      ...PAY[k].map((p, i) => h('td', { style: 'text-align:right' }, h('span', { class: 'muted' }, `${i + 3}× `), fmt(Math.floor(p * lu)))),
    ));
    return h('div', null,
      h('table', null, h('tr', null, h('td', { style: 'width:52px' }, h('div', { html: symbolSVG('eclipse', 44, false) })), h('td', { colspan: '4' }, h('b', null, 'Eclipse (dispersión): '), `3/4/5 en cualquier lugar pagan ${SCATTER_PAY[3]}×/${SCATTER_PAY[4]}×/${SCATTER_PAY[5]}× la apuesta y activan los `, h('b', null, 'Giros de la Excepción'), ` (${FREE_SPINS[3][0]}/${FREE_SPINS[4][0]}/${FREE_SPINS[5][0]} giros ×${FREE_SPINS[3][1]}/×${FREE_SPINS[4][1]}/×${FREE_SPINS[5][1]}; +${RETRIGGER} si vuelven a salir).`)), ...rows),
      h('p', null, h('b', null, '¡BOTE! '), `El Libro de la Realidad visible en los cinco rodillos gana el bote progresivo (completo con apuestas desde ${JP_FULL_BET}; menos, la parte proporcional) y una reliquia auténtica.`),
      h('p', null, h('b', null, 'X '), 'sustituye a cualquier símbolo salvo el Eclipse. Las líneas pagan de izquierda a derecha; solo la mayor por línea.'),
      h('p', { class: 'muted' }, `Retorno teórico ≈ 94,5% (sin contar el bote). 1,5% de cada tirada alimenta el bote. Valores para tu apuesta actual (${fmt(b)}). Oro del juego: nunca dinero real.`));
  }

  // ───────────── rendering ─────────────
  function layout(): void {
    const availW = Math.min(window.innerWidth * 0.66, 900);
    const availH = window.innerHeight - 440;
    gap = 8;
    cell = Math.floor(Math.max(70, Math.min((availW - 4 * gap) / 5, availH / 3, 150)));
    dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = cell * 5 + gap * 4, hh = cell * 3;
    cv.width = Math.round(w * dpr); cv.height = Math.round(hh * dpr);
    cv.style.width = `${w}px`; cv.style.height = `${hh}px`;
    void loadImages();
  }
  let loadedFor = 0;
  async function loadImages(): Promise<void> {
    const px = Math.round(cell * dpr);
    if (loadedFor === px) return;
    loadedFor = px;
    const syms: Sym[] = ['moneda', 'dado', 'carta', 'farol', 'caliz', 'corona', 'daga', 'luna', 'libro', 'wild', 'eclipse'];
    const res = await Promise.all(syms.map((sy) => rasterize(symbolSVG(sy, px, true), px)));
    if (loadedFor !== px) return;
    syms.forEach((sy, i) => imgs.set(sy, res[i]));
  }

  const key = (r: number, row: number) => `${r}:${row}`;

  function draw(): void {
    const W = cv.width / dpr, H = cv.height / dpr;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const presenting = winCells.size > 0;
    for (let r = 0; r < 5; r++) {
      const rl = reels[r];
      const x = r * (cell + gap);
      // reel background
      const grd = g.createLinearGradient(0, 0, 0, H);
      grd.addColorStop(0, '#d8cbb0'); grd.addColorStop(0.12, '#fffaf0'); grd.addColorStop(0.88, '#fffaf0'); grd.addColorStop(1, '#d8cbb0');
      g.fillStyle = rl.antic ? '#fff0f8' : grd;
      if (rl.antic && rl.moving) { g.fillStyle = `hsl(${(time * 120) % 360},90%,92%)`; }
      g.fillRect(x, 0, cell, H);
      g.save();
      g.beginPath(); g.rect(x, 0, cell, H); g.clip();
      let p = rl.pos;
      if (!rl.moving && rl.bounce > 0) p = rl.pos - 0.13 * Math.sin((1 - rl.bounce / 0.22) * Math.PI) * (rl.bounce / 0.22 + 0.3);
      const base = Math.floor(p), frac = p - base;
      const blur = Math.abs(rl.v) > 9;
      for (let k = -1; k <= 3; k++) {
        const idx = (((base + k) % L[r]) + L[r]) % L[r];
        const sym = STRIPS[r][idx];
        const y = (k - frac) * cell;
        const row = Math.round(k - frac);
        const img = imgs.get(sym);
        const isWin = presenting && !rl.moving && winCells.has(key(r, row)) && Math.abs(k - frac - row) < 0.01;
        const dim = presenting && !isWin && !rl.moving;
        g.globalAlpha = dim ? 0.38 : 1;
        if (isWin) {
          const pulse = 1 + Math.sin(time * 9) * 0.06;
          g.save();
          g.translate(x + cell / 2, y + cell / 2);
          g.scale(pulse, pulse);
          g.shadowColor = '#ffcf5a'; g.shadowBlur = 24;
          g.fillStyle = 'rgba(255, 220, 120, 0.35)';
          g.beginPath(); g.roundRect(-cell / 2 + 4, -cell / 2 + 4, cell - 8, cell - 8, 14); g.fill();
          g.shadowBlur = 0;
          if (img) g.drawImage(img, -cell / 2, -cell / 2, cell, cell);
          g.restore();
        } else if (img) {
          if (blur) {
            g.globalAlpha = 0.28; g.drawImage(img, x, y - cell * 0.16, cell, cell); g.drawImage(img, x, y + cell * 0.16, cell, cell);
            g.globalAlpha = 0.6;
          }
          g.drawImage(img, x, y, cell, cell);
        } else {
          g.fillStyle = '#c9b48a'; g.beginPath(); g.arc(x + cell / 2, y + cell / 2, cell * 0.3, 0, Math.PI * 2); g.fill();
        }
      }
      g.globalAlpha = 1;
      g.restore();
      // anticipation frame
      if (rl.antic && rl.moving) {
        g.save(); g.strokeStyle = `hsl(${(time * 200) % 360},100%,60%)`; g.lineWidth = 5; g.shadowColor = '#ff4fa3'; g.shadowBlur = 20;
        g.strokeRect(x + 2.5, 2.5, cell - 5, H - 5); g.restore();
      }
    }
    // near-miss flashes
    for (const [r, row] of nearCells) {
      const x = r * (cell + gap), y = row * cell;
      const a = 0.5 + Math.sin(time * 14) * 0.5;
      g.save(); g.strokeStyle = `rgba(255, 90, 120, ${a})`; g.lineWidth = 5; g.setLineDash([10, 7]); g.strokeRect(x + 4, y + 4, cell - 8, cell - 8);
      g.fillStyle = `rgba(255, 90, 120, ${a})`; g.font = `700 ${Math.round(cell * 0.16)}px Bangers, Impact, sans-serif`; g.textAlign = 'center'; g.fillText('¡CASI!', x + cell / 2, y + cell * 0.2);
      g.restore();
    }
    // scatter rays
    if (scatterGlow && current) {
      for (const [r, row] of current.scatterCells) {
        const cx = r * (cell + gap) + cell / 2, cy = row * cell + cell / 2;
        g.save(); g.translate(cx, cy); g.rotate(time * 1.5); g.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 10; i++) { g.rotate(Math.PI / 5); g.fillStyle = 'rgba(255, 220, 140, 0.18)'; g.beginPath(); g.moveTo(0, 0); g.lineTo(cell * 0.75, -cell * 0.08); g.lineTo(cell * 0.75, cell * 0.08); g.closePath(); g.fill(); }
        g.restore();
      }
    }
    // paylines
    for (const li of showLines) {
      const Ln = LINES[li];
      g.save();
      g.strokeStyle = LINE_COLORS[li]; g.lineWidth = Math.max(4, cell * 0.045); g.lineJoin = 'round'; g.lineCap = 'round';
      g.shadowColor = LINE_COLORS[li]; g.shadowBlur = 16;
      g.beginPath();
      g.moveTo(0, Ln[0] * cell + cell / 2);
      Ln.forEach((row, r) => g.lineTo(r * (cell + gap) + cell / 2, row * cell + cell / 2));
      g.lineTo(W, Ln[4] * cell + cell / 2);
      g.stroke();
      g.restore();
    }
  }

  // ───────────── spin ─────────────
  function planReels(ev: SpinEval): Promise<void> {
    const now = performance.now() / 1000;
    let extra = 0;
    return new Promise<void>((resolve) => {
      for (let r = 0; r < 5; r++) {
        const rl = reels[r];
        const antic = anticipate(ev, r);
        const baseDur = turbo ? 0.42 + r * 0.1 : 0.85 + r * 0.26;
        if (antic) extra += turbo ? 0.9 : 1.5;
        const dur = baseDur + extra;
        const target = ev.stops[r];
        const from = Math.round(rl.pos);
        const baseDist = (((from - target) % L[r]) + L[r]) % L[r];
        const b = antic ? 0.62 : 0.34;
        const A = 0.12 / 2 + (1 - 0.12 - b) + b / 3;
        const want = (turbo ? 34 : 26) * dur * A;
        const k = Math.max(1, Math.round((want - baseDist) / L[r]));
        Object.assign(rl, { from, dist: baseDist + k * L[r], t0: now, dur, a: 0.12, b, moving: true, bounce: 0, antic: !!antic, v: 0, stopFired: false });
      }
      waitStop = resolve;
    });
  }
  let waitStop: (() => void) | null = null;

  function stepReels(dt: number): void {
    const now = performance.now() / 1000;
    let allStopped = true;
    for (let r = 0; r < 5; r++) {
      const rl = reels[r];
      if (rl.moving) {
        let u = (now - rl.t0) / rl.dur;
        if (quick && !rl.antic) u = Math.max(u, 0.999);
        const prev = rl.pos;
        if (u >= 1) {
          rl.pos = rl.from - rl.dist;
          rl.pos = ((rl.pos % L[r]) + L[r]) % L[r];
          rl.moving = false; rl.bounce = 0.22; rl.v = 0;
          if (!rl.stopFired) {
            rl.stopFired = true;
            audio.sfx('slot_reel_stop', { pitch: 0.92 + r * 0.06 });
            if (rl.antic) { engine.pipeline.chromaticPulse(0.4, 0.3); shakeEl(windowEl); }
            if (r < 4 && reels[r + 1].antic && reels[r + 1].moving) { audio.sfx('slot_near_miss'); audio.sfx('heartbeat', { volume: 0.6 }); host.tension(0.6); }
          }
        } else {
          rl.pos = rl.from - rl.dist * prof(u, rl.a, rl.b);
          rl.v = dt > 0 ? (prev - rl.pos) / dt : 0;
        }
      } else if (rl.bounce > 0) rl.bounce = Math.max(0, rl.bounce - dt);
      if (rl.moving) allStopped = false;
    }
    if (allStopped && waitStop) { const f = waitStop; waitStop = null; f(); }
  }

  function clearPresentation(): void {
    winCells = new Set(); showLines = []; nearCells = []; scatterGlow = false;
    document.querySelectorAll('.cs-sm-badge.on').forEach((b) => b.classList.remove('on'));
  }

  async function doSpin(o: { free?: boolean; reroll?: boolean }): Promise<void> {
    if (spinning || !ctx.alive()) return;
    const free = !!o.free;
    const betAmt = free && s.free ? s.free.bet : picker.value();
    gambleBtn.style.display = 'none'; pendingGamble = 0;
    rerollBtn.style.display = 'none';
    if (!free && !o.reroll) {
      if (!takeBet('slots', betAmt)) {
        msg.textContent = 'No te alcanza el oro para esa apuesta, patojo.';
        audio.sfx('ui_error'); shakeEl(machine); auto = 0; updateAuto();
        return;
      }
      s.jackpot += Math.max(1, Math.round(betAmt * 0.015));
      if (await host.raidCheck('slots', betAmt)) return;
    }
    spinning = true; quick = false;
    clearPresentation();
    spinBtn.classList.add('stop'); (spinBtn.querySelector('.cs-big-label') as HTMLElement).textContent = free ? 'LIBRE' : 'PARAR';
    picker.disable(true);
    audio.sfx('slot_spin', { pitch: turbo ? 1.2 : 1 });
    winLabel.textContent = '0';
    msg.textContent = free ? `Giro de la Excepción · ×${s.free?.mult ?? 1}` : ['¡Que ruede la suerte!', 'Girando…', '¡Vamos, vamos!', 'El Libro te está mirando…'][Math.floor(Math.random() * 4)];

    // ── outcome first
    let ev = spin(Math.random);
    const force = G.run.flags.casino_debug ? (window as unknown as { __csForce?: string }).__csForce : undefined;
    if (force) {
      (window as unknown as { __csForce?: string }).__csForce = undefined;
      for (let i = 0; i < 400000; i++) {
        const e = spin(Math.random);
        const w = e.linePay / 20;
        if ((force === 'jackpot' && e.jackpot) || (force === 'fs' && e.scatters >= 3) || (force === 'big' && w >= 10 && w < 50) || (force === 'mega' && w >= 50) || (force === 'win' && w > 1 && w < 5) || (force === 'near' && e.near.length > 0) || (force === 'antic' && anticipate(e, 4) === 'jackpot')) { ev = e; break; }
      }
    }
    const lineUnit = betAmt / 20;
    const winOf = (e: SpinEval) => e.linePay * lineUnit + e.scatterPay * betAmt;
    let luckUsed = false;
    if (!free && winOf(ev) === 0 && ev.scatters < 3 && Math.random() < luck()) {
      const ev2 = spin(Math.random);
      if (winOf(ev2) > 0 || ev2.scatters >= 3) { ev = ev2; luckUsed = true; }
    }
    current = ev;
    const mult = free && s.free ? s.free.mult : 1;
    const baseWin = Math.floor(winOf(ev) * mult);
    let jackpotWin = 0;
    if (ev.jackpot) {
      const share = clamp(betAmt / JP_FULL_BET, 0.1, 1);
      jackpotWin = Math.floor(s.jackpot * share);
      s.jackpot = Math.max(JACKPOT_SEED, s.jackpot - jackpotWin);
      if (share >= 1) s.jackpot = JACKPOT_SEED;
      s.jackpotWins++;
    }
    let fsTrig: [number, number] | null = null;
    if (ev.scatters >= 3) {
      if (free && s.free) { s.free.spins += RETRIGGER; fsTrig = [RETRIGGER, s.free.mult]; }
      else { fsTrig = FREE_SPINS[Math.min(5, ev.scatters)]; s.free = { spins: fsTrig[0], mult: fsTrig[1], bet: betAmt, won: 0 }; }
    }
    // credit now (outcome first); the HUD waits for the reveal
    host.hud.holdGold();
    let net = 0;
    if (free && s.free) { s.free.won += baseWin + jackpotWin; }
    else {
      const stake = o.reroll ? 0 : betAmt;
      const r = settle('slots', stake, baseWin + jackpotWin);
      net = r.net;
      if (net > 0) improbable(ev.jackpot ? 1 / 9000 : baseWin >= betAmt * 50 ? 1 / 5000 : 1);
      else cleanRound();
    }

    await planReels(ev);
    host.tension(0);
    if (!ctx.alive()) { host.hud.releaseGold(); return; }

    // ── presentation
    const winLines = ev.lines;
    for (const lw of winLines) for (const [r, row] of lw.cells) winCells.add(key(r, row));
    if (ev.scatters >= 3) for (const [r, row] of ev.scatterCells) winCells.add(key(r, row));
    showLines = winLines.map((w) => w.line);
    winLines.forEach((w) => document.querySelectorAll(`.cs-sm-badge[data-line="${w.line}"]`).forEach((b) => b.classList.add('on')));
    const total = baseWin + jackpotWin;
    if (luckUsed && total > 0) { msg.textContent = '✦ ¡La suerte te dio una segunda oportunidad!'; sparkleAt(centerOf(windowEl).x, centerOf(windowEl).y, 24, '#7dffb0'); audio.sfx('cast_luck'); }
    const origin = centerOf(windowEl);

    if (ev.jackpot) {
      host.celebrate(3); shakeEl(machine, true);
      engine.hitstop(120);
      msg.textContent = '¡¡¡EL LIBRO EN LOS CINCO RODILLOS!!!';
      await winBanner('jackpot', total, { origin, sub: 'EL BOTE ES TUYO' });
      bus.emit('casino:jackpot', { amount: jackpotWin, relicId: null });
      addNews(`¡Alguien se llevó el bote del Gran Casino: ${fmt(jackpotWin)} de oro!`, 'casino', true);
      track('jackpots');
      let relic: string | null = null;
      try { relic = randomRelic(clamp(betAmt / JP_FULL_BET, 0.1, 1) >= 1 ? 3 : 1); } catch { relic = null; }
      if (relic) { try { grantRelic(relic, { reveal: true, where: 'puerto_fortuna' }); bus.emit('casino:relic', { relicId: relic, source: 'slots' }); } catch { /* stub */ } }
      host.say('¡¿QUÉ?! ¡Mi bote! ¡Alguien traiga mis sales, patojo!', { mood: 'scared', ms: 5000 });
    } else if (total > 0) {
      const tier = free ? null : tierFor(net, betAmt);
      winLabel.textContent = fmt(total);
      if (fsTrig && !free) msg.textContent = `¡${ev.scatters} ECLIPSES!`;
      else if (!luckUsed) msg.textContent = winLines.length ? describe(winLines[0], lineUnit * mult) + (winLines.length > 1 ? ` · y ${winLines.length - 1} más` : '') : `Eclipses: ${fmt(total)}`;
      if (tier === 'big' || tier === 'mega') {
        host.celebrate(2);
        await winBanner(tier, net, { origin });
        host.say(reactWin(net), { mood: 'surprised' });
      } else if (tier === 'win') {
        host.celebrate(1);
        coinBurst(origin.x, origin.y, 18 + Math.min(40, Math.floor(net / Math.max(1, betAmt) * 6)));
        audio.sfx('slot_win_small');
        const cu = countUp(winLabel, 0, total, 700); await cu.done;
      } else if (free) {
        audio.sfx('slot_win_small', { pitch: 1.1 });
        coinBurst(origin.x, origin.y, 14);
      } else if (net < 0) {
        ldwNote(windowEl, total, betAmt);
        if (Math.random() < 0.08) void narrate({ third: `Ganó ${fmt(total)}. Había apostado ${fmt(betAmt)}. Lo celebró de todos modos.`, first: `Gané ${fmt(total)}. Había apostado ${fmt(betAmt)}. Lo celebré de todos modos.` }, { position: 'top' });
      }
    } else {
      host.gloat();
      if (Math.random() < 0.12) host.say(reactLoss(), { mood: 'smug' });
      msg.textContent = ['Nada esta vez.', 'Casi, patojo. Casi.', 'La casa agradece.', 'Otra y ya.'][Math.floor(Math.random() * 4)];
    }
    host.hud.releaseGold();

    // honest near-misses
    if (!ev.jackpot && anticipate(ev, 4) === 'jackpot') {
      msg.textContent = '¡Casi el BOTE! Cuatro Libros…'; audio.sfx('crowd_gasp'); audio.sfx('slot_near_miss');
    } else if (ev.near.length && total < betAmt * 5) {
      nearCells = ev.near.map((n) => [n.reel, n.row] as [number, number]);
      audio.sfx('slot_near_miss', { volume: 0.7 });
      window.setTimeout(() => { nearCells = []; }, 1600);
    } else if (ev.scatters === 2 && reels[3].antic) {
      msg.textContent = 'Dos Eclipses… casi los Giros de la Excepción.';
    }

    // free spins trigger / flow
    if (fsTrig) {
      scatterGlow = true;
      audio.sfx('eclipse'); audio.stinger('discovery');
      engine.pipeline.flash('#c7a2ff', 0.35, 0.6);
      host.celebrate(2);
      msg.textContent = free ? `¡+${RETRIGGER} Giros de la Excepción!` : `¡GIROS DE LA EXCEPCIÓN! ${fsTrig[0]} giros ×${fsTrig[1]}`;
      await wait(1400);
      scatterGlow = false;
    }
    if (!free && !o.reroll && total === 0 && rerollLeft > 0) rerollBtn.style.display = '';
    if (!free && !ev.jackpot && !fsTrig && net > 0 && total <= 50000) pendingGamble = total;
    if (pendingGamble > 0 && auto === 0 && !s.free) { gambleBtn.style.display = ''; gambleBtn.textContent = `¡Doble o nada! (${fmt(pendingGamble)})`; }

    spinning = false;
    spinBtn.classList.remove('stop');
    (spinBtn.querySelector('.cs-big-label') as HTMLElement).textContent = 'GIRAR';
    picker.disable(!!s.free);
    picker.setLadder(betLadder(BETS));
    jpNum.textContent = fmt(s.jackpot);
    lineCycle = 0; lineCycleT = 1.4;
    host.hud.refresh('slots');

    if (s.free && ctx.alive()) {
      if (s.free.spins > 0) { renderFs(); window.setTimeout(() => void runFree(), turbo ? 300 : 650); return; }
      await endFree();
    }
    if (auto > 0 && ctx.alive()) {
      auto--; updateAuto();
      if (auto > 0) window.setTimeout(() => { if (auto > 0 && !spinning) void doSpin({}); }, turbo ? 200 : 500);
    }
  }

  function describe(lw: SpinEval['lines'][number], unit: number): string {
    return `Línea ${lw.line + 1} · ${lw.count}× ${SYM_LABEL[lw.sym].split(',')[0]} · ${fmt(Math.floor(lw.pay * unit))}`;
  }

  // ───────────── free spins ─────────────
  function renderFs(): void {
    const f = s.free;
    root.classList.toggle('fs', !!f);
    if (!f) { fsBar.innerHTML = ''; return; }
    fsBar.innerHTML = `<span class="cs-fs-title">${f.label ?? 'GIROS DE LA EXCEPCIÓN'}</span><span>Quedan <b>${f.spins}</b></span><span>Multiplicador <b>×${f.mult}</b></span><span>Ganado <b>${fmt(f.won)}</b></span>`;
  }
  async function runFree(): Promise<void> {
    if (!s.free || spinning || !ctx.alive()) return;
    s.free.spins--;
    renderFs();
    audio.setIntensity(0.6);
    await doSpin({ free: true });
  }
  async function endFree(): Promise<void> {
    const f = s.free;
    if (!f) return;
    s.free = null;
    renderFs();
    audio.setIntensity(0);
    const r = settle('slots', 0, f.won, { noStreak: true });
    const tier = tierFor(f.won, f.bet) ?? 'win';
    if (f.won > 0) {
      await winBanner(tier, r.net, { origin: centerOf(windowEl), sub: f.label ?? 'GIROS DE LA EXCEPCIÓN' });
      if (tier === 'big' || tier === 'mega') host.celebrate(2);
    }
    msg.textContent = `${f.label ? 'Giros de cortesía' : 'Giros de la Excepción'}: ${fmt(f.won)} en total.`;
    picker.disable(false);
  }

  // ───────────── auto / gamble ─────────────
  function startAuto(n: number): void {
    if (s.free) return;
    if (auto > 0) { auto = 0; updateAuto(); return; }
    auto = n; updateAuto();
    audio.sfx('ui_confirm');
    if (!spinning) void doSpin({});
  }
  function updateAuto(): void {
    autoLabel.textContent = auto > 0 ? `Auto: ${auto}` : 'Auto';
    autoBtns.forEach((b) => b.classList.toggle('on', auto > 0));
  }

  async function gamble(): Promise<void> {
    const amt = pendingGamble;
    if (amt <= 0 || spinning) return;
    gambleBtn.style.display = 'none';
    pendingGamble = 0;
    const pickSide = await coinPick(amt);
    if (!pickSide || !ctx.alive()) return;
    if (!takeBet('slots', amt)) return;
    const edge = Math.random() < 0.02;
    const land: 'sol' | 'luna' = Math.random() < 0.5 ? 'sol' : 'luna';
    const won = !edge && land === pickSide;
    await coinFlip(land, edge);
    host.hud.holdGold();
    const r = settle('slots', amt, won ? amt * 2 : 0);
    if (won) {
      coinBurst(origin().x, origin().y, 40, { gems: true });
      audio.sfx('slot_win_big');
      msg.textContent = `¡DOBLE! ${fmt(amt * 2)}`;
      winLabel.textContent = fmt(amt * 2);
      pendingGamble = amt * 2;
      if (pendingGamble <= 200000) { gambleBtn.style.display = ''; gambleBtn.textContent = `¡Doble o nada! (${fmt(pendingGamble)})`; }
    } else {
      audio.sfx('crowd_gasp'); host.gloat();
      msg.textContent = edge ? '¡De canto! La moneda se quedó parada… y la casa se lo lleva.' : 'Nada. La moneda eligió a la casa.';
      winLabel.textContent = '0';
      shakeEl(machine);
    }
    host.hud.releaseGold();
    void r;
  }
  const origin = () => centerOf(windowEl);

  function coinPick(amt: number): Promise<'sol' | 'luna' | null> {
    return new Promise((resolve) => {
      const box = h('div', { class: 'cs-gamble' },
        h('div', { class: 'cs-gamble-title' }, '¡DOBLE O NADA!'),
        h('div', { class: 'cs-gamble-sub' }, `Arriesgas ${fmt(amt)} de oro. Elige cara de la Moneda de Tiburcio.`),
        h('div', { class: 'cs-gamble-row' },
          h('button', { class: 'cs-btn gold big', onclick: () => { box.remove(); resolve('sol'); } }, '☀ Sol'),
          h('button', { class: 'cs-btn big', onclick: () => { box.remove(); resolve('luna'); } }, '☾ Luna')),
        h('button', { class: 'cs-btn small', onclick: () => { box.remove(); resolve(null); } }, 'Quedarme con lo ganado'));
      machine.appendChild(box);
      audio.sfx('ui_open');
    });
  }
  async function coinFlip(land: 'sol' | 'luna', edge: boolean): Promise<void> {
    const coin = h('div', { class: `cs-coinflip ${edge ? 'edge' : land}` }, h('div', { class: 'cs-coin-face sol' }, '☀'), h('div', { class: 'cs-coin-face luna' }, '☾'));
    machine.appendChild(coin);
    audio.sfx('whoosh');
    await wait(300); audio.sfx('coin', { pitch: 1.3 });
    await wait(1300);
    audio.sfx('dice_land', { pitch: 1.6 });
    await wait(500);
    coin.remove();
  }

  const wait = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

  // ───────────── lifecycle ─────────────
  layout();
  refreshInfo();
  const onResize = () => layout();
  window.addEventListener('resize', onResize);
  if (s.free) { renderFs(); picker.disable(true); msg.textContent = s.free.label ? `Don Tiburcio te regaló ${s.free.spins} giros. La casa invita.` : `Te quedaron ${s.free.spins} Giros de la Excepción.`; window.setTimeout(() => void runFree(), 1100); }
  host.say(s.jackpot > 12000 ? `El bote va en ${fmt(s.jackpot)}. Alguien se lo va a llevar hoy…` : '¡Dale al botón, patojo! El Libro te está esperando.', { mood: 'smile' });

  return {
    update(dt: number) {
      time += dt;
      stepReels(dt);
      if (!spinning && showLines.length > 1 && winCells.size) {
        lineCycleT -= dt;
        if (lineCycleT <= 0 && current) {
          lineCycleT = 1.1;
          const lw = current.lines[lineCycle % current.lines.length];
          lineCycle++;
          if (lw) { showLines = [lw.line]; winCells = new Set(lw.cells.map(([r, row]) => key(r, row))); msg.textContent = describe(lw, (s.free ? s.free.mult : 1) * picker.value() / 20); }
        }
      }
      if (!spinning) jpNum.textContent = fmt(s.jackpot);
      draw();
    },
    onKey(e: KeyboardEvent) {
      if (e.code === 'Space' || e.code === 'Enter') {
        if (e.repeat) return true;
        if (spinning) quick = true; else if (!s.free) void doSpin({});
        return true;
      }
      if (e.code === 'Escape' && document.querySelector('.cs-gamble')) { document.querySelector('.cs-gamble')?.remove(); return true; }
      return false;
    },
    close() {
      auto = 0;
      window.removeEventListener('resize', onResize);
      if (waitStop) { const f = waitStop; waitStop = null; f(); }
      host.hud.releaseGold();
      root.remove();
      audio.setIntensity(0);
    },
  };
}
