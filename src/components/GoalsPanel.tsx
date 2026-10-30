import { useMemo, useState, type CSSProperties } from 'react';
import type { Action, BoardState, Goal, GoalStatus } from '../state/types';
import {
  goalMetrics,
  listsForArea,
  orderedGoals,
} from '../state/selectors';
import { daysBetween, formatTargetDate } from '../state/time';
import { EmptyState, Button, IconButton, ProgressBar, Ring } from './ui';
import { Icon } from './Icon';
import { cx } from '../lib/cx';
import { useToast } from './Toasts';

type GoalFilter = 'all' | GoalStatus;

const FILTERS: { id: GoalFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'done', label: 'Done' },
];

function targetLabel(value: string, now: number): { text: string; tone: 'normal' | 'soon' | 'late' } {
  const [yearRaw, monthRaw, dayRaw] = value.split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  if (!year || !month || !day) return { text: value, tone: 'normal' };
  const target = new Date(year, month - 1, day, 12, 0, 0, 0).getTime();
  const days = daysBetween(now, target);
  if (days < 0) return { text: `${Math.abs(days)}d over`, tone: 'late' };
  if (days === 0) return { text: 'today', tone: 'soon' };
  if (days <= 7) return { text: `in ${days}d`, tone: 'soon' };
  return { text: formatTargetDate(value, now), tone: 'normal' };
}

