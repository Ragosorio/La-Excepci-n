/**
 * Keyboard + mouse state. Uses KeyboardEvent.code ('KeyW', 'Space', 'Digit1', 'ShiftLeft', 'Escape'...).
 * Edge events (pressed/released, clicks, wheel, mouse delta) are collected between frames and published by
 * beginFrame() at the START of each engine frame, so they stay readable for the whole frame — including promise
 * continuations that run after the frame's synchronous work (e.g. `await until(() => input.rawPressed('KeyE'))`).
 * World clicks: `mouse.pressedWorld[b]` is only true when the click landed on the game canvas (not on UI).
 */
export type Action =
  | 'up' | 'down' | 'left' | 'right' | 'sprint' | 'dodge' | 'interact' | 'pause' | 'menu'
  | 'slot1' | 'slot2' | 'slot3' | 'slot4' | 'relic1' | 'relic2' | 'ultimate'
  | 'cmdCharge' | 'cmdHold' | 'cmdFollow' | 'camera' | 'codex' | 'relics' | 'quests' | 'map'
  | 'speed1' | 'speed2' | 'speed3' | 'confirm' | 'cancel';

const DEFAULT_BINDINGS: Record<Action, string[]> = {
  up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
  sprint: ['ShiftLeft', 'ShiftRight'], dodge: ['Space'], interact: ['KeyE', 'KeyF'], pause: ['Space', 'KeyP'], menu: ['Escape'],
  slot1: ['Digit1'], slot2: ['Digit2'], slot3: ['Digit3'], slot4: ['Digit4'], relic1: ['KeyQ'], relic2: ['KeyE'], ultimate: ['KeyR'],
  cmdCharge: ['KeyZ'], cmdHold: ['KeyX'], cmdFollow: ['KeyC'], camera: ['KeyV'], codex: ['Tab'], relics: ['KeyI'], quests: ['KeyJ'], map: ['KeyM'],
  speed1: ['Digit1'], speed2: ['Digit2'], speed3: ['Digit3'], confirm: ['Enter', 'Space'], cancel: ['Escape'],
};

class InputState {
  readonly keys = new Set<string>();
  readonly pressed = new Set<string>();
  readonly released = new Set<string>();
  bindings: Record<Action, string[]> = structuredClone(DEFAULT_BINDINGS);
  /** When false, game-world queries return nothing (UI modal open, cutscene...). UI still works. */
  enabled = true;
  readonly mouse = {
    x: 0, y: 0,            // client px
    nx: 0, ny: 0,          // NDC -1..1 (y up)
    dx: 0, dy: 0,          // movement this frame (pointer lock aware)
    wheel: 0,              // accumulated this frame (+ = scroll down)
    buttons: [false, false, false],
    pressed: [false, false, false],
    released: [false, false, false],
    pressedWorld: [false, false, false],
    overUI: false,
  };
  private canvas: HTMLElement | null = null;
  lastActivity = performance.now();
  // edges collected since the last beginFrame()
  private nextPressed = new Set<string>();
  private nextReleased = new Set<string>();
  private nextMouse = { dx: 0, dy: 0, wheel: 0, pressed: [false, false, false], released: [false, false, false], pressedWorld: [false, false, false] };

