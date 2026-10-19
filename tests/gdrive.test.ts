import { describe, expect, it } from 'vitest';
import { cloudIsNewer, DriveSaves, parseStored, slotFile, type DriveAuth } from '../src/net/gdrive';
import { defaultSave } from '../src/game/meta';

/** A tiny stand-in for Drive's app folder: files by id, and the calls the game makes. */
function fakeDrive(opts: { expireFirst?: boolean } = {}) {
  const files = new Map<string, { name: string; body: string }>();
  const calls: string[] = [];
  let valid = opts.expireFirst ? 'fresh' : 'tok';
  let issued = 0;
  const auth: DriveAuth = {
    available: async () => true,
    token: async () => (opts.expireFirst && issued++ === 0 ? 'stale' : valid),
    drop: async () => undefined,
    signOut: async () => {
      valid = '';
    },
  };
  const http = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    calls.push(`${method} ${url.pathname}`);
    const auth = (init?.headers as Record<string, string>)?.Authorization;
    if (auth !== `Bearer ${valid}`) return new Response('{}', { status: 401 });
    const body = String(init?.body ?? '');
    if (url.pathname === '/drive/v3/files' && method === 'GET') {
      expect(url.searchParams.get('spaces')).toBe('appDataFolder');
      const name = /name='([^']+)'/.exec(url.searchParams.get('q') ?? '')?.[1];
      const found = [...files].filter(([, f]) => f.name === name).map(([id]) => ({ id }));
      return Response.json({ files: found });
    }
    if (url.pathname === '/upload/drive/v3/files' && method === 'POST') {
      const meta = JSON.parse(/\r\n\r\n(\{.*?\})\r\n--/s.exec(body)![1]) as { name: string; parents: string[] };
      expect(meta.parents).toEqual(['appDataFolder']);
      const content = body.split('\r\n\r\n')[2].replace(/\r\n--\w+--$/, '');
      const id = `f${files.size + 1}`;
      files.set(id, { name: meta.name, body: content });
      return Response.json({ id });
    }
    const m = /^\/(upload\/)?drive\/v3\/files\/(\w+)$/.exec(url.pathname);
    if (m && method === 'PATCH') {
      files.get(m[2])!.body = body;
      return Response.json({ id: m[2] });
    }
    if (m && method === 'GET' && url.searchParams.get('alt') === 'media') return new Response(files.get(m[2])!.body);
    if (url.pathname === '/drive/v3/about') return Response.json({ user: { emailAddress: 'player@example.com' } });
    return new Response('{}', { status: 404 });
  }) as typeof fetch;
  return { files, calls, drive: new DriveSaves(auth, http) };
}

describe('Google Drive saves', () => {
  it('uploads a slot, then updates the same file, and downloads it back', async () => {
    const { files, calls, drive } = fakeDrive();
    expect(await drive.download(2)).toBeNull();
    const save = defaultSave();
    save.xp = 1234;
    save.ash = 77;
    const at = await drive.upload(save, 2);
    expect(files.size).toBe(1);
    expect([...files.values()][0].name).toBe(slotFile(2));
    save.ash = 99;
    await drive.upload(save, 2);
    expect(files.size).toBe(1);
    expect(calls.filter((c) => c.startsWith('PATCH')).length).toBe(1);
    const got = await drive.download(2);
    expect(got?.save.xp).toBe(1234);
    expect(got?.save.ash).toBe(99);
    expect(got!.at).toBeGreaterThanOrEqual(at);
    // Each slot is its own file.
    expect(await drive.download(1)).toBeNull();
    expect(await drive.account(false)).toBe('player@example.com');
  });

  it('retries once with a fresh token when Google says the old one expired', async () => {
    const { drive } = fakeDrive({ expireFirst: true });
    await drive.upload(defaultSave(), 1);
    expect(await drive.download(1)).not.toBeNull();
  });

  it('refuses files that are not this game’s saves', () => {
    expect(() => parseStored('not json')).toThrow(/damaged/);
    expect(() => parseStored(JSON.stringify({ hello: 1 }))).toThrow(/not a save/);
    const ok = parseStored(JSON.stringify({ game: 'unbound-underworld', v: 1, at: 5, save: { xp: 10 } }));
    expect(ok.at).toBe(5);
    expect(ok.save.xp).toBe(10);
  });

  it('offers the Drive copy only when it is newer and not already seen', () => {
    const local = defaultSave();
    local.lastPlayed = 10_000;
    const cloud = { save: { ...defaultSave(), lastPlayed: 20_000 }, at: 20_500 };
    expect(cloudIsNewer(cloud, local, 0)).toBe(true);
    expect(cloudIsNewer(cloud, local, 20_500)).toBe(false);
    // This device played since (opening the game saves), but the copy changed after its last sync: still offered.
    expect(cloudIsNewer(cloud, { ...local, lastPlayed: 30_000 }, 15_000)).toBe(true);
    // The same save as this device's: nothing to offer.
    expect(cloudIsNewer({ ...cloud, save: { ...cloud.save, lastPlayed: 10_500 } }, local, 0)).toBe(false);
  });
});

describe('backup files', () => {
  it('round-trips a save on one line, ignoring anything a provider left after it', async () => {
    const { backupText, readBackup, backupName } = await import('../src/net/backupfile');
    const save = defaultSave();
    save.xp = 4321;
    const text = backupText(save, 99);
    expect(text.endsWith('\n')).toBe(true);
    expect(text.trim().includes('\n')).toBe(false);
    // A provider that can't truncate leaves the end of a longer, older file behind.
    const got = readBackup(`${text}"leftover":{"from":"an older, longer backup"}}`);
    expect(got.at).toBe(99);
    expect(got.save.xp).toBe(4321);
    expect(() => readBackup('{"nope":1}\n')).toThrow(/isn't a backup/);
    expect(backupName(3)).toBe('unbound-underworld-slot-3.json');
  });
});
