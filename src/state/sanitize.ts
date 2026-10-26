export function clampText(value: unknown, max: number, fallback = ''): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

export function cleanLine(value: unknown, max: number, fallback = ''): string {
  if (typeof value !== 'string') return fallback;
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) return fallback;
  return normalized.length > max ? normalized.slice(0, max) : normalized;
}

export function clampNotes(value: unknown, max = 4000): string {
  if (typeof value !== 'string') return '';
  return value.slice(0, max);
}

export function clampNumber(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
}

export function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

export function oneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}
