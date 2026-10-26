export const SECOND = 1000;
export const MINUTE = 60 * SECOND;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

const pad = (value: number) => String(value).padStart(2, '0');

export function startOfDay(ts: number): number {
  const date = new Date(ts);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export function addDays(ts: number, days: number): number {
  const date = new Date(ts);
  date.setDate(date.getDate() + days);
  return date.getTime();
}

export function localDateKey(ts: number): string {
  const date = new Date(ts);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function toDateInputValue(ts: number): string {
  return localDateKey(ts);
}

export function formatClock(ts: number, withSeconds = false): string {
  const date = new Date(ts);
  return withSeconds
    ? `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
    : `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function clockParts(ts: number): { time: string; period: string } {
  const parts = new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).formatToParts(new Date(ts));
  let time = '';
  let period = '';
  for (const part of parts) {
    if (part.type === 'hour' || part.type === 'minute' || part.type === 'literal') {
      if (part.type === 'literal' && part.value === ':') time += part.value;
      else if (part.type !== 'literal') time = time.length === 0 ? part.value : `${time}:${part.value}`;
    }
    if (part.type === 'dayPeriod') period = part.value;
  }
  return { time: time || formatClock(ts), period };
}

export function formatDate(ts: number): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(new Date(ts));
}

export function formatDateLong(ts: number): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(new Date(ts));
}

export function formatTargetDate(value: string, now = Date.now()): string {
  const [yearRaw, monthRaw, dayRaw] = value.split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  if (!year || !month || !day) return value;
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);
  const includeYear = date.getFullYear() !== new Date(now).getFullYear();
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    ...(includeYear ? { year: 'numeric' } : {}),
  }).format(date);
}

export function formatDuration(ms: number): string {
  const safe = Math.max(0, ms);
  const totalMinutes = Math.floor(safe / MINUTE);
  if (totalMinutes < 1) return '<1m';
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

export function formatTimer(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / SECOND));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  return `${minutes}:${pad(seconds)}`;
}

export function formatFocusClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${pad(minutes)}:${pad(seconds)}`;
}

export function relativeTime(ts: number, now = Date.now()): string {
  const diff = Math.max(0, now - ts);
  if (diff < 4000) return 'just now';
  if (diff < MINUTE) return `${Math.floor(diff / SECOND)}s ago`;
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m ago`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h ago`;
  return `${Math.floor(diff / DAY)}d ago`;
}

export function msUntilNextMinute(now = Date.now()): number {
  return MINUTE - (now % MINUTE) + 20;
}

export function daysBetween(a: number, b: number): number {
  const startA = startOfDay(a);
  const startB = startOfDay(b);
  return Math.round((startB - startA) / DAY);
}
