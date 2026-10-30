import type {
  Area,
  BoardState,
  Goal,
  GoalStatus,
  PresentGoal,
  PresentPreset,
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

/** Anything shorter than this is a slip, not a rhythm. */
export const MIN_SESSION_MS = 60_000;

export const GOAL_STATUS_LABEL: Record<GoalStatus, string> = {
  active: 'Active',
  paused: 'Paused',
  done: 'Done',
};

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

export function getActiveArea(state: BoardState): Area | undefined {
  return state.areas.find((area) => area.id === state.activeAreaId) ?? state.areas[0];
}

export function getActiveList(state: BoardState) {
  return state.lists.find((list) => list.id === state.activeListId) ?? state.lists[0];
}

export function listsForArea(state: BoardState, areaId: string) {
  return state.lists.filter((list) => list.areaId === areaId);
}

export function areaForList(state: BoardState, listId: string): Area | undefined {
  const list = state.lists.find((entry) => entry.id === listId);
  return list ? state.areas.find((area) => area.id === list.areaId) : undefined;
}

export function openTaskCount(state: BoardState, listId: string): number {
  return state.tasks.filter((task) => task.listId === listId && !task.done).length;
}

export function areaTaskCount(state: BoardState, areaId: string): number {
  const listIds = new Set(listsForArea(state, areaId).map((list) => list.id));
  return state.tasks.filter((task) => listIds.has(task.listId) && !task.done).length;
}

export function tasksForList(state: BoardState, listId: string): Task[] {
  return state.tasks.filter((task) => task.listId === listId);
}

export function visibleTasksForList(state: BoardState, listId: string): Task[] {
  return state.tasks.filter((task) => task.listId === listId && !task.isPrivate);
}

export function completedTasksForList(state: BoardState, listId: string): Task[] {
  return tasksForList(state, listId)
    .filter((task) => task.done)
    .sort((a, b) => (b.completedAt ?? b.createdAt) - (a.completedAt ?? a.createdAt));
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

export function linkedTasks(state: BoardState, goalId: string): Task[] {
  return state.tasks.filter((task) => task.goalId === goalId);
}

export interface GoalMetrics {
  progress: number;
  source: 'done' | 'milestones' | 'tasks' | 'manual';
  milestonesDone: number;
  milestonesTotal: number;
  linkedTotal: number;
  linkedDone: number;
  nextMilestone: string | null;
  openTasks: number;
}

export function goalMetrics(state: BoardState, goal: Goal): GoalMetrics {
  const milestonesDone = completedMilestones(goal);
  const milestonesTotal = goal.milestones.length;
  const linked = linkedTasks(state, goal.id);
  const linkedDone = linked.filter((task) => task.done).length;
  const nextMilestone = goal.milestones.find((milestone) => !milestone.done)?.title ?? null;
  let progress = Math.round(goal.progress);
  let source: GoalMetrics['source'] = 'manual';

  if (goal.status === 'done') {
    progress = 100;
    source = 'done';
  } else if (milestonesTotal > 0) {
    progress = Math.round((milestonesDone / milestonesTotal) * 100);
    source = 'milestones';
  } else if (linked.length > 0) {
    progress = Math.round((linkedDone / linked.length) * 100);
    source = 'tasks';
  }

  return {
    progress,
    source,
    milestonesDone,
    milestonesTotal,
    linkedTotal: linked.length,
    linkedDone,
    nextMilestone,
    openTasks: linked.length - linkedDone,
  };
}

export function orderedGoals(state: BoardState): Goal[] {
  const rank: Record<GoalStatus, number> = { active: 0, paused: 1, done: 2 };
  return [...state.goals].sort((a, b) => {
    if (a.status !== b.status) return rank[a.status] - rank[b.status];
    const aTarget = a.targetDate ?? '9999-99-99';
    const bTarget = b.targetDate ?? '9999-99-99';
    if (aTarget !== bTarget) return aTarget.localeCompare(bTarget);
    return a.createdAt - b.createdAt;
  });
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
    const rawEnd = session.endedAt ?? now;
    // A closed session shorter than a minute was a slip of the hand, not a
    // mode worth recording. The open session is kept so a live segment can
    // grow naturally; it disappears if it closes under a minute.
    if (session.endedAt !== null && rawEnd - session.startedAt < MIN_SESSION_MS) continue;
    const segmentStart = Math.max(start, session.startedAt);
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
    const duration = (session.endedAt ?? now) - session.startedAt;
    if (duration < MIN_SESSION_MS) continue;
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
  const area = list ? state.areas.find((entry) => entry.id === list.areaId) : undefined;
  return {
    id: task.id,
    title: task.title,
    priority: task.priority,
    listName: list?.name ?? 'Tasks',
    areaName: area?.name ?? 'Workspace',
    areaColor: area?.color ?? '#4ADE9D',
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

  const publicState = { ...state, tasks: state.tasks.filter((task) => !task.isPrivate) };
  const publicGoals: PresentGoal[] = quiet
    ? []
    : orderedGoals(state)
        .filter((goal) => !goal.isPrivate && goal.status !== 'done')
        .map((goal) => {
          const metrics = goalMetrics(publicState, goal);
          const area = goal.areaId
            ? state.areas.find((entry) => entry.id === goal.areaId)
            : undefined;
          return {
            id: goal.id,
            title: goal.title,
            description: goal.description,
            progress: metrics.progress,
            targetDate: goal.targetDate,
            completedMilestones: metrics.milestonesDone,
            totalMilestones: metrics.milestonesTotal,
            nextMilestone: metrics.nextMilestone ?? undefined,
            linkedTasks: metrics.linkedTotal,
            linkedTasksDone: metrics.linkedDone,
            areaName: area?.name,
            areaColor: area?.color,
            status: goal.status,
          };
        });

  const presets: PresentPreset[] = state.presets.map((preset) => ({
    id: preset.id,
    label: preset.label,
    emoji: preset.emoji,
    color: preset.color,
    kind: preset.kind,
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
    presets: quiet ? [] : presets,
    activePresetId: quiet ? null : state.current.presetId,
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
