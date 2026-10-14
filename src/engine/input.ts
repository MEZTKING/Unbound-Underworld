import { len, type Vec } from './math';

export type Action =
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'dash'
  | 'jump'
  | 'attack'
  | 'special'
  | 'cast'
  | 'interact'
  | 'potion'
  | 'artifact1'
  | 'artifact2'
  | 'artifact3'
  | 'pause'
  | 'mute'
  | 'menuUp'
  | 'menuDown'
  | 'menuLeft'
  | 'menuRight'
  | 'confirm'
  | 'back';

const KEYMAP: Record<string, Action[]> = {
  KeyW: ['up'],
  ArrowUp: ['up', 'menuUp'],
  KeyS: ['down'],
  ArrowDown: ['down', 'menuDown'],
  KeyA: ['left'],
  ArrowLeft: ['left', 'menuLeft'],
  KeyD: ['right'],
  ArrowRight: ['right', 'menuRight'],
  Space: ['dash', 'confirm'],
  ShiftLeft: ['jump'],
  ShiftRight: ['jump'],
  KeyC: ['jump'],
  KeyR: ['potion'],
  Digit1: ['artifact1'],
  Digit2: ['artifact2'],
  Digit3: ['artifact3'],
  Numpad1: ['artifact1'],
  Numpad2: ['artifact2'],
  Numpad3: ['artifact3'],
  KeyJ: ['attack'],
  KeyK: ['special'],
  KeyQ: ['cast'],
  KeyL: ['cast'],
  KeyE: ['interact'],
  KeyF: ['interact'],
  Escape: ['pause', 'back'],
  KeyP: ['pause'],
  KeyM: ['mute'],
  Enter: ['confirm'],
  NumpadEnter: ['confirm'],
};

const MOUSEMAP: Record<number, Action> = { 0: 'attack', 1: 'cast', 2: 'special' };

/** Standard gamepad layout button indices. */
const PADMAP: Record<number, Action[]> = {
  0: ['dash', 'confirm'], // A / Cross
  1: ['jump', 'back'], // B / Circle
  2: ['attack'], // X / Square
  3: ['special'], // Y / Triangle
  4: ['potion'], // LB
  5: ['cast'], // RB
  6: ['artifact2'], // LT
  7: ['artifact1'], // RT
  8: ['interact'], // Back / Select
  9: ['pause'], // Start
  10: ['artifact3'], // L3
  11: ['interact'], // R3
  12: ['menuUp', 'interact'],
  13: ['menuDown'],
  14: ['menuLeft'],
  15: ['menuRight'],
};

const PREVENT = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab']);

export type AimSource = 'mouse' | 'stick' | 'move';

export class Input {
  private held = new Map<Action, number>();
  private pressedSet = new Set<Action>();
  private releasedSet = new Set<Action>();
  private padHeld = new Set<Action>();
  /** Mouse position in CSS pixels relative to the canvas. */
  mouse: Vec = { x: 0, y: 0 };
  mouseInside = false;
  lastMouseUse = -Infinity;
  lastPadUse = -Infinity;
  padMove: Vec = { x: 0, y: 0 };
  padAim: Vec = { x: 0, y: 0 };
  /** Listeners for raw key presses (used by menus). */
  onAction: ((a: Action) => void) | null = null;

