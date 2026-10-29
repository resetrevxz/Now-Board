import type { CSSProperties } from 'react';
import type { Action, BoardState, FocusMode } from '../state/types';
import {
  buildTimeline,
  computeStreak,
  focusRemainingSeconds,
} from '../state/selectors';
import { clockParts, formatDateLong, formatDuration, formatFocusClock } from '../state/time';
import { useNow } from '../hooks/useUi';
import { cx } from '../lib/cx';
import { Icon } from './Icon';
import { ProgressBar } from './ui';

const FOCUS_DURATIONS = [25, 50, 90];
const BREAK_DURATIONS = [5, 10, 15];

export function TodayCard({
  state,
  dispatch,
}: {
  state: BoardState;
  dispatch: (action: Action) => void;
}) {
  const now = useNow(1000);
  const clock = clockParts(now, state.settings.clockFormat);
  const remaining = focusRemainingSeconds(state, now);
  const progress =
    state.focus.durationSec > 0
      ? ((state.focus.durationSec - remaining) / state.focus.durationSec) * 100
      : 0;
  const timeline = buildTimeline(state.sessions, now);
  const focusTargetMs = state.settings.focusTargetMin * 60_000;
  const focusTargetProgress =
    focusTargetMs > 0 ? Math.min(100, (timeline.focusMs / focusTargetMs) * 100) : 0;
  const streak = computeStreak(state.sessions, now);
  const totalTasks = state.tasks.length;
  const doneTasks = state.tasks.filter((task) => task.done).length;

  const running = state.focus.running;
  const timerState = running
    ? state.focus.mode === 'focus'
      ? 'In focus'
      : 'On break'
    : remaining === 0
      ? 'Complete'
      : state.focus.mode === 'focus'
        ? 'Ready to focus'
        : 'Break ready';

  const toggleFocus = () => {
    if (running) {
      dispatch({ type: 'focus/pause' });
      return;
    }
    if (remaining <= 0) {
      dispatch({ type: 'focus/start', durationSec: state.focus.durationSec });
    } else {
      dispatch({ type: 'focus/start' });
    }
  };

  const switchMode = (mode: FocusMode) => {
    if (state.focus.mode === mode) return;
    dispatch({ type: 'focus/reset', mode });
  };

  const durationOptions = state.focus.mode === 'focus' ? FOCUS_DURATIONS : BREAK_DURATIONS;
  const activeMinutes = Math.round(state.focus.durationSec / 60);

  return (
    <aside className="today-card" aria-label="Today at a glance">
      <div className="today-card__head">
        <div>
          <span className="eyebrow">Today</span>
          <div className="today-card__date">{formatDateLong(now)}</div>
        </div>
        <span className="today-card__status">
          <span className="live-dot" aria-hidden="true" />
          Local
        </span>
      </div>

      <div className="today-clock">
        {clock.time}
        {clock.period ? <span className="today-clock__suffix">{clock.period}</span> : null}
      </div>

      <div className="today-card__focus">
        <div className="focus-head">
          <span className="section-label">Focus timer</span>
          <div className="focus-head__modes" role="group" aria-label="Timer mode">
            <button
              type="button"
              className={cx('focus-mode', state.focus.mode === 'focus' && 'is-active')}
              aria-pressed={state.focus.mode === 'focus'}
              onClick={() => switchMode('focus')}
            >
              Focus
            </button>
            <button
              type="button"
              className={cx('focus-mode', state.focus.mode === 'break' && 'is-active')}
              aria-pressed={state.focus.mode === 'break'}
              onClick={() => switchMode('break')}
            >
              Break
            </button>
          </div>
        </div>
        <div className="focus-time-row">
          <div className="focus-time">
            <span className="focus-time__value tnum" aria-live="off">
              {formatFocusClock(remaining)}
            </span>
            <span className="focus-time__state">{timerState}</span>
          </div>
          <div className="focus-controls">
            <button
              type="button"
              className="icon-btn icon-btn--sm"
              aria-label="Reset focus timer"
              title="Reset timer"
              onClick={() => dispatch({ type: 'focus/reset', mode: state.focus.mode })}
            >
              <Icon name="reset" size={13} />
            </button>
            <button
              type="button"
              className="focus-play"
              aria-label={running ? 'Pause focus timer' : 'Start focus timer'}
              title={running ? 'Pause' : 'Start'}
              onClick={toggleFocus}
            >
              <Icon name={running ? 'pause' : 'play'} size={13} />
            </button>
          </div>
        </div>
        <ProgressBar
          value={progress}
          label="Focus timer progress"
          color={state.focus.mode === 'break' ? 'var(--warning)' : undefined}
        />
        <div className="focus-presets" role="group" aria-label={`${state.focus.mode} duration`}>
          {durationOptions.map((minutes) => (
            <button
              key={minutes}
              type="button"
              className={cx('focus-preset', activeMinutes === minutes && 'is-active')}
              aria-pressed={activeMinutes === minutes}
              title={`${minutes} minute ${state.focus.mode}`}
              onClick={() => {
                if (activeMinutes === minutes) return;
                dispatch({
                  type: 'focus/reset',
                  mode: state.focus.mode,
                  durationSec: minutes * 60,
                });
              }}
            >
              {minutes}m
            </button>
          ))}
          <span className="focus-presets__cycles">
            {state.focus.completedSessions > 0
              ? `${state.focus.completedSessions} done`
              : 'One thing at a time'}
          </span>
        </div>
      </div>

      <div className="today-stats">
        <div className="today-stat">
          <span className="today-stat__label">Tasks</span>
          <span className="today-stat__value">
            {doneTasks}
            <span style={{ color: 'var(--text-4)', fontWeight: 450 }}>/ {totalTasks}</span>
          </span>
        </div>
        <div className="today-stat">
          <span className="today-stat__label">Focus</span>
          <span className="today-stat__value">
            {formatDuration(timeline.focusMs)}
            {focusTargetMs > 0 ? (
              <span className="today-stat__target">/ {formatDuration(focusTargetMs)}</span>
            ) : null}
          </span>
          {focusTargetMs > 0 ? (
            <span className="today-stat__meter" aria-hidden="true">
              <span style={{ width: `${focusTargetProgress}%` }} />
            </span>
          ) : null}
        </div>
        <div className="today-stat">
          <span className="today-stat__label">Streak</span>
          <span className="today-stat__value is-streak">
            <Icon
              name="flame"
              size={12}
              style={
                {
                  ['--flame-color' as string]: 'var(--accent)',
                  color: streak > 0 ? 'var(--accent-text)' : 'var(--text-4)',
                } as CSSProperties
              }
            />
            {streak}d
          </span>
        </div>
      </div>
    </aside>
  );
}
