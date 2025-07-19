// Chat Component - Main entry point for the Raycast-style command palette
// This component provides a unified interface for both AI chat and command execution
// Design philosophy follows Raycast's minimalist, keyboard-first approach
import { WINDOW_SIZE_PRESETS } from "@/electron/windows/window-size";
import { usePreviousApp } from "@/renderer/libs/hooks/use-previous-app";
import { useThemeSync } from "@/renderer/libs/hooks/use-theme-sync";
import { useWindowClose } from "@/renderer/libs/hooks/use-window-close";
import { useChatContext } from "@/renderer/libs/stores/chat-store";
import React, { useCallback, useEffect, useRef, useState } from "react";
// Import Raycast-inspired components
import CommandContent from "./command-content";
import CommandInput from "./command-input";
import CommandResults from "./command-results";

/**
 * Chat Component
 *
 * A lightweight, fast command palette interface inspired by Raycast's design
 *
 * Features:
 * - Dual mode: AI chat (default) and command mode (activated with "/")
 * - Dynamic window resizing based on content
 * - Keyboard-first navigation
 * - Minimal visual footprint with glass morphism effects
 * - Fast response times and smooth animations
 *
 * The design prioritizes speed and efficiency over visual complexity
 */
export default function Chat() {
  const inputRef = useRef<HTMLInputElement>(null);
  const { messages, setSelectedContent, sendMessage, isLoading, resetChat, currentConversationId } =
    useChatContext();
  const { previousApp } = usePreviousApp();

  const [initializing, setInitializing] = useState(true);
  const [inputValue, setInputValue] = useState("");
  const [isCommandMode, setIsCommandMode] = useState(false);
  const [results, setResults] = useState<CommandResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showContent, setShowContent] = useState(false);

  interface CommandResult {
    id: string;
    name: string;
    description: string;
    icon: string | React.ReactNode;
  }

  // Calculate dynamic window height based on results and content
  const calculateDynamicHeight = useCallback(
    (
      resultCount: number,
      hasInput: boolean,
      hasActiveBadge: boolean = false,
      hasContent: boolean = false,
    ) => {
      /**
       * Dynamic base height calculation to prevent excessive bottom margin
       *
       * ISSUE: Previously used fixed baseHeight=98 regardless of active app badge presence,
       * causing ~20px extra bottom margin when no badge was displayed.
       *
       * SOLUTION: Conditional base height based on active app badge:
       * - WITH badge (previousApp exists): 98px - accounts for badge space + proper padding
       * - WITHOUT badge (no previousApp): 78px - removes extra space, maintains padding
       *
       * This ensures the window fits content precisely without unwanted bottom space.
       */
      const baseHeight = hasActiveBadge ? 98 : 78; // Dynamic height based on badge presence
      const containerPadding = 24; // Padding around container
      const resultHeight = 48; // Height per result item
      const resultsPadding = 8; // Padding around results
      const contentHeight = 400; // Height for command content area

      // If content is showing, use larger height
      if (hasContent) {
        return baseHeight + containerPadding + contentHeight;
      }

      if (!hasInput && resultCount === 0) {
        // Minimal height for empty state - especially when no active app
        return hasActiveBadge ? baseHeight : 70;
      }

      if (hasInput && resultCount === 0) {
        // Show AI chat preview
        return baseHeight + containerPadding + resultHeight + resultsPadding;
      }

      // Show command results
      const maxResults = Math.min(resultCount, 6); // Limit to 6 results
      return (
        baseHeight +
        containerPadding +
        maxResults * resultHeight +
        resultsPadding
      );
    },
    [],
  );

  // Helper function to create selected content with deduplication
  const createSelectedContent = useCallback(
    (content: { text?: string; imageData?: string }) => {
      const timestamp = Date.now();
      return {
        ...content,
        timestamp,
        source: "shortcut" as const,
      };
    },
    [],
  );

  // Listen for theme changes from settings
  useThemeSync();

  // Handle Command+W for chat window deactivation
  useWindowClose({ type: "close" });

  // Handle input change
  const handleInputChange = (value: string) => {
    // Don't allow input changes when loading
    if (isLoading) return;

    setInputValue(value);
    setIsCommandMode(value.startsWith("/"));
    setSelectedIndex(0); // Reset selection when input changes

    if (value.startsWith("/")) {
      // Handle command mode
      handleCommandSearch(value);
    } else if (value.trim()) {
      // Handle AI chat mode
      setResults([]);
    } else {
      setResults([]);
    }
  };

  // Handle command search
  const handleCommandSearch = useCallback(async (query: string) => {
    const command = query.slice(1); // Remove the '/' prefix

    try {
      // Get MCP tools that don't require input parameters
      const response = await window.mcpAPI.getAllNonInputParamTool();

      if (response.success && response.data) {
        // Convert MCP tools to command format
        const mcpCommands = response.data.map((tool) => ({
          id: tool.name,
          name: tool.description || tool.name, // Main title shows description
          description: tool.name, // Subtitle shows tool name
          icon: "Settings", // Lucide gear icon
        }));

        // Filter based on search query
        const filtered = mcpCommands.filter(
          (cmd) =>
            cmd.name.toLowerCase().includes(command.toLowerCase()) ||
            cmd.description.toLowerCase().includes(command.toLowerCase()),
        );

        setResults(filtered);
      } else {
        // Fallback to empty results if MCP fails
        console.warn("Failed to fetch MCP tools:", response.error);
        setResults([]);
      }
    } catch (error) {
      console.error("Error fetching MCP tools:", error);
      setResults([]);
    }
  }, []);

  // Handle command execution
  const handleCommandExecute = useCallback(
    async (command: CommandResult) => {
      console.log("Executing MCP command:", command);
      setInputValue("");
      setResults([]);
      setIsCommandMode(false);
      setShowContent(true);

      try {
        // Call MCP tool with no arguments since it's a non-input param tool
        const response = await window.mcpAPI.mcpToolCall(command.id, {});

        if (response.success) {
          console.log("MCP tool execution result:", response.data);

          // Create a tool result message and add it to chat context
          const toolResultMessage = {
            id: `tool-${Date.now()}`,
            role: "tool" as const,
            content:
              typeof response.data === "string"
                ? response.data
                : JSON.stringify(response.data, null, 2),
            createdAt: new Date(),
            toolName: command.id,
          };

          // You might need to add this to chat context - for now just log
          console.log("Tool result message:", toolResultMessage);
        } else {
          console.error("MCP tool execution failed:", response.error);

          // Show error message
          const errorMessage = {
            id: `error-${Date.now()}`,
            role: "tool" as const,
            content: `Error executing ${command.id}: ${response.error}`,
            createdAt: new Date(),
            toolName: command.id,
          };
          console.log("Tool error message:", errorMessage);
        }
      } catch (error) {
        console.error("Error executing MCP tool:", error);
      }

      // Don't close window immediately - let user see results
    },
    [sendMessage],
  );

  // Handle AI chat submission
  const handleAIChatSubmit = useCallback(
    (message: string) => {
      console.log("AI Chat message:", message);
      if (!message || message.trim() === "") {
        console.error("Empty message submitted");
        return;
      }

      // Clear input first
      setInputValue("");
      setResults([]);
      setShowContent(true);

      // Send message directly with the message text
      console.log("🚀 Calling sendMessage with:", message);
      sendMessage(message);
    },
    [sendMessage],
  );

  // Handle key press
  const handleKeyPress = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        if (isCommandMode && results.length > 0) {
          handleCommandExecute(results[selectedIndex]);
        } else if (!isCommandMode && inputValue.trim()) {
          handleAIChatSubmit(inputValue.trim());
        }
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        if (isCommandMode && results.length > 0) {
          setSelectedIndex((prev) => (prev + 1) % results.length);
        }
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (isCommandMode && results.length > 0) {
          setSelectedIndex(
            (prev) => (prev - 1 + results.length) % results.length,
          );
        }
      } else if (e.key === "Escape") {
        if (showContent) {
          setShowContent(false);
        } else if (window.electronAPI?.toggleWindow) {
          window.electronAPI.toggleWindow("chat");
        }
      }
    },
    [
      isCommandMode,
      results,
      selectedIndex,
      inputValue,
      handleCommandExecute,
      handleAIChatSubmit,
      showContent,
    ],
  );

  // Handle global Cmd+J shortcut
  useEffect(() => {
    const handleGlobalKeydown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "j") {
        e.preventDefault();

        // Only allow if chat has at least one complete conversation (user + assistant)
        if (messages.length >= 2 && !isLoading && currentConversationId) {
          console.log("Switching to main window with conversation:", currentConversationId);
          
          // Pass conversation ID to main window via localStorage
          localStorage.setItem("switchToConversation", currentConversationId);
          
          // Trigger storage event for same-window detection
          window.dispatchEvent(new StorageEvent("storage", {
            key: "switchToConversation",
            newValue: currentConversationId,
            oldValue: null
          }));

          if (window.electronAPI?.toggleWindow) {
            // Hide current chat window and show main window
            window.electronAPI.toggleWindow("chat"); // Hide chat
            window.electronAPI.toggleWindow("main"); // Show main
          }
        } else {
          console.log("Cannot switch: insufficient messages or still loading", {
            messagesCount: messages.length,
            isLoading,
            conversationId: currentConversationId
          });
        }
      }
    };

    document.addEventListener("keydown", handleGlobalKeydown);

    return () => {
      document.removeEventListener("keydown", handleGlobalKeydown);
    };
  }, [messages.length, isLoading, currentConversationId]);

  useEffect(() => {
    const mountTimer = setTimeout(() => {
      if (window.electronAPI && messages.length === 0) {
        try {
          window.electronAPI
            .getCurrentWindowSize(WINDOW_SIZE_PRESETS.CHAT)
            .then((res) => {
              requestAnimationFrame(() => {
                window.electronAPI.resizeWindow(res.width, res.height, true);
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
    };
  }, [messages.length]);

  // Dynamic window resizing based on results and content
  useEffect(() => {
    if (window.electronAPI && !initializing) {
      const hasInput = inputValue.trim().length > 0;
      const resultCount = isCommandMode ? results.length : hasInput ? 1 : 0;
      const hasActiveBadge = !!previousApp;

      const newHeight = calculateDynamicHeight(
        resultCount,
        hasInput,
        hasActiveBadge,
        showContent,
      );

      // Get current window size to preserve width
      window.electronAPI
        .getCurrentWindowSize(WINDOW_SIZE_PRESETS.CHAT)
        .then((currentSize) => {
          // Only resize if height changed significantly (> 10px difference)
          if (Math.abs(currentSize.height - newHeight) > 10) {
            window.electronAPI.resizeWindow(currentSize.width, newHeight, true);
          }
        })
        .catch((error) => {
          console.error("Failed to get current window size:", error);
        });
    }
  }, [
    results.length,
    inputValue,
    isCommandMode,
    initializing,
    previousApp,
    showContent,
    calculateDynamicHeight,
  ]);

  useEffect(() => {
    let mounted = true;

    if (window.electronAPI?.onSetInputContent) {
      const unsubscribe = window.electronAPI.onSetInputContent(
        (content: { text?: string; imageData?: string }) => {
          if (!mounted) return;

          if (content.imageData || (content.text && content.text.trim())) {
            const selectedContent = createSelectedContent({
              text:
                content.text && content.text.trim() ? content.text : undefined,
              imageData: content.imageData || undefined,
            });

            setSelectedContent(selectedContent);
          } else {
            setSelectedContent(null);
          }
        },
      );

      return () => {
        mounted = false;
        unsubscribe?.();
      };
    }
  }, [setSelectedContent, createSelectedContent]);

  useEffect(() => {
    if (typeof window !== "undefined" && window.electronAPI) {
      const removeListener = window.electronAPI.onFocusChatInput(() => {
        // Reset chat state when window is activated by shortcut
        resetChat();
        setInputValue("");
        setResults([]);
        setIsCommandMode(false);
        setSelectedIndex(0);
        setShowContent(false);

        // Focus the input after reset
        setTimeout(() => {
          inputRef.current?.focus();
        }, 50);
      });

      return () => {
        removeListener?.();
      };
    }
  }, [resetChat]);

  useEffect(() => {
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 100);

    return () => clearTimeout(timer);
  }, []);

  // Refocus input when loading completes
  useEffect(() => {
    if (!isLoading && inputRef.current) {
      // Use a small delay to ensure the input is enabled before focusing
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 50);

      return () => clearTimeout(timer);
    }
  }, [isLoading]);

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
        .then((theme) => {
          document.documentElement.dataset.theme = theme;
        })
        .catch((err) => {
          console.error("Failed to get theme:", err);
        });
    }
  }, []);

  useEffect(() => {
    const handleSettingsUpdate = (e: CustomEvent) => {
      if (e.detail && e.detail.field === "apiKey") {
        console.log("API key updated");

        if (messages.length === 0) {
          window.location.reload();
        }
      }
    };

    window.addEventListener(
      "settings-updated",
      handleSettingsUpdate as EventListener,
    );

    return () => {
      window.removeEventListener(
        "settings-updated",
        handleSettingsUpdate as EventListener,
      );
    };
  }, [messages.length]);

  if (initializing) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <div className="animate-fade-in opacity-0 delay-100">
          <div className="bg-primary/20 h-10 w-10 animate-pulse rounded-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full relative px-3">
      {/* Input always at top */}
      <div className={`pt-3 mb-1 ${showContent ? "relative z-20" : ""}`}>
        <CommandInput
          ref={inputRef}
          value={inputValue}
          onChange={handleInputChange}
          onKeyPress={handleKeyPress}
          isCommandMode={isCommandMode}
          disabled={isLoading}
          placeholder={
            isCommandMode
              ? "Search commands..."
              : isLoading
                ? "AI is thinking..."
                : "Ask FoxyChat AI anything or type / for commands"
          }
        />
      </div>

      {/* Results section - only show when not in content mode and not loading */}
      {(results.length > 0 || inputValue.trim()) &&
        !showContent &&
        !isLoading && (
          <div className="flex-1 ">
            <CommandResults
              results={results}
              query={inputValue}
              isCommandMode={isCommandMode}
              selectedIndex={selectedIndex}
              onCommandExecute={handleCommandExecute}
              onAIChatSubmit={handleAIChatSubmit}
              onSelectedIndexChange={setSelectedIndex}
            />
          </div>
        )}

      {/* Content overlay - covers everything below input when visible */}
      {showContent && (
        <div className="absolute inset-0 mt-24">
          <CommandContent isVisible={showContent} />
        </div>
      )}
    </div>
  );
}
