import type {
  BoardState,
  Goal,
  PresentGoal,
  PresentTask,
  PresentViewModel,
  Priority,
  Session,
  Task,
  TimelineModel,
  TimelineSegment,
  TimelineTotal,
} from './types';
import { accentForState } from './defaults';
import { addDays, localDateKey, startOfDay } from './time';

export const PRIORITY_RANK: Record<Priority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

export const PRIORITY_LABEL: Record<Priority, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

export function getActiveList(state: BoardState) {
  return state.lists.find((list) => list.id === state.activeListId) ?? state.lists[0];
}

export function tasksForList(state: BoardState, listId: string): Task[] {
  return state.tasks.filter((task) => task.listId === listId);
}

export function visibleTasksForList(state: BoardState, listId: string): Task[] {
  return state.tasks.filter((task) => task.listId === listId && !task.isPrivate);
}

export function publicTaskStats(state: BoardState): { done: number; total: number } {
  const tasks = state.tasks.filter((task) => !task.isPrivate);
  return {
    done: tasks.filter((task) => task.done).length,
    total: tasks.length,
  };
}

export function listProgress(state: BoardState, listId: string): { done: number; total: number } {
  const tasks = tasksForList(state, listId);
  return {
    done: tasks.filter((task) => task.done).length,
    total: tasks.length,
  };
}

export function completedMilestones(goal: Goal): number {
  return goal.milestones.filter((milestone) => milestone.done).length;
}

export function orderedTasks(state: BoardState): Task[] {
  return [...state.tasks].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (a.isNow !== b.isNow) return a.isNow ? -1 : 1;
    const priority = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (priority !== 0) return priority;
    return a.createdAt - b.createdAt;
  });
}

function dayEnd(now: number): number {
  return startOfDay(addDays(now, 1));
}

export function buildTimeline(sessions: Session[], now = Date.now()): TimelineModel {
  const start = startOfDay(now);
  const end = dayEnd(now);
  const segments: TimelineSegment[] = [];

  const ordered = [...sessions].sort((a, b) => a.startedAt - b.startedAt);
  for (const session of ordered) {
    const segmentStart = Math.max(start, session.startedAt);
    const rawEnd = session.endedAt ?? now;
    const segmentEnd = Math.min(end, rawEnd, now);
    if (segmentEnd <= segmentStart) continue;
    const previous = segments[segments.length - 1];
    if (previous && previous.label === session.label && previous.color === session.color) {
      previous.end = segmentEnd;
      previous.durationMs = previous.end - previous.start;
      continue;
    }
    segments.push({
      id: session.id,
      label: session.label,
      emoji: session.emoji,
      color: session.color,
      kind: session.kind,
      start: segmentStart,
      end: segmentEnd,
      durationMs: segmentEnd - segmentStart,
    });
  }

  const totalsByKey = new Map<string, TimelineTotal>();
  for (const segment of segments) {
    const key = `${segment.label}::${segment.color}`;
    const existing = totalsByKey.get(key);
    if (existing) {
      existing.durationMs += segment.durationMs;
    } else {
      totalsByKey.set(key, {
        label: segment.label,
        emoji: segment.emoji,
        color: segment.color,
        kind: segment.kind,
        durationMs: segment.durationMs,
      });
    }
  }
  const totals = [...totalsByKey.values()].sort((a, b) => b.durationMs - a.durationMs);
  const totalTrackedMs = segments.reduce((sum, segment) => sum + segment.durationMs, 0);
  const focusMs = segments.reduce(
    (sum, segment) => sum + (segment.kind === 'focus' ? segment.durationMs : 0),
    0,
  );
  return { segments, totals, totalTrackedMs, focusMs };
}

