import { afterEach, describe, expect, it, vi } from 'vitest';
import { importBoardFile, startFreshStorage } from './storage';
import { createInitialState } from './defaults';
import type { NowBoardBridge } from '../lib/bridge';

const NOW = Date.UTC(2026, 9, 25, 12, 0, 0);
const STORAGE_KEY = 'now-board:state:v1';

function bridgeWith(overrides: Partial<NowBoardBridge>): NowBoardBridge {
  return overrides as NowBoardBridge;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('importBoardFile', () => {
  it('parses the raw text returned by the Electron main process', async () => {
    const expected = createInitialState(NOW);
    const importData = vi.fn(async () => ({
      ok: true,
      raw: JSON.stringify(expected),
      fileName: 'board.json',
    }));
    vi.stubGlobal('window', { nowboard: bridgeWith({ importData }) });

    const result = await importBoardFile();

    expect(result.ok).toBe(true);
    expect(result.raw).toEqual(expected);
    expect(result.fileName).toBe('board.json');
  });

  it('reports malformed text instead of passing a string into the board', async () => {
    const importData = vi.fn(async () => ({
      ok: true,
      raw: '{ broken',
      fileName: 'broken.json',
    }));
    vi.stubGlobal('window', { nowboard: bridgeWith({ importData }) });

    const result = await importBoardFile();

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/valid JSON/i);
    expect(result.raw).toBeUndefined();
  });
});

describe('startFreshStorage browser fallback', () => {
  it('writes the fresh board in one step', async () => {
    const store = new Map<string, string>([[STORAGE_KEY, 'previous board']]);
    const setItem = vi.fn((key: string, value: string) => {
      store.set(key, value);
    });
    vi.stubGlobal('window', {});
    vi.stubGlobal('localStorage', { setItem });

    const next = createInitialState(NOW);
    const outcome = await startFreshStorage(next);

    expect(outcome.ok).toBe(true);
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(store.get(STORAGE_KEY)).toBe(JSON.stringify(next));
  });

  it('leaves the existing board untouched when the write fails', async () => {
    const store = new Map<string, string>([[STORAGE_KEY, 'previous board']]);
    vi.stubGlobal('window', {});
    vi.stubGlobal('localStorage', {
      setItem: vi.fn(() => {
        throw new Error('Quota exceeded');
      }),
    });

    const outcome = await startFreshStorage(createInitialState(NOW));

    expect(outcome.ok).toBe(false);
    expect(store.get(STORAGE_KEY)).toBe('previous board');
  });
});
