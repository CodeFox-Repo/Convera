import { describe, expect, it, vi } from "vitest";
import { probeCliProvider, type CliCommandRunner } from "../cli-probe";

describe("probeCliProvider", () => {
  it("detects an authenticated Claude Code CLI from the configured path", async () => {
    const run = vi.fn<CliCommandRunner>(async (_command, args) => {
      if (args[0] === "--version") {
        return { stdout: "2.1.217 (Claude Code)\n", stderr: "" };
      }
      return {
        stdout: JSON.stringify({ loggedIn: true, authMethod: "oauth_token" }),
        stderr: "",
      };
    });

    const status = await probeCliProvider("claude-code", {
      run,
      environment: { CONVERA_CLAUDE_PATH: "/custom/claude" },
      homeDirectory: "/home/test",
    });

    expect(status).toMatchObject({
      id: "claude-code",
      available: true,
      authenticated: true,
      version: "2.1.217 (Claude Code)",
      executablePath: "/custom/claude",
    });
    expect(run).toHaveBeenNthCalledWith(1, "/custom/claude", ["--version"]);
  });

  it("reports an installed but logged-out Codex CLI", async () => {
    const run = vi.fn<CliCommandRunner>(async (_command, args) => {
      if (args[0] === "--version") {
        return { stdout: "codex-cli 0.146.0\n", stderr: "" };
      }
      throw new Error("Not logged in");
    });

    const status = await probeCliProvider("codex-cli", {
      run,
      environment: { CONVERA_CODEX_PATH: "/custom/codex" },
      homeDirectory: "/home/test",
    });

    expect(status).toMatchObject({
      id: "codex-cli",
      available: true,
      authenticated: false,
      version: "codex-cli 0.146.0",
      executablePath: "/custom/codex",
      detail: "Not logged in",
    });
  });

  it("tries all safe candidates before reporting a missing CLI", async () => {
    const run = vi.fn<CliCommandRunner>(async () => {
      throw new Error("ENOENT");
    });

    const status = await probeCliProvider("claude-code", {
      run,
      environment: {},
      homeDirectory: "/home/test",
    });

    expect(status.available).toBe(false);
    expect(status.authenticated).toBe(false);
    expect(status.detail).toContain("was not found");
    expect(run).toHaveBeenCalledWith("/home/test/.local/bin/claude", [
      "--version",
    ]);
    expect(run).toHaveBeenCalledWith("claude", ["--version"]);
  });
});
