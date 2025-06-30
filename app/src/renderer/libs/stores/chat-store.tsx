/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  GenericError,
  parseApiError,
} from "@/renderer/libs/utils/error-handler";
import { getSettings } from "@/renderer/libs/utils/settings";
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
import { useChatHistory } from "../hooks/use-chat-history";
import { SpeechConfig, useSpeechToText } from "../hooks/use-speech-to-text";
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

  // Speech-to-text state
  speechState: {
    isRecording: boolean;
    error: string | null;
  };
}

interface ChatMessage extends Omit<Message, "id"> {
  experimental_attachments?: Attachment[];
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export const ChatProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [settings, setSettings] = useState<any>(null);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [copiedContent, setCopiedContent] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [viewMode, setViewMode] = useState<ChatViewMode>("compact");
  const [isVoiceInputActive, setIsVoiceInputActive] = useState(false);

  const { selectedAgent } = useAgentStore();
  const { selectedModelId } = useModelStore();
  const currentAgentIdRef = useRef<string | undefined>(selectedAgent?.id);
  const currentModelIdRef = useRef<string>(selectedModelId);

  // Initialize speech-to-text hook
  const speechToText = useSpeechToText();

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
    onError: (error: unknown) => {
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
  const { triggerHistoryWindow } = useChatHistory(chatAPI.setMessages);

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
    [chatAPI, copiedContent, attachments, clearAttachments, fileToAttachment],
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
        // Stop recording and get transcript
        const transcript = await speechToText.stopRecording();

        if (transcript.trim()) {
          // Add transcript to current input (append or replace based on preference)
          const currentInput = chatAPI.input.trim();
          const newInput = currentInput
            ? `${currentInput} ${transcript}`
            : transcript;

          setInput(newInput);
        }
      } else {
        // Start recording with default configuration
        const config: SpeechConfig = {
          languageCode: "en-US",
          alternativeLanguageCodes: ["cmn-Hans-CN", "es-ES"],
          enableSpeakerDiarization: false,
          model: "latest_long",
          silenceTimeoutMs: 8000, // Auto-stop after 8 seconds of silence in chat
        };

        // Create interim result callback to update input in real-time
        const onInterimResult = (interimText: string) => {
          console.log("🎤 Interim result:", interimText);
          // Update input with interim text (replace current content)
          setInput(interimText);
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
    triggerHistoryWindow();
  }, [triggerHistoryWindow]);

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
