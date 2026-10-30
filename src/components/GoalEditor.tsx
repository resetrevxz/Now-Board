import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type FormEvent,
} from 'react';
import type { Action, BoardState, Goal, GoalStatus, Milestone } from '../state/types';
import { makeId } from '../state/reducer';
import {
  Button,
  ConfirmDialog,
  Field,
  InlineToggle,
  Modal,
  ProgressBar,
  Ring,
  Segmented,
} from './ui';
import { Icon } from './Icon';
import { cx } from '../lib/cx';

interface GoalDraft {
  title: string;
  description: string;
  targetDate: string;
  progress: number;
  areaId: string;
  status: GoalStatus;
  isPrivate: boolean;
}

const EMPTY_DRAFT: GoalDraft = {
  title: '',
  description: '',
  targetDate: '',
  progress: 0,
  areaId: '',
  status: 'active',
  isPrivate: false,
};

export function GoalEditor({
  open,
  goal,
  state,
  dispatch,
  onClose,
}: {
  open: boolean;
  goal: Goal | null;
  state: BoardState;
  dispatch: (action: Action) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<GoalDraft>(EMPTY_DRAFT);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [linkedIds, setLinkedIds] = useState<Set<string>>(new Set());
  const [newMilestone, setNewMilestone] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraft(
      goal
        ? {
            title: goal.title,
            description: goal.description,
            targetDate: goal.targetDate ?? '',
            progress: Math.round(goal.progress),
            areaId: goal.areaId ?? '',
            status: goal.status,
            isPrivate: goal.isPrivate,
          }
        : {
            ...EMPTY_DRAFT,
            areaId: state.activeAreaId ?? state.areas[0]?.id ?? '',
          },
    );
    setMilestones(goal ? goal.milestones.map((milestone) => ({ ...milestone })) : []);
    setLinkedIds(
      new Set(
        goal
          ? state.tasks.filter((task) => task.goalId === goal.id).map((task) => task.id)
          : [],
      ),
    );
    setNewMilestone('');
    setDeleteOpen(false);
  }, [open, goal, state.activeAreaId, state.areas, state.tasks]);

  const tasks = useMemo(() => {
    const areaLists = new Map(state.lists.map((list) => [list.id, list]));
    const areaById = new Map(state.areas.map((area) => [area.id, area]));
    const rank = { high: 0, medium: 1, low: 2 } as const;
    return [...state.tasks]
      .filter((task) => !task.done || linkedIds.has(task.id))
      .sort((a, b) => {
        if (a.done !== b.done) return a.done ? 1 : -1;
        if (a.goalId && !b.goalId) return -1;
        if (!a.goalId && b.goalId) return 1;
        const priority = rank[a.priority] - rank[b.priority];
        if (priority !== 0) return priority;
        return a.createdAt - b.createdAt;
      })
      .map((task) => {
        const list = areaLists.get(task.listId);
        return {
          task,
          project: list?.name ?? 'Project',
          area: list ? areaById.get(list.areaId) : undefined,
        };
      });
  }, [linkedIds, state.areas, state.lists, state.tasks]);

  const doneMilestones = milestones.filter((milestone) => milestone.done).length;
  const linkedTotal = linkedIds.size;
  const linkedDone = state.tasks.filter(
    (task) => linkedIds.has(task.id) && task.done,
  ).length;

  const progress =
    draft.status === 'done'
      ? 100
      : milestones.length > 0
        ? Math.round((doneMilestones / milestones.length) * 100)
        : linkedTotal > 0
          ? Math.round((linkedDone / linkedTotal) * 100)
          : Math.round(draft.progress);

  const progressSource =
    draft.status === 'done'
      ? 'Marked done'
      : milestones.length > 0
        ? `${doneMilestones} of ${milestones.length} milestones`
        : linkedTotal > 0
          ? `${linkedDone} of ${linkedTotal} linked tasks`
          : 'Set by hand';

  const addMilestone = () => {
    const title = newMilestone.replace(/\s+/g, ' ').trim().slice(0, 90);
    if (!title) return;
    setMilestones((current) => [...current, { id: makeId('ms'), title, done: false }]);
    setNewMilestone('');
  };

  const toggleLink = (taskId: string) => {
    setLinkedIds((current) => {
      const next = new Set(current);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  const syncLinks = (goalId: string) => {
    for (const task of state.tasks) {
      const shouldLink = linkedIds.has(task.id);
      const isLinked = task.goalId === goalId;
      if (shouldLink && !isLinked) {
        dispatch({ type: 'task/update', id: task.id, patch: { goalId } });
      } else if (!shouldLink && isLinked) {
        dispatch({ type: 'task/update', id: task.id, patch: { goalId: null } });
      }
    }
  };

  const save = (event?: FormEvent) => {
    event?.preventDefault();
    const title = draft.title.replace(/\s+/g, ' ').trim();
    if (!title) return;
    const patch = {
      title,
      description: draft.description.trim(),
      targetDate: draft.targetDate || undefined,
      progress,
      areaId: draft.areaId || undefined,
      status: draft.status,
      isPrivate: draft.isPrivate,
    };
    if (!goal) {
      const goalId = makeId('goal');
      dispatch({
        type: 'goal/add',
        id: goalId,
        goal: {
          ...patch,
          milestones,
        },
      });
      syncLinks(goalId);
    } else {
      dispatch({ type: 'goal/update', id: goal.id, patch });
      dispatch({ type: 'goal/milestones', goalId: goal.id, milestones });
      syncLinks(goal.id);
    }
    onClose();
  };

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={goal ? 'Edit goal' : 'New goal'}
        description={
          goal
            ? 'Aim it at an area, connect the tasks that actually move it, and keep the finish line visible.'
            : 'Name the thing you are working toward. Milestones and linked tasks turn it into a moving finish line.'
        }
        footer={
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="accent"
              onClick={() => save()}
              disabled={!draft.title.trim()}
            >
              {goal ? 'Save goal' : 'Create goal'}
            </Button>
          </>
        }
      >
        <form className="goal-form" onSubmit={save}>
          <div className="goal-editor-head">
            <div className="goal-editor-preview">
              <Ring value={progress} size={62} stroke={4} color="var(--accent)">
                {progress}%
              </Ring>
              <span className="goal-editor-source">{progressSource}</span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Field label="Goal" htmlFor="goal-title">
                <input
                  id="goal-title"
                  className="input"
                  data-autofocus
                  value={draft.title}
                  maxLength={90}
                  placeholder="Ship a small, honest version"
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, title: event.target.value }))
                  }
                />
              </Field>
              <div className="goal-editor-status">
                <Segmented
                  value={draft.status}
                  onChange={(value) =>
                    setDraft((current) => ({ ...current, status: value as GoalStatus }))
                  }
                  options={[
                    { value: 'active', label: 'Active' },
                    { value: 'paused', label: 'Paused' },
                    { value: 'done', label: 'Done' },
                  ]}
                  label="Goal status"
                />
              </div>
            </div>
          </div>

          <Field label="Why it matters" hint="Optional">
            <textarea
              className="textarea"
              value={draft.description}
              maxLength={280}
              rows={2}
              placeholder="A sentence you want to see on the wall."
              onChange={(event) =>
                setDraft((current) => ({ ...current, description: event.target.value }))
              }
            />
          </Field>

          <div className="field-row">
            <Field label="Area">
              <select
                className="select"
                value={draft.areaId}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, areaId: event.target.value }))
                }
              >
                <option value="">No area</option>
                {state.areas.map((area) => (
                  <option key={area.id} value={area.id}>
                    {area.emoji} {area.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Target date" hint="Optional">
              <input
                className="input"
                type="date"
                value={draft.targetDate}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, targetDate: event.target.value }))
                }
              />
            </Field>
          </div>

          <div className="goal-private-toggle">
            <InlineToggle
              checked={!draft.isPrivate}
              onChange={(visible) =>
                setDraft((current) => ({ ...current, isPrivate: !visible }))
              }
              label="Show in Present"
              detail={draft.isPrivate ? 'Hidden in Present' : 'Visible in Present'}
            />
          </div>

          <div className="goal-progress-control">
            <div className="goal-progress-head">
              <span>Progress</span>
              <span>{progress}%</span>
            </div>
            {milestones.length > 0 || linkedTotal > 0 || draft.status === 'done' ? (
              <>
                <ProgressBar value={progress} label="Goal progress" />
                <span className="goal-progress-hint">
                  Progress follows {progressSource.toLowerCase()}.
                  {milestones.length === 0 && linkedTotal > 0
                    ? ' Add milestones below for a hand-built finish line.'
                    : ''}
                </span>
              </>
            ) : (
              <input
                className="range"
                type="range"
                min={0}
                max={100}
                step={1}
                value={draft.progress}
                aria-label="Goal progress"
                style={{ ['--range-progress' as string]: `${draft.progress}%` } as CSSProperties}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, progress: Number(event.target.value) }))
                }
              />
            )}
          </div>

          <div className="goal-linked">
            <div className="goal-progress-head">
              <span>Linked tasks</span>
              <span>
                {linkedDone}/{linkedTotal}
              </span>
            </div>
            <p className="goal-editor-empty">
              {linkedTotal === 0
                ? 'Link the small tasks that move this goal. Their completion can drive progress.'
                : 'Linked tasks stay in their projects and appear on the goal card.'}
            </p>
            {tasks.length > 0 ? (
              <div className="goal-linked-list">
                {tasks.map(({ task, project, area }) => {
                  const linked = linkedIds.has(task.id);
                  return (
                    <button
                      key={task.id}
                      type="button"
                      className={cx('goal-linked-row', linked && 'is-linked', task.done && 'is-done')}
                      aria-pressed={linked}
                      onClick={() => toggleLink(task.id)}
                    >
                      <span className={cx('check', linked && 'is-done')} aria-hidden="true">
                        <Icon name={linked ? 'check' : 'plus'} size={10} strokeWidth={2.4} />
                      </span>
                      <span className="goal-linked-row__title">{task.title}</span>
                      <span className="goal-linked-row__meta">
                        {area ? (
                          <span
                            className="goal-chip-dot"
                            style={{ ['--goal-color' as string]: area.color } as CSSProperties}
                          />
                        ) : null}
                        {project}
                      </span>
                      {task.done ? <span className="goal-linked-row__done">Done</span> : null}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="goal-editor-empty">Add a task to a project first, then link it here.</p>
            )}
          </div>

          <div className="goal-milestone-editor">
            <div className="goal-progress-head">
              <span>Milestones</span>
              <span>
                {doneMilestones}/{milestones.length}
              </span>
            </div>
            {milestones.length > 0 ? (
              <div className="goal-milestone-list">
                {milestones.map((milestone) => (
                  <div className="goal-milestone" key={milestone.id}>
                    <button
                      type="button"
                      className={milestone.done ? 'check is-done' : 'check'}
                      aria-label={`${
                        milestone.done ? 'Mark not done' : 'Mark done'
                      }: ${milestone.title}`}
                      aria-pressed={milestone.done}
                      onClick={() =>
                        setMilestones((current) =>
                          current.map((entry) =>
                            entry.id === milestone.id
                              ? { ...entry, done: !entry.done }
                              : entry,
                          ),
                        )
                      }
                    >
                      <Icon name="check" size={10} strokeWidth={2.6} />
                    </button>
                    <span
                      className={
                        milestone.done
                          ? 'goal-milestone__title is-done'
                          : 'goal-milestone__title'
                      }
                    >
                      {milestone.title}
                    </span>
                    <button
                      type="button"
                      className="icon-btn icon-btn--sm"
                      aria-label={`Remove milestone: ${milestone.title}`}
                      onClick={() =>
                        setMilestones((current) =>
                          current.filter((entry) => entry.id !== milestone.id),
                        )
                      }
                    >
                      <Icon name="x" size={12} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="goal-editor-empty">
                Add a few checkpoints to make progress move on its own.
              </p>
            )}
            <div className="milestone-add">
              <Icon name="plus" size={13} />
              <input
                className="input"
                value={newMilestone}
                maxLength={90}
                placeholder="Add a milestone and press Enter"
                aria-label="Add a milestone"
                onChange={(event) => setNewMilestone(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    addMilestone();
                  }
                }}
              />
              <Button
                size="sm"
                variant="subtle"
                onClick={addMilestone}
                disabled={!newMilestone.trim()}
              >
                Add
              </Button>
            </div>
          </div>

          {goal ? (
            <div className="goal-actions-row">
              <span className="goal-private">
                <Icon name="lock" size={11} />
                Private goals never appear in Present or Share.
              </span>
              <Button variant="danger" size="sm" onClick={() => setDeleteOpen(true)}>
                Delete goal
              </Button>
            </div>
          ) : null}
        </form>
      </Modal>

      <ConfirmDialog
        open={deleteOpen}
        title="Delete this goal?"
        message={`"${goal?.title ?? 'This goal'}" and its milestones will be removed. Linked tasks stay in their projects.`}
        confirmLabel="Delete goal"
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => {
          if (goal) dispatch({ type: 'goal/delete', id: goal.id });
          setDeleteOpen(false);
          onClose();
        }}
      />
    </>
  );
}
