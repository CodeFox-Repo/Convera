import { ServerInfo, ToolDefinition } from "@/shared/types/mcp";
import { AppSettings } from "@/shared/types/settings";
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
import { parseApiError, type GenericError } from "../utils/error-handler";
import { updateOpenAISettings } from "../utils/settings";
import { useAgentStore } from "./agent-store";
import { useChatHistory } from "./chat-history-store";
// import { useModelStore } from "./model-store";
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
  openSettings: () => void;
  openHistoryWindow: () => void;
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

// Conversation data interface for history selection
interface ConversationData {
  id: string;
  title: string | null;
  messages: Message[];
}

const ChatContext = createContext<ChatContextType | null>(null);
const mcpLogger = window.logger.getLogger("chat-store-mcp");

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
  const [useRemoteStore, setUseRemoteStore] = useState(false);
  const [isUserLoggedIn, setIsUserLoggedIn] = useState(false);
  const [currentConversationId, setCurrentConversationId] = useState<
    string | null
  >(null);

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

  // Check login status on mount and update remote store accordingly
  useEffect(() => {
    const checkLoginStatus = async () => {
      try {
        const loggedIn = await authClient.getSession();
        const isLoggedIn = loggedIn?.data?.session?.id ? true : false;
        setIsUserLoggedIn(isLoggedIn);

        // If user is not logged in, force disable remote server
        if (!isLoggedIn && useRemoteStore) {
          setUseRemoteStore(false);
          // Also save to settings
          try {
            await updateOpenAISettings({ useRemoteStore: false });
          } catch (error) {
            console.error("Failed to save remote store preference:", error);
          }
        }
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (err) {
        setIsUserLoggedIn(false);
        // Force disable remote server on auth error
        if (useRemoteStore) {
          setUseRemoteStore(false);
          try {
            await updateOpenAISettings({ useRemoteStore: false });
          } catch (error) {
            console.error("Failed to save remote store preference:", error);
          }
        }
      }
    };

    checkLoginStatus();
    const interval = setInterval(checkLoginStatus, 30000);
    return () => clearInterval(interval);
  }, [useRemoteStore]);

  // useEffect(() => {
  //   currentModelIdRef.current = selectedModelId;
  // }, [selectedModelId]);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  // Listen for settings changes from other windows
  useEffect(() => {
    const handleSettingsChange = (event: StorageEvent) => {
      if (event.key === "foxchat_settings" && event.newValue) {
        try {
          const updatedSettings = JSON.parse(event.newValue);
          // Settings store will handle this automatically via its own storage listener
          setUseRemoteStore(updatedSettings.openai?.useRemoteStore || false);
        } catch (error) {
          console.error("Failed to parse settings from localStorage:", error);
        }
      }
    };

    window.addEventListener("storage", handleSettingsChange);
    return () => window.removeEventListener("storage", handleSettingsChange);
  }, []);

  const chatAPI = useChat({
    api: getApiBaseUrl() + "/chat/completion",
    maxSteps: 5,
    initialInput: "",
    fetch: async (url, options = {}) => {
      // Get session from better-auth
      const session = await authClient.getSession();

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(options.headers as Record<string, string>),
      };

      // Always include session if available
      if (session?.data?.session?.id) {
        headers["X-Session-ID"] = session.data.session.id;
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
              // Get fresh MCP servers data
              const serversResponse = await window.mcpAPI.getServers();
              const mcpServers: Array<{
                name: string;
                tools: ToolDefinition[];
              }> = [];

              if (serversResponse.success && serversResponse.data) {
                const connectedServers = serversResponse.data.filter(
                  (server) => server.status === "connected",
                );

                connectedServers.forEach((server) => {
                  if (
                    server.capabilities.tools &&
                    server.capabilities.tools.length > 0
                  ) {
                    mcpServers.push({
                      name: server.name,
                      tools: server.capabilities.tools,
                    });
                  }
                });
              }

              // Supplement missing configuration with correct logic
              const shouldUseRemoteServer = isUserLoggedIn && useRemoteStore;

              if (
                !Object.prototype.hasOwnProperty.call(body, "useRemoteServer")
              ) {
                body.useRemoteServer = shouldUseRemoteServer;
              }

              // TODO: DISABLED LOCAL API - Never set custom API settings
              // Only set customApiSettings if NOT using remote server and we have custom API config
              // if (!body.customApiSettings && !shouldUseRemoteServer) {
              //   if (
              //     currentSettings?.openai?.apiKey &&
              //     currentSettings?.openai?.endpoint
              //   ) {
              //     body.customApiSettings = {
              //       endpoint: currentSettings.openai.endpoint,
              //       apiKey: currentSettings.openai.apiKey,
              //     };
              //   }
              // }
              if (!body.agent) {
                body.agent = selectedAgent || undefined;
              }
              if (!body.modelId) {
                // body.modelId = // Let backend use default
                //   selectedModelId || currentSettings.openai?.modelId;
              }

              body.mcpServers = mcpServers;

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
      const parsedError = parseApiError(error as unknown as GenericError);
      console.error("Chat API error:", parsedError);
      console.error("Full error object:", error);
      // Check if it's a network error
      if (error instanceof Error && error.message.includes("fetch")) {
        console.error(
          "Network error - is the backend server running on port 3001?",
        );
      }
    },
    onToolCall: async ({ toolCall }) => {
      console.log("🔧 Frontend: Tool call received:", {
        toolName: toolCall.toolName,
        args: toolCall.args,
      });

      // Use simplified MCP tool call that finds first server with the tool
      const result = await window.mcpAPI.mcpToolCall(
        toolCall.toolName,
        toolCall.args as Record<string, unknown>,
      );

      console.log("🔧 Frontend: Tool call result:", {
        success: result.success,
        hasData: !!result.data,
        error: result.error,
      });

      if (!result.success) {
        throw new Error(result.error || "Tool call failed");
      }

      return result.data;
    },
    onFinish: async () => {
      // Temporarily disabled auto-refresh to debug message sending
      console.log("✅ Frontend: Message completed successfully");
      console.log(
        "🔗 Frontend: Current conversation ID:",
        currentConversationId,
      );
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
  const { toggleHistoryWindow } = useChatHistory(chatAPI.setMessages);

  // Handle conversation selection from history
  useEffect(() => {
    const handleConversationSelected = (event: Event) => {
      const customEvent = event as CustomEvent;
      if (customEvent.detail?.conversation) {
        const conversation = customEvent.detail
          .conversation as ConversationData;
        setCurrentConversationId(conversation.id);
        console.log(
          "📝 Frontend: Set conversation ID from history selection:",
          conversation.id,
        );
      }
    };

    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === "selectedConversation" && event.newValue) {
        try {
          const data = JSON.parse(event.newValue);
          if (data.conversation && data.conversation.id) {
            setCurrentConversationId(data.conversation.id);
            console.log(
              "📝 Frontend: Set conversation ID from storage event:",
              data.conversation.id,
            );
          }
        } catch (error) {
          console.warn("Error parsing conversation from localStorage:", error);
        }
      }
    };

    window.addEventListener(
      "conversation-selected",
      handleConversationSelected,
    );
    window.addEventListener("storage", handleStorageChange);

    return () => {
      window.removeEventListener(
        "conversation-selected",
        handleConversationSelected,
      );
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

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

    mcpLogger.info("Fetching available MCP tools");

    try {
      // Get all servers and their capabilities
      const serversResponse = await window.mcpAPI.getServers();

      if (!serversResponse.success) {
        throw new Error(serversResponse.error || "Failed to get MCP servers");
      }

      const servers = serversResponse.data || [];
      setMcpServers(servers);

      mcpLogger.info("MCP servers fetched", {
        totalServers: servers.length,
        connectedServers: servers.filter((s) => s.status === "connected")
          .length,
      });

      // Collect all tools from all connected servers
      const allTools: ToolDefinition[] = [];
      servers.forEach((server) => {
        if (server.status === "connected" && server.capabilities.tools) {
          mcpLogger.debug("Adding tools from server", {
            serverName: server.name,
            toolsCount: server.capabilities.tools.length,
          });
          allTools.push(...server.capabilities.tools);
        } else {
          mcpLogger.warn("Server not available for tools", {
            serverName: server.name,
            status: server.status,
          });
        }
      });

      setAvailableTools(allTools);
      mcpLogger.info("Available tools updated", {
        totalTools: allTools.length,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      mcpLogger.error("Failed to get available tools", { error: errorMessage });
      setToolsError(errorMessage);
    } finally {
      setToolsLoading(false);
    }
  }, [mcpLogger]);

  const executeTool = useCallback(
    async (
      serverId: string,
      toolName: string,
      args: Record<string, unknown>,
    ) => {
      mcpLogger.info("Executing MCP tool", { serverId, toolName, args });

      try {
        const result = await window.mcpAPI.callTool(serverId, toolName, args);

        if (!result.success) {
          throw new Error(result.error || "Tool execution failed");
        }

        mcpLogger.info("Tool execution successful", {
          serverId,
          toolName,
          resultType: typeof result.data,
        });

        return result.data;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        mcpLogger.error("Tool execution failed", {
          serverId,
          toolName,
          error: errorMessage,
        });
        throw error;
      }
    },
    [mcpLogger],
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

          // Get fresh MCP servers data for this request
          const serversResponse = await window.mcpAPI.getServers();
          const mcpServers: Array<{ name: string; tools: ToolDefinition[] }> =
            [];

          if (serversResponse.success && serversResponse.data) {
            const connectedServers = serversResponse.data.filter(
              (server) => server.status === "connected",
            );

            connectedServers.forEach((server) => {
              if (
                server.capabilities.tools &&
                server.capabilities.tools.length > 0
              ) {
                mcpServers.push({
                  name: server.name,
                  tools: server.capabilities.tools,
                });
              }
            });
          }

          // TODO: DISABLED LOCAL API - Only use remote server now
          // Check if we have valid custom API settings
          // const hasValidCustomApi =
          //   currentSettings?.openai?.apiKey &&
          //   currentSettings.openai.apiKey.trim() !== "" &&
          //   currentSettings.openai.endpoint &&
          //   currentSettings.openai.endpoint.trim() !== "";

          // Determine which API to use - FORCE remote server only
          const shouldUseRemoteServer = isUserLoggedIn;
          // const shouldUseCustomApi =
          //   !shouldUseRemoteServer && hasValidCustomApi;

          // const customApiSettings = shouldUseCustomApi
          //   ? {
          //       endpoint: currentSettings.openai.endpoint,
          //       apiKey: currentSettings.openai.apiKey,
          //     }
          //   : undefined;
          const customApiSettings = undefined; // Always undefined - no local API

          // If remote server is not available, show error
          if (!shouldUseRemoteServer) {
            console.error(
              "Remote server required. Please log in and enable remote store.",
            );
            alert(
              "Please log in and enable remote store to use the chat functionality.",
            );
            return;
          }
          // Get fresh previousAppContent before sending
          const freshPreviousAppContent =
            await window.activeAppAPI.getPreviousAppContent();

          // Debug: Log the request body being sent
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
                activeAppContent: freshPreviousAppContent,
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

  const openSettings = useCallback(() => {
    window.electronAPI.toggleWindow("settings").catch((error) => {
      console.error("Failed to toggle settings window:", error);
    });
  }, []);

  const openHistoryWindow = useCallback(() => {
    toggleHistoryWindow();
  }, [toggleHistoryWindow]);

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
    openSettings,
    openHistoryWindow,
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
