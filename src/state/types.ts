export const STATE_VERSION = 4;

export type ThemeMode = 'dark' | 'light';
export type ClockFormat = 'system' | '12h' | '24h';
export type AccentMode =
  | 'status'
  | 'moss'
  | 'tide'
  | 'iris'
  | 'ember'
  | 'rose'
  | 'sun'
  | 'sea'
  | 'lime';
export type BackgroundStyle = 'gradient' | 'solid';
export type Density = 'comfortable' | 'compact';
export type Priority = 'low' | 'medium' | 'high';
export type StatusKind = 'focus' | 'break' | 'away' | 'sleep';
export type FocusMode = 'focus' | 'break';

export interface StatusPreset {
  id: string;
  label: string;
  emoji: string;
  color: string;
  kind: StatusKind;
}

export interface CurrentStatus {
  presetId: string | null;
  label: string;
  emoji: string;
  color: string;
  kind: StatusKind;
  since: number;
  subline: string;
  returnAt: number | null;
}

export interface Session {
  id: string;
  label: string;
  emoji: string;
  color: string;
  kind: StatusKind;
  startedAt: number;
  endedAt: number | null;
}

export interface Task {
  id: string;
  listId: string;
  title: string;
  done: boolean;
  priority: Priority;
  isNow: boolean;
  isPrivate: boolean;
  createdAt: number;
  completedAt?: number;
}

export interface TaskList {
  id: string;
  name: string;
  createdAt: number;
}

export interface Milestone {
  id: string;
  title: string;
  done: boolean;
}

export interface Goal {
  id: string;
  title: string;
  description: string;
  progress: number;
  milestones: Milestone[];
  targetDate?: string;
  isPrivate: boolean;
  createdAt: number;
}

export interface PresentSettings {
  showGoals: boolean;
  showTasks: boolean;
  showNotes: boolean;
  showTimeline: boolean;
  showNow: boolean;
  showStats: boolean;
  showFocus: boolean;
  showStreak: boolean;
  showClock: boolean;
  hideCursor: boolean;
  fullscreen: boolean;
}

export interface LanShareSettings {
  enabled: boolean;
  port: number;
}

export interface Settings {
  theme: ThemeMode;
  accent: AccentMode;
  background: BackgroundStyle;
  ambientMotion: boolean;
  reduceMotion: boolean;
  fontScale: number;
  density: Density;
  boardName: string;
  clockFormat: ClockFormat;
  focusTargetMin: number;
  notifyOnTimer: boolean;
  present: PresentSettings;
  alwaysOnTop: boolean;
  launchAtLogin: boolean;
  keepAwake: boolean;
  closeToTray: boolean;
  globalHotkeys: boolean;
  lanShare: LanShareSettings;
}

export interface FocusState {
  mode: FocusMode;
  durationSec: number;
  remainingSec: number;
  running: boolean;
  startedAt: number | null;
  completedSessions: number;
}

export interface BoardMeta {
  createdAt: number;
  updatedAt: number;
}

export interface BoardState {
  version: number;
  current: CurrentStatus;
  presets: StatusPreset[];
  sessions: Session[];
  tasks: Task[];
  lists: TaskList[];
  activeListId: string;
  goals: Goal[];
  notes: string;
  notesPrivate: boolean;
  focus: FocusState;
  settings: Settings;
  meta: BoardMeta;
}

export type SettingsPatch = {
  [K in keyof Settings]?: Settings[K] extends object
    ? Partial<Settings[K]>
    : Settings[K];
};

export type TaskPatch = Partial<
  Pick<Task, 'title' | 'priority' | 'isPrivate' | 'listId'>
>;

export type GoalPatch = Partial<
  Pick<Goal, 'title' | 'description' | 'progress' | 'targetDate' | 'isPrivate'>
>;

export interface TimelineSegment {
  id: string;
  label: string;
  emoji: string;
  color: string;
  kind: StatusKind;
  start: number;
  end: number;
  durationMs: number;
}

export interface TimelineTotal {
  label: string;
  emoji: string;
  color: string;
  kind: StatusKind;
  durationMs: number;
}

