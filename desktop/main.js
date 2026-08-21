const { app, BrowserWindow, dialog, utilityProcess, shell, ipcMain, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const net = require('net');

const isDev = !app.isPackaged;

// Chromium's bundled ffmpeg spams stderr with "Unsupported pixel format: -1"
// while probing some Tenor/Giphy/Discord video streams — the media decodes and
// plays fine, so silence Chromium-internal logging. Set ELECTRON_ENABLE_LOGGING
// to get it back when debugging.
if (!process.env.ELECTRON_ENABLE_LOGGING) {
  app.commandLine.appendSwitch('disable-logging');
}

// Stable default so the renderer origin (scheme+host+port) — and therefore its
// localStorage — survives restarts.
const DEFAULT_BACKEND_PORT = 47853;

let backendProcess = null;
let mainWindow = null;
let backendPort = DEFAULT_BACKEND_PORT;
// Base URL the app loads from (Vite dev server or the local backend). Popout
// windows reuse this so they share the main window's origin (and localStorage).
let appBaseUrl = null;
// Popout windows keyed by roomId, so we can focus an existing one and notify the
// main window when a popout closes (to re-dock the chat).
const popoutWindows = new Map();
// Snapshot of already-loaded messages handed off from the main window to a
// popout at open time, consumed once by the popout renderer on load.
const popoutSeeds = new Map();

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function portFilePath() {
  return path.join(app.getPath('userData'), 'backend-port');
}

function readSavedPort() {
  try {
    const n = parseInt(fs.readFileSync(portFilePath(), 'utf8').trim(), 10);
    return Number.isInteger(n) && n > 0 && n < 65536 ? n : null;
  } catch {
    return null;
  }
}

function savePort(port) {
  try {
    fs.writeFileSync(portFilePath(), String(port));
  } catch {
    /* ignore */
  }
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.unref();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => srv.close(() => resolve(true)));
    srv.listen(port, '127.0.0.1');
  });
}

// Reuse the same backend port across launches so the renderer keeps a stable
// origin (needed for localStorage to persist, e.g. dismissed announcements).
// Fall back to a fresh port only when the preferred one is taken.
async function resolveBackendPort() {
  const preferred = readSavedPort() || DEFAULT_BACKEND_PORT;
  const port = (await isPortFree(preferred)) ? preferred : await getFreePort();
  savePort(port);
  return port;
}

function backendEntry() {
  return isDev
    ? path.join(__dirname, 'dist-backend', 'index.mjs')
    : path.join(process.resourcesPath, 'backend', 'dist', 'index.mjs');
}

function frontendDist() {
  return isDev
    ? path.join(__dirname, '..', 'frontend', 'dist')
    : path.join(process.resourcesPath, 'frontend', 'dist');
}

function startBackend(port) {
  backendProcess = utilityProcess.fork(backendEntry(), [], {
    serviceName: 'trenchcord-backend',
    stdio: 'pipe',
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'production',
      TRENCHCORD_DATA_DIR: app.getPath('userData'),
      TRENCHCORD_FRONTEND_DIST: frontendDist(),
      // Official desktop builds require a linked account with an active
      // subscription. Self-hosted/source builds are not gated by default.
      TRENCHCORD_REQUIRE_SUBSCRIPTION: '1',
    },
  });
  backendProcess.stdout?.on('data', (d) => process.stdout.write(`[backend] ${d}`));
  backendProcess.stderr?.on('data', (d) => process.stderr.write(`[backend] ${d}`));
  backendProcess.on('exit', (code) => {
    console.log(`[desktop] backend process exited (code ${code})`);
    backendProcess = null;
  });
}

function waitForHealth(port, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const retry = () => {
      if (Date.now() > deadline) {
        reject(new Error('Backend did not become healthy in time.'));
      } else {
        setTimeout(attempt, 300);
      }
    };
    const attempt = () => {
      const req = http.get(
        { host: '127.0.0.1', port, path: '/health', timeout: 2000 },
        (res) => {
          res.resume();
          if (res.statusCode === 200) resolve();
          else retry();
        },
      );
      req.on('error', retry);
      req.on('timeout', () => {
        req.destroy();
        retry();
      });
    };
    attempt();
  });
}

function createWindow(url) {
  appBaseUrl = url;
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: '#0b0b0f',
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    shell.openExternal(target);
    return { action: 'deny' };
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => {
    mainWindow = null;
    // Closing the main window tears down its popouts too, so the app fully quits
    // via the window-all-closed handler.
    for (const win of popoutWindows.values()) {
      if (!win.isDestroyed()) win.close();
    }
    popoutWindows.clear();
  });
  mainWindow.loadURL(url);
}

