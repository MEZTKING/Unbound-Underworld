import { audio } from '../engine/audio';
import { ARTIFACT_BY_ID, ARTIFACTS } from '../game/artifacts';
import { BOON_BY_ID, describeBoon, GODS, HAMMER_BY_ID, RARITY_COLOR } from '../game/boons';
import { ENCHANT_BY_ID } from '../game/enchants';
import type { Game, RunSummary } from '../game/game';
import { CHARACTERS, characterUnlocked, type CharacterId } from '../game/characters';
import { clearSave, heatScale, nextCost, rank, UPGRADES, WEAPON_IDS } from '../game/meta';
import { canRaiseTalent, levelFromXp, nextForge, spentPoints, TALENTS, talentPoints, tierFor, TIERS, WEAPON_LEVEL } from '../game/progression';
import type { WeaponId } from '../game/types';
import { WEAPON_INFO } from '../game/weapons';
import { APP_VERSION, applyUpdate, check, updatesSupported, watchUpdates, type UpdateState } from '../updates';
import { esc, type Card } from './overlay';

export type CardData = Card;

/** Control reference listing only what you've unlocked. */
function keyControls(g: Game): string {
  const st = g.stats;
  const rows = [
    '<div><kbd>WASD</kbd> Move</div><div><kbd>Mouse</kbd> Aim</div>',
    '<div><kbd>LMB</kbd>/<kbd>J</kbd> Attack</div><div><kbd>RMB</kbd>/<kbd>K</kbd> Special</div>',
    `<div><kbd>Space</kbd> Dash</div><div>${st.canCast ? '<kbd>Q</kbd> Cast shard' : '<kbd>E</kbd> Interact'}</div>`,
    st.canJump ? '<div><kbd>Shift</kbd>/<kbd>C</kbd> Jump</div><div>Attack mid-air: <b>Slam</b></div>' : '',
    st.canPotion || st.artifactSlots ? `<div>${st.artifactSlots ? `<kbd>1</kbd>${st.artifactSlots > 1 ? '<kbd>2</kbd>' : ''}${st.artifactSlots > 2 ? '<kbd>3</kbd>' : ''} Artifacts` : ''}</div><div>${st.canPotion ? '<kbd>R</kbd> Potion' : ''}</div>` : '',
    st.canWrath ? '<div><kbd>F</kbd> Wrath (when full)</div><div></div>' : '',
    `<div>${st.canCast ? '<kbd>E</kbd> Interact' : ''}</div><div><kbd>Esc</kbd> Pause · <kbd>M</kbd> Mute</div>`,
  ];
  return `<div class="controls">${rows.join('')}</div>
  <p class="small">Gamepad: Left stick move · Right stick aim · X attack · Y special · A dash${st.canCast ? ' · RB cast' : ''}${st.canJump ? ' · B jump' : ''}${st.canPotion ? ' · LB potion' : ''}${st.artifactSlots ? ' · RT/LT/L3 artifacts' : ''}${st.canWrath ? ' · R3 wrath' : ''} · Select interact</p>`;
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

/** True inside the packaged desktop app, where a Quit button makes sense. */
const DESKTOP = typeof navigator !== 'undefined' && navigator.userAgent.includes('Electron');

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
      note = s.version ? `Version ${esc(s.version)} is out!` : 'A new version is ready.';
      button = `<button class="btn primary" data-nav data-update="apply">${action(s)}</button>`;
    } else if (s.kind === 'downloading') {
      note = `Downloading version ${esc(s.version)}… The game restarts when it's done.`;
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

export function title(g: Game): void {
  const el = g.ui.push(
    'title-screen',
    `<div class="title-wrap">
      <div class="logo">UNBOUND<span>UNDERWORLD</span></div>
      <div class="tagline">Fight your way out of the realm of the dead.</div>
      <div class="menu">
        <button class="btn primary" data-nav data-a="play">${g.save.stats.runs > 0 ? 'Continue' : 'Begin'}</button>
        <button class="btn" data-nav data-a="help">How to Play</button>
        <button class="btn" data-nav data-a="settings">Settings</button>
        ${DESKTOP ? '<button class="btn" data-nav data-a="quit">Quit</button>' : ''}
      </div>
      <div class="update-box" data-box></div>
      <div class="credits">An original action roguelike inspired by Hades &amp; Minecraft Dungeons. Not affiliated with either.</div>
    </div>
    <div class="version">v${APP_VERSION}</div>`,
  );
  updateBox(g, el, el.querySelector<HTMLElement>('[data-box]')!, false);
  bind(el, '[data-a]', (b) => {
    audio.unlock();
    audio.play('select');
    const a = b.dataset.a;
    if (a === 'play') {
      g.ui.pop();
      g.mode = 'hub';
      if (!g.save.seenIntro) {
        g.save.seenIntro = true;
        g.persist();
        help(g, true);
      }
      g.world?.showBanner('The Hall of Shades', 'Prepare yourself, then walk through the gate.');
    } else if (a === 'help') help(g);
    else if (a === 'quit') window.close();
    else settings(g);
  });
}

export function help(g: Game, intro = false): void {
  const el = g.ui.push(
    'help',
    `<div class="panel wide">
      <h2 class="title">${intro ? 'Escape the Underworld' : 'How to Play'}</h2>
      <p>Clear each chamber of foes, claim its reward, then choose your next door — each shows what lies beyond.
      The <b>gods of Olympus</b> grant <b>Boons</b> that empower your attacks.</p>
      <p>Every foe and chamber earns <b>experience</b>. Levelling up unlocks new skills one at a time — the Potion, Cast,
      Jump, Artifacts, Enchantments and finally your hero's <b>Wrath</b> — and gives a talent point to spend at <b>Ascension</b>.</p>
      <p>When you fall, you return to the Hall of Shades. <b>Ash</b> you gathered is kept — spend it at the Altar or the Armory.</p>
      ${document.body.classList.contains('touch') ? touchControls(g) : keyControls(g)}
      <button class="btn primary" data-nav data-a="ok">Got it</button>
    </div>`,
    { onBack: () => g.ui.pop() },
  );
  bind(el, '[data-a]', () => g.ui.pop());
}

export function settings(g: Game): void {
  const s = g.save.settings;
  type Toggle = 'muted' | 'assist' | 'aimAssist' | 'damageNumbers' | 'hints' | 'hitstop' | 'showFps' | 'leftHanded' | 'vibration';
  type Slider = 'volume' | 'music' | 'shake' | 'flashes' | 'touchSize' | 'touchOpacity';
  const toggleLabel: Record<Toggle, string> = {
    muted: 'Sound',
    assist: 'Assist mode (take half damage)',
    aimAssist: 'Aim assist',
    damageNumbers: 'Damage numbers',
    hints: 'Control hints',
    hitstop: 'Hit-stop (impact pause)',
    showFps: 'Show FPS',
    leftHanded: 'Left-handed layout',
    vibration: 'Vibration',
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
      ${toggle('hints')}
      <h3 class="section">Display</h3>
      ${slider('shake', 'Screen shake', 0, 1.5, 0.1)}
      ${slider('flashes', 'Flash intensity', 0, 1, 0.1)}
      ${toggle('hitstop')}
      ${toggle('showFps')}
      ${canFullscreen ? '<button class="btn toggle" data-nav data-a="fullscreen"><span>Fullscreen</span><b>⛶</b></button>' : ''}
      <h3 class="section">Touch controls</h3>
      ${slider('touchSize', 'Button size', 0.8, 1.3, 0.05)}
      ${slider('touchOpacity', 'Button opacity', 0.4, 1, 0.05)}
      ${toggle('leftHanded')}
      ${toggle('vibration')}
      <h3 class="section">Data</h3>
      <button class="btn danger" data-nav data-a="reset">Erase save data</button>
      <div class="update-box">
        <div class="update-version">Version ${APP_VERSION}</div>
        <div data-box></div>
      </div>
      <button class="btn primary" data-nav data-a="back">Back</button>
    </div>`,
    { onBack: () => g.ui.pop() },
  );
  if (updatesSupported) updateBox(g, el, el.querySelector<HTMLElement>('[data-box]')!, true);
  const apply = () => {
    g.applySettings();
    g.recomputeStats();
    g.persist();
  };
  el.querySelectorAll<HTMLInputElement>('input[type=range]').forEach((inp) => {
    inp.oninput = () => {
      (s as unknown as Record<Slider, number>)[inp.dataset.k as Slider] = Number(inp.value);
      apply();
    };
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
    if (a === 'fullscreen') {
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

export function pause(g: Game): void {
  const run = g.run;
  const build = run
    ? [
        ...run.boons.map((b) => {
          const def = BOON_BY_ID[b.id];
          const col = def.slot === 'duo' ? RARITY_COLOR.duo : GODS[def.god].color;
          return `<div class="bitem" style="--c:${col}"><b>${esc(def.name)}</b> <span class="tag" style="--t:${RARITY_COLOR[b.rarity]}">${b.rarity}${b.level > 1 ? ` · Lv ${b.level}` : ''}</span><div>${esc(describeBoon(b))}</div></div>`;
        }),
        ...run.hammers.map((h) => `<div class="bitem" style="--c:#d8d8e8"><b>⚒ ${esc(HAMMER_BY_ID[h].name)}</b><div>${esc(HAMMER_BY_ID[h].desc)}</div></div>`),
        ...run.enchants.map((e) => {
          const d = ENCHANT_BY_ID[e.id];
          return `<div class="bitem" style="--c:${d.color}"><b>${d.glyph} ${esc(d.name)} ${'I'.repeat(e.tier)}</b><div>${esc(d.desc(e.tier))}</div></div>`;
        }),
        ...run.artifacts
          .filter((a): a is string => !!a)
          .map((a) => {
            const d = ARTIFACT_BY_ID[a];
            return `<div class="bitem" style="--c:${d.color}"><b>${d.glyph} ${esc(d.name)}</b><div>${esc(d.desc)}</div></div>`;
          }),
      ].join('') || '<p class="small">No boons yet. Clear chambers to earn them.</p>'
    : '<p class="small">You are in the Hall of Shades. Walk through the northern gate to begin an escape.</p>';
  const el = g.ui.push(
    'pause',
    `<div class="panel wide">
      <h2 class="title">Paused</h2>
      <div class="pause-grid">
        <div class="menu">
          <button class="btn primary" data-nav data-a="resume">Resume</button>
          <button class="btn" data-nav data-a="help">Controls</button>
          <button class="btn" data-nav data-a="settings">Settings</button>
          ${run ? '<button class="btn danger" data-nav data-a="abandon">Abandon escape</button>' : ''}
          ${DESKTOP ? '<button class="btn" data-nav data-a="quit">Quit to desktop</button>' : ''}
        </div>
        <div class="build">${build}</div>
      </div>
    </div>`,
    { onBack: () => g.ui.pop(), closesOnPause: true },
  );
  bind(el, '[data-a]', (b) => {
    const a = b.dataset.a;
    if (a === 'resume') g.ui.pop();
    else if (a === 'help') help(g);
    else if (a === 'settings') settings(g);
    else if (a === 'quit') {
      // Ash and upgrades are already saved; only an escape in progress is lost.
      if (!run || b.dataset.armed) window.close();
      else {
        b.dataset.armed = '1';
        b.textContent = 'Confirm: this escape will be lost';
      }
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
      <button class="btn primary" data-nav data-a="hub">Return to the Hall</button>
    </div>`,
  );
  bind(el, '[data-a]', () => {
    g.ui.pop();
    g.transition(() => g.enterHub());
  });
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
      <p class="small">A new Torment level is unlocked at the Oath of Torment.</p>
      <button class="btn primary" data-nav data-a="hub">Return to the Hall</button>
    </div>`,
  );
  bind(el, '[data-a]', () => {
    g.ui.pop();
    g.transition(() => g.enterHub());
  });
}

// ---------------------------------------------------------------- hub stations

export function weapons(g: Game): void {
  const render = () =>
    WEAPON_IDS.map((id) => {
      const info = WEAPON_INFO[id];
      const owned = g.save.weapons.includes(id);
      const sel = g.save.weapon === id;
      const needLv = WEAPON_LEVEL[id];
      const levelOk = g.level >= needLv;
      const tier = g.save.forge[id] ?? 1;
      const note = sel ? 'Equipped' : owned ? 'Equip' : !levelOk ? `Requires Lv ${needLv}` : `Unlock: ${info.cost} ◆`;
      const can = owned || (levelOk && g.save.ash >= info.cost);
      const next = owned ? nextForge(tier) : null;
      const forgeOk = next && g.level >= next.level && g.save.ash >= next.cost;
      const forge = owned
        ? next
          ? `<button class="btn forge${forgeOk ? '' : ' disabled'}" data-nav data-f="${id}">Forge ${esc(next.name)} — ${next.cost} ◆${g.level < next.level ? ` · Lv ${next.level}` : ''}<small>${esc(next.desc)}</small></button>`
          : '<div class="forge-max">Mythic — fully forged</div>'
        : '';
      return `<div class="weapon-row"><button class="card${can ? '' : ' disabled'}" data-nav data-w="${id}" style="--c:${info.color}">
          <div class="card-body"><div class="card-head"><span class="card-title">${esc(info.name)}${owned ? ` <span class="tierpip">${'★'.repeat(tier)}</span>` : ''}</span><span class="card-tag" style="--t:${sel ? '#7dff8a' : info.color}">${esc(note)}</span></div>
          <div class="card-desc">${esc(info.blurb)}</div></div></button>${forge}</div>`;
    }).join('');
  const el = g.ui.push(
    'station',
    `<div class="panel wide"><h2 class="title">Armory</h2><div class="subtitle">Choose your weapon, and forge it stronger with Ash. Ash: <b data-ash>${g.save.ash}</b> ◆</div><div class="cards" data-list>${render()}</div><button class="btn" data-nav data-a="back">Back</button></div>`,
    { onBack: () => g.ui.pop() },
  );
  const refresh = () => {
    el.querySelector('[data-list]')!.innerHTML = render();
    el.querySelector('[data-ash]')!.textContent = `${g.save.ash}`;
    g.ui.refreshItems();
    wire();
  };
  const wire = () => {
    bind(el, '[data-w]', (b) => {
      const id = b.dataset.w as WeaponId;
      if (!g.save.weapons.includes(id)) {
        const cost = WEAPON_INFO[id].cost;
        if (g.save.ash < cost || g.level < WEAPON_LEVEL[id]) {
          audio.play('deny');
          return;
        }
        g.save.ash -= cost;
        g.save.weapons.push(id);
        audio.play('boon');
      } else audio.play('select');
      g.selectWeapon(id);
      refresh();
    });
    bind(el, '[data-f]', (b) => {
      const id = b.dataset.f as WeaponId;
      const next = nextForge(g.save.forge[id] ?? 1);
      if (!next || g.level < next.level || g.save.ash < next.cost) {
        audio.play('deny');
        return;
      }
      g.save.ash -= next.cost;
      g.save.forge[id] = next.tier;
      g.persist();
      g.recomputeStats();
      audio.play('boon');
      g.ui.toast(`${WEAPON_INFO[id].name} forged to ${next.name}!`);
      refresh();
    });
    bind(el, '[data-a]', () => g.ui.pop());
  };
  wire();
}

// ---------------------------------------------------------------- heroes & talents

export function heroes(g: Game): void {
  const render = () =>
    CHARACTERS.map((c) => {
      const open = characterUnlocked(c, g.save, g.level);
      const sel = g.save.character === c.id;
      const tag = sel ? 'Selected' : open ? 'Choose' : `Locked: ${c.unlock?.text ?? ''}`;
      return `<button class="card hero${open ? '' : ' disabled'}" data-nav data-c="${c.id}" style="--c:${c.color}">
        <div class="card-body"><div class="card-head"><span class="card-title">${esc(c.name)}</span><span class="card-tag" style="--t:${sel ? '#7dff8a' : c.color}">${esc(tag)}</span></div>
        <div class="card-sub">${esc(c.title)}</div>
        <div class="card-desc">${esc(c.blurb)}</div>
        <ul class="perks">${c.perks.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>
        <div class="card-note">Wrath — ${esc(c.wrath.name)}: ${esc(c.wrath.desc)}${g.stats.canWrath ? '' : ' (unlocks at level 10)'}</div></div></button>`;
    }).join('');
  const el = g.ui.push(
    'station',
    `<div class="panel wide"><h2 class="title" style="color:#ff8a6e">Hall of Heroes</h2>
      <div class="subtitle">Each hero has their own strengths and Wrath ultimate.</div>
      <div class="cards grid" data-list>${render()}</div>
      <button class="btn" data-nav data-a="back">Back</button></div>`,
    { onBack: () => g.ui.pop(), cols: 2 },
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
      el.querySelector('[data-list]')!.innerHTML = render();
      g.ui.refreshItems();
      wire();
    });
    bind(el, '[data-a]', () => g.ui.pop());
  };
  wire();
}

export function talents(g: Game): void {
  const render = () => {
    const level = g.level;
    const free = talentPoints(level) - spentPoints(g.save.talents);
    const prog = levelFromXp(g.save.xp);
    const head = `<div class="subtitle">Level <b>${level}</b> · <span style="color:${tierFor(level).color}">${tierFor(level).name}</span> · ${prog.need ? `${prog.into}/${prog.need} XP to next level` : 'Max level'} · <b>${free}</b> point${free === 1 ? '' : 's'} to spend</div>`;
    const rows = TIERS.map((tier, ti) => {
      const open = level >= tier.level;
      const items = TALENTS.filter((t) => t.tier === ti)
        .map((t) => {
          const r = g.save.talents[t.id] ?? 0;
          const can = canRaiseTalent(level, g.save.talents, t.id);
          const pips = Array.from({ length: t.max }, (_, i) => `<i class="${i < r ? 'on' : ''}"></i>`).join('');
          return `<button class="upg${can ? '' : ' disabled'}" data-nav data-tal="${t.id}">
            <span class="glyph" style="color:${tier.color}">${t.glyph}</span>
            <span class="uname">${esc(t.name)}<small>${esc(t.desc(Math.max(1, r)))}</small></span>
            <span class="pips">${pips}</span>
            <span class="cost">${r >= t.max ? 'MAX' : open ? '+1' : `Lv ${tier.level}`}</span></button>`;
        })
        .join('');
      return `<h3 class="section" style="color:${open ? tier.color : '#6a5a68'}">${tier.name} <small>${open ? '' : `· unlocks at level ${tier.level}`}</small></h3><div class="upgrades">${items}</div>`;
    }).join('');
    return head + rows;
  };
  const el = g.ui.push(
    'station',
    `<div class="panel wide"><h2 class="title" style="color:#ffe68a">Ascension</h2>
      <div data-list>${render()}</div>
      <div class="row-btns"><button class="btn ghost" data-nav data-a="reset">Reset talents (free)</button><button class="btn" data-nav data-a="back">Back</button></div></div>`,
    { onBack: () => g.ui.pop() },
  );
  const refresh = () => {
    el.querySelector('[data-list]')!.innerHTML = render();
    g.recomputeStats(true);
    g.refreshHubPrompts();
    g.persist();
    g.ui.refreshItems();
    wire();
  };
  const wire = () => {
    bind(el, '[data-tal]', (b) => {
      const id = b.dataset.tal!;
      if (!canRaiseTalent(g.level, g.save.talents, id)) {
        audio.play('deny');
        return;
      }
      g.save.talents[id] = (g.save.talents[id] ?? 0) + 1;
      audio.play('boon');
      refresh();
    });
    bind(el, '[data-a]', (b) => {
      if (b.dataset.a === 'reset') {
        g.save.talents = {};
        audio.play('select');
        refresh();
      } else g.ui.pop();
    });
  };
  wire();
}

export function mirror(g: Game): void {
  const render = () =>
    UPGRADES.map((u) => {
      const r = rank(g.save, u.id);
      const cost = nextCost(g.save, u);
      const pips = u.costs.map((_, i) => `<i class="${i < r ? 'on' : ''}"></i>`).join('');
      const can = cost !== null && g.save.ash >= cost;
      return `<button class="upg${can ? '' : ' disabled'}" data-nav data-u="${u.id}">
        <span class="glyph">${u.glyph}</span>
        <span class="uname">${esc(u.name)}<small>${esc(u.desc(Math.max(1, r)))}</small></span>
        <span class="pips">${pips}</span>
        <span class="cost">${cost === null ? 'MAX' : `${cost} ◆`}</span>
      </button>`;
    }).join('');
  const el = g.ui.push(
    'station',
    `<div class="panel wide"><h2 class="title" style="color:#c8a8ff">Altar of Ashes</h2>
      <div class="subtitle">Ash: <b data-ash>${g.save.ash}</b> ◆ — permanent strength for every escape.</div>
      <div class="upgrades" data-list>${render()}</div>
      <button class="btn" data-nav data-a="back">Back</button></div>`,
    { onBack: () => g.ui.pop() },
  );
  const wire = () => {
    bind(el, '[data-u]', (b) => {
      const def = UPGRADES.find((u) => u.id === b.dataset.u)!;
      const cost = nextCost(g.save, def);
      if (cost === null || g.save.ash < cost) {
        audio.play('deny');
        return;
      }
      g.save.ash -= cost;
      g.save.upgrades[def.id] = rank(g.save, def.id) + 1;
      g.persist();
      g.recomputeStats(true);
      audio.play('boon');
      el.querySelector('[data-list]')!.innerHTML = render();
      el.querySelector('[data-ash]')!.textContent = `${g.save.ash}`;
      g.ui.refreshItems();
      wire();
    });
    bind(el, '[data-a]', () => g.ui.pop());
  };
  wire();
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
        <div class="card-desc">${esc(a.desc)} ${a.souls ? `(${a.souls} souls)` : `(${a.cooldown}s)`}</div></div></button>`;
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
  const st = g.save.stats;
  const el = g.ui.push(
    'station',
    `<div class="panel"><h2 class="title">Chronicle</h2>
      <div class="stats">
        <div><span>Escape attempts</span><b>${st.runs}</b></div>
        <div><span>Escapes</span><b>${st.escapes}</b></div>
        <div><span>Deaths</span><b>${st.deaths}</b></div>
        <div><span>Guardians slain</span><b>${st.bossesSlain}</b></div>
        <div><span>Foes slain</span><b>${st.kills}</b></div>
        <div><span>Most chambers in one run</span><b>${st.bestDepth}</b></div>
        <div><span>Fastest escape</span><b>${st.bestTime ? fmtTime(st.bestTime) : '—'}</b></div>
        <div><span>Ash gathered (all time)</span><b>${st.totalAsh} ◆</b></div>
      </div>
      <button class="btn primary" data-nav data-a="back">Close</button></div>`,
    { onBack: () => g.ui.pop() },
  );
  bind(el, '[data-a]', () => g.ui.pop());
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
  const run = g.run!;
  const def = ARTIFACT_BY_ID[id];
  g.ui.choice({
    title: 'Artifacts full',
    subtitle: `Replace which artifact with ${def.name}?`,
    color: def.color,
    cards: run.artifacts.map((a, i) => {
      const d = ARTIFACT_BY_ID[a!];
      return { title: `Slot ${i + 1}: ${d.name}`, color: d.color, desc: d.desc, icon: d.glyph };
    }),
    onPick: (i) => {
      run.artifacts[i] = id;
      g.player.artifactCd[i] = 0;
      after();
    },
    skip: { label: `Keep current artifacts`, onSkip: after },
  });
}
