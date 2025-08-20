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
import { LanguagesIcon } from "lucide-react";
import CommandContent from "./command-content";
import CommandInput from "./command-input";
import CommandResults from "./command-results";
import { AppMentionFullscreen } from "./input/app-mention-fullscreen";

// Types are imported from other components

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
  const {
    messages,
    selectedContent,
    setSelectedContent,
    sendMessage,
    isLoading,
    resetChat,
    currentConversationId,
    addToolExecutionRecord,
  } = useChatContext();
  const { previousApp } = usePreviousApp();

  const [initializing, setInitializing] = useState(true);
  const [inputValue, setInputValue] = useState("");
  const [isCommandMode, setIsCommandMode] = useState(false);
  const [isAppMentionMode, setIsAppMentionMode] = useState(false);
  const [appMentionQuery, setAppMentionQuery] = useState("");
  const [results, setResults] = useState<CommandResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showContent, setShowContent] = useState(false);
  const [selectedInputCommand, setSelectedInputCommand] =
    useState<CommandResult | null>(null);
  const [commandResult, setCommandResult] = useState("");
  // Track app mentions for whole deletion
  const [appMentions, setAppMentions] = useState<
    Array<{ start: number; end: number; app: string }>
  >([]);
  // Block resize during app mention mode to prevent window truncation
  const blockResizeRef = useRef(false);

  interface CommandResult {
    id: string;
    name: string;
    description: string;
    icon: string | React.ReactNode;
    // default is mcp, input-changed-command means the command is triggered by input change
    type?: "mcp" | "input-changed-command";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    execute?: (input?: string) => Promise<any>;
  }

  const presetCommands: CommandResult[] = [
    {
      id: "translate",
      name: "Google Translate",
      description: "Translate text between languages",
      icon: <LanguagesIcon />,
      type: "input-changed-command",
      execute: async (input?: string) => {
        if (!input || !input.trim()) {
          return "Please enter text to translate";
        }

        try {
          // Use Google Translate API via a free service
          const response = await fetch(
            `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(input)}`,
          );

          if (!response.ok) {
            throw new Error("Translation failed");
          }

          const data = await response.json();
          const translatedText = data[0][0][0];
          const detectedLanguage = data[2] || "unknown";

          return `${translatedText} (from ${detectedLanguage})`;
        } catch (error) {
          console.error("Translation error:", error);
          return `Translation failed: ${input}`;
        }
      },
    },
  ];

  /**
   * Calculate dynamic height for selected content based on text length and wrapping
   *
   * SOLUTION: Dynamic height calculation instead of fixed 48px
   * - 1 line text ≈ 35px (16px padding + 18px text + 1px border)
   * - 2 line text ≈ 53px (16px padding + 36px text + 1px border)
   *
   * Implementation:
   * - Reverse-engineers from actual CSS classes in command-input.tsx
   * - Simulates browser text wrapping by splitting on words
   * - Respects line-clamp-2 CSS constraint (max 2 lines)
   * - Uses precise pixel values derived from Tailwind classes
   *
   * This replaces the previous fixed 48px approach with content-aware sizing
   */
  const calculateSelectedContentHeight = useCallback((text: string) => {
    if (!text) return 0;

    // Based on actual CSS in command-input.tsx:
    // - py-2: 8px top + 8px bottom = 16px padding
    // - text-sm: ~14px font-size with ~1.25 line-height = ~18px per line
    // - line-clamp-2: maximum 2 lines
    // - Available width for text: ~520px

    const verticalPadding = 16; // py-2
    const lineHeight = 18; // text-sm line height
    const borderHeight = 1; // border-b

    // More accurate line calculation: consider word breaks
    // Rough estimate: 65-75 characters per line for 520px width with text-sm
    const charsPerLine = 70;

    // Split into words and calculate lines more accurately
    const words = text.split(/\s+/);
    let currentLineLength = 0;
    let lines = 1;

    for (const word of words) {
      const wordLength = word.length + 1; // +1 for space

      if (currentLineLength + wordLength > charsPerLine) {
        lines++;
        currentLineLength = wordLength;

        // Cap at 2 lines due to line-clamp-2
        if (lines >= 2) break;
      } else {
        currentLineLength += wordLength;
      }
    }

    // Ensure at least 1 line, max 2 lines
    const actualLines = Math.min(Math.max(lines, 1), 2);

    return verticalPadding + actualLines * lineHeight + borderHeight;
  }, []);

  // Calculate dynamic window height based on results and content
  const calculateDynamicHeight = useCallback(
    (
      resultCount: number,
      hasInput: boolean,
      hasActiveBadge: boolean = false,
      hasContent: boolean = false,
      selectedContentText: string = "",
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
      // Dynamic base height calculation
      let baseHeight = hasActiveBadge ? 98 : 78;

      // Add dynamic height for selected content based on actual text
      const selectedContentHeight =
        calculateSelectedContentHeight(selectedContentText);
      baseHeight += selectedContentHeight;
      const containerPadding = 24; // Padding around container
      const resultHeight = 48; // Height per result item
      const resultsPadding = 8; // Padding around results
      const contentHeight = 400; // Height for command content area
      const mainContainerPadding = 0; // py-2 adds 8px top + 8px bottom

      // If content is showing, use larger height
      if (hasContent) {
        return (
          baseHeight + containerPadding + contentHeight + mainContainerPadding
        );
      }

      if (!hasInput && resultCount === 0) {
        // Minimal height for empty state - use minHeight from window config for consistency
        // This ensures the window shrinks back to the compact initial size
        const minHeight = hasActiveBadge ? 100 : 80; // Match minHeight from WINDOW_SIZE_PRESETS.CHAT

        // baseHeight already includes selected content height, so just use that or minHeight
        return Math.max(baseHeight, minHeight);
      }

      if (hasInput && resultCount === 0) {
        // Show AI chat preview - use larger height for better UX
        return (
          baseHeight +
          containerPadding +
          resultHeight * 6 + // Bigger preview area (6 result heights)
          resultsPadding +
          mainContainerPadding
        );
      }

      // Show command results
      const maxResults = Math.min(resultCount, 6); // Limit to 6 results
      return (
        baseHeight +
        containerPadding +
        maxResults * resultHeight +
        resultsPadding +
        mainContainerPadding
      );
    },
    [calculateSelectedContentHeight],
  );

  // Safe resize function that checks block state
  const safeResizeWindow = useCallback(
    (width: number, height: number, preserveCenter: boolean = true) => {
      if (blockResizeRef.current) {
        console.log("🚫 Blocked resize attempt during app mention mode:", {
          width,
          height,
        });
        return;
      }
      if (window.electronAPI) {
        window.electronAPI.resizeWindow(width, height, preserveCenter);
      }
    },
    [],
  );

  // Helper function to create selected content with deduplication
  const createSelectedContent = useCallback((content: { text?: string }) => {
    const timestamp = Date.now();
    return {
      ...content,
      timestamp,
      source: "shortcut" as const,
    };
  }, []);

  // Listen for theme changes from settings
  useThemeSync();

  // Handle Command+W for chat window deactivation
  useWindowClose({ type: "close" });

  // Handle input change
  const handleInputChange = async (value: string) => {
    // Don't allow input changes when loading
    if (isLoading) return;

    // Update app mentions positions if text length changed
    if (value.length < inputValue.length) {
      // Text was deleted, update mention positions
      const diff = inputValue.length - value.length;
      setAppMentions((prev) =>
        prev
          .map((mention) => ({
            ...mention,
            start:
              mention.start > value.length
                ? mention.start - diff
                : mention.start,
            end: mention.end > value.length ? mention.end - diff : mention.end,
          }))
          .filter((mention) => mention.start < value.length),
      );
    }

    setInputValue(value);
    setSelectedIndex(0); // Reset selection when input changes

    // Reset showContent only when user starts typing commands to allow command results to show
    // Don't reset for app mentions (@) or empty values
    if (showContent && value.trim() && value.startsWith("/")) {
      setShowContent(false);
    }

    // Check if we're in input change command mode
    if (selectedInputCommand) {
      // Generate real-time result using the selected command
      if (selectedInputCommand.execute && value.trim()) {
        selectedInputCommand
          .execute(value)
          .then((result) => {
            const resultString =
              typeof result === "string" ? result : JSON.stringify(result);

            const dynamicResult: CommandResult = {
              id: `${selectedInputCommand.id}-result`,
              name: selectedInputCommand.name,
              description: resultString,
              icon: selectedInputCommand.icon,
              type: "input-changed-command",
            };

            setCommandResult(resultString);

            setResults([dynamicResult]);
          })
          .catch((error) => {
            console.error("Error executing input change command:", error);
            setCommandResult("");
            setResults([]);
          });
      } else {
        setCommandResult("");
        setResults([]);
      }
      return;
    }

    // Check for app mention mode - match @ at the end or @ followed by letters at the end
    const appMentionMatch = value.match(/@(\w*)$/);

    if (appMentionMatch) {
      setIsAppMentionMode(true);
      setIsCommandMode(false);
      setAppMentionQuery(appMentionMatch[1]);
      setResults([]);
      // Don't block resize immediately - let the @ mode expand first
      return;
    } else if (isAppMentionMode && !value.match(/@\w*$/)) {
      // Exit app mention mode if no @ at the end
      setIsAppMentionMode(false);
      setAppMentionQuery("");
      // Unblock resize when exiting app mention mode
      blockResizeRef.current = false;
    }

    setIsCommandMode(value.startsWith("/"));

    if (value.startsWith("/")) {
      // Handle command mode
      handleCommandSearch(value);
    } else if (value.trim()) {
      // Handle AI chat mode
      setResults([]);
    } else {
      // when input is empty, restore chat history if there are messages
      setResults([]);
      if (messages.length > 0 && !showContent) {
        setShowContent(true);
      }
    }
  };

  // Handle command search
  const handleCommandSearch = useCallback(async (query: string) => {
    const command = query.slice(1); // Remove the '/' prefix

    // Start with preset commands
    let allCommands: CommandResult[] = [];

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

        // Combine preset commands with MCP commands
        allCommands = [...presetCommands, ...mcpCommands];
      } else {
        // If MCP fails, just use preset commands
        console.warn("Failed to fetch MCP tools:", response.error);
      }
    } catch (error) {
      console.error("Error fetching MCP tools:", error);
      // If MCP fails, just use preset commands
    }

    // Filter all commands based on search query
    const filtered = allCommands.filter(
      (cmd) =>
        cmd.name.toLowerCase().includes(command.toLowerCase()) ||
        cmd.description.toLowerCase().includes(command.toLowerCase()) ||
        cmd.id.toLowerCase().includes(command.toLowerCase()),
    );

    setResults(filtered);
  }, []);

  // Handle command execution
  const handleCommandExecute = useCallback(
    async (command: CommandResult) => {
      // Check if this is an input-changed-command
      if (command.type === "input-changed-command") {
        // Enter input change command mode
        setSelectedInputCommand(command);
        setCommandResult("");
        setInputValue("");
        setResults([]);
        setIsCommandMode(false);
        return;
      }

      setInputValue("");
      setResults([]);
      setIsCommandMode(false);
      setShowContent(true);

      // Handle MCP commands
      try {
        // Call MCP tool with no arguments since it's a non-input param tool
        const response = await window.mcpAPI.mcpToolCall(command.id, {});
        console.log("MCP tool executed successfully:", response);

        if (response.success && response.data) {
          // Tool executed successfully - create a message with the result
          const toolResult = response.data;

          // Extract text content from the MCP response
          let resultText = "";
          if (
            toolResult &&
            typeof toolResult === "object" &&
            "content" in toolResult
          ) {
            const content = toolResult.content;
            if (Array.isArray(content) && content.length > 0) {
              // Handle content array format (like from your calendar tool)
              resultText = content
                .map((item: any) => item.text || String(item))
                .join("\n");
            } else if (typeof content === "string") {
              resultText = content;
            } else {
              resultText = JSON.stringify(content, null, 2);
            }
          } else if (typeof toolResult === "string") {
            resultText = toolResult;
          } else {
            resultText = JSON.stringify(toolResult, null, 2);
          }

          // Add tool execution record without triggering AI response
          addToolExecutionRecord(command.name, resultText);
        } else {
          console.error("MCP tool execution failed:", response.error);
          // Add error record without triggering AI response
          addToolExecutionRecord(
            command.name,
            "",
            response.error || "Unknown error",
          );
        }
      } catch (error) {
        console.error("Error executing MCP tool:", error);
        // Add error record without triggering AI response
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        addToolExecutionRecord(command.name, "", errorMessage);
      }
    },
    [addToolExecutionRecord],
  );

  // Handle AI chat submission
  const handleAIChatSubmit = useCallback(
    (message: string) => {
      if (!message || message.trim() === "") {
        console.error("Empty message submitted");
        return;
      }

      // Clear input first
      setInputValue("");
      setResults([]);
      setShowContent(true);
      setAppMentions([]); // Clear mentions tracking
      setIsAppMentionMode(false); // Exit app mention mode
      setAppMentionQuery(""); // Clear app mention query
      sendMessage(message);
    },
    [sendMessage],
  );

  // Handle app selection
  const handleAppSelect = useCallback(
    async (appName: string) => {
      // Replace the @query part with the selected app
      const atMatch = inputValue.match(/@\w*$/);
      if (atMatch) {
        const beforeAt = inputValue.substring(
          0,
          inputValue.length - atMatch[0].length,
        );
        const newValue = beforeAt + `@${appName} `;

        // Track the mention position for whole deletion
        const mentionStart = beforeAt.length;
        const mentionEnd = mentionStart + `@${appName}`.length;
        setAppMentions((prev) => [
          ...prev,
          { start: mentionStart, end: mentionEnd, app: appName },
        ]);

        setInputValue(newValue);
      }

      // Close app mention mode after selecting an app
      setIsAppMentionMode(false);
      setAppMentionQuery("");
      // Unblock resize when selecting an app
      blockResizeRef.current = false;

      // Refocus the input to maintain window focus
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);

      // Don't resize back to compact - keep the expanded size for Pro AI interface
      // The window will remain in expanded state to show "Pro AI Cancel ESC"
    },
    [inputValue],
  );

  // Handle key press
  const handleKeyPress = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        // Skip Enter handling if in app mention mode - let AppMentionFullscreen handle it
        if (isAppMentionMode) {
          return;
        }

        if (selectedInputCommand && inputValue.trim()) {
          // Handle input command submission with command result
          handleAIChatSubmit(commandResult);
        } else if (isCommandMode && results.length > 0) {
          handleCommandExecute(results[selectedIndex]);
        } else if (!isCommandMode && inputValue.trim()) {
          handleAIChatSubmit(inputValue.trim());
        }
      } else if (e.key === "ArrowDown") {
        // Skip arrow handling if in app mention mode - let AppMentionFullscreen handle it
        if (isAppMentionMode) {
          return;
        }
        e.preventDefault();
        if (isCommandMode && results.length > 0) {
          setSelectedIndex((prev) => (prev + 1) % results.length);
        }
      } else if (e.key === "ArrowUp") {
        // Skip arrow handling if in app mention mode - let AppMentionFullscreen handle it
        if (isAppMentionMode) {
          return;
        }
        e.preventDefault();
        if (isCommandMode && results.length > 0) {
          setSelectedIndex(
            (prev) => (prev - 1 + results.length) % results.length,
          );
        }
      } else if (e.key === "Backspace") {
        // Handle deletion of app mentions as whole tokens
        const target = e.target as HTMLInputElement;
        const cursorPosition = target.selectionStart || 0;

        // Check if cursor is at the end of an app mention
        for (const mention of appMentions) {
          if (
            cursorPosition === mention.end ||
            cursorPosition === mention.end + 1
          ) {
            // Cursor is right after an app mention, delete the whole mention
            e.preventDefault();
            const newValue =
              inputValue.slice(0, mention.start) +
              inputValue.slice(mention.end);

            // Remove this mention from tracking
            setAppMentions((prev) => prev.filter((m) => m !== mention));
            handleInputChange(newValue);
            return;
          }
        }
      } else if (e.key === "Escape") {
        if (selectedInputCommand) {
          // Exit input change command mode
          setSelectedInputCommand(null);
          setCommandResult("");
          setInputValue("");
          setResults([]);
        } else if (showContent) {
          setShowContent(false);
        } else if (window.electronAPI?.closeWindow) {
          // Use closeWindow which now only hides, never shows
          window.electronAPI.closeWindow();
        }
      }
    },
    [
      selectedInputCommand,
      isCommandMode,
      results,
      selectedIndex,
      inputValue,
      handleCommandExecute,
      handleAIChatSubmit,
      showContent,
      appMentions,
    ],
  );

  // Handle global Cmd+J shortcut
  useEffect(() => {
    const handleGlobalKeydown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "j") {
        e.preventDefault();

        // Only allow if chat has at least one complete conversation (user + assistant)
        if (messages.length >= 2 && !isLoading && currentConversationId) {
          // Pass conversation ID to main window via localStorage
          localStorage.setItem("switchToConversation", currentConversationId);

          // Trigger storage event for same-window detection
          window.dispatchEvent(
            new StorageEvent("storage", {
              key: "switchToConversation",
              newValue: currentConversationId,
              oldValue: null,
            }),
          );

          if (window.electronAPI?.toggleWindow) {
            // Hide current chat window and show main window
            window.electronAPI.toggleWindow("chat"); // Hide chat
            window.electronAPI.toggleWindow("main"); // Show main
          }
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
          // Calculate initial height based on current state
          const selectedContentText = selectedContent?.text || "";
          const hasActiveBadge = !!previousApp;

          const initialHeight = calculateDynamicHeight(
            0, // no results
            false, // no input
            hasActiveBadge,
            false, // no content
            selectedContentText,
          );

          window.electronAPI
            .getCurrentWindowSize(WINDOW_SIZE_PRESETS.CHAT)
            .then((res) => {
              requestAnimationFrame(() => {
                safeResizeWindow(res.width, initialHeight, true);
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
  }, [messages.length, selectedContent, previousApp, calculateDynamicHeight]);

  // Dynamic window resizing based on results and content
  useEffect(() => {
    if (window.electronAPI && !initializing) {
      // Special handling for app mention mode
      if (isAppMentionMode) {
        // Use a fixed large height for app mention mode to allow free scrolling
        const hasActiveBadge = !!previousApp;
        const selectedContentText = selectedContent?.text || "";

        // Calculate base height (input + selected content + padding)
        let baseHeight = hasActiveBadge ? 98 : 78;
        const selectedContentHeight =
          calculateSelectedContentHeight(selectedContentText);
        baseHeight += selectedContentHeight;

        // Add a fixed large content area for scrollable app list (similar to command content mode)
        const appMentionHeight = baseHeight + 400; // Large fixed height for scrollable content

        window.electronAPI
          .getCurrentWindowSize(WINDOW_SIZE_PRESETS.CHAT)
          .then((currentSize) => {
            // Allow this resize for @ mode expansion
            window.electronAPI.resizeWindow(
              currentSize.width,
              appMentionHeight,
              true,
            );
            // After resize, block further resizes to prevent truncation
            setTimeout(() => {
              blockResizeRef.current = true;
            }, 100);
          });
        return;
      }

      const hasInput = inputValue.trim().length > 0;
      const resultCount = isCommandMode ? results.length : hasInput ? 1 : 0;
      const hasActiveBadge = !!previousApp;
      const selectedContentText = selectedContent?.text || "";

      const newHeight = calculateDynamicHeight(
        resultCount,
        hasInput,
        hasActiveBadge,
        showContent,
        selectedContentText,
      );

      // Get current window size to preserve width
      window.electronAPI
        .getCurrentWindowSize(WINDOW_SIZE_PRESETS.CHAT)
        .then((currentSize) => {
          // Only resize if height changed significantly (> 10px difference)
          if (Math.abs(currentSize.height - newHeight) > 10) {
            safeResizeWindow(currentSize.width, newHeight, true);
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
    isAppMentionMode,
    initializing,
    previousApp,
    showContent,
    selectedContent,
    calculateDynamicHeight,
  ]);

  useEffect(() => {
    let mounted = true;

    if (window.electronAPI?.onSetInputContent) {
      const unsubscribe = window.electronAPI.onSetInputContent(
        (content: { text?: string }) => {
          if (!mounted) return;

          if (content.text && content.text.trim()) {
            const selectedContent = createSelectedContent({
              text: content.text,
            });

            setSelectedContent(selectedContent);
          } else {
            setSelectedContent(null);
          }

          // Trigger window resize after selected content changes
          if (!initializing) {
            const hasInput = inputValue.trim().length > 0;
            const resultCount = isCommandMode
              ? results.length
              : hasInput
                ? 1
                : 0;
            const hasActiveBadge = !!previousApp;
            const selectedContentText = content.text || "";

            const newHeight = calculateDynamicHeight(
              resultCount,
              hasInput,
              hasActiveBadge,
              showContent,
              selectedContentText,
            );

            window.electronAPI
              .getCurrentWindowSize(WINDOW_SIZE_PRESETS.CHAT)
              .then((currentSize) => {
                if (Math.abs(currentSize.height - newHeight) > 10) {
                  safeResizeWindow(currentSize.width, newHeight, true);
                }
              })
              .catch((error) => {
                console.error(
                  "Failed to resize on selected content change:",
                  error,
                );
              });
          }
        },
      );

      return () => {
        mounted = false;
        unsubscribe?.();
      };
    }
  }, [
    setSelectedContent,
    createSelectedContent,
    initializing,
    inputValue,
    isCommandMode,
    results.length,
    previousApp,
    calculateDynamicHeight,
    showContent,
  ]);

  useEffect(() => {
    if (typeof window !== "undefined" && window.electronAPI) {
      const removeListener = window.electronAPI.onFocusChatInput(() => {
        // Don't reset if we're in app mention mode - let user continue selecting apps
        if (isAppMentionMode) {
          return;
        }

        // Reset chat state when window is activated by shortcut
        resetChat();
        setInputValue("");
        setResults([]);
        setIsCommandMode(false);
        setIsAppMentionMode(false);
        setAppMentionQuery("");
        setSelectedIndex(0);
        setShowContent(false);
        setSelectedInputCommand(null);
        setCommandResult("");
        setAppMentions([]); // Clear mentions tracking on reset
        blockResizeRef.current = false; // Clear resize blocking on reset

        // Focus the input after reset
        setTimeout(() => {
          inputRef.current?.focus();
        }, 50);
      });

      return () => {
        removeListener?.();
      };
    }
  }, [resetChat, isAppMentionMode]);

  // Prevent @ mention mode from closing on window blur
  useEffect(() => {
    if (!isAppMentionMode) return;

    const handleWindowBlur = () => {
      // Don't do anything - keep the @ mention mode open
    };

    const handleWindowFocus = () => {
      // Refocus input when window regains focus
      if (isAppMentionMode) {
        setTimeout(() => {
          inputRef.current?.focus();
        }, 50);
      }
    };

    window.addEventListener("blur", handleWindowBlur);
    window.addEventListener("focus", handleWindowFocus);

    return () => {
      window.removeEventListener("blur", handleWindowBlur);
      window.removeEventListener("focus", handleWindowFocus);
    };
  }, [isAppMentionMode]);

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
    <div className="flex flex-col h-full w-full relative px-2 py-2 ">
      {/* Input always at top */}
      <div className={`${showContent ? "relative z-20" : ""}`}>
        <CommandInput
          ref={inputRef}
          value={inputValue}
          onChange={handleInputChange}
          onKeyPress={handleKeyPress}
          isCommandMode={isCommandMode}
          disabled={isLoading}
          selectedCommand={selectedInputCommand}
          placeholder={
            selectedInputCommand
              ? `Enter text for ${selectedInputCommand.name}...`
              : isCommandMode
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
        !isLoading &&
        !isAppMentionMode && (
          <div className="flex-1 ">
            <CommandResults
              results={results}
              query={inputValue}
              isCommandMode={isCommandMode}
              selectedIndex={selectedIndex}
              selectedInputCommand={selectedInputCommand}
              commandResult={commandResult}
              onCommandExecute={handleCommandExecute}
              onAIChatSubmit={handleAIChatSubmit}
              onSelectedIndexChange={setSelectedIndex}
            />
          </div>
        )}

      {/* App Mention Fullscreen - show when in app mention mode */}
      {isAppMentionMode && !isLoading && (
        <AppMentionFullscreen
          isOpen={isAppMentionMode}
          onClose={() => {
            setIsAppMentionMode(false);
            setAppMentionQuery("");
          }}
          onSelect={handleAppSelect}
          searchQuery={appMentionQuery}
        />
      )}

      {/* Content overlay - covers everything below input when visible */}
      {showContent && !isAppMentionMode && (
        <div className="absolute inset-0 mt-24 ">
          <CommandContent isVisible={showContent} />
        </div>
      )}
    </div>
  );
}
