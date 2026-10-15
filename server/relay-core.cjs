// Unbound Underworld relay: the meeting point for online games.
//
// The relay only passes messages along. One player's game "hosts": it runs
// the whole simulation and streams it to everyone else, who send back their
// controls. The relay gives each game a room code, forwards messages between
// the host and the other players, lets anyone who drops come back into their
// seat (with the token they were given), and keeps synced saves.
//
// It needs nothing but Node: the WebSocket protocol (RFC 6455) is implemented
// below, text frames only. The same code runs the standalone server
// (server/index.cjs), the Windows app's "Host on this network" and the tests.
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/** Bumped when the relay protocol changes in a way older games can't follow. */
const PROTOCOL = 1;
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
/** Largest message accepted (a synced save is the biggest thing sent). */
const MAX_MESSAGE = 4 * 1024 * 1024;
/** A player who drops keeps their seat this long. */
const PEER_GRACE_MS = 120_000;
/** A host who drops keeps the room open this long. */
const HOST_GRACE_MS = 60_000;
/** Silent connections are closed after this long (pings go out every third of it). */
const IDLE_MS = 45_000;
const MAX_SAVE = 2 * 1024 * 1024;
/** Room codes skip look-alike characters (0/O, 1/I/L). */
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

// ---------------------------------------------------------------- WebSocket

/** One WebSocket connection (server side, text messages). */
class Socket {
  constructor(sock) {
    this.sock = sock;
    this.buf = Buffer.alloc(0);
    this.frags = [];
    this.fragLen = 0;
    this.open = true;
    this.done = false;
    this.lastSeen = Date.now();
    this.onmessage = null;
    this.onclose = null;
    sock.setNoDelay?.(true);
    sock.on('data', (d) => this.feed(d));
    sock.on('close', () => this.finish());
    sock.on('error', () => this.finish());
  }

  feed(d) {
    this.lastSeen = Date.now();
    this.buf = this.buf.length ? Buffer.concat([this.buf, d]) : d;
    while (this.open) {
      const b = this.buf;
      if (b.length < 2) return;
      const fin = (b[0] & 0x80) !== 0;
      const op = b[0] & 0x0f;
      const masked = (b[1] & 0x80) !== 0;
      let len = b[1] & 0x7f;
      let off = 2;
      if (len === 126) {
        if (b.length < 4) return;
        len = b.readUInt16BE(2);
        off = 4;
      } else if (len === 127) {
        if (b.length < 10) return;
        len = b.readUInt32BE(2) * 2 ** 32 + b.readUInt32BE(6);
        off = 10;
      }
      if (len > MAX_MESSAGE) return this.close(1009);
      // Browsers always mask what they send; anything else isn't a browser.
      if (!masked) return this.close(1002);
      if (b.length < off + 4 + len) return;
      const mask = b.subarray(off, off + 4);
      off += 4;
      const data = Buffer.from(b.subarray(off, off + len));
      for (let i = 0; i < len; i++) data[i] ^= mask[i & 3];
      this.buf = b.subarray(off + len);
      if (op === 0x8) return this.close(1000);
      if (op === 0x9) {
        this.frame(0xa, data);
        continue;
      }
      if (op === 0xa) continue;
      if (op !== 0x0 && op !== 0x1 && op !== 0x2) return this.close(1002);
      this.fragLen += len;
      if (this.fragLen > MAX_MESSAGE) return this.close(1009);
      this.frags.push(data);
      if (!fin) continue;
      const text = Buffer.concat(this.frags).toString('utf8');
      this.frags = [];
      this.fragLen = 0;
      try {
        this.onmessage?.(text);
      } catch (err) {
        console.error('relay: message handler failed', err);
      }
    }
  }

