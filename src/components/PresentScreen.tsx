import { useEffect } from 'react';
import type { PresentViewModel, StatusKind, TimelineModel } from '../state/types';
import {
  clockParts,
  formatClockLabel,
  formatDateLong,
  formatDuration,
  formatFocusClock,
  formatTargetDate,
  formatTimer,
} from '../state/time';
import { useNow } from '../hooks/useUi';
import { cx } from '../lib/cx';
import { BrandMark } from './BrandMark';
import { Icon } from './Icon';
import { Kbd, ProgressBar, Ring } from './ui';

const BREAK_PROMPTS = [
  'Look at something far away for twenty seconds.',
  'Stand up and roll your shoulders once.',
  'Drink some water. Nothing else is due right now.',
  'Step outside for a minute if you can.',
  'Let your eyes rest. The board is not going anywhere.',
  'Take one slow breath before the next thing.',
];

const STATUS_EYEBROW: Record<StatusKind, string> = {
  focus: 'Currently',
  break: 'On a break',
  away: 'Away',
  sleep: 'Sleeping',
};

const SUBLINE_LABELS: Record<StatusKind, string> = {
  focus: 'Working on',
  break: 'A note',
  away: 'A note',
  sleep: 'Rest note',
};

const QUIET_FOOTER: Record<Exclude<StatusKind, 'focus'>, string> = {
  break: 'The work will wait until you are back.',
  away: 'The board will keep your place.',
  sleep: 'The board is sleeping too.',
};

function liveTimeline(timeline: TimelineModel, now: number, generatedAt: number): TimelineModel {
  const delta = Math.max(0, now - generatedAt);
  if (delta < 1000 || timeline.segments.length === 0) return timeline;
  const segments = timeline.segments.map((segment, index) =>
    index === timeline.segments.length - 1
      ? {
          ...segment,
          end: segment.end + delta,
          durationMs: segment.durationMs + delta,
        }
      : segment,
  );
  const last = segments[segments.length - 1];
  const totals = timeline.totals.map((total) =>
    last && total.label === last.label && total.color === last.color
      ? { ...total, durationMs: total.durationMs + delta }
      : total,
  );
  return {
    segments,
    totals,
    totalTrackedMs: timeline.totalTrackedMs + delta,
    focusMs: timeline.focusMs + (last?.kind === 'focus' ? delta : 0),
  };
}

function clockWithPeriod(time: string, period: string) {
  return (
    <>
      {time}
      {period ? <span className="present-clock__period">{period}</span> : null}
    </>
  );
}

