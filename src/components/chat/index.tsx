import React, { useState, useRef, useEffect, useCallback } from "react";
import type { Message, UIMessage } from "ai";
import { X, Plus } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import ChatInput, { ChatInputRef } from "./ChatInput";
import ChatContent from "./ChatContent";
import { useChat } from "@ai-sdk/react";
import { getSettings } from "@/utils/settings";
import CopiedContentCard from "./CopiedContentCard";
import { WINDOW_SIZE_PRESETS } from "@/helpers/windows/window-size";
import { ChatData } from "@/server/service/chat";

/**
 * Agent interface definition
 */
interface Agent {
  id: string;
  name: string;
  description: string;
  category: string;
  iconUrl?: string;
}

/**
 * Props for CompactChatView component
 */
interface CompactChatViewProps {
  input: string;
  setInput: (value: string) => void;
  isLoading: boolean;
  onAddAttachment: () => void;
  onToggleTranslation: () => void;
  onReset: () => void;
  onVoiceInput: () => void;
  onSendMessage: () => void;
  onStopGeneration?: () => void;
  chatInputRef: React.RefObject<ChatInputRef | null>;
  selectedAgent?: Agent | null;
  onAgentSelect?: (agent: Agent | null) => void;
  selectedModelId: string;
  onModelSelect: (modelId: string) => void;
  onLoadChatHistory?: (chat: ChatData) => void;
  copiedContent: string | null;
  onRejectCopiedContent: () => void;
  onOpenSettings: () => void;
}

/**
 * Compact view with just the input component
 */
const CompactChatView: React.FC<CompactChatViewProps> = ({
  input,
  setInput,
  isLoading,
  onAddAttachment,
  onToggleTranslation,
  onReset,
  onVoiceInput,
  onSendMessage,
  onStopGeneration,
  chatInputRef,
  selectedAgent,
  onAgentSelect,
  selectedModelId,
  onModelSelect,
  onLoadChatHistory,
  onOpenSettings,
  copiedContent,
  onRejectCopiedContent,
}) => {
  return (
    <div className="h-full flex flex-col p-1">
      {/* Show copied content card above the input */}
      {copiedContent && (
        <div className="mb-2 w-full overflow-y-auto p-1">
          <CopiedContentCard
            content={copiedContent}
            onReject={onRejectCopiedContent}
          />
        </div>
      )}
      <div className="flex-1 min-h-[100px]">
        <ChatInput
          ref={chatInputRef}
          isLoading={isLoading}
          input={input}
          setInput={setInput}
          hasMessages={false}
          onAddAttachment={onAddAttachment}
          onToggleTranslation={onToggleTranslation}
          onReset={onReset}
          onVoiceInput={onVoiceInput}
          onSendMessage={onSendMessage}
          onStopGeneration={onStopGeneration}
          selectedAgent={selectedAgent}
          onAgentSelect={onAgentSelect}
          selectedModelId={selectedModelId}
          onModelSelect={onModelSelect}
        onLoadChatHistory={onLoadChatHistory}
        onOpenSettings={onOpenSettings}
        />
      </div>
    </div>
  );
};

/**
 * Props for ExpandedChatView component
 */
interface ExpandedChatViewProps {
  messages: UIMessage[];
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  input: string;
  setInput: (value: string) => void;
  isLoading: boolean;
  onAddAttachment: () => void;
  onToggleTranslation: () => void;
  onReset: () => void;
  onVoiceInput: () => void;
  onSendMessage: () => void;
  onStopGeneration?: () => void;
  onEditMessage: (message: Message, newContent: string) => void;
  onRegenerateMessage: () => void;
  chatInputRef: React.RefObject<ChatInputRef | null>;
  showControls: boolean;
  onExit: () => void;
  onNewHistory: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  selectedAgent: Agent | null;
  onAgentSelect: (agent: Agent | null) => void;
  agentChanged?: boolean;
  onRegenerateWithNewAgent?: () => void;
  onIgnoreAgentChange?: () => void;
  selectedModelId: string;
  onModelSelect: (modelId: string) => void;
  onLoadChatHistory?: (chat: ChatData) => void;
  onOpenSettings: () => void;
  copiedContent: string | null;
  onRejectCopiedContent: () => void;
}

/**
 * Expanded view with content and input components
 */
