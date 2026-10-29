'use strict';

const {
  app,
  BrowserWindow,
  Menu,
  Notification,
  Tray,
  dialog,
  globalShortcut,
  ipcMain,
  nativeImage,
  nativeTheme,
  powerSaveBlocker,
  screen,
  shell,
} = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createShareServer } = require('./lan.cjs');

const DEV_URL = process.env.VITE_DEV_SERVER_URL || '';
const isDev = Boolean(DEV_URL);
const PRODUCT = 'Now Board';
const APP_INDEX_FILE = path.join(__dirname, '..', 'dist', 'index.html');
const APP_INDEX_URL = pathToFileURL(APP_INDEX_FILE).href;

app.setName(PRODUCT);
app.setAppUserModelId('com.nowboard.app');
if (process.env.NOW_BOARD_DATA_DIR) {
  app.setPath('userData', process.env.NOW_BOARD_DATA_DIR);
}

let mainWindow = null;
let tray = null;
let isQuitting = false;
let closeToTray = false;
let powerBlockerId = null;
let shortcutsState = { registered: false, failed: [] };
let saveDayKey = null;
let corruptSinceLoad = false;
let windowStateSaveTimer = null;

function userDataDir() {
  return app.getPath('userData');
}
function statePath() {
  return path.join(userDataDir(), 'board.json');
}
function backupsDir() {
  return path.join(userDataDir(), 'backups');
}
function archivesDir() {
  return path.join(userDataDir(), 'archives');
}
function windowStatePath() {
  return path.join(userDataDir(), 'window.json');
}

function ensureDirs() {
  fs.mkdirSync(userDataDir(), { recursive: true });
  fs.mkdirSync(backupsDir(), { recursive: true });
  fs.mkdirSync(archivesDir(), { recursive: true });
}