export function computeStreak(sessions: Session[], now = Date.now()): number {
  const activeDays = new Set<string>();
  for (const session of sessions) {
    if (session.kind !== 'focus') continue;
    const day = localDateKey(session.startedAt);
    activeDays.add(day);
  }
  let cursor = startOfDay(now);
  if (!activeDays.has(localDateKey(cursor))) {
    cursor = startOfDay(addDays(cursor, -1));
  }
  let streak = 0;
  while (activeDays.has(localDateKey(cursor)) && streak < 3660) {
    streak += 1;
    cursor = startOfDay(addDays(cursor, -1));
  }
  return streak;
}

function toPresentTask(state: BoardState, task: Task): PresentTask {
  const list = state.lists.find((entry) => entry.id === task.listId);
  return {
    id: task.id,
    title: task.title,
    priority: task.priority,
    listName: list?.name ?? 'Tasks',
  };
}

export function buildPresentViewModel(
  state: BoardState,
  now = Date.now(),
): PresentViewModel {
  const quiet = state.current.kind !== 'focus';
  const publicNow = quiet
    ? undefined
    : state.tasks.find((task) => task.isNow && !task.done && !task.isPrivate);
  const upNextTasks = quiet
    ? []
    : state.tasks
        .filter((task) => !task.done && !task.isPrivate && task.id !== publicNow?.id)
        .slice()
        .sort((a, b) => {
          const priority = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
          if (priority !== 0) return priority;
          return a.createdAt - b.createdAt;
        });

  const publicGoals: PresentGoal[] = quiet
    ? []
    : state.goals
        .filter((goal) => !goal.isPrivate)
        .map((goal) => ({
          id: goal.id,
          title: goal.title,
          description: goal.description,
          progress: Math.round(goal.progress),
          targetDate: goal.targetDate,
          completedMilestones: completedMilestones(goal),
          totalMilestones: goal.milestones.length,
        }));

  const timeline = quiet
    ? { segments: [], totals: [], totalTrackedMs: 0, focusMs: 0 }
    : buildTimeline(state.sessions, now);
  const streakDays = quiet ? 0 : computeStreak(state.sessions, now);
  const settings = state.settings;

  return {
    generatedAt: now,
    status: {
      label: state.current.label,
      emoji: state.current.emoji,
      color: state.current.color,
      since: state.current.since,
      subline: state.current.subline,
      kind: state.current.kind,
      returnAt: state.current.returnAt,
    },
    nowTask: publicNow ? toPresentTask(state, publicNow) : null,
    upNext: upNextTasks.map((task) => toPresentTask(state, task)),
    taskStats: quiet ? { done: 0, total: 0 } : publicTaskStats(state),
    goals: publicGoals,
    note: quiet || state.notesPrivate ? null : state.notes.trim() ? state.notes.trim() : null,
    timeline,
    streakDays,
    focus: {
      running: state.focus.running,
      mode: state.focus.mode,
      remainingSec: state.focus.remainingSec,
      durationSec: state.focus.durationSec,
      startedAt: state.focus.startedAt,
    },
    settings: {
      theme: settings.theme,
      accent: settings.accent,
      accentColor: accentForState(state),
      background: settings.background,
      ambientMotion: settings.ambientMotion,
      reduceMotion: settings.reduceMotion,
      density: settings.density,
      boardName: settings.boardName,
      clockFormat: settings.clockFormat,
      focusTargetMin: quiet ? 0 : settings.focusTargetMin,
      showGoals: settings.present.showGoals,
      showTasks: settings.present.showTasks,
      showNotes: settings.present.showNotes,
      showTimeline: settings.present.showTimeline,
      showNow: settings.present.showNow,
      showStats: settings.present.showStats,
      showFocus: settings.present.showFocus,
      showStreak: settings.present.showStreak,
      showClock: settings.present.showClock,
      hideCursor: settings.present.hideCursor,
    },
  };
}

export function focusRemainingSeconds(state: BoardState, now = Date.now()): number {
  const { focus } = state;
  if (!focus.running || focus.startedAt === null) return Math.max(0, focus.remainingSec);
  const elapsed = (now - focus.startedAt) / 1000;
  return Math.max(0, Math.round(focus.remainingSec - elapsed));
}
