import { audio } from '../engine/audio';
import { ARTIFACT_BY_ID, ARTIFACTS } from '../game/artifacts';
import { BOON_BY_ID, describeBoon, GODS, HAMMER_BY_ID, RARITY_COLOR, type OwnedBoon } from '../game/boons';
import { BIOMES } from '../game/rooms';
import { ACHIEVEMENTS, BESTIARY, foeRegions, type FoeEntry } from '../game/codex';
import { ENCHANT_BY_ID } from '../game/enchants';
import type { Game, RunSummary } from '../game/game';
import { CHARACTERS, characterUnlocked, type CharacterId, type GuardStyle, type Palette } from '../game/characters';
import { clearSave, currentSlot, eraseSlot, heatScale, loadSave, peekSlot, setSlot, slotHasRun, SLOTS, writeSave } from '../game/meta';
import { FORGE, levelFromXp, UNLOCKS } from '../game/progression';
import { HERO_MAX_LEVEL, HERO_TREES, heroLevelFromXp, heroPoints, spentSkill } from '../game/herotree';
import { ascension } from './progress';
export { altar as mirror, ascension } from './progress';
import type { AbilitySlot } from '../game/types';
import { WEAPON_INFO } from '../game/weapons';
import { CAN_EXIT, exitGame, getWindowMode, HAS_WINDOW_MODES, setWindowMode, type WindowMode } from '../platform';
import { APP_VERSION, applyUpdate, check, updatesSupported, watchUpdates, type UpdateState } from '../updates';
import { BINDABLE, keyLabel, type Action } from '../engine/input';
import { devMenu } from './dev';
import { gearScreen, starsHtml } from './gear';
import { GEAR_RARITY, GEAR_SLOTS, MATERIAL_IDS, MATERIALS, SLOT_GLYPH, SLOT_NAME } from '../game/gear';
import { mapScreen } from './map';
import { leaveOnline, multiplayer } from './multiplayer';
import { esc, type Card } from './overlay';

export type CardData = Card;

const WINDOW_LABEL: Record<WindowMode, string> = { windowed: 'Windowed', borderless: 'Borderless', fullscreen: 'Fullscreen' };

/** Control reference listing only what you've unlocked. */
function keyControls(g: Game): string {
  const st = g.stats;
  const k = (a: Action) => g.input.keysFor(a).map((c) => `<kbd>${esc(keyLabel(c))}</kbd>`).join('/');
  const rows = [
    '<div><kbd>WASD</kbd> Move</div><div><kbd>Mouse</kbd> Aim</div>',
    '<div><kbd>LMB</kbd>/<kbd>J</kbd> Attack</div><div><kbd>RMB</kbd>/<kbd>K</kbd> Special</div>',
    `<div>${k('dash')} Dash</div><div>${st.canCast ? '<kbd>Q</kbd> Cast shard' : '<kbd>E</kbd> Interact'}</div>`,
    st.canGuard ? `<div>${k('guard')} Guard (hold) · tap to <b>Parry</b></div><div>Parry, then attack: <b>Riposte</b></div>` : '',
    st.canJump ? `<div>${k('jump')} Jump</div><div>Attack mid-air: <b>Slam</b></div>` : '',
    st.canPotion || st.artifactSlots ? `<div>${st.artifactSlots ? `<kbd>1</kbd>${st.artifactSlots > 1 ? '<kbd>2</kbd>' : ''}${st.artifactSlots > 2 ? '<kbd>3</kbd>' : ''} Artifacts` : ''}</div><div>${st.canPotion ? `${k('potion')} Potion` : ''}</div>` : '',
    st.canWrath ? `<div>${k('wrath')} Wrath (when full)</div><div></div>` : '',
    `<div>${st.canCast ? '<kbd>E</kbd> Interact' : ''}</div><div><kbd>Esc</kbd> Pause · <kbd>M</kbd> Mute</div>`,
  ];
  return `<div class="controls">${rows.join('')}</div>
  <p class="small">Gamepad: Left stick move · Right stick aim · X attack · Y special · A dash${st.canCast ? ' · RB cast' : ''}${st.canJump ? ' · B jump' : ''}${st.canGuard ? ' · LT guard' : ''}${st.canPotion ? ' · LB potion' : ''}${st.artifactSlots ? ' · RT/D-pad left/L3 artifacts' : ''}${st.canWrath ? ' · R3 wrath' : ''} · Select interact</p>`;
}

function touchControls(g: Game): string {
  const st = g.stats;
  return `<div class="controls">
    <div><b>Left side</b>: drag to move</div><div><b>⚔</b> Attack (hold to repeat or charge)</div>
    <div><b>✦</b> Special${st.canCast ? ' · <b>◆</b> Cast' : ''}</div><div><b>»</b> Dash${st.canJump ? ' · <b>⤒</b> Jump' : ''}</div>
    <div>Drag an attack button to aim</div><div>Otherwise you aim at the nearest foe</div>
    ${st.canJump ? '<div>Jump, then ⚔ mid-air: <b>Slam</b></div>' : '<div></div>'}<div>${st.canPotion ? '<b>⚗</b> Potion' : ''}${st.artifactSlots ? ' · artifact buttons above' : ''}${st.canWrath ? ' · <b>☄</b> Wrath' : ''}</div>
  </div>
  <p class="small">A controller or keyboard also works if you connect one.</p>`;
}


