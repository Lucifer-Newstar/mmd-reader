/**
 * Preload bridge — the only surface the renderer gets to talk to the desktop shell.
 * Exposed as `window.desktop`. Absent in a plain browser, so the renderer can
 * feature-detect it and fall back to browser behaviours (FileReader, downloads).
 */
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const MENU_CHANNELS = [
  'menu:open', 'menu:open-path', 'menu:save', 'menu:save-as', 'menu:save-then-close',
  'menu:export-png', 'menu:export-svg', 'menu:export-pdf', 'menu:copy-image', 'menu:copy-link',
  'menu:view-code', 'menu:view-split', 'menu:view-preview',
  'menu:theme', 'menu:zoom', 'menu:shortcuts', 'menu:file-updated'
];

contextBridge.exposeInMainWorld('desktop', {
  isDesktop: true,
  platform: process.platform,

  openFileDialog: () => ipcRenderer.invoke('file:openDialog'),
  readFile: (path) => ipcRenderer.invoke('file:read', path),
  saveFileDialog: (opts) => ipcRenderer.invoke('file:saveDialog', opts),
  saveFile: (path, content) => ipcRenderer.invoke('file:save', { path, content }),
  exportDialog: (opts) => ipcRenderer.invoke('file:exportDialog', opts),

  getRecent: () => ipcRenderer.invoke('recent:list'),
  clearRecent: () => ipcRenderer.invoke('recent:clear'),
  watchFile: (path) => ipcRenderer.invoke('file:watch', path),
  exportPdf: (opts) => ipcRenderer.invoke('export:pdf', opts),

  setMeta: (meta) => ipcRenderer.invoke('window:setMeta', meta),
  confirmQuit: () => ipcRenderer.invoke('app:quitConfirmed'),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),

  /** Subscribe to a menu command. Returns an unsubscribe function. */
  onMenu: (channel, handler) => {
    if (!MENU_CHANNELS.includes(channel)) return () => {};
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  }
});
