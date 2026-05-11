const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('digitech', {
  isDesktop: true,
  notify: (payload) => ipcRenderer.invoke('desktop:notify', payload),
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
  // Update handlers
  onUpdateReady: (callback) => ipcRenderer.on('update:ready', (_e, info) => callback(info)),
  installUpdate: () => ipcRenderer.send('update:install'),
  dismissUpdate: () => ipcRenderer.send('update:dismiss'),
});