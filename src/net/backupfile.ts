// Backing a save slot up to a file the player picks: on Android the system's
// file picker offers Google Drive, and on a PC the pickers open in the Google
// Drive folder (Google Drive for desktop). So saves reach Google Drive with no
// sign-in and nothing to set up. The apps keep the picked file: they rewrite
// it after each escape, and at start offer the save in it when it is newer
// (another device wrote it). The browser can only save and load copies.
import { registerPlugin } from '@capacitor/core';
import type { SaveData } from '../game/meta';
import { IS_DESKTOP, IS_NATIVE } from '../platform';
import { parseStored, type CloudSave } from './gdrive';

export interface FileLink {
  id: string;
  name: string;
}

interface Host {
  /** The apps keep writing the picked file; the browser only saves and loads copies. */
  keeps: boolean;
  /** Google Drive for desktop's folder, when found. */
  driveFolder(): Promise<string>;
  /** Asks where to save, and writes `text` there. */
  create(name: string, text: string): Promise<FileLink | null>;
  /** Asks for a file, and reads it. */
  open(): Promise<{ link: FileLink | null; text: string } | null>;
  read(link: FileLink): Promise<string>;
  write(link: FileLink, text: string): Promise<void>;
}

interface DesktopBackup {
  drive(): Promise<string>;
  create(name: string): Promise<FileLink | null>;
  open(): Promise<FileLink | null>;
  read(id: string): Promise<string>;
  write(id: string, text: string): Promise<void>;
}

function desktopHost(d: DesktopBackup): Host {
  return {
    keeps: true,
    driveFolder: () => d.drive().catch(() => ''),
    async create(name, text) {
      const link = await d.create(name);
      if (link) await d.write(link.id, text);
      return link;
    },
    async open() {
      const link = await d.open();
      return link ? { link, text: await d.read(link.id) } : null;
    },
    read: (l) => d.read(l.id),
    write: (l, text) => d.write(l.id, text),
  };
}

interface FilePlugin {
  create(o: { name: string }): Promise<{ uri?: string; name?: string }>;
  open(): Promise<{ uri?: string; name?: string }>;
  read(o: { uri: string }): Promise<{ text: string }>;
  write(o: { uri: string; text: string }): Promise<void>;
}

function androidHost(): Host {
  const p = registerPlugin<FilePlugin>('BackupFile');
  const link = (r: { uri?: string; name?: string }): FileLink | null => (r.uri ? { id: r.uri, name: r.name || 'backup file' } : null);
  return {
    keeps: true,
    driveFolder: async () => '',
    async create(name, text) {
      const l = link(await p.create({ name }));
      if (l) await p.write({ uri: l.id, text });
      return l;
    },
    async open() {
      const l = link(await p.open());
      return l ? { link: l, text: (await p.read({ uri: l.id })).text } : null;
    },
    read: async (l) => (await p.read({ uri: l.id })).text,
    write: (l, text) => p.write({ uri: l.id, text }),
  };
}

function webHost(): Host {
  return {
    keeps: false,
    driveFolder: async () => '',
    async create(name, text) {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
      return null;
    },
    open: () =>
      new Promise((resolve, reject) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,application/json';
        input.onchange = () => {
          const f = input.files?.[0];
          if (!f) resolve(null);
          else f.text().then((text) => resolve({ link: null, text }), reject);
        };
        input.click();
      }),
    read: async () => {
      throw new Error('The browser version can only load a backup you pick.');
    },
    write: async () => {
      throw new Error('The browser version can only download backups.');
    },
  };
}

let host: Host | null = null;

export function backupHost(): Host {
  if (!host) {
    const desktop = (globalThis as unknown as { uuBackup?: DesktopBackup }).uuBackup;
    host = IS_DESKTOP && desktop ? desktopHost(desktop) : IS_NATIVE ? androidHost() : webHost();
  }
  return host;
}

/** What the file holds: the save and when it was written, on one line (anything after it is ignored). */
export function backupText(save: SaveData, at = Date.now()): string {
  return `${JSON.stringify({ game: 'unbound-underworld', v: 1, at, save })}\n`;
}

export function readBackup(text: string): CloudSave {
  try {
    return parseStored(text.trim().split('\n')[0]);
  } catch {
    throw new Error("That file isn't a backup from this game.");
  }
}

export const backupName = (slot: number) => `unbound-underworld-slot-${slot}.json`;

// ---------------------------------------------------------------- the file each slot uses

export interface SlotBackup {
  link: FileLink;
  /** Write after each escape, and offer a newer save at start. */
  auto: boolean;
  /** When the copy this device last wrote, loaded or turned down was written (ms). */
  seen: number;
}

const KEY = 'uu-backup';

function loadAll(): Record<string, SlotBackup> {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Record<string, Partial<SlotBackup>> | null;
    const out: Record<string, SlotBackup> = {};
    for (const [slot, b] of Object.entries(raw ?? {})) {
      if (b?.link?.id) out[slot] = { link: { id: String(b.link.id), name: String(b.link.name ?? 'backup file') }, auto: b.auto !== false, seen: Number(b.seen) || 0 };
    }
    return out;
  } catch {
    return {};
  }
}

function storeAll(all: Record<string, SlotBackup>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* not remembered */
  }
}

export function slotBackup(slot: number): SlotBackup | null {
  return loadAll()[slot] ?? null;
}

export function setSlotBackup(slot: number, b: SlotBackup | null): void {
  const all = loadAll();
  if (b) all[slot] = b;
  else delete all[slot];
  storeAll(all);
}

export function markBackupSeen(slot: number, at: number): void {
  const b = slotBackup(slot);
  if (b) setSlotBackup(slot, { ...b, seen: Math.max(b.seen, at) });
}

/** Writes the slot's save to its file. Returns when it was written. */
export async function backupNow(save: SaveData, slot: number): Promise<number> {
  const b = slotBackup(slot);
  if (!b) throw new Error('Choose a backup file first.');
  const at = Date.now();
  await backupHost().write(b.link, backupText(save, at));
  markBackupSeen(slot, at);
  return at;
}

/** The save in the slot's file. */
export async function readSlotBackup(slot: number): Promise<CloudSave | null> {
  const b = slotBackup(slot);
  return b ? readBackup(await backupHost().read(b.link)) : null;
}