function pad(n) {
  return String(n).padStart(2, '0');
}
function localDayKey(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function stamp(d = new Date()) {
  return `${localDayKey(d)}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function readJsonFile(file) {
  const raw = fs.readFileSync(file, 'utf8');
  return JSON.parse(raw);
}

function readSettings() {
  try {
    const state = readJsonFile(statePath());
    return state && state.settings ? state.settings : {};
  } catch {
    return {};
  }
}

function listBackups() {
  try {
    ensureDirs();
    return fs
      .readdirSync(backupsDir())
      .filter((name) => name.endsWith('.json'))
      .map((name) => {
        const full = path.join(backupsDir(), name);
        const stat = fs.statSync(full);
        return { name, mtime: stat.mtimeMs, size: stat.size };
      })
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, 20);
  } catch {
    return [];
  }
}

function pruneBackups(keep = 20) {
  try {
    const files = fs
      .readdirSync(backupsDir())
      .filter((name) => /^board-\d{4}-\d{2}-\d{2}\.json$/.test(name))
      .map((name) => ({
        name,
        mtime: fs.statSync(path.join(backupsDir(), name)).mtimeMs,
      }))
      .sort((a, b) => b.mtime - a.mtime);
    for (const file of files.slice(keep)) {
      fs.rmSync(path.join(backupsDir(), file.name), { force: true });
    }
  } catch {
    /* backups are best-effort */
  }
}

function backupExisting(force = false) {
  try {
    ensureDirs();
    if (!fs.existsSync(statePath())) return null;
    const dest = path.join(backupsDir(), `board-${localDayKey()}.json`);
    if (force || !fs.existsSync(dest)) {
      fs.copyFileSync(statePath(), dest);
    }
    pruneBackups();
    return dest;
  } catch {
    return null;
  }
}

function maybeDailyBackup() {
  const day = localDayKey();
  if (saveDayKey === day) return;
  saveDayKey = day;
  backupExisting(false);
}

function archiveCurrent(reason) {
  try {
    ensureDirs();
    if (!fs.existsSync(statePath())) return null;
    const dest = path.join(archivesDir(), `board-${reason}-${stamp()}.json`);
    fs.copyFileSync(statePath(), dest);
    return dest;
  } catch {
    return null;
  }
}

function writeStateAtomic(state) {
  ensureDirs();
  maybeDailyBackup();
  if (corruptSinceLoad) {
    archiveCurrent('unreadable');
    corruptSinceLoad = false;
  }
  const payload = JSON.stringify(state, null, 2);
  const tmp = `${statePath()}.tmp`;
  const fd = fs.openSync(tmp, 'w');
  try {
    fs.writeFileSync(fd, payload, 'utf8');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, statePath());
  return Date.now();
}

function stateFileInfo() {
  let size = 0;
  let mtime = null;
  try {
    const stat = fs.statSync(statePath());
    size = stat.size;
    mtime = stat.mtimeMs;
  } catch {
    /* no file yet */
  }
  return {
    dataDir: userDataDir(),
    stateFile: statePath(),
    backupsDir: backupsDir(),
    size,
    mtime,
    backups: listBackups(),
  };
}

function loadWindowState() {
  const defaults = { width: 1460, height: 930 };
  try {
    const saved = readJsonFile(windowStatePath());
    const bounds = saved && saved.bounds;
    if (!bounds) return defaults;
    const displays = screen.getAllDisplays();
    const visible = displays.some((display) => {
      const area = display.workArea;
      return (
        bounds.x < area.x + area.width - 80 &&
        bounds.x + bounds.width > area.x + 80 &&
        bounds.y < area.y + area.height - 80 &&
        bounds.y + bounds.height > area.y + 80
      );
    });
    if (!visible) return defaults;
    return {
      x: Math.round(bounds.x),
      y: Math.round(bounds.y),
      width: Math.max(760, Math.round(bounds.width)),
      height: Math.max(620, Math.round(bounds.height)),
      maximized: Boolean(saved.maximized),
    };
  } catch {
    return defaults;
  }
}

function persistWindowState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    const maximized = mainWindow.isMaximized();
    const bounds = maximized ? mainWindow.getNormalBounds() : mainWindow.getBounds();
    fs.writeFileSync(
      windowStatePath(),
      JSON.stringify({ bounds, maximized }, null, 2),
      'utf8',
    );
  } catch {
    /* not important */
  }
}

function scheduleWindowStateSave() {
  clearTimeout(windowStateSaveTimer);
  windowStateSaveTimer = setTimeout(persistWindowState, 400);
}

function appIconPath() {
  const ico = path.join(__dirname, '..', 'build', 'icon.ico');
  const png = path.join(__dirname, '..', 'build', 'icon.png');
  if (fs.existsSync(ico)) return ico;
  if (fs.existsSync(png)) return png;
  return undefined;
}

function showMainWindow() {
  const win = ensureWindow();
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function createTray() {
  if (tray) return true;
  try {
    const png = path.join(__dirname, '..', 'build', 'icon.png');
    const sources = [png, appIconPath()].filter(
      (source) => source && fs.existsSync(source),
    );
    let image = null;
    for (const source of sources) {
      const candidate = nativeImage.createFromPath(source);
      if (!candidate.isEmpty()) {
        image = candidate;
        break;
      }
    }
    if (!image) return false;
    tray = new Tray(image.resize({ width: 32, height: 32 }));
    tray.setToolTip('Now Board');
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Open Now Board', click: () => showMainWindow() },
        {
          label: 'Capture a task…',
          click: () => {
            showMainWindow();
            sendHotkey('quick-add');
          },
        },
        {
          label: 'Pause or resume timer',
          click: () => {
            showMainWindow();
            sendHotkey('timer-toggle');
          },
        },
        {
          label: 'Toggle Present',
          click: () => {
            showMainWindow();
            sendHotkey('toggle-present');
          },
        },
        {
          label: 'Be right back',
          click: () => {
            showMainWindow();
            sendHotkey('toggle-panic');
          },
        },
        {
          label: 'Quick modes',
          submenu: [
            {
              label: 'Start focus (25 min)',
              click: () => {
                showMainWindow();
                sendHotkey('mode-focus');
              },
            },
            {
              label: 'Take a break (15 min)',
              click: () => {
                showMainWindow();
                sendHotkey('mode-break');
              },
            },
            {
              label: 'Step away (30 min)',
              click: () => {
                showMainWindow();
                sendHotkey('mode-away');
              },
            },
            {
              label: 'Sleeping',
              click: () => {
                showMainWindow();
                sendHotkey('mode-sleep');
              },
            },
          ],
        },
        { type: 'separator' },
        {
          label: 'Quit Now Board',
          click: () => {
            isQuitting = true;
            app.quit();
          },
        },
      ]),
    );
    tray.on('click', () => showMainWindow());
    tray.on('double-click', () => showMainWindow());
    return true;
  } catch {
    tray = null;
    return false;
  }
}

function createWindow() {
  const saved = loadWindowState();
  const settings = readSettings();
  closeToTray = Boolean(settings.closeToTray);
  const bounds = saved;
  mainWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    minWidth: 760,
    minHeight: 620,
    show: false,
    frame: false,
    backgroundColor: '#08090b',
    autoHideMenuBar: true,
    title: PRODUCT,
    icon: appIconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
      backgroundThrottling: false,
    },
  });

  if (bounds.maximized) mainWindow.maximize();
  if (settings.alwaysOnTop) mainWindow.setAlwaysOnTop(true, 'floating');

  Menu.setApplicationMenu(null);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    maybeDailyBackup();
    applyKeepAwake(Boolean(settings.keepAwake));
    startShareServerIfEnabled();
    registerGlobalShortcuts(settings.globalHotkeys !== false);
  });

  if (isDev) {
    mainWindow.loadURL(DEV_URL);
  } else {
    mainWindow.loadFile(APP_INDEX_FILE);
  }

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (!app.isPackaged && input.type === 'keyDown' && input.key === 'F12') {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  const guardNavigation = (event, url) => {
    const devNavigation = isDev && url.startsWith(DEV_URL);
    const appNavigation =
      url === APP_INDEX_URL ||
      url.startsWith(`${APP_INDEX_URL}#`) ||
      url.startsWith(`${APP_INDEX_URL}?`);
    if (!devNavigation && !appNavigation) event.preventDefault();
  };
  mainWindow.webContents.on('will-navigate', guardNavigation);
  mainWindow.webContents.on('will-redirect', guardNavigation);
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => {
    callback(false);
  });

  const saveOnMove = () => scheduleWindowStateSave();
  mainWindow.on('resize', saveOnMove);
  mainWindow.on('move', saveOnMove);
  mainWindow.on('maximize', () => {
    sendWindowState();
    saveOnMove();
  });
  mainWindow.on('unmaximize', () => {
    sendWindowState();
    saveOnMove();
  });
  mainWindow.on('enter-full-screen', () => sendWindowState());
  mainWindow.on('leave-full-screen', () => sendWindowState());
  mainWindow.on('closed', () => {
    persistWindowState();
    mainWindow = null;
  });
  mainWindow.on('close', (event) => {
    persistWindowState();
    if (closeToTray && tray && !isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  // Some GPUs leave white flashes on frameless resizes; keeping the compositor
  // warm avoids it and costs little for a board that is meant to stay open.
  mainWindow.webContents.on('did-finish-load', () => {
    sendWindowState();
    mainWindow.webContents.send('shortcuts:status', shortcutsState);
  });
}

function sendWindowState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('window:state', {
    maximized: mainWindow.isMaximized(),
    fullscreen: mainWindow.isFullScreen(),
  });
}

function ensureWindow() {
  if (!mainWindow) createWindow();
  if (mainWindow.isMinimized()) mainWindow.restore();
  if (!mainWindow.isVisible()) mainWindow.show();
  return mainWindow;
}

function sendHotkey(action) {
  const win = ensureWindow();
  if (!win) return;
  win.webContents.send('app:hotkey', action);
}

function registerGlobalShortcuts(enabled) {
  globalShortcut.unregisterAll();
  shortcutsState = { registered: false, failed: [] };
  if (!enabled) {
    if (mainWindow) mainWindow.webContents.send('shortcuts:status', shortcutsState);
    return;
  }
  const bindings = [
    ['CommandOrControl+Shift+P', () => sendHotkey('toggle-present')],
    ['CommandOrControl+Shift+B', () => sendHotkey('toggle-panic')],
    ['CommandOrControl+Alt+O', () => showMainWindow()],
    [
      'CommandOrControl+Alt+N',
      () => {
        showMainWindow();
        sendHotkey('quick-add');
      },
    ],
  ];
  for (const [accelerator, action] of bindings) {
    try {
      const ok = globalShortcut.register(accelerator, action);
      if (!ok) shortcutsState.failed.push(accelerator);
    } catch {
      shortcutsState.failed.push(accelerator);
    }
  }
  shortcutsState.registered = shortcutsState.failed.length < bindings.length;
  if (mainWindow) mainWindow.webContents.send('shortcuts:status', shortcutsState);
}

function applyKeepAwake(enabled) {
  if (enabled && powerBlockerId === null) {
    powerBlockerId = powerSaveBlocker.start('prevent-display-sleep');
  } else if (!enabled && powerBlockerId !== null) {
    if (powerSaveBlocker.isStarted(powerBlockerId)) powerSaveBlocker.stop(powerBlockerId);
    powerBlockerId = null;
  }
}

// ---------------------------------------------------------------- share server

let share = null;
let shareSnapshot = null;
let shareConfig = { enabled: false, port: 4781 };
let shareInfo = {
  enabled: false,
  running: false,
  port: 4781,
  urls: [],
  error: null,
};

function distDir() {
  return path.join(__dirname, '..', 'dist');
}

function broadcastShareInfo() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('share:info', shareInfo);
  }
}

