/**
 * Electron main process for DigitechIO desktop.
 *
 * Responsibilities:
 *   1. Launch the bundled Node/Express backend as a child process using Electron's
 *      internal Node runtime (via ELECTRON_RUN_AS_NODE=1), so users don't need
 *      a separate Node install on their machine.
 *   2. Wait until the backend is healthy on its port, then open the BrowserWindow.
 *   3. In dev mode: point the window at the Vite dev server (HMR works).
 *      In prod mode: load the built dist/index.html.
 *   4. Tear the backend down cleanly on quit.
 */
const { app, BrowserWindow, shell, Menu, dialog } = require('electron');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
// `electron-updater` downloads a newer installer in the background, verifies
// its signature against the publisher-name baked into the previous install,
// and then swaps the app on quit. It pairs with electron-builder's GitHub
// provider (see `build.publish` in package.json).
const { autoUpdater } = require('electron-updater');

let logStream = null;
function getLogStream() {
  if (logStream) return logStream;
  try {
    const dir = app.getPath('userData');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    logStream = fs.createWriteStream(path.join(dir, 'backend.log'), { flags: 'a' });
  } catch (err) {
    console.error('[electron] unable to open log file:', err);
  }
  return logStream;
}
function logLine(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try { getLogStream()?.write(line); } catch {}
  console.log(msg);
}

const isDev = !app.isPackaged;
const DEV_URL = process.env.ELECTRON_DEV_URL || 'http://localhost:8080';
// In dev we assume the backend is already on :4000 (run by `npm run dev:full`
// or the `electron:dev` script). In packaged mode we auto-pick a free port
// so the app doesn't fail on machines where :4000 is already taken.
const SHOULD_SPAWN_BACKEND = !isDev || process.env.ELECTRON_SPAWN_BACKEND === '1';
const DEV_BACKEND_PORT = 4000;

/** Resolved at runtime once the backend's port is known. */
let backendPort = DEV_BACKEND_PORT;

/** @type {import('child_process').ChildProcess | null} */
let backendProc = null;
/** @type {BrowserWindow | null} */
let mainWindow = null;

/**
 * Absolute paths to the bundled server folder + optional .env, taking into
 * account electron-builder's extraResources layout.
 *
 * Dev layout:       {repoRoot}/collab-creek/server/...
 * Packaged layout:  {process.resourcesPath}/server/...
 */
function resolveServerPaths() {
  const serverDir = isDev
    ? path.resolve(__dirname, '..', 'server')
    : path.join(process.resourcesPath, 'server');
  const envFile = isDev
    ? path.resolve(__dirname, '..', '.env')
    : path.join(process.resourcesPath, '.env');
  return { serverDir, envFile, entry: path.join(serverDir, 'src', 'index.js') };
}

/**
 * Parse a .env file using `dotenv` if available; otherwise fall back to a
 * very small KEY=VALUE parser so packaged builds never crash on a missing dep.
 */
function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  try {
    const dotenv = require('dotenv');
    const out = dotenv.parse(fs.readFileSync(filePath));
    return out;
  } catch {
    const out = {};
    const raw = fs.readFileSync(filePath, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/i.exec(line);
      if (!m) continue;
      let value = m[2];
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      out[m[1]] = value;
    }
    return out;
  }
}

/**
 * Ask the OS for any free TCP port by binding port 0, then closing. Prefer
 * the user's override (`DIGITECH_PORT` / `PORT` env) if it's actually free;
 * otherwise fall through to a dynamic assignment.
 */
function pickFreePort(preferred) {
  return new Promise((resolve, reject) => {
    const tryBind = (port, onFail) => {
      const server = net.createServer();
      server.unref();
      server.once('error', onFail);
      server.listen({ port, host: '127.0.0.1', exclusive: true }, () => {
        const { port: chosen } = server.address();
        server.close(() => resolve(chosen));
      });
    };
    if (preferred && Number.isFinite(preferred) && preferred > 0) {
      tryBind(preferred, () => tryBind(0, reject));
    } else {
      tryBind(0, reject);
    }
  });
}

/** Poll the backend until it answers (or we give up after ~30s). */
function waitForBackend(port) {
  return new Promise((resolve) => {
    const start = Date.now();
    const timeoutMs = 30_000;
    const tick = () => {
      const req = http.get({ host: '127.0.0.1', port, path: '/' }, () => {
        req.destroy();
        resolve(true);
      });
      req.on('error', () => {
        if (Date.now() - start > timeoutMs) return resolve(false);
        setTimeout(tick, 400);
      });
    };
    tick();
  });
}

/**
 * Start the server as a child process. Uses Electron's own binary as Node
 * (ELECTRON_RUN_AS_NODE=1) so the installer doesn't depend on a system Node.
 */
