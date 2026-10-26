import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Action, BoardState, PresentViewModel } from '../state/types';
import { reducer } from '../state/reducer';
import type { BoardFileInfo } from '../lib/bridge';
import { getBridge } from '../lib/bridge';
import type { ShortcutStatus, ShareInfo } from '../lib/bridge';
import type { LoadFailure, SaveOutcome } from '../state/storage';
import {
  freshBoard,
  loadBoard,
  restoreBackup,
  saveBoard,
  saveBoardSync,
  startFreshStorage,
} from '../state/storage';
import { buildPresentViewModel } from '../state/selectors';

export type LoadPhase = 'loading' | 'ready' | 'error';
export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export interface BoardError {
  message: string;
  source: 'electron' | 'browser';
  canRestore: boolean;
  dataDir: string;
  backups: BoardFileInfo['backups'];
  info: BoardFileInfo | null;
}

export interface UseBoard {
  state: BoardState | null;
  dispatch: (action: Action) => void;
  phase: LoadPhase;
  error: BoardError | null;
  saveState: SaveState;
  saveError: string | null;
  lastSavedAt: number | null;
  info: BoardFileInfo | null;
  retry: () => void;
  retrySave: () => void;
  restoreLatest: () => Promise<boolean>;
  resetBoard: () => Promise<boolean>;
  replaceBoard: (next: BoardState) => Promise<SaveOutcome>;
  shareInfo: ShareInfo | null;
  shortcutStatus: ShortcutStatus | null;
  presentView: PresentViewModel | null;
  dataBusy: boolean;
}

function toBoardError(failure: LoadFailure): BoardError {
  return {
    message: failure.error,
    source: failure.source,
    canRestore: failure.canRestore,
    dataDir: failure.info?.dataDir ?? '',
    backups: failure.info?.backups ?? [],
    info: failure.info,
  };
}

