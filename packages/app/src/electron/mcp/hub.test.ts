import { ConnectionStatus } from "@/shared/types/mcp";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MCPHub } from "./hub";

vi.mock("electron", () => ({
  app: {
    getAppPath: () => "/test/convera",
    getPath: () => tmpdir(),
    getVersion: () => "0.0.0-test",
  },
}));

const tempDirectories: string[] = [];

function configPath(): string {
  const directory = mkdtempSync(join(tmpdir(), "convera-cua-mcp-"));
  tempDirectories.push(directory);
  return join(directory, "mcp.json");
}

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("managed Cua MCP server", () => {
  it("adds the official cua-driver stdio server to the default config", () => {
    const path = configPath();
    const hub = new MCPHub(path);

    expect(hub.getConfig().mcpServers.cua).toEqual({
      name: "Cua",
      description: "Convera-managed Cua Driver computer-use tools",
      command: "cua-driver",
      args: ["mcp"],
      managed: true,
      disabled: false,
    });
    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual(hub.getConfig());
  });

  it("preserves only the user's disabled choice for the managed server", async () => {
    const path = configPath();
    writeFileSync(
      path,
      JSON.stringify({
        mcpServers: {
          cua: {
            command: "legacy-computer-control",
            args: ["fallback"],
            disabled: true,
          },
        },
      }),
    );
    const hub = new MCPHub(path);

    expect(hub.getConfig().mcpServers.cua).toMatchObject({
      command: "cua-driver",
      args: ["mcp"],
      managed: true,
      disabled: true,
    });

    const status = await hub.updateServer("cua", {
      command: "another-driver",
      disabled: true,
    });
    expect(status).toMatchObject({
      name: "cua",
      status: ConnectionStatus.DISABLED,
      managed: true,
    });
    expect(hub.getConfig().mcpServers.cua.command).toBe("cua-driver");
  });

  it("protects the managed server from replacement and removal", async () => {
    const hub = new MCPHub(configPath());

    await expect(
      hub.addServer("cua", { command: "replacement" }),
    ).rejects.toThrow("managed by Convera");
    await expect(hub.removeServer("cua")).rejects.toThrow(
      "cannot be removed; disable it instead",
    );
    expect(hub.getConfig().mcpServers.cua).toBeDefined();

    await hub.addServer("custom", {
      command: "custom-server",
      disabled: true,
      managed: true,
    });
    expect(hub.getConfig().mcpServers.custom.managed).toBeUndefined();
    await expect(hub.removeServer("custom")).resolves.toBeUndefined();
  });

  it("does not block startup and reports a clear error when cua-driver is missing", async () => {
    const hub = new MCPHub(configPath());
    const originalPath = process.env.PATH;
    process.env.PATH = mkdtempSync(join(tmpdir(), "convera-empty-path-"));
    tempDirectories.push(process.env.PATH);

    try {
      await expect(hub.initialize()).resolves.toBeUndefined();
      await vi.waitFor(() => {
        expect(hub.getServerStatus("cua")).toMatchObject({
          status: ConnectionStatus.ERROR,
          error: expect.stringContaining(
            "Managed Cua MCP is unavailable: executable 'cua-driver' was not found on PATH",
          ),
          managed: true,
        });
      });
    } finally {
      if (originalPath === undefined) {
        delete process.env.PATH;
      } else {
        process.env.PATH = originalPath;
      }
      await hub.cleanup();
    }
  });

  it("connects to cua-driver mcp and exposes its native MCP tools", async () => {
    const hub = new MCPHub(configPath());
    const binDirectory = mkdtempSync(join(tmpdir(), "convera-cua-bin-"));
    tempDirectories.push(binDirectory);
    const executable = join(binDirectory, "cua-driver");
    const fixture = resolve(
      process.cwd(),
      "src/electron/mcp/__fixtures__/cua-driver.mjs",
    );
    writeFileSync(
      executable,
      `#!/bin/sh\nexec '${process.execPath}' '${fixture}' "$@"\n`,
    );
    chmodSync(executable, 0o755);
    const originalPath = process.env.PATH;
    process.env.PATH = binDirectory;

    try {
      await hub.initialize();
      await vi.waitFor(() => {
        expect(hub.getServerStatus("cua")).toMatchObject({
          status: ConnectionStatus.CONNECTED,
          capabilities: {
            tools: [
              expect.objectContaining({
                name: "screenshot",
                inputSchema: expect.objectContaining({ type: "object" }),
              }),
            ],
          },
        });
      });

      await expect(
        hub.callTool("cua", "screenshot", { label: "native MCP result" }),
      ).resolves.toMatchObject({
        content: [{ type: "text", text: "native MCP result" }],
      });
      expect(hub.getConfig().mcpServers.cua).toMatchObject({
        command: "cua-driver",
        args: ["mcp"],
      });
    } finally {
      if (originalPath === undefined) {
        delete process.env.PATH;
      } else {
        process.env.PATH = originalPath;
      }
      await hub.cleanup();
    }
  });
});
