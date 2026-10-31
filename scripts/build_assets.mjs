import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

// ============================================================================
// Pure Node.js Lossless RGBA PNG Decoder & Encoder (Zero External Dependencies)
// ============================================================================

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[n] = c >>> 0;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
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

function encodePNG(width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowOffset = y * (stride + 1);
    raw[rowOffset] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(
      raw,
      rowOffset + 1
    );
  }

  const compressed = zlib.deflateSync(raw, { level: 6 });
  return Buffer.concat([
    signature,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', compressed),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
}

function decodePNG(filePath) {
  const buf = fs.readFileSync(filePath);
  let offset = 8;
  let width = 0;
  let height = 0;
  const idat = [];
  while (offset < buf.length) {
    const len = buf.readUInt32BE(offset);
    const type = buf.toString('ascii', offset + 4, offset + 8);
    const data = buf.subarray(offset + 8, offset + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
    } else if (type === 'IDAT') {
      idat.push(data);
    }
    offset += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  const pixels = new Uint8Array(width * height * 4);
  const paeth = (a, b, c) => {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const rowStart = y * (stride + 1) + 1;
    const outStart = y * stride;
    for (let i = 0; i < stride; i++) {
      const x = raw[rowStart + i];
      const a = i >= 4 ? pixels[outStart + i - 4] : 0;
      const b = y > 0 ? pixels[outStart - stride + i] : 0;
      const c = i >= 4 && y > 0 ? pixels[outStart - stride + i - 4] : 0;
      let val = x;
      if (filter === 1) val = (x + a) & 255;
      else if (filter === 2) val = (x + b) & 255;
      else if (filter === 3) val = (x + ((a + b) >> 1)) & 255;
      else if (filter === 4) val = (x + paeth(a, b, c)) & 255;
      pixels[outStart + i] = val;
    }
  }
  return { width, height, pixels };
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function sampleBilinear(img, fx, fy) {
  const w = img.width;
  const h = img.height;
  const x0 = clamp(Math.floor(fx), 0, w - 1);
  const y0 = clamp(Math.floor(fy), 0, h - 1);
  const x1 = clamp(x0 + 1, 0, w - 1);
  const y1 = clamp(y0 + 1, 0, h - 1);
  const dx = clamp(fx - x0, 0, 1);
  const dy = clamp(fy - y0, 0, 1);

  const i00 = (y0 * w + x0) * 4;
  const i10 = (y0 * w + x1) * 4;
  const i01 = (y1 * w + x0) * 4;
  const i11 = (y1 * w + x1) * 4;

  const out = [0, 0, 0, 0];
  for (let c = 0; c < 4; c++) {
    const top = img.pixels[i00 + c] * (1 - dx) + img.pixels[i10 + c] * dx;
    const bot = img.pixels[i01 + c] * (1 - dx) + img.pixels[i11 + c] * dx;
    out[c] = Math.round(top * (1 - dy) + bot * dy);
  }
  return out;
}

/**
 * 1. BIOLUMINESCENT LUMINOUS MATTING (for Protagonist, Effects, Glowing Props):
 * Un-premultiplies the dark #070b12 studio background from soft golden/cyan halos
 * so there is ZERO muddy dark-brown fringe, while keeping the bright character
 * body AND the interior dark eye 100% opaque (alpha = 255).
 */
function extractBioluminescentSprite(
  masterImg,
  x0,
  y0,
  x1,
  y1,
  options = {}
) {
  const {
    bgRGB = [7, 11, 18],
    eyeZones = [{ ux: 0.64, uy: 0.52, rx: 0.14, ry: 0.18 }],
    solidLumThreshold = 155,
    glowLow = 12,
    glowScale = 165,
    edgeFeather = 5,
  } = options;

  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const out = new Uint8Array(w * h * 4);

  for (let y = 0; y < h; y++) {
    const v = y / h;
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const srcIdx = ((y0 + y) * masterImg.width + (x0 + x)) * 4;
      const dstIdx = (y * w + x) * 4;

      const r = masterImg.pixels[srcIdx];
      const g = masterImg.pixels[srcIdx + 1];
      const b = masterImg.pixels[srcIdx + 2];

      const dr = Math.max(0, r - bgRGB[0]);
      const dg = Math.max(0, g - bgRGB[1]);
      const db = Math.max(0, b - bgRGB[2]);
      const maxChannelDelta = Math.max(dr, dg, db);
      const dist = Math.hypot(dr, dg, db);

      // Check if pixel is inside a protected interior feature (e.g. Protagonist's expressive dark eye)
      let inProtectedEye = false;
      for (const ez of eyeZones) {
        const ex = (u - ez.ux) / ez.rx;
        const ey = (v - ez.uy) / ez.ry;
        if (ex * ex + ey * ey <= 1.0) {
          inProtectedEye = true;
          break;
        }
      }

      let alpha = 1.0;
      if (inProtectedEye) {
        alpha = 1.0;
      } else if (maxChannelDelta >= solidLumThreshold) {
        alpha = 1.0;
      } else if (dist <= glowLow) {
        alpha = 0.0;
      } else {
        alpha = clamp((dist - glowLow) / glowScale, 0, 1);
        // Smooth curve so bright filaments stay solid and outer dust fades gently
        alpha = Math.pow(alpha, 0.82);
      }

      if (edgeFeather > 0) {
        const borderDist = Math.min(x, w - 1 - x, y, h - 1 - y);
        if (borderDist < edgeFeather) {
          alpha *= borderDist / edgeFeather;
        }
      }

      const aByte = Math.round(clamp(alpha * 255, 0, 255));
      out[dstIdx + 3] = aByte;

      if (aByte === 255 || inProtectedEye) {
        out[dstIdx] = r;
        out[dstIdx + 1] = g;
        out[dstIdx + 2] = b;
      } else if (aByte > 0) {
        // True additive un-premultiplication of studio background (#070b12)
        const aNorm = Math.max(0.08, aByte / 255);
        out[dstIdx] = clamp(Math.round((r - bgRGB[0] * (1 - aNorm)) / aNorm), 0, 255);
        out[dstIdx + 1] = clamp(Math.round((g - bgRGB[1] * (1 - aNorm)) / aNorm), 0, 255);
        out[dstIdx + 2] = clamp(Math.round((b - bgRGB[2] * (1 - aNorm)) / aNorm), 0, 255);
      } else {
        out[dstIdx] = 0;
        out[dstIdx + 1] = 0;
        out[dstIdx + 2] = 0;
      }
    }
  }

  return { width: w, height: h, pixels: out };
}

/**
 * 2. SHADOW CREATURE MATTING:
 * The Shadow Creature has a pitch-black/obsidian-violet interior surrounded by a
 * glowing purple-magenta aura on a neutral slate (#070b12) background.
 * We detect the outer boundary of the purple-magenta aura per scanline/column and
 * keep everything inside the creature's silhouette 100% opaque obsidian-violet!
 */
function extractShadowCreatureSprite(masterImg, x0, y0, x1, y1, isDissolving = false) {
  const bgRGB = [7, 11, 18];
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const out = new Uint8Array(w * h * 4);

  // Measure purple/magenta energy or brightness deviation from neutral slate (7, 11, 18)
  const auraStrength = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const srcIdx = ((y0 + y) * masterImg.width + (x0 + x)) * 4;
      const r = masterImg.pixels[srcIdx];
      const g = masterImg.pixels[srcIdx + 1];
      const b = masterImg.pixels[srcIdx + 2];
      // Purple/magenta has elevated R and B relative to G, or darker obsidian interior
      const purpleTint = Math.max(0, r - 7) * 1.4 + Math.max(0, b - 18) * 1.2;
      const dist = Math.hypot(r - bgRGB[0], g - bgRGB[1], b - bgRGB[2]);
      auraStrength[y * w + x] = Math.max(purpleTint, dist);
    }
  }

  // BFS exterior flood-fill from borders, stopping as soon as auraStrength > 16
  // AND never penetrating inside the creature's central silhouette ellipse
  const exterior = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let qHead = 0;
  let qTail = 0;

  const tryEnqueue = (x, y) => {
    if (x < 0 || x >= w || y < 0 || y >= h) return;
    const idx = y * w + x;
    if (exterior[idx]) return;
    // Protect central body silhouette core unless dissolving
    if (!isDissolving) {
      const nx = (x / w - 0.54) / 0.28;
      const ny = (y / h - 0.54) / 0.34;
      if (nx * nx + ny * ny < 1.0) return;
    }
    if (auraStrength[idx] <= 18) {
      exterior[idx] = 1;
      queue[qTail++] = idx;
    }
  };

  for (let x = 0; x < w; x++) {
    tryEnqueue(x, 0);
    tryEnqueue(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    tryEnqueue(0, y);
    tryEnqueue(w - 1, y);
  }

  while (qHead < qTail) {
    const curr = queue[qHead++];
    const cx = curr % w;
    const cy = (curr - cx) / w;
    tryEnqueue(cx - 1, cy);
    tryEnqueue(cx + 1, cy);
    tryEnqueue(cx, cy - 1);
    tryEnqueue(cx, cy + 1);
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      const srcIdx = ((y0 + y) * masterImg.width + (x0 + x)) * 4;
      const dstIdx = idx * 4;
      const r = masterImg.pixels[srcIdx];
      const g = masterImg.pixels[srcIdx + 1];
      const b = masterImg.pixels[srcIdx + 2];

      let alpha = 1.0;
      if (exterior[idx]) {
        alpha = clamp((auraStrength[idx] - 8) / 28, 0, 0.5);
      } else if (isDissolving) {
        alpha = clamp((auraStrength[idx] - 10) / 75, 0, 1);
      } else {
        // Check if near exterior for smooth aura edge
        let minExtDist = 5;
        for (let dy = -4; dy <= 4; dy++) {
          for (let dx = -4; dx <= 4; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 0 && nx < w && ny >= 0 && ny < h && exterior[ny * w + nx]) {
              const d = Math.hypot(dx, dy);
              if (d < minExtDist) minExtDist = d;
            }
          }
        }
        if (minExtDist < 5) {
          alpha = clamp(minExtDist / 5, 0.25, 1.0);
        }
      }

      const borderDist = Math.min(x, w - 1 - x, y, h - 1 - y);
      if (borderDist < 4) {
        alpha *= borderDist / 4;
      }

      const aByte = Math.round(clamp(alpha * 255, 0, 255));
      out[dstIdx] = r;
      out[dstIdx + 1] = g;
      out[dstIdx + 2] = b;
      out[dstIdx + 3] = aByte;
    }
  }

  return { width: w, height: h, pixels: out };
}

/**
 * 3. SOLID ARCHITECTURAL / PROP MATTING (for Stone Platforms, Pillars, Arches, Trees):
 * Protects the interior structural shape of the stone platform/pillar/tree while
 * cleanly removing the #070b12 background around the silhouette.
 */
function extractSolidPropSprite(masterImg, x0, y0, x1, y1, shapeMaskFn) {
  const bgRGB = [7, 11, 18];
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const out = new Uint8Array(w * h * 4);

  for (let y = 0; y < h; y++) {
    const v = y / h;
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const srcIdx = ((y0 + y) * masterImg.width + (x0 + x)) * 4;
      const dstIdx = (y * w + x) * 4;
      const r = masterImg.pixels[srcIdx];
      const g = masterImg.pixels[srcIdx + 1];
      const b = masterImg.pixels[srcIdx + 2];

      const dist = Math.hypot(r - bgRGB[0], g - bgRGB[1], b - bgRGB[2]);
      const shapeFactor = shapeMaskFn ? shapeMaskFn(u, v, r, g, b, dist) : 1.0;

      let alpha = shapeFactor;
      if (shapeFactor < 0.99) {
        const colorAlpha = smoothstep(10, 42, dist);
        alpha = shapeFactor * Math.max(colorAlpha, 0.65);
      }

      const borderDist = Math.min(x, w - 1 - x, y, h - 1 - y);
      if (borderDist < 6) {
        alpha *= borderDist / 6;
      }

      const aByte = Math.round(clamp(alpha * 255, 0, 255));
      out[dstIdx] = r;
      out[dstIdx + 1] = g;
      out[dstIdx + 2] = b;
      out[dstIdx + 3] = aByte;
    }
  }

  return { width: w, height: h, pixels: out };
}

function renderArticulatedFrame(srcSprite, frameSize, warpFn, overlayFn) {
  const out = new Uint8Array(frameSize * frameSize * 4);
  const scale = Math.min(
    (frameSize * 0.86) / srcSprite.width,
    (frameSize * 0.86) / srcSprite.height
  );
  const dstW = srcSprite.width * scale;
  const dstH = srcSprite.height * scale;
  const offsetX = (frameSize - dstW) * 0.5;
  const offsetY = (frameSize - dstH) * 0.54;

  for (let y = 0; y < frameSize; y++) {
    for (let x = 0; x < frameSize; x++) {
      const u = (x - offsetX) / dstW;
      const v = (y - offsetY) / dstH;

      const delta = warpFn
        ? warpFn(u, v)
        : { du: 0, dv: 0, alphaMult: 1, tint: null };
      const su = (u - delta.du) * srcSprite.width;
      const sv = (v - delta.dv) * srcSprite.height;

      if (
        su < 0 ||
        su >= srcSprite.width - 1 ||
        sv < 0 ||
        sv >= srcSprite.height - 1
      ) {
        continue;
      }

      const rgba = sampleBilinear(srcSprite, su, sv);
      if (rgba[3] === 0) continue;

      const dstIdx = (y * frameSize + x) * 4;
      let r = rgba[0];
      let g = rgba[1];
      let b = rgba[2];
      let a = rgba[3] * (delta.alphaMult ?? 1);

      if (delta.tint) {
        const [tr, tg, tb, strength] = delta.tint;
        r = Math.round(r * (1 - strength) + tr * strength);
        g = Math.round(g * (1 - strength) + tg * strength);
        b = Math.round(b * (1 - strength) + tb * strength);
      }

      out[dstIdx] = clamp(r, 0, 255);
      out[dstIdx + 1] = clamp(g, 0, 255);
      out[dstIdx + 2] = clamp(b, 0, 255);
      out[dstIdx + 3] = clamp(Math.round(a), 0, 255);
    }
  }

  if (overlayFn) {
    overlayFn(out, frameSize);
  }

  return { width: frameSize, height: frameSize, pixels: out };
}

