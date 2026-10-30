import type { RefObject } from 'react';
import type { Action, BoardState } from '../state/types';
import type { SaveState } from '../hooks/useBoard';
import type { BoardFileInfo } from '../lib/bridge';
import { StatusHero } from '../components/StatusHero';
import { TodayCard } from '../components/TodayCard';
import { TasksPanel } from '../components/TasksPanel';
import { GoalsPanel } from '../components/GoalsPanel';
import { NotesPanel } from '../components/NotesPanel';
import { Titlebar } from '../components/Titlebar';
import { Icon } from '../components/Icon';
import { Kbd } from '../components/ui';

export function EditScreen({
  state,
  dispatch,
  quickAddRef,
  saveState,
  saveError,
  lastSavedAt,
  info,
  maximized,
  onPresent,
  onOpenPalette,
  onOpenSettings,
  onRetrySave,
  onAddGoal,
  onEditGoal,
}: {
  state: BoardState;
  dispatch: (action: Action) => void;
  quickAddRef: RefObject<HTMLInputElement | null>;
  saveState: SaveState;
  saveError: string | null;
  lastSavedAt: number | null;
  info: BoardFileInfo | null;
  maximized: boolean;
  onPresent: () => void;
  onOpenPalette: () => void;
  onOpenSettings: () => void;
  onRetrySave: () => void;
  onAddGoal: () => void;
  onEditGoal: (goalId: string) => void;
}) {
  return (
    <div className="edit-shell">
      <a className="skip-link" href="#board-main">
        Skip to board
      </a>
      <Titlebar
        saveState={saveState}
        saveError={saveError}
        lastSavedAt={lastSavedAt}
        maximized={maximized}
        boardName={state.settings.boardName}
        onPresent={onPresent}
        onOpenPalette={onOpenPalette}
        onOpenSettings={onOpenSettings}
        onRetrySave={onRetrySave}
      />
      <main className="edit-content" id="board-main" tabIndex={-1}>
        <div className="hero-row">
          <StatusHero state={state} dispatch={dispatch} />
          <TodayCard state={state} dispatch={dispatch} />
        </div>
        <div className="workspace">
          <TasksPanel
            state={state}
            dispatch={dispatch}
            quickAddRef={quickAddRef}
            onOpenGoal={onEditGoal}
          />
          <div className="side-stack">
            <GoalsPanel
              state={state}
              dispatch={dispatch}
              onAdd={onAddGoal}
              onEdit={onEditGoal}
            />
            <NotesPanel state={state} dispatch={dispatch} />
          </div>
        </div>
      </main>
      <footer className="edit-statusbar">
        <div className="statusbar-hints">
          <span className="statusbar-hint">
            <Kbd>1–9</Kbd> status
          </span>
          <span className="statusbar-hint">
            <Kbd>N</Kbd> new task
          </span>
          <span className="statusbar-hint">
            <Kbd>F</Kbd> focus
          </span>
          <span className="statusbar-hint">
            <Kbd>Ctrl</Kbd>
            <Kbd>K</Kbd> commands
          </span>
          <span className="statusbar-hint">
            <Kbd>Alt</Kbd>
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> reorder
          </span>
          <span className="statusbar-hint">
            <Kbd>Ctrl</Kbd>
            <Kbd>Shift</Kbd>
            <Kbd>P</Kbd> present
          </span>
        </div>
        <span className="statusbar-local">
          <Icon name="shield" size={11} />
          Local only{info?.backups.length ? ' · daily backup ready' : ''} · no telemetry
        </span>
      </footer>
    </div>
  );
}
