import { ServerInfo, ToolDefinition } from "@/shared/types/mcp";
import { AppSettings } from "@/shared/types/settings";
import { Attachment, Message, UIMessage } from "ai";
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
import { useChatHistory } from "./chat-history-store";
import {
  resolveLocalAIProviderId,
  useModelConfigStore,
} from "./model-config-store";
import { db, createConversation, updateMessages } from "../db";
import { useSelectionStore } from "../db/ui-state";
import { useSettingsStore } from "./settings-store";
import { useUserInputStore } from "./user-input-store";

export type ChatViewMode = "compact" | "expanded";

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
  regenerateMessage: () => void;
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
  useChatHistory(chatAPI.setMessages);

  // Track previous loading state to detect when message completes
  const prevLoadingRef = useRef(false);
  const currentConversationIdRef = useRef(currentConversationId);
  const selectedAgentIdRef = useRef(selectedAgent?.id);

  // Keep refs in sync
  useEffect(() => {
    currentConversationIdRef.current = currentConversationId;
  }, [currentConversationId]);

  useEffect(() => {
    selectedAgentIdRef.current = selectedAgent?.id;
  }, [selectedAgent?.id]);

  // Save messages when loading completes (message finished)
  useEffect(() => {
    const wasLoading = prevLoadingRef.current;
    const isLoading = chatAPI.isLoading;
    prevLoadingRef.current = isLoading;

    // Only save when transitioning from loading to not loading
    if (wasLoading && !isLoading && chatAPI.messages.length > 0) {
      const saveMessages = async () => {
        try {
          let convId = currentConversationIdRef.current;
          const messages = chatAPI.messages;

          // Check if conversation exists in database
          const existingConv = convId
            ? await db.conversations.get(convId)
            : null;

          // Create new conversation if none exists or if current ID is not in database
          if (!existingConv) {
            const firstUserMessage = messages.find(
              (m: Message) => m.role === "user",
            );
            const title =
              typeof firstUserMessage?.content === "string"
                ? firstUserMessage.content.slice(0, 50)
                : "New Conversation";

            convId = await createConversation({
              title,
              agentId: selectedAgentIdRef.current ?? null,
              modelId: null,
            });
            setCurrentConversationId(convId);
            currentConversationIdRef.current = convId;
            console.log("📝 Created new conversation:", convId);
          }

          // Save all messages to the conversation (convId is guaranteed to be set now)
          await updateMessages(
            convId!,
            messages.map((m: Message) => ({
              id: m.id,
              role: m.role as "user" | "assistant" | "system" | "tool",
              content:
                typeof m.content === "string"
                  ? m.content
                  : JSON.stringify(m.content),
              toolInvocations: m.toolInvocations,
              experimental_attachments: m.experimental_attachments?.map(
                (a: Attachment) => ({
                  url: a.url,
                  name: a.name ?? "",
                  contentType: a.contentType ?? "",
                }),
              ),
            })),
          );
          console.log("💾 Saved messages to conversation:", convId);
        } catch (error) {
          console.error("Failed to save conversation:", error);
        }
      };

      saveMessages();
    }
  }, [chatAPI.isLoading, chatAPI.messages, setCurrentConversationId]);

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

      // Generate conversation ID if this is the first message
      let conversationIdToUse = currentConversationId;

      if (!conversationIdToUse) {
        conversationIdToUse = `conv_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
        setCurrentConversationId(conversationIdToUse);
      }

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

          const { selectedConfigId, selectedModelId } =
            useModelConfigStore.getState();
          const providerId = resolveLocalAIProviderId(selectedConfigId);

          await chatAPI.send(message, {
            providerId,
            model: selectedModelId,
            agent: selectedAgent
              ? {
                  id: selectedAgent.id,
                  systemPrompt: selectedAgent.systemPrompt,
                }
              : undefined,
          });

          chatAPI.setInput("");
          clearAttachments();
        } catch (error) {
          console.error("Error processing file attachments:", error);
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
      currentConversationId,
      setCurrentConversationId,
      selectedAgent,
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
      const messageIndex = chatAPI.messages.findIndex(
        (m) => m.id === message.id,
      );
      if (messageIndex === -1) return;

      const updatedMessages = [...chatAPI.messages];
      updatedMessages[messageIndex] = {
        ...updatedMessages[messageIndex],
        content: newContent,
      };

      if (messageIndex < updatedMessages.length - 1) {
        updatedMessages.splice(messageIndex + 1);
      }

      const { selectedConfigId, selectedModelId } =
        useModelConfigStore.getState();
      void chatAPI.resend(updatedMessages, {
        providerId: resolveLocalAIProviderId(selectedConfigId),
        model: selectedModelId,
        agent: selectedAgent
          ? {
              id: selectedAgent.id,
              systemPrompt: selectedAgent.systemPrompt,
            }
          : undefined,
      });
    },
    [chatAPI, selectedAgent],
  );

  const regenerateMessage = useCallback(() => {
    if (chatAPI.status === "ready" || chatAPI.status === "error") {
      const nextMessages =
        chatAPI.messages.at(-1)?.role === "assistant"
          ? chatAPI.messages.slice(0, -1)
          : chatAPI.messages;
      const { selectedConfigId, selectedModelId } =
        useModelConfigStore.getState();
      void chatAPI.resend(nextMessages, {
        providerId: resolveLocalAIProviderId(selectedConfigId),
        model: selectedModelId,
        agent: selectedAgent
          ? {
              id: selectedAgent.id,
              systemPrompt: selectedAgent.systemPrompt,
            }
          : undefined,
      });
    }
  }, [chatAPI, selectedAgent]);

  const resetChat = useCallback(() => {
    console.log("🔄 Frontend: resetChat called, clearing conversation ID");
    // Clear any pending user inputs
    useUserInputStore.getState().clearAllPending();
    chatAPI.setMessages([]);
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