  frame(op, data) {
    if (!this.open) return;
    const len = data.length;
    let head;
    if (len < 126) head = Buffer.from([0x80 | op, len]);
    else if (len < 65536) {
      head = Buffer.alloc(4);
      head[0] = 0x80 | op;
      head[1] = 126;
      head.writeUInt16BE(len, 2);
    } else {
      head = Buffer.alloc(10);
      head[0] = 0x80 | op;
      head[1] = 127;
      head.writeUInt32BE(Math.floor(len / 2 ** 32), 2);
      head.writeUInt32BE(len >>> 0, 6);
    }
    this.sock.write(Buffer.concat([head, data]));
  }

  send(obj) {
    if (this.open) this.frame(0x1, Buffer.from(typeof obj === 'string' ? obj : JSON.stringify(obj), 'utf8'));
  }

  ping() {
    this.frame(0x9, Buffer.alloc(0));
  }

  close(code = 1000) {
    if (!this.open) return;
    const data = Buffer.alloc(2);
    data.writeUInt16BE(code, 0);
    try {
      this.frame(0x8, data);
    } catch {
      /* already gone */
    }
    this.open = false;
    this.sock.end();
    setTimeout(() => this.finish(), 1000).unref?.();
  }

  finish() {
    if (this.done) return;
    this.done = true;
    this.open = false;
    this.sock.destroy();
    this.onclose?.();
  }
}

/** Completes a WebSocket handshake on an HTTP upgrade request. */
function acceptUpgrade(req, sock, head) {
  const key = req.headers['sec-websocket-key'];
  if (!key || String(req.headers.upgrade || '').toLowerCase() !== 'websocket') {
    sock.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
    return null;
  }
  const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
  sock.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  const ws = new Socket(sock);
  return { ws, head };
}

// ---------------------------------------------------------------- saves

/** Synced saves, by a hash of the player's sync key: on disk when a folder is given, else in memory. */
class SaveStore {
  constructor(dir) {
    this.dir = dir || null;
    this.mem = new Map();
    if (this.dir) fs.mkdirSync(this.dir, { recursive: true });
  }

  id(key) {
    return crypto.createHash('sha256').update(`uu-save:${key}`).digest('hex');
  }

  put(key, data) {
    const rec = JSON.stringify({ at: Date.now(), data });
    const id = this.id(key);
    if (this.dir) fs.writeFileSync(path.join(this.dir, `${id}.json`), rec);
    else this.mem.set(id, rec);
    return true;
  }

  get(key) {
    const id = this.id(key);
    let rec = null;
    if (this.dir) {
      const f = path.join(this.dir, `${id}.json`);
      if (fs.existsSync(f)) rec = fs.readFileSync(f, 'utf8');
    } else rec = this.mem.get(id) ?? null;
    return rec ? JSON.parse(rec) : null;
  }
}

// ---------------------------------------------------------------- relay

function token() {
  return crypto.randomBytes(12).toString('base64url');
}

function cleanName(s, fallback) {
  const t = String(s ?? '')
    .replace(/[\u0000-\u001f<>]/g, '')
    .trim()
    .slice(0, 24);
  return t || fallback;
}

/**
 * The relay itself: rooms, seats and message routing. Give it connections
 * with `attach(ws)`; it works with anything that has send/close and
 * onmessage/onclose (the Socket above, or a test double).
 */
class Relay {
  constructor(opts = {}) {
    this.name = cleanName(opts.name, 'Unbound Underworld server');
    this.saves = opts.saves === false ? null : new SaveStore(opts.saves || null);
    this.maxRooms = opts.maxRooms ?? 200;
    this.log = opts.log ?? (() => {});
    /** LAN hosting: a join without a code goes to the only room. */
    this.lan = !!opts.lan;
    this.rooms = new Map();
    this.conns = new Set();
    this.onChange = opts.onChange ?? null;
  }

  info() {
    let players = 0;
    for (const r of this.rooms.values()) players += r.seats.size + (r.host ? 1 : 0);
    return { game: 'unbound-underworld', protocol: PROTOCOL, name: this.name, rooms: this.rooms.size, players, saves: !!this.saves };
  }

