import type { LocalAIMessage } from "@/shared/types/local-ai";
import type {
  LocalAIConversationMemoryState,
  LocalAIConversationRuntimeState,
  LocalAIMemoryStatus,
} from "@/shared/types/local-ai";
import type { Channel, Member } from "@/shared/types/workspace";
import { buildChannelContext, projectFor } from "./agent-projection";
import { db, LOCAL_HUMAN_MEMBER_ID, type Agent, type Message } from "./db";
import { canViewChannel, resolveViewer } from "./workspace-perception";

export interface AgentContextVisibleChannel {
  id: string;
  name: string;
  kind: Channel["kind"];
  isPrivate: boolean;
}

export interface AgentContextInspection {
  channelId: string;
  conversationId: string;
  agent: Pick<
    Agent,
    "id" | "name" | "description" | "providerId" | "modelId"
  > & {
    memberId: string;
  };
  injected: {
    /** Identity prompt used when a native provider session is created or rotated. */
    identityPrompt: string;
    channelContext: string;
    effectiveSystemPrompt: string;
    /** Renderer-owned recovery/bootstrap view, not provider-owned session history. */
    transcriptProjection: LocalAIMessage[];
  };
  available: {
    visibleChannels: AgentContextVisibleChannel[];
    workspaceTools: string[];
    configuredMcpServerIds: string[];
    configuredDisabledTools: Array<{
      mcpName: string;
      toolName: string;
      reason?: string;
    }>;
    effectiveToolCatalog: Array<{
      serverName: string;
      toolNames: string[];
    }>;
  };
  runtime: {
    conversation: LocalAIConversationRuntimeState | null;
    memory: LocalAIMemoryStatus | null;
    memoryState: LocalAIConversationMemoryState | null;
    errors: string[];
  };
  opaque: Array<{ label: string; detail: string }>;
}

function projectable(messages: Message[]) {
  return messages.map((message) => ({
    id: message.id,
    senderId: message.senderId,
    role: message.role,
    content: message.content,
  }));
}

function agentMember(channel: Channel, members: Member[]): Member | undefined {
  const byId = new Map(members.map((member) => [member.id, member]));
  const preferred = channel.defaultAgentMemberId
    ? byId.get(channel.defaultAgentMemberId)
    : undefined;
  if (preferred?.kind === "agent") return preferred;
  return channel.memberIds
    .map((id) => byId.get(id))
    .find((member): member is Member => member?.kind === "agent");
}

/**
 * Builds the context the renderer can prove from its own authoritative data.
 *
 * Runtime memory, effective tool resolution and provider-native history live
 * in Electron main or the provider. They are called out as opaque instead of
 * being guessed from renderer configuration.
 */
