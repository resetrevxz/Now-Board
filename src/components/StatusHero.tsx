import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import type { BoardState, StatusKind } from '../state/types';
import type { Action } from '../state/types';
import { buildTimeline } from '../state/selectors';
import { formatDuration } from '../state/time';
import { cx } from '../lib/cx';
import { useDismiss, useNow } from '../hooks/useUi';
import { useToast } from './Toasts';
import { Icon } from './Icon';
import { Kbd } from './ui';
import { Timeline } from './Timeline';

const STATUS_COLORS = [
  '#4ADE9D',
  '#6FB6FF',
  '#B6A0FF',
  '#FFA46D',
  '#FF93C8',
  '#FFCB6B',
  '#A3AEBF',
  '#F2F4F7',
];

export function StatusHero({
  state,
  dispatch,
}: {
  state: BoardState;
  dispatch: (action: Action) => void;
}) {
  const now = useNow(15_000);
  const { notify } = useToast();
  const [draft, setDraft] = useState(state.current.subline);
  const [customOpen, setCustomOpen] = useState(false);
  const sublineFocused = useRef(false);
  const customAnchor = useRef<HTMLDivElement>(null);
  const session = state.sessions.find((entry) => entry.endedAt === null);

  useEffect(() => {
    if (!sublineFocused.current) setDraft(state.current.subline);
  }, [state.current.subline, state.current.since]);

  useDismiss(customAnchor, customOpen, () => setCustomOpen(false));

  const commitSubline = () => {
    const next = draft.replace(/\s+/g, ' ').trim();
    if (next !== state.current.subline) {
      dispatch({ type: 'status/subline', subline: next });
    }
  };

  const handleSublineKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitSubline();
      event.currentTarget.blur();
    }
    if (event.key === 'Escape') {
      setDraft(state.current.subline);
      event.currentTarget.blur();
    }
  };

  const resetTimer = () => {
    dispatch({ type: 'status/resetTimer' });
    notify('Status timer restarted.', { duration: 2200 });
  };

  const timeline = buildTimeline(state.sessions, now);

  return (
    <section className="status-hero" aria-label="Current status">
      <div className="status-hero__top">
        <div className="status-hero__meta">
          <span className="live-dot" aria-hidden="true" />
          <span className="eyebrow">Current status</span>
        </div>
        <div className="status-hero__session">
          <Icon name="clock" size={13} />
          <span>
            For <strong>{formatDuration(Math.max(0, now - state.current.since))}</strong>
          </span>
          <IconButtonSmall label="Restart status timer" onClick={resetTimer} />
        </div>
      </div>

      <div
        className="status-hero__headline"
        style={{ ['--status-color' as string]: state.current.color } as CSSProperties}
      >
        <div className="status-emoji" aria-hidden="true">
          {state.current.emoji || '•'}
        </div>
        <div className="status-hero__headline-copy">
          <h1 className="status-title" aria-live="polite">
            {state.current.label}
          </h1>
          <div className="status-subline">
            <label className="status-subline__label" htmlFor="status-subline">
              Working on
            </label>
            <input
              id="status-subline"
              type="text"
              maxLength={120}
              value={draft}
              placeholder="One line about what right now looks like…"
              spellCheck
              onFocus={() => {
                sublineFocused.current = true;
              }}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={() => {
                sublineFocused.current = false;
                commitSubline();
              }}
              onKeyDown={handleSublineKey}
            />
            <Icon name="arrow-right" size={14} className="status-subline__icon" />
          </div>
        </div>
      </div>

      <div className="status-presets" aria-label="Status presets">
        {state.presets.map((preset, index) => {
          const active = state.current.presetId === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              className={cx('chip', active && 'is-active')}
              style={{ ['--chip-color' as string]: preset.color } as CSSProperties}
              aria-pressed={active}
              title={`${preset.label} · press ${index + 1}`}
              onClick={() => {
                dispatch({ type: 'status/set', preset });
                if (session && session.label !== preset.label) {
                  notify(`Status · ${preset.label}`, { duration: 1600 });
                }
              }}
            >
              <span className="chip__emoji" aria-hidden="true">
                {preset.emoji}
              </span>
              <span>{preset.label}</span>
              {active ? <span className="chip__dot" /> : <Kbd>{index + 1}</Kbd>}
            </button>
          );
        })}
        <div className="popover-anchor" ref={customAnchor}>
          <button
            type="button"
            className={cx('chip', 'chip--add', customOpen && 'is-active')}
            aria-expanded={customOpen}
            onClick={() => setCustomOpen((open) => !open)}
          >
            <Icon name="plus" size={13} />
            <span>Custom</span>
          </button>
          {customOpen ? (
            <CustomStatusPopover
              state={state}
              onClose={() => setCustomOpen(false)}
              onSubmit={(payload) => {
                dispatch({ type: 'status/custom', ...payload });
                setCustomOpen(false);
                notify(`Status · ${payload.label}`, { duration: 1800 });
              }}
            />
          ) : null}
        </div>
      </div>

      <Timeline model={timeline} />
    </section>
  );
}

