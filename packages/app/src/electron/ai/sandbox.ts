import type { AgentSandbox } from "@/shared/types/workspace";
import { realpathSync } from "node:fs";
import { isAbsolute, resolve, sep } from "node:path";

/**
 * Enforces an agent's filesystem boundary.
 *
 * This is the layer that holds even when a provider enforces nothing of its own
 * (`claude-code` currently does not). Every file tool must route through it.
 */

export class SandboxViolationError extends Error {
  constructor(
    readonly attemptedPath: string,
    readonly reason: "escape" | "not-writable",
  ) {
    super(
      reason === "escape"
        ? `Path "${attemptedPath}" resolves outside the agent sandbox`
        : `Path "${attemptedPath}" is inside the sandbox but not writable`,
    );
    this.name = "SandboxViolationError";
  }
}

/**
 * True when `candidate` is `parent` or sits beneath it.
 *
 * Compares path segments rather than raw string prefixes: a prefix test would
 * accept "/sandbox-evil" for parent "/sandbox".
 */
function isWithin(parent: string, candidate: string): boolean {
  if (candidate === parent) return true;
  return candidate.startsWith(parent.endsWith(sep) ? parent : parent + sep);
}

/**
 * Resolves symlinks as far as the path exists.
 *
 * A file being created does not exist yet, so `realpath` on the full path would
 * throw. Walking up to the nearest existing ancestor still defeats symlinked
 * parent directories, which is the escape that matters.
 */
function realpathOfNearestExisting(target: string): string {
  let current = target;

  for (;;) {
    try {
      const real = realpathSync(current);
      return current === target
        ? real
        : resolve(real, target.slice(current.length + 1));
    } catch {
      const parent = resolve(current, "..");
      // Reached the filesystem root without finding anything that exists.
      if (parent === current) return target;
      current = parent;
    }
  }
}

/**
 * Resolve `requestedPath` for `sandbox`, or throw.
 *
 * Relative paths are taken against the sandbox root. Absolute paths are allowed
 * but must still land inside it.
 */
export function resolveInSandbox(
  sandbox: AgentSandbox,
  requestedPath: string,
  access: "read" | "write" = "read",
): string {
  const root = realpathOfNearestExisting(resolve(sandbox.root));
  const target = isAbsolute(requestedPath)
    ? resolve(requestedPath)
    : resolve(root, requestedPath);

  const resolved = realpathOfNearestExisting(target);

  if (!isWithin(root, resolved)) {
    throw new SandboxViolationError(requestedPath, "escape");
  }

  if (access === "write") {
    const writable = sandbox.writableRoots.some((writableRoot) =>
      isWithin(realpathOfNearestExisting(resolve(writableRoot)), resolved),
    );
    if (!writable) {
      throw new SandboxViolationError(requestedPath, "not-writable");
    }
  }

  return resolved;
}

/** Non-throwing form, for callers that want to branch instead of catch. */
export function isInsideSandbox(
  sandbox: AgentSandbox,
  requestedPath: string,
  access: "read" | "write" = "read",
): boolean {
  try {
    resolveInSandbox(sandbox, requestedPath, access);
    return true;
  } catch {
    return false;
  }
}
