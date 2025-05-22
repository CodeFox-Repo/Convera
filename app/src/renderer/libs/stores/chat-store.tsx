import { GenericError, parseApiError } from "@/renderer/libs/utils/error-handler";
import { getSettings } from "@/renderer/libs/utils/settings";
import { useChat } from "@ai-sdk/react";
import { Message, UIMessage } from "ai";
import React, { createContext, useCallback, useContext, useState } from "react";

interface ChatContextType {
  messages: UIMessage[];
  input: string;
  isLoading: boolean;
  error: Error | undefined;
  copiedContent: string | null;
  setInput: (input: string) => void;
  sendMessage: () => void;
  stopGeneration: () => void;
  editMessage: (message: Message, newContent: string) => void;
  regenerateMessage: () => void;
  resetChat: () => void;
  setCopiedContent: (content: string | null) => void;
  rejectCopiedContent: () => void;
  
  // Chat-related actions (previously in app-actions)
  resetChatWindow: () => void;
  handleVoiceInput: () => void;
  openSettings: () => void;
  openHistoryWindow: () => void;
  isVoiceInputActive: boolean;
}

const ChatContext = createContext<ChatContextType | null>(null);

export const ChatProvider: React.FC<{children: React.ReactNode}> = ({ children }) => {
  const [copiedContent, setCopiedContent] = useState<string | null>(null);
  const [isVoiceInputActive, setIsVoiceInputActive] = useState(false);
  const settings = getSettings();

  // TODO(Sma1lboy): change api to use the api from the backend
  const chatAPI = useChat({
    api: "http://localhost:38000/api/chat",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.openai.apiKey}`,
    },
    body: {
      config: settings,
      agentId: localStorage.getItem("selectedAgentId") || undefined,
      modelId: localStorage.getItem("selectedModelId") || settings.openai.modelId,
    },
    onError: (error) => {
      const parsedError = parseApiError(error as unknown as GenericError);
      console.error("Chat API error:", parsedError);
    },
  });
  
  const sendMessage = useCallback(() => {
    if (!chatAPI.input.trim() && !copiedContent) return;
    
    let messageText = chatAPI.input.trim();
    
    if (copiedContent) {
      messageText = messageText
        ? `<copied>\n${copiedContent}\n</copied>\n\n${messageText}`
        : `<copied>\n${copiedContent}\n</copied>`;
      
      setCopiedContent(null);
    }
    
    chatAPI.append({
      role: "user",
      content: messageText,
    });
  }, [chatAPI, copiedContent]);
  
  const setInput = useCallback((newInput: string) => {
    chatAPI.handleInputChange({
      target: { value: newInput },
    } as React.ChangeEvent<HTMLInputElement>);
  }, [chatAPI]);
  
  const stopGeneration = useCallback(() => {
    if (chatAPI.isLoading) {
      chatAPI.stop();
    }
  }, [chatAPI]);
  
  const editMessage = useCallback((message: Message, newContent: string) => {
    const messageIndex = chatAPI.messages.findIndex((m) => m.id === message.id);
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
  }, [chatAPI]);
  
  const regenerateMessage = useCallback(() => {
    if (!chatAPI.isLoading) {
      chatAPI.reload();
    }
  }, [chatAPI]);
  
  const resetChat = useCallback(() => {
    chatAPI.setMessages([]);
    setCopiedContent(null);
  }, [chatAPI]);
  
  const rejectCopiedContent = useCallback(() => {
    setCopiedContent(null);
  }, []);
  
  // Chat related actions (previously in app-actions-store)
  
  const resetChatWindow = useCallback(() => {
    // Current implementation reloads the window
    window.location.reload();
  }, []);
  
  // TODO: voice implementation, it might move to another store for voice_store
  const handleVoiceInput = useCallback(() => {
    // Set active state
    setIsVoiceInputActive(true);
    console.log("Voice input activated");
    setTimeout(() => {
      setIsVoiceInputActive(false);
    }, 2000);
  }, []);
  
  const openSettings = useCallback(() => {
    if (window.electronAPI) {
      window.electronAPI.toggleSettingsWindow()
        .catch((error) => {
          console.error("Error opening settings window:", error);
        });
    } else {
      console.error("electronAPI is not available for toggleSettingsWindow!");
    }
  }, []);
  
  const openHistoryWindow = useCallback(() => {
    if (window.electronAPI) {
      window.electronAPI.toggleHistoryWindow()
        .catch((error) => {
          console.error("Error opening history window:", error);
        });
    } else {
      console.error("electronAPI is not available for toggleHistoryWindow!");
    }
  }, []);
  
  const contextValue: ChatContextType = {
    messages: chatAPI.messages as UIMessage[],
    input: chatAPI.input,
    isLoading: chatAPI.isLoading,
    error: chatAPI.error,
    copiedContent,
    setInput,
    sendMessage,
    stopGeneration,
    editMessage,
    regenerateMessage,
    resetChat,
    setCopiedContent,
    rejectCopiedContent,
    resetChatWindow,
    handleVoiceInput,
    openSettings,
    openHistoryWindow,
    isVoiceInputActive
  };
  
  return (
    <ChatContext.Provider value={contextValue}>
      {children}
    </ChatContext.Provider>
  );
};

export const useChatContext = () => {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error("useChatContext must be used within a ChatProvider");
  }
  return context;
};