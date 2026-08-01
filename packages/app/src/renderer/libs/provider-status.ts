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
    return { label: "Checking", ready: false };
  }
  const keyed = KEYED_KINDS.has(provider.kind);
  switch (provider.availability) {
    case "available":
      return { label: "Ready", ready: true, hint: provider.detail };
    case "unauthenticated":
      return {
        label: "Sign-in required",
        ready: false,
        hint: provider.detail ?? "This provider is not signed in.",
      };
    case "missing":
      return {
        label: keyed ? "No API key" : "Not installed",
        ready: false,
        hint:
          provider.detail ??
          (keyed
            ? "No API key is set for this provider."
            : "The command-line tool for this provider was not found."),
      };
    case "error":
      return {
        label: "Error",
        ready: false,
        hint: provider.detail ?? "Checking this provider failed.",
      };
    default:
      return {
        label: "Unavailable",
        ready: false,
        hint: provider.detail,
      };
  }
}