function fmtTime(t: number): string {
  const s = Math.floor(t);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function bind(el: HTMLElement, sel: string, fn: (b: HTMLElement) => void): void {
  el.querySelectorAll<HTMLElement>(sel).forEach((b) => (b.onclick = () => fn(b)));
}

/**
 * Keeps `box` showing the update status and its one-button action. On the
 * title screen it only appears once an update is found; in Settings it always
 * holds exactly one button, so menu focus never jumps as the status changes.
 */
function updateBox(g: Game, screen: HTMLElement, box: HTMLElement, inSettings: boolean): void {
  const action = (s: UpdateState & { kind: 'available' }): string =>
    s.action === 'install' ? 'Update now' : s.action === 'reload' ? 'Restart to update' : 'Download update';
  watchUpdates((s) => {
    if (!box.isConnected) return false;
    let note = '';
    let button = '';
    if (s.kind === 'available') {
      note = s.hint ? esc(s.hint) : s.version ? `Version ${esc(s.version)} is out!` : 'A new version is ready.';
      button = `<button class="btn primary" data-nav data-update="apply">${action(s)}</button>`;
    } else if (s.kind === 'downloading') {
      note = s.android ? `Downloading version ${esc(s.version)}… Android will ask you to install it.` : `Downloading version ${esc(s.version)}… The game restarts when it's done.`;
      button = `<button class="btn disabled" data-nav>Downloading ${Math.floor(s.percent)}%</button>`;
    } else if (s.kind === 'opened') {
      note = `Open the downloaded file to install version ${esc(s.version)}.`;
      if (inSettings) button = '<button class="btn" data-nav data-update="check">Check for updates</button>';
    } else if (inSettings) {
      if (s.kind === 'current') note = 'You have the latest version.';
      if (s.kind === 'error') note = esc(s.message);
      button =
        s.kind === 'checking'
          ? '<button class="btn disabled" data-nav>Checking…</button>'
          : '<button class="btn" data-nav data-update="check">Check for updates</button>';
    }
    box.innerHTML = note || button ? `${note ? `<div class="update-note">${note}</div>` : ''}${button}` : '';
    bind(box, '[data-update]', (b) => {
      audio.play('select');
      if (b.dataset.update === 'apply') void applyUpdate();
      else void check();
    });
    box.querySelectorAll<HTMLElement>('.disabled').forEach((b) => (b.onclick = () => audio.play('deny')));
    if (!screen.classList.contains('hidden')) g.ui.refreshItems();
    return true;
  });
}

// ---------------------------------------------------------------- title

/** "The Ember Fields · Chamber 3" for a saved escape. */
function savedRunLabel(g: Game): string | null {
  const snap = g.savedRun();
  if (!snap) return null;
  const biome = BIOMES[snap.biomeIndex]?.name ?? 'the Underworld';
  const k = snap.current.kind;
  const where = k === 'boss' ? 'Guardian' : k === 'antechamber' ? 'Antechamber' : k === 'shop' ? 'Wares' : k === 'fountain' ? 'Fountain' : `Chamber ${snap.cleared ? snap.depth : snap.depth + 1}`;
  return `${biome} · ${where}${snap.cleared ? ' · won' : ''}`;
}

/**
 * The title emblem (original art): a broken shackle ringed with laurels,
 * a flame burning at its heart and the chain snapping apart beneath.
 */
function emblem(): string {
  const leaves = (side: 1 | -1) =>
    Array.from({ length: 7 }, (_, i) => {
      const a = ((100 + i * 19) * Math.PI) / 180;
      const x = Math.cos(a) * 47 * side;
      const y = Math.sin(a) * 47 - 4;
      const rot = ((a * 180) / Math.PI) * side + (side > 0 ? 90 : -90) - 35 * side;
      return `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="3.4" ry="8" transform="rotate(${rot.toFixed(0)} ${x.toFixed(1)} ${y.toFixed(1)})"/>`;
    }).join('');
  return `<svg class="emblem" viewBox="-62 -62 124 124" aria-hidden="true">
    <defs>
      <linearGradient id="emb-gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff1c0"/><stop offset="0.5" stop-color="#e8b24a"/><stop offset="1" stop-color="#7a4a14"/></linearGradient>
      <radialGradient id="emb-fire" cx="0.5" cy="0.85" r="0.85"><stop offset="0" stop-color="#fff6d0"/><stop offset="0.35" stop-color="#ffb040"/><stop offset="0.75" stop-color="#ff3a2a"/><stop offset="1" stop-color="#ff3a2a" stop-opacity="0"/></radialGradient>
      <radialGradient id="emb-glow"><stop offset="0" stop-color="#ff5a3a" stop-opacity="0.55"/><stop offset="1" stop-color="#ff5a3a" stop-opacity="0"/></radialGradient>
    </defs>
    <circle class="emb-glow" r="40" fill="url(#emb-glow)"/>
    <g class="emb-laurel" fill="url(#emb-gold)">${leaves(1)}${leaves(-1)}</g>
    <g class="emb-ring" fill="none" stroke="url(#emb-gold)">
      <path d="M -10 -35.5 A 37 37 0 1 0 10 -35.5" stroke-width="5" stroke-linecap="round"/>
      <circle r="29" stroke-width="1.2" stroke-dasharray="3 5" class="emb-runes"/>
    </g>
    <g class="emb-flame">
      <path d="M0 24 C -17 12 -14 -4 -5 -16 C -5 -6 1 -6 1 -14 C 1 -22 6 -28 4 -34 C 14 -22 19 -6 13 8 C 10 16 6 21 0 24 Z" fill="url(#emb-fire)"/>
      <path d="M0 22 C -7 15 -6 5 -1 -2 C 0 4 3 4 4 0 C 8 8 7 16 0 22 Z" fill="#fff3c8" opacity="0.85"/>
    </g>
    <g class="emb-chain" fill="none" stroke="url(#emb-gold)" stroke-width="3.5">
      <rect class="emb-link-l" x="-27" y="38" width="16" height="10" rx="5"/>
      <rect class="emb-link-r" x="11" y="38" width="16" height="10" rx="5"/>
    </g>
  </svg>`;
}

/** Embers drifting up the title screen. */
function embers(n = 26): string {
  return `<div class="embers" aria-hidden="true">${Array.from({ length: n }, (_, i) => {
    const r = (k: number) => ((Math.sin((i + 1) * 12.9898 * k) * 43758.5453) % 1 + 1) % 1;
    return `<i style="left:${(r(1) * 100).toFixed(1)}%;--s:${(2 + r(2) * 4).toFixed(1)}px;--d:${(7 + r(3) * 9).toFixed(1)}s;--delay:-${(r(4) * 16).toFixed(1)}s;--x:${((r(5) - 0.5) * 160).toFixed(0)}px"></i>`;
  }).join('')}</div>`;
}

const letters = (word: string, from = 0) => [...word].map((ch, i) => `<i style="--i:${from + i}">${ch}</i>`).join('');

export function title(g: Game): void {
  const saved = savedRunLabel(g);
  const el = g.ui.push(
    'title-screen',
    `${embers()}<div class="update-box update-banner" data-box></div>
    <div class="title-wrap">
      <div class="title-head">
        ${emblem()}
        <div class="logo"><span class="logo-word">${letters('UNBOUND')}</span><span>${letters('UNDERWORLD', 7)}</span></div>
        <div class="tagline">Fight your way out of the realm of the dead.</div>
      </div>
      <div class="menu">
        ${saved ? `<button class="btn primary resume" data-nav data-a="resume">Resume Escape<small>${esc(saved)}</small></button>` : ''}
        <button class="btn${saved ? '' : ' primary'}" data-nav data-a="play">${saved ? 'Hall of Shades' : g.save.stats.runs > 0 ? 'Continue' : 'Begin'}</button>
        <button class="btn" data-nav data-a="multi">Multiplayer</button>
        <button class="btn" data-nav data-a="slots">Save Slot ${currentSlot()}</button>
        <button class="btn" data-nav data-a="help">How to Play</button>
        <button class="btn" data-nav data-a="settings">Settings</button>
        ${CAN_EXIT ? '<button class="btn" data-nav data-a="quit">Exit Game</button>' : ''}
      </div>
      <div class="credits">An original action roguelike inspired by Hades &amp; Minecraft Dungeons. Not affiliated with either.</div>
    </div>
    <div class="version">v${APP_VERSION}</div>`,
  );
  updateBox(g, el, el.querySelector<HTMLElement>('[data-box]')!, false);
  bind(el, '[data-a]', (b) => {
    audio.unlock();
    audio.play('select');
    const a = b.dataset.a;
    if (a === 'resume') {
      if (!g.resumeRun()) {
        audio.play('deny');
        g.ui.toast('That saved escape could not be loaded.');
      }
    } else if (a === 'play') {
      g.ui.pop();
      g.mode = 'hub';
      if (!g.save.seenIntro) {
        g.save.seenIntro = true;
        g.persist();
        help(g, true);
      }
      g.world?.showBanner('The Hall of Shades', 'Prepare yourself, then walk through the gate.');
    } else if (a === 'help') help(g);
    else if (a === 'multi') multiplayer(g);
    else if (a === 'slots') saveSlots(g);
    else if (a === 'quit') exitGame();
    else settings(g);
  });
}

/** Rebind keyboard keys. Arrows, Enter and Esc always keep working in menus. */
export function keyBindings(g: Game): void {
  const st = g.save.settings;
  const rows = () =>
    BINDABLE.map(({ action, label }) => {
      const keys = g.input.keysFor(action).map(keyLabel).join(' / ') || '—';
      return `<button class="btn toggle" data-nav data-bind="${action}"><span>${esc(label)}</span><b>${esc(keys)}</b></button>`;
    }).join('');
  const el = g.ui.push(
    'station',
    `<div class="panel wide"><h2 class="title">Key Bindings</h2>
      <div class="subtitle">Pick an action, then press its new key (Esc cancels). Mouse: left Attack, right Special, middle Cast.</div>
      <div class="keybinds" data-list>${rows()}</div>
      <div class="row-btns"><button class="btn" data-nav data-a="reset">Reset to defaults</button><button class="btn primary" data-nav data-a="back">Done</button></div></div>`,
    { onBack: () => g.ui.pop(), cols: 2 },
  );
  const refresh = () => {
    el.querySelector('[data-list]')!.innerHTML = rows();
    g.ui.refreshItems();
    wire();
  };
  const wire = () => {
    bind(el, '[data-bind]', (b) => {
      const action = b.dataset.bind as Action;
      b.querySelector('b')!.textContent = 'Press a key…';
      audio.play('select');
      g.input.captureKey = (code) => {
        if (code !== 'Escape') {
          // A key does one game action: take it off any other action first.
          for (const other of BINDABLE.map((x) => x.action)) {
            if (other === action) continue;
            const ks = g.input.keysFor(other);
            if (ks.includes(code)) st.keys[other] = ks.filter((k) => k !== code);
          }
          st.keys[action] = [code];
          g.applySettings();
          g.persist();
        }
        refresh();
      };
    });
    bind(el, '[data-a]', (b) => {
      g.input.captureKey = null;
      if (b.dataset.a === 'reset') {
        st.keys = {};
        g.applySettings();
        g.persist();
        refresh();
      } else g.ui.pop();
    });
  };
  wire();
}

/** Four independent save slots. Switching reloads the game into the chosen slot. */
export function saveSlots(g: Game): void {
  const cur = currentSlot();
  const card = (n: number) => {
    const s = n === cur ? g.save : peekSlot(n);
    const fresh = !s || (s.stats.runs === 0 && s.xp === 0);
    const hero = s ? CHARACTERS.find((c) => c.id === s.character) : null;
    const when = s?.lastPlayed ? new Date(s.lastPlayed).toLocaleDateString() : '';
    const body = fresh
      ? '<div class="card-desc">Empty: start a new journey.</div>'
      : `<div class="card-sub">Level ${levelFromXp(s!.xp).level} · ${esc(hero?.name ?? '')}</div>
         <div class="card-desc">${s!.stats.runs} escape attempts · ${s!.stats.escapes} escapes · ${s!.ash} Ash${slotHasRun(n) ? ' · an escape in progress' : ''}</div>
         ${when ? `<div class="card-note">Last played ${esc(when)}</div>` : ''}`;
    return `<button class="card slot" data-nav data-slot="${n}" style="--c:${n === cur ? '#7dff8a' : '#ffd890'}">
      <div class="card-body"><div class="card-head"><span class="card-title">Slot ${n}</span><span class="card-tag" style="--t:${n === cur ? '#7dff8a' : '#ffd890'}">${n === cur ? 'In use' : fresh ? 'Empty' : 'Load'}</span></div>${body}</div></button>`;
  };
  const el = g.ui.push(
    'station',
    `<div class="panel wide"><h2 class="title">Save Slots</h2>
      <div class="subtitle">Each slot is a separate journey with its own progress.</div>
      <div class="cards grid">${Array.from({ length: SLOTS }, (_, i) => card(i + 1)).join('')}</div>
      <div class="row-btns"><button class="btn danger" data-nav data-a="erase">Erase a slot…</button><button class="btn primary" data-nav data-a="back">Back</button></div></div>`,
    { onBack: () => g.ui.pop(), cols: 2 },
  );
  let erasing = false;
  bind(el, '[data-slot]', (b) => {
    const n = Number(b.dataset.slot);
    if (erasing) {
      if (n === cur) {
        audio.play('deny');
        g.ui.toast('Switch to another slot to erase this one.');
        return;
      }
      if (b.dataset.armed) {
        eraseSlot(n);
        g.ui.pop();
        saveSlots(g);
      } else {
        b.dataset.armed = '1';
        b.querySelector('.card-tag')!.textContent = 'Tap again to erase';
      }
      return;
    }
    if (n === cur) {
      g.ui.pop();
      return;
    }
    // Settings follow the device, not the slot.
    g.persist();
    setSlot(n);
    const target = loadSave();
    target.settings = { ...g.save.settings };
    writeSave(target);
    location.reload();
  });
  bind(el, '[data-a]', (b) => {
    if (b.dataset.a === 'erase') {
      erasing = !erasing;
      b.textContent = erasing ? 'Cancel erasing' : 'Erase a slot…';
      g.ui.toast(erasing ? 'Pick the slot to erase.' : 'Erasing cancelled.');
    } else g.ui.pop();
  });
}

export function help(g: Game, intro = false): void {
  const el = g.ui.push(
    'help',
    `<div class="panel wide">
      <h2 class="title">${intro ? 'Escape the Underworld' : 'How to Play'}</h2>
      <p>Clear each chamber of foes, claim its reward, then choose your next door — each shows what lies beyond.
      The <b>gods of Olympus</b> grant <b>Boons</b> that empower your attacks. Any reward can be skipped for a few obols.</p>
      <p><b>Fighting:</b> tap Attack to chain hits; <b>hold</b> Attack after a hit for your weapon's <b>powered attack</b>
      (let go on the flash for a Perfect). Use your Special right out of a chain for a stronger <b>combo special</b>.
      Hits in a row build your <b>combo</b>. Each hero is a class with their own weapon.</p>
      <p>Every foe and chamber earns <b>experience</b>. Levelling up unlocks new skills one at a time — the Potion, Cast,
      Artifacts, Jump, Enchantments and finally your hero's <b>Wrath</b>. Each level also makes every hero sturdier, and the hero you play grows too: their skill points are spent at <b>Ascension</b>.</p>
      <p>When you fall, you return to the Hall of Shades. <b>Ash</b> you gathered is kept: spend it at the Altar of Ashes, or with the Blacksmith.</p>
      ${document.body.classList.contains('touch') ? touchControls(g) : keyControls(g)}
      <button class="btn primary" data-nav data-a="ok">Got it</button>
    </div>`,
    { onBack: () => g.ui.pop() },
  );
  bind(el, '[data-a]', () => g.ui.pop());
}

export function settings(g: Game): void {
  const s = g.save.settings;
  type Toggle = 'muted' | 'assist' | 'aimAssist' | 'damageNumbers' | 'hints' | 'doorInfo' | 'attackPreview' | 'hitstop' | 'showFps' | 'leftHanded' | 'vibration' | 'view3d';
  type Slider = 'volume' | 'music' | 'shake' | 'flashes' | 'touchSize' | 'touchOpacity' | 'uiSize';
  const toggleLabel: Record<Toggle, string> = {
    muted: 'Sound',
    assist: 'Assist mode (take half damage)',
    aimAssist: 'Aim assist',
    damageNumbers: 'Damage numbers',
    hints: 'Control hints',
    doorInfo: 'Show what every door leads to',
    attackPreview: 'Attack range outline',
    hitstop: 'Hit-stop (impact pause)',
    showFps: 'Show FPS',
    leftHanded: 'Left-handed layout',
    vibration: 'Vibration',
    view3d: '3D voxel view (off: classic 2D)',
  };
  const isOn = (k: Toggle) => (k === 'muted' ? !s.muted : s[k]);
  const toggle = (k: Toggle) => `<button class="btn toggle${isOn(k) ? ' on' : ''}" data-nav data-t="${k}"><span>${toggleLabel[k]}</span><b>${isOn(k) ? 'On' : 'Off'}</b></button>`;
  const slider = (k: Slider, label: string, min: number, max: number, step: number) =>
    `<label class="row">${label} <input type="range" min="${min}" max="${max}" step="${step}" value="${s[k]}" data-k="${k}"></label>`;
  const canFullscreen = !!document.documentElement.requestFullscreen;
  const el = g.ui.push(
    'settings',
    `<div class="panel settings-panel">
      <h2 class="title">Settings</h2>
      <h3 class="section">Audio</h3>
      ${slider('volume', 'Sound volume', 0, 1, 0.05)}
      ${slider('music', 'Music volume', 0, 1, 0.05)}
      ${toggle('muted')}
      <h3 class="section">Gameplay</h3>
      ${toggle('assist')}
      ${toggle('aimAssist')}
      ${toggle('damageNumbers')}
      ${toggle('attackPreview')}
      ${toggle('hints')}
      ${document.body.classList.contains('touch') ? toggle('doorInfo') : ''}
      ${document.body.classList.contains('touch') ? '' : '<h3 class="section">Controls</h3><button class="btn toggle" data-nav data-a="keys"><span>Key bindings</span><b>⌨</b></button>'}
      <h3 class="section">Display</h3>
      ${toggle('view3d')}
      ${slider('uiSize', 'UI size', 0.75, 1.5, 0.05)}
      ${slider('shake', 'Screen shake', 0, 1.5, 0.1)}
      ${slider('flashes', 'Flash intensity', 0, 1, 0.1)}
      ${toggle('hitstop')}
      ${toggle('showFps')}
      ${
        HAS_WINDOW_MODES
          ? '<button class="btn toggle" data-nav data-a="window"><span>Window</span><b data-wmode>…</b></button>'
          : canFullscreen
            ? '<button class="btn toggle" data-nav data-a="fullscreen"><span>Fullscreen</span><b>⛶</b></button>'
            : ''
      }
      <h3 class="section">Touch controls</h3>
      ${slider('touchSize', 'Button size', 0.8, 1.3, 0.05)}
      ${slider('touchOpacity', 'Button opacity', 0.4, 1, 0.05)}
      ${toggle('leftHanded')}
      ${toggle('vibration')}
      <h3 class="section">Data</h3>
      <button class="btn danger" data-nav data-a="reset">Erase save data</button>
      ${g.devUnlocked ? '<button class="btn" data-nav data-a="dev">Developer options</button>' : ''}
      <div class="update-box">
        <div class="update-version" data-ver>Version ${APP_VERSION}</div>
        <div data-box></div>
      </div>
      <button class="btn primary" data-nav data-a="back">Back</button>
    </div>`,
    { onBack: () => g.ui.pop() },
  );
  if (updatesSupported) updateBox(g, el, el.querySelector<HTMLElement>('[data-box]')!, true);
  const wm = el.querySelector<HTMLElement>('[data-wmode]');
  if (wm) void getWindowMode().then((m) => (wm.textContent = WINDOW_LABEL[m]));
  // The secret way in to the developer options: tap the version seven times.
  let taps = 0;
  const ver = el.querySelector<HTMLElement>('[data-ver]');
  if (ver)
    ver.onclick = () => {
      if (g.devUnlocked || ++taps < 7) return;
      g.unlockDev();
      audio.play('boon');
      g.ui.toast('Developer options unlocked');
      g.ui.pop();
      settings(g);
    };
  const apply = () => {
    g.applySettings();
    g.recomputeStats();
    g.persist();
  };
  el.querySelectorAll<HTMLInputElement>('input[type=range]').forEach((inp) => {
    const set = () => {
      (s as unknown as Record<Slider, number>)[inp.dataset.k as Slider] = Number(inp.value);
      apply();
    };
    // Resizing the menu while dragging would move the slider away from the pointer.
    if (inp.dataset.k === 'uiSize') inp.onchange = set;
    else inp.oninput = set;
  });
  bind(el, '[data-t]', (b) => {
    const k = b.dataset.t as Toggle;
    if (k === 'muted') s.muted = !s.muted;
    else (s as unknown as Record<Toggle, boolean>)[k] = !s[k as Exclude<Toggle, 'muted'>];
    b.classList.toggle('on', isOn(k));
    b.querySelector('b')!.textContent = isOn(k) ? 'On' : 'Off';
    audio.play('select');
    apply();
  });
  bind(el, '[data-a]', (b) => {
    const a = b.dataset.a;
    if (a === 'dev') devMenu(g);
    else if (a === 'keys') keyBindings(g);
    else if (a === 'window') {
      // Windowed → Borderless → Fullscreen. Borderless reopens the window, so save first.
      const order: WindowMode[] = ['windowed', 'borderless', 'fullscreen'];
      void getWindowMode().then((m) => {
        const next = order[(order.indexOf(m) + 1) % order.length];
        g.persist();
        b.querySelector('b')!.textContent = WINDOW_LABEL[next];
        void setWindowMode(next);
      });
    } else if (a === 'fullscreen') {
      if (document.fullscreenElement) void document.exitFullscreen?.();
      else void document.documentElement.requestFullscreen?.().catch(() => {});
    } else if (a === 'reset') {
      if (b.dataset.armed) {
        clearSave();
        location.reload();
      } else {
        b.dataset.armed = '1';
        b.textContent = 'Click again to confirm';
      }
    } else g.ui.pop();
  });
}

// ---------------------------------------------------------------- pause

const SLOT_LABEL: Record<AbilitySlot, string> = { attack: 'Attack', special: 'Special', cast: 'Cast', dash: 'Dash' };

/** One boon as a card: name in its god's colour, rarity and level, what it does. */
function boonCard(b: OwnedBoon, opts: { slot?: string } = {}): string {
  const def = BOON_BY_ID[b.id];
  const col = def.slot === 'duo' ? RARITY_COLOR.duo : GODS[def.god].color;
  const gods = def.duoOf ? def.duoOf.map((id) => GODS[id].glyph).join(' ') : GODS[def.god].glyph;
  return `<div class="bcard" style="--c:${col}">
    ${opts.slot ? `<span class="bslot">${opts.slot}</span>` : ''}
    <div class="bhead"><i class="bglyph">${gods}</i><b>${esc(def.name)}</b><span class="tag" style="--t:${RARITY_COLOR[b.rarity]}">${b.rarity}${b.level > 1 ? ` · Lv ${b.level}` : ''}</span></div>
    <div class="bdesc">${esc(describeBoon(b))}</div></div>`;
}

/**
 * Everything collected this run, organised: the four ability slots, passive
 * boons grouped by god, duo boons, then anvil upgrades, enchantments and
 * artifacts.
 */
function buildList(g: Game): string {
  const run = g.run;
  if (!run) return '<p class="small">You are in the Hall of Shades. Walk through the northern gate to begin an escape.</p>';
  const boons = run.boons.filter((b) => BOON_BY_ID[b.id]);
  const slots = (Object.keys(SLOT_LABEL) as AbilitySlot[])
    .filter((slot) => slot !== 'cast' || g.stats.canCast || boons.some((b) => BOON_BY_ID[b.id].slot === 'cast'))
    .map((slot) => {
      const b = boons.find((x) => BOON_BY_ID[x.id].slot === slot);
      return b ? boonCard(b, { slot: SLOT_LABEL[slot] }) : `<div class="bcard empty"><span class="bslot">${SLOT_LABEL[slot]}</span><div class="bdesc">No boon yet</div></div>`;
    })
    .join('');
  const passives = boons.filter((b) => BOON_BY_ID[b.id].slot === 'passive');
  const byGod = [...new Set(passives.map((b) => BOON_BY_ID[b.id].god))]
    .map((god) => {
      const mine = passives.filter((b) => BOON_BY_ID[b.id].god === god);
      const gd = GODS[god];
      return `<div class="bgod" style="--c:${gd.color}"><h4><i>${gd.glyph}</i> ${esc(gd.name)} <small>${mine.length}</small></h4><div class="bgrid">${mine.map((b) => boonCard(b)).join('')}</div></div>`;
    })
    .join('');
  const duos = boons.filter((b) => BOON_BY_ID[b.id].slot === 'duo');
  const chip = (color: string, title: string, desc: string) => `<div class="bchip" style="--c:${color}"><b>${title}</b><div>${esc(desc)}</div></div>`;
  const hammers = run.hammers.map((h) => chip('#d8d8e8', `⚒ ${esc(HAMMER_BY_ID[h].name)}`, HAMMER_BY_ID[h].desc));
  const enchants = run.enchants.map((e) => {
    const d = ENCHANT_BY_ID[e.id];
    return chip(d.color, `${d.glyph} ${esc(d.name)} ${'I'.repeat(e.tier)}`, d.desc(e.tier));
  });
  const artifacts = run.artifacts
    .filter((a): a is string => !!a)
    .map((a) => {
      const d = ARTIFACT_BY_ID[a];
      return chip(d.color, `${d.glyph} ${esc(d.name)}`, d.desc);
    });
  const section = (title: string, body: string, count?: number) => (body ? `<h3 class="section">${title}${count !== undefined ? ` <small>${count}</small>` : ''}</h3>${body}` : '');
  const gods = new Set(boons.map((b) => BOON_BY_ID[b.id].god)).size;
  const summary = `<p class="small bsum">${boons.length} boon${boons.length === 1 ? '' : 's'} from ${gods} god${gods === 1 ? '' : 's'}${hammers.length ? ` · ${hammers.length} anvil upgrade${hammers.length === 1 ? '' : 's'}` : ''}${enchants.length ? ` · ${enchants.length} enchantment${enchants.length === 1 ? '' : 's'}` : ''}${artifacts.length ? ` · ${artifacts.length} artifact${artifacts.length === 1 ? '' : 's'}` : ''}</p>`;
  return [
    summary,
    section('Abilities', `<div class="bslots">${slots}</div>`),
    section('Blessings', byGod, passives.length),
    section('Duo boons', duos.length ? `<div class="bgrid">${duos.map((b) => boonCard(b)).join('')}</div>` : '', duos.length),
    section('Weapon upgrades', hammers.length ? `<div class="bgrid">${hammers.join('')}</div>` : '', hammers.length),
    section('Enchantments', enchants.length ? `<div class="bgrid">${enchants.join('')}</div>` : '', enchants.length),
    section('Artifacts', artifacts.length ? `<div class="bgrid">${artifacts.join('')}</div>` : '', artifacts.length),
  ].join('');
}

/** Your current build on its own page: from a reward choice ("Back to the choice") or the pause menu. */
export function buildView(g: Game, back = 'Back to the choice'): void {
  const el = g.ui.push(
    'build-view',
    `<div class="panel wide build-panel"><h2 class="title">Your Build</h2>
      <div class="build organised">${buildList(g)}</div>
      <button class="btn primary" data-nav data-a="back">${back}</button></div>`,
    { onBack: () => g.ui.pop() },
  );
  bind(el, '[data-a]', () => g.ui.pop());
}

export function pause(g: Game): void {
  const guest = g.net?.role === 'client';
  // A guest's escape belongs to the host: no saving, quitting or abandoning it here.
  const run = guest ? null : g.run;
  const build = buildList(g);
  const el = g.ui.push(
    'pause',
    `<div class="panel wide">
      <h2 class="title">Paused</h2>
      <div class="pause-grid">
        <div class="menu">
          <button class="btn primary" data-nav data-a="resume">Resume</button>
          <button class="btn" data-nav data-a="help">Controls</button>
          ${g.run ? '<button class="btn" data-nav data-a="build">Your Build</button>' : ''}
          <button class="btn" data-nav data-a="map">Map</button>
          <button class="btn" data-nav data-a="party">Multiplayer</button>
          ${g.has('gear') ? '<button class="btn" data-nav data-a="gear">Gear &amp; Inventory</button>' : ''}
          <button class="btn" data-nav data-a="codex">Bestiary &amp; Achievements</button>
          <button class="btn" data-nav data-a="settings">Settings</button>
          ${g.devUnlocked ? '<button class="btn" data-nav data-a="dev">Developer options</button>' : ''}
          ${g.net ? `<button class="btn" data-nav data-a="leave">${guest ? 'Leave the game' : 'Stop hosting'}</button>` : ''}
          ${run ? '<button class="btn" data-nav data-a="title">Save &amp; Quit to Title</button>' : '<button class="btn" data-nav data-a="title">Title Screen</button>'}
          ${CAN_EXIT ? `<button class="btn" data-nav data-a="exit">${run ? 'Save &amp; Exit Game' : 'Exit Game'}</button>` : ''}
          ${run ? '<button class="btn danger" data-nav data-a="abandon">Abandon escape</button>' : ''}
          ${run ? `<p class="small save-note">${g.members.length > 1 ? 'Party escapes aren\'t saved: quitting ends this one.' : 'Your escape is saved when you enter a chamber, and again once its doors open (with what you earned there).'}</p>` : ''}
        </div>
        <div class="build organised compact">${build}</div>
      </div>
    </div>`,
    { onBack: () => g.ui.pop(), closesOnPause: true },
  );
  bind(el, '[data-a]', (b) => {
    const a = b.dataset.a;
    if (a === 'resume') g.ui.pop();
    else if (a === 'help') help(g);
    else if (a === 'codex') codex(g);
    else if (a === 'gear') gearScreen(g);
    else if (a === 'map') mapScreen(g);
    else if (a === 'party') multiplayer(g);
    else if (a === 'build') buildView(g, 'Back');
    else if (a === 'dev') devMenu(g);
    else if (a === 'settings') settings(g);
    else if (a === 'leave') {
      g.ui.closeAll();
      void leaveOnline(g);
    } else if (a === 'title') {
      void leaveOnline(g);
      g.quitToTitle();
    } else if (a === 'exit') {
      // Ash, experience and the escape (at its last chamber) are already saved;
      // a won chamber is saved as it stands.
      g.persist();
      g.saveClearedRoom();
      void leaveOnline(g).finally(() => exitGame());
    } else if (a === 'abandon') {
      if (b.dataset.armed) {
        g.save.stats.deaths++;
        g.persist();
        g.abandonRun();
      } else {
        b.dataset.armed = '1';
        b.textContent = 'Confirm: return to the Hall';
      }
    }
  });
}

// ---------------------------------------------------------------- run end

const EPITAPHS = [
  'Death is not the end. It is a door back to the Hall.',
  'The Underworld always takes its due… for now.',
  'Your blood stains the stones. They will remember you.',
  'Again. And again. Until the gate gives way.',
];

/** The loot an escape gathered: materials as chips, gear names in their tier colour. */
function spoilsHtml(sp: RunSummary['spoils']): string {
  const mats = MATERIAL_IDS.filter((k) => sp.materials[k]).map((k) => `<span class="mat" style="--c:${MATERIALS[k].color}"><b>${MATERIALS[k].glyph}</b>${sp.materials[k]}<small>${esc(MATERIALS[k].name)}</small></span>`);
  const gear = sp.gear.map((it) => `<span class="spoil-gear" style="color:${GEAR_RARITY[it.rarity].color}">${esc(it.name)}</span>`);
  if (!mats.length && !gear.length) return '';
  return `<h3 class="section">Spoils</h3><div class="mats">${mats.join('')}</div>${gear.length ? `<div class="spoils-gear">${gear.join('')}</div><p class="small">Equip new gear in the Hall of Heroes or from the pause menu.</p>` : ''}`;
}

/** The end-of-escape button: online guests wait for the host to take everyone back. */
function hubButton(g: Game): string {
  return g.net?.role === 'client'
    ? '<p class="small">The host takes everyone back to the Hall.</p><button class="btn primary" data-nav data-a="hub">Close</button>'
    : '<button class="btn primary" data-nav data-a="hub">Return to the Hall</button>';
}

function backToHall(g: Game): void {
  g.ui.pop();
  if (g.net?.role === 'client') return;
  g.transition(() => g.enterHub());
}

export function death(g: Game, s: RunSummary): void {
  const el = g.ui.push(
    'over',
    `<div class="panel">
      <h2 class="title blood">You Died</h2>
      <div class="subtitle">${esc(EPITAPHS[Math.floor(Math.random() * EPITAPHS.length)])}</div>
      <div class="stats">
        <div><span>Fell in</span><b>${esc(s.biome)}</b></div>
        <div><span>Chambers cleared</span><b>${s.rooms}</b></div>
        <div><span>Foes slain</span><b>${s.kills}</b></div>
        <div><span>Time</span><b>${fmtTime(s.time)}</b></div>
        <div><span>Ash gathered</span><b>${s.ash} ◆</b></div>
      </div>
      ${spoilsHtml(s.spoils)}
      ${hubButton(g)}
    </div>`,
  );
  bind(el, '[data-a]', () => backToHall(g));
}

export function victory(g: Game, s: RunSummary): void {
  const el = g.ui.push(
    'over',
    `<div class="panel">
      <h2 class="title gold">Escaped!</h2>
      <div class="subtitle">The Warden falls. Beyond the gate, the surface waits… for a little while.</div>
      <div class="stats">
        <div><span>Chambers cleared</span><b>${s.rooms}</b></div>
        <div><span>Foes slain</span><b>${s.kills}</b></div>
        <div><span>Time</span><b>${fmtTime(s.time)}</b></div>
        <div><span>Ash gathered</span><b>${s.ash} ◆</b></div>
        <div><span>Escapes</span><b>${g.save.stats.escapes}</b></div>
      </div>
      ${spoilsHtml(s.spoils)}
      <p class="small">A new Torment level is unlocked at the Oath of Torment.</p>
      ${hubButton(g)}
    </div>`,
  );
  bind(el, '[data-a]', () => backToHall(g));
}

// ---------------------------------------------------------------- hub stations

// ---------------------------------------------------------------- heroes

const GUARD_LABEL: Record<GuardStyle, string> = {
  parry: 'Guard: blade parry',
  shield: 'Guard: tower shield (Attack while guarding to bash)',
  evade: 'Guard: evasive sidestep',
  catch: 'Guard: catch and counter',
  mist: 'Guard: mist form (blocked hits become Echoes)',
};

/** Choosing which hero to play (from the Hall of Heroes). */
function heroPicker(g: Game, after: () => void): void {
  const render = () =>
    CHARACTERS.map((c) => {
      const open = characterUnlocked(c, g.save, g.level);
      const sel = g.save.character === c.id;
      const tag = sel ? 'Selected' : open ? 'Choose' : `Locked: ${c.unlock?.text ?? ''}`;
      return `<button class="card hero${open ? '' : ' disabled'}" data-nav data-c="${c.id}" style="--c:${c.color}">
        <div class="card-body"><div class="card-head"><span class="card-title">${esc(c.name)}</span><span class="card-tag" style="--t:${sel ? '#7dff8a' : c.color}">${esc(tag)}</span></div>
        <div class="card-sub">${esc(c.title)} · <b>${esc(c.role)}</b></div>
        <div class="card-desc">${esc(c.blurb)}</div>
        <div class="hero-kit"><span style="color:${WEAPON_INFO[c.weapon].color}">${esc(WEAPON_INFO[c.weapon].name)}</span> · ${esc(GUARD_LABEL[c.guard])}</div>
        <ul class="perks">${c.perks.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>
        <div class="card-note">Wrath — ${esc(c.wrath.name)}: ${esc(c.wrath.desc)}${g.stats.canWrath ? '' : ' (unlocks at level 10)'}</div></div></button>`;
    }).join('');
  const el = g.ui.push(
    'station',
    `<div class="panel wide"><h2 class="title" style="color:#ff8a6e">Hall of Heroes</h2>
      <div class="subtitle">Each hero is a class: their own weapon, guard style, strengths and Wrath ultimate. More classes open as you rank up.</div>
      <div class="cards grid" data-list>${render()}</div>
      <button class="btn" data-nav data-a="back">Back</button></div>`,
    {
      onBack: () => {
        g.ui.pop();
        after();
      },
      cols: 2,
    },
  );
  const wire = () => {
    bind(el, '[data-c]', (b) => {
      const id = b.dataset.c as CharacterId;
      const def = CHARACTERS.find((c) => c.id === id)!;
      if (!characterUnlocked(def, g.save, g.level)) {
        audio.play('deny');
        return;
      }
      audio.play('boon');
      g.selectCharacter(id);
      g.ui.pop();
      after();
    });
    bind(el, '[data-a]', () => {
      g.ui.pop();
      after();
    });
  };
  wire();
}

/**
 * The Hall of Heroes: the hero you play, all in one place. Their class and
 * Wrath, their weapon (forged at the Blacksmith), the armour they wear and
 * their skill tree, with buttons to switch hero, change gear and customise.
 */
export function heroes(g: Game): void {
  const render = () => {
    const def = g.me.player.hero;
    const info = WEAPON_INFO[def.weapon];
    const tier = g.save.forge[def.weapon] ?? 1;
    const forge = FORGE.find((f) => f.tier === tier)!;
    const lv = heroLevelFromXp(g.save.heroXp[def.id] ?? 0);
    const ranks = g.save.skills[def.id] ?? {};
    const free = heroPoints(lv.level) - spentSkill(ranks);
    const taken = HERO_TREES[def.id].nodes.filter((n) => (ranks[n.id] ?? 0) > 0);
    const worn = GEAR_SLOTS.map((slot) => {
      const item = g.save.gear.items.find((i) => i.uid === g.save.gear.equipped[slot]);
      return item
        ? `<li class="tier-${item.rarity}" style="--c:${GEAR_RARITY[item.rarity].color}"><b>${SLOT_GLYPH[slot]}</b> ${esc(item.name)} ${starsHtml(item.level)}</li>`
        : `<li class="empty"><b>${SLOT_GLYPH[slot]}</b> ${SLOT_NAME[slot]}: empty</li>`;
    }).join('');
    const pct = lv.need ? Math.round((lv.into / lv.need) * 100) : 100;
    return `<div class="hero-sheet" style="--c:${def.color}">
      <div class="hero-head"><div><h3>${esc(def.name)}</h3><small>${esc(def.title)} · <b>${esc(def.role)}</b></small></div>
        <div class="hero-level">Hero level ${lv.level}${lv.level >= HERO_MAX_LEVEL ? ' (max)' : ''}<span class="bar"><i style="width:${pct}%"></i></span></div></div>
      <div class="mp-grid">
        <section><h3>Class</h3><p class="small">${esc(def.blurb)}</p><ul class="perks">${def.perks.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>
          <p class="small">${esc(GUARD_LABEL[def.guard])}</p><p class="small"><b>Wrath: ${esc(def.wrath.name)}</b>: ${esc(def.wrath.desc)}${g.stats.canWrath ? '' : ' (unlocks at level 10)'}</p></section>
        <section><h3 style="color:${info.color}">${esc(info.name)} <span class="tierpip">${'★'.repeat(tier)}</span></h3><p class="small">${esc(info.blurb)}</p>
          <p class="small"><b>${esc(forge.name)}</b>: ${esc(forge.desc)}. Forge it stronger at the Blacksmith.</p></section>
        <section><h3>Armour</h3>${g.has('gear') ? `<ul class="worn">${worn}</ul><button class="btn" data-nav data-a="gear">Change gear</button>` : `<p class="small">Gear unlocks at level ${UNLOCKS.find((u) => u.feature === 'gear')?.level}.</p>`}</section>
        <section><h3>Skills</h3>${taken.length ? `<ul class="worn">${taken.map((n) => `<li><b>${n.glyph}</b> ${esc(n.name)} <small>${ranks[n.id]}/${n.max}</small></li>`).join('')}</ul>` : '<p class="small">No skills yet.</p>'}
          <p class="small">${free > 0 ? `<b>${free}</b> point${free === 1 ? '' : 's'} to spend.` : 'Play this hero to earn more skill points.'}</p><button class="btn" data-nav data-a="skills">Skill tree</button></section>
      </div></div>`;
  };
  const el = g.ui.push(
    'station',
    `<div class="panel wide"><h2 class="title" style="color:#ff8a6e">Hall of Heroes</h2>
      <div data-list>${render()}</div>
      <div class="row-btns"><button class="btn primary" data-nav data-a="switch">Switch hero</button><button class="btn" data-nav data-a="look">Customise appearance</button><button class="btn" data-nav data-a="back">Back</button></div></div>`,
    { onBack: () => g.ui.pop() },
  );
  const refresh = () => {
    el.querySelector('[data-list]')!.innerHTML = render();
    g.ui.refreshItems();
    wire();
  };
  const wire = () => {
    bind(el, '[data-a]', (b) => {
      const a = b.dataset.a;
      if (a === 'switch') heroPicker(g, refresh);
      else if (a === 'look') customise(g);
      else if (a === 'gear') gearScreen(g);
      else if (a === 'skills') ascension(g);
      else g.ui.pop();
    });
  };
  wire();
}

const SWATCHES = ['#2b1830', '#10283a', '#1d2a1e', '#2a2016', '#140c1e', '#1a1830', '#3a0e14', '#e8e0d0', '#c2263a', '#ff7a2a', '#ffd04a', '#9dff9a', '#5ac8ff', '#c86bff', '#ff6ad0', '#1a0d14', '#d8d8f0', '#6a3a1a', '#8a8a9a', '#f0f0ff'];
const CROWNS: { id: Palette['crown']; name: string }[] = [
  { id: 'flame', name: 'Flame' },
  { id: 'hood', name: 'Hood' },
  { id: 'helm', name: 'Helm' },
  { id: 'circlet', name: 'Circlet' },
  { id: 'horns', name: 'Horns' },
  { id: 'halo', name: 'Halo' },
];

/** Colours and headwear for the selected hero (saved per hero). */
export function customise(g: Game): void {
  const hero = g.player.hero;
  const look = () => (g.save.looks[hero.id] ??= {});
  const pal = () => g.player.palette;
  const row = (key: 'cloak' | 'trim' | 'hair', label: string) =>
    `<div class="look-row"><span>${label}</span><div class="swatches">${SWATCHES.map(
      (c) => `<button class="swatch${pal()[key] === c ? ' on' : ''}" data-nav data-k="${key}" data-v="${c}" style="--s:${c}" aria-label="${c}"></button>`,
    ).join('')}</div></div>`;
  const render = () => `
    ${row('cloak', 'Cloak')}${row('trim', 'Trim')}${row('hair', 'Hair')}
    <div class="look-row"><span>Headwear</span><div class="swatches">${CROWNS.map(
      (c) => `<button class="btn mini${pal().crown === c.id ? ' on' : ''}" data-nav data-crown="${c.id}">${c.name}</button>`,
    ).join('')}</div></div>`;
  const el = g.ui.push(
    'station',
    `<div class="panel wide" style="--c:${hero.color}"><h2 class="title" style="color:${hero.color}">${esc(hero.name)}'s Appearance</h2>
      <canvas class="look-preview${g.view3d ? ' voxel' : ''}" width="160" height="200" title="${g.view3d ? 'Drag to turn' : ''}"></canvas>
      <div data-body>${render()}</div>
      <div class="row-btns"><button class="btn" data-nav data-a="reset">Reset to default</button><button class="btn primary" data-nav data-a="back">Done</button></div></div>`,
    { onBack: () => g.ui.pop(), cols: 10 },
  );
  const canvas = el.querySelector('canvas')!;
  // In the 3D view the preview is the voxel hero from the game camera's angle;
  // in the 2D view, the 2D art.
  const voxel = g.view3d;
  if (voxel) {
    const cam = g.camera;
    void import('../render3d/voxel').then(({ HeroPreview }) => new HeroPreview(canvas, g.player, cam.yaw, Math.asin(Math.min(1, cam.yScale))));
  }
  const refresh = () => {
    el.querySelector('[data-body]')!.innerHTML = render();
    g.ui.refreshItems();
    wire();
    if (!voxel) drawPreview(g, canvas);
  };
  const wire = () => {
    bind(el, '[data-k]', (b) => {
      look()[b.dataset.k as 'cloak' | 'trim' | 'hair'] = b.dataset.v!;
      g.persist();
      audio.play('select');
      refresh();
    });
    bind(el, '[data-crown]', (b) => {
      look().crown = b.dataset.crown as Palette['crown'];
      g.persist();
      audio.play('select');
      refresh();
    });
    bind(el, '[data-a]', (b) => {
      if (b.dataset.a === 'reset') {
        delete g.save.looks[hero.id];
        g.persist();
        refresh();
      } else g.ui.pop();
    });
  };
  wire();
  if (!voxel) drawPreview(g, canvas);
}

/** The hero as drawn by the 2D art, for the appearance screen. */
function drawPreview(g: Game, c: HTMLCanvasElement): void {
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, c.width, c.height);
  const p = g.player;
  const saved = { x: p.x, y: p.y, z: p.z, facing: p.facing, iframes: p.iframes, flash: p.flash, state: p.state };
  try {
    p.x = 0;
    p.y = 0;
    p.z = 0;
    p.facing = 0.6;
    p.iframes = 0;
    p.flash = 0;
    ctx.save();
    ctx.translate(80, 190);
    ctx.scale(2.2, 2.2);
    const stub = { time: 0, stats: { forgeTier: 1, canWrath: false, holyShield: false }, player: p, camera: { lift: { x: 0, y: -1 } } };
    p.draw(ctx, stub as unknown as Parameters<typeof p.draw>[1]);
    ctx.restore();
  } catch {
    ctx.restore();
  } finally {
    Object.assign(p, saved);
  }
}

