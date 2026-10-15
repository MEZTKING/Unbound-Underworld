// Gives the game a small, safe bridge to the desktop shell (update checks only).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  info: () => ipcRenderer.invoke('updates:info'),
  install: () => ipcRenderer.invoke('updates:install'),
  onProgress: (cb) => {
    ipcRenderer.removeAllListeners('updates:progress');
    ipcRenderer.on('updates:progress', (_event, percent) => cb(percent));
  },
});
