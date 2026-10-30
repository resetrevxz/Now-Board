import type {
  BoardState,
  Goal,
  PresentSettings,
  Settings,
  StatusPreset,
  Task,
  TaskList,
} from './types';
import { STATE_VERSION } from './types';
import { addDays, toDateInputValue } from './time';

export const ACCENT_PALETTES = {
  moss: '#4ADE9D',
  tide: '#5BB8FF',
  iris: '#B39CFF',
  ember: '#FF9F6E',
  rose: '#FF9FB2',
  sun: '#FFD166',
  sea: '#56D9E8',
  lime: '#B8E986',
} as const;

export const ACCENT_LABELS: Record<keyof typeof ACCENT_PALETTES, string> = {
  moss: 'Moss',
  tide: 'Tide',
  iris: 'Iris',
  ember: 'Ember',
  rose: 'Rose',
  sun: 'Sun',
  sea: 'Sea',
  lime: 'Lime',
};

export const DEFAULT_PRESETS: StatusPreset[] = [
  { id: 'developing', label: 'Developing', emoji: '💻', color: '#4ADE9D', kind: 'focus' },
  { id: 'designing', label: 'Designing', emoji: '🎨', color: '#B6A0FF', kind: 'focus' },
  { id: 'debugging', label: 'Debugging', emoji: '🐛', color: '#FFA46D', kind: 'focus' },
  { id: 'deep-work', label: 'Deep work', emoji: '🧠', color: '#6FB6FF', kind: 'focus' },
  { id: 'streaming', label: 'Streaming', emoji: '🔴', color: '#FF93C8', kind: 'focus' },
  { id: 'break', label: 'On a break', emoji: '☕', color: '#FFCB6B', kind: 'break' },
  { id: 'away', label: 'Away', emoji: '🌙', color: '#A3AEBF', kind: 'away' },
  { id: 'sleeping', label: 'Sleeping', emoji: '😴', color: '#8A93A6', kind: 'sleep' },
];

export const DEFAULT_PRESENT: PresentSettings = {
  showGoals: true,
  showTasks: true,
  showNotes: true,
  showTimeline: true,
  showNow: true,
  showStats: true,
  showFocus: true,
  showStreak: true,
  showClock: true,
  hideCursor: true,
  fullscreen: false,
};

export const DEFAULT_SETTINGS: Settings = {
  theme: 'dark',
  accent: 'status',
  background: 'gradient',
  // Off by default: a continuously animating background keeps the compositor
  // (and in software rendering, the CPU) busy even while the board is idle.
  ambientMotion: false,
  reduceMotion: false,
  fontScale: 1,
  density: 'comfortable',
  boardName: 'Now Board',
  clockFormat: 'system',
  focusTargetMin: 240,
  notifyOnTimer: true,
  present: DEFAULT_PRESENT,
  alwaysOnTop: false,
  launchAtLogin: false,
  keepAwake: false,
  closeToTray: false,
  globalHotkeys: true,
  lanShare: { enabled: false, port: 4781 },
};

export const DEFAULT_FOCUS_MINUTES = 25;
export const DEFAULT_BREAK_MINUTES = 5;

function seedTasks(now: number): Task[] {
  return [
    {
      id: 'task_layout',
      listId: 'list_today',
      title: 'Shape the present-mode layout',
      done: false,
      priority: 'high',
      isNow: true,
      isPrivate: false,
      createdAt: now - 50 * 60 * 1000,
    },
    {
      id: 'task_readme',
      listId: 'list_today',
      title: 'Write the README',
      done: false,
      priority: 'medium',
      isNow: false,
      isPrivate: false,
      createdAt: now - 40 * 60 * 1000,
    },
    {
      id: 'task_share',
      listId: 'list_today',
      title: 'Set up the LAN share view',
      done: false,
      priority: 'low',
      isNow: false,
      isPrivate: false,
      createdAt: now - 30 * 60 * 1000,
    },
    {
      id: 'task_coffee',
      listId: 'list_today',
      title: 'Buy better coffee',
      done: true,
      priority: 'low',
      isNow: false,
      isPrivate: false,
      createdAt: now - 20 * 60 * 1000,
      completedAt: now - 10 * 60 * 1000,
    },
    {
      id: 'task_review',
      listId: 'list_ideas',
      title: 'Try a weekly review ritual',
      done: false,
      priority: 'low',
      isNow: false,
      isPrivate: false,
      createdAt: now - 15 * 60 * 1000,
    },
  ];
}

function seedLists(now: number): TaskList[] {
  return [
    { id: 'list_today', name: 'Today', createdAt: now },
    { id: 'list_ideas', name: 'Ideas', createdAt: now },
  ];
}

function seedGoals(now: number): Goal[] {
  const target = toDateInputValue(addDays(now, 28));
  return [
    {
      id: 'goal_ship',
      title: 'Ship Now Board v1',
      description: 'A calm board I can leave on all day.',
      progress: 33,
      milestones: [
        { id: 'ms_design', title: 'Design system', done: true },
        { id: 'ms_present', title: 'Present mode', done: false },
        { id: 'ms_build', title: 'Portable build', done: false },
      ],
      targetDate: target,
      isPrivate: false,
      createdAt: now,
    },
    {
      id: 'goal_books',
      title: 'Read 12 books this year',
      description: 'Slow, deliberate reading over doomscrolling.',
      progress: 58,
      milestones: [],
      targetDate: `${new Date(now).getFullYear()}-12-31`,
      isPrivate: false,
      createdAt: now,
    },
  ];
}

export function createInitialState(now = Date.now()): BoardState {
  const current = DEFAULT_PRESETS[0];
  if (!current) throw new Error('Missing default preset');
  return {
    version: STATE_VERSION,
    current: {
      presetId: current.id,
      label: current.label,
      emoji: current.emoji,
      color: current.color,
      kind: current.kind,
      since: now,
      subline: 'Now Board',
      returnAt: null,
    },
    presets: DEFAULT_PRESETS.map((preset) => ({ ...preset })),
    sessions: [
      {
        id: 'session_initial',
        label: current.label,
        emoji: current.emoji,
        color: current.color,
        kind: current.kind,
        startedAt: now,
        endedAt: null,
      },
    ],
    tasks: seedTasks(now),
    lists: seedLists(now),
    activeListId: 'list_today',
    goals: seedGoals(now),
    notes: 'Keep the board quiet enough to leave on a wall.',
    notesPrivate: false,
    focus: {
      mode: 'focus',
      durationSec: DEFAULT_FOCUS_MINUTES * 60,
      remainingSec: DEFAULT_FOCUS_MINUTES * 60,
      running: false,
      startedAt: null,
      completedSessions: 0,
    },
    settings: structuredCloneSettings(DEFAULT_SETTINGS),
    meta: { createdAt: now, updatedAt: now },
  };
}

function structuredCloneSettings(settings: Settings): Settings {
  return {
    ...settings,
    present: { ...settings.present },
    lanShare: { ...settings.lanShare },
  };
}

export function accentForState(state: BoardState): string {
  if (state.settings.accent === 'status') return state.current.color;
  return ACCENT_PALETTES[state.settings.accent];
}
