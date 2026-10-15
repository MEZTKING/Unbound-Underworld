import type { Action, Input } from '../engine/input';

/** What the touch layer needs to show each frame. */
export interface TouchHud {
  /** Gameplay is running (no menu, not on the title screen). */
  active: boolean;
  artifacts: ({ glyph: string; color: string; cd: number; usable: boolean } | null)[];
  /** Level-gated buttons are hidden until unlocked. */
  cast: boolean;
  jump: boolean;
  guard: boolean;
  potion: boolean;
  /** Wrath gauge 0..1, or null while Wrath is locked. */
  wrath: number | null;
  potionCd: number;
  /** 0..1 of the dash cooldown left while no charge is ready. */
  dashCd: number;
  castAmmo: number;
  interact: string | null;
}

const JOY_RADIUS = 56;
const AIM_DEADZONE = 22;
/** Buttons that can be dragged to aim while held. */
const AIMABLE = new Set<Action>(['attack', 'special', 'cast']);

const BUTTONS: { a: Action; cls: string; label: string }[] = [
  { a: 'attack', cls: 'attack', label: '⚔' },
  { a: 'special', cls: 'special', label: '✦' },
  { a: 'cast', cls: 'cast', label: '◆' },
  { a: 'dash', cls: 'dash', label: '»' },
  { a: 'jump', cls: 'jump', label: '⤒' },
  { a: 'guard', cls: 'guard', label: '⛨' },
  { a: 'potion', cls: 'potion small', label: '⚗' },
  { a: 'wrath', cls: 'wrath small', label: '☄' },
  { a: 'artifact1', cls: 'art art1 small', label: '' },
  { a: 'artifact2', cls: 'art art2 small', label: '' },
  { a: 'artifact3', cls: 'art art3 small', label: '' },
  { a: 'interact', cls: 'interact pill', label: 'Interact' },
  { a: 'pause', cls: 'pause small', label: '❚❚' },
];

interface Held {
  action: Action;
  el: HTMLElement;
  ox: number;
  oy: number;
}

/**
 * On-screen controls for phones and tablets: a floating joystick on the left
 * half of the screen and an action cluster on the right. Buttons feed the same
 * actions as the keyboard, so every gameplay system works unchanged.
 */
export class TouchControls {
  enabled = false;
  private root: HTMLElement;
  private base: HTMLElement;
  private knob: HTMLElement;
  private els = new Map<Action, HTMLElement>();
  private joyId: number | null = null;
  private joyOrigin = { x: 0, y: 0 };
  private held = new Map<number, Held>();
  private last = '';
  private lefty = false;
  /** Called on the first touch so audio can unlock inside the gesture. */
  onFirstTouch: (() => void) | null = null;

  constructor(private input: Input) {
    const root = document.createElement('div');
    root.id = 'touch';
    root.innerHTML = `
      <div class="joy-zone"></div>
      <div class="joy-base idle"><div class="joy-knob"></div></div>
      ${BUTTONS.map((b) => `<div class="tb ${b.cls}" data-a="${b.a}"><span>${b.label}</span><i class="cd"></i></div>`).join('')}`;
    document.body.appendChild(root);
    this.root = root;
    this.base = root.querySelector('.joy-base')!;
    this.knob = root.querySelector('.joy-knob')!;
    for (const b of BUTTONS) this.els.set(b.a, root.querySelector(`[data-a="${b.a}"]`)!);

    const opts = { passive: false } as const;
    root.addEventListener('touchstart', (e) => this.start(e), opts);
    root.addEventListener('touchmove', (e) => this.move(e), opts);
    root.addEventListener('touchend', (e) => this.end(e), opts);
    root.addEventListener('touchcancel', (e) => this.end(e), opts);
    window.addEventListener('touchstart', () => this.enable(), { passive: true, capture: true });
    window.addEventListener('blur', () => this.releaseAll());
    if (window.matchMedia?.('(pointer: coarse)').matches) this.enable();
  }

  /** Button size, opacity and a mirrored layout for left-handed play. */
  configure(size: number, opacity: number, leftHanded: boolean): void {
    this.root.style.setProperty('--tscale', `${size}`);
    this.root.style.setProperty('--topa', `${opacity}`);
    this.lefty = leftHanded;
    this.root.classList.toggle('lefty', leftHanded);
    this.last = '';
  }

  /** Screen x as laid out (the layer is mirrored in left-handed mode). */
  private lx(x: number): number {
    return this.lefty ? window.innerWidth - x : x;
  }

  enable(): void {
    if (this.enabled) return;
    this.enabled = true;
    this.root.classList.add('on');
    document.body.classList.add('touch');
    this.onFirstTouch?.();
  }

  /** Lets go of every held control (menus opening, app backgrounded). */
  releaseAll(): void {
    for (const h of this.held.values()) {
      this.input.virtualRelease(h.action);
      h.el.classList.remove('down');
    }
    this.held.clear();
    this.endJoystick();
    this.input.touchAim = { x: 0, y: 0 };
  }