function startBackend(port) {
  const { serverDir, envFile, entry } = resolveServerPaths();
  logLine(`[backend] serverDir=${serverDir}`);
  logLine(`[backend] entry=${entry}`);
  logLine(`[backend] envFile=${envFile} (exists=${fs.existsSync(envFile)})`);
  if (!fs.existsSync(entry)) {
    logLine(`[backend] ERROR: server entry not found at ${entry}`);
    return;
  }
  const nodeModulesDir = path.join(serverDir, 'node_modules');
  logLine(`[backend] node_modules present=${fs.existsSync(nodeModulesDir)}`);

  const staticDir = isDev
    ? null
    : path.join(process.resourcesPath, 'dist');

  const fileEnv = readEnvFile(envFile);
  const env = {
    ...process.env,
    ...fileEnv,
    ELECTRON_RUN_AS_NODE: '1',
    PORT: String(port),
    CLIENT_ORIGIN: isDev ? DEV_URL : `http://localhost:${port}`,
  };
  if (staticDir && fs.existsSync(staticDir)) {
    env.STATIC_DIR = staticDir;
  }

  backendProc = spawn(process.execPath, [entry], {
    cwd: serverDir,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  const stream = getLogStream();
  if (backendProc.stdout) {
    backendProc.stdout.on('data', (chunk) => {
      try { stream?.write(`[backend][out] ${chunk}`); } catch {}
    });
  }
  if (backendProc.stderr) {
    backendProc.stderr.on('data', (chunk) => {
      try { stream?.write(`[backend][err] ${chunk}`); } catch {}
    });
  }

  backendProc.on('exit', (code, signal) => {
    logLine(`[backend] exited (code=${code}, signal=${signal})`);
    backendProc = null;
  });
  backendProc.on('error', (err) => {
    logLine(`[backend] spawn error: ${err.stack || err}`);
  });
}

function stopBackend() {
  if (!backendProc) return;
  try {
    backendProc.kill();
  } catch {
    // best-effort
  }
  backendProc = null;
}

/**
 * Configure and kick off the auto-updater. Safe to call unconditionally —
 * `electron-updater` short-circuits in dev (unpackaged) mode automatically.
 *
 * Flow: check -> download in background -> prompt user to restart & install.
 * We only show a UI dialog once the update has finished downloading so users
 * aren't interrupted mid-work; the install itself happens on app quit.
 */
function setupAutoUpdater() {
  if (isDev) {
    logLine('[updater] skipped in dev mode');
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = {
    info: (m) => logLine(`[updater] ${m}`),
    warn: (m) => logLine(`[updater][warn] ${m}`),
    error: (m) => logLine(`[updater][error] ${m}`),
    debug: (m) => logLine(`[updater][debug] ${m}`),
  };

  autoUpdater.on('checking-for-update', () => logLine('[updater] checking...'));
  autoUpdater.on('update-available', (info) => {
    logLine(`[updater] update available: ${info?.version}`);
  });
  autoUpdater.on('update-not-available', () => logLine('[updater] up to date'));
  autoUpdater.on('error', (err) => {
    logLine(`[updater] error: ${err?.stack || err?.message || err}`);
  });
  autoUpdater.on('download-progress', (p) => {
    logLine(`[updater] downloading ${Math.round(p.percent)}% (${p.transferred}/${p.total})`);
  });
  autoUpdater.on('update-downloaded', async (info) => {
    logLine(`[updater] downloaded: ${info?.version} — prompting user`);
    const { response } = await dialog.showMessageBox(mainWindow ?? undefined, {
      type: 'info',
      buttons: ['Restart now', 'Later'],
      defaultId: 0,
      cancelId: 1,
      title: 'Update ready',
      message: `DigitechIO ${info?.version || ''} is ready to install.`,
      detail:
        'The app will close, update, and reopen. Any unsaved work should be saved first.',
    });
    if (response === 0) {
      // `isSilent=false` shows the NSIS progress UI; `isForceRunAfter=true`
      // relaunches the app once the installer finishes.
      autoUpdater.quitAndInstall(false, true);
    }
  });

  // Delay the first check a bit so the app fully boots and the user sees a
  // responsive window before any background network work kicks in.
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err) => {
      logLine(`[updater] checkForUpdates failed: ${err?.stack || err?.message || err}`);
    });
  }, 8_000);

  // Also re-check every 4 hours while the app stays open, so long-running
  // sessions eventually pick up releases without a manual restart.
  setInterval(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, 4 * 60 * 60 * 1000);
}

async function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: '#0f172a',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Open external links in the default browser instead of inside the app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (isDev) {
    await mainWindow.loadURL(DEV_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    const url = `http://localhost:${backendPort}/`;
    logLine(`[electron] loading ${url}`);
    try {
      await mainWindow.loadURL(url);
    } catch (err) {
      logLine(`[electron] loadURL failed: ${err.stack || err}`);
      const logPath = path.join(app.getPath('userData'), 'backend.log');
      dialog.showErrorBox(
        'DigitechIO could not start',
        `The local server did not respond.\n\nCheck the log:\n${logPath}`,
      );
    }
  }
}

app.whenReady().then(async () => {
  // Simple, minimal menu — mostly hidden, but includes a reload shortcut
  // during development for convenience.
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: 'File',
        submenu: [{ role: 'quit' }],
      },
      {
        label: 'View',
        submenu: [
          { role: 'reload' },
          { role: 'forceReload' },
          { role: 'toggleDevTools' },
          { type: 'separator' },
          { role: 'resetZoom' },
          { role: 'zoomIn' },
          { role: 'zoomOut' },
          { type: 'separator' },
          { role: 'togglefullscreen' },
        ],
      },
    ]),
  );

  if (SHOULD_SPAWN_BACKEND) {
    // User override: honour $DIGITECH_PORT or $PORT if the OS confirms it's
    // actually free. Otherwise let the kernel hand us a random free port.
    const preferred = Number(process.env.DIGITECH_PORT || process.env.PORT) || 0;
    try {
      backendPort = await pickFreePort(preferred);
    } catch (err) {
      console.error('[electron] could not reserve a port:', err);
      backendPort = preferred || DEV_BACKEND_PORT;
    }
    console.log(`[electron] starting backend on :${backendPort}`);
    startBackend(backendPort);
  } else {
    // Dev: the external backend is already on a known port.
    backendPort = DEV_BACKEND_PORT;
  }

  const backendUp = await waitForBackend(backendPort);
  if (!backendUp) {
    console.warn(
      `[electron] backend didn't respond on :${backendPort} within 30s — continuing anyway.`,
    );
  }
  await createMainWindow();

  setupAutoUpdater();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', stopBackend);
app.on('quit', stopBackend);
