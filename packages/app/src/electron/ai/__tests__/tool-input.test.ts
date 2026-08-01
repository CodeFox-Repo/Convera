import { describe, expect, it } from "vitest";
import { z } from "zod";
import { normalizeToolInput, parseToolInput } from "../tool-input";

/**
 * The four ways a model spells an optional field it is not using. Only the
 * first two are what Zod expects; the other two arrive just as often, and
 * before this layer existed they failed validation and cost the whole turn.
 */
const SPELLINGS = [
  ["omitted", {}],
  ["undefined", { note: undefined }],
  ["null", { note: null }],
] as const;

describe("normalizeToolInput", () => {
  it("drops null so optional and default behave as written", () => {
    expect(normalizeToolInput({ a: null, b: 1 })).toEqual({ b: 1 });
  });

  it("keeps an empty string, which is a real value to some tools", () => {
    // Writing an empty file is a legitimate request; whether "" is allowed
    // stays a question for the field's own schema.
    expect(normalizeToolInput({ content: "" })).toEqual({ content: "" });
  });

  it("reaches into nested objects and arrays", () => {
    expect(
      normalizeToolInput({
        outer: { inner: null, kept: 1 },
        list: [{ x: null }],
      }),
    ).toEqual({ outer: { kept: 1 }, list: [{}] });
  });

  it("leaves primitives and null itself alone", () => {
    expect(normalizeToolInput("text")).toBe("text");
    expect(normalizeToolInput(7)).toBe(7);
    expect(normalizeToolInput(null)).toBe(null);
  });
});

describe("parseToolInput", () => {
  const schema = z.object({
    required: z.string().min(1),
    note: z.string().min(1).max(64).optional(),
    limit: z.number().int().min(1).default(30),
  });

  for (const [label, extra] of SPELLINGS) {
    it(`accepts an optional field written as ${label}`, () => {
      const parsed = parseToolInput(schema, { required: "x", ...extra });
      expect(parsed.note).toBeUndefined();
      // A default must still apply — that is the other thing null broke.
      expect(parsed.limit).toBe(30);
    });
  }

  it("applies defaults when the field is explicitly null", () => {
    expect(parseToolInput(schema, { required: "x", limit: null }).limit).toBe(
      30,
    );
  });

  it("still carries a real value through untouched", () => {
    const parsed = parseToolInput(schema, {
      required: "x",
      note: "see message 7",
      limit: 5,
    });
    expect(parsed).toEqual({ required: "x", note: "see message 7", limit: 5 });
  });

  it("still rejects input that is genuinely invalid", () => {
    // Leniency about "not provided" must not become leniency about wrong.
    expect(() => parseToolInput(schema, { required: "" })).toThrow();
    expect(() => parseToolInput(schema, {})).toThrow();
    expect(() =>
      parseToolInput(schema, { required: "x", limit: "many" }),
    ).toThrow();
  });
});
