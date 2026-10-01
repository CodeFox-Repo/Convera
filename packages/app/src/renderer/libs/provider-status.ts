import type {
  LocalAIProviderKind,
  LocalAIProviderStatus,
} from "@/shared/types/local-ai";

/**
 * A provider that keys off an environment variable rather than an executable.
 * The runtime collapses both into `availability: "missing"`, so the kind is the
 * only thing that says whether the user is missing an install or an API key.
 */
const KEYED_KINDS: ReadonlySet<LocalAIProviderKind> = new Set([
  "openai-api",
  "fireworks-api",
  "openai-compatible",
]);

export interface ProviderStatusDescription {
  /** Short badge text. */
  label: string;
  /** Whether a turn pinned to this provider can run right now. */
  ready: boolean;
  /** What the user has to do about it, when there is something to do. */
  hint?: string;
}

export function describeProviderStatus(
  provider: Pick<LocalAIProviderStatus, "kind" | "availability" | "detail">,
  loading = false,
): ProviderStatusDescription {
  if (loading) {
    return {
      label: "Checking…",
      ready: false,
      hint: "Checking provider setup…",
    };
  }
  const keyed = KEYED_KINDS.has(provider.kind);
  switch (provider.availability) {
    case "available":
      return {
        label: keyed ? "Configured" : "Ready",
        ready: true,
        hint: keyed
          ? "API key configured. Provider usage charges may apply."
          : provider.detail,
      };
    case "unauthenticated":
      return {
        label: "Sign-in required",
        ready: false,
        hint:
          provider.kind === "codex-cli"
            ? "Sign in with Codex in Terminal, then re-check providers."
            : provider.kind === "claude-code"
              ? "Sign in with Claude Code in Terminal, then re-check providers."
              : "Sign in with this provider, then re-check providers.",
      };
    case "missing":
      return {
        label: keyed ? "No API key" : "Not installed",
        ready: false,
        hint:
          provider.kind === "openai-api"
            ? "Set OPENAI_API_KEY in Convera’s environment, then restart Convera."
            : provider.kind === "fireworks-api"
              ? "Set FIREWORKS_API_KEY in Convera’s environment, then restart Convera."
              : keyed
                ? "Configure this provider’s API key, then re-check providers."
                : "Install and sign in to this provider’s command-line tool, then re-check providers.",
      };
    case "error":
      return {
        label: "Check failed",
        ready: false,
        hint: "Couldn’t check this provider. Re-check providers or restart Convera.",
      };
    default:
      return {
        label: "Unavailable",
        ready: false,
        hint: provider.detail ?? "Re-check providers or restart Convera.",
      };
  }
}
