export interface BackupEntry {
  name: string;
  mtime: number;
  size: number;
}

export interface BoardFileInfo {
  dataDir: string;
  stateFile: string;
  backupsDir: string;
  size: number;
  mtime: number | null;
  backups: BackupEntry[];
}

export interface ElectronLoadResult extends Partial<BoardFileInfo> {
  ok: boolean;
  raw?: unknown;
  error?: string;
}

export interface ElectronSaveResult {
  ok: boolean;
  savedAt?: number;
  error?: string;
}

export interface ImportResult {
  ok: boolean;
  canceled?: boolean;
  raw?: unknown;
  fileName?: string;
  error?: string;
}

export interface ExportResult {
  ok: boolean;
  canceled?: boolean;
  filePath?: string;
  error?: string;
}

export interface ShareInfo {
  enabled: boolean;
  running: boolean;
  port: number;
  urls: string[];
  error: string | null;
}

export interface WindowState {
  maximized: boolean;
  fullscreen: boolean;
}

export interface ShortcutStatus {
  registered: boolean;
  failed: string[];
}

export interface LoginItemResult {
  ok: boolean;
  supported: boolean;
  enabled?: boolean;
  error?: string;
}

export interface DesktopShortcutResult {
  ok: boolean;
  path?: string;
  dev?: boolean;
  error?: string;
}

export interface NowBoardBridge {
  isElectron: true;
  platform: string;
  load: () => Promise<ElectronLoadResult>;
  info: () => Promise<BoardFileInfo>;
  save: (state: unknown) => Promise<ElectronSaveResult>;
  saveSync: (state: unknown) => ElectronSaveResult;
  exportData: (state: unknown) => Promise<ExportResult>;
  importData: () => Promise<ImportResult>;
  restoreBackup: (name: string) => Promise<ElectronLoadResult>;
  startFresh: (state: unknown) => Promise<ElectronSaveResult & Partial<BoardFileInfo>>;
  revealData: () => Promise<{ ok: boolean }>;

  minimize: () => Promise<void>;
  toggleMaximize: () => Promise<boolean>;
  close: () => Promise<void>;
  setFullscreen: (value: boolean) => Promise<boolean>;
  setAlwaysOnTop: (value: boolean) => Promise<boolean>;
  getWindowState: () => Promise<WindowState>;
  onWindowState: (callback: (state: WindowState) => void) => () => void;

  setLoginItem: (value: boolean) => Promise<LoginItemResult>;
  setKeepAwake: (value: boolean) => Promise<{ ok: boolean }>;
  setCloseToTray: (value: boolean) => Promise<boolean>;
  setPreciseTimers: (value: boolean) => void;
  setTrayStatus: (text: string) => void;
  notify: (payload: { title: string; body: string }) => void;
  createDesktopShortcut: () => Promise<DesktopShortcutResult>;

  configureShortcuts: (enabled: boolean) => Promise<ShortcutStatus>;
  getShortcutStatus: () => Promise<ShortcutStatus>;
  onShortcutStatus: (callback: (status: ShortcutStatus) => void) => () => void;
  onHotkey: (callback: (action: string) => void) => () => void;

  configureShare: (payload: { enabled: boolean; port: number }) => Promise<ShareInfo>;
  getShareInfo: () => Promise<ShareInfo>;
  publishShare: (snapshot: unknown) => void;
  getLocalAddresses: () => Promise<string[]>;
  onShareInfo: (callback: (info: ShareInfo) => void) => () => void;
}

declare global {
  interface Window {
    nowboard?: NowBoardBridge;
  }
}

export function getBridge(): NowBoardBridge | null {
  if (typeof window === 'undefined') return null;
  return window.nowboard ?? null;
}

export function isElectron(): boolean {
  return getBridge() !== null;
}