async function startShareServerIfEnabled() {
  if (!shareConfig.enabled) return;
  await startShareServer(shareConfig.port);
}

async function startShareServer(port) {
  if (share) {
    share.stop();
    share = null;
  }
  if (!fs.existsSync(path.join(distDir(), 'index.html'))) {
    shareInfo = {
      enabled: true,
      running: false,
      port,
      urls: [],
      error: 'The share view needs a production build. Run "npm run build" first.',
    };
    broadcastShareInfo();
    return;
  }
  share = createShareServer({ distDir: distDir(), port });
  // A snapshot may have been published while the server was still starting.
  share.setSnapshot(shareSnapshot);
  const result = await share.start();
  shareInfo = {
    enabled: true,
    running: result.ok,
    port: result.port || port,
    urls: result.urls || [],
    error: result.error || null,
  };
  broadcastShareInfo();
}

async function stopShareServer() {
  if (share) {
    share.stop();
    share = null;
  }
  shareInfo = { enabled: false, running: false, port: shareConfig.port, urls: [], error: null };
  broadcastShareInfo();
}

// ---------------------------------------------------------------------- ipc

ipcMain.handle('board:load', () => {
  ensureDirs();
  const pathToState = statePath();
  if (!fs.existsSync(pathToState)) {
    return { ok: true, raw: null, ...stateFileInfo() };
  }
  try {
    const raw = readJsonFile(pathToState);
    return { ok: true, raw, ...stateFileInfo() };
  } catch (error) {
    corruptSinceLoad = true;
    return {
      ok: false,
      raw: null,
      error: error instanceof Error ? error.message : 'Could not read board.json',
      ...stateFileInfo(),
    };
  }
});

