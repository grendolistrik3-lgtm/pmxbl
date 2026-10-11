import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

function crc32(buf) {
  let table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const len = data.length;
  const buf = Buffer.alloc(8 + len + 4);
  buf.writeUInt32BE(len, 0);
  buf.write(type, 4, 4, 'ascii');
  data.copy(buf, 8);
  const crc = crc32(buf.subarray(4, 8 + len));
  buf.writeUInt32BE(crc, 8 + len);
  return buf;
}

function generatePng(width, height, isMaskable = false) {
  // Generate RGBA buffer
  const rawData = Buffer.alloc(height * (1 + width * 4));
  let offset = 0;

  const cx = width / 2;
  const cy = height / 2;
  const radius = isMaskable ? width * 0.38 : width * 0.44;

  for (let y = 0; y < height; y++) {
    rawData[offset++] = 0; // Filter byte: None
    for (let x = 0; x < width; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Background gradient (Orange / Amber Brand: #f97316 to #ea580c)
      const gradT = (x + y) / (width + height);
      let r = Math.round(249 - gradT * 25); // 249 -> 224
      let g = Math.round(115 - gradT * 30); // 115 -> 85
      let b = Math.round(22 - gradT * 10);  // 22 -> 12
      let a = 255;

      if (!isMaskable) {
        // Rounded rectangle icon badge
        const cornerR = width * 0.22;
        const qx = Math.max(Math.abs(x - cx) - (cx - cornerR), 0);
        const qy = Math.max(Math.abs(y - cy) - (cy - cornerR), 0);
        const qDist = Math.sqrt(qx * qx + qy * qy);
        if (qDist > cornerR) {
          a = 0; // Transparent outside rounded corner
        }
      }

      // Draw emblem in center: Building hammer/brick or "PM" monogram
      if (a > 0) {
        // Inner badge circle
        if (dist <= radius) {
          // Inner contrast circle
          const innerDist = Math.abs(dist - radius);
          if (innerDist < width * 0.02) {
            r = 255; g = 255; b = 255; // White border ring
          } else if (dist < radius * 0.85) {
            // White central emblem
            const normX = (x - cx) / (radius * 0.7);
            const normY = (y - cy) / (radius * 0.7);
            // Draw building / shop shape & letter P/M
            if (
              (Math.abs(normX) < 0.7 && Math.abs(normY) < 0.55 && Math.abs(normX) > 0.45) || // columns
              (Math.abs(normX) < 0.65 && normY > -0.55 && normY < -0.35) || // roof beam
              (Math.abs(normX) < 0.65 && normY > 0.35 && normY < 0.55) || // foundation
              (Math.abs(normX) < 0.25 && Math.abs(normY) < 0.35) // center pillar
            ) {
              r = 255; g = 255; b = 255;
            }
          }
        }
      }

      rawData[offset++] = r;
      rawData[offset++] = g;
      rawData[offset++] = b;
      rawData[offset++] = a;
    }
  }

  const deflated = zlib.deflateSync(rawData);

  // PNG Header
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // IHDR Chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // Bit depth: 8
  ihdr[9] = 6; // Color type: 6 (RGBA)
  ihdr[10] = 0; // Compression: 0
  ihdr[11] = 0; // Filter: 0
  ihdr[12] = 0; // Interlace: 0

  const ihdrChunk = makeChunk('IHDR', ihdr);
  const idatChunk = makeChunk('IDAT', deflated);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([sig, ihdrChunk, idatChunk, iendChunk]);
}

const publicDir = path.resolve('public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

console.log('Generating PWA & APK icons...');
fs.writeFileSync(path.join(publicDir, 'pwa-192x192.png'), generatePng(192, 192, false));
fs.writeFileSync(path.join(publicDir, 'pwa-512x512.png'), generatePng(512, 512, false));
fs.writeFileSync(path.join(publicDir, 'pwa-maskable-512x512.png'), generatePng(512, 512, true));
fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), generatePng(180, 180, false));
fs.writeFileSync(path.join(publicDir, 'favicon.ico'), generatePng(32, 32, false));

// Also generate high quality SVG icon
const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#f97316" />
      <stop offset="100%" stop-color="#ea580c" />
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="12" stdDeviation="16" flood-color="#7c2d12" flood-opacity="0.35"/>
    </filter>
  </defs>
  <rect width="512" height="512" rx="112" fill="url(#grad)"/>
  <circle cx="256" cy="256" r="190" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="8" stroke-dasharray="16 12" />
  <g filter="url(#shadow)" fill="#ffffff">
    <!-- Storefront / Building structure -->
    <path d="M128 200 L256 112 L384 200 L360 216 L256 144 L152 216 Z" />
    <rect x="152" y="232" width="36" height="152" rx="8" />
    <rect x="238" y="232" width="36" height="152" rx="8" />
    <rect x="324" y="232" width="36" height="152" rx="8" />
    <rect x="132" y="388" width="248" height="24" rx="6" />
  </g>
  <!-- Monogram text -->
  <text x="256" y="460" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="44" fill="#ffffff" text-anchor="middle" letter-spacing="4">PM X BL</text>
</svg>`;
fs.writeFileSync(path.join(publicDir, 'icon.svg'), svgContent);

console.log('Icons successfully created in /public !');
