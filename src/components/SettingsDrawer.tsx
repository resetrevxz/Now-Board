import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import type {
  Action,
  AccentMode,
  BoardState,
  ClockFormat,
  Density,
  ThemeMode,
  BackgroundStyle,
  SettingsPatch,
} from '../state/types';
import { ACCENT_LABELS, ACCENT_PALETTES } from '../state/defaults';
import type { BoardFileInfo, ShareInfo, ShortcutStatus } from '../lib/bridge';
import { formatClock, formatDate, formatDuration, relativeTime } from '../state/time';
import type { SaveState } from '../hooks/useBoard';
import { getBridge } from '../lib/bridge';
import { useToast } from './Toasts';
import { cx } from '../lib/cx';
import { Icon, type IconName } from './Icon';
import {
  Button,
  InlineToggle,
  Kbd,
  Modal,
  Segmented,
} from './ui';

const ACCENT_OPTIONS: { value: AccentMode; label: string; color?: string }[] = [
  { value: 'status', label: 'Status' },
  { value: 'moss', label: ACCENT_LABELS.moss, color: ACCENT_PALETTES.moss },
  { value: 'tide', label: ACCENT_LABELS.tide, color: ACCENT_PALETTES.tide },
  { value: 'iris', label: ACCENT_LABELS.iris, color: ACCENT_PALETTES.iris },
  { value: 'ember', label: ACCENT_LABELS.ember, color: ACCENT_PALETTES.ember },
  { value: 'rose', label: ACCENT_LABELS.rose, color: ACCENT_PALETTES.rose },
  { value: 'sun', label: ACCENT_LABELS.sun, color: ACCENT_PALETTES.sun },
  { value: 'sea', label: ACCENT_LABELS.sea, color: ACCENT_PALETTES.sea },
  { value: 'lime', label: ACCENT_LABELS.lime, color: ACCENT_PALETTES.lime },
];

const PRESENT_TOGGLES: { key: keyof BoardState['settings']['present']; label: string; detail: string }[] = [
  { key: 'showNow', label: 'Now task', detail: 'The single task you are doing now.' },
  { key: 'showTasks', label: 'Up next', detail: 'A short, calm queue of what follows.' },
  { key: 'showGoals', label: 'Goals', detail: 'Public goals and their progress.' },
  { key: 'showNotes', label: 'Note', detail: 'The note, unless marked private.' },
  { key: 'showTimeline', label: 'Timeline', detail: 'Today’s status rhythm.' },
  { key: 'showStats', label: 'Stats', detail: 'Tasks done and focus tracked today.' },
  { key: 'showFocus', label: 'Focus timer', detail: 'The timer pill in Present mode.' },
  { key: 'showStreak', label: 'Streak', detail: 'Consecutive focus days.' },
  { key: 'showClock', label: 'Clock', detail: 'A quiet local clock in the corner.' },
  { key: 'hideCursor', label: 'Hide cursor', detail: 'No pointer on the shared screen.' },
  { key: 'fullscreen', label: 'Go fullscreen', detail: 'Fill the display when Present opens.' },
];

