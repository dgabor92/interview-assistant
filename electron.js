const {
  app,
  BrowserWindow,
  ipcMain,
  globalShortcut,
  desktopCapturer,
  nativeImage,
} = require('electron');
const path = require('path');
const axios = require('axios');

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Invisible during screen sharing / recording
  win.setContentProtection(true);

  win.loadURL('http://localhost:5173');
  global.mainWindow = win;
}

// --- Text / LLM ---
ipcMain.on('message', async (event, prompt) => {
  try {
    const response = await axios.post('http://localhost:5001/ask', { prompt });
    event.reply('reply', response.data.result);
  } catch (error) {
    console.error('LLM request error:', error);
    event.reply('reply', '⚠️ Hiba történt az LLM kérés során.');
  }
});

// --- Opacity ---
ipcMain.on('set-opacity', (_event, value) => {
  global.mainWindow?.setOpacity(value);
});

// --- Screenshot capture ---
ipcMain.handle('capture-area', async (_event, opts = {}) => {
  try {
    const { width = 1920, height = 1080 } = opts;
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width, height },
    });
    if (sources.length > 0) {
      return sources[0].thumbnail.toDataURL().split(',')[1];
    }
    return null;
  } catch (err) {
    console.error('Screenshot error:', err);
    return null;
  }
});

// --- Audio: delegate start/stop to Python STT server (sounddevice) ---
ipcMain.on('audio-start', async (_event) => {
  try {
    await axios.post('http://localhost:8766/start');
  } catch (err) {
    console.error('STT start error:', err);
  }
});

ipcMain.on('audio-stop', async (_event) => {
  try {
    await axios.post('http://localhost:8766/stop');
  } catch (err) {
    console.error('STT stop error:', err);
  }
});

app.whenReady().then(() => {
  createWindow();

  // Cmd+Shift+S: snip / screenshot trigger
  globalShortcut.register('CommandOrControl+Shift+S', () => {
    global.mainWindow?.webContents.send('shortcut-snip');
  });

  // Cmd+K: AI prompt trigger
  globalShortcut.register('CommandOrControl+K', () => {
    global.mainWindow?.webContents.send('shortcut-ai-trigger');
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
