import { deflateSync } from "node:zlib";

/**
 * Minimal PNG encoder for one fixed job: 8-bit RGB, no alpha, no palette, no interlace.
 *
 * It exists so this package has no native image dependency. sharp pulls a per-platform
 * binary that cannot be embedded by `bun build --compile` — it fails at runtime inside
 * bunfs with "Could not load the sharp module". Node's zlib does the actual compression
 * here, so what is left is the container format, which for this one shape is small.
 *
 * ponytail: deliberately not a general PNG library. 16-bit, alpha, palettes and interlacing
 * are all absent because nothing here produces them. Reach for a real library the day you
 * need one of those rather than growing this.
 */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

/**
 * Apply PNG filter type 1 (Sub) to each scanline: every byte becomes its difference from
 * the pixel three bytes to its left. Screenshots are full of horizontal runs, so this
 * compresses substantially better than storing raw scanlines, for five lines of work.
 */
function filterScanlines(rgb: Buffer, width: number, height: number): Buffer {
  const stride = width * 3;
  const out = Buffer.allocUnsafe((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const src = y * stride;
    const dst = y * (stride + 1);
    out[dst] = 1; // filter: Sub
    for (let i = 0; i < stride; i++) {
      out[dst + 1 + i] = (rgb[src + i] - (i >= 3 ? rgb[src + i - 3] : 0)) & 0xff;
    }
  }
  return out;
}

export function encodePng(rgb: Buffer, width: number, height: number): Buffer {
  if (rgb.length !== width * height * 3) {
    throw new Error(
      `encodePng: expected ${width * height * 3} bytes of RGB, received ${rgb.length}`,
    );
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour RGB
  ihdr[10] = 0; // compression: deflate
  ihdr[11] = 0; // filter method: adaptive
  ihdr[12] = 0; // interlace: none

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(filterScanlines(rgb, width, height), { level: 6 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/**
 * A BGRA frame exactly as a capture API hands it over.
 *
 * `stride` is a separate field and not derived from `width` because CoreGraphics pads each
 * row out to a 32-pixel boundary, so `stride > width * 4` on any display whose *device*
 * width is not a multiple of 32 — which includes the factory-default resolutions of both
 * the 14" and 16" MacBook Pro. Bundling it with the buffer is the point: a caller cannot
 * forget to pass a stride that is part of the frame's own description.
 */
export interface BgraFrame {
  data: Buffer;
  /** Bytes per row, including padding. robotjs calls this `byteWidth`. */
  stride: number;
  width: number;
  height: number;
}

/**
 * Box-filter downscale straight from a BGRA frame to packed RGB.
 *
 * Combined on purpose: the alternative is materialising a second full-size buffer just to
 * swap two channels, and at 3456x2234 that is 30MB of pointless copying per frame.
 *
 * When the ratio is an exact integer — the common Retina case, where device is exactly 2x
 * logical — every output pixel is a clean k*k average. Non-integer ratios fall out of the
 * same arithmetic with slightly uneven source rectangles, which is fine for a screenshot.
 */
export function downscaleBgraToRgb(
  src: BgraFrame,
  dstWidth: number,
  dstHeight: number,
): Buffer {
  const needed = src.stride * src.height;
  if (src.data.length < needed) {
    // A short buffer would otherwise read `undefined`, and `undefined` arithmetic turns
    // into NaN and then into a black pixel — corruption that looks like content.
    throw new Error(
      `downscaleBgraToRgb: frame needs ${needed} bytes at stride ${src.stride}, received ${src.data.length}`,
    );
  }
  if (src.stride < src.width * 4) {
    throw new Error(
      `downscaleBgraToRgb: stride ${src.stride} is narrower than ${src.width} BGRA pixels`,
    );
  }

  const out = Buffer.allocUnsafe(dstWidth * dstHeight * 3);
  const ratioX = src.width / dstWidth;
  const ratioY = src.height / dstHeight;

  for (let y = 0; y < dstHeight; y++) {
    const y0 = Math.floor(y * ratioY);
    const y1 = Math.max(y0 + 1, Math.min(src.height, Math.ceil((y + 1) * ratioY)));

    for (let x = 0; x < dstWidth; x++) {
      const x0 = Math.floor(x * ratioX);
      const x1 = Math.max(x0 + 1, Math.min(src.width, Math.ceil((x + 1) * ratioX)));

      let b = 0;
      let g = 0;
      let r = 0;
      for (let sy = y0; sy < y1; sy++) {
        // Row base uses the stride; the x range stays clamped to width, so padding bytes
        // past the end of a row are never read.
        let idx = sy * src.stride + x0 * 4;
        for (let sx = x0; sx < x1; sx++) {
          b += src.data[idx];
          g += src.data[idx + 1];
          r += src.data[idx + 2];
          idx += 4;
        }
      }

      const count = (x1 - x0) * (y1 - y0);
      const dst = (y * dstWidth + x) * 3;
      out[dst] = (r / count + 0.5) | 0;
      out[dst + 1] = (g / count + 0.5) | 0;
      out[dst + 2] = (b / count + 0.5) | 0;
    }
  }

  return out;
}
