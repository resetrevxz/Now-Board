/**
 * Capture the real Electron app at review sizes.
 *
 * Usage: npm run screenshots [-- --size=1920x1080] [-- --variants] [-- --keep]
 * Screenshots land in ./screenshots. A fresh temporary board is seeded.
 * --variants adds light theme, compact density, 130% text scale, palette and
 * runtime checks for reduce motion and fullscreen.
 */
import { _electron as electron } from 'playwright-core';
import { existsSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'screenshots');
const keep = process.argv.includes('--keep');
const variants = process.argv.includes('--variants');
const sizeArg = process.argv.find((arg) => arg.startsWith('--size='));
const sizes = sizeArg
  ? [sizeArg.slice('--size='.length)]
  : ['1920x1080', '1280x800', '860x1000'];

mkdirSync(outDir, { recursive: true });
const dataDir = mkdtempSync(path.join(tmpdir(), 'now-board-shots-'));
const desktopDir = mkdtempSync(path.join(tmpdir(), 'now-board-desktop-shots-'));
const errors = [];

function parseSize(value) {
  const match = /^(\d+)x(\d+)$/.exec(value);
  if (!match) throw new Error(`Bad --size=${value}; expected 1920x1080`);
  return { width: Number(match[1]), height: Number(match[2]) };
}

async function resize(app, page, width, height) {
  await app.evaluate(
    ({ BrowserWindow }, size) => {
      const target = BrowserWindow.getAllWindows()[0];
      target.setContentSize(size.width, size.height);
    },
    { width, height },
  );
  await page.waitForTimeout(320);
}

async function shot(page, name) {
  await page.waitForTimeout(500);
  const file = path.join(outDir, `${name}.png`);
  // Element capture avoids a Chromium tiling artifact that smears filtered
  // layers in full-viewport captures. Body includes portals and overlays.
  await page.locator('body').screenshot({ path: file, animations: 'disabled' });
  console.log(`  ✓ ${path.relative(root, file)}`);
}

function check(condition, label) {
  if (condition) {
    console.log(`  ✓ check: ${label}`);
  } else {
    errors.push(`check failed: ${label}`);
    console.log(`  ✗ check: ${label}`);
  }
}

async function openSettings(page) {
  await page.keyboard.press('Control+,');
  await page.waitForSelector('[role="dialog"]', { timeout: 10_000 });
  await page.waitForTimeout(200);
}

async function closeOverlay(page) {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
}

async function setQuickReturn(page, minutes) {
  await page.getByRole('button', { name: 'Add return time' }).click();
  await page
    .getByRole('dialog', { name: 'Return time' })
    .getByRole('button', { name: new RegExp(`^${minutes}m`) })
    .click();
  await page.waitForTimeout(250);
}

async function choose(page, group, name) {
  await page
    .getByRole('group', { name: group })
    .getByRole('button', { name })
    .click();
  await page.waitForTimeout(200);
}

