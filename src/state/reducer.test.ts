import { describe, expect, it } from 'vitest';
import { reducer } from './reducer';
import { createInitialState } from './defaults';
import type { BoardState } from './types';

const NOW = Date.UTC(2026, 9, 25, 12, 0, 0);

function fresh(): BoardState {
  return createInitialState(NOW);
}

describe('focus timer reducer', () => {
  it('restarts a finished timer at full duration instead of one second', () => {
    const state = fresh();
    state.focus.remainingSec = 0;
    state.focus.running = false;

    const next = reducer(state, { type: 'focus/start', at: NOW });

    expect(next.focus.running).toBe(true);
    expect(next.focus.startedAt).toBe(NOW);
    expect(next.focus.remainingSec).toBe(state.focus.durationSec);
  });

  it('preserves a partially elapsed timer when resuming', () => {
    const state = fresh();
    state.focus.remainingSec = 8 * 60;
    state.focus.running = false;

    const next = reducer(state, { type: 'focus/start', at: NOW });

    expect(next.focus.remainingSec).toBe(8 * 60);
  });

  it('counts completed focus sessions but not completed breaks', () => {
    const focus = fresh();
    focus.focus = {
      ...focus.focus,
      mode: 'focus',
      running: true,
      startedAt: NOW,
      remainingSec: 0,
      completedSessions: 2,
    };
    const afterFocus = reducer(focus, { type: 'focus/complete', at: NOW + 1000 });
    expect(afterFocus.focus.completedSessions).toBe(3);
    expect(afterFocus.focus.running).toBe(false);
    expect(afterFocus.focus.remainingSec).toBe(0);

    const rest = fresh();
    rest.focus = {
      ...rest.focus,
      mode: 'break',
      running: true,
      startedAt: NOW,
      remainingSec: 0,
      completedSessions: 2,
    };
    const afterBreak = reducer(rest, { type: 'focus/complete', at: NOW + 1000 });
    expect(afterBreak.focus.completedSessions).toBe(2);
    expect(afterBreak.focus.running).toBe(false);
  });
});

describe('status sessions', () => {
  it('closes the open session and opens exactly one new session', () => {
    const state = fresh();
    const preset = state.presets.find((entry) => entry.kind === 'break');
    if (!preset) throw new Error('Missing break preset');

    const next = reducer(state, { type: 'status/set', preset, at: NOW + 5000 });

    const open = next.sessions.filter((session) => session.endedAt === null);
    expect(open).toHaveLength(1);
    expect(open[0]?.label).toBe(preset.label);
    expect(next.current.presetId).toBe(preset.id);
    expect(next.current.since).toBe(NOW + 5000);
    expect(next.sessions.some((session) => session.endedAt === NOW + 5000)).toBe(true);
  });

  it('updates the subline without starting a new session', () => {
    const state = fresh();
    const next = reducer(state, {
      type: 'status/subline',
      subline: '  Writing the README  ',
    });

    expect(next.current.subline).toBe('Writing the README');
    expect(next.sessions).toHaveLength(state.sessions.length);
  });
});

describe('quiet modes and return times', () => {
  it('sets a return time and clears it when leaving the mode', () => {
    const state = fresh();
    const breakPreset = state.presets.find((preset) => preset.kind === 'break');
    const sleepPreset = state.presets.find((preset) => preset.kind === 'sleep');
    if (!breakPreset || !sleepPreset) throw new Error('Missing quiet presets');

    const onBreak = reducer(state, {
      type: 'status/set',
      preset: breakPreset,
      returnInMinutes: 15,
      at: NOW,
    });
    expect(onBreak.current.kind).toBe('break');
    expect(onBreak.current.returnAt).toBe(NOW + 15 * 60_000);

    const cleared = reducer(onBreak, { type: 'status/returnIn', minutes: null, at: NOW + 1000 });
    expect(cleared.current.returnAt).toBeNull();

    const sleeping = reducer(onBreak, {
      type: 'status/set',
      preset: sleepPreset,
      at: NOW + 2000,
    });
    expect(sleeping.current.kind).toBe('sleep');
    expect(sleeping.current.label).toBe('Sleeping');
    expect(sleeping.current.returnAt).toBeNull();
  });

  it('keeps a return time when the active status is re-applied', () => {
    const state = fresh();
    const awayPreset = state.presets.find((preset) => preset.kind === 'away');
    if (!awayPreset) throw new Error('Missing away preset');

    const away = reducer(state, {
      type: 'status/set',
      preset: awayPreset,
      returnInMinutes: 30,
      at: NOW,
    });
    const reapplied = reducer(away, { type: 'status/set', preset: awayPreset, at: NOW + 1000 });

    expect(reapplied.current.returnAt).toBe(NOW + 30 * 60_000);
  });
});

