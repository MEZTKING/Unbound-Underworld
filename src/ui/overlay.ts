import { audio } from '../engine/audio';
import type { Action, Input } from '../engine/input';

export interface Card {
  title: string;
  subtitle?: string;
  tag?: string;
  tagColor?: string;
  color: string;
  desc: string;
  note?: string;
  icon?: string;
  disabled?: boolean;
}

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

interface Screen {
  el: HTMLElement;
  items: HTMLElement[];
  index: number;
  onBack: (() => void) | null;
  /** Grid columns for left/right vs up/down navigation. */
  cols: number;
  closesOnPause: boolean;
}

/**
 * Minimal modal stack rendered as DOM on top of the canvas. Supports mouse,
 * keyboard (arrows/WASD + Enter/Space, Esc to go back) and gamepad.
 */
export class UI {
  private stack: Screen[] = [];
  private toastEl: HTMLElement;

  constructor(
    private root: HTMLElement,
    private input: Input,
  ) {
    input.onAction = (a) => this.handle(a);
    this.toastEl = document.createElement('div');
    this.toastEl.className = 'toast';
    document.body.appendChild(this.toastEl);
  }

  get open(): boolean {
    return this.stack.length > 0;
  }

  private get top(): Screen | null {
    return this.stack[this.stack.length - 1] ?? null;
  }

  /** Pushes a screen. `build` fills the panel and returns focusable items. */
  push(className: string, html: string, opts: { onBack?: (() => void) | null; cols?: number; closesOnPause?: boolean; focus?: number } = {}): HTMLElement {
    const el = document.createElement('div');
    el.className = `screen ${className}`;
    el.innerHTML = html;
    this.root.appendChild(el);
    for (const s of this.stack) s.el.classList.add('hidden');
    const screen: Screen = {
      el,
      items: [],
      index: 0,
      onBack: opts.onBack ?? null,
      cols: opts.cols ?? 1,
      closesOnPause: opts.closesOnPause ?? false,
    };
    this.stack.push(screen);
    this.root.classList.add('active');
    this.refreshItems(opts.focus ?? 0);
    requestAnimationFrame(() => el.classList.add('shown'));
    return el;
  }

  /** Re-scans the top screen for focusable items (after dynamic changes). */
  refreshItems(focus?: number): void {
    const s = this.top;
    if (!s) return;
    s.items = [...s.el.querySelectorAll<HTMLElement>('[data-nav]')];
    s.items.forEach((it, i) => {
      it.onmouseenter = () => this.setFocus(i, false);
      it.onmousedown = (e) => e.preventDefault();
    });
    this.setFocus(Math.min(focus ?? s.index, Math.max(0, s.items.length - 1)), false);
  }

  pop(): void {
    const s = this.stack.pop();
    if (s) s.el.remove();
    const top = this.top;
    if (top) {
      top.el.classList.remove('hidden');
      this.refreshItems(top.index);
    } else this.root.classList.remove('active');
    // Swallow the key press that closed the menu so the game doesn't react to it.
    this.input.endStep();
  }

  closeAll(): void {
    while (this.stack.length) {
      const s = this.stack.pop()!;
      s.el.remove();
    }
    this.root.classList.remove('active');
    this.input.endStep();
  }

  private setFocus(i: number, sound = true): void {
    const s = this.top;
    if (!s || s.items.length === 0) return;
    const n = s.items.length;
    i = ((i % n) + n) % n;
    if (i !== s.index && sound) audio.play('select');
    s.items.forEach((it) => it.classList.remove('sel'));
    s.index = i;
    s.items[i].classList.add('sel');
    // Only follow focus when navigating by key/pad, so menus open scrolled to the top.
    if (sound) s.items[i].scrollIntoView?.({ block: 'nearest' });
  }