  /** The rooms anyone may see (LAN listing). */
  listing() {
    return [...this.rooms.values()].map((r) => ({ code: r.code, name: r.name, version: r.version, players: 1 + [...r.seats.values()].filter((s) => s.conn).length, max: r.max }));
  }

  attach(ws) {
    const c = { ws, room: null, peer: -1 };
    this.conns.add(c);
    ws.onmessage = (text) => {
      let m;
      try {
        m = JSON.parse(text);
      } catch {
        return;
      }
      if (m && typeof m === 'object' && typeof m.t === 'string') this.handle(c, m);
    };
    ws.onclose = () => this.dropped(c);
    return c;
  }

  newCode() {
    for (;;) {
      let code = '';
      for (let i = 0; i < 5; i++) code += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
      if (!this.rooms.has(code)) return code;
    }
  }

  handle(c, m) {
    switch (m.t) {
      case 'ping':
        c.ws.send({ t: 'pong', n: m.n });
        return;
      case 'info':
        c.ws.send({ t: 'info', ...this.info(), list: this.listing() });
        return;
      case 'host':
        return this.host(c, m);
      case 'join':
        return this.join(c, m);
      case 'to':
      case 'all':
        return this.route(c, m);
      case 'kick':
        return this.kick(c, m);
      case 'lock':
        if (c.room && c.peer === 0) c.room.locked = !!m.on;
        return;
      case 'leave':
        return this.leave(c);
      case 'save-put':
        return this.savePut(c, m);
      case 'save-get':
        return this.saveGet(c, m);
      default:
        return;
    }
  }

  host(c, m) {
    if (c.room) return c.ws.send({ t: 'error', code: 'busy', text: 'Already in a game.' });
    // A host coming back after a drop takes their room back.
    if (typeof m.code === 'string' && typeof m.token === 'string') {
      const r = this.rooms.get(m.code.toUpperCase());
      if (r && r.hostToken === m.token) {
        clearTimeout(r.hostTimer);
        r.host = c;
        c.room = r;
        c.peer = 0;
        c.ws.send({ t: 'hosted', code: r.code, token: r.hostToken, rejoin: true, peers: [...r.seats.entries()].map(([peer, s]) => ({ peer, name: s.name, online: !!s.conn })) });
        for (const s of r.seats.values()) s.conn?.ws.send({ t: 'host-back' });
        this.log(`room ${r.code}: host back`);
        return;
      }
    }
    if (this.rooms.size >= this.maxRooms) return c.ws.send({ t: 'error', code: 'full', text: 'This server has no room for another game.' });
    const r = {
      code: this.newCode(),
      name: cleanName(m.name, 'A game'),
      version: String(m.version ?? ''),
      max: Math.max(2, Math.min(4, Number(m.max) || 4)),
      host: c,
      hostToken: token(),
      hostTimer: null,
      seats: new Map(),
      nextPeer: 1,
      locked: false,
    };
    this.rooms.set(r.code, r);
    c.room = r;
    c.peer = 0;
    c.ws.send({ t: 'hosted', code: r.code, token: r.hostToken, protocol: PROTOCOL });
    this.log(`room ${r.code}: opened by ${r.name}`);
    this.onChange?.();
  }

