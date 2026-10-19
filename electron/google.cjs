// Google sign-in for cloud saves in the desktop app (the Drive calls themselves
// are in src/net/gdrive.ts). It follows Google's flow for installed apps: the
// system browser signs in and hands a one-time code to a short-lived server on
// 127.0.0.1, and the code is swapped for tokens (with PKCE). The refresh token
// stays in the app's user data folder, encrypted by the OS where it can be.
const { app, BrowserWindow, ipcMain, safeStorage, shell } = require('electron');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

/**
 * The Google Cloud project's "Desktop app" client. Release builds get it from
 * google.json, written by the build workflow; when running from source, set
 * UU_GOOGLE_CLIENT_ID and UU_GOOGLE_CLIENT_SECRET instead.
 */
function config() {
  try {
    const c = JSON.parse(fs.readFileSync(path.join(__dirname, 'google.json'), 'utf8'));
    if (c.clientId && c.clientSecret) return { id: String(c.clientId), secret: String(c.clientSecret) };
  } catch {
    /* not bundled */
  }
  const id = process.env.UU_GOOGLE_CLIENT_ID;
  const secret = process.env.UU_GOOGLE_CLIENT_SECRET;
  return id && secret ? { id, secret } : null;
}

const tokenFile = () => path.join(app.getPath('userData'), 'google-signin.bin');

function readRefresh() {
  try {
    const raw = fs.readFileSync(tokenFile());
    if (raw[0] === 0x7b) return JSON.parse(raw.toString('utf8')).refresh || null; // stored as plain JSON
    return safeStorage.isEncryptionAvailable() ? JSON.parse(safeStorage.decryptString(raw)).refresh || null : null;
  } catch {
    return null;
  }
}

function writeRefresh(refresh) {
  const json = JSON.stringify({ refresh });
  // Without an OS keyring (some Linux desktops) it's kept as plain text in the user's own profile.
  const data = safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(json) : Buffer.from(json, 'utf8');
  fs.writeFileSync(tokenFile(), data, { mode: 0o600 });
}

function forget() {
  access = { token: '', until: 0 };
  try {
    fs.rmSync(tokenFile(), { force: true });
  } catch {
    /* already gone */
  }
}

let access = { token: '', until: 0 };

async function tokenRequest(params) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.error_description || body.error || `Google refused the sign-in (HTTP ${res.status}).`);
    err.code = body.error;
    throw err;
  }
  return body;
}

const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const PAGE = (title, text) =>
  `<!doctype html><meta charset="utf-8"><title>${title}</title><body style="background:#07050a;color:#e8dcc8;font:18px Georgia,serif;display:grid;place-items:center;height:90vh;text-align:center"><div><h1 style="color:#e0b050">${title}</h1><p>${text}</p></div>`;

let pending = null;

/** Opens Google's sign-in in the browser and waits for it to come back. */
function signIn() {
  pending ??= runSignIn().finally(() => (pending = null));
  return pending;
}

async function runSignIn() {
  const c = config();
  if (!c) throw new Error('Google Drive sync is not set up in this build.');
  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  const state = b64url(crypto.randomBytes(16));
  const server = http.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const redirect = `http://127.0.0.1:${server.address().port}`;
  try {
    const code = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Google sign-in timed out. Try again.')), 5 * 60 * 1000);
      server.on('request', (req, res) => {
        const u = new URL(req.url || '/', redirect);
        if (u.pathname !== '/' || u.searchParams.get('state') !== state) {
          res.writeHead(404).end();
          return;
        }
        const error = u.searchParams.get('error');
        const got = u.searchParams.get('code');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(got ? PAGE('Signed in', 'You can close this tab and go back to Unbound Underworld.') : PAGE('Not signed in', 'Google sign-in was cancelled. You can close this tab.'));
        clearTimeout(timer);
        if (got) resolve(got);
        else reject(new Error(error === 'access_denied' ? 'Google sign-in was cancelled.' : `Google sign-in failed (${error || 'no code'}).`));
      });
      const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      url.search = new URLSearchParams({
        client_id: c.id,
        redirect_uri: redirect,
        response_type: 'code',
        scope: SCOPE,
        code_challenge: challenge,
        code_challenge_method: 'S256',
        state,
        access_type: 'offline',
        prompt: 'consent',
      }).toString();
      shell.openExternal(url.toString()).catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
    const t = await tokenRequest({ code, client_id: c.id, client_secret: c.secret, redirect_uri: redirect, grant_type: 'authorization_code', code_verifier: verifier });
    if (!t.refresh_token) throw new Error('Google did not keep the sign-in. Try again.');
    writeRefresh(t.refresh_token);
    access = { token: t.access_token, until: Date.now() + (t.expires_in || 3600) * 1000 };
  } finally {
    server.close();
    const [win] = BrowserWindow.getAllWindows();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  }
}

/** A current access token, refreshed when needed; null when not signed in. */
async function token() {
  if (access.token && access.until > Date.now() + 60000) return access.token;
  const c = config();
  const refresh = readRefresh();
  if (!c || !refresh) return null;
  try {
    const t = await tokenRequest({ refresh_token: refresh, client_id: c.id, client_secret: c.secret, grant_type: 'refresh_token' });
    access = { token: t.access_token, until: Date.now() + (t.expires_in || 3600) * 1000 };
    return access.token;
  } catch (err) {
    // The player removed the game's access in their Google account, or the sign-in ran out.
    if (err.code === 'invalid_grant') {
      forget();
      return null;
    }
    throw err;
  }
}

async function signOut() {
  const refresh = readRefresh();
  forget();
  if (refresh) {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refresh)}`, { method: 'POST' }).catch(() => undefined);
  }
}

function registerGoogle() {
  ipcMain.handle('drive:available', () => !!config());
  ipcMain.handle('drive:signIn', () => signIn());
  ipcMain.handle('drive:token', () => token());
  ipcMain.handle('drive:drop', () => {
    access = { token: '', until: 0 };
  });
  ipcMain.handle('drive:signOut', () => signOut());
}

module.exports = { registerGoogle };
