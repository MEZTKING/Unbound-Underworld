// Local co-op: a second player joins on their own gamepad, picks a hero and
// fights beside you on the same screen.
import { audio } from '../engine/audio';
import { CHARACTERS, characterUnlocked, type CharacterId } from '../game/characters';
import type { Game } from '../game/game';
import { MAX_PARTY, MEMBER_COLORS, type Member } from '../game/party';
import { WEAPON_INFO } from '../game/weapons';
import { esc } from './overlay';

function bind(el: HTMLElement, sel: string, fn: (b: HTMLElement) => void): void {
  el.querySelectorAll<HTMLElement>(sel).forEach((b) => (b.onclick = () => fn(b)));
}

/** The players on this device besides you. */
export function padMembers(g: Game): Member[] {
  return g.members.filter((m) => m.kind === 'pad');
}

/** Local co-op: who is playing on this screen, add a gamepad player, change their hero, or let them leave. */
export function localCoop(g: Game): void {
  const render = () => {
    const pads = padMembers(g);
    const rows = pads
      .map((m) => {
        const hero = CHARACTERS.find((c) => c.id === m.character)!;
        const color = MEMBER_COLORS[m.id % MEMBER_COLORS.length];
        const live = g.input.padIndices().includes(m.pad ?? -1);
        return `<div class="party-row" style="--w:${color}">
          <div class="party-name">${esc(m.name)}<span class="small"> · ${esc(hero.name)} (${esc(WEAPON_INFO[hero.weapon].name)}) · gamepad ${(m.pad ?? 0) + 1}${live ? '' : ' — disconnected'}</span></div>
          <button class="btn" data-nav data-hero="${m.id}">Change hero</button>
          <button class="btn danger" data-nav data-leave="${m.id}">Leave</button>
        </div>`;
      })
      .join('');
    const full = g.members.length >= MAX_PARTY;
    const online = g.net?.role === 'client';
    return `<div class="party-row" style="--w:${MEMBER_COLORS[0]}"><div class="party-name">${esc(g.me.name === 'You' ? 'Player 1' : g.me.name)}<span class="small"> · keyboard &amp; mouse${g.input.padIndices().length ? ' or a gamepad' : ''}</span></div></div>
      ${rows}
      ${
        online
          ? '<p class="small">Local co-op is off while you play in someone else\'s game (the host can add gamepad players).</p>'
          : full
            ? `<p class="small">The party is full (${MAX_PARTY} heroes).</p>`
            : '<button class="btn primary" data-nav data-a="add">Add a player on a gamepad</button>'
      }`;
  };
  const el = g.ui.push(
    'station',
    `<div class="panel"><h2 class="title" style="color:#7fe8ff">Local Co-op</h2>
      <div class="subtitle">Play together on one screen. Each extra player needs their own gamepad; Player 1 keeps the keyboard and mouse.</div>
      <div data-list>${render()}</div>
      <p class="small">Both of you share this save: experience, ash and loot go to it. Foes get tougher and more numerous with each hero. A fallen partner is <b>downed</b>: stand beside them to revive them, and everyone gets back up when the chamber is cleared. The escape ends only when every hero is down.</p>
      <button class="btn" data-nav data-a="back">Back</button></div>`,
    { onBack: () => g.ui.pop() },
  );
  const wire = () => {
    bind(el, '[data-a]', (b) => {
      if (b.dataset.a === 'back') g.ui.pop();
      else if (b.dataset.a === 'add') waitForPad(g, refresh);
    });
    bind(el, '[data-hero]', (b) => {
      const m = g.members.find((x) => x.id === Number(b.dataset.hero));
      if (m) pickHero(g, m, null, refresh);
    });
    bind(el, '[data-leave]', (b) => {
      const m = g.members.find((x) => x.id === Number(b.dataset.leave));
      if (!m) return;
      g.removeMember(m);
      g.ui.toast(`${m.name} left the party`);
      refresh();
    });
  };
  const refresh = () => {
    el.querySelector('[data-list]')!.innerHTML = render();
    g.ui.refreshItems();
    wire();
  };
  wire();
}

/** "Press any button on the gamepad for the new player." */
function waitForPad(g: Game, done: () => void): void {
  const cancel = () => {
    g.input.capturePad = null;
    g.ui.pop();
  };
  g.ui.push(
    'station',
    `<div class="panel"><h2 class="title" style="color:#7fe8ff">New Player</h2>
      <div class="subtitle">Press any button on the gamepad the new player will use.</div>
      <p class="small">If you play on a gamepad yourself, use a different one: the one pressed here becomes theirs.</p>
      <button class="btn" data-nav data-a="cancel">Cancel</button></div>`,
    { onBack: cancel },
  ).querySelector<HTMLElement>('[data-a]')!.onclick = cancel;
  g.input.capturePad = (pad) => {
    g.ui.pop();
    if (g.members.some((m) => m.pad === pad)) {
      g.ui.toast('That gamepad already has a player');
      return;
    }
    const n = g.members.length + 1;
    pickHero(g, null, pad, done, `Player ${n}`);
  };
}

/** Hero choice for a gamepad player (new, or changing hero). */
function pickHero(g: Game, m: Member | null, pad: number | null, done: () => void, name = m?.name ?? 'Player 2'): void {
  const open = CHARACTERS.filter((c) => characterUnlocked(c, g.save, g.level));
  const current = m?.character;
  const el = g.ui.push(
    'station',
    `<div class="panel wide"><h2 class="title" style="color:#7fe8ff">${esc(name)}: choose a hero</h2>
      <div class="subtitle">Any hero this save has unlocked. Two players may pick the same one.</div>
      <div class="cards grid">${open
        .map(
          (c) => `<button class="card hero" data-nav data-c="${c.id}" style="--c:${c.color}">
        <div class="card-body"><div class="card-head"><span class="card-title">${esc(c.name)}</span>${c.id === current ? '<span class="card-tag" style="--t:#7dff8a">Current</span>' : ''}</div>
        <div class="card-sub">${esc(c.title)} · <b>${esc(c.role)}</b></div>
        <div class="hero-kit"><span style="color:${WEAPON_INFO[c.weapon].color}">${esc(WEAPON_INFO[c.weapon].name)}</span></div></div></button>`,
        )
        .join('')}</div>
      <button class="btn" data-nav data-a="back">Back</button></div>`,
    { onBack: () => g.ui.pop(), cols: 2 },
  );
  bind(el, '[data-a]', () => g.ui.pop());
  bind(el, '[data-c]', (b) => {
    const id = b.dataset.c as CharacterId;
    audio.play('boon');
    g.ui.pop();
    if (m) {
      g.setHero(m, id);
    } else if (pad !== null) {
      const added = g.addMember('pad', g.save, id, name, { pad });
      if (added) {
        g.input.claimed.add(pad);
        g.ui.toast(`${name} joined`);
      }
    }
    done();
  });
}