  attach(canvas: HTMLElement): void {
    this.canvas = canvas;
    const isTyping = (e: Event) => {
      const t = e.target as HTMLElement | null;
      return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
    };
    window.addEventListener('keydown', (e) => {
      this.lastActivity = performance.now();
      if (isTyping(e)) return;
      if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      if (!this.keys.has(e.code)) this.nextPressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      this.nextReleased.add(e.code);
    });
    window.addEventListener('blur', () => { this.keys.clear(); this.mouse.buttons = [false, false, false]; });
    window.addEventListener('pointermove', (e) => {
      this.lastActivity = performance.now();
      this.mouse.x = e.clientX; this.mouse.y = e.clientY;
      this.mouse.nx = (e.clientX / window.innerWidth) * 2 - 1;
      this.mouse.ny = -(e.clientY / window.innerHeight) * 2 + 1;
      this.nextMouse.dx += e.movementX || 0; this.nextMouse.dy += e.movementY || 0;
      this.mouse.overUI = e.target !== this.canvas && !document.pointerLockElement;
    });
    window.addEventListener('pointerdown', (e) => {
      this.lastActivity = performance.now();
      const b = e.button;
      if (b > 2) return;
      this.mouse.buttons[b] = true;
      this.nextMouse.pressed[b] = true;
      if (e.target === this.canvas || document.pointerLockElement) this.nextMouse.pressedWorld[b] = true;
    });
    window.addEventListener('pointerup', (e) => {
      const b = e.button;
      if (b > 2) return;
      this.mouse.buttons[b] = false;
      this.nextMouse.released[b] = true;
    });
    window.addEventListener('wheel', (e) => {
      if (e.target === this.canvas) { this.nextMouse.wheel += Math.sign(e.deltaY); }
    }, { passive: true });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  down(code: string): boolean { return this.enabled && this.keys.has(code); }
  wasPressed(code: string): boolean { return this.enabled && this.pressed.has(code); }
  wasReleased(code: string): boolean { return this.enabled && this.released.has(code); }
  action(a: Action): boolean { return this.enabled && this.bindings[a].some((c) => this.keys.has(c)); }
  actionPressed(a: Action): boolean { return this.enabled && this.bindings[a].some((c) => this.pressed.has(c)); }
  /** Raw pressed (ignores `enabled`) — for UI shortcuts like Escape. */
  rawPressed(code: string): boolean { return this.pressed.has(code); }
  axis(neg: Action, pos: Action): number { return (this.action(pos) ? 1 : 0) - (this.action(neg) ? 1 : 0); }
  /** Movement vector (x = right, y = up/forward), normalized. */
  moveVector(): { x: number; y: number } {
    const x = this.axis('left', 'right'), y = this.axis('down', 'up');
    const l = Math.hypot(x, y) || 1;
    return { x: x / l, y: y / l };
  }
  mousePressed(b = 0): boolean { return this.enabled && this.mouse.pressedWorld[b]; }
  mouseDown(b = 0): boolean { return this.enabled && this.mouse.buttons[b] && !this.mouse.overUI; }
  requestPointerLock(): void {
    // optional feature: some embeds/phones refuse it (the promise rejects) — the game works without it
    try {
      const p = (this.canvas?.requestPointerLock as (() => Promise<void> | void) | undefined)?.call(this.canvas);
      if (p && typeof (p as Promise<void>).catch === 'function') (p as Promise<void>).catch(() => { /* ignore */ });
    } catch { /* ignore */ }
  }
  exitPointerLock(): void { if (document.pointerLockElement) document.exitPointerLock(); }
  get pointerLocked(): boolean { return !!document.pointerLockElement; }
  idleSeconds(): number { return (performance.now() - this.lastActivity) / 1000; }

  /** Publishes the edges collected since the previous frame. Called by the engine at the start of every frame. */
  beginFrame(): void {
    this.pressed.clear();
    this.released.clear();
    for (const c of this.nextPressed) this.pressed.add(c);
    for (const c of this.nextReleased) this.released.add(c);
    this.nextPressed.clear();
    this.nextReleased.clear();
    const m = this.mouse, n = this.nextMouse;
    for (let b = 0; b < 3; b++) {
      m.pressed[b] = n.pressed[b]; m.released[b] = n.released[b]; m.pressedWorld[b] = n.pressedWorld[b];
      n.pressed[b] = false; n.released[b] = false; n.pressedWorld[b] = false;
    }
    m.wheel = n.wheel; m.dx = n.dx; m.dy = n.dy;
    n.wheel = 0; n.dx = 0; n.dy = 0;
  }

  /** Kept for compatibility: edges now expire in beginFrame(). */
  endFrame(): void { /* no-op */ }

}

export const input = new InputState();