async function setTextScale(page, value) {
  const slider = page.getByRole('slider', { name: 'Text scale' });
  await slider.evaluate((element, next) => {
    element.value = String(next);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
  await page.waitForTimeout(250);
}

async function openPresent(page) {
  await page.locator('.titlebar__actions .btn--accent').click();
  await page.waitForSelector('.present', { timeout: 10_000 });
  await page.waitForTimeout(250);
}

async function closePresent(page) {
  await page.keyboard.press('Escape');
  await page.waitForSelector('.edit-shell', { timeout: 10_000 });
  await page.waitForTimeout(250);
}

const launched = await electron.launch({
  args: ['.', '--force-device-scale-factor=1'],
  cwd: root,
  env: {
    ...process.env,
    NOW_BOARD_DATA_DIR: dataDir,
    NOW_BOARD_DESKTOP_DIR: desktopDir,
    NODE_ENV: 'production',
  },
  timeout: 30_000,
});

try {
  const page = await launched.firstWindow();
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });

  await page.waitForSelector('.edit-shell', { timeout: 20_000 });
  await page.evaluate(() => document.fonts.ready);
  // Full-page screenshots can smear layers that use backdrop-filter. The
  // scrim blur is purely decorative, so drop it for stable captures.
  await page.addStyleTag({ content: '.scrim { backdrop-filter: none !important; }' });

  for (const size of sizes) {
    const { width, height } = parseSize(size);
    const tag = `${width}x${height}`;
    await resize(launched, page, width, height);

    await page.keyboard.press('Escape');
    await shot(page, `edit-${tag}`);

    await page.locator('.titlebar__actions .btn--accent').click();
    await page.waitForSelector('.present', { timeout: 10_000 });
    await shot(page, `present-${tag}`);

    await closePresent(page);
    await page.keyboard.press('6');
    await page.waitForTimeout(250);
    await setQuickReturn(page, 15);
    await openPresent(page);
    await shot(page, `present-break-${tag}`);
    if (variants) {
      const breakText = await page.locator('.present').innerText();
      const breakWork = await page
        .locator('.present-goal, .present-tasks, .present-note, .present-timeline')
        .count();
      check(breakWork === 0, 'break scene hides objectives and work');
      check(!breakText.includes('Ship Now Board v1'), 'break scene hides the seeded goal');
      check(breakText.includes('Back at'), 'break scene shows the return time');
    }
    await closePresent(page);

    await page.keyboard.press('7');
    await page.waitForTimeout(250);
    await setQuickReturn(page, 30);
    await openPresent(page);
    await shot(page, `present-away-${tag}`);
    if (variants) {
      const awayWork = await page
        .locator('.present-goal, .present-tasks, .present-note, .present-timeline')
        .count();
      check(awayWork === 0, 'away scene hides objectives and work');
    }
    await closePresent(page);

    await page.keyboard.press('8');
    await page.waitForTimeout(250);
    await openPresent(page);
    await shot(page, `present-sleep-${tag}`);
    if (variants) {
      const sleepText = await page.locator('.present').innerText();
      check(
        (await page.locator('.present--sleep').count()) === 1,
        'sleeping uses the dedicated quiet scene',
      );
      check(!sleepText.includes('Ship Now Board v1'), 'sleep scene hides the seeded goal');
      check(
        (await page
          .locator('.present-goal, .present-tasks, .present-note, .present-timeline')
          .count()) === 0,
        'sleep scene hides objectives and work',
      );
    }
    await closePresent(page);

    await page.keyboard.press('1');
    await page.waitForTimeout(250);
    await shot(page, `edit-return-${tag}`);

    await page.keyboard.press('Control+Shift+B');
    await page.waitForSelector('.panic', { timeout: 10_000 });
    await shot(page, `panic-${tag}`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);

    await page.keyboard.press('Control+,');
    await page.waitForSelector('[role="dialog"]', { timeout: 10_000 });
    await shot(page, `settings-${tag}`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
  }

  if (variants) {
    await resize(launched, page, 1280, 800);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);

    await page.keyboard.press('f');
    await page.waitForTimeout(200);
    check(
      (await page.getByRole('button', { name: 'Pause focus timer' }).count()) === 1,
      'F starts the focus timer',
    );
    await page.keyboard.press('Shift+F');
    await page.waitForTimeout(200);
    check(
      (await page.getByRole('button', { name: 'Start focus timer' }).count()) === 1,
      'Shift+F resets the focus timer',
    );

    await page.keyboard.press('b');
    await page.waitForTimeout(250);
    check(
      (await page.locator('.status-title').innerText()) === 'On a break',
      'B enters a quick break without leaving Edit',
    );
    await page.keyboard.press('r');
    await page.waitForTimeout(250);
    check(
      (await page.locator('.status-title').innerText()) === 'Developing',
      'R returns to focus from a break',
    );
    check(
      (await page.getByRole('button', { name: 'Pause focus timer' }).count()) === 1,
      'R starts a focus session',
    );
    await page.keyboard.press('Shift+F');
    await page.waitForTimeout(200);

    await openSettings(page);
    const accentCount = await page
      .getByRole('group', { name: 'Accent color' })
      .getByRole('button')
      .count();
    check(accentCount === 9, 'nine accent choices are available');
    await choose(page, 'Accent color', 'Rose');
    const accent = await page.evaluate(() =>
      document.documentElement.style.getPropertyValue('--accent').trim().toLowerCase(),
    );
    check(accent === '#ff9fb2', 'the new Rose accent applies');
    await choose(page, 'Accent color', 'Status');
    await choose(page, 'Theme', 'Light');
    await shot(page, 'settings-light-1280x800');
    await closeOverlay(page);
    await shot(page, 'edit-light-1280x800');
    await openPresent(page);
    await shot(page, 'present-light-1280x800');
    await closePresent(page);

    await openSettings(page);
    await choose(page, 'Theme', 'Dark');
    await choose(page, 'Density', 'Compact');
    await closeOverlay(page);
    await shot(page, 'edit-compact-1280x800');
    await openPresent(page);
    await shot(page, 'present-compact-1280x800');
    await closePresent(page);

    await openSettings(page);
    await choose(page, 'Density', 'Comfortable');
    await setTextScale(page, 130);
    await shot(page, 'settings-scale130-1280x800');
    await closeOverlay(page);
    await shot(page, 'edit-scale130-1280x800');
    await openPresent(page);
    await shot(page, 'present-scale130-1280x800');
    await closePresent(page);

    await openSettings(page);
    await setTextScale(page, 100);
    await closeOverlay(page);

    await page.getByRole('button', { name: 'Add return time' }).click();
    await shot(page, 'return-menu-1280x800');
    await closeOverlay(page);

    await page.keyboard.press('Control+k');
    await page.waitForSelector('.palette', { timeout: 10_000 });
    await shot(page, 'palette-1280x800');
    await closeOverlay(page);

    await openSettings(page);
    await page.getByRole('switch', { name: 'Reduce motion' }).click();
    await closeOverlay(page);
    const reduced = await page.evaluate(() => {
      const orb = document.querySelector('.ambient__orb--a');
      return {
        flag: document.documentElement.dataset.reduceMotion,
        animation: orb ? getComputedStyle(orb).animationName : null,
      };
    });
    check(
      reduced.flag === 'true' && reduced.animation === 'none',
      'reduce motion stills ambient movement',
    );
    await openPresent(page);
    const reducedPresent = await page.evaluate(
      () => document.documentElement.dataset.reduceMotion,
    );
    check(reducedPresent === 'true', 'reduce motion survives Present mode');
    await closePresent(page);

    await openSettings(page);
    await page.getByRole('switch', { name: 'Go fullscreen' }).click();
    await closeOverlay(page);
    await openPresent(page);
    await page.waitForTimeout(900);
    const fullscreenOn = await launched.evaluate(
      ({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFullScreen(),
    );
    check(fullscreenOn, 'Present can take the display fullscreen');
    await closePresent(page);
    await page.waitForTimeout(700);
    const fullscreenOff = await launched.evaluate(
      ({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFullScreen(),
    );
    check(!fullscreenOff, 'leaving Present restores the window');

    await openSettings(page);
    await page
      .locator('.settings-row')
      .filter({ hasText: 'Desktop shortcut' })
      .getByRole('button', { name: 'Create', exact: true })
      .click();
    await page.waitForTimeout(500);
    check(
      existsSync(path.join(desktopDir, 'Now Board.lnk')),
      'Settings creates a desktop shortcut',
    );
    await closeOverlay(page);
  }

  if (errors.length) {
    console.error('\nRenderer errors:');
    for (const error of errors) console.error(`  ! ${error}`);
    process.exitCode = 1;
  }
} finally {
  await launched.close().catch(() => undefined);
  if (!keep) {
    rmSync(dataDir, { recursive: true, force: true });
    rmSync(desktopDir, { recursive: true, force: true });
  }
}
