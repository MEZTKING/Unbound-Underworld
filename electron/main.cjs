// Desktop shell for Unbound Underworld. Serves the Vite build from an `app://`
// origin (so ES modules and localStorage behave exactly like on the web) and
// opens it in a plain, menu-less window.
const { app, BrowserWindow, ipcMain, net, protocol, screen, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { registerGoogle } = require('./google.cjs');

const DIST = path.join(__dirname, '..', 'dist');

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

// Window mode: 'windowed' (normal frame), 'borderless' (no frame, covering the
// screen) or 'fullscreen'. Saved next to the game's data and restored at start.
const MODES = ['windowed', 'borderless', 'fullscreen'];
const modeFile = () => path.join(app.getPath('userData'), 'window.json');
function loadMode() {
  try {
    const m = JSON.parse(fs.readFileSync(modeFile(), 'utf8')).mode;
    return MODES.includes(m) ? m : 'windowed';
  } catch {
    return 'windowed';
  }
}
function saveMode(mode) {
  try {
    fs.writeFileSync(modeFile(), JSON.stringify({ mode }));
  } catch {
    /* read-only profile: the mode just isn't remembered */
  }
}
let windowMode = 'windowed';

function createWindow(near) {
  const borderless = windowMode === 'borderless';
  // Borderless covers the whole display the window was on.
  const display = near ? screen.getDisplayMatching(near) : screen.getPrimaryDisplay();
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    ...(borderless ? display.bounds : {}),
    frame: !borderless,
    fullscreen: windowMode === 'fullscreen',
    minWidth: 800,
    minHeight: 500,
    title: 'Unbound Underworld',
    backgroundColor: '#07050a',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      autoplayPolicy: 'no-user-gesture-required',
      // Games on the same network are reached over plain ws:// (there's no
      // certificate for a LAN address); the game page itself stays app://.
      allowRunningInsecureContent: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });
  win.setMenu(null);
  win.once('ready-to-show', () => win.show());

  // F11 or Alt+Enter toggles fullscreen (Esc stays free for the pause menu).
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11' || (input.alt && input.key === 'Enter')) {
      setWindowMode(win, windowMode === 'fullscreen' ? 'windowed' : 'fullscreen');
      event.preventDefault();
    }
  });

  // Never navigate away from the game; send external links to the browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('app://')) event.preventDefault();
  });

  void win.loadURL('app://game/index.html');
}

/**
 * Switches window mode. A window's frame can't change once it exists, so going
 * to or from borderless opens a fresh window (the game reloads; an escape in
 * progress resumes from its current chamber).
 */
function setWindowMode(win, mode) {
  if (!MODES.includes(mode) || mode === windowMode) return windowMode;
  const frameChanges = (mode === 'borderless') !== (windowMode === 'borderless');
  windowMode = mode;
  saveMode(mode);
  if (frameChanges) {
    const bounds = win.getBounds();
    createWindow(bounds);
    win.destroy();
  } else win.setFullScreen(mode === 'fullscreen');
  return windowMode;
}

// The Windows installer and the Linux AppImage can replace themselves with a new
// version. The portable .exe and the unsigned macOS app can't, so the game
// offers their new download in the browser instead.
function canSelfUpdate() {
  if (!app.isPackaged) return false;
  if (process.platform === 'win32') return !process.env.PORTABLE_EXECUTABLE_DIR;
  if (process.platform === 'linux') return !!process.env.APPIMAGE;
  return false;
}

function registerWindowMode() {
  ipcMain.handle('window:get', () => windowMode);
  ipcMain.handle('window:set', (event, mode) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return win ? setWindowMode(win, mode) : windowMode;
  });
}

// Hosting on this network: the game's relay (server/relay-core.cjs) runs in
// this process on port 7777, announced to players nearby by UDP broadcast.
const lan = { server: null, relay: null, beacon: null, port: 0 };

function startLanHost(name) {
  if (lan.server) return Promise.resolve({ port: lan.port, addresses: require('../server/lan.cjs').lanAddresses().map((a) => a.address) });
  const http = require('node:http');
  const { Relay, serve } = require('../server/relay-core.cjs');
  const { startBeacon, lanAddresses } = require('../server/lan.cjs');
  const relay = new Relay({ name, saves: false, lan: true, maxRooms: 4 });
  const tryPort = (port) =>
    new Promise((resolve, reject) => {
      const server = http.createServer();
      serve(server, relay);
      server.once('error', reject);
      server.listen(port, '0.0.0.0', () => resolve(server));
    });
  const attempt = async () => {
    for (let port = 7777; port < 7787; port++) {
      try {
        const server = await tryPort(port);
        return { server, port };
      } catch (err) {
        if (err.code !== 'EADDRINUSE') throw err;
      }
    }
    throw new Error('No free port between 7777 and 7786.');
  };
  return attempt().then(({ server, port }) => {
    lan.server = server;
    lan.relay = relay;
    lan.port = port;
    lan.beacon = startBeacon(() => {
      const list = relay.listing();
      return { name, port, code: list.length === 1 ? list[0].code : '', players: list.reduce((n, r) => n + r.players, 0), version: list[0]?.version ?? '' };
    });
    return { port, addresses: lanAddresses().map((a) => a.address) };
  });
}

function stopLanHost() {
  lan.beacon?.stop();
  lan.relay?.close();
  lan.server?.close();
  lan.server = lan.relay = lan.beacon = null;
  lan.port = 0;
}

function registerNet() {
  ipcMain.handle('net:host', (event, name) => startLanHost(String(name || 'A game').slice(0, 24)));
  ipcMain.handle('net:stop', () => stopLanHost());
  ipcMain.handle('net:discover', (event, ms) => require('../server/lan.cjs').discover(Math.min(8000, Math.max(500, Number(ms) || 2500))));
  app.on('before-quit', stopLanHost);
}

function registerUpdates() {
  ipcMain.handle('updates:info', () => ({ platform: process.platform, canSelfUpdate: canSelfUpdate() }));
  ipcMain.handle('updates:install', async (event) => {
    if (!canSelfUpdate()) return 'none';
    const { autoUpdater } = require('electron-updater');
    autoUpdater.autoDownload = false;
    autoUpdater.removeAllListeners('download-progress');
    autoUpdater.on('download-progress', (p) => {
      if (!event.sender.isDestroyed()) event.sender.send('updates:progress', p.percent);
    });
    const result = await autoUpdater.checkForUpdates();
    if (!result || !result.isUpdateAvailable) return 'none';
    await autoUpdater.downloadUpdate();
    // Close, install silently and start the new version.
    setImmediate(() => autoUpdater.quitAndInstall(true, true));
    return 'installing';
  });
}

// Keep a single instance so two windows never fight over the same save.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const [win] = BrowserWindow.getAllWindows();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(() => {
    protocol.handle('app', (request) => {
      const { pathname } = new URL(request.url);
      const file = path.normalize(path.join(DIST, decodeURIComponent(pathname)));
      // Refuse anything outside the bundled game files.
      if (!file.startsWith(DIST + path.sep) || !fs.existsSync(file)) return new Response('Not found', { status: 404 });
      return net.fetch(pathToFileURL(file).toString());
    });
    registerUpdates();
    registerWindowMode();
    registerNet();
    registerGoogle();
    windowMode = loadMode();
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
