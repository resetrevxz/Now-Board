# Decisions

This is the durable decision log for Now Board. It records the choices that are
expensive to reverse, not a diary of every edit. Dates are local work dates.

## D1 — Electron + React + TypeScript + Vite, hand-written CSS

**Status:** accepted — 2026-10-24

Electron gives the app the pieces a browser cannot provide reliably on Windows:
a frameless always-on-top window, global shortcuts, login-item control, power
save blocking, native save/open dialogs, and atomic file writes through the main
process. React and TypeScript keep the board's state transitions and present
view model explicit. Vite gives a fast renderer loop and a small production
bundle.

The main process and preload are intentionally plain CommonJS
(`electron/main.cjs`, `electron/preload.cjs`). Packaging then needs no second
TypeScript compile, and the security-sensitive IPC surface stays small and
readable. The renderer is the only TS build.

The design system is hand-written CSS with custom properties. A utility
framework would make the visual language harder to reason about and would add a
dependency for no product benefit.

## D2 — Two modes, one window

**Status:** accepted — 2026-10-24

Present mode is a full-bleed, read-only composition with no window chrome. Edit
mode is the control surface, with a frameless title bar and explicit window
controls. The same BrowserWindow switches between them; the global shortcut can
toggle from anywhere.

This keeps the second-monitor experience stable (no window reshuffling or
second process) while ensuring a viewer never sees editor controls. Present
mode has its own safe layout and privacy-filtered view model rather than hiding
small pieces of the editor.

## D3 — One versioned JSON document, atomic saves, daily backups

**Status:** accepted — 2026-10-24

Board state is a single versioned JSON document (`STATE_VERSION = 4`) in
Electron's `userData` directory. A database would be overkill for a personal
board and would make export/restore harder to reason about.

Writes go through a temporary file followed by a rename. Saves are debounced,
and a synchronous flush runs on window close. The first save of a new day copies
the previous board to `backups/board-YYYY-MM-DD.json`; only the 20 newest daily
backups are retained. Reset and restore archive the current file under
`archives/` before writing the replacement atomically. Archives are not pruned.

`normalizeBoard` is deliberately defensive at the boundary: it accepts raw JSON
strings (including a UTF-8 BOM), validates the basic board shape, rejects newer
schema versions, and clamps text, colors, dates, priorities, lists, settings,
and session data. Import failures leave the active board untouched.

Version 3 adds the custom board name, clock format, daily focus target, and
native-notification preference. Version 2 added the sleeping status kind and the
optional epoch-millisecond `returnAt` field. Older boards normalize missing
fields to safe defaults; unknown status kinds collapse to `focus`, while the
three known quiet kinds are preserved.

The renderer has a `localStorage` fallback for browser-only visual work and
tests. It is not the supported production store.

## D4 — Present mode gets a sanitized projection, not the board

**Status:** accepted — 2026-10-24

Present mode and LAN share render a `PresentViewModel` built by selectors. The
view model contains only the status, public tasks, public goals, a public note,
aggregates, timeline, streak, and clock-relevant settings. Private tasks, private
goals, and private notes are removed before the projection leaves the state
layer.

Privacy is per item: a private task can live beside public work, and private is
never inferred from “not currently visible.” The status **subline is public** by
design because it is part of the status itself; the UI and README warn against
putting sensitive text there.

Quiet statuses (`break`, `away`, `sleep`) are scrubbed in the selector, not by
hiding DOM. Goals, up-next tasks, the Now task, task stats, and the note are
emptied before the projection is built, so both Present and the LAN snapshot see
the same quiet model. The dedicated scene does not render the work timeline.
Private items remain filtered in focus statuses.

Panic is a separate full-screen overlay. It is instantaneous, covers both
Present and Edit, and leaves the underlying state untouched. It is not a privacy
filter and does not stop an already-running LAN share.

## D5 — LAN share is a separate, read-only server

**Status:** accepted — 2026-10-25

`electron/lan.cjs` serves only the built renderer and one sanitized snapshot.
The server:

- binds to the LAN on the configured port (default `4781`);
- redirects `/`, `/index.html`, and unknown routes to `/share`;
- returns `400` for malformed percent-encoding and `405` for non-read methods;
- serves the sanitized snapshot at `/api/state`;
- sends a strict CSP, `X-Frame-Options: DENY`, `nosniff`, `no-referrer`,
  `noindex`, and `no-store`;
- never serves source, editor routes, data files, or arbitrary paths.

The main process buffers the latest published snapshot so a renderer publish
that races server startup cannot be dropped. The snapshot is updated from
renderer state changes even while Sharing is off, and the server only starts
when enabled.

