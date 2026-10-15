// Keeping one save across devices (say, the Windows app and a phone): the
// save goes up to a game server under a sync key you choose, and comes down
// on the other device with the same key.
import { normalizeSave, type SaveData } from '../game/meta';
import { RelayLink, serverUrl } from './link';

export interface SyncConf {
  server: string;
  key: string;
  /** Upload after each escape, and offer a newer copy at start. */
  auto: boolean;
  /** When this device last uploaded or downloaded (ms). */
  last: number;
}

const KEY = 'uu-sync';

export function loadSync(): SyncConf {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<SyncConf> | null;
    return { server: String(raw?.server ?? ''), key: String(raw?.key ?? ''), auto: !!raw?.auto, last: Number(raw?.last) || 0 };
  } catch {
    return { server: '', key: '', auto: false, last: 0 };
  }
}

export function storeSync(c: SyncConf): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(c));
  } catch {
    /* storage unavailable */
  }
}

/** A fresh random sync key (easy to type: no look-alike characters). */
export function newSyncKey(): string {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  const a = new Uint32Array(12);
  crypto.getRandomValues(a);
  const s = [...a].map((n) => chars[n % chars.length]).join('');
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}`;
}

async function talk<T>(server: string, fn: (link: RelayLink) => Promise<T>): Promise<T> {
  const url = serverUrl(server);
  if (!url) throw new Error('Enter the server address first.');
  const link = new RelayLink(url);
  try {
    await link.connect();
    return await fn(link);
  } finally {
    link.close();
  }
}

/** Puts this save on the server. */
export async function uploadSave(c: SyncConf, save: SaveData): Promise<void> {
  if (c.key.length < 8) throw new Error('A sync key needs at least 8 characters.');
  await talk(c.server, async (link) => {
    const done = link.once('saved', 10000);
    link.send({ t: 'save-put', key: c.key, data: JSON.stringify({ ...save, lastPlayed: Date.now() }) });
    await done;
  });
}

/** The save stored on the server under this key (null if there's none), and when it was stored. */
export async function downloadSave(c: SyncConf): Promise<{ save: SaveData; at: number } | null> {
  if (c.key.length < 8) throw new Error('A sync key needs at least 8 characters.');
  return talk(c.server, async (link) => {
    const reply = link.once('save', 10000);
    link.send({ t: 'save-get', key: c.key });
    const m = await reply;
    if (typeof m.data !== 'string' || !m.data) return null;
    return { save: normalizeSave(JSON.parse(m.data)), at: Number(m.at) || 0 };
  });
}

/** A save as text to copy between devices by hand (no server needed). */
export function exportSave(save: SaveData): string {
  const json = JSON.stringify(save);
  return `UU1:${btoa(unescape(encodeURIComponent(json)))}`;
}

export function importSave(text: string): SaveData {
  const t = text.trim();
  const body = t.startsWith('UU1:') ? t.slice(4) : t;
  let json: string;
  try {
    json = t.startsWith('{') ? t : decodeURIComponent(escape(atob(body.replace(/\s+/g, ''))));
  } catch {
    throw new Error("That doesn't look like a save code.");
  }
  try {
    return normalizeSave(JSON.parse(json));
  } catch {
    throw new Error("That save code is damaged or incomplete.");
  }
}