function drawGlowingDot(pixels, size, cx, cy, radius, r, g, b, maxAlpha = 255) {
  const x0 = Math.max(0, Math.floor(cx - radius));
  const x1 = Math.min(size - 1, Math.ceil(cx + radius));
  const y0 = Math.max(0, Math.floor(cy - radius));
  const y1 = Math.min(size - 1, Math.ceil(cy + radius));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dist = Math.hypot(x - cx, y - cy);
      if (dist > radius) continue;
      const falloff = Math.pow(1 - dist / radius, 1.6);
      const addA = Math.round(maxAlpha * falloff);
      if (addA <= 0) continue;
      const idx = (y * size + x) * 4;
      const curA = pixels[idx + 3];
      const blend = addA / 255;
      pixels[idx] = clamp(Math.round(pixels[idx] * (1 - blend) + r * blend), 0, 255);
      pixels[idx + 1] = clamp(
        Math.round(pixels[idx + 1] * (1 - blend) + g * blend),
        0,
        255
      );
      pixels[idx + 2] = clamp(
        Math.round(pixels[idx + 2] * (1 - blend) + b * blend),
        0,
        255
      );
      pixels[idx + 3] = clamp(Math.max(curA, addA), 0, 255);
    }
  }
}

function packHorizontalSpritesheet(frames) {
  const frameSize = frames[0].width;
  const count = frames.length;
  const totalW = frameSize * count;
  const totalH = frames[0].height;
  const out = new Uint8Array(totalW * totalH * 4);

  for (let f = 0; f < count; f++) {
    const src = frames[f].pixels;
    for (let y = 0; y < totalH; y++) {
      const srcRow = y * frameSize * 4;
      const dstRow = (y * totalW + f * frameSize) * 4;
      out.set(src.subarray(srcRow, srcRow + frameSize * 4), dstRow);
    }
  }
  return {
    width: totalW,
    height: totalH,
    frameWidth: frameSize,
    frameHeight: totalH,
    frameCount: count,
    pixels: out,
  };
}

function savePNG(relPath, imgObj, manifestList, category, extraMeta = {}) {
  const fullPath = path.resolve(process.cwd(), 'public', relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  const buf = encodePNG(imgObj.width, imgObj.height, imgObj.pixels);
  fs.writeFileSync(fullPath, buf);

  const godotRel = relPath.replace(/^assets\//, '');
  const godotPath = path.resolve(process.cwd(), 'godot_project/assets', godotRel);
  fs.mkdirSync(path.dirname(godotPath), { recursive: true });
  fs.writeFileSync(godotPath, buf);

  let transparentPixels = 0;
  let opaquePixels = 0;
  const totalPixels = imgObj.width * imgObj.height;
  for (let i = 3; i < imgObj.pixels.length; i += 4) {
    if (imgObj.pixels[i] === 0) transparentPixels++;
    else if (imgObj.pixels[i] >= 240) opaquePixels++;
  }

  manifestList.push({
    path: `/${relPath}`,
    godotPath: `res://assets/${godotRel}`,
    category,
    width: imgObj.width,
    height: imgObj.height,
    bytes: buf.length,
    format: 'PNG (RGBA 8-bit)',
    transparentRatio: Number((transparentPixels / totalPixels).toFixed(3)),
    opaqueRatio: Number((opaquePixels / totalPixels).toFixed(3)),
    ...extraMeta,
  });
}

// ============================================================================
// Execute Refined Asset Pipeline
// ============================================================================

console.log('Running refined asset extraction & alpha matting pipeline...');
const master = decodePNG(
  path.resolve(
    process.cwd(),
    'public/assets/aistudio/Luce_contro_Tenebre__Concept_Art_Sheet_f741623c.png'
  )
);

const manifest = [];
const FRAME_SIZE = 128;

// 1. PROTAGONIST — True Frame-by-Frame Articulated Bioluminescent Character Renderer (Zero Box Artifacts, Pure RGBA)
function lerp(a, b, t) {
  return a + (b - a) * t;
}

function blendPixel(pixels, size, x, y, r, g, b, a) {
  if (x < 0 || x >= size || y < 0 || y >= size || a <= 0) return;
  const idx = (y * size + x) * 4;
  const srcA = clamp(a / 255, 0, 1);
  const dstA = pixels[idx + 3] / 255;
  const outA = srcA + dstA * (1 - srcA);
  if (outA <= 0.0001) return;
  pixels[idx] = Math.round((r * srcA + pixels[idx] * dstA * (1 - srcA)) / outA);
  pixels[idx + 1] = Math.round((g * srcA + pixels[idx + 1] * dstA * (1 - srcA)) / outA);
  pixels[idx + 2] = Math.round((b * srcA + pixels[idx + 2] * dstA * (1 - srcA)) / outA);
  pixels[idx + 3] = Math.round(clamp(outA * 255, 0, 255));
}

function addGlowPixel(pixels, size, x, y, r, g, b, a) {
  // PNG uses un-premultiplied RGBA: never multiply RGB by alpha when writing to transparent pixels!
  blendPixel(pixels, size, x, y, r, g, b, a);
}

function drawSoftRadialGlow(pixels, size, cx, cy, radius, r, g, b, maxAlpha) {
  const x0 = Math.max(2, Math.floor(cx - radius));
  const x1 = Math.min(size - 3, Math.ceil(cx + radius));
  const y0 = Math.max(2, Math.floor(cy - radius));
  const y1 = Math.min(size - 3, Math.ceil(cy + radius));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x - cx, y - cy) / radius;
      if (d >= 1) continue;
      // Guarantee strict zero alpha near frame edges (margin >= 6px)
      const edgeMargin = Math.min(x, size - 1 - x, y, size - 1 - y);
      const edgeFade = clamp((edgeMargin - 3) / 10, 0, 1);
      const falloff = Math.pow(1 - d, 2.3) * edgeFade;
      addGlowPixel(pixels, size, x, y, r, g, b, maxAlpha * falloff);
    }
  }
}

function drawShadedEllipse(pixels, size, cx, cy, rx, ry, rotRad, style) {
  const cosR = Math.cos(-rotRad);
  const sinR = Math.sin(-rotRad);
  const pad = Math.ceil(Math.max(rx, ry) + 4);
  const x0 = Math.max(2, Math.floor(cx - pad));
  const x1 = Math.min(size - 3, Math.ceil(cx + pad));
  const y0 = Math.max(2, Math.floor(cy - pad));
  const y1 = Math.min(size - 3, Math.ceil(cy + pad));

  const coreR = style.coreColor[0], coreG = style.coreColor[1], coreB = style.coreColor[2];
  const shadeR = style.shadeColor[0], shadeG = style.shadeColor[1], shadeB = style.shadeColor[2];
  const rimR = style.rimColor[0], rimG = style.rimColor[1], rimB = style.rimColor[2];
  const alphaMult = style.alpha ?? 1;

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const lx = (dx * cosR - dy * sinR) / rx;
      const ly = (dx * sinR + dy * cosR) / ry;
      const dist = Math.hypot(lx, ly);
      if (dist > 1.08) continue;

      const aa = clamp((1.06 - dist) / 0.14, 0, 1);
      // Directional lighting from top-right-front + warm golden rim at edges
      const lightDot = clamp((lx * 0.55 - ly * 0.45 + 0.55), 0, 1);
      const rimFactor = Math.pow(clamp(dist, 0, 1), 2.3);

      let r = lerp(shadeR, coreR, lightDot);
      let g = lerp(shadeG, coreG, lightDot);
      let b = lerp(shadeB, coreB, lightDot);

      r = lerp(r, rimR, rimFactor * 0.62);
      g = lerp(g, rimG, rimFactor * 0.62);
      b = lerp(b, rimB, rimFactor * 0.62);

      blendPixel(pixels, size, x, y, r, g, b, Math.round(255 * aa * alphaMult));
    }
  }
}

function drawTaperedCapsule(pixels, size, x0, y0, r0, x1, y1, r1, style) {
  const minX = Math.max(2, Math.floor(Math.min(x0 - r0, x1 - r1) - 3));
  const maxX = Math.min(size - 3, Math.ceil(Math.max(x0 + r0, x1 + r1) + 3));
  const minY = Math.max(2, Math.floor(Math.min(y0 - r0, y1 - r1) - 3));
  const maxY = Math.min(size - 3, Math.ceil(Math.max(y0 + r0, y1 + r1) + 3));
  const vx = x1 - x0;
  const vy = y1 - y0;
  const lenSq = Math.max(0.001, vx * vx + vy * vy);
  const alphaMult = style.alpha ?? 1;

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const t = clamp(((x - x0) * vx + (y - y0) * vy) / lenSq, 0, 1);
      const px = x0 + vx * t;
      const py = y0 + vy * t;
      const rad = Math.max(0.6, lerp(r0, r1, t));
      const d = Math.hypot(x - px, y - py) / rad;
      if (d > 1.15) continue;

      const aa = clamp((1.12 - d) / 0.25, 0, 1);
      const light = clamp(1 - d * 0.5, 0, 1);
      const r = lerp(style.shadeColor[0], style.coreColor[0], light);
      const g = lerp(style.shadeColor[1], style.coreColor[1], light);
      const b = lerp(style.shadeColor[2], style.coreColor[2], light);
      blendPixel(pixels, size, x, y, r, g, b, Math.round(255 * aa * alphaMult));
    }
  }
}

function drawCubicRibbon(pixels, size, p0, p1, p2, p3, rStart, rEnd, colorRoot, colorMid, colorTip, glowColor, alphaMult = 1) {
  const steps = 48;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const mt = 1 - t;
    const x = mt * mt * mt * p0[0] + 3 * mt * mt * t * p1[0] + 3 * mt * t * t * p2[0] + t * t * t * p3[0];
    const y = mt * mt * mt * p0[1] + 3 * mt * mt * t * p1[1] + 3 * mt * t * t * p2[1] + t * t * t * p3[1];
    const rad = Math.max(0.85, lerp(rStart, rEnd, Math.pow(t, 0.8)));

    const c0 = t < 0.5 ? colorRoot : colorMid;
    const c1 = t < 0.5 ? colorMid : colorTip;
    const lt = t < 0.5 ? t * 2 : (t - 0.5) * 2;
    const cr = lerp(c0[0], c1[0], lt);
    const cg = lerp(c0[1], c1[1], lt);
    const cb = lerp(c0[2], c1[2], lt);

    // Outer bioluminescent golden/cyan halo
    drawSoftRadialGlow(pixels, size, x, y, rad * 2.2, glowColor[0], glowColor[1], glowColor[2], 24 * alphaMult * (1 - t * 0.4));

    // Solid ribbon core
    const pad = Math.ceil(rad + 2);
    const x0 = Math.max(2, Math.floor(x - pad));
    const x1 = Math.min(size - 3, Math.ceil(x + pad));
    const y0 = Math.max(2, Math.floor(y - pad));
    const y1 = Math.min(size - 3, Math.ceil(y + pad));
    for (let py = y0; py <= y1; py++) {
      for (let px = x0; px <= x1; px++) {
        const d = Math.hypot(px - x, py - y) / rad;
        if (d > 1.12) continue;
        const aa = clamp((1.1 - d) / 0.28, 0, 1);
        const coreBoost = Math.pow(clamp(1 - d, 0, 1), 1.6) * 0.4;
        const rr = clamp(Math.round(lerp(cr, 255, coreBoost)), 0, 255);
        const gg = clamp(Math.round(lerp(cg, 255, coreBoost)), 0, 255);
        const bb = clamp(Math.round(lerp(cb, 245, coreBoost)), 0, 255);
        blendPixel(pixels, size, px, py, rr, gg, bb, Math.round(255 * aa * alphaMult * (1 - t * 0.08)));
      }
    }
  }
}

