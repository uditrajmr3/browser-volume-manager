const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// Minimal pure-Node PNG generator using zlib
function createPNG(size, drawFn) {
  const width = size;
  const height = size;

  // RGBA buffer with 1 extra byte per scanline for filter byte (0)
  const rowSize = width * 4 + 1;
  const rawData = Buffer.alloc(rowSize * height);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowSize;
    rawData[rowOffset] = 0; // Filter type: None

    for (let x = 0; x < width; x++) {
      const pixelOffset = rowOffset + 1 + x * 4;
      const [r, g, b, a] = drawFn(x, y, width, height);
      rawData[pixelOffset] = r;
      rawData[pixelOffset + 1] = g;
      rawData[pixelOffset + 2] = b;
      rawData[pixelOffset + 3] = a;
    }
  }

  const deflated = zlib.deflateSync(rawData);

  // PNG Signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // Bit depth
  ihdr[9] = 6; // Color type: RGBA
  ihdr[10] = 0; // Compression
  ihdr[11] = 0; // Filter
  ihdr[12] = 0; // Interlace

  const ihdrChunk = createChunk('IHDR', ihdr);
  const idatChunk = createChunk('IDAT', deflated);
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function createChunk(type, data) {
  const length = data.length;
  const header = Buffer.alloc(8);
  header.writeUInt32BE(length, 0);
  header.write(type, 4, 4, 'ascii');

  const crcBuffer = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = crc32(crcBuffer);

  const footer = Buffer.alloc(4);
  footer.writeUInt32BE(crc >>> 0, 0);

  return Buffer.concat([header, data, footer]);
}

// CRC32 table
const crcTable = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// Drawing function for the volume icon (blue rounded badge with white speaker and soundwaves)
function drawIcon(x, y, w, h) {
  const nx = x / w;
  const ny = y / h;

  // Rounded corner squircle test
  const r = 0.22;
  const dx = Math.max(0, Math.abs(nx - 0.5) - (0.5 - r));
  const dy = Math.max(0, Math.abs(ny - 0.5) - (0.5 - r));
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist > r) {
    return [0, 0, 0, 0]; // Transparent outside
  }

  // Background Gradient: #2563eb to #1d4ed8
  let bgR = Math.round(37 + (29 - 37) * ny);
  let bgG = Math.round(99 + (78 - 99) * ny);
  let bgB = Math.round(235 + (216 - 235) * ny);

  // Anti-alias edge
  let alpha = 255;
  if (dist > r - (1.5 / w)) {
    alpha = Math.round(255 * (r - dist) / (1.5 / w));
  }

  // Speaker shape
  // Left rect: x: 0.22 to 0.35, y: 0.42 to 0.58
  const inSpeakerRect = nx >= 0.22 && nx <= 0.35 && ny >= 0.42 && ny <= 0.58;

  // Cone: from (0.35, 0.42) to (0.52, 0.30) and (0.35, 0.58) to (0.52, 0.70)
  let inCone = false;
  if (nx >= 0.34 && nx <= 0.52) {
    const progress = (nx - 0.34) / 0.18;
    const topY = 0.42 - 0.14 * progress;
    const botY = 0.58 + 0.14 * progress;
    if (ny >= topY && ny <= botY) {
      inCone = true;
    }
  }

  if (inSpeakerRect || inCone) {
    return [255, 255, 255, alpha];
  }

  // Sound Waves
  // Wave 1: arc center (0.42, 0.50), radius 0.22
  const cdx1 = nx - 0.42;
  const cdy1 = ny - 0.50;
  const d1 = Math.sqrt(cdx1 * cdx1 + cdy1 * cdy1);
  const ang1 = Math.atan2(cdy1, cdx1);
  if (d1 >= 0.20 && d1 <= 0.26 && Math.abs(ang1) <= 0.8) {
    return [240, 246, 255, alpha];
  }

  // Wave 2: radius 0.35
  const d2 = Math.sqrt(cdx1 * cdx1 + cdy1 * cdy1);
  if (d2 >= 0.31 && d2 <= 0.37 && Math.abs(ang1) <= 0.75) {
    return [191, 219, 254, alpha];
  }

  return [bgR, bgG, bgB, alpha];
}

const sizes = [16, 32, 48, 128];
const iconsDir = path.join(__dirname, '..', 'icons');

for (const size of sizes) {
  const png = createPNG(size, drawIcon);
  const filePath = path.join(iconsDir, `icon${size}.png`);
  fs.writeFileSync(filePath, png);
  console.log(`Generated ${filePath}`);
}