export function artifactLoadout(g: Game): void {
  const render = () =>
    ARTIFACTS.map((a) => {
      const owned = g.save.artifacts.includes(a.id);
      const sel = g.save.startArtifact === a.id;
      const label = sel ? 'Equipped' : owned ? 'Equip' : `Unlock: ${a.unlock} ◆`;
      const can = owned || g.save.ash >= a.unlock;
      return `<button class="card small${can ? '' : ' disabled'}" data-nav data-id="${a.id}" style="--c:${a.color}">
        <div class="card-icon">${a.glyph}</div>
        <div class="card-body"><div class="card-head"><span class="card-title">${esc(a.name)}</span><span class="card-tag" style="--t:${sel ? '#7dff8a' : a.color}">${esc(label)}</span></div>
        <div class="card-desc">${esc(a.desc)} ${a.souls ? `(${a.souls} Echoes)` : `(${a.cooldown}s)`}</div></div></button>`;
    }).join('');
  const el = g.ui.push(
    'station',
    `<div class="panel wide"><h2 class="title" style="color:#7fe8ff">Artifact Shelf</h2>
      <div class="subtitle">Choose an artifact to start each escape with. More can be found in the Underworld. Ash: <b data-ash>${g.save.ash}</b> ◆</div>
      <div class="cards grid" data-list>${render()}</div>
      <button class="btn" data-nav data-a="back">Back</button></div>`,
    { onBack: () => g.ui.pop(), cols: 2 },
  );
  const wire = () => {
    bind(el, '[data-id]', (b) => {
      const id = b.dataset.id!;
      const def = ARTIFACT_BY_ID[id];
      if (!g.save.artifacts.includes(id)) {
        if (g.save.ash < def.unlock) {
          audio.play('deny');
          return;
        }
        g.save.ash -= def.unlock;
        g.save.artifacts.push(id);
        audio.play('boon');
      } else audio.play('select');
      g.save.startArtifact = id;
      g.persist();
      g.artifacts[0] = id;
      el.querySelector('[data-list]')!.innerHTML = render();
      el.querySelector('[data-ash]')!.textContent = `${g.save.ash}`;
      g.ui.refreshItems();
      wire();
    });
    bind(el, '[data-a]', () => g.ui.pop());
  };
  wire();
}