ipcMain.handle('board:info', () => stateFileInfo());

ipcMain.handle('board:save', (_event, state) => {
  try {
    const savedAt = writeStateAtomic(state);
    return { ok: true, savedAt };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Save failed',
    };
  }
});

ipcMain.on('board:save-sync', (event, state) => {
  try {
    writeStateAtomic(state);
    event.returnValue = { ok: true };
  } catch (error) {
    event.returnValue = {
      ok: false,
      error: error instanceof Error ? error.message : 'Save failed',
    };
  }
});

ipcMain.handle('board:export', async (_event, state) => {
  if (!mainWindow) return { ok: false, error: 'No window' };
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Export Now Board data',
    defaultPath: path.join(app.getPath('documents'), `now-board-${localDayKey()}.json`),
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (result.canceled || !result.filePath) return { ok: false, canceled: true };
  try {
    fs.writeFileSync(result.filePath, JSON.stringify(state, null, 2), 'utf8');
    return { ok: true, filePath: result.filePath };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Export failed' };
  }
});

ipcMain.handle('board:import', async () => {
  if (!mainWindow) return { ok: false, error: 'No window' };
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Import Now Board data',
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (result.canceled || !result.filePaths[0]) return { ok: false, canceled: true };
  const filePath = result.filePaths[0];
  try {
    const stat = fs.statSync(filePath);
    if (stat.size > 8 * 1024 * 1024) {
      return { ok: false, error: 'That file is larger than 8 MB.' };
    }
    const raw = fs.readFileSync(filePath, 'utf8');
    return { ok: true, raw, fileName: path.basename(filePath) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Import failed' };
  }
});

ipcMain.handle('board:restore-backup', (_event, fileName) => {
  if (typeof fileName !== 'string' || !/^[\w.-]+\.json$/.test(fileName)) {
    return { ok: false, error: 'Invalid backup name.' };
  }
  const full = path.join(backupsDir(), fileName);
  try {
    const raw = readJsonFile(full);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return { ok: false, error: 'That backup is not valid board data.' };
    }
    archiveCurrent('before-restore');
    // Write through the atomic path instead of copying over board.json, so a
    // crash mid-restore cannot leave a truncated state file behind.
    writeStateAtomic(raw);
    corruptSinceLoad = false;
    return { ok: true, raw, ...stateFileInfo() };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Restore failed' };
  }
});

