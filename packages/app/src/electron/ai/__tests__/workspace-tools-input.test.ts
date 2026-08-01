import { describe, expect, it, vi } from "vitest";
import { createWorkspacePerceptionTools } from "../workspace-tools";
import type { WorkspaceQuery } from "@/shared/types/workspace-perception";

/**
 * The arguments a model actually sends.
 *
 * An optional field it declines to use arrives as `null` at least as often as
 * it is omitted. Zod's `.optional()` accepts only `undefined`, so those calls
 * failed type validation — and a rejected tool call costs the entire turn:
 * the agent showed as typing and its message never reached the channel.
 */
function toolsWith(answer: (query: WorkspaceQuery) => unknown) {
  const requestInteraction = vi.fn(async (interaction) => ({
    value: JSON.stringify(answer(interaction.input as WorkspaceQuery)),
  }));
  return createWorkspacePerceptionTools({
    viewerMemberId: "agent:fizz",
    requestInteraction: requestInteraction as never,
  });
}

function toolNamed(name: string) {
  return toolsWith((query) => ({ ok: true, kind: query.kind, query })).find(
    (tool) => tool.name === name,
  )!;
}

describe("send_message input", () => {
  const spellings = [
    ["omitted", {}],
    ["null", { reply_to_message_id: null }],
    ["empty string", { reply_to_message_id: "" }],
    ["undefined", { reply_to_message_id: undefined }],
  ] as const;

  for (const [label, extra] of spellings) {
    it(`accepts a reply target written as ${label}`, async () => {
      const result = (await toolNamed("send_message").execute({
        channel_id: "channel-1",
        content: "大家好！",
        ...extra,
      })) as { ok: boolean; query: { replyToMessageId?: string } };

      expect(result.ok).toBe(true);
      // None of these are a reply, so none should reach the writer.
      expect(result.query.replyToMessageId).toBeUndefined();
    });
  }

  it("still carries a real reply target through", async () => {
    const result = (await toolNamed("send_message").execute({
      channel_id: "channel-1",
      content: "about that",
      reply_to_message_id: "  message-7  ",
    })) as { ok: boolean; query: { replyToMessageId?: string } };

    expect(result.query.replyToMessageId).toBe("message-7");
  });

  it("still rejects a message with no content", async () => {
    await expect(
      toolNamed("send_message").execute({
        channel_id: "channel-1",
        content: "",
      }),
    ).rejects.toThrow();
  });
});

describe("read_channel input", () => {
  it("treats a null limit as the default rather than failing the call", async () => {
    const result = (await toolNamed("read_channel").execute({
      channel_id: "channel-1",
      limit: null,
    })) as { ok: boolean; query: { limit: number } };

    expect(result.ok).toBe(true);
    expect(result.query.limit).toBeGreaterThan(0);
  });
});