function renderProtagonistArticulatedPose(pose) {
  const size = FRAME_SIZE;
  const pixels = new Uint8Array(size * size * 4);

  const alpha = pose.alpha ?? 1;
  const bodyX = 64 + (pose.offsetX ?? 0);
  const bodyY = 85 + (pose.offsetY ?? 0);
  const lean = pose.leanRad ?? 0;
  const torsoScaleX = pose.torsoScaleX ?? 1;
  const torsoScaleY = pose.torsoScaleY ?? 1;
  const isHurt = Boolean(pose.isHurt);

  const frontStyle = isHurt
    ? { coreColor: [255, 244, 246], shadeColor: [254, 202, 212], rimColor: [251, 113, 133], alpha }
    : { coreColor: [255, 255, 252], shadeColor: [245, 238, 220], rimColor: [254, 240, 138], alpha };

  const backLimbStyle = isHurt
    ? { coreColor: [253, 215, 222], shadeColor: [244, 114, 140], rimColor: [251, 113, 133], alpha }
    : { coreColor: [242, 234, 214], shadeColor: [216, 204, 182], rimColor: [253, 224, 71], alpha };

  const filRoot = isHurt ? [255, 240, 242] : [255, 254, 240];
  const filMid = isHurt ? [251, 113, 133] : [253, 224, 71];
  const filTip = isHurt ? [225, 29, 72] : [245, 158, 11];
  const filGlow = isHurt ? [244, 63, 94] : [253, 224, 71];

  const tailRoot = isHurt ? [224, 242, 254] : [224, 247, 255];
  const tailMid = isHurt ? [125, 211, 252] : [56, 189, 248];
  const tailTip = isHurt ? [14, 165, 233] : [2, 132, 199];
  const tailGlow = [56, 189, 248];

  // 1. Pure Warm Golden Bioluminescent Aura (un-premultiplied RGBA, strictly zero at borders)
  if (alpha > 0.08) {
    drawSoftRadialGlow(
      pixels,
      size,
      bodyX - 2,
      bodyY - 12,
      44,
      isHurt ? 251 : 254,
      isHurt ? 113 : 240,
      isHurt ? 133 : 138,
      (pose.auraStrength ?? 44) * alpha
    );
  }

  if (alpha > 0.04) {
    const hipX = bodyX - Math.sin(lean) * 2.5;
    const hipY = bodyY + 8;
    const shoulderX = bodyX + Math.sin(lean) * 6;
    const shoulderY = bodyY - 5;
    const headX = bodyX + Math.sin(lean) * 11 + (pose.headOffsetX ?? 0);
    const headY = bodyY - 21 + (pose.headOffsetY ?? 0);
    const headPitch = (pose.headPitchRad ?? 0) + lean * 0.4;

    // 2. Ethereal Cyan-Blue Bifurcated Tail (behind body)
    const tailBaseX = hipX - 8;
    const tailBaseY = hipY - 2;
    const tailAngle = pose.tailAngleRad ?? 0.1;
    const tailWave = pose.tailWave ?? 0;
    const cosT = Math.cos(tailAngle);
    const sinT = Math.sin(tailAngle);
    const rotTail = (dx, dy) => [
      tailBaseX + dx * cosT - dy * sinT,
      tailBaseY + dx * sinT + dy * cosT,
    ];

    // Upper cyan tail wisp
    drawCubicRibbon(
      pixels,
      size,
      [tailBaseX, tailBaseY],
      rotTail(-11, -3 + tailWave * 4),
      rotTail(-22, 3 - tailWave * 5),
      rotTail(-31, -4 + tailWave * 6),
      4.5,
      1.1,
      tailRoot,
      tailMid,
      tailTip,
      tailGlow,
      alpha
    );
    // Lower cyan tail wisp
    drawCubicRibbon(
      pixels,
      size,
      [tailBaseX, tailBaseY + 2],
      rotTail(-9, 5 + tailWave * 3),
      rotTail(-18, 9 - tailWave * 4),
      rotTail(-26, 5 + tailWave * 5),
      3.7,
      0.9,
      tailRoot,
      tailMid,
      tailTip,
      tailGlow,
      alpha * 0.92
    );

    // 3. Back Leg & Back Arm (shaded warm cream for clear limb separation)
    const backLeg = pose.backLeg ?? { hipAngle: -0.3, kneeAngle: 0.4, len1: 9.2, len2: 9.2 };
    const l1B = Math.min(9.2, backLeg.len1);
    const l2B = Math.min(9.2, backLeg.len2);
    const bKneeX = hipX - 2 + Math.sin(backLeg.hipAngle) * l1B;
    const bKneeY = hipY + Math.cos(backLeg.hipAngle) * l1B;
    const bFootX = bKneeX + Math.sin(backLeg.hipAngle + backLeg.kneeAngle) * l2B;
    const bFootY = Math.min(112, bKneeY + Math.cos(backLeg.hipAngle + backLeg.kneeAngle) * l2B);
    drawTaperedCapsule(pixels, size, hipX - 2, hipY, 4.6, bKneeX, bKneeY, 3.4, backLimbStyle);
    drawTaperedCapsule(pixels, size, bKneeX, bKneeY, 3.3, bFootX, bFootY, 2.3, backLimbStyle);
    drawShadedEllipse(pixels, size, bFootX + 1.4, bFootY, 3.0, 1.9, 0, backLimbStyle);

    const backArm = pose.backArm ?? { shoulderAngle: -0.5, elbowAngle: 0.4, len1: 7.5, len2: 6.5 };
    const bElbowX = shoulderX - 3 + Math.sin(backArm.shoulderAngle) * backArm.len1;
    const bElbowY = shoulderY + Math.cos(backArm.shoulderAngle) * backArm.len1;
    const bHandX = bElbowX + Math.sin(backArm.shoulderAngle + backArm.elbowAngle) * backArm.len2;
    const bHandY = bElbowY + Math.cos(backArm.shoulderAngle + backArm.elbowAngle) * backArm.len2;
    drawTaperedCapsule(pixels, size, shoulderX - 3, shoulderY, 3.2, bElbowX, bElbowY, 2.5, backLimbStyle);
    drawTaperedCapsule(pixels, size, bElbowX, bElbowY, 2.4, bHandX, bHandY, 1.9, backLimbStyle);

    // 4. Lower & Middle Head Filaments (drawn behind head for 3D depth)
    const filAngle = pose.filamentAngleRad ?? 0;
    const filWave = pose.filamentWave ?? 0;
    const cosF = Math.cos(filAngle);
    const sinF = Math.sin(filAngle);
    const rotFil = (ox, oy, dx, dy) => [
      ox + dx * cosF - dy * sinF,
      oy + dx * sinF + dy * cosF,
    ];

    // Lower filament (3rd golden plume)
    const f3Origin = [headX - 10, headY + 4];
    drawCubicRibbon(
      pixels,
      size,
      f3Origin,
      rotFil(f3Origin[0], f3Origin[1], -15, 1 + Math.sin(filWave + 2.1) * 4.5),
      rotFil(f3Origin[0], f3Origin[1], -30, 8 + Math.cos(filWave + 2.1) * 5.5),
      rotFil(f3Origin[0], f3Origin[1], -44, 4 + Math.sin(filWave + 1.2) * 6.5),
      4.0,
      1.0,
      filRoot,
      filMid,
      filTip,
      filGlow,
      alpha
    );

    // Middle filament (2nd golden plume)
    const f2Origin = [headX - 8, headY - 3];
    drawCubicRibbon(
      pixels,
      size,
      f2Origin,
      rotFil(f2Origin[0], f2Origin[1], -16, -4 + Math.sin(filWave + 1.0) * 4.5),
      rotFil(f2Origin[0], f2Origin[1], -33, 2 + Math.cos(filWave + 1.0) * 5.5),
      rotFil(f2Origin[0], f2Origin[1], -48, -2 + Math.sin(filWave + 0.3) * 6.5),
      4.4,
      1.1,
      filRoot,
      filMid,
      filTip,
      filGlow,
      alpha
    );

    // 5. Torso & Radiant Heart Core
    drawShadedEllipse(
      pixels,
      size,
      bodyX,
      bodyY,
      11.2 * torsoScaleX,
      12.8 * torsoScaleY,
      lean,
      frontStyle
    );
    // Warm golden chest luminescence
    drawSoftRadialGlow(
      pixels,
      size,
      bodyX + 3,
      bodyY - 2,
      10,
      254,
      240,
      138,
      90 * alpha
    );

    // 6. Head (Cute rounded pearlescent head with gentle snout contour)
    drawShadedEllipse(
      pixels,
      size,
      headX,
      headY,
      17.4,
      14.8,
      headPitch,
      frontStyle
    );
    // Subtle cheek/snout forward contour
    drawShadedEllipse(
      pixels,
      size,
      headX + 7.2,
      headY + 2.4,
      10.2,
      8.8,
      headPitch * 0.8,
      frontStyle
    );

    // 7. Top Crown Golden Filament (sweeping over brow/crown)
    const f1Origin = [headX - 3, headY - 10];
    drawCubicRibbon(
      pixels,
      size,
      f1Origin,
      rotFil(f1Origin[0], f1Origin[1], -16, -10 + Math.sin(filWave) * 4.2),
      rotFil(f1Origin[0], f1Origin[1], -34, -5 + Math.cos(filWave) * 5.2),
      rotFil(f1Origin[0], f1Origin[1], -49, -9 + Math.sin(filWave - 0.7) * 6.2),
      4.8,
      1.15,
      filRoot,
      filMid,
      filTip,
      filGlow,
      alpha
    );

    // 8. Large Expressive Dark Eye (with glossy white & cyan specular highlights)
    const eyeX = headX + 7.0;
    const eyeY = headY + 0.8;
    const eyeSquint = pose.eyeSquint ?? 0; // 0 = open, 0.55 = squinted
    const eyeRy = Math.max(1.8, 6.1 * (1 - eyeSquint));
    const eyeRx = 4.6;

    // Main Expressive Eye
    drawShadedEllipse(
      pixels,
      size,
      eyeX,
      eyeY,
      eyeRx,
      eyeRy,
      headPitch - 0.06,
      {
        coreColor: [18, 26, 52],
        shadeColor: [5, 8, 18],
        rimColor: [56, 189, 248],
        alpha,
      }
    );

    // Crisp White Specular Highlight + Soft Cyan Lower Iris Reflection
    if (eyeSquint < 0.45) {
      drawShadedEllipse(
        pixels,
        size,
        eyeX - 1.3,
        eyeY - 1.9,
        1.7,
        1.9,
        0,
        {
          coreColor: [255, 255, 255],
          shadeColor: [255, 255, 255],
          rimColor: [255, 255, 255],
          alpha,
        }
      );
      drawShadedEllipse(
        pixels,
        size,
        eyeX + 1.4,
        eyeY + 2.0,
        1.0,
        1.0,
        0,
        {
          coreColor: [125, 211, 252],
          shadeColor: [56, 189, 248],
          rimColor: [186, 230, 253],
          alpha: alpha * 0.85,
        }
      );
    }

    // 9. Front Leg & Front Arm (Foreground Articulated Limbs)
    const frontLeg = pose.frontLeg ?? { hipAngle: 0.25, kneeAngle: 0.2, len1: 9.2, len2: 9.2 };
    const l1F = Math.min(9.2, frontLeg.len1);
    const l2F = Math.min(9.2, frontLeg.len2);
    const fKneeX = hipX + 2 + Math.sin(frontLeg.hipAngle) * l1F;
    const fKneeY = hipY + Math.cos(frontLeg.hipAngle) * l1F;
    const fFootX = fKneeX + Math.sin(frontLeg.hipAngle + frontLeg.kneeAngle) * l2F;
    const fFootY = Math.min(112, fKneeY + Math.cos(frontLeg.hipAngle + frontLeg.kneeAngle) * l2F);
    drawTaperedCapsule(pixels, size, hipX + 2, hipY, 4.9, fKneeX, fKneeY, 3.6, frontStyle);
    drawTaperedCapsule(pixels, size, fKneeX, fKneeY, 3.5, fFootX, fFootY, 2.4, frontStyle);
    drawShadedEllipse(pixels, size, fFootX + 1.6, fFootY, 3.3, 2.1, 0, frontStyle);

    const frontArm = pose.frontArm ?? { shoulderAngle: 0.35, elbowAngle: 0.35, len1: 8.0, len2: 7.0 };
    const fElbowX = shoulderX + 2 + Math.sin(frontArm.shoulderAngle) * frontArm.len1;
    const fElbowY = shoulderY + Math.cos(frontArm.shoulderAngle) * frontArm.len1;
    const fHandX = fElbowX + Math.sin(frontArm.shoulderAngle + frontArm.elbowAngle) * frontArm.len2;
    const fHandY = fElbowY + Math.cos(frontArm.shoulderAngle + frontArm.elbowAngle) * frontArm.len2;
    drawTaperedCapsule(pixels, size, shoulderX + 2, shoulderY, 3.5, fElbowX, fElbowY, 2.7, frontStyle);
    drawTaperedCapsule(pixels, size, fElbowX, fElbowY, 2.6, fHandX, fHandY, 2.1, frontStyle);
  }

  if (pose.overlayFn) {
    pose.overlayFn(pixels, size);
  }

  return { width: size, height: size, pixels };
}

// 1A. IDLE (8 frames — natural breathing, independent filament waves, soft tail sway, feet planted at y=112)
{
  const frames = [];
  for (let f = 0; f < 8; f++) {
    const phase = (f / 8) * Math.PI * 2;
    const breath = Math.sin(phase);
    frames.push(
      renderProtagonistArticulatedPose({
        offsetX: 0,
        offsetY: breath * -1.8,
        leanRad: 0.04 + Math.sin(phase - 0.5) * 0.025,
        torsoScaleX: 1 + breath * 0.04,
        torsoScaleY: 1 - breath * 0.03,
        headOffsetY: breath * -1.2,
        headPitchRad: Math.sin(phase - 0.4) * 0.04,
        filamentAngleRad: Math.sin(phase - 0.6) * 0.06,
        filamentWave: phase,
        tailAngleRad: Math.cos(phase) * 0.09,
        tailWave: Math.sin(phase),
        auraStrength: 50 + breath * 10,
        frontLeg: { hipAngle: 0.16, kneeAngle: 0.08 - breath * 0.08, len1: 10.5, len2: 10.5 },
        backLeg: { hipAngle: -0.22, kneeAngle: 0.14 - breath * 0.08, len1: 10.5, len2: 10.5 },
        frontArm: { shoulderAngle: 0.25 + breath * 0.08, elbowAngle: 0.45, len1: 8, len2: 7 },
        backArm: { shoulderAngle: -0.35 - breath * 0.06, elbowAngle: 0.35, len1: 7.5, len2: 6.5 },
      })
    );
  }
  savePNG(
    'assets/characters/protagonist/idle/spritesheet.png',
    packHorizontalSpritesheet(frames),
    manifest,
    'protagonist',
    { animation: 'idle', frameCount: 8, frameWidth: 128, frameHeight: 128, anchor: { x: 64, y: 112 } }
  );
}

