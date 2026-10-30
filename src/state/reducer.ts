import type {
  Action,
  Area,
  BoardState,
  FocusMode,
  FocusState,
  Goal,
  GoalStatus,
  Priority,
  Settings,
  SettingsPatch,
  StatusKind,
  StatusPreset,
  Task,
} from './types';
import { STATE_VERSION } from './types';
import { AREA_COLORS } from './defaults';
import { clampNotes, clampNumber, cleanLine, isHexColor } from './sanitize';
import { DAY } from './time';

const MAX_SESSIONS = 500;
const SESSION_RETENTION_MS = 60 * DAY;
const MAX_TASKS = 300;
const MAX_GOALS = 40;
const MAX_AREAS = 8;
const MAX_LISTS = 24;

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
  returnInMinutes?: number | null,
): BoardState {
  const label = cleanLine(preset.label, 48, state.current.label) || 'Developing';
  const emoji = cleanLine(preset.emoji, 8, '•');
  const color = isHexColor(preset.color) ? preset.color : state.current.color;
  const kind: StatusKind =
    preset.kind === 'break' || preset.kind === 'away' || preset.kind === 'sleep'
      ? preset.kind
      : 'focus';
  const nextSubline =
    subline === undefined ? state.current.subline : cleanLine(subline, 120, '');

  const unchanged =
    state.current.label === label &&
    state.current.emoji === emoji &&
    state.current.color === color &&
    state.current.kind === kind &&
    state.current.presetId === presetId;

  const returnAt =
    returnInMinutes === undefined
      ? unchanged
        ? state.current.returnAt
        : null
      : returnInMinutes === null
        ? null
        : at + Math.round(clampNumber(returnInMinutes, 1, 24 * 60, 15)) * 60 * 1000;

  if (unchanged) {
    return touch(
      {
        ...state,
        current: { ...state.current, subline: nextSubline, returnAt },
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
        returnAt,
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

function isGoalStatus(value: unknown): value is GoalStatus {
  return value === 'active' || value === 'paused' || value === 'done';
}

function defaultAreaColor(areas: Area[]): string {
  const used = new Set(areas.map((area) => area.color.toLowerCase()));
  return AREA_COLORS.find((color) => !used.has(color.toLowerCase())) ?? AREA_COLORS[0]!;
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
    boardName: cleanLine(next.boardName, 40, base.boardName),
    clockFormat:
      next.clockFormat === '12h' || next.clockFormat === '24h' ? next.clockFormat : 'system',
    focusTargetMin: Math.round(
      clampNumber(next.focusTargetMin, 0, 8 * 60, base.focusTargetMin),
    ),
    notifyOnTimer: Boolean(next.notifyOnTimer),
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
      return setStatus(
        state,
        action.preset,
        action.subline,
        at,
        action.preset.id,
        action.returnInMinutes,
      );
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
      return setStatus(
        state,
        preset,
        action.subline,
        at,
        null,
        action.returnInMinutes,
      );
    }

    case 'status/subline':
      return touch({
        ...state,
        current: { ...state.current, subline: cleanLine(action.subline, 120, '') },
      });

    case 'status/returnIn': {
      const at = action.at ?? Date.now();
      const returnAt =
        action.minutes === null
          ? null
          : at + Math.round(clampNumber(action.minutes, 1, 24 * 60, 15)) * 60 * 1000;
      return touch(
        {
          ...state,
          current: { ...state.current, returnAt },
        },
        at,
      );
    }

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
      const goalId =
        action.goalId && state.goals.some((goal) => goal.id === action.goalId)
          ? action.goalId
          : undefined;
      const task: Task = {
        id: action.id ?? makeId('task'),
        listId,
        title,
        done: false,
        priority: action.priority ?? 'medium',
        isNow: Boolean(action.isNow),
        isPrivate: false,
        createdAt: at,
        ...(goalId ? { goalId } : {}),
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
      const goalId =
        action.patch.goalId === null
          ? undefined
          : action.patch.goalId && state.goals.some((goal) => goal.id === action.patch.goalId)
            ? action.patch.goalId
            : existing.goalId;
      return touch({
        ...state,
        tasks: state.tasks.map((task) =>
          task.id === action.id
            ? {
                ...task,
                title,
                priority,
                listId,
                ...(goalId ? { goalId } : { goalId: undefined }),
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

    case 'area/add': {
      if (state.areas.length >= MAX_AREAS) return state;
      const at = action.at ?? Date.now();
      const area: Area = {
        id: action.id ?? makeId('area'),
        name: cleanLine(action.name, 32, '') || 'New area',
        emoji: cleanLine(action.emoji, 8, '📁'),
        color: isHexColor(action.color) ? action.color : defaultAreaColor(state.areas),
        createdAt: at,
      };
      return touch({ ...state, areas: [...state.areas, area], activeAreaId: area.id }, at);
    }

    case 'area/update': {
      const existing = state.areas.find((area) => area.id === action.id);
      if (!existing) return state;
      const name =
        action.patch.name !== undefined
          ? cleanLine(action.patch.name, 32, existing.name)
          : existing.name;
      return touch({
        ...state,
        areas: state.areas.map((area) =>
          area.id === action.id
            ? {
                ...area,
                name,
                emoji:
                  action.patch.emoji !== undefined
                    ? cleanLine(action.patch.emoji, 8, area.emoji)
                    : area.emoji,
                color:
                  action.patch.color !== undefined && isHexColor(action.patch.color)
                    ? action.patch.color
                    : area.color,
              }
            : area,
        ),
      });
    }

    case 'area/delete': {
      if (state.areas.length <= 1) return state;
      const areas = state.areas.filter((area) => area.id !== action.id);
      const removedListIds = new Set(
        state.lists.filter((list) => list.areaId === action.id).map((list) => list.id),
      );
      const lists = state.lists.filter((list) => list.areaId !== action.id);
      const firstArea = areas[0];
      if (!firstArea) return state;
      const firstList = lists.find((list) => list.areaId === firstArea.id) ?? lists[0];
      return touch({
        ...state,
        areas,
        lists,
        tasks: state.tasks.filter((task) => !removedListIds.has(task.listId)),
        activeAreaId:
          state.activeAreaId === action.id ? firstArea.id : state.activeAreaId,
        activeListId:
          state.activeListId && removedListIds.has(state.activeListId)
            ? (firstList?.id ?? state.activeListId)
            : state.activeListId,
      });
    }

    case 'area/activate': {
      if (!state.areas.some((area) => area.id === action.id)) return state;
      const list = state.lists.find((entry) => entry.areaId === action.id);
      return {
        ...state,
        activeAreaId: action.id,
        activeListId: list?.id ?? state.activeListId,
      };
    }

    case 'list/add': {
      if (state.lists.length >= MAX_LISTS) return state;
      const name = cleanLine(action.name, 40, '') || 'Untitled project';
      const areaId =
        action.areaId && state.areas.some((area) => area.id === action.areaId)
          ? action.areaId
          : state.activeAreaId;
      const list = {
        id: action.id ?? makeId('list'),
        name,
        areaId,
        createdAt: action.at ?? Date.now(),
      };
      return touch({
        ...state,
        lists: [...state.lists, list],
        activeAreaId: areaId,
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

    case 'list/move': {
      if (!state.areas.some((area) => area.id === action.areaId)) return state;
      return touch({
        ...state,
        lists: state.lists.map((list) =>
          list.id === action.id ? { ...list, areaId: action.areaId } : list,
        ),
        activeAreaId:
          state.activeListId === action.id ? action.areaId : state.activeAreaId,
      });
    }

    case 'list/delete': {
      if (state.lists.length <= 1) return state;
      const removed = state.lists.find((list) => list.id === action.id);
      if (!removed) return state;
      const lists = state.lists.filter((list) => list.id !== action.id);
      const sibling = lists.find((list) => list.areaId === removed.areaId) ?? lists[0];
      if (!sibling) return state;
      return touch({
        ...state,
        lists,
        tasks: state.tasks.filter((task) => task.listId !== action.id),
        activeAreaId:
          state.activeListId === action.id ? sibling.areaId : state.activeAreaId,
        activeListId: state.activeListId === action.id ? sibling.id : state.activeListId,
      });
    }

    case 'list/activate': {
      const list = state.lists.find((entry) => entry.id === action.id);
      if (!list) return state;
      return { ...state, activeListId: list.id, activeAreaId: list.areaId };
    }

    case 'goal/add': {
      if (state.goals.length >= MAX_GOALS) return state;
      const at = action.at ?? Date.now();
      const areaId =
        action.goal?.areaId && state.areas.some((area) => area.id === action.goal?.areaId)
          ? action.goal.areaId
          : state.activeAreaId;
      const goal: Goal = {
        id: action.id ?? makeId('goal'),
        title: cleanLine(action.goal?.title, 90, '') || 'New goal',
        description: cleanLine(action.goal?.description, 280, ''),
        progress: Math.round(clampNumber(action.goal?.progress, 0, 100, 0)),
        milestones: action.goal?.milestones ?? [],
        targetDate: action.goal?.targetDate,
        areaId,
        status: isGoalStatus(action.goal?.status) ? action.goal.status : 'active',
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
        areaId:
          action.patch.areaId !== undefined
            ? state.areas.some((area) => area.id === action.patch.areaId)
              ? action.patch.areaId
              : undefined
            : existing.areaId,
        status: isGoalStatus(action.patch.status) ? action.patch.status : existing.status,
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
