import { describe, expect, it, vi } from "vitest";
import type { WorkspaceQuery } from "@/shared/types/workspace-perception";
import { WORKSPACE_QUERY_INTERACTION } from "@/shared/types/workspace-perception";
import type { AgentTool } from "../agent-tools";
import type { LocalAiTurnHookInput, LocalAiTurnHooks } from "../runtime";
import {
  createWorkspacePerceptionTools,
  withWorkspacePerception,
} from "../workspace-tools";

function byName(tools: AgentTool[], name: string): AgentTool {
  const tool = tools.find((candidate) => candidate.name === name);
  if (!tool) throw new Error(`missing tool ${name}`);
  return tool;
}

/** Stands in for the renderer: applies the visibility filter, answers JSON. */
function fakeRenderer(visibleChannelIds: string[]) {
  const queries: WorkspaceQuery[] = [];
  const requestInteraction = vi.fn(
    async (interaction: { name: string; input?: unknown }) => {
      expect(interaction.name).toBe(WORKSPACE_QUERY_INTERACTION);
      const query = interaction.input as WorkspaceQuery;
      queries.push(query);
      if (query.kind === "list_channels") {
        return {
          value: JSON.stringify({
            ok: true,
            kind: "list_channels",
            channels: visibleChannelIds.map((id) => ({
              id,
              name: id,
              group: null,
              channelKind: "channel",
              isPrivate: false,
              joined: id === "joined",
              memberCount: 2,
            })),
          }),
        };
      }
      if (!visibleChannelIds.includes(query.channelId)) {
        return {
          value: JSON.stringify({
            ok: false,
            error: { code: "CHANNEL_NOT_VISIBLE", message: "not visible" },
          }),
        };
      }
      return {
        value: JSON.stringify({
          ok: true,
          kind: "read_channel",
          channel: {
            id: query.channelId,
            name: query.channelId,
            group: null,
            channelKind: "channel",
            isPrivate: false,
            joined: query.channelId === "joined",
            memberCount: 2,
            members: [],
            messages: [],
            truncated: false,
          },
        }),
      };
    },
  );
  return { queries, requestInteraction };
}

describe("workspace perception tools", () => {
  it("carries the asking member's id on every query", async () => {
    const renderer = fakeRenderer(["joined", "visible"]);
    const tools = createWorkspacePerceptionTools({
      viewerMemberId: "agent:fizz",
      requestInteraction: renderer.requestInteraction,
    });

    await byName(tools, "list_channels").execute({});
    await byName(tools, "read_channel").execute({ channel_id: "joined" });

    expect(renderer.queries).toEqual([
      { kind: "list_channels", viewerMemberId: "agent:fizz" },
      {
        kind: "read_channel",
        viewerMemberId: "agent:fizz",
        channelId: "joined",
        limit: 30,
      },
    ]);
  });

  it("surfaces joined and not-joined channels", async () => {
    const renderer = fakeRenderer(["joined", "visible"]);
    const tools = createWorkspacePerceptionTools({
      viewerMemberId: "agent:fizz",
      requestInteraction: renderer.requestInteraction,
    });

    const listed = await byName(tools, "list_channels").execute({});
    expect(listed).toMatchObject({
      ok: true,
      channels: [
        expect.objectContaining({ id: "joined", joined: true }),
        expect.objectContaining({ id: "visible", joined: false }),
      ],
    });

    const notJoined = await byName(tools, "read_channel").execute({
      channel_id: "visible",
    });
    expect(notJoined).toMatchObject({ ok: true, channel: { joined: false } });
  });

  it("returns the filter's refusal for a channel it must not see", async () => {
    const renderer = fakeRenderer(["joined", "visible"]);
    const tools = createWorkspacePerceptionTools({
      viewerMemberId: "agent:fizz",
      requestInteraction: renderer.requestInteraction,
    });

    expect(
      await byName(tools, "read_channel").execute({ channel_id: "hidden" }),
    ).toMatchObject({ ok: false, error: { code: "CHANNEL_NOT_VISIBLE" } });
  });

  it("rejects a limit above the cap before it reaches the renderer", async () => {
    const renderer = fakeRenderer(["joined"]);
    const tools = createWorkspacePerceptionTools({
      viewerMemberId: "agent:fizz",
      requestInteraction: renderer.requestInteraction,
    });

    await expect(
      byName(tools, "read_channel").execute({
        channel_id: "joined",
        limit: 5_000,
      }),
    ).rejects.toThrow();
    expect(renderer.requestInteraction).not.toHaveBeenCalled();
  });

  it("reports an unanswered or malformed query as a tool error", async () => {
    const silent = createWorkspacePerceptionTools({
      viewerMemberId: "agent:fizz",
      requestInteraction: async () => ({}),
    });
    const garbled = createWorkspacePerceptionTools({
      viewerMemberId: "agent:fizz",
      requestInteraction: async () => ({ value: "not json" }),
    });
    const rejecting = createWorkspacePerceptionTools({
      viewerMemberId: "agent:fizz",
      requestInteraction: async () => {
        throw new Error("Interaction cancelled.");
      },
    });

    expect(await byName(silent, "list_channels").execute({})).toMatchObject({
      ok: false,
      error: { code: "WORKSPACE_QUERY_UNAVAILABLE" },
    });
    expect(await byName(garbled, "list_channels").execute({})).toMatchObject({
      ok: false,
      error: { code: "WORKSPACE_QUERY_MALFORMED" },
    });
    expect(await byName(rejecting, "list_channels").execute({})).toMatchObject({
      ok: false,
      error: { code: "WORKSPACE_QUERY_UNAVAILABLE" },
    });
  });
});

function hookInput(memberId: string | undefined): LocalAiTurnHookInput {
  return {
    request: {
      requestId: "request-1",
      conversationId: "conversation-1",
      turnId: "turn-1",
      providerId: "claude-code",
      operation: {
        kind: "append",
        message: { role: "user", content: "Where are we?" },
      },
      agent: memberId ? { memberId } : undefined,
    },
    prepared: {} as LocalAiTurnHookInput["prepared"],
    requestInteraction: async () => ({}),
  };
}

describe("withWorkspacePerception", () => {
  it("appends eyes to the tools an existing hook already injected", async () => {
    const existing: AgentTool = {
      name: "memory_status",
      qualifiedName: "memory:status",
      description: "",
      inputSchema: {},
      inputShape: {},
      inputValidator: { parse: (value: unknown) => value } as never,
      execute: async () => ({}),
    };
    const hooks: LocalAiTurnHooks = {
      prepareTurnContext: () => ({
        systemContext: "persona",
        additionalTools: [existing],
      }),
    };

    const prepared = await withWorkspacePerception(hooks).prepareTurnContext?.(
      hookInput("agent:fizz"),
    );

    expect(prepared?.systemContext).toBe("persona");
    expect(
      prepared?.additionalTools?.map((tool) => tool.qualifiedName),
    ).toEqual([
      "memory:status",
      "workspace:list_channels",
      "workspace:send_message",
      "workspace:read_channel",
    ]);
  });

  it("gives no eyes to a turn with no member identity", async () => {
    const prepared = await withWorkspacePerception({}).prepareTurnContext?.(
      hookInput(undefined),
    );

    expect(prepared).toBeUndefined();
  });
});
