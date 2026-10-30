import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useBoard } from './hooks/useBoard';
import { isTypingTarget } from './hooks/useUi';
import { getBridge } from './lib/bridge';
import { createHotkeyGate, isAppHotkeyAction, type AppHotkeyAction } from './lib/hotkeys';
import type { BoardState, StatusKind } from './state/types';
import { ACCENT_PALETTES } from './state/defaults';
import { buildPresentViewModel, focusRemainingSeconds } from './state/selectors';
import { formatClockLabel } from './state/time';
import { exportBoard, importBoardFile } from './state/storage';
import { normalizeBoard } from './state/normalize';
import { AmbientBackground } from './components/AmbientBackground';
import { CommandPalette, type CommandItem } from './components/CommandPalette';
import { GoalEditor } from './components/GoalEditor';
import { PresentScreen } from './components/PresentScreen';
import { SettingsDrawer } from './components/SettingsDrawer';
import { ToastProvider, useToast } from './components/Toasts';
import { ConfirmDialog } from './components/ui';
import { EditScreen } from './screens/EditScreen';
import { ShareApp } from './screens/ShareApp';
import { ErrorScreen, LoadingScreen, PanicScreen } from './screens/StaticScreens';

type Mode = 'edit' | 'present';

interface GoalEditorState {
  open: boolean;
  goalId: string | null;
}

interface PendingImport {
  state: BoardState;
  fileName: string;
}

function isShareLocation(): boolean {
  if (typeof window === 'undefined') return false;
  const { pathname, search, hash } = window.location;
  if (pathname.replace(/\/+$/, '').endsWith('/share')) return true;
  if (new URLSearchParams(search).get('view') === 'share') return true;
  return hash === '#share';
}

function errorMessage(caught: unknown): string {
  return caught instanceof Error ? caught.message : 'That file could not be read.';
}

export function App() {
  if (isShareLocation()) return <ShareApp />;
  return (
    <ToastProvider>
      <BoardApp />
    </ToastProvider>
  );
}