const ExpandedChatView: React.FC<ExpandedChatViewProps> = ({
  messages,
  messagesEndRef,
  input,
  setInput,
  isLoading,
  onAddAttachment,
  onToggleTranslation,
  onReset,
  onVoiceInput,
  onSendMessage,
  onStopGeneration,
  onEditMessage,
  onRegenerateMessage,
  chatInputRef,
  showControls,
  onExit,
  onNewHistory,
  onMouseEnter,
  onMouseLeave,
  selectedAgent,
  onAgentSelect,
  agentChanged,
  onRegenerateWithNewAgent,
  onIgnoreAgentChange,
  selectedModelId,
  onModelSelect,
  onLoadChatHistory,
  onOpenSettings,
  copiedContent,
  onRejectCopiedContent,
}) => {
  const buttonVariants = {
    hidden: { opacity: 0, y: -10 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.2 } },
    hover: {
      scale: 1.1,
      backgroundColor: "hsl(var(--secondary) / 0.7)",
      transition: { duration: 0.15 },
    },
    tap: { scale: 0.95 },
  };

  return (
    <div
      className="no-drag-region bg flex h-full w-full flex-col"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="drag-region pointer-events-auto relative z-[100] h-12 w-full">
        <AnimatePresence>
          {showControls && (
            <motion.div
              className="no-drag-region absolute inset-x-0 top-5 flex justify-between px-4"
              initial="hidden"
              animate="visible"
              exit="hidden"
              variants={{ hidden: { opacity: 0 }, visible: { opacity: 1 } }}
              transition={{ duration: 0.2 }}
            >
              <motion.button
                onClick={onExit}
                className="bg-background/50 pointer-events-auto rounded-md p-1"
                aria-label="Exit"
                variants={buttonVariants}
                initial="visible"
                whileHover="hover"
                whileTap="tap"
              >
                <X size={22} />
              </motion.button>
              <motion.button
                onClick={onNewHistory}
                className="bg-background/50 pointer-events-auto rounded-md p-1"
                aria-label="New chat"
                variants={buttonVariants}
                initial="visible"
                whileHover="hover"
                whileTap="tap"
              >
                <Plus size={22} />
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {/* Main content */}
      <div className="drag-region flex flex-1 flex-col overflow-y-auto">
        {/* Messages area with flex-grow */}
        <div className="drag-region min-h-0 flex-1 overflow-y-auto p-4">
          <ChatContent
            messages={messages as UIMessage[]}
            messagesEndRef={messagesEndRef}
            isLoading={isLoading}
            onEditMessage={onEditMessage}
            onRegenerateMessage={onRegenerateMessage}
            agentChanged={agentChanged}
            onRegenerateWithNewAgent={onRegenerateWithNewAgent}
            onIgnoreAgentChange={onIgnoreAgentChange}
          />
        </div>
        <div className="drag-region flex flex-col p-1">
          {/* Show copied content card above the input */}
          {copiedContent && (
            <div className="mb-2 w-full p-1">
              <CopiedContentCard
                content={copiedContent}
                onReject={onRejectCopiedContent}
              />
            </div>
          )}
          <div className="flex-1">
            <ChatInput
              ref={chatInputRef}
              isLoading={isLoading}
              input={input}
              setInput={setInput}
              hasMessages={true}
              onAddAttachment={onAddAttachment}
              onToggleTranslation={onToggleTranslation}
              onReset={onReset}
              onVoiceInput={onVoiceInput}
              onSendMessage={onSendMessage}
              onStopGeneration={onStopGeneration}
              selectedAgent={selectedAgent}
              onAgentSelect={onAgentSelect}
              selectedModelId={selectedModelId}
              onModelSelect={onModelSelect}
            onOpenSettings={onOpenSettings}
              placeholder="Message to FoxyChat..."
            onLoadChatHistory={onLoadChatHistory}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * Chat interface component with integrated message management
 */
export default function Chat() {
  // Get settings to use stored OpenAI configuration
  const settings = getSettings();

  // Add state for copied content preview
  const [copiedContent, setCopiedContent] = useState<string | null>(null);

  // Add state for selected agent
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [selectedModelId, setSelectedModelId] = useState<string>(
    settings.openai.modelId,
  );
  // Add ref to store previous agent ID for comparison
  const prevAgentIdRef = useRef<string | null>(null);
  // Add flag to track initial mount
  const isInitialMount = useRef(true);
  // Add state to track if agent has changed and might need regeneration
  const [agentChanged, setAgentChanged] = useState(false);

  // Keep state for UI management
  const [mounted, setMounted] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<ChatInputRef>(null);
  const controlsTimerRef = useRef<number | null>(null);
  const [initializing, setInitializing] = useState(true);

  // Add state to track if we've already expanded the window
  const [hasExpandedOnce, setHasExpandedOnce] = useState(false);
  
  // View mode state
  const [viewMode, setViewMode] = useState<"compact" | "expanded">("compact");
  
  // Add protection against unwanted mode changes during resize
  const isResizingRef = useRef<boolean>(false);
  const lastModeChangeTimeRef = useRef<number>(0);

  // Add state to explicitly track if clipboard height should be added
  const [shouldAddClipboardHeight, setShouldAddClipboardHeight] = useState(false);

  // Use Vercel AI SDK's useChat hook instead of managing state manually
  const {
    messages,
    input,
    handleInputChange,
    isLoading,
    setMessages,
    reload,
    stop,
    append,
  } = useChat({
    api: "http://localhost:38000/api/chat",
    headers: {
      "Content-Type": "application/json",
    },
    body: {
      config: settings,
      agentId: selectedAgent?.id,
      modelId: selectedModelId,
    },
  });

  // Add effect to determine when clipboard height should be added
  useEffect(() => {
    const hasClipboardContent = Boolean(copiedContent && copiedContent.trim().length > 0);
    const hasNoMessages = messages.length === 0;
    const isCompactMode = viewMode === "compact";
    
    const shouldAdd = hasClipboardContent && hasNoMessages && isCompactMode;
    setShouldAddClipboardHeight(shouldAdd);
  }, [copiedContent, messages.length, viewMode]);

  // Set mounted state when component mounts
  useEffect(() => {
    const mountTimer = setTimeout(() => {
      setMounted(true);

      if (window.electronAPI && messages.length === 0) {
        try {
          window.electronAPI
            .getCurrentWindowSize(WINDOW_SIZE_PRESETS.MAIN)
            .then((res) => {
              requestAnimationFrame(() => {
                const finalHeight = shouldAddClipboardHeight ? res.height + 140 : res.height;
                window.electronAPI.resizeMessageContent(res.width, finalHeight);
              });
            });
        } catch (error) {
          console.error("Chat: Error setting initial window size:", error);
        }
      }

      const initTimer = setTimeout(() => {
        setInitializing(false);
      }, 150);

      return () => clearTimeout(initTimer);
    }, 50);

    return () => {
      clearTimeout(mountTimer);
      setMounted(false);
    };
  }, [shouldAddClipboardHeight, messages.length]);

  // Modify toggleViewMode to track expansion state with protection against frequent changes
  const toggleViewMode = useCallback(
    (mode: "compact" | "expanded") => {
      // Prevent toggling view mode if we're currently resizing or toggled recently
      if (isResizingRef.current || Date.now() - lastModeChangeTimeRef.current < 1000) {
        console.log("Ignoring view mode change request during resize operation");
        return;
      }
      
      // Don't toggle if already in the requested mode
      if (mode === viewMode) {
        return;
      }
      
      console.log(`Toggling view mode: ${viewMode} -> ${mode}`);
      setViewMode(mode);
      lastModeChangeTimeRef.current = Date.now();
      isResizingRef.current = true;

      requestAnimationFrame(() => {
        if (typeof window !== "undefined" && window.electronAPI) {
          if (mode === "expanded" && !hasExpandedOnce) {
            window.electronAPI.toggleViewMode(true);
            setHasExpandedOnce(true);
            
            window.electronAPI
              .getCurrentWindowSize(WINDOW_SIZE_PRESETS.EXPANDED_CHAT)
              .then((res) => {
                window.electronAPI.resizeMessageContent(res.width, res.height)
                  .then(() => {
                    // Reset resize flag after a short delay
                    setTimeout(() => {
                      isResizingRef.current = false;
                    }, 500);
                  });
              })
              .catch(() => {
                isResizingRef.current = false;
              });
          } else if (mode === "compact") {
            window.electronAPI.toggleViewMode(false)
              .then(() => {
                setTimeout(() => {
                  isResizingRef.current = false;
                }, 500);
              })
              .catch(() => {
                isResizingRef.current = false;
              });
          } else {
            isResizingRef.current = false;
          }
        }
      });
    },
    [hasExpandedOnce, viewMode],
  );

  // Listen for clipboard changes
  useEffect(() => {
    if (window.electronAPI?.onSetInputText) {
      const unsubscribe = window.electronAPI.onSetInputText((text: string) => {
        if (!text || !text.trim()) {
          setCopiedContent(null);
        } else {
          setCopiedContent(text);
        }
        
        setTimeout(() => {
          if (window.electronAPI && !hasExpandedOnce && messages.length === 0) {
            window.electronAPI
              .getCurrentWindowSize(WINDOW_SIZE_PRESETS.MAIN)
              .then((res) => {
                const finalHeight = shouldAddClipboardHeight ? res.height + 140 : res.height;
                window.electronAPI.resizeMessageContent(res.width, finalHeight);
              });
          }
        }, 50);
      });
      
      return unsubscribe;
    }
  }, [shouldAddClipboardHeight, hasExpandedOnce, messages.length]);

  const handleRegenerateWithNewAgent = () => {
    setAgentChanged(false);
    reload();
  };

  const handleIgnoreAgentChange = () => {
    setAgentChanged(false);
  };

  const handleInputChangeAdapter = (value: string) => {
    handleInputChange({
      target: { value: value  },
    } as React.ChangeEvent<HTMLInputElement>);

    if (!value && chatInputRef.current?.editor) {
      chatInputRef.current.editor.clearContent();
    }
  };

  useEffect(() => {
    if (messages.length === 1 && !hasExpandedOnce && mounted && !initializing) {
      toggleViewMode("expanded");
    }
  }, [messages.length, hasExpandedOnce, mounted, initializing, toggleViewMode]);

  useEffect(() => {
    if (messages.length > 0 && viewMode === "compact") {
      toggleViewMode("expanded");
    }
  }, [messages.length, viewMode, toggleViewMode]);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      prevAgentIdRef.current = selectedAgent?.id || null;
      return;
    }

    const currentAgentId = selectedAgent?.id || null;
    const hasAgentChanged = prevAgentIdRef.current !== currentAgentId;

    if (hasAgentChanged && messages.length > 0) {
      setAgentChanged(true);
    }

    prevAgentIdRef.current = currentAgentId;
  }, [selectedAgent, messages.length]);

  useEffect(() => {
    try {
      if (selectedModelId !== settings.openai.modelId) {
        localStorage.setItem("selectedModelId", selectedModelId);
      }
    } catch (error) {
      console.error("Error saving model to localStorage:", error);
    }
  }, [selectedModelId, settings.openai.modelId]);

  useEffect(() => {
    try {
      const savedModel = localStorage.getItem("selectedModelId");
      if (savedModel) {
        setSelectedModelId(savedModel);
      }
    } catch (error) {
      console.error("Error loading model from localStorage:", error);
    }

    const handleModelSelected = (event: Event) => {
      const customEvent = event as CustomEvent;
      if (customEvent.detail && customEvent.detail.modelId) {
        const newModelId = customEvent.detail.modelId;
        setSelectedModelId(newModelId);
        localStorage.setItem("selectedModelId", newModelId);
      }
    };

    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === "selectedModelId" && event.newValue) {
        setSelectedModelId(event.newValue);
      }
    };

    window.addEventListener("model-selected", handleModelSelected);
    window.addEventListener("storage", handleStorageChange);

    const intervalId = setInterval(() => {
      const storedModel = localStorage.getItem("selectedModelId");
      if (storedModel && storedModel !== selectedModelId) {
        setSelectedModelId(storedModel);
      }
    }, 1000);

    return () => {
      window.removeEventListener("model-selected", handleModelSelected);
      window.removeEventListener("storage", handleStorageChange);
      clearInterval(intervalId);
    };
  }, [selectedModelId]);

  // Setup IPC listener for window focus event
  useEffect(() => {
    if (typeof window !== "undefined" && window.electronAPI) {
      const removeListener = window.electronAPI.onFocusChatInput(() => {
        chatInputRef.current?.focus();
      });

      return () => {
        removeListener?.();
      };
    }
  }, []);

  // Focus the input field when component mounts
  useEffect(() => {
    const timer = setTimeout(() => {
      chatInputRef.current?.focus();
    }, 100);

    return () => clearTimeout(timer);
  }, []);

  // Mouse enter handler with debounce
  const handleMouseEnter = () => {
    if (controlsTimerRef.current) {
      window.clearTimeout(controlsTimerRef.current);
    }
    setShowControls(true);
  };

  // Mouse leave handler with debounce
  const handleMouseLeave = () => {
    if (controlsTimerRef.current) {
      window.clearTimeout(controlsTimerRef.current);
    }

    controlsTimerRef.current = window.setTimeout(() => {
      setShowControls(false);
    }, 500);
  };

  // Clean up timer on component unmount
  useEffect(() => {
    return () => {
      if (controlsTimerRef.current) {
        window.clearTimeout(controlsTimerRef.current);
      }
    };
  }, []);

  // Scroll to bottom of messages when new messages are added
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Handle attachments
  const handleAddAttachment = () => {
    // Implement attachment functionality
  };

  // Handle translation
  const handleToggleTranslation = () => {
    // Implement translation functionality
  };

  // Reset the chat conversation
  const handleReset = () => {
    window.location.reload();
  };

  // Handle voice input
  const handleVoiceInput = () => {
    // Implement voice input functionality
  };

  // Handle opening settings
  const handleOpenSettings = () => {
    console.log("Opening settings window");
    if (window.electronAPI) {
      window.electronAPI.toggleSettingsWindow()
        .catch(error => {
          console.error("Error opening settings window:", error);
        });
    } else {
      console.error("electronAPI is not available for toggleSettingsWindow!");
    }
  };

  // Handle exit button click
  const handleExit = () => {
    if (window.electronAPI) {
      window.electronAPI.closeWindow();
    }
  };

  // Add effect to listen for chat history events directly
  useEffect(() => {
    // Function to handle chat history selection
    const handleChatHistorySelected = (event: Event) => {
      const customEvent = event as CustomEvent;
      if (customEvent.detail && customEvent.detail.chat) {
        console.log("Chat component received chat-history-selected event:", customEvent.detail.chat);
        handleLoadChatHistory(customEvent.detail.chat);
      }
    };

    // Do NOT automatically check localStorage on component mount
    // Only listen for explicit user selections
    
    // Listen for storage events to catch changes from other windows
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === "selectedChatHistory" && event.newValue) {
        console.log("Detected chat history change in localStorage");
        try {
          const chatData = JSON.parse(event.newValue);
          if (chatData && chatData.chat) {
            console.log("Loading new chat history from storage event:", chatData.chat.id);
            handleLoadChatHistory(chatData.chat);
          }
        } catch (error) {
          console.error("Error parsing chat history from storage event:", error);
        }
      }
    };
    
    // Add event listeners
    window.addEventListener("chat-history-selected", handleChatHistorySelected);
    window.addEventListener("storage", handleStorageChange);
    
    // Cleanup
    return () => {
      window.removeEventListener("chat-history-selected", handleChatHistorySelected);
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);
  
  // Handle loading a chat history
  const handleLoadChatHistory = (chatHistory: ChatData) => {
    console.log("Loading chat history in Chat component:", chatHistory);
    
    if (chatHistory && chatHistory.messages && chatHistory.messages.length > 0) {
      // Reset state first to ensure clean loading
      setMessages([]);
      
      // Add a small delay before setting new messages
      setTimeout(() => {
        // Simple direct update approach with fallback IDs
        const formattedMessages = chatHistory.messages.map((msg) => ({
          id: msg.id || `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          content: msg.content,
          role: msg.role,
        }));
        
        console.log("Setting messages to:", formattedMessages);
        
        // Set messages directly
        setMessages(formattedMessages);
        
        // Force a resize after a short delay
        setTimeout(() => {
          if (window.electronAPI) {
            console.log("Forcing window resize for chat history");
            window.electronAPI
              .getCurrentWindowSize(WINDOW_SIZE_PRESETS.EXPANDED_CHAT)
              .then((res) => {
                window.electronAPI.resizeMessageContent(res.width, res.height);
              })
              .catch(error => {
                console.error("Error resizing window:", error);
              });
          }
        }, 500);
      }, 50);
    }
  };

  // Handle new history creation
  const handleNewHistory = () => {
    console.log("Create new history clicked");
    // Reset conversation by refreshing the page - simplest way to clear useChat state
    window.location.reload();
  };

  const handleStopGeneration = () => {
    if (isLoading) {
      stop();
    }
  };

  // Handle sending a message to the AI using Vercel AI SDK
  const handleSendMessage = () => {
    const editor = chatInputRef.current?.editor;
    if (!editor || isLoading) return;

    const editorText = editor.getText().trim();
    if (!editorText && !copiedContent) return;

    let messageText = editorText;
    
    if (copiedContent) {
      messageText = messageText
        ? `<copied>\n${copiedContent}\n</copied>\n\n${messageText}`
        : `<copied>\n${copiedContent}\n</copied>`;
    }

    append({
      role: "user",
      content: messageText,
    });

    if (copiedContent) {
      setCopiedContent(null);
    }
      
    if (chatInputRef.current?.editor) {
      chatInputRef.current.editor.clearContent();
    }
  };

  // Handle editing a message and regenerating the response
  const handleEditMessage = async (message: Message, newContent: string) => {
    if (isLoading) return;

    const messageIndex = messages.findIndex((m) => m.id === message.id);
    if (messageIndex === -1) return;

    const updatedMessages = [...messages];
    updatedMessages[messageIndex] = {
      ...updatedMessages[messageIndex],
      content: newContent,
    };

    if (messageIndex < updatedMessages.length - 1) {
      updatedMessages.splice(messageIndex + 1);
    }

    setMessages(updatedMessages);

    if (chatInputRef.current?.editor) {
      chatInputRef.current.editor.clearContent();
    }

    setTimeout(() => {
      reload();
    }, 100);
  };

  // Handle regenerating the last AI response
  const handleRegenerateResponse = async () => {
    if (isLoading) return;
    reload();
  };

  // Functions to handle copied content actions - only keep the reject function
  const handleRejectCopiedContent = () => {
    setCopiedContent(null);
    
    if (window.electronAPI) {
      setTimeout(() => {
        window.electronAPI
          .getCurrentWindowSize(
            messages.length > 0
              ? WINDOW_SIZE_PRESETS.EXPANDED_CHAT
              : WINDOW_SIZE_PRESETS.MAIN,
          )
          .then((res) => {
            window.electronAPI.resizeMessageContent(res.width, res.height);
          });
      }, 50);
    }
  };

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.classList.add("preload");

      const styleTimer = setTimeout(() => {
        document.documentElement.classList.remove("preload");
      }, 300);

      return () => clearTimeout(styleTimer);
    }
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined" && window.electronAPI) {
      window.electronAPI
        .getCurrentTheme()
        .then((res) => {
          const theme = res;
          document.documentElement.dataset.theme = theme;
        })
        .catch((err) => {
          console.error("Failed to get theme:", err);
        });
    }
  }, []);

  // Render the appropriate view based on the current view mode
  return (
    <div className="chat-window h-screen w-full overflow-hidden rounded-xl">
      {initializing ? (
        <div className="flex h-full w-full items-center justify-center">
          <div className="animate-fade-in opacity-0 delay-100">
            <div className="bg-primary/20 h-10 w-10 animate-pulse rounded-full" />
          </div>
        </div>
      ) : messages.length > 0 ? (
        <ExpandedChatView
          messages={messages as UIMessage[]}
          messagesEndRef={messagesEndRef}
          input={input}
          setInput={handleInputChangeAdapter}
          isLoading={isLoading}
          onAddAttachment={handleAddAttachment}
          onToggleTranslation={handleToggleTranslation}
          onReset={handleReset}
          onVoiceInput={handleVoiceInput}
          onSendMessage={handleSendMessage}
          onStopGeneration={handleStopGeneration}
          onEditMessage={handleEditMessage}
          onRegenerateMessage={handleRegenerateResponse}
          chatInputRef={chatInputRef}
          showControls={showControls}
          onExit={handleExit}
          onNewHistory={handleNewHistory}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          selectedAgent={selectedAgent}
          onAgentSelect={setSelectedAgent}
          agentChanged={agentChanged}
          onRegenerateWithNewAgent={handleRegenerateWithNewAgent}
          onIgnoreAgentChange={handleIgnoreAgentChange}
          selectedModelId={selectedModelId}
          onModelSelect={setSelectedModelId}
          onLoadChatHistory={handleLoadChatHistory}
          onOpenSettings={handleOpenSettings}
          copiedContent={copiedContent}
          onRejectCopiedContent={handleRejectCopiedContent}
        />
      ) : (
        <CompactChatView
          input={input}
          setInput={handleInputChangeAdapter}
          isLoading={isLoading}
          onAddAttachment={handleAddAttachment}
          onToggleTranslation={handleToggleTranslation}
          onReset={handleReset}
          onVoiceInput={handleVoiceInput}
          onSendMessage={handleSendMessage}
          onStopGeneration={handleStopGeneration}
          chatInputRef={chatInputRef}
          selectedAgent={selectedAgent}
          onAgentSelect={setSelectedAgent}
          selectedModelId={selectedModelId}
          onModelSelect={setSelectedModelId}
          onLoadChatHistory={handleLoadChatHistory}
          onOpenSettings={handleOpenSettings}
          copiedContent={copiedContent}
          onRejectCopiedContent={handleRejectCopiedContent}
        />
      )}
    </div>
  );
}

export {};