// 1B. RUN (8 frames — full Contact -> Down -> Pass -> Up bipedal stride cycle with alternating limbs)
{
  const frames = [];
  // 8-phase stride angles for right (front) and left (back) legs
  const legKeyframes = [
    { hip: 0.68, knee: -0.15 },  // 0: Forward Contact
    { hip: 0.38, knee: -0.52 },  // 1: Down (Weight bearing knee bend)
    { hip: -0.05, knee: -0.65 }, // 2: Passing under hip
    { hip: -0.58, knee: -0.22 }, // 3: Back Push-off extension
    { hip: -0.72, knee: -0.78 }, // 4: Back toe-off lift
    { hip: -0.28, knee: -1.15 }, // 5: High recovery swing
    { hip: 0.28, knee: -0.85 },  // 6: Forward knee drive (Up peak)
    { hip: 0.62, knee: -0.35 },  // 7: Reaching for contact
  ];
  const bodyBobY = [0, 2.4, 0.5, -2.8, 0, 2.4, 0.5, -2.8];

  for (let f = 0; f < 8; f++) {
    const phase = (f / 8) * Math.PI * 2;
    const frontK = legKeyframes[f];
    const backK = legKeyframes[(f + 4) % 8];
    const armSwing = Math.cos(phase);

    frames.push(
      renderProtagonistArticulatedPose({
        offsetX: 1,
        offsetY: bodyBobY[f],
        leanRad: 0.24 + Math.sin(phase * 2) * 0.04,
        torsoScaleX: 1.02,
        torsoScaleY: 0.98,
        headOffsetX: 2.2,
        headOffsetY: bodyBobY[f] * 0.35,
        headPitchRad: -0.06 + Math.sin(phase * 2) * 0.04,
        filamentAngleRad: -0.16 + Math.sin(phase * 2) * 0.07,
        filamentWave: phase * 2,
        tailAngleRad: 0.14 + Math.cos(phase * 2) * 0.1,
        tailWave: Math.sin(phase * 2),
        auraStrength: 58,
        frontLeg: { hipAngle: frontK.hip, kneeAngle: frontK.knee, len1: 10.8, len2: 10.8 },
        backLeg: { hipAngle: backK.hip, kneeAngle: backK.knee, len1: 10.8, len2: 10.8 },
        frontArm: { shoulderAngle: -armSwing * 0.65 + 0.2, elbowAngle: 0.75, len1: 8, len2: 7 },
        backArm: { shoulderAngle: armSwing * 0.65 + 0.2, elbowAngle: 0.75, len1: 7.5, len2: 6.5 },
      })
    );
  }
  savePNG(
    'assets/characters/protagonist/run/spritesheet.png',
    packHorizontalSpritesheet(frames),
    manifest,
    'protagonist',
    { animation: 'run', frameCount: 8, frameWidth: 128, frameHeight: 128, anchor: { x: 64, y: 112 } }
  );
}

// 1C. JUMP (6 frames — crouch takeoff -> upward body stretch -> trailing filaments -> apex transition)
{
  const frames = [];
  const jumpPresets = [
    // Frame 0: Takeoff compression crouch
    {
      offsetY: 4.5,
      leanRad: 0.22,
      torsoScaleX: 1.12,
      torsoScaleY: 0.88,
      headOffsetY: 2.5,
      headPitchRad: -0.18,
      filamentAngleRad: 0.12,
      tailAngleRad: -0.15,
      frontLeg: { hipAngle: 0.55, kneeAngle: -1.05, len1: 10, len2: 10 },
      backLeg: { hipAngle: -0.15, kneeAngle: -0.95, len1: 10, len2: 10 },
      frontArm: { shoulderAngle: -0.65, elbowAngle: 0.5, len1: 8, len2: 7 },
      backArm: { shoulderAngle: -0.85, elbowAngle: 0.4, len1: 7.5, len2: 6.5 },
    },
    // Frame 1: Explosive upward launch extension
    {
      offsetY: -5.0,
      leanRad: 0.14,
      torsoScaleX: 0.9,
      torsoScaleY: 1.14,
      headOffsetY: -2.5,
      headPitchRad: -0.24,
      filamentAngleRad: -0.38,
      tailAngleRad: -0.45,
      frontLeg: { hipAngle: -0.18, kneeAngle: -0.12, len1: 11.5, len2: 11.5 },
      backLeg: { hipAngle: -0.42, kneeAngle: -0.18, len1: 11.5, len2: 11.5 },
      frontArm: { shoulderAngle: 0.95, elbowAngle: 0.35, len1: 8.5, len2: 7.5 },
      backArm: { shoulderAngle: 0.65, elbowAngle: 0.35, len1: 8, len2: 7 },
    },
    // Frame 2: Rising fast — front knee tucked high, back leg extended down, filaments trailing down
    {
      offsetY: -8.0,
      leanRad: 0.16,
      torsoScaleX: 0.93,
      torsoScaleY: 1.09,
      headOffsetY: -2.0,
      headPitchRad: -0.2,
      filamentAngleRad: -0.46,
      tailAngleRad: -0.52,
      frontLeg: { hipAngle: 0.78, kneeAngle: -1.1, len1: 10.5, len2: 10.5 },
      backLeg: { hipAngle: -0.45, kneeAngle: -0.25, len1: 11, len2: 11 },
      frontArm: { shoulderAngle: 0.85, elbowAngle: 0.45, len1: 8.5, len2: 7.5 },
      backArm: { shoulderAngle: 0.35, elbowAngle: 0.55, len1: 8, len2: 7 },
    },
    // Frame 3: Mid-high ascent
    {
      offsetY: -9.5,
      leanRad: 0.14,
      torsoScaleX: 0.96,
      torsoScaleY: 1.05,
      headOffsetY: -1.5,
      headPitchRad: -0.14,
      filamentAngleRad: -0.36,
      tailAngleRad: -0.4,
      frontLeg: { hipAngle: 0.68, kneeAngle: -0.95, len1: 10.5, len2: 10.5 },
      backLeg: { hipAngle: -0.35, kneeAngle: -0.45, len1: 10.8, len2: 10.8 },
      frontArm: { shoulderAngle: 0.65, elbowAngle: 0.55, len1: 8, len2: 7 },
      backArm: { shoulderAngle: 0.15, elbowAngle: 0.6, len1: 7.5, len2: 6.5 },
    },
    // Frame 4: Approaching apex
    {
      offsetY: -9.0,
      leanRad: 0.1,
      torsoScaleX: 1.0,
      torsoScaleY: 1.0,
      headOffsetY: -0.8,
      headPitchRad: -0.04,
      filamentAngleRad: -0.18,
      tailAngleRad: -0.2,
      frontLeg: { hipAngle: 0.48, kneeAngle: -0.75, len1: 10.5, len2: 10.5 },
      backLeg: { hipAngle: -0.25, kneeAngle: -0.55, len1: 10.5, len2: 10.5 },
      frontArm: { shoulderAngle: 0.45, elbowAngle: 0.5, len1: 8, len2: 7 },
      backArm: { shoulderAngle: -0.1, elbowAngle: 0.5, len1: 7.5, len2: 6.5 },
    },
    // Frame 5: Apex hover (smooth handoff to FALL)
    {
      offsetY: -7.5,
      leanRad: 0.08,
      torsoScaleX: 1.02,
      torsoScaleY: 0.98,
      headOffsetY: 0,
      headPitchRad: 0.06,
      filamentAngleRad: 0.08,
      tailAngleRad: 0.1,
      frontLeg: { hipAngle: 0.35, kneeAngle: -0.55, len1: 10.5, len2: 10.5 },
      backLeg: { hipAngle: -0.22, kneeAngle: -0.45, len1: 10.5, len2: 10.5 },
      frontArm: { shoulderAngle: 0.3, elbowAngle: 0.45, len1: 8, len2: 7 },
      backArm: { shoulderAngle: -0.25, elbowAngle: 0.45, len1: 7.5, len2: 6.5 },
    },
  ];

  for (let f = 0; f < 6; f++) {
    frames.push(
      renderProtagonistArticulatedPose({
        ...jumpPresets[f],
        filamentWave: f * 0.9,
        tailWave: Math.sin(f * 0.8),
        auraStrength: 56,
      })
    );
  }
  savePNG(
    'assets/characters/protagonist/jump/spritesheet.png',
    packHorizontalSpritesheet(frames),
    manifest,
    'protagonist',
    { animation: 'jump', frameCount: 6, frameWidth: 128, frameHeight: 128, anchor: { x: 64, y: 112 } }
  );
}

// 1D. FALL (4 frames — distinct descent posture, filaments & tail swept upward by air resistance)
{
  const frames = [];
  for (let f = 0; f < 4; f++) {
    const phase = (f / 4) * Math.PI * 2;
    const flutter = Math.sin(phase);
    frames.push(
      renderProtagonistArticulatedPose({
        offsetX: 0,
        offsetY: -4.5 + flutter * 1.2,
        leanRad: 0.12,
        torsoScaleX: 0.96,
        torsoScaleY: 1.05,
        headOffsetY: 1.2,
        headPitchRad: 0.18 + flutter * 0.03,
        // Upward air resistance lifts filaments and tail upward (+0.45 rad)
        filamentAngleRad: 0.44 + flutter * 0.08,
        filamentWave: phase * 1.5,
        tailAngleRad: 0.48 + Math.cos(phase) * 0.09,
        tailWave: flutter,
        auraStrength: 52,
        frontLeg: { hipAngle: 0.32 + flutter * 0.05, kneeAngle: -0.35, len1: 10.8, len2: 10.8 },
        backLeg: { hipAngle: -0.28 - flutter * 0.05, kneeAngle: -0.65, len1: 10.5, len2: 10.5 },
        frontArm: { shoulderAngle: -0.45 + flutter * 0.1, elbowAngle: -0.45, len1: 8, len2: 7 },
        backArm: { shoulderAngle: -0.75 - flutter * 0.1, elbowAngle: -0.35, len1: 7.5, len2: 6.5 },
      })
    );
  }
  savePNG(
    'assets/characters/protagonist/fall/spritesheet.png',
    packHorizontalSpritesheet(frames),
    manifest,
    'protagonist',
    { animation: 'fall', frameCount: 4, frameWidth: 128, frameHeight: 128, anchor: { x: 64, y: 112 } }
  );
}

// 1E. ATTACK (6 frames — anticipation -> charge -> beam emission & recoil -> recovery, anchor (64, 112))
{
  const frames = [];
  const attackPresets = [
    // Frame 0: Anticipation coil back
    {
      offsetX: -3.5,
      offsetY: 1.5,
      leanRad: -0.14,
      torsoScaleX: 1.06,
      torsoScaleY: 0.95,
      headOffsetX: -2.0,
      headPitchRad: -0.08,
      filamentAngleRad: 0.22,
      tailAngleRad: -0.12,
      chargeR: 7,
      burstR: 0,
      frontArm: { shoulderAngle: -0.35, elbowAngle: 1.1, len1: 8, len2: 7 },
    },
    // Frame 1: Radiant energy concentration at chest/hand
    {
      offsetX: -2.0,
      offsetY: 1.0,
      leanRad: -0.06,
      torsoScaleX: 1.08,
      torsoScaleY: 0.94,
      headOffsetX: -1.0,
      headPitchRad: -0.04,
      filamentAngleRad: 0.32,
      tailAngleRad: -0.18,
      chargeR: 13,
      burstR: 5,
      frontArm: { shoulderAngle: 0.15, elbowAngle: 0.85, len1: 8, len2: 7 },
    },
    // Frame 2: Forward release thrust + bright muzzle star burst
    {
      offsetX: 4.5,
      offsetY: -0.5,
      leanRad: 0.28,
      torsoScaleX: 1.08,
      torsoScaleY: 0.94,
      headOffsetX: 3.5,
      headPitchRad: 0.05,
      filamentAngleRad: -0.32,
      tailAngleRad: 0.25,
      chargeR: 6,
      burstR: 18,
      frontArm: { shoulderAngle: 1.35, elbowAngle: 0.12, len1: 9, len2: 8 },
    },
    // Frame 3: Recoil impulse
    {
      offsetX: 1.8,
      offsetY: 0,
      leanRad: 0.18,
      torsoScaleX: 1.04,
      torsoScaleY: 0.97,
      headOffsetX: 2.0,
      headPitchRad: 0.02,
      filamentAngleRad: -0.22,
      tailAngleRad: 0.18,
      chargeR: 4,
      burstR: 13,
      frontArm: { shoulderAngle: 1.15, elbowAngle: 0.22, len1: 8.5, len2: 7.5 },
    },
    // Frame 4: Follow-through
    {
      offsetX: 0.8,
      offsetY: 0,
      leanRad: 0.1,
      torsoScaleX: 1.01,
      torsoScaleY: 0.99,
      headOffsetX: 1.0,
      headPitchRad: 0,
      filamentAngleRad: -0.1,
      tailAngleRad: 0.08,
      chargeR: 0,
      burstR: 7,
      frontArm: { shoulderAngle: 0.72, elbowAngle: 0.35, len1: 8, len2: 7 },
    },
    // Frame 5: Smooth recovery to neutral
    {
      offsetX: 0,
      offsetY: 0,
      leanRad: 0.04,
      torsoScaleX: 1.0,
      torsoScaleY: 1.0,
      headOffsetX: 0,
      headPitchRad: 0,
      filamentAngleRad: 0,
      tailAngleRad: 0.02,
      chargeR: 0,
      burstR: 0,
      frontArm: { shoulderAngle: 0.35, elbowAngle: 0.45, len1: 8, len2: 7 },
    },
  ];

  for (let f = 0; f < 6; f++) {
    const p = attackPresets[f];
    frames.push(
      renderProtagonistArticulatedPose({
        ...p,
        filamentWave: f * 0.8,
        tailWave: Math.sin(f),
        auraStrength: f === 2 || f === 1 ? 68 : 54,
        frontLeg: { hipAngle: 0.36, kneeAngle: -0.12, len1: 10.6, len2: 10.6 },
        backLeg: { hipAngle: -0.38, kneeAngle: 0.18, len1: 10.6, len2: 10.6 },
        backArm: { shoulderAngle: -0.55, elbowAngle: 0.45, len1: 7.5, len2: 6.5 },
        overlayFn: (pixels, size) => {
          if (p.chargeR > 0) {
            drawSoftRadialGlow(pixels, size, 78, 72, p.chargeR * 1.8, 253, 224, 71, 165);
            drawSoftRadialGlow(pixels, size, 78, 72, p.chargeR * 0.9, 255, 255, 255, 220);
          }
          if (p.burstR > 0) {
            const bx = 92;
            const by = 70;
            drawSoftRadialGlow(pixels, size, bx, by, p.burstR * 1.35, 251, 191, 36, 190);
            drawSoftRadialGlow(pixels, size, bx, by, p.burstR * 0.65, 255, 255, 255, 245);
          }
        },
      })
    );
  }
  savePNG(
    'assets/characters/protagonist/attack/spritesheet.png',
    packHorizontalSpritesheet(frames),
    manifest,
    'protagonist',
    { animation: 'attack', frameCount: 6, frameWidth: 128, frameHeight: 128, anchor: { x: 64, y: 112 } }
  );
}