function IconButtonSmall({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className="icon-btn icon-btn--sm"
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      <Icon name="reset" size={12} />
    </button>
  );
}

function CustomStatusPopover({
  state,
  onClose,
  onSubmit,
}: {
  state: BoardState;
  onClose: () => void;
  onSubmit: (payload: {
    label: string;
    emoji: string;
    color: string;
    kind: StatusKind;
    subline?: string;
  }) => void;
}) {
  const [label, setLabel] = useState(
    state.current.presetId === null ? state.current.label : '',
  );
  const [emoji, setEmoji] = useState(
    state.current.presetId === null ? state.current.emoji : '✨',
  );
  const [color, setColor] = useState(state.current.color);
  const [kind, setKind] = useState<StatusKind>('focus');

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    const cleanLabel = label.replace(/\s+/g, ' ').trim().slice(0, 48);
    if (!cleanLabel) return;
    onSubmit({
      label: cleanLabel,
      emoji: emoji.trim().slice(0, 8) || '•',
      color,
      kind,
      subline: state.current.subline,
    });
  };

  return (
    <form className="popover custom-status" onSubmit={submit} aria-label="Custom status">
      <div className="custom-status__head">
        <span className="custom-status__title">Set a custom status</span>
        <button type="button" className="icon-btn icon-btn--sm" aria-label="Close" onClick={onClose}>
          <Icon name="x" size={13} />
        </button>
      </div>

      <div
        className="custom-status__preview"
        style={{ ['--chip-color' as string]: color } as CSSProperties}
      >
        <span aria-hidden="true">{emoji || '✨'}</span>
        <span>{label.trim() || 'Your status'}</span>
        <span className="chip__dot" style={{ marginLeft: 'auto' }} />
      </div>

      <div className="custom-status__fields">
        <div className="custom-status__row">
          <input
            className="emoji-field"
            value={emoji}
            maxLength={8}
            aria-label="Status emoji"
            onChange={(event) => setEmoji(event.target.value)}
          />
          <input
            className="input"
            autoFocus
            data-autofocus
            value={label}
            maxLength={48}
            placeholder="Deep work, recording, writing…"
            aria-label="Status label"
            onChange={(event) => setLabel(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') submit(event);
            }}
          />
        </div>

        <div className="color-row" role="group" aria-label="Status color">
          {STATUS_COLORS.map((value) => (
            <button
              key={value}
              type="button"
              className={cx('swatch', color === value && 'is-active')}
              style={{ ['--swatch-color' as string]: value } as CSSProperties}
              aria-label={`Use color ${value}`}
              aria-pressed={color === value}
              onClick={() => setColor(value)}
            />
          ))}
        </div>

        <div className="custom-status__kind" role="group" aria-label="Status kind">
          {(
            [
              ['focus', 'Focus'],
              ['break', 'Break'],
              ['away', 'Away'],
            ] as const
          ).map(([value, text]) => (
            <button
              key={value}
              type="button"
              className={cx(kind === value && 'is-active')}
              aria-pressed={kind === value}
              onClick={() => setKind(value)}
            >
              {text}
            </button>
          ))}
        </div>
      </div>

      <div className="custom-status__footer">
        <span className="custom-status__hint">Enter to set</span>
        <button type="submit" className="btn btn--accent btn--sm" disabled={!label.trim()}>
          <span className="btn__label">Set status</span>
        </button>
      </div>
    </form>
  );
}