  constructor(private target: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (PREVENT.has(e.code)) e.preventDefault();
      if (e.repeat) {
        // Repeats still drive menu navigation.
        for (const a of KEYMAP[e.code] ?? []) if (a.startsWith('menu')) this.onAction?.(a);
        return;
      }
      for (const a of KEYMAP[e.code] ?? []) this.press(a);
    });
    window.addEventListener('keyup', (e) => {
      for (const a of KEYMAP[e.code] ?? []) this.release(a);
    });
    window.addEventListener('blur', () => {
      for (const a of [...this.held.keys()]) this.release(a);
    });
    target.addEventListener('mousemove', (e) => {
      const r = target.getBoundingClientRect();
      this.mouse = { x: e.clientX - r.left, y: e.clientY - r.top };
      this.mouseInside = true;
      this.lastMouseUse = performance.now();
    });
    target.addEventListener('mouseleave', () => (this.mouseInside = false));
    target.addEventListener('mousedown', (e) => {
      const a = MOUSEMAP[e.button];
      this.lastMouseUse = performance.now();
      if (a) {
        e.preventDefault();
        this.press(a);
      }
    });
    window.addEventListener('mouseup', (e) => {
      const a = MOUSEMAP[e.button];
      if (a) this.release(a);
    });
    target.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private press(a: Action): void {
    this.held.set(a, (this.held.get(a) ?? 0) + 1);
    this.pressedSet.add(a);
    this.onAction?.(a);
  }

  private release(a: Action): void {
    const n = (this.held.get(a) ?? 0) - 1;
    if (n <= 0) {
      this.held.delete(a);
      this.releasedSet.add(a);
    } else this.held.set(a, n);
  }

  down(a: Action): boolean {
    return this.held.has(a) || this.padHeld.has(a);
  }
  pressed(a: Action): boolean {
    return this.pressedSet.has(a);
  }
  released(a: Action): boolean {
    return this.releasedSet.has(a);
  }
  /** Consumes a press so later systems in the same step don't see it again. */
  consume(a: Action): boolean {
    const had = this.pressedSet.has(a);
    this.pressedSet.delete(a);
    return had;
  }

  /** Clear edge-triggered state; call after each fixed update step. */
  endStep(): void {
    this.pressedSet.clear();
    this.releasedSet.clear();
  }

  moveVector(): Vec {
    let x = 0;
    let y = 0;
    if (this.down('left')) x -= 1;
    if (this.down('right')) x += 1;
    if (this.down('up')) y -= 1;
    if (this.down('down')) y += 1;
    if (len(this.padMove) > 0.2) {
      x += this.padMove.x;
      y += this.padMove.y;
    }
    const l = Math.hypot(x, y);
    return l > 1 ? { x: x / l, y: y / l } : { x, y };
  }

  /** Which aim source to trust right now. */
  aimSource(): AimSource {
    if (len(this.padAim) > 0.35) return 'stick';
    if (this.lastPadUse > this.lastMouseUse) return 'move';
    return this.mouseInside || performance.now() - this.lastMouseUse < 4000 ? 'mouse' : 'move';
  }

  pollGamepads(): void {
    const pads = navigator.getGamepads?.() ?? [];
    const now = new Set<Action>();
    let move = { x: 0, y: 0 };
    let aim = { x: 0, y: 0 };
    for (const p of pads) {
      if (!p) continue;
      const dz = (v: number) => (Math.abs(v) < 0.18 ? 0 : v);
      move = { x: dz(p.axes[0] ?? 0), y: dz(p.axes[1] ?? 0) };
      aim = { x: dz(p.axes[2] ?? 0), y: dz(p.axes[3] ?? 0) };
      p.buttons.forEach((b, i) => {
        if (b.pressed) for (const a of PADMAP[i] ?? []) now.add(a);
      });
      // Left stick doubles as menu navigation.
      if (move.y < -0.6) now.add('menuUp');
      if (move.y > 0.6) now.add('menuDown');
      if (move.x < -0.6) now.add('menuLeft');
      if (move.x > 0.6) now.add('menuRight');
      break;
    }
    if (now.size > 0 || len(move) > 0 || len(aim) > 0) this.lastPadUse = performance.now();
    for (const a of now) {
      if (!this.padHeld.has(a)) {
        this.pressedSet.add(a);
        this.onAction?.(a);
      }
    }
    for (const a of this.padHeld) if (!now.has(a)) this.releasedSet.add(a);
    this.padHeld = now;
    this.padMove = move;
    this.padAim = aim;
  }

  get element(): HTMLElement {
    return this.target;
  }
}
