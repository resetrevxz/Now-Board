import {
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
} from 'react';
import type { Action, BoardState, Priority, Task } from '../state/types';
import { getActiveList, PRIORITY_LABEL } from '../state/selectors';
import { cx } from '../lib/cx';
import { useDismiss } from '../hooks/useUi';
import { useToast } from './Toasts';
import { Icon } from './Icon';
import {
  Button,
  ConfirmDialog,
  EmptyState,
  Field,
  IconButton,
  Modal,
} from './ui';

const PRIORITY_COLOR: Record<Priority, string> = {
  high: 'var(--priority-high)',
  medium: 'var(--priority-medium)',
  low: 'var(--priority-low)',
};

function nextPriority(priority: Priority): Priority {
  if (priority === 'high') return 'medium';
  if (priority === 'medium') return 'low';
  return 'high';
}

interface ListDialogState {
  mode: 'add' | 'rename';
  value: string;
}

export function TasksPanel({
  state,
  dispatch,
  quickAddRef,
}: {
  state: BoardState;
  dispatch: (action: Action) => void;
  quickAddRef: RefObject<HTMLInputElement | null>;
}) {
  const activeList = getActiveList(state);
  const activeListId = activeList?.id ?? state.activeListId;
  const listTasks = state.tasks.filter((task) => task.listId === activeListId);
  const incomplete = listTasks.filter((task) => !task.done);
  const completed = listTasks.filter((task) => task.done);
  const nowTask = state.tasks.find((task) => task.isNow && !task.done) ?? null;
  const nowList = nowTask ? state.lists.find((list) => list.id === nowTask.listId) : null;
  const listedIncomplete =
    nowTask && nowTask.listId === activeListId
      ? incomplete.filter((task) => task.id !== nowTask.id)
      : incomplete;

  const { notify } = useToast();
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [completedOpen, setCompletedOpen] = useState(false);
  const [listMenuOpen, setListMenuOpen] = useState(false);
  const [listDialog, setListDialog] = useState<ListDialogState | null>(null);
  const [deleteListOpen, setDeleteListOpen] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; before: boolean } | null>(null);
  const listMenuRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useDismiss(listMenuRef, listMenuOpen, () => setListMenuOpen(false));

  const addTask = () => {
    const clean = title.replace(/\s+/g, ' ').trim();
    if (!clean) {
      quickAddRef.current?.focus();
      return;
    }
    dispatch({ type: 'task/add', title: clean, listId: activeListId, priority });
    setTitle('');
    quickAddRef.current?.focus();
  };

  const startEditing = (task: Task) => {
    if (task.listId !== activeListId) dispatch({ type: 'list/activate', id: task.listId });
    setEditingId(task.id);
    setEditDraft(task.title);
  };

  const commitEditing = (task: Task) => {
    const clean = editDraft.replace(/\s+/g, ' ').trim();
    if (clean && clean !== task.title) {
      dispatch({ type: 'task/update', id: task.id, patch: { title: clean } });
    }
    setEditingId(null);
  };

  const removeTask = (task: Task) => {
    const snapshot = state;
    dispatch({ type: 'task/delete', id: task.id });
    notify('Task deleted.', {
      action: {
        label: 'Undo',
        onClick: () => dispatch({ type: 'data/replace', state: snapshot }),
      },
    });
  };

  const togglePrivate = (task: Task) => {
    dispatch({ type: 'task/update', id: task.id, patch: { isPrivate: !task.isPrivate } });
    notify(
      task.isPrivate
        ? 'Task is visible in Present again.'
        : 'Task hidden from Present mode.',
      { duration: 2200 },
    );
  };

  const setNow = (task: Task) => {
    dispatch({ type: 'task/setNow', id: task.id, isNow: !task.isNow });
    if (!task.isNow) notify(`Now · ${task.title}`, { duration: 1800 });
  };

  const cyclePriority = (task: Task) => {
    dispatch({ type: 'task/update', id: task.id, patch: { priority: nextPriority(task.priority) } });
  };

  const clearCompleted = () => {
    const snapshot = state;
    dispatch({ type: 'task/clearCompleted', listId: activeListId });
    notify(`Cleared ${completed.length} completed task${completed.length === 1 ? '' : 's'}.`, {
      action: {
        label: 'Undo',
        onClick: () => dispatch({ type: 'data/replace', state: snapshot }),
      },
    });
  };

  const handleRowKey = (event: ReactKeyboardEvent<HTMLDivElement>, task: Task) => {
    if (event.target !== event.currentTarget) return;
    const index = listedIncomplete.findIndex((entry) => entry.id === task.id);

    if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault();
      if (index < 0) return;
      if (event.key === 'ArrowUp') {
        const before = listedIncomplete[index - 1];
        if (before) {
          dispatch({
            type: 'task/reorder',
            listId: activeListId,
            taskId: task.id,
            beforeId: before.id,
          });
        }
      } else {
        const target = listedIncomplete[index + 1];
        if (target) {
          dispatch({
            type: 'task/reorder',
            listId: activeListId,
            taskId: task.id,
            beforeId: listedIncomplete[index + 2]?.id ?? null,
          });
        }
      }
      return;
    }

    switch (event.key.toLowerCase()) {
      case ' ':
        event.preventDefault();
        dispatch({ type: 'task/toggle', id: task.id });
        break;
      case 'e':
        event.preventDefault();
        startEditing(task);
        break;
      case 'n':
        event.preventDefault();
        setNow(task);
        break;
      case 'p':
        event.preventDefault();
        cyclePriority(task);
        break;
      case 'l':
        event.preventDefault();
        togglePrivate(task);
        break;
      case 'delete':
      case 'backspace':
        event.preventDefault();
        removeTask(task);
        break;
      default:
        break;
    }
  };

  const handleDragStart = (event: DragEvent<HTMLDivElement>, task: Task) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', task.id);
    setDraggingId(task.id);
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>, task: Task) => {
    if (!draggingId || draggingId === task.id || task.done) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const rect = event.currentTarget.getBoundingClientRect();
    const before = event.clientY < rect.top + rect.height / 2;
    setDropTarget((current) =>
      current?.id === task.id && current.before === before ? current : { id: task.id, before },
    );
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>, task: Task) => {
    event.preventDefault();
    const moving = draggingId;
    if (!moving || moving === task.id) {
      setDraggingId(null);
      setDropTarget(null);
      return;
    }
    const before = dropTarget?.id === task.id ? dropTarget.before : true;
    const targetIndex = listedIncomplete.findIndex((entry) => entry.id === task.id);
    const beforeId = before ? task.id : (listedIncomplete[targetIndex + 1]?.id ?? null);
    dispatch({ type: 'task/reorder', listId: activeListId, taskId: moving, beforeId });
    setDraggingId(null);
    setDropTarget(null);
  };

  const submitListDialog = () => {
    if (!listDialog) return;
    const clean = listDialog.value.replace(/\s+/g, ' ').trim().slice(0, 40);
    if (!clean) return;
    if (listDialog.mode === 'add') {
      dispatch({ type: 'list/add', name: clean });
      notify(`List created · ${clean}`, { duration: 2000 });
    } else {
      dispatch({ type: 'list/rename', id: activeListId, name: clean });
    }
    setListDialog(null);
  };

  const shareTaskMeta = (task: Task) => (
    <div className="task-row__meta">
      {task.isNow ? <span className="badge badge--accent">Now</span> : null}
      <span
        className="task-row__priority"
        style={{ ['--priority-color' as string]: PRIORITY_COLOR[task.priority] } as CSSProperties}
      >
        <span className="priority-dot" />
        {PRIORITY_LABEL[task.priority]}
      </span>
      {task.isPrivate ? (
        <>
          <span className="sep" />
          <span className="task-row__private">
            <Icon name="lock" size={9} /> Private
          </span>
        </>
      ) : null}
    </div>
  );

  const renderTask = (task: Task, index?: number) => {
    const isEditing = editingId === task.id;
    return (
      <div
        key={task.id}
        className={cx(
          'task-row',
          task.done && 'is-done',
          draggingId === task.id && 'is-dragging',
          dropTarget?.id === task.id && (dropTarget.before ? 'is-drop-before' : 'is-drop-after'),
        )}
        role="listitem"
        tabIndex={0}
        draggable={!task.done}
        aria-label={`${task.title}${task.done ? ', completed' : ''}${task.isNow ? ', now' : ''}`}
        onKeyDown={(event) => handleRowKey(event, task)}
        onDragStart={(event) => handleDragStart(event, task)}
        onDragOver={(event) => handleDragOver(event, task)}
        onDrop={(event) => handleDrop(event, task)}
        onDragEnd={() => {
          setDraggingId(null);
          setDropTarget(null);
        }}
      >
        <span className="task-row__handle" aria-hidden="true" title="Drag to reorder">
          <Icon name="grip" size={13} />
        </span>
        <button
          type="button"
          className={cx('check', task.done && 'is-done')}
          aria-label={task.done ? `Mark "${task.title}" not done` : `Mark "${task.title}" done`}
          aria-pressed={task.done}
          onClick={() => dispatch({ type: 'task/toggle', id: task.id })}
        >
          <Icon name="check" size={11} strokeWidth={2.6} />
        </button>
        <div className="task-row__body">
          {isEditing ? (
            <input
              className="task-title-input"
              value={editDraft}
              autoFocus
              maxLength={200}
              aria-label="Task title"
              onFocus={(event) => event.currentTarget.select()}
              onChange={(event) => setEditDraft(event.target.value)}
              onBlur={() => commitEditing(task)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  event.currentTarget.blur();
                } else if (event.key === 'Escape') {
                  event.preventDefault();
                  setEditDraft(task.title);
                  event.currentTarget.blur();
                }
              }}
            />
          ) : (
            <button
              type="button"
              className="task-row__title"
              title="Edit task"
              onClick={() => startEditing(task)}
            >
              {task.title}
            </button>
          )}
          {shareTaskMeta(task)}
        </div>
        <div className="task-row__actions">
          {!task.done ? (
            <IconButton
              label={task.isNow ? 'Clear Now' : 'Set as Now'}
              icon="bolt"
              size="sm"
              active={task.isNow}
              onClick={() => setNow(task)}
            />
          ) : null}
          <IconButton
            label={`Priority: ${PRIORITY_LABEL[task.priority]}. Change priority.`}
            icon="flag"
            size="sm"
            style={{ color: PRIORITY_COLOR[task.priority] }}
            onClick={() => cyclePriority(task)}
          />
          <IconButton
            label={task.isPrivate ? 'Visible only here. Make public.' : 'Hide from Present mode'}
            icon={task.isPrivate ? 'eye-off' : 'eye'}
            size="sm"
            active={task.isPrivate}
            onClick={() => togglePrivate(task)}
          />
          <IconButton
            label="Delete task"
            icon="trash"
            size="sm"
            className="task-row__delete"
            onClick={() => removeTask(task)}
          />
        </div>
        {index !== undefined ? <span className="sr-only">{index + 1}</span> : null}
      </div>
    );
  };

  return (
    <section className="panel tasks-panel" aria-label="Tasks">
      <div className="panel__head">
        <div className="task-panel__heading">
          <span className="panel__title">
            <Icon name="check-circle" size={15} />
            Tasks
          </span>
          <span className="count">{incomplete.length}</span>
        </div>
        <div className="panel__actions">
          <IconButton
            label="New list"
            icon="plus"
            size="sm"
            onClick={() => setListDialog({ mode: 'add', value: '' })}
          />
          <div className="popover-anchor" ref={listMenuRef}>
            <IconButton
              label="List options"
              icon="more"
              size="sm"
              aria-expanded={listMenuOpen}
              onClick={() => setListMenuOpen((open) => !open)}
            />
            {listMenuOpen ? (
              <div className="popover list-menu" role="menu">
                <button
                  type="button"
                  className="menu-item"
                  role="menuitem"
                  onClick={() => {
                    setListMenuOpen(false);
                    setListDialog({ mode: 'rename', value: activeList?.name ?? '' });
                  }}
                >
                  <Icon name="pencil" size={14} />
                  Rename list
                </button>
                <button
                  type="button"
                  className="menu-item"
                  role="menuitem"
                  disabled={completed.length === 0}
                  onClick={() => {
                    setListMenuOpen(false);
                    clearCompleted();
                  }}
                >
                  <Icon name="check-circle" size={14} />
                  Clear completed
                </button>
                <div className="menu-separator" />
                <button
                  type="button"
                  className="menu-item menu-item--danger"
                  role="menuitem"
                  disabled={state.lists.length <= 1}
                  onClick={() => {
                    setListMenuOpen(false);
                    setDeleteListOpen(true);
                  }}
                >
                  <Icon name="trash" size={14} />
                  Delete list
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="task-tabs">
        <div className="task-tabs__scroll" role="tablist" aria-label="Task lists">
          {state.lists.map((list) => {
            const openCount = state.tasks.filter(
              (task) => task.listId === list.id && !task.done,
            ).length;
            const active = list.id === activeListId;
            return (
              <button
                key={list.id}
                type="button"
                role="tab"
                aria-selected={active}
                className={cx('task-tab', active && 'is-active')}
                onClick={() => {
                  dispatch({ type: 'list/activate', id: list.id });
                  setEditingId(null);
                }}
              >
                {list.name}
                <span className="task-tab__count">{openCount}</span>
              </button>
            );
          })}
          <button
            type="button"
            className="task-tab task-tab--add"
            aria-label="New list"
            title="New list"
            onClick={() => setListDialog({ mode: 'add', value: '' })}
          >
            <Icon name="plus" size={13} />
          </button>
        </div>
        <div className="task-tabs__tools">
          <IconButton
            label="Focus quick add"
            icon="pencil"
            size="sm"
            onClick={() => quickAddRef.current?.focus()}
          />
        </div>
      </div>

      <div className={cx('quick-add', title.trim() && 'has-value')}>
        <Icon name="plus" size={15} className="quick-add__icon" />
        <input
          ref={quickAddRef}
          value={title}
          maxLength={200}
          placeholder={`Add to ${activeList?.name ?? 'list'}…`}
          aria-label={`Add a task to ${activeList?.name ?? 'list'}`}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              addTask();
            } else if (event.key === 'Escape') {
              setTitle('');
              event.currentTarget.blur();
            }
          }}
        />
        <button
          type="button"
          className="quick-add__priority"
          style={{ ['--priority-color' as string]: PRIORITY_COLOR[priority] } as CSSProperties}
          aria-label={`Priority: ${PRIORITY_LABEL[priority]}. Click to change.`}
          title={`Priority: ${PRIORITY_LABEL[priority]}`}
          onClick={() => setPriority((value) => nextPriority(value))}
        >
          <Icon name="flag" size={13} />
        </button>
        <button
          type="button"
          className="quick-add__submit"
          aria-label="Add task"
          title="Add task"
          onClick={addTask}
        >
          <Icon name="plus" size={13} />
        </button>
      </div>

      <div className="now-card">
        <div className="now-card__top">
          <span className="now-card__eyebrow">
            <Icon name="bolt" size={11} />
            Now
          </span>
          {nowTask ? (
            <div className="now-card__actions">
              <IconButton
                label="Clear Now"
                icon="x"
                size="sm"
                onClick={() => dispatch({ type: 'task/setNow', id: nowTask.id, isNow: false })}
              />
            </div>
          ) : null}
        </div>
        {nowTask ? (
          <>
            <div className="now-card__title-row">
              <button
                type="button"
                className={cx('check', nowTask.done && 'is-done')}
                aria-label={`Mark "${nowTask.title}" done`}
                onClick={() => dispatch({ type: 'task/toggle', id: nowTask.id })}
              >
                <Icon name="check" size={11} strokeWidth={2.6} />
              </button>
              <button
                type="button"
                className="now-card__title"
                onClick={() => startEditing(nowTask)}
              >
                {nowTask.title}
              </button>
            </div>
            <div className="now-card__meta">
              <span className="priority-dot" style={{ background: PRIORITY_COLOR[nowTask.priority] }} />
              <span>{PRIORITY_LABEL[nowTask.priority]} priority</span>
              <span className="sep" />
              <span>{nowList?.name ?? 'List'}</span>
              {nowTask.isPrivate ? (
                <>
                  <span className="sep" />
                  <span>
                    <Icon name="lock" size={9} /> Private
                  </span>
                </>
              ) : null}
            </div>
          </>
        ) : (
          <div className="now-card__empty">
            <div>
              <div className="now-card__empty-copy">What are you doing now?</div>
              <div className="now-card__empty-hint">
                Focus a task and press N, or use the bolt on any row.
              </div>
            </div>
            {incomplete[0] ? (
              <Button variant="subtle" size="sm" onClick={() => setNow(incomplete[0]!)}>
                Set first task
              </Button>
            ) : (
              <Button variant="subtle" size="sm" onClick={() => quickAddRef.current?.focus()}>
                Add a task
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="task-scroll">
        {incomplete.length === 0 && completed.length === 0 ? (
          <div className="task-empty">
            <EmptyState
              icon="check-circle"
              title="Nothing on this list yet"
              detail="Add the next small thing. You can reorder it when the day changes."
              action={
                <Button size="sm" variant="subtle" onClick={() => quickAddRef.current?.focus()}>
                  Add a task
                </Button>
              }
            />
          </div>
        ) : (
          <>
            {listedIncomplete.length > 0 ? (
              <div className="task-list" role="list" aria-label={`${activeList?.name ?? 'List'} tasks`}>
                {listedIncomplete.map((task, index) => renderTask(task, index))}
              </div>
            ) : (
              <div className="task-empty">
                <EmptyState
                  compact
                  icon="sparkles"
                  title={incomplete.length > 0 ? 'Nothing after this' : 'All clear on this list'}
                  detail={
                    incomplete.length > 0
                      ? 'Your Now task is pinned above. Keep it to one thing.'
                      : 'Nothing open. Enjoy the quiet, or add what comes next.'
                  }
                />
              </div>
            )}

            {completed.length > 0 ? (
              <div className="completed-block">
                <div className="completed-head">
                  <button
                    type="button"
                    className="completed-head__toggle"
                    aria-expanded={completedOpen}
                    onClick={() => setCompletedOpen((open) => !open)}
                  >
                    <Icon
                      name="chevron-right"
                      size={12}
                      className="completed-head__chevron"
                    />
                    Completed
                    <span className="task-group-label__count">{completed.length}</span>
                  </button>
                  <button
                    type="button"
                    className="completed-head__clear"
                    onClick={clearCompleted}
                  >
                    Clear
                  </button>
                </div>
                {completedOpen ? (
                  <div className="task-list completed-list" role="list" aria-label="Completed tasks">
                    {completed.map((task) => renderTask(task))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </div>

      <Modal
        open={listDialog !== null}
        onClose={() => setListDialog(null)}
        title={listDialog?.mode === 'rename' ? 'Rename list' : 'New list'}
        description={
          listDialog?.mode === 'rename'
            ? 'The list name appears everywhere the list is shown.'
            : 'Lists keep different kinds of work apart. You can move tasks between them later.'
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setListDialog(null)}>
              Cancel
            </Button>
            <Button
              variant="accent"
              onClick={submitListDialog}
              disabled={!listDialog?.value.trim()}
            >
              {listDialog?.mode === 'rename' ? 'Rename' : 'Create list'}
            </Button>
          </>
        }
      >
        <Field label="List name" htmlFor="list-name">
          <input
            id="list-name"
            ref={nameInputRef}
            className="input"
            data-autofocus
            value={listDialog?.value ?? ''}
            maxLength={40}
            placeholder="Clients, ideas, this week…"
            onChange={(event) =>
              setListDialog((current) =>
                current ? { ...current, value: event.target.value } : current,
              )
            }
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                submitListDialog();
              }
            }}
          />
        </Field>
      </Modal>

      <ConfirmDialog
        open={deleteListOpen}
        title="Delete this list?"
        message={`"${activeList?.name ?? 'List'}" and its ${listTasks.length} task${
          listTasks.length === 1 ? '' : 's'
        } will be removed. This cannot be undone.`}
        confirmLabel="Delete list"
        onClose={() => setDeleteListOpen(false)}
        onConfirm={() => {
          dispatch({ type: 'list/delete', id: activeListId });
          setDeleteListOpen(false);
          notify('List deleted.', { tone: 'danger' });
        }}
      />
    </section>
  );
}
