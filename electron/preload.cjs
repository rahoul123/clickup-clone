/**
 * Preload script — exposes a tiny, safe `window.digitech` surface to the
 * renderer. Currently just reports whether we're running inside the desktop
 * shell, so the UI can show Desktop-specific affordances later if needed.
 */
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
});