export function chronicle(g: Game): void {
  codex(g, 'records');
}

type CodexTab = 'records' | 'bestiary' | 'achievements';

/** Records, the bestiary (foes stay blacked out until slain) and achievements. */
export function codex(g: Game, tab: CodexTab = 'bestiary'): void {
  const st = g.save.stats;
  const records = `<div class="stats">
        <div><span>Escape attempts</span><b>${st.runs}</b></div>
        <div><span>Escapes</span><b>${st.escapes}</b></div>
        <div><span>Deaths</span><b>${st.deaths}</b></div>
        <div><span>Guardians slain</span><b>${st.bossesSlain}</b></div>
        <div><span>Foes slain</span><b>${st.kills}</b></div>
        <div><span>Most chambers in one run</span><b>${st.bestDepth}</b></div>
        <div><span>Fastest escape</span><b>${st.bestTime ? fmtTime(st.bestTime) : '—'}</b></div>
        <div><span>Ash gathered (all time)</span><b>${st.totalAsh} ◆</b></div>
        <div><span>Wares bought from Charon</span><b>${st.shopBuys}</b></div>
      </div>`;
  const known = BESTIARY.filter((e) => (g.save.bestiary[e.name] ?? 0) > 0).length;
  const bestiary = `<div class="subtitle">${known} of ${BESTIARY.length} recorded. Slay a foe to fill in its page.</div>
      <div class="bestiary">${BESTIARY.map((e) => {
        const kills = g.save.bestiary[e.name] ?? 0;
        const img = portrait(e, kills > 0);
        if (!kills) return `<div class="beast locked"><img src="${img}" alt=""><div><b>???</b><small>${e.guardian ? 'An unknown guardian' : 'An unknown foe'}</small></div></div>`;
        const f = e.make();
        return `<div class="beast${e.guardian ? ' boss' : ''}"><img src="${img}" alt=""><div>
          <b>${esc(e.name)}</b><small>${esc(foeRegions(e))} · ${Math.round(f.maxHp)} health${f.maxArmor ? ` + ${Math.round(f.maxArmor)} armor` : ''} · slain ${kills}</small>
          <p>${esc(e.behaviour)}</p><p class="counter">${esc(e.counter)}</p></div></div>`;
      }).join('')}</div>`;
  const got = ACHIEVEMENTS.filter((a) => g.save.achievements.includes(a.id)).length;
  const achievements = `<div class="subtitle">${got} of ${ACHIEVEMENTS.length} earned.${g.godMode ? ' <b class="blood">God mode is on: achievements are disabled.</b>' : ''}</div>
      <div class="achievements">${ACHIEVEMENTS.map((a) => {
        const on = g.save.achievements.includes(a.id);
        return `<div class="ach${on ? ' on' : ''}"><span class="glyph">${on ? a.glyph : '?'}</span><div><b>${esc(a.name)}</b><small>${esc(a.desc)}</small></div></div>`;
      }).join('')}</div>`;
  const body = { records, bestiary, achievements }[tab];
  const tabBtn = (t: CodexTab, label: string) => `<button class="btn tab${t === tab ? ' on' : ''}" data-nav data-tab="${t}">${label}</button>`;
  const el = g.ui.push(
    'station',
    `<div class="panel wide codex"><h2 class="title">Chronicle</h2>
      <div class="tabs">${tabBtn('records', 'Records')}${tabBtn('bestiary', 'Bestiary')}${tabBtn('achievements', 'Achievements')}</div>
      <div class="codex-body">${body}</div>
      <button class="btn primary" data-nav data-a="back">Close</button></div>`,
    { onBack: () => g.ui.pop() },
  );
  bind(el, '[data-a]', () => g.ui.pop());
  bind(el, '[data-tab]', (b) => {
    audio.play('select');
    g.ui.pop();
    codex(g, b.dataset.tab as CodexTab);
  });
}

