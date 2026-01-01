import { ServerInfo, ToolDefinition } from "@/shared/types/mcp";
import { AppSettings, FOXYCHAT_CONFIG_ID } from "@/shared/types/settings";
import { Attachment, Message, UIMessage } from "ai";
import { useChat } from "ai/react";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { authClient } from "../auth-client";
import { getApiBaseUrl } from "../env";
import { usePreviousApp } from "../hooks/use-previous-app";
import { SpeechConfig, useSpeechToText } from "../hooks/use-speech-to-text";
import { updateOpenAISettings } from "../utils/settings";
import { useAgentStore } from "./agent-store";
import { useIsLoggedIn, useSetAuthState } from "./auth-store";
import { useChatHistory } from "./chat-history-store";
import { useModelConfigStore } from "./model-config-store";
import { db, createConversation, updateMessages } from "../db";
import { useSelectionStore } from "../db/ui-state";
import { useSettingsStore } from "./settings-store";

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

  // Remote store management
  useRemoteStore: boolean;
  setUseRemoteStore: (useRemote: boolean) => void;
  isUserLoggedIn: boolean;

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
  handleVoiceInput: () => void;
  isVoiceInputActive: boolean;

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

  // Speech-to-text state
  speechState: {
    isRecording: boolean;
    error: string | null;
  };
}

interface ChatMessage extends Omit<Message, "id"> {
  experimental_attachments?: Attachment[];
}

const ChatContext = createContext<ChatContextType | null>(null);