export function PresentScreen({
  view,
  showHint = false,
  share = false,
}: {
  view: PresentViewModel;
  showHint?: boolean;
  share?: boolean;
}) {
  const now = useNow(1000);
  const settings = view.settings;

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = settings.theme;
    root.dataset.reduceMotion = settings.reduceMotion ? 'true' : 'false';
    root.dataset.density = settings.density;
    root.dataset.background = settings.background;
    root.style.setProperty('--accent', settings.accentColor);
  }, [
    settings.accentColor,
    settings.background,
    settings.density,
    settings.reduceMotion,
    settings.theme,
  ]);

  const kind = view.status.kind;
  const quiet = kind !== 'focus';
  const clock = clockParts(now, settings.clockFormat);
  const timeline = quiet ? view.timeline : liveTimeline(view.timeline, now, view.generatedAt);
  const focusTargetMs = settings.focusTargetMin * 60_000;
  const focusTargetProgress =
    focusTargetMs > 0 ? Math.min(100, (timeline.focusMs / focusTargetMs) * 100) : 0;
  const focusGoalMet = focusTargetMs > 0 && timeline.focusMs >= focusTargetMs;
  const sinceMs = Math.max(0, now - view.status.since);
  const statusSubline = view.status.subline.trim();
  const hasSubline =
    statusSubline.length > 0 &&
    statusSubline !== 'Now Board' &&
    statusSubline !== settings.boardName;
  const returnAt = view.status.returnAt;
  const returnInMs = returnAt === null ? null : returnAt - now;
  const returnPassed = returnInMs !== null && returnInMs <= 0;
  const returnClock =
    returnAt === null ? null : formatClockLabel(returnAt, settings.clockFormat);
  const returnIn = returnInMs !== null && !returnPassed ? formatTimer(returnInMs) : null;
  const breakPrompt = BREAK_PROMPTS[Math.floor(now / 45_000) % BREAK_PROMPTS.length] ?? BREAK_PROMPTS[0];

  const focusRemaining =
    view.focus.running && view.focus.startedAt !== null
      ? Math.max(
          0,
          Math.round(view.focus.remainingSec - (now - view.focus.startedAt) / 1000),
        )
      : view.focus.remainingSec;
  const focusComplete = focusRemaining === 0;
  const focusActive =
    view.focus.running ||
    view.focus.remainingSec !== view.focus.durationSec ||
    focusComplete;
  const focusLabel =
    view.focus.mode === 'focus'
      ? focusComplete
        ? 'Focus complete'
        : 'Focus'
      : focusComplete
        ? 'Break over'
        : 'Break';

  const tasksAvailable = settings.showTasks;
  const goalsAvailable = settings.showGoals;
  const showGrid = !quiet && (tasksAvailable || goalsAvailable);
  const showNote = !quiet && settings.showNotes && Boolean(view.note);
  const showTimeline = !quiet && settings.showTimeline && timeline.segments.length > 0;
  const showBottom = showNote || showTimeline;
  const showToday = !quiet && (settings.showStats || settings.showStreak);
  const taskProgress =
    view.taskStats.total > 0
      ? (view.taskStats.done / view.taskStats.total) * 100
      : 0;

  return (
    <div
      className={cx(
        'present',
        'present--enter',
        quiet && 'present--quiet',
        quiet && `present--${kind}`,
        settings.hideCursor && !share && 'hide-cursor',
      )}
    >
      <div className="present__topline" aria-hidden="true" />
      <div className={cx('present__frame', quiet && 'present__frame--quiet')}>
        <header className="present-header">
          <div className="present-brand">
            <span className="brand-mark">
              <BrandMark />
            </span>
            <span>{settings.boardName}</span>
            <span className="present-brand__sep" aria-hidden="true" />
            <span className="present-brand__live">
              <span className="live-dot" aria-hidden="true" />
              {share ? 'Shared' : 'Live'}
            </span>
          </div>
          <div className="present-header__right">
            {settings.showClock && kind !== 'sleep' ? (
              <div className="present-clock">
                <div className="present-clock__time">
                  {clockWithPeriod(clock.time, clock.period)}
                </div>
                <div className="present-clock__date">{formatDateLong(now)}</div>
              </div>
            ) : null}
          </div>
        </header>

        {quiet ? (
          <>
            <section
              className={cx('present-hero', 'present-hero--quiet', `present-hero--${kind}`)}
              aria-label={`${view.status.label} scene`}
            >
              <div className="present-status">
                <div className="present-status__glow" aria-hidden="true" />
                <div className="present-status__eyebrow">
                  <span className="present-status__dot" aria-hidden="true" />
                  {STATUS_EYEBROW[kind]}
                </div>
                <div className="present-status__line">
                  <div className="present-status__glyph" aria-hidden="true">
                    {view.status.emoji || '•'}
                  </div>
                  <h1 className="present-status__title" aria-live="polite">
                    {view.status.label}
                  </h1>
                </div>
                {kind !== 'sleep' && hasSubline ? (
                  <div className="present-status__subline">
                    <span className="present-status__subline-label">
                      {SUBLINE_LABELS[kind]}
                    </span>
                    <span className="present-status__subline-text">{statusSubline}</span>
                  </div>
                ) : null}
                <div className="present-status__meta">
                  <span className="present-meta-item">
                    <Icon name="clock" size={14} />
                    <strong>{formatDuration(sinceMs)}</strong>{' '}
                    {kind === 'break' ? 'on break' : kind === 'away' ? 'away' : 'resting'}
                  </span>
                </div>
              </div>

              {kind === 'break' ? (
                <aside className="present-calm present-calm--break" aria-label="Break">
                  <div className="present-calm__eyebrow">
                    <Icon name="coffee" size={14} />
                    {returnAt !== null ? 'Back in' : 'Break'}
                  </div>
                  <div className="present-calm__value tnum">
                    {returnPassed
                      ? 'Any moment'
                      : returnIn
                        ? returnIn
                        : view.focus.mode === 'break'
                          ? formatFocusClock(focusRemaining)
                          : formatDuration(sinceMs)}
                  </div>
                  <div className="present-calm__caption">
                    {returnAt !== null
                      ? `Back at ${returnClock}`
                      : view.focus.mode === 'break'
                        ? view.focus.running
                          ? 'Break timer'
                          : 'Break timer paused'
                        : 'Resting so far'}
                  </div>
                  <div className="present-calm__breath" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </div>
                  <p className="present-calm__prompt">{breakPrompt}</p>
                </aside>
              ) : null}

              {kind === 'away' ? (
                <aside className="present-calm present-calm--away" aria-label="Away">
                  <div className="present-calm__eyebrow">
                    <Icon name="moon" size={14} />
                    {returnAt !== null ? 'Back at' : 'Away'}
                  </div>
                  <div className="present-calm__clock tnum">
                    {returnClock ?? '—'}
                  </div>
                  <div className="present-calm__caption">
                    {returnAt === null
                      ? 'No return time set'
                      : returnPassed
                        ? 'Any moment now'
                        : `${returnIn} from now`}
                  </div>
                  <p className="present-calm__prompt">
                    Nothing here is urgent. The board will keep your place.
                  </p>
                </aside>
              ) : null}

              {kind === 'sleep' ? (
                <aside className="present-calm present-calm--sleep" aria-label="Sleeping">
                  <div className="present-calm__moon" aria-hidden="true">☾</div>
                  {settings.showClock ? (
                    <div className="present-calm__clock tnum">
                      {clockWithPeriod(clock.time, clock.period)}
                    </div>
                  ) : null}
                  <div className="present-calm__caption">{formatDateLong(now)}</div>
                  <p className="present-calm__prompt">
                    {returnAt !== null ? `Wake at ${returnClock}.` : 'Rest well. The day will keep.'}
                  </p>
                </aside>
              ) : null}
            </section>

            <footer className="present-quiet__foot">
              <span className="present-quiet__foot-copy">
                <Icon
                  name={kind === 'sleep' ? 'moon' : kind === 'break' ? 'coffee' : 'shield'}
                  size={13}
                />
                {QUIET_FOOTER[kind]}
              </span>
              <span className="present-quiet__privacy">
                <Icon name="eye-off" size={12} />
                Objectives hidden
              </span>
            </footer>
          </>
        ) : (
          <>
            <section className={cx('present-hero', !showToday && 'present-hero--single')}>
              <div className="present-status">
                <div className="present-status__glow" aria-hidden="true" />
                <div className="present-status__eyebrow">
                  <span className="present-status__dot" aria-hidden="true" />
                  {STATUS_EYEBROW[kind]}
                </div>
                <div className="present-status__line">
                  <div className="present-status__glyph" aria-hidden="true">
                    {view.status.emoji || '•'}
                  </div>
                  <h1 className="present-status__title" aria-live="polite">
                    {view.status.label}
                  </h1>
                </div>
                {hasSubline ? (
                  <div className="present-status__subline">
                    <span className="present-status__subline-label">Working on</span>
                    <span className="present-status__subline-text">{statusSubline}</span>
                  </div>
                ) : null}
                <div className="present-status__meta">
                  <span className="present-meta-item">
                    <Icon name="clock" size={14} />
                    <strong>{formatDuration(sinceMs)}</strong> in this
                  </span>
                  {settings.showFocus && focusActive ? (
                    <>
                      <span className="present-meta-sep" aria-hidden="true" />
                      <span className="present-focus-pill">
                        <Icon
                          name={view.focus.running ? 'clock' : focusComplete ? 'check' : 'pause'}
                          size={13}
                        />
                        <strong>{formatFocusClock(focusRemaining)}</strong>
                        <span>{focusLabel}</span>
                      </span>
                    </>
                  ) : null}
                  {returnAt !== null ? (
                    <>
                      <span className="present-meta-sep" aria-hidden="true" />
                      <span className="present-meta-item">
                        <Icon name="clock-plus" size={13} />
                        {returnPassed ? (
                          <strong>Back any moment</strong>
                        ) : (
                          <>
                            <strong>{returnClock}</strong> return
                          </>
                        )}
                      </span>
                    </>
                  ) : null}
                  {settings.showStreak && view.streakDays > 0 ? (
                    <>
                      <span className="present-meta-sep" aria-hidden="true" />
                      <span className="present-meta-item">
                        <Icon name="flame" size={13} />
                        <strong>{view.streakDays}</strong> day streak
                      </span>
                    </>
                  ) : null}
                </div>
              </div>

              {showToday ? (
                <aside className="present-today" aria-label="Today">
                  <div className="present-today__label">
                    <span>Today</span>
                    {settings.showStreak && view.streakDays > 0 ? (
                      <span className="present-today__streak">
                        <Icon name="flame" size={12} />
                        {view.streakDays}d
                      </span>
                    ) : null}
                  </div>
                  <div>
                    <div className="present-today__focus">
                      <span className="present-today__value tnum">
                        {formatDuration(timeline.focusMs)}
                      </span>
                      <span
                        className={cx(
                          'present-today__caption',
                          focusGoalMet && 'is-goal-met',
                        )}
                      >
                        {focusGoalMet
                          ? 'goal met'
                          : focusTargetMs > 0
                            ? `of ${formatDuration(focusTargetMs)}`
                            : 'in focus'}
                      </span>
                    </div>
                    {focusTargetMs > 0 ? (
                      <div className="present-today__goal">
                        <ProgressBar
                          value={focusTargetProgress}
                          label="Daily focus goal"
                        />
                      </div>
                    ) : null}
                    {settings.showStats ? (
                      <div className="present-today__tasks">
                        <div className="present-today__tasks-row">
                          <span>Tasks</span>
                          <span>
                            <strong>{view.taskStats.done}</strong> / {view.taskStats.total}
                          </span>
                        </div>
                        <ProgressBar value={taskProgress} label="Tasks completed" />
                      </div>
                    ) : null}
                  </div>
                </aside>
              ) : null}
            </section>

            {showGrid ? (
              <div className={cx('present-grid', !(tasksAvailable && goalsAvailable) && 'present-grid--single')}>
                {tasksAvailable ? (
                  <section className="present-panel present-tasks" aria-label="Work">
                    <div className="present-panel__head">
                      <span className="present-panel__title">
                        <Icon name="list" size={13} />
                        Work
                      </span>
                      <span className="present-panel__meta">
                        {view.taskStats.total - view.taskStats.done} left
                      </span>
                    </div>

                    {settings.showNow ? (
                      view.nowTask ? (
                        <div className="present-now">
                          <div className="present-now__eyebrow">
                            <Icon name="bolt" size={12} />
                            Now
                          </div>
                          <div className="present-now__title">{view.nowTask.title}</div>
                          <div className="present-now__meta">
                            <span className="present-task-row__priority" style={{ ['--priority-color' as string]: `var(--priority-${view.nowTask.priority})` }} />
                            <span style={{ textTransform: 'capitalize' }}>{view.nowTask.priority}</span>
                            <span className="sep" />
                            <span>{view.nowTask.listName}</span>
                          </div>
                        </div>
                      ) : (
                        <div className="present-now present-now--empty">
                          <span className="present-now__empty-icon">
                            <Icon name="circle" size={16} />
                          </span>
                          <div>
                            <div className="present-now__empty-title">Between things</div>
                            <div className="present-now__empty-detail">
                              No task pinned right now.
                            </div>
                          </div>
                        </div>
                      )
                    ) : null}

                    <div className="present-next">
                      <div className="present-next__head">
                        <span>Up next</span>
                        <span>{view.upNext.length}</span>
                      </div>
                      <div className="present-task-list">
                        {view.upNext.slice(0, 6).map((task, index) => (
                          <div className="present-task-row" key={task.id}>
                            <span className="present-task-row__index">
                              {String(index + 1).padStart(2, '0')}
                            </span>
                            <span className="present-task-row__title">{task.title}</span>
                            <span
                              className="present-task-row__priority"
                              style={{
                                ['--priority-color' as string]: `var(--priority-${task.priority})`,
                              }}
                            />
                            <span className="present-task-row__list">{task.listName}</span>
                          </div>
                        ))}
                        {view.upNext.length === 0 ? (
                          <div className="present-all-clear">
                            <Icon name="check-circle" size={18} />
                            {view.taskStats.total > 0 ? 'All clear for now.' : 'Nothing queued yet.'}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </section>
                ) : null}

                {goalsAvailable ? (
                  <section className="present-panel present-goals-panel" aria-label="Goals">
                    <div className="present-panel__head">
                      <span className="present-panel__title">
                        <Icon name="target" size={13} />
                        Goals
                      </span>
                      <span className="present-panel__meta">
                        {view.goals.length} tracked
                      </span>
                    </div>
                    {view.goals.length > 0 ? (
                      <div className="present-goal-list">
                        {view.goals.slice(0, 3).map((goal) => (
                          <div className="present-goal" key={goal.id}>
                            <Ring
                              value={goal.progress}
                              size={52}
                              stroke={3}
                              color="var(--accent)"
                              className="present-goal__ring"
                            >
                              {Math.round(goal.progress)}
                            </Ring>
                            <div className="present-goal__info">
                              <div className="present-goal__title">{goal.title}</div>
                              {goal.description ? (
                                <div className="present-goal__desc">{goal.description}</div>
                              ) : null}
                              <div className="present-goal__meta">
                                {goal.totalMilestones > 0 ? (
                                  <span>
                                    {goal.completedMilestones}/{goal.totalMilestones} milestones
                                  </span>
                                ) : (
                                  <span>{Math.round(goal.progress)}% there</span>
                                )}
                                {goal.targetDate ? (
                                  <>
                                    <span className="sep" />
                                    <span className="present-goal__date">
                                      {formatTargetDate(goal.targetDate, now)}
                                    </span>
                                  </>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="present-goals-empty">
                        <span className="present-goals-empty__title">No public goals yet</span>
                        <span className="present-goals-empty__detail">
                          A clear target keeps the day honest.
                        </span>
                      </div>
                    )}
                  </section>
                ) : null}
              </div>
            ) : null}

            {showBottom ? (
              <footer className={cx('present-bottom', !(showNote && showTimeline) && 'present-bottom--single')}>
                {showNote ? (
                  <div className="present-note">
                    <div className="present-note__label">
                      <Icon name="pencil" size={11} />
                      A note
                    </div>
                    <div className="present-note__text">{view.note}</div>
                  </div>
                ) : null}
                {showTimeline ? (
                  <section className="present-timeline" aria-label="Today's rhythm">
                    <div className="present-timeline__head">
                      <span className="present-timeline__title">Today&apos;s rhythm</span>
                      <span className="present-timeline__total">
                        {formatDuration(timeline.totalTrackedMs)} tracked
                      </span>
                    </div>
                    <div className="present-timeline__bar">
                      {timeline.segments.map((segment) => (
                        <span
                          key={segment.id}
                          className="present-timeline__segment"
                          style={{
                            flexGrow: segment.durationMs,
                            ['--segment-color' as string]: segment.color,
                          }}
                          title={`${segment.label} · ${formatDuration(segment.durationMs)}`}
                        />
                      ))}
                    </div>
                    <div className="present-timeline__legend">
                      {timeline.totals.slice(0, 4).map((total) => (
                        <span
                          className="present-timeline__legend-item"
                          key={`${total.label}-${total.color}`}
                        >
                          <span
                            className="present-timeline__legend-dot"
                            style={{ ['--segment-color' as string]: total.color }}
                          />
                          <span className="present-timeline__legend-label">{total.label}</span>
                          <span className="present-timeline__legend-duration">
                            {formatDuration(total.durationMs)}
                          </span>
                        </span>
                      ))}
                    </div>
                  </section>
                ) : null}
              </footer>
            ) : null}
          </>
        )}
      </div>

      {showHint ? (
        <div className="mode-hint" role="status">
          <span className="mode-hint__item">
            <Kbd>Esc</Kbd> edit board
          </span>
          <span className="mode-hint__item">
            <Kbd>Ctrl</Kbd>
            <Kbd>Shift</Kbd>
            <Kbd>B</Kbd> be right back
          </span>
        </div>
      ) : null}
    </div>
  );
}
