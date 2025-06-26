import {
  GenericError,
  parseApiError,
} from "@/renderer/libs/utils/error-handler";
import { getSettings } from "@/renderer/libs/utils/settings";
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
import { useChatHistory } from "../hooks/use-chat-history";
import { useAgentStore } from "./agent-store";
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

  // Vision automate mode
  isVisionAutomateMode: boolean;
  setVisionAutomateMode: (enabled: boolean) => void;
  toggleVisionAutomateMode: () => void;

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
  const [isVisionAutomateMode, setIsVisionAutomateMode] = useState(false);

  const { selectedAgent } = useAgentStore();
  const { selectedModelId } = useModelStore();
  const currentAgentIdRef = useRef<string | undefined>(selectedAgent?.id);
  const currentModelIdRef = useRef<string>(selectedModelId);

  // Load settings asynchronously
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settingsData = await getSettings();
        setSettings(settingsData);
      } catch (error) {
        console.error("Failed to load settings:", error);
      } finally {
        setSettingsLoaded(true);
      }
    };

    loadSettings();
  }, []);

  useEffect(() => {
    currentAgentIdRef.current = selectedAgent?.id;
  }, [selectedAgent?.id]);

  useEffect(() => {
    currentModelIdRef.current = selectedModelId;
  }, [selectedModelId]);

  // TODO(Sma1lboy): change api to use the api from the backend
  const chatAPI = useChat({
    api: "http://localhost:38000/api/chat",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings?.openai?.apiKey || ""}`,
    },
    body: {
      config: settings,
      agentId: currentAgentIdRef.current,
      modelId: currentModelIdRef.current || settings?.openai?.modelId,
    },
    onError: (error) => {
      const parsedError = parseApiError(error as unknown as GenericError);
      console.error("Chat API error:", parsedError);
    },
  });

  const chatVisionAPI = useChat({
    api: "http://localhost:38000/api/agent/automation",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings?.openai?.apiKey || ""}`,
    },
    body: {
      config: settings,
      agentId: currentAgentIdRef.current,
      modelId: currentModelIdRef.current || settings?.openai?.modelId,
    },
    onError: (error) => {
      const parsedError = parseApiError(error as unknown as GenericError);
      console.error("Chat API error:", parsedError);
    },
  });

  // Auto-expand when there are messages
  useEffect(() => {
    const activeAPI = isVisionAutomateMode ? chatVisionAPI : chatAPI;
    if (activeAPI.messages.length > 0 && viewMode === "compact") {
      setViewMode("expanded");
    }
  }, [
    chatAPI.messages.length,
    chatVisionAPI.messages.length,
    viewMode,
    isVisionAutomateMode,
  ]);

  // Integrate the useChatHistory hook
  const { triggerHistoryWindow } = useChatHistory(chatAPI.setMessages);

  const toggleViewMode = useCallback(() => {
    setViewMode((prev) => (prev === "compact" ? "expanded" : "compact"));
  }, []);

  const toggleVisionAutomateMode = useCallback(() => {
    setIsVisionAutomateMode((prev) => !prev);
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

      // Use the appropriate API based on vision automate mode
      const activeAPI = isVisionAutomateMode ? chatVisionAPI : chatAPI;

      if (!activeAPI.input.trim() && !copiedContent && filesToSend.length === 0)
        return;

      let messageText = activeAPI.input.trim();

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
          activeAPI.append(message);
          clearAttachments();
        } catch (error) {
          console.error("Error processing file attachments:", error);
        }
      };

      if (!isVisionAutomateMode) {
        sendMessageWithAttachments();
      } else {
        window.electronAPI?.toggleWindow("vision");
        activeAPI.append(message);
      }
    },
    [
      chatAPI,
      chatVisionAPI,
      copiedContent,
      attachments,
      clearAttachments,
      fileToAttachment,
      isVisionAutomateMode,
    ],
  );

  const setInput = useCallback(
    (newInput: string) => {
      const activeAPI = isVisionAutomateMode ? chatVisionAPI : chatAPI;
      activeAPI.handleInputChange({
        target: { value: newInput },
      } as React.ChangeEvent<HTMLInputElement>);
    },
    [chatAPI, chatVisionAPI, isVisionAutomateMode],
  );

  const stopGeneration = useCallback(() => {
    const activeAPI = isVisionAutomateMode ? chatVisionAPI : chatAPI;
    if (activeAPI.isLoading) {
      activeAPI.stop();
    }
  }, [chatAPI, chatVisionAPI, isVisionAutomateMode]);

  const editMessage = useCallback(
    (message: Message, newContent: string) => {
      const activeAPI = isVisionAutomateMode ? chatVisionAPI : chatAPI;
      const messageIndex = activeAPI.messages.findIndex(
        (m) => m.id === message.id,
      );
      if (messageIndex === -1) return;

      const updatedMessages = [...activeAPI.messages];
      updatedMessages[messageIndex] = {
        ...updatedMessages[messageIndex],
        content: newContent,
      };

      if (messageIndex < updatedMessages.length - 1) {
        updatedMessages.splice(messageIndex + 1);
      }

      activeAPI.setMessages(updatedMessages);

      setTimeout(() => {
        activeAPI.reload();
      }, 100);
    },
    [chatAPI, chatVisionAPI, isVisionAutomateMode],
  );

  const regenerateMessage = useCallback(() => {
    const activeAPI = isVisionAutomateMode ? chatVisionAPI : chatAPI;
    if (!activeAPI.isLoading) {
      activeAPI.reload();
    }
  }, [chatAPI, chatVisionAPI, isVisionAutomateMode]);

  const resetChat = useCallback(() => {
    chatAPI.setMessages([]);
    chatVisionAPI.setMessages([]);
    setCopiedContent(null);
    clearAttachments();
    // Reset to compact mode when clearing chat
    setViewMode("compact");
  }, [chatAPI, chatVisionAPI, clearAttachments]);

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
    triggerHistoryWindow();
  }, [triggerHistoryWindow]);

  // Use the appropriate API based on vision automate mode for context values
  const activeAPI = isVisionAutomateMode ? chatVisionAPI : chatAPI;

  const contextValue: ChatContextType = {
    messages: activeAPI.messages as UIMessage[],
    input: activeAPI.input,
    isLoading: activeAPI.isLoading,
    error: activeAPI.error,
    copiedContent,
    attachments,
    viewMode,
    setViewMode,
    toggleViewMode,
    isVisionAutomateMode,
    setVisionAutomateMode: setIsVisionAutomateMode,
    toggleVisionAutomateMode,
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
