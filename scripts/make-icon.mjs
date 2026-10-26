/**
 * Generate Now Board's app icon without external image dependencies.
 *
 * The mark mirrors src/components/BrandMark.tsx: concentric rings, an accent
 * arc, and a solid centre dot on a quiet rounded square.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const SIZE = 256;
const SAMPLES = 4;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'build');

const BG_TOP = [7, 10, 13];
const BG_BOTTOM = [10, 19, 16];
const ACCENT = [74, 222, 157];
const INK = [232, 244, 239];

function mix(a, b, t) {
  const clamped = Math.max(0, Math.min(1, t));
  return [
    a[0] + (b[0] - a[0]) * clamped,
    a[1] + (b[1] - a[1]) * clamped,
    a[2] + (b[2] - a[2]) * clamped,
  ];
}

function insideRoundedRect(x, y, left, top, right, bottom, radius) {
  if (x < left || x > right || y < top || y > bottom) return false;
  const cx = Math.max(left + radius, Math.min(x, right - radius));
  const cy = Math.max(top + radius, Math.min(y, bottom - radius));
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= radius * radius;
}

function sample(u, v) {
  let r = 0;
  let g = 0;
  let b = 0;
  let a = 0;

  const paint = (color, alpha) => {
    if (alpha <= 0) return;
    const outAlpha = alpha + a * (1 - alpha);
    if (outAlpha <= 0) return;
    r = (color[0] * alpha + r * a * (1 - alpha)) / outAlpha;
    g = (color[1] * alpha + g * a * (1 - alpha)) / outAlpha;
    b = (color[2] * alpha + b * a * (1 - alpha)) / outAlpha;
    a = outAlpha;
  };

  // Rounded-square surface with a soft, top-left green wash.
  if (insideRoundedRect(u, v, 0.65, 0.65, 23.35, 23.35, 5.1)) {
    let color = mix(BG_TOP, BG_BOTTOM, v / 24);
    const glowDistance = Math.hypot(u - 6.4, v - 4.2);
    color = mix(color, ACCENT, Math.max(0, 1 - glowDistance / 22) * 0.13);
    paint(color, 1);
  }

  const centreDistance = Math.hypot(u - 12, v - 12);
  if (centreDistance < 6.3) {
    paint(ACCENT, Math.max(0, 1 - centreDistance / 6.3) * 0.09);
  }

  // Brand mark.
  if (Math.abs(centreDistance - 8.4) <= 0.78) paint(INK, 0.46);
  if (Math.abs(centreDistance - 5.4) <= 0.72) paint(ACCENT, 0.34);

  const angle = Math.atan2(v - 12, u - 12);
  if (
    Math.abs(centreDistance - 8.4) <= 0.9 &&
    angle >= -Math.PI / 2 &&
    angle <= 0
  ) {
    paint(ACCENT, 1);
  }
  if (centreDistance <= 3.15) paint(ACCENT, 1);

  return [r, g, b, a];
}

function render() {
  const rgba = Buffer.alloc(SIZE * SIZE * 4);
  const step = 1 / SAMPLES;
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < SAMPLES; sy += 1) {
        for (let sx = 0; sx < SAMPLES; sx += 1) {
          const u = ((x + (sx + 0.5) * step) / SIZE) * 24;
          const v = ((y + (sy + 0.5) * step) / SIZE) * 24;
          const [sr, sg, sb, sa] = sample(u, v);
          r += sr * sa;
          g += sg * sa;
          b += sb * sa;
          a += sa;
        }
      }
      const offset = (y * SIZE + x) * 4;
      if (a > 0) {
        rgba[offset] = Math.round(r / a);
        rgba[offset + 1] = Math.round(g / a);
        rgba[offset + 2] = Math.round(b / a);
        rgba[offset + 3] = Math.round((a / (SAMPLES * SAMPLES)) * 255);
      }
    }
  }
  return rgba;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let value = n;
    for (let k = 0; k < 8; k += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[n] = value >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const name = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])), 0);
  return Buffer.concat([length, name, data, crc]);
}

function encodePng(rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(SIZE, 0);
  header.writeUInt32BE(SIZE, 4);
  header[8] = 8;
  header[9] = 6;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  const stride = SIZE * 4;
  const raw = Buffer.alloc((stride + 1) * SIZE);
  for (let y = 0; y < SIZE; y += 1) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function encodeIco(png) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);

  const entry = Buffer.alloc(16);
  entry[0] = 0; // 256px
  entry[1] = 0;
  entry[2] = 0;
  entry[3] = 0;
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(22, 12);

  return Buffer.concat([header, entry, png]);
}

mkdirSync(outDir, { recursive: true });
const png = encodePng(render());
writeFileSync(path.join(outDir, 'icon.png'), png);
writeFileSync(path.join(outDir, 'icon.ico'), encodeIco(png));
console.log(`  ✓ build/icon.png and build/icon.ico (${SIZE}×${SIZE})`);
