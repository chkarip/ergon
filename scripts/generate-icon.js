#!/usr/bin/env node
/**
 * Generates assets/icon.png — a 256×256 app icon.
 * Run with: node scripts/generate-icon.js
 * No external dependencies; uses only Node.js built-ins.
 */

'use strict';
const fs   = require('fs');
const zlib = require('zlib');
const path = require('path');

const SIZE = 256;
const pixels = new Uint8Array(SIZE * SIZE * 4); // RGBA

// ─── CRC32 ───────────────────────────────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.allocUnsafe(4); len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.allocUnsafe(4); crcBuf.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crcBuf]);
}

// ─── Pixel helpers ───────────────────────────────────────────────────────────
function setPixel(x, y, r, g, b, a = 255) {
  if (x < 0 || x >= SIZE || y < 0 || y >= SIZE) return;
  const i = (y * SIZE + x) * 4;
  pixels[i] = r; pixels[i+1] = g; pixels[i+2] = b; pixels[i+3] = a;
}

function fillRoundRect(x, y, w, h, radius, r, g, b, a = 255) {
  for (let py = y; py < y + h; py++) {
    for (let px = x; px < x + w; px++) {
      const lx = px - x, ly = py - y;
      let inside = true;
      if      (lx < radius && ly < radius)         inside = Math.hypot(lx - radius, ly - radius) <= radius;
      else if (lx > w-radius && ly < radius)        inside = Math.hypot(lx - (w-radius), ly - radius) <= radius;
      else if (lx < radius && ly > h-radius)        inside = Math.hypot(lx - radius, ly - (h-radius)) <= radius;
      else if (lx > w-radius && ly > h-radius)      inside = Math.hypot(lx - (w-radius), ly - (h-radius)) <= radius;
      if (inside) setPixel(px, py, r, g, b, a);
    }
  }
}

function line(x0, y0, x1, y1, thickness, r, g, b) {
  const dx = x1 - x0, dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  if (len === 0) return;
  const nx = -dy / len, ny = dx / len;
  const steps = Math.ceil(len * 2);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const cx = x0 + dx * t, cy = y0 + dy * t;
    for (let w = -thickness / 2; w <= thickness / 2; w += 0.5) {
      setPixel(Math.round(cx + nx * w), Math.round(cy + ny * w), r, g, b);
    }
  }
}

// ─── Draw background gradient ────────────────────────────────────────────────
// Gradient: #667eea → #764ba2 (diagonal)
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const t = (x + y) / (SIZE * 2);
    setPixel(x, y,
      Math.round(102 + (118 - 102) * t),
      Math.round(126 + (75  - 126) * t),
      Math.round(234 + (162 - 234) * t),
      255
    );
  }
}

// ─── Rounded-square mask (corner radius 48) ──────────────────────────────────
const CR = 48;
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    let inside = true;
    if      (x < CR      && y < CR)       inside = Math.hypot(x - CR,        y - CR)        <= CR;
    else if (x > SIZE-CR && y < CR)       inside = Math.hypot(x - (SIZE-CR), y - CR)        <= CR;
    else if (x < CR      && y > SIZE-CR)  inside = Math.hypot(x - CR,        y - (SIZE-CR)) <= CR;
    else if (x > SIZE-CR && y > SIZE-CR)  inside = Math.hypot(x - (SIZE-CR), y - (SIZE-CR)) <= CR;
    if (!inside) {
      const i = (y * SIZE + x) * 4;
      pixels[i+3] = 0;
    }
  }
}

// ─── Folder shape (white) ────────────────────────────────────────────────────
// Tab: left-top of folder
fillRoundRect(68, 84, 62, 18, 7, 255, 255, 255);
// Body
fillRoundRect(54, 98, 148, 96, 10, 255, 255, 255);

// ─── Code symbol: < /> inside folder ────────────────────────────────────────
// Draw with the gradient midpoint colour (~#6d62c0 → darker purple)
const S = [102, 78, 210]; // symbol colour (blue-purple, pops on white)
const T = 7;              // stroke thickness

const CX = 128, CY = 152;  // centre of folder body
const H  = 22;              // half-height of chevrons

// <  left chevron
line(CX - 26, CY - H, CX - 42, CY,     T, ...S);
line(CX - 42, CY,     CX - 26, CY + H, T, ...S);

// /  slash
line(CX + 12, CY + H + 4, CX - 2, CY - H - 4, T - 1, ...S);

// >  right chevron
line(CX + 32, CY - H, CX + 48, CY,     T, ...S);
line(CX + 48, CY,     CX + 32, CY + H, T, ...S);

// ─── Encode as PNG ───────────────────────────────────────────────────────────
const RAW = Buffer.allocUnsafe(SIZE * (1 + SIZE * 4));
for (let row = 0; row < SIZE; row++) {
  RAW[row * (1 + SIZE * 4)] = 0; // filter: None
  for (let col = 0; col < SIZE; col++) {
    const si = (row * SIZE + col) * 4;
    const di = row * (1 + SIZE * 4) + 1 + col * 4;
    RAW[di]   = pixels[si];
    RAW[di+1] = pixels[si+1];
    RAW[di+2] = pixels[si+2];
    RAW[di+3] = pixels[si+3];
  }
}

const IHDR = Buffer.allocUnsafe(13);
IHDR.writeUInt32BE(SIZE, 0); IHDR.writeUInt32BE(SIZE, 4);
IHDR.writeUInt8(8,  8);  // bit depth
IHDR.writeUInt8(6,  9);  // RGBA
IHDR.writeUInt8(0, 10); IHDR.writeUInt8(0, 11); IHDR.writeUInt8(0, 12);

const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  pngChunk('IHDR', IHDR),
  pngChunk('IDAT', zlib.deflateSync(RAW, { level: 9 })),
  pngChunk('IEND', Buffer.alloc(0))
]);

const outPath = path.join(__dirname, '..', 'assets', 'icon.png');
fs.writeFileSync(outPath, png);
console.log('Icon written to', outPath);