// 1F. DAMAGE (4 frames — sharp hit reaction, body contraction, squinting eye, luminous flash)
{
  const frames = [];
  const dmgPresets = [
    { offsetX: -4.5, offsetY: -1.5, leanRad: -0.26, squint: 0.65, hurt: true, filAngle: 0.38 },
    { offsetX: -6.0, offsetY: 1.0, leanRad: -0.32, squint: 0.6, hurt: true, filAngle: 0.46 },
    { offsetX: -3.5, offsetY: 1.5, leanRad: -0.18, squint: 0.35, hurt: false, filAngle: 0.25 },
    { offsetX: -1.2, offsetY: 0.5, leanRad: -0.06, squint: 0.15, hurt: false, filAngle: 0.1 },
  ];
  for (let f = 0; f < 4; f++) {
    const d = dmgPresets[f];
    frames.push(
      renderProtagonistArticulatedPose({
        offsetX: d.offsetX,
        offsetY: d.offsetY,
        leanRad: d.leanRad,
        torsoScaleX: 1.08,
        torsoScaleY: 0.92,
        headOffsetX: -2.5,
        headOffsetY: 1.5,
        headPitchRad: -0.18,
        eyeSquint: d.squint,
        isHurt: d.hurt,
        filamentAngleRad: d.filAngle,
        filamentWave: f * 1.4,
        tailAngleRad: 0.35,
        tailWave: f,
        auraStrength: 68,
        frontLeg: { hipAngle: 0.45, kneeAngle: -0.45, len1: 10.2, len2: 10.2 },
        backLeg: { hipAngle: -0.15, kneeAngle: -0.55, len1: 10.2, len2: 10.2 },
        frontArm: { shoulderAngle: -0.55, elbowAngle: -0.65, len1: 8, len2: 7 },
        backArm: { shoulderAngle: 0.55, elbowAngle: -0.55, len1: 7.5, len2: 6.5 },
      })
    );
  }
  savePNG(
    'assets/characters/protagonist/damage/spritesheet.png',
    packHorizontalSpritesheet(frames),
    manifest,
    'protagonist',
    { animation: 'damage', frameCount: 4, frameWidth: 128, frameHeight: 128, anchor: { x: 64, y: 112 } }
  );
}

// 1G. DEATH (8 frames — progressive collapse and graceful dissolution into ascending bioluminescent particles)
{
  const frames = [];
  for (let f = 0; f < 8; f++) {
    const progress = f / 7;
    // Body stays visible while collapsing in frames 0..5 and dissolves smoothly into particles
    const bodyAlpha = clamp(1 - Math.pow(Math.max(0, (f - 1) / 5.5), 1.3), 0, 1);
    const collapseY = Math.min(18, f * 3.2);
    const collapseLean = -0.15 + Math.min(0.75, f * 0.14);

    frames.push(
      renderProtagonistArticulatedPose({
        alpha: bodyAlpha,
        offsetX: -2 + f * 0.5,
        offsetY: collapseY,
        leanRad: collapseLean,
        torsoScaleX: 1 + progress * 0.12,
        torsoScaleY: Math.max(0.65, 1 - progress * 0.32),
        headOffsetY: collapseY * 0.35,
        headPitchRad: 0.28,
        eyeSquint: Math.min(0.75, 0.25 + progress * 0.65),
        filamentAngleRad: -0.25 - progress * 0.35,
        filamentWave: f * 0.7,
        tailAngleRad: -0.2,
        tailWave: f * 0.5,
        auraStrength: 62 * (1 - progress * 0.5),
        frontLeg: {
          hipAngle: 0.45 + progress * 0.5,
          kneeAngle: -0.65 - progress * 0.6,
          len1: 10 * (1 - progress * 0.25),
          len2: 10 * (1 - progress * 0.25),
        },
        backLeg: {
          hipAngle: -0.15 + progress * 0.4,
          kneeAngle: -0.75 - progress * 0.5,
          len1: 10 * (1 - progress * 0.25),
          len2: 10 * (1 - progress * 0.25),
        },
        overlayFn: (pixels, size) => {
          // Ascending bioluminescent golden & cyan spirit motes
          const moteCount = 6 + f * 3;
          const moteAlpha = f < 6 ? Math.min(1, 0.35 + progress * 0.85) : 1 - (f - 5.5) * 0.35;
          for (let m = 0; m < moteCount; m++) {
            const seed = m * 1.73 + 0.5;
            const spread = (8 + (m % 5) * 4.5) * (0.4 + progress * 0.85);
            const mx = 64 + Math.sin(seed * 2.3 + f * 0.45) * spread;
            const climb = ((m * 9 + f * 11) % 66) * (0.35 + progress * 0.75);
            const my = clamp(104 - climb, 18, 108);
            const rad = (m % 3 === 0 ? 5.5 : 3.8) * (1 - progress * 0.25);
            const isCyan = m % 4 === 0;
            drawSoftRadialGlow(
              pixels,
              size,
              mx,
              my,
              rad * 1.8,
              isCyan ? 56 : 253,
              isCyan ? 189 : 224,
              isCyan ? 248 : 71,
              185 * moteAlpha
            );
            drawSoftRadialGlow(
              pixels,
              size,
              mx,
              my,
              rad * 0.7,
              255,
              255,
              255,
              235 * moteAlpha
            );
          }
        },
      })
    );
  }
  savePNG(
    'assets/characters/protagonist/death/spritesheet.png',
    packHorizontalSpritesheet(frames),
    manifest,
    'protagonist',
    { animation: 'death', frameCount: 8, frameWidth: 128, frameHeight: 128, anchor: { x: 64, y: 112 } }
  );
}

// 1H. PURIFY (8 frames — serene levitation, energy gathering & radiant emission)
{
  const frames = [];
  for (let f = 0; f < 8; f++) {
    const phase = (f / 8) * Math.PI * 2;
    const hover = Math.sin(phase);
    frames.push(
      renderProtagonistArticulatedPose({
        offsetX: 0,
        offsetY: -5.5 + hover * 2.2,
        leanRad: -0.05 + hover * 0.03,
        torsoScaleX: 1.03 - hover * 0.03,
        torsoScaleY: 1.03 + hover * 0.03,
        headOffsetY: -1.5 + hover * 0.8,
        headPitchRad: -0.14 + hover * 0.04,
        filamentAngleRad: 0.28 + hover * 0.1,
        filamentWave: phase,
        tailAngleRad: -0.18 + Math.cos(phase) * 0.1,
        tailWave: hover,
        auraStrength: 72 + hover * 12,
        frontLeg: { hipAngle: 0.18, kneeAngle: -0.38, len1: 10.5, len2: 10.5 },
        backLeg: { hipAngle: -0.18, kneeAngle: -0.48, len1: 10.5, len2: 10.5 },
        frontArm: { shoulderAngle: 0.85 + hover * 0.15, elbowAngle: 0.35, len1: 8.5, len2: 7.5 },
        backArm: { shoulderAngle: -0.75 - hover * 0.15, elbowAngle: -0.35, len1: 8, len2: 7 },
        overlayFn: (pixels, size) => {
          // Orbiting purification motes (contained well inside frame bounds)
          for (let m = 0; m < 6; m++) {
            const ang = phase + (m / 6) * Math.PI * 2;
            const rx = 64 + Math.cos(ang) * 24;
            const ry = 76 + Math.sin(ang * 2) * 16;
            const isCyan = m % 2 === 0;
            drawSoftRadialGlow(
              pixels,
              size,
              rx,
              ry,
              6.5,
              isCyan ? 52 : 253,
              isCyan ? 211 : 224,
              isCyan ? 153 : 71,
              195
            );
            drawSoftRadialGlow(pixels, size, rx, ry, 2.8, 255, 255, 255, 240);
          }
        },
      })
    );
  }
  savePNG(
    'assets/characters/protagonist/purify/spritesheet.png',
    packHorizontalSpritesheet(frames),
    manifest,
    'protagonist',
    { animation: 'purify', frameCount: 8, frameWidth: 128, frameHeight: 128, anchor: { x: 64, y: 112 } }
  );
}

// 2. ENEMIES — SHADOW_CREATURE (True Multi-Limb IK-Grounded Articulated Quadruped Renderer)
// Preserves exact obsidian-violet & glowing magenta-purple aesthetic, silhouette, and 128x128 dimensions,
// while eliminating the floating cutout effect by anchoring stance paws strictly on y = 112.

function solve2BoneIK(ox, oy, tx, ty, len1, len2, bendDir = 1) {
  const dx = tx - ox;
  const dy = ty - oy;
  const rawDist = Math.hypot(dx, dy);
  const maxReach = Math.max(0.001, (len1 + len2) * 0.995);
  const minReach = Math.abs(len1 - len2) + 0.05;
  const d = clamp(rawDist, minReach, maxReach);

  const baseAngle = Math.atan2(dy, dx);
  const cosAngle1 = clamp(
    (len1 * len1 + d * d - len2 * len2) / (2 * len1 * d),
    -1,
    1
  );
  const angle1 = baseAngle + bendDir * Math.acos(cosAngle1);
  const jx = ox + Math.cos(angle1) * len1;
  const jy = oy + Math.sin(angle1) * len1;

  const fx = rawDist > maxReach ? ox + (dx / rawDist) * maxReach : tx;
  const fy = rawDist > maxReach ? oy + (dy / rawDist) * maxReach : ty;
  return { jx, jy, fx, fy };
}

function drawClawedShadowPaw(pixels, size, fx, fy, isNear, isHurt, alpha) {
  const pawStyle = isHurt
    ? {
        coreColor: [250, 232, 255],
        shadeColor: [192, 38, 211],
        rimColor: [254, 240, 138],
        alpha,
      }
    : isNear
      ? {
          coreColor: [30, 16, 52],
          shadeColor: [12, 7, 24],
          rimColor: [217, 70, 239],
          alpha,
        }
      : {
          coreColor: [18, 10, 34],
          shadeColor: [8, 5, 16],
          rimColor: [147, 51, 234],
          alpha: alpha * 0.95,
        };

  // Planted/articulated paw pad (bottom rests flush at fy <= 112)
  const padCy = Math.min(110.2, fy - 1.8);
  drawShadedEllipse(pixels, size, fx + 1.2, padCy, 4.4, 2.2, 0, pawStyle);

  // 3 forward curved shadow-magenta claws
  const clawColor = isHurt ? [254, 240, 138] : isNear ? [232, 121, 249] : [168, 85, 247];
  const clawShade = isHurt ? [244, 114, 182] : [88, 28, 135];
  for (let c = 0; c < 3; c++) {
    const cx0 = fx + 2.8 + c * 1.4;
    const cy0 = padCy - 0.3 + c * 0.25;
    const cx1 = cx0 + 2.8;
    const cy1 = Math.min(112.0, fy);
    drawTaperedCapsule(pixels, size, cx0, cy0, 1.15, cx1, cy1, 0.45, {
      coreColor: clawColor,
      shadeColor: clawShade,
      alpha,
    });
  }
}

function drawShadowQuadrupedLimb(
  pixels,
  size,
  ox,
  oy,
  footX,
  footY,
  len1,
  len2,
  bendDir,
  isNear,
  isHurt,
  alpha
) {
  const clampedFootY = Math.min(112.0, footY);
  const ik = solve2BoneIK(ox, oy, footX, clampedFootY - 1.4, len1, len2, bendDir);

  const limbStyle = isHurt
    ? {
        coreColor: [245, 208, 254],
        shadeColor: [168, 85, 247],
        rimColor: [254, 240, 138],
        alpha,
      }
    : isNear
      ? {
          coreColor: [34, 18, 58],
          shadeColor: [13, 7, 26],
          rimColor: [192, 38, 211],
          alpha,
        }
      : {
          coreColor: [19, 10, 34],
          shadeColor: [8, 4, 16],
          rimColor: [126, 34, 206],
          alpha: alpha * 0.94,
        };

  // Upper segment (thigh / humerus)
  drawTaperedCapsule(pixels, size, ox, oy, isNear ? 5.2 : 4.6, ik.jx, ik.jy, isNear ? 3.8 : 3.4, limbStyle);
  // Joint highlight
  drawSoftRadialGlow(
    pixels,
    size,
    ik.jx,
    ik.jy,
    4.5,
    isHurt ? 254 : 192,
    isHurt ? 240 : 38,
    isHurt ? 138 : 211,
    (isNear ? 52 : 30) * alpha
  );
  // Lower segment (shin / forearm)
  drawTaperedCapsule(pixels, size, ik.jx, ik.jy, isNear ? 3.7 : 3.3, ik.fx, ik.fy, isNear ? 2.6 : 2.3, limbStyle);
  // Clawed paw anchored to clampedFootY
  drawClawedShadowPaw(pixels, size, ik.fx, clampedFootY, isNear, isHurt, alpha);
}