There is no authentication and no TLS. This is a deliberate trusted-LAN
feature, not an internet-facing service; the UI and README state the boundary.
Writes cannot change board state because the share server has no write routes.

## D6 — Keyboard-first, with one dedupe gate

**Status:** accepted — 2026-10-25

Local and global shortcuts both use `createHotkeyGate`, a 300 ms action-scoped
dedupe. Without it, a global shortcut can be delivered both by Electron and the
local key handler, causing a double toggle. The gate is action-scoped, so Panic
and Present remain independent.

Local shortcuts are `1`–`9` for status presets, `n` for quick add, `b` / `a` /
`s` for a 5-minute break, 30-minute away, and sleeping, `r` for a 25-minute
focus return, `f` and `Shift+F` for the focus timer, `Ctrl+K` for the command
palette, `Ctrl+,` for settings, and `Escape` for overlays. Global shortcuts are
`Ctrl+Shift+P` (Present), `Ctrl+Shift+B` (Panic), `Ctrl+Alt+O` (Open), and
`Ctrl+Alt+N` (Quick capture). `Ctrl+Shift+O` was the first choice for Open, but
it was already reserved on the development machine, so the default moved to
`Ctrl+Alt+O`. Registration failures are surfaced in Settings instead of silently
disabling the feature.

The tray mirrors the explicit actions: capture a task, pause or resume the
timer, and the same status quick modes. Single-key shortcuts are ignored while
typing, while a dialog is open, and in Present mode. All controls remain
reachable with Tab and the keyboard.

## D7 — Focus timer uses wall-clock anchors

**Status:** accepted — 2026-10-25

A running focus session stores `startedAt` and `remainingSec`; the display
derives the live remainder from the wall clock. This survives throttled timers
and window sleep better than decrementing a counter every second.

Pause folds elapsed time into `remainingSec`. Completion closes the session,
increments `completedSessions`, stops the timer, and is guarded against duplicate
completion from overlapping effects. Restarting after completion re-arms a full
duration. Changing between focus and break resets to that mode's duration.

## D8 — Themes, accents, and accessibility are token work

**Status:** accepted — 2026-10-25

Themes, accents, density, and text scale are CSS custom properties plus a small
number of root data attributes. This keeps every screen consistent and makes
the browser/Electron path identical. Accent can follow the current status color
or one of eight fixed palettes: Moss, Tide, Iris, Ember, Rose, Sun, Sea, and
Lime. The palette grid stays at five columns so the two rows remain visually
balanced in the settings drawer.

Muted text tokens were raised after contrast checks. On dark surfaces the
tertiary and quaternary text tokens meet WCAG AA against the tested backgrounds;
the light theme uses darker muted values because the same semantic level needs a
different color on a light surface. Disabled controls and purely decorative
rules are the only places allowed to fall below text contrast.

The app supports reduced motion both as a setting and through
`prefers-reduced-motion`; ambient orbs stop and transition durations collapse.
Text scale is applied to the Edit shell and Present typography separately so
changing it does not break Present composition.

## D9 — Present composition is content-height, then distributed

**Status:** accepted — 2026-10-25

Present panels use their content height with a safe maximum rather than
stretching to fill the viewport. The frame uses `justify-content: space-between`
and `.present-grid { flex: 0 1 auto; }` so spare height becomes intentional
space between the header, hero, work/goal grid, and footer. Stretching every card
to the bottom made sparse boards look like empty dashboards.

Present typography uses descender-safe line boxes and padding while retaining
ellipsis. Long task/goal titles are clamped, but descending letters are not
clipped. Layout is verified at 1920×1080, 1280×800, and 860×1000; the same
content-height rules keep 4K and narrow layouts from turning into empty slabs.

## D10 — Recovery must fail closed and preserve the working board

**Status:** accepted — 2026-10-25

Load errors show a deliberate error screen with the data path, available
backups, and a restore action. Corrupt files are archived, not silently
replaced. A failed reset/import/restore leaves the previous `board.json` in
place.

Reset is a two-step flow: archive the current file, then atomically write the
fresh board. The renderer switches to the fresh state only after the main
process reports success. Restore uses the same atomic write path instead of
copying over the live file; a crash mid-restore cannot truncate it.

Import validation happens twice: the main process parses the raw text it reads
from disk, and the renderer normalizes the result again. This handles the
Electron IPC boundary without trusting either layer blindly.

## D11 — Portable Windows build, no installer by default

**Status:** accepted — 2026-10-25

`@electron/packager` produces a self-contained Windows x64 directory under
`release/`. The icon is generated from code (PNG plus ICO) to avoid a binary
asset dependency and to keep the mark reproducible.

