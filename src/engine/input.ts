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
  | 'wrath'
  | 'guard'
  | 'pause'
  | 'mute'
  | 'menuUp'
  | 'menuDown'
  | 'menuLeft'
  | 'menuRight'
  | 'confirm'
  | 'back';

/** The default keyboard layout. Game actions can be rebound (see `Input.setBindings`). */
const DEFAULT_KEYMAP: Record<string, Action[]> = {
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
  Digit4: ['potion'],
  Digit5: ['wrath'],
  KeyV: ['guard'],
  Numpad1: ['artifact1'],
  Numpad2: ['artifact2'],
  Numpad3: ['artifact3'],
  KeyJ: ['attack'],
  KeyK: ['special'],
  KeyQ: ['cast'],
  KeyL: ['cast'],
  KeyE: ['interact'],
  KeyF: ['wrath'],
  Escape: ['pause', 'back'],
  KeyP: ['pause'],
  KeyM: ['mute'],
  Enter: ['confirm'],
  NumpadEnter: ['confirm'],
};

/** Game actions the player can rebind, in the order the Controls screen lists them. */
export const BINDABLE: { action: Action; label: string }[] = [
  { action: 'up', label: 'Move up' },
  { action: 'down', label: 'Move down' },
  { action: 'left', label: 'Move left' },
  { action: 'right', label: 'Move right' },
  { action: 'attack', label: 'Attack' },
  { action: 'special', label: 'Special' },
  { action: 'cast', label: 'Cast' },
  { action: 'dash', label: 'Dash' },
  { action: 'jump', label: 'Jump' },
  { action: 'guard', label: 'Guard / parry' },
  { action: 'interact', label: 'Interact' },
  { action: 'potion', label: 'Potion' },
  { action: 'artifact1', label: 'Artifact 1' },
  { action: 'artifact2', label: 'Artifact 2' },
  { action: 'artifact3', label: 'Artifact 3' },
  { action: 'wrath', label: 'Wrath' },
];

/** Keys bound to an action in the default layout. */
export function defaultKeysFor(a: Action): string[] {
  return Object.entries(DEFAULT_KEYMAP)
    .filter(([, acts]) => acts.includes(a))
    .map(([k]) => k);
}

/** "KeyW" → "W", "Digit4" → "4", "ShiftLeft" → "Left Shift". */
export function keyLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`;
  if (code.startsWith('Arrow')) return { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' }[code] ?? code;
  const named: Record<string, string> = { ShiftLeft: 'Left Shift', ShiftRight: 'Right Shift', ControlLeft: 'Left Ctrl', ControlRight: 'Right Ctrl', AltLeft: 'Left Alt', AltRight: 'Right Alt', Space: 'Space', Tab: 'Tab', CapsLock: 'Caps Lock', Backquote: '`' };
  return named[code] ?? code;
}

const MOUSEMAP: Record<number, Action> = { 0: 'attack', 1: 'cast', 2: 'special' };

/** Standard gamepad layout button indices. */
const PADMAP: Record<number, Action[]> = {
  0: ['dash', 'confirm'], // A / Cross
  1: ['jump', 'back'], // B / Circle
  2: ['attack'], // X / Square
  3: ['special'], // Y / Triangle
  4: ['potion'], // LB
  5: ['cast'], // RB
  6: ['guard'], // LT
  7: ['artifact1'], // RT
  8: ['interact'], // Back / Select
  9: ['pause'], // Start
  10: ['artifact3'], // L3
  11: ['wrath'], // R3
  12: ['menuUp', 'interact'],
  13: ['menuDown'],
  14: ['menuLeft', 'artifact2'],
  15: ['menuRight'],
};

const PREVENT = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab']);

/** 'auto' = touch play without a drag: aim at the nearest foe. */
export type AimSource = 'mouse' | 'stick' | 'move' | 'auto';

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
  /** On-screen joystick and drag-to-aim vectors (touch controls). */
  touchMove: Vec = { x: 0, y: 0 };
  touchAim: Vec = { x: 0, y: 0 };
  lastTouchUse = -Infinity;
  /** Listeners for raw key presses (used by menus). */
  onAction: ((a: Action) => void) | null = null;
  /** When set, the next key press goes here instead (rebinding a key). */
  captureKey: ((code: string) => void) | null = null;
  private keymap: Record<string, Action[]> = { ...DEFAULT_KEYMAP };

  /**
   * Applies custom bindings: for each rebound action, its default keys are
   * replaced by the chosen ones. Menu keys (arrows, Enter, Esc) always work.
   */
  setBindings(custom: Partial<Record<Action, string[]>>): void {
    const map: Record<string, Action[]> = {};
    for (const [code, acts] of Object.entries(DEFAULT_KEYMAP)) {
      const kept = acts.filter((a) => !custom[a] || a.startsWith('menu') || a === 'confirm' || a === 'back' || a === 'pause');
      if (kept.length) map[code] = [...kept];
    }
    for (const [a, codes] of Object.entries(custom) as [Action, string[]][]) {
      for (const code of codes ?? []) (map[code] ??= []).includes(a) || map[code].push(a);
    }
    for (const a of [...this.held.keys()]) this.release(a);
    this.keymap = map;
  }

  /** Keys currently bound to an action. */
  keysFor(a: Action): string[] {
    return Object.entries(this.keymap)
      .filter(([, acts]) => acts.includes(a))
      .map(([k]) => k);
  }

  constructor(private target: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (this.captureKey && !e.repeat) {
        e.preventDefault();
        const fn = this.captureKey;
        this.captureKey = null;
        fn(e.code);
        return;
      }
      if (PREVENT.has(e.code)) e.preventDefault();
      if (e.repeat) {
        // Repeats still drive menu navigation.
        for (const a of this.keymap[e.code] ?? []) if (a.startsWith('menu')) this.onAction?.(a);
        return;
      }
      for (const a of this.keymap[e.code] ?? []) this.press(a);
    });
    window.addEventListener('keyup', (e) => {
      for (const a of this.keymap[e.code] ?? []) this.release(a);
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

  /** Presses from on-screen touch buttons. */
  virtualPress(a: Action): void {
    this.lastTouchUse = performance.now();
    this.press(a);
  }
  virtualRelease(a: Action): void {
    this.release(a);
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
    if (len(this.touchMove) > 0.15) {
      x += this.touchMove.x;
      y += this.touchMove.y;
    }
    const l = Math.hypot(x, y);
    return l > 1 ? { x: x / l, y: y / l } : { x, y };
  }

  /** Which aim source to trust right now. */
  aimSource(): AimSource {
    if (len(this.padAim) > 0.35 || len(this.touchAim) > 0.35) return 'stick';
    if (this.lastTouchUse > this.lastMouseUse && this.lastTouchUse > this.lastPadUse) return 'auto';
    if (this.lastPadUse > this.lastMouseUse) return 'move';
    return this.mouseInside || performance.now() - this.lastMouseUse < 4000 ? 'mouse' : 'move';
  }

  /** Analog aim from the right stick or a touch drag. */
  stickAim(): Vec {
    return len(this.touchAim) > len(this.padAim) ? this.touchAim : this.padAim;
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