function renderShadowCreatureArticulatedPose(pose) {
  const size = FRAME_SIZE;
  const pixels = new Uint8Array(size * size * 4);

  const alpha = pose.alpha ?? 1;
  const bodyX = 62 + (pose.offsetX ?? 0);
  const bodyY = 82 + (pose.offsetY ?? 0);
  const lean = pose.leanRad ?? 0.06;
  const spineFlex = pose.spineFlex ?? 0; // >0 = arched/gathered, <0 = extended
  const torsoScaleX = pose.torsoScaleX ?? 1;
  const torsoScaleY = pose.torsoScaleY ?? 1;
  const isHurt = Boolean(pose.isHurt);

  const bodyStyle = isHurt
    ? {
        coreColor: [243, 212, 255],
        shadeColor: [126, 34, 206],
        rimColor: [254, 240, 138],
        alpha,
      }
    : {
        coreColor: [32, 16, 56],
        shadeColor: [11, 6, 22],
        rimColor: [192, 38, 211],
        alpha,
      };

  const haunchStyle = isHurt
    ? bodyStyle
    : {
        coreColor: [26, 13, 46],
        shadeColor: [9, 5, 18],
        rimColor: [168, 85, 247],
        alpha,
      };

  const tendrilRoot = isHurt ? [245, 208, 254] : [38, 16, 66];
  const tendrilMid = isHurt ? [232, 121, 249] : [147, 51, 234];
  const tendrilTip = isHurt ? [254, 240, 138] : [232, 121, 249];
  const tendrilGlow = isHurt ? [254, 240, 138] : [192, 38, 211];

  // 1. Ambient Dark-Magenta Miasma Halo around torso (strictly inside frame margins)
  if (alpha > 0.06) {
    drawSoftRadialGlow(
      pixels,
      size,
      bodyX + 2,
      bodyY - 4,
      42,
      isHurt ? 245 : 192,
      isHurt ? 208 : 38,
      isHurt ? 254 : 211,
      (pose.auraStrength ?? 54) * alpha
    );
  }

  if (alpha > 0.04) {
    const cosL = Math.cos(lean);
    const sinL = Math.sin(lean);

    // Pelvis / Haunch & Chest / Shoulder centers derived from spine posture
    const hipX = bodyX - 13 * cosL;
    const hipY = bodyY + 3 - 13 * sinL + spineFlex * 2.5;

    const shoulderX = bodyX + 11 * cosL;
    const shoulderY = bodyY - 2 + 11 * sinL + spineFlex * 1.5;

    const midSpineX = (hipX + shoulderX) * 0.5;
    const midSpineY = (hipY + shoulderY) * 0.5 - spineFlex * 4.5;

    const headX = shoulderX + 14 + (pose.headOffsetX ?? 0);
    const headY = shoulderY - 9 + (pose.headOffsetY ?? 0);
    const headPitch = (pose.headPitchRad ?? 0.05) + lean * 0.5;

    // 2. Sinuous Shadow Tail (anchored at pelvis, counter-balancing stride)
    const tailBaseX = hipX - 6;
    const tailBaseY = hipY - 1;
    const tailAngle = pose.tailAngleRad ?? 0.12;
    const tailWave = pose.tailWave ?? 0;
    const cosT = Math.cos(tailAngle);
    const sinT = Math.sin(tailAngle);
    const rotTail = (dx, dy) => [
      tailBaseX + dx * cosT - dy * sinT,
      tailBaseY + dx * sinT + dy * cosT,
    ];

    drawCubicRibbon(
      pixels,
      size,
      [tailBaseX, tailBaseY],
      rotTail(-12, -4 + Math.sin(tailWave) * 4.5),
      rotTail(-24, 2 + Math.cos(tailWave) * 5.5),
      rotTail(-35, -6 + Math.sin(tailWave - 0.8) * 6.5),
      4.2,
      1.1,
      tendrilRoot,
      tendrilMid,
      tendrilTip,
      tendrilGlow,
      alpha
    );

    // 3. Far-Side Limbs (Far-Hind & Far-Front, rendered behind torso for depth)
    const farHind = pose.farHind ?? { footX: 43, footY: 112 };
    const farFront = pose.farFront ?? { footX: 72, footY: 112 };

    // Hind legs bend backward at the knee/hock (bendDir = -1); front legs bend at elbow (bendDir = -1)
    drawShadowQuadrupedLimb(
      pixels,
      size,
      hipX - 2,
      hipY + 2,
      farHind.footX,
      farHind.footY,
      15.5,
      15.5,
      -1,
      false,
      isHurt,
      alpha
    );
    drawShadowQuadrupedLimb(
      pixels,
      size,
      shoulderX - 2,
      shoulderY + 3,
      farFront.footX,
      farFront.footY,
      15.5,
      15.5,
      -1,
      false,
      isHurt,
      alpha
    );

    // 4. Dorsal Shadow Tendrils / Spines along the back
    const tendrilWave = pose.tendrilWave ?? 0;
    const spineDrag = pose.tendrilDragRad ?? 0;
    for (let s = 0; s < 3; s++) {
      const tRatio = s / 2;
      const sx = lerp(hipX + 3, shoulderX - 1, tRatio);
      const sy = lerp(hipY - 7, shoulderY - 10, tRatio) - spineFlex * 2.5;
      const wPhase = tendrilWave + s * 1.1;
      drawCubicRibbon(
        pixels,
        size,
        [sx, sy],
        [sx - 7 - spineDrag * 5, sy - 8 + Math.sin(wPhase) * 2.5],
        [sx - 16 - spineDrag * 9, sy - 14 + Math.cos(wPhase) * 3.5],
        [sx - 25 - spineDrag * 12, sy - 11 + Math.sin(wPhase - 0.7) * 4.5],
        3.5 - s * 0.35,
        0.9,
        tendrilRoot,
        tendrilMid,
        tendrilTip,
        tendrilGlow,
        alpha
      );
    }

    // 5. Articulated Haunches, Mid-Spine & Muscular Predatory Ribcage
    drawShadedEllipse(
      pixels,
      size,
      hipX,
      hipY,
      10.5 * torsoScaleX,
      9.2 * torsoScaleY,
      lean - 0.12,
      haunchStyle
    );
    drawShadedEllipse(
      pixels,
      size,
      midSpineX,
      midSpineY,
      12.5 * torsoScaleX,
      9.6 * torsoScaleY,
      lean,
      bodyStyle
    );
    drawShadedEllipse(
      pixels,
      size,
      shoulderX,
      shoulderY,
      13.2 * torsoScaleX,
      11.4 * torsoScaleY,
      lean + 0.08,
      bodyStyle
    );

    // Bioluminescent Magenta Corruption Core Fissure on Chest
    drawSoftRadialGlow(
      pixels,
      size,
      shoulderX + 2,
      shoulderY,
      9.5,
      232,
      121,
      249,
      135 * alpha
    );
    drawShadedEllipse(
      pixels,
      size,
      shoulderX + 2,
      shoulderY,
      4.2,
      2.3,
      lean + 0.2,
      {
        coreColor: [255, 230, 255],
        shadeColor: [217, 70, 239],
        rimColor: [192, 38, 211],
        alpha,
      }
    );

    // 6. Predatory Head, Snout, Jaws & Swept Shadow Horns
    // Upper Horn/Crest
    drawCubicRibbon(
      pixels,
      size,
      [headX - 4, headY - 6],
      [headX - 12, headY - 13],
      [headX - 21, headY - 16],
      [headX - 29, headY - 14 + Math.sin(tendrilWave) * 2],
      3.8,
      0.9,
      tendrilRoot,
      tendrilMid,
      tendrilTip,
      tendrilGlow,
      alpha
    );

    // Cranium & Upper Snout
    drawShadedEllipse(
      pixels,
      size,
      headX,
      headY,
      11.8,
      9.4,
      headPitch,
      bodyStyle
    );
    drawShadedEllipse(
      pixels,
      size,
      headX + 7.5,
      headY + 1.5,
      8.2,
      5.6,
      headPitch + 0.08,
      bodyStyle
    );

    // Articulated Lower Jaw (opens during roar/attack/chase)
    const jawOpen = pose.jawOpen ?? 0.08;
    const jawX = headX + 5.5;
    const jawY = headY + 5.2 + jawOpen * 5.5;
    drawShadedEllipse(
      pixels,
      size,
      jawX,
      jawY,
      7.2,
      3.2,
      headPitch + jawOpen * 0.45,
      haunchStyle
    );
    if (jawOpen > 0.18) {
      // Glowing magenta maw interior when jaw opens
      drawSoftRadialGlow(
        pixels,
        size,
        headX + 8,
        headY + 4,
        6.5,
        244,
        114,
        182,
        165 * alpha
      );
    }

    // 7. Glowing Predatory Magenta-Violet Eye (with slit core & trail)
    const eyeX = headX + 4.8;
    const eyeY = headY - 0.8;
    const eyeSquint = pose.eyeSquint ?? 0;
    const eyeRy = Math.max(1.2, 3.2 * (1 - eyeSquint));
    drawSoftRadialGlow(
      pixels,
      size,
      eyeX,
      eyeY,
      8.5,
      232,
      121,
      249,
      180 * alpha
    );
    drawShadedEllipse(
      pixels,
      size,
      eyeX,
      eyeY,
      4.2,
      eyeRy,
      headPitch - 0.18,
      {
        coreColor: [255, 245, 255],
        shadeColor: [244, 114, 182],
        rimColor: [217, 70, 239],
        alpha,
      }
    );

    // 8. Near-Side Foreground Limbs (Near-Hind & Near-Front)
    const nearHind = pose.nearHind ?? { footX: 50, footY: 112 };
    const nearFront = pose.nearFront ?? { footX: 80, footY: 112 };

    drawShadowQuadrupedLimb(
      pixels,
      size,
      hipX + 2,
      hipY + 2,
      nearHind.footX,
      nearHind.footY,
      15.8,
      15.8,
      -1,
      true,
      isHurt,
      alpha
    );
    drawShadowQuadrupedLimb(
      pixels,
      size,
      shoulderX + 2,
      shoulderY + 3,
      nearFront.footX,
      nearFront.footY,
      15.8,
      15.8,
      -1,
      true,
      isHurt,
      alpha
    );
  }

  if (pose.overlayFn) {
    pose.overlayFn(pixels, size);
  }

  return { width: size, height: size, pixels };
}

// Helper to compute a realistic quadruped paw trajectory over normalized cycle t in [0..1):
// t in [0..0.625): Stance phase — paw stays locked on ground y = 112, sweeping from front (+strideX) to rear (-strideX)
// t in [0.625..1.0): Swing phase — paw lifts off ground (up to liftH) and arcs forward from rear (-strideX) to front (+strideX)
function sampleQuadrupedFootTrajectory(baseFootX, phase01, strideX, liftH) {
  const t = ((phase01 % 1) + 1) % 1;
  const stanceRatio = 0.625;
  if (t < stanceRatio) {
    const u = t / stanceRatio; // 0 -> 1 during ground contact
    return {
      footX: baseFootX + lerp(strideX, -strideX, u),
      footY: 112.0, // Strictly planted on ground plane!
    };
  } else {
    const u = (t - stanceRatio) / (1 - stanceRatio); // 0 -> 1 during aerial swing
    const smoothU = u * u * (3 - 2 * u);
    const liftArc = Math.sin(u * Math.PI);
    return {
      footX: baseFootX + lerp(-strideX, strideX, smoothU),
      footY: 112.0 - liftArc * liftH,
    };
  }
}

// 2A. ENEMY IDLE (8 frames — all 4 paws planted firmly at y = 112, deep predatory breathing, head scan, tail & tendril sway)
{
  const frames = [];
  for (let f = 0; f < 8; f++) {
    const phase = (f / 8) * Math.PI * 2;
    const breath = Math.sin(phase);
    frames.push(
      renderShadowCreatureArticulatedPose({
        offsetX: Math.sin(phase * 0.5) * 0.6,
        offsetY: breath * -2.0,
        leanRad: 0.06 + breath * 0.025,
        spineFlex: breath * 0.25,
        torsoScaleX: 1 + breath * 0.04,
        torsoScaleY: 1 - breath * 0.035,
        headOffsetX: Math.cos(phase) * 0.8,
        headOffsetY: breath * -1.4,
        headPitchRad: 0.04 + Math.sin(phase - 0.6) * 0.05,
        jawOpen: 0.08 + Math.max(0, breath) * 0.06,
        tailAngleRad: 0.1 + Math.cos(phase) * 0.08,
        tailWave: phase,
        tendrilWave: phase,
        auraStrength: 52 + breath * 8,
        farHind: { footX: 43, footY: 112.0 },
        nearHind: { footX: 50, footY: 112.0 },
        farFront: { footX: 73, footY: 112.0 },
        nearFront: { footX: 81, footY: 112.0 },
      })
    );
  }
  savePNG(
    'assets/characters/enemies/shadow_creature/idle/spritesheet.png',
    packHorizontalSpritesheet(frames),
    manifest,
    'enemy_shadow_creature',
    {
      animation: 'idle',
      frameCount: 8,
      frameWidth: 128,
      frameHeight: 128,
      anchor: { x: 64, y: 112 },
    }
  );
}

