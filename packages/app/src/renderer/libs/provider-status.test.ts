import { describe, expect, it } from "vitest";
import { describeProviderStatus } from "./provider-status";

describe("describeProviderStatus", () => {
  it("reports a ready provider", () => {
    expect(
      describeProviderStatus({
        kind: "openai-api",
        availability: "available",
        detail: "OpenAI API key configured",
      }),
    ).toEqual({
      label: "Ready",
      ready: true,
      hint: "OpenAI API key configured",
    });
  });

  it("keeps the adapter's own hint, which names the missing key or command", () => {
    expect(
      describeProviderStatus({
        kind: "openai-api",
        availability: "missing",
        detail: "OPENAI_API_KEY not set",
      }),
    ).toMatchObject({ label: "No API key", hint: "OPENAI_API_KEY not set" });

    expect(
      describeProviderStatus({
        kind: "claude-code",
        availability: "unauthenticated",
        detail: 'Run "claude login" to authenticate.',
      }),
    ).toMatchObject({
      label: "Sign-in required",
      hint: 'Run "claude login" to authenticate.',
    });
  });

  it("distinguishes a missing key from a missing CLI when the probe gave no detail", () => {
    expect(
      describeProviderStatus({ kind: "fireworks-api", availability: "missing" })
        .hint,
    ).toBe("No API key is set for this provider.");
    expect(
      describeProviderStatus({ kind: "codex-cli", availability: "missing" })
        .hint,
    ).toBe("The command-line tool for this provider was not found.");
  });

  it("treats every non-available state as not ready", () => {
    for (const availability of [
      "missing",
      "unauthenticated",
      "unavailable",
      "error",
    ] as const) {
      expect(
        describeProviderStatus({ kind: "codex-cli", availability }).ready,
      ).toBe(false);
    }
  });

  it("does not claim a provider is broken while the probe is still running", () => {
    expect(
      describeProviderStatus(
        { kind: "codex-cli", availability: "unavailable" },
        true,
      ),
    ).toEqual({ label: "Checking", ready: false });
  });
});
