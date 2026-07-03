const {
  app,
  BrowserWindow,
  ipcMain,
  globalShortcut,
  desktopCapturer,
  nativeImage,
  screen,
} = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const axios = require('axios');

function createWindow() {
  const { width: screenW } = screen.getPrimaryDisplay().workAreaSize;
  const winW = 720;
  const winH = 520;

  const win = new BrowserWindow({
    width: winW,
    height: winH,
    x: screenW - winW - 20,
    y: 20,
    alwaysOnTop: true,
    frame: false,
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 8, y: 8 },
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

function createCropWindow(screenshotBase64, onResult) {
  const { width, height } = screen.getPrimaryDisplay().bounds;

  const cropWin = new BrowserWindow({
    x: 0, y: 0, width, height,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    webPreferences: {
      preload: path.join(__dirname, 'crop-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  cropWin.loadFile(path.join(__dirname, 'crop.html'));
  cropWin.setIgnoreMouseEvents(false);

  // Inject screenshot after DOM is ready -- most reliable method
  cropWin.webContents.once('did-finish-load', () => {
    if (screenshotBase64 && !cropWin.isDestroyed()) {
      cropWin.webContents.executeJavaScript(
        `document.getElementById('bg').src = 'data:image/png;base64,${screenshotBase64}';`
      ).catch(console.error);
    }
  });

  let settled = false;
  const safeClose = () => { if (!cropWin.isDestroyed()) cropWin.close(); };

  const onResult_ = (_event, base64) => {
    if (settled) return; settled = true;
    ipcMain.removeListener('crop-cancel', onCancel_);
    safeClose();
    onResult(base64);
  };
  const onCancel_ = () => {
    if (settled) return; settled = true;
    ipcMain.removeListener('crop-result', onResult_);
    safeClose();
    onResult(null);
  };

  ipcMain.once('crop-result', onResult_);
  ipcMain.once('crop-cancel', onCancel_);

  cropWin.on('closed', () => {
    if (!settled) { settled = true; onResult(null); }
    ipcMain.removeListener('crop-result', onResult_);
    ipcMain.removeListener('crop-cancel', onCancel_);
  });

  return cropWin;
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

// --- Screenshot capture (full screen, for direct AI use) ---
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

// --- Crop flow: fullscreen overlay window ---
ipcMain.handle('start-crop-flow', async () => {
  const { width, height } = screen.getPrimaryDisplay().bounds;
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width, height },
  });
  const screenshotBase64 = sources.length > 0 ? sources[0].thumbnail.toDataURL().split(',')[1] : null;

  return new Promise((resolve) => {
    createCropWindow(screenshotBase64, (croppedBase64) => {
      resolve(croppedBase64 ? { screenshot: screenshotBase64, cropped: croppedBase64 } : null);
    });
  });
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
