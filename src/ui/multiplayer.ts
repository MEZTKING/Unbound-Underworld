// The Multiplayer menu: local co-op, hosting and joining on the same network
// or through an online server, and moving a save between devices.
import { audio } from '../engine/audio';
import type { Game } from '../game/game';
import { currentSlot, writeSave } from '../game/meta';
import { levelFromXp } from '../game/progression';
import { NetClient } from '../net/client';
import { cloudIsNewer, drive, driveSignIn, driveSignOut, loadDriveConf, preloadGis, storeDriveConf, type CloudSave } from '../net/gdrive';
import { NetHost } from '../net/host';
import { lanBridge, type LanGame } from '../net/lan';
import { RelayLink, serverUrl } from '../net/link';
import { downloadSave, exportSave, importSave, loadSync, newSyncKey, storeSync, uploadSave } from '../net/savesync';
import { IS_DESKTOP, IS_NATIVE } from '../platform';
import { esc } from './overlay';
import { localCoop } from './party';

function bind(el: HTMLElement, sel: string, fn: (b: HTMLElement) => void): void {
  el.querySelectorAll<HTMLElement>(sel).forEach((b) => (b.onclick = () => fn(b)));
}

interface NetPrefs {
  name: string;
  server: string;
}

const PREFS = 'uu-net';

function loadPrefs(): NetPrefs {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS) ?? 'null') as Partial<NetPrefs> | null;
    return { name: String(p?.name ?? ''), server: String(p?.server ?? '') };
  } catch {
    return { name: '', server: '' };
  }
}

function storePrefs(p: NetPrefs): void {
  try {
    localStorage.setItem(PREFS, JSON.stringify(p));
  } catch {
    /* not remembered */
  }
}

/** The name shown over your hero to the others. */
function playerName(g: Game, typed: string): string {
  const t = typed.trim().slice(0, 16);
  return t || `${g.player.hero.name} player`;
}

/** Hosting LAN games from this device: stop the relay too when the game ends. */
let lanHosting = false;

async function stopLan(): Promise<void> {
  if (!lanHosting) return;
  lanHosting = false;
  await lanBridge()?.stopHost().catch(() => {});
}

/** Leaves the online game (or stops hosting it). */
export async function leaveOnline(g: Game): Promise<void> {
  g.net?.leave();
  await stopLan();
}

/** From the title screen, starting or joining a game drops you into the Hall first. */
function leaveTitle(g: Game): void {
  if (g.mode === 'title') {
    g.ui.closeAll();
    g.mode = 'hub';
  }
}