ipcMain.handle('board:start-fresh', (_event, state) => {
  if (!state || typeof state !== 'object') {
    return { ok: false, error: 'Fresh board data was missing.' };
  }
  try {
    // Archive first, then atomically replace. If the write fails, the existing
    // board file is left exactly as it was.
    archiveCurrent('before-reset');
    writeStateAtomic(state);
    corruptSinceLoad = false;
    return { ok: true, ...stateFileInfo() };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Reset failed' };
  }
});

ipcMain.handle('data:reveal', () => {
  ensureDirs();
  if (fs.existsSync(statePath())) {
    shell.showItemInFolder(statePath());
  } else {
    shell.openPath(userDataDir());
  }
  return { ok: true };
});

ipcMain.handle('window:minimize', () => mainWindow && mainWindow.minimize());
ipcMain.handle('window:toggle-maximize', () => {
  if (!mainWindow) return false;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
  return mainWindow.isMaximized();
});
ipcMain.handle('window:close', () => mainWindow && mainWindow.close());
ipcMain.handle('window:set-fullscreen', (_event, value) => {
  if (!mainWindow) return false;
  mainWindow.setFullScreen(Boolean(value));
  return mainWindow.isFullScreen();
});
ipcMain.handle('window:set-always-on-top', (_event, value) => {
  if (!mainWindow) return false;
  mainWindow.setAlwaysOnTop(Boolean(value), 'floating');
  return Boolean(value);
});
ipcMain.handle('window:get-state', () => ({
  maximized: Boolean(mainWindow && mainWindow.isMaximized()),
  fullscreen: Boolean(mainWindow && mainWindow.isFullScreen()),
}));

ipcMain.handle('app:set-login-item', (_event, value) => {
  if (!app.isPackaged) return { ok: false, supported: false, error: 'Only available in a packaged build.' };
  try {
    app.setLoginItemSettings({
      openAtLogin: Boolean(value),
      path: process.execPath,
      args: [],
    });
    const settings = app.getLoginItemSettings();
    return { ok: true, supported: true, enabled: settings.openAtLogin };
  } catch (error) {
    return { ok: false, supported: true, error: error instanceof Error ? error.message : 'Failed' };
  }
});

