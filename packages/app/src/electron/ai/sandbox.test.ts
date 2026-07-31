import type { AgentSandbox } from "@/shared/types/workspace";
import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { realpathSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import {
  isInsideSandbox,
  resolveInSandbox,
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
});
