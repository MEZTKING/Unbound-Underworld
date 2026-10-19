// Cloud saves in the player's own Google Drive. Each save slot is one small
// file in the game's hidden app folder in Drive (no other app can see it, and
// the player never has to manage it), so slot 1 on a phone and slot 1 on a PC
// share their progress when both sign in with the same Google account.
//
// Signing in depends on where the game runs:
//   desktop  the app's main process signs in through the system browser and
//            keeps the sign-in (electron/google.cjs);
//   Android  Google Play services asks for access (GoogleDrivePlugin.java);
//   browser  Google's sign-in popup (a sign-in lasts about an hour).
// Each hands back a short-lived access token, and the Drive calls below are
// the same everywhere.
import { registerPlugin } from '@capacitor/core';
import { currentSlot, normalizeSave, type SaveData } from '../game/meta';
import { IS_DESKTOP, IS_NATIVE } from '../platform';

const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
/** The Google Cloud project's web client: set at build time (see docs/GOOGLE_DRIVE.md). */
const WEB_CLIENT_ID: string = import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID ?? '';

/** Gets access tokens; `interactive` may show Google's sign-in, otherwise it never does. */
export interface DriveAuth {
  available(): Promise<boolean>;
  token(interactive: boolean): Promise<string | null>;
  /** The token was refused: don't hand it out again. */
  drop(token: string): Promise<void>;
  signOut(): Promise<void>;
}

export interface DriveConf {
  /** Signed in on this device. */
  on: boolean;
  /** Upload after each escape, and offer a newer save at start. */
  auto: boolean;
  email: string;
  /** Per slot: when the Drive copy this device last uploaded, downloaded or turned down was stored (ms). */
  seen: Record<string, number>;
}

const KEY = 'uu-gdrive';

export function loadDriveConf(): DriveConf {
  try {
    const r = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<DriveConf> | null;
    const seen: Record<string, number> = {};
    for (const [k, v] of Object.entries(r?.seen ?? {})) if (Number(v) > 0) seen[k] = Number(v);
    return { on: !!r?.on, auto: r?.auto !== false, email: String(r?.email ?? ''), seen };
  } catch {
    return { on: false, auto: true, email: '', seen: {} };
  }
}

export function storeDriveConf(c: DriveConf): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(c));
  } catch {
    /* storage unavailable */
  }
}

/** The file a save slot lives in. */
export const slotFile = (slot: number) => `slot-${slot}.json`;

/** What goes in the file: the save, and when it was put there. */
interface Stored {
  game: 'unbound-underworld';
  v: 1;
  at: number;
  save: SaveData;
}

export interface CloudSave {
  save: SaveData;
  /** When it was uploaded (ms). */
  at: number;
}

class Expired extends Error {}

/** The Drive calls, given a way to get tokens. */
export class DriveSaves {
  constructor(
    readonly auth: DriveAuth,
    private readonly http: typeof fetch = (...a) => fetch(...a),
  ) {}

  private async send(token: string, method: string, url: string, body?: string, type?: string): Promise<Response> {
    const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
    if (type) headers['Content-Type'] = type;
    const res = await this.http(url, { method, headers, body });
    if (res.status === 401) throw new Expired('expired');
    if (!res.ok) {
      let why = '';
      try {
        why = ((await res.json()) as { error?: { message?: string } }).error?.message ?? '';
      } catch {
        /* no details */
      }
      throw new Error(`Google Drive refused (${res.status}${why ? `: ${why}` : ''}).`);
    }
    return res;
  }

