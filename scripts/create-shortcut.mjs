/**
 * Create a Windows desktop shortcut to the portable build.
 *
 * Usage: npm run shortcut
 * Override the desktop directory for tests with NOW_BOARD_DESKTOP_DIR.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.platform !== 'win32') {
  console.error('Desktop shortcut creation is currently Windows-only.');
  process.exit(1);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const exe = path.join(root, 'release', 'Now Board-win32-x64', 'Now Board.exe');
if (!existsSync(exe)) {
  console.error('The portable app is missing. Run "npm run package" first.');
  process.exit(1);
}

const quote = (value) => `'${String(value).replace(/'/g, "''")}'`;
const desktopExpression = process.env.NOW_BOARD_DESKTOP_DIR
  ? quote(process.env.NOW_BOARD_DESKTOP_DIR)
  : "[Environment]::GetFolderPath('Desktop')";
const script = `
$desktop = ${desktopExpression}
if (-not $desktop) { throw 'Could not find a desktop directory.' }
New-Item -ItemType Directory -Force -Path $desktop | Out-Null
$shortcutPath = Join-Path $desktop 'Now Board.lnk'
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = ${quote(exe)}
$shortcut.WorkingDirectory = ${quote(path.dirname(exe))}
$shortcut.IconLocation = ${quote(`${exe},0`)}
$shortcut.Description = 'Now Board — a calm focus board for your second monitor'
$shortcut.WindowStyle = 1
$shortcut.Save()
Write-Output $shortcutPath
`;

try {
  const output = execFileSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
    { encoding: 'utf8' },
  ).trim();
  console.log(`  ✓ ${output}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Shortcut creation failed.');
  process.exit(1);
}
