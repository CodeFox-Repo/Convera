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

  // Add state to explicitly track if clipboard height should be added
  const [shouldAddClipboardHeight, setShouldAddClipboardHeight] = useState(false);

  // Use Vercel AI SDK's useChat hook instead of managing state manually
  const {
    messages,
    input,
    handleInputChange,
    handleSubmit: aiHandleSubmit,
    isLoading,
    setMessages,
    reload,
    stop,
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
    // Only add clipboard height if:
    // 1. We have clipboard content
    // 2. We have NO messages
    // 3. We're in compact mode
    const hasClipboardContent = Boolean(copiedContent && copiedContent.trim().length > 0);
    const hasNoMessages = messages.length === 0;
    const isCompactMode = viewMode === "compact";
    
    const shouldAdd = hasClipboardContent && hasNoMessages && isCompactMode;
    
    console.log(`Clipboard height calculation: content=${hasClipboardContent}, noMessages=${hasNoMessages}, compact=${isCompactMode} => shouldAdd=${shouldAdd}`);
    
    setShouldAddClipboardHeight(shouldAdd);
  }, [copiedContent, messages.length, viewMode]);

  // Set mounted state when component mounts
  useEffect(() => {
    console.log("Chat component mounting");
    const mountTimer = setTimeout(() => {
      setMounted(true);
      console.log("Chat component mounted");

      if (window.electronAPI && messages.length === 0) {
        try {
          window.electronAPI
            .getCurrentWindowSize(WINDOW_SIZE_PRESETS.MAIN)
            .then((res) => {
              console.log(`Chat: Current window size: ${res.width}x${res.height}`);
              requestAnimationFrame(() => {
                // Only add height if explicitly flagged
                const finalHeight = shouldAddClipboardHeight ? res.height + 140 : res.height;
                console.log(`Chat: Initial size ${res.width}x${finalHeight} (clipboard=${shouldAddClipboardHeight})`);
                
                window.electronAPI.resizeMessageContent(res.width, finalHeight);
              });
            });
        } catch (error) {
          console.error("Chat: Error setting initial window size:", error);
        }
      }

      const initTimer = setTimeout(() => {
        setInitializing(false);
        console.log("Chat component initialization complete");
      }, 150);

      return () => clearTimeout(initTimer);
    }, 50);

    return () => {
      clearTimeout(mountTimer);
      setMounted(false);
      console.log("Chat component unmounting");
    };
  }, [shouldAddClipboardHeight, messages.length]);

  // Modify toggleViewMode to track expansion state
  const toggleViewMode = useCallback(
    (mode: "compact" | "expanded") => {
      // First update the local state
      setViewMode(mode);

      requestAnimationFrame(() => {
        if (typeof window !== "undefined" && window.electronAPI) {
          if (mode === "expanded" && !hasExpandedOnce) {
            window.electronAPI.toggleViewMode(true);
            setHasExpandedOnce(true);
            console.log("Chat: First expansion - resizing window");
            
            // Do the resize on first expansion - NEVER add clipboard height in expanded mode
            window.electronAPI
              .getCurrentWindowSize(WINDOW_SIZE_PRESETS.EXPANDED_CHAT)
              .then((res) => {
                console.log(`Chat: First expansion resize to ${res.width}x${res.height} (no clipboard height)`);
                window.electronAPI.resizeMessageContent(res.width, res.height);
              });
          } else if (mode === "compact") {
            window.electronAPI.toggleViewMode(false);
            console.log("Chat: Switching to compact mode");
          }
        }
      });
    },
    [hasExpandedOnce],
  );

  // Listen for clipboard changes
  useEffect(() => {
    // Setup listener for setting input text from clipboard
    if (window.electronAPI?.onSetInputText) {
      console.log('Setting up input text listener');
      const unsubscribe = window.electronAPI.onSetInputText((text: string) => {
        // Log received text (truncated for large content)
        console.log('Received text from clipboard:', text?.substring(0, 20) + (text?.length > 20 ? '...' : '') || 'empty');
        
        if (!text || !text.trim()) {
          console.log('Clearing clipboard content');
          setCopiedContent(null);
        } else {
          console.log('Setting clipboard content');
          setCopiedContent(text);
        }
        
        // Force update window size based on current state - use a small delay to ensure state is updated
        setTimeout(() => {
          if (window.electronAPI && !hasExpandedOnce && messages.length === 0) {
            console.log('Updating window size after clipboard change');
            window.electronAPI
              .getCurrentWindowSize(WINDOW_SIZE_PRESETS.MAIN)
              .then((res) => {
                // Use the shouldAddClipboardHeight state (will be updated by useEffect)
                const finalHeight = shouldAddClipboardHeight ? res.height + 140 : res.height;
                console.log(`New window size: ${res.width}x${finalHeight} (clipboard=${shouldAddClipboardHeight})`);
                window.electronAPI.resizeMessageContent(res.width, finalHeight);
              });
          } else {
            console.log('Not updating window size after clipboard change - expanded or has messages');
          }
        }, 50);
      });
      
      return unsubscribe;
    }
  }, [shouldAddClipboardHeight, hasExpandedOnce, messages.length]);

  const handleRegenerateWithNewAgent = () => {
    console.log(
      `Regenerating conversation with new Agent(${selectedAgent?.name || "Default"})`,
    );
    setAgentChanged(false);
    reload();
  };

  const handleIgnoreAgentChange = () => {
    console.log("Ignoring Agent change, not regenerating conversation");
    setAgentChanged(false);
  };

  const handleInputChangeAdapter = (value: string) => {
    handleInputChange({
      target: { value },
    } as React.ChangeEvent<HTMLInputElement>);

    if (!value && chatInputRef.current?.editor) {
      chatInputRef.current.editor.clearContent();
    }
  };

  // Add effect to handle first message (if not already expanded)
  useEffect(() => {
    if (messages.length === 1 && !hasExpandedOnce && mounted && !initializing) {
      console.log("Chat: First message - expanding window");
      toggleViewMode("expanded");
    }
  }, [messages.length, hasExpandedOnce, mounted, initializing, toggleViewMode]);

  useEffect(() => {
    if (messages.length > 0 && viewMode === "compact") {
      toggleViewMode("expanded");
    }
  }, [messages.length, viewMode, toggleViewMode]);

  // Add effect to initialize agent from localStorage and handle agent selection events
  useEffect(() => {
    // Initialize agent from localStorage
    try {
      const savedAgent = localStorage.getItem("selectedAgent");
      if (savedAgent) {
        const parsedAgent = JSON.parse(savedAgent);
        console.log(`Loading agent from localStorage: ${parsedAgent.name}`);
        setSelectedAgent(parsedAgent);
        prevAgentIdRef.current = parsedAgent.id;
      } else {
        console.log("No saved agent found in localStorage");
        prevAgentIdRef.current = null;
      }
    } catch (error) {
      console.error("Error loading agent from localStorage:", error);
    }

    // Register event listeners - for agent selection events
    const handleAgentSelected = (event: Event) => {
      const customEvent = event as CustomEvent;
      if (customEvent.detail) {
        const newAgent = customEvent.detail.agent;
        console.log(
          `Received agent-selected event: ${newAgent?.name || "Default"}`,
        );
        setSelectedAgent(newAgent);
      }
    };

    // Listen for storage events - handle cross-window sync
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === "selectedAgent") {
        console.log(`Received storage change event, key=${event.key}`);
        if (event.newValue) {
          try {
            const newAgent = JSON.parse(event.newValue);
            console.log(`Loading agent from other window: ${newAgent.name}`);
            setSelectedAgent(newAgent);
          } catch (error) {
            console.error("Error parsing agent from storage event:", error);
          }
        } else {
          console.log("Agent selection cleared from other window");
          setSelectedAgent(null);
        }
      }
    };

    // Add event listeners
    window.addEventListener("agent-selected", handleAgentSelected);
    window.addEventListener("storage", handleStorageChange);

    // Cleanup function
    return () => {
      window.removeEventListener("agent-selected", handleAgentSelected);
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

  // Monitor selectedAgent changes, but don't auto-regenerate chat
  useEffect(() => {
    // Skip on initial mount
    if (isInitialMount.current) {
      console.log("Initial mount, just recording current agent");
      isInitialMount.current = false;
      // Update previous agent ID
      prevAgentIdRef.current = selectedAgent?.id || null;
      return;
    }

    // Get current agent ID
    const currentAgentId = selectedAgent?.id || null;

    console.log(
      `Agent change check: previous=${prevAgentIdRef.current || "Default"}, current=${currentAgentId || "Default"}`,
    );

    // Compare current with previous agent ID
    const hasAgentChanged = prevAgentIdRef.current !== currentAgentId;

    // If agent changed and there are existing messages, set state to show regeneration option
    if (hasAgentChanged) {
      console.log(
        `Agent changed to: ${selectedAgent?.name || "Default"}, next message will use new Agent`,
      );

      if (messages.length > 0) {
        // Set agent changed state, UI can show regeneration option based on this
        setAgentChanged(true);
      }
    }

    prevAgentIdRef.current = currentAgentId;
  }, [selectedAgent, messages.length]);

  // Monitor model changes and save to localStorage
  useEffect(() => {
    // Save selected model to localStorage
    try {
      if (selectedModelId !== settings.openai.modelId) {
        console.log(`Model changed to: ${selectedModelId}`);
        localStorage.setItem("selectedModelId", selectedModelId);
      }
    } catch (error) {
      console.error("Error saving model to localStorage:", error);
    }
  }, [selectedModelId, settings.openai.modelId]);

  // Initialize selected model from localStorage and listen for model selection events
  useEffect(() => {
    try {
      const savedModel = localStorage.getItem("selectedModelId");
      if (savedModel) {
        console.log(`Loading model from localStorage: ${savedModel}`);
        setSelectedModelId(savedModel);
      }
    } catch (error) {
      console.error("Error loading model from localStorage:", error);
    }

    // Add handler for model-selected event from popover window
    const handleModelSelected = (event: Event) => {
      const customEvent = event as CustomEvent;
      if (customEvent.detail && customEvent.detail.modelId) {
        const newModelId = customEvent.detail.modelId;
        console.log(`Model selected via event: ${newModelId}`);
        setSelectedModelId(newModelId);
        localStorage.setItem("selectedModelId", newModelId);
      }
    };

    // Set up storage event listener for cross-window communication
    const handleStorageChange = (event: StorageEvent) => {
      console.log(`Storage change event: ${event.key}`);
      if (event.key === "selectedModelId" && event.newValue) {
        console.log(`Model selected via localStorage: ${event.newValue}`);
        setSelectedModelId(event.newValue);
      }
    };

    // Add event listeners
    window.addEventListener("model-selected", handleModelSelected);
    window.addEventListener("storage", handleStorageChange);

    // Check for model changes every second as a fallback
    const intervalId = setInterval(() => {
      const storedModel = localStorage.getItem("selectedModelId");
      if (storedModel && storedModel !== selectedModelId) {
        console.log(`Model changed in localStorage: ${storedModel}`);
        setSelectedModelId(storedModel);
      }
    }, 1000);

    // Cleanup function
    return () => {
      window.removeEventListener("model-selected", handleModelSelected);
      window.removeEventListener("storage", handleStorageChange);
      clearInterval(intervalId);
    };
  }, [selectedModelId]);

  // Setup IPC listener for window focus event
  useEffect(() => {
    // Only setup if window.require is available (in Electron environment)
    if (typeof window !== "undefined" && window.electronAPI) {
      const removeListener = window.electronAPI.onFocusChatInput(() => {
        console.log("Received focus-chat-input event via contextBridge");
        chatInputRef.current?.focus();
      });

      // Cleanup listener on component unmount
      return () => {
        removeListener?.();
      };
    }
  }, []);

  // Focus the input field when component mounts
  useEffect(() => {
    // Small delay to ensure the component is fully rendered
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
    console.log("Add attachment clicked");
    // Implement attachment functionality
  };

  // Handle translation
  const handleToggleTranslation = () => {
    console.log("Toggle translation clicked");
    // Implement translation functionality
  };

  // Reset the chat conversation
  const handleReset = () => {
    // Reset conversation by refreshing the page - simplest way to clear useChat state
    window.location.reload();
  };

  // Handle voice input
  const handleVoiceInput = () => {
    console.log("Voice input clicked");
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
    console.log("Exit clicked");
    // Implement exit functionality
    if (window.electronAPI) {
      window.electronAPI.closeWindow();
    } else {
      console.error(
        "Chat: window.electronAPI is not available for closeWindow!",
      );
    }
  };

  // Handle new history creation
  const handleNewHistory = () => {
    console.log("Create new history clicked");
    // Implement new history creation
    window.location.reload();
  };

  const handleStopGeneration = () => {
    console.log("Stopping message generation");
    if (isLoading) {
      stop();
    }
  };

  // Handle sending a message to the AI using Vercel AI SDK
  const handleSendMessage = () => {
    // Access editor directly through the ref
    const editor = chatInputRef.current?.editor;

    if (!editor || isLoading) return;

    // Check if the editor is empty and there's no copied content
    const editorText = editor.getText().trim();
    if (!editorText && !copiedContent) return;

    // Log the selected agent information
    console.log(
      `Sending message with agent: ${selectedAgent?.name || "Default"} (${selectedAgent?.id || "none"})`,
    );

    // Prepare the message text - combine editor content with copied content if available
    let messageText = editorText;
    
    if (copiedContent) {
      // Add copied content to the message wrapped in markdown to distinguish it
      if (messageText) {
        // If there's already text in the editor, add the wrapped copied content before it
        messageText = `<copied>\n${copiedContent}\n</copied>\n\n${messageText}`;
      } else {
        // If editor is empty, just use the wrapped copied content
        messageText = `<copied>\n${copiedContent}\n</copied>`;
      }
      console.log("Including copied content in message:", copiedContent.substring(0, 30) + (copiedContent.length > 30 ? "..." : ""));
    }

    // Update input with the combined message text
    handleInputChange({
      target: { value: messageText }
    } as React.ChangeEvent<HTMLInputElement>);
    
    // Create a synthetic event for handleSubmit
    const event = {
      preventDefault: () => {},
    } as unknown as React.FormEvent<HTMLFormElement>;

    // Clear copied content after using it
    if (copiedContent) {
      setCopiedContent(null);
    }

    // Submit the message using aiHandleSubmit (don't use both methods)
    aiHandleSubmit(event);

    // Clear content directly using the editor instance
    setTimeout(() => {
      if (chatInputRef.current?.editor) {
        chatInputRef.current.editor.clearContent();
      }
    }, 0);
  };

  // Handle editing a message and regenerating the response
  const handleEditMessage = async (message: Message, newContent: string) => {
    if (isLoading) return;
    console.log(
      `Editing message: ${message.id} with new content: ${newContent}`,
    );

    // Find the message index
    const messageIndex = messages.findIndex((m) => m.id === message.id);
    if (messageIndex === -1) return;

    // Create a copy of messages array
    const updatedMessages = [...messages];

    // Update the message content
    updatedMessages[messageIndex] = {
      ...updatedMessages[messageIndex],
      content: newContent,
    };

    // Remove all messages after this message (if it's not the last one)
    if (messageIndex < updatedMessages.length - 1) {
      updatedMessages.splice(messageIndex + 1);
    }

    // Update messages
    setMessages(updatedMessages);

    // Clear editor content using the direct editor reference
    if (chatInputRef.current?.editor) {
      chatInputRef.current.editor.clearContent();
    }

    // Reload to regenerate AI response
    setTimeout(() => {
      reload();
    }, 100);
  };

  // Handle regenerating the last AI response
  const handleRegenerateResponse = async () => {
    if (isLoading) return;
    console.log("Regenerating AI response");

    // Simply use the reload method from useChat
    reload();
  };

  // Functions to handle copied content actions - only keep the reject function
  const handleRejectCopiedContent = () => {
    console.log("Rejecting copied content");
    setCopiedContent(null);
    
    // Force window resize after rejecting content
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
            console.log("Chat: Window resized after content rejection");
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
          console.log(`Theme detected: system=${res}, user=${res}`);
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
          onOpenSettings={handleOpenSettings}
          copiedContent={copiedContent}
          onRejectCopiedContent={handleRejectCopiedContent}
        />
      )}
    </div>
  );
}

export {};