  join(c, m) {
    if (c.room) return c.ws.send({ t: 'error', code: 'busy', text: 'Already in a game.' });
    let code = typeof m.code === 'string' ? m.code.trim().toUpperCase() : '';
    if (!code && this.lan && this.rooms.size === 1) code = [...this.rooms.keys()][0];
    const r = this.rooms.get(code);
    if (!r) return c.ws.send({ t: 'error', code: 'no-room', text: code ? `No game with the code ${code}.` : 'No game is hosted here yet.' });
    if (r.version && m.version && r.version !== m.version) {
      return c.ws.send({ t: 'error', code: 'version', text: `The host plays v${r.version} and you have v${m.version}. Both need the same version.` });
    }
    const name = cleanName(m.name, 'Player');
    // Coming back into a seat kept after a drop.
    if (typeof m.token === 'string') {
      for (const [peer, s] of r.seats) {
        if (s.token !== m.token) continue;
        clearTimeout(s.timer);
        if (s.conn && s.conn !== c) {
          s.conn.room = null;
          s.conn.ws.close(4000);
        }
        s.conn = c;
        c.room = r;
        c.peer = peer;
        c.ws.send({ t: 'joined', code: r.code, peer, token: s.token, rejoin: true, name: r.name, hostAway: !r.host });
        r.host?.ws.send({ t: 'peer', peer, name: s.name, rejoin: true });
        this.log(`room ${r.code}: ${s.name} back`);
        return;
      }
    }
    if (r.locked) return c.ws.send({ t: 'error', code: 'locked', text: 'That game is not taking new players.' });
    if (1 + r.seats.size >= r.max) return c.ws.send({ t: 'error', code: 'full', text: 'That game is full.' });
    if (!r.host) return c.ws.send({ t: 'error', code: 'host-away', text: 'The host is reconnecting. Try again in a moment.' });
    const peer = r.nextPeer++;
    const seat = { name, token: token(), conn: c, timer: null };
    r.seats.set(peer, seat);
    c.room = r;
    c.peer = peer;
    c.ws.send({ t: 'joined', code: r.code, peer, token: seat.token, name: r.name });
    r.host.ws.send({ t: 'peer', peer, name });
    this.log(`room ${r.code}: ${name} joined`);
    this.onChange?.();
  }

  route(c, m) {
    const r = c.room;
    if (!r) return;
    const text = JSON.stringify({ t: 'from', peer: c.peer, d: m.d });
    if (c.peer === 0) {
      if (m.t === 'all') {
        for (const [peer, s] of r.seats) if (s.conn && peer !== m.except) s.conn.ws.send(text);
      } else r.seats.get(Number(m.peer))?.conn?.ws.send(text);
    } else r.host?.ws.send(text);
  }

  kick(c, m) {
    const r = c.room;
    if (!r || c.peer !== 0) return;
    const peer = Number(m.peer);
    const s = r.seats.get(peer);
    if (!s) return;
    r.seats.delete(peer);
    clearTimeout(s.timer);
    if (s.conn) {
      s.conn.ws.send({ t: 'closed', text: cleanName(m.text, 'The host removed you from the game.') });
      s.conn.room = null;
      s.conn.ws.close(1000);
    }
    this.onChange?.();
  }

  leave(c) {
    const r = c.room;
    if (!r) return;
    if (c.peer === 0) this.closeRoom(r, 'The host ended the game.');
    else {
      const s = r.seats.get(c.peer);
      r.seats.delete(c.peer);
      clearTimeout(s?.timer);
      r.host?.ws.send({ t: 'left', peer: c.peer, gone: true });
      this.log(`room ${r.code}: ${s?.name} left`);
    }
    c.room = null;
    c.peer = -1;
    this.onChange?.();
  }

  closeRoom(r, text) {
    clearTimeout(r.hostTimer);
    for (const s of r.seats.values()) {
      clearTimeout(s.timer);
      if (s.conn) {
        s.conn.ws.send({ t: 'closed', text });
        s.conn.room = null;
        s.conn.ws.close(1000);
      }
    }
    if (r.host) r.host.room = null;
    this.rooms.delete(r.code);
    this.log(`room ${r.code}: closed (${text})`);
    this.onChange?.();
  }

