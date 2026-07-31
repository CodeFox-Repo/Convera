import type { LocalAIChatRequest } from "@/shared/types/local-ai";
import type { AgentSandbox } from "@/shared/types/workspace";
import { describe, expect, it, vi } from "vitest";
import { LOCAL_AI_PROVIDER_DESCRIPTORS } from "../provider-descriptors";
import { ClaudeCodeAdapter } from "../providers/claude-code";
import { CodexCliAdapter } from "../providers/codex-cli";
import type { LocalAiProviderStatus } from "../types";

const mocks = vi.hoisted(() => {
  const provider = Object.assign(
    vi.fn(() => ({})),
    {
      close: vi.fn(async () => undefined),
      listModels: vi.fn(async () => ({
        models: [{ id: "gpt-test" }],
        defaultModel: { id: "gpt-test" },
      })),
    },
  );

  return {
    provider,
    createCodexAppServer: vi.fn(() => provider),
    tool: vi.fn((definition) => definition),
  };
});

vi.mock("ai-sdk-provider-codex-cli", () => ({
  createCodexAppServer: mocks.createCodexAppServer,
  tool: mocks.tool,
}));

interface CodexSettings {
  cwd?: string;
  sandboxPolicy?: {
    type: string;
    writableRoots?: string[];
    networkAccess?: boolean;
  };
}

function lastCodexSettings(): CodexSettings | undefined {
  const calls = mocks.provider.mock.calls as unknown as Array<
    [string, CodexSettings]
  >;
  return calls.at(-1)?.[1];
}

function status(id: "codex-cli" | "claude-code"): LocalAiProviderStatus {
  return {
    ...LOCAL_AI_PROVIDER_DESCRIPTORS[id],
    available: true,
    authenticated: true,
    executablePath: `/test/${id}`,
    checkedAt: new Date(0).toISOString(),
  };
}

function request(providerId: "codex-cli" | "claude-code"): LocalAIChatRequest {
  return {
    requestId: "test",
    providerId,
    messages: [{ role: "user", content: "hello" }],
    options: { cwd: "/fallback/cwd" },
  };
}

// Two writable roots on purpose: with one, the expected policy would coincide
// with the cwd-only fallback and the test could not tell them apart.
const sandbox: AgentSandbox = {
  root: "/agents/scout",
  writableRoots: ["/agents/scout/workspace", "/agents/scout/memory"],
  networkAccess: false,
};

describe("provider sandbox contract", () => {
  it("reports enforcement honestly per adapter", () => {
    expect(new CodexCliAdapter().enforcesSandbox).toBe(true);
    // The Agent SDK sandbox only wraps Bash, and its writable set is not
    // reachable from SDK options — see the comment on the adapter.
    expect(new ClaudeCodeAdapter().enforcesSandbox).toBe(false);
  });

  it("translates the sandbox into codex's sandboxPolicy", async () => {
    const adapter = new CodexCliAdapter();
    await adapter.createModel(request("codex-cli"), status("codex-cli"), {
      tools: [],
      requestInteraction: async () => ({ approved: false }),
      sandbox,
    });

    const settings = lastCodexSettings();
    expect(settings?.sandboxPolicy).toEqual({
      type: "workspaceWrite",
      writableRoots: ["/agents/scout/workspace", "/agents/scout/memory"],
      networkAccess: false,
    });
    // workspaceWrite also makes cwd writable, so cwd must not be the cage root
    // and must not fall back to the renderer-supplied value.
    expect(settings?.cwd).toBe("/agents/scout/workspace");
    await adapter.dispose();
  });

  it("carries networkAccess through to codex", async () => {
    const adapter = new CodexCliAdapter();
    await adapter.createModel(request("codex-cli"), status("codex-cli"), {
      tools: [],
      requestInteraction: async () => ({ approved: false }),
      sandbox: { ...sandbox, networkAccess: true },
    });

    expect(lastCodexSettings()?.sandboxPolicy?.networkAccess).toBe(true);
    await adapter.dispose();
  });

  it("keeps the cwd-only policy when no sandbox is supplied", async () => {
    const adapter = new CodexCliAdapter();
    await adapter.createModel(request("codex-cli"), status("codex-cli"), {
      tools: [],
      requestInteraction: async () => ({ approved: false }),
    });

    expect(lastCodexSettings()?.sandboxPolicy).toEqual({
      type: "workspaceWrite",
      writableRoots: ["/fallback/cwd"],
      networkAccess: false,
    });
    await adapter.dispose();
  });
});
