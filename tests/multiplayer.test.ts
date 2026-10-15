import { createRequire } from 'node:module';
import http from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { packActions, unpackActions } from '../src/net/protocol';
import { serverUrl } from '../src/net/link';
import { apply, diff, encode, Track } from '../src/net/sync';
import { partyHp } from '../src/game/party';

const require = createRequire(import.meta.url);
const { Relay, serve } = require('../server/relay-core.cjs') as {
  Relay: new (o: object) => { close(): void; rooms: Map<string, unknown> };
  serve: (s: http.Server, r: unknown) => http.Server;
};

// ---------------------------------------------------------------- relay over real sockets

let server: http.Server;
let relay: { close(): void; rooms: Map<string, unknown> };
let port = 0;

beforeAll(async () => {
  relay = new Relay({ name: 'Test', saves: null });
  server = serve(http.createServer(), relay);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  port = (server.address() as { port: number }).port;
});

afterAll(async () => {
  relay.close();
  await new Promise((r) => server.close(r));
});

type Msg = Record<string, unknown> & { t: string };

/** A test client: sends JSON, and waits for messages by type. */
async function client(): Promise<{ ws: WebSocket; send: (m: object) => void; next: (t: string) => Promise<Msg>; close: () => void }> {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  const queue: Msg[] = [];
  const waiting: { t: string; fn: (m: Msg) => void }[] = [];
  ws.onmessage = (e) => {
    const m = JSON.parse(String(e.data)) as Msg;
    const i = waiting.findIndex((w) => w.t === m.t);
    if (i >= 0) waiting.splice(i, 1)[0].fn(m);
    else queue.push(m);
  };
  await new Promise<void>((r, j) => {
    ws.onopen = () => r();
    ws.onerror = () => j(new Error('connect failed'));
  });
  return {
    ws,
    send: (m) => ws.send(JSON.stringify(m)),
    next: (t) =>
      new Promise((resolve, reject) => {
        const i = queue.findIndex((m) => m.t === t);
        if (i >= 0) return resolve(queue.splice(i, 1)[0]);
        const timer = setTimeout(() => reject(new Error(`no ${t}`)), 2000);
        waiting.push({ t, fn: (m) => (clearTimeout(timer), resolve(m)) });
      }),
    close: () => ws.close(),
  };
}

describe('relay server', () => {
  it('opens a room with a code and passes messages both ways', async () => {
    const host = await client();
    host.send({ t: 'host', name: 'Ann', version: '1.0.0' });
    const hosted = await host.next('hosted');
    expect(String(hosted.code)).toMatch(/^[A-Z2-9]{5}$/);
    const guest = await client();
    guest.send({ t: 'join', code: String(hosted.code).toLowerCase(), name: 'Bob', version: '1.0.0' });
    const joined = await guest.next('joined');
    const peer = await host.next('peer');
    expect(peer.name).toBe('Bob');
    expect(joined.peer).toBe(peer.peer);
    host.send({ t: 'to', peer: peer.peer, d: { k: 'hi', big: 'x'.repeat(70_000) } });
    const got = await guest.next('from');
    expect((got.d as { k: string }).k).toBe('hi');
    expect((got.d as { big: string }).big.length).toBe(70_000);
    guest.send({ t: 'to', d: { k: 'back' } });
    expect(((await host.next('from')).d as { k: string }).k).toBe('back');
    host.send({ t: 'all', d: { k: 'everyone' } });
    expect(((await guest.next('from')).d as { k: string }).k).toBe('everyone');
    host.close();
    guest.close();
  });

  it('refuses unknown codes, other versions and a full room', async () => {
    const a = await client();
    a.send({ t: 'join', code: 'ZZZZZ', name: 'X', version: '1.0.0' });
    expect((await a.next('error')).code).toBe('no-room');
    const host = await client();
    host.send({ t: 'host', name: 'H', version: '1.0.0', max: 2 });
    const { code } = await host.next('hosted');
    a.send({ t: 'join', code, name: 'X', version: '0.9.0' });
    expect((await a.next('error')).code).toBe('version');
    a.send({ t: 'join', code, name: 'X', version: '1.0.0' });
    await a.next('joined');
    const b = await client();
    b.send({ t: 'join', code, name: 'Y', version: '1.0.0' });
    expect((await b.next('error')).code).toBe('full');
    for (const c of [a, b, host]) c.close();
  });

  it('keeps a dropped player’s seat for their token', async () => {
    const host = await client();
    host.send({ t: 'host', name: 'H', version: '1' });
    const { code } = await host.next('hosted');
    const g1 = await client();
    g1.send({ t: 'join', code, name: 'Bob', version: '1' });
    const j1 = await g1.next('joined');
    await host.next('peer');
    g1.close();
    const left = await host.next('left');
    expect(left.lost).toBe(true);
    const g2 = await client();
    g2.send({ t: 'join', code, name: 'Bob', version: '1', token: j1.token });
    const j2 = await g2.next('joined');
    expect(j2.rejoin).toBe(true);
    expect(j2.peer).toBe(j1.peer);
    const back = await host.next('peer');
    expect(back.rejoin).toBe(true);
    host.send({ t: 'kick', peer: j2.peer });
    expect((await g2.next('closed')).text).toBeTruthy();
    host.close();
  });

  it('closes the room when the host leaves', async () => {
    const host = await client();
    host.send({ t: 'host', name: 'H', version: '1' });
    const { code } = await host.next('hosted');
    const g = await client();
    g.send({ t: 'join', code, name: 'G', version: '1' });
    await g.next('joined');
    host.send({ t: 'leave' });
    expect((await g.next('closed')).text).toMatch(/ended/);
    expect(relay.rooms.has(String(code))).toBe(false);
    host.close();
  });

  it('stores and returns a synced save by key', async () => {
    const c = await client();
    c.send({ t: 'save-put', key: 'short', data: '{}' });
    expect((await c.next('error')).code).toBe('key');
    c.send({ t: 'save-put', key: 'my-secret-key', data: '{"ash":5}' });
    await c.next('saved');
    c.send({ t: 'save-get', key: 'my-secret-key' });
    const got = await c.next('save');
    expect(got.data).toBe('{"ash":5}');
    c.send({ t: 'save-get', key: 'another-key-1' });
    expect((await c.next('save')).data).toBeNull();
    c.close();
  });
});