export function multiplayer(g: Game): void {
  const prefs = loadPrefs();
  const bridge = lanBridge();
  let found: LanGame[] = [];
  let busy = '';

  const players = (): string => {
    const net = g.net;
    if (!net) return '';
    if (net instanceof NetHost) {
      const list = net.players;
      const rows = list
        .map((p, i) => `<div class="party-row" style="--w:${p.member?.player.tagColor ?? '#c8b8c0'}"><div class="party-name">${esc(p.name)}<span class="small">${p.online ? '' : ' · reconnecting…'}${p.member ? '' : ' · joining…'}</span></div>${p.member ? `<button class="btn danger" data-nav data-kick="${i}">Remove</button>` : ''}</div>`)
        .join('');
      return rows || '<p class="small">No one has joined yet. Share the room code (and the address, for players on your network).</p>';
    }
    return '';
  };

  const render = (): string => {
    const net = g.net;
    const status = net
      ? `<div class="net-status"><b>${esc(net.status())}</b>${players()}<button class="btn danger" data-nav data-a="leave">${net.role === 'host' ? 'Stop hosting' : 'Leave the game'}</button></div>`
      : '';
    const lan = bridge
      ? `<button class="btn" data-nav data-a="lan-host"${net ? ' disabled' : ''}>Host on this network</button>
         <button class="btn" data-nav data-a="lan-find"${net ? ' disabled' : ''}>Find games nearby</button>
         <div data-found>${found
           .map((f, i) => `<button class="btn found" data-nav data-found-i="${i}">${esc(f.name)} <small>${esc(f.address)}:${f.port} · ${f.players} playing${f.code ? ` · ${esc(f.code)}` : ''}</small></button>`)
           .join('')}</div>`
      : '<p class="small">The Windows and Android apps can host games here. In a browser you can still join one: enter its address under Online.</p>';
    return `${status}
      ${busy ? `<p class="net-busy">${esc(busy)}</p>` : ''}
      <div class="mp-grid">
        <section><h3>Same screen</h3><p class="small">A second player on a gamepad.</p><button class="btn" data-nav data-a="local">Local co-op</button></section>
        <section><h3>Same Wi-Fi or hotspot</h3>${lan}</section>
        <section class="mp-online"><h3>Online</h3>
          <label class="field">Server address <input data-f="server" value="${esc(prefs.server)}" placeholder="e.g. 192.168.1.20:7777 or wss://example.com" autocomplete="off" spellcheck="false"></label>
          <label class="field">Room code <input data-f="code" maxlength="5" placeholder="ABCDE" autocomplete="off" spellcheck="false" style="text-transform:uppercase"></label>
          <div class="row-btns"><button class="btn primary" data-nav data-a="join"${net ? ' disabled' : ''}>Join</button><button class="btn" data-nav data-a="host"${net ? ' disabled' : ''}>Host here</button><button class="btn" data-nav data-a="test">Test</button></div>
          <p class="small">Run your own server with <code>node server/index.cjs</code> (see the README). The web version can only reach <code>wss://</code> servers.</p>
        </section>
        <section><h3>You</h3><label class="field">Your name <input data-f="name" maxlength="16" value="${esc(prefs.name)}" placeholder="${esc(playerName(g, ''))}" autocomplete="off"></label>
          <button class="btn" data-nav data-a="sync">Sync saves between devices</button></section>
      </div>`;
  };

  const el = g.ui.push(
    'station',
    `<div class="panel wide multiplayer"><h2 class="title" style="color:#7fe8ff">Multiplayer</h2>
      <div class="subtitle">Up to four heroes. Everyone keeps their own progress: experience, Ash and loot go to each player's own save.</div>
      <div data-body>${render()}</div>
      <button class="btn" data-nav data-a="back">Back</button></div>`,
    { onBack: () => g.ui.pop() },
  );
  const field = (k: string) => el.querySelector<HTMLInputElement>(`[data-f="${k}"]`)?.value ?? '';
  const remember = () => {
    prefs.name = field('name').trim();
    prefs.server = field('server').trim();
    storePrefs(prefs);
  };
  const refresh = () => {
    const body = el.querySelector<HTMLElement>('[data-body]')!;
    const keep = { name: field('name'), server: field('server'), code: field('code') };
    body.innerHTML = render();
    for (const [k, v] of Object.entries(keep)) {
      const input = el.querySelector<HTMLInputElement>(`[data-f="${k}"]`);
      if (input) input.value = v;
    }
    g.ui.refreshItems();
    wire();
  };
  const work = async (label: string, fn: () => Promise<void>) => {
    if (busy) return;
    busy = label;
    refresh();
    try {
      await fn();
    } catch (err) {
      audio.play('deny');
      g.ui.toast(err instanceof Error ? err.message : String(err), 4500);
    } finally {
      busy = '';
      if (el.isConnected) refresh();
    }
  };
  const watchHost = (h: NetHost) => {
    h.onEvent = (text) => {
      g.ui.toast(text, 3000);
      if (el.isConnected) refresh();
    };
  };
  const join = (url: string, code: string) =>
    work('Joining…', async () => {
      remember();
      const c = await NetClient.join(g, url, code, playerName(g, prefs.name));
      const arrived = await Promise.race([c.ready.then(() => true), new Promise<boolean>((r) => setTimeout(() => r(false), 10000))]);
      if (!arrived) {
        c.leave();
        throw new Error('The host did not send their game. Try again.');
      }
      g.ui.closeAll();
      g.ui.toast(`Joined ${c.hostName || 'the game'}`, 3000);
    });

  const wire = () => {
    bind(el, '[data-a]', (b) => {
      const a = b.dataset.a;
      if (a === 'back') {
        remember();
        g.ui.pop();
      } else if (a === 'local') localCoop(g);
      else if (a === 'sync') saveSync(g, field('server'));
      else if (a === 'leave') {
        void leaveOnline(g).then(() => el.isConnected && refresh());
      } else if (a === 'lan-host' && bridge) {
        void work('Starting the game on this network…', async () => {
          remember();
          const name = playerName(g, prefs.name);
          const { port, addresses } = await bridge.host(name);
          lanHosting = true;
          try {
            leaveTitle(g);
            const h = await NetHost.start(g, `ws://127.0.0.1:${port}`, name);
            watchHost(h);
            const where = addresses.length ? addresses.map((x) => `${x}:${port}`).join(' or ') : `port ${port}`;
            g.ui.toast(`Hosting. Players nearby: Multiplayer → Find games nearby (or join ${where}).`, 7000);
          } catch (err) {
            await stopLan();
            throw err;
          }
        });
      } else if (a === 'lan-find' && bridge) {
        void work('Looking for games on this network…', async () => {
          found = await bridge.discover(2600);
          if (!found.length) g.ui.toast('No games found nearby. Is the host on the same Wi-Fi (or your hotspot)?', 4500);
        });
      } else if (a === 'join') {
        const url = serverUrl(field('server'));
        if (!url) {
          g.ui.toast('Enter the server address first.');
          return;
        }
        void join(url, field('code').trim().toUpperCase());
      } else if (a === 'host') {
        const url = serverUrl(field('server'));
        if (!url) {
          g.ui.toast('Enter the server address first.');
          return;
        }
        void work('Opening a game on the server…', async () => {
          remember();
          leaveTitle(g);
          const h = await NetHost.start(g, url, playerName(g, prefs.name));
          watchHost(h);
          g.ui.toast(`Hosting. Your room code is ${h.code}.`, 7000);
        });
      } else if (a === 'test') {
        const url = serverUrl(field('server'));
        if (!url) {
          g.ui.toast('Enter the server address first.');
          return;
        }
        void work('Testing…', async () => {
          const link = new RelayLink(url);
          try {
            await link.connect();
            const info = link.once('info', 5000);
            link.send({ t: 'info' });
            const m = await info;
            g.ui.toast(`✔ ${String(m.name)}: ${Number(m.rooms)} game(s) running${m.saves ? ', keeps synced saves' : ''}.`, 5000);
          } finally {
            link.close();
          }
        });
      }
    });
    bind(el, '[data-found-i]', (b) => {
      const f = found[Number(b.dataset.foundI)];
      if (f) void join(`ws://${f.address}:${f.port}`, f.code);
    });
    bind(el, '[data-kick]', (b) => {
      const net = g.net;
      if (!(net instanceof NetHost)) return;
      const p = net.players[Number(b.dataset.kick)];
      if (p?.member) net.kick(p.member);
      refresh();
    });
  };
  wire();
}

