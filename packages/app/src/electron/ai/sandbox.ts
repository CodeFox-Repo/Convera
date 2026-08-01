import type { AgentSandbox } from "@/shared/types/workspace";
import type { ToolDefinition } from "@/shared/types/mcp";
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

export class SandboxToolPolicyError extends Error {
  constructor(
    readonly qualifiedName: string,
    reason: string,
  ) {
    super(
      `Tool "${qualifiedName}" is not safe for this agent sandbox: ${reason}`,
    );
    this.name = "SandboxToolPolicyError";
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
    const writable = sandbox.writableRoots.some((writableRoot) => {
      const resolvedWritableRoot = realpathOfNearestExisting(
        resolve(writableRoot),
      );
      return (
        isWithin(root, resolvedWritableRoot) &&
        isWithin(resolvedWritableRoot, resolved)
      );
    });
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * MCP has no standard filesystem-capability declaration. Keep the accepted
 * vocabulary deliberately narrow: a host tool without an explicit builtin
 * policy or a canonicalizable filesystem boundary is refused.
 */
function isPathProperty(name: string): boolean {
  return /^(?:path|paths|file|files|file_path|file_paths|filepath|filepaths|directory|directories|dir|dirs|cwd|root|workspace)$/i.test(
    name,
  );
}

interface CanonicalizedToolInput {
  input: Record<string, unknown>;
  pathCount: number;
}

function canonicalizeSchemaValue(
  sandbox: AgentSandbox,
  schema: unknown,
  value: unknown,
  propertyName: string,
  access: "read" | "write",
): { value: unknown; pathCount: number } {
  if (isPathProperty(propertyName)) {
    if (typeof value === "string") {
      return {
        value: resolveInSandbox(sandbox, value, access),
        pathCount: 1,
      };
    }
    if (
      Array.isArray(value) &&
      value.every((entry) => typeof entry === "string")
    ) {
      return {
        value: value.map((entry) => resolveInSandbox(sandbox, entry, access)),
        pathCount: value.length,
      };
    }
    throw new SandboxToolPolicyError(
      propertyName,
      "path arguments must be strings or arrays of strings",
    );
  }

  if (Array.isArray(value)) {
    const itemSchema = isRecord(schema) ? schema.items : undefined;
    let pathCount = 0;
    const items = value.map((entry) => {
      const canonicalized = canonicalizeSchemaValue(
        sandbox,
        itemSchema,
        entry,
        propertyName,
        access,
      );
      pathCount += canonicalized.pathCount;
      return canonicalized.value;
    });
    return { value: items, pathCount };
  }

  if (isRecord(value)) {
    const properties =
      isRecord(schema) && isRecord(schema.properties) ? schema.properties : {};
    let pathCount = 0;
    const entries = Object.entries(value).map(([name, entry]) => {
      const canonicalized = canonicalizeSchemaValue(
        sandbox,
        properties[name],
        entry,
        name,
        access,
      );
      pathCount += canonicalized.pathCount;
      return [name, canonicalized.value] as const;
    });
    return { value: Object.fromEntries(entries), pathCount };
  }

  return { value, pathCount: 0 };
}

/**
 * Enforce Convera's host-tool policy immediately before an Electron/MCP call.
 *
 * Provider-native sandboxes do not constrain tools executed by Electron, so
 * this policy is deliberately provider-independent. MCP's `openWorldHint` is
 * only a semantic hint and is not treated as a network permission.
 */
export function canonicalizeToolInputForSandbox(options: {
  sandbox: AgentSandbox;
  serverName: string;
  definition: ToolDefinition;
  input: Record<string, unknown>;
}): CanonicalizedToolInput {
  const { sandbox, serverName, definition, input } = options;
  const qualifiedName = `${serverName}:${definition.name}`;
  const isBuiltin = serverName.toLowerCase() === "builtin";

  if (isBuiltin) {
    switch (definition.name) {
      case "ask_user_input":
      case "computer_control":
        return { input, pathCount: 0 };
      case "web_fetch":
        if (!sandbox.networkAccess) {
          throw new SandboxToolPolicyError(
            qualifiedName,
            "network access is disabled",
          );
        }
        return { input, pathCount: 0 };
      case "execute_command":
        // The unsandboxed host shell stays refused; agents get the seatbelt-
        // wrapped `run_command` from basic-tools instead.
        throw new SandboxToolPolicyError(
          qualifiedName,
          "host shell execution has no enforceable OS sandbox — use run_command",
        );
      default:
        throw new SandboxToolPolicyError(
          qualifiedName,
          "the builtin tool has no Convera host capability policy",
        );
    }
  }

  const schema = definition.inputSchema ?? definition.parameters;
  const access =
    definition.annotations?.readOnlyHint === true ? "read" : "write";
  const canonicalized = canonicalizeSchemaValue(
    sandbox,
    schema,
    input,
    "",
    access,
  );
  if (!isRecord(canonicalized.value)) {
    throw new SandboxToolPolicyError(
      qualifiedName,
      "tool input must be an object",
    );
  }

  if (canonicalized.pathCount === 0) {
    throw new SandboxToolPolicyError(
      qualifiedName,
      "the MCP tool exposes no canonicalizable filesystem boundary",
    );
  }

  return {
    input: canonicalized.value,
    pathCount: canonicalized.pathCount,
  };
}
