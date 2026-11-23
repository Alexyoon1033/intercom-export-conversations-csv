import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

// Pure Node.js PNG generator for unique ChatVault Slate/Emerald/Sky geometric vault icons (16x16, 48x48, 128x128)
// Ensures 0% similarity to third-party Intercom logo/colors for Chrome Web Store Trademark policy compliance.

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function createIconPng(size) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = size * 4 + 1;
  const raw = Buffer.alloc(stride * size);

  const center = (size - 1) / 2;
  const radius = size * 0.44;
  const innerRadius = size * 0.27;

  for (let y = 0; y < size; y++) {
    const rowStart = y * stride;
    raw[rowStart] = 0; // filter type 0
    for (let x = 0; x < size; x++) {
      const idx = rowStart + 1 + x * 4;
      const dx = x - center;
      const dy = y - center;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Rounded rect background check
      const normX = Math.abs(dx) / (size * 0.46);
      const normY = Math.abs(dy) / (size * 0.46);
      const inBox = Math.pow(Math.max(normX - 0.65, 0), 2) + Math.pow(Math.max(normY - 0.65, 0), 2) <= 0.12 && normX <= 1.0 && normY <= 1.0;

      if (!inBox) {
        raw[idx] = 0;
        raw[idx + 1] = 0;
        raw[idx + 2] = 0;
        raw[idx + 3] = 0;
        continue;
      }

      // Vault ring & export arrow geometry in Emerald (#10B981) on Deep Slate (#0F172A)
      const isVaultRing = dist <= radius * 0.72 && dist >= innerRadius * 0.68 && dx < radius * 0.35;
      const isArrowShaft = Math.abs(dy) <= size * 0.07 && dx >= -size * 0.05 && dx <= size * 0.34;
      const isArrowHead =
        dx >= size * 0.14 &&
        dx <= size * 0.36 &&
        Math.abs(dy) <= (size * 0.36 - dx) * 0.95;

      if (isArrowShaft || isArrowHead) {
        // Bright Emerald (#34D399)
        raw[idx] = 52;
        raw[idx + 1] = 211;
        raw[idx + 2] = 153;
        raw[idx + 3] = 255;
      } else if (isVaultRing) {
        // Sky Cyan (#38BDF8)
        raw[idx] = 56;
        raw[idx + 1] = 189;
        raw[idx + 2] = 248;
        raw[idx + 3] = 255;
      } else {
        // Deep Slate gradient (#0F172A -> #1E293B)
        const t = (x + y) / (2 * size);
        raw[idx] = Math.round(15 + t * 15);
        raw[idx + 1] = Math.round(23 + t * 22);
        raw[idx + 2] = Math.round(42 + t * 28);
        raw[idx + 3] = 255;
      }
    }
  }

  const idatData = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    signature,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', idatData),
    makeChunk('IEND', Buffer.alloc(0))
  ]);
}

const iconsDir = path.resolve('c:/YDW/AI/Antigravity/chatvault-intercom-exporter/icons');
fs.mkdirSync(iconsDir, { recursive: true });

for (const size of [16, 48, 128]) {
  const file = path.join(iconsDir, `icon${size}.png`);
  fs.writeFileSync(file, createIconPng(size));
  console.log(`Generated ${file} (${fs.statSync(file).size} bytes)`);
}
