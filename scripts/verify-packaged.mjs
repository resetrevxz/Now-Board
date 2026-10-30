import { _electron as electron } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const exe = path.resolve(process.env.NOW_BOARD_PACKAGE_OUT || 'release', 'Now Board-win32-x64/Now Board.exe');
const packageJson = JSON.parse(readFileSync(path.resolve('package.json'), 'utf8'));
const dataDir = mkdtempSync(path.join(tmpdir(), 'now-board-packaged-'));
const desktopDir = mkdtempSync(path.join(tmpdir(), 'now-board-desktop-'));
const failures = [];
let launched;

function check(condition, label) {
  if (condition) {
    console.log(`  ✓ ${label}`);
  } else {
    failures.push(label);
    console.log(`  ✗ ${label}`);
  }
}

if (!existsSync(exe)) {
  console.error('The portable app is missing. Run "npm run package" first.');
  process.exit(1);
}
mkdirSync('screenshots', { recursive: true });

try {
  launched = await electron.launch({
    executablePath: exe,
    args: ['--force-device-scale-factor=1'],
    env: {
      ...process.env,
      NOW_BOARD_DATA_DIR: dataDir,
      NOW_BOARD_DESKTOP_DIR: desktopDir,
      NODE_ENV: 'production',
    },
    timeout: 60_000,
  });
  const page = await launched.firstWindow({ timeout: 60_000 });
  await page.waitForSelector('.edit-shell', { timeout: 30_000 });
  console.log('title:', await page.title());
  const bridgeInfo = await page.evaluate(() => ({
    present: Boolean(window.nowboard),
    notify: typeof window.nowboard?.notify === 'function',
  }));
  console.log('bridge:', JSON.stringify(bridgeInfo));
  check(bridgeInfo.present, 'preload bridge is present');
  check(bridgeInfo.notify, 'native notification bridge is exposed');
  const versionTag = (await page.locator('.version-tag').innerText()).trim();
  check(
    versionTag.includes(packageJson.version),
    `packaged app displays v${packageJson.version}`,
  );

  await page.keyboard.press('n');
  await page.locator('.quick-add input').fill('Packaged smoke task');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(900);
  const saved = JSON.parse(readFileSync(path.join(dataDir, 'board.json'), 'utf8'));
  check(
    saved.tasks.some((task) => task.title === 'Packaged smoke task'),
    'packaged app saves a task locally',
  );
  check(saved.version === 5, 'packaged app writes state version 5');
  check(
    typeof saved.settings?.boardName === 'string' &&
      typeof saved.settings?.clockFormat === 'string' &&
      Number.isFinite(saved.settings?.focusTargetMin),
    'packaged app writes the 1.1 settings',
  );

  const shortcut = await page.evaluate(() => window.nowboard.createDesktopShortcut());
  const shortcutPath = path.join(desktopDir, 'Now Board.lnk');
  check(shortcut.ok, `desktop shortcut reports success${shortcut.error ? `: ${shortcut.error}` : ''}`);
  check(
    existsSync(shortcutPath) && statSync(shortcutPath).size > 0,
    'desktop shortcut file exists',
  );
  if (existsSync(shortcutPath)) {
    const details = execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `$s = (New-Object -ComObject WScript.Shell).CreateShortcut('${shortcutPath.replace(/'/g, "''")}'); "$($s.TargetPath)|$($s.WorkingDirectory)"`,
      ],
      { encoding: 'utf8' },
    ).trim();
    console.log('shortcut target:', details.replace(/^\uFEFF/, ''));
    check(
      details.replace(/^\uFEFF/, '').toLowerCase().includes(exe.toLowerCase()),
      'desktop shortcut points at the packaged executable',
    );
  }

  const globalShortcuts = await launched.evaluate(({ globalShortcut }) => ({
    present: globalShortcut.isRegistered('CommandOrControl+Shift+P'),
    panic: globalShortcut.isRegistered('CommandOrControl+Shift+B'),
    open: globalShortcut.isRegistered('CommandOrControl+Alt+O'),
    quickCapture: globalShortcut.isRegistered('CommandOrControl+Alt+N'),
  }));
  console.log('global shortcuts:', JSON.stringify(globalShortcuts));
  check(globalShortcuts.open, 'global Open shortcut is registered');
  check(globalShortcuts.quickCapture, 'global Quick capture shortcut is registered');

  await launched.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].setContentSize(1280, 800);
  });
  await page.waitForTimeout(400);
  await page.locator('body').screenshot({
    path: 'screenshots/packaged-1280x800.png',
    animations: 'disabled',
  });
  console.log('screenshot: screenshots/packaged-1280x800.png');

  await page.evaluate(() => window.nowboard.setCloseToTray(true));
  const trayBehavior = await launched.evaluate(async ({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    win.close();
    await new Promise((resolve) => setTimeout(resolve, 350));
    return {
      visible: win.isVisible(),
      destroyed: win.isDestroyed(),
      windows: BrowserWindow.getAllWindows().length,
    };
  });
  console.log('close-to-tray:', JSON.stringify(trayBehavior));
  check(
    trayBehavior.destroyed === false &&
      trayBehavior.visible === false &&
      trayBehavior.windows === 1,
    'close to tray hides instead of quitting',
  );

  if (trayBehavior.destroyed === false && trayBehavior.visible === false) {
    await launched.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      win.show();
      win.focus();
    });
    await page.waitForTimeout(350);
  }
  await page.evaluate(() => window.nowboard.setCloseToTray(false));

  console.log('data dir:', dataDir);
} finally {
  await launched?.close().catch(() => undefined);
  if (!process.argv.includes('--keep-data')) {
    rmSync(dataDir, { recursive: true, force: true });
    rmSync(desktopDir, { recursive: true, force: true });
  }
}

if (failures.length) {
  console.error(`\n${failures.length} packaged check(s) failed.`);
  process.exitCode = 1;
}
