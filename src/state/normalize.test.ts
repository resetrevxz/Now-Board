import { describe, expect, it } from 'vitest';
import { BoardValidationError, normalizeBoard, tryNormalizeBoard } from './normalize';
import { createInitialState } from './defaults';
import { STATE_VERSION } from './types';

const NOW = Date.UTC(2026, 9, 25, 12, 0, 0);

describe('normalizeBoard', () => {
  it('accepts the raw JSON string returned by the Electron import dialog', () => {
    const state = createInitialState(NOW);
    const raw = `\uFEFF${JSON.stringify(state, null, 2)}`;

    const parsed = normalizeBoard(raw, NOW);

    expect(parsed.version).toBe(STATE_VERSION);
    expect(parsed.current.label).toBe(state.current.label);
    expect(parsed.tasks).toHaveLength(state.tasks.length);
    expect(parsed.settings.theme).toBe('dark');
  });

  it('reports malformed JSON as a board validation error', () => {
    expect(() => normalizeBoard('{ nope', NOW)).toThrow(BoardValidationError);
    expect(() => normalizeBoard('   ', NOW)).toThrow(/empty/i);
    const outcome = tryNormalizeBoard('not json', NOW);
    expect(outcome.state).toBeNull();
    expect(outcome.error).toMatch(/valid JSON/i);
  });

  it('rejects unrelated JSON and boards from a newer version', () => {
    expect(() => normalizeBoard({ hello: 'world' }, NOW)).toThrow(/backup/i);
    expect(() =>
      normalizeBoard({ tasks: [], version: STATE_VERSION + 1 }, NOW),
    ).toThrow(/newer version/i);
  });

  it('keeps exactly one Now task and routes unknown lists to a real list', () => {
    const parsed = normalizeBoard(
      {
        lists: [{ id: 'list_today', name: 'Today' }],
        tasks: [
          {
            id: 'task_one',
            listId: 'list_today',
            title: 'First',
            isNow: true,
            priority: 'high',
          },
          {
            id: 'task_two',
            listId: 'missing_list',
            title: 'Second',
            isNow: true,
            priority: 'nonsense',
          },
        ],
      },
      NOW,
    );

    expect(parsed.tasks.filter((task) => task.isNow)).toHaveLength(1);
    expect(parsed.tasks[0]?.isNow).toBe(true);
    expect(parsed.tasks[1]?.isNow).toBe(false);
    expect(parsed.tasks[1]?.listId).toBe('list_today');
    expect(parsed.tasks[1]?.priority).toBe('medium');
  });

  it('preserves privacy flags and clamps unsafe settings', () => {
    const parsed = normalizeBoard(
      {
        tasks: [
          {
            id: 'task_private',
            listId: 'list_today',
            title: 'Private work',
            isPrivate: true,
          },
        ],
        goals: [
          {
            id: 'goal_private',
            title: 'Private goal',
            isPrivate: true,
            milestones: [{ id: 'ms_one', title: 'One', done: true }],
          },
        ],
        notesPrivate: true,
        settings: {
          fontScale: 99,
          boardName: '   Studio   ',
          clockFormat: 'invalid',
          focusTargetMin: 999,
          notifyOnTimer: false,
          lanShare: { enabled: true, port: 1 },
          present: { showNotes: false, showClock: false },
        },
      },
      NOW,
    );

    expect(parsed.tasks[0]?.isPrivate).toBe(true);
    expect(parsed.goals[0]?.isPrivate).toBe(true);
    expect(parsed.goals[0]?.progress).toBe(100);
    expect(parsed.notesPrivate).toBe(true);
    expect(parsed.settings.fontScale).toBe(1.3);
    expect(parsed.settings.boardName).toBe('Studio');
    expect(parsed.settings.clockFormat).toBe('system');
    expect(parsed.settings.focusTargetMin).toBe(480);
    expect(parsed.settings.notifyOnTimer).toBe(false);
    expect(parsed.settings.lanShare).toEqual({ enabled: true, port: 1024 });
    expect(parsed.settings.present.showNotes).toBe(false);
    expect(parsed.settings.present.showClock).toBe(false);
    expect(parsed.settings.present.showTasks).toBe(true);
  });

  it('accepts the expanded accent palette and tray preference', () => {
    const parsed = normalizeBoard(
      {
        tasks: [],
        settings: { accent: 'rose', closeToTray: true },
      },
      NOW,
    );

    expect(parsed.settings.accent).toBe('rose');
    expect(parsed.settings.closeToTray).toBe(true);
  });

  it('upgrades old boards with no return time and keeps the sleep scene kind', () => {
    const oldBoard = normalizeBoard(
      {
        version: 1,
        tasks: [],
        current: {
          label: 'Developing',
          emoji: '💻',
          color: '#4ADE9D',
          kind: 'focus',
          since: NOW - 1000,
        },
      },
      NOW,
    );
    expect(oldBoard.version).toBe(STATE_VERSION);
    expect(oldBoard.current.returnAt).toBeNull();
    expect(oldBoard.settings.boardName).toBe('Now Board');
    expect(oldBoard.settings.clockFormat).toBe('system');
    expect(oldBoard.settings.focusTargetMin).toBe(240);
    expect(oldBoard.settings.notifyOnTimer).toBe(true);
    expect(oldBoard.settings.ambientMotion).toBe(false);

    const keepsMotion = normalizeBoard(
      {
        version: STATE_VERSION,
        tasks: [],
        settings: { ambientMotion: true },
      },
      NOW,
    );
    expect(keepsMotion.settings.ambientMotion).toBe(true);

    const sleeping = normalizeBoard(
      {
        version: 1,
        tasks: [],
        current: {
          label: 'Sleeping',
          emoji: '😴',
          color: '#8A93A6',
          kind: 'sleep',
          since: NOW - 1000,
          returnAt: NOW + 8 * 3600_000,
        },
      },
      NOW,
    );
    expect(sleeping.current.kind).toBe('sleep');
    expect(sleeping.current.returnAt).toBe(NOW + 8 * 3600_000);
  });
});
