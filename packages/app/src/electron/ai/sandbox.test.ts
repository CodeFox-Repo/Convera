import type { AgentSandbox } from "@/shared/types/workspace";
import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { realpathSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import {
  canonicalizeToolInputForSandbox,
  isInsideSandbox,
  resolveInSandbox,
  SandboxToolPolicyError,
  SandboxViolationError,
} from "./sandbox";

const base = mkdtempSync(join(tmpdir(), "convera-sandbox-"));
const agentRoot = join(base, "agents", "fizz");
const otherAgentRoot = join(base, "agents", "honey");
const workspace = join(agentRoot, "workspace");
const secrets = join(base, "secrets");

mkdirSync(workspace, { recursive: true });
mkdirSync(join(agentRoot, "memory"), { recursive: true });
mkdirSync(otherAgentRoot, { recursive: true });
mkdirSync(secrets, { recursive: true });
writeFileSync(join(agentRoot, "SOUL.md"), "# Fizz");
writeFileSync(join(secrets, "id_rsa"), "PRIVATE");
writeFileSync(join(otherAgentRoot, "SOUL.md"), "# Honey");

const sandbox: AgentSandbox = {
  root: agentRoot,
  writableRoots: [workspace],
  networkAccess: false,
};

afterAll(() => {
  // Left in the OS temp dir on purpose; removing trees in tests is riskier
  // than the few KB it costs.
});

describe("resolveInSandbox", () => {
  // macOS resolves /var -> /private/var, so compare against real paths.
  const realAgentRoot = realpathSync(agentRoot);
  const realWorkspace = realpathSync(workspace);

  it("allows reads inside the sandbox", () => {
    expect(resolveInSandbox(sandbox, "SOUL.md")).toBe(
      resolve(realAgentRoot, "SOUL.md"),
    );
    expect(resolveInSandbox(sandbox, "memory")).toBe(
      resolve(realAgentRoot, "memory"),
    );
  });

  it("rejects ../ escapes, including deeply nested ones", () => {
    expect(() => resolveInSandbox(sandbox, "../honey/SOUL.md")).toThrow(
      SandboxViolationError,
    );
    expect(() =>
      resolveInSandbox(sandbox, "workspace/../../../secrets/id_rsa"),
    ).toThrow(SandboxViolationError);
    expect(() => resolveInSandbox(sandbox, "../../secrets/id_rsa")).toThrow(
      SandboxViolationError,
    );
  });

  it("rejects absolute paths outside the sandbox", () => {
    expect(() => resolveInSandbox(sandbox, join(secrets, "id_rsa"))).toThrow(
      SandboxViolationError,
    );
    expect(() => resolveInSandbox(sandbox, "/etc/passwd")).toThrow(
      SandboxViolationError,
    );
  });

  it("rejects a symlink that points out of the sandbox", () => {
    const link = join(agentRoot, "escape-link");
    try {
      symlinkSync(secrets, link);
    } catch {
      return; // symlinks unavailable (e.g. Windows without privilege)
    }
    // The path looks internal but resolves outside — a prefix check would pass.
    expect(() => resolveInSandbox(sandbox, "escape-link/id_rsa")).toThrow(
      SandboxViolationError,
    );
  });

  it("rejects a sibling directory sharing the root's name prefix", () => {
    const sibling = `${agentRoot}-evil`;
    mkdirSync(sibling, { recursive: true });
    expect(() => resolveInSandbox(sandbox, sibling)).toThrow(
      SandboxViolationError,
    );
  });

  it("separates readable from writable", () => {
    // SOUL.md is readable but must not be writable — only workspace/ is.
    expect(isInsideSandbox(sandbox, "SOUL.md", "read")).toBe(true);
    expect(isInsideSandbox(sandbox, "SOUL.md", "write")).toBe(false);
    expect(isInsideSandbox(sandbox, "workspace/draft.md", "write")).toBe(true);
  });

  it("allows a not-yet-existing file inside a writable root", () => {
    expect(resolveInSandbox(sandbox, "workspace/new.md", "write")).toBe(
      resolve(realWorkspace, "new.md"),
    );
  });

  it("rejects a not-yet-existing file outside the sandbox", () => {
    expect(() =>
      resolveInSandbox(sandbox, "../honey/planted.md", "write"),
    ).toThrow(SandboxViolationError);
  });

  it("rejects writable roots that themselves escape the sandbox", () => {
    expect(() =>
      resolveInSandbox(
        { ...sandbox, writableRoots: [secrets] },
        join(secrets, "planted.md"),
        "write",
      ),
    ).toThrow(SandboxViolationError);
  });
});

describe("canonicalizeToolInputForSandbox", () => {
  it("canonicalizes host MCP path arguments using read/write annotations", () => {
    const read = canonicalizeToolInputForSandbox({
      sandbox,
      serverName: "repo",
      definition: {
        name: "read_file",
        annotations: { readOnlyHint: true, openWorldHint: false },
        inputSchema: {
          type: "object",
          properties: { path: { type: "string" } },
        },
      },
      input: { path: "SOUL.md" },
    });
    expect(read.input.path).toBe(resolve(realpathSync(agentRoot), "SOUL.md"));

    const write = canonicalizeToolInputForSandbox({
      sandbox,
      serverName: "repo",
      definition: {
        name: "write_file",
        annotations: { readOnlyHint: false, openWorldHint: false },
        inputSchema: {
          type: "object",
          properties: { file_path: { type: "string" } },
        },
      },
      input: { file_path: "workspace/new.md" },
    });
    expect(write.input.file_path).toBe(
      resolve(realpathSync(workspace), "new.md"),
    );
  });

  it("rejects escaped, open-world, and opaque host tool calls", () => {
    expect(() =>
      canonicalizeToolInputForSandbox({
        sandbox,
        serverName: "repo",
        definition: {
          name: "read_file",
          annotations: { readOnlyHint: true, openWorldHint: false },
          inputSchema: {
            type: "object",
            properties: { path: { type: "string" } },
          },
        },
        input: { path: "../honey/SOUL.md" },
      }),
    ).toThrow(SandboxViolationError);

    expect(() =>
      canonicalizeToolInputForSandbox({
        sandbox,
        serverName: "builtin",
        definition: {
          name: "web_fetch",
          annotations: { readOnlyHint: true, openWorldHint: true },
        },
        input: { url: "https://example.com" },
      }),
    ).toThrow(SandboxToolPolicyError);

    expect(() =>
      canonicalizeToolInputForSandbox({
        sandbox,
        serverName: "external",
        definition: {
          name: "execute",
          inputSchema: {
            type: "object",
            properties: { command: { type: "string" } },
          },
        },
        input: { command: "cat /etc/passwd" },
      }),
    ).toThrow(SandboxToolPolicyError);
  });

  it("keeps computer control independent from network permission", () => {
    expect(
      canonicalizeToolInputForSandbox({
        sandbox,
        serverName: "builtin",
        definition: {
          name: "computer_control",
          annotations: {
            readOnlyHint: false,
            destructiveHint: true,
            openWorldHint: true,
          },
        },
        input: { action: "screenshot" },
      }).input,
    ).toEqual({ action: "screenshot" });
  });

  it("rejects host shell execution for every provider sandbox", () => {
    expect(() =>
      canonicalizeToolInputForSandbox({
        sandbox: { ...sandbox, networkAccess: true },
        serverName: "builtin",
        definition: {
          name: "execute_command",
          annotations: {
            readOnlyHint: false,
            destructiveHint: true,
            openWorldHint: true,
          },
        },
        input: { command: "pwd" },
      }),
    ).toThrow("host shell execution has no enforceable OS sandbox");
  });

  it("allows web fetch only for a network-enabled agent", () => {
    expect(
      canonicalizeToolInputForSandbox({
        sandbox: { ...sandbox, networkAccess: true },
        serverName: "builtin",
        definition: {
          name: "web_fetch",
          annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            openWorldHint: true,
          },
        },
        input: { url: "https://example.com" },
      }).input,
    ).toEqual({ url: "https://example.com" });
  });
});