// ---------------------------------------------------------------- save sync

/** Moving this save between devices: Google Drive, a server with a sync key, or a code to copy. */
export function saveSync(g: Game, server = ''): void {
  const conf = loadSync();
  if (!conf.server && server) conf.server = server;
  const el = g.ui.push(
    'station',
    `<div class="panel wide"><h2 class="title" style="color:#7fe8ff">Sync Saves</h2>
      <div class="subtitle">Play on Windows and Android with the same progress.</div>
      <div class="mp-grid">
        <section class="mp-drive" data-drive hidden></section>
        <section class="mp-online"><h3>Through a server</h3>
          <label class="field">Server address <input data-f="server" value="${esc(conf.server)}" placeholder="the game server's address" autocomplete="off" spellcheck="false"></label>
          <label class="field">Sync key <input data-f="key" value="${esc(conf.key)}" placeholder="at least 8 characters" autocomplete="off" spellcheck="false"></label>
          <div class="row-btns"><button class="btn" data-nav data-a="newkey">New key</button></div>
          <p class="small">Use the same server and key on both devices. Anyone with the key can load this save, so keep it to yourself.</p>
          <div class="row-btns"><button class="btn primary" data-nav data-a="up">Upload this save</button><button class="btn" data-nav data-a="down">Download to this device</button></div>
          <label class="row"><input type="checkbox" data-f="auto"${conf.auto ? ' checked' : ''}> Keep in sync: upload after each escape, and offer a newer save when the game starts</label>
        </section>
        <section><h3>Without a server</h3>
          <p class="small">Copy this save as a code, send it to your other device, and paste it there.</p>
          <div class="row-btns"><button class="btn" data-nav data-a="copy">Copy save code</button></div>
          <textarea data-f="paste" rows="3" placeholder="Paste a save code here"></textarea>
          <div class="row-btns"><button class="btn" data-nav data-a="load">Load pasted save</button></div>
        </section>
      </div>
      <p class="small">Loading another save replaces the one in the slot in use on this device (slot ${currentSlot()}).</p>
      <button class="btn" data-nav data-a="back">Back</button></div>`,
    { onBack: () => g.ui.pop() },
  );
  const field = (k: string) => el.querySelector<HTMLInputElement>(`[data-f="${k}"]`);
  const read = () => {
    conf.server = field('server')!.value.trim();
    conf.key = field('key')!.value.trim();
    conf.auto = !!field('auto')!.checked;
    storeSync(conf);
  };
  let busy = false;
  const work = async (fn: () => Promise<void>) => {
    if (busy) return;
    busy = true;
    try {
      await fn();
    } catch (err) {
      audio.play('deny');
      g.ui.toast(err instanceof Error ? err.message : String(err), 4500);
    } finally {
      busy = false;
    }
  };
  field('auto')!.onchange = read;
  driveSection(g, el.querySelector<HTMLElement>('[data-drive]')!, work);
  bind(el, '[data-a]', (b) => {
    const a = b.dataset.a;
    if (a === 'back') {
      read();
      g.ui.pop();
    } else if (a === 'newkey') {
      field('key')!.value = newSyncKey();
      read();
    } else if (a === 'up') {
      read();
      void work(async () => {
        await uploadSave(conf, g.save);
        conf.last = Date.now();
        storeSync(conf);
        audio.play('boon');
        g.ui.toast('Save uploaded. On your other device, download it with the same server and key.', 4500);
      });
    } else if (a === 'down') {
      read();
      if (!b.dataset.armed) {
        b.dataset.armed = '1';
        b.textContent = 'Confirm: replace this save';
        return;
      }
      void work(async () => {
        const got = await downloadSave(conf);
        if (!got) throw new Error('There is no save under that key on this server yet.');
        conf.last = Date.now();
        storeSync(conf);
        replaceSave(g, got.save);
      });
    } else if (a === 'copy') {
      const code = exportSave(g.save);
      void navigator.clipboard
        ?.writeText(code)
        .then(() => g.ui.toast('Save code copied.'))
        .catch(() => {
          const t = field('paste') as unknown as HTMLTextAreaElement;
          t.value = code;
          t.select();
          g.ui.toast('Copy the code from the box.');
        });
    } else if (a === 'load') {
      const text = (field('paste') as unknown as HTMLTextAreaElement).value;
      if (!text.trim()) {
        g.ui.toast('Paste a save code first.');
        return;
      }
      if (!b.dataset.armed) {
        b.dataset.armed = '1';
        b.textContent = 'Confirm: replace this save';
        return;
      }
      void work(async () => replaceSave(g, importSave(text)));
    }
  });
}

