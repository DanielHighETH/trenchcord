const { app, BrowserWindow, dialog, utilityProcess, shell } = require('electron');
const path = require('path');
const http = require('http');
const net = require('net');

const isDev = !app.isPackaged;

let backendProcess = null;
let mainWindow = null;
let backendPort = 3001;

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
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: '#0b0b0f',
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    shell.openExternal(target);
    return { action: 'deny' };
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  mainWindow.loadURL(url);
}

function setupAutoUpdate() {
  // Squirrel.Mac requires a signed + notarized app to apply updates, and this
  // build is unsigned. So auto-update runs on Windows only; macOS users update
  // by re-downloading the latest release.
  if (process.platform !== 'win32') return;

  let autoUpdater;
  try {
    ({ autoUpdater } = require('electron-updater'));
  } catch {
    return;
  }

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

async function bootstrap() {
  if (isDev) {
    // Dev: run `npm run dev` in the repo root (backend on 3001 + Vite on 5173),
    // then launch this. Loads the Vite dev server with hot reload.
    createWindow(process.env.TRENCHCORD_DEV_URL || 'http://localhost:5173');
    return;
  }

  backendPort = await getFreePort();
  startBackend(backendPort);

  try {
    await waitForHealth(backendPort);
  } catch (err) {
    dialog.showErrorBox('Trenchcord failed to start', err && err.message ? err.message : String(err));
    app.quit();
    return;
  }

  createWindow(`http://127.0.0.1:${backendPort}`);
  setupAutoUpdate();
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
