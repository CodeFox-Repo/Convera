import { z } from "zod";
import type { LocalAIChatRequest } from "@/shared/types/local-ai";
import type {
  AgentHostChannelToolName,
  AgentHostJob,
  AgentHostToolResult,
} from "@/shared/types/agent-host";
import type { AgentTool } from "../ai/agent-tools";
import type { AgentHostRendererBridge } from "./renderer-bridge";

interface Definition {
  name: AgentHostChannelToolName;
  description: string;
  shape: z.ZodRawShape;
  schema: Record<string, unknown>;
}

const definitions: Definition[] = [
  {
    name: "read_channel",
    description:
      "Read recent messages from the current channel. Use this to refresh context after background work or before replying.",
    shape: {
      limit: z.number().int().min(1).max(100).optional(),
      beforeMessageId: z.string().min(1).optional(),
    },
    schema: {
      type: "object",
      properties: {
        limit: { type: "integer", minimum: 1, maximum: 100 },
        beforeMessageId: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "send_message",
    description:
      "Post a progress update or handoff in the current channel as yourself. Mention another member with @Name when their help is needed.",
    shape: { content: z.string().min(1).max(20_000) },
    schema: {
      type: "object",
      properties: {
        content: { type: "string", minLength: 1, maxLength: 20_000 },
      },
      required: ["content"],
      additionalProperties: false,
    },
  },
  {
    name: "edit_message",
    description:
      "Edit one of your own previously posted channel messages. You cannot edit another member's message.",
    shape: {
      messageId: z.string().min(1),
      content: z.string().min(1).max(20_000),
    },
    schema: {
      type: "object",
      properties: {
        messageId: { type: "string" },
        content: { type: "string", minLength: 1, maxLength: 20_000 },
      },
      required: ["messageId", "content"],
      additionalProperties: false,
    },
  },
  {
    name: "react",
    description:
      "Add or remove your reaction on a channel message. Repeating the same emoji toggles your reaction off.",
    shape: {
      messageId: z.string().min(1),
      emoji: z.string().min(1).max(16),
    },
    schema: {
      type: "object",
      properties: {
        messageId: { type: "string" },
        emoji: { type: "string", minLength: 1, maxLength: 16 },
      },
      required: ["messageId", "emoji"],
      additionalProperties: false,
    },
  },
  {
    name: "list_members",
    description:
      "List the current channel members, their mention names, kinds, and working status.",
    shape: {},
    schema: { type: "object", properties: {}, additionalProperties: false },
  },
];

function jobFrom(request: LocalAIChatRequest): AgentHostJob {
  const context = request.agentHost;
  if (!context) throw new Error("Channel tools require Agent Host context.");
  const timestamp = new Date().toISOString();
  return {
    id: context.jobId,
    channelId: context.channelId,
    conversationId: context.conversationId,
    triggerMessageId: context.triggerMessageId,
    agentMemberId: context.agentMemberId,
    chain: structuredClone(context.chain),
    status: "running",
    attempts: 1,
    requestId: request.requestId,
    turnId: request.turnId,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function createChannelAgentTools(options: {
  request: LocalAIChatRequest;
  bridge: AgentHostRendererBridge;
}): AgentTool[] {
  if (!options.request.agentHost) return [];
  const job = jobFrom(options.request);
  return definitions.map((definition) => {
    const validator = z.object(definition.shape).strict();
    return {
      name: definition.name,
      qualifiedName: `channel:${definition.name}`,
      description: definition.description,
      inputSchema: definition.schema,
      inputShape: definition.shape,
      inputValidator: validator,
      execute: async (input) => {
        const parsed = validator.parse(input);
        const response = await options.bridge.request<AgentHostToolResult>({
          kind: "channel-tool",
          job,
          toolName: definition.name,
          input: parsed,
        });
        return response.result;
      },
    };
  });
}

export const AGENT_HOST_SYSTEM_CONTEXT = [
  "You are working as a member of a Convera channel, not as a one-shot chatbot.",
  "Use channel:read_channel when the conversation may have moved while you worked.",
  "Use channel:send_message for useful progress updates or explicit handoffs; your final response is posted automatically.",
  "You may @mention a channel member by name when they should take the next turn.",
  "Channel tool authorship is enforced by the host. Never claim to speak for another member.",
].join("\n");
