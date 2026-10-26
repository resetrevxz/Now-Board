import type { BoardState } from '../state/types';
import { completedMilestones } from '../state/selectors';
import { formatTargetDate } from '../state/time';
import { EmptyState, Button, IconButton, Ring } from './ui';
import { Icon } from './Icon';

export function GoalsPanel({
  state,
  onAdd,
  onEdit,
}: {
  state: BoardState;
  onAdd: () => void;
  onEdit: (goalId: string) => void;
}) {
  return (
    <section className="panel goals-panel" aria-label="Goals">
      <div className="panel__head">
        <span className="panel__title">
          <Icon name="target" size={15} />
          Goals
        </span>
        <div className="panel__actions">
          <IconButton label="New goal" icon="plus" size="sm" onClick={onAdd} />
        </div>
      </div>
      {state.goals.length === 0 ? (
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
        <div className="goal-list" role="list">
          {state.goals.map((goal) => {
            const milestones = completedMilestones(goal);
            return (
              <button
                key={goal.id}
                type="button"
                className="goal-row"
                role="listitem"
                onClick={() => onEdit(goal.id)}
                aria-label={`Edit goal: ${goal.title}, ${Math.round(goal.progress)}% complete`}
              >
                <Ring
                  value={goal.progress}
                  size={31}
                  stroke={3}
                  color="var(--accent)"
                  className="goal-row__ring"
                >
                  {Math.round(goal.progress)}
                </Ring>
                <span className="goal-row__info">
                  <span className="goal-row__name">{goal.title}</span>
                  <span className="goal-row__meta">
                    {goal.milestones.length > 0 ? (
                      <span>
                        {milestones}/{goal.milestones.length} milestones
                      </span>
                    ) : (
                      <span>Manual progress</span>
                    )}
                    {goal.targetDate ? (
                      <>
                        <span className="sep" />
                        <span>{formatTargetDate(goal.targetDate)}</span>
                      </>
                    ) : null}
                    {goal.isPrivate ? (
                      <>
                        <span className="sep" />
                        <span className="goal-row__private">
                          <Icon name="lock" size={9} /> Private
                        </span>
                      </>
                    ) : null}
                  </span>
                </span>
                <Icon name="chevron-right" size={13} className="goal-row__chevron" />
              </button>
            );
          })}
        </div>
      )}
      {state.goals.length > 0 ? (
        <button
          type="button"
          className="goal-add-row"
          onClick={onAdd}
        >
          <Icon name="plus" size={12} />
          Add a goal
        </button>
      ) : null}
    </section>
  );
}