/** The Google Drive part of Sync Saves: shown only in builds set up for it. */
function driveSection(g: Game, sec: HTMLElement, work: (fn: () => Promise<void>) => Promise<void>): void {
  const d = drive();
  const slot = currentSlot();
  const render = () => {
    const conf = loadDriveConf();
    sec.innerHTML = conf.on
      ? `<h3>Google Drive</h3>
        <p class="small">Signed in${conf.email ? ` as <b>${esc(conf.email)}</b>` : ''}. Slot ${slot} on this device shares its save with slot ${slot} on your other devices.</p>
        <div class="row-btns"><button class="btn primary" data-nav data-g="up">Upload this save</button><button class="btn" data-nav data-g="down">Download to this device</button><button class="btn ghost" data-nav data-g="out">Sign out</button></div>
        <label class="row"><input type="checkbox" data-g-auto${conf.auto ? ' checked' : ''}> Keep in sync: upload after each escape, and offer a newer save when the game starts</label>`
      : `<h3>Google Drive</h3>
        <p class="small">The easiest way: sign in with the same Google account on each device. Your save is kept in a hidden folder in your Google Drive that only this game can see.</p>
        <div class="row-btns"><button class="btn primary" data-nav data-g="in">Sign in with Google</button></div>`;
    bind(sec, '[data-g]', act);
    const auto = sec.querySelector<HTMLInputElement>('[data-g-auto]');
    if (auto)
      auto.onchange = () => {
        const c = loadDriveConf();
        c.auto = auto.checked;
        storeDriveConf(c);
      };
    g.ui.refreshItems(undefined, sec);
  };
  const markSeen = (at: number) => {
    const c = loadDriveConf();
    c.seen[slot] = Math.max(c.seen[slot] ?? 0, at);
    storeDriveConf(c);
  };
  const act = (b: HTMLElement) => {
    const a = b.dataset.g;
    if (a === 'in')
      void work(async () => {
        const conf = await driveSignIn();
        render();
        audio.play('boon');
        g.ui.toast(`Signed in to Google Drive${conf.email ? ` as ${conf.email}` : ''}.`, 3500);
        // First time on this account: put this save up, or offer the one already there.
        const got = await d.download(slot);
        if (!got) markSeen(await d.upload(g.save, slot));
        else if (Math.abs(got.save.lastPlayed - g.save.lastPlayed) > 1000) offerCloud(g, got, slot, true);
        else markSeen(got.at);
      });
    else if (a === 'up')
      void work(async () => {
        markSeen(await d.upload(g.save, slot, true));
        audio.play('boon');
        g.ui.toast(`Saved to Google Drive. On your other device, sign in and pick "Download" in slot ${slot}.`, 4500);
      });
    else if (a === 'down') {
      if (!b.dataset.armed) {
        b.dataset.armed = '1';
        b.textContent = 'Confirm: replace this save';
        return;
      }
      void work(async () => {
        const got = await d.download(slot, true);
        if (!got) throw new Error(`Google Drive has no save for slot ${slot} yet. Upload one from your other device first.`);
        markSeen(got.at);
        replaceSave(g, got.save);
      });
    } else if (a === 'out')
      void work(async () => {
        await driveSignOut();
        render();
        g.ui.toast('Signed out of Google Drive. Your saves there stay put.', 3500);
      });
  };
  void d.auth.available().then((ok) => {
    if (!ok || !sec.isConnected) return;
    if (!IS_DESKTOP && !IS_NATIVE) void preloadGis().catch(() => undefined);
    sec.hidden = false;
    render();
  });
}