function BoardApp() {
  const board = useBoard();
  const { notify } = useToast();
  const [mode, setMode] = useState<Mode>('edit');
  const [panic, setPanic] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [goalEditor, setGoalEditor] = useState<GoalEditorState>({
    open: false,
    goalId: null,
  });
  const [maximized, setMaximized] = useState(false);
  const [hintVisible, setHintVisible] = useState(true);
  const [resetOpen, setResetOpen] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);
  const [importBusy, setImportBusy] = useState(false);

  const quickAddRef = useRef<HTMLInputElement>(null);
  const modeRef = useRef<Mode>(mode);
  const stateRef = useRef<BoardState | null>(board.state);
  const completingFocusRef = useRef(false);
  const notifiedReturnRef = useRef<number | null>(null);
  const lastSaveErrorRef = useRef<string | null>(null);
  const hotkeyGateRef = useRef(createHotkeyGate());
  modeRef.current = mode;
  stateRef.current = board.state;

  const state = board.state;
  const settings = state?.settings;

  // ------------------------------------------------------------------ chrome

  useEffect(() => {
    const root = document.documentElement;
    if (settings) {
      root.dataset.theme = settings.theme;
      root.dataset.reduceMotion = settings.reduceMotion ? 'true' : 'false';
      root.dataset.density = settings.density;
      root.dataset.background = settings.background;
      root.style.setProperty(
        '--accent',
        settings.accent === 'status'
          ? (state?.current.color ?? ACCENT_PALETTES.moss)
          : ACCENT_PALETTES[settings.accent],
      );
      root.style.setProperty('--font-scale', String(settings.fontScale));
      root.style.setProperty('--font-scale-pct', `${100 / settings.fontScale}%`);
      root.style.setProperty('--present-scale', String(settings.fontScale));
    } else {
      try {
        const stored = localStorage.getItem('now-board:theme');
        if (stored === 'light' || stored === 'dark') root.dataset.theme = stored;
      } catch {
        /* cosmetic only */
      }
    }
    root.dataset.mode = mode;
    root.dataset.panic = panic ? 'true' : 'false';
  }, [settings, state?.current.color, mode, panic]);

  useEffect(() => {
    const boardName = state?.settings.boardName ?? 'Now Board';
    document.title = mode === 'present' ? `${boardName} — Present` : boardName;
  }, [mode, state?.settings.boardName]);

  useEffect(() => {
    const bridge = getBridge();
    if (!bridge) return;
    let alive = true;
    void bridge.getWindowState().then((next) => {
      if (alive) setMaximized(next.maximized);
    });
    const off = bridge.onWindowState((next) => setMaximized(next.maximized));
    return () => {
      alive = false;
      off();
    };
  }, []);

  useEffect(() => {
    const bridge = getBridge();
    if (!bridge) return;
    const fullscreen = mode === 'present' && Boolean(settings?.present.fullscreen);
    void bridge.setFullscreen(fullscreen);
  }, [mode, settings?.present.fullscreen]);

  useEffect(() => {
    if (mode !== 'present') {
      setHintVisible(true);
      return;
    }
    setHintVisible(true);
    const timer = setTimeout(() => setHintVisible(false), 6500);
    return () => clearTimeout(timer);
  }, [mode]);

  // ------------------------------------------------------------- transitions

  const showPresent = useCallback(() => {
    setPanic(false);
    setSettingsOpen(false);
    setPaletteOpen(false);
    setGoalEditor({ open: false, goalId: null });
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    setMode('present');
    if (!getBridge() && stateRef.current?.settings.present.fullscreen) {
      void document.documentElement.requestFullscreen().catch(() => undefined);
    }
  }, []);

  const showEdit = useCallback(() => {
    setMode('edit');
    if (!getBridge() && document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    }
  }, []);

  const togglePresent = useCallback(() => {
    if (modeRef.current === 'present') showEdit();
    else showPresent();
  }, [showEdit, showPresent]);

  const activateMode = useCallback(
    (kind: StatusKind, minutes?: number, options?: { present?: boolean }) => {
      const current = stateRef.current;
      if (!current) return;
      const preset = current.presets.find((entry) => entry.kind === kind);
      if (!preset) return;

      board.dispatch({
        type: 'status/set',
        preset,
        returnInMinutes: kind === 'focus' ? null : (minutes ?? null),
      });

      if (kind === 'break') {
        board.dispatch({
          type: 'focus/start',
          mode: 'break',
          durationSec: (minutes ?? 5) * 60,
        });
      } else if (kind === 'focus') {
        board.dispatch({
          type: 'focus/start',
          mode: 'focus',
          durationSec: (minutes ?? 25) * 60,
        });
      } else if (current.focus.running) {
        board.dispatch({ type: 'focus/pause' });
      }

      if (kind !== 'focus' && minutes) {
        notify(
          `${preset.label} · back at ${formatClockLabel(
            Date.now() + minutes * 60_000,
            current.settings.clockFormat,
          )}`,
          { duration: 2600 },
        );
      } else {
        notify(`Status · ${preset.label}`, { duration: 1800 });
      }
      if (options?.present !== false) showPresent();
    },
    [board.dispatch, notify, showPresent],
  );

  const quickCapture = useCallback(() => {
    showEdit();
    setPaletteOpen(false);
    setSettingsOpen(false);
    setGoalEditor({ open: false, goalId: null });
    window.setTimeout(() => quickAddRef.current?.focus(), 40);
  }, [showEdit]);

  const runHotkey = useCallback(
    (action: AppHotkeyAction) => {
      if (!hotkeyGateRef.current.accept(action)) return;
      if (action === 'toggle-present') togglePresent();
      else if (action === 'toggle-panic') setPanic((value) => !value);
      else if (action === 'quick-add') quickCapture();
      else if (action === 'timer-toggle') {
        const current = stateRef.current;
        if (current) {
          board.dispatch(
            current.focus.running ? { type: 'focus/pause' } : { type: 'focus/start' },
          );
        }
      } else if (action === 'mode-focus') activateMode('focus', 25);
      else if (action === 'mode-break') activateMode('break', 15);
      else if (action === 'mode-away') activateMode('away', 30);
      else activateMode('sleep');
    },
    [activateMode, quickCapture, togglePresent],
  );

  const openPalette = useCallback(() => {
    setSettingsOpen(false);
    setGoalEditor({ open: false, goalId: null });
    setPaletteOpen(true);
  }, []);

  const openSettings = useCallback(() => {
    setPaletteOpen(false);
    setGoalEditor({ open: false, goalId: null });
    setSettingsOpen(true);
  }, []);

  const selectPresentPreset = useCallback(
    (presetId: string) => {
      const current = stateRef.current;
      if (!current) return;
      const preset = current.presets.find((entry) => entry.id === presetId);
      if (!preset) return;
      board.dispatch({ type: 'status/set', preset });
    },
    [board.dispatch],
  );

  const openGoalEditor = useCallback((goalId: string | null) => {
    setPaletteOpen(false);
    setSettingsOpen(false);
    setGoalEditor({ open: true, goalId });
  }, []);

  const closeGoalEditor = useCallback(() => {
    setGoalEditor({ open: false, goalId: null });
  }, []);

  useEffect(() => {
    const bridge = getBridge();
    if (!bridge) return;
    return bridge.onHotkey((action) => {
      if (isAppHotkeyAction(action)) runHotkey(action);
    });
  }, [runHotkey]);

  // ---------------------------------------------------------------- shortcuts

  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const mod = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();

      if (event.key === 'Escape') {
        if (panic) {
          event.preventDefault();
          setPanic(false);
          return;
        }
        if (modeRef.current === 'present') {
          event.preventDefault();
          showEdit();
        }
        return;
      }

      if (mod && event.shiftKey && key === 'p') {
        event.preventDefault();
        if (!event.repeat) runHotkey('toggle-present');
        return;
      }
      if (mod && event.shiftKey && key === 'b') {
        event.preventDefault();
        if (!event.repeat) runHotkey('toggle-panic');
        return;
      }
      if (panic || modeRef.current === 'present') return;

      if (mod && key === 'k') {
        event.preventDefault();
        if (paletteOpen) setPaletteOpen(false);
        else if (!settingsOpen && !goalEditor.open) openPalette();
        return;
      }
      if (mod && event.key === ',') {
        event.preventDefault();
        if (settingsOpen) setSettingsOpen(false);
        else if (!paletteOpen && !goalEditor.open) openSettings();
        return;
      }

      if (settingsOpen || paletteOpen || goalEditor.open) return;
      if (isTypingTarget(event.target)) return;
      if (mod || event.altKey) return;

      const current = stateRef.current;
      if (!current) return;

      if (/^[1-9]$/.test(event.key)) {
        const preset = current.presets[Number(event.key) - 1];
        if (preset) {
          event.preventDefault();
          board.dispatch({ type: 'status/set', preset });
        }
        return;
      }

      if (key === 'n' && !event.shiftKey) {
        event.preventDefault();
        quickAddRef.current?.focus();
        return;
      }

      if (key === 'f') {
        event.preventDefault();
        if (event.repeat) return;
        if (event.shiftKey) {
          board.dispatch({ type: 'focus/reset', mode: current.focus.mode });
        } else {
          board.dispatch(
            current.focus.running ? { type: 'focus/pause' } : { type: 'focus/start' },
          );
        }
        return;
      }

      if (!event.shiftKey && !event.repeat && ['b', 'a', 's', 'r'].includes(key)) {
        event.preventDefault();
        if (key === 'b') activateMode('break', 5, { present: false });
        else if (key === 'a') activateMode('away', 30, { present: false });
        else if (key === 's') activateMode('sleep', undefined, { present: false });
        else activateMode('focus', 25, { present: false });
      }
    };

    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [
    activateMode,
    board.dispatch,
    goalEditor.open,
    openPalette,
    openSettings,
    paletteOpen,
    panic,
    settingsOpen,
    showEdit,
    runHotkey,
  ]);

  // ------------------------------------------------------------- save/timers

  useEffect(() => {
    if (!board.saveError) {
      lastSaveErrorRef.current = null;
      return;
    }
    if (lastSaveErrorRef.current === board.saveError) return;
    lastSaveErrorRef.current = board.saveError;
    notify(board.saveError, {
      tone: 'danger',
      duration: 7000,
      action: { label: 'Retry', onClick: board.retrySave },
    });
  }, [board.saveError, board.retrySave, notify]);

  useEffect(() => {
    if (!state?.focus.running) {
      completingFocusRef.current = false;
      return;
    }
    const tick = () => {
      const current = stateRef.current;
      if (!current?.focus.running || completingFocusRef.current) return;
      if (focusRemainingSeconds(current) > 0) return;
      completingFocusRef.current = true;
      const wasBreak = current.focus.mode === 'break';
      board.dispatch({ type: 'focus/complete' });
      if (current.settings.notifyOnTimer) {
        getBridge()?.notify({
          title: wasBreak ? 'Break complete' : 'Focus complete',
          body: wasBreak
            ? 'Ready for another focus session when you are.'
            : 'Take a breath, then choose what comes next.',
        });
      }
      notify(wasBreak ? 'Break over. Ready when you are.' : 'Focus session complete. Take a breath.', {
        tone: 'success',
        duration: 6000,
        action: wasBreak
          ? { label: 'Start focus', onClick: () => activateMode('focus', 25, { present: false }) }
          : { label: 'Take 5', onClick: () => activateMode('break', 5, { present: false }) },
      });
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [
    activateMode,
    board.dispatch,
    notify,
    state?.focus.mode,
    state?.focus.running,
    state?.focus.startedAt,
  ]);

  useEffect(() => {
    const returnAt = state?.current.returnAt ?? null;
    if (returnAt === null) {
      notifiedReturnRef.current = null;
      return;
    }
    // A return time that was already in the past on load is stale; only notify
    // when this session visibly crosses the target while the app is running.
    if (returnAt <= Date.now()) {
      notifiedReturnRef.current = returnAt;
      return;
    }
    const check = () => {
      const current = stateRef.current;
      if (!current || current.current.returnAt !== returnAt) return;
      if (Date.now() < returnAt || notifiedReturnRef.current === returnAt) return;
      notifiedReturnRef.current = returnAt;
      if (!current.settings.notifyOnTimer) return;
      const sleeping = current.current.kind === 'sleep';
      getBridge()?.notify({
        title: sleeping ? 'Wake time' : 'Return time',
        body: sleeping
          ? 'Your wake time has arrived. Rise gently.'
          : 'You planned to be back at the board around now.',
      });
    };
    check();
    const timer = setInterval(check, 5_000);
    return () => clearInterval(timer);
  }, [state?.current.kind, state?.current.returnAt]);

  useEffect(() => {
    const bridge = getBridge();
    if (!bridge) return;
    const returnAt = state?.current.returnAt ?? null;
    // Ask Chromium to keep the renderer at full speed only when a live countdown
    // or the LAN share actually needs sub-minute updates. Otherwise a hidden
    // window is allowed to throttle.
    bridge.setPreciseTimers(
      Boolean(state?.focus.running) ||
        (returnAt !== null && returnAt > Date.now()) ||
        Boolean(state?.settings.lanShare.enabled),
    );
  }, [state?.current.returnAt, state?.focus.running, state?.settings.lanShare.enabled]);

  // -------------------------------------------------------------------- data

  const handleExport = useCallback(async () => {
    const current = stateRef.current;
    if (!current) return;
    const result = await exportBoard(current);
    if (result.ok) {
      notify(result.filePath ? `Exported to ${result.filePath}` : 'Board exported.', {
        tone: 'success',
        duration: 5000,
      });
    } else if (!result.canceled) {
      notify(result.error ?? 'The board could not be exported.', { tone: 'danger' });
    }
  }, [notify]);

  const handleImport = useCallback(async () => {
    const result = await importBoardFile();
    if (result.canceled) return;
    if (!result.ok || result.raw === undefined) {
      notify(result.error ?? 'The board could not be imported.', { tone: 'danger' });
      return;
    }
    try {
      const next = normalizeBoard(result.raw);
      setPendingImport({
        state: next,
        fileName: result.fileName ?? 'board.json',
      });
    } catch (caught) {
      notify(errorMessage(caught), { tone: 'danger' });
    }
  }, [notify]);

  const confirmImport = useCallback(async () => {
    if (!pendingImport) return;
    setImportBusy(true);
    const outcome = await board.replaceBoard(pendingImport.state);
    setImportBusy(false);
    setPendingImport(null);
    if (outcome.ok) {
      notify('Board imported. Your previous file is still available in backups.', {
        tone: 'success',
        duration: 5000,
      });
    } else {
      notify(outcome.error ?? 'Imported, but the board could not be saved.', {
        tone: 'danger',
        duration: 7000,
      });
    }
  }, [board, notify, pendingImport]);

  const confirmReset = useCallback(async () => {
    setResetOpen(false);
    const ok = await board.resetBoard();
    notify(
      ok
        ? 'Board reset. A copy of the previous board was archived.'
        : 'The board could not be reset. Your existing data was left untouched.',
      { tone: ok ? 'success' : 'danger', duration: 5000 },
    );
  }, [board, notify]);

  const confirmRestore = useCallback(async () => {
    setRestoreOpen(false);
    const ok = await board.restoreLatest();
    notify(
      ok
        ? 'The latest daily backup was restored.'
        : 'There was no backup to restore, or it could not be read.',
      { tone: ok ? 'success' : 'danger', duration: 5000 },
    );
  }, [board, notify]);

  const handleReveal = useCallback(async () => {
    const bridge = getBridge();
    if (!bridge) {
      notify('The data folder is only available in the desktop app.', { duration: 3600 });
      return;
    }
    await bridge.revealData();
  }, [notify]);

  // ----------------------------------------------------------------- commands

  const editingGoal = useMemo(() => {
    if (!state || !goalEditor.goalId) return null;
    return state.goals.find((goal) => goal.id === goalEditor.goalId) ?? null;
  }, [goalEditor.goalId, state]);

  const commandItems = useMemo<CommandItem[]>(() => {
    if (!state) return [];
    const items: CommandItem[] = [
      {
        id: 'present',
        label: 'Open Present mode',
        group: 'View',
        hint: 'Ctrl Shift P',
        keywords: 'fullscreen hide edit monitor screen',
        icon: 'monitor',
        action: showPresent,
      },
      {
        id: 'settings',
        label: 'Open settings',
        group: 'View',
        hint: 'Ctrl ,',
        keywords: 'preferences theme appearance share',
        icon: 'sliders',
        action: openSettings,
      },
      {
        id: 'theme',
        label: `Switch to ${state.settings.theme === 'dark' ? 'light' : 'dark'} theme`,
        group: 'View',
        keywords: 'theme appearance dark light',
        icon: state.settings.theme === 'dark' ? 'sun' : 'moon',
        action: () =>
          board.dispatch({
            type: 'settings/update',
            patch: { theme: state.settings.theme === 'dark' ? 'light' : 'dark' },
          }),
      },
      {
        id: 'panic',
        label: 'Be right back (hide everything)',
        group: 'Privacy',
        hint: 'Ctrl Shift B',
        keywords: 'panic privacy hide away screen',
        icon: 'shield',
        action: () => setPanic(true),
      },
      {
        id: 'break-5',
        label: 'Take a 5-minute break',
        group: 'Quick modes',
        hint: '5m',
        keywords: 'break away pause rest coffee quiet',
        icon: 'coffee',
        action: () => activateMode('break', 5),
      },
      {
        id: 'break-15',
        label: 'Take a 15-minute break',
        group: 'Quick modes',
        hint: '15m',
        keywords: 'break away pause rest coffee quiet',
        icon: 'coffee',
        action: () => activateMode('break', 15),
      },
      {
        id: 'away-30',
        label: 'Step away for 30 minutes',
        group: 'Quick modes',
        hint: '30m',
        keywords: 'away out lunch errand back return',
        icon: 'moon',
        action: () => activateMode('away', 30),
      },
      {
        id: 'sleep',
        label: 'Sleeping mode',
        group: 'Quick modes',
        keywords: 'sleep night rest quiet dim away',
        icon: 'moon',
        action: () => activateMode('sleep'),
      },
      {
        id: 'focus-session',
        label: 'Start a 25-minute focus session',
        group: 'Quick modes',
        hint: '25m',
        keywords: 'focus work pomodoro back return',
        icon: 'play',
        action: () => activateMode('focus', 25),
      },
      {
        id: 'new-task',
        label: 'New task',
        group: 'Create',
        hint: 'N',
        keywords: 'add task todo',
        icon: 'plus',
        action: () => {
          showEdit();
          quickAddRef.current?.focus();
        },
      },
      {
        id: 'new-goal',
        label: 'New goal',
        group: 'Create',
        keywords: 'add target milestone',
        icon: 'target',
        action: () => openGoalEditor(null),
      },
      {
        id: 'focus',
        label: state.focus.running ? 'Pause focus timer' : 'Start focus timer',
        group: 'Focus',
        keywords: 'timer pomodoro break',
        icon: state.focus.running ? 'pause' : 'play',
        action: () =>
          board.dispatch(
            state.focus.running ? { type: 'focus/pause' } : { type: 'focus/start' },
          ),
      },
      {
        id: 'focus-reset',
        label: 'Reset focus timer',
        group: 'Focus',
        keywords: 'timer pomodoro clear',
        icon: 'reset',
        action: () => board.dispatch({ type: 'focus/reset', mode: state.focus.mode }),
      },
      {
        id: 'export',
        label: 'Export a JSON copy',
        group: 'Data',
        keywords: 'backup save download file',
        icon: 'download',
        action: () => void handleExport(),
      },
      {
        id: 'import',
        label: 'Import a JSON copy…',
        group: 'Data',
        keywords: 'restore backup load file',
        icon: 'upload',
        action: () => void handleImport(),
      },
    ];

    for (const preset of state.presets) {
      items.push({
        id: `status-${preset.id}`,
        label: `Status: ${preset.label}`,
        group: 'Status',
        emoji: preset.emoji,
        keywords: `${preset.label} ${preset.kind}`,
        action: () => board.dispatch({ type: 'status/set', preset }),
      });
    }

    return items;
  }, [
    activateMode,
    board.dispatch,
    handleExport,
    handleImport,
    openGoalEditor,
    openSettings,
    showEdit,
    showPresent,
    state,
  ]);

  // -------------------------------------------------------------------- view

  const presentView = useMemo(
    () => (state && mode === 'present' ? buildPresentViewModel(state) : null),
    [mode, state],
  );

  return (
    <div className="app-root" data-mode={mode} data-panic={panic ? 'true' : 'false'}>
      <AmbientBackground
        background={settings?.background}
        motion={settings?.ambientMotion}
        reduceMotion={settings?.reduceMotion}
      />

      {board.phase === 'loading' ? <LoadingScreen /> : null}

      {board.phase === 'error' && board.error ? (
        <ErrorScreen
          message={board.error.message}
          dataDir={board.error.dataDir}
          backupCount={board.error.backups.length}
          canRestore={board.error.canRestore}
          busy={board.dataBusy}
          onRetry={board.retry}
          onRestore={() => setRestoreOpen(true)}
          onReset={() => setResetOpen(true)}
          onReveal={() => void handleReveal()}
        />
      ) : null}

      {board.phase === 'ready' && state && mode === 'edit' ? (
        <EditScreen
          state={state}
          dispatch={board.dispatch}
          quickAddRef={quickAddRef}
          saveState={board.saveState}
          saveError={board.saveError}
          lastSavedAt={board.lastSavedAt}
          info={board.info}
          maximized={maximized}
          onPresent={showPresent}
          onOpenPalette={openPalette}
          onOpenSettings={openSettings}
          onRetrySave={board.retrySave}
          onAddGoal={() => openGoalEditor(null)}
          onEditGoal={(goalId) => openGoalEditor(goalId)}
        />
      ) : null}

      {board.phase === 'ready' && state && mode === 'present' && presentView ? (
        <PresentScreen
          view={presentView}
          showHint={hintVisible}
          onSelectPreset={selectPresentPreset}
        />
      ) : null}

      {state ? (
        <>
          <GoalEditor
            open={goalEditor.open}
            goal={editingGoal}
            state={state}
            dispatch={board.dispatch}
            onClose={closeGoalEditor}
          />
          <SettingsDrawer
            open={settingsOpen}
            onClose={() => setSettingsOpen(false)}
            state={state}
            dispatch={board.dispatch}
            info={board.info}
            saveState={board.saveState}
            saveError={board.saveError}
            lastSavedAt={board.lastSavedAt}
            shareInfo={board.shareInfo}
            shortcutStatus={board.shortcutStatus}
            dataBusy={board.dataBusy}
            onExport={() => void handleExport()}
            onImport={() => void handleImport()}
            onRevealData={() => void handleReveal()}
            onRestoreLatest={() => setRestoreOpen(true)}
            onReset={() => setResetOpen(true)}
            onRetrySave={board.retrySave}
          />
          <CommandPalette
            open={paletteOpen && mode === 'edit'}
            onClose={() => setPaletteOpen(false)}
            items={commandItems}
          />
        </>
      ) : null}

      <ConfirmDialog
        open={resetOpen}
        title="Start over with this board?"
        message="The current board is archived first, then replaced with starter content. You can recover the archived file from the data folder."
        confirmLabel="Start over"
        busy={board.dataBusy}
        onClose={() => setResetOpen(false)}
        onConfirm={() => void confirmReset()}
      />
      <ConfirmDialog
        open={restoreOpen}
        title="Restore the latest backup?"
        message="The current board is archived, then the most recent daily backup replaces it. This is the safest way back if something looks wrong."
        confirmLabel="Restore backup"
        tone="accent"
        busy={board.dataBusy}
        onClose={() => setRestoreOpen(false)}
        onConfirm={() => void confirmRestore()}
      />
      <ConfirmDialog
        open={pendingImport !== null}
        title="Import this board?"
        message={
          pendingImport
            ? `“${pendingImport.fileName}” will replace the current board. A copy of the current file stays in backups and archives.`
            : ''
        }
        confirmLabel="Import board"
        tone="accent"
        busy={importBusy}
        onClose={() => {
          if (!importBusy) setPendingImport(null);
        }}
        onConfirm={() => void confirmImport()}
      />

      {panic ? <PanicScreen onExit={() => setPanic(false)} /> : null}
    </div>
  );
}
