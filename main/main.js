/**
 * Mermaid Reader — Electron main process.
 * Native window, menus, file dialogs, recent-files store and window-state persistence.
 */
'use strict';

const { app, BrowserWindow, Menu, dialog, ipcMain, shell, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');

const DEV = process.argv.includes('--dev');
const isMac = process.platform === 'darwin';

const FILE_FILTERS = [
  { name: 'Mermaid & Markdown', extensions: ['mmd', 'mermaid', 'md', 'markdown', 'txt'] },
  { name: 'Mermaid', extensions: ['mmd', 'mermaid'] },
  { name: 'Markdown', extensions: ['md', 'markdown'] },
  { name: 'All Files', extensions: ['*'] }
];

let mainWindow = null;
let forceClose = false;
let pendingOpenPaths = [];  // files opened before renderer ready (open-file / argv)

/* ------------------------------------------------------------------ *
 * Tiny JSON stores (recent files + window bounds)
 * ------------------------------------------------------------------ */
function storePath(name) {
  return path.join(app.getPath('userData'), `${name}.json`);
}
function readStore(name, fallback) {
  try { return JSON.parse(fs.readFileSync(storePath(name), 'utf8')); } catch { return fallback; }
}
function writeStore(name, value) {
  try { fs.writeFileSync(storePath(name), JSON.stringify(value, null, 2)); } catch { /* best effort */ }
}

const getRecent = () => readStore('recent-files', []);
function addRecent(filePath) {
  const name = path.basename(filePath);
  let list = getRecent().filter((r) => r.path !== filePath);
  list.unshift({ path: filePath, name, openedAt: Date.now() });
  list = list.slice(0, 10);
  writeStore('recent-files', list);
  try { app.addRecentDocument(filePath); } catch { /* mac/win only */ }
  rebuildMenu();
  return list;
}
function clearRecent() {
  writeStore('recent-files', []);
  try { app.clearRecentDocuments(); } catch { /* noop */ }
  rebuildMenu();
  return [];
}

/* ------------------------------------------------------------------ *
 * Window creation + state restore
 * ------------------------------------------------------------------ */
function createWindow() {
  const state = readStore('window-state', { width: 1480, height: 920 });
  const valid = state.width >= 1060 && state.height >= 640;

  mainWindow = new BrowserWindow({
    width: valid ? state.width : 1480,
    height: valid ? state.height : 920,
    x: valid ? state.x : undefined,
    y: valid ? state.y : undefined,
    minWidth: 1060,
    minHeight: 680,
    show: false,
    backgroundColor: '#f9f7f5',
    title: 'Mermaid Reader',
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 16, y: 18 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  mainWindow.once('ready-to-show', () => mainWindow.show());
  if (DEV) mainWindow.webContents.openDevTools({ mode: 'detach' });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('did-finish-load', () => {
    while (pendingOpenPaths.length && mainWindow) {
      const p = pendingOpenPaths.shift();
      sendPathToRenderer(p);
    }
    // headless verification hook: MERMAID_SMOKE=/path.png electron .
    if (process.env.MERMAID_SMOKE) {
      setTimeout(async () => {
        try {
          const img = await mainWindow.webContents.capturePage();
          require('fs').writeFileSync(process.env.MERMAID_SMOKE, img.toPNG());
          console.log('SMOKE_SHOT_WRITTEN', process.env.MERMAID_SMOKE);
        } catch (e) { console.error('SMOKE_SHOT_FAILED', e); }
        app.exit(0);
      }, Number(process.env.MERMAID_SMOKE_DELAY || 2500));
    }
  });

  mainWindow.on('close', (event) => {
    if (forceClose || !mainWindow) return;
    if (mainWindow.webContents.isLoading()) return;
    event.preventDefault();
    mainWindow.webContents
      .executeJavaScript('window.__isDirty ? window.__isDirty() : false', true)
      .then((dirty) => {
        if (!mainWindow) return;
        if (!dirty) { destroyWindow(); return; }
        const choice = dialog.showMessageBoxSync(mainWindow, {
          type: 'question',
          buttons: ['Save', 'Don’t Save', 'Cancel'],
          defaultId: 0,
          cancelId: 2,
          title: 'Unsaved changes',
          message: 'Do you want to save your changes before closing?',
          detail: 'Your changes will be lost if you don’t save them.'
        });
        if (choice === 0) mainWindow.webContents.send('menu:save-then-close');
        else if (choice === 1) destroyWindow();
      })
      .catch(destroyWindow);
  });

  mainWindow.on('closed', () => {
    if (watchedPath) { try { fs.unwatchFile(watchedPath); } catch { /* noop */ } watchedPath = null; }
    mainWindow = null;
  });
  mainWindow.on('resize', persistState);
  mainWindow.on('move', persistState);
}

function persistState() {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isFullScreen()) return;
  writeStore('window-state', mainWindow.getNormalBounds());
}

function destroyWindow() {
  forceClose = true;
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.destroy();
  mainWindow = null;
}

function sendPathToRenderer(filePath) {
  fs.readFile(filePath, 'utf8', (err, content) => {
    if (err || !mainWindow) return;
    mainWindow.webContents.send('menu:open-path', { path: filePath, name: path.basename(filePath), content });
    addRecent(filePath);
  });
}

/* ------------------------------------------------------------------ *
 * Application menu (aimed at the mermaid.live editing workflow)
 * ------------------------------------------------------------------ */
function send(cmd) {
  return () => { if (mainWindow) mainWindow.webContents.send(cmd); };
}

const THEMES = ['default', 'neutral', 'forest', 'dark', 'base'];

function rebuildMenu() {
  const recent = getRecent();
  const recentItems = recent.length
    ? [
        ...recent.map((r) => ({
          label: r.name,
          sublabel: r.path,
          click: () => sendPathToRenderer(r.path)
        })),
        { type: 'separator' },
        { label: 'Clear Menu', click: () => clearRecent() }
      ]
    : [{ label: 'No Recent Files', enabled: false }];

  const template = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { label: 'About Mermaid Reader', click: showAbout },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'Open…', accelerator: 'CmdOrCtrl+O', click: send('menu:open') },
        { label: 'Open Recent', submenu: recentItems },
        { type: 'separator' },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: send('menu:save') },
        { label: 'Save As…', accelerator: 'Shift+CmdOrCtrl+S', click: send('menu:save-as') },
        { type: 'separator' },
        { label: 'Export as PNG…', accelerator: 'CmdOrCtrl+E', click: send('menu:export-png') },
        { label: 'Export as SVG…', accelerator: 'Shift+CmdOrCtrl+E', click: send('menu:export-svg') },
        { label: 'Export as PDF…', accelerator: 'CmdOrCtrl+P', click: send('menu:export-pdf') },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' }, { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
        { type: 'separator' },
        { label: 'Copy Diagram as Image', accelerator: 'Shift+CmdOrCtrl+C', click: send('menu:copy-image') },
        { label: 'Copy Share Link', accelerator: 'Shift+CmdOrCtrl+L', click: send('menu:copy-link') }
      ]
    },
    {
      label: 'View',
      submenu: [
        { label: 'Code Only', accelerator: 'Alt+CmdOrCtrl+1', click: send('menu:view-code') },
        { label: 'Split View', accelerator: 'Alt+CmdOrCtrl+2', click: send('menu:view-split') },
        { label: 'Preview Only', accelerator: 'Alt+CmdOrCtrl+3', click: send('menu:view-preview') },
        { type: 'separator' },
        {
          label: 'Diagram Theme',
          submenu: THEMES.map((t, i) => ({
            label: t[0].toUpperCase() + t.slice(1),
            accelerator: `Alt+CmdOrCtrl+${i + 4}`,
            click: () => { if (mainWindow) mainWindow.webContents.send('menu:theme', t); }
          }))
        },
        { type: 'separator' },
        { label: 'Zoom In Diagram', accelerator: 'CmdOrCtrl+Plus', click: () => { if (mainWindow) mainWindow.webContents.send('menu:zoom', 'in'); } },
        { label: 'Zoom Out Diagram', accelerator: 'CmdOrCtrl+-', click: () => { if (mainWindow) mainWindow.webContents.send('menu:zoom', 'out'); } },
        { label: 'Reset Diagram Zoom', accelerator: 'CmdOrCtrl+0', click: () => { if (mainWindow) mainWindow.webContents.send('menu:zoom', 'reset'); } },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        ...(DEV ? [{ role: 'toggleDevTools' }] : [])
      ]
    },
    {
      label: 'Window',
      role: 'windowMenu'
    },
    {
      label: 'Help',
      role: 'help',
      submenu: [
        { label: 'Mermaid Documentation', click: () => shell.openExternal('https://mermaid.js.org/intro/') },
        { label: 'Syntax Reference', click: () => shell.openExternal('https://mermaid.js.org/syntax/flowchart.html') },
        { label: 'Mermaid Live Editor', click: () => shell.openExternal('https://mermaid.live') },
        { type: 'separator' },
        { label: 'Keyboard Shortcuts', accelerator: 'CmdOrCtrl+/', click: send('menu:shortcuts') },
        { type: 'separator' },
        { label: isMac ? 'About Mermaid Reader' : 'About…', click: showAbout }
      ]
    }
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/* ------------------------------------------------------------------ *
 * IPC surface used by the renderer through the preload bridge
 * ------------------------------------------------------------------ */