function createPopoutWindow(roomId, title) {
  const existing = popoutWindows.get(roomId);
  if (existing && !existing.isDestroyed()) {
    existing.focus();
    return;
  }
  if (!appBaseUrl) return;

  const win = new BrowserWindow({
    width: 520,
    height: 720,
    backgroundColor: '#0b0b0f',
    title: title || 'Trenchcord',
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  win.webContents.setWindowOpenHandler(({ url: target }) => {
    shell.openExternal(target);
    return { action: 'deny' };
  });

  win.once('ready-to-show', () => win.show());
  win.on('closed', () => {
    popoutWindows.delete(roomId);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('popout:closed', roomId);
    }
  });

  popoutWindows.set(roomId, win);

  const params = new URLSearchParams({ popout: '1', roomId });
  if (title) params.set('title', title);
  const sep = appBaseUrl.includes('?') ? '&' : '?';
  win.loadURL(`${appBaseUrl}${sep}${params.toString()}`);
}

ipcMain.handle('popout:open', (_event, payload) => {
  const roomId = payload && typeof payload.roomId === 'string' ? payload.roomId : null;
  const title = payload && typeof payload.title === 'string' ? payload.title : '';
  if (!roomId) return false;
  if (payload && Array.isArray(payload.seed)) {
    popoutSeeds.set(roomId, payload.seed);
  }
  createPopoutWindow(roomId, title);
  return true;
});

ipcMain.handle('popout:getSeed', (_event, roomId) => {
  if (typeof roomId !== 'string' || !popoutSeeds.has(roomId)) return null;
  const seed = popoutSeeds.get(roomId);
  popoutSeeds.delete(roomId);
  return seed;
});

// OS-wide "bring Trenchcord to front" shortcut. The renderer pushes the
// accelerator from the saved config on load and whenever the setting changes;
// an empty value unregisters it.
let focusAccelerator = null;

function registerFocusShortcut(accelerator) {
  if (focusAccelerator) {
    try {
      globalShortcut.unregister(focusAccelerator);
    } catch {
      /* ignore */
    }
    focusAccelerator = null;
  }
  if (!accelerator) return true;
  try {
    const ok = globalShortcut.register(accelerator, () => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    });
    if (ok) focusAccelerator = accelerator;
    return ok;
  } catch {
    return false;
  }
}

ipcMain.handle('focusShortcut:set', (_event, accelerator) => {
  if (accelerator !== null && (typeof accelerator !== 'string' || accelerator.length > 64)) return false;
  return registerFocusShortcut(accelerator || null);
});

// Desktop-only settings (currently just the auto-update opt-in) live in their
// own file in userData rather than the backend's config.json, because the main
// process needs them before/independently of the backend.
function desktopSettingsPath() {
  return path.join(app.getPath('userData'), 'desktop-settings.json');
}

function readDesktopSettings() {
  try {
    const parsed = JSON.parse(fs.readFileSync(desktopSettingsPath(), 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeDesktopSettings(patch) {
  try {
    fs.writeFileSync(desktopSettingsPath(), JSON.stringify({ ...readDesktopSettings(), ...patch }, null, 2));
  } catch {
    /* ignore */
  }
}

// Guards against registering updater listeners twice if the user toggles the
// setting off and on within one session.
let autoUpdateStarted = false;

function setupAutoUpdate() {
  // Squirrel.Mac requires a signed + notarized app to apply updates, and this
  // build is unsigned. So auto-update runs on Windows only; macOS users update
  // by re-downloading the latest release.
  if (process.platform !== 'win32') return;
  if (autoUpdateStarted) return;

  let autoUpdater;
  try {
    ({ autoUpdater } = require('electron-updater'));
  } catch {
    return;
  }
  autoUpdateStarted = true;

  autoUpdater.autoDownload = true;
  autoUpdater.on('update-downloaded', async (info) => {
    const { response } = await dialog.showMessageBox(mainWindow, {
      type: 'info',
      buttons: ['Restart now', 'Later'],
      defaultId: 0,
      cancelId: 1,
      title: 'Update ready',
      message: `Trenchcord ${info.version} has been downloaded.`,
      detail: 'Restart the app to finish updating.',
    });
    if (response === 0) autoUpdater.quitAndInstall();
  });
  autoUpdater.on('error', (err) => {
    console.error('[desktop] auto-update error:', err ? err.message || err : 'unknown');
  });
  autoUpdater.checkForUpdatesAndNotify().catch((err) => {
    console.error('[desktop] update check failed:', err ? err.message || err : 'unknown');
  });
}

// Auto-update is opt-in: with it off (the default) the app never contacts
// GitHub for updates, so nothing new can ever be downloaded without the user
// having explicitly enabled it. Users update manually from the releases page.
ipcMain.handle('autoUpdate:get', () => ({
  supported: process.platform === 'win32' && !isDev,
  enabled: readDesktopSettings().autoUpdate === true,
}));

ipcMain.handle('autoUpdate:set', (_event, enabled) => {
  if (typeof enabled !== 'boolean') return false;
  writeDesktopSettings({ autoUpdate: enabled });
  // Turning it on checks right away; turning it off takes effect from the next
  // launch (the once-per-launch check may have already run).
  if (enabled) setupAutoUpdate();
  return true;
});

async function bootstrap() {
  if (isDev) {
    // Dev: run `npm run dev` in the repo root (backend on 3001 + Vite on 5173),
    // then launch this. Loads the Vite dev server with hot reload.
    createWindow(process.env.TRENCHCORD_DEV_URL || 'http://localhost:5173');
    return;
  }

  backendPort = await resolveBackendPort();
  startBackend(backendPort);

  try {
    await waitForHealth(backendPort);
  } catch (err) {
    dialog.showErrorBox('Trenchcord failed to start', err && err.message ? err.message : String(err));
    app.quit();
    return;
  }

  createWindow(`http://127.0.0.1:${backendPort}`);
  if (readDesktopSettings().autoUpdate === true) setupAutoUpdate();
}

app.whenReady().then(bootstrap);

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length > 0) return;
  if (isDev) {
    createWindow(process.env.TRENCHCORD_DEV_URL || 'http://localhost:5173');
  } else {
    createWindow(`http://127.0.0.1:${backendPort}`);
  }
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('before-quit', () => {
  if (backendProcess) {
    try {
      backendProcess.kill();
    } catch {
      /* ignore */
    }
    backendProcess = null;
  }
});
