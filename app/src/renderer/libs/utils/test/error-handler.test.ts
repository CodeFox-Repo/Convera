import { describe, expect, it } from "vitest";
import { ErrorCode, parseApiError } from "../error-handler";

describe("parseApiError", () => {
  it("handles response status", () => {
    const err = { response: { status: 401 } } as any;
    const res = parseApiError(err);
    expect(res).toEqual({
      message: "Authentication failed! Please add a valid API key in settings",
      code: ErrorCode.AUTH_NO_API_KEY,
      action: "settings",
    });
  });

  it("handles status field", () => {
    const err = { status: 400 } as any;
    const res = parseApiError(err);
    expect(res).toEqual({
      message: "Invalid request format",
      code: ErrorCode.INVALID_REQUEST,
      action: "retry",
    });
  });

  it("parses json message", () => {
    const err = { message: '{"error":"Bad","code":"SERVER_ERROR"}' } as any;
    const res = parseApiError(err);
    expect(res).toEqual({
      message: "Bad",
      code: "SERVER_ERROR",
      action: null,
    });
  });

  it("uses simple message", () => {
    const err = { message: "oops" } as any;
    const res = parseApiError(err);
    expect(res.message).toBe("oops");
    expect(res.code).toBe(ErrorCode.UNKNOWN_ERROR);
  });
});
