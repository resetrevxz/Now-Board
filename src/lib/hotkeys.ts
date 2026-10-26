export type AppHotkeyAction = 'toggle-present' | 'toggle-panic';

export function isAppHotkeyAction(value: string): value is AppHotkeyAction {
  return value === 'toggle-present' || value === 'toggle-panic';
}

/**
 * Electron can deliver a global shortcut and a focused-window keydown for the
 * same physical press. Accepting both would immediately toggle twice, so the
 * two sources share this small time-based gate.
 */
export function createHotkeyGate(windowMs = 300) {
  let lastAction: AppHotkeyAction | null = null;
  let lastAt = Number.NEGATIVE_INFINITY;

  return {
    accept(action: AppHotkeyAction, at = Date.now()): boolean {
      if (action === lastAction && at >= lastAt && at - lastAt < windowMs) {
        return false;
      }
      lastAction = action;
      lastAt = at;
      return true;
    },
    reset(): void {
      lastAction = null;
      lastAt = Number.NEGATIVE_INFINITY;
    },
  };
}
