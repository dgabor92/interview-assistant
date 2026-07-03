const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Text / LLM
  sendMessage: (message) => ipcRenderer.send('message', message),
  onReply: (callback) => ipcRenderer.on('reply', (_event, data) => callback(data)),

  // Opacity
  setOpacity: (value) => ipcRenderer.send('set-opacity', value),

  // Screenshot
  startCapture: (opts) => ipcRenderer.invoke('capture-area', opts),

  // Audio
  audioStart: () => ipcRenderer.send('audio-start'),
  audioStop: () => ipcRenderer.send('audio-stop'),
  sendAudioChunk: (chunkBase64) => ipcRenderer.send('audio-chunk', chunkBase64),
  onAudioRecordingStarted: (callback) =>
    ipcRenderer.on('audio-recording-started', callback),
  onAudioRecordingStopped: (callback) =>
    ipcRenderer.on('audio-recording-stopped', callback),

  // Crop flow
  startCropFlow: () => ipcRenderer.invoke('start-crop-flow'),

  // Shortcuts
  onShortcutSnip: (callback) => ipcRenderer.on('shortcut-snip', callback),
  onShortcutAiTrigger: (callback) =>
    ipcRenderer.on('shortcut-ai-trigger', callback),
});
