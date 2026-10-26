import { _electron as electron } from 'playwright-core';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = path.resolve('.');
const dataDir = mkdtempSync(path.join(tmpdir(), 'now-board-share-'));
const port = 4797;
let launched;
let shareWindow;
const failures = [];
const check = (condition, message) => {
  if (!condition) failures.push(message);
  console.log(`${condition ? '  ✓' : '  ✗'} ${message}`);
};

try {
  launched = await electron.launch({
    args: ['.', '--force-device-scale-factor=1'],
    cwd: root,
    env: { ...process.env, NOW_BOARD_DATA_DIR: dataDir, NODE_ENV: 'production' },
    timeout: 30_000,
  });
  const page = await launched.firstWindow();
  page.on('pageerror', (error) => failures.push(`main pageerror: ${error.message}`));
  await page.waitForSelector('.edit-shell', { timeout: 20_000 });
  await page.evaluate(() => document.fonts.ready);

  // Add a task that must never appear in the public snapshot.
  await page.keyboard.press('n');
  await page.locator('.quick-add input').fill('Secret board task');
  await page.keyboard.press('Enter');
  const secretRow = page.locator('.task-row').filter({ hasText: 'Secret board task' });
  await secretRow.waitFor({ timeout: 5000 });
  await secretRow.hover();
  await secretRow.getByRole('button', { name: 'Hide from Present mode' }).click();
  await page.waitForTimeout(300);

  // Enable the read-only share on a quiet port.
  await page.keyboard.press('Control+,');
  await page.waitForSelector('[role="dialog"]', { timeout: 10_000 });
  const portInput = page.getByRole('textbox', { name: 'Share server port' });
  await portInput.fill(String(port));
  await page.getByRole('button', { name: 'Apply' }).click();
  await page.getByRole('switch', { name: 'Enable local share' }).click();
  await page.waitForFunction(
    () => document.querySelector('.share-status')?.textContent?.includes('Serving on port'),
    undefined,
    { timeout: 10_000 },
  );
  const info = await page.evaluate(() => window.nowboard.getShareInfo());
  check(info.running && info.port === port, `share server is running on ${port}`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  const base = `http://127.0.0.1:${port}`;
  let snapshot = null;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await fetch(`${base}/api/state`);
    const candidate = await response.json();
    if (candidate && candidate.status) {
      snapshot = candidate;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  check(Boolean(snapshot), 'published snapshot is available over HTTP');
  const serialized = JSON.stringify(snapshot);
  check(!serialized.includes('Secret board task'), 'private task is absent from the snapshot');
  check(serialized.includes('Write the README'), 'public tasks remain in the snapshot');
  check(
    !('tasks' in snapshot) &&
      !('lists' in snapshot) &&
      !('sessions' in snapshot) &&
      !('presets' in snapshot) &&
      !('notesPrivate' in snapshot),
    'raw board collections are not exposed',
  );
  check(Boolean(snapshot.timeline && snapshot.settings && snapshot.status), 'snapshot has the share shape');

  const rootResponse = await fetch(`${base}/`, { redirect: 'manual' });
  check(rootResponse.status === 302 && rootResponse.headers.get('location') === '/share', '/ redirects to /share');
  const indexResponse = await fetch(`${base}/index.html`, { redirect: 'manual' });
  check(indexResponse.status === 302, '/index.html cannot load the editor');
  const editResponse = await fetch(`${base}/edit`, { redirect: 'manual' });
  check(editResponse.status === 302, 'unknown routes cannot load the editor');
  const malformed = await fetch(`${base}/%E0%A4%A`);
  check(malformed.status === 400, 'malformed percent-encoding returns 400');
  const post = await fetch(`${base}/share`, { method: 'POST' });
  check(post.status === 405, 'writes are rejected');

  const shareResponse = await fetch(`${base}/share`);
  const shareHtml = await shareResponse.text();
  check(shareResponse.status === 200 && shareHtml.includes('id="root"'), '/share serves the read-only app');
  check(
    (shareResponse.headers.get('content-security-policy') || '').includes("default-src 'self'"),
    'share response has a strict CSP',
  );

  // Open the real LAN view in a second Electron window and verify the DOM.
  const newPage = launched.waitForEvent('window');
  await launched.evaluate(
    async ({ BrowserWindow }, url) => {
      const window = new BrowserWindow({
        width: 1280,
        height: 800,
        useContentSize: true,
        show: true,
        backgroundColor: '#08090b',
        autoHideMenuBar: true,
      });
      await window.loadURL(url);
    },
    `${base}/share`,
  );
  shareWindow = await newPage;
  shareWindow.on('pageerror', (error) => failures.push(`share pageerror: ${error.message}`));
  await shareWindow.waitForSelector('.present', { timeout: 15_000 });
  await shareWindow.waitForSelector('.present-status__title', { timeout: 10_000 });
  await shareWindow.evaluate(() => document.fonts.ready);
  await shareWindow.waitForTimeout(500);
  const bodyText = await shareWindow.locator('body').innerText();
  check(!bodyText.includes('Secret board task'), 'private task is absent from the share DOM');
  check(bodyText.includes('Write the README'), 'public work is visible in the share DOM');
  const shareUrl = shareWindow.url();
  check(shareUrl.endsWith('/share'), `share window loaded ${shareUrl}`);
  await shareWindow.locator('body').screenshot({
    path: 'screenshots/share-1280x800.png',
    animations: 'disabled',
  });
  console.log('  ✓ screenshots/share-1280x800.png');
} finally {
  await shareWindow?.close().catch(() => undefined);
  await launched?.close().catch(() => undefined);
  rmSync(dataDir, { recursive: true, force: true });
}

if (failures.length) {
  console.error('\nFailures:');
  for (const failure of failures) console.error(`  ! ${failure}`);
  process.exitCode = 1;
}
