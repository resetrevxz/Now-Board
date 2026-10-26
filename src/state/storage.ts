import type {
  BackupEntry,
  BoardFileInfo,
  ExportResult,
  ImportResult,
} from '../lib/bridge';
import { getBridge } from '../lib/bridge';
import type { BoardState } from '../state/types';
import { createInitialState } from '../state/defaults';
import { BoardValidationError, boardToJson, normalizeBoard } from '../state/normalize';
import { localDateKey } from '../state/time';

const STORAGE_KEY = 'now-board:state:v1';

export interface LoadSuccess {
  ok: true;
  state: BoardState;
  fresh: boolean;
  source: 'electron' | 'browser';
  info: BoardFileInfo | null;
}

export interface LoadFailure {
  ok: false;
  error: string;
  source: 'electron' | 'browser';
  info: BoardFileInfo | null;
  canRestore: boolean;
}

export type LoadOutcome = LoadSuccess | LoadFailure;

export interface SaveOutcome {
  ok: boolean;
  savedAt?: number;
  error?: string;
}

function emptyInfo(): BoardFileInfo {
  return {
    dataDir: '',
    stateFile: '',
    backupsDir: '',
    size: 0,
    mtime: null,
    backups: [],
  };
}

function infoFrom(raw: {
  dataDir?: string;
  stateFile?: string;
  backupsDir?: string;
  size?: number;
  mtime?: number | null;
  backups?: BackupEntry[];
}): BoardFileInfo {
  return {
    dataDir: raw.dataDir ?? '',
    stateFile: raw.stateFile ?? '',
    backupsDir: raw.backupsDir ?? '',
    size: raw.size ?? 0,
    mtime: raw.mtime ?? null,
    backups: raw.backups ?? [],
  };
}

function fail(
  source: 'electron' | 'browser',
  error: string,
  info: BoardFileInfo | null,
  canRestore = false,
): LoadFailure {
  return { ok: false, error, source, info, canRestore };
}

export async function loadBoard(): Promise<LoadOutcome> {
  const bridge = getBridge();
  if (bridge) {
    try {
      const result = await bridge.load();
      const info = infoFrom(result);
      if (!result.ok) {
        return fail(
          'electron',
          result.error ||
            'The board file could not be read. It may have been interrupted while saving.',
          info,
          info.backups.length > 0,
        );
      }
      if (result.raw === null || result.raw === undefined) {
        return {
          ok: true,
          state: createInitialState(),
          fresh: true,
          source: 'electron',
          info,
        };
      }
      try {
        return {
          ok: true,
          state: normalizeBoard(result.raw),
          fresh: false,
          source: 'electron',
          info,
        };
      } catch (error) {
        return fail(
          'electron',
          error instanceof BoardValidationError
            ? error.message
            : 'The board file was readable but its contents were not valid.',
          info,
          info.backups.length > 0,
        );
      }
    } catch (error) {
      return fail(
        'electron',
        error instanceof Error ? error.message : 'The desktop bridge is unavailable.',
        null,
      );
    }
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        ok: true,
        state: createInitialState(),
        fresh: true,
        source: 'browser',
        info: null,
      };
    }
    try {
      const parsed: unknown = JSON.parse(raw);
      return {
        ok: true,
        state: normalizeBoard(parsed),
        fresh: false,
        source: 'browser',
        info: null,
      };
    } catch (error) {
      return fail(
        'browser',
        error instanceof BoardValidationError
          ? error.message
          : 'The saved board in this browser is not valid JSON.',
        null,
      );
    }
  } catch (error) {
    return fail(
      'browser',
      error instanceof Error ? error.message : 'Browser storage is unavailable.',
      null,
    );
  }
}

export async function saveBoard(state: BoardState): Promise<SaveOutcome> {
  const bridge = getBridge();
  if (bridge) {
    try {
      const result = await bridge.save(state);
      return result.ok
        ? { ok: true, savedAt: result.savedAt }
        : { ok: false, error: result.error || 'Save failed.' };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Save failed.',
      };
    }
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return { ok: true, savedAt: Date.now() };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? `Browser storage rejected the save: ${error.message}`
          : 'Browser storage rejected the save.',
    };
  }
}

