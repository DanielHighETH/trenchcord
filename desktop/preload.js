const { contextBridge, ipcRenderer } = require('electron');

// Bridge for chat popout windows. Presence of `window.trenchcord` is how the
// renderer detects that it's running in the desktop app with popout support.
contextBridge.exposeInMainWorld('trenchcord', {
  // `seed` is a snapshot of the room's already-loaded messages, handed to the
  // popout so it shows existing history immediately instead of starting blank.
  openPopout: (roomId, title, seed) => ipcRenderer.invoke('popout:open', { roomId, title, seed }),
  getPopoutSeed: (roomId) => ipcRenderer.invoke('popout:getSeed', roomId),
  onPopoutClosed: (callback) => {
    const listener = (_event, roomId) => callback(roomId);
    ipcRenderer.on('popout:closed', listener);
    return () => ipcRenderer.removeListener('popout:closed', listener);
  },
});
