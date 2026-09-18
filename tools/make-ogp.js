// OGP画像生成: 1200x630 の PNG を純Node（依存なし）で書き出す。
// 使い方: node tools/make-ogp.js
// 注意: このスクリプトは ogp.png をタイトル文字なしで上書きする。
// 公開中の ogp.png にはタイトル文字入りへの編集が加えられているため、
// 再生成した場合は PowerShell(System.Drawing) 等でタイトルを重ねてから commit すること。
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const W = 1200, H = 630;
// 亀甲（左側）の楕円
const CX = 400, CY = 315, RX = 250, RY = 272;

function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const qx = ax + dx * t, qy = ay + dy * t;
  return Math.hypot(px - qx, py - qy);
}

// ひび（主線＋枝）のセグメント
const CRACKS = [
  { a: [CX, CY - 215], b: [CX + 10, CY + 215], w: 4.5 },
  { a: [CX - 2, CY - 90], b: [CX - 128, CY - 152], w: 3 },
  { a: [CX + 3, CY + 10], b: [CX + 138, CY - 70], w: 3 },
  { a: [CX + 6, CY + 105], b: [CX - 118, CY + 45], w: 3 },
  { a: [CX + 8, CY + 160], b: [CX + 105, CY + 105], w: 2.5 },
];

const BG = [23, 20, 15];
const SHELL_C = [242, 230, 196];
const SHELL_E = [169, 141, 95];
const CRACK = [44, 29, 16];
const EDGE = [70, 50, 26];
const GOLD = [215, 138, 60];

const raw = Buffer.alloc((W * 3 + 1) * H);
for (let y = 0; y < H; y++) {
  const row = y * (W * 3 + 1);
  raw[row] = 0; // filter: None
  for (let x = 0; x < W; x++) {
    let r = BG[0], g = BG[1], b = BG[2];
    const ex = (x - CX) / RX, ey = (y - CY) / RY;
    const d = Math.sqrt(ex * ex + ey * ey);
    if (d <= 1) {
      const t = d * d;
      r = Math.round(SHELL_C[0] + (SHELL_E[0] - SHELL_C[0]) * t);
      g = Math.round(SHELL_C[1] + (SHELL_E[1] - SHELL_C[1]) * t);
      b = Math.round(SHELL_C[2] + (SHELL_E[2] - SHELL_C[2]) * t);
      // 腹甲の区画線（横3本・縦1本）
      const seamY = Math.abs(((y - (CY - RY)) % 95) - 47) < 1.4;
      const seamX = Math.abs(x - CX - 8) < 1.4;
      if ((seamY || seamX) && d < 0.97) { r = 150; g = 114; b = 66; }
      if (Math.abs(d - 0.985) < 0.012) { r = EDGE[0]; g = EDGE[1]; b = EDGE[2]; }
      for (const c of CRACKS) {
        if (segDist(x, y, c.a[0], c.a[1], c.b[0], c.b[1]) < c.w) {
          r = CRACK[0]; g = CRACK[1]; b = CRACK[2];
          break;
        }
      }
    }
    // 右側の金色アクセント線
    if (x >= 770 && x <= 774 && y >= 150 && y <= 480) { r = GOLD[0]; g = GOLD[1]; b = GOLD[2]; }
    const o = row + 1 + x * 3;
    raw[o] = r; raw[o + 1] = g; raw[o + 2] = b;
  }
}

function crc32(buf) {
  let tab = crc32.tab;
  if (!tab) {
    tab = crc32.tab = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      tab[n] = c;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = tab[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const td = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([td, data])), 0);
  return Buffer.concat([len, td, data, crc]);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; ihdr[9] = 2; // 8bit RGB
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);
const out = path.join(__dirname, '..', 'ogp.png');
fs.writeFileSync(out, png);
console.log('wrote ' + out + ' (' + png.length + ' bytes)');
