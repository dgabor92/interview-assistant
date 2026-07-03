const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cropAPI', {
  ready: () => ipcRenderer.send('crop-ready'),
  onScreenshot: (cb) => ipcRenderer.on('screenshot', (_e, data) => cb(data)),
  sendResult: (base64) => ipcRenderer.send('crop-result', base64),
  cancel: () => ipcRenderer.send('crop-cancel'),
});
