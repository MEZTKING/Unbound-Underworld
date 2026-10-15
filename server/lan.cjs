// Finding games on the same Wi-Fi or hotspot: a host announces itself with a
// small UDP broadcast every second or so, and players looking for games
// listen for those announcements.
'use strict';

const dgram = require('dgram');
const os = require('os');

/** UDP port announcements go to (the game's WebSocket port is 7777). */
const BEACON_PORT = 7778;

/** This machine's LAN addresses (IPv4, not loopback), for "players join at…". */
function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list ?? []) {
      if (a.family === 'IPv4' && !a.internal) out.push({ address: a.address, netmask: a.netmask });
    }
  }
  return out;
}

/** The broadcast address of each LAN (e.g. 192.168.1.255), plus the general one. */
function broadcastAddresses() {
  const out = new Set(['255.255.255.255']);
  for (const { address, netmask } of lanAddresses()) {
    const a = address.split('.').map(Number);
    const m = netmask.split('.').map(Number);
    if (a.length === 4 && m.length === 4) out.add(a.map((x, i) => (x & m[i]) | (~m[i] & 255)).join('.'));
  }
  return [...out];
}

/**
 * Announces a hosted game until stopped. `info()` returns what to announce:
 * { name, port, code, players, max, version }.
 */
function startBeacon(info, every = 1200) {
  const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  let timer = null;
  sock.on('error', () => {});
  sock.bind(() => {
    try {
      sock.setBroadcast(true);
    } catch {
      /* not allowed here */
    }
    const send = () => {
      const msg = Buffer.from(JSON.stringify({ g: 'uu', ...info() }));
      for (const addr of broadcastAddresses()) sock.send(msg, BEACON_PORT, addr, () => {});
    };
    send();
    timer = setInterval(send, every);
  });
  return {
    stop() {
      clearInterval(timer);
      try {
        sock.close();
      } catch {
        /* already closed */
      }
    },
  };
}

/** Listens for game announcements for `ms` and returns the games heard (one per address). */
function discover(ms = 2500) {
  return new Promise((resolve) => {
    const found = new Map();
    const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    const done = () => {
      try {
        sock.close();
      } catch {
        /* already closed */
      }
      resolve([...found.values()]);
    };
    sock.on('error', done);
    sock.on('message', (buf, rinfo) => {
      try {
        const m = JSON.parse(buf.toString('utf8'));
        if (m && m.g === 'uu') found.set(`${rinfo.address}:${m.port}`, { ...m, address: rinfo.address });
      } catch {
        /* not ours */
      }
    });
    sock.bind(BEACON_PORT, () => setTimeout(done, ms));
  });
}

module.exports = { BEACON_PORT, lanAddresses, startBeacon, discover };
