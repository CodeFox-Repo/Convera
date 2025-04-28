import React, {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
  useEffect,
} from "react";
import {
  Send,
  Plus,
  Globe,
  Mic,
  RotateCcw,
  Monitor,
  Bot,
  Square,
  Settings,
} from "lucide-react";
import ModelSelector from "./ModelSelector";
import TiptapEditor, { TiptapEditorRef } from "@/components/editor";

interface Agent {
  id: string;
  name: string;
  description: string;
  category: string;
  iconUrl?: string;
}

interface ChatInputProps {
  isLoading: boolean;
  input: string;
  setInput: (value: string) => void;
  hasMessages?: boolean;
  onAddAttachment?: () => void;
  onToggleTranslation?: () => void;
  onReset?: () => void;
  onVoiceInput?: () => void;
  onSendMessage?: () => void;
  onStopGeneration?: () => void;
  onOpenSettings?: () => void;
  selectedAgent?: Agent | null;
  onAgentSelect?: (agent: Agent | null) => void;
  placeholder?: string;
  selectedModelId?: string;
  onModelSelect?: (modelId: string) => void;
}

export interface ChatInputRef {
  focus: () => void;
  getInput: () => string;
  setInput: (content: string) => void;
  editor: TiptapEditorRef | null;
}

/**
 * Input component for chat interface with action buttons
 */
