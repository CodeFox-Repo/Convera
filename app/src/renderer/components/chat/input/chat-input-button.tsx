import { WINDOW_SIZE_PRESETS } from "@/electron/windows/window-size";
import { usePreviousApp } from "@/renderer/libs/hooks/use-previous-app";
import { useAgentStore } from "@/renderer/libs/stores/agent-store";
import { useChatContext } from "@/renderer/libs/stores/chat-store";
import { useSettingsStore } from "@/renderer/libs/stores/settings-store";
import { useLocation, useRouter } from "@tanstack/react-router";
import {
  Bot,
  History,
  LayoutDashboard,
  LucideIcon,
  Mic,
  MicOff,
  Monitor,
  Send,
  Settings,
  Square,
} from "lucide-react";
import React, { useEffect } from "react";
import ModelSelector from "../popover/model-selector-popover";

// TODO(Sma1lboy): clear selectModel and onModelSelect from props, it will passing from model-store
interface ChatInputButtonsProps {
  onReset?: () => void;
  onOpenSettings?: () => void;
  onVoiceInput?: () => void;
  onStopGeneration?: () => void;
  onSendMessage?: () => void;
  triggerHistoryWindow: () => void;
  isLoading: boolean;
  hasContent: boolean;
  selectedModelId?: string;
  onModelSelect?: (modelId: string) => void;
}

interface ActionButtonConfig {
  id: string;
  Icon?: LucideIcon;
  iconSize?: number;
  title?: string;
  onClick?: (e?: React.MouseEvent<HTMLButtonElement>) => void;
  className?: string;
  render?: (
    props: ChatInputButtonsProps,
    hookData: {
      previousApp: ReturnType<typeof usePreviousApp>["previousApp"];
      formatAppName: ReturnType<typeof usePreviousApp>["formatAppName"];
    },
  ) => React.ReactNode;
  show:
    | boolean
    | ((
        props: ChatInputButtonsProps,
        hookData: {
          previousApp: ReturnType<typeof usePreviousApp>["previousApp"];
        },
      ) => boolean);
}