  private handle(a: Action): void {
    const s = this.top;
    if (!s) return;
    switch (a) {
      case 'menuUp':
        this.setFocus(s.index - s.cols);
        break;
      case 'menuDown':
        this.setFocus(s.index + s.cols);
        break;
      case 'menuLeft':
        this.setFocus(s.index - 1);
        break;
      case 'menuRight':
        this.setFocus(s.index + 1);
        break;
      case 'confirm': {
        const it = s.items[s.index];
        if (it && !it.classList.contains('disabled')) it.click();
        else if (it) audio.play('deny');
        break;
      }
      case 'artifact1':
      case 'artifact2':
      case 'artifact3': {
        const idx = Number(a.slice(-1)) - 1;
        const cards = s.items.filter((it) => it.classList.contains('card'));
        const target = cards[idx];
        if (target && !target.classList.contains('disabled')) target.click();
        break;
      }
      case 'back':
        if (s.onBack) {
          audio.play('select');
          s.onBack();
        }
        break;
      case 'pause':
        if (s.closesOnPause && s.onBack) s.onBack();
        break;
      default:
        break;
    }
  }

  /** Hardware/system back: closes the top menu if it allows. True when a menu consumed it. */
  back(): boolean {
    const s = this.top;
    if (!s) return false;
    if (s.onBack) {
      audio.play('select');
      s.onBack();
    }
    return true;
  }

  toast(text: string, ms = 2200): void {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('show');
    window.clearTimeout((this.toastEl as unknown as { _t?: number })._t);
    (this.toastEl as unknown as { _t?: number })._t = window.setTimeout(() => this.toastEl.classList.remove('show'), ms);
  }

  /** Card-picker used for boons, poms, anvils, enchants and artifacts. */
  choice(opts: {
    title: string;
    subtitle?: string;
    color: string;
    cards: Card[];
    onPick: (i: number) => void;
    skip?: { label: string; onSkip: () => void };
    quote?: string;
  }): void {
    const cards = opts.cards
      .map(
        (c, i) => `
      <button class="card${c.disabled ? ' disabled' : ''}" data-nav data-i="${i}" style="--c:${c.color}">
        <div class="card-key">${i + 1}</div>
        ${c.icon ? `<div class="card-icon">${esc(c.icon)}</div>` : ''}
        <div class="card-body">
          <div class="card-head">
            <span class="card-title">${esc(c.title)}</span>
            ${c.tag ? `<span class="card-tag" style="--t:${c.tagColor ?? c.color}">${esc(c.tag)}</span>` : ''}
          </div>
          ${c.subtitle ? `<div class="card-sub">${esc(c.subtitle)}</div>` : ''}
          <div class="card-desc">${esc(c.desc)}</div>
          ${c.note ? `<div class="card-note">${esc(c.note)}</div>` : ''}
        </div>
      </button>`,
      )
      .join('');
    const el = this.push(
      'choice',
      `<div class="panel" style="--c:${opts.color}">
        <h2 class="title" style="color:${opts.color}">${esc(opts.title)}</h2>
        ${opts.subtitle ? `<div class="subtitle">${esc(opts.subtitle)}</div>` : ''}
        ${opts.quote ? `<div class="quote">“${esc(opts.quote)}”</div>` : ''}
        <div class="cards">${cards}</div>
        ${opts.skip ? `<button class="btn ghost" data-nav data-skip>${esc(opts.skip.label)}</button>` : ''}
      </div>`,
      { onBack: opts.skip ? () => this.finish(opts.skip!.onSkip) : null },
    );
    el.querySelectorAll<HTMLElement>('.card').forEach((b) => {
      b.onclick = () => {
        if (b.classList.contains('disabled')) {
          audio.play('deny');
          return;
        }
        audio.play('boon');
        this.finish(() => opts.onPick(Number(b.dataset.i)));
      };
    });
    const skip = el.querySelector<HTMLElement>('[data-skip]');
    if (skip) skip.onclick = () => this.finish(opts.skip!.onSkip);
  }

  private finish(fn: () => void): void {
    this.pop();
    fn();
  }
}
