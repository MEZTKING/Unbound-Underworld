#!/usr/bin/env node
// Unbound Underworld game server: run it on any machine with Node 18+ to play
// online with room codes. No packages to install.
//
//   node server/index.cjs                      # ws://<this machine>:7777
//   node server/index.cjs --port 8080 --name "Friday night"
//   node server/index.cjs --cert cert.pem --key key.pem   # wss:// (needed by the web version)
//
// Options:
//   --port <n>        port to listen on (default 7777, or $PORT)
//   --bind <addr>     address to listen on (default 0.0.0.0: every network)
//   --name <text>     the server's name, shown to players
//   --saves <dir>     where synced saves are kept (default ./saves)
//   --no-saves        don't keep synced saves
//   --cert / --key    TLS certificate and key files (PEM) for wss://
//   --lan             also announce games to players on the same network
//   --max-rooms <n>   most games at once (default 200)
//   --quiet           don't log rooms opening and closing
'use strict';

const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');
const { Relay, serve } = require('./relay-core.cjs');
const { lanAddresses, startBeacon } = require('./lan.cjs');

function parseArgs(argv) {
  const out = { port: Number(process.env.PORT) || 7777, bind: '0.0.0.0', name: '', saves: path.resolve('saves'), cert: '', key: '', lan: false, maxRooms: 200, quiet: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--port') out.port = Number(next());
    else if (a === '--bind') out.bind = next();
    else if (a === '--name') out.name = next();
    else if (a === '--saves') out.saves = path.resolve(next());
    else if (a === '--no-saves') out.saves = false;
    else if (a === '--cert') out.cert = next();
    else if (a === '--key') out.key = next();
    else if (a === '--lan') out.lan = true;
    else if (a === '--max-rooms') out.maxRooms = Number(next());
    else if (a === '--quiet') out.quiet = true;
    else if (a === '--help' || a === '-h') {
      console.log(fs.readFileSync(__filename, 'utf8').split('\n').filter((l) => l.startsWith('//')).map((l) => l.slice(3)).join('\n'));
      process.exit(0);
    } else {
      console.error(`Unknown option: ${a} (try --help)`);
      process.exit(1);
    }
  }
  return out;
}

const opts = parseArgs(process.argv.slice(2));
const log = (s) => {
  if (!opts.quiet) console.log(`[${new Date().toISOString()}] ${s}`);
};
const relay = new Relay({ name: opts.name || `${require('os').hostname()}'s server`, saves: opts.saves, maxRooms: opts.maxRooms, log, lan: false });
const tls = !!(opts.cert && opts.key);
const server = tls ? https.createServer({ cert: fs.readFileSync(opts.cert), key: fs.readFileSync(opts.key) }) : http.createServer();
serve(server, relay);

server.listen(opts.port, opts.bind, () => {
  const scheme = tls ? 'wss' : 'ws';
  console.log(`Unbound Underworld server "${relay.name}" is running.`);
  console.log(`Players enter one of these addresses under Multiplayer → Online:`);
  for (const { address } of lanAddresses()) console.log(`  ${scheme}://${address}:${opts.port}`);
  console.log(`  (from the internet: your public address or domain, with port ${opts.port} forwarded to this machine)`);
  if (!tls) console.log('The web version (https) can only reach wss:// servers: add --cert and --key, or put the server behind a TLS proxy.');
  console.log(opts.saves ? `Synced saves are kept in ${opts.saves}` : 'Save sync is off.');
});

let beacon = null;
if (opts.lan) {
  beacon = startBeacon(() => {
    const list = relay.listing();
    return { name: relay.name, port: opts.port, tls, code: list.length === 1 ? list[0].code : '', rooms: list.length, players: list.reduce((n, r) => n + r.players, 0), server: true };
  });
}

function shutdown() {
  console.log('Shutting down…');
  beacon?.stop();
  relay.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
