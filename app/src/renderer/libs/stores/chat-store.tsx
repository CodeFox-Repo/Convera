/* eslint-disable @typescript-eslint/no-explicit-any */

import { ServerInfo, ToolDefinition } from "@/shared/types/mcp";
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
import { SpeechConfig, useSpeechToText } from "../hooks/use-speech-to-text";
import { parseApiError, type GenericError } from "../utils/error-handler";
import { getSettings, updateOpenAISettings } from "../utils/settings";
import { useAgentStore } from "./agent-store";
import { useChatHistory } from "./chat-history-store";
import { useModelStore } from "./model-store";

export type ChatViewMode = "compact" | "expanded";

// Clipboard content structure
export interface ClipboardContent {
  text?: string;
  imageData?: string; // base64 encoded image
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
  copiedContent: ClipboardContent | null;
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
  sendMessage: (files?: File[]) => void;
  stopGeneration: () => void;
  editMessage: (message: Message, newContent: string) => void;
  regenerateMessage: () => void;
  resetChat: () => void;
  setCopiedContent: (content: ClipboardContent | null) => void;
  rejectCopiedContent: () => void;
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
  const [settings, setSettings] = useState<any>(null);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [copiedContent, setCopiedContent] = useState<ClipboardContent | null>(
    null,
  );
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
  const { selectedModelId } = useModelStore();
  const currentModelIdRef = useRef<string>(selectedModelId);
  const currentInputRef = useRef<string>("");

  // Initialize speech-to-text hook
  const speechToText = useSpeechToText();

  // Load settings asynchronously
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settingsData = await getSettings();
        setSettings(settingsData);
        // Initialize remote store setting from settings
        setUseRemoteStore(settingsData.openai.useRemoteStore);
      } catch (error) {
        console.error("Failed to load settings:", error);
      } finally {
        setSettingsLoaded(true);
      }
    };

    loadSettings();
  }, []);

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

  useEffect(() => {
    currentModelIdRef.current = selectedModelId;
  }, [selectedModelId]);

  const chatAPI = useChat({
    api: getApiBaseUrl() + "/chat/completion",
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

      return fetch(url, {
        ...options,
        headers,
        credentials: "include", // Always include credentials
      });
    },
    onError: (error) => {
      const parsedError = parseApiError(error as unknown as GenericError);
      console.error("Chat API error:", parsedError);
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
    (extraFiles?: File[]) => {
      const filesToSend = [...attachments];

      if (extraFiles && extraFiles.length > 0) {
        filesToSend.push(...extraFiles);
      }

      if (!chatAPI.input.trim() && !copiedContent && filesToSend.length === 0)
        return;

      // Generate conversation ID if this is the first message
      let conversationIdToUse = currentConversationId;

      if (!conversationIdToUse) {
        conversationIdToUse = `conv_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
        setCurrentConversationId(conversationIdToUse);
      }

      let messageText = chatAPI.input.trim();

      // Handle clipboard content (text and/or image)
      let clipboardImageFile: File | null = null;

      if (copiedContent) {
        // Handle text content
        if (copiedContent.text) {
          messageText = messageText
            ? `<copied>\n${copiedContent.text}\n</copied>\n\n${messageText}`
            : `<copied>\n${copiedContent.text}\n</copied>`;
        }

        // Handle image content - convert to File object
        if (copiedContent.imageData) {
          try {
            const base64ToFile = (base64: string, filename: string): File => {
              const arr = base64.split(",");
              const mime = arr[0].match(/:(.*?);/)?.[1] || "image/png";
              const bstr = atob(arr.length > 1 ? arr[1] : base64);
              let n = bstr.length;
              const u8arr = new Uint8Array(n);
              while (n--) {
                u8arr[n] = bstr.charCodeAt(n);
              }
              return new File([u8arr], filename, { type: mime });
            };

            const imageDataUrl = copiedContent.imageData.startsWith("data:")
              ? copiedContent.imageData
              : `data:image/png;base64,${copiedContent.imageData}`;

            const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
            const filename = `screenshot-${timestamp}.png`;
            clipboardImageFile = base64ToFile(imageDataUrl, filename);
          } catch (error) {
            console.error("Error converting clipboard image:", error);
          }
        }

        setCopiedContent(null);
      }

      const message: ChatMessage = {
        role: "user",
        content: messageText,
      };

      const sendMessageWithAttachments = async () => {
        try {
          // Combine regular attachments with clipboard image
          const allFiles = [...filesToSend];
          if (clipboardImageFile) {
            allFiles.push(clipboardImageFile);
          }

          if (allFiles.length > 0) {
            const fileAttachments = await Promise.all(
              allFiles.map(fileToAttachment),
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

          // Send message with all custom fields
          chatAPI.append(message, {
            body: {
              agent: selectedAgent || undefined,
              modelId: currentModelIdRef.current || settings?.openai?.modelId,
              conversationId: conversationIdToUse || undefined,
              useRemoteServer: isUserLoggedIn && useRemoteStore,
              customApiSettings:
                !(isUserLoggedIn && useRemoteStore) && settings?.openai
                  ? {
                      endpoint: settings.openai.endpoint,
                      apiKey: settings.openai.apiKey,
                    }
                  : undefined,
              mcpServers,
            },
          });
          clearAttachments();
        } catch (error) {
          console.error("Error processing file attachments:", error);
        }
      };

      sendMessageWithAttachments();
    },
    [
      chatAPI,
      copiedContent,
      attachments,
      clearAttachments,
      fileToAttachment,
      currentConversationId,
      setCurrentConversationId,
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
    setCopiedContent(null);
    clearAttachments();
    setCurrentConversationId(null);
    // Reset to compact mode when clearing chat
    setViewMode("compact");
  }, [chatAPI, clearAttachments]);

  const rejectCopiedContent = useCallback(() => {
    setCopiedContent(null);
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
    copiedContent,
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
    setCopiedContent,
    rejectCopiedContent,
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
  if (!settingsLoaded) {
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
