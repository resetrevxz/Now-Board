# Progress log

## 2026-10-24 — Foundation

- Initialised the repository and worked from `PLAN.md`.
- Environment: Windows 11, Node 24.20, npm 11.19, git 2.55. Playwright and the
  Electron cache were already available locally.
- Chose Electron + React 19 + TypeScript + Vite with hand-written CSS tokens.
  Main/preload stay plain CommonJS so packaging needs no second TypeScript build.
- Added bundled Inter and Instrument Serif fonts, the app shell, design tokens,
  and the frameless window.

## 2026-10-25 — Board, privacy, and first ship

- Built the typed state layer: defensive normalization, reducer, privacy-aware
  selectors, atomic persistence, daily backups, archives, import/export, reset,
  and restore.
- Built Edit mode: status presets, custom status, tasks/lists/Now/priorities,
  goals/milestones, notes, history timeline, command palette, and keyboard
  interactions.
- Built Present mode as a separate read-only projection with content-height
  panels, large typography, focus timer, clock, stats, goals, and a note.
- Added per-item privacy, the global Panic screen, and a LAN share server that
  serves only a sanitized snapshot and the built Present view.
- Hardened navigation, import boundaries, share routing/CSP, atomic reset and
  restore, hotkey deduplication, focus completion, contrast, and title clipping.
- Added 33 tests and the first Playwright screenshot and packaged-app checks.
- Produced the first portable Windows build and wrote the README, decisions, and
  release notes.

## 2026-10-26 — Colors, launch surfaces, and final gate

- Expanded the fixed accent palettes from four to eight: Moss, Tide, Iris,
  Ember, Rose, Sun, Sea, and Lime, plus the status-derived accent (nine choices
  in Settings). Reworked the settings swatch grid to keep the two rows balanced.
- Added a tray icon while the app is running. The tray menu can open the board,
  toggle Present, show Panic, or quit.
- Added opt-in **Close to tray**. It only hides the window when a tray icon
  exists; a failed tray creation falls back to normal close/quit behavior.
- Added a global **Open** shortcut. `Ctrl+Shift+O` was already reserved on this
  machine, so the default became `Ctrl+Alt+O`; registration failures remain
  visible in Settings.
- Added desktop shortcut creation from **Settings → Behavior** and from
  `npm run shortcut`. The shortcut targets the packaged executable, uses its
  embedded icon, and is tested in a temporary desktop folder before the real one
  is created.
- Added local focus timer shortcuts: `f` start/pause and `Shift+F` reset.
- Corrected documentation for backup rotation (newest 20), the portable build,
  and the new launch surfaces.
- Added automated checks for all nine accent choices, the Rose accent, both
  focus keys, desktop shortcut creation, global Open registration, and
  close-to-tray.

## Final verification — 2026-10-26

- `npm run verify` — typecheck, lint, **34 tests in 6 files**, production build.
- `npm run screenshots` — Edit, Present, return, Panic, and Settings at
  1920×1080, 1280×800, and 860×1000.
- `node scripts/screenshots.mjs --size=3840x2160` — 4K pass, all views.
- `npm run screenshots:variants` — light theme, compact density, 130% text,
  command palette, nine accents, Rose application, focus keys, reduce motion,
  fullscreen on/off, restore-window, and Settings shortcut creation: all passed.
- `npm run verify:share` — real LAN server on port 4797; snapshot shape, privacy
  filtering, redirects, 400/405, writes rejected, strict CSP, `/share` DOM, and
  a share screenshot: all passed.
- `npm run package` — portable x64 build at
  `release\Now Board-win32-x64`, 366 MB, unsigned.
- `npm run verify:packaged` — packaged launch, preload bridge, local save,
  desktop shortcut file/target, global Open registration, close-to-tray, and a
  packaged screenshot: all passed.
- `npm run shortcut` — created
  `C:\Users\reset\OneDrive\Desktop\Now Board.lnk`, verified to target the
  packaged executable with the correct working directory.

## Current state

- The final portable app includes the expanded palettes, tray menu, close-to-tray,
  desktop shortcut, global Open, and focus keys.
- The installer remains deliberately out of scope: the artifact is an unsigned
  portable folder, and the desktop shortcut points at its current location.
- No unresolved blockers.
