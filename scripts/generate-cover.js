import fs from 'fs';
import zlib from 'zlib';

const W = 800;
const H = 600;

// Pixel buffer: RGBA (W * H * 4)
const pixels = Buffer.alloc(W * H * 4);

function setPixel(x, y, r, g, b, a = 255) {
  if (x < 0 || x >= W || y < 0 || y >= H) return;
  const idx = (y * W + x) * 4;
  pixels[idx] = r;
  pixels[idx + 1] = g;
  pixels[idx + 2] = b;
  pixels[idx + 3] = a;
}

function fillRect(x, y, w, h, r, g, b, a = 255) {
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(W, Math.floor(x + w));
  const y1 = Math.min(H, Math.floor(y + h));
  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      setPixel(px, py, r, g, b, a);
    }
  }
}

// 5x7 font data
const FONT = {
  'A': [14,17,17,31,17,17,17], 'B': [30,17,17,30,17,17,30], 'C': [14,17,16,16,16,17,14],
  'D': [28,18,17,17,17,18,28], 'E': [31,16,16,30,16,16,31], 'F': [31,16,16,30,16,16,16],
  'G': [14,17,16,23,17,17,15], 'H': [17,17,17,31,17,17,17], 'I': [14,4,4,4,4,4,14],
  'J': [7,2,2,2,2,18,12],      'K': [17,18,20,24,20,18,17], 'L': [16,16,16,16,16,16,31],
  'M': [17,27,21,17,17,17,17], 'N': [17,25,21,19,17,17,17], 'O': [14,17,17,17,17,17,14],
  'P': [30,17,17,30,16,16,16], 'Q': [14,17,17,17,21,18,13], 'R': [30,17,17,30,20,18,17],
  'S': [15,16,16,14,1,1,30],   'T': [31,4,4,4,4,4,4],       'U': [17,17,17,17,17,17,14],
  'V': [17,17,17,17,17,10,4],  'W': [17,17,17,17,21,27,17], 'X': [17,17,10,4,10,17,17],
  'Y': [17,17,10,4,4,4,4],     'Z': [31,1,2,4,8,16,31],
  '0': [14,17,19,21,25,17,14], '1': [4,12,4,4,4,4,14],     '2': [14,17,1,2,4,8,31],
  '3': [31,2,4,2,1,17,14],     '4': [2,6,10,18,31,2,2],     '5': [31,16,30,1,1,17,14],
  '6': [6,8,16,30,17,17,14],   '7': [31,1,2,4,8,8,8],       '8': [14,17,17,14,17,17,14],
  '9': [14,17,17,15,1,2,12],   ' ': [0,0,0,0,0,0,0],        '.': [0,0,0,0,0,12,12],
  ':': [0,12,12,0,12,12,0],    '!': [4,4,4,4,0,4,0],        '¡': [0,4,0,4,4,4,4],
  '-': [0,0,0,31,0,0,0],       '★': [4,14,31,14,27,17,0],   '·': [0,0,12,12,0,0,0],
  'Á': [4,14,17,31,17,17,17],  'É': [4,31,16,30,16,16,31],  'Í': [4,14,4,4,4,4,14],
  'Ó': [4,14,17,17,17,17,14],  'Ú': [4,17,17,17,17,17,14],  'Ñ': [10,17,25,21,19,17,17],
};

function drawText(cx, cy, str, scale, r, g, b, alignCenter = true) {
  const lines = str.split('\n');
  const lh = (7 + 2) * scale;
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    const totalW = line.length * (5 + 1) * scale;
    const startX = alignCenter ? cx - totalW / 2 : cx;
    const startY = cy + li * lh;
    for (let ci = 0; ci < line.length; ci++) {
      const ch = line[ci].toUpperCase();
      const glyph = FONT[ch] || FONT[' '] || [0,0,0,0,0,0,0];
      const charX = startX + ci * (5 + 1) * scale;
      // Shadow
      for (let row = 0; row < 7; row++) {
        const bits = glyph[row];
        for (let col = 0; col < 5; col++) {
          if ((bits >> (4 - col)) & 1) {
            fillRect(charX + col * scale + scale, startY + row * scale + scale, scale, scale, 0, 0, 0);
          }
        }
      }
      // Foreground
      for (let row = 0; row < 7; row++) {
        const bits = glyph[row];
        for (let col = 0; col < 5; col++) {
          if ((bits >> (4 - col)) & 1) {
            fillRect(charX + col * scale, startY + row * scale, scale, scale, r, g, b);
          }
        }
      }
    }
  }
}

