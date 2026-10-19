// Gives the game a small, safe bridge to the desktop shell: update checks, the window mode, LAN multiplayer and Google sign-in.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  info: () => ipcRenderer.invoke('updates:info'),
  install: () => ipcRenderer.invoke('updates:install'),
  getWindowMode: () => ipcRenderer.invoke('window:get'),
  setWindowMode: (mode) => ipcRenderer.invoke('window:set', mode),
  onProgress: (cb) => {
    ipcRenderer.removeAllListeners('updates:progress');
    ipcRenderer.on('updates:progress', (_event, percent) => cb(percent));
  },
});

// Multiplayer on the same network: host a game from this PC, or find games nearby.
contextBridge.exposeInMainWorld('uuNet', {
  host: (name) => ipcRenderer.invoke('net:host', name),
  stopHost: () => ipcRenderer.invoke('net:stop'),
  discover: (ms) => ipcRenderer.invoke('net:discover', ms),
});

// Cloud saves in Google Drive: signing in happens in the main process (google.cjs).
// Errors lose Electron's "Error invoking remote method" prefix, so players see Google's reason.
const plain = (p) =>
  p.catch((err) => {
    throw new Error(String(err?.message ?? err).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''));
  });
contextBridge.exposeInMainWorld('uuDrive', {
  available: () => plain(ipcRenderer.invoke('drive:available')),
  signIn: () => plain(ipcRenderer.invoke('drive:signIn')),
  token: () => plain(ipcRenderer.invoke('drive:token')),
  drop: () => plain(ipcRenderer.invoke('drive:drop')),
  signOut: () => plain(ipcRenderer.invoke('drive:signOut')),
});
