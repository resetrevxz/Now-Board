import { describe, expect, it } from 'vitest';
import { buildPresentViewModel, buildTimeline, computeStreak } from './selectors';
import { createInitialState } from './defaults';
import { DAY, startOfDay } from './time';
import type { BoardState, Session } from './types';

const NOW = new Date(2026, 9, 25, 14, 0, 0).getTime();

function state(): BoardState {
  return createInitialState(NOW);
}

describe('buildPresentViewModel privacy', () => {
  it('never exposes private tasks, goals, or notes', () => {
    const board = state();
    board.tasks = [
      {
        id: 'public',
        listId: 'list_today',
        title: 'Public task',
        done: false,
        priority: 'high',
        isNow: true,
        isPrivate: false,
        createdAt: NOW - 1000,
      },
      {
        id: 'secret_task',
        listId: 'list_today',
        title: 'Secret task',
        done: false,
        priority: 'high',
        isNow: false,
        isPrivate: true,
        createdAt: NOW - 900,
      },
      {
        id: 'done',
        listId: 'list_today',
        title: 'Finished task',
        done: true,
        priority: 'low',
        isNow: false,
        isPrivate: false,
        createdAt: NOW - 800,
        completedAt: NOW - 400,
      },
    ];
    board.goals = [
      {
        id: 'secret_goal',
        title: 'Secret goal',
        description: 'Private plans',
        progress: 20,
        milestones: [],
        isPrivate: true,
        createdAt: NOW,
      },
      {
        id: 'public_goal',
        title: 'Public goal',
        description: 'Shareable plans',
        progress: 40,
        milestones: [],
        isPrivate: false,
        createdAt: NOW,
      },
    ];
    board.notes = 'A private note';
    board.notesPrivate = true;

    const view = buildPresentViewModel(board, NOW);

    expect(view.nowTask?.id).toBe('public');
    expect(view.upNext.map((task) => task.id)).not.toContain('secret_task');
    expect(view.taskStats).toEqual({ done: 1, total: 2 });
    expect(view.goals.map((goal) => goal.id)).toEqual(['public_goal']);
    expect(view.note).toBeNull();

    const serialized = JSON.stringify(view);
    expect(serialized).not.toContain('Secret task');
    expect(serialized).not.toContain('Secret goal');
    expect(serialized).not.toContain('A private note');
  });

  it('does not use a private Now task and still lists public work', () => {
    const board = state();
    board.tasks = board.tasks.map((task) =>
      task.isNow ? { ...task, isPrivate: true } : task,
    );

    const view = buildPresentViewModel(board, NOW);

    expect(view.nowTask).toBeNull();
    expect(view.upNext.length).toBeGreaterThan(0);
  });
});

describe('timeline and streak', () => {
  it('only includes today and merges adjacent identical statuses', () => {
    const today = startOfDay(NOW);
    const sessions: Session[] = [
      {
        id: 'before',
        label: 'Away',
        emoji: '🌙',
        color: '#888888',
        kind: 'away',
        startedAt: today - 4 * 3600_000,
        endedAt: today - 3 * 3600_000,
      },
      {
        id: 'one',
        label: 'Developing',
        emoji: '💻',
        color: '#4ADE9D',
        kind: 'focus',
        startedAt: today + 9 * 3600_000,
        endedAt: today + 10 * 3600_000,
      },
      {
        id: 'two',
        label: 'Developing',
        emoji: '💻',
        color: '#4ADE9D',
        kind: 'focus',
        startedAt: today + 10 * 3600_000,
        endedAt: today + 11 * 3600_000,
      },
      {
        id: 'three',
        label: 'On a break',
        emoji: '☕',
        color: '#FFCB6B',
        kind: 'break',
        startedAt: today + 11 * 3600_000,
        endedAt: today + 11.5 * 3600_000,
      },
    ];

    const timeline = buildTimeline(sessions, NOW);

    expect(timeline.segments.map((segment) => segment.id)).toEqual(['one', 'three']);
    expect(timeline.segments[0]?.durationMs).toBe(2 * 3600_000);
    expect(timeline.focusMs).toBe(2 * 3600_000);
    expect(timeline.totalTrackedMs).toBe(2.5 * 3600_000);
    expect(timeline.totals[0]?.label).toBe('Developing');
  });

  it('counts a streak from yesterday when today has no sessions yet', () => {
    const today = startOfDay(NOW);
    const sessions: Session[] = [0, 1, 2].map((offset) => ({
      id: `day-${offset}`,
      label: 'Developing',
      emoji: '💻',
      color: '#4ADE9D',
      kind: 'focus',
      startedAt: today - offset * DAY + 10 * 3600_000,
      endedAt: today - offset * DAY + 11 * 3600_000,
    }));

    expect(computeStreak(sessions, NOW)).toBe(3);
  });
});
