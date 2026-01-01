import { useAgentStore } from "@/renderer/libs/stores/agent-store";
import {
  Bot,
  History,
  LucideIcon,
  Mic,
  MicOff,
  Send,
  Settings,
  Square,
} from "lucide-react";
import React, { useEffect } from "react";
import ModelSelector from "../popover/model-selector-popover";

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
  isRecording?: boolean;
}

interface ActionButtonConfig {
  id: string;
  Icon?: LucideIcon;
  iconSize?: number;
  title?: string;
  onClick?: (e?: React.MouseEvent<HTMLButtonElement>) => void;
  className?: string;
  render?: (props: ChatInputButtonsProps) => React.ReactNode;
  show: boolean | ((props: ChatInputButtonsProps) => boolean);
}

export function ChatInputButtons(props: ChatInputButtonsProps) {
  const { onOpenSettings, triggerHistoryWindow, onVoiceInput, isRecording } =
    props;

  const { selectedAgent, triggerAgentSelect, subscribeToAgentChanges } =
    useAgentStore();

  useEffect(() => {
    const unsubscribe = subscribeToAgentChanges();
    return unsubscribe;
  }, [subscribeToAgentChanges]);

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
    {
      id: "model-selector",
      render: () => <ModelSelector />,
      show: true,
    },
  ];

  const defaultButtonClassName =
    "no-drag-region text-foreground/70 hover:text-foreground";

  // Determine mic button state and styling
  const getMicButtonProps = () => {
    if (isRecording) {
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
              ? config.show(props)
              : config.show;

          if (!isVisible) {
            return null;
          }

          if (config.render) {
            return (
              <React.Fragment key={config.id}>
                {config.render(props)}
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
      </div>

      {/* Right side - Mic and Send buttons */}
      <div className="flex shrink-0 items-center mr-2">
        {/* Enhanced Mic Button with Speech State */}
        <button
          onClick={onVoiceInput}
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