export function GoalsPanel({
  state,
  dispatch,
  onAdd,
  onEdit,
}: {
  state: BoardState;
  dispatch: (action: Action) => void;
  onAdd: () => void;
  onEdit: (goalId: string) => void;
}) {
  const { notify } = useToast();
  const [filter, setFilter] = useState<GoalFilter>('all');
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const now = Date.now();

  const goals = useMemo(() => orderedGoals(state), [state]);
  const visible = goals.filter((goal) => filter === 'all' || goal.status === filter);
  const activeCount = goals.filter((goal) => goal.status === 'active').length;
  const doneCount = goals.filter((goal) => goal.status === 'done').length;
  const trackedMilestones = goals.reduce((sum, goal) => sum + goal.milestones.length, 0);
  const finishedMilestones = goals.reduce(
    (sum, goal) => sum + goal.milestones.filter((milestone) => milestone.done).length,
    0,
  );
  const openLinked = goals.reduce((sum, goal) => sum + goalMetrics(state, goal).openTasks, 0);

  const projectForGoal = (goal: Goal): string => {
    const areaProjects = goal.areaId ? listsForArea(state, goal.areaId) : [];
    return areaProjects[0]?.id ?? state.activeListId;
  };

  const addTaskToGoal = (goal: Goal) => {
    const clean = draft.replace(/\s+/g, ' ').trim().slice(0, 200);
    if (!clean) return;
    dispatch({
      type: 'task/add',
      title: clean,
      listId: projectForGoal(goal),
      goalId: goal.id,
      priority: 'medium',
    });
    setDraft('');
    setAddingTo(null);
    notify(`Added to ${goal.title}`, { duration: 2000 });
  };

  const focusGoal = (goal: Goal) => {
    const open = state.tasks.find((task) => task.goalId === goal.id && !task.done);
    if (!open) {
      notify('Link a task to this goal first.', { duration: 2600 });
      setAddingTo(goal.id);
      return;
    }
    dispatch({
      type: 'task/setNow',
      id: open.id,
      isNow: !(open.isNow && state.tasks.filter((task) => task.isNow).length === 1),
    });
    notify(`Now · ${open.title}`, { duration: 2000 });
  };

  return (
    <section className="panel goals-panel" aria-label="Goals">
      <div className="panel__head">
        <span className="panel__title">
          <Icon name="target" size={15} />
          Goals
          {activeCount > 0 ? <span className="count count--accent">{activeCount}</span> : null}
        </span>
        <div className="panel__actions">
          <IconButton label="New goal" icon="plus" size="sm" onClick={onAdd} />
        </div>
      </div>

      {goals.length === 0 ? (
        <div className="goal-empty">
          <EmptyState
            compact
            icon="target"
            title="No goals yet"
            detail="A goal keeps the small tasks pointed at something larger."
            action={
              <Button size="sm" variant="subtle" onClick={onAdd}>
                Add goal
              </Button>
            }
          />
        </div>
      ) : (
        <>
          <div className="goal-summary">
            <span className="goal-summary__item">
              <strong>{activeCount}</strong>
              <span>active</span>
            </span>
            <span className="goal-summary__sep" aria-hidden="true" />
            <span className="goal-summary__item">
              <strong>
                {finishedMilestones}/{trackedMilestones}
              </strong>
              <span>milestones</span>
            </span>
            <span className="goal-summary__sep" aria-hidden="true" />
            <span className="goal-summary__item">
              <strong>{openLinked}</strong>
              <span>open steps</span>
            </span>
            {doneCount > 0 ? (
              <span className="goal-summary__done">
                <Icon name="check" size={11} strokeWidth={2.6} />
                {doneCount}
              </span>
            ) : null}
          </div>

          <div className="goal-filters" role="tablist" aria-label="Goal filters">
            {FILTERS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                role="tab"
                aria-selected={filter === entry.id}
                className={cx('goal-filter', filter === entry.id && 'is-active')}
                onClick={() => setFilter(entry.id)}
              >
                {entry.label}
              </button>
            ))}
          </div>

          <div className="goal-card-list" role="list">
            {visible.map((goal) => {
              const metrics = goalMetrics(state, goal);
              const area = goal.areaId
                ? state.areas.find((entry) => entry.id === goal.areaId)
                : undefined;
              const target = goal.targetDate ? targetLabel(goal.targetDate, now) : null;
              const isAdding = addingTo === goal.id;
              return (
                <article
                  key={goal.id}
                  className={cx(
                    'goal-card',
                    `goal-card--${goal.status}`,
                    area && 'has-area',
                  )}
                  role="listitem"
                  style={{ ['--goal-color' as string]: area?.color ?? 'var(--accent)' } as CSSProperties}
                >
                  <button
                    type="button"
                    className="goal-card__open"
                    onClick={() => onEdit(goal.id)}
                    aria-label={`Edit goal: ${goal.title}, ${metrics.progress}% complete`}
                  />
                  <div className="goal-card__head">
                    <Ring
                      value={metrics.progress}
                      size={40}
                      stroke={3}
                      color="var(--goal-color)"
                      className="goal-card__ring"
                    >
                      {metrics.progress}
                    </Ring>
                    <div className="goal-card__heading">
                      <div className="goal-card__title-row">
                        <span className="goal-card__title">{goal.title}</span>
                        {goal.status !== 'active' ? (
                          <span className={`goal-status goal-status--${goal.status}`}>
                            {goal.status}
                          </span>
                        ) : null}
                      </div>
                      <div className="goal-card__meta">
                        {area ? (
                          <span className="goal-card__area">
                            <span className="goal-chip-dot" />
                            {area.name}
                          </span>
                        ) : null}
                        {target ? (
                          <>
                            {area ? <span className="sep" /> : null}
                            <span className={cx('goal-card__date', `is-${target.tone}`)}>
                              <Icon name="calendar" size={9} />
                              {target.text}
                            </span>
                          </>
                        ) : null}
                      </div>
                    </div>
                    <Icon name="chevron-right" size={13} className="goal-card__chevron" />
                  </div>

                  {goal.description ? (
                    <p className="goal-card__desc">{goal.description}</p>
                  ) : null}

                  <div className="goal-card__progress">
                    <ProgressBar value={metrics.progress} label={`${goal.title} progress`} />
                    <div className="goal-card__progress-meta">
                      {metrics.nextMilestone ? (
                        <span className="goal-card__next">
                          <Icon name="arrow-right" size={11} />
                          {metrics.nextMilestone}
                        </span>
                      ) : metrics.source === 'tasks' ? (
                        <span className="goal-card__next">
                          <Icon name="check-circle" size={11} />
                          {metrics.linkedDone}/{metrics.linkedTotal} linked tasks done
                        </span>
                      ) : metrics.source === 'manual' ? (
                        <span className="goal-card__next">
                          <Icon name="sliders" size={11} />
                          Manual progress
                        </span>
                      ) : (
                        <span className="goal-card__next is-complete">
                          <Icon name="check" size={11} strokeWidth={2.6} />
                          All milestones complete
                        </span>
                      )}
                      {metrics.milestonesTotal > 0 ? (
                        <span className="goal-card__count">
                          {metrics.milestonesDone}/{metrics.milestonesTotal}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  {isAdding ? (
                    <div className="goal-card__add">
                      <Icon name="plus" size={12} />
                      <input
                        className="goal-card__add-input"
                        autoFocus
                        value={draft}
                        maxLength={200}
                        placeholder="Next small step…"
                        aria-label={`Add a task to ${goal.title}`}
                        onChange={(event) => setDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            addTaskToGoal(goal);
                          } else if (event.key === 'Escape') {
                            setAddingTo(null);
                            setDraft('');
                          }
                        }}
                      />
                      <Button
                        size="sm"
                        variant="subtle"
                        onClick={() => addTaskToGoal(goal)}
                        disabled={!draft.trim()}
                      >
                        Add
                      </Button>
                    </div>
                  ) : (
                    <div className="goal-card__actions">
                      <button
                        type="button"
                        className="goal-card__action"
                        onClick={() => focusGoal(goal)}
                      >
                        <Icon name="bolt" size={11} />
                        Focus
                      </button>
                      <button
                        type="button"
                        className="goal-card__action"
                        onClick={() => {
                          setAddingTo(goal.id);
                          setDraft('');
                        }}
                      >
                        <Icon name="plus" size={11} />
                        Step
                      </button>
                      {metrics.linkedTotal > 0 ? (
                        <span className="goal-card__linked">
                          <Icon name="link" size={10} />
                          {metrics.linkedTotal - metrics.linkedDone} open
                        </span>
                      ) : null}
                    </div>
                  )}
                </article>
              );
            })}
          </div>

          {visible.length === 0 ? (
            <div className="goal-empty">
              <EmptyState
                compact
                icon="target"
                title={filter === 'done' ? 'Nothing finished yet' : 'No goals in this view'}
                detail="Switch the filter or start something new."
              />
            </div>
          ) : null}

          <button type="button" className="goal-add-row" onClick={onAdd}>
            <Icon name="plus" size={12} />
            Add a goal
          </button>
        </>
      )}
    </section>
  );
}