const ChatInput = forwardRef<ChatInputRef, ChatInputProps>(
  (
    {
      isLoading,
      input,
      setInput,
      hasMessages = false,
      onAddAttachment,
      onToggleTranslation,
      onReset,
      onVoiceInput,
      onSendMessage,
      onStopGeneration,
      onOpenSettings,
      selectedAgent,
      onAgentSelect,
      placeholder = "Message FoxyChat...",
      selectedModelId,
      onModelSelect,
    },
    ref,
  ) => {
    const editorRef = useRef<TiptapEditorRef>(null);
    const [previousApp, setPreviousApp] = useState<string>("");
    const [editorContent, setEditorContent] = useState("");

    // Function to fetch the previous active application
    const fetchPreviousApp = async () => {
      try {
        if (window.electronAPI) {
          const appName = await window.electronAPI.getPreviousApp();

          // Ignore self-referential applications
          const ignoreList = ["Electron", "FoxyChat", "foxfoxy"];
          if (appName && !ignoreList.some((name) => appName.includes(name))) {
            setPreviousApp(appName);
          }
        }
      } catch (error) {
        console.error("Error fetching previous app:", error);
      }
    };

    // Fetch previous app on component mount and setup event listener for app changes
    useEffect(() => {
      // Initial fetch
      fetchPreviousApp();

      // Setup event listener for app changes
      if (window.electronAPI?.onAppChanged) {
        const unsubscribe = window.electronAPI.onAppChanged(
          (appName: string) => {
            if (appName) {
              // Use same filtering logic for events
              const ignoreList = ["Electron", "FoxyChat", "foxfoxy"];
              if (!ignoreList.some((name) => appName.includes(name))) {
                setPreviousApp(appName);
              }
            }
          },
        );

        return unsubscribe;
      }
    }, []);

    // Expose methods to parent components
    useImperativeHandle(ref, () => ({
      focus: () => {
        editorRef.current?.focus();
        fetchPreviousApp(); // Still update previous app when focused
      },
      getInput: () => {
        return editorRef.current?.getText() || "";
      },
      setInput: (content: string) => {
        if (editorRef.current) {
          // Clear content first
          editorRef.current.clearContent();

          // Set new content with a small delay to ensure clearContent completes
          setTimeout(() => {
            // Update parent's input state
            setInput(content);

            // Update local state
            if (editorRef.current) {
              setEditorContent(editorRef.current.getText());
            }
          }, 0);
        }
      },
      // Directly expose the editor instance
      get editor() {
        return editorRef.current;
      },
    }));

    // Format the app name to keep it short
    const formatAppName = (name: string) => {
      if (!name) return "";

      // Remove file extensions if present
      const nameWithoutExt = name.replace(/\.\w+$/, "");

      // Limit to 12 characters
      if (nameWithoutExt.length > 12) {
        return nameWithoutExt.substring(0, 10) + "...";
      }

      return nameWithoutExt;
    };

    // Add new useEffect to monitor agent selection
    useEffect(() => {
      // Check if there's a saved agent in localStorage
      const checkForSavedAgent = () => {
        try {
          const savedAgent = localStorage.getItem("selectedAgent");
          if (savedAgent && onAgentSelect) {
            onAgentSelect(JSON.parse(savedAgent));
          }
        } catch (error) {
          console.error("Error getting saved agent:", error);
        }
      };

      // Initial check
      checkForSavedAgent();

      // Listen for custom events
      const handleAgentSelected = (event: Event) => {
        const customEvent = event as CustomEvent;
        if (onAgentSelect && customEvent.detail && customEvent.detail.agent) {
          onAgentSelect(customEvent.detail.agent);
        }
      };

      // Listen for storage events for cross-window changes
      const handleStorageChange = (event: StorageEvent) => {
        if (event.key === "selectedAgent" && onAgentSelect) {
          if (event.newValue) {
            onAgentSelect(JSON.parse(event.newValue));
          } else {
            onAgentSelect(null);
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
    }, [onAgentSelect]);

    // Handle editor content change
    const handleEditorChange = (content: string) => {
      setInput(content);
      console.log("handleEditorChange", content);
      // Get the text content from the editor for enabling/disabling the send button
      if (editorRef.current) {
        setEditorContent(editorRef.current.getText());
      }
    };

    // Handle form submission
    const handleSubmit = () => {
      if (onSendMessage && !isLoading && editorContent.trim()) {
        onSendMessage();
      }
    };

    return (
      <div className="drag-region h-full p-1">
        <div className="h-full  w-full">
          <div
            className={`flex h-full flex-col rounded-[var(--app-border-radius)] border-1 border-gray-500/45 p-3 ${hasMessages ? "bg-background/80" : "bg-background/30"} `}
          >
            {/* Editor field */}
            <div className="drag-region mb-2 w-full flex-1">
              <TiptapEditor
                ref={editorRef}
                content={input}
                onChange={handleEditorChange}
                placeholder={placeholder}
                disabled={isLoading}
                onSubmit={handleSubmit}
                autoFocus={true}
              />
            </div>

            {/* Buttons row - Bottom row */}
            <div className="drag-region flex min-h-[30px] items-center justify-between">
              {/* Left icons - use space-x here */}
              <div className="flex flex-1 items-center space-x-4">
                <button
                  onClick={onAddAttachment}
                  className="no-drag-region text-foreground/70 hover:text-foreground"
                >
                  <Plus size={24} />
                </button>
                <button
                  onClick={onReset}
                  className="no-drag-region text-foreground/70 hover:text-foreground"
                >
                  <RotateCcw size={20} />
                </button>

                <button
                  onClick={onOpenSettings}
                  className="no-drag-region text-foreground/70 hover:text-foreground"
                >
                  <Settings size={20} />
                </button>

                {/* Combined Agent selector button */}
                <button
                  className={`no-drag-region flex items-center ${
                    selectedAgent
                      ? "bg-primary/20 text-primary hover:bg-primary/30 rounded px-2 py-0.5 text-xs font-medium"
                      : "text-foreground/70 hover:text-foreground"
                  }`}
                  onClick={(e) => {
                    const button = e.currentTarget;
                    const rect = button.getBoundingClientRect();

                    // Calculate global position (relative to screen)
                    if (window.electronAPI) {
                      e.stopPropagation();

                      window.electronAPI
                        .getCurrentWindowPosition()
                        .then(
                          ({ x: winX, y: winY }: { x: number; y: number }) => {
                            const absX = Math.round(winX + rect.left + 20);
                            const absY = Math.round(winY + rect.bottom - 200);

                            const width = 240;
                            const height = 300;

                            window.electronAPI.toggleAgentPopover(
                              absX,
                              absY,
                              width,
                              height,
                            );
                          },
                        )
                        .catch((err: Error) => {
                          console.error("Failed to get window position:", err);
                          // Fallback to direct toggling of agent
                          if (onAgentSelect) {
                            onAgentSelect(selectedAgent ? null : null);
                          }
                        });
                    }
                  }}
                >
                  <Bot
                    size={selectedAgent ? 12 : 20}
                    className={selectedAgent ? "mr-1" : ""}
                  />
                  {selectedAgent && selectedAgent.name}
                </button>

                {/* Model selector */}
                {selectedModelId && onModelSelect && (
                  <div className="no-drag-region inline-flex items-center">
                    <ModelSelector
                      selectedModel={selectedModelId}
                      onSelectModel={onModelSelect}
                    />
                  </div>
                )}

                {/* Previous app badge */}
                {previousApp && (
                  <div className="no-drag-region bg-primary/20 text-black/40 dark:text-white flex items-center rounded px-2 py-0.5 text-xs font-medium">
                    <Monitor size={12} className="mr-1" />
                   {formatAppName(previousApp)}
                  </div>
                )}
              </div>

              {/* Right side - Mic and Send buttons */}
              <div className="flex shrink-0 items-center">
                <button
                  onClick={onVoiceInput}
                  className="no-drag-region text-foreground/70 hover:bg-foreground/10 hover:text-foreground active:bg-foreground/20 mr-3 rounded-full p-1.5"
                >
                  <Mic size={18} />
                </button>

                {isLoading && onStopGeneration ? (
                  <button
                    onClick={onStopGeneration}
                    className="no-drag-region bg-foreground/10 hover:bg-foreground/20 active:bg-foreground/30 flex size-8 items-center justify-center rounded-md transition-colors dark:bg-[#353541] dark:hover:bg-[#40404B] dark:active:bg-[#494952]"
                    aria-label="Stop generation"
                  >
                    <Square
                      size={14}
                      strokeWidth={2.5}
                      fill="none"
                      className="text-foreground dark:text-white"
                    />
                  </button>
                ) : (
                  <button
                    onClick={handleSubmit}
                    disabled={isLoading || !editorContent.trim()}
                    className={`no-drag-region ${
                      !editorContent.trim() || isLoading
                        ? "text-foreground/30 cursor-not-allowed"
                        : "text-foreground hover:text-primary"
                    }`}
                    aria-label="Send message"
                  >
                    <Send size={20} />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  },
);

// Add display name
ChatInput.displayName = "ChatInput";

export default ChatInput;
