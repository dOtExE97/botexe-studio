// gen-icons.mjs — erzeugt die (einfarbigen, gerundeten) PNG-Icons fürs
// Stream-Deck-Plugin. Stream Deck braucht echte PNGs in festen Größen + @2x.
// Lauf: node streamdeck/gen-icons.mjs
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'de.botexe.studio.sdPlugin', 'icons');

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return (buf) => { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = t[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
})();

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(CRC(td), 0);
  return Buffer.concat([len, td, crc]);
}

// Einfarbiges PNG mit Eck-Radius (transparente Ecken) — Markenfarbe.
function png(size, [r, g, b], radiusFrac = 0.22) {
  const rad = size * radiusFrac;
  const raw = Buffer.alloc(size * (size * 4 + 1));
  const inside = (x, y) => {
    // gerundetes Quadrat: Ecken abrunden
    const cx = Math.min(x, size - 1 - x), cy = Math.min(y, size - 1 - y);
    if (cx >= rad || cy >= rad) return true;
    const dx = rad - cx, dy = rad - cy;
    return dx * dx + dy * dy <= rad * rad;
  };
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // Filter-Byte
    for (let x = 0; x < size; x++) {
      const o = y * (size * 4 + 1) + 1 + x * 4;
      const on = inside(x, y);
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = on ? 255 : 0;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit, RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const ACCENT = [255, 84, 54]; // bOtExE-Akzent
const files = [
  ['plugin', 28], ['category', 28], ['action', 20], ['key', 72],
];
fs.mkdirSync(OUT, { recursive: true });
for (const [name, size] of files) {
  fs.writeFileSync(path.join(OUT, `${name}.png`), png(size, ACCENT));
  fs.writeFileSync(path.join(OUT, `${name}@2x.png`), png(size * 2, ACCENT));
  console.log('geschrieben:', name);
}
