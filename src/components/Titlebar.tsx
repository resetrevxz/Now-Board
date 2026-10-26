import type { SaveState } from '../hooks/useBoard';
import { relativeTime } from '../state/time';
import { useNow } from '../hooks/useUi';
import { cx } from '../lib/cx';
import { BrandMark } from './BrandMark';
import { Icon } from './Icon';
import { IconButton, Kbd } from './ui';
import { WindowControls } from './WindowControls';

export function Titlebar({
  saveState,
  saveError,
  lastSavedAt,
  maximized,
  onPresent,
  onOpenPalette,
  onOpenSettings,
  onRetrySave,
}: {
  saveState: SaveState;
  saveError: string | null;
  lastSavedAt: number | null;
  maximized: boolean;
  onPresent: () => void;
  onOpenPalette: () => void;
  onOpenSettings: () => void;
  onRetrySave: () => void;
}) {
  const now = useNow(30_000);
  const saveLabel =
    saveState === 'saving'
      ? 'Saving…'
      : saveState === 'error'
        ? 'Save failed'
        : lastSavedAt
          ? `Saved ${relativeTime(lastSavedAt, now)}`
          : 'Unsaved';

  return (
    <header className="titlebar">
      <div className="titlebar__drag drag-region">
        <div className="brand">
          <span className="brand-mark">
            <BrandMark />
          </span>
          <span className="brand-name">Now Board</span>
          <span className="mode-tag">Edit</span>
        </div>
        <span className="titlebar__context" aria-hidden="true">
          A quiet place for the work in front of you.
        </span>
        <button
          type="button"
          className={cx('save-indicator', `is-${saveState}`)}
          title={saveError ?? saveLabel}
          onClick={saveState === 'error' ? onRetrySave : undefined}
          disabled={saveState !== 'error'}
        >
          <span className="save-indicator__dot" aria-hidden="true" />
          <span>{saveLabel}</span>
        </button>
      </div>
      <div className="titlebar__actions no-drag">
        <button
          type="button"
          className="cmd-trigger"
          onClick={onOpenPalette}
        >
          <Icon name="search" size={13} />
          <span className="cmd-trigger__label">Jump to…</span>
          <Kbd>Ctrl</Kbd>
          <Kbd>K</Kbd>
        </button>
        <IconButton
          label="Settings (Ctrl+,)"
          icon="sliders"
          size="sm"
          onClick={onOpenSettings}
        />
        <button type="button" className="btn btn--accent btn--sm" onClick={onPresent}>
          <Icon name="monitor" size={14} />
          <span className="btn__label">Present</span>
        </button>
        <WindowControls maximized={maximized} />
      </div>
    </header>
  );
}