// 2B. ENEMY PATROL / WALK (8 frames — 4-beat quadruped walk cycle with alternating leg lift & plant at y = 112)
{
  const frames = [];
  for (let f = 0; f < 8; f++) {
    const cycle01 = f / 8;
    const phase = cycle01 * Math.PI * 2;
    // Double-frequency body weight shift synchronized with front/hind steps
    const stepBob = Math.sin(phase * 2);

    frames.push(
      renderShadowCreatureArticulatedPose({
        offsetX: 0.5,
        offsetY: stepBob * 1.8,
        leanRad: 0.11 + Math.cos(phase * 2) * 0.03,
        spineFlex: Math.sin(phase) * 0.22,
        torsoScaleX: 1.01,
        torsoScaleY: 0.99,
        headOffsetX: 1.2 + Math.cos(phase * 2) * 0.6,
        headOffsetY: Math.sin(phase * 2 - 0.5) * 1.4,
        headPitchRad: 0.06 + Math.sin(phase * 2 - 0.4) * 0.04,
        jawOpen: 0.1,
        tailAngleRad: 0.14 + Math.cos(phase) * 0.1,
        tailWave: phase,
        tendrilWave: phase,
        tendrilDragRad: 0.18,
        auraStrength: 56,
        // 4-beat lateral walk gait offsets: nearFront (0.0), farHind (0.25), farFront (0.50), nearHind (0.75)
        nearFront: sampleQuadrupedFootTrajectory(78, cycle01 + 0.0, 9.5, 9.0),
        farHind: sampleQuadrupedFootTrajectory(45, cycle01 + 0.25, 9.5, 8.5),
        farFront: sampleQuadrupedFootTrajectory(73, cycle01 + 0.5, 9.5, 8.5),
        nearHind: sampleQuadrupedFootTrajectory(50, cycle01 + 0.75, 9.5, 9.0),
      })
    );
  }
  savePNG(
    'assets/characters/enemies/shadow_creature/patrol/spritesheet.png',
    packHorizontalSpritesheet(frames),
    manifest,
    'enemy_shadow_creature',
    {
      animation: 'patrol',
      frameCount: 8,
      frameWidth: 128,
      frameHeight: 128,
      anchor: { x: 64, y: 112 },
    }
  );
}

// 2C. ENEMY CHASE / RUN (8 frames — aggressive predatory gallop/bound with spine flexion, wide strides & compression)
{
  const frames = [];
  for (let f = 0; f < 8; f++) {
    const cycle01 = f / 8;
    const phase = cycle01 * Math.PI * 2;
    // Gallop spine flexion & extension
    const gallopWave = Math.sin(phase);
    const gallopCos = Math.cos(phase);

    frames.push(
      renderShadowCreatureArticulatedPose({
        offsetX: 2.0 + gallopCos * 1.2,
        offsetY: gallopWave * 2.8,
        leanRad: 0.2 + gallopCos * 0.09,
        spineFlex: -gallopCos * 0.65,
        torsoScaleX: 1.04 + gallopCos * 0.04,
        torsoScaleY: 0.96 - gallopCos * 0.03,
        headOffsetX: 2.8 + gallopCos * 1.2,
        headOffsetY: gallopWave * 1.8,
        headPitchRad: 0.08 + gallopCos * 0.07,
        jawOpen: 0.22 + Math.max(0, gallopCos) * 0.12,
        tailAngleRad: 0.22 + gallopWave * 0.16,
        tailWave: phase * 1.5,
        tendrilWave: phase * 1.5,
        tendrilDragRad: 0.45,
        auraStrength: 64,
        // Rotary gallop pairing: front pair leads with slight stagger (0.0, 0.14), hind pair drives with stagger (0.48, 0.62)
        nearFront: sampleQuadrupedFootTrajectory(80, cycle01 + 0.0, 14.5, 11.5),
        farFront: sampleQuadrupedFootTrajectory(74, cycle01 + 0.14, 14.0, 11.0),
        nearHind: sampleQuadrupedFootTrajectory(49, cycle01 + 0.48, 14.5, 11.5),
        farHind: sampleQuadrupedFootTrajectory(43, cycle01 + 0.62, 14.0, 11.0),
      })
    );
  }
  savePNG(
    'assets/characters/enemies/shadow_creature/chase/spritesheet.png',
    packHorizontalSpritesheet(frames),
    manifest,
    'enemy_shadow_creature',
    {
      animation: 'chase',
      frameCount: 8,
      frameWidth: 128,
      frameHeight: 128,
      anchor: { x: 64, y: 112 },
    }
  );
}

// 2D. ENEMY ATTACK (6 frames — coiled preparation -> forward lunge & claw slash -> grounded landing compression)
{
  const frames = [];
  const attackPoses = [
    // Frame 0: Coiled crouch anticipation (all paws grounded on y=112)
    {
      offsetX: -5.5,
      offsetY: 3.5,
      leanRad: -0.1,
      spineFlex: 0.55,
      torsoScaleX: 1.06,
      torsoScaleY: 0.92,
      headOffsetX: -2.0,
      headOffsetY: 2.0,
      headPitchRad: -0.12,
      jawOpen: 0.28,
      tendrilDragRad: -0.15,
      farHind: { footX: 41, footY: 112.0 },
      nearHind: { footX: 48, footY: 112.0 },
      farFront: { footX: 69, footY: 112.0 },
      nearFront: { footX: 75, footY: 112.0 },
      slashPower: 0.25,
    },
    // Frame 1: Deep coiled windup, near front claw raised to strike
    {
      offsetX: -8.0,
      offsetY: 5.0,
      leanRad: -0.18,
      spineFlex: 0.75,
      torsoScaleX: 1.09,
      torsoScaleY: 0.89,
      headOffsetX: -3.0,
      headOffsetY: 2.5,
      headPitchRad: -0.18,
      jawOpen: 0.42,
      tendrilDragRad: -0.25,
      farHind: { footX: 40, footY: 112.0 },
      nearHind: { footX: 47, footY: 112.0 },
      farFront: { footX: 68, footY: 112.0 },
      nearFront: { footX: 81, footY: 94.0 },
      slashPower: 0.55,
    },
    // Frame 2: Explosive forward lunge & magenta claw slash impact!
    {
      offsetX: 8.5,
      offsetY: -2.5,
      leanRad: 0.28,
      spineFlex: -0.65,
      torsoScaleX: 1.12,
      torsoScaleY: 0.92,
      headOffsetX: 4.5,
      headOffsetY: -1.5,
      headPitchRad: 0.14,
      jawOpen: 0.52,
      tendrilDragRad: 0.65,
      farHind: { footX: 39, footY: 112.0 },
      nearHind: { footX: 45, footY: 112.0 },
      farFront: { footX: 90, footY: 95.0 },
      nearFront: { footX: 96, footY: 86.0 },
      slashPower: 1.0,
    },
    // Frame 3: Follow-through slash arc & bite
    {
      offsetX: 9.5,
      offsetY: -0.5,
      leanRad: 0.24,
      spineFlex: -0.45,
      torsoScaleX: 1.08,
      torsoScaleY: 0.95,
      headOffsetX: 3.5,
      headOffsetY: 0,
      headPitchRad: 0.1,
      jawOpen: 0.35,
      tendrilDragRad: 0.5,
      farHind: { footX: 42, footY: 112.0 },
      nearHind: { footX: 48, footY: 112.0 },
      farFront: { footX: 86, footY: 105.0 },
      nearFront: { footX: 92, footY: 98.0 },
      slashPower: 0.7,
    },
    // Frame 4: Heavy landing impact compression (all 4 paws slam onto y=112)
    {
      offsetX: 3.5,
      offsetY: 4.2,
      leanRad: 0.12,
      spineFlex: 0.35,
      torsoScaleX: 1.08,
      torsoScaleY: 0.9,
      headOffsetX: 1.5,
      headOffsetY: 2.0,
      headPitchRad: 0.08,
      jawOpen: 0.16,
      tendrilDragRad: 0.2,
      farHind: { footX: 43, footY: 112.0 },
      nearHind: { footX: 50, footY: 112.0 },
      farFront: { footX: 78, footY: 112.0 },
      nearFront: { footX: 85, footY: 112.0 },
      slashPower: 0.2,
    },
    // Frame 5: Smooth grounded recovery to prowling stance
    {
      offsetX: 0,
      offsetY: 0.5,
      leanRad: 0.06,
      spineFlex: 0.05,
      torsoScaleX: 1.0,
      torsoScaleY: 1.0,
      headOffsetX: 0,
      headOffsetY: 0,
      headPitchRad: 0.04,
      jawOpen: 0.1,
      tendrilDragRad: 0.05,
      farHind: { footX: 43, footY: 112.0 },
      nearHind: { footX: 50, footY: 112.0 },
      farFront: { footX: 74, footY: 112.0 },
      nearFront: { footX: 81, footY: 112.0 },
      slashPower: 0,
    },
  ];

  for (let f = 0; f < 6; f++) {
    const p = attackPoses[f];
    frames.push(
      renderShadowCreatureArticulatedPose({
        ...p,
        tailAngleRad: 0.2,
        tailWave: f * 0.9,
        tendrilWave: f * 0.9,
        auraStrength: f === 2 || f === 3 ? 76 : 58,
        overlayFn: (pixels, size) => {
          if (p.slashPower >= 0.5) {
            // Luminous magenta-violet claw slash crescent in front of forepaws
            drawCubicRibbon(
              pixels,
              size,
              [92, 64],
              [106, 74],
              [108, 92],
              [95, 106],
              3.4 * p.slashPower,
              1.0,
              [255, 240, 255],
              [232, 121, 249],
              [192, 38, 211],
              [232, 121, 249],
              p.slashPower
            );
          }
        },
      })
    );
  }
  savePNG(
    'assets/characters/enemies/shadow_creature/attack/spritesheet.png',
    packHorizontalSpritesheet(frames),
    manifest,
    'enemy_shadow_creature',
    {
      animation: 'attack',
      frameCount: 6,
      frameWidth: 128,
      frameHeight: 128,
      anchor: { x: 64, y: 112 },
    }
  );
}

// 2E. ENEMY HIT / HURT (4 frames — sharp physical recoil reaction, paws skidding on y = 112)
{
  const frames = [];
  const hitPoses = [
    {
      offsetX: -6.5,
      offsetY: -1.0,
      leanRad: -0.24,
      spineFlex: 0.5,
      isHurt: true,
      eyeSquint: 0.6,
      jawOpen: 0.35,
      nearFrontY: 105.0,
    },
    {
      offsetX: -8.5,
      offsetY: 2.0,
      leanRad: -0.28,
      spineFlex: 0.6,
      isHurt: true,
      eyeSquint: 0.55,
      jawOpen: 0.28,
      nearFrontY: 108.0,
    },
    {
      offsetX: -4.5,
      offsetY: 2.5,
      leanRad: -0.14,
      spineFlex: 0.3,
      isHurt: false,
      eyeSquint: 0.3,
      jawOpen: 0.16,
      nearFrontY: 112.0,
    },
    {
      offsetX: -1.5,
      offsetY: 0.8,
      leanRad: -0.04,
      spineFlex: 0.1,
      isHurt: false,
      eyeSquint: 0.1,
      jawOpen: 0.1,
      nearFrontY: 112.0,
    },
  ];

  for (let f = 0; f < 4; f++) {
    const h = hitPoses[f];
    frames.push(
      renderShadowCreatureArticulatedPose({
        offsetX: h.offsetX,
        offsetY: h.offsetY,
        leanRad: h.leanRad,
        spineFlex: h.spineFlex,
        torsoScaleX: 1.06,
        torsoScaleY: 0.94,
        headOffsetX: -3.0,
        headOffsetY: -1.5,
        headPitchRad: -0.22,
        jawOpen: h.jawOpen,
        eyeSquint: h.eyeSquint,
        isHurt: h.isHurt,
        tailAngleRad: 0.35,
        tailWave: f * 1.2,
        tendrilWave: f * 1.2,
        tendrilDragRad: -0.35,
        auraStrength: 72,
        farHind: { footX: 39, footY: 112.0 },
        nearHind: { footX: 46, footY: 112.0 },
        farFront: { footX: 69, footY: 112.0 },
        nearFront: { footX: 76, footY: h.nearFrontY },
      })
    );
  }
  savePNG(
    'assets/characters/enemies/shadow_creature/hit/spritesheet.png',
    packHorizontalSpritesheet(frames),
    manifest,
    'enemy_shadow_creature',
    {
      animation: 'hit',
      frameCount: 4,
      frameWidth: 128,
      frameHeight: 128,
      anchor: { x: 64, y: 112 },
    }
  );
}

// 2F. ENEMY DEATH (8 frames — legs buckling & collapsing onto ground y = 112, then dissolving into dark-violet/gold motes)
{
  const frames = [];
  for (let f = 0; f < 8; f++) {
    const progress = f / 7;
    const bodyAlpha = clamp(1 - Math.pow(Math.max(0, (f - 1.2) / 5.5), 1.3), 0, 1);
    const collapseY = Math.min(20, f * 3.6);

    frames.push(
      renderShadowCreatureArticulatedPose({
        alpha: bodyAlpha,
        offsetX: -2 + f * 0.4,
        offsetY: collapseY,
        leanRad: 0.08 + progress * 0.25,
        spineFlex: -0.35 * progress,
        torsoScaleX: 1 + progress * 0.14,
        torsoScaleY: Math.max(0.62, 1 - progress * 0.36),
        headOffsetY: collapseY * 0.4,
        headPitchRad: 0.24,
        jawOpen: Math.max(0, 0.25 - progress * 0.25),
        eyeSquint: Math.min(0.85, 0.25 + progress * 0.7),
        tailAngleRad: -0.15,
        tailWave: f * 0.6,
        tendrilWave: f * 0.6,
        auraStrength: 64 * (1 - progress * 0.55),
        // Paws splay outward on ground y = 112 as legs buckle
        farHind: { footX: 41 - progress * 5, footY: 112.0 },
        nearHind: { footX: 48 - progress * 5, footY: 112.0 },
        farFront: { footX: 75 + progress * 5, footY: 112.0 },
        nearFront: { footX: 82 + progress * 5, footY: 112.0 },
        overlayFn: (pixels, size) => {
          const moteCount = 6 + f * 3;
          const moteAlpha =
            f < 6 ? Math.min(1, 0.35 + progress * 0.85) : 1 - (f - 5.5) * 0.35;
          for (let m = 0; m < moteCount; m++) {
            const seed = m * 1.91 + 0.4;
            const spread = (9 + (m % 5) * 4.5) * (0.45 + progress * 0.85);
            const mx = 64 + Math.sin(seed * 2.1 + f * 0.5) * spread;
            const climb = ((m * 11 + f * 10) % 68) * (0.35 + progress * 0.75);
            const my = clamp(106 - climb, 18, 108);
            const rad = (m % 3 === 0 ? 5.2 : 3.6) * (1 - progress * 0.25);
            const isGold = m % 4 === 0;
            drawSoftRadialGlow(
              pixels,
              size,
              mx,
              my,
              rad * 1.8,
              isGold ? 253 : 217,
              isGold ? 224 : 70,
              isGold ? 71 : 239,
              185 * moteAlpha
            );
            drawSoftRadialGlow(
              pixels,
              size,
              mx,
              my,
              rad * 0.7,
              255,
              240,
              255,
              235 * moteAlpha
            );
          }
        },
      })
    );
  }
  savePNG(
    'assets/characters/enemies/shadow_creature/death/spritesheet.png',
    packHorizontalSpritesheet(frames),
    manifest,
    'enemy_shadow_creature',
    {
      animation: 'death',
      frameCount: 8,
      frameWidth: 128,
      frameHeight: 128,
      anchor: { x: 64, y: 112 },
    }
  );
}

