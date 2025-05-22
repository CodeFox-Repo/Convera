import { GenericError, parseApiError } from "@/renderer/libs/utils/error-handler";
import { getSettings } from "@/renderer/libs/utils/settings";
import { useChat } from "@ai-sdk/react";
import { Attachment, Message, UIMessage } from "ai";
import React, { createContext, useCallback, useContext, useState } from "react";

interface ChatContextType {
  messages: UIMessage[];
  input: string;
  isLoading: boolean;
  error: Error | undefined;
  copiedContent: string | null;
  attachments: File[];
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
interface ChatMessage extends Omit<Message, 'id'> {
  experimental_attachments?: Attachment[];
}

const ChatContext = createContext<ChatContextType | null>(null);

export const ChatProvider: React.FC<{children: React.ReactNode}> = ({ children }) => {
  const [copiedContent, setCopiedContent] = useState<string | null>(null);
  const [isVoiceInputActive, setIsVoiceInputActive] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
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
  
  const addAttachments = useCallback((files: File | File[]) => {
    setAttachments(prev => {
      if (Array.isArray(files)) {
        return [...prev, ...files];
      } else {
        return [...prev, files];
      }
    });
  }, []);
  
  const removeAttachment = useCallback((index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  }, []);
  
  const clearAttachments = useCallback(() => {
    setAttachments([]);
  }, []);
  
  // Helper to convert a File to an Attachment
  const fileToAttachment = useCallback((file: File): Attachment => {
    return {
      url: URL.createObjectURL(file),
      name: file.name,
      contentType: file.type,
    };
  }, []);
  
  const sendMessage = useCallback((extraFiles?: File[]) => {
    const filesToSend = [...attachments];
    
    if (extraFiles && extraFiles.length > 0) {
      filesToSend.push(...extraFiles);
    }
    
    if (!chatAPI.input.trim() && !copiedContent && filesToSend.length === 0) return;
    
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
    
    // Only add attachments if there are files to send
    if (filesToSend.length > 0) {
      const fileAttachments = filesToSend.map(fileToAttachment);
      message.experimental_attachments = fileAttachments;
    }
    
    chatAPI.append(message);
    
    // Clear the attachments after sending
    clearAttachments();
  }, [chatAPI, copiedContent, attachments, clearAttachments, fileToAttachment]);
  
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
    clearAttachments();
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
    setIsVoiceInputActive(prev => !prev);
  }, []);
  
  const openSettings = useCallback(() => {
      window.electronAPI.toggleSettingsWindow()
        .catch((error) => {
          console.error("Error opening settings window:", error);
        });
  }, []);
  
  const openHistoryWindow = useCallback(() => {
    window.electronAPI.toggleHistoryWindow()
  }, []);
  
  const contextValue: ChatContextType = {
    messages: chatAPI.messages as UIMessage[],
    input: chatAPI.input,
    isLoading: chatAPI.isLoading,
    error: chatAPI.error,
    copiedContent,
    attachments,
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