  /** Runs `fn` with a token, once more with a fresh one if Google says it expired. */
  private async withToken<T>(interactive: boolean, fn: (token: string) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      const token = await this.auth.token(interactive);
      if (!token) throw new Error('Sign in to Google Drive first.');
      try {
        return await fn(token);
      } catch (err) {
        if (!(err instanceof Expired) || attempt > 0) throw err instanceof Expired ? new Error('Google Drive sign-in expired. Sign in again.') : err;
        await this.auth.drop(token);
      }
    }
  }

  private async find(token: string, name: string): Promise<string | null> {
    const q = encodeURIComponent(`name='${name}' and trashed=false`);
    const res = await this.send(token, 'GET', `${API}/files?spaces=appDataFolder&q=${q}&fields=files(id)&pageSize=10`);
    const files = ((await res.json()) as { files?: { id: string }[] }).files ?? [];
    return files[0]?.id ?? null;
  }

  /** The Google account's email, to show who is signed in. */
  account(interactive: boolean): Promise<string> {
    return this.withToken(interactive, async (token) => {
      const res = await this.send(token, 'GET', `${API}/about?fields=user(emailAddress)`);
      return ((await res.json()) as { user?: { emailAddress?: string } }).user?.emailAddress ?? '';
    });
  }

  /** Puts `save` in the slot's file (making it the first time). Returns when it was stored. */
  upload(save: SaveData, slot = currentSlot(), interactive = false): Promise<number> {
    return this.withToken(interactive, async (token) => {
      const at = Date.now();
      const body = JSON.stringify({ game: 'unbound-underworld', v: 1, at, save } satisfies Stored);
      const id = await this.find(token, slotFile(slot));
      if (id) await this.send(token, 'PATCH', `${UPLOAD}/files/${id}?uploadType=media&fields=id`, body, 'application/json');
      else {
        const boundary = `uu${Math.random().toString(36).slice(2)}`;
        const meta = JSON.stringify({ name: slotFile(slot), parents: ['appDataFolder'], mimeType: 'application/json' });
        const multipart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`;
        await this.send(token, 'POST', `${UPLOAD}/files?uploadType=multipart&fields=id`, multipart, `multipart/related; boundary=${boundary}`);
      }
      return at;
    });
  }

  /** The slot's save in Drive, or null if there's none yet. */
  download(slot = currentSlot(), interactive = false): Promise<CloudSave | null> {
    return this.withToken(interactive, async (token) => {
      const id = await this.find(token, slotFile(slot));
      if (!id) return null;
      const res = await this.send(token, 'GET', `${API}/files/${id}?alt=media`);
      return parseStored(await res.text());
    });
  }
}

export function parseStored(text: string): CloudSave {
  let raw: Partial<Stored>;
  try {
    raw = JSON.parse(text) as Partial<Stored>;
  } catch {
    throw new Error('The save in Google Drive is damaged.');
  }
  if (raw?.game !== 'unbound-underworld' || !raw.save) throw new Error('The file in Google Drive is not a save from this game.');
  return { save: normalizeSave(raw.save), at: Number(raw.at) || 0 };
}

/** True when the Drive copy should be offered over this device's save. */
export function cloudIsNewer(cloud: CloudSave, local: SaveData, seen: number): boolean {
  return cloud.save.lastPlayed > local.lastPlayed + 1000 && cloud.at > seen;
}

// ---------------------------------------------------------------- sign-in per platform

/** The desktop app's main process (electron/google.cjs). */
interface DesktopDrive {
  available(): Promise<boolean>;
  signIn(): Promise<void>;
  token(): Promise<string | null>;
  drop(): Promise<void>;
  signOut(): Promise<void>;
}

function desktopAuth(d: DesktopDrive): DriveAuth {
  return {
    available: () => d.available().catch(() => false),
    async token(interactive) {
      const t = await d.token();
      if (t || !interactive) return t;
      await d.signIn();
      return d.token();
    },
    drop: () => d.drop(),
    signOut: () => d.signOut(),
  };
}

interface DrivePlugin {
  authorize(o: { interactive: boolean }): Promise<{ accessToken: string }>;
  clearToken(o: { token: string }): Promise<void>;
}

/** Revokes this app's access to the account (signing out for good). */
async function revoke(token: string): Promise<void> {
  try {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: 'POST' });
  } catch {
    /* offline: the token runs out on its own */
  }
}

function androidAuth(): DriveAuth {
  const p = registerPlugin<DrivePlugin>('GoogleDrive');
  return {
    available: async () => !!WEB_CLIENT_ID,
    async token(interactive) {
      try {
        return (await p.authorize({ interactive })).accessToken || null;
      } catch (err) {
        const code = (err as { code?: string }).code;
        if (!interactive && code === 'signin-required') return null;
        throw err instanceof Error ? err : new Error(String(err));
      }
    },
    drop: (token) => p.clearToken({ token }).catch(() => undefined),
    async signOut() {
      const token = await p.authorize({ interactive: false }).then((r) => r.accessToken, () => '');
      if (token) {
        await revoke(token);
        await p.clearToken({ token }).catch(() => undefined);
      }
    },
  };
}

// Google Identity Services, loaded only when a browser player opens cloud saves.
interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}
interface TokenClient {
  requestAccessToken(o?: { prompt?: string; login_hint?: string }): void;
}
interface Gis {
  accounts: {
    oauth2: {
      initTokenClient(o: {
        client_id: string;
        scope: string;
        callback: (r: TokenResponse) => void;
        error_callback?: (e: { type?: string; message?: string }) => void;
      }): TokenClient;
    };
  };
}

const WEB_TOKEN = 'uu-gdrive-token';
let gisLoading: Promise<Gis> | null = null;

/** Loads Google's sign-in script (early, so a click can open the popup straight away). */
export function preloadGis(): Promise<Gis> {
  const w = window as unknown as { google?: Gis };
  if (w.google?.accounts?.oauth2) return Promise.resolve(w.google);
  gisLoading ??= new Promise<Gis>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => (w.google?.accounts?.oauth2 ? resolve(w.google) : reject(new Error('Google sign-in failed to load.')));
    s.onerror = () => {
      gisLoading = null;
      reject(new Error("Couldn't reach Google. Check the connection."));
    };
    document.head.appendChild(s);
  });
  return gisLoading;
}

function webAuth(): DriveAuth {
  const cached = (): string | null => {
    try {
      const t = JSON.parse(localStorage.getItem(WEB_TOKEN) ?? 'null') as { token?: string; until?: number } | null;
      return t?.token && (t.until ?? 0) > Date.now() + 60000 ? t.token : null;
    } catch {
      return null;
    }
  };
  const keep = (token: string, seconds: number) => {
    try {
      localStorage.setItem(WEB_TOKEN, JSON.stringify({ token, until: Date.now() + seconds * 1000 }));
    } catch {
      /* asks again next time */
    }
  };
  const forget = () => {
    try {
      localStorage.removeItem(WEB_TOKEN);
    } catch {
      /* nothing kept */
    }
  };
  return {
    available: async () => !!WEB_CLIENT_ID,
    async token(interactive) {
      const t = cached();
      if (t || !interactive) return t;
      const gis = await preloadGis();
      return new Promise<string>((resolve, reject) => {
        const client = gis.accounts.oauth2.initTokenClient({
          client_id: WEB_CLIENT_ID,
          scope: SCOPE,
          callback: (r) => {
            if (!r.access_token) {
              reject(new Error(r.error_description || r.error || 'Google sign-in failed.'));
              return;
            }
            keep(r.access_token, r.expires_in ?? 3599);
            resolve(r.access_token);
          },
          error_callback: (e) =>
            reject(new Error(e.type === 'popup_closed' ? 'Google sign-in was closed.' : e.type === 'popup_failed_to_open' ? 'Allow pop-ups for this page to sign in with Google.' : e.message || 'Google sign-in failed.')),
        });
        client.requestAccessToken({ login_hint: loadDriveConf().email || undefined });
      });
    },
    drop: async () => forget(),
    async signOut() {
      const t = cached();
      forget();
      if (t) await revoke(t);
    },
  };
}

let instance: DriveSaves | null = null;

/** Cloud saves for the platform the game runs on. */
export function drive(): DriveSaves {
  if (!instance) {
    const desktop = (globalThis as unknown as { uuDrive?: DesktopDrive }).uuDrive;
    instance = new DriveSaves(IS_DESKTOP && desktop ? desktopAuth(desktop) : IS_NATIVE ? androidAuth() : webAuth());
  }
  return instance;
}

/** Signs in (Google's own screens), then remembers the account. */
export async function driveSignIn(): Promise<DriveConf> {
  const d = drive();
  await d.auth.token(true);
  const conf = loadDriveConf();
  conf.email = await d.account(false).catch(() => '');
  conf.on = true;
  storeDriveConf(conf);
  return conf;
}

/** Signs out and revokes the game's access to the account. */
export async function driveSignOut(): Promise<void> {
  try {
    await drive().auth.signOut();
  } finally {
    const conf = loadDriveConf();
    storeDriveConf({ ...conf, on: false, email: '', seen: {} });
  }
}