A native installer (NSIS/MSI) and signing were not added. They require a
signing identity, installer maintenance, and a larger release pipeline; the
portable folder is runnable now and can be zipped by the user. The tradeoff is a
larger folder, no Start-menu integration, no auto-update, and a SmartScreen
warning because the build is unsigned. The README states this plainly.

## D12 — Verification uses the real shell, not just a dev server

**Status:** accepted — 2026-10-25

The state layer is covered by Vitest: normalization/import, reducer semantics,
selectors/privacy, storage recovery, hotkey dedupe, and LAN routing. The visual
and integration checks use Playwright's Electron driver against the built
renderer, because layout and persistence bugs often only appear in the real
frameless window.

Screenshots are captured at device pixel ratio 1 with `body`-targeted element
captures. Full-viewport captures on this GPU setup can smear filtered layers;
the element capture is the reliable review image. Generated screenshots are
ignored by git. The variant run adds light theme, compact density, 130% scale,
command palette, reduce-motion, and fullscreen checks.

`scripts/verify-share.mjs` launches a real Electron instance, enables Sharing on
a test port, adds a private task, and verifies the HTTP routes, CSP, snapshot
shape, privacy filtering, and share DOM/screenshot. `scripts/verify-packaged.mjs`
launches the packaged `.exe`, verifies the preload bridge, adds a task, confirms
it reaches `board.json`, creates and inspects a desktop shortcut in a temporary
folder, checks the global Open registration, exercises close-to-tray, and
captures a screenshot. The screenshot variant run also checks the nine accent
choices, the Rose accent, and both focus timer keys.

## D13 — Scope boundaries

**Status:** accepted — 2026-10-25

Now Board is a personal single-user board. It does not sync, collaborate,
detect activity, read browser history, or call a cloud service. Present mode
does not auto-detect which monitor it is on; the window is simply made
fullscreen-friendly. Drag reordering is within the active list. The LAN view is
read-only and intentionally unauthenticated on a trusted network.

These are product decisions, not missing backend work. They keep the data model
small, the privacy story auditable, and the app dependable as furniture.

## D14 — Launch surfaces: tray, desktop shortcut, and global Open

**Status:** accepted — 2026-10-26

Now Board is a second-monitor app, but it also needs a reliable way back to the
window. Three surfaces cover different cases:

- The **desktop shortcut** starts a cold app. It is created from Settings
  through `shell.writeShortcutLink` in the main process, or from source with
  `npm run shortcut`. The source script uses PowerShell's `WScript.Shell`
  because Node has no portable shortcut API.
- The **tray icon** is present whenever the app is running. Its menu can open the
  board, toggle Present, show Panic, or quit. Tray creation is best-effort; if
  the icon cannot be created, the window is allowed to close normally.
- The global **Open** shortcut focuses a running app. It is not registered when
  global shortcuts are disabled.

**Close to tray** is opt-in and defaults off. A close button that silently leaves
an app running is surprising; the tray behavior is only enabled when the user
asks for it. When enabled, the close event is intercepted only if a tray icon
actually exists, so a failed tray cannot trap the app in a hidden state.

The packaged shortcut targets `process.execPath` and uses the executable's
embedded icon, avoiding a reference into `app.asar`. In development it targets
Electron with the app path as an argument. A shortcut points at the release
folder it was created from; moving the portable build requires recreating it.
There is still no installer, Start-menu registration, or auto-updater.

## D15 - 1.1 rhythm features stay explicit, local, and quiet

**Status:** accepted - 2026-10-29

The 1.1 additions make the board more useful without turning it into a scheduler
or a cloud service:

- **Clock format** is display-only. The system locale remains the default; 12h
  and 24h are explicit overrides. Parsing the locale parts once fixed a doubled
  colon that appeared in some system formats.
- **Daily focus goal** is an aggregate of today's session history, not a target
  that starts or stops anything. Zero means off; 30-minute increments up to eight
  hours are deliberate and easy to scan.
- **Return and wake times** are cues, never automation. Options adapt to the
  status kind, and a custom time rolls to tomorrow when the clock time has
  already passed. Sleeping labels say "wake" instead of "back".
- **Notifications** are created in the main process, remain local, and contain
  only generic timer/return copy. No task, goal, note, or subline text is sent to
  the operating system.
- **Quick capture and quick modes** are explicit human actions. The global
  shortcut brings the window forward and focuses quick add; the local
  `b`/`a`/`s`/`r` keys change status only while Edit is focused and no text field
  is active.
- **Board name** is presentation metadata, not a second profile. It appears in
  the title bar, Present header, share title, and tray tooltip while the data
  model stays a single board.
- **Quiet privacy** extends to the new daily target: break, away, and sleeping
  snapshots zero the daily target, timeline, and streak alongside emptying tasks,
  goals, stats, and notes.
