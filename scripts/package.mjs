/**
 * Build a runnable, portable Windows app in release/.
 *
 * The renderer is bundled by Vite, so the packaged app only needs the built
 * dist folder, the Electron entry points, and the icon. Sources, tests,
 * screenshots and development configs are excluded from the payload.
 */
import { packager } from '@electron/packager';
import {
  copyFileSync,
  cpSync,
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const icon = path.join(root, 'build', 'icon.ico');
const dist = path.join(root, 'dist', 'index.html');

if (!existsSync(dist)) {
  throw new Error('dist/ is missing. Run npm run build first.');
}
if (!existsSync(icon)) {
  throw new Error('build/icon.ico is missing. Run npm run icon first.');
}

const ignore = [
  /^\/src($|\/)/,
  /^\/scripts($|\/)/,
  /^\/screenshots($|\/)/,
  /^\/release($|\/)/,
  /^\/\.git($|\/)/,
  /^\/index\.html$/,
  /^\/package-lock\.json$/,
  /^\/PLAN\.md$/,
  /^\/PROGRESS\.md$/,
  /^\/DECISIONS\.md$/,
  /^\/README\.md$/,
  /^\/LICENSE$/,
  /^\/docs($|\/)/,
  /^\/\.gitignore$/,
  /^\/eslint\.config\.js$/,
  /^\/tsconfig\.json$/,
  /^\/vite\.config\.ts$/,
  /^\/vitest\.config\.ts$/,
  /^\/electron\/.*\.test\.mjs$/,
];

function directorySize(dir) {
  let total = 0;
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = statSync(full);
    total += stat.isDirectory() ? directorySize(full) : stat.size;
  }
  return total;
}

console.log('Packaging Now Board for Windows x64…');
const appPaths = await packager({
  dir: root,
  out: process.env.NOW_BOARD_PACKAGE_OUT || path.join(root, 'release'),
  name: 'Now Board',
  executableName: 'Now Board',
  platform: 'win32',
  arch: 'x64',
  appVersion: packageJson.version,
  buildVersion: packageJson.version,
  appCopyright: 'Copyright © 2026 Now Board',
  icon,
  asar: true,
  overwrite: true,
  prune: true,
  ignore,
  win32metadata: {
    CompanyName: 'Now Board',
    FileDescription: 'Now Board — a calm focus board',
    InternalName: 'Now Board',
    OriginalFilename: 'Now Board.exe',
    ProductName: 'Now Board',
  },
});

for (const appPath of appPaths) {
  for (const file of ['README.md', 'LICENSE', 'DECISIONS.md', 'PROGRESS.md']) {
    const source = path.join(root, file);
    if (existsSync(source)) copyFileSync(source, path.join(appPath, file));
  }
  const docs = path.join(root, 'docs');
  if (existsSync(docs)) cpSync(docs, path.join(appPath, 'docs'), { recursive: true });
  const size = directorySize(appPath);
  console.log(`  ✓ ${path.relative(root, appPath)} (${(size / 1024 / 1024).toFixed(0)} MB)`);
  console.log(`    ${path.join(appPath, 'Now Board.exe')}`);
}
