import { describe, expect, it } from "vitest";
import { downscaleBgraToRgb, encodePng, type BgraFrame } from "./png";

/**
 * Builds a BGRA frame whose rows are padded, the way CoreGraphics actually delivers them.
 * Padding bytes get a loud sentinel so that reading them shows up as an obvious wrong
 * colour rather than a plausible one.
 *
 * These tests carry the weight because no machine we run on will reproduce the condition:
 * padding only appears when the device width is not a multiple of 32, and the development
 * Mac happens to be 3456 device pixels wide. The bug this pins was invisible for exactly
 * that reason while being live on the default resolution of a 14" MacBook Pro.
 */
function paddedFrame(width: number, height: number, padPixels: number): BgraFrame {
  const stride = (width + padPixels) * 4;
  const data = Buffer.alloc(stride * height, 0xee); // 0xee everywhere = sentinel
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * stride + x * 4;
      data[i] = 10 + y; // B
      data[i + 1] = 100 + y; // G
      data[i + 2] = 200 + y; // R
      data[i + 3] = 0xff;
    }
  }
  return { data, stride, width, height };
}

describe("downscaleBgraToRgb", () => {
  it("reads rows at the stride, not at width*4", () => {
    const frame = paddedFrame(6, 4, 2);
    const out = downscaleBgraToRgb(frame, 6, 4);

    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 6; x++) {
        const o = (y * 6 + x) * 3;
        expect([out[o], out[o + 1], out[o + 2]]).toEqual([200 + y, 100 + y, 10 + y]);
      }
    }
  });

  it("never lets a padding byte reach the output", () => {
    const out = downscaleBgraToRgb(paddedFrame(6, 4, 2), 6, 4);
    expect(out.includes(0xee)).toBe(false);
  });

  it("is an exact 2x2 average when halving", () => {
    const frame = paddedFrame(4, 4, 3);
    const out = downscaleBgraToRgb(frame, 2, 2);
    // Rows 0 and 1 average to y=0.5 -> R 200.5 rounds to 201, G 100.5 -> 101, B 10.5 -> 11.
    expect([out[0], out[1], out[2]]).toEqual([201, 101, 11]);
  });

  it("converts BGRA to RGB rather than passing the byte order through", () => {
    const out = downscaleBgraToRgb(paddedFrame(2, 1, 1), 2, 1);
    expect([out[0], out[1], out[2]]).toEqual([200, 100, 10]);
  });

  it("throws on a short buffer instead of painting black from NaN", () => {
    const frame = paddedFrame(4, 4, 0);
    const truncated: BgraFrame = { ...frame, data: frame.data.subarray(0, frame.data.length - 20) };
    expect(() => downscaleBgraToRgb(truncated, 2, 2)).toThrow(/needs \d+ bytes/);
  });

  it("rejects a stride narrower than the pixels it claims to hold", () => {
    const frame = paddedFrame(4, 4, 0);
    expect(() => downscaleBgraToRgb({ ...frame, stride: 8 }, 2, 2)).toThrow(/narrower/);
  });
});

describe("encodePng", () => {
  it("writes the signature, and the dimensions the agent will click in", () => {
    const png = encodePng(Buffer.alloc(6 * 4 * 3, 0x40), 6, 4);
    expect(png.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    expect(png.subarray(12, 16).toString("ascii")).toBe("IHDR");
    expect(png.readUInt32BE(16)).toBe(6);
    expect(png.readUInt32BE(20)).toBe(4);
    expect(png.subarray(png.length - 8, png.length - 4).toString("ascii")).toBe("IEND");
  });

  it("refuses a buffer that is not exactly width*height*3", () => {
    expect(() => encodePng(Buffer.alloc(10), 6, 4)).toThrow(/expected 72 bytes/);
  });
});