ipcMain.handle('file:openDialog', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open Mermaid or Markdown file',
    properties: ['openFile'],
    filters: FILE_FILTERS
  });
  if (result.canceled || !result.filePaths.length) return { canceled: true };
  const filePath = result.filePaths[0];
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    addRecent(filePath);
    return { canceled: false, path: filePath, name: path.basename(filePath), content };
  } catch (err) {
    return { canceled: true, error: String(err) };
  }
});

ipcMain.handle('file:read', (_e, filePath) => {
  try {
    return { ok: true, path: filePath, name: path.basename(filePath), content: fs.readFileSync(filePath, 'utf8') };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

ipcMain.handle('file:saveDialog', async (_e, { defaultPath, content, filters }) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save file',
    defaultPath,
    filters: filters || FILE_FILTERS
  });
  if (result.canceled || !result.filePath) return { canceled: true };
  fs.writeFileSync(result.filePath, content ?? '', 'utf8');
  addRecent(result.filePath);
  return { canceled: false, path: result.filePath, name: path.basename(result.filePath) };
});

ipcMain.handle('file:save', (_e, { path: filePath, content }) => {
  try {
    fs.writeFileSync(filePath, content ?? '', 'utf8');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

ipcMain.handle('file:exportDialog', async (_e, { kind, defaultName, payload }) => {
  const filters = kind === 'png'
    ? [{ name: 'PNG Image', extensions: ['png'] }]
    : [{ name: 'SVG Image', extensions: ['svg'] }];
  const result = await dialog.showSaveDialog(mainWindow, { title: `Export ${kind.toUpperCase()}`, defaultPath: defaultName, filters });
  if (result.canceled || !result.filePath) return { canceled: true };
  try {
    if (kind === 'png') {
      const image = nativeImage.createFromDataURL(payload);
      fs.writeFileSync(result.filePath, image.toPNG());
    } else {
      fs.writeFileSync(result.filePath, payload, 'utf8');
    }
    return { canceled: false, path: result.filePath };
  } catch (err) {
    return { canceled: true, error: String(err) };
  }
});

ipcMain.handle('recent:list', () => getRecent());
ipcMain.handle('recent:clear', () => clearRecent());

/* live-reload: poll the open file (robust across editors that rewrite via rename) */
let watchedPath = null;
ipcMain.handle('file:watch', (_e, filePath) => {
  if (watchedPath) { try { fs.unwatchFile(watchedPath); } catch { /* noop */ } watchedPath = null; }
  if (!filePath) return;
  watchedPath = filePath;
  let lastMtime = null;
  try { lastMtime = fs.statSync(filePath).mtimeMs; } catch { /* gone */ }
  fs.watchFile(filePath, { interval: 1200 }, (stat) => {
    if (!mainWindow || !watchedPath) return;
    if (stat.mtimeMs === lastMtime) return;
    lastMtime = stat.mtimeMs;
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      mainWindow.webContents.send('menu:file-updated', { path: filePath, content });
    } catch { /* mid-write, next tick will retry */ }
  });
});

/* print-to-PDF works on the live page with the @media print stylesheet */
ipcMain.handle('export:pdf', async (_e, { defaultName, landscape, pageSizeMicrons }) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Export PDF',
    defaultPath: defaultName,
    filters: [{ name: 'PDF document', extensions: ['pdf'] }]
  });
  if (result.canceled || !result.filePath) return { canceled: true };
  const opts = {
    printBackground: true,
    landscape: Boolean(landscape),
    margins: { marginType: 'none' },
    pageRanges: ''
  };
  if (pageSizeMicrons) opts.pageSize = pageSizeMicrons; else opts.pageSize = 'A4';
  const data = await mainWindow.webContents.printToPDF(opts);
  fs.writeFileSync(result.filePath, data);
  return { canceled: false, path: result.filePath };
});