/** Offers the Drive copy of a slot's save over this device's. */
function offerCloud(g: Game, got: CloudSave, slot: number, justSignedIn = false): void {
  const when = new Date(got.save.lastPlayed).toLocaleString();
  const theirs = levelFromXp(got.save.xp).level;
  const done = (use: boolean) => {
    const c = loadDriveConf();
    c.seen[slot] = Math.max(c.seen[slot] ?? 0, got.at);
    storeDriveConf(c);
    if (use) replaceSave(g, got.save);
    // Keeping this one: it goes up over the Drive copy now, so both devices agree.
    else void drive().upload(g.save, slot).catch(() => undefined);
  };
  g.ui.choice({
    title: justSignedIn ? 'A Save in Google Drive' : 'A Newer Save',
    subtitle: `Google Drive has a save for slot ${slot} from ${when} (level ${theirs}; this device is level ${g.level}). Which one do you want to keep?`,
    color: '#7fe8ff',
    cards: [
      { title: 'Use the Google Drive save', color: '#7fe8ff', desc: "Replaces this device's save with the one from Google Drive." },
      { title: "Keep this device's save", color: '#c8b8c0', desc: 'Uploads this save over the one in Google Drive.' },
    ],
    onPick: (i) => done(i === 0),
  });
}

/** Puts `save` in the slot in use and restarts the game with it. */
function replaceSave(g: Game, save: ReturnType<typeof importSave>): void {
  void leaveOnline(g);
  // The game saves itself as the page unloads: make sure it saves this one.
  g.save = save;
  writeSave(save);
  // An escape in progress belonged to the save being replaced.
  g.dropSavedRun();
  g.ui.toast('Save loaded. Restarting…');
  setTimeout(() => location.reload(), 600);
}

