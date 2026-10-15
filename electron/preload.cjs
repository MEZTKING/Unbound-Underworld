// Gives the game a small, safe bridge to the desktop shell: update checks and the window mode.
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
