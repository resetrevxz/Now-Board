import type {
  BoardState,
  CurrentStatus,
  FocusMode,
  Goal,
  Milestone,
  Priority,
  Session,
  Settings,
  StatusKind,
  StatusPreset,
  Task,
  TaskList,
} from './types';
import { STATE_VERSION } from './types';
import {
  DEFAULT_PRESETS,
  DEFAULT_SETTINGS,
  createInitialState,
} from './defaults';
import { clampNotes, clampNumber, clampText, cleanLine, isHexColor, oneOf } from './sanitize';
import { makeId } from './reducer';
import { DAY } from './time';

export class BoardValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BoardValidationError';
  }
}

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function timestamp(value: unknown, fallback: number): number {
  const parsed = finiteNumber(value, fallback);
  return parsed > 0 ? parsed : fallback;
}

function isStatusKind(value: unknown): value is StatusKind {
  return value === 'focus' || value === 'break' || value === 'away';
}

function isPriority(value: unknown): value is Priority {
  return value === 'low' || value === 'medium' || value === 'high';
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  if (!y || !m || !d) return false;
  const date = new Date(y, m - 1, d, 12);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

function normalizePresets(raw: unknown): StatusPreset[] {
  const seen = new Set<string>();
  const presets: StatusPreset[] = [];
  for (const item of asArray(raw)) {
    if (!isRecord(item)) continue;
    const label = cleanLine(item.label, 48, '');
    if (!label) continue;
    let id = cleanLine(item.id, 40, '') || makeId('preset');
    while (seen.has(id)) id = makeId('preset');
    seen.add(id);
    presets.push({
      id,
      label,
      emoji: cleanLine(item.emoji, 8, '•'),
      color: isHexColor(item.color) ? item.color : '#4ADE9D',
      kind: isStatusKind(item.kind) ? item.kind : 'focus',
    });
    if (presets.length >= 16) break;
  }
  return presets.length > 0 ? presets : DEFAULT_PRESETS.map((p) => ({ ...p }));
}

function normalizeLists(raw: unknown, now: number): TaskList[] {
  const seen = new Set<string>();
  const lists: TaskList[] = [];
  for (const item of asArray(raw)) {
    if (!isRecord(item)) continue;
    const name = cleanLine(item.name, 40, '');
    if (!name) continue;
    let id = cleanLine(item.id, 40, '') || makeId('list');
    while (seen.has(id)) id = makeId('list');
    seen.add(id);
    lists.push({ id, name, createdAt: timestamp(item.createdAt, now) });
    if (lists.length >= 12) break;
  }
  if (lists.length === 0) {
    lists.push({ id: 'list_today', name: 'Today', createdAt: now });
  }
  return lists;
}

function normalizeTasks(raw: unknown, lists: TaskList[], now: number): Task[] {
  const listIds = new Set(lists.map((list) => list.id));
  const defaultList = lists[0]?.id ?? 'list_today';
  const seen = new Set<string>();
  const tasks: Task[] = [];
  let hasNow = false;
  for (const item of asArray(raw)) {
    if (!isRecord(item)) continue;
    const title = cleanLine(item.title, 200, '');
    if (!title) continue;
    let id = cleanLine(item.id, 40, '') || makeId('task');
    while (seen.has(id)) id = makeId('task');
    seen.add(id);
    const done = Boolean(item.done);
    const listId = cleanLine(item.listId, 40, '');
    const isNow = Boolean(item.isNow) && !done && !hasNow;
    if (isNow) hasNow = true;
    tasks.push({
      id,
      listId: listIds.has(listId) ? listId : defaultList,
      title,
      done,
      priority: isPriority(item.priority) ? item.priority : 'medium',
      isNow,
      isPrivate: Boolean(item.isPrivate),
      createdAt: timestamp(item.createdAt, now),
      completedAt: done ? timestamp(item.completedAt, now) : undefined,
    });
    if (tasks.length >= 300) break;
  }
  return tasks;
}

function normalizeGoals(raw: unknown, now: number): Goal[] {
  const seen = new Set<string>();
  const goals: Goal[] = [];
  for (const item of asArray(raw)) {
    if (!isRecord(item)) continue;
    const title = cleanLine(item.title, 90, '');
    if (!title) continue;
    let id = cleanLine(item.id, 40, '') || makeId('goal');
    while (seen.has(id)) id = makeId('goal');
    seen.add(id);
    const milestoneSeen = new Set<string>();
    const milestones: Milestone[] = [];
    for (const rawMilestone of asArray(item.milestones)) {
      if (!isRecord(rawMilestone)) continue;
      const milestoneTitle = cleanLine(rawMilestone.title, 90, '');
      if (!milestoneTitle) continue;
      let milestoneId = cleanLine(rawMilestone.id, 40, '') || makeId('ms');
      while (milestoneSeen.has(milestoneId)) milestoneId = makeId('ms');
      milestoneSeen.add(milestoneId);
      milestones.push({
        id: milestoneId,
        title: milestoneTitle,
        done: Boolean(rawMilestone.done),
      });
      if (milestones.length >= 25) break;
    }
    const doneMilestones = milestones.filter((milestone) => milestone.done).length;
    const progress =
      milestones.length > 0
        ? Math.round((doneMilestones / milestones.length) * 100)
        : Math.round(clampNumber(item.progress, 0, 100, 0));
    goals.push({
      id,
      title,
      description: cleanLine(item.description, 280, ''),
      progress,
      milestones,
      targetDate: isIsoDate(item.targetDate) ? item.targetDate : undefined,
      isPrivate: Boolean(item.isPrivate),
      createdAt: timestamp(item.createdAt, now),
    });
    if (goals.length >= 40) break;
  }
  return goals;
}

function normalizeCurrent(
  raw: unknown,
  presets: StatusPreset[],
  sessions: Session[],
  fallback: CurrentStatus,
  now: number,
): CurrentStatus {
  const base = presets[0] ?? DEFAULT_PRESETS[0];
  if (!base) throw new BoardValidationError('No status presets available.');
  const fallbackStatus: CurrentStatus = {
    ...fallback,
    presetId: base.id,
    label: base.label,
    emoji: base.emoji,
    color: base.color,
    kind: base.kind,
  };
  if (!isRecord(raw)) {
    const open = sessions.find((session) => session.endedAt === null);
    return open
      ? {
          presetId: null,
          label: open.label,
          emoji: open.emoji,
          color: open.color,
          kind: open.kind,
          since: open.startedAt,
          subline: '',
        }
      : fallbackStatus;
  }
  const presetIdRaw = raw.presetId;
  const presetId =
    typeof presetIdRaw === 'string' && presets.some((preset) => preset.id === presetIdRaw)
      ? presetIdRaw
      : null;
  const label = cleanLine(raw.label, 48, '') || fallbackStatus.label;
  const emoji = cleanLine(raw.emoji, 8, '') || fallbackStatus.emoji;
  const color = isHexColor(raw.color) ? raw.color : fallbackStatus.color;
  const kind = isStatusKind(raw.kind) ? raw.kind : fallbackStatus.kind;
  return {
    presetId,
    label,
    emoji,
    color,
    kind,
    since: timestamp(raw.since, now),
    subline: cleanLine(raw.subline, 120, ''),
  };
}

function normalizeSessions(raw: unknown, current: CurrentStatus, now: number): Session[] {
  const seen = new Set<string>();
  const sessions: Session[] = [];
  for (const item of asArray(raw)) {
    if (!isRecord(item)) continue;
    const label = cleanLine(item.label, 48, '');
    if (!label) continue;
    let id = cleanLine(item.id, 40, '') || makeId('ses');
    while (seen.has(id)) id = makeId('ses');
    seen.add(id);
    const startedAt = timestamp(item.startedAt, now);
    const endedRaw = item.endedAt;
    const endedAt =
      typeof endedRaw === 'number' && Number.isFinite(endedRaw) && endedRaw > startedAt
        ? endedRaw
        : null;
    sessions.push({
      id,
      label,
      emoji: cleanLine(item.emoji, 8, '•'),
      color: isHexColor(item.color) ? item.color : '#4ADE9D',
      kind: isStatusKind(item.kind) ? item.kind : 'focus',
      startedAt,
      endedAt,
    });
    if (sessions.length >= 500) break;
  }

  sessions.sort((a, b) => a.startedAt - b.startedAt);
  const matchingIndex = sessions.findIndex(
    (session) => session.endedAt === null && session.label === current.label,
  );

  if (matchingIndex >= 0) {
    const matching = sessions[matchingIndex];
    if (matching) {
      matching.startedAt = current.since;
      matching.emoji = current.emoji;
      matching.color = current.color;
      matching.kind = current.kind;
      matching.endedAt = null;
    }
    sessions.forEach((session, index) => {
      if (index !== matchingIndex && session.endedAt === null) {
        session.endedAt = Math.max(session.startedAt + 1000, current.since);
      }
    });
  } else {
    sessions.forEach((session) => {
      if (session.endedAt === null) {
        session.endedAt = Math.max(session.startedAt + 1000, now);
      }
    });
    sessions.push({
      id: makeId('ses'),
      label: current.label,
      emoji: current.emoji,
      color: current.color,
      kind: current.kind,
      startedAt: current.since,
      endedAt: null,
    });
    sessions.sort((a, b) => a.startedAt - b.startedAt);
  }

  const cutoff = now - 60 * DAY;
  const kept = sessions.filter(
    (session) => session.endedAt === null || session.startedAt >= cutoff,
  );
  return kept.length > 500 ? kept.slice(-500) : kept;
}

function normalizeFocus(raw: unknown): BoardState['focus'] {
  const fallback = createInitialState().focus;
  if (!isRecord(raw)) return fallback;
  const mode: FocusMode = raw.mode === 'break' ? 'break' : 'focus';
  const durationSec = Math.round(clampNumber(raw.durationSec, 60, 12 * 3600, fallback.durationSec));
  const running = Boolean(raw.running) && typeof raw.startedAt === 'number';
  return {
    mode,
    durationSec,
    remainingSec: Math.round(clampNumber(raw.remainingSec, 0, durationSec, durationSec)),
    running,
    startedAt: running ? timestamp(raw.startedAt, Date.now()) : null,
    completedSessions: Math.round(clampNumber(raw.completedSessions, 0, 100000, 0)),
  };
}

function normalizeSettings(raw: unknown): Settings {
  const base = DEFAULT_SETTINGS;
  if (!isRecord(raw)) {
    return {
      ...base,
      present: { ...base.present },
      lanShare: { ...base.lanShare },
    };
  }
  const presentRaw = isRecord(raw.present) ? raw.present : {};
  const lanRaw = isRecord(raw.lanShare) ? raw.lanShare : {};
  const present = { ...base.present };
  for (const key of Object.keys(base.present) as (keyof Settings['present'])[]) {
    if (typeof presentRaw[key] === 'boolean') {
      present[key] = presentRaw[key] as boolean;
    }
  }
  return {
    theme: oneOf(raw.theme, ['dark', 'light'] as const, base.theme),
    accent: oneOf(
      raw.accent,
      ['status', 'moss', 'tide', 'iris', 'ember', 'rose', 'sun', 'sea', 'lime'] as const,
      base.accent,
    ),
    background: oneOf(raw.background, ['gradient', 'solid'] as const, base.background),
    ambientMotion:
      typeof raw.ambientMotion === 'boolean' ? raw.ambientMotion : base.ambientMotion,
    reduceMotion:
      typeof raw.reduceMotion === 'boolean' ? raw.reduceMotion : base.reduceMotion,
    fontScale: clampNumber(raw.fontScale, 0.85, 1.3, base.fontScale),
    density: oneOf(raw.density, ['comfortable', 'compact'] as const, base.density),
    present,
    alwaysOnTop:
      typeof raw.alwaysOnTop === 'boolean' ? raw.alwaysOnTop : base.alwaysOnTop,
    launchAtLogin:
      typeof raw.launchAtLogin === 'boolean' ? raw.launchAtLogin : base.launchAtLogin,
    keepAwake: typeof raw.keepAwake === 'boolean' ? raw.keepAwake : base.keepAwake,
    closeToTray:
      typeof raw.closeToTray === 'boolean' ? raw.closeToTray : base.closeToTray,
    globalHotkeys:
      typeof raw.globalHotkeys === 'boolean' ? raw.globalHotkeys : base.globalHotkeys,
    lanShare: {
      enabled: Boolean(lanRaw.enabled),
      port: Math.round(clampNumber(lanRaw.port, 1024, 65535, base.lanShare.port)),
    },
  };
}

export function normalizeBoard(input: unknown, now = Date.now()): BoardState {
  let data: unknown = input;
  if (typeof input === 'string') {
    const text = input.replace(/^\uFEFF/, '').trim();
    if (!text) {
      throw new BoardValidationError('That file is empty.');
    }
    try {
      data = JSON.parse(text) as unknown;
    } catch {
      throw new BoardValidationError('That file is not valid JSON.');
    }
  }
  if (!isRecord(data)) {
    throw new BoardValidationError('That file does not look like a Now Board backup.');
  }
  const looksLikeBoard = ['current', 'tasks', 'goals', 'lists', 'sessions', 'settings'].some(
    (key) => key in data,
  );
  if (!looksLikeBoard) {
    throw new BoardValidationError('That file does not look like a Now Board backup.');
  }
  if (typeof data.version === 'number' && data.version > STATE_VERSION) {
    throw new BoardValidationError(
      'This backup was made by a newer version of Now Board. Update the app first.',
    );
  }

  const fallback = createInitialState(now);
  const presets = normalizePresets(data.presets);
  const lists = normalizeLists(data.lists, now);
  const activeListRaw = cleanLine(data.activeListId, 40, '');
  const activeListId = lists.some((list) => list.id === activeListRaw)
    ? activeListRaw
    : (lists[0]?.id ?? 'list_today');
  const tasks = normalizeTasks(data.tasks, lists, now);
  const goals = normalizeGoals(data.goals, now);
  const sessionsBeforeCurrent = asArray(data.sessions)
    .filter((item): item is JsonRecord => isRecord(item))
    .map((item) => ({
      id: cleanLine(item.id, 40, '') || makeId('ses'),
      label: cleanLine(item.label, 48, ''),
      emoji: cleanLine(item.emoji, 8, '•'),
      color: isHexColor(item.color) ? item.color : '#4ADE9D',
      kind: isStatusKind(item.kind) ? item.kind : ('focus' as const),
      startedAt: timestamp(item.startedAt, now),
      endedAt: null,
    }))
    .filter((session) => Boolean(session.label));
  const current = normalizeCurrent(
    data.current,
    presets,
    sessionsBeforeCurrent,
    fallback.current,
    now,
  );
  const sessions = normalizeSessions(data.sessions, current, now);
  const notes = clampNotes(data.notes);
  const createdAt = timestamp(
    isRecord(data.meta) ? data.meta.createdAt : undefined,
    fallback.meta.createdAt,
  );
  const updatedAt = timestamp(
    isRecord(data.meta) ? data.meta.updatedAt : undefined,
    createdAt,
  );

  return {
    version: STATE_VERSION,
    current,
    presets,
    sessions,
    tasks,
    lists,
    activeListId,
    goals,
    notes,
    notesPrivate: Boolean(data.notesPrivate),
    focus: normalizeFocus(data.focus),
    settings: normalizeSettings(data.settings),
    meta: { createdAt, updatedAt },
  };
}

export function tryNormalizeBoard(
  input: unknown,
  now = Date.now(),
): { state: BoardState; error: null } | { state: null; error: string } {
  try {
    return { state: normalizeBoard(input, now), error: null };
  } catch (error) {
    return {
      state: null,
      error:
        error instanceof BoardValidationError
          ? error.message
          : 'The board data could not be read.',
    };
  }
}

export function boardToJson(state: BoardState): string {
  return JSON.stringify(state, null, 2);
}

export function safeFileName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
}

export function countWords(value: string): number {
  const trimmed = value.trim();
  if (!trimmed) return 0;
  return clampText(trimmed, 100000).split(/\s+/).length;
}
