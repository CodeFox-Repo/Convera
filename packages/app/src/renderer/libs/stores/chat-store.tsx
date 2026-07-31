import { ServerInfo, ToolDefinition } from "@/shared/types/mcp";
import { AppSettings } from "@/shared/types/settings";
import type { Attachment, Message, UIMessage } from "@/renderer/types/chat";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useLocalAIChat } from "../hooks/use-local-ai-chat";
import { useAgentStore } from "./agent-store";
import {
  clearDeletionFailureNotification,
  notifyDeferredDeletion,
  useChatHistory,
} from "./chat-history-store";
import { resolveLocalAIProviderId } from "./model-config-store";
import { DEFAULT_LOCAL_AI_MODEL_ID } from "../local-ai";
import {
  db,
  createConversation,
  deleteConversation as deleteConversationFromDexie,
} from "../db";
import { buildChannelContext, projectFor } from "../agent-projection";
import { routeMessage, type ChainState } from "../agent-routing";
import { parseMentions } from "../mention-parser";
import {
  LOCAL_HUMAN_MEMBER_ID,
  memberIdForAgent,
  type Agent as DBAgent,
} from "../db/database";
import type { Member } from "@/shared/types/workspace";
import { useSelectionStore } from "../db/ui-state";
import { useSettingsStore } from "./settings-store";
import { useUserInputStore } from "./user-input-store";
import { selectAppendOperation } from "../local-ai-request";
import {
  assertConversationSelectionUnchanged,
  buildAuthoritativeEditMessages,
  buildAuthoritativeRegenerateMessages,
  loadConversationSendContext,
  type ConversationSelectionToken,
} from "../conversation-send-context";
import { resolveNativeProviderSelection } from "../provider-selection";
import { flushConversationProviderSelection } from "../conversation-provider-persistence";
import { completeConversationTurnPersistence } from "../conversation-turn-persistence";
import {
  reconcilePendingTurn,
  reconcilePendingTurns,
} from "../conversation-turn-reconciliation";
import { replayPendingConversationDeletions } from "../conversation-lifecycle";
import { submitHumanChannelMessage } from "../agent-host-service";

export type ChatViewMode = "compact" | "expanded";

function toProjectable(messages: UIMessage[]) {
  return messages.map((m) => ({
    id: m.id,
    senderId: m.senderId,
    role: m.role as "user" | "assistant" | "system",
    content:
      typeof m.content === "string" ? m.content : JSON.stringify(m.content),
  }));
}

/**
 * The responding agent's own prompt plus its place in the conversation.
 * Without the channel context it reads the "Name: " prefixes as body text.
 */
function buildResponderPrompt(
  agent: Pick<DBAgent, "id" | "name" | "systemPrompt">,
  responderMemberId: string | undefined,
  members: Member[],
): string {
  const self = members.find((member) => member.id === responderMemberId);
  if (!self) return agent.systemPrompt;

  const context = buildChannelContext(self, "chat", members);
  return agent.systemPrompt ? `${agent.systemPrompt}\n\n${context}` : context;
}

// Selected content structure
export interface SelectedContent {
  text?: string;
  timestamp?: number;
  source?: "shortcut" | "manual"; // track how content was captured
}

// Simple tool call result type
interface ToolCallResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

interface ChatContextType {
  messages: UIMessage[];
  input: string;
  isLoading: boolean;
  error: Error | undefined;
  selectedContent: SelectedContent | null;
  attachments: File[];

  // View mode management
  viewMode: ChatViewMode;
  setViewMode: (mode: ChatViewMode) => void;
  toggleViewMode: () => void;

  // Conversation management
  currentConversationId: string | null;

  // MCP Tools management
  availableTools: ToolDefinition[];
  mcpServers: ServerInfo[];
  toolsLoading: boolean;
  toolsError: string | null;

  setInput: (input: string) => void;
  sendMessage: (messageOrFiles?: string | File[], extraFiles?: File[]) => void;
  stopGeneration: () => void;
  editMessage: (message: Message, newContent: string) => void;
  regenerateMessage: (message: Message) => void;
  resetChat: () => void;
  setSelectedContent: (content: SelectedContent | null) => void;
  rejectSelectedContent: () => void;
  addAttachments: (files: File | File[]) => void;
  removeAttachment: (index: number) => void;
  clearAttachments: () => void;