export async function inspectAgentDMContext(
  channelId: string,
): Promise<AgentContextInspection> {
  const channel = await db.channels.get(channelId);
  if (!channel || channel.kind !== "dm" || !channel.isPrivate) {
    throw new Error("Agent context is available only inside a private DM.");
  }
  if (!channel.memberIds.includes(LOCAL_HUMAN_MEMBER_ID)) {
    throw new Error("The local user is not a member of this DM.");
  }

  const [memberRows, messages, channels] = await Promise.all([
    db.members.bulkGet(channel.memberIds),
    db.messages
      .where("conversationId")
      .equals(channel.conversationId)
      .sortBy("createdAt"),
    db.channels.toArray(),
  ]);
  const room = memberRows.filter(
    (member): member is Member => member !== undefined,
  );
  const member = agentMember(channel, room);
  if (!member?.agentId) {
    throw new Error("This DM has no agent participant.");
  }
  const agent = await db.agents.get(member.agentId);
  if (!agent) throw new Error(`Agent ${member.agentId} does not exist.`);

  const channelContext = buildChannelContext(
    member,
    channel.name,
    room,
    false,
    [],
    channel.id,
    channel.description,
  );
  const identityPrompt = agent.systemPrompt.trim();
  const effectiveSystemPrompt = identityPrompt
    ? `${identityPrompt}\n\n${channelContext}`
    : channelContext;
  const allMembers = await db.members.toArray();
  // The inspector shows what this agent can see, so it must resolve the
  // agent's own tags rather than the operator's.
  const viewer = await resolveViewer(member.id);
  const runtimeErrors: string[] = [];
  let runtimeConversation: LocalAIConversationRuntimeState | null = null;
  let memoryStatus: LocalAIMemoryStatus | null = null;
  let memoryState: LocalAIConversationMemoryState | null = null;
  let effectiveToolCatalog: AgentContextInspection["available"]["effectiveToolCatalog"] =
    [];
  if (typeof window !== "undefined") {
    if (window.localAI) {
      const [runtimeResult, memoryResult, memoryStateResult] =
        await Promise.all([
          window.localAI.getConversationRuntimeState(channel.conversationId),
          window.localAI.getMemoryStatus(channel.conversationId),
          window.localAI.getConversationMemoryState(channel.conversationId),
        ]);
      if (runtimeResult.success) {
        runtimeConversation = runtimeResult.data ?? null;
      } else {
        runtimeErrors.push(
          runtimeResult.error?.message ?? "Runtime state is unavailable.",
        );
      }
      if (memoryResult.success) {
        memoryStatus = memoryResult.data ?? null;
      } else {
        runtimeErrors.push(
          memoryResult.error?.message ?? "Memory status is unavailable.",
        );
      }
      if (memoryStateResult.success) {
        memoryState = memoryStateResult.data ?? null;
      } else if (memoryStatus?.health !== "disabled") {
        runtimeErrors.push(
          memoryStateResult.error?.message ??
            "Memory block state is unavailable.",
        );
      }
    }
    if (window.mcpAPI) {
      const toolsResult = await window.mcpAPI.getAllTools();
      if (toolsResult.success) {
        effectiveToolCatalog = (toolsResult.data ?? []).map((group) => ({
          serverName: group.serverName,
          toolNames: group.tools.map((tool) => tool.name),
        }));
      } else {
        runtimeErrors.push(
          toolsResult.error ?? "The effective tool catalog is unavailable.",
        );
      }
    }
  }

  return {
    channelId: channel.id,
    conversationId: channel.conversationId,
    agent: {
      id: agent.id,
      memberId: member.id,
      name: agent.name,
      description: agent.description,
      providerId: agent.providerId,
      modelId: agent.modelId,
    },
    injected: {
      identityPrompt,
      channelContext,
      effectiveSystemPrompt,
      transcriptProjection: projectFor(
        member.id,
        projectable(messages),
        allMembers,
      ),
    },
    available: {
      visibleChannels: channels
        .filter((candidate) => canViewChannel(viewer, candidate))
        .sort((left, right) => left.name.localeCompare(right.name))
        .map((candidate) => ({
          id: candidate.id,
          name: candidate.name,
          kind: candidate.kind,
          isPrivate:
            (candidate.visibleToTags ?? []).length > 0 || !!candidate.isPrivate,
        })),
      workspaceTools: [
        "list_channels",
        "read_channel",
        "send_message",
        "add_reaction",
      ],
      configuredMcpServerIds: [...(agent.selectedMCPs ?? [])],
      configuredDisabledTools: [...agent.disableToolReferences],
      effectiveToolCatalog,
    },
    runtime: {
      conversation: runtimeConversation,
      memory: memoryStatus,
      memoryState,
      errors: runtimeErrors,
    },
    opaque: [
      {
        label: "Provider-native session history",
        detail:
          "Codex or Claude owns its resumed session history; Convera does not read or mirror it into the channel.",
      },
      {
        label: "Runtime memory payload",
        detail:
          "Durable memory content is compiled in Electron main. The renderer can inspect block labels and read-only state, but does not own or mirror the payload.",
      },
      {
        label: "Provider hidden prompt and sandbox internals",
        detail:
          "The connected tool names are inspectable, but provider-owned hidden instructions and OS sandbox internals are not exposed to the renderer.",
      },
    ],
  };
}
