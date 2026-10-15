// In-app updates. The Windows installer and the Linux AppImage download and
// install new versions themselves; so does the Android APK (it downloads the
// new APK and opens Android's installer without leaving the game); other app
// builds open the new download; the web version reloads once its service
// worker has fetched the new files. Store builds (VITE_DISTRIBUTION=play)
// leave updating to the store.

import { registerPlugin } from '@capacitor/core';

declare const __APP_VERSION__: string;

export const APP_VERSION = __APP_VERSION__;
export const RELEASES_REPO = 'MEZTKING/Unbound-Underworld';
const LATEST_API = `https://api.github.com/repos/${RELEASES_REPO}/releases/latest`;

/** The Android app's native updater (android/.../ApkUpdaterPlugin.java). */
interface ApkUpdater {
  canInstall(): Promise<{ allowed: boolean }>;
  openInstallSettings(): Promise<void>;
  downloadAndInstall(o: { url: string }): Promise<void>;
  addListener(event: 'progress', cb: (e: { percent: number }) => void): Promise<{ remove: () => Promise<void> }>;
}

/** Exposed by electron/preload.cjs inside the desktop app. */
interface DesktopBridge {
  info(): Promise<{ platform: string; canSelfUpdate: boolean }>;
  install(): Promise<'none' | 'installing'>;
  onProgress(cb: (percent: number) => void): void;
}

export type UpdateState =
  | { kind: 'idle' | 'checking' | 'current' }
  | { kind: 'error'; message: string }
  | { kind: 'available'; version: string; action: 'install' | 'download' | 'reload'; url: string; hint?: string }
  | { kind: 'downloading'; version: string; percent: number; android?: boolean }
  | { kind: 'opened'; version: string };

type Platform = 'desktop' | 'android' | 'web' | 'store';

const host = globalThis as unknown as { desktop?: DesktopBridge; Capacitor?: { isNativePlatform?: () => boolean } };
const desktop = host.desktop;
const native = !!host.Capacitor?.isNativePlatform?.();

const platform: Platform =
  import.meta.env.VITE_DISTRIBUTION === 'play' ? 'store' : desktop ? 'desktop' : native ? 'android' : 'web';

const apkUpdater = platform === 'android' ? registerPlugin<ApkUpdater>('ApkUpdater') : null;

let state: UpdateState = { kind: 'idle' };
const listeners = new Set<(s: UpdateState) => void>();
let swReg: ServiceWorkerRegistration | null = null;

function set(next: UpdateState): void {
  state = next;
  for (const fn of listeners) fn(state);
}

export function updateState(): UpdateState {
  return state;
}

/** Calls `fn` now and on every change until it returns false. */
export function watchUpdates(fn: (s: UpdateState) => boolean): void {
  const wrapped = (s: UpdateState): void => {
    if (!fn(s)) listeners.delete(wrapped);
  };
  listeners.add(wrapped);
  wrapped(state);
}

/** True when this build can update itself or point to a newer download. */
export const updatesSupported =
  platform !== 'store' && (platform !== 'web' || (typeof navigator !== 'undefined' && 'serviceWorker' in navigator));

/** Compares dotted versions such as "0.1.10" and "v0.2.0". */
export function newerThan(a: string, b: string): boolean {
  const pa = a.replace(/^v/, '').split(/[.-]/).map((n) => parseInt(n, 10) || 0);
  const pb = b.replace(/^v/, '').split(/[.-]/).map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0);
  }
  return false;
}

interface Release {
  tag_name: string;
  html_url: string;
  assets: { name: string; browser_download_url: string }[];
}

/** Starts update handling at launch: registers the web service worker or checks the latest release. */
export function initUpdates(): void {
  if (platform === 'web') initServiceWorker();
  else if (platform !== 'store') void check();
}

