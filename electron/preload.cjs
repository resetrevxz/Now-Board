'use strict';

const { contextBridge, ipcRenderer } = require('electron');

function subscribe(channel, callback) {
  const handler = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld('nowboard', {
  isElectron: true,
  platform: process.platform,
  load: () => ipcRenderer.invoke('board:load'),
  info: () => ipcRenderer.invoke('board:info'),
  save: (state) => ipcRenderer.invoke('board:save', state),
  saveSync: (state) => ipcRenderer.sendSync('board:save-sync', state),
  exportData: (state) => ipcRenderer.invoke('board:export', state),
  importData: () => ipcRenderer.invoke('board:import'),
  restoreBackup: (name) => ipcRenderer.invoke('board:restore-backup', name),
  startFresh: (state) => ipcRenderer.invoke('board:start-fresh', state),
  revealData: () => ipcRenderer.invoke('data:reveal'),

  minimize: () => ipcRenderer.invoke('window:minimize'),
  toggleMaximize: () => ipcRenderer.invoke('window:toggle-maximize'),
  close: () => ipcRenderer.invoke('window:close'),
  setFullscreen: (value) => ipcRenderer.invoke('window:set-fullscreen', value),
  setAlwaysOnTop: (value) => ipcRenderer.invoke('window:set-always-on-top', value),
  getWindowState: () => ipcRenderer.invoke('window:get-state'),
  onWindowState: (callback) => subscribe('window:state', callback),

  setLoginItem: (value) => ipcRenderer.invoke('app:set-login-item', value),
  setKeepAwake: (value) => ipcRenderer.invoke('app:set-keep-awake', value),
  setCloseToTray: (value) => ipcRenderer.invoke('app:set-close-to-tray', value),
  setTrayStatus: (text) => ipcRenderer.send('app:tray-status', text),
  notify: (payload) => ipcRenderer.send('app:notify', payload),
  createDesktopShortcut: () => ipcRenderer.invoke('app:create-desktop-shortcut'),

  configureShortcuts: (enabled) => ipcRenderer.invoke('shortcuts:configure', enabled),
  getShortcutStatus: () => ipcRenderer.invoke('shortcuts:status'),
  onShortcutStatus: (callback) => subscribe('shortcuts:status', callback),
  onHotkey: (callback) => subscribe('app:hotkey', callback),

  configureShare: (payload) => ipcRenderer.invoke('share:configure', payload),
  getShareInfo: () => ipcRenderer.invoke('share:info'),
  publishShare: (snapshot) => ipcRenderer.send('share:publish', snapshot),
  getLocalAddresses: () => ipcRenderer.invoke('share:local-addresses'),
  onShareInfo: (callback) => subscribe('share:info', callback),
});