// 3. ENVIRONMENTS — TILESETS, PROPS, PURIFICATION STAGES & PARALLAX BACKGROUNDS

// Stone Platform Trapezoid Mask (keeps entire stone masonry slab 100% opaque!)
const platformSlabMask = (u, v) => {
  const halfWidthAtV = 0.48 - v * 0.06;
  const distFromCenter = Math.abs(u - 0.5);
  if (distFromCenter <= halfWidthAtV && v <= 0.94) return 1.0;
  return smoothstep(halfWidthAtV + 0.06, halfWidthAtV, distFromCenter);
};

const platMossStone = extractSolidPropSprite(master, 843, 872, 978, 929, platformSlabMask);
savePNG('assets/environments/tilesets/platform_moss_stone.png', platMossStone, manifest, 'tileset');

const platAncientRuin = extractSolidPropSprite(master, 992, 872, 1097, 929, platformSlabMask);
savePNG('assets/environments/tilesets/platform_ancient_ruin.png', platAncientRuin, manifest, 'tileset');

function tintImageVariant(src, rMult, gMult, bMult, topTintRGB) {
  const out = new Uint8Array(src.pixels.length);
  const w = src.width;
  const h = src.height;
  for (let y = 0; y < h; y++) {
    const isTopCrust = y < h * 0.28;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      let r = src.pixels[i];
      let g = src.pixels[i + 1];
      let b = src.pixels[i + 2];
      const a = src.pixels[i + 3];
      if (isTopCrust && topTintRGB) {
        r = Math.round(r * 0.35 + topTintRGB[0] * 0.65);
        g = Math.round(g * 0.35 + topTintRGB[1] * 0.65);
        b = Math.round(b * 0.35 + topTintRGB[2] * 0.65);
      } else {
        r = Math.round(r * rMult);
        g = Math.round(g * gMult);
        b = Math.round(b * bMult);
      }
      out[i] = clamp(r, 0, 255);
      out[i + 1] = clamp(g, 0, 255);
      out[i + 2] = clamp(b, 0, 255);
      out[i + 3] = a;
    }
  }
  return { width: w, height: h, pixels: out };
}

const platCorrupted = tintImageVariant(platMossStone, 0.95, 0.55, 1.25, [192, 38, 211]);
savePNG('assets/environments/tilesets/platform_corrupted_ledge.png', platCorrupted, manifest, 'tileset');

const platSanctuary = tintImageVariant(platMossStone, 1.15, 1.12, 0.9, [253, 224, 71]);
savePNG('assets/environments/tilesets/platform_sanctuary_altar.png', platSanctuary, manifest, 'tileset');

const pillarMask = (u) => (Math.abs(u - 0.5) < 0.32 ? 1.0 : 0.2);
const pillarShort = extractSolidPropSprite(master, 740, 790, 778, 928, pillarMask);
savePNG('assets/environments/tilesets/stone_pillar_short.png', pillarShort, manifest, 'tileset');

const pillarTall = extractSolidPropSprite(master, 787, 766, 833, 928, pillarMask);
savePNG('assets/environments/tilesets/stone_pillar_tall.png', pillarTall, manifest, 'tileset');

// Glowing Props (Mushrooms, Crystals, Arches, Hanging Lantern)
const mushroomCyan = extractBioluminescentSprite(master, 574, 782, 692, 928, {
  eyeZones: [],
  solidLumThreshold: 95,
  glowLow: 14,
  glowScale: 110,
});
savePNG('assets/environments/decorations/mushroom_cyan.png', mushroomCyan, manifest, 'decoration');

const crystalViolet = extractBioluminescentSprite(master, 695, 805, 739, 928, {
  eyeZones: [],
  solidLumThreshold: 85,
  glowLow: 12,
  glowScale: 95,
});
savePNG('assets/environments/decorations/crystal_violet.png', crystalViolet, manifest, 'decoration');

const ruinArch = extractBioluminescentSprite(master, 850, 770, 910, 868, {
  eyeZones: [],
  solidLumThreshold: 65,
  glowLow: 10,
  glowScale: 65,
});
savePNG('assets/environments/decorations/ruin_arch.png', ruinArch, manifest, 'decoration');

const mossArchway = extractBioluminescentSprite(master, 924, 764, 1036, 868, {
  eyeZones: [],
  solidLumThreshold: 65,
  glowLow: 10,
  glowScale: 65,
});
savePNG('assets/environments/decorations/moss_archway.png', mossArchway, manifest, 'decoration');

const hangingLantern = extractBioluminescentSprite(master, 1050, 752, 1098, 885, {
  eyeZones: [],
  solidLumThreshold: 85,
  glowLow: 12,
  glowScale: 95,
});
savePNG('assets/environments/decorations/hanging_lantern.png', hangingLantern, manifest, 'decoration');

// Purification 3-Stage Forest Assets — Organic Dome Vignette Mask (no boxy edges!)
const organicDomeMask = (u, v) => {
  const dx = (u - 0.5) / 0.44;
  const dy = (v - 0.58) / 0.48;
  const r = Math.hypot(dx, dy);
  const dome = smoothstep(1.0, 0.58, r);
  const topEdge = smoothstep(0.0, 0.24, v);
  const bottomEdge = smoothstep(1.0, 0.85, v);
  const sideEdge = smoothstep(0.0, 0.16, u) * smoothstep(1.0, 0.84, u);
  return dome * topEdge * bottomEdge * sideEdge;
};

const treeCorrupted0 = extractSolidPropSprite(master, 991, 620, 1152, 713, organicDomeMask);
savePNG('assets/environments/forest/tree_corrupted_0.png', treeCorrupted0, manifest, 'purification');

const treeTransforming50 = extractSolidPropSprite(master, 1206, 620, 1396, 713, organicDomeMask);
savePNG('assets/environments/forest/tree_transforming_50.png', treeTransforming50, manifest, 'purification');

const treePurified100 = extractSolidPropSprite(master, 1440, 620, 1650, 713, organicDomeMask);
savePNG('assets/environments/forest/tree_purified_100.png', treePurified100, manifest, 'purification');

// 3 Parallax Background Layers
function cropOpaqueLayer(masterImg, x0, y0, x1, y1, featherTop = 0, featherBot = 0, featherSide = 56) {
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    let vFactor = 1.0;
    if (featherTop > 0 && y < featherTop) vFactor *= smoothstep(0, featherTop, y);
    if (featherBot > 0 && h - 1 - y < featherBot) vFactor *= smoothstep(0, featherBot, h - 1 - y);
    for (let x = 0; x < w; x++) {
      let hFactor = 1.0;
      if (featherSide > 0 && x < featherSide) hFactor *= smoothstep(0, featherSide, x);
      if (featherSide > 0 && w - 1 - x < featherSide) hFactor *= smoothstep(0, featherSide, w - 1 - x);
      const srcIdx = ((y0 + y) * masterImg.width + (x0 + x)) * 4;
      const dstIdx = (y * w + x) * 4;
      out[dstIdx] = masterImg.pixels[srcIdx];
      out[dstIdx + 1] = masterImg.pixels[srcIdx + 1];
      out[dstIdx + 2] = masterImg.pixels[srcIdx + 2];
      out[dstIdx + 3] = Math.round(255 * vFactor * hFactor);
    }
  }
  return { width: w, height: h, pixels: out };
}

const bgLayer1 = cropOpaqueLayer(master, 645, 16, 1076, 368, 28, 42, 64);
savePNG('assets/environments/backgrounds/bg_layer_1_sky_citadel.png', bgLayer1, manifest, 'background');

const bgLayer2 = cropOpaqueLayer(master, 235, 408, 865, 725, 36, 36, 68);
savePNG('assets/environments/backgrounds/bg_layer_2_midground_ruins.png', bgLayer2, manifest, 'background');

const bgLayer3 = extractBioluminescentSprite(master, 220, 665, 955, 732, {
  eyeZones: [],
  solidLumThreshold: 90,
  glowLow: 14,
  glowScale: 95,
});
savePNG('assets/environments/backgrounds/bg_layer_3_foreground_roots.png', bgLayer3, manifest, 'background');

// 4. SPECIAL EFFECTS — Bioluminescent Un-Premultiplied Matting
const fxLightBeamBase = extractBioluminescentSprite(master, 12, 774, 184, 886, { eyeZones: [] });
const fxHitImpactBase = extractBioluminescentSprite(master, 192, 774, 299, 886, { eyeZones: [] });
const fxShockwaveBase = extractBioluminescentSprite(master, 314, 774, 451, 886, { eyeZones: [] });
const fxParticlesBase = extractBioluminescentSprite(master, 461, 774, 543, 886, { eyeZones: [] });

// 4A. LIGHT_BEAM Spritesheet (4 frames)
{
  const frames = [];
  for (let f = 0; f < 4; f++) {
    const phase = (f / 4) * Math.PI * 2;
    frames.push(
      renderArticulatedFrame(fxLightBeamBase, FRAME_SIZE, (u, v) => {
        const wave = Math.sin(phase - u * 6.0) * 0.025 * (1 - u);
        const pulse = 1 + Math.sin(phase) * 0.06;
        return { du: 0, dv: wave + (v - 0.5) * (1 - pulse), alphaMult: 1 };
      })
    );
  }
  savePNG('assets/effects/light_beam_spritesheet.png', packHorizontalSpritesheet(frames), manifest, 'effects', {
    frameCount: 4,
    frameWidth: 128,
    frameHeight: 128,
  });
}

// 4B. HIT_IMPACT Spritesheet (6 frames)
{
  const frames = [];
  for (let f = 0; f < 6; f++) {
    const progress = f / 5;
    const scale = 0.65 + progress * 0.55;
    frames.push(
      renderArticulatedFrame(fxHitImpactBase, FRAME_SIZE, (u, v) => ({
        du: (u - 0.5) * (1 - 1 / scale),
        dv: (v - 0.5) * (1 - 1 / scale),
        alphaMult: clamp(1.15 - progress * 0.85, 0.15, 1),
      }))
    );
  }
  savePNG('assets/effects/hit_impact_spritesheet.png', packHorizontalSpritesheet(frames), manifest, 'effects', {
    frameCount: 6,
    frameWidth: 128,
    frameHeight: 128,
  });
}

// 4C. PURIFY_WAVE Spritesheet (6 frames)
{
  const frames = [];
  for (let f = 0; f < 6; f++) {
    const progress = f / 5;
    const scale = 0.6 + progress * 0.6;
    frames.push(
      renderArticulatedFrame(fxShockwaveBase, FRAME_SIZE, (u, v) => ({
        du: (u - 0.5) * (1 - 1 / scale),
        dv: (v - 0.5) * (1 - 1 / scale),
        alphaMult: clamp(1.1 - progress * 0.8, 0.15, 1),
      }))
    );
  }
  savePNG('assets/effects/purify_wave_spritesheet.png', packHorizontalSpritesheet(frames), manifest, 'effects', {
    frameCount: 6,
    frameWidth: 128,
    frameHeight: 128,
  });
}

// 4D. PARTICLES Spritesheet (4 frames)
{
  const frames = [];
  for (let f = 0; f < 4; f++) {
    const phase = (f / 4) * Math.PI * 2;
    frames.push(
      renderArticulatedFrame(fxParticlesBase, FRAME_SIZE, (u, v) => ({
        du: Math.sin(phase + v * 4) * 0.025,
        dv: -((f / 4) * 0.08),
        alphaMult: 1,
      }))
    );
  }
  savePNG('assets/effects/particles_spritesheet.png', packHorizontalSpritesheet(frames), manifest, 'effects', {
    frameCount: 4,
    frameWidth: 128,
    frameHeight: 128,
  });
}

// 5. UI — GOLDEN HEART STRIP
const uiGoldenHearts = extractBioluminescentSprite(master, 1138, 822, 1252, 858, { eyeZones: [] });
savePNG('assets/ui/golden_hearts_strip.png', uiGoldenHearts, manifest, 'ui');

fs.writeFileSync(
  path.resolve(process.cwd(), 'public/assets/manifest.json'),
  JSON.stringify(
    {
      version: '1.3.0',
      generatedAt: new Date().toISOString(),
      totalAssets: manifest.length,
      assets: manifest,
    },
    null,
    2
  )
);

console.log(`Refined ${manifest.length} PNG assets successfully!`);
