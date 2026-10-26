import {
  useEffect,
  useState,
  type CSSProperties,
  type FormEvent,
} from 'react';
import type { Action, Goal, Milestone } from '../state/types';
import { makeId } from '../state/reducer';
import {
  Button,
  ConfirmDialog,
  Field,
  InlineToggle,
  Modal,
  ProgressBar,
  Ring,
} from './ui';
import { Icon } from './Icon';

interface GoalDraft {
  title: string;
  description: string;
  targetDate: string;
  progress: number;
  isPrivate: boolean;
}

const EMPTY_DRAFT: GoalDraft = {
  title: '',
  description: '',
  targetDate: '',
  progress: 0,
  isPrivate: false,
};

export function GoalEditor({
  open,
  goal,
  dispatch,
  onClose,
}: {
  open: boolean;
  goal: Goal | null;
  dispatch: (action: Action) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<GoalDraft>(EMPTY_DRAFT);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
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
            isPrivate: goal.isPrivate,
          }
        : EMPTY_DRAFT,
    );
    setMilestones(goal ? goal.milestones.map((milestone) => ({ ...milestone })) : []);
    setNewMilestone('');
    setDeleteOpen(false);
  }, [open, goal]);

  const doneMilestones = milestones.filter((milestone) => milestone.done).length;
  const progress =
    milestones.length > 0
      ? Math.round((doneMilestones / milestones.length) * 100)
      : Math.round(draft.progress);

  const addMilestone = () => {
    const title = newMilestone.replace(/\s+/g, ' ').trim().slice(0, 90);
    if (!title) return;
    setMilestones((current) => [...current, { id: makeId('ms'), title, done: false }]);
    setNewMilestone('');
  };

  const save = (event?: FormEvent) => {
    event?.preventDefault();
    const title = draft.title.replace(/\s+/g, ' ').trim();
    if (!title) return;
    if (!goal) {
      dispatch({
        type: 'goal/add',
        goal: {
          title,
          description: draft.description.trim(),
          targetDate: draft.targetDate || undefined,
          progress,
          milestones,
          isPrivate: draft.isPrivate,
        },
      });
    } else {
      dispatch({
        type: 'goal/update',
        id: goal.id,
        patch: {
          title,
          description: draft.description.trim(),
          targetDate: draft.targetDate || undefined,
          progress,
          isPrivate: draft.isPrivate,
        },
      });
      dispatch({ type: 'goal/milestones', goalId: goal.id, milestones });
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
            ? 'Trim the target, adjust the finish line, or change what is visible in Present.'
            : 'Name the thing you are working toward. Milestones turn it into a visible finish line.'
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
              <Ring value={progress} size={58} stroke={4} color="var(--accent)">
                {progress}%
              </Ring>
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
            </div>
          </div>

          <Field label="Why it matters" hint="Optional">
            <textarea
              className="textarea"
              value={draft.description}
              maxLength={280}
              rows={3}
              placeholder="A sentence you want to see on the wall."
              onChange={(event) =>
                setDraft((current) => ({ ...current, description: event.target.value }))
              }
            />
          </Field>

          <div className="field-row">
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
            <Field label="Visibility">
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
            </Field>
          </div>

          <div className="goal-progress-control">
            <div className="goal-progress-head">
              <span>Progress</span>
              <span>{progress}%</span>
            </div>
            {milestones.length > 0 ? (
              <>
                <ProgressBar value={progress} label="Goal progress" />
                <span className="goal-progress-hint">
                  Progress follows the {milestones.length} milestone
                  {milestones.length === 1 ? '' : 's'} below.
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
                      className={
                        milestone.done ? 'check is-done' : 'check'
                      }
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
        message={`"${goal?.title ?? 'This goal'}" and its milestones will be removed. Tasks are not affected.`}
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