function shortSize(bytes: number): string {
  if (!bytes) return '0 KB';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function SettingsSection({
  icon,
  title,
  description,
  children,
}: {
  icon: IconName;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="settings-section">
      <div className="settings-section__title">
        <Icon name={icon} size={12} />
        {title}
      </div>
      {description ? <p className="settings-section__description">{description}</p> : null}
      {children}
    </section>
  );
}

export function SettingsDrawer({
  open,
  onClose,
  state,
  dispatch,
  info,
  saveState,
  saveError,
  lastSavedAt,
  shareInfo,
  shortcutStatus,
  dataBusy,
  onExport,
  onImport,
  onRevealData,
  onRestoreLatest,
  onReset,
  onRetrySave,
}: {
  open: boolean;
  onClose: () => void;
  state: BoardState;
  dispatch: (action: Action) => void;
  info: BoardFileInfo | null;
  saveState: SaveState;
  saveError: string | null;
  lastSavedAt: number | null;
  shareInfo: ShareInfo | null;
  shortcutStatus: ShortcutStatus | null;
  dataBusy: boolean;
  onExport: () => void;
  onImport: () => void;
  onRevealData: () => void;
  onRestoreLatest: () => void;
  onReset: () => void;
  onRetrySave: () => void;
}) {
  const { notify } = useToast();
  const [portDraft, setPortDraft] = useState(String(state.settings.lanShare.port));
  const [boardNameDraft, setBoardNameDraft] = useState(state.settings.boardName);
  const [shortcutBusy, setShortcutBusy] = useState(false);
  const bridge = getBridge();
  const settings = state.settings;

  useEffect(() => {
    if (open) setPortDraft(String(settings.lanShare.port));
  }, [open, settings.lanShare.port]);

  useEffect(() => {
    if (open) setBoardNameDraft(settings.boardName);
  }, [open, settings.boardName]);

  const portValue = Number(portDraft);
  const portValid =
    Number.isInteger(portValue) && portValue >= 1024 && portValue <= 65535;
  const portDirty = portValid && portValue !== settings.lanShare.port;

  const update = (patch: SettingsPatch) => {
    dispatch({ type: 'settings/update', patch });
  };

  const updatePresent = (
    key: keyof BoardState['settings']['present'],
    value: boolean,
  ) => {
    dispatch({ type: 'settings/update', patch: { present: { [key]: value } } });
  };

  const commitBoardName = () => {
    const next = boardNameDraft.replace(/\s+/g, ' ').trim() || 'Now Board';
    setBoardNameDraft(next);
    if (next !== settings.boardName) update({ boardName: next });
  };

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      notify(`${label} copied.`, { tone: 'success', duration: 1800 });
    } catch {
      notify('Could not copy to the clipboard.', { tone: 'danger' });
    }
  };

  const createShortcut = async () => {
    if (!bridge) {
      notify('Desktop shortcuts are available in the desktop app.', { tone: 'danger' });
      return;
    }
    setShortcutBusy(true);
    try {
      const result = await bridge.createDesktopShortcut();
      if (!result.ok) {
        notify(result.error ?? 'Could not create the shortcut.', { tone: 'danger' });
        return;
      }
      notify(
        result.dev
          ? 'Development shortcut created. Package the app for a permanent one.'
          : 'Desktop shortcut created.',
        { tone: 'success', duration: 3200 },
      );
    } catch {
      notify('Could not create the shortcut.', { tone: 'danger' });
    } finally {
      setShortcutBusy(false);
    }
  };

  const saveLabel =
    saveState === 'saving'
      ? 'Saving…'
      : saveState === 'error'
        ? 'Save failed'
        : lastSavedAt
          ? `Saved ${relativeTime(lastSavedAt)}`
          : 'No changes yet';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Settings"
      description="Quiet defaults, stored locally. Nothing leaves this machine unless you turn on Share."
      variant="drawer"
    >
      <SettingsSection
        icon="palette"
        title="Appearance"
        description="A board should feel like furniture, not a dashboard."
      >
        <div className="settings-group">
          <div className="settings-row">
            <div className="settings-row__copy">
              <span className="settings-row__title">Theme</span>
              <span className="settings-row__detail">Dark is the default for a second monitor.</span>
            </div>
            <Segmented<ThemeMode>
              label="Theme"
              value={settings.theme}
              onChange={(theme) => {
                update({ theme });
                try {
                  localStorage.setItem('now-board:theme', theme);
                } catch {
                  /* cosmetic only */
                }
              }}
              options={[
                { value: 'dark', label: 'Dark', icon: 'moon' },
                { value: 'light', label: 'Light', icon: 'sun' },
              ]}
            />
          </div>

          <div className="settings-row">
            <div className="settings-row__copy">
              <span className="settings-row__title">Board name</span>
              <span className="settings-row__detail">Shown in the Present header and tray tooltip.</span>
            </div>
            <input
              className="input settings-text-input"
              type="text"
              maxLength={40}
              value={boardNameDraft}
              aria-label="Board name"
              onChange={(event) => setBoardNameDraft(event.target.value)}
              onBlur={commitBoardName}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  commitBoardName();
                  event.currentTarget.blur();
                }
              }}
            />
          </div>

          <div className="settings-accent">
            <span className="settings-row__title">Accent</span>
            <div className="settings-color-grid" role="group" aria-label="Accent color">
              {ACCENT_OPTIONS.map((option) => {
                const color =
                  option.value === 'status' ? state.current.color : option.color ?? 'var(--accent)';
                const active = settings.accent === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    className={cx('accent-option', active && 'is-active')}
                    aria-pressed={active}
                    onClick={() => update({ accent: option.value })}
                  >
                    <span
                      className={cx('swatch', active && 'is-active')}
                      style={{ ['--swatch-color' as string]: color } as CSSProperties}
                    >
                      {option.value === 'status' ? (
                        <span className="accent-option__glyph">A</span>
                      ) : null}
                    </span>
                    <span>{option.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="settings-row">
            <div className="settings-row__copy">
              <span className="settings-row__title">Background</span>
              <span className="settings-row__detail">A soft wash, or a flat field.</span>
            </div>
            <Segmented<BackgroundStyle>
              label="Background"
              value={settings.background}
              onChange={(background) => update({ background })}
              options={[
                { value: 'gradient', label: 'Gradient' },
                { value: 'solid', label: 'Solid' },
              ]}
            />
          </div>

          <InlineToggle
            label="Ambient motion"
            detail="A very slow drift in the background. Off by default because it keeps the GPU warm; turn it on if you like the movement."
            checked={settings.ambientMotion}
            onChange={(ambientMotion) => update({ ambientMotion })}
          />
          <InlineToggle
            label="Reduce motion"
            detail="Shorten transitions and still all ambient movement."
            checked={settings.reduceMotion}
            onChange={(reduceMotion) => update({ reduceMotion })}
          />

          <div className="settings-row">
            <div className="settings-row__copy">
              <span className="settings-row__title">Density</span>
              <span className="settings-row__detail">Comfortable leaves more breathing room.</span>
            </div>
            <Segmented<Density>
              label="Density"
              value={settings.density}
              onChange={(density) => update({ density })}
              options={[
                { value: 'comfortable', label: 'Comfortable' },
                { value: 'compact', label: 'Compact' },
              ]}
            />
          </div>

          <div className="settings-slider-row">
            <div className="settings-slider-head">
              <span className="settings-row__title">Text scale</span>
              <span className="settings-slider-value">{Math.round(settings.fontScale * 100)}%</span>
            </div>
            <input
              className="range"
              type="range"
              min={85}
              max={130}
              step={5}
              value={Math.round(settings.fontScale * 100)}
              aria-label="Text scale"
              style={
                {
                  ['--range-progress' as string]: `${
                    ((settings.fontScale * 100 - 85) / 45) * 100
                  }%`,
                } as CSSProperties
              }
              onChange={(event) => update({ fontScale: Number(event.target.value) / 100 })}
            />
          </div>
        </div>
      </SettingsSection>

      <SettingsSection
        icon="monitor"
        title="Present screen"
        description="What the second monitor shows. Private items are always excluded."
      >
        <div className="settings-group">
          <div className="settings-row">
            <div className="settings-row__copy">
              <span className="settings-row__title">Clock</span>
              <span className="settings-row__detail">Use the system format or force 12/24-hour time.</span>
            </div>
            <Segmented<ClockFormat>
              label="Clock format"
              value={settings.clockFormat}
              onChange={(clockFormat) => update({ clockFormat })}
              options={[
                { value: 'system', label: 'System' },
                { value: '12h', label: '12h' },
                { value: '24h', label: '24h' },
              ]}
            />
          </div>
          {PRESENT_TOGGLES.map((item) => (
            <InlineToggle
              key={item.key}
              label={item.label}
              detail={item.detail}
              checked={Boolean(settings.present[item.key])}
              onChange={(value) => updatePresent(item.key, value)}
            />
          ))}
        </div>
        <p className="settings-note">
          Break, away and Sleeping scenes are intentionally quieter. Objectives, tasks and notes
          stay hidden until you return to a focus status.
        </p>
      </SettingsSection>

      <SettingsSection
        icon="target"
        title="Focus rhythm"
        description="A gentle daily target, and a nudge when a timer or return time finishes."
      >
        <div className="settings-group">
          <div className="settings-slider-row">
            <div className="settings-slider-head">
              <span className="settings-row__title">Daily focus goal</span>
              <span className="settings-slider-value">
                {settings.focusTargetMin > 0
                  ? formatDuration(settings.focusTargetMin * 60_000)
                  : 'Off'}
              </span>
            </div>
            <input
              className="range"
              type="range"
              min={0}
              max={480}
              step={30}
              value={settings.focusTargetMin}
              aria-label="Daily focus goal"
              style={
                {
                  ['--range-progress' as string]: `${(settings.focusTargetMin / 480) * 100}%`,
                } as CSSProperties
              }
              onChange={(event) => update({ focusTargetMin: Number(event.target.value) })}
            />
          </div>
          <InlineToggle
            label="Desktop notifications"
            detail="Notify when a focus session ends or a return/wake time arrives. Local only."
            checked={settings.notifyOnTimer}
            onChange={(notifyOnTimer) => update({ notifyOnTimer })}
          />
        </div>
      </SettingsSection>

      <SettingsSection icon="sliders" title="Behavior">
        <div className="settings-group">
          <InlineToggle
            label="Always on top"
            detail="Keep the board above other windows on this display."
            checked={settings.alwaysOnTop}
            onChange={(alwaysOnTop) => update({ alwaysOnTop })}
          />
          <InlineToggle
            label="Keep display awake"
            detail="Prevents the screen from sleeping while the board is open."
            checked={settings.keepAwake}
            onChange={(keepAwake) => update({ keepAwake })}
          />
          <InlineToggle
            label="Open at login"
            detail="Starts quietly when you sign in. Available in the packaged build."
            checked={settings.launchAtLogin}
            onChange={(launchAtLogin) => update({ launchAtLogin })}
          />
          <InlineToggle
            label="Close to tray"
            detail="Closing hides the board instead of quitting. Reopen it from the tray icon or the Open shortcut."
            checked={settings.closeToTray}
            onChange={(closeToTray) => update({ closeToTray })}
          />
          <InlineToggle
            label="Global shortcuts"
            detail="Present, Panic, and Open work even when the board is not focused."
            checked={settings.globalHotkeys}
            onChange={(globalHotkeys) => update({ globalHotkeys })}
          />
          <div className="settings-row">
            <div className="settings-row__copy">
              <span className="settings-row__title">Desktop shortcut</span>
              <span className="settings-row__detail">
                {bridge
                  ? 'Put a launch icon on your desktop. It points at this build.'
                  : 'Available in the desktop app.'}
              </span>
            </div>
            <Button
              size="sm"
              variant="subtle"
              icon="external"
              disabled={!bridge || shortcutBusy}
              onClick={() => void createShortcut()}
            >
              {shortcutBusy ? 'Creating…' : 'Create'}
            </Button>
          </div>
        </div>
        <div className="hotkey-list">
          <div className="hotkey-row">
            <span>Toggle Present mode</span>
            <span className="hotkey-row__keys">
              <Kbd>Ctrl</Kbd>
              <Kbd>Shift</Kbd>
              <Kbd>P</Kbd>
            </span>
          </div>
          <div className="hotkey-row">
            <span>Open / show Now Board</span>
            <span className="hotkey-row__keys">
              <Kbd>Ctrl</Kbd>
              <Kbd>Alt</Kbd>
              <Kbd>O</Kbd>
            </span>
          </div>
          <div className="hotkey-row">
            <span>Quick capture a task</span>
            <span className="hotkey-row__keys">
              <Kbd>Ctrl</Kbd>
              <Kbd>Alt</Kbd>
              <Kbd>N</Kbd>
            </span>
          </div>
          <div className="hotkey-row">
            <span>Panic — hide everything</span>
            <span className="hotkey-row__keys">
              <Kbd>Ctrl</Kbd>
              <Kbd>Shift</Kbd>
              <Kbd>B</Kbd>
            </span>
          </div>
          {shortcutStatus?.failed.length ? (
            <p className="settings-note settings-note--warning">
              Windows reserved {shortcutStatus.failed.join(', ')}. Turn global shortcuts off, or
              use the in-app shortcuts.
            </p>
          ) : null}
        </div>
      </SettingsSection>

      <SettingsSection
        icon="wifi"
        title="Share on your network"
        description="A read-only Present view for a phone or another computer on the same LAN. No accounts, no cloud."
      >
        <div className="settings-group">
          <InlineToggle
            label="Enable local share"
            detail="Serves this build and a sanitized snapshot on your local network."
            checked={settings.lanShare.enabled}
            onChange={(enabled) => update({ lanShare: { enabled } })}
          />
          <div className="settings-row">
            <div className="settings-row__copy">
              <span className="settings-row__title">Port</span>
              <span className="settings-row__detail">1024–65535. Changes restart the server.</span>
            </div>
            <div className="port-row">
              <input
                className="input"
                inputMode="numeric"
                value={portDraft}
                aria-label="Share server port"
                aria-invalid={!portValid}
                onChange={(event) => setPortDraft(event.target.value.replace(/[^0-9]/g, ''))}
                onBlur={() => {
                  if (!portValid) setPortDraft(String(settings.lanShare.port));
                }}
              />
              <Button
                size="sm"
                variant="subtle"
                disabled={!portDirty}
                onClick={() =>
                  update({ lanShare: { port: portValue } })
                }
              >
                Apply
              </Button>
            </div>
          </div>
          <div className={cx('share-status', shareInfo?.running && 'is-on', shareInfo?.error && 'is-error')}>
            <span className="share-status__dot" />
            {!settings.lanShare.enabled
              ? 'Share is off'
              : shareInfo?.error
                ? shareInfo.error
                : shareInfo?.running
                  ? `Serving on port ${shareInfo.port}`
                  : 'Starting share server…'}
          </div>
          {settings.lanShare.enabled && shareInfo?.urls.length ? (
            <>
              <div className="share-url-list">
                {shareInfo.urls.map((url) => {
                  const shareUrl = `${url}/share`;
                  return (
                    <div className="share-url" key={url}>
                      <span>{shareUrl}</span>
                      <button
                        type="button"
                        className="icon-btn icon-btn--sm"
                        aria-label={`Copy ${shareUrl}`}
                        title="Copy read-only link"
                        onClick={() => void copy(shareUrl, 'Read-only link')}
                      >
                        <Icon name="link" size={13} />
                      </button>
                    </div>
                  );
                })}
              </div>
              <p className="settings-note">
                Open the link on a device on the same network. It shows Present mode only —
                private tasks, goals and notes never leave this app.
              </p>
            </>
          ) : null}
        </div>
      </SettingsSection>

      <SettingsSection icon="folder" title="Your data">
        <div className="settings-group">
          <div className="settings-row">
            <div className="settings-row__copy">
              <span className="settings-row__title">Save status</span>
              <span className={cx('settings-row__detail', saveState === 'error' && 'is-danger')}>
                {saveError ?? saveLabel}
              </span>
              {saveState === 'error' ? (
                <button type="button" className="linkish" onClick={onRetrySave}>
                  Retry now
                </button>
              ) : null}
            </div>
            <span className="count">{info ? shortSize(info.size) : 'Browser storage'}</span>
          </div>

          {info?.stateFile ? (
            <>
              <div className="settings-path">{info.stateFile}</div>
              <div className="settings-actions">
                <Button size="sm" variant="subtle" icon="folder" onClick={onRevealData}>
                  Show folder
                </Button>
                <Button size="sm" variant="subtle" icon="download" onClick={onExport}>
                  Export
                </Button>
                <Button size="sm" variant="subtle" icon="upload" onClick={onImport}>
                  Import
                </Button>
              </div>
            </>
          ) : (
            <div className="settings-actions">
              <Button size="sm" variant="subtle" icon="download" onClick={onExport}>
                Export
              </Button>
              <Button size="sm" variant="subtle" icon="upload" onClick={onImport}>
                Import
              </Button>
            </div>
          )}

          {info?.backups.length ? (
            <div className="settings-row">
              <div className="settings-row__copy">
                <span className="settings-row__title">Daily backup</span>
                <span className="settings-row__detail">
                  {info.backups[0]
                    ? `${info.backups[0].name} · ${formatDate(info.backups[0].mtime)} ${formatClock(
                        info.backups[0].mtime,
                      )}`
                    : 'No backup yet'}
                </span>
              </div>
              <Button size="sm" variant="ghost" disabled={dataBusy} onClick={onRestoreLatest}>
                Restore
              </Button>
            </div>
          ) : null}

          <p className="settings-note">
            Saves are atomic, backups are written once a day, and your board stays on this
            machine. Export a JSON copy before big changes.
          </p>

          <div className="settings-danger-zone">
            <div className="settings-row">
              <div className="settings-row__copy">
                <span className="settings-row__title">Start over</span>
                <span className="settings-row__detail">
                  Archive the current board, then begin again with starter content.
                </span>
              </div>
              <Button size="sm" variant="danger" disabled={dataBusy} onClick={onReset}>
                Reset…
              </Button>
            </div>
          </div>
        </div>
      </SettingsSection>

      {!bridge ? (
        <p className="settings-note">
          Running in a browser: changes are saved to local storage. Desktop-only features such as
          global shortcuts, backups and the share server are unavailable.
        </p>
      ) : null}

      <p className="settings-note settings-version">Now Board v{__APP_VERSION__} · local-first</p>
    </Modal>
  );
}
