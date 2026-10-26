import type {
  Action,
  BoardState,
  FocusMode,
  FocusState,
  Goal,
  Priority,
  Settings,
  SettingsPatch,
  StatusKind,
  StatusPreset,
  Task,
} from './types';
import { STATE_VERSION } from './types';
import { clampNotes, clampNumber, cleanLine, isHexColor } from './sanitize';
import { DAY } from './time';

const MAX_SESSIONS = 500;
const SESSION_RETENTION_MS = 60 * DAY;
const MAX_TASKS = 300;
const MAX_GOALS = 40;
const MAX_LISTS = 12;

export function makeId(prefix = 'id'): string {
  const cryptoObject = globalThis.crypto;
  if (cryptoObject && typeof cryptoObject.randomUUID === 'function') {
    return `${prefix}_${cryptoObject.randomUUID().replace(/-/g, '').slice(0, 12)}`;
  }
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

function touch(state: BoardState, at = Date.now()): BoardState {
  return { ...state, meta: { ...state.meta, updatedAt: at } };
}

function closeOpenSessions(state: BoardState, at: number): BoardState['sessions'] {
  return state.sessions.map((session) =>
    session.endedAt === null
      ? { ...session, endedAt: Math.max(at, session.startedAt + 1000) }
      : session,
  );
}

function pruneSessions(sessions: BoardState['sessions'], now: number): BoardState['sessions'] {
  const cutoff = now - SESSION_RETENTION_MS;
  const kept = sessions.filter(
    (session) => session.endedAt === null || session.startedAt >= cutoff,
  );
  return kept.length > MAX_SESSIONS ? kept.slice(-MAX_SESSIONS) : kept;
}

function newSession(
  status: Pick<StatusPreset, 'label' | 'emoji' | 'color' | 'kind'>,
  at: number,
): BoardState['sessions'][number] {
  return {
    id: makeId('ses'),
    label: status.label,
    emoji: status.emoji,
    color: status.color,
    kind: status.kind,
    startedAt: at,
    endedAt: null,
  };
}

function setStatus(
  state: BoardState,
  preset: StatusPreset,
  subline: string | undefined,
  at: number,
  presetId: string | null,
): BoardState {
  const label = cleanLine(preset.label, 48, state.current.label) || 'Developing';
  const emoji = cleanLine(preset.emoji, 8, '•');
  const color = isHexColor(preset.color) ? preset.color : state.current.color;
  const kind: StatusKind =
    preset.kind === 'break' || preset.kind === 'away' ? preset.kind : 'focus';
  const nextSubline =
    subline === undefined ? state.current.subline : cleanLine(subline, 120, '');

  const unchanged =
    state.current.label === label &&
    state.current.emoji === emoji &&
    state.current.color === color &&
    state.current.kind === kind &&
    state.current.presetId === presetId;

  if (unchanged) {
    return touch(
      {
        ...state,
        current: { ...state.current, subline: nextSubline },
      },
      at,
    );
  }

  const sessions = pruneSessions(
    [...closeOpenSessions(state, at), newSession({ label, emoji, color, kind }, at)],
    at,
  );

  return touch(
    {
      ...state,
      current: {
        presetId,
        label,
        emoji,
        color,
        kind,
        since: at,
        subline: nextSubline,
      },
      sessions,
    },
    at,
  );
}

function insertTask(state: BoardState, task: Task): BoardState {
  let tasks = [task, ...state.tasks];
  if (task.isNow) {
    tasks = tasks.map((item) =>
      item.id === task.id ? item : item.isNow ? { ...item, isNow: false } : item,
    );
  }
  if (tasks.length > MAX_TASKS) {
    const kept = tasks.filter((item) => item.isNow);
    const rest = tasks.filter((item) => !item.isNow);
    tasks = [...kept, ...rest].slice(0, MAX_TASKS);
  }
  return { ...state, tasks };
}

function reorderTasks(
  state: BoardState,
  listId: string,
  taskId: string,
  beforeId: string | null,
): BoardState {
  if (taskId === beforeId) return state;
  const index = state.tasks.findIndex((task) => task.id === taskId && task.listId === listId);
  if (index < 0) return state;
  const tasks = [...state.tasks];
  const [moving] = tasks.splice(index, 1);
  if (!moving) return state;

  let insertAt = -1;
  if (beforeId) {
    insertAt = tasks.findIndex((task) => task.id === beforeId && task.listId === listId);
  }
  if (insertAt < 0) {
    let last = -1;
    tasks.forEach((task, taskIndex) => {
      if (task.listId === listId) last = taskIndex;
    });
    insertAt = last + 1;
  }
  tasks.splice(insertAt, 0, moving);
  return touch({ ...state, tasks });
}

function moveTask(state: BoardState, id: string, direction: -1 | 1): BoardState {
  const items = state.tasks
    .map((task, index) => ({ task, index }))
    .filter((entry) => entry.task.listId === state.tasks.find((t) => t.id === id)?.listId);
  const position = items.findIndex((entry) => entry.task.id === id);
  const target = items[position + direction];
  const current = items[position];
  if (!current || !target) return state;
  const tasks = [...state.tasks];
  tasks[current.index] = target.task;
  tasks[target.index] = current.task;
  return touch({ ...state, tasks });
}

function recalculateGoal(goal: Goal): Goal {
  if (goal.milestones.length === 0) return goal;
  const done = goal.milestones.filter((milestone) => milestone.done).length;
  return { ...goal, progress: Math.round((done / goal.milestones.length) * 100) };
}

function mergeSettings(base: Settings, patch: SettingsPatch): Settings {
  const next: Settings = {
    ...base,
    ...patch,
    present: { ...base.present, ...(patch.present ?? {}) },
    lanShare: { ...base.lanShare, ...(patch.lanShare ?? {}) },
  };
  return {
    ...next,
    fontScale: clampNumber(next.fontScale, 0.85, 1.3, base.fontScale),
    lanShare: {
      enabled: Boolean(next.lanShare.enabled),
      port: Math.round(clampNumber(next.lanShare.port, 1024, 65535, 4781)),
    },
  };
}

function startFocus(
  focus: FocusState,
  at: number,
  durationSec?: number,
  mode?: FocusMode,
): FocusState {
  const nextMode = mode ?? focus.mode;
  const nextDuration =
    typeof durationSec === 'number'
      ? Math.round(clampNumber(durationSec, 60, 12 * 3600, focus.durationSec))
      : focus.durationSec;
  const remaining =
    typeof durationSec === 'number'
      ? nextDuration
      : focus.remainingSec > 0
        ? focus.remainingSec
        : nextDuration;
  return {
    ...focus,
    mode: nextMode,
    durationSec: nextDuration,
    remainingSec: remaining,
    running: true,
    startedAt: at,
  };
}

function pauseFocus(focus: FocusState, at: number): FocusState {
  if (!focus.running || focus.startedAt === null) return focus;
  const elapsed = Math.max(0, (at - focus.startedAt) / 1000);
  return {
    ...focus,
    running: false,
    startedAt: null,
    remainingSec: Math.max(0, Math.round(focus.remainingSec - elapsed)),
  };
}

export function reducer(state: BoardState, action: Action): BoardState {
  switch (action.type) {
    case 'data/replace':
      return { ...action.state, version: STATE_VERSION };

    case 'status/set': {
      const at = action.at ?? Date.now();
      return setStatus(state, action.preset, action.subline, at, action.preset.id);
    }

    case 'status/custom': {
      const at = action.at ?? Date.now();
      const preset: StatusPreset = {
        id: 'custom',
        label: action.label,
        emoji: action.emoji,
        color: action.color,
        kind: action.kind,
      };
      return setStatus(state, preset, action.subline, at, null);
    }

    case 'status/subline':
      return touch({
        ...state,
        current: { ...state.current, subline: cleanLine(action.subline, 120, '') },
      });

    case 'status/resetTimer': {
      const at = action.at ?? Date.now();
      const sessions = pruneSessions(
        [
          ...closeOpenSessions(state, at),
          newSession(
            {
              label: state.current.label,
              emoji: state.current.emoji,
              color: state.current.color,
              kind: state.current.kind,
            },
            at,
          ),
        ],
        at,
      );
      return touch(
        {
          ...state,
          current: { ...state.current, since: at },
          sessions,
        },
        at,
      );
    }

    case 'task/add': {
      const at = action.at ?? Date.now();
      const title = cleanLine(action.title, 200, '');
      if (!title) return state;
      const listId =
        action.listId && state.lists.some((list) => list.id === action.listId)
          ? action.listId
          : state.activeListId;
      const task: Task = {
        id: action.id ?? makeId('task'),
        listId,
        title,
        done: false,
        priority: action.priority ?? 'medium',
        isNow: Boolean(action.isNow),
        isPrivate: false,
        createdAt: at,
      };
      return touch(insertTask(state, task), at);
    }

    case 'task/toggle': {
      const at = action.at ?? Date.now();
      const existing = state.tasks.find((task) => task.id === action.id);
      if (!existing) return state;
      const done = !existing.done;
      return touch(
        {
          ...state,
          tasks: state.tasks.map((task) =>
            task.id === action.id
              ? {
                  ...task,
                  done,
                  isNow: done ? false : task.isNow,
                  completedAt: done ? at : undefined,
                }
              : task,
          ),
        },
        at,
      );
    }

    case 'task/update': {
      const existing = state.tasks.find((task) => task.id === action.id);
      if (!existing) return state;
      const title =
        action.patch.title !== undefined
          ? cleanLine(action.patch.title, 200, existing.title)
          : existing.title;
      const priority: Priority =
        action.patch.priority === 'low' ||
        action.patch.priority === 'medium' ||
        action.patch.priority === 'high'
          ? action.patch.priority
          : existing.priority;
      const listId =
        action.patch.listId && state.lists.some((list) => list.id === action.patch.listId)
          ? action.patch.listId
          : existing.listId;
      return touch({
        ...state,
        tasks: state.tasks.map((task) =>
          task.id === action.id
            ? {
                ...task,
                title,
                priority,
                listId,
                isPrivate:
                  typeof action.patch.isPrivate === 'boolean'
                    ? action.patch.isPrivate
                    : task.isPrivate,
              }
            : task,
        ),
      });
    }

    case 'task/delete':
      return touch({
        ...state,
        tasks: state.tasks.filter((task) => task.id !== action.id),
      });

    case 'task/setNow': {
      if (action.isNow && !state.tasks.some((task) => task.id === action.id)) return state;
      return touch({
        ...state,
        tasks: state.tasks.map((task) =>
          task.id === action.id
            ? { ...task, isNow: action.isNow, done: action.isNow ? false : task.done }
            : action.isNow
              ? { ...task, isNow: false }
              : task,
        ),
      });
    }

    case 'task/reorder':
      return reorderTasks(state, action.listId, action.taskId, action.beforeId);

    case 'task/move': {
      const current = state.tasks.find((task) => task.id === action.id);
      if (!current) return state;
      return moveTask(state, action.id, action.direction);
    }

    case 'task/clearCompleted': {
      const tasks = state.tasks.filter(
        (task) => !task.done || (action.listId ? task.listId !== action.listId : false),
      );
      return touch({ ...state, tasks });
    }

    case 'list/add': {
      if (state.lists.length >= MAX_LISTS) return state;
      const name = cleanLine(action.name, 40, '') || 'Untitled list';
      const list = {
        id: action.id ?? makeId('list'),
        name,
        createdAt: action.at ?? Date.now(),
      };
      return touch({
        ...state,
        lists: [...state.lists, list],
        activeListId: list.id,
      });
    }

    case 'list/rename': {
      const name = cleanLine(action.name, 40, '');
      if (!name) return state;
      return touch({
        ...state,
        lists: state.lists.map((list) =>
          list.id === action.id ? { ...list, name } : list,
        ),
      });
    }

    case 'list/delete': {
      if (state.lists.length <= 1) return state;
      const lists = state.lists.filter((list) => list.id !== action.id);
      const first = lists[0];
      if (!first) return state;
      return touch({
        ...state,
        lists,
        tasks: state.tasks.filter((task) => task.listId !== action.id),
        activeListId: state.activeListId === action.id ? first.id : state.activeListId,
      });
    }

    case 'list/activate':
      if (!state.lists.some((list) => list.id === action.id)) return state;
      return { ...state, activeListId: action.id };

    case 'goal/add': {
      if (state.goals.length >= MAX_GOALS) return state;
      const at = action.at ?? Date.now();
      const goal: Goal = {
        id: action.id ?? makeId('goal'),
        title: cleanLine(action.goal?.title, 90, '') || 'New goal',
        description: cleanLine(action.goal?.description, 280, ''),
        progress: Math.round(clampNumber(action.goal?.progress, 0, 100, 0)),
        milestones: action.goal?.milestones ?? [],
        targetDate: action.goal?.targetDate,
        isPrivate: Boolean(action.goal?.isPrivate),
        createdAt: at,
      };
      return touch({ ...state, goals: [...state.goals, recalculateGoal(goal)] }, at);
    }

    case 'goal/update': {
      const existing = state.goals.find((goal) => goal.id === action.id);
      if (!existing) return state;
      const updated: Goal = {
        ...existing,
        title:
          action.patch.title !== undefined
            ? cleanLine(action.patch.title, 90, existing.title)
            : existing.title,
        description:
          action.patch.description !== undefined
            ? cleanLine(action.patch.description, 280, '')
            : existing.description,
        progress:
          action.patch.progress !== undefined
            ? Math.round(clampNumber(action.patch.progress, 0, 100, existing.progress))
            : existing.progress,
        targetDate:
          action.patch.targetDate !== undefined
            ? action.patch.targetDate || undefined
            : existing.targetDate,
        isPrivate:
          typeof action.patch.isPrivate === 'boolean'
            ? action.patch.isPrivate
            : existing.isPrivate,
      };
      return touch({
        ...state,
        goals: state.goals.map((goal) =>
          goal.id === action.id ? recalculateGoal(updated) : goal,
        ),
      });
    }

    case 'goal/delete':
      return touch({
        ...state,
        goals: state.goals.filter((goal) => goal.id !== action.id),
      });

    case 'goal/milestones': {
      const seen = new Set<string>();
      const milestones: Goal['milestones'] = [];
      for (const item of action.milestones) {
        const title = cleanLine(item.title, 90, '');
        if (!title) continue;
        let id = cleanLine(item.id, 40, '') || makeId('ms');
        while (seen.has(id)) id = makeId('ms');
        seen.add(id);
        milestones.push({ id, title, done: Boolean(item.done) });
        if (milestones.length >= 25) break;
      }
      return touch({
        ...state,
        goals: state.goals.map((goal) =>
          goal.id === action.goalId
            ? recalculateGoal({ ...goal, milestones })
            : goal,
        ),
      });
    }

    case 'goal/toggleMilestone':
      return touch({
        ...state,
        goals: state.goals.map((goal) => {
          if (goal.id !== action.goalId) return goal;
          const updated = {
            ...goal,
            milestones: goal.milestones.map((milestone) =>
              milestone.id === action.milestoneId
                ? { ...milestone, done: !milestone.done }
                : milestone,
            ),
          };
          return recalculateGoal(updated);
        }),
      });

    case 'goal/addMilestone': {
      const title = cleanLine(action.title, 90, '');
      if (!title) return state;
      return touch({
        ...state,
        goals: state.goals.map((goal) =>
          goal.id === action.goalId
            ? recalculateGoal({
                ...goal,
                milestones: [
                  ...goal.milestones,
                  { id: action.id ?? makeId('ms'), title, done: false },
                ],
              })
            : goal,
        ),
      });
    }

    case 'goal/removeMilestone':
      return touch({
        ...state,
        goals: state.goals.map((goal) => {
          if (goal.id !== action.goalId) return goal;
          const milestones = goal.milestones.filter(
            (milestone) => milestone.id !== action.milestoneId,
          );
          return milestones.length > 0
            ? recalculateGoal({ ...goal, milestones })
            : { ...goal, milestones };
        }),
      });

    case 'notes/set':
      return touch({ ...state, notes: clampNotes(action.text) });

    case 'notes/privacy':
      return touch({ ...state, notesPrivate: Boolean(action.isPrivate) });

    case 'settings/update':
      return touch({ ...state, settings: mergeSettings(state.settings, action.patch) });

    case 'focus/start': {
      const at = action.at ?? Date.now();
      return touch(
        { ...state, focus: startFocus(state.focus, at, action.durationSec, action.mode) },
        at,
      );
    }

    case 'focus/pause':
      return touch({ ...state, focus: pauseFocus(state.focus, action.at ?? Date.now()) });

    case 'focus/reset': {
      const mode = action.mode ?? state.focus.mode;
      const defaultDuration = mode === 'focus' ? 25 * 60 : 5 * 60;
      const duration = Math.round(
        clampNumber(action.durationSec, 60, 12 * 3600, defaultDuration),
      );
      return touch({
        ...state,
        focus: {
          ...state.focus,
          mode,
          durationSec: duration,
          remainingSec: duration,
          running: false,
          startedAt: null,
        },
      });
    }

    case 'focus/complete': {
      const at = action.at ?? Date.now();
      const completedFocus = state.focus.mode === 'focus';
      return touch(
        {
          ...state,
          focus: {
            ...pauseFocus(state.focus, at),
            remainingSec: 0,
            completedSessions:
              state.focus.completedSessions + (completedFocus ? 1 : 0),
          },
        },
        at,
      );
    }

    default: {
      const exhaustive: never = action;
      return exhaustive;
    }
  }
}