export const ChatProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { settings, settingsLoading, initializeSettings } = useSettingsStore();
  const { previousApp, openedApps } = usePreviousApp();
  const [selectedContent, setSelectedContent] =
    useState<SelectedContent | null>(null);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [viewMode, setViewMode] = useState<ChatViewMode>("compact");
  const [isVoiceInputActive, setIsVoiceInputActive] = useState(false);
  const isUserLoggedIn = useIsLoggedIn();
  const setAuthState = useSetAuthState();
  const [useRemoteStore, setUseRemoteStore] = useState(false);

  // Use shared Zustand store for conversation ID to sync with sidebar selection
  const { currentConversationId, setCurrentConversation: setCurrentConversationId } = useSelectionStore();

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
  const currentInputRef = useRef<string>("");
  const settingsRef = useRef<AppSettings | null>(settings);

  // Initialize speech-to-text hook
  const speechToText = useSpeechToText();

  // Initialize settings on mount
  useEffect(() => {
    initializeSettings();
  }, [initializeSettings]);

  // Update useRemoteStore when settings change
  useEffect(() => {
    if (settings) {
      setUseRemoteStore(settings.openai?.useRemoteStore || false);
    }
  }, [settings]);

  // Use reactive session hook for real-time authentication state
  const { data: session, refetch: refetchSession } = authClient.useSession();
  const isLoggedIn = session?.session?.id ? true : false;

  // Add a ref to track session refetch function for cross-window sync
  const refetchSessionRef = useRef(refetchSession);
  useEffect(() => {
    refetchSessionRef.current = refetchSession;
  }, [refetchSession]);

  // Update login status and handle remote store accordingly
  useEffect(() => {
    // Update auth store with session data
    setAuthState({
      isLoggedIn,
      sessionId: session?.session?.id || undefined,
    });

    // If user is not logged in, force disable remote server
    if (!isLoggedIn && useRemoteStore) {
      setUseRemoteStore(false);
      // Also save to settings
      updateOpenAISettings({ useRemoteStore: false }).catch((error) => {
        console.error("Failed to save remote store preference:", error);
      });
    }
  }, [isLoggedIn, useRemoteStore, session?.session?.id]);

  // useEffect(() => {
  //   currentModelIdRef.current = selectedModelId;
  // }, [selectedModelId]);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const chatAPI = useChat({
    api: getApiBaseUrl() + "/chat/completion",
    maxSteps: 5,
    initialInput: "",
    fetch: async (url, options = {}) => {
      // Use reactive session from hook
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(options.headers as Record<string, string>),
      };

      // Always include session if available
      if (session?.session?.id) {
        headers["X-Session-ID"] = session.session.id;
      }

      // Ensure all requests have complete MCP configuration
      if (options.body && typeof options.body === "string") {
        try {
          const body = JSON.parse(options.body) as {
            mcpServers?: Array<{ name: string; tools: ToolDefinition[] }>;
            useRemoteServer?: boolean;
            customApiSettings?: { endpoint: string; apiKey: string };
            agent?: unknown;
            modelId?: string;
            messages?: unknown[];
            [key: string]: unknown;
          };

          // Only supplement if missing critical fields
          if (!body.mcpServers || body.mcpServers.length === 0) {
            const currentSettings = settingsRef.current;
            if (currentSettings) {
              // Get fresh MCP tools data (includes builtin tools)
              const toolsResponse = await window.mcpAPI.getAllTools();
              let mcpServers: Array<{
                name: string;
                tools: ToolDefinition[];
              }> = [];

              if (toolsResponse.success && toolsResponse.data) {
                mcpServers = toolsResponse.data.map((server) => ({
                  name: server.serverName,
                  tools: server.tools,
                }));
              }

              // Get model config from store for interceptor
              const {
                selectedConfigId: interceptorConfigId,
                getCurrentConfig: getInterceptorConfig,
              } = useModelConfigStore.getState();

              // Supplement missing configuration with correct logic
              const shouldUseRemoteServer =
                interceptorConfigId === FOXYCHAT_CONFIG_ID && isUserLoggedIn;

              if (
                !Object.prototype.hasOwnProperty.call(body, "useRemoteServer")
              ) {
                body.useRemoteServer = shouldUseRemoteServer;
              }

              // Set customApiSettings from model config if NOT using remote server
              if (!body.customApiSettings && !shouldUseRemoteServer) {
                const interceptorConfig = await getInterceptorConfig();
                if (interceptorConfig) {
                  body.customApiSettings = {
                    endpoint: interceptorConfig.endpoint,
                    apiKey: interceptorConfig.apiKey,
                  };
                }
              }
              if (!body.agent) {
                body.agent = selectedAgent || undefined;
              }
              if (!body.modelId) {
                // body.modelId = // Let backend use default
                //   selectedModelId || currentSettings.openai?.modelId;
              }

              body.mcpServers = mcpServers;
              window.logger.getLogger("asd").info("mcpServers", mcpServers);

              options.body = JSON.stringify(body);
            }
          }
        } catch (error) {
          console.warn("Failed to parse/update request body:", error);
        }
      }

      return fetch(url, {
        ...options,
        headers,
        credentials: "include", // Always include credentials
      });
    },
    onError: (error) => {
      if (error instanceof Error && error.message.includes("fetch")) {
        console.error(
          "Network error - is the backend server running on port 3001?",
        );
      }
    },
    onToolCall: async ({ toolCall }) => {
      // Use simplified MCP tool call that finds first server with the tool
      const result = await window.mcpAPI.mcpToolCall(
        toolCall.toolName,
        toolCall.args as Record<string, unknown>,
      );

      if (!result.success) {
        throw new Error(result.error || "Tool call failed");
      }

      return result.data;
    },
    onFinish: async () => {
      console.log("✅ Frontend: Message completed successfully");
      // Messages will be saved via the saveMessagesRef callback
    },
  });

  // Auto-expand when there are messages
  useEffect(() => {
    if (chatAPI.messages.length > 0 && viewMode === "compact") {
      setViewMode("expanded");
    }
  }, [chatAPI.messages.length, viewMode]);

  // Update input ref for speech callbacks
  useEffect(() => {
    currentInputRef.current = chatAPI.input;
  }, [chatAPI.input]);

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

  // Handle remote store preference change
  const handleUseRemoteStoreChange = useCallback(
    async (useRemote: boolean) => {
      // Only allow enabling if user is logged in
      if (useRemote && !isUserLoggedIn) {
        console.warn("Cannot enable remote server without login");
        return;
      }

      setUseRemoteStore(useRemote);
      // Save to settings
      try {
        await updateOpenAISettings({ useRemoteStore: useRemote });
      } catch (error) {
        console.error("Failed to save remote store preference:", error);
      }
    },
    [isUserLoggedIn],
  );

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

          // Get fresh MCP tools data for this request (includes builtin tools)
          const toolsResponse = await window.mcpAPI.getAllTools();
          let mcpServers: Array<{ name: string; tools: ToolDefinition[] }> = [];

          if (toolsResponse.success && toolsResponse.data) {
            mcpServers = toolsResponse.data.map((server) => ({
              name: server.serverName,
              tools: server.tools,
            }));
          }

          // Get current model config from store
          const { selectedConfigId, getCurrentConfig } =
            useModelConfigStore.getState();

          // Determine which API to use based on selected config
          let shouldUseRemoteServer =
            selectedConfigId === FOXYCHAT_CONFIG_ID && isUserLoggedIn;
          let currentConfig = await getCurrentConfig();

          // If using FOXYCHAT_CONFIG_ID but not logged in, try to find a custom config
          if (selectedConfigId === FOXYCHAT_CONFIG_ID && !isUserLoggedIn) {
            const allConfigs = await db.modelConfigs.toArray();
            if (allConfigs.length > 0) {
              // Auto-select the first available custom config
              currentConfig = allConfigs[0];
              shouldUseRemoteServer = false;
            }
          }

          // Build customApiSettings from the selected model config
          const customApiSettings =
            !shouldUseRemoteServer && currentConfig
              ? {
                  endpoint: currentConfig.endpoint,
                  apiKey: currentConfig.apiKey,
                }
              : undefined;

          // If neither remote nor custom API is available, show error
          const hasValidConfig = shouldUseRemoteServer || currentConfig;
          if (!hasValidConfig) {
            // Fallback: check legacy settings
            const hasLegacyConfig =
              currentSettings?.openai?.apiKey &&
              currentSettings.openai.apiKey.trim() !== "" &&
              currentSettings.openai.endpoint &&
              currentSettings.openai.endpoint.trim() !== "";

            if (!hasLegacyConfig) {
              console.error(
                "No API configured. Please log in or add a model configuration.",
              );
              alert(
                "Please log in or add a model configuration to use the chat. Click the Account button to set up.",
              );
              return;
            }
          }
          const requestBody = {
            agent: selectedAgent || undefined,
            // modelId: // Let backend use default model
            //   currentModelIdRef.current || currentSettings?.openai?.modelId,
            conversationId: conversationIdToUse || undefined,
            useRemoteServer: shouldUseRemoteServer,
            customApiSettings,
            // Re-enable MCP servers
            mcpServers,
            environment: {
              app: {
                activeApp: previousApp,
                openedApps: openedApps,
              },
            },
          };
          console.log("🔧 Frontend: Sending request with body:", requestBody);

          // Send message with all custom fields
          chatAPI.append(message, {
            body: requestBody,
          });

          // Clear the input after sending to prevent stale data
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
      isUserLoggedIn,
      useRemoteStore,
      previousApp,
      openedApps,
      session,
    ],
  );

  const setInput = useCallback(
    (newInput: string) => {
      chatAPI.handleInputChange({
        target: { value: newInput },
      } as React.ChangeEvent<HTMLInputElement>);
    },
    [chatAPI],
  );

  const stopGeneration = useCallback(() => {
    if (chatAPI.status === "streaming" || chatAPI.status === "submitted") {
      chatAPI.stop();
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

      chatAPI.setMessages(updatedMessages);

      setTimeout(() => {
        chatAPI.reload();
      }, 100);
    },
    [chatAPI],
  );

  const regenerateMessage = useCallback(() => {
    if (chatAPI.status === "ready" || chatAPI.status === "error") {
      chatAPI.reload();
    }
  }, [chatAPI]);

  const resetChat = useCallback(() => {
    console.log("🔄 Frontend: resetChat called, clearing conversation ID");
    chatAPI.setMessages([]);
    setSelectedContent(null);
    clearAttachments();
    setCurrentConversationId(null);
    // Reset to compact mode when clearing chat
    setViewMode("compact");
  }, [chatAPI, clearAttachments]);

  const rejectSelectedContent = useCallback(() => {
    setSelectedContent(null);
  }, []);

  // Chat related actions (previously in app-actions-store)

  const resetChatWindow = useCallback(() => {
    resetChat();
    setInput("");
  }, [resetChat, setInput]);

  // Enhanced voice input functionality with speech-to-text
  const handleVoiceInput = useCallback(async () => {
    try {
      // Toggle voice input state
      setIsVoiceInputActive((prev) => !prev);

      if (speechToText.isRecording) {
        // Stop recording - no need to append transcript since it's already added in real-time
        await speechToText.stopRecording();
      } else {
        // Start recording with default configuration and real-time callback
        const config: SpeechConfig = {
          languageCode: "en-US",
          silenceTimeoutMs: 8000, // Auto-stop after 8 seconds of silence in chat
        };

        // Callback to handle real-time final transcripts
        const onInterimResult = (transcript: string) => {
          if (transcript.trim()) {
            // Get the current input dynamically using ref to avoid stale closures
            const currentInput = currentInputRef.current.trim();
            console.log("Real-time transcript received:", transcript);
            console.log("Current input for real-time update:", currentInput);

            // Append the new transcript to existing input
            const newInput = currentInput
              ? `${currentInput} ${transcript}`
              : transcript;

            setInput(newInput);
          }
        };

        await speechToText.startRecording(config, onInterimResult);
      }
    } catch (error) {
      console.error("Voice input error:", error);
      setIsVoiceInputActive(false);
    }
  }, [speechToText, setInput]);

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
    useRemoteStore,
    setUseRemoteStore: handleUseRemoteStoreChange,
    isUserLoggedIn,
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
    handleVoiceInput,
    isVoiceInputActive: speechToText.isRecording || isVoiceInputActive,
    speechState: {
      isRecording: speechToText.isRecording,
      error: speechToText.error,
    },
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
