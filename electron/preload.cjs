// Gives the game a small, safe bridge to the desktop shell: update checks, the window mode and LAN multiplayer.
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