  private start(e: TouchEvent): void {
    e.preventDefault();
    for (const t of Array.from(e.changedTouches)) {
      const btn = (t.target as HTMLElement).closest<HTMLElement>('[data-a]');
      if (btn) {
        if (btn.classList.contains('gone')) continue;
        const action = btn.dataset.a as Action;
        this.held.set(t.identifier, { action, el: btn, ox: t.clientX, oy: t.clientY });
        btn.classList.add('down');
        this.input.virtualPress(action);
      } else if (this.joyId === null && this.lx(t.clientX) < window.innerWidth * 0.5) {
        this.joyId = t.identifier;
        this.joyOrigin = { x: t.clientX, y: t.clientY };
        this.base.classList.remove('idle');
        this.base.style.left = `${this.lx(t.clientX)}px`;
        this.base.style.top = `${t.clientY}px`;
        this.knob.style.transform = 'translate(-50%, -50%)';
        this.input.lastTouchUse = performance.now();
      }
    }
  }

  private move(e: TouchEvent): void {
    e.preventDefault();
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === this.joyId) {
        let dx = t.clientX - this.joyOrigin.x;
        let dy = t.clientY - this.joyOrigin.y;
        const d = Math.hypot(dx, dy);
        if (d > JOY_RADIUS) {
          // Drag the base along so the stick never "runs out".
          const k = (d - JOY_RADIUS) / d;
          this.joyOrigin.x += dx * k;
          this.joyOrigin.y += dy * k;
          this.base.style.left = `${this.lx(this.joyOrigin.x)}px`;
          this.base.style.top = `${this.joyOrigin.y}px`;
          dx = t.clientX - this.joyOrigin.x;
          dy = t.clientY - this.joyOrigin.y;
        }
        this.knob.style.transform = `translate(calc(-50% + ${this.lefty ? -dx : dx}px), calc(-50% + ${dy}px))`;
        this.input.touchMove = { x: dx / JOY_RADIUS, y: dy / JOY_RADIUS };
        this.input.lastTouchUse = performance.now();
        continue;
      }
      const h = this.held.get(t.identifier);
      if (h && AIMABLE.has(h.action)) {
        const dx = t.clientX - h.ox;
        const dy = t.clientY - h.oy;
        const d = Math.hypot(dx, dy);
        this.input.touchAim = d > AIM_DEADZONE ? { x: dx / d, y: dy / d } : { x: 0, y: 0 };
        h.el.classList.toggle('aiming', d > AIM_DEADZONE);
      }
    }
  }

  private end(e: TouchEvent): void {
    e.preventDefault();
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === this.joyId) {
        this.endJoystick();
        continue;
      }
      const h = this.held.get(t.identifier);
      if (!h) continue;
      this.held.delete(t.identifier);
      h.el.classList.remove('down', 'aiming');
      this.input.virtualRelease(h.action);
      if (AIMABLE.has(h.action)) {
        // Keep the aim briefly so a released bow shot still flies where you dragged.
        window.setTimeout(() => {
          if (![...this.held.values()].some((o) => AIMABLE.has(o.action))) this.input.touchAim = { x: 0, y: 0 };
        }, 80);
      }
    }
  }

  private endJoystick(): void {
    this.joyId = null;
    this.input.touchMove = { x: 0, y: 0 };
    this.base.classList.add('idle');
    this.base.style.left = '';
    this.base.style.top = '';
    this.knob.style.transform = 'translate(-50%, -50%)';
  }

  /** Syncs cooldowns, labels and visibility. Cheap: only touches the DOM on change. */
  update(hud: TouchHud): void {
    if (!this.enabled) return;
    const key = JSON.stringify(hud, (_k, v) => (typeof v === 'number' ? Math.round(v * 40) / 40 : v));
    if (key === this.last) return;
    this.last = key;
    this.root.classList.toggle('paused', !hud.active);
    if (!hud.active && this.held.size) this.releaseAll();
    hud.artifacts.forEach((a, i) => {
      const el = this.els.get(`artifact${i + 1}` as Action)!;
      el.classList.toggle('gone', !a);
      if (!a) return;
      (el.firstElementChild as HTMLElement).textContent = a.glyph;
      el.style.setProperty('--c', a.color);
      el.style.setProperty('--cd', `${a.cd}`);
      el.classList.toggle('dim', !a.usable);
    });
    const potion = this.els.get('potion')!;
    potion.classList.toggle('gone', !hud.potion);
    potion.style.setProperty('--cd', `${hud.potionCd}`);
    this.els.get('dash')!.style.setProperty('--cd', `${hud.dashCd}`);
    const cast = this.els.get('cast')!;
    cast.classList.toggle('gone', !hud.cast);
    cast.classList.toggle('dim', hud.castAmmo <= 0);
    this.els.get('jump')!.classList.toggle('gone', !hud.jump);
    this.els.get('guard')!.classList.toggle('gone', !hud.guard);
    const wrath = this.els.get('wrath')!;
    wrath.classList.toggle('gone', hud.wrath === null);
    wrath.style.setProperty('--cd', `${1 - (hud.wrath ?? 0)}`);
    wrath.classList.toggle('ready', hud.wrath !== null && hud.wrath >= 1);
    const interact = this.els.get('interact')!;
    interact.classList.toggle('gone', !hud.interact);
    if (hud.interact) (interact.firstElementChild as HTMLElement).textContent = hud.interact;
  }
}
