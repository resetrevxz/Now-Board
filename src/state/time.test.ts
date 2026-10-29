import { describe, expect, it } from 'vitest';
import {
  clockParts,
  formatClockLabel,
  nextTimeTarget,
  toTimeInputValue,
} from './time';

const AFTERNOON = new Date(2026, 0, 1, 13, 5, 0).getTime();

describe('clock formatting', () => {
  it.each(['system', '12h', '24h'] as const)(
    'never renders a doubled colon in %s format',
    (format) => {
      const parts = clockParts(AFTERNOON, format);
      expect(parts.time).not.toContain('::');
      expect(formatClockLabel(AFTERNOON, format)).not.toContain('::');
    },
  );

  it('honours the forced twelve and twenty-four hour formats', () => {
    const twelve = clockParts(AFTERNOON, '12h');
    const twentyFour = clockParts(AFTERNOON, '24h');

    expect(twelve.time).toMatch(/^1:05$/);
    expect(twelve.period.length).toBeGreaterThan(0);
    expect(twentyFour.time).toBe('13:05');
    expect(twentyFour.period).toBe('');
  });

  it('formats a time input value with leading zeroes', () => {
    expect(toTimeInputValue(AFTERNOON)).toBe('13:05');
  });
});

describe('nextTimeTarget', () => {
  it('uses today when the time is still ahead', () => {
    const now = new Date(2026, 0, 1, 9, 30, 0).getTime();
    const target = nextTimeTarget('10:00', now);
    expect(target).not.toBeNull();
    const date = new Date(target as number);
    expect(date.getDate()).toBe(1);
    expect(date.getHours()).toBe(10);
    expect(date.getMinutes()).toBe(0);
  });

  it('rolls to tomorrow when the time has passed', () => {
    const now = new Date(2026, 0, 1, 9, 30, 0).getTime();
    const target = nextTimeTarget('09:00', now);
    expect(target).not.toBeNull();
    const date = new Date(target as number);
    expect(date.getDate()).toBe(2);
    expect(date.getHours()).toBe(9);
  });

  it('rejects malformed times', () => {
    const now = Date.now();
    expect(nextTimeTarget('', now)).toBeNull();
    expect(nextTimeTarget('25:00', now)).toBeNull();
    expect(nextTimeTarget('09:99', now)).toBeNull();
    expect(nextTimeTarget('soon', now)).toBeNull();
  });
});