  dropped(c) {
    this.conns.delete(c);
    const r = c.room;
    if (!r) return;
    if (c.peer === 0) {
      if (r.host !== c) return;
      r.host = null;
      for (const s of r.seats.values()) s.conn?.ws.send({ t: 'host-lost' });
      r.hostTimer = setTimeout(() => this.closeRoom(r, 'The host lost their connection.'), HOST_GRACE_MS);
      r.hostTimer.unref?.();
      this.log(`room ${r.code}: host dropped`);
      return;
    }
    const s = r.seats.get(c.peer);
    if (!s || s.conn !== c) return;
    s.conn = null;
    r.host?.ws.send({ t: 'left', peer: c.peer, lost: true });
    s.timer = setTimeout(() => {
      r.seats.delete(c.peer);
      r.host?.ws.send({ t: 'left', peer: c.peer, gone: true });
      this.onChange?.();
    }, PEER_GRACE_MS);
    s.timer.unref?.();
    this.log(`room ${r.code}: ${s.name} dropped`);
  }

  savePut(c, m) {
    if (!this.saves) return c.ws.send({ t: 'error', code: 'no-saves', text: 'This server does not keep saves.' });
    const key = String(m.key ?? '');
    if (key.length < 8 || key.length > 128) return c.ws.send({ t: 'error', code: 'key', text: 'A sync key needs at least 8 characters.' });
    const data = typeof m.data === 'string' ? m.data : '';
    if (!data || data.length > MAX_SAVE) return c.ws.send({ t: 'error', code: 'save-size', text: 'That save is too large to sync.' });
    try {
      this.saves.put(key, data);
      c.ws.send({ t: 'saved', at: Date.now() });
    } catch (err) {
      this.log(`save failed: ${err.message}`);
      c.ws.send({ t: 'error', code: 'save-failed', text: 'The server could not store the save.' });
    }
  }

  saveGet(c, m) {
    if (!this.saves) return c.ws.send({ t: 'error', code: 'no-saves', text: 'This server does not keep saves.' });
    const key = String(m.key ?? '');
    if (key.length < 8 || key.length > 128) return c.ws.send({ t: 'error', code: 'key', text: 'A sync key needs at least 8 characters.' });
    const rec = this.saves.get(key);
    c.ws.send({ t: 'save', data: rec?.data ?? null, at: rec?.at ?? 0 });
  }

  /** Pings quiet connections and closes dead ones (call every few seconds). */
  sweep() {
    const now = Date.now();
    for (const c of this.conns) {
      const ws = c.ws;
      if (!ws.lastSeen) continue;
      if (now - ws.lastSeen > IDLE_MS) ws.close(1001);
      else if (now - ws.lastSeen > IDLE_MS / 3) ws.ping?.();
    }
  }

  close() {
    for (const r of [...this.rooms.values()]) this.closeRoom(r, 'The server is shutting down.');
    for (const c of this.conns) c.ws.close(1001);
  }
}

/**
 * Serves the relay on an http(s) server: WebSocket upgrades go to the relay,
 * and GET /info answers with what this server is (the game's "Test" button).
 */
function serve(server, relay) {
  server.on('upgrade', (req, sock, head) => {
    const up = acceptUpgrade(req, sock, head);
    if (!up) return;
    relay.attach(up.ws);
    if (up.head && up.head.length) up.ws.feed(up.head);
  });
  server.on('request', (req, res) => {
    const headers = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' };
    if (req.url === '/info' || req.url === '/info/') {
      res.writeHead(200, { ...headers, 'Content-Type': 'application/json' });
      res.end(JSON.stringify(relay.info()));
      return;
    }
    res.writeHead(200, { ...headers, 'Content-Type': 'text/plain; charset=utf-8' });
    const i = relay.info();
    res.end(`${i.name}\nAn Unbound Underworld game server: open the game, choose Multiplayer, and enter this address.\nGames running: ${i.rooms} · players: ${i.players}\n`);
  });
  const timer = setInterval(() => relay.sweep(), 5000);
  timer.unref?.();
  server.on('close', () => clearInterval(timer));
  return server;
}

module.exports = { Relay, SaveStore, Socket, acceptUpgrade, serve, PROTOCOL, PEER_GRACE_MS, HOST_GRACE_MS };