// 1. Dark CRT space background
fillRect(0, 0, W, H, 6, 6, 12);

// Stars
for (let i = 0; i < 160; i++) {
  const sx = Math.floor(Math.random() * W);
  const sy = Math.floor(Math.random() * H);
  const bright = Math.floor(100 + Math.random() * 155);
  setPixel(sx, sy, bright, bright, bright);
  if (Math.random() < 0.3) {
    setPixel(sx+1, sy, bright, bright, bright);
    setPixel(sx, sy+1, bright, bright, bright);
  }
}

// Neon arcade cabinet borders
fillRect(0, 0, W, 8, 255, 230, 0); // Yellow top bar
fillRect(0, H - 8, W, 8, 0, 255, 65); // Phosphor green bottom bar
fillRect(0, 0, 8, H, 255, 68, 170); // Hot pink left bar
fillRect(W - 8, 0, 8, H, 0, 229, 255); // Cyan right bar

// Inner border
fillRect(14, 14, W - 28, 2, 80, 80, 120);
fillRect(14, H - 16, W - 28, 2, 80, 80, 120);
fillRect(14, 14, 2, H - 28, 80, 80, 120);
fillRect(W - 16, 14, 2, H - 28, 80, 80, 120);

// Corner brackets
fillRect(10, 10, 20, 4, 255, 230, 0);
fillRect(10, 10, 4, 20, 255, 230, 0);
fillRect(W - 30, 10, 20, 4, 255, 230, 0);
fillRect(W - 14, 10, 4, 20, 255, 230, 0);
fillRect(10, H - 14, 20, 4, 0, 255, 65);
fillRect(10, H - 30, 4, 20, 0, 255, 65);
fillRect(W - 30, H - 14, 20, 4, 0, 255, 65);
fillRect(W - 14, H - 30, 4, 20, 0, 255, 65);

// Header banner
drawText(W / 2, 32, '★ PLATANUS HACK 26 · ARCADE CHALLENGE ★', 2, 255, 230, 0);

// Giant 3D Title "PARCHE PARTY"
drawText(W / 2 + 6, 84, 'PARCHE', 10, 180, 20, 20);
drawText(W / 2, 80, 'PARCHE', 10, 255, 230, 0);

drawText(W / 2 + 6, 164, 'PARTY', 10, 150, 0, 90);
drawText(W / 2, 160, 'PARTY', 10, 255, 68, 170);

// Subtitle
drawText(W / 2, 255, '— EL ARCADE COLOMBIANO · 2 JUGADORES —', 2, 0, 229, 255);

// 4 Minigame Cards
const CARDS = [
  { title: 'AREPA VOLADORA', icon: '🫓', desc: 'ATRAPA LAS AREPAS', col: [244, 168, 0], x: 120, y: 310 },
  { title: 'CHIVA LOCA', icon: '🚌', desc: 'ESQUIVA LA CARRETERA', col: [221, 17, 0], x: 305, y: 310 },
  { title: 'TEJO TURBO', icon: '🎯', desc: '¡REVUELCA LA MECHA!', col: [0, 255, 65], x: 495, y: 310 },
  { title: 'CAFE EN EQUILIBRIO', icon: '☕', desc: 'NO BOTES EL POCILLO', col: [196, 120, 0], x: 680, y: 310 },
];