export interface TimelineModel {
  segments: TimelineSegment[];
  totals: TimelineTotal[];
  totalTrackedMs: number;
  focusMs: number;
}

export interface PresentTask {
  id: string;
  title: string;
  priority: Priority;
  listName: string;
}

export interface PresentGoal {
  id: string;
  title: string;
  description: string;
  progress: number;
  targetDate?: string;
  completedMilestones: number;
  totalMilestones: number;
}

export interface PresentViewModel {
  generatedAt: number;
  status: {
    label: string;
    emoji: string;
    color: string;
    since: number;
    subline: string;
    kind: StatusKind;
    returnAt: number | null;
  };
  nowTask: PresentTask | null;
  upNext: PresentTask[];
  taskStats: { done: number; total: number };
  goals: PresentGoal[];
  note: string | null;
  timeline: TimelineModel;
  streakDays: number;
  focus: {
    running: boolean;
    mode: FocusMode;
    remainingSec: number;
    durationSec: number;
    startedAt: number | null;
  };
  settings: {
    theme: ThemeMode;
    accent: AccentMode;
    accentColor: string;
    background: BackgroundStyle;
    ambientMotion: boolean;
    reduceMotion: boolean;
    density: Density;
    boardName: string;
    clockFormat: ClockFormat;
    focusTargetMin: number;
    showGoals: boolean;
    showTasks: boolean;
    showNotes: boolean;
    showTimeline: boolean;
    showNow: boolean;
    showStats: boolean;
    showFocus: boolean;
    showStreak: boolean;
    showClock: boolean;
    hideCursor: boolean;
  };
}

export type Action =
  | { type: 'data/replace'; state: BoardState }
  | {
      type: 'status/set';
      preset: StatusPreset;
      subline?: string;
      returnInMinutes?: number | null;
      at?: number;
    }
  | {
      type: 'status/custom';
      label: string;
      emoji: string;
      color: string;
      kind: StatusKind;
      subline?: string;
      returnInMinutes?: number | null;
      at?: number;
    }
  | { type: 'status/subline'; subline: string }
  | { type: 'status/returnIn'; minutes: number | null; at?: number }
  | { type: 'status/resetTimer'; at?: number }
  | {
      type: 'task/add';
      title: string;
      listId?: string;
      priority?: Priority;
      isNow?: boolean;
      id?: string;
      at?: number;
    }
  | { type: 'task/toggle'; id: string; at?: number }
  | { type: 'task/update'; id: string; patch: TaskPatch }
  | { type: 'task/delete'; id: string }
  | { type: 'task/setNow'; id: string; isNow: boolean }
  | { type: 'task/reorder'; listId: string; taskId: string; beforeId: string | null }
  | { type: 'task/move'; id: string; direction: -1 | 1 }
  | { type: 'task/clearCompleted'; listId?: string }
  | { type: 'list/add'; name: string; id?: string; at?: number }
  | { type: 'list/rename'; id: string; name: string }
  | { type: 'list/delete'; id: string }
  | { type: 'list/activate'; id: string }
  | {
      type: 'goal/add';
      goal?: Partial<Omit<Goal, 'id' | 'createdAt'>>;
      id?: string;
      at?: number;
    }
  | { type: 'goal/update'; id: string; patch: GoalPatch }
  | { type: 'goal/milestones'; goalId: string; milestones: Milestone[] }
  | { type: 'goal/delete'; id: string }
  | { type: 'goal/toggleMilestone'; goalId: string; milestoneId: string }
  | { type: 'goal/addMilestone'; goalId: string; title: string; id?: string }
  | { type: 'goal/removeMilestone'; goalId: string; milestoneId: string }
  | { type: 'notes/set'; text: string }
  | { type: 'notes/privacy'; isPrivate: boolean }
  | { type: 'settings/update'; patch: SettingsPatch }
  | { type: 'focus/start'; durationSec?: number; mode?: FocusMode; at?: number }
  | { type: 'focus/pause'; at?: number }
  | { type: 'focus/reset'; durationSec?: number; mode?: FocusMode }
  | { type: 'focus/complete'; at?: number };