export async function check(): Promise<void> {
  if (!updatesSupported || state.kind === 'checking' || state.kind === 'downloading') return;
  set({ kind: 'checking' });
  if (platform === 'web') {
    await checkServiceWorker();
    return;
  }
  try {
    const res = await fetch(LATEST_API, { headers: { Accept: 'application/vnd.github+json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rel = (await res.json()) as Release;
    if (!newerThan(rel.tag_name, APP_VERSION)) {
      set({ kind: 'current' });
      return;
    }
    const version = rel.tag_name.replace(/^v/, '');
    // Releases don't always include every platform, so only offer an update
    // when this platform's file is actually there.
    if (desktop) {
      const info = await desktop.info();
      if (info.canSelfUpdate) {
        const feed = info.platform === 'linux' ? 'latest-linux.yml' : 'latest.yml';
        if (rel.assets.some((a) => a.name === feed)) set({ kind: 'available', version, action: 'install', url: rel.html_url });
        else set({ kind: 'current' });
        return;
      }
      // Portable Windows players fall back to the installer if there's no new portable exe.
      const patterns = info.platform === 'darwin' ? [/-mac-universal\.dmg$/] : info.platform === 'win32' ? [/-Portable\.exe$/, /Setup-.*\.exe$/] : [/\.AppImage$/];
      const url = findAsset(rel, patterns);
      set(url ? { kind: 'available', version, action: 'download', url } : { kind: 'current' });
    } else {
      const url = findAsset(rel, [/-android\.apk$/]);
      set(url ? { kind: 'available', version, action: apkUpdater ? 'install' : 'download', url } : { kind: 'current' });
    }
  } catch {
    set({ kind: 'error', message: "Couldn't reach the update server." });
  }
}

/** The first asset matching any pattern, in order of preference. */
function findAsset(rel: Release, patterns: RegExp[]): string | null {
  for (const p of patterns) {
    const a = rel.assets.find((x) => p.test(x.name));
    if (a) return a.browser_download_url;
  }
  return null;
}

/** The one-button update: installs, downloads or reloads depending on the build. */
export async function applyUpdate(): Promise<void> {
  const s = state;
  if (s.kind !== 'available') return;
  if (s.action === 'reload') {
    location.reload();
    return;
  }
  if (s.action === 'download') {
    // Desktop: opens the system browser. Android: Capacitor hands external links to the browser.
    if (desktop) window.open(s.url);
    else location.href = s.url;
    set({ kind: 'opened', version: s.version });
    return;
  }
  if (apkUpdater) {
    await installApk(apkUpdater, s);
    return;
  }
  if (!desktop) return;
  set({ kind: 'downloading', version: s.version, percent: 0 });
  desktop.onProgress((percent) => {
    if (state.kind === 'downloading') set({ kind: 'downloading', version: s.version, percent });
  });
  try {
    // On success the app closes, installs the update and starts again.
    if ((await desktop.install()) === 'none') set({ kind: 'current' });
  } catch {
    set({ kind: 'error', message: 'The update failed to download. Try again later.' });
  }
}

/** Android: download the new APK in the game and open the system installer. */
async function installApk(up: ApkUpdater, s: UpdateState & { kind: 'available' }): Promise<void> {
  try {
    // Android 8+ asks once whether this app may install updates.
    if (!(await up.canInstall()).allowed) {
      await up.openInstallSettings();
      set({ ...s, hint: 'Allow installs from Unbound Underworld, then come back and tap Update now.' });
      return;
    }
  } catch {
    // An older app without the native updater: open the download instead.
    location.href = s.url;
    set({ kind: 'opened', version: s.version });
    return;
  }
  set({ kind: 'downloading', version: s.version, percent: 0, android: true });
  const sub = await up.addListener('progress', ({ percent }) => {
    if (state.kind === 'downloading') set({ kind: 'downloading', version: s.version, percent, android: true });
  });
  try {
    await up.downloadAndInstall({ url: s.url });
    // Android's installer is now on screen; if it's dismissed, the button comes back.
    set({ ...s, hint: 'Finish installing in the window Android opened.' });
  } catch {
    set({ kind: 'error', message: 'The update failed to download. Try again later.' });
  } finally {
    void sub.remove();
  }
}

// ---------------------------------------------------------------- web version

function initServiceWorker(): void {
  // Offline support and updates for the installable web version only.
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  if (location.protocol !== 'https:' && location.hostname !== 'localhost') return;
  const hadController = !!navigator.serviceWorker.controller;
  // A new version's worker takes over as soon as it has cached its files.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) set({ kind: 'available', version: '', action: 'reload', url: '' });
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js')
      .then((reg) => (swReg = reg))
      .catch(() => {});
  });
}

async function checkServiceWorker(): Promise<void> {
  try {
    if (!swReg) throw new Error('no worker');
    await swReg.update();
    if ((!swReg.installing && !swReg.waiting) || !navigator.serviceWorker.controller) set({ kind: 'current' });
    // Otherwise the controllerchange listener reports the new version once it is ready.
  } catch {
    set({ kind: 'error', message: "Couldn't check for updates." });
  }
}