/** Keep-in-sync: after an escape, the save goes up in the background. */
export function syncAfterEscape(g: Game): void {
  const drv = loadDriveConf();
  if (drv.on && drv.auto) {
    const slot = currentSlot();
    drive()
      .upload(g.save, slot)
      .then((at) => {
        const c = loadDriveConf();
        c.seen[slot] = Math.max(c.seen[slot] ?? 0, at);
        storeDriveConf(c);
      })
      .catch(() => {
        /* offline or signed out: next time */
      });
  }
  const conf = loadSync();
  if (!conf.auto || !conf.server || conf.key.length < 8) return;
  uploadSave(conf, g.save)
    .then(() => {
      conf.last = Date.now();
      storeSync(conf);
    })
    .catch(() => {
      /* offline: next time */
    });
}

/** Keep-in-sync: at start, if Google Drive or the server holds a newer save than this device's, offer it. */
export function syncAtStart(g: Game): void {
  const drv = loadDriveConf();
  if (drv.on && drv.auto) {
    const slot = currentSlot();
    drive()
      .download(slot)
      .then((got) => {
        if (got && cloudIsNewer(got, g.save, drv.seen[slot] ?? 0)) offerCloud(g, got, slot);
      })
      .catch(() => {
        /* offline or signed out */
      });
  }
  const conf = loadSync();
  if (!conf.auto || !conf.server || conf.key.length < 8) return;
  downloadSave(conf)
    .then((got) => {
      if (!got || got.save.lastPlayed <= g.save.lastPlayed + 1000 || got.at <= conf.last) return;
      const when = new Date(got.save.lastPlayed).toLocaleString();
      g.ui.choice({
        title: 'A Newer Save',
        subtitle: `Your other device saved on ${when} (level ${levelFromXp(got.save.xp).level}; this one is level ${g.level}). Use it here?`,
        color: '#7fe8ff',
        cards: [
          { title: 'Use the newer save', color: '#7fe8ff', desc: 'Replaces this device\'s save with the one from the server.' },
          { title: 'Keep this one', color: '#c8b8c0', desc: 'Nothing changes. The next escape uploads this save over the server copy.' },
        ],
        onPick: (i) => {
          conf.last = Date.now();
          storeSync(conf);
          if (i === 0) replaceSave(g, got.save);
        },
      });
    })
    .catch(() => {
      /* offline */
    });
}