export function useBoard(): UseBoard {
  const [state, setState] = useState<BoardState | null>(null);
  const [phase, setPhase] = useState<LoadPhase>('loading');
  const [error, setError] = useState<BoardError | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [info, setInfo] = useState<BoardFileInfo | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [shareInfo, setShareInfo] = useState<ShareInfo | null>(null);
  const [shortcutStatus, setShortcutStatus] = useState<ShortcutStatus | null>(null);
  const [dataBusy, setDataBusy] = useState(false);

  const stateRef = useRef<BoardState | null>(null);
  stateRef.current = state;
  const lastSavedJsonRef = useRef<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveSeqRef = useRef(0);

  const dispatch = useCallback((action: Action) => {
    setState((current) => (current ? reducer(current, action) : current));
  }, []);

  useEffect(() => {
    let alive = true;
    setPhase('loading');
    setError(null);
    setState(null);
    loadBoard()
      .then((outcome) => {
        if (!alive) return;
        if (!outcome.ok) {
          setError(toBoardError(outcome));
          setInfo(outcome.info);
          setPhase('error');
          return;
        }
        const json = JSON.stringify(outcome.state);
        lastSavedJsonRef.current = outcome.fresh ? null : json;
        setState(outcome.state);
        setInfo(outcome.info);
        setLastSavedAt(outcome.fresh ? null : (outcome.info?.mtime ?? null));
        setPhase('ready');
        setSaveState(outcome.fresh ? 'saving' : 'saved');
      })
      .catch((caught: unknown) => {
        if (!alive) return;
        setError({
          message:
            caught instanceof Error
              ? caught.message
              : 'The board could not be loaded for an unknown reason.',
          source: 'browser',
          canRestore: false,
          dataDir: '',
          backups: [],
          info: null,
        });
        setPhase('error');
      });
    return () => {
      alive = false;
    };
  }, [attempt]);

  const performSave = useCallback(async (target: BoardState, quiet = false): Promise<SaveOutcome> => {
    const seq = ++saveSeqRef.current;
    if (!quiet) {
      setSaveState('saving');
      setSaveError(null);
    }
    const result = await saveBoard(target);
    if (seq === saveSeqRef.current) {
      if (result.ok) {
        lastSavedJsonRef.current = JSON.stringify(target);
        setLastSavedAt(result.savedAt ?? Date.now());
        setSaveState('saved');
        setSaveError(null);
      } else {
        setSaveState('error');
        setSaveError(result.error ?? 'The board could not be saved.');
      }
    }
    return result;
  }, []);

  useEffect(() => {
    if (!state || phase !== 'ready') return;
    const json = JSON.stringify(state);
    if (json === lastSavedJsonRef.current) return;
    setSaveState('saving');
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void performSave(state);
    }, 140);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [state, phase, performSave]);

  useEffect(() => {
    const flush = () => {
      const current = stateRef.current;
      if (!current) return;
      const json = JSON.stringify(current);
      if (json === lastSavedJsonRef.current) return;
      saveBoardSync(current);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('beforeunload', flush);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  const retrySave = useCallback(() => {
    if (!stateRef.current) return;
    void performSave(stateRef.current);
  }, [performSave]);

  const retry = useCallback(() => {
    setAttempt((value) => value + 1);
  }, []);

  const replaceBoard = useCallback(
    async (next: BoardState): Promise<SaveOutcome> => {
      lastSavedJsonRef.current = null;
      setState(next);
      return performSave(next);
    },
    [performSave],
  );

  const restoreLatest = useCallback(async () => {
    const latest = error?.backups[0] ?? info?.backups[0];
    if (!latest) {
      setError((current) =>
        current
          ? { ...current, message: 'There is no backup available to restore yet.' }
          : current,
      );
      return false;
    }
    setDataBusy(true);
    const outcome = await restoreBackup(latest.name);
    setDataBusy(false);
    if (!outcome.ok) {
      setError({
        ...(error ?? {
          message: outcome.error,
          source: 'electron' as const,
          canRestore: false,
          dataDir: '',
          backups: [],
          info: null,
        }),
        message: outcome.error,
      });
      return false;
    }
    lastSavedJsonRef.current = JSON.stringify(outcome.state);
    setState(outcome.state);
    setInfo(outcome.info);
    setError(null);
    setSaveState('saved');
    setLastSavedAt(Date.now());
    setPhase('ready');
    return true;
  }, [error, info]);

  const resetBoard = useCallback(async () => {
    const next = freshBoard();
    setDataBusy(true);
    const cleared = await startFreshStorage(next);
    setDataBusy(false);
    if (!cleared.ok) {
      setError((current) =>
        current
          ? { ...current, message: cleared.error ?? 'The board could not be reset.' }
          : {
              message: cleared.error ?? 'The board could not be reset.',
              source: 'electron',
              canRestore: false,
              dataDir: '',
              backups: [],
              info: null,
            },
      );
      return false;
    }
    lastSavedJsonRef.current = JSON.stringify(next);
    setState(next);
    setInfo(cleared.info);
    setError(null);
    setPhase('ready');
    setSaveState('saved');
    setSaveError(null);
    setLastSavedAt(Date.now());
    return true;
  }, []);

  const bridge = getBridge();

  // Keep OS-level behavior in sync with saved settings.
  const alwaysOnTop = state?.settings.alwaysOnTop;
  useEffect(() => {
    if (!bridge || alwaysOnTop === undefined) return;
    void bridge.setAlwaysOnTop(alwaysOnTop);
  }, [bridge, alwaysOnTop]);

  const keepAwake = state?.settings.keepAwake;
  useEffect(() => {
    if (!bridge || keepAwake === undefined) return;
    void bridge.setKeepAwake(keepAwake);
  }, [bridge, keepAwake]);

  const launchAtLogin = state?.settings.launchAtLogin;
  useEffect(() => {
    if (!bridge || launchAtLogin === undefined) return;
    void bridge.setLoginItem(launchAtLogin);
  }, [bridge, launchAtLogin]);

  const closeToTray = state?.settings.closeToTray;
  useEffect(() => {
    if (!bridge || closeToTray === undefined) return;
    void bridge.setCloseToTray(closeToTray);
  }, [bridge, closeToTray]);

  const globalHotkeys = state?.settings.globalHotkeys;
  useEffect(() => {
    if (!bridge || globalHotkeys === undefined) return;
    void bridge.configureShortcuts(globalHotkeys).then(setShortcutStatus);
  }, [bridge, globalHotkeys]);

  useEffect(() => {
    if (!bridge) return;
    void bridge.getShortcutStatus().then(setShortcutStatus);
    return bridge.onShortcutStatus(setShortcutStatus);
  }, [bridge]);

  useEffect(() => {
    if (!bridge) return;
    void bridge.getShareInfo().then(setShareInfo);
    return bridge.onShareInfo(setShareInfo);
  }, [bridge]);

  const shareEnabled = state?.settings.lanShare.enabled;
  const sharePort = state?.settings.lanShare.port;
  useEffect(() => {
    if (!bridge || shareEnabled === undefined || sharePort === undefined) return;
    void bridge
      .configureShare({ enabled: shareEnabled, port: sharePort })
      .then(setShareInfo);
  }, [bridge, shareEnabled, sharePort]);

  useEffect(() => {
    if (!bridge || !state || !state.settings.lanShare.enabled) return;
    bridge.publishShare(buildPresentViewModel(state));
  }, [bridge, state]);

  useEffect(() => {
    if (!bridge || !state?.settings.lanShare.enabled) return;
    const interval = setInterval(() => {
      const current = stateRef.current;
      if (!current) return;
      bridge.publishShare(buildPresentViewModel(current));
    }, 20_000);
    return () => clearInterval(interval);
  }, [bridge, state?.settings.lanShare.enabled]);

  useEffect(() => {
    const onFocus = () => {
      if (stateRef.current) void performSave(stateRef.current, true);
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [performSave]);

  const presentView = useMemo(
    () => (state && state.settings.lanShare.enabled ? buildPresentViewModel(state) : null),
    [state],
  );

  return {
    state,
    dispatch,
    phase,
    error,
    saveState,
    saveError,
    lastSavedAt,
    info,
    retry,
    retrySave,
    restoreLatest,
    resetBoard,
    replaceBoard,
    shareInfo,
    shortcutStatus,
    presentView,
    dataBusy,
  };
}
