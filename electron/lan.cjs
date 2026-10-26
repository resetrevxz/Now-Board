'use strict';

const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
};

const BASE_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'X-Robots-Tag': 'noindex, nofollow',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Cache-Control': 'no-store',
};

const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

function lanAddresses(port) {
  const urls = [];
  const interfaces = os.networkInterfaces();
  for (const list of Object.values(interfaces)) {
    for (const entry of list || []) {
      if (entry.family === 'IPv4' && !entry.internal) {
        urls.push(`http://${entry.address}:${port}`);
      }
    }
  }
  return urls;
}

function createShareServer({ distDir, port }) {
  let server = null;
  let snapshot = null;
  let boundPort = port;

  function sendJson(res, status, value) {
    const body = JSON.stringify(value);
    res.writeHead(status, {
      ...BASE_HEADERS,
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(body),
    });
    res.end(body);
  }

  function sendRedirect(res, location) {
    res.writeHead(302, { ...BASE_HEADERS, Location: location });
    res.end();
  }

  function serveFile(res, file) {
    let data;
    try {
      data = fs.readFileSync(file);
    } catch {
      res.writeHead(404, { ...BASE_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
      ...BASE_HEADERS,
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': data.length,
      'Content-Security-Policy': CSP,
    });
    res.end(data);
  }

  function handler(req, res) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { ...BASE_HEADERS, Allow: 'GET, HEAD' });
      res.end();
      return;
    }

    let parsed;
    let requested;
    try {
      parsed = new URL(req.url || '/', 'http://localhost');
      requested = decodeURIComponent(parsed.pathname);
    } catch {
      res.writeHead(400, { ...BASE_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Bad request');
      return;
    }
    if (requested.includes('\0')) {
      res.writeHead(400, { ...BASE_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Bad request');
      return;
    }

    if (requested === '/api/state') {
      sendJson(res, 200, snapshot || { empty: true });
      return;
    }
    if (requested === '/api/health') {
      sendJson(res, 200, { ok: true, hasSnapshot: Boolean(snapshot) });
      return;
    }

    // This server only ever exposes the read-only share view. Everything else
    // is redirected there so the editing surface cannot be loaded over LAN.
    if (requested === '/') {
      sendRedirect(res, '/share');
      return;
    }
    if (requested === '/share/') {
      sendRedirect(res, '/share');
      return;
    }
    if (requested === '/index.html') {
      sendRedirect(res, '/share');
      return;
    }
    if (requested !== '/share' && !path.extname(requested)) {
      sendRedirect(res, '/share');
      return;
    }

    const root = path.resolve(distDir);
    const relative = requested === '/share' ? '/index.html' : requested;
    const file = path.resolve(root, `.${relative}`);
    if (!file.startsWith(root + path.sep)) {
      res.writeHead(404, { ...BASE_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    let stat;
    try {
      stat = fs.statSync(file);
    } catch {
      res.writeHead(404, { ...BASE_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    if (!stat.isFile()) {
      res.writeHead(404, { ...BASE_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    if (req.method === 'HEAD') {
      res.writeHead(200, {
        ...BASE_HEADERS,
        'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'Content-Length': stat.size,
      });
      res.end();
      return;
    }
    serveFile(res, file);
  }

  return {
    start() {
      return new Promise((resolve) => {
        server = http.createServer(handler);
        server.on('request', (req) => {
          // Intentionally quiet; this server is for a small trusted LAN.
          void req;
        });
        server.once('error', (error) => {
          resolve({ ok: false, error: error.message, port: boundPort, urls: [] });
          server = null;
        });
        server.listen(port, '0.0.0.0', () => {
          const address = server.address();
          boundPort = typeof address === 'object' && address ? address.port : port;
          resolve({ ok: true, port: boundPort, urls: lanAddresses(boundPort) });
        });
      });
    },
    stop() {
      if (server) {
        try {
          server.close();
        } catch {
          /* already closed */
        }
        server = null;
      }
    },
    setSnapshot(value) {
      snapshot = value;
    },
  };
}

module.exports = { createShareServer };