ipcMain.handle('window:setMeta', (_e, { name, dirty }) => {
  if (!mainWindow) return;
  mainWindow.setTitle(`${name}${dirty ? ' •' : ''} — Mermaid Reader`);
  if (isMac) mainWindow.setDocumentEdited(Boolean(dirty));
});

function showAbout() {
  if (!mainWindow) return;
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'About Mermaid Reader',
    message: 'Mermaid Reader',
    detail: [
      `Version ${app.getVersion()}`,
      'An offline, fully local Mermaid & Markdown file reader.',
      '',
      'MIT © 2026 Navin Jairam (Lucifer-Newstar)',
      'github.com/Lucifer-Newstar/mmd-reader',
      '',
      'Rendering engine: Mermaid.js (MIT). No telemetry, no accounts, no servers.'
    ].join('\n'),
    buttons: ['OK']
  });
}
ipcMain.handle('app:quitConfirmed', () => destroyWindow());
ipcMain.handle('shell:openExternal', (_e, url) => {
  if (/^https?:\/\//.test(url)) shell.openExternal(url);
});

/* ------------------------------------------------------------------ *
 * Lifecycle, single instance, OS file-open events
 * ------------------------------------------------------------------ */
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    const file = argv.slice(1).find((a) => /\.(mmd|mermaid|md|markdown)$/i.test(a) && fs.existsSync(a));
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      if (file) sendPathToRenderer(file);
    } else if (file) {
      pendingOpenPaths.push(file);
    }
  });

  app.whenReady().then(() => {
    rebuildMenu();
    createWindow();

    const launchFile = process.argv.slice(app.isPackaged ? 1 : 2)
      .find((a) => /\.(mmd|mermaid|md|markdown)$/i.test(a) && fs.existsSync(a));
    if (launchFile) pendingOpenPaths.push(path.resolve(launchFile));

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('open-file', (event, filePath) => {
    event.preventDefault();
    if (mainWindow) sendPathToRenderer(filePath);
    else pendingOpenPaths.push(filePath);
  });

  app.on('window-all-closed', () => {
    if (!isMac) app.quit();
  });
}
