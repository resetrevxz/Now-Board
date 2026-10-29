import { describe, expect, it } from 'vitest';
import { createHotkeyGate, isAppHotkeyAction } from './hotkeys';

describe('createHotkeyGate', () => {
  it('drops the duplicate delivery from the other shortcut source', () => {
    const gate = createHotkeyGate(300);

    expect(gate.accept('toggle-present', 1000)).toBe(true);
    expect(gate.accept('toggle-present', 1004)).toBe(false);
    expect(gate.accept('toggle-present', 1301)).toBe(true);
  });

  it('does not block a different action or a deliberate later press', () => {
    const gate = createHotkeyGate(300);

    expect(gate.accept('toggle-present', 1000)).toBe(true);
    expect(gate.accept('toggle-panic', 1005)).toBe(true);
    expect(gate.accept('toggle-panic', 1500)).toBe(true);
  });

  it('resets cleanly', () => {
    const gate = createHotkeyGate(300);

    expect(gate.accept('toggle-panic', 1000)).toBe(true);
    gate.reset();
    expect(gate.accept('toggle-panic', 1001)).toBe(true);
  });

  it('recognises only the app hotkey actions', () => {
    expect(isAppHotkeyAction('toggle-present')).toBe(true);
    expect(isAppHotkeyAction('toggle-panic')).toBe(true);
    expect(isAppHotkeyAction('quick-add')).toBe(true);
    expect(isAppHotkeyAction('timer-toggle')).toBe(true);
    expect(isAppHotkeyAction('mode-break')).toBe(true);
    expect(isAppHotkeyAction('mode-away')).toBe(true);
    expect(isAppHotkeyAction('mode-sleep')).toBe(true);
    expect(isAppHotkeyAction('toggle-settings')).toBe(false);
    expect(isAppHotkeyAction('')).toBe(false);
  });
});
