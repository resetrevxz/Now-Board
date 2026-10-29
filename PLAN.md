# Now Board — build plan

A calm, premium personal focus board for a second monitor. Present mode is the
screenshare face; edit mode is the fast, keyboard-first control surface.

## Product principles

1. **Calm by default.** One clear status, one focus, quiet surfaces, no noise.
2. **Readable at distance.** Present mode uses large type, high contrast and
   stable geometry that survives video compression.
3. **Fast to operate.** Status changes are one key away. Tasks and notes are
   inline. No settings rabbit holes for daily use.
4. **Private first.** Nothing sensitive is ever rendered in Present mode unless
   explicitly marked public. Panic is instant and global.
5. **Local and durable.** No account, no network dependency, no telemetry.
   Atomic saves, daily backups, import/export.

## Tech

- Electron (frameless window, local file persistence, global shortcuts, LAN view)
- React 19 + TypeScript + Vite
- Hand-written CSS design system (tokens, no utility framework)
- Vitest for the state/persistence layer
- Playwright for visual verification at 1080p / narrow sizes
- @electron/packager for a portable Windows build

## Milestones

- [x] **M0 — Foundation.** Plan, progress log, git, scaffold, bundled fonts,
      app shell, design tokens.
- [x] **M1 — Data layer.** Typed board state, reducer, selectors, validation,
      migration, local persistence, autosave, backups, tests.
- [x] **M2 — Edit mode.** Status + presets, tasks and lists, goals, notes,
      timeline, keyboard-first interactions, command palette.
- [x] **M3 — Present mode.** Stable responsive composition, live clock/timer,
      accent crossfades, focus and progress visuals.
- [x] **M4 — Privacy.** Per-item private flags, global panic screen, cursor
      hiding and no-leak checks.
- [x] **M5 — Themes & settings.** Light theme, eight accent palettes, background
      and motion controls, density, scaling, present section toggles, behavior.
- [x] **M6 — Polish.** Screenshot review at multiple sizes, a11y pass, empty /
      loading / error states, micro-interactions, reduce-motion.
- [x] **M7 — Extras.** Focus timer, streak, last-updated affordance, LAN
      read-only share view.
- [x] **M8 — Ship.** Portable Windows build, README, decision log, final
      verification and summary. A native installer was deliberately deferred;
      the released artifact is the portable folder.
- [x] **M9 - Launch & tray.** Desktop shortcut creator in Settings and
      `npm run shortcut`, tray menu, opt-in close-to-tray, global Open shortcut,
      and focus timer keys.
- [x] **M10 - 1.1 rhythm.** Clock format fix, daily focus target, custom board
      name, native timer/return notifications, sleep-aware custom wake times,
      global quick capture, tray capture/pause, and local quick modes.

## Verification gates (every milestone)

`npm run typecheck` · `npm run lint` · `npm test` · `npm run build` · screenshots
of both modes at 1920×1080, 1280×800 and 860×1000, reviewed critically.

## Final gate

- [x] `npm run verify` — typecheck, lint, 34 tests in 6 files, production build.
- [x] Playwright Electron screenshots at 1920×1080, 1280×800, 860×1000, and
      a 3840×2160 4K pass.
- [x] Variant checks — light theme, compact density, 130% text, nine accent
      choices, Rose accent application, focus timer keys, command palette,
      reduce motion, fullscreen, and restore-window behavior.
- [x] `npm run verify:share` — real LAN server, sanitized snapshot, private item
      filtering, redirects, 400/405 handling, CSP, and `/share` DOM.
- [x] `npm run package` + `npm run verify:packaged` — portable Windows launch,
      preload bridge, task save to `board.json`, desktop shortcut creation,
      global Open registration, close-to-tray, and packaged screenshot.
- [x] `npm run shortcut` — desktop shortcut created for the packaged release.

## 1.1 gate

- [x] `npm run verify` — typecheck, lint, 48 tests in 7 files, production build.
- [x] Screenshots at 1920x1080, 1280x800, and 860x1000, plus the 1.1 variant,
      return-menu, quiet-scene, and share checks.
- [x] Packaged 1.1 build, packaged smoke checks, desktop shortcut refresh, and
      commit.

## Non-goals

- Cloud sync, accounts, collaboration, mobile support.
- Auto-detecting activity. Status is always an explicit human choice.
- Reading unrelated files, browser history, or environment secrets at runtime.