describe('task reducer', () => {
  it('adds tasks at the top and keeps a single Now task', () => {
    const state = fresh();
    const next = reducer(state, {
      type: 'task/add',
      title: '  New focus  ',
      isNow: true,
      id: 'task_new',
      at: NOW + 1000,
    });

    expect(next.tasks[0]?.id).toBe('task_new');
    expect(next.tasks[0]?.title).toBe('New focus');
    expect(next.tasks[0]?.isNow).toBe(true);
    expect(next.tasks.filter((task) => task.isNow)).toHaveLength(1);
  });

  it('clears Now and stamps completedAt when completing a task', () => {
    const state = fresh();
    const nowTask = state.tasks.find((task) => task.isNow);
    if (!nowTask) throw new Error('Missing seeded Now task');

    const next = reducer(state, {
      type: 'task/toggle',
      id: nowTask.id,
      at: NOW + 9000,
    });
    const updated = next.tasks.find((task) => task.id === nowTask.id);

    expect(updated?.done).toBe(true);
    expect(updated?.isNow).toBe(false);
    expect(updated?.completedAt).toBe(NOW + 9000);
    expect(next.tasks.some((task) => task.isNow)).toBe(false);
  });

  it('reorders within a list and ignores cross-list positions', () => {
    const state = fresh();
    const list = state.tasks.filter((task) => task.listId === 'list_today');
    const first = list[0];
    const last = list[list.length - 1];
    if (!first || !last) throw new Error('Missing seeded tasks');

    const moved = reducer(state, {
      type: 'task/reorder',
      listId: 'list_today',
      taskId: first.id,
      beforeId: null,
    });
    const movedList = moved.tasks.filter((task) => task.listId === 'list_today');
    expect(movedList[movedList.length - 1]?.id).toBe(first.id);

    const untouched = reducer(state, {
      type: 'task/reorder',
      listId: 'list_ideas',
      taskId: first.id,
      beforeId: null,
    });
    expect(untouched).toBe(state);
  });
});

describe('goals and settings', () => {
  it('recalculates milestone progress', () => {
    const state = fresh();
    const goal = state.goals[0];
    const milestone = goal?.milestones[0];
    if (!goal || !milestone) throw new Error('Missing seeded goal');

    const next = reducer(state, {
      type: 'goal/toggleMilestone',
      goalId: goal.id,
      milestoneId: milestone.id,
    });
    const updated = next.goals.find((entry) => entry.id === goal.id);
    expect(updated?.milestones[0]?.done).toBe(false);
    expect(updated?.progress).toBe(0);
  });

  it('clamps font scale and share port through the settings patch', () => {
    const state = fresh();
    const next = reducer(state, {
      type: 'settings/update',
      patch: {
        fontScale: 9,
        boardName: '   Studio   ',
        clockFormat: '24h',
        focusTargetMin: 900,
        notifyOnTimer: false,
        lanShare: { enabled: true, port: 12 },
      },
    });

    expect(next.settings.fontScale).toBe(1.3);
    expect(next.settings.boardName).toBe('Studio');
    expect(next.settings.clockFormat).toBe('24h');
    expect(next.settings.focusTargetMin).toBe(480);
    expect(next.settings.notifyOnTimer).toBe(false);
    expect(next.settings.lanShare.enabled).toBe(true);
    expect(next.settings.lanShare.port).toBe(1024);
    expect(next.settings.present).toEqual(state.settings.present);
  });
});