  // Chat-related actions (previously in app-actions)
  resetChatWindow: () => void;
  // MCP Tools methods
  getAvailableTools: () => Promise<void>;
  executeTool: (
    serverId: string,
    toolName: string,
    args: Record<string, unknown>,
  ) => Promise<unknown>;

  // MCP tool call method (simplified)
  callTool: (
    serverId: string,
    toolName: string,
    args: Record<string, unknown>,
  ) => Promise<ToolCallResult>;
}

interface ChatMessage extends Omit<Message, "id"> {
  experimental_attachments?: Attachment[];
}

function getConversationSelectionToken(): ConversationSelectionToken {
  const state = useSelectionStore.getState();
  return {
    conversationId: state.currentConversationId,
    version: state.conversationSelectionVersion,
  };
}

function getDefaultProviderSelection() {
  const state = useSelectionStore.getState();
  return resolveNativeProviderSelection(
    state.defaultConfigId,
    state.defaultModelId,
  );
}

const ChatContext = createContext<ChatContextType | null>(null);

export const ChatProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { settings, settingsLoading, initializeSettings } = useSettingsStore();
  const [selectedContent, setSelectedContent] =
    useState<SelectedContent | null>(null);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [viewMode, setViewMode] = useState<ChatViewMode>("compact");

  // Use shared Zustand store for conversation ID to sync with sidebar selection
  const {
    currentConversationId,
    setCurrentConversation: setCurrentConversationId,
  } = useSelectionStore();

  // Debug: Log conversation ID changes
  useEffect(() => {
    console.log(
      "🔗 Frontend: currentConversationId changed to:",
      currentConversationId,
    );
  }, [currentConversationId]);

  // MCP Tools state - moved from separate store for simplicity
  const [availableTools, setAvailableTools] = useState<ToolDefinition[]>([]);
  const [mcpServers, setMcpServers] = useState<ServerInfo[]>([]);
  const [toolsLoading, setToolsLoading] = useState(false);
  const [toolsError, setToolsError] = useState<string | null>(null);

  // MCP logger

  const { selectedAgent } = useAgentStore();
  // const { selectedModelId } = useModelStore();
  // const currentModelIdRef = useRef<string>(selectedModelId);
  const settingsRef = useRef<AppSettings | null>(settings);

  // Initialize settings on mount (only once)
  useEffect(() => {
    initializeSettings();
  }, [initializeSettings]);

  // useEffect(() => {
  //   currentModelIdRef.current = selectedModelId;
  // }, [selectedModelId]);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const chatAPI = useLocalAIChat();

  // Auto-expand when there are messages
  useEffect(() => {
    if (chatAPI.messages.length > 0 && viewMode === "compact") {
      setViewMode("expanded");
    }
  }, [chatAPI.messages.length, viewMode]);

  // Integrate the useChatHistory hook
  useChatHistory(chatAPI.setMessages, chatAPI.isLoading);

  // Track previous loading state to detect when message completes
  const prevLoadingRef = useRef(false);
  const currentConversationIdRef = useRef(currentConversationId);
  const activeConversationIdRef = useRef<string | null>(null);
  const activeTurnIdRef = useRef<string | null>(null);
  // Relay state for agent→agent mentions; reset by each human message.
  const chainRef = useRef<ChainState | null>(null);
  // Agents still owed a turn from a multi-mention or an agent's own mentions.
  const pendingInvokesRef = useRef<string[]>([]);
  const relayActiveRef = useRef(false);

  // Keep refs in sync
  useEffect(() => {
    currentConversationIdRef.current = currentConversationId;
  }, [currentConversationId]);

  // Recover a main-process terminal outbox after renderer reload, sender
  // destruction, or an ambiguous IPC failure. The journal and reconciliation
  // transactions are idempotent, so multiple windows may safely run this.
  useEffect(() => {
    let stopped = false;
    let running = false;
    const reconcileOutstandingTurns = async () => {
      if (stopped || running) return;
      running = true;
      try {
        const activeTurnId = activeTurnIdRef.current;
        const results = await reconcilePendingTurns({
          preferLiveGrace: true,
          excludeTurnIds: activeTurnId ? [activeTurnId] : [],
        });
        for (const result of results) {
          if (!result.locallySettled) continue;
          completeConversationTurnPersistence(result.turnId);
          if (activeTurnIdRef.current === result.turnId) {
            activeConversationIdRef.current = null;
            activeTurnIdRef.current = null;
          }
        }
        const deletionResults = await replayPendingConversationDeletions();
        for (const result of deletionResults) {
          if (result.deleted) {
            clearDeletionFailureNotification(result.conversationId);
            continue;
          }
          if (result.skipped) {
            if (result.retryable === false && result.error) {
              notifyDeferredDeletion(result.conversationId, result.error);
            }
            continue;
          }
          console.error(
            `Failed to replay deletion for ${result.conversationId}:`,
            result.error,
          );
          notifyDeferredDeletion(result.conversationId, result.error);
        }
      } catch (error) {
        console.error("Failed to reconcile a pending local AI turn:", error);
      } finally {
        running = false;
      }
    };
    void reconcileOutstandingTurns();
    const interval = window.setInterval(reconcileOutstandingTurns, 2_000);
    return () => {
      stopped = true;
      window.clearInterval(interval);
    };
  }, []);

  /**
   * Agent→agent relay: when a finished reply mentions other agents (or a
   * multi-mention left agents queued), invoke the next one. `routeMessage`'s
   * chain state enforces the 3-hop cap and once-per-chain rule, so two agents
   * mentioning each other terminates instead of ping-ponging forever.
   */
  const runRelay = useCallback(async () => {
    if (relayActiveRef.current) return;

    const lastMessage = chatAPI.messages.at(-1);
    if (!lastMessage || lastMessage.role !== "assistant") return;
    const lastSenderId = lastMessage.senderId;
    if (!lastSenderId || !lastSenderId.startsWith("agent:")) return;

    const members = await db.members.toArray();
    const routed = routeMessage({
      message: {
        senderId: lastSenderId,
        content:
          typeof lastMessage.content === "string" ? lastMessage.content : "",
      },
      members,
      defaultAgentMemberId: null, // relays follow explicit mentions only
      chain: chainRef.current,
    });
    chainRef.current = routed.chain;

    const next = [...pendingInvokesRef.current, ...routed.invoke].filter(
      (id, index, ids) => ids.indexOf(id) === index,
    );
    const [nextResponderId, ...rest] = next;
    pendingInvokesRef.current = rest;
    if (!nextResponderId) return;

    const nextMember = members.find((m) => m.id === nextResponderId);
    if (!nextMember?.agentId) return;
    const agent = await db.agents.get(nextMember.agentId);
    if (!agent) return;

    relayActiveRef.current = true;
    try {
      const conversationId = currentConversationIdRef.current;
      if (!conversationId) return;
      const selection = getConversationSelectionToken();
      if (selection.conversationId !== conversationId) return;
      await flushConversationProviderSelection(conversationId);
      assertConversationSelectionUnchanged(
        selection,
        getConversationSelectionToken(),
      );
      const sendContext = await loadConversationSendContext({
        selection,
        defaultSelection: getDefaultProviderSelection(),
        getSelection: getConversationSelectionToken,
      });
      if (!sendContext) return;
      const providerId = resolveLocalAIProviderId(
        sendContext.providerSelection.configId,
      );
      const selectedModelId = sendContext.providerSelection.modelId;
      const runtimeResult =
        await window.localAI.getConversationRuntimeState(conversationId);
      if (!runtimeResult.success) {
        throw new Error(
          runtimeResult.error?.message ||
            "Could not read conversation runtime state.",
        );
      }
      assertConversationSelectionUnchanged(
        selection,
        getConversationSelectionToken(),
      );
      const turnId = crypto.randomUUID();
      activeConversationIdRef.current = conversationId;
      activeTurnIdRef.current = turnId;
      const accepted = await chatAPI.resend(
        chatAPI.messages,
        {
          providerId,
          conversationId,
          turnId,
          expectedRevision:
            runtimeResult.data?.revision ??
            sendContext.conversation.activeRevision,
          operation: selectAppendOperation(
            runtimeResult.data ?? null,
            providerId,
            nextResponderId,
            sendContext.messages.length,
          ),
          model:
            selectedModelId === DEFAULT_LOCAL_AI_MODEL_ID
              ? undefined
              : selectedModelId,
          agent: {
            id: agent.id,
            memberId: nextResponderId,
            systemPrompt: buildResponderPrompt(agent, nextResponderId, members),
          },
          responderId: nextResponderId,
          requestMessages: projectFor(
            nextResponderId,
            toProjectable(chatAPI.messages),
            members,
          ),
        },
        sendContext.messages,
      );
      if (!accepted) {
        activeConversationIdRef.current = null;
        activeTurnIdRef.current = null;
      }
    } finally {
      relayActiveRef.current = false;
    }
  }, [chatAPI]);

  // Save messages when loading completes (message finished)
  useEffect(() => {
    const wasLoading = prevLoadingRef.current;
    const isLoading = chatAPI.isLoading;
    prevLoadingRef.current = isLoading;

    // Only save when transitioning from loading to not loading
    if (wasLoading && !isLoading && chatAPI.messages.length > 0) {
      const saveMessages = async () => {
        try {
          const convId = activeConversationIdRef.current;
          const completedTurn = chatAPI.lastCompletedTurn;

          if (
            !convId ||
            !completedTurn ||
            completedTurn.turnId !== activeTurnIdRef.current ||
            !(await db.conversations.get(convId))
          ) {
            console.error(
              "Refusing to save a local AI stream without its completed turn.",
            );
            return false;
          }

          const liveAssistant = chatAPI.messages.find(
            (message) => message.id === completedTurn.assistantMessageId,
          );
          const liveAssistantMentions = liveAssistant
            ? parseMentions(
                typeof liveAssistant.content === "string"
                  ? liveAssistant.content
                  : "",
                await db.members.toArray(),
              )
            : undefined;
          const result = await reconcilePendingTurn(completedTurn.turnId, {
            liveAssistant: liveAssistant
              ? {
                  content: liveAssistant.content,
                  senderId: liveAssistant.senderId,
                  mentions: liveAssistantMentions,
                  reactions: liveAssistant.reactions,
                  parts: liveAssistant.parts,
                  experimental_attachments:
                    liveAssistant.experimental_attachments?.map(
                      (attachment) => ({
                        url: attachment.url,
                        name: attachment.name ?? "",
                        contentType: attachment.contentType ?? "",
                      }),
                    ),
                }
              : undefined,
          });
          if (result.locallySettled) {
            completeConversationTurnPersistence(completedTurn.turnId);
            activeConversationIdRef.current = null;
            activeTurnIdRef.current = null;
            console.log("💾 Reconciled local AI turn:", completedTurn.turnId);
            return true;
          } else {
            console.warn(
              "Local AI turn is not terminal in the durable outbox yet:",
              completedTurn.turnId,
            );
            return false;
          }
        } catch (error) {
          // Keep both the in-memory barrier and Dexie journal. The background
          // reconciler or delete-time reconciliation will retry the commit.
          console.error(
            "Failed to persist the completed local AI turn:",
            error,
          );
          return false;
        }
      };

      saveMessages().then((settled) => {
        if (settled) void runRelay();
      });
    }
  }, [
    chatAPI.isLoading,
    chatAPI.lastCompletedTurn,
    chatAPI.messages,
    setCurrentConversationId,
    runRelay,
  ]);

  // Note: Conversation selection from sidebar is now handled automatically
  // through the shared useSelectionStore (Zustand) - no event listeners needed

  const toggleViewMode = useCallback(() => {
    setViewMode((prev) => (prev === "compact" ? "expanded" : "compact"));
  }, []);

  const addAttachments = useCallback((files: File | File[]) => {
    setAttachments((prev) => {
      if (Array.isArray(files)) {
        return [...prev, ...files];
      } else {
        return [...prev, files];
      }
    });
  }, []);

  const removeAttachment = useCallback((index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const clearAttachments = useCallback(() => {
    setAttachments([]);
  }, []);

  const getAvailableTools = useCallback(async () => {
    setToolsLoading(true);
    setToolsError(null);

    try {
      // Get all tools from all connected servers (includes builtin tools)
      const toolsResponse = await window.mcpAPI.getAllTools();

      if (!toolsResponse.success) {
        throw new Error(toolsResponse.error || "Failed to get MCP tools");
      }

      const toolServers = toolsResponse.data || [];

      // Also get server info for state management
      const serversResponse = await window.mcpAPI.getServers();
      if (serversResponse.success && serversResponse.data) {
        setMcpServers(serversResponse.data);
      }

      // Collect all tools from all servers
      const allTools: ToolDefinition[] = [];
      toolServers.forEach((server) => {
        allTools.push(...server.tools);
      });

      setAvailableTools(allTools);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error("Failed to get available tools:", errorMessage);
      setToolsError(errorMessage);
    } finally {
      setToolsLoading(false);
    }
  }, []);

  const executeTool = useCallback(
    async (
      serverId: string,
      toolName: string,
      args: Record<string, unknown>,
    ) => {
      try {
        const result = await window.mcpAPI.callTool(serverId, toolName, args);

        if (!result.success) {
          throw new Error(result.error || "Tool execution failed");
        }

        return result.data;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        console.error(
          "Tool execution failed:",
          serverId,
          toolName,
          errorMessage,
        );
        throw error;
      }
    },
    [],
  );

  // Load available tools on mount
  useEffect(() => {
    getAvailableTools();
  }, [getAvailableTools]);

  // Simplified MCP tool call (just a wrapper around executeTool)
  const callTool = useCallback(
    async (
      serverId: string,
      toolName: string,
      args: Record<string, unknown>,
    ): Promise<ToolCallResult> => {
      try {
        const data = await executeTool(serverId, toolName, args);
        return { success: true, data };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        return { success: false, error: errorMessage };
      }
    },
    [executeTool],
  );

  // Helper to convert a File to an Attachment
  const fileToAttachment = useCallback((file: File): Promise<Attachment> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        resolve({
          url: reader.result as string,
          name: file.name,
          contentType: file.type,
        });
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }, []);

  const getRuntimeState = useCallback(async (conversationId: string) => {
    const result =
      await window.localAI.getConversationRuntimeState(conversationId);
    if (!result.success) {
      throw new Error(
        result.error?.message || "Could not read conversation runtime state.",
      );
    }
    return result.data ?? null;
  }, []);

  const sendMessage = useCallback(
    (messageOrFiles?: string | File[], extraFiles?: File[]) => {
      // Handle overloaded parameters
      let messageText: string;
      const filesToSend = [...attachments];

      if (typeof messageOrFiles === "string") {
        // Called with message string
        messageText = messageOrFiles;
        console.log("📨 sendMessage called with string:", messageText);
        if (extraFiles && extraFiles.length > 0) {
          filesToSend.push(...extraFiles);
        }
      } else if (Array.isArray(messageOrFiles)) {
        // Called with files array (old signature)
        messageText = chatAPI.input.trim();
        filesToSend.push(...messageOrFiles);
      } else {
        // Called with no arguments
        messageText = chatAPI.input.trim();
      }

      if (!messageText && !selectedContent && filesToSend.length === 0) return;
      const requestedSelection = getConversationSelectionToken();

      // Handle selected content (text only)
      if (selectedContent) {
        // Handle text content
        if (selectedContent.text) {
          messageText = messageText
            ? `<selected>\n${selectedContent.text}\n</selected>\n\n${messageText}`
            : `<selected>\n${selectedContent.text}\n</selected>`;
        }

        setSelectedContent(null);
      }

      const message: ChatMessage = {
        role: "user",
        content: messageText,
        senderId: LOCAL_HUMAN_MEMBER_ID,
      };

      const sendMessageWithAttachments = async () => {
        try {
          // Use ref to get the latest settings
          const currentSettings = settingsRef.current;

          // Ensure settings are loaded before sending
          if (!currentSettings) {
            console.error("Settings not loaded yet, cannot send message");
            return;
          }

          if (filesToSend.length > 0) {
            const fileAttachments = await Promise.all(
              filesToSend.map(fileToAttachment),
            );
            message.experimental_attachments = fileAttachments;
          }

          let selection = requestedSelection;
          let defaultSelection = getDefaultProviderSelection();
          if (selection.conversationId) {
            await flushConversationProviderSelection(selection.conversationId);
            assertConversationSelectionUnchanged(
              selection,
              getConversationSelectionToken(),
            );
          }
          let sendContext = await loadConversationSendContext({
            selection,
            defaultSelection,
            getSelection: getConversationSelectionToken,
          });

          if (!sendContext) {
            assertConversationSelectionUnchanged(
              selection,
              getConversationSelectionToken(),
            );
            const conversationIdToUse = await createConversation({
              title: messageText.slice(0, 50) || "New Conversation",
              agentId: selectedAgent?.id ?? null,
              modelId: `${defaultSelection.configId}:${defaultSelection.modelId}`,
              activeRevision: 0,
              activeProviderId: defaultSelection.configId,
              activeModelId: defaultSelection.modelId,
            });
            try {
              assertConversationSelectionUnchanged(
                selection,
                getConversationSelectionToken(),
              );
            } catch (error) {
              await deleteConversationFromDexie(conversationIdToUse);
              throw error;
            }
            setCurrentConversationId(conversationIdToUse);
            currentConversationIdRef.current = conversationIdToUse;
            selection = getConversationSelectionToken();
            defaultSelection = getDefaultProviderSelection();
            sendContext = await loadConversationSendContext({
              selection,
              defaultSelection,
              getSelection: getConversationSelectionToken,
            });
          }

          if (!sendContext || !selection.conversationId) {
            throw new Error("Could not load the selected conversation.");
          }
          const conversationIdToUse = selection.conversationId;
          const { conversation, messages: persistedMessages } = sendContext;
          const channel = await db.channels
            .where("conversationId")
            .equals(conversationIdToUse)
            .first();
          if (channel) {
            const persisted = await submitHumanChannelMessage({
              channel,
              conversation,
              content: messageText,
              persistedMessageCount: persistedMessages.length,
              attachments: message.experimental_attachments?.map(
                (attachment) => ({
                  url: attachment.url,
                  name: attachment.name ?? "",
                  contentType: attachment.contentType ?? "",
                }),
              ),
            });
            chatAPI.setMessages([
              ...persistedMessages,
              {
                id: persisted.id,
                role: "user",
                content: persisted.content,
                senderId: persisted.senderId,
                mentions: persisted.mentions,
                experimental_attachments: message.experimental_attachments,
                createdAt: persisted.createdAt,
              },
            ]);
            chatAPI.setInput("");
            clearAttachments();
            return;
          }

          const providerId = resolveLocalAIProviderId(
            sendContext.providerSelection.configId,
          );
          const selectedModelId = sendContext.providerSelection.modelId;
          const members = await db.members.toArray();
          const mentionedMemberIds = parseMentions(messageText, members);
          message.mentions = mentionedMemberIds;
          const routed = routeMessage({
            message: {
              senderId: LOCAL_HUMAN_MEMBER_ID,
              content: messageText,
            },
            members,
            defaultAgentMemberId: selectedAgent
              ? memberIdForAgent(selectedAgent.id)
              : null,
            chain: null,
          });

          chainRef.current = routed.chain;
          const [firstResponder, ...queued] = routed.invoke;
          pendingInvokesRef.current = queued;
          const responderMember = members.find(
            (member) => member.id === firstResponder,
          );
          const responder = responderMember?.agentId
            ? ((await db.agents.get(responderMember.agentId)) ?? selectedAgent)
            : selectedAgent;
          const responderMemberId = responder
            ? memberIdForAgent(responder.id)
            : undefined;
          const runtimeState = await getRuntimeState(conversationIdToUse);
          assertConversationSelectionUnchanged(
            selection,
            getConversationSelectionToken(),
          );
          const turnId = crypto.randomUUID();
          activeConversationIdRef.current = conversationIdToUse;
          activeTurnIdRef.current = turnId;

          const accepted = await chatAPI.send(
            message,
            {
              providerId,
              conversationId: conversationIdToUse,
              turnId,
              expectedRevision:
                runtimeState?.revision ?? conversation.activeRevision,
              model:
                selectedModelId === DEFAULT_LOCAL_AI_MODEL_ID
                  ? undefined
                  : selectedModelId,
              operation: selectAppendOperation(
                runtimeState,
                providerId,
                responderMemberId ?? "actor:default",
                persistedMessages.length,
              ),
              agent: responder
                ? {
                    id: responder.id,
                    memberId: responderMemberId,
                    systemPrompt: buildResponderPrompt(
                      responder,
                      responderMemberId,
                      members,
                    ),
                  }
                : undefined,
              responderId: responderMemberId,
              requestMessages: responderMemberId
                ? projectFor(
                    responderMemberId,
                    [
                      ...toProjectable(persistedMessages),
                      {
                        senderId: LOCAL_HUMAN_MEMBER_ID,
                        role: "user",
                        content: messageText,
                      },
                    ],
                    members,
                  )
                : undefined,
            },
            persistedMessages,
          );

          if (accepted) {
            chatAPI.setInput("");
            clearAttachments();
          } else {
            activeConversationIdRef.current = null;
            activeTurnIdRef.current = null;
          }
        } catch (error) {
          activeConversationIdRef.current = null;
          activeTurnIdRef.current = null;
          console.error("Could not prepare the selected conversation:", error);
        }
      };

      sendMessageWithAttachments();
    },
    [
      chatAPI,
      selectedContent,
      attachments,
      clearAttachments,
      fileToAttachment,
      setCurrentConversationId,
      selectedAgent,
      getRuntimeState,
    ],
  );

  const setInput = useCallback(
    (newInput: string) => {
      chatAPI.setInput(newInput);
    },
    [chatAPI],
  );

  const stopGeneration = useCallback(() => {
    if (chatAPI.status === "streaming" || chatAPI.status === "submitted") {
      void chatAPI.stop();
    }
  }, [chatAPI]);

  const editMessage = useCallback(
    (message: Message, newContent: string) => {
      const requestedSelection = getConversationSelectionToken();
      const rebase = async () => {
        if (!requestedSelection.conversationId) return;
        await flushConversationProviderSelection(
          requestedSelection.conversationId,
        );
        assertConversationSelectionUnchanged(
          requestedSelection,
          getConversationSelectionToken(),
        );
        const sendContext = await loadConversationSendContext({
          selection: requestedSelection,
          defaultSelection: getDefaultProviderSelection(),
          getSelection: getConversationSelectionToken,
        });
        if (!sendContext) return;
        const updatedMessages = buildAuthoritativeEditMessages(
          sendContext.messages,
          message.id,
          newContent,
        );
        if (!updatedMessages) return;

        const conversationId = requestedSelection.conversationId;
        const providerId = resolveLocalAIProviderId(
          sendContext.providerSelection.configId,
        );
        const selectedModelId = sendContext.providerSelection.modelId;
        const members = await db.members.toArray();
        const responderMemberId = selectedAgent
          ? memberIdForAgent(selectedAgent.id)
          : undefined;
        const runtimeState = await getRuntimeState(conversationId);
        assertConversationSelectionUnchanged(
          requestedSelection,
          getConversationSelectionToken(),
        );
        const turnId = crypto.randomUUID();
        activeConversationIdRef.current = conversationId;
        activeTurnIdRef.current = turnId;
        const accepted = await chatAPI.resend(
          updatedMessages,
          {
            providerId,
            conversationId,
            turnId,
            expectedRevision:
              runtimeState?.revision ?? sendContext.conversation.activeRevision,
            model:
              selectedModelId === DEFAULT_LOCAL_AI_MODEL_ID
                ? undefined
                : selectedModelId,
            operation: {
              kind: "rebase",
              reason: "edit",
              sourceMessageId: message.id,
            },
            agent: selectedAgent
              ? {
                  id: selectedAgent.id,
                  memberId: responderMemberId,
                  systemPrompt: buildResponderPrompt(
                    selectedAgent,
                    responderMemberId,
                    members,
                  ),
                }
              : undefined,
            responderId: responderMemberId,
            requestMessages: responderMemberId
              ? projectFor(
                  responderMemberId,
                  toProjectable(updatedMessages),
                  members,
                )
              : undefined,
          },
          sendContext.messages,
        );
        if (!accepted) {
          activeConversationIdRef.current = null;
          activeTurnIdRef.current = null;
        }
      };

      void rebase().catch((error) => {
        activeConversationIdRef.current = null;
        activeTurnIdRef.current = null;
        console.error("Failed to edit and rebase conversation:", error);
      });
    },
    [chatAPI, getRuntimeState, selectedAgent],
  );

  const regenerateMessage = useCallback(
    (message: Message) => {
      if (chatAPI.status === "ready" || chatAPI.status === "error") {
        const requestedSelection = getConversationSelectionToken();
        const rebase = async () => {
          if (!requestedSelection.conversationId) return;
          await flushConversationProviderSelection(
            requestedSelection.conversationId,
          );
          assertConversationSelectionUnchanged(
            requestedSelection,
            getConversationSelectionToken(),
          );
          const sendContext = await loadConversationSendContext({
            selection: requestedSelection,
            defaultSelection: getDefaultProviderSelection(),
            getSelection: getConversationSelectionToken,
          });
          if (!sendContext) return;
          const nextMessages = buildAuthoritativeRegenerateMessages(
            sendContext.messages,
            message.id,
          );
          if (!nextMessages) return;
          const conversationId = requestedSelection.conversationId;
          const providerId = resolveLocalAIProviderId(
            sendContext.providerSelection.configId,
          );
          const selectedModelId = sendContext.providerSelection.modelId;
          const members = await db.members.toArray();
          const responderMemberId = selectedAgent
            ? memberIdForAgent(selectedAgent.id)
            : undefined;
          const runtimeState = await getRuntimeState(conversationId);
          assertConversationSelectionUnchanged(
            requestedSelection,
            getConversationSelectionToken(),
          );
          const turnId = crypto.randomUUID();
          activeConversationIdRef.current = conversationId;
          activeTurnIdRef.current = turnId;
          const accepted = await chatAPI.resend(
            nextMessages,
            {
              providerId,
              conversationId,
              turnId,
              expectedRevision:
                runtimeState?.revision ??
                sendContext.conversation.activeRevision,
              model:
                selectedModelId === DEFAULT_LOCAL_AI_MODEL_ID
                  ? undefined
                  : selectedModelId,
              operation: {
                kind: "rebase",
                reason: "regenerate",
                sourceMessageId: message.id,
              },
              agent: selectedAgent
                ? {
                    id: selectedAgent.id,
                    memberId: responderMemberId,
                    systemPrompt: buildResponderPrompt(
                      selectedAgent,
                      responderMemberId,
                      members,
                    ),
                  }
                : undefined,
              responderId: responderMemberId,
              requestMessages: responderMemberId
                ? projectFor(
                    responderMemberId,
                    toProjectable(nextMessages),
                    members,
                  )
                : undefined,
            },
            sendContext.messages,
          );
          if (!accepted) {
            activeConversationIdRef.current = null;
            activeTurnIdRef.current = null;
          }
        };
        void rebase().catch((error) => {
          activeConversationIdRef.current = null;
          activeTurnIdRef.current = null;
          console.error("Failed to regenerate conversation:", error);
        });
      }
    },
    [chatAPI, getRuntimeState, selectedAgent],
  );

  const resetChat = useCallback(() => {
    console.log("🔄 Frontend: resetChat called, clearing conversation ID");
    // Clear any pending user inputs
    useUserInputStore.getState().clearAllPending();
    chatAPI.setMessages([]);
    activeConversationIdRef.current = null;
    activeTurnIdRef.current = null;
    setSelectedContent(null);
    clearAttachments();
    setCurrentConversationId(null);
    // Reset to compact mode when clearing chat
    setViewMode("compact");
  }, [chatAPI, clearAttachments, setCurrentConversationId]);

  const rejectSelectedContent = useCallback(() => {
    setSelectedContent(null);
  }, []);

  // Chat related actions (previously in app-actions-store)

  const resetChatWindow = useCallback(() => {
    resetChat();
    setInput("");
  }, [resetChat, setInput]);

  const contextValue: ChatContextType = {
    messages: chatAPI.messages as UIMessage[],
    input: chatAPI.input,
    isLoading: chatAPI.status === "streaming" || chatAPI.status === "submitted",
    error: chatAPI.error,
    selectedContent,
    attachments,
    viewMode,
    setViewMode,
    toggleViewMode,
    currentConversationId,
    setInput,
    sendMessage,
    stopGeneration,
    editMessage,
    regenerateMessage,
    resetChat,
    setSelectedContent,
    rejectSelectedContent,
    addAttachments,
    removeAttachment,
    clearAttachments,
    resetChatWindow,
    availableTools,
    mcpServers,
    toolsLoading,
    toolsError,
    getAvailableTools,
    executeTool,
    callTool,
  };

  // Show loading state if settings are not loaded yet
  if (settingsLoading || !settings) {
    return <div>Loading chat...</div>;
  }

  return (
    <ChatContext.Provider value={contextValue}>{children}</ChatContext.Provider>
  );
};

export const useChatContext = () => {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error("useChatContext must be used within a ChatProvider");
  }
  return context;
};