const portraits = new Map<string, string>();

/** A small picture of a foe (drawn with the 2D art); a black silhouette until slain. */
function portrait(e: FoeEntry, known: boolean): string {
  const key = `${e.name}:${known}`;
  const hit = portraits.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  try {
    const f = e.make();
    f.spawnT = 0;
    f.facing = 0.4;
    const k = Math.min(1, 96 / (f.height + 30), 50 / f.r);
    ctx.translate(64, 112);
    ctx.scale(k, k);
    f.x = 0;
    f.y = 0;
    if (!known) ctx.filter = 'brightness(0) drop-shadow(0 0 6px rgba(160,120,255,0.45))';
    const stub = { time: 0, player: { x: 60, y: 200 }, camera: { lift: { x: 0, y: -1 } }, stats: {}, enemies: [] };
    f.draw(ctx, stub as unknown as Parameters<typeof f.draw>[1]);
  } catch {
    ctx.fillStyle = known ? '#c8a8ff' : '#000';
    ctx.font = '700 64px Georgia';
    ctx.textAlign = 'center';
    ctx.fillText('☠', 64, 88);
  }
  const url = c.toDataURL();
  portraits.set(key, url);
  return url;
}

export function pact(g: Game): void {
  const max = Math.max(1, g.save.maxHeat);
  const render = () =>
    Array.from({ length: max + 1 }, (_, h) => {
      const sc = heatScale(h);
      return `<button class="upg${g.save.heat === h ? ' on' : ''}" data-nav data-h="${h}">
        <span class="glyph">${h === 0 ? '○' : '☠'}</span>
        <span class="uname">Torment ${h}<small>Foes +${Math.round((sc.hp - 1) * 100)}% health, +${Math.round((sc.dmg - 1) * 100)}% damage · Ash ×${sc.ash.toFixed(2)}</small></span>
        <span class="cost">${g.save.heat === h ? 'Active' : ''}</span></button>`;
    }).join('');
  const el = g.ui.push(
    'station',
    `<div class="panel wide"><h2 class="title blood">Oath of Torment</h2><div class="subtitle">Swear to a harsher Underworld for greater rewards. Each escape unlocks the next level.</div>
      <div class="upgrades" data-list>${render()}</div><button class="btn" data-nav data-a="back">Back</button></div>`,
    { onBack: () => g.ui.pop() },
  );
  const wire = () => {
    bind(el, '[data-h]', (b) => {
      g.save.heat = Number(b.dataset.h);
      g.persist();
      audio.play('select');
      el.querySelector('[data-list]')!.innerHTML = render();
      g.ui.refreshItems();
      wire();
    });
    bind(el, '[data-a]', () => g.ui.pop());
  };
  wire();
}

/** Asks which equipped artifact to swap out for a new one. */
export function replaceArtifact(g: Game, id: string, after: () => void): void {
  const run = g.run;
  const def = ARTIFACT_BY_ID[id];
  // Only the slots you have unlocked (and that hold an artifact) can be swapped.
  const slots = run ? run.artifacts.map((a, i) => ({ a, i })).filter((x) => x.i < g.stats.artifactSlots && x.a && ARTIFACT_BY_ID[x.a]) : [];
  if (!run || !def || !slots.length) {
    after();
    return;
  }
  g.ui.choice({
    title: 'Artifacts full',
    subtitle: `Replace which artifact with ${def.name}?`,
    color: def.color,
    cards: slots.map(({ a, i }) => {
      const d = ARTIFACT_BY_ID[a!];
      return { title: `Slot ${i + 1}: ${d.name}`, color: d.color, desc: d.desc, icon: d.glyph };
    }),
    onPick: (k) => {
      const i = slots[k].i;
      run.artifacts[i] = id;
      g.player.artifactCd[i] = 0;
      after();
    },
    skip: { label: `Keep current artifacts`, onSkip: after },
  });
}