export function ChatInputButtons(props: ChatInputButtonsProps) {
  const { onOpenSettings, triggerHistoryWindow } = props;

  const { previousApp, formatAppName } = usePreviousApp();
  const hookData = { previousApp, formatAppName };
  const { selectedAgent, triggerAgentSelect, subscribeToAgentChanges } =
    useAgentStore();

  // Get speech state from chat context
  const { speechState, handleVoiceInput } = useChatContext();

  // Get experimental features setting
  const enableMainWindow = useSettingsStore(
    (state) => state.experimentalFeatures.enableMainWindow,
  );

  // Router for navigation
  const router = useRouter();
  const location = useLocation();

  useEffect(() => {
    const unsubscribe = subscribeToAgentChanges();
    return unsubscribe;
  }, []);

  // Handle main window toggle
  const handleMainWindowToggle = async () => {
    // Get current window position before switching
    const getCurrentPosition = async () => {
      try {
        return await window.electronAPI.getCurrentWindowPosition();
      } catch (error) {
        console.error("Failed to get current window position:", error);
        return { x: 0, y: 0 };
      }
    };

    // If we're on the main page (/), go to chat
    // If we're on chat page (/chat), go to main page
    if (location.pathname === "/") {
      // Save current position before switching to chat
      const currentPos = await getCurrentPosition();

      // Navigate to chat page with position info
      router.navigate({
        to: "/chat",
        search: {
          fromX: currentPos.x.toString(),
          fromY: currentPos.y.toString(),
        },
      });

      // Resize and center window for chat page (smaller, focused)
      try {
        const chatSize = await window.electronAPI.getCurrentWindowSize(
          WINDOW_SIZE_PRESETS.CHAT_PAGE,
        );
        // Resize and center in one smooth operation
        window.electronAPI.resizeAndCenterWindow(
          chatSize.width,
          chatSize.height,
        );
      } catch (error) {
        console.error("Failed to resize window for chat:", error);
      }
    } else if (location.pathname === "/chat") {
      // Get the saved position from URL params
      const urlParams = new URLSearchParams(window.location.search);
      const savedX = parseInt(urlParams.get("fromX") || "0");
      const savedY = parseInt(urlParams.get("fromY") || "0");

      // Navigate back to main page (pass the position info forward for future use)
      router.navigate({
        to: "/",
        search:
          savedX > 0 || savedY > 0
            ? {
                lastX: savedX.toString(),
                lastY: savedY.toString(),
              }
            : undefined,
      });

      // Resize window for home page
      try {
        const homeSize = await window.electronAPI.getCurrentWindowSize(
          WINDOW_SIZE_PRESETS.SETTINGS,
        );

        // If we have reasonable saved position, try to preserve X position
        // Otherwise, resize and center for better UX
        if (savedX > 100 && savedY > 100) {
          // Only preserve position if it seems reasonable (not at screen edge)
          window.electronAPI.resizeWindow(
            homeSize.width,
            homeSize.height,
            true,
          );
        } else {
          // No good saved position, resize and center for better UX
          window.electronAPI.resizeAndCenterWindow(
            homeSize.width,
            homeSize.height,
          );
        }
      } catch (error) {
        console.error("Failed to resize window for home:", error);
      }
    } else {
      // Default: go to main page and center
      router.navigate({ to: "/" });

      try {
        const homeSize = await window.electronAPI.getCurrentWindowSize(
          WINDOW_SIZE_PRESETS.SETTINGS,
        );
        // Resize and center in one smooth operation
        window.electronAPI.resizeAndCenterWindow(
          homeSize.width,
          homeSize.height,
        );
      } catch (error) {
        console.error("Failed to resize window for home:", error);
      }
    }
  };

  const leftActionButtons: ActionButtonConfig[] = [
    {
      id: "history",
      onClick: triggerHistoryWindow,
      title: "View chat history",
      Icon: History,
      show: true,
      iconSize: 16,
    },
    {
      id: "main-window",
      onClick: handleMainWindowToggle,
      title: location.pathname === "/" ? "Go to chat" : "Go to main",
      Icon: LayoutDashboard,
      show: enableMainWindow,
      iconSize: 16,
    },
    {
      id: "settings",
      onClick: onOpenSettings,
      title: "Open settings",
      Icon: Settings,
      show: !!onOpenSettings,
      iconSize: 16,
    },
    {
      id: "agent-selector",
      render: () => (
        <button
          className={`no-drag-region flex items-center ${
            selectedAgent &&
            selectedAgent.id !== "DefaultAssistant" &&
            selectedAgent.name !== "Default Assistant"
              ? "bg-primary/20 text-primary hover:bg-primary/30 rounded px-2 py-0.5 text-xs font-medium"
              : "text-foreground/70 hover:text-foreground"
          }`}
          onClick={(e) => {
            triggerAgentSelect(e, selectedAgent);
          }}
        >
          {/* Always show Bot icon */}
          <Bot
            size={
              selectedAgent &&
              selectedAgent.id !== "DefaultAssistant" &&
              selectedAgent.name !== "Default Assistant"
                ? 12
                : 16
            }
            className={
              selectedAgent &&
              selectedAgent.id !== "DefaultAssistant" &&
              selectedAgent.name !== "Default Assistant"
                ? "mr-1"
                : ""
            }
          />
          {/* Only show agent name if it's not Default Assistant */}
          {selectedAgent &&
            selectedAgent.id !== "DefaultAssistant" &&
            selectedAgent.name !== "Default Assistant" &&
            selectedAgent.name}
        </button>
      ),
      show: true,
    },
  ];

  const defaultButtonClassName =
    "no-drag-region text-foreground/70 hover:text-foreground";

  // Determine mic button state and styling
  const getMicButtonProps = () => {
    if (speechState.isRecording) {
      return {
        Icon: MicOff,
        className:
          "no-drag-region bg-red-500/20 text-red-500 hover:bg-red-500/30 hover:text-red-600 active:bg-red-500/40 mr-3 rounded-full p-1.5 animate-pulse",
        title: "Stop recording (click to stop and transcribe)",
      };
    } else {
      return {
        Icon: Mic,
        className:
          "no-drag-region text-foreground/70 hover:bg-foreground/10 hover:text-foreground active:bg-foreground/20 mr-3 rounded-full p-1.5",
        title: "Start voice input (speech-to-text)",
      };
    }
  };

  const micButtonProps = getMicButtonProps();

  return (
    <div className="ml-2 drag-region flex min-h-[30px] items-center justify-between">
      {/* Left icons and elements */}
      <div className="flex flex-1 items-center space-x-2">
        {leftActionButtons.map((config) => {
          const isVisible =
            typeof config.show === "function"
              ? config.show(props, hookData)
              : config.show;

          if (!isVisible) {
            return null;
          }

          if (config.render) {
            return (
              <React.Fragment key={config.id}>
                {config.render(props, hookData)}
              </React.Fragment>
            );
          }

          return (
            <button
              key={config.id}
              onClick={config.onClick}
              className={config.className || defaultButtonClassName}
              title={config.title}
            >
              {config.Icon && <config.Icon size={config.iconSize || 16} />}
            </button>
          );
        })}

        <ModelSelector />
        {/* previous app - only show when there's a valid previous app */}
        {previousApp && formatAppName(previousApp) && (
          <div className="no-drag-region bg-primary/20 text-black/40 dark:text-white flex items-center rounded px-2 py-0.5 text-xs font-medium">
            <Monitor size={12} className="mr-1" />
            {formatAppName(previousApp)}
          </div>
        )}
      </div>

      {/* Right side - Mic and Send buttons */}
      <div className="flex shrink-0 items-center mr-2">
        {/* Enhanced Mic Button with Speech State */}
        <button
          onClick={handleVoiceInput}
          className={micButtonProps.className}
          title={micButtonProps.title}
        >
          <micButtonProps.Icon size={16} />
        </button>

        {props.isLoading && props.onStopGeneration ? (
          <button
            onClick={props.onStopGeneration}
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
            onClick={props.onSendMessage}
            disabled={props.isLoading || !props.hasContent}
            className={`no-drag-region ${
              !props.hasContent || props.isLoading
                ? "text-foreground/30 cursor-not-allowed"
                : "text-foreground hover:text-primary"
            }`}
            aria-label="Send message"
          >
            <Send size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
