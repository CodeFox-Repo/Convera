import { AgentInfo } from "@/renderer/libs/hooks/use-agent-selection";
import { usePreviousApp } from "@/renderer/libs/hooks/use-previous-app";
import {
  Bot,
  History,
  LucideIcon,
  Mic,
  Monitor,
  RotateCcw,
  Send,
  Settings,
  Square,
} from "lucide-react";
import React from "react";
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
  selectedAgent?: AgentInfo | null;
  onAgentButtonClick: (
    e: React.MouseEvent<HTMLButtonElement>,
    agent: AgentInfo | null | undefined,
  ) => void;
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
      previousApp: ReturnType<typeof usePreviousApp>['previousApp'], 
      formatAppName: ReturnType<typeof usePreviousApp>['formatAppName'] 
    }
  ) => React.ReactNode;
  show: boolean | ((
    props: ChatInputButtonsProps,
    hookData: { previousApp: ReturnType<typeof usePreviousApp>['previousApp'] }
  ) => boolean);
}

export function ChatInputButtons(props: ChatInputButtonsProps) {
  const { 
    onReset, 
    onOpenSettings, 
    triggerHistoryWindow,
  } = props;
  
  const { previousApp, formatAppName } = usePreviousApp();
  const hookData = { previousApp, formatAppName };

  const leftActionButtons: ActionButtonConfig[] = [
    {
      id: "reset",
      onClick: onReset,
      title: "Reset chat",
      Icon: RotateCcw,
      show: !!onReset,
      iconSize: 16,
    },
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
      render: (p) => (
        <button
          className={`no-drag-region flex items-center ${
            p.selectedAgent
              ? "bg-primary/20 text-primary hover:bg-primary/30 rounded px-2 py-0.5 text-xs font-medium"
              : "text-foreground/70 hover:text-foreground"
          }`}
          onClick={(e) => p.onAgentButtonClick(e, p.selectedAgent)}
        >
          <Bot
            size={p.selectedAgent ? 12 : 16}
            className={p.selectedAgent ? "mr-1" : ""}
          />
          {p.selectedAgent && p.selectedAgent.name}
        </button>
      ),
      show: true,
    },
    {
      id: "model-selector",
      render: (p) => (
        <div className="no-drag-region inline-flex items-center">
          <ModelSelector
            selectedModel={p.selectedModelId!}
            onSelectModel={p.onModelSelect!}
          />
        </div>
      ),
      show: (p) => !!(p.selectedModelId && p.onModelSelect),
    },
    {
      id: "previous-app-badge",
      render: (_p, hData) => (
        <div className="no-drag-region bg-primary/20 text-black/40 dark:text-white flex items-center rounded px-2 py-0.5 text-xs font-medium">
          <Monitor size={12} className="mr-1" />
          {hData.formatAppName(hData.previousApp!)}
        </div>
      ),
      show: (_p, hData) => !!hData.previousApp,
    },
  ];

  const defaultButtonClassName = "no-drag-region text-foreground/70 hover:text-foreground";

  return (
    <div className="ml-2 drag-region flex min-h-[30px] items-center justify-between">
      {/* Left icons and elements */}
      <div className="flex flex-1 items-center space-x-4">
        {leftActionButtons.map((config) => {
          const isVisible = typeof config.show === 'function' 
            ? config.show(props, hookData) 
            : config.show;

          if (!isVisible) {
            return null;
          }

          if (config.render) {
            return <React.Fragment key={config.id}>{config.render(props, hookData)}</React.Fragment>;
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
      <div className="flex shrink-0 items-center">
        <button
          onClick={props.onVoiceInput}
          className="no-drag-region text-foreground/70 hover:bg-foreground/10 hover:text-foreground active:bg-foreground/20 mr-3 rounded-full p-1.5"
        >
          <Mic size={16} />
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
            <Send size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
