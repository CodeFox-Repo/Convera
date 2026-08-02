/**
 * The agent's eyes, main-process side.
 *
 * An agent perceives the workspace by looking, never by having it injected
 * (see CLAUDE.md, "Agents Are Colleagues"). The workspace itself lives in the
 * renderer's Dexie database, so each tool call rides the existing interaction
 * channel: main emits an `input` interaction carrying a `WorkspaceQuery`, the
 * renderer answers out of Dexie, and the JSON comes back in `value`.
 */

import type {
  WorkspaceQuery,
  WorkspaceQueryResult,
} from "@/shared/types/workspace-perception";
import {
  WORKSPACE_MESSAGE_LIMIT_DEFAULT,
  WORKSPACE_MESSAGE_CONTENT_MAX,
  WORKSPACE_MESSAGE_LIMIT_MAX,
  WORKSPACE_QUERY_INTERACTION,
} from "@/shared/types/workspace-perception";
import { z, type ZodRawShape, type ZodTypeAny } from "zod";
import { parseToolInput } from "./tool-input";
import type { AgentTool, AgentToolInteraction } from "./agent-tools";
import type {
  LocalAiTurnHookInput,
  LocalAiTurnHooks,
  PreparedLocalAiTurnContext,
} from "./runtime";

export interface WorkspacePerceptionOptions {
  /** The agent's `Member.id` — the identity every query is filtered against. */
  viewerMemberId: string;
  requestInteraction(
    interaction: AgentToolInteraction,
  ): Promise<{ approved?: boolean; value?: string }>;
}

const listChannelsSchema = z.object({});

const readChannelSchema = z.object({
  channel_id: z
    .string()
    .trim()
    .min(1)
    .max(256)
    .describe("Channel id from list_channels."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(WORKSPACE_MESSAGE_LIMIT_MAX)
    .default(WORKSPACE_MESSAGE_LIMIT_DEFAULT)
    .describe("How many of the most recent messages to return."),
});

const sendMessageSchema = z.object({
  channel_id: z
    .string()
    .trim()
    .min(1)
    .max(256)
    .describe("Channel id from list_channels."),
  content: z
    .string()
    .trim()
    .min(1)
    .max(WORKSPACE_MESSAGE_CONTENT_MAX)
    .describe("What to say, as you would type it into the channel."),
  reply_to_message_id: z
    .string()
    .trim()
    .max(256)
    // `null` is handled for every tool in `normalizeToolInput`; `""` has to be
    // allowed here because for *this* field it means the same thing — not a
    // reply — where for `content` or a file path it would be a mistake.
    .optional()
    .transform((value) => value || undefined)
    .describe(
      "Only for pulling a SPECIFIC older message back into view — one that has scrolled away or could be confused with another. Answering the latest message needs no reply marker: you are already talking to the room, and quoting the thing everyone just read is noise. Most messages should not set this.",
    ),
});

const addReactionSchema = z.object({
  channel_id: z
    .string()
    .trim()
    .min(1)
    .max(256)
    .describe("Channel id the message is in."),
  message_id: z
    .string()
    .trim()
    .min(1)
    .max(256)
    .describe("Message id from read_channel."),
  emoji: z
    .string()
    .trim()
    .min(1)
    .max(16)
    .describe("A single emoji character, e.g. 👍."),
});

const openDMSchema = z.object({
  member_id: z
    .string()
    .trim()
    .min(1)
    .max(256)
    .describe("Member id of the colleague, from a channel roster."),
});

const DESCRIPTIONS = {
  open_dm:
    "Open your private room with one colleague and get its channel id, then post there with send_message. Use it when something is between the two of you — checking a detail before you answer in front of everyone, handing over a piece of work, disagreeing without making it a scene. The room is created the first time you ask and is the same room every time after. No other colleague can read it, though the person whose workspace this is can, the way a manager can see the rooms in their own office.",
  list_channels:
    "List every channel in this workspace you are allowed to see, including ones you have not joined. Use it to find where a topic lives before reading it. Each entry reports whether you are a member, its group, and how many people are in it.",
  read_channel:
    "Read one channel's roster and its most recent messages. Use it to catch up on a room — including a visible room you have not joined — before answering or deciding what to remember. Returns oldest-first messages and flags when older history was cut.",
  send_message:
    "Say something in a channel. This is how you speak: nothing you write in your own reasoning reaches anyone until you call this. Reply markers are for pointing at an older or ambiguous message; answering the latest thing said needs none — just talk. Post only when you have something worth adding — staying quiet is a normal and complete answer, and a room where everyone answers everything is noise. You may post to any channel you can see, not only the one you were addressed in.",
  add_reaction:
    "React to a message with an emoji, the way a person clicks one instead of typing. Use it when acknowledging is the whole answer — 👍 on a plan you agree with, 👀 on something you have picked up — so the room sees you responded without another line to read. Calling it again with the same emoji takes your reaction back. This is not a substitute for send_message when you actually have something to say.",
} as const;

function schemaOf(shape: ZodRawShape): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const [name, validator] of Object.entries(shape)) {
    properties[name] = {
      type: name === "limit" ? "integer" : "string",
      description: validator.description,
    };
    if (!validator.isOptional()) required.push(name);
  }
  return { type: "object", properties, required, additionalProperties: false };
}

