import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createShareServer } = require('./lan.cjs');

let server;
let baseUrl;
let distDir;

beforeAll(async () => {
  distDir = mkdtempSync(path.join(tmpdir(), 'now-board-lan-test-'));
  mkdirSync(path.join(distDir, 'assets'));
  writeFileSync(
    path.join(distDir, 'index.html'),
    '<!doctype html><html><body><div id="root"></div></body></html>',
    'utf8',
  );
  writeFileSync(path.join(distDir, 'assets', 'app.js'), 'console.log("share");', 'utf8');

  server = createShareServer({ distDir, port: 0 });
  const result = await server.start();
  if (!result.ok) throw new Error(`LAN test server failed: ${result.error}`);
  baseUrl = `http://127.0.0.1:${result.port}`;
});

afterAll(() => {
  server?.stop();
  if (distDir) rmSync(distDir, { recursive: true, force: true });
});

describe('LAN share server routing', () => {
  it('redirects the root and index.html to the share view', async () => {
    const root = await fetch(`${baseUrl}/`, { redirect: 'manual' });
    expect(root.status).toBe(302);
    expect(root.headers.get('location')).toBe('/share');

    const index = await fetch(`${baseUrl}/index.html`, { redirect: 'manual' });
    expect(index.status).toBe(302);
    expect(index.headers.get('location')).toBe('/share');

    const trailing = await fetch(`${baseUrl}/share/`, { redirect: 'manual' });
    expect(trailing.status).toBe(302);
    expect(trailing.headers.get('location')).toBe('/share');
  });

  it('never serves the editor shell for arbitrary routes', async () => {
    const response = await fetch(`${baseUrl}/edit`, { redirect: 'manual' });
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/share');
  });

  it('serves the share document and its assets with a strict CSP', async () => {
    const response = await fetch(`${baseUrl}/share`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toMatch(/text\/html/);
    expect(response.headers.get('content-security-policy')).toMatch(/default-src 'self'/);
    expect(response.headers.get('x-robots-tag')).toMatch(/noindex/);
    expect(await response.text()).toContain('id="root"');

    const asset = await fetch(`${baseUrl}/assets/app.js`);
    expect(asset.status).toBe(200);
    expect(asset.headers.get('content-type')).toMatch(/javascript/);
    expect(await asset.text()).toContain('share');
  });

  it('supports HEAD and answers bad paths without throwing', async () => {
    const head = await fetch(`${baseUrl}/share`, { method: 'HEAD' });
    expect(head.status).toBe(200);
    expect(head.headers.get('content-type')).toMatch(/text\/html/);

    const malformed = await fetch(`${baseUrl}/%E0%A4%A`);
    expect(malformed.status).toBe(400);

    const missing = await fetch(`${baseUrl}/assets/missing.js`);
    expect(missing.status).toBe(404);
  });

  it('exposes only the published read-only snapshot', async () => {
    const empty = await fetch(`${baseUrl}/api/state`);
    expect(empty.status).toBe(200);
    expect(await empty.json()).toEqual({ empty: true });

    server.setSnapshot({ status: { label: 'Developing' }, settings: {}, timeline: {} });
    const state = await fetch(`${baseUrl}/api/state`);
    expect(await state.json()).toEqual({
      status: { label: 'Developing' },
      settings: {},
      timeline: {},
    });

    const health = await fetch(`${baseUrl}/api/health`);
    expect(await health.json()).toEqual({ ok: true, hasSnapshot: true });
  });

  it('rejects non-GET methods', async () => {
    const response = await fetch(`${baseUrl}/share`, { method: 'POST' });
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET, HEAD');
  });
});