ipcMain.handle('app:set-keep-awake', (_event, value) => {
  applyKeepAwake(Boolean(value));
  return { ok: true, enabled: Boolean(value) };
});

ipcMain.handle('app:set-close-to-tray', (_event, value) => {
  closeToTray = Boolean(value);
  return closeToTray;
});

ipcMain.on('app:tray-status', (_event, text) => {
  if (!tray || typeof text !== 'string') return;
  tray.setToolTip(text.slice(0, 96));
});

ipcMain.on('app:notify', (_event, payload) => {
  if (!Notification.isSupported()) return;
  const title = typeof payload?.title === 'string' ? payload.title.slice(0, 80) : '';
  const body = typeof payload?.body === 'string' ? payload.body.slice(0, 240) : '';
  if (!title) return;
  const notification = new Notification({ title, body, silent: false });
  notification.on('click', () => showMainWindow());
  notification.show();
});

ipcMain.handle('app:create-desktop-shortcut', () => {
  if (process.platform !== 'win32') {
    return { ok: false, error: 'Desktop shortcuts are currently Windows-only.' };
  }
  try {
    const desktop = process.env.NOW_BOARD_DESKTOP_DIR || app.getPath('desktop');
    fs.mkdirSync(desktop, { recursive: true });
    const shortcutPath = path.join(desktop, 'Now Board.lnk');
    const existing = fs.existsSync(shortcutPath);
    const details = {
      target: process.execPath,
      cwd: app.isPackaged ? path.dirname(process.execPath) : app.getAppPath(),
      description: 'Now Board — a calm focus board for your second monitor',
      icon: process.execPath,
      iconIndex: 0,
      appUserModelId: 'com.nowboard.app',
    };
    if (!app.isPackaged) details.args = `"${app.getAppPath()}"`;
    const ok = shell.writeShortcutLink(
      shortcutPath,
      existing ? 'update' : 'create',
      details,
    );
    if (!ok) return { ok: false, error: 'Windows did not create the shortcut.' };
    return { ok: true, path: shortcutPath, dev: !app.isPackaged };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Shortcut creation failed.',
    };
  }
});

ipcMain.handle('shortcuts:configure', (_event, enabled) => {
  registerGlobalShortcuts(Boolean(enabled));
  return shortcutsState;
});
ipcMain.handle('shortcuts:status', () => shortcutsState);

ipcMain.handle('share:configure', async (_event, payload) => {
  const enabled = Boolean(payload && payload.enabled);
  const port = Math.max(1024, Math.min(65535, Number(payload && payload.port) || 4781));
  shareConfig = { enabled, port };
  if (!enabled) {
    await stopShareServer();
  } else {
    await startShareServer(port);
  }
  return shareInfo;
});

ipcMain.handle('share:info', () => shareInfo);

ipcMain.on('share:publish', (_event, snapshot) => {
  // Keep the latest snapshot even if it arrives before the server has started.
  shareSnapshot = snapshot;
  if (share) share.setSnapshot(snapshot);
});

ipcMain.handle('share:local-addresses', () => {
  const os = require('node:os');
  const addresses = [];
  const interfaces = os.networkInterfaces();
  for (const list of Object.values(interfaces)) {
    for (const entry of list || []) {
      if (entry.family === 'IPv4' && !entry.internal) addresses.push(entry.address);
    }
  }
  return addresses;
});

// --------------------------------------------------------------------- lifecycle

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    showMainWindow();
  });

  app.whenReady().then(() => {
    nativeTheme.themeSource = 'dark';
    createWindow();
    createTray();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
      showMainWindow();
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && !(closeToTray && tray && !isQuitting)) {
    app.quit();
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (share) share.stop();
  if (tray) {
    tray.destroy();
    tray = null;
  }
  if (powerBlockerId !== null && powerSaveBlocker.isStarted(powerBlockerId)) {
    powerSaveBlocker.stop(powerBlockerId);
    powerBlockerId = null;
  }
});

app.on('before-quit', () => {
  isQuitting = true;
  persistWindowState();
});