function failure(code: string, message: string): WorkspaceQueryResult {
  return { ok: false, error: { code, message } };
}

/**
 * Exported so the entry point below and its tests share one round trip. The
 * renderer is the only thing that can answer, so a missing/garbled reply is a
 * tool error rather than a thrown turn failure — the agent can retry or move on.
 */
async function ask(
  options: WorkspacePerceptionOptions,
  query: WorkspaceQuery,
): Promise<WorkspaceQueryResult> {
  let response: { value?: string };
  try {
    response = await options.requestInteraction({
      kind: "input",
      name: WORKSPACE_QUERY_INTERACTION,
      prompt: `Workspace query: ${query.kind}`,
      input: query,
    });
  } catch (error) {
    return failure(
      "WORKSPACE_QUERY_UNAVAILABLE",
      error instanceof Error ? error.message : String(error),
    );
  }

  if (typeof response.value !== "string") {
    return failure(
      "WORKSPACE_QUERY_UNAVAILABLE",
      "The workspace did not answer. Continue without it rather than guessing what is in the channel.",
    );
  }
  try {
    return JSON.parse(response.value) as WorkspaceQueryResult;
  } catch {
    return failure(
      "WORKSPACE_QUERY_MALFORMED",
      "The workspace answer could not be parsed.",
    );
  }
}

function perceptionTool(
  name: string,
  description: string,
  inputShape: ZodRawShape,
  inputValidator: ZodTypeAny,
  execute: (input: Record<string, unknown>) => Promise<WorkspaceQueryResult>,
): AgentTool {
  return {
    name,
    qualifiedName: `workspace:${name}`,
    description,
    inputSchema: schemaOf(inputShape),
    inputShape,
    inputValidator,
    execute: async (input) => execute(parseToolInput(inputValidator, input)),
  };
}

/** Only an agent standing somewhere has eyes; a plain chat turn has none. */
function viewerMemberId(input: LocalAiTurnHookInput): string | undefined {
  return input.request.agent?.memberId?.trim() || undefined;
}

/**
 * Wraps existing turn hooks so perception tools ride along with whatever else
 * the turn already injects. `prepareTurnContext` is one slot on the runtime and
 * the memory coordinator owns it, so composing here keeps both.
 */
export function withWorkspacePerception(
  hooks: LocalAiTurnHooks,
): LocalAiTurnHooks {
  return {
    ...hooks,
    prepareTurnContext: async (
      input,
    ): Promise<PreparedLocalAiTurnContext | undefined> => {
      const prepared = await hooks.prepareTurnContext?.(input);
      const memberId = viewerMemberId(input);
      if (!memberId) return prepared;
      return {
        ...prepared,
        additionalTools: [
          ...(prepared?.additionalTools ?? []),
          ...createWorkspacePerceptionTools({
            viewerMemberId: memberId,
            requestInteraction: input.requestInteraction,
          }),
        ],
      };
    },
  };
}

export function createWorkspacePerceptionTools(
  options: WorkspacePerceptionOptions,
): AgentTool[] {
  return [
    perceptionTool(
      "list_channels",
      DESCRIPTIONS.list_channels,
      listChannelsSchema.shape,
      listChannelsSchema,
      () =>
        ask(options, {
          kind: "list_channels",
          viewerMemberId: options.viewerMemberId,
        }),
    ),
    perceptionTool(
      "send_message",
      DESCRIPTIONS.send_message,
      sendMessageSchema.shape,
      sendMessageSchema,
      (input) =>
        ask(options, {
          kind: "send_message",
          viewerMemberId: options.viewerMemberId,
          channelId: input.channel_id as string,
          content: input.content as string,
          ...(input.reply_to_message_id
            ? { replyToMessageId: input.reply_to_message_id as string }
            : {}),
        }),
    ),
    perceptionTool(
      "read_channel",
      DESCRIPTIONS.read_channel,
      readChannelSchema.shape,
      readChannelSchema,
      (input) =>
        ask(options, {
          kind: "read_channel",
          viewerMemberId: options.viewerMemberId,
          channelId: input.channel_id as string,
          limit: input.limit as number,
        }),
    ),
    perceptionTool(
      "add_reaction",
      DESCRIPTIONS.add_reaction,
      addReactionSchema.shape,
      addReactionSchema,
      (input) =>
        ask(options, {
          kind: "add_reaction",
          viewerMemberId: options.viewerMemberId,
          channelId: input.channel_id as string,
          messageId: input.message_id as string,
          emoji: input.emoji as string,
        }),
    ),
    perceptionTool(
      "open_dm",
      DESCRIPTIONS.open_dm,
      openDMSchema.shape,
      openDMSchema,
      (input) =>
        ask(options, {
          kind: "open_dm",
          viewerMemberId: options.viewerMemberId,
          memberId: input.member_id as string,
        }),
    ),
  ];
}
