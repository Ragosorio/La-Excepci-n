/* eslint-disable */
// @ts-nocheck
/**
 * DEV ONLY — virtual-time fast-forward harness for automated playtesting in hidden/throttled tabs.
 * Activated with ?vt in the URL (see main.ts). Replaces rAF/timers/performance.now with a virtual clock
 * driven by MessageChannel, and exposes window.__vt { play(ms, opts), pause(), resume(), press(code), clickDlg() }.
 * Add &vtpause to start paused.
 */
export function installVirtualTime(startPaused = false): string {
  if ((window as any).__vt) return 'already';
  const realNow = performance.now.bind(performance);
  let vnow = realNow();
  const timers = new Map();
  let tid = 1e6;
  let rafQ = [];
  const ch = new MessageChannel();
  const vt: any = { paused: false, ticking: false, frames: 0, step: 1000 / 60, errors: [] };
  window.__vt = vt;
  const realRaf = window.requestAnimationFrame.bind(window);
  performance.now = () => vnow;
  window.requestAnimationFrame = (cb) => { rafQ.push(cb); return rafQ.length; };
  window.cancelAnimationFrame = () => {};
  window.setTimeout = (fn, ms = 0, ...args) => { const id = ++tid; timers.set(id, { at: vnow + Math.max(0, Number(ms) || 0), fn, args, every: 0 }); return id; };
  window.clearTimeout = (id) => { timers.delete(id); };
  window.setInterval = (fn, ms = 0, ...args) => { const id = ++tid; const every = Math.max(1, Number(ms) || 1); timers.set(id, { at: vnow + every, fn, args, every }); return id; };
  window.clearInterval = (id) => { timers.delete(id); };
  function tick() {
    if (vt.paused) { vt.ticking = false; return; }
    vnow += vt.step;
    vt.frames++;
    for (const [id, t] of [...timers]) {
      if (t.at <= vnow) {
        if (t.every) t.at += t.every; else timers.delete(id);
        try { typeof t.fn === 'function' ? t.fn(...t.args) : 0; } catch (e) { vt.errors.push(String(e && e.stack || e)); }
      }
    }
    const q = rafQ; rafQ = [];
    for (const cb of q) { try { cb(vnow); } catch (e) { vt.errors.push(String(e && e.stack || e)); } }
    ch.port2.postMessage(0);
  }
  ch.port1.onmessage = tick;
  vt.paused = startPaused;
  vt.ticking = true;
  ch.port2.postMessage(0);
  vt.pause = () => { vt.paused = true; };
  vt.resume = () => { vt.paused = false; if (!vt.ticking) { vt.ticking = true; ch.port2.postMessage(0); } };
  vt.now = () => vnow;
  /** Render once inside a REAL animation frame so the compositor/screenshot sees the current image. */
  vt.frame = () => new Promise((res) => realRaf(() => {
    try {
      const E = (window as any).LX?.engine; const sc = E?.current;
      if (sc && !sc.domOnly) { if (sc.render) sc.render(0); else E.pipeline.render(sc.scene, sc.camera, 0, E.realTime); }
    } catch (e) { vt.errors.push(String(e)); }
    res(true);
  }));
  // helpers
  vt.sleep = (ms) => new Promise((r) => window.setTimeout(r, ms));
  vt.clickDlg = () => { const b = document.querySelector('.lx-dlg-box'); if (b) { b.click(); return true; } return false; };
  vt.key = (code, type = 'keydown') => window.dispatchEvent(new KeyboardEvent(type, { code, key: code.replace('Key', '').toLowerCase(), bubbles: true }));
  vt.press = async (code, ms = 80) => { vt.key(code, 'keydown'); await vt.sleep(ms); vt.key(code, 'keyup'); };
  /** Advance virtual time, auto-advancing dialogues (without choices) and optionally picking the first choice. */
  vt.play = async (ms, opts = {}) => {
    vt.resume();
    const end = vnow + ms;
    while (vnow < end) {
      await vt.sleep(250);
      if (opts.dialogue !== false) {
        const choices = document.querySelectorAll('.lx-dlg-choice:not(.disabled)');
        if (choices.length && opts.choose !== undefined) { choices[Math.min(opts.choose, choices.length - 1)].click(); }
        else if (!choices.length) vt.clickDlg();
      }
      if (opts.until && opts.until()) break;
    }
    if (opts.keepRunning !== true) vt.pause();
    return { scene: window.LX?.engine?.sceneId, vnow: Math.round(vnow) };
  };

  /**
   * Crude battle bot for Elias: walks to the nearest enemy, aims at it, holds LMB (punch/chispa),
   * and fires slot abilities when crowded. Returns when the battle ends or `ms` elapses.
   */
  vt.drive = async (ms, closeRange = 1.6) => {
    const inp = (await import('../core/input')).input;
    const end = vnow + ms; vt.resume(); let t = 0;
    while (vnow < end) {
      await vt.sleep(100); t++;
      const sc = window.LX?.engine?.current;
      if (!sc || sc.id !== 'battle' || !sc.b) break;
      const b = sc.b, u = b.u, pi = b.playerIdx;
      if (b.phase !== 'fight') { if (b.phase === 'deploy') { const go = [...document.querySelectorAll('#ui-root button')].find((x) => /Comenzar/.test(x.textContent)); go?.click(); } continue; }
      let best = -1, bd = 1e9, near = 0;
      for (let i = 0; i < u.n; i++) {
        if (!u.active[i] || u.team[i] === u.team[pi] || u.hp[i] <= 0) continue;
        const d = Math.hypot(u.x[i] - u.x[pi], u.z[i] - u.z[pi]);
        if (d < 4) near++;
        if (d < bd) { bd = d; best = i; }
      }
      inp.keys.clear(); inp.mouse.buttons[0] = false;
      if (best < 0) continue;
      const cam = sc.camera; const V = cam.position.constructor;
      const pr = new V(u.x[best], (u.y[best] || 0) + 0.5, u.z[best]).project(cam);
      inp.mouse.nx = pr.x; inp.mouse.ny = pr.y; inp.mouse.overUI = false;
      const fwd = new V(); cam.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
      const rx = -fwd.z, rz = fwd.x;
      const dx = (u.x[best] - u.x[pi]) / bd, dz = (u.z[best] - u.z[pi]) / bd;
      const f = dx * fwd.x + dz * fwd.z, r = dx * rx + dz * rz;
      if (bd > closeRange) { if (f > 0.35) inp.keys.add('KeyW'); if (f < -0.35) inp.keys.add('KeyS'); if (r > 0.35) inp.keys.add('KeyD'); if (r < -0.35) inp.keys.add('KeyA'); }
      inp.mouse.buttons[0] = true;
      if (near >= 2 && t % 25 === 0) { vt.key('Digit1', 'keydown'); vt.key('Digit1', 'keyup'); }
      if (near >= 3 && t % 40 === 0) { const cv = document.getElementById('game-canvas'); cv?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 2 })); cv?.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 2 })); }
    }
    inp.keys.clear(); inp.mouse.buttons[0] = false; vt.pause();
    const sc = window.LX?.engine?.current; const b = sc?.b;
    return { scene: window.LX?.engine?.sceneId, fighting: b?.fighting, stats: b?.stats, hp: b ? Math.round(b.u.hp[b.playerIdx]) : null };
  };
  window.__errs = [];
  const oe = console.error.bind(console);
  console.error = (...a) => { window.__errs.push(a.map(x => x && x.stack ? x.stack.split('\n').slice(0,4).join(' | ') : String(x)).join(' ')); oe(...a); };
  window.addEventListener('error', e => window.__errs.push('ERR ' + e.message + ' @' + e.filename + ':' + e.lineno));
  window.addEventListener('unhandledrejection', e => window.__errs.push('REJ ' + (e.reason && e.reason.stack ? e.reason.stack.split('\n').slice(0,4).join(' | ') : String(e.reason))));
  return 'vt installed';
}