export function saveBoardSync(state: BoardState): SaveOutcome {
  const bridge = getBridge();
  if (bridge) {
    try {
      const result = bridge.saveSync(state);
      return result.ok
        ? { ok: true, savedAt: result.savedAt }
        : { ok: false, error: result.error || 'Save failed.' };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Save failed.',
      };
    }
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return { ok: true, savedAt: Date.now() };
  } catch {
    return { ok: false, error: 'Browser storage rejected the save.' };
  }
}

export async function exportBoard(state: BoardState): Promise<ExportResult> {
  const bridge = getBridge();
  if (bridge) {
    try {
      return await bridge.exportData(state);
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Export failed.',
      };
    }
  }
  try {
    const blob = new Blob([boardToJson(state)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `now-board-${localDateKey(Date.now())}.json`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Export failed.',
    };
  }
}

function parseImportText(text: string): { ok: true; raw: unknown } | { ok: false; error: string } {
  const trimmed = text.replace(/^\uFEFF/, '').trim();
  if (!trimmed) return { ok: false, error: 'That file is empty.' };
  try {
    return { ok: true, raw: JSON.parse(trimmed) as unknown };
  } catch {
    return { ok: false, error: 'That file is not valid JSON.' };
  }
}

export async function importBoardFile(): Promise<ImportResult> {
  const bridge = getBridge();
  if (bridge) {
    try {
      const result = await bridge.importData();
      if (!result.ok || result.raw === undefined) return result;
      if (typeof result.raw === 'string') {
        const parsed = parseImportText(result.raw);
        if (!parsed.ok) return { ...result, ok: false, raw: undefined, error: parsed.error };
        return { ...result, raw: parsed.raw };
      }
      return result;
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Import failed.',
      };
    }
  }
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.style.display = 'none';
    document.body.append(input);
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) {
        resolve({ ok: false, canceled: true });
        return;
      }
      if (file.size > 8 * 1024 * 1024) {
        resolve({ ok: false, error: 'That file is larger than 8 MB.' });
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const parsed = parseImportText(String(reader.result));
        if (!parsed.ok) {
          resolve({ ok: false, error: parsed.error });
          return;
        }
        resolve({ ok: true, raw: parsed.raw, fileName: file.name });
      };
      reader.onerror = () => resolve({ ok: false, error: 'The file could not be read.' });
      reader.readAsText(file);
    });
    input.click();
  });
}

export async function restoreBackup(name: string): Promise<LoadOutcome> {
  const bridge = getBridge();
  if (!bridge) {
    return fail('browser', 'Backups are only available in the desktop app.', null);
  }
  try {
    const result = await bridge.restoreBackup(name);
    if (!result.ok) {
      return fail('electron', result.error || 'That backup could not be restored.', infoFrom(result), false);
    }
    try {
      return {
        ok: true,
        state: normalizeBoard(result.raw),
        fresh: false,
        source: 'electron',
        info: infoFrom(result),
      };
    } catch (error) {
      return fail(
        'electron',
        error instanceof BoardValidationError
          ? error.message
          : 'That backup is not valid Now Board data.',
        infoFrom(result),
        false,
      );
    }
  } catch (error) {
    return fail(
      'electron',
      error instanceof Error ? error.message : 'Restore failed.',
      null,
      false,
    );
  }
}

export async function startFreshStorage(
  next: BoardState,
): Promise<{ ok: boolean; error?: string; info: BoardFileInfo | null }> {
  const bridge = getBridge();
  if (bridge) {
    try {
      // Electron archives the current file, then writes the fresh board
      // atomically. A failure leaves the original board untouched.
      const result = await bridge.startFresh(next);
      if (!result.ok) {
        return { ok: false, error: result.error || 'Reset failed.', info: null };
      }
      return { ok: true, info: infoFrom(result) };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Reset failed.',
        info: null,
      };
    }
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return { ok: true, info: null };
  } catch {
    return { ok: false, error: 'Browser storage could not be cleared.', info: null };
  }
}

export async function refreshFileInfo(): Promise<BoardFileInfo | null> {
  const bridge = getBridge();
  if (!bridge) return null;
  try {
    return infoFrom(await bridge.info());
  } catch {
    return null;
  }
}

export function rememberTheme(theme: 'dark' | 'light'): void {
  try {
    localStorage.setItem('now-board:theme', theme);
  } catch {
    /* cosmetic only */
  }
}

export function freshBoard(): BoardState {
  return createInitialState();
}

export function unusedInfo(): BoardFileInfo {
  return emptyInfo();
}