for (const c of CARDS) {
  const cw = 160;
  const ch = 190;
  const cx = c.x - cw / 2;
  const cy = c.y;

  // Card background
  fillRect(cx, cy, cw, ch, 15, 15, 26);
  // Card border
  fillRect(cx, cy, cw, 2, c.col[0], c.col[1], c.col[2]);
  fillRect(cx, cy + ch - 2, cw, 2, c.col[0], c.col[1], c.col[2]);
  fillRect(cx, cy, 2, ch, c.col[0], c.col[1], c.col[2]);
  fillRect(cx + cw - 2, cy, 2, ch, c.col[0], c.col[1], c.col[2]);

  // Card header
  drawText(c.x, cy + 18, c.title, 1, c.col[0], c.col[1], c.col[2]);
  fillRect(cx + 10, cy + 34, cw - 20, 1, 60, 60, 90);

  // Icon / Graphic illustration in center
  if (c.title === 'AREPA VOLADORA') {
    fillRect(c.x - 24, cy + 60, 48, 48, 247, 179, 43); // golden arepa
    fillRect(c.x - 18, cy + 74, 36, 4, 141, 91, 24); // grill mark 1
    fillRect(c.x - 18, cy + 88, 36, 4, 141, 91, 24); // grill mark 2
  } else if (c.title === 'CHIVA LOCA') {
    fillRect(c.x - 24, cy + 56, 48, 56, 255, 215, 0); // Yellow chiva body
    fillRect(c.x - 24, cy + 74, 48, 12, 0, 51, 170); // Blue stripe
    fillRect(c.x - 24, cy + 86, 48, 12, 221, 17, 0); // Red stripe
    fillRect(c.x - 18, cy + 48, 36, 8, 0, 170, 68); // Green roof rack (plantains)
    fillRect(c.x - 26, cy + 102, 10, 12, 17, 17, 17); // Left tire
    fillRect(c.x + 16, cy + 102, 10, 12, 17, 17, 17); // Right tire
  } else if (c.title === 'TEJO TURBO') {
    fillRect(c.x - 30, cy + 56, 60, 60, 92, 46, 10); // Clay box
    fillRect(c.x - 14, cy + 72, 28, 28, 220, 34, 0); // Red mecha
    fillRect(c.x - 6, cy + 80, 12, 12, 255, 255, 0); // Yellow spark core
  } else if (c.title === 'CAFE EN EQUILIBRIO') {
    fillRect(c.x - 32, cy + 104, 64, 8, 139, 69, 19); // Wood tray
    fillRect(c.x - 18, cy + 62, 36, 42, 240, 234, 214); // Cream pocillo
    fillRect(c.x - 18, cy + 62, 36, 6, 0, 56, 168); // Blue enamel rim
    fillRect(c.x - 14, cy + 74, 28, 20, 59, 26, 6); // Coffee liquid
    fillRect(c.x + 18, cy + 74, 8, 18, 0, 56, 168); // Blue handle
  }

  // Description
  drawText(c.x, cy + 145, c.desc, 1, 170, 170, 200);
}

// Footer badge
drawText(W / 2, 530, '► DIVERSIÓN MULTIJUGADOR 100% COLOMBIANA ◄', 2, 0, 255, 65);
drawText(W / 2, 565, 'CABINET ARCADE 2P · 60s QUICK-ROUND BATTLE', 1, 100, 100, 140);

// Scanlines on top
for (let y = 0; y < H; y += 4) {
  for (let x = 0; x < W; x++) {
    const idx = (y * W + x) * 4;
    pixels[idx] = Math.floor(pixels[idx] * 0.75);
    pixels[idx + 1] = Math.floor(pixels[idx + 1] * 0.75);
    pixels[idx + 2] = Math.floor(pixels[idx + 2] * 0.75);
  }
}

// Build PNG file buffer
function makeCRC32Table() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c;
  }
  return table;
}
const crcTable = makeCRC32Table();
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  }
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function makeChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);

  const crcBuf = Buffer.alloc(4);
  const toCrc = Buffer.concat([typeBuf, data]);
  crcBuf.writeUInt32BE(crc32(toCrc), 0);

  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

// Uncompressed raw scanlines: each row has 1 filter byte (0) + W*4 RGBA bytes
const rawScanlines = Buffer.alloc(H * (W * 4 + 1));
for (let y = 0; y < H; y++) {
  const rowStart = y * (W * 4 + 1);
  rawScanlines[rowStart] = 0; // Filter: None
  pixels.copy(rawScanlines, rowStart + 1, y * W * 4, (y + 1) * W * 4);
}

const compressedIDAT = zlib.deflateSync(rawScanlines, { level: 9 });

const signature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

// IHDR
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8;  // bit depth
ihdr[9] = 6;  // RGBA
ihdr[10] = 0; // compression
ihdr[11] = 0; // filter
ihdr[12] = 0; // interlace

const pngBuffer = Buffer.concat([
  signature,
  makeChunk('IHDR', ihdr),
  makeChunk('IDAT', compressedIDAT),
  makeChunk('IEND', Buffer.alloc(0)),
]);

fs.writeFileSync('cover.png', pngBuffer);
console.log('Cover generated successfully! Size:', (pngBuffer.length / 1024).toFixed(2), 'KB');
