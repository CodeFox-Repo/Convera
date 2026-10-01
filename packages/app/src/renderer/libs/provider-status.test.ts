import { describe, expect, it } from "vitest";
import { describeProviderStatus } from "./provider-status";

describe("provider guidance", () => {
  it("does not claim a configured API key has been validated", () => {
    expect(
      describeProviderStatus({ kind: "openai-api", availability: "available" }),
    ).toMatchObject({ label: "Configured", ready: true });
  });
  it.each([
    ["openai-api", "OPENAI_API_KEY"],
    ["fireworks-api", "FIREWORKS_API_KEY"],
  ] as const)("explains setup for %s", (kind, variable) => {
    const status = describeProviderStatus({
      kind,
      availability: "missing",
      detail: `${variable} not set`,
    });
    expect(status.ready).toBe(false);
    expect(status.hint).toContain(variable);
    expect(status.hint).toContain("restart Convera");
  });
  it("explains sign-in recovery and distinguishes checks from setup", () => {
    expect(
      describeProviderStatus({
        kind: "codex-cli",
        availability: "unauthenticated",
      }).hint,
    ).toContain("Sign in with Codex");
    expect(
      describeProviderStatus({ kind: "codex-cli", availability: "error" }).hint,
    ).toContain("Re-check providers");
    expect(
      describeProviderStatus(
        { kind: "openai-api", availability: "available" },
        true,
      ),
    ).toMatchObject({ label: "Checking…", ready: false });
  });
});