// ---------------------------------------------------------------- state sync

describe('state sync', () => {
  class Thing {
    x = 1.23456;
    y = 2;
    name = 'grunt';
    alive = true;
    status = { burn: { t: 1.5 } };
    pts = [{ x: 1, y: 2 }];
    friend: Thing | null = null;
    fn = () => 1;
    set = new Set([1]);
    inf = Infinity;
  }

  it('encodes plain data and leaves out links, functions and sets', () => {
    const t = new Thing();
    t.friend = new Thing();
    const e = encode(t);
    expect(e).toEqual({ x: 1.23, y: 2, name: 'grunt', alive: true, status: { burn: { t: 1.5 } }, pts: [{ x: 1, y: 2 }], inf: 1e9 });
    expect(encode(t, new Set(['status', 'pts']))).not.toHaveProperty('status');
  });

  it('sends only what changed, and applies it without touching live links', () => {
    const a = new Thing();
    const before = encode(a);
    a.x = 5;
    a.status.burn.t = 0.5;
    const d = diff(before, encode(a))!;
    expect(Object.keys(d).sort()).toEqual(['status', 'x']);
    const copy = new Thing();
    const friend = new Thing();
    copy.friend = friend;
    apply(copy, { ...d, friend: null, fn: null } as never);
    expect(copy.x).toBe(5);
    expect(copy.status.burn.t).toBe(0.5);
    expect(copy.friend).toBe(friend);
    expect(typeof copy.fn).toBe('function');
    expect(diff(encode(a), encode(a))).toBeNull();
  });

  it('tracks objects appearing, changing and going', () => {
    const tr = new Track();
    const objs = [{ id: 1, x: 0 }, { id: 2, x: 0 }];
    const first = tr.step(objs, (o) => o.id, (o) => encode(o), () => ({ $n: 'foe' }))!;
    expect(Object.keys(first.add!)).toEqual(['1', '2']);
    expect(first.add![1].$n).toBe('foe');
    objs[0].x = 3;
    const second = tr.step(objs.slice(0, 1), (o) => o.id, (o) => encode(o))!;
    expect(second.upd).toEqual({ 1: { x: 3 } });
    expect(second.del).toEqual([2]);
    expect(tr.step(objs.slice(0, 1), (o) => o.id, (o) => encode(o))).toBeNull();
  });

  it('packs controls into bits and back', () => {
    const bits = packActions((a) => a === 'attack' || a === 'dash' || a === 'artifact3');
    expect([...unpackActions(bits)].sort()).toEqual(['artifact3', 'attack', 'dash']);
  });
});

describe('addresses and party scaling', () => {
  it('turns typed server addresses into WebSocket URLs', () => {
    expect(serverUrl('192.168.1.20')).toBe('ws://192.168.1.20:7777');
    expect(serverUrl('myhost:8080')).toBe('ws://myhost:8080');
    expect(serverUrl('wss://example.com')).toBe('wss://example.com');
    expect(serverUrl('https://example.com/uu')).toBe('wss://example.com/uu');
    expect(serverUrl('')).toBe('');
  });

  it('makes foes tougher for each extra hero', () => {
    expect(partyHp(1)).toBe(1);
    expect(partyHp(2)).toBeCloseTo(1.4);
    expect(partyHp(4)).toBeCloseTo(2.2);
  });
});
