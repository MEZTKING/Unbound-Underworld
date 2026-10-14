import { audio } from '../engine/audio';
import { ARTIFACT_BY_ID, ARTIFACTS } from '../game/artifacts';
import { BOON_BY_ID, describeBoon, GODS, HAMMER_BY_ID, RARITY_COLOR } from '../game/boons';
import { ENCHANT_BY_ID } from '../game/enchants';
import type { Game, RunSummary } from '../game/game';
import { clearSave, heatScale, nextCost, rank, UPGRADES } from '../game/meta';
import type { WeaponId } from '../game/types';
import { WEAPON_INFO } from '../game/weapons';
import { esc, type Card } from './overlay';

export type CardData = Card;

const CONTROLS = `
  <div class="controls">
    <div><kbd>WASD</kbd> Move</div><div><kbd>Mouse</kbd> Aim</div>
    <div><kbd>LMB</kbd>/<kbd>J</kbd> Attack</div><div><kbd>RMB</kbd>/<kbd>K</kbd> Special</div>
    <div><kbd>Q</kbd> Cast shard</div><div><kbd>Space</kbd> Dash</div>
    <div><kbd>Shift</kbd>/<kbd>C</kbd> Jump</div><div>Attack mid-air: <b>Slam</b></div>
    <div><kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> Artifacts</div><div><kbd>R</kbd> Potion</div>
    <div><kbd>E</kbd> Interact</div><div><kbd>Esc</kbd> Pause · <kbd>M</kbd> Mute</div>
  </div>
  <p class="small">Gamepad: Left stick move · Right stick aim · X attack · Y special · RB cast · A dash · B jump · LB potion · RT/LT/L3 artifacts · Select interact</p>`;

/** True inside the packaged desktop app, where a Quit button makes sense. */
const DESKTOP = typeof navigator !== 'undefined' && navigator.userAgent.includes('Electron');

function fmtTime(t: number): string {
  const s = Math.floor(t);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function bind(el: HTMLElement, sel: string, fn: (b: HTMLElement) => void): void {
  el.querySelectorAll<HTMLElement>(sel).forEach((b) => (b.onclick = () => fn(b)));
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
      <div class="credits">An original action roguelike inspired by Hades &amp; Minecraft Dungeons. Not affiliated with either.</div>
    </div>`,
  );
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
      The <b>gods of Olympus</b> grant <b>Boons</b> that empower your Attack, Special, Cast and Dash.
      Find <b>Enchanting Tomes</b> to imbue your gear, and <b>Artifacts</b> you can trigger on cooldown.</p>
      <p>Slain foes release <b>souls</b> that power soul artifacts. <b>Jump</b> over lava, chasms and shockwaves,
      and attack mid-air to <b>Slam</b> the ground. Your <b>potion</b> recharges over time.</p>
      <p>When you fall, you return to the Hall of Shades. <b>Ash</b> you gathered is kept — spend it at the Altar.</p>
      ${CONTROLS}
      <button class="btn primary" data-nav data-a="ok">Got it</button>
    </div>`,
    { onBack: () => g.ui.pop() },
  );
  bind(el, '[data-a]', () => g.ui.pop());
}

export function settings(g: Game): void {
  const s = g.save.settings;
  const el = g.ui.push(
    'settings',
    `<div class="panel">
      <h2 class="title">Settings</h2>
      <label class="row">Sound volume <input type="range" min="0" max="1" step="0.05" value="${s.volume}" data-k="volume"></label>
      <label class="row">Music volume <input type="range" min="0" max="1" step="0.05" value="${s.music}" data-k="music"></label>
      <label class="row">Screen shake <input type="range" min="0" max="1.5" step="0.1" value="${s.shake}" data-k="shake"></label>
      <button class="btn" data-nav data-a="mute">${s.muted ? 'Unmute' : 'Mute'} sound</button>
      <button class="btn danger" data-nav data-a="reset">Erase save data</button>
      <button class="btn primary" data-nav data-a="back">Back</button>
    </div>`,
    { onBack: () => g.ui.pop() },
  );
  el.querySelectorAll<HTMLInputElement>('input[type=range]').forEach((inp) => {
    inp.oninput = () => {
      const v = Number(inp.value);
      const k = inp.dataset.k as 'volume' | 'music' | 'shake';
      s[k] = v;
      if (k === 'volume') audio.volume = v;
      if (k === 'music') audio.musicVolume = v;
      if (k === 'shake') g.camera.shakeScale = v;
      g.persist();
    };
  });
  bind(el, '[data-a]', (b) => {
    const a = b.dataset.a;
    if (a === 'mute') {
      s.muted = !s.muted;
      audio.muted = s.muted;
      b.textContent = `${s.muted ? 'Unmute' : 'Mute'} sound`;
      g.persist();
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
  const render = () => {
    const ids: WeaponId[] = ['sword', 'spear', 'bow'];
    return ids
      .map((id) => {
        const info = WEAPON_INFO[id];
        const owned = g.save.weapons.includes(id);
        const sel = g.save.weapon === id;
        const note = sel ? 'Equipped' : owned ? 'Equip' : `Unlock: ${info.cost} ◆`;
        return `<button class="card${!owned && g.save.ash < info.cost ? ' disabled' : ''}" data-nav data-w="${id}" style="--c:${info.color}">
          <div class="card-body"><div class="card-head"><span class="card-title">${esc(info.name)}</span><span class="card-tag" style="--t:${sel ? '#7dff8a' : info.color}">${esc(note)}</span></div>
          <div class="card-desc">${esc(info.blurb)}</div></div></button>`;
      })
      .join('');
  };
  const el = g.ui.push('station', `<div class="panel wide"><h2 class="title">Armory</h2><div class="subtitle">Choose the weapon you'll carry out.</div><div class="cards" data-list>${render()}</div><button class="btn" data-nav data-a="back">Back</button></div>`, {
    onBack: () => g.ui.pop(),
  });
  const wire = () => {
    bind(el, '[data-w]', (b) => {
      const id = b.dataset.w as WeaponId;
      if (!g.save.weapons.includes(id)) {
        const cost = WEAPON_INFO[id].cost;
        if (g.save.ash < cost) {
          audio.play('deny');
          return;
        }
        g.save.ash -= cost;
        g.save.weapons.push(id);
        audio.play('boon');
      } else audio.play('select');
      g.selectWeapon(id);
      el.querySelector('[data-list]')!.innerHTML = render();
      g.ui.refreshItems();
      wire();
    });
    bind(el, '[data-a]', () => g.ui.pop());
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
