import { AppSettings } from "@/shared/types/settings";
import { useChat } from "@ai-sdk/react";
import { Attachment, Message, UIMessage } from "ai";
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
import { parseApiError, type GenericError } from "../utils/error-handler";
import { getSettings, updateOpenAISettings } from "../utils/settings";
import { useAgentStore } from "./agent-store";
import { useChatHistory } from "./chat-history-store";
import { useModelStore } from "./model-store";

export type ChatViewMode = "compact" | "expanded";

interface ChatContextType {
  messages: UIMessage[];
  input: string;
  isLoading: boolean;
  error: Error | undefined;
  copiedContent: string | null;
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

  setInput: (input: string) => void;
  sendMessage: (files?: File[]) => void;
  stopGeneration: () => void;
  editMessage: (message: Message, newContent: string) => void;
  regenerateMessage: () => void;
  resetChat: () => void;
  setCopiedContent: (content: string | null) => void;
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
}

// Message with optional experimental_attachments
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

export const ChatProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [copiedContent, setCopiedContent] = useState<string | null>(null);
  const [isVoiceInputActive, setIsVoiceInputActive] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [viewMode, setViewMode] = useState<ChatViewMode>("compact");
  const [useRemoteStore, setUseRemoteStore] = useState(false);
  const [isUserLoggedIn, setIsUserLoggedIn] = useState(false);
  const [currentConversationId, setCurrentConversationId] = useState<
    string | null
  >(null);

  const { selectedAgent } = useAgentStore();
  const { selectedModelId } = useModelStore();
  const currentModelIdRef = useRef<string>(selectedModelId);

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

  // Check login status on mount and periodically
  useEffect(() => {
    const checkLoginStatus = async () => {
      try {
        const loggedIn = await authClient.getSession();
        setIsUserLoggedIn(loggedIn?.data?.session?.id ? true : false);
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (err) {
        setIsUserLoggedIn(false);
      }
    };

    checkLoginStatus();
    const interval = setInterval(checkLoginStatus, 30000);
    return () => clearInterval(interval);
  }, []);

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
    body: {
      agent: selectedAgent || undefined,
      modelId: currentModelIdRef.current || settings?.openai?.modelId,
      conversationId: currentConversationId,
      // Pass remote store preference and custom API settings to server
      useRemoteServer: isUserLoggedIn && useRemoteStore,
      customApiSettings:
        !(isUserLoggedIn && useRemoteStore) && settings?.openai
          ? {
              endpoint: settings.openai.endpoint,
              apiKey: settings.openai.apiKey,
            }
          : undefined,
    },
    onError: (error) => {
      const parsedError = parseApiError(error as unknown as GenericError);
      console.error("Chat API error:", parsedError);
    },
  });

  // Auto-expand when there are messages
  useEffect(() => {
    if (chatAPI.messages.length > 0 && viewMode === "compact") {
      setViewMode("expanded");
    }
  }, [chatAPI.messages.length, viewMode]);

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
      }
    };

    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === "selectedConversation" && event.newValue) {
        try {
          const data = JSON.parse(event.newValue);
          if (data.conversation && data.conversation.id) {
            setCurrentConversationId(data.conversation.id);
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
  const handleUseRemoteStoreChange = useCallback(async (useRemote: boolean) => {
    setUseRemoteStore(useRemote);
    // Save to settings
    try {
      await updateOpenAISettings({ useRemoteStore: useRemote });
    } catch (error) {
      console.error("Failed to save remote store preference:", error);
    }
  }, []);

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
      if (!currentConversationId) {
        const newConversationId = `conv_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
        setCurrentConversationId(newConversationId);
      }

      let messageText = chatAPI.input.trim();

      if (copiedContent) {
        messageText = messageText
          ? `<copied>\n${copiedContent}\n</copied>\n\n${messageText}`
          : `<copied>\n${copiedContent}\n</copied>`;

        setCopiedContent(null);
      }

      const message: ChatMessage = {
        role: "user",
        content: messageText,
      };

      const sendMessageWithAttachments = async () => {
        try {
          if (filesToSend.length > 0) {
            const fileAttachments = await Promise.all(
              filesToSend.map(fileToAttachment),
            );
            message.experimental_attachments = fileAttachments;
          }
          chatAPI.append(message);
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
    if (chatAPI.isLoading) {
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
    if (!chatAPI.isLoading) {
      chatAPI.reload();
    }
  }, [chatAPI]);

  const resetChat = useCallback(() => {
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

  const handleVoiceInput = useCallback(() => {
    setIsVoiceInputActive((prev) => !prev);
  }, []);

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
    isLoading: chatAPI.isLoading,
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
    isVoiceInputActive,
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